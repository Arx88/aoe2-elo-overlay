'use strict';

const assert = require('node:assert/strict');
const {
  classifyCivPool,
  predictRivalCivs,
  computeEapmProfile,
  computeEloAdjustedWeaknesses,
  computeFormProfile,
} = require('../src/prematch-predict');
const { composeRows } = require('../src/aoe');
const { parseScoutRows, computeTips } = require('../src/scout');
const { resolveMode } = require('../src/insights');
const { getProductState } = require('../src/product');
const { projectOverlayState } = require('../src/presentation');
const { renderRival } = require('../ui/tactical-ui');

const NOW = Date.UTC(2026, 10, 20, 16, 0, 0);
const DAY = 86400000;

// 1. Especialista (Civ Picker) en Arabia
const specialistRows = [
  ...Array.from({ length: 10 }, (_, i) => ({
    civ: 'Franks', mapName: 'Arabia', won: i < 6, startedAt: NOW - (i + 1) * DAY,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    civ: 'Magyars', mapName: 'Arabia', won: true, startedAt: NOW - (i + 12) * DAY,
  })),
  { civ: 'Huns', mapName: 'Arabia', won: false, startedAt: NOW - 18 * DAY },
];
const specPred = predictRivalCivs(specialistRows, 'Arabia', { now: NOW });
assert.equal(specPred.pool.poolType, 'specialist');
assert.equal(specPred.confidence, 'alta');
assert.equal(specPred.top3[0].civ, 'Franks');
assert.ok(specPred.top3[0].probability >= 60, `esperaba >=60% para OTP Franks, dio ${specPred.top3[0].probability}%`);
assert.ok(specPred.threat && /Caballeros/.test(specPred.threat.threat));

// 2. Jugador Random (alta entropía)
const randomCivs = [
  'Aztecs', 'Britons', 'Chinese', 'Ethiopians', 'Incas', 'Japanese',
  'Khmer', 'Lithuanians', 'Malians', 'Mayans', 'Persians', 'Vietnamese',
];
const randomRows = randomCivs.map((civ, i) => ({
  civ, mapName: 'Arabia', won: i % 2 === 0, startedAt: NOW - (i + 1) * DAY,
}));
const randPred = predictRivalCivs(randomRows, 'Arabia', { now: NOW });
assert.equal(randPred.pool.poolType, 'random');
assert.equal(randPred.confidence, 'random');
assert.ok(randPred.pool.entropy > 0.9);
assert.equal(randPred.threat, null, 'en jugador Random no alerta una única civ como segura');

// 3. Velocidad mecánica (eAPM vs oponentes reales de su mismo nivel)
const fastEapm = computeEapmProfile([
  { meanEapm: 62, oppMeanEapm: 46 },
  { meanEapm: 58, oppMeanEapm: 44 },
  { meanEapm: 65, oppMeanEapm: 48 },
  { meanEapm: 60, oppMeanEapm: 45 },
]);
assert.equal(fastEapm.pace, 'fast');
assert.equal(fastEapm.value, 61);
assert.ok(fastEapm.deltaPct >= 25);
assert.equal(computeEapmProfile([{ meanEapm: 50 }, { meanEapm: 52 }]), null, 'menos de 3 replays no publica eAPM');

// 4. Debilidades ajustadas por ELO: perder contra rivales +300 ELO NO es debilidad real
const smurfLosses = Array.from({ length: 5 }, (_, i) => ({
  won: false, elo: 1100, oppElo: 1450,
  opponents: [{ oppStrategy: 'Archer rush', oppCiv: 'Britons' }],
}));
const adjusted = computeEloAdjustedWeaknesses(smurfLosses);
assert.equal(adjusted.openings.length, 0, 'perder vs +350 ELO esperado no se marca como debilidad');

// Perder 5/5 contra rivales del mismo ELO SÍ es debilidad real (+50% sobre esperado)
const realWeakness = Array.from({ length: 5 }, () => ({
  won: false, elo: 1200, oppElo: 1200,
  opponents: [{ oppStrategy: 'Archer rush', oppCiv: 'Britons' }],
}));
const adjustedReal = computeEloAdjustedWeaknesses(realWeakness);
assert.equal(adjustedReal.openings.length, 1);
assert.equal(adjustedReal.openings[0].name, 'Archer rush');
assert.ok(adjustedReal.openings[0].excessLossPct >= 30);

