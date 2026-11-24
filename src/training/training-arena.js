'use strict';

/**
 * Relic · Arena Táctica de Progresión (v5 · +350 preguntas 100 % verificadas en 7 niveles)
 *
 * - Cero preguntas inventadas: cada ítem se compila determinísticamente desde
 *   `src/civ-tech.json` (56 civilizaciones estándar), `src/civ-guide.js` y `src/opportunities.js`.
 * - Nomenclatura 100 % oficial de Age of Empires II: Definitive Edition (verificada en tablas oficiales ES/MX).
 * - Escalada real de 7 niveles (de 900–1100 ELO hasta 1900–2200+ Gran Maestro) con desbloqueo de 7 unidades icónicas.
 * - Cada pregunta tiene un `id` estable y determinista para seguimiento sin repeticiones.
 */

const CIV_TECH_RAW = require('../civ-tech.json');
const { CIV_GUIDE } = require('../civ-guide');
const { lineQuality } = require('../opportunities');

const CIV_TECH = CIV_TECH_RAW?.civilizations || {};

const VALID_CIV_SLUGS = Object.keys(CIV_GUIDE).filter((s) => Boolean(CIV_TECH[s]?.nodes));

const ICONIC_24 = [
  'britons', 'mongols', 'goths', 'spanish', 'turks', 'byzantines', 'persians', 'mayans',
  'aztecs', 'vikings', 'japanese', 'chinese', 'saracens', 'franks', 'teutons', 'celts',
  'huns', 'koreans', 'italians', 'slavs', 'incas', 'berbers', 'magyars', 'khmer',
].filter((s) => Boolean(CIV_TECH[s]?.nodes && CIV_GUIDE[s]));

const LEVEL_CONFIG = [
  {
    level: 1,
    rankTitle: 'Infante de Guardia',
    eloBand: '900–1100 ELO',
    difficultyLabel: 'Nivel 1 · Fundamentos',
    unitKey: 'maa',
    unitName: 'Hombre de armas',
    unitPlural: 'Hombres de armas',
    requiredCorrect: 10,
    timerSec: 28,
    art: 'assets/art/apertura-militia.webp',
    portrait: 'assets/brand/opening-v1.png',
    icon: 'assets/icons/sword.png',
  },
  {
    level: 2,
    rankTitle: 'Tirador Feudal',
    eloBand: '1150–1300 ELO',
    difficultyLabel: 'Nivel 2 · Identidad y Aperturas',
    unitKey: 'crossbowman',
    unitName: 'Ballestero',
    unitPlural: 'Ballesteros',
    requiredCorrect: 12,
    timerSec: 26,
    art: 'assets/art/apertura-archers.webp',
    portrait: 'assets/brand/review-archer-v1.png',
    icon: 'assets/icons/archer.png',
  },
  {
    level: 3,
    rankTitle: 'Batidor de Frontera',
    eloBand: '1300–1450 ELO',
    difficultyLabel: 'Nivel 3 · Transiciones',
    unitKey: 'hussar',
    unitName: 'Húsar',
    unitPlural: 'Húsares',
    requiredCorrect: 14,
    timerSec: 25,
    art: 'assets/art/apertura-scouts.webp',
    portrait: 'assets/brand/review-scout-v1.png',
    icon: 'assets/icons/scout.png',
  },
  {
    level: 4,
    rankTitle: 'Comandante de Castillos',
    eloBand: '1450–1600 ELO',
    difficultyLabel: 'Nivel 4 · Herrería y Asedio',
    unitKey: 'paladin',
    unitName: 'Paladín',
    unitPlural: 'Paladines',
    requiredCorrect: 16,
    timerSec: 24,
    art: 'assets/art/apertura-castle.webp',
    portrait: 'assets/brand/review-knight-v1.png',
    icon: 'assets/icons/stable.png',
  },
  {
    level: 5,
    rankTitle: 'Custodio de Reliquias',
    eloBand: '1600–1750 ELO',
    difficultyLabel: 'Nivel 5 · Monasterio y Brechas',
    unitKey: 'monk',
    unitName: 'Monje',
    unitPlural: 'Monjes',
    requiredCorrect: 18,
    timerSec: 22,
    art: 'assets/art/apertura-monks.webp',
    portrait: 'assets/brand/review-relic-monk-v1.png',
    icon: 'assets/icons/relic.png',
  },
  {
    level: 6,
    rankTitle: 'Maestro de Asedio',
    eloBand: '1750–1900 ELO',
    difficultyLabel: 'Nivel 6 · Post-Imperial',
    unitKey: 'bombard_cannon',
    unitName: 'Cañón de asedio',
    unitPlural: 'Cañones de asedio',
    requiredCorrect: 20,
    timerSec: 20,
    art: 'assets/art/apertura-siege.webp',
    portrait: 'assets/brand/review-castle-v1.png',
    icon: 'assets/icons/castle.png',
  },
  {
    level: 7,
    rankTitle: 'Gran Maestro Imperial',
    eloBand: '1900–2200+ ELO',
    difficultyLabel: 'Nivel 7 · Extremo',
    unitKey: 'imperial_legend',
    unitName: 'Leyenda Imperial',
    unitPlural: 'Leyendas Imperiales',
    requiredCorrect: 25,
    timerSec: 18,
    art: 'assets/art/central-hero.jpg',
    portrait: 'assets/brand/imperial-v1.png',
    icon: 'assets/icons/crown.png',
  },
];

