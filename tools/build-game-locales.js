'use strict';

/**
 * Extrae los nombres oficiales del juego (unidades, edificios, civilizaciones,
 * edades, recursos y mapas) directamente desde los archivos de localización de
 * Age of Empires II: Definitive Edition para:
 *   - en     (English)
 *   - es-ES  (Español de España · carpeta `es`)
 *   - es-MX  (Español de México · carpeta `mx`)
 *   - zh-CN  (Chino simplificado · carpeta `zh`)
 *
 * Genera `src/i18n/game-terms.json` embebido en la app (sin depender del juego
 * ni de la red en tiempo de ejecución).
 */

const fs = require('node:fs');
const path = require('node:path');
const { CIV_SLUGS } = require('../src/civs');

const GAME_DIR = process.env.AOE2DE_PATH || 'D:/Steam/steamapps/common/AoE2DE';
const UNIT_NAMES_PATH = path.join(__dirname, '..', 'src', 'engine', 'unit-names.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'i18n', 'game-terms.json');

const LOCALE_DIRS = {
  en: 'en',
  'es-ES': 'es',
  'es-MX': 'mx',
  'zh-CN': 'zh',
};

function parseStrings(locDir) {
  const file = path.join(GAME_DIR, 'resources', locDir, 'strings', 'key-value', 'key-value-strings-utf8.txt');
  if (!fs.existsSync(file)) throw new Error(`Falta archivo de idioma AoE2DE: ${file}`);
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^(\d+)\s+"(.*)"\s*$/.exec(line.trim());
    if (match) map.set(Number(match[1]), match[2].replace(/\s+/g, ' ').trim());
  }
  return map;
}

function cleanDisplay(text) {
  return String(text || '')
    .replace(/\s*[\(（](hombre|mujer|male|female|男性|女性|男|女)[\)）]\s*$/i, '')
    .trim();
}

