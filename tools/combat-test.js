'use strict';

const assert = require('node:assert/strict');
const { analyzeCombatEvents, normalizeCombatSummary, COST_DEFINITION } = require('../src/combat-analysis');
const { normalizeTelemetry, buildPostMatchReport, recordFromMatch } = require('../src/postmatch');
const { renderPostMatch, civRelation } = require('../ui/tactical-ui');
const cost = (food = 50) => ({ food, wood: 0, gold: 0, stone: 0, definition: COST_DEFINITION });
const age = (profileId, value, gameSeconds) => ({ profileId, age: value, gameSeconds, type: 'age-reached' });
function death(index, gameSeconds, changes = {}) {
  return { id: `death-${index}`, type: 'unit-died', unitInstanceId: `unit-${index}`, gameSeconds,
    unitCategory: 'villager', ownerProfileId: 8, killerProfileId: 7,
    cause: 'enemy-combat', cost: cost(), ...changes };
}
function ledger(changes = {}) {
  return { schemaVersion: 1, clock: 'game', matchId: '100', profileId: 7, durationSeconds: 2000,
    startingAge: 'dark', players: [{ profileId: 7, team: 1 }, { profileId: 8, team: 2 }],
    coverage: { agesComplete: true, deaths: [{ start: 0, end: 2000 }] },
    ageEvents: [age(7, 'dark', 0), age(7, 'feudal', 600), age(7, 'castle', 1200), age(7, 'imperial', 1800),
      age(8, 'dark', 0), age(8, 'feudal', 650), age(8, 'castle', 1300)],
    deaths: [death(1, 599), death(2, 600), death(3, 1199), death(4, 1200),
      death(5, 1250, { unitCategory: 'military', ownerProfileId: 7, killerProfileId: 8, cost: cost(60) }),
      death(6, 1400, { ownerProfileId: 7, killerProfileId: null, cause: 'own-delete' })], ...changes };
}
const own = analyzeCombatEvents(ledger(), { matchId: '100', profileId: 7 });
assert.equal(own.status, 'ready');
assert.deepEqual(own.data.stages.map((phase) => phase.villagersKilled), [1, 2, 1, 0], 'exact boundaries belong to the new age');
assert.equal(own.data.totals.villagersKilled, 4);
assert.equal(own.data.totals.villagersLost, 1, 'own deletion is a loss, not an enemy kill');
assert.equal(own.data.totals.militaryLost, 1);
assert.equal(own.data.totals.valueDestroyed, 200);
assert.equal(own.data.totals.valueLost, 60, 'own deletion is excluded from combat exchange');
assert.equal(own.data.totals.unattributedDeaths, 0, 'a known own deletion is not an unknown cause');
const rival = analyzeCombatEvents(ledger({ profileId: 8 }));
assert.deepEqual(rival.data.stages.map((phase) => phase.villagersLost), [2, 2, 0], 'opponent ages can have different boundaries');
assert.equal(rival.data.totals.villagersKilled, 0, 'no kill awarded for an opponent own-delete');

const converted = analyzeCombatEvents(ledger({ deaths: [death(1, 1300,
  { ownerProfileId: 7, killerProfileId: 8, unitCategory: 'military' })] }));
assert.equal(converted.data.totals.militaryLost, 1, 'a converted unit uses its owner at death');
assert.equal(converted.data.totals.militaryKilled, 0);
const duplicate = ledger();
duplicate.deaths.push({ ...duplicate.deaths[0] });
assert.equal(analyzeCombatEvents(duplicate).data.totals.villagersKilled, 4);
assert.equal(analyzeCombatEvents(duplicate).warnings.length, 1);
duplicate.deaths.at(-1).gameSeconds += 1;
assert.equal(analyzeCombatEvents(duplicate).status, 'invalid');
const twice = ledger();
twice.deaths.push({ ...twice.deaths[0], id: 'another-id' });
assert.equal(analyzeCombatEvents(twice).status, 'invalid');

const partial = analyzeCombatEvents(ledger({ coverage: { agesComplete: true, deaths: [{ start: 0, end: 1200 }] } }));
assert.equal(partial.status, 'partial');
assert.deepEqual(partial.data.stages.map((phase) => phase.status), ['complete', 'complete', 'partial', 'partial']);
assert.equal(partial.data.totals.valueDestroyed, null);
assert.equal(partial.data.stages[2].valueLost, null);
assert.equal(analyzeCombatEvents(ledger({ deaths: [] })).data.stages[0].villagersLost, 0, 'complete empty interval is a measured zero');
assert.equal(analyzeCombatEvents(ledger({ deaths: [], coverage: { agesComplete: true, deaths: [] } })).status, 'partial');

