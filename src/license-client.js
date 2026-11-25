'use strict';

/**
 * Cliente de verificación de licencias (solo proceso principal de Electron).
 *
 * Consulta el Cloudflare Worker `licensing-api` para obtener un token firmado
 * con Ed25519 de vida corta (24 h) vinculado al `profileId` y al hash anónimo
 * de la máquina. Verifica la firma localmente mediante `src/product.js`:
 *   - Si el administrador desactiva la cuenta, el servidor devuelve `revoked: true`
 *     y el cliente retira el acceso al instante.
 *   - Sin red temporal, el token firmado sigue siendo válido solo hasta su `exp`
 *     criptográfico (nunca se acepta un flag local no firmado).
 */

const crypto = require('node:crypto');
const os = require('node:os');
const { execFile, execFileSync } = require('node:child_process');
const { verifyEntitlement } = require('./product');

const DEFAULT_API_URL = 'https://aoe2-helper-licensing.aoe2helper-api.workers.dev';
const CHECK_TIMEOUT_MS = 7000;
const OAUTH_EXCHANGE_TIMEOUT_MS = 20000;
const MACHINE_SALT = 'aoe2-helper-machine-v1:';
const HW_SALT = 'relic-hw-v1:';
const OS_SALT = 'relic-os-v1:';

// Claves públicas Ed25519 de producción (seguro incluirlas en el cliente;
// la clave privada vive únicamente en Cloudflare Workers Secrets).
const RELEASE_PUBLIC_KEYS = Object.freeze({
  'prod-2026-01': '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAhLSwWYjc/3usRFveaFNY+HNgql6Bht3lQj7ca/1YYdI=\n-----END PUBLIC KEY-----',
});

const OEM_PLACEHOLDER_PATTERNS = [
  /^0+$/,
  /^f+$/i,
  /^0{8}-0{4}-0{4}-0{4}-0{12}$/,
  /^f{8}-f{4}-f{4}-f{4}-f{12}$/i,
  /^default(\s+string)?$/i,
  /^to\s+be\s+filled/i,
  /^system\s+(serial|product|manufacturer)/i,
  /^not\s+(specified|applicable|available)/i,
  /^(none|n\/a|na|unknown|invalid|oem|chassis|standard|1234567890?)$/i,
];

const VM_BIOS_PATTERNS = [
  /vmware/i,
  /virtualbox/i,
  /innotek/i,
  /\bqemu\b/i,
  /\bbochs\b/i,
  /parallels/i,
  /\bxen\b/i,
  /\bkvm\b/i,
  /\bbhyve\b/i,
  /virtual\s+machine/i,
  /microsoft\s+corporation.*virtual/i,
];

let cachedMachineHash = null;
let cachedHardwareProfile = null;
let hwInitPromise = null;

function sanitizeHwToken(raw) {
  const s = String(raw || '').trim().replace(/^\{|\}$/g, '').trim();
  if (!s || s.length < 4) return '';
  const low = s.toLowerCase();
  if (OEM_PLACEHOLDER_PATTERNS.some((re) => re.test(low))) return '';
  return s.toUpperCase();
}

function queryRegValueSync(keyPath, valueName) {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', ['query', keyPath, '/v', valueName], {
      encoding: 'utf8',
      timeout: 1200,
      windowsHide: true,
    });
    const re = new RegExp(`${valueName}\\s+REG_\\w+\\s+(.+)`, 'i');
    const m = re.exec(out);
    return m ? m[1].trim() : '';
  } catch (_) {
    return '';
  }
}

function detectVmFromBiosStrings(biosStrings = []) {
  const joined = biosStrings.filter(Boolean).join(' | ');
  if (!joined) return { isVm: false, vmReason: null };
  for (const re of VM_BIOS_PATTERNS) {
    if (re.test(joined)) {
      return { isVm: true, vmReason: `bios:${re.source}` };
    }
  }
  return { isVm: false, vmReason: null };
}

