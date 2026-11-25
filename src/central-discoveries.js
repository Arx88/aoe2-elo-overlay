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
const { mapKey, resolveMode } = require('./rival');
const { SAMPLE_POLICY, isNomadStartMap, isClosedBoomMap } = require('./sample-policy');

const SESSION_GAP_MS = 90 * 60_000;
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const AOE_COLORS = Object.freeze({
  1: { id: 1, name: 'Azul', cls: 'c1' },
  2: { id: 2, name: 'Rojo', cls: 'c2' },
  3: { id: 3, name: 'Verde', cls: 'c3' },
  4: { id: 4, name: 'Amarillo', cls: 'c4' },
  5: { id: 5, name: 'Cian', cls: 'c5' },
  6: { id: 6, name: 'Rosa', cls: 'c6' },
  7: { id: 7, name: 'Gris', cls: 'c7' },
  8: { id: 8, name: 'Naranja', cls: 'c8' },
});
const TOP_META_CIV_SLUGS = new Set([
  'franks', 'mongols', 'britons', 'khmer', 'magyars', 'persians', 'mayans', 'hindustanis',
]);
const TRASH_UNIT_RE = /lancero|piquero|alabardero|guerrillero|hostigador|exploraci|h[uú]sar|caballer[ií]a ligera|escaramuzador/i;
const SIEGE_WORKSHOP_RE = /asedio|maquinaria/i;
const MONASTERY_RE = /monasterio|monje/i;

