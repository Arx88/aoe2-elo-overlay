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
// Si el handshake inicial queda colgado (p. ej. antivirus/firewall tras actualizar), abortar rápido.
const CONNECT_TIMEOUT_MS = 15000;
// Si en 45 segundos no llegó ni un mensaje (ni pong), la conexión está zombie.
const WATCHDOG_MS = 45000;

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
const FAST_IDLE_MS = 3000; // sin cola: ping filtrado liviano (300 B) para detección rápida sin saturar
const FAST_QUEUE_MS = 1500; // en cola: ping filtrado rápido (300 B) con fallback global solo si falta roster
const FAST_TIMEOUT_MS = 4500;
// Companion envía Frame 1 (snapshot del tick anterior, ~15 s viejo) seguido +1 ms después
// por Frame 2 (delta en vivo del tick actual). Esperar hasta 250 ms por Frame 2 (cortando
// al instante apenas llega) elimina el desfase de 15 s y las resurrecciones fantasma.
const SNAPSHOT_COALESCE_MS = 250;
const INITIAL_BURST_COALESCE_MS = 180;
const QUIET_WATCHDOG_MS = 180000; // sockets filtrados sin tráfico (lobbies) no se cortan cada 45s
const KEEPALIVE_PING_MS = 30000; // mantiene viva la conexión a través de NAT/firewall
const PENDING_MATCH_TTL_MS = 30000; // si un lobby se cancela antes de llegar roster, expira solo
// Después de terminar una partida se sondea seguido 3 minutos: lo habitual es
// volver a la cola enseguida.
const HOT_IDLE_MS = 3 * 60 * 1000;
// Mientras está pausado en partida en curso se mira el ping filtrado cada 10 s.
// Durante la pre-partida (~60 s de countdown) sondeamos cada 3 s (300 B) para
// detectar rápido si alguien se salió y el juego te devolvió a la cola.
const PROBE_PAUSED_MS = 10000;
const PROBE_LOBBY_MS = 3000;
const LOBBY_FAST_PROBE_WINDOW_MS = 120000;
// Un matchId cerrado/cancelado/iniciado en AoE2 nunca vuelve a ser pre-partida.
// Companion retiene salas `matched` hasta ~150 s en algunos nodos; con 10 min
// de tombstone ninguna réplica atrasada puede resucitar una sala muerta.
const DISMISSED_MATCH_TTL_MS = 10 * 60 * 1000;

