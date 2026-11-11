'use strict';

/**
 * APERTURAS REALES del rival, tomadas de AoE2Insights.
 *
 * Por qué existe este módulo
 * --------------------------
 * AoE2 Companion (la fuente del ELO y del historial) NO publica la apertura
 * de una partida: /api/matches solo traja roster, civ, mapa y resultado.
 * AoE2Insights SÍ la publica porque analiza los `.aoe2record` (replays) y
 * detecta la estrategia de cada jugador. En su perfil se ve literalmente
 * "Strategy charts: based on the openings detected in analysed replays".
 *
 * El endpoint público y sin API key es:
 *
 *   GET https://www.aoe2insights.com/stats/api/match-ups/
 *       ?field=strategy&field=match_id&field=started_time&field=civilization
 *       &field=map&field=ladder&field=player_name
 *       &filter={"field":"player_relic_id","operator":"equals","value":"<id>"}
 *       &order=-started_time&limit=120
 *
 * `player_relic_id` es EXACTAMENTE el `profileId` que usa AoE2 Companion,
 * así que no hace falta mapear ni adivinar el usuario de AoE2Insights.
 * `strategy` trae etiquetas reales: "Scout rush", "Archer rush", "Drush",
 * "Drush fast castle", "Man at arms rush", "Fast castle" (o null cuando
 * ese replay todavía no fue analizado).
 *
 * Detalles del backend que este módulo maneja:
 *  - `rows` viene en formato COLUMNA (cada campo es un array), no filas.
 *  - `match-ups` tiene UNA FILA POR ENFRENTAMIENTO: en 4v4 la misma partida
 *    aparece 4 veces. Hay que deduplicar por `match_id` antes de contar.
 *  - La primera consulta suele responder `202 {"pending":true}` con
 *    `retry-after: 3`: el backend la calcula en background. Reintentamos.
 *  - Las consultas ya calculadas quedan cacheadas en Varnish y responden 200
 *    al instante. Además guardamos 30 min en la cache local del overlay.
 *
 * NO hay ninguna inferencia por civilización ni guía genérica: si el rival no
 * tiene replays analizados, se devuelve `analyzed: 0` y el panel lo dice.
 *
 * COHERENCIA CON EL MODO DE JUEGO (pedido explícito del usuario)
 * -------------------------------------------------------------
 * EW no se juega como RM: no tiene sentido contar Drush / Scout rush de una
 * partida de RM 1v1 para predecir cómo va a abrir el rival en EW 1v1 (ni al
 * revés). El campo `ladder` de match-ups es un Enum con IDs numéricos:
 *
 *   1 DM 1v1 · 2 DM Team · 3 RM 1v1 · 4 RM Team · 13 EW 1v1 · 14 EW Team
 *   15..18 variantes (Controller) · 25/26 Return of Rome · 27/28 Reinado
 *   0 Unranked · -1 Unknown
 *
 * Se agrega un SEGUNDO `filter` a la consulta con el ID exacto del ladder de
 * la partida en curso, así el backend ya devuelve solo replays de ese modo:
 *
 *   &filter={"field":"ladder","operator":"equals","value":"13"}
 *
 * (el valor debe ser el ID numérico como string; con la etiqueta "EW 1v1" o
 * con `operator:"in"` el endpoint responde 404). Además se filtra en cliente
 * por `ladder` como red de seguridad, se separa la cache por modo y, si la
 * partida no tiene ladder rankeado, NO se consulta nada en vez de mezclar.
 */

const BASE = process.env.AOE_INSIGHTS_BASE || 'https://www.aoe2insights.com';
const MATCH_UPS_PATH = '/stats/api/match-ups/';

// Cloudflare deja pasar la API con un UA de navegador pero bloquea el de Node.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const ROW_LIMIT = 120; // filas de match-ups (se deduplican por partida)
const RECENT_LIMIT = 5; // aperturas recientes que se pintan
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const DEFAULT_RETRY_MS = 3000;
const REQUEST_TIMEOUT_MS = 15000;

const SOURCE = 'AoE2Insights · aperturas detectadas en replays analizados';

/**
 * Ladders rankeadas de AoE2Insights (GET /stats/api/match-ups/ -> fields).
 * `group` separa las familias de juego: RM / EW / DM / RoR / evento.
 * 0 (Unranked) y -1 (Unknown) quedan FUERA a propósito: en una partida sin
 * ladder no se puede saber si fue RM o EW, así que no se muestra ninguna
 * apertura en lugar de mezclar modos.
 */
