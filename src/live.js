'use strict';

/**
 * Detección instantánea de partida via websockets de AoE2 Companion.
 *
 * El REST /api/matches recién lista la partida cuando YA empezó. Para mostrar
 * el ELO en la ventana de ~60s de preparación hay dos handlers distintos:
 *
 *  1) QueueWatcher  → handler=queueing  ← MATCHMAKING RANKED (el importante)
 *     Apenas el juego arma la partida llega `queueingAdded` con
 *     `status:'matched'` y el roster completo (rating, rank, team, mapa).
 *     La app oficial: "The roster and sides are known a minute before the
 *     match reaches the ongoing list".
 *
 *  2) LobbyWatcher  → handler=lobbies  ← salas personalizadas
 *     Eventos lobbyAdded/Updated/Removed + slotAdded/Updated/Removed. Con
 *     profile_ids llegan solo tus slots, así que se abre un segundo socket con
 *     match_ids=<id> para el roster completo.
 *
 * QueueWatcher usa el socket SIN FILTRO (el mismo que usa el dashboard oficial)
 * y filtra en cliente por profileId. Así no dependemos de que el servidor
 * aplique bien `profile_ids` a los deltas: vemos todos los `matched` y el
 * nuestro no se puede perder. El tráfico es bajo (~4 KB/s + 100 KB iniciales).
 * Con AOE_QUEUE_FILTER=1 se vuelve al socket filtrado, para diagnóstico.
 *
 * El PRIMER mensaje de cada conexión es el estado completo (snapshot), lo que
 * permite reconectar a mitad del countdown sin perder la partida. Los demás
 * son arrays de deltas { type, data }, u objetos { type: 'pong' }.
 *
 * Los sockets piden `language: 'en'` a propósito: el `mapName` tiene que ser
 * el canónico (Hideout) para cruzarlo con AoE2 Companion y AoE2Insights; con
 * `es` el evento traía "Guaridas" y el informe no encontraba el mapa.
 *
 * Uso:
 *   const q = new QueueWatcher({ profileId, onMatched, onGone, log }); q.start();
 *   const l = new LobbyWatcher({ profileId, onLobby, onLobbyGone, log }); l.start();
 */

const SOCKET_BASE = process.env.AOE_COMPANION_SOCKET || 'wss://socket.aoe2companion.com';

const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 60000;
// Si en 2 minutos no llegó ni un mensaje (ni pong), la conexión está zombie.
const WATCHDOG_MS = 120000;

/*
 * CARRIL RÁPIDO (por qué existe)
 *
 * El feed global de `queueing` NO empuja cada evento: al conectar manda el
 * estado completo (~75 KB) y después un lote cada ~14-15 s (medido contra el
 * socket real). Esperar ese lote hacía que una partida recién apareada
 * apareciera hasta 15 s tarde; sumado al tiempo del servidor, el panel se
 * dibujaba cuando la partida ya estaba por empezar.
 *
 * La solución es pedir snapshots FRESCOS a demanda con una conexión corta:
 *   · sin cola  → socket FILTRADO por perfil (~300 B): dice si estoy buscando.
 *   · en cola   → socket GLOBAL (~75 KB, ~250 ms): trae el `matched` con el
 *                 roster completo en cuanto el servidor lo crea.
 * El snapshot global se le entrega a QueueWatcher.handleEvents(..., true), así
 * la detección, el dedupe y los avisos siguen viviendo en un solo lugar.
 */
const FAST_IDLE_MS = 6000; // sin cola: ping filtrado (300 B)
const FAST_QUEUE_MS = 1500; // en cola: snapshot global con el roster
const FAST_TIMEOUT_MS = 4000;
// Después de terminar una partida se sondea seguido 3 minutos: lo habitual es
// volver a la cola enseguida.
const HOT_IDLE_MS = 3 * 60 * 1000;
// Mientras está pausado (partida en curso) se mira el ping filtrado cada 20 s:
// si el aviso de "terminó" se pierde, el carril se reactiva solo.
const PROBE_PAUSED_MS = 20000;

