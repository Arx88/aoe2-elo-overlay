'use strict';

/**
 * Política unificada de profundidad de muestra, límites mínimos/máximos y ventanas
 * por plan (Free / Pro / Ultra) para Central.
 *
 * Un solo archivo de verdad compartido por:
 * - src/central.js (fetch Delta Sync, lastMatchVsAvg, duraciones)
 * - src/civ-diagnostic.js (Companion-First Left-Join, diagnósticos de civ)
 * - src/central-intel.js (diagnósticos de mapa, Motores/Fugas de ELO, Academia)
 * - src/central-discoveries.js (Tridente, ADN, Roles TG, Color, Relojes, Maestría)
 * - ui/tactical-ui.js & settings.js (sanitización de ventanas por plan)
 */

const COMPANION_DEPTH = Object.freeze({
  PAGE_SIZE: 100,
  OWN_MAX_PER_MODE: 200,
  OWN_ALL_SUMMARIES_MAX: 250,
  EXTERNAL_MAX_PER_MODE: 100,
  ELO_CHART_ULTRA_MAX: 500,
  ELO_SERIES_FULL_MAX: 1000,
});

const SAMPLE_POLICY = Object.freeze({
  // Diagnóstico de mapas
  mapDiagnostic: Object.freeze({
    minBase: 6,
    minLargePool: 8,
    largePoolThreshold: 50,
    minFinding: 5,
    prelimMax: 14,
    solidMin: 15,
    maxWindow: 200,
  }),
  // Diagnóstico de civilizaciones
  civDiagnostic: Object.freeze({
    minGames: 5,
    minFinding: 5,
    minLocalTelemetry: 4,
    prelimMax: 9,
    moderateMax: 19,
    solidMin: 20,
    maxWindow: 200,
  }),
  // Tridente (Arma Secreta, Mapa Fortaleza, Trampa, Némesis, Presa)
  trident: Object.freeze({
    minSecretCiv: 8,
    minSecretCivSmall: 6,
    minFortressMap: 8,
    minFortressMapSmall: 6,
    fortressMinDeltaPp: 4,
    minSilentTrap: 6,
    minCombo: 6,
    minNemesis1v1: 6,
    minNemesisTeam: 6,
    minArchetypeFallback: 8,
    smallPoolThreshold: 40,
  }),
  // Motores y Fugas de ELO (sobre ELO real de Companion)
  eloAttribution: Object.freeze({
    minFactorGames: 6,
    minOpponentCiv1v1: 6,
    minOpponentCivTeam: 6,
    minOpeningGames: 5,
    minAntidoteGames: 4,
    minAntidoteSweep: 3,
    minSessionTilt: 4,
    minSessionFatigue: 5,
  }),
  // Aperturas y ritmo (AoE2Insights)
  insights: Object.freeze({
    minOpeningRow: 5,
    minVsOpening: 5,
    minClassifiedStyle: 6,
    lowCoveragePct: 25,
    lowReplayCount: 15,
  }),
  // Team Game Roles (Pocket/Flank, 2v2/3v3/4v4, Carry/Ancla)
  tgRadiography: Object.freeze({
    minTotalTg: 8,
    minTeamSize: 4,
    minRole: 5,
    minCarryAnchor: 5,
  }),
  // Color de la suerte / mufa
  luckyColor: Object.freeze({
    minTotal: 12,
    minRowVisible: 4,
    minCrown: 6,
    cursedMinDeltaPp: 10,
  }),
  // Relojes locales (Victorias vs Derrotas por edad)
  winLossClocks: Object.freeze({
    minTotalReplays: 4,
    minPerSideForDelta: 3,
    solidMin: 10,
  }),
  // Maestría histórica de 56 civs
  civMastery: Object.freeze({
    minTotalReplays: 3,
    minMasteryGames: 3,
    minCastleReplaysForSiege: 3,
  }),
  // ADN de jugador (Huella de Combate override)
  dna: Object.freeze({
    minCombatDnaReplaysForArchetype: 4,
    minCombatDnaAbsoluteReplays: 15,
    minCombatDnaShareOfMode: 0.06,
  }),
  // Hora Dorada
  goldenHour: Object.freeze({
    minTotal: 20,
    minBucket: 6,
    minDay: 5,
    maxCursedWr: 54, // nunca marcar >=55% WR como "maldito"
  }),
  // Comparativa última partida / forma reciente
  lastMatch: Object.freeze({
    minSeries: 3,
    minDurationSample: 2,
    minDurationSeconds: 180,
  }),
});

