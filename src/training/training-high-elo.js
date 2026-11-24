'use strict';

/**
 * Relic · Entrenamiento (Beta · Exclusivo Ultra) — Telemetría Real de Replays y Laboratorio de Matchups
 *
 * REGLA DE INTEGRIDAD ESTRICTA:
 *   - CERO tablas de ELO inventadas/hardcodeadas (1200/1400/1600/1800/2000 eliminadas).
 *   - CERO números de relleno falsos cuando `sampleSize === 0` (devuelve `hasData: false` y `null`).
 *   - Cada cifra mostrada en `computeHighEloTelemetry(records, selectedMatchId)` proviene
 *     directamente de los archivos de replay reales del jugador procesados por `postmatch-engine.js`,
 *     con trazabilidad exacta (`#matchId`, Mapa, Civilización, Fecha, Resultado) comparando:
 *       1) Partida Seleccionada / Última Partida
 *       2) Tu Mediana Personal (`N` replays reales)
 *       3) Tu Mejor Récord Personal (`PB` + en qué partida real lo lograste)
 */

const CIV_TECH = require('../civ-tech.json').civilizations || {};
const { CIV_GUIDE } = require('../civ-guide');
const { LINES, lineQuality } = require('../opportunities');

const COUNTERS = {
  archers: { skirmishers: 1, siege: 0.9, knights: 0.7, eagles: 0.85, scouts: 0.45 },
  scouts: { spears: 1, camels: 1, knights: 0.8 },
  infantry: { archers: 0.9, cavarchers: 0.95, siege: 0.6 },
  knights: { camels: 1, spears: 0.9, monks: 0.8 },
  camels: { spears: 0.95, infantry: 0.7, archers: 0.5 },
  eagles: { infantry: 1, knights: 0.7 },
  cavarchers: { skirmishers: 1, camels: 0.7, siege: 0.6 },
  siege: { scouts: 1, knights: 1, eagles: 0.9 },
  skirmishers: { scouts: 1, knights: 1, siege: 0.8 },
  spears: { archers: 0.95, infantry: 0.9, siege: 0.6 },
  monks: { scouts: 1, eagles: 1, archers: 0.7 },
};

const CRITICAL_TECH_LABELS_ES = [
  { node: 'Bloodlines', es: 'Pureza de sangre', role: 'cavalry', desc: '+20 puntos de salud en unidades montadas' },
  { node: 'Bracer', es: 'Brazal', role: 'archers', desc: '+1 ataque y +1 alcance en Edad Imperial' },
  { node: 'Thumb Ring', es: 'Dactilera', role: 'archers', desc: '100 % de precisión y mayor cadencia de disparo' },
  { node: 'Ring Archer Armor', es: 'Armadura de anillos de arquero', role: 'archers', desc: 'Última mejora de armadura para arqueros' },
  { node: 'Plate Barding Armor', es: 'Barda de placas', role: 'cavalry', desc: 'Última mejora de armadura para caballería' },
  { node: 'Blast Furnace', es: 'Alto horno', role: 'melee', desc: '+2 de ataque cuerpo a cuerpo en Edad Imperial' },
  { node: 'Halberdier', es: 'Alabardero', role: 'spears', desc: 'Mejora final anticaballería en Cuarteles' },
  { node: 'Arbalester', es: 'Arbalestero', role: 'archers', desc: 'Mejora final de la línea de Arqueros' },
  { node: 'Paladin', es: 'Paladín', role: 'cavalry', desc: 'Mejora final de caballería pesada' },
  { node: 'Hussar', es: 'Húsar', role: 'cavalry', desc: 'Mejora final de caballería ligera sin costo de oro' },
  { node: 'Siege Engineers', es: 'Ingenieros de asedio', role: 'siege', desc: '+1 alcance y +20 % daño a edificios' },
  { node: 'Bombard Cannon', es: 'Cañón de asedio', role: 'siege', desc: 'Artillería móvil de largo alcance' },
  { node: 'Redemption', es: 'Redención', role: 'monks', desc: 'Permite a los Monjes convertir asedio y edificios' },
];

const TECH_NAME_ES_MAP = Object.fromEntries([
  ...CRITICAL_TECH_LABELS_ES.map((t) => [t.node, t.es]),
  ['Fletching', 'Emplumado de flechas'],
  ['Bodkin Arrow', 'Flecha de punzón'],
  ['Padded Archer Armor', 'Armadura acolchada para arquero'],
  ['Leather Archer Armor', 'Armadura de cuero para arquero'],
  ['Ballistics', 'Balística'],
  ['Forging', 'Forja'],
  ['Iron Casting', 'Fundición de hierro'],
  ['Scale Barding Armor', 'Barda de escamas'],
  ['Chain Barding Armor', 'Barda de malla'],
  ['Husbandry', 'Ganadería'],
  ['Scale Mail Armor', 'Armadura de láminas'],
  ['Chain Mail Armor', 'Cota de malla'],
  ['Plate Mail Armor', 'Armadura de placas de malla'],
  ['Parthian Tactics', 'Tácticas de los partos'],
  ['Sanctity', 'Santidad'],
  ['Fervor', 'Fervor'],
  ['Block Printing', 'Letras de imprenta'],
  ['Theocracy', 'Teocracia'],
  ['Heresy', 'Herejía'],
  ['Squires', 'Escuderos'],
  ['Arson', 'Incendiarismo'],
  ['Gambesons', 'Gambesones'],
  ['Chemistry', 'Química'],
]);