// 5. Forma actual y campos nuevos de World's Edge + protección Free
const statsMap = new Map([[8, {
  rating: 1280, peak: 1460, rank: 4200, rankTotal: 48000,
  ladderPercentile: 8.8, peakDelta: 180, streak: -4, drops: 2, wins: 120, losses: 100,
}]]);
const rows = composeRows([{ profileId: 8, name: 'Rival', team: 2 }], statsMap, 7);
assert.equal(rows[0].streak, -4);
assert.equal(rows[0].ladderPercentile, 8.8);
assert.equal(rows[0].peakDelta, 180);
const form = computeFormProfile(rows[0], [{ startedAt: NOW - 1800_000 }], NOW);
assert.equal(form.streak.kind, 'cold');
assert.equal(form.peakGap.delta, 180);
assert.equal(form.percentile.label, 'Top 8,8%');

// Free sigue sin filtrar campos pagos
const freeState = projectOverlayState({ status: 'ongoing', phase: 'lobby', players: rows }, getProductState());
assert.equal(freeState.players[0].streak, undefined);
assert.equal(freeState.players[0].ladderPercentile, undefined);

// 6. Parseo de campos nuevos en parseScoutRows + render sin inline style (CSP safe)
const parsed = parseScoutRows({
  rows: {
    match_id: ['1', '2', '3', '4', '5', '6'],
    won: ['Won', 'Not Won', 'Not Won', 'Not Won', 'Not Won', 'Won'],
    map: Array(6).fill('Arabia'),
    map_openness: Array(6).fill('Open'),
    map_terrain: Array(6).fill('Land'),
    civilization: ['Franks', 'Franks', 'Franks', 'Franks', 'Magyars', 'Franks'],
    civilization_opponent: Array(6).fill('Britons'),
    strategy: ['Scout rush', 'Scout rush', 'Scout rush', 'Scout rush', 'Fast castle', 'Scout rush'],
    strategy_opponent: Array(6).fill('Archer rush'),
    match_duration: Array(6).fill(1500),
    started_time: Array.from({ length: 6 }, (_, i) => new Date(NOW - (i + 1) * DAY).toISOString()),
    ladder: Array(6).fill('RM 1v1'),
    elo: Array(6).fill(1280),
    elo_opponent: Array(6).fill(1280),
    elo_group: Array(6).fill('High (1200 - 1899)'),
    mean_eapm: [58, 60, 56, 62, 59, 61],
    mean_eapm_opponent: [44, 46, 45, 43, 47, 45],
    patch: Array(6).fill(1824),
  },
});
const tips = computeTips(parsed, { mapName: 'Arabia', mode: resolveMode(3), now: NOW });
assert.equal(tips.eapm.pace, 'fast');
assert.equal(tips.eloWeakness.openings[0].name, 'Archer rush');
assert.equal(tips.prediction.pool.poolType, 'specialist');

const html = renderRival({
  state: { phase: 'lobby', match: { mapName: 'Arabia', leaderboardId: 3 }, players: [{ isYou: true, civ: 'Mayans' }, rows[0]] },
  options: { rosterDetails: true, smartTips: true, civRecommender: true, rivalFavorites: true },
  entry: { name: 'Rival', player: rows[0], report: { prediction: specPred, mode: resolveMode(3) }, tip: tips },
});
assert.match(html, /Predicción · Arabia/);
assert.match(html, /Confianza alta/);
assert.match(html, /Top 8,8%/);
assert.match(html, />-4<\/b>/);
assert.match(html, /−180 del pico/);
assert.match(html, /60 eAPM/);
assert.match(html, /Rápido/);
assert.match(html, /Presión temprana/);
assert.doesNotMatch(html, /style="/, 'sin inline styles por CSP');

const randomHtml = renderRival({
  state: { phase: 'lobby', match: { mapName: 'Arabia', leaderboardId: 3 }, players: [{ isYou: true, civ: 'Mayans' }, rows[0]] },
  options: { rosterDetails: true, smartTips: true, civRecommender: true },
  entry: { name: 'Rival', player: rows[0], report: { prediction: randPred, mode: resolveMode(3) }, tip: tips },
});
assert.match(randomHtml, /Jugador Random/);
assert.match(randomHtml, /No counter-pickees una civ puntual/);

console.log('Prematch predict: entropía, especialista vs random, eAPM, debilidad ajustada por ELO, forma y CSP OK.');
