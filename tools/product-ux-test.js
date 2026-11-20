'use strict';

const assert = require('node:assert/strict');
const { observeQueue, collectCastlesWindow } = require('../src/castles-window');
const { buildPostMatchReport, recordFromMatch } = require('../src/postmatch');
const { computeTips } = require('../src/scout');
const { historyCutoff, hideLobbyCivs } = require('../src/aoe');
const { parseMapStats } = require('../src/rival');
const { resolveMode } = require('../src/insights');
const { renderRival, renderPostMatch, renderAutomaticOpportunities } = require('../ui/tactical-ui');

const own = { profileId: 1, feudalMs: 390_000, castleMs: 1_020_000, queues: [] };
const rival = { profileId: 2, feudalMs: 410_000, castleMs: 898_000, queues: [] };
function enqueue(side, id, amount, ms) { observeQueue(side.queues, 'DeQueue', { unit_id: id, amount }, ms); }
enqueue(own, 448, 6, 700_000);
enqueue(own, 83, 3, 810_000);
enqueue(own, 448, 2, 898_000);
enqueue(own, 448, 1, 1_020_000);
enqueue(rival, 4, 14, 801_000);
enqueue(rival, 93, 2, 850_000);
enqueue(rival, 93, 5, 899_000);
observeQueue(own.queues, 'Attack', { unit_id: 448, amount: 99 }, 700_000);
const window = collectCastlesWindow({ self: own, rival, replayEndMs: 1_800_000 });
assert.equal(window.cutoffMs, 898_000);
assert.equal(window.self.beforeCut.scout, 6);
assert.equal(window.rival.beforeCut.archer, 14);
assert.equal(window.rival.beforeCut.spear, 2);
assert.equal(window.between.orders.scout, 2, 'at the earlier click is between; the later click is excluded');
assert.equal(collectCastlesWindow({ self: own, rival, replayEndMs: null }), null, 'requires covered replay');
const noAdvance = collectCastlesWindow({ self: { ...own, castleMs: null }, rival, replayEndMs: 1_800_000 });
assert.equal(noAdvance.self.castleMs, null);
assert.equal(noAdvance.between, null);

const match = {
  matchId: 33, mapName: 'Arabia', leaderboardId: 3, startedAt: 1_800_000_000_000, finishedAt: 1_800_001_000_000,
  players: [{ profileId: 1, civ: 'Bulgarians', won: false }, { profileId: 2, civ: 'Chinese', won: true }],
};
const telemetry = {
  schemaVersion: 1, matchId: '33', profileId: 1, clock: 'game', durationSeconds: 1800,
  source: { id: 'fixture', version: '1', type: 'replay-analysis' },
  context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Bulgarians', startingAge: 'dark', gameSpeed: 'normal' },
  metrics: {
    feudalClickSeconds: { value: 390, definition: 'first-age-research-command-game-seconds-v1' },
    castleClickSeconds: { value: 1020, definition: 'first-age-research-command-game-seconds-v1' },
  },
  castlesWindow: window,
};
function report(raw = telemetry) { return buildPostMatchReport({ match, profileId: 1, telemetry: raw }); }
const html = renderPostMatch(report());
assert.doesNotMatch(html, /Corte común|Scouts en cola|primer taller de asedio|Orden de avance/i);
const overlay = renderPostMatch(report(), { compact: true });
assert.match(overlay, /Llegadas sin confirmar/);
assert.match(overlay, /Combate sin cobertura/);
assert.match(overlay, /Pedidos registrados hasta 14:58/);
assert.match(overlay, /6&nbsp;Scouts/);
assert.match(overlay, /14&nbsp;Arqueros/);
assert.doesNotMatch(renderPostMatch(report(), { compact: true, replay: false }), /Pedidos registrados/);
const loading = renderPostMatch({ ...report(), analysis: { status: 'analyzing' } }, { compact: true });
assert.match(loading, /data-phase="analyzing"/);
assert.doesNotMatch(loading, /Pedidos registrados/);
assert.doesNotMatch(overlay, /Corte común|Scouts en cola|primer taller de asedio|Orden de avance/i);
const reachedTelemetry = { ...telemetry, metrics: { ...telemetry.metrics,
  feudalSeconds: { value: 520, definition: 'age-reached-game-seconds-v1' },
  castleSeconds: { value: 1180, definition: 'age-reached-game-seconds-v1' },
} };
for (const compact of [false, true]) {
  const reachedHtml = renderPostMatch(report(reachedTelemetry), { compact });
  assert.match(reachedHtml, /Llegadas a cada edad/);
  assert.match(reachedHtml, /8:40/);
  assert.match(reachedHtml, /19:40/);
  assert.doesNotMatch(reachedHtml, /6:30|17:00|Orden de avance/);
}
assert.doesNotMatch(renderPostMatch(report(reachedTelemetry), { replay: false }), /Llegadas a cada edad/);
assert.equal(report({ ...telemetry, castlesWindow: { ...window, rivalProfileId: 99 } }).castlesWindow, null);
assert.equal(report({ ...telemetry, castlesWindow: { ...window, cutoffMs: 897000 } }).castlesWindow, null);
assert.equal(report({ ...telemetry, castlesWindow: { ...window, self: { ...window.self, feudalMs: 1000 } } }).castlesWindow, null);
assert.equal(report({ ...telemetry, durationSeconds: null }).castlesWindow, null);
assert.equal(report({ ...telemetry, source: { ...telemetry.source, type: 'game-telemetry' } }).castlesWindow, null);

