'use strict';

/**
 * Genera src/civ-guide.js (dataset OFFLINE en español) a partir de los datos
 * públicos del árbol tecnológico de AoE2 DE:
 *
 *   https://github.com/SiegeEngineers/aoe2techtree
 *   - data/data.json + data/locales/es/strings.json + data/trees/*.json
 *   - chronicles/data/... (Aqueménidas, Atenienses, Macedonios, Purus,
 *     Espartanos, Tracios)
 *
 * De ahí salen, con texto REAL del juego y no inventado:
 *   name        nombre español de la civilización
 *   role        "Civilización de caballería", etc. (primera línea del help)
 *   bonuses     2 primeros bonos de civilización, recortados
 *   units       unidades únicas
 *   weaknesses  mejoras/unidades IMPORTANTES que la civ NO tiene (árbol tecnológico)
 *
 * Uso:  node tools/build-civ-guide.js
 * Requiere internet SOLO al generar; el overlay nunca consulta esta fuente.
 */

const fs = require('node:fs');
const path = require('node:path');

const RAW = 'https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master';
const OUT = path.join(__dirname, '..', 'src', 'civ-guide.js');

// Unidades / mejoras cuya ausencia realmente cambia cómo se juega la civ.
// Se listan por prioridad: primero líneas militares, después soporte.
const IMPACTFUL = [
  'Arbalester',
  'Cavalry Archer',
  'Hand Cannoneer',
  'Paladin',
  'Hussar',
  'Halberdier',
  'Champion',
  'Elite Skirmisher',
  'Siege Ram',
  'Siege Onager',
  'Bombard Cannon',
  'Bloodlines',
  'Blast Furnace',
  'Plate Mail Armor',
  'Bracer',
  'Thumb Ring',
  'Parthian Tactics',
  'Siege Engineers',
  'Redemption',
  'Faith',
  'Block Printing',
  'Theocracy',
  'Keep',
  'Bombard Tower',
  'Fast Fire Ship',
  'Elite Cannon Galleon',
];

// Etiquetas cortas en español para que "Sin X, Y ni Z" se lea de un vistazo.
const LABELS = {
  Arbalester: 'arbalestero',
  'Cavalry Archer': 'arqueros a caballo',
  'Hand Cannoneer': 'arcabuceros',
  Paladin: 'paladines',
  Hussar: 'húsares',
  Halberdier: 'alabarderos',
  Champion: 'campeones',
  'Elite Skirmisher': 'guerrilleros de élite',
  'Siege Ram': 'arietes de asedio',
  'Siege Onager': 'onagros de asedio',
  'Bombard Cannon': 'cañones de bombardeo',
  Bloodlines: 'pureza de sangre',
  'Blast Furnace': 'alto horno',
  'Plate Mail Armor': 'armadura de placas',
  Bracer: 'brazal',
  'Thumb Ring': 'dactilera',
  'Parthian Tactics': 'tácticas de los partias',
  'Siege Engineers': 'ingenieros de asedio',
  Redemption: 'redención',
  Faith: 'fe',
  'Block Printing': 'imprenta',
  Theocracy: 'teocracia',
  Keep: 'fortaleza',
  'Bombard Tower': 'torres de bombardeo',
  'Fast Fire Ship': 'naves de fuego rápidas',
  'Elite Cannon Galleon': 'galeones artillados de élite',
};

function cleanLines(raw) {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?b>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanInline(raw) {
  return cleanLines(raw)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text, max) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.55 ? cut.slice(0, space) : cut).replace(/[,;:.]+$/, '') + '…';
}

