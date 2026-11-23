'use strict';

/**
 * Base de conocimiento de bonos de civilización, árbol tecnológico (civ-tech.json)
 * y evaluador determinista de aprovechamiento competitivo (`evaluateCivMastery`)
 * para las 56 civilizaciones estándar de Age of Empires II: Definitive Edition.
 *
 * Principio de honestidad estricta:
 *   - Solo evalúa hechos 100% comprobables en el `.aoe2record` (tecnologías,
 *     edificios construidos, unidades entrenadas, mercado, tiempos de edad).
 *   - Nunca inventa ni asume mecánicas no observables (ciervos empujados,
 *     reliquias recogidas, ovejas guarecidas, bajas o flotante exacto).
 *   - Toda crítica (`missed`) pasa por filtros de edad, mapa de agua, modo TG
 *     y disponibilidad real en `src/civ-tech.json`.
 */

const { civSlug } = require('../civs');
const { CIV_GUIDE } = require('../civ-guide');
const CIV_TECH = require('../civ-tech.json');

const SPANISH_TO_SLUG = Object.freeze(
  Object.fromEntries(
    Object.entries(CIV_GUIDE || {}).map(([slug, info]) => [
      String(info?.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z0-9]/g, ''),
      slug,
    ]),
  ),
);

function normalizeCivSlug(raw) {
  if (!raw) return null;
  const direct = civSlug(raw);
  if (direct) return direct;
  const clean = String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
  return SPANISH_TO_SLUG[clean] || null;
}

function localizedCivName(slug, fallback = '') {
  if (slug && CIV_GUIDE && CIV_GUIDE[slug] && CIV_GUIDE[slug].name) {
    return CIV_GUIDE[slug].name;
  }
  return fallback || slug || '';
}

/** Mapeo exacto techId (replay) -> nombre de nodo en `src/civ-tech.json`. */
const TECH_ID_TO_NODE = Object.freeze({
  // Economía
  202: 'Double-Bit Axe',
  203: 'Bow Saw',
  221: 'Two-Man Saw',
  14: 'Horse Collar',
  13: 'Heavy Plow',
  12: 'Crop Rotation',
  1014: 'Domestication',
  1013: 'Pastoralism',
  1012: 'Transhumance',
  55: 'Gold Mining',
  182: 'Gold Shaft Mining',
  278: 'Stone Mining',
  279: 'Stone Shaft Mining',
  213: 'Wheelbarrow',
  249: 'Hand Cart',
  // Herrería
  67: 'Forging',
  68: 'Iron Casting',
  75: 'Blast Furnace',
  74: 'Scale Mail Armor',
  76: 'Chain Mail Armor',
  77: 'Plate Mail Armor',
  81: 'Scale Barding Armor',
  82: 'Chain Barding Armor',
  80: 'Plate Barding Armor',
  199: 'Fletching',
  200: 'Bodkin Arrow',
  201: 'Bracer',
  211: 'Padded Archer Armor',
  212: 'Leather Archer Armor',
  219: 'Ring Archer Armor',
  // Combate / Clave
  435: 'Bloodlines',
  39: 'Husbandry',
  437: 'Thumb Ring',
  436: 'Parthian Tactics',
  93: 'Ballistics',
  47: 'Chemistry',
  377: 'Siege Engineers',
  315: 'Conscription',
  602: 'Arson',
  875: 'Gambesons',
  215: 'Squires',
  15: 'Guilds',
  48: 'Caravan',
  374: 'Careening',
  375: 'Dry Dock',
  8: 'Town Watch',
  280: 'Town Patrol',
});

function civTechAge(slug, techId) {
  const civData = slug && CIV_TECH && CIV_TECH.civilizations && CIV_TECH.civilizations[slug];
  const node = TECH_ID_TO_NODE[techId];
  if (!civData || !node) return undefined; // Chronicles o tech fuera de tabla -> fallback permisivo
  return Object.prototype.hasOwnProperty.call(civData.nodes, node) ? civData.nodes[node] : null;
}

function civHasTech(slug, techId) {
  return civTechAge(slug, techId) !== null;
}

function civHasTechByAge(slug, techId, maxAgeNum) {
  const age = civTechAge(slug, techId);
  if (age === null) return false;
  if (age === undefined) return true;
  return age <= maxAgeNum;
}

/* ==================== Helpers de consulta sobre state ==================== */

function sumUnits(state, unitIds) {
  if (!state || !state.unitCountsById || !Array.isArray(unitIds)) return 0;
  let total = 0;
  for (const id of unitIds) {
    const rec = state.unitCountsById.get(id);
    if (rec) total += rec.count;
  }
  return total;
}

function sumBuilds(state, buildingIds, ageKey = 'count') {
  if (!state || !state.buildsByType || !Array.isArray(buildingIds)) return 0;
  let total = 0;
  for (const id of buildingIds) {
    const rec = state.buildsByType.get(id);
    if (rec) total += rec[ageKey] || 0;
  }
  return total;
}

function hasAnyTech(state, techIds) {
  if (!state || !state.allTechs) return false;
  return techIds.some((id) => state.allTechs.has(id));
}

function countTechs(state, techIds) {
  if (!state || !state.allTechs) return 0;
  let n = 0;
  for (const id of techIds) {
    if (state.allTechs.has(id)) n += 1;
  }
  return n;
}

function countManualTechs(state, techIds) {
  if (!state || !state.allTechs) return 0;
  let n = 0;
  for (const id of techIds) {
    if (state.allTechs.has(id) && !(state.freeTechIds && state.freeTechIds.has(id))) n += 1;
  }
  return n;
}

function ageDurationSec(state, age, durationMs) {
  if (age === 'dark') return Math.round((state.feudalReachedMs ?? durationMs) / 1000);
  if (age === 'feudal') {
    if (state.feudalReachedMs == null) return 0;
    const end = state.castleReachedMs != null ? Math.min(state.castleReachedMs, durationMs) : durationMs;
    return Math.max(0, Math.round((end - state.feudalReachedMs) / 1000));
  }
  if (age === 'castle') {
    if (state.castleReachedMs == null) return 0;
    const end = state.imperialReachedMs != null ? Math.min(state.imperialReachedMs, durationMs) : durationMs;
    return Math.max(0, Math.round((end - state.castleReachedMs) / 1000));
  }
  if (age === 'imperial') {
    if (state.imperialReachedMs == null) return 0;
    return Math.max(0, Math.round((durationMs - state.imperialReachedMs) / 1000));
  }
  return 0;
}

function reachedAgeForMiss(state, minAge, durationMs) {
  if (!minAge || minAge === 'dark') return durationMs >= 10 * 60_000;
  if (minAge === 'feudal') return state.feudalReachedMs != null && durationMs >= 13 * 60_000 && ageDurationSec(state, 'feudal', durationMs) >= 120;
  if (minAge === 'castle') return state.castleReachedMs != null && durationMs >= 18 * 60_000 && ageDurationSec(state, 'castle', durationMs) >= 180;
  if (minAge === 'imperial') return state.imperialReachedMs != null && durationMs >= 26 * 60_000 && ageDurationSec(state, 'imperial', durationMs) >= 180;
  return false;
}

function detectWaterActivity(selfState, rivalState) {
  const check = (st) => {
    if (!st) return false;
    if (sumBuilds(st, [45, 1189]) > 0) return true; // Muelle / Puerto
    if (sumUnits(st, [13, 17, 545, 539, 442, 21, 1103, 529, 1104, 527, 420, 691, 250, 533, 1004, 1006, 1750, 1795, 1948]) > 0) return true;
    return false;
  };
  return check(selfState) || check(rivalState);
}

const SIEGE_UNIT_IDS = [279, 542, 280, 550, 588, 1258, 422, 548, 36, 1709, 1001, 1003, 1704, 1706, 1923, 1942, 1962, 1980, 1744, 1746];
const FOOT_ARCHER_IDS = [4, 24, 492];
const CA_UNIT_IDS = [39, 474];
const GUNPOWDER_IDS = [5, 36, 46, 557, 771, 773, 1001, 1003, 1709, 1911];
const CAMEL_IDS = [329, 330, 207, 1755];
const ELEPHANT_IDS = [1132, 1134, 873, 875, 1120, 1122, 1744, 1746, 239, 558];
const KNIGHT_LINE_IDS = [38, 283, 569, 1813];
const SCOUT_LINE_IDS = [448, 546, 441, 1707];
const MILITIA_LINE_IDS = [74, 75, 77, 473, 567, 1793];
const SPEAR_IDS = [93, 358, 359, 1786, 1787, 1788];
const SKIRM_IDS = [7, 6, 1155];
const EAGLE_IDS = [751, 753, 752];
const CHAMPI_IDS = [2550, 2552, 2554, 2588];

function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ==================== Fábricas de reglas declarativas ==================== */

function ruleCustom(spec) {
  return (ctx) => spec.check(ctx);
}

function ruleEarlyTech({
  id, category = 'eco', priority = 88, techIds, beforeAge = 'feudal', minCount = 1,
  minAgeForMiss = 'castle', titleHit, titleMiss, detailHit, detailMiss, metricHit,
}) {
  return (ctx) => {
    const { state, durationMs } = ctx;
    const cutoffMs = beforeAge === 'feudal' ? state.feudalReachedMs
      : beforeAge === 'castle' ? state.castleReachedMs
        : state.imperialReachedMs;
    const early = [];
    for (const tid of techIds) {
      if (!civHasTech(ctx.slug, tid)) continue;
      const ms = state.allTechs.get(tid);
      if (ms != null && (cutoffMs == null || ms < cutoffMs)) early.push(tid);
    }
    if (early.length >= minCount) {
      return {
        status: 'leveraged',
        id,
        category,
        priority,
        title: typeof titleHit === 'function' ? titleHit(early.length, ctx) : titleHit,
        metric: typeof metricHit === 'function' ? metricHit(early.length, ctx) : `${early.length} anticipada${early.length === 1 ? '' : 's'}`,
        detail: typeof detailHit === 'function' ? detailHit(early.length, ctx) : detailHit,
      };
    }
    if (titleMiss && reachedAgeForMiss(state, minAgeForMiss, durationMs)) {
      return {
        status: 'missed',
        id: `${id}-missed`,
        category,
        priority: priority - 6,
        title: titleMiss,
        metric: '0 anticipadas',
        detail: detailMiss,
      };
    }
    return null;
  };
}

