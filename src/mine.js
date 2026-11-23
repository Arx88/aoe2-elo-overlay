'use strict';

/**
 * MI HISTORIAL: la base compartida de dos opciones de lobby.
 *
 *  - Head-to-Head (`rivalH2H`): cuántas veces jugaste CONTRA este rival y
 *    cómo te fue (V-D), del propio historial de AoE2 Companion.
 *  - Civ recomendada (`civRecommender`): tu winrate con cada civ EN EL MAPA
 *    de la partida, para cruzarlo con lo que le cuesta al rival.
 *
 * Una sola descarga paginada (`fetchMyHistory`) alimenta las dos: se cachea
 * 30 min por perfil+modo en el `statsCache` compartido, así que pedir H2H y
 * recomendación en la misma partida NO duplica la consulta.
 *
 * Conteo honesto, igual que el resto del overlay:
 *  - "Cara a cara" cuenta SOLO partidas en equipos opuestos. Las que jugaron
 *    como ALIADOS no son enfrentamientos: se informan aparte (`asAllies`).
 *  - Si los equipos no se pueden distinguir, se asume enfrentamiento (en 1v1
 *    es imposible que sean aliados).
 *  - La partida en curso se descarta (`currentMatchId`): jugarla no es
 *    "historial".
 */

const { fetchMatches } = require('./aoe');
const { civSlug } = require('./civs');
const { CIV_GUIDE } = require('./civ-guide');
const { mapKey, resolveMode, statsLadder } = require('./rival');

const PAGE_SIZE = 100;
const MAX_PAGES = 6; // ~600 partidas recientes: suficiente para H2H y civs
const PAGE_DELAY_MS = 120; // evita ráfagas que terminan en HTTP 429
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MIN_MY_CIV_GAMES = 3; // mi winrate con una civ abajo de 3 partidas es ruido

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

function mineCacheKey(profileId, leaderboardId) {
  const mode = resolveMode(leaderboardId);
  return `mine:${Number(profileId)}:${mode ? mode.id : 'sin-modo'}`;
}

/**
 * Normalized match → fila del historial PROPIO. Conserva el roster completo
 * (perfil + equipo) de cada partida para poder distinguir rivales de aliados.
 */
function parseMyHistory(matches, myId, currentMatchId) {
  const id = Number(myId);
  const rows = [];
  for (const match of Array.isArray(matches) ? matches : []) {
    if (!match || match.ongoing) continue;
    if (currentMatchId != null && Number(match.matchId) === Number(currentMatchId)) continue;
    const me = (match.players || []).find((p) => Number(p.profileId) === id);
    if (!me) continue;
    rows.push({
      matchId: match.matchId,
      mapName: match.mapName || '—',
      leaderboardId: match.leaderboardId != null ? match.leaderboardId : null,
      leaderboardName: match.leaderboardName || '',
      civ: me.civ || null,
      slug: me.civ ? civSlug(me.civ) : null,
      won: typeof me.won === 'boolean' ? me.won : null,
      rating: Number.isFinite(Number(me.matchRating ?? me.rating)) ? Number(me.matchRating ?? me.rating) : null,
      ratingDiff: Number.isFinite(Number(me.matchRatingDiff ?? me.ratingDiff)) ? Number(me.matchRatingDiff ?? me.ratingDiff) : null,
      startedAt: match.startedAt || null,
      myTeam: me.team != null ? Number(me.team) : null,
      players: (match.players || []).map((p) => ({
        profileId: Number(p.profileId),
        team: p.team != null ? Number(p.team) : null,
        won: typeof p.won === 'boolean' ? p.won : null,
      })),
    });
  }
  rows.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return rows;
}

/**
 * Descarga paginada de MI historial en el MODO de la partida (RM no se mezcla
 * con EW). Cache de filas ya parseadas; el corte de páginas es solo una red
 * de seguridad igual que en el informe del rival.
 */
