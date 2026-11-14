'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PerformanceStore, buildPostMatchReport, normalizeTelemetry, recordFromMatch,
  completedMatchTransition, gradeFor, MIN_BASELINE,
} = require('../src/postmatch');

const CURRENT = Date.parse('2026-11-14T18:00:00Z');
function match(id = 100, changes = {}) {
  return { matchId: id, mapName: 'Arabia', leaderboardId: 'rm_1v1',
    startedAt: CURRENT, finishedAt: CURRENT + 20 * 60 * 1000, ongoing: false,
    players: [{ profileId: 7, name: 'Jugador', civ: 'Franks', won: true, matchRatingDiff: 15 },
      { profileId: 8, name: 'Rival', civ: 'Mayans', won: false }], ...changes };
}
function telemetry(id = 100, changes = {}) {
  const metric = (value, definition) => ({ value, definition });
  const phase = () => ({ reached: true, complete: true, durationSeconds: 600,
    metrics: { tcIdleRatio: metric(0.01, 'tc-idle-opportunity-v1'),
      housedRatio: metric(0.01, 'population-blockage-v1'),
      villagerIdleRatio: metric(0.01, 'weighted-villager-idle-v1') } });
  return { schemaVersion: 1, matchId: id, profileId: 7, clock: 'game',
    source: { id: 'fixture-parser', version: '1.0', type: 'replay-analysis', label: 'Replay de prueba' },
    context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', opening: 'Scout rush',
      gameSpeed: 'normal', startingAge: 'dark', patch: 'test-patch' },
    durationSeconds: 2100,
    metrics: { apm: metric(120, 'all-game-commands-v1'), eapm: metric(60, 'effective-commands-v1'),
      feudalSeconds: metric(620, 'age-reached-game-seconds-v1'),
      castleSeconds: metric(1200, 'age-reached-game-seconds-v1') },
    phases: { opening: phase(), feudal: phase(), castle: phase() }, ...changes };
}
function baseline(count = MIN_BASELINE) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const id = i + 1;
    const input = telemetry(id);
    for (const phase of Object.values(input.phases)) {
      for (const metric of Object.values(phase.metrics)) metric.value = 0.1 + i * 0.01;
    }
    input.metrics.apm.value = 200 + i;
    rows.push(recordFromMatch(match(id, { startedAt: CURRENT - (i + 1) * 86400000,
      finishedAt: CURRENT - (i + 1) * 86400000 + 20 * 60 * 1000 }), 7, input));
  }
  return rows;
}
function report(changes = {}) {
  return buildPostMatchReport({ match: match(), profileId: 7, ...changes });
}

