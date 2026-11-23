'use strict';

const { RequestScheduler } = require('./request-scheduler');
const matchHistoryScheduler = new RequestScheduler();

/**
 * Caché liviana en memoria con TTL + deduplicación de requests en vuelo.
 * Solo para consultas semi-estáticas (búsqueda, identidad, historial, stats);
 * NUNCA se aplica a detección de partida en vivo (`fetchLatestMatch`).
 */
function createApiCache({ maxEntries = 120 } = {}) {
  const entries = new Map();
  const inflight = new Map();

  function get(key, ttlMs, now = Date.now()) {
    const hit = entries.get(key);
    if (!hit) return undefined;
    if (now - hit.ts > ttlMs) {
      entries.delete(key);
      return undefined;
    }
    // LRU touch
    entries.delete(key);
    entries.set(key, hit);
    return hit.value;
  }

  function set(key, value, now = Date.now()) {
    if (entries.has(key)) entries.delete(key);
    entries.set(key, { ts: now, value });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
    return value;
  }

  async function getOrFetch(key, ttlMs, fetcher, { bypass = false, cacheNull = true } = {}) {
    if (!bypass && ttlMs > 0) {
      const cached = get(key, ttlMs);
      if (cached !== undefined) return cached;
    }
    if (!bypass && inflight.has(key)) return inflight.get(key);
    const promise = Promise.resolve()
      .then(fetcher)
      .then((value) => {
        if (ttlMs > 0 && value !== undefined && (cacheNull || value !== null)) set(key, value);
        return value;
      })
      .finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key);
      });
    inflight.set(key, promise);
    return promise;
  }

  function clear(prefix = null) {
    if (!prefix) {
      entries.clear();
      return;
    }
    for (const key of entries.keys()) {
      if (key.startsWith(prefix)) entries.delete(key);
    }
  }

  function findFirst(predicate, ttlMs, now = Date.now()) {
    for (const [key, hit] of entries.entries()) {
      if (now - hit.ts > ttlMs) continue;
      if (predicate(key, hit.value)) return hit.value;
    }
    return undefined;
  }

  function stats() {
    return { size: entries.size, inflight: inflight.size };
  }

  return { get, set, getOrFetch, findFirst, clear, stats };
}

const apiCache = createApiCache({ maxEntries: 160 });
const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const IDENTITY_CACHE_TTL_MS = 15 * 60 * 1000;
const MATCH_HISTORY_CACHE_TTL_MS = 60 * 1000;
const MATCH_BY_ID_CACHE_TTL_MS = 10 * 60 * 1000;
const PROFILE_EXTENDED_CACHE_TTL_MS = 5 * 60 * 1000;
const PERSONAL_STATS_DEDUP_TTL_MS = 20 * 1000;

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
let serverOffsetMs = 0;

function serverNow() {
  return Date.now() + serverOffsetMs;
}

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