// Diccionario oficial AoE2:DE (verificado en tablas oficiales ES/MX)
const OFFICIAL_NODE_ES = {
  // Unidades finales y líneas
  'Paladin': { es: 'Paladín', sub: 'Mejora final de la línea de Caballeros', icon: 'stable' },
  'Cavalier': { es: 'Caballero', sub: 'Mejora de Jinete/Caballero en Imperial', icon: 'stable' },
  'Arbalester': { es: 'Arbalestero', sub: 'Mejora final de la línea de Arqueros', icon: 'archer' },
  'Crossbowman': { es: 'Ballestero', sub: 'Mejora de Arquero en Edad de los Castillos', icon: 'archer' },
  'Hand Cannoneer': { es: 'Artillero manual', sub: 'Infantería de pólvora en Edad Imperial', icon: 'gunpowder' },
  'Halberdier': { es: 'Alabardero', sub: 'Infantería anticaballería final', icon: 'barracks' },
  'Pikeman': { es: 'Piquero', sub: 'Mejora anticaballería de Edad de los Castillos', icon: 'barracks' },
  'Elite Skirmisher': { es: 'Guerrillero de élite', sub: 'Anti-arquero mejorado en Castillos', icon: 'shield' },
  'Hussar': { es: 'Húsar', sub: 'Mejora final de Caballería ligera', icon: 'scout' },
  'Winged Hussar': { es: 'Húsar alado', sub: 'Mejora regional de Caballería ligera', icon: 'scout' },
  'Champion': { es: 'Campeón', sub: 'Mejora final de infantería de espada', icon: 'sword' },
  'Two-Handed Swordsman': { es: 'Espadachín de mandoble', sub: 'Infantería de espada en Imperial', icon: 'sword' },
  'Long Swordsman': { es: 'Espadachín de espada larga', sub: 'Infantería de espada en Castillos', icon: 'sword' },
  'Heavy Cavalry Archer': { es: 'Arquero de caballería pesada', sub: 'Mejora final de Arquero a caballo', icon: 'archer' },
  'Bombard Cannon': { es: 'Cañón de asedio', sub: 'Artillería de pólvora en Edad Imperial', icon: 'gunpowder' },
  'Siege Onager': { es: 'Onagro de asedio', sub: 'Mejora final de Mangana / Onagro', icon: 'castle' },
  'Siege Ram': { es: 'Ariete de asedio', sub: 'Mejora final de Ariete', icon: 'building' },
  'Capped Ram': { es: 'Ariete cubierto', sub: 'Mejora de Ariete en Imperial', icon: 'building' },
  'Battering Ram': { es: 'Ariete', sub: 'Asedio para derribar edificios', icon: 'building' },
  'Steppe Lancer': { es: 'Lancero estepario', sub: 'Caballería regional de 1 de alcance', icon: 'scout' },
  'Battle Elephant': { es: 'Elefante de combate', sub: 'Caballería pesada regional de área', icon: 'stable' },
  'Elephant Archer': { es: 'Elefante arquero', sub: 'Arquero montado pesado regional', icon: 'archer' },
  'Hei Guang Cavalry': { es: 'Caballería de Hei Guang', sub: 'Caballería pesada regional', icon: 'stable' },
  'Dromon': { es: 'Dromón', sub: 'Buque de asedio naval regional', icon: 'castle' },
  'Heavy Scorpion': { es: 'Escorpión pesado', sub: 'Asedio antipersonal en Imperial', icon: 'castle' },

  // Tecnologías de Herrería, Establo, Galería, Cuarteles, Universidad, Monasterio y Eco
  'Bloodlines': { es: 'Pureza de sangre', sub: '+20 PS para unidades montadas', icon: 'stable' },
  'Husbandry': { es: 'Ganadería', sub: '+10 % velocidad de caballería', icon: 'scout' },
  'Thumb Ring': { es: 'Dactilera', sub: 'Mayor cadencia y 100 % precisión en arqueros', icon: 'archer' },
  'Bracer': { es: 'Brazal', sub: '+1 ataque y +1 alcance en Edad Imperial', icon: 'blacksmith' },
  'Bodkin Arrow': { es: 'Flecha de punzón', sub: '+1 ataque y +1 alcance en Castillos', icon: 'blacksmith' },
  'Ring Archer Armor': { es: 'Armadura de anillos de arquero', sub: 'Última armadura de arqueros (+1/+2)', icon: 'blacksmith' },
  'Plate Barding Armor': { es: 'Barda de placas', sub: 'Última armadura de caballería (+1/+2)', icon: 'blacksmith' },
  'Plate Mail Armor': { es: 'Armadura de placas de malla', sub: 'Última armadura de infantería (+1/+2)', icon: 'blacksmith' },
  'Chain Mail Armor': { es: 'Cota de malla', sub: 'Segunda armadura de infantería', icon: 'blacksmith' },
  'Scale Mail Armor': { es: 'Armadura de láminas', sub: 'Primera armadura de infantería', icon: 'blacksmith' },
  'Blast Furnace': { es: 'Alto horno', sub: '+2 ataque cuerpo a cuerpo en Imperial', icon: 'blacksmith' },
  'Iron Casting': { es: 'Fundición de hierro', sub: '+1 ataque cuerpo a cuerpo en Castillos', icon: 'blacksmith' },
  'Forging': { es: 'Forja', sub: '+1 ataque cuerpo a cuerpo en Feudal', icon: 'blacksmith' },
  'Parthian Tactics': { es: 'Tácticas de los partos', sub: '+1/+2 armadura y daño extra vs piqueros', icon: 'archer' },
  'Siege Engineers': { es: 'Ingenieros de asedio', sub: '+1 alcance y +20 % daño a edificios', icon: 'building' },
  'Chemistry': { es: 'Química', sub: '+1 ataque en proyectiles y habilita pólvora', icon: 'gunpowder' },
  'Ballistics': { es: 'Balística', sub: 'Proyectiles anticipan el movimiento rival', icon: 'archer' },
  'Squires': { es: 'Escuderos', sub: '+10 % velocidad de infantería', icon: 'barracks' },
  'Gambesons': { es: 'Gambesones', sub: '+1 armadura antiproyectil para Milicias', icon: 'barracks' },
  'Arson': { es: 'Incendiarismo', sub: '+2 daño de infantería contra edificios', icon: 'barracks' },
  'Redemption': { es: 'Redención', sub: 'Monjes convierten edificios y asedio', icon: 'relic' },
  'Block Printing': { es: 'Letras de imprenta', sub: '+3 alcance de conversión para Monjes', icon: 'relic' },
  'Heresy': { es: 'Herejía', sub: 'Unidades convertidas mueren en lugar de cambiar bando', icon: 'relic' },
  'Sanctity': { es: 'Santidad', sub: '+15 PS para Monjes (resisten 1 disparo de Mangana)', icon: 'relic' },
  'Fervor': { es: 'Fervor', sub: '+15 % velocidad de movimiento de Monjes', icon: 'relic' },
  'Atonement': { es: 'Expiación', sub: 'Monjes pueden convertir Monjes enemigos', icon: 'relic' },
  'Illumination': { es: 'Iluminación', sub: 'Monjes recuperan fe 50 % más rápido', icon: 'relic' },
  'Theocracy': { es: 'Teocracia', sub: 'Solo un Monje descansa tras conversión grupal', icon: 'relic' },
  'Faith': { es: 'Fe', sub: 'Unidades mucho más resistentes a conversión', icon: 'relic' },
  'Double-Bit Axe': { es: 'Hacha de doble filo', sub: '+20 % velocidad de tala en Feudal', icon: 'wood' },
  'Bow Saw': { es: 'Sierra de arco', sub: '+20 % velocidad de tala en Castillos', icon: 'wood' },
  'Two-Man Saw': { es: 'Sierra a dos', sub: '+10 % tala final en Edad Imperial', icon: 'wood' },
  'Guilds': { es: 'Gremios', sub: 'Comisión del Mercado reducida al 15 %', icon: 'market' },
  'Architecture': { es: 'Arquitectura', sub: '+10 % PS y +1/+1 armadura de edificios', icon: 'building' },
  'Masonry': { es: 'Albañilería', sub: '+10 % PS y armadura de edificios en Imperial', icon: 'building' },
  'Fortified Wall': { es: 'Muralla fortificada', sub: 'Muralla de piedra reforzada', icon: 'castle' },
  'Hoardings': { es: 'Ladronera', sub: '+21 % PS en Castillos', icon: 'castle' },
  'Stone Shaft Mining': { es: 'Pozo de cantera', sub: '+15 % extracción de piedra en Castillos', icon: 'stone' },
  'Gold Shaft Mining': { es: 'Pozo minero aurífero', sub: '+15 % extracción de oro en Castillos', icon: 'gold' },
  'Crop Rotation': { es: 'Rotación de cultivos', sub: '+175 comida por granja en Imperial', icon: 'food' },
};

const LINE_META = {
  archers: { label: 'Arqueros / Ballesteros', icon: 'archer', sub: 'Masa a distancia desde Galería' },
  knights: { label: 'Caballeros / Paladines', icon: 'stable', sub: 'Caballería pesada de Establo' },
  scouts: { label: 'Caballería ligera / Húsares', icon: 'scout', sub: 'Incursión rápida y anti-Monjes' },
  camels: { label: 'Jinetes de camello', icon: 'stable', sub: 'Especialistas anticaballería' },
  cavarchers: { label: 'Arqueros a caballo', icon: 'archer', sub: 'Hostigamiento móvil con daño a distancia' },
  infantry: { label: 'Espadachines / Campeones', icon: 'sword', sub: 'Infantería de Cuarteles contra águilas y basura' },
  spears: { label: 'Lanceros / Piqueros / Alabarderos', icon: 'barracks', sub: 'Muralla económica anticaballería' },
  skirms: { label: 'Guerrilleros', icon: 'shield', sub: 'Antiarqueros sin coste de oro' },
  siege: { label: 'Manganas / Onagros', icon: 'castle', sub: 'Daño de área contra masas de arqueros' },
  monks: { label: 'Monjes', icon: 'relic', sub: 'Conversión contra caballería pesada y asedio' },
  gunpowder: { label: 'Artilleros manuales / Pólvora', icon: 'gunpowder', sub: 'Contrarresta infantería pesada en Imperial' },
};

const COUNTER_MAP = {
  archers: ['skirms', 'siege', 'knights', 'scouts'],
  knights: ['spears', 'camels', 'monks'],
  scouts: ['spears', 'camels'],
  camels: ['spears', 'infantry', 'archers'],
  cavarchers: ['skirms', 'camels', 'siege'],
  infantry: ['archers', 'gunpowder', 'cavarchers'],
  skirms: ['knights', 'scouts', 'infantry', 'siege'],
  siege: ['knights', 'scouts', 'monks'],
  monks: ['scouts', 'archers'],
  gunpowder: ['skirms', 'archers', 'knights'],
};

const AGE_META = {
  1: { label: 'Alta Edad Media', icon: 'assets/icons/ages/dark.png' },
  2: { label: 'Edad Feudal', icon: 'assets/icons/ages/feudal.png' },
  3: { label: 'Edad de los Castillos', icon: 'assets/icons/ages/castle.png' },
  4: { label: 'Edad Imperial', icon: 'assets/icons/ages/imperial.png' },
};