function buildSyncHardwareProfile() {
  const machineHash = getMachineHash();
  const regLastConfig = sanitizeHwToken(queryRegValueSync('HKLM\\SYSTEM\\HardwareConfig', 'LastConfig'));
  const regMachineGuid = sanitizeHwToken(queryRegValueSync('HKLM\\SOFTWARE\\Microsoft\\Cryptography', 'MachineGuid'));
  const regSqmId = sanitizeHwToken(queryRegValueSync('HKLM\\SOFTWARE\\Microsoft\\SQMClient', 'MachineId'));
  const regHwProfile = sanitizeHwToken(
    queryRegValueSync('HKLM\\SYSTEM\\CurrentControlSet\\Control\\IDConfigDB\\Hardware Profiles\\0001', 'HwProfileGuid')
  );
  const biosStrings = [
    queryRegValueSync('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'SystemManufacturer'),
    queryRegValueSync('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'SystemProductName'),
    queryRegValueSync('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'BaseBoardManufacturer'),
    queryRegValueSync('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'BaseBoardProduct'),
    queryRegValueSync('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'BIOSVendor'),
  ].filter(Boolean);
  const vm = detectVmFromBiosStrings(biosStrings);

  const osTokens = [regMachineGuid, regSqmId, regHwProfile].filter(Boolean);
  const osInstallHash = crypto
    .createHash('sha256')
    .update(`${OS_SALT}${osTokens.length ? osTokens.join('|') : `${os.platform()}|${os.arch()}|${os.hostname()}`}`)
    .digest('hex');

  const hwTokens = [regLastConfig].filter(Boolean);
  const hwHash = crypto
    .createHash('sha256')
    .update(`${HW_SALT}${hwTokens.length ? hwTokens.join('|') : `fallback:${osInstallHash}`}`)
    .digest('hex');

  return {
    machineHash,
    hwHash,
    osInstallHash,
    hwStrength: hwTokens.length ? 'full' : 'degraded',
    isVm: vm.isVm,
    vmReason: vm.vmReason,
    _regLastConfig: regLastConfig,
    _biosStrings: biosStrings,
    _cimReady: false,
  };
}

function queryWindowsCimAsync() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const psScript = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$u=(Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1 -ExpandProperty UUID)",
    "$b=(Get-CimInstance Win32_BaseBoard | Select-Object -First 1 -ExpandProperty SerialNumber)",
    "$d=(Get-Partition -DriveLetter C | Get-Disk | Select-Object -First 1 -ExpandProperty SerialNumber)",
    "$m=(Get-CimInstance Win32_ComputerSystem | Select-Object -First 1)",
    "@{uuid=$u;board=$b;disk=$d;mfg=$m.Manufacturer;model=$m.Model} | ConvertTo-Json -Compress",
  ].join('; ');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { encoding: 'utf8', timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const parsed = JSON.parse(String(stdout).trim());
          resolve(parsed && typeof parsed === 'object' ? parsed : null);
        } catch (_) {
          resolve(null);
        }
      }
    );
  });
}

function getHardwareProfile() {
  if (!cachedHardwareProfile) {
    cachedHardwareProfile = buildSyncHardwareProfile();
  }
  return {
    machineHash: cachedHardwareProfile.machineHash,
    hwHash: cachedHardwareProfile.hwHash,
    osInstallHash: cachedHardwareProfile.osInstallHash,
    hwStrength: cachedHardwareProfile.hwStrength,
    isVm: Boolean(cachedHardwareProfile.isVm),
    vmReason: cachedHardwareProfile.vmReason || null,
  };
}

async function initHardwareProfile() {
  if (cachedHardwareProfile && cachedHardwareProfile._cimReady) {
    return getHardwareProfile();
  }
  if (!hwInitPromise) {
    hwInitPromise = (async () => {
      const base = cachedHardwareProfile || buildSyncHardwareProfile();
      cachedHardwareProfile = base;
      const cim = await queryWindowsCimAsync();
      if (cim) {
        const smbiosUuid = sanitizeHwToken(cim.uuid) || base._regLastConfig || '';
        const boardSerial = sanitizeHwToken(cim.board);
        const diskSerial = sanitizeHwToken(cim.disk);
        const hwParts = [smbiosUuid, boardSerial, diskSerial].filter(Boolean);
        if (hwParts.length > 0) {
          base.hwHash = crypto.createHash('sha256').update(`${HW_SALT}${hwParts.join('|')}`).digest('hex');
          base.hwStrength = 'full';
        }
        const vm = detectVmFromBiosStrings([...(base._biosStrings || []), cim.mfg, cim.model]);
        if (vm.isVm) {
          base.isVm = true;
          base.vmReason = vm.vmReason;
        }
      }
      base._cimReady = true;
      return getHardwareProfile();
    })().catch(() => getHardwareProfile());
  }
  return hwInitPromise;
}

