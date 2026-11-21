'use strict';

/**
 * CENTRAL DE INTELIGENCIA PROPIA Y SCOUTING DE PERFILES (src/central.js)
 *
 * Consolida datos 100% reales y auditables — inspirados en AoE2Insights,
 * AoE2 Companion y AoE2 Buddy — sin mezclar ladders ni inventar métricas:
 *  1. Perfil extendido oficial de AoE2 Companion (`?use_enums=true&extend=stats`):
 *     - Ladders oficiales completas (RM 1v1, RM Team, EW 1v1, EW Team, etc.)
 *     - Historial COMPLETO de civilizaciones, mapas, aliados y rivales por modo
 *       (no limitado a las últimas 10 partidas).
 *     - Serie histórica pura de ELO por modo (hasta 250 puntos cronológicos).
 *  2. Telemetría real de AoE2Insights (`meanEapm`, `oppMeanEapm`, duración real,
 *     aperturas propias y rivales, ELO propio vs rival, mapas Abiertos/Cerrados).
 *  3. Métricas derivadas legítimas con denominador explícito:
 *     - Winrate por duración de partida (<20m, 20-30m, 30-40m, 40m+).
 *     - Rendimiento vs mayor ELO ("Matagigantes") vs menor/igual ELO.
 *     - Comparativa Antes vs Ahora manzana-con-manzana (ventana reciente vs previa).
 *     - Radar táctico honesto (solo ejes con muestra real, nunca clones ni rellenos).
 *  4. Caché en memoria por profileId + caché en disco para el perfil propio.
 */

const fs = require('fs');
const { getJson, fetchMatches, fetchPersonalStats } = require('./aoe');
const { civSlug } = require('./civs');
const { resolveMode, mapKey } = require('./rival');
const { fetchOpeningRows } = require('./insights');
const { parseScoutRows } = require('./scout');

const MODE_ORDER = ['rm_1v1', 'rm_team', 'ew_1v1', 'ew_team'];
const MODE_LABELS = {
  rm_1v1: 'RM 1v1',
  rm_team: 'RM Team',
  ew_1v1: 'EW 1v1',
  ew_team: 'EW Team',
  global: 'Global',
};

const OPENING_CATEGORY = {
  'Scout rush': 'agro',
  'Archer rush': 'agro',
  'Man at arms rush': 'agro',
  'M@A Rush': 'agro',
  Drush: 'agro',
  'Tower rush': 'agro',
  'Hoang rush': 'agro',
  'Fast castle': 'boom',
  'Fast Castle': 'boom',
  '2TC Feudal Boom': 'boom',
  'FC Boom': 'boom',
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

function avg(values, digits = 1) {
  const valid = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!valid.length) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const scale = 10 ** digits;
  return Math.round(mean * scale) / scale;
}

function isRm1v1Match(m) {
  if (!m) return false;
  const lid = String(m.leaderboardId || '').toLowerCase();
  if (lid === 'rm_1v1' || lid === '3') return true;
  const lname = String(m.leaderboardName || '').toLowerCase();
  return lname.includes('1v1') && !lname.includes('empire wars');
}

function isRmTeamMatch(m) {
  if (!m) return false;
  const lid = String(m.leaderboardId || '').toLowerCase();
  if (lid === 'rm_team' || lid === '4') return true;
  const lname = String(m.leaderboardName || '').toLowerCase();
  return lname.includes('team') && !lname.includes('empire wars');
}

function readDiskCache(diskCachePath, pid) {
  if (!diskCachePath) return null;
  try {
    if (!fs.existsSync(diskCachePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(diskCachePath, 'utf8'));
    if (!parsed || Number(parsed.profileId) !== Number(pid) || !parsed.raw) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDiskCache(diskCachePath, pid, raw) {
  if (!diskCachePath || !raw) return;
  try {
    const tmp = `${diskCachePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ profileId: Number(pid), ts: Date.now(), raw }), 'utf8');
    fs.renameSync(tmp, diskCachePath);
  } catch {
    // Nunca fallar por caché en disco
  }
}

/**
 * Extrae un resumen limpio de una partida normalizada desde la perspectiva de
 * `profileId`, listo para el listado interactivo de Postmatch.
 */
function summarizeOwnMatch(match, profileId, hasLocalTelemetry = false) {
  if (!match || !match.matchId) return null;
  const pid = Number(profileId);
  const players = Array.isArray(match.players) ? match.players : [];
  const me = players.find((p) => Number(p.profileId) === pid) || players[0];
  if (!me) return null;

  const opponents = players.filter((p) => {
    if (Number(p.profileId) === Number(me.profileId)) return false;
    if (me.team != null && p.team != null) return Number(p.team) !== Number(me.team);
    return true;
  });
  const primaryRival = opponents[0] || players.find((p) => Number(p.profileId) !== Number(me.profileId)) || null;
  const mode = resolveMode(match.leaderboardId);
  const durationSec = (Number.isFinite(match.startedAt) && Number.isFinite(match.finishedAt) && match.finishedAt > match.startedAt)
    ? Math.round((match.finishedAt - match.startedAt) / 1000)
    : null;

  return {
    matchId: String(match.matchId),
    mapName: match.mapName || '—',
    leaderboardId: match.leaderboardId,
    is1v1: isRm1v1Match(match),
    isTeam: isRmTeamMatch(match),
    modeLabel: (mode && mode.label) || match.leaderboardName || 'Partida',
    teamSize: players.length > 2 ? `${Math.ceil(players.length / 2)}v${Math.floor(players.length / 2)}` : '1v1',
    startedAt: match.startedAt || null,
    finishedAt: match.finishedAt || null,
    durationSeconds: durationSec,
    won: typeof me.won === 'boolean' ? me.won : null,
    myCiv: me.civ || null,
    myCivSlug: me.civ ? civSlug(me.civ) : null,
    myRating: me.matchRating != null ? Number(me.matchRating) : null,
    myRatingDiff: me.matchRatingDiff != null ? Number(me.matchRatingDiff) : null,
    rivalName: primaryRival ? (primaryRival.name || `Perfil #${primaryRival.profileId}`) : 'Rival',
    rivalProfileId: primaryRival ? Number(primaryRival.profileId) : null,
    rivalCiv: primaryRival ? (primaryRival.civ || null) : null,
    rivalCivSlug: primaryRival && primaryRival.civ ? civSlug(primaryRival.civ) : null,
    rivalRating: primaryRival && primaryRival.matchRating != null ? Number(primaryRival.matchRating) : null,
    extraRivals: Math.max(0, opponents.length - 1),
    hasTelemetry: Boolean(hasLocalTelemetry),
    rawMatch: match,
  };
}

/**
 * Combina partidas guardadas en PerformanceStore con las partidas recientes de
 * AoE2 Companion, sin duplicar `matchId`, ordenadas de más reciente a más vieja.
 */
function mergeRecentMatches(remoteMatches = [], storedRecords = [], profileId, limit = 15) {
  const byId = new Map();
  const telemetryIds = new Set();

  for (const rec of Array.isArray(storedRecords) ? storedRecords : []) {
    if (!rec || !rec.match || !rec.match.matchId) continue;
    const id = String(rec.match.matchId);
    if (rec.telemetry) telemetryIds.add(id);
    byId.set(id, rec.match);
  }

  for (const m of Array.isArray(remoteMatches) ? remoteMatches : []) {
    if (!m || !m.matchId || m.ongoing) continue;
    const id = String(m.matchId);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, m);
    } else {
      byId.set(id, {
        ...existing,
        ...m,
        players: (m.players && m.players.length) ? m.players : existing.players,
      });
    }
  }

  const summaries = [];
  for (const [id, match] of byId.entries()) {
    const item = summarizeOwnMatch(match, profileId, telemetryIds.has(id));
    if (item) summaries.push(item);
  }

  summaries.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0) || Number(b.matchId) - Number(a.matchId));
  return summaries.slice(0, Math.max(1, Number(limit) || 15));
}

