'use strict';

/**
 * Guardia automática de traducciones (`tools/i18n-guard-test.js`)
 *
 * Impide avanzar o compilar si se agrega cualquier texto nuevo sin traducir
 * a los 4 idiomas soportados (`en`, `es-ES`, `es-MX`, `zh-CN`):
 *   1. Paridad exacta de claves entre los 4 diccionarios JSON (0 faltantes, 0 vacías).
 *   2. Todas las claves usadas en HTML (`data-i18n*`) y JS (`AppI18n.t`, `wt`, `i18n.t`)
 *      deben existir en los 4 idiomas.
 *   3. Paridad de variables `{var}` en cada traducción.
 *   4. Cero filtraciones de español sin traducir en `en.json` ni en `zh-CN.json`.
 *   5. Ningún botón, título o etiqueta en español en `settings.html` / `index.html`
 *      puede quedar sin `data-i18n`.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'src', 'i18n', 'locales');
const LOCALES = ['en', 'es-ES', 'es-MX', 'zh-CN'];

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function extractVars(str) {
  return [...String(str || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const dicts = {};
const allKeys = new Set();
for (const loc of LOCALES) {
  const file = path.join(LOCALES_DIR, `${loc}.json`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  dicts[loc] = flatten(parsed);
  for (const k of Object.keys(dicts[loc])) allKeys.add(k);
}

// 1. Paridad exacta entre los 4 locales
for (const loc of LOCALES) {
  const missing = [...allKeys].filter(
    (k) => !Object.hasOwn(dicts[loc], k) || typeof dicts[loc][k] !== 'string' || !dicts[loc][k].trim()
  );
  assert.equal(
    missing.length,
    0,
    `[i18n-guard] Faltan ${missing.length} clave(s) en ${loc}.json: ${missing.slice(0, 15).join(', ')}`
  );
}

// 2. Todas las claves usadas en HTML y UI existen en todos los diccionarios
const scanFiles = [
  'index.html',
  'settings.html',
  'settings.js',
  'renderer.js',
  'src/central.js',
  'src/central-discoveries.js',
  'src/central-intel.js',
  'src/civ-diagnostic.js',
  ...fs.readdirSync(path.join(ROOT, 'ui')).filter((f) => f.endsWith('.js')).map((f) => path.join('ui', f)),
];
const usedKeys = new Set();
for (const rel of scanFiles) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-[a-z-]+)?="([a-zA-Z0-9_.-]+)"/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/\b(?:AppI18n\.t|wt|tt|trT|tr|i18n\.t)\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+)['"]/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/['"](cxe\.[a-zA-Z0-9_]+)['"]/g)) usedKeys.add(m[1]);
}
const missingUsed = [...usedKeys].filter((k) => !allKeys.has(k));
assert.equal(
  missingUsed.length,
  0,
  `[i18n-guard] Hay ${missingUsed.length} clave(s) usadas en HTML/UI sin definir en src/i18n/locales/*.json: ${missingUsed.slice(0, 15).join(', ')}`
);

// 3. Paridad de variables interpoladas {var}
for (const k of allKeys) {
  if (k.startsWith('meta.')) continue;
  const baseVars = extractVars(dicts['es-MX'][k]);
  for (const loc of LOCALES) {
    const locVars = extractVars(dicts[loc][k]);
    assert.deepEqual(
      locVars,
      baseVars,
      `[i18n-guard] Variables inconsistentes en "${k}" para ${loc}.json (esperado ${JSON.stringify(baseVars)}, recibido ${JSON.stringify(locVars)})`
    );
  }
}

// 4. Sin español filtrado en en.json ni zh-CN.json
const SPANISH_LEAK_RE = /[áéíóúñ¿¡]|\b(tu|para|esta|semana|partidas|jugador|cuenta|activar|actualizar|copiar|aplicar|verificar)\b/i;
for (const k of allKeys) {
  if (k.startsWith('meta.') || k.startsWith('game.')) continue;
  const esVal = String(dicts['es-MX'][k] || '');
  const enVal = String(dicts.en[k] || '');
  const zhVal = String(dicts['zh-CN'][k] || '');
  if (esVal.length > 6 && enVal === esVal && SPANISH_LEAK_RE.test(esVal)) {
    assert.fail(`[i18n-guard] Posible texto en español sin traducir en en.json -> "${k}": "${enVal}"`);
  }
  if (zhVal.length > 6 && !/[\u4e00-\u9fff]/.test(zhVal) && zhVal === esVal && SPANISH_LEAK_RE.test(esVal)) {
    assert.fail(`[i18n-guard] Posible texto en español sin traducir en zh-CN.json -> "${k}": "${zhVal}"`);
  }
}

// 5. Elementos visibles con texto en español en HTML deben llevar data-i18n
const BRAND_ALLOWLIST = new Set([
  'Free', 'Pro', 'Ultra', 'Relic', 'Relic Ultra', 'Relic Pro', 'Google',
  'Prematch', 'Postmatch', 'Central 10 / 20', 'USDC', 'USDT', 'USDT / USDC',
  'ELO', '1v1', 'Team', 'AOE II · DE', '0/10', '0 / 10', '0/2 PCs', '0x...', 'USD',
]);
const DYNAMIC_ID_ALLOWLIST = new Set([
  'pageIndex', 'sessionBadge', 'pageSub', 'railPlanLabel', 'accSeatsBadge',
  'checkoutModalTitle', 'checkoutOptMonthly', 'checkoutOptAnnual',
  'checkoutPlanLine', 'checkoutSubtotal', 'checkoutTotal', 'checkoutDepositTitle',
  'checkoutDepositAmount', 'referralPendingChip', 'civHelpTipBody', 'civHelpTipTime',
  'hideEloName', 'hideEloDesc', 'civHelpDesc',
]);
for (const htmlFile of ['settings.html', 'index.html']) {
  const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  const offenders = [];
  for (const m of html.matchAll(/<(h1|h2|h3|h4|button|label|summary|legend|p|span|strong|small|dt)([^>]*)>([^<]+)<\/\1>/g)) {
    const [, tag, attrs, rawText] = m;
    const text = rawText.trim();
    if (!text || text.length < 3 || BRAND_ALLOWLIST.has(text)) continue;
    if (/data-i18n/.test(attrs)) continue;
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    if (idMatch && DYNAMIC_ID_ALLOWLIST.has(idMatch[1])) continue;
    if (/^[0-9\s—–·×+%$.,/:()−-]+$/.test(text)) continue;
    if (/^\$[\d.]+\s*USD$/.test(text)) continue;
    // Ignorar spans contenedores de emojis/iconos o texto solo técnico
    if (/[áéíóúñÁÉÍÓÚÑ¡¿]|\b(de|la|el|en|por|con|para|tu|tus|ver|activar|cuenta|plan|amigos|gratis|mensual|anual|pago|red|código|derechos|cargando|pendientes|activados|incluido)\b/i.test(text)) {
      offenders.push(`<${tag}> "${text.slice(0, 50)}"`);
    }
  }
  assert.equal(
    offenders.length,
    0,
    `[i18n-guard] ${htmlFile} tiene elementos visibles sin data-i18n: ${offenders.join(', ')}`
  );
}

// 6. Cero textos en español hardcodeados fuera de wt()/tt()/tr() en módulos JS completamente localizados
const STRICT_JS_MODULES = [
  { file: 'ui/welcome-ui.js', startMarker: null },
  { file: 'ui/techtree-ui.js', startMarker: null },
  { file: 'ui/tactical-ui.js', startMarker: 'function renderRecentMatchesList(' },
];
const CALL_STRIP_RE = /\b(?:wt|tt|trT|tr|AppI18n\.t)\(\s*(?:(['"`])[^'"`]+\1|[a-zA-Z_$][\w.$]*)\s*,\s*(['"`])(?:\\.|(?!\2).)*\2/g;
const STRICT_ES_RE = /[áéíóúñÁÉÍÓÚÑ¡¿]/;
for (const { file: rel, startMarker } of STRICT_JS_MODULES) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/);
  const startIdx = startMarker ? lines.findIndex((l) => l.includes(startMarker)) : 0;
  assert.ok(startIdx >= 0, `[i18n-guard] No se encontró marcador "${startMarker}" en ${rel}`);
  const jsOffenders = [];
  let inBlock = false;
  lines.forEach((raw, idx) => {
    if (idx < startIdx) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (inBlock) { if (trimmed.includes('*/')) inBlock = false; return; }
    if (trimmed.startsWith('/*')) { if (!trimmed.includes('*/')) inBlock = true; return; }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    const code = trimmed.replace(/\s+\/\/.*$/, '');
    // Permitir lookup tables de mapeo (GOLD_RANK_KEYS, NEWS_TAG_META, locCx*, periodLabel === 'Últimos 7 días')
    if (/GOLD_RANK_KEYS|NEWS_TAG_META|periodLabel\s*===|fallback:\s*'|CX_.*_(?:KEYS|MAP)|'Señor|'Relámpago|'Titán|'Comandante|'Estratega Camaleón|'Mié'|'Sáb'|'Camaleón|'Señal|'Patrón|'GG Rápido|'Hasta el Último|'Rendición|'Asesino|s\.includes\(|includes\(['"](?:óptimo|sólido|atención|crítico)/i.test(code)) return;
    const stripped = code.replace(CALL_STRIP_RE, '');
    if (STRICT_ES_RE.test(stripped)) {
      jsOffenders.push(`${rel}:${idx + 1}: ${code.slice(0, 100)}`);
    }
  });
  assert.equal(
    jsOffenders.length,
    0,
    `[i18n-guard] ${rel} tiene cadenas en español sin pasar por i18n:\n  ${jsOffenders.slice(0, 15).join('\n  ')}`
  );
}