const missingCost = analyzeCombatEvents(ledger({ deaths: [death(1, 800, { cost: null })] }));
assert.equal(missingCost.data.totals.villagersKilled, 1);
assert.equal(missingCost.data.totals.valueDestroyed, null, 'unknown costs preserve counts without inventing exchange value');
const unknown = analyzeCombatEvents(ledger({ deaths: [death(1, 800, { unitCategory: 'unknown' })] }));
assert.equal(unknown.data.totals.otherKilled, 1);
assert.equal(unknown.data.totals.militaryKilled, 0);
assert.equal(unknown.data.totals.valueDestroyed, null);
const noAuthor = analyzeCombatEvents(ledger({ deaths: [death(1, 800,
  { ownerProfileId: 7, killerProfileId: null })] }));
assert.equal(noAuthor.data.totals.villagersLost, 1);
assert.equal(noAuthor.data.totals.villagersKilled, 0);
assert.equal(noAuthor.data.totals.unattributedDeaths, 1);

const raider = ledger({ deaths: Array.from({ length: 5 }, (_, i) => death(i, 700 + i)) });
assert.equal(analyzeCombatEvents(raider).data.highlights[0].id, 'feudal-raider-v1');
assert.deepEqual(analyzeCombatEvents({ ...raider, coverage: { agesComplete: true, deaths: [] } }).data.highlights, []);
const huge = ledger({ deaths: Array.from({ length: 25 }, (_, i) => death(i, 1400 + i, { unitCategory: 'military' })) });
assert.equal(analyzeCombatEvents(huge).data.highlights[0].title, 'Serial Killer');
assert.equal(analyzeCombatEvents(huge).data.totals.valueLost, 0, 'zero losses do not create an infinite ratio');
assert.ok(!JSON.stringify(analyzeCombatEvents(huge)).includes('Infinity'));
huge.deaths.push(death(30, 1500, { unitCategory: 'military', ownerProfileId: 7, killerProfileId: 8, cost: cost(100) }));
assert.ok(analyzeCombatEvents(huge).data.highlights.some((item) => item.title === 'Buen negocio'));

const water = analyzeCombatEvents(ledger({ deaths: [death(1, 700, { unitCategory: 'fishing-ship' })] }));
assert.equal(water.data.totals.otherKilled, 1);
assert.equal(water.data.totals.villagersKilled, 0);
const tg = ledger({ players: [{ profileId: 7, team: 1 }, { profileId: 8, team: 2 }, { profileId: 9, team: 1 }],
  deaths: [death(1, 700, { ownerProfileId: 9, killerProfileId: 7, cause: 'friendly-fire' })] });
assert.equal(analyzeCombatEvents(tg).data.totals.villagersKilled, 0);
tg.deaths[0].cause = 'enemy-combat';
assert.equal(analyzeCombatEvents(tg).status, 'invalid');

const invalidChanges = [
  { clock: 'wall' }, { profileId: '7' }, { durationSeconds: null }, { durationSeconds: Infinity },
  { startingAge: 'unknown' }, { coverage: { agesComplete: false, deaths: [] } },
  { ageEvents: [age(7, 'dark', 0), age(7, 'castle', 1000)] },
  { ageEvents: [{ ...age(7, 'dark', 0), type: 'Research' }] },
  { deaths: [death(1, 2000)] }, { deaths: [death(1, -1)] },
  { deaths: [death(1, 700, { type: 'Attack' })] }, { deaths: [death(1, 700, { unitCategory: 'made-up' })] },
  { deaths: [death(1, 700, { cost: cost('50') })] },
];
for (const change of invalidChanges) assert.equal(analyzeCombatEvents(ledger(change)).status, 'invalid', JSON.stringify(change));
assert.equal(analyzeCombatEvents(ledger(), { matchId: 101 }).status, 'invalid');
assert.equal(analyzeCombatEvents(ledger(), { profileId: 8 }).status, 'invalid');
assert.equal(analyzeCombatEvents(ledger(), { players: [{ profileId: 7, team: 1 }, { profileId: 99, team: 2 }] }).status, 'invalid');
const finalArrival = analyzeCombatEvents(ledger({ ageEvents: [age(7, 'dark', 0), age(7, 'feudal', 2000)] }));
assert.equal(finalArrival.status, 'ready');
assert.equal(finalArrival.data.stages.length, 1, 'a zero-length final age creates no fabricated interval');
const feudalStart = analyzeCombatEvents(ledger({ startingAge: 'feudal', ageEvents: [age(7, 'feudal', 0)] }));
assert.equal(feudalStart.data.stages[0].age, 'feudal');
assert.equal(normalizeCombatSummary(own.data, { profileId: 8 }).status, 'invalid');
assert.equal(normalizeCombatSummary(own.data, { startingAge: 'feudal' }).status, 'invalid');
assert.equal(normalizeCombatSummary(own.data, { durationSeconds: 1999 }).status, 'invalid');
assert.deepEqual(normalizeCombatSummary(own.data).data, own.data, 'persisted summaries round-trip without raw events');
const forged = structuredClone(own.data);
forged.highlights = [{ title: 'Inventado' }];
forged.totals.villagersKilled = 999;
assert.equal(normalizeCombatSummary(forged).data.totals.villagersKilled, 4);
assert.ok(!normalizeCombatSummary(forged).data.highlights.some((item) => item.title === 'Inventado'));
forged.stages[0].unattributedDeaths = 999;
assert.equal(normalizeCombatSummary(forged).status, 'invalid');