function ruleBuilding({
  id, category = 'building', priority = 84, buildingIds, minCount = 1, ageKey = 'count',
  minAgeForMiss = 'castle', positiveOnly = false, waterOnly = false,
  titleHit, titleMiss, detailHit, detailMiss, metricHit,
}) {
  return (ctx) => {
    if (waterOnly && !ctx.hasWater) return null;
    const count = sumBuilds(ctx.state, buildingIds, ageKey);
    if (count >= minCount) {
      return {
        status: 'leveraged',
        id,
        category,
        priority,
        title: typeof titleHit === 'function' ? titleHit(count, ctx) : titleHit,
        metric: typeof metricHit === 'function' ? metricHit(count, ctx) : `${count} construid${count === 1 ? 'o' : 'os'}`,
        detail: typeof detailHit === 'function' ? detailHit(count, ctx) : detailHit,
      };
    }
    if (!positiveOnly && titleMiss && reachedAgeForMiss(ctx.state, minAgeForMiss, ctx.durationMs)) {
      return {
        status: 'missed',
        id: `${id}-missed`,
        category,
        priority: priority - 8,
        title: titleMiss,
        metric: `${count} construidos`,
        detail: detailMiss,
      };
    }
    return null;
  };
}

function ruleUnitCore({
  id, category = 'signature_unit', priority = 82, unitIds = [], classes = [],
  minUnits = 16, minAgeForMiss = 'castle', positiveOnly = false, waterOnly = false,
  requireAnyTech = null, titleHit, titleMiss, detailHit, detailMiss, metricHit,
}) {
  return (ctx) => {
    if (waterOnly && !ctx.hasWater) return null;
    const byId = unitIds.length ? sumUnits(ctx.state, unitIds) : 0;
    const byClass = classes.reduce((s, c) => s + (ctx.self.armyClasses?.[c] || 0), 0);
    const total = Math.max(byId, byClass);
    const techOk = !requireAnyTech || requireAnyTech.every((tid) => !civHasTech(ctx.slug, tid)) || hasAnyTech(ctx.state, requireAnyTech);
    if (total >= minUnits && techOk) {
      return {
        status: 'leveraged',
        id,
        category,
        priority,
        title: typeof titleHit === 'function' ? titleHit(total, ctx) : titleHit,
        metric: typeof metricHit === 'function' ? metricHit(total, ctx) : `${total} unidades`,
        detail: typeof detailHit === 'function' ? detailHit(total, ctx) : detailHit,
      };
    }
    if (!positiveOnly && titleMiss && reachedAgeForMiss(ctx.state, minAgeForMiss, ctx.durationMs)) {
      return {
        status: 'missed',
        id: `${id}-missed`,
        category,
        priority: priority - 10,
        title: titleMiss,
        metric: `${total} unidades`,
        detail: detailMiss,
      };
    }
    return null;
  };
}

function ruleTechSpike({
  id, category = 'tech_spike', priority = 84, techIds, minCount = 1,
  onlyIfClass = null, minClassUnits = 12, minAgeForMiss = 'castle', positiveOnly = false,
  titleHit, titleMiss, detailHit, detailMiss,
}) {
  return (ctx) => {
    const avail = techIds.filter((tid) => civHasTech(ctx.slug, tid));
    if (!avail.length) return null;
    if (onlyIfClass) {
      const clsUnits = Array.isArray(onlyIfClass)
        ? onlyIfClass.reduce((s, c) => s + (ctx.self.armyClasses?.[c] || 0), 0)
        : (ctx.self.armyClasses?.[onlyIfClass] || 0);
      if (clsUnits < minClassUnits) return null;
    }
    const done = countTechs(ctx.state, avail);
    const need = Math.min(minCount, avail.length);
    if (done >= need) {
      return {
        status: 'leveraged',
        id,
        category,
        priority,
        title: typeof titleHit === 'function' ? titleHit(done, ctx) : titleHit,
        metric: `${done}/${avail.length} mejoras`,
        detail: typeof detailHit === 'function' ? detailHit(done, ctx) : detailHit,
      };
    }
    if (!positiveOnly && titleMiss && reachedAgeForMiss(ctx.state, minAgeForMiss, ctx.durationMs)) {
      return {
        status: 'missed',
        id: `${id}-missed`,
        category,
        priority: priority - 7,
        title: titleMiss,
        metric: `${done}/${avail.length} mejoras`,
        detail: detailMiss,
      };
    }
    return null;
  };
}

function ruleEcoBoom({
  id, category = 'eco', priority = 80, minTcs = 0, minFarms = 0, minEcoTechs = 0,
  minVils = 0, minAgeForMiss = 'castle', positiveOnly = false,
  titleHit, titleMiss, detailHit, detailMiss, metricHit,
}) {
  return (ctx) => {
    const tcs = ctx.self.townCenters || 0;
    const farms = ctx.self.effectiveFarms ?? ctx.self.macroBuilds?.farms ?? 0;
    const eco = ctx.self.techProfile?.ecoCount || 0;
    const vils = ctx.self.effectiveVillagers ?? ctx.self.villagersOrdered ?? 0;
    const ok = (minTcs <= 0 || tcs >= minTcs) &&
      (minFarms <= 0 || farms >= minFarms) &&
      (minEcoTechs <= 0 || eco >= minEcoTechs) &&
      (minVils <= 0 || vils >= minVils);
    if (ok) {
      return {
        status: 'leveraged',
        id,
        category,
        priority,
        title: typeof titleHit === 'function' ? titleHit(ctx) : titleHit,
        metric: typeof metricHit === 'function' ? metricHit(ctx) : `${tcs} TC · ${farms} granjas`,
        detail: typeof detailHit === 'function' ? detailHit(ctx) : detailHit,
      };
    }
    if (!positiveOnly && titleMiss && reachedAgeForMiss(ctx.state, minAgeForMiss, ctx.durationMs)) {
      return {
        status: 'missed',
        id: `${id}-missed`,
        category,
        priority: priority - 9,
        title: titleMiss,
        metric: `${tcs} TC · ${farms} granjas`,
        detail: detailMiss,
      };
    }
    return null;
  };
}

function ruleFastTempo({
  id, category = 'timing', priority = 82, targetFeudalSec = null, targetCastleSec = null,
  targetImpSec = null, titleHit, detailHit,
}) {
  return (ctx) => {
    const tm = ctx.self.timings || {};
    const hitFeudal = targetFeudalSec != null && tm.feudalSeconds != null && tm.feudalSeconds <= targetFeudalSec;
    const hitCastle = targetCastleSec != null && tm.castleSeconds != null && tm.castleSeconds <= targetCastleSec;
    const hitImp = targetImpSec != null && tm.imperialSeconds != null && tm.imperialSeconds <= targetImpSec;
    if (hitFeudal || hitCastle || hitImp) {
      const clock = hitCastle ? `Castillos ${fmtClock(tm.castleSeconds)}`
        : hitImp ? `Imperial ${fmtClock(tm.imperialSeconds)}`
          : `Feudal ${fmtClock(tm.feudalSeconds)}`;
      return {
        status: 'leveraged',
        id,
        category,
        priority,
        title: typeof titleHit === 'function' ? titleHit(clock, ctx) : titleHit,
        metric: clock,
        detail: typeof detailHit === 'function' ? detailHit(clock, ctx) : detailHit,
      };
    }
    return null;
  };
}

function ruleTeamTrade({ id, priority = 78, minCarts = 12, titleHit, detailHit }) {
  return (ctx) => {
    if (!ctx.isTeamGame) return null;
    const carts = ctx.state.tradeCartsOrdered || 0;
    if (carts >= minCarts) {
      return {
        status: 'leveraged',
        id,
        category: 'team',
        priority,
        title: titleHit,
        metric: `${carts} carretas`,
        detail: detailHit,
      };
    }
    return null;
  };
}

/* ==================== Registro completo de las 56 civilizaciones ==================== */

