'use strict';

/**
 * MOTOR DE DESCUBRIMIENTOS REALES DEL JUGADOR (src/central-discoveries.js)
 *
 * Calcula 9 bloques de inteligencia competitiva, curiosidades y récords reales
 * cruzando API oficial + AoE2Insights + replays locales (.aoe2record) + CIV_GUIDE,
 * con 0 llamadas extra de red y guardas estadísticas estrictas para nunca inventar datos.
 */

const { civSlug } = require('./civs');
const { CIV_GUIDE } = require('./civ-guide');
const { mapKey } = require('./rival');

const SESSION_GAP_MS = 90 * 60_000;
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

function avg(arr, digits = 1) {
  const valid = (Array.isArray(arr) ? arr : []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!valid.length) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const s = 10 ** digits;
  return Math.round(mean * s) / s;
}

function civRoleBucket(rawCiv) {
  const slug = civSlug(rawCiv);
  const role = String((slug && CIV_GUIDE && CIV_GUIDE[slug] && CIV_GUIDE[slug].role) || '').toLowerCase();
  if (!role) return null;
  if (/caballer|camell|elefant|estepa/.test(role)) return { id: 'cavalry', label: 'Civs de Caballería' };
  if (/arquer|pólvora|polvora|proyectil|distancia/.test(role)) return { id: 'ranged', label: 'Civs de Arqueros / Pólvora' };
  if (/infanter|águil|aguil|meso/.test(role)) return { id: 'infantry', label: 'Civs de Infantería' };
  if (/defens|asedio|monj|torr|eco/.test(role)) return { id: 'siege', label: 'Civs Defensivas / Asedio' };
  return { id: 'hybrid', label: 'Civs Híbridas / Versátiles' };
}

function effectiveCivPool(civRows) {
  const list = (Array.isArray(civRows) ? civRows : []).filter((c) => Number(c.games) > 0);
  const total = list.reduce((s, c) => s + Number(c.games), 0);
  if (total < 6) return { total, effCivs: null, top1: null, top1Share: null };
  let sumSq = 0;
  let top1 = null;
  for (const c of list) {
    const g = Number(c.games);
    const p = g / total;
    sumSq += p * p;
    if (!top1 || g > Number(top1.games)) top1 = c;
  }
  const effCivs = sumSq > 0 ? Math.round((1 / sumSq) * 10) / 10 : null;
  const top1Share = top1 ? pct(Number(top1.games), total) : null;
  return { total, effCivs, top1, top1Share };
}

/* ==================== 1. Tu Hora Dorada (Circadiano + Día de la semana) ==================== */
function computeGoldenHour(eloSeries) {
  const pts = (Array.isArray(eloSeries) ? eloSeries : [])
    .filter((p) => p && Number.isFinite(Number(p.startedAt)) && Number(p.startedAt) > 0 && Number.isFinite(Number(p.diff)) && Number(p.diff) !== 0);
  if (pts.length < 12) return null;

  const blockDefs = [
    { id: 'morning', label: 'Mañana', range: '06–12h', hours: (h) => h >= 6 && h < 12 },
    { id: 'afternoon', label: 'Tarde', range: '12–19h', hours: (h) => h >= 12 && h < 19 },
    { id: 'evening', label: 'Noche', range: '19–00h', hours: (h) => h >= 19 && h <= 23 },
    { id: 'night', label: 'Madrugada', range: '00–06h', hours: (h) => h >= 0 && h < 6 },
  ];

  const blocks = blockDefs.map((def) => {
    const list = pts.filter((p) => def.hours(new Date(Number(p.startedAt)).getHours()));
    const wins = list.filter((p) => (p.won === true) || (p.won == null && Number(p.diff) > 0)).length;
    const losses = list.length - wins;
    const netElo = Math.round(list.reduce((s, p) => s + Number(p.diff || 0), 0));
    return {
      id: def.id,
      label: def.label,
      range: def.range,
      games: list.length,
      wins,
      losses,
      winRate: list.length ? pct(wins, list.length) : null,
      netElo,
      isGolden: false,
      isCursed: false,
    };
  });

  const minBlockGames = pts.length >= 40 ? 6 : 4;
  const eligible = blocks.filter((b) => b.games >= minBlockGames && b.winRate != null);
  let golden = null;
  let cursed = null;
  if (eligible.length >= 2) {
    const byScore = [...eligible].sort((a, b) => (b.winRate - a.winRate) || (b.netElo - a.netElo));
    golden = byScore[0];
    cursed = byScore[byScore.length - 1];
    if (golden && cursed && golden.id !== cursed.id && (golden.winRate - cursed.winRate >= 6 || golden.netElo - cursed.netElo >= 40)) {
      golden.isGolden = true;
      cursed.isCursed = true;
    } else if (golden) {
      golden.isGolden = true;
      cursed = null;
    }
  } else if (eligible.length === 1) {
    golden = eligible[0];
    golden.isGolden = true;
  }

  // Día de la semana (0=Dom..6=Sáb) + Semana vs Finde
  const days = DAY_LABELS.map((label, dayIdx) => {
    const list = pts.filter((p) => new Date(Number(p.startedAt)).getDay() === dayIdx);
    const wins = list.filter((p) => (p.won === true) || (p.won == null && Number(p.diff) > 0)).length;
    return {
      dayIdx,
      label,
      games: list.length,
      wins,
      losses: list.length - wins,
      winRate: list.length ? pct(wins, list.length) : null,
      netElo: Math.round(list.reduce((s, p) => s + Number(p.diff || 0), 0)),
    };
  });
  const eligibleDays = days.filter((d) => d.games >= (pts.length >= 50 ? 5 : 3));
  const bestDay = eligibleDays.length ? [...eligibleDays].sort((a, b) => b.netElo - a.netElo || b.winRate - a.winRate)[0] : null;
  const worstDay = eligibleDays.length >= 2 ? [...eligibleDays].sort((a, b) => a.netElo - b.netElo || a.winRate - b.winRate)[0] : null;

  const weekendPts = pts.filter((p) => { const d = new Date(Number(p.startedAt)).getDay(); return d === 0 || d === 6; });
  const weekdayPts = pts.filter((p) => { const d = new Date(Number(p.startedAt)).getDay(); return d >= 1 && d <= 5; });
  const summarizeGroup = (list) => {
    if (list.length < 4) return null;
    const w = list.filter((p) => (p.won === true) || (p.won == null && Number(p.diff) > 0)).length;
    return { games: list.length, wins: w, losses: list.length - w, winRate: pct(w, list.length), netElo: Math.round(list.reduce((s, p) => s + Number(p.diff || 0), 0)) };
  };

  let punchline = null;
  if (golden && cursed) {
    const signG = golden.netElo >= 0 ? '+' : '';
    const signC = cursed.netElo >= 0 ? '+' : '';
    punchline = `${golden.label} (${golden.range}): ${golden.winRate}% WR (${signG}${golden.netElo} ELO) · ${cursed.label}: ${cursed.winRate}% (${signC}${cursed.netElo} ELO).`;
  } else if (golden) {
    const signG = golden.netElo >= 0 ? '+' : '';
    punchline = `Tu mejor tramo es ${golden.label} (${golden.range}) con ${golden.winRate}% WR (${signG}${golden.netElo} ELO).`;
  }

  return {
    totalRated: pts.length,
    isPreliminary: pts.length < 30,
    blocks,
    golden,
    cursed,
    days,
    bestDay: bestDay && bestDay.netElo > 0 ? bestDay : null,
    worstDay: worstDay && bestDay && worstDay.dayIdx !== bestDay.dayIdx && worstDay.netElo < 0 ? worstDay : null,
    weekday: summarizeGroup(weekdayPts),
    weekend: summarizeGroup(weekendPts),
    punchline,
  };
}

