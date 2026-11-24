'use strict';

/**
 * Relic · Entrenamiento (Beta) — Motor de Misiones Auto-Verificables, Matriz 4 Edades y Rangos
 *
 * REGLA ESTRICTA DE INTEGRIDAD:
 *  - 100 % métricas reales y deterministas producidas por `src/engine/postmatch-engine.js`.
 *  - Cero telemetría inventada (jamás `housedRatio`, `villagerIdleRatio` ni K/D).
 *  - Idempotencia por `matchId` y elegibilidad por duración mínima (≥ 12 min / ≥ 20 min).
 */

const MISSION_FAMILIES = [
  {
    id: 'tc_idle_dark',
    category: 'ECONOMÍA · ALTA EDAD MEDIA',
    title: 'Centro Urbano en Alta Edad Media',
    icon: 'clock',
    minDurationSec: 720,
    requiresDarkStart: true,
    recommendedRecipe: 'scouts-20pop',
    tiers: [
      { key: 'bronze', label: 'Bronce', target: 35, requiredMatches: 1, rankedOnly: false, unit: '≤ 35 s' },
      { key: 'silver', label: 'Plata', target: 20, requiredMatches: 1, rankedOnly: false, unit: '≤ 20 s' },
      { key: 'gold', label: 'Oro', target: 10, requiredMatches: 2, rankedOnly: true, unit: '≤ 10 s' },
      { key: 'obsidian', label: 'Obsidiana', target: 5, requiredMatches: 3, rankedOnly: true, unit: '≤ 5 s' },
    ],
    extractMetric(rec) {
      const v = rec?.telemetry?.engineSummary?.self?.tcIdleDarkSeconds;
      return Number.isFinite(v) ? Math.round(v) : null;
    },
    formatValue(v) { return v == null ? '—' : `${Math.round(v)} s`; },
    passes(val, tier) { return val != null && val <= tier.target; },
  },
  {
    id: 'tc_idle_feudal',
    category: 'ECONOMÍA · EDAD FEUDAL',
    title: 'Continuidad económica en Edad Feudal',
    icon: 'villager',
    minDurationSec: 840,
    requiresDarkStart: false,
    recommendedRecipe: 'archers-21pop',
    tiers: [
      { key: 'bronze', label: 'Bronce', target: 45, requiredMatches: 1, rankedOnly: false, unit: '≤ 45 s/CU' },
      { key: 'silver', label: 'Plata', target: 28, requiredMatches: 1, rankedOnly: false, unit: '≤ 28 s/CU' },
      { key: 'gold', label: 'Oro', target: 16, requiredMatches: 2, rankedOnly: true, unit: '≤ 16 s/CU' },
      { key: 'obsidian', label: 'Obsidiana', target: 8, requiredMatches: 3, rankedOnly: true, unit: '≤ 8 s/CU' },
    ],
    extractMetric(rec) {
      const self = rec?.telemetry?.engineSummary?.self || {};
      const v = Number.isFinite(self.tcIdleFeudalPerTcSeconds)
        ? self.tcIdleFeudalPerTcSeconds
        : self.tcIdleEarlySeconds;
      return Number.isFinite(v) ? Math.round(v) : null;
    },
    formatValue(v) { return v == null ? '—' : `${Math.round(v)} s`; },
    passes(val, tier) { return val != null && val <= tier.target; },
  },
  {
    id: 'eco_wood_upgrades',
    category: 'TECNOLOGÍA · MADERA',
    title: 'Mejoras de madera sin retraso',
    icon: 'wood',
    minDurationSec: 900,
    requiresDarkStart: false,
    recommendedRecipe: 'scouts-20pop',
    tiers: [
      { key: 'bronze', label: 'Bronce', target: 90, requireBowSaw: false, requiredMatches: 1, rankedOnly: false, unit: 'Hacha ≤ 90 s' },
      { key: 'silver', label: 'Plata', target: 45, requireBowSaw: false, requiredMatches: 1, rankedOnly: false, unit: 'Hacha ≤ 45 s' },
      { key: 'gold', label: 'Oro', target: 30, requireBowSaw: true, requiredMatches: 2, rankedOnly: true, unit: 'Hacha + Sierra ≤ 30 s' },
      { key: 'obsidian', label: 'Obsidiana', target: 15, requireBowSaw: true, requiredMatches: 3, rankedOnly: true, unit: 'Hacha + Sierra ≤ 15 s' },
    ],
    extractMetric(rec) {
      const tp = rec?.telemetry?.engineSummary?.self?.techProfile || {};
      if (!tp.hasDoubleBitAxe) return { ok: false, delaySec: null, hasBowSaw: Boolean(tp.hasBowSaw), bowDelaySec: tp.bowSawDelaySec ?? null };
      return {
        ok: true,
        delaySec: Number.isFinite(tp.doubleBitAxeDelaySec) ? Math.round(tp.doubleBitAxeDelaySec) : 0,
        hasBowSaw: Boolean(tp.hasBowSaw),
        bowDelaySec: Number.isFinite(tp.bowSawDelaySec) ? Math.round(tp.bowSawDelaySec) : null,
      };
    },
    formatValue(v) {
      if (v == null) return '—';
      if (typeof v === 'number') return `${Math.round(v)} s`;
      if (!v.ok) return 'Sin Hacha';
      return `${v.delaySec} s`;
    },
    passes(val, tier) {
      if (!val || !val.ok || val.delaySec == null) return false;
      if (val.delaySec > tier.target) return false;
      if (tier.requireBowSaw) {
        if (!val.hasBowSaw) return false;
        if (val.bowDelaySec != null && val.bowDelaySec > tier.target * 2) return false;
      }
      return true;
    },
  },
  {
    id: 'age_timing_opening',
    category: 'APERTURA · RITMO',
    title: 'Ventana de avance a Edad Feudal',
    icon: 'age',
    minDurationSec: 720,
    requiresDarkStart: true,
    recommendedRecipe: 'scouts-20pop',
    tiers: [
      { key: 'bronze', label: 'Bronce', target: 690, requiredMatches: 1, rankedOnly: false, unit: '≤ 11:30' },
      { key: 'silver', label: 'Plata', target: 645, requiredMatches: 1, rankedOnly: false, unit: '≤ 10:45' },
      { key: 'gold', label: 'Oro', target: 615, requiredMatches: 2, rankedOnly: true, unit: '≤ 10:15' },
      { key: 'obsidian', label: 'Obsidiana', target: 590, requiredMatches: 3, rankedOnly: true, unit: '≤ 09:50' },
    ],
    extractMetric(rec) {
      const self = rec?.telemetry?.engineSummary?.self || {};
      const f = self.timings?.feudalSeconds ?? rec?.telemetry?.metrics?.feudalSeconds?.value ?? null;
      return Number.isFinite(f) && f >= 360 ? Math.round(f) : null;
    },
    formatValue(v) {
      if (v == null) return '—';
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    },
    passes(val, tier) { return val != null && val <= tier.target; },
  },
  {
    id: 'combat_habits',
    category: 'COMBATE · DISCIPLINA',
    title: 'Atacar y mover · 0 Campana urbana',
    icon: 'sword',
    minDurationSec: 900,
    requiresDarkStart: false,
    recommendedRecipe: 'maa-archers-21pop',
    tiers: [
      { key: 'bronze', label: 'Bronce', minOrders: 3, zeroBell: false, needSmith: false, requiredMatches: 1, rankedOnly: false, unit: '≥ 3 órdenes' },
      { key: 'silver', label: 'Plata', minOrders: 6, zeroBell: true, needSmith: false, requiredMatches: 1, rankedOnly: false, unit: '≥ 6 · 0 Campana' },
      { key: 'gold', label: 'Oro', minOrders: 10, zeroBell: true, needSmith: true, requiredMatches: 2, rankedOnly: true, unit: '≥ 10 + Herrería' },
      { key: 'obsidian', label: 'Obsidiana', minOrders: 15, zeroBell: true, needSmith: true, requiredMatches: 3, rankedOnly: true, unit: '≥ 15 + Herrería' },
    ],
    extractMetric(rec) {
      const self = rec?.telemetry?.engineSummary?.self || {};
      const h = self.habits || {};
      const orders = Number(h.attackMove || 0) + Number(h.patrol || 0);
      const bell = Number(h.townBell || 0);
      const wellEquipped = Boolean(self.techProfile?.armyRelevance?.wellEquipped);
      return { orders, bell, wellEquipped };
    },
    formatValue(v) {
      if (!v) return '—';
      if (typeof v === 'number') return `${v} órd.`;
      return `${v.orders} órd.${v.bell > 0 ? ` · ${v.bell} camp.` : ''}`;
    },
    passes(val, tier) {
      if (!val) return false;
      if (val.orders < tier.minOrders) return false;
      if (tier.zeroBell && val.bell > 0) return false;
      if (tier.needSmith && !val.wellEquipped) return false;
      return true;
    },
  },
  {
    id: 'midgame_production',
    category: 'JUEGO MEDIO · MACRO',
    title: 'Ritmo sostenido en juego medio',
    icon: 'castle',
    minDurationSec: 1200,
    requiresDarkStart: false,
    recommendedRecipe: 'fc-boom-26pop',
    tiers: [
      { key: 'bronze', label: 'Bronce', target: 65, requiredMatches: 1, rankedOnly: false, unit: '≥ 65 %' },
      { key: 'silver', label: 'Plata', target: 75, requiredMatches: 1, rankedOnly: false, unit: '≥ 75 %' },
      { key: 'gold', label: 'Oro', target: 83, requiredMatches: 2, rankedOnly: true, unit: '≥ 83 %' },
      { key: 'obsidian', label: 'Obsidiana', target: 90, requiredMatches: 3, rankedOnly: true, unit: '≥ 90 %' },
    ],
    extractMetric(rec) {
      const self = rec?.telemetry?.engineSummary?.self || {};
      const pct = Number.isFinite(self.eapmRetentionPct) ? self.eapmRetentionPct : self.workshopUtilization;
      return Number.isFinite(pct) ? Math.round(pct) : null;
    },
    formatValue(v) { return v == null ? '—' : `${Math.round(v)} %`; },
    passes(val, tier) { return val != null && val >= tier.target; },
  },
];

