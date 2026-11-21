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
const { execFileSync } = require('node:child_process');
const { verifyEntitlement } = require('./product');

const DEFAULT_API_URL = process.env.AOE2_LICENSE_API_URL || 'https://aoe2-helper-licensing.aoe2helper-api.workers.dev';
const CHECK_TIMEOUT_MS = 7000;
const MACHINE_SALT = 'aoe2-helper-machine-v1:';

// Claves públicas Ed25519 de producción (seguro incluirlas en el cliente;
// la clave privada vive únicamente en Cloudflare Workers Secrets).
const RELEASE_PUBLIC_KEYS = Object.freeze({
  'prod-2026-01': '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAhLSwWYjc/3usRFveaFNY+HNgql6Bht3lQj7ca/1YYdI=\n-----END PUBLIC KEY-----',
});

let cachedMachineHash = null;

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

function validateApiUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    const isLocalDev = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
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
  return {
    machineHash: getMachineHash(),
    deviceName: host || `PC-${getMachineHash().slice(0, 6).toUpperCase()}`,
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
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = validateApiUrl(apiUrl);
  if (!base) return { ok: false, error: 'Servicio no configurado.' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Sin conexión disponible.' };
  const dev = getDeviceInfo();
  const rawPid = profileId != null ? Number(profileId) : null;
  const pid = Number.isSafeInteger(rawPid) && rawPid > 0 ? rawPid : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}/v1/auth/google/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        code: String(code || '').trim(),
        redirectUri: String(redirectUri || '').trim(),
        machineHash: dev.machineHash,
        deviceName: dev.deviceName,
        osInfo: dev.osInfo,
        appVersion: String(appVersion || '0.0.0').slice(0, 32),
        profileId: pid,
        alias: String(alias || '').trim().slice(0, 80),
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'Tiempo de espera agotado.' : 'No se pudo conectar con el servidor.' };
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
    const verifyOpts = { publicKeys, accountId, now };
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

async function authedJsonRequest({ apiUrl = DEFAULT_API_URL, path, method = 'GET', sessionToken, body = null, fetchImpl = globalThis.fetch }) {
  const base = validateApiUrl(apiUrl);
  if (!base) return { ok: false, error: 'Servicio no configurado.' };
  if (!sessionToken || typeof sessionToken !== 'string') return { ok: false, unauthorized: true, error: 'Sin sesión iniciada.' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Sin conexión disponible.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const headers = { accept: 'application/json', authorization: `Bearer ${sessionToken.trim()}` };
    const init = { method, headers, signal: controller.signal };
    if (body != null) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetchImpl(`${base}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { ok: false, unauthorized: true, error: 'Sesión vencida o cerrada.' };
    if (!res.ok) return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}`, data };
    return { ok: true, data };
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

module.exports = {
  DEFAULT_API_URL,
  RELEASE_PUBLIC_KEYS,
  getMachineHash,
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
  submitRemoteFeedback,
};