// Mapas con inicio nómada donde el color NO determina posición Pocket vs Flank
const NOMAD_START_MAP_KEYS = Object.freeze(new Set([
  'nomad',
  'landnomad',
  'africanclearing',
  'steppe',
  'megarandom',
  'socotra',
  'nilevalley',
  'mountaindunes',
  'budapest',
  'kawasan',
]));

// Mapas cerrados/boom donde menor eAPM vs Arabia es gameplay normal y abrir FC es universal
const CLOSED_BOOM_MAP_KEYS = Object.freeze(new Set([
  'arena',
  'blackforest',
  'fortress',
  'hideout',
  'michi',
  'amazon_tunnel',
  'amazontunnel',
  'enclosed',
  'oasis',
  'lombardia',
]));

function compactMapToken(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isNomadStartMap(raw) {
  const k = compactMapToken(raw);
  if (!k) return false;
  if (NOMAD_START_MAP_KEYS.has(k)) return true;
  return k.includes('nomad') || k.includes('africanclearing') || k.includes('megarandom') || k.includes('steppe');
}

function isClosedBoomMap(raw) {
  const k = compactMapToken(raw);
  if (!k) return false;
  if (CLOSED_BOOM_MAP_KEYS.has(k)) return true;
  return k.includes('arena') || k.includes('blackforest') || k.includes('hideout') || k.includes('fortress') || k.includes('michi') || k.includes('amazontunnel');
}

function normalizeCentralPlan(plan, isUltraFallback = false) {
  const p = String(plan || '').toLowerCase();
  if (p === 'promax' || p === 'ultra' || p === 'beta') return 'ultra';
  if (p === 'pro') return 'pro';
  if (p === 'free') return 'free';
  return isUltraFallback ? 'ultra' : 'free';
}

function allowedLmWindowsForPlan(plan, isUltraFallback = false) {
  const tier = normalizeCentralPlan(plan, isUltraFallback);
  if (tier === 'ultra') return ['10', '20', '50', 'all'];
  if (tier === 'pro') return ['10', '20'];
  return ['10'];
}

function allowedEloRangesForPlan(plan, isUltraFallback = false) {
  const tier = normalizeCentralPlan(plan, isUltraFallback);
  if (tier === 'ultra') return ['10', '20', '100', 'all'];
  if (tier === 'pro') return ['10', '20'];
  return ['10'];
}

function sanitizeLmWindow(requested, plan, isUltraFallback = false) {
  const tier = normalizeCentralPlan(plan, isUltraFallback);
  const allowed = allowedLmWindowsForPlan(tier);
  const req = requested != null ? String(requested) : '';
  if (allowed.includes(req)) return req;
  return tier === 'free' ? '10' : '20';
}

function sanitizeEloRange(requested, plan, isUltraFallback = false, totalPts = 0) {
  const tier = normalizeCentralPlan(plan, isUltraFallback);
  const allowed = allowedEloRangesForPlan(tier);
  const req = requested != null ? String(requested) : '';
  if (allowed.includes(req)) return req;
  if (tier === 'ultra') return totalPts >= 60 ? '100' : 'all';
  if (tier === 'pro') return '20';
  return '10';
}

module.exports = {
  COMPANION_DEPTH,
  SAMPLE_POLICY,
  NOMAD_START_MAP_KEYS,
  CLOSED_BOOM_MAP_KEYS,
  isNomadStartMap,
  isClosedBoomMap,
  normalizeCentralPlan,
  allowedLmWindowsForPlan,
  allowedEloRangesForPlan,
  sanitizeLmWindow,
  sanitizeEloRange,
};
