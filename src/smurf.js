'use strict';

/**
 * SMURF DETECTOR (src/smurf.js) · Función Ultra
 *
 * Evalúa múltiples señales 100% reales y auditables para sugerir junto al ELO
 * si un rival puede ser una cuenta secundaria (smurf) o deranker:
 *  1. Cuentas vinculadas (Steam Family Share / `linkedProfiles`) con ELO RM 1v1
 *     significativamente superior al actual.
 *  2. Cuenta joven con winrate extremo (ej. >=72% en <=45 partidas).
 *  3. Escalada vertical de ELO en sus últimas partidas de RM 1v1 o racha larga.
 *  4. Caída pronunciada respecto al pico histórico (posible derank intencional).
 *  5. Anomalía de eAPM respecto al promedio esperado de su banda de ELO.
 *  6. Tasa alta de abandonos (`drops`) combinada con caída desde pico.
 */

const { fetchExtendedProfile, fetchPersonalStats } = require('./aoe');
const { fetchOpeningRows } = require('./insights');
const { resolveMode } = require('./rival');
const { parseScoutRows } = require('./scout');

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

/** Umbral de eAPM anómalo según la banda de ELO RM 1v1. */
function anomalousEapmThreshold(rating) {
  const r = Number(rating);
  if (!Number.isFinite(r) || r <= 0) return 68;
  if (r < 1000) return 52;
  if (r < 1200) return 62;
  if (r < 1450) return 72;
  if (r < 1700) return 85;
  return 98;
}

/**
 * Evalúa las 6 señales reales para un jugador. Función pura y testeable.
 */