// Comparte también la petición en vuelo: H2H y la recomendación pueden
// arrancar a la vez, antes de que exista una entrada en la caché.
const historyInFlight = new WeakMap();
async function fetchMyHistory(options = {}) {
  const cache = options.cache;
  const withoutCurrent = (result) => {
    if (options.currentMatchId == null || !Array.isArray(result.rows)) return result;
    return { ...result, rows: result.rows.filter((row) => String(row.matchId) !== String(options.currentMatchId)) };
  };
  if (!cache || (typeof cache !== 'object' && typeof cache !== 'function')) {
    return withoutCurrent(await fetchMyHistoryImpl(options));
  }
  let pending = historyInFlight.get(cache);
  if (!pending) {
    pending = new Map();
    historyInFlight.set(cache, pending);
  }
  const key = mineCacheKey(Number(options.profileId), options.leaderboardId);
  if (pending.has(key)) return withoutCurrent(await pending.get(key));
  const request = fetchMyHistoryImpl(options);
  pending.set(key, request);
  try {
    return withoutCurrent(await request);
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}

async function fetchMyHistoryImpl(options = {}) {
  const {
    profileId,
    leaderboardId = null,
    currentMatchId = null,
    cache = null,
    cacheTtlMs = DEFAULT_TTL_MS,
    now = Date.now(),
    maxPages = MAX_PAGES,
    fetchMatchesImpl = fetchMatches,
    sleep,
    log = () => {},
  } = options;

  const id = Number(profileId);
  if (!Number.isFinite(id) || id <= 0) {
    return { profileId: null, rows: [], fromCache: false, error: 'perfil inválido' };
  }

  const key = mineCacheKey(id, leaderboardId);
  const cached = cache && cache.get(key);
  if (cached && now - cached.ts <= cacheTtlMs) {
    return { profileId: id, rows: cached.rows, fromCache: true, error: null };
  }

  const wait = typeof sleep === 'function'
    ? sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Mismo filtro por ladder EXACTO que el informe del rival: sin modo
  // rankeado no se fuerza ninguno (no se mezclan modos para rellenar).
  const mode = resolveMode(leaderboardId);
  const ladder = mode ? statsLadder(leaderboardId) : null;

  const fetchPage = async (page) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return (await fetchMatchesImpl(id, PAGE_SIZE, page, ladder, { priority: 'own' })) || [];
      } catch (err) {
        const retryable = /HTTP 429/.test(String(err && err.message));
        if (!retryable || attempt === 2) throw err;
        await wait(700 * (attempt + 1));
      }
    }
    return [];
  };

  try {
    const matches = [];
    const seen = new Set();
    // Delta Sync incremental: si ya tenemos historial cacheado, recordamos los matchId ya asentados
    // (con resultado booleano confirmado y ratingDiff presente o partida de hace > 30 min).
    // Apenas la página 1 alcanza un matchId ya asentado, cortamos la paginación (1 request en vez de 6)
    // y fusionamos monotónicamente con las filas previas.
    const priorRows = (cached && Array.isArray(cached.rows)) ? cached.rows : [];
    const settledPriorIds = new Set();
    for (const r of priorRows) {
      if (!r || r.matchId == null) continue;
      const isOutcomeSettled = typeof r.won === 'boolean';
      const isRatingSettled = r.leaderboardId == null || r.ratingDiff != null || (r.startedAt && (now - r.startedAt > 30 * 60 * 1000));
      if (isOutcomeSettled && isRatingSettled) {
        settledPriorIds.add(String(r.matchId));
      }
    }
    let hitSettledHistory = false;

    const add = (list) => {
      const before = matches.length;
      for (const match of Array.isArray(list) ? list : []) {
        const matchKey = match && match.matchId != null ? String(match.matchId) : null;
        if (matchKey && settledPriorIds.has(matchKey)) {
          hitSettledHistory = true;
        }
        if (matchKey && seen.has(matchKey)) continue;
        if (matchKey) seen.add(matchKey);
        matches.push(match);
      }
      return matches.length - before;
    };

    let page = 0;
    while (true) {
      page += 1;
      if (page > 1) await wait(PAGE_DELAY_MS);
      const lastPage = await fetchPage(page);
      if (!add(lastPage)) break;
      if (hitSettledHistory) break;
      if (lastPage.length < PAGE_SIZE) break;
      if (page >= maxPages) break;
    }

    // La exclusión de la partida actual es por consumidor, no por caché: así
    // una precarga de cola puede compartirse con el informe del match.
    const freshRows = parseMyHistory(matches, id, null);
    let rows = freshRows;
    if (priorRows.length > 0 && hitSettledHistory) {
      const mergedMap = new Map();
      for (const r of priorRows) {
        if (r && r.matchId != null) mergedMap.set(String(r.matchId), r);
      }
      for (const r of freshRows) {
        if (!r || r.matchId == null) continue;
        const k = String(r.matchId);
        const prev = mergedMap.get(k);
        mergedMap.set(k, prev ? {
          ...prev,
          ...r,
          won: typeof r.won === 'boolean' ? r.won : prev.won,
          rating: r.rating != null ? r.rating : prev.rating,
          ratingDiff: r.ratingDiff != null ? r.ratingDiff : prev.ratingDiff,
        } : r);
      }
      rows = [...mergedMap.values()]
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        .slice(0, maxPages * PAGE_SIZE);
    }
    let fullMatches = matches;
    if (priorRows.length > 0 && hitSettledHistory && Array.isArray(cached?.matches)) {
      const mMap = new Map();
      for (const m of cached.matches) {
        if (m && m.matchId != null) mMap.set(String(m.matchId), m);
      }
      for (const m of matches) {
        if (m && m.matchId != null) mMap.set(String(m.matchId), m);
      }
      fullMatches = [...mMap.values()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, maxPages * PAGE_SIZE);
    }
    if (cache) cache.set(key, { ts: now, at: now, rows, matches: fullMatches });
    log(`mi historial (#${id}): ${rows.length} partidas del modo en ${page} página(s)${hitSettledHistory ? ' (delta sync)' : ''}`);
    return { profileId: id, rows, fromCache: false, error: null };
  } catch (err) {
    log(`mi historial (#${id}) falló: ${err.message}`);
    return { profileId: id, rows: [], fromCache: false, error: err.message };
  }
}

