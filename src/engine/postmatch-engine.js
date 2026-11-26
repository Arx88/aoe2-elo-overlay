'use strict';

/**
 * Motor unificado de análisis post-partida desde el .aoe2record local.
 *
 * Extrae hechos deterministas y comparables (Vos vs Rival) en < 50 ms sin
 * abrir el juego ni depender de CaptureAge:
 *   - TC inactivo estimado por colas (atribución a un único TC + descuento de
 *     investigaciones reales del TC: Telar, Edades, Carretilla, Carro de mano).
 *   - Producción de aldeanos, Centros Urbanos y composición militar completa
 *     por edificio (256 unidades y 40 edificios con nombres oficiales en español).
 *   - Curva acumulada por tramos de tiempo (Vos vs Rival en el mismo reloj).
 *   - eAPM real (filtrado de clics repetidos < 150 ms), reparto Eco vs Militar
 *     y hábitos de micro (Attack-Move, Patrol, Mercado, Campana Urbana).
 *   - Destacados ganados con cifras comprobables y 1 foco accionable universal.
 */

const TABLE = require('./unit-names.json');
const {
  normalizeCivSlug,
  civHasTech,
  civHasTechByAge,
  evaluateCivMastery,
} = require('./civ-mastery');

const VERSION = 'postmatch-engine-v1';
const ENGINE_REV = 2;
const UNIT_TABLE = TABLE.units || {};
const BUILDING_TABLE = TABLE.buildings || {};
const VILLAGERS = new Set([83, 293]);
const VILLAGER_TRAIN_S = 25;
/** Tope de cola por TC (6 aldeanos = 150 s) para permitir colas reales de 4+ aldeanos sin truncar el inicio de Alta Edad. */
const TC_MAX_QUEUE_AHEAD_MS = 150_000;
/** Unidades económicas/civiles que NO son militares (Pesquero, Barco mercante, Carreta de mercancías, Transporte, Mula). */
const CIVILIAN_UNIT_IDS = new Set([13, 17, 128, 204, 545, 1808]);

/** Investigaciones que ocupan la cola del Centro Urbano (duración base en s). */
const TC_RESEARCH_SECONDS = Object.freeze({
  22: 25,   // Telar (Loom)
  101: 130, // Edad Feudal
  102: 160, // Edad de los Castillos
  103: 190, // Edad Imperial
  213: 75,  // Carretilla (Wheelbarrow)
  249: 55,  // Carro de mano (Hand Cart)
  8: 25,    // Guardia urbana (Town Watch)
  280: 40,  // Patrulla urbana (Town Patrol)
});

/** IDs verificados en replays reales de AoE2 DE. */
const ECO_TECH_NAMES = Object.freeze({
  202: 'Hacha de doble filo',
  203: 'Sierra de arco',
  221: 'Sierra a dos manos',
  14: 'Collera',
  13: 'Arado pesado',
  12: 'Rotación de cultivos',
  1014: 'Domesticación',
  1013: 'Pastoralismo',
  1012: 'Trashumancia',
  55: 'Minería de oro',
  182: 'Canteras de oro',
  278: 'Minería de piedra',
  279: 'Canteras de piedra',
  213: 'Carretilla',
  249: 'Carro de mano',
});

const BLACKSMITH_TECH_NAMES = Object.freeze({
  67: 'Forja',
  68: 'Fundición de hierro',
  75: 'Alto horno',
  74: 'Armadura de láminas para infantería',
  76: 'Cota de malla para infantería',
  77: 'Armadura de placas para infantería',
  81: 'Armadura de láminas para caballería',
  82: 'Cota de malla para caballería',
  80: 'Armadura de placas para caballería',
  199: 'Emplumado',
  200: 'Punzones',
  201: 'Brazalete de cuero',
  211: 'Armadura acolchada para arqueros',
  212: 'Armadura de cuero para arqueros',
  219: 'Armadura de anillas para arqueros',
});

const COMBAT_KEY_TECH_NAMES = Object.freeze({
  435: 'Pureza de sangre',
  39: 'Ganadería',
  437: 'Dactilera',
  436: 'Tácticas de los partos',
  93: 'Balística',
  47: 'Química',
  377: 'Ingenieros de asedio',
  315: 'Leva',
});

const MILITARY_BUILDING_TYPES = new Set([10, 12, 14, 20, 45, 49, 82, 86, 87, 101, 104, 153, 498, 1251, 1665, 1806, 2556]);
const MILITARY_COMMANDS = new Set(['Move', 'DeAttackMove', 'AttackGround', 'Patrol', 'Formation', 'Stance', 'Target', 'Attack', 'Stop']);
const PURE_COMBAT_COMMANDS = new Set(['DeAttackMove', 'AttackGround', 'Patrol', 'Formation', 'Stance', 'Target', 'Attack', 'Stop']);
const ECO_COMMANDS = new Set(['DeQueue', 'Queue', 'Multiqueue', 'Build', 'Wall', 'Research', 'Buy', 'Sell', 'Tribute', 'Gatherpoint', 'GatherPoint', 'BackToWork', 'Repair', 'Interact']);
const GUNPOWDER_UNIT_IDS = new Set([5, 46, 557, 771, 773, 1126, 1128, 1911]); // Artillero, Jenízaro, Conquistador, Arambai, Granadero (solo armadura arq.)
const RANGED_OVERRIDE_IDS = new Set([827, 829, 1010, 1012, 1738, 1740, 1759, 1761, 1952, 2562, 2564, 2569, 2571]); // Carreta coreana, Zenete, Ratha, Xianbei, Guecha, Boleadoras
const CAVALRY_OVERRIDE_IDS = new Set([755, 757, 869, 871, 886, 887, 1570, 1655, 1657, 1908, 1910, 2566, 2568, 2708, 2709]); // Tarcano, Huszár magiar, Costiller, Pagoda de hierro, Kona, Jarl, Xólotl
const INFANTRY_OVERRIDE_IDS = new Set([751, 2550]); // Explorador águila, Explorador champi
const CAV_ARMOR_ONLY_IDS = new Set([1120, 1122, 1744, 1746]); // Elefante con balista / Elefante de asedio (solo Armadura de cab.)
const SPEAR_LINE_UNIT_IDS = new Set([93, 358, 359, 1786, 1787, 1788]);
const NON_BLACKSMITH_UNIT_IDS = new Set([13, 17, 36, 42, 125, 128, 204, 286, 440, 545, 1001, 1003, 1263, 1704, 1706, 1709, 1808, 1904, 1907, 1923, 1942, 1954, 1962, 1966, 1978, 1980]);
const ALL_GUNPOWDER_SPEED_IDS = new Set([5, 36, 46, 557, 771, 773, 1001, 1003, 1709, 1911]);
const CAMEL_ELEPHANT_SPEED_IDS = new Set([207, 239, 282, 329, 330, 556, 558, 873, 875, 1007, 1009, 1120, 1122, 1132, 1134, 1263, 1744, 1746, 1755]);
const KHITAN_FAST_UNIT_IDS = new Set([6, 7, 93, 358, 359, 441, 448, 546]);
const COMBAT_CLASS_CACHE = new Map();

/**
 * Clasifica cada unidad entrenada según la rama real de Herrería que la beneficia:
 * - cavalry: Armadura cab. (81/82/80) + Ataque cuerpo a cuerpo (67/68/75)
 * - cavArmorOnly: Elefantes con balista / de asedio -> SOLO Armadura cab. (81/82/80)
 * - ranged:  Ataque/alcance arq. (199/200/201) + Armadura arq. (211/212/219)
 * - gunpowder: SOLO Armadura arq. (211/212/219); NO usa Emplumado/Punzones (Artillero, Jenízaro, Conquistador, Arambai, Granadero)
 * - infantry: Armadura inf. (74/76/77) + Ataque cuerpo a cuerpo (67/68/75)
 * - none: Asedio, Monjes, Barcos y Comercio (0 dependencia obligatoria de Herrería terrestre)
 */
function classifyCombatClass(unitId, bType, unit) {
  const cacheKey = `${unitId}:${bType}`;
  const cached = COMBAT_CLASS_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;
  let result;
  if (CAV_ARMOR_ONLY_IDS.has(unitId)) result = 'cavArmorOnly';
  else if (NON_BLACKSMITH_UNIT_IDS.has(unitId) || [45, 49, 84, 104, 1189, 1806].includes(bType)) result = 'none';
  else if (RANGED_OVERRIDE_IDS.has(unitId)) result = 'ranged';
  else if (GUNPOWDER_UNIT_IDS.has(unitId)) result = 'gunpowder';
  else if (CAVALRY_OVERRIDE_IDS.has(unitId)) result = 'cavalry';
  else if (INFANTRY_OVERRIDE_IDS.has(unitId)) result = 'infantry';
  else if (bType === 2556) {
    // Asentamiento (Mapuche/Muisca/Tupí): entrena Lanceros (infantry) y Guerrilleros (ranged)
    result = (unitId === 6 || unitId === 7 || unitId === 1155) ? 'ranged' : 'infantry';
  }
  else if ([101, 86, 153].includes(bType)) result = 'cavalry';
  else if ([87, 10, 14].includes(bType)) result = 'ranged';
  else if ([12, 20, 498].includes(bType)) result = 'infantry';
  else {
    const k = String(unit?.key || '');
    if (/jenizaro|conquistador|artillero|arambai|granadero/.test(k)) result = 'gunpowder';
    else if (/lanzapiedras|trebuchet|petardo|organo|husita|obus|cohete|canon|ariete|onagro|mangana|escorpion|mangonel|monje|misionero|mercante|carreta-de-merc|mula|torre-de-asedio|pesquero|galera|galeon|buque|balsa|bote|thirisadai|lou-chuan|urca|carraca|barco|carabela|dromon|brulote|tortuga|drakkar/.test(k)) result = 'none';
    else if (/arquero|mangudai|chu-ko-nu|plumas|ballestero|kipchak|ratan|genoves|hondero|guerrillero|hostigador|carreta-de-guerra|boleadoras|guecha|xianbei|zenete/.test(k)) result = 'ranged';
    else if (/caballero|paladin|jinete|catafracta|boyardo|tarkan|tarcano|husar|huszar|keshik|leitis|konnik|coustillier|costiller|mameluco|elefante|camello|shrivamsha|monaspa|savar|centurion|estepa|caballeria|pagoda-de-hierro|kona|jarl|explorador/.test(k)) result = 'cavalry';
    else result = 'infantry';
  }
  COMBAT_CLASS_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Tecnologías que ciertas civilizaciones reciben GRATIS al subir de edad
 * (nunca generan una acción `Research` en el replay). Se acreditan al alcanzar
 * la edad correspondiente para evitar falsas acusaciones en Herrería y Eco, y se
 * registran en `state.freeTechIds` para no regalar medallas pasivas de clic manual.
 */
function seedCivFreeTechs(state, startingAge = 'dark') {
  const slug = state.civSlug || normalizeCivSlug(state.civ);
  const fMs = state.feudalReachedMs;
  const cMs = state.castleReachedMs;
  const iMs = state.imperialReachedMs;
  const grantAll = (id, ms) => {
    if (ms == null) return;
    if (!state.allTechs.has(id)) {
      state.allTechs.set(id, ms);
      state.freeTechIds.add(id);
    }
  };
  const grantEco = (id, ms) => {
    if (ms == null) return;
    state.freeTechIds.add(id);
    if (!state.ecoTechs.has(id)) {
      state.ecoTechs.set(id, ms);
    }
    grantAll(id, ms);
  };
  const grantBs = (id, ms) => {
    if (ms == null) return;
    if (!state.blacksmithTechs.has(id)) {
      state.blacksmithTechs.set(id, ms);
      state.freeTechIds.add(id);
    }
    grantAll(id, ms);
  };
  const grantCombat = (id, ms) => {
    if (ms == null) return;
    if (!state.combatTechs.has(id)) {
      state.combatTechs.set(id, ms);
      state.freeTechIds.add(id);
    }
    grantAll(id, ms);
  };

  // Empire Wars inicia en Feudal con Telar, Hacha, Collera (o Domesticación en Kitán) y Carretilla
  if (startingAge === 'feudal' || startingAge === 'castle' || startingAge === 'imperial') {
    if (state.loomMs == null) state.loomMs = 0;
    grantEco(202, 0);
    grantEco(civHasTech(slug, 14) ? 14 : 1014, 0);
    grantEco(213, 0);
  }
  if (slug === 'burmese') {
    grantEco(202, fMs); grantEco(203, cMs); grantEco(221, iMs);
  } else if (slug === 'magyars') {
    grantBs(67, fMs); grantBs(68, cMs); grantBs(75, iMs);
  } else if (slug === 'franks') {
    grantEco(14, fMs); grantEco(13, cMs); grantEco(12, iMs);
  } else if (slug === 'vikings') {
    grantEco(213, fMs); grantEco(249, cMs);
  } else if (slug === 'bohemians') {
    grantEco(55, fMs); grantEco(278, fMs); grantEco(182, cMs); grantEco(279, cMs);
  } else if (slug === 'koreans') {
    grantBs(211, fMs); grantBs(212, cMs); grantBs(219, iMs);
  } else if (slug === 'malay') {
    grantBs(74, fMs); grantBs(76, cMs); grantBs(77, iMs);
  } else if (slug === 'turks') {
    grantAll(254, cMs); // Caballería ligera
    grantAll(428, iMs); // Húsar
    grantCombat(47, iMs); // Química
  } else if (slug === 'tatars') {
    grantCombat(437, cMs); // Dactilera
    grantCombat(436, iMs); // Tácticas de los partos
  } else if (slug === 'vietnamese') {
    grantCombat(315, iMs); // Leva
  } else if (slug === 'slavs') {
    grantAll(602, cMs); // Incendiarismo
    grantAll(875, cMs); // Gambesones
  } else if (slug === 'bulgarians') {
    grantAll(222, fMs); // Hombres de armas
    grantAll(207, cMs); // Espadachín de espada larga
    grantAll(217, iMs); // Espadachín de mandoble
  } else if (slug === 'byzantines') {
    grantAll(8, fMs);   // Guardia urbana (gratis, no ocupa TC)
    grantAll(280, cMs); // Patrulla urbana
  } else if (slug === 'ethiopians') {
    grantAll(197, cMs); // Piquero
  } else if (slug === 'muisca') {
    grantAll(48, cMs);  // Caravana
    grantAll(15, iMs);  // Gremios
  } else if (slug === 'wu') {
    grantAll(374, cMs); // Carenado
    grantAll(375, iMs); // Dique seco
  }
}

function computeArmyTechRelevance(state, durationMs) {
  const cls = state.armyClasses || {};
  const candidates = [
    { id: 'cavalry', label: 'Caballería', units: cls.cavalry || 0 },
    { id: 'cavArmorOnly', label: 'Elefantes de asedio/balista', units: cls.cavArmorOnly || 0 },
    { id: 'ranged', label: 'Unidades a distancia', units: cls.ranged || 0 },
    { id: 'infantry', label: 'Infantería', units: cls.infantry || 0 },
    { id: 'gunpowder', label: 'Pólvora / proyectil', units: cls.gunpowder || 0 },
  ].sort((a, b) => b.units - a.units);

  const primary = candidates[0];
  if (!primary || primary.units < 12) {
    return {
      primaryClass: null,
      primaryLabel: null,
      primaryUnits: 0,
      relevantCount: 0,
      relevantExpected: 0,
      relevantNames: [],
      wellEquipped: false,
      criticalMissing: null,
    };
  }

  const slug = state.civSlug || normalizeCivSlug(state.civ);
  const bs = state.blacksmithTechs;
  const has = (id) => bs.has(id);
  const countIn = (ids) => ids.filter(has).length;
  const namesIn = (ids) => ids.filter(has).map((id) => BLACKSMITH_TECH_NAMES[id]).filter(Boolean);

  const reachedImp = state.imperialReachedMs != null && durationMs - state.imperialReachedMs >= 120_000;
  const reachedCastle = state.castleReachedMs != null && durationMs - state.castleReachedMs >= 120_000;
  const reachedFeudal = state.feudalReachedMs != null && durationMs - state.feudalReachedMs >= 120_000;
  const maxAgeNum = reachedImp ? 4 : reachedCastle ? 3 : reachedFeudal ? 2 : 1;
  const availAtAge = (ids) => ids.filter((id) => civHasTechByAge(slug, id, maxAgeNum));

  let relevantIds = [];
  let relevantExpected = 2;
  let wellEquipped = false;
  let criticalMissing = null;

  if (primary.id === 'cavalry') {
    const armorIds = availAtAge([81, 82, 80]);
    const atkIds = availAtAge([67, 68, 75]);
    relevantIds = [...armorIds, ...atkIds];
    const armor = countIn(armorIds);
    const atk = countIn(atkIds);
    const total = armor + atk;
    relevantExpected = relevantIds.length;
    const needArmor = Math.min(reachedCastle ? 2 : 1, armorIds.length);
    const needTotal = Math.min(reachedCastle ? 3 : 2, relevantExpected);
    wellEquipped = relevantExpected > 0 && (
      (armor >= needArmor && total >= needTotal) ||
      (total >= Math.min(4, relevantExpected) && armor >= needArmor)
    );
    if (reachedCastle && primary.units >= 18 && armorIds.length > 0 && armor === 0) {
      criticalMissing = {
        id: 'neg-bs-cav-armor',
        title: `Peleaste con ${primary.units} unidades de caballería sin armadura de Herrería`,
        metric: '0 armadura de caballería',
        detail: `Tu unidad principal fue caballería pero no investigaste Armadura de láminas/cota: los flechazos y centros urbanos te castigan el doble.`,
        focusTitle: 'Priorizar armadura de caballería en Herrería',
        focusDetail: `Jugaste ${primary.units} unidades de caballería sin armadura de Herrería. Armadura de láminas y Cota de malla son prioridad antes de atacar.`,
      };
    } else if (reachedCastle && primary.units >= 28 && relevantExpected >= 2 && total <= 1) {
      criticalMissing = {
        id: 'neg-bs-cav-low',
        title: `Caballería con pocas mejoras de Herrería (${total}/${relevantExpected})`,
        metric: `${total}/${relevantExpected} en caballería`,
        detail: `Con ${primary.units} unidades de caballería conviene acompañar al menos con las mejoras disponibles de armadura y ataque cuerpo a cuerpo.`,
        focusTitle: 'Acompañar tu caballería con mejoras de Herrería',
        focusDetail: `Solo investigaste ${total} mejora aplicable a tu caballería (${primary.units} unidades). Priorizá armadura + ataque cuerpo a cuerpo.`,
      };
    }
  } else if (primary.id === 'ranged') {
    const atkIds = availAtAge([199, 200, 201]);
    const armorIds = availAtAge([211, 212, 219]);
    relevantIds = [...atkIds, ...armorIds];
    const atk = countIn(atkIds);
    const armor = countIn(armorIds);
    const total = atk + armor;
    relevantExpected = relevantIds.length;
    const hasBallistics = state.combatTechs.has(93);
    const needAtk = Math.min(reachedCastle ? 2 : 1, atkIds.length);
    const needTotal = Math.min(reachedCastle ? 3 : 2, relevantExpected);
    wellEquipped = relevantExpected > 0 && (
      reachedCastle ? (atk >= needAtk && (total >= needTotal || hasBallistics)) : (atk >= needAtk && total >= needTotal)
    );
    if (reachedFeudal && primary.units >= 15 && civHasTech(slug, 199) && !has(199)) {
      criticalMissing = {
        id: 'neg-bs-ranged-fletching',
        title: `Peleaste con ${primary.units} unidades a distancia sin Emplumado`,
        metric: 'Sin Emplumado',
        detail: `Emplumado (+1 ataque y +1 alcance) es la mejora obligatoria para arqueros, guerrilleros y arqueros a caballo.`,
        focusTitle: 'Priorizar Emplumado y Punzones para tus arqueros',
        focusDetail: `Sacaste ${primary.units} unidades a distancia sin Emplumado. El +1 de alcance decide todos los intercambios de arqueros.`,
      };
    } else if (reachedCastle && primary.units >= 20 && has(199) && civHasTech(slug, 200) && !has(200)) {
      criticalMissing = {
        id: 'neg-bs-ranged-bodkin',
        title: `Faltó Punzones (+1 alcance) para tus ${primary.units} unidades a distancia`,
        metric: 'Sin Punzones',
        detail: `En Edad de los Castillos, Punzones es la primera mejora clave apenas subís si tu núcleo es a distancia.`,
        focusTitle: 'Investigar Punzones apenas llegás a Castillos',
        focusDetail: `Con ${primary.units} unidades a distancia, Punzones es el pico de poder inmediato al subir a Castillos.`,
      };
    }
  } else if (primary.id === 'cavArmorOnly') {
    const armorIds = availAtAge([81, 82, 80]);
    relevantIds = [...armorIds];
    const armor = countIn(armorIds);
    relevantExpected = armorIds.length;
    const needArmor = Math.min(2, armorIds.length);
    wellEquipped = armorIds.length > 0 && armor >= needArmor;
    if (reachedCastle && primary.units >= 20 && armorIds.length > 0 && armor === 0) {
      criticalMissing = {
        id: 'neg-bs-cavarmor-only',
        title: `Jugaste ${primary.units} elefantes de balista/asedio sin armadura de caballería`,
        metric: `0/${armorIds.length} armadura de caballería`,
        detail: `Estas unidades NO usan mejoras de arquero ni Forja, pero sí aprovechan Armadura de caballería (láminas/cota/placas).`,
        focusTitle: 'Investigar armadura de caballería para tus elefantes',
        focusDetail: `Los elefantes con balista/asedio toman armadura de caballería en Herrería (no de arquero).`,
      };
    }
  } else if (primary.id === 'gunpowder') {
    const armorIds = availAtAge([211, 212, 219]);
    relevantIds = [...armorIds];
    const armor = countIn(armorIds);
    relevantExpected = armorIds.length;
    const needArmor = Math.min(2, armorIds.length);
    wellEquipped = armorIds.length > 0 && armor >= needArmor;
    if (reachedCastle && primary.units >= 20 && armorIds.length > 0 && armor === 0) {
      criticalMissing = {
        id: 'neg-bs-gp-armor',
        title: `Unidades de pólvora (${primary.units}) sin armadura de arqueros`,
        metric: '0 armadura de arqueros',
        detail: `Artilleros/Jenízaros/Conquistadores/Granaderos no usan Emplumado, pero sí aprovechan la armadura de arqueros disponible.`,
        focusTitle: 'Sumar armadura de arqueros para tu pólvora',
        focusDetail: `Jugaste ${primary.units} unidades de pólvora sin armadura de proyectil. Mejorar armadura de arqueros duplica su aguante.`,
      };
    }
  } else if (primary.id === 'infantry') {
    const armorIds = availAtAge([74, 76, 77]);
    const atkIds = availAtAge([67, 68, 75]);
    const mostlySpears = (cls.spearLine || 0) >= primary.units * 0.75;
    relevantIds = mostlySpears ? [...armorIds] : [...armorIds, ...atkIds];
    const armor = countIn(armorIds);
    const atk = countIn(atkIds);
    const total = armor + atk;
    relevantExpected = relevantIds.length;
    const needArmor = Math.min(reachedCastle ? 2 : 1, armorIds.length);
    const needTotal = Math.min(reachedCastle ? 3 : 2, relevantExpected);
    wellEquipped = relevantExpected > 0 && (
      mostlySpears
        ? (armorIds.length > 0 && armor >= Math.min(2, armorIds.length))
        : (reachedCastle ? (armor >= needArmor && total >= needTotal) : (total >= needTotal))
    );
    if (reachedCastle && !mostlySpears && primary.units >= 20 && relevantExpected > 0 && armor === 0 && atk === 0) {
      criticalMissing = {
        id: 'neg-bs-inf-none',
        title: `Peleaste con ${primary.units} unidades de infantería sin mejoras de Herrería`,
        metric: '0 infantería',
        detail: `La infantería depende de armadura y ataque cuerpo a cuerpo para cerrar distancia y ganar choques.`,
        focusTitle: 'Mejorar armadura y ataque de tu infantería',
        focusDetail: `Sacaste ${primary.units} unidades de infantería sin mejoras aplicables de Herrería.`,
      };
    }
  }

  const relevantNames = namesIn(relevantIds);
  return {
    primaryClass: primary.id,
    primaryLabel: primary.label,
    primaryUnits: primary.units,
    relevantCount: relevantNames.length,
    relevantExpected,
    relevantNames,
    wellEquipped,
    criticalMissing,
  };
}

function readBuildId(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  if (Number.isFinite(payload.building_id) && payload.building_id > 0) return Number(payload.building_id);
  const data = payload.data;
  if (!Array.isArray(data) || data.length < 16) return 0;
  return (data[12] | (data[13] << 8) | (data[14] << 16) | (data[15] << 24)) >>> 0;
}

function readBuildCoords(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y))) {
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (x > 0 && y > 0 && x < 512 && y < 512) return { x, y };
  }
  const data = payload.data;
  if (Array.isArray(data) && data.length >= 12) {
    const buf = Buffer.from(data.slice(4, 12));
    const x = buf.readFloatLE(0);
    const y = buf.readFloatLE(4);
    if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 && x < 512 && y < 512) {
      return { x, y };
    }
  }
  return null;
}