function buildDurationBuckets(items) {
  const buckets = [
    { id: 'early', label: '< 20m', sub: 'Feudal', min: 0, max: 20 * 60, games: 0, wins: 0, losses: 0 },
    { id: 'castle', label: '20–30m', sub: 'Castillos', min: 20 * 60, max: 30 * 60, games: 0, wins: 0, losses: 0 },
    { id: 'imp', label: '30–40m', sub: 'Imperial', min: 30 * 60, max: 40 * 60, games: 0, wins: 0, losses: 0 },
    { id: 'late', label: '40m+', sub: 'Post-Imp', min: 40 * 60, max: Infinity, games: 0, wins: 0, losses: 0 },
  ];

  let counted = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const dur = Number(item?.durationSeconds ?? item?.duration);
    if (!Number.isFinite(dur) || dur < 180 || dur > 6 * 3600) continue;
    if (typeof item.won !== 'boolean') continue;
    const b = buckets.find((x) => dur >= x.min && dur < x.max);
    if (!b) continue;
    b.games += 1;
    if (item.won) b.wins += 1;
    else b.losses += 1;
    counted += 1;
  }

  return {
    total: counted,
    buckets: buckets.map((b) => ({
      id: b.id,
      label: b.label,
      sub: b.sub,
      games: b.games,
      wins: b.wins,
      losses: b.losses,
      winRate: pct(b.wins, b.games),
      share: pct(b.games, counted) || 0,
    })),
  };
}

/**
 * Parsea las filas de AoE2Insights (`parseScoutRows`) leyendo correctamente
 * `meanEapm` y `oppMeanEapm`, duración real, aperturas, mapas Open/Closed y
 * rendimiento frente a rivales de mayor o menor ELO.
 */
function analyzeInsightsRows(rawPayload) {
  const parsed = Array.isArray(rawPayload) ? rawPayload : parseScoutRows(rawPayload || {});
  if (!parsed.length) return null;

  const eapmSelf = [];
  const eapmRival = [];
  let outpacedWins = 0;
  let outpacedGames = 0;
  const myOpenings = new Map();
  const vsOpenings = new Map();
  const opennessMap = new Map();
  let agroCount = 0;
  let boomCount = 0;
  let classifiedCount = 0;
  let vsHigher = { games: 0, wins: 0, losses: 0 };
  let vsLower = { games: 0, wins: 0, losses: 0 };

  for (const row of parsed) {
    const selfEapm = Number(row.meanEapm ?? row.eapm);
    const rivalEapm = Number(row.oppMeanEapm ?? row.oppEapm);

    if (Number.isFinite(selfEapm) && selfEapm > 5 && selfEapm < 250) {
      eapmSelf.push({ val: selfEapm, won: row.won, ts: row.startedAt, dur: row.duration });
      if (Number.isFinite(rivalEapm) && rivalEapm > 5 && rivalEapm < 250) {
        eapmRival.push(rivalEapm);
        if (selfEapm > rivalEapm && typeof row.won === 'boolean') {
          outpacedGames += 1;
          if (row.won) outpacedWins += 1;
        }
      }
    }

    const myElo = Number(row.elo);
    const oppElo = Number(row.oppElo);
    if (Number.isFinite(myElo) && Number.isFinite(oppElo) && myElo > 0 && oppElo > 0 && typeof row.won === 'boolean') {
      const target = oppElo > myElo ? vsHigher : vsLower;
      target.games += 1;
      if (row.won) target.wins += 1;
      else target.losses += 1;
    }

    const strat = row.strategy && row.strategy !== 'Unknown' ? row.strategy : null;
    if (strat) {
      classifiedCount += 1;
      const cat = OPENING_CATEGORY[strat] || (strat.toLowerCase().includes('fast') ? 'boom' : 'agro');
      if (cat === 'agro') agroCount += 1;
      else if (cat === 'boom') boomCount += 1;

      const cur = myOpenings.get(strat) || { name: strat, games: 0, wins: 0, losses: 0, eapms: [] };
      cur.games += 1;
      if (row.won === true) cur.wins += 1;
      else if (row.won === false) cur.losses += 1;
      if (Number.isFinite(selfEapm) && selfEapm > 5) cur.eapms.push(selfEapm);
      myOpenings.set(strat, cur);
    }

    const oppStrat = row.oppStrategy && row.oppStrategy !== 'Unknown' ? row.oppStrategy : null;
    if (oppStrat && typeof row.won === 'boolean') {
      const cur = vsOpenings.get(oppStrat) || { name: oppStrat, games: 0, wins: 0, losses: 0 };
      cur.games += 1;
      if (row.won === true) cur.wins += 1;
      else cur.losses += 1;
      vsOpenings.set(oppStrat, cur);
    }

    const openKind = row.openness && row.openness !== 'Unknown' ? row.openness : null;
    if (openKind && typeof row.won === 'boolean') {
      const cur = opennessMap.get(openKind) || { kind: openKind, games: 0, wins: 0, losses: 0 };
      cur.games += 1;
      if (row.won) cur.wins += 1;
      else cur.losses += 1;
      opennessMap.set(openKind, cur);
    }
  }

  const recentHalfCount = Math.max(1, Math.floor(eapmSelf.length / 2));
  const recentEapms = eapmSelf.slice(0, recentHalfCount).map((x) => x.val);
  const olderEapms = eapmSelf.slice(recentHalfCount).map((x) => x.val);
  const durationAnalysis = buildDurationBuckets(parsed);

  return {
    totalRows: parsed.length,
    classifiedCount,
    agroShare: pct(agroCount, classifiedCount),
    boomShare: pct(boomCount, classifiedCount),
    eapm: {
      sampleCount: eapmSelf.length,
      avgSelf: avg(eapmSelf.map((x) => x.val), 1),
      peakSelf: eapmSelf.length ? Math.round(Math.max(...eapmSelf.map((x) => x.val)) * 10) / 10 : null,
      avgRival: avg(eapmRival, 1),
      recentAvg: avg(recentEapms, 1),
      olderAvg: avg(olderEapms, 1),
      delta: (recentEapms.length && olderEapms.length)
        ? Math.round((avg(recentEapms, 1) - avg(olderEapms, 1)) * 10) / 10
        : null,
      outpacedWinRate: pct(outpacedWins, outpacedGames),
      outpacedGames,
      series: eapmSelf.slice(0, 20).reverse().map((x) => Math.round(x.val * 10) / 10),
    },
    eloMatchup: {
      vsHigher: { ...vsHigher, winRate: pct(vsHigher.wins, vsHigher.games) },
      vsLower: { ...vsLower, winRate: pct(vsLower.wins, vsLower.games) },
    },
    durationAnalysis,
    openings: [...myOpenings.values()]
      .sort((a, b) => b.games - a.games)
      .slice(0, 6)
      .map((op) => ({
        name: op.name,
        short: op.name,
        games: op.games,
        wins: op.wins,
        losses: op.losses,
        winRate: pct(op.wins, op.wins + op.losses),
        share: pct(op.games, classifiedCount) || 0,
        avgEapm: avg(op.eapms, 1),
      })),
    vsOpenings: [...vsOpenings.values()]
      .filter((op) => op.games >= 2)
      .sort((a, b) => b.games - a.games)
      .slice(0, 5)
      .map((op) => ({
        name: op.name,
        games: op.games,
        wins: op.wins,
        losses: op.losses,
        winRate: pct(op.wins, op.games),
      })),
    byOpenness: [...opennessMap.values()]
      .sort((a, b) => b.games - a.games)
      .map((o) => ({
        ...o,
        winRate: pct(o.wins, o.games),
      })),
  };
}

/**
 * Construye la serie pura COMPLETA de ELO de un modo concreto (hasta `maxPoints`)
 * usando `profileData.ratings` de AoE2 Companion. Jamás mezcla ladders.
 */
function buildPureEloSeries(profileData, modeMatches = [], targetLadder = 'rm_1v1', fallbackRating = null, maxPoints = 250) {
  const ratingBlock = Array.isArray(profileData?.ratings)
    ? profileData.ratings.find((r) => r && r.leaderboardId === targetLadder)
    : null;
  const rawPoints = Array.isArray(ratingBlock?.ratings) ? ratingBlock.ratings : [];

  if (rawPoints.length >= 2) {
    const slice = rawPoints
      .filter((p) => Number.isFinite(Number(p.rating)) && Number(p.rating) > 0)
      .slice(0, maxPoints)
      .reverse();
    return slice.map((p, idx) => {
      const prev = idx > 0 ? Number(slice[idx - 1].rating) : null;
      const rating = Number(p.rating);
      const diff = Number.isFinite(Number(p.ratingDiff))
        ? Number(p.ratingDiff)
        : (prev != null ? rating - prev : 0);
      return {
        index: idx + 1,
        games: Number(p.games) || null,
        rating,
        diff,
        won: diff > 0 ? true : diff < 0 ? false : null,
        startedAt: p.date ? Date.parse(p.date) : null,
      };
    });
  }

  const filtered = (Array.isArray(modeMatches) ? modeMatches : [])
    .filter((r) => Number.isFinite(r.myRating) && r.myRating > 0)
    .slice(0, maxPoints)
    .reverse();

  const out = filtered.map((r, idx) => ({
    index: idx + 1,
    matchId: r.matchId,
    mapName: r.mapName,
    rating: r.myRating,
    diff: r.myRatingDiff,
    won: r.won,
    startedAt: r.startedAt,
  }));

  if (out.length && Number.isFinite(fallbackRating) && Math.abs(fallbackRating - out[out.length - 1].rating) <= 45) {
    out[out.length - 1].rating = fallbackRating;
  }
  return out;
}

