'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const i18n = require('../src/i18n');
const AppI18n = require('../ui/i18n');
const TacticalUI = require('../ui/tactical-ui');
const { TOKEN_PREFIX } = require('../src/product');
const { checkRemoteEntitlement, validateApiUrl } = require('../src/license-client');

async function run() {
  // 1) Locales soportados y nombres oficiales verificados contra AoE2 DE
  assert.deepEqual([...i18n.SUPPORTED_LOCALES], ['en', 'es-ES', 'es-MX', 'zh-CN']);

  // Diferencia real oficial entre Español (España) y Español (México) en AoE2 DE: Knight (38)
  assert.equal(i18n.unitName(38, 'en'), 'Knight');
  assert.equal(i18n.unitName(38, 'es-ES'), 'Caballero');
  assert.equal(i18n.unitName(38, 'es-MX'), 'Jinete');
  assert.equal(i18n.unitName(38, 'zh-CN'), '骑士');

  // Villager (83) sin sufijos de género en ningún idioma
  assert.equal(i18n.unitName(83, 'en'), 'Villager');
  assert.equal(i18n.unitName(83, 'es-ES'), 'Aldeano');
  assert.equal(i18n.unitName(83, 'es-MX'), 'Aldeano');
  assert.equal(i18n.unitName(83, 'zh-CN'), '村民');

  // Edificios clave
  assert.equal(i18n.buildingName('town_center', 'en'), 'Town Center');
  assert.equal(i18n.buildingName('town_center', 'es-ES'), 'Centro urbano');
  assert.equal(i18n.buildingName('town_center', 'es-MX'), 'Centro urbano');
  assert.equal(i18n.buildingName('town_center', 'zh-CN'), '城镇中心');
  assert.equal(i18n.buildingName('stable', 'en'), 'Stable');
  assert.equal(i18n.buildingName('stable', 'zh-CN'), '马厩');

  // Civilizaciones y edades
  assert.equal(i18n.civName('Franks', 'en'), 'Franks');
  assert.equal(i18n.civName('Franks', 'es-ES'), 'Francos');
  assert.equal(i18n.civName('Franks', 'zh-CN'), '法兰克');
  assert.equal(i18n.civName('Mayans', 'zh-CN'), '玛雅');
  assert.equal(i18n.ageName('dark', 'en'), 'Dark Age');
  assert.equal(i18n.ageName('dark', 'zh-CN'), '黑暗时代');

  // 2) Browser AppI18n + TacticalUI render en los 4 idiomas (y banderitas SVG válidas)
  const allBundles = i18n.getAllBundles();
  for (const code of i18n.SUPPORTED_LOCALES) {
    assert.match(AppI18n.flagSvg(code), /^<svg class="flag-svg"/);
  }
  AppI18n.configure({ locale: 'zh-CN', allBundles });
  TacticalUI.configure({ slugs: ['franks', 'mayans'], i18n: AppI18n });
  const zhHtml = TacticalUI.renderPostMatch({
    context: { mapName: 'Arabia', mode: { label: '1v1 RM' }, civ: 'Franks' },
    result: { status: 'won', label: 'Victoria', ratingDiff: 15, durationSeconds: 1800 },
    engine: {
      rivalName: 'Rival',
      rivalCiv: 'Mayans',
      self: {
        villagersOrdered: 80, townCenters: 3, militaryOrdered: 50,
        tcIdleDarkSeconds: 10, tcIdleFeudalPerTcSeconds: 20, tcIdleTotalSeconds: 40,
        workshopsCount: 2,
        topWorkshops: [{ typeId: 101, name: 'Establo', count: 2, units: 30, peakQueue: 4, status: 'balanced' }],
        topUnits: [{ unitId: 38, name: 'Caballero', count: 30 }],
      },
      openingSummary: { key: 'Scout Rush', name: 'Scout Rush', grade: 'S', score: 94, tip: 'ok' },
      stages: [{ id: 'dark', label: 'Alta Edad', status: 'ready', grade: 'S', metric: '98%' }],
      highlights: [],
    },
  }, { comparison: true, compareMode: 'both', replay: true });
  assert.match(zhHtml, /法兰克/);
  assert.match(zhHtml, /玛雅/);
  assert.match(zhHtml, /骑士/);
  assert.match(zhHtml, /马厩/);
  assert.match(zhHtml, /黑暗时代/);
  assert.doesNotMatch(zhHtml, /\sstyle="/);
  TacticalUI.configure({ i18n: null });

  // 3) Cliente de licencias Ed25519 + revocación remota + seguridad HTTPS
  assert.equal(validateApiUrl('http://evil.example.com'), null);
  assert.equal(validateApiUrl('https://user:pass@evil.example.com'), null);
  assert.equal(validateApiUrl('https://aoe2-helper-licensing.example.workers.dev/'), 'https://aoe2-helper-licensing.example.workers.dev');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    schema: 1,
    kid: 'prod-2026-01',
    sub: 'aoe2:25399083',
    aud: 'aoe2-helper',
    plan: 'promax',
    profileId: 25399083,
    iat: nowSec - 10,
    exp: nowSec + 3600,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(TOKEN_PREFIX + encoded), privateKey).toString('base64url');
  const validToken = `v1.${encoded}.${sig}`;

  const okRes = await checkRemoteEntitlement({
    apiUrl: 'https://licensing.test.workers.dev',
    profileId: 25399083,
    appVersion: '2.4.0',
    publicKeys: { 'prod-2026-01': pubPem },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ active: true, revoked: false, plan: 'promax', accountId: 'aoe2:25399083', token: validToken }),
    }),
  });
  assert.equal(okRes.status, 'verified');
  assert.equal(okRes.active, true);
  assert.equal(okRes.plan, 'promax');

  // Token manipulado → rechazado
  const tamperedToken = `v1.${encoded}.${Buffer.alloc(64, 1).toString('base64url')}`;
  const badRes = await checkRemoteEntitlement({
    apiUrl: 'https://licensing.test.workers.dev',
    profileId: 25399083,
    publicKeys: { 'prod-2026-01': pubPem },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ active: true, revoked: false, plan: 'promax', accountId: 'aoe2:25399083', token: tamperedToken }),
    }),
  });
  assert.equal(badRes.status, 'invalid-signature');
  assert.equal(badRes.active, false);

  // Cuenta desactivada por el admin → kill-switch inmediato
  const revRes = await checkRemoteEntitlement({
    apiUrl: 'https://licensing.test.workers.dev',
    profileId: 25399083,
    publicKeys: { 'prod-2026-01': pubPem },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ active: false, revoked: true, reason: 'disabled-by-admin', token: null }),
    }),
  });
  assert.equal(revRes.status, 'revoked');
  assert.equal(revRes.revoked, true);
  assert.equal(revRes.active, false);

  // 4) Verificar empaquetado seguro e instalador NSIS
  const builderCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'electron-builder.json'), 'utf8'));
  assert.ok(builderCfg.files.includes('!admin-app/**'), 'admin-app debe quedar fuera del instalador público');
  assert.ok(builderCfg.files.includes('!licensing-api/**'), 'licensing-api debe quedar fuera del instalador público');
  assert.ok(builderCfg.files.includes('wizard.css'), 'wizard.css debe incluirse en el build');
  assert.equal(builderCfg.nsis.installerSidebar, 'build/installer-sidebar.bmp');
  assert.equal(builderCfg.nsis.installerHeader, 'build/installer-header.bmp');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'build', 'installer-sidebar.bmp')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'build', 'installer-header.bmp')));

  console.log('i18n + licensing + NSIS security test: OK (4 AoE2 DE locales, Ed25519 remote verify/revoke, build isolation)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