/* ==================== 2. Tridente Táctico: Arma Secreta · Trampa · Bestia Negra ==================== */
function computeTrident({ stats, unifiedMatches, ladder }) {
  const baseWr = Number.isFinite(ladder?.winRate) ? ladder.winRate / 100 : 0.5;
  const allCivs = (stats?.allCivs?.length ? stats.allCivs : stats?.topCivs || []).filter((c) => Number(c.games) > 0);
  const allMaps = (stats?.allMaps?.length ? stats.allMaps : stats?.topMaps || []).filter((m) => Number(m.games) > 0);
  const totalCivGames = allCivs.reduce((s, c) => s + Number(c.games), 0);
  const totalMapGames = allMaps.reduce((s, m) => s + Number(m.games), 0);

  const minCiv = clamp(Math.round(totalCivGames * 0.03), 4, 10);
  const minMap = clamp(Math.round(totalMapGames * 0.03), 4, 10);
  const ebScore = (w, g) => (w + 4 * baseWr) / (g + 4);

  // Arma secreta: mejor civ (EB) con WR >= 55%
  const civCandidates = allCivs
    .filter((c) => Number(c.games) >= minCiv && Number(c.winRate) >= 55)
    .sort((a, b) => ebScore(b.wins, b.games) - ebScore(a.wins, a.games) || b.games - a.games);
  const secretCiv = civCandidates[0] || allCivs.filter((c) => c.games >= 3).sort((a, b) => (b.winRate - a.winRate) || (b.games - a.games))[0] || null;

  // Mapa fortaleza
  const mapCandidates = allMaps
    .filter((m) => Number(m.games) >= minMap && Number(m.winRate) >= 54)
    .sort((a, b) => ebScore(b.wins, b.games) - ebScore(a.wins, a.games) || b.games - a.games);
  const fortressMap = mapCandidates[0] || allMaps.filter((m) => m.games >= 3).sort((a, b) => (b.winRate - a.winRate) || (b.games - a.games))[0] || null;

  // Combos civ @ mapa desde unifiedMatches
  const comboMap = new Map();
  for (const m of (unifiedMatches || [])) {
    if (typeof m.won !== 'boolean' || !m.civ || !m.mapName) continue;
    const cs = m.civSlug || civSlug(m.civ) || String(m.civ).toLowerCase();
    const mk = m.mapKey || mapKey(m.mapName);
    if (!cs || !mk) continue;
    const key = `${cs}::${mk}`;
    const rec = comboMap.get(key) || { civ: m.civ, civSlug: cs, mapName: m.mapName, mapKey: mk, games: 0, wins: 0 };
    rec.games += 1;
    if (m.won) rec.wins += 1;
    comboMap.set(key, rec);
  }
  const combos = [...comboMap.values()].map((c) => ({ ...c, losses: c.games - c.wins, winRate: pct(c.wins, c.games) }));
  const bestCombo = combos.filter((c) => c.games >= 4 && c.winRate >= 65).sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0] || null;
  const trapCombo = combos.filter((c) => c.games >= 5 && c.winRate <= 36).sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0] || null;

  // Trampa silenciosa: civ o mapa frecuente que rinde <= 47% WR (o <= baseWr*100 - 7)
  const trapMinCiv = Math.max(5, Math.round(totalCivGames * 0.07));
  const trapMinMap = Math.max(5, Math.round(totalMapGames * 0.07));
  const trapCiv = allCivs
    .filter((c) => Number(c.games) >= trapMinCiv && Number(c.winRate) <= Math.min(47, Math.round(baseWr * 100) - 5))
    .sort((a, b) => (a.winRate - b.winRate) || (b.games - a.games))[0] || null;
  const trapMap = allMaps
    .filter((m) => Number(m.games) >= trapMinMap && Number(m.winRate) <= Math.min(46, Math.round(baseWr * 100) - 6))
    .sort((a, b) => (a.winRate - b.winRate) || (b.games - a.games))[0] || null;

  let silentTrap = null;
  if (trapCombo && (!trapCiv || trapCombo.winRate <= trapCiv.winRate - 10)) {
    silentTrap = { kind: 'combo', ...trapCombo };
  } else if (trapMap && (!trapCiv || trapMap.winRate <= trapCiv.winRate)) {
    silentTrap = { kind: 'map', mapName: trapMap.mapName, mapKey: trapMap.mapKey || mapKey(trapMap.mapName), games: trapMap.games, wins: trapMap.wins, losses: trapMap.losses, winRate: trapMap.winRate };
  } else if (trapCiv) {
    silentTrap = { kind: 'civ', civ: trapCiv.civ, civSlug: trapCiv.civSlug || civSlug(trapCiv.civ), games: trapCiv.games, wins: trapCiv.wins, losses: trapCiv.losses, winRate: trapCiv.winRate };
  }

  // Bestia Negra & Presa Favorita (Nivel 1: civ rival exacta >= 4 pj; Nivel 2 fallback: arquetipo CIV_GUIDE >= 5 pj)
  const oppCivMap = new Map();
  const oppArchMap = new Map();
  for (const m of (unifiedMatches || [])) {
    if (typeof m.won !== 'boolean') continue;
    const oppCivs = m.oppCiv ? [m.oppCiv] : (Array.isArray(m.opponents) ? m.opponents.map((o) => o?.civ).filter(Boolean) : []);
    const seenInMatch = new Set();
    for (const oc of oppCivs) {
      const slug = civSlug(oc);
      if (!slug || seenInMatch.has(slug)) continue;
      seenInMatch.add(slug);
      const rec = oppCivMap.get(slug) || { civ: oc, civSlug: slug, games: 0, wins: 0 };
      rec.games += 1;
      if (m.won) rec.wins += 1;
      oppCivMap.set(slug, rec);
      const bucket = civRoleBucket(oc);
      if (bucket) {
        const ar = oppArchMap.get(bucket.id) || { id: bucket.id, label: bucket.label, games: 0, wins: 0 };
        ar.games += 1;
        if (m.won) ar.wins += 1;
        oppArchMap.set(bucket.id, ar);
      }
    }
  }
  const oppList = [...oppCivMap.values()].map((c) => ({ ...c, losses: c.games - c.wins, winRate: pct(c.wins, c.games) }));
  const nemesisExact = oppList.filter((c) => c.games >= 4 && c.winRate <= 44).sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0] || null;
  const preyExact = oppList.filter((c) => c.games >= 4 && c.winRate >= 68).sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0] || null;

  const archList = [...oppArchMap.values()].filter((a) => a.games >= 5).map((a) => ({ ...a, losses: a.games - a.wins, winRate: pct(a.wins, a.games) }));
  const nemesisArch = !nemesisExact && archList.length >= 2
    ? [...archList].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0]
    : null;
  const preyArch = !preyExact && archList.length >= 2
    ? [...archList].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
    : null;

  const nemesis = nemesisExact
    ? { kind: 'civ', ...nemesisExact }
    : (nemesisArch && nemesisArch.winRate <= 55 ? { kind: 'archetype', ...nemesisArch } : null);
  const prey = preyExact
    ? { kind: 'civ', ...preyExact }
    : (preyArch && preyArch.winRate >= 62 && (!nemesisArch || preyArch.id !== nemesisArch.id) ? { kind: 'archetype', ...preyArch } : null);

  return {
    secretCiv: secretCiv ? {
      civ: secretCiv.civ,
      civSlug: secretCiv.civSlug || civSlug(secretCiv.civ),
      games: secretCiv.games,
      wins: secretCiv.wins,
      losses: secretCiv.losses,
      winRate: secretCiv.winRate,
      deltaPp: Math.round(secretCiv.winRate - baseWr * 100),
      combo: bestCombo,
    } : null,
    fortressMap: fortressMap ? {
      mapName: fortressMap.mapName,
      mapKey: fortressMap.mapKey || mapKey(fortressMap.mapName),
      games: fortressMap.games,
      wins: fortressMap.wins,
      losses: fortressMap.losses,
      winRate: fortressMap.winRate,
      avgEapm: fortressMap.avgEapm ?? null,
      deltaPp: Math.round(fortressMap.winRate - baseWr * 100),
    } : null,
    silentTrap,
    nemesis,
    prey,
    bestCombo,
  };
}

