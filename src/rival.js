'use strict';

/**
 * Bloque opcional de datos del RIVAL. Todo es información REAL de fuentes
 * públicas, sin API key y sin inferencias.
 *
 *  1. Últimas 5 civs  -> AoE2 Companion GET /api/matches?profile_ids=<rival>
 *     Cada partida trae teams[].players[].civName, won y el mapa.
 *  2. En el MAPA de la partida -> AoE2 Companion
 *     GET /api/profiles/<rival>/stats?leaderboard_id=<enum>
 *     Devuelve civ[] y map[] con games / wins / losses del histórico completo.
 *     De ahí sale el winrate real en el mapa que se está jugando; la civ más
 *     usada en ESE mapa se cuenta sobre las partidas recientes del historial
 *     (la API no tiene el cruce civ × mapa). El mapa favorito global ya no se
 *     muestra: no sirve si no es el mapa de la partida.
 *  3. Aperturas -> AoE2Insights GET /stats/api/match-ups/ (src/insights.js)
 *     Etiquetas detectadas en REPLAYS ANALIZADOS: Scout rush, Archer rush,
 *     Drush, Fast castle, MAA rush… No es una "apertura típica por civ": es
 *     lo que ese jugador hizo realmente en cada partida. Si no hay replays
 *     analizados se informa `analyzed: 0` y NO se inventa nada.
 *
 * Todo se filtra por el MODO DE JUEGO de la partida en curso: EW se juega
 * distinto a RM, así que un Drush de RM 1v1 no sirve para predecir el arranque
 * en EW 1v1 (y viceversa). Las aperturas se consultan con un segundo `filter`
 * por ladder (src/insights.js) y el historial de civs solo toma partidas del
 * mismo modo. En custom/unranked el modo no se puede resolver y las aperturas
 * se informan como no disponibles en lugar de mezclar modos.
 *
 * Todo se calcula DESPUÉS de pintar el roster: `main.js` dispara esto en
 * segundo plano para no agregar ni un milisegundo al aviso de partida
 * encontrada. Los errores se devuelven como `error` / `openingError` y nunca
 * tiran excepción.
 */

const { getJson, fetchMatches } = require('./aoe');
const { civSlug } = require('./civs');
const {
  buildRivalOpenings,
  resolveMode,
  DEFAULT_TTL_MS: OPENINGS_TTL_MS,
} = require('./insights');

const COMPANION_BASE = process.env.AOE_COMPANION_BASE || 'https://data.aoe2companion.com';
const STATS_LADDERS = new Set(['rm_1v1', 'rm_team', 'ew_1v1', 'ew_team', 'dm_1v1', 'dm_team']);
const NUMERIC_LADDERS = {
  1: 'dm_1v1',
  2: 'dm_team',
  3: 'rm_1v1',
  4: 'rm_team',
  13: 'ew_1v1',
  14: 'ew_team',
};
const FALLBACK_LADDER = 'rm_1v1';
const HISTORY_SIZE = 5;
const HISTORY_PAGE = 25;
// Para el mapa actual se buscan las ÚLTIMAS 5 partidas de ese mapa, sin
// importar su antigüedad: se pagina el historial hacia atrás hasta juntarlas.
const MAP_MATCH_LIMIT = 5;
const MAP_PAGE_SIZE = 100;
const MAP_MAX_PAGES = 10;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

const SOURCES = {
  history: 'AoE2 Companion · historial público de partidas',
  stats: 'AoE2 Companion · estadísticas del perfil',
  openings: 'AoE2Insights · aperturas detectadas en replays analizados',
};

/**
 * RIVALES de verdad (no aliados). El roster trae `team`: 1 = tu equipo,
 * 2 = el rival. Sin esto, en una TG el informe mostraba a tus propios aliados
 * y `RIVAL_LIMIT` se gastaba en ellos antes de llegar a los oponentes.
 *
 * Si el payload no trae equipos (o no marca `isYou`), se cae al criterio
 * anterior: todos menos vos. Nunca devuelve una lista vacía habiendo rivales.
 */