function main() {
  const absent = report();
  assert.equal(absent.result.status, 'won');
  assert.equal(absent.result.ratingDiff, 15);
  assert.equal(absent.result.elapsedSeconds, 1200);
  assert.equal(absent.result.durationSeconds, null, 'tiempo real no se disfraza de reloj de juego');
  assert.ok(absent.stages.every((phase) => phase.grade === null && phase.status === 'needs_replay'));
  assert.ok(Object.values(absent.metrics).every((metric) => metric.value === null));
  assert.equal(absent.mapBenchmark.status, 'empty');
  assert.equal(absent.mapBenchmark.winRate, null, 'ausencia de historial no equivale a 0%');

  const history = [
    { matchId: 1, startedAt: CURRENT - 60000, mapName: 'Arabia', leaderboardId: 'rm_1v1', won: true, civ: 'Franks' },
    { matchId: 2, startedAt: CURRENT - 120000, mapName: 'Arabia', leaderboardId: 3, won: false, civ: 'Mayans' },
    { matchId: 3, startedAt: CURRENT - 180000, mapName: 'Arabia', leaderboardId: 3, won: null },
    { matchId: 4, startedAt: CURRENT - 240000, mapName: 'Arena', leaderboardId: 3, won: false },
    { matchId: 5, startedAt: CURRENT - 300000, mapName: 'Arabia', leaderboardId: 4, won: false },
    { matchId: 6, startedAt: CURRENT + 60000, mapName: 'Arabia', leaderboardId: 3, won: false },
    { matchId: 7, mapName: 'Arabia', leaderboardId: 3, won: false },
    { matchId: 100, startedAt: CURRENT - 60000, mapName: 'Arabia', leaderboardId: 3, won: false },
    { matchId: 1, startedAt: CURRENT - 60000, mapName: 'Arabia', leaderboardId: 3, won: true },
  ];
  const summary = report({ historyRows: history });
  assert.equal(summary.mapBenchmark.games, 2);
  assert.equal(summary.mapBenchmark.unknownResults, 1);
  assert.equal(summary.mapBenchmark.winRate, 50);
  assert.equal(summary.mapBenchmark.afterWinRate, 67);
  assert.equal(summary.mapBenchmark.recent.length, 3, 'modo/mapa/tiempo/ID actual filtran todos los resultados');
  assert.equal(report({ historyRows: history, historyError: 'HTTP 429' }).mapBenchmark.status, 'partial');
  assert.equal(report({ historyError: 'HTTP 429' }).mapBenchmark.status, 'error');
  assert.equal(report({ match: match(100, { leaderboardId: 'unranked' }), historyRows: history }).mapBenchmark.status, 'unavailable');
  assert.equal(report({ match: match(100, { players: [] }) }), null);

  const measured = report({ telemetry: telemetry(), records: baseline() });
  assert.ok(measured.stages.every((phase) => phase.grade === 'A' && phase.score === 100));
  assert.ok(measured.stages.every((phase) => phase.sampleSize === MIN_BASELINE));
  assert.equal(measured.metrics.apm.value, 120);
  assert.equal(measured.metrics.apm.comparison.delta, -82);
  assert.equal(measured.metrics.apm.comparison.improved, null, 'menos/más APM no es mérito automático');
  assert.equal(measured.result.durationSeconds, 2100);
  assert.ok(measured.improvements.length > 0);

  const insufficient = report({ telemetry: telemetry(), records: baseline(MIN_BASELINE - 1) });
  assert.ok(insufficient.stages.every((phase) => phase.grade === null && phase.status === 'needs_baseline'));
  assert.equal(insufficient.stages[0].sampleSize, MIN_BASELINE - 1);
  const equal = telemetry();
  for (const phase of Object.values(equal.phases)) for (const metric of Object.values(phase.metrics)) metric.value = 0.12;
  const ties = report({ telemetry: equal, records: baseline() });
  assert.ok(ties.stages.every((phase) => phase.grade === 'C' && phase.score === 50));
  assert.equal(gradeFor(80), 'A');
  assert.equal(gradeFor(60), 'B');
  assert.equal(gradeFor(40), 'C');
  assert.equal(gradeFor(20), 'D');
  assert.equal(gradeFor(0), 'E');
  assert.equal(gradeFor(null), null);

  const mismatchCases = [
    (data) => { data.context.mapName = 'Arena'; },
    (data) => { data.context.leaderboardId = 4; },
    (data) => { data.context.civ = 'Mayans'; },
    (data) => { data.context.opening = 'Fast castle'; },
    (data) => { data.context.gameSpeed = 'fast'; },
    (data) => { data.context.startingAge = 'feudal'; },
    (data) => { data.context.patch = 'other-patch'; },
    (data) => { data.source.version = '2.0'; },
    (data) => { data.source.id = 'other-parser'; },
    (data) => { for (const phase of Object.values(data.phases)) for (const metric of Object.values(phase.metrics)) metric.definition += '-changed'; },
  ];
  for (const mutate of mismatchCases) {
    const records = baseline();
    for (const row of records) mutate(row.telemetry);
    const output = report({ telemetry: telemetry(), records });
    assert.ok(output.stages.every((phase) => phase.grade === null), 'contextos/definiciones incompatibles nunca generan nota');
  }
  const undetected = telemetry(); undetected.context.opening = '';
  assert.ok(report({ telemetry: undetected, records: baseline() }).stages.every((phase) => phase.grade === null));
  const oneMetric = telemetry();
  oneMetric.phases.opening.metrics = { tcIdleRatio: oneMetric.phases.opening.metrics.tcIdleRatio };
  assert.equal(report({ telemetry: oneMetric, records: baseline() }).stages[0].grade, null);
  const partial = telemetry(); partial.phases.feudal.complete = false;
  assert.equal(report({ telemetry: partial, records: baseline() }).stages[1].status, 'incomplete');
  const notReached = telemetry(); notReached.phases.castle = { reached: false };
  assert.equal(report({ telemetry: notReached, records: baseline() }).stages[2].status, 'not_reached');

  const invalidCases = [
    { ...telemetry(), matchId: 9 }, { ...telemetry(), profileId: 9 },
    { ...telemetry(), clock: 'wall' }, { ...telemetry(), source: { id: 'x' } },
    { ...telemetry(), schemaVersion: 2 },
  ];
  for (const invalid of invalidCases) {
    const output = report({ telemetry: invalid, records: baseline() });
    assert.equal(output.data.telemetryStatus, 'invalid');
    assert.ok(output.stages.every((phase) => phase.grade === null));
    assert.equal(output.metrics.apm.value, null);
  }
  const invalidValues = telemetry(); invalidValues.metrics.apm.value = null;
  invalidValues.phases.opening.metrics.tcIdleRatio.value = 1.1;
  assert.equal(report({ telemetry: invalidValues }).metrics.apm.value, null);
  assert.ok(report({ telemetry: invalidValues }).data.warnings.length >= 2);
  const impossible = telemetry(); impossible.metrics.castleSeconds.value = 500;
  assert.equal(normalizeTelemetry(impossible).status, 'invalid');
  const liveMatch = match(100, { ongoing: true, finishedAt: null });
  const live = report({ match: liveMatch, telemetry: telemetry(), records: baseline() });
  assert.equal(live.result.status, 'pending');
  assert.ok(live.stages.every((phase) => phase.grade === null));

  const memory = new PerformanceStore();
  assert.equal(memory.recordMatch(liveMatch, 7), null, 'no guarda partidas que siguen en curso');
  memory.recordMatch(match(), 7, telemetry());
  memory.recordMatch(match(100, { players: [{ profileId: 7, won: null, civ: 'Franks' }] }), 7);
  assert.equal(memory.list(7).length, 1);
  assert.equal(memory.list(7)[0].won, true, 'respuesta parcial no borra resultado confirmado');
  assert.ok(memory.list(7)[0].telemetry, 'respuesta parcial no borra replay analizado');
  assert.equal(memory.getMatch(7, 100).players.length, 2, 'respuesta parcial conserva el roster para futuras importaciones');
  assert.equal(memory.getMatch(7, 100).players.find((p) => p.profileId === 7).won, true);
  assert.equal(memory.getMatch(8, 100), null, 'solo restaura partidas del perfil indicado');
  const copy = memory.list(7); copy[0].won = false;
  assert.equal(memory.list(7)[0].won, true, 'el caller no puede mutar el almacén indirectamente');
  assert.equal(memory.list(8).length, 0);
  const ended = { status: 'idle', lastMatch: match() };
  const playing = { status: 'ongoing', phase: 'ingame', match: { matchId: 100 } };
  assert.equal(completedMatchTransition(playing, ended, 7).matchId, 100);
  assert.equal(completedMatchTransition(null, ended, 7), null);
  assert.equal(completedMatchTransition({ ...playing, phase: 'lobby' }, ended, 7), null);
  assert.equal(completedMatchTransition(playing, { ...ended, lastMatch: match(999) }, 7), null);

  const directory = path.join(__dirname, `.postmatch-test-${process.pid}`);
  const filePath = path.join(directory, 'history.json');
  fs.mkdirSync(directory);
  try {
    const disk = new PerformanceStore({ filePath });
    for (const row of baseline()) disk.upsert(row);
    disk.recordMatch(match(), 7, telemetry());
    assert.equal(disk.flush(), true);
    const loaded = new PerformanceStore({ filePath });
    assert.equal(loaded.list(7).length, MIN_BASELINE + 1);
    assert.equal(loaded.getMatch(7, 100).mapName, 'Arabia');
    assert.equal(loaded.getMatch(7, 100).players.length, 2);
    const output = report({ records: loaded.list(7) });
    assert.ok(output.stages.every((phase) => phase.grade === 'A'));
    assert.equal(output.mapBenchmark.games, MIN_BASELINE, 'partida actual persistida queda fuera de toda referencia');
    loaded.recordMatch(match(), 7, telemetry());
    assert.equal(loaded.flush(), true, 'reemplazo atómico funciona sobre archivo existente');
    fs.writeFileSync(filePath, '{invalid');
    const corrupt = new PerformanceStore({ filePath });
    assert.equal(corrupt.list(7).length, 0);
    assert.ok(corrupt.lastError);
  } finally {
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  }
  console.log('Postmatch: resultados, referencias por mapa, telemetría, notas y persistencia OK.');
}

main();
