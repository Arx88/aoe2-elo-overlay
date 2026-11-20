'use strict';

const assert = require('node:assert/strict');
const { seeOrder, pickCheckpoint, VERSION } = require('../src/opening-review');
const { checkReplayRoster, checkReplayStart } = require('../src/replay-analysis');
const { buildPostMatchReport, recordFromMatch } = require('../src/postmatch');
const { renderPostMatch } = require('../ui/tactical-ui');

const settings = { starting_age_id: 2, starting_resources_id: 0, num_starting_units: 0, speed: 1.69 };
const base = { settings, build: 188329, mapName: 'Arabia', mode: 3, playerCount: 2 };
const player = { feudalMs: 490000, castleMs: 875000, practiceOrders: {} };
seeOrder(player.practiceOrders, 'Move', { unit_id: 448 }, 10_000); // initial scout isn't an order to train
seeOrder(player.practiceOrders, 'DeQueue', { unit_id: 448 }, 690_000);
seeOrder(player.practiceOrders, 'DeQueue', { unit_id: 448 }, 650_000);
const checkpoint = pickCheckpoint({ ...base, player, opening: 'Scout Rush' });
assert.deepEqual(checkpoint, { key: 'scout', atSeconds: 650, build: 188329, speed: 1.69, version: VERSION });
assert.equal(pickCheckpoint({ ...base, player, opening: 'Tower Rush' }), null);
assert.equal(pickCheckpoint({ ...base, settings: { ...settings, starting_age_id: 3 }, player, opening: 'Scout Rush' }), null);
assert.equal(pickCheckpoint({ ...base, mode: 13, player, opening: 'Scout Rush' }), null);
assert.equal(pickCheckpoint({ ...base, playerCount: 8, player, opening: 'Scout Rush' }), null);
assert.equal(pickCheckpoint({ ...base, player: { ...player, castleMs: 600000 }, opening: 'Scout Rush' }), null);

const arenaPlayer = { castleMs: 830_000, imperialMs: 1_900_000, practiceOrders: {} };
seeOrder(arenaPlayer.practiceOrders, 'Build', {}, 1_030_000, [621]);
seeOrder(arenaPlayer.practiceOrders, 'DeQueue', { unit_id: 125 }, 1_012_000);
assert.equal(pickCheckpoint({ ...base, mapName: 'Arena', player: arenaPlayer, opening: 'Fast Castle' }).key, 'monk');
assert.equal(pickCheckpoint({ ...base, mapName: 'Arena', player: { ...arenaPlayer, castleMs: 600_000 }, opening: 'Fast Castle' }), null);

const at = 1_800_000_000_000;
const match = {
  matchId: 100, mapName: 'Arabia', leaderboardId: 3, ongoing: false,
  startedAt: at, finishedAt: at + 1_000_000,
  players: [{ profileId: 7, civ: 'Franks', won: false }, { profileId: 8, civ: 'Mayans', won: true }],
};
const telemetry = {
  schemaVersion: 1, matchId: '100', profileId: 7, clock: 'game',
  durationSeconds: 1_200,
  source: { id: 'fixture', version: '1', type: 'replay-analysis', label: 'Fixture de órdenes' },
  context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', opening: 'Scout Rush',
    gameSpeed: 'normal', startingAge: 'dark', patch: '188329' },
  metrics: { feudalClickSeconds: { value: 490, definition: 'first-age-research-command-game-seconds-v1' } },
  openingCheckpoint: checkpoint,
};
function prior(id, checkpointOverrides = {}, contextOverrides = {}) {
  const reference = { ...match, matchId: id, startedAt: at - (100 - id) * 2_000_000,
    mapName: contextOverrides.mapName || match.mapName };
  return recordFromMatch(reference, 7, { ...telemetry, matchId: String(id),
    context: { ...telemetry.context, ...contextOverrides },
    openingCheckpoint: { ...checkpoint, ...checkpointOverrides } });
}
const reference = [prior(91, { atSeconds: 665 }), prior(92, { atSeconds: 680 }), prior(93, { atSeconds: 685 })];
const incompatible = [prior(94, { speed: 1.5 }), prior(95, { build: 188330 }),
  prior(96, { atSeconds: 475 }), prior(97, {}, { mapName: 'Runestones' })];
const report = buildPostMatchReport({ match, profileId: 7, telemetry, records: [...reference, ...incompatible] });
assert.equal(report.openingReview.anchorSeconds, 490);
assert.equal(report.openingReview.atSeconds, 650);
assert.deepEqual(report.openingReview.comparison, { sampleSize: 3, required: 3, medianSeconds: 190, deltaSeconds: -30,
  recentSeconds: [175, 190, 195] });
assert.ok(report.stages.every((stage) => stage.grade == null), 'un tiempo de órdenes no genera nota de ejecución');
const compact = renderPostMatch(report, { compact: true });
assert.doesNotMatch(compact, /Primer Scout encargado|0:30 antes|2:40 entre órdenes/);
assert.doesNotMatch(renderPostMatch(report), /Primer Scout encargado|0:30 antes|2:40 entre órdenes/);
assert.doesNotMatch(compact, /Para practicar|review-opening-trend/);
const more = [...reference, prior(89, { atSeconds: 700 }), prior(90, { atSeconds: 710 })];
const record = buildPostMatchReport({ match, profileId: 7, telemetry, records: more });
assert.equal(record.openingReview.comparison.sampleSize, 5);
assert.doesNotMatch(renderPostMatch(record), /Tu transición más corta|Más corta que en|review-opening-mark/);
assert.ok(record.stages.every((stage) => stage.grade == null), 'ni el intervalo más corto alcanza para una evaluación');

const first = buildPostMatchReport({ match, profileId: 7, telemetry, historyPending: true });
assert.equal(first.mapBenchmark.status, 'loading');
assert.equal(first.openingReview.comparison.medianSeconds, null);
assert.doesNotMatch(renderPostMatch(first), /Primera referencia/);
assert.doesNotMatch(renderPostMatch(first), /0\/3 partidas comparables/);

assert.equal(pickCheckpoint({ ...base, mode: 4, playerCount: 8, player, opening: 'Scout Rush' }).key, 'scout');
const team = buildPostMatchReport({ match: { ...match, leaderboardId: 4 }, profileId: 7,
  telemetry: { ...telemetry, context: { ...telemetry.context, leaderboardId: 4 } } });
assert.ok(team.openingReview);
assert.equal(team.openingReview.comparison, null);

assert.equal(checkReplayRoster(match.players, [{ profile_id: 8 }, { profile_id: 7 }, { profile_id: 0 }]), 2);
assert.throws(() => checkReplayRoster(match.players, [{ profile_id: 7 }, { profile_id: 9 }]), /roster/);
assert.doesNotThrow(() => checkReplayStart(at, at / 1000 + 22));
assert.throws(() => checkReplayStart(at, at / 1000 - 400), /hora del replay/);

console.log('Postmatch: órdenes, contexto AoE2, comparación compatible, vistas y validación del replay OK.');
