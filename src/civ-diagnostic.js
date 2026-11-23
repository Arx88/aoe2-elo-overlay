'use strict';

/**
 * MOTOR DE DIAGNÓSTICO POR CIVILIZACIÓN (src/civ-diagnostic.js)
 * "¿Cómo me va con esta civ?" / "¿Por qué me va así con esta civ?"
 *
 * Validado estadísticamente y desde dominio AoE2:DE:
 *  - Ventana emparejada (diagnóstico sobre las mismas partidas con detalle;
 *    histórico all-time como contexto separado + detección de giro reciente).
 *  - Baseline ajustado por ELO esperado (E_i = 1 / (1 + 10^((opp-my)/400)))
 *    + régimen local de ELO (mediana móvil) sin sesgo de subida histórica.
 *  - Empirical Bayes Beta-Binomial con DerSimonian-Laird k ∈ [10, 24] (default 12),
 *    intervalo creíble 90% y test exacto de Fisher bilateral (O(N), cero deps).
 *  - Descomposición Kitagawa / Oaxaca-Blinder: separa efecto de mezcla de mapa
 *    (Paradoja de Simpson: "te penaliza el mapa, no la civ") del efecto propio.
 *  - Control de falsos positivos Benjamini-Hochberg (FDR) + deduplicación por
 *    solapamiento de partidas (>70% cobertura → etiqueta secundaria).
 *  - Escala única de tiempo IN-GAME (1.7x), descartando dodges (<5:00 in-game),
 *    hazard condicional por fase y residuales emparejados por resultado (nunca
 *    la tautología derrotas-vs-victorias).
 */

const { civSlug } = require('./civs');
const { mapKey } = require('./rival');

const MIN_DIAGNOSIS_GAMES = 5;
const EARLY_RESIGN_GAME_SEC = 5 * 60; // < 5:00 in-game (≈ 3 min real) = dodge / early resign
const DEFAULT_PRIOR_K = 12;

const OPEN_MAP_KINDS = new Set(['open', 'semi-open', 'semi_open', 'abiertos', 'semi-abiertos']);

const OPENNESS_LABELS_ES = {
  open: 'Mapas abiertos',
  'semi-open': 'Mapas semi-abiertos',
  semi_open: 'Mapas semi-abiertos',
  closed: 'Mapas cerrados',
  hybrid: 'Mapas híbridos',
  water: 'Mapas de agua',
};

const PHASE_BUCKETS_1V1 = [
  { id: 'early', label: '5–25m', sub: 'Feudal / Inicio Castillos', min: EARLY_RESIGN_GAME_SEC, max: 25 * 60 },
  { id: 'mid', label: '25–40m', sub: 'Castillos / Early Imp', min: 25 * 60, max: 40 * 60 },
  { id: 'imp', label: '40–55m', sub: 'Imperial', min: 40 * 60, max: 55 * 60 },
  { id: 'late', label: '55m+', sub: 'Post-Imp / Trash', min: 55 * 60, max: Infinity },
];

const PHASE_BUCKETS_TEAM = [
  { id: 'early', label: '5–30m', sub: 'Feudal / Castillos', min: EARLY_RESIGN_GAME_SEC, max: 30 * 60 },
  { id: 'mid', label: '30–45m', sub: 'Castillos / Imperial', min: 30 * 60, max: 45 * 60 },
  { id: 'imp', label: '45–60m', sub: 'Imperial', min: 45 * 60, max: 60 * 60 },
  { id: 'late', label: '60m+', sub: 'Juego tardío', min: 60 * 60, max: Infinity },
];

/* ---------- Utilidades matemáticas puras ---------- */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

function round1(v) {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

function median(values) {
  const valid = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

const LN_FACT = [0];
function lnFactorial(n) {
  const k = Math.max(0, Math.floor(n));
  while (LN_FACT.length <= k) {
    const i = LN_FACT.length;
    LN_FACT.push(LN_FACT[i - 1] + Math.log(i));
  }
  return LN_FACT[k];
}

function lnChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k);
}

/**
 * Test exacto de Fisher bilateral para tabla 2x2:
 *   [ a, b ]  (ej. W_c, L_c)
 *   [ c, d ]  (ej. W_other, L_other)
 */
function fisherExactTwoSided(a, b, c, d) {
  a = Math.max(0, Math.round(a));
  b = Math.max(0, Math.round(b));
  c = Math.max(0, Math.round(c));
  d = Math.max(0, Math.round(d));
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  if (n <= 0 || r1 <= 0 || r2 <= 0 || c1 <= 0 || c1 >= n) return 1;

  const denom = lnChoose(n, c1);
  const prob = (x) => Math.exp(lnChoose(r1, x) + lnChoose(r2, c1 - x) - denom);
  const pObs = prob(a);
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(r1, c1);
  let pSum = 0;
  for (let x = lo; x <= hi; x += 1) {
    const px = prob(x);
    if (px <= pObs * (1 + 1e-9)) pSum += px;
  }
  return clamp(pSum, 0, 1);
}

/** Test binomial bilateral exacto P(|X - n*p0| >= |k - n*p0|) usando prob <= pObs. */
function binomialExactTwoSided(k, n, p0) {
  k = Math.max(0, Math.round(k));
  n = Math.max(0, Math.round(n));
  if (n <= 0) return 1;
  const p = clamp(Number(p0) || 0.5, 1e-6, 1 - 1e-6);
  const logP = Math.log(p);
  const logQ = Math.log(1 - p);
  const prob = (x) => Math.exp(lnChoose(n, x) + x * logP + (n - x) * logQ);
  const pObs = prob(k);
  let pSum = 0;
  for (let x = 0; x <= n; x += 1) {
    const px = prob(x);
    if (px <= pObs * (1 + 1e-9)) pSum += px;
  }
  return clamp(pSum, 0, 1);
}

/** Aproximación normal de Mann-Whitney U (bilateral) para muestras continuas. */
function mannWhitneyP(xs, ys) {
  const a = xs.filter(Number.isFinite);
  const b = ys.filter(Number.isFinite);
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 3 || n2 < 3) return 1;
  const combined = [
    ...a.map((v) => ({ v, g: 1 })),
    ...b.map((v) => ({ v, g: 2 })),
  ].sort((p, q) => p.v - q.v);
  let r1 = 0;
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j += 1;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) {
      if (combined[k].g === 1) r1 += avgRank;
    }
    i = j + 1;
  }
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma <= 0) return 1;
  const z = Math.abs(u1 - mu) / sigma;
  // erfc approximation (Abramowitz & Stegun 7.1.26)
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
    Math.exp(-(z * z) / 2);
  return clamp(erfc, 0, 1);
}

/** Intervalo creíble 90% de Beta(alpha, beta) vía logit-normal (preciso para alpha, beta >= 2). */
function betaCredibleInterval90(alpha, beta) {
  const a = Math.max(0.5, alpha);
  const b = Math.max(0.5, beta);
  const mean = a / (a + b);
  const logit = Math.log(a / b);
  const se = Math.sqrt(1 / a + 1 / b);
  const z90 = 1.64485;
  const invLogit = (x) => 1 / (1 + Math.exp(-x));
  return {
    mean,
    low: clamp(invLogit(logit - z90 * se), 0, 1),
    high: clamp(invLogit(logit + z90 * se), 0, 1),
  };
}

/** Estima la fuerza de shrinkage k ∈ [10, 24] por DerSimonian-Laird entre civs del jugador. */
function estimatePriorStrength(civStatsList = [], p0 = 0.5) {
  const valid = (Array.isArray(civStatsList) ? civStatsList : [])
    .filter((c) => Number(c?.wins) >= 0 && Number(c?.losses) >= 0 && (Number(c.wins) + Number(c.losses)) >= 3);
  if (valid.length < 5) return DEFAULT_PRIOR_K;
  const baseVar = Math.max(0.05, p0 * (1 - p0));
  let qNum = 0;
  let sumN = 0;
  let sumN2 = 0;
  for (const c of valid) {
    const n = Number(c.wins) + Number(c.losses);
    const phat = Number(c.wins) / n;
    qNum += n * (phat - p0) * (phat - p0) - baseVar;
    sumN += n;
    sumN2 += n * n;
  }
  const denom = sumN - (sumN > 0 ? sumN2 / sumN : 0);
  if (denom <= 0) return DEFAULT_PRIOR_K;
  const tau2 = Math.max(0, qNum / denom);
  const k = baseVar / (tau2 + 1e-6) - 1;
  return Math.round(clamp(k, 10, 24));
}

