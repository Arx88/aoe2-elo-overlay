'use strict';

/**
 * RECOMENDACIONES INTELIGENTES (pre-partida)
 * ===========================================
 *
 * Qué es: al encontrarse la partida (fase `lobby`, antes de entrar al mapa),
 * un consejo CORTO por rival calculado con datos REALES de AoE2Insights
 * (`/stats/api/match-ups/`). Se muestra solo en esa ventana y desaparece
 * apenas la partida arranca (ver el gate `phase === 'lobby'` del renderer).
 *
 * De dónde sale cada número (todo es la misma consulta, formato columna):
 *
 *   match_id               → dedup (una fila por enfrentamiento)
 *   won                    → "Won" / "Not Won" (labels, no booleanos)
 *   map                    → recorte "en ESTE mapa"
 *   map_openness           → fallback "en mapas abiertos/cerrados" si el mapa
 *                            puntual no tiene muestra suficiente
 *   civilization_opponent  → qué civs le ganan al rival (el dato que pidió
 *                            el usuario: "sufrió el 90% contra X civ")
 *   strategy_opponent      → qué aperturas le hacen daño (el reemplazo real
 *                            de "X unidad": no existe dato por unidad en
 *                            ninguna API pública, verificado 2026-11-12)
 *   match_duration         → perfil de ritmo: le va mejor en cortas o largas
 *
 * Reglas de honestidad (igual que el resto del overlay):
 *  - NUNCA se inventa: cada línea muestra su muestra ("pierde 80% · 5 pj").
 *  - Mínimos de muestra por recorte (MIN_*) — abajo de eso no se muestra.
 *  - Si el mapa no tiene muestra se baja al tipo de mapa (abierto/cerrado),
 *    y si tampoco, al modo completo. El alcance usado se declara siempre.
 *  - Sin ladder rankeada (custom/unranked/quickplay) no se mezclan modos:
 *    se devuelve `modeUnavailable` y el panel lo dice.
 *
 * Costo: UNA request por rival por modo (el filtro por ladder va server-side;
 * el recorte por mapa se hace en cliente sobre esas filas). Primera vez ~3-9s
 * (el backend calcula y responde 202), después Varnish + cache local 30 min.
 */

const {
  fetchOpeningRows,
  resolveMode,
  openingShort,
  DEFAULT_TTL_MS,
  DEFAULT_FIELDS,
} = require('./insights');
const { mapKey } = require('./rival');
const { buildCivRecommendation, computeMyMapCivs } = require('./mine');

const SOURCE = 'AoE2Insights · replays analizados';
const ROW_LIMIT = 500;

// Campos de la consulta. `won` llega como label "Won"/"Not Won" (verificado
// en vivo 2026-11-12), no como booleano: isWin() normaliza ambos.
const FIELDS = DEFAULT_FIELDS;

// Mínimos de muestra: un 80% sobre 2 partidas no es un dato, es ruido.
const MIN_SCOPE_GAMES = 6; // recorte (mapa / tipo de mapa) para fiar números
const MIN_CIV_GAMES = 3; // civ rival con menos de 3 partidas no entra
const MIN_OPENING_GAMES = 4; // apertura rival con menos de 4 no entra
const MIN_TEMPO_GAMES = 10; // perfil de duración (cortas + largas)
const MIN_TEMPO_BUCKET = 3; // y cada extremo con al menos 3 partidas
const SHORT_S = 15 * 60; // partida "corta": < 15 min
const LONG_S = 25 * 60; // partida "larga": >= 25 min

const WEAK_MIN_LOSS_RATE = 55; // "le cuesta" = pierde más de la mitad

/**
 * ESTILO DE JUEGO: agresión feudal vs boom. Coste CERO: `strategy` ya se
 * parsea replay por replay en parseScoutRows(), así que no hay request nueva
 * ni endpoint nuevo: son columnas que el overlay Ya descargó y cacheó.
 *
 * La taxonomía es la REAL del endpoint (SHORT_LABELS en src/insights.js):
 * Scout rush, Archer rush, Drush, Drush fast castle, Man at arms rush y
 * Fast castle. NO existe una etiqueta de "Imperial rápido": el boom se mide
 * con Fast castle + match_duration, que es lo que ya usa tempoProfile().
 *
 * `Drush fast castle` se cuenta aparte como HÍBRIDO (presión en Dark Age para
 * llegar a Castillos): meterlo en agresivo o en boom haría mentir el reparto.
 * Un rival 45/40/15 no se puede leer como "es de scouts": por eso acá se
 * devuelve la DISTRIBUCIÓN y no la moda de summarizeOpeningsByMap().
 */