/**
 * Extrae las estadísticas HISTÓRICAS COMPLETAS (all-time) de civilizaciones,
 * mapas, aliados y rivales desde `profileData.stats` (Companion `?extend=stats`).
 */
function parseAllTimeStatsBlock(statsBlocks = [], fallbackMatches = []) {
  const civAcc = new Map();
  const mapAcc = new Map();
  const allyAcc = new Map();
  const oppAcc = new Map();
  let totalCivGames = 0;
  let totalMapGames = 0;

  const validBlocks = (Array.isArray(statsBlocks) ? statsBlocks : []).filter(Boolean);

  for (const block of validBlocks) {
    for (const item of Array.isArray(block.civ) ? block.civ : []) {
      const name = item.civName || item.civ;
      const games = Number(item.games) || 0;
      if (!name || games <= 0) continue;
      const slug = civSlug(name) || String(item.civ || name).toLowerCase();
      const cur = civAcc.get(slug) || { civ: name, slug, games: 0, wins: 0, losses: 0 };
      cur.games += games;
      cur.wins += Number(item.wins) || 0;
      cur.losses += Number(item.losses) || 0;
      civAcc.set(slug, cur);
      totalCivGames += games;
    }

    for (const item of Array.isArray(block.map) ? block.map : []) {
      const name = item.mapName || item.map;
      const games = Number(item.games) || 0;
      if (!name || games <= 0) continue;
      const key = mapKey(name);
      const cur = mapAcc.get(key) || { mapName: name, games: 0, wins: 0, losses: 0 };
      cur.games += games;
      cur.wins += Number(item.wins) || 0;
      cur.losses += Number(item.losses) || 0;
      mapAcc.set(key, cur);
      totalMapGames += games;
    }

    for (const item of Array.isArray(block.allies) ? block.allies : []) {
      const pid = Number(item.profileId);
      const games = Number(item.games) || 0;
      if (!pid || games <= 0) continue;
      const cur = allyAcc.get(pid) || {
        profileId: pid,
        name: item.name || `#${pid}`,
        country: item.country || null,
        countryIcon: item.countryIcon || '',
        games: 0,
        wins: 0,
        losses: 0,
      };
      cur.games += games;
      cur.wins += Number(item.wins) || 0;
      cur.losses += Number(item.losses) || 0;
      allyAcc.set(pid, cur);
    }

    for (const item of Array.isArray(block.opponents) ? block.opponents : []) {
      const pid = Number(item.profileId);
      const games = Number(item.games) || 0;
      if (!pid || games <= 0) continue;
      const cur = oppAcc.get(pid) || {
        profileId: pid,
        name: item.name || `#${pid}`,
        country: item.country || null,
        countryIcon: item.countryIcon || '',
        games: 0,
        wins: 0,
        losses: 0,
      };
      cur.games += games;
      cur.wins += Number(item.wins) || 0;
      cur.losses += Number(item.losses) || 0;
      oppAcc.set(pid, cur);
    }
  }

  let sourceScope = 'all-time';

  // Fallback solo si `extend=stats` no trajo datos para este modo
  if (civAcc.size === 0 && Array.isArray(fallbackMatches) && fallbackMatches.length) {
    sourceScope = 'recent-sample';
    for (const row of fallbackMatches) {
      if (row.myCiv) {
        const slug = row.myCivSlug || civSlug(row.myCiv) || row.myCiv.toLowerCase();
        const cur = civAcc.get(slug) || { civ: row.myCiv, slug, games: 0, wins: 0, losses: 0 };
        cur.games += 1;
        if (row.won === true) cur.wins += 1;
        else if (row.won === false) cur.losses += 1;
        civAcc.set(slug, cur);
        totalCivGames += 1;
      }
      if (row.mapName && row.mapName !== '—') {
        const key = mapKey(row.mapName);
        const cur = mapAcc.get(key) || { mapName: row.mapName, games: 0, wins: 0, losses: 0 };
        cur.games += 1;
        if (row.won === true) cur.wins += 1;
        else if (row.won === false) cur.losses += 1;
        mapAcc.set(key, cur);
        totalMapGames += 1;
      }
    }
  }

  const allCivs = [...civAcc.values()]
    .map((c) => {
      const known = c.wins + c.losses;
      return {
        ...c,
        knownGames: known,
        winRate: pct(c.wins, known || c.games),
        share: totalCivGames > 0 ? Math.round((c.games / totalCivGames) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0));

  const allMaps = [...mapAcc.values()]
    .map((m) => {
      const known = m.wins + m.losses;
      return {
        ...m,
        knownGames: known,
        winRate: pct(m.wins, known || m.games),
        share: totalMapGames > 0 ? Math.round((m.games / totalMapGames) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0));

  const minCivGames = totalCivGames >= 200
    ? clamp(Math.round(totalCivGames * 0.02), 8, 15)
    : totalCivGames >= 80 ? 5 : totalCivGames >= 25 ? 3 : 2;
  const eligibleCivs = allCivs.filter((c) => c.games >= minCivGames && c.winRate != null);
  const bestCiv = eligibleCivs.length
    ? [...eligibleCivs].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
    : null;
  const weakestCiv = eligibleCivs.length >= 2
    ? [...eligibleCivs].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0]
    : null;

  const minMapGames = totalMapGames >= 200
    ? clamp(Math.round(totalMapGames * 0.02), 8, 15)
    : totalMapGames >= 80 ? 5 : totalMapGames >= 25 ? 3 : 2;
  const eligibleMaps = allMaps.filter((m) => m.games >= minMapGames && m.winRate != null);
  const bestMap = eligibleMaps.length
    ? [...eligibleMaps].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
    : null;
  const weakestMap = eligibleMaps.length >= 2
    ? [...eligibleMaps].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0]
    : null;

  const allies = [...allyAcc.values()]
    .map((p) => ({ ...p, winRate: pct(p.wins, p.wins + p.losses) }))
    .sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0))
    .slice(0, 6);

  const opponents = [...oppAcc.values()]
    .map((p) => ({ ...p, winRate: pct(p.wins, p.wins + p.losses) }))
    .sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0))
    .slice(0, 6);

  const topCivsByWr = [...eligibleCivs]
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, 7);
  const topMapsByWr = [...eligibleMaps]
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, 7);

  return {
    sourceScope,
    totalCivGames,
    totalMapGames,
    totalDistinctCivs: allCivs.length,
    totalDistinctMaps: allMaps.length,
    topCivs: allCivs.slice(0, 7),
    topCivsByWr,
    bestCiv,
    weakestCiv: weakestCiv && bestCiv && weakestCiv.slug !== bestCiv.slug ? weakestCiv : null,
    minCivGames,
    topMaps: allMaps.slice(0, 7),
    topMapsByWr,
    bestMap,
    weakestMap: weakestMap && bestMap && weakestMap.mapName !== bestMap.mapName ? weakestMap : null,
    minMapGames,
    allies,
    opponents,
  };
}

/**
 * Calcula comparativas «Antes vs Ahora» 100% auditables (manzana con manzana):
 * compara ventanas de igual tamaño (últimas 10 vs 10 previas, o segunda mitad
 * vs primera mitad cuando la muestra es más corta).
 */
