'use strict';
// Pruebas deterministas del contrato de datos y visibilidad, sin red ni Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fetchMyHistory, computeH2H, computeMyMapCivs } = require('../src/mine');
const { isWin, weakAgainst, openingsAgainst, progressiveScout, buildScoutTips, tempoProfile, parseScoutRows } = require('../src/scout');
const { buildRivalInsights, opponentsOf, needsRivalHistory, mergeRivalReport, parseMapStats, normalizeProfileStats } = require('../src/rival');
const { fetchOpeningRows, DEFAULT_FIELDS } = require('../src/insights');
const { ReplayCache } = require('../src/replay-cache');
const { QueueWatcher } = require('../src/live');
const { RequestScheduler } = require('../src/request-scheduler');
const { getJson, adaptMatchedToLobby, buildSnapshotFromLobby, normalizeMatch } = require('../src/aoe');

async function main() {
  const stub = () => ({ hidden: false, textContent: '', innerHTML: '', dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [], appendChild() {} });
  const context = {
    document: { getElementById: stub, addEventListener() {}, body: stub(), documentElement: { style: { setProperty() {} } } },
    window: { overlay: { onState() {}, onConfig() {}, onUpdate() {}, onMovable() {}, onView() {},
      onRival() {}, onScout() {}, onDetail() {}, ready() {}, reportError() {} }, addEventListener() {} },
    ResizeObserver: class { observe() {} }, requestAnimationFrame() {}, console,
    setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {},
    Date, Math, Number, String, Boolean, Array, Object, JSON, Intl,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8'), context);
  vm.runInContext('stage.scrollHeight = 2000; stageMaxHeight = 1010; stageScale = 1;', context);
  context.fitStage();
  assert.match(vm.runInContext('stage.style.transform', context), /scale\(0\.5000\)/,
    'contenido alto entra completo en un monitor pequeño');
  vm.runInContext('balanceEnabled = true;', context);
  context.renderBalance({ status: 'ongoing', players: [
    { isYou: true, team: 1, rating: 1000 }, { team: 1, rating: 1200 },
    { team: 2, rating: 1100 }, { team: 2, rating: 1300 }, { team: 2, rating: null },
  ] });
  const balance = vm.runInContext('balanceEl.innerHTML', context);
  assert.match(balance, /parcial/, 'un ELO ausente se informa como parcial');
  assert.match(balance, /1200/, 'un ELO ausente no se convierte en cero');
  vm.runInContext("rivalOptions.rivalOpenings = true; smartTipsEnabled = true; civRecommenderEnabled = true; lastState = { match: { mapName: 'Arabia' } };", context);
  const opening = context.rivalPredStrip({ mapStats: { name: 'Arabia', games: 10 }, openings: {
    mapCivFavorite: { short: 'Scouts', count: 4 }, mapCivAnalyzed: 5 } });
  assert.match(opening, /Scouts/); // El toggle de consejos no oculta aperturas.
  assert.doesNotMatch(context.rivalPredStrip({ mapStats: { name: 'Arabia', games: 10,
    sampleGames: 10, civ: { name: 'Huns', games: 8 } }, openings: {} }), /Suele jugar Huns/);
  assert.match(context.rivalPredStrip({ openingError: 'HTTP 429' }), /No se pudieron consultar/);
  assert.match(context.rivalPredStrip({ mapStats: { name: 'Arabia' }, openings: { mapAnalyzed: 4 } }), /Hay 4 replays del mapa/);
  assert.match(context.rivalPredStrip({ loading: true }), /Buscando sus aperturas/);
  const firstPagePick = context.scoutPickHero({ mapStats: { name: 'Arabia', games: 20,
    civ: { name: 'Huns', games: 8 } } });
  assert.match(firstPagePick.value, /40/, 'la primera página usa su muestra real, no 100 %');
  assert.match(context.rivalHistoryBlock({ history: [], error: 'historial: HTTP 429' }), /No se pudo consultar/);
  const history = context.rivalHistoryBlock({ history: [{ civ: 'Franks', mapName: 'Arabia', won: true }] });
  assert.match(history, /Franks/);
  assert.match(history, /Arabia/);
  assert.match(history, />V</);
  assert.match(context.rivalMapBlock({ error: 'stats: HTTP 429' }), /No se pudieron consultar/);
  assert.match(context.rivalH2HBlock({ h2h: { error: 'HTTP 429' } }), /No se pudo consultar/);
  assert.match(context.scoutRecommendBlock({ recommend: [] }), /Sin muestra suficiente/);
  assert.match(context.scoutRecommendBlock({ error: 'offline' }), /No se pudieron consultar/);
  assert.match(context.rivalHistoryBlock({ modePending: true }), /Esperando el modo/);
  assert.match(context.scoutTipSections({ modePending: true }), /Esperando el modo/);
  assert.match(context.rivalPredStrip({ modePending: true, openings: { modeUnavailable: true } }), /Esperando el modo/);
  const tactical = { sample: 20, scopeLabel: 'en Arabia',
    openingsAgainst: [{ short: 'Scouts', games: 10, losses: 7 }],
    weakAgainst: [{ civ: 'Britons', games: 10, losses: 8 }],
    tempo: { shortGames: 10, shortWinRate: 20, longGames: 10, longWinRate: 60 } };
  assert.match(context.scoutTipSections(tactical), /Scouts/);
  assert.match(context.scoutTipSections(tactical), /Britons/);
  assert.match(context.scoutAdditionalEvidence(tactical), /Britons/);
  assert.match(context.scoutAdditionalEvidence(tactical), /partidas cortas/);
  const tacticalTeam = { ...tactical, mode: { size: 'team' } };
  assert.match(context.scoutTipSections(tacticalTeam), /derrotas del equipo/);
  assert.match(context.scoutAdditionalEvidence(tacticalTeam), /Su equipo perdió/);
  assert.match(context.scoutAction(tacticalTeam).legend, /equipo/);
  assert.equal(context.tempoAdvice({ shortGames: 300, shortWins: 151, shortWinRate: 50,
    longGames: 300, longWins: 240, longWinRate: 80 }).wins, 151,
  'el ritmo usa victorias reales, sin reconstruirlas desde porcentajes redondeados');
  const tempoRows = Array.from({ length: 600 }, (_, i) => ({ duration: i < 300 ? 600 : 2000,
    won: i < 300 ? i < 151 : i < 540 }));
  assert.equal(tempoProfile(tempoRows).shortWins, 151);
  vm.runInContext('rivalOptions.rivalCivs = true; rivalOptions.rivalH2H = true;', context);
  const compact = context.scoutCompactCard({ key: '1', name: 'Rival', report: {
    history: [], h2h: { error: 'offline' }, openingError: 'offline', error: 'historial: offline'
  }, tip: { loading: true } }, true);
  assert.match(compact, /No se pudo consultar el historial/);
  assert.match(compact, /cara a cara/);
  assert.match(compact, /No se pudieron consultar sus aperturas/);
  assert.match(compact, /Analizando replays/);
  assert.match(compact, /Cruzando su debilidad/);
  vm.runInContext('smartTipsEnabled = false; rivalOptions.rivalCivs = false; rivalOptions.rivalH2H = false; rivalOptions.rivalOpenings = false; civRecommenderEnabled = false;', context);
  const noTips = context.scoutCompactCard({ key: '1', name: 'Rival', report: {}, tip: null }, true);
  assert.doesNotMatch(noTips, /Sin punto débil claro/);

  let calls = 0;
  const cache = new Map();
  const options = { profileId: 100, leaderboardId: 3, cache, fetchMatchesImpl: async () => {
    calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return [];
  } };
  await Promise.all([fetchMyHistory(options), fetchMyHistory(options), fetchMyHistory(options)]);
  assert.equal(calls, 1, 'consultas simultáneas comparten la petición');
  let warmCalls = 0;
  const warmOptions = { profileId: 700, leaderboardId: 3, cache: new Map(),
    fetchMatchesImpl: async () => { warmCalls++; await new Promise((r) => setTimeout(r, 10));
      return [1, 2].map((matchId) => ({ matchId, players: [{ profileId: 700, civ: 'Franks', won: true }] })); } };
  const [warm, match] = await Promise.all([fetchMyHistory(warmOptions),
    fetchMyHistory({ ...warmOptions, currentMatchId: 2 })]);
  assert.equal(warmCalls, 1, 'precarga y prematch comparten la consulta en vuelo');
  assert.equal(warm.rows.length, 2);
  assert.equal(match.rows.length, 1, 'cada consumidor excluye su partida actual');
  const unknownTeams = computeH2H([{ myTeam: null, won: false,
    players: [{ profileId: 1, team: null }, { profileId: 2, team: null },
      { profileId: 3, team: null }, { profileId: 4, team: null }] }], 2);
  assert.equal(unknownTeams.games, 0, 'no inventa rivalidad en equipos sin confirmar');
  assert.equal(unknownTeams.unresolved, 1);
  assert.match(context.rivalH2HBlock({ h2h: { ...unknownTeams, scanned: 1 } }), /sin equipos confirmados/);
  const ownResults = [true, true, true, null, null].map((won) => ({ civ: 'Huns', mapName: 'Arabia', won }));
  const ownCiv = computeMyMapCivs(ownResults, 'Arabia')[0];
  assert.equal(ownCiv.games, 3, 'resultados desconocidos no bajan el winrate propio');
  assert.equal(ownCiv.winRate, 100);
  const mapMatches = [true, null, null].map((won, index) => ({ matchId: index + 1,
    mapName: 'Arabia', players: [{ profileId: 3, civ: 'Huns', won }] }));
  const mapStats = parseMapStats(mapMatches, 3, null, { mapName: 'Arabia' });
  assert.equal(mapStats.games, 3, 'mantiene las tres partidas para la muestra de civs');
  assert.equal(mapStats.resultGames, 1);
  assert.equal(mapStats.winRate, 100, 'el winrate excluye resultados desconocidos');
  assert.match(context.rivalMapBlock({ mapStats }), /resultado conocido/);
  assert.doesNotMatch(context.rivalMapBlock({ mapStats }), /le va bien|le va mal/,
    'una muestra pequeña no se convierte en diagnóstico');
  assert.match(context.rivalMapBlock({ mapStats }), /1\/1/,
    'una muestra mínima se presenta como fracción');
  const missingWins = normalizeProfileStats({ map: [{ mapName: 'Arabia', games: 10, wins: null }] }, 'Arabia');
  assert.equal(missingWins.currentMap.winRate, null, 'victorias ausentes no se convierten en cero');
  assert.match(context.rivalMapBlock({ mapStats: { ...missingWins.currentMap, resultGames: 0 } }), /sin resultados suficientes/);
  const searchEvents = [];
  const watcher = new QueueWatcher({ profileId: 700, onSearching: (active, item) => searchEvents.push({ active, item }) });
  watcher.handleEvents([{ type: 'queueingAdded', data: { id: 'q_1', status: 'queueing', players: [{ profileId: 700 }] } }]);
  watcher.handleEvents([{ type: 'queueingUpdated', data: { id: 'q_1', status: 'queueing', leaderboard: 'rm_1v1', players: [{ profileId: 700 }] } }]);
  assert.equal(searchEvents.length, 2, 'avisa cuando el modo llega después de la cola');
  assert.equal(searchEvents[1].item.leaderboard, 'rm_1v1');
  const incompleteTeam = { players: [{ profileId: 1, isYou: true, team: 1 },
    { profileId: 2, name: 'Aliado', team: 1 }] };
  assert.equal(opponentsOf(incompleteTeam).length, 0, 'no se analiza a un aliado mientras falta el rival');
  const uncertain = adaptMatchedToLobby({ matchId: 99, players: [1, 2, 3, 4].map((profileId) => ({ profileId, team: null })) }, 1);
  assert.equal(uncertain.leaderboardId, null, 'no adivina RM según tamaño de partida');
  const eloCache = new Map([1, 2, 3, 4].map((id) => [`elo1v1:${id}`, { ts: Date.now(), rating: 1000 }]));
  const uncertainSnapshot = await buildSnapshotFromLobby(uncertain, { profileId: 1, cache: eloCache });
  assert.ok(uncertainSnapshot.players.every((player) => player.team === null), 'no inventa equipos en TG');
  assert.equal(opponentsOf(uncertainSnapshot).length, 0);
  const missingRating = normalizeMatch({ teams: [{ players: [{ profileId: 1, rating: null, ratingDiff: 0 }] }] });
  assert.equal(missingRating.players[0].matchRating, null, 'rating ausente no se convierte en 0');
  assert.equal(missingRating.players[0].matchRatingDiff, 0, 'un cero real se conserva');
  assert.equal(needsRivalHistory({ rivalH2H: true }), false, 'H2H no descarga el historial del rival');
  assert.equal(needsRivalHistory({ rivalH2H: true, rivalCivs: true }), true);
  const pendingReports = [{ profileId: 1, loading: true }, { profileId: 2, loading: true }];
  const firstReady = mergeRivalReport(pendingReports, { profileId: 1, openingsPending: false }, true);
  assert.equal(firstReady.reports.length, 2, 'la primera respuesta conserva la tarjeta del otro rival');
  assert.equal(firstReady.reports[1].loading, true);
  assert.equal(firstReady.pendingOpenings, true, 'la carga del segundo rival sigue visible');
  const allReady = mergeRivalReport(firstReady.reports, { profileId: 2, openingsPending: false }, true);
  assert.equal(allReady.pendingOpenings, false);
  vm.runInContext("rivalPayload = null; scoutPayload = null; lastState = {status:'ongoing', phase:'lobby', match:{matchId:1}, players:[{profileId:1,isYou:true,team:1},{profileId:2,name:'Aliado',team:1},{profileId:3,name:'Rival',team:2}]};", context);
  assert.equal(context.scoutUniverse()[0].name, 'Rival', 'la vista provisional no presenta un aliado como rival');
  vm.runInContext("lastState.players.push({profileId:4,name:'Rival 2',team:2},{profileId:5,name:'Rival 3',team:2})", context);
  assert.equal(context.knownOpponentCount(), 3, 'la cobertura de TG cuenta todos los rivales conocidos');
  const entry = { key: '3', name: 'Rival', report: {
    profileId: 3, mapStats: { name: 'Arabia', games: 10, wins: 6, winRate: 60,
      sampleGames: 10, civ: { name: 'Huns', games: 8 } },
    openings: { mapCivFavorite: { short: 'Scouts', count: 4 }, mapCivAnalyzed: 5 },
    history: [{ civ: 'Chinese', mapName: 'Arena', won: true }], h2h: { games: 2, wins: 1, losses: 1 }
  }, tip: { profileId: 3, sample: 10, style: { analyzed: 10, dominant: 'agresivo', aggressive: 8, boom: 2 },
    openingsAgainst: [], weakAgainst: [], recommend: [{ civ: 'Aztecs', mine: { games: 8, winRate: 60 },
      vsRival: { games: 5, lossRate: 60 } }] } };
  const keys = ['rivalCivs', 'rivalFavorites', 'rivalOpenings', 'rivalH2H', 'smartTips', 'civRecommender'];
  const markers = ['ASÍ JUGÓ SUS ÚLTIMAS 5', 'Suele jugar', 'En replays:', 'Cara a cara', 'Aperturas agresivas', 'Civ recomendada'];
  for (let mask = 0; mask < 64; mask++) {
    for (let i = 0; i < keys.length; i++) {
      const binding = i < 4 ? `rivalOptions.${keys[i]}` : `${keys[i]}Enabled`;
      vm.runInContext(`${binding} = ${Boolean(mask & (1 << i))}`, context);
    }
    const rendered = context.scoutCompactCard(entry, true);
    for (let i = 0; i < keys.length; i++) {
      assert.equal(rendered.includes(markers[i]), Boolean(mask & (1 << i)),
        `${keys[i]} debe respetarse con combinación ${mask}`);
    }
    const detail = context.rivalCard(entry.report) + context.scoutCard(entry.tip);
    const detailMarkers = [...markers];
    detailMarkers[4] = 'AGRESIVAS';
    for (let i = 0; i < keys.length; i++) {
      assert.equal(detail.includes(detailMarkers[i]), Boolean(mask & (1 << i)),
        `${keys[i]} debe respetarse en detalle con combinación ${mask}`);
    }
  }
  let errors = 0;
  const failed = { profileId: 101, leaderboardId: 3, cache, fetchMatchesImpl: async () => {
    errors++; throw new Error('offline');
  } };
  assert.ok((await fetchMyHistory(failed)).error);
  assert.ok((await fetchMyHistory(failed)).error);
  assert.equal(errors, 2, 'un fallo no se guarda como resultado ni bloquea reintentos');
  const scheduler = new RequestScheduler({ intervalMs: 0, maxConcurrent: 1 });
  const order = [];
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const running = scheduler.run(async () => { order.push('activa'); await hold; });
  const background = scheduler.run(async () => { order.push('historial'); });
  const own = scheduler.run(async () => { order.push('historial propio'); }, 1);
  const priority = scheduler.run(async () => { order.push('primera página'); }, 2);
  release();
  await Promise.all([running, background, own, priority]);
  assert.deepEqual(order, ['activa', 'primera página', 'historial propio', 'historial'], 'prioriza primeras páginas e historial propio');
  const throttled = new RequestScheduler({ intervalMs: 0, maxConcurrent: 1, maxWaitMs: 10 });
  await assert.rejects(throttled.run(async () => { const error = new Error('límite');
    error.status = 429; error.retryAfterMs = 20000; throw error; }));
  let sent = false;
  await assert.rejects(throttled.run(async () => { sent = true; }));
  assert.equal(sent, false, 'respeta el enfriamiento compartido sin nuevas solicitudes');
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429, headers: { get: () => '12' } });
  try {
    await assert.rejects(getJson('https://example.test/api/matches'),
      (error) => error.status === 429 && error.retryAfterMs === 12000);
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(isWin(null), null);
  assert.equal(isWin('Not Won'), false);
  const unknown = Array.from({ length: 10 }, () => ({ won: null, oppCiv: 'Franks', oppStrategy: 'Scout rush' }));
  assert.equal(weakAgainst(unknown).length, 0, 'resultado desconocido no cuenta como derrota');
  assert.equal(openingsAgainst(unknown, unknown).length, 0);
  const teamMatches = parseScoutRows({ rows: {
    match_id: [1, 1, 1, 2, 2, 2, 3, 3, 3],
    won: Array(9).fill('Not Won'),
    civilization_opponent: ['Franks', 'Britons', 'Franks', 'Franks', 'Britons', 'Franks', 'Franks', 'Britons', 'Franks'],
    strategy_opponent: ['Scout rush', 'Archer rush', 'Scout rush', 'Scout rush', 'Archer rush', 'Scout rush', 'Scout rush', 'Archer rush', 'Scout rush'],
  } });
  assert.equal(teamMatches.length, 3, 'cada partida de equipos se cuenta una vez');
  assert.equal(teamMatches[0].opponents.length, 2, 'conserva todos los enfrentamientos distintos');
  const teamCivs = weakAgainst(teamMatches);
  assert.equal(teamCivs.find((item) => item.civ === 'Franks').games, 3, 'no duplica la misma civ en una partida');
  assert.equal(teamCivs.find((item) => item.civ === 'Britons').games, 3, 'incluye al segundo rival');
  const teamOpenings = openingsAgainst(teamMatches, teamMatches);
  assert.equal(teamOpenings.find((item) => item.name === 'Archer rush').games, 3);
  let modeCalls = 0;
  const unavailable = await buildRivalInsights({ profileId: 123, leaderboardId: 'unranked',
    getJsonImpl: async () => { modeCalls++; return {}; },
    fetchMatchesImpl: async () => { modeCalls++; return []; } });
  assert.equal(unavailable.modeUnavailable, true);
  assert.equal(modeCalls, 0, 'modo desconocido no mezcla otras ladders');
  assert.match(context.rivalHistoryBlock(unavailable), /modo no disponible/);
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const retrySource = mainSrc.slice(mainSrc.indexOf('function scheduleRivalRetry('), mainSrc.indexOf('async function refreshRivalReports('));
  let scheduled = 0;
  const retryContext = { preStartState: () => true, lastGood: { match: { matchId: 12 } },
    rivalRetryKey: '', rivalRetryCount: 0, RIVAL_RETRY_MAX: 2, RIVAL_RETRY_MS: 10,
    rivalRetryTimer: null, clearTimeout() {}, setTimeout: () => { scheduled++; return 1; },
    log() {}, refreshRivalReports: async () => {} };
  vm.createContext(retryContext);
  vm.runInContext(retrySource, retryContext);
  retryContext.scheduleRivalRetry([{ profileId: 1, history: [], modeUnavailable: true }], [{ profileId: 1, name: 'Rival' }]);
  assert.equal(scheduled, 0, 'un modo no compatible no genera reintentos inútiles');
  retryContext.scheduleRivalRetry([{ profileId: 1, history: [], error: null }], [{ profileId: 1, name: 'Rival' }]);
  assert.equal(scheduled, 0, 'un historial realmente vacío no genera reintentos inútiles');
  retryContext.scheduleRivalRetry([{ profileId: 1, history: [], error: 'red' }], [{ profileId: 1, name: 'Rival' }]);
  assert.equal(scheduled, 1, 'un fallo recuperable sí se reintenta');
  let finishStats;
  const stats = new Promise((resolve) => { finishStats = resolve; });
  const partials = [];
  const reportRequest = buildRivalInsights({ profileId: 123, leaderboardId: 3, mapName: 'Arabia',
    includeOpenings: false, getJsonImpl: () => stats,
    fetchMatchesImpl: async () => [{ matchId: 1, leaderboardId: 3, mapName: 'Arabia',
      players: [{ profileId: 123, civ: 'Franks', won: true }] }],
    onPartial: (partial) => partials.push(partial) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(partials[0].history[0].civ, 'Franks', 'historial aparece sin esperar /stats');
  finishStats({});
  await reportRequest;
  const originalFetch = globalThis.fetch;
  let replayCalls = 0;
  globalThis.fetch = async () => {
    replayCalls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true, status: 200, json: async () => ({ rows: { match_id: [1] } }) };
  };
  try {
    const query = { mode: { id: 3 }, limit: 500, fields: DEFAULT_FIELDS };
    const [a, b] = await Promise.all([fetchOpeningRows(9999991, query), fetchOpeningRows(9999991, query)]);
    assert.equal(replayCalls, 1, 'aperturas y scouting comparten la consulta en vuelo');
    assert.deepEqual(a, b);
    await fetchOpeningRows(9999991, query);
    assert.equal(replayCalls, 1, 'respuesta reciente se reutiliza');
  } finally { globalThis.fetch = originalFetch; }
  let fullResolve;
  const fullPending = new Promise((resolve) => { fullResolve = resolve; });
  const progress = [];
  const progressive = progressiveScout({}, (value) => progress.push(value),
    (opts) => opts.limit === 60 ? Promise.resolve({ totalMatches: 60 }) : fullPending);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(progress[0].provisional, true, 'muestra inicial se marca como provisional');
  fullResolve({ totalMatches: 500 });
  assert.equal((await progressive).totalMatches, 500);
  let quickResolve;
  const quickPending = new Promise((resolve) => { quickResolve = resolve; });
  const late = [];
  const finished = progressiveScout({}, (value) => late.push(value),
    (opts) => opts.limit === 60 ? quickPending : Promise.resolve({ totalMatches: 500 }));
  await finished;
  quickResolve({ totalMatches: 60 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(late.length, 0, 'muestra corta tardía no pisa el análisis completo');
  const fallback = await progressiveScout({}, null,
    (opts) => Promise.resolve(opts.limit === 60 ? { totalMatches: 60 } : { error: 'offline' }));
  assert.equal(fallback.limited, true, 'conserva muestra corta cuando falla la completa');
  const fresher = await progressiveScout({}, null, (opts) => Promise.resolve(opts.limit === 60
    ? { totalMatches: 60, fetchedAt: 20 } : { totalMatches: 500, stale: true, fetchedAt: 10 }));
  assert.equal(fresher.totalMatches, 60, 'una muestra nueva no se reemplaza por datos antiguos');
  const freshCache = new Map([['scout:rows:v2:321:3:500', { ts: Date.now(), rows: [] }]]);
  let builds = 0;
  await progressiveScout({ profileId: 321, leaderboardId: 3, cache: freshCache }, null,
    async () => { builds++; return {}; });
  assert.equal(builds, 1, 'no inicia muestra corta cuando ya tiene muestra completa reciente');
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aoe-cache-test-'));
  const file = path.join(tmp, 'replays.json');
  try {
    const cache1 = new ReplayCache(file);
    const ts = Date.now() - 31 * 60 * 1000;
    cache1.set('scout:rows:v2:321:3:500', { ts, rows: [{ matchId: 9, won: true, map: 'Arabia' }], totalRows: 1 });
    cache1.set('mine:123:3', { ts, rows: [{ private: true }] });
    cache1.flush();
    const cache2 = new ReplayCache(file);
    assert.ok(cache2.has('scout:rows:v2:321:3:500'), 'caché de replays sobrevive a un reinicio');
    assert.equal(cache2.has('mine:123:3'), false, 'no persiste historial propio');
    let preview;
    const staleResult = await buildScoutTips({ profileId: 321, leaderboardId: 3, mapName: 'Arabia',
      cache: cache2, fetchImpl: async () => { throw new Error('offline'); },
      onStale: (item) => { preview = item; } });
    assert.ok(preview.stale && preview.provisional, 'datos antiguos se publican marcados');
    assert.ok(staleResult.stale && staleResult.fromCache, 'un fallo conserva y marca datos antiguos');
  } finally {
    for (const name of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, name));
    fs.rmdirSync(tmp);
  }
  console.log('Prematch: estados de toggles y deduplicación OK');
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
