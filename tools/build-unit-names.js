'use strict';

/**
 * Genera `src/engine/unit-names.json` a partir de dos fuentes autoritativas:
 *
 *   1. el dataset de datos del juego (aoe2techtree) → `LanguageNameId` y
 *      `TrainTime` de cada unidad y edificio;
 *   2. los archivos de texto del propio juego → el nombre visible de cada
 *      `LanguageNameId`.
 *
 * El resultado se embebe en el repositorio, así que la aplicación nunca
 * depende de la instalación del juego ni de la red para nombrar una unidad.
 *
 * Uso:
 *   node tools/build-unit-names.js [dataset.json] [strings-del-juego.txt]
 */

const fs = require('node:fs');
const path = require('node:path');

const DATASET = process.argv[2] || path.join(__dirname, '..', '.tmp-aoe2data', 'aoe2data.json');
const STRINGS = process.argv[3] ||
  path.join(process.env.AOE2DE_PATH || 'D:/Steam/steamapps/common/AoE2DE',
    'resources', 'es', 'strings', 'key-value', 'key-value-strings-utf8.txt');
const OUTPUT = path.join(__dirname, '..', 'src', 'engine', 'unit-names.json');

const VILLAGER_IDS = new Set([83, 293]);

// Ids que las repeticiones usan y que el dataset no publica. Se declaran acá
// para que ningún nombre quede sin mapear; los dos aldeanos comparten etiqueta.
const EXTRA_UNITS = {
  293: { name: 'Aldeano', key: 'aldeano', trainSeconds: 25 },
};

function slug(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Los dos aldeanos comparten etiqueta: se reportan juntos. */
function displayName(text) {
  return text.replace(/\s*\((hombre|mujer)\)\s*$/i, '');
}

function parseStrings(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^(\d+)\s+"(.*)"\s*$/.exec(line.trim());
    if (match) map.set(Number(match[1]), match[2].replace(/\s+/g, ' ').trim());
  }
  return map;
}

function main() {
  if (!fs.existsSync(DATASET)) {
    console.error(`Falta el dataset: ${DATASET}`);
    process.exit(2);
  }
  if (!fs.existsSync(STRINGS)) {
    console.error(`Faltan los textos del juego: ${STRINGS}\nPasá la ruta como segundo argumento o definí AOE2DE_PATH.`);
    process.exit(2);
  }
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8')).data;
  const strings = parseStrings(STRINGS);

  const unmapped = [];
  const build = (section, collection) => {
    const output = {};
    for (const [id, entry] of Object.entries(collection)) {
      const languageId = entry.LanguageNameId;
      const raw = strings.get(languageId);
      if (!raw) {
        unmapped.push(`${section}:${id} (string ${languageId})`);
        continue;
      }
      const name = VILLAGER_IDS.has(Number(id)) ? displayName(raw) : raw;
      const record = { name, key: slug(name) };
      if (Number.isFinite(entry.TrainTime) && entry.TrainTime > 0) record.trainSeconds = entry.TrainTime;
      output[id] = record;
    }
    return output;
  };

  const units = build('unit', dataset.Unit);
  for (const [id, entry] of Object.entries(EXTRA_UNITS)) {
    if (!units[id]) units[id] = { ...entry };
  }
  const buildings = build('building', dataset.Building);

  const payload = {
    meta: {
      generatedBy: 'tools/build-unit-names.js',
      dataset: 'aoe2techtree.net/data/data.json',
      names: path.basename(STRINGS),
      units: Object.keys(units).length,
      buildings: Object.keys(buildings).length,
    },
    units,
    buildings,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Escrito ${OUTPUT}: ${payload.meta.units} unidades, ${payload.meta.buildings} edificios.`);
  if (unmapped.length) {
    console.error(`Sin nombre (${unmapped.length}): ${unmapped.slice(0, 12).join(', ')}`);
    process.exit(1);
  }
}

main();
