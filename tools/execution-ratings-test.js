'use strict';

const assert = require('node:assert/strict');
const { buildExecutionRatings, METHOD_VERSION } = require('../src/execution-ratings');

function stage(id, score = 80, changes = {}) {
  const metric = (metricId) => ({ id: metricId, value: 2, unit: '%',
    definition: `${metricId}-test-v1`, comparison: { sampleSize: 5,
      percentile: score, median: 10, delta: -8, improved: true } });
  return { id, status: 'ready', score, sampleSize: 5,
    metrics: [metric('tcIdleRatio'), metric('villagerIdleRatio')], ...changes };
}

function report(score = 80) {
  return { status: 'ready', stages: ['opening', 'feudal', 'castle'].map((id) => stage(id, score)) };
}

function noSkillClaims(result) {
  assert.equal(result.micro.grade, null);
  assert.equal(result.micro.score, null);
  assert.equal(result.micro.status, 'unavailable');
  assert.equal(result.decisions.grade, null);
  assert.equal(result.decisions.score, null);
  assert.equal(result.decisions.status, 'unavailable');
  assert.equal(result.economic.scope, 'personal');
  assert.ok(!JSON.stringify(result).includes('jugadores'));
  assert.ok(!Object.hasOwn(result.economic, 'percentile'));
}