function getWindowsMachineGuid() {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf8', timeout: 1500, windowsHide: true }
    );
    const match = /MachineGuid\s+REG_SZ\s+([A-Za-z0-9-]+)/i.exec(out);
    return match ? match[1].trim() : '';
  } catch (_) {
    return '';
  }
}

function getMachineHash() {
  if (cachedMachineHash) return cachedMachineHash;
  const parts = [
    MACHINE_SALT,
    os.platform(),
    os.arch(),
    os.hostname(),
    getWindowsMachineGuid(),
  ].filter(Boolean);
  cachedMachineHash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return cachedMachineHash;
}

function validateApiUrl(raw, { allowLocalHttp = false } = {}) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    const isLocalDev = allowLocalHttp === true && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
    if (u.protocol !== 'https:' && !isLocalDev) return null;
    if (u.username || u.password) return null;
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch (_) {
    return null;
  }
}

function getDeviceInfo() {
  const host = String(os.hostname() || '').trim().slice(0, 80);
  const osInfo = `${os.platform()} ${os.release()} (${os.arch()})`.slice(0, 60);
  const hw = getHardwareProfile();
  return {
    machineHash: hw.machineHash,
    hwHash: hw.hwHash,
    osInstallHash: hw.osInstallHash,
    hwStrength: hw.hwStrength,
    isVm: hw.isVm,
    deviceName: host || `PC-${hw.machineHash.slice(0, 6).toUpperCase()}`,
    osInfo,
  };
}

const DEFAULT_GOOGLE_CLIENT_ID = '51621160371-isuaulmuvdkf224dpsqph51qse6uv4oa.apps.googleusercontent.com';

function buildGoogleDesktopAuthUrl({ clientId = DEFAULT_GOOGLE_CLIENT_ID, port, state } = {}) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId || DEFAULT_GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/auth/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

async function exchangeGoogleCode({
  apiUrl = DEFAULT_API_URL,
  code,
  redirectUri,
  profileId = null,
  alias = '',
  appVersion = '0.0.0',
  allLocalPlatformIdHashes = [],
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = validateApiUrl(apiUrl);
  if (!base) return { ok: false, error: 'Servicio no configurado.' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Sin conexión disponible.' };
  const dev = getDeviceInfo();
  const rawPid = profileId != null ? Number(profileId) : null;
  const pid = Number.isSafeInteger(rawPid) && rawPid > 0 ? rawPid : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OAUTH_EXCHANGE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}/v1/auth/google/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        code: String(code || '').trim(),
        redirectUri: String(redirectUri || '').trim(),
        machineHash: dev.machineHash,
        hwHash: dev.hwHash,
        osInstallHash: dev.osInstallHash,
        isVm: dev.isVm,
        allLocalPlatformIdHashes: Array.isArray(allLocalPlatformIdHashes) ? allLocalPlatformIdHashes.slice(0, 20) : [],
        deviceName: dev.deviceName,
        osInfo: dev.osInfo,
        appVersion: String(appVersion || '0.0.0').slice(0, 32),
        profileId: pid,
        alias: String(alias || '').trim().slice(0, 80),
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const msg = data.error === 'google-token-exchange-failed'
        ? 'Google rechazó la validación temporal. Volvé a tocar «Continuar con Google».'
        : (data.message || data.error || `Error del servidor (HTTP ${res.status})`);
      return { ok: false, error: msg };
    }
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'Tiempo de espera agotado al validar con Google.' : 'No se pudo conectar con el servidor.' };
  } finally {
    clearTimeout(timer);
  }
}