/** URL de /listen para una query dada (misma forma para todos los sockets). */
function socketUrl(query) {
  const qs = Object.entries(query)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${SOCKET_BASE}/listen?${qs}`;
}

/**
 * Pide el PRIMER mensaje de una conexión nueva (el snapshot del servidor) y
 * cierra. Devuelve el array de eventos, o null si hubo error/timeout. Nunca
 * lanza: el carril rápido es un acelerador, no puede romper la app.
 */
function readSnapshot(query, timeoutMs = FAST_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let ws = null;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (ws) ws.close();
      } catch {
        /* ya estaba cerrado */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      ws = new WebSocket(socketUrl(query));
    } catch {
      finish(null);
      return;
    }
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      // Los mensajes de control (pong) no son estado: se sigue esperando.
      if (!Array.isArray(message)) return;
      finish(message);
    };
    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
}

/** ¿Este item del feed incluye al perfil dado? */
function includesProfile(item, profileId) {
  return (item.players || []).some((p) => p && Number(p.profileId) === Number(profileId));
}

/** Item `status:'matched'` del perfil (o null). */
function findMyMatch(events, profileId) {
  return (
    (events || []).find(
      (e) => e && e.data && e.data.status === 'matched' && includesProfile(e.data, profileId),
    ) || null
  );
}

/** ¿El perfil está en cola según este snapshot? */
function hasMyQueue(events, profileId) {
  return (events || []).some(
    (e) =>
      e &&
      e.data &&
      e.data.status === 'queueing' &&
      includesProfile(e.data, profileId),
  );
}

/** Reduce de eventos a lista de lobbies, igual que initLobbySubscription de la app. */
function applyEvents(lobbies, events, filtered) {
  for (const event of events) {
    if (!event || !event.data || event.data.matchId == null) continue;
    let lobby = lobbies.find((l) => Number(l.matchId) === Number(event.data.matchId));

    if (!lobby && filtered) {
      lobby = { matchId: event.data.matchId, players: [] };
      lobbies.push(lobby);
    }

    switch (event.type) {
      case 'lobbyAdded':
        lobbies.push(event.data);
        break;
      case 'lobbyUpdated':
        if (lobby) Object.assign(lobby, event.data);
        break;
      case 'lobbyRemoved': {
        const index = lobbies.indexOf(lobby);
        if (index !== -1) lobbies.splice(index, 1);
        break;
      }
      case 'slotAdded':
        if (!lobby) break;
        lobby.players = lobby.players || [];
        lobby.players[event.data.slot] = event.data;
        break;
      case 'slotUpdated':
        if (!lobby) break;
        lobby.players = lobby.players || [];
        if (lobby.players[event.data.slot] == null) lobby.players[event.data.slot] = event.data;
        else Object.assign(lobby.players[event.data.slot], event.data);
        break;
      case 'slotRemoved':
        if (lobby && lobby.players) delete lobby.players[event.data.slot];
        break;
      default:
        break;
    }
  }
  return lobbies;
}

/** Una conexión con reconexión y watchdog, usada para los dos handlers. */
class Socket {
  constructor(name, query, onEvents, log, onClose, onOpen) {
    this.name = name;
    this.query = query;
    this.onEvents = onEvents;
    this.onClose = onClose;
    this.onOpen = onOpen;
    this.log = log;
    this.ws = null;
    this.closedByUs = false;
    this.retries = 0;
    this.reconnectTimer = null;
    this.watchdog = null;
    this.firstMessage = true;
  }

  url() {
    return socketUrl(this.query);
  }

  connect() {
    this.clearTimers();
    this.firstMessage = true;
    if (this.onOpen) this.onOpen();
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch (err) {
      this.log(`socket ${this.name}: no pude conectar (${err.message})`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.log(`socket ${this.name}: conectado`);
      this.armWatchdog();
    };
    ws.onmessage = (event) => {
      this.armWatchdog();
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!Array.isArray(message)) {
        if (message && message.type === 'pong') return;
        message = [message];
      }
      // El primer mensaje de cada conexión es el estado completo del servidor:
      // `[]` significa "no hay nada activo". Los siguientes son deltas.
      this.onEvents(message, this.firstMessage);
      this.firstMessage = false;
    };
    ws.onerror = () => {
      /* el cierre llega por onclose */
    };
    ws.onclose = (event) => {
      if (this.closedByUs) return;
      this.log(`socket ${this.name}: cerrado (código ${event.code})`);
      if (this.onClose) this.onClose();
      this.scheduleReconnect();
    };
  }

  armWatchdog() {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      this.log(`socket ${this.name}: ${WATCHDOG_MS / 1000}s sin mensajes, reconectando`);
      try {
        if (this.ws) this.ws.close();
      } catch {
        /* el onclose dispara la reconexión */
      }
      // Si el close no llega (socket colgado), forzamos la reconexión igual.
      this.scheduleReconnect();
    }, WATCHDOG_MS);
  }

  scheduleReconnect() {
    if (this.closedByUs || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.retries);
    this.retries += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUs) this.connect();
    }, delay);
  }

  clearTimers() {
    clearTimeout(this.watchdog);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  close() {
    this.closedByUs = true;
    this.clearTimers();
    try {
      if (this.ws) this.ws.close();
    } catch {
      /* ya estaba cerrado */
    }
    this.ws = null;
  }
}

/**
 * Acelerador de detección: no decide nada, solo pide snapshots frescos.
 *
 * Mientras NO hay cola usa el socket filtrado (300 B) para enterarse rápido de
 * que empezó la búsqueda; mientras ESTÁS EN COLA pide el snapshot global cada
 * 1,5 s, que trae el `matched` con el roster en cuanto el servidor lo publica
 * (el feed empujado tarda hasta 15 s en mandarlo).
 *
 * Cuando hay partida apareada se pausa: el socket normal ya mantiene los datos
 * y no tiene sentido gastar ancho de banda. Se reanuda al terminar la partida.
 */
class FastLane {
  constructor({ profileId, onSnapshot, onQueue, log = () => {}, readSnapshotImpl = readSnapshot }) {
    this.pauseTimer = null;
    this.profileId = Number(profileId);
    this.onSnapshot = onSnapshot || (() => {});
    this.onQueue = onQueue || (() => {});
    this.log = log;
    // Inyectable para poder probar la máquina de estados sin abrir sockets.
    this.readSnapshot = readSnapshotImpl;
    this.timer = null;
    this.closed = false;
    this.paused = false;
    this.inQueue = false;
    this.busy = false;
    this.polls = 0;
    this.startedAt = 0;
    // Minutos "calientes" después de una partida: se vuelve a sonar seguido
    // porque lo normal es volver a ponerse en cola enseguida.
    this.hotUntil = 0;
  }

  start() {
    this.closed = false;
    this.startedAt = Date.now();
    this.schedule(500);
  }

  stop() {
    this.closed = true;
    this.clear();
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  /** Hay partida apareada: no se sondea hasta que termine. */
  pause() {
    this.paused = true;
    this.inQueue = false;
    this.clear();
    this.probeAfterPause();
  }

  /**
   * Una pausa NO puede dejar el carril muerto para siempre: si el aviso de
   * "terminó la partida" no llega (socket caído, item que no desaparece) la
   * app volvía a detectar solo por el feed empujado, que manda lotes cada
   * ~15 s. Cada 20 s se mira el ping filtrado (300 B) y, si hay cola otra vez,
   * se reactiva solo.
   */
  probeAfterPause() {
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    if (this.closed) return;
    this.pauseTimer = setTimeout(() => this.probe(), PROBE_PAUSED_MS);
  }

  async probe() {
    this.pauseTimer = null;
    if (this.closed) return;
    const events = await this.readSnapshot(
      { handler: 'queueing', language: 'en', profile_ids: this.profileId },
      3000,
    );
    if (this.closed) return;
    if (events && (hasMyQueue(events, this.profileId) || findMyMatch(events, this.profileId))) {
      this.log('carril rápido: hay cola otra vez · se reactiva solo');
      this.resume();
      return;
    }
    if (this.paused) this.probeAfterPause();
  }

  resume() {
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    if (!this.paused) return;
    this.paused = false;
    this.inQueue = false;
    this.hotUntil = Date.now() + HOT_IDLE_MS;
    this.schedule(400);
  }

  /** Cadencia del ping filtrado cuando no hay cola. */
  idleDelay() {
    return Date.now() < this.hotUntil ? FAST_QUEUE_MS : FAST_IDLE_MS;
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delay) {
    if (this.closed || this.paused) return;
    this.clear();
    this.timer = setTimeout(() => this.tick(), delay);
  }

  tick() {
    this.timer = null;
    if (this.closed || this.paused || this.busy) return;
    this.busy = true;
    this.poll()
      .catch(() => {})
      .finally(() => {
        this.busy = false;
        if (this.closed || this.paused) return;
        this.schedule(this.inQueue ? FAST_QUEUE_MS : this.idleDelay());
      });
  }

  async poll() {
    const query = this.inQueue
      ? { handler: 'queueing', language: 'en' }
      : { handler: 'queueing', language: 'en', profile_ids: this.profileId };
    const events = await this.readSnapshot(query, this.inQueue ? FAST_TIMEOUT_MS : 3000);
    if (this.closed || this.paused) return;
    if (!events) return; // red lenta o servidor mudo: se reintenta en el próximo tick
    this.polls += 1;

    if (!this.inQueue) {
      // Una cola rápida puede pasar de `queueing` a `matched` entre dos pings
      // (cada 6 s). Mirar solo `queueing` hacía que el carril NUNCA se
      // acelerara en esos casos: la partida aparecía recién con el lote
      // empujado (~15 s) o cuando el REST ya la veía empezada.
      const matched = findMyMatch(events, this.profileId);
      if (!hasMyQueue(events, this.profileId) && !matched) return;
      this.inQueue = true;
      this.log(
        `carril rápido: ${matched ? 'partida apareada' : 'cola detectada'} · ` +
          `snapshot del feed cada ${FAST_QUEUE_MS / 1000}s`,
      );
      this.onQueue(true);
      if (!matched) return; // en cola: el próximo tick (1,5 s) trae el global
      // Ya apareada: se pide el snapshot global AHORA, sin esperar el tick.
      const full = await this.readSnapshot({ handler: 'queueing', language: 'en' }, FAST_TIMEOUT_MS);
      if (this.closed || this.paused || !full || !full.length) return;
      this.polls += 1;
      this.onSnapshot(full);
      return;
    }

    // Snapshot global: se le entrega al watcher para que aplique su lógica.
    if (!events.length) return;
    this.onSnapshot(events);
    // Si ya no estoy ni en cola ni apareado, la búsqueda terminó: se vuelve al
    // ping filtrado (300 B) hasta la próxima cola.
    if (!hasMyQueue(events, this.profileId) && !findMyMatch(events, this.profileId)) {
      this.inQueue = false;
      this.onQueue(false);
    }
  }

  get stats() {
    return { polls: this.polls, inQueue: this.inQueue, paused: this.paused };
  }
}

class LobbyWatcher {
  /**
   * onLobby(lobby): lobby completo (o actualizado) donde juega profileId.
   * onLobbyGone(matchId): la sala se cerró: la partida empezó o se canceló.
   */
  constructor({ profileId, onLobby, onLobbyGone, log = () => {} }) {
    this.profileId = Number(profileId);
    this.onLobby = onLobby;
    this.onLobbyGone = onLobbyGone;
    this.log = log;
    this.ownLobbies = []; // socket filtrado por profile_ids (descubre matchIds)
    this.fullLobbies = []; // socket por match_ids (roster completo)
    this.matchSocket = null;
    this.profileSocket = null;
    this.subscribedMatchId = null;
    this.announced = new Set(); // lobbies ya vistos, para loguear una sola vez
  }

  start() {
    this.profileSocket = new Socket(
      'lobbies(perfil)',
      { handler: 'lobbies', language: 'en', profile_ids: this.profileId },
      (events, isSnapshot) => this.handleOwnEvents(events, isSnapshot),
      this.log,
    );
    this.profileSocket.connect();
  }

  stop() {
    if (this.profileSocket) this.profileSocket.close();
    if (this.matchSocket) this.matchSocket.close();
    this.profileSocket = null;
    this.matchSocket = null;
    this.ownLobbies = [];
    this.fullLobbies = [];
    this.subscribedMatchId = null;
    this.announced.clear();
  }

  handleOwnEvents(events, isSnapshot = false) {
    if (isSnapshot) this.ownLobbies = [];
    const removed = events.filter((e) => e && e.type === 'lobbyRemoved');
    this.ownLobbies = applyEvents(this.ownLobbies, events, true);

    // ¿Estoy sentado en alguna sala? (por las dudas, cualquier lobby que me
    // incluya entre sus slots; con el filtro deberían ser todos míos)
    const mine = this.ownLobbies.find((lobby) =>
      (lobby.players || []).some((p) => p && Number(p.profileId) === this.profileId),
    );

    if (mine && Number(this.subscribedMatchId) !== Number(mine.matchId)) {
      this.subscribeFull(mine.matchId);
    }

    for (const event of removed) {
      if (this.subscribedMatchId != null && Number(event.data.matchId) === Number(this.subscribedMatchId)) {
        this.log(`lobby ${event.data.matchId} cerrado: la partida arranca o se canceló`);
        if (this.matchSocket) this.matchSocket.close();
        this.matchSocket = null;
        this.subscribedMatchId = null;
        this.fullLobbies = [];
        this.onLobbyGone(Number(event.data.matchId));
      }
    }
  }

  /** Segundo socket: roster completo del lobby (todos los slots). */
  subscribeFull(matchId) {
    if (this.matchSocket) this.matchSocket.close();
    this.subscribedMatchId = Number(matchId);
    this.fullLobbies = [];
    this.log(`partida encontrada (sala ${matchId}): pidiendo el roster completo…`);

    this.matchSocket = new Socket(
      'lobbies(sala)',
      { handler: 'lobbies', language: 'en', match_ids: matchId },
      (events, isSnapshot) => this.handleFullEvents(events, isSnapshot),
      this.log,
    );
    this.matchSocket.connect();
  }

  handleFullEvents(events, isSnapshot = false) {
    if (isSnapshot) this.fullLobbies = [];
    this.fullLobbies = applyEvents(this.fullLobbies, events, true);
    const lobby = this.fullLobbies.find((l) => Number(l.matchId) === this.subscribedMatchId);
    if (!lobby) return;

    const players = (lobby.players || []).filter(Boolean);
    if (!players.some((p) => Number(p.profileId) === this.profileId)) return;

    if (!this.announced.has(lobby.matchId)) {
      this.announced.add(lobby.matchId);
      this.log(
        `roster de la sala: ${players.map((p) => `${p.name}${Number(p.profileId) === this.profileId ? '*' : ''}`).join(' · ')}`,
      );
    }
    this.onLobby(lobby);
  }

  /** Lobby activo con roster completo (o null si no estás en sala). */
  get lobby() {
    return this.fullLobbies.find((l) => Number(l.matchId) === this.subscribedMatchId) || null;
  }
}

/**
 * MATCHMAKING RANKEADO — este es el que dispara en la ventana de ~60s.
 *
 * `handler=lobbies` solo publica salas personalizadas (el browser de lobbies).
 * Cuando AoE2 DE hace match en ranked, el evento vive en `handler=queueing`:
 * apenas se arma la partida llega `queueingAdded` con `status: 'matched'`,
 * `matchId`, `leaderboard` (rm_1v1, rm_team…), `mapName` y el roster completo
 * con `rating`/`rank` por jugador. La app oficial lo dice literal:
 * "The roster and sides are known a minute before the match reaches the
 * ongoing list". El REST /api/matches recién la lista cuando ya empezó.
 *
 * Eventos: queueingAdded / queueingUpdated / queueingRemoved.
 * El primer mensaje de cada conexión es el estado completo (snapshot), lo que
 * permite reconectar a mitad del countdown sin perder la partida.
 */
class QueueWatcher {
  constructor({ profileId, onMatched, onGone, onSearching, onFound, log = () => {} }) {
    this.profileId = Number(profileId);
    this.onMatched = onMatched;
    this.onGone = onGone;
    this.onSearching = onSearching || (() => {});
    // Aviso de "tu cola ya se apareó", ANTES de tener el roster del rival.
    this.onFound = onFound || (() => {});
    this.log = log;
    this.items = new Map(); // id -> item (search o matched)
    this.matchedId = null;
    this.lastMatchedJson = '';
    this.wasSearching = false;
    this.sawDelta = false;
    this.socket = null;
    // ids de MIS búsquedas (q_xxx). El servidor las borra con reason:'matched'
    // y ese evento trae el matchId en el mismo lote que el item m_<matchId>.
    this.ownQueueIds = new Set();
    this.pendingMatchId = null;
    // El dashboard oficial se conecta sin profile_ids y filtra en cliente.
    // Eso evita depender de que el servidor filtre también los deltas.
    this.useFilter = process.env.AOE_QUEUE_FILTER === '1';
  }

  start() {
    // Nombres canónicos en inglés: con `es` el mapa llegaba como "Guaridas"
    // y no coincidía con el historial ("Hideout") ni con los replays.
    const query = { handler: 'queueing', language: 'en' };
    if (this.useFilter) query.profile_ids = this.profileId;
    this.log(
      `queueing: escuchando matchmaking (${
        this.useFilter ? `filtrado por perfil ${this.profileId}` : 'flujo global, filtrado en cliente'
      })`,
    );
    this.socket = new Socket(
      'queueing',
      query,
      (events, isSnapshot) => this.handleEvents(events, isSnapshot),
      this.log,
      null,
    );
    this.socket.connect();
  }

  stop() {
    if (this.socket) this.socket.close();
    this.socket = null;
    this.items.clear();
    this.ownQueueIds.clear();
    this.pendingMatchId = null;
    this.matchedId = null;
    this.lastMatchedJson = '';
    this.wasSearching = false;
    this.sawDelta = false;
  }

  handleEvents(events, isSnapshot = false, options = {}) {
    // Cada conexión nueva trae el estado completo: se recalcula desde cero.
    if (isSnapshot) {
      this.items.clear();
      this.ownQueueIds.clear();
    }

    const includesMe = (item) =>
      (item.players || []).some((p) => p && Number(p.profileId) === this.profileId);

    let removedMatched = false;
    for (const event of events) {
      if (!event || !event.data) continue;
      const id = String(event.data.id ?? event.data.matchId ?? '');
      if (!id) continue;
      switch (event.type) {
        case 'queueingAdded':
        case 'queueingUpdated':
          this.items.set(id, event.data);
          // En el snapshot (y en cada alta) marcamos cuáles colas son mías.
          if (event.data.status === 'queueing' && includesMe(event.data)) {
            this.ownQueueIds.add(id);
          }
          break;
        case 'queueingRemoved':
          if (id === this.matchedId) removedMatched = true;
          // Segunda vía de detección: el servidor cierra MI cola con
          // reason:'matched' + matchId en el mismo lote que el item m_<id>.
          // Avisamos YA, sin esperar a que el roster termine de armarse, y
          // guardamos el matchId para encontrarlo aunque el item venga con
          // otro id o sin mi profileId en players (pasa en algunas colas).
          if (
            this.ownQueueIds.has(id) &&
            event.data.reason === 'matched' &&
            event.data.matchId != null
          ) {
            this.pendingMatchId = Number(event.data.matchId);
            this.log(`cola apareada: matchId ${this.pendingMatchId} · aviso instantáneo`);
            this.onFound(this.pendingMatchId);
          }
          this.ownQueueIds.delete(id);
          // A veces el servidor cierra la búsqueda con reason:'started' y el
          // matchId, sin reenviar el id del item apareado. Ahí la partida ya
          // empezó: hay que entregarle el panel al REST.
          if (event.data.reason === 'started' && event.data.matchId != null) {
            const current = this.items.get(this.matchedId);
            if (current && Number(current.matchId) === Number(event.data.matchId)) {
              removedMatched = true;
              // Sin esto `mine` seguiría encontrando el item y el panel no
              // se entregaría al REST cuando la partida ya arrancó.
              this.items.delete(this.matchedId);
            }
          }
          this.items.delete(id);
          break;
        default:
          break;
      }
    }

    // Diagnóstico: deja evidencia en el log de que el socket está realmente
    // recibiendo el estado del matchmaking (no solo "conectado").
    if (isSnapshot) {
      // Los snapshots del carril rápido llegan cada 1,5 s: no inundan el log.
      if (!options.quiet) {
        const matchedGlobal = [...this.items.values()].filter((i) => i.status === 'matched').length;
        this.log(`queueing: estado inicial ${this.items.size} items (${matchedGlobal} apareadas globales)`);
      }
    } else if (!this.sawDelta && events.length) {
      this.sawDelta = true;
      this.log(`queueing: recibiendo eventos en vivo (${events.length})`);
    }

    const all = [...this.items.values()];
    let mine = all.find((item) => item.status === 'matched' && includesMe(item));

    // Si el roster no incluye explícitamente mi profileId (o vino con otro
    // id), el matchId del aviso de mi propia cola lo identifica igual. Así la
    // partida encontrada no se pierde por un detalle de forma del payload.
    if (!mine && this.pendingMatchId != null) {
      mine = all.find(
        (item) =>
          (Number(item.matchId) === this.pendingMatchId ||
            String(item.id) === `m_${this.pendingMatchId}`) &&
          (item.players || []).length > 0,
      );
      if (mine) this.log(`roster ubicado por matchId ${this.pendingMatchId} (${mine.players.length} jugadores)`);
    }

    // Diagnóstico: confirma que el socket ve la cola, no solo que conectó.
    const searching = !mine && all.some(
      (item) => item.status === 'queueing' && includesMe(item),
    );
    if (searching !== this.wasSearching) {
      this.wasSearching = searching;
      this.onSearching(searching);
    }

    if (mine) {
      const json = JSON.stringify(mine);
      this.matchedId = String(mine.id);
      this.pendingMatchId = null;
      if (json !== this.lastMatchedJson) {
        this.lastMatchedJson = json;
        this.onMatched(mine);
      }
      return;
    }

    // Solo se da por terminada con evidencia: snapshot sin la sala, o un
    // queueingRemoved explícito. Un mensaje de otros jugadores no la borra.
    if (this.matchedId && (isSnapshot || removedMatched)) {
      const gone = this.matchedId;
      this.matchedId = null;
      this.lastMatchedJson = '';
      this.onGone(gone);
    }
  }

  /** Partida apareada y vigente (o null). */
  get matched() {
    return this.matchedId ? this.items.get(this.matchedId) || null : null;
  }

  /**
   * Ya avisamos "encontré rival" (reason:'matched') pero el roster todavía no
   * llegó. main lo usa para no dejar que el REST borre el panel mientras se
   * arma la pre-partida.
   */
  get awaitingRoster() {
    return this.pendingMatchId != null;
  }
}

module.exports = {
  LobbyWatcher,
  QueueWatcher,
  FastLane,
  readSnapshot,
  findMyMatch,
  hasMyQueue,
  FAST_IDLE_MS,
  FAST_QUEUE_MS,
};