/* ==================== 3. Matagigantes & Caza-ELO (Gap justo por equipo en TG) ==================== */
function computeGiantSlayer(modeMatches, { isTeam = false, profileId = null } = {}) {
  const list = Array.isArray(modeMatches) ? modeMatches : [];
  const pid = profileId != null ? Number(profileId) : null;
  const scored = [];
  for (const m of list) {
    if (typeof m.won !== 'boolean') continue;
    const players = Array.isArray(m.players) ? m.players : (Array.isArray(m.rawMatch?.players) ? m.rawMatch.players : []);
    const me = m.selfPlayer || (pid ? players.find((p) => Number(p.profileId) === pid) : null) || null;
    const myElo = Number(m.myRating ?? me?.matchRating ?? me?.rating);
    const diff = Number(m.myRatingDiff ?? me?.matchRatingDiff);
    const isPlacement = Number.isFinite(diff) && Math.abs(diff) > 30;
    let gap = null;
    let topRivalName = m.rivalName || null;
    let topRivalCiv = m.rivalCiv || null;
    let oppTeamAvg = null;
    let myTeamAvg = null;

    if (isTeam && players.length >= 4 && me?.team != null) {
      const ownElos = players.filter((p) => Number(p.team) === Number(me.team)).map((p) => Number(p.matchRating ?? p.rating)).filter((v) => Number.isFinite(v) && v > 100);
      const oppPlayers = players.filter((p) => Number(p.team) !== Number(me.team));
      const oppElos = oppPlayers.map((p) => Number(p.matchRating ?? p.rating)).filter((v) => Number.isFinite(v) && v > 100);
      if (ownElos.length && oppElos.length) {
        myTeamAvg = Math.round(ownElos.reduce((a, b) => a + b, 0) / ownElos.length);
        oppTeamAvg = Math.round(oppElos.reduce((a, b) => a + b, 0) / oppElos.length);
        gap = oppTeamAvg - myTeamAvg;
        const strongest = [...oppPlayers].sort((a, b) => Number(b.matchRating ?? b.rating ?? 0) - Number(a.matchRating ?? a.rating ?? 0))[0];
        if (strongest) {
          topRivalName = strongest.name || topRivalName;
          topRivalCiv = strongest.civ || topRivalCiv;
        }
      }
    } else if (Number.isFinite(myElo) && myElo > 100) {
      const oppElo = Number(m.rivalRating ?? m.oppElo);
      if (Number.isFinite(oppElo) && oppElo > 100) {
        myTeamAvg = Math.round(myElo);
        oppTeamAvg = Math.round(oppElo);
        gap = oppTeamAvg - myTeamAvg;
      }
    }
    if (!Number.isFinite(gap)) continue;
    scored.push({
      matchId: m.matchId,
      won: m.won,
      gap,
      myTeamAvg,
      oppTeamAvg,
      ratingDiff: Number.isFinite(diff) ? Math.round(diff) : 0,
      isPlacement,
      myCiv: m.myCiv || me?.civ || null,
      rivalName: topRivalName,
      rivalCiv: topRivalCiv,
      mapName: m.mapName || null,
      startedAt: m.startedAt || null,
    });
  }
  if (scored.length < 5) return null;

  const nonPlace = scored.filter((s) => !s.isPlacement);
  const upsetPool = nonPlace.filter((s) => s.won && s.gap >= 15);
  const biggestUpset = upsetPool.sort((a, b) => b.gap - a.gap)[0] ||
    scored.filter((s) => s.won && s.gap >= 25).sort((a, b) => b.gap - a.gap)[0] || null;
  const worstTrap = nonPlace.filter((s) => !s.won && s.gap <= -20).sort((a, b) => a.gap - b.gap)[0] || null;

  const summarizeTier = (arr) => {
    if (arr.length < 4) return null;
    const w = arr.filter((s) => s.won).length;
    return {
      games: arr.length,
      wins: w,
      losses: arr.length - w,
      winRate: pct(w, arr.length),
      netElo: Math.round(arr.reduce((sum, s) => sum + s.ratingDiff, 0)),
    };
  };

  return {
    sample: scored.length,
    isTeam: Boolean(isTeam),
    biggestUpset,
    worstTrap,
    vsHigher: summarizeTier(scored.filter((s) => s.gap >= 20)),
    vsLower: summarizeTier(scored.filter((s) => s.gap <= -20)),
  };
}