function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function makeRng(seedInput) {
  let s = (typeof seedInput === 'number' ? seedInput : hashString(seedInput)) >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffleWithRng(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hasNode(slug, node) {
  return CIV_TECH[slug]?.nodes?.[node] != null;
}

function nodeAge(slug, node) {
  return CIV_TECH[slug]?.nodes?.[node] ?? null;
}

function civNameEs(slug) {
  const s = String(slug || '').toLowerCase();
  if (s === 'jurchens') return 'Yurchen';
  if (s === 'khitans') return 'Kitán';
  return CIV_GUIDE[s]?.name || s;
}

function civRoleEs(slug) {
  return CIV_GUIDE[String(slug || '').toLowerCase()]?.role || 'Civilización estándar';
}

function makeCivOption(slug, correct, subOverride = null) {
  return {
    id: `civ_${slug}`,
    civSlug: slug,
    title: civNameEs(slug),
    sub: subOverride || civRoleEs(slug),
    correct: Boolean(correct),
  };
}

function makeNodeOption(nodeKey, correct) {
  const info = OFFICIAL_NODE_ES[nodeKey] || { es: nodeKey, sub: 'Tecnología / unidad oficial', icon: 'blacksmith' };
  return {
    id: `node_${nodeKey.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    icon: info.icon,
    title: info.es,
    sub: info.sub,
    correct: Boolean(correct),
  };
}

function makeLineOption(lineKey, correct) {
  const info = LINE_META[lineKey] || { label: lineKey, sub: 'Línea militar', icon: 'sword' };
  return {
    id: `line_${lineKey}`,
    icon: info.icon,
    title: info.label,
    sub: info.sub,
    correct: Boolean(correct),
  };
}

function finalizeQuestion(q) {
  const rng = makeRng(q.id);
  const shuffled = shuffleWithRng(q.options, rng);
  return {
    ...q,
    options: shuffled,
  };
}

let _cachedCatalog = null;

function buildArenaCatalog() {
  if (_cachedCatalog) return _cachedCatalog;

  const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  const byId = new Map();

  function addQ(level, q) {
    if (!q || !q.id || byId.has(q.id)) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    const correctCount = q.options.filter((o) => o.correct).length;
    if (correctCount !== 1) return false;
    const finalQ = finalizeQuestion({
      ...q,
      level,
      ageIcon: q.ageIcon || AGE_META[q.age || 3]?.icon || AGE_META[3].icon,
      ageLabel: q.ageLabel || AGE_META[q.age || 3]?.label || 'Edad de los Castillos',
      mapName: q.mapName || 'Arabia',
      mapSlug: q.mapSlug || 'arabia',
    });
    byLevel[level].push(finalQ);
    byId.set(finalQ.id, finalQ);
    return true;
  }

  /* =========================================================================
   * NIVEL 1 · 900–1100 ELO · Fundamentos Competitivos (~52–60 preguntas)
   * ========================================================================= */
  // 1A. Triángulo de contraunidades verificado (18 preguntas)
  const l1CounterSpecs = [
    ['franks', 'britons', 2, 'archers', 'skirms', 'Arabia', 'arabia'],
    ['britons', 'franks', 2, 'scouts', 'spears', 'Arabia', 'arabia'],
    ['mayans', 'magyars', 2, 'scouts', 'spears', 'Arabia', 'arabia'],
    ['ethiopians', 'mongols', 2, 'scouts', 'spears', 'Arabia', 'arabia'],
    ['spanish', 'britons', 2, 'archers', 'skirms', 'Arabia', 'arabia'],
    ['franks', 'huns', 3, 'knights', 'spears', 'Arabia', 'arabia'],
    ['hindustanis', 'franks', 3, 'knights', 'camels', 'Arabia', 'arabia'],
    ['berbers', 'lithuanians', 3, 'knights', 'camels', 'Arabia', 'arabia'],
    ['byzantines', 'persians', 3, 'knights', 'camels', 'Arabia', 'arabia'],
    ['saracens', 'teutons', 3, 'knights', 'camels', 'Arabia', 'arabia'],
    ['japanese', 'mayans', 3, 'infantry', 'archers', 'Arabia', 'arabia'],
    ['britons', 'goths', 3, 'infantry', 'archers', 'Arena', 'arena'],
    ['vietnamese', 'huns', 3, 'cavarchers', 'skirms', 'Arabia', 'arabia'],
    ['byzantines', 'mongols', 3, 'cavarchers', 'skirms', 'Arabia', 'arabia'],
    ['magyars', 'aztecs', 3, 'monks', 'scouts', 'Arena', 'arena'],
    ['turks', 'bohemians', 3, 'monks', 'scouts', 'Arena', 'arena'],
    ['franks', 'celts', 3, 'siege', 'knights', 'Arabia', 'arabia'],
    ['italians', 'goths', 4, 'infantry', 'gunpowder', 'Arena', 'arena'],
  ];
  for (const [mySlug, rivSlug, age, threat, bestCounter, mapName, mapSlug] of l1CounterSpecs) {
    if (!CIV_TECH[mySlug]?.nodes || !CIV_TECH[rivSlug]?.nodes) continue;
    const qVal = lineQuality(mySlug, bestCounter, age);
    if (!qVal || qVal.score < 0.65) continue;
    const id = `l1_cp_${mySlug}_${rivSlug}_${age}_${threat}`;
    const rng = makeRng(id);
    const countersSet = new Set([...(COUNTER_MAP[threat] || []), threat]);
    const distractorLines = shuffleWithRng(
      Object.keys(LINE_META).filter((lk) => !countersSet.has(lk) && (age >= 4 || lk !== 'gunpowder')),
      rng
    ).slice(0, 3);
    if (distractorLines.length < 3) continue;
    addQ(1, {
      id,
      category: 'counter_pick',
      modeLabel: 'Contraunidad',
      age,
      mapName,
      mapSlug,
      myCiv: { slug: mySlug, name: civNameEs(mySlug) },
      rivalCiv: { slug: rivSlug, name: civNameEs(rivSlug) },
      threatLabel: `Amenaza: ${LINE_META[threat].label}`,
      prompt: `Jugás ${civNameEs(mySlug)} contra ${civNameEs(rivSlug)} en ${AGE_META[age].label}. El rival presiona con ${LINE_META[threat].label}: ¿qué respuesta verificada es la más efectiva?`,
      options: [
        makeLineOption(bestCounter, true),
        ...distractorLines.map((lk) => makeLineOption(lk, false)),
      ],
      explanation: `${LINE_META[bestCounter].label} contrarresta directamente a ${LINE_META[threat].label} y ${civNameEs(mySlug)} tiene la línea disponible en ${AGE_META[age].label}.`,
    });
  }

  // 1B. Unidades Únicas Icónicas (24 preguntas)
  for (const slug of ICONIC_24) {
    const guide = CIV_GUIDE[slug];
    if (!guide?.units) continue;
    const id = `l1_uu_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(ICONIC_24.filter((s) => s !== slug), rng).slice(0, 3);
    addQ(1, {
      id,
      category: 'civ_identity',
      modeLabel: 'Unidad Única',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Castillo · Unidad Única',
      prompt: `¿Qué civilización entrena en su Castillo la unidad única «${guide.units}»?`,
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} (${civRoleEs(slug)}) cuenta con ${guide.units} como unidad única.`,
    });
  }

  // 1C. Ausencias mayores en civilizaciones clásicas (15 preguntas)
  const headlineCapstones = ['Paladin', 'Arbalester', 'Hand Cannoneer', 'Halberdier', 'Hussar', 'Bombard Cannon'];
  for (const slug of ICONIC_24) {
    const present = headlineCapstones.filter((n) => hasNode(slug, n));
    const missing = headlineCapstones.filter((n) => !hasNode(slug, n));
    if (present.length < 3 || missing.length < 1) continue;
    const id = `l1_cap_${slug}`;
    const rng = makeRng(id);
    const targetMissing = shuffleWithRng(missing, rng)[0];
    const decoys = shuffleWithRng(present, rng).slice(0, 3);
    addQ(1, {
      id,
      category: 'tech_gap',
      modeLabel: 'Árbol Imperial',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: { slug, name: civNameEs(slug) },
      rivalCiv: null,
      threatLabel: 'Ausencia en Edad Imperial',
      prompt: `¿Cuál de estas unidades finales de Edad Imperial NO existe en el árbol tecnológico de ${civNameEs(slug)}?`,
      options: [
        makeNodeOption(targetMissing, true),
        ...decoys.map((n) => makeNodeOption(n, false)),
      ],
      explanation: `${civNameEs(slug)} carece de ${OFFICIAL_NODE_ES[targetMissing].es} en Edad Imperial, mientras que sí dispone de ${decoys.map((n) => OFFICIAL_NODE_ES[n].es).join(', ')}.`,
    });
  }

  // 1D. Ausencias estructurales emblemáticas (3 preguntas)
  const coreUniqueMisses = [
    {
      id: 'l1_core_no_eskirm_turks',
      node: 'Elite Skirmisher',
      correctSlug: 'turks',
      prompt: '¿Cuál es la ÚNICA civilización estándar de AoE2:DE que NO puede mejorar sus Guerrilleros a Guerrillero de élite?',
      explanation: 'Turcos es la única civilización estándar sin Guerrillero de élite (ni Piquero), lo que los vuelve muy dependientes de oro en partidas largas.',
    },
    {
      id: 'l1_core_no_xbow_spanish',
      node: 'Crossbowman',
      correctSlug: 'spanish',
      prompt: '¿Cuál de estas civilizaciones europeas NO dispone de Ballestero en Edad de los Castillos?',
      explanation: 'Españoles (junto con Búlgaros) es una de las dos únicas civilizaciones sin Ballestero; compensa con Conquistadores y pólvora.',
    },
    {
      id: 'l1_core_no_pike_turks',
      node: 'Pikeman',
      correctSlug: 'turks',
      prompt: '¿Cuál de estas civilizaciones NO tiene acceso a la mejora de Piquero en Edad de los Castillos?',
      explanation: 'Turcos (junto con Gurjaras) no dispone de Piquero; frente a caballería recurre a Jinetes de camello pesados o Jenízaros.',
    },
  ];
  for (const item of coreUniqueMisses) {
    const rng = makeRng(item.id);
    const pool = ICONIC_24.filter((s) => s !== item.correctSlug && hasNode(s, item.node));
    const decoys = shuffleWithRng(pool, rng).slice(0, 3);
    addQ(1, {
      id: item.id,
      category: 'tech_gap',
      modeLabel: 'Regla Estructural',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Árbol tecnológico',
      prompt: item.prompt,
      options: [
        makeCivOption(item.correctSlug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: item.explanation,
    });
  }

  /* =========================================================================
   * NIVEL 2 · 1150–1300 ELO · Roster Completo, Aperturas y Unidades Regionales
   * ========================================================================= */
  // 2A. Unidades Únicas del resto del roster (32 preguntas)
  const iconicSet = new Set(ICONIC_24);
  const remainingCivs = VALID_CIV_SLUGS.filter((s) => !iconicSet.has(s));
  for (const slug of remainingCivs) {
    const guide = CIV_GUIDE[slug];
    if (!guide?.units) continue;
    const id = `l2_uu_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(remainingCivs.filter((s) => s !== slug), rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(2, {
      id,
      category: 'civ_identity',
      modeLabel: 'Roster Completo',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Identidad de Civilización',
      prompt: `¿A qué civilización pertenece la unidad única «${guide.units}»?`,
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} (${civRoleEs(slug)}) entrena ${guide.units}.`,
    });
  }

  // 2B. Reglas verificadas de apertura y economía temprana (10 preguntas)
  const openingRules = [
    {
      id: 'l2_open_huns',
      slug: 'huns',
      prompt: '¿Qué civilización inicia con -100 de madera pero NO necesita construir Casas en toda la partida?',
      exp: 'Hunos comienza con capacidad máxima de población desde el segundo 0, eliminando bloqueos de población.',
    },
    {
      id: 'l2_open_khmer',
      slug: 'khmer',
      prompt: '¿Qué civilización puede avanzar a Edad Feudal y Castillos sin construir edificios requisito previos?',
      exp: 'Jemeres no requiere Cuarteles, Herrería ni Mercado para hacer clic de avance de edad, habilitando subidas ultrarrápidas.',
    },
    {
      id: 'l2_open_chinese',
      slug: 'chinese',
      prompt: '¿Qué civilización arranca con +3 Aldeanos extra pero con -200 de comida y -50 de madera?',
      exp: 'Chinos exige investigar Telar y concentrar rápidamente aldeanos bajo el Centro Urbano para despegar su economía.',
    },
    {
      id: 'l2_open_malay',
      slug: 'malay',
      prompt: '¿Qué civilización avanza de edad 66 % más rápido que el resto, modificando todos sus tiempos de Feudal y Castillos?',
      exp: 'Malayos sube de edad en una fracción del tiempo estándar, lo que permite producir más aldeanos antes de hacer clic.',
    },
    {
      id: 'l2_open_franks',
      slug: 'franks',
      prompt: '¿Qué civilización recibe automáticamente y gratis las mejoras de granjas del Molino al cambiar de edad?',
      exp: 'Francos obtiene Collera, Arado pesado y Rotación de cultivos gratis en cuanto alcanza la edad correspondiente.',
    },
    {
      id: 'l2_open_vikings',
      slug: 'vikings',
      prompt: '¿Qué civilización obtiene Carretilla y Carro de mano gratis apenas entra en Edad Feudal y Castillos?',
      exp: 'Vikingos disfruta de uno de los mayores impulsos económicos gratuitos del juego en Feudal y Castillos.',
    },
    {
      id: 'l2_open_bulgarians',
      slug: 'bulgarians',
      prompt: '¿Qué civilización recibe gratis toda la cadena de mejoras de Milicia (Hombre de armas, Espada larga y Mandoble)?',
      exp: 'Búlgaros mejora gratis la línea de Milicia al subir de edad, ideal para aperturas agresivas de Hombres de armas.',
    },
    {
      id: 'l2_open_italians',
      slug: 'italians',
      prompt: '¿Qué civilización ahorra un 15 % del coste de recursos al avanzar a cada nueva edad?',
      exp: 'Italianos paga menos comida y oro al pasar a Feudal, Castillos e Imperial, facilitando tiempos muy ágiles.',
    },
    {
      id: 'l2_open_mayans',
      slug: 'mayans',
      prompt: '¿Qué civilización comienza con +1 Aldeano extra (-50 de comida) y hace que los recursos duren un 15 % más?',
      exp: 'Mayas debe evitar quedarse bloqueado en 5/5 al inicio y aprovecha cada oveja, jabalí y mina de oro un 15 % más.',
    },
    {
      id: 'l2_open_gurjaras',
      slug: 'gurjaras',
      prompt: '¿Qué civilización puede guarnecer ovejas en el Molino para generar comida pasiva e inicia con 2 arbustos bajo el CU?',
      exp: 'Gurjaras reemplaza el inicio clásico de ovejas por pastoreo guarnecido en Molino y Explorador de camello.',
    },
  ];
  for (const r of openingRules) {
    if (!CIV_TECH[r.slug]?.nodes) continue;
    const rng = makeRng(r.id);
    const decoys = shuffleWithRng(VALID_CIV_SLUGS.filter((s) => s !== r.slug), rng).slice(0, 3);
    addQ(2, {
      id: r.id,
      category: 'opening_rule',
      modeLabel: 'Regla de Apertura',
      age: 1,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Alta Edad · Economía',
      prompt: r.prompt,
      options: [
        makeCivOption(r.slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: r.exp,
    });
  }

  // 2C. Acceso a unidades regionales (18 preguntas)
  const regionalNodes = ['Steppe Lancer', 'Battle Elephant', 'Elephant Archer', 'Winged Hussar', 'Hei Guang Cavalry', 'Dromon'];
  for (const rNode of regionalNodes) {
    const have = VALID_CIV_SLUGS.filter((s) => hasNode(s, rNode));
    const miss = VALID_CIV_SLUGS.filter((s) => !hasNode(s, rNode));
    if (!have.length || miss.length < 3) continue;
    const picks = have.slice(0, rNode === 'Battle Elephant' ? 5 : 4);
    for (const slug of picks) {
      const id = `l2_reg_${rNode.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(miss, rng).slice(0, 3);
      addQ(2, {
        id,
        category: 'regional_unit',
        modeLabel: 'Unidad Regional',
        age: 3,
        mapName: 'Arabia',
        mapSlug: 'arabia',
        myCiv: null,
        rivalCiv: null,
        threatLabel: OFFICIAL_NODE_ES[rNode].es,
        prompt: `¿Cuál de estas cuatro civilizaciones tiene acceso a la unidad regional «${OFFICIAL_NODE_ES[rNode].es}»?`,
        options: [
          makeCivOption(slug, true),
          ...decoys.map((d) => makeCivOption(d, false)),
        ],
        explanation: `${civNameEs(slug)} dispone de ${OFFICIAL_NODE_ES[rNode].es} en su árbol tecnológico oficial.`,
      });
    }
  }

  /* =========================================================================
   * NIVEL 3 · 1300–1450 ELO · Transiciones y Brechas de Establo/Cuarteles
   * ========================================================================= */
  // 3A. Dilemas de transición Castillos → Imperial (20 preguntas verificadas)
  const tdTemplates = [
    ['franks', 'hindustanis', 'knights', 'camels', 'infantry', 'Arabia', 'arabia'],
    ['franks', 'bohemians', 'knights', 'spears', 'gunpowder', 'Arena', 'arena'],
    ['britons', 'vikings', 'archers', 'skirms', 'infantry', 'Arabia', 'arabia'],
    ['mayans', 'goths', 'archers', 'infantry', 'archers', 'Arabia', 'arabia'],
    ['ethiopians', 'berbers', 'archers', 'skirms', 'siege', 'Arabia', 'arabia'],
    ['magyars', 'byzantines', 'knights', 'camels', 'cavarchers', 'Arabia', 'arabia'],
    ['mongols', 'vietnamese', 'cavarchers', 'skirms', 'siege', 'Arabia', 'arabia'],
    ['huns', 'saracens', 'cavarchers', 'camels', 'spears', 'Arabia', 'arabia'],
    ['spanish', 'britons', 'knights', 'spears', 'skirms', 'Arabia', 'arabia'],
    ['turks', 'byzantines', 'cavarchers', 'skirms', 'scouts', 'Arena', 'arena'],
    ['teutons', 'ethiopians', 'knights', 'spears', 'gunpowder', 'Arena', 'arena'],
    ['slavs', 'mayans', 'infantry', 'archers', 'siege', 'Arabia', 'arabia'],
    ['japanese', 'italians', 'infantry', 'gunpowder', 'archers', 'Arabia', 'arabia'],
    ['chinese', 'franks', 'archers', 'knights', 'camels', 'Arabia', 'arabia'],
    ['vietnamese', 'goths', 'archers', 'infantry', 'infantry', 'Arabia', 'arabia'],
    ['persians', 'byzantines', 'knights', 'spears', 'gunpowder', 'Arena', 'arena'],
    ['burgundians', 'teutons', 'knights', 'spears', 'gunpowder', 'Arena', 'arena'],
    ['portuguese', 'goths', 'archers', 'infantry', 'gunpowder', 'Arena', 'arena'],
    ['lithuanians', 'saracens', 'knights', 'camels', 'spears', 'Arabia', 'arabia'],
    ['poles', 'bohemians', 'knights', 'spears', 'skirms', 'Arena', 'arena'],
    ['khmer', 'berbers', 'knights', 'camels', 'spears', 'Arabia', 'arabia'],
    ['tatars', 'vietnamese', 'cavarchers', 'skirms', 'scouts', 'Arabia', 'arabia'],
  ];
  for (const [mySlug, rivSlug, initLine, rivalThreat, switchLine, mapName, mapSlug] of tdTemplates) {
    if (!CIV_TECH[mySlug]?.nodes || !CIV_TECH[rivSlug]?.nodes) continue;
    const swQual = lineQuality(mySlug, switchLine, 4);
    if (!swQual || swQual.score < 0.65) continue;
    if (!COUNTER_MAP[rivalThreat]?.includes(switchLine)) continue;
    const id = `l3_td_${mySlug}_${rivSlug}_${rivalThreat}_${switchLine}`;
    const rng = makeRng(id);
    const badSet = new Set([...(COUNTER_MAP[rivalThreat] || []), rivalThreat]);
    const distractors = shuffleWithRng(
      Object.keys(LINE_META).filter((lk) => !badSet.has(lk)),
      rng
    ).slice(0, 3);
    if (distractors.length < 3) continue;
    addQ(3, {
      id,
      category: 'transition_dilemma',
      modeLabel: 'Transición Imperial',
      age: 4,
      mapName,
      mapSlug,
      myCiv: { slug: mySlug, name: civNameEs(mySlug) },
      rivalCiv: { slug: rivSlug, name: civNameEs(rivSlug) },
      threatLabel: `Rival cambia a ${LINE_META[rivalThreat].label}`,
      prompt: `Jugás ${civNameEs(mySlug)} abriendo con ${LINE_META[initLine].label}. Al entrar en Imperial, ${civNameEs(rivSlug)} gira a ${LINE_META[rivalThreat].label}. ¿Qué transición válida en tu árbol tecnológico da la mejor respuesta?`,
      options: [
        makeLineOption(switchLine, true),
        ...distractors.map((d) => makeLineOption(d, false)),
      ],
      explanation: `${civNameEs(mySlug)} dispone de ${LINE_META[switchLine].label} en Edad Imperial para neutralizar ${LINE_META[rivalThreat].label} de ${civNameEs(rivSlug)}.`,
    });
  }

  // 3B. Sin Pureza de sangre (civs CON Establo/Caballería y SIN Paladín, para no solapar Nivel 7)
  const l3NoBloodlines = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && !hasNode(s, 'Bloodlines') && !hasNode(s, 'Paladin'));
  for (const slug of l3NoBloodlines) {
    const id = `l3_bl_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(
      VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && hasNode(s, 'Bloodlines')),
      rng
    ).slice(0, 3);
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Establo · Brecha',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Pureza de sangre (+20 PS)',
      prompt: '¿Cuál de estas cuatro civilizaciones con Establo NO dispone de «Pureza de sangre» (+20 PS para caballería)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} carece de Pureza de sangre en el Establo; las otras tres civilizaciones sí cuentan con ella.`,
    });
  }

  // 3C. Sin Ganadería (civs CON Establo y SIN Paladín — Cumans y Teutons reservados a Nivel 7)
  const l3NoHusb = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && !hasNode(s, 'Husbandry') && !hasNode(s, 'Paladin'));
  for (const slug of l3NoHusb) {
    const id = `l3_husb_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(
      VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && hasNode(s, 'Husbandry')),
      rng
    ).slice(0, 3);
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Establo · Movilidad',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Ganadería (+10 % vel.)',
      prompt: '¿Cuál de estas civilizaciones con caballería NO tiene «Ganadería» en el Establo?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} no dispone de Ganadería (+10 % velocidad de caballería).`,
    });
  }

  // 3D. Sin Alabardero (13 preguntas)
  const l3NoHalb = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Halberdier'));
  for (const slug of l3NoHalb) {
    const id = `l3_halb_${slug}`;
    const rng = makeRng(id);
    const poolHave = ['Champion', 'Two-Handed Swordsman', 'Arson', 'Squires', 'Gambesons', 'Plate Mail Armor', 'Blast Furnace', 'Hussar', 'Arbalester']
      .filter((n) => hasNode(slug, n));
    if (poolHave.length < 3) continue;
    const decoys = shuffleWithRng(poolHave, rng).slice(0, 3);
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Cuarteles · Imperial',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: { slug, name: civNameEs(slug) },
      rivalCiv: null,
      threatLabel: 'Defensa anticaballería',
      prompt: `Al jugar ${civNameEs(slug)} contra caballería pesada en Imperial, ¿cuál de estas mejoras NO existe en su árbol?`,
      options: [
        makeNodeOption('Halberdier', true),
        ...decoys.map((n) => makeNodeOption(n, false)),
      ],
      explanation: `${civNameEs(slug)} carece de Alabardero en Edad Imperial (se queda en Piquero o depende de otras unidades).`,
    });
  }

  // 3E. Sin Campeón pese a tener Espadachín de mandoble (10 preguntas)
  const l3NoChamp = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Two-Handed Swordsman') && !hasNode(s, 'Champion'));
  for (const slug of l3NoChamp) {
    const id = `l3_champ_${slug}`;
    const rng = makeRng(id);
    const poolHave = ['Two-Handed Swordsman', 'Halberdier', 'Squires', 'Arson', 'Gambesons', 'Plate Mail Armor', 'Blast Furnace', 'Iron Casting']
      .filter((n) => hasNode(slug, n));
    if (poolHave.length < 3) continue;
    const decoys = shuffleWithRng(poolHave, rng).slice(0, 3);
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Infantería Imperial',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: { slug, name: civNameEs(slug) },
      rivalCiv: null,
      threatLabel: 'Tope de infantería',
      prompt: `${civNameEs(slug)} cuenta con Espadachín de mandoble, pero ¿cuál de estas tecnologías o mejoras de infantería NO tiene?`,
      options: [
        makeNodeOption('Champion', true),
        ...decoys.map((n) => makeNodeOption(n, false)),
      ],
      explanation: `${civNameEs(slug)} se detiene en Espadachín de mandoble y no accede a Campeón.`,
    });
  }

  /* =========================================================================
   * NIVEL 4 · 1450–1600 ELO · Picos Tempranos, Pólvora/Asedio y Herrería
   * ========================================================================= */
  // 4A. Picos tecnológicos 1 edad antes (verificados por entero de edad en civ-tech.json)
  const earlyAccessPairs = [
    ['armenians', 'Long Swordsman', 2],
    ['armenians', 'Champion', 3],
    ['armenians', 'Halberdier', 3],
    ['burgundians', 'Cavalier', 3],
    ['burgundians', 'Double-Bit Axe', 1],
    ['burgundians', 'Bow Saw', 2],
    ['cumans', 'Battering Ram', 2],
    ['cumans', 'Capped Ram', 3],
    ['bohemians', 'Chemistry', 3],
    ['bohemians', 'Hand Cannoneer', 3],
    ['jurchens', 'Siege Engineers', 3],
    ['khitans', 'Heavy Cavalry Archer', 3],
    ['persians', 'Parthian Tactics', 3],
  ];
  for (const [slug, node, expectedAge] of earlyAccessPairs) {
    if (nodeAge(slug, node) !== expectedAge) continue;
    const id = `l4_early_${slug}_${node.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const rng = makeRng(id);
    const stdPool = VALID_CIV_SLUGS.filter((s) => s !== slug && nodeAge(s, node) != null && nodeAge(s, node) > expectedAge);
    const decoys = shuffleWithRng(stdPool, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(4, {
      id,
      category: 'early_access',
      modeLabel: 'Pico Temprano',
      age: expectedAge,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: `${OFFICIAL_NODE_ES[node].es} en ${AGE_META[expectedAge].label}`,
      prompt: `¿Cuál de estas civilizaciones desbloquea «${OFFICIAL_NODE_ES[node].es}» una edad antes que el resto (en ${AGE_META[expectedAge].label})?`,
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} accede a ${OFFICIAL_NODE_ES[node].es} ya en ${AGE_META[expectedAge].label}, una edad entera antes que las civilizaciones estándar.`,
    });
  }

  // 4B. Acceso a pólvora y asedio pesado (24 preguntas)
  const heavySiegeNodes = ['Bombard Cannon', 'Siege Onager', 'Siege Ram', 'Hand Cannoneer'];
  for (const hNode of heavySiegeNodes) {
    const have = VALID_CIV_SLUGS.filter((s) => hasNode(s, hNode));
    const miss = VALID_CIV_SLUGS.filter((s) => !hasNode(s, hNode));
    const rngTop = makeRng(`l4_sg_${hNode}`);
    const chosen = shuffleWithRng(have, rngTop).slice(0, 6);
    for (const slug of chosen) {
      const id = `l4_sg_${hNode.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(miss, rng).slice(0, 3);
      addQ(4, {
        id,
        category: 'siege_access',
        modeLabel: 'Asedio y Pólvora',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: null,
        rivalCiv: null,
        threatLabel: OFFICIAL_NODE_ES[hNode].es,
        prompt: `¿Cuál de estas cuatro civilizaciones SÍ tiene acceso a «${OFFICIAL_NODE_ES[hNode].es}» en Edad Imperial?`,
        options: [
          makeCivOption(slug, true),
          ...decoys.map((d) => makeCivOption(d, false)),
        ],
        explanation: `${civNameEs(slug)} dispone de ${OFFICIAL_NODE_ES[hNode].es} en Edad Imperial; las otras tres carecen de esta unidad.`,
      });
    }
  }

  // 4C. Brechas críticas de Herrería Imperial (22 preguntas)
  const smithAudit = [
    { node: 'Plate Mail Armor', civs: VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Plate Mail Armor')).slice(0, 9) },
    { node: 'Blast Furnace', civs: VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Blast Furnace') && !hasNode(s, 'Paladin')).slice(0, 8) },
    { node: 'Plate Barding Armor', civs: VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Knight') && !hasNode(s, 'Paladin') && !hasNode(s, 'Hussar') && !hasNode(s, 'Plate Barding Armor')).slice(0, 5) },
  ];
  const allSmithKeys = ['Plate Mail Armor', 'Plate Barding Armor', 'Ring Archer Armor', 'Blast Furnace', 'Bracer', 'Chain Mail Armor', 'Iron Casting', 'Bodkin Arrow'];
  for (const grp of smithAudit) {
    for (const slug of grp.civs) {
      const present = allSmithKeys.filter((k) => k !== grp.node && hasNode(slug, k));
      if (present.length < 3) continue;
      const id = `l4_smith_${grp.node.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(present, rng).slice(0, 3);
      addQ(4, {
        id,
        category: 'blacksmith_gap',
        modeLabel: 'Herrería Imperial',
        age: 4,
        mapName: 'Arabia',
        mapSlug: 'arabia',
        myCiv: { slug, name: civNameEs(slug) },
        rivalCiv: null,
        threatLabel: 'Mejoras de Herrería',
        prompt: `¿Cuál de estas mejoras de Herrería falta en el árbol tecnológico de ${civNameEs(slug)}?`,
        options: [
          makeNodeOption(grp.node, true),
          ...decoys.map((k) => makeNodeOption(k, false)),
        ],
        explanation: `${civNameEs(slug)} no dispone de ${OFFICIAL_NODE_ES[grp.node].es} en la Herrería.`,
      });
    }
  }

  /* =========================================================================
   * NIVEL 5 · 1600–1750 ELO · Monasterio Competitivo y Brechas de Rango/Asedio
   * ========================================================================= */
  const monkPool = ['Redemption', 'Block Printing', 'Heresy', 'Sanctity', 'Fervor', 'Atonement', 'Illumination', 'Theocracy', 'Faith'];
  const l5MonkSpecs = [
    { node: 'Redemption', limit: 14, ctx: 'defensa contra Mangana / asedio enemigo' },
    { node: 'Block Printing', limit: 11, ctx: 'duelos de Monjes (+3 alcance en Imperial)' },
    { node: 'Heresy', limit: 10, ctx: 'proteger caballería o elefantes de conversiones' },
    { node: 'Sanctity', limit: 9, ctx: 'supervivencia de Monjes (+15 PS)' },
  ];
  for (const spec of l5MonkSpecs) {
    const missingCivs = VALID_CIV_SLUGS.filter((s) => !hasNode(s, spec.node));
    const chosen = shuffleWithRng(missingCivs, makeRng(`l5_${spec.node}`)).slice(0, spec.limit);
    for (const slug of chosen) {
      const present = monkPool.filter((k) => k !== spec.node && hasNode(slug, k));
      if (present.length < 3) continue;
      const id = `l5_monk_${spec.node.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(present, rng).slice(0, 3);
      addQ(5, {
        id,
        category: 'monastery_gap',
        modeLabel: 'Monasterio Competitivo',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: { slug, name: civNameEs(slug) },
        rivalCiv: null,
        threatLabel: 'Tecnologías de Monasterio',
        prompt: `En partidas de Monasterio (${spec.ctx}), ¿qué tecnología clave NO existe en el árbol de ${civNameEs(slug)}?`,
        options: [
          makeNodeOption(spec.node, true),
          ...decoys.map((k) => makeNodeOption(k, false)),
        ],
        explanation: `${civNameEs(slug)} carece de ${OFFICIAL_NODE_ES[spec.node].es} (${OFFICIAL_NODE_ES[spec.node].sub}).`,
      });
    }
  }

  // 5B. Sin Ingenieros de asedio (civs SIN Onagro de asedio ni Cañón de asedio — disjoint de Nivel 7)
  const l5NoSE = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Siege Engineers') && !hasNode(s, 'Siege Onager') && !hasNode(s, 'Bombard Cannon'));
  for (const slug of l5NoSE) {
    const id = `l5_se_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Siege Engineers')), rng).slice(0, 3);
    addQ(5, {
      id,
      category: 'tech_gap',
      modeLabel: 'Universidad · Asedio',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Ingenieros de asedio',
      prompt: '¿Cuál de estas civilizaciones NO tiene «Ingenieros de asedio» (+1 alcance y +20 % daño a edificios) en la Universidad?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} no cuenta con Ingenieros de asedio en la Universidad.`,
    });
  }

  // 5C. Sin Armadura de anillos de arquero (civs SIN Arbalestero — disjoint de Nivel 7)
  const l5NoRAA = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Ring Archer Armor') && !hasNode(s, 'Arbalester'));
  for (const slug of l5NoRAA) {
    const id = `l5_raa_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Arbalester') && hasNode(s, 'Ring Archer Armor')), rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(5, {
      id,
      category: 'tech_gap',
      modeLabel: 'Herrería · Rango',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Armadura de anillos de arquero',
      prompt: 'Entre estas civilizaciones sin Arbalestero, ¿cuál también carece de «Armadura de anillos de arquero» (debilitando Guerrilleros y unidades a distancia)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} carece de Armadura de anillos de arquero en Edad Imperial.`,
    });
  }

  // 5D. Sin Brazal (civs SIN Arbalestero — Malians reservado a Nivel 7)
  const l5NoBracer = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Bracer') && !hasNode(s, 'Arbalester'));
  for (const slug of l5NoBracer) {
    const id = `l5_brac_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Arbalester') && hasNode(s, 'Bracer')), rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(5, {
      id,
      category: 'tech_gap',
      modeLabel: 'Herrería · Brazal',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Brazal (+1 ataque y alcance)',
      prompt: '¿Cuál de estas civilizaciones NO dispone de «Brazal» (afectando el alcance de Castillos, Guerrilleros y torres en Imperial)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} no dispone de Brazal en Edad Imperial.`,
    });
  }

  /* =========================================================================
   * NIVEL 6 · 1750–1900 ELO · Guerra Sin Oro (Trash) y Post-Imperial
   * ========================================================================= */
  const isFuHussar = (s) => (hasNode(s, 'Hussar') || hasNode(s, 'Winged Hussar')) && hasNode(s, 'Bloodlines') && hasNode(s, 'Husbandry') && hasNode(s, 'Plate Barding Armor') && hasNode(s, 'Blast Furnace');
  const isFuHalb = (s) => hasNode(s, 'Halberdier') && hasNode(s, 'Plate Mail Armor') && hasNode(s, 'Blast Furnace') && hasNode(s, 'Squires');
  const isFuSkirm = (s) => (hasNode(s, 'Elite Skirmisher') || hasNode(s, 'Imperial Skirmisher')) && hasNode(s, 'Bracer') && hasNode(s, 'Ring Archer Armor');

  const fuHussarCivs = VALID_CIV_SLUGS.filter(isFuHussar);
  const partialHussarCivs = VALID_CIV_SLUGS.filter((s) => (hasNode(s, 'Hussar') || hasNode(s, 'Winged Hussar')) && !isFuHussar(s));

  for (const slug of fuHussarCivs.slice(0, 14)) {
    const id = `l6_trash_hussar_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(partialHussarCivs, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Post-Imperial · Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Húsar al 100 % completo',
      prompt: 'Se agotó el oro en el mapa. Las cuatro tienen Húsar, pero ¿cuál lo posee al 100 % completo (Pureza de sangre, Ganadería, Barda de placas y Alto horno)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} tiene todas las mejoras de Húsar al 100 %; a las otras tres les falta al menos una mejora de Establo o Herrería.`,
    });
  }

  const fuHalbCivs = VALID_CIV_SLUGS.filter(isFuHalb);
  const partialHalbCivs = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Halberdier') && !isFuHalb(s));
  for (const slug of fuHalbCivs.slice(0, 14)) {
    const id = `l6_trash_halb_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(partialHalbCivs, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Post-Imperial · Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Alabardero al 100 %',
      prompt: 'Las cuatro disponen de Alabardero, pero ¿cuál lo tiene 100 % completo (Armadura de placas de malla, Alto horno y Escuderos)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} cuenta con Alabardero completo al 100 %; las otras tres pierden al menos una mejora clave.`,
    });
  }

  const fuSkirmCivs = VALID_CIV_SLUGS.filter(isFuSkirm);
  const partialSkirmCivs = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Elite Skirmisher') && !isFuSkirm(s));
  for (const slug of fuSkirmCivs.slice(0, 12)) {
    const id = `l6_trash_skirm_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(partialSkirmCivs, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Post-Imperial · Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Guerrillero de élite al 100 %',
      prompt: '¿Cuál de estas cuatro civilizaciones tiene Guerrillero de élite al 100 % en Herrería (Brazal + Armadura de anillos de arquero)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} dispone de Brazal y Armadura de anillos de arquero completos para sus Guerrilleros de élite.`,
    });
  }

  // 6D. Los árboles trash 100 % perfectos (Húsar + Alabardero + Guerrillero completos)
  const tripleTrash = VALID_CIV_SLUGS.filter((s) => isFuHussar(s) && isFuHalb(s) && isFuSkirm(s));
  const twoOfThreeTrash = VALID_CIV_SLUGS.filter((s) => {
    const cnt = (isFuHussar(s) ? 1 : 0) + (isFuHalb(s) ? 1 : 0) + (isFuSkirm(s) ? 1 : 0);
    return cnt === 2;
  });
  for (const slug of tripleTrash) {
    const id = `l6_trash_triple_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(twoOfThreeTrash, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Trinidad Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Húsar + Alabardero + Guerrillero',
      prompt: '¿Cuál de estas civilizaciones posee las TRES unidades sin oro (Húsar, Alabardero y Guerrillero de élite) al 100 % de mejoras de Herrería y cuartel/establo?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} es una de las rarísimas civilizaciones con las tres líneas sin oro al 100 % completas.`,
    });
  }

  // 6E. Economía y fortificación post-Imperial (16 preguntas)
  const lateNodes = ['Guilds', 'Two-Man Saw', 'Architecture', 'Fortified Wall', 'Hoardings', 'Stone Shaft Mining'];
  const ecoDecoyPool = ['Guilds', 'Two-Man Saw', 'Architecture', 'Fortified Wall', 'Hoardings', 'Stone Shaft Mining', 'Gold Shaft Mining', 'Crop Rotation', 'Masonry'];
  for (const lNode of lateNodes) {
    const missing = shuffleWithRng(VALID_CIV_SLUGS.filter((s) => !hasNode(s, lNode)), makeRng(`l6_late_${lNode}`)).slice(0, 3);
    for (const slug of missing) {
      const present = ecoDecoyPool.filter((k) => k !== lNode && hasNode(slug, k));
      if (present.length < 3) continue;
      const id = `l6_late_${lNode.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(present, rng).slice(0, 3);
      addQ(6, {
        id,
        category: 'late_eco',
        modeLabel: 'Economía Post-Imperial',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: { slug, name: civNameEs(slug) },
        rivalCiv: null,
        threatLabel: 'Tecnologías de cierre',
        prompt: `En partida muy larga con ${civNameEs(slug)}, ¿cuál de estas tecnologías económicas o de fortificación NO existe en su árbol?`,
        options: [
          makeNodeOption(lNode, true),
          ...decoys.map((k) => makeNodeOption(k, false)),
        ],
        explanation: `${civNameEs(slug)} carece de ${OFFICIAL_NODE_ES[lNode].es} (${OFFICIAL_NODE_ES[lNode].sub}).`,
      });
    }
  }

  /* =========================================================================
   * NIVEL 7 · 1900–2200+ ELO · «MUY MUY DIFÍCIL · GRAN MAESTRO IMPERIAL»
   * Todas las 4 opciones comparten la MISMA unidad insignia — cero descarte obvio.
   * ========================================================================= */
  const l7Paradoxes = [
    { capstone: 'Paladin', missing: 'Bloodlines', label: 'Paladín sin Pureza de sangre' },
    { capstone: 'Paladin', missing: 'Blast Furnace', label: 'Paladín sin Alto horno' },
    { capstone: 'Paladin', missing: 'Husbandry', label: 'Paladín sin Ganadería' },
    { capstone: 'Paladin', missing: 'Plate Barding Armor', label: 'Paladín sin Barda de placas' },
    { capstone: 'Arbalester', missing: 'Bracer', label: 'Arbalestero sin Brazal' },
    { capstone: 'Arbalester', missing: 'Ring Archer Armor', label: 'Arbalestero sin Armadura de anillos' },
    { capstone: 'Arbalester', missing: 'Thumb Ring', label: 'Arbalestero sin Dactilera' },
    { capstone: 'Heavy Cavalry Archer', missing: 'Parthian Tactics', label: 'Arq. cab. pesada sin Tácticas de los partos' },
    { capstone: 'Heavy Cavalry Archer', missing: 'Ring Archer Armor', label: 'Arq. cab. pesada sin Armadura de anillos' },
    { capstone: 'Siege Onager', missing: 'Siege Engineers', label: 'Onagro de asedio sin Ingenieros de asedio' },
    { capstone: 'Bombard Cannon', missing: 'Siege Engineers', label: 'Cañón de asedio sin Ingenieros de asedio' },
  ];

  for (const px of l7Paradoxes) {
    const trapped = VALID_CIV_SLUGS.filter((s) => hasNode(s, px.capstone) && !hasNode(s, px.missing));
    const complete = VALID_CIV_SLUGS.filter((s) => hasNode(s, px.capstone) && hasNode(s, px.missing));
    if (complete.length < 3) continue;
    const capEs = OFFICIAL_NODE_ES[px.capstone].es;
    const missEs = OFFICIAL_NODE_ES[px.missing].es;
    const picks = trapped.slice(0, 8);
    for (const slug of picks) {
      const id = `l7_px_${px.capstone.toLowerCase().replace(/\s+/g, '_')}_no_${px.missing.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(complete, rng).slice(0, 3);
      addQ(7, {
        id,
        category: 'grandmaster_paradox',
        modeLabel: 'Paradoja Gran Maestro',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: null,
        rivalCiv: null,
        threatLabel: px.label,
        prompt: `Las cuatro civilizaciones poseen «${capEs}», pero UNA sola pierde «${missEs}» en su árbol tecnológico. ¿Cuál es?`,
        options: [
          makeCivOption(slug, true),
          ...decoys.map((d) => makeCivOption(d, false)),
        ],
        explanation: `${civNameEs(slug)} tiene ${capEs} pero NO tiene ${missEs}; ${decoys.map((d) => civNameEs(d)).join(', ')} sí cuentan con ambas.`,
      });
    }
  }

  // 7B. Cohorts 100 % FU élite (Paladín FU, Arq. cab. pesada FU, Monasterio 100 % con Herejía)
  const isFuPaladin = (s) => hasNode(s, 'Paladin') && hasNode(s, 'Bloodlines') && hasNode(s, 'Husbandry') && hasNode(s, 'Plate Barding Armor') && hasNode(s, 'Blast Furnace');
  const fuPaladins = VALID_CIV_SLUGS.filter(isFuPaladin);
  const nonFuPaladins = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Paladin') && !isFuPaladin(s));
  for (const slug of fuPaladins) {
    const id = `l7_fu_paladin_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(nonFuPaladins, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(7, {
      id,
      category: 'grandmaster_fu',
      modeLabel: 'Élite 100 % FU',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Paladín 100 % completo',
      prompt: 'Las cuatro poseen Paladín, pero ¿cuál de ellas tiene TODAS las tecnologías de apoyo genéricas (Pureza de sangre, Ganadería, Barda de placas y Alto horno)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} cuenta con Paladín 100 % completo en Establo y Herrería; cada una de las otras tres carece de alguna mejora.`,
    });
  }

  const isFuHca = (s) => hasNode(s, 'Heavy Cavalry Archer') && hasNode(s, 'Bloodlines') && hasNode(s, 'Husbandry') && hasNode(s, 'Thumb Ring') && hasNode(s, 'Parthian Tactics') && hasNode(s, 'Bracer') && hasNode(s, 'Ring Archer Armor');
  const fuHcas = VALID_CIV_SLUGS.filter(isFuHca);
  const nonFuHcas = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Heavy Cavalry Archer') && !isFuHca(s));
  for (const slug of fuHcas) {
    const id = `l7_fu_hca_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(nonFuHcas, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(7, {
      id,
      category: 'grandmaster_fu',
      modeLabel: 'Élite 100 % FU',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Arq. cab. pesada 100 %',
      prompt: 'Las cuatro tienen Arquero de caballería pesada, pero ¿cuál dispone del árbol 100 % completo (Pureza, Ganadería, Dactilera, Tácticas de los partos, Brazal y Armadura de anillos)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} es una de las pocas civilizaciones con Arquero de caballería pesada 100 % completo sin ninguna falta.`,
    });
  }

  const isFullMonkHeresy = (s) => hasNode(s, 'Redemption') && hasNode(s, 'Block Printing') && hasNode(s, 'Sanctity') && hasNode(s, 'Fervor') && hasNode(s, 'Illumination') && hasNode(s, 'Theocracy') && hasNode(s, 'Heresy');
  const fullMonks = VALID_CIV_SLUGS.filter(isFullMonkHeresy);
  const nearFullMonks = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Redemption') && hasNode(s, 'Block Printing') && !hasNode(s, 'Heresy'));
  for (const slug of fullMonks.slice(0, 6)) {
    const id = `l7_fu_monk_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(nearFullMonks, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(7, {
      id,
      category: 'grandmaster_fu',
      modeLabel: 'Monasterio Perfecto',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Redención + Imprenta + Herejía',
      prompt: 'Las cuatro tienen Redención y Letras de imprenta, pero ¿cuál de ellas además cuenta con «Herejía» en un Monasterio completo?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} dispone de Redención, Letras de imprenta y Herejía simultáneamente.`,
    });
  }

  const allQuestions = [
    ...byLevel[1], ...byLevel[2], ...byLevel[3], ...byLevel[4],
    ...byLevel[5], ...byLevel[6], ...byLevel[7],
  ];

  _cachedCatalog = {
    byLevel,
    byId,
    allQuestions,
    totalCount: allQuestions.length,
    countsByLevel: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((lvl) => [lvl, byLevel[lvl].length])),
  };
  return _cachedCatalog;
}