const STYLE_KINDS = {
  'Scout rush': 'agresivo',
  'Archer rush': 'agresivo',
  Drush: 'agresivo',
  'Man at arms rush': 'agresivo',
  'Fast castle': 'boom',
  'Drush fast castle': 'hibrido',
};
const MIN_STYLE_GAMES = 6; // por debajo, el reparto es ruido
// Un 53/47 no es un estilo: etiquetarlo "AGRESIVO 53%" sería exactamente la
// falsa certeza que la distribución venía a corregir. Sin dominancia clara
// se declara MIXTO y se muestra el reparto en vez de una etiqueta.
const STYLE_MIN_DOMINANCE = 60;

/** "Won" | "Not Won" | true | false | "true" | "false" → booleano. */
function isWin(value) {
  const raw = String(value == null ? '' : value).toLowerCase();
  if (value === true || raw === 'true' || raw === 'won') return true;
  if (value === false || raw === 'false' || raw === 'not won') return false;
  return null;
}

/** Civs sin dato o desconocidas no cuentan para el cruce. */
function validCiv(value) {
  const raw = String(value == null ? '' : value).trim();
  return raw && raw.toLowerCase() !== 'unknown' ? raw : null;
}

/** Apertura válida (misma idea que openingName de insights). */
function validStrategy(value) {
  const raw = String(value == null ? '' : value).trim();
  return raw && raw.toLowerCase() !== 'unknown' ? raw : null;
}

/**
 * Columnas → partidas únicas del jugador (perspectiva propia), ordenadas de
 * más nueva a más vieja. `won` es SIEMPRE desde la perspectiva del perfil
 * consultado (verificado: el filtro por player_relic_id devuelve solo filas
 * donde es sujeto).
 */
function parseScoutRows(payload) {
  const rows = (payload && payload.rows) || {};
  const col = (name) => (Array.isArray(rows[name]) ? rows[name] : []);
  const ids = col('match_id');
  const won = col('won');
  const maps = col('map');
  const openness = col('map_openness');
  const civs = col('civilization');
  const oppCivs = col('civilization_opponent');
  const strategies = col('strategy');
  const oppStrategies = col('strategy_opponent');
  const durations = col('match_duration');
  const started = col('started_time');

  const seen = new Map();
  const out = [];
  for (let i = 0; i < ids.length; i += 1) {
    const key = String(ids[i] ?? `row-${i}`);
    const opponent = { oppCiv: validCiv(oppCivs[i]), oppStrategy: validStrategy(oppStrategies[i]) };
    if (seen.has(key)) {
      const existing = seen.get(key);
      if ((opponent.oppCiv || opponent.oppStrategy) && !existing.opponents.some((item) =>
        item.oppCiv === opponent.oppCiv && item.oppStrategy === opponent.oppStrategy)) {
        existing.opponents.push(opponent);
      }
      continue;
    }
    const duration = Number(durations[i]);
    const match = {
      matchId: ids[i] ?? null,
      won: isWin(won[i]),
      map: maps[i] || null,
      openness: openness[i] || null,
      civ: validCiv(civs[i]),
      oppCiv: validCiv(oppCivs[i]),
      strategy: validStrategy(strategies[i]),
      oppStrategy: validStrategy(oppStrategies[i]),
      opponents: opponent.oppCiv || opponent.oppStrategy ? [opponent] : [],
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      startedAt: started[i] || null,
    };
    seen.set(key, match);
    out.push(match);
  }
  return out;
}

/**
 * Recorte a usar: el mapa exacto si tiene muestra; si no, el TIPO de mapa
 * (map_openness del mapa actual, p. ej. mapas abiertos); si no, el modo
 * completo. Devuelve { rows, scope, scopeLabel } con scopeLabel ya listo
 * para mostrar ("en Arabia" / "en mapas abiertos" / "en RM 1v1").
 */