function buildGoogleAuthStartUrl({
  apiUrl = DEFAULT_API_URL,
  port,
  profileId = null,
  alias = '',
  appVersion = '0.0.0',
} = {}) {
  const base = validateApiUrl(apiUrl);
  if (!base) return null;
  const dev = getDeviceInfo();
  const url = new URL(`${base}/v1/auth/google/start`);
  url.searchParams.set('port', String(port));
  url.searchParams.set('machineHash', dev.machineHash);
  if (dev.hwHash) url.searchParams.set('hwHash', dev.hwHash);
  if (dev.osInstallHash) url.searchParams.set('osInstallHash', dev.osInstallHash);
  url.searchParams.set('deviceName', dev.deviceName);
  url.searchParams.set('osInfo', dev.osInfo);
  url.searchParams.set('appVersion', String(appVersion || '0.0.0').slice(0, 32));
  if (Number.isSafeInteger(Number(profileId)) && Number(profileId) > 0) {
    url.searchParams.set('profileId', String(Number(profileId)));
  }
  if (alias) url.searchParams.set('alias', String(alias).trim().slice(0, 80));
  return url.toString();
}

async function checkRemoteEntitlement({
  apiUrl = DEFAULT_API_URL,
  profileId = null,
  alias = '',
  appVersion = '0.0.0',
  sessionToken = null,
  allLocalPlatformIdHashes = [],
  publicKeys = RELEASE_PUBLIC_KEYS,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const base = validateApiUrl(apiUrl);
  if (!base) {
    return { status: 'unconfigured', active: false, revoked: false, token: null, accountId: null, reason: 'api-not-configured' };
  }
  const rawPid = profileId != null ? Number(profileId) : null;
  const pid = Number.isSafeInteger(rawPid) && rawPid > 0 ? rawPid : null;
  if (typeof fetchImpl !== 'function') {
    return { status: 'error', active: false, revoked: false, token: null, accountId: null, reason: 'fetch-unavailable' };
  }

  const dev = getDeviceInfo();
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (sessionToken && typeof sessionToken === 'string') {
    headers.authorization = `Bearer ${sessionToken.trim()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}/v1/entitlement/check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        profileId: pid,
        alias: String(alias || '').trim().slice(0, 80),
        machineHash: dev.machineHash,
        hwHash: dev.hwHash,
        osInstallHash: dev.osInstallHash,
        isVm: dev.isVm,
        allLocalPlatformIdHashes: Array.isArray(allLocalPlatformIdHashes) ? allLocalPlatformIdHashes.slice(0, 20) : [],
        deviceName: dev.deviceName,
        osInfo: dev.osInfo,
        appVersion: String(appVersion || '0.0.0').slice(0, 32),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { status: 'http-error', httpStatus: res.status, active: false, revoked: false, token: null, accountId: null, reason: `http-${res.status}` };
    }
    const data = await res.json();
    if (data.revoked === true || data.active !== true || !data.token) {
      return {
        status: data.revoked ? 'revoked' : 'free',
        active: false,
        revoked: Boolean(data.revoked),
        paywallEnabled: data.paywallEnabled !== false,
        token: null,
        accountId: data.accountId || null,
        reason: data.reason || (data.revoked ? 'disabled-by-admin' : 'free-plan'),
      };
    }

    const accountId = typeof data.accountId === 'string' && data.accountId
      ? data.accountId
      : (pid ? `aoe2:${pid}` : `pc:${getMachineHash().slice(0, 16)}`);
    const verifyOpts = { publicKeys, accountId, machineHash: dev.machineHash, now };
    if (pid) verifyOpts.profileId = pid;
    const verified = verifyEntitlement(data.token, verifyOpts);
    if (!verified.valid) {
      return {
        status: 'invalid-signature',
        active: false,
        revoked: false,
        token: null,
        accountId,
        reason: verified.reason || 'invalid-signature',
      };
    }
    return {
      status: 'verified',
      active: true,
      revoked: false,
      paywallEnabled: data.paywallEnabled !== false,
      plan: verified.plan,
      token: data.token,
      accountId: verified.accountId,
      expiresAt: verified.expiresAt,
      reason: null,
    };
  } catch (err) {
    return {
      status: 'network-error',
      active: false,
      revoked: false,
      token: null,
      accountId: null,
      reason: err?.name === 'AbortError' ? 'timeout' : 'network-error',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function submitRemoteFeedback({
  apiUrl = DEFAULT_API_URL,
  category = 'suggestion',
  message = '',
  contact = '',
  profileId = null,
  alias = '',
  plan = 'free',
  appVersion = '0.0.0',
  locale = 'es-MX',
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = validateApiUrl(apiUrl);
  if (!base) return { ok: false, error: 'Servicio de feedback no configurado.' };
  const cleanMsg = String(message || '').trim();
  if (cleanMsg.length < 5) return { ok: false, error: 'Escribí al menos 5 caracteres.' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Sin conexión disponible.' };

  const validCat = ['suggestion', 'bug', 'ui', 'other'].includes(category) ? category : 'suggestion';
  const rawPid = profileId != null ? Number(profileId) : null;
  const pid = Number.isSafeInteger(rawPid) && rawPid > 0 ? rawPid : null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}/v1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        category: validCat,
        message: cleanMsg.slice(0, 1500),
        contact: String(contact || '').trim().slice(0, 120),
        profileId: pid,
        alias: String(alias || '').trim().slice(0, 80),
        plan: String(plan || 'free').slice(0, 24),
        appVersion: String(appVersion || '0.0.0').slice(0, 32),
        locale: String(locale || '').slice(0, 16),
        machineHash: getMachineHash(),
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 429) {
        return { ok: false, error: 'Enviaste varios mensajes seguidos. Probá de nuevo en un rato.' };
      }
      return { ok: false, error: data.error || `Error del servidor (HTTP ${res.status})` };
    }
    return { ok: true, id: data.id || null };
  } catch (err) {
    return {
      ok: false,
      error: err?.name === 'AbortError' ? 'Tiempo de espera agotado.' : 'No se pudo conectar con el servidor.',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function submitRemoteDiagnostic({
  apiUrl = DEFAULT_API_URL,
  kind = 'user_report',
  fingerprint = '',
  summary = '',
  logTail = '',
  appVersion = '0.0.0',
  profileId = null,
  alias = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = validateApiUrl(apiUrl);
  if (!base) return { ok: false, error: 'Servicio de diagnóstico no configurado.' };
  const cleanSummary = String(summary || '').trim();
  if (cleanSummary.length < 4) return { ok: false, error: 'Resumen demasiado corto.' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Sin conexión disponible.' };

  const dev = getDeviceInfo();
  const rawPid = profileId != null ? Number(profileId) : null;
  const pid = Number.isSafeInteger(rawPid) && rawPid > 0 ? rawPid : null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetchImpl(`${base}/v1/diagnostics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        kind: String(kind || 'user_report').slice(0, 32),
        fingerprint: String(fingerprint || '').slice(0, 96),
        summary: cleanSummary.slice(0, 240),
        logTail: String(logTail || '').slice(-6144),
        appVersion: String(appVersion || '0.0.0').slice(0, 32),
        osInfo: dev.osInfo,
        profileId: pid,
        alias: String(alias || '').trim().slice(0, 80),
        machineHash: dev.machineHash,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true, id: data.id || null, deduplicated: Boolean(data.deduplicated) };
  } catch (err) {
    return {
      ok: false,
      error: err?.name === 'AbortError' ? 'timeout' : 'network-error',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function authedJsonRequest({ apiUrl = DEFAULT_API_URL, path, method = 'GET', sessionToken, body = null, extraHeaders = {}, fetchImpl = globalThis.fetch }) {
  const base = validateApiUrl(apiUrl);
  if (!base) return { ok: false, error: 'Servicio no configurado.' };
  if (!sessionToken || typeof sessionToken !== 'string') return { ok: false, unauthorized: true, error: 'Sin sesión iniciada.' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Sin conexión disponible.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const headers = { accept: 'application/json', authorization: `Bearer ${sessionToken.trim()}`, ...(extraHeaders || {}) };
    const init = { method, headers, signal: controller.signal };
    if (body != null) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetchImpl(`${base}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { ok: false, unauthorized: true, error: data.message || 'Sesión vencida o cerrada.', code: data.error || 'auth-required', data };
    if (!res.ok) return { ok: false, status: res.status, error: data.message || data.error || `HTTP ${res.status}`, code: data.error || null, data };
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'Tiempo de espera agotado.' : 'No se pudo conectar con el servidor.' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAccountMe(opts) {
  return authedJsonRequest({ ...opts, path: '/v1/me', method: 'GET' });
}

async function revokeOwnDevice({ machineHash, ...opts }) {
  return authedJsonRequest({ ...opts, path: `/v1/me/devices/${encodeURIComponent(machineHash)}`, method: 'DELETE' });
}

async function claimCurrentDevice({ appVersion = '0.0.0', ...opts }) {
  const dev = getDeviceInfo();
  return authedJsonRequest({
    ...opts,
    path: '/v1/me/devices/claim',
    method: 'POST',
    body: { deviceName: dev.deviceName, osInfo: dev.osInfo, appVersion: String(appVersion || '0.0.0').slice(0, 32) },
  });
}

async function logoutRemoteSession(opts) {
  return authedJsonRequest({ ...opts, path: '/v1/me/logout', method: 'POST' });
}

async function redeemLicenseKey({ code, ...opts }) {
  return authedJsonRequest({ ...opts, path: '/v1/keys/redeem', method: 'POST', body: { code: String(code || '').trim() } });
}

async function createCheckoutOrder({ plan, cycle, method, coin = 'polygon_usdc', ...opts }) {
  return authedJsonRequest({
    ...opts,
    path: '/v1/checkout/create',
    method: 'POST',
    body: {
      plan: plan === 'pro' ? 'pro' : 'promax',
      cycle: cycle === 'annual' ? 'annual' : 'monthly',
      method: method === 'card' ? 'card' : 'crypto',
      coin: coin === 'polygon_usdt' ? 'polygon_usdt' : 'polygon_usdc',
    },
  });
}

async function getCheckoutOrderStatus({ orderId, ...opts }) {
  return authedJsonRequest({
    ...opts,
    path: `/v1/checkout/status?order=${encodeURIComponent(String(orderId || '').trim())}`,
    method: 'GET',
  });
}

async function claimUltraTrial(opts) {
  return authedJsonRequest({
    ...opts,
    path: '/v1/trial/claim',
    method: 'POST',
    body: {},
  });
}

async function fetchMyReferrals({ allLocalPlatformIdHashes = [], ...opts } = {}) {
  const hw = await initHardwareProfile();
  const extraHeaders = {
    'x-relic-machine': hw.machineHash,
    'x-relic-hw': hw.hwHash,
    'x-relic-os': hw.osInstallHash,
  };
  if (Array.isArray(allLocalPlatformIdHashes) && allLocalPlatformIdHashes.length) {
    extraHeaders['x-relic-aoe-hashes'] = allLocalPlatformIdHashes.slice(0, 20).join(',');
  }
  return authedJsonRequest({
    ...opts,
    path: '/v1/referrals/me',
    method: 'GET',
    extraHeaders,
  });
}

async function applyReferralCode({ code, allLocalPlatformIdHashes = [], ...opts } = {}) {
  const hw = await initHardwareProfile();
  return authedJsonRequest({
    ...opts,
    path: '/v1/referrals/apply',
    method: 'POST',
    body: {
      code: String(code || '').trim(),
      machineHash: hw.machineHash,
      hwHash: hw.hwHash,
      osInstallHash: hw.osInstallHash,
      hwStrength: hw.hwStrength,
      isVm: hw.isVm,
      allLocalPlatformIdHashes: Array.isArray(allLocalPlatformIdHashes) ? allLocalPlatformIdHashes.slice(0, 20) : [],
    },
  });
}

async function activateReferral({ aoeProof = null, ...opts } = {}) {
  const hw = await initHardwareProfile();
  return authedJsonRequest({
    ...opts,
    path: '/v1/referrals/activate',
    method: 'POST',
    body: {
      machineHash: hw.machineHash,
      hwHash: hw.hwHash,
      osInstallHash: hw.osInstallHash,
      hwStrength: hw.hwStrength,
      isVm: hw.isVm,
      aoeProof,
    },
  });
}

module.exports = {
  DEFAULT_API_URL,
  RELEASE_PUBLIC_KEYS,
  getMachineHash,
  getHardwareProfile,
  initHardwareProfile,
  getDeviceInfo,
  validateApiUrl,
  buildGoogleAuthStartUrl,
  buildGoogleDesktopAuthUrl,
  exchangeGoogleCode,
  checkRemoteEntitlement,
  fetchAccountMe,
  revokeOwnDevice,
  claimCurrentDevice,
  logoutRemoteSession,
  redeemLicenseKey,
  createCheckoutOrder,
  getCheckoutOrderStatus,
  claimUltraTrial,
  fetchMyReferrals,
  applyReferralCode,
  activateReferral,
  submitRemoteFeedback,
  submitRemoteDiagnostic,
};