function main() {
  for (const input of [undefined, null, false, [], {}, { stages: null }, { stages: {} }]) {
    const result = buildExecutionRatings(input);
    assert.equal(result.economic.grade, null);
    assert.equal(result.economic.status, 'unavailable');
    assert.deepEqual(result.personalHighlights, []);
    noSkillClaims(result);
  }

  const input = report();
  const snapshot = structuredClone(input);
  const ready = buildExecutionRatings(input);
  assert.equal(ready.methodVersion, METHOD_VERSION);
  assert.equal(ready.economic.label, 'Macro económica');
  assert.equal(ready.economic.scopeLabel, 'Ejecución económica personal');
  assert.equal(ready.economic.status, 'ready');
  assert.equal(ready.economic.grade, 'A');
  assert.equal(ready.economic.score, 80);
  assert.equal(ready.economic.minimumStageSampleSize, 5);
  assert.ok(ready.economic.stages.every((item) => item.grade === 'A'));
  assert.deepEqual(ready.personalHighlights, [], 'a composite/midrank score cannot claim strictly better');
  assert.deepEqual(input, snapshot, 'the adapter does not mutate postmatch data');
  noSkillClaims(ready);

  for (const [score, grade] of [[100, 'S'], [90, 'S'], [89, 'A'], [75, 'A'],
    [74, 'B'], [50, 'B'], [49, 'C'], [25, 'C'], [24, 'D'], [0, 'D']]) {
    assert.equal(buildExecutionRatings(report(score)).economic.grade, grade);
  }

  const tied = report(50);
  for (const phase of tied.stages) for (const metric of phase.metrics) {
    metric.comparison = { sampleSize: 5, percentile: 50, median: 2,
      delta: 0, improved: false, strictlyBetterPercent: 0 };
  }
  assert.equal(buildExecutionRatings(tied).economic.grade, 'B');
  assert.deepEqual(buildExecutionRatings(tied).personalHighlights, [], 'ties earn no strictly-better highlight');

  const invalidMutations = [
    (phase) => { phase.status = 'incomplete'; },
    (phase) => { phase.sampleSize = 4; },
    (phase) => { phase.sampleSize = 5.5; },
    (phase) => { phase.sampleSize = '5'; },
    (phase) => { phase.score = NaN; },
    (phase) => { phase.score = Infinity; },
    (phase) => { phase.score = -1; },
    (phase) => { phase.score = 101; },
    (phase) => { phase.score = '80'; },
    (phase) => { phase.score = 99; },
    (phase) => { phase.metrics.pop(); },
    (phase) => { phase.metrics = {}; },
    (phase) => { delete phase.metrics[1]; phase.score = 40; },
    (phase) => { phase.metrics[1] = structuredClone(phase.metrics[0]); },
    (phase) => { phase.metrics[1].id = 'apm'; },
    (phase) => { phase.metrics[1].value = null; },
    (phase) => { phase.metrics[1].value = 101; },
    (phase) => { phase.metrics[1].definition = ''; },
    (phase) => { phase.metrics[1].comparison = null; },
    (phase) => { phase.metrics[1].comparison.percentile = NaN; },
    (phase) => { phase.metrics[1].comparison.sampleSize = 6; },
    (phase) => { phase.metrics[1].comparison.delta = Infinity; },
  ];
  for (const mutate of invalidMutations) {
    const data = report(); mutate(data.stages[1]);
    const output = buildExecutionRatings(data);
    assert.equal(output.economic.grade, null, 'invalid stage prevents an overall economic grade');
    assert.equal(output.economic.stages[1].grade, null);
    assert.equal(output.economic.status, 'partial');
    noSkillClaims(output);
  }

  const missingStage = report(); missingStage.stages.pop();
  assert.equal(buildExecutionRatings(missingStage).economic.grade, null);
  const duplicate = report(); duplicate.stages.push(stage('feudal'));
  assert.equal(buildExecutionRatings(duplicate).economic.grade, null);
  const endedBeforeCastle = report();
  endedBeforeCastle.stages[2] = { id: 'castle', status: 'not_reached', score: null, metrics: [] };
  const early = buildExecutionRatings(endedBeforeCastle);
  assert.equal(early.economic.grade, 'A');
  assert.equal(early.economic.stages[2].grade, null);
  assert.equal(early.economic.stages[2].status, 'not_reached');
  for (const data of [{ ...report(), status: 'pending' },
    { ...report(), data: { telemetryStatus: 'invalid' } }]) {
    assert.equal(buildExecutionRatings(data).economic.grade, null);
  }

  const highlighted = report();
  highlighted.stages[0].metrics[0].comparison.strictlyBetterPercent = 80;
  const highlight = buildExecutionRatings(highlighted).personalHighlights[0];
  assert.equal(highlight.scope, 'personal');
  assert.equal(highlight.metricId, 'tcIdleRatio');
  assert.equal(highlight.phaseId, 'opening');
  assert.equal(highlight.strictlyBetterPercent, 80);
  assert.equal(highlight.sampleSize, 5);
  assert.match(highlight.detail, /tus 5 partidas anteriores comparables/);
  for (const strict of [null, '80', NaN, Infinity, -1, 101, 90, 50, 0]) {
    const data = report(); data.stages[0].metrics[0].comparison.strictlyBetterPercent = strict;
    assert.deepEqual(buildExecutionRatings(data).personalHighlights, [], 'reject unsupported or inconsistent strict comparisons');
  }
  const noMedianImprovement = report();
  noMedianImprovement.stages[0].metrics[0].comparison.strictlyBetterPercent = 80;
  noMedianImprovement.stages[0].metrics[0].comparison.delta = 0;
  assert.deepEqual(buildExecutionRatings(noMedianImprovement).personalHighlights, []);

  // Neither outcome nor activity/combat summaries can fill absent evidence.
  const proxies = { ...report(), stages: [], result: { status: 'won' },
    metrics: { apm: { value: 300 }, eapm: { value: 150 } },
    combat: { kills: 100, deaths: 1 }, grade: 'S', percentile: 99 };
  const unavailable = buildExecutionRatings(proxies);
  assert.equal(unavailable.economic.grade, null);
  assert.deepEqual(unavailable.personalHighlights, []);
  noSkillClaims(unavailable);

  // Check the real postmatch contract, including percentage presentation and
  // compatibility filtering, rather than testing only hand-built stage data.
  const { buildPostMatchReport, recordFromMatch } = require('../src/postmatch');
  const now = Date.parse('2026-11-14T19:00:00Z');
  const match = (id, startedAt) => ({ matchId: id, mapName: 'Arabia', leaderboardId: 3,
    startedAt, finishedAt: startedAt + 1200000,
    players: [{ profileId: 7, civ: 'Franks', won: true }] });
  const telemetry = (id, value) => ({ schemaVersion: 1, matchId: id, profileId: 7,
    clock: 'game', source: { id: 'rating-test', version: '1', type: 'replay-analysis' },
    context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', opening: 'Scouts',
      gameSpeed: 'normal', startingAge: 'dark', patch: 'test' },
    durationSeconds: 1200, phases: Object.fromEntries(['opening', 'feudal', 'castle'].map((id) => [id,
      { reached: true, complete: true, durationSeconds: 400, metrics: {
        tcIdleRatio: { value, definition: 'tc-test' },
        villagerIdleRatio: { value, definition: 'villager-test' },
      } }])) });
  const records = Array.from({ length: 5 }, (_, index) => {
    const id = index + 1;
    return recordFromMatch(match(id, now - id * 86400000), 7, telemetry(id, 0.1));
  });
  const measuredReport = buildPostMatchReport({ match: match(100, now), profileId: 7,
    telemetry: telemetry(100, 0.01), records });
  const fromPostmatch = buildExecutionRatings(measuredReport);
  assert.deepEqual(measuredReport.executionRatings, fromPostmatch, 'the report carries the validated presentation');
  assert.equal(fromPostmatch.economic.grade, 'S');
  assert.equal(fromPostmatch.economic.minimumStageSampleSize, 5);
  const hasDirectStrictComparison = measuredReport.stages.some((phase) => phase.metrics.some((metric) =>
    typeof metric.comparison.strictlyBetterPercent === 'number'));
  if (!hasDirectStrictComparison) {
    assert.deepEqual(fromPostmatch.personalHighlights, [], 'midrank-only comparisons cannot create a strict highlight');
  }
  noSkillClaims(fromPostmatch);
  assert.equal(fromPostmatch.personalHighlights[0].strictlyBetterPercent, 100);
  const { renderPostMatch } = require('../ui/tactical-ui');
  const rendered = renderPostMatch(measuredReport);
  assert.match(rendered, /Tu ejecución/);
  assert.match(rendered, /Escala personal S–D/);
  assert.match(rendered, /tus 5 partidas anteriores comparables/);
  const restricted = renderPostMatch(measuredReport, { replay: false, comparison: false });
  assert.doesNotMatch(restricted, /Tu ejecución|tus 5 partidas anteriores comparables/);

  process.stdout.write('Execution ratings: personal economic evidence, S-D boundaries, missing data and ties passed.\n');
}

if (require.main === module) main();
module.exports = { main };