const HISTORICAL_RANKS = [
  { id: 'squire', roman: 'I', label: 'Escudero', minXp: 0, minVerified: 0 },
  { id: 'maa', roman: 'II', label: 'Hombre de armas', minXp: 150, minVerified: 2 },
  { id: 'knight', roman: 'III', label: 'Caballero', minXp: 450, minVerified: 6 },
  { id: 'paladin', roman: 'IV', label: 'Paladín', minXp: 900, minVerified: 12 },
  { id: 'champion', roman: 'V', label: 'Campeón Imperial', minXp: 1600, minVerified: 20 },
];

function getMissionFamily(id) {
  return MISSION_FAMILIES.find((m) => m.id === id) || null;
}

function isRankedMatch(record) {
  const lb = Number(record?.leaderboardId ?? record?.telemetry?.context?.leaderboardId ?? 0);
  // AoE2:DE Official Ranked leaderboards: 3 (RM 1v1), 4 (RM TG), 13 (EW 1v1), 14 (EW TG)
  return lb === 3 || lb === 4 || lb === 13 || lb === 14;
}

function isEligibleForMission(family, record, tier) {
  if (!family || !record || !record.telemetry?.engineSummary?.self) return false;
  const dur = Number(record.telemetry.durationSeconds || record.telemetry.engineSummary.durationSeconds || 0);
  if (!Number.isFinite(dur) || dur < family.minDurationSec) return false;
  if (family.requiresDarkStart) {
    const startAge = String(record.telemetry.context?.startingAge || 'dark').toLowerCase();
    if (startAge && startAge !== 'dark' && startAge !== 'standard') return false;
  }
  if (tier?.rankedOnly && !isRankedMatch(record)) return false;
  return true;
}