/**
 * `map_openness` llega de AoE2Insights como "Open" / "Semi-Open" / "Closed".
 * Tal cual se imprimía en inglés ("en mapas Closed", que se lee como el
 * nombre de un mapa). Acá se traduce y, si viene un valor desconocido, se
 * devuelve el original en minúsculas en vez de inventar una categoría.
 */
const OPENNESS_LABELS = {
  open: 'abiertos',
  'semi-open': 'semiabiertos',
  semiopen: 'semiabiertos',
  closed: 'cerrados',
  'semi-closed': 'semicerrados',
  mixed: 'mixtos',
  hybrid: 'mixtos',
  water: 'con agua',
  nomad: 'nómades',
};

function opennessLabel(value) {
  const key = String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '-');
  return OPENNESS_LABELS[key] || String(value == null ? '' : value).trim();
}

function pickScope(matches, mapName, mode) {
  const all = Array.isArray(matches) ? matches : [];
  const wanted = mapKey(mapName);
  if (wanted) {
    const onMap = all.filter((row) => mapKey(row.map) === wanted);
    if (onMap.length >= MIN_SCOPE_GAMES) {
      return { rows: onMap, scope: 'map', scopeLabel: `en ${mapName}` };
    }
    // Tipo de mapa del mapa actual (si alguna fila lo declara).
    const openness = (onMap.find((row) => row.openness) || {}).openness || null;
    if (openness) {
      const sameKind = all.filter((row) => row.openness === openness);
      if (sameKind.length >= MIN_SCOPE_GAMES) {
        return {
          rows: sameKind,
          scope: 'openness',
          scopeLabel: `en mapas ${opennessLabel(openness)}`,
        };
      }
    }
  }
  const modeLabel = mode && mode.label ? mode.label : 'este modo';
  return { rows: all, scope: 'mode', scopeLabel: `en ${modeLabel}` };
}

/** % entero o null si no hay denominador. */
function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

/**
 * Civs contra las que el rival PIERDE más seguido en el recorte.
 * Solo entran civs con >= MIN_CIV_GAMES partidas y lossRate > 50%:
 * "le cuesta" significa que pierde más de la mitad, no cualquier número.
 */
function weakAgainst(rows) {
  const byCiv = new Map();
  for (const row of rows) {
    if (typeof row.won !== 'boolean') continue;
    const opponents = Array.isArray(row.opponents) ? row.opponents : [row];
    const civs = new Set(opponents.map((item) => item.oppCiv).filter(Boolean));
    for (const civ of civs) {
      const entry = byCiv.get(civ) || { civ, games: 0, losses: 0 };
      entry.games += 1;
      if (!row.won) entry.losses += 1;
      byCiv.set(civ, entry);
    }
  }
  return [...byCiv.values()]
    .filter((entry) => entry.games >= MIN_CIV_GAMES)
    .map((entry) => ({ ...entry, lossRate: pct(entry.losses, entry.games) }))
    .filter((entry) => entry.lossRate != null && entry.lossRate >= WEAK_MIN_LOSS_RATE)
    .sort((a, b) => b.lossRate - a.lossRate || b.games - a.games)
    .slice(0, 3);
}

/**
 * Aperturas que le hacen daño al rival (strategy_opponent = lo que le jugaron).
 * Primero en el recorte; si ahí no hay muestra, en el modo completo. Cada
 * entrada declara su alcance para que el panel no mienta.
 */
function openingsAgainst(rows, allRows) {
  const collect = (list, scope, minGames) => {
    const byOpening = new Map();
    for (const row of list) {
      if (typeof row.won !== 'boolean') continue;
      const opponents = Array.isArray(row.opponents) ? row.opponents : [row];
      const openings = new Set(opponents.map((item) => item.oppStrategy).filter(Boolean));
      for (const opening of openings) {
        const entry = byOpening.get(opening) || { name: opening, games: 0, losses: 0 };
        entry.games += 1;
        if (!row.won) entry.losses += 1;
        byOpening.set(opening, entry);
      }
    }
    return [...byOpening.values()]
      .filter((entry) => entry.games >= minGames)
      .map((entry) => ({
        ...entry,
        short: openingShort(entry.name) || entry.name,
        lossRate: pct(entry.losses, entry.games),
        scope,
      }))
      // "Le duele" exige una debilidad REAL: un 39 % de derrotas significa
      // que gana el 61 % y no es un consejo, es exactamente lo contrario.
      .filter((entry) => entry.lossRate != null && entry.lossRate >= WEAK_MIN_LOSS_RATE)
      .sort((a, b) => b.lossRate - a.lossRate || b.games - a.games)
      .slice(0, 3);
  };
  const scoped = collect(rows, 'recorte', MIN_CIV_GAMES);
  return scoped.length ? scoped : collect(allRows, 'modo', MIN_OPENING_GAMES);
}