function computeBeforeVsNow({
  modeLabel = 'RM 1v1',
  eloSeries = [],
  insightsAnalysis = null,
  storedRecords = [],
  profileId,
  isOwnProfile = true,
}) {
  const items = [];
  const pid = Number(profileId);

  // 1. ELO del modo: promedio ventana reciente vs promedio ventana previa
  if (eloSeries.length >= 6) {
    const winSize = eloSeries.length >= 20 ? 10 : Math.floor(eloSeries.length / 2);
    const recentSlice = eloSeries.slice(-winSize);
    const prevSlice = eloSeries.slice(-winSize * 2, -winSize);
    const beforeVal = Math.round(avg(prevSlice.map((p) => p.rating), 0));
    const nowVal = Math.round(avg(recentSlice.map((p) => p.rating), 0));
    const delta = nowVal - beforeVal;
    items.push({
      id: 'elo',
      labelKey: 'central.bvnElo',
      fallbackLabel: `ELO medio (${modeLabel})`,
      beforeText: `${beforeVal}`,
      nowText: `${nowVal}`,
      deltaText: `${delta >= 0 ? '+' : ''}${delta} ELO`,
      improved: delta >= 0,
      sampleText: `Últimas ${winSize} vs ${winSize} previas`,
      series: eloSeries.slice(-Math.min(24, eloSeries.length)).map((p) => p.rating),
    });
  }

  // 2. Winrate del modo (directo de la serie pura del ladder: diff > 0 / < 0)
  const knownPoints = eloSeries.filter((p) => typeof p.won === 'boolean');
  if (knownPoints.length >= 8) {
    const winSize = knownPoints.length >= 20 ? 10 : Math.floor(knownPoints.length / 2);
    const recentHalf = knownPoints.slice(-winSize);
    const olderHalf = knownPoints.slice(-winSize * 2, -winSize);
    const beforeWins = olderHalf.filter((p) => p.won).length;
    const nowWins = recentHalf.filter((p) => p.won).length;
    const beforeWr = pct(beforeWins, olderHalf.length);
    const nowWr = pct(nowWins, recentHalf.length);
    if (beforeWr != null && nowWr != null) {
      const delta = nowWr - beforeWr;
      items.push({
        id: 'winrate',
        labelKey: 'central.bvnWinrate',
        fallbackLabel: `Winrate (${modeLabel})`,
        beforeText: `${beforeWr}%`,
        nowText: `${nowWr}%`,
        deltaText: `${delta >= 0 ? '+' : ''}${delta} pts`,
        improved: delta >= 0,
        sampleText: `${nowWins}V-${winSize - nowWins}D vs ${beforeWins}V-${winSize - beforeWins}D`,
        series: knownPoints.slice(-Math.min(18, knownPoints.length)).map((p, idx, arr) => {
          const sl = arr.slice(Math.max(0, idx - 4), idx + 1);
          return pct(sl.filter((x) => x.won).length, sl.length);
        }),
      });
    }
  }

  // 3. Velocidad Mecánica eAPM (Antes vs Ahora desde AoE2Insights `meanEapm`)
  const eapmData = insightsAnalysis?.eapm;
  if (eapmData && eapmData.sampleCount >= 4 && eapmData.olderAvg != null && eapmData.recentAvg != null) {
    const delta = Math.round((eapmData.recentAvg - eapmData.olderAvg) * 10) / 10;
    items.push({
      id: 'eapm',
      labelKey: 'central.bvnEapm',
      fallbackLabel: 'Ritmo mecánico (eAPM)',
      beforeText: `${eapmData.olderAvg}`,
      nowText: `${eapmData.recentAvg}`,
      deltaText: `${delta >= 0 ? '+' : ''}${delta} eAPM`,
      improved: delta >= 0,
      sampleText: eapmData.avgRival
        ? `${eapmData.sampleCount} replays · rival medio ${eapmData.avgRival}`
        : `${eapmData.sampleCount} replays de AoE2Insights`,
      series: eapmData.series,
    });
  }

  // 4. Telemetría local de replays (solo perfil propio si hay >= 2 replays medidos)
  if (isOwnProfile) {
    const validRecs = (Array.isArray(storedRecords) ? storedRecords : [])
      .filter((r) => r && r.telemetry?.engine?.self && Number(r.profileId) === pid);
    if (validRecs.length >= 2) {
      const mid = Math.max(1, Math.floor(validRecs.length / 2));
      const recentRecs = validRecs.slice(0, mid);
      const olderRecs = validRecs.slice(mid);
      const getTcUtil = (r) => r.telemetry.engine.self.tcUtilizationEarly ?? r.telemetry.engine.self.tcUtilization;
      const beforeTc = avg(olderRecs.map(getTcUtil), 1);
      const nowTc = avg(recentRecs.map(getTcUtil), 1);
      if (beforeTc != null && nowTc != null) {
        const delta = Math.round((nowTc - beforeTc) * 10) / 10;
        items.push({
          id: 'tcUtil',
          labelKey: 'central.bvnTcUtil',
          fallbackLabel: 'Uso continuo de TC',
          beforeText: `${beforeTc}%`,
          nowText: `${nowTc}%`,
          deltaText: `${delta >= 0 ? '+' : ''}${delta}%`,
          improved: delta >= 0,
          sampleText: `${validRecs.length} replays locales analizados`,
          series: validRecs.slice(0, 10).reverse().map(getTcUtil),
        });
      }
    }
  }

  return items;
}

/**
 * Construye 6 ejes tácticos 100% honestos: si un eje no tiene muestra real para
 * el modo seleccionado, se marca `hasData: false` en vez de clonar otro dato.
 */
function buildHonestRadar({ ladder, stats, insights, durationAnalysis, telemetrySummary, isOwnProfile }) {
  const overallWr = ladder?.winRate ?? null;
  const totalGames = ladder?.games ?? stats?.totalCivGames ?? 0;

  // 1. Consistencia (Winrate oficial del modo)
  const hasConsistency = overallWr != null && totalGames >= 3;
  const consistencyScore = hasConsistency ? clamp(Math.round(50 + (overallWr - 50) * 1.6), 15, 98) : null;

  // 2. Mecánica / Macro (eAPM real vs rival o TC util local)
  const avgEapm = insights?.eapm?.avgSelf ?? (isOwnProfile ? telemetrySummary?.avgEapm : null);
  const rivalEapm = insights?.eapm?.avgRival ?? null;
  const avgTc = isOwnProfile ? telemetrySummary?.avgTcUtilization : null;
  const hasMacro = avgTc != null || avgEapm != null;
  let macroScore = null;
  if (avgTc != null) {
    macroScore = clamp(Math.round(avgTc), 18, 99);
  } else if (avgEapm != null && rivalEapm != null && rivalEapm > 0) {
    // Score relativo real: si igualás al rival = 60, +25% eAPM = 85, -25% = 35
    macroScore = clamp(Math.round(60 + ((avgEapm - rivalEapm) / rivalEapm) * 100), 20, 98);
  } else if (avgEapm != null) {
    macroScore = clamp(Math.round(25 + avgEapm * 0.9), 20, 96);
  }

  // 3. Juego Temprano (<30m: Feudal + Castillos)
  const earlyBuckets = (durationAnalysis?.buckets || []).filter((b) => b.id === 'early' || b.id === 'castle');
  const earlyGames = earlyBuckets.reduce((s, b) => s + b.games, 0);
  const earlyWins = earlyBuckets.reduce((s, b) => s + b.wins, 0);
  const earlyWr = earlyGames >= 3 ? pct(earlyWins, earlyGames) : null;
  const earlyScore = earlyWr != null ? clamp(Math.round(50 + (earlyWr - 50) * 1.4), 15, 98) : null;

  // 4. Late Game (30m+: Imperial + Post-Imp)
  const lateBuckets = (durationAnalysis?.buckets || []).filter((b) => b.id === 'imp' || b.id === 'late');
  const lateGames = lateBuckets.reduce((s, b) => s + b.games, 0);
  const lateWins = lateBuckets.reduce((s, b) => s + b.wins, 0);
  const lateWr = lateGames >= 3 ? pct(lateWins, lateGames) : null;
  const lateScore = lateWr != null ? clamp(Math.round(50 + (lateWr - 50) * 1.4), 15, 98) : null;

  // 5. Pool de Civs (diversidad real + rendimiento en top civs)
  const distinctCivs = stats?.totalDistinctCivs || 0;
  const top3Civs = (stats?.topCivs || []).slice(0, 3);
  const top3Games = top3Civs.reduce((s, c) => s + c.games, 0);
  const top3Wins = top3Civs.reduce((s, c) => s + c.wins, 0);
  const top3Wr = top3Games >= 3 ? pct(top3Wins, top3Games) : overallWr;
  const hasCivs = distinctCivs > 0 && top3Games >= 3;
  // Diversidad (hasta 40 pts por 20+ civs) + dominio en tus civs principales (hasta 58 pts)
  const civsScore = hasCivs
    ? clamp(Math.round(Math.min(40, distinctCivs * 2.2) + ((top3Wr || 50) * 0.6)), 18, 98)
    : null;

  // 6. Control de Mapas (WR ponderado en los mapas jugados >= 2 veces)
  const mapPool = (stats?.topMaps || []).filter((m) => m.games >= 2 && m.winRate != null);
  const mapGames = mapPool.reduce((s, m) => s + m.games, 0);
  const mapWins = mapPool.reduce((s, m) => s + m.wins, 0);
  const mapWr = mapGames >= 3 ? pct(mapWins, mapGames) : null;
  const mapsScore = mapWr != null ? clamp(Math.round(50 + (mapWr - 50) * 1.6), 15, 98) : null;

  return [
    {
      id: 'consistency',
      labelKey: 'central.axisConsistency',
      fallbackLabel: 'Consistencia',
      hasData: hasConsistency,
      score: consistencyScore,
      displayValue: hasConsistency ? `${overallWr}% WR` : 'Sin muestra',
      detail: hasConsistency ? `${ladder.wins}V - ${ladder.losses}D (${totalGames} pj)` : 'Requiere 3+ partidas',
    },
    {
      id: 'macro',
      labelKey: 'central.axisMacro',
      fallbackLabel: 'Ritmo · eAPM',
      hasData: hasMacro,
      score: macroScore,
      displayValue: avgEapm != null ? `${avgEapm} eAPM` : (avgTc != null ? `${avgTc}% TC` : 'Sin muestra'),
      detail: avgEapm != null && rivalEapm != null
        ? `Vos ${avgEapm} vs ${rivalEapm} rival (${insights.eapm.sampleCount} rep)`
        : (avgTc != null ? `${telemetrySummary.analyzedReplays} replays locales` : 'Solo disponible con replays'),
    },
    {
      id: 'tempo',
      labelKey: 'central.axisTempo',
      fallbackLabel: 'Early · <30m',
      hasData: earlyScore != null,
      score: earlyScore,
      displayValue: earlyWr != null ? `${earlyWr}% WR` : 'Sin muestra',
      detail: earlyGames >= 3 ? `${earlyWins}V - ${earlyGames - earlyWins}D (${earlyGames} pj)` : 'Sin replays <30m',
    },
    {
      id: 'lategame',
      labelKey: 'central.axisLate',
      fallbackLabel: 'Late · 30m+',
      hasData: lateScore != null,
      score: lateScore,
      displayValue: lateWr != null ? `${lateWr}% WR` : 'Sin muestra',
      detail: lateGames >= 3 ? `${lateWins}V - ${lateGames - lateWins}D (${lateGames} pj)` : 'Sin replays 30m+',
    },
    {
      id: 'versatility',
      labelKey: 'central.axisCivs',
      fallbackLabel: 'Pool de Civs',
      hasData: hasCivs,
      score: civsScore,
      displayValue: hasCivs ? `${distinctCivs} civs` : 'Sin muestra',
      detail: stats?.topCivs?.[0]
        ? `Top: ${stats.topCivs[0].civ} (${stats.topCivs[0].games} pj · ${stats.topCivs[0].winRate ?? '—'}%)`
        : 'Sin historial',
    },
    {
      id: 'maps',
      labelKey: 'central.axisMaps',
      fallbackLabel: 'Mapas',
      hasData: mapsScore != null,
      score: mapsScore,
      displayValue: mapWr != null ? `${mapWr}% WR` : 'Sin muestra',
      detail: stats?.topMaps?.[0]
        ? `${stats.topMaps[0].mapName} (${stats.topMaps[0].games} pj · ${stats.topMaps[0].winRate ?? '—'}%)`
        : 'Sin historial',
    },
  ];
}

