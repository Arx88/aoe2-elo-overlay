'use strict';

/**
 * Relic · Motor v3 Causal y 100% Determinista de Hoja de Ruta al Próximo ELO (`src/elo-roadmap.js`)
 *
 * Reglas de ingeniería y rigor científico:
 *   1. Cero métricas simuladas viciadas: solo usa señales 100% deterministas del `.aoe2record` y de la API oficial
 *      que concuerdan con AoE2Insights / avisos del motor (llegadas oficiales de edad, cota física exacta en Alta Edad,
 *      silencio real de órdenes al TC antes de Castillos con causa combate/eco, timestamps u olvido total de mejoras
 *      económicas y de Herrería, desbalance real en Mercado, eAPM debounced, micro Attack-Move/Patrol, Campana Urbana
 *      y resultados reales de ladder RM 1v1 en reloj 1.7×).
 *   2. Cero contaminación entre modos: jamás mezcla replays de Team Games ni de Empire Wars dentro de RM 1v1.
 *   3. Cero sesgo de censura ni causalidad inversa:
 *      - Olvidar por completo Hacha o Sierra en una partida larga penaliza en lugar de omitirse como `undefined`.
 *      - Partidas sin bache de TC (>= 20 s) cuentan como limpias en la mediana, nunca se descartan.
 *      - `wl_collapse` solo aplica en métricas causales previas al desenlace y exige que las derrotas incumplan la meta.
 *   4. Cero falsos positivos de sesión: `cold_start` y `session_fatigue` exigen WR <= 45% y saldo neto negativo de ELO.
 */

const crypto = require('node:crypto');

let BUNDLED_SEED = null;
let LIVE_BENCHMARKS = null;
function loadBundledSeed() {
  if (BUNDLED_SEED) return BUNDLED_SEED;
  try {
    BUNDLED_SEED = require('./elo-bracket-benchmarks.json');
  } catch {
    BUNDLED_SEED = { brackets: {}, totalSamples: 0 };
  }
  return BUNDLED_SEED;
}

function setLiveBracketBenchmarks(data) {
  if (data && typeof data === 'object' && data.brackets && typeof data.brackets === 'object') {
    LIVE_BENCHMARKS = data;
  }
}

function getLiveBracketBenchmarks() {
  return LIVE_BENCHMARKS;
}

const OPEN_MAPS = [
  'arabia', 'runestones', 'atacama', 'serengeti', 'valley', 'acropolis',
  'gold rush', 'golden pit', 'land madness', 'habitable', 'lipany', 'lowland',
  'kilimanjaro', 'cenotes', 'savannah', 'ghost lake', 'mountain range', 'aftermath', 'dry arabia',
];
const CLOSED_MAPS = [
  'arena', 'fortress', 'hideout', 'black forest', 'enclosed', 'hill fort',
  'glade', 'oasis', 'lombardia', 'amazon tunnel', 'michi', 'walled', 'citadel',
];
const EXCLUDED_MAPS = [
  'nomad', 'african clearing', 'steppe', 'budapest', 'socotra', 'megarandom',
  'islands', 'four lakes', 'cross', 'baltic', 'mediterranean', 'continental',
  'coastal', 'archipelago', 'migration', 'rivers', 'golden swamp', 'nile delta',
];

function classifyRoadmapMap(rawName) {
  const m = String(rawName || '').toLowerCase().trim();
  if (!m) return null;
  for (const ex of EXCLUDED_MAPS) if (m.includes(ex)) return null;
  for (const cl of CLOSED_MAPS) if (m === cl || m.includes(cl)) return 'closed';
  for (const op of OPEN_MAPS) if (m === op || m.includes(op)) return 'open';
  return null;
}

function clampBucket(elo) {
  const n = Number(elo);
  if (!Number.isFinite(n)) return 1000;
  const b = Math.floor(n / 100) * 100;
  if (b < 800) return 800;
  if (b > 2000) return 2000;
  return b;
}