function eloExpectancy(myElo, oppElo) {
  if (!Number.isFinite(myElo) || !Number.isFinite(oppElo) || myElo <= 0 || oppElo <= 0) return 0.5;
  return 1 / (1 + 10 ** ((oppElo - myElo) / 400));
}

function normalizeOpenness(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'unknown') return null;
  if (s === 'open' || s === 'abierto' || s === 'abiertos') return 'open';
  if (s === 'semi-open' || s === 'semi_open' || s === 'semi-abierto' || s === 'semi-abiertos') return 'semi-open';
  if (s === 'closed' || s === 'cerrado' || s === 'cerrados') return 'closed';
  if (s === 'hybrid' || s === 'híbrido' || s === 'hibrido') return 'hybrid';
  if (s === 'water' || s === 'agua') return 'water';
  return s;
}

function normalizeDurationGameSec(row) {
  // Si ya viene en tiempo in-game (1.7x) desde telemetría local o campo explícito:
  if (Number.isFinite(row.durationGameSec) && row.durationGameSec > 0) return row.durationGameSec;
  if (Number.isFinite(row.replay?.durationSeconds) && row.replay.durationSeconds > 0) return row.replay.durationSeconds;
  // AoE2Insights `match_duration` está en tiempo in-game (1.7x) cuando tiene replay parseado
  if (row.source === 'insights' && Number.isFinite(row.duration) && row.duration > 0) {
    return (row.strategy || Number.isFinite(row.meanEapm))
      ? row.duration
      : Math.max(0, (row.duration - 40) * 1.7);
  }
  // AoE2 Companion `finishedAt - startedAt` es tiempo REAL (1x) con ~40s de pantalla de carga
  if (Number.isFinite(row.durationSeconds) && row.durationSeconds > 0) {
    return Math.max(0, (row.durationSeconds - 40) * 1.7);
  }
  return null;
}

/**
 * Unifica y deduplica partidas de AoE2Insights, AoE2 Companion y replays locales
 * en un pool limpio por modo (sin mezclar RM 1v1 con RM Team).
 */
