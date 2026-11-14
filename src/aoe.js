'use strict';

const { RequestScheduler } = require('./request-scheduler');
const matchHistoryScheduler = new RequestScheduler();

/**
 * Capa de datos del overlay.
 *
 * Fuentes (ninguna requiere API key):
 *  - AoE2 Companion  https://data.aoe2companion.com/api/matches  -> partida en curso
 *  - World's Edge    https://aoe-api.worldsedgelink.com/community/leaderboard/getPersonalStat
 *                    -> rating actual + highestrating (pico) por ladder
 *
 * REGLA DE PRODUCTO: el ELO que se muestra es SIEMPRE el de RM 1v1 (ladder #3),
 * juegues lo que juegues. En TG, EW, Deathmatch o sala personalizada el panel
 * sigue mostrando el 1v1 RM de cada jugador, su pico histórico y su rank 1v1.
 * El ELO del modo de la partida (que viene en el payload del match o en el
 * evento `matched`) se descarta: sirve para saber el modo, no para medir nivel.
 *
 * `resolveLadder` sigue existiendo solo para ETIQUETAR el modo de la partida
 * (cabecera y logs); ya no decide qué rating se consulta ni se pinta.
 */

const WE_BASE = process.env.AOE_WE_BASE || 'https://aoe-api.worldsedgelink.com';
const COMPANION_BASE = process.env.AOE_COMPANION_BASE || 'https://data.aoe2companion.com';
const USER_AGENT = 'aoe2-elo-overlay/0.2 (overlay de escritorio local)';