const v4 = {
  ...telemetry,
  source: { ...telemetry.source, id: 'aoe2rec-js', version: '0.1.25+command-adapter-v4' },
  context: { ...telemetry.context, opening: 'Scout Rush', patch: 'fixture-build' },
  openingCheckpoint: { version: 'opening-orders-v1', key: 'scout', atSeconds: 595, build: 188329, speed: 1.69 },
};
const previous = [30, 31, 32].map((id) => recordFromMatch(
  { ...match, matchId: id, startedAt: match.startedAt - (33 - id) * 2_000_000 }, 1,
  { ...v4, matchId: String(id), castlesWindow: null, source: { ...v4.source, version: '0.1.25+command-adapter-v3' } },
));
const updated = buildPostMatchReport({ match, profileId: 1, telemetry: v4, records: previous });
assert.equal(updated.openingReview.comparison.sampleSize, 3, 'adapter extension preserves existing time references');
assert.ok(updated.castlesWindow, 'context in current v4 stays independent of v3 history');

const signalTip = {
  sample: 10,
  context: { scope: 'map', scopeLabel: 'en Arabia', modeLabel: 'RM 1v1' },
  likelyOpenings: [{ name: 'Scout rush', short: 'Scouts', games: 6, sample: 10 }],
};
const rivalHtml = (tip) => renderRival({ entry: { name: 'Rival', tip }, options: { smartTips: true } });
assert.match(rivalHtml(signalTip), /6 de 10/);
assert.match(rivalHtml(signalTip), /en Arabia · RM 1v1/);
assert.match(rivalHtml(signalTip), /¿se confirma un establo temprano\?/);
const fallbackHtml = rivalHtml({ ...signalTip, stale: true,
  context: { ...signalTip.context, scope: 'mode', scopeLabel: 'en el modo', fallbackReason: 'Sin muestra en Arabia' } });
assert.match(fallbackHtml, /datos guardados/);
assert.match(fallbackHtml, /Sin muestra en Arabia/);
assert.doesNotMatch(fallbackHtml, /establo temprano/);
assert.match(rivalHtml({ loading: true }), /Buscando aperturas/);
const plans = ['feudal', 'castle'].map((age) => ({
  age, status: 'ready', candidates: [{ label: 'Arqueros', score: 91, condition: 'Condición', history: { games: 0 } }],
  data: {},
}));
assert.doesNotMatch(renderAutomaticOpportunities(plans), /prioridad|91|Castillos/);
assert.match(renderAutomaticOpportunities(plans, { detail: true }), /Castillos/);

const priorRows = Array.from({ length: 6 }, (_, index) => ({
  map: 'Arabia', civ: 'Poles', won: index >= 3,
  strategy: index === 5 ? 'Scout rush' : 'Archer rush',
  opponents: [{ oppCiv: 'Franks', oppStrategy: 'Archer rush' }],
  matchId: 100 + index, startedAt: 1_000 + index, ladder: 'RM 1v1',
}));
const currentContext = { matchId: 105, cutoff: 2_000, mapName: 'Arabia', mode: resolveMode(3),
  ownCiv: 'Franks', rivalCiv: 'Poles' };
