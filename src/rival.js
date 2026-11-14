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
// Priorizar una muestra reciente para el prematch: paginar miles de partidas
// genera ráfagas y 429. La interfaz declara cuántas partidas se analizaron.
const MAP_PAGE_SIZE = 100;
const MAP_MAX_PAGES = 5;
// Tope de tiempo para recorrer páginas del historial. Con MAP_PAGE_SIZE=100 y
// una cuenta de miles de partidas el recorrido llegaba a 100 páginas (~40 s):
// la pre-partida se pasaba mostrando "cargando…" y en TG ni llegaba a verse.
const HISTORY_BUDGET_MS = 6000;
// Espera MÁXIMA por las aperturas antes de publicar el informe sin ellas. Con
// el historial completo del modo (limit 500) la consulta a AoE2Insights tarda
// ~20 s en frío la primera vez de cada rival y ~70 ms después: esperarla
// dejaría la tarjeta "analizando replays…" media pre-partida. Si no llega a
// tiempo, el informe sale igual y `onOpenings` repinta cuando están listas.
const OPENINGS_WAIT_MS = 1200;
const PAGE_DELAY_MS = 400; // espacia las páginas de cada rival
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
  if (!Number.isFinite(myTeam)) return players.length <= 2 ? candidates.slice(0, limit) : [];
  const enemies = candidates.filter((p) => p.team != null && Number.isFinite(Number(p.team)) && Number(p.team) !== myTeam);
  if (enemies.length) return enemies.slice(0, limit);
  // Si el roster parcial solo contiene aliados conocidos, esperá al rival.
  // Solo usar jugadores sin equipo cuando su pertenencia aún se desconoce.
  return players.length <= 2
    ? candidates.filter((p) => p.team == null || p.team === '' || !Number.isFinite(Number(p.team))).slice(0, limit)
    : [];
}

/** H2H usa el historial propio y no necesita descargar el del rival. */
function needsRivalHistory(view = {}) {
  return Boolean(view.rivalCivs || view.rivalFavorites || view.rivalOpenings);
}