/* ==================== 4. Velocidad vs Cerebro (eAPM Efficiency Matrix) ==================== */
function computeSpeedVsBrain(unifiedMatches) {
  const pairs = (unifiedMatches || []).filter((m) =>
    typeof m.won === 'boolean' &&
    Number.isFinite(Number(m.myEapm)) && Number(m.myEapm) > 5 && Number(m.myEapm) < 250 &&
    Number.isFinite(Number(m.oppEapm)) && Number(m.oppEapm) > 5 && Number(m.oppEapm) < 250
  );
  if (pairs.length < 6) return null;

  const faster = pairs.filter((m) => Number(m.myEapm) >= Number(m.oppEapm));
  const slower = pairs.filter((m) => Number(m.myEapm) < Number(m.oppEapm));
  const summarize = (list) => {
    if (!list.length) return null;
    const w = list.filter((m) => m.won).length;
    return { games: list.length, wins: w, losses: list.length - w, winRate: pct(w, list.length) };
  };

  const avgSelf = avg(pairs.map((m) => Number(m.myEapm)), 1);
  const avgRival = avg(pairs.map((m) => Number(m.oppEapm)), 1);
  const fasterShare = pct(faster.length, pairs.length);
  const smartestWin = slower
    .filter((m) => m.won && (Number(m.oppEapm) - Number(m.myEapm)) >= 5)
    .sort((a, b) => (Number(b.oppEapm) - Number(b.myEapm)) - (Number(a.oppEapm) - Number(a.myEapm)))[0] || null;
  const peakMatch = [...pairs].sort((a, b) => Number(b.myEapm) - Number(a.myEapm))[0] || null;

  const fasterStats = summarize(faster);
  const slowerStats = summarize(slower);
  let headline = null;
  if (faster.length === pairs.length) {
    headline = `Más rápido en ${pairs.length}/${pairs.length} replays (${fasterStats.winRate}% WR · ${avgSelf} vs ${avgRival} eAPM).`;
  } else if (fasterStats && slowerStats && fasterStats.games >= 3 && slowerStats.games >= 3) {
    const diff = fasterStats.winRate - slowerStats.winRate;
    if (diff >= 12) headline = `Imponés ritmo: ${fasterStats.winRate}% WR cuando superás en eAPM vs ${slowerStats.winRate}% por debajo.`;
    else if (diff <= -8) headline = `Juego cerebral: ganás el ${slowerStats.winRate}% incluso con menos clics que el rival.`;
    else headline = `Equilibrio velocidad/decisión: ${fasterStats.winRate}% más rápido · ${slowerStats.winRate}% más lento.`;
  }

  return {
    sample: pairs.length,
    avgSelf,
    avgRival,
    fasterShare,
    faster: fasterStats,
    slower: slowerStats,
    smartestWin: smartestWin ? {
      myEapm: Math.round(Number(smartestWin.myEapm) * 10) / 10,
      oppEapm: Math.round(Number(smartestWin.oppEapm) * 10) / 10,
      civ: smartestWin.civ,
      oppCiv: smartestWin.oppCiv || null,
      mapName: smartestWin.mapName,
    } : null,
    peakMatch: peakMatch ? {
      myEapm: Math.round(Number(peakMatch.myEapm) * 10) / 10,
      oppEapm: Math.round(Number(peakMatch.oppEapm) * 10) / 10,
      won: peakMatch.won,
      civ: peakMatch.civ,
      mapName: peakMatch.mapName,
    } : null,
    headline,
  };
}