function evaluateSmurfSignals({
  profileId,
  currentRating = null,
  ladder1v1 = null,
  profileData = null,
  linkedStatsMap = null,
  insightsRows = null,
} = {}) {
  const pid = Number(profileId);
  const compLadders = Array.isArray(profileData?.leaderboards) ? profileData.leaderboards : [];
  const comp1v1 = compLadders.find((l) => l && l.leaderboardId === 'rm_1v1') || null;

  const rating = Number(ladder1v1?.rating ?? comp1v1?.rating ?? currentRating) || null;
  const peak = Number(ladder1v1?.peak ?? comp1v1?.maxRating) || null;
  const wins = Number(ladder1v1?.wins ?? comp1v1?.wins ?? 0);
  const losses = Number(ladder1v1?.losses ?? comp1v1?.losses ?? 0);
  const rmGames = wins + losses;
  const rmWinRate = pct(wins, rmGames);
  const streak = Number(ladder1v1?.streak ?? comp1v1?.streak ?? 0);
  const totalGames = Number(profileData?.games) || rmGames;
  const drops = Number(profileData?.drops) || 0;
  const dropRate = totalGames > 0 ? (drops / totalGames) * 100 : 0;

  let score = 0;
  const reasons = [];
  let primaryTag = null;
  let linkedBestRating = null;
  let linkedBestName = null;

  // 1. Cuentas vinculadas (Family Share / alt accounts) con mayor ELO en RM 1v1
  const linked = Array.isArray(profileData?.linkedProfiles) ? profileData.linkedProfiles : [];
  if (linked.length && linkedStatsMap && typeof linkedStatsMap.get === 'function') {
    for (const lp of linked) {
      const lpid = Number(lp?.profileId);
      if (!lpid || lpid === pid) continue;
      const st = linkedStatsMap.get(lpid);
      if (!st) continue;
      const candRating = Number(st.rating) || 0;
      const candPeak = Number(st.peak) || candRating;
      const effective = Math.max(candRating, Math.round(candPeak * 0.96));
      if (effective > (linkedBestRating || 0)) {
        linkedBestRating = candRating || candPeak;
        linkedBestName = lp.name || `#${lpid}`;
      }
    }
    if (linkedBestRating && rating) {
      const gap = linkedBestRating - rating;
      if (gap >= 150) {
        score += 65;
        primaryTag = `alt ${linkedBestRating}`;
        reasons.push(`Cuenta vinculada (${linkedBestName}) en ${linkedBestRating} ELO (+${gap})`);
      } else if (gap >= 90) {
        score += 25;
        if (!primaryTag) primaryTag = `alt ${linkedBestRating}`;
        reasons.push(`Cuenta vinculada (${linkedBestName}) en ${linkedBestRating} ELO (+${gap})`);
      }
    }
  }

  // 2. Cuenta nueva con Winrate extremo en RM 1v1
  if (rmGames >= 6 && rmGames <= 45 && rmWinRate != null && rmWinRate >= 72) {
    score += 45;
    if (!primaryTag) primaryTag = `${rmWinRate}%·${rmGames}pj`;
    reasons.push(`${rmWinRate}% WR en solo ${rmGames} partidas de RM 1v1`);
  } else if (rmGames >= 10 && rmGames <= 90 && rmWinRate != null && rmWinRate >= 66) {
    score += 25;
    if (!primaryTag) primaryTag = `${rmWinRate}%·${rmGames}pj`;
    reasons.push(`${rmWinRate}% WR sostenido en ${rmGames} partidas`);
  }

  // 3. Escalada vertical de ELO en los últimos 10–12 juegos de RM 1v1 o racha larga en cuenta joven
  const ratingBlock = Array.isArray(profileData?.ratings)
    ? profileData.ratings.find((r) => r && r.leaderboardId === 'rm_1v1')
    : null;
  const pts = Array.isArray(ratingBlock?.ratings)
    ? ratingBlock.ratings.filter((p) => Number.isFinite(Number(p.rating))).slice(0, 12)
    : [];
  let recentClimb = null;
  if (pts.length >= 6) {
    recentClimb = Number(pts[0].rating) - Number(pts[pts.length - 1].rating);
  }
  if ((recentClimb != null && recentClimb >= 140) || (streak >= 6 && rmGames <= 65 && (rmWinRate || 0) >= 62)) {
    score += 30;
    const tag = recentClimb != null && recentClimb >= 140 ? `+${recentClimb} ELO` : `racha +${streak}`;
    if (!primaryTag) primaryTag = tag;
    reasons.push(
      recentClimb != null && recentClimb >= 140
        ? `Subió +${recentClimb} ELO en sus últimas ${pts.length} partidas`
        : `Racha de +${streak} victorias con cuenta reciente`,
    );
  }

  // 4. Deranker / Caída marcada respecto al pico histórico
  if (peak && rating && peak >= 1250 && (peak - rating) >= 240 && rmGames >= 18) {
    const drop = peak - rating;
    score += 35;
    if (!primaryTag) primaryTag = `pico ${peak}`;
    reasons.push(`Pico histórico ${peak} ELO (${drop} pts por debajo hoy)`);
  }

  // 5. Anomalía mecánica de eAPM para su banda de ELO
  const rows = Array.isArray(insightsRows) ? insightsRows : [];
  if (rows.length >= 4 && rating) {
    const selfEapms = rows.map((r) => Number(r.meanEapm ?? r.eapm)).filter((v) => Number.isFinite(v) && v > 5 && v < 250);
    const oppEapms = rows.map((r) => Number(r.oppMeanEapm ?? r.oppEapm)).filter((v) => Number.isFinite(v) && v > 5 && v < 250);
    if (selfEapms.length >= 4) {
      const avgSelf = selfEapms.reduce((a, b) => a + b, 0) / selfEapms.length;
      const avgOpp = oppEapms.length ? (oppEapms.reduce((a, b) => a + b, 0) / oppEapms.length) : null;
      const threshold = anomalousEapmThreshold(rating);
      if (avgSelf >= threshold && (avgOpp == null || avgSelf >= avgOpp + 16)) {
        score += 25;
        if (!primaryTag) primaryTag = `${Math.round(avgSelf)} eAPM`;
        reasons.push(`Ritmo anómalo (${Math.round(avgSelf)} eAPM${avgOpp ? ` vs ${Math.round(avgOpp)} rivales` : ''})`);
      }
    }
  }

  // 6. Tasa alta de abandonos tempranos (`drops`) + pico superior
  if (drops >= 8 && dropRate >= 12 && peak && rating && (peak - rating) >= 140) {
    score += 25;
    if (!primaryTag) primaryTag = `${Math.round(dropRate)}% drops`;
    reasons.push(`${drops} abandonos (${Math.round(dropRate)}%) con pico ${peak} ELO`);
  }

  let level = 'none';
  let label = null;
  if (score >= 60) {
    level = 'high';
    label = 'SMURF';
  } else if (score >= 35) {
    level = 'possible';
    label = 'SMURF?';
  }

  return {
    profileId: pid,
    flagged: level !== 'none',
    level,
    label,
    shortReason: primaryTag,
    reasons,
    score,
    linkedBestRating,
    linkedBestName,
  };
}

/**
 * Ejecuta el detector en 2 fases para los jugadores de una partida (con caché 30 min):
 *   - Fase A (<0.8 s): perfil Companion + batch World's Edge de cuentas vinculadas
 *     (emite alertas al instante sin esperar 15–36 s de AoE2Insights).
 *   - Fase B (asíncrona en segundo plano, SOLO enemigos): enriquece con eAPM de
 *     AoE2Insights del modo actual (reutilizando filas ya cacheadas) y notifica
 *     vía `onUpdate` solo si algún rival cambia de estado.
 */