/**
 * CARA A CARA contra un rival: solo partidas en equipos opuestos. Las de
 * mismo equipo van a `asAllies` y no cuentan ni como victoria ni derrota.
 *
 * `recent` trae los últimos 3 enfrentamientos (mi civ, resultado y mapa):
 * el V-D solo es un número, los chips cuentan la historia.
 */
function computeH2H(rows, rivalProfileId) {
  const rivalId = Number(rivalProfileId);
  let games = 0;
  let wins = 0;
  let losses = 0;
  let asAllies = 0;
  let unresolved = 0;
  let unknownResult = 0;
  let lastMatch = null;
  const recent = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const rival = (row.players || []).find((p) => p.profileId === rivalId);
    if (!rival) continue;
    const teamsKnown = row.myTeam != null && rival.team != null &&
      Number.isFinite(Number(row.myTeam)) && Number.isFinite(Number(rival.team));
    if (!teamsKnown && (row.players || []).length !== 2) {
      unresolved += 1;
      continue;
    }
    const sameTeam = teamsKnown && Number(row.myTeam) === Number(rival.team);
    if (sameTeam) {
      asAllies += 1;
      continue;
    }
    games += 1;
    if (row.won === true) wins += 1;
    else if (row.won === false) losses += 1;
    else unknownResult += 1;
    if (!lastMatch) {
      lastMatch = {
        mapName: row.mapName,
        startedAt: row.startedAt,
        won: row.won,
      };
    }
    // Las filas llegan de más nueva a más vieja: los primeros 3 son los últimos.
    if (recent.length < 3) {
      recent.push({
        civ: row.civ,
        slug: row.slug,
        won: row.won,
        mapName: row.mapName,
      });
    }
  }

  return {
    games,
    wins,
    losses,
    asAllies,
    unresolved,
    unknownResult,
    lastMatch,
    recent,
  };
}

/**
 * Mi winrate con cada civ para el mapa de la partida, con CASCADA honesta:
 *
 *  - scope 'map'  → la civ tiene ≥ MIN_MY_CIV_GAMES en EL MAPA exacto: el dato
 *    ideal ("vos 67% en Arabia").
 *  - scope 'mode' → en el mapa no llega a la muestra, cae al MODO completo
 *    para esa civ (si ahí también llega al mínimo). La entrada lo DECLARA:
 *    un 3-0 de suerte en el mapa no se disfraza de winrate del mapa.
 *
 * Devuelve una entrada por civ (la mejor evidencia que tenga), ordenadas por
 * partidas; el cruce final lo hace buildCivRecommendation.
 */