function median(arr, digits = 0) {
  const valid = (Array.isArray(arr) ? arr : []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  const val = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  const s = 10 ** digits;
  return Math.round(val * s) / s;
}

function percentile(arr, p) {
  const valid = (Array.isArray(arr) ? arr : []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const idx = clamp((valid.length - 1) * p, 0, valid.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(valid[lo] + (valid[hi] - valid[lo]) * (idx - lo));
}

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
    if (golden && cursed && golden.id !== cursed.id &&
        cursed.winRate <= SAMPLE_POLICY.goldenHour.maxCursedWr &&
        (cursed.winRate < 50 || cursed.netElo < -20) &&
        (golden.winRate - cursed.winRate >= 6 || golden.netElo - cursed.netElo >= 40)) {
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
  let punchlineI18n = null;
  if (golden && cursed) {
    const signG = golden.netElo >= 0 ? '+' : '';
    const signC = cursed.netElo >= 0 ? '+' : '';
    punchline = `${golden.label} (${golden.range}): ${golden.winRate}% WR (${signG}${golden.netElo} ELO) · ${cursed.label}: ${cursed.winRate}% (${signC}${cursed.netElo} ELO).`;
    punchlineI18n = ['cxe.ghBothPunch', {
      _gBlock: golden.id, gRange: golden.range, gWr: golden.winRate, gElo: `${signG}${golden.netElo}`,
      _cBlock: cursed.id, cWr: cursed.winRate, cElo: `${signC}${cursed.netElo}`,
    }];
  } else if (golden) {
    const signG = golden.netElo >= 0 ? '+' : '';
    punchline = `Tu mejor tramo es ${golden.label} (${golden.range}) con ${golden.winRate}% WR (${signG}${golden.netElo} ELO).`;
    punchlineI18n = ['cxe.ghGoldPunch', {
      _gBlock: golden.id, gRange: golden.range, gWr: golden.winRate, gElo: `${signG}${golden.netElo}`,
    }];
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
    punchlineI18n,
  };
}

/* ==================== 2. Tridente Táctico: Arma Secreta · Trampa · Bestia Negra ==================== */
function computeTrident({ stats, unifiedMatches, ladder, isTeam = false }) {
  const baseWr = Number.isFinite(ladder?.winRate) ? ladder.winRate / 100 : 0.5;
  const baseWrPct = Math.round(baseWr * 100);
  const allCivs = (stats?.allCivs?.length ? stats.allCivs : stats?.topCivs || []).filter((c) => Number(c.games) > 0);
  const allMaps = (stats?.allMaps?.length ? stats.allMaps : stats?.topMaps || []).filter((m) => Number(m.games) > 0);
  const totalCivGames = allCivs.reduce((s, c) => s + Number(c.games), 0);
  const totalMapGames = allMaps.reduce((s, m) => s + Number(m.games), 0);

  // Muestra representativa real: jamás coronar "Arma Secreta" o "Mapa Fortaleza" con 2–4 partidas
  const minCiv = totalCivGames >= 80
    ? clamp(Math.round(totalCivGames * 0.04), SAMPLE_POLICY.trident.minSecretCiv, 14)
    : (totalCivGames >= 30 ? SAMPLE_POLICY.trident.minSecretCivSmall : 5);
  const minMap = totalMapGames >= 80
    ? clamp(Math.round(totalMapGames * 0.05), SAMPLE_POLICY.trident.minFortressMap, 15)
    : (totalMapGames >= 30 ? SAMPLE_POLICY.trident.minFortressMapSmall : 5);
  const ebScore = (w, g) => (w + 6 * baseWr) / (g + 6);

  // Arma secreta: mejor civ (EB) con muestra representativa y WR >= 55% (sin fallback flojo de 3 pj)
  const civCandidates = allCivs
    .filter((c) => Number(c.games) >= minCiv && Number(c.winRate) >= 55)
    .sort((a, b) => ebScore(b.wins, b.games) - ebScore(a.wins, a.games) || b.games - a.games);
  const secretCiv = civCandidates[0] || allCivs.filter((c) => Number(c.games) >= minCiv && Number(c.winRate) >= 52).sort((a, b) => ebScore(b.wins, b.games) - ebScore(a.wins, a.games) || b.games - a.games)[0] || null;

  // Mapa fortaleza: exige muestra representativa real y supera el WR base del modo en al menos +4 pp (evita coronar +1 pp)
  const minFortressWr = Math.max(54, baseWrPct + SAMPLE_POLICY.trident.fortressMinDeltaPp);
  const mapCandidates = allMaps
    .filter((m) => Number(m.games) >= minMap && Number(m.winRate) >= minFortressWr)
    .sort((a, b) => ebScore(b.wins, b.games) - ebScore(a.wins, a.games) || b.games - a.games);
  const fortressMap = mapCandidates[0]
    || allMaps.filter((m) => Number(m.games) >= minMap && Number(m.winRate) >= Math.max(52, baseWrPct + 2)).sort((a, b) => ebScore(b.wins, b.games) - ebScore(a.wins, a.games) || b.games - a.games)[0]
    || null;

  // Combos civ @ mapa desde unifiedMatches (oficiales sin sesgo)
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
  const minCombo = SAMPLE_POLICY.trident.minCombo;
  const combos = [...comboMap.values()].map((c) => ({ ...c, losses: c.games - c.wins, winRate: pct(c.wins, c.games) }));
  const bestCombo = combos.filter((c) => c.games >= minCombo && c.winRate >= 65).sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0] || null;
  const secretCivSlug = secretCiv ? (secretCiv.civSlug || civSlug(secretCiv.civ)) : null;
  const secretCivCombo = secretCivSlug
    ? (combos.filter((c) => c.civSlug === secretCivSlug && c.games >= minCombo && c.winRate >= 62).sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0] || null)
    : null;
  const trapCombo = combos.filter((c) => c.games >= minCombo && c.winRate <= 36).sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0] || null;

  // Trampa silenciosa: civ o mapa frecuente que rinde <= 47% WR (piso unificado >= 6 pj)
  const trapMinCiv = clamp(Math.round(totalCivGames * 0.07), SAMPLE_POLICY.trident.minSilentTrap, 18);
  const trapMinMap = clamp(Math.round(totalMapGames * 0.07), SAMPLE_POLICY.trident.minSilentTrap, 18);
  const trapCiv = allCivs
    .filter((c) => Number(c.games) >= trapMinCiv && Number(c.winRate) <= Math.min(47, baseWrPct - 5))
    .sort((a, b) => (a.winRate - b.winRate) || (b.games - a.games))[0] || null;
  const trapMap = allMaps
    .filter((m) => Number(m.games) >= trapMinMap && Number(m.winRate) <= Math.min(46, baseWrPct - 6))
    .sort((a, b) => (a.winRate - b.winRate) || (b.games - a.games))[0] || null;

  let silentTrap = null;
  if (trapCombo && (!trapCiv || trapCombo.winRate <= trapCiv.winRate - 10)) {
    silentTrap = { kind: 'combo', ...trapCombo };
  } else if (trapMap && (!trapCiv || trapMap.winRate <= trapCiv.winRate)) {
    silentTrap = { kind: 'map', mapName: trapMap.mapName, mapKey: trapMap.mapKey || mapKey(trapMap.mapName), games: trapMap.games, wins: trapMap.wins, losses: trapMap.losses, winRate: trapMap.winRate };
  } else if (trapCiv) {
    silentTrap = { kind: 'civ', civ: trapCiv.civ, civSlug: trapCiv.civSlug || civSlug(trapCiv.civ), games: trapCiv.games, wins: trapCiv.wins, losses: trapCiv.losses, winRate: trapCiv.winRate };
  }

  // Bestia Negra & Presa Favorita (recorre TODOS los rivales en TG; unificado >=6 en 1v1, >=8 en TG)
  const oppCivMap = new Map();
  const oppArchMap = new Map();
  for (const m of (unifiedMatches || [])) {
    if (typeof m.won !== 'boolean') continue;
    const oppCivs = (Array.isArray(m.opponents) && m.opponents.length)
      ? m.opponents.map((o) => o?.civ || o?.oppCiv).filter(Boolean)
      : (m.oppCiv ? [m.oppCiv] : []);
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
  const minNemesis = isTeam ? SAMPLE_POLICY.trident.minNemesisTeam : SAMPLE_POLICY.trident.minNemesis1v1;
  const oppList = [...oppCivMap.values()].map((c) => ({ ...c, losses: c.games - c.wins, winRate: pct(c.wins, c.games) }));
  const nemesisExact = oppList.filter((c) => c.games >= minNemesis && c.winRate <= 42).sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0] || null;
  const preyExact = oppList.filter((c) => c.games >= minNemesis && c.winRate >= 68).sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0] || null;

  const archList = [...oppArchMap.values()].filter((a) => a.games >= SAMPLE_POLICY.trident.minArchetypeFallback).map((a) => ({ ...a, losses: a.games - a.wins, winRate: pct(a.wins, a.games) }));
  const nemesisArch = !nemesisExact && archList.length >= 2
    ? [...archList].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0]
    : null;
  const preyArch = !preyExact && archList.length >= 2
    ? [...archList].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
    : null;

  const nemesis = nemesisExact
    ? { kind: 'civ', ...nemesisExact }
    : (nemesisArch && nemesisArch.winRate < 48 ? { kind: 'archetype', ...nemesisArch } : null);
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
      combo: secretCivCombo,
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

    // Evaluar por partida (en Global jamás forzar isTeam=true sobre partidas 1v1)
    const matchIsTeam = m.is1v1 === true
      ? false
      : (m.isTeam === true || players.length >= 4 || (players.length === 0 && Boolean(isTeam)));
    if (matchIsTeam) {
      if (players.length >= 4 && me?.team != null) {
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
  let headlineI18n = null;
  if (faster.length === pairs.length) {
    headline = `Más rápido en ${pairs.length}/${pairs.length} replays (${fasterStats.winRate}% WR · ${avgSelf} vs ${avgRival} eAPM).`;
    headlineI18n = ['cxe.svbAllFaster', { n: pairs.length, wr: fasterStats.winRate, self: avgSelf, rival: avgRival }];
  } else if (fasterStats && slowerStats && fasterStats.games >= 3 && slowerStats.games >= 3) {
    const diff = fasterStats.winRate - slowerStats.winRate;
    if (diff >= 12) {
      headline = `Imponés ritmo: ${fasterStats.winRate}% WR cuando superás en eAPM vs ${slowerStats.winRate}% por debajo.`;
      headlineI18n = ['cxe.svbTempo', { fast: fasterStats.winRate, slow: slowerStats.winRate }];
    } else if (diff <= -8) {
      headline = `Juego cerebral: ganás el ${slowerStats.winRate}% incluso con menos clics que el rival.`;
      headlineI18n = ['cxe.svbBrain', { slow: slowerStats.winRate }];
    } else {
      headline = `Equilibrio velocidad/decisión: ${fasterStats.winRate}% más rápido · ${slowerStats.winRate}% más lento.`;
      headlineI18n = ['cxe.svbBalanced', { fast: fasterStats.winRate, slow: slowerStats.winRate }];
    }
  }

  return {
    sample: pairs.length,
    avgSelf,
    avgRival,
    fasterShare,
    faster: fasterStats,
    slower: slowerStats,
    headlineI18n,
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
function computeKillerWindow(unifiedMatches, { isTeam = false } = {}) {
  const valid = (Array.isArray(unifiedMatches) ? unifiedMatches : []).filter((m) =>
    typeof m.won === 'boolean' &&
    Number.isFinite(Number(m.durationGameSec)) &&
    Number(m.durationGameSec) >= 300 &&
    Number(m.durationGameSec) <= 6 * 3600
  );
  if (valid.length < 8) return null;

  const defs = isTeam
    ? [
        { id: 'feudal', label: 'Feudal', range: '<28m', icon: 'barracks', test: (min) => min < 28 },
        { id: 'castle', label: 'Castillos', range: '28–42m', icon: 'castle', test: (min) => min >= 28 && min < 42 },
        { id: 'imperial', label: 'Imperial', range: '42–58m', icon: 'sword', test: (min) => min >= 42 && min < 58 },
        { id: 'postimp', label: 'Post-Imp', range: '58m+', icon: 'crown', test: (min) => min >= 58 },
      ]
    : [
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
    // Nunca pintar en rojo (isValley) un tramo con >= 50% WR
    if (valley.id !== peak.id && valley.winRate < 50 && peak.winRate - valley.winRate >= 10) valley.isValley = true;
    else valley = null;
  } else if (eligible.length === 1) {
    peak = eligible[0];
    peak.isPeak = true;
  }

  const winMins = valid.filter((m) => m.won).map((m) => Number(m.durationGameSec) / 60);
  const lossMins = valid.filter((m) => !m.won).map((m) => Number(m.durationGameSec) / 60);

  return {
    sample: valid.length,
    isTeam: Boolean(isTeam),
    clockNote: 'reloj de juego (1,7×)',
    phases,
    peak,
    valley,
    avgWinMin: avg(winMins, 1),
    avgLossMin: avg(lossMins, 1),
  };
}

/* ==================== 6. Huella de Combate (Replays locales .aoe2record) ==================== */
function recordMatchesMode(rec, modeId) {
  if (!modeId || modeId === 'global') return true;
  const rawLb = rec?.leaderboardId ?? rec?.match?.leaderboardId ?? null;
  if (rawLb == null) return false;
  const resolved = resolveMode(rawLb);
  if (resolved && resolved.key) return resolved.key === modeId;
  const lbMap = { rm_1v1: '3', rm_team: '4', ew_1v1: '13', ew_team: '14' };
  return String(rawLb).toLowerCase() === modeId || String(rawLb) === lbMap[modeId];
}

function computeCombatDna(storedRecords, { modeId = 'global', profileId = null, isOwnProfile = true } = {}) {
  if (!isOwnProfile || !Array.isArray(storedRecords) || !storedRecords.length) return null;
  const pid = profileId != null ? String(profileId) : null;

  const validAll = storedRecords.filter((r) => {
    if (!r || (pid && r.profileId != null && String(r.profileId) !== pid)) return false;
    const eng = r.telemetry?.engineSummary || r.telemetry?.engine;
    if (!eng || !eng.self) return false;
    const dur = Number(eng.durationSeconds ?? r.telemetry?.durationSeconds ?? r.durationSeconds ?? 0);
    return Number.isFinite(dur) && dur >= 180;
  });
  if (validAll.length < 3) return null;

  const modeScoped = modeId !== 'global' ? validAll.filter((r) => recordMatchesMode(r, modeId)) : validAll;
  // Cero fugas entre modos: si la pestaña es de un modo concreto (RM 1v1, EW 1v1, EW Team) y no tiene >=3 replays propios, no inyectar replays de otro modo
  if (modeId !== 'global' && modeScoped.length < 3) return null;
  const useScoped = true;
  const pool = modeScoped;
  const scopeLabel = `${pool.length} replays locales`;

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
      // P1-5: Agrupar por key canónica (unifica "Cab. de exploración" y "Caballería de exploración")
      const canonicalKey = String(u.key || u.name).toLowerCase()
        .replace(/^caballer[ií]a-de-exploraci[oó]n$/, 'cab-de-exploracion')
        .replace(/^cab-de-exploraci[oó]n$/, 'cab-de-exploracion');
      const cur = unitTotals.get(canonicalKey) || { name: u.name, key: canonicalKey, count: 0 };
      if (u.name.length > cur.name.length && !/\./.test(u.name)) cur.name = u.name;
      cur.count += Number(u.count);
      unitTotals.set(canonicalKey, cur);
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
    unitCountLabel: 'unidades ordenadas',
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
function computeStreakAndSessionForSeries(series, { modeLabel = null, activeStreak = 0 } = {}) {
  const pts = (Array.isArray(series) ? series : [])
    .filter((p) => p && Number.isFinite(Number(p.diff)) && Number(p.diff) !== 0)
    .sort((a, b) => Number(a.startedAt || a.index || 0) - Number(b.startedAt || b.index || 0));

  let bestWinStreak = null;
  let bestSession = null;
  if (pts.length < 5) return { bestWinStreak, bestSession };

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
    bestWinStreak = { count: best, active: activeStreak >= best && activeStreak > 0, date: bestDate, modeLabel };
  }

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
        modeLabel,
      };
    }
  }
  return { bestWinStreak, bestSession };
}