function getLevelConfig(level) {
  const n = Math.max(1, Math.min(7, Number(level) || 1));
  return LEVEL_CONFIG[n - 1];
}

function getCatalogQuestionById(questionId) {
  const cat = buildArenaCatalog();
  return cat.byId.get(String(questionId || '')) || null;
}

function pickNextQuestionForLevel({ level = 1, masteryCompleted = false, answeredCorrectIds = [], seed = Date.now() }) {
  const cat = buildArenaCatalog();
  const solvedSet = new Set(Array.isArray(answeredCorrectIds) ? answeredCorrectIds : []);
  const targetLvl = Math.max(1, Math.min(7, Number(level) || 1));

  // In Prestige / Endless Master mode (after beating Level 7), draw from elite Levels 6 + 7!
  const pool = (masteryCompleted && targetLvl === 7)
    ? [...cat.byLevel[7], ...cat.byLevel[6]]
    : (cat.byLevel[targetLvl] || cat.byLevel[1]);

  if (!pool.length) return null;
  const unsolved = pool.filter((q) => !solvedSet.has(q.id));
  const candidates = unsolved.length ? unsolved : pool;
  const rng = makeRng(Number(seed) ^ (solvedSet.size * 2654435761));
  const pick = candidates[Math.floor(rng() * candidates.length)] || candidates[0];
  return {
    ...pick,
    poolExhausted: unsolved.length === 0,
    unsolvedInLevel: unsolved.length,
    totalInLevel: pool.length,
  };
}

