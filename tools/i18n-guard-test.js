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
  ...fs.readdirSync(path.join(ROOT, 'ui')).filter((f) => f.endsWith('.js')).map((f) => path.join('ui', f)),
];
const usedKeys = new Set();
for (const rel of scanFiles) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-[a-z]+)?="([a-zA-Z0-9_.-]+)"/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/\b(?:AppI18n\.t|wt|i18n\.t)\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g)) usedKeys.add(m[1]);
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

// 5. Elementos interactivos con texto español en HTML deben llevar data-i18n
const BRAND_ALLOWLIST = new Set(['Free', 'Pro', 'Ultra', 'Relic', 'Relic Ultra', 'USDC', 'USDT', 'ELO', '1v1', 'Team']);
for (const htmlFile of ['settings.html', 'index.html']) {
  const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  const offenders = [];
  for (const m of html.matchAll(/<(h1|h2|h3|h4|button|label|summary|legend)([^>]*)>([^<]+)<\/\1>/g)) {
    const [, tag, attrs, rawText] = m;
    const text = rawText.trim();
    if (!text || text.length < 3 || BRAND_ALLOWLIST.has(text)) continue;
    if (/data-i18n/.test(attrs)) continue;
    if (/^[0-9\s—–·×+%$.,/-]+$/.test(text)) continue;
    offenders.push(`<${tag}> "${text.slice(0, 50)}"`);
  }
  assert.equal(
    offenders.length,
    0,
    `[i18n-guard] ${htmlFile} tiene elementos sin data-i18n: ${offenders.join(', ')}`
  );
}

console.log(`i18n-guard-test: OK (${LOCALES.length} locales × ${allKeys.size} claves · ${usedKeys.size} usadas · 0 faltantes · 0 textos duros en HTML)`);