// 7. Render real de Central en zh-CN (con partidas, diagnósticos y descubrimientos reales) -> 0 fugas latinas/españolas
const vm = require('node:vm');
const i18nMod = require(path.join(ROOT, 'src', 'i18n', 'index.js'));
const { computeCentralAnalytics } = require(path.join(ROOT, 'src', 'central.js'));
const TacticalUI = require(path.join(ROOT, 'ui', 'tactical-ui.js'));

const zhBox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] }, console };
zhBox.window = zhBox;
zhBox.globalThis = zhBox;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'ui', 'i18n.js'), 'utf8'), zhBox);
zhBox.AppI18n.configure({ locale: 'zh-CN', allBundles: i18nMod.getAllBundles() });
TacticalUI.configure({ i18n: zhBox.AppI18n });

const nowTs = Date.now();
const simMatches = Array.from({ length: 24 }, (_, i) => ({
  matchId: String(700000 + i),
  startedAt: nowTs - (24 - i) * 3600_000 * 5,
  finishedAt: nowTs - (24 - i) * 3600_000 * 5 + 1600_000,
  durationSeconds: 1400 + (i % 5) * 380,
  leaderboardId: 3,
  mapName: i % 2 === 0 ? 'Arabia' : 'Coastal Forest',
  players: [
    { profileId: 99999, name: 'TestP', civ: i % 2 === 0 ? 'Franks' : 'Britons', color: (i % 8) + 1, rating: 1200 + i * 5, ratingDiff: i % 3 === 0 ? -14 : 16, team: 1, won: i % 3 !== 0 },
    { profileId: 88888, name: 'OppP', civ: 'Mongols', color: 2, rating: 1210 + i * 5, team: 2, won: i % 3 === 0 },
  ],
}));
const simCentral = computeCentralAnalytics({
  profileId: 99999,
  alias: 'TestP',
  matches1v1: simMatches,
  matchesAll: simMatches,
  matchesTeam: [],
  ladder1v1: { rating: 1320, highestRating: 1340, wins: 60, losses: 40, games: 100, rank: 8000, streak: 3 },
  insights1v1: simMatches.map((m, i) => ({
    matchId: m.matchId,
    mapName: m.mapName,
    duration: 2100 + (i % 4) * 500,
    myCiv: i % 2 === 0 ? 'Franks' : 'Britons',
    oppCiv: 'Mongols',
    won: i % 3 !== 0,
    meanEapm: 52 + (i % 10),
    oppMeanEapm: 44 + (i % 8),
    strategy: i % 2 === 0 ? 'Scout rush' : 'Fast castle',
    oppStrategy: 'Archer rush',
  })),
}, { profileId: 99999, alias: 'TestP', isOwnProfile: true });

