'use strict';

const assert = require('node:assert/strict');
const { commandMetrics, ageReachedNotice } = require('../src/replay-analysis');
const { normalizeTelemetry, buildPostMatchReport } = require('../src/postmatch');
const { renderPostMatch } = require('../ui/tactical-ui');

const metrics = commandMetrics({ actions: 500, feudalMs: 480000, castleMs: 1000000 }, 1200000);
assert.equal(metrics.apm.value, 25);
assert.equal(metrics.feudalClickSeconds.value, 480);
assert.equal(metrics.castleClickSeconds.value, 1000);
assert.equal(metrics.feudalSeconds, undefined, 'a research order never proves age arrival');
assert.equal(commandMetrics({ actions: 0, feudalMs: null, castleMs: null }, 60000).apm.value, 0);
assert.equal(commandMetrics({ actions: 50 }, 0).apm, undefined);

const notice = { player: 4, channel: 0, tauntNumber: -1,
  message: '<player_id,4,0> ha avanzado a la Edad Feudal.',
  messageAGP: '@#4<player_id,4,0> ha avanzado a la Edad Feudal.' };
const packet = (chat) => ({ padding: [255, 255, 255, 255], text: JSON.stringify(chat) });
assert.deepEqual(ageReachedNotice(packet(notice)), { slot: 4, age: 'feudal' });
assert.equal(ageReachedNotice({ ...packet(notice), text: '<player_id,4,0> ha avanzado a la Edad Feudal.' }), null);
assert.equal(ageReachedNotice(packet({ ...notice, player: 2 })), null);
assert.equal(ageReachedNotice(packet({ ...notice, messageAGP: '<player_id,4,1>: ' + notice.message })), null);
assert.equal(ageReachedNotice(packet({ ...notice, channel: 2 })), null);
for (const [suffix, age] of [[' advanced to the Feudal Age.', 'feudal'], ['升级至城堡时代。', 'castle']]) {
  const message = '<player_id,4,0>' + suffix;
  assert.deepEqual(ageReachedNotice(packet({ ...notice, message, messageAGP: '@#4' + message })), { slot: 4, age });
}
const reached = commandMetrics({ feudalMs: 390227, castleMs: 1010062,
  ageReachedMs: { feudal: 520227, castle: 1170062 } }, 1800000);
assert.equal(reached.feudalSeconds.value, 520.2);
assert.equal(reached.feudalClickSeconds.value, 390.2);
assert.equal(reached.castleSeconds.value, 1170.1);
assert.equal(commandMetrics({ feudalMs: 600000, ageReachedMs: { feudal: 500000 } }, 1800000).feudalSeconds, undefined);

const telemetry = { schemaVersion: 1, matchId: '100', profileId: 7, clock: 'game', durationSeconds: 1200,
  source: { id: 'fixture', version: '1', type: 'replay-analysis' }, metrics,
  context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', opening: 'Scout Rush', gameSpeed: 'normal', startingAge: 'dark', patch: 'fixture' } };
const match = { matchId: '100', mapName: 'Arabia', leaderboardId: 3, finishedAt: 2000000,
  players: [{ profileId: 7, civ: 'Franks', won: true }] };
const report = buildPostMatchReport({ match, profileId: 7, telemetry });
assert.equal(report.stages[1].valueSeconds, 480);
assert.equal(report.stages[1].valueType, 'research-command');
assert.equal(report.stages[1].grade, null);
assert.ok(report.stages[1].detail.includes('llegada sin confirmar'));
assert.ok(!renderPostMatch(report).includes('Orden de avance a Feudal'));
assert.match(renderPostMatch(report, { compact: true }), /Llegadas sin confirmar/);
assert.ok(!renderPostMatch(report).includes('<span>Llegada a Feudal</span>'));
const legacy = { ...telemetry, source: { id: 'aoe2rec-js', version: '0.1.25', type: 'replay-analysis' },
  metrics: { feudalSeconds: { value: 480, definition: 'age-reached-game-seconds-v1' } } };
const normalized = normalizeTelemetry(legacy);
assert.equal(normalized.data.metrics.feudalSeconds, undefined);
assert.equal(normalized.data.metrics.feudalClickSeconds.value, 480);
assert.equal(legacy.metrics.feudalSeconds.value, 480, 'migration does not mutate saved input');
assert.ok(normalized.warnings.length);
const arrived = normalizeTelemetry({ ...telemetry, metrics: { feudalSeconds: { value: 610, definition: 'age-reached-game-seconds-v1' } } });
assert.equal(arrived.data.metrics.feudalSeconds.value, 610, 'other measured sources still support true arrivals');
assert.equal(normalizeTelemetry({ ...telemetry, metrics: { ...metrics, castleClickSeconds: { ...metrics.castleClickSeconds, value: 200 } } }).status, 'invalid');
console.log('Replay: órdenes de avance, llegadas, ceros y migración de tiempos anteriores OK.');