function summarizeFormFromSeries(eloSeries) {
  const known = (Array.isArray(eloSeries) ? eloSeries : []).filter((p) => typeof p.won === 'boolean');
  const last15 = known.slice(-15).map((p) => ({
    won: p.won,
    diff: p.diff,
    rating: p.rating,
    startedAt: p.startedAt,
  }));
  const last10 = known.slice(-10);
  const wins10 = last10.filter((p) => p.won).length;
  const losses10 = last10.length - wins10;
  const delta10 = last10.length >= 2
    ? last10[last10.length - 1].rating - last10[0].rating + (last10[0].diff || 0)
    : (last10.length === 1 ? (last10[0].diff || 0) : null);

  return {
    recentForm: last15,
    last10: last10.length ? {
      games: last10.length,
      wins: wins10,
      losses: losses10,
      winRate: pct(wins10, last10.length),
      netElo: delta10,
    } : null,
  };
}

/**
 * Las métricas de la última partida y forma reciente comparadas contra la ventana
 * seleccionable de las últimas 10 o 20 partidas del mismo modo (ELO, winrate,
 * duración válida, eAPM y uso de TC local).
 */
function computeLastMatchVsAvg({
  modeMatches = [],
  eloSeries = [],
  insightsRows = [],
  storedRecords = [],
  isOwnProfile = true,
  modeLabel = null,
}) {
  const [latestMatch, ...rest] = Array.isArray(modeMatches) ? modeMatches : [];
  const series = Array.isArray(eloSeries) ? eloSeries : [];
  const latestSeries = series.length ? series[series.length - 1] : null;
  if (!latestMatch?.matchId && series.length < 3) return null;

  const mode = latestMatch ? resolveMode(latestMatch.leaderboardId) : null;
  const prior = latestMatch && mode
    ? rest.filter((row) => resolveMode(row.leaderboardId)?.key === mode.key)
    : [];

  // Deduplicar filas de AoE2Insights por matchId (en TG vienen 1 fila por jugador)
  const insightById = new Map();
  const uniqueInsightEapms = [];
  for (const row of (Array.isArray(insightsRows) ? insightsRows : [])) {
    const val = Number(row?.meanEapm ?? row?.eapm);
    const valid = Number.isFinite(val) && val > 5 && val < 250;
    const key = row?.matchId != null ? String(row.matchId) : null;
    if (key) {
      if (!insightById.has(key) || (valid && !(Number(insightById.get(key)?.meanEapm ?? insightById.get(key)?.eapm) > 5))) {
        insightById.set(key, row);
      }
    }
  }
  const latestId = latestMatch?.matchId != null ? String(latestMatch.matchId) : null;
  for (const [k, row] of insightById.entries()) {
    if (latestId && k === latestId) continue;
    const val = Number(row?.meanEapm ?? row?.eapm);
    if (Number.isFinite(val) && val > 5 && val < 250) {
      uniqueInsightEapms.push({
        matchId: k,
        startedAt: Number(row?.startedAt) || 0,
        eapm: val,
      });
    }
  }
  uniqueInsightEapms.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

  const recordsById = new Map((Array.isArray(storedRecords) ? storedRecords : [])
    .filter((row) => row && (row.matchId || row.match?.matchId))
    .map((row) => [String(row.matchId || row.match.matchId), row]));

  const eapmOf = (m) => {
    if (!m?.matchId) return null;
    const row = insightById.get(String(m.matchId));
    const value = Number(row?.meanEapm ?? row?.eapm);
    return Number.isFinite(value) && value > 5 && value < 250 ? value : null;
  };
  const tcOf = (m) => {
    if (!m?.matchId) return null;
    const rec = recordsById.get(String(m.matchId));
    const self = rec?.telemetry?.engineSummary?.self ?? rec?.telemetry?.engine?.self;
    const value = self?.tcUtilizationEarly ?? self?.tcUtilization;
    return Number.isFinite(value) ? value : null;
  };
  // Filtrar partidas válidas (>= 3 min y < 6 h) para evitar que dodges de 10s distorsionen el promedio
  const validMinutes = (m) => (
    Number.isFinite(m?.durationSeconds) && m.durationSeconds >= 180 && m.durationSeconds < 6 * 3600
      ? m.durationSeconds / 60
      : null
  );

  const summary = {
    matchId: latestId,
    won: latestMatch?.won ?? (typeof latestSeries?.won === 'boolean' ? latestSeries.won : null),
    mapName: latestMatch?.mapName || null,
    myCiv: latestMatch?.myCiv || null,
    rivalCiv: latestMatch?.rivalCiv || null,
    ratingDiff: latestMatch?.myRatingDiff ?? latestSeries?.diff ?? null,
    durationSeconds: latestMatch?.durationSeconds ?? null,
    startedAt: latestMatch?.startedAt ?? latestSeries?.startedAt ?? null,
    modeLabel: latestMatch?.modeLabel || modeLabel || null,
  };

  const buildWindow = (winN) => {
    const metrics = [];

    // 1. ELO actual vs promedio de las últimas N partidas del modo (siempre reacciona a 10 vs 20)
    if (series.length >= 3) {
      const slice = series.slice(-winN);
      const currentElo = series[series.length - 1].rating;
      const meanElo = avg(slice.map((p) => p.rating), 0);
      if (Number.isFinite(currentElo) && Number.isFinite(meanElo)) {
        const delta = Math.round(currentElo - meanElo);
        metrics.push({
          id: 'eloAvg',
          label: `ELO vs media (${slice.length} pj)`,
          latestText: `${Math.round(currentElo)}`,
          avgText: `${Math.round(meanElo)}`,
          deltaText: `${delta > 0 ? '+' : ''}${delta} ELO`,
          improved: delta > 0,
          neutral: delta === 0,
          sampleText: `Media de tus últ. ${slice.length} clasificatorias`,
        });
      }

      // 2. Winrate en ventana N (Últ. 10 vs Últ. 20)
      const known = series.filter((p) => typeof p.won === 'boolean');
      if (known.length >= 3) {
        const wSlice = known.slice(-winN);
        const wins = wSlice.filter((p) => p.won).length;
        const losses = wSlice.length - wins;
        const wr = pct(wins, wSlice.length);
        const net = wSlice.length >= 2
          ? (wSlice[wSlice.length - 1].rating - wSlice[0].rating + (wSlice[0].diff || 0))
          : (wSlice[0]?.diff || 0);
        metrics.push({
          id: 'windowWr',
          label: `Winrate últ. ${wSlice.length}`,
          latestText: `${wr}%`,
          avgText: `${wins}V - ${losses}D`,
          deltaText: `${net > 0 ? '+' : ''}${Math.round(net)} ELO`,
          improved: net > 0 || (net === 0 && wr >= 50),
          neutral: net === 0 && wr === 50,
          sampleText: `Balance en tus últ. ${wSlice.length} partidas`,
        });
      }
    }

    // 3. Duración (filtrando dodges < 3 min)
    if (latestMatch) {
      const lastMin = validMinutes(latestMatch);
      const durSample = prior.map(validMinutes).filter(Number.isFinite).slice(0, winN);
      if (Number.isFinite(lastMin) && durSample.length >= 2) {
        const mean = avg(durSample, 1);
        const delta = Math.round((lastMin - mean) * 10) / 10;
        metrics.push({
          id: 'duration',
          label: 'Duración',
          latestText: `${Math.round(lastMin * 10) / 10} min`,
          avgText: `${mean} min`,
          deltaText: `${delta > 0 ? '+' : ''}${delta} min`,
          improved: delta > 0,
          neutral: true,
          sampleText: `${durSample.length} partidas previas del modo`,
        });
      }

      // 4. Ritmo eAPM (usa todo el pool de replays AoE2Insights del modo hasta winN)
      const lastEapm = eapmOf(latestMatch);
      if (Number.isFinite(lastEapm)) {
        const priorFromMatches = prior.map(eapmOf).filter(Number.isFinite);
        const pool = priorFromMatches.length >= winN
          ? priorFromMatches.slice(0, winN)
          : uniqueInsightEapms.map((r) => r.eapm).slice(0, winN);
        if (pool.length >= 2) {
          const mean = avg(pool, 1);
          const delta = Math.round((lastEapm - mean) * 10) / 10;
          metrics.push({
            id: 'eapm',
            label: 'Ritmo eAPM',
            latestText: `${Math.round(lastEapm * 10) / 10}`,
            avgText: `${mean}`,
            deltaText: `${delta > 0 ? '+' : ''}${delta}`,
            improved: delta > 0,
            neutral: true,
            sampleText: pool.length < winN
              ? `${pool.length} replays disponibles del modo`
              : `${pool.length} replays previos del modo`,
          });
        }
      }

      // 5. Uso estimado de TC (solo perfil propio con replays locales analizados)
      if (isOwnProfile) {
        const lastTc = tcOf(latestMatch);
        const tcSample = prior.map(tcOf).filter(Number.isFinite).slice(0, winN);
        if (Number.isFinite(lastTc) && tcSample.length >= 2) {
          const mean = avg(tcSample, 1);
          const delta = Math.round((lastTc - mean) * 10) / 10;
          metrics.push({
            id: 'tc',
            label: 'Uso estimado de TC',
            latestText: `${Math.round(lastTc * 10) / 10}%`,
            avgText: `${mean}%`,
            deltaText: `${delta > 0 ? '+' : ''}${delta} pp`,
            improved: delta > 0,
            neutral: delta === 0,
            sampleText: tcSample.length < winN
              ? `${tcSample.length} replays locales disponibles`
              : `${tcSample.length} replays locales previos`,
          });
        }
      }
    }

    return { windowSize: winN, metrics };
  };

  const w10 = buildWindow(10);
  const w20 = buildWindow(20);
  if (!w10.metrics.length && !w20.metrics.length) return null;
  return { summary, windows: { 10: w10, 20: w20 } };
}