/** Cuenta agresivo / boom / híbrido sobre replays ya parseados. */
function styleDistribution(rows) {
  let aggressive = 0;
  let boom = 0;
  let hybrid = 0;
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const kind = row && row.strategy ? STYLE_KINDS[row.strategy] : null;
    if (!kind) continue;
    if (kind === 'agresivo') aggressive += 1;
    else if (kind === 'boom') boom += 1;
    else hybrid += 1;
    counts.set(row.strategy, (counts.get(row.strategy) || 0) + 1);
  }
  return { aggressive, boom, hybrid, classified: aggressive + boom, counts };
}

/**
 * Reparto AGRESIVO vs BOOM: la señal que reemplaza a la MODA.
 *
 * summarizeOpeningsByMap() devuelve solo la apertura más frecuente: un rival
 * 45 % scouts / 40 % FC / 15 % MAA se pintaba como "Arranca con Scouts", que
 * sugiere una certeza que los datos no tienen. La distribución responde a la
 * decisión real antes del minuto 1: walling + counter preventivo, o eco.
 *
 * Se usa el recorte (mapa -> tipo de mapa -> modo) si tiene muestra y, si no,
 * el modo completo; `scope` viaja al panel para que nunca se disfrace de dato
 * del mapa. Agrupar mapas distintos miente: Arena no se juega como Arabia.
 */
function styleProfile(scopedRows, allRows) {
  let dist = styleDistribution(scopedRows);
  let scope = 'recorte';
  if (dist.classified < MIN_STYLE_GAMES) {
    dist = styleDistribution(allRows);
    scope = 'modo';
  }
  if (dist.classified < MIN_STYLE_GAMES) return null;
  const leading = dist.aggressive >= dist.boom ? 'agresivo' : 'boom';
  const part = leading === 'agresivo' ? dist.aggressive : dist.boom;
  const share = pct(part, dist.classified);
  const mixed = share == null || share < STYLE_MIN_DOMINANCE;
  const top = mixed ? null : [...dist.counts.entries()]
    .filter(([name]) => STYLE_KINDS[name] === leading)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    scope,
    analyzed: dist.classified,
    aggressive: dist.aggressive,
    boom: dist.boom,
    hybrid: dist.hybrid,
    aggressiveShare: pct(dist.aggressive, dist.classified),
    dominant: mixed ? 'mixto' : leading,
    share: mixed ? null : share,
    top: top ? { name: top[0], short: openingShort(top[0]) || top[0], games: top[1] } : null,
  };
}

/**
 * Perfil de ritmo sobre TODAS las partidas del modo (muestra máxima):
 * winrate en partidas cortas vs largas. Sirve para el consejo "cerralo
 * temprano" / "alargá la partida", siempre con los números al lado.
 */
function tempoProfile(allRows) {
  const timed = allRows.filter((row) => row.duration != null && typeof row.won === 'boolean');
  const short = timed.filter((row) => row.duration < SHORT_S);
  const long = timed.filter((row) => row.duration >= LONG_S);
  if (timed.length < MIN_TEMPO_GAMES) return null;
  if (short.length < MIN_TEMPO_BUCKET || long.length < MIN_TEMPO_BUCKET) return null;
  const shortWins = short.filter((row) => row.won).length;
  const longWins = long.filter((row) => row.won).length;
  return {
    shortGames: short.length,
    shortWins,
    shortWinRate: pct(shortWins, short.length),
    longGames: long.length,
    longWins,
    longWinRate: pct(longWins, long.length),
  };
}