const LADDER_MODES = {
  1: { id: 1, key: 'dm_1v1', label: 'DM 1v1', group: 'dm', size: '1v1' },
  2: { id: 2, key: 'dm_team', label: 'DM Team', group: 'dm', size: 'team' },
  3: { id: 3, key: 'rm_1v1', label: 'RM 1v1', group: 'rm', size: '1v1' },
  4: { id: 4, key: 'rm_team', label: 'RM Team', group: 'rm', size: 'team' },
  13: { id: 13, key: 'ew_1v1', label: 'EW 1v1', group: 'ew', size: '1v1' },
  14: { id: 14, key: 'ew_team', label: 'EW Team', group: 'ew', size: 'team' },
  15: { id: 15, key: 'rm_1v1_controller', label: 'RM 1v1 (Controller)', group: 'rm', size: '1v1' },
  16: { id: 16, key: 'rm_team_controller', label: 'RM Team (Controller)', group: 'rm', size: 'team' },
  17: { id: 17, key: 'ew_1v1_controller', label: 'EW 1v1 (Controller)', group: 'ew', size: '1v1' },
  18: { id: 18, key: 'ew_team_controller', label: 'EW Team (Controller)', group: 'ew', size: 'team' },
  25: { id: 25, key: 'ror_1v1', label: 'Return of Rome 1v1', group: 'ror', size: '1v1' },
  26: { id: 26, key: 'ror_team', label: 'Return of Rome Team', group: 'ror', size: 'team' },
  27: { id: 27, key: 'reinado', label: 'Red Bull Wololo: El Reinado', group: 'event', size: null },
  28: { id: 28, key: 'reinado_controller', label: 'Red Bull Wololo: El Reinado (Controller)', group: 'event', size: null },
};

/** Enums de AoE2 Companion / IDs numéricos -> ladder de AoE2Insights. */
const MODE_KEYS = Object.fromEntries(
  Object.values(LADDER_MODES).map((mode) => [mode.key, mode.id]),
);

/** Etiqueta que devuelve la columna `ladder` -> ladder de AoE2Insights. */
const LABEL_IDS = Object.fromEntries(
  Object.values(LADDER_MODES).map((mode) => [mode.label.toLowerCase(), mode.id]),
);

/**
 * Resuelve el modo de la partida en curso. Acepta el `leaderboardId` de
 * AoE2 Companion (numérico o enum), un descriptor ya resuelto, o la etiqueta
 * de AoE2Insights. Devuelve `null` para custom / quickplay / unranked.
 */
function resolveMode(value) {
  if (value && typeof value === 'object') {
    if (LADDER_MODES[Number(value.id)]) return { ...LADDER_MODES[Number(value.id)] };
    return resolveMode(value.key || value.label);
  }
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return null;
  const id = MODE_KEYS[raw] != null ? MODE_KEYS[raw] : Number(raw);
  if (LADDER_MODES[id]) return { ...LADDER_MODES[id] };
  const byLabel = LABEL_IDS[raw];
  return byLabel != null ? { ...LADDER_MODES[byLabel] } : null;
}

function ladderMode(label) {
  const id = LABEL_IDS[String(label == null ? '' : label).trim().toLowerCase()];
  return id != null ? LADDER_MODES[id] : null;
}

/** Solo el ladder EXACTO del partido: nada de RM para predecir EW. */
function sameMode(rowLadder, mode) {
  if (!mode) return true; // compatibilidad con las pruebas unitarias puras
  const row = ladderMode(rowLadder);
  return Boolean(row && row.id === mode.id);
}

function openingsCacheKey(profileId, mode) {
  return `rival:openings:${Number(profileId)}:${mode ? mode.id : 'sin-modo'}`;
}

/** Etiquetas compactas para el overlay. El nombre original se conserva. */
const SHORT_LABELS = {
  'Scout rush': 'Scouts',
  'Archer rush': 'Archer rush',
  Drush: 'Drush',
  'Drush fast castle': 'Drush → FC',
  'Man at arms rush': 'MAA rush',
  'Fast castle': 'FC',
};

function openingName(value) {
  const text = String(value == null ? '' : value).trim();
  return text && text.toLowerCase() !== 'unknown' ? text : null;
}

function openingShort(name) {
  return (name && SHORT_LABELS[name]) || name || null;
}