const history = [
  ...priorRows,
  { ...priorRows[0], matchId: 106, map: 'Arena' },
  { ...priorRows[0], matchId: 107, civ: 'Magyars' },
  { ...priorRows[0], matchId: 108, startedAt: 2_500 },
  { ...priorRows[0], matchId: 109, ladder: 'EW 1v1' },
  { ...priorRows[0], matchId: 110, opponents: [{ oppCiv: 'Teutons', oppStrategy: 'Scout rush' }] },
];
const matchupTip = computeTips(history, currentContext);
assert.equal(matchupTip.matchup.openingsSample, 6, 'only the current map, civ, mode and past matches');
assert.equal(matchupTip.matchup.games, 5, 'opening samples include other opposing civs, matchup samples do not');
assert.equal(matchupTip.matchup.losses, 3);
assert.equal(matchupTip.matchup.against[0].losses, 3);
const state = { match: { mapName: 'Arabia', leaderboardId: 3 }, players: [{ isYou: true, civ: 'Franks' }] };
const currentRival = (civ, currentState = state) => renderRival({
  entry: { name: 'Rival', player: { civ },
    tip: { ...matchupTip, recommend: [{ civ: 'Gurjaras' }, { civ: 'Teutons' }] } },
  state: currentState, options: { smartTips: true, civRecommender: true },
});
assert.match(currentRival('Poles'), /Poles en Arabia/);
assert.match(currentRival('Poles'), /3\/5<\/b> derrotas/);
assert.doesNotMatch(currentRival('Poles'), /Gurjaras|Teutons|Referencia para otra partida/);
assert.doesNotMatch(currentRival('Burgundians'), /Poles en Arabia|3\/5<\/b> derrotas/);
assert.doesNotMatch(currentRival('Poles', { ...state, match: { mapName: 'Arena', leaderboardId: 3 } }), /Poles en Arena|3\/5<\/b> derrotas/);
assert.doesNotMatch(currentRival('Poles', { ...state, players: [{ isYou: true, civ: 'Huns' }] }), /3\/5<\/b> derrotas/);
const independentOpening = renderRival({ state, options: { rivalOpenings: true },
  entry: { name: 'Rival', player: { civ: 'Poles' }, report: {
    openings: { openingCiv: 'Poles', mapCivAnalyzed: 9, mapCivFavorite: { short: 'Arqueros', count: 6 } },
  } } });
assert.match(independentOpening, /6 de 9 replays/);
const lobby = { ...state, phase: 'lobby', players: [
  { profileId: 1, isYou: true, civ: 'Franks' }, { profileId: 2, civ: 'Poles' },
] };
const masked = hideLobbyCivs(lobby);
assert.equal(masked.players[0].civ, 'Franks');
assert.equal(masked.players[1].civ, null);
assert.equal(lobby.players[1].civ, 'Poles', 'no se altera el registro archivado');
assert.strictEqual(hideLobbyCivs(state), state, 'se conservan las civs después de revelar');
assert.doesNotMatch(currentRival('Poles', lobby), /Poles en Arabia|3\/5<\/b> derrotas|Antecedentes de este cruce/);
const openingBeforeReveal = renderRival({ state: lobby, options: { rivalOpenings: true },
  entry: { name: 'Rival', player: { civ: 'Poles' }, report: {
    openings: { openingCiv: 'Poles', mapCivAnalyzed: 9, mapCivFavorite: { short: 'Arqueros', count: 6 },
      mapAnalyzed: 20, mapFavorite: { short: 'Scouts', count: 7 } },
  } } });
assert.match(openingBeforeReveal, /7 de 20 replays/);
assert.doesNotMatch(openingBeforeReveal, /Poles|6 de 9/);