/** Recorte completo de un rival a partir de sus partidas ya parseadas. */
function computeTips(matches, options = {}) {
  const { mapName = null, mode = null } = options;
  const scoped = pickScope(matches, mapName, mode);
  const results = scoped.rows.filter((row) => typeof row.won === 'boolean');
  const wins = results.filter((row) => row.won).length;
  return {
    scope: scoped.scope,
    scopeLabel: scoped.scopeLabel,
    sample: scoped.rows.length,
    wins,
    winRate: pct(wins, results.length),
    weakAgainst: weakAgainst(scoped.rows),
    openingsAgainst: openingsAgainst(scoped.rows, matches),
    style: styleProfile(scoped.rows, matches),
    tempo: tempoProfile(matches),
  };
}

function emptyTips(profileId, name, now, options = {}) {
  const { mode = null, modeUnavailable = false, error = null } = options;
  return {
    ok: !error,
    error,
    profileId: profileId != null ? Number(profileId) : null,
    name: name || null,
    source: SOURCE,
    mode: mode ? { ...mode } : null,
    modeUnavailable: Boolean(modeUnavailable),
    totalMatches: 0,
    scope: null,
    scopeLabel: null,
    sample: 0,
    wins: 0,
    winRate: null,
    weakAgainst: [],
    openingsAgainst: [],
    style: null,
    tempo: null,
    recommend: null,
    recommendError: null,
    fetchedAt: now,
    fromCache: false,
  };
}

/**
 * Entrada usada por main.js. Nunca tira excepción: los fallos vuelven como
 * `error` y el panel simplemente no muestra el consejo.
 *
 * La cache guarda las FILAS parseadas por rival+modo (30 min), no el recorte:
 * así dos mapas distintos contra el mismo rival no repiten la consulta.
 */
async function buildScoutTips(options = {}) {
  const {
    profileId,
    name = null,
    mode = null,
    leaderboardId = null,
    mapName = null,
    cache = null,
    cacheTtlMs = DEFAULT_TTL_MS,
    now = Date.now(),
    limit = ROW_LIMIT,
    // Civ recomendada: `myHistoryImpl` lo inyecta main.js (mi historial ya
    // cacheado por src/mine.js, compartido con el head-to-head).
    recommend = false,
    myHistoryImpl = null,
    fetchImpl,
    sleep,
    attempts,
    retryMs,
    onStale = null,
    log = () => {},
  } = options;

  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) {
    return emptyTips(null, name, now, { error: 'perfil inválido' });
  }

  const resolved = mode ? resolveMode(mode) : resolveMode(leaderboardId);
  if (!resolved) {
    // Custom / unranked / quickplay: mismo criterio que las aperturas,
    // no se mezclan modos para rellenar.
    return { ...emptyTips(id, name, now), ok: true, modeUnavailable: true };
  }

  const rowsKey = `scout:rows:v2:${id}:${resolved.id}:${limit}`;
  // No esperar a los replays para empezar el historial propio. H2H comparte
  // la petición en vuelo mediante fetchMyHistory.
  const minePromise = recommend && typeof myHistoryImpl === 'function'
    ? Promise.resolve().then(() => myHistoryImpl()).then((value) => ({ value }), (error) => ({ error }))
    : null;
  const cached = cache && cache.get(rowsKey);
  let rows = null;
  let totalRows = 0;
  let fromCache = false;
  let stale = false;

  if (cached && now - cached.ts > cacheTtlMs && typeof onStale === 'function') {
    const previous = computeTips(cached.rows, { mapName, mode: resolved });
    onStale({ ...emptyTips(id, name, cached.ts, { mode: resolved }), ok: true,
      totalMatches: cached.rows.length, totalRows: cached.totalRows, ...previous,
      fromCache: true, stale: true, provisional: true, recommendPending: recommend });
  }

  if (cached && now - cached.ts <= cacheTtlMs) {
    rows = cached.rows;
    totalRows = cached.totalRows;
    fromCache = true;
  } else {
    try {
      const payload = await fetchOpeningRows(id, {
        limit,
        mode: resolved,
        fields: FIELDS,
        fetchImpl,
        sleep,
        attempts,
        retryMs,
      });
      rows = parseScoutRows(payload);
      totalRows = Number(payload && payload.count) || rows.length;
      if (cache) cache.set(rowsKey, { ts: now, rows, totalRows });
    } catch (err) {
      if (cached) {
        rows = cached.rows;
        totalRows = cached.totalRows;
        fromCache = true;
        stale = true;
        log(`scout #${id} [${resolved.label}]: red caída, uso filas anteriores (${err.message})`);
      } else {
        log(`scout #${id} [${resolved.label}] no disponible: ${err.message}`);
        return emptyTips(id, name, now, { mode: resolved, error: err.message });
      }
    }
  }

  const tips = computeTips(rows, { mapName, mode: resolved });
  const result = {
    ...emptyTips(id, name, now, { mode: resolved }),
    ok: true,
    totalMatches: rows.length,
    totalRows,
    ...tips,
    fromCache,
    stale,
    fetchedAt: fromCache && cached ? cached.ts : now,
  };

  // Civ recomendada: cruza lo que le cuesta al rival (weakAgainst, arriba)
  // con MI winrate con cada civ en este mapa. El fallo no tira el consejo.
  if (recommend) {
    if (typeof myHistoryImpl === 'function') {
      try {
        const outcome = await minePromise;
        if (outcome.error) throw outcome.error;
        const mine = outcome.value;
        if (mine.error) throw new Error(mine.error);
        result.recommend = buildCivRecommendation({
          weakAgainst: tips.weakAgainst,
          myCivs: computeMyMapCivs(mine.rows, mapName),
        });
      } catch (err) {
        result.recommendError = err.message;
        log(`scout #${id}: civ recomendada no disponible (${err.message})`);
      }
    } else {
      result.recommendError = 'sin historial propio';
    }
  }

  log(
    `scout #${id} [${resolved.label}]: ${rows.length} partidas · recorte ${result.scopeLabel} ` +
      `(${result.sample} pj, ${result.winRate == null ? '—' : `${result.winRate}%`}) · ` +
      `${result.weakAgainst.length} civs difíciles · ${result.openingsAgainst.length} aperturas que le duelen` +
      (result.style ? ` · estilo ${result.style.dominant}${result.style.share == null ? '' : ` ${result.style.share}%`} de ${result.style.analyzed} replays` : '') +
      (result.recommend ? ` · ${result.recommend.length} civs recomendadas` : ''),
  );
  return result;
}