function computeBaselineForFamily(family, records = []) {
  const recent = (records || []).slice(0, 12);
  const vals = [];
  for (const r of recent) {
    const m = family.extractMetric(r);
    if (m == null) continue;
    if (typeof m === 'number') vals.push(m);
    else if (typeof m === 'object' && m.delaySec != null) vals.push(m.delaySec);
    else if (typeof m === 'object' && m.orders != null) vals.push(m.orders);
  }
  if (!vals.length) return { median: null, sample: 0, display: 'Sin muestra' };
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  const med = vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
  return { median: med, sample: vals.length, display: family.formatValue(med) };
}

function selectInitialTierIndex(family, baseline, completedTierKeys = []) {
  // Choose next uncompleted tier, or pick a realistic starting tier based on player's real median
  for (let i = 0; i < family.tiers.length; i += 1) {
    if (!completedTierKeys.includes(family.tiers[i].key)) {
      if (i === 0 && baseline.sample >= 3 && baseline.median != null) {
        // If player already beats Bronze comfortably on median, start at Silver
        const t0 = family.tiers[0];
        if (family.id === 'tc_idle_dark' && baseline.median <= t0.target) return 1;
        if (family.id === 'tc_idle_feudal' && baseline.median <= t0.target) return 1;
        if (family.id === 'age_timing_opening' && baseline.median <= t0.target) return 1;
        if (family.id === 'midgame_production' && baseline.median >= t0.target) return 1;
      }
      return i;
    }
  }
  return family.tiers.length - 1;
}

