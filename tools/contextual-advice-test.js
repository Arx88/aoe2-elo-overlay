'use strict';

const assert = require('node:assert/strict');
const { computeTips, buildScoutTips, parseScoutRows, styleProfile } = require('../src/scout');
const { computeMyMapCivs, buildCivRecommendation } = require('../src/mine');
const { resolveMode } = require('../src/insights');

const rm = resolveMode(3);
const team = resolveMode(4);
const rows = (n, attributes) => Array.from({ length: n }, (_, i) => ({
  matchId: i + 1, map: 'Arabia', openness: 'Open', won: true,
  civ: 'Franks', strategy: 'Scout rush', duration: 1100, ...attributes,
}));

async function main() {
  // Arena dominates the total data, but cannot contaminate any Arabia signal.
  const arabia = rows(6, { strategy: 'Fast castle', oppCiv: 'Britons' });
  const arena = rows(40, { map: 'Arena', openness: 'Closed', won: false,
    strategy: 'Archer rush', oppStrategy: 'Archer rush', oppCiv: 'Aztecs', duration: 2100 });
  const tip = computeTips([...arabia, ...arena], { mapName: 'Arabia', mode: rm });
  assert.equal(tip.scope, 'map');
  assert.equal(tip.sample, 6);
  assert.equal(tip.resultGames, 6);
  assert.equal(tip.context.scopeLabel, 'en Arabia');
  assert.equal(tip.style.label, 'Castillos rápido');
  assert.equal(tip.style.analyzed, 6);
  assert.equal(tip.openingsAgainst.length, 0, 'no fallback de apertura a Arena');
  assert.equal(tip.weakAgainst.length, 0, 'no fallback de debilidad a Arena');
  assert.equal(tip.tempo, null, 'no usa la duración de otros mapas');
  assert.equal(tip.likelyOpenings[0].name, 'Fast castle');
  assert.equal(tip.likelyOpenings[0].sample, 6);
  assert.equal(tip.tacticalPlan.actions[0].scopeLabel, 'en Arabia');
  assert.match(tip.tacticalPlan.actions[0].reason, /6 de 6.*en Arabia/);
  assert.match(tip.tacticalPlan.actions[0].reason, /no confirma boom/);

  const insufficientSignal = computeTips([...rows(6, { strategy: null }), ...arena],
    { mapName: 'Arabia', mode: rm });
  assert.equal(insufficientSignal.style, null, 'un mapa sin aperturas no toma el estilo del modo');
  assert.equal(insufficientSignal.likelyOpenings.length, 0);
  assert.equal(insufficientSignal.tacticalPlan.actions.length, 0);

  // One explicit fallback applies to every metric, with exact map coverage.
  const sparse = computeTips([...rows(1), ...rows(7, { map: 'Runestones' }), ...arena],
    { mapName: 'Arabia', mode: rm });
  assert.equal(sparse.scope, 'openness');
  assert.equal(sparse.context.scopeLabel, 'en mapas abiertos');
  assert.equal(sparse.context.mapSample, 1);
  assert.equal(sparse.sample, 8);
  assert.match(sparse.context.fallbackReason, /Solo 1 replays en Arabia/);
  assert.equal(sparse.likelyOpenings[0].sample, 8);
  assert.equal(sparse.style.analyzed, 8);
  for (const action of sparse.tacticalPlan.actions) {
    assert.equal(action.scopeLabel, sparse.context.scopeLabel);
    assert(action.evidence.every((entry) => entry.scopeLabel === sparse.context.scopeLabel));
  }
  const absent = computeTips(arena, { mapName: 'Arabia', mode: rm });
  assert.equal(absent.scope, 'mode');
  assert.equal(absent.context.mapSample, 0);
  assert.match(absent.context.fallbackReason, /no este mapa/);
  assert(absent.tacticalPlan.actions.every((entry) => entry.scopeLabel === 'en RM 1v1'));

  const unknown = computeTips(rows(10, { won: null, oppCiv: 'Aztecs', oppStrategy: 'Archer rush' }),
    { mapName: 'Arabia', mode: rm });
  assert.equal(unknown.resultGames, 0);
  assert.equal(unknown.winRate, null);
  assert.equal(unknown.weakAgainst.length, 0);
  assert.equal(unknown.openingsAgainst.length, 0);
  assert.equal(unknown.tempo, null);
  assert.equal(unknown.coverage.withOpening, 10, 'apertura conocida no requiere inventar resultado');

  // Hybrid openings belong in the denominator, never disappear from style.
  const hybrid = styleProfile([...rows(6), ...rows(6, { strategy: 'Drush fast castle' })]);
  assert.equal(hybrid.analyzed, 12);
  assert.equal(hybrid.aggressiveShare, 50);
  assert.equal(hybrid.dominant, 'mixto');
  const hybridOnly = styleProfile(rows(8, { strategy: 'Drush fast castle' }));
  assert.equal(hybridOnly.label, 'Drush + Castillos');
  assert.equal(hybridOnly.share, 100);

  const wrongMode = computeTips([...rows(6, { ladder: 'RM 1v1' }),
    ...rows(9, { ladder: 'EW 1v1', strategy: 'Archer rush' })], { mapName: 'Arabia', mode: rm });
  assert.equal(wrongMode.sample, 6);
  assert.equal(wrongMode.coverage.discardedOtherModes, 9);

  // Team matchups are deduplicated. Their result cannot be individual blame.
  const teamRows = parseScoutRows({ rows: {
    match_id: Array.from({ length: 24 }, (_, i) => Math.floor(i / 3)),
    map: Array(24).fill('Arabia'), ladder: Array(24).fill('RM Team'),
    strategy: Array(24).fill('Scout rush'), won: Array(24).fill('Not Won'),
    civilization: Array(24).fill('Mongols'),
    civilization_opponent: Array.from({ length: 24 }, (_, i) => i % 3 === 1 ? 'Britons' : 'Franks'),
    strategy_opponent: Array.from({ length: 24 }, (_, i) => i % 3 === 1 ? 'Archer rush' : 'Scout rush'),
  } });
  const tg = computeTips(teamRows, { mapName: 'Arabia', mode: team });
  assert.equal(tg.sample, 8);
  assert.equal(tg.weakAgainst.find((entry) => entry.civ === 'Franks').games, 8);
  assert(tg.tacticalPlan.context.teamGame);
  assert.match(tg.tacticalPlan.caveat, /Resultados de equipo/);
  const pressure = tg.tacticalPlan.actions.find((entry) => entry.id === 'pressure-window');
  assert.match(pressure.reason, /Su equipo perdió 8 de 8/);

  const ownRows = [
    ...Array.from({ length: 3 }, (_, i) => ({ civ: 'Franks', slug: 'franks', mapName: 'Arabia', won: i < 2 })),
    ...Array.from({ length: 20 }, () => ({ civ: 'Aztecs', slug: 'aztecs', mapName: 'Arena', won: true })),
    { civ: 'Franks', slug: 'franks', mapName: 'Arabia', won: null },
  ];
  const strictOwn = computeMyMapCivs(ownRows, 'Arabia', { allowModeFallback: false, modeLabel: rm.label });
  assert.equal(strictOwn.length, 1, 'no promueve tu civ de Arena como experiencia en Arabia');
  assert.equal(strictOwn[0].games, 3);
  assert.equal(strictOwn[0].wins, 2);
  assert.equal(strictOwn[0].scopeLabel, 'en Arabia');
  const rec = buildCivRecommendation({ myCivs: strictOwn, weakAgainst: [{ civ: 'Franks', games: 8, losses: 6, lossRate: 75 }],
    rivalContext: { scope: 'map', scopeLabel: 'en Arabia' }, mapName: 'Arabia', modeLabel: rm.label });
  assert.equal(rec[0].basis, 'combined');
  assert.equal(rec[0].scoreKind, 'ranking-only');
  assert.deepEqual(rec[0].evidence.map((entry) => [entry.part, entry.total]), [[2, 3], [6, 8]]);
  assert(rec[0].evidence.every((entry) => entry.scopeLabel === 'en Arabia'));
  assert.equal(rec[0].crossScope, false);

  const cache = new Map([['scout:rows:v2:123:3:500', { ts: 1000, rows: rows(8,
    { won: false, oppCiv: 'Franks', oppStrategy: 'Scout rush' }), totalRows: 8 }]]);
  const built = await buildScoutTips({ profileId: 123, leaderboardId: 3, mapName: 'Arabia', cache,
    now: 1001, recommend: true, myHistoryImpl: async () => ({ rows: ownRows }) });
  assert.equal(built.recommend[0].civ, 'Franks');
  assert.equal(built.recommend[0].mine.games, 3);
  assert.equal(built.tacticalPlan.recommendation.civ, 'Franks');
  assert.equal(built.tacticalPlan.context.sample, 8);
  assert.equal(built.recommend.some((entry) => entry.civ === 'Aztecs'), false);
  console.log('Contextual advice: 64 assertions OK');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
