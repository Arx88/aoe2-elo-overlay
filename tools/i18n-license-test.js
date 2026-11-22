'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const i18n = require('../src/i18n');
const AppI18n = require('../ui/i18n');
const TacticalUI = require('../ui/tactical-ui');
const { TOKEN_PREFIX } = require('../src/product');
const { checkRemoteEntitlement, submitRemoteFeedback, validateApiUrl } = require('../src/license-client');
const { createMinimizeController } = require('../src/game-window');

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
  // Verificar que TODOS los atributos data-i18n de settings.html e index.html existen en los 4 idiomas
  const htmlFiles = ['settings.html', 'index.html'];
  const allKeys = new Set();
  for (const fname of htmlFiles) {
    const html = fs.readFileSync(path.join(__dirname, '..', fname), 'utf8');
    for (const m of html.matchAll(/data-i18n(?:-(?:placeholder|title))?="([^"]+)"/g)) {
      allKeys.add(m[1]);
    }
  }
  assert.ok(allKeys.size >= 90, `se esperaban ≥90 claves data-i18n en HTML, hubo ${allKeys.size}`);
  for (const code of i18n.SUPPORTED_LOCALES) {
    AppI18n.configure({ locale: code, allBundles });
    for (const key of allKeys) {
      const val = AppI18n.t(key);
      assert.ok(val && val !== key, `Falta traducción para "${key}" en ${code}`);
    }
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
  const detect = require('../src/detect');
  assert.equal(detect.accountIdToSteamId64(0x2ca13eac), '76561198709030572');
  assert.equal(detect.parseRegDword('    ActiveUser    REG_DWORD    0x2ca13eac', 'ActiveUser'), 0x2ca13eac);
  assert.equal(detect.parseRegDword('    ActiveUser    REG_DWORD    0x0', 'ActiveUser'), null);
  assert.equal(detect.parseLoginUsersVdf('"users"{\n"76561198000000001"{"MostRecent" "0" "Timestamp" "1700000000"}\n"76561198000000002"{"MostRecent" "1" "Timestamp" "1600000000"}\n}'), '76561198000000002');
  const builderCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'electron-builder.json'), 'utf8'));
  assert.ok(builderCfg.files.includes('!admin-app/**'), 'admin-app debe quedar fuera del instalador público');
  assert.ok(builderCfg.files.includes('!licensing-api/**'), 'licensing-api debe quedar fuera del instalador público');
  assert.ok(builderCfg.files.includes('wizard.css'), 'wizard.css debe incluirse en el build');
  assert.equal(builderCfg.nsis.uninstallerSidebar, builderCfg.nsis.installerSidebar);
  for (const [image, width, height] of [
    [builderCfg.nsis.installerSidebar, 164, 314],
    [builderCfg.nsis.installerHeader, 150, 57],
  ]) {
    const bitmap = fs.readFileSync(path.join(__dirname, '..', image));
    assert.equal(bitmap.toString('ascii', 0, 2), 'BM');
    assert.equal(bitmap.readInt32LE(18), width);
    assert.equal(Math.abs(bitmap.readInt32LE(22)), height);
    assert.equal(bitmap.readUInt16LE(28), 24);
  }

  // 5) Central de Inteligencia Propia (Radar 6 ejes, curva ELO, barras y 10 últimas partidas sin inline styles)
  const { computeCentralAnalytics } = require('../src/central');
  const centralData = computeCentralAnalytics({
    profileId: 25399083,
    alias: 'PSX | Acido',
    ladder1v1: { rating: 1320, peak: 1385, rank: 8400, ladderPercentile: 14.2, wins: 120, losses: 95, streak: 3 },
    matches: Array.from({ length: 12 }, (_, idx) => ({
      matchId: 5000 + idx,
      mapName: idx % 2 === 0 ? 'Arabia' : 'Arena',
      leaderboardId: 3,
      leaderboardName: 'RM 1v1',
      startedAt: 1700000000000 - idx * 3600000,
      finishedAt: 1700000000000 - idx * 3600000 + 1500000,
      ongoing: false,
      players: [
        { profileId: 25399083, name: 'PSX | Acido', civ: idx % 3 === 0 ? 'Franks' : 'Mayans', team: 1, won: idx % 3 !== 0, matchRating: 1300 + idx * 4, matchRatingDiff: idx % 3 !== 0 ? 14 : -13 },
        { profileId: 9000 + idx, name: `Rival ${idx}`, civ: 'Britons', team: 2, won: idx % 3 === 0, matchRating: 1295 },
      ],
    })),
    storedRecords: [],
    scoutData: {
      style: { analyzed: 24, aggressive: 14, boom: 7, hybrid: 3, aggressiveShare: 58 },
      likelyOpenings: [{ name: 'Scout rush', short: 'Scouts', games: 10, sample: 24 }],
    },
  });
  assert.equal(centralData.ok, true);
  assert.equal(centralData.radarAxes.length, 6);
  assert.equal(centralData.last10Matches.length, 10);
  assert.equal(centralData.topCivs.length, 2);
  assert.equal(centralData.topMaps.length, 2);
  const centralHtml = TacticalUI.renderCentralDashboard(centralData);
  const recentHtml = TacticalUI.renderRecentMatchesList(centralData.last10Matches);
  assert.match(centralHtml, /Resultados por duración/);
  assert.match(centralHtml, /Muestra reciente/);
  assert.doesNotMatch(centralHtml, /central-radar-svg/);
  assert.match(centralHtml, /central-elo-svg/);
  assert.match(centralHtml, /cx-trend-row/);
  assert.match(centralHtml, /data-chart-points=/);
  assert.match(recentHtml, /data-match-id="5000"/);
  assert.doesNotMatch(centralHtml, /\sstyle="/, 'Central dashboard must obey strict CSP without inline style attributes');
  assert.doesNotMatch(recentHtml, /\sstyle="/, 'Recent matches list must obey strict CSP without inline style attributes');

  // 6) Últimas 10 vs Últimas 20: con 25 partidas deben producir promedios distintos
  const bigCentral = computeCentralAnalytics({
    profileId: 25399083,
    alias: 'PSX | Acido',
    ladder1v1: { rating: 1420, peak: 1450, rank: 5000, wins: 150, losses: 100, streak: 4 },
    matches1v1: Array.from({ length: 25 }, (_, idx) => ({
      matchId: 7000 + idx,
      mapName: 'Arabia',
      leaderboardId: 3,
      leaderboardName: 'RM 1v1',
      startedAt: 1700000000000 - idx * 3600000,
      finishedAt: 1700000000000 - idx * 3600000 + (idx < 11 ? 1200000 : 2400000),
      ongoing: false,
      players: [
        { profileId: 25399083, name: 'PSX | Acido', civ: 'Franks', team: 1, won: idx < 10, matchRating: 1420 - idx * 5, matchRatingDiff: idx < 10 ? 15 : -15 },
        { profileId: 9100 + idx, name: `Rival ${idx}`, civ: 'Mayans', team: 2, won: idx >= 10, matchRating: 1400 },
      ],
    })),
    storedRecords: [],
  });
  const w10 = bigCentral.modes.rm_1v1.lastMatchVsAvg.windows[10];
  const w20 = bigCentral.modes.rm_1v1.lastMatchVsAvg.windows[20];
  assert.ok(w10.metrics.length >= 3 && w20.metrics.length >= 3);
  assert.notEqual(
    JSON.stringify(w10.metrics),
    JSON.stringify(w20.metrics),
    'Últ. 10 y Últ. 20 deben mostrar promedios distintos cuando hay >10 partidas',
  );

  // 7) Feedback client + AoE2 minimized 5s controller + colocación de controles en settings.html
  const fbShort = await submitRemoteFeedback({ message: 'hi', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }) });
  assert.equal(fbShort.ok, false);
  const fbOk = await submitRemoteFeedback({
    apiUrl: 'https://licensing.test.workers.dev',
    category: 'suggestion',
    message: 'Excelente overlay para AoE2!',
    profileId: 25399083,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, id: 42 }) }),
  });
  assert.equal(fbOk.ok, true);
  assert.equal(fbOk.id, 42);

  let hiddenCalls = 0;
  let shownCalls = 0;
  let pendingFn = null;
  const ctrl = createMinimizeController({
    delayMs: 5000,
    canHide: () => true,
    onHide: () => { hiddenCalls += 1; },
    onShow: () => { shownCalls += 1; },
    setTimer: (fn) => { pendingFn = fn; return 1; },
    clearTimer: () => { pendingFn = null; },
  });
  ctrl.setEnabled(true);
  ctrl.updateState('minimized');
  assert.equal(hiddenCalls, 0);
  assert.equal(typeof pendingFn, 'function');
  pendingFn();
  assert.equal(hiddenCalls, 1);
  assert.equal(ctrl.isHiddenByMinimized(), true);
  ctrl.updateState('visible');
  assert.equal(shownCalls, 1);
  assert.equal(ctrl.isHiddenByMinimized(), false);

  const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
  const overlaySec = settingsHtml.split('<section class="page" data-page="overlay">')[1].split('<section class="page" data-page="tactics">')[0];
  const tacticsSec = settingsHtml.split('<section class="page" data-page="tactics">')[1].split('<section class="page" data-page="postmatch">')[0];
  const skinsSec = settingsHtml.split('<section class="page" data-page="skins">')[1].split('<section class="page" data-page="updater">')[0];
  assert.doesNotMatch(overlaySec, /id="civHelp"/, 'civHelp no debe estar en Prematch');
  assert.match(tacticsSec, /id="civHelp"/, 'civHelp debe estar en Durante');
  assert.match(skinsSec, /id="hideWhenMinimized"/, 'hideWhenMinimized debe estar en Apariencia');
  assert.match(settingsHtml, /id="prefsFeedbackBtn"/, 'Feedback debe estar en el popover de tuerca');
  assert.match(settingsHtml, /id="feedbackModal"/, 'Modal de feedback debe existir');

  console.log('i18n + licensing + NSIS security test: OK (4 AoE2 DE locales, Ed25519 remote verify/revoke, Central 10/20, Feedback, Minimize 5s & build isolation)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