function selectActiveMissions({ records = [], profileState = {}, preferredIds = [] }) {
  const medalsByFamily = profileState.medals || {};
  const existing = Array.isArray(profileState.activeMissions) ? profileState.activeMissions : [];
  const activeMap = new Map(existing.map((m) => [m.familyId, m]));

  // Score each family by urgency from real replays
  const scored = MISSION_FAMILIES.map((family) => {
    const baseline = computeBaselineForFamily(family, records);
    const doneKeys = Array.isArray(medalsByFamily[family.id]) ? medalsByFamily[family.id] : [];
    let urgency = 50;
    if (preferredIds.includes(family.id)) urgency += 40;
    if (baseline.sample >= 2 && baseline.median != null) {
      if (family.id === 'tc_idle_dark' && baseline.median > 25) urgency += 35;
      if (family.id === 'tc_idle_feudal' && baseline.median > 35) urgency += 30;
      if (family.id === 'eco_wood_upgrades' && baseline.median > 60) urgency += 25;
      if (family.id === 'age_timing_opening' && baseline.median > 640) urgency += 20;
      if (family.id === 'combat_habits' && baseline.median < 6) urgency += 22;
      if (family.id === 'midgame_production' && baseline.median < 75) urgency += 18;
    }
    if (doneKeys.length >= family.tiers.length) urgency -= 60;
    return { family, baseline, doneKeys, urgency };
  }).sort((a, b) => b.urgency - a.urgency);

  const chosen = [];
  for (const item of scored) {
    if (chosen.length >= 3) break;
    const prev = activeMap.get(item.family.id);
    const tierIdx = prev && Number.isInteger(prev.tierIdx)
      ? Math.min(item.family.tiers.length - 1, Math.max(0, prev.tierIdx))
      : selectInitialTierIndex(item.family, item.baseline, item.doneKeys);
    const tier = item.family.tiers[tierIdx];
    chosen.push({
      id: prev?.id || `mis_${item.family.id}_${tier.key}`,
      familyId: item.family.id,
      tierIdx,
      tierKey: tier.key,
      tierLabel: tier.label,
      category: item.family.category,
      title: item.family.title,
      icon: item.family.icon,
      recommendedRecipe: item.family.recommendedRecipe,
      targetDisplay: tier.unit,
      baselineDisplay: item.baseline.display,
      baselineSample: item.baseline.sample,
      progressCurrent: Number(prev?.progressCurrent || 0),
      progressRequired: tier.requiredMatches,
      rankedOnly: Boolean(tier.rankedOnly),
      verifiedMatchIds: Array.isArray(prev?.verifiedMatchIds) ? prev.verifiedMatchIds.slice(0, 10) : [],
      createdAt: Number(prev?.createdAt || Date.now()),
      status: prev?.status === 'completed' ? 'completed' : 'active',
      lastMeasuredDisplay: prev?.lastMeasuredDisplay || null,
    });
  }
  return chosen;
}

function evaluateRecordAgainstMissions(activeMissions = [], record, processedMatchIds = []) {
  const matchId = String(record?.matchId || '').trim();
  if (!matchId || processedMatchIds.includes(matchId)) {
    return { updatedMissions: activeMissions, newlyCompleted: [], changed: false };
  }
  const startedAtMs = Number(record?.startedAt || 0) * (Number(record?.startedAt || 0) < 1e12 ? 1000 : 1);
  const newlyCompleted = [];
  let changed = false;

  const updatedMissions = activeMissions.map((m) => {
    if (m.status === 'completed') return m;
    if (startedAtMs > 0 && startedAtMs + 60_000 < Number(m.createdAt || 0)) return m;
    if ((m.verifiedMatchIds || []).includes(matchId)) return m;

    const family = getMissionFamily(m.familyId);
    if (!family) return m;
    const tier = family.tiers[m.tierIdx] || family.tiers[0];
    if (!isEligibleForMission(family, record, tier)) return m;

    const val = family.extractMetric(record);
    const measuredDisplay = family.formatValue(val);
    if (!family.passes(val, tier)) {
      changed = true;
      return { ...m, lastMeasuredDisplay: measuredDisplay };
    }

    const nextCount = Number(m.progressCurrent || 0) + 1;
    const done = nextCount >= Number(m.progressRequired || 1);
    const nextMission = {
      ...m,
      progressCurrent: Math.min(nextCount, Number(m.progressRequired || 1)),
      verifiedMatchIds: [...(m.verifiedMatchIds || []), matchId],
      lastMeasuredDisplay: measuredDisplay,
      status: done ? 'completed' : 'active',
      completedAt: done ? Date.now() : null,
    };
    changed = true;
    if (done) {
      newlyCompleted.push({
        familyId: m.familyId,
        title: m.title,
        tierKey: m.tierKey,
        tierLabel: m.tierLabel,
        measuredDisplay,
        matchId,
      });
    }
    return nextMission;
  });

  return { updatedMissions, newlyCompleted, changed };
}