const ZH_LEAK_RE = /[áéíóúñÁÉÍÓÚÑ¡¿]|\b(?:VICTORIA|DERROTA|PARTIDA|VIENDO|Estable|Volatil|Oscilante|Tu mejor|Mañana|Tarde|Noche|Madrugada|Últimas|previas|reloj de juego|partidas|replays|Tendencia|Rivales|Pickeaste|Jugada|Scout rush|Archer rush|Fast castle|Rush de|Global|drops|POCKET|FLANK|vs Rush|vs Boom|civs|Castillos|Feudal|Imperial|Muestra chica|Se necesitan)\b/i;
const zhLeaks = [];
for (const modeId of ['rm_1v1', 'global']) {
  for (const view of ['overview', 'mastery', 'intel']) {
    const html = TacticalUI.renderCentralDashboard(simCentral, { activeModeId: modeId, centralView: view, isUltra: true, planTier: 'ultra' });
    const text = html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, '\n');
    for (const raw of text.split('\n')) {
      const l = raw.trim();
      if (l && ZH_LEAK_RE.test(l)) zhLeaks.push(`${modeId}/${view}: ${l}`);
    }
  }
}
assert.equal(
  zhLeaks.length,
  0,
  `[i18n-guard] Render real de Central en zh-CN filtró ${zhLeaks.length} texto(s) sin traducir:\n  ${zhLeaks.slice(0, 15).join('\n  ')}`
);

console.log(`i18n-guard-test: OK (${LOCALES.length} locales × ${allKeys.size} claves · ${usedKeys.size} usadas · 0 faltantes · 0 textos duros · 0 fugas en render real zh-CN)`);