async function getJson(url, timeoutMs = 12000, externalSignal = null) {
  if (externalSignal && externalSignal.aborted) {
    const err = new Error('Solicitud cancelada');
    err.name = 'AbortError';
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (externalSignal) externalSignal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    const dateHdr = res.headers && res.headers.get ? res.headers.get('date') : null;
    if (dateHdr) {
      const serverTs = Date.parse(dateHdr);
      if (Number.isFinite(serverTs)) serverOffsetMs = serverTs - Date.now();
    }
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
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
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
 * Página 1 reutiliza automáticamente cualquier superset ya cacheado (`perPage >= solicitado`).
 */
async function fetchMatches(profileId, perPage = 20, page = 1, ladder = null, options = {}) {
  const pid = Number(profileId);
  const ladderTag = ladder || 'all';
  const ttlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : MATCH_HISTORY_CACHE_TTL_MS;
  const bypass = Boolean(options.bypassCache);

  // Page-1 superset slicing: si ya hay >= perPage partidas frescas para (pid, ladder), evitar otro GET
  if (!bypass && Number(page) === 1 && ttlMs > 0) {
    const prefix = `matches:${pid}:`;
    const suffix = `:1:${ladderTag}`;
    const superset = apiCache.findFirst((k) => {
      if (!k.startsWith(prefix) || !k.endsWith(suffix)) return false;
      const cachedPer = Number(k.slice(prefix.length, k.length - suffix.length));
      return Number.isFinite(cachedPer) && cachedPer >= Number(perPage);
    }, ttlMs);
    if (Array.isArray(superset)) return superset.slice(0, Number(perPage));
  }

  const url =
    `${COMPANION_BASE}/api/matches?profile_ids=${encodeURIComponent(pid)}` +
    `&use_enums=true&page=${encodeURIComponent(page)}&per_page=${encodeURIComponent(perPage)}` +
    (ladder ? `&leaderboard_ids=${encodeURIComponent(ladder)}` : '');
  const priority = Number(page) === 1 ? 2 : options.priority === 'own' ? 1 : 0;
  const key = `matches:${pid}:${perPage}:${page}:${ladderTag}`;
  return apiCache.getOrFetch(
    key,
    ttlMs,
    async () => {
      const data = await matchHistoryScheduler.run(
        () => getJson(url, 12000, options.signal || null),
        priority,
        { signal: options.signal || null },
      );
      const list = Array.isArray(data) ? data : (data && data.matches) || [];
      return list.map(normalizeMatch);
    },
    { bypass },
  );
}

async function fetchLatestMatch(profileId) {
  const url =
    `${COMPANION_BASE}/api/matches?profile_ids=${encodeURIComponent(profileId)}` +
    '&use_enums=true&page=1&per_page=3';
  const data = await getJson(url);
  const rawList = Array.isArray(data) ? data : (data && data.matches) || [];
  const list = rawList.map(normalizeMatch);
  return list.find((m) => m && m.ongoing) || list[0] || null;
}

async function fetchLatest1v1Match(profileId) {
  try {
    const list = await fetchMatches(profileId, 5, 1, 'rm_1v1', { cacheTtlMs: 30_000 });
    const rm1v1 = list.find((m) => m && Array.isArray(m.players) && m.players.length === 2) || list[0];
    if (rm1v1) return rm1v1;
  } catch {
    /* fallback to any latest match */
  }
  return fetchLatestMatch(profileId);
}

async function fetchLatestTeamMatch(profileId) {
  try {
    const list = await fetchMatches(profileId, 10, 1, null, { cacheTtlMs: 30_000 });
    const tg = list.find((m) => m && Array.isArray(m.players) && m.players.length > 2) || list[0];
    if (tg) return tg;
  } catch {
    /* fallback to any latest match */
  }
  return fetchLatestMatch(profileId);
}

/**
 * Una partida puntual por `matchId` (Companion `GET /api/matches/:id`).
 * Solo la usa el modo ejemplo para capturar una partida concreta del perfil
 * (`--example-match=<id>`) en vez de la última.
 */
async function fetchMatchById(matchId, options = {}) {
  const id = Number(matchId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Ese match ID no es válido.');
  return apiCache.getOrFetch(
    `matchById:${id}`,
    MATCH_BY_ID_CACHE_TTL_MS,
    async () => {
      const data = await getJson(`${COMPANION_BASE}/api/matches/${id}`, 12000, options.signal || null);
      const raw = data && data.match ? data.match : data;
      if (!raw || !raw.matchId) throw new Error(`AoE2 Companion no tiene la partida #${id}.`);
      return normalizeMatch(raw);
    },
    { bypass: Boolean(options.bypassCache) },
  );
}

/** Perfil extendido de AoE2 Companion (`?use_enums=true&extend=stats`), cacheado con TTL. */
async function fetchExtendedProfile(profileId, { bypassCache = false, timeoutMs = 10000, signal = null } = {}) {
  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return apiCache.getOrFetch(
    `profileExt:${id}`,
    PROFILE_EXTENDED_CACHE_TTL_MS,
    () => getJson(`${COMPANION_BASE}/api/profiles/${encodeURIComponent(id)}?use_enums=true&extend=stats`, timeoutMs, signal),
    { bypass: Boolean(bypassCache), cacheNull: false },
  );
}

/** Stats de un ladder en Companion: reutiliza `profileExt` si ya está fresco en caché. */
async function fetchProfileStats(profileId, ladder, { timeoutMs = 10000, signal = null } = {}) {
  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const ext = apiCache.get(`profileExt:${id}`, PROFILE_EXTENDED_CACHE_TTL_MS);
  if (ext && Array.isArray(ext.stats)) {
    const hit = ext.stats.find((s) => String(s?.leaderboardId || '').toLowerCase() === String(ladder || '').toLowerCase());
    if (hit) return hit;
  }
  return apiCache.getOrFetch(
    `profileStats:${id}:${ladder}`,
    PROFILE_EXTENDED_CACHE_TTL_MS,
    () => getJson(
      `${COMPANION_BASE}/api/profiles/${encodeURIComponent(id)}/stats?leaderboard_id=${encodeURIComponent(ladder)}`,
      timeoutMs,
      signal,
    ),
    { cacheNull: false },
  );
}

function historyCutoff(state) {
  const timestamp = state?.example ? state.example.realStartedAt : state?.match?.startedAt;
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
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
  const age = startedAt ? serverNow() - startedAt : 0;
  const ladderId = raw.leaderboardId != null ? raw.leaderboardId : raw.leaderboard;

  return {
    matchId: raw.matchId,
    mapName: raw.mapName || raw.map || '—',
    leaderboardId: ladderId != null ? ladderId : null,
    leaderboardName: raw.leaderboardName || String(ladderId || 'Partida'),
    startedAt,
    finishedAt,
    ongoing: finishedAt == null && age > -15 * 60 * 1000 && age < ONGOING_MAX_AGE_MS,
    players,
  };
}

/**
 * Stats de un ladder concreto para varios jugadores en una sola request.
 * Cachea TODOS los ladders por jugador (`weProfile:${id}`) porque World's Edge
 * siempre devuelve todos los ladders en una sola respuesta: pedir ladder 3 y
 * ladder 4 del mismo jugador dispara UNA sola solicitud HTTP y además siembra
 * la identidad (`identity:${id}`).
 */
async function fetchPersonalStats(profileIds, ladderId = ELO_LADDER.id, timeoutMs = 7000, options = {}) {
  const ids = [...new Set((profileIds || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!ids.length || ladderId == null) return new Map();

  const out = new Map();
  const missing = [];
  for (const pid of ids) {
    const hit = apiCache.get(`weProfile:${pid}`, PERSONAL_STATS_DEDUP_TTL_MS);
    if (hit) {
      const row = hit.ladders.get(Number(ladderId));
      if (row) out.set(pid, row);
    } else {
      missing.push(pid);
    }
  }
  if (!missing.length) return out;

  const batchKey = `weBatch:${missing.join(',')}`;
  const fetchedByPlayer = await apiCache.getOrFetch(batchKey, PERSONAL_STATS_DEDUP_TTL_MS, async () => {
    const url =
      `${WE_BASE}/community/leaderboard/getPersonalStat?title=age2` +
      `&profile_ids=${encodeURIComponent(JSON.stringify(missing))}`;
    const data = await getJson(url, timeoutMs, options.signal || null);

    if (data && data.result && Number(data.result.code) !== 0) {
      throw new Error(`World's Edge: ${data.result.message || 'error'}`);
    }

    const owner = new Map();
    const byPlayer = new Map();
    for (const pid of missing) {
      byPlayer.set(pid, { ladders: new Map(), alias: null, country: null, clan: null });
    }
    for (const group of data.statGroups || []) {
      const member = (group.members || [])[0];
      if (member && member.profile_id != null) {
        const pid = Number(member.profile_id);
        owner.set(group.id, pid);
        const rec = byPlayer.get(pid) || { ladders: new Map(), alias: null, country: null, clan: null };
        rec.alias = member.alias || rec.alias;
        rec.country = member.country || rec.country;
        rec.clan = member.clanlist_name || rec.clan;
        byPlayer.set(pid, rec);
        if (rec.alias) {
          apiCache.set(`identity:${pid}`, { profileId: pid, alias: rec.alias, country: rec.country || null });
        }
      }
    }

    for (const row of data.leaderboardStats || []) {
      const lid = Number(row.leaderboard_id);
      const profileId = owner.get(row.statgroup_id);
      if (profileId == null || !Number.isFinite(lid)) continue;

      const rating = numOrNull(row.rating);
      const peak = numOrNull(row.highestrating);
      const cleanPeak = peak && peak > 0 ? peak : null;
      const rank = row.rank > 0 ? Number(row.rank) : null;
      const rankTotal = row.ranktotal > 0 ? Number(row.ranktotal) : null;
      const ladderPercentile = rank && rankTotal
        ? Math.max(0.1, Math.min(100, Math.round((rank / rankTotal) * 1000) / 10))
        : null;
      const peakDelta = rating != null && cleanPeak != null ? Math.round(cleanPeak - rating) : null;
      const lastMatchSec = numOrNull(row.lastmatchdate);
      const rec = byPlayer.get(profileId) || { ladders: new Map(), alias: null, country: null, clan: null };

      rec.ladders.set(lid, {
        rating,
        peak: cleanPeak,
        rank,
        rankTotal,
        ladderPercentile,
        peakDelta,
        wins: numOrNull(row.wins),
        losses: numOrNull(row.losses),
        streak: numOrNull(row.streak),
        drops: numOrNull(row.drops),
        regionRank: row.regionrank > 0 ? Number(row.regionrank) : null,
        regionRankTotal: row.regionranktotal > 0 ? Number(row.regionranktotal) : null,
        lastMatchAt: lastMatchSec && lastMatchSec > 0 ? lastMatchSec * 1000 : null,
        country: rec.country || null,
        clan: rec.clan || null,
      });
      byPlayer.set(profileId, rec);
    }

    for (const [pid, rec] of byPlayer.entries()) {
      apiCache.set(`weProfile:${pid}`, rec);
    }
    return byPlayer;
  });

  for (const pid of missing) {
    const rec = fetchedByPlayer.get(pid);
    const row = rec && rec.ladders.get(Number(ladderId));
    if (row) out.set(pid, row);
  }
  return out;
}

/** Busca perfiles por nombre (sugerencias de la ventana de configuración y Central). */
async function searchProfiles(query, limit = 12, options = {}) {
  const term = String(query || '').trim();
  if (term.length < 2) return [];
  const normKey = `search:${term.toLowerCase()}:${limit}`;
  const list = await apiCache.getOrFetch(
    normKey,
    SEARCH_CACHE_TTL_MS,
    async () => {
      const url =
        `${COMPANION_BASE}/api/profiles?search=${encodeURIComponent(term)}` +
        `&per_page=${encodeURIComponent(limit)}`;
      const data = await getJson(url, 8000);

      return (data.profiles || []).map((profile) => ({
        profileId: Number(profile.profileId),
        name: profile.name,
        clan: profile.clan || '',
        country: profile.country || '',
        games: numOrNull(profile.games),
        platform: profile.platform || '',
      }));
    },
    { bypass: Boolean(options.bypassCache) },
  );
  return list.slice();
}

/** Nombre/alias de un profile_id, para mostrarlo en la configuración. */
async function fetchProfileIdentity(profileId, options = {}) {
  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) return null;

  return apiCache.getOrFetch(
    `identity:${id}`,
    IDENTITY_CACHE_TTL_MS,
    async () => {
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
    },
    { bypass: Boolean(options.bypassCache), cacheNull: false },
  );
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
    const rating = stat ? stat.rating : null;
    const peak = stat ? stat.peak : null;
    const rank = stat ? stat.rank : null;
    const rankTotal = stat && stat.rankTotal != null ? stat.rankTotal : null;
    const ladderPercentile = stat && stat.ladderPercentile != null
      ? stat.ladderPercentile
      : rank && rankTotal
        ? Math.max(0.1, Math.min(100, Math.round((rank / rankTotal) * 1000) / 10))
        : null;
    const peakDelta = stat && stat.peakDelta != null
      ? stat.peakDelta
      : rating != null && peak != null
        ? Math.round(peak - rating)
        : null;
    return {
      ...player,
      isYou: Number(player.profileId) === Number(youId),
      rating,
      peak,
      rank,
      rankTotal,
      ladderPercentile,
      peakDelta,
      streak: stat && stat.streak != null ? stat.streak : null,
      drops: stat && stat.drops != null ? stat.drops : null,
      wins: stat && stat.wins != null ? stat.wins : null,
      losses: stat && stat.losses != null ? stat.losses : null,
      lastMatchAt: stat && stat.lastMatchAt != null ? stat.lastMatchAt : null,
      country: (stat && stat.country) || player.country || null,
      clan: (stat && stat.clan) || player.clan || null,
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
      // La partida completa permite confirmar el resultado (won/finishedAt),
      // el matchId y el roster. Sin eso, el postmatch no puede distinguir el
      // final real de la partida que se acaba de ver en vivo.
      lastMatch: match || null,
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
  fetchLatestImpl = fetchLatest1v1Match,
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
    civ: Number(p.profileId) === Number(profileId) ? p.civName || null : null,
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

// La fase lobby representa el intervalo anterior a la revelación. Un
// snapshot histórico o un proveedor puede traer el pick resuelto igualmente.
function hideLobbyCivs(state) {
  if (state?.phase !== 'lobby' || !Array.isArray(state.players) ||
      !state.players.some((player) => !player.isYou && player.civ != null)) return state;
  return { ...state, players: state.players.map((player) =>
    player.isYou || player.civ == null ? player : { ...player, civ: null }) };
}

module.exports = {
  hideLobbyCivs,
  LADDERS,
  ELO_LADDER,
  resolveLadder,
  getJson,
  fetchMatches,
  fetchLatestMatch,
  fetchLatest1v1Match,
  fetchLatestTeamMatch,
  fetchMatchById,
  fetchExtendedProfile,
  fetchProfileStats,
  fetchPersonalStats,
  searchProfiles,
  fetchProfileIdentity,
  createApiCache,
  apiCache,
  composeRows,
  normalizeMatch,
  historyCutoff,
  buildSnapshot,
  buildExampleSnapshot,
  buildSnapshotFromLobby,
  adaptMatchedToLobby,
  buildSnapshotFromMatch,
};