function scoreToGrade(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 88) return 'S';
  if (score >= 76) return 'A';
  if (score >= 62) return 'B';
  if (score >= 48) return 'C';
  return 'D';
}

function computeAgeMastery(records = []) {
  const stageMeta = [
    { id: 'dark', roman: 'I', label: 'Alta Edad Media', icon: 'assets/icons/ages/dark.png', drillTab: 'orders', drillCta: 'Practicar apertura' },
    { id: 'feudal', roman: 'II', label: 'Edad Feudal', icon: 'assets/icons/ages/feudal.png', drillTab: 'orders', drillCta: 'Afinar transición' },
    { id: 'castle', roman: 'III', label: 'Edad de los Castillos', icon: 'assets/icons/ages/castle.png', drillTab: 'arena', drillCta: 'Entrenar contraunidades' },
    { id: 'imperial', roman: 'IV', label: 'Edad Imperial', icon: 'assets/icons/ages/imperial.png', drillTab: 'arena', drillCta: 'Lectura de civilizaciones' },
  ];

  const recent = (records || []).filter((r) => Number(r?.telemetry?.durationSeconds || 0) >= 180).slice(0, 15);
  const tracks = stageMeta.map((st) => {
    const scores = [];
    const olderScores = [];
    recent.forEach((r, idx) => {
      const stages = Array.isArray(r?.telemetry?.engineSummary?.stages) ? r.telemetry.engineSummary.stages : [];
      const found = stages.find((x) => x.id === st.id && x.status === 'ready' && Number.isFinite(x.score));
      if (!found) return;
      if (idx < 7) scores.push(found.score);
      else olderScores.push(found.score);
    });
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const oldAvg = olderScores.length >= 2 ? Math.round(olderScores.reduce((a, b) => a + b, 0) / olderScores.length) : null;
    const delta = avg != null && oldAvg != null ? avg - oldAvg : null;
    return {
      ...st,
      score: avg,
      grade: scoreToGrade(avg),
      sample: scores.length + olderScores.length,
      delta,
      isPriority: false,
    };
  });

  // Mark the single weakest stage (with sample >= 2) as priority
  const candidates = tracks.filter((t) => t.score != null && t.sample >= 2);
  if (candidates.length) {
    candidates.sort((a, b) => a.score - b.score);
    candidates[0].isPriority = true;
  }
  return tracks;
}

function computeHistoricalRank(xp = 0, verifiedCount = 0) {
  let current = HISTORICAL_RANKS[0];
  let next = HISTORICAL_RANKS[1] || null;
  for (let i = 0; i < HISTORICAL_RANKS.length; i += 1) {
    const r = HISTORICAL_RANKS[i];
    if (xp >= r.minXp && verifiedCount >= r.minVerified) {
      current = r;
      next = HISTORICAL_RANKS[i + 1] || null;
    }
  }
  const xpPct = next
    ? Math.max(0, Math.min(100, Math.round(((xp - current.minXp) / Math.max(1, next.minXp - current.minXp)) * 100)))
    : 100;
  return {
    current,
    next,
    xp,
    verifiedCount,
    progressPct: xpPct,
    remainingVerified: next ? Math.max(0, next.minVerified - verifiedCount) : 0,
  };
}

module.exports = {
  MISSION_FAMILIES,
  HISTORICAL_RANKS,
  getMissionFamily,
  isRankedMatch,
  isEligibleForMission,
  selectActiveMissions,
  evaluateRecordAgainstMissions,
  computeAgeMastery,
  computeHistoricalRank,
};