async function detectSmurfsForPlayers(players = [], {
  cache = null,
  enemyIds = null,
  mode = null,
  onUpdate = null,
  log = () => {},
  fetchExtendedProfileImpl = fetchExtendedProfile,
  fetchPersonalStatsImpl = fetchPersonalStats,
  fetchOpeningRowsImpl = fetchOpeningRows,
} = {}) {
  const rivals = (Array.isArray(players) ? players : [])
    .filter((p) => p && !p.isYou && Number(p.profileId) > 0);
  const out = {};
  if (!rivals.length) return out;

  const enemySet = enemyIds instanceof Set
    ? enemyIds
    : (Array.isArray(enemyIds) && enemyIds.length ? new Set(enemyIds.map(Number)) : null);
  const effectiveMode = mode || resolveMode(3);
  const modeNum = Number(effectiveMode?.id) || 3;

  const toFetch = [];
  for (const r of rivals) {
    const pid = Number(r.profileId);
    const cacheKey = `smurf:v1:${pid}`;
    const cached = cache && cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
      out[pid] = cached.result;
    } else {
      toFetch.push(r);
    }
  }
  if (!toFetch.length) return out;

  // 1. Fase A rápida: SOLO fetchExtendedProfile (Companion) + filas de Insights SI ya están en caché (0 ms!)
  const profileByPid = new Map();
  const insightsByPid = new Map();
  const pendingInsightsRivals = [];
  const allLinkedIds = new Set();

  await Promise.all(toFetch.map(async (rival) => {
    const pid = Number(rival.profileId);
    const scoutCached = cache && (
      cache.get(`scout:rows:v2:${pid}:${modeNum}:500`) ||
      cache.get(`scout:rows:v2:${pid}:3:500`)
    );
    const cachedInsightsRows = (scoutCached && Array.isArray(scoutCached.rows) && Date.now() - scoutCached.ts < 4 * 60 * 60 * 1000)
      ? scoutCached.rows.slice(0, 25)
      : null;
    if (cachedInsightsRows) {
      insightsByPid.set(pid, cachedInsightsRows);
    } else if (!enemySet || enemySet.has(pid)) {
      pendingInsightsRivals.push(rival);
    }
    try {
      const pdata = await fetchExtendedProfileImpl(pid, { timeoutMs: 6500 });
      if (pdata) {
        profileByPid.set(pid, pdata);
        for (const lp of Array.isArray(pdata.linkedProfiles) ? pdata.linkedProfiles : []) {
          const lpid = Number(lp?.profileId);
          if (lpid > 0 && lpid !== pid) allLinkedIds.add(lpid);
        }
      }
    } catch (_) {
      // Sin perfil extendido seguimos evaluando con datos del roster
    }
  }));

  // 2. Una sola consulta batch a World's Edge para el ELO RM 1v1 de TODAS las cuentas vinculadas
  let linkedStatsMap = new Map();
  if (allLinkedIds.size > 0) {
    try {
      linkedStatsMap = await fetchPersonalStatsImpl([...allLinkedIds].slice(0, 24), 3, 5000);
    } catch (err) {
      log(`smurf: no pude consultar cuentas vinculadas: ${err.message}`);
    }
  }

  // 3. Evaluamos Fase A inmediatamente y cacheamos
  const evaluateFor = (rival, insRows) => {
    const pid = Number(rival.profileId);
    return evaluateSmurfSignals({
      profileId: pid,
      currentRating: rival.rating ?? rival.matchRating ?? null,
      ladder1v1: {
        rating: rival.rating ?? null,
        peak: rival.peak ?? null,
        wins: rival.wins,
        losses: rival.losses,
        streak: rival.streak,
      },
      profileData: profileByPid.get(pid) || null,
      linkedStatsMap,
      insightsRows: insRows || null,
    });
  };

  for (const rival of toFetch) {
    const pid = Number(rival.profileId);
    const result = evaluateFor(rival, insightsByPid.get(pid) || null);
    out[pid] = result;
    if (cache) cache.set(`smurf:v1:${pid}`, { ts: Date.now(), result });
    if (result.flagged) {
      log(`smurf · ${rival.name || `#${pid}`}: ${result.label} (${result.score} pts) · ${result.reasons.join(' | ')}`);
    }
  }

  // 4. Fase B asíncrona (solo enemigos sin caché Insights): enriquece eAPM sin bloquear Fase A!
  if (typeof onUpdate === 'function' && pendingInsightsRivals.length > 0) {
    Promise.allSettled(pendingInsightsRivals.map(async (rival) => {
      const pid = Number(rival.profileId);
      const raw = await fetchOpeningRowsImpl(pid, { mode: effectiveMode, limit: 25 });
      if (!raw) return false;
      const rows = parseScoutRows(raw);
      if (!rows.length) return false;
      const updated = evaluateFor(rival, rows);
      const prev = out[pid];
      out[pid] = updated;
      if (cache) cache.set(`smurf:v1:${pid}`, { ts: Date.now(), result: updated });
      return Boolean(!prev || updated.score !== prev.score || updated.flagged !== prev.flagged);
    })).then((settled) => {
      const changed = settled.some((s) => s.status === 'fulfilled' && s.value === true);
      if (changed) onUpdate({ ...out });
    }).catch(() => {});
  }

  return out;
}

module.exports = {
  anomalousEapmThreshold,
  evaluateSmurfSignals,
  detectSmurfsForPlayers,
};