function parseChatMeta(chatOp) {
  if (!chatOp) return null;
  const raw = typeof chatOp === 'string' ? chatOp : (chatOp.message ?? chatOp.text ?? '');
  if (!raw) return null;
  let text = String(raw);
  let playerNum = Number(chatOp.player ?? chatOp.player_number);
  let tauntNum = Number(chatOp.tauntNumber);
  try {
    if (text.trim().startsWith('{')) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        text = String(parsed.message || '');
        if (!Number.isFinite(playerNum) && Number.isFinite(Number(parsed.player))) playerNum = Number(parsed.player);
        if (!Number.isFinite(tauntNum) && Number.isFinite(Number(parsed.tauntNumber))) tauntNum = Number(parsed.tauntNumber);
      }
    }
  } catch { /* raw text */ }
  const clean = text.trim();
  if (!Number.isFinite(tauntNum)) {
    const m = clean.match(/^(\d{1,3})\b/);
    if (m) tauntNum = Number(m[1]);
  }
  const isGg = /\bgg(\s*wp)?\b/i.test(clean);
  return {
    playerNum: Number.isFinite(playerNum) ? playerNum : null,
    tauntNum: Number.isFinite(tauntNum) && tauntNum > 0 && tauntNum <= 250 ? tauntNum : null,
    isGg,
    text: clean,
  };
}

function unitInfo(id) {
  return UNIT_TABLE[id] || { name: `Unidad ${id}`, key: `unidad-${id}`, trainSeconds: 25 };
}