function buildUnifiedModeMatches({
  insightsRows = [],
  companionMatches = [],
  storedRecords = [],
  profileId = null,
} = {}) {
  const byId = new Map();
  const pid = Number(profileId);

  // 1. Replays locales (telemetría más rica)
  const localById = new Map();
  for (const rec of (Array.isArray(storedRecords) ? storedRecords : [])) {
    if (!rec || !rec.match || !rec.match.matchId) continue;
    if (Number.isFinite(pid) && pid > 0 && Number(rec.profileId) !== pid) continue;
    const id = String(rec.match.matchId);
    const eng = rec.telemetry?.engineSummary || rec.telemetry?.engine || null;
    const self = eng?.self || null;
    const ar = self?.techProfile?.armyRelevance || null;
    localById.set(id, {
      durationSeconds: Number(eng?.durationSeconds ?? rec.telemetry?.durationSeconds) || null,
      feudalSeconds: Number(self?.timings?.feudalSeconds ?? rec.telemetry?.metrics?.feudalSeconds?.value) || null,
      castleSeconds: Number(self?.timings?.castleSeconds ?? rec.telemetry?.metrics?.castleSeconds?.value) || null,
      imperialSeconds: Number(self?.timings?.imperialSeconds ?? rec.telemetry?.metrics?.imperialSeconds?.value) || null,
      eapm: Number(self?.eapm ?? rec.telemetry?.metrics?.eapm?.value) || null,
      apm: Number(self?.apm ?? rec.telemetry?.metrics?.apm?.value) || null,
      eapmRetentionPct: Number.isFinite(self?.eapmRetentionPct) ? self.eapmRetentionPct : null,
      marketOps: Number.isFinite(self?.marketProfile?.totalOps) ? self.marketProfile.totalOps : (Number(self?.habits?.market) || 0),
      relevantBsRatio: (ar && Number(ar.relevantExpected) > 0)
        ? clamp(Number(ar.relevantCount || 0) / Number(ar.relevantExpected), 0, 1)
        : null,
      townCenters: Number(self?.townCenters) || null,
    });
  }

  // 2. AoE2Insights rows (suelen cubrir hasta 250–500 partidas del modo)
  for (const row of (Array.isArray(insightsRows) ? insightsRows : [])) {
    if (!row || !row.civ) continue;
    const id = row.matchId != null ? String(row.matchId) : `ins-${byId.size}`;
    const startedMs = typeof row.startedAt === 'number'
      ? row.startedAt
      : (row.startedAt ? Date.parse(row.startedAt) : null);
    const replay = localById.get(id) || null;
    const entry = {
      matchId: id,
      source: 'insights',
      startedAt: Number.isFinite(startedMs) ? startedMs : 0,
      won: typeof row.won === 'boolean' ? row.won : null,
      civ: String(row.civ),
      civSlug: civSlug(row.civ) || String(row.civ).toLowerCase(),
      oppCiv: row.oppCiv || null,
      oppCivSlug: row.oppCiv ? (civSlug(row.oppCiv) || String(row.oppCiv).toLowerCase()) : null,
      mapName: row.map || null,
      mapKey: row.map ? mapKey(row.map) : null,
      openness: normalizeOpenness(row.openness),
      myOpening: row.strategy && row.strategy !== 'Unknown' ? row.strategy : null,
      oppOpening: row.oppStrategy && row.oppStrategy !== 'Unknown' ? row.oppStrategy : null,
      myElo: Number.isFinite(Number(row.elo)) && Number(row.elo) > 0 ? Number(row.elo) : null,
      oppElo: Number.isFinite(Number(row.oppElo)) && Number(row.oppElo) > 0 ? Number(row.oppElo) : null,
      myEapm: Number.isFinite(Number(row.meanEapm)) && Number(row.meanEapm) > 5 && Number(row.meanEapm) < 250
        ? Number(row.meanEapm)
        : (replay?.eapm || null),
      oppEapm: Number.isFinite(Number(row.oppMeanEapm)) && Number(row.oppMeanEapm) > 5 && Number(row.oppMeanEapm) < 250
        ? Number(row.oppMeanEapm)
        : null,
      duration: Number.isFinite(Number(row.duration)) ? Number(row.duration) : null,
      strategy: row.strategy || null,
      meanEapm: Number.isFinite(Number(row.meanEapm)) ? Number(row.meanEapm) : null,
      replay,
    };
    entry.durationGameSec = normalizeDurationGameSec(entry);
    byId.set(id, entry);
  }

  // 3. AoE2 Companion matches (enriquece partidas muy recientes aún no en Insights)
  for (const m of (Array.isArray(companionMatches) ? companionMatches : [])) {
    if (!m || !m.matchId || !m.myCiv) continue;
    const id = String(m.matchId);
    const existing = byId.get(id);
    const replay = localById.get(id) || null;
    if (existing) {
      if (existing.won == null && typeof m.won === 'boolean') existing.won = m.won;
      if (!existing.mapName && m.mapName) { existing.mapName = m.mapName; existing.mapKey = mapKey(m.mapName); }
      if (!existing.oppCiv && m.rivalCiv) { existing.oppCiv = m.rivalCiv; existing.oppCivSlug = civSlug(m.rivalCiv); }
      if (!existing.myElo && Number.isFinite(m.myRating)) existing.myElo = Number(m.myRating);
      if (!existing.oppElo && Number.isFinite(m.rivalRating)) existing.oppElo = Number(m.rivalRating);
      if (!existing.startedAt && Number.isFinite(m.startedAt)) existing.startedAt = m.startedAt;
      if (!existing.replay && replay) {
        existing.replay = replay;
        if (!existing.myEapm && replay.eapm) existing.myEapm = replay.eapm;
        if (!existing.durationGameSec) existing.durationGameSec = normalizeDurationGameSec(existing);
      }
      continue;
    }
    const entry = {
      matchId: id,
      source: 'companion',
      startedAt: Number.isFinite(m.startedAt) ? m.startedAt : 0,
      won: typeof m.won === 'boolean' ? m.won : null,
      civ: String(m.myCiv),
      civSlug: civSlug(m.myCiv) || String(m.myCiv).toLowerCase(),
      oppCiv: m.rivalCiv || null,
      oppCivSlug: m.rivalCiv ? (civSlug(m.rivalCiv) || String(m.rivalCiv).toLowerCase()) : null,
      mapName: m.mapName || null,
      mapKey: m.mapName ? mapKey(m.mapName) : null,
      openness: null,
      myOpening: null,
      oppOpening: null,
      myElo: Number.isFinite(m.myRating) && m.myRating > 0 ? Number(m.myRating) : null,
      oppElo: Number.isFinite(m.rivalRating) && m.rivalRating > 0 ? Number(m.rivalRating) : null,
      myEapm: replay?.eapm || null,
      oppEapm: null,
      durationSeconds: Number.isFinite(m.durationSeconds) ? m.durationSeconds : null,
      replay,
    };
    entry.durationGameSec = normalizeDurationGameSec(entry);
    byId.set(id, entry);
  }

  return [...byId.values()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

/**
 * Aplica control de tasa de falsos descubrimientos Benjamini-Hochberg (FDR).
 * Mutación in-place: añade `qValue` a cada candidato.
 */
function applyBenjaminiHochberg(candidates) {
  const m = candidates.length;
  if (!m) return candidates;
  const indexed = candidates
    .map((c, idx) => ({ idx, p: clamp(Number(c.pValue) || 1, 0, 1) }))
    .sort((a, b) => a.p - b.p);
  const qVals = new Array(m);
  let minQ = 1;
  for (let i = m - 1; i >= 0; i -= 1) {
    const rank = i + 1;
    const rawQ = (indexed[i].p * m) / rank;
    minQ = Math.min(minQ, rawQ);
    qVals[indexed[i].idx] = clamp(minQ, 0, 1);
  }
  for (let i = 0; i < m; i += 1) {
    candidates[i].qValue = qVals[i];
  }
  return candidates;
}

/**
 * Deduplicación codiciosa por cobertura de partidas: evita mostrar 3 tarjetas
 * separadas para las mismas 8 derrotas (ej. Arena + Cerrados + Fast Castle).
 */
function deduplicateFindings(passing, direction, maxCount = 3) {
  // Ordenar por combinación de impacto y nitidez de efecto (lift),
  // priorizando factores específicos (Tier 1) sobre contenedores triviales.
  const sorted = [...passing].sort((a, b) => {
    const scoreA = (Math.abs(a.impact) * 0.65 + Math.abs(a.lift) * 0.35) * (a.tier === 1 ? 1.15 : 1.0);
    const scoreB = (Math.abs(b.impact) * 0.65 + Math.abs(b.lift) * 0.35) * (b.tier === 1 ? 1.15 : 1.0);
    return scoreB - scoreA || (a.qValue - b.qValue);
  });

  const selected = [];
  for (const cand of sorted) {
    if (selected.length >= maxCount) break;
    const candSet = cand.targetIds || new Set();
    let suppressed = false;

    for (const kept of selected) {
      const keptSet = kept.targetIds || new Set();
      if (!candSet.size || !keptSet.size) continue;
      let inter = 0;
      for (const id of candSet) {
        if (keptSet.has(id)) inter += 1;
      }
      const union = candSet.size + keptSet.size - inter;
      const jaccard = union > 0 ? inter / union : 0;
      const minLen = Math.min(candSet.size, keptSet.size);
      const containment = minLen > 0 ? inter / minLen : 0;
      const sameGeoFamily = (cand.dimension === 'map' && kept.dimension === 'openness') ||
        (cand.dimension === 'openness' && kept.dimension === 'map');

      // Misma familia geográfica (ej. Arena ↔ Cerrados): colapsar por contención (>0.75)
      // Entre dimensiones distintas (ej. Arena ↔ FC ↔ 30-40m): colapsar por Jaccard (>0.72),
      // evitando que un contenedor global (ej. Arabia 90% de tus partidas) tape un patrón táctico nítido.
      if ((sameGeoFamily && containment > 0.75) || jaccard > 0.72) {
        if (!kept.secondaryTags.includes(cand.shortTag) && kept.secondaryTags.length < 2 && cand.shortTag !== kept.shortTag) {
          kept.secondaryTags.push(cand.shortTag);
        }
        suppressed = true;
        break;
      }
      if (jaccard >= 0.45 && Array.isArray(cand.civRows)) {
        // Chequeo residual: verificar si el patrón sobrevive fuera de las partidas ya explicadas
        const residual = cand.civRows.filter((r) => !keptSet.has(r.matchId));
        const sharperSubCause = Math.abs(cand.lift) > Math.abs(kept.lift) + 0.08 && candSet.size < keptSet.size;
        if (!sharperSubCause) {
          if (residual.length < 2) {
            suppressed = true;
            break;
          }
          const resWr = residual.filter((r) => r.won).length / residual.length;
          const refWr = cand.refRate ?? 0.5;
          const sameDir = direction === 'loss' ? (resWr < refWr - 0.05) : (resWr > refWr + 0.05);
          if (!sameDir) {
            suppressed = true;
            break;
          }
        }
      }
    }

    if (!suppressed) {
      selected.push({ ...cand, secondaryTags: [...(cand.secondaryTags || [])] });
    }
  }
  return selected;
}

/**
 * Diagnóstico completo de una civilización contra el propio baseline del jugador
 * en el mismo modo de juego.
 */
function analyzeCivPerformance({
  targetCiv,
  modeId = 'rm_1v1',
  matches = [],
  allTimeCivStat = null,
  allTimeModeCivs = [],
} = {}) {
  const slug = civSlug(targetCiv) || String(targetCiv || '').trim().toLowerCase();
  const displayName = String(targetCiv || '').trim() || slug;
  if (!slug) {
    return { ok: false, error: 'Civilización inválida.' };
  }

  const isTeam = String(modeId).includes('team');
  const phaseBuckets = isTeam ? PHASE_BUCKETS_TEAM : PHASE_BUCKETS_1V1;

  // Filtrar partidas con resultado confirmado
  const resolved = (Array.isArray(matches) ? matches : []).filter((m) => m && typeof m.won === 'boolean' && m.civ);
  const civAll = resolved.filter((m) => (m.civSlug || civSlug(m.civ)) === slug);
  const otherAll = resolved.filter((m) => (m.civSlug || civSlug(m.civ)) !== slug);

  // Separar early resigns / dodges (<5:00 in-game) de las partidas tácticas
  const isValidTactical = (m) => !(Number.isFinite(m.durationGameSec) && m.durationGameSec > 0 && m.durationGameSec < EARLY_RESIGN_GAME_SEC);
  const civMatches = civAll.filter(isValidTactical);
  const otherMatches = otherAll.filter(isValidTactical);
  const earlyResigns = civAll.length - civMatches.length;

  const nC = civMatches.length;
  const wC = civMatches.filter((m) => m.won).length;
  const lC = nC - wC;
  const rawWr = nC > 0 ? wC / nC : null;

  const nOther = otherMatches.length;
  const wOther = otherMatches.filter((m) => m.won).length;
  const lOther = nOther - wOther;
  const rawBaselineWr = nOther > 0 ? wOther / nOther : 0.5;

  // 1. Baseline ajustado por ELO esperado (E_i)
  const expOther = otherMatches.map((m) => eloExpectancy(m.myElo, m.oppElo));
  const avgExpOther = expOther.length ? expOther.reduce((a, b) => a + b, 0) / expOther.length : 0.5;
  const residualOther = nOther >= 5
    ? otherMatches.reduce((acc, m, idx) => acc + ((m.won ? 1 : 0) - expOther[idx]), 0) / nOther
    : 0;

  const expCiv = civMatches.map((m) => eloExpectancy(m.myElo, m.oppElo));
  const avgExpCiv = expCiv.length ? expCiv.reduce((a, b) => a + b, 0) / expCiv.length : 0.5;
  const expectedBaseline = clamp(avgExpCiv + residualOther, 0.05, 0.95);
  const eloGapEffect = avgExpCiv - avgExpOther; // negativo = enfrentó rivales de mayor ELO

  // 2. Empirical Bayes shrinkage (DerSimonian-Laird k ∈ [10, 24])
  const priorK = estimatePriorStrength(allTimeModeCivs, rawBaselineWr);
  const alpha = wC + priorK * expectedBaseline;
  const beta = lC + priorK * (1 - expectedBaseline);
  const ci = betaCredibleInterval90(alpha, beta);
  const shrunkWr = ci.mean;
  const deltaWr = shrunkWr - expectedBaseline;
  const overallFisherP = nC > 0 && nOther > 0
    ? fisherExactTwoSided(wC, lC, wOther, lOther)
    : binomialExactTwoSided(wC, nC, expectedBaseline);

  // 3. Contexto All-Time vs Ventana Analizada (detectar giro reciente)
  const allTimeGames = Number(allTimeCivStat?.games) || (Number(allTimeCivStat?.wins || 0) + Number(allTimeCivStat?.losses || 0));
  const allTimeWins = Number(allTimeCivStat?.wins) || 0;
  const allTimeLosses = Number(allTimeCivStat?.losses) || Math.max(0, allTimeGames - allTimeWins);
  const allTimeWr = allTimeGames > 0 ? allTimeWins / allTimeGames : null;

  let historicalDivergence = null;
  if (nC >= 6 && allTimeGames >= nC + 6 && allTimeWr != null && rawWr != null) {
    const priorW = Math.max(0, allTimeWins - wC);
    const priorL = Math.max(0, allTimeLosses - lC);
    if (priorW + priorL >= 6) {
      const pDiv = fisherExactTwoSided(wC, lC, priorW, priorL);
      const diffPp = Math.round((rawWr - allTimeWr) * 100);
      if (pDiv < 0.05 && Math.abs(diffPp) >= 15) {
        historicalDivergence = {
          direction: diffPp > 0 ? 'up' : 'down',
          label: diffPp > 0 ? 'En alza reciente' : 'Bache reciente',
          detail: diffPp > 0
            ? `Reciente: ${Math.round(rawWr * 100)}% (${wC}V-${lC}D) vs tu histórico ${Math.round(allTimeWr * 100)}% (${allTimeGames} pj).`
            : `Reciente: ${Math.round(rawWr * 100)}% (${wC}V-${lC}D) vs tu histórico ${Math.round(allTimeWr * 100)}% (${allTimeGames} pj).`,
          pValue: pDiv,
        };
      }
    }
  }

  // Nivel de confianza por tamaño de muestra
  const confidence = nC < MIN_DIAGNOSIS_GAMES
    ? 'insufficient'
    : nC < 10
      ? 'low'
      : nC < 20
        ? 'medium'
        : 'high';
  const confidenceLabel = {
    insufficient: 'Muestra chica',
    low: 'Tendencia inicial',
    medium: 'Señal moderada',
    high: 'Patrón sólido',
  }[confidence];

  // Desgloses siempre disponibles para los chips [ Mapas | Fases | Aperturas | Ritmo ]
  const breakdowns = buildBreakdowns(civMatches, otherMatches, phaseBuckets);

  // Guardrail de muestra chica (< 5 partidas): CERO causas alucinadas
  if (nC < MIN_DIAGNOSIS_GAMES) {
    return {
      ok: true,
      civ: displayName,
      civSlug: slug,
      modeId,
      status: 'insufficient',
      verdict: 'sample',
      verdictLabel: 'Muestra chica',
      confidence,
      confidenceLabel,
      sample: {
        games: nC,
        wins: wC,
        losses: lC,
        earlyResigns,
        needed: MIN_DIAGNOSIS_GAMES,
        rawWinRate: rawWr != null ? Math.round(rawWr * 100) : null,
        shrunkWinRate: Math.round(shrunkWr * 100),
        baselineWinRate: Math.round(expectedBaseline * 100),
        deltaPp: Math.round(deltaWr * 100),
        ci90: [Math.round(ci.low * 100), Math.round(ci.high * 100)],
        pValue: round1(overallFisherP * 100) != null ? Number(overallFisherP.toFixed(4)) : 1,
        priorK,
        allTime: allTimeGames > 0
          ? { games: allTimeGames, wins: allTimeWins, losses: allTimeLosses, winRate: Math.round(allTimeWr * 100) }
          : null,
      },
      historicalDivergence,
      contextAlerts: [],
      findings: [],
      breakdowns,
      summaryLine: `Muestra chica (${nC} ${nC === 1 ? 'partida' : 'partidas'} con detalle). Se necesitan al menos ${MIN_DIAGNOSIS_GAMES} para detectar patrones.`,
    };
  }

  // 4. Generación de hipótesis candidatas (pre-podadas antes del test BH-FDR)
  const candidates = [];
  const contextAlerts = [];

  const targetMatchIds = (rows, sign) => new Set(
    rows.filter((r) => (sign < 0 ? !r.won : r.won)).map((r) => r.matchId),
  );

  // 4A. Contexto ELO: brecha de rival + régimen local de ELO (mediana móvil 25 pj)
  const eloRowsC = civMatches.filter((m) => Number.isFinite(m.myElo) && Number.isFinite(m.oppElo));
  if (eloRowsC.length >= 5 && Math.abs(eloGapEffect) >= 0.06) {
    const avgDiff = Math.round(eloRowsC.reduce((s, m) => s + (m.oppElo - m.myElo), 0) / eloRowsC.length);
    contextAlerts.push({
      id: 'elo-opponent-gap',
      tier: 1,
      tone: eloGapEffect < 0 ? 'warn' : 'info',
      title: eloGapEffect < 0 ? 'Rivales de mayor ELO' : 'Rivales de menor ELO',
      metric: `${avgDiff > 0 ? '+' : ''}${avgDiff} ELO rival`,
      detail: eloGapEffect < 0
        ? `Con ${displayName} enfrentaste rivales +${Math.abs(avgDiff)} ELO arriba en promedio (esperado ${Math.round(avgExpCiv * 100)}% WR).`
        : `Con ${displayName} enfrentaste rivales ${Math.abs(avgDiff)} ELO abajo en promedio (esperado ${Math.round(avgExpCiv * 100)}% WR).`,
    });
  }

  // Régimen local de ELO (elimina sesgo de subida histórica a largo plazo)
  const chronoAll = [...resolved].filter((m) => Number.isFinite(m.myElo)).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  const localEloDeltas = [];
  for (let i = 0; i < chronoAll.length; i += 1) {
    const m = chronoAll[i];
    if ((m.civSlug || civSlug(m.civ)) !== slug) continue;
    const windowStart = Math.max(0, i - 25);
    const priorElos = chronoAll.slice(windowStart, i).map((x) => x.myElo);
    if (priorElos.length >= 8) {
      const med = median(priorElos);
      if (med != null) localEloDeltas.push(m.myElo - med);
    }
  }
  const medLocalSpike = localEloDeltas.length >= 5 ? median(localEloDeltas) : null;
  if (medLocalSpike != null && medLocalSpike >= 60) {
    contextAlerts.push({
      id: 'elo-local-peak',
      tier: 1,
      tone: 'warn',
      title: 'Jugada en pico local de ELO',
      metric: `+${Math.round(medLocalSpike)} ELO`,
      detail: `Pickeaste ${displayName} +${Math.round(medLocalSpike)} ELO sobre tu mediana reciente al momento de jugarla.`,
    });
  }

  // 4B. Helper categórico con descomposición Kitagawa (Performance DiD + Mix Exposure)
  const testCategoricalDimension = ({
    dimId,
    tier = 1,
    minCivCount = 4,
    allowMixEffect = false,
    filterFn = () => true,
    keyFn,
    labelFn,
    buildCopy,
  }) => {
    const scopedC = civMatches.filter(filterFn);
    const scopedO = otherMatches.filter(filterFn);
    if (scopedC.length < minCivCount) return;

    const groupsC = new Map();
    const groupsO = new Map();
    for (const m of scopedC) {
      const k = keyFn(m);
      if (!k) continue;
      if (!groupsC.has(k)) groupsC.set(k, { key: k, label: labelFn(m, k), rows: [] });
      groupsC.get(k).rows.push(m);
    }
    for (const m of scopedO) {
      const k = keyFn(m);
      if (!k) continue;
      if (!groupsO.has(k)) groupsO.set(k, { key: k, rows: [] });
      groupsO.get(k).rows.push(m);
    }

    const baseWrScoped = scopedO.length >= 5
      ? scopedO.filter((m) => m.won).length / scopedO.length
      : rawBaselineWr;

    for (const [k, grpC] of groupsC.entries()) {
      const nf = grpC.rows.length;
      if (nf < minCivCount) continue;
      const wf = grpC.rows.filter((m) => m.won).length;
      const lf = nf - wf;
      const grpO = groupsO.get(k);
      const no = grpO ? grpO.rows.length : 0;
      const wo = grpO ? grpO.rows.filter((m) => m.won).length : 0;
      const lo = no - wo;

      // Double-shrunk subgroup baseline + civ rate
      const pRef = (wo + 6 * baseWrScoped) / (no + 6);
      const pCivHat = (wf + 8 * pRef) / (nf + 8);
      const lift = pCivHat - pRef;
      const wCShare = nf / nC;
      const wOShare = scopedO.length > 0 ? no / scopedO.length : 0;
      // Si el jugador jugó >=95% de TODAS sus partidas (con C y con ~C) en un único
      // valor de mapa/tipo de mapa, señalar ese mapa no explica nada nuevo (solo repite el WR global).
      if ((dimId === 'map' || dimId === 'openness') && wCShare >= 0.95 && wOShare >= 0.95) {
        continue;
      }
      const impactPerf = wCShare * lift;

      const pValPerf = no >= 5
        ? fisherExactTwoSided(wf, lf, wo, lo)
        : binomialExactTwoSided(wf, nf, pRef);

      const mixImpact = (wCShare - wOShare) * (pRef - baseWrScoped);
      const pValMix = allowMixEffect && scopedO.length >= 10
        ? fisherExactTwoSided(nf, scopedC.length - nf, no, scopedO.length - no)
        : 1;

      // ¿Simpson's Paradox / Map-Mix? El jugador pierde igual con TODAS las civs en este contexto
      // y simplemente juega esta civ mucho más acá.
      const isPureMix = allowMixEffect &&
        no >= 5 &&
        Math.abs(mixImpact) >= 0.04 &&
        pValMix <= 0.05 &&
        Math.abs(lift) < 0.08 &&
        Math.abs(pRef - baseWrScoped) >= 0.10;

      if (isPureMix) {
        const sign = mixImpact < 0 ? -1 : 1;
        candidates.push({
          id: `${dimId}:mix:${k}`,
          dimension: dimId,
          kind: 'mix',
          tier: 1,
          sign,
          pValue: pValMix,
          lift: pRef - baseWrScoped,
          impact: mixImpact,
          refRate: baseWrScoped,
          shortTag: grpC.label,
          civRows: grpC.rows,
          targetIds: targetMatchIds(grpC.rows, sign),
          ...buildCopy({
            kind: 'mix',
            label: grpC.label,
            wf,
            lf,
            nf,
            rawWr: wf / nf,
            pRef,
            baseWr: baseWrScoped,
            sharePct: Math.round(wCShare * 100),
            otherSharePct: Math.round(wOShare * 100),
            sign,
          }),
        });
        continue;
      }

      // Efecto propio de la civ (Performance DiD)
      const sign = lift < 0 ? -1 : 1;
      candidates.push({
        id: `${dimId}:perf:${k}`,
        dimension: dimId,
        kind: 'perf',
        tier,
        sign,
        pValue: pValPerf,
        lift,
        impact: impactPerf,
        refRate: pRef,
        shortTag: grpC.label,
        civRows: grpC.rows,
        targetIds: targetMatchIds(grpC.rows, sign),
        ...buildCopy({
          kind: 'perf',
          label: grpC.label,
          wf,
          lf,
          nf,
          rawWr: wf / nf,
          pRef,
          baseWr: baseWrScoped,
          no,
          wo,
          sharePct: Math.round(wCShare * 100),
          otherSharePct: Math.round(wOShare * 100),
          sign,
        }),
      });
    }
  };

  // Tier 1A: Tipo de mapa (Abiertos / Cerrados / Híbridos / Agua)
  testCategoricalDimension({
    dimId: 'openness',
    tier: 1,
    minCivCount: 4,
    allowMixEffect: true,
    keyFn: (m) => m.openness,
    labelFn: (_m, k) => OPENNESS_LABELS_ES[k] || k,
    buildCopy: ({ kind, label, wf, lf, rawWr, pRef, sharePct, otherSharePct, sign }) => {
      const wrP = Math.round(rawWr * 100);
      const refP = Math.round(pRef * 100);
      if (kind === 'mix') {
        return {
          title: sign < 0 ? `Te penaliza ${label.toLowerCase()}, no la civ` : `Jugada en tu terreno fuerte (${label.toLowerCase()})`,
          metric: `${sharePct}% de tus pj`,
          detail: `${sharePct}% de tus partidas con ${displayName} son en ${label.toLowerCase()} (vs ${otherSharePct}% con otras), donde tu WR habitual es ${refP}%.`,
          takeaway: sign < 0 ? `Probala fuera de ${label.toLowerCase()} antes de descartarla.` : null,
        };
      }
      return {
        title: sign < 0 ? `Sufre en ${label.toLowerCase()}` : `Rinde fuerte en ${label.toLowerCase()}`,
        metric: `${wrP}% WR (${wf}V-${lf}D)`,
        detail: `${wrP}% en ${label.toLowerCase()} (${wf}V-${lf}D) vs tu ${refP}% habitual en el mismo tipo de mapa.`,
        takeaway: sign < 0 ? `Evitala en ${label.toLowerCase()} o ajustá el plan temprano.` : `Priorizala cuando salga un mapa de este tipo.`,
      };
    },
  });

  // Tier 1A-2: Mapa específico (Arabia, Arena, Nomad, etc.)
  testCategoricalDimension({
    dimId: 'map',
    tier: 1,
    minCivCount: 4,
    allowMixEffect: true,
    keyFn: (m) => m.mapKey,
    labelFn: (m) => m.mapName || m.mapKey,
    buildCopy: ({ kind, label, wf, lf, rawWr, pRef, sharePct, otherSharePct, sign }) => {
      const wrP = Math.round(rawWr * 100);
      const refP = Math.round(pRef * 100);
      if (kind === 'mix') {
        return {
          title: sign < 0 ? `Te penaliza ${label}, no la civ` : `Concentrada en ${label}`,
          metric: `${sharePct}% en ${label}`,
          detail: `${sharePct}% de tus partidas con ${displayName} fueron en ${label} (vs ${otherSharePct}% en el resto), mapa donde tu media es ${refP}%.`,
          takeaway: sign < 0 ? `El bajo WR refleja tu historial en ${label}, no un fallo de ${displayName}.` : null,
        };
      }
      return {
        title: sign < 0 ? `Fuga en ${label}` : `Fortaleza en ${label}`,
        metric: `${wrP}% WR (${wf}V-${lf}D)`,
        detail: `${wrP}% en ${label} (${wf}V-${lf}D) vs tu ${refP}% habitual en ese mapa.`,
        takeaway: sign < 0 ? `Evitá pickear ${displayName} en ${label}.` : `Excelente pick fijo para ${label}.`,
      };
    },
  });

  // Tier 1C: Mi apertura (SOLO mapas abiertos/semi-abiertos para evitar ruido de Arena/FC)
  testCategoricalDimension({
    dimId: 'myOpening',
    tier: 1,
    minCivCount: 4,
    filterFn: (m) => !m.openness || OPEN_MAP_KINDS.has(m.openness),
    keyFn: (m) => m.myOpening,
    labelFn: (m) => m.myOpening,
    buildCopy: ({ label, wf, lf, rawWr, pRef, baseWr, no, sign }) => {
      const wrP = Math.round(rawWr * 100);
      const refP = Math.round(pRef * 100);
      const globalHole = sign < 0 && no >= 5 && pRef <= baseWr - 0.10;
      return {
        title: sign < 0
          ? (globalHole ? `Te cuesta abrir ${label} en general` : `Apertura ${label} incómoda con esta civ`)
          : `Apertura ${label} muy efectiva`,
        metric: `${wrP}% WR (${wf}V-${lf}D)`,
        detail: `${wrP}% abriendo ${label} (${wf}V-${lf}D) vs tu ${refP}% habitual con esa apertura.`,
        takeaway: sign < 0
          ? (globalHole ? `Pulí el build order de ${label}: también baja tu WR con otras civs.` : `Probá otra apertura en mapas abiertos con ${displayName}.`)
          : `Mantené ${label} como plan principal con ${displayName}.`,
      };
    },
  });

  // Tier 1C-2: Apertura del rival (qué presión rival te castiga)
  testCategoricalDimension({
    dimId: 'oppOpening',
    tier: 1,
    minCivCount: 4,
    filterFn: (m) => !m.openness || OPEN_MAP_KINDS.has(m.openness),
    keyFn: (m) => m.oppOpening,
    labelFn: (m) => m.oppOpening,
    buildCopy: ({ label, wf, lf, rawWr, pRef, sign }) => {
      const wrP = Math.round(rawWr * 100);
      const refP = Math.round(pRef * 100);
      const isFc = /fast\s*castle/i.test(label);
      return {
        title: sign < 0
          ? (isFc ? 'Dejás boomear gratis el Fast Castle' : `Te castigan los ${label}`)
          : `Controlás bien ${label} rival`,
        metric: `${wrP}% WR (${wf}V-${lf}D)`,
        detail: `${wrP}% cuando el rival abre ${label} (${wf}V-${lf}D) vs tu ${refP}% habitual ante esa apertura.`,
        takeaway: sign < 0
          ? (isFc ? 'Presioná oro/madera en Feudal o igualá el timing a Castillos.' : `Explorá temprano para cerrar recursos y preparar counter ante ${label}.`)
          : null,
      };
    },
  });

  // Tier 1D: Rival concreto (Némesis / Matchup cómodo — min 5 partidas, sin espejos)
  testCategoricalDimension({
    dimId: 'oppCiv',
    tier: 1,
    minCivCount: 5,
    filterFn: (m) => Boolean(m.oppCivSlug) && m.oppCivSlug !== slug,
    keyFn: (m) => m.oppCivSlug,
    labelFn: (m) => m.oppCiv,
    buildCopy: ({ label, wf, lf, rawWr, pRef, sign }) => {
      const wrP = Math.round(rawWr * 100);
      const refP = Math.round(pRef * 100);
      return {
        title: sign < 0 ? `Némesis: vs ${label}` : `Matchup cómodo: vs ${label}`,
        metric: `${wrP}% WR (${wf}V-${lf}D)`,
        detail: `${wf}V-${lf}D contra ${label} (${wrP}%) frente a tu ${refP}% habitual ante esa civ.`,
        takeaway: sign < 0 ? `Prepará transición específica contra ${label} antes de su pico.` : null,
      };
    },
  });

  // 4C. Tier 2A: Hazard condicional por fase de duración (tiempo IN-GAME 1.7x)
  // Evita el sesgo de supervivencia: divide por las partidas que LLEGARON a esa fase (R_b).
  const durC = civMatches.filter((m) => Number.isFinite(m.durationGameSec) && m.durationGameSec >= EARLY_RESIGN_GAME_SEC);
  const durO = otherMatches.filter((m) => Number.isFinite(m.durationGameSec) && m.durationGameSec >= EARLY_RESIGN_GAME_SEC);
  if (durC.length >= 5 && durO.length >= 10) {
    for (const b of phaseBuckets) {
      const riskC = durC.filter((m) => m.durationGameSec >= b.min);
      const riskO = durO.filter((m) => m.durationGameSec >= b.min);
      const inC = riskC.filter((m) => m.durationGameSec < b.max);
      const inO = riskO.filter((m) => m.durationGameSec < b.max);
      if (inC.length < 4 || riskC.length < 4 || riskO.length < 6) continue;

      const lossC = inC.filter((m) => !m.won).length;
      const winC = inC.length - lossC;
      const lossO = inO.filter((m) => !m.won).length;
      const winO = inO.length - lossO;

      // Hazard de derrota (morir en esta fase dado que seguías vivo)
      const hLossRef = (lossO + 6 * 0.25) / (riskO.length + 6);
      const hLossC = (lossC + 8 * hLossRef) / (riskC.length + 8);
      const lossLift = hLossC - hLossRef; // positivo = muere MÁS en esta fase
      const pLossHaz = fisherExactTwoSided(lossC, riskC.length - lossC, lossO, riskO.length - lossO);

      // Hazard de victoria (cerrar ganando en esta fase dado que seguías vivo)
      const hWinRef = (winO + 6 * 0.25) / (riskO.length + 6);
      const hWinC = (winC + 8 * hWinRef) / (riskC.length + 8);
      const winLift = hWinC - hWinRef;
      const pWinHaz = fisherExactTwoSided(winC, riskC.length - winC, winO, riskO.length - winO);

      const useLoss = Math.abs(lossLift) >= Math.abs(winLift);
      const sign = useLoss ? -1 : 1;
      const lift = useLoss ? -lossLift : winLift;
      const pVal = useLoss ? pLossHaz : pWinHaz;
      const impact = (riskC.length / nC) * lift;
      const wrInBucket = pct(winC, inC.length);
      const wrBaseBucket = inO.length >= 4 ? pct(winO, inO.length) : Math.round(rawBaselineWr * 100);

      const phaseTitle = sign < 0
        ? (b.id === 'early' ? `Vulnerable en ${b.label} (${b.sub})`
          : b.id === 'late' ? `Se escapa en ${b.label} (${b.sub})`
            : `Pierde el tramo ${b.label}`)
        : (b.id === 'early' ? `Letal en ${b.label} (${b.sub})`
          : b.id === 'late' ? `Domina en ${b.label} (${b.sub})`
            : `Pico fuerte en ${b.label}`);

      candidates.push({
        id: `phase:${b.id}`,
        dimension: 'phase',
        kind: 'hazard',
        tier: 2,
        sign,
        pValue: pVal,
        lift,
        impact,
        refRate: inO.length >= 4 ? winO / inO.length : rawBaselineWr,
        shortTag: `${b.label}`,
        civRows: inC,
        targetIds: targetMatchIds(inC, sign),
        title: phaseTitle,
        metric: `${wrInBucket}% WR (${winC}V-${lossC}D)`,
        detail: sign < 0
          ? `En partidas de ${b.label} (reloj juego): ${wrInBucket}% WR (${winC}V-${lossC}D) vs tu ${wrBaseBucket}% habitual.`
          : `En partidas de ${b.label} (reloj juego): ${wrInBucket}% WR (${winC}V-${lossC}D) vs tu ${wrBaseBucket}% habitual.`,
        takeaway: sign < 0
          ? (b.id === 'early' ? 'Asegurá muros y defensa temprana para llegar entero a Castillos.'
            : b.id === 'late' ? 'Buscá cerrar en Castillos / Early Imp antes de que se seque el oro.'
              : 'Revisá tu transición de Castillos a Imperial con esta civ.')
          : `Tu mejor ventana con ${displayName} está en ${b.label}.`,
      });
    }
  }

  // 4D. Tier 2B: Residuales emparejados por resultado (eAPM + telemetría local)
  // NUNCA compara C_derrotas vs C_victorias; compara C_derrotas vs ~C_derrotas y C_victorias vs ~C_victorias.
  const testOutcomeMatchedMetric = ({
    id,
    minCiv = 4,
    minShift,
    higherIsBetter = true,
    filterFn = () => true,
    valueFn,
    buildCopy,
  }) => {
    const cRows = civMatches.filter((m) => filterFn(m) && Number.isFinite(valueFn(m)));
    const oRows = otherMatches.filter((m) => filterFn(m) && Number.isFinite(valueFn(m)));
    if (cRows.length < minCiv || oRows.length < 8) return;

    const cLossVals = cRows.filter((m) => !m.won).map(valueFn);
    const oLossVals = oRows.filter((m) => !m.won).map(valueFn);
    const cWinVals = cRows.filter((m) => m.won).map(valueFn);
    const oWinVals = oRows.filter((m) => m.won).map(valueFn);

    // Calcular delta emparejado (promedio ponderado de derrotas-vs-derrotas y victorias-vs-victorias)
    const parts = [];
    if (cLossVals.length >= 3 && oLossVals.length >= 4) {
      parts.push({ w: cLossVals.length, d: median(cLossVals) - median(oLossVals), p: mannWhitneyP(cLossVals, oLossVals) });
    }
    if (cWinVals.length >= 3 && oWinVals.length >= 4) {
      parts.push({ w: cWinVals.length, d: median(cWinVals) - median(oWinVals), p: mannWhitneyP(cWinVals, oWinVals) });
    }
    if (!parts.length) return;

    const totalW = parts.reduce((s, x) => s + x.w, 0);
    const matchedDelta = parts.reduce((s, x) => s + x.w * x.d, 0) / totalW;
    // Combinar p-valores de forma conservadora (el más alto si hay dos con dirección consistente, o mínimo si solo uno)
    const consistent = parts.length === 1 || Math.sign(parts[0].d) === Math.sign(parts[1].d);
    if (!consistent || Math.abs(matchedDelta) < minShift) return;
    const pVal = parts.length === 2 ? Math.max(parts[0].p, parts[1].p) : parts[0].p;
    const sign = higherIsBetter ? (matchedDelta > 0 ? 1 : -1) : (matchedDelta < 0 ? 1 : -1);
    const cMed = median(cRows.map(valueFn));
    const oMed = median(oRows.map(valueFn));

    candidates.push({
      id,
      dimension: 'execution',
      kind: 'matched-metric',
      tier: 2,
      sign,
      pValue: pVal,
      lift: sign * Math.min(0.25, Math.abs(matchedDelta) / (minShift * 3)),
      impact: sign * 0.06,
      refRate: rawBaselineWr,
      shortTag: id,
      civRows: cRows,
      targetIds: targetMatchIds(cRows, sign),
      ...buildCopy({ cMed, oMed, matchedDelta, count: cRows.length, sign }),
    });
  };

  // Ritmo eAPM emparejado por resultado (solo si caída/alza real >= 6 eAPM)
  testOutcomeMatchedMetric({
    id: 'exec:eapm',
    minCiv: 5,
    minShift: 6,
    higherIsBetter: true,
    valueFn: (m) => m.myEapm,
    buildCopy: ({ cMed, oMed, matchedDelta, count, sign }) => ({
      shortTag: 'Ritmo eAPM',
      title: sign < 0 ? 'Menor ritmo eAPM con esta civ' : 'Mayor ritmo eAPM con esta civ',
      metric: `${round1(cMed)} eAPM (${matchedDelta > 0 ? '+' : ''}${round1(matchedDelta)})`,
      detail: `Mediana de ${round1(cMed)} eAPM en ${count} partidas vs ${round1(oMed)} en partidas comparables con otras civs.`,
      takeaway: sign < 0 ? 'Probablemente la civ te exige micro/gestión menos automática que tus mains.' : null,
    }),
  });

  // Telemetría local: Uptime Feudal (solo mapas abiertos, excl. Malayos/Chinos)
  if (!['malay', 'chinese'].includes(slug)) {
    testOutcomeMatchedMetric({
      id: 'exec:feudal',
      minCiv: 4,
      minShift: 25,
      higherIsBetter: false,
      filterFn: (m) => (!m.openness || OPEN_MAP_KINDS.has(m.openness)) && Number.isFinite(m.replay?.feudalSeconds),
      valueFn: (m) => m.replay?.feudalSeconds,
      buildCopy: ({ cMed, oMed, matchedDelta, count, sign }) => {
        const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
        return {
          shortTag: 'Uptime Feudal',
          title: sign < 0 ? 'Subida a Feudal más lenta' : 'Subida a Feudal más limpia',
          metric: `${fmt(cMed)} (${matchedDelta > 0 ? '+' : ''}${Math.round(matchedDelta)}s)`,
          detail: `Feudal en ${fmt(cMed)} (${count} replays) vs ${fmt(oMed)} habitual en mapas abiertos.`,
          takeaway: sign < 0 ? `Revisá los primeros 15 aldeanos del build order con ${displayName}.` : null,
        };
      },
    });
  }

  // Telemetría local: Herrería relevante en partidas >= Castillos
  testOutcomeMatchedMetric({
    id: 'exec:blacksmith',
    minCiv: 4,
    minShift: 0.15,
    higherIsBetter: true,
    filterFn: (m) => Number.isFinite(m.replay?.castleSeconds) && Number.isFinite(m.replay?.relevantBsRatio),
    valueFn: (m) => m.replay?.relevantBsRatio,
    buildCopy: ({ cMed, oMed, count, sign }) => ({
      shortTag: 'Herrería',
      title: sign < 0 ? 'Faltan mejoras clave de Herrería' : 'Herrería muy consistente',
      metric: `${Math.round(cMed * 100)}% mejoras`,
      detail: `Cubrís ${Math.round(cMed * 100)}% de las mejoras clave en ${count} replays vs ${Math.round(oMed * 100)}% habitual.`,
      takeaway: sign < 0 ? 'Priorizá armadura o ataque clave antes de tomar peleas de Castillos.' : null,
    }),
  });

  // Telemetría local: Mercado de emergencia (excluir Sarracenos)
  if (slug !== 'saracens') {
    testOutcomeMatchedMetric({
      id: 'exec:market',
      minCiv: 4,
      minShift: 5,
      higherIsBetter: false,
      filterFn: (m) => Number.isFinite(m.replay?.marketOps),
      valueFn: (m) => m.replay?.marketOps,
      buildCopy: ({ cMed, oMed, count, sign }) => ({
        shortTag: 'Mercado',
        title: sign < 0 ? 'Uso intensivo de Mercado' : 'Economía balanceada sin Mercado',
        metric: `${Math.round(cMed)} ops/pj`,
        detail: `${Math.round(cMed)} operaciones de Mercado por partida (${count} replays) vs ${Math.round(oMed)} habitual.`,
        takeaway: sign < 0 ? `Ajustá tu distribución de aldeanos al bonus económico de ${displayName}.` : null,
      }),
    });
  }

  // 5. Aplicar Benjamini-Hochberg FDR a todos los candidatos probados
  applyBenjaminiHochberg(candidates);

  const fdrThreshold = nC < 10 ? 0.20 : nC < 20 ? 0.15 : 0.12;
  const passingAll = candidates.filter((c) => {
    if (c.qValue > fdrThreshold) return false;
    const minLift = c.kind === 'mix' ? 0.08 : 0.08;
    const minImp = c.kind === 'mix' ? 0.04 : 0.025;
    return Math.abs(c.lift) >= minLift && Math.abs(c.impact) >= minImp;
  });

  // Determinar veredicto general
  let verdict = 'balanced';
  let verdictLabel = 'Equilibrada';
  if (deltaWr >= 0.05 && (overallFisherP <= 0.20 || deltaWr >= 0.08)) {
    verdict = 'strength';
    verdictLabel = 'Fortaleza';
  } else if (deltaWr <= -0.05 && (overallFisherP <= 0.20 || deltaWr <= -0.08)) {
    verdict = 'weakness';
    verdictLabel = 'Punto débil';
  } else {
    const hasPos = passingAll.some((c) => c.sign > 0);
    const hasNeg = passingAll.some((c) => c.sign < 0);
    if (hasPos && hasNeg) {
      verdict = 'polarized';
      verdictLabel = 'Polarizada';
    }
  }

  // Seleccionar hallazgos alineados con la historia principal (o ambos extremos si es polarizada)
  const maxFindings = nC < 10 ? 2 : nC < 20 ? 3 : 4;
  let finalFindings = [];
  if (verdict === 'weakness') {
    const negs = deduplicateFindings(passingAll.filter((c) => c.sign < 0), 'loss', maxFindings);
    const pos = deduplicateFindings(passingAll.filter((c) => c.sign > 0), 'win', 1);
    finalFindings = [...negs, ...(negs.length < maxFindings ? pos : [])].slice(0, maxFindings);
  } else if (verdict === 'strength') {
    const pos = deduplicateFindings(passingAll.filter((c) => c.sign > 0), 'win', maxFindings);
    const neg = deduplicateFindings(passingAll.filter((c) => c.sign < 0), 'loss', 1);
    finalFindings = [...pos, ...(pos.length < maxFindings ? neg : [])].slice(0, maxFindings);
  } else if (verdict === 'polarized') {
    const bestPos = deduplicateFindings(passingAll.filter((c) => c.sign > 0), 'win', 2);
    const bestNeg = deduplicateFindings(passingAll.filter((c) => c.sign < 0), 'loss', 2);
    finalFindings = [...bestPos, ...bestNeg].slice(0, maxFindings);
  } else {
    finalFindings = deduplicateFindings(passingAll, deltaWr < 0 ? 'loss' : 'win', Math.min(2, maxFindings));
  }

  const cleanFindings = finalFindings.map((f) => ({
    id: f.id,
    dimension: f.dimension,
    kind: f.kind,
    tier: f.tier,
    tone: f.sign < 0 ? 'loss' : 'win',
    title: f.title,
    metric: f.metric,
    detail: f.detail,
    takeaway: f.takeaway || null,
    secondaryTags: f.secondaryTags || [],
    qValue: Number(f.qValue.toFixed(3)),
    pValue: Number(f.pValue.toFixed(4)),
    impactPp: Math.round(f.impact * 100),
  }));

  const deltaPp = Math.round(deltaWr * 100);
  const rawWrPct = Math.round(rawWr * 100);
  const baseWrPct = Math.round(expectedBaseline * 100);
  const summaryLine = verdict === 'weakness'
    ? (cleanFindings.length
      ? `${rawWrPct}% WR (${wC}V-${lC}D) frente a tu ${baseWrPct}% esperado · ${cleanFindings.length} ${cleanFindings.length === 1 ? 'patrón detectado' : 'patrones detectados'}.`
      : `${rawWrPct}% WR (${wC}V-${lC}D) frente a tu ${baseWrPct}% esperado · sin una causa única dominante todavía.`)
    : verdict === 'strength'
      ? (cleanFindings.length
        ? `${rawWrPct}% WR (${wC}V-${lC}D) frente a tu ${baseWrPct}% esperado · ${cleanFindings.length} ${cleanFindings.length === 1 ? 'ventaja clara' : 'ventajas claras'}.`
        : `${rawWrPct}% WR (${wC}V-${lC}D) · rendimiento sólido y parejo en distintos escenarios.`)
      : verdict === 'polarized'
        ? `${rawWrPct}% WR global (${wC}V-${lC}D), pero muy polarizada según el escenario.`
        : `En línea con tu media (${rawWrPct}% en ${nC} pj vs ${baseWrPct}% esperado).`;

  return {
    ok: true,
    civ: displayName,
    civSlug: slug,
    modeId,
    status: 'ready',
    verdict,
    verdictLabel,
    confidence,
    confidenceLabel,
    sample: {
      games: nC,
      wins: wC,
      losses: lC,
      earlyResigns,
      needed: MIN_DIAGNOSIS_GAMES,
      rawWinRate: rawWrPct,
      shrunkWinRate: Math.round(shrunkWr * 100),
      baselineWinRate: baseWrPct,
      deltaPp,
      ci90: [Math.round(ci.low * 100), Math.round(ci.high * 100)],
      pValue: Number(overallFisherP.toFixed(4)),
      priorK,
      testedHypotheses: candidates.length,
      allTime: allTimeGames > 0
        ? { games: allTimeGames, wins: allTimeWins, losses: allTimeLosses, winRate: Math.round(allTimeWr * 100) }
        : null,
    },
    historicalDivergence,
    contextAlerts,
    findings: cleanFindings,
    breakdowns,
    summaryLine,
  };
}

/** Construye los mini-desgloses [ Mapas | Fases | Aperturas | Ritmo ] de la civ. */
function buildBreakdowns(civMatches, otherMatches, phaseBuckets) {
  const mapAgg = new Map();
  const opAgg = new Map();
  for (const m of civMatches) {
    if (m.mapName) {
      const k = m.mapKey || mapKey(m.mapName);
      const cur = mapAgg.get(k) || { key: k, label: m.mapName, games: 0, wins: 0, losses: 0 };
      cur.games += 1;
      if (m.won) cur.wins += 1;
      else cur.losses += 1;
      mapAgg.set(k, cur);
    }
    if (m.myOpening) {
      const cur = opAgg.get(m.myOpening) || { key: m.myOpening, label: m.myOpening, games: 0, wins: 0, losses: 0 };
      cur.games += 1;
      if (m.won) cur.wins += 1;
      else cur.losses += 1;
      opAgg.set(m.myOpening, cur);
    }
  }

  const maps = [...mapAgg.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, 5)
    .map((x) => ({ ...x, winRate: pct(x.wins, x.games) }));

  const openings = [...opAgg.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, 4)
    .map((x) => ({ ...x, winRate: pct(x.wins, x.games) }));

  const phases = phaseBuckets.map((b) => {
    const rows = civMatches.filter((m) => Number.isFinite(m.durationGameSec) && m.durationGameSec >= b.min && m.durationGameSec < b.max);
    const wins = rows.filter((m) => m.won).length;
    const losses = rows.length - wins;
    return { id: b.id, label: b.label, sub: b.sub, games: rows.length, wins, losses, winRate: pct(wins, rows.length) };
  }).filter((b) => b.games > 0);

  const civEapms = civMatches.map((m) => m.myEapm).filter(Number.isFinite);
  const otherEapms = otherMatches.map((m) => m.myEapm).filter(Number.isFinite);
  const civMedEapm = median(civEapms);
  const otherMedEapm = median(otherEapms);
  const outpaced = civMatches.filter((m) => Number.isFinite(m.myEapm) && Number.isFinite(m.oppEapm) && m.myEapm > m.oppEapm);
  const outpacedWr = outpaced.length >= 2 ? pct(outpaced.filter((m) => m.won).length, outpaced.length) : null;

  return {
    maps,
    phases,
    openings,
    pace: {
      sample: civEapms.length,
      avgEapm: civEapms.length ? round1(civEapms.reduce((a, b) => a + b, 0) / civEapms.length) : null,
      medianEapm: round1(civMedEapm),
      baselineMedianEapm: round1(otherMedEapm),
      deltaEapm: civMedEapm != null && otherMedEapm != null ? round1(civMedEapm - otherMedEapm) : null,
      outpacedGames: outpaced.length,
      outpacedWinRate: outpacedWr,
    },
  };
}

/**
 * Construye diagnósticos precomputados para todas las civs presentes en el modo
 * (para que seleccionar cualquier civ en Central sea instantáneo, 0ms, sin red).
 */
function buildModeCivDiagnostics({
  modeId = 'rm_1v1',
  matches = [],
  allTimeCivs = [],
} = {}) {
  const bySlug = new Map();
  for (const c of (Array.isArray(allTimeCivs) ? allTimeCivs : [])) {
    if (!c || !c.civ) continue;
    const slug = civSlug(c.civ) || String(c.civ).toLowerCase();
    bySlug.set(slug, { civ: c.civ, stat: c });
  }
  for (const m of (Array.isArray(matches) ? matches : [])) {
    if (!m || !m.civ) continue;
    const slug = m.civSlug || civSlug(m.civ) || String(m.civ).toLowerCase();
    if (!bySlug.has(slug)) bySlug.set(slug, { civ: m.civ, stat: null });
  }

  const out = {};
  for (const [slug, info] of bySlug.entries()) {
    out[slug] = analyzeCivPerformance({
      targetCiv: info.civ,
      modeId,
      matches,
      allTimeCivStat: info.stat,
      allTimeModeCivs: allTimeCivs,
    });
  }
  return out;
}

module.exports = {
  MIN_DIAGNOSIS_GAMES,
  EARLY_RESIGN_GAME_SEC,
  fisherExactTwoSided,
  binomialExactTwoSided,
  mannWhitneyP,
  betaCredibleInterval90,
  estimatePriorStrength,
  eloExpectancy,
  applyBenjaminiHochberg,
  buildUnifiedModeMatches,
  analyzeCivPerformance,
  buildModeCivDiagnostics,
};