/* ==================== 5. Tu Minuto Letal (Ventana In-Game 1.7x por Edad) ==================== */
function computeKillerWindow(unifiedMatches) {
  const valid = (unifiedMatches || []).filter((m) =>
    typeof m.won === 'boolean' &&
    Number.isFinite(Number(m.durationGameSec)) &&
    Number(m.durationGameSec) >= 300 &&
    Number(m.durationGameSec) <= 6 * 3600
  );
  if (valid.length < 8) return null;

  const defs = [
    { id: 'feudal', label: 'Feudal', range: '<22m', icon: 'barracks', test: (min) => min < 22 },
    { id: 'castle', label: 'Castillos', range: '22–35m', icon: 'castle', test: (min) => min >= 22 && min < 35 },
    { id: 'imperial', label: 'Imperial', range: '35–50m', icon: 'sword', test: (min) => min >= 35 && min < 50 },
    { id: 'postimp', label: 'Post-Imp', range: '50m+', icon: 'crown', test: (min) => min >= 50 },
  ];

  const phases = defs.map((def) => {
    const list = valid.filter((m) => def.test(Number(m.durationGameSec) / 60));
    const wins = list.filter((m) => m.won).length;
    return {
      id: def.id,
      label: def.label,
      range: def.range,
      icon: def.icon,
      games: list.length,
      wins,
      losses: list.length - wins,
      winRate: list.length ? pct(wins, list.length) : null,
      isPeak: false,
      isValley: false,
    };
  });

  const eligible = phases.filter((p) => p.games >= 4 && p.winRate != null);
  let peak = null;
  let valley = null;
  if (eligible.length >= 2) {
    const sorted = [...eligible].sort((a, b) => b.winRate - a.winRate || b.games - a.games);
    peak = sorted[0];
    valley = sorted[sorted.length - 1];
    peak.isPeak = true;
    if (valley.id !== peak.id && peak.winRate - valley.winRate >= 10) valley.isValley = true;
    else valley = null;
  } else if (eligible.length === 1) {
    peak = eligible[0];
    peak.isPeak = true;
  }

  const winMins = valid.filter((m) => m.won).map((m) => Number(m.durationGameSec) / 60);
  const lossMins = valid.filter((m) => !m.won).map((m) => Number(m.durationGameSec) / 60);

  return {
    sample: valid.length,
    phases,
    peak,
    valley,
    avgWinMin: avg(winMins, 1),
    avgLossMin: avg(lossMins, 1),
  };
}