// End-to-end through the existing telemetry importer, store normalization,
// report and shared renderer. Other telemetry survives invalid combat data.
const match = { matchId: 100, mapName: 'Arabia', leaderboardId: 3, ongoing: false,
  startedAt: 100000, finishedAt: 2100000, players: [{ profileId: 7, civ: 'Franks', won: true },
    { profileId: 8, civ: 'Mayans', won: false }] };
const telemetry = { schemaVersion: 1, matchId: '100', profileId: 7, clock: 'game', durationSeconds: 2000,
  source: { id: 'synthetic-test-only', version: '1', type: 'game-telemetry', label: 'Fixture sintético' },
  context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', gameSpeed: 'normal', startingAge: 'dark', patch: 'fixture' },
  combat: analyzeCombatEvents(raider).data };
const normalized = normalizeTelemetry(telemetry, { profileId: 7, matchId: 100 });
assert.equal(normalized.data.combat.highlights[0].title, 'Depredador Feudal');
const record = recordFromMatch(match, 7, telemetry);
assert.equal(record.telemetry.combat.totals.villagersKilled, 5);
assert.deepEqual(normalizeTelemetry(record.telemetry, record).data.combat, record.telemetry.combat);
const report = buildPostMatchReport({ match, profileId: 7, records: [record] });
assert.equal(report.combat.totals.villagersKilled, 5);
assert.ok(renderPostMatch(report, { replay: true }).includes('Depredador Feudal'));
assert.ok(renderPostMatch(report, { replay: true }).includes('Combate por edad'));
assert.ok(!renderPostMatch(report, { replay: false }).includes('Depredador Feudal'));
assert.ok(!renderPostMatch(report, { replay: false }).includes('Combate por edad'));
assert.equal(buildPostMatchReport({ match, profileId: 7 }).combat, null);
const broken = normalizeTelemetry({ ...telemetry, combat: { ...telemetry.combat, profileId: 999 } });
assert.equal(broken.status, 'ready');
assert.equal(broken.data.combat, null);
assert.ok(broken.warnings.length);
const conflict = normalizeTelemetry({ ...telemetry, metrics: {
  apm: { value: 50, definition: 'measured-test' },
  feudalSeconds: { value: 200, definition: 'age-reached-game-seconds-v1' },
} });
assert.equal(conflict.status, 'ready');
assert.equal(conflict.data.combat, null);
assert.equal(conflict.data.metrics.apm.value, 50);
assert.match(conflict.warnings.join(' '), /edades del informe de combate/);
const roster = [{ isYou: true, team: 1 }, { team: 1 }, { team: 2 }, { team: null }];
assert.equal(civRelation(roster[0], roster), 'you');
assert.equal(civRelation(roster[1], roster), 'ally', 'a teammate is never labeled as a rival');
assert.equal(civRelation(roster[2], roster), 'opponent');
assert.equal(civRelation(roster[3], roster), 'unknown');
assert.equal(civRelation({ team: 2 }, []), 'unknown', 'unknown own team does not invent opposition');

console.log('Combate: edades, atribución, categorías, cobertura, costes, logros y persistencia OK.');
