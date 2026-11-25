'use strict';

/**
 * Suite de regresión de seguridad (Anexo A y Anexo B del informe de auditoría).
 * Verifica todos los controles gratuitos a nivel de código, criptografía y build:
 *   C-01, C-02, C-03 (código), A-01, A-02, M-01, M-03, M-04, M-05 y B-01.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const product = require('../src/product');
const licenseClient = require('../src/license-client');

function signEntitlement(payload, privateKey) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.sign(null, Buffer.from(product.TOKEN_PREFIX + encoded), privateKey).toString('base64url');
  return `v1.${encoded}.${sig}`;
}

const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const updaterSrc = fs.readFileSync(path.join(ROOT, 'src', 'updater.js'), 'utf8');
const fusesSrc = fs.readFileSync(path.join(ROOT, 'tools', 'apply-fuses.js'), 'utf8');
const builderJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron-builder.json'), 'utf8'));

// ── 1. Anexo A PoC: token forjado con clave Ed25519 del atacante ────────────
{
  const attacker = crypto.generateKeyPairSync('ed25519');
  const nowSec = Math.floor(Date.now() / 1000);
  const forged = signEntitlement({
    schema: 1,
    kid: 'prod-2026-01',
    sub: 'account:attacker',
    aud: product.AUDIENCE,
    plan: 'promax',
    profileId: 999999,
    mid: 'attacker-machine-hash',
    iat: nowSec - 10,
    exp: nowSec + 3600,
  }, attacker.privateKey);

  const state = product.getProductState({
    entitlementToken: forged,
    publicKeys: licenseClient.RELEASE_PUBLIC_KEYS,
    accountId: 'account:attacker',
    profileId: 999999,
    machineHash: 'attacker-machine-hash',
  });

  assert.equal(state.plan, 'free', 'Anexo A: token forjado nunca debe conceder Pro/Ultra');
  assert.equal(state.subscriptionVerified, false);
  assert.equal(state.entitlement.valid, false);
  assert.equal(state.entitlement.reason, 'invalid-signature');
  assert.equal(state.featureAccess.trainingHub, false);
  assert.equal(state.featureAccess.smurfDetector, false);
}

// ── 2. C-01: pinning de claves públicas, URL oficial y rechazo de HTTP local ─
{
  assert.equal(
    licenseClient.DEFAULT_API_URL,
    'https://aoe2-helper-licensing.aoe2helper-api.workers.dev',
    'C-01: DEFAULT_API_URL debe estar fijada al Worker oficial HTTPS'
  );
  assert.equal(licenseClient.validateApiUrl('http://127.0.0.1:8787'), null, 'C-01: debe rechazar http://127.0.0.1 por defecto');
  assert.equal(licenseClient.validateApiUrl('http://localhost:8787'), null, 'C-01: debe rechazar http://localhost por defecto');
  assert.equal(licenseClient.validateApiUrl('http://evil.example.com'), null, 'C-01: debe rechazar http:// externo');
  assert.equal(
    licenseClient.validateApiUrl('http://127.0.0.1:8787', { allowLocalHttp: true }),
    'http://127.0.0.1:8787',
    'C-01: dev explícito con allowLocalHttp:true sigue funcionando para tests locales'
  );
  assert.equal(
    licenseClient.validateApiUrl('https://aoe2-helper-licensing.aoe2helper-api.workers.dev/'),
    'https://aoe2-helper-licensing.aoe2helper-api.workers.dev'
  );

  // Verificación estructural en main.js
  assert.match(mainSrc, /function loadProductPublicKeys\(\)[\s\S]*?if\s*\(app\.isPackaged\)\s*\{[\s\S]*?return Object\.keys\(pinned\)/, 'C-01: loadProductPublicKeys debe ignorar claves externas cuando app.isPackaged');
  assert.match(mainSrc, /function licenseApiUrl\(\)[\s\S]*?if\s*\(app\.isPackaged\)\s*return licenseClient\.DEFAULT_API_URL;/, 'C-01: licenseApiUrl debe fijar DEFAULT_API_URL cuando app.isPackaged');
  assert.doesNotMatch(mainSrc, /config\.licenseApiUrl/, 'C-01: main.js no debe leer config.licenseApiUrl desde disco');
  assert.match(mainSrc, /ipcMain\.handle\('settings:activate-license'[\s\S]*?if\s*\(app\.isPackaged\)/, 'C-01: settings:activate-license debe bloquearse en producción');
}

// ── 3. C-02: eliminación completa de ACCESS_KEY_HASH / backdoor offline ─────
{
  assert.doesNotMatch(mainSrc, /const\s+ACCESS_KEY_HASH\s*=/, 'C-02: ACCESS_KEY_HASH no debe existir en main.js');
  assert.doesNotMatch(mainSrc, /function\s+normalizeAccessKey\b/, 'C-02: normalizeAccessKey no debe existir');
  assert.doesNotMatch(mainSrc, /function\s+accessKeyMatches\b/, 'C-02: accessKeyMatches no debe existir');
  assert.match(mainSrc, /function hasAccessKeyGrant\(\)\s*\{\s*return false;\s*\}/, 'C-02: hasAccessKeyGrant debe retornar false');
  assert.match(mainSrc, /accessKeyGranted:\s*false/, 'C-02: productState debe forzar accessKeyGranted: false');
}

// ── 4. C-03 (código): sin instalación silenciosa de updates al salir ────────
{
  assert.match(updaterSrc, /autoUpdater\.autoInstallOnAppQuit\s*=\s*false/, 'C-03: autoInstallOnAppQuit debe estar en false');
}

// ── 5. A-02: vinculación criptográfica al dispositivo (`mid`) ───────────────
{
  const testKeys = crypto.generateKeyPairSync('ed25519');
  const pubPem = testKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const publicKeys = { 'test-2026': pubPem };
  const nowSec = Math.floor(Date.now() / 1000);

  const boundToken = signEntitlement({
    schema: 1,
    kid: 'test-2026',
    sub: 'account:user-1',
    aud: product.AUDIENCE,
    plan: 'promax',
    profileId: 12345,
    mid: 'machine-hash-pc-A',
    iat: nowSec - 10,
    exp: nowSec + 3600,
  }, testKeys.privateKey);

  const okSamePc = product.verifyEntitlement(boundToken, {
    publicKeys,
    accountId: 'account:user-1',
    profileId: 12345,
    machineHash: 'machine-hash-pc-A',
  });
  assert.equal(okSamePc.valid, true, 'A-02: token con mid coincidente debe validarse');
  assert.equal(okSamePc.plan, 'promax');
  assert.equal(okSamePc.machineHash, 'machine-hash-pc-A');

  const clonedPc = product.verifyEntitlement(boundToken, {
    publicKeys,
    accountId: 'account:user-1',
    profileId: 12345,
    machineHash: 'machine-hash-pc-B',
  });
  assert.equal(clonedPc.valid, false, 'A-02: token copiado a otra PC debe rechazarse');
  assert.equal(clonedPc.reason, 'device-mismatch');
  assert.equal(clonedPc.plan, 'free');

  const missingMidInput = product.verifyEntitlement(boundToken, {
    publicKeys,
    accountId: 'account:user-1',
    profileId: 12345,
    machineHash: '',
  });
  assert.equal(missingMidInput.valid, false);
  assert.equal(missingMidInput.reason, 'device-mismatch');

  const unboundToken = signEntitlement({
    schema: 1,
    kid: 'test-2026',
    sub: 'account:user-1',
    aud: product.AUDIENCE,
    plan: 'pro',
    iat: nowSec - 10,
    exp: nowSec + 3600,
  }, testKeys.privateKey);
  const strictCheck = product.verifyEntitlement(unboundToken, {
    publicKeys,
    accountId: 'account:user-1',
    machineHash: 'machine-hash-pc-A',
    requireDeviceBinding: true,
  });
  assert.equal(strictCheck.valid, false);
  assert.equal(strictCheck.reason, 'device-unbound');

  assert.match(mainSrc, /machineHash:\s*licenseClient\.getMachineHash\(\)/, 'A-02: main.js debe pasar machineHash a resolveProductState');

  // También verificar checkRemoteEntitlement con token vinculado a mid real de esta PC
  const localMachineHash = licenseClient.getMachineHash();
  const liveBoundToken = signEntitlement({
    schema: 1,
    kid: 'test-2026',
    sub: 'account:live-user',
    aud: product.AUDIENCE,
    plan: 'promax',
    profileId: 55555,
    mid: localMachineHash,
    iat: nowSec - 10,
    exp: nowSec + 3600,
  }, testKeys.privateKey);
  const foreignBoundToken = signEntitlement({
    schema: 1,
    kid: 'test-2026',
    sub: 'account:live-user',
    aud: product.AUDIENCE,
    plan: 'promax',
    profileId: 55555,
    mid: 'other-pc-hash-999',
    iat: nowSec - 10,
    exp: nowSec + 3600,
  }, testKeys.privateKey);

  // Verificación síncrona vía main promise al final
  globalThis.__A02_REMOTE_TEST__ = { publicKeys, liveBoundToken, foreignBoundToken };
}

// ── 6. A-01 + M-04: validación IPC por senderFrame + navegación + permisos ──
{
  assert.match(mainSrc, /const TRUSTED_APP_HTML_URLS\s*=/, 'A-01: debe existir whitelist TRUSTED_APP_HTML_URLS');
  assert.match(mainSrc, /function isTrustedIpcEvent\(event\)/, 'A-01: debe existir isTrustedIpcEvent');
  assert.match(mainSrc, /ipcMain\.handle\s*=\s*\(channel,\s*listener\)\s*=>[\s\S]*?isTrustedIpcEvent\(event\)/, 'A-01: todos los ipcMain.handle deben validar isTrustedIpcEvent');
  assert.match(mainSrc, /ipcMain\.on\s*=\s*\(channel,\s*listener\)\s*=>[\s\S]*?isTrustedIpcEvent\(event\)/, 'A-01: todos los ipcMain.on deben validar isTrustedIpcEvent');
  assert.match(mainSrc, /wc\.on\('will-navigate'[\s\S]*?isTrustedAppFileUrl/, 'M-04: will-navigate debe restringirse a archivos propios');
  assert.match(mainSrc, /setPermissionRequestHandler\(\(_webContents,\s*_permission,\s*callback\)\s*=>\s*callback\(false\)\)/, 'M-04: permisos deben denegarse por defecto');
  assert.match(mainSrc, /setPermissionCheckHandler\(\(\)\s*=>\s*false\)/, 'M-04: permission check debe denegarse por defecto');
}

// ── 7. M-01: OAuth loopback sin bypass `?token=` y con state constante ──────
{
  assert.doesNotMatch(mainSrc, /directToken/, 'M-01: no debe aceptarse ?token= directo en callback OAuth');
  assert.match(mainSrc, /crypto\.timingSafeEqual/, 'M-01: comparación de OAuth state debe usar timingSafeEqual');
}

// ── 8. M-03: DPAPI obligatorio en producción + redacción de secretos en log ─
{
  assert.match(mainSrc, /function redactSecretsForLog\(raw\)/, 'M-03: debe existir redactSecretsForLog');
  assert.match(mainSrc, /const text = redactSecretsForLog\(args\.join\(' '\)\)/, 'M-03: log() debe redactar secretos');
  assert.match(mainSrc, /function loadSessionToken[\s\S]*?if\s*\(app\.isPackaged\s*&&\s*safeStorage\s*&&\s*safeStorage\.isEncryptionAvailable\(\)\)\s*return null;/, 'M-03: loadSessionToken debe rechazar texto plano en producción con DPAPI');
  assert.match(mainSrc, /function saveSessionToken[\s\S]*?else if\s*\(!app\.isPackaged\)\s*\{/, 'M-03: saveSessionToken solo puede escribir texto plano en dev (!app.isPackaged)');
}

// ── 9. M-05 + B-01: LICENSE/EULA + Electron Fuses ───────────────────────────
{
  const licenseText = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  const eulaText = fs.readFileSync(path.join(ROOT, 'EULA.md'), 'utf8');
  assert.match(licenseText, /All Rights Reserved|Todos los derechos reservados/i, 'M-05: LICENSE debe ser propietario');
  assert.match(eulaText, /Relic/i, 'M-05: EULA.md debe estar presente');

  assert.equal(builderJson.afterPack, 'tools/apply-fuses.js', 'B-01: electron-builder.json debe ejecutar tools/apply-fuses.js');
  for (const fuseCheck of [
    'FuseV1Options.RunAsNode]: false',
    'FuseV1Options.EnableCookieEncryption]: true',
    'FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false',
    'FuseV1Options.EnableNodeCliInspectArguments]: false',
    'FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true',
    'FuseV1Options.OnlyLoadAppFromAsar]: true',
  ]) {
    assert.ok(fusesSrc.includes(fuseCheck), `B-01: falta configurar fuse ${fuseCheck}`);
  }
}

(async () => {
  const { publicKeys, liveBoundToken, foreignBoundToken } = globalThis.__A02_REMOTE_TEST__;
  const okRes = await licenseClient.checkRemoteEntitlement({
    apiUrl: 'https://aoe2-helper-licensing.aoe2helper-api.workers.dev',
    profileId: 55555,
    publicKeys,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ active: true, revoked: false, accountId: 'account:live-user', token: liveBoundToken }),
    }),
  });
  assert.equal(okRes.status, 'verified', 'A-02: checkRemoteEntitlement debe validar token con mid de esta PC');
  assert.equal(okRes.active, true);
  assert.equal(okRes.plan, 'promax');

  const badRes = await licenseClient.checkRemoteEntitlement({
    apiUrl: 'https://aoe2-helper-licensing.aoe2helper-api.workers.dev',
    profileId: 55555,
    publicKeys,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ active: true, revoked: false, accountId: 'account:live-user', token: foreignBoundToken }),
    }),
  });
  assert.equal(badRes.active, false, 'A-02: checkRemoteEntitlement debe rechazar token con mid de otra PC');
  assert.equal(badRes.reason, 'device-mismatch');

  console.log('Security Audit Regression (Anexo A & B: C-01, C-02, C-03, A-01, A-02, M-01, M-03, M-04, M-05, B-01): OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