function opponentsOf(state, limit = 2) {
  const players = Array.isArray(state && state.players) ? state.players : [];
  const candidates = players.filter((p) => p && !p.isYou && Number(p.profileId) > 0);
  const you = players.find((p) => p && p.isYou);
  const myTeam = you && you.team != null ? Number(you.team) : NaN;
  if (!Number.isFinite(myTeam)) return candidates.slice(0, limit);
  const enemies = candidates.filter((p) => Number(p.team) !== myTeam);
  return (enemies.length ? enemies : candidates).slice(0, limit);
}

/** La API de stats solo acepta enums; en unranked/custom caemos a RM 1v1. */
function statsLadder(leaderboardId) {
  const raw = String(leaderboardId == null ? '' : leaderboardId).trim();
  if (STATS_LADDERS.has(raw)) return raw;
  if (NUMERIC_LADDERS[raw]) return NUMERIC_LADDERS[raw];
  return FALLBACK_LADDER;
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

function n(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/**
 * Últimas `limit` civs REALMENTE jugadas por el rival, de más nueva a más vieja.
 * Se saltea la partida en curso (no es "elegida en el pasado", es la actual) y
 * cualquier partida sin civ o sin resultado público.
 *
 * Con `options.mode` solo cuentan partidas del MISMO modo de juego (EW y RM
 * no se juegan igual). Partidas cuya ladder no se puede resolver (custom,
 * unranked) se descartan: no se mezclan modos para completar el cupo de 5.
 */
function parseRivalHistory(matches, profileId, currentMatchId, options = {}) {
  const opts = typeof options === 'number' ? { limit: options } : options || {};
  const limit = opts.limit != null ? opts.limit : HISTORY_SIZE;
  const mode = opts.mode ? resolveMode(opts.mode) : null;
  const id = Number(profileId);
  const rows = [];
  for (const match of Array.isArray(matches) ? matches : []) {
    if (!match || match.ongoing) continue;
    if (currentMatchId != null && Number(match.matchId) === Number(currentMatchId)) continue;
    if (mode) {
      const matchMode = resolveMode(match.leaderboardId);
      if (!matchMode || matchMode.id !== mode.id) continue;
    }
    const player = (match.players || []).find((p) => Number(p.profileId) === id);
    if (!player || !player.civ) continue;
    const slug = civSlug(player.civ);
    rows.push({
      matchId: match.matchId,
      civ: String(player.civ),
      slug,
      won: typeof player.won === 'boolean' ? player.won : null,
      mapName: match.mapName || '—',
      leaderboardName: match.leaderboardName || '',
      startedAt: match.startedAt || null,
    });
  }
  rows.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return rows.slice(0, limit);
}

/** Clave tolerante para comparar nombres de mapa entre payloads. */
function mapKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Estadísticas del rival EN UN MAPA concreto, a partir del historial reciente.
 * Filtra por mapa y por modo (EW ≠ RM) y descarta la partida en curso. La civ
 * más usada se elige por partidas y, en empate, por victorias.
 */
function parseMapStats(matches, profileId, currentMatchId, options = {}) {
  const mapName = String((options && options.mapName) || '').trim();
  if (!mapName) return null;
  const wanted = mapKey(mapName);
  const mode = options.mode ? resolveMode(options.mode) : null;
  const limit = Math.max(1, Number(options.limit) || MAP_MATCH_LIMIT);
  const id = Number(profileId);
  const rows = [];

  for (const match of Array.isArray(matches) ? matches : []) {
    if (!match || match.ongoing) continue;
    if (currentMatchId != null && Number(match.matchId) === Number(currentMatchId)) continue;
    if (mode) {
      const matchMode = resolveMode(match.leaderboardId);
      if (!matchMode || matchMode.id !== mode.id) continue;
    }
    if (mapKey(match.mapName) !== wanted) continue;
    const player = (match.players || []).find((p) => Number(p.profileId) === id);
    if (!player || !player.civ) continue;
    rows.push({
      civ: String(player.civ),
      slug: civSlug(player.civ),
      won: player.won === true,
      startedAt: Number(match.startedAt) || 0,
    });
  }

  // Las ÚLTIMAS `limit` de ese mapa, sin importar cuán viejas sean.
  rows.sort((a, b) => b.startedAt - a.startedAt);
  const sample = rows.slice(0, limit);
  const civs = new Map();
  let wins = 0;
  for (const row of sample) {
    if (row.won) wins += 1;
    const key = row.slug || row.civ;
    const entry = civs.get(key) || { name: row.civ, slug: row.slug, games: 0, wins: 0 };
    entry.games += 1;
    if (row.won) entry.wins += 1;
    civs.set(key, entry);
  }
  const games = sample.length;
  const ranked = [...civs.values()]
    .map((entry) => ({
      ...entry,
      share: pct(entry.games, games),
      winRate: pct(entry.wins, entry.games),
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins);

  return {
    name: mapName,
    games,
    wins,
    winRate: pct(wins, games),
    civ: ranked[0] || null,
    civs: ranked.slice(0, 3),
    sampleGames: games,
    totalMapGames: rows.length,
  };
}

/** Apertura más usada dentro de un conjunto de replays analizados. */
function topOpening(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (!row || !row.strategy) continue;
    counts.set(row.strategy, (counts.get(row.strategy) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (!ranked.length) return null;
  const [name, count] = ranked[0];
  return {
    name,
    short: (rows.find((row) => row && row.strategy === name) || {}).short || name,
    count,
    share: Math.round((count / rows.length) * 100),
  };
}

/**
 * Estrategia del rival EN ESTE MAPA y, si se conoce, con la civ que más usó
 * ahí. Sale de los replays analizados por AoE2Insights (mismo modo).
 */
function summarizeOpeningsByMap(rows, mapName, civName) {
  const wantMap = mapKey(mapName);
  const wantCiv = civSlug(civName);
  const analyzed = (Array.isArray(rows) ? rows : []).filter((row) => row && row.strategy);
  const mapRows = analyzed.filter((row) => mapKey(row.map) === wantMap);
  const civRows = wantCiv ? mapRows.filter((row) => civSlug(row.civ) === wantCiv) : [];
  return {
    mapAnalyzed: mapRows.length,
    mapFavorite: topOpening(mapRows),
    mapCivAnalyzed: civRows.length,
    mapCivFavorite: topOpening(civRows),
  };
}

/** Normaliza el /stats: ordena por partidas y calcula cuota y winrate. */
function normalizeProfileStats(raw, mapName = null) {
  const civs = (Array.isArray(raw && raw.civ) ? raw.civ : [])
    .map((entry) => ({
      slug: civSlug(entry.civ) || String(entry.civ || ''),
      name: String(entry.civName || entry.civ || '—'),
      games: n(entry.games),
      wins: n(entry.wins),
      losses: n(entry.losses),
    }))
    .filter((entry) => entry.games > 0)
    .sort((a, b) => b.games - a.games);

  const maps = (Array.isArray(raw && raw.map) ? raw.map : [])
    .map((entry) => ({
      name: String(entry.mapName || entry.map || '—'),
      games: n(entry.games),
      wins: n(entry.wins),
    }))
    .filter((entry) => entry.games > 0)
    .sort((a, b) => b.games - a.games);

  const totalGames = civs.reduce((sum, entry) => sum + entry.games, 0);
  const totalMapGames = maps.reduce((sum, entry) => sum + entry.games, 0);
  const decorateCiv = (entry) => ({
    ...entry,
    share: pct(entry.games, totalGames),
    winRate: pct(entry.wins, entry.games),
  });
  const decorateMap = (entry) => ({ ...entry, share: pct(entry.games, totalMapGames) });
  const wantedMap = mapKey(mapName);
  const currentEntry = wantedMap ? maps.find((entry) => mapKey(entry.name) === wantedMap) : null;

  return {
    statsLadderLabel: String((raw && raw.leaderboardName) || 'Ranked'),
    totalGames,
    topCivs: civs.slice(0, 3).map(decorateCiv),
    favoriteCiv: civs.length ? decorateCiv(civs[0]) : null,
    topMaps: maps.slice(0, 2).map(decorateMap),
    favoriteMap: maps.length ? decorateMap(maps[0]) : null,
    // El mapa de la partida (no el favorito): partidas y winrate del histórico.
    currentMap: currentEntry
      ? { ...decorateMap(currentEntry), winRate: pct(currentEntry.wins, currentEntry.games) }
      : null,
  };
}

/**
 * Arma el bloque completo de un rival. Acepta `fetchMatchesImpl` / `getJsonImpl`
 * / `openingsImpl` para que el selftest pueda probar todo sin abrir la red.
 *
 * `includeOpenings` lo apaga main.js cuando la opción está desactivada: así no
 * se consulta AoE2Insights (que puede tardar ~9s en calcular) si nadie lo pidió.
 */
async function buildRivalInsights(options = {}) {
  const {
    profileId,
    name = null,
    civ = null,
    leaderboardId = null,
    mapName = null,
    currentMatchId = null,
    cache = null,
    cacheTtlMs = DEFAULT_TTL_MS,
    now = Date.now(),
    includeOpenings = true,
    openingsTtlMs = OPENINGS_TTL_MS,
    fetchMatchesImpl = fetchMatches,
    getJsonImpl = getJson,
    openingsImpl = buildRivalOpenings,
    onPartial = null,
    fetchImpl,
    sleep,
    log = () => {},
  } = options;

  const id = Number(profileId);
  const base = { profileId: id, name, civ, mapName: mapName ? String(mapName) : null, sources: SOURCES, fetchedAt: now, error: null };
  if (!Number.isFinite(id) || id <= 0) return { ...base, error: 'perfil inválido' };

  const ladder = statsLadder(leaderboardId);
  // El MODO de la partida (RM 1v1, EW 1v1…) decide qué replays y qué
  // partidas del historial cuentan. `null` = partida sin ladder rankeada.
  const mode = resolveMode(leaderboardId);
  const modeId = mode ? mode.id : 'sin-modo';
  // El mapa entra en la clave: el informe de Arabia no sirve para Arena.
  const key = `rival:insights:${id}:${ladder}:${modeId}:${mapKey(mapName)}:${includeOpenings ? 1 : 0}`;
  const cached = cache && cache.get(key);
  if (cached && now - cached.ts <= cacheTtlMs) {
    return { ...base, ...cached.data, ladder, fromCache: true };
  }

  const result = {
    ladder,
    mode: mode ? { ...mode } : null,
    mapName: base.mapName,
    history: [],
    mapStats: null,
    currentMap: null,
    topCivs: [],
    topMaps: [],
    favoriteCiv: null,
    favoriteMap: null,
    totalGames: 0,
    statsLadderLabel: null,
    openings: null,
    openingError: null,
  };
  const errors = [];

  try {
    const matches = [];
    const seen = new Set();
    const add = (list) => {
      const before = matches.length;
      for (const match of Array.isArray(list) ? list : []) {
        const key = match && match.matchId != null ? String(match.matchId) : null;
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        matches.push(match);
      }
      return matches.length - before;
    };

    const first = (await fetchMatchesImpl(id, MAP_PAGE_SIZE, 1)) || [];
    add(first);
    result.history = parseRivalHistory(matches, id, currentMatchId, { mode });
    result.mapStats = parseMapStats(matches, id, currentMatchId, { mode, mapName });

    // Si todavía no hay 5 partidas de ESE mapa, se sigue paginando hacia
    // atrás. No importa la antigüedad: solo corta al terminar el historial o
    // al llegar al tope de páginas.
    let page = 1;
    let lastPage = first;
    while (
      mapName &&
      result.mapStats &&
      result.mapStats.sampleGames < MAP_MATCH_LIMIT &&
      page < MAP_MAX_PAGES &&
      lastPage.length >= MAP_PAGE_SIZE
    ) {
      page += 1;
      lastPage = (await fetchMatchesImpl(id, MAP_PAGE_SIZE, page)) || [];
      if (!add(lastPage)) break;
      result.history = parseRivalHistory(matches, id, currentMatchId, { mode });
      result.mapStats = parseMapStats(matches, id, currentMatchId, { mode, mapName });
    }
  } catch (err) {
    errors.push(`historial: ${err.message}`);
  }

  try {
    const url =
      `${COMPANION_BASE}/api/profiles/${encodeURIComponent(id)}/stats` +
      `?leaderboard_id=${encodeURIComponent(ladder)}`;
    const raw = await getJsonImpl(url);
    Object.assign(result, normalizeProfileStats(raw, mapName));

    // El /stats tiene el histórico completo del mapa (partidas y winrate). La
    // civ más usada viene de la muestra del historial, porque la API no cruza
    // civ × mapa. Se combinan sin inventar: si el mapa no aparece, queda la
    // muestra o el aviso de "sin partidas".
  } catch (err) {
    errors.push(`stats: ${err.message}`);
  }

  if (result.mapStats && result.currentMap) {
    result.mapStats = {
      ...result.mapStats,
      games: result.currentMap.games,
      wins: result.currentMap.wins,
      winRate: result.currentMap.winRate,
      share: result.currentMap.share,
      sampleGames: result.mapStats.games,
    };
  } else if (!result.mapStats && result.currentMap) {
    result.mapStats = { ...result.currentMap, civ: null, sampleGames: 0 };
  }

  // Primer aviso: histórico de civs / mapa actual ya están listos (~0.3s).
  // AoE2Insights puede tardar ~9s en calcular la consulta, así que el panel
  // pinta las civs AHORA y agrega las aperturas cuando llegan.
  if (typeof onPartial === 'function' && includeOpenings) {
    onPartial({ ...base, ...result, ladder, openings: null, pendingOpenings: true, fromCache: false });
  }

  // Aperturas REALES del MISMO modo de juego (la ladder va como segundo
  // `filter` a AoE2Insights). Tienen su propia cache (30 min) porque
  // reanalizar replays es lento y el histórico se refresca más seguido.
  if (includeOpenings) {
    try {
      const openings = await openingsImpl({
        profileId: id,
        mode,
        cache,
        cacheTtlMs: openingsTtlMs,
        now,
        fetchImpl,
        sleep,
        log,
      });
      result.openings = openings;
      result.openingError =
        openings && openings.ok === false ? openings.error : null;
      if (result.openings) {
        // Se resume para el mapa de la partida y con la civ más usada ahí.
        // El detalle de replays se usa solo acá y no viaja al renderer.
        const summary = summarizeOpeningsByMap(
          result.openings.analyzedMatches,
          mapName,
          result.mapStats && result.mapStats.civ ? result.mapStats.civ.name : null,
        );
        result.openings = { ...result.openings, ...summary };
        delete result.openings.analyzedMatches;
      }
    } catch (err) {
      result.openingError = `aperturas: ${err.message}`;
    }
  }

  result.error = errors.length ? errors.join(' · ') : null;
  if (cache) cache.set(key, { ts: now, data: result });
  if (result.error) log(`datos del rival #${id} incompletos: ${result.error}`);

  return { ...base, ...result, fromCache: false };
}

/** ¿Hay que consultar la red o alcanza con lo que ya hay en memoria? */
function hasCachedInsights(cache, profileId, leaderboardId, options = {}) {
  if (!cache) return false;
  const { now = Date.now(), cacheTtlMs = DEFAULT_TTL_MS, includeOpenings = true, mapName = null } = options;
  const mode = resolveMode(leaderboardId);
  const key =
    `rival:insights:${Number(profileId)}:${statsLadder(leaderboardId)}:` +
    `${mode ? mode.id : 'sin-modo'}:${mapKey(mapName)}:${includeOpenings ? 1 : 0}`;
  const entry = cache.get(key);
  return Boolean(entry && now - entry.ts <= cacheTtlMs);
}

module.exports = {
  SOURCES,
  STATS_LADDERS,
  NUMERIC_LADDERS,
  FALLBACK_LADDER,
  HISTORY_SIZE,
  HISTORY_PAGE,
  MAP_MATCH_LIMIT,
  MAP_PAGE_SIZE,
  MAP_MAX_PAGES,
  DEFAULT_TTL_MS,
  OPENINGS_TTL_MS,
  opponentsOf,
  statsLadder,
  resolveMode,
  pct,
  mapKey,
  parseRivalHistory,
  parseMapStats,
  summarizeOpeningsByMap,
  normalizeProfileStats,
  buildRivalInsights,
  hasCachedInsights,
};