function percentileOf(nums, p = 0.5) {
  const arr = nums.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = (arr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const val = lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  return Math.round(val * 10) / 10;
}

function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const ICONS = Object.freeze({
  dimOpening: 'assets/icons/ages/feudal.png',
  dimCastle: 'assets/icons/ages/castle.png',
  dimCombat: 'assets/icons/postmatch/combat.webp',
  dimClosing: 'assets/icons/ages/imperial.png',
  tc: 'assets/icons/aoe2/b_28.png',
  villager: 'assets/icons/aoe2/u_15.png',
  feudal: 'assets/icons/ages/feudal.png',
  castle: 'assets/icons/ages/castle.png',
  imperial: 'assets/icons/ages/imperial.png',
  dba: 'assets/icons/aoe2/t_70.png',
  bowSaw: 'assets/icons/aoe2/t_71.png',
  wheelbarrow: 'assets/icons/aoe2/t_79.png',
  market: 'assets/icons/aoe2/b_16.png',
  blacksmith: 'assets/icons/aoe2/b_4.png',
  tempo: 'assets/icons/postmatch/tempo.webp',
  combat: 'assets/icons/postmatch/combat.webp',
  activity: 'assets/icons/postmatch/activity.webp',
  trophy: 'assets/icons/trophy.png',
  shield: 'assets/icons/shield.png',
});

/**
 * Extrae métricas deterministas de un jugador desde `engineSummary.self` / `rival`.
 * - `includeCensored`: para diagnóstico personal imputa olvidos totales (ej. 0 Sierra en Castillos largo)
 *   y partidas limpias sin bache de TC (`biggestTcGap == null` -> 14 s), evitando sesgo de supervivencia.
 * - Para telemetría comunitaria D1 (`includeCensored = false`), mantiene el contrato exacto del esquema v2.
 */
function extractNodeMetrics(node, fallbackTelemetry = null, { includeCensored = false, mapClass = null, civSlug = '' } = {}) {
  if (!node || typeof node !== 'object') return null;
  const tp = node.techProfile || null;
  const out = {};
  const durSec = Number(fallbackTelemetry?.durationSeconds || fallbackTelemetry?.engineSummary?.durationSeconds || 0);
  const civNorm = String(civSlug || fallbackTelemetry?.context?.civ || '').toLowerCase();

  if (Number.isFinite(node.tcIdleDarkSeconds) && node.tcIdleDarkSeconds >= 0 && node.tcIdleDarkSeconds <= 240) {
    out.tcIdleDarkSec = Math.round(node.tcIdleDarkSeconds * 10) / 10;
  }

  const feudRaw = Number.isFinite(node.timings?.feudalSeconds) ? node.timings.feudalSeconds : fallbackTelemetry?.metrics?.feudalSeconds?.value;
  if (Number.isFinite(feudRaw) && feudRaw >= 420 && feudRaw <= 1500) {
    out.feudalSec = Math.round(feudRaw);
  }
  const castRaw = Number.isFinite(node.timings?.castleSeconds) ? node.timings.castleSeconds : fallbackTelemetry?.metrics?.castleSeconds?.value;
  if (Number.isFinite(castRaw) && castRaw >= 720 && castRaw <= 2700) {
    out.castleSec = Math.round(castRaw);
  }

  // Silencio real de órdenes al TC antes de Castillos (inmune al spam rechazado y a agonía pre-GG)
  if (Number.isFinite(node.biggestTcGap?.durationSec) && node.biggestTcGap.durationSec >= 0 && node.biggestTcGap.durationSec <= 600) {
    out.biggestTcGapSec = Math.round(node.biggestTcGap.durationSec);
    if (includeCensored) {
      out.biggestTcGapCause = node.biggestTcGap.cause || 'quiet';
      out.biggestTcGapAge = node.biggestTcGap.age || 'Feudal';
    }
  } else if (includeCensored && out.feudalSec != null && durSec >= 12 * 60) {
    // Partida sin ningún parón >= 20 s: debe contar como ejecución limpia en la mediana
    out.biggestTcGapSec = 14;
    out.biggestTcGapCause = 'none';
  }

  const fIdle = Number.isFinite(node.tcIdleFeudalPerTcSeconds)
    ? node.tcIdleFeudalPerTcSeconds
    : node.tcIdleFeudalSeconds;
  if (Number.isFinite(fIdle) && fIdle >= 0 && fIdle <= 900) {
    // Solo usar tcIdleFeudal en diagnóstico personal si llegó a Castillos (evita agonía al morir en Feudal)
    if (!includeCensored || out.castleSec != null) {
      out.tcIdleFeudalSec = Math.round(fIdle * 10) / 10;
    }
  }

  if (!includeCensored && Number.isFinite(node.tcUtilizationTotal) && node.tcUtilizationTotal >= 10 && node.tcUtilizationTotal <= 100) {
    out.tcUtilTotalPct = Math.round(node.tcUtilizationTotal * 10) / 10;
  }

  // Hacha de doble filo: en diagnóstico personal excluir mapas cerrados (donde FC retrasa Hacha adrede) e imputar olvidos
  const skipDbaForClosedFc = includeCensored && mapClass === 'closed';
  const freeWoodCiv = civNorm.includes('burm') || civNorm.includes('birman');
  if (!skipDbaForClosedFc && !freeWoodCiv) {
    if (tp && tp.hasDoubleBitAxe && Number.isFinite(tp.doubleBitAxeDelaySec) && tp.doubleBitAxeDelaySec <= 600) {
      out.dbaDelaySec = Math.max(0, Math.round(tp.doubleBitAxeDelaySec));
      if (includeCensored) out.dbaForgotten = false;
    } else if (includeCensored && tp && !tp.hasDoubleBitAxe && out.feudalSec != null && (durSec - out.feudalSec) >= 240) {
      out.dbaDelaySec = 360;
      out.dbaForgotten = true;
    }
  }

  // Sierra de arco: evaluar cuando jugó >= 4.5 min de Castillos; imputar olvidos totales o atrasos > 8 min
  const castlePlaySec = out.castleSec != null && durSec > out.castleSec ? (durSec - out.castleSec) : 0;
  if (!freeWoodCiv) {
    if (tp && tp.hasBowSaw && Number.isFinite(tp.bowSawDelaySec) && tp.bowSawDelaySec >= 0 && tp.bowSawDelaySec <= 700) {
      out.bowSawDelaySec = includeCensored ? Math.min(480, Math.round(tp.bowSawDelaySec)) : Math.round(tp.bowSawDelaySec);
      if (includeCensored) out.bowSawForgotten = tp.bowSawDelaySec >= 300;
    } else if (includeCensored && tp && out.castleSec != null && castlePlaySec >= 270) {
      // Olvidó Sierra de Arco toda la partida o la metió > 11 min tarde
      out.bowSawDelaySec = 480;
      out.bowSawForgotten = true;
    }
  }

  const eapmRaw = Number.isFinite(node.eapm) ? node.eapm : fallbackTelemetry?.metrics?.eapm?.value;
  if (Number.isFinite(eapmRaw) && eapmRaw >= 10 && eapmRaw <= 200) {
    out.eapm = Math.round(eapmRaw * 10) / 10;
  }

  const ctrlRaw = Number.isFinite(node.controlSharePct) ? node.controlSharePct : node.combatMicro?.controlSharePct;
  if (Number.isFinite(ctrlRaw) && ctrlRaw >= 0 && ctrlRaw <= 100) {
    out.controlSharePct = Math.round(ctrlRaw * 10) / 10;
  }

  // Herrería: en diagnóstico personal exigir >= 5 min en Castillos (o partida Feudal >= 16 min) para no castigar derrotas relámpago
  if (tp?.armyRelevance && typeof tp.armyRelevance.wellEquipped === 'boolean' && tp.armyRelevance.primaryClass) {
    if (!includeCensored || (out.castleSec != null ? castlePlaySec >= 300 : durSec >= 960)) {
      out.wellEquipped = tp.armyRelevance.wellEquipped ? 1 : 0;
      if (includeCensored && tp.armyRelevance.criticalMissing?.title) {
        out.criticalMissingTitle = tp.armyRelevance.criticalMissing.title;
      }
    }
  }

  if (includeCensored) {
    const isSaracens = civNorm.includes('saracen') || civNorm.includes('sarracen');
    if (!isSaracens && out.castleSec != null) {
      out.marketWoodSold = Number(node.marketProfile?.sold?.wood || 0);
      out.marketFoodBought = Number(node.marketProfile?.bought?.food || 0);
    }
    out.townBellCount = Number(node.habits?.townBell || 0);
    const totalMoves = Number(node.habits?.move || 0) + Number(node.habits?.attackMove || 0) + Number(node.habits?.patrol || 0);
    out.totalMoveOrders = totalMoves;
  }

  return Object.keys(out).length >= 2 ? out : null;
}

/**
 * Extrae muestra anónima (self + rival) de un replay recién analizado (RM 1v1 >= 12 min).
 */
function extractBracketSampleFromRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const match = record.match || {};
  const lb = String(match.leaderboardId ?? record.leaderboardId ?? match.leaderboard ?? '').toLowerCase();
  if (lb && lb !== 'rm_1v1' && lb !== '3') return null;
  if (record.telemetry?.engineSummary?.isTeamGame) return null;
  const startAge = String(record.telemetry?.context?.startingAge || 'dark').toLowerCase();
  if (startAge !== 'dark') return null;

  const durSec = Number(record.telemetry?.durationSeconds || record.telemetry?.engineSummary?.durationSeconds || match.durationSeconds || 0);
  if (durSec < 12 * 60) return null;

  const mapClass = classifyRoadmapMap(match.mapName || record.mapName || record.telemetry?.context?.mapName);
  if (!mapClass) return null;

  const matchId = String(match.matchId || record.matchId || record.telemetry?.matchId || '').trim();
  if (!matchId) return null;

  const eng = record.telemetry?.engineSummary;
  if (!eng || !eng.self) return null;

  const selfPid = Number(record.profileId || record.telemetry?.profileId || 0);
  const allMatchPlayers = Array.isArray(match.players) ? match.players : [];
  const selfMp = allMatchPlayers.find((p) => Number(p.profileId) === selfPid) || null;
  const rivalMp = allMatchPlayers.find((p) => Number(p.profileId) > 0 && Number(p.profileId) !== selfPid) || null;

  const selfRating = Number(selfMp?.rating ?? selfMp?.matchRating ?? match.myRating ?? record.rating ?? record.myRating);
  const rivalRating = Number(rivalMp?.rating ?? rivalMp?.matchRating ?? match.rivalRating ?? record.rivalRating);

  const players = [];
  const selfMetrics = extractNodeMetrics(eng.self, record.telemetry, { includeCensored: false });
  if (selfMetrics && Number.isFinite(selfRating) && selfRating >= 750) {
    players.push({ eloBucket: clampBucket(selfRating), ...selfMetrics });
  }
  const rivalMetrics = extractNodeMetrics(eng.rival, null, { includeCensored: false });
  if (rivalMetrics && Number.isFinite(rivalRating) && rivalRating >= 750) {
    players.push({ eloBucket: clampBucket(rivalRating), ...rivalMetrics });
  }
  if (!players.length) return null;

  const matchHash = crypto.createHash('sha256').update(`relic-bm-v2:${matchId}`).digest('hex').slice(0, 32);
  return { matchHash, mapClass, players };
}

function getBlendedMetric(seedNode, liveNode, key) {
  const s = seedNode?.metrics?.[key];
  const l = liveNode?.metrics?.[key];
  const sVal = s ? Number(s.p50 ?? s.mean) : null;
  const sP75 = s && Number.isFinite(Number(s.p75)) ? Number(s.p75) : null;
  const sP25 = s && Number.isFinite(Number(s.p25)) ? Number(s.p25) : null;
  const sN = s ? Number(s.n || 0) : 0;
  const lVal = l ? Number(l.mean ?? l.p50) : null;
  const lN = l ? Number(l.n || 0) : 0;

  if (Number.isFinite(sVal) && sN > 0 && Number.isFinite(lVal) && lN > 0) {
    const blended = (sVal * sN + lVal * lN) / (sN + lN);
    return { value: Math.round(blended * 10) / 10, p25: sP25, p75: sP75, n: sN + lN };
  }
  if (Number.isFinite(sVal) && sN > 0) return { value: Math.round(sVal * 10) / 10, p25: sP25, p75: sP75, n: sN };
  if (Number.isFinite(lVal) && lN > 0) return { value: Math.round(lVal * 10) / 10, p25: null, p75: null, n: lN };
  return null;
}

const ALL_BENCH_KEYS = [
  'tcIdleDarkSec', 'tcIdleFeudalSec', 'biggestTcGapSec',
  'dbaDelaySec', 'bowSawDelaySec', 'eapm',
  'feudalSec', 'controlSharePct', 'wellEquippedPct',
];

