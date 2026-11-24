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
const { CIV_MATCHUP_PROFILES } = require('./civ-matchup-profiles');

const ARCHER_TECHS = [['Fletching', 2], ['Bodkin Arrow', 3], ['Bracer', 4], ['Padded Archer Armor', 2], ['Leather Archer Armor', 3], ['Ring Archer Armor', 4], ['Thumb Ring', 3], ['Ballistics', 3]];
const CAV_TECHS = [['Forging', 2], ['Iron Casting', 3], ['Blast Furnace', 4], ['Scale Barding Armor', 2], ['Chain Barding Armor', 3], ['Plate Barding Armor', 4], ['Bloodlines', 2], ['Husbandry', 3]];
const INF_TECHS = [['Forging', 2], ['Iron Casting', 3], ['Blast Furnace', 4], ['Scale Mail Armor', 2], ['Chain Mail Armor', 3], ['Plate Mail Armor', 4], ['Squires', 3]];

const MATCHUP_LINES = {
  archers: {
    label: 'Arqueros', primary: true,
    tiers: [[2, 'Archer'], [3, 'Crossbowman'], [4, 'Arbalester']],
    techs: ARCHER_TECHS,
  },
  scouts: {
    label: 'Caballería ligera', primary: true,
    tiers: [[2, 'Camel Scout', 'Scout Cavalry'], [3, 'Light Cavalry'], [4, 'Winged Hussar', 'Hussar']],
    techs: CAV_TECHS,
  },
  knights: {
    label: 'Caballería pesada', primary: true,
    tiers: [[3, 'Knight', 'Hei Guang Cavalry'], [4, 'Cavalier', 'Heavy Hei Guang Cavalry'], [4, 'Savar', 'Paladin']],
    techs: CAV_TECHS,
  },
  camels: {
    label: 'Camellos', primary: true,
    tiers: [[3, 'Camel Rider'], [4, 'Imperial Camel Rider', 'Heavy Camel Rider']],
    techs: CAV_TECHS,
  },
  cavarchers: {
    label: 'Arqueros a caballo', primary: true,
    tiers: [[3, 'Cavalry Archer', 'Xianbei Raider'], [4, 'Heavy Cavalry Archer', 'Elite Xianbei Raider']],
    techs: [...ARCHER_TECHS, ['Bloodlines', 2], ['Husbandry', 3], ['Parthian Tactics', 4]],
  },
  steppe: {
    label: 'Lanceros esteparios', primary: true,
    tiers: [[3, 'Steppe Lancer'], [4, 'Elite Steppe Lancer']],
    techs: CAV_TECHS,
  },
  eagles: {
    label: 'Guerreros águila', primary: true,
    tiers: [[2, 'Eagle Scout'], [3, 'Eagle Warrior'], [4, 'Elite Eagle Warrior']],
    techs: INF_TECHS,
  },
  champis: {
    label: 'Guerreros champi', primary: true,
    tiers: [[2, 'Champi Runner'], [3, 'Champi Warrior'], [4, 'Elite Champi Warrior']],
    techs: INF_TECHS,
  },
  elephants: {
    label: 'Elefantes', primary: true,
    tiers: [[3, 'Battle Elephant', 'Elephant Archer'], [4, 'Elite Battle Elephant', 'Elite Elephant Archer']],
    techs: [['Forging', 2], ['Iron Casting', 3], ['Scale Barding Armor', 2], ['Chain Barding Armor', 3], ['Plate Barding Armor', 4], ['Bloodlines', 2], ['Husbandry', 3]],
  },
  infantry: {
    label: 'Infantería de espada', primary: true,
    tiers: [[2, 'Man-at-Arms'], [3, 'Long Swordsman'], [4, 'Two-Handed Swordsman'], [4, 'Legionary', 'Champion']],
    techs: INF_TECHS,
  },
  gunpowder: {
    label: 'Pólvora', primary: true,
    tiers: [[3, 'Hand Cannoneer'], [4, 'Hand Cannoneer', 'Grenadier', 'Houfnice', 'Bombard Cannon']],
    techs: [['Chemistry', 4], ['Padded Archer Armor', 2], ['Leather Archer Armor', 3], ['Ring Archer Armor', 4]],
  },
  unique: {
    label: 'Unidad única', primary: true, isUnique: true, tiers: [], techs: [],
  },
  skirmishers: {
    label: 'Guerrilleros', primary: false,
    tiers: [[2, 'Skirmisher'], [3, 'Elite Skirmisher'], [4, 'Imperial Skirmisher']],
    techs: ARCHER_TECHS.filter(([n]) => n !== 'Thumb Ring'),
  },
  spears: {
    label: 'Lanceros / Piqueros', primary: false,
    tiers: [[2, 'Spearman'], [3, 'Pikeman'], [4, 'Halberdier']],
    techs: INF_TECHS,
  },
  siege: {
    label: 'Asedio', primary: false,
    tiers: [[3, 'Mangonel', 'Rocket Cart', 'Scorpion'], [4, 'Siege Onager', 'Onager', 'Heavy Rocket Cart', 'Houfnice', 'Bombard Cannon', 'Heavy Scorpion', 'Siege Ram', 'Siege Elephant']],
    techs: [['Siege Engineers', 4]],
  },
  monks: {
    label: 'Monjes', primary: false,
    tiers: [[3, 'Monk']],
    techs: [['Sanctity', 3], ['Fervor', 3], ['Redemption', 3], ['Atonement', 3], ['Block Printing', 4], ['Illumination', 4], ['Theocracy', 4]],
  },
};

// Standard AoE2:DE counter matrix: COUNTERS[victimLine][attackerCounterLine] = effectiveness (0..1)
const COUNTERS = {
  archers:     { skirmishers: 0.96, siege: 0.92, eagles: 0.88, champis: 0.84, knights: 0.72, scouts: 0.56, steppe: 0.65 },
  scouts:      { spears: 0.96, camels: 0.94, knights: 0.78, elephants: 0.75, steppe: 0.72 },
  knights:     { camels: 0.95, spears: 0.90, monks: 0.82, elephants: 0.74 },
  camels:      { spears: 0.92, infantry: 0.78, archers: 0.68, gunpowder: 0.72, monks: 0.62 },
  cavarchers:  { skirmishers: 0.94, camels: 0.76, eagles: 0.76, champis: 0.72, siege: 0.72, archers: 0.58 },
  steppe:      { camels: 0.92, spears: 0.88, archers: 0.72, knights: 0.68, monks: 0.68 },
  eagles:      { infantry: 0.96, gunpowder: 0.88, knights: 0.76, steppe: 0.68 },
  champis:     { infantry: 0.94, gunpowder: 0.86, knights: 0.76, archers: 0.52 },
  elephants:   { monks: 0.95, spears: 0.94, camels: 0.82, siege: 0.66 },
  infantry:    { gunpowder: 0.96, archers: 0.88, cavarchers: 0.90, siege: 0.72, knights: 0.56 },
  gunpowder:   { skirmishers: 0.86, archers: 0.80, siege: 0.82, knights: 0.76, cavarchers: 0.78, scouts: 0.66 },
  siege:       { knights: 0.92, scouts: 0.90, eagles: 0.88, champis: 0.84, monks: 0.80, steppe: 0.82 },
  skirmishers: { knights: 0.94, scouts: 0.90, siege: 0.88, infantry: 0.82, eagles: 0.84, champis: 0.80, steppe: 0.86 },
  spears:      { archers: 0.94, infantry: 0.90, gunpowder: 0.92, skirmishers: 0.78, cavarchers: 0.84, siege: 0.72 },
  monks:       { scouts: 0.96, eagles: 0.94, champis: 0.90, archers: 0.76, skirmishers: 0.62 },
};

const CRITICAL_TECH_LABELS_ES = [
  { node: 'Bloodlines', es: 'Pureza de sangre', role: 'cavalry', needsStable: true, desc: '+20 puntos de salud en unidades montadas' },
  { node: 'Bracer', es: 'Brazalete', role: 'archers', desc: '+1 ataque y +1 alcance en Edad Imperial para arqueros y defensas' },
  { node: 'Thumb Ring', es: 'Dactilera', role: 'archers', desc: '100 % de precisión y mayor cadencia en arqueros y AC' },
  { node: 'Ring Archer Armor', es: 'Armadura de anillas de arquero', role: 'archers', desc: 'Última armadura de arqueros y guerrilleros (+1/+2)' },
  { node: 'Plate Barding Armor', es: 'Barda de placas', role: 'cavalry', needsStable: true, desc: 'Última armadura de caballería (+1/+2)' },
  { node: 'Blast Furnace', es: 'Alto horno', role: 'melee', desc: '+2 de ataque cuerpo a cuerpo en Edad Imperial' },
  { node: 'Pikeman', es: 'Piquero', role: 'spears', desc: 'Sin mejora de Castillos anticaballería (muy vulnerable a jinetes)' },
  { node: 'Halberdier', es: 'Alabardero', role: 'spears', desc: 'Mejora final anticaballería en Cuarteles' },
  { node: 'Elite Skirmisher', es: 'Guerrillero de élite', role: 'skirmishers', desc: 'Sin respuesta económica contra arqueros en Castillos/Imperial' },
  { node: 'Crossbowman', es: 'Ballestero', role: 'archers', desc: 'Sin transición a Ballestero en Edad de los Castillos' },
  { node: 'Arbalester', es: 'Arbalestero', role: 'archers', desc: 'Mejora final de la línea de Arqueros en Imperial' },
  { node: 'Paladin', es: 'Paladín', role: 'cavalry', needsKnight: true, desc: 'Mejora final de caballería pesada' },
  { node: 'Hussar', es: 'Húsar', role: 'cavalry', needsStable: true, desc: 'Mejora final de caballería ligera sin costo de oro' },
  { node: 'Siege Engineers', es: 'Ingenieros de asedio', role: 'siege', desc: '+1 alcance y +20 % daño de asedio a edificios' },
  { node: 'Bombard Cannon', es: 'Cañón de asedio', role: 'siege', desc: 'Artillería móvil contra lanzapiedras y edificios' },
  { node: 'Redemption', es: 'Redención', role: 'monks', desc: 'Permite a los Monjes convertir asedio y edificios' },
];

