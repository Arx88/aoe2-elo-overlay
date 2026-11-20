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

async function checkRemoteEntitlement({
  apiUrl = DEFAULT_API_URL,
  profileId = null,
  alias = '',
  appVersion = '0.0.0',
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}/v1/entitlement/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        profileId: pid,
        alias: String(alias || '').trim().slice(0, 80),
        machineHash: getMachineHash(),
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

module.exports = {
  DEFAULT_API_URL,
  RELEASE_PUBLIC_KEYS,
  getMachineHash,
  validateApiUrl,
  checkRemoteEntitlement,
};