const recent = [true, false, null, true, false, true].map((won, index) => ({
  won, civ: ['Poles', 'Mongols', 'Franks', 'Huns', 'Turks', 'Magyars'][index],
  mapName: ['Arabia', 'Arena', 'MegaRandom', 'Arabia', 'Arena', 'Steppe'][index],
}));
const historyHtml = renderRival({ state, detail: false, options: { rivalCivs: true },
  entry: { name: 'Rival', player: { civ: 'Poles' }, report: { history: recent } },
});
assert.equal(historyHtml.match(/<li class="intel-history-row/g).length, 5);
assert.match(historyHtml, /Más reciente arriba · mismo modo/);
assert.match(historyHtml, /Poles.*Arabia.*Victoria/);
assert.match(historyHtml, /Franks.*MegaRandom.*Resultado pendiente/);
assert.doesNotMatch(historyHtml, /Magyars|Steppe/);
const hiddenCiv = renderRival({ state, options: { civRecommender: true }, entry: {
  name: 'Rival', player: { civ: null }, tip: { ...matchupTip,
    context: { ...matchupTip.context, scope: 'map', mapName: 'Arabia' },
    likelyCivs: [{ name: 'Poles', games: 9, sample: 20 }],
  },
} });
assert.match(hiddenCiv, /Sus civs más jugadas/);
assert.match(hiddenCiv, /class="civ-picks-list".*assets\/civs\/poles\.png/s);
assert.match(hiddenCiv, /9 de 20/);
assert.doesNotMatch(hiddenCiv, /45 ?%|Teutons/);
const publicHistory = renderRival({ state, options: { civRecommender: true }, entry: {
  name: 'Rival', player: { civ: null }, tip: { loading: true }, report: {
    mode: resolveMode(3), mapStats: { name: 'Arabia', sampleGames: 25, civs: [{ name: 'Poles', games: 9 }] },
  },
} });
assert.match(publicHistory, /9 de 25/);
assert.match(publicHistory, /partidas con civ conocida/);
const measured = renderPostMatch({ ...report(reachedTelemetry), combat: { status: 'partial', stages: [
  { age: 'feudal', label: 'Feudal', status: 'complete', startSeconds: 583, endSeconds: 1000,
    villagersKilled: 4, villagersLost: 1, militaryKilled: 6, militaryLost: 7 },
  { age: 'castle', label: 'Castillos', status: 'partial', startSeconds: 1000, endSeconds: 1450,
    villagersKilled: 3, villagersLost: 1, militaryKilled: 2, militaryLost: 1 },
] }, executionRatings: { economic: { stages: [{ label: 'Feudal', grade: 'A', sampleSize: 5 }] },
  personalHighlights: [{ title: 'TC inactivo · Feudal', detail: 'Menor valor que en el 60 % de tus 5 partidas anteriores comparables.' }] },
}, { compact: true });
assert.match(measured, /Intercambio por edad/);
assert.match(measured, /Tu ejecución económica/);
assert.match(measured, /60 % de tus 5 partidas/);
assert.doesNotMatch(measured, /Castillos<\/b>|mejor que el 60 % de los jugadores/);
assert.doesNotMatch(measured, /Bloque anterior|antes.*ahora/);

const snapshot = { example: { realStartedAt: 2000 }, match: { startedAt: 3000 } };
assert.equal(historyCutoff(snapshot), 2000);
assert.equal(historyCutoff({ ...snapshot, match: { startedAt: null } }), 2000);
assert.equal(historyCutoff({ example: { realStartedAt: null }, match: { startedAt: 3000 } }), null);
assert.equal(historyCutoff({ match: { startedAt: 3000 } }), 3000);
assert.equal(computeTips(history, { ...currentContext, historical: true, cutoff: null }).sample, 0);

const samples = [
  ['Mongols', true], ['Japanese', false], ['Persians', true], ['Mongols', true],
  ['Japanese', true], ['Persians', null], ['Maya', false], [null, false],
].map(([civ, won], index) => ({
  matchId: 300 + index, leaderboardId: 3, mapName: 'Arabia', startedAt: 1000 + index,
  players: [{ profileId: 1, civ, won }],
}));
const stats = parseMapStats([...samples, samples[0]], 1, null, { mapName: 'Arabia', mode: resolveMode(3) });
assert.equal(stats.sampleGames, 8);
assert.equal(stats.civSampleGames, 7);
assert.equal(stats.resultGames, 7);
assert.equal(stats.distinctCivs, 4);
assert.equal(stats.civLeaders.length, 3);
assert.equal(stats.civs.length, 3);
const mapHtml = renderRival({
  state, detail: true, options: { rivalFavorites: true },
  entry: { name: 'Rival', report: { mapStats: stats } },
});
assert.match(mapHtml, /4 victorias del rival en 7 resultados conocidos/);
assert.match(mapHtml, /assets\/civs\/mongols\.png/);
assert.match(mapHtml, /2 de 7/);
assert.ok(mapHtml.indexOf('Sus civs más jugadas') < mapHtml.indexOf('4 victorias'));
assert.doesNotMatch(mapHtml, /empatadas|Civilización identificada/);
assert.doesNotMatch(mapHtml, /Más usada/);
console.log('Producto UX: cobertura de replay, cruce real de civs, fechas, privacidad y progreso personal OK.');