/* ==================== 6. Huella de Combate (Replays locales .aoe2record) ==================== */
function computeCombatDna(storedRecords, { modeId = 'global', profileId = null, isOwnProfile = true } = {}) {
  if (!isOwnProfile || !Array.isArray(storedRecords) || !storedRecords.length) return null;
  const pid = profileId != null ? String(profileId) : null;
  const modeLb = modeId === 'rm_1v1' ? 3 : modeId === 'rm_team' ? 4 : modeId === 'ew_1v1' ? 13 : modeId === 'ew_team' ? 14 : null;

  const validAll = storedRecords.filter((r) => {
    if (!r || (pid && r.profileId != null && String(r.profileId) !== pid)) return false;
    const eng = r.telemetry?.engineSummary || r.telemetry?.engine;
    if (!eng || !eng.self) return false;
    const dur = Number(eng.durationSeconds ?? r.telemetry?.durationSeconds ?? r.durationSeconds ?? 0);
    return Number.isFinite(dur) && dur >= 180;
  });
  if (validAll.length < 3) return null;

  const modeScoped = modeLb != null ? validAll.filter((r) => Number(r.leaderboardId) === modeLb) : validAll;
  const useScoped = modeScoped.length >= 3;
  const pool = useScoped ? modeScoped : validAll;
  const scopeLabel = useScoped
    ? `${pool.length} replays locales`
    : `${pool.length} replays locales (historial general)`;

  const unitTotals = new Map();
  const wsTotals = new Map();
  let totalUnits = 0;
  let totalWsUnits = 0;
  let tcDarkSum = [];
  let tcEarlySum = [];
  let cleanBellCount = 0;
  let bsEquipped = 0;
  let bsTotal = 0;
  let totalMarket = 0;
  let totalCombatMicro = 0;
  let totalMove = 0;
  let peakEapmRec = null;

  for (const r of pool) {
    const eng = r.telemetry?.engineSummary || r.telemetry?.engine;
    const self = eng.self;
    if (Number.isFinite(self.tcUtilizationDark)) tcDarkSum.push(self.tcUtilizationDark);
    if (Number.isFinite(self.tcUtilizationEarly)) tcEarlySum.push(self.tcUtilizationEarly);
    if ((self.habits?.townBell || 0) === 0) cleanBellCount += 1;
    totalMarket += Number(self.habits?.market || 0);
    totalCombatMicro += Number(self.habits?.attackMove || 0) + Number(self.habits?.patrol || 0);
    totalMove += Number(self.habits?.move || 0);
    if (self.techProfile?.armyRelevance?.primaryClass) {
      bsTotal += 1;
      if (self.techProfile.armyRelevance.wellEquipped) bsEquipped += 1;
    }
    if (Number.isFinite(self.peakEapm) && (!peakEapmRec || self.peakEapm > peakEapmRec.peakEapm)) {
      peakEapmRec = {
        peakEapm: Math.round(self.peakEapm),
        minute: self.peakEapmMinute || null,
        civ: r.civ || r.telemetry?.context?.civ || null,
        mapName: r.mapName || r.telemetry?.context?.mapName || null,
      };
    }
    for (const u of (self.topUnits || [])) {
      if (!u || !u.name || !Number.isFinite(Number(u.count))) continue;
      const cur = unitTotals.get(u.name) || { name: u.name, key: u.key || u.name, count: 0 };
      cur.count += Number(u.count);
      unitTotals.set(u.name, cur);
      totalUnits += Number(u.count);
    }
    for (const w of (self.topWorkshops || [])) {
      if (!w || !w.name) continue;
      const cur = wsTotals.get(w.name) || { name: w.name, units: 0, buildings: 0 };
      cur.units += Number(w.units || 0);
      cur.buildings += Number(w.count || 0);
      wsTotals.set(w.name, cur);
      totalWsUnits += Number(w.units || 0);
    }
  }

  const topUnits = [...unitTotals.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((u) => ({ ...u, share: totalUnits > 0 ? pct(u.count, totalUnits) : 0 }));
  const topWorkshops = [...wsTotals.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, 3)
    .map((w) => ({ ...w, share: totalWsUnits > 0 ? pct(w.units, totalWsUnits) : 0 }));
  const dominantWorkshop = topWorkshops[0] || null;
  const cavalryShare = topWorkshops
    .filter((w) => /establo/i.test(w.name))
    .reduce((s, w) => s + w.share, 0);

  return {
    sample: pool.length,
    isModeExact: useScoped,
    scopeLabel,
    topUnits,
    topWorkshops,
    dominantWorkshop,
    cavalryShare,
    tcDarkAvg: avg(tcDarkSum, 1),
    tcEarlyAvg: avg(tcEarlySum, 1),
    cleanDefensePct: pct(cleanBellCount, pool.length),
    blacksmithPct: bsTotal >= 2 ? pct(bsEquipped, bsTotal) : null,
    blacksmithSample: bsTotal,
    peakEapm: peakEapmRec,
    avgMarketPerGame: Math.round((totalMarket / pool.length) * 10) / 10,
    totalCombatMicro,
    totalMove,
  };
}

/* ==================== 7. Química de Escuadrón & Rivales Frecuentes ==================== */
function computeSquadAndRivals(stats) {
  const allies = (Array.isArray(stats?.allies) ? stats.allies : []).filter((a) => Number(a.games) >= 5);
  const opponents = (Array.isArray(stats?.opponents) ? stats.opponents : []).filter((o) => Number(o.games) >= 3);

  const allyBig = allies.filter((a) => a.games >= 8);
  const allyPool = allyBig.length >= 2 ? allyBig : allies;
  const bestAlly = allyPool.length
    ? [...allyPool].sort((a, b) => (b.winRate - a.winRate) || (b.games - a.games))[0]
    : null;
  const roughAllyCandidate = allyPool.length >= 2
    ? [...allyPool].sort((a, b) => (a.winRate - b.winRate) || (b.games - a.games))[0]
    : null;
  const roughAlly = roughAllyCandidate && bestAlly && roughAllyCandidate.profileId !== bestAlly.profileId &&
    roughAllyCandidate.winRate <= 48 && (bestAlly.winRate - roughAllyCandidate.winRate) >= 7
    ? roughAllyCandidate
    : null;

  const preyPlayer = opponents
    .filter((o) => o.winRate >= 66)
    .sort((a, b) => (b.winRate - a.winRate) || (b.games - a.games))[0] || null;
  const nemesisPlayer = opponents
    .filter((o) => o.winRate <= 36)
    .sort((a, b) => (a.winRate - b.winRate) || (b.games - a.games))[0] || null;

  if (!bestAlly && !preyPlayer && !nemesisPlayer) return null;
  return { bestAlly, roughAlly, preyPlayer, nemesisPlayer };
}

/* ==================== 8. Vitrina de Récords y Trofeos de Carrera ==================== */
function computeTrophies({ eloSeries, unifiedMatches, stats, ladder }) {
  const pts = (Array.isArray(eloSeries) ? eloSeries : [])
    .filter((p) => p && Number.isFinite(Number(p.diff)) && Number(p.diff) !== 0);

  let bestWinStreak = null;
  let bestSession = null;
  if (pts.length >= 5) {
    let cur = 0;
    let best = 0;
    let bestDate = null;
    for (const p of pts) {
      const won = p.won === true || (p.won == null && Number(p.diff) > 0);
      if (won) {
        cur += 1;
        if (cur >= best) {
          best = cur;
          bestDate = p.startedAt || null;
        }
      } else {
        cur = 0;
      }
    }
    if (best >= 2) {
      const activeStreak = Number(ladder?.streak || 0);
      bestWinStreak = { count: best, active: activeStreak >= best && activeStreak > 0, date: bestDate };
    }

    // Sesiones con gap <= 90m
    const timed = pts.filter((p) => Number.isFinite(Number(p.startedAt)) && Number(p.startedAt) > 0)
      .sort((a, b) => Number(a.startedAt) - Number(b.startedAt));
    const sessions = [];
    let curSess = [];
    for (const p of timed) {
      const prev = curSess[curSess.length - 1];
      if (!prev || Number(p.startedAt) - Number(prev.startedAt) <= SESSION_GAP_MS) curSess.push(p);
      else { sessions.push(curSess); curSess = [p]; }
    }
    if (curSess.length) sessions.push(curSess);
    for (const s of sessions) {
      if (s.length < 2) continue;
      const net = Math.round(s.reduce((sum, p) => sum + Number(p.diff || 0), 0));
      const wins = s.filter((p) => (p.won === true) || (p.won == null && Number(p.diff) > 0)).length;
      if (net > 0 && (!bestSession || net > bestSession.netElo)) {
        bestSession = {
          netElo: net,
          wins,
          losses: s.length - wins,
          games: s.length,
          fromElo: Math.round(Number(s[0].rating || 0) - Number(s[0].diff || 0)),
          toElo: Math.round(Number(s[s.length - 1].rating || 0)),
        };
      }
    }
  }

  const validWins = (unifiedMatches || []).filter((m) =>
    m.won === true &&
    Number.isFinite(Number(m.durationGameSec)) &&
    Number(m.durationGameSec) >= 300 &&
    Number(m.durationGameSec) <= 6 * 3600
  );
  const fastestWin = validWins.length
    ? [...validWins].sort((a, b) => Number(a.durationGameSec) - Number(b.durationGameSec))[0]
    : null;
  const longestWin = validWins.length
    ? [...validWins].sort((a, b) => Number(b.durationGameSec) - Number(a.durationGameSec))[0]
    : null;

  const pool = effectiveCivPool(stats?.allCivs?.length ? stats.allCivs : stats?.topCivs);
  let otpIndex = null;
  if (pool.effCivs != null && pool.top1) {
    const label = pool.top1Share >= 45 ? 'Especialista (OTP)'
      : pool.effCivs >= 6 ? 'Camaleón versátil'
        : 'Pool flexible';
    otpIndex = {
      effCivs: pool.effCivs,
      topCiv: pool.top1.civ,
      topCivSlug: pool.top1.civSlug || civSlug(pool.top1.civ),
      topShare: pool.top1Share,
      label,
    };
  }

  if (!bestWinStreak && !bestSession && !fastestWin && !otpIndex) return null;
  return {
    bestWinStreak,
    bestSession,
    fastestWin: fastestWin ? {
      minutes: Math.round(Number(fastestWin.durationGameSec) / 60),
      civ: fastestWin.civ,
      mapName: fastestWin.mapName,
    } : null,
    longestWin: longestWin && (!fastestWin || longestWin.matchId !== fastestWin.matchId) ? {
      minutes: Math.round(Number(longestWin.durationGameSec) / 60),
      civ: longestWin.civ,
      mapName: longestWin.mapName,
    } : null,
    otpIndex,
  };
}

/* ==================== 9. ADN de Jugador (Arquetipo Computado + 5 Ejes Reales) ==================== */
function computePlayerDna({ stats, insights, killerWindow, giantSlayer, combatDna, speedVsBrain, trophies }) {
  const pool = effectiveCivPool(stats?.allCivs?.length ? stats.allCivs : stats?.topCivs);
  const earlyPhases = (killerWindow?.phases || []).filter((p) => p.id === 'feudal' || p.id === 'castle');
  const earlyG = earlyPhases.reduce((s, p) => s + p.games, 0);
  const earlyW = earlyPhases.reduce((s, p) => s + p.wins, 0);
  const earlyWr = earlyG >= 4 ? pct(earlyW, earlyG) : null;

  const latePhases = (killerWindow?.phases || []).filter((p) => p.id === 'imperial' || p.id === 'postimp');
  const lateG = latePhases.reduce((s, p) => s + p.games, 0);
  const lateW = latePhases.reduce((s, p) => s + p.wins, 0);
  const lateWr = lateG >= 4 ? pct(lateW, lateG) : null;

  const agroShare = insights?.agroShare ?? null;
  const aggroScore = (agroShare != null && earlyWr != null)
    ? clamp(Math.round(0.55 * agroShare + 0.45 * earlyWr), 15, 98)
    : (earlyWr != null ? clamp(earlyWr, 15, 98) : (agroShare != null ? clamp(agroShare, 15, 98) : null));

  let rhythmScore = null;
  let rhythmVal = null;
  if (speedVsBrain && speedVsBrain.avgSelf && speedVsBrain.avgRival) {
    const rel = clamp(Math.round(62 + ((speedVsBrain.avgSelf - speedVsBrain.avgRival) / speedVsBrain.avgRival) * 65), 25, 98);
    rhythmScore = combatDna?.tcEarlyAvg != null ? Math.round(0.5 * combatDna.tcEarlyAvg + 0.5 * rel) : rel;
    rhythmVal = `${String(speedVsBrain.avgSelf).replace('.', ',')} eAPM`;
  } else if (combatDna?.tcEarlyAvg != null) {
    rhythmScore = clamp(Math.round(combatDna.tcEarlyAvg), 20, 99);
    rhythmVal = `${String(combatDna.tcEarlyAvg).replace('.', ',')}% TC`;
  }

  const clutchScore = giantSlayer?.vsHigher?.games >= 4
    ? clamp(Math.round(50 + (giantSlayer.vsHigher.winRate - 45) * 1.8), 15, 98)
    : null;
  const versatilityScore = pool.effCivs != null
    ? clamp(Math.round(pool.effCivs * 12), 18, 98)
    : null;
  const lateScore = lateWr != null
    ? clamp(Math.round(50 + (lateWr - 50) * 1.5), 15, 98)
    : null;

  const axes = [
    { id: 'aggro', label: 'Agresión', score: aggroScore ?? 50, hasData: aggroScore != null, valueText: agroShare != null ? `${agroShare}%` : (earlyWr != null ? `${earlyWr}%` : '—') },
    { id: 'rhythm', label: 'Ritmo', score: rhythmScore ?? 50, hasData: rhythmScore != null, valueText: rhythmVal || '—' },
    { id: 'clutch', label: 'Clutch', score: clutchScore ?? 50, hasData: clutchScore != null, valueText: giantSlayer?.vsHigher ? `${giantSlayer.vsHigher.winRate}%` : '—' },
    { id: 'versatility', label: 'Arsenal', score: versatilityScore ?? 50, hasData: versatilityScore != null, valueText: pool.effCivs != null ? `${String(pool.effCivs).replace('.', ',')} civs` : '—' },
    { id: 'late', label: 'Late', score: lateScore ?? 50, hasData: lateScore != null, valueText: lateWr != null ? `${lateWr}%` : '—' },
  ];

  // Arquetipo determinista priorizado por señal dominante real
  let title = 'Comandante Equilibrado';
  let tag = 'ESTILO VERSÁTIL';
  let punchline = 'Perfil sólido y balanceado a lo largo de todas las edades.';

  if (combatDna && combatDna.isModeExact && combatDna.cavalryShare >= 70) {
    title = 'Señor de los Establos';
    tag = 'CABALLERÍA DOMINANTE';
    punchline = `${combatDna.cavalryShare}% de tu ejército sale de Establos${pool.effCivs >= 6 ? ` · ${String(pool.effCivs).replace('.', ',')} civs efectivas` : ''}.`;
  } else if (pool.top1 && pool.top1Share >= 45 && pool.total >= 20) {
    title = 'Maestro Especialista';
    tag = `FIRMA ${pool.top1Share}%`;
    punchline = `Dominás un núcleo enfocado (${pool.top1Share}% de tus partidas con tu civ principal).`;
  } else if ((agroShare != null && agroShare >= 62) || (speedVsBrain && speedVsBrain.fasterShare >= 85 && earlyWr != null && earlyWr >= 65)) {
    title = 'Aplanadora de Feudal';
    tag = 'INICIATIVA Y VELOCIDAD';
    punchline = speedVsBrain && speedVsBrain.fasterShare >= 80
      ? `Más rápido que el rival en el ${speedVsBrain.fasterShare}% de tus partidas (${earlyWr ?? speedVsBrain.faster?.winRate ?? 60}% WR temprano).`
      : `${agroShare}% aperturas de presión temprana marcando el ritmo desde Feudal.`;
  } else if (earlyWr != null && lateWr != null && earlyWr - lateWr >= 14) {
    title = 'Relámpago de Castillos';
    tag = 'CIERRE TEMPRANO';
    punchline = `Definís antes del min 35 (${earlyWr}% WR temprano vs ${lateWr}% en partidas largas).`;
  } else if (earlyWr != null && lateWr != null && lateWr - earlyWr >= 14) {
    title = 'Titán del Post-Imperial';
    tag = 'GUERRA LARGA';
    punchline = `Cuanto más se alarga la partida, más dominás (${lateWr}% WR pasado el min 35).`;
  } else if (pool.effCivs != null && pool.effCivs >= 6.5) {
    title = 'Estratega Camaleón';
    tag = 'ARSENAL AMPLIO';
    punchline = `${String(pool.effCivs).replace('.', ',')} civilizaciones efectivas sin depender de un solo pick.`;
  }

  const signals = [];
  if (speedVsBrain) {
    signals.push({
      label: 'Velocidad',
      value: `${String(speedVsBrain.avgSelf).replace('.', ',')} eAPM`,
      sub: `vs ${String(speedVsBrain.avgRival).replace('.', ',')} rival`,
    });
  } else if (combatDna?.tcDarkAvg != null) {
    signals.push({
      label: 'TC Alta Edad',
      value: `${String(combatDna.tcDarkAvg).replace('.', ',')}%`,
      sub: `${combatDna.sample} replays`,
    });
  }
  if (killerWindow?.peak) {
    signals.push({
      label: 'Ventana letal',
      value: `${killerWindow.peak.label} · ${killerWindow.peak.winRate}%`,
      sub: `${killerWindow.peak.wins}V-${killerWindow.peak.losses}D`,
    });
  }
  if (trophies?.otpIndex) {
    signals.push({
      label: 'Pool de civs',
      value: trophies.otpIndex.label,
      sub: `${String(trophies.otpIndex.effCivs).replace('.', ',')} civs efectivas`,
    });
  }

  const mainCiv = pool.top1 ? {
    civ: pool.top1.civ,
    civSlug: pool.top1.civSlug || civSlug(pool.top1.civ),
    games: pool.top1.games,
    winRate: pool.top1.winRate,
  } : null;

  return {
    title,
    tag,
    punchline,
    mainCiv,
    axes,
    activeAxesCount: axes.filter((a) => a.hasData).length,
    signals: signals.slice(0, 3),
  };
}

function computeModeDiscoveries({
  modeId = 'rm_1v1',
  isTeam = false,
  profileId = null,
  isOwnProfile = true,
  ladder = null,
  stats = null,
  insights = null,
  eloSeries = [],
  modeMatches = [],
  unifiedMatches = [],
  storedRecords = [],
} = {}) {
  const goldenHour = computeGoldenHour(eloSeries);
  const trident = computeTrident({ stats, unifiedMatches, ladder });
  const giantSlayer = computeGiantSlayer(modeMatches, { isTeam, profileId });
  const speedVsBrain = computeSpeedVsBrain(unifiedMatches);
  const killerWindow = computeKillerWindow(unifiedMatches);
  const combatDna = computeCombatDna(storedRecords, { modeId, profileId, isOwnProfile });
  const squadAndRivals = computeSquadAndRivals(stats);
  const trophies = computeTrophies({ eloSeries, unifiedMatches, stats, ladder });
  const dna = computePlayerDna({ stats, insights, killerWindow, giantSlayer, combatDna, speedVsBrain, trophies });

  return {
    dna,
    goldenHour,
    trident,
    giantSlayer,
    speedVsBrain,
    killerWindow,
    combatDna,
    squadAndRivals,
    trophies,
  };
}

module.exports = {
  computeModeDiscoveries,
  computeGoldenHour,
  computeTrident,
  computeGiantSlayer,
  computeSpeedVsBrain,
  computeKillerWindow,
  computeCombatDna,
  computeSquadAndRivals,
  computeTrophies,
  computePlayerDna,
};