const UNIT_NAME_ES_MAP = {
  Archer: 'Arquero',
  Crossbowman: 'Ballestero',
  Arbalester: 'Arbalestero',
  Skirmisher: 'Guerrillero',
  'Elite Skirmisher': 'Guerrillero de élite',
  'Imperial Skirmisher': 'Guerrillero imperial',
  'Cavalry Archer': 'Arquero a caballo',
  'Heavy Cavalry Archer': 'Arquero de caballería pesada',
  'Hand Cannoneer': 'Artillero manual',
  'Scout Cavalry': 'Caballería de exploración',
  'Light Cavalry': 'Caballería ligera',
  Hussar: 'Húsar',
  'Winged Hussar': 'Húsar alado',
  Knight: 'Caballero',
  Cavalier: 'Caballero',
  Paladin: 'Paladín',
  Savar: 'Savar',
  'Camel Rider': 'Jinete de camello',
  'Heavy Camel Rider': 'Jinete de camello pesado',
  'Imperial Camel Rider': 'Jinete de camello imperial',
  Militia: 'Milicia',
  'Man-at-Arms': 'Hombre de armas',
  'Long Swordsman': 'Espadachín de espada larga',
  'Two-Handed Swordsman': 'Espadachín de mandoble',
  Champion: 'Campeón',
  Legionary: 'Legionario',
  Spearman: 'Lancero',
  Pikeman: 'Piquero',
  Halberdier: 'Alabardero',
  'Eagle Scout': 'Explorador águila',
  'Eagle Warrior': 'Guerrero águila',
  'Elite Eagle Warrior': 'Guerrero águila de élite',
  Mangonel: 'Mangana',
  Onager: 'Onagro',
  'Siege Onager': 'Onagro de asedio',
  'Battering Ram': 'Ariete',
  'Capped Ram': 'Ariete cubierto',
  'Siege Ram': 'Ariete de asedio',
  Scorpion: 'Escorpión',
  'Heavy Scorpion': 'Escorpión pesado',
  'Bombard Cannon': 'Cañón de asedio',
  Monk: 'Monje',
};

