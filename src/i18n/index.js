'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { civSlug } = require('../civs');

const SUPPORTED_LOCALES = Object.freeze(['en', 'es-ES', 'es-MX', 'zh-CN']);
const DEFAULT_LOCALE = 'es-MX';

const LOCALES = {};
for (const code of SUPPORTED_LOCALES) {
  LOCALES[code] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'locales', `${code}.json`), 'utf8')
  );
}

const GAME_TERMS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'game-terms.json'), 'utf8')
);

// Índice rápido por nombre en inglés o español para resolver unidades/edificios/mapas
const UNIT_BY_NAME = new Map();
for (const [id, entry] of Object.entries(GAME_TERMS.units || {})) {
  for (const val of Object.values(entry)) {
    const k = normKey(val);
    if (k && !UNIT_BY_NAME.has(k)) UNIT_BY_NAME.set(k, id);
  }
}

const BUILDING_BY_NAME = new Map();
for (const [id, entry] of Object.entries(GAME_TERMS.buildings || {})) {
  for (const val of Object.values(entry)) {
    const k = normKey(val);
    if (k && !BUILDING_BY_NAME.has(k)) BUILDING_BY_NAME.set(k, id);
  }
}

function normKey(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function normalizeLocale(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'en' || s.startsWith('en-')) return 'en';
  if (s === 'es-es') return 'es-ES';
  if (s === 'es-mx' || s === 'es-419' || s === 'es-ar' || s === 'es') return 'es-MX';
  if (s === 'zh' || s === 'zh-cn' || s === 'zh-hans' || s.startsWith('zh-')) return 'zh-CN';
  return null;
}

function getLocale(code) {
  return normalizeLocale(code) || DEFAULT_LOCALE;
}

function lookupPath(obj, dotPath) {
  let cur = obj;
  for (const part of String(dotPath || '').split('.')) {
    if (!cur || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function t(key, vars = null, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  let val = lookupPath(LOCALES[lang], key);
  if (val == null) val = lookupPath(LOCALES.en, key);
  if (typeof val !== 'string') return String(key);
  if (vars && typeof vars === 'object') {
    val = val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  }
  return val;
}

function civName(raw, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  const slug = civSlug(raw);
  if (slug && GAME_TERMS.civs?.[slug]?.[lang]) return GAME_TERMS.civs[slug][lang];
  return raw ? String(raw) : '';
}

function unitName(idOrName, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  const keyStr = String(idOrName ?? '');
  if (GAME_TERMS.units?.[keyStr]?.[lang]) return GAME_TERMS.units[keyStr][lang];
  const matchedId = UNIT_BY_NAME.get(normKey(keyStr));
  if (matchedId && GAME_TERMS.units?.[matchedId]?.[lang]) return GAME_TERMS.units[matchedId][lang];
  return keyStr;
}

function buildingName(idOrKeyOrName, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  const keyStr = String(idOrKeyOrName ?? '');
  if (GAME_TERMS.keyBuildings?.[keyStr]?.[lang]) return GAME_TERMS.keyBuildings[keyStr][lang];
  if (GAME_TERMS.buildings?.[keyStr]?.[lang]) return GAME_TERMS.buildings[keyStr][lang];
  const matchedId = BUILDING_BY_NAME.get(normKey(keyStr));
  if (matchedId && GAME_TERMS.buildings?.[matchedId]?.[lang]) return GAME_TERMS.buildings[matchedId][lang];
  return keyStr;
}

function ageName(ageKey, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  return GAME_TERMS.ages?.[ageKey]?.[lang] || String(ageKey || '');
}

function resourceName(resKey, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  return GAME_TERMS.resources?.[resKey]?.[lang] || String(resKey || '');
}

function mapName(raw, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  const k = normKey(raw);
  return GAME_TERMS.maps?.[k]?.[lang] || String(raw || '');
}

function openingName(raw, locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  const dict = LOCALES[lang]?.openings || {};
  if (raw && Object.hasOwn(dict, raw)) return dict[raw];
  return String(raw || '');
}

function getBundle(locale = DEFAULT_LOCALE) {
  const lang = getLocale(locale);
  return {
    locale: lang,
    supported: SUPPORTED_LOCALES.map((c) => LOCALES[c].meta),
    strings: LOCALES[lang],
    gameTerms: {
      ages: Object.fromEntries(Object.entries(GAME_TERMS.ages).map(([k, v]) => [k, v[lang]])),
      resources: Object.fromEntries(Object.entries(GAME_TERMS.resources).map(([k, v]) => [k, v[lang]])),
      keyBuildings: Object.fromEntries(Object.entries(GAME_TERMS.keyBuildings).map(([k, v]) => [k, v[lang]])),
      civs: Object.fromEntries(Object.entries(GAME_TERMS.civs).map(([k, v]) => [k, v[lang]])),
      maps: Object.fromEntries(Object.entries(GAME_TERMS.maps).map(([k, v]) => [k, v[lang]])),
      units: Object.fromEntries(Object.entries(GAME_TERMS.units).map(([k, v]) => [k, v[lang]])),
      buildings: Object.fromEntries(Object.entries(GAME_TERMS.buildings).map(([k, v]) => [k, v[lang]])),
    },
  };
}

function getAllBundles() {
  const out = {};
  for (const code of SUPPORTED_LOCALES) out[code] = getBundle(code);
  return out;
}

module.exports = {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALES,
  GAME_TERMS,
  normalizeLocale,
  getLocale,
  t,
  civName,
  unitName,
  buildingName,
  ageName,
  resourceName,
  mapName,
  openingName,
  getBundle,
  getAllBundles,
};
