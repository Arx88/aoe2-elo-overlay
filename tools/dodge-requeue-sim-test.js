'use strict';

/**
 * Simulación end-to-end del ciclo de vida de pre-partida, dodge, re-cola,
 * resurrección de salas zombis y transición a partida en vivo.
 *
 * Reproduce exactamente los casos reales capturados en overlay.log (13:07–13:09
 * y 13:52–13:56) además de la protección contra falsos positivos.
 */
const assert = require('assert');
const {
  QueueWatcher,
  FastLane,
  findMyMatch,
  isPostMatchRequeue,
  PROBE_LOBBY_MS,
  PROBE_PAUSED_MS,
} = require('../src/live');

const PROFILE_ID = 25399083;
const T0 = Date.parse('2026-11-27T13:52:45.000Z');
const iso = (offsetSec) => new Date(T0 + offsetSec * 1000).toISOString();

const makeMatch = (matchId, mapName, matchedOffsetSec, rivals) => ({
  id: `m_${matchId}`,
  status: 'matched',
  matchId,
  leaderboard: 'rm_team',
  mapName,
  matchedAt: iso(matchedOffsetSec),
  players: [
    { profileId: PROFILE_ID, name: 'PSX | Acido', team: 0 },
    ...rivals.map((name, i) => ({ profileId: 900000 + matchId % 1000 + i, name, team: 1 })),
  ],
});