/** URL de /listen para una query dada (misma forma para todos los sockets). */
function socketUrl(query) {
  const qs = Object.entries(query)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${SOCKET_BASE}/listen?${qs}`;
}

/**
 * Combina Frame 1 (snapshot base) + Frame 2 (delta catch-up que llega +1 ms después)
 * en un único snapshot limpio y actualizado, aplicando queueingUpdated y descartando
 * items ya borrados por queueingRemoved.
 */
function reduceSnapshotFrames(frames, handler = 'queueing') {
  if (!Array.isArray(frames) || !frames.length) return [];
  if (frames.length === 1 && handler !== 'queueing') return frames[0];
  if (handler !== 'queueing') return frames.flat();
  const byId = new Map();
  for (const frame of frames) {
    if (!Array.isArray(frame)) continue;
    for (const ev of frame) {
      if (!ev || !ev.data) continue;
      const id = String(ev.data.id ?? ev.data.matchId ?? '');
      if (!id) continue;
      if (ev.type === 'queueingRemoved') {
        byId.delete(id);
      } else if (ev.type === 'queueingUpdated') {
        const prev = byId.get(id);
        byId.set(id, prev ? { ...prev, ...ev.data } : ev.data);
      } else {
        byId.set(id, ev.data);
      }
    }
  }
  return [...byId.values()].map((data) => ({ type: 'queueingAdded', data }));
}

/**
 * Pide el estado fresco de una conexión nueva y cierra. En Companion, Frame 1
 * suele traer el tick anterior (~15 s atrás) y Frame 2 (+1 ms después) trae el
 * delta vivo: coalescer ambos devuelve estado en tiempo real (0 s de atraso).
 * Devuelve el array de eventos, o null si hubo error/timeout. Nunca lanza.
 */
function readSnapshot(query, timeoutMs = FAST_TIMEOUT_MS, settleMs = SNAPSHOT_COALESCE_MS) {
  return new Promise((resolve) => {
    let ws = null;
    let settled = false;
    let settleTimer = null;
    const frames = [];
    const handler = (query && query.handler) || 'queueing';
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(settleTimer);
      settleTimer = null;
      try {
        if (ws) {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        }
      } catch {
        /* ya estaba cerrado */
      }
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish(frames.length ? reduceSnapshotFrames(frames, handler) : null);
    }, timeoutMs);
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
      frames.push(message);
      // Frame 2 (catch-up delta) llegó: cerrar al instante con estado reducido fresco.
      if (frames.length >= 2 || settleMs <= 0) {
        finish(reduceSnapshotFrames(frames, handler));
        return;
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        finish(reduceSnapshotFrames(frames, handler));
      }, settleMs);
    };
    ws.onerror = () => finish(frames.length ? reduceSnapshotFrames(frames, handler) : null);
    ws.onclose = () => finish(frames.length ? reduceSnapshotFrames(frames, handler) : null);
  });
}

/** Extrae el matchId numérico positivo de un item, evento o id (`m_123` / `123`). */
function extractMatchId(value) {
  if (value == null) return null;
  const raw =
    typeof value === 'object'
      ? value.matchId ?? value.data?.matchId ?? value.id ?? value.data?.id
      : value;
  if (raw == null) return null;
  const cleaned = String(raw).replace(/^m_/, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Timestamp numérico en ms (o NaN si no existe / es inválido). */
function parseTs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (!value) return NaN;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : NaN;
}

/** ¿Este item del feed incluye al perfil dado? */
function includesProfile(item, profileId) {
  return (item.players || []).some((p) => p && Number(p.profileId) === Number(profileId));
}

/**
 * Elige el item `status:'matched'` MÁS NUEVO del perfil ignorando matchIds
 * descartados. Evita que una sala caída vieja (primera en orden de inserción)
 * tape a una partida nueva cuando ambos conviven en el feed de Companion.
 */
function pickLatestMatch(itemsOrEvents, profileId, isDismissed = null, isEventWrapper = false) {
  let best = null;
  let bestTs = -Infinity;
  let bestId = -Infinity;
  for (const entry of itemsOrEvents || []) {
    const item = isEventWrapper ? entry && entry.data : entry;
    if (!item || item.status !== 'matched' || !includesProfile(item, profileId)) continue;
    const mid = extractMatchId(item);
    if (mid != null && isDismissed && isDismissed(mid)) continue;
    const ts = parseTs(item.matchedAt);
    const scoreTs = Number.isFinite(ts) ? ts : -1;
    const scoreId = mid != null ? mid : -1;
    if (!best || scoreTs > bestTs || (scoreTs === bestTs && scoreId > bestId)) {
      best = entry;
      bestTs = scoreTs;
      bestId = scoreId;
    }
  }
  return best;
}

/** Item `status:'matched'` más reciente del perfil en un array de eventos (o null). */
function findMyMatch(events, profileId, isDismissed = null) {
  return pickLatestMatch(events, profileId, isDismissed, true);
}

/** Item `status:'queueing'` más reciente del perfil en un array de eventos (o null). */
function findMyQueueEvent(events, profileId) {
  let best = null;
  let bestTs = -Infinity;
  for (const e of events || []) {
    if (!e || !e.data || e.data.status !== 'queueing' || !includesProfile(e.data, profileId)) continue;
    const ts = parseTs(e.data.lastSeen) || parseTs(e.data.queueingSince) || -1;
    if (!best || ts > bestTs) {
      best = e;
      bestTs = ts;
    }
  }
  return best;
}

/** ¿El perfil está en cola según este snapshot? */
function hasMyQueue(events, profileId) {
  return Boolean(findMyQueueEvent(events, profileId));
}

/**
 * Comprueba con seguridad si un item `status:'queueing'` demuestra que el
 * jugador VOLVIÓ A LA COLA después de que se armara la sala `matched` actual
 * (alguien se salió / dodge). Exige prueba por timestamp o por id nuevo de
 * cola para que una réplica vieja con la cola previa al match nunca cierre
 * una sala válida.
 */
function isPostMatchRequeue(queueItem, ctx = {}) {
  if (!queueItem || queueItem.status !== 'queueing') return false;
  const mAt = Number.isFinite(ctx.matchedServerAt) ? ctx.matchedServerAt : NaN;
  const qSince = parseTs(queueItem.queueingSince);
  const qSeen = parseTs(queueItem.lastSeen);
  const qId = queueItem.id != null ? String(queueItem.id) : '';
  const preIds = ctx.preMatchQueueIds instanceof Set ? ctx.preMatchQueueIds : null;

  // Prueba A (reloj del servidor): la cola nació o siguió latiendo DESPUÉS del matchedAt.
  if (Number.isFinite(mAt)) {
    if (Number.isFinite(qSince) && qSince >= mAt + 3000) return true;
    if (Number.isFinite(qSeen) && qSeen >= mAt + 5000) return true;
    // Si tenemos timestamps del servidor y ambos son anteriores/simultáneos al match,
    // es una réplica vieja de la cola previa al emparejamiento → NO es dodge.
    if (Number.isFinite(qSince) || Number.isFinite(qSeen)) {
      if (qId && preIds && preIds.size > 0 && !preIds.has(qId) && (!Number.isFinite(qSince) || qSince >= mAt - 1000)) {
        return true;
      }
      return false;
    }
  }

  // Prueba B (payloads sin timestamps, p. ej. tests): un id de cola distinto al previo al match.
  if (qId && preIds && preIds.size > 0) {
    return !preIds.has(qId);
  }
  // Sin timestamps ni registro previo: si la sala lleva más de 4s abierta, una cola viva es re-cola.
  const localAge = ctx.matchedAtLocal ? Date.now() - ctx.matchedAtLocal : Infinity;
  return localAge >= 4000;
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
  constructor(name, query, onEvents, log, onClose, onOpen, options = {}) {
    this.name = name;
    this.query = query;
    this.onEvents = onEvents;
    this.onClose = onClose;
    this.onOpen = onOpen;
    this.log = log;
    this.watchdogMs = Number(options.watchdogMs) || WATCHDOG_MS;
    this.coalesceInitialBurst = Boolean(options.coalesceInitialBurst);
    this.ignorePongForWatchdog = Boolean(options.ignorePongForWatchdog);
    this.ws = null;
    this.closedByUs = false;
    this.retries = 0;
    this.reconnectTimer = null;
    this.watchdog = null;
    this.pingTimer = null;
    this.initialBurstTimer = null;
    this.initialBurstFrames = [];
    this.lastMessageAt = 0;
    this.firstMessage = true;
  }

  url() {
    return socketUrl(this.query);
  }

  _detachWs(ws) {
    if (!ws) return;
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch {
      /* ya estaba cerrado */
    }
  }

  _flushInitialBurst() {
    clearTimeout(this.initialBurstTimer);
    this.initialBurstTimer = null;
    if (!this.initialBurstFrames.length) return;
    const frames = this.initialBurstFrames;
    this.initialBurstFrames = [];
    this.firstMessage = false;
    const handler = (this.query && this.query.handler) || 'queueing';
    const combined = frames.length >= 2 ? reduceSnapshotFrames(frames, handler) : frames[0];
    this.onEvents(combined, true);
  }

  connect() {
    this.clearTimers();
    if (this.ws) {
      const stale = this.ws;
      this.ws = null;
      this._detachWs(stale);
    }
    this.firstMessage = true;
    this.initialBurstFrames = [];
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
    // Watchdog de conexión inicial: si el handshake TLS/WS queda colgado en CONNECTING
    // (frecuente justo después de una actualización por inspección de Windows Defender/Firewall),
    // abortamos a los 15 s y reconectamos en vez de quedar mudos para siempre.
    this.armWatchdog(CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (this.closedByUs || this.ws !== ws) return;
      this.retries = 0;
      this.lastMessageAt = Date.now();
      this.log(`socket ${this.name}: conectado`);
      this.armWatchdog(this.watchdogMs);
      this.startKeepalive();
    };
    ws.onmessage = (event) => {
      if (this.closedByUs || this.ws !== ws) return;
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!Array.isArray(message)) {
        if (message && message.type === 'pong') {
          if (!this.ignorePongForWatchdog) {
            this.lastMessageAt = Date.now();
            this.armWatchdog(this.watchdogMs);
          }
          return;
        }
        message = [message];
      }
      this.lastMessageAt = Date.now();
      this.armWatchdog(this.watchdogMs);

      // En `queueing`, al conectar llega Frame 1 (15 s atrás) seguido +1 ms después por
      // Frame 2 (delta catch-up). Coalescer ambos evita que una reconexión a mitad de sala
      // vea momentáneamente un snapshot atrasado que borre o resucite una partida.
      if (this.coalesceInitialBurst && this.firstMessage) {
        this.initialBurstFrames.push(message);
        if (this.initialBurstFrames.length >= 2) {
          this._flushInitialBurst();
          return;
        }
        clearTimeout(this.initialBurstTimer);
        this.initialBurstTimer = setTimeout(() => {
          if (this.closedByUs || this.ws !== ws) return;
          this._flushInitialBurst();
        }, INITIAL_BURST_COALESCE_MS);
        return;
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
      if (this.closedByUs || this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      clearTimeout(this.initialBurstTimer);
      this.pingTimer = null;
      this.initialBurstTimer = null;
      this.initialBurstFrames = [];
      this.log(`socket ${this.name}: cerrado (código ${event.code})`);
      if (this.onClose) this.onClose();
      this.scheduleReconnect();
    };
  }

  startKeepalive() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      } catch {
        /* el watchdog/onclose maneja la reconexión */
      }
    }, KEEPALIVE_PING_MS);
    if (typeof this.pingTimer.unref === 'function') this.pingTimer.unref();
  }

  armWatchdog(timeoutMs = this.watchdogMs) {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (this.closedByUs) return;
      this.log(`socket ${this.name}: ${Math.round(timeoutMs / 1000)}s sin respuesta, reconectando`);
      // Desacoplar primero el socket colgado para que su onclose tardío nunca mate al nuevo socket.
      const hung = this.ws;
      this.ws = null;
      clearInterval(this.pingTimer);
      clearTimeout(this.initialBurstTimer);
      this.pingTimer = null;
      this.initialBurstTimer = null;
      this.initialBurstFrames = [];
      this._detachWs(hung);
      if (this.onClose) this.onClose();
      this.scheduleReconnect();
    }, timeoutMs);
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
    clearTimeout(this.initialBurstTimer);
    clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.initialBurstTimer = null;
    this.pingTimer = null;
  }

  close() {
    this.closedByUs = true;
    this.clearTimers();
    const cur = this.ws;
    this.ws = null;
    this.initialBurstFrames = [];
    this._detachWs(cur);
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
  constructor({
    profileId,
    onSnapshot,
    onQueue,
    onRequeued,
    isDismissedMatch,
    isGlobalHealthy,
    log = () => {},
    readSnapshotImpl = readSnapshot,
  }) {
    this.pauseTimer = null;
    this.profileId = Number(profileId);
    this.onSnapshot = onSnapshot || (() => {});
    this.onQueue = onQueue || (() => {});
    this.onRequeued = onRequeued || (() => {});
    this.isDismissedMatch = isDismissedMatch || (() => false);
    this.isGlobalHealthy = isGlobalHealthy || (() => true);
    this.log = log;
    // Inyectable para poder probar la máquina de estados sin abrir sockets.
    this.readSnapshot = readSnapshotImpl;
    this.timer = null;
    this.closed = false;
    this.paused = false;
    this.pausedMatchId = null;
    this.pausedInLobby = false;
    this.pausedAt = 0;
    this.pausedMatchedServerAt = NaN;
    this.pausedPreQueueIds = new Set();
    this.inQueue = false;
    this.queueTicks = 0;
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

  /** Hay partida apareada o en curso: no se sondea globalmente hasta que cambie. */
  pause(matchId = null, options = {}) {
    this.paused = true;
    this.pausedMatchId = extractMatchId(matchId);
    this.pausedInLobby = Boolean(options && options.inLobby);
    this.pausedAt = Date.now();
    this.pausedMatchedServerAt = parseTs(options && options.matchedAt);
    this.pausedPreQueueIds = new Set(options && options.preQueueIds ? options.preQueueIds : []);
    this.inQueue = false;
    this.clear();
    this.probeAfterPause();
  }

  /**
   * Una pausa NO puede dejar el carril muerto para siempre: si alguien se sale
   * durante la pre-partida (dodge) o el aviso de fin no llega, el ping filtrado
   * (300 B) detecta la vuelta a cola o una partida nueva y reactiva todo solo.
   * Durante los ~60 s de pre-partida sondea cada 3 s; en partida, cada 10 s.
   */
  probeAfterPause() {
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    if (this.closed) return;
    const inFastLobbyWindow =
      this.pausedInLobby && this.pausedAt > 0 && Date.now() - this.pausedAt < LOBBY_FAST_PROBE_WINDOW_MS;
    const delay = inFastLobbyWindow ? PROBE_LOBBY_MS : PROBE_PAUSED_MS;
    this.pauseTimer = setTimeout(() => this.probe(), delay);
  }

  async probe() {
    this.pauseTimer = null;
    if (this.closed) return;
    const events = await this.readSnapshot(
      { handler: 'queueing', language: 'en', profile_ids: this.profileId },
      3000,
    );
    if (this.closed) return;
    const matched = events
      ? findMyMatch(events, this.profileId, (id) => this.isDismissedMatch(id))
      : null;
    const matchedId = extractMatchId(matched);
    const isSamePausedMatch =
      matched != null &&
      this.pausedMatchId != null &&
      matchedId != null &&
      matchedId === this.pausedMatchId;
    const newMatched = isSamePausedMatch ? null : matched;

    const queueEvt = events ? findMyQueueEvent(events, this.profileId) : null;
    const hasPostDodgeQueue = Boolean(
      queueEvt &&
        (this.pausedMatchId == null ||
          !this.pausedInLobby ||
          isPostMatchRequeue(queueEvt.data, {
            matchedServerAt: this.pausedMatchedServerAt,
            matchedAtLocal: this.pausedAt,
            preMatchQueueIds: this.pausedPreQueueIds,
          })),
    );

    if (events && (newMatched || hasPostDodgeQueue)) {
      const droppedId = this.pausedMatchId;
      if (newMatched) {
        this.log('carril rápido: nueva partida apareada detectada en sonda · se reactiva solo');
        this.resume();
        const hasFullRoster = Array.isArray(newMatched.data?.players) && newMatched.data.players.length >= 2;
        if (hasFullRoster) {
          this.polls += 1;
          this.onSnapshot(events, { filtered: true });
        } else {
          const full = await this.readSnapshot({ handler: 'queueing', language: 'en' }, FAST_TIMEOUT_MS);
          if (this.closed) return;
          const chosen = full && full.length ? full : events;
          if (chosen && chosen.length) {
            this.polls += 1;
            this.onSnapshot(chosen, { filtered: chosen === events });
          }
        }
        return;
      }

      // Vuelta a cola detectada mientras estábamos pausados (dodge / caída de sala o nueva cola tras partida).
      this.log('carril rápido: hay cola otra vez · se reactiva solo');
      this.resume();
      this.inQueue = true;
      if (droppedId != null) {
        this.onRequeued(queueEvt.data, droppedId);
      } else {
        this.onQueue(true, queueEvt.data);
      }
      return;
    }
    if (this.paused) this.probeAfterPause();
  }

  resume() {
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    if (!this.paused) return;
    this.paused = false;
    this.pausedMatchId = null;
    this.pausedInLobby = false;
    this.pausedAt = 0;
    this.pausedMatchedServerAt = NaN;
    this.pausedPreQueueIds.clear();
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
    // Siempre consultamos primero el socket FILTRADO (~300 B, rápido y sin timeouts de 4.5s).
    // Solo pedimos el global (~75–100 KB) si apareció `matched` sin lista completa de jugadores.
    const filteredQuery = { handler: 'queueing', language: 'en', profile_ids: this.profileId };
    const events = await this.readSnapshot(filteredQuery, 3000);
    if (this.closed || this.paused) return;
    if (!events) return; // red lenta o servidor mudo: se reintenta en el próximo tick
    this.polls += 1;

    const isDismissed = (id) => this.isDismissedMatch(id);
    const matched = findMyMatch(events, this.profileId, isDismissed);
    const queueEvt = findMyQueueEvent(events, this.profileId);
    const inMyQueue = Boolean(queueEvt);

    if (!this.inQueue) {
      if (!inMyQueue && !matched) return;
      this.inQueue = true;
      this.queueTicks = 0;
      this.log(
        `carril rápido: ${matched ? 'partida apareada' : 'cola detectada'} · ` +
          `ping filtrado cada ${FAST_QUEUE_MS / 1000}s`,
      );
      this.onQueue(true, queueEvt ? queueEvt.data : null);
      if (!matched) return;
      if (Array.isArray(matched.data?.players) && matched.data.players.length >= 2) {
        this.onSnapshot(events, { filtered: true });
        return;
      }
      const full = await this.readSnapshot({ handler: 'queueing', language: 'en' }, FAST_TIMEOUT_MS);
      if (this.closed || this.paused) return;
      const chosen = full && full.length ? full : events;
      if (!chosen || !chosen.length) return;
      this.polls += 1;
      this.onSnapshot(chosen, { filtered: chosen === events });
      return;
    }

    // Ya estábamos en cola: si apareció `matched` válido (no descartado), despachamos al instante.
    if (matched) {
      if (Array.isArray(matched.data?.players) && matched.data.players.length >= 2) {
        this.onSnapshot(events, { filtered: true });
        return;
      }
      const full = await this.readSnapshot({ handler: 'queueing', language: 'en' }, FAST_TIMEOUT_MS);
      if (this.closed || this.paused) return;
      const chosen = full && full.length ? full : events;
      if (chosen && chosen.length) {
        this.polls += 1;
        this.onSnapshot(chosen, { filtered: chosen === events });
      }
      return;
    }

    // Si seguimos en cola en el filtrado, cada 4 ticks (~6 s) o cuando el socket global
    // está caído/reconectando, cruzamos contra el snapshot global coalescido para blindarnos
    // frente a cualquier bug de filtro server-side `profile_ids` en partidas en equipo.
    if (inMyQueue) {
      this.queueTicks += 1;
      const globalDown = !this.isGlobalHealthy();
      const shouldVerifyGlobal = (globalDown && this.queueTicks % 2 === 0) || this.queueTicks % 4 === 0;
      if (shouldVerifyGlobal) {
        const fullVerify = await this.readSnapshot({ handler: 'queueing', language: 'en' }, FAST_TIMEOUT_MS);
        if (this.closed || this.paused) return;
        if (fullVerify && fullVerify.length) {
          this.polls += 1;
          const globalMatched = findMyMatch(fullVerify, this.profileId, isDismissed);
          if (globalMatched) {
            this.onSnapshot(fullVerify, { filtered: false });
            return;
          }
        }
      }
      return;
    }

    // Si desapareció del filtrado mientras estábamos en cola, verificamos 1 vez el snapshot global
    // por si el servidor dejó de matchear profile_ids al pasar de queueing -> matched.
    const fullCheck = await this.readSnapshot({ handler: 'queueing', language: 'en' }, FAST_TIMEOUT_MS);
    if (this.closed || this.paused) return;
    if (fullCheck && fullCheck.length) {
      this.polls += 1;
      const globalMatched = findMyMatch(fullCheck, this.profileId, isDismissed);
      const globalQueue = findMyQueueEvent(fullCheck, this.profileId);
      if (globalMatched) {
        this.onSnapshot(fullCheck, { filtered: false });
        return;
      }
      if (globalQueue) return;
    }

    // Ya no estoy ni en cola ni apareado: volvemos a cadencia idle.
    this.inQueue = false;
    this.queueTicks = 0;
    this.onQueue(false, null);
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
      null,
      null,
      { watchdogMs: QUIET_WATCHDOG_MS },
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
      null,
      null,
      { watchdogMs: QUIET_WATCHDOG_MS },
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
    this.matchedMatchId = null;
    this.matchedAtLocal = 0;
    this.matchedServerAt = NaN;
    this.lastMatchedJson = '';
    this.wasSearching = false;
    this.searchMode = '';
    this.sawDelta = false;
    this.socket = null;
    // ids de MIS búsquedas (q_xxx). El servidor las borra con reason:'matched'
    // y ese evento trae el matchId en el mismo lote que el item m_<matchId>.
    this.ownQueueIds = new Set();
    // Snapshot de mis queue ids previos al match actual (distingue cola vieja de re-cola real).
    this.preMatchQueueIds = new Set();
    // Tombstones de matchIds ya cerrados/cancelados/iniciados/reemplazados (TTL 10 min).
    this.dismissedMatches = new Map();
    this.pendingMatchId = null;
    this.pendingMatchAt = 0;
    // El dashboard oficial se conecta sin profile_ids y filtra en cliente.
    // Eso evita depender de que el servidor filtre también los deltas.
    this.useFilter = process.env.AOE_QUEUE_FILTER === '1';
  }

  /** Marca un matchId como muerto para pre-partida (nunca puede resucitar por nodos atrasados). */
  dismissMatch(matchId, reason = '') {
    const mid = extractMatchId(matchId);
    if (mid == null) return false;
    const now = Date.now();
    this.dismissedMatches.set(mid, now);
    // Podar entradas viejas (> 10 min) para mantener memoria acotada.
    for (const [k, ts] of this.dismissedMatches.entries()) {
      if (now - ts > DISMISSED_MATCH_TTL_MS) this.dismissedMatches.delete(k);
    }
    // Borrar cualquier item residual de ese matchId en el mapa local.
    for (const [key, item] of this.items.entries()) {
      if (item && item.status === 'matched' && extractMatchId(item) === mid) {
        this.items.delete(key);
      }
    }
    if (this.pendingMatchId != null && Number(this.pendingMatchId) === mid) {
      this.pendingMatchId = null;
      this.pendingMatchAt = 0;
    }
    if (this.matchedMatchId === mid || extractMatchId(this.matchedId) === mid) {
      this.matchedId = null;
      this.matchedMatchId = null;
      this.matchedAtLocal = 0;
      this.matchedServerAt = NaN;
      this.lastMatchedJson = '';
    }
    if (reason) {
      this.log(`sala #${mid} descartada (${reason}) · bloqueada contra resurrección`);
    }
    return true;
  }

  /** ¿Este matchId ya fue descartado/iniciado/cancelado en los últimos 10 min? */
  isMatchDismissed(matchId) {
    const mid = extractMatchId(matchId);
    if (mid == null) return false;
    const ts = this.dismissedMatches.get(mid);
    if (ts == null) return false;
    if (Date.now() - ts > DISMISSED_MATCH_TTL_MS) {
      this.dismissedMatches.delete(mid);
      return false;
    }
    return true;
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
      null,
      {
        coalesceInitialBurst: true,
        ignorePongForWatchdog: !this.useFilter,
      },
    );
    this.socket.connect();
  }

  stop() {
    if (this.socket) this.socket.close();
    this.socket = null;
    this.items.clear();
    this.ownQueueIds.clear();
    this.preMatchQueueIds.clear();
    this.dismissedMatches.clear();
    this.pendingMatchId = null;
    this.matchedId = null;
    this.matchedMatchId = null;
    this.matchedAtLocal = 0;
    this.matchedServerAt = NaN;
    this.lastMatchedJson = '';
    this.wasSearching = false;
    this.sawDelta = false;
  }

  /**
   * Invocado cuando FastLane (en sonda de 3 s durante el lobby) detecta que el
   * jugador volvió a la cola tras una caída/dodge de la sala actual.
   */
  handleRequeueFromFastLane(queueItem, droppedMatchId = null) {
    const activeMid = this.matchedMatchId ?? extractMatchId(this.matchedId);
    const targetMid = extractMatchId(droppedMatchId) ?? activeMid;
    const goneId = this.matchedId || (targetMid != null ? `m_${targetMid}` : null);
    if (targetMid != null) {
      this.dismissMatch(targetMid, 're-cola tras caída');
    } else if (this.matchedId) {
      this.items.delete(this.matchedId);
      this.matchedId = null;
      this.matchedMatchId = null;
      this.matchedAtLocal = 0;
      this.matchedServerAt = NaN;
      this.lastMatchedJson = '';
    }
    if (queueItem && queueItem.id != null) {
      const qid = String(queueItem.id);
      this.items.set(qid, queueItem);
      this.ownQueueIds.add(qid);
    }
    if (goneId) {
      this.onGone(goneId, { reason: 'requeued', matchId: targetMid, queueItem: queueItem || null });
    }
    const queueMode = queueItem ? String(queueItem.leaderboard ?? queueItem.leaderboardId ?? '') : '';
    this.wasSearching = true;
    this.searchMode = queueMode;
    this.onSearching(true, queueItem || null);
  }

  /**
   * Registra el id de una cola detectada por FastLane sin borrar el mapa global,
   * para que si el socket persistente recibe `queueingRemoved (reason:'matched')`
   * enseguida, `ownQueueIds` ya conozca nuestra cola.
   */
  recordQueueIdFromFastLane(queueItem) {
    if (!queueItem || queueItem.id == null) return;
    const qid = String(queueItem.id);
    if (!qid) return;
    this.ownQueueIds.add(qid);
    if (!this.items.has(qid)) this.items.set(qid, queueItem);
  }

  /**
   * Mezcla eventos de FastLane (filtrados o globales) SIN limpiar el mapa global
   * ni `ownQueueIds` del socket persistente. Evita que una consulta de 1 solo item
   * o una réplica atrasada borre el estado vivo del socket principal.
   */
  mergeFastLaneEvents(events, _meta = {}) {
    if (!Array.isArray(events) || !events.length) return;
    const relevant = [];
    let incomingNewMatch = null;
    let incomingQueue = null;
    for (const ev of events) {
      if (!ev || !ev.data) continue;
      const d = ev.data;
      const isMineByPlayer = includesProfile(d, this.profileId);
      const isPendingMatch =
        this.pendingMatchId != null &&
        (Number(d.matchId) === this.pendingMatchId || String(d.id) === `m_${this.pendingMatchId}`);
      if (isMineByPlayer || isPendingMatch) {
        relevant.push(ev);
        if (d.status === 'matched' && !this.isMatchDismissed(d)) {
          incomingNewMatch = d;
        } else if (d.status === 'queueing' && isMineByPlayer) {
          incomingQueue = d;
        }
      }
    }
    if (!relevant.length) return;
    // Si FastLane trae una sala `matched` fresca (ya coalescida Frame 1+2) SIN cola viva
    // para nosotros, movemos nuestras colas previas a `preMatchQueueIds` y las quitamos de
    // `this.items` para que una cola previa aún no purgada por el socket persistente no
    // dispare un falso re-queue sobre la partida recién llegada.
    if (incomingNewMatch && !incomingQueue && this.ownQueueIds.size > 0) {
      if (String(incomingNewMatch.id) !== this.matchedId) {
        this.preMatchQueueIds = new Set([...this.preMatchQueueIds, ...this.ownQueueIds]);
      }
      for (const qid of this.ownQueueIds) {
        const existing = this.items.get(qid);
        if (existing && existing.status === 'queueing') {
          this.items.delete(qid);
        }
      }
    }
    this.handleEvents(relevant, false, { quiet: true, fromFastLane: true });
  }

  handleEvents(events, isSnapshot = false, options = {}) {
    const prevMatchedItem = this.matchedId ? this.items.get(this.matchedId) || null : null;
    const prevMatchedId = this.matchedId;
    const prevMatchNumericId = this.matchedMatchId ?? extractMatchId(prevMatchedItem || prevMatchedId);
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
        case 'queueingUpdated': {
          const prev = event.type === 'queueingUpdated' ? this.items.get(id) : null;
          const merged = prev ? { ...prev, ...event.data } : event.data;
          // Ignoramos cualquier sala `matched` cuyo matchId ya fue descartado/iniciado.
          if (merged.status === 'matched' && this.isMatchDismissed(merged)) {
            this.items.delete(id);
            break;
          }
          this.items.set(id, merged);
          // En el snapshot (y en cada alta) marcamos cuáles colas son mías.
          if (merged.status === 'queueing' && includesMe(merged)) {
            this.ownQueueIds.add(id);
          }
          break;
        }
        case 'queueingRemoved': {
          if (id === this.matchedId) removedMatched = true;
          // Segunda vía de detección: el servidor cierra MI cola con
          // reason:'matched' + matchId en el mismo lote que el item m_<id>.
          // Avisamos YA, sin esperar a que el roster termine de armarse, y
          // guardamos el matchId para encontrarlo aunque el item venga con
          // otro id o sin mi profileId en players (pasa en algunas colas).
          if (
            this.ownQueueIds.has(id) &&
            event.data.reason === 'matched' &&
            event.data.matchId != null &&
            !this.isMatchDismissed(event.data.matchId)
          ) {
            this.preMatchQueueIds = new Set(this.ownQueueIds);
            this.pendingMatchId = Number(event.data.matchId);
            this.pendingMatchAt = Date.now();
            this.log(`cola apareada: matchId ${this.pendingMatchId} · aviso instantáneo`);
            this.onFound(this.pendingMatchId);
          }
          this.ownQueueIds.delete(id);
          // Si el servidor cierra una búsqueda/sala con matchId y cualquier motivo
          // distinto de 'matched' (started, cancelled, aborted, dropped, expired...),
          // purgamos la sala actual para que no quede pegada en el mapa.
          if (event.data.reason && event.data.reason !== 'matched' && event.data.matchId != null) {
            const evMid = extractMatchId(event.data.matchId);
            const current = this.matchedId ? this.items.get(this.matchedId) : null;
            const curMid = extractMatchId(current || this.matchedId);
            if (evMid != null && curMid != null && evMid === curMid) {
              removedMatched = true;
              this.items.delete(this.matchedId);
            }
          }
          this.items.delete(id);
          break;
        }
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
    const isDismissed = (mid) => this.isMatchDismissed(mid);
    let mine = pickLatestMatch(all, this.profileId, isDismissed, false);

    // Si el roster no incluye explícitamente mi profileId (o vino con otro
    // id), el matchId del aviso de mi propia cola lo identifica igual. Así la
    // partida encontrada no se pierde por un detalle de forma del payload.
    if (!mine && this.pendingMatchId != null && !this.isMatchDismissed(this.pendingMatchId)) {
      mine = all.find(
        (item) =>
          (Number(item.matchId) === this.pendingMatchId ||
            String(item.id) === `m_${this.pendingMatchId}`) &&
          (item.players || []).length > 0,
      );
      if (mine) this.log(`roster ubicado por matchId ${this.pendingMatchId} (${mine.players.length} jugadores)`);
    }

    // SIEMPRE inspeccionar si el perfil tiene una cola `queueing` activa (incluso si
    // todavía hay un `matched` viejo en `items`): cuando alguien dodgea, Companion
    // mantiene el `matched` caído ~135 s a la vez que publica la nueva cola.
    let activeQueueItem = null;
    let bestQueueTs = -Infinity;
    for (const item of all) {
      if (!item || item.status !== 'queueing' || !includesMe(item)) continue;
      const qts = parseTs(item.lastSeen) || parseTs(item.queueingSince) || -1;
      if (!activeQueueItem || qts > bestQueueTs) {
        activeQueueItem = item;
        bestQueueTs = qts;
      }
    }

    // ¿Volviste a cola DESPUÉS de la sala actual (dodge confirmado)?
    const candidateMatch = mine || (this.matchedId ? prevMatchedItem : null);
    const candidateMid = extractMatchId(candidateMatch || this.matchedId);
    if (activeQueueItem && candidateMatch) {
      const isBrandNewMatch = Boolean(candidateMatch.id && String(candidateMatch.id) !== this.matchedId);
      const matchServerAt = parseTs(candidateMatch.matchedAt);
      const effectiveServerAt = Number.isFinite(matchServerAt) ? matchServerAt : this.matchedServerAt;
      const effectiveMatchedAtLocal = isBrandNewMatch ? Date.now() : this.matchedAtLocal;
      const effectivePreIds = isBrandNewMatch
        ? new Set([...this.preMatchQueueIds, ...this.ownQueueIds])
        : this.preMatchQueueIds;
      if (
        isPostMatchRequeue(activeQueueItem, {
          matchedServerAt: effectiveServerAt,
          matchedAtLocal: effectiveMatchedAtLocal,
          preMatchQueueIds: effectivePreIds,
        })
      ) {
        const goneId = this.matchedId || String(candidateMatch.id ?? (candidateMid ? `m_${candidateMid}` : ''));
        if (candidateMid != null) this.dismissMatch(candidateMid, 're-cola tras caída');
        mine = null;
        this.matchedId = null;
        this.matchedMatchId = null;
        this.matchedAtLocal = 0;
        this.matchedServerAt = NaN;
        this.lastMatchedJson = '';
        this.pendingMatchId = null;
        this.pendingMatchAt = 0;
        if (goneId) {
          this.onGone(goneId, { reason: 'requeued', matchId: candidateMid, queueItem: activeQueueItem });
        }
        const qMode = String(activeQueueItem.leaderboard ?? activeQueueItem.leaderboardId ?? '');
        if (!this.wasSearching || (qMode && qMode !== this.searchMode)) {
          this.wasSearching = true;
          this.searchMode = qMode;
          this.onSearching(true, activeQueueItem);
        }
        return;
      }
    }

    // Diagnóstico: confirma que el socket ve la cola, no solo que conectó.
    const queueItem = !mine && activeQueueItem;
    const searching = Boolean(queueItem);
    const queueMode = queueItem ? String(queueItem.leaderboard ?? queueItem.leaderboardId ?? '') : '';
    if (searching !== this.wasSearching || (searching && queueMode && queueMode !== this.searchMode)) {
      this.wasSearching = searching;
      this.searchMode = queueMode;
      this.onSearching(searching, queueItem || null);
    }

    if (mine) {
      const nextId = String(mine.id);
      const nextMid = extractMatchId(mine);
      // Si ya teníamos otra sala anterior distinta, la vieja queda superada y descartada.
      if (prevMatchNumericId != null && nextMid != null && prevMatchNumericId !== nextMid) {
        this.dismissMatch(prevMatchNumericId, 'reemplazada por sala nueva');
      }
      if (nextId !== this.matchedId) {
        this.matchedAtLocal = Date.now();
        if (this.ownQueueIds.size > 0) {
          this.preMatchQueueIds = new Set(this.ownQueueIds);
        }
      }
      const json = JSON.stringify(mine);
      this.matchedId = nextId;
      this.matchedMatchId = nextMid;
      const serverTs = parseTs(mine.matchedAt);
      if (Number.isFinite(serverTs)) this.matchedServerAt = serverTs;
      this.pendingMatchId = null;
      this.pendingMatchAt = 0;
      if (json !== this.lastMatchedJson) {
        this.lastMatchedJson = json;
        this.onMatched(mine);
      }
      return;
    }

    // Si un snapshot del carril rápido (quiet) llega justo 0–15 s después de
    // que el socket principal ya vio la partida apareada, no borramos la sala
    // por una pequeña diferencia de replicación entre nodos — SALVO que haya
    // evidencia de remoción explícita, re-cola o descarte.
    const recentMatchGuard = Boolean(
      options.quiet &&
        !removedMatched &&
        !activeQueueItem &&
        !this.isMatchDismissed(prevMatchNumericId) &&
        this.matchedAtLocal &&
        Date.now() - this.matchedAtLocal < 15000,
    );
    if (this.matchedId && recentMatchGuard && prevMatchedItem && !this.items.has(this.matchedId)) {
      this.items.set(this.matchedId, prevMatchedItem);
    }
    // Solo se da por terminada con evidencia: snapshot sin la sala, o un
    // queueingRemoved explícito. Un mensaje de otros jugadores no la borra.
    if (this.matchedId && !recentMatchGuard && (isSnapshot || removedMatched)) {
      const gone = this.matchedId;
      const goneMid = prevMatchNumericId;
      // Solo sepultamos definitivamente si hubo remoción explícita (`queueingRemoved`)
      // o si la sala ya llevaba >= 25 s abierta (evita bloquear una sala recién nacida
      // ante un reconnect momentáneo contra un nodo atrasado).
      const matchAgeMs = this.matchedAtLocal ? Date.now() - this.matchedAtLocal : Infinity;
      if (goneMid != null && (removedMatched || matchAgeMs >= 25000)) {
        this.dismissMatch(goneMid, 'sala cerrada');
      }
      this.matchedId = null;
      this.matchedMatchId = null;
      this.matchedAtLocal = 0;
      this.matchedServerAt = NaN;
      this.lastMatchedJson = '';
      this.onGone(gone, { reason: 'gone', matchId: goneMid });
    }
  }

  /** ¿El WebSocket de matchmaking está conectado y recibiendo tráfico reciente? */
  get isHealthy() {
    return Boolean(
      this.socket &&
        this.socket.ws &&
        this.socket.ws.readyState === 1 &&
        this.socket.lastMessageAt > 0 &&
        Date.now() - this.socket.lastMessageAt < WATCHDOG_MS,
    );
  }

  /** Partida apareada y vigente (o null). */
  get matched() {
    return this.matchedId ? this.items.get(this.matchedId) || null : null;
  }

  /** Re-emite la partida apareada activa (p. ej. al cancelar una vista previa). */
  reemitIfMatched() {
    const current = this.matched;
    if (!current) return false;
    this.lastMatchedJson = JSON.stringify(current);
    this.onMatched(current);
    return true;
  }

  /** Limpia y descarta una sala apareada obsoleta (p. ej. si el REST ya confirmó que la partida arrancó o terminó). */
  clearMatch(matchId = null) {
    const mid = extractMatchId(matchId);
    if (mid != null) {
      // Siempre marcamos el matchId como descartado aunque ya no esté en matchedId,
      // para impedir que un nodo atrasado de Companion lo resucite segundos después.
      this.dismissMatch(mid);
    }
    if (matchId != null && this.matchedId) {
      const current = this.items.get(this.matchedId);
      const same = current && Number(current.matchId) === Number(matchId);
      if (!same && this.matchedId !== `m_${matchId}` && this.matchedId !== String(matchId)) return false;
    }
    if (this.matchedId) this.items.delete(this.matchedId);
    this.matchedId = null;
    this.matchedMatchId = null;
    this.matchedAtLocal = 0;
    this.matchedServerAt = NaN;
    this.lastMatchedJson = '';
    if (matchId == null || Number(this.pendingMatchId) === Number(matchId)) {
      this.pendingMatchId = null;
      this.pendingMatchAt = 0;
    }
    return true;
  }

  /**
   * Ya avisamos "encontré rival" (reason:'matched') pero el roster todavía no
   * llegó. Expira a los 30 s si el lobby fue cancelado sin publicar roster.
   */
  get awaitingRoster() {
    if (this.pendingMatchId == null) return false;
    if (this.pendingMatchAt && Date.now() - this.pendingMatchAt > PENDING_MATCH_TTL_MS) {
      this.pendingMatchId = null;
      this.pendingMatchAt = 0;
      return false;
    }
    return true;
  }
}

module.exports = {
  Socket,
  LobbyWatcher,
  QueueWatcher,
  FastLane,
  readSnapshot,
  reduceSnapshotFrames,
  findMyMatch,
  findMyQueueEvent,
  pickLatestMatch,
  extractMatchId,
  isPostMatchRequeue,
  hasMyQueue,
  FAST_IDLE_MS,
  FAST_QUEUE_MS,
  PROBE_LOBBY_MS,
  PROBE_PAUSED_MS,
  DISMISSED_MATCH_TTL_MS,
};