/** URL exacta de la consulta. Expuesta para el selftest. */
function buildMatchUpsUrl(profileId, limit = ROW_LIMIT, mode = null) {
  const params = new URLSearchParams();
  for (const field of [
    'strategy',
    'match_id',
    'started_time',
    'civilization',
    'map',
    'ladder',
    'player_name',
  ]) {
    params.append('field', field);
  }
  params.append(
    'filter',
    JSON.stringify({
      field: 'player_relic_id',
      operator: 'equals',
      value: String(profileId),
    }),
  );
  // Segundo filtro: solo replays de la ladder EXACTA de la partida (EW no
  // se juega como RM, y el backend los separa por el ID numérico del enum).
  if (mode) {
    params.append(
      'filter',
      JSON.stringify({
        field: 'ladder',
        operator: 'equals',
        value: String(mode.id),
      }),
    );
  }
  params.append('order', '-started_time');
  params.append('limit', String(limit));
  return `${BASE}${MATCH_UPS_PATH}?${params.toString()}`;
}

function retryDelay(response, fallback) {
  const raw = response && response.headers && response.headers.get
    ? response.headers.get('retry-after')
    : null;
  const secs = Number(raw);
  return Number.isFinite(secs) && secs > 0 ? Math.min(8000, secs * 1000) : fallback;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Consulta el endpoint y devuelve el JSON crudo. Maneja el 202 asíncrono con
 * reintentos acotados; `fetchImpl` / `sleep` se inyectan en los tests.
 */
async function fetchOpeningRows(profileId, options = {}) {
  const {
    limit = ROW_LIMIT,
    mode = null,
    fetchImpl = globalThis.fetch,
    attempts = MAX_ATTEMPTS,
    retryMs = DEFAULT_RETRY_MS,
    timeoutMs = REQUEST_TIMEOUT_MS,
    sleep = defaultSleep,
  } = options;
  const url = buildMatchUpsUrl(profileId, limit, mode);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 202) {
      if (attempt + 1 < attempts) await sleep(retryDelay(response, retryMs));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} en AoE2Insights`);
    return response.json();
  }
  throw new Error('AoE2Insights dejó la consulta pendiente demasiado tiempo');
}

/**
 * Convierte las columnas en partidas únicas y calcula la apertura más usada.
 * Solo cuentan las partidas con `strategy` REAL (replay analizado).
 *
 * Con `mode` definido se filtra por la ladder EXACTA de la partida en curso
 * (defensa en profundidad: el servidor ya lo hace con el segundo `filter`,
 * pero si la API cambiara, aquí no se mezclan modos). `discardedOtherModes`
 * cuenta las partidas de otros modos que NO se usaron: sirve para explicar
 * en el panel por qué la muestra es más chica sin inventar aperturas.
 */
function parseOpeningRows(payload, options = {}) {
  const { recentLimit = RECENT_LIMIT, mode = null } = options;
  const rows = (payload && payload.rows) || {};
  const col = (name) => (Array.isArray(rows[name]) ? rows[name] : []);
  const ids = col('match_id');
  const strategies = col('strategy');
  const civs = col('civilization');
  const maps = col('map');
  const ladders = col('ladder');
  const started = col('started_time');
  const names = col('player_name');

  const seen = new Set();
  const unique = [];
  for (let i = 0; i < ids.length; i += 1) {
    const key = String(ids[i] ?? `row-${i}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = openingName(strategies[i]);
    unique.push({
      matchId: ids[i] ?? null,
      strategy: name,
      short: openingShort(name),
      civ: civs[i] || null,
      map: maps[i] || null,
      ladder: ladders[i] || null,
      startedAt: started[i] || null,
      playerName: names[i] || null,
    });
  }

  const modeMatches = mode ? unique.filter((match) => sameMode(match.ladder, mode)) : unique;
  const analyzed = modeMatches.filter((match) => match.strategy);
  const counts = new Map();
  for (const match of analyzed) {
    counts.set(match.strategy, (counts.get(match.strategy) || 0) + 1);
  }
  const ranking = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      name,
      short: openingShort(name),
      count,
      share: analyzed.length ? Math.round((count / analyzed.length) * 100) : 0,
    }));

  return {
    source: SOURCE,
    fromReplays: true,
    mode: mode ? { ...mode } : null,
    uniqueMatches: modeMatches.length,
    discardedOtherModes: unique.length - modeMatches.length,
    analyzed: analyzed.length,
    totalRows: Number(payload && payload.count) || 0,
    // Detalle usado por src/rival.js para resumir la estrategia por mapa/civ.
    // Se conserva en la cache de aperturas y no viaja al renderer.
    analyzedMatches: analyzed.map((match) => ({
      matchId: match.matchId,
      strategy: match.strategy,
      short: match.short,
      civ: match.civ,
      map: match.map,
      ladder: match.ladder,
      startedAt: match.startedAt,
    })),
    recent: analyzed.slice(0, recentLimit),
    ranking: ranking.slice(0, 3),
    favorite: ranking.length ? ranking[0] : null,
  };
}