function buildingInfo(id) {
  return BUILDING_TABLE[id] || { name: `Edificio ${id}`, key: `edificio-${id}` };
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function sumIntervalSeconds(intervals) {
  return mergeIntervals(intervals).reduce((total, [s, e]) => total + (e - s), 0) / 1000;
}

function actionInfo(operation) {
  const action = operation && operation.Action;
  const data = action && action.action_data;
  if (!data || typeof data !== 'object') return null;
  let type = null;
  for (const k in data) { type = k; break; }
  if (!type) return null;
  const payload = data[type];
  if (!payload || typeof payload !== 'object') return null;
  const pid = Number(payload.player_id ?? action.player_id ?? (action.game_command && action.game_command.player_id));
  if (!Number.isFinite(pid) || pid <= 0 || pid > 31) return null;
  const ms = Number(action.world_time);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return { type, payload, playerId: pid, ms };
}

function persianTcRate(civ, age = 'dark') {
  const slug = normalizeCivSlug(civ);
  if (slug !== 'persians') return 1;
  if (age === 'imperial') return 1.2;
  if (age === 'castle') return 1.15;
  if (age === 'feudal') return 1.1;
  return 1.05;
}

function villagerTrainMs(civ, age = 'dark') {
  return Math.round((VILLAGER_TRAIN_S * 1000) / persianTcRate(civ, age));
}

function tcResearchDuration(techId, civ, age = 'dark', teamCivSlugs = null) {
  const base = TC_RESEARCH_SECONDS[techId];
  if (!base) return 0;
  const slug = normalizeCivSlug(civ);
  if (techId === 22 && slug === 'goths') return 1;
  const isAgeUp = techId === 101 || techId === 102 || techId === 103;
  let rate = persianTcRate(slug, techId === 101 ? 'dark' : techId === 102 ? 'feudal' : techId === 103 ? 'castle' : age);
  if (isAgeUp && slug === 'malay') rate *= 1.66;
  if (!isAgeUp && slug === 'vietnamese' && (techId === 213 || techId === 249)) rate *= 2.0;
  if (!isAgeUp && ((teamCivSlugs && teamCivSlugs.has('portuguese')) || slug === 'portuguese')) rate *= 1.25;
  return rate > 1 ? Math.round(base / rate) : base;
}

function militaryTrainSpeedMultiplier(state, unitId, bType) {
  let mult = 1;
  const team = state.teamCivSlugs || new Set();
  const slug = state.civSlug;
  if (team.has('huns') && [86, 101, 153].includes(bType)) mult *= 1.20;
  if (team.has('britons') && [10, 14, 87].includes(bType)) mult *= 1.10;
  if (team.has('goths') && [12, 20, 498].includes(bType)) mult *= 1.20;
  if (team.has('celts') && bType === 49) mult *= 1.20;
  if (team.has('lithuanians') && [104, 1806].includes(bType)) mult *= 1.20;
  if (team.has('turks') && ALL_GUNPOWDER_SPEED_IDS.has(unitId)) mult *= 1.25;
  if (team.has('gurjaras') && CAMEL_ELEPHANT_SPEED_IDS.has(unitId)) mult *= 1.25;
  if (slug === 'aztecs') mult *= 1.15;
  if (slug === 'khitans' && KHITAN_FAST_UNIT_IDS.has(unitId)) mult *= 1.15;
  if (state.allTechs.has(493) && [86, 101, 153].includes(bType)) mult *= 1.40; // Código caballeresco (Francos)
  if (state.allTechs.has(457) && [12, 20, 498].includes(bType)) mult *= 2.00;  // Movilización / Perfusion (Godos)
  if (state.allTechs.has(689) && [39, 474, 441, 448, 546, 1370, 1372, 1707].includes(unitId)) mult *= 2.00; // Ganadería de la estepa (Cumanos)
  if (state.allTechs.has(578) && bType === 82) mult *= 1.25;                   // Alcazabas / Kasbah (Bereberes)
  if (state.combatTechs.has(315) && [10, 12, 14, 20, 82, 86, 87, 101, 153, 498, 1251, 1665].includes(bType)) {
    mult *= 1.33;
  }
  return mult;
}

function createSlotState(slot, civ, ages = null, startingAge = 'dark', allyCivs = []) {
  const normStart = String(startingAge || 'dark').toLowerCase();
  const civSlug = normalizeCivSlug(civ);
  const teamCivSlugs = new Set([civSlug, ...(Array.isArray(allyCivs) ? allyCivs.map(normalizeCivSlug) : [])].filter(Boolean));
  const authFeudal = Number.isFinite(ages?.feudal) && ages.feudal > 0;
  const authCastle = Number.isFinite(ages?.castle) && ages.castle > 0;
  const authImperial = Number.isFinite(ages?.imperial) && ages.imperial > 0;
  const feudalReachedMs = authFeudal
    ? ages.feudal
    : (normStart === 'feudal' || normStart === 'castle' || normStart === 'imperial' ? 0 : null);
  const castleReachedMs = authCastle
    ? ages.castle
    : (normStart === 'castle' || normStart === 'imperial' ? 0 : null);
  const imperialReachedMs = authImperial
    ? ages.imperial
    : (normStart === 'imperial' ? 0 : null);
  return {
    slot,
    civ: civ || null,
    civSlug,
    teamCivSlugs,
    startingAge: normStart,
    authoritativeAges: { feudal: authFeudal, castle: authCastle, imperial: authImperial },
    tcs: new Map(),           // buildingKey -> { busyUntil, intervals, villagers }
    seenTcTechs: new Set(),   // evita sumar doble un Research repetido en el replay
    feudalReachedMs,
    castleReachedMs,
    imperialReachedMs,
    feudalClickMs: null,
    firstMilitaryMs: null,
    lastTownBellMs: -Infinity,
    effectiveActionTimes: [],
    militaryActionTimes: [],
    ecoActionTimes: [],
    tcOrderTimes: [],
    marketBought: { food: 0, wood: 0, stone: 0 },
    marketSold: { food: 0, wood: 0, stone: 0 },
    marketEarlyOps: 0,
    workshops: new Map(),     // buildingKey -> { typeId, busyUntil, intervals, units, firstMs, lastMs }
    unitCounts: new Map(),    // unitKey -> { key, name, count }
    unitCountsById: new Map(),// unitId -> { count, firstMs }
    buildsByType: new Map(),  // buildingId -> { count, firstMs, darkCount, feudalCount, castleCount, impCount }
    armyClasses: { cavalry: 0, cavArmorOnly: 0, ranged: 0, infantry: 0, spearLine: 0, gunpowder: 0, none: 0 },
    villagerEvents: [],       // { ms, amount }
    militaryEvents: [],       // { ms, amount }
    villagersOrdered: 0,
    militaryOrdered: 0,
    totalActions: 0,
    effectiveActions: 0,
    lastActionByType: new Map(),
    ecoActions: 0,
    militaryActions: 0,
    moveCount: 0,
    attackMoveCount: 0,
    patrolCount: 0,
    marketCount: 0,
    townBellCount: 0,
    tributesSent: 0,
    selfDeleted: 0,
    formationsCount: 0,
    stancesCount: 0,
    backToWorkCount: 0,
    stopMicroCount: 0,
    wallsPlaced: 0,
    repairsCount: 0,
    farmsBuilt: 0,
    pasturesBuilt: 0,
    housesBuilt: 0,
    castlesBuilt: 0,
    extraTcsBuilt: 0,
    extraTcsBuiltFeudal: 0,
    towersBuilt: 0,
    muleCartsCreated: 0,
    tradeCartsOrdered: 0,
    allTechs: new Map(),       // techId -> ms (todas las tecnologías investigadas o gratis)
    freeTechIds: new Set(),    // techIds acreditadas gratis por civ o Empire Wars
    ecoTechs: new Map(),       // techId -> ms
    blacksmithTechs: new Map(),// techId -> ms
    combatTechs: new Map(),    // techId -> ms
    loomMs: null,
    firstTcOrderMs: null,
    lastTcOrderMs: null,
    flaresCount: 0,
    earlyBuildCoords: [],      // { x, y } en los primeros 6 min (centroide base)
    castleBuildCoords: [],     // { bid, ms, x, y } Castillos / Krepost / Torres
    classMassMs: {},           // combatClass -> primer ms en que alcanza >= 6 unidades
    classEvents: [],           // { ms, cls, amount } para Radar Tech-Switch
  };
}

function ensureTc(state, key) {
  let tc = state.tcs.get(key);
  if (!tc) {
    tc = { id: key, busyUntil: null, intervals: [], queueItems: [], villagers: 0, lastTapMs: -Infinity };
    state.tcs.set(key, tc);
  }
  return tc;
}

function pickShortestQueue(list) {
  list.sort((a, b) => {
    const la = a.busyUntil === null ? -1 : a.busyUntil;
    const lb = b.busyUntil === null ? -1 : b.busyUntil;
    if (la !== lb) return la - lb;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
  return list[0];
}

function premergeTcIntervals(tcs) {
  const out = [];
  let index = 0;
  for (const tc of tcs.values()) {
    const isPrimary = index === 0;
    index += 1;
    if (!tc.intervals.length) continue;
    const merged = mergeIntervals(tc.intervals);
    if (!merged.length) continue;
    out.push({ isPrimary, merged, firstEver: merged[0][0], lastEver: merged[merged.length - 1][1] });
  }
  return out;
}

function tcWindowStats(mergedTcs, winStart, winEnd, { zeroPrimary = false, capEachToLast = false, openingGraceMs = 0 } = {}) {
  if (!mergedTcs.length || !Number.isFinite(winEnd) || winEnd <= winStart) {
    return { idleSeconds: null, utilization: null, busySeconds: 0, windowSeconds: 0, tcCount: 0 };
  }
  let totalBusy = 0;
  let totalWindow = 0;
  let tcCount = 0;
  for (const tc of mergedTcs) {
    const primaryStart = (tc.isPrimary && zeroPrimary)
      ? (openingGraceMs > 0 ? Math.min(tc.firstEver, openingGraceMs) : 0)
      : tc.firstEver;
    const tcStart = Math.max(winStart, primaryStart);
    const tcEnd = Math.min(winEnd, capEachToLast ? tc.lastEver : (tc.isPrimary ? winEnd : tc.lastEver));
    if (tcEnd <= tcStart) continue;
    let busyMs = 0;
    for (const [s, e] of tc.merged) {
      const cs = s > tcStart ? s : tcStart;
      const ce = e < tcEnd ? e : tcEnd;
      if (ce > cs) busyMs += (ce - cs);
    }
    const busy = busyMs / 1000;
    const span = Math.max(busy, (tcEnd - tcStart) / 1000);
    totalBusy += busy;
    totalWindow += span;
    tcCount += 1;
  }
  if (totalWindow <= 0) {
    return { idleSeconds: null, utilization: null, busySeconds: 0, windowSeconds: 0, tcCount: 0 };
  }
  const idleSeconds = Math.max(0, Math.round((totalWindow - totalBusy) * 10) / 10);
  const utilization = Math.max(0, Math.min(100, Math.round((totalBusy / totalWindow) * 1000) / 10));
  return { idleSeconds, utilization, busySeconds: totalBusy, windowSeconds: totalWindow, tcCount };
}

function findBiggestTcGap(state, durationMs, mergedTcs, isRival = false) {
  if (!mergedTcs.length || durationMs < 180_000) return null;
  // Ignorar los últimos 30 s previos a la rendición para no penalizar el cierre de partida.
  const effectiveEnd = Math.max(0, durationMs - 30_000);
  const endLimitMs = state.castleReachedMs != null ? Math.min(state.castleReachedMs, effectiveEnd) : effectiveEnd;
  const feudalMs = state.feudalReachedMs != null ? state.feudalReachedMs : Infinity;
  const isEwStart = state.startingAge === 'feudal' || state.startingAge === 'castle' || state.startingAge === 'imperial';
  // Chinos (-200 comida inicial) y Mayas (5/5 casas al inicio) tienen pausa estructural inevitable en 0:00
  const darkOpeningGraceEndMs = !isEwStart
    ? (state.civSlug === 'chinese' ? 45_000 : state.civSlug === 'mayans' ? 28_000 : 0)
    : 0;
  let best = null;
  for (const tc of mergedTcs) {
    const tcStart = tc.isPrimary ? 0 : tc.firstEver;
    const tcEnd = Math.min(endLimitMs, tc.isPrimary ? endLimitMs : tc.lastEver);
    if (tcEnd <= tcStart) continue;
    let cursor = tcStart;
    for (const [s, e] of tc.merged) {
      if (e <= tcStart) continue;
      if (s >= tcEnd) break;
      const cs = s > tcStart ? s : tcStart;
      const ce = e < tcEnd ? e : tcEnd;
      const isStructuralOpening = tc.isPrimary && cursor === 0 && darkOpeningGraceEndMs > 0 && cs <= darkOpeningGraceEndMs;
      if (!isStructuralOpening && cs - cursor >= 15_000) {
        const dur = cs - cursor;
        if (!best || dur > best.durMs) best = { startMs: cursor, endMs: cs, durMs: dur };
      }
      if (ce > cursor) cursor = ce;
    }
    if (tcEnd - cursor >= 15_000) {
      const dur = tcEnd - cursor;
      if (!best || dur > best.durMs) best = { startMs: cursor, endMs: tcEnd, durMs: dur };
    }
  }
  if (!best || best.durMs < 20_000) return null;
  const startSec = Math.round(best.startMs / 1000);
  const endSec = Math.round(best.endMs / 1000);
  const durationSec = Math.round(best.durMs / 1000);
  const age = (isEwStart || best.startMs >= feudalMs) ? 'Feudal' : 'Alta Edad';
  const hasMilitaryByGap = state.firstMilitaryMs != null && best.endMs >= state.firstMilitaryMs;
  const milOrders = hasMilitaryByGap
    ? state.militaryActionTimes.filter((t) => t >= best.startMs - 5000 && t <= best.endMs).length
    : 0;
  const ecoOrders = state.ecoActionTimes.filter((t) => t >= best.startMs && t <= best.endMs).length;
  const cause = milOrders >= 10 ? 'combat' : ecoOrders >= 8 ? 'eco' : 'quiet';
  const causeText = cause === 'combat'
    ? `${isRival ? 'mientras microeaba' : 'mientras microeabas'} · ${milOrders} órdenes militares`
    : cause === 'eco'
      ? `durante tareas económicas · ${ecoOrders} órdenes`
      : 'sin presión militar registrada';
  return {
    startSec,
    endSec,
    durationSec,
    age,
    militaryOrdersInGap: milOrders,
    cause,
    summary: `${fmtClockShort(startSec)}–${fmtClockShort(endSec)} (${fmtDurShort(durationSec)} en ${age} · ${causeText})`,
  };
}

function buildMarketProfile(state, isRival = false) {
  const b = state.marketBought;
  const s = state.marketSold;
  const totalOps = state.marketCount;
  if (!totalOps) return null;
  const isSaracens = state.civSlug === 'saracens';
  let note = isSaracens
    ? `Mercado sarraceno (5% comisión): ${totalOps} operaciones`
    : `${totalOps} operaciones en el Mercado`;
  if (isSaracens) {
    if (s.wood >= 300 && b.food >= 200) {
      note = isRival
        ? `Mercado sarraceno (5%): vendió ${s.wood} madera y compró ${b.food} comida`
        : `Mercado sarraceno (5% comisión): vendiste ${s.wood} madera y compraste ${b.food} comida`;
    } else if (s.stone >= 200 || b.food >= 300 || s.wood >= 300) {
      note = isRival
        ? `Usó el Mercado sarraceno con tasa privilegiada (5% · ${totalOps} ops)`
        : `Aprovechaste la comisión del 5% del Mercado sarraceno (${totalOps} ops)`;
    }
  } else if (s.wood >= 300 && b.food >= 200) {
    note = isRival
      ? `Vendió ${s.wood} de madera y compró ${b.food} de comida (desbalance madera/granjas)`
      : `Vendiste ${s.wood} de madera y compraste ${b.food} de comida → exceso de leñadores / faltaron granjas`;
  } else if (s.wood >= 400) {
    note = isRival
      ? `Vendió ${s.wood} de madera en el Mercado`
      : `Vendiste ${s.wood} de madera → revisá si dejás demasiados leñadores`;
  } else if (b.food >= 400) {
    note = isRival
      ? `Compró ${b.food} de comida en el Mercado`
      : `Compraste ${b.food} de comida → faltó transición temprana a granjas`;
  } else if (s.food >= 400) {
    note = isRival
      ? `Vendió ${s.food} de comida para financiar oro`
      : `Vendiste ${s.food} de comida para financiar oro`;
  } else if (s.stone >= 200) {
    note = isRival
      ? `Vendió ${s.stone} de piedra para acelerar oro`
      : `Vendiste ${s.stone} de piedra para acelerar oro`;
  } else if (b.stone >= 200) {
    note = isRival
      ? `Compró ${b.stone} de piedra (castillo / TCs)`
      : `Compraste ${b.stone} de piedra (castillo / TCs)`;
  }
  return {
    totalOps,
    earlyOps: state.marketEarlyOps,
    bought: { ...b },
    sold: { ...s },
    note,
  };
}

function pluralWorkshopName(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('galería')) return 'galerías de tiro con arco';
  if (lower.includes('taller')) return 'talleres de maquinaria de asedio';
  if (lower.endsWith('s')) return lower;
  if (lower.endsWith('l') || lower.endsWith('r')) return `${lower}es`;
  return `${lower}s`;
}

function medianOf(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function finalizePlayer(state, durationMs, { isRival = false } = {}) {
  // Nunca reportar llegadas a edades posteriores al final real de la partida
  if (state.feudalReachedMs != null && state.feudalReachedMs > durationMs) state.feudalReachedMs = null;
  if (state.castleReachedMs != null && state.castleReachedMs > durationMs) state.castleReachedMs = null;
  if (state.imperialReachedMs != null && state.imperialReachedMs > durationMs) state.imperialReachedMs = null;
  // Acreditar tecnologías gratuitas de la civilización y del inicio (ej. Empire Wars)
  seedCivFreeTechs(state, state.startingAge);

  const durSec = Math.max(1, durationMs / 1000);
  const durMin = durSec / 60;
  const mergedTcs = premergeTcIntervals(state.tcs);
  const isEwStart = state.startingAge === 'feudal' || state.startingAge === 'castle' || state.startingAge === 'imperial';

  // TC inactivo separado por edad (sin explotar tras llegar a Imperial / tope de población):
  const darkEndMs = isEwStart
    ? 0
    : (state.feudalReachedMs != null ? Math.min(state.feudalReachedMs, durationMs) : durationMs);
  const feudalEndMs = state.castleReachedMs != null ? Math.min(state.castleReachedMs, durationMs) : durationMs;
  const boomEndMs = state.imperialReachedMs != null ? Math.min(state.imperialReachedMs, durationMs) : durationMs;

  const darkOpeningGraceMs = !isEwStart
    ? (state.civSlug === 'chinese' ? 30_000 : state.civSlug === 'mayans' ? 14_000 : 0)
    : 0;
  const darkStats = isEwStart
    ? { idleSeconds: null, utilization: null, busySeconds: 0, windowSeconds: 0, tcCount: 0 }
    : tcWindowStats(mergedTcs, 0, darkEndMs, { zeroPrimary: true, openingGraceMs: darkOpeningGraceMs });
  // Si la partida terminó en Feudal sin alcanzar Castillos, recortar los últimos 30 s previos a la rendición (igual que findBiggestTcGap)
  const feudalWindowEndMs = state.castleReachedMs != null
    ? feudalEndMs
    : (feudalEndMs - darkEndMs > 60_000 ? Math.max(darkEndMs + 10_000, feudalEndMs - 30_000) : feudalEndMs);
  const feudalStats = state.feudalReachedMs != null && feudalWindowEndMs > darkEndMs
    ? tcWindowStats(mergedTcs, darkEndMs, feudalWindowEndMs, { zeroPrimary: isEwStart })
    : { idleSeconds: null, utilization: null, tcCount: 0 };
  const earlyStats = tcWindowStats(mergedTcs, 0, feudalWindowEndMs, { zeroPrimary: true, openingGraceMs: darkOpeningGraceMs });
  const totalStats = tcWindowStats(mergedTcs, 0, boomEndMs, { zeroPrimary: true, capEachToLast: true, openingGraceMs: darkOpeningGraceMs });

  let tcIdleDarkSeconds = darkStats.idleSeconds;
  let tcUtilizationDark = darkStats.utilization;
  // Cota física exacta en Alta Edad cuando existe aviso oficial de servidor (`authoritativeAges.feudal`):
  // Feudal nunca arranca a mitad de aldeano, por lo que antes de `feudalStartMs` solo cabe un número entero de aldeanos + tecnologías reales del TC.
  if (!isEwStart && state.authoritativeAges?.feudal && state.feudalClickMs != null && darkEndMs > 0 && (darkStats.tcCount || 1) <= 1) {
    const darkRate = persianTcRate(state.civ, 'dark');
    const feudalRate = darkRate * (state.civSlug === 'malay' ? 1.66 : 1);
    const feudalDurMs = Math.round(130_000 / feudalRate);
    const feudalStartMs = Math.max(0, darkEndMs - feudalDurMs);
    let darkTcTechDurMs = 0;
    for (const tc of state.tcs.values()) {
      for (const qi of (tc.queueItems || [])) {
        if (qi.kind === 'tech' && qi.techId !== 101 && qi.techId !== 102 && qi.techId !== 103 && qi.start < feudalStartMs) {
          darkTcTechDurMs += Math.max(0, Math.min(qi.end, feudalStartMs) - qi.start);
        }
      }
    }
    if (darkTcTechDurMs === 0 && state.loomMs != null && state.loomMs < feudalStartMs) {
      const loomRate = darkRate * (state.teamCivSlugs?.has('portuguese') ? 1.25 : 1);
      darkTcTechDurMs = state.civSlug === 'goths' ? 1000 : Math.round(25_000 / loomRate);
    }
    const availForVilsMs = Math.max(0, feudalStartMs - darkTcTechDurMs);
    const vTrainMs = villagerTrainMs(state.civ, 'dark');
    const maxPhysVils = Math.floor((availForVilsMs + 1500) / vTrainMs);
    const physBusyMs = maxPhysVils * vTrainMs + darkTcTechDurMs + feudalDurMs;
    const physWindowMs = Math.max(physBusyMs, darkEndMs - darkOpeningGraceMs);
    const physDarkIdleSec = Math.max(0, Math.round(((physWindowMs - physBusyMs) / 1000) * 10) / 10);
    if (tcIdleDarkSeconds == null || physDarkIdleSec > tcIdleDarkSeconds) {
      tcIdleDarkSeconds = physDarkIdleSec;
      tcUtilizationDark = physWindowMs > 0
        ? Math.max(0, Math.min(100, Math.round((physBusyMs / physWindowMs) * 1000) / 10))
        : tcUtilizationDark;
    }
  }
  const tcIdleFeudalSeconds = feudalStats.idleSeconds;
  const tcUtilizationFeudal = feudalStats.utilization;
  const feudalActiveTcs = feudalStats.tcCount || 0;
  const tcIdleFeudalPerTcSeconds = tcIdleFeudalSeconds != null && feudalActiveTcs > 0
    ? Math.round((tcIdleFeudalSeconds / feudalActiveTcs) * 10) / 10
    : tcIdleFeudalSeconds;
  const rawEarlyIdle = earlyStats.idleSeconds;
  const tcIdleEarlySeconds = (tcIdleDarkSeconds != null && tcIdleFeudalSeconds != null)
    ? Math.max(rawEarlyIdle ?? 0, Math.round((tcIdleDarkSeconds + tcIdleFeudalSeconds) * 10) / 10)
    : rawEarlyIdle;
  const tcUtilizationEarly = earlyStats.utilization;
  // Invariante: tcIdleTotalSeconds nunca puede ser menor que tcIdleEarlySeconds
  const tcIdleTotalSeconds = totalStats.idleSeconds != null
    ? (tcIdleEarlySeconds != null ? Math.max(totalStats.idleSeconds, tcIdleEarlySeconds) : totalStats.idleSeconds)
    : tcIdleEarlySeconds;
  const tcUtilizationTotal = totalStats.utilization ?? tcUtilizationEarly;

  // Alias principales apuntan a Alta + Feudal (la fase crítica de macro en AoE2)
  const tcIdleSeconds = tcIdleEarlySeconds ?? tcIdleTotalSeconds;
  const tcUtilization = tcUtilizationEarly ?? tcUtilizationTotal;
  const tcIdleRatio = tcUtilization != null
    ? Math.max(0, Math.min(1, Math.round((1 - tcUtilization / 100) * 1000) / 1000))
    : null;

  // Talleres militares, utilización y salud de colas (saturación real por edificio)
  let workshopBusy = 0;
  let workshopWindow = 0;
  const workshopTypes = new Map();
  for (const ws of state.workshops.values()) {
    const busy = sumIntervalSeconds(ws.intervals);
    const span = ws.intervals.length
      ? Math.max(busy, (Math.min(durationMs, ws.busyUntil || ws.lastMs) - ws.firstMs) / 1000)
      : 0;
    workshopBusy += busy;
    workshopWindow += span;
    const info = buildingInfo(ws.typeId);
    const bucket = workshopTypes.get(info.key) || {
      key: info.key, typeId: ws.typeId, name: info.name, count: 0, units: 0,
      peakQueue: 0, orders: 0, overloadedOrders: 0,
    };
    bucket.count += 1;
    bucket.units += ws.units;
    bucket.peakQueue = Math.max(bucket.peakQueue, ws.maxQueue || 0);
    bucket.orders += ws.orders || 0;
    bucket.overloadedOrders += ws.overloadedOrders || 0;
    workshopTypes.set(info.key, bucket);
  }
  const workshopUtilization = workshopWindow > 0
    ? Math.max(0, Math.min(100, Math.round((workshopBusy / workshopWindow) * 100)))
    : null;

  const topUnits = [...state.unitCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  const topWorkshops = [...workshopTypes.values()]
    .sort((a, b) => b.units - a.units || b.count - a.count)
    .slice(0, 4)
    .map((w) => {
      const overloadedPct = w.orders > 0 ? Math.round((w.overloadedOrders / w.orders) * 100) : 0;
      const peakQueue = Math.round(w.peakQueue * 10) / 10;
      const status = peakQueue >= 5 && overloadedPct >= 25
        ? 'saturated'
        : (w.units >= 6 ? 'balanced' : 'light');
      const recommendedCount = status === 'saturated'
        ? Math.min(w.count * 2 + 2, Math.max(w.count + 1, Math.ceil(w.count * (peakQueue / 3.5))))
        : null;
      const note = status === 'saturated'
        ? `Pico estimado ${Math.round(peakQueue)} órdenes · ${w.count} ${w.count === 1 ? w.name.toLowerCase() : pluralWorkshopName(w.name)}`
        : `${w.count} ${w.count === 1 ? w.name.toLowerCase() : pluralWorkshopName(w.name)} · flujo activo`;
      return {
        key: w.key,
        typeId: w.typeId,
        name: w.name,
        count: w.count,
        units: w.units,
        peakQueue,
        overloadedPct,
        recommendedCount,
        status,
        note,
      };
    });

  const classifiedActions = state.ecoActions + state.militaryActions;
  const militarySharePct = classifiedActions >= 20
    ? Math.round((state.militaryActions / classifiedActions) * 100)
    : null;

  // Precisión de micro en combate (Attack-Move + Patrol vs clics de Move) y ciclo de retorno al TC
  const combatOrders = state.attackMoveCount + state.patrolCount;
  const totalMoveOrders = state.moveCount + combatOrders;
  const controlSharePct = totalMoveOrders >= 20
    ? Math.round((combatOrders / totalMoveOrders) * 1000) / 10
    : null;
  const tcGaps = [];
  const earlyCut = state.castleReachedMs != null ? Math.min(state.castleReachedMs, durationMs) : durationMs;
  const earlyTcTimes = state.tcOrderTimes.filter((t) => t <= earlyCut).sort((a, b) => a - b);
  for (let i = 1; i < earlyTcTimes.length; i += 1) {
    const dtSec = (earlyTcTimes[i] - earlyTcTimes[i - 1]) / 1000;
    if (dtSec >= 2) tcGaps.push(dtSec); // descarta doble clic inmediato
  }
  const tcReturnSec = tcGaps.length >= 4 ? Math.round(medianOf(tcGaps)) : null;
  const biggestTcGap = findBiggestTcGap(state, durationMs, mergedTcs, isRival);
  const marketProfile = buildMarketProfile(state, isRival);

  // Ritmo de mid game (min 15-30) vs late game (min 30+) en partidas >= 35 min
  // (evita comparar Alta Edad pasiva min 0-18 contra guerras de Imperial, que inflaba 200%+)
  let eapmEarly = null;
  let eapmLate = null;
  let eapmRetentionPct = null;
  if (durationMs >= 35 * 60_000 && state.effectiveActionTimes.length >= 120) {
    const midStartMs = 15 * 60_000;
    const lateStartMs = 30 * 60_000;
    let midCount = 0;
    let lateCount = 0;
    for (const t of state.effectiveActionTimes) {
      if (t >= lateStartMs) lateCount += 1;
      else if (t >= midStartMs) midCount += 1;
    }
    const lateMin = Math.max(5, (durationMs - lateStartMs) / 60_000);
    eapmEarly = Math.round((midCount / 15) * 10) / 10;
    eapmLate = Math.round((lateCount / lateMin) * 10) / 10;
    if (eapmEarly >= 20) {
      eapmRetentionPct = Math.round((eapmLate / eapmEarly) * 100);
    }
  }
  const minuteBuckets = new Map();
  for (const t of state.effectiveActionTimes) {
    const m = Math.floor(t / 60_000);
    if (m < 5) continue; // ignora clics iniciales de arranque (min 0-4) para detectar picos reales de batalla/macro
    minuteBuckets.set(m, (minuteBuckets.get(m) || 0) + 1);
  }
  let peakEapm = null;
  let peakEapmMinute = null;
  for (const [m, cnt] of minuteBuckets.entries()) {
    if (peakEapm == null || cnt > peakEapm) {
      peakEapm = cnt;
      peakEapmMinute = m;
    }
  }

  const doubleBitAxeMs = state.ecoTechs.get(202) ?? null;
  const bowSawMs = state.ecoTechs.get(203) ?? null;
  const wheelbarrowMs = state.ecoTechs.get(213) ?? null;
  const handCartMs = state.ecoTechs.get(249) ?? null;
  const doubleBitAxeOffsetSec = (doubleBitAxeMs != null && state.feudalReachedMs != null)
    ? Math.round((doubleBitAxeMs - state.feudalReachedMs) / 1000)
    : null;
  const bowSawOffsetSec = (bowSawMs != null && state.castleReachedMs != null)
    ? Math.round((bowSawMs - state.castleReachedMs) / 1000)
    : null;
  const doubleBitAxeDelaySec = doubleBitAxeOffsetSec != null ? Math.max(0, doubleBitAxeOffsetSec) : null;
  const bowSawDelaySec = bowSawOffsetSec != null ? Math.max(0, bowSawOffsetSec) : null;

  // Aldeanos gratuitos que nunca generan DeQueue (Bengalis: +2/TC/edad; Wei: +1/mejora eco)
  let bonusVillagers = 0;
  if (state.civSlug === 'bengalis') {
    if (state.feudalReachedMs != null) bonusVillagers += 2;
    if (state.castleReachedMs != null) bonusVillagers += 2 * Math.max(1, feudalActiveTcs || 1);
    if (state.imperialReachedMs != null) bonusVillagers += 2 * Math.max(1, state.tcs.size || 1);
  } else if (state.civSlug === 'wei') {
    let manualEco = 0;
    for (const tid of state.ecoTechs.keys()) {
      if (!state.freeTechIds.has(tid)) manualEco += 1;
    }
    bonusVillagers += manualEco;
  }
  const effectiveVillagers = state.villagersOrdered + bonusVillagers;
  const effectiveFarms = state.civSlug === 'khitans'
    ? (state.pasturesBuilt * 2) + Math.max(0, state.farmsBuilt - state.pasturesBuilt)
    : state.farmsBuilt;

  const armyRelevance = computeArmyTechRelevance(state, durationMs);
  const fStartMs = state.feudalReachedMs ?? Infinity;
  const fEndMs = state.castleReachedMs ?? durationMs;
  const feudalMilitaryOrdered = state.feudalReachedMs != null
    ? state.militaryEvents.reduce((sum, ev) => (ev.ms >= fStartMs && ev.ms <= fEndMs ? sum + ev.amount : sum), 0)
    : 0;
  const castleEndMs = state.imperialReachedMs != null ? Math.min(state.imperialReachedMs, durationMs) : durationMs;
  const castleDurationSec = (state.castleReachedMs != null && castleEndMs > state.castleReachedMs)
    ? Math.round((castleEndMs - state.castleReachedMs) / 1000)
    : 0;

  const techProfile = {
    ecoCount: state.ecoTechs.size,
    blacksmithCount: state.blacksmithTechs.size,
    combatKeyCount: state.combatTechs.size,
    hasDoubleBitAxe: doubleBitAxeMs != null,
    doubleBitAxeDelaySec,
    doubleBitAxeOffsetSec,
    hasBowSaw: bowSawMs != null,
    bowSawDelaySec,
    bowSawOffsetSec,
    hasWheelbarrow: wheelbarrowMs != null,
    hasHandCart: handCartMs != null,
    hasBloodlines: state.combatTechs.has(435),
    hasBallistics: state.combatTechs.has(93),
    freeTechIds: [...state.freeTechIds],
    ecoNames: [...state.ecoTechs.keys()].map((id) => ECO_TECH_NAMES[id]).filter(Boolean).slice(0, 12),
    blacksmithNames: [...state.blacksmithTechs.keys()].map((id) => BLACKSMITH_TECH_NAMES[id]).filter(Boolean).slice(0, 15),
    combatKeyNames: [...state.combatTechs.keys()].map((id) => COMBAT_KEY_TECH_NAMES[id]).filter(Boolean).slice(0, 8),
    armyRelevance,
  };

  const timings = {
    feudalSeconds: state.feudalReachedMs != null ? Math.round(state.feudalReachedMs / 1000) : null,
    castleSeconds: state.castleReachedMs != null ? Math.round(state.castleReachedMs / 1000) : null,
    imperialSeconds: state.imperialReachedMs != null ? Math.round(state.imperialReachedMs / 1000) : null,
    firstMilitarySeconds: state.firstMilitaryMs != null ? Math.round(state.firstMilitaryMs / 1000) : null,
    castleDurationSec,
  };

  const macroBuilds = {
    farms: state.farmsBuilt,
    pastures: state.pasturesBuilt,
    houses: state.housesBuilt,
    castles: state.castlesBuilt,
    extraTcs: state.extraTcsBuilt,
    extraTcsFeudal: state.extraTcsBuiltFeudal,
    towers: state.towersBuilt,
    walls: state.wallsPlaced,
  };

  return {
    civSlug: state.civSlug,
    villagersOrdered: state.villagersOrdered,
    bonusVillagers,
    effectiveVillagers,
    effectiveFarms,
    townCenters: state.tcs.size,
    tcIdleSeconds,
    tcUtilization,
    tcIdleRatio,
    tcIdleDarkSeconds,
    tcUtilizationDark,
    tcIdleFeudalSeconds,
    tcIdleFeudalPerTcSeconds,
    feudalActiveTcs,
    tcUtilizationFeudal,
    tcIdleEarlySeconds,
    tcUtilizationEarly,
    tcIdleTotalSeconds,
    tcUtilizationTotal,
    biggestTcGap,
    militaryOrdered: state.militaryOrdered,
    feudalMilitaryOrdered,
    armyClasses: { ...state.armyClasses },
    workshopsCount: state.workshops.size,
    workshopUtilization,
    topUnits,
    topWorkshops,
    apm: Math.round((state.totalActions / durMin) * 10) / 10,
    eapm: Math.round((state.effectiveActions / durMin) * 10) / 10,
    eapmEarly,
    eapmLate,
    eapmRetentionPct,
    peakEapm,
    peakEapmMinute,
    militarySharePct,
    ecoSharePct: militarySharePct != null ? 100 - militarySharePct : null,
    timings,
    techProfile,
    macroBuilds,
    combatMicro: {
      controlSharePct,
      combatOrders,
      moveOrders: state.moveCount,
      tcReturnSec,
      formations: state.formationsCount,
      stances: state.stancesCount,
      backToWork: state.backToWorkCount,
      stopMicro: state.stopMicroCount,
    },
    marketProfile,
    habits: {
      move: state.moveCount,
      attackMove: state.attackMoveCount,
      patrol: state.patrolCount,
      market: state.marketCount,
      townBell: state.townBellCount,
      tributes: state.tributesSent,
      selfDeleted: state.selfDeleted,
      backToWork: state.backToWorkCount,
      formations: state.formationsCount,
      stances: state.stancesCount,
      walls: state.wallsPlaced,
    },
  };
}

function buildTimelineBuckets(selfState, rivalState, durationMs, bucketCount = 12) {
  if (!Number.isFinite(durationMs) || durationMs < 120_000) return [];
  const stepMs = durationMs / bucketCount;
  const buckets = [];
  for (let i = 1; i <= bucketCount; i += 1) {
    const cutoff = Math.round(stepMs * i);
    const sumBefore = (events) => events.reduce((sum, ev) => (ev.ms <= cutoff ? sum + ev.amount : sum), 0);
    buckets.push({
      seconds: Math.round(cutoff / 1000),
      selfVillagers: sumBefore(selfState.villagerEvents),
      rivalVillagers: rivalState ? sumBefore(rivalState.villagerEvents) : null,
      selfMilitary: sumBefore(selfState.militaryEvents),
      rivalMilitary: rivalState ? sumBefore(rivalState.militaryEvents) : null,
    });
  }
  return buckets;
}

function quantileSorted(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Construye la comparativa minuto a minuto de eAPM (curvas + distribución
 * boxplot) para TODOS los participantes de la partida (1v1 o Team Games) con
 * su color real in-game (1–8).
 */
function buildAllPlayersEapm(rosterTrackers, durationMs) {
  if (!rosterTrackers || rosterTrackers.size < 2 || !Number.isFinite(durationMs) || durationMs < 120_000) {
    return null;
  }
  const bucketMs = 60_000;
  const rawFullMins = Math.floor(durationMs / bucketMs);
  const remMs = durationMs - rawFullMins * bucketMs;
  const includeLastPartial = remMs >= 20_000;
  const totalMinutes = Math.min(120, Math.max(2, rawFullMins + (includeLastPartial ? 1 : 0)));
  const totalMinFloat = Math.max(1, durationMs / 60_000);

  const players = [];
  for (const entry of rosterTrackers.values()) {
    const counts = new Array(totalMinutes).fill(0);
    for (let i = 0; i < entry.effectiveMs.length; i += 1) {
      const m = Math.floor(entry.effectiveMs[i] / bucketMs);
      if (m >= 0 && m < totalMinutes) counts[m] += 1;
    }
    // Normalizar último minuto parcial (>=20 s) a tasa por minuto para no hundir falsamente el final
    if (includeLastPartial && totalMinutes === rawFullMins + 1 && remMs > 0) {
      counts[totalMinutes - 1] = Math.round(counts[totalMinutes - 1] * (bucketMs / remMs));
    }
    const sorted = [...counts].sort((a, b) => a - b);
    let peak = 0;
    let peakMinute = 0;
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] > peak) { peak = counts[i]; peakMinute = i; }
    }
    const colorNum = Number(entry.color);
    const safeColor = Number.isFinite(colorNum) && colorNum >= 1 && colorNum <= 8
      ? Math.round(colorNum)
      : ((Number(entry.slot) - 1) % 8) + 1;
    players.push({
      slot: Number(entry.slot),
      profileId: Number.isFinite(Number(entry.profileId)) && Number(entry.profileId) > 0 ? Number(entry.profileId) : null,
      name: String(entry.name || `P${entry.slot}`).slice(0, 48),
      civ: entry.civ ? String(entry.civ).slice(0, 40) : null,
      color: safeColor,
      team: entry.team != null && Number.isFinite(Number(entry.team)) ? Number(entry.team) : null,
      isSelf: Boolean(entry.isSelf),
      avgEapm: Math.round((entry.effectiveMs.length / totalMinFloat) * 10) / 10,
      avgApm: Math.round((entry.totalActions / totalMinFloat) * 10) / 10,
      min: sorted[0] ?? 0,
      q1: Math.round(quantileSorted(sorted, 0.25) * 10) / 10,
      median: Math.round(quantileSorted(sorted, 0.5) * 10) / 10,
      q3: Math.round(quantileSorted(sorted, 0.75) * 10) / 10,
      max: sorted[sorted.length - 1] ?? 0,
      peakMinute,
      series: counts,
    });
  }

  // Ordenar: jugador propio primero, luego su equipo, luego rivales, desempate por color in-game
  const selfTeam = players.find((p) => p.isSelf)?.team ?? null;
  players.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    const aAlly = selfTeam != null && a.team === selfTeam ? 0 : 1;
    const bAlly = selfTeam != null && b.team === selfTeam ? 0 : 1;
    if (aAlly !== bAlly) return aAlly - bAlly;
    return a.color - b.color;
  });

  return {
    bucketSeconds: 60,
    totalMinutes,
    players,
  };
}

