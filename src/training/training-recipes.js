'use strict';

/**
 * Relic · Entrenamiento (Beta) — Catálogo de Órdenes de Construcción (100 % español oficial AoE2:DE)
 *
 * Aislado de `src/build-orders.js` (que pertenece al overlay en partida) para cero regresiones.
 * Valida compatibilidad real contra `src/civ-tech.json` y cruza medianas reales desde replays locales.
 */

const CIV_TECH = require('../civ-tech.json').civilizations || {};
const { CIV_GUIDE } = require('../civ-guide');

const CIV_CAVEATS = {
  huns: 'Hunos no construye Casas: reasigná esa madera a economía o producción militar temprana.',
  khmer: 'Jemeres avanza de edad sin edificios requisito: podés saltar el Cuartel si elegís juego económico.',
  chinese: 'Chinos arranca con +3 Aldeanos y −200 de comida: investigá Telar de inicio y priorizá ovejas rápido.',
  mayans: 'Mayas arranca con +1 Aldeano y tope inicial 5/5: construí Casa al instante con los primeros aldeanos.',
  bulgarians: 'Búlgaros mejora Milicia a Hombres de armas gratis al llegar a Edad Feudal.',
  georgians: 'Georgianos inicia con Carro de mulas: ahorrás la madera del primer Campamento maderero.',
  armenians: 'Armenios usa Carro de mulas para madera y minería: ajustá tu madera inicial.',
  gurjaras: 'Gurjaras guarda el ganado en el Molino: construí Molino temprano y buscá bayas antes.',
  malay: 'Malayos avanza de edad un 66 % más rápido: sumá +2 aldeanos antes de hacer clic.',
  italians: 'Italianos paga menos por avanzar de edad: podés subir 1 aldeano antes en mapas abiertos.',
};