function computeMyMapCivs(rows, mapName, options = {}) {
  const { allowModeFallback = true, modeLabel = 'este modo', scope = null } = options;
  const wanted = mapKey(mapName);
  const byCiv = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row.civ || typeof row.won !== 'boolean') continue;
    const key = row.slug || row.civ;
    const entry =
      byCiv.get(key) ||
      { civ: row.civ, slug: row.slug, mapGames: 0, mapWins: 0, modeGames: 0, modeWins: 0 };
    entry.modeGames += 1;
    if (row.won === true) entry.modeWins += 1;
    if (wanted && mapKey(row.mapName) === wanted) {
      entry.mapGames += 1;
      if (row.won === true) entry.mapWins += 1;
    }
    byCiv.set(key, entry);
  }
  const out = [];
  for (const entry of byCiv.values()) {
    if (scope !== 'mode' && wanted && entry.mapGames >= MIN_MY_CIV_GAMES) {
      out.push({
        civ: entry.civ,
        slug: entry.slug,
        games: entry.mapGames,
        wins: entry.mapWins,
        winRate: pct(entry.mapWins, entry.mapGames),
        scope: 'map',
        scopeLabel: `en ${mapName}`,
      });
    } else if (allowModeFallback && entry.modeGames >= MIN_MY_CIV_GAMES) {
      out.push({
        civ: entry.civ,
        slug: entry.slug,
        games: entry.modeGames,
        wins: entry.modeWins,
        winRate: pct(entry.modeWins, entry.modeGames),
        scope: 'mode',
        scopeLabel: `en ${modeLabel}`,
      });
    }
  }
  return out.sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0));
}

const OPENING_CIV_AFFINITY = {
  archers: new Set([
    'ethiopians', 'britons', 'mayans', 'vietnamese', 'chinese', 'italians',
    'vikings', 'saracens', 'malay', 'koreans', 'portuguese', 'armenians',
    'dravidians', 'japanese', 'aztecs', 'shu', 'muisca', 'tupi', 'puru',
    'achaemenids',
  ]),
  scouts: new Set([
    'franks', 'magyars', 'mongols', 'lithuanians', 'huns', 'persians',
    'berbers', 'poles', 'cumans', 'georgians', 'burgundians', 'gurjaras',
    'hindustanis', 'tatars', 'khmer', 'turks', 'sicilians', 'bulgarians',
    'khitans', 'jurchens', 'wei', 'mapuche', 'varangians', 'macedonians',
  ]),
  infantry: new Set([
    'japanese', 'bulgarians', 'aztecs', 'incas', 'malians', 'vikings',
    'celts', 'goths', 'slavs', 'romans', 'burmese', 'armenians',
    'dravidians', 'malay', 'ethiopians', 'britons', 'mayans', 'mongols',
    'spartans', 'athenians', 'wu', 'danes', 'saxons', 'thracians', 'khitans',
  ]),
  fc: new Set([
    'khmer', 'burgundians', 'bohemians', 'turks', 'spanish', 'portuguese',
    'bengalis', 'saracens', 'persians', 'poles', 'teutons', 'georgians',
    'malay', 'byzantines', 'sicilians', 'cumans', 'italians', 'koreans',
    'burmese', 'aztecs', 'hindustanis', 'gurjaras', 'celts', 'slavs',
    'chinese', 'vietnamese', 'muisca', 'shu',
  ]),
};

function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function classifyOpeningKey(name) {
  const folded = foldText(name);
  if (/archer|arquer/.test(folded)) return 'archers';
  if (/scout|explorador/.test(folded)) return 'scouts';
  if (/fast\s*castle|\bfc\b/.test(folded)) return 'fc';
  if (/man\s*at\s*arms|\bmaa\b|drush|militia|milicia/.test(folded)) return 'infantry';
  return null;
}

function civMatchesOpening(slug, openingKey) {
  if (!slug || !openingKey) return false;
  if (OPENING_CIV_AFFINITY[openingKey] && OPENING_CIV_AFFINITY[openingKey].has(slug)) return true;
  const role = foldText(CIV_GUIDE[slug] && CIV_GUIDE[slug].role);
  if (!role) return false;
  if (openingKey === 'archers') return role.includes('arqueros') && !role.includes('arqueros a caballo');
  if (openingKey === 'scouts') return role.includes('caballeria') || role.includes('camellos');
  if (openingKey === 'infantry') return role.includes('infanteria');
  if (openingKey === 'fc') return role.includes('monjes') || role.includes('polvora') || role.includes('elefantes') || role.includes('defensiv');
  return false;
}