function clampScore(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function gradeFromScore(score) {
  if (!Number.isFinite(score)) return null;
  return score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 58 ? 'B' : score >= 40 ? 'C' : 'D';
}

function fmtClockShort(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtDurShort(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  if (s < 120) return `${s} s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Benchmarks reales de tiempo (en s de juego) por familia de apertura. */
const OPENING_TARGETS = Object.freeze({
  'Scout Rush': { feudalSec: 605, militarySec: 695, mode: 'feudal' },
  'Scout Opening': { feudalSec: 615, militarySec: 710, mode: 'feudal' },
  'Scouts into Archers': { feudalSec: 610, militarySec: 700, mode: 'feudal' },
  'Archer Rush': { feudalSec: 625, militarySec: 725, mode: 'feudal' },
  'Archer Opening': { feudalSec: 630, militarySec: 735, mode: 'feudal' },
  'M@A Rush': { feudalSec: 615, militarySec: 560, mode: 'feudal' },
  'M@A Archers': { feudalSec: 615, militarySec: 560, mode: 'feudal' },
  'M@A Scouts': { feudalSec: 615, militarySec: 560, mode: 'feudal' },
  'Drush': { feudalSec: 660, militarySec: 495, mode: 'feudal' },
  'Drush Archers': { feudalSec: 660, militarySec: 495, mode: 'feudal' },
  'Drush M@A': { feudalSec: 655, militarySec: 495, mode: 'feudal' },
  'Drush FC': { feudalSec: 690, castleSec: 1020, mode: 'fc' },
  'Fast Castle': { feudalSec: 685, castleSec: 990, mode: 'fc' },
  'FC Boom': { feudalSec: 690, castleSec: 1005, mode: 'fc' },
  'Monk Rush': { feudalSec: 685, castleSec: 990, mode: 'fc' },
  '2TC Feudal Boom': { feudalSec: 590, mode: 'boom' },
  'Tower Rush': { feudalSec: 605, mode: 'feudal' },
  'Pike Skirm': { feudalSec: 625, militarySec: 735, mode: 'feudal' },
  'Serjeant Rush': { feudalSec: 625, militarySec: 740, mode: 'feudal' },
  'Elephant Rush': { feudalSec: 690, castleSec: 1020, mode: 'fc' },
  'Scorpions & Rams': { feudalSec: 690, castleSec: 1020, mode: 'fc' },
  'Hoang Rush': { feudalSec: 675, castleSec: 995, mode: 'fc' },
});

function linearScore(val, best, worst) {
  if (!Number.isFinite(val)) return 50;
  if (best === worst) return 50;
  const ratio = (val - worst) / (best - worst);
  return clampScore(ratio * 100);
}

/**
 * Califica las 4 etapas (Apertura, Feudal, Castillos, Imperial) con letras S–D
 * calibradas a la banda de ELO del jugador y basadas 100% en comandos del replay.
 */
function buildStageGrades(self, state, { opening = null, openingShort = null, playerElo = null, durationMs = 0 } = {}) {
  // Factor de exigencia suave por ELO (1000 ELO -> -0.6, 1200 -> 0, 1500 -> +0.8, 1800 -> +1.4)
  const elo = Number.isFinite(Number(playerElo)) && Number(playerElo) > 300 ? Number(playerElo) : 1150;
  const eloBand = Math.max(-1.0, Math.min(1.5, (elo - 1200) / 380));
  const durMs = Math.max(1, Number(durationMs) || 1);
  const fMs = state.feudalReachedMs != null && state.feudalReachedMs <= durMs ? state.feudalReachedMs : null;
  const cMs = state.castleReachedMs != null && state.castleReachedMs <= durMs ? state.castleReachedMs : null;
  const iMs = state.imperialReachedMs != null && state.imperialReachedMs <= durMs ? state.imperialReachedMs : null;

  const countBetween = (events, startMs, endMs) =>
    events.reduce((sum, ev) => (ev.ms >= startMs && ev.ms <= endMs ? sum + ev.amount : sum), 0);

  // 1. APERTURA (Alta Edad + detección automática de apertura)
  const target = (opening && OPENING_TARGETS[opening]) || { feudalSec: 640, mode: 'generic' };
  const darkIdle = self.tcIdleDarkSeconds;
  const idleBest = Math.max(3, 10 - eloBand * 4);
  const idleWorst = Math.max(45, 85 - eloBand * 16);
  const darkScore = darkIdle != null ? linearScore(darkIdle, idleBest, idleWorst) : 55;

  let timingScore = 72;
  let timingDeltaSec = null;
  const feudalSec = fMs != null ? fMs / 1000 : null;
  const castleSec = cMs != null ? cMs / 1000 : null;
  if (target.mode === 'fc' && castleSec != null) {
    const goal = target.castleSec - eloBand * 25;
    timingDeltaSec = Math.round(castleSec - goal);
    timingScore = linearScore(castleSec, goal - 20, goal + 150);
  } else if (feudalSec != null) {
    const goal = target.feudalSec - eloBand * 20;
    timingDeltaSec = Math.round(feudalSec - goal);
    timingScore = linearScore(feudalSec, goal - 15, goal + 135);
  }

  let followScore = 75;
  if (target.militarySec && state.firstMilitaryMs != null) {
    const firstMilSec = state.firstMilitaryMs / 1000;
    followScore = linearScore(firstMilSec, target.militarySec - 20, target.militarySec + 180);
  } else if (target.mode === 'boom') {
    followScore = self.townCenters >= 2 ? 92 : 55;
  }

  const isEwStart = state.startingAge === 'feudal' || state.startingAge === 'castle' || state.startingAge === 'imperial';
  const isVeryShortAbandon = !isEwStart && fMs == null && durMs < 180_000;

  const openingScore = clampScore(darkScore * 0.50 + timingScore * 0.35 + followScore * 0.15);
  const darkAgeScore = clampScore(darkScore * 0.75 + timingScore * 0.25);
  const isGenericOpening = !opening || opening === 'Other' || String(openingShort || '').toLowerCase() === 'otra';
  const openingTitle = !isGenericOpening ? (openingShort || opening) : 'Apertura estándar';
  let openingTip;
  if (isVeryShortAbandon) {
    openingTip = 'Partida breve (<3 min) · sin calificación de apertura';
  } else if (timingDeltaSec != null && timingDeltaSec > 45) {
    openingTip = `${target.mode === 'fc' ? 'Castillos' : 'Feudal'} +${timingDeltaSec} s sobre referencia de ${openingTitle}`;
  } else if (feudalSec != null) {
    openingTip = `Feudal ${fmtClockShort(feudalSec)}${state.loomMs != null ? ` · Telar ${fmtClockShort(state.loomMs / 1000)}` : ''}${!isGenericOpening ? ` · ${openingTitle}` : ''}`;
  } else {
    openingTip = 'Ejecución de apertura estable';
  }

  const openingSummary = {
    key: opening,
    name: openingTitle,
    grade: isVeryShortAbandon ? null : gradeFromScore(openingScore),
    score: isVeryShortAbandon ? null : openingScore,
    feudalSeconds: feudalSec != null ? Math.round(feudalSec) : null,
    darkIdleSeconds: darkIdle != null ? Math.round(darkIdle) : null,
    tip: openingTip,
  };

  // 1. ALTA EDAD (hechos 100% comprobables del replay: clic a Feudal + Telar; omitida en Empire Wars)
  const darkLoomMs = state.loomMs != null && (fMs == null || state.loomMs <= fMs) ? state.loomMs : null;
  const darkMetricParts = [
    state.feudalClickMs != null ? `Clic ${fmtClockShort(state.feudalClickMs / 1000)}` : null,
    darkLoomMs != null ? `Telar ${fmtClockShort(darkLoomMs / 1000)}` : null,
  ].filter(Boolean);
  const darkTip = timingDeltaSec != null && timingDeltaSec > 45
    ? `${target.mode === 'fc' && castleSec != null ? 'Castillos' : 'Feudal'} +${timingDeltaSec} s sobre referencia de ${openingTitle}`
    : feudalSec != null
      ? `Llegada a Feudal en ${fmtClockShort(feudalSec)}${darkLoomMs != null ? ` · Telar ${fmtClockShort(darkLoomMs / 1000)}` : ''}`
      : isVeryShortAbandon
        ? 'Partida terminada antes de completar Alta Edad'
        : 'Alta Edad en progreso';
  const stages = [
    isEwStart
      ? {
          id: 'dark',
          label: 'Alta Edad',
          subtitle: 'Inicio Feudal',
          status: 'not_reached',
          grade: null,
          score: null,
          metric: 'Empire Wars',
          tip: 'La partida inició directamente en Edad Feudal.',
        }
      : {
          id: 'dark',
          label: 'Alta Edad',
          subtitle: feudalSec ? `Feudal ${fmtClockShort(feudalSec)}` : '0:00',
          status: isVeryShortAbandon ? 'not_reached' : 'ready',
          grade: isVeryShortAbandon ? null : gradeFromScore(darkAgeScore),
          score: isVeryShortAbandon ? null : darkAgeScore,
          metric: isVeryShortAbandon ? 'Partida breve' : (darkMetricParts.join(' · ') || (feudalSec ? `Feudal ${fmtClockShort(feudalSec)}` : '—')),
          tip: darkTip,
        },
  ];

  // 2. FEUDAL
  if (fMs == null) {
    stages.push({ id: 'feudal', label: 'Feudal', subtitle: null, status: 'not_reached', grade: null, score: null, metric: 'No alcanzada', tip: '' });
  } else {
    const fEnd = cMs ?? durMs;
    const fDurSec = Math.max(1, (fEnd - fMs) / 1000);
    const fUtil = self.tcUtilizationFeudal;
    const fIdle = self.tcIdleFeudalSeconds;
    const fIdlePerTc = self.tcIdleFeudalPerTcSeconds ?? fIdle;
    const fTcs = self.feudalActiveTcs || 1;
    const fVils = countBetween(state.villagerEvents, fMs, fEnd);
    const fMil = countBetween(state.militaryEvents, fMs, fEnd);
    const fPace = ((fVils + fMil) / (fDurSec / 60));

    const utilBest = Math.min(98, 94 + eloBand * 2.5);
    const utilWorst = Math.max(55, 68 + eloBand * 5);
    const utilScore = fUtil != null ? linearScore(fUtil, utilBest, utilWorst) : 60;
    // Transición rápida a Castillos (Fast Castle): investigación Castillos dura 160s + 2–4 aldeanos (50–100s) ≈ <= 275s
    const isFastTransition = cMs != null && fDurSec <= 275;
    const paceScore = linearScore(fPace, 3.6 + eloBand * 0.5, 1.2);
    const hasDba = Boolean(self.techProfile?.hasDoubleBitAxe);
    const dbaDelay = self.techProfile?.doubleBitAxeDelaySec;
    let feudalScoreRaw = isFastTransition
      ? (utilScore * 0.85 + 15)
      : (utilScore * 0.65 + paceScore * 0.35);
    // Penalizar fallos graves en Feudal (bache >=30s en Feudal, >55s idle/TC o Hacha muy tardía) para evitar "Feudal Impecable (S)" contradictorio
    if (self.biggestTcGap?.age === 'Feudal' && self.biggestTcGap.durationSec >= 30) {
      feudalScoreRaw -= Math.min(18, Math.round(self.biggestTcGap.durationSec * 0.45));
    }
    if (fIdlePerTc != null && fIdlePerTc >= 55) {
      feudalScoreRaw -= Math.min(18, Math.round((fIdlePerTc - 40) * 0.25));
    }
    if (!isFastTransition && fDurSec >= 240 && (!hasDba || (dbaDelay != null && dbaDelay >= 300))) {
      feudalScoreRaw -= 10;
    }
    const feudalScore = clampScore(feudalScoreRaw);
    let feudalTip;
    if (isFastTransition) {
      feudalTip = `Transición rápida a Castillos (${fmtDurShort(fDurSec)} en Feudal)`;
    } else if (!hasDba && fDurSec >= 240) {
      feudalTip = `${Math.round(fDurSec / 60)}m en Feudal · faltó Hacha de doble filo`;
    } else {
      feudalTip = `${Math.round(fDurSec / 60)}m en Feudal · ${hasDba ? 'Hacha de doble filo ✓' : openingTitle}`;
    }

    stages.push({
      id: 'feudal',
      label: 'Feudal',
      subtitle: fmtClockShort(fMs / 1000),
      status: 'ready',
      grade: gradeFromScore(feudalScore),
      score: feudalScore,
      metric: isFastTransition
        ? `${fmtDurShort(fDurSec)} · Fast Castle`
        : `${Math.round(fDurSec / 60)}m · ${hasDba ? 'Hacha de doble filo ✓' : 'Sin Hacha de doble filo'}`,
      tip: feudalTip,
    });
  }

  // 3. CASTILLOS (boom + masa militar + talleres + micro; sin castigar tope 200 pop)
  if (cMs == null) {
    stages.push({ id: 'castle', label: 'Castillos', subtitle: null, status: 'not_reached', grade: null, score: null, metric: 'No alcanzada', tip: '' });
  } else {
    const cEnd = iMs ?? durMs;
    const cDurSec = Math.max(1, (cEnd - cMs) / 1000);
    const cMin = Math.max(1, cDurSec / 60);
    const cVils = countBetween(state.villagerEvents, cMs, cEnd);
    const cMil = countBetween(state.militaryEvents, cMs, cEnd);
    const cVilsPerMin = cVils / cMin;
    const cMilPerMin = cMil / cMin;

    // Si ya tiene >= 100 aldeanos totales (ej. 2TC Feudal Cumanos), no penaliza no sacar más en Castillos
    const boomScore = self.villagersOrdered >= 100
      ? 90
      : linearScore(cVilsPerMin, 4.2 + eloBand * 0.5, 1.0);
    const milPaceScore = linearScore(cMilPerMin, 3.8 + eloBand * 0.7, 0.4);
    const wsScore = self.workshopUtilization != null
      ? linearScore(self.workshopUtilization, 82, 25)
      : (cMil >= 15 ? 65 : 40);
    const combatMicro = state.attackMoveCount + state.patrolCount;
    const meleeTotal = (state.armyClasses?.cavalry || 0) + (state.armyClasses?.infantry || 0);
    const microScore = clampScore(
      (combatMicro >= 12 ? 95 : combatMicro >= 4 ? 75 : combatMicro >= 1 ? 58 : (meleeTotal < 15 || state.stopMicroCount > 0 ? 68 : 35))
      - Math.min(30, state.townBellCount * 15),
    );
    const castleScore = clampScore(boomScore * 0.35 + milPaceScore * 0.30 + wsScore * 0.15 + microScore * 0.20);

    const bldSummary = (self.topWorkshops || []).slice(0, 2).map((w) => `${w.count} ${w.name}`).join(' · ');
    let castleTip;
    if (combatMicro === 0 && state.stopMicroCount === 0 && cMil >= 15 && meleeTotal >= 15) {
      castleTip = 'Sumá Movimiento de ataque o Patrullar en peleas';
    } else if (self.workshopsCount >= 3) {
      castleTip = `${self.townCenters} TC · ${bldSummary || `${self.workshopsCount} edificios militares`}`;
    } else {
      castleTip = `${self.townCenters} TC · ${self.macroBuilds?.farms || 0} granjas totales`;
    }

    stages.push({
      id: 'castle',
      label: 'Castillos',
      subtitle: fmtClockShort(cMs / 1000),
      status: 'ready',
      grade: gradeFromScore(castleScore),
      score: castleScore,
      metric: `${self.townCenters} TC · ${self.workshopsCount} edificios militares`,
      tip: castleTip,
    });
  }

  // 4. IMPERIAL (0% penalización por TC inactivo; mide masa militar, talleres y eAPM)
  if (iMs == null || durMs - iMs < 45_000) {
    stages.push({ id: 'imperial', label: 'Imperial', subtitle: null, status: 'not_reached', grade: null, score: null, metric: 'No alcanzada', tip: '' });
  } else {
    const iMin = Math.max(1, (durMs - iMs) / 60_000);
    const iMil = countBetween(state.militaryEvents, iMs, durMs);
    const iMilPerMin = iMil / iMin;
    const iEffActions = state.effectiveActionTimes.filter((t) => t >= iMs).length;
    const iEapm = Math.round((iEffActions / iMin) * 10) / 10;

    const impMilScore = linearScore(iMilPerMin, 5.5 + eloBand * 0.9, 1.0);
    const wsScore = self.workshopUtilization != null ? linearScore(self.workshopUtilization, 82, 30) : 55;
    const eapmScore = linearScore(iEapm, 46 + eloBand * 9, 18);
    const impScore = clampScore(impMilScore * 0.50 + wsScore * 0.30 + eapmScore * 0.20);

    let impTip;
    if (self.workshopsCount < 5) {
      impTip = `Solo ${self.workshopsCount} edificios militares: sumá producción en Imperial`;
    } else {
      impTip = `${self.workshopsCount} edificios militares · ${String(iEapm).replace('.', ',')} eAPM en Imperial`;
    }

    stages.push({
      id: 'imperial',
      label: 'Imperial',
      subtitle: fmtClockShort(iMs / 1000),
      status: 'ready',
      grade: gradeFromScore(impScore),
      score: impScore,
      metric: `${String(iEapm).replace('.', ',')} eAPM · ${self.workshopsCount} edificios militares`,
      tip: impTip,
    });
  }

  return { openingSummary, stages };
}

function buildHighlightsAndFocus(self, rival, { durationMs = 0, openingSummary = null, stages = null, isTeamGame = false, selfCiv = null, rivalCiv = null } = {}) {
  const positives = [];
  const negatives = [];
  const durMin = Math.max(1, (Number(durationMs) || 0) / 60_000);
  const tp = self.techProfile || {};
  const ar = tp.armyRelevance || null;
  const rtp = rival?.techProfile || {};
  const tm = self.timings || {};
  const rtm = rival?.timings || {};
  const mb = self.macroBuilds || {};
  const cm = self.combatMicro || {};
  const cls = self.armyClasses || {};
  const selfSlug = self.civSlug || normalizeCivSlug(selfCiv);
  const rivalSlug = rival?.civSlug || normalizeCivSlug(rivalCiv);
  const freeTechSet = new Set(Array.isArray(tp.freeTechIds) ? tp.freeTechIds : []);
  const effectiveVils = self.effectiveVillagers ?? self.villagersOrdered ?? 0;
  const effectiveFarms = self.effectiveFarms ?? mb.farms ?? 0;
  const farmLabel = selfSlug === 'khitans' ? 'pasturas' : 'granjas';
  const farmDisplayCount = selfSlug === 'khitans' ? (mb.pastures || mb.farms || 0) : (mb.farms || 0);

  const addPos = (item) => positives.push({ tone: 'good', tier: 'green', score: 65, ...item });
  const addNeg = (item) => negatives.push({ tone: 'warn', severity: 65, ...item });

  // ==================== POOL POSITIVO (HECHOS 100% VERIFICABLES DEL REPLAY) ====================
  // 1. Macro / Expansión de TC comprobada (evita falsos "1 s de TC inactivo" por clics DeQueue fallidos)
  if (self.townCenters >= 3 && effectiveFarms >= 20) {
    addPos({
      id: 'medal-tc-expansion', domain: 'macro_tc', tier: self.townCenters >= 4 ? 'gold' : 'green',
      score: self.townCenters >= 4 ? 84 : 76, icon: 'villager',
      badgeName: 'Expansión Sólida',
      title: `Expansión económica con ${self.townCenters} TC`,
      metric: `${farmDisplayCount} ${farmLabel}`,
      detail: `Construiste ${self.townCenters} Centros Urbanos y ${farmDisplayCount} ${farmLabel} para escalar tu economía.`,
    });
  }

  // 2. Carrera de Edades (solo 1v1 compara contra el rival; en TG evalúa apertura objetiva)
  if (!isTeamGame && tm.castleSeconds != null && rtm.castleSeconds != null && rtm.castleSeconds - tm.castleSeconds >= 30) {
    const lead = Math.round(rtm.castleSeconds - tm.castleSeconds);
    addPos({
      id: 'medal-castle-first', domain: 'tempo_ages', tier: lead >= 75 ? 'gold' : 'green',
      score: lead >= 75 ? 87 : 80, icon: 'castle',
      badgeName: 'Carrera de Edades',
      title: `Llegaste ${fmtDurShort(lead)} antes a Castillos`,
      metric: fmtClockShort(tm.castleSeconds),
      detail: `Castillos en ${fmtClockShort(tm.castleSeconds)} frente a ${fmtClockShort(rtm.castleSeconds)} del rival.`,
    });
  } else if (!isTeamGame && tm.feudalSeconds != null && rtm.feudalSeconds != null && rtm.feudalSeconds - tm.feudalSeconds >= 25) {
    const lead = Math.round(rtm.feudalSeconds - tm.feudalSeconds);
    addPos({
      id: 'medal-feudal-first', domain: 'tempo_ages', score: 76, icon: 'age',
      badgeName: 'Avance Veloz',
      title: `Feudal ${fmtDurShort(lead)} antes que el rival`,
      metric: fmtClockShort(tm.feudalSeconds),
      detail: `Subiste en ${fmtClockShort(tm.feudalSeconds)} (rival ${fmtClockShort(rtm.feudalSeconds)}).`,
    });
  } else if (openingSummary && openingSummary.grade === 'S') {
    const cleanOpeningName = (openingSummary.name && !/^otra$/i.test(openingSummary.name))
      ? openingSummary.name
      : 'Apertura sólida';
    addPos({
      id: 'medal-opening-s', domain: 'tempo_ages', tier: 'gold', score: 84, icon: 'opening',
      badgeName: 'Apertura de Manual',
      title: `${cleanOpeningName} · Calificación S`,
      metric: openingSummary.feudalSeconds ? `Feudal ${fmtClockShort(openingSummary.feudalSeconds)}` : 'Grado S',
      detail: openingSummary.tip || 'Ejecución de apertura de altísimo nivel para tu banda.',
    });
  }

  // 3. Iniciativa Militar Temprana (solo 1v1 para evitar comparar Pocket vs Flank en TG)
  if (!isTeamGame && tm.firstMilitarySeconds != null && rtm.firstMilitarySeconds != null &&
      rtm.firstMilitarySeconds - tm.firstMilitarySeconds >= 40 && self.militaryOrdered >= 10) {
    const lead = Math.round(rtm.firstMilitarySeconds - tm.firstMilitarySeconds);
    addPos({
      id: 'medal-first-strike', domain: 'initiative', score: 77, icon: 'scout',
      badgeName: 'Iniciativa Militar',
      title: `Primera unidad ${fmtDurShort(lead)} antes que el rival`,
      metric: fmtClockShort(tm.firstMilitarySeconds),
      detail: `Marcaste el ritmo militar desde el minuto ${fmtClockShort(tm.firstMilitarySeconds)}.`,
    });
  }

  // 4. Mejoras Económicas a tiempo (Hacha de doble filo / Sierra de arco / Eco techs)
  // Excluir cuando Hacha/Sierra fueron pasivas gratuitas de civilización (Birmanos)
  const dbaWasFree = freeTechSet.has(202);
  const dbaWasLate = tp.hasDoubleBitAxe && !dbaWasFree && tp.doubleBitAxeDelaySec != null && tp.doubleBitAxeDelaySec >= 240;
  if (tp.hasDoubleBitAxe && !dbaWasFree && tp.doubleBitAxeDelaySec != null && tp.doubleBitAxeDelaySec <= 75 &&
      (!tm.castleSeconds || (tp.hasBowSaw && (tp.bowSawDelaySec == null || tp.bowSawDelaySec <= 90)))) {
    const earlyWoodText = tp.doubleBitAxeDelaySec <= 0
      ? `Activaste Hacha anticipada${tp.hasBowSaw ? ' y Sierra a tiempo' : ''}.`
      : `Activaste madera a los +${tp.doubleBitAxeDelaySec} s de llegar a Feudal${tp.hasBowSaw ? ' y Sierra en Castillos' : ''}.`;
    addPos({
      id: 'medal-eco-techs', domain: 'eco_techs', tier: tp.ecoCount >= 5 ? 'gold' : 'green',
      score: tp.hasBowSaw ? 83 : 76, icon: 'wood',
      badgeName: 'Maestro Leñador',
      title: tp.hasBowSaw ? 'Hacha y Sierra de arco al instante' : 'Hacha de doble filo puntual',
      metric: `${tp.ecoCount} mejoras eco`,
      detail: earlyWoodText,
    });
  } else if (tp.ecoCount >= 4 && (isTeamGame || rtp.ecoCount == null || tp.ecoCount >= rtp.ecoCount + 2)) {
    const praisedEco = (tp.ecoNames || []).filter((n) => !(dbaWasLate && /Hacha de doble filo/i.test(n)));
    const ecoList = praisedEco.slice(0, 3).join(', ').replace(/\.+$/, '');
    addPos({
      id: 'medal-eco-lead', domain: 'eco_techs', score: 75, icon: 'resources',
      badgeName: 'Economía Mejorada',
      title: `${tp.ecoCount} mejoras económicas investigadas`,
      metric: `${tp.ecoCount} mejoras eco`,
      detail: ecoList ? `Incluye ${ecoList}.` : 'Sostuviste las tecnologías clave de recolección.',
    });
  }

  // 5. Herrería y Mejoras de Combate ACOMPAÑANDO TU COMPOSICIÓN REAL (nunca conteo crudo vs rival)
  if (ar && ar.primaryClass && ar.wellEquipped) {
    const classBadge = ar.primaryClass === 'cavalry' ? 'Caballería Blindada'
      : ar.primaryClass === 'cavArmorOnly' ? 'Elefantes Blindados'
        : ar.primaryClass === 'ranged' ? 'Puntería Forjada'
          : ar.primaryClass === 'gunpowder' ? 'Pólvora Blindada'
            : 'Infantería de Hierro';
    const techList = ar.relevantNames.slice(0, 3).join(', ').replace(/\.+$/, '');
    addPos({
      id: 'medal-blacksmith-relevant', domain: 'blacksmith_techs',
      tier: ar.relevantCount >= ar.relevantExpected ? 'gold' : 'green',
      score: ar.relevantCount >= ar.relevantExpected ? 84 : 78, icon: 'blacksmith',
      badgeName: classBadge,
      title: `Herrería al día para tu ${ar.primaryLabel.toLowerCase()} (${ar.relevantCount}/${ar.relevantExpected})`,
      metric: `${ar.relevantCount}/${ar.relevantExpected} clave`,
      detail: techList ? `Acompañaste tus ${ar.primaryUnits} unidades con ${techList}.` : `Tus unidades principales pelearon bien equipadas.`,
    });
  }

  // 6. Infraestructura Militar comprobada (sin inflar por clics fallidos ni llamarlos "talleres")
  if (self.workshopsCount >= 5) {
    const topNames = (self.topWorkshops || []).slice(0, 2).map((w) => `${w.count} ${w.name}`).join(' · ');
    addPos({
      id: 'medal-workshops', domain: 'workshops', score: 76, icon: 'building',
      badgeName: 'Infraestructura Militar',
      title: `${self.workshopsCount} edificios militares activos`,
      metric: topNames || `${self.workshopsCount} edificios`,
      detail: `Escalaste tu producción militar con múltiples edificios en paralelo.`,
    });
  }

  // 7. Boom Económico comprobado (TCs y granjas, no clics brutos de aldeanos)
  if (!isTeamGame && rival && self.townCenters >= 3 && self.townCenters > rival.townCenters) {
    addPos({
      id: 'medal-tc-lead', domain: 'economy_boom', score: 78, icon: 'castle',
      badgeName: 'Motor Económico',
      title: `Mayor expansión económica (${self.townCenters} TC vs ${rival.townCenters} TC)`,
      metric: `${mb.farms || 0} granjas`,
      detail: `Escalaste más Centros Urbanos que el rival para sostener el juego medio.`,
    });
  }

  // 8. Micro de Combate (Movimiento de ataque / Patrullar / Formaciones / Posturas)
  const combatMicroTotal = self.habits.attackMove + self.habits.patrol;
  const formCount = cm.formations || 0;
  const stanceCount = cm.stances || 0;
  const tacticalMicro = formCount + stanceCount;
  if (combatMicroTotal >= 12 || (combatMicroTotal >= 6 && tacticalMicro >= 8)) {
    const microMetric = tacticalMicro >= 4
      ? (formCount > 0 && stanceCount > 0
        ? `+${formCount} formaciones · ${stanceCount} posturas`
        : formCount > 0 ? `+${formCount} formaciones` : `+${stanceCount} posturas`)
      : `${combatMicroTotal} órdenes`;
    addPos({
      id: 'medal-combat-micro', domain: 'micro_combat', tier: combatMicroTotal >= 25 ? 'gold' : 'green',
      score: combatMicroTotal >= 25 ? 80 : 72, icon: 'combat',
      badgeName: 'Micro Quirúrgica',
      title: `Control activo (${combatMicroTotal} Movimiento de ataque y Patrullar)`,
      metric: microMetric,
      detail: `Evitaste sobre-enfocar unidades en pelea con órdenes limpias de combate.`,
    });
  }

  // 9. Micro Defensiva Limpia (BackToWork sin Campana Urbana)
  if ((cm.backToWork || 0) >= 3 && self.habits.townBell === 0) {
    addPos({
      id: 'medal-clean-defense', domain: 'defensive_micro', score: 74, icon: 'shield',
      badgeName: 'Defensa Limpia',
      title: `0 Campanas Urbanas · ${cm.backToWork} retornos puntuales`,
      metric: 'Eco sin frenar',
      detail: `Guareciste aldeanos de forma selectiva sin paralizar el resto de tu economía.`,
    });
  }

  // 10. Resistencia de Late Game (mid min 15-30 vs late min 30+) / Cola constante de aldeanos
  const fmtDec = (v) => String(v).replace('.', ',');
  if (self.eapmRetentionPct != null && self.eapmRetentionPct >= 95 && (self.eapmLate || 0) >= 35) {
    addPos({
      id: 'medal-stamina', domain: 'stamina_pace', tier: self.eapmRetentionPct >= 105 ? 'gold' : 'green',
      score: 81, icon: 'trend',
      badgeName: 'Resistencia de Late Game',
      title: `Sostuviste tu ritmo en late game (${fmtDec(self.eapmEarly)} → ${fmtDec(self.eapmLate)} eAPM)`,
      metric: self.eapmRetentionPct > 125
        ? `+${self.eapmRetentionPct - 100}% en late`
        : `${self.eapmRetentionPct}% ritmo`,
      detail: `No bajaste tu velocidad tras el min 30${self.peakEapm ? ` · pico ${self.peakEapm} eAPM al min ${self.peakEapmMinute}` : ''}.`,
    });
  } else if (cm.tcReturnSec != null && cm.tcReturnSec <= 18 && (self.feudalActiveTcs || 1) <= 1 && self.villagersOrdered >= 25) {
    addPos({
      id: 'medal-tc-cycle', domain: 'stamina_pace', score: 75, icon: 'clock',
      badgeName: 'Producción Continua',
      title: `Cola constante en el Centro urbano (orden cada ${cm.tcReturnSec} s)`,
      metric: `Cada ${cm.tcReturnSec} s`,
      detail: `Mantuviste la cola de aldeanos activa sin huecos usando el atajo del Centro urbano.`,
    });
  }

  // 11. Control de Mapa (Castillos / Murallas)
  if (mb.castles >= 2) {
    addPos({
      id: 'medal-map-castles', domain: 'map_control', score: 74, icon: 'castle',
      badgeName: 'Arquitecto de Castillos',
      title: `Control territorial con ${mb.castles} Castillos`,
      metric: `${mb.castles} Castillos`,
      detail: `Aseguraste colinas y zonas clave del mapa con fortificaciones.`,
    });
  }

  // 12. Ejército Combinado (2+ ramas militares activas >= 12 unidades cada una)
  const activeBranches = [
    { label: 'Caballería', units: (cls.cavalry || 0) + (cls.cavArmorOnly || 0) },
    { label: 'Distancia', units: cls.ranged || 0 },
    { label: 'Infantería', units: cls.infantry || 0 },
    { label: 'Pólvora', units: cls.gunpowder || 0 },
  ].filter((b) => b.units >= 12).sort((a, b) => b.units - a.units);
  if (activeBranches.length >= 2) {
    const pair = activeBranches.slice(0, 2);
    const pairSum = pair.reduce((s, b) => s + b.units, 0);
    addPos({
      id: 'medal-combined-arms', domain: 'combined_arms', score: 78, icon: 'matchup',
      badgeName: 'Ejército Combinado',
      title: `Combinaste ${pair[0].label} y ${pair[1].label} (${pairSum} unidades)`,
      metric: `${pair[0].units} + ${pair[1].units}`,
      detail: `Mezclaste ramas complementarias para cubrir counters y sostener peleas.`,
    });
  }

  // 13. Pico de Adrenalina (minuto de máxima intensidad real en eAPM)
  if (self.peakEapm != null && self.peakEapmMinute != null &&
      (self.peakEapm >= 65 || (self.eapm && self.peakEapm >= 48 && self.peakEapm >= self.eapm * 1.55))) {
    addPos({
      id: 'medal-peak-adrenaline', domain: 'adrenaline', tier: self.peakEapm >= 80 ? 'gold' : 'green',
      score: self.peakEapm >= 80 ? 82 : 75, icon: 'trend',
      badgeName: 'Pico de Adrenalina',
      title: `Alcanzaste ${self.peakEapm} eAPM en el minuto ${self.peakEapmMinute}`,
      metric: `${self.peakEapm} eAPM`,
      detail: `Tu tramo de mayor intensidad y respuesta mecánica de toda la partida.`,
    });
  }

  // 14. Etapa de Nivel S (Feudal / Castillos / Imperial impecable — nunca contradecir un bache/Hacha tardía de Feudal)
  const stageList = Array.isArray(stages) ? stages : [];
  const hasFeudalFlaw = (self.biggestTcGap?.age === 'Feudal' && self.biggestTcGap.durationSec >= 30) || dbaWasLate;
  const topStageS = ['imperial', 'castle', 'feudal']
    .filter((id) => !(id === 'feudal' && hasFeudalFlaw))
    .map((id) => stageList.find((s) => s.id === id && s.status === 'ready' && s.grade === 'S'))
    .find(Boolean);
  if (topStageS) {
    const sLabel = topStageS.id === 'imperial' ? 'Imperial Demoledor'
      : topStageS.id === 'castle' ? 'Castillos de Nivel S'
        : 'Feudal Impecable';
    addPos({
      id: `medal-stage-s-${topStageS.id}`, domain: 'stage_mastery', tier: 'gold',
      score: 85, icon: topStageS.id === 'imperial' ? 'crown' : topStageS.id === 'castle' ? 'castle' : 'barracks',
      badgeName: sLabel,
      title: `Ejecución nivel S en ${topStageS.label}`,
      metric: topStageS.metric || 'Grado S',
      detail: topStageS.tip || `Dominaste ${topStageS.label} muy por encima de la referencia de tu banda.`,
    });
  }

  // 15. Motor Agrícola (45+ granjas efectivas + mejora de molino/pastura)
  const hasFarmTech = (tp.ecoNames || []).some((n) => /Collera|Arado pesado|Rotación|Domesticación|Pastoralismo|Trashumancia/i.test(n));
  if (effectiveFarms >= 45 && hasFarmTech) {
    const bestFarmTech = ['Rotación de cultivos', 'Arado pesado', 'Collera', 'Trashumancia', 'Pastoralismo', 'Domesticación']
      .find((t) => (tp.ecoNames || []).includes(t)) || 'mejoras agrícolas';
    addPos({
      id: 'medal-farm-engine', domain: 'farm_eco', score: 74, icon: 'food',
      badgeName: 'Motor Agrícola',
      title: `Sostuviste tu comida con ${farmDisplayCount} ${farmLabel}`,
      metric: `${farmDisplayCount} ${farmLabel}`,
      detail: `Combinaste gran volumen agrícola con ${bestFarmTech} para no frenar producción.`,
    });
  }

  // 16. Economía al Máximo (Carretilla + Carro de mano completos — no regalar si ambos fueron pasivos de Vikingos)
  const wbAndHcBothFree = freeTechSet.has(213) && freeTechSet.has(249);
  if (tp.hasWheelbarrow && tp.hasHandCart && !wbAndHcBothFree && durMin >= 25) {
    addPos({
      id: 'medal-eco-max', domain: 'eco_max', score: 73, icon: 'resources',
      badgeName: 'Eco al Máximo',
      title: 'Carretilla y Carro de mano completados',
      metric: 'Eco completa',
      detail: `Llevaste la capacidad y velocidad de tus aldeanos al máximo en partida larga.`,
    });
  }

  // 17. Picos de Poder (2+ tecnologías decisivas: Balística, Química, Pureza de sangre, Ganadería, Leva, Dactilera)
  if ((tp.combatKeyCount || 0) >= 2 && (tp.combatKeyNames || []).length >= 2) {
    const picked = tp.combatKeyNames.slice(0, 3).join(', ');
    addPos({
      id: 'medal-power-spikes', domain: 'power_spikes', score: 76, icon: 'relic',
      badgeName: 'Picos de Poder',
      title: `Activaste ${tp.combatKeyNames.slice(0, 2).join(' y ')}`,
      metric: `${tp.combatKeyCount} mejoras clave`,
      detail: `Investigaste mejoras decisivas de impacto inmediato (${picked}).`,
    });
  }

  // ==================== POOL NEGATIVO (12+ DETECTORES REALES) ====================
  // 1. Mayor bache de TC exacto (con hora y causa)
  if (self.biggestTcGap && self.biggestTcGap.durationSec >= 25) {
    addNeg({
      id: 'neg-tc-gap', domain: 'macro_tc',
      severity: self.biggestTcGap.durationSec >= 55 ? 92 : 80,
      icon: 'clock',
      title: `Bache de TC de ${fmtDurShort(self.biggestTcGap.durationSec)} en ${self.biggestTcGap.age}`,
      metric: `${fmtClockShort(self.biggestTcGap.startSec)}–${fmtClockShort(self.biggestTcGap.endSec)}`,
      detail: `Ocurrió ${self.biggestTcGap.cause === 'combat' ? `mientras microeabas (${self.biggestTcGap.militaryOrdersInGap} órdenes militares)` : self.biggestTcGap.cause === 'eco' ? 'durante tareas económicas' : 'sin presión militar registrada'}.`,
    });
  } else {
    const fIdleCheck = self.tcIdleFeudalPerTcSeconds ?? self.tcIdleFeudalSeconds;
    if (fIdleCheck != null && fIdleCheck >= 95) {
      addNeg({
        id: 'neg-feudal-tc', domain: 'macro_tc', severity: fIdleCheck >= 140 ? 88 : 76,
        icon: 'clock',
        title: `Fuga de TC en Feudal (${fmtDurShort(fIdleCheck)})`,
        metric: `${String(self.tcUtilizationFeudal ?? 0).replace('.', ',')}% TC`,
        detail: `${fmtDurShort(fIdleCheck)}${(self.feudalActiveTcs || 1) > 1 ? `/TC en ${self.feudalActiveTcs} TC` : ''} sin sacar aldeanos en Feudal.`,
      });
    }
  }

  // 2. Herrería SOLO cuando falta una mejora obligatoria PARA TU PROPIA COMPOSICIÓN (nunca por conteo vs rival)
  if (ar && ar.criticalMissing) {
    addNeg({
      id: ar.criticalMissing.id, domain: 'blacksmith_techs', severity: 88,
      icon: 'blacksmith',
      title: ar.criticalMissing.title,
      metric: ar.criticalMissing.metric,
      detail: ar.criticalMissing.detail,
    });
  }

  // 3. Faltó Hacha de doble filo o Sierra de arco (mejoras de madera clave, respetando árbol tecnológico)
  if (tm.feudalSeconds != null && durMin >= 15 && civHasTech(selfSlug, 202) && !tp.hasDoubleBitAxe && effectiveVils >= 22) {
    addNeg({
      id: 'neg-no-dba', domain: 'eco_techs', severity: 85,
      icon: 'wood',
      title: 'No investigaste Hacha de doble filo',
      metric: 'Madera −20%',
      detail: `Pasaste por Feudal sin la mejora de madera más rentable del juego.`,
    });
  } else if (tm.castleSeconds != null && (tm.castleDurationSec || 0) >= 180 && durMin >= 23 &&
      civHasTech(selfSlug, 203) && tp.hasDoubleBitAxe && !tp.hasBowSaw && effectiveVils >= 40) {
    addNeg({
      id: 'neg-no-bowsaw', domain: 'eco_techs', severity: 77,
      icon: 'wood',
      title: 'Faltó Sierra de arco en Castillos',
      metric: 'Eco madera',
      detail: `Te quedaste sin la mejora de madera de Castillos para sostener granjas y edificios militares.`,
    });
  } else if (tp.hasDoubleBitAxe && !dbaWasFree && tp.doubleBitAxeDelaySec != null && tp.doubleBitAxeDelaySec >= 210) {
    addNeg({
      id: 'neg-late-dba', domain: 'eco_techs', severity: 70,
      icon: 'wood',
      title: `Hacha de doble filo tardía (+${fmtDurShort(tp.doubleBitAxeDelaySec)} tras Feudal)`,
      metric: `+${fmtDurShort(tp.doubleBitAxeDelaySec)}`,
      detail: `Conviene investigarla apenas subís a Feudal para acelerar granjas y edificios.`,
    });
  }

  // 4. Llegada tardía a Castillos o Feudal vs Rival (solo 1v1; ignora 2TC Feudal Boom, Cumans 2TC, Fast Castle intencional, agresión Feudal extendida y rival Malayo +66%)
  const isTwoTcFeudalBoom = (selfSlug === 'cumans' && ((self.feudalActiveTcs || 1) >= 2 || (mb.extraTcsFeudal || 0) >= 1)) ||
    ((self.feudalActiveTcs || 1) >= 2 && effectiveVils >= 55);
  const heavierFeudalAggro = (self.feudalMilitaryOrdered || 0) >= ((rival?.feudalMilitaryOrdered || 0) + 8);
  const isIntentionalFc = /fast castle|fc\b|monk|boom/i.test(`${openingSummary?.key || ''} ${openingSummary?.name || ''}`) ||
    (tm.castleSeconds != null && rtm.castleSeconds != null && tm.castleSeconds <= rtm.castleSeconds);
  const castleLagThreshold = rivalSlug === 'malay' ? 110 : 65;
  const feudalLagThreshold = rivalSlug === 'malay' ? 85 : 50;
  if (!isTeamGame && !isTwoTcFeudalBoom && !heavierFeudalAggro &&
      tm.castleSeconds != null && rtm.castleSeconds != null && tm.castleSeconds - rtm.castleSeconds >= castleLagThreshold) {
    const behind = Math.round(tm.castleSeconds - rtm.castleSeconds);
    addNeg({
      id: 'neg-late-castle', domain: 'tempo_ages', severity: behind >= 120 ? 86 : 76,
      icon: 'castle',
      title: `Llegaste ${fmtDurShort(behind)} después a Castillos`,
      metric: `${fmtClockShort(tm.castleSeconds)} vs ${fmtClockShort(rtm.castleSeconds)}`,
      detail: `El rival tomó ventana de tecnología y presión antes en Edad de los Castillos.`,
    });
  } else if (!isTeamGame && !isIntentionalFc && tm.feudalSeconds != null && rtm.feudalSeconds != null && tm.feudalSeconds - rtm.feudalSeconds >= feudalLagThreshold) {
    const behind = Math.round(tm.feudalSeconds - rtm.feudalSeconds);
    addNeg({
      id: 'neg-late-feudal', domain: 'tempo_ages', severity: 74,
      icon: 'age',
      title: `Feudal ${fmtDurShort(behind)} más tarde que el rival`,
      metric: `${fmtClockShort(tm.feudalSeconds)} vs ${fmtClockShort(rtm.feudalSeconds)}`,
      detail: `Cediste la iniciativa inicial por demora al pasar a Feudal.`,
    });
  }

  // 5. Infraestructura militar insuficiente en partidas largas (comprobado por edificios reales)
  const saturatedWs = null;
  if (!isTeamGame && tm.castleSeconds != null && durMin >= 26 && rival &&
      self.workshopsCount > 0 && rival.workshopsCount >= self.workshopsCount + 3) {
    addNeg({
      id: 'neg-workshops-behind', domain: 'workshops', severity: 76,
      icon: 'building',
      title: `Menos edificios militares que el rival (${self.workshopsCount} vs ${rival.workshopsCount})`,
      metric: `${self.workshopsCount} vs ${rival.workshopsCount}`,
      detail: `Sumar más cuarteles, galerías o establos al escalar te permite reponer ejército al mismo ritmo.`,
    });
  }

  // 7. Campana Urbana
  if (self.habits.townBell >= 2) {
    addNeg({
      id: 'neg-town-bell', domain: 'defensive_micro', severity: 86,
      icon: 'shield',
      title: `Campana Urbana usada ${self.habits.townBell} veces`,
      metric: `×${self.habits.townBell}`,
      detail: `Paraliza toda tu economía a la vez; guarecé manualmente solo el grupo atacado.`,
    });
  }

  // 8. Sin Movimiento de ataque / Patrullar en peleas (solo si jugaste cuerpo a cuerpo y tampoco usaste Stop-micro)
  const meleeUnits = (cls.cavalry || 0) + (cls.infantry || 0);
  if (meleeUnits >= 20 && combatMicroTotal === 0 && (cm.stopMicro || 0) === 0 && self.habits.move >= 90) {
    addNeg({
      id: 'neg-no-attack-move', domain: 'micro_combat', severity: 78,
      icon: 'combat',
      title: 'Sin Movimiento de ataque ni Patrullar en peleas cuerpo a cuerpo',
      metric: `${self.habits.move} órdenes Mover`,
      detail: `0 órdenes de ataque en área con ${meleeUnits} unidades cuerpo a cuerpo: tus unidades persiguen a un solo objetivo sin pegar.`,
    });
  }

  // 9. Desbalance temprano de recursos reflejado en Mercado (NUNCA penaliza Sarracenos: 5% comisión es su ventaja competitiva)
  if (selfSlug !== 'saracens') {
    const earlyMarketOps = self.marketProfile?.earlyOps || 0;
    const earlyMarketLimit = 6;
    const isPreImpMarketIssue = tm.imperialSeconds == null && durMin < 30 && self.habits.market >= 10;
    if (earlyMarketOps >= earlyMarketLimit || isPreImpMarketIssue) {
      const opsShown = earlyMarketOps >= earlyMarketLimit ? earlyMarketOps : self.habits.market;
      addNeg({
        id: 'neg-market-heavy', domain: 'economy_boom', severity: 74,
        icon: 'market',
        title: earlyMarketOps >= earlyMarketLimit
          ? `Uso intensivo del Mercado temprano (${earlyMarketOps} operaciones < min 20)`
          : `Uso intensivo del Mercado (${self.habits.market} operaciones)`,
        metric: `${opsShown} operaciones`,
        detail: self.marketProfile?.note || 'Revisá el reparto temprano de aldeanos para no perder oro en comisiones.',
      });
    }
  }

  // 10. Caída de ritmo en late game (fatiga real tras el min 30)
  if (self.eapmRetentionPct != null && self.eapmRetentionPct <= 72 && (self.eapmEarly || 0) >= 30) {
    const drop = 100 - self.eapmRetentionPct;
    addNeg({
      id: 'neg-stamina-drop', domain: 'stamina_pace', severity: 73,
      icon: 'trend',
      title: `Tu ritmo cayó ${drop}% tras el min 30 (${fmtDec(self.eapmEarly)} → ${fmtDec(self.eapmLate)} eAPM)`,
      metric: `−${drop}% eAPM`,
      detail: `En partidas largas bajó tu velocidad de producción y micro en el tramo decisivo.`,
    });
  }

  // 11. Estancamiento en 1 TC en Castillos largo (solo 1v1)
  if (!isTeamGame && tm.castleSeconds != null && durMin >= 26 && self.townCenters <= 1 &&
      rival && rival.townCenters >= 2) {
    addNeg({
      id: 'neg-1tc-behind', domain: 'economy_boom', severity: 79,
      icon: 'villager',
      title: `Te quedaste en 1 TC frente a ${rival.townCenters} TC del rival`,
      metric: `1 TC vs ${rival.townCenters} TC`,
      detail: `Si el push en 1 TC no cierra la partida, el rival despega en economía.`,
    });
  }

  // Ordenar por impacto real y asegurar 1 por dominio
  const pickByDomain = (list, key, max) => {
    const sorted = [...list].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    const seen = new Set();
    const out = [];
    for (const item of sorted) {
      if (item.domain && seen.has(item.domain)) continue;
      if (item.domain) seen.add(item.domain);
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  };

  const rankedPositives = pickByDomain(positives, 'score', 12);
  const rankedNegatives = pickByDomain(negatives, 'severity', 6);

  // Backwards-compatible `highlights` (máx. 3 mezclados como antes para consumidores legacy)
  const highlights = [
    ...rankedPositives.slice(0, 2),
    ...rankedNegatives.slice(0, 1),
  ].slice(0, 3);
  if (highlights.length < 3) {
    for (const extra of [...rankedPositives.slice(2), ...rankedNegatives.slice(1)]) {
      if (highlights.length >= 3) break;
      highlights.push(extra);
    }
  }

  // Un solo foco accionable universal derivado del cuello de botella #1 real
  const earlySelfPerTc = (self.tcIdleDarkSeconds != null && self.tcIdleFeudalPerTcSeconds != null)
    ? Math.round((self.tcIdleDarkSeconds + self.tcIdleFeudalPerTcSeconds) * 10) / 10
    : self.tcIdleSeconds;
  const earlyRivalPerTc = rival
    ? ((rival.tcIdleDarkSeconds != null && rival.tcIdleFeudalPerTcSeconds != null)
      ? Math.round((rival.tcIdleDarkSeconds + rival.tcIdleFeudalPerTcSeconds) * 10) / 10
      : rival.tcIdleSeconds)
    : null;
  const topNeg = rankedNegatives[0] || null;
  let focus = null;
  if (self.habits.townBell >= 2) {
    focus = {
      title: 'Evitar la Campana Urbana',
      detail: `Tocaste la campana ${self.habits.townBell} veces: paraliza toda tu economía. Guarecé manualmente solo el grupo de aldeanos bajo ataque.`,
    };
  } else if (self.biggestTcGap && self.biggestTcGap.durationSec >= 35) {
    focus = {
      title: `Evitar pausas largas de TC en ${self.biggestTcGap.age}`,
      detail: `Pausa sin órdenes de TC de ${fmtDurShort(self.biggestTcGap.durationSec)}: ${self.biggestTcGap.summary}.`,
    };
  } else if (topNeg?.domain === 'blacksmith_techs' && ar?.criticalMissing) {
    focus = {
      title: ar.criticalMissing.focusTitle,
      detail: ar.criticalMissing.focusDetail,
    };
  } else if (topNeg?.id === 'neg-no-dba' || topNeg?.id === 'neg-no-bowsaw') {
    focus = {
      title: topNeg.id === 'neg-no-dba' ? 'Activar Hacha de doble filo al subir a Feudal' : 'Activar Sierra de arco al subir a Castillos',
      detail: `Es la mejora económica de mayor retorno inmediato: te financia granjas y edificios militares sin ahogar la madera.`,
    };
  } else if (topNeg?.id === 'neg-workshop-sat' && saturatedWs) {
    focus = {
      title: `Sumar un ${saturatedWs.name} adicional al escalar`,
      detail: `Llegaste a ${Math.round(saturatedWs.peakQueue)} unidades en cola en ${saturatedWs.count} edificios: agregar un edificio extra convierte esos recursos en ejército en el mapa.`,
    };
  } else if (topNeg?.id === 'neg-no-attack-move') {
    focus = {
      title: 'Usar Movimiento de ataque o Patrullar en peleas cuerpo a cuerpo',
      detail: `Registraste ${self.habits.move} órdenes de mover y 0 de Movimiento de ataque/Patrullar con ${meleeUnits} unidades cuerpo a cuerpo. Usarlo evita que tus unidades persigan a un solo objetivo sin pegar.`,
    };
  } else if (topNeg?.id === 'neg-army-deficit' && rival) {
    focus = {
      title: 'Sostener producción militar constante',
      detail: `Encargaste ${self.militaryOrdered} unidades frente a ${rival.militaryOrdered} del rival (${self.workshopsCount} edificios militares activos). Sumar edificios antes de flotar recursos evita quedarte sin masa.`,
    };
  } else if (topNeg?.id === 'neg-stamina-drop') {
    focus = {
      title: 'Mantener el ritmo de producción en late game',
      detail: `Tu eAPM bajó de ${self.eapmEarly} a ${self.eapmLate} después del min 18. Apoyate en hotkeys de edificios militares y selección múltiple en partidas largas.`,
    };
  } else if (topNeg?.id === 'neg-late-castle') {
    focus = {
      title: 'Acelerar el paso a Edad de los Castillos',
      detail: `${topNeg.title} (${topNeg.metric}). Ajustá el salto de granjas y oro en Feudal para no ceder la ventana de Castillos.`,
    };
  } else if (topNeg?.id === 'neg-late-feudal') {
    focus = {
      title: 'Ajustar el clic a Feudal',
      detail: `${topNeg.title} (${topNeg.metric}). Revisá la transición de comida en Alta Edad para tomar iniciativa antes.`,
    };
  } else if (topNeg?.id === 'neg-1tc-behind') {
    focus = {
      title: 'Sumar un 2.º TC al llegar a Castillos',
      detail: `${topNeg.title}. Si tu push en 1 TC no cierra la partida, agregar un TC extra evita quedarte atrás en economía.`,
    };
  } else if (topNeg?.id === 'neg-late-dba') {
    focus = {
      title: 'Activar Hacha de doble filo apenas subís a Feudal',
      detail: `${topNeg.title}. Investigarla ni bien llegás a Feudal acelera granjas y edificios militares toda la partida.`,
    };
  } else if (topNeg?.id === 'neg-market-heavy') {
    focus = {
      title: 'Equilibrar reparto de aldeanos',
      detail: `Usaste el Mercado ${self.habits.market} veces. Revisá si acumulaste exceso de un recurso por falta de ajuste temprano de aldeanos.`,
    };
  } else if (topNeg) {
    focus = {
      title: topNeg.title,
      detail: topNeg.detail,
    };
  } else {
    focus = {
      title: 'Ejecución sólida sin cuellos de botella críticos',
      detail: `Cerraste con ${self.townCenters} TC, ${self.workshopsCount} edificios militares y ${String(self.eapm ?? 0).replace('.', ',')} eAPM. Revisá los intercambios clave en el replay.`,
    };
  }

  return {
    highlights,
    positives: rankedPositives,
    negatives: rankedNegatives,
    focus,
  };
}

/**
 * Calcula los 8 nuevos insights competitivos y curiosos de Postmatch (0 llamadas API):
 *  1. Aldeanos Fantasma (costo real del TC inactivo)
 *  2. El Minuto del Quiebre (Turning Point de la curva)
 *  3. Brecha de Herrería antes del primer choque
 *  4. Radar de Adaptación & Tech-Switch
 *  5. Evaluación de Rol Pocket vs Flank (Team Games)
 *  6. Recursos Atrapados (colas saturadas + impuesto de Mercado)
 *  7. Crónica Caliente del Replay (taunts, "11", pings, GG/Rage-Quit)
 *  8. Detector de Castle Drop (ofensivo vs defensivo + pico de adrenalina)
 */
function buildPostmatchInsights({
  selfState, rivalState, self, rival, timeline = [], durationMs = 0,
  isTeamGame = false, teamRole = null, mapSize = 120, chatStats = null, won = null,
} = {}) {
  const durMin = Math.max(1, durationMs / 60_000);
  const civSlug = normalizeCivSlug(selfState?.civ);

  // 1. Aldeanos Fantasma (costo real del TC inactivo antes de Castillos)
  let ghostVillagers = null;
  const earlyIdle = Number(self?.tcIdleEarlySeconds);
  if (Number.isFinite(earlyIdle) && earlyIdle >= 18) {
    const trainSec = 25 / persianTcRate(civSlug, 'dark');
    const count = Math.round((earlyIdle / trainSec) * 10) / 10;
    const targetMin = self?.timings?.castleSeconds
      ? Math.min(28, self.timings.castleSeconds / 60)
      : Math.min(22, durMin);
    const activeGatherMin = Math.max(4, targetMin - 8);
    // Estimación conservadora: cada aldeano fantasma hubiera juntado ~22 res/min en media
    const lostResources = Math.round((count * activeGatherMin * 22) / 50) * 50;
    const eqKnights = Math.max(1, Math.round(lostResources / 135));
    ghostVillagers = {
      count,
      idleSeconds: Math.round(earlyIdle),
      lostResources,
      eqKnights,
      label: `${String(count).replace('.', ',')} aldeanos fantasma`,
      detail: `~${lostResources.toLocaleString('es-AR')} recursos estimados sin recolectar antes de Castillos (≈ ${eqKnights} Jinetes).`,
    };
  }

  // 2. El Minuto del Quiebre (Turning Point de la curva de 12 buckets)
  let turningPoint = null;
  if (Array.isArray(timeline) && timeline.length >= 4) {
    let bestJump = null;
    let prevVilDiff = 0;
    let prevMilDiff = 0;
    let minVilDiff = 0;
    let maxVilDiff = 0;
    for (let i = 0; i < timeline.length; i += 1) {
      const b = timeline[i];
      const hasRival = !isTeamGame && Number.isFinite(b.rivalVillagers);
      if (hasRival) {
        const vDiff = (b.selfVillagers || 0) - (b.rivalVillagers || 0);
        const mDiff = (b.selfMilitary || 0) - (b.rivalMilitary || 0);
        if (vDiff < minVilDiff) minVilDiff = vDiff;
        if (vDiff > maxVilDiff) maxVilDiff = vDiff;
        if (i >= 2) {
          const dv = vDiff - prevVilDiff;
          const dm = mDiff - prevMilDiff;
          const score = Math.abs(dv) * 1.4 + Math.abs(dm);
          if (!bestJump || score > bestJump.score) {
            bestJump = {
              idx: i,
              fromSec: timeline[i - 1].seconds,
              toSec: b.seconds,
              dv,
              dm,
              vDiff,
              mDiff,
              score,
            };
          }
        }
        prevVilDiff = vDiff;
        prevMilDiff = mDiff;
      }
    }
    if (bestJump && bestJump.score >= 8) {
      const fromMin = Math.round(bestJump.fromSec / 60);
      const toMin = Math.round(bestJump.toSec / 60);
      const isComeback = won === true && minVilDiff <= -8 && bestJump.vDiff >= -2;
      if (isComeback) {
        turningPoint = {
          kind: 'comeback',
          tone: 'win',
          minuteRange: `${fromMin}:00–${toMin}:00`,
          title: `Comeback en el min ${fromMin}–${toMin}`,
          detail: `Remontaste una desventaja de ${Math.abs(minVilDiff)} aldeanos para dar vuelta la partida.`,
        };
      } else if (Math.abs(bestJump.dv) >= Math.abs(bestJump.dm) && Math.abs(bestJump.dv) >= 6) {
        const good = bestJump.dv > 0;
        turningPoint = {
          kind: good ? 'self-boom' : 'rival-boom',
          tone: good ? 'win' : 'loss',
          minuteRange: `${fromMin}:00–${toMin}:00`,
          title: good ? `Despegue económico (${fromMin}–${toMin}m)` : `Quiebre económico rival (${fromMin}–${toMin}m)`,
          detail: good
            ? `Entre el min ${fromMin} y ${toMin} sacaste +${bestJump.dv} aldeanos de ventaja en producción.`
            : `Entre el min ${fromMin} y ${toMin} el rival te sacó ${Math.abs(bestJump.dv)} aldeanos extra.`,
        };
      } else if (Math.abs(bestJump.dm) >= 8) {
        const good = bestJump.dm > 0;
        turningPoint = {
          kind: good ? 'self-push' : 'rival-push',
          tone: good ? 'win' : 'loss',
          minuteRange: `${fromMin}:00–${toMin}:00`,
          title: good ? `Pico militar decisivo (${fromMin}–${toMin}m)` : `Presión militar rival (${fromMin}–${toMin}m)`,
          detail: good
            ? `Encargaste +${bestJump.dm} militares más que el rival entre el min ${fromMin} y ${toMin}.`
            : `El rival volcó +${Math.abs(bestJump.dm)} militares más en el tramo ${fromMin}–${toMin}m.`,
        };
      }
    } else if (isTeamGame) {
      // En TG: identificar tu tramo personal de mayor producción militar
      let peakBucket = null;
      for (let i = 1; i < timeline.length; i += 1) {
        const deltaMil = (timeline[i].selfMilitary || 0) - (timeline[i - 1].selfMilitary || 0);
        if (!peakBucket || deltaMil > peakBucket.deltaMil) {
          peakBucket = { fromMin: Math.round(timeline[i - 1].seconds / 60), toMin: Math.round(timeline[i].seconds / 60), deltaMil };
        }
      }
      if (peakBucket && peakBucket.deltaMil >= 10) {
        turningPoint = {
          kind: 'self-push',
          tone: 'neutral',
          minuteRange: `${peakBucket.fromMin}:00–${peakBucket.toMin}:00`,
          title: `Tu pico de producción (${peakBucket.fromMin}–${peakBucket.toMin}m)`,
          detail: `En ese tramo encargaste +${peakBucket.deltaMil} unidades militares (tu ventana más explosiva en TG).`,
        };
      }
    }
  }

  // 3. Brecha de Herrería antes del primer choque
  let blacksmithGap = null;
  const ar = self?.techProfile?.armyRelevance;
  if (ar && ar.primaryClass && ar.primaryUnits >= 6 && selfState?.classMassMs?.[ar.primaryClass] != null) {
    const massMs = selfState.classMassMs[ar.primaryClass];
    const mandatoryByClass = {
      ranged: { ids: [199, 200, 201], label: 'Emplumado' },
      cavalry: { ids: [81, 82, 80, 67], label: 'Armadura de caballería' },
      cavArmorOnly: { ids: [81, 82, 80], label: 'Armadura de caballería' },
      infantry: { ids: [74, 76, 77, 67], label: 'Armadura de infantería' },
    };
    const spec = mandatoryByClass[ar.primaryClass];
    if (spec) {
      let firstTechMs = null;
      for (const tid of spec.ids) {
        const tms = selfState.blacksmithTechs.get(tid);
        if (tms != null && (firstTechMs == null || tms < firstTechMs)) firstTechMs = tms;
      }
      if (firstTechMs == null) {
        blacksmithGap = {
          status: 'missing',
          tone: 'loss',
          primaryLabel: ar.primaryLabel,
          techName: spec.label,
          delaySec: null,
          title: `Sin ${spec.label} con ${ar.primaryUnits} ${ar.primaryLabel}`,
          detail: `Llegaste a masa militar al min ${Math.round(massMs / 60_000)} sin investigar ${spec.label}.`,
        };
      } else {
        const delaySec = Math.round((firstTechMs - massMs) / 1000);
        if (delaySec <= 45) {
          blacksmithGap = {
            status: 'optimal',
            tone: 'win',
            primaryLabel: ar.primaryLabel,
            techName: spec.label,
            delaySec,
            title: `${spec.label} listo a tiempo`,
            detail: `Investigaste ${spec.label} antes de comprometer tus primeros choques con ${ar.primaryLabel}.`,
          };
        } else if (delaySec >= 120) {
          blacksmithGap = {
            status: 'late',
            tone: 'loss',
            primaryLabel: ar.primaryLabel,
            techName: spec.label,
            delaySec,
            title: `${spec.label} tardó +${fmtDurShort(delaySec)}`,
            detail: `Ya tenías 6+ ${ar.primaryLabel} al min ${Math.round(massMs / 60_000)} y clickeaste ${spec.label} recién al min ${Math.round(firstTechMs / 60_000)}.`,
          };
        }
      }
    }
  }

  // 4. Radar de Adaptación & Tech-Switch (1v1 o cuando hay rival con ejército real)
  let techSwitch = null;
  if (!isTeamGame && rivalState && rival?.armyClasses) {
    const rivalTop = [
      { id: 'cavalry', label: 'Caballería', count: (rival.armyClasses.cavalry || 0) + (rival.armyClasses.cavArmorOnly || 0), counters: ['spearLine', 'infantry'] },
      { id: 'ranged', label: 'Arqueros', count: rival.armyClasses.ranged || 0, counters: ['cavalry', 'cavArmorOnly', 'ranged'] },
      { id: 'infantry', label: 'Infantería', count: rival.armyClasses.infantry || 0, counters: ['ranged', 'gunpowder'] },
    ].sort((a, b) => b.count - a.count)[0];

    if (rivalTop && rivalTop.count >= 12 && rivalState.classMassMs?.[rivalTop.id] != null) {
      const rivalMassMs = rivalState.classMassMs[rivalTop.id];
      const isCavThreat = rivalTop.id === 'cavalry';
      const selfCounterCount = isCavThreat
        ? (self.armyClasses?.spearLine || 0)
        : rivalTop.counters.reduce((s, c) => s + (self.armyClasses?.[c] || 0), 0);
      const selfCounterEvents = (selfState.classEvents || []).filter((e) =>
        e.ms >= rivalMassMs - 120_000 && (isCavThreat ? e.isSpear : rivalTop.counters.includes(e.cls))
      );
      if (selfCounterCount >= 8 && selfCounterEvents.length) {
        const delaySec = Math.max(0, Math.round((selfCounterEvents[0].ms - rivalMassMs) / 1000));
        techSwitch = {
          status: 'adapted',
          tone: 'win',
          rivalLabel: rivalTop.label,
          delaySec,
          title: delaySec <= 240 ? `Adaptación rápida vs ${rivalTop.label}` : `Transición a counter vs ${rivalTop.label}`,
          detail: `El rival masificó ${rivalTop.label} (${rivalTop.count}) y respondiste con ${selfCounterCount} unidades de respuesta${delaySec > 30 ? ` en ${fmtDurShort(delaySec)}` : ''}.`,
        };
      } else if (won === false && self.militaryOrdered >= 20 && isCavThreat && (self.armyClasses?.spearLine || 0) < 4) {
        techSwitch = {
          status: 'stubborn',
          tone: 'loss',
          rivalLabel: rivalTop.label,
          delaySec: null,
          title: `Sin transición a Piqueros vs ${rivalTop.label}`,
          detail: `El rival entrenó ${rivalTop.count} unidades de Caballería y cerraste con solo ${self.armyClasses?.spearLine || 0} de línea de lanza.`,
        };
      }
    }
  }

  // 5. Evaluación de Rol Pocket vs Flank (Team Games 3v3/4v4)
  let tgRoleEval = null;
  if (isTeamGame && (teamRole === 'pocket' || teamRole === 'flank')) {
    const roleLabel = teamRole === 'pocket' ? 'Pocket' : 'Flank';
    const firstMil = self?.timings?.firstMilitarySeconds;
    const castleSec = self?.timings?.castleSeconds;
    if (teamRole === 'flank') {
      const earlyPres = firstMil != null && firstMil <= 780;
      const walled = (self?.habits?.walls || 0) >= 4;
      tgRoleEval = {
        role: 'flank',
        roleLabel,
        tone: earlyPres || walled ? 'win' : 'warn',
        title: earlyPres ? 'Flank con presión temprana' : (walled ? 'Flank defensivo amurallado' : 'Flank sin presión temprana'),
        detail: earlyPres
          ? `Sacaste tu 1.ª unidad militar al ${fmtClockShort(firstMil)} para sostener la línea de Flank.`
          : `Como Flank, sacar presión Feudal antes del 12:30 o cerrar muros temprano protege el boom de tu Pocket.`,
      };
    } else {
      const strongBoom = (self?.townCenters || 0) >= 3 || (castleSec != null && castleSec <= 1120);
      const cavSupport = ((self?.armyClasses?.cavalry || 0) + (self?.armyClasses?.cavArmorOnly || 0)) >= 10;
      tgRoleEval = {
        role: 'pocket',
        roleLabel,
        tone: strongBoom || cavSupport ? 'win' : 'warn',
        title: cavSupport ? 'Pocket de apoyo con Caballería' : (strongBoom ? 'Pocket en modo Boom limpio' : 'Pocket lento en escalar'),
        detail: cavSupport
          ? `Cumpliste el rol de Pocket: ${((self.armyClasses.cavalry || 0) + (self.armyClasses.cavArmorOnly || 0))} unidades móviles para asistir a tus Flanks.`
          : (strongBoom
            ? `Escalaste a ${self.townCenters} TC${castleSec ? ` (Castillos ${fmtClockShort(castleSec)})` : ''} desde posición de Pocket.`
            : `Como Pocket, buscá llegar a Castillos antes del 18:30 con apoyo móvil o 3 TC limpios.`),
      };
    }
  }

  // 6. Recursos Atrapados (Impuesto real de Mercado fuera de Sarracenos; no acusar colas saturadas por clics DeQueue sin recursos)
  let trappedResources = null;
  const satWs = [];
  const marketOps = Number(self?.marketProfile?.totalOps ?? self?.habits?.market ?? 0);
  const isSaracen = civSlug === 'saracens';
  const estMarketTax = (!isSaracen && marketOps >= 4)
    ? Math.round(((self?.marketProfile?.totalVolume || marketOps * 100) * 0.25) / 50) * 50
    : 0;
  if (satWs.length || estMarketTax >= 150 || (self?.militaryOrdered >= 15 && durMin >= 15)) {
    const clean = !satWs.length && estMarketTax < 150;
    trappedResources = {
      clean,
      tone: clean ? 'win' : 'loss',
      saturatedCount: satWs.length,
      peakQueue: satWs.length ? Math.max(...satWs.map((w) => Math.round(w.peakQueue))) : 0,
      marketOps,
      estMarketTax,
      title: clean
        ? 'Gasto limpio sin recursos atrapados'
        : (satWs.length ? `Colas saturadas (hasta ×${Math.max(...satWs.map((w) => Math.round(w.peakQueue)))} en fila)` : `Impuesto de Mercado (~${estMarketTax} res)`),
      detail: clean
        ? 'Tus edificios militares trabajaron sin colas excesivas ni comisiones altas de Mercado.'
        : [
            satWs.length ? `${satWs[0].name} llegó a ${Math.round(satWs[0].peakQueue)} en cola (sumá un edificio extra para convertir recursos en mapa).` : null,
            estMarketTax >= 150 ? `${marketOps} operaciones de Mercado (~${estMarketTax} res en comisión).` : null,
          ].filter(Boolean).join(' '),
    };
  }

  // 7. Crónica Caliente del Replay (Taunts, "11", Pings, GG/Rage-Quit, Muros, Tributos, Borrados)
  const badges = [];
  if (chatStats?.laugh11 > 0) badges.push({ label: `Taunt "11" ×${chatStats.laugh11}`, tone: 'gold' });
  if (chatStats?.taunts > 0 && chatStats.taunts > (chatStats.laugh11 || 0)) badges.push({ label: `${chatStats.taunts} taunts`, tone: 'neutral' });
  if (chatStats?.ggCount > 0) badges.push({ label: 'GG limpio', tone: 'win' });
  else if (chatStats?.hadResign && durationMs >= 300_000) badges.push({ label: 'Salida sin GG', tone: 'loss' });
  const flares = selfState?.flaresCount || 0;
  if (isTeamGame && flares >= 10) badges.push({ label: `Modo Comandante (${flares} bengalas)`, tone: 'gold' });
  else if (flares >= 3) badges.push({ label: `${flares} bengalas`, tone: 'neutral' });
  if ((self?.habits?.tributes || 0) >= 2) badges.push({ label: `El Banquero (${self.habits.tributes} tributos)`, tone: 'gold' });
  if ((self?.habits?.walls || 0) >= 18) badges.push({ label: `La Gran Muralla (${self.habits.walls} muros)`, tone: 'neutral' });
  if ((self?.habits?.selfDeleted || 0) >= 12) badges.push({ label: `Cirugía (${self.habits.selfDeleted} borrados)`, tone: 'neutral' });
  const replayChronicle = badges.length ? {
    taunts: chatStats?.taunts || 0,
    laugh11: chatStats?.laugh11 || 0,
    ggCount: chatStats?.ggCount || 0,
    flares,
    badges: badges.slice(0, 5),
  } : null;

  // 8. Detector de Castle Drop (Ofensivo vs Defensivo por coordenadas X/Y + Pico de Adrenalina)
  let castleDrop = null;
  const centroidOf = (pts) => {
    if (!pts || pts.length < 2) return null;
    const sx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const sy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    return { x: sx, y: sy };
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const myBase = centroidOf(selfState?.earlyBuildCoords);
  const rivalBase = centroidOf(rivalState?.earlyBuildCoords);
  const mapDiag = Math.max(100, Number(mapSize) || 120);
  if (myBase && selfState?.castleBuildCoords?.length) {
    const castles = selfState.castleBuildCoords.filter((b) => b.bid === 82 || b.bid === 1251);
    let bestDrop = null;
    for (const c of castles) {
      const dSelf = dist(c, myBase);
      const dRival = rivalBase ? dist(c, rivalBase) : null;
      const isOffensive = dRival != null ? (dRival < dSelf * 0.9 || dSelf >= mapDiag * 0.36) : (dSelf >= mapDiag * 0.38);
      if (isOffensive && (!bestDrop || c.ms < bestDrop.ms)) {
        bestDrop = { ...c, dSelf: Math.round(dSelf), minute: Math.round(c.ms / 60_000) };
      }
    }
    if (bestDrop) {
      const aligned = self?.peakEapmMinute != null && Math.abs(self.peakEapmMinute - bestDrop.minute) <= 3;
      castleDrop = {
        kind: 'self-offensive',
        tone: 'win',
        minute: bestDrop.minute,
        peakEapmMinute: self?.peakEapmMinute || null,
        alignedWithPeak: aligned,
        title: `Castle Drop ofensivo (min ${bestDrop.minute})`,
        detail: aligned
          ? `Plantaste un Castillo adelantado al min ${bestDrop.minute}, justo con tu pico de adrenalina (${self.peakEapm} eAPM).`
          : `Plantaste un Castillo adelantado fuera de tu base al min ${bestDrop.minute}.`,
      };
    }
  }
  if (!castleDrop && rivalBase && myBase && rivalState?.castleBuildCoords?.length) {
    const rCastles = rivalState.castleBuildCoords.filter((b) => b.bid === 82 || b.bid === 1251);
    const enemyDrop = rCastles.find((c) => dist(c, myBase) < dist(c, rivalBase) * 0.9);
    if (enemyDrop) {
      const m = Math.round(enemyDrop.ms / 60_000);
      castleDrop = {
        kind: 'rival-offensive',
        tone: won === true ? 'win' : 'loss',
        minute: m,
        title: won === true ? `Sobreviviste a un Castle Drop (min ${m})` : `Recibiste un Castle Drop al min ${m}`,
        detail: won === true
          ? `El rival te plantó un Castillo en la cara al min ${m} y lograste darlo vuelta.`
          : `El rival colocó un Castillo ofensivo cerca de tu base al min ${m}.`,
      };
    }
  }

  return {
    ghostVillagers,
    turningPoint,
    blacksmithGap,
    techSwitch,
    tgRoleEval,
    trappedResources,
    replayChronicle,
    castleDrop,
  };
}

/**
 * Ejecuta el análisis completo sobre `chapter.operations` del .aoe2record.
 */
function analyzePostmatchEngine(operations, {
  selfSlot, rivalSlot = null, selfCiv = null, rivalCiv = null, allyCivs = [],
  selfAges = null, rivalAges = null, opening = null, openingShort = null,
  playerElo = null, durationMs = 0, isTeamGame = false, startingAge = 'dark',
  teamRole = null, mapSize = 120, won = null, allPlayers = null,
} = {}) {
  const list = Array.isArray(operations) ? operations : [];
  if (!list.length || !Number.isFinite(Number(selfSlot))) return null;

  const selfId = Number(selfSlot);
  const rivalId = Number.isFinite(Number(rivalSlot)) && Number(rivalSlot) > 0 ? Number(rivalSlot) : null;
  const tracked = new Map([[selfId, createSlotState(selfId, selfCiv, selfAges, startingAge, allyCivs)]]);
  if (rivalId && rivalId !== selfId) tracked.set(rivalId, createSlotState(rivalId, rivalCiv, rivalAges, startingAge, []));

  // Tracker liviano de eAPM minuto a minuto para TODOS los participantes de la partida (2..8)
  const rosterTrackers = new Map();
  const rosterMeta = Array.isArray(allPlayers) && allPlayers.length >= 2
    ? allPlayers
    : [
        { slot: selfId, name: 'Vos', civ: selfCiv, color: 1, team: 1, isSelf: true },
        ...(rivalId && rivalId !== selfId ? [{ slot: rivalId, name: 'Rival', civ: rivalCiv, color: 2, team: 2, isSelf: false }] : []),
      ];
  for (const p of rosterMeta) {
    const slotNum = Number(p?.slot);
    if (!Number.isFinite(slotNum) || slotNum <= 0 || rosterTrackers.has(slotNum)) continue;
    rosterTrackers.set(slotNum, {
      slot: slotNum,
      profileId: p.profileId ?? null,
      name: p.name || `P${slotNum}`,
      civ: p.civ || null,
      color: p.color ?? null,
      team: p.team ?? null,
      isSelf: Boolean(p.isSelf || slotNum === selfId),
      totalActions: 0,
      effectiveMs: [],
      lastByType: new Map(),
    });
  }

  let maxMs = Number(durationMs) || 0;
  const chatStats = { taunts: 0, laugh11: 0, ggCount: 0, hadResign: false };

  for (const op of list) {
    if (op && op.Chat) {
      const cm = parseChatMeta(op.Chat);
      if (cm) {
        if (cm.tauntNum != null) {
          chatStats.taunts += 1;
          if (cm.tauntNum === 11) chatStats.laugh11 += 1;
        }
        if (cm.isGg) chatStats.ggCount += 1;
      }
      continue;
    }
    const info = actionInfo(op);
    if (!info) continue;
    if (info.ms > maxMs) maxMs = info.ms;
    if (info.type === 'Resign') chatStats.hadResign = true;

    const rt = rosterTrackers.get(info.playerId);
    if (rt) {
      rt.totalActions += 1;
      const prevRtMs = rt.lastByType.get(info.type);
      if (prevRtMs == null || info.ms - prevRtMs >= 150) {
        rt.effectiveMs.push(info.ms);
        rt.lastByType.set(info.type, info.ms);
      }
    }

    const state = tracked.get(info.playerId);
    if (!state) continue;

    state.totalActions += 1;
    // eAPM: ignora clics duplicados del mismo comando en < 150 ms
    const prevMs = state.lastActionByType.get(info.type);
    if (prevMs == null || info.ms - prevMs >= 150) {
      state.effectiveActions += 1;
      state.effectiveActionTimes.push(info.ms);
      state.lastActionByType.set(info.type, info.ms);
    }

    if (PURE_COMBAT_COMMANDS.has(info.type)) {
      state.militaryActions += 1;
      state.militaryActionTimes.push(info.ms);
    } else if (info.type === 'Move') {
      // Solo contar Move como acción militar cuando ya existen unidades militares
      // (evita contar movimientos de aldeanos/ovejas/explorador inicial en Alta Edad como micro militar)
      if (state.firstMilitaryMs != null && info.ms >= state.firstMilitaryMs) {
        state.militaryActions += 1;
        state.militaryActionTimes.push(info.ms);
      } else {
        state.ecoActions += 1;
        state.ecoActionTimes.push(info.ms);
      }
    } else if (info.type === 'Order') {
      const oType = info.payload.order_type;
      if (oType === 'Pack') {
        state.militaryActions += 1;
        state.militaryActionTimes.push(info.ms);
      } else {
        state.ecoActions += 1;
        state.ecoActionTimes.push(info.ms);
      }
      // Cancelación de cola (`Unqueue`): descuenta el último ítem real (tecnología o aldeano/unidad) de ese edificio
      if (oType === 'Unqueue') {
        const objIds = Array.isArray(info.payload.object_ids) && info.payload.object_ids.length
          ? info.payload.object_ids.map(String)
          : (info.payload.building_id != null ? [String(info.payload.building_id)] : []);
        for (const oid of objIds) {
          const tc = state.tcs.get(oid);
          if (tc && tc.busyUntil != null && tc.busyUntil > info.ms && tc.intervals.length) {
            const lastItem = tc.queueItems && tc.queueItems.length ? tc.queueItems[tc.queueItems.length - 1] : null;
            if (lastItem && lastItem.kind === 'tech' && lastItem.end > info.ms) {
              tc.queueItems.pop();
              const tId = lastItem.techId;
              state.seenTcTechs.delete(tId);
              if (!state.freeTechIds.has(tId)) {
                state.allTechs.delete(tId);
                state.ecoTechs.delete(tId);
              }
              if (tId === 22 && state.loomMs != null) state.loomMs = null;
              if (tId === 101) {
                state.feudalClickMs = null;
                if (!state.authoritativeAges?.feudal) state.feudalReachedMs = null;
              }
              if (tId === 102 && !state.authoritativeAges?.castle) state.castleReachedMs = null;
              if (tId === 103 && !state.authoritativeAges?.imperial) state.imperialReachedMs = null;
              const lastIv = tc.intervals[tc.intervals.length - 1];
              if (lastIv && lastIv[0] < info.ms) {
                lastIv[1] = info.ms;
              } else {
                tc.intervals.pop();
              }
              tc.busyUntil = tc.intervals.length ? tc.intervals[tc.intervals.length - 1][1] : info.ms;
              continue;
            }
            if (tc.queueItems && tc.queueItems.length) tc.queueItems.pop();
            const curAge = state.imperialReachedMs != null && info.ms >= state.imperialReachedMs ? 'imperial'
              : state.castleReachedMs != null && info.ms >= state.castleReachedMs ? 'castle'
                : state.feudalReachedMs != null && info.ms >= state.feudalReachedMs ? 'feudal' : 'dark';
            const popMs = villagerTrainMs(state.civ, curAge);
            const last = tc.intervals[tc.intervals.length - 1];
            if (last && last[1] - last[0] > popMs) {
              last[1] = Math.max(info.ms, last[1] - popMs);
            } else {
              tc.intervals.pop();
            }
            tc.busyUntil = tc.intervals.length ? tc.intervals[tc.intervals.length - 1][1] : info.ms;
            if (state.villagersOrdered > 0) state.villagersOrdered -= 1;
            if (tc.villagers > 0) tc.villagers -= 1;
            continue;
          }
          const ws = state.workshops.get(oid);
          if (ws && ws.busyUntil != null && ws.busyUntil > info.ms && ws.intervals.length) {
            const last = ws.intervals[ws.intervals.length - 1];
            const popMs = ws.lastTrainMs || 25_000;
            if (last && last[1] - last[0] > popMs) {
              last[1] = Math.max(info.ms, last[1] - popMs);
            } else {
              ws.intervals.pop();
            }
            ws.busyUntil = ws.intervals.length ? ws.intervals[ws.intervals.length - 1][1] : info.ms;
            if (state.militaryOrdered > 0) state.militaryOrdered -= 1;
            if (ws.units > 0) ws.units -= 1;
          }
        }
      }
    } else if (ECO_COMMANDS.has(info.type)) {
      state.ecoActions += 1;
      state.ecoActionTimes.push(info.ms);
    }

    if (info.type === 'Move') state.moveCount += 1;
    else if (info.type === 'DeAttackMove' || info.type === 'AttackGround') state.attackMoveCount += 1;
    else if (info.type === 'Patrol') state.patrolCount += 1;
    else if (info.type === 'Buy' || info.type === 'Sell') {
      state.marketCount += 1;
      if (info.ms <= 20 * 60_000) state.marketEarlyOps += 1;
      const bytes = Array.isArray(info.payload.data) ? info.payload.data : null;
      const resId = bytes ? Number(bytes[0]) : Number(info.payload.resource_type);
      const mult = bytes && Number(bytes[2]) > 0 ? Math.min(20, Number(bytes[2])) : 1;
      const resKey = resId === 0 ? 'food' : resId === 1 ? 'wood' : resId === 2 ? 'stone' : null;
      if (resKey) {
        if (info.type === 'Buy') state.marketBought[resKey] += mult * 100;
        else state.marketSold[resKey] += mult * 100;
      }
    }
    else if (info.type === 'TownBell') {
      // En aoe2rec-js real: data[4] === 1 es sonar campana ON; data[4] === 0 es apagarla (OFF).
      // Además, con N TCs seleccionados emite N paquetes en el mismo ms -> debounce 1000 ms.
      const bytes = Array.isArray(info.payload.data) ? info.payload.data : null;
      const isRingOn = !bytes || bytes.length < 5 || Number(bytes[4]) === 1;
      if (isRingOn && info.ms - state.lastTownBellMs >= 1000) {
        state.townBellCount += 1;
        state.lastTownBellMs = info.ms;
      }
    }
    else if (info.type === 'Tribute') state.tributesSent += 1;
    else if (info.type === 'Delete') state.selfDeleted += 1;
    else if (info.type === 'Formation') state.formationsCount += 1;
    else if (info.type === 'Stance') state.stancesCount += 1;
    else if (info.type === 'BackToWork') state.backToWorkCount += 1;
    else if (info.type === 'Stop') state.stopMicroCount += 1;
    else if (info.type === 'Wall') state.wallsPlaced += 1;
    else if (info.type === 'Repair') state.repairsCount += 1;
    else if (info.type === 'Flare') state.flaresCount += 1;
    else if (info.type === 'Build') {
      const bid = readBuildId(info.payload);
      const coords = readBuildCoords(info.payload);
      if (coords) {
        if (info.ms <= 6 * 60_000 && state.earlyBuildCoords.length < 16) {
          state.earlyBuildCoords.push(coords);
        }
        if (bid === 82 || bid === 1251 || bid === 79) {
          state.castleBuildCoords.push({ bid, ms: info.ms, x: coords.x, y: coords.y });
        }
      }
      if (bid > 0) {
        const curAge = state.imperialReachedMs != null && info.ms >= state.imperialReachedMs ? 'impCount'
          : state.castleReachedMs != null && info.ms >= state.castleReachedMs ? 'castleCount'
            : state.feudalReachedMs != null && info.ms >= state.feudalReachedMs ? 'feudalCount' : 'darkCount';
        const rec = state.buildsByType.get(bid) || { count: 0, firstMs: info.ms, darkCount: 0, feudalCount: 0, castleCount: 0, impCount: 0 };
        rec.count += 1;
        rec[curAge] += 1;
        state.buildsByType.set(bid, rec);
        if (bid === 50 || bid === 1889) {
          state.farmsBuilt += 1; // Granja o Pastura (Khitans)
          if (bid === 1889) state.pasturesBuilt += 1;
        } else if (bid === 70) state.housesBuilt += 1;
        else if (bid === 82 || bid === 1251) state.castlesBuilt += 1; // Castillo o Krepost
        else if (bid === 621 || bid === 109 || bid === 71) {
          state.extraTcsBuilt += 1;
          if (state.castleReachedMs == null || info.ms < state.castleReachedMs) state.extraTcsBuiltFeudal += 1;
        } else if (bid === 79 || bid === 234 || bid === 235 || bid === 236 || bid === 1665) state.towersBuilt += 1;
        else if (bid === 1808) state.muleCartsCreated += 1;
      }
    }

    if (info.type === 'Research') {
      const techId = Number(info.payload.technology_type);
      if (Number.isFinite(techId) && techId > 0 && !state.allTechs.has(techId)) {
        state.allTechs.set(techId, info.ms);
      }
      if (techId === 22 && state.loomMs == null) state.loomMs = info.ms;
      if (ECO_TECH_NAMES[techId] && !state.ecoTechs.has(techId)) state.ecoTechs.set(techId, info.ms);
      if (BLACKSMITH_TECH_NAMES[techId] && !state.blacksmithTechs.has(techId)) state.blacksmithTechs.set(techId, info.ms);
      if (COMBAT_KEY_TECH_NAMES[techId] && !state.combatTechs.has(techId)) state.combatTechs.set(techId, info.ms);
      const curAge = state.imperialReachedMs != null && info.ms >= state.imperialReachedMs ? 'imperial'
        : state.castleReachedMs != null && info.ms >= state.castleReachedMs ? 'castle'
          : state.feudalReachedMs != null && info.ms >= state.feudalReachedMs ? 'feudal' : 'dark';
      const tcSec = tcResearchDuration(techId, state.civ, curAge, state.teamCivSlugs);
      if (tcSec > 0 && !state.seenTcTechs.has(techId)) {
        state.seenTcTechs.add(techId);
        const bIds = Array.isArray(info.payload.building_ids) && info.payload.building_ids.length
          ? info.payload.building_ids.map(String)
          : (info.payload.building_id > 0 ? [String(info.payload.building_id)]
            : state.tcs.size ? [[...state.tcs.keys()][0]] : [`tc_${info.playerId}`]);
        const tc = pickShortestQueue(bIds.map((k) => ensureTc(state, k)));
        const vTrain = villagerTrainMs(state.civ, curAge);
        const start = tc.busyUntil === null
          ? info.ms
          : Math.min(info.ms + vTrain, Math.max(info.ms, tc.busyUntil));
        const end = start + tcSec * 1000;
        tc.intervals.push([start, end]);
        if (tc.queueItems) tc.queueItems.push({ kind: 'tech', techId, start, end });
        tc.busyUntil = end;
        if (techId === 101) {
          if (state.feudalClickMs == null) state.feudalClickMs = info.ms;
          if (state.feudalReachedMs == null) state.feudalReachedMs = end;
        }
        if (techId === 102 && state.castleReachedMs == null) state.castleReachedMs = end;
        if (techId === 103 && state.imperialReachedMs == null) state.imperialReachedMs = end;
      }
      continue;
    }

    if (info.type === 'DeQueue') {
      const unitId = Number(info.payload.unit_id);
      if (!Number.isFinite(unitId) || unitId <= 0) continue;
      const amount = Math.max(1, Math.min(256, Number(info.payload.amount) || 1));
      const bType = Number(info.payload.building_type) || 0;
      const unit = unitInfo(unitId);

      if (VILLAGERS.has(unitId)) {
        const bIds = Array.isArray(info.payload.building_ids) && info.payload.building_ids.length
          ? info.payload.building_ids.map(String)
          : (state.tcs.size ? [[...state.tcs.keys()][0]] : [`tc_${info.playerId}`]);
        // Si antes se creó un TC sintético `tc_<pid>` por un Research sin building_ids y ahora llegan IDs reales, migrarlo
        const synthKey = `tc_${info.playerId}`;
        if (bIds[0] !== synthKey && state.tcs.has(synthKey) && !state.tcs.has(bIds[0])) {
          const synth = state.tcs.get(synthKey);
          state.tcs.delete(synthKey);
          synth.id = bIds[0];
          state.tcs.set(bIds[0], synth);
        }
        const candidates = bIds.map((k) => ensureTc(state, k));
        const curAge = state.imperialReachedMs != null && info.ms >= state.imperialReachedMs ? 'imperial'
          : state.castleReachedMs != null && info.ms >= state.castleReachedMs ? 'castle'
            : state.feudalReachedMs != null && info.ms >= state.feudalReachedMs ? 'feudal' : 'dark';
        const vTrain = villagerTrainMs(state.civ, curAge);
        // Filtrar solo ráfagas sostenidas de tecla mantenida (>= 4 toques seguidos < 240 ms con >= 3 aldeanos ya en cola),
        // o > maxStartVils antes de los 18 s en inicio estándar (límite físico de 200-300 comida inicial).
        if (bIds.length === 1 && amount === 1) {
          const singleTc = candidates[0];
          const remMs = singleTc.busyUntil != null ? Math.max(0, singleTc.busyUntil - info.ms) : 0;
          const maxStartVils = state.civSlug === 'lithuanians'
            ? 6
            : ['persians', 'hindustanis', 'tupi', 'incas', 'aztecs'].includes(state.civSlug) ? 5 : 4;
          const overOpeningFoodCap = curAge === 'dark' && state.startingAge === 'dark' && info.ms < 18_000 && singleTc.villagers >= maxStartVils;
          singleTc.tapStreak = (info.ms - singleTc.lastTapMs < 240) ? ((singleTc.tapStreak || 1) + 1) : 1;
          singleTc.lastTapMs = info.ms;
          if (overOpeningFoodCap || (singleTc.tapStreak >= 4 && remMs >= 3 * vTrain)) continue;
        } else {
          for (const c of candidates) { c.lastTapMs = info.ms; c.tapStreak = 1; }
        }
        state.villagersOrdered += amount;
        state.villagerEvents.push({ ms: info.ms, amount });
        state.tcOrderTimes.push(info.ms);
        const toQueue = Math.min(10, amount);
        // Distribuir 1 a 1 en el TC con cola más corta (comportamiento real de Shift+Q con múltiples TCs)
        for (let q = 0; q < toQueue; q += 1) {
          const tc = pickShortestQueue(candidates);
          const start = tc.busyUntil === null ? info.ms : Math.max(info.ms, tc.busyUntil);
          const maxEnd = info.ms + TC_MAX_QUEUE_AHEAD_MS;
          const end = Math.min(maxEnd, start + vTrain);
          if (end > start) {
            tc.intervals.push([start, end]);
            if (tc.queueItems) tc.queueItems.push({ kind: 'vil', techId: null, start, end });
            tc.busyUntil = end;
          }
          tc.villagers += 1;
        }
        if (state.firstTcOrderMs === null || info.ms < state.firstTcOrderMs) state.firstTcOrderMs = info.ms;
        state.lastTcOrderMs = Math.max(state.lastTcOrderMs || 0, info.ms);
      } else if (CIVILIAN_UNIT_IDS.has(unitId) || bType === 84) {
        // Pesqueros, carretas comerciales, barcos mercantes, transportes y mulas son económicos, nunca militares
        if (unitId === 1808) state.muleCartsCreated += amount;
        if (unitId === 128 || unitId === 17) state.tradeCartsOrdered += amount;
        const uRec = state.unitCountsById.get(unitId) || { count: 0, firstMs: info.ms };
        uRec.count += amount;
        state.unitCountsById.set(unitId, uRec);
        continue;
      } else {
        if (MILITARY_BUILDING_TYPES.has(bType)) {
          const bIds = Array.isArray(info.payload.building_ids) && info.payload.building_ids.length
            ? info.payload.building_ids.map(String)
            : [`ws_${bType}`];
          const candidates = bIds.map((k) => {
            let ws = state.workshops.get(k);
            if (!ws) {
              ws = { id: k, typeId: bType, busyUntil: null, intervals: [], units: 0, firstMs: info.ms, lastMs: info.ms, maxQueue: 0, orders: 0, overloadedOrders: 0, lastTrainMs: 25_000, lastTapMs: -Infinity };
              state.workshops.set(k, ws);
            }
            return ws;
          });
          const trainSec = unit.trainSeconds || 25;
          const speedMult = militaryTrainSpeedMultiplier(state, unitId, bType);
          const trainMs = Math.max(2000, Math.round((trainSec * 1000) / speedMult));
          // Filtrar ráfagas de tecla mantenida (< 240 ms) en un solo edificio cuando ya tiene >= 2 unidades en cola
          if (bIds.length === 1 && amount === 1) {
            const singleWs = candidates[0];
            const remMs = singleWs.busyUntil !== null ? Math.max(0, singleWs.busyUntil - info.ms) : 0;
            const isMashSpam = info.ms - (singleWs.lastTapMs ?? -Infinity) < 240 && remMs >= 2 * trainMs;
            singleWs.lastTapMs = info.ms;
            if (isMashSpam) continue;
          } else {
            for (const c of candidates) c.lastTapMs = info.ms;
          }
          const toQueue = Math.min(20, amount);
          for (let q = 0; q < toQueue; q += 1) {
            const ws = pickShortestQueue(candidates);
            const remMs = ws.busyUntil !== null ? Math.max(0, ws.busyUntil - info.ms) : 0;
            const qDepth = remMs / trainMs + 1;
            ws.maxQueue = Math.max(ws.maxQueue, qDepth);
            if (q === 0) {
              ws.orders += 1;
              if (qDepth >= 4) ws.overloadedOrders += 1;
            }
            const start = ws.busyUntil === null ? info.ms : Math.max(info.ms, ws.busyUntil);
            const end = Math.min(info.ms + 10 * trainMs, start + trainMs);
            if (end > start) {
              ws.intervals.push([start, end]);
              ws.busyUntil = end;
            }
            ws.units += 1;
            ws.lastTrainMs = trainMs;
            ws.lastMs = Math.max(ws.lastMs, info.ms);
          }
        }
        state.militaryOrdered += amount;
        state.militaryEvents.push({ ms: info.ms, amount });
        if (state.firstMilitaryMs == null) state.firstMilitaryMs = info.ms;
        const combatClass = classifyCombatClass(unitId, bType, unit);
        state.armyClasses[combatClass] = (state.armyClasses[combatClass] || 0) + amount;
        const isSpear = SPEAR_LINE_UNIT_IDS.has(unitId);
        if (isSpear) state.armyClasses.spearLine += amount;
        if (combatClass && combatClass !== 'none' && state.classMassMs[combatClass] == null && state.armyClasses[combatClass] >= 6) {
          state.classMassMs[combatClass] = info.ms;
        }
        state.classEvents.push({ ms: info.ms, cls: combatClass, isSpear, amount });
        const bucket = state.unitCounts.get(unit.key) || { key: unit.key, unitId, name: unit.name, count: 0 };
        bucket.count += amount;
        state.unitCounts.set(unit.key, bucket);
        const uRec = state.unitCountsById.get(unitId) || { count: 0, firstMs: info.ms };
        uRec.count += amount;
        state.unitCountsById.set(unitId, uRec);
      }
    }
  }

  const selfState = tracked.get(selfId);
  const rivalState = rivalId ? tracked.get(rivalId) : null;
  const self = finalizePlayer(selfState, maxMs, { isRival: false });
  const rival = rivalState ? finalizePlayer(rivalState, maxMs, { isRival: true }) : null;
  const timeline = buildTimelineBuckets(selfState, rivalState, maxMs, 12);
  const eapmComparison = buildAllPlayersEapm(rosterTrackers, maxMs);
  const { openingSummary, stages } = buildStageGrades(self, selfState, { opening, openingShort, playerElo, durationMs: maxMs });
  const isShortAbandon = maxMs < 180_000 && selfState.feudalReachedMs == null;
  const rawHf = buildHighlightsAndFocus(self, rival, {
    durationMs: maxMs, openingSummary, stages, isTeamGame: Boolean(isTeamGame), selfCiv, rivalCiv,
  });
  const civMastery = isShortAbandon
    ? null
    : evaluateCivMastery({
        state: selfState,
        self,
        rivalState,
        durationMs: maxMs,
        isTeamGame: Boolean(isTeamGame),
      });
  const { highlights, positives, negatives, focus } = isShortAbandon
    ? {
        highlights: rawHf.negatives.slice(0, 1),
        positives: [],
        negatives: rawHf.negatives,
        focus: rawHf.negatives.length
          ? rawHf.focus
          : {
              title: 'Partida demasiado breve para diagnóstico completo',
              detail: 'La partida terminó antes de los 3 minutos; el análisis completo aparece en partidas regulares.',
            },
      }
    : rawHf;

  const postmatchInsights = isShortAbandon
    ? null
    : buildPostmatchInsights({
        selfState,
        rivalState,
        self,
        rival,
        timeline,
        durationMs: maxMs,
        isTeamGame: Boolean(isTeamGame),
        teamRole,
        mapSize,
        chatStats,
        won,
      });

  return {
    version: VERSION,
    engineRev: ENGINE_REV,
    isTeamGame: Boolean(isTeamGame),
    teamRole: teamRole || null,
    durationSeconds: Math.round((maxMs / 1000) * 10) / 10,
    self,
    rival,
    openingSummary,
    stages,
    timeline,
    eapmComparison,
    highlights,
    positives,
    negatives,
    focus,
    civMastery,
    postmatchInsights,
  };
}

module.exports = {
  VERSION,
  analyzePostmatchEngine,
  gradeFromScore,
  TC_RESEARCH_SECONDS,
  classifyCombatClass,
  tcResearchDuration,
  evaluateCivMastery,
  normalizeCivSlug,
  civHasTech,
};
