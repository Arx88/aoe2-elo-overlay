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
async function fetchMyHistory(options = {}) {
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
        return (await fetchMatchesImpl(id, PAGE_SIZE, page, ladder)) || [];
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
    const add = (list) => {
      const before = matches.length;
      for (const match of Array.isArray(list) ? list : []) {
        const matchKey = match && match.matchId != null ? String(match.matchId) : null;
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
      if (lastPage.length < PAGE_SIZE) break;
      if (page >= maxPages) break;
    }

    const rows = parseMyHistory(matches, id, currentMatchId);
    if (cache) cache.set(key, { ts: now, rows });
    log(`mi historial (#${id}): ${rows.length} partidas del modo en ${page} página(s)`);
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
  let lastMatch = null;
  const recent = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const rival = (row.players || []).find((p) => p.profileId === rivalId);
    if (!rival) continue;
    const sameTeam =
      row.myTeam != null && rival.team != null && row.myTeam === rival.team;
    if (sameTeam) {
      asAllies += 1;
      continue;
    }
    games += 1;
    if (row.won === true) wins += 1;
    else if (row.won === false) losses += 1;
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
function computeMyMapCivs(rows, mapName) {
  const wanted = mapKey(mapName);
  const byCiv = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row.civ) continue;
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
    if (wanted && entry.mapGames >= MIN_MY_CIV_GAMES) {
      out.push({
        civ: entry.civ,
        slug: entry.slug,
        games: entry.mapGames,
        wins: entry.mapWins,
        winRate: pct(entry.mapWins, entry.mapGames),
        scope: 'map',
      });
    } else if (entry.modeGames >= MIN_MY_CIV_GAMES) {
      out.push({
        civ: entry.civ,
        slug: entry.slug,
        games: entry.modeGames,
        wins: entry.modeWins,
        winRate: pct(entry.modeWins, entry.modeGames),
        scope: 'mode',
      });
    }
  }
  return out.sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0));
}

/**
 * CIV RECOMENDADA contra este rival: cruza dos dimensiones REALES.
 *
 *  - `mine`     → mi winrate con la civ en este mapa (≥ MIN_MY_CIV_GAMES).
 *  - `vsRival`  → lo que el rival pierde contra esa civ según sus replays
 *                 (el `weakAgainst` de src/scout.js: lossRate ≥ 55%, ≥ 3 pj).
 *
 * Score = 0.6 × miWinRate + 0.4 × lossRateDelRival cuando hay ambas; con una
 * sola dimensión, esa dimensión. Sin muestra suficiente en ninguna, la civ no
 * entra. Cada entrada conserva sus muestras: el panel las muestra tal cual y
 * nunca inventa un número.
 */
function buildCivRecommendation({ weakAgainst = [], myCivs = [], limit = 3 } = {}) {
  const candidates = new Map();

  for (const entry of Array.isArray(weakAgainst) ? weakAgainst : []) {
    const slug = civSlug(entry.civ) || String(entry.civ || '').toLowerCase();
    if (!slug) continue;
    candidates.set(slug, {
      civ: entry.civ,
      slug,
      mine: null,
      vsRival: { games: entry.games, losses: entry.losses, lossRate: entry.lossRate },
    });
  }

  for (const entry of Array.isArray(myCivs) ? myCivs : []) {
    const slug = entry.slug || civSlug(entry.civ);
    if (!slug) continue;
    if (!Number.isFinite(Number(entry.games)) || Number(entry.games) < MIN_MY_CIV_GAMES) continue;
    const existing = candidates.get(slug);
    const mine = { games: entry.games, wins: entry.wins, winRate: entry.winRate, scope: entry.scope || 'map' };
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
    let score = null;
    if (entry.mine && entry.vsRival && entry.mine.winRate != null && entry.vsRival.lossRate != null) {
      score = Math.round(0.6 * entry.mine.winRate + 0.4 * entry.vsRival.lossRate);
    } else if (entry.mine && entry.mine.winRate != null) {
      score = entry.mine.winRate;
    } else if (entry.vsRival && entry.vsRival.lossRate != null) {
      score = entry.vsRival.lossRate;
    }
    if (score == null) continue;
    scored.push({ ...entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score ||
      ((b.mine && b.mine.games) || 0) - ((a.mine && a.mine.games) || 0))
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
};