function matchOpeningVulnerability(slug, openingsAgainst, fallbackScopeLabel) {
  const list = Array.isArray(openingsAgainst) ? openingsAgainst : [];
  let best = null;
  for (const op of list) {
    if (!op || !Number.isFinite(Number(op.games)) || Number(op.games) < MIN_MY_CIV_GAMES) continue;
    const lossRate = Number.isFinite(Number(op.lossRate)) ? Number(op.lossRate) : pct(op.losses, op.games);
    if (lossRate == null || lossRate < 55) continue;
    const openingKey = classifyOpeningKey(op.name || op.short);
    if (!openingKey || !civMatchesOpening(slug, openingKey)) continue;
    if (!best || lossRate > best.lossRate || (lossRate === best.lossRate && op.games > best.games)) {
      best = {
        name: op.name || op.short,
        short: op.short || op.name,
        key: openingKey,
        games: Number(op.games),
        losses: Number(op.losses),
        lossRate,
        scopeLabel: op.scopeLabel || fallbackScopeLabel,
      };
    }
  }
  return best;
}

/**
 * CIV RECOMENDADA contra este rival: cruza hasta TRES dimensiones REALES.
 *
 *  - `mine`          → mi winrate con la civ en este mapa/modo (≥ MIN_MY_CIV_GAMES).
 *  - `vsRival`       → lo que el rival pierde contra esa civ según sus replays
 *                      (`weakAgainst` de src/scout.js: lossRate ≥ 55%, ≥ 3 pj).
 *  - `openingMatch`  → apertura que le duele al rival (`openingsAgainst`, ≥ 3 pj
 *                      y lossRate ≥ 55%) compatible con el arquetipo de esa civ.
 *
 * Fórmulas internas de ordenación (`scoreKind: 'ranking-only'`):
 *  - 3 factores (mine + vsRival + opening): 0.45×mía + 0.35×vsCiv + 0.20×apertura
 *  - 2 factores (mine + vsRival):           0.60×mía + 0.40×vsCiv
 *  - 2 factores (mine + opening):           0.65×mía + 0.35×apertura
 *  - 2 factores (vsRival + opening):        0.65×vsCiv + 0.35×apertura
 *  - 1 factor:                              esa dimensión
 *
 * Sin muestra suficiente en mine ni vsRival, la civ no entra. Cada entrada
 * conserva sus muestras reales: el panel las muestra tal cual y nunca inventa.
 */