/** Una primera muestra llega antes; la completa nunca es reemplazada por una
 * respuesta corta tardía. Si la completa falla, conserva la muestra válida. */
async function progressiveScout(options, onPartial, build = buildScoutTips) {
  const mode = options.mode ? resolveMode(options.mode) : resolveMode(options.leaderboardId);
  const key = `scout:rows:v2:${Number(options.profileId)}:${mode ? mode.id : 'sin-modo'}:${options.limit ?? ROW_LIMIT}`;
  const cached = options.cache && options.cache.get(key);
  const now = options.now ?? Date.now();
  if (cached && now - cached.ts <= (options.cacheTtlMs ?? DEFAULT_TTL_MS)) return build(options);
  let fullDone = false;
  const full = build({ ...options, onStale: (initial) => {
    if (!fullDone && typeof onPartial === 'function') onPartial(initial);
  } });
  const quick = build({ ...options, limit: 60, onStale: null }).then((initial) => {
    if (!fullDone && initial && !initial.error && typeof onPartial === 'function') {
      onPartial({ ...initial, provisional: true });
    }
    return initial;
  }).catch(() => null);
  let result;
  try {
    result = await full;
  } catch (error) {
    fullDone = true;
    const initial = await quick;
    if (initial && !initial.error) return { ...initial, provisional: false, limited: true };
    throw error;
  }
  fullDone = true;
  if (result && (result.error || result.stale)) {
    const initial = await quick;
    if (initial && !initial.error && (!result.stale || Number(initial.fetchedAt) > Number(result.fetchedAt))) {
      return { ...initial, provisional: false, limited: true };
    }
  }
  return result;
}

module.exports = {
  SOURCE,
  FIELDS,
  ROW_LIMIT,
  OPENNESS_LABELS,
  opennessLabel,
  MIN_SCOPE_GAMES,
  MIN_CIV_GAMES,
  MIN_OPENING_GAMES,
  MIN_TEMPO_GAMES,
  SHORT_S,
  LONG_S,
  isWin,
  parseScoutRows,
  pickScope,
  computeTips,
  weakAgainst,
  openingsAgainst,
  STYLE_KINDS,
  MIN_STYLE_GAMES,
  STYLE_MIN_DOMINANCE,
  styleDistribution,
  styleProfile,
  tempoProfile,
  emptyTips,
  buildScoutTips,
  progressiveScout,
};
