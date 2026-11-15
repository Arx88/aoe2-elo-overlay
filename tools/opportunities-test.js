'use strict';
const assert = require('node:assert/strict');
const { buildOpportunityPlan, buildAutomaticOpportunityPlans, lineQuality, openingLine } = require('../src/opportunities');
const { buildScoutTips } = require('../src/scout');
const { renderAutomaticOpportunities } = require('../ui/tactical-ui');
const tree = require('../src/civ-tech.json');
const now = Date.UTC(2026, 10, 14, 12);
const options = { ownCiv: 'Mayans', rivalCiv: 'Franks', mapName: 'Arabia', mode: 3, age: 'feudal', now, cutoff: now, currentMatchId: 999 };
const row = (i, changes = {}) => ({ matchId: i + 1, map: 'Arabia', openness: 'Open', civ: 'Franks',
  won: i >= 20, oppCiv: 'Mayans', strategy: 'Scout rush',
  oppStrategy: i < 20 ? 'Archer rush' : 'Scout rush', ladder: 3,
  startedAt: new Date(now - (i + 1) * 86400000).toISOString(), ...changes });
const rows = Array.from({ length: 40 }, (_, i) => row(i));
const candidate = (p, key) => p.candidates.find((c) => c.key === key);
async function main() {
  assert.equal(Object.keys(tree.civilizations).length, 56);
  assert.equal(lineQuality('mayans', 'knights', 4), null);
  assert.equal(lineQuality('franks', 'archers', 4).unit, 'Crossbowman');
  assert.equal(lineQuality('mayans', 'archers', 4).unit, 'Arbalester');
  assert.equal(lineQuality('franks', 'knights', 2), null);
  assert.equal(openingLine('Fast castle'), null);
  assert.equal(openingLine('Unknown'), null);
  assert.equal(buildOpportunityPlan({ ...options, ownCiv: 'Unknown' }).status, 'unavailable');
  assert.equal(buildOpportunityPlan({ ...options, age: 'dark' }).status, 'invalid');
  const base = buildOpportunityPlan({ ...options, rows });
  assert.equal(base.status, 'ready');
  assert.equal(base.candidates[0].key, 'archers', 'measured weakness reinforces a viable own archer route');
  assert.equal(candidate(base, 'archers').history.games, 20);
  assert.equal(candidate(base, 'archers').history.losses, 20);
  assert.equal(candidate(base, 'archers').history.scope, 'same-map-and-matchup');
  assert.ok(candidate(base, 'archers').components.history > 0);
  assert.ok(candidate(base, 'archers').counters.some((c) => c.key === 'skirmishers'));
  assert.ok(base.candidates.every((c) => Number.isFinite(c.score) && c.score >= 0 && c.score <= 100));
  assert.equal(base.data.actualResearchKnown, false);
  assert.equal(base.data.actualResourcesKnown, false);
  const contaminated = [...rows, ...rows.map((r, i) => ({ ...r, matchId: 2000 + i, map: 'Arena', won: true })),
    row(100, { matchId: 999 }), row(101, { startedAt: new Date(now + 10000).toISOString() }),
    row(102, { ladder: 4 }), row(103, { startedAt: null })];
  assert.deepEqual(buildOpportunityPlan({ ...options, rows: contaminated }).candidates, base.candidates,
    'other map/mode, current game, future and undated records cannot affect the recommendation');
  assert.deepEqual(buildOpportunityPlan({ ...options, rows: [...rows, ...rows] }).candidates, base.candidates);
  const losesEverything = buildOpportunityPlan({ ...options, rows: rows.map((r) => ({ ...r, won: false })) });
  assert.ok(candidate(losesEverything, 'archers').components.history < candidate(base, 'archers').components.history,
    'losing against everything is not a specific archer weakness');
  const sparse = buildOpportunityPlan({ ...options, rows: rows.slice(0, 2) });
  assert.equal(candidate(sparse, 'archers').components.history, 0);
  const observed = buildOpportunityPlan({ ...options, rows, observedArmy: 'skirmishers', observedArmySource: 'verified-telemetry' });
  assert.ok(candidate(observed, 'archers').score < candidate(base, 'archers').score,
    'a manually observed counter reduces commitment to that route');
  assert.equal(observed.data.actualArmySource, 'verified-telemetry');
  assert.equal(buildOpportunityPlan({ ...options, observedArmy: 'skirmishers' }).observedArmy, null, 'manual observations are not accepted');
  assert.equal(lineQuality('armenians', 'infantry', 2).unit, 'Long Swordsman');
  assert.equal(lineQuality('burgundians', 'knights', 3).unit, 'Cavalier');
  assert.equal(lineQuality('persians', 'knights', 4).unit, 'Savar');
  assert.equal(buildAutomaticOpportunityPlans(options).length, 3);
  assert.ok(buildAutomaticOpportunityPlans({ ...options, observedArmy: 'knights' }).every((p) => p.observedArmy === null));
  const sparseThreats = [...rows.slice(0, 5).map((r) => ({ ...r, strategy: 'Archer rush' })), ...Array.from({ length: 95 }, (_, i) => row(i + 10, { strategy: 'Fast castle', oppStrategy: 'Unknown' }))];
  const sparseThreatPlan = buildOpportunityPlan({ ...options, ownCiv: 'Franks', rivalCiv: 'Britons', rows: sparseThreats });
  const onlyScouts = buildOpportunityPlan({ ...options, ownCiv: 'Franks', rivalCiv: 'Britons', rows: sparseThreats.slice(0, 5) });
  const ownScouts = (plan) => plan.candidates.find((c) => c.key === 'scouts');
  assert.ok(ownScouts(sparseThreatPlan) && ownScouts(onlyScouts));
  assert.ok(ownScouts(sparseThreatPlan).components.response < ownScouts(onlyScouts).components.response, 'unknown and FC mass remain in the denominator');
  const old = buildOpportunityPlan({ ...options, rows: rows.map((r) => ({ ...r, startedAt: new Date(now - 170 * 86400000).toISOString() })) });
  assert.ok(candidate(old, 'archers').history.reliability < candidate(base, 'archers').history.reliability);
  assert.equal(buildOpportunityPlan({ ...options, rows: [row(0, { openness: 'Water' })] }).status, 'unavailable');
  const teamRows = rows.map((r) => ({ ...r, ladder: 4 }));
  const team = buildOpportunityPlan({ ...options, mode: 4, rows: teamRows });
  assert.ok(candidate(team, 'archers').history.reliability < candidate(base, 'archers').history.reliability);
  assert.equal(team.data.teamResults, true);
  assert.ok(renderAutomaticOpportunities([base]).includes('no probabilidad de victoria'));
  assert.ok(renderAutomaticOpportunities([base]).includes('Ventanas condicionales automáticas'));
  const goths = buildOpportunityPlan({ ...options, rivalCiv: 'Goths', age: 'castle', rows: [] });
  const archerGoths = candidate(goths, 'archers');
  assert.ok(archerGoths);
  assert.ok(archerGoths.counters.some((c) => c.key === 'huskarl'));
  let ownFetches = 0;
  const cached = new Map([['scout:rows:v2:8:3:40', { ts: now, rows, totalRows: rows.length }]]);
  const integrated = await buildScoutTips({ profileId: 8, mode: 3, mapName: 'Arabia', limit: 40, cache: cached, now,
    opportunityContext: options, recommend: false,
    myHistoryImpl: async () => { ownFetches += 1; return { rows: [], error: null }; },
    fetchImpl: async () => { throw new Error('unexpected network'); } });
  assert.equal(ownFetches, 1, 'smart opportunities can use own history independently from civ picker');
  assert.equal(integrated.opportunities.status, 'ready');
  assert.equal(integrated.opportunities.candidates[0].key, 'archers');
  console.log('Oportunidades: árboles, edad, counters, contexto, recencia, muestra, ventanas automáticas e integración OK.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
