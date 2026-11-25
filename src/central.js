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
const { fetchMatches, fetchPersonalStats, fetchExtendedProfile } = require('./aoe');
const { civSlug } = require('./civs');
const { resolveMode, mapKey } = require('./rival');
const { fetchOpeningRows } = require('./insights');
const { parseScoutRows } = require('./scout');
const { buildUnifiedModeMatches, buildModeCivDiagnostics, computeInsightsCoverage } = require('./civ-diagnostic');
const { computeModeDiscoveries } = require('./central-discoveries');
const {
  buildModeMapDiagnostics,
  computePersonalAcademy,
  computeEloAttributionAndSession,
} = require('./central-intel');
const { COMPANION_DEPTH, SAMPLE_POLICY } = require('./sample-policy');

const centralInflight = new Map();

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
  'Scouts into Archers': 'agro',
  'Drush Archers': 'agro',
  'M@A Archers': 'agro',
  'M@A Scouts': 'agro',
  'Drush M@A': 'agro',
  'Fast castle': 'boom',
  'Fast Castle': 'boom',
  '2TC Feudal Boom': 'boom',
  'FC Boom': 'boom',
  'Drush fast castle': 'hybrid',
  'Drush FC': 'hybrid',
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

function isEw1v1Match(m) {
  if (!m) return false;
  const lid = String(m.leaderboardId || '').toLowerCase();
  if (lid === 'ew_1v1' || lid === '13') return true;
  const lname = String(m.leaderboardName || '').toLowerCase();
  return lname.includes('empire wars') && lname.includes('1v1');
}

function isEwTeamMatch(m) {
  if (!m) return false;
  const lid = String(m.leaderboardId || '').toLowerCase();
  if (lid === 'ew_team' || lid === '14') return true;
  const lname = String(m.leaderboardName || '').toLowerCase();
  return lname.includes('empire wars') && lname.includes('team');
}

/**
 * Fusiona monotónicamente listas de partidas de AoE2 Companion por `matchId`,
 * priorizando los registros más frescos (para capturar `won`/`ratingDiff` ya asentados)
 * y conservando el historial previo en disco hasta `maxCount` partidas.
 */
function mergeRawMatches(freshList = [], cachedList = [], maxCount = COMPANION_DEPTH.OWN_MAX_PER_MODE) {
  const byId = new Map();
  for (const m of (Array.isArray(cachedList) ? cachedList : [])) {
    if (!m || !m.matchId) continue;
    byId.set(String(m.matchId), m);
  }
  for (const m of (Array.isArray(freshList) ? freshList : [])) {
    if (!m || !m.matchId) continue;
    byId.set(String(m.matchId), m);
  }
  return [...byId.values()]
    .sort((a, b) => (Number(b.startedAt || 0) - Number(a.startedAt || 0)) || (Number(b.matchId || 0) - Number(a.matchId || 0)))
    .slice(0, maxCount);
}

