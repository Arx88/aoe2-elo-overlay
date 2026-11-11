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
 * Ambos: wss://socket.aoe2companion.com/listen?handler=…&language=es&profile_ids=<id>
 * El PRIMER mensaje de cada conexión es el estado completo (snapshot), lo que
 * permite reconectar a mitad del countdown sin perder la partida. Los demás
 * son arrays de deltas { type, data }, u objetos { type: 'pong' }.
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
    const qs = Object.entries(this.query)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    return `${SOCKET_BASE}/listen?${qs}`;
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
      { handler: 'lobbies', language: 'es', profile_ids: this.profileId },
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
      { handler: 'lobbies', language: 'es', match_ids: matchId },
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
  constructor({ profileId, onMatched, onGone, onSearching, log = () => {} }) {
    this.profileId = Number(profileId);
    this.onMatched = onMatched;
    this.onGone = onGone;
    this.onSearching = onSearching || (() => {});
    this.log = log;
    this.items = new Map(); // id -> item (search o matched)
    this.matchedId = null;
    this.lastMatchedJson = '';
    this.wasSearching = false;
    this.socket = null;
  }

  start() {
    this.socket = new Socket(
      'queueing',
      { handler: 'queueing', language: 'es', profile_ids: this.profileId },
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
    this.matchedId = null;
    this.lastMatchedJson = '';
    this.wasSearching = false;
  }

  handleEvents(events, isSnapshot = false) {
    // Cada conexión nueva trae el estado completo: se recalcula desde cero.
    if (isSnapshot) this.items.clear();

    let removedMatched = false;
    for (const event of events) {
      if (!event || !event.data || event.data.id == null) continue;
      const id = String(event.data.id);
      switch (event.type) {
        case 'queueingAdded':
        case 'queueingUpdated':
          this.items.set(id, event.data);
          break;
        case 'queueingRemoved':
          if (id === this.matchedId) removedMatched = true;
          this.items.delete(id);
          break;
        default:
          break;
      }
    }

    const includesMe = (item) =>
      (item.players || []).some((p) => p && Number(p.profileId) === this.profileId);

    const mine = [...this.items.values()].find(
      (item) => item.status === 'matched' && includesMe(item),
    );

    // Diagnóstico: confirma que el socket ve la cola, no solo que conectó.
    const searching = !mine && [...this.items.values()].some(
      (item) => item.status === 'queueing' && includesMe(item),
    );
    if (searching !== this.wasSearching) {
      this.wasSearching = searching;
      this.onSearching(searching);
    }

    if (mine) {
      const json = JSON.stringify(mine);
      this.matchedId = String(mine.id);
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
}

module.exports = { LobbyWatcher, QueueWatcher };