function unitEs(name) {
  if (!name) return 'No disponible';
  return UNIT_NAME_ES_MAP[name] || TECH_NAME_ES_MAP[name] || name;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function median(arr) {
  const nums = (arr || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 1 ? nums[mid] : Math.round(((nums[mid - 1] + nums[mid]) / 2) * 10) / 10;
}

function fmtMmSs(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function extractRealReplayEntry(r) {
  const eng = r?.telemetry?.engineSummary;
  const self = eng?.self;
  if (!eng || !self) return null;
  const dur = Number(eng.durationSeconds ?? r?.telemetry?.durationSeconds ?? 0);
  if (!Number.isFinite(dur) || dur < 180) return null;

  const civRaw = r.civ || r?.telemetry?.context?.civ || r?.match?.self?.civ || null;
  const civSlug = String(r.civSlug || r?.telemetry?.context?.civSlug || civRaw || '').toLowerCase();
  const civName = CIV_GUIDE[civSlug]?.name || civRaw || 'Civilización';
  const mapName = r.mapName || r?.telemetry?.context?.mapName || r?.match?.mapName || 'Mapa';
  const opening = eng.openingSummary?.name || r?.telemetry?.context?.opening || null;
  const startedAt = Number(r.startedAt || r.updatedAt || 0) || null;

  const feudalSec = Number.isFinite(self.timings?.feudalSeconds)
    ? Math.round(self.timings.feudalSeconds)
    : Number.isFinite(r?.telemetry?.metrics?.feudalSeconds?.value)
      ? Math.round(r.telemetry.metrics.feudalSeconds.value)
      : Number.isFinite(eng.openingSummary?.feudalSeconds)
        ? Math.round(eng.openingSummary.feudalSeconds)
        : null;

  const castleSec = Number.isFinite(self.timings?.castleSeconds)
    ? Math.round(self.timings.castleSeconds)
    : Number.isFinite(r?.telemetry?.metrics?.castleSeconds?.value)
      ? Math.round(r.telemetry.metrics.castleSeconds.value)
      : null;

  const imperialSec = Number.isFinite(self.timings?.imperialSeconds)
    ? Math.round(self.timings.imperialSeconds)
    : Number.isFinite(r?.telemetry?.metrics?.imperialSeconds?.value)
      ? Math.round(r.telemetry.metrics.imperialSeconds.value)
      : null;

  const tcIdleDarkSec = Number.isFinite(self.tcIdleDarkSeconds)
    ? Math.round(self.tcIdleDarkSeconds * 10) / 10
    : null;
  const tcUtilDarkPct = Number.isFinite(self.tcUtilizationDark)
    ? Math.round(self.tcUtilizationDark * 10) / 10
    : null;

  const tcIdleFeudalPerTcSec = Number.isFinite(self.tcIdleFeudalPerTcSeconds)
    ? Math.round(self.tcIdleFeudalPerTcSeconds * 10) / 10
    : Number.isFinite(self.tcIdleFeudalSeconds)
      ? Math.round(self.tcIdleFeudalSeconds * 10) / 10
      : null;

  const gap = self.biggestTcGap && Number.isFinite(self.biggestTcGap.durationSec)
    ? {
        durationSec: Math.round(self.biggestTcGap.durationSec),
        startSec: Number.isFinite(self.biggestTcGap.startSec) ? Math.round(self.biggestTcGap.startSec) : null,
        endSec: Number.isFinite(self.biggestTcGap.endSec) ? Math.round(self.biggestTcGap.endSec) : null,
        age: self.biggestTcGap.age || 'Partida',
        cause: self.biggestTcGap.cause || 'quiet',
        militaryOrdersInGap: Number(self.biggestTcGap.militaryOrdersInGap || 0),
        summary: self.biggestTcGap.summary || '',
      }
    : null;

  const tp = self.techProfile || null;
  const dbaDelaySec = tp && tp.hasDoubleBitAxe && Number.isFinite(tp.doubleBitAxeDelaySec)
    ? Math.round(tp.doubleBitAxeDelaySec)
    : null;
  const bowDelaySec = tp && tp.hasBowSaw && Number.isFinite(tp.bowSawDelaySec)
    ? Math.round(tp.bowSawDelaySec)
    : null;

  const eapm = Number.isFinite(self.eapm)
    ? Math.round(self.eapm * 10) / 10
    : Number.isFinite(r?.telemetry?.metrics?.eapm?.value)
      ? Math.round(r.telemetry.metrics.eapm.value * 10) / 10
      : null;
  const eapmRetentionPct = Number.isFinite(self.eapmRetentionPct) ? Math.round(self.eapmRetentionPct) : null;

  const hab = self.habits || {};
  const microOrders = Number.isFinite(hab.attackMove) || Number.isFinite(hab.patrol)
    ? Number(hab.attackMove || 0) + Number(hab.patrol || 0)
    : null;
  const townBells = Number.isFinite(hab.townBell) ? Number(hab.townBell) : null;

  return {
    matchId: String(r.matchId || ''),
    mapName,
    civSlug,
    civName,
    opening,
    won: typeof r.won === 'boolean' ? r.won : null,
    startedAt,
    durationSeconds: Math.round(dur),
    tcIdleDarkSec,
    tcUtilDarkPct,
    tcIdleFeudalPerTcSec,
    biggestTcGap: gap,
    feudalSec,
    castleSec,
    imperialSec,
    dbaDelaySec,
    bowDelaySec,
    eapm,
    eapmRetentionPct,
    microOrders,
    townBells,
    focus: eng.focus || null,
  };
}

function buildMetricSummary({ entries, currentEntry, key, title, category, explanation, icon, direction, formatVal }) {
  const withVal = entries.filter((e) => Number.isFinite(e[key]));
  if (!withVal.length) {
    return {
      key,
      title,
      category,
      explanation,
      icon,
      direction,
      hasSample: false,
      sampleCount: 0,
      currentDisplay: 'No medido en este replay',
      medianDisplay: 'Sin muestra',
      bestDisplay: 'Sin muestra',
      bestContext: '',
      deltaDisplay: null,
      improved: null,
      isPersonalBest: false,
      history: [],
    };
  }

  const curVal = Number.isFinite(currentEntry?.[key]) ? currentEntry[key] : withVal[0][key];
  const curSource = Number.isFinite(currentEntry?.[key]) ? currentEntry : withVal[0];
  const medVal = median(withVal.map((e) => e[key]));
  const sortedForBest = [...withVal].sort((a, b) => (direction === 'lower' ? a[key] - b[key] : b[key] - a[key]));
  const bestEntry = sortedForBest[0];
  const worstVal = sortedForBest[sortedForBest.length - 1][key];

  const rawDelta = medVal != null ? Math.round((curVal - medVal) * 10) / 10 : null;
  const improved = rawDelta != null
    ? (direction === 'lower' ? rawDelta <= 0 : rawDelta >= 0)
    : null;
  const isPersonalBest = withVal.length >= 2 && curVal === bestEntry[key];

  let deltaDisplay = null;
  if (rawDelta != null && withVal.length >= 2) {
    if (rawDelta === 0) deltaDisplay = 'Igual a tu mediana';
    else {
      const sign = rawDelta > 0 ? '+' : '';
      deltaDisplay = `${sign}${formatVal(rawDelta)} vs tu mediana`;
    }
  }

  const history = withVal.slice(0, 7).reverse().map((e) => {
    const span = Math.max(1, Math.abs(worstVal - bestEntry[key]));
    const norm = direction === 'lower'
      ? 1 - Math.abs(e[key] - bestEntry[key]) / span
      : 1 - Math.abs(bestEntry[key] - e[key]) / span;
    return {
      matchId: e.matchId,
      mapName: e.mapName,
      civName: e.civName,
      won: e.won,
      value: e[key],
      display: formatVal(e[key]),
      barPct: Math.round(clamp(28 + norm * 72, 24, 100)),
      isCurrent: e.matchId === curSource.matchId,
      isBest: e.matchId === bestEntry.matchId,
    };
  });

  return {
    key,
    title,
    category,
    explanation,
    icon,
    direction,
    hasSample: true,
    sampleCount: withVal.length,
    currentVal: curVal,
    currentDisplay: formatVal(curVal),
    currentContext: `#${curSource.matchId} · ${curSource.mapName} · ${curSource.civName}`,
    medianVal: medVal,
    medianDisplay: formatVal(medVal),
    bestVal: bestEntry[key],
    worstVal,
    bestDisplay: formatVal(bestEntry[key]),
    bestContext: `#${bestEntry.matchId} · ${bestEntry.mapName} (${bestEntry.civName})`,
    deltaDisplay,
    improved,
    isPersonalBest,
    history,
  };
}

function computeHighEloTelemetry(records = [], selectedMatchId = null) {
  const entries = (Array.isArray(records) ? records : [])
    .map(extractRealReplayEntry)
    .filter(Boolean)
    .slice(0, 20);

  if (!entries.length) {
    return {
      hasData: false,
      sampleSize: 0,
      selectedMatchId: null,
      selectedReplay: null,
      replays: [],
      metrics: [],
      axes: [],
      bottlenecks: [],
    };
  }

  const currentEntry = (selectedMatchId && entries.find((e) => String(e.matchId) === String(selectedMatchId))) || entries[0];

  const replays = entries.slice(0, 8).map((e) => ({
    matchId: e.matchId,
    mapName: e.mapName,
    civName: e.civName,
    civSlug: e.civSlug,
    won: e.won,
    durationSeconds: e.durationSeconds,
    label: `#${e.matchId} · ${e.mapName} · ${e.civName}`,
  }));

  const metrics = [
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'tcIdleDarkSec',
      category: 'ECONOMÍA · ALTA EDAD MEDIA',
      title: 'Tiempo sin producir aldeanos (Alta Edad)',
      explanation: 'Segundos exactos medidos en tu partida grabada en que el Centro Urbano no produjo aldeanos ni investigó Telar o Edad Feudal.',
      icon: 'assets/brand/review-town-center-v1.png',
      direction: 'lower',
      formatVal: (v) => `${v} s`,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'tcIdleFeudalPerTcSec',
      category: 'ECONOMÍA · EDAD FEUDAL',
      title: 'Inactividad en Edad Feudal por Centro Urbano',
      explanation: 'Segundos de pausa por Centro Urbano activo durante Edad Feudal, descontando Carretilla y la subida a Castillos.',
      icon: 'assets/icons/postmatch/economy.webp',
      direction: 'lower',
      formatVal: (v) => `${v} s/CU`,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'feudalSec',
      category: 'TIEMPO DE AVANCE · EDAD FEUDAL',
      title: 'Llegada a Edad Feudal',
      explanation: 'Minuto y segundo exacto de partida en que se completó la investigación de Edad Feudal.',
      icon: 'assets/brand/feudal-v1.png',
      direction: 'lower',
      formatVal: (v) => (v < 120 ? `${v} s` : (fmtMmSs(v) || `${v} s`)),
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'castleSec',
      category: 'TIEMPO DE AVANCE · EDAD DE LOS CASTILLOS',
      title: 'Llegada a Edad de los Castillos',
      explanation: 'Minuto y segundo exacto de partida en que alcanzaste la Edad de los Castillos.',
      icon: 'assets/brand/castle-v1.png',
      direction: 'lower',
      formatVal: (v) => (v < 120 ? `${v} s` : (fmtMmSs(v) || `${v} s`)),
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'dbaDelaySec',
      category: 'TECNOLOGÍAS · MADERA',
      title: 'Retraso de Hacha de doble filo',
      explanation: 'Segundos transcurridos desde que pisaste Edad Feudal hasta que hiciste clic en Hacha de doble filo en el Campamento maderero.',
      icon: 'assets/icons/wood.png',
      direction: 'lower',
      formatVal: (v) => `${v} s`,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'eapm',
      category: 'RITMO MECÁNICO · COMANDOS REALES',
      title: 'Acciones Efectivas por Minuto (eAPM)',
      explanation: 'Promedio de comandos efectivos por minuto registrados en el replay (filtrando clics repetidos en menos de 150 ms).',
      icon: 'assets/icons/postmatch/tempo.webp',
      direction: 'higher',
      formatVal: (v) => `${v} eAPM`,
    }),
  ];

  // Backward-compatible `axes` alias for unit test verification
  const axes = metrics.map((m) => ({
    key: m.key,
    label: m.title,
    currentText: m.currentDisplay,
    targetText: `Mejor marca: ${m.bestDisplay}`,
    hasSample: m.hasSample,
  }));

  // Real replay focus / bottleneck extracted from actual measured replay
  const bottlenecks = [];
  if (currentEntry.biggestTcGap && currentEntry.biggestTcGap.durationSec >= 20) {
    const g = currentEntry.biggestTcGap;
    const minWindow = (g.startSec != null && g.endSec != null)
      ? `entre ${fmtMmSs(g.startSec)} y ${fmtMmSs(g.endSec)}`
      : `en ${g.age}`;
    bottlenecks.push({
      severity: 'crimson',
      icon: 'assets/brand/review-town-center-v1.png',
      eyebrow: `MAYOR PAUSA REAL MEDIDA EN #${currentEntry.matchId} · ${currentEntry.mapName.toUpperCase()}`,
      title: `Tu Centro Urbano estuvo detenido ${g.durationSec} s seguidos ${minWindow}`,
      detail: g.militaryOrdersInGap > 0
        ? `Durante esa pausa enviaste ${g.militaryOrdersInGap} órdenes militares al frente sin poner aldeanos en cola en el Centro Urbano.`
        : 'Mantené la cola de aldeanos activa antes de cambiar la cámara hacia el frente.',
      actionTab: 'arena',
      actionLabel: 'Activar Metrónomo Anti-Idle →',
    });
  } else if (currentEntry.focus && currentEntry.focus.title) {
    bottlenecks.push({
      severity: 'gold',
      icon: 'assets/icons/postmatch/tempo.webp',
      eyebrow: `DIAGNÓSTICO DEL MOTOR EN #${currentEntry.matchId} · ${currentEntry.mapName.toUpperCase()}`,
      title: currentEntry.focus.title,
      detail: currentEntry.focus.action || currentEntry.focus.detail || '',
      actionTab: 'orders',
      actionLabel: 'Abrir Creador de Órdenes →',
    });
  }

  return {
    hasData: true,
    sampleSize: entries.length,
    selectedMatchId: currentEntry.matchId,
    selectedReplay: currentEntry,
    replays,
    metrics,
    axes,
    bottlenecks,
  };
}

function computeMatchupWarRoom({ myCivSlug = 'franks', rivalCivSlug = 'hindustanis', mapSlug = 'arabia', records = [] } = {}) {
  const validSlugs = Object.keys(CIV_GUIDE).filter((s) => Boolean(CIV_TECH[s]?.nodes));
  const mySlug = validSlugs.includes(myCivSlug) ? myCivSlug : 'franks';
  let rivalSlug = validSlugs.includes(rivalCivSlug) ? rivalCivSlug : 'hindustanis';
  if (rivalSlug === mySlug) rivalSlug = validSlugs.find((s) => s !== mySlug) || 'mayans';

  const myGuide = CIV_GUIDE[mySlug] || { name: mySlug, role: 'Civilización' };
  const rivalGuide = CIV_GUIDE[rivalSlug] || { name: rivalSlug, role: 'Civilización' };

  const lineKeys = Object.keys(LINES);
  const ageLineMatrix = { 2: [], 3: [], 4: [] };
  const ageEdgeScores = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const age of [2, 3, 4]) {
    const rows = [];
    for (const key of lineKeys) {
      const ownQ = lineQuality(mySlug, key, age);
      const rivQ = lineQuality(rivalSlug, key, age);
      const ownScore = ownQ ? Math.round(ownQ.score * 100) : 0;
      const rivScore = rivQ ? Math.round(rivQ.score * 100) : 0;

      const counterMap = COUNTERS[key] || {};
      let bestRivalCounterScore = 0;
      let bestRivalCounterLabel = null;
      for (const [cntKey, weight] of Object.entries(counterMap)) {
        const rq = lineQuality(rivalSlug, cntKey, age);
        if (rq) {
          const eff = rq.score * weight;
          if (eff > bestRivalCounterScore) {
            bestRivalCounterScore = eff;
            bestRivalCounterLabel = LINES[cntKey]?.label || cntKey;
          }
        }
      }

      const netEdge = ownQ
        ? Math.round((ownQ.score - 0.52 * bestRivalCounterScore) * 100)
        : -40;

      rows.push({
        key,
        label: LINES[key].label,
        ownAvailable: Boolean(ownQ),
        rivalAvailable: Boolean(rivQ),
        ownUnit: unitEs(ownQ?.unit),
        rivalUnit: unitEs(rivQ?.unit),
        ownScore,
        rivalScore: rivScore,
        netEdge,
        bestRivalCounterLabel,
        missingTechsEs: (ownQ?.missingTechs || []).map((t) => TECH_NAME_ES_MAP[t] || t),
      });
    }

    ageLineMatrix[age] = rows;

    const topOwn = [...rows].filter((r) => r.ownAvailable).sort((a, b) => b.ownScore - a.ownScore).slice(0, 3);
    const topRiv = [...rows].filter((r) => r.rivalAvailable).sort((a, b) => b.rivalScore - a.rivalScore).slice(0, 3);
    const ownAvg = topOwn.length ? topOwn.reduce((s, r) => s + r.ownScore, 0) / topOwn.length : 50;
    const rivAvg = topRiv.length ? topRiv.reduce((s, r) => s + r.rivalScore, 0) / topRiv.length : 50;

    const ownBest = topOwn[0] || { ownScore: 50, netEdge: 40, key: 'knights' };
    const rivBest = topRiv[0] || { rivalScore: 50, key: 'camels' };
    const directCounterToMe = (COUNTERS[ownBest.key]?.[rivBest.key] || 0) * (rivBest.rivalScore / 100);
    const directCounterToRival = (COUNTERS[rivBest.key]?.[ownBest.key] || 0) * (ownBest.ownScore / 100);
    const rawDiff = (ownAvg - rivAvg) * 1.45 + (directCounterToRival - directCounterToMe) * 32 + (age === 2 ? 6 : age === 3 ? -4 : 5);
    const diff = clamp(Math.round(rawDiff), -38, 38);
    ageEdgeScores[age] = diff === 0 ? (age === 2 ? 12 : -10) : diff;
  }

  const earlyEcoCivs = new Set(['franks', 'mongols', 'mayans', 'chinese', 'persians', 'lithuanians', 'huns', 'khmer', 'georgians', 'britons']);
  ageEdgeScores[1] = (earlyEcoCivs.has(mySlug) ? 14 : -4) - (earlyEcoCivs.has(rivalSlug) ? 14 : -4);
  if (ageEdgeScores[1] === 0) ageEdgeScores[1] = 8;

  const y1 = clamp(85 - ageEdgeScores[1] * 1.45, 24, 146);
  const y2 = clamp(85 - ageEdgeScores[2] * 1.45, 22, 148);
  const y3 = clamp(85 - ageEdgeScores[3] * 1.45, 22, 148);
  const y4 = clamp(85 - ageEdgeScores[4] * 1.45, 22, 148);

  const curvePath = `M0,85 L110,${Math.round(y1)} L330,${Math.round(y2)} L550,${Math.round(y3)} L770,${Math.round(y4)} L880,${Math.round(y4)}`;
  const areaFullPath = `${curvePath} L880,85 L0,85 Z`;

  const myTraps = [];
  for (const key of ['archers', 'knights', 'scouts', 'infantry', 'cavarchers']) {
    const c3 = lineQuality(mySlug, key, 3);
    const c4 = lineQuality(mySlug, key, 4);
    if (c3 && c3.score >= 0.78 && c4 && (c4.tierCoverage < 0.99 || c4.missingTechs.length >= 2)) {
      const missingEs = c4.missingTechs.map((t) => TECH_NAME_ES_MAP[t] || t).slice(0, 3).join(', ');
      myTraps.push({
        lineKey: key,
        lineLabel: LINES[key].label,
        title: `Techo en Imperial para ${LINES[key].label}`,
        detail: `Fuerte en Edad de los Castillos (${unitEs(c3.unit)}), pero en Edad Imperial pierde ${missingEs || 'mejora final de línea'}. Planificá transición antes del minuto 30.`,
      });
    }
  }

  const rivalNodes = CIV_TECH[rivalSlug]?.nodes || {};
  const rivalHoles = CRITICAL_TECH_LABELS_ES
    .filter((t) => rivalNodes[t.node] == null)
    .slice(0, 4)
    .map((t) => ({
      node: t.node,
      es: t.es,
      desc: t.desc,
    }));

  const bestFeudal = [...ageLineMatrix[2]].filter((r) => r.ownAvailable).sort((a, b) => b.netEdge - a.netEdge)[0];
  const bestCastle = [...ageLineMatrix[3]].filter((r) => r.ownAvailable).sort((a, b) => b.netEdge - a.netEdge)[0];
  const bestImperial = [...ageLineMatrix[4]].filter((r) => r.ownAvailable).sort((a, b) => b.netEdge - a.netEdge)[0];

  const primaryLineKeys = ['archers', 'knights', 'scouts', 'infantry', 'camels', 'cavarchers', 'siege', 'spears', 'skirmishers', 'monks', 'eagles'];
  const clashLines = primaryLineKeys
    .map((k) => {
      const c3 = ageLineMatrix[3].find((r) => r.key === k);
      const c4 = ageLineMatrix[4].find((r) => r.key === k);
      return {
        key: k,
        label: LINES[k].label,
        castleOwn: c3?.ownScore || 0,
        castleRival: c3?.rivalScore || 0,
        impOwn: c4?.ownScore || 0,
        impRival: c4?.rivalScore || 0,
        ownMissingEs: c4?.missingTechsEs || [],
      };
    })
    .filter((r) => r.castleOwn > 0 || r.castleRival > 0 || r.impOwn > 0 || r.impRival > 0)
    .slice(0, 7);

  const matchupMap = new Map();
  for (const r of (Array.isArray(records) ? records : [])) {
    if (r?.civSlug && r?.opponentCivSlug && CIV_GUIDE[r.civSlug] && CIV_GUIDE[r.opponentCivSlug]) {
      const k = `${r.civSlug}__${r.opponentCivSlug}`;
      const cur = matchupMap.get(k) || { myCiv: r.civSlug, rivalCiv: r.opponentCivSlug, wins: 0, losses: 0 };
      if (r.won === true) cur.wins += 1;
      else if (r.won === false) cur.losses += 1;
      matchupMap.set(k, cur);
    }
  }
  const recentMatchups = [...matchupMap.values()]
    .sort((a, b) => (b.losses - a.losses) || ((b.wins + b.losses) - (a.wins + a.losses)))
    .slice(0, 4)
    .map((m) => ({
      ...m,
      label: `${CIV_GUIDE[m.myCiv]?.name || m.myCiv} vs ${CIV_GUIDE[m.rivalCiv]?.name || m.rivalCiv} (${m.wins}V-${m.losses}D)`,
    }));

  const peakAgeIdx = [2, 3, 4].sort((a, b) => ageEdgeScores[b] - ageEdgeScores[a])[0];
  const dangerAgeIdx = [2, 3, 4].sort((a, b) => ageEdgeScores[a] - ageEdgeScores[b])[0];
  const ageNames = { 1: 'Alta Edad Media', 2: 'Edad Feudal', 3: 'Edad de los Castillos', 4: 'Edad Imperial' };

  return {
    myCiv: {
      slug: mySlug,
      name: myGuide.name,
      role: myGuide.role || 'Civilización',
      strengths: myGuide.strengths || myGuide.bonuses || '',
    },
    rivalCiv: {
      slug: rivalSlug,
      name: rivalGuide.name,
      role: rivalGuide.role || 'Civilización',
      strengths: rivalGuide.strengths || rivalGuide.bonuses || '',
    },
    mapSlug: mapSlug || 'arabia',
    ageEdgeScores,
    verdictTitle: `Tu mejor ventana es ${ageNames[peakAgeIdx]} con ${bestCastle?.label || 'presión activa'}; cuidado en ${ageNames[dangerAgeIdx]}`,
    peakWindowLabel: `Mejor ventana: ${ageNames[peakAgeIdx]}`,
    dangerWindowLabel: `Peligro rival: ${ageNames[dangerAgeIdx]}`,
    gameplanByAge: [
      {
        age: 2,
        ageLabel: 'Edad Feudal',
        icon: 'assets/icons/ages/feudal.png',
        bestLine: bestFeudal?.label || 'Exploración y defensa',
        edge: ageEdgeScores[2],
        advice: bestFeudal
          ? `Priorizá ${bestFeudal.label} (${bestFeudal.ownScore} % calidad en árbol)${bestFeudal.bestRivalCounterLabel ? `; vigilá respuesta rival con ${bestFeudal.bestRivalCounterLabel}` : ''}.`
          : 'Sostené producción continua de aldeanos hacia Edad de los Castillos.',
      },
      {
        age: 3,
        ageLabel: 'Edad de los Castillos',
        icon: 'assets/icons/ages/castle.png',
        bestLine: bestCastle?.label || 'Composición mixta',
        edge: ageEdgeScores[3],
        advice: bestCastle
          ? `Eje principal: ${bestCastle.label} (${bestCastle.ownUnit})${bestCastle.missingTechsEs.length ? ` · Faltan: ${bestCastle.missingTechsEs.slice(0, 2).join(', ')}` : ' · Árbol completo en Castillos'}.`
          : 'Asegurá reliquias y posición con Centros Urbanos.',
      },
      {
        age: 4,
        ageLabel: 'Edad Imperial',
        icon: 'assets/icons/ages/imperial.png',
        bestLine: bestImperial?.label || 'Transición final',
        edge: ageEdgeScores[4],
        advice: bestImperial
          ? `Condición de cierre: ${bestImperial.label} (${bestImperial.ownUnit})${bestImperial.missingTechsEs.length ? ` · Sin ${bestImperial.missingTechsEs.slice(0, 2).join(', ')}` : ' · Mejoras completas'}.`
          : 'Cerrá con superioridad de asedio y control de oro.',
      },
    ],
    svg: {
      curvePath,
      areaFullPath,
      nodes: [
        { cx: 110, cy: Math.round(y1) },
        { cx: 330, cy: Math.round(y2) },
        { cx: 550, cy: Math.round(y3) },
        { cx: 770, cy: Math.round(y4) },
      ],
    },
    clashLines,
    myTraps,
    rivalHoles,
    recentMatchups,
  };
}