function resolveTargetBracketMetrics(targetBucket, preferredMapClass, liveBenchmarks) {
  const seed = loadBundledSeed();
  const live = liveBenchmarks || LIVE_BENCHMARKS || null;
  const centerB = clampBucket(targetBucket);

  const pickRaw = (bucket, cls, key) => {
    const bKey = String(bucket);
    return getBlendedMetric(seed?.brackets?.[bKey]?.[cls], live?.brackets?.[bKey]?.[cls], key);
  };

  const sampleSum = (cls) => [centerB - 100, centerB, centerB + 100].reduce((acc, b) => {
    const k = String(b);
    return acc + Number(seed?.brackets?.[k]?.[cls]?.samples || 0) + Number(live?.brackets?.[k]?.[cls]?.samples || 0);
  }, 0);

  const centerClassSamples = (cls) => Number(seed?.brackets?.[String(centerB)]?.[cls]?.samples || 0)
    + Number(live?.brackets?.[String(centerB)]?.[cls]?.samples || 0);

  let activeClass = 'all';
  if (preferredMapClass === 'open' || preferredMapClass === 'closed') {
    if (centerClassSamples(preferredMapClass) >= 6 && sampleSum(preferredMapClass) >= 15) {
      activeClass = preferredMapClass;
    }
  }

  const neighborSpec = [
    { b: centerB, w: 0.55 },
    { b: centerB - 100, w: 0.225 },
    { b: centerB + 100, w: 0.225 },
  ].filter((x) => x.b >= 800 && x.b <= 2000);

  const metrics = {};
  for (const k of ALL_BENCH_KEYS) {
    const isMapSensitive = k === 'feudalSec';
    const clsForKey = (isMapSensitive && (preferredMapClass === 'open' || preferredMapClass === 'closed') && sampleSum(preferredMapClass) >= 12)
      ? preferredMapClass
      : activeClass;
    const centerPrimary = pickRaw(centerB, clsForKey, k) || (!isMapSensitive ? pickRaw(centerB, 'all', k) : null);

    if (centerPrimary && centerPrimary.n >= 80) {
      metrics[k] = centerPrimary;
      continue;
    }

    let wSum = 0; let tW = 0; let tN = 0;
    let p75Sum = 0; let p75W = 0;
    let p25Sum = 0; let p25W = 0;
    for (const nb of neighborSpec) {
      const m = pickRaw(nb.b, clsForKey, k) || (!isMapSensitive ? pickRaw(nb.b, 'all', k) : null);
      if (m && m.n > 0) {
        const effW = nb.w * Math.min(1, m.n / 10);
        wSum += m.value * effW;
        tW += effW;
        tN += m.n;
        if (Number.isFinite(m.p75)) { p75Sum += m.p75 * effW; p75W += effW; }
        if (Number.isFinite(m.p25)) { p25Sum += m.p25 * effW; p25W += effW; }
      }
    }
    if (tW > 0) {
      metrics[k] = {
        value: Math.round((wSum / tW) * 10) / 10,
        p75: p75W > 0 ? Math.round((p75Sum / p75W) * 10) / 10 : null,
        p25: p25W > 0 ? Math.round((p25Sum / p25W) * 10) / 10 : null,
        n: tN,
      };
    }
  }

  const totalSamples = Number(seed?.brackets?.[String(centerB)]?.[activeClass]?.samples || 0)
    + Number(live?.brackets?.[String(centerB)]?.[activeClass]?.samples || 0)
    || sampleSum(activeClass)
    || sampleSum('all');

  return { mapClass: activeClass, samples: totalSamples, sourceBucket: centerB, metrics };
}

function inferWonFromRecord(r) {
  if (typeof r?.won === 'boolean') return r.won;
  if (typeof r?.match?.won === 'boolean') return r.match.won;
  const pid = Number(r?.profileId || r?.telemetry?.profileId || 0);
  if (pid > 0 && Array.isArray(r?.match?.players)) {
    const selfP = r.match.players.find((p) => Number(p.profileId) === pid);
    if (typeof selfP?.won === 'boolean') return selfP.won;
  }
  return null;
}

/**
 * Convierte la brecha real respecto al objetivo en posición visual sobre el Bullet Track,
 * donde `78%` es la muesca exacta de la Meta: nunca se muestra como porcentaje textual.
 */
function computeBulletFill(userVal, targetVal, dir, worstDelta) {
  const diff = dir === 'lower' ? (userVal - targetVal) : (targetVal - userVal);
  if (diff <= 0) return 84;
  const ratio = Math.min(1, Math.max(0, diff / Math.max(1, worstDelta)));
  return Math.max(16, Math.min(73, Math.round(76 - ratio * 58)));
}

/**
 * Motor v3 Causal y 100% RM 1v1 de Hoja de Ruta al Próximo ELO.
 */