const ONGOING_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** Ladders de rating de AoE2 DE (leaderboard_id del backend de World's Edge). */
const LADDERS = {
  rm_1v1: { id: 3, label: 'RM 1v1' },
  rm_team: { id: 4, label: 'RM team' },
  ew_1v1: { id: 13, label: 'EW 1v1' },
  ew_team: { id: 14, label: 'EW team' },
  dm_1v1: { id: 1, label: 'DM 1v1' },
  dm_team: { id: 2, label: 'DM team' },
};

/**
 * Única ladder que se muestra en el panel. Aunque la partida sea TG/EW/custom,
 * el número al lado de cada nombre es el ELO de Random Map 1v1 del jugador.
 */
const ELO_LADDER = LADDERS.rm_1v1; // { id: 3, label: 'RM 1v1' }
const ELO_CACHE_PREFIX = 'elo1v1';

/** Algunos payloads (queueing, dumps) traen el id numérico en vez del enum. */
const NUMERIC_LADDERS = {
  1: 'dm_1v1',
  2: 'dm_team',
  3: 'rm_1v1',
  4: 'rm_team',
  13: 'ew_1v1',
  14: 'ew_team',
};

/**
 * Etiqueta del MODO de la partida (solo cabecera/logs). No elige el ELO:
 * el panel siempre usa ELO_LADDER. `source` se conserva por compatibilidad
 * con el estado que consume el renderer y los demos.
 */
function resolveLadder(match) {
  const raw = String((match && match.leaderboardId) ?? '');
  const key = NUMERIC_LADDERS[raw] || raw;
  if (LADDERS[key]) return { ...LADDERS[key], source: 'ranked' };
  if (key === 'unranked') return { id: 0, label: 'Unranked', source: 'match' };
  if (key.startsWith('qp_')) {
    return { id: null, label: match.leaderboardName || 'Quickplay', source: 'match' };
  }
  return {
    id: null,
    label: (match && match.leaderboardName) || 'Sin ranking',
    source: 'match',
  };
}

async function getJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = new Error(`HTTP ${res.status} en ${new URL(url).pathname}`);
      error.status = res.status;
      const retryAfter = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(delay) && delay >= 0) error.retryAfterMs = delay;
      }
      throw error;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function numOrNull(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Partidas recientes de un jugador, ya normalizadas. `ladder` (enum de
 * Companion, ej. `rm_1v1`) filtra el historial al MISMO modo; sin ladder se
 * mantiene el comportamiento anterior (todas las ladders).
 */
async function fetchMatches(profileId, perPage = 20, page = 1, ladder = null, options = {}) {
  const url =
    `${COMPANION_BASE}/api/matches?profile_ids=${encodeURIComponent(profileId)}` +
    `&use_enums=true&page=${encodeURIComponent(page)}&per_page=${encodeURIComponent(perPage)}` +
    (ladder ? `&leaderboard_ids=${encodeURIComponent(ladder)}` : '');
  const priority = Number(page) === 1 ? 2 : options.priority === 'own' ? 1 : 0;
  const data = await matchHistoryScheduler.run(() => getJson(url), priority);
  const list = Array.isArray(data) ? data : (data && data.matches) || [];
  return list.map(normalizeMatch);
}

async function fetchLatestMatch(profileId) {
  const [match] = await fetchMatches(profileId, 1);
  return match || null;
}

/**
 * Una partida puntual por `matchId` (Companion `GET /api/matches/:id`).
 * Solo la usa el modo ejemplo para capturar una partida concreta del perfil
 * (`--example-match=<id>`) en vez de la última.
 */
async function fetchMatchById(matchId) {
  const id = Number(matchId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Ese match ID no es válido.');
  const data = await getJson(`${COMPANION_BASE}/api/matches/${id}`);
  const raw = data && data.match ? data.match : data;
  if (!raw || !raw.matchId) throw new Error(`AoE2 Companion no tiene la partida #${id}.`);
  return normalizeMatch(raw);
}

function normalizeMatch(raw) {
  const teams = Array.isArray(raw.teams) ? raw.teams : [];
  const players = [];

  teams.forEach((team, index) => {
    const teamId = team && team.teamId != null ? team.teamId : index + 1;
    for (const p of (team && team.players) || []) {
      // Los observadores (si vinieran) no son parte del roster.
      if (p.status && p.status !== 'player') continue;
      players.push({
        profileId: Number(p.profileId),
        name: p.name,
        civ: p.civName || p.civ || null,
        colorHex: p.colorHex || null,
        color: p.color != null ? p.color : null,
        team: teamId,
        slot: p.slot,
        matchRating: numOrNull(p.rating),
        matchRatingDiff: numOrNull(p.ratingDiff),
        won: p.won,
      });
    }
  });

  // Agrupado por equipo y slot: en TG los aliados quedan juntos y los
  // rivales después, que es como se lee la pantalla.
  players.sort((a, b) => {
    const teamDiff = Number(a.team) - Number(b.team);
    if (teamDiff !== 0) return teamDiff;
    return Number(a.slot ?? 0) - Number(b.slot ?? 0);
  });

  const startedAt = raw.started ? Date.parse(raw.started) : null;
  const finishedAt = raw.finished ? Date.parse(raw.finished) : null;
  const age = startedAt ? Date.now() - startedAt : Number.POSITIVE_INFINITY;
  const ladderId = raw.leaderboardId != null ? raw.leaderboardId : raw.leaderboard;

  return {
    matchId: raw.matchId,
    mapName: raw.mapName || raw.map || '—',
    leaderboardId: ladderId != null ? ladderId : null,
    leaderboardName: raw.leaderboardName || String(ladderId || 'Partida'),
    startedAt,
    finishedAt,
    ongoing: finishedAt == null && age > -5 * 60 * 1000 && age < ONGOING_MAX_AGE_MS,
    players,
  };
}

/**
 * Stats de un ladder concreto para varios jugadores en una sola request.
 * Devuelve Map<profileId, { rating, peak, rank, wins, losses }>.
 * Si un jugador no jugó ese ladder, no aparece en el Map.
 */
async function fetchPersonalStats(profileIds, ladderId = ELO_LADDER.id, timeoutMs = 7000) {
  const ids = [...new Set((profileIds || []).map(Number).filter(Number.isFinite))];
  if (!ids.length || ladderId == null) return new Map();

  const url =
    `${WE_BASE}/community/leaderboard/getPersonalStat?title=age2` +
    `&profile_ids=${encodeURIComponent(JSON.stringify(ids))}`;
  // Timeout corto a propósito: el panel ya está en pantalla con `…` y esta
  // request es lo único que falta. Antes eran 12 s de espera muerta.
  const data = await getJson(url, timeoutMs);

  if (data && data.result && Number(data.result.code) !== 0) {
    throw new Error(`World's Edge: ${data.result.message || 'error'}`);
  }

  // statGroups[] agrupa miembros; cada fila de leaderboardStats apunta a un statgroup_id.
  const owner = new Map();
  for (const group of data.statGroups || []) {
    const member = (group.members || [])[0];
    if (member && member.profile_id != null) owner.set(group.id, Number(member.profile_id));
  }

  const out = new Map();
  for (const row of data.leaderboardStats || []) {
    if (Number(row.leaderboard_id) !== Number(ladderId)) continue;
    const profileId = owner.get(row.statgroup_id);
    if (profileId == null) continue;

    const peak = numOrNull(row.highestrating);
    out.set(profileId, {
      rating: numOrNull(row.rating),
      peak: peak && peak > 0 ? peak : null,
      rank: row.rank > 0 ? row.rank : null,
      wins: numOrNull(row.wins),
      losses: numOrNull(row.losses),
    });
  }
  return out;
}

/** Busca perfiles por nombre (sugerencias de la ventana de configuración). */
async function searchProfiles(query, limit = 12) {
  const term = String(query || '').trim();
  if (term.length < 2) return [];

  const url =
    `${COMPANION_BASE}/api/profiles?search=${encodeURIComponent(term)}` +
    `&per_page=${encodeURIComponent(limit)}`;
  const data = await getJson(url);

  return (data.profiles || []).map((profile) => ({
    profileId: Number(profile.profileId),
    name: profile.name,
    clan: profile.clan || '',
    country: profile.country || '',
    games: numOrNull(profile.games),
    platform: profile.platform || '',
  }));
}

/** Nombre/alias de un profile_id, para mostrarlo en la configuración. */
async function fetchProfileIdentity(profileId) {
  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const url =
    `${WE_BASE}/community/leaderboard/getPersonalStat?title=age2` +
    `&profile_ids=${encodeURIComponent(JSON.stringify([id]))}`;
  const data = await getJson(url);

  // Igual que al buscar por SteamID: profiles[] puede venir vacío y el dato
  // estar en statGroups[0].members[0].
  const group = (data.statGroups || [])[0];
  const member = (data.profiles || [])[0] || (group && (group.members || [])[0]);
  if (!member || member.profile_id == null) return null;

  return {
    profileId: Number(member.profile_id),
    alias: member.alias || null,
    country: member.country || null,
  };
}

/**
 * Combina el roster con las stats de RM 1v1.
 *
 * IMPORTANTE: `matchRating` / `matchRank` (el ELO del modo de la partida, p. ej.
 * el ELO de equipo en TG o el de unranked en una custom) se conservan en la fila
 * solo como dato auxiliar, pero NUNCA se usan como fallback del ELO mostrado.
 * Si un jugador no tiene ladder 1v1, se muestra `—`: inventarle el ELO del otro
 * modo sería justo lo que el usuario no quiere.
 */
function composeRows(players, stats, youId) {
  return (players || []).map((player) => {
    const stat = stats.get(player.profileId) || null;
    // `hasStats` significa "tengo una fila real de RM 1v1", no "hay un objeto
    // en el Map". Un placeholder {rating:null,...} (jugador sin ladder 1v1 o
    // backend caído) cuenta como SIN datos para que el renderer pinte `—`.
    const hasStats = Boolean(stat) && (stat.rating != null || stat.peak != null || stat.rank != null);
    return {
      ...player,
      isYou: Number(player.profileId) === Number(youId),
      rating: stat ? stat.rating : null,
      peak: stat ? stat.peak : null,
      rank: stat ? stat.rank : null,
      hasStats,
    };
  });
}

/** Stats de RM 1v1 ya cacheadas + ids que faltan. Cache compartida por todos los modos. */
function splitCachedElo(ids, cache, cacheTtlMs) {
  const now = Date.now();
  const stats = new Map();
  const missing = [];
  for (const id of ids) {
    const cached = cache.get(`${ELO_CACHE_PREFIX}:${id}`);
    if (cached && now - cached.ts <= cacheTtlMs) stats.set(id, cached);
    else missing.push(id);
  }
  return { stats, missing, now };
}

/**
 * Trae RM 1v1 de los ids que faltan. Si el backend falla NO se cachea el
 * vacío (para reintentar en el próximo poll) y el panel se asienta en `—`
 * en vez de quedarse colgado en `…`.
 */
async function fetchEloStats(missing, fetchStatsImpl = fetchPersonalStats) {
  try {
    return { ok: true, fresh: await fetchStatsImpl(missing, ELO_LADDER.id) };
  } catch (err) {
    return { ok: false, fresh: new Map(), error: err.message };
  }
}

/**
 * Aplica lo que llegó al Map y, si la request fue buena, lo deja en cache.
 *
 * Un fallo tiene UN reintento inmediato: la primera conexión TLS al backend a
 * veces se corta y, sin reintento, el panel se quedaba con `…` hasta que el
 * próximo poll volvía a pedir el ELO (en la pre-partida eso era el inicio de
 * la partida). Devuelve el error final (o null) para que main pueda reintentar.
 */
async function completeEloStats(stats, missing, cache, now, fetchStatsImpl) {
  let { ok, fresh, error } = await fetchEloStats(missing, fetchStatsImpl);
  if (!ok) {
    ({ ok, fresh, error } = await fetchEloStats(missing, fetchStatsImpl));
  }
  for (const id of missing) {
    const row = fresh.get(id) || { rating: null, peak: null, rank: null };
    // Se cachea también el "no tiene ladder 1v1" para no volver a preguntar,
    // pero ese placeholder NO entra al Map de filas: composeRows debe verlo
    // como ausencia de datos y el panel mostrar `—`.
    if (ok) cache.set(`${ELO_CACHE_PREFIX}:${id}`, { ...row, ts: now });
    if (fresh.has(id)) stats.set(id, row);
  }
  return error || null;
}

/**
 * Estado que consume el renderer.
 * status: 'ongoing' | 'idle' | 'no-profile'
 *
 * Pintado en dos fases: onPartial dibuja el roster apenas hay partida (con
 * `…` en los ELO mientras llegan) y enseguida se completan ELO, pico y rank
 * de RM 1v1 con getPersonalStat. El ELO del modo NO se usa ni de provisional.
 */
async function buildSnapshot({ profileId, cache, cacheTtlMs = 15 * 60 * 1000, onPartial }) {
  if (!profileId) return { status: 'no-profile' };

  const match = await fetchLatestMatch(profileId);
  if (!match || !match.ongoing) {
    return {
      status: 'idle',
      lastMatch: match
        ? { mapName: match.mapName, leaderboardName: match.leaderboardName }
        : null,
    };
  }

  const ladder = resolveLadder(match); // solo la etiqueta del modo
  const ids = match.players.map((p) => p.profileId);
  const { stats, missing, now } = splitCachedElo(ids, cache, cacheTtlMs);

  const snapshot = (pending) => ({
    status: 'ongoing',
    match: {
      matchId: match.matchId,
      mapName: match.mapName,
      leaderboardId: match.leaderboardId,
      leaderboardName: match.leaderboardName,
      startedAt: match.startedAt,
    },
    ladder: { id: ladder.id, label: ladder.label, source: ladder.source },
    eloLadder: { id: ELO_LADDER.id, label: ELO_LADDER.label },
    players: composeRows(match.players, stats, profileId),
    pending,
  });

  if (!missing.length) return snapshot(false);

  // Primera pintura: nombres/equipos/escudos ya en pantalla, ELO en `…`.
  if (onPartial) onPartial(snapshot(true));

  const statsError = await completeEloStats(stats, missing, cache, now);
  return { ...snapshot(false), statsError };
}

/**
 * MODO EJEMPLO: convierte la ÚLTIMA PARTIDA REAL de un perfil en un estado
 * `ongoing` para poder revisar todas las tarjetas del overlay sin esperar a
 * que el juego encuentre partida.
 *
 * `buildSnapshot()` solo sirve para partidas EN CURSO; acá queremos también
 * las ya terminadas (es justo lo que permite probar en cualquier momento).
 * TODO lo que se pinta es real y viene de las mismas APIs:
 *   - roster, nombres, civilizaciones, mapa, ladder, resultado → /api/matches
 *   - ELO, pico y rank → getPersonalStat de RM 1v1 (ladder #3), nunca el del modo
 *
 * Lo ÚNICO simulado es `match.startedAt`: se ancla a `now - clockOffsetMs`
 * para que el reloj de la intro se pueda inspeccionar en 0:03 (ayuda visible)
 * o 0:21 (ya oculto). El timestamp original se conserva en
 * `example.realStartedAt` y se muestra en el panel: no se disfraza de ahora.
 *
 * `isYou` apunta al perfil BUSCADO (no a la cuenta local), así que "VOS" y
 * los rivales del informe salen bien aunque el ejemplo sea de otro jugador.
 */
async function buildExampleSnapshot({
  profileId,
  cache,
  cacheTtlMs = 15 * 60 * 1000,
  onPartial,
  now = Date.now(),
  clockOffsetMs = 3000,
  fetchLatestImpl = fetchLatestMatch,
  fetchStatsImpl,
  match: suppliedMatch = null,
}) {
  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Ese profile ID no es válido.');

  // `match` permite cambiar el reloj del ejemplo SIN volver a pegarle a la
  // API: la partida real ya está en memoria y el ELO sale de la cache.
  const match = suppliedMatch || (await fetchLatestImpl(id));
  if (!match || !Array.isArray(match.players) || !match.players.length) {
    throw new Error('Ese perfil no tiene partidas públicas en AoE2 Companion.');
  }

  const ladder = resolveLadder(match); // solo etiqueta del modo
  const ids = match.players.map((p) => p.profileId);
  const { stats, missing, now: cacheNow } = splitCachedElo(ids, cache, cacheTtlMs);

  const snapshot = (pending) => ({
    status: 'ongoing',
    example: {
      profileId: id,
      matchId: match.matchId ?? null,
      realStartedAt: Number.isFinite(match.startedAt) ? match.startedAt : null,
      finishedAt: Number.isFinite(match.finishedAt) ? match.finishedAt : null,
      alreadyFinished: Boolean(match.finishedAt),
      clockOffsetMs,
      source: 'AoE2 Companion · última partida real del perfil',
    },
    match: {
      matchId: match.matchId,
      mapName: match.mapName,
      leaderboardId: match.leaderboardId,
      leaderboardName: match.leaderboardName,
      // Reloj de PRUEBA. El de verdad queda en example.realStartedAt.
      startedAt: now - clockOffsetMs,
    },
    ladder: { id: ladder.id, label: ladder.label, source: ladder.source },
    eloLadder: { id: ELO_LADDER.id, label: ELO_LADDER.label },
    players: composeRows(match.players, stats, id),
    pending,
    checkedAt: now,
  });

  if (!missing.length) return snapshot(false);
  if (onPartial) onPartial(snapshot(true));
  const statsError = await completeEloStats(stats, missing, cache, cacheNow, fetchStatsImpl);
  return { ...snapshot(false), statsError };
}

/**
 * Estado del overlay a partir de un lobby del websocket (sala encontrada,
 * partida todavía no empezada). El shape del jugador del socket es plano
 * (IMatchesMatchPlayer2): profileId, name, rating, civName, color, colorHex,
 * slot y team.
 *
 * El `rating` del slot es el ELO DEL MODO de la sala y se IGNORA: el número que
 * se muestra sale de getPersonalStat para la ladder RM 1v1. onPartial dibuja el
 * roster al instante con `…` y enseguida llegan ELO + pico + rank de 1v1.
 */
async function buildSnapshotFromLobby(lobby, { profileId, cache, cacheTtlMs = 15 * 60 * 1000, onPartial }) {
  const rawPlayers = (lobby.players || []).filter(Boolean);

  // Solo en 1v1 se puede identificar al otro jugador sin conocer los equipos.
  // En TG el orden de slots no demuestra quién es aliado o rival.
  const inferSoloTeams = rawPlayers.length === 2 && rawPlayers.every((p) => p.team == null || p.team === '') &&
    rawPlayers.some((p) => Number(p.profileId) === Number(profileId));
  const sorted = [...rawPlayers].sort((a, b) => Number(a.slot ?? 0) - Number(b.slot ?? 0));

  const players = sorted.map((p) => ({
    profileId: Number(p.profileId),
    name: p.name,
    civ: p.civName || null,
    colorHex: p.colorHex || null,
    color: p.color != null ? p.color : null,
    team: p.team != null && p.team !== '' && Number.isFinite(Number(p.team)) ? p.team
      : inferSoloTeams ? (Number(p.profileId) === Number(profileId) ? 1 : 2) : null,
    slot: p.slot,
    // ELO del MODO (TG/EW/custom), solo informativo: composeRows no lo muestra.
    modeRating: numOrNull(p.rating),
    modeRank: numOrNull(p.rank),
  }));

  players.sort((a, b) => {
    const teamDiff = Number(a.team) - Number(b.team);
    if (teamDiff !== 0) return teamDiff;
    return Number(a.slot ?? 0) - Number(b.slot ?? 0);
  });

  const ladder = resolveLadder({
    leaderboardId: lobby.leaderboardId,
    leaderboardName: lobby.leaderboardName,
  });

  const { stats, missing, now } = splitCachedElo(
    players.map((p) => p.profileId),
    cache,
    cacheTtlMs,
  );

  const snapshot = (pending) => ({
    status: 'ongoing',
    phase: 'lobby',
    match: {
      matchId: lobby.matchId,
      mapName: lobby.mapName || '—',
      leaderboardId: lobby.leaderboardId != null ? lobby.leaderboardId : null,
      leaderboardName: lobby.leaderboardName || 'Partida',
      startedAt: null,
    },
    ladder: { id: ladder.id, label: ladder.label, source: ladder.source },
    eloLadder: { id: ELO_LADDER.id, label: ELO_LADDER.label },
    players: composeRows(players, stats, profileId),
    pending,
    checkedAt: Date.now(),
  });

  // Antes las salas unranked salían por acá mostrando el ELO del modo. Ahora
  // TODOS los modos consultan RM 1v1, custom incluidas.
  if (!missing.length) return snapshot(false);

  // Primera fase: roster en pantalla, ELO 1v1 en `…` (nunca el ELO del modo).
  if (onPartial) onPartial(snapshot(true));

  const statsError = await completeEloStats(stats, missing, cache, now);
  return { ...snapshot(false), statsError };
}

/**
 * Adapta un item `status:'matched'` del socket `queueing` a la forma de sala
 * que ya consume buildSnapshotFromLobby.
 *
 * Diferencias con un lobby clásico:
 *  - `civ` es numérico y vale 0 hasta que los jugadores pickean → sin escudo.
 *  - `team` viene 0/1 en vez de 1/2 (sirve igual para agrupar).
 *  - no hay colorHex ni slot: se asignan colores por orden hasta que el REST
 *    traiga los reales cuando arranca la partida.
 *  - `rating` y `rank` son del LADDER DEL MODO (verificado: en un `rm_team`
 *    coinciden con la ladder #4, no con la #3). Se conservan como `modeRating`
 *    pero NO se muestran; el panel pide siempre RM 1v1 al backend.
 */
function adaptMatchedToLobby(item, profileId) {
  const raw = (item.players || []).filter(Boolean);
  const teams = new Set(raw.filter((p) => p.team != null && p.team !== '').map((p) => Number(p.team)).filter(Number.isFinite));
  const hasRealTeams = teams.size >= 2;

  // En queueing los equipos son 0/1 arbitrarios: el tuyo no es necesariamente
  // el 0. Se re-etiquetan a 1 (vos + aliados) y 2 (rivales) para que tu equipo
  // quede arriba, igual que en el REST ya iniciado.
  const me = raw.find((p) => Number(p.profileId) === Number(profileId));
  const myTeam = me && me.team != null && me.team !== '' && Number.isFinite(Number(me.team)) ? Number(me.team) : null;

  // Sin ladder confirmada, no mezclar RM, EW y DM por tamaño del roster.
  const leaderboard = item.leaderboard ?? item.leaderboardId ?? null;

  return {
    matchId: item.matchId,
    mapName: item.mapName || item.map || '—',
    leaderboardId: leaderboard,
    leaderboardName: leaderboard || 'Partida',
    players: raw.map((p, index) => ({
      profileId: Number(p.profileId),
      name: p.name || `Jugador ${index + 1}`,
      civName: null,
      colorHex: null,
      color: (index % 8) + 1,
      slot: index,
      team: hasRealTeams && p.team != null && p.team !== '' && Number.isFinite(Number(p.team))
        ? (myTeam == null ? Number(p.team) : (Number(p.team) === myTeam ? 1 : 2))
        : null,
      rating: numOrNull(p.rating),
      rank: numOrNull(p.rank),
    })),
  };
}

/** Snapshot del minuto previo a la partida (match encontrado, aún no empezó). */
function buildSnapshotFromMatch(item, options) {
  return buildSnapshotFromLobby(adaptMatchedToLobby(item, options && options.profileId), options);
}

module.exports = {
  LADDERS,
  ELO_LADDER,
  resolveLadder,
  getJson,
  fetchMatches,
  fetchLatestMatch,
  fetchMatchById,
  fetchPersonalStats,
  searchProfiles,
  fetchProfileIdentity,
  composeRows,
  normalizeMatch,
  buildSnapshot,
  buildExampleSnapshot,
  buildSnapshotFromLobby,
  adaptMatchedToLobby,
  buildSnapshotFromMatch,
};