/** Construye el dashboard por modo con la cobertura de cada fuente. */
function computeCentralAnalytics({
  profileId,
  alias = null,
  ladder1v1 = null,
  ladderTeam = null,
  profileData = null,
  matches1v1 = [],
  matchesTeam = [],
  matchesAll = [],
  storedRecords = [],
  insights1v1 = null,
  insightsTeam = null,
  isOwnProfile = true,
  ownProfileId = null,
  matches = [],
} = {}) {
  const pid = Number(profileId);
  const rawAll = matchesAll.length ? matchesAll : matches;
  const raw1v1 = matches1v1.length ? matches1v1 : rawAll.filter((m) => isRm1v1Match(m));
  const rawTeam = matchesTeam.length ? matchesTeam : rawAll.filter((m) => isRmTeamMatch(m));

  const allSummaries = mergeRecentMatches(rawAll, isOwnProfile ? storedRecords : [], pid, 60);
  const rm1v1Summaries = mergeRecentMatches(
    raw1v1,
    isOwnProfile ? storedRecords.filter((r) => isRm1v1Match(r?.match)) : [],
    pid,
    50,
  );
  const rmTeamSummaries = mergeRecentMatches(
    rawTeam,
    isOwnProfile ? storedRecords.filter((r) => isRmTeamMatch(r?.match)) : [],
    pid,
    50,
  );

  // Ladders oficiales desde Companion + World's Edge
  const companionLadders = Array.isArray(profileData?.leaderboards) ? profileData.leaderboards : [];
  const findCompLadder = (id) => companionLadders.find((l) => l && l.leaderboardId === id) || null;
  const companionStats = Array.isArray(profileData?.stats) ? profileData.stats : [];
  const findCompStats = (id) => companionStats.find((s) => s && s.leaderboardId === id) || null;

  const buildLadderObj = (id, weData = null) => {
    const comp = findCompLadder(id);
    if (!comp && !weData) return null;
    const wins = Number(weData?.wins ?? comp?.wins ?? 0);
    const losses = Number(weData?.losses ?? comp?.losses ?? 0);
    const games = wins + losses;
    const rating = weData?.rating ?? comp?.rating ?? null;
    if (!rating && games <= 0) return null;
    const rank = weData?.rank ?? comp?.rank ?? null;
    const rankTotal = weData?.rankTotal ?? comp?.total ?? null;
    return {
      id,
      label: MODE_LABELS[id] || id,
      rating,
      peak: weData?.peak ?? comp?.maxRating ?? rating,
      rank,
      rankTotal,
      ladderPercentile: weData?.ladderPercentile ?? (rank && rankTotal ? Math.round((rank / rankTotal) * 1000) / 10 : null),
      wins,
      losses,
      games,
      winRate: pct(wins, games),
      streak: weData?.streak ?? comp?.streak ?? null,
    };
  };

  const ladderMap = {
    rm_1v1: buildLadderObj('rm_1v1', ladder1v1),
    rm_team: buildLadderObj('rm_team', ladderTeam),
    ew_1v1: buildLadderObj('ew_1v1'),
    ew_team: buildLadderObj('ew_team'),
  };

  const allLadders = MODE_ORDER.map((id) => ladderMap[id]).filter(Boolean);

  // Telemetría local medida (solo para perfil propio)
  const validRecords = isOwnProfile
    ? (Array.isArray(storedRecords) ? storedRecords : []).filter((r) => r && r.telemetry && Number(r.profileId) === pid)
    : [];
  const tcUtilList = [];
  const tcIdleEarlyList = [];
  const vilsPerMinList = [];
  const localEapmList = [];
  const feudalSecList = [];
  const castleSecList = [];
  const imperialSecList = [];

  for (const rec of validRecords) {
    const t = rec.telemetry;
    const self = t.engine?.self;
    if (self) {
      if (Number.isFinite(self.tcUtilizationEarly ?? self.tcUtilization)) {
        tcUtilList.push(self.tcUtilizationEarly ?? self.tcUtilization);
      }
      if (Number.isFinite(self.tcIdleEarlySeconds ?? self.tcIdleSeconds)) {
        tcIdleEarlyList.push(self.tcIdleEarlySeconds ?? self.tcIdleSeconds);
      }
      const mins = Math.max(1, ((t.engine.durationSeconds || t.durationSeconds || 600) / 60));
      if (Number.isFinite(self.villagersOrdered) && self.villagersOrdered > 0) {
        vilsPerMinList.push(self.villagersOrdered / mins);
      }
      if (Number.isFinite(self.eapm) && self.eapm > 0) localEapmList.push(self.eapm);
    }
    const m = t.metrics || {};
    if (Number.isFinite(m.eapm?.value) && m.eapm.value > 0 && (!self || !Number.isFinite(self.eapm))) {
      localEapmList.push(m.eapm.value);
    }
    if (Number.isFinite(m.feudalSeconds?.value)) feudalSecList.push(m.feudalSeconds.value);
    if (Number.isFinite(m.castleSeconds?.value)) castleSecList.push(m.castleSeconds.value);
    if (Number.isFinite(m.imperialSeconds?.value)) imperialSecList.push(m.imperialSeconds.value);
  }

  const telemetrySummary = {
    analyzedReplays: validRecords.length,
    avgTcUtilization: avg(tcUtilList, 1),
    avgTcIdleEarlySeconds: avg(tcIdleEarlyList, 0),
    avgVillagersPerMin: avg(vilsPerMinList, 2),
    avgEapm: avg(localEapmList, 1),
    avgFeudalSeconds: avg(feudalSecList, 0),
    avgCastleSeconds: avg(castleSecList, 0),
    avgImperialSeconds: avg(imperialSecList, 0),
  };

  // Análisis AoE2Insights por modo
  const parsedRows1v1 = parseScoutRows(insights1v1 || {});
  const parsedRowsTeam = parseScoutRows(insightsTeam || {});
  const insightsByMode = {
    rm_1v1: analyzeInsightsRows(parsedRows1v1),
    rm_team: analyzeInsightsRows(parsedRowsTeam),
    ew_1v1: null,
    ew_team: null,
    global: analyzeInsightsRows([...parsedRows1v1, ...parsedRowsTeam]),
  };

  // Construimos cada modo clasificado con datos 100% puros y completos (all-time)
  const modes = {};
  for (const modeId of MODE_ORDER) {
    const ladder = ladderMap[modeId];
    const statsBlock = findCompStats(modeId);
    const fallbackMatches = modeId === 'rm_1v1' ? rm1v1Summaries : modeId === 'rm_team' ? rmTeamSummaries : [];
    const stats = parseAllTimeStatsBlock(statsBlock ? [statsBlock] : [], fallbackMatches);
    if (!ladder && stats.totalCivGames === 0) continue;

    const eloSeries = buildPureEloSeries(profileData, fallbackMatches, modeId, ladder?.rating ?? null, 250);
    const form = summarizeFormFromSeries(eloSeries);
    const ins = insightsByMode[modeId];
    const durationAnalysis = (ins?.durationAnalysis?.total >= 4)
      ? { ...ins.durationAnalysis, sourceLabel: `AoE2Insights · ${ins.durationAnalysis.total} partidas` }
      : (() => {
          const fromMatches = buildDurationBuckets(fallbackMatches);
          return fromMatches.total >= 3
            ? { ...fromMatches, sourceLabel: `Últimas ${fromMatches.total} partidas del modo` }
            : null;
        })();

    const eloValues = eloSeries.map((p) => p.rating);
    const beforeVsNow = computeBeforeVsNow({
      modeLabel: MODE_LABELS[modeId],
      eloSeries,
      insightsAnalysis: ins,
      storedRecords: validRecords,
      profileId: pid,
      isOwnProfile,
    });
    const radarAxes = buildHonestRadar({
      ladder,
      stats,
      insights: ins,
      durationAnalysis,
      telemetrySummary,
      isOwnProfile,
    });

    const modeInsRows = modeId === 'rm_1v1' ? parsedRows1v1 : modeId === 'rm_team' ? parsedRowsTeam : [];
    const lastMatchVsAvg = computeLastMatchVsAvg({
      modeMatches: fallbackMatches,
      eloSeries,
      insightsRows: modeInsRows,
      storedRecords: validRecords,
      isOwnProfile,
      modeLabel: MODE_LABELS[modeId],
    });

    modes[modeId] = {
      id: modeId,
      label: MODE_LABELS[modeId],
      ladder,
      stats,
      eloSeries,
      eloStats: {
        min: eloValues.length ? Math.min(...eloValues) : null,
        max: eloValues.length ? Math.max(...eloValues) : null,
        start: eloValues.length ? eloValues[0] : null,
        latest: eloValues.length ? eloValues[eloValues.length - 1] : (ladder?.rating ?? null),
        peak: ladder?.peak ?? (eloValues.length ? Math.max(...eloValues) : null),
        netDelta: eloSeries.length >= 2 ? eloSeries[eloSeries.length - 1].rating - eloSeries[0].rating : null,
        totalPoints: eloSeries.length,
      },
      recentForm: form.recentForm,
      last10: form.last10,
      insights: ins,
      durationAnalysis,
      beforeVsNow,
      lastMatchVsAvg,
      radarAxes,
    };
  }

  // Modo Global: carrera completa sumando TODOS los ladders del perfil
  const globalWins = companionLadders.reduce((s, l) => s + (Number(l?.wins) || 0), 0);
  const globalLosses = companionLadders.reduce((s, l) => s + (Number(l?.losses) || 0), 0);
  const globalGames = Number(profileData?.games) || (globalWins + globalLosses);
  const globalDrops = Number(profileData?.drops) || 0;
  const globalDropRate = globalGames > 0 ? Math.round((globalDrops / globalGames) * 1000) / 10 : null;
  const bestRatingLadder = allLadders.length
    ? [...allLadders].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0]
    : null;
  const bestRankLadder = allLadders.filter((l) => l.rank > 0).length
    ? [...allLadders.filter((l) => l.rank > 0)].sort((a, b) => a.rank - b.rank)[0]
    : null;

  const globalLadder = {
    id: 'global',
    label: 'Global',
    rating: bestRatingLadder?.rating ?? null,
    ratingModeLabel: bestRatingLadder?.label ?? null,
    peak: allLadders.length ? Math.max(...allLadders.map((l) => l.peak || l.rating || 0)) : null,
    rank: bestRankLadder?.rank ?? null,
    rankModeLabel: bestRankLadder?.label ?? null,
    rankTotal: bestRankLadder?.rankTotal ?? null,
    ladderPercentile: bestRankLadder?.ladderPercentile ?? null,
    wins: globalWins,
    losses: globalLosses,
    games: globalGames,
    winRate: pct(globalWins, globalWins + globalLosses),
    drops: globalDrops,
    dropRate: globalDropRate,
    streak: null,
  };
  const globalStats = parseAllTimeStatsBlock(companionStats, allSummaries);
  const globalIns = insightsByMode.global;
  const globalDuration = globalIns?.durationAnalysis?.total >= 4
    ? { ...globalIns.durationAnalysis, sourceLabel: `AoE2Insights · ${globalIns.durationAnalysis.total} partidas` }
    : (() => {
        const fromMatches = buildDurationBuckets(allSummaries);
        return fromMatches.total >= 3
          ? { ...fromMatches, sourceLabel: `Últimas ${fromMatches.total} partidas` }
          : null;
      })();

  modes.global = {
    id: 'global',
    label: 'Global',
    ladder: globalLadder,
    stats: globalStats,
    eloSeries: [],
    eloStats: { min: null, max: null, start: null, latest: globalLadder.rating, peak: globalLadder.peak, netDelta: null, totalPoints: 0 },
    recentForm: allSummaries.slice(0, 15).filter((m) => typeof m.won === 'boolean').reverse().map((m) => ({
      won: m.won,
      diff: m.myRatingDiff,
      rating: m.myRating,
      startedAt: m.startedAt,
    })),
    last10: null,
    insights: globalIns,
    durationAnalysis: globalDuration,
    beforeVsNow: computeBeforeVsNow({
      modeLabel: modes.rm_1v1?.eloSeries?.length >= 6 ? 'RM 1v1' : 'RM Team',
      eloSeries: modes.rm_1v1?.eloSeries?.length >= 6 ? modes.rm_1v1.eloSeries : (modes.rm_team?.eloSeries || []),
      insightsAnalysis: globalIns,
      storedRecords: validRecords,
      profileId: pid,
      isOwnProfile,
    }),
    lastMatchVsAvg: computeLastMatchVsAvg({
      modeMatches: allSummaries,
      eloSeries: modes.rm_1v1?.eloSeries?.length >= 6 ? modes.rm_1v1.eloSeries : (modes.rm_team?.eloSeries || []),
      insightsRows: [...parsedRows1v1, ...parsedRowsTeam],
      storedRecords: validRecords,
      isOwnProfile,
      modeLabel: 'Global',
    }),
    radarAxes: buildHonestRadar({
      ladder: globalLadder,
      stats: globalStats,
      insights: globalIns,
      durationAnalysis: globalDuration,
      telemetrySummary,
      isOwnProfile,
    }),
    ladderComparison: allLadders,
  };

  const availableModes = [...MODE_ORDER.filter((id) => Boolean(modes[id])), 'global'];
  // Modo por defecto: RM 1v1 si tiene partidas, si no el ranked más jugado, si no global
  const defaultModeId = modes.rm_1v1 && (modes.rm_1v1.ladder?.games || 0) >= 3
    ? 'rm_1v1'
    : (allLadders.length
      ? [...allLadders].sort((a, b) => (b.games || 0) - (a.games || 0))[0].id
      : 'global');

  const active = modes[defaultModeId] || modes.global;

  return {
    ok: true,
    profileId: pid,
    ownProfileId: ownProfileId ? Number(ownProfileId) : null,
    isOwnProfile: Boolean(isOwnProfile),
    alias: alias || profileData?.name || null,
    clan: profileData?.clan || ladder1v1?.clan || null,
    country: profileData?.country || ladder1v1?.country || null,
    countryIcon: profileData?.countryIcon || '',
    countryName: profileData?.countryName || null,
    platformName: profileData?.platformName || profileData?.platform || null,
    totalProfileGames: globalGames || null,
    totalDrops: globalDrops,
    dropRate: globalDropRate,
    fetchedAt: Date.now(),
    defaultModeId,
    availableModes,
    modes,
    allLadders,
    // Campos de compatibilidad hacia atrás (espejan el modo activo por defecto)
    primaryModeLabel: active.label,
    ladders: {
      rm1v1: ladderMap.rm_1v1 || null,
      rmTeam: ladderMap.rm_team || null,
    },
    telemetrySummary: {
      ...telemetrySummary,
      avgEapm: active.insights?.eapm?.avgSelf ?? telemetrySummary.avgEapm,
      peakEapm: active.insights?.eapm?.peakSelf ?? null,
      rivalAvgEapm: active.insights?.eapm?.avgRival ?? null,
      outpacedWinRate: active.insights?.eapm?.outpacedWinRate ?? null,
    },
    beforeVsNow: active.beforeVsNow,
    radarAxes: active.radarAxes,
    eloSeries: active.eloSeries,
    eloSeries1v1: modes.rm_1v1?.eloSeries || [],
    eloSeriesTeam: modes.rm_team?.eloSeries || [],
    activeEloLadderLabel: active.label,
    eloStats: active.eloStats,
    topCivs: active.stats.topCivs,
    topMaps: active.stats.topMaps,
    vsOpenings: active.insights?.vsOpenings || [],
    byOpenness: active.insights?.byOpenness || [],
    playstyle: {
      analyzedReplays: active.insights?.classifiedCount || 0,
      aggressiveShare: active.insights?.agroShare ?? null,
      boomShare: active.insights?.boomShare ?? null,
      hybridShare: (active.insights?.agroShare != null && active.insights?.boomShare != null)
        ? Math.max(0, 100 - active.insights.agroShare - active.insights.boomShare)
        : null,
      openings: active.insights?.openings || [],
    },
    recentMatches: allSummaries.slice(0, 15),
    last10Matches: allSummaries.slice(0, 10),
  };
}

