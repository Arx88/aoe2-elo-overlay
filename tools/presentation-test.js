'use strict';
const assert = require('node:assert/strict');
const { getProductState } = require('../src/product');
const { projectOverlayState, projectRivalPayload, projectScoutPayload } = require('../src/presentation');
const free = getProductState();
const pro = { featureAccess: { ...free.featureAccess, rosterDetails: true } };
const max = getProductState({ accessKeyGranted: true });
const state = { status: 'ongoing', phase: 'lobby', profileId: 7,
  match: { matchId: 100, mapName: 'Arabia', players: [{ civ: 'Franks' }] },
  players: [{ profileId: 7, isYou: true, team: 1, name: 'Yo', civ: 'Franks', rating: 1100, rank: 50, peak: 1500 },
    { profileId: 8, team: 2, name: 'Rival', civ: 'Britons', rating: 1200, rank: 40, peak: 1600 }],
  lastMatch: { mapName: 'Arena', players: [{ civ: 'Mayans' }] } };
const projected = projectOverlayState(state, free);
assert.deepEqual(projected.players.map((p) => [p.name, p.rating]), [['Rival', 1200]]);
for (const unavailable of ['Britons', 'Franks', 'Mayans', 'Arabia', 'Arena', '1600']) {
  assert.ok(!JSON.stringify(projected).includes(unavailable), `Free excludes ${unavailable}`);
}
assert.equal(state.players[1].peak, 1600, 'projection never damages the main-process cache');
assert.strictEqual(projectOverlayState(state, pro), state);
const payload = { reports: [{ profileId: 8, name: 'Rival', civ: 'Britons', mapStats: { name: 'Arabia' },
  history: [{ civ: 'Mayans' }], openings: { top: 'Archer rush' },
  h2h: { wins: 2, losses: 1, games: 3, recent: [{ map: 'Arabia', civ: 'Franks' }] } }] };
const stripped = projectRivalPayload(payload, free);
assert.equal(stripped.reports[0].h2h.games, 3);
assert.equal(stripped.reports[0].civ, undefined);
assert.equal(stripped.reports[0].h2h.recent, undefined);
assert.equal(projectRivalPayload(payload, pro).reports[0].openings, null);
assert.ok(projectRivalPayload(payload, max).reports[0].openings);
assert.equal(projectScoutPayload({ tips: [{ opportunities: {} }] }, free), null);
assert.equal(projectScoutPayload({ tips: [] }, pro), null);
assert.ok(projectScoutPayload({ tips: [] }, max));
console.log('Presentación: Free solo nombre/ELO/H2H, Pro sin replay y ProMax con análisis; caché intacta OK.');