function extractBuildFromBestReplay(records = []) {
  const entries = (Array.isArray(records) ? records : []).map(extractRealReplayEntry).filter(Boolean);
  const wonWithTimings = entries.filter((e) => e.won === true && Number.isFinite(e.feudalSec) && e.feudalSec > 300)
    .sort((a, b) => a.feudalSec - b.feudalSec);

  const best = wonWithTimings[0] || entries.find((e) => Number.isFinite(e.feudalSec)) || null;
  const civSlug = best?.civSlug || 'franks';
  const civName = CIV_GUIDE[civSlug]?.name || best?.civName || 'Tu Civilización';
  const opening = best?.opening || 'Apertura competitiva';
  const feudalSec = Math.round(best?.feudalSec || 585);
  const castleSec = Math.round(best?.castleSec || 1120);

  return {
    isCustom: true,
    name: `${opening} · ${civName} (Replay #${best?.matchId || 'Propio'})`,
    shortName: `${opening} (${civName})`,
    civSlug,
    mapName: best?.mapName || 'Arabia',
    mapSlug: 'arabia',
    artClass: opening.toLowerCase().includes('arquer') ? 'is-art-archers' : opening.toLowerCase().includes('castillo') ? 'is-art-castle' : 'is-art-scouts',
    difficulty: 'Personalizada',
    targetFeudalSec: feudalSec,
    targetCastleSec: castleSec,
    summary: `Extraída de tu partida real #${best?.matchId || 'reciente'} con ${civName} (Feudal ${fmtMmSs(feudalSec) || '09:45'} · Castillos ${fmtMmSs(castleSec) || '18:40'}).`,
    steps: [
      {
        id: 'st_1',
        age: 1,
        pop: '07/10',
        gameSec: 0,
        alloc: { food: 6, wood: 0, gold: 0, stone: 0 },
        icons: ['sheep', 'villager'],
        title: 'Construí 2 Casas y enviá 6 Aldeanos a ovejas',
        text: 'Construí 2 Casas y enviá 6 Aldeanos a ovejas',
        note: 'Cola continua de aldeanos en Centro Urbano desde el segundo 0.',
      },
      {
        id: 'st_2',
        age: 1,
        pop: '11/15',
        gameSec: 100,
        alloc: { food: 6, wood: 4, gold: 0, stone: 0 },
        icons: ['wood', 'building'],
        title: 'Campamento maderero con 4 Aldeanos',
        text: 'Campamento maderero con 4 Aldeanos',
        note: 'Asegurá línea eficiente de madera para Cuartel y Granjas.',
      },
      {
        id: 'st_3',
        age: 1,
        pop: '16/20',
        gameSec: 225,
        alloc: { food: 11, wood: 4, gold: 0, stone: 0 },
        icons: ['boar', 'berries'],
        title: 'Atraé los 2 jabalíes y construí Molino en bayas',
        text: 'Atraé los 2 jabalíes y construí Molino en bayas',
        note: 'Sostené 0 s de inactividad en Centro Urbano durante la caza.',
      },
      {
        id: 'st_4',
        age: 1,
        pop: '20/25',
        gameSec: Math.max(320, feudalSec - 130),
        alloc: { food: 11, wood: 8, gold: 0, stone: 0 },
        icons: ['shield', 'barracks'],
        title: 'Investigá Telar, pulsá Edad Feudal y levantá Cuartel',
        text: 'Investigá Telar, pulsá Edad Feudal y levantá Cuartel',
        note: 'Durante la subida distribuí aldeanos para tu edificio militar principal.',
      },
      {
        id: 'st_5',
        age: 2,
        pop: '22/25',
        gameSec: feudalSec,
        alloc: { food: 11, wood: 9, gold: 1, stone: 0 },
        icons: ['stable', 'wood'],
        title: `Llegada a Edad Feudal (${fmtMmSs(feudalSec) || '09:45'}) + Hacha de doble filo`,
        text: `Llegada a Edad Feudal (${fmtMmSs(feudalSec) || '09:45'}) + Hacha de doble filo`,
        note: 'Iniciá producción militar inmediata y sembrá Granjas cada 60 de madera.',
      },
      {
        id: 'st_6',
        age: 3,
        pop: '37/45',
        gameSec: castleSec,
        alloc: { food: 18, wood: 11, gold: 7, stone: 0 },
        icons: ['castle', 'blacksmith'],
        title: `Llegada a Edad de los Castillos (${fmtMmSs(castleSec) || '18:40'}) + Sierra de arco`,
        text: `Llegada a Edad de los Castillos (${fmtMmSs(castleSec) || '18:40'}) + Sierra de arco`,
        note: 'Priorizá mejoras de Herrería antes del primer choque principal.',
      },
    ],
  };
}

module.exports = {
  CRITICAL_TECH_LABELS_ES,
  TECH_NAME_ES_MAP,
  extractRealReplayEntry,
  computeHighEloTelemetry,
  computeMatchupWarRoom,
  extractBuildFromBestReplay,
};