function ladderTotalGamesOf(raw, ladderKey) {
  const lbs = Array.isArray(raw?.profileData?.leaderboards) ? raw.profileData.leaderboards : [];
  const lb = lbs.find((l) => String(l?.leaderboardId || '').toLowerCase() === ladderKey);
  if (!lb) return null;
  const w = Number(lb.wins || 0);
  const l = Number(lb.losses || 0);
  return Number.isFinite(w + l) ? (w + l) : null;
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
    const tmp = `${diskCachePath}.${process.pid}.tmp`;
    const payload = JSON.stringify({ profileId: Number(pid), ts: Date.now(), raw });
    fs.promises.writeFile(tmp, payload, 'utf8')
      .then(() => fs.promises.rename(tmp, diskCachePath))
      .catch(() => { fs.promises.unlink(tmp).catch(() => {}); });
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

function resolveGameDurationSec(item) {
  if (!item) return null;
  if (Number.isFinite(Number(item.durationGameSec)) && Number(item.durationGameSec) > 0) return Number(item.durationGameSec);
  // AoE2Insights `duration` ya viene en reloj de juego (1.7x) cuando tiene estrategia o eAPM
  if (Number.isFinite(Number(item.duration)) && Number(item.duration) > 0) {
    return (item.strategy || Number.isFinite(Number(item.meanEapm)))
      ? Number(item.duration)
      : Math.max(0, (Number(item.duration) - 40) * 1.7);
  }
  // AoE2 Companion `durationSeconds` viene en tiempo real (1.0x) → convertir a 1.7x reloj de juego
  if (Number.isFinite(Number(item.durationSeconds)) && Number(item.durationSeconds) > 0) {
    return Math.max(0, (Number(item.durationSeconds) - 40) * 1.7);
  }
  return null;
}

function buildDurationBuckets(items, { isTeam = false } = {}) {
  // P0-2: Escala unificada en reloj de juego (1.7x), alineada 100% con killerWindow (1v1 vs TG)
  const buckets = isTeam
    ? [
        { id: 'early', label: '< 28m', sub: 'Feudal', min: 0, max: 28 * 60, games: 0, wins: 0, losses: 0 },
        { id: 'castle', label: '28–42m', sub: 'Castillos', min: 28 * 60, max: 42 * 60, games: 0, wins: 0, losses: 0 },
        { id: 'imp', label: '42–58m', sub: 'Imperial', min: 42 * 60, max: 58 * 60, games: 0, wins: 0, losses: 0 },
        { id: 'late', label: '58m+', sub: 'Post-Imp', min: 58 * 60, max: Infinity, games: 0, wins: 0, losses: 0 },
      ]
    : [
        { id: 'early', label: '< 22m', sub: 'Feudal', min: 0, max: 22 * 60, games: 0, wins: 0, losses: 0 },
        { id: 'castle', label: '22–35m', sub: 'Castillos', min: 22 * 60, max: 35 * 60, games: 0, wins: 0, losses: 0 },
        { id: 'imp', label: '35–50m', sub: 'Imperial', min: 35 * 60, max: 50 * 60, games: 0, wins: 0, losses: 0 },
        { id: 'late', label: '50m+', sub: 'Post-Imp', min: 50 * 60, max: Infinity, games: 0, wins: 0, losses: 0 },
      ];

  let counted = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const dur = resolveGameDurationSec(item);
    if (!Number.isFinite(dur) || dur < 300 || dur > 6 * 3600) continue;
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
    clockLabel: 'reloj de juego',
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
function normalizeInsightsRows(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.rows)) return input.rows;
  return parseScoutRows(input);
}
function analyzeInsightsRows(rawPayload, { isTeam = false } = {}) {
  const parsedRaw = normalizeInsightsRows(rawPayload);
  if (!parsedRaw.length) return null;
  // P0-3: Ordenar por fecha DESC para que mitades reciente vs anterior sean cronológicas (sobre todo en Global)
  const tsOf = (r) => (typeof r?.startedAt === 'number' ? r.startedAt : (r?.startedAt ? Date.parse(r.startedAt) || 0 : 0));
  const parsed = [...parsedRaw].sort((a, b) => tsOf(b) - tsOf(a));

  const eapmSelf = [];
  const eapmRival = [];
  let outpacedWins = 0;
  let outpacedGames = 0;
  const myOpenings = new Map();
  const vsOpenings = new Map();
  const opennessMap = new Map();
  let agroCount = 0;
  let boomCount = 0;
  let hybridCount = 0;
  let classifiedCount = 0;
  let vsHigher = { games: 0, wins: 0, losses: 0 };
  let vsLower = { games: 0, wins: 0, losses: 0 };

  for (const row of parsed) {
    const selfEapm = Number(row.meanEapm ?? row.eapm);
    const rivalEapm = Number(row.oppAvgEapm ?? row.oppMeanEapm ?? row.oppEapm);

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
    const oppElo = Number(row.oppAvgElo ?? row.oppElo);
    if (Number.isFinite(myElo) && Number.isFinite(oppElo) && myElo > 0 && oppElo > 0 && typeof row.won === 'boolean') {
      const target = oppElo > myElo ? vsHigher : vsLower;
      target.games += 1;
      if (row.won) target.wins += 1;
      else target.losses += 1;
    }

    const strat = row.strategy && row.strategy !== 'Unknown' ? row.strategy : null;
    if (strat) {
      const cat = OPENING_CATEGORY[strat] || null;
      if (cat) {
        classifiedCount += 1;
        if (cat === 'agro') agroCount += 1;
        else if (cat === 'boom') boomCount += 1;
        else if (cat === 'hybrid') hybridCount += 1;
      }

      const cur = myOpenings.get(strat) || { name: strat, games: 0, wins: 0, losses: 0, eapms: [] };
      cur.games += 1;
      if (row.won === true) cur.wins += 1;
      else if (row.won === false) cur.losses += 1;
      if (Number.isFinite(selfEapm) && selfEapm > 5) cur.eapms.push(selfEapm);
      myOpenings.set(strat, cur);
    }

    // P0-1: Contar aperturas de TODOS los rivales en TG sin duplicar dentro de una partida
    const oppStrats = (Array.isArray(row.opponents) && row.opponents.length)
      ? row.opponents.map((o) => o?.oppStrategy).filter((s) => s && s !== 'Unknown')
      : (row.oppStrategy && row.oppStrategy !== 'Unknown' ? [row.oppStrategy] : []);
    const seenOppStrat = new Set();
    if (typeof row.won === 'boolean') {
      for (const oppStrat of oppStrats) {
        if (seenOppStrat.has(oppStrat)) continue;
        seenOppStrat.add(oppStrat);
        const cur = vsOpenings.get(oppStrat) || { name: oppStrat, games: 0, wins: 0, losses: 0 };
        cur.games += 1;
        if (row.won === true) cur.wins += 1;
        else cur.losses += 1;
        vsOpenings.set(oppStrat, cur);
      }
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
  const durationAnalysis = buildDurationBuckets(parsed, { isTeam });

  return {
    totalRows: parsed.length,
    classifiedCount,
    agroShare: pct(agroCount, classifiedCount),
    boomShare: pct(boomCount, classifiedCount),
    hybridShare: pct(hybridCount, classifiedCount),
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
      .filter((op) => op.games >= SAMPLE_POLICY.insights.minVsOpening)
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
    // P2-5: Companion `myRating` es pre-partida; sumar `myRatingDiff` para alinear con rating post-partida
    rating: Number.isFinite(Number(r.myRatingDiff)) ? (Number(r.myRating) + Number(r.myRatingDiff)) : Number(r.myRating),
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

  // Muestra representativa real para mejores/peores civs y mapas (nunca 2–4 partidas sueltas)
  const minCivGames = totalCivGames >= 200
    ? clamp(Math.round(totalCivGames * 0.03), 10, 18)
    : totalCivGames >= 80 ? 8 : totalCivGames >= 30 ? 6 : 5;
  const eligibleCivs = allCivs.filter((c) => c.games >= minCivGames && c.winRate != null);
  const bestCiv = eligibleCivs.length
    ? [...eligibleCivs].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
    : null;
  const weakestCiv = eligibleCivs.length >= 2
    ? [...eligibleCivs].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0]
    : null;

  const minMapGames = totalMapGames >= 200
    ? clamp(Math.round(totalMapGames * 0.03), 10, 20)
    : totalMapGames >= 80 ? 8 : totalMapGames >= 30 ? 6 : 5;
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
    allCivs,
    topCivs: allCivs.slice(0, 7),
    topCivsByWr,
    bestCiv,
    weakestCiv: weakestCiv && bestCiv && weakestCiv.slug !== bestCiv.slug ? weakestCiv : null,
    minCivGames,
    allMaps,
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
 * Calcula promedio real de eAPM (y APM local cuando hay replay) por mapa
 * combinando AoE2Insights + replays locales del modo. Nunca inventa valores.
 */
function computeMapEapmStats(unifiedMatches = []) {
  const byMap = new Map();
  const allEapms = [];
  for (const m of (Array.isArray(unifiedMatches) ? unifiedMatches : [])) {
    if (!m || !m.mapName) continue;
    const eapm = Number(m.myEapm);
    const apm = Number(m.replay?.apm);
    const hasEapm = Number.isFinite(eapm) && eapm > 5 && eapm < 250;
    const hasApm = Number.isFinite(apm) && apm > 5 && apm < 600;
    if (!hasEapm && !hasApm) continue;
    const k = m.mapKey || mapKey(m.mapName);
    const cur = byMap.get(k) || { mapKey: k, mapName: m.mapName, eapms: [], apms: [], wins: 0, losses: 0, games: 0 };
    cur.games += 1;
    if (m.won === true) cur.wins += 1;
    else if (m.won === false) cur.losses += 1;
    if (hasEapm) {
      cur.eapms.push(eapm);
      allEapms.push(eapm);
    }
    if (hasApm) cur.apms.push(apm);
    byMap.set(k, cur);
  }

  const modeAvgEapm = avg(allEapms, 1);
  const perMap = new Map();
  const ranked = [];
  for (const [k, row] of byMap.entries()) {
    const avgEapm = avg(row.eapms, 1);
    const avgApm = avg(row.apms, 1);
    const eapmDelta = avgEapm != null && modeAvgEapm != null
      ? Math.round((avgEapm - modeAvgEapm) * 10) / 10
      : null;
    const item = {
      mapKey: k,
      mapName: row.mapName,
      games: row.games,
      wins: row.wins,
      losses: row.losses,
      knownGames: row.wins + row.losses,
      winRate: pct(row.wins, row.wins + row.losses),
      avgEapm,
      avgApm,
      eapmSample: row.eapms.length,
      eapmDelta,
    };
    perMap.set(k, item);
    if (avgEapm != null && row.eapms.length >= 2) ranked.push(item);
  }

  ranked.sort((a, b) => b.avgEapm - a.avgEapm || b.eapmSample - a.eapmSample);
  return {
    modeAvgEapm,
    totalSample: allEapms.length,
    perMap,
    topMapsByEapm: ranked.slice(0, 7),
  };
}

function attachMapEapmToStats(stats, mapEapm) {
  if (!stats || !mapEapm) return stats;
  const enrich = (list) => (Array.isArray(list) ? list : []).map((m) => {
    const k = mapKey(m.mapName);
    const hit = mapEapm.perMap.get(k);
    if (!hit) return m;
    return {
      ...m,
      mapKey: k,
      avgEapm: hit.avgEapm,
      avgApm: hit.avgApm,
      eapmSample: hit.eapmSample,
      eapmDelta: hit.eapmDelta,
    };
  });
  let baseTopMaps = enrich(stats.topMaps);
  let baseAllMaps = enrich(stats.allMaps || stats.topMaps);
  if ((!baseAllMaps.length || stats.sourceScope !== 'all-time') && mapEapm.perMap && mapEapm.perMap.size > baseAllMaps.length) {
    const seen = new Set(baseAllMaps.map((m) => mapKey(m.mapName)));
    for (const [k, item] of mapEapm.perMap.entries()) {
      if (!seen.has(k)) {
        seen.add(k);
        baseAllMaps.push(item);
      }
    }
    baseAllMaps.sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0));
    baseTopMaps = baseAllMaps.slice(0, 7);
  }
  return {
    ...stats,
    allMaps: baseAllMaps,
    topMaps: baseTopMaps,
    topMapsByWr: enrich(stats.topMapsByWr),
    topMapsByEapm: mapEapm.topMapsByEapm,
    modeAvgEapm: mapEapm.modeAvgEapm,
    mapEapmSample: mapEapm.totalSample,
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

  // 4. Telemetría local de replays (solo perfil propio, filtrando dodges < 180s y respetando modo)
  if (isOwnProfile) {
    const engineOf = (r) => r?.telemetry?.engineSummary || r?.telemetry?.engine || null;
    const validRecs = (Array.isArray(storedRecords) ? storedRecords : [])
      .filter((r) => {
        if (!r || !engineOf(r)?.self || Number(r.profileId) !== pid) return false;
        const dur = Number(engineOf(r)?.durationSeconds ?? r.telemetry?.durationSeconds ?? r.durationSeconds ?? 0);
        return Number.isFinite(dur) && dur >= 180;
      });
    if (validRecs.length >= 2) {
      const mid = Math.max(1, Math.floor(validRecs.length / 2));
      const recentRecs = validRecs.slice(0, mid);
      const olderRecs = validRecs.slice(mid);
      const getTcUtil = (r) => {
        const s = engineOf(r)?.self;
        return s?.tcUtilizationEarly ?? s?.tcUtilization;
      };
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
    const eng = rec?.telemetry?.engineSummary ?? rec?.telemetry?.engine;
    const dur = Number(eng?.durationSeconds ?? rec?.telemetry?.durationSeconds ?? m.durationSeconds ?? 0);
    if (!Number.isFinite(dur) || dur < SAMPLE_POLICY.lastMatch.minDurationSeconds) return null;
    const self = eng?.self;
    const value = self?.tcUtilizationEarly ?? self?.tcUtilization;
    return Number.isFinite(value) ? value : null;
  };
  // Escala unificada 1.7x (reloj de juego, igual que Resultados por duración y Minuto Letal), filtrando dodges < 3 min reales
  const validMinutes = (m) => (
    Number.isFinite(m?.durationSeconds) && m.durationSeconds >= SAMPLE_POLICY.lastMatch.minDurationSeconds && m.durationSeconds < 6 * 3600
      ? (Math.max(0, m.durationSeconds - 40) * 1.7) / 60
      : null
  );

  const matchCount = Array.isArray(modeMatches) ? modeMatches.length : 0;
  const availableGames = Math.max(series.length, matchCount);
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
    availableGames,
  };

  const buildWindow = (winKey) => {
    const isAll = winKey === 'all';
    const winN = isAll ? Math.max(series.length, matchCount, 200) : Number(winKey);
    const metrics = [];

    // 1. ELO actual vs promedio de las últimas N partidas del modo (reacciona a 10 / 20 / 50 / Total)
    if (series.length >= SAMPLE_POLICY.lastMatch.minSeries) {
      const slice = isAll ? series : series.slice(-winN);
      const currentElo = series[series.length - 1].rating;
      const meanElo = avg(slice.map((p) => p.rating), 0);
      if (Number.isFinite(currentElo) && Number.isFinite(meanElo)) {
        const delta = Math.round(currentElo - meanElo);
        metrics.push({
          id: 'eloAvg',
          label: `ELO vs media (${slice.length} pj)`,
          labelI18n: ['cxe.lmEloAvgLbl', { n: slice.length }],
          latestText: `${Math.round(currentElo)}`,
          avgText: `${Math.round(meanElo)}`,
          deltaText: `${delta > 0 ? '+' : ''}${delta} ELO`,
          improved: delta > 0,
          neutral: delta === 0,
          sampleText: isAll ? `Media del historial ampliado (${slice.length} pj)` : `Media de tus últ. ${slice.length} clasificatorias`,
          sampleI18n: [isAll ? 'cxe.lmEloAvgAll' : 'cxe.lmEloAvgRec', { n: slice.length }],
        });
      }

      // 2. Winrate en ventana N (10 / 20 / 50 / Total)
      const known = series.filter((p) => typeof p.won === 'boolean');
      if (known.length >= SAMPLE_POLICY.lastMatch.minSeries) {
        const wSlice = isAll ? known : known.slice(-winN);
        const wins = wSlice.filter((p) => p.won).length;
        const losses = wSlice.length - wins;
        const wr = pct(wins, wSlice.length);
        const net = wSlice.length >= 2
          ? (wSlice[wSlice.length - 1].rating - wSlice[0].rating + (wSlice[0].diff || 0))
          : (wSlice[0]?.diff || 0);
        metrics.push({
          id: 'windowWr',
          label: isAll ? `Winrate (${wSlice.length} pj)` : `Winrate últ. ${wSlice.length}`,
          labelI18n: [isAll ? 'cxe.lmWrAllLbl' : 'cxe.lmWrRecLbl', { n: wSlice.length }],
          latestText: `${wr}%`,
          avgText: `${wins}V - ${losses}D`,
          avgWL: [wins, losses],
          deltaText: `${net > 0 ? '+' : ''}${Math.round(net)} ELO`,
          improved: net > 0 || (net === 0 && wr >= 50),
          neutral: net === 0 && wr === 50,
          sampleText: isAll ? `Balance en ${wSlice.length} partidas del modo` : `Balance en tus últ. ${wSlice.length} partidas`,
          sampleI18n: [isAll ? 'cxe.lmWrAllSub' : 'cxe.lmWrRecSub', { n: wSlice.length }],
        });
      }
    }

    // 3. Duración en reloj de juego (1.7×, filtrando dodges < 3 min)
    if (latestMatch) {
      const lastMin = validMinutes(latestMatch);
      const durAll = prior.map(validMinutes).filter(Number.isFinite);
      const durSample = isAll ? durAll : durAll.slice(0, winN);
      if (Number.isFinite(lastMin) && durSample.length >= SAMPLE_POLICY.lastMatch.minDurationSample) {
        const mean = avg(durSample, 1);
        const delta = Math.round((lastMin - mean) * 10) / 10;
        metrics.push({
          id: 'duration',
          label: 'Duración (reloj juego)',
          labelI18n: ['cxe.lmDurLbl', null],
          latestText: `${Math.round(lastMin * 10) / 10} min`,
          avgText: `${mean} min`,
          deltaText: `${delta > 0 ? '+' : ''}${delta} min`,
          improved: delta > 0,
          neutral: true,
          sampleText: `${durSample.length} partidas previas · reloj 1,7×`,
          sampleI18n: ['cxe.lmDurSub', { n: durSample.length }],
        });
      }

      // 4. Ritmo eAPM (usa el pool de replays AoE2Insights del modo hasta winN)
      const lastEapm = eapmOf(latestMatch);
      if (Number.isFinite(lastEapm)) {
        const priorFromMatches = prior.map(eapmOf).filter(Number.isFinite);
        const pool = isAll
          ? (priorFromMatches.length >= 10 ? priorFromMatches : uniqueInsightEapms.map((r) => r.eapm))
          : (priorFromMatches.length >= winN
            ? priorFromMatches.slice(0, winN)
            : uniqueInsightEapms.map((r) => r.eapm).slice(0, winN));
        if (pool.length >= 2) {
          const mean = avg(pool, 1);
          const delta = Math.round((lastEapm - mean) * 10) / 10;
          metrics.push({
            id: 'eapm',
            label: 'Ritmo eAPM',
            labelI18n: ['cxe.lmEapmLbl', null],
            latestText: `${Math.round(lastEapm * 10) / 10}`,
            avgText: `${mean}`,
            deltaText: `${delta > 0 ? '+' : ''}${delta}`,
            improved: delta > 0,
            neutral: true,
            sampleText: `${pool.length} replays analizados del modo`,
            sampleI18n: ['cxe.lmEapmSub', { n: pool.length }],
          });
        }
      }

      // 5. Uso estimado de TC (solo perfil propio con replays locales válidos >= 3 min)
      if (isOwnProfile) {
        const lastTc = tcOf(latestMatch);
        const tcAll = prior.map(tcOf).filter(Number.isFinite);
        const tcSample = isAll ? tcAll : tcAll.slice(0, winN);
        if (Number.isFinite(lastTc) && tcSample.length >= 2) {
          const mean = avg(tcSample, 1);
          const delta = Math.round((lastTc - mean) * 10) / 10;
          metrics.push({
            id: 'tc',
            label: 'Uso estimado de TC',
            labelI18n: ['cxe.lmTcLbl', null],
            latestText: `${Math.round(lastTc * 10) / 10}%`,
            avgText: `${mean}%`,
            deltaText: `${delta > 0 ? '+' : ''}${delta} pp`,
            improved: delta > 0,
            neutral: delta === 0,
            sampleText: `${tcSample.length} replays locales válidos`,
            sampleI18n: ['cxe.lmTcSub', { n: tcSample.length }],
          });
        }
      }
    }

    return { windowSize: isAll ? availableGames : winN, key: String(winKey), metrics };
  };

  const w10 = buildWindow(10);
  const w20 = buildWindow(20);
  const w50 = availableGames >= 35 ? buildWindow(50) : null;
  const wAll = availableGames > 20 ? buildWindow('all') : null;
  if (!w10.metrics.length && !w20.metrics.length) return null;
  const windows = { 10: w10, 20: w20 };
  if (w50 && w50.metrics.length) windows[50] = w50;
  if (wAll && wAll.metrics.length) windows.all = wAll;
  return { summary, windows };
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
  ewMatches = null,
  ewInsights = null,
  storedRecords = [],
  insights1v1 = null,
  insightsTeam = null,
  isOwnProfile = true,
  ownProfileId = null,
  matches = [],
} = {}) {
  const pid = Number(profileId);
  const rawAllBase = matchesAll.length ? matchesAll : matches;
  const raw1v1 = matches1v1.length ? matches1v1 : rawAllBase.filter((m) => isRm1v1Match(m));
  const rawTeam = matchesTeam.length ? matchesTeam : rawAllBase.filter((m) => isRmTeamMatch(m));
  const rawEw1v1 = Array.isArray(ewMatches?.ew_1v1) ? ewMatches.ew_1v1 : rawAllBase.filter((m) => isEw1v1Match(m));
  const rawEwTeam = Array.isArray(ewMatches?.ew_team) ? ewMatches.ew_team : rawAllBase.filter((m) => isEwTeamMatch(m));
  const rawAllMerged = [...rawAllBase, ...raw1v1, ...rawTeam, ...rawEw1v1, ...rawEwTeam];

  const modeCap = isOwnProfile ? COMPANION_DEPTH.OWN_MAX_PER_MODE : COMPANION_DEPTH.EXTERNAL_MAX_PER_MODE;
  const allSummaries = mergeRecentMatches(rawAllMerged, isOwnProfile ? storedRecords : [], pid, COMPANION_DEPTH.OWN_ALL_SUMMARIES_MAX);
  const rm1v1Summaries = mergeRecentMatches(
    raw1v1,
    isOwnProfile ? storedRecords.filter((r) => isRm1v1Match(r?.match)) : [],
    pid,
    modeCap,
  );
  const rmTeamSummaries = mergeRecentMatches(
    rawTeam,
    isOwnProfile ? storedRecords.filter((r) => isRmTeamMatch(r?.match)) : [],
    pid,
    modeCap,
  );
  const ew1v1Summaries = mergeRecentMatches(
    rawEw1v1,
    isOwnProfile ? storedRecords.filter((r) => isEw1v1Match(r?.match)) : [],
    pid,
    modeCap,
  );
  const ewTeamSummaries = mergeRecentMatches(
    rawEwTeam,
    isOwnProfile ? storedRecords.filter((r) => isEwTeamMatch(r?.match)) : [],
    pid,
    modeCap,
  );

  // Ladders oficiales desde Companion + World's Edge (priorizar la fuente con más partidas jugadas)
  const companionLadders = Array.isArray(profileData?.leaderboards) ? profileData.leaderboards : [];
  const findCompLadder = (id) => companionLadders.find((l) => l && l.leaderboardId === id) || null;
  const companionStats = Array.isArray(profileData?.stats) ? profileData.stats : [];
  const findCompStats = (id) => companionStats.find((s) => s && s.leaderboardId === id) || null;

  const buildLadderObj = (id, weData = null) => {
    const comp = findCompLadder(id);
    if (!comp && !weData) return null;
    const weGames = weData ? (Number(weData.wins || 0) + Number(weData.losses || 0)) : -1;
    const compGames = comp ? (Number(comp.wins || 0) + Number(comp.losses || 0)) : -1;
    const preferComp = comp && compGames > weGames;
    const primary = preferComp ? comp : (weData || comp);
    const secondary = preferComp ? weData : comp;
    const wins = Number(primary?.wins ?? secondary?.wins ?? 0);
    const losses = Number(primary?.losses ?? secondary?.losses ?? 0);
    const games = wins + losses;
    const rating = primary?.rating ?? secondary?.rating ?? null;
    if (!rating && games <= 0) return null;
    const rank = primary?.rank ?? secondary?.rank ?? null;
    const rankTotal = primary?.rankTotal ?? primary?.total ?? secondary?.rankTotal ?? secondary?.total ?? null;
    const peak = Math.max(Number(weData?.peak || 0), Number(comp?.maxRating || 0), Number(rating || 0)) || rating;
    return {
      id,
      label: MODE_LABELS[id] || id,
      rating,
      peak,
      rank,
      rankTotal,
      ladderPercentile: weData?.ladderPercentile ?? (rank && rankTotal ? Math.round((rank / rankTotal) * 1000) / 10 : null),
      wins,
      losses,
      games,
      winRate: pct(wins, games),
      streak: primary?.streak ?? secondary?.streak ?? null,
    };
  };

  const ladderMap = {
    rm_1v1: buildLadderObj('rm_1v1', ladder1v1),
    rm_team: buildLadderObj('rm_team', ladderTeam),
    ew_1v1: buildLadderObj('ew_1v1'),
    ew_team: buildLadderObj('ew_team'),
  };

  const allLadders = MODE_ORDER.map((id) => ladderMap[id]).filter(Boolean);

  // Telemetría local medida (solo perfil propio; excluye dodges < 180s)
  const validRecords = isOwnProfile
    ? (Array.isArray(storedRecords) ? storedRecords : []).filter((r) => {
        if (!r || !r.telemetry || Number(r.profileId) !== pid) return false;
        const eng = r.telemetry.engineSummary || r.telemetry.engine || null;
        const dur = Number(eng?.durationSeconds ?? r.telemetry.durationSeconds ?? r.durationSeconds ?? 0);
        return !Number.isFinite(dur) || dur === 0 || dur >= SAMPLE_POLICY.lastMatch.minDurationSeconds;
      })
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
    const eng = t.engineSummary || t.engine || null;
    const self = eng?.self;
    if (self) {
      if (Number.isFinite(self.tcUtilizationEarly ?? self.tcUtilization)) {
        tcUtilList.push(self.tcUtilizationEarly ?? self.tcUtilization);
      }
      if (Number.isFinite(self.tcIdleEarlySeconds ?? self.tcIdleSeconds)) {
        tcIdleEarlyList.push(self.tcIdleEarlySeconds ?? self.tcIdleSeconds);
      }
      const mins = Math.max(1, ((eng.durationSeconds || t.durationSeconds || 600) / 60));
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

  // Análisis AoE2Insights por modo (soporta RM + EW hidratado bajo demanda)
  const parsedRows1v1 = normalizeInsightsRows(insights1v1);
  const parsedRowsTeam = normalizeInsightsRows(insightsTeam);
  const parsedRowsEw1v1 = normalizeInsightsRows(ewInsights?.ew_1v1);
  const parsedRowsEwTeam = normalizeInsightsRows(ewInsights?.ew_team);
  const insightsByMode = {
    rm_1v1: analyzeInsightsRows(parsedRows1v1, { isTeam: false }),
    rm_team: analyzeInsightsRows(parsedRowsTeam, { isTeam: true }),
    ew_1v1: analyzeInsightsRows(parsedRowsEw1v1, { isTeam: false }),
    ew_team: analyzeInsightsRows(parsedRowsEwTeam, { isTeam: true }),
    global: analyzeInsightsRows(
      [...parsedRows1v1, ...parsedRowsTeam, ...parsedRowsEw1v1, ...parsedRowsEwTeam],
      { isTeam: parsedRowsTeam.length > parsedRows1v1.length },
    ),
  };

  // Construimos cada modo clasificado con datos oficiales sin sesgo (Companion-First + Left-Join)
  const modes = {};
  const modeEloSeriesMap = {};
  for (const modeId of MODE_ORDER) {
    const ladder = ladderMap[modeId];
    const statsBlock = findCompStats(modeId);
    const isTeamMode = modeId === 'rm_team' || modeId === 'ew_team';
    const fallbackMatches = modeId === 'rm_1v1'
      ? rm1v1Summaries
      : modeId === 'rm_team'
        ? rmTeamSummaries
        : modeId === 'ew_1v1'
          ? ew1v1Summaries
          : ewTeamSummaries;
    const stats = parseAllTimeStatsBlock(statsBlock ? [statsBlock] : [], fallbackMatches);
    if (!ladder && stats.totalCivGames === 0) continue;

    const fullRatingSeries = buildPureEloSeries(profileData, fallbackMatches, modeId, ladder?.rating ?? null, COMPANION_DEPTH.ELO_SERIES_FULL_MAX);
    const eloSeries = fullRatingSeries.slice(-COMPANION_DEPTH.ELO_CHART_ULTRA_MAX);
    modeEloSeriesMap[modeId] = { label: MODE_LABELS[modeId], series: fullRatingSeries, streak: ladder?.streak || 0 };
    const form = summarizeFormFromSeries(eloSeries);
    const ins = insightsByMode[modeId];

    const modeInsRows = modeId === 'rm_1v1'
      ? parsedRows1v1
      : modeId === 'rm_team'
        ? parsedRowsTeam
        : modeId === 'ew_1v1'
          ? parsedRowsEw1v1
          : parsedRowsEwTeam;
    const modeStoredRecords = modeId === 'rm_1v1'
      ? validRecords.filter((r) => isRm1v1Match(r?.match))
      : modeId === 'rm_team'
        ? validRecords.filter((r) => isRmTeamMatch(r?.match))
        : modeId === 'ew_1v1'
          ? validRecords.filter((r) => isEw1v1Match(r?.match))
          : validRecords.filter((r) => isEwTeamMatch(r?.match));

    // Pool A (Oficial sin sesgo): Companion-First + Left-Join estricto por matchId
    const unifiedModeMatches = buildUnifiedModeMatches({
      insightsRows: modeInsRows,
      companionMatches: fallbackMatches,
      storedRecords: modeStoredRecords,
      profileId: pid,
      strictLeftJoin: true,
    });
    // Pool B (Solo telemetría exclusiva de AoE2Insights: aperturas, antídotos, eAPM, parches)
    const insightsOnlyMatches = modeInsRows.length
      ? buildUnifiedModeMatches({
          insightsRows: modeInsRows,
          companionMatches: [],
          storedRecords: modeStoredRecords,
          profileId: pid,
          strictLeftJoin: false,
        })
      : [];
    const insightsCoverage = computeInsightsCoverage(unifiedModeMatches, modeInsRows);

    // Resultados por Duración sobre pool oficial sin sesgo en reloj de juego (1.7x)
    const unifiedDuration = buildDurationBuckets(unifiedModeMatches, { isTeam: isTeamMode });
    const durationAnalysis = unifiedDuration.total >= 4
      ? { ...unifiedDuration, sourceLabel: `${unifiedDuration.total} partidas oficiales · reloj de juego` }
      : (ins?.durationAnalysis?.total >= 4
          ? { ...ins.durationAnalysis, sourceLabel: `AoE2Insights · ${ins.durationAnalysis.total} replays · reloj de juego` }
          : null);

    const eloValues = eloSeries.map((p) => p.rating);
    const beforeVsNow = computeBeforeVsNow({
      modeLabel: MODE_LABELS[modeId],
      eloSeries,
      insightsAnalysis: ins,
      storedRecords: modeStoredRecords,
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

    // eAPM por mapa usa primero el pool oficial enriquecido y cae a Insights-only para cobertura histórica de eAPM
    const mapEapm = computeMapEapmStats(insightsOnlyMatches.length ? insightsOnlyMatches : unifiedModeMatches);
    const enrichedStats = attachMapEapmToStats(stats, mapEapm);
    const civDiagnostics = buildModeCivDiagnostics({
      modeId,
      isTeam: isTeamMode,
      matches: unifiedModeMatches,
      allTimeCivs: enrichedStats.allCivs || enrichedStats.topCivs || [],
    });
    const mapDiagnostics = buildModeMapDiagnostics({
      modeId,
      isTeam: isTeamMode,
      matches: unifiedModeMatches,
      allTimeMaps: enrichedStats.allMaps || enrichedStats.topMaps || [],
    });
    // Cero fugas entre modos en Academia: cada modo solo evalúa sus propios replays locales
    const academy = modeStoredRecords.length >= 3
      ? computePersonalAcademy({
          storedRecords: modeStoredRecords,
          profileId: pid,
          isOwnProfile,
          modeId,
          isFallbackScope: false,
        })
      : null;
    const competitiveIntel = computeEloAttributionAndSession({
      matches: unifiedModeMatches,
      insightsMatches: insightsOnlyMatches,
      eloSeries: fullRatingSeries,
      isTeam: isTeamMode,
      sessionModeLabel: MODE_LABELS[modeId],
    });

    const lastMatchVsAvg = computeLastMatchVsAvg({
      modeMatches: fallbackMatches,
      eloSeries,
      insightsRows: modeInsRows,
      storedRecords: modeStoredRecords,
      isOwnProfile,
      modeLabel: MODE_LABELS[modeId],
    });
    const discoveries = computeModeDiscoveries({
      modeId,
      isTeam: isTeamMode,
      profileId: pid,
      isOwnProfile,
      ladder,
      stats: enrichedStats,
      insights: ins,
      eloSeries: fullRatingSeries,
      fullRatingSeries,
      comfortModeLabel: MODE_LABELS[modeId],
      modeEloSeriesMap,
      modeMatches: fallbackMatches,
      unifiedMatches: unifiedModeMatches,
      insightsMatches: insightsOnlyMatches,
      storedRecords: validRecords,
    });

    modes[modeId] = {
      id: modeId,
      label: MODE_LABELS[modeId],
      ladder,
      stats: enrichedStats,
      civDiagnostics,
      mapDiagnostics,
      academy,
      competitiveIntel,
      discoveries,
      insightsCoverage,
      unifiedMatchCount: unifiedModeMatches.length,
      recentMatches: fallbackMatches.slice(0, 8),
      ewNeedsHydration: (modeId === 'ew_1v1' || modeId === 'ew_team') && fallbackMatches.length === 0 && (ladder?.games || 0) > 0,
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
  const globalAllInsRows = [...parsedRows1v1, ...parsedRowsTeam, ...parsedRowsEw1v1, ...parsedRowsEwTeam];
  const globalStatsRaw = parseAllTimeStatsBlock(companionStats, allSummaries);
  const globalUnifiedMatches = buildUnifiedModeMatches({
    insightsRows: globalAllInsRows,
    companionMatches: allSummaries,
    storedRecords: validRecords,
    profileId: pid,
    strictLeftJoin: true,
  });
  const globalInsightsOnlyMatches = globalAllInsRows.length
    ? buildUnifiedModeMatches({
        insightsRows: globalAllInsRows,
        companionMatches: [],
        storedRecords: validRecords,
        profileId: pid,
        strictLeftJoin: false,
      })
    : [];
  const globalInsightsCoverage = computeInsightsCoverage(globalUnifiedMatches, globalAllInsRows);

  const primaryLadderId = allLadders.length
    ? [...allLadders].sort((a, b) => (b.games || 0) - (a.games || 0))[0].id
    : 'rm_1v1';
  const primaryLadderLabel = MODE_LABELS[primaryLadderId] || 'Global';
  const primaryFullSeries = modeEloSeriesMap[primaryLadderId]?.series || [];
  const globalTeamCount = globalUnifiedMatches.filter((m) => m.isTeam).length;
  const globalMostlyTeam = globalUnifiedMatches.length
    ? globalTeamCount >= (globalUnifiedMatches.length / 2)
    : (primaryLadderId === 'rm_team' || primaryLadderId === 'ew_team');

  const globalStats = attachMapEapmToStats(
    globalStatsRaw,
    computeMapEapmStats(globalInsightsOnlyMatches.length ? globalInsightsOnlyMatches : globalUnifiedMatches),
  );
  const globalCivDiagnostics = buildModeCivDiagnostics({
    modeId: 'global',
    isTeam: globalMostlyTeam,
    matches: globalUnifiedMatches,
    allTimeCivs: globalStats.allCivs || globalStats.topCivs || [],
  });
  const globalMapDiagnostics = buildModeMapDiagnostics({
    modeId: 'global',
    isTeam: globalMostlyTeam,
    matches: globalUnifiedMatches,
    allTimeMaps: globalStats.allMaps || globalStats.topMaps || [],
  });
  const globalAcademy = computePersonalAcademy({
    storedRecords: validRecords,
    profileId: pid,
    isOwnProfile,
    modeId: 'global',
    isFallbackScope: false,
  });
  const globalCompetitiveIntel = computeEloAttributionAndSession({
    matches: globalUnifiedMatches,
    insightsMatches: globalInsightsOnlyMatches,
    eloSeries: primaryFullSeries,
    isTeam: globalMostlyTeam,
    sessionModeLabel: primaryLadderLabel,
  });
  const globalEloSeries = Object.values(modeEloSeriesMap)
    .flatMap((m) => (Array.isArray(m?.series) ? m.series : []))
    .sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
  const globalDiscoveries = computeModeDiscoveries({
    modeId: 'global',
    isTeam: globalMostlyTeam,
    profileId: pid,
    isOwnProfile,
    ladder: globalLadder,
    stats: globalStats,
    insights: insightsByMode.global,
    eloSeries: globalEloSeries,
    fullRatingSeries: primaryFullSeries,
    comfortModeLabel: primaryLadderLabel,
    modeEloSeriesMap,
    modeMatches: allSummaries,
    unifiedMatches: globalUnifiedMatches,
    insightsMatches: globalInsightsOnlyMatches,
    storedRecords: validRecords,
  });
  const globalIns = insightsByMode.global;
  const globalUnifiedDur = buildDurationBuckets(globalUnifiedMatches, { isTeam: globalMostlyTeam });
  const globalDuration = globalUnifiedDur.total >= 4
    ? { ...globalUnifiedDur, sourceLabel: `${globalUnifiedDur.total} partidas oficiales · reloj de juego` }
    : (globalIns?.durationAnalysis?.total >= 4
        ? { ...globalIns.durationAnalysis, sourceLabel: `AoE2Insights · ${globalIns.durationAnalysis.total} replays · reloj de juego` }
        : null);

  // En Global, alinear la serie ELO de lastMatchVsAvg con el modo REAL de la última partida
  const latestGlobalMatch = allSummaries[0] || null;
  const latestGlobalModeKey = latestGlobalMatch
    ? (resolveMode(latestGlobalMatch.leaderboardId)?.key || (latestGlobalMatch.isTeam ? 'rm_team' : latestGlobalMatch.is1v1 ? 'rm_1v1' : null))
    : null;
  const latestGlobalSeries = (latestGlobalModeKey && modes[latestGlobalModeKey]?.eloSeries) || [];
  const latestGlobalModeLabel = (latestGlobalModeKey && MODE_LABELS[latestGlobalModeKey]) || latestGlobalMatch?.modeLabel || 'Global';
  const latestGlobalModeMatches = latestGlobalModeKey === 'rm_1v1'
    ? rm1v1Summaries
    : latestGlobalModeKey === 'rm_team'
      ? rmTeamSummaries
      : latestGlobalModeKey === 'ew_1v1'
        ? ew1v1Summaries
        : latestGlobalModeKey === 'ew_team'
          ? ewTeamSummaries
          : allSummaries;

  modes.global = {
    id: 'global',
    label: 'Global',
    ladder: globalLadder,
    stats: globalStats,
    civDiagnostics: globalCivDiagnostics,
    mapDiagnostics: globalMapDiagnostics,
    academy: globalAcademy,
    competitiveIntel: globalCompetitiveIntel,
    discoveries: globalDiscoveries,
    insightsCoverage: globalInsightsCoverage,
    unifiedMatchCount: globalUnifiedMatches.length,
    recentMatches: allSummaries.slice(0, 8),
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
      modeLabel: primaryLadderLabel,
      eloSeries: modes[primaryLadderId]?.eloSeries || [],
      insightsAnalysis: globalIns,
      storedRecords: validRecords,
      profileId: pid,
      isOwnProfile,
    }),
    lastMatchVsAvg: computeLastMatchVsAvg({
      modeMatches: latestGlobalModeMatches,
      eloSeries: latestGlobalSeries,
      insightsRows: latestGlobalModeKey === 'rm_1v1' ? parsedRows1v1 : (latestGlobalModeKey === 'rm_team' ? parsedRowsTeam : globalAllInsRows),
      storedRecords: validRecords,
      isOwnProfile,
      modeLabel: latestGlobalModeLabel,
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
const centralComputedCache = new Map();
const centralBgRefresh = new Set();

function readCachedRows(cache, pid, modeId) {
  if (!cache || typeof cache.get !== 'function') return null;
  const hit500 = cache.get(`scout:rows:v2:${pid}:${modeId}:500`);
  const ts = hit500 && (hit500.ts ?? hit500.at);
  if (hit500 && hit500.rows && Number.isFinite(ts) && Date.now() - ts < 6 * 60 * 60 * 1000) return hit500;
  return null;
}

function getStoredRecordsFast(performanceStore, pid, isOwnProfile) {
  if (!isOwnProfile || !performanceStore) return [];
  if (typeof performanceStore.listReadOnly === 'function') return performanceStore.listReadOnly(pid);
  return performanceStore.list(pid);
}

function storeRevOf(performanceStore, storedRecords) {
  if (performanceStore && typeof performanceStore.revision === 'number') return performanceStore.revision;
  return storedRecords.length;
}

function computeCentralMemoized(cacheKey, rawTs, raw, { alias, storedRecords, storeRev, isOwnProfile, ownProfileId, extra = null }) {
  const memoKey = `${cacheKey}:${rawTs}:${storeRev}:${alias || ''}:${isOwnProfile ? 1 : 0}:${ownProfileId || ''}:${extra?.insightsPending ? 1 : 0}:${extra?.stale ? 1 : 0}`;
  const hit = centralComputedCache.get(memoKey);
  if (hit) return hit;
  const computed = computeCentralAnalytics({
    ...raw,
    alias: alias || raw.alias,
    storedRecords,
    isOwnProfile,
    ownProfileId,
  });
  const result = extra ? { ...computed, ...extra } : computed;
  if (centralComputedCache.size > 24) {
    centralComputedCache.delete(centralComputedCache.keys().next().value);
  }
  centralComputedCache.set(memoKey, result);
  return result;
}

function hasModeGames(profileData, ladder, matches, ladderKey) {
  if (Array.isArray(matches) && matches.length > 0) return true;
  if (ladder && ((ladder.wins || 0) + (ladder.losses || 0)) > 0) return true;
  const lb = (profileData?.leaderboards || []).find((l) => String(l.leaderboardId || '').toLowerCase() === ladderKey);
  return Boolean(lb && ((lb.games || 0) > 0 || (lb.wins || 0) + (lb.losses || 0) > 0));
}

async function fetchCentralCoreRaw(pid, { alias, cache, force, signal, isOwnProfile = true, prevRaw = null }) {
  const maxPerMode = isOwnProfile ? COMPANION_DEPTH.OWN_MAX_PER_MODE : COMPANION_DEPTH.EXTERNAL_MAX_PER_MODE;
  const pageSize = COMPANION_DEPTH.PAGE_SIZE;
  const inflightKey = `${pid}:${force ? 'force' : 'norm'}:${maxPerMode}`;
  let rawPromise = centralInflight.get(inflightKey);
  if (!rawPromise) {
    rawPromise = (async () => {
      const mine1v1 = !force && cache?.get(`mine:${pid}:3`);
      const mineTeam = !force && cache?.get(`mine:${pid}:4`);
      const m1Ts = mine1v1 && (mine1v1.ts ?? mine1v1.at ?? 0);
      const m4Ts = mineTeam && (mineTeam.ts ?? mineTeam.at ?? 0);
      const freshMine1v1 = mine1v1 && Array.isArray(mine1v1.matches) && (Date.now() - m1Ts < 3 * 60 * 1000)
        ? mine1v1.matches.slice(0, maxPerMode)
        : null;
      const freshMineTeam = mineTeam && Array.isArray(mineTeam.matches) && (Date.now() - m4Ts < 3 * 60 * 1000)
        ? mineTeam.matches.slice(0, maxPerMode)
        : null;

      const [stats1v1Res, statsTeamRes, profileDataRes, matches1v1Res, matchesTeamRes, matchesAllRes] = await Promise.allSettled([
        fetchPersonalStats([pid], 3, 7000, { signal }),
        fetchPersonalStats([pid], 4, 7000, { signal }),
        fetchExtendedProfile(pid, { bypassCache: Boolean(force), timeoutMs: 10000, signal }),
        freshMine1v1 ? Promise.resolve(freshMine1v1) : fetchMatches(pid, pageSize, 1, 'rm_1v1', { priority: 'own', bypassCache: Boolean(force), signal }),
        freshMineTeam ? Promise.resolve(freshMineTeam) : fetchMatches(pid, pageSize, 1, 'rm_team', { priority: 'own', bypassCache: Boolean(force), signal }),
        fetchMatches(pid, 30, 1, null, { priority: 'own', bypassCache: Boolean(force), signal }),
      ]);

      const ladder1v1 = stats1v1Res.status === 'fulfilled' ? (stats1v1Res.value.get(pid) || null) : null;
      const ladderTeam = statsTeamRes.status === 'fulfilled' ? (statsTeamRes.value.get(pid) || null) : null;
      const profileData = profileDataRes.status === 'fulfilled' ? profileDataRes.value : null;
      const page1Rm1v1 = matches1v1Res.status === 'fulfilled' ? matches1v1Res.value : [];
      const page1RmTeam = matchesTeamRes.status === 'fulfilled' ? matchesTeamRes.value : [];
      const matchesAll = matchesAllRes.status === 'fulfilled' ? matchesAllRes.value : [];

      // Delta Sync monotónico: fusiona página 1 fresca con historial asentado previo en disco hasta 200 pj/modo
      const matches1v1 = mergeRawMatches(page1Rm1v1, prevRaw?.matches1v1, maxPerMode);
      const matchesTeam = mergeRawMatches(page1RmTeam, prevRaw?.matchesTeam, maxPerMode);

      const needPage2Rm1v1 = isOwnProfile
        && matches1v1.length < maxPerMode
        && page1Rm1v1.length >= pageSize;
      const needPage2RmTeam = isOwnProfile
        && matchesTeam.length < maxPerMode
        && page1RmTeam.length >= pageSize;

      return {
        profileId: pid,
        alias: alias || profileData?.name || null,
        ladder1v1,
        ladderTeam,
        profileData,
        matches1v1,
        matchesTeam,
        matchesAll,
        ewMatches: prevRaw?.ewMatches || {},
        ewInsights: prevRaw?.ewInsights || {},
        insights1v1: !force ? readCachedRows(cache, pid, 3) : null,
        insightsTeam: !force ? readCachedRows(cache, pid, 4) : null,
        _needsPage2: { rm_1v1: needPage2Rm1v1, rm_team: needPage2RmTeam },
      };
    })().finally(() => {
      if (centralInflight.get(inflightKey) === rawPromise) centralInflight.delete(inflightKey);
    });
    centralInflight.set(inflightKey, rawPromise);
  }
  return rawPromise;
}

/**
 * Fase 2 (silenciosa en segundo plano): descarga página 2 (`per_page=100`, `page=2`)
 * para alcanzar hasta 200 partidas oficiales contiguas por modo sin bloquear la pintura inicial.
 */
async function backfillCentralPage2(pid, raw, { signal, maxPerMode = COMPANION_DEPTH.OWN_MAX_PER_MODE } = {}) {
  const needs = raw?._needsPage2;
  if (!needs || (!needs.rm_1v1 && !needs.rm_team)) return { raw, updated: false };
  const pageSize = COMPANION_DEPTH.PAGE_SIZE;
  const [p2Rm1v1Res, p2RmTeamRes] = await Promise.allSettled([
    needs.rm_1v1 ? fetchMatches(pid, pageSize, 2, 'rm_1v1', { priority: 'own', signal }) : Promise.resolve([]),
    needs.rm_team ? fetchMatches(pid, pageSize, 2, 'rm_team', { priority: 'own', signal }) : Promise.resolve([]),
  ]);
  if (signal?.aborted) return { raw, updated: false };
  const p2Rm1v1 = p2Rm1v1Res.status === 'fulfilled' ? p2Rm1v1Res.value : [];
  const p2RmTeam = p2RmTeamRes.status === 'fulfilled' ? p2RmTeamRes.value : [];
  const next1v1 = p2Rm1v1.length ? mergeRawMatches(raw.matches1v1, p2Rm1v1, maxPerMode) : raw.matches1v1;
  const nextTeam = p2RmTeam.length ? mergeRawMatches(raw.matchesTeam, p2RmTeam, maxPerMode) : raw.matchesTeam;
  const updated = next1v1.length > (raw.matches1v1?.length || 0) || nextTeam.length > (raw.matchesTeam?.length || 0);
  const cleanRaw = {
    ...raw,
    matches1v1: next1v1,
    matchesTeam: nextTeam,
    _needsPage2: { rm_1v1: false, rm_team: false },
  };
  return { raw: cleanRaw, updated };
}

/**
 * Hidratación perezosa de Empire Wars (`ew_1v1` / `ew_team`) al tocar la pestaña:
 * 0 costo inicial para jugadores que no juegan EW; persiste en `central-cache.json`.
 */
async function hydrateCentralEwMode({
  profileId,
  modeId,
  alias = null,
  cache = null,
  performanceStore = null,
  diskCachePath = null,
  isOwnProfile = true,
  ownProfileId = null,
  signal = null,
  log = () => {},
} = {}) {
  const pid = Number(profileId);
  if (!Number.isFinite(pid) || pid <= 0 || (modeId !== 'ew_1v1' && modeId !== 'ew_team')) {
    return null;
  }
  const cacheKey = `central:v6:${pid}`;
  let baseRaw = cache?.get(cacheKey)?.raw || null;
  if (!baseRaw && isOwnProfile && diskCachePath) {
    baseRaw = readDiskCache(diskCachePath, pid)?.raw || null;
  }
  if (!baseRaw) return null;

  const existingMatches = Array.isArray(baseRaw.ewMatches?.[modeId]) ? baseRaw.ewMatches[modeId] : [];
  const existingTs = Number(baseRaw.ewMatches?.[`${modeId}Ts`] || 0);
  const stillFresh = existingMatches.length > 0 && (Date.now() - existingTs < 10 * 60 * 1000);
  const storedRecords = getStoredRecordsFast(performanceStore, pid, isOwnProfile);
  const storeRev = storeRevOf(performanceStore, storedRecords);

  if (stillFresh) {
    return computeCentralMemoized(cacheKey, existingTs || Date.now(), baseRaw, {
      alias, storedRecords, storeRev, isOwnProfile, ownProfileId,
    });
  }

  const maxPerMode = isOwnProfile ? COMPANION_DEPTH.OWN_MAX_PER_MODE : COMPANION_DEPTH.EXTERNAL_MAX_PER_MODE;
  const pageSize = COMPANION_DEPTH.PAGE_SIZE;
  const ewNum = modeId === 'ew_1v1' ? 13 : 14;
  try {
    const [p1Res, insRes] = await Promise.allSettled([
      fetchMatches(pid, pageSize, 1, modeId, { priority: 'own', signal }),
      fetchOpeningRows(pid, { mode: resolveMode(ewNum), limit: 500, cache, signal }),
    ]);
    if (signal?.aborted) return null;
    const p1 = p1Res.status === 'fulfilled' ? p1Res.value : [];
    let merged = mergeRawMatches(p1, existingMatches, maxPerMode);
    if (isOwnProfile && merged.length < maxPerMode && p1.length >= pageSize && !signal?.aborted) {
      const p2 = await fetchMatches(pid, pageSize, 2, modeId, { priority: 'own', signal }).catch(() => []);
      if (p2.length) merged = mergeRawMatches(merged, p2, maxPerMode);
    }
    const nextInsights = insRes.status === 'fulfilled' ? insRes.value : (baseRaw.ewInsights?.[modeId] || null);
    const ts = Date.now();
    const updatedRaw = {
      ...baseRaw,
      ewMatches: {
        ...(baseRaw.ewMatches || {}),
        [modeId]: merged,
        [`${modeId}Ts`]: ts,
      },
      ewInsights: {
        ...(baseRaw.ewInsights || {}),
        [modeId]: nextInsights,
      },
    };
    if (cache) cache.set(cacheKey, { ts, raw: updatedRaw });
    if (isOwnProfile && diskCachePath) writeDiskCache(diskCachePath, pid, updatedRaw);
    return computeCentralMemoized(cacheKey, ts, updatedRaw, {
      alias, storedRecords, storeRev, isOwnProfile, ownProfileId,
    });
  } catch (err) {
    log(`central ew hydrate (${modeId}): ${err.message}`);
    return null;
  }
}

async function hydrateCentralInsights(pid, raw, { cache, force, signal }) {
  const need1v1 = (!raw.insights1v1 || force) && hasModeGames(raw.profileData, raw.ladder1v1, raw.matches1v1, 'rm_1v1');
  const needTeam = (!raw.insightsTeam || force) && hasModeGames(raw.profileData, raw.ladderTeam, raw.matchesTeam, 'rm_team');
  if (!need1v1 && !needTeam) return { raw, updated: false };

  const [i1Res, i4Res] = await Promise.allSettled([
    need1v1 ? fetchOpeningRows(pid, { mode: resolveMode(3), limit: 500, cache, force, signal }) : Promise.resolve(raw.insights1v1),
    needTeam ? fetchOpeningRows(pid, { mode: resolveMode(4), limit: 500, cache, force, signal }) : Promise.resolve(raw.insightsTeam),
  ]);
  if (signal?.aborted) return { raw, updated: false };

  const next1v1 = i1Res.status === 'fulfilled' ? i1Res.value : raw.insights1v1;
  const nextTeam = i4Res.status === 'fulfilled' ? i4Res.value : raw.insightsTeam;
  if (cache && next1v1) {
    const rows = normalizeInsightsRows(next1v1);
    if (rows.length > 0) {
      cache.set(`scout:rows:v2:${pid}:3:500`, { ts: Date.now(), rows, totalRows: Number(next1v1.count) || rows.length });
    }
  }
  if (cache && nextTeam) {
    const rows = normalizeInsightsRows(nextTeam);
    if (rows.length > 0) {
      cache.set(`scout:rows:v2:${pid}:4:500`, { ts: Date.now(), rows, totalRows: Number(nextTeam.count) || rows.length });
    }
  }
  return {
    raw: { ...raw, insights1v1: next1v1, insightsTeam: nextTeam },
    updated: Boolean((need1v1 && next1v1) || (needTeam && nextTeam)),
  };
}

async function fetchCentralDashboard({
  profileId,
  alias = null,
  cache = null,
  performanceStore = null,
  diskCachePath = null,
  force = false,
  isOwnProfile = true,
  ownProfileId = null,
  onUpdate = null,
  signal = null,
  log = () => {},
} = {}) {
  const pid = Number(profileId);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { ok: false, error: 'Seleccioná o detectá tu cuenta primero.', profileId: null };
  }

  const storedRecords = getStoredRecordsFast(performanceStore, pid, isOwnProfile);
  const storeRev = storeRevOf(performanceStore, storedRecords);
  const cacheKey = `central:v6:${pid}`;
  const memTtlMs = isOwnProfile ? 5 * 60 * 1000 : 10 * 60 * 1000;
  const INSIGHTS_REVALIDATE_MS = 4 * 60 * 60 * 1000;

  if (!force && cache && cache.get(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.ts < memTtlMs) {
      return computeCentralMemoized(cacheKey, cached.ts, cached.raw, {
        alias,
        storedRecords,
        storeRev,
        isOwnProfile,
        ownProfileId,
      });
    }
  }

  const latestMatchIdOf = (r) => {
    const all = [...(r?.matchesAll || []), ...(r?.matches1v1 || []), ...(r?.matchesTeam || [])];
    let bestId = null;
    let bestTs = -1;
    for (const m of all) {
      const t = Number(m?.startedAt || 0);
      if (m?.matchId && t >= bestTs) {
        bestTs = t;
        bestId = String(m.matchId);
      }
    }
    return bestId;
  };

  // Phase 0 (Instant Disk SWR <50 ms):
  // - Si el caché en disco tiene < 4 min Y ya alcanzó profundidad (o el modo tiene <100 pj), sirve fresco (0 API calls).
  // - Si tiene >= 4 min o aún está en la profundidad vieja (<=40 pj), pinta al instante y revalida con Delta Sync 200 pj.
  const diskSnapshot = (isOwnProfile && diskCachePath) ? readDiskCache(diskCachePath, pid) : null;
  if (!force && diskSnapshot && diskSnapshot.raw && typeof onUpdate === 'function'
      && (diskSnapshot.raw.profileData || (diskSnapshot.raw.matchesAll || []).length)) {
    const disk = diskSnapshot;
    const diskTs = Number(disk.ts) || 1;
    const diskAgeMs = Date.now() - diskTs;
    const prev1v1Games = ladderTotalGamesOf(disk.raw, 'rm_1v1') || 0;
    const prevTeamGames = ladderTotalGamesOf(disk.raw, 'rm_team') || 0;
    const needsDepthUpgrade = (prev1v1Games > 40 && (disk.raw.matches1v1?.length || 0) <= 40)
      || (prevTeamGames > 40 && (disk.raw.matchesTeam?.length || 0) <= 40);
    const diskFresh = diskAgeMs < 4 * 60 * 1000 && !needsDepthUpgrade;
    if (diskFresh && cache) {
      cache.set(cacheKey, { ts: diskTs, raw: disk.raw });
    }
    const view = computeCentralMemoized(cacheKey, diskTs, disk.raw, {
      alias,
      storedRecords,
      storeRev,
      isOwnProfile,
      ownProfileId,
      extra: diskFresh ? null : { stale: true },
    });
    if (!diskFresh && !centralBgRefresh.has(pid)) {
      centralBgRefresh.add(pid);
      (async () => {
        try {
          const coreRaw = await fetchCentralCoreRaw(pid, {
            alias, cache, force: false, signal, isOwnProfile, prevRaw: disk.raw,
          });
          if (signal?.aborted) return;
          if (coreRaw.profileData || coreRaw.matchesAll.length || coreRaw.matches1v1.length) {
            const ts = Date.now();
            const prevLatestId = latestMatchIdOf(disk.raw);
            const nextLatestId = latestMatchIdOf(coreRaw);
            const ladderChanged = ladderTotalGamesOf(disk.raw, 'rm_1v1') !== ladderTotalGamesOf(coreRaw, 'rm_1v1')
              || ladderTotalGamesOf(disk.raw, 'rm_team') !== ladderTotalGamesOf(coreRaw, 'rm_team');
            const hasNewMatch = Boolean((nextLatestId && nextLatestId !== prevLatestId) || ladderChanged);
            const diskInsightsTs = Number(disk.raw.insightsTs || diskTs);
            const insightsStillFresh = !hasNewMatch && (ts - diskInsightsTs < INSIGHTS_REVALIDATE_MS);

            const reused1v1 = coreRaw.insights1v1 || disk.raw.insights1v1 || null;
            const reusedTeam = coreRaw.insightsTeam || disk.raw.insightsTeam || null;
            let merged = {
              ...coreRaw,
              insights1v1: reused1v1,
              insightsTeam: reusedTeam,
              insightsTs: insightsStillFresh ? diskInsightsTs : (coreRaw.insights1v1 || coreRaw.insightsTeam ? ts : diskInsightsTs),
            };
            const needInsights = !insightsStillFresh && (
              (!coreRaw.insights1v1 && hasModeGames(merged.profileData, merged.ladder1v1, merged.matches1v1, 'rm_1v1')) ||
              (!coreRaw.insightsTeam && hasModeGames(merged.profileData, merged.ladderTeam, merged.matchesTeam, 'rm_team'))
            );
            if (cache) cache.set(cacheKey, { ts, raw: merged });
            writeDiskCache(diskCachePath, pid, merged);
            const freshRecords = getStoredRecordsFast(performanceStore, pid, isOwnProfile);
            const freshRev = storeRevOf(performanceStore, freshRecords);
            onUpdate(computeCentralMemoized(cacheKey, ts, merged, {
              alias,
              storedRecords: freshRecords,
              storeRev: freshRev,
              isOwnProfile,
              ownProfileId,
              extra: needInsights ? { insightsPending: true } : null,
            }));

            // Fase 2A + 2B en paralelo: Backfill de página 2 (hasta 200 pj/modo) + revalidación de AoE2Insights
            const wantPage2 = Boolean(merged._needsPage2?.rm_1v1 || merged._needsPage2?.rm_team);
            const wantInsights = Boolean(needInsights && !signal?.aborted);
            if (wantPage2 || wantInsights) {
              let insightsDone = !wantInsights;
              const tasks = [];
              if (wantPage2) {
                tasks.push(
                  backfillCentralPage2(pid, merged, { signal }).then((bf) => {
                    if (signal?.aborted || !bf.updated) return;
                    merged = {
                      ...merged,
                      matches1v1: bf.raw.matches1v1,
                      matchesTeam: bf.raw.matchesTeam,
                      _needsPage2: bf.raw._needsPage2,
                    };
                    const tsBf = Date.now();
                    if (cache) cache.set(cacheKey, { ts: tsBf, raw: merged });
                    writeDiskCache(diskCachePath, pid, merged);
                    const rBf = getStoredRecordsFast(performanceStore, pid, isOwnProfile);
                    onUpdate(computeCentralMemoized(cacheKey, tsBf, merged, {
                      alias,
                      storedRecords: rBf,
                      storeRev: storeRevOf(performanceStore, rBf),
                      isOwnProfile,
                      ownProfileId,
                      extra: insightsDone ? null : { insightsPending: true },
                    }));
                  }),
                );
              }
              if (wantInsights) {
                tasks.push(
                  hydrateCentralInsights(pid, merged, { cache, force: hasNewMatch, signal }).then(({ raw: enriched, updated }) => {
                    if (signal?.aborted) return;
                    insightsDone = true;
                    const ts2 = Date.now();
                    merged = {
                      ...merged,
                      insights1v1: enriched.insights1v1,
                      insightsTeam: enriched.insightsTeam,
                      insightsTs: ts2,
                    };
                    if (cache) cache.set(cacheKey, { ts: ts2, raw: merged });
                    if (updated) writeDiskCache(diskCachePath, pid, merged);
                    const r2 = getStoredRecordsFast(performanceStore, pid, isOwnProfile);
                    onUpdate(computeCentralMemoized(cacheKey, ts2, merged, {
                      alias,
                      storedRecords: r2,
                      storeRev: storeRevOf(performanceStore, r2),
                      isOwnProfile,
                      ownProfileId,
                    }));
                  }),
                );
              }
              await Promise.allSettled(tasks);
            }
          }
        } catch (err) {
          log(`central swr: ${err.message}`);
        } finally {
          centralBgRefresh.delete(pid);
        }
      })();
    }
    return view;
  }

  // Phase 1 (~400 ms): Core Companion (100 pj/modo + Delta Sync) + World's Edge
  let raw = await fetchCentralCoreRaw(pid, {
    alias, cache, force, signal, isOwnProfile, prevRaw: diskSnapshot?.raw || null,
  });

  if (!raw.profileData && !raw.matchesAll.length && isOwnProfile && diskSnapshot?.raw) {
    log(`central: usando caché en disco para #${pid}`);
    return computeCentralMemoized(cacheKey, Number(diskSnapshot.ts) || 1, diskSnapshot.raw, {
      alias,
      storedRecords,
      storeRev,
      isOwnProfile,
      ownProfileId,
    });
  }

  const need1v1Insights = (!raw.insights1v1 || force) && hasModeGames(raw.profileData, raw.ladder1v1, raw.matches1v1, 'rm_1v1');
  const needTeamInsights = (!raw.insightsTeam || force) && hasModeGames(raw.profileData, raw.ladderTeam, raw.matchesTeam, 'rm_team');
  const shouldLazyInsights = typeof onUpdate === 'function' && (need1v1Insights || needTeamInsights);
  const shouldLazyPage2 = typeof onUpdate === 'function' && isOwnProfile && (raw._needsPage2?.rm_1v1 || raw._needsPage2?.rm_team);

  if (!shouldLazyInsights && (need1v1Insights || needTeamInsights)) {
    const hydrated = await hydrateCentralInsights(pid, raw, { cache, force, signal });
    raw = hydrated.raw;
  }

  const ts = Date.now();
  if (raw.profileData || raw.matchesAll.length || raw.matches1v1.length) {
    if (cache) cache.set(cacheKey, { ts, raw });
    if (isOwnProfile && diskCachePath) writeDiskCache(diskCachePath, pid, raw);
  }

  if (shouldLazyPage2 || shouldLazyInsights) {
    (async () => {
      try {
        let cur = raw;
        let insightsDone = !shouldLazyInsights;
        const tasks = [];
        if (shouldLazyPage2) {
          tasks.push(
            backfillCentralPage2(pid, cur, { signal }).then((bf) => {
              if (signal?.aborted || !bf.updated) return;
              cur = {
                ...cur,
                matches1v1: bf.raw.matches1v1,
                matchesTeam: bf.raw.matchesTeam,
                _needsPage2: bf.raw._needsPage2,
              };
              const tsBf = Date.now();
              if (cache) cache.set(cacheKey, { ts: tsBf, raw: cur });
              if (isOwnProfile && diskCachePath) writeDiskCache(diskCachePath, pid, cur);
              const rBf = getStoredRecordsFast(performanceStore, pid, isOwnProfile);
              onUpdate(computeCentralMemoized(cacheKey, tsBf, cur, {
                alias,
                storedRecords: rBf,
                storeRev: storeRevOf(performanceStore, rBf),
                isOwnProfile,
                ownProfileId,
                extra: insightsDone ? null : { insightsPending: true },
              }));
            }),
          );
        }
        if (shouldLazyInsights && !signal?.aborted) {
          tasks.push(
            hydrateCentralInsights(pid, cur, { cache, force, signal }).then(({ raw: enriched, updated }) => {
              if (signal?.aborted) return;
              insightsDone = true;
              const ts2 = Date.now();
              cur = {
                ...cur,
                insights1v1: enriched.insights1v1,
                insightsTeam: enriched.insightsTeam,
                insightsTs: ts2,
              };
              if (cache) cache.set(cacheKey, { ts: ts2, raw: cur });
              if (updated && isOwnProfile && diskCachePath) writeDiskCache(diskCachePath, pid, cur);
              const freshRecords = getStoredRecordsFast(performanceStore, pid, isOwnProfile);
              onUpdate(computeCentralMemoized(cacheKey, ts2, cur, {
                alias,
                storedRecords: freshRecords,
                storeRev: storeRevOf(performanceStore, freshRecords),
                isOwnProfile,
                ownProfileId,
              }));
            }),
          );
        }
        await Promise.allSettled(tasks);
      } catch (err) {
        log(`central bg hydrate: ${err.message}`);
      }
    })();
  }

  return computeCentralMemoized(cacheKey, ts, raw, {
    alias,
    storedRecords,
    storeRev,
    isOwnProfile,
    ownProfileId,
    extra: shouldLazyInsights ? { insightsPending: true } : null,
  });
}

module.exports = {
  isRm1v1Match,
  isRmTeamMatch,
  isEw1v1Match,
  isEwTeamMatch,
  mergeRawMatches,
  summarizeOwnMatch,
  mergeRecentMatches,
  buildDurationBuckets,
  analyzeInsightsRows,
  buildPureEloSeries,
  parseAllTimeStatsBlock,
  computeMapEapmStats,
  computeBeforeVsNow,
  buildHonestRadar,
  computeCentralAnalytics,
  fetchCentralDashboard,
  hydrateCentralEwMode,
};