function computeNextEloRoadmap({
  currentElo,
  nextBarrier,
  profileId = null,
  storedRecords = [],
  unifiedMatches = [],
  competitiveIntel = null,
  mapDiagnostics = null,
  liveBenchmarks = null,
} = {}) {
  const cur = Number(currentElo);
  if (!Number.isFinite(cur) || cur <= 0) return null;
  const targetElo = Number(nextBarrier) || ((Math.floor(cur / 100) + 1) * 100);
  const targetBucket = clampBucket(targetElo);
  const ownPid = Number(profileId);

  // 1. Filtrado estricto 100% RM 1v1 estándar (cero Team Games, cero Empire Wars, cero AFK inicial)
  const soloOnly = (Array.isArray(storedRecords) ? storedRecords : [])
    .filter((r) => {
      if (ownPid > 0 && r?.profileId != null && Number(r.profileId) !== ownPid) return false;
      const eng = r?.telemetry?.engineSummary;
      if (!eng || !eng.self || eng.isTeamGame) return false;
      const lb = String(r?.leaderboardId ?? r?.match?.leaderboardId ?? r?.telemetry?.context?.leaderboardId ?? '').toLowerCase();
      if (lb && lb !== '3' && lb !== 'rm_1v1') return false;
      const startAge = String(r?.telemetry?.context?.startingAge || 'dark').toLowerCase();
      if (startAge !== 'dark') return false;
      const dur = Number(r?.telemetry?.durationSeconds || eng.durationSeconds || r?.match?.durationSeconds || 0);
      if (dur < 10 * 60) return false;
      // Excluir partidas con AFK inicial (> 150 s de paro en Alta Edad)
      if (Number(eng.self.tcIdleDarkSeconds) > 150) return false;
      return true;
    })
    .slice(0, 20);

  const parsedRows = soloOnly.map((r) => {
    const mapName = r?.mapName || r?.match?.mapName || r?.telemetry?.context?.mapName || '';
    const mapClass = classifyRoadmapMap(mapName);
    const civ = r?.civ || r?.telemetry?.context?.civ || '';
    const m = extractNodeMetrics(r.telemetry.engineSummary.self, r.telemetry, {
      includeCensored: true,
      mapClass,
      civSlug: civ,
    });
    const won = inferWonFromRecord(r);
    return m ? { mapClass, mapName, won, ...m } : null;
  }).filter(Boolean);

  const matches = (Array.isArray(unifiedMatches) ? unifiedMatches : []).filter((m) => typeof m?.won === 'boolean');
  const lossRows = parsedRows.filter((r) => r.won === false);
  const userReplayCount = parsedRows.length;
  const lossReplayCount = lossRows.length;
  const MIN_REPLAYS = 5;
  const MIN_LOSSES = 2;
  const hasFullReplaySample = userReplayCount >= MIN_REPLAYS;

  // Preferencia de tipo de mapa basada en las partidas reales RM 1v1 del jugador
  const matchOpenCount = matches.filter((m) => classifyRoadmapMap(m.mapName || m.map) === 'open').length;
  const matchClosedCount = matches.filter((m) => classifyRoadmapMap(m.mapName || m.map) === 'closed').length;
  const repOpenCount = parsedRows.filter((r) => r.mapClass === 'open').length;
  const repClosedCount = parsedRows.filter((r) => r.mapClass === 'closed').length;
  const openScore = matchOpenCount + repOpenCount * 2;
  const closedScore = matchClosedCount + repClosedCount * 2;
  const preferredMapClass = openScore >= 3 && openScore >= closedScore
    ? 'open'
    : (closedScore >= 3 && closedScore > openScore ? 'closed' : 'all');

  const bench = resolveTargetBracketMetrics(targetBucket, preferredMapClass, liveBenchmarks);
  if (!bench || !Object.keys(bench.metrics).length) return null;

  const mapRows = (preferredMapClass === 'open' || preferredMapClass === 'closed')
    ? parsedRows.filter((r) => r.mapClass === preferredMapClass)
    : parsedRows;

  const statBundle = (rows, key, minN = 3) => {
    const vals = rows.map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (vals.length < minN) return null;
    const wVals = rows.filter((r) => r.won === true).map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const lVals = rows.filter((r) => r.won === false).map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    return {
      n: vals.length,
      p50: percentileOf(vals, 0.5),
      p75: percentileOf(vals, 0.75),
      p25: percentileOf(vals, 0.25),
      winP50: wVals.length >= 2 ? percentileOf(wVals, 0.5) : null,
      lossP50: lVals.length >= 2 ? percentileOf(lVals, 0.5) : null,
    };
  };

  const dimFindings = { opening: [], castleMacro: [], combatPace: [], closingLadder: [] };
  const dimEvaluated = { opening: 0, castleMacro: 0, combatPace: 0, closingLadder: 0 };
  const dimSolid = { opening: 0, castleMacro: 0, combatPace: 0, closingLadder: 0 };
  const dimInconsistent = { opening: 0, castleMacro: 0, combatPace: 0, closingLadder: 0 };

  const REPLAY_SPECS = [
    // PILAR 1 · Apertura (0-14 min)
    {
      id: 'tc_idle_dark', dim: 'opening', key: 'tcIdleDarkSec', dir: 'lower', icon: ICONS.tc,
      allowWlCollapse: true, deadband: 6, p75Deadband: 14, wlMinDelta: 9, worstDelta: 30, impactWeight: 1.08,
      titleKey: 'cx.rmTcDark', titleFallback: 'Pausa de CU en Alta Edad',
      drillKey: 'cx.rmDrillTcDark',
      drillFallback: 'Al cazar jabalí o empujar ciervos, intercalá tu hotkey de Centro Urbano + Aldeano cada 15 s sin mover la cámara.',
      fmt: (v) => `${Math.round(v)} s`, prefix: '≤ ', trainTab: 'orders',
      trainLabelKey: 'cx.rmGoOrders', trainLabelFallback: 'Orders',
      makePin: (t) => ({
        source: 'Central', title: `Pausa de CU en Alta Edad ≤ ${Math.max(5, Math.round(t))} s`,
        metric: `Meta ${targetElo}: ≤ ${Math.max(5, Math.round(t))} s`, targetTab: 'orders', ruleType: 'tc_idle_dark',
        ruleTarget: Math.max(5, Math.round(t)),
        detail: `Sostener ≤ ${Math.max(5, Math.round(t))} s de CU inactivo en Alta Edad (verificado contra llegada oficial a Feudal).`,
      }),
    },
    {
      id: 'feudal_time', dim: 'opening', key: 'feudalSec', dir: 'lower', useMapRows: true, icon: ICONS.feudal,
      allowWlCollapse: true, deadband: 20, p75Deadband: 35, wlMinDelta: 22, worstDelta: 85, impactWeight: 1.0,
      titleKey: 'cx.rmFeudalTime', titleFallback: 'Llegada a Edad Feudal',
      drillKey: 'cx.rmDrillFeudal',
      drillFallback: 'Practicá el orden de 20–21 pop en Build Orders evitando encolar aldeanos extra cuando ya tenés 500 de alimento.',
      fmt: (v) => fmtClock(v), prefix: '≤ ', trainTab: 'orders',
      trainLabelKey: 'cx.rmGoOrders', trainLabelFallback: 'Orders',
      makePin: (t) => ({
        source: 'Central', title: `Llegar a Edad Feudal en ≤ ${fmtClock(Math.max(520, Math.round(t)))}`,
        metric: `Meta ${targetElo}: ≤ ${fmtClock(Math.max(520, Math.round(t)))}`, targetTab: 'orders', ruleType: 'feudal_time',
        detail: `Llegar a Edad Feudal en ≤ ${fmtClock(Math.max(520, Math.round(t)))} en mapas ${preferredMapClass === 'closed' ? 'cerrados' : 'abiertos'}.`,
      }),
    },
    {
      id: 'dba_delay', dim: 'opening', key: 'dbaDelaySec', dir: 'lower', icon: ICONS.dba,
      allowWlCollapse: true, deadband: 22, p75Deadband: 45, wlMinDelta: 28, worstDelta: 110, impactWeight: 0.92,
      titleKey: 'cx.rmDba', titleFallback: 'Hacha de Doble Filo tras Feudal',
      drillKey: 'cx.rmDrillDba',
      drillFallback: 'Regla fija al sonar Feudal: seleccioná Campamento maderero → Hacha de doble filo antes de mover tu primera unidad militar.',
      fmt: (v) => `${Math.round(v)} s`, prefix: '≤ ', trainTab: 'orders',
      trainLabelKey: 'cx.rmGoOrders', trainLabelFallback: 'Orders',
      makePin: (t) => ({
        source: 'Central', title: `Hacha de Doble Filo en ≤ ${Math.max(18, Math.round(t))} s`,
        metric: `Meta ${targetElo}: ≤ ${Math.max(18, Math.round(t))} s`, targetTab: 'orders', ruleType: 'dba_delay',
        detail: `Investigar Hacha de Doble Filo dentro de los primeros ${Math.max(18, Math.round(t))} s de Edad Feudal.`,
      }),
    },
    // PILAR 2 · Macro y transición (Feudal -> Castillos)
    {
      id: 'biggest_tc_gap', dim: 'castleMacro', key: 'biggestTcGapSec', dir: 'lower', icon: ICONS.villager,
      allowWlCollapse: true, deadband: 12, p75Deadband: 22, wlMinDelta: 16, worstDelta: 65, impactWeight: 1.38,
      titleKey: 'cx.rmTcGap', titleFallback: 'Bache sin órdenes al CU en Feudal',
      drillKey: 'cx.rmDrillTcGap',
      drillFallback: 'En cada escaramuza de Feudal, por cada 2 clics de micro al ejército intercalá Seleccionar todos los CUs + Aldeano sin mover cámara.',
      fmt: (v) => `${Math.round(v)} s`, prefix: '≤ ', trainTab: 'perf',
      trainLabelKey: 'cx.rmGoPerf', trainLabelFallback: 'Progreso',
      makePin: (t) => ({
        source: 'Central', title: `Sin pausas de Centro Urbano mayores a ${Math.max(20, Math.round(t))} s seguidos`,
        metric: `≤ ${Math.max(20, Math.round(t))} s`, targetTab: 'perf', ruleType: 'tc_gap',
        detail: `No pasar más de ${Math.max(20, Math.round(t))} s sin ordenar aldeanos en el Centro Urbano mientras peleás.`,
      }),
    },
    {
      id: 'bow_saw', dim: 'castleMacro', key: 'bowSawDelaySec', dir: 'lower', icon: ICONS.bowSaw,
      allowWlCollapse: true, deadband: 28, p75Deadband: 65, wlMinDelta: 35, worstDelta: 220, impactWeight: 1.18,
      titleKey: 'cx.rmBowSaw', titleFallback: 'Sierra de Arco en Castillos',
      drillKey: 'cx.rmDrillBowSaw',
      drillFallback: 'Apenas suena Castillos: Campamento maderero → Sierra de arco antes de poner TCs o microear; sostiene toda tu madera de granjas.',
      fmt: (v) => (v >= 450 ? 'Olvidada' : `${Math.round(v)} s`), prefix: '≤ ', trainTab: 'perf',
      trainLabelKey: 'cx.rmGoPerf', trainLabelFallback: 'Progreso',
      makePin: (t) => ({
        source: 'Central', title: `Investigar Sierra de Arco en ≤ ${Math.max(30, Math.round(t))} s`,
        metric: `Meta ${targetElo}: ≤ ${Math.max(30, Math.round(t))} s`, targetTab: 'perf', ruleType: 'bow_saw',
        detail: `Investigar Sierra de Arco apenas llegás a Edad de los Castillos sin olvidarla en partidas largas.`,
      }),
    },
  ];

  if (hasFullReplaySample) {
    for (const spec of REPLAY_SPECS) {
      const bMetric = bench.metrics[spec.key];
      if (!bMetric || !Number.isFinite(bMetric.value)) continue;
      const rowsPool = spec.useMapRows ? (mapRows.length >= 3 ? mapRows : parsedRows) : parsedRows;
      if (spec.useMapRows && preferredMapClass === 'all' && mapRows.length < 3) continue;
      const uStat = statBundle(rowsPool, spec.key, 3);
      if (!uStat) continue;

      dimEvaluated[spec.dim] += 1;
      const tgt = bMetric.value;
      const diff = spec.dir === 'lower' ? (uStat.p50 - tgt) : (tgt - uStat.p50);

      const userWorst = spec.dir === 'lower' ? uStat.p75 : uStat.p25;
      const benchWorst = spec.dir === 'lower' ? bMetric.p75 : bMetric.p25;
      const worstGap = (userWorst != null && benchWorst != null)
        ? (spec.dir === 'lower' ? (userWorst - benchWorst) : (benchWorst - userWorst))
        : 0;

      // wl_collapse: SOLO si además las derrotas incumplen materialmente la meta del rango objetivo
      let wlCollapse = false;
      let wlDiff = 0;
      if (spec.allowWlCollapse && uStat.winP50 != null && uStat.lossP50 != null) {
        wlDiff = spec.dir === 'lower' ? (uStat.lossP50 - uStat.winP50) : (uStat.winP50 - uStat.lossP50);
        const lossGapVsTarget = spec.dir === 'lower' ? (uStat.lossP50 - tgt) : (tgt - uStat.lossP50);
        if (wlDiff >= spec.wlMinDelta && lossGapVsTarget >= spec.deadband) {
          wlCollapse = true;
        }
      }

      const materialGap = diff >= spec.deadband;
      const materialInconsistency = !materialGap && worstGap >= spec.p75Deadband;

      if (!materialGap && !materialInconsistency && !wlCollapse) {
        dimSolid[spec.dim] += 1;
        continue;
      }

      if (materialInconsistency && !wlCollapse) {
        dimInconsistent[spec.dim] += 1;
      }

      const refUserVal = wlCollapse && !materialGap ? uStat.lossP50 : (materialInconsistency && !materialGap ? userWorst : uStat.p50);
      const bulletFillPct = computeBulletFill(refUserVal, tgt, spec.dir, spec.worstDelta);
      const evidenceBoost = (materialGap && wlCollapse) ? 1.35 : (materialGap ? 1.15 : (wlCollapse ? 1.1 : 0.85));
      const priorityScore = Math.round((88 - bulletFillPct) * spec.impactWeight * evidenceBoost);

      let evidenceType = 'gap';
      let youLabelKey = 'cx.rmLblYouMed';
      let youLabelFallback = 'TU MEDIANA';
      let userDisplay = spec.fmt(uStat.p50);
      let contextNote = null;
      let evidenceVars = {
        you: spec.fmt(uStat.p50),
        target: `${spec.prefix}${spec.fmt(tgt)}`,
        elo: targetElo,
      };

      // Enriquecimiento causal específico (causa de combate en bache de TC u olvidos en Sierra)
      if (spec.id === 'biggest_tc_gap') {
        const combatGaps = rowsPool.filter((r) => r.biggestTcGapSec >= 25 && r.biggestTcGapCause === 'combat').length;
        if (combatGaps >= 2) {
          contextNote = {
            key: 'cx.rmCtxCombatGap',
            fallback: 'En {c} de {n} partidas el parón ocurre mientras microeás tu ejército',
            vars: { c: combatGaps, n: uStat.n },
          };
        }
      } else if (spec.id === 'bow_saw') {
        const forgottenN = rowsPool.filter((r) => r.bowSawForgotten).length;
        if (forgottenN >= 2) {
          contextNote = {
            key: 'cx.rmCtxBowForgotten',
            fallback: 'Olvidada o retrasada +5 min en {c} de {n} partidas de Castillos',
            vars: { c: forgottenN, n: uStat.n },
          };
        }
      }

      if (wlCollapse && uStat.winP50 != null && uStat.lossP50 != null && !materialGap) {
        evidenceType = 'wl_collapse';
        youLabelKey = 'cx.rmLblInLosses';
        youLabelFallback = 'EN DERROTAS';
        userDisplay = spec.fmt(uStat.lossP50);
        evidenceVars = {
          loss: spec.fmt(uStat.lossP50),
          win: spec.fmt(uStat.winP50),
          target: `${spec.prefix}${spec.fmt(tgt)}`,
          elo: targetElo,
        };
      } else if (materialInconsistency && !materialGap && userWorst != null) {
        evidenceType = 'inconsistency';
        youLabelKey = 'cx.rmLblWorst25';
        youLabelFallback = 'PEOR TRAMO';
        userDisplay = spec.fmt(userWorst);
        evidenceVars = {
          you: spec.fmt(uStat.p50),
          worst: spec.fmt(userWorst),
          target: `${spec.prefix}${spec.fmt(tgt)}`,
          elo: targetElo,
        };
      }

      dimFindings[spec.dim].push({
        id: spec.id,
        dim: spec.dim,
        icon: spec.icon,
        kind: evidenceType,
        severity: priorityScore >= 46 ? 'high' : 'medium',
        priorityScore,
        titleKey: spec.titleKey,
        titleFallback: spec.titleFallback,
        youLabelKey,
        youLabelFallback,
        userDisplay,
        goalLabelKey: 'cx.rmLblGoalElo',
        goalLabelFallback: 'META {elo}',
        targetDisplay: `${spec.prefix}${spec.fmt(tgt)}`,
        bulletFillPct,
        progressPct: bulletFillPct,
        evidenceType,
        evidenceVars,
        contextNote,
        drillKey: spec.drillKey,
        drillFallback: spec.drillFallback,
        trainTab: spec.trainTab,
        trainLabelKey: spec.trainLabelKey,
        trainLabelFallback: spec.trainLabelFallback,
        pinPayload: spec.makePin(tgt),
      });
    }

    // 2B. Desbalance Madera/Granjas verificado por ventas masivas de madera en Mercado (100% determinista)
    const mktRows = parsedRows.filter((r) => typeof r.marketWoodSold === 'number');
    if (mktRows.length >= 4) {
      dimEvaluated.castleMacro += 1;
      const heavyWoodSales = mktRows.filter((r) => r.marketWoodSold >= 1100 || (r.marketWoodSold >= 800 && (r.marketFoodBought || 0) >= 300));
      const medSold = percentileOf(mktRows.map((r) => r.marketWoodSold), 0.5) || 0;
      if (heavyWoodSales.length >= 3 || medSold >= 1000) {
        const shownWood = medSold >= 900 ? Math.round(medSold) : Math.round(percentileOf(heavyWoodSales.map((r) => r.marketWoodSold), 0.5) || 1200);
        const bulletFillPct = computeBulletFill(shownWood, 300, 'lower', 1600);
        dimFindings.castleMacro.push({
          id: 'market_wood_float',
          dim: 'castleMacro',
          icon: ICONS.market,
          kind: 'gap',
          severity: shownWood >= 1400 ? 'high' : 'medium',
          priorityScore: Math.round((86 - bulletFillPct) * 1.05),
          titleKey: 'cx.rmMarketWood',
          titleFallback: 'Exceso de madera quemado en Mercado',
          youLabelKey: 'cx.rmLblSoldWood',
          youLabelFallback: 'MADERA VENDIDA',
          userDisplay: `${shownWood}`,
          goalLabelKey: 'cx.rmLblGoalElo',
          goalLabelFallback: 'META {elo}',
          targetDisplay: '≤ 300',
          bulletFillPct,
          progressPct: bulletFillPct,
          evidenceType: 'market_wood',
          evidenceVars: { wood: shownWood, c: heavyWoodSales.length, n: mktRows.length },
          contextNote: {
            key: 'cx.rmCtxMarketWood',
            fallback: 'Vendiste +900 madera para comprar comida en {c} de {n} partidas de Castillos',
            vars: { c: heavyWoodSales.length, n: mktRows.length },
          },
          drillKey: 'cx.rmDrillMarketWood',
          drillFallback: 'En Castillos, cada vez que tu madera pase de 350 sin estar ahorrando para Universidad o TC, agarrá 4 leñadores y plantá 4 granjas.',
          trainTab: 'orders',
          trainLabelKey: 'cx.rmGoOrders',
          trainLabelFallback: 'Orders',
          pinPayload: {
            source: 'Central',
            title: 'Mejorar Edad de los Castillos',
            stageId: 'castle',
            metric: `${shownWood} madera vendida`,
            targetTab: 'perf',
            ruleType: 'stage_grade',
            detail: `Evitar acumular +1.000 de madera y quemarla en el Mercado sembrando granjas a tiempo en Castillos.`,
          },
        });
      } else {
        dimSolid.castleMacro += 1;
      }
    }

    // 3B. Herrería aplicable en partidas con >= 5 min en Castillos
    const bEq = bench.metrics.wellEquippedPct;
    const eqVals = parsedRows.map((r) => r.wellEquipped).filter((v) => v === 0 || v === 1);
    if (bEq && eqVals.length >= 4) {
      dimEvaluated.combatPace += 1;
      const uPct = Math.round((eqVals.reduce((a, b) => a + b, 0) / eqVals.length) * 100);
      const diff = bEq.value - uPct;
      if (diff >= 15) {
        const bulletFillPct = computeBulletFill(uPct, bEq.value, 'higher', 45);
        dimFindings.combatPace.push({
          id: 'army_upgrades', dim: 'combatPace', icon: ICONS.blacksmith, kind: 'gap',
          severity: diff >= 25 ? 'high' : 'medium',
          priorityScore: Math.round((88 - bulletFillPct) * 1.12),
          titleKey: 'cx.rmUpgrades', titleFallback: 'Mejoras de Herrería en combate',
          youLabelKey: 'cx.rmLblYouMed', youLabelFallback: 'TU TASA',
          userDisplay: `${uPct}%`,
          goalLabelKey: 'cx.rmLblGoalElo', goalLabelFallback: 'META {elo}',
          targetDisplay: `≥ ${Math.round(bEq.value)}%`,
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'gap',
          evidenceVars: { you: `${uPct}%`, target: `≥ ${Math.round(bEq.value)}%`, elo: targetElo },
          drillKey: 'cx.rmDrillUpgrades',
          drillFallback: 'Antes de buscar el primer choque grande en Castillos, verificá tener +2 de armadura en caballería/infantería o Punzones en arqueros.',
          trainTab: 'arena', trainLabelKey: 'cx.rmGoArena', trainLabelFallback: 'Arena',
          pinPayload: {
            source: 'Central', title: 'Pelear con mejoras de Herrería al día',
            metric: `Meta ${targetElo}: ≥ ${Math.round(bEq.value)}%`, targetTab: 'arena', ruleType: 'army_upgrades',
            detail: `Investigar las mejoras obligatorias de Herrería para tu unidad principal antes de comprometer tu ejército.`,
          },
        });
      } else {
        dimSolid.combatPace += 1;
      }
    }

    // 3C. Micro de combate (Attack-Move / Patrol) y disciplina anti-Campana Urbana
    const moveRows = parsedRows.filter((r) => (r.totalMoveOrders || 0) >= 80 && typeof r.controlSharePct === 'number');
    if (moveRows.length >= 4) {
      dimEvaluated.combatPace += 1;
      const ctrlMed = percentileOf(moveRows.map((r) => r.controlSharePct), 0.5) || 0;
      const tgtCtrl = Math.max(1.5, Number(bench.metrics.controlSharePct?.value || 1.5));
      if (ctrlMed < 0.8 && tgtCtrl >= 1.2) {
        const bulletFillPct = computeBulletFill(ctrlMed, tgtCtrl, 'higher', 2.2);
        dimFindings.combatPace.push({
          id: 'control_micro', dim: 'combatPace', icon: ICONS.combat, kind: 'gap',
          severity: 'medium',
          priorityScore: Math.round((84 - bulletFillPct) * 0.88),
          titleKey: 'cx.rmMicroCtrl', titleFallback: 'Uso de Patrullar / Movimiento de Ataque',
          youLabelKey: 'cx.rmLblYouMed', youLabelFallback: 'TUS ÓRDENES',
          userDisplay: `${ctrlMed}%`,
          goalLabelKey: 'cx.rmLblGoalElo', goalLabelFallback: 'META {elo}',
          targetDisplay: `≥ ${tgtCtrl.toFixed(1)}%`,
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'gap',
          evidenceVars: { you: `${ctrlMed}%`, target: `≥ ${tgtCtrl.toFixed(1)}%`, elo: targetElo },
          drillKey: 'cx.rmDrillMicroCtrl',
          drillFallback: 'En choques de +10 unidades evitá el clic derecho sobre un solo soldado: usá Patrullar o Movimiento de Ataque detrás de la línea rival.',
          trainTab: 'apm', trainLabelKey: 'cx.rmGoApm', trainLabelFallback: 'APM',
          pinPayload: {
            source: 'Central', title: 'Entrenar precisión de combate en APM (30s)',
            metric: `${ctrlMed}% Patrol/Attack-Move`, targetTab: 'apm', ruleType: 'apm_drill',
            detail: `Reemplazar clics derechos unitarios en peleas grandes por Patrullar / Movimiento de Ataque.`,
          },
        });
      } else {
        dimSolid.combatPace += 1;
      }
    }

    const bellGames = parsedRows.filter((r) => (r.townBellCount || 0) >= 1).length;
    if (parsedRows.length >= 4) {
      dimEvaluated.combatPace += 1;
      if (bellGames >= Math.ceil(parsedRows.length * 0.4)) {
        const pctClean = Math.round(((parsedRows.length - bellGames) / parsedRows.length) * 100);
        const bulletFillPct = computeBulletFill(pctClean, 90, 'higher', 60);
        dimFindings.combatPace.push({
          id: 'town_bell', dim: 'combatPace', icon: ICONS.shield, kind: 'gap',
          severity: 'medium',
          priorityScore: Math.round((86 - bulletFillPct) * 0.95),
          titleKey: 'cx.rmTownBell', titleFallback: 'Uso de Campana Urbana ante raids',
          youLabelKey: 'cx.rmLblYouMed', youLabelFallback: 'CON CAMPANA',
          userDisplay: `${bellGames}/${parsedRows.length} pj`,
          goalLabelKey: 'cx.rmLblGoalElo', goalLabelFallback: 'META {elo}',
          targetDisplay: '0 usos',
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'town_bell',
          evidenceVars: { c: bellGames, n: parsedRows.length },
          drillKey: 'cx.rmDrillTownBell',
          drillFallback: 'Desasigná la Campana Urbana: seleccioná con recuadro únicamente los aldeanos atacados y pulsá Guarecer (G) en el TC más cercano.',
          trainTab: 'perf', trainLabelKey: 'cx.rmGoPerf', trainLabelFallback: 'Progreso',
          pinPayload: {
            source: 'Central', title: 'Defender raids con 0 usos de Campana Urbana',
            metric: `${bellGames}/${parsedRows.length} partidas`, targetTab: 'perf', ruleType: 'no_town_bell',
            detail: `Terminar tu próxima partida real con 0 usos de Campana Urbana.`,
          },
        });
      } else {
        dimSolid.combatPace += 1;
      }
    }
  } else if (userReplayCount >= 1) {
    // Modo Evidencia Puntual honesta cuando hay 1..4 replays RM 1v1 (sin marcar el pilar entero en rojo como estadístico)
    const sampleRow = parsedRows[0];
    if (sampleRow.bowSawForgotten) {
      dimFindings.castleMacro.push({
        id: 'bow_saw_spot', dim: 'castleMacro', icon: ICONS.bowSaw, kind: 'spot_check',
        severity: 'medium', priorityScore: 44,
        titleKey: 'cx.rmBowSaw', titleFallback: 'Sierra de Arco en Castillos',
        youLabelKey: 'cx.rmLblSpotReplay', youLabelFallback: `REPLAY (${userReplayCount}/5)`,
        userDisplay: 'Olvidada',
        goalLabelKey: 'cx.rmLblGoalElo', goalLabelFallback: 'META {elo}',
        targetDisplay: `≤ ${Math.round(bench.metrics.bowSawDelaySec?.value || 45)} s`,
        bulletFillPct: 24, progressPct: 24,
        evidenceType: 'spot_replay',
        evidenceVars: { u: userReplayCount, detail: 'Partida larga de Castillos jugada sin investigar Sierra de Arco' },
        drillKey: 'cx.rmDrillBowSaw',
        drillFallback: 'Apenas suena Castillos: Campamento maderero → Sierra de arco antes de poner TCs o microear; sostiene toda tu madera de granjas.',
        trainTab: 'perf', trainLabelKey: 'cx.rmGoPerf', trainLabelFallback: 'Progreso',
        pinPayload: {
          source: 'Central', title: 'Investigar Sierra de Arco en ≤ 40 s tras Castillos',
          metric: `Detectado en replay 1v1`, targetTab: 'perf', ruleType: 'bow_saw',
          detail: `Investigar Sierra de Arco apenas entrás en Edad de los Castillos.`,
        },
      });
    }
  }

  // 3A. Ritmo efectivo (eAPM 1v1 puro): combina replays RM 1v1 + telemetría 1v1 de AoE2Insights (funciona incluso con < 5 replays locales!)
  const replayEapms = parsedRows.map((r) => r.eapm).filter((v) => Number.isFinite(v));
  const insightEapms = matches.map((m) => Number(m.myEapm ?? m.meanEapm)).filter((v) => Number.isFinite(v) && v >= 10 && v <= 200);
  const combined1v1Eapms = replayEapms.length >= 5 ? replayEapms : [...replayEapms, ...insightEapms].slice(0, 20);
  const bEapm = bench.metrics.eapm;
  if (bEapm && combined1v1Eapms.length >= 5) {
    dimEvaluated.combatPace += 1;
    const uEapm = percentileOf(combined1v1Eapms, 0.5);
    const diff = bEapm.value - uEapm;
    if (diff >= 5) {
      const bulletFillPct = computeBulletFill(uEapm, bEapm.value, 'higher', 22);
      dimFindings.combatPace.push({
        id: 'eapm', dim: 'combatPace', icon: ICONS.tempo, kind: 'gap',
        severity: diff >= 10 ? 'high' : 'medium',
        priorityScore: Math.round((88 - bulletFillPct) * 1.06),
        titleKey: 'cx.rmEapm', titleFallback: 'Ritmo efectivo en RM 1v1 (eAPM)',
        youLabelKey: 'cx.rmLblYouMed', youLabelFallback: 'TU MEDIANA',
        userDisplay: `${Math.round(uEapm)} eAPM`,
        goalLabelKey: 'cx.rmLblGoalElo', goalLabelFallback: 'META {elo}',
        targetDisplay: `≥ ${Math.round(bEapm.value)}`,
        bulletFillPct, progressPct: bulletFillPct,
        evidenceType: 'gap',
        evidenceVars: { you: `${Math.round(uEapm)} eAPM`, target: `≥ ${Math.round(bEapm.value)} eAPM`, elo: targetElo },
        drillKey: 'cx.rmDrillEapm',
        drillFallback: 'Automatizá grupos de control (1 Ejército, 2 Apoyo) y hotkeys de Seleccionar todos los CUs/Talleres para ciclar sin mover la pantalla.',
        trainTab: 'apm', trainLabelKey: 'cx.rmGoApm', trainLabelFallback: 'APM',
        pinPayload: {
          source: 'Central', title: `Alcanzar ≥ ${Math.max(30, Math.round(bEapm.value))} eAPM efectivos`,
          metric: `${Math.round(uEapm)} → ${Math.round(bEapm.value)} eAPM`, targetTab: 'apm', ruleType: 'eapm',
          detail: `Sostener ≥ ${Math.max(30, Math.round(bEapm.value))} eAPM en partidas 1v1 apoyándote en hotkeys globales.`,
        },
      });
    } else {
      dimSolid.combatPace += 1;
    }
  }

  // PILAR 4 · Cierre y fugas reales de ladder (100% RM 1v1 oficial, reloj de juego 1.7×)
  if (matches.length >= 12) {
    // 4A. Cierre en Edad Imperial (>= 35 min en reloj de partida 1.7×)
    const getGameSec = (m) => {
      if (Number.isFinite(Number(m.durationGameSec)) && Number(m.durationGameSec) > 0) return Number(m.durationGameSec);
      if (Number.isFinite(Number(m.durationSeconds)) && Number(m.durationSeconds) > 0) return Math.round(Number(m.durationSeconds) * 1.7);
      return 0;
    };
    const timed = matches.filter((m) => getGameSec(m) >= 8 * 60);
    const earlyM = timed.filter((m) => getGameSec(m) < 35 * 60);
    const lateM = timed.filter((m) => getGameSec(m) >= 35 * 60);
    if (earlyM.length >= 6 && lateM.length >= 6) {
      dimEvaluated.closingLadder += 1;
      const earlyWr = Math.round((earlyM.filter((m) => m.won).length / earlyM.length) * 100);
      const lateWr = Math.round((lateM.filter((m) => m.won).length / lateM.length) * 100);
      if (lateWr <= 45 && (earlyWr - lateWr) >= 15) {
        const bulletFillPct = computeBulletFill(lateWr, 50, 'higher', 28);
        dimFindings.closingLadder.push({
          id: 'late_closing', dim: 'closingLadder', icon: ICONS.imperial, kind: 'ladder_leak',
          severity: lateWr <= 38 ? 'high' : 'medium',
          priorityScore: Math.round((52 - lateWr) * 2.2 + 24),
          titleKey: 'cx.rmLateClosing', titleFallback: 'Cierre en Edad Imperial (35+ min)',
          youLabelKey: 'cx.rmLblLate35', youLabelFallback: '35+ MIN',
          userDisplay: `${lateWr}% WR`,
          goalLabelKey: 'cx.rmLblGoalElo', goalLabelFallback: 'META {elo}',
          targetDisplay: '≥ 50% WR',
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'late_drop',
          evidenceVars: { early: `${earlyWr}%`, late: `${lateWr}%`, n: lateM.length },
          drillKey: 'cx.rmDrillLateClosing',
          drillFallback: 'Al pasar a Imperial llegá a 130–140 aldeanos, asegurá Lanzapiedras/Cañones primero y sumá 6–8 talleres para reponer frente al castillo clave.',
          trainTab: 'matchups', trainLabelKey: 'cx.rmGoMatchups', trainLabelFallback: 'Matchups',
          pinPayload: {
            source: 'Central', title: 'Mejorar Edad Imperial',
            stageId: 'imperial',
            metric: `${lateWr}% WR en 35+ min`, targetTab: 'matchups', ruleType: 'stage_grade',
            detail: `Tu WR baja de ${earlyWr}% antes del min 35 a ${lateWr}% en Imperial (${lateM.length} pj). Lograr nota A/S en Edad Imperial.`,
          },
        });
      } else {
        dimSolid.closingLadder += 1;
      }
    }

    // 4B. Rendimiento contra rivales de la franja objetivo (m.oppElo real)
    const higherRivals = matches.filter((m) => {
      const oppR = Number(m.oppElo ?? m.oppRating ?? m.rivalRating ?? m.opponents?.[0]?.elo ?? m.opponents?.[0]?.rating);
      return Number.isFinite(oppR) && oppR >= (targetElo - 50);
    });
    if (higherRivals.length >= 5) {
      dimEvaluated.closingLadder += 1;
      const hrWins = higherRivals.filter((m) => m.won).length;
      const hrWr = Math.round((hrWins / higherRivals.length) * 100);
      if (hrWr <= 42) {
        const bulletFillPct = computeBulletFill(hrWr, 48, 'higher', 30);
        dimFindings.closingLadder.push({
          id: 'vs_target_elo', dim: 'closingLadder', icon: ICONS.trophy, kind: 'ladder_leak',
          severity: 'high', priorityScore: Math.round((50 - hrWr) * 2.0 + 22),
          titleKey: 'cx.rmVsTargetElo', titleFallback: 'Cruces contra rivales de {target} ELO',
          titleVars: { target: targetElo },
          youLabelKey: 'cx.rmLblVsRivals', youLabelFallback: `VS ${targetElo - 50}+`,
          userDisplay: `${hrWr}% WR`,
          goalLabelKey: 'cx.rmLblGoalShort', goalLabelFallback: 'META',
          targetDisplay: '≥ 48% WR',
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'vs_target',
          evidenceVars: { wr: `${hrWr}%`, w: hrWins, l: higherRivals.length - hrWins, elo: targetElo - 50 },
          drillKey: 'cx.rmDrillVsTarget',
          drillFallback: 'Contra rivales de mayor ELO evitá jugadas pasivas: fijá tus 2 mejores civilizaciones y presioná su recurso expuesto en Feudal.',
          trainTab: 'matchups', trainLabelKey: 'cx.rmGoMatchups', trainLabelFallback: 'Matchups',
          pinPayload: {
            source: 'Central', title: `Superar cruces contra rivales ≥ ${targetElo - 50} ELO`,
            metric: `${hrWins}V-${higherRivals.length - hrWins}D`, targetTab: 'matchups', ruleType: 'win_clean',
            detail: `Contra rivales de tu franja objetivo (${targetElo - 50}+ ELO) registrás ${hrWr}% WR.`,
          },
        });
      } else {
        dimSolid.closingLadder += 1;
      }
    }

    // 4C. Fugas reales de sesión (SOLO si WR <= 45% y saldo neto de ELO negativo — jamás castiga 54% WR ganador!)
    const sessBuckets = Array.isArray(competitiveIntel?.session?.buckets) ? competitiveIntel.session.buckets : [];
    const coldB = sessBuckets.find((b) => b.id === 'cold') || null;
    const warmB = sessBuckets.find((b) => b.id === 'warm') || null;
    const fatigueB = sessBuckets.find((b) => b.id === 'fatigue' || b.id === 'late' || b.id === 'marathon') || null;

    if (coldB && warmB && Number(coldB.games) >= 6 && Number(warmB.games) >= 5) {
      dimEvaluated.closingLadder += 1;
      const coldWr = Math.round(Number(coldB.winRate));
      const warmWr = Math.round(Number(warmB.winRate));
      const coldNet = Number(coldB.netElo ?? (coldB.wins - coldB.losses));
      const drop = warmWr - coldWr;
      if (coldWr <= 45 && coldNet < 0 && drop >= 15) {
        const bulletFillPct = computeBulletFill(coldWr, 50, 'higher', 28);
        dimFindings.closingLadder.push({
          id: 'cold_start', dim: 'closingLadder', icon: ICONS.activity, kind: 'ladder_leak',
          severity: coldWr <= 38 ? 'high' : 'medium',
          priorityScore: Math.round((50 - coldWr) * 2.0 + 18),
          titleKey: 'cx.rmColdStart', titleFallback: 'Arranque en frío (1.ª partida del día)',
          youLabelKey: 'cx.rmLblFirstGame', youLabelFallback: '1.ª PARTIDA',
          userDisplay: `${coldWr}% WR`,
          goalLabelKey: 'cx.rmLblWarmedUp', goalLabelFallback: 'EN CALOR',
          targetDisplay: `${warmWr}% WR`,
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'cold_start',
          evidenceVars: { cold: `${coldWr}%`, warm: `${warmWr}%`, w: coldB.wins, l: coldB.losses, drop },
          drillKey: 'cx.rmDrillColdStart',
          drillFallback: 'Antes de mandar tu primera cola ranqueada del día, jugá 2 rondas de 30 s en el entrenador de APM para activar manos y lectura.',
          trainTab: 'apm', trainLabelKey: 'cx.rmGoApm', trainLabelFallback: 'APM',
          pinPayload: {
            source: 'Central', title: 'Calentar 2 rondas de APM (30s) antes de la 1.ª ranked',
            metric: `${coldWr}% en frío (${coldB.wins}V-${coldB.losses}D)`, targetTab: 'apm', ruleType: 'apm_drill',
            detail: `En tu 1.ª partida de sesión rendís ${coldWr}% WR (${coldB.wins}V-${coldB.losses}D) con pérdida neta de ELO.`,
          },
        });
      } else {
        dimSolid.closingLadder += 1;
      }
    }

    if (fatigueB && warmB && Number(fatigueB.games) >= 5) {
      dimEvaluated.closingLadder += 1;
      const lateWr = Math.round(Number(fatigueB.winRate));
      const earlyWr = Math.round(Number(warmB.winRate));
      const fatNet = Number(fatigueB.netElo ?? (fatigueB.wins - fatigueB.losses));
      const drop = earlyWr - lateWr;
      if (lateWr <= 45 && fatNet < 0 && drop >= 14) {
        const bulletFillPct = computeBulletFill(lateWr, 50, 'higher', 28);
        dimFindings.closingLadder.push({
          id: 'session_fatigue', dim: 'closingLadder', icon: ICONS.activity, kind: 'ladder_leak',
          severity: lateWr <= 38 ? 'high' : 'medium',
          priorityScore: Math.round((50 - lateWr) * 2.0 + 16),
          titleKey: 'cx.rmSessionFatigue', titleFallback: 'Fatiga en sesiones largas (4.ª+ seguida)',
          youLabelKey: 'cx.rmLblFourthPlus', youLabelFallback: '4.ª+ SEGUIDA',
          userDisplay: `${lateWr}% WR`,
          goalLabelKey: 'cx.rmLblFreshGames', goalLabelFallback: 'FRESCAS',
          targetDisplay: `${earlyWr}% WR`,
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'fatigue',
          evidenceVars: { early: `${earlyWr}%`, late: `${lateWr}%`, drop },
          drillKey: 'cx.rmDrillFatigue',
          drillFallback: 'Cortá el bloque ranqueado en la 3.ª partida seguida o hacé una pausa de 10 minutos lejos de la pantalla antes de la 4.ª.',
          trainTab: 'perf', trainLabelKey: 'cx.rmGoPerf', trainLabelFallback: 'Progreso',
          pinPayload: {
            source: 'Central', title: 'Cortar bloque ranqueado en la 3.ª partida',
            metric: `${lateWr}% WR en 4.ª+`, targetTab: 'perf', ruleType: 'win_clean',
            detail: `Desde la 4.ª partida seguida tu WR cae a ${lateWr}% con pérdida neta de ELO.`,
          },
        });
      } else {
        dimSolid.closingLadder += 1;
      }
    }

    // 4D. Fuga concreta de mapa (compatible con el diccionario real `mapDiagnostics` y con arrays en tests)
    const rawMapEntries = Array.isArray(mapDiagnostics?.maps)
      ? mapDiagnostics.maps
      : (mapDiagnostics && typeof mapDiagnostics === 'object' ? Object.values(mapDiagnostics) : []);
    const normalizedMaps = rawMapEntries
      .map((d) => {
        if (!d || typeof d !== 'object') return null;
        const smp = d.sample || d;
        const games = Number(smp.games || 0);
        const wins = Number(smp.wins || 0);
        const losses = Number(smp.losses ?? (games - wins));
        const winRate = Number(smp.rawWinRate ?? smp.winRate);
        const name = d.mapName || d.name || '';
        const mapKey = d.mapKey || name.toLowerCase();
        return (games > 0 && Number.isFinite(winRate) && name) ? { name, mapKey, games, wins, losses, winRate } : null;
      })
      .filter(Boolean);
    const leakMap = normalizedMaps
      .filter((m) => m.games >= 6 && m.winRate <= 40 && m.losses > m.wins)
      .sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0] || null;
    if (normalizedMaps.some((m) => m.games >= 6)) {
      dimEvaluated.closingLadder += 1;
      if (leakMap) {
        const bulletFillPct = computeBulletFill(leakMap.winRate, 48, 'higher', 30);
        dimFindings.closingLadder.push({
          id: `map_leak_${leakMap.mapKey}`, dim: 'closingLadder', mapName: leakMap.name, icon: ICONS.shield, kind: 'ladder_leak',
          severity: leakMap.winRate <= 34 ? 'high' : 'medium',
          priorityScore: Math.round((48 - leakMap.winRate) * 2.0 + Math.min(16, leakMap.games)),
          titleKey: 'cx.rmMapLeak', titleFallback: 'Sangría de ELO en {map}',
          titleVars: { map: leakMap.name },
          youLabelKey: 'cx.rmLblOnMap', youLabelFallback: 'EN MAPA',
          userDisplay: `${Math.round(leakMap.winRate)}% WR`,
          goalLabelKey: 'cx.rmLblGoalShort', goalLabelFallback: 'META',
          targetDisplay: '≥ 48% WR',
          bulletFillPct, progressPct: bulletFillPct,
          evidenceType: 'map_leak',
          evidenceVars: { map: leakMap.name, wr: `${Math.round(leakMap.winRate)}%`, w: leakMap.wins, l: leakMap.losses },
          drillKey: 'cx.rmDrillMapLeak',
          drillFallback: 'Bloqueá este mapa en tus vetos de ladder o fijá una civilización especialista con orden dedicado en Build Orders.',
          trainTab: 'orders', trainLabelKey: 'cx.rmGoOrders', trainLabelFallback: 'Orders',
          pinPayload: {
            source: 'Central', title: `Ganar una partida real en ${leakMap.name}`,
            metric: `${leakMap.wins}V-${leakMap.losses}D (${Math.round(leakMap.winRate)}%)`, targetTab: 'matchups', ruleType: 'on_map',
            mapName: leakMap.name,
            detail: `Revertir tu registro de ${leakMap.wins}V-${leakMap.losses}D en ${leakMap.name} con plan dedicado.`,
          },
        });
      } else {
        dimSolid.closingLadder += 1;
      }
    }
  }

  // Resumen honesto de los 4 Pilares con sus escudos oficiales
  const buildDimState = (dimId, titleKey, titleFallback, iconPath, needsFullReplays) => {
    const ev = dimEvaluated[dimId];
    const finds = dimFindings[dimId].filter((f) => f.kind !== 'spot_check');
    if ((needsFullReplays && !hasFullReplaySample) || ev === 0) {
      return {
        id: dimId, titleKey, titleFallback, icon: iconPath,
        status: 'calibrating',
        findingCount: 0,
      };
    }
    const hasSevereGap = finds.some((f) => f.severity === 'high' && f.kind !== 'inconsistency');
    if (hasSevereGap || finds.length >= 2) {
      return { id: dimId, titleKey, titleFallback, icon: iconPath, status: 'bottleneck', findingCount: finds.length };
    }
    if (finds.length > 0 || dimInconsistent[dimId] > 0) {
      return { id: dimId, titleKey, titleFallback, icon: iconPath, status: 'inconsistent', findingCount: finds.length };
    }
    return { id: dimId, titleKey, titleFallback, icon: iconPath, status: 'solid', findingCount: 0 };
  };

  const dimensions = [
    buildDimState('opening', 'cx.rmDimOpening', 'Apertura', ICONS.dimOpening, true),
    buildDimState('castleMacro', 'cx.rmDimCastle', 'Macro Castillos', ICONS.dimCastle, true),
    buildDimState('combatPace', 'cx.rmDimCombat', 'Combate y ritmo', ICONS.dimCombat, false),
    buildDimState('closingLadder', 'cx.rmDimClosing', 'Cierre y ladder', ICONS.dimClosing, false),
  ];

  const allFindings = [
    ...dimFindings.castleMacro,
    ...dimFindings.opening,
    ...dimFindings.combatPace,
    ...dimFindings.closingLadder,
  ].sort((a, b) => b.priorityScore - a.priorityScore);

  const selected = [];
  const usedDims = new Set();
  for (const f of allFindings) {
    if (selected.length >= 3) break;
    if (!usedDims.has(f.dim)) {
      selected.push(f);
      usedDims.add(f.dim);
    }
  }
  for (const f of allFindings) {
    if (selected.length >= 3) break;
    if (!selected.includes(f)) selected.push(f);
  }

  return {
    version: 3,
    targetElo,
    targetBucket: bench.sourceBucket,
    mapClass: preferredMapClass === 'open' || preferredMapClass === 'closed' ? preferredMapClass : bench.mapClass,
    usingMixedReplays: false,
    userReplayCount,
    lossReplayCount,
    minReplaysRequired: MIN_REPLAYS,
    minLossesRequired: MIN_LOSSES,
    hasFullReplaySample,
    officialMatchCount: matches.length,
    benchmarkSamples: bench.samples,
    dimensions,
    bottlenecks: selected,
  };
}

module.exports = {
  classifyRoadmapMap,
  clampBucket,
  setLiveBracketBenchmarks,
  getLiveBracketBenchmarks,
  extractBracketSampleFromRecord,
  computeNextEloRoadmap,
};