/** Actualiza una tarjeta conservando el estado de los demás rivales. */
function mergeRivalReport(reports, report, includeOpenings) {
  const next = reports.map((item) => Number(item.profileId) === Number(report.profileId) ? report : item);
  return {
    reports: next.map((item) => ({ ...item })),
    partial: next.some((item) => item.loading),
    pendingOpenings: Boolean(includeOpenings) && next.some((item) => item.loading || item.openingsPending),
  };
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
 * Estadísticas del rival EN UN MAPA concreto, a partir de TODO el historial
 * de ese mapa. Filtra por mapa y por modo (EW ≠ RM) y descarta la partida en
 * curso. La civ más usada se elige por partidas y, en empate, por victorias.
 */
function parseMapStats(matches, profileId, currentMatchId, options = {}) {
  const mapName = String((options && options.mapName) || '').trim();
  if (!mapName) return null;
  const wanted = mapKey(mapName);
  const mode = options.mode ? resolveMode(options.mode) : null;
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
      won: typeof player.won === 'boolean' ? player.won : null,
      startedAt: Number(match.startedAt) || 0,
    });
  }

  // TODO el historial de ese mapa en este modo. No se recorta a 20: una
  // racha reciente puede esconder la civ que el rival usa habitualmente.
  rows.sort((a, b) => b.startedAt - a.startedAt);
  const civs = new Map();
  let wins = 0;
  let resultGames = 0;
  for (const row of rows) {
    if (typeof row.won === 'boolean') resultGames += 1;
    if (row.won === true) wins += 1;
    const key = row.slug || row.civ;
    const entry = civs.get(key) || { name: row.civ, slug: row.slug, games: 0, wins: 0, resultGames: 0 };
    entry.games += 1;
    if (typeof row.won === 'boolean') entry.resultGames += 1;
    if (row.won === true) entry.wins += 1;
    civs.set(key, entry);
  }
  const games = rows.length;
  const ranked = [...civs.values()]
    .map((entry) => ({
      ...entry,
      share: pct(entry.games, games),
      winRate: pct(entry.wins, entry.resultGames),
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins);

  return {
    name: mapName,
    games,
    wins,
    resultGames,
    winRate: pct(wins, resultGames),
    civ: ranked[0] || null,
    civs: ranked.slice(0, 3),
    sampleGames: games,
    totalMapGames: games,
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
 * Estrategia del rival EN ESTE MAPA y CON LA CIV que más usó ahí. Sale de los
 * replays analizados por AoE2Insights (mismo modo). Nunca se devuelve la
 * apertura general ni la de otra civ: `recent` queda filtrado al mapa y a esa
 * civ para que el panel no muestre un Scout rush de Arabia al jugar Arena.
 */
function summarizeOpeningsByMap(rows, mapName, civName) {
  const wantMap = mapKey(mapName);
  const wantCiv = civSlug(civName);
  const analyzed = (Array.isArray(rows) ? rows : []).filter((row) => row && row.strategy);
  const mapRows = analyzed.filter((row) => mapKey(row.map) === wantMap);
  const civRows = wantCiv ? mapRows.filter((row) => civSlug(row.civ) === wantCiv) : [];
  // Las últimas también se acotan a la civ del mapa cuando se conoce: si la
  // civ más usada no tiene replays, no se muestran los de otra civ.
  const recentRows = wantCiv ? civRows : mapRows;
  const recent = recentRows.slice(0, 5).map((row) => ({
    name: row.strategy,
    short: row.short || row.strategy,
    civ: row.civ,
    map: row.map,
    ladder: row.ladder,
    startedAt: row.startedAt,
  }));
  return {
    mapAnalyzed: mapRows.length,
    mapFavorite: topOpening(mapRows),
    mapCivAnalyzed: civRows.length,
    mapCivFavorite: topOpening(civRows),
    recent,
  };
}

/** Normaliza el /stats: ordena por partidas y calcula cuota y winrate. */
function normalizeProfileStats(raw, mapName = null) {
  const civs = (Array.isArray(raw && raw.civ) ? raw.civ : [])
    .map((entry) => ({
      slug: civSlug(entry.civ) || String(entry.civ || ''),
      name: String(entry.civName || entry.civ || '—'),
      games: n(entry.games),
      wins: entry.wins == null ? null : n(entry.wins),
      losses: entry.losses == null ? null : n(entry.losses),
    }))
    .filter((entry) => entry.games > 0)
    .sort((a, b) => b.games - a.games);

  const maps = (Array.isArray(raw && raw.map) ? raw.map : [])
    .map((entry) => ({
      name: String(entry.mapName || entry.map || '—'),
      games: n(entry.games),
      wins: entry.wins == null ? null : n(entry.wins),
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
    // Aviso TARDÍO de aperturas: se llama si llegaron después de
    // `openingsWaitMs`, con el informe completo listo para publicar.
    onOpenings = null,
    openingsWaitMs = OPENINGS_WAIT_MS,
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
  if (!mode) {
    return { ...base, modeUnavailable: true, modePending: leaderboardId == null, history: [], mapStats: null,
      openings: includeOpenings ? { ok: true, modeUnavailable: true } : null,
      openingsPending: false };
  }
  const modeId = mode ? mode.id : 'sin-modo';
  // El historial se pide filtrado por el ladder EXACTO cuando la partida es
  // rankeada: RM no se mezcla con EW/DM. Sin modo (unranked) no se fuerza RM.
  const historyLadder = mode ? ladder : null;
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
    openingsPending: false,
  };
  const errors = [];
  const wait = typeof sleep === 'function' ? sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Aviso TEMPRANO: en cuanto la primera página del historial está parseada ya
  // se pueden pintar las últimas civs y el mapa del rival. Antes se avisaba
  // recién al terminar todo el recorrido de páginas.
  let partialSent = false;
  const sendPartial = () => {
    if (typeof onPartial !== 'function') return;
    partialSent = true;
    onPartial({
      ...base,
      ...result,
      error: errors.length ? errors.join(' · ') : null,
      ladder,
      openings: null,
      pendingOpenings: Boolean(includeOpenings),
      fromCache: false,
    });
  };

  // Las aperturas no dependen del mapa ni de la civ: se piden YA, en paralelo
  // con el historial. Así el total no es historial + ~15s, sino el máximo de
  // ambos, y la estrategia puede estar lista antes de que arranque la partida.
  const openingsPromise = includeOpenings
    ? openingsImpl({
        profileId: id,
        mode,
        cache,
        cacheTtlMs: openingsTtlMs,
        now,
        fetchImpl,
        sleep,
        log,
      }).catch((err) => ({ ok: false, error: `aperturas: ${err.message}` }))
    : null;

  // Primero /stats: la consulta va filtrada por el MISMO ladder/modo de la
  // partida y dice cuántas partidas hay en ESTE mapa en todo el historial.
  // /stats y la PRIMERA página del historial son consultas independientes: se
  // piden A LA VEZ. Antes iban en serie (stats → historial → páginas) y el
  // primer dato del panel esperaba a todas.
  const statsPromise = getJsonImpl(
    `${COMPANION_BASE}/api/profiles/${encodeURIComponent(id)}/stats` +
      `?leaderboard_id=${encodeURIComponent(ladder)}`,
  );

  // Con eso se corta al encontrar todas las del mapa.
  let targetMapGames = Number.POSITIVE_INFINITY;
  let maxPages = MAP_MAX_PAGES;
  const applyStats = (raw) => {
    Object.assign(result, normalizeProfileStats(raw, mapName));
    targetMapGames = result.currentMap ? Number(result.currentMap.games) : 0;
    const total = Number(result.totalGames) || 0;
    if (total > 0) maxPages = Math.min(MAP_MAX_PAGES, Math.ceil(total / MAP_PAGE_SIZE) + 1);
  };

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

    const fetchPage = async (page) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return (await fetchMatchesImpl(id, MAP_PAGE_SIZE, page, historyLadder)) || [];
        } catch (err) {
          const retryable = /HTTP 429/.test(String(err && err.message));
          if (!retryable || attempt === 2) throw err;
          await wait(700 * (attempt + 1));
        }
      }
      return [];
    };

    // Primera página disparada ya: corre en paralelo con /stats.
    const firstPagePromise = fetchPage(1).catch((err) => {
      errors.push(`historial: ${err.message}`);
      return [];
    }).then((page) => {
      // La primera página no debe esperar a /stats para mostrar las civs.
      // El resultado final añade después las cifras completas del mapa.
      result.history = parseRivalHistory(page, id, currentMatchId, { mode });
      result.mapStats = parseMapStats(page, id, currentMatchId, { mode, mapName });
      sendPartial();
      return page;
    });

    try {
      applyStats(await statsPromise);
    } catch (err) {
      errors.push(`stats: ${err.message}`);
    }

    let page = 1;
    let lastPage = await firstPagePromise;
    const historyStartedAt = Date.now();
    add(lastPage);
    result.history = parseRivalHistory(matches, id, currentMatchId, { mode });
    result.mapStats = parseMapStats(matches, id, currentMatchId, { mode, mapName });
    // Con la primera página ya se pintan las últimas civs, el mapa y el
    // winrate: es el aviso que hace que el panel tenga datos al instante.
    sendPartial();

    // El mapa '—' (TG antes de arrancar) no filtra nada: recorrer más páginas
    // no agrega información útil, solo retrasa.
    const mapKnown = Boolean(mapName) && mapName !== '—';
    while (true) {
      // Se corta al juntar TODAS las partidas del mapa que declara /stats, al
      // terminar el historial o al llegar al tope de seguridad. El filtro de
      // modo ya está en parseMapStats.
      if (lastPage.length < MAP_PAGE_SIZE) break;
      if (!mapKnown) break;
      if (result.mapStats && result.mapStats.sampleGames >= targetMapGames) break;
      if (page >= maxPages) break;
      if (Date.now() - historyStartedAt > HISTORY_BUDGET_MS) {
        log(
          `historial del rival #${id}: tope de ${HISTORY_BUDGET_MS / 1000}s ` +
            `con ${matches.length} partidas leídas (${page} páginas)`,
        );
        break;
      }
      await wait(PAGE_DELAY_MS);
      page += 1;
      lastPage = await fetchPage(page);
      if (!add(lastPage)) break;
      result.history = parseRivalHistory(matches, id, currentMatchId, { mode });
      result.mapStats = parseMapStats(matches, id, currentMatchId, { mode, mapName });
    }
  } catch (err) {
    errors.push(`historial: ${err.message}`);
  }

  // El /stats ya se consultó arriba con el ladder EXACTO de la partida: sus
  // partidas/winrate del mapa son del mismo modo (RM ≠ EW ≠ DM).

  if (result.mapStats && result.currentMap) {
    result.mapStats = {
      ...result.mapStats,
      games: result.currentMap.games,
      wins: result.currentMap.wins,
      winRate: result.currentMap.winRate,
      resultGames: result.currentMap.winRate == null ? 0 : result.currentMap.games,
      share: result.currentMap.share,
      sampleGames: result.mapStats.games,
    };
  } else if (!result.mapStats && result.currentMap) {
    result.mapStats = { ...result.currentMap, civ: null, sampleGames: 0 };
  }

  // Si por algún motivo no se avisó dentro del recorrido (0 páginas, caché a
  // medias), el aviso sale igual: civs y mapa listos, aperturas en camino.
  if (!partialSent) sendPartial();

  // Aperturas REALES del MISMO modo de juego (la ladder va como segundo
  // `filter` a AoE2Insights). Tienen su propia cache (30 min) porque
  // reanalizar replays es lento y el histórico se refresca más seguido.
  const applyOpenings = (openings) => {
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
    result.openingsPending = false;
    return { ...base, ...result };
  };

  // Se espera como MUCHO `openingsWaitMs`: el informe no puede quedar colgado
  // de una consulta de ~20 s. Si llega tarde, se avisa por `onOpenings` y el
  // panel repinta esa tarjeta sin mover nada más.
  if (includeOpenings && openingsPromise) {
    const raced = await Promise.race([
      openingsPromise.then((value) => ({ ready: true, value })),
      wait(openingsWaitMs).then(() => ({ ready: false })),
    ]);
    if (raced.ready) {
      applyOpenings(raced.value);
    } else {
      result.openingsPending = true;
      openingsPromise
        .then((late) => {
          if (!late || typeof onOpenings !== 'function') return;
          try {
            onOpenings(applyOpenings(late));
          } catch (err) {
            log(`aperturas tardías #${id}: ${err.message}`);
          }
        })
        .catch(() => {});
    }
  }

  result.error = errors.length ? errors.join(' · ') : null;
  // Un fallo de red NO se cachea: si quedara guardado, el reintento de la
  // pre-partida devolvería el mismo resultado vacío durante 10 minutos.
  // Un informe con aperturas en camino NO se cachea: quedaría 10 minutos
  // diciendo "sin replays" aunque ya hayan llegado. Las aperturas tienen su
  // propia cache de 30 min, así que reconstruirlo es barato.
  if (cache && !result.error && !result.openingsPending) {
    cache.set(key, { ts: now, data: result });
  }
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
  MAP_PAGE_SIZE,
  MAP_MAX_PAGES,
  OPENINGS_WAIT_MS,
  DEFAULT_TTL_MS,
  OPENINGS_TTL_MS,
  opponentsOf,
  needsRivalHistory,
  mergeRivalReport,
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