function buildCivRecommendation({ weakAgainst = [], myCivs = [], openingsAgainst = [], limit = 3,
  rivalContext = null, mapName = null, modeLabel = 'este modo' } = {}) {
  const candidates = new Map();
  const rivalScopeLabel = (rivalContext && rivalContext.scopeLabel) || `en ${modeLabel}`;

  for (const entry of Array.isArray(weakAgainst) ? weakAgainst : []) {
    const slug = civSlug(entry.civ) || String(entry.civ || '').toLowerCase();
    if (!slug) continue;
    candidates.set(slug, {
      civ: entry.civ,
      slug,
      mine: null,
      vsRival: { games: entry.games, losses: entry.losses, lossRate: entry.lossRate,
        scope: rivalContext && rivalContext.scope || entry.scope || null,
        scopeLabel: rivalContext && rivalContext.scopeLabel || entry.scopeLabel || `en ${modeLabel}` },
    });
  }

  for (const entry of Array.isArray(myCivs) ? myCivs : []) {
    const slug = entry.slug || civSlug(entry.civ);
    if (!slug) continue;
    if (!Number.isFinite(Number(entry.games)) || Number(entry.games) < MIN_MY_CIV_GAMES) continue;
    const existing = candidates.get(slug);
    const mineScope = entry.scope || 'map';
    const mine = { games: entry.games, wins: entry.wins, winRate: entry.winRate, scope: mineScope,
      scopeLabel: entry.scopeLabel || (mineScope === 'map' && mapName ? `en ${mapName}` : `en ${modeLabel}`) };
    if (existing) {
      // El nombre canónico es el de mi historial (Companion); el de las
      // replays a veces trae variantes del mismo juego.
      existing.mine = mine;
      existing.civ = entry.civ || existing.civ;
    } else {
      candidates.set(slug, { civ: entry.civ, slug, mine, vsRival: null });
    }
  }

  const scored = [];
  for (const entry of candidates.values()) {
    const openingMatch = matchOpeningVulnerability(entry.slug, openingsAgainst, rivalScopeLabel);
    let score = null;
    let basis = null;
    let factors = 1;
    let basisLabel = '';
    const hasMine = Boolean(entry.mine && entry.mine.winRate != null);
    const hasVsRival = Boolean(entry.vsRival && entry.vsRival.lossRate != null);
    const hasOpening = Boolean(openingMatch && openingMatch.lossRate != null);

    if (hasMine && hasVsRival && hasOpening) {
      score = Math.round(0.45 * entry.mine.winRate + 0.35 * entry.vsRival.lossRate + 0.20 * openingMatch.lossRate);
      basis = 'combined';
      factors = 3;
      basisLabel = 'Tu repertorio + su debilidad + apertura';
    } else if (hasMine && hasVsRival) {
      score = Math.round(0.6 * entry.mine.winRate + 0.4 * entry.vsRival.lossRate);
      basis = 'combined';
      factors = 2;
      basisLabel = 'Tu repertorio + su historial';
    } else if (hasMine && hasOpening) {
      score = Math.round(0.65 * entry.mine.winRate + 0.35 * openingMatch.lossRate);
      basis = 'opening-synergy';
      factors = 2;
      basisLabel = 'Tu repertorio + apertura que le duele';
    } else if (hasVsRival && hasOpening) {
      score = Math.round(0.65 * entry.vsRival.lossRate + 0.35 * openingMatch.lossRate);
      basis = 'rival-opening';
      factors = 2;
      basisLabel = 'Su historial + apertura que le duele';
    } else if (hasMine) {
      score = entry.mine.winRate;
      basis = 'own-history';
      factors = 1;
      basisLabel = 'Tu experiencia; sin cruce suficiente con el rival';
    } else if (hasVsRival) {
      score = entry.vsRival.lossRate;
      basis = 'rival-history';
      factors = 1;
      basisLabel = 'Su historial; tu dominio de esta civ no está comprobado';
    }
    if (score == null) continue;

    const evidence = [];
    if (entry.mine) evidence.push({ label: 'Tus victorias', part: entry.mine.wins, total: entry.mine.games,
      value: `${entry.mine.wins}/${entry.mine.games}`, scopeLabel: entry.mine.scopeLabel, source: 'AoE2 Companion · tu historial' });
    if (entry.vsRival) evidence.push({ label: rivalContext && rivalContext.teamGame ? 'Derrotas de su equipo' : 'Derrotas del rival',
      part: entry.vsRival.losses, total: entry.vsRival.games,
      value: `${entry.vsRival.losses}/${entry.vsRival.games}`, scopeLabel: entry.vsRival.scopeLabel,
      source: 'AoE2Insights · replays analizados' });
    if (openingMatch) evidence.push({ label: 'Apertura que le duele', opening: openingMatch.short,
      part: openingMatch.losses, total: openingMatch.games,
      value: `${openingMatch.losses}/${openingMatch.games}`, scopeLabel: openingMatch.scopeLabel,
      source: 'AoE2Insights · replays analizados' });

    scored.push({ ...entry, openingMatch, factors, score, scoreKind: 'ranking-only', basis, basisLabel,
      evidence, crossScope: Boolean(entry.mine && entry.vsRival && entry.mine.scope !== entry.vsRival.scope),
      caveat: 'Índice de ordenación interno; no representa probabilidad de victoria.' });
  }

  const tierOf = (row) => {
    if (row.basis === 'combined' && row.factors === 3) return 5;
    if (row.basis === 'combined') return 4;
    if (row.basis === 'opening-synergy') return 3;
    if (row.basis === 'rival-opening') return 2;
    return 1;
  };

  return scored
    .sort((a, b) => tierOf(b) - tierOf(a) || b.score - a.score ||
      ((b.mine && b.mine.games) || 0) - ((a.mine && a.mine.games) || 0) ||
      ((b.vsRival && b.vsRival.games) || 0) - ((a.vsRival && a.vsRival.games) || 0))
    .slice(0, Math.max(1, Number(limit) || 3));
}

module.exports = {
  PAGE_SIZE,
  MAX_PAGES,
  PAGE_DELAY_MS,
  DEFAULT_TTL_MS,
  MIN_MY_CIV_GAMES,
  mineCacheKey,
  parseMyHistory,
  fetchMyHistory,
  computeH2H,
  computeMyMapCivs,
  buildCivRecommendation,
  matchOpeningVulnerability,
};