const RECIPES = [
  {
    key: 'scouts-20pop',
    name: 'Caballería de exploración (20 de población)',
    shortName: 'Caballería de exploración',
    mapName: 'Arabia',
    mapSlug: 'arabia',
    artClass: 'opening-art-scouts',
    difficulty: 'Esencial',
    targetFeudalSec: 580,
    targetCastleSec: 1110,
    requiredNodes: ['Scout Cavalry'],
    matchOpenings: ['scout', 'exploraci', 'caballería de exploración'],
    summary: 'Presión temprana y control de mapa en mapas abiertos manteniendo la producción de Aldeanos sin pausa.',
    steps: [
      { pop: '04/05', gameSec: 0, age: 1, title: 'Construí 2 Casas y enviá 6 Aldeanos a ovejas', note: 'Poné Aldeanos en cola desde el segundo 0 y explorá en espiral.', alloc: { food: 6, wood: 0, gold: 0, stone: 0 }, icons: ['villager', 'sheep'] },
      { pop: '10/15', gameSec: 100, age: 1, title: 'Campamento maderero con 3 Aldeanos', note: 'Elegí la línea de madera trasera más segura.', alloc: { food: 6, wood: 3, gold: 0, stone: 0 }, icons: ['wood', 'villager'] },
      { pop: '12/15', gameSec: 175, age: 1, title: 'Atraé el primer jabalí al Centro Urbano', note: 'Con el aldeano #11 dispará dos flechas y guarnecé si baja la vida.', alloc: { food: 8, wood: 3, gold: 0, stone: 0 }, icons: ['boar', 'food'] },
      { pop: '15/20', gameSec: 260, age: 1, title: 'Molino en bayas (4 Aldeanos) y segundo jabalí', note: 'Sumá 2 granjas tempranas cuando se agoten las ovejas.', alloc: { food: 11, wood: 3, gold: 0, stone: 0 }, icons: ['berries', 'food'] },
      { pop: '19/20', gameSec: 400, age: 1, title: 'Investigá Telar y ordená Edad Feudal', note: 'Al hacer clic pasá a 10 en madera (2 Campamentos) y construí Cuarteles.', alloc: { food: 9, wood: 10, gold: 0, stone: 0 }, icons: ['barracks', 'wood'] },
      { pop: '20/25', gameSec: 580, age: 2, title: 'Al llegar a Feudal: Establo + Hacha de doble filo', note: 'Entrená 3–4 de Caballería de exploración y sumá granjas con cada 60 de madera.', alloc: { food: 9, wood: 10, gold: 0, stone: 0 }, icons: ['stable', 'scout'] },
      { pop: '26/30', gameSec: 730, age: 2, title: 'Collera + Herrería y cierre de muros', note: 'Si el rival saca Lanceros, prepará transición a Guerrilleros o paso a Castillos.', alloc: { food: 13, wood: 10, gold: 2, stone: 0 }, icons: ['blacksmith', 'food'] },
    ],
  },
  {
    key: 'archers-21pop',
    name: 'Arqueros en Edad Feudal (21 de población)',
    shortName: 'Arqueros en Feudal',
    mapName: 'Arabia',
    mapSlug: 'arabia',
    artClass: 'opening-art-archers',
    difficulty: 'Esencial',
    targetFeudalSec: 605,
    targetCastleSec: 1150,
    requiredNodes: ['Archer', 'Crossbowman'],
    matchOpenings: ['archer', 'arquero'],
    summary: 'Doble Galería de tiro con arco con Emplumado de flechas temprano y presión sostenida sobre madera y oro.',
    steps: [
      { pop: '04/05', gameSec: 0, age: 1, title: 'Construí 2 Casas y enviá 6 Aldeanos a ovejas', note: 'Sin pausas en el Centro Urbano.', alloc: { food: 6, wood: 0, gold: 0, stone: 0 }, icons: ['villager', 'sheep'] },
      { pop: '11/15', gameSec: 110, age: 1, title: 'Campamento maderero con 4 Aldeanos', note: 'Necesitás madera fluida para doble Galería de tiro con arco.', alloc: { food: 6, wood: 4, gold: 0, stone: 0 }, icons: ['wood', 'villager'] },
      { pop: '15/20', gameSec: 215, age: 1, title: 'Jabalíes y Molino en bayas (4 Aldeanos)', note: 'Asegurá comida continua hasta los 21 de población.', alloc: { food: 10, wood: 4, gold: 0, stone: 0 }, icons: ['boar', 'berries'] },
      { pop: '21/25', gameSec: 475, age: 1, title: 'Telar, clic a Edad Feudal y 4 Aldeanos a oro', note: 'Construí Cuartel y Campamento minero en oro durante el avance.', alloc: { food: 6, wood: 10, gold: 4, stone: 0 }, icons: ['gold', 'barracks'] },
      { pop: '21/25', gameSec: 605, age: 2, title: '2 Galerías de tiro con arco + Hacha de doble filo', note: 'Entrená Arqueros constantes en ambas Galerías.', alloc: { food: 6, wood: 10, gold: 4, stone: 0 }, icons: ['archer', 'wood'] },
      { pop: '27/30', gameSec: 760, age: 2, title: 'Herrería + Emplumado de flechas y ataque en grupo', note: 'Salí con 6 Arqueros + 1 Lancero; sumá 3 aldeanos más al oro hacia Castillos.', alloc: { food: 9, wood: 10, gold: 7, stone: 0 }, icons: ['blacksmith', 'archer'] },
    ],
  },
  {
    key: 'maa-archers-21pop',
    name: 'Hombres de armas hacia Arqueros (21 de población)',
    shortName: 'Hombres de armas → Arqueros',
    mapName: 'Arabia',
    mapSlug: 'arabia',
    artClass: 'opening-art-swords-archers',
    difficulty: 'Intermedio',
    targetFeudalSec: 615,
    targetCastleSec: 1160,
    requiredNodes: ['Man-at-Arms', 'Archer'],
    matchOpenings: ['m@a', 'milicia', 'hombres de armas', 'drush'],
    summary: 'Presión temprana con 3 Milicias mejoradas a Hombres de armas seguida de Galería de tiro con arco.',
    steps: [
      { pop: '04/05', gameSec: 0, age: 1, title: '2 Casas, 6 a ovejas y 4 a madera', note: 'Ubicá la madera y las bayas del rival antes del minuto 5.', alloc: { food: 6, wood: 4, gold: 0, stone: 0 }, icons: ['villager', 'wood'] },
      { pop: '16/20', gameSec: 270, age: 1, title: 'Jabalíes, Molino y 2 Aldeanos a oro (10 de oro extra)', note: 'Los 40 de oro de Hombres de armas deben estar listos al llegar a Feudal.', alloc: { food: 10, wood: 4, gold: 2, stone: 0 }, icons: ['boar', 'gold'] },
      { pop: '19/20', gameSec: 390, age: 1, title: 'Cuartel al 60 % de Alta Edad y 3 Milicias en camino', note: 'Enviá las 3 Milicias + Caballería de exploración hacia su madera o bayas.', alloc: { food: 11, wood: 5, gold: 2, stone: 0 }, icons: ['barracks', 'sword'] },
      { pop: '21/25', gameSec: 485, age: 1, title: 'Telar y clic a Edad Feudal', note: 'Reasigná 10 a madera y 4 a oro mientras subís.', alloc: { food: 6, wood: 10, gold: 4, stone: 0 }, icons: ['wood', 'gold'] },
      { pop: '21/25', gameSec: 615, age: 2, title: 'Investigá Hombres de armas + Hacha de doble filo + Galería', note: 'Hacé daño a sus muros y seguí con Arqueros + Emplumado de flechas.', alloc: { food: 6, wood: 10, gold: 4, stone: 0 }, icons: ['sword', 'archer'] },
    ],
  },
  {
    key: 'fc-knights-27pop',
    name: 'Paso rápido a Castillos con Caballeros (27+2)',
    shortName: 'Paso rápido · Caballeros',
    mapName: 'Arena',
    mapSlug: 'arena',
    artClass: 'opening-art-castle',
    difficulty: 'Intermedio',
    targetFeudalSec: 720,
    targetCastleSec: 975,
    requiredNodes: ['Knight'],
    matchOpenings: ['fast castle', 'caballero', 'knight', 'castillo'],
    summary: 'Subida limpia a Edad de los Castillos con doble Establo, Pureza de sangre y control temprano del mapa.',
    steps: [
      { pop: '04/05', gameSec: 0, age: 1, title: '2 Casas, 6 a ovejas y 4 a madera', note: 'En Arena evitá Telar en Alta Edad Media para ganar 25 segundos.', alloc: { food: 6, wood: 4, gold: 0, stone: 0 }, icons: ['villager', 'sheep'] },
      { pop: '16/20', gameSec: 250, age: 1, title: 'Jabalíes, ciervos al Centro Urbano y 4 en bayas', note: 'Acercar 2–3 ciervos vuelve muy fluido el clic de 27 aldeanos.', alloc: { food: 12, wood: 4, gold: 0, stone: 0 }, icons: ['boar', 'berries'] },
      { pop: '24/25', gameSec: 470, age: 1, title: 'Segundo Campamento maderero (9 en madera) y 3 en oro', note: 'Colocá 3–4 granjas tempranas para cerrar los 500 de comida.', alloc: { food: 11, wood: 9, gold: 3, stone: 0 }, icons: ['wood', 'gold'] },
      { pop: '27/30', gameSec: 590, age: 1, title: 'Clic a Edad Feudal y Cuartel durante el avance', note: 'Dejá 2 aldeanos libres para levantar Establo y Herrería al instante.', alloc: { food: 13, wood: 10, gold: 3, stone: 0 }, icons: ['barracks', 'food'] },
      { pop: '29/30', gameSec: 720, age: 2, title: 'Establo + Herrería · +2 Aldeanos y clic a Castillos', note: 'Investigá Hacha de doble filo y Pureza de sangre mientras avanzás.', alloc: { food: 13, wood: 10, gold: 5, stone: 0 }, icons: ['stable', 'blacksmith'] },
      { pop: '29/35', gameSec: 975, age: 3, title: 'Segundo Establo + Caballeros constantes + Defensa', note: 'Priorizá armadura de caballería en Herrería y disputá reliquias.', alloc: { food: 13, wood: 10, gold: 5, stone: 0 }, icons: ['stable', 'shield'] },
    ],
  },
  {
    key: 'fc-boom-26pop',
    name: 'Paso rápido a Castillos · 3 Centros Urbanos (26+2)',
    shortName: 'Paso rápido · 3 Centros Urbanos',
    mapName: 'Arena',
    mapSlug: 'arena',
    artClass: 'opening-art-boom',
    difficulty: 'Intermedio',
    targetFeudalSec: 705,
    targetCastleSec: 950,
    requiredNodes: [],
    matchOpenings: ['boom', 'econom', 'fast castle', 'castillo'],
    summary: 'Desarrollo económico acelerado en mapas cerrados con Sierra de arco inmediata y 3 Centros Urbanos sin pausas.',
    steps: [
      { pop: '04/05', gameSec: 0, age: 1, title: '2 Casas, 6 a ovejas y 4 a madera', note: 'Empujá ciervos al Centro Urbano para ahorrar madera en granjas.', alloc: { food: 6, wood: 4, gold: 0, stone: 0 }, icons: ['villager', 'wood'] },
      { pop: '18/20', gameSec: 300, age: 1, title: 'Jabalíes, bayas y 2 Campamentos madereros', note: 'Mantené 9–10 en madera para tener 550 de madera al pisar Castillos.', alloc: { food: 10, wood: 8, gold: 0, stone: 0 }, icons: ['boar', 'wood'] },
      { pop: '26/30', gameSec: 575, age: 1, title: 'Clic a Edad Feudal con 2 Aldeanos en oro', note: 'No hace falta Cuartel: subirás con Mercado y Herrería.', alloc: { food: 13, wood: 10, gold: 2, stone: 0 }, icons: ['gold', 'food'] },
      { pop: '28/30', gameSec: 705, age: 2, title: 'Mercado + Herrería · +2 Aldeanos y clic a Castillos', note: 'Investigá Hacha de doble filo y Collera durante el avance.', alloc: { food: 12, wood: 13, gold: 2, stone: 0 }, icons: ['market', 'blacksmith'] },
      { pop: '28/35', gameSec: 950, age: 3, title: '2 Centros Urbanos adicionales + Sierra de arco', note: 'Ubicá los nuevos Centros Urbanos sobre madera y oro; agregá granjas sin parar.', alloc: { food: 12, wood: 13, gold: 2, stone: 0 }, icons: ['villager', 'wood'] },
    ],
  },
  {
    key: 'defensive-skirm-spear-22pop',
    name: 'Lanceros y Guerrilleros defensivos hacia Castillos (22 pob.)',
    shortName: 'Defensa · Lanceros y Guerrilleros',
    mapName: 'Arabia',
    mapSlug: 'arabia',
    artClass: 'opening-art-pikes',
    difficulty: 'Táctico',
    targetFeudalSec: 620,
    targetCastleSec: 1120,
    requiredNodes: ['Spearman', 'Skirmisher'],
    matchOpenings: ['skirm', 'guerrillero', 'lancero', 'defens'],
    summary: 'Defensa económica sin gastar oro para frenar presión combinada de Caballería y Arqueros y llegar antes a Castillos.',
    steps: [
      { pop: '04/05', gameSec: 0, age: 1, title: '2 Casas, 6 a ovejas y 4 a madera', note: 'Explorá rápido si tu rival abrió Cuartel o Establo.', alloc: { food: 6, wood: 4, gold: 0, stone: 0 }, icons: ['villager', 'sheep'] },
      { pop: '16/20', gameSec: 260, age: 1, title: 'Jabalíes, Molino en bayas y muros cortos en recursos', note: 'Asegurá madera y bayas con muros económicos entre bosques.', alloc: { food: 11, wood: 4, gold: 0, stone: 0 }, icons: ['berries', 'wood'] },
      { pop: '22/25', gameSec: 490, age: 1, title: 'Telar, clic a Edad Feudal y Cuartel', note: 'Mantené 11 en madera; todavía no necesitás oro.', alloc: { food: 10, wood: 11, gold: 0, stone: 0 }, icons: ['barracks', 'wood'] },
      { pop: '22/25', gameSec: 620, age: 2, title: 'Galería de tiro con arco + Hacha de doble filo + 2 Lanceros', note: 'Frená Caballería de exploración con Lanceros y Arqueros con Guerrilleros.', alloc: { food: 10, wood: 11, gold: 0, stone: 0 }, icons: ['shield', 'archer'] },
      { pop: '30/35', gameSec: 840, age: 2, title: 'Herrería (defensa de arqueros) + 4 a oro hacia Castillos', note: 'Al no gastar oro temprano, tu clic a Edad de los Castillos llega más rápido.', alloc: { food: 14, wood: 11, gold: 4, stone: 0 }, icons: ['blacksmith', 'gold'] },
    ],
  },
];