/**
 * Carga completa de datos para la pestaña Central (perfil propio o buscado),
 * con caché en memoria (5 min por jugador) y respaldo en disco para el propio.
 */
async function fetchCentralDashboard({
  profileId,
  alias = null,
  cache = null,
  performanceStore = null,
  diskCachePath = null,
  force = false,
  isOwnProfile = true,
  ownProfileId = null,
  log = () => {},
} = {}) {
  const pid = Number(profileId);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { ok: false, error: 'Seleccioná o detectá tu cuenta primero.', profileId: null };
  }

  const storedRecords = (isOwnProfile && performanceStore) ? performanceStore.list(pid) : [];
  const cacheKey = `central:v3:${pid}`;

  if (!force && cache && cache.get(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.ts < 5 * 60 * 1000) {
      return computeCentralAnalytics({
        ...cached.raw,
        alias: alias || cached.raw.alias,
        storedRecords,
        isOwnProfile,
        ownProfileId,
      });
    }
  }

  const [stats1v1Res, statsTeamRes, profileDataRes, matches1v1Res, matchesTeamRes, matchesAllRes, insights1v1Res, insightsTeamRes] = await Promise.allSettled([
    fetchPersonalStats([pid], 3, 7000),
    fetchPersonalStats([pid], 4, 7000),
    getJson(`https://data.aoe2companion.com/api/profiles/${encodeURIComponent(pid)}?use_enums=true&extend=stats`, 10000),
    fetchMatches(pid, 40, 1, 'rm_1v1', { priority: 'own' }),
    fetchMatches(pid, 40, 1, 'rm_team', { priority: 'own' }),
    fetchMatches(pid, 30, 1, null, { priority: 'own' }),
    fetchOpeningRows(pid, { mode: resolveMode(3), limit: 100 }),
    fetchOpeningRows(pid, { mode: resolveMode(4), limit: 100 }),
  ]);

  let ladder1v1 = stats1v1Res.status === 'fulfilled' ? (stats1v1Res.value.get(pid) || null) : null;
  let ladderTeam = statsTeamRes.status === 'fulfilled' ? (statsTeamRes.value.get(pid) || null) : null;
  let profileData = profileDataRes.status === 'fulfilled' ? profileDataRes.value : null;
  let matches1v1 = matches1v1Res.status === 'fulfilled' ? matches1v1Res.value : [];
  let matchesTeam = matchesTeamRes.status === 'fulfilled' ? matchesTeamRes.value : [];
  let matchesAll = matchesAllRes.status === 'fulfilled' ? matchesAllRes.value : [];
  let insights1v1 = insights1v1Res.status === 'fulfilled' ? insights1v1Res.value : null;
  let insightsTeam = insightsTeamRes.status === 'fulfilled' ? insightsTeamRes.value : null;

  // Si la red falló por completo y existe caché en disco del perfil propio, lo usamos
  if (!profileData && !matchesAll.length && isOwnProfile && diskCachePath) {
    const disk = readDiskCache(diskCachePath, pid);
    if (disk && disk.raw) {
      log(`central: usando caché en disco para #${pid}`);
      return computeCentralAnalytics({
        ...disk.raw,
        alias: alias || disk.raw.alias,
        storedRecords,
        isOwnProfile,
        ownProfileId,
      });
    }
  }

  const raw = {
    profileId: pid,
    alias: alias || profileData?.name || null,
    ladder1v1,
    ladderTeam,
    profileData,
    matches1v1,
    matchesTeam,
    matchesAll,
    insights1v1,
    insightsTeam,
  };

  if (profileData || matchesAll.length || matches1v1.length) {
    if (cache) cache.set(cacheKey, { ts: Date.now(), raw });
    if (isOwnProfile && diskCachePath) writeDiskCache(diskCachePath, pid, raw);
  }

  return computeCentralAnalytics({
    ...raw,
    storedRecords,
    isOwnProfile,
    ownProfileId,
  });
}

module.exports = {
  isRm1v1Match,
  isRmTeamMatch,
  summarizeOwnMatch,
  mergeRecentMatches,
  buildDurationBuckets,
  analyzeInsightsRows,
  buildPureEloSeries,
  parseAllTimeStatsBlock,
  computeBeforeVsNow,
  buildHonestRadar,
  computeCentralAnalytics,
  fetchCentralDashboard,
};