const CIV_MASTERY_PROFILES = Object.freeze({
  armenians: [
    ruleCustom({
      check(ctx) {
        const carts = ctx.state.muleCartsCreated || 0;
        const churches = sumBuilds(ctx.state, [1806]);
        if (carts >= 2 || churches >= 1) {
          return {
            status: 'leveraged', id: 'civ-armenians-eco', category: 'building', priority: 86,
            title: 'Aprovechaste Carros de mulas e Iglesia fortificada',
            metric: `${carts} mulas · ${churches} iglesias`,
            detail: 'Usaste la infraestructura económica móvil y las mejoras potenciadas (+40%) de Armenios.',
          };
        }
        if (reachedAgeForMiss(ctx.state, 'castle', ctx.durationMs)) {
          return {
            status: 'missed', id: 'civ-armenians-eco-missed', category: 'building', priority: 76,
            title: 'No construiste Iglesia fortificada en Castillos',
            metric: '0 iglesias fortificadas',
            detail: 'La Iglesia fortificada armenia potencia el entorno económico y protege aldeanos con flechas.',
          };
        }
        return null;
      },
    }),
    ruleEarlyTech({
      id: 'civ-armenians-early-barracks', category: 'tech_spike', priority: 88,
      techIds: [207, 197], beforeAge: 'castle', minCount: 1, minAgeForMiss: 'castle',
      titleHit: 'Adelantaste mejoras de Cuartel en Feudal',
      detailHit: 'Explotaste el pico único de Armenios sacando Espadachín de espada larga o Piquero una edad antes.',
    }),
    ruleUnitCore({
      id: 'civ-armenians-core', unitIds: [1800, 1802, 1811], classes: ['infantry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Núcleo de infantería/Arquero compuesto armenio',
      detailHit: 'Aprovechaste las unidades con ventaja de edad y penetración de armadura de tu civilización.',
    }),
  ],

  aztecs: [
    ruleUnitCore({
      id: 'civ-aztecs-core', unitIds: [...EAGLE_IDS, 725, 726, 125], classes: ['infantry'], minUnits: 18,
      titleHit: 'Presión de infantería/Águilas con +15% velocidad de creación',
      titleMiss: 'Poco volumen militar para explotar tu +15% de creación',
      detailHit: 'Convertiste la producción acelerada de Aztecas en volumen sostenido de infantería y Águilas.',
      detailMiss: 'Aztecas entrenan todas las unidades militares un 15% más rápido: buscá presionar con Águilas, infantería o Monjes.',
    }),
    ruleTechSpike({
      id: 'civ-aztecs-melee', techIds: [67, 68, 75], minCount: 2, onlyIfClass: 'infantry', minClassUnits: 14, positiveOnly: true,
      titleHit: 'Infantería respaldada con ataque de Herrería',
      detailHit: 'Acompañaste tu infantería azteca con Forja/Fundición para maximizar intercambios.',
    }),
  ],

  bengalis: [
    ruleEcoBoom({
      id: 'civ-bengalis-boom', minTcs: 3, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Multiplicaste los +2 aldeanos gratis por TC al avanzar',
      titleMiss: 'No escalaste a 3 TC para multiplicar tus aldeanos gratis',
      metricHit: (ctx) => `${ctx.self.townCenters} TC · +${ctx.self.bonusVillagers || 0} ald. gratis`,
      detailHit: 'Construir varios Centros urbanos antes de subir maximiza el bono único de Bengalis (+2 aldeanos por TC).',
      detailMiss: 'Cada TC extra te regala +2 aldeanos adicionales al subir a Imperial; sumar 3 TC en Castillos dispara tu economía.',
    }),
    ruleUnitCore({
      id: 'civ-bengalis-core', unitIds: [1738, 1740, 1759, 1761, ...ELEPHANT_IDS], minUnits: 12, positiveOnly: true,
      titleHit: 'Explotaste Ratha / Elefantes resistentes a daño extra',
      detailHit: 'Usaste las unidades emblema de Bengalis que reciben 25% menos daño adicional y resisten conversiones.',
    }),
    ruleTeamTrade({
      id: 'civ-bengalis-trade', titleHit: 'Bono de equipo de comercio aprovechado',
      detailHit: 'Tus carretas comerciales generaron comida adicional además de oro para sostener el late game.',
    }),
  ],

  berbers: [
    ruleUnitCore({
      id: 'civ-berbers-stable', unitIds: [...KNIGHT_LINE_IDS, ...CAMEL_IDS, ...SCOUT_LINE_IDS, 1007, 1009], classes: ['cavalry'], minUnits: 20,
      titleHit: 'Volumen de Establo aprovechando −15%/−20% de coste',
      titleMiss: 'Poca caballería para el descuento de Establo bereber',
      detailHit: 'Convertiste el descuento en Establo en masa constante de Jinetes, Camellos o Arqueros a camello.',
      detailMiss: 'Tu mayor ventaja competitiva son los Establos 15%/20% más baratos desde Castillos.',
    }),
    ruleTechSpike({
      id: 'civ-berbers-tech', techIds: [435, 81, 82], minCount: 2, onlyIfClass: 'cavalry', minClassUnits: 16, positiveOnly: true,
      titleHit: 'Caballería bereber con Pureza de sangre y armadura',
      detailHit: 'Combinaste coste reducido con mejoras defensivas para dominar choques en Castillos.',
    }),
  ],

  bohemians: [
    ruleEarlyTech({
      id: 'civ-bohemians-castle-chem', category: 'tech_spike', priority: 90,
      techIds: [47], beforeAge: 'imperial', minCount: 1, minAgeForMiss: 'castle',
      titleHit: 'Química investigada en Edad de los Castillos',
      detailHit: 'Aprovechaste el pico exclusivo de Bohemios para desbloquear Artilleros manuales y +1 ataque antes de Imperial.',
    }),
    ruleUnitCore({
      id: 'civ-bohemians-gp', unitIds: [5, 1704, 1706, 1709, 36], classes: ['gunpowder', 'ranged'], minUnits: 14, positiveOnly: true,
      titleHit: 'Núcleo de pólvora / Vagón husita / distancia bohemio',
      detailHit: 'Explotaste las unidades de pólvora y proyectil potenciadas de Bohemios.',
    }),
    ruleTechSpike({
      id: 'civ-bohemians-univ', techIds: [93, 47], minCount: 1, minAgeForMiss: 'castle', positiveOnly: true,
      titleHit: 'Universidad barata capitalizada en Castillos',
      detailHit: 'Usaste la Universidad económica (−100 madera) para llegar rápido a Balística/Química.',
    }),
  ],

  britons: [
    ruleUnitCore({
      id: 'civ-britons-archers', unitIds: [...FOOT_ARCHER_IDS, 8, 530], classes: ['ranged'], minUnits: 20,
      requireAnyTech: [199, 200],
      titleHit: 'Arqueros a pie con alcance extra y mejoras de ataque',
      titleMiss: 'Poco aprovechamiento de tu línea de arqueros de largo alcance',
      detailHit: 'Aprovechaste el +1/+2 de alcance en Castillos/Imperial junto con Emplumado y Punzones.',
      detailMiss: 'Los Britanos brillan al masificar Ballesteros/Arqueros de tiro largo aprovechando su alcance superior.',
    }),
    ruleEcoBoom({
      id: 'civ-britons-tcs', minTcs: 3, minAgeForMiss: 'castle', priority: 84,
      titleHit: 'Boom con Centros urbanos a mitad de madera (−50%)',
      titleMiss: 'No aprovechaste tus Centros urbanos a −50% de madera',
      metricHit: (ctx) => `${ctx.self.townCenters} TC construidos`,
      detailHit: 'Construiste múltiples Centros urbanos en Castillos a mitad de coste de madera.',
      detailMiss: 'Con Britanos los Centros urbanos cuestan la mitad de madera desde Castillos: sumar 2–3 TC es facilísimo.',
    }),
  ],

  bulgarians: [
    ruleCustom({
      check(ctx) {
        const kreposts = sumBuilds(ctx.state, [1251]);
        const konniks = sumUnits(ctx.state, [1225, 1227, 1254, 1255]);
        const militia = sumUnits(ctx.state, MILITIA_LINE_IDS);
        if (kreposts >= 1 || konniks >= 10 || militia >= 10) {
          return {
            status: 'leveraged', id: 'civ-bulgarians-signature', category: 'building', priority: 86,
            title: kreposts >= 1 ? `Control territorial con ${kreposts} Krepost` : 'Aprovechaste mejoras gratis de milicia / Konniks',
            metric: kreposts >= 1 ? `${kreposts} Krepost · ${konniks} Konniks` : `${Math.max(konniks, militia)} unidades`,
            detail: 'Explotaste el poder de tempo de Búlgaros (Krepost económico, Konniks o línea de Espadachines gratuita).',
          };
        }
        return null;
      },
    }),
    ruleTechSpike({
      id: 'civ-bulgarians-bs', techIds: [67, 68, 75, 74, 76, 77, 81, 82, 80], minCount: 4, minAgeForMiss: 'castle',
      titleHit: 'Herrería a −50% comida y +80% velocidad bien explotada',
      titleMiss: 'Pocas mejoras en tu Herrería rebajada (−50% comida)',
      detailHit: 'Aprovechaste el gran descuento y velocidad de Herrería de Búlgaros para pelear siempre con ventaja de mejoras.',
      detailMiss: 'La Herrería búlgara cuesta mitad de comida y trabaja 80% más rápido: mantené siempre tus mejoras al día.',
    }),
  ],

  burgundians: [
    ruleEarlyTech({
      id: 'civ-burgundians-early-eco', category: 'eco', priority: 92,
      techIds: [202, 14, 55, 278, 213], beforeAge: 'feudal', minCount: 1, minAgeForMiss: 'feudal',
      titleHit: (n) => `Investigaste ${n} mejora${n === 1 ? '' : 's'} económica${n === 1 ? '' : 's'} ya en Alta Edad Media`,
      titleMiss: 'No adelantaste mejoras económicas una edad antes',
      detailHit: 'Aprovechaste la mayor fortaleza de Borgoñeses: activar tecnología económica anticipada con −33% comida.',
      detailMiss: 'Con Borgoñeses podés investigar Hacha de doble filo/Collera en Alta Edad o Sierra de arco en Feudal (−33% comida).',
    }),
    ruleEarlyTech({
      id: 'civ-burgundians-feudal-bowsaw', category: 'eco', priority: 88,
      techIds: [203, 13, 249, 182], beforeAge: 'castle', minCount: 1, minAgeForMiss: 'castle',
      titleHit: 'Sierra de arco / mejoras de Castillos ya en Edad Feudal',
      detailHit: 'Llevaste tu economía de Feudal a nivel de Castillos antes de subir de edad.',
    }),
    ruleUnitCore({
      id: 'civ-burgundians-cav', unitIds: [...KNIGHT_LINE_IDS, 1655, 1657], classes: ['cavalry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Caballería / Costiller borgoñesa potenciada',
      detailHit: 'Acompañaste tu economía adelantada con volumen de caballería pesada o Costilleres.',
    }),
  ],

  burmese: [
    ruleEcoBoom({
      id: 'civ-burmese-wood', minFarms: 25, minAgeForMiss: 'castle', positiveOnly: true,
      titleHit: 'Convertiste las mejoras gratis de madera en economía fuerte',
      metricHit: (ctx) => `${ctx.self.macroBuilds?.farms || 0} granjas · ${ctx.self.workshopsCount} edif.`,
      detailHit: 'Usaste el ahorro de Hacha/Sierra gratuitas para escalar granjas y edificios sin frenar.',
    }),
    ruleUnitCore({
      id: 'civ-burmese-core', unitIds: [1126, 1128, 1132, 1134, 125], classes: ['infantry', 'gunpowder'], minUnits: 14, positiveOnly: true,
      titleHit: 'Explotaste infantería (+ataque), Arambai o Monjes birmanos',
      detailHit: 'Aprovechaste el +1/+2/+3 de ataque en infantería, Arambai o tecnologías de Monasterio a −50%.',
    }),
  ],

  byzantines: [
    ruleUnitCore({
      id: 'civ-byzantines-counters', unitIds: [...SPEAR_IDS, ...SKIRM_IDS, ...CAMEL_IDS, 40, 553], minUnits: 18, positiveOnly: true,
      titleHit: 'Aprovechaste unidades de contraataque baratas (−25%) / Catafractas',
      detailHit: 'Explotaste el descuento de Bizantinos en Piqueros, Guerrilleros y Camellos para ganar intercambios.',
    }),
    ruleFastTempo({
      id: 'civ-byzantines-imp', targetImpSec: 2160,
      titleHit: 'Avance rápido a Imperial con −33% de coste',
      detailHit: 'Capitalizaste el gran descuento a Edad Imperial de Bizantinos para tomar la delantera tecnológica.',
    }),
  ],

  celts: [
    ruleUnitCore({
      id: 'civ-celts-siege', unitIds: SIEGE_UNIT_IDS, minUnits: 8, minAgeForMiss: 'castle',
      titleHit: 'Asedio celta aprovechando +20% velocidad de disparo y creación',
      titleMiss: 'Poco asedio para explotar los talleres celtas (+20%)',
      detailHit: 'Combinaste la economía de madera (+15%) con presión de Taller de maquinaria de asedio.',
      detailMiss: 'Los Celtas tienen asedio que dispara y se produce más rápido: sumar Escorpiones, Manganas o Arietes marca la diferencia.',
    }),
    ruleUnitCore({
      id: 'civ-celts-inf', unitIds: [232, 534], classes: ['infantry'], minUnits: 18, positiveOnly: true,
      titleHit: 'Infantería veloz celta (+15% velocidad)',
      detailHit: 'Aprovechaste la movilidad superior de la infantería celta e Invasores de pastos.',
    }),
  ],

  chinese: [
    ruleCustom({
      check(ctx) {
        const tp = ctx.self.techProfile || {};
        const totalTechs = (tp.ecoCount || 0) + (tp.blacksmithCount || 0) + (tp.combatKeyCount || 0);
        if (totalTechs >= 10) {
          return {
            status: 'leveraged', id: 'civ-chinese-techs', category: 'tech_spike', priority: 86,
            title: `Descuento tecnológico chino aprovechado (${totalTechs} mejoras)`,
            metric: `${totalTechs} mejoras clave`,
            detail: 'Explotaste el −5%/−10%/−15% en tecnologías de Chinos para jugar con árbol tecnológico superior.',
          };
        }
        return null;
      },
    }),
    ruleUnitCore({
      id: 'civ-chinese-ranged', unitIds: [73, 559, ...FOOT_ARCHER_IDS, ...CA_UNIT_IDS], classes: ['ranged'], minUnits: 18, positiveOnly: true,
      titleHit: 'Núcleo de Arqueros / Chu Ko Nu chino',
      detailHit: 'Sacaste provecho de las unidades a distancia y árbol completo de Chinos.',
    }),
  ],

  cumans: [
    ruleCustom({
      check(ctx) {
        const feudalTcs = Math.max(ctx.self.feudalActiveTcs || 1, 1 + (ctx.state.extraTcsBuiltFeudal || 0));
        const feudalSiege = sumBuilds(ctx.state, [49], 'feudalCount');
        if (feudalTcs >= 2) {
          return {
            status: 'leveraged', id: 'civ-cumans-2tc', category: 'building', priority: 92,
            title: 'Boom de 2 Centros urbanos en Edad Feudal',
            metric: `${feudalTcs} TC en Feudal`,
            detail: 'Aprovechaste el bono más icónico de Cumanos construyendo un 2.º Centro urbano antes de Castillos.',
          };
        }
        if (feudalSiege >= 1) {
          return {
            status: 'leveraged', id: 'civ-cumans-feudal-siege', category: 'building', priority: 90,
            title: 'Taller de asedio en Edad Feudal',
            metric: `${feudalSiege} Taller en Feudal`,
            detail: 'Aprovechaste la presión exclusiva de Arietes cumanos en Feudal.',
          };
        }
        if (reachedAgeForMiss(ctx.state, 'castle', ctx.durationMs) && (ctx.self.timings?.castleSeconds || 0) > 1050) {
          return {
            status: 'missed', id: 'civ-cumans-feudal-missed', category: 'building', priority: 80,
            title: 'No usaste ni 2.º TC ni Taller de asedio en Feudal',
            metric: '1 TC · 0 asedio Feudal',
            detail: 'Con Cumanos conviene explotar el 2.º TC en Feudal o presión con Ariete temprano cuando la Feudal se alarga.',
          };
        }
        return null;
      },
    }),
    ruleUnitCore({
      id: 'civ-cumans-cav', unitIds: [1370, 1372, 1231, 1233, ...KNIGHT_LINE_IDS, ...SCOUT_LINE_IDS], classes: ['cavalry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Caballería veloz / Lanceros esteparios / Kipchaks',
      detailHit: 'Aprovechaste el bono de velocidad en caballería y movilidad de Cumanos.',
    }),
  ],

  danes: [
    ruleUnitCore({
      id: 'civ-danes-core', unitIds: [2711, 2712, ...SIEGE_UNIT_IDS], classes: ['infantry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Núcleo de infantería / asedio con mejoras de oro rebajadas (−66%)',
      detailHit: 'Aprovechaste las mejoras económicas en Cuartel y Asedio de Daneses.',
    }),
    ruleEcoBoom({
      id: 'civ-danes-eco', minFarms: 25, positiveOnly: true,
      titleHit: 'Economía agrícola sostenida',
      detailHit: 'Sostuviste el flujo de comida necesario para mantener producción continua.',
    }),
  ],

  dravidians: [
    ruleUnitCore({
      id: 'civ-dravidians-core', unitIds: [1735, 1737, 873, 875, ...FOOT_ARCHER_IDS, ...SKIRM_IDS], classes: ['ranged', 'infantry'], minUnits: 20, positiveOnly: true,
      titleHit: 'Presión de distancia/infantería aprovechando +200 madera por edad',
      detailHit: 'Convertiste la madera gratis al subir de edad y mejoras de Cuartel al 50% en masa militar.',
    }),
    ruleBuilding({
      id: 'civ-dravidians-water', buildingIds: [45], minCount: 2, waterOnly: true, positiveOnly: true,
      titleHit: 'Control naval con +200 madera por edad y Pesqueros potenciados',
      detailHit: 'Aprovechaste la ventaja de madera de Drávidas en mapa con agua.',
    }),
  ],

  ethiopians: [
    ruleUnitCore({
      id: 'civ-ethiopians-archers', unitIds: FOOT_ARCHER_IDS, classes: ['ranged'], minUnits: 20,
      requireAnyTech: [199, 200],
      titleHit: 'Arqueros a pie con +18% velocidad de disparo',
      titleMiss: 'No aprovechaste tus Arqueros de disparo rápido (+18%)',
      detailHit: 'Explotaste el mejor DPS temprano de arqueros a pie junto con Emplumado/Punzones.',
      detailMiss: 'Los Etíopes destacan por sus Arqueros/Ballesteros que disparan un 18% más rápido y sus +100 comida/oro por edad.',
    }),
    ruleUnitCore({
      id: 'civ-ethiopians-siege', unitIds: [...SIEGE_UNIT_IDS, 1016, 1018], minUnits: 6, positiveOnly: true,
      titleHit: 'Transición a Asedio / Guerreros Shotel en juego medio',
      detailHit: 'Complementaste tus arqueros con el fuerte asedio o presión móvil de Etíopes.',
    }),
  ],

  franks: [
    ruleEcoBoom({
      id: 'civ-franks-farms', minFarms: 25, minAgeForMiss: 'castle', positiveOnly: true,
      titleHit: 'Boom agrícola sobre mejoras de Molino gratuitas',
      metricHit: (ctx) => `${ctx.self.macroBuilds?.farms || 0} granjas`,
      detailHit: 'Convertiste Collera/Arado pesado gratis y bayas rápidas en una gran base de granjas.',
    }),
    ruleUnitCore({
      id: 'civ-franks-cav', unitIds: [...KNIGHT_LINE_IDS, ...SCOUT_LINE_IDS, 281, 531], classes: ['cavalry'], minUnits: 18,
      titleHit: 'Caballería franca (+20% PR) como columna vertebral',
      titleMiss: 'Poca caballería para tu +20% de vida gratis',
      detailHit: 'Explotaste la vida extra gratuita en Scouts, Jinetes y Paladines francos.',
      detailMiss: 'Los Francos tienen +20% PR gratis en caballería desde Feudal: presionar con Scouts/Jinetes es tu mayor arma.',
    }),
    ruleBuilding({
      id: 'civ-franks-castles', buildingIds: [82], minCount: 2, positiveOnly: true,
      titleHit: 'Control de mapa con Castillos rebajados (−15%/−25%)',
      detailHit: 'Aprovechaste los Castillos más baratos de Francos para asegurar colinas y oro.',
    }),
  ],

  georgians: [
    ruleCustom({
      check(ctx) {
        const carts = ctx.state.muleCartsCreated || 0;
        const churches = sumBuilds(ctx.state, [1806]);
        if (carts >= 2 || churches >= 1) {
          return {
            status: 'leveraged', id: 'civ-georgians-eco', category: 'building', priority: 86,
            title: 'Aprovechaste Carros de mulas e Iglesia fortificada (+10% trabajo)',
            metric: `${carts} mulas · ${churches} iglesias`,
            detail: 'Usaste la infraestructura económica exclusiva de Georgianos que acelera a los aldeanos cercanos.',
          };
        }
        if (reachedAgeForMiss(ctx.state, 'castle', ctx.durationMs)) {
          return {
            status: 'missed', id: 'civ-georgians-eco-missed', category: 'building', priority: 76,
            title: 'No construiste Iglesia fortificada en Castillos',
            metric: '0 iglesias fortificadas',
            detail: 'La Iglesia fortificada georgiana aumenta +10% la velocidad de trabajo de los aldeanos cercanos.',
          };
        }
        return null;
      },
    }),
    ruleUnitCore({
      id: 'civ-georgians-cav', unitIds: [1803, 1805, ...KNIGHT_LINE_IDS, ...SCOUT_LINE_IDS], classes: ['cavalry'], minUnits: 16,
      titleHit: 'Caballería con regeneración / Monaspa',
      titleMiss: 'Poca caballería para tu bono de regeneración',
      detailHit: 'Explotaste la regeneración de vida de la caballería georgiana y/o el poder en grupo de Monaspa.',
      detailMiss: 'La caballería georgiana regenera vida desde Feudal y escala muy fuerte con Monaspa en Castillos.',
    }),
  ],

  goths: [
    ruleUnitCore({
      id: 'civ-goths-spam', unitIds: [41, 555, 759, 761, ...MILITIA_LINE_IDS, ...SPEAR_IDS], classes: ['infantry'], minUnits: 26,
      titleHit: 'Inundación de infantería rebajada (−20% a −35%)',
      titleMiss: 'Poco volumen de infantería para el descuento godo',
      detailHit: 'Convertiste los Cuarteles +20% rápidos y la infantería económica en presión imparable.',
      detailMiss: 'La identidad competitiva de Godos es abrumar por volumen con infantería barata y Huscarles.',
    }),
    ruleCustom({
      check(ctx) {
        const barracks = [...ctx.state.workshops.values()].filter((w) => [12, 20, 498].includes(w.typeId)).length;
        if (barracks >= 4) {
          return {
            status: 'leveraged', id: 'civ-goths-barracks', category: 'building', priority: 82,
            title: `Producción en paralelo con ${barracks} Cuarteles (+20%)`,
            metric: `${barracks} Cuarteles`,
            detail: 'Acompañaste el descuento de infantería con suficiente infraestructura de Cuarteles.',
          };
        }
        return null;
      },
    }),
  ],

  gurjaras: [
    ruleUnitCore({
      id: 'civ-gurjaras-mobile', unitIds: [...CAMEL_IDS, 1751, 1753, 1741, 1743], classes: ['cavalry'], minUnits: 16,
      titleHit: 'Camellos con +20%/+30% daño extra / Jinetes Shrivamsha',
      titleMiss: 'Poca movilidad montada (Camellos/Shrivamsha) con Gurjaras',
      detailHit: 'Explotaste las unidades montadas rápidas y el daño adicional de contraataque de Gurjaras.',
      detailMiss: 'Gurjaras dominan con Camellos potenciados, Jinetes Shrivamsha y Lanzadores de chakram.',
    }),
    ruleTechSpike({
      id: 'civ-gurjaras-tech', techIds: [435, 81, 82], minCount: 2, onlyIfClass: 'cavalry', minClassUnits: 14, positiveOnly: true,
      titleHit: 'Caballería gurjara respaldada con Pureza de sangre y armadura',
      detailHit: 'Acompañaste tus unidades montadas con las mejoras defensivas clave.',
    }),
  ],

  hindustanis: [
    ruleEcoBoom({
      id: 'civ-hindustanis-vils', minVils: 70, minTcs: 3, minAgeForMiss: 'castle', positiveOnly: true,
      titleHit: 'Economía escalada con aldeanos más baratos (−8% a −23%)',
      metricHit: (ctx) => `${ctx.self.villagersOrdered} ald. · ${ctx.self.townCenters} TC`,
      detailHit: 'Convertiste el ahorro progresivo en aldeanos en una gran ventaja económica.',
    }),
    ruleUnitCore({
      id: 'civ-hindustanis-core', unitIds: [...CAMEL_IDS, 1747, 1749, 5], minUnits: 14, positiveOnly: true,
      titleHit: 'Camellos rápidos (+20% ataque) / Ghulam / Artilleros',
      detailHit: 'Explotaste las unidades emblema anti-arquero y anti-caballería de Indostaníes.',
    }),
    ruleBuilding({
      id: 'civ-hindustanis-caravanserai', buildingIds: [1754], minCount: 1, positiveOnly: true,
      titleHit: 'Caravasar construido para acelerar tu comercio en equipo',
      detailHit: 'Aprovechaste el edificio único de Indostaníes para curar y acelerar carretas.',
    }),
  ],

  huns: [
    ruleUnitCore({
      id: 'civ-huns-core', unitIds: [...KNIGHT_LINE_IDS, ...SCOUT_LINE_IDS, ...CA_UNIT_IDS, 755, 757, 886, 887], classes: ['cavalry', 'ranged'], minUnits: 18,
      titleHit: 'Presión de Establos (+20%) / Arqueros a caballo baratos',
      titleMiss: 'Poca presión montada para aprovechar los Establos hunos',
      detailHit: 'Explotaste la fluidez sin casas, Establos 20% más rápidos y/o Arqueros a caballo rebajados.',
      detailMiss: 'Los Hunos no construyen casas y producen caballería 20% más rápido: buscá iniciativa con Scouts, Jinetes o Arqueros a caballo.',
    }),
    ruleTechSpike({
      id: 'civ-huns-bloodlines', techIds: [435], minCount: 1, onlyIfClass: ['cavalry', 'ranged'], minClassUnits: 16, positiveOnly: true,
      titleHit: 'Pureza de sangre activa para tu núcleo montado',
      detailHit: 'Potenciaste la supervivencia de tus Jinetes / Arqueros a caballo hunos.',
    }),
  ],

  incas: [
    ruleUnitCore({
      id: 'civ-incas-inf', unitIds: [...EAGLE_IDS, 879, 881, 185], classes: ['infantry'], minUnits: 18, positiveOnly: true,
      titleHit: 'Infantería inca rebajada (−15% a −30% comida) / Honderos / Kamayuks',
      detailHit: 'Aprovechaste el descuento de comida en unidades militares y versatilidad de Incas.',
    }),
    ruleBuilding({
      id: 'civ-incas-stone', buildingIds: [82, 79, 234, 235, 236], minCount: 2, positiveOnly: true,
      titleHit: 'Fortificaciones aprovechando −15% coste de piedra',
      detailHit: 'Capitalizaste el ahorro de piedra en Castillos y Torres incas.',
    }),
  ],

  italians: [
    ruleFastTempo({
      id: 'civ-italians-age', targetCastleSec: 1080, targetImpSec: 2100,
      titleHit: 'Avance veloz aprovechando −15% coste al subir de edad',
      detailHit: 'Convertiste el descuento de edades de Italianos en un pico temprano de Castillos/Imperial.',
    }),
    ruleUnitCore({
      id: 'civ-italians-core', unitIds: [866, 868, 5, 36, 882, ...FOOT_ARCHER_IDS], classes: ['ranged', 'gunpowder'], minUnits: 16, positiveOnly: true,
      titleHit: 'Arqueros acorazados / Ballesteros genoveses / Pólvora rebajada',
      detailHit: 'Aprovechaste las armaduras extra en arqueros y el −20% en unidades de pólvora de Italianos.',
    }),
  ],

  japanese: [
    ruleUnitCore({
      id: 'civ-japanese-core', unitIds: [291, 560, ...CA_UNIT_IDS], classes: ['infantry', 'ranged'], minUnits: 18, positiveOnly: true,
      titleHit: 'Infantería +33% velocidad de ataque / Samuráis / Arqueros a caballo',
      detailHit: 'Explotaste el DPS superior de infantería o la precisión de Arqueros a caballo japoneses.',
    }),
    ruleUnitCore({
      id: 'civ-japanese-fish', unitIds: [13], minUnits: 6, waterOnly: true, positiveOnly: true,
      titleHit: 'Pesqueros japoneses (+trabajo y doble armadura) bien explotados',
      detailHit: 'Aprovechaste la ventaja económica naval de Japoneses en mapa de agua.',
    }),
  ],

  jurchens: [
    ruleEarlyTech({
      id: 'civ-jurchens-castle-se', category: 'tech_spike', priority: 88,
      techIds: [377], beforeAge: 'imperial', minCount: 1, minAgeForMiss: 'imperial',
      titleHit: 'Ingenieros de asedio adelantado en Castillos',
      detailHit: 'Aprovechaste el acceso temprano y descuento en tecnologías de asedio de Yurchen.',
    }),
    ruleUnitCore({
      id: 'civ-jurchens-core', unitIds: [1908, 1910, 1901, 1903, 1911], classes: ['cavalry', 'gunpowder'], minUnits: 14, positiveOnly: true,
      titleHit: 'Unidades montadas rápidas / Lancero de fuego / Granaderos',
      detailHit: 'Explotaste la velocidad de ataque montada y las unidades de pólvora únicas de Yurchen.',
    }),
  ],

  khitans: [
    ruleCustom({
      check(ctx) {
        const pastures = ctx.state.pasturesBuilt || 0;
        const pTechs = countTechs(ctx.state, [1014, 1013, 1012]);
        if (pastures >= 8 && pTechs >= 1) {
          return {
            status: 'leveraged', id: 'civ-khitans-pastures', category: 'eco', priority: 90,
            title: `Economía de Pasturas (${pastures}) con mejoras de pastoreo`,
            metric: `${pastures} pasturas · ${pTechs} mejoras`,
            detail: 'Aprovechaste la eficiencia de las Pasturas (2 aldeanos por pastura) junto con Domesticación/Pastoralismo.',
          };
        }
        if (pastures >= 10 && pTechs === 0 && reachedAgeForMiss(ctx.state, 'castle', ctx.durationMs)) {
          return {
            status: 'missed', id: 'civ-khitans-pastures-missed', category: 'eco', priority: 82,
            title: 'No investigaste Domesticación/Pastoralismo para tus Pasturas',
            metric: `${pastures} pasturas · 0 mejoras`,
            detail: 'Con Kitán las mejoras de Pastura reemplazan Collera/Arado pesado y multiplican tu producción de comida.',
          };
        }
        return null;
      },
    }),
    ruleTechSpike({
      id: 'civ-khitans-double-melee', techIds: [67, 68], minCount: 1, onlyIfClass: ['cavalry', 'infantry'], minClassUnits: 14, minAgeForMiss: 'castle',
      titleHit: 'Forja/Fundición con doble efecto (+2/+2 ataque) activa',
      titleMiss: 'No activaste el doble efecto de ataque cuerpo a cuerpo (Forja/Fundición)',
      detailHit: 'Con Kitán Forja y Fundición dan el doble de ataque (+2 cada una): un pico brutal para tu ejército cuerpo a cuerpo.',
      detailMiss: 'Tu mayor pico de poder con Kitán es investigar Forja/Fundición temprano porque duplican el ataque cuerpo a cuerpo.',
    }),
  ],

  khmer: [
    ruleFastTempo({
      id: 'civ-khmer-fast', targetFeudalSec: 590, targetCastleSec: 1020,
      titleHit: 'Transición veloz sin edificios prerrequisito',
      detailHit: 'Explotaste la flexibilidad única de Jemeres para subir de edad sin frenar tu economía.',
    }),
    ruleEcoBoom({
      id: 'civ-khmer-farms', minFarms: 26, minAgeForMiss: 'castle', positiveOnly: true,
      titleHit: 'Boom de granjas con entrega instantánea de comida',
      metricHit: (ctx) => `${ctx.self.macroBuilds?.farms || 0} granjas`,
      detailHit: 'Convertiste la recolección sin depósitos de granjeros jemeres en un flujo continuo de comida.',
    }),
    ruleUnitCore({
      id: 'civ-khmer-core', unitIds: [1120, 1122, 1132, 1134, 279, 542, ...KNIGHT_LINE_IDS], classes: ['cavalry', 'cavArmorOnly'], minUnits: 16, positiveOnly: true,
      titleHit: 'Caballería / Elefantes / Escorpiones de alcance extra',
      detailHit: 'Aprovechaste las unidades pesadas y Escorpiones con +1 alcance de Jemeres.',
    }),
  ],

  koreans: [
    ruleUnitCore({
      id: 'civ-koreans-ranged', unitIds: [827, 829, ...FOOT_ARCHER_IDS, ...SKIRM_IDS], classes: ['ranged'], minUnits: 18,
      requireAnyTech: [199],
      titleHit: 'Unidades a distancia (−50% madera) con Armadura de arquero gratis',
      titleMiss: 'Poca masa a distancia para aprovechar −50% madera y armadura gratis',
      detailHit: 'Combinaste la armadura de proyectil gratuita y el ahorro de madera con Emplumado/Punzones.',
      detailMiss: 'Los Coreanos tienen arqueros y guerrilleros a mitad de madera con armadura gratis al subir de edad.',
    }),
    ruleBuilding({
      id: 'civ-koreans-towers', buildingIds: [79, 234, 235, 236], minCount: 2, positiveOnly: true,
      titleHit: 'Control con Torres potenciadas (mejoras gratis)',
      detailHit: 'Aprovechaste el alcance y mejoras gratuitas de las Torres coreanas.',
    }),
  ],

  lithuanians: [
    ruleFastTempo({
      id: 'civ-lithuanians-tempo', targetFeudalSec: 595, targetCastleSec: 1050,
      titleHit: 'Ritmo inicial acelerado con +100 comida por Centro urbano',
      detailHit: 'Convertiste la comida extra inicial de Lituanos en una transición temprana limpia.',
    }),
    ruleUnitCore({
      id: 'civ-lithuanians-cav', unitIds: [1234, 1236, ...KNIGHT_LINE_IDS, ...SCOUT_LINE_IDS], classes: ['cavalry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Caballería pesada / Leitis como núcleo ofensivo',
      detailHit: 'Aprovechaste los Jinetes y Leitis lituanos (que ignoran armadura cuerpo a cuerpo).',
    }),
    ruleBuilding({
      id: 'civ-lithuanians-monastery', buildingIds: [104], minCount: 1, minAgeForMiss: 'castle',
      titleHit: 'Monasterio (+20% velocidad) listo para pelear Reliquias',
      titleMiss: 'No construiste Monasterio en Castillos para buscar Reliquias',
      detailHit: 'Activaste Monasterio en Castillos para potenciar el ataque de tus Jinetes y Leitis.',
      detailMiss: 'Cada Reliquia otorga +1 ataque (hasta +4) a Jinetes y Leitis: priorizá Monasterio y Monjes en Castillos.',
    }),
  ],

  magyars: [
    ruleUnitCore({
      id: 'civ-magyars-cav', unitIds: [...SCOUT_LINE_IDS, ...KNIGHT_LINE_IDS, 869, 871], classes: ['cavalry'], minUnits: 18,
      titleHit: 'Caballería magiar aprovechando Forja/Fundición gratis y Scouts −15%',
      titleMiss: 'Poca caballería para capitalizar Forja gratis y Scouts rebajados',
      detailHit: 'Convertiste el ataque cuerpo a cuerpo gratuito y los Scouts baratos en iniciativa ofensiva.',
      detailMiss: 'Los Magiares reciben Forja/Fundición/Alto horno gratis y Scouts −15%: buscá presión temprana de caballería.',
    }),
    ruleUnitCore({
      id: 'civ-magyars-ca', unitIds: CA_UNIT_IDS, minUnits: 14, positiveOnly: true,
      titleHit: 'Transición a Arqueros a caballo de late game',
      detailHit: 'Aprovechaste los Arqueros a caballo de máximo rango y daño de Magiares.',
    }),
  ],

  malay: [
    ruleFastTempo({
      id: 'civ-malay-age', targetCastleSec: 1050, targetImpSec: 2040,
      titleHit: 'Avance de edad +66% más rápido capitalizado',
      detailHit: 'Aprovechaste la subida relámpago de Malayos para llegar con más aldeanos y ventaja de tiempo.',
    }),
    ruleUnitCore({
      id: 'civ-malay-core', unitIds: [1123, 1125, 1132, 1134, ...FOOT_ARCHER_IDS], classes: ['infantry', 'ranged'], minUnits: 18, positiveOnly: true,
      titleHit: 'Infantería con armadura gratis / Elefantes rebajados / Ballesteros',
      detailHit: 'Explotaste las mejoras gratuitas de armadura de infantería o los Elefantes económicos malayos.',
    }),
  ],

  malians: [
    ruleEcoBoom({
      id: 'civ-malians-wood', minTcs: 3, minFarms: 25, positiveOnly: true,
      titleHit: 'Boom de edificios aprovechando −15% coste de madera',
      detailHit: 'Capitalizaste edificios más baratos en madera para escalar TCs y producción.',
    }),
    ruleUnitCore({
      id: 'civ-malians-core', unitIds: [1013, 1015, ...KNIGHT_LINE_IDS, ...MILITIA_LINE_IDS], classes: ['infantry', 'cavalry'], minUnits: 18, positiveOnly: true,
      titleHit: 'Infantería anti-proyectil (+armadura) / Caballería Farimba',
      detailHit: 'Aprovechaste la armadura antiproyectil de la infantería o el poder ofensivo de la caballería maliense.',
    }),
  ],

  mapuche: [
    ruleUnitCore({
      id: 'civ-mapuche-core', unitIds: [2566, 2568, 2569, 2571, ...CHAMPI_IDS, ...SPEAR_IDS, ...SKIRM_IDS], minUnits: 18, positiveOnly: true,
      titleHit: 'Ejército mapuche (Kona / Jinete con boleadoras / Champi)',
      detailHit: 'Aprovechaste la movilidad y las unidades regionales únicas de Mapuche.',
    }),
    ruleTechSpike({
      id: 'civ-mapuche-tech', techIds: [67, 68, 75, 199, 200], minCount: 2, minAgeForMiss: 'castle', positiveOnly: true,
      titleHit: 'Mejoras de ataque de Herrería al día para tu ejército',
      detailHit: 'Acompañaste tus Kona/Boleadoras/Champis con las mejoras de ataque disponibles en tu árbol.',
    }),
  ],

  mayans: [
    ruleUnitCore({
      id: 'civ-mayans-archers', unitIds: [...FOOT_ARCHER_IDS, 763, 765], classes: ['ranged'], minUnits: 20,
      requireAnyTech: [199, 200],
      titleHit: 'Arqueros mayas rebajados (−10%/−20%/−30%) con mejoras',
      titleMiss: 'Poca masa de arqueros para tu gran descuento maya',
      detailHit: 'Explotaste el coste reducido en Ballesteros/Arqueros de plumas junto con Emplumado y Punzones.',
      detailMiss: 'Los Mayas tienen uno de los mejores descuentos del juego en arqueros: masificarlos es clave.',
    }),
    ruleUnitCore({
      id: 'civ-mayans-eagles', unitIds: EAGLE_IDS, minUnits: 12, positiveOnly: true,
      titleHit: 'Presión de Guerreros águila mayas',
      detailHit: 'Complementaste tu composición con incursiones de Águilas de gran aguante.',
    }),
  ],

  mongols: [
    ruleFastTempo({
      id: 'civ-mongols-hunt', targetFeudalSec: 590, targetCastleSec: 1040,
      titleHit: 'Apertura veloz impulsada por cazadores (+40%)',
      detailHit: 'Convertiste la ventaja de caza mongola en una transición temprana agresiva.',
    }),
    ruleUnitCore({
      id: 'civ-mongols-core', unitIds: [11, 561, ...CA_UNIT_IDS, 1370, 1372], minUnits: 14, positiveOnly: true,
      titleHit: 'Arqueros a caballo rápidos (+25% disparo) / Mangudai / Lanceros esteparios',
      detailHit: 'Explotaste la movilidad y DPS superior de las unidades montadas mongolas.',
    }),
  ],

  muisca: [
    ruleFastTempo({
      id: 'civ-muisca-age', targetCastleSec: 1080, targetImpSec: 2100,
      titleHit: 'Avance veloz aprovechando −50% coste de oro en edades',
      detailHit: 'Capitalizaste el ahorro de oro al subir de edad de Muisca.',
    }),
    ruleUnitCore({
      id: 'civ-muisca-core', unitIds: [2562, 2564, ...CHAMPI_IDS, ...FOOT_ARCHER_IDS, 125], classes: ['ranged', 'infantry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Núcleo de distancia / Guerreros guecha / Monjes muiscas',
      detailHit: 'Explotaste el aguante de proyectil y versatilidad militar de Muisca.',
    }),
    ruleTeamTrade({
      id: 'civ-muisca-trade', titleHit: 'Comercio en equipo con Caravana/Gremios gratuitos',
      detailHit: 'Aprovechaste las mejoras comerciales gratis de Muisca en partida de equipo.',
    }),
  ],

  persians: [
    ruleEcoBoom({
      id: 'civ-persians-tc', minTcs: 3, minAgeForMiss: 'castle', priority: 86,
      titleHit: 'Boom económico aprovechando TC +5% a +20% más rápidos',
      titleMiss: 'No escalaste Centros urbanos para explotar tu TC acelerado',
      metricHit: (ctx) => `${ctx.self.townCenters} TC · ${ctx.self.villagersOrdered} ald.`,
      detailHit: 'Multiplicaste el trabajo acelerado de los Centros urbanos persas con expansión multi-TC.',
      detailMiss: 'Los Centros urbanos persas producen aldeanos y suben más rápido: pasar a 3 TC dispara tu ventaja.',
    }),
    ruleUnitCore({
      id: 'civ-persians-cav', unitIds: [...KNIGHT_LINE_IDS, ...SCOUT_LINE_IDS, ...CA_UNIT_IDS, 239, 558], classes: ['cavalry'], minUnits: 18, positiveOnly: true,
      titleHit: 'Caballería pesada / Savar persa como fuerza principal',
      detailHit: 'Explotaste el poder de caballería pesada y la flexibilidad de Persas.',
    }),
  ],

  poles: [
    ruleBuilding({
      id: 'civ-poles-folwark', buildingIds: [1734], minCount: 2, minAgeForMiss: 'castle', priority: 90,
      titleHit: (n) => `Economía agrícola sobre ${n} Folwarks`,
      titleMiss: 'No escalaste Folwarks para maximizar tu boom de comida',
      metricHit: (n, ctx) => `${n} Folwarks · ${ctx.self.macroBuilds?.farms || 0} granjas`,
      detailHit: 'Aprovechaste el ingreso instantáneo de comida al sembrar granjas alrededor de tus Folwarks.',
      detailMiss: 'El Folwark polaco entrega comida inmediata al sembrar granjas: sumar 2+ Folwarks acelera todo tu juego medio.',
    }),
    ruleUnitCore({
      id: 'civ-poles-core', unitIds: [1701, 1703, 1707, ...KNIGHT_LINE_IDS, ...SCOUT_LINE_IDS], classes: ['cavalry', 'infantry'], minUnits: 18, positiveOnly: true,
      titleHit: 'Presión de Jinetes / Obuch / Húsares alados',
      detailHit: 'Explotaste la economía de comida/piedra polaca en unidades de alto impacto.',
    }),
  ],

  portuguese: [
    ruleCustom({
      check(ctx) {
        const tp = ctx.self.techProfile || {};
        const totalTechs = (tp.ecoCount || 0) + (tp.blacksmithCount || 0) + (tp.combatKeyCount || 0);
        if (totalTechs >= 10) {
          return {
            status: 'leveraged', id: 'civ-portuguese-research', category: 'tech_spike', priority: 86,
            title: `Investigación +25% más rápida aprovechada (${totalTechs} mejoras)`,
            metric: `${totalTechs} mejoras clave`,
            detail: 'Capitalizaste el bono de velocidad tecnológica junto al −20% de oro en unidades de Portugueses.',
          };
        }
        return null;
      },
    }),
    ruleUnitCore({
      id: 'civ-portuguese-gold', unitIds: [1001, 1003, 5, 36, ...FOOT_ARCHER_IDS, ...KNIGHT_LINE_IDS], minUnits: 18, positiveOnly: true,
      titleHit: 'Ejército de oro rebajado (−20% oro en todas las unidades)',
      detailHit: 'Aprovechaste el ahorro de oro portugués en Ballesteros, Jinetes, Cañones de salvas o pólvora.',
    }),
    ruleBuilding({
      id: 'civ-portuguese-feitoria', buildingIds: [1021], minCount: 1, positiveOnly: true,
      titleHit: 'Factoría activa para sostener recursos infinitos en late game',
      detailHit: 'Construiste Factoría en Imperial para asegurar oro y piedra sin agotamiento.',
    }),
  ],

  romans: [
    ruleTechSpike({
      id: 'civ-romans-double-armor', techIds: [74, 76], minCount: 1, onlyIfClass: 'infantry', minClassUnits: 14, minAgeForMiss: 'castle', priority: 90,
      titleHit: 'Armadura de infantería con doble efecto activa',
      titleMiss: 'No activaste la armadura de infantería duplicada de Romanos',
      detailHit: 'Con Romanos las mejoras de armadura de infantería duplican su bono: tus tropas aguantan muchísimo más.',
      detailMiss: 'Tu mayor ventaja con infantería romana es el doble efecto de Armadura de láminas y Cota de malla.',
    }),
    ruleUnitCore({
      id: 'civ-romans-core', unitIds: [1793, 1790, 1792, 279, 542], classes: ['infantry'], minUnits: 14, positiveOnly: true,
      titleHit: 'Legiones / Escorpiones baratos (−60% oro) / Centuriones',
      detailHit: 'Aprovechaste las unidades emblemáticas y Escorpiones potenciados de Romanos.',
    }),
  ],

  saracens: [
    ruleCustom({
      check(ctx) {
        const mOps = ctx.state.marketCount || 0;
        const mEarly = ctx.state.marketEarlyOps || 0;
        if (mOps >= 4 || mEarly >= 2) {
          return {
            status: 'leveraged', id: 'civ-saracens-market', category: 'market', priority: 92,
            title: 'Aprovechaste el Mercado sarraceno (solo 5% de comisión)',
            metric: `${mOps} operaciones`,
            detail: 'Usaste la tasa privilegiada del Mercado sarraceno para equilibrar economía y acelerar picos sin pérdida real.',
          };
        }
        return null;
      },
    }),
    ruleUnitCore({
      id: 'civ-saracens-core', unitIds: [...CAMEL_IDS, 282, 556, ...FOOT_ARCHER_IDS, ...CA_UNIT_IDS], classes: ['ranged', 'cavalry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Camellos (+25% PR) / Mamelucos / Arqueros rompe-edificios',
      detailHit: 'Explotaste la ventaja en Camellos o el daño adicional contra edificios de los Arqueros sarracenos.',
    }),
  ],

  saxons: [
    ruleUnitCore({
      id: 'civ-saxons-core', unitIds: [2705, 2706, ...MILITIA_LINE_IDS], classes: ['infantry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Infantería sajona / Huscarles aprovechando descuento por fortificación',
      detailHit: 'Explotaste la sinergia de infantería y fortificaciones de Sajones.',
    }),
    ruleBuilding({
      id: 'civ-saxons-forts', buildingIds: [82, 79, 234, 235, 236], minCount: 2, positiveOnly: true,
      titleHit: 'Control defensivo con Castillos y Torres',
      detailHit: 'Acompañaste tu economía con estructuras defensivas que potencian tu ejército.',
    }),
  ],

  shu: [
    ruleTechSpike({
      id: 'civ-shu-archer-techs', techIds: [199, 200, 201, 211, 212, 219, 437, 93], minCount: 4,
      onlyIfClass: 'ranged', minClassUnits: 16, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Tecnologías de arquero rebajadas (−25%) muy bien aprovechadas',
      titleMiss: 'Pocas mejoras en tu línea de arqueros (−25% coste)',
      detailHit: 'Explotaste el descuento de Shu en mejoras de arquería para pelear siempre con ventaja de alcance y precisión.',
      detailMiss: 'Con Shu las mejoras de arquero cuestan 25% menos: priorizá Emplumado, Punzones, Dactilera y Balística.',
    }),
    ruleUnitCore({
      id: 'civ-shu-core', unitIds: [1959, 1961, 1962, 1980, ...FOOT_ARCHER_IDS, ...SIEGE_UNIT_IDS], classes: ['ranged'], minUnits: 16, positiveOnly: true,
      titleHit: 'Arqueros / Guardia Pluma Blanca / Carros de guerra Shu',
      detailHit: 'Aprovechaste las unidades de proyectil y asedio rápido de Shu.',
    }),
  ],

  sicilians: [
    ruleEcoBoom({
      id: 'civ-sicilians-farms', minFarms: 25, positiveOnly: true,
      titleHit: 'Granjas de larga duración (+125% comida por mejora)',
      metricHit: (ctx) => `${ctx.self.macroBuilds?.farms || 0} granjas`,
      detailHit: 'Explotaste la durabilidad extra de granjas sicilianas para ahorrar miles de madera.',
    }),
    ruleCustom({
      check(ctx) {
        const donjons = sumBuilds(ctx.state, [1665]);
        const serjeants = sumUnits(ctx.state, [1658, 1659, 1660, 1661]);
        const cav = ctx.self.armyClasses?.cavalry || 0;
        if (donjons >= 1 || serjeants >= 10 || cav >= 18) {
          return {
            status: 'leveraged', id: 'civ-sicilians-army', category: 'signature_unit', priority: 84,
            title: donjons >= 1 ? `Presión con ${donjons} Torreón${donjons === 1 ? '' : 'es'} y Sargentos` : 'Ejército terrestre con −33% daño de contraataque',
            metric: donjons >= 1 ? `${donjons} Torreones · ${serjeants} Sargentos` : `${Math.max(serjeants, cav)} unidades`,
            detail: 'Aprovechaste la resistencia a unidades counter (−33%) o la presión de Torreones sicilianos.',
          };
        }
        return null;
      },
    }),
  ],

  slavs: [
    ruleEcoBoom({
      id: 'civ-slavs-farms', minFarms: 28, minTcs: 3, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Boom agrícola eslavo (+15% velocidad de granjeros)',
      titleMiss: 'No escalaste granjas para explotar tus granjeros +15%',
      metricHit: (ctx) => `${ctx.self.macroBuilds?.farms || 0} granjas · ${ctx.self.townCenters} TC`,
      detailHit: 'Convertiste la mejor tasa de granjeros del juego en una economía dominante de Castillos.',
      detailMiss: 'Los granjeros eslavos trabajan un 15% más rápido: sumar granjas y 3 TC es tu motor principal.',
    }),
    ruleUnitCore({
      id: 'civ-slavs-core', unitIds: [876, 878, ...SIEGE_UNIT_IDS], classes: ['infantry'], minUnits: 16, positiveOnly: true,
      titleHit: 'Infantería (Gambesones/Incendiarismo gratis) / Boyardos / Asedio −15%',
      detailHit: 'Explotaste el asedio rebajado o las mejoras gratuitas de infantería de Eslavos.',
    }),
  ],

  spanish: [
    ruleTechSpike({
      id: 'civ-spanish-bs', techIds: [67, 68, 75, 74, 76, 77, 81, 82, 80, 199, 200, 201, 211, 212, 219],
      minCount: 5, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Herrería sin coste de oro (+20 oro por tecnología) explotada',
      titleMiss: 'Pocas mejoras de Herrería pese a no costar oro',
      detailHit: 'Investigaste numerosas mejoras sin gastar oro y sumaste oro extra por cada tecnología completada.',
      detailMiss: 'Con Españoles la Herrería no cuesta oro y cada tecnología te regala +20 oro: investigá sin miedo.',
    }),
    ruleUnitCore({
      id: 'civ-spanish-core', unitIds: [771, 773, 5, 36, ...KNIGHT_LINE_IDS], minUnits: 12, positiveOnly: true,
      titleHit: 'Conquistadores / Pólvora (+18% disparo) / Caballería pesada',
      detailHit: 'Aprovechaste el gran pico de poder de Conquistadores y pólvora española.',
    }),
    ruleTeamTrade({
      id: 'civ-spanish-trade', titleHit: 'Bono de equipo de comercio (+25% oro) explotado',
      detailHit: 'Tus carretas generaron 25% más oro para dominar el juego tardío en equipo.',
    }),
  ],

  tatars: [
    ruleUnitCore({
      id: 'civ-tatars-ca', unitIds: [...CA_UNIT_IDS, 1228, 1230, 1370, 1372], classes: ['ranged', 'cavalry'], minUnits: 14,
      titleHit: 'Arqueros a caballo / Keshiks con Dactilera y Partos gratuitos',
      titleMiss: 'Poco aprovechamiento de Dactilera/Partos gratis en unidades montadas',
      detailHit: 'Convertiste el ahorro enorme de Dactilera y Tácticas de los partos gratis en presión móvil.',
      detailMiss: 'Los Tártaros reciben Dactilera y Tácticas de los partos gratis: Arqueros a caballo y Keshiks son tu pico clave.',
    }),
    ruleEcoBoom({
      id: 'civ-tatars-tcs', minTcs: 3, positiveOnly: true,
      titleHit: 'Expansión multi-TC aprovechando ovejas gratis por TC',
      detailHit: 'Cada Centro urbano en Castillos entregó ovejas extra (+50% comida de pastoreo).',
    }),
  ],

  teutons: [
    ruleEcoBoom({
      id: 'civ-teutons-farms', minFarms: 30, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Granjas a −40% de madera explotadas a fondo',
      titleMiss: 'Pocas granjas para aprovechar tu −40% de coste en madera',
      metricHit: (ctx) => `${ctx.self.macroBuilds?.farms || 0} granjas`,
      detailHit: 'Ahorraste gran cantidad de madera sembrando granjas teutonas económicas.',
      detailMiss: 'Las granjas teutonas cuestan 40% menos madera: sembrá temprano y masivamente para disparar tu economía.',
    }),
    ruleUnitCore({
      id: 'civ-teutons-armor', unitIds: [25, 554, ...KNIGHT_LINE_IDS, ...MILITIA_LINE_IDS], classes: ['cavalry', 'infantry'], minUnits: 18, positiveOnly: true,
      titleHit: 'Caballería e infantería con +1/+2 armadura cuerpo a cuerpo',
      detailHit: 'Aprovechaste la superioridad teutona en combates cuerpo a cuerpo.',
    }),
  ],

  tupi: [
    ruleUnitCore({
      id: 'civ-tupi-core', unitIds: [2579, 2581, 2582, 2584, ...FOOT_ARCHER_IDS, ...SKIRM_IDS], classes: ['ranged', 'infantry'], minUnits: 20, positiveOnly: true,
      titleHit: 'Volumen de arqueros/infantería con mejoras al −50% comida',
      detailHit: 'Aprovechaste el descuento de mejoras de Galería/Cuartel y el retorno de recursos tupí.',
    }),
    ruleTechSpike({
      id: 'civ-tupi-tech', techIds: [199, 200, 201], minCount: 2, onlyIfClass: 'ranged', minClassUnits: 14, positiveOnly: true,
      titleHit: 'Línea de ataque a distancia al día',
      detailHit: 'Acompañaste tu masa de arqueros tupí con Emplumado y Punzones.',
    }),
  ],

  turks: [
    ruleUnitCore({
      id: 'civ-turks-gp', unitIds: [46, 557, 5, 36, ...SCOUT_LINE_IDS, ...CA_UNIT_IDS], minUnits: 14,
      titleHit: 'Pólvora (Química gratis) / Jenízaros / Caballería ligera gratis',
      titleMiss: 'No explotaste tus unidades de pólvora ni mejoras gratis de Explorador',
      detailHit: 'Aprovechaste Química, Caballería ligera y Húsar gratuitos junto a la pólvora +25% PR turca.',
      detailMiss: 'Los Turcos reciben Caballería ligera, Húsar y Química gratis: buscá picos con Jenízaros, Artilleros, Cañones o Húsares.',
    }),
    ruleFastTempo({
      id: 'civ-turks-tempo', targetCastleSec: 1080, targetImpSec: 2040,
      titleHit: 'Ritmo acelerado por minería de oro +20%',
      detailHit: 'Convertiste la recolección rápida de oro en una transición temprana a Castillos/Imperial.',
    }),
  ],

  varangians: [
    ruleTechSpike({
      id: 'civ-varangians-bloodlines', techIds: [435], minCount: 1, onlyIfClass: 'cavalry', minClassUnits: 14, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Pureza de sangre potenciada (+50%) activa en tu caballería',
      titleMiss: 'No investigaste tu Pureza de sangre potenciada (+50%)',
      detailHit: 'Aprovechaste la vida extra adicional que obtienen los Varegos con Pureza de sangre.',
      detailMiss: 'Pureza de sangre otorga +50% más efecto a Varegos: es obligatoria si jugás caballería o Jarls.',
    }),
    ruleUnitCore({
      id: 'civ-varangians-core', unitIds: [2703, 2704, 2708, 2709], classes: ['infantry', 'cavalry'], minUnits: 14, positiveOnly: true,
      titleHit: 'Guardia varega / Jarls bien desplegados',
      detailHit: 'Explotaste las unidades únicas de alto impacto de Varegos.',
    }),
  ],

  vietnamese: [
    ruleEcoBoom({
      id: 'civ-vietnamese-eco', minEcoTechs: 5, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Mejoras eco sin madera y al doble de velocidad aprovechadas',
      titleMiss: 'Pocas mejoras económicas pese a no costar madera',
      metricHit: (ctx) => `${ctx.self.techProfile?.ecoCount || 0} mejoras eco`,
      detailHit: 'Explotaste las mejoras económicas 0 madera y 2× más rápidas de Vietnamitas (incluyendo Carretilla).',
      detailMiss: 'Tus mejoras económicas no cuestan madera y se investigan al doble de velocidad: activalas cuanto antes.',
    }),
    ruleUnitCore({
      id: 'civ-vietnamese-archers', unitIds: [1129, 1131, 1155, ...FOOT_ARCHER_IDS, ...SKIRM_IDS], classes: ['ranged'], minUnits: 18, positiveOnly: true,
      titleHit: 'Arqueros de galería con +20% de vida / Arqueros de ratán',
      detailHit: 'Aprovechaste la durabilidad extra de la arquería vietnamita y Leva gratis en Imperial.',
    }),
  ],

  vikings: [
    ruleEcoBoom({
      id: 'civ-vikings-eco', minTcs: 3, minFarms: 26, minAgeForMiss: 'castle', priority: 88,
      titleHit: 'Ventaja de Carretilla y Carro de mano gratis convertida en boom',
      titleMiss: 'No capitalizaste Carretilla y Carro de mano gratis en expansión',
      metricHit: (ctx) => `${ctx.self.townCenters} TC · ${ctx.self.macroBuilds?.farms || 0} granjas`,
      detailHit: 'Sin frenar tu TC en Carretilla/Carro de mano escalaste rápido a 3+ TC y economía dominante.',
      detailMiss: 'Al recibir Carretilla y Carro de mano gratis sin ocupar el TC, tu mayor ventaja es superar al rival en economía.',
    }),
    ruleUnitCore({
      id: 'civ-vikings-army', unitIds: [692, 694, ...FOOT_ARCHER_IDS], classes: ['infantry', 'ranged'], minUnits: 18, positiveOnly: true,
      titleHit: 'Infantería (+20% PR) / Berserkers / Ballesteros vikingos',
      detailHit: 'Aprovechaste tu ventaja económica en masa de infantería o arqueros.',
    }),
    ruleBuilding({
      id: 'civ-vikings-water', buildingIds: [45], minCount: 2, waterOnly: true, positiveOnly: true,
      titleHit: 'Control naval con barcos rebajados',
      detailHit: 'Explotaste el descuento de buques de guerra vikingos en mapa con agua.',
    }),
  ],

  wei: [
    ruleEcoBoom({
      id: 'civ-wei-ecovils', minEcoTechs: 5, minAgeForMiss: 'castle', priority: 90,
      titleHit: 'Imprimiste aldeanos gratis con cada mejora económica',
      titleMiss: 'Pocas mejoras eco para generar tus aldeanos gratis de Wei',
      metricHit: (ctx) => `${ctx.self.techProfile?.ecoCount || 0} mejoras eco (+${ctx.self.bonusVillagers || 0} ald.)`,
      detailHit: 'Cada mejora económica de Wei regala +1 aldeano instantáneo: aprovecharlas dispara tu economía.',
      detailMiss: 'Con Wei cada mejora económica crea 1 aldeano gratis: priorizá Hacha, Collera, Minería y Sierra temprano.',
    }),
    ruleUnitCore({
      id: 'civ-wei-core', unitIds: [1944, 1946, 1949, 1951, 1952], classes: ['cavalry', 'ranged'], minUnits: 16, positiveOnly: true,
      titleHit: 'Caballería Hei Guang (+PR) / Saqueador xianbei / Caballería tigre',
      detailHit: 'Aprovechaste el aguante extra de las unidades montadas únicas de Wei.',
    }),
  ],

  wu: [
    ruleCustom({
      check(ctx) {
        const milBuildings = ctx.self.workshopsCount || 0;
        if (milBuildings >= 4) {
          return {
            status: 'leveraged', id: 'civ-wu-foodbuildings', category: 'building', priority: 86,
            title: `Infraestructura militar (${milBuildings} edificios) aprovechando +55 comida/edificio`,
            metric: `${milBuildings} edif. (+${milBuildings * 55} comida)`,
            detail: 'Cada edificio militar o Muelle de Wu entrega +55 comida para acelerar producción y edades.',
          };
        }
        return null;
      },
    }),
    ruleUnitCore({
      id: 'civ-wu-core', unitIds: [1974, 1968, 1970, 1944, 1946], classes: ['infantry', 'ranged'], minUnits: 16, positiveOnly: true,
      titleHit: 'Infantería con regeneración / Espadachín Jian / Arquero de fuego',
      detailHit: 'Aprovechaste las unidades con regeneración y proyectil incendiario de Wu.',
    }),
  ],
});

/**
 * Evalúa el aprovechamiento real de las ventajas competitivas de la civilización.
 */
function evaluateCivMastery({ state, self, rivalState = null, durationMs = 0, isTeamGame = false } = {}) {
  if (!state || !self) return null;
  const slug = state.civSlug || normalizeCivSlug(state.civ);
  if (!slug) return null;
  const rules = CIV_MASTERY_PROFILES[slug];
  if (!rules || !rules.length) return null;
  // Partidas muy breves (< 10 min) no dan tiempo real a desplegar los bonos de civ
  if (Number(durationMs) < 10 * 60_000) return null;

  const civName = localizedCivName(slug, state.civ);
  const ctx = {
    slug,
    civName,
    state,
    self,
    rivalState,
    durationMs: Number(durationMs) || 0,
    isTeamGame: Boolean(isTeamGame),
    hasWater: detectWaterActivity(state, rivalState),
  };

  const leveraged = [];
  const missed = [];
  for (const rule of rules) {
    const out = rule(ctx);
    if (!out) continue;
    if (out.status === 'leveraged') {
      leveraged.push({
        id: out.id,
        category: out.category || 'eco',
        title: out.title,
        metric: out.metric || '',
        detail: out.detail || '',
        priority: out.priority || 80,
      });
    } else if (out.status === 'missed') {
      missed.push({
        id: out.id,
        category: out.category || 'eco',
        title: out.title,
        metric: out.metric || '',
        detail: out.detail || '',
        priority: out.priority || 75,
      });
    }
  }

  if (!leveraged.length && !missed.length) return null;

  leveraged.sort((a, b) => b.priority - a.priority);
  missed.sort((a, b) => b.priority - a.priority);
  const topLev = leveraged.slice(0, 3);
  const topMiss = missed.slice(0, 2);

  let rating = 'mid';
  if (topLev.length >= 2 && topMiss.length === 0) rating = 'high';
  else if (topLev.length >= 1 && topMiss.length === 0) rating = 'high';
  else if (topLev.length === 0 && topMiss.length >= 1) rating = 'low';

  const total = topLev.length + topMiss.length;
  const summary = topLev.length === total
    ? `Aprovechaste ${topLev.length === 1 ? 'la ventaja clave' : `${topLev.length} ventajas clave`} de ${civName}.`
    : topLev.length === 0
      ? `Quedaron sin explotar ${topMiss.length === 1 ? 'una ventaja clave' : `${topMiss.length} ventajas clave`} de ${civName}.`
      : `Aprovechaste ${topLev.length} de ${total} ventajas clave de ${civName}.`;

  return {
    civSlug: slug,
    civName,
    rating,
    leveraged: topLev,
    missed: topMiss,
    summary,
  };
}

module.exports = {
  normalizeCivSlug,
  localizedCivName,
  TECH_ID_TO_NODE,
  civTechAge,
  civHasTech,
  civHasTechByAge,
  CIV_MASTERY_PROFILES,
  evaluateCivMastery,
};