function norm(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function main() {
  const tables = {};
  for (const [code, dir] of Object.entries(LOCALE_DIRS)) {
    tables[code] = parseStrings(dir);
  }
  const en = tables.en;
  const es = tables['es-ES'];

  // Índice inverso en `es` (exacto y limpio) para localizar el stringId oficial de cada unidad/edificio
  const esByName = new Map();
  for (const [id, text] of es) {
    const cleaned = cleanDisplay(text);
    for (const candidate of [text, cleaned]) {
      const k = candidate.toLowerCase();
      if (!esByName.has(k)) esByName.set(k, []);
      esByName.get(k).push(id);
    }
  }

  // Índice inverso en `en` por nombre normalizado (para civs, edades, recursos y mapas)
  const enByNorm = new Map();
  for (const [id, text] of en) {
    const k = norm(text);
    if (!k) continue;
    if (!enByNorm.has(k)) enByNorm.set(k, []);
    enByNorm.get(k).push(id);
  }

  // Prioriza IDs del bloque estándar de nombres de unidad/edificio en AoE2 DE (5000..5999, 19000..22000)
  function pickBestUnitId(ids) {
    if (!ids || !ids.length) return null;
    const score = (id) => {
      if (id >= 5000 && id < 6000) return 0;
      if (id >= 19000 && id < 22000) return 1;
      if (id >= 5000 && id < 10000) return 2;
      return 3;
    };
    return [...ids].sort((a, b) => score(a) - score(b) || a - b)[0];
  }

  function quad(id, clean = true) {
    const out = {};
    for (const code of Object.keys(LOCALE_DIRS)) {
      const raw = tables[code].get(id);
      out[code] = clean ? cleanDisplay(raw || tables.en.get(id) || '') : (raw || tables.en.get(id) || '');
    }
    return out;
  }

  const unitData = JSON.parse(fs.readFileSync(UNIT_NAMES_PATH, 'utf8'));

  // 1) Unidades (por ID numérico de AoE2)
  const units = {};
  let unitMatched = 0;
  let unitMissed = 0;
  for (const [uid, info] of Object.entries(unitData.units || {})) {
    const ids = esByName.get(String(info.name || '').toLowerCase());
    const strId = pickBestUnitId(ids);
    if (strId != null) {
      units[uid] = quad(strId, true);
      unitMatched++;
    } else {
      unitMissed++;
      units[uid] = { en: info.name, 'es-ES': info.name, 'es-MX': info.name, 'zh-CN': info.name };
    }
  }

  // 2) Edificios (por ID numérico de AoE2)
  const buildings = {};
  let bldMatched = 0;
  let bldMissed = 0;
  for (const [bid, info] of Object.entries(unitData.buildings || {})) {
    const ids = esByName.get(String(info.name || '').toLowerCase());
    const strId = pickBestUnitId(ids);
    if (strId != null) {
      buildings[bid] = quad(strId, true);
      bldMatched++;
    } else {
      bldMissed++;
      buildings[bid] = { en: info.name, 'es-ES': info.name, 'es-MX': info.name, 'zh-CN': info.name };
    }
  }

  // 3) Civilizaciones (rango oficial de nombres de civ en AoE2 DE: 10271..10450 y fallback exacto en EN)
  // En AoE2 DE los strings oficiales en inglés usan "Maya" e "Inca" (singular) para los slugs mayans/incas.
  const CIV_EN_LOOKUP = { mayans: 'maya', incas: 'inca' };
  const civs = {};
  let civMatched = 0;
  for (const slug of CIV_SLUGS) {
    const ids = enByNorm.get(slug) || enByNorm.get(CIV_EN_LOOKUP[slug]) || [];
    const civId = [...ids].sort((a, b) => {
      const rank = (id) => (id >= 10270 && id <= 10450 ? 0 : id >= 10200 && id <= 11000 ? 1 : 2);
      return rank(a) - rank(b) || a - b;
    })[0];
    if (civId != null) {
      civs[slug] = quad(civId, false);
      civMatched++;
    } else {
      const cap = slug.charAt(0).toUpperCase() + slug.slice(1);
      civs[slug] = { en: cap, 'es-ES': cap, 'es-MX': cap, 'zh-CN': cap };
    }
  }

  // 4) Edades (IDs oficiales AoE2 DE: 4201 Dark Age, 4202 Feudal Age, 4203 Castle Age, 4204 Imperial Age)
  function findExactEn(target, preferRange) {
    const ids = enByNorm.get(norm(target)) || [];
    if (!ids.length) return null;
    if (preferRange) {
      const inRange = ids.find((id) => id >= preferRange[0] && id <= preferRange[1]);
      if (inRange != null) return inRange;
    }
    return ids[0];
  }

  const ages = {
    dark: quad(findExactEn('Dark Age', [4200, 4210]) || 4201, false),
    feudal: quad(findExactEn('Feudal Age', [4200, 4210]) || 4202, false),
    castle: quad(findExactEn('Castle Age', [4200, 4210]) || 4203, false),
    imperial: quad(findExactEn('Imperial Age', [4200, 4210]) || 4204, false),
  };

  // 5) Recursos (Food, Wood, Gold, Stone)
  const resources = {
    food: quad(findExactEn('Food', [10000, 10600]) || findExactEn('Food'), false),
    wood: quad(findExactEn('Wood', [10000, 10600]) || findExactEn('Wood'), false),
    gold: quad(findExactEn('Gold', [10000, 10600]) || findExactEn('Gold'), false),
    stone: quad(findExactEn('Stone', [10000, 10600]) || findExactEn('Stone'), false),
  };

  // 6) Edificios clave por slug semántico (para Postmatch / Prematch)
  const keyBuildings = {
    town_center: buildings['109'] || buildings['71'],
    barracks: buildings['12'],
    archery_range: buildings['87'],
    stable: buildings['101'],
    siege_workshop: buildings['49'],
    castle: buildings['82'],
    monastery: buildings['104'],
    market: buildings['84'],
    blacksmith: buildings['103'],
    dock: buildings['45'],
    university: buildings['209'],
    mill: buildings['68'],
    house: buildings['70'],
    farm: buildings['50'],
    watch_tower: buildings['79'],
    krepost: buildings['1251'] || quad(findExactEn('Krepost', [5000, 6500]) || findExactEn('Krepost'), true),
    donjon: buildings['1665'] || quad(findExactEn('Donjon', [5000, 6500]) || findExactEn('Donjon'), true),
  };

  // 7) Mapas frecuentes de RM 1v1 y Team Games (extraídos del rango de mapas 10875..10999 o exact EN)
  const COMMON_MAPS = [
    'Arabia', 'Arena', 'Black Forest', 'Nomad', 'Islands', 'Four Lakes', 'Gold Rush',
    'Hideout', 'MegaRandom', 'Runestones', 'Socotra', 'Coastal', 'Continental', 'Highland',
    'Mediterranean', 'Migration', 'Mongolia', 'Oasis', 'Rivers', 'Salt Marsh', 'Scandinavia',
    'Team Islands', 'Yucatan', 'Acropolis', 'African Clearing', 'Baltic', 'Cenotes',
    'Enclosed', 'Fortress', 'Ghost Lake', 'Golden Pit', 'Haboob', 'Hamburger', 'Kawasan',
    'Land Nomad', 'Lombardia', 'Lowland', 'Michi', 'Mountain Pass', 'Nile Delta',
    'Northern Isles', 'Steppe', 'Valley', 'Wade',
  ];
  const maps = {};
  for (const mName of COMMON_MAPS) {
    const id = findExactEn(mName, [10850, 11100]) || findExactEn(mName, [10000, 13000]) || findExactEn(mName);
    if (id != null) maps[norm(mName)] = quad(id, false);
  }

  const output = {
    meta: {
      generatedBy: 'tools/build-game-locales.js',
      source: 'AoE2DE official key-value-strings-utf8.txt (en, es, mx, zh)',
      locales: ['en', 'es-ES', 'es-MX', 'zh-CN'],
      counts: {
        units: Object.keys(units).length,
        buildings: Object.keys(buildings).length,
        civs: Object.keys(civs).length,
        maps: Object.keys(maps).length,
      },
    },
    ages,
    resources,
    keyBuildings,
    civs,
    maps,
    units,
    buildings,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(`Generated ${OUTPUT_PATH}`);
  console.log(`Units matched: ${unitMatched}/${unitMatched + unitMissed} | Buildings matched: ${bldMatched}/${bldMatched + bldMissed} | Civs matched: ${civMatched}/${CIV_SLUGS.length} | Maps: ${Object.keys(maps).length}`);
  console.log('--- Verification samples (EN | es-ES | es-MX | zh-CN) ---');
  for (const [label, obj] of [
    ['Dark Age', ages.dark],
    ['Feudal Age', ages.feudal],
    ['Castle Age', ages.castle],
    ['Imperial Age', ages.imperial],
    ['Food', resources.food],
    ['Wood', resources.wood],
    ['Gold', resources.gold],
    ['Stone', resources.stone],
    ['Town Center', keyBuildings.town_center],
    ['Barracks', keyBuildings.barracks],
    ['Archery Range', keyBuildings.archery_range],
    ['Stable', keyBuildings.stable],
    ['Siege Workshop', keyBuildings.siege_workshop],
    ['Knight (38)', units['38']],
    ['Skirmisher (7)', units['7']],
    ['Spearman (93)', units['93']],
    ['Scout Cavalry (448)', units['448']],
    ['Villager (83)', units['83']],
    ['Franks', civs.franks],
    ['Britons', civs.britons],
    ['Mayans', civs.mayans],
    ['Chinese', civs.chinese],
    ['Arabia', maps.arabia],
    ['Black Forest', maps.blackforest],
  ]) {
    if (obj) console.log(`  ${label.padEnd(20)} => ${obj.en} | ${obj['es-ES']} | ${obj['es-MX']} | ${obj['zh-CN']}`);
  }
}

main();