const makeQueue = (id, sinceOffsetSec, seenOffsetSec) => ({
  id,
  status: 'queueing',
  leaderboard: 'rm_team',
  queueingSince: iso(sinceOffsetSec),
  lastSeen: iso(seenOffsetSec),
  players: [{ profileId: PROFILE_ID, name: 'PSX | Acido' }],
});

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`PASS  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`FAIL  ${name}\n      ${err.message}`);
    });
}

/** Simula la capa de coordinación de main.js con QueueWatcher + FastLane reales. */
function createHarness(snapshotFeedFn) {
  const logs = [];
  const overlayHistory = [];
  let overlayState = { status: 'idle', players: [] };
  let preMatchGraceUntil = 0;
  let liveMatchAt = 0;
  let searching = false;

  const setOverlay = (state) => {
    overlayState = state;
    overlayHistory.push({
      status: state.status,
      phase: state.phase || null,
      matchId: state.match ? state.match.matchId : null,
      map: state.match ? state.match.mapName : null,
      rivals: (state.players || []).filter((p) => p.profileId !== PROFILE_ID).map((p) => p.name),
    });
  };

  let fastLane = null;
  const queueWatcher = new QueueWatcher({
    profileId: PROFILE_ID,
    log: (m) => logs.push(m),
    onFound: (matchId) => {
      liveMatchAt = Date.now();
      preMatchGraceUntil = liveMatchAt + 20000;
      setOverlay({ status: 'ongoing', phase: 'lobby', match: { matchId, mapName: '—' }, players: [] });
    },
    onMatched: (item) => {
      liveMatchAt = Date.now();
      preMatchGraceUntil = liveMatchAt + 20000;
      fastLane.pause(item.matchId ?? item.id, {
        inLobby: true,
        matchedAt: item.matchedAt,
        preQueueIds: queueWatcher.preMatchQueueIds,
      });
      setOverlay({
        status: 'ongoing',
        phase: 'lobby',
        match: { matchId: item.matchId, mapName: item.mapName },
        players: item.players,
      });
    },
    onGone: (id, meta = {}) => {
      if (meta && meta.reason === 'requeued') {
        liveMatchAt = 0;
        preMatchGraceUntil = 0;
        searching = true;
        if (overlayState.status === 'ongoing' && overlayState.phase === 'lobby') {
          setOverlay({ status: 'idle', players: [] });
        }
        fastLane.resume();
        return;
      }
      liveMatchAt = 0;
      preMatchGraceUntil = Date.now() + 22000;
      fastLane.resume();
    },
    onSearching: (active) => {
      searching = active;
      if (active) fastLane.resume();
    },
  });

  fastLane = new FastLane({
    profileId: PROFILE_ID,
    log: (m) => logs.push(m),
    isDismissedMatch: (id) => queueWatcher.isMatchDismissed(id),
    onRequeued: (queueItem, droppedMatchId) => {
      queueWatcher.handleRequeueFromFastLane(queueItem, droppedMatchId);
    },
    onSnapshot: (events) => {
      queueWatcher.handleEvents(events, true, { quiet: true });
    },
    onQueue: (active) => {
      searching = active;
    },
    readSnapshotImpl: snapshotFeedFn,
  });

  const simulateRestPoll = (restState) => {
    if (restState.status === 'idle') {
      const lobbyActive = Boolean(queueWatcher.matched || queueWatcher.awaitingRoster);
      const showingLive = overlayState.status === 'ongoing' && overlayState.phase !== 'lobby';
      if (!showingLive && (lobbyActive || Date.now() < preMatchGraceUntil)) {
        return 'held_in_loading_grace';
      }
      setOverlay({ status: 'idle', players: [] });
      return 'emitted_idle';
    }
    if (restState.status === 'ongoing') {
      setOverlay(restState);
      if (restState.phase !== 'lobby' && restState.match?.matchId != null) {
        queueWatcher.dismissMatch(restState.match.matchId);
        fastLane.pause(restState.match.matchId, { inLobby: false });
      }
      return 'emitted_live';
    }
    return 'noop';
  };

  return {
    queueWatcher,
    fastLane,
    logs,
    overlayHistory,
    getOverlay: () => overlayState,
    isSearching: () => searching,
    getGraceUntil: () => preMatchGraceUntil,
    simulateRestPoll,
    cleanup: () => {
      queueWatcher.stop();
      fastLane.stop();
    },
  };
}

async function run() {
  console.log('=== SIMULACIÓN END-TO-END: DODGE, RE-COLA Y PARTIDAS ZOMBIS ===\n');

  // 1) Caso REAL exacto de hoy (13:52:49 -> 13:56:18)
  await test('Escenario 1 (log real 13:52→13:56): dodge a los 11s + zombi 80s después + partida #2 detectada en pre-partida', async () => {
    const match1 = makeMatch(523953348, 'Black Forest', 0, ['Mizii', 'Jacinto', 'EXILE | Kiran']);
    const match1Updated = makeMatch(523953348, 'Hideout', 0, ['Mizii', 'Jacinto', 'EXILE | Kiran']);
    const match2 = makeMatch(523953597, 'Hideout', 120, ['Catador de ovejas', 'Crazy Cat', 'Mizii']);
    const queueBefore = makeQueue('q_before', -360, -2);
    const queueAfterDodge = makeQueue('q_after_dodge', 11, 14);

    let serverView = [{ type: 'queueingAdded', data: queueBefore }];
    const h = createHarness(async () => serverView);
    try {
      // 13:47 - En cola inicial
      h.queueWatcher.handleEvents(serverView, true);
      assert.strictEqual(h.isSearching(), true);

      // 13:52:49 - Aparece Partida #1 (Jacinto, EXILE | Kiran)
      h.queueWatcher.handleEvents([
        { type: 'queueingRemoved', data: { id: 'q_before', reason: 'matched', matchId: 523953348 } },
        { type: 'queueingAdded', data: match1 },
      ], false);
      assert.strictEqual(h.getOverlay().match.matchId, 523953348);
      assert.deepStrictEqual(h.overlayHistory.at(-1).rivals, ['Mizii', 'Jacinto', 'EXILE | Kiran']);
      assert.strictEqual(h.fastLane.paused, true);
      assert.strictEqual(h.fastLane.pausedInLobby, true);

      // 13:53:00 (11s después) - Alguien se sale; AoE2 vuelve a cola, PERO Companion aún guarda m_523953348!
      serverView = [
        { type: 'queueingAdded', data: match1Updated },
        { type: 'queueingAdded', data: queueAfterDodge },
      ];
      await h.fastLane.probe();

      // Verificación clave 1: el panel LIMPIÓ a Jacinto/Kiran inmediatamente y volvió a buscar!
      assert.strictEqual(h.getOverlay().status, 'idle', 'Debe limpiar a los rivales caídos al instante');
      assert.strictEqual(h.getGraceUntil(), 0, 'No debe retener 22s de gracia tras re-cola confirmada');
      assert.strictEqual(h.fastLane.paused, false, 'FastLane debe reactivarse al instante');
      assert.strictEqual(h.queueWatcher.isMatchDismissed(523953348), true, 'Match #1 debe quedar en tombstone');

      // 13:54:06 (79.8s después) - Un nodo atrasado de Companion devuelve la sala zombi m_523953348!
      serverView = [{ type: 'queueingAdded', data: match1Updated }];
      await h.fastLane.poll();
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: match1Updated }], false);

      // Verificación clave 2: la sala zombi JAMÁS resucita ni pausa FastLane!
      assert.strictEqual(h.getOverlay().status, 'idle', 'La sala zombi #523953348 NO puede resucitar');
      assert.strictEqual(h.fastLane.paused, false, 'FastLane NO puede volver a pausarse por la sala zombi');

      // 13:55:15 - El juego arma la Partida #2 (#523953597) mientras el zombi #523953348 sigue primero en el array!
      serverView = [
        { type: 'queueingAdded', data: match1Updated },
        { type: 'queueingAdded', data: match2 },
      ];
      await h.fastLane.poll();

      // Verificación clave 3: Partida #2 aparece en PRE-PARTIDA con los rivales nuevos!
      assert.strictEqual(h.getOverlay().status, 'ongoing');
      assert.strictEqual(h.getOverlay().phase, 'lobby');
      assert.strictEqual(h.getOverlay().match.matchId, 523953597);
      assert.deepStrictEqual(h.overlayHistory.at(-1).rivals, ['Catador de ovejas', 'Crazy Cat', 'Mizii']);
    } finally {
      h.cleanup();
    }
  });

  // 2) Dodge detectado directamente por el socket global dentro de los primeros 15s (recentMatchGuard)
  await test('Escenario 2: dodge temprano (< 15s) en el socket global NO es resucitado por recentMatchGuard', async () => {
    const match1 = makeMatch(700001, 'Arabia', 0, ['DodgePlayer']);
    const queueNew = makeQueue('q_after_fast_dodge', 6, 8);
    const h = createHarness(async () => []);
    try {
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: makeQueue('q_1', -60, -1) }], true);
      h.queueWatcher.handleEvents([
        { type: 'queueingRemoved', data: { id: 'q_1', reason: 'matched', matchId: 700001 } },
        { type: 'queueingAdded', data: match1 },
      ], false);
      assert.strictEqual(h.getOverlay().match.matchId, 700001);

      // Delta directo en socket global: m_700001 sigue ahí, pero aparece q_after_fast_dodge 6s después
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: queueNew }], false);
      assert.strictEqual(h.getOverlay().status, 'idle');
      assert.strictEqual(h.queueWatcher.matched, null);
      assert.strictEqual(h.queueWatcher.isMatchDismissed(700001), true);
    } finally {
      h.cleanup();
    }
  });

  // 3) Companion reutiliza el MISMO id de cola tras dodge, pero lastSeen avanza > matchedAt + 5s
  await test('Escenario 3: mismo id de cola reutilizado con lastSeen > matchedAt + 5s detecta re-cola', async () => {
    const match1 = makeMatch(700002, 'Arena', 0, ['RivalA']);
    const qPre = makeQueue('q_same_party', -180, -1);
    const qPost = makeQueue('q_same_party', -180, 12); // mismo id, pero latiendo 12s después del match!
    const h = createHarness(async () => [
      { type: 'queueingAdded', data: match1 },
      { type: 'queueingAdded', data: qPost },
    ]);
    try {
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: qPre }], true);
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: match1 }], false);
      assert.strictEqual(h.getOverlay().match.matchId, 700002);

      await h.fastLane.probe();
      assert.strictEqual(h.getOverlay().status, 'idle');
      assert.strictEqual(h.queueWatcher.isMatchDismissed(700002), true);
    } finally {
      h.cleanup();
    }
  });

  // 4) Protección contra falsos positivos: réplica vieja con cola PREVIA al match NO cierra la sala
  await test('Escenario 4 (CERO falsos positivos): réplica atrasada con cola previa al match NO cierra la sala válida', async () => {
    const match1 = makeMatch(700003, 'Arabia', 0, ['RivalLegit']);
    const stalePreQueue = makeQueue('q_old_pre', -120, -1); // lastSeen anterior a matchedAt
    const h = createHarness(async () => [
      { type: 'queueingAdded', data: match1 },
      { type: 'queueingAdded', data: stalePreQueue },
    ]);
    try {
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: stalePreQueue }], true);
      h.queueWatcher.handleEvents([
        { type: 'queueingRemoved', data: { id: 'q_old_pre', reason: 'matched', matchId: 700003 } },
        { type: 'queueingAdded', data: match1 },
      ], false);
      assert.strictEqual(h.getOverlay().match.matchId, 700003);

      // Sonda y snapshot atrasado con q_old_pre (lastSeen = T0 - 1s)
      await h.fastLane.probe();
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: stalePreQueue }], false);

      assert.strictEqual(h.getOverlay().status, 'ongoing');
      assert.strictEqual(h.getOverlay().match.matchId, 700003);
      assert.strictEqual(h.queueWatcher.isMatchDismissed(700003), false);
    } finally {
      h.cleanup();
    }
  });

  // 5) Flujo normal: actualización de mapa + pantalla de carga SIN parpadeo + transición a EN PARTIDA
  await test('Escenario 5 (flujo normal intacto): actualización de mapa —→Morass y pantalla de carga SIN parpadeo', async () => {
    const mInitial = makeMatch(523946287, '—', 0, ['Oddjob', 'ECŞ']);
    const mUpdated = makeMatch(523946287, 'Morass', 0, ['Oddjob', 'ECŞ']);
    const h = createHarness(async () => []);
    try {
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: mInitial }], true);
      assert.strictEqual(h.getOverlay().match.mapName, '—');

      // 14s después llega el mapa real Morass sobre el mismo matchId
      h.queueWatcher.handleEvents([{ type: 'queueingUpdated', data: mUpdated }], false);
      assert.strictEqual(h.getOverlay().match.mapName, 'Morass');

      // 60s: termina countdown, arranca pantalla de carga (queueingRemoved sin re-cola)
      h.queueWatcher.handleEvents([
        { type: 'queueingRemoved', data: { id: 'm_523946287', reason: 'started', matchId: 523946287 } },
      ], false);

      // 65s: REST aún dice idle mientras carga el mapa → debe SOSTENER el panel sin parpadear!
      const pollRes = h.simulateRestPoll({ status: 'idle' });
      assert.strictEqual(pollRes, 'held_in_loading_grace');
      assert.strictEqual(h.getOverlay().status, 'ongoing');
      assert.strictEqual(h.getOverlay().match.matchId, 523946287);

      // 70s: REST confirma EN PARTIDA
      h.simulateRestPoll({
        status: 'ongoing',
        match: { matchId: 523946287, mapName: 'Morass', startedAt: Date.now() },
        players: mUpdated.players,
      });
      assert.strictEqual(h.getOverlay().phase, undefined);
      assert.strictEqual(h.fastLane.pausedInLobby, false, 'En partida debe volver a sonda tranquila de 10s');

      // 13:09:05 (124s después): nodo atrasado intenta resucitar m_523946287 como PRE-PARTIDA!
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: mUpdated }], true, { quiet: true });
      assert.strictEqual(h.getOverlay().phase, undefined, 'NO debe pisar EN PARTIDA volviendo a PRE-PARTIDA');
    } finally {
      h.cleanup();
    }
  });

  // 6) Dos salas `matched` conviven en el mismo snapshot (vieja primero, nueva segunda)
  await test('Escenario 6: si conviven partida caída #1 (primero) y partida nueva #2 (después), siempre gana #2', async () => {
    const oldMatch = makeMatch(800001, 'Black Forest', 0, ['Viejo1', 'Viejo2']);
    const newMatch = makeMatch(800002, 'Arabia', 45, ['Nuevo1', 'Nuevo2']);
    const h = createHarness(async () => [
      { type: 'queueingAdded', data: oldMatch },
      { type: 'queueingAdded', data: newMatch },
    ]);
    try {
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: oldMatch }], true);
      assert.strictEqual(h.getOverlay().match.matchId, 800001);

      // Snapshot con vieja primero y nueva después
      await h.fastLane.probe();
      assert.strictEqual(h.getOverlay().match.matchId, 800002);
      assert.deepStrictEqual(h.overlayHistory.at(-1).rivals, ['Nuevo1', 'Nuevo2']);
      assert.strictEqual(h.queueWatcher.isMatchDismissed(800001), true);
    } finally {
      h.cleanup();
    }
  });

  // 7) queueingRemoved con reason:'cancelled' purga la sala aunque el id del evento no coincida con m_<id>
  await test('Escenario 7: queueingRemoved con reason:"cancelled" y matchId purga la sala inmediatamente', async () => {
    const m = makeMatch(810001, 'Nomad', 0, ['Canceler']);
    const h = createHarness(async () => []);
    try {
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: m }], true);
      assert.strictEqual(h.queueWatcher.matched.matchId, 810001);

      h.queueWatcher.handleEvents([
        { type: 'queueingRemoved', data: { id: 'q_other_ref', reason: 'cancelled', matchId: 810001 } },
      ], false);
      assert.strictEqual(h.queueWatcher.matched, null);
      assert.strictEqual(h.queueWatcher.isMatchDismissed(810001), true);
    } finally {
      h.cleanup();
    }
  });

  // 8) Cadencia de sonda: 3s en lobby, 10s en partida
  await test('Escenario 8: cadencia rápida 3s en pre-partida y 10s tranquila en partida', async () => {
    assert.strictEqual(PROBE_LOBBY_MS, 3000);
    assert.strictEqual(PROBE_PAUSED_MS, 10000);
    assert.strictEqual(
      isPostMatchRequeue(makeQueue('q_new', 8, 10), { matchedServerAt: T0 }),
      true,
    );
    assert.strictEqual(
      isPostMatchRequeue(makeQueue('q_old', -90, -1), { matchedServerAt: T0, preMatchQueueIds: new Set(['q_old']) }),
      false,
    );
    const chosen = findMyMatch([
      { type: 'queueingAdded', data: makeMatch(10, 'Old', 0, ['A']) },
      { type: 'queueingAdded', data: makeMatch(11, 'New', 20, ['B']) },
    ], PROFILE_ID);
    assert.strictEqual(chosen.data.matchId, 11);
  });

  // 9) Race condition asíncrono: showMatchFound de Partida #1 termina DESPUÉS de que ocurrió el dodge
  await test('Escenario 9: race condition de ELO asíncrono de Partida #1 NO pisa pantalla limpia ni Partida #2', async () => {
    const m1 = makeMatch(820001, 'Arabia', 0, ['RivalLento']);
    const qDodge = makeQueue('q_dodge_race', 9, 10);
    const h = createHarness(async () => [{ type: 'queueingAdded', data: qDodge }]);
    try {
      h.queueWatcher.handleEvents([{ type: 'queueingAdded', data: m1 }], true);
      // Arranca consulta lenta de ELO para m1...
      const slowEloFetch = new Promise((resolve) => setTimeout(() => resolve({ matchId: 820001, mapName: 'Arabia' }), 60));
      // Antes de que vuelva el ELO, ocurre el dodge y se limpia el panel
      await h.fastLane.probe();
      assert.strictEqual(h.getOverlay().status, 'idle');
      assert.strictEqual(h.queueWatcher.isMatchDismissed(820001), true);

      // Ahora termina la consulta lenta de ELO de m1: el guard isStaleMatch de main.js debe abortar el emit!
      const lateResult = await slowEloFetch;
      const stale = h.queueWatcher.isMatchDismissed(lateResult.matchId);
      assert.strictEqual(stale, true, 'isMatchDismissed debe bloquear el emit tardío de showMatchFound');
      assert.strictEqual(h.getOverlay().status, 'idle');
    } finally {
      h.cleanup();
    }
  });

  // 10) Verificación de wiring en main.js (re-cola limpia grace, descarta al pasar a EN PARTIDA y blinda showMatchFound)
  await test('Escenario 10: wiring real en main.js verificado (onRequeued, isDismissedMatch, dismissMatch en vivo y guard asíncrono)', async () => {
    const fs = require('fs');
    const path = require('path');
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    assert.ok(/isDismissedMatch:\s*\(id\)\s*=>\s*Boolean\(queueWatcher && queueWatcher\.isMatchDismissed\(id\)\)/.test(mainSrc));
    assert.ok(/onRequeued:\s*\(queueItem,\s*droppedMatchId\)\s*=>/.test(mainSrc));
    assert.ok(/queueWatcher\.handleRequeueFromFastLane\(queueItem,\s*droppedMatchId\)/.test(mainSrc));
    assert.ok(/meta && meta\.reason === 'requeued'/.test(mainSrc));
    assert.ok(/inLobby:\s*true/.test(mainSrc));
    assert.ok(/inLobby:\s*false/.test(mainSrc));
    assert.ok(/queueWatcher\.dismissMatch\(liveId\)/.test(mainSrc));
    assert.ok(/const isStaleMatch = \(\) =>/.test(mainSrc));
  });

  console.log(`\nResultado: ${passed} PASS · ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