function computeTrophies({ eloSeries, modeEloSeriesMap = null, unifiedMatches, stats, ladder }) {
  let bestWinStreak = null;
  let bestSession = null;

  // P0-3: En Global jamás fusionar ladders distintos en una misma sesión o racha;
  // elegir el mejor récord real por modo y etiquetar de qué modo proviene.
  if (modeEloSeriesMap && typeof modeEloSeriesMap === 'object' && Object.keys(modeEloSeriesMap).length) {
    for (const entry of Object.values(modeEloSeriesMap)) {
      if (!entry || !Array.isArray(entry.series) || entry.series.length < 5) continue;
      const res = computeStreakAndSessionForSeries(entry.series, {
        modeLabel: entry.label || null,
        activeStreak: Number(entry.streak || 0),
      });
      if (res.bestWinStreak && (!bestWinStreak || res.bestWinStreak.count > bestWinStreak.count)) {
        bestWinStreak = res.bestWinStreak;
      }
      if (res.bestSession && (!bestSession || res.bestSession.netElo > bestSession.netElo)) {
        bestSession = res.bestSession;
      }
    }
  } else {
    const res = computeStreakAndSessionForSeries(eloSeries, { activeStreak: Number(ladder?.streak || 0) });
    bestWinStreak = res.bestWinStreak;
    bestSession = res.bestSession;
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
    durationScope: 'reloj de juego',
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
function computePlayerDna({ modeId = 'rm_1v1', stats, insights, killerWindow, giantSlayer, combatDna, speedVsBrain, trophies }) {
  const isEmpireWars = modeId === 'ew_1v1' || modeId === 'ew_team';
  // P0-4: Nunca inyectar telemetría local de RM Team dentro de RM 1v1, EW o un Global con muestra sesgada
  const allowCombatDna = Boolean(
    combatDna &&
    !isEmpireWars &&
    (modeId === 'global' ? combatDna.sample >= 15 : combatDna.isModeExact)
  );
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
  // Escala 1:1 honesta: todo eje expresado en % estira el vértice EXACTAMENTE a ese porcentaje (100% toca el borde exterior)
  const aggroScore = agroShare != null
    ? clamp(Math.round(agroShare), 0, 100)
    : (earlyWr != null ? clamp(Math.round(earlyWr), 0, 100) : null);

  let rhythmScore = null;
  let rhythmVal = null;
  let rhythmTip = 'Ritmo mecánico (eAPM o continuidad de TC)';
  let rhythmTipI18n = ['cxe.tipRhythmEmpty', null];
  if (speedVsBrain && speedVsBrain.avgSelf) {
    rhythmScore = clamp(Math.round((speedVsBrain.avgSelf / 75) * 100), 8, 100);
    rhythmVal = `${String(speedVsBrain.avgSelf).replace('.', ',')} eAPM`;
    rhythmTip = `Velocidad efectiva propia (${rhythmVal} · escala 0–75 eAPM)`;
    rhythmTipI18n = ['cxe.tipRhythmEapm', { val: rhythmVal }];
  } else if (allowCombatDna && combatDna?.tcEarlyAvg != null) {
    rhythmScore = clamp(Math.round(combatDna.tcEarlyAvg), 0, 100);
    rhythmVal = `${String(combatDna.tcEarlyAvg).replace('.', ',')}% TC`;
    rhythmTip = `Uso continuo del Centro urbano en Alta + Feudal (${rhythmVal})`;
    rhythmTipI18n = ['cxe.tipRhythmTc', { val: rhythmVal }];
  }

  const vsHigherWr = giantSlayer?.vsHigher?.games >= 4 ? giantSlayer.vsHigher.winRate : null;
  const clutchScore = vsHigherWr != null ? clamp(Math.round(vsHigherWr), 0, 100) : null;
  const versatilityScore = pool.effCivs != null
    ? clamp(Math.round((pool.effCivs / 10) * 100), 8, 100)
    : null;
  const lateScore = lateWr != null
    ? clamp(Math.round(lateWr), 0, 100)
    : null;

  const axes = [
    {
      id: 'aggro',
      label: 'Agresión',
      score: aggroScore ?? 50,
      hasData: aggroScore != null,
      valueText: agroShare != null ? `${agroShare}%` : (earlyWr != null ? `${earlyWr}%` : '—'),
      tooltip: agroShare != null
        ? `Porcentaje de aperturas agresivas en Edad Feudal (${agroShare}%).`
        : 'Efectividad en definiciones tempranas.',
      tooltipI18n: agroShare != null ? ['cxe.tipAggroData', { pct: agroShare }] : ['cxe.tipAggroEmpty', null],
    },
    {
      id: 'rhythm',
      label: 'Ritmo',
      score: rhythmScore ?? 50,
      hasData: rhythmScore != null,
      valueText: rhythmVal || '—',
      tooltip: rhythmTip,
      tooltipI18n: rhythmTipI18n,
    },
    {
      id: 'clutch',
      label: 'vs +ELO',
      score: clutchScore ?? 50,
      hasData: clutchScore != null,
      valueText: vsHigherWr != null ? `${vsHigherWr}%` : '—',
      tooltip: vsHigherWr != null
        ? `Tu winrate enfrentando rivales o equipos de mayor ELO (${giantSlayer.vsHigher.wins}V-${giantSlayer.vsHigher.losses}D).`
        : 'Winrate enfrentando rivales de mayor ELO (requiere ≥4 partidas).',
      tooltipI18n: vsHigherWr != null
        ? ['cxe.tipClutchData', { _w: giantSlayer.vsHigher.wins, _l: giantSlayer.vsHigher.losses }]
        : ['cxe.tipClutchEmpty', null],
    },
    {
      id: 'versatility',
      label: 'Arsenal',
      score: versatilityScore ?? 50,
      hasData: versatilityScore != null,
      valueText: pool.effCivs != null ? `${String(pool.effCivs).replace('.', ',')} civs` : '—',
      tooltip: pool.effCivs != null
        ? `Diversidad efectiva de civilizaciones (${String(pool.effCivs).replace('.', ',')} civs · escala 0–10).`
        : 'Diversidad efectiva de tu pool de civilizaciones.',
      tooltipI18n: pool.effCivs != null
        ? ['cxe.tipVersData', { eff: String(pool.effCivs).replace('.', ',') }]
        : ['cxe.tipVersEmpty', null],
    },
    {
      id: 'late',
      label: 'Juego Tardío',
      score: lateScore ?? 50,
      hasData: lateScore != null,
      valueText: lateWr != null ? `${lateWr}%` : '—',
      tooltip: lateWr != null
        ? `Tu winrate cuando la partida llega a Edad Imperial o Post-Imperial (${lateW}V-${lateG - lateW}D).`
        : 'Winrate en Edad Imperial y Post-Imperial.',
      tooltipI18n: lateWr != null
        ? ['cxe.tipLateData', { _w: lateW, _l: lateG - lateW }]
        : ['cxe.tipLateEmpty', null],
    },
  ];

  // Arquetipo determinista priorizado por señal dominante real
  let title = 'Comandante Equilibrado';
  let tag = 'ESTILO VERSÁTIL';
  let tagI18n = ['cxe.archBalancedTag', null];
  let punchline = 'Perfil sólido y balanceado a lo largo de todas las edades.';
  let punchlineI18n = ['cxe.archBalancedPunch', null];

  const combatArchetypeAllowed = allowCombatDna
    && combatDna.cavalryShare >= 70
    && combatDna.sample >= SAMPLE_POLICY.dna.minCombatDnaReplaysForArchetype
    && (combatDna.sample >= SAMPLE_POLICY.dna.minCombatDnaAbsoluteReplays
      || pool.total <= 0
      || (combatDna.sample / pool.total) >= SAMPLE_POLICY.dna.minCombatDnaShareOfMode);

  if (combatArchetypeAllowed) {
    title = 'Señor de los Establos';
    tag = 'CABALLERÍA DOMINANTE';
    tagI18n = null;
    punchline = `${combatDna.cavalryShare}% de tu ejército sale de Establos (${combatDna.sample} replays)${pool.effCivs >= 6 ? ` · ${String(pool.effCivs).replace('.', ',')} civs efectivas` : ''}.`;
    punchlineI18n = pool.effCivs >= 6
      ? ['cxe.archStablesPunchWide', { pct: combatDna.cavalryShare, n: combatDna.sample, eff: String(pool.effCivs).replace('.', ',') }]
      : ['cxe.archStablesPunch', { pct: combatDna.cavalryShare, n: combatDna.sample }];
  } else if (pool.top1 && pool.top1Share >= 45 && pool.total >= 20) {
    title = 'Maestro Especialista';
    tag = `FIRMA ${pool.top1Share}%`;
    tagI18n = ['cxe.archOtpTag', { pct: pool.top1Share }];
    punchline = `Dominás un núcleo enfocado (${pool.top1Share}% de tus partidas con tu civ principal).`;
    punchlineI18n = ['cxe.archOtpPunch', { pct: pool.top1Share }];
  } else if ((agroShare != null && agroShare >= 62) || (speedVsBrain && speedVsBrain.fasterShare >= 85 && earlyWr != null && earlyWr >= 65)) {
    title = 'Aplanadora de Feudal';
    tag = 'INICIATIVA Y VELOCIDAD';
    tagI18n = null;
    punchline = speedVsBrain && speedVsBrain.fasterShare >= 80
      ? `Más rápido que el rival en el ${speedVsBrain.fasterShare}% de tus partidas (${earlyWr ?? speedVsBrain.faster?.winRate ?? 60}% WR temprano).`
      : `${agroShare}% aperturas de presión temprana marcando el ritmo desde Feudal.`;
    punchlineI18n = speedVsBrain && speedVsBrain.fasterShare >= 80
      ? ['cxe.archFeudalPunchFast', { share: speedVsBrain.fasterShare, wr: earlyWr ?? speedVsBrain.faster?.winRate ?? 60 }]
      : ['cxe.archFeudalPunchAgro', { pct: agroShare }];
  } else if (earlyWr != null && lateWr != null && earlyWr - lateWr >= 14) {
    title = 'Relámpago de Castillos';
    tag = 'CIERRE TEMPRANO';
    tagI18n = null;
    punchline = `Definís antes del min 35 (${earlyWr}% WR temprano vs ${lateWr}% en partidas largas).`;
    punchlineI18n = ['cxe.archCastlePunch', { early: earlyWr, late: lateWr }];
  } else if (earlyWr != null && lateWr != null && lateWr - earlyWr >= 14) {
    title = 'Titán del Post-Imperial';
    tag = 'GUERRA LARGA';
    tagI18n = null;
    punchline = `Cuanto más se alarga la partida, más dominás (${lateWr}% WR pasado el min 35).`;
    punchlineI18n = ['cxe.archPostImpPunch', { late: lateWr }];
  } else if (pool.effCivs != null && pool.effCivs >= 6.5) {
    title = 'Estratega Camaleón';
    tag = 'ARSENAL AMPLIO';
    tagI18n = null;
    punchline = `${String(pool.effCivs).replace('.', ',')} civilizaciones efectivas sin depender de un solo pick.`;
    punchlineI18n = ['cxe.archChameleonPunch', { eff: String(pool.effCivs).replace('.', ',') }];
  }

  const signals = [];
  if (speedVsBrain) {
    signals.push({
      label: 'Velocidad',
      labelI18n: ['cxe.sigSpeed', null],
      value: `${String(speedVsBrain.avgSelf).replace('.', ',')} eAPM`,
      sub: `vs ${String(speedVsBrain.avgRival).replace('.', ',')} rival`,
      subI18n: ['cxe.sigSpeedSub', { val: String(speedVsBrain.avgRival).replace('.', ',') }],
    });
  } else if (allowCombatDna && combatDna?.tcDarkAvg != null) {
    signals.push({
      label: 'TC Alta Edad',
      labelI18n: ['cxe.sigTcDark', null],
      value: `${String(combatDna.tcDarkAvg).replace('.', ',')}%`,
      sub: `${combatDna.sample} replays`,
      subI18n: ['cxe.sigReplays', { n: combatDna.sample }],
    });
  }
  if (killerWindow?.peak) {
    signals.push({
      label: 'Ventana letal',
      labelI18n: ['cxe.sigKillerWindow', null],
      value: `${killerWindow.peak.label} · ${killerWindow.peak.winRate}%`,
      valuePhase: killerWindow.peak.label,
      valueWr: killerWindow.peak.winRate,
      sub: `${killerWindow.peak.wins}V-${killerWindow.peak.losses}D`,
      subWL: [killerWindow.peak.wins, killerWindow.peak.losses],
    });
  }
  if (trophies?.otpIndex) {
    signals.push({
      label: 'Pool de civs',
      labelI18n: ['cxe.sigCivPool', null],
      value: trophies.otpIndex.label,
      valueOtp: true,
      sub: `${String(trophies.otpIndex.effCivs).replace('.', ',')} civs efectivas`,
      subI18n: ['cxe.sigEffCivs', { eff: String(trophies.otpIndex.effCivs).replace('.', ',') }],
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
    tagI18n,
    punchline,
    punchlineI18n,
    mainCiv,
    axes,
    activeAxesCount: axes.filter((a) => a.hasData).length,
    signals: signals.slice(0, 3),
  };
}

/* ==================== 10. Radiografía de Team Games (Pocket vs Flank · 2v2/3v3/4v4 · Carry) ==================== */
function computeTgRadiography(modeMatches, { profileId = null } = {}) {
  const list = Array.isArray(modeMatches) ? modeMatches : [];
  const pid = profileId != null ? Number(profileId) : null;
  const pocket = { games: 0, wins: 0, archerPickGames: 0, archerPickWins: 0, cavPickGames: 0, cavPickWins: 0 };
  const flank = { games: 0, wins: 0, archerPickGames: 0, archerPickWins: 0, cavPickGames: 0, cavPickWins: 0 };
  const sizes = { '2v2': { games: 0, wins: 0 }, '3v3': { games: 0, wins: 0 }, '4v4': { games: 0, wins: 0 } };
  const carry = { games: 0, wins: 0 };
  const anchor = { games: 0, wins: 0 };
  let totalTg = 0;

  for (const m of list) {
    if (typeof m.won !== 'boolean') continue;
    const players = Array.isArray(m.players) ? m.players : (Array.isArray(m.rawMatch?.players) ? m.rawMatch.players : []);
    if (players.length < 4) continue;
    const me = m.selfPlayer || (pid ? players.find((p) => Number(p.profileId) === pid) : null) || null;
    if (!me || me.team == null) continue;
    const ownTeam = players.filter((p) => Number(p.team) === Number(me.team));
    const oppTeam = players.filter((p) => Number(p.team) !== Number(me.team));
    if (ownTeam.length < 2 || oppTeam.length < 2) continue;
    totalTg += 1;

    const szKey = ownTeam.length === 2 ? '2v2' : ownTeam.length === 3 ? '3v3' : ownTeam.length === 4 ? '4v4' : null;
    if (szKey && sizes[szKey]) {
      sizes[szKey].games += 1;
      if (m.won) sizes[szKey].wins += 1;
    }

    // Pocket vs Flank oficial por colores (Team Positions en 3v3/4v4; excluye mapas nómadas como African Clearing / Nomad)
    const isNomadStart = isNomadStartMap(m.mapKey || m.mapName);
    if (ownTeam.length >= 3 && !isNomadStart) {
      const colors = ownTeam.map((p) => Number(p.color)).filter((c) => Number.isFinite(c) && c >= 1 && c <= 8);
      const uniqueColors = new Set(colors);
      const myColor = Number(me.color);
      if (uniqueColors.size >= 3 && Number.isFinite(myColor) && myColor >= 1 && myColor <= 8) {
        const minC = Math.min(...colors);
        const maxC = Math.max(...colors);
        const target = (myColor === minC || myColor === maxC) ? flank : pocket;
        target.games += 1;
        if (m.won) target.wins += 1;
        const bucket = civRoleBucket(me.civ || m.myCiv);
        if (bucket?.id === 'ranged') {
          target.archerPickGames += 1;
          if (m.won) target.archerPickWins += 1;
        } else if (bucket?.id === 'cavalry') {
          target.cavPickGames += 1;
          if (m.won) target.cavPickWins += 1;
        }
      }
    }

    // Capitán (Carry) vs Ancla del equipo según ELO
    const ownRatings = ownTeam.map((p) => ({ pid: Number(p.profileId), elo: Number(p.matchRating ?? p.rating) }))
      .filter((x) => Number.isFinite(x.elo) && x.elo > 100);
    const myElo = Number(me.matchRating ?? me.rating ?? m.myRating);
    if (ownRatings.length >= 2 && Number.isFinite(myElo) && myElo > 100) {
      const maxElo = Math.max(...ownRatings.map((x) => x.elo));
      const minElo = Math.min(...ownRatings.map((x) => x.elo));
      if (maxElo - minElo >= 25) {
        if (myElo >= maxElo) {
          carry.games += 1;
          if (m.won) carry.wins += 1;
        } else if (myElo <= minElo) {
          anchor.games += 1;
          if (m.won) anchor.wins += 1;
        }
      }
    }
  }

  const tgPol = SAMPLE_POLICY.tgRadiography;
  if (totalTg < tgPol.minTotalTg) return null;
  const summarize = (o, minN = 1) => (o.games >= minN ? { games: o.games, wins: o.wins, losses: o.games - o.wins, winRate: pct(o.wins, o.games) } : null);
  const sizeRows = Object.entries(sizes)
    .filter(([, v]) => v.games >= tgPol.minTeamSize)
    .map(([label, v]) => ({ label, games: v.games, wins: v.wins, losses: v.games - v.wins, winRate: pct(v.wins, v.games) }));

  let roleTip = null;
  let roleTipI18n = null;
  if (pocket.archerPickGames >= 4 && pct(pocket.archerPickWins, pocket.archerPickGames) <= 45) {
    const aWr = pct(pocket.archerPickWins, pocket.archerPickGames);
    roleTip = `En Pocket jugaste civs de Arqueros ${pocket.archerPickGames} veces (${aWr}% WR): priorizá Caballería o Boom.`;
    roleTipI18n = ['cxe.tgArcherPocket', { n: pocket.archerPickGames, wr: aWr }];
  } else if (pocket.games >= tgPol.minRole && flank.games >= tgPol.minRole) {
    const pWr = pct(pocket.wins, pocket.games);
    const fWr = pct(flank.wins, flank.games);
    if (pWr >= fWr + 8) {
      roleTip = `Rendís mucho mejor como Pocket (${pWr}% WR) que como Flank (${fWr}% WR).`;
      roleTipI18n = ['cxe.tgPocketBetter', { pWr, fWr }];
    } else if (fWr >= pWr + 8) {
      roleTip = `Marcás más diferencia como Flank (${fWr}% WR) que como Pocket (${pWr}% WR).`;
      roleTipI18n = ['cxe.tgFlankBetter', { fWr, pWr }];
    }
  }

  return {
    sample: totalTg,
    pocket: summarize(pocket, tgPol.minRole),
    flank: summarize(flank, tgPol.minRole),
    sizes: sizeRows,
    carry: summarize(carry, tgPol.minCarryAnchor),
    anchor: summarize(anchor, tgPol.minCarryAnchor),
    roleTip,
    roleTipI18n,
    positionNote: 'Posición por color en mapas estándar 3v3/4v4 (excluye inicios nómadas)',
  };
}

/* ==================== 11. Tu Color de la Suerte & Maldición de Color ==================== */
function computeLuckyColor(modeMatches, { profileId = null, modeId = 'global' } = {}) {
  const list = Array.isArray(modeMatches) ? modeMatches : [];
  const pid = profileId != null ? Number(profileId) : null;
  const byColor = new Map();
  let total = 0;
  let totalWins = 0;

  for (const m of list) {
    if (typeof m.won !== 'boolean') continue;
    const players = Array.isArray(m.players) ? m.players : (Array.isArray(m.rawMatch?.players) ? m.rawMatch.players : []);
    const me = m.selfPlayer || (pid ? players.find((p) => Number(p.profileId) === pid) : null) || null;
    const col = Number(me?.color ?? m.myColor);
    const meta = AOE_COLORS[col];
    if (!meta) continue;
    total += 1;
    if (m.won) totalWins += 1;
    const cur = byColor.get(col) || { ...meta, games: 0, wins: 0 };
    cur.games += 1;
    if (m.won) cur.wins += 1;
    byColor.set(col, cur);
  }
  const colPol = SAMPLE_POLICY.luckyColor;
  if (total < colPol.minTotal || byColor.size < 2) return null;

  const overallWr = pct(totalWins, total) ?? 50;
  const colors = [...byColor.values()]
    .map((c) => ({ ...c, losses: c.games - c.wins, winRate: pct(c.wins, c.games) }))
    .filter((c) => c.games >= colPol.minRowVisible)
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  if (!colors.length) return null;

  const eligible = colors.filter((c) => c.games >= colPol.minCrown);
  const lucky = eligible.length ? [...eligible].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0] : null;
  const cursedRaw = eligible.length >= 2 ? [...eligible].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0] : null;
  const cursed = (cursedRaw && lucky && cursedRaw.id !== lucky.id
    && cursedRaw.winRate < 48
    && (overallWr - cursedRaw.winRate) >= colPol.cursedMinDeltaPp)
    ? cursedRaw
    : null;

  return {
    sample: total,
    sampleLabel: modeId === 'global' ? `${total} partidas recientes` : `${total} partidas`,
    favorite: colors[0],
    lucky: lucky && lucky.winRate >= Math.max(52, overallWr + 4) ? lucky : null,
    cursed,
    colors: colors.slice(0, 6),
  };
}

/* ==================== 12. El Espejo (Mirrors) & Cazador de Meta ==================== */
function computeMirrorAndMeta(unifiedMatches) {
  const list = (Array.isArray(unifiedMatches) ? unifiedMatches : []).filter((m) => typeof m.won === 'boolean' && m.civSlug);
  if (list.length < 8) return null;

  const mirror = { games: 0, wins: 0 };
  const vsMeta = { games: 0, wins: 0 };
  const vsOffMeta = { games: 0, wins: 0 };

  for (const m of list) {
    const oppSlugs = (Array.isArray(m.opponents) && m.opponents.length)
      ? m.opponents.map((o) => o?.civSlug || (o?.civ ? civSlug(o.civ) : null)).filter(Boolean)
      : (m.oppCivSlug ? [m.oppCivSlug] : []);
    if (!oppSlugs.length) continue;

    if (oppSlugs.includes(m.civSlug)) {
      mirror.games += 1;
      if (m.won) mirror.wins += 1;
    }
    const metaCount = oppSlugs.filter((s) => TOP_META_CIV_SLUGS.has(s)).length;
    const isMetaMatch = oppSlugs.length === 1 ? metaCount === 1 : (metaCount / oppSlugs.length) >= 0.5;
    if (isMetaMatch) {
      vsMeta.games += 1;
      if (m.won) vsMeta.wins += 1;
    } else {
      vsOffMeta.games += 1;
      if (m.won) vsOffMeta.wins += 1;
    }
  }

  const mirrorRes = mirror.games >= 3 ? { games: mirror.games, wins: mirror.wins, losses: mirror.games - mirror.wins, winRate: pct(mirror.wins, mirror.games) } : null;
  const metaRes = vsMeta.games >= 5 ? { games: vsMeta.games, wins: vsMeta.wins, losses: vsMeta.games - vsMeta.wins, winRate: pct(vsMeta.wins, vsMeta.games) } : null;
  const offMetaRes = vsOffMeta.games >= 5 ? { games: vsOffMeta.games, wins: vsOffMeta.wins, losses: vsOffMeta.games - vsOffMeta.wins, winRate: pct(vsOffMeta.wins, vsOffMeta.games) } : null;
  if (!mirrorRes && !metaRes) return null;

  let metaTag = 'Equilibrado vs Meta';
  if (metaRes && offMetaRes) {
    if (metaRes.winRate >= offMetaRes.winRate + 8 && metaRes.winRate >= 54) metaTag = 'Cazador de Meta';
    else if (offMetaRes.winRate >= metaRes.winRate + 8 && metaRes.winRate < 50) metaTag = 'Sufre contra el Meta';
    else if (metaRes.winRate >= 58) metaTag = 'Domina el Meta';
  }
  return { mirror: mirrorRes, vsMeta: metaRes, vsOffMeta: offMetaRes, metaTag };
}

/* ==================== 13. GG Temprano vs Guerrero + Anti-Rush vs Asesino de Boomers ==================== */
function computeResignAndStyleProfile(unifiedMatches, { isTeam = false } = {}) {
  const valid = (Array.isArray(unifiedMatches) ? unifiedMatches : []).filter((m) =>
    typeof m.won === 'boolean' && Number.isFinite(Number(m.durationGameSec)) && Number(m.durationGameSec) >= 300 && Number(m.durationGameSec) <= 6 * 3600
  );
  if (valid.length < 8) return null;

  const losses = valid.filter((m) => m.won === false);
  const earlyCut = isTeam ? 28 : 22;
  const lateCut = isTeam ? 55 : 48;
  const lossMins = losses.map((m) => Number(m.durationGameSec) / 60);
  const earlyLossPct = losses.length >= 4 ? pct(lossMins.filter((x) => x < earlyCut).length, losses.length) : null;
  const marathonLossPct = losses.length >= 4 ? pct(lossMins.filter((x) => x >= lateCut).length, losses.length) : null;
  const medianLossMin = losses.length >= 4 ? median(lossMins, 0) : null;

  let resignTag = null;
  let resignSub = null;
  let resignSubI18n = null;
  if (losses.length >= 4) {
    if (earlyLossPct >= 35) {
      resignTag = 'GG Rápido';
      resignSub = `${earlyLossPct}% de tus derrotas terminan antes del min ${earlyCut} (reloj de juego).`;
      resignSubI18n = ['cxe.resignFastSub', { pct: earlyLossPct, cut: earlyCut }];
    } else if (medianLossMin >= lateCut || marathonLossPct >= 38) {
      resignTag = 'Hasta el Último Aldeano';
      resignSub = `Tus derrotas promedian ${medianLossMin} min (reloj de juego) — nunca regalás el GG.`;
      resignSubI18n = ['cxe.resignWarriorSub', { min: medianLossMin }];
    } else {
      resignTag = 'Rendición Pragmática';
      resignSub = `Mediana en derrotas: ${medianLossMin} min (reloj de juego).`;
      resignSubI18n = ['cxe.resignPragmaticSub', { min: medianLossMin }];
    }
  }

  // Cruce contra Rushes vs Boomers (en TG clasifica por mayoría rival para evitar doble conteo)
  const vsRush = { games: 0, wins: 0 };
  const vsBoom = { games: 0, wins: 0 };
  for (const m of valid) {
    const ops = (Array.isArray(m.opponents) && m.opponents.length)
      ? m.opponents.map((o) => o?.oppOpening || o?.oppStrategy).filter(Boolean)
      : (m.oppOpening ? [m.oppOpening] : []);
    if (!ops.length) continue;
    const rushCount = ops.filter((o) => /scout|archer|man at arms|m@a|drush|tower|hoang/i.test(String(o)) && !/fast castle/i.test(String(o))).length;
    const boomCount = ops.filter((o) => /fast castle|fc boom|2tc/i.test(String(o))).length;
    if (rushCount > boomCount && rushCount > 0) {
      vsRush.games += 1;
      if (m.won) vsRush.wins += 1;
    } else if (boomCount > rushCount && boomCount > 0) {
      vsBoom.games += 1;
      if (m.won) vsBoom.wins += 1;
    }
  }

  const rushRes = vsRush.games >= 4 ? { games: vsRush.games, wins: vsRush.wins, losses: vsRush.games - vsRush.wins, winRate: pct(vsRush.wins, vsRush.games) } : null;
  const boomRes = vsBoom.games >= 4 ? { games: vsBoom.games, wins: vsBoom.wins, losses: vsBoom.games - vsBoom.wins, winRate: pct(vsBoom.wins, vsBoom.games) } : null;

  let hunterTag = null;
  if (boomRes && boomRes.winRate >= 62 && (!rushRes || boomRes.winRate >= rushRes.winRate + 6)) hunterTag = 'Asesino de Boomers';
  else if (rushRes && rushRes.winRate >= 62 && (!boomRes || rushRes.winRate >= boomRes.winRate + 6)) hunterTag = 'Muro Anti-Rush';
  else if (rushRes && rushRes.winRate <= 42) hunterTag = 'Vulnerable al Rush';
  else if (boomRes && boomRes.winRate <= 42) hunterTag = 'Cede ante Boomers';

  if (!resignTag && !hunterTag) return null;
  return {
    resignTag,
    resignSub,
    resignSubI18n,
    medianLossMin,
    earlyLossPct,
    hunterTag,
    vsRush: rushRes,
    vsBoom: boomRes,
  };
}

/* ==================== 14. Resaca Post-Maratón & Karma de las Revanchas ==================== */
function computeMarathonAndRematch(modeMatches, unifiedMatches, { profileId = null } = {}) {
  const pid = profileId != null ? Number(profileId) : null;
  // Usar SIEMPRE partidas contiguas de Companion (`modeMatches`) para medir partidas consecutivas reales (nunca Insights dispersos)
  const gameClockMinOf = (m) => {
    if (Number.isFinite(Number(m.durationGameSec)) && Number(m.durationGameSec) > 0) return Number(m.durationGameSec) / 60;
    const raw = Number(m.durationSeconds);
    if (Number.isFinite(raw) && raw >= 180 && raw < 6 * 3600) return (Math.max(0, raw - 40) * 1.7) / 60;
    return null;
  };
  const baseContiguous = (Array.isArray(modeMatches) && modeMatches.length >= 6) ? modeMatches : unifiedMatches;
  const timed = (Array.isArray(baseContiguous) ? baseContiguous : [])
    .map((m) => ({ m, gMin: gameClockMinOf(m) }))
    .filter(({ m, gMin }) => typeof m.won === 'boolean' && Number.isFinite(Number(m.startedAt)) && Number(m.startedAt) > 0 && Number.isFinite(gMin))
    .sort((a, b) => Number(a.m.startedAt) - Number(b.m.startedAt));

  const afterMarathon = { games: 0, wins: 0 };
  const afterQuick = { games: 0, wins: 0 };
  for (let i = 1; i < timed.length; i += 1) {
    const prev = timed[i - 1];
    const cur = timed[i];
    if (Number(cur.m.startedAt) - Number(prev.m.startedAt) > SESSION_GAP_MS) continue;
    const prevMin = prev.gMin;
    if (prevMin >= 45) {
      afterMarathon.games += 1;
      if (cur.m.won) afterMarathon.wins += 1;
    } else if (prevMin >= 8 && prevMin < 26) {
      afterQuick.games += 1;
      if (cur.m.won) afterQuick.wins += 1;
    }
  }

  // Karma de Revanchas (mismo rival en menos de 24h en partidas ordenadas)
  const compSorted = (Array.isArray(modeMatches) ? modeMatches : [])
    .filter((m) => typeof m.won === 'boolean' && Number.isFinite(Number(m.startedAt)) && Number(m.startedAt) > 0)
    .sort((a, b) => Number(a.startedAt) - Number(b.startedAt));
  const rematch = { games: 0, wins: 0, revengeGames: 0, revengeWins: 0 };
  const lastSeenOpp = new Map();
  for (const m of compSorted) {
    const players = Array.isArray(m.players) ? m.players : (Array.isArray(m.rawMatch?.players) ? m.rawMatch.players : []);
    const me = m.selfPlayer || (pid ? players.find((p) => Number(p.profileId) === pid) : null) || null;
    const oppIds = players.length && me?.team != null
      ? players.filter((p) => Number(p.team) !== Number(me.team)).map((p) => Number(p.profileId)).filter((x) => Number.isFinite(x) && x > 0)
      : (m.rivalProfileId ? [Number(m.rivalProfileId)] : []);
    let matchedPrev = null;
    for (const oid of oppIds) {
      const prev = lastSeenOpp.get(oid);
      if (prev && Number(m.startedAt) - prev.ts <= 24 * 3600_000) {
        matchedPrev = prev;
        break;
      }
    }
    if (matchedPrev) {
      rematch.games += 1;
      if (m.won) rematch.wins += 1;
      if (matchedPrev.won === false) {
        rematch.revengeGames += 1;
        if (m.won) rematch.revengeWins += 1;
      }
    }
    for (const oid of oppIds) lastSeenOpp.set(oid, { ts: Number(m.startedAt), won: m.won });
  }

  const marathonRes = afterMarathon.games >= 4
    ? { games: afterMarathon.games, wins: afterMarathon.wins, losses: afterMarathon.games - afterMarathon.wins, winRate: pct(afterMarathon.wins, afterMarathon.games) }
    : null;
  const quickRes = afterQuick.games >= 4
    ? { games: afterQuick.games, wins: afterQuick.wins, losses: afterQuick.games - afterQuick.wins, winRate: pct(afterQuick.wins, afterQuick.games) }
    : null;
  const rematchRes = rematch.games >= 3
    ? {
        games: rematch.games,
        wins: rematch.wins,
        losses: rematch.games - rematch.wins,
        winRate: pct(rematch.wins, rematch.games),
        revengeGames: rematch.revengeGames,
        revengeWins: rematch.revengeWins,
        revengeWinRate: rematch.revengeGames >= 2 ? pct(rematch.revengeWins, rematch.revengeGames) : null,
      }
    : null;
  if (!marathonRes && !rematchRes) return null;
  return { afterMarathon: marathonRes, afterQuick: quickRes, rematch: rematchRes };
}

/* ==================== 15. Tus Relojes de Victoria vs Derrota (Replays locales) ==================== */
function computeWinLossClocks(storedRecords, { modeId = 'global', profileId = null, isOwnProfile = true } = {}) {
  if (!isOwnProfile || !Array.isArray(storedRecords) || !storedRecords.length) return null;
  const pid = profileId != null ? String(profileId) : null;
  const isEmpireWars = modeId === 'ew_1v1' || modeId === 'ew_team';
  const validAll = storedRecords.filter((r) => {
    if (!r || (pid && r.profileId != null && String(r.profileId) !== pid)) return false;
    const eng = r.telemetry?.engineSummary || r.telemetry?.engine;
    if (!eng || !eng.self || !eng.self.timings) return false;
    const dur = Number(eng.durationSeconds ?? r.telemetry?.durationSeconds ?? 0);
    return dur >= 180 && typeof (r.won ?? r.match?.won) === 'boolean';
  });
  const clkPol = SAMPLE_POLICY.winLossClocks;
  const scoped = modeId !== 'global' ? validAll.filter((r) => recordMatchesMode(r, modeId)) : validAll;
  // Cero fugas entre modos: en modos específicos (RM 1v1, EW 1v1, EW Team) jamás mezclar replays de RM Team
  if (scoped.length < clkPol.minTotalReplays) return null;
  const pool = scoped;

  const isWinRec = (r) => (typeof r.won === 'boolean' ? r.won : r.match?.won === true);
  const winsPool = pool.filter(isWinRec);
  const lossPool = pool.filter((r) => !isWinRec(r));
  const isClosedMapRec = (r) => isClosedBoomMap(r?.mapName || r?.match?.mapName || r?.telemetry?.context?.mapName);
  const pull = (arr, field, excludeClosed = false) => arr
    .filter((r) => !(excludeClosed && isClosedMapRec(r)))
    .map((r) => Number((r.telemetry?.engineSummary || r.telemetry?.engine)?.self?.timings?.[field]))
    .filter((v) => Number.isFinite(v) && v > 60 && v < 5400);

  const defs = [
    ...(isEmpireWars ? [] : [{ id: 'feudal', label: 'Edad Feudal', field: 'feudalSeconds', excludeClosed: false }]),
    { id: 'firstMil', label: '1.ª Unidad Militar (abiertos)', field: 'firstMilitarySeconds', excludeClosed: true },
    { id: 'castle', label: 'Edad de los Castillos', field: 'castleSeconds', excludeClosed: false },
    { id: 'imperial', label: 'Edad Imperial', field: 'imperialSeconds', excludeClosed: false },
  ];

  const metrics = defs.map((def) => {
    const winVals = pull(winsPool, def.field, def.excludeClosed);
    const lossVals = pull(lossPool, def.field, def.excludeClosed);
    const allVals = pull(pool, def.field, def.excludeClosed);
    const hasPairedSample = winVals.length >= clkPol.minPerSideForDelta && lossVals.length >= clkPol.minPerSideForDelta;
    const winSec = winVals.length >= clkPol.minPerSideForDelta ? median(winVals, 0) : null;
    const lossSec = lossVals.length >= clkPol.minPerSideForDelta ? median(lossVals, 0) : null;
    const allSec = allVals.length >= 2 ? median(allVals, 0) : null;
    const deltaSec = hasPairedSample && winSec != null && lossSec != null ? (winSec - lossSec) : null;
    return {
      id: def.id,
      label: def.label,
      winSec,
      lossSec,
      allSec,
      deltaSec,
      winCount: winVals.length,
      lossCount: lossVals.length,
    };
  }).filter((m) => m.allSec != null);

  if (!metrics.length) return null;
  return {
    sample: pool.length,
    winsSample: winsPool.length,
    lossesSample: lossPool.length,
    isModeExact: true,
    isPreliminary: pool.length < clkPol.solidMin,
    metrics,
  };
}

/* ==================== 16. Maestría Histórica de Civ (56 civs) & Puntos Ciegos de Arsenal ==================== */
function computeCivMasteryHistory(storedRecords, { modeId = 'global', profileId = null, isOwnProfile = true } = {}) {
  if (!isOwnProfile || !Array.isArray(storedRecords) || !storedRecords.length) return null;
  const pid = profileId != null ? String(profileId) : null;
  const validAll = storedRecords.filter((r) => {
    if (!r || (pid && r.profileId != null && String(r.profileId) !== pid)) return false;
    const eng = r.telemetry?.engineSummary || r.telemetry?.engine;
    const dur = Number(eng?.durationSeconds ?? r.telemetry?.durationSeconds ?? 0);
    return Boolean(eng?.self) && dur >= 180;
  });
  const cmPol = SAMPLE_POLICY.civMastery;
  const scoped = modeId !== 'global' ? validAll.filter((r) => recordMatchesMode(r, modeId)) : validAll;
  // Cero fugas entre modos: no proyectar replays de RM Team en RM 1v1 o Empire Wars
  if (scoped.length < cmPol.minTotalReplays) return null;
  const pool = scoped;

  let leveragedTotal = 0;
  let missedTotal = 0;
  let masteryGames = 0;
  const missedCounts = new Map();
  let castleReachedGames = 0;
  let siegeGames = 0;
  let monkGames = 0;
  let castleGames = 0;
  let trashUnits = 0;
  let goldUnits = 0;

  for (const r of pool) {
    const eng = r.telemetry?.engineSummary || r.telemetry?.engine;
    const self = eng.self;
    const cm = eng.civMastery;
    if (cm && (Array.isArray(cm.leveraged) || Array.isArray(cm.missed))) {
      const lev = Array.isArray(cm.leveraged) ? cm.leveraged.length : 0;
      const mis = Array.isArray(cm.missed) ? cm.missed.length : 0;
      if (lev + mis > 0) {
        masteryGames += 1;
        leveragedTotal += lev;
        missedTotal += mis;
        for (const item of (cm.missed || [])) {
          const title = String(item?.title || item?.label || item || '').trim();
          if (!title) continue;
          const cur = missedCounts.get(title) || { title, civ: r.civ || cm.civName || null, count: 0 };
          cur.count += 1;
          missedCounts.set(title, cur);
        }
      }
    }

    const ws = Array.isArray(self.topWorkshops) ? self.topWorkshops : [];
    const units = Array.isArray(self.topUnits) ? self.topUnits : [];
    const castleSec = Number(self.timings?.castleSeconds);
    const hasCastleObj = Number(self.macroBuilds?.castles || 0) > 0 || ws.some((w) => /castillo/i.test(String(w?.name || '')));
    const hasSiegeObj = ws.some((w) => SIEGE_WORKSHOP_RE.test(String(w?.name || ''))) || units.some((u) => /ariete|mangana|escorpi|ca[ñn][oó]n|lanzapiedras/i.test(String(u?.name || '')));
    const hasMonkObj = ws.some((w) => MONASTERY_RE.test(String(w?.name || ''))) || units.some((u) => /monje|misionero/i.test(String(u?.name || '')));
    const reachedCastle = (Number.isFinite(castleSec) && castleSec > 60) || hasCastleObj || hasSiegeObj || hasMonkObj;
    if (reachedCastle) {
      castleReachedGames += 1;
      if (hasSiegeObj) siegeGames += 1;
      if (hasMonkObj) monkGames += 1;
      if (hasCastleObj) castleGames += 1;
    }
    for (const u of units) {
      const cnt = Number(u?.count || 0);
      if (!Number.isFinite(cnt) || cnt <= 0) continue;
      if (TRASH_UNIT_RE.test(String(u.name || ''))) trashUnits += cnt;
      else goldUnits += cnt;
    }
  }

  const totalUnits = trashUnits + goldUnits;
  // Jamás mostrar un anillo del 100% calculado con 1 sola partida (exigir >= 3 replays con maestría evaluada)
  const utilizationPct = (masteryGames >= cmPol.minMasteryGames && (leveragedTotal + missedTotal) > 0)
    ? pct(leveragedTotal, leveragedTotal + missedTotal)
    : null;
  const topMissed = masteryGames >= cmPol.minMasteryGames
    ? [...missedCounts.values()].sort((a, b) => b.count - a.count).slice(0, 3)
    : [];
  const hasCastleDenom = castleReachedGames >= cmPol.minCastleReplaysForSiege;

  return {
    sample: pool.length,
    castleReachedGames,
    isModeExact: true,
    masteryGames,
    utilizationPct,
    topMissed,
    siegePct: hasCastleDenom ? pct(siegeGames, castleReachedGames) : null,
    monkPct: hasCastleDenom ? pct(monkGames, castleReachedGames) : null,
    castlePct: hasCastleDenom ? pct(castleGames, castleReachedGames) : null,
    goldUnitPct: totalUnits > 0 ? pct(goldUnits, totalUnits) : null,
    trashUnitPct: totalUnits > 0 ? pct(trashUnits, totalUnits) : null,
  };
}

/* ==================== 17. Zona de Confort de ELO (P20–P80) & Termómetro por Parche ==================== */
function computeEloComfortAndPatch({ fullRatingSeries = [], unifiedMatches = [], ladder = null, comfortModeLabel = null } = {}) {
  const pts = (Array.isArray(fullRatingSeries) ? fullRatingSeries : [])
    .map((p) => Number(p?.rating))
    .filter((v) => Number.isFinite(v) && v > 100);

  let comfort = null;
  if (pts.length >= 12) {
    const p20 = percentile(pts, 0.2);
    const median = percentile(pts, 0.5);
    const p80 = percentile(pts, 0.8);
    const minRating = Math.min(...pts);
    const current = Number(ladder?.rating) || pts[pts.length - 1];
    const peak = Math.max(Number(ladder?.peak) || 0, ...pts);
    let runPeak = pts[0];
    let maxDrawdown = 0;
    let runMin = pts[0];
    let maxComeback = 0;
    let totalSwing = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const v = pts[i];
      if (v > runPeak) runPeak = v;
      if (runPeak - v > maxDrawdown) maxDrawdown = runPeak - v;
      if (v < runMin) runMin = v;
      if (v - runMin > maxComeback) maxComeback = v - runMin;
      if (i > 0) totalSwing += Math.abs(v - pts[i - 1]);
    }
    const bandWidth = Math.max(0, Math.round(p80 - p20));
    const avgSwing = pts.length > 1 ? Math.round(totalSwing / (pts.length - 1)) : 0;
    const recentLookback = Math.min(10, pts.length - 1);
    const recentDelta = recentLookback > 0 ? Math.round(current - pts[pts.length - 1 - recentLookback]) : 0;
    const nextBarrier = (Math.floor(current / 100) + 1) * 100;

    let stabilityLabel = 'Estable';
    let stabilityKey = 'cxe.stabStable';
    let stabilityTone = 'gold';
    if (bandWidth <= 65) { stabilityLabel = 'Muy estable'; stabilityKey = 'cxe.stabVery'; stabilityTone = 'win'; }
    else if (bandWidth <= 120) { stabilityLabel = 'Estable'; stabilityKey = 'cxe.stabStable'; stabilityTone = 'gold'; }
    else if (bandWidth <= 185) { stabilityLabel = 'Oscilante'; stabilityKey = 'cxe.stabSwing'; stabilityTone = 'neutral'; }
    else { stabilityLabel = 'Volátil'; stabilityKey = 'cxe.stabVolatile'; stabilityTone = 'loss'; }

    let zoneStatus = 'Dentro de tu zona habitual';
    let zoneStatusI18n = ['cxe.zoneNormal', null];
    if (peak - current <= 15) {
      zoneStatus = 'En tu pico histórico';
      zoneStatusI18n = ['cxe.zonePeak', null];
    } else if (current > p80) {
      zoneStatus = `Por encima de tu techo habitual (+${Math.round(current - p80)} ELO)`;
      zoneStatusI18n = ['cxe.zoneAbove', { pts: Math.round(current - p80) }];
    } else if (current < p20) {
      zoneStatus = `Debajo de tu piso habitual (−${Math.round(p20 - current)} ELO)`;
      zoneStatusI18n = ['cxe.zoneBelow', { pts: Math.round(p20 - current) }];
    }

    comfort = {
      stabilityKey,
      zoneStatusI18n,
      sample: pts.length,
      modeLabel: comfortModeLabel || null,
      minRating: Math.round(minRating),
      p20: Math.round(p20),
      median: Math.round(median),
      p80: Math.round(p80),
      bandWidth,
      avgSwing,
      recentDelta,
      recentLookback,
      stabilityLabel,
      stabilityTone,
      zoneStatus,
      current: Math.round(current),
      peak: Math.round(peak),
      distToPeak: Math.max(0, Math.round(peak - current)),
      nextBarrier,
      distToBarrier: Math.max(1, Math.round(nextBarrier - current)),
      maxDrawdown: Math.round(maxDrawdown),
      maxComeback: Math.round(maxComeback),
    };
  }

  const byPatch = new Map();
  for (const m of (Array.isArray(unifiedMatches) ? unifiedMatches : [])) {
    if (typeof m.won !== 'boolean' || !Number.isFinite(Number(m.patch)) || Number(m.patch) <= 0) continue;
    const pId = String(m.patch);
    const cur = byPatch.get(pId) || { patch: Number(m.patch), games: 0, wins: 0, civs: new Map(), civWins: new Map(), eloNet: 0, hasElo: false };
    cur.games += 1;
    if (m.won) cur.wins += 1;
    if (m.civ) {
      cur.civs.set(m.civ, (cur.civs.get(m.civ) || 0) + 1);
      if (m.won) cur.civWins.set(m.civ, (cur.civWins.get(m.civ) || 0) + 1);
    }
    const diff = Number(m.ratingDiff ?? m.eloChange);
    if (Number.isFinite(diff) && Math.abs(diff) <= 100) {
      cur.eloNet += diff;
      cur.hasElo = true;
    }
    byPatch.set(pId, cur);
  }
  const rawPatches = [...byPatch.values()]
    .filter((p) => p.games >= 4)
    .sort((a, b) => b.patch - a.patch)
    .slice(0, 5);

  const patches = rawPatches.map((p, idx) => {
    const topEntry = [...p.civs.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const topCiv = topEntry ? topEntry[0] : null;
    const topCivGames = topEntry ? topEntry[1] : 0;
    const topCivWr = topCiv && topCivGames > 0 ? pct(p.civWins.get(topCiv) || 0, topCivGames) : null;
    const winRate = pct(p.wins, p.games);
    const prev = rawPatches[idx + 1] || null;
    const prevWr = prev ? pct(prev.wins, prev.games) : null;
    return {
      patch: p.patch,
      isLatest: idx === 0,
      games: p.games,
      wins: p.wins,
      losses: p.games - p.wins,
      winRate,
      deltaVsPrev: prevWr != null ? (winRate - prevWr) : null,
      eloNet: p.hasElo ? Math.round(p.eloNet) : null,
      topCiv,
      topCivWr,
    };
  });

  if (patches.length >= 2) {
    let bestIdx = 0;
    for (let i = 1; i < patches.length; i += 1) {
      if (patches[i].winRate > patches[bestIdx].winRate) bestIdx = i;
    }
    if (patches[bestIdx].winRate >= 52) patches[bestIdx].isBest = true;
  }

  if (!comfort && !patches.length) return null;
  return { comfort, patches, patchesSource: patches.length ? 'insights' : null };
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
  fullRatingSeries = null,
  comfortModeLabel = null,
  modeEloSeriesMap = null,
  modeMatches = [],
  unifiedMatches = [],
  insightsMatches = null,
  storedRecords = [],
} = {}) {
  const insightsPool = Array.isArray(insightsMatches) && insightsMatches.length ? insightsMatches : unifiedMatches;
  const goldenHour = computeGoldenHour(eloSeries);
  const trident = computeTrident({ stats, unifiedMatches, ladder, isTeam });
  const giantSlayer = computeGiantSlayer(modeMatches, { isTeam, profileId });
  const speedVsBrain = computeSpeedVsBrain(insightsPool);
  const killerWindow = computeKillerWindow(unifiedMatches, { isTeam });
  const combatDna = computeCombatDna(storedRecords, { modeId, profileId, isOwnProfile });
  const squadAndRivals = computeSquadAndRivals(stats);
  const trophies = computeTrophies({ eloSeries, modeEloSeriesMap, unifiedMatches, stats, ladder });
  const dna = computePlayerDna({ modeId, stats, insights, killerWindow, giantSlayer, combatDna, speedVsBrain, trophies });

  // 8 insights competitivos y curiosos (0 API extra; sobre pool oficial sin sesgo)
  const tgRadiography = (isTeam || modeId === 'global') ? computeTgRadiography(modeMatches, { profileId }) : null;
  const luckyColor = computeLuckyColor(modeMatches, { profileId, modeId });
  const mirrorAndMeta = computeMirrorAndMeta(unifiedMatches);
  const resignProfile = computeResignAndStyleProfile(unifiedMatches, { isTeam });
  const marathonAndRematch = computeMarathonAndRematch(modeMatches, unifiedMatches, { profileId });
  const winLossClocks = computeWinLossClocks(storedRecords, { modeId, profileId, isOwnProfile });
  const civMasteryHistory = computeCivMasteryHistory(storedRecords, { modeId, profileId, isOwnProfile });
  const eloComfortAndPatch = computeEloComfortAndPatch({
    fullRatingSeries: Array.isArray(fullRatingSeries) && fullRatingSeries.length ? fullRatingSeries : eloSeries,
    unifiedMatches: insightsPool,
    ladder,
    comfortModeLabel,
  });

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
    tgRadiography,
    luckyColor,
    mirrorAndMeta,
    resignProfile,
    marathonAndRematch,
    winLossClocks,
    civMasteryHistory,
    eloComfortAndPatch,
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
  computeTgRadiography,
  computeLuckyColor,
  computeMirrorAndMeta,
  computeResignAndStyleProfile,
  computeMarathonAndRematch,
  computeWinLossClocks,
  computeCivMasteryHistory,
  computeEloComfortAndPatch,
};