function checkCivCompatibility(recipe, civSlug) {
  const slug = String(civSlug || '').trim().toLowerCase();
  if (!slug || !CIV_TECH[slug]) {
    return { slug: null, civName: null, compatible: true, warnings: [], caveat: null };
  }
  const nodes = CIV_TECH[slug].nodes || {};
  const guide = CIV_GUIDE[slug] || {};
  const missing = (recipe.requiredNodes || []).filter((n) => nodes[n] == null);
  const NODE_ES = {
    'Scout Cavalry': 'Caballería de exploración',
    Archer: 'Arquero',
    Crossbowman: 'Ballestero',
    'Man-at-Arms': 'Hombre de armas',
    Knight: 'Caballero',
    Spearman: 'Lancero',
    Skirmisher: 'Guerrillero',
  };
  const warnings = missing.map((n) => `${guide.name || slug} no dispone de ${NODE_ES[n] || n} en su árbol tecnológico.`);
  const caveat = CIV_CAVEATS[slug] || null;
  return {
    slug,
    civName: guide.name || slug,
    compatible: missing.length === 0,
    warnings,
    caveat,
  };
}

function median(arr) {
  const clean = arr.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : Math.round((clean[mid - 1] + clean[mid]) / 2);
}

function computeRecipeBenchmarks(recipe, records = []) {
  const tokens = recipe.matchOpenings || [];
  const valid = (records || []).filter((r) => {
    const dur = Number(r?.telemetry?.durationSeconds || r?.telemetry?.engineSummary?.durationSeconds || 0);
    if (dur < 600) return false;
    const startAge = String(r?.telemetry?.context?.startingAge || 'dark').toLowerCase();
    return startAge === 'dark' || startAge === 'standard' || !startAge;
  });

  const matching = valid.filter((r) => {
    const op = String(r?.telemetry?.context?.opening || r?.telemetry?.opening?.label || '').toLowerCase();
    return tokens.some((tk) => op.includes(tk));
  });
  const pool = matching.length >= 2 ? matching : valid;

  const feudalSecs = [];
  const castleSecs = [];
  const darkIdles = [];
  for (const r of pool) {
    const self = r?.telemetry?.engineSummary?.self || {};
    const m = r?.telemetry?.metrics || {};
    const f = self.timings?.feudalSeconds ?? m.feudalSeconds?.value ?? null;
    const c = self.timings?.castleSeconds ?? m.castleSeconds?.value ?? null;
    const idle = self.tcIdleDarkSeconds;
    if (Number.isFinite(f) && f >= 360 && f <= 1200) feudalSecs.push(Math.round(f));
    if (Number.isFinite(c) && c >= 720 && c <= 2200) castleSecs.push(Math.round(c));
    if (Number.isFinite(idle) && idle >= 0 && idle <= 600) darkIdles.push(Math.round(idle));
  }

  return {
    sampleCount: pool.length,
    exactOpeningMatches: matching.length,
    medianFeudalSec: median(feudalSecs),
    bestFeudalSec: feudalSecs.length ? Math.min(...feudalSecs) : null,
    medianCastleSec: median(castleSecs),
    bestCastleSec: castleSecs.length ? Math.min(...castleSecs) : null,
    medianDarkIdleSec: median(darkIdles),
  };
}

function getRecipeByKey(key) {
  return RECIPES.find((r) => r.key === key) || RECIPES[0];
}

function listRecipes() {
  return RECIPES.map((r) => ({
    key: r.key,
    name: r.name,
    shortName: r.shortName,
    mapName: r.mapName,
    mapSlug: r.mapSlug,
    artClass: r.artClass,
    difficulty: r.difficulty,
    targetFeudalSec: r.targetFeudalSec,
    targetCastleSec: r.targetCastleSec,
    summary: r.summary,
    stepCount: r.steps.length,
  }));
}

module.exports = {
  RECIPES,
  CIV_CAVEATS,
  getRecipeByKey,
  listRecipes,
  checkCivCompatibility,
  computeRecipeBenchmarks,
};