const TECH_NAME_ES_MAP = Object.fromEntries([
  ...CRITICAL_TECH_LABELS_ES.map((t) => [t.node, t.es]),
  ['Fletching', 'Emplumado de flechas'],
  ['Bodkin Arrow', 'Flecha de punzón'],
  ['Padded Archer Armor', 'Armadura acolchada para arqueros'],
  ['Leather Archer Armor', 'Armadura de cuero para arqueros'],
  ['Ballistics', 'Balística'],
  ['Forging', 'Forja'],
  ['Iron Casting', 'Fundición de hierro'],
  ['Scale Barding Armor', 'Barda de escamas'],
  ['Chain Barding Armor', 'Barda de malla'],
  ['Husbandry', 'Ganadería'],
  ['Scale Mail Armor', 'Cota de escamas'],
  ['Chain Mail Armor', 'Cota de malla'],
  ['Plate Mail Armor', 'Armadura de placas'],
  ['Parthian Tactics', 'Tácticas de los partos'],
  ['Sanctity', 'Santidad'],
  ['Fervor', 'Fervor'],
  ['Atonement', 'Expiación'],
  ['Illumination', 'Iluminación'],
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
  'Heavy Cavalry Archer': 'Arquero a caballo pesado',
  'Mounted Crossbowman': 'Ballestero a caballo',
  'Heavy Mounted Crossbowman': 'Ballestero a caballo pesado',
  'Xianbei Raider': 'Asaltante xianbei',
  'Elite Xianbei Raider': 'Asaltante xianbei de élite',
  'Hand Cannoneer': 'Artillero manual',
  Grenadier: 'Granadero',
  'Scout Cavalry': 'Explorador',
  'Camel Scout': 'Explorador en camello',
  'Light Cavalry': 'Caballería ligera',
  Hussar: 'Húsar',
  'Winged Hussar': 'Húsar alado',
  Knight: 'Jinete',
  Cavalier: 'Caballero',
  Paladin: 'Paladín',
  Savar: 'Savar',
  'Hei Guang Cavalry': 'Caballería Hei Guang',
  'Heavy Hei Guang Cavalry': 'Caballería Hei Guang pesada',
  'Camel Rider': 'Camello',
  'Heavy Camel Rider': 'Camello pesado',
  'Imperial Camel Rider': 'Camello imperial',
  'Steppe Lancer': 'Lancero estepario',
  'Elite Steppe Lancer': 'Lancero estepario de élite',
  'Battle Elephant': 'Elefante de batalla',
  'Elite Battle Elephant': 'Elefante de batalla de élite',
  'Elephant Archer': 'Arquero en elefante',
  'Elite Elephant Archer': 'Arquero en elefante de élite',
  'Armored Elephant': 'Elefante blindado',
  'Siege Elephant': 'Elefante de asedio',
  Militia: 'Milicia',
  'Man-at-Arms': 'Hombre de armas',
  'Long Swordsman': 'Espadachín de espada larga',
  'Two-Handed Swordsman': 'Espadachín de mandoble',
  Champion: 'Campeón',
  Legionary: 'Legionario',
  'Fire Lancer': 'Lancero de fuego',
  Spearman: 'Lancero',
  Pikeman: 'Piquero',
  Halberdier: 'Alabardero',
  'Eagle Scout': 'Explorador águila',
  'Eagle Warrior': 'Guerrero águila',
  'Elite Eagle Warrior': 'Guerrero águila de élite',
  'Champi Runner': 'Corredor champi',
  'Champi Warrior': 'Guerrero champi',
  'Elite Champi Warrior': 'Guerrero champi de élite',
  Slinger: 'Hondero',
  Mangonel: 'Mangana',
  Onager: 'Onagro',
  'Siege Onager': 'Onagro de asedio',
  'Rocket Cart': 'Carro de cohetes',
  'Heavy Rocket Cart': 'Carro de cohetes pesado',
  'Battering Ram': 'Ariete',
  'Capped Ram': 'Ariete cubierto',
  'Siege Ram': 'Ariete de asedio',
  Scorpion: 'Escorpión',
  'Heavy Scorpion': 'Escorpión pesado',
  'Bombard Cannon': 'Cañón de asedio',
  Houfnice: 'Obús',
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

function fmtSignedSec(delta, useClock = false) {
  if (!Number.isFinite(delta)) return null;
  const r = Math.round(delta);
  if (r === 0) return 'En media';
  const sign = r > 0 ? '+' : '-';
  const abs = Math.abs(r);
  if (useClock && abs >= 60) {
    return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
  }
  return `${sign}${abs} s`;
}

function toVillagersLost(sec) {
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.round((sec / 25) * 10) / 10;
}

function fmtVillagersEs(v) {
  if (!Number.isFinite(v)) return null;
  const txt = String(v).replace('.', ',');
  return `${txt} ${v === 1 ? 'aldeano' : 'aldeanos'}`;
}

// Escalones reales verificables (coinciden con MISSION_FAMILIES · cero tablas de ELO inventadas)
const REAL_TIER_LADDER = {
  tcIdleDarkSec: [
    { tier: 'Bronce', target: 35, display: '≤ 35 s' },
    { tier: 'Plata', target: 20, display: '≤ 20 s' },
    { tier: 'Oro', target: 10, display: '≤ 10 s' },
    { tier: 'Obsidiana', target: 5, display: '≤ 5 s' },
  ],
  tcIdleFeudalPerTcSec: [
    { tier: 'Bronce', target: 45, display: '≤ 45 s' },
    { tier: 'Plata', target: 28, display: '≤ 28 s' },
    { tier: 'Oro', target: 16, display: '≤ 16 s' },
    { tier: 'Obsidiana', target: 8, display: '≤ 8 s' },
  ],
  feudalSec: [
    { tier: 'Bronce', target: 690, display: '≤ 11:30' },
    { tier: 'Plata', target: 645, display: '≤ 10:45' },
    { tier: 'Oro', target: 615, display: '≤ 10:15' },
    { tier: 'Obsidiana', target: 590, display: '≤ 09:50' },
  ],
  castleSec: [
    { tier: 'Bronce', target: 1440, display: '≤ 24:00' },
    { tier: 'Plata', target: 1320, display: '≤ 22:00' },
    { tier: 'Oro', target: 1200, display: '≤ 20:00' },
    { tier: 'Obsidiana', target: 1110, display: '≤ 18:30' },
  ],
  dbaDelaySec: [
    { tier: 'Bronce', target: 90, display: '≤ 90 s' },
    { tier: 'Plata', target: 45, display: '≤ 45 s' },
    { tier: 'Oro', target: 25, display: '≤ 25 s' },
    { tier: 'Obsidiana', target: 12, display: '≤ 12 s' },
  ],
};

function computeNextRealTarget(key, refVal, direction) {
  const ladder = REAL_TIER_LADDER[key];
  if (!ladder || !Number.isFinite(refVal)) return null;
  for (const step of ladder) {
    const beats = direction === 'lower' ? refVal <= step.target : refVal >= step.target;
    if (!beats) {
      const gap = Math.round(Math.abs(refVal - step.target));
      return {
        tierLabel: step.tier,
        targetVal: step.target,
        targetDisplay: `${step.tier} (${step.display})`,
        shortTarget: step.display,
        gapVal: gap,
        meetsAll: false,
      };
    }
  }
  const top = ladder[ladder.length - 1];
  return {
    tierLabel: top.tier,
    targetVal: top.target,
    targetDisplay: `${top.tier} cumplido (${top.display})`,
    shortTarget: top.display,
    gapVal: 0,
    meetsAll: true,
  };
}

const MIN_VALID_MATCH_EPOCH_MS = Date.UTC(2019, 0, 1);
const MAX_FUTURE_SKEW_MS = 15 * 60 * 1000;
const DAY_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function normalizeEpochMs(raw, nowMs = Date.now()) {
  if (raw == null || raw === '') return null;
  let num = null;
  if (typeof raw === 'number') {
    num = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    num = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
  } else if (raw instanceof Date) {
    num = raw.getTime();
  }
  if (!Number.isFinite(num) || num <= 0) return null;
  let ms = null;
  if (num >= 1e9 && num < 1e11) {
    ms = Math.round(num * 1000);
  } else if (num >= 1e12 && num < 1e14) {
    ms = Math.round(num);
  } else {
    return null;
  }
  if (ms < MIN_VALID_MATCH_EPOCH_MS || ms > nowMs + MAX_FUTURE_SKEW_MS) return null;
  return ms;
}

function resolvePlayedAtMs(r, nowMs = Date.now()) {
  if (!r || typeof r !== 'object') return null;
  // Strictly real match timestamps only — NEVER fall back to updatedAt / backfill save time.
  const candidates = [
    r.startedAt,
    r.match?.startedAt,
    r.finishedAt,
    r.match?.finishedAt,
    r.playedAt,
    r.endedAt,
  ];
  for (const cand of candidates) {
    const ms = normalizeEpochMs(cand, nowMs);
    if (ms != null) return ms;
  }
  return null;
}

function extractRealReplayEntry(r, nowMs = Date.now()) {
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
  const playedAtMs = resolvePlayedAtMs(r, nowMs);
  const startingAge = String(
    r?.telemetry?.context?.startingAge
    || eng?.context?.startingAge
    || r?.match?.startingAge
    || 'dark',
  ).toLowerCase();

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
        villagersLost: toVillagersLost(self.biggestTcGap.durationSec),
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
  const wellEquipped = tp?.armyRelevance && typeof tp.armyRelevance.wellEquipped === 'boolean'
    ? tp.armyRelevance.wellEquipped
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

  const stagesMap = {};
  for (const st of Array.isArray(eng.stages) ? eng.stages : []) {
    if (st && st.id && st.status === 'ready' && Number.isFinite(st.score)) {
      stagesMap[st.id] = Math.round(st.score);
    }
  }

  return {
    matchId: String(r.matchId || ''),
    mapName,
    civSlug,
    civName,
    opening,
    won: typeof r.won === 'boolean' ? r.won : null,
    startedAt,
    playedAtMs,
    hasValidTimestamp: playedAtMs != null,
    startingAge,
    durationSeconds: Math.round(dur),
    durationDisplay: fmtMmSs(dur) || '',
    tcIdleDarkSec,
    tcUtilDarkPct,
    tcIdleFeudalPerTcSec,
    villagersLostDark: toVillagersLost(tcIdleDarkSec),
    villagersLostFeudalPerTc: toVillagersLost(tcIdleFeudalPerTcSec),
    biggestTcGap: gap,
    feudalSec,
    castleSec,
    imperialSec,
    dbaDelaySec,
    bowDelaySec,
    wellEquipped,
    eapm,
    eapmRetentionPct,
    microOrders,
    townBells,
    stages: stagesMap,
    focus: eng.focus || null,
  };
}

function buildMetricSummary({ entries, currentEntry, key, title, category, explanation, icon, direction, formatVal, useClockDelta = false, deadband = 3 }) {
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
      currentDisplay: 'Sin dato en esta partida',
      medianDisplay: 'Sin muestra',
      bestDisplay: 'Sin muestra',
      bestContext: '',
      deltaDisplay: null,
      rawDelta: null,
      signedDeltaShort: '—',
      villagersLostCurrent: null,
      villagersLostMedian: null,
      nextTarget: null,
      trendDelta3: null,
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
  let signedDeltaShort = withVal.length >= 2 ? 'En media' : 'Base inicial';
  if (rawDelta != null && withVal.length >= 2) {
    if (rawDelta === 0) {
      deltaDisplay = 'Igual a tu promedio';
      signedDeltaShort = 'En media';
    } else if (key === 'eapm') {
      const sign = rawDelta > 0 ? '+' : '';
      deltaDisplay = `${sign}${rawDelta} vs tu promedio`;
      signedDeltaShort = `${sign}${rawDelta}`;
    } else {
      const short = fmtSignedSec(rawDelta, useClockDelta);
      signedDeltaShort = short || 'En media';
      deltaDisplay = `${short} vs tu promedio`;
    }
  }

  // Tendencia reciente (últimas 3 partidas vs anteriores)
  let trendDelta3 = null;
  if (withVal.length >= 4) {
    const recMed = median(withVal.slice(0, 3).map((e) => e[key]));
    const prevMed = median(withVal.slice(3, 12).map((e) => e[key]));
    if (recMed != null && prevMed != null) {
      const d = Math.round((recMed - prevMed) * 10) / 10;
      const isImproving = direction === 'lower' ? d < -deadband : d > deadband;
      const isRegressing = direction === 'lower' ? d > deadband : d < -deadband;
      const dStr = key === 'eapm'
        ? `${d > 0 ? '+' : ''}${d}`
        : (fmtSignedSec(d, useClockDelta) || '0 s');
      trendDelta3 = {
        status: isImproving ? 'improving' : isRegressing ? 'regressing' : 'stable',
        delta: d,
        display: isImproving || isRegressing ? dStr : 'Estable',
      };
    }
  }

  const isTcMetric = key === 'tcIdleDarkSec' || key === 'tcIdleFeudalPerTcSec';
  const villagersLostCurrent = isTcMetric ? toVillagersLost(curVal) : null;
  const villagersLostMedian = isTcMetric ? toVillagersLost(medVal) : null;
  const nextTarget = computeNextRealTarget(key, medVal != null ? medVal : curVal, direction);

  const history = withVal.slice(0, 12).reverse().map((e) => {
    const span = Math.max(1, Math.abs(worstVal - bestEntry[key]));
    const norm = direction === 'lower'
      ? 1 - Math.abs(e[key] - bestEntry[key]) / span
      : 1 - Math.abs(bestEntry[key] - e[key]) / span;
    return {
      matchId: e.matchId,
      mapName: e.mapName,
      civName: e.civName,
      civSlug: e.civSlug,
      opening: e.opening,
      durationDisplay: e.durationDisplay,
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
    rawDelta,
    signedDeltaShort,
    villagersLostCurrent,
    villagersLostMedian,
    nextTarget,
    trendDelta3,
    improved,
    isPersonalBest,
    history,
  };
}

function buildWinLossComparison(entries) {
  const wins = entries.filter((e) => e.won === true);
  const losses = entries.filter((e) => e.won === false);
  if (!wins.length || !losses.length) {
    return {
      hasComparison: false,
      isReliable: false,
      winsCount: wins.length,
      lossesCount: losses.length,
      rows: [],
      biggestDropOff: null,
    };
  }
  const specs = [
    { key: 'tcIdleDarkSec', label: 'Inactividad en Alta Edad Media', prose: 'tu pausa del Centro Urbano en Alta Edad Media', dir: 'lower', scale: 12, useClock: false, vill: true },
    { key: 'tcIdleFeudalPerTcSec', label: 'Inactividad por Centro Urbano (Feudal)', prose: 'tu pausa por Centro Urbano en Edad Feudal', dir: 'lower', scale: 15, useClock: false, vill: true },
    { key: 'feudalSec', label: 'Pase a Edad Feudal', prose: 'tu pase a Edad Feudal', dir: 'lower', scale: 25, useClock: true, vill: false },
    { key: 'castleSec', label: 'Pase a Edad de los Castillos', prose: 'tu pase a Edad de los Castillos', dir: 'lower', scale: 60, useClock: true, vill: false },
    { key: 'dbaDelaySec', label: 'Demora en Hacha de doble filo', prose: 'tu demora en Hacha de doble filo', dir: 'lower', scale: 30, useClock: false, vill: false },
    { key: 'eapm', label: 'Ritmo efectivo (eAPM)', prose: 'tu ritmo efectivo (eAPM)', dir: 'higher', scale: 6, useClock: false, vill: false },
  ];
  const rows = [];
  for (const sp of specs) {
    const wVals = wins.map((e) => e[sp.key]).filter(Number.isFinite);
    const lVals = losses.map((e) => e[sp.key]).filter(Number.isFinite);
    if (!wVals.length || !lVals.length) continue;
    const wMed = median(wVals);
    const lMed = median(lVals);
    const gap = Math.round((lMed - wMed) * 10) / 10;
    const worseInLosses = sp.dir === 'lower' ? gap > 0 : gap < 0;
    const impact = sp.dir === 'lower' ? gap / sp.scale : (-gap) / sp.scale;
    const fmt = (v) => (sp.key === 'eapm' ? `${v}` : (sp.useClock ? (fmtMmSs(v) || `${v} s`) : `${v} s`));
    const deltaText = sp.key === 'eapm'
      ? `${gap > 0 ? '+' : ''}${gap} eAPM`
      : fmtSignedSec(gap, sp.useClock);
    const villDiff = sp.vill && worseInLosses && gap >= 8 ? toVillagersLost(gap) : null;
    rows.push({
      key: sp.key,
      label: sp.label,
      prose: sp.prose,
      winVal: wMed,
      lossVal: lMed,
      winDisplay: fmt(wMed),
      lossDisplay: fmt(lMed),
      deltaDisplay: deltaText,
      villDiff,
      worseInLosses,
      impactScore: Math.round(impact * 100) / 100,
    });
  }
  rows.sort((a, b) => b.impactScore - a.impactScore);
  const top = rows[0] && rows[0].impactScore >= 0.55 ? rows[0] : null;
  const biggestDropOff = top
    ? {
        key: top.key,
        label: top.label,
        headline: top.villDiff
          ? `En tus derrotas, ${top.prose} empeora ${top.deltaDisplay} (+${fmtVillagersEs(top.villDiff)})`
          : `En tus derrotas, ${top.prose} empeora ${top.deltaDisplay} (${top.winDisplay} en victorias vs ${top.lossDisplay} en derrotas)`,
        winDisplay: top.winDisplay,
        lossDisplay: top.lossDisplay,
        deltaDisplay: top.deltaDisplay,
      }
    : null;
  return {
    hasComparison: true,
    isReliable: wins.length >= 2 && losses.length >= 2,
    winsCount: wins.length,
    lossesCount: losses.length,
    rows,
    biggestDropOff,
  };
}

function buildPrimaryDiagnosis({ currentEntry, metrics, bottlenecks, sampleSize }) {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const mDark = byKey.get('tcIdleDarkSec');
  const mFeudalTc = byKey.get('tcIdleFeudalPerTcSec');
  const mDba = byKey.get('dbaDelaySec');
  const mFeudal = byKey.get('feudalSec');
  const mCastle = byKey.get('castleSec');

  const gap = currentEntry.biggestTcGap;
  const gapLine = (gap && gap.durationSec >= 15)
    ? `Mayor apagón del Centro Urbano: ${gap.durationSec} s (${fmtVillagersEs(gap.villagersLost)})${gap.startSec != null && gap.endSec != null ? ` entre ${fmtMmSs(gap.startSec)} y ${fmtMmSs(gap.endSec)}` : ''}${gap.militaryOrdersInGap > 0 ? ` mientras enviaste ${gap.militaryOrdersInGap} órdenes militares.` : '.'}`
    : null;

  // 1. Pausa crítica del Centro Urbano en Edad Feudal (alta pérdida en aldeanos)
  if (mFeudalTc?.hasSample && Number.isFinite(mFeudalTc.currentVal) && (mFeudalTc.currentVal >= 30 || (mFeudalTc.improved === false && mFeudalTc.rawDelta >= 8))) {
    const vLost = toVillagersLost(mFeudalTc.currentVal);
    const tgt = mFeudalTc.nextTarget;
    return {
      severity: mFeudalTc.currentVal >= 40 ? 'crimson' : 'gold',
      metricKey: 'tcIdleFeudalPerTcSec',
      eyebrow: `CUELLO DE BOTELLA #1 · IMPACTO EN ECONOMÍA (${sampleSize} ${sampleSize === 1 ? 'PARTIDA' : 'PARTIDAS'})`,
      headline: `Perdiste ${fmtVillagersEs(vLost)} por Centro Urbano en Edad Feudal`,
      evidenceLine: gapLine || `Pausa medida: ${mFeudalTc.currentDisplay} (promedio ${mFeudalTc.medianDisplay} · récord ${mFeudalTc.bestDisplay}).`,
      targetDisplay: tgt && !tgt.meetsAll ? `Objetivo ${tgt.targetDisplay}` : `Superar tu récord (${mFeudalTc.bestDisplay})`,
      drillCue: 'Dejá 2 aldeanos en cola antes de microear el ejército y renová la cola cada vez que ponés una granja.',
      actionTab: 'orders',
      actionLabel: 'Entrenar este cuello de botella →',
      planTitle: `Reducir pausa del Centro Urbano en Edad Feudal (${tgt && !tgt.meetsAll ? tgt.shortTarget : mFeudalTc.bestDisplay})`,
      planDetail: `Actual ${mFeudalTc.currentDisplay} (${fmtVillagersEs(vLost)} perdidos) en ${currentEntry.mapName}`,
      planMetric: mFeudalTc.currentDisplay,
    };
  }

  // 2. Pausa crítica en Alta Edad Media
  if (mDark?.hasSample && Number.isFinite(mDark.currentVal) && (mDark.currentVal >= 22 || (mDark.improved === false && mDark.rawDelta >= 6))) {
    const vLost = toVillagersLost(mDark.currentVal);
    const tgt = mDark.nextTarget;
    return {
      severity: mDark.currentVal >= 35 ? 'crimson' : 'gold',
      metricKey: 'tcIdleDarkSec',
      eyebrow: `CUELLO DE BOTELLA #1 · ALTA EDAD MEDIA (${sampleSize} ${sampleSize === 1 ? 'PARTIDA' : 'PARTIDAS'})`,
      headline: `Regalaste ${fmtVillagersEs(vLost)} antes de llegar a Edad Feudal`,
      evidenceLine: gapLine || `Inactividad en Alta Edad Media: ${mDark.currentDisplay} (promedio ${mDark.medianDisplay} · récord ${mDark.bestDisplay}).`,
      targetDisplay: tgt && !tgt.meetsAll ? `Objetivo ${tgt.targetDisplay}` : `Superar tu récord (${mDark.bestDisplay})`,
      drillCue: 'Cada 20 segundos usá la tecla de Centro Urbano + crear aldeano antes de mover al explorador.',
      actionTab: 'orders',
      actionLabel: 'Practicar apertura limpia →',
      planTitle: `Bajar pausa del Centro Urbano en Alta Edad Media (${tgt && !tgt.meetsAll ? tgt.shortTarget : mDark.bestDisplay})`,
      planDetail: `Actual ${mDark.currentDisplay} (${fmtVillagersEs(vLost)} perdidos) en ${currentEntry.mapName}`,
      planMetric: mDark.currentDisplay,
    };
  }

  // 3. Retraso en Hacha de doble filo
  if (mDba?.hasSample && Number.isFinite(mDba.currentVal) && (mDba.currentVal >= 45 || (mDba.improved === false && mDba.rawDelta >= 15))) {
    const tgt = mDba.nextTarget;
    return {
      severity: mDba.currentVal >= 75 ? 'crimson' : 'gold',
      metricKey: 'dbaDelaySec',
      eyebrow: 'CUELLO DE BOTELLA #1 · TECNOLOGÍA ECONÓMICA',
      headline: `Hacha de doble filo llegó ${mDba.currentVal} s tarde tras pisar Feudal`,
      evidenceLine: `Demora medida: ${mDba.currentDisplay} (promedio ${mDba.medianDisplay} · récord ${mDba.bestDisplay}).`,
      targetDisplay: tgt && !tgt.meetsAll ? `Objetivo ${tgt.targetDisplay}` : `Superar tu récord (${mDba.bestDisplay})`,
      drillCue: 'Apenas suena la campana de Edad Feudal, tu primer clic va al Campamento maderero.',
      actionTab: 'orders',
      actionLabel: 'Entrenar transición a Feudal →',
      planTitle: `Investigar Hacha de doble filo en ${tgt && !tgt.meetsAll ? tgt.shortTarget : '≤ 25 s'} tras Feudal`,
      planDetail: `Demora de ${mDba.currentDisplay} en ${currentEntry.mapName}`,
      planMetric: mDba.currentDisplay,
    };
  }

  // 4. Tiempo a Castillos o Feudal por debajo de la media
  const timingPick = (mCastle?.hasSample && mCastle.improved === false && mCastle.rawDelta >= 20)
    ? mCastle
    : (mFeudal?.hasSample && mFeudal.improved === false && mFeudal.rawDelta >= 12)
      ? mFeudal
      : null;
  if (timingPick) {
    const tgt = timingPick.nextTarget;
    return {
      severity: 'gold',
      metricKey: timingPick.key,
      eyebrow: 'CUELLO DE BOTELLA #1 · RITMO DE AVANCE',
      headline: `${timingPick.title}: ${timingPick.signedDeltaShort} más lento que tu promedio`,
      evidenceLine: gapLine || `Esta partida: ${timingPick.currentDisplay} frente a tu promedio de ${timingPick.medianDisplay}.`,
      targetDisplay: tgt && !tgt.meetsAll ? `Objetivo ${tgt.targetDisplay}` : `Acercarte a tu récord (${timingPick.bestDisplay})`,
      drillCue: 'Practicá el orden de construcción con el marcador de tiempos para evitar sobrantes de madera o comida.',
      actionTab: 'orders',
      actionLabel: 'Abrir marcador de tiempos →',
      planTitle: `Acelerar ${timingPick.title} (${tgt && !tgt.meetsAll ? tgt.shortTarget : timingPick.medianDisplay})`,
      planDetail: `Actual ${timingPick.currentDisplay} en ${currentEntry.mapName}`,
      planMetric: timingPick.currentDisplay,
    };
  }

  // 5. Fallback limpio: mayor pausa detectada o partida sólida
  const bn = bottlenecks[0];
  if (bn) {
    return {
      severity: bn.severity === 'crimson' ? 'crimson' : 'gold',
      metricKey: 'tcIdleDarkSec',
      eyebrow: bn.eyebrow || 'DIAGNÓSTICO DE ESTA PARTIDA',
      headline: bn.title,
      evidenceLine: bn.detail || gapLine || 'Revisá el desglose inferior para identificar dónde ganar segundos.',
      targetDisplay: mDark?.nextTarget ? `Objetivo ${mDark.nextTarget.targetDisplay}` : 'Sostener consistencia en tu próxima partida',
      drillCue: 'Usá el Creador de Build Orders en vivo para sostener producción continua de aldeanos.',
      actionTab: bn.actionTab || 'orders',
      actionLabel: 'Entrenar este foco →',
      planTitle: bn.title,
      planDetail: bn.detail || `Detectado en ${currentEntry.mapName}`,
      planMetric: mDark?.currentDisplay || '',
    };
  }

  return {
    severity: 'emerald',
    metricKey: mDark?.hasSample ? 'tcIdleDarkSec' : (metrics[0]?.key || 'tcIdleDarkSec'),
    eyebrow: `EJECUCIÓN LIMPIA · ${currentEntry.mapName.toUpperCase()}`,
    headline: 'Ejecución sólida por encima de tu promedio personal',
    evidenceLine: gapLine || `Alta Edad Media: ${mDark?.currentDisplay || '—'} · Feudal: ${mFeudal?.currentDisplay || '—'} · Castillos: ${mCastle?.currentDisplay || '—'}.`,
    targetDisplay: mFeudal?.bestDisplay ? `Próximo desafío: batir tu récord (${mFeudal.bestDisplay})` : 'Consolidar tu marca en la próxima partida',
    drillCue: 'Subí la exigencia probando una apertura más agresiva o entrenando decisiones en Arena.',
    actionTab: 'arena',
    actionLabel: 'Desafiar Arena Táctica →',
    planTitle: 'Consolidar ejecución limpia en tu próxima partida',
    planDetail: `Referencia en ${currentEntry.mapName} con ${currentEntry.civName}`,
    planMetric: mFeudal?.currentDisplay || '',
  };
}

const WEEKLY_METRIC_SPECS = [
  {
    key: 'tcIdleDarkSec',
    label: 'Centro Urbano · Alta Edad',
    shortLabel: 'CU Alta Edad',
    icon: 'assets/brand/review-town-center-v1.png',
    direction: 'lower',
    weeklyDeadband: 4,
    matchFloor: 2,
    useClock: false,
    isTc: true,
    darkOnly: true,
    minValid: 0,
    formatVal: (v) => `${v} s`,
  },
  {
    key: 'tcIdleFeudalPerTcSec',
    label: 'Centro Urbano · Edad Feudal',
    shortLabel: 'CU Feudal',
    icon: 'assets/icons/postmatch/economy.webp',
    direction: 'lower',
    weeklyDeadband: 5,
    matchFloor: 3,
    useClock: false,
    isTc: true,
    darkOnly: false,
    minValid: 0,
    formatVal: (v) => `${v} s`,
  },
  {
    key: 'feudalSec',
    label: 'Pase a Edad Feudal',
    shortLabel: 'Pase Feudal',
    icon: 'assets/brand/feudal-v1.png',
    direction: 'lower',
    weeklyDeadband: 10,
    matchFloor: 5,
    useClock: true,
    isTc: false,
    darkOnly: true,
    minValid: 300,
    formatVal: (v) => (v < 120 ? `${v} s` : (fmtMmSs(v) || `${v} s`)),
  },
  {
    key: 'castleSec',
    label: 'Pase a Edad de los Castillos',
    shortLabel: 'Pase Castillos',
    icon: 'assets/brand/castle-v1.png',
    direction: 'lower',
    weeklyDeadband: 20,
    matchFloor: 10,
    useClock: true,
    isTc: false,
    darkOnly: false,
    minValid: 600,
    formatVal: (v) => (v < 120 ? `${v} s` : (fmtMmSs(v) || `${v} s`)),
  },
  {
    key: 'dbaDelaySec',
    label: 'Hacha de doble filo',
    shortLabel: 'Hacha doble filo',
    icon: 'assets/icons/wood.png',
    direction: 'lower',
    weeklyDeadband: 10,
    matchFloor: 5,
    useClock: false,
    isTc: false,
    darkOnly: false,
    minValid: 0,
    formatVal: (v) => `${v} s`,
  },
  {
    key: 'eapm',
    label: 'Ritmo efectivo (eAPM)',
    shortLabel: 'Ritmo efectivo',
    icon: 'assets/icons/postmatch/tempo.webp',
    direction: 'higher',
    weeklyDeadband: 2.5,
    matchFloor: 1.0,
    useClock: false,
    isTc: false,
    darkOnly: false,
    minValid: 1,
    formatVal: (v) => `${v} eAPM`,
  },
];

function isDarkStartEntry(entry) {
  const age = String(entry?.startingAge || 'dark').toLowerCase();
  return !age || age === 'dark' || age === 'standard';
}

function getValidWeeklyMetricValue(entry, spec) {
  if (!entry || !spec) return null;
  if (spec.darkOnly && !isDarkStartEntry(entry)) return null;
  const val = entry[spec.key];
  if (!Number.isFinite(val)) return null;
  if (val < spec.minValid) return null;
  return val;
}

function fmtLocalDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtLocalDateShort(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatWeeklyGainDelta(spec, rawDelta) {
  if (spec.key === 'eapm') {
    const rounded = Math.round(rawDelta * 10) / 10;
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${String(rounded).replace('.', ',')} eAPM`;
  }
  return fmtSignedSec(rawDelta, spec.useClock) || '0 s';
}

function buildHumanImpactLine(spec, deltaDisplay, improvementVal, villagersSaved) {
  if (spec.isTc) {
    if (villagersSaved != null && villagersSaved >= 0.1) {
      return `${deltaDisplay} · +${fmtVillagersEs(villagersSaved)} ganados`;
    }
    return `${deltaDisplay} menos pausa en el Centro Urbano`;
  }
  if (spec.key === 'feudalSec') return `${deltaDisplay} antes en Edad Feudal`;
  if (spec.key === 'castleSec') return `${deltaDisplay} antes en Castillos`;
  if (spec.key === 'dbaDelaySec') return `${deltaDisplay} más rápido al pisar Feudal`;
  if (spec.key === 'eapm') return `+${String(Math.round(improvementVal * 10) / 10).replace('.', ',')} acciones útiles por minuto`;
  return deltaDisplay;
}

function computeWeeklyProgress(allEntries = [], { nowMs = Date.now(), selectedMatchId = null } = {}) {
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const nowDate = new Date(safeNowMs);
  const Y = nowDate.getFullYear();
  const M = nowDate.getMonth();
  const D = nowDate.getDate();

  // Exact 7 local calendar days ending today (D-6 .. D0)
  const dayMeta = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const startDate = new Date(Y, M, D + offset);
    const endDate = new Date(Y, M, D + offset + 1);
    const isToday = offset === 0;
    dayMeta.push({
      dateKey: fmtLocalDateKey(startDate),
      dayShort: DAY_SHORT_ES[startDate.getDay()],
      dayLabel: isToday ? 'Hoy' : DAY_SHORT_ES[startDate.getDay()],
      dateShort: fmtLocalDateShort(startDate),
      isToday,
      startMs: startDate.getTime(),
      endMs: endDate.getTime(),
    });
  }
  const windowStartMs = dayMeta[0].startMs;
  const windowEndMs = dayMeta[6].endMs;

  let undatedExcludedCount = 0;
  const datedEntries = [];
  for (const e of Array.isArray(allEntries) ? allEntries : []) {
    if (!e || !e.hasValidTimestamp || !Number.isFinite(e.playedAtMs)) {
      undatedExcludedCount += 1;
      continue;
    }
    const bucketMs = e.playedAtMs > safeNowMs ? safeNowMs : e.playedAtMs;
    datedEntries.push({ ...e, _bucketMs: bucketMs });
  }
  datedEntries.sort((a, b) => b._bucketMs - a._bucketMs);

  const weekEntries = datedEntries.filter((e) => e._bucketMs >= windowStartMs && e._bucketMs < windowEndMs);
  const priorEntries = datedEntries.filter((e) => e._bucketMs < windowStartMs);
  const priorBaselinePool = priorEntries.slice(0, 40);

  const W = weekEntries.length;
  const P = priorEntries.length;

  let comparisonMode = 'cold_start';
  if (W >= 1 && P >= 1) comparisonMode = 'prior_baseline';
  else if (W >= 2 && P === 0) comparisonMode = 'within_week_split';

  const wins = weekEntries.filter((e) => e.won === true).length;
  const losses = weekEntries.filter((e) => e.won === false).length;

  const chronoWeek = [...weekEntries].sort((a, b) => a._bucketMs - b._bucketMs);
  const splitIdx = Math.floor(W / 2);
  const earlyHalf = comparisonMode === 'within_week_split' ? chronoWeek.slice(0, splitIdx) : [];
  const recentHalf = comparisonMode === 'within_week_split' ? chronoWeek.slice(splitIdx) : [];

  const baselineSampleUsed = comparisonMode === 'prior_baseline'
    ? priorBaselinePool.length
    : comparisonMode === 'within_week_split'
      ? earlyHalf.length
      : 0;

  const baselineLabel = comparisonMode === 'prior_baseline'
    ? 'vs tu base previa'
    : comparisonMode === 'within_week_split'
      ? 'vs inicio de esta semana'
      : null;

  const baselineDetail = comparisonMode === 'prior_baseline'
    ? `${W} ${W === 1 ? 'partida' : 'partidas'} esta semana vs ${priorBaselinePool.length} previas`
    : comparisonMode === 'within_week_split'
      ? `Últimas ${recentHalf.length} vs primeras ${earlyHalf.length} partidas de esta semana (sin historial previo)`
      : null;

  // Pre-compute fixed pre-week baseline medians for Case A
  const priorMedians = {};
  const priorBestByKey = {};
  const priorCountByKey = {};
  if (comparisonMode === 'prior_baseline') {
    for (const spec of WEEKLY_METRIC_SPECS) {
      const vals = priorBaselinePool.map((e) => getValidWeeklyMetricValue(e, spec)).filter((v) => v != null);
      priorCountByKey[spec.key] = vals.length;
      if (vals.length) {
        priorMedians[spec.key] = median(vals);
        priorBestByKey[spec.key] = spec.direction === 'lower' ? Math.min(...vals) : Math.max(...vals);
      }
    }
  }

  // 1. Weekly gains[] + steady metrics tracking (strict deadband, zero fabrication)
  const gains = [];
  const steadyMetrics = [];
  let regressedCount = 0;
  const pbKeysThisWeek = new Set();
  const pbMatchIds = new Set();
  const milestones = [];

  if (comparisonMode !== 'cold_start') {
    const compareNowPool = comparisonMode === 'prior_baseline' ? weekEntries : recentHalf;
    const compareBeforePool = comparisonMode === 'prior_baseline' ? priorBaselinePool : earlyHalf;

    for (const spec of WEEKLY_METRIC_SPECS) {
      const nowVals = compareNowPool.map((e) => getValidWeeklyMetricValue(e, spec)).filter((v) => v != null);
      const beforeVals = compareBeforePool.map((e) => getValidWeeklyMetricValue(e, spec)).filter((v) => v != null);
      if (!nowVals.length || !beforeVals.length) continue;

      const nowMed = median(nowVals);
      const beforeMed = median(beforeVals);
      if (!Number.isFinite(nowMed) || !Number.isFinite(beforeMed)) continue;

      const rawDelta = Math.round((nowMed - beforeMed) * 10) / 10;
      const improvementVal = Math.round((spec.direction === 'lower' ? (beforeMed - nowMed) : (nowMed - beforeMed)) * 10) / 10;

      // Check Personal Best broken this week (Case A only, >= 2 prior samples, strictly beats by >= 1)
      let brokePbThisWeek = false;
      if (comparisonMode === 'prior_baseline' && (priorCountByKey[spec.key] || 0) >= 2 && Number.isFinite(priorBestByKey[spec.key])) {
        let bestWeekEntry = null;
        let bestWeekVal = null;
        for (const e of weekEntries) {
          const v = getValidWeeklyMetricValue(e, spec);
          if (v == null) continue;
          if (bestWeekVal == null || (spec.direction === 'lower' ? v < bestWeekVal : v > bestWeekVal)) {
            bestWeekVal = v;
            bestWeekEntry = e;
          }
        }
        const prevBest = priorBestByKey[spec.key];
        const pbDiff = bestWeekVal != null
          ? (spec.direction === 'lower' ? (prevBest - bestWeekVal) : (bestWeekVal - prevBest))
          : 0;
        if (bestWeekEntry && pbDiff >= 1) {
          brokePbThisWeek = true;
          pbKeysThisWeek.add(spec.key);
          pbMatchIds.add(String(bestWeekEntry.matchId));
          milestones.push({
            id: `pb_${spec.key}`,
            kind: 'personal_best',
            metricKey: spec.key,
            title: `Nuevo récord en ${spec.label}`,
            valueDisplay: spec.formatVal(bestWeekVal),
            prevBestDisplay: spec.formatVal(prevBest),
            detail: `${spec.formatVal(bestWeekVal)} en ${bestWeekEntry.mapName} (${bestWeekEntry.civName}) · récord anterior ${spec.formatVal(prevBest)}`,
            matchId: String(bestWeekEntry.matchId),
            mapName: bestWeekEntry.mapName,
            civName: bestWeekEntry.civName,
          });
        }
      }

      if (improvementVal > spec.weeklyDeadband) {
        const deltaDisplay = formatWeeklyGainDelta(spec, rawDelta);
        const villagersSaved = spec.isTc ? Math.round((improvementVal / 25) * 10) / 10 : null;
        const villagersSavedDisplay = (villagersSaved != null && villagersSaved >= 0.1)
          ? `+${fmtVillagersEs(villagersSaved)}`
          : null;
        const proofNote = comparisonMode === 'prior_baseline'
          ? (nowVals.length === 1
              ? `1 partida esta semana vs mediana de ${beforeVals.length} previas`
              : `Mediana de ${nowVals.length} partidas esta semana vs ${beforeVals.length} previas`)
          : `Últimas ${nowVals.length} vs primeras ${beforeVals.length} partidas de esta semana`;
        gains.push({
          metricKey: spec.key,
          label: spec.label,
          shortLabel: spec.shortLabel,
          icon: spec.icon,
          direction: spec.direction,
          beforeVal: beforeMed,
          nowVal: nowMed,
          rawDelta,
          improvementVal,
          beforeDisplay: spec.formatVal(beforeMed),
          nowDisplay: spec.formatVal(nowMed),
          deltaDisplay,
          humanImpact: buildHumanImpactLine(spec, deltaDisplay, improvementVal, villagersSaved),
          villagersSaved,
          villagersSavedDisplay,
          isPersonalBest: brokePbThisWeek,
          weekSampleCount: nowVals.length,
          baselineSampleCount: beforeVals.length,
          confidence: (nowVals.length >= 2 && beforeVals.length >= 3) ? 'high' : 'initial',
          proofNote,
          _rankScore: improvementVal / spec.weeklyDeadband + (brokePbThisWeek ? 0.5 : 0),
        });
      } else if (improvementVal >= -spec.weeklyDeadband) {
        steadyMetrics.push({
          metricKey: spec.key,
          label: spec.label,
          nowDisplay: spec.formatVal(nowMed),
          beforeDisplay: spec.formatVal(beforeMed),
        });
      } else {
        regressedCount += 1;
      }
    }
  }

  gains.sort((a, b) => b._rankScore - a._rankScore);
  for (const g of gains) delete g._rankScore;

  // Additional verified habit milestones (Zero Town Bell & Blacksmith Ready)
  const bellMeasured = weekEntries.filter((e) => Number.isFinite(e.townBells));
  const zeroBellCount = bellMeasured.filter((e) => e.townBells === 0).length;
  if (bellMeasured.length >= 2 && (zeroBellCount === bellMeasured.length || zeroBellCount >= 3)) {
    milestones.push({
      id: 'clean_town_bell',
      kind: 'clean_town_bell',
      metricKey: null,
      title: 'Defensa limpia sin Campana urbana',
      valueDisplay: `${zeroBellCount}/${bellMeasured.length} partidas`,
      prevBestDisplay: null,
      detail: `Defendiste sin paralizar tu economía con Campana urbana en ${zeroBellCount} de ${bellMeasured.length} partidas esta semana.`,
      matchId: null,
      mapName: null,
      civName: null,
    });
  }
  const eqMeasured = weekEntries.filter((e) => typeof e.wellEquipped === 'boolean');
  const eqReadyCount = eqMeasured.filter((e) => e.wellEquipped === true).length;
  if (eqMeasured.length >= 2 && eqReadyCount >= 2 && (eqReadyCount / eqMeasured.length) >= 0.6) {
    milestones.push({
      id: 'blacksmith_ready',
      kind: 'blacksmith_ready',
      metricKey: null,
      title: 'Ejército con mejoras de Herrería al día',
      valueDisplay: `${eqReadyCount}/${eqMeasured.length} partidas`,
      prevBestDisplay: null,
      detail: `Llegaste a los choques con tus mejoras de Herrería clave al día en ${eqReadyCount} de ${eqMeasured.length} partidas.`,
      matchId: null,
      mapName: null,
      civName: null,
    });
  }
  const topMilestones = milestones.slice(0, 3);

  // 2. Per-match evaluations (zero future leakage!) and 7-day local calendar buckets
  const matchEvalById = new Map();
  let bestSingleFlash = null;

  for (let i = 0; i < chronoWeek.length; i += 1) {
    const e = chronoWeek[i];
    let refMedians = null;
    if (comparisonMode === 'prior_baseline') {
      refMedians = priorMedians;
    } else if (comparisonMode === 'within_week_split' && i >= 1) {
      const earlier = chronoWeek.slice(0, i);
      refMedians = {};
      for (const spec of WEEKLY_METRIC_SPECS) {
        const vals = earlier.map((x) => getValidWeeklyMetricValue(x, spec)).filter((v) => v != null);
        if (vals.length) refMedians[spec.key] = median(vals);
      }
    }

    let improvedCount = 0;
    let comparedCount = 0;
    let bestMetricBeat = null;

    if (refMedians) {
      for (const spec of WEEKLY_METRIC_SPECS) {
        const curVal = getValidWeeklyMetricValue(e, spec);
        const refVal = refMedians[spec.key];
        if (curVal == null || !Number.isFinite(refVal)) continue;
        comparedCount += 1;
        const diff = spec.direction === 'lower' ? (refVal - curVal) : (curVal - refVal);
        if (diff > spec.matchFloor) {
          improvedCount += 1;
          const sig = diff / spec.matchFloor;
          if (!bestMetricBeat || sig > bestMetricBeat.sig) {
            const rawD = Math.round((curVal - refVal) * 10) / 10;
            bestMetricBeat = {
              sig,
              text: `${spec.shortLabel}: ${spec.formatVal(curVal)} (${formatWeeklyGainDelta(spec, rawD)} vs base)`,
            };
          }
        }
      }
    }

    const ev = {
      matchId: String(e.matchId),
      improvedCount,
      comparedCount,
      hasComparison: comparedCount > 0,
      hasPersonalBest: pbMatchIds.has(String(e.matchId)),
      peakText: bestMetricBeat ? bestMetricBeat.text : null,
      peakSig: bestMetricBeat ? bestMetricBeat.sig : 0,
      entry: e,
    };
    matchEvalById.set(String(e.matchId), ev);

    if (ev.improvedCount >= 1) {
      if (
        !bestSingleFlash
        || ev.improvedCount > bestSingleFlash.improvedCount
        || (ev.improvedCount === bestSingleFlash.improvedCount && ev.peakSig > bestSingleFlash.peakSig)
      ) {
        bestSingleFlash = ev;
      }
    }
  }

  let totalImprovementsWeek = 0;
  let totalComparedWeek = 0;
  let activeDaysCount = 0;

  const dailySeries = dayMeta.map((dm) => {
    const dayMatches = chronoWeek.filter((e) => e._bucketMs >= dm.startMs && e._bucketMs < dm.endMs);
    const matchCount = dayMatches.length;
    if (matchCount > 0) activeDaysCount += 1;
    const dWins = dayMatches.filter((e) => e.won === true).length;
    const dLosses = dayMatches.filter((e) => e.won === false).length;

    let improvedTotal = 0;
    let comparedTotal = 0;
    let comparedMatchCount = 0;
    let hasPbDay = false;
    let bestDayMatch = null;
    let bestPeak = null;
    let containsSelectedMatch = false;

    for (const e of dayMatches) {
      if (selectedMatchId != null && String(e.matchId) === String(selectedMatchId)) {
        containsSelectedMatch = true;
      }
      const ev = matchEvalById.get(String(e.matchId));
      if (!ev) continue;
      if (ev.hasPersonalBest) hasPbDay = true;
      if (ev.hasComparison) {
        comparedMatchCount += 1;
        improvedTotal += ev.improvedCount;
        comparedTotal += ev.comparedCount;
      }
      if (ev.peakText && (!bestPeak || ev.peakSig > bestPeak.sig)) {
        bestPeak = { sig: ev.peakSig, text: ev.peakText };
      }
      if (
        !bestDayMatch
        || ev.improvedCount > bestDayMatch.improvedCount
        || (ev.improvedCount === bestDayMatch.improvedCount && e.won === true && bestDayMatch.entry.won !== true)
        || (ev.improvedCount === bestDayMatch.improvedCount && e._bucketMs > bestDayMatch.entry._bucketMs)
      ) {
        bestDayMatch = ev;
      }
    }

    totalImprovementsWeek += improvedTotal;
    totalComparedWeek += comparedTotal;

    const hasComparison = comparedMatchCount > 0 && comparedTotal > 0;
    const isBaselineOnly = matchCount > 0 && !hasComparison;
    const improvedAvg = hasComparison ? Math.round((improvedTotal / comparedMatchCount) * 10) / 10 : null;
    const measuredAvg = hasComparison ? Math.round((comparedTotal / comparedMatchCount) * 10) / 10 : null;
    const improvedSharePct = hasComparison ? Math.round((improvedTotal / comparedTotal) * 100) : null;

    return {
      dateKey: dm.dateKey,
      dayShort: dm.dayShort,
      dayLabel: dm.dayLabel,
      dateShort: dm.dateShort,
      isToday: dm.isToday,
      matchCount,
      wins: dWins,
      losses: dLosses,
      hasMatches: matchCount > 0,
      hasComparison,
      isBaselineOnly,
      hasPersonalBest: hasPbDay,
      isBestDay: false,
      containsSelectedMatch,
      improvedFundamentalsTotal: improvedTotal,
      comparedFundamentalsTotal: comparedTotal,
      improvedFundamentalsAvg: improvedAvg,
      measuredFundamentalsAvg: measuredAvg,
      improvedSharePct,
      peakHighlight: bestPeak ? bestPeak.text : null,
      bestMatchId: bestDayMatch ? bestDayMatch.matchId : null,
      bestMatchSummary: bestDayMatch ? `${bestDayMatch.entry.mapName} · ${bestDayMatch.entry.civName}` : null,
    };
  });

  // Identify best day strictly among days with real improvements > 0
  let bestDayObj = null;
  for (const d of dailySeries) {
    if (!d.hasComparison || d.improvedFundamentalsTotal <= 0) continue;
    if (
      !bestDayObj
      || (d.improvedFundamentalsAvg || 0) > (bestDayObj.improvedFundamentalsAvg || 0)
      || (d.improvedFundamentalsAvg === bestDayObj.improvedFundamentalsAvg && d.improvedFundamentalsTotal > bestDayObj.improvedFundamentalsTotal)
      || (d.improvedFundamentalsAvg === bestDayObj.improvedFundamentalsAvg && d.improvedFundamentalsTotal === bestDayObj.improvedFundamentalsTotal && d.dateKey > bestDayObj.dateKey)
    ) {
      bestDayObj = d;
    }
  }
  if (bestDayObj) bestDayObj.isBestDay = true;
  const bestDay = bestDayObj
    ? {
        dateKey: bestDayObj.dateKey,
        dayShort: bestDayObj.dayShort,
        dayLabel: bestDayObj.dayLabel,
        dateShort: bestDayObj.dateShort,
        improvedFundamentalsAvg: bestDayObj.improvedFundamentalsAvg,
        measuredFundamentalsAvg: bestDayObj.measuredFundamentalsAvg,
        improvedFundamentalsTotal: bestDayObj.improvedFundamentalsTotal,
        matchCount: bestDayObj.matchCount,
        peakHighlight: bestDayObj.peakHighlight,
        bestMatchId: bestDayObj.bestMatchId,
      }
    : null;

  // 3. Honest status, encouragingFacts (for Case D) and supportive Spanish copy
  let status = 'no_replays_week';
  if (W === 0 && P === 0) status = 'no_replays_week';
  else if (W === 0 && P >= 1) status = 'idle_week';
  else if (W === 1 && P === 0) status = 'calibrating_first_match';
  else if (gains.length > 0) status = 'improved';
  else if (steadyMetrics.length >= 2 && steadyMetrics.length >= regressedCount) status = 'steady_week';
  else status = 'tough_week';

  const encouragingFacts = [];
  if (status === 'steady_week' || status === 'tough_week') {
    if (steadyMetrics.length > 0) {
      const s = steadyMetrics[0];
      encouragingFacts.push({
        kind: 'steady',
        metricKey: s.metricKey,
        title: `Sostuviste firme tu ${s.label}`,
        detail: `${s.nowDisplay} esta semana frente a tu base de ${s.beforeDisplay} (sin retroceso).`,
      });
    }
    if (bestSingleFlash) {
      encouragingFacts.push({
        kind: 'flash',
        metricKey: null,
        matchId: bestSingleFlash.matchId,
        title: `Destello real en ${bestSingleFlash.entry.mapName} (${bestSingleFlash.entry.civName})`,
        detail: `Superaste tu base en ${bestSingleFlash.improvedCount}/${bestSingleFlash.comparedCount} fundamentos${bestSingleFlash.peakText ? ` · ${bestSingleFlash.peakText}` : ''}.`,
      });
    }
    if (zeroBellCount >= 2 && bellMeasured.length >= 2) {
      encouragingFacts.push({
        kind: 'discipline',
        metricKey: null,
        title: 'Defensa ordenada sin Campana urbana',
        detail: `Evitaste la Campana urbana en ${zeroBellCount} de ${bellMeasured.length} partidas medidas esta semana.`,
      });
    }
    if (encouragingFacts.length < 2) {
      encouragingFacts.push({
        kind: 'volume',
        metricKey: null,
        title: 'Constancia de entrenamiento activa',
        detail: `Sumaste ${W} ${W === 1 ? 'partida analizada' : 'partidas analizadas'} en ${activeDaysCount} ${activeDaysCount === 1 ? 'día' : 'días'} esta semana.`,
      });
    }
  }

  // Quiet-week anchor: remind the player of their real historical best record
  let quietAnchor = null;
  if (status === 'idle_week' && priorBaselinePool.length > 0) {
    for (const spec of WEEKLY_METRIC_SPECS) {
      const vals = priorBaselinePool.map((e) => getValidWeeklyMetricValue(e, spec)).filter((v) => v != null);
      if (!vals.length) continue;
      const bestV = spec.direction === 'lower' ? Math.min(...vals) : Math.max(...vals);
      quietAnchor = {
        metricKey: spec.key,
        label: spec.label,
        bestDisplay: spec.formatVal(bestV),
      };
      break;
    }
  }

  let headline = 'Tu semana está lista para empezar';
  let subhead = 'Analizá tu primera partida en Postmatch para ver tus mejoras reales día por día.';
  if (status === 'improved') {
    headline = gains.length === 1
      ? `Esta semana mejoraste tu ${gains[0].label}`
      : `Esta semana mejoraste ${gains.length} fundamentos reales`;
    subhead = `${baselineDetail}. Cada mejora supera el margen de ruido real.`;
  } else if (status === 'steady_week') {
    headline = 'Semana sólida: consolidaste tu nivel actual';
    subhead = `${baselineDetail}. Sostuviste tus fundamentos estables sin retrocesos claros.`;
  } else if (status === 'tough_week') {
    headline = 'Semana exigente, pero sumaste práctica y destellos reales';
    subhead = `${baselineDetail}. Tus promedios semanales aún no suben, pero ya tenés referencias claras para rebotar.`;
  } else if (status === 'calibrating_first_match') {
    headline = 'Primera marca semanal registrada';
    subhead = 'Jugá 1 partida más esta semana para comparar tu avance real día por día.';
  } else if (status === 'idle_week') {
    headline = 'Semana de descanso · Tu base previa sigue guardada';
    subhead = `Sin partidas analizadas en los últimos 7 días. Tenés ${P} ${P === 1 ? 'partida previa lista' : 'partidas previas listas'} para medir tu regreso.`;
  }

  return {
    windowDays: 7,
    windowStartDateKey: dayMeta[0].dateKey,
    windowEndDateKey: dayMeta[6].dateKey,
    status,
    comparisonMode,
    hasWeeklyActivity: W > 0,
    hasComparison: comparisonMode !== 'cold_start',
    hasGains: gains.length > 0,
    headline,
    subhead,
    baselineLabel,
    baselineDetail,
    weekMatchCount: W,
    priorMatchCount: P,
    baselineSampleUsed,
    activeDaysCount,
    wins,
    losses,
    weeklyPbsCount: pbKeysThisWeek.size,
    undatedExcludedCount,
    totalImprovementsWeek,
    totalComparedWeek,
    bestDay,
    gains,
    milestones: topMilestones,
    encouragingFacts: encouragingFacts.slice(0, 3),
    quietAnchor,
    dailySeries,
  };
}

function computeHighEloTelemetry(records = [], selectedMatchId = null, options = {}) {
  const nowMs = Number.isFinite(options?.nowMs) ? options.nowMs : Date.now();
  const seenIds = new Set();
  const allEntries = [];
  for (const r of Array.isArray(records) ? records : []) {
    const entry = extractRealReplayEntry(r, nowMs);
    if (!entry) continue;
    const dedupKey = entry.matchId ? `id:${entry.matchId}` : `ts:${entry.playedAtMs || ''}:${entry.durationSeconds}:${entry.mapName}`;
    if (seenIds.has(dedupKey)) continue;
    seenIds.add(dedupKey);
    allEntries.push(entry);
  }

  const entries = allEntries.slice(0, 20);

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
      villagerLossSummary: null,
      winLossComparison: { hasComparison: false, isReliable: false, winsCount: 0, lossesCount: 0, rows: [], biggestDropOff: null },
      primaryDiagnosis: null,
      weeklyProgress: computeWeeklyProgress(allEntries, { nowMs, selectedMatchId }),
    };
  }

  const currentEntry = (selectedMatchId && entries.find((e) => String(e.matchId) === String(selectedMatchId))) || entries[0];

  const replays = entries.slice(0, 8).map((e) => ({
    matchId: e.matchId,
    mapName: e.mapName,
    civName: e.civName,
    civSlug: e.civSlug,
    opening: e.opening,
    won: e.won,
    durationSeconds: e.durationSeconds,
    durationDisplay: e.durationDisplay,
    startedAt: e.startedAt,
    label: `#${e.matchId} · ${e.mapName} · ${e.civName}`,
  }));

  const metrics = [
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'tcIdleDarkSec',
      category: 'ECONOMÍA · ALTA EDAD MEDIA',
      title: 'Inactividad del Centro Urbano (Alta Edad)',
      explanation: 'Segundos exactos medidos en que el Centro Urbano no produjo aldeanos ni investigó Telar o Edad Feudal.',
      icon: 'assets/brand/review-town-center-v1.png',
      direction: 'lower',
      formatVal: (v) => `${v} s`,
      useClockDelta: false,
      deadband: 4,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'tcIdleFeudalPerTcSec',
      category: 'ECONOMÍA · EDAD FEUDAL',
      title: 'Inactividad por Centro Urbano (Feudal)',
      explanation: 'Segundos de pausa por Centro Urbano activo durante Edad Feudal, descontando Carretilla y Castillos.',
      icon: 'assets/icons/postmatch/economy.webp',
      direction: 'lower',
      formatVal: (v) => `${v} s`,
      useClockDelta: false,
      deadband: 5,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'feudalSec',
      category: 'TIEMPO DE AVANCE · EDAD FEUDAL',
      title: 'Pase a Edad Feudal',
      explanation: 'Minuto y segundo exacto de partida en que se completó la investigación de Edad Feudal.',
      icon: 'assets/brand/feudal-v1.png',
      direction: 'lower',
      formatVal: (v) => (v < 120 ? `${v} s` : (fmtMmSs(v) || `${v} s`)),
      useClockDelta: true,
      deadband: 10,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'castleSec',
      category: 'TIEMPO DE AVANCE · EDAD DE LOS CASTILLOS',
      title: 'Pase a Edad de los Castillos',
      explanation: 'Minuto y segundo exacto de partida en que alcanzaste la Edad de los Castillos.',
      icon: 'assets/brand/castle-v1.png',
      direction: 'lower',
      formatVal: (v) => (v < 120 ? `${v} s` : (fmtMmSs(v) || `${v} s`)),
      useClockDelta: true,
      deadband: 20,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'dbaDelaySec',
      category: 'TECNOLOGÍAS · MADERA',
      title: 'Hacha de doble filo',
      explanation: 'Segundos transcurridos desde que pisaste Edad Feudal hasta investigar Hacha de doble filo en el Campamento maderero.',
      icon: 'assets/icons/wood.png',
      direction: 'lower',
      formatVal: (v) => `${v} s`,
      useClockDelta: false,
      deadband: 10,
    }),
    buildMetricSummary({
      entries,
      currentEntry,
      key: 'eapm',
      category: 'RITMO MECÁNICO · COMANDOS REALES',
      title: 'Ritmo efectivo (eAPM)',
      explanation: 'Promedio de acciones efectivas por minuto registradas en la partida (sin contar clics repetidos en <150 ms).',
      icon: 'assets/icons/postmatch/tempo.webp',
      direction: 'higher',
      formatVal: (v) => `${v} eAPM`,
      useClockDelta: false,
      deadband: 2.5,
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
      actionTab: 'orders',
      actionLabel: 'Practicar apertura en vivo →',
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

  const combinedVillagersLost = (currentEntry.villagersLostDark != null || currentEntry.villagersLostFeudalPerTc != null)
    ? Math.round(((currentEntry.villagersLostDark || 0) + (currentEntry.villagersLostFeudalPerTc || 0)) * 10) / 10
    : null;
  const villagerLossSummary = {
    darkVillagers: currentEntry.villagersLostDark,
    feudalVillagersPerTc: currentEntry.villagersLostFeudalPerTc,
    combinedEarlyVillagers: combinedVillagersLost,
    combinedDisplay: combinedVillagersLost != null ? fmtVillagersEs(combinedVillagersLost) : '—',
  };

  const winLossComparison = buildWinLossComparison(entries);
  const primaryDiagnosis = buildPrimaryDiagnosis({ currentEntry, metrics, bottlenecks, sampleSize: entries.length });
  const resolvedWeeklyProgress = computeWeeklyProgress(allEntries, { nowMs, selectedMatchId: currentEntry.matchId });

  return {
    hasData: true,
    sampleSize: entries.length,
    selectedMatchId: currentEntry.matchId,
    selectedReplay: currentEntry,
    replays,
    metrics,
    axes,
    bottlenecks,
    villagerLossSummary,
    winLossComparison,
    primaryDiagnosis,
    weeklyProgress: resolvedWeeklyProgress,
  };
}

function roundSym(x) {
  if (!Number.isFinite(x) || x === 0) return 0;
  const r = Math.round(Math.abs(x));
  return r === 0 ? 0 : (x < 0 ? -r : r);
}

function getCivProfile(slug) {
  return CIV_MATCHUP_PROFILES[slug] || {
    ecoByAge: [60, 64, 66, 66],
    openings: ['scouts', 'archers'],
    lineMods: {},
    waivedTechs: [],
    uniqueUnit: null,
    keyUniqueTech: '',
  };
}

function hasTechOrNode(slug, name, age) {
  const nodes = CIV_TECH[slug]?.nodes;
  if (!nodes) return false;
  if (slug === 'gurjaras' && name === 'Scout Cavalry') return false;
  return Number.isInteger(nodes[name]) && nodes[name] <= age;
}

/**
 * Evaluates a single unit line (including `unique`) for `slug` at `age` (2..4).
 * 100% tech-tree legal, applies civ bonus waivers & modifiers, and strictly caps
 * outdated lines (e.g. Turks Feudal Spearman/Skirmisher in Castle/Imp, Spanish Archer in Castle).
 */
function evalCivLine(slug, lineKey, age) {
  const nodes = CIV_TECH[slug]?.nodes;
  const prof = getCivProfile(slug);
  const spec = MATCHUP_LINES[lineKey];
  if (!nodes || !spec) return null;

  // Unique Unit line (Castle & Imperial)
  if (spec.isUnique) {
    const uu = prof.uniqueUnit;
    if (!uu || !hasTechOrNode(slug, uu.node, age)) return null;
    const baseScore = age >= 4 ? uu.power : Math.max(60, uu.power - 4);
    return {
      key: 'unique',
      label: uu.es,
      primary: true,
      isUnique: true,
      unitNode: uu.node,
      unitEs: uu.es,
      role: uu.role,
      score: clamp(Math.round(baseScore), 0, 100),
      rawScore: clamp(Math.round(baseScore), 0, 100),
      outdated: false,
      tierCoverage: 1,
      missingTechs: [],
      missingTechsEs: [],
      counters: uu.counters || [],
      counteredBy: uu.counteredBy || [],
    };
  }

  const eligibleTiers = spec.tiers.filter(([at]) => at <= age);
  if (!eligibleTiers.length) return null;

  let highestIdx = -1;
  let chosenNode = null;
  let hasCurrentAgeTier = false;
  let highestUnlockAge = 0;

  for (let i = 0; i < eligibleTiers.length; i += 1) {
    const [tierAge, ...names] = eligibleTiers[i];
    const hit = names.find((n) => hasTechOrNode(slug, n, age));
    if (hit) {
      highestIdx = i;
      chosenNode = hit;
      highestUnlockAge = Math.max(highestUnlockAge, tierAge);
      if (tierAge === age) hasCurrentAgeTier = true;
    }
  }
  if (!chosenNode) return null;

  const expectedMaxAge = Math.max(...eligibleTiers.map(([at]) => at));
  const ageLag = expectedMaxAge - highestUnlockAge; // 0 = current tier, 1 = 1 age behind, 2 = 2 ages behind
  const tierCoverage = (highestIdx + 1) / eligibleTiers.length;

  const waived = new Set(prof.waivedTechs || []);
  const reqTechs = spec.techs.filter(([, at]) => at <= age);
  const missingTechs = reqTechs
    .filter(([tName]) => !hasTechOrNode(slug, tName, age) && !waived.has(tName))
    .map(([tName]) => tName);
  const techCoverage = reqTechs.length ? (1 - missingTechs.length / reqTechs.length) : 1;

  const bonusMod = Number(prof.lineMods?.[lineKey] || 0);
  let score = Math.round(42 + 24 * tierCoverage + 18 * techCoverage + bonusMod);

  // Strict penalty for missing current-age base upgrade (no more 85% Turks Feudal Spearmen in Imp!)
  let outdated = false;
  if (ageLag >= 2) {
    score = Math.min(score, 16);
    outdated = true;
  } else if (ageLag === 1 && !hasCurrentAgeTier) {
    // Exception: Monks only have 1 tier (Age 3) and Scouts are viable raid units
    if (lineKey !== 'monks') {
      score = Math.min(score, 34);
      outdated = true;
    }
  }

  // Clamp cleanly into 0..100
  score = clamp(score, 0, 100);

  return {
    key: lineKey,
    label: spec.label,
    primary: Boolean(spec.primary),
    isUnique: false,
    unitNode: chosenNode,
    unitEs: unitEs(chosenNode),
    score,
    rawScore: score,
    outdated,
    tierCoverage,
    missingTechs,
    missingTechsEs: missingTechs.map((t) => TECH_NAME_ES_MAP[t] || t),
  };
}

function lineArchetype(lineObj) {
  if (!lineObj) return '';
  if (!lineObj.isUnique) return lineObj.key;
  const map = {
    archer: 'archers',
    cav_archer: 'cavarchers',
    heavy_cav: 'knights',
    siege_cav: 'knights',
    gunpowder: 'gunpowder',
    elephant: 'elephants',
    raider: 'scouts',
    infantry: 'infantry',
    anti_infantry: 'infantry',
    anti_cavalry: 'spears',
    anti_archer: 'anti_archer',
  };
  return map[lineObj.role] || 'unique';
}

/**
 * Symmetric combat effectiveness of `attackerLine` (from `attackerSlug`) against
 * `defenderLine` (from `defenderSlug`) in `age`. Incorporates Unique Units directly!
 */
function counterEff(attackerSlug, attackerLine, defenderSlug, defenderLine) {
  if (!attackerLine || !defenderLine || attackerLine.outdated) return 0;
  const attArch = lineArchetype(attackerLine);
  const defArch = lineArchetype(defenderLine);
  let eff = 0;

  // Guard: if defender is a Unique Unit that explicitly counters attacker's archetype
  // (e.g., Huskarl / Ghulam / Shrivamsha vs Longbowman), attacker NEVER counters defender!
  if (defenderLine.isUnique && (defenderLine.counters || []).includes(attArch)) {
    return 0;
  }

  // 1. Standard unit-line counter matrix
  if (!attackerLine.isUnique && !defenderLine.isUnique) {
    eff = COUNTERS[defenderLine.key]?.[attackerLine.key] || 0;
  }

  // 2. Attacker is a Unique Unit -> check its explicit `counters` list
  if (attackerLine.isUnique) {
    if (!defenderLine.isUnique && (attackerLine.counters || []).includes(defenderLine.key)) {
      eff = Math.max(eff, 0.90);
    } else if (defenderLine.isUnique) {
      if ((defenderLine.counteredBy || []).includes(attArch)) {
        eff = Math.max(eff, 0.86);
      } else if (defArch !== 'anti_archer' && (attackerLine.counters || []).includes(defArch)) {
        eff = Math.max(eff, 0.80);
      }
    }
  }

  // 3. Defender is a Unique Unit -> check its explicit `counteredBy` list
  if (defenderLine.isUnique && !attackerLine.isUnique) {
    if ((defenderLine.counteredBy || []).includes(attackerLine.key)) {
      eff = Math.max(eff, 0.88);
    }
  }

  // Scale effectiveness by attacker's actual line quality (weak lines don't hard-counter)
  return eff * (attackerLine.score / 100);
}

/**
 * Authentic AoE2:DE meta viability offset by age so primary picks reflect real
 * high-ELO play (e.g., Feudal Scouts/Archers/Eagles/Champis/MaA-civs; Castle Knights/Xbow/CA/Camels/UUs;
 * Imperial Gold Carries/UUs/Gunpowder — never generic Longswordsmen or dead-end lines!).
 */
function metaViabilityWeight(slug, lineObj, age) {
  const prof = getCivProfile(slug);
  const k = lineObj.key;
  const lineMod = Number(prof.lineMods?.[k] || 0);
  if (lineObj.outdated) return -45;

  if (age === 2) {
    if (!lineObj.primary) return -28; // trash is support in Feudal, not standalone carry
    const openIdx = (prof.openings || []).indexOf(k);
    if (openIdx === 0) return 16;
    if (openIdx === 1) return 10;
    if (openIdx === 2) return 4;
    if (k === 'infantry') return -12; // non-MaA civs don't default to pure MaA
    return lineMod < 0 ? -8 : 0;
  }

  if (age === 3) {
    if (k === 'monks') return -18;
    if (!lineObj.primary) return -22;
    if (k === 'infantry') {
      // Longswords in Castle are only a default primary for dedicated infantry civs
      return lineMod >= 16 ? 4 : -22;
    }
    if (k === 'scouts') return -10; // Light Cav in Castle is mostly anti-monk/raid, not main army
    if (k === 'unique') return lineObj.score >= 88 ? 10 : 4;
    if (lineMod <= -6) return -14; // dead-end lines (e.g. Franks Crossbows, Bohemians Knights)
    if (['knights', 'archers', 'cavarchers', 'camels', 'eagles', 'champis', 'steppe', 'elephants', 'gunpowder'].includes(k)) {
      // Slightly penalize generic Knights without Bloodlines (unless civ has explicit bonus like Franks)
      if (k === 'knights' && lineMod <= 0 && !hasTechOrNode(slug, 'Bloodlines', 3)) return -4;
      return 8;
    }
    return 0;
  }

  // Age 4 (Imperial)
  if (k === 'monks') return -60; // NEVER recommend pure Monks as Imperial closing condition
  if (!lineObj.primary) return -20;
  if (k === 'infantry') {
    return lineMod >= 14 ? 8 : -10;
  }
  if (k === 'unique') return lineObj.score >= 88 ? 12 : 6;
  if (lineMod <= -6) return -12;
  return 6;
}

/**
 * Predicts a civilization's realistic top primary threats in `age` (slot-independent!).
 */
function getCivThreats(slug, age) {
  const lines = [];
  for (const key of Object.keys(MATCHUP_LINES)) {
    const ev = evalCivLine(slug, key, age);
    if (!ev || !ev.primary || ev.outdated) continue;
    const threatRank = ev.score + metaViabilityWeight(slug, ev, age);
    lines.push({ ...ev, threatRank });
  }
  return lines.sort((a, b) => (b.threatRank - a.threatRank) || a.key.localeCompare(b.key));
}

/**
 * Evaluates all legal lines for `mySlug` vs `rivalSlug` in `age`, returning:
 * - bestPrimary: smartest primary unit/carry (including Unique Unit when optimal!)
 * - complement: conditional counter/support unit ONLY when rival's actual threats/counters demand it (never forced!)
 * - offenseScore, defenseScore, uuScore: pure symmetric inputs for exact antisymmetric edge calculation
 */
function evaluateAgeMatchup(mySlug, rivalSlug, age) {
  const myAll = [];
  const rivalAll = [];
  for (const key of Object.keys(MATCHUP_LINES)) {
    const m = evalCivLine(mySlug, key, age);
    const r = evalCivLine(rivalSlug, key, age);
    if (m) myAll.push(m);
    if (r) rivalAll.push(r);
  }

  const rivalThreats = getCivThreats(rivalSlug, age);
  const rivTop1 = rivalThreats[0] || null;
  const rivTop2 = rivalThreats[1] || null;

  // Score each of my legal primary lines against rival's realistic threats & realistic counters
  const rivProf = getCivProfile(rivalSlug);
  const primaryCandidates = myAll
    .filter((m) => m.primary && !m.outdated)
    .map((m) => {
      const base = m.score + metaViabilityWeight(mySlug, m, age);
      const beat1 = rivTop1 ? counterEff(mySlug, m, rivalSlug, rivTop1) : 0;
      const beat2 = rivTop2 ? counterEff(mySlug, m, rivalSlug, rivTop2) : 0;
      const beatenBy1 = rivTop1 ? counterEff(rivalSlug, rivTop1, mySlug, m) : 0;
      const beatenBy2 = rivTop2 ? counterEff(rivalSlug, rivTop2, mySlug, m) : 0;

      // Rival's best legal non-outdated answer to `m` (excluding Imperial Monks!)
      let worstAnsEff = 0;
      let worstAnsLine = null;
      let sigAnsEff = 0;
      let sigAnsLine = null;
      for (const r of rivalAll) {
        if (r.outdated) continue;
        if (age === 4 && r.key === 'monks') continue;
        if (age === 3 && r.key === 'monks' && (rivProf.lineMods?.monks || 0) < 10) continue;
        const rawE = counterEff(rivalSlug, r, mySlug, m);
        const rMod = Number(rivProf.lineMods?.[r.key] || 0);
        const isSignature = r.isUnique || rMod >= 8 || (age === 4 && r.score >= 84 && !r.outdated);
        const weightedE = isSignature ? rawE * 1.18 : rawE;
        if (weightedE > worstAnsEff) {
          worstAnsEff = weightedE;
          worstAnsLine = r;
        }
        if (isSignature && rawE > sigAnsEff) {
          sigAnsEff = rawE;
          sigAnsLine = r;
        }
      }

      const fit = base + beat1 * 24 + beat2 * 10 - beatenBy1 * 26 - beatenBy2 * 11 - worstAnsEff * 14;
      return { ...m, fit, beat1, beatenBy1, worstAnsEff, worstAnsLine, sigAnsEff, sigAnsLine };
    })
    .sort((a, b) => (b.fit - a.fit) || a.key.localeCompare(b.key));

  const bestPrimary = primaryCandidates[0] || myAll.sort((a, b) => b.score - a.score)[0] || null;

  // Smart conditional complement — NEVER forced, NEVER redundant same-archetype!
  // Only add a 2nd unit when rival's actual #1 threat OR a signature/bonused rival counter genuinely punishes going mono-unit.
  let complement = null;
  let complementReason = '';
  if (bestPrimary && rivTop1) {
    const beatenBy1 = bestPrimary.beatenBy1 || 0;
    const sigAns = bestPrimary.sigAnsEff || 0;
    let shouldMix = false;
    let dangerLine = null;

    if (age === 2) {
      // Feudal: focused 1-unit opening unless rival's #1 threat OR bonused Feudal counter directly punishes it
      if (beatenBy1 >= 0.54) {
        shouldMix = true;
        dangerLine = rivTop1;
      } else if (sigAns >= 0.68 && bestPrimary.sigAnsLine) {
        shouldMix = true;
        dangerLine = bestPrimary.sigAnsLine;
      }
    } else if (age === 3) {
      // Castle: clean timing spike unless rival's #1 threat or signature/UU/bonused counter stops mono-unit
      if (beatenBy1 >= 0.52) {
        shouldMix = true;
        dangerLine = rivTop1;
      } else if (sigAns >= 0.64 && bestPrimary.sigAnsLine) {
        shouldMix = true;
        dangerLine = bestPrimary.sigAnsLine;
      }
    } else {
      // Imperial: late-game composition (Gold + Trash / Core + Siege / UU + Support) whenever rival threatens or hard-counters
      if (beatenBy1 >= 0.46) {
        shouldMix = true;
        dangerLine = rivTop1;
      } else if (sigAns >= 0.60 && bestPrimary.sigAnsLine) {
        shouldMix = true;
        dangerLine = bestPrimary.sigAnsLine;
      }
    }

    if (shouldMix && dangerLine) {
      const primArch = lineArchetype(bestPrimary);
      const supportPool = myAll
        .filter((m) => !m.outdated
          && m.key !== bestPrimary.key
          && lineArchetype(m) !== primArch
          && !(age === 4 && m.key === 'monks'))
        .map((m) => {
          const ansDanger = counterEff(mySlug, m, rivalSlug, dangerLine);
          const ansTop1 = counterEff(mySlug, m, rivalSlug, rivTop1);
          // Natural synergy: trash/siege/UU pairing over double-heavy-gold
          const synergyBonus = !m.primary ? 0.12 : (m.isUnique ? 0.08 : 0.02);
          const score = ansDanger * 0.68 + ansTop1 * 0.32 + synergyBonus + (m.score / 500);
          return { ...m, ansDanger, supportScore: score };
        })
        .filter((m) => m.ansDanger >= 0.45)
        .sort((a, b) => (b.supportScore - a.supportScore) || a.key.localeCompare(b.key));

      if (supportPool[0]) {
        complement = supportPool[0];
        complementReason = `para frenar ${dangerLine.unitEs}`;
      }
    }
  }

  // Symmetric power metrics for age-edge computation (zero slot bias!)
  const top2AvgFit = primaryCandidates.length
    ? (primaryCandidates.slice(0, 2).reduce((s, c) => s + c.fit, 0) / Math.min(2, primaryCandidates.length))
    : 55;

  let bestDefenseVsRiv1 = 45;
  if (rivTop1) {
    for (const m of myAll) {
      if (m.outdated) continue;
      if (age === 4 && m.key === 'monks') continue;
      const eff = counterEff(mySlug, m, rivalSlug, rivTop1) * 100;
      if (eff > bestDefenseVsRiv1) bestDefenseVsRiv1 = eff;
    }
  }

  const myUu = myAll.find((m) => m.isUnique);
  let uuImpact = 55;
  if (myUu && rivTop1) {
    const uuOff = counterEff(mySlug, myUu, rivalSlug, rivTop1) * 24;
    const uuDef = counterEff(rivalSlug, rivTop1, mySlug, myUu) * 18;
    uuImpact = clamp(myUu.score + uuOff - uuDef, 40, 115);
  }

  return {
    myAll,
    rivalAll,
    rivalThreats,
    rivTop1,
    bestPrimary,
    complement,
    complementReason,
    offenseScore: clamp(top2AvgFit, 20, 120),
    defenseScore: clamp(bestDefenseVsRiv1, 20, 100),
    uuScore: uuImpact,
  };
}

/**
 * Pure directional power score of `civA` against `civB` in `age` (1..4).
 * Guaranteed symmetric: power(A, B) - power(B, A) === -(power(B, A) - power(A, B)).
 */
function computeDirectionalPower(civA, civB, age, evalAB) {
  const profA = getCivProfile(civA);
  const eco = profA.ecoByAge?.[age - 1] ?? 64;
  if (age === 1) return eco;
  if (age === 2) {
    return 0.50 * eco + 0.32 * evalAB.offenseScore + 0.18 * evalAB.defenseScore;
  }
  if (age === 3) {
    return 0.36 * eco + 0.32 * evalAB.offenseScore + 0.16 * evalAB.defenseScore + 0.16 * evalAB.uuScore;
  }
  return 0.26 * eco + 0.34 * evalAB.offenseScore + 0.18 * evalAB.defenseScore + 0.22 * evalAB.uuScore;
}

function formatAgePlanAdvice(age, evalObj, rivalName) {
  const p = evalObj.bestPrimary;
  const c = evalObj.complement;
  const rivTop1 = evalObj.rivTop1;
  if (!p) return 'Sostené producción continua de aldeanos y control del mapa.';

  const unitLabel = p.isUnique ? `${p.unitEs} (Unidad única)` : p.unitEs;
  if (c) {
    const compLabel = c.isUnique ? `${c.unitEs} (Unidad única)` : c.unitEs;
    return `Base de ${unitLabel} + ${compLabel} ${evalObj.complementReason}${rivTop1 ? ` ante ${rivalName}` : ''}.`;
  }
  const rivHint = rivTop1 ? ` Presiona bien frente a ${rivTop1.unitEs} de ${rivalName}.` : '';
  if (age === 2) {
    return `Apertura limpia con ${unitLabel} sin dispersar economía.${rivHint}`;
  }
  const missingNote = p.missingTechsEs?.length
    ? ` Cuidá la falta de ${p.missingTechsEs.slice(0, 2).join(', ')}.`
    : '';
  return `Podés concentrarte en ${unitLabel} como núcleo principal.${rivHint}${missingNote}`;
}

function computeMatchupWarRoom({ myCivSlug = 'franks', rivalCivSlug = 'hindustanis', mapSlug = 'arabia', records = [] } = {}) {
  const validSlugs = Object.keys(CIV_TECH).filter((s) => Boolean(CIV_TECH[s]?.nodes));
  const mySlug = validSlugs.includes(myCivSlug) ? myCivSlug : 'franks';
  let rivalSlug = validSlugs.includes(rivalCivSlug) ? rivalCivSlug : 'hindustanis';
  if (rivalSlug === mySlug) rivalSlug = validSlugs.find((s) => s !== mySlug) || 'mayans';

  const myGuide = CIV_GUIDE[mySlug] || { name: mySlug, role: 'Civilización' };
  const rivalGuide = CIV_GUIDE[rivalSlug] || { name: rivalSlug, role: 'Civilización' };
  const myProf = getCivProfile(mySlug);
  const rivProf = getCivProfile(rivalSlug);

  const evalMine = {};
  const evalRival = {};
  const ageEdgeScores = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const ageScales = { 1: 0.72, 2: 1.05, 3: 1.15, 4: 1.15 };

  // Age 1 (Dark Age): purely economic & early-tempo antisymmetric delta
  const p1A = computeDirectionalPower(mySlug, rivalSlug, 1, null);
  const p1B = computeDirectionalPower(rivalSlug, mySlug, 1, null);
  ageEdgeScores[1] = clamp(roundSym((p1A - p1B) * ageScales[1]), -36, 36);

  // Ages 2, 3, 4: symmetric evaluation in both directions -> exact antisymmetry!
  for (const age of [2, 3, 4]) {
    evalMine[age] = evaluateAgeMatchup(mySlug, rivalSlug, age);
    evalRival[age] = evaluateAgeMatchup(rivalSlug, mySlug, age);
    const powA = computeDirectionalPower(mySlug, rivalSlug, age, evalMine[age]);
    const powB = computeDirectionalPower(rivalSlug, mySlug, age, evalRival[age]);
    ageEdgeScores[age] = clamp(roundSym((powA - powB) * ageScales[age]), -36, 36);
  }

  // Exact pixel-mirror SVG coordinates around y = 85: cy(A, B) + cy(B, A) === 170
  const yOf = (edge) => 85 - clamp(roundSym(edge * 2.15), -61, 61);
  const y1 = yOf(ageEdgeScores[1]);
  const y2 = yOf(ageEdgeScores[2]);
  const y3 = yOf(ageEdgeScores[3]);
  const y4 = yOf(ageEdgeScores[4]);

  const curvePath = `M0,85 L110,${y1} L330,${y2} L550,${y3} L770,${y4} L880,${y4}`;
  const areaFullPath = `${curvePath} L880,85 L0,85 Z`;

  // Context-aware Traps for MY civ (ONLY on lines that are actual signature/top Castle options for my civ!)
  const myTraps = [];
  const myTop2CastleKeys = new Set(getCivThreats(mySlug, 3).slice(0, 2).map((t) => t.key));
  const relevantTrapKeys = ['archers', 'knights', 'cavarchers', 'camels', 'steppe', 'infantry', 'eagles', 'champis', 'elephants'];
  for (const key of relevantTrapKeys) {
    const c3 = evalCivLine(mySlug, key, 3);
    const c4 = evalCivLine(mySlug, key, 4);
    const isRelevant = (myProf.lineMods?.[key] || 0) >= 6 || myTop2CastleKeys.has(key);
    if (isRelevant && c3 && !c3.outdated && c4 && (c4.outdated || c4.missingTechs.length >= 2)) {
      const missingEs = c4.missingTechsEs.slice(0, 2).join(', ');
      myTraps.push({
        lineKey: key,
        lineLabel: MATCHUP_LINES[key].label,
        title: `Techo en Imperial para ${MATCHUP_LINES[key].label}`,
        detail: `Fuerte en Castillos (${c3.unitEs}), pero en Imperial cae${missingEs ? ` sin ${missingEs}` : ''}. Prepará transición antes del minuto 30.`,
      });
    }
  }
  // Cap to 2 most relevant traps so rival vulnerabilities always have room
  const myTrapsFinal = myTraps.slice(0, 2);

  // Context-aware Rival Holes (NEVER flag non-Stable civs for Bloodlines/Paladin, NEVER flag waived techs!)
  const rivalNodes = CIV_TECH[rivalSlug]?.nodes || {};
  const rivalWaived = new Set(rivProf.waivedTechs || []);
  const rivalHasStable = Boolean(rivalNodes.Stable || rivalNodes['Scout Cavalry'] || rivalNodes['Camel Rider'] || rivalNodes['Steppe Lancer'] || rivalNodes.Knight || rivalNodes['Hei Guang Cavalry']);
  const rivalHasKnight = Boolean(rivalNodes.Knight || rivalNodes['Hei Guang Cavalry']);
  const rivalHasSavar = Boolean(rivalNodes.Savar);
  const rivalHasWingedHussar = Boolean(rivalNodes['Winged Hussar']);

  const rivalHoles = CRITICAL_TECH_LABELS_ES
    .filter((t) => {
      if (rivalNodes[t.node] != null) return false;
      if (rivalWaived.has(t.node)) return false;
      if (t.needsStable && !rivalHasStable) return false;
      if (t.needsKnight && (!rivalHasKnight || rivalHasSavar)) return false;
      if (t.node === 'Hussar' && rivalHasWingedHussar) return false;
      if (t.node === 'Bombard Cannon' && rivalNodes.Houfnice != null) return false;
      return true;
    })
    // Prioritize critical missing counter/age upgrades first (Pikeman, Elite Skirmisher, Crossbowman, Bracer, Halberdier)
    .sort((a, b) => {
      const prio = { Pikeman: 10, 'Elite Skirmisher': 10, Crossbowman: 9, Bracer: 8, Halberdier: 8, Redemption: 7, 'Ring Archer Armor': 7, 'Plate Barding Armor': 7, 'Bombard Cannon': 6, Arbalester: 6, 'Blast Furnace': 5, Bloodlines: 5, 'Thumb Ring': 4, 'Siege Engineers': 4, Paladin: 3, Hussar: 2 };
      return (prio[b.node] || 0) - (prio[a.node] || 0);
    })
    .slice(0, 3)
    .map((t) => ({ node: t.node, es: t.es, desc: t.desc }));

  // Build gameplan per age (strictly age-legal, intelligent 1-unit or Core + Counter mix!)
  const gameplanByAge = [
    { age: 2, ageLabel: 'Edad Feudal', icon: 'assets/icons/ages/feudal.png' },
    { age: 3, ageLabel: 'Edad de los Castillos', icon: 'assets/icons/ages/castle.png' },
    { age: 4, ageLabel: 'Edad Imperial', icon: 'assets/icons/ages/imperial.png' },
  ].map(({ age, ageLabel, icon }) => {
    const ev = evalMine[age];
    const p = ev.bestPrimary;
    const c = ev.complement;
    const headline = p
      ? (c ? `${p.unitEs} + ${c.unitEs}` : p.unitEs)
      : 'Economía y control';
    return {
      age,
      ageLabel,
      icon,
      bestLine: headline,
      primaryNode: p?.unitNode || null,
      complementNode: c?.unitNode || null,
      edge: ageEdgeScores[age],
      advice: formatAgePlanAdvice(age, ev, rivalGuide.name),
    };
  });

  // Imperial Clash Comparison: rank lines by actual relevance to THIS matchup (including Unique Units, Gunpowder, Elephants, Champis, Eagles!)
  const clashKeys = ['unique', 'archers', 'knights', 'camels', 'cavarchers', 'steppe', 'eagles', 'champis', 'elephants', 'infantry', 'gunpowder', 'siege', 'spears', 'skirmishers'];
  const clashLines = clashKeys
    .map((k) => {
      const m3 = evalCivLine(mySlug, k, 3);
      const r3 = evalCivLine(rivalSlug, k, 3);
      const m4 = evalCivLine(mySlug, k, 4);
      const r4 = evalCivLine(rivalSlug, k, 4);
      const label = k === 'unique'
        ? 'Unidades únicas'
        : MATCHUP_LINES[k].label;
      return {
        key: k,
        label,
        castleOwn: m3?.score || 0,
        castleRival: r3?.score || 0,
        impOwn: m4?.score || 0,
        impRival: r4?.score || 0,
        ownMissingEs: m4?.missingTechsEs || [],
        relevance: (k === 'unique' ? 120 : 0) + Math.max(m4?.score || 0, r4?.score || 0) + ((m4?.score || 0) + (r4?.score || 0)) * 0.25,
      };
    })
    .filter((r) => r.impOwn > 0 || r.impRival > 0)
    .sort((a, b) => (b.relevance - a.relevance) || a.key.localeCompare(b.key))
    .slice(0, 7);

  // Recent real matchups from player replays
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

  // Mirror-consistent peak & danger windows (ALWAYS citing the plan from peakAgeIdx!)
  const agesSortedBest = [2, 3, 4].sort((a, b) => (ageEdgeScores[b] - ageEdgeScores[a]) || (a - b));
  const agesSortedWorst = [2, 3, 4].sort((a, b) => (ageEdgeScores[a] - ageEdgeScores[b]) || (a - b));
  const peakAgeIdx = agesSortedBest[0];
  const dangerAgeIdx = agesSortedWorst[0];
  const maxEdge = ageEdgeScores[peakAgeIdx];
  const minEdge = ageEdgeScores[dangerAgeIdx];
  const ageNames = { 1: 'Alta Edad Media', 2: 'Edad Feudal', 3: 'Edad de los Castillos', 4: 'Edad Imperial' };
  const peakPlan = gameplanByAge.find((g) => g.age === peakAgeIdx);

  let verdictTitle;
  let peakWindowLabel;
  let dangerWindowLabel;
  if (maxEdge >= 4 && minEdge <= -4) {
    verdictTitle = `Tu mejor ventana es ${ageNames[peakAgeIdx]} con ${peakPlan?.bestLine || 'iniciativa'}; cuidado en ${ageNames[dangerAgeIdx]}`;
    peakWindowLabel = `Tu pico: ${ageNames[peakAgeIdx]}`;
    dangerWindowLabel = `Peligro rival: ${ageNames[dangerAgeIdx]}`;
  } else if (maxEdge >= 4) {
    verdictTitle = minEdge >= 4
      ? `Ventaja clara durante toda la partida · pico en ${ageNames[peakAgeIdx]} con ${peakPlan?.bestLine || 'presión'}`
      : `Ventaja clara en ${ageNames[peakAgeIdx]} con ${peakPlan?.bestLine || 'iniciativa'}; el resto parejo`;
    peakWindowLabel = `Tu pico: ${ageNames[peakAgeIdx]}`;
    dangerWindowLabel = minEdge < 0 ? `Menor margen: ${ageNames[dangerAgeIdx]}` : `Más parejo: ${ageNames[dangerAgeIdx]}`;
  } else if (minEdge <= -4) {
    verdictTitle = maxEdge <= -4
      ? `Cruce exigente · tu mejor resistencia es ${ageNames[peakAgeIdx]} (${peakPlan?.bestLine || 'defensa'}); peligro en ${ageNames[dangerAgeIdx]}`
      : `Cruce exigente en ${ageNames[dangerAgeIdx]}; buscá igualar en ${ageNames[peakAgeIdx]} con ${peakPlan?.bestLine || 'tu núcleo'}`;
    peakWindowLabel = `Mejor ventana: ${ageNames[peakAgeIdx]}`;
    dangerWindowLabel = `Peligro rival: ${ageNames[dangerAgeIdx]}`;
  } else {
    verdictTitle = `Matchup parejo · buscá iniciativa en ${ageNames[peakAgeIdx]} con ${peakPlan?.bestLine || 'tu núcleo'}`;
    peakWindowLabel = `Iniciativa: ${ageNames[peakAgeIdx]}`;
    dangerWindowLabel = minEdge < 0 ? `Vigilá: ${ageNames[dangerAgeIdx]}` : 'Sin pico rival claro';
  }

  return {
    myCiv: {
      slug: mySlug,
      name: myGuide.name,
      role: myGuide.role || 'Civilización',
      strengths: myGuide.strengths || myGuide.bonuses || '',
      uniqueUnit: myProf.uniqueUnit?.es || '',
      keyUniqueTech: myProf.keyUniqueTech || '',
    },
    rivalCiv: {
      slug: rivalSlug,
      name: rivalGuide.name,
      role: rivalGuide.role || 'Civilización',
      strengths: rivalGuide.strengths || rivalGuide.bonuses || '',
      uniqueUnit: rivProf.uniqueUnit?.es || '',
      keyUniqueTech: rivProf.keyUniqueTech || '',
    },
    mapSlug: mapSlug || 'arabia',
    ageEdgeScores,
    verdictTitle,
    peakWindowLabel,
    dangerWindowLabel,
    gameplanByAge,
    svg: {
      curvePath,
      areaFullPath,
      nodes: [
        { cx: 110, cy: y1 },
        { cx: 330, cy: y2 },
        { cx: 550, cy: y3 },
        { cx: 770, cy: y4 },
      ],
    },
    clashLines,
    myTraps: myTrapsFinal,
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
  resolvePlayedAtMs,
  extractRealReplayEntry,
  computeWeeklyProgress,
  computeHighEloTelemetry,
  computeMatchupWarRoom,
  extractBuildFromBestReplay,
};