function evaluateArenaAnswer(questionId, selectedOptionId, timedOut = false) {
  const q = getCatalogQuestionById(questionId);
  if (!q) return { ok: false, error: 'unknown_question' };
  const correctOpt = q.options.find((o) => o.correct) || q.options[0];
  const isCorrect = !timedOut && Boolean(selectedOptionId && correctOpt && String(selectedOptionId) === String(correctOpt.id));
  return {
    ok: true,
    question: q,
    isCorrect,
    correctOptionId: correctOpt?.id || null,
    correctTitle: correctOpt?.title || '',
    explanation: q.explanation,
  };
}

// Backward-compatible batch generator (used by existing tests / quick drills)
function generateArenaBatch({ mode = 'mixed', count = 5, seed = Date.now(), level = null } = {}) {
  const cat = buildArenaCatalog();
  let pool = level ? (cat.byLevel[Math.max(1, Math.min(7, Number(level)))] || cat.allQuestions) : cat.allQuestions;
  if (mode === 'counter_pick') {
    pool = cat.allQuestions.filter((q) => q.category === 'counter_pick');
  } else if (mode === 'transition_dilemma') {
    pool = cat.allQuestions.filter((q) => q.category === 'transition_dilemma');
  } else if (mode === 'tech_gap') {
    pool = cat.allQuestions.filter((q) => ['tech_gap', 'blacksmith_gap', 'monastery_gap', 'grandmaster_paradox'].includes(q.category));
  }
  if (!pool.length) pool = cat.allQuestions;
  const rng = makeRng(seed);
  return shuffleWithRng(pool, rng).slice(0, Math.max(1, Math.min(20, Number(count) || 5)));
}

module.exports = {
  LEVEL_CONFIG,
  OFFICIAL_NODE_ES,
  VALID_CIV_SLUGS,
  buildArenaCatalog,
  getLevelConfig,
  getCatalogQuestionById,
  pickNextQuestionForLevel,
  evaluateArenaAnswer,
  generateArenaBatch,
};