/** Resultado vacío y consistente, incluso si la red falla. */
function emptyOpenings(profileId, now, error, options = {}) {
  const { mode = null, modeUnavailable = false } = options;
  return {
    ok: false,
    error: error || null,
    profileId,
    fetchedAt: now,
    source: SOURCE,
    fromReplays: true,
    mode: mode ? { ...mode } : null,
    modeUnavailable: Boolean(modeUnavailable),
    uniqueMatches: 0,
    discardedOtherModes: 0,
    analyzed: 0,
    totalRows: 0,
    recent: [],
    ranking: [],
    favorite: null,
    fromCache: false,
  };
}

/**
 * Entrada usada por `src/rival.js`. Nunca tira excepción: los fallos se
 * devuelven como `error` para que el overlay siga mostrando el ELO.
 *
 * `mode` (descriptor de resolveMode) o `leaderboardId` (del partido en curso)
 * deciden la ladder EXACTA a consultar. Sin modo resoluble (custom, lobby,
 * quickplay, unranked) NO se hace ninguna request: se devuelve
 * `modeUnavailable: true` y el panel lo aclara en vez de mezclar modos.
 */
async function buildRivalOpenings(options = {}) {
  const {
    profileId,
    cache = null,
    cacheTtlMs = DEFAULT_TTL_MS,
    now = Date.now(),
    limit = ROW_LIMIT,
    fetchImpl,
    sleep,
    attempts,
    retryMs,
    log = () => {},
  } = options;

  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) return emptyOpenings(null, now, 'perfil inválido');

  // `mode` explícito tiene prioridad; si no vino, se resuelve del leaderboard.
  const mode = Object.prototype.hasOwnProperty.call(options, 'mode')
    ? resolveMode(options.mode)
    : resolveMode(options.leaderboardId);

  if (!mode) {
    log(`aperturas #${id}: la partida no tiene ladder rankeada; no se mezclan modos`);
    return {
      ...emptyOpenings(id, now, null),
      ok: true,
      error: null,
      modeUnavailable: true,
    };
  }

  const key = openingsCacheKey(id, mode);
  const cached = cache && cache.get(key);
  if (cached && now - cached.ts <= cacheTtlMs) {
    return { ...cached.data, fromCache: true };
  }

  try {
    const payload = await fetchOpeningRows(id, {
      limit,
      mode,
      fetchImpl,
      sleep,
      attempts,
      retryMs,
    });
    const parsed = parseOpeningRows(payload, { mode });
    const result = {
      ok: true,
      error: null,
      profileId: id,
      fetchedAt: now,
      ...parsed,
      fromCache: false,
    };
    if (cache) cache.set(key, { ts: now, data: result });
    log(
      `aperturas reales #${id} [${mode.label}]: ${result.analyzed} replays analizados` +
        (result.favorite ? ` · más usada ${result.favorite.name} (${result.favorite.share}%)` : ''),
    );
    return result;
  } catch (err) {
    // Si la red cae pero había datos previos, seguimos mostrando esos.
    if (cached) {
      log(`aperturas #${id} [${mode.label}]: red caída, uso datos anteriores (${err.message})`);
      return { ...cached.data, fromCache: true, error: err.message };
    }
    log(`aperturas #${id} [${mode.label}] no disponibles: ${err.message}`);
    return emptyOpenings(id, now, err.message, { mode });
  }
}

function hasCachedOpenings(cache, profileId, mode, now = Date.now(), cacheTtlMs = DEFAULT_TTL_MS) {
  if (!cache) return false;
  const entry = cache.get(openingsCacheKey(profileId, mode));
  return Boolean(entry && now - entry.ts <= cacheTtlMs);
}

module.exports = {
  BASE,
  SOURCE,
  ROW_LIMIT,
  RECENT_LIMIT,
  DEFAULT_TTL_MS,
  SHORT_LABELS,
  LADDER_MODES,
  MODE_KEYS,
  openingName,
  openingShort,
  resolveMode,
  ladderMode,
  sameMode,
  openingsCacheKey,
  buildMatchUpsUrl,
  fetchOpeningRows,
  parseOpeningRows,
  emptyOpenings,
  buildRivalOpenings,
  hasCachedOpenings,
};