function joinSpanish(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ni ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ni ${items[items.length - 1]}`;
}

function parseHelp(help) {
  const lines = cleanLines(help);
  const unitHeader = lines.findIndex((line) => /^Unidad(?:es)? únic(?:a|as)\s*:/i.test(line));
  const stop = unitHeader >= 0 ? unitHeader : lines.length;

  const header = lines[0] && !lines[0].startsWith('•') ? lines[0] : '';
  const bullets = lines
    .slice(header ? 1 : 0, stop)
    .filter((line) => line.startsWith('•'))
    .map((line) => line.replace(/^•\s*/, '').replace(/[.;]+$/, '').trim());

  // Unidades únicas: una o varias líneas hasta el próximo encabezado.
  const unitLines = [];
  if (unitHeader >= 0) {
    for (let i = unitHeader + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^(Tecnologías únicas|Técnicas únicas|Bonificación de equipo)\s*:/i.test(line)) break;
      if (line.startsWith('•') || /única/i.test(line)) continue;
      unitLines.push(line);
    }
  }
  const units = unitLines
    .join(' ')
    .split(/[,;]/)
    .map((part) => part.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => shorten(name, 30));

  return {
    role: shorten(header || 'Civilización', 44),
    bonuses: bullets.length
      ? bullets.slice(0, 2).map((b) => shorten(b, 54)).join(' · ')
      : 'Bonos propios de la civilización.',
    units: units.length ? units.join(' · ') : 'Unidad única del castillo.',
  };
}

function parseWeaknesses(tree, strings) {
  const missing = (tree.units_techs || []).filter((node) => node.node_status === 'NotAvailable');
  const labels = [];
  for (const wanted of IMPACTFUL) {
    const node = missing.find((item) => item.name === wanted);
    if (!node) continue;
    const label = LABELS[wanted] || cleanInline(strings[String(node.name_string_id)] || node.name).toLowerCase();
    if (label && !labels.includes(label)) labels.push(shorten(label, 30));
    if (labels.length === 3) break;
  }
  return labels.length
    ? `Sin ${joinSpanish(labels)}`
    : 'Sin carencias militares graves.';
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'aoe2-elo-overlay/civ-guide-builder' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

/** Pool chico para no saturar GitHub con 62 requests en paralelo. */
async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        out[index] = await worker(items[index], index);
      }
    }),
  );
  return out;
}

function jsString(value) {
  return JSON.stringify(String(value ?? ''));
}

async function main() {
  console.log('descargando datos del árbol tecnológico…');
  const [base, baseEs, chron, chronEs] = await Promise.all([
    getJson(`${RAW}/data/data.json`),
    getJson(`${RAW}/data/locales/es/strings.json`),
    getJson(`${RAW}/chronicles/data/data.json`),
    getJson(`${RAW}/chronicles/data/locales/es/strings.json`),
  ]);

  const entries = [
    ...Object.entries(base.civs).map(([name, civ]) => ({ name, civ, strings: baseEs, treeBase: 'data' })),
    ...Object.entries(chron.civs).map(([name, civ]) => ({ name, civ, strings: chronEs, treeBase: 'chronicles/data' })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'en'));

  console.log(`${entries.length} civilizaciones · descargando árboles…`);
  const trees = await mapPool(entries, 8, async (entry) => {
    const file = `${entry.name.toUpperCase()}.json`;
    return getJson(`${RAW}/${entry.treeBase}/trees/${file}`);
  });

  const guide = {};
  entries.forEach((entry, index) => {
    const { name, civ, strings } = entry;
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const parsed = parseHelp(strings[String(civ.help_string_id)]);
    const civName = cleanInline(strings[String(civ.name_string_id)] || name);
    guide[slug] = {
      name: civName,
      role: parsed.role,
      bonuses: parsed.bonuses,
      units: parsed.units,
      weaknesses: parseWeaknesses(trees[index], strings),
    };
  });

  const lines = Object.entries(guide).map(
    ([slug, info]) =>
      `  ${/^[a-z][a-z0-9]*$/.test(slug) ? slug : JSON.stringify(slug)}: { ` +
      `name: ${jsString(info.name)}, role: ${jsString(info.role)}, ` +
      `bonuses: ${jsString(info.bonuses)}, units: ${jsString(info.units)}, ` +
      `weaknesses: ${jsString(info.weaknesses)} },`,
  );

  const source = `'use strict';

/**
 * Guía rápida de civilizaciones (español), 100 % OFFLINE.
 *
 * Generada por tools/build-civ-guide.js a partir de los datos públicos del
 * árbol tecnológico de AoE2 DE (SiegeEngineers/aoe2techtree): textos del juego
 * en español para nombre/rol/bonos/unidades únicas, y el árbol de cada civ para
 * las "debilidades" (mejoras y unidades que NO tiene). No se consulta la red en
 * runtime: el overlay muestra esto apenas arranca la partida, sin depender de
 * ningún servicio externo.
 *
 * Para actualizar (solo con internet, en desarrollo): node tools/build-civ-guide.js
 */

const CIV_GUIDE = {
${lines.join('\n')}
};

module.exports = { CIV_GUIDE };
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, source, 'utf8');
  console.log(`listo: ${OUT} · ${Object.keys(guide).length} civilizaciones · ${source.length} bytes`);
  console.log('ejemplo francos:', JSON.stringify(guide.franks));
}

main().catch((err) => {
  console.error(`falló la generación: ${err.stack || err.message}`);
  process.exitCode = 1;
});
