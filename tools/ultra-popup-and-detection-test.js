'use strict';

/**
 * Simulación end-to-end:
 *   A) Popup de bienvenida Ultra (cero repeticiones por refresh periódico 15 min,
 *      migración v1->v2, race de JWT expirado / suspensión / desbloqueo, persistencia
 *      dual config.json + localStorage y alias de cuenta).
 *   B) Detección de partida en vivo (coalescing Frame 1 + Frame 2 de Companion WS,
 *      guard anti-socket obsoleto en watchdog, merge no destructivo de FastLane,
 *      fallback global en cola y ráfaga REST de savegame/cola finalizada).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  Socket,
  QueueWatcher,
  FastLane,
  readSnapshot,
  reduceSnapshotFrames,
} = require('../src/live');

const ROOT = path.join(__dirname, '..');
const settingsSrc = fs.readFileSync(path.join(ROOT, 'settings.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(ROOT, 'settings-preload.js'), 'utf8');

/**
 * Extrae el bloque real del popup Ultra + renderProduct desde settings.js y lo ejecuta
 * en un sandbox VM con localStorage, DOM mínimo y mock de config.json (markUltraWelcomeSeen).
 */
function buildUltraPopupHarness({ initialLocalStorage = {}, initialConfigSeen = {}, currentProfileId = 25399083 } = {}) {
  const startMarker = "const ULTRA_WELCOME_SEEN_KEY = 'relic_ultra_welcome_seen_v2';";
  const endMarker = '  syncTrialHoursFrom(product);';
  const startIdx = settingsSrc.indexOf(startMarker);
  const endIdx = settingsSrc.indexOf(endMarker, startIdx);
  assert.ok(startIdx !== -1 && endIdx !== -1, 'No se pudo localizar el bloque del popup Ultra en settings.js');
  const snippet = settingsSrc.slice(startIdx, endIdx) + '\n}\n';

  const lsStore = new Map(Object.entries(initialLocalStorage));
  const configSeen = { ...initialConfigSeen };
  const markCalls = [];
  let showCount = 0;

  const backdrop = {
    _hidden: true,
    get hidden() { return this._hidden; },
    set hidden(val) {
      if (this._hidden && !val) showCount += 1;
      this._hidden = Boolean(val);
    },
    addEventListener() {},
  };
  const elements = {
    ultraWelcomeBackdrop: backdrop,
    ultraWelcomePrimaryBtn: { textContent: '', addEventListener() {} },
    ultraWelcomeDismissBtn: { hidden: false, addEventListener() {} },
    ultraWelcomeCloseBtn: { addEventListener() {} },
    appBootLoader: { hidden: true, classList: { contains: () => true } },
  };

  const sandbox = {
    Date,
    Object,
    Array,
    Set,
    Map,
    JSON,
    Number,
    String,
    Boolean,
    setTimeout,
    clearTimeout,
    currentTheme: 'ultra',
    currentProduct: null,
    currentProfileId,
    lastAuthState: null,
    isUltraTheme: (th) => th === 'ultra' || th === 'ultra-gamma',
    applyTheme: () => {},
    t: (_k, fb) => fb,
    el: (id) => elements[id] || null,
    localStorage: {
      getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
      setItem: (k, v) => { lsStore.set(k, String(v)); },
      removeItem: (k) => { lsStore.delete(k); },
    },
    window: {
      UiSfx: { play() {} },
      settings: {
        theme: async () => ({ ok: true }),
        markUltraWelcomeSeen: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          markCalls.push(list);
          for (const k of list) {
            if (k) configSeen[k] = configSeen[k] || Date.now();
          }
          return { ok: true, ultraWelcomeSeen: { ...configSeen } };
        },
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);
  if (Object.keys(configSeen).length) {
    sandbox.mergePersistedUltraWelcomeSeen(configSeen);
  }

  return {
    sandbox,
    lsStore,
    configSeen,
    markCalls,
    backdrop,
    getShowCount: () => showCount,
  };
}

let passed = 0;
let failed = 0;

async function runCase(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${err && err.stack ? err.stack : err}`);
  }
}

(async () => {
  console.log('=== SIMULACIÓN END-TO-END: POPUP ULTRA Y DETECCIÓN DE PARTIDAS ===\n');

  // -------------------------------------------------------------------------
  // 1. Popup Ultra: 20 refrescos periódicos (15 min) con expiresAt cambiante
  // -------------------------------------------------------------------------
  await runCase('1. Popup Ultra: aparece 1 sola vez y NUNCA en 20 refrescos periódicos de 15 min', async () => {
    const h = buildUltraPopupHarness();
    const baseExp = Date.now() + 15 * 60 * 1000;

    // Primera activación Ultra: debe mostrarse exactamente 1 vez
    h.sandbox.renderProduct({
      plan: 'promax',
      entitlement: { valid: true, plan: 'promax', accountId: 'aoe2:25399083', expiresAt: baseExp },
      remoteLicense: { status: 'verified', plan: 'promax', accountId: 'aoe2:25399083' },
    });
    assert.equal(h.getShowCount(), 1, 'Debe abrirse en la primera activación Ultra');
    assert.equal(h.backdrop.hidden, false);
    assert.ok(h.configSeen['aoe2:25399083'], 'Debe persistir en config.json inmediatamente');

    // Usuario cierra el popup
    h.sandbox.closeUltraWelcomePopup();
    assert.equal(h.backdrop.hidden, true);

    // 20 ticks periódicos cada 15 min con nuevo JWT expiresAt (+900s cada vez)
    for (let i = 1; i <= 20; i++) {
      h.sandbox.renderProduct({
        plan: 'promax',
        entitlement: { valid: true, plan: 'promax', accountId: 'aoe2:25399083', expiresAt: baseExp + i * 900_000 },
        remoteLicense: { status: 'verified', plan: 'promax', accountId: 'aoe2:25399083' },
        ultraWelcomeSeen: { ...h.configSeen },
      });
    }
    assert.equal(h.getShowCount(), 1, 'Nunca debe reabrirse en refrescos periódicos');
  });

  // -------------------------------------------------------------------------
  // 2. Migración automática desde v1 (log real de Juan en v3.3.24)
  // -------------------------------------------------------------------------
  await runCase('2. Popup Ultra: migración automática desde relic_ultra_welcome_seen_v1 evita reaparición al actualizar', async () => {
    const h = buildUltraPopupHarness({
      initialLocalStorage: {
        relic_ultra_welcome_seen_v1: 'aoe2:25399083:1795879775000',
      },
    });

    h.sandbox.renderProduct({
      plan: 'promax',
      entitlement: { valid: true, plan: 'promax', accountId: 'aoe2:25399083', expiresAt: Date.now() + 900_000 },
      remoteLicense: { status: 'verified', plan: 'promax', accountId: 'aoe2:25399083' },
    });

    assert.equal(h.getShowCount(), 0, 'Un usuario Ultra que ya vio v1 NO debe ver el popup al actualizar');
    assert.equal(h.lsStore.has('relic_ultra_welcome_seen_v1'), false, 'Clave legacy v1 debe limpiarse');
    assert.ok(h.lsStore.has('relic_ultra_welcome_seen_v2'), 'Clave v2 debe migrarse');
    assert.ok(h.configSeen['aoe2:25399083'], 'Migración también debe guardarse en config.json');
  });

  // -------------------------------------------------------------------------
  // 3. Race de JWT expirado / suspensión / desbloqueo de Windows
  // -------------------------------------------------------------------------
  await runCase('3. Popup Ultra: suspensión/desbloqueo/JWT expirado NUNCA borran visto ni reabren el popup', async () => {
    const h = buildUltraPopupHarness();
    h.sandbox.renderProduct({
      plan: 'promax',
      entitlement: { valid: true, plan: 'promax', accountId: 'aoe2:25399083', expiresAt: Date.now() + 900_000 },
      remoteLicense: { status: 'verified', plan: 'promax', accountId: 'aoe2:25399083' },
    });
    h.sandbox.closeUltraWelcomePopup();
    assert.equal(h.getShowCount(), 1);

    // Simular 3 estados transitorios de free durante wake/unlock/expiry/network-error
    for (const transientStatus of ['refreshing', 'verified', 'network-error', 'unconfigured']) {
      h.sandbox.renderProduct({
        plan: 'free',
        entitlement: { valid: false, reason: 'expired', plan: 'free', accountId: null },
        remoteLicense: { status: transientStatus, plan: 'promax', accountId: 'aoe2:25399083' },
        ultraWelcomeSeen: { ...h.configSeen },
      });
      assert.equal(
        h.sandbox.isLicenseSettled({
          plan: 'free',
          remoteLicense: { status: transientStatus },
        }),
        false,
        `plan:free con remoteLicense.status="${transientStatus}" NO debe considerarse downgrade definitivo`,
      );
      // 300ms después vuelve syncRemoteLicense con promax
      h.sandbox.renderProduct({
        plan: 'promax',
        entitlement: { valid: true, plan: 'promax', accountId: 'aoe2:25399083', expiresAt: Date.now() + 1800_000 },
        remoteLicense: { status: 'verified', plan: 'promax', accountId: 'aoe2:25399083' },
        ultraWelcomeSeen: { ...h.configSeen },
      });
    }
    assert.equal(h.getShowCount(), 1, 'Ninguna carrera de sueño/desbloqueo/JWT puede reabrir el popup');
  });

  // -------------------------------------------------------------------------
  // 4. Persistencia en config.json sobrevive incluso si localStorage se borra
  // -------------------------------------------------------------------------
  await runCase('4. Popup Ultra: si localStorage se limpia, config.json (ultraWelcomeSeen) impide reaparición', async () => {
    const h = buildUltraPopupHarness({
      initialLocalStorage: {},
      initialConfigSeen: { 'aoe2:25399083': Date.now() - 86400_000 },
    });
    h.sandbox.renderProduct({
      plan: 'promax',
      entitlement: { valid: true, plan: 'promax', accountId: 'aoe2:25399083', expiresAt: Date.now() + 900_000 },
      remoteLicense: { status: 'verified', plan: 'promax', accountId: 'aoe2:25399083' },
      ultraWelcomeSeen: { 'aoe2:25399083': Date.now() - 86400_000 },
    });
    assert.equal(h.getShowCount(), 0, 'config.json debe impedir reaparición con localStorage vacío');
  });

  // -------------------------------------------------------------------------
  // 5. Cambio de alias de cuenta (aoe2:ID vs google:UID) y cambios de idioma
  // -------------------------------------------------------------------------
  await runCase('5. Popup Ultra: alias google:UID + aoe2:ID y re-renders de idioma/postmatch NO duplican popup', async () => {
    const h = buildUltraPopupHarness({ currentProfileId: 25399083 });
    h.sandbox.renderProduct({
      plan: 'promax',
      entitlement: { valid: true, plan: 'promax', accountId: 'aoe2:25399083', expiresAt: Date.now() + 900_000 },
      remoteLicense: { status: 'verified', plan: 'promax', accountId: 'aoe2:25399083' },
    });
    h.sandbox.closeUltraWelcomePopup();
    assert.equal(h.getShowCount(), 1);

    // Ahora llega Google UID diferente para el mismo perfil AoE2 + sin remoteLicense (como en paintPostMatch)
    h.sandbox.lastAuthState = { user: { id: 'google:109876543' } };
    h.sandbox.renderProduct({
      plan: 'promax',
      accountId: 'google:109876543',
      entitlement: { valid: true, plan: 'promax', accountId: 'google:109876543', expiresAt: Date.now() + 900_000 },
    });
    // Y múltiples re-renders de idioma
    for (let i = 0; i < 5; i++) h.sandbox.renderProduct(h.sandbox.currentProduct);
    assert.equal(h.getShowCount(), 1, 'Alias del mismo usuario ni re-renders deben reabrir el popup');
  });

  // -------------------------------------------------------------------------
  // 6. Companion WS: readSnapshot coalescing Frame 1 (15s viejo) + Frame 2 (+1ms vivo)
  // -------------------------------------------------------------------------
  await runCase('6. Companion WS: readSnapshot() combina Frame 1 (viejo) + Frame 2 (+1ms vivo) sin atraso de 15s', async () => {
    const OrigWS = global.WebSocket;
    let closedCount = 0;
    global.WebSocket = class FakeWS {
      constructor() {
        setTimeout(() => {
          // Frame 1: 15 s atrás, todavía queueing
          if (this.onmessage) {
            this.onmessage({
              data: JSON.stringify([
                { type: 'queueingAdded', data: { id: 'q_8nyjkg', status: 'queueing', players: [{ profileId: 25399083 }] } },
              ]),
            });
          }
        }, 5);
        setTimeout(() => {
          // Frame 2 (+5ms): catch-up delta real con matched y remoción de q_8nyjkg
          if (this.onmessage) {
            this.onmessage({
              data: JSON.stringify([
                { type: 'queueingRemoved', data: { id: 'q_8nyjkg', reason: 'matched', matchId: 523972325 } },
                {
                  type: 'queueingAdded',
                  data: {
                    id: 'm_523972325',
                    status: 'matched',
                    matchId: 523972325,
                    mapName: 'MegaRandom',
                    players: [{ profileId: 25399083 }, { profileId: 999 }],
                  },
                },
              ]),
            });
          }
        }, 12);
      }
      close() { closedCount += 1; }
    };

    try {
      const t0 = Date.now();
      const events = await readSnapshot({ handler: 'queueing', language: 'en', profile_ids: 25399083 }, 2000, 200);
      const elapsed = Date.now() - t0;
      assert.ok(elapsed < 180, `Debe cerrar apenas llega Frame 2 (tardó ${elapsed}ms)`);
      assert.equal(events.length, 1, 'q_8nyjkg borrado en Frame 2 no debe quedar fantasma');
      assert.equal(events[0].data.id, 'm_523972325');
      assert.equal(events[0].data.status, 'matched');
      assert.ok(closedCount >= 1);
    } finally {
      global.WebSocket = OrigWS;
    }

    // También probar reducción directa con queueingUpdated parcial
    const reduced = reduceSnapshotFrames([
      [{ type: 'queueingAdded', data: { id: 'm_10', status: 'matched', matchId: 10, mapName: null, players: [{ profileId: 1 }, { profileId: 2 }] } }],
      [{ type: 'queueingUpdated', data: { id: 'm_10', mapName: 'Hideout' } }],
    ]);
    assert.equal(reduced.length, 1);
    assert.equal(reduced[0].data.mapName, 'Hideout');
    assert.equal(reduced[0].data.players.length, 2, 'queueingUpdated parcial debe conservar players');
  });

  // -------------------------------------------------------------------------
  // 7. Socket persistente: burst inicial coalescido + guard anti-socket obsoleto + pong watchdog
  // -------------------------------------------------------------------------
  await runCase('7. Socket persistente: onclose tardío de ws1 NO mata a ws2, coalescing inicial y pong ignorado', async () => {
    const OrigWS = global.WebSocket;
    const instances = [];
    global.WebSocket = class MockSocket {
      constructor() {
        this.readyState = 1;
        this.closed = false;
        instances.push(this);
      }
      send() {}
      close() { this.closed = true; }
    };

    try {
      const received = [];
      const sock = new Socket(
        'queueing',
        { handler: 'queueing', language: 'en' },
        (evs, isSnap) => received.push({ evs, isSnap }),
        () => {},
        null,
        null,
        { watchdogMs: 60000, coalesceInitialBurst: true, ignorePongForWatchdog: true },
      );
      sock.connect();
      assert.equal(instances.length, 1);
      const ws1 = instances[0];
      ws1.onopen();

      // Simular Frame 1 (sin partida) + Frame 2 (+1ms, con partida)
      ws1.onmessage({
        data: JSON.stringify([{ type: 'queueingAdded', data: { id: 'q_old', status: 'queueing', players: [{ profileId: 1 }] } }]),
      });
      assert.equal(received.length, 0, 'Debe esperar Frame 2 antes de despachar snapshot atrasado');
      ws1.onmessage({
        data: JSON.stringify([
          { type: 'queueingRemoved', data: { id: 'q_old', reason: 'matched', matchId: 777 } },
          { type: 'queueingAdded', data: { id: 'm_777', status: 'matched', matchId: 777, players: [{ profileId: 1 }, { profileId: 2 }] } },
        ]),
      });
      assert.equal(received.length, 1, 'Frame 1 + Frame 2 llegan como UN solo snapshot atómico');
      assert.equal(received[0].isSnap, true);
      assert.equal(received[0].evs.length, 1);
      assert.equal(received[0].evs[0].data.id, 'm_777');

      // Verificar ignorePongForWatchdog: pong NO actualiza lastMessageAt
      sock.lastMessageAt = 12345;
      ws1.onmessage({ data: JSON.stringify({ type: 'pong' }) });
      assert.equal(sock.lastMessageAt, 12345, 'pong no debe refrescar lastMessageAt en el socket global');

      // Simular reconexión (ws2 reemplaza a ws1) y luego onclose tardío de ws1
      const staleOnClose = ws1.onclose;
      sock.connect();
      assert.equal(instances.length, 2);
      const ws2 = instances[1];
      ws2.onopen();
      assert.equal(ws1.closed, true, 'ws1 debe cerrarse al reconectar');
      assert.equal(ws1.onclose, null, 'handlers de ws1 deben desacoplarse');
      if (typeof staleOnClose === 'function') staleOnClose({ code: 1006 });
      assert.equal(sock.ws, ws2, 'onclose tardío de ws1 nunca debe tocar a ws2');
      assert.equal(sock.reconnectTimer, null, 'no debe programar reconexión fantasma sobre ws2');

      sock.close();
    } finally {
      global.WebSocket = OrigWS;
    }
  });

  // -------------------------------------------------------------------------
  // 8. Merge no destructivo de FastLane + queueingUpdated parcial en QueueWatcher
  // -------------------------------------------------------------------------
  await runCase('8. QueueWatcher.mergeFastLaneEvents() conserva el mapa global y ownQueueIds + merge parcial', async () => {
    const matchedEvents = [];
    const foundEvents = [];
    const qw = new QueueWatcher({
      profileId: 25399083,
      onMatched: (m) => matchedEvents.push(m),
      onGone: () => {},
      onFound: (mid) => foundEvents.push(mid),
    });

    // Estado global del socket persistente: 2 items de otros + mi cola
    qw.handleEvents([
      { type: 'queueingAdded', data: { id: 'q_other', status: 'queueing', players: [{ profileId: 111 }] } },
      { type: 'queueingAdded', data: { id: 'm_other', status: 'matched', matchId: 9001, players: [{ profileId: 222 }, { profileId: 333 }] } },
      { type: 'queueingAdded', data: { id: 'q_mine', status: 'queueing', players: [{ profileId: 25399083 }] } },
    ], true);
    assert.equal(qw.items.size, 3);
    assert.equal(qw.ownQueueIds.has('q_mine'), true);

    // FastLane entrega snapshot filtrado de 1 solo item (NO debe borrar q_other, m_other ni ownQueueIds)
    qw.mergeFastLaneEvents([
      {
        type: 'queueingAdded',
        data: {
          id: 'm_5240001',
          status: 'matched',
          matchId: 5240001,
          mapName: null,
          matchedAt: new Date().toISOString(),
          players: [{ profileId: 25399083, name: 'PSX | Acido', team: 0 }, { profileId: 7777, name: 'Rival', team: 1 }],
        },
      },
    ], { filtered: true });

    assert.equal(qw.items.has('q_other'), true, 'mergeFastLaneEvents no debe borrar items globales');
    assert.equal(qw.items.has('m_other'), true, 'mergeFastLaneEvents no debe borrar otras partidas globales');
    assert.equal(qw.ownQueueIds.has('q_mine'), true, 'mergeFastLaneEvents no debe borrar ownQueueIds');
    assert.equal(matchedEvents.length, 1);
    assert.equal(matchedEvents[0].matchId, 5240001);

    // Ahora llega un queueingUpdated parcial (solo mapa, sin repetir players/status)
    qw.handleEvents([
      { type: 'queueingUpdated', data: { id: 'm_5240001', mapName: 'Hideout' } },
    ], false);
    assert.equal(matchedEvents.length, 2, 'Actualización parcial de mapa debe emitir onMatched');
    assert.equal(matchedEvents[1].mapName, 'Hideout');
    assert.equal(matchedEvents[1].players.length, 2, 'Debe conservar el roster previo');
  });

  // -------------------------------------------------------------------------
  // 9. FastLane fallback global cuando profile_ids= no muestra el match de equipo
  // -------------------------------------------------------------------------
  await runCase('9. FastLane cruza contra snapshot global cuando profile_ids= oculta un match de equipo', async () => {
    const snapshotsDelivered = [];
    const fl = new FastLane({
      profileId: 25399083,
      isGlobalHealthy: () => false,
      onSnapshot: (evs, meta) => snapshotsDelivered.push({ evs, meta }),
      readSnapshotImpl: async (query) => {
        if (query.profile_ids) {
          // Simula bug server-side: filtro sigue devolviendo solo queueing
          return [{ type: 'queueingAdded', data: { id: 'q_team', status: 'queueing', players: [{ profileId: 25399083 }] } }];
        }
        // Snapshot global SÍ tiene la partida apareada
        return [
          {
            type: 'queueingAdded',
            data: {
              id: 'm_5249999',
              status: 'matched',
              matchId: 5249999,
              mapName: 'MegaRandom',
              players: [{ profileId: 25399083 }, { profileId: 4444 }],
            },
          },
        ];
      },
    });

    // Tick 1: entra a inQueue
    await fl.poll();
    assert.equal(fl.inQueue, true);
    assert.equal(snapshotsDelivered.length, 0);
    // Tick 2: queueTicks=1 (no verifica global aún)
    await fl.poll();
    assert.equal(snapshotsDelivered.length, 0);
    // Tick 3: queueTicks=2 con global caído -> verifica snapshot global y captura la partida!
    await fl.poll();
    assert.equal(snapshotsDelivered.length, 1, 'Fallback global debe rescatar la partida que profile_ids= ocultó');
    assert.equal(snapshotsDelivered[0].meta.filtered, false);
    assert.equal(snapshotsDelivered[0].evs[0].data.matchId, 5249999);
    fl.stop();
  });

  // -------------------------------------------------------------------------
  // 10. Verificación de wiring real en main.js y settings-preload.js
  // -------------------------------------------------------------------------
  await runCase('10. Wiring real verificado en main.js y settings-preload.js', async () => {
    assert.match(mainSrc, /ultraWelcomeSeen:\s*\{\}/, 'DEFAULT_CONFIG debe persistir ultraWelcomeSeen');
    assert.match(mainSrc, /ipcMain\.handle\('settings:markUltraWelcomeSeen'/, 'Debe existir IPC settings:markUltraWelcomeSeen');
    assert.match(mainSrc, /status:\s*'refreshing',\s*reason:\s*'jwt-expired'/, 'productExpiryTimer debe marcar refreshing');
    assert.match(mainSrc, /status:\s*'refreshing',\s*reason:\s*'resume'/, 'powerMonitor recoverLive debe marcar refreshing');
    assert.match(preloadSrc, /markUltraWelcomeSeen:\s*\(accountKey\)/, 'settings-preload debe exponer markUltraWelcomeSeen');
    assert.match(mainSrc, /queueWatcher\.mergeFastLaneEvents\(events,\s*meta\)/, 'FastLane debe usar mergeFastLaneEvents no destructivo');
    assert.match(mainSrc, /queueWatcher\.recordQueueIdFromFastLane\(queueItem\)/, 'FastLane debe registrar ownQueueIds');
    assert.match(mainSrc, /pendingRosterTimer\s*=/, 'onFound debe rescatar rosters huérfanos');
    assert.match(mainSrc, /savegameBurstUntil\s*=\s*now\s*\+\s*35000/, 'savegame debe activar ráfaga REST de 35 s');
    assert.match(mainSrc, /queueEndedBurstUntil\s*=\s*Date\.now\(\)\s*\+\s*20000/, 'cola finalizada sin match debe activar ráfaga REST de 20 s');
    assert.match(mainSrc, /pendingSavegamePoll\s*=\s*true/, 'savegame durante polling activo no debe perderse');
  });

  console.log(`\nResultado: ${passed} PASS · ${failed} FAIL`);
  if (failed > 0) process.exit(1);
})();
