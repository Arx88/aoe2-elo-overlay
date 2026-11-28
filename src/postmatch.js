'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveMode } = require('./insights');
const { mapKey } = require('./rival');
const { openingLabel, openingShort } = require('./replay-analysis');
const { normalizeCombatSummary } = require('./combat-analysis');
const { buildExecutionRatings } = require('./execution-ratings');
const { normalizeCheckpoint, buildOpeningReview } = require('./opening-review');
const { normalizeCastlesWindow, presentCastlesWindow } = require('./castles-window');

const STORE_VERSION = 1;
const TELEMETRY_VERSION = 1;
const GRADING_VERSION = 'personal-economic-percentile-v1';
const MIN_BASELINE = 5;
const MAX_RECORDS = 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const PHASES = [
  { id: 'opening', label: 'Apertura' },
  { id: 'feudal', label: 'Feudal' },
  { id: 'castle', label: 'Castillos' },
];
// These are execution indicators, not judgements about strategic choices.
// A fast age-up or more APM does not necessarily mean a better game.
const EXECUTION_METRICS = {
  tcIdleRatio: { label: 'TC inactivo', unit: '%', direction: 'lower', min: 0, max: 1 },
  housedRatio: { label: 'Bloqueo de población', unit: '%', direction: 'lower', min: 0, max: 1 },
  villagerIdleRatio: { label: 'Aldeanos inactivos', unit: '%', direction: 'lower', min: 0, max: 1 },
};
const SUMMARY_METRICS = {
  apm: { label: 'APM', unit: 'acciones/min', min: 0, max: 10000 },
  eapm: { label: 'eAPM', unit: 'acciones/min', min: 0, max: 10000 },
  feudalSeconds: { label: 'Llegada a Feudal', unit: 's de juego', min: 0, max: 86400 },
  castleSeconds: { label: 'Llegada a Castillos', unit: 's de juego', min: 0, max: 86400 },
  imperialSeconds: { label: 'Llegada a Imperial', unit: 's de juego', min: 0, max: 86400 },
  feudalClickSeconds: { label: 'Orden de avance a Feudal', unit: 's de juego', min: 0, max: 86400 },
  castleClickSeconds: { label: 'Orden de avance a Castillos', unit: 's de juego', min: 0, max: 86400 },
};

function finite(value, min = -Infinity, max = Infinity) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value : null;
}

function text(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function identity(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = String(value).trim();
  return /^\d{1,20}$/.test(raw) && Number(raw) > 0 ? raw : null;
}

function timestamp(value) {
  if (typeof value === 'number') return finite(value, 1);
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rounded(value, precision = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function modeId(value) {
  const mode = resolveMode(value);
  return mode ? mode.id : null;
}

function normalizeMetric(raw, spec) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = finite(raw.value, spec.min, spec.max);
  const definition = text(raw.definition, 120);
  // The definition identifies counting semantics. Two eAPM implementations,
  // or TC idle definitions with different research handling, must not mix.
  if (value == null || !definition) return null;
  return { value, definition };
}

function validateMeasuredWindows(data, warnings) {
  const reachedAt = (age) => {
    const metric = data.metrics[`${age}Seconds`];
    return metric?.definition === 'age-reached-game-seconds-v1' ? metric.value : null;
  };
  const feudal = reachedAt('feudal');
  const castle = reachedAt('castle');
  const imperial = reachedAt('imperial');
  const arrivals = { feudal, castle, imperial };
  // Compare readings of the same game clock, allowing integer-second exports.
  const tolerance = 1;
  if (data.combat && Object.entries(arrivals).some(([age, time]) => {
    if (time == null) return false;
    const phase = data.combat.stages.find((stage) => stage.age === age);
    return phase ? Math.abs(phase.startSeconds - time) > tolerance
      : time < data.combat.durationSeconds - tolerance;
  })) {
    data.combat = null;
    warnings.push('Las edades del informe de combate no coinciden con las llegadas medidas.');
  }

  // A slice of a phase can still display measurements, but cannot earn a
  // grade alongside full phases that cover different gameplay.
  const limits = {
    opening: data.context.startingAge === 'dark' && feudal != null ? feudal : null,
    feudal: feudal != null && castle != null ? castle - feudal : null,
    castle: castle != null && imperial != null ? imperial - castle : null,
  };
  for (const phase of PHASES) {
    const measurement = data.phases[phase.id];
    if (!measurement) continue;
    const start = arrivals[phase.id];
    if (measurement.reached === false && start != null && start > tolerance) {
      data.phases[phase.id] = { reached: true, complete: false, durationSeconds: null, metrics: {} };
      warnings.push(`Etapa ${phase.label} marcada como no alcanzada pese a tener una llegada medida.`);
      continue;
    }
    const covered = data.combat?.stages.find((stage) =>
      stage.age === (phase.id === 'opening' ? 'dark' : phase.id) && stage.status === 'complete');
    const expected = limits[phase.id] ?? (covered ? covered.endSeconds - covered.startSeconds : null);
    const max = start != null && data.durationSeconds != null ? data.durationSeconds - start : null;
    const elapsed = measurement.durationSeconds;
    if (measurement.complete && (elapsed == null ||
      (expected != null && Math.abs(elapsed - expected) > tolerance) ||
      (max != null && elapsed > max + tolerance))) {
      measurement.complete = false;
      warnings.push(`La duración declarada de ${phase.label} no coincide con el tramo medido.`);
    }
  }
}

/**
 * Adapter contract for measured replay/game telemetry. Never infer execution
 * from outcome, civ choice, match duration, or a detected strategy label.
 * Invalid or unrelated telemetry is rejected as a whole; missing individual
 * metrics remain missing. This function makes no claim to authenticate an
 * external provider: source is attribution and compatibility metadata.
 */
function sanitizeEngineSide(side) {
  if (!side || typeof side !== 'object') return null;
  const num = (v, min = 0, max = 1e6) => finite(v, min, max);
  const topUnits = Array.isArray(side.topUnits) ? side.topUnits.slice(0, 5)
    .filter((u) => u && text(u.name) && num(u.count, 1, 50000) != null)
    .map((u) => ({
      key: text(u.key, 60) || text(u.name, 60),
      unitId: num(u.unitId, 1, 100000) != null ? Math.round(u.unitId) : null,
      name: text(u.name, 60),
      count: Math.round(u.count),
    })) : [];
  const topWorkshops = Array.isArray(side.topWorkshops) ? side.topWorkshops.slice(0, 4)
    .filter((w) => w && text(w.name) && num(w.count, 1, 500) != null)
    .map((w) => ({
      key: text(w.key, 60) || text(w.name, 60),
      typeId: num(w.typeId, 1, 100000) != null ? Math.round(w.typeId) : null,
      name: text(w.name, 60),
      count: Math.round(w.count),
      units: Math.round(num(w.units, 0, 50000) || 0),
      peakQueue: num(w.peakQueue, 0, 200) != null ? rounded(w.peakQueue) : null,
      overloadedPct: num(w.overloadedPct, 0, 100) != null ? Math.round(w.overloadedPct) : null,
      recommendedCount: num(w.recommendedCount, 1, 500) != null ? Math.round(w.recommendedCount) : null,
      status: ['saturated', 'balanced', 'light'].includes(w.status) ? w.status : 'balanced',
      note: text(w.note, 120),
    })) : [];
  const gap = side.biggestTcGap && typeof side.biggestTcGap === 'object' && text(side.biggestTcGap.summary) ? {
    startSec: Math.round(num(side.biggestTcGap.startSec, 0, 86400) || 0),
    endSec: Math.round(num(side.biggestTcGap.endSec, 0, 86400) || 0),
    durationSec: Math.round(num(side.biggestTcGap.durationSec, 0, 86400) || 0),
    age: text(side.biggestTcGap.age, 30),
    militaryOrdersInGap: Math.round(num(side.biggestTcGap.militaryOrdersInGap, 0, 50000) || 0),
    cause: ['combat', 'eco', 'quiet'].includes(side.biggestTcGap.cause) ? side.biggestTcGap.cause : 'quiet',
    summary: text(side.biggestTcGap.summary, 160),
  } : null;
  const cm = side.combatMicro && typeof side.combatMicro === 'object' ? {
    controlSharePct: num(side.combatMicro.controlSharePct, 0, 100) != null ? rounded(side.combatMicro.controlSharePct) : null,
    combatOrders: Math.round(num(side.combatMicro.combatOrders, 0, 500000) || 0),
    moveOrders: Math.round(num(side.combatMicro.moveOrders, 0, 500000) || 0),
    tcReturnSec: num(side.combatMicro.tcReturnSec, 1, 600) != null ? Math.round(side.combatMicro.tcReturnSec) : null,
    formations: Math.round(num(side.combatMicro.formations, 0, 50000) || 0),
    stances: Math.round(num(side.combatMicro.stances, 0, 50000) || 0),
    backToWork: Math.round(num(side.combatMicro.backToWork, 0, 50000) || 0),
    stopMicro: Math.round(num(side.combatMicro.stopMicro, 0, 50000) || 0),
  } : null;
  const tm = side.timings && typeof side.timings === 'object' ? {
    feudalSeconds: num(side.timings.feudalSeconds, 0, 86400) != null ? Math.round(side.timings.feudalSeconds) : null,
    castleSeconds: num(side.timings.castleSeconds, 0, 86400) != null ? Math.round(side.timings.castleSeconds) : null,
    imperialSeconds: num(side.timings.imperialSeconds, 0, 86400) != null ? Math.round(side.timings.imperialSeconds) : null,
    firstMilitarySeconds: num(side.timings.firstMilitarySeconds, 0, 86400) != null ? Math.round(side.timings.firstMilitarySeconds) : null,
    castleDurationSec: num(side.timings.castleDurationSec, 0, 86400) != null ? Math.round(side.timings.castleDurationSec) : null,
  } : null;
  const arRaw = side.techProfile && side.techProfile.armyRelevance && typeof side.techProfile.armyRelevance === 'object'
    ? side.techProfile.armyRelevance : null;
  const ar = arRaw ? {
    primaryClass: ['cavalry', 'cavArmorOnly', 'ranged', 'infantry', 'gunpowder'].includes(arRaw.primaryClass) ? arRaw.primaryClass : null,
    primaryLabel: text(arRaw.primaryLabel, 40) || null,
    primaryUnits: Math.round(num(arRaw.primaryUnits, 0, 50000) || 0),
    relevantCount: Math.round(num(arRaw.relevantCount, 0, 20) || 0),
    relevantExpected: Math.round(num(arRaw.relevantExpected, 0, 20) || 0),
    relevantNames: Array.isArray(arRaw.relevantNames) ? arRaw.relevantNames.slice(0, 6).map((s) => text(s, 40)).filter(Boolean) : [],
    wellEquipped: Boolean(arRaw.wellEquipped),
    criticalMissing: arRaw.criticalMissing && text(arRaw.criticalMissing.title) ? {
      id: text(arRaw.criticalMissing.id, 40) || 'neg-bs',
      title: text(arRaw.criticalMissing.title, 100),
      metric: text(arRaw.criticalMissing.metric, 40) || null,
      detail: text(arRaw.criticalMissing.detail, 200) || '',
      focusTitle: text(arRaw.criticalMissing.focusTitle, 100) || '',
      focusDetail: text(arRaw.criticalMissing.focusDetail, 220) || '',
    } : null,
  } : null;
  const tp = side.techProfile && typeof side.techProfile === 'object' ? {
    ecoCount: Math.round(num(side.techProfile.ecoCount, 0, 50) || 0),
    blacksmithCount: Math.round(num(side.techProfile.blacksmithCount, 0, 50) || 0),
    combatKeyCount: Math.round(num(side.techProfile.combatKeyCount, 0, 50) || 0),
    hasDoubleBitAxe: Boolean(side.techProfile.hasDoubleBitAxe),
    doubleBitAxeDelaySec: num(side.techProfile.doubleBitAxeDelaySec, 0, 86400) != null ? Math.round(side.techProfile.doubleBitAxeDelaySec) : null,
    hasBowSaw: Boolean(side.techProfile.hasBowSaw),
    bowSawDelaySec: num(side.techProfile.bowSawDelaySec, 0, 86400) != null ? Math.round(side.techProfile.bowSawDelaySec) : null,
    hasWheelbarrow: Boolean(side.techProfile.hasWheelbarrow),
    hasHandCart: Boolean(side.techProfile.hasHandCart),
    hasBloodlines: Boolean(side.techProfile.hasBloodlines),
    hasBallistics: Boolean(side.techProfile.hasBallistics),
    ecoNames: Array.isArray(side.techProfile.ecoNames) ? side.techProfile.ecoNames.slice(0, 12).map((s) => text(s, 40)).filter(Boolean) : [],
    blacksmithNames: Array.isArray(side.techProfile.blacksmithNames) ? side.techProfile.blacksmithNames.slice(0, 15).map((s) => text(s, 40)).filter(Boolean) : [],
    combatKeyNames: Array.isArray(side.techProfile.combatKeyNames) ? side.techProfile.combatKeyNames.slice(0, 6).map((s) => text(s, 40)).filter(Boolean) : [],
    armyRelevance: ar,
  } : null;
  const mb = side.macroBuilds && typeof side.macroBuilds === 'object' ? {
    farms: Math.round(num(side.macroBuilds.farms, 0, 1000) || 0),
    houses: Math.round(num(side.macroBuilds.houses, 0, 500) || 0),
    castles: Math.round(num(side.macroBuilds.castles, 0, 100) || 0),
    extraTcs: Math.round(num(side.macroBuilds.extraTcs, 0, 100) || 0),
    towers: Math.round(num(side.macroBuilds.towers, 0, 200) || 0),
    walls: Math.round(num(side.macroBuilds.walls, 0, 1000) || 0),
  } : null;
  const mp = side.marketProfile && typeof side.marketProfile === 'object' && num(side.marketProfile.totalOps, 1, 50000) != null ? {
    totalOps: Math.round(side.marketProfile.totalOps),
    earlyOps: Math.round(num(side.marketProfile.earlyOps, 0, 50000) || 0),
    bought: {
      food: Math.round(num(side.marketProfile.bought?.food, 0, 1000000) || 0),
      wood: Math.round(num(side.marketProfile.bought?.wood, 0, 1000000) || 0),
      stone: Math.round(num(side.marketProfile.bought?.stone, 0, 1000000) || 0),
    },
    sold: {
      food: Math.round(num(side.marketProfile.sold?.food, 0, 1000000) || 0),
      wood: Math.round(num(side.marketProfile.sold?.wood, 0, 1000000) || 0),
      stone: Math.round(num(side.marketProfile.sold?.stone, 0, 1000000) || 0),
    },
    note: text(side.marketProfile.note, 140),
  } : null;
  const h = side.habits && typeof side.habits === 'object' ? side.habits : {};
  return {
    villagersOrdered: Math.round(num(side.villagersOrdered, 0, 5000) || 0),
    townCenters: Math.round(num(side.townCenters, 0, 100) || 0),
    tcIdleSeconds: num(side.tcIdleSeconds, 0, 86400) != null ? rounded(side.tcIdleSeconds) : null,
    tcUtilization: num(side.tcUtilization, 0, 100) != null ? rounded(side.tcUtilization) : null,
    tcIdleRatio: num(side.tcIdleRatio, 0, 1) != null ? rounded(side.tcIdleRatio, 3) : null,
    tcIdleDarkSeconds: num(side.tcIdleDarkSeconds, 0, 86400) != null ? rounded(side.tcIdleDarkSeconds) : null,
    tcUtilizationDark: num(side.tcUtilizationDark, 0, 100) != null ? rounded(side.tcUtilizationDark) : null,
    tcIdleFeudalSeconds: num(side.tcIdleFeudalSeconds, 0, 86400) != null ? rounded(side.tcIdleFeudalSeconds) : null,
    tcIdleFeudalPerTcSeconds: num(side.tcIdleFeudalPerTcSeconds, 0, 86400) != null ? rounded(side.tcIdleFeudalPerTcSeconds) : null,
    feudalActiveTcs: Math.round(num(side.feudalActiveTcs, 0, 100) || 0),
    tcUtilizationFeudal: num(side.tcUtilizationFeudal, 0, 100) != null ? rounded(side.tcUtilizationFeudal) : null,
    tcIdleEarlySeconds: num(side.tcIdleEarlySeconds, 0, 86400) != null ? rounded(side.tcIdleEarlySeconds) : null,
    tcUtilizationEarly: num(side.tcUtilizationEarly, 0, 100) != null ? rounded(side.tcUtilizationEarly) : null,
    tcIdleTotalSeconds: num(side.tcIdleTotalSeconds, 0, 86400) != null ? rounded(side.tcIdleTotalSeconds) : null,
    tcUtilizationTotal: num(side.tcUtilizationTotal, 0, 100) != null ? rounded(side.tcUtilizationTotal) : null,
    biggestTcGap: gap,
    militaryOrdered: Math.round(num(side.militaryOrdered, 0, 50000) || 0),
    feudalMilitaryOrdered: Math.round(num(side.feudalMilitaryOrdered, 0, 10000) || 0),
    controlSharePct: num(side.controlSharePct, 0, 100) != null ? rounded(side.controlSharePct, 1) : null,
    workshopsCount: Math.round(num(side.workshopsCount, 0, 500) || 0),
    workshopUtilization: num(side.workshopUtilization, 0, 100) != null ? Math.round(side.workshopUtilization) : null,
    topUnits,
    topWorkshops,
    apm: num(side.apm, 0, 2000) != null ? rounded(side.apm) : null,
    eapm: num(side.eapm, 0, 2000) != null ? rounded(side.eapm) : null,
    eapmEarly: num(side.eapmEarly, 0, 2000) != null ? rounded(side.eapmEarly) : null,
    eapmLate: num(side.eapmLate, 0, 2000) != null ? rounded(side.eapmLate) : null,
    eapmRetentionPct: num(side.eapmRetentionPct, 0, 500) != null ? Math.round(side.eapmRetentionPct) : null,
    peakEapm: num(side.peakEapm, 0, 2000) != null ? Math.round(side.peakEapm) : null,
    peakEapmMinute: num(side.peakEapmMinute, 0, 1000) != null ? Math.round(side.peakEapmMinute) : null,
    militarySharePct: num(side.militarySharePct, 0, 100) != null ? Math.round(side.militarySharePct) : null,
    ecoSharePct: num(side.ecoSharePct, 0, 100) != null ? Math.round(side.ecoSharePct) : null,
    timings: tm,
    techProfile: tp,
    macroBuilds: mb,
    combatMicro: cm,
    marketProfile: mp,
    habits: {
      move: Math.round(num(h.move, 0, 500000) || 0),
      attackMove: Math.round(num(h.attackMove, 0, 500000) || 0),
      patrol: Math.round(num(h.patrol, 0, 500000) || 0),
      market: Math.round(num(h.market, 0, 50000) || 0),
      townBell: Math.round(num(h.townBell, 0, 5000) || 0),
      tributes: Math.round(num(h.tributes, 0, 5000) || 0),
      selfDeleted: Math.round(num(h.selfDeleted, 0, 50000) || 0),
      backToWork: Math.round(num(h.backToWork, 0, 50000) || 0),
      formations: Math.round(num(h.formations, 0, 50000) || 0),
      stances: Math.round(num(h.stances, 0, 50000) || 0),
      walls: Math.round(num(h.walls, 0, 50000) || 0),
    },
  };
}

function normalizeEngineSummary(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 'postmatch-engine-v1') return null;
  const self = sanitizeEngineSide(raw.self);
  if (!self) return null;
  const rival = sanitizeEngineSide(raw.rival);
  const timeline = Array.isArray(raw.timeline) ? raw.timeline.slice(0, 24)
    .filter((b) => b && finite(b.seconds, 0, 86400) != null)
    .map((b) => ({
      seconds: Math.round(b.seconds),
      selfVillagers: Math.round(finite(b.selfVillagers, 0, 5000) || 0),
      rivalVillagers: finite(b.rivalVillagers, 0, 5000) != null ? Math.round(b.rivalVillagers) : null,
      selfMilitary: Math.round(finite(b.selfMilitary, 0, 50000) || 0),
      rivalMilitary: finite(b.rivalMilitary, 0, 50000) != null ? Math.round(b.rivalMilitary) : null,
    })) : [];
  const openingSummary = raw.openingSummary && text(raw.openingSummary.name) ? {
    key: text(raw.openingSummary.key, 60) || null,
    name: text(raw.openingSummary.name, 60),
    grade: ['S', 'A', 'B', 'C', 'D'].includes(raw.openingSummary.grade) ? raw.openingSummary.grade : null,
    score: finite(raw.openingSummary.score, 0, 100) != null ? Math.round(raw.openingSummary.score) : null,
    feudalSeconds: finite(raw.openingSummary.feudalSeconds, 0, 86400) != null ? Math.round(raw.openingSummary.feudalSeconds) : null,
    darkIdleSeconds: finite(raw.openingSummary.darkIdleSeconds, 0, 86400) != null ? Math.round(raw.openingSummary.darkIdleSeconds) : null,
    tip: text(raw.openingSummary.tip, 140),
  } : null;
  const stages = Array.isArray(raw.stages) ? raw.stages.slice(0, 4)
    .filter((s) => s && ['dark', 'opening', 'feudal', 'castle', 'imperial'].includes(s.id) && text(s.label))
    .map((s) => ({
      id: s.id,
      label: text(s.label, 40),
      subtitle: text(s.subtitle, 60) || null,
      status: s.status === 'ready' ? 'ready' : 'not_reached',
      grade: ['S', 'A', 'B', 'C', 'D'].includes(s.grade) ? s.grade : null,
      score: finite(s.score, 0, 100) != null ? Math.round(s.score) : null,
      metric: text(s.metric, 80),
      tip: text(s.tip, 140),
    })) : [];
  const cleanInsightList = (list, max, defaultTone) => (Array.isArray(list) ? list.slice(0, max)
    .filter((item) => item && text(item.title) && text(item.detail))
    .map((item) => ({
      id: text(item.id, 60),
      domain: text(item.domain, 40) || null,
      tone: item.tone === 'warn' ? 'warn' : (item.tone === 'good' ? 'good' : defaultTone),
      tier: item.tier === 'gold' ? 'gold' : 'green',
      score: finite(item.score, 0, 200) != null ? Math.round(item.score) : null,
      severity: finite(item.severity, 0, 200) != null ? Math.round(item.severity) : null,
      icon: text(item.icon, 30) || 'medal',
      badgeName: text(item.badgeName, 50) || null,
      metric: text(item.metric, 50) || null,
      title: text(item.title, 90),
      detail: text(item.detail, 180),
    })) : []);
  const highlights = cleanInsightList(raw.highlights, 3, 'good');
  const positives = cleanInsightList(raw.positives, 12, 'good');
  const negatives = cleanInsightList(raw.negatives, 6, 'warn');
  const focus = raw.focus && text(raw.focus.title) && text(raw.focus.detail)
    ? { title: text(raw.focus.title, 90), detail: text(raw.focus.detail, 220) } : null;
  const cleanMasteryItems = (list, max) => (Array.isArray(list) ? list.slice(0, max)
    .filter((item) => item && text(item.title))
    .map((item) => ({
      id: text(item.id, 60),
      category: text(item.category, 30) || 'eco',
      title: text(item.title, 110),
      metric: text(item.metric, 60) || '',
      detail: text(item.detail, 200) || '',
      priority: finite(item.priority, 0, 200) != null ? Math.round(item.priority) : 80,
    })) : []);
  const rawCm = raw.civMastery && typeof raw.civMastery === 'object' ? raw.civMastery : null;
  const cmLev = rawCm ? cleanMasteryItems(rawCm.leveraged, 3) : [];
  const cmMiss = rawCm ? cleanMasteryItems(rawCm.missed, 2) : [];
  const civMastery = rawCm && (cmLev.length || cmMiss.length) ? {
    civSlug: text(rawCm.civSlug, 40) || null,
    civName: text(rawCm.civName, 50) || '',
    rating: ['high', 'mid', 'low'].includes(rawCm.rating) ? rawCm.rating : 'mid',
    leveraged: cmLev,
    missed: cmMiss,
    summary: text(rawCm.summary, 140) || '',
  } : null;
  const rawEapm = raw.eapmComparison && typeof raw.eapmComparison === 'object' ? raw.eapmComparison : null;
  const eapmPlayers = rawEapm && Array.isArray(rawEapm.players)
    ? rawEapm.players.slice(0, 8)
        .filter((p) => p && Array.isArray(p.series) && p.series.length >= 2)
        .map((p) => ({
          slot: Math.round(finite(p.slot, 1, 16) || 1),
          profileId: finite(p.profileId, 1, 1e12) != null ? Math.round(p.profileId) : null,
          name: text(p.name, 48) || `P${Math.round(finite(p.slot, 1, 16) || 1)}`,
          civ: text(p.civ, 40) || null,
          color: Math.round(finite(p.color, 1, 8) || 1),
          team: finite(p.team, 0, 8) != null ? Math.round(p.team) : null,
          isSelf: Boolean(p.isSelf),
          avgEapm: finite(p.avgEapm, 0, 1000) != null ? rounded(p.avgEapm) : 0,
          avgApm: finite(p.avgApm, 0, 2000) != null ? rounded(p.avgApm) : 0,
          min: finite(p.min, 0, 1000) != null ? Math.round(p.min) : 0,
          q1: finite(p.q1, 0, 1000) != null ? rounded(p.q1) : 0,
          median: finite(p.median, 0, 1000) != null ? rounded(p.median) : 0,
          q3: finite(p.q3, 0, 1000) != null ? rounded(p.q3) : 0,
          max: finite(p.max, 0, 1000) != null ? Math.round(p.max) : 0,
          peakMinute: finite(p.peakMinute, 0, 240) != null ? Math.round(p.peakMinute) : 0,
          series: p.series.slice(0, 120).map((v) => Math.max(0, Math.min(999, Math.round(Number(v) || 0)))),
        }))
    : [];
  const eapmComparison = eapmPlayers.length >= 2 ? {
    bucketSeconds: Math.round(finite(rawEapm.bucketSeconds, 15, 300) || 60),
    totalMinutes: Math.round(finite(rawEapm.totalMinutes, 2, 120) || eapmPlayers[0].series.length),
    players: eapmPlayers,
  } : null;
  return {
    version: raw.version,
    engineRev: Math.round(finite(raw.engineRev, 1, 999) || 1),
    isTeamGame: Boolean(raw.isTeamGame),
    durationSeconds: finite(raw.durationSeconds, 0, 86400) != null ? rounded(raw.durationSeconds) : null,
    self,
    rival,
    openingSummary,
    stages,
    timeline,
    eapmComparison,
    highlights,
    positives,
    negatives,
    focus,
    civMastery,
  };
}

function buildPersonalEvolution(telemetry, records, current) {
  const engine = telemetry && telemetry.engineSummary;
  if (!engine || !engine.self) return null;
  const curDur = engine.durationSeconds ?? telemetry.durationSeconds;
  // Abandonos tempranos (< 3 min in-game) no generan marcas personales ni alteran promedios.
  if (Number.isFinite(curDur) && curDur > 0 && curDur < 180) return null;
  const minsOf = (eng, fallbackDur) => Math.max(1, ((eng.durationSeconds || fallbackDur || 600) / 60));
  const curAdapterVersion = telemetry?.source?.version || null;
  const curEngineRev = engine?.engineRev || 1;
  const isCompatibleTcSchema = (row) => {
    const rowVer = row?.telemetry?.source?.version || null;
    if (curAdapterVersion && rowVer && rowVer !== curAdapterVersion) return false;
    const rowEng = row?.telemetry?.engineSummary;
    if (curEngineRev >= 2 && (rowEng?.engineRev || 1) < curEngineRev) return false;
    const s = rowEng?.self;
    if (s && Number.isFinite(s.tcIdleTotalSeconds) && Number.isFinite(s.tcIdleEarlySeconds) &&
        s.tcIdleTotalSeconds < s.tcIdleEarlySeconds) {
      return false;
    }
    return true;
  };
  const extract = (eng, fallbackDur, { tcCompatible = true } = {}) => {
    const mins = minsOf(eng, fallbackDur);
    return {
      tcUtilization: tcCompatible ? (eng.self.tcUtilizationEarly ?? eng.self.tcUtilization) : null,
      tcIdleSeconds: tcCompatible ? (eng.self.tcIdleEarlySeconds ?? eng.self.tcIdleSeconds) : null,
      tcIdleDarkSeconds: tcCompatible ? eng.self.tcIdleDarkSeconds : null,
      tcIdleFeudalSeconds: tcCompatible ? eng.self.tcIdleFeudalSeconds : null,
      tcIdleTotalSeconds: tcCompatible ? eng.self.tcIdleTotalSeconds : null,
      villagersPerMin: tcCompatible ? rounded(eng.self.villagersOrdered / mins, 2) : null,
      militaryPerMin: rounded(eng.self.militaryOrdered / mins, 2),
      eapm: eng.self.eapm,
    };
  };

  // Partidas previas del MISMO jugador y mismo modo con motor local (todos los mapas del modo; nunca mezclar Unranked/Custom)
  const prior = (current && current.leaderboardId != null && Array.isArray(records))
    ? records.filter((row) => {
        if (!row || identity(row.matchId) === current.matchId) return false;
        if (row.profileId != null && identity(row.profileId) !== identity(current.profileId)) return false;
        if (modeId(row.leaderboardId) !== current.leaderboardId) return false;
        const at = timestamp(row.startedAt);
        if (!current.startedAt || !at || at >= current.startedAt) return false;
        const rDur = row.telemetry?.engineSummary?.durationSeconds ?? row.telemetry?.durationSeconds;
        if (Number.isFinite(rDur) && rDur > 0 && rDur < 180) return false;
        return Boolean(row.telemetry && row.telemetry.engineSummary && row.telemetry.engineSummary.self);
      })
      .sort((a, b) => timestamp(b.startedAt) - timestamp(a.startedAt))
      .slice(0, 12)
    : [];

  const nowVals = extract(engine, telemetry.durationSeconds, { tcCompatible: true });
  const priorVals = prior.map((row) => extract(row.telemetry.engineSummary, row.telemetry.durationSeconds, { tcCompatible: isCompatibleTcSchema(row) }));

  const compare = (key, direction, label, unit) => {
    const cur = nowVals[key];
    if (!Number.isFinite(cur)) return null;
    const hist = priorVals.map((v) => v[key]).filter(Number.isFinite);
    const series = [...hist.slice(0, 7).reverse(), cur];
    if (!hist.length) {
      return { key, label, unit, current: cur, median: null, delta: null, improved: null,
        isBest: false, betterThanPct: null, sampleSize: 0, series };
    }
    const med = rounded(median(hist), key.includes('PerMin') ? 2 : 1);
    const delta = rounded(cur - med, key.includes('PerMin') ? 2 : 1);
    const better = direction === 'lower'
      ? hist.filter((v) => cur < v).length
      : hist.filter((v) => cur > v).length;
    const isBest = hist.length >= 3 && better === hist.length;
    const improved = direction === 'lower' ? delta < 0 : delta > 0;
    const betterThanPct = Math.round((better / hist.length) * 100);
    return { key, label, unit, current: cur, median: med, delta, improved,
      isBest, betterThanPct, sampleSize: hist.length, series };
  };

  const metrics = {
    tcUtilization: compare('tcUtilization', 'higher', 'Uso TC · Alta + Feudal', '%'),
    tcIdleSeconds: compare('tcIdleSeconds', 'lower', 'TC inactivo · Alta + Feudal', 's'),
    tcIdleDarkSeconds: compare('tcIdleDarkSeconds', 'lower', 'TC inactivo · Alta Edad', 's'),
    tcIdleFeudalSeconds: compare('tcIdleFeudalSeconds', 'lower', 'TC inactivo · Feudal', 's'),
    tcIdleTotalSeconds: compare('tcIdleTotalSeconds', 'lower', 'TC inactivo · Total', 's'),
    villagersPerMin: compare('villagersPerMin', 'higher', 'Aldeanos / min', '/min'),
    militaryPerMin: compare('militaryPerMin', 'higher', 'Ejército / min', '/min'),
    eapm: compare('eapm', 'higher', 'Ritmo eAPM', 'eAPM'),
  };

  // Titular personal verificable (basado en eAPM real, con separador decimal español y etiqueta honesta "mediana")
  const fmtEs = (v) => String(v).replace('.', ',');
  let headline = null;
  if (prior.length >= 2) {
    if (metrics.eapm?.isBest) {
      headline = { kind: 'record', text: `Récord personal · ${fmtEs(metrics.eapm.current)} eAPM (mejor ritmo de tus últimas ${prior.length + 1} partidas)` };
    } else if (metrics.eapm?.improved && metrics.eapm.delta >= 3) {
      headline = { kind: 'up', text: `Mejoraste tu ritmo · +${fmtEs(metrics.eapm.delta)} eAPM sobre tu mediana personal (${prior.length} partidas)` };
    }
  }

  // Comparación personal por etapa (puntaje de hoy vs tu propia mediana en esa etapa)
  const stageDeltas = {};
  for (const stage of (engine.stages || [])) {
    if (stage.status !== 'ready' || !Number.isFinite(stage.score)) continue;
    const histScores = prior
      .map((row) => (row.telemetry.engineSummary.stages || []).find((s) => s.id === stage.id && s.status === 'ready')?.score)
      .filter(Number.isFinite);
    if (!histScores.length) continue;
    const med = Math.round(median(histScores));
    const deltaScore = Math.round(stage.score - med);
    const better = histScores.filter((v) => stage.score > v).length;
    stageDeltas[stage.id] = {
      median: med,
      deltaScore,
      betterThanPct: Math.round((better / histScores.length) * 100),
      sampleSize: histScores.length,
    };
  }

  if (engine.openingSummary && Number.isFinite(engine.openingSummary.score)) {
    const opScores = prior
      .map((row) => row.telemetry.engineSummary.openingSummary?.score)
      .filter(Number.isFinite);
    if (opScores.length) {
      const med = Math.round(median(opScores));
      stageDeltas.opening = {
        median: med,
        deltaScore: Math.round(engine.openingSummary.score - med),
        betterThanPct: Math.round((opScores.filter((v) => engine.openingSummary.score > v).length / opScores.length) * 100),
        sampleSize: opScores.length,
      };
    }
  }

  // Reto automático de la partida anterior + patrones repetidos en las últimas partidas
  let sessionChallenge = null;
  if (prior.length >= 1) {
    const prevEng = prior[0].telemetry.engineSummary;
    const prevFocus = prevEng.focus && prevEng.focus.title ? prevEng.focus.title : null;
    const prevVals0 = priorVals[0];
    if (prevFocus) {
      let completed = false;
      let detail = '';
      if (/huecos de TC|Centro Urbano/i.test(prevFocus)) {
        const prevIdle = prevVals0.tcIdleSeconds;
        const curIdle = nowVals.tcIdleSeconds;
        if (Number.isFinite(curIdle) && Number.isFinite(prevIdle) && prevIdle > 0) {
          completed = curIdle < prevIdle - 10 || curIdle <= 45;
          detail = completed
            ? `Bajaste el TC inactivo de ${Math.round(prevIdle)} s a ${Math.round(curIdle)} s`
            : `Objetivo: bajar de ${Math.round(prevIdle)} s (hoy ${Math.round(curIdle)} s)`;
        }
      } else if (/Attack-Move|Movimiento de ataque|Patrullar/i.test(prevFocus)) {
        const curMicro = (engine.self.habits?.attackMove || 0) + (engine.self.habits?.patrol || 0);
        completed = curMicro >= 5;
        detail = completed
          ? `${curMicro} órdenes de Movimiento de ataque y Patrullar registradas hoy`
          : `Objetivo: usar al menos 5 Movimiento de ataque y Patrullar (hoy ${curMicro})`;
      } else if (/Campana Urbana/i.test(prevFocus)) {
        const bells = engine.self.habits?.townBell || 0;
        completed = bells === 0;
        detail = completed ? '0 usos de Campana Urbana hoy' : `Tocaste la campana ${bells} veces`;
      } else if (/Mercado|aldeanos/i.test(prevFocus)) {
        const prevM = prevEng.self.habits?.market || 0;
        const curM = engine.self.habits?.market || 0;
        completed = curM < prevM;
        detail = completed ? `Bajaste el Mercado de ${prevM} a ${curM} operaciones` : `Mercado: ${curM} operaciones (antes ${prevM})`;
      } else if (/Herrería/i.test(prevFocus)) {
        const curBs = engine.self.techProfile?.blacksmithCount || 0;
        completed = curBs >= 2;
        detail = completed ? `Investigaste ${curBs} mejoras de Herrería hoy` : `Objetivo: investigar al menos 2 mejoras de Herrería (hoy ${curBs})`;
      } else if (/Hacha de doble filo/i.test(prevFocus)) {
        completed = Boolean(engine.self.techProfile?.hasDoubleBitAxe);
        detail = completed ? 'Activaste Hacha de doble filo a tiempo' : 'Pendiente: investigar Hacha de doble filo en Feudal';
      } else if (/Sierra de arco/i.test(prevFocus)) {
        completed = Boolean(engine.self.techProfile?.hasBowSaw);
        detail = completed ? 'Investigaste Sierra de arco en Castillos' : 'Pendiente: investigar Sierra de arco en Castillos';
      } else if (/militar/i.test(prevFocus)) {
        completed = Number.isFinite(nowVals.militaryPerMin) && Number.isFinite(prevVals0.militaryPerMin) && nowVals.militaryPerMin > prevVals0.militaryPerMin;
        const fmtR = (v) => String(v).replace('.', ',');
        detail = completed
          ? `Subiste ritmo militar de ${fmtR(prevVals0.militaryPerMin)} a ${fmtR(nowVals.militaryPerMin)}/min`
          : `Ritmo militar ${fmtR(nowVals.militaryPerMin)}/min (antes ${fmtR(prevVals0.militaryPerMin)}/min)`;
      }
      if (detail) {
        sessionChallenge = {
          status: completed ? 'completed' : 'pending',
          goal: prevFocus,
          detail,
        };
      }
    }
  }

  let recurringPattern = null;
  const recentSet = [engine, ...prior.slice(0, 7).map((r) => r.telemetry.engineSummary)];
  if (recentSet.length >= 3) {
    const milGames = recentSet.filter((e) => (e.self.militaryOrdered || 0) >= 20);
    const noMicroGames = milGames.filter((e) =>
      ((e.self.habits?.attackMove || 0) + (e.self.habits?.patrol || 0)) === 0 && (e.self.combatMicro?.stopMicro || 0) === 0);
    const woodSellGames = recentSet.filter((e) => (e.self.marketProfile?.earlyOps || 0) >= 5 && (e.self.marketProfile?.sold?.wood || 0) >= 300);
    if (milGames.length >= 3 && noMicroGames.length >= Math.ceil(milGames.length * 0.6)) {
      recurringPattern = {
        id: 'pattern-no-micro',
        title: 'Patrón repetido · Sin Movimiento de ataque ni Patrullar',
        detail: `Ocurrió en ${noMicroGames.length} de tus últimos ${milGames.length} replays con ejército.`,
      };
    } else if (woodSellGames.length >= Math.ceil(recentSet.length * 0.5)) {
      recurringPattern = {
        id: 'pattern-wood-sell',
        title: 'Patrón repetido · Exceso temprano de madera en Mercado',
        detail: `Vendiste madera temprano en ${woodSellGames.length} de tus últimos ${recentSet.length} replays: probá dejar 2–3 leñadores menos.`,
      };
    }
  }

  // Mejora progresiva en replays analizados (basada exclusivamente en eAPM comprobable)
  let consecutiveImprovement = null;
  if (priorVals.length >= 2) {
    const eapmChain = [priorVals[1]?.eapm, priorVals[0]?.eapm, nowVals.eapm];
    if (eapmChain.every(Number.isFinite) && eapmChain[1] - eapmChain[0] >= 2 && eapmChain[2] - eapmChain[1] >= 2) {
      const f = (v) => String(v).replace('.', ',');
      consecutiveImprovement = {
        kind: 'eapm',
        steps: 3,
        chainLabel: `${f(eapmChain[0])} → ${f(eapmChain[1])} → ${f(eapmChain[2])}`,
        title: `3 replays seguidos acelerando tu eAPM`,
        detail: `Subiste tu ritmo mecánico paso a paso: ${f(eapmChain[0])} → ${f(eapmChain[1])} → ${f(eapmChain[2])} eAPM.`,
      };
    }
  }

  // Calentamiento de sesión (replays de las últimas 3 horas, basado en eAPM comprobable)
  let sessionWarmup = null;
  if (current.startedAt && prior.length >= 1) {
    const SESSION_MS = 3 * 60 * 60 * 1000;
    const sameSession = prior.filter((r) => {
      const at = timestamp(r.startedAt);
      return at && current.startedAt - at <= SESSION_MS;
    });
    if (sameSession.length >= 1) {
      const firstRow = sameSession[sameSession.length - 1];
      const firstVals = extract(firstRow.telemetry.engineSummary, firstRow.telemetry.durationSeconds);
      const matchNum = sameSession.length + 1;
      if (Number.isFinite(nowVals.eapm) && Number.isFinite(firstVals.eapm) &&
          nowVals.eapm - firstVals.eapm >= 4) {
        const diff = rounded(nowVals.eapm - firstVals.eapm, 1);
        sessionWarmup = {
          matchNumber: matchNum,
          metric: `Sesión`,
          deltaLabel: `+${String(diff).replace('.', ',')} eAPM`,
          title: `Ya entraste en calor (+${String(diff).replace('.', ',')} eAPM en esta sesión)`,
          detail: `Tu velocidad efectiva creció en esta sesión (${String(firstVals.eapm).replace('.', ',')} → ${String(nowVals.eapm).replace('.', ',')} eAPM).`,
        };
      }
    }
  }

  // Hábitos sostenidos en tus últimos replays locales analizados (nunca afirma "seguidas" sobre partidas sin replay)
  let improvementStreak = null;
  const chain = [engine, ...prior.map((r) => r.telemetry.engineSummary)];
  if (chain.length >= 2) {
    const countStreak = (pred) => {
      let n = 0;
      for (const item of chain) {
        if (pred(item)) n += 1;
        else break;
      }
      return n;
    };
    const woodStreak = countStreak((e) => Boolean(e.self.techProfile?.hasDoubleBitAxe) &&
      e.self.techProfile?.doubleBitAxeDelaySec != null && e.self.techProfile.doubleBitAxeDelaySec <= 90);
    const armedStreak = countStreak((e) => Boolean(e.self.techProfile?.armyRelevance?.wellEquipped));
    const noBellStreak = countStreak((e) => (e.self.habits?.townBell || 0) === 0 && (e.self.eapm || 0) >= 15);
    if (consecutiveImprovement && consecutiveImprovement.kind === 'eapm') {
      improvementStreak = { count: consecutiveImprovement.steps, label: `${consecutiveImprovement.title} (${consecutiveImprovement.chainLabel})`, kind: 'climb' };
    } else if (armedStreak >= 2) {
      improvementStreak = { count: armedStreak, label: `${armedStreak} replays equipando bien tu ejército`, kind: 'blacksmith' };
    } else if (woodStreak >= 2) {
      improvementStreak = { count: woodStreak, label: `${woodStreak} replays con Hacha puntual`, kind: 'eco' };
    } else if (noBellStreak >= 3) {
      improvementStreak = { count: noBellStreak, label: `${noBellStreak} replays sin Campana Urbana`, kind: 'defense' };
    }
  }

  const idsOf = (row) => row?.telemetry?.engineSummary?.positives?.slice(0, 3).map((p) => p.id).filter(Boolean) || [];

  return {
    sampleSize: prior.length,
    headline,
    metrics,
    stageDeltas,
    sessionChallenge,
    recurringPattern,
    consecutiveImprovement,
    sessionWarmup,
    improvementStreak,
    prevPositiveIds: idsOf(prior[0]),
    recentMedalIds: [idsOf(prior[0]), idsOf(prior[1]), idsOf(prior[2])],
  };
}

function fmtShortClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Combina telemetría del replay (30+ detectores), tu evolución personal e historia
 * de rachas/matchups para construir 3 bloques claros y siempre frescos:
 *   1) Lo que hiciste bien y mejoraste (mezcla 3 sabores: Historia/Momentum + Evolución + Ejecución,
 *      con memoria anti-repetición de 3 partidas)
 *   2) Lo que te costó (máx. 2 cuellos de botella reales, coherentes con victoria y modo)
 *   3) Veredicto emocional en 1 frase + racha + 1 foco accionable
 */
function buildPostmatchNarrative(engine, evolution, resultStatus, {
  isTeamGame = false,
  current = null,
  player = null,
  rivalPlayer = null,
  records = null,
  historyRows = null,
  benchmark = null,
  hasAuthoritativeHistory = false,
} = {}) {
  if (!engine || !engine.self) return null;
  const fmtDec = (v) => String(v).replace('.', ',');
  const em = evolution?.metrics || {};
  const recentIds = Array.isArray(evolution?.recentMedalIds)
    ? evolution.recentMedalIds
    : [evolution?.prevPositiveIds || [], [], []];
  const prev1Set = new Set(recentIds[0] || []);
  const prev2Set = new Set(recentIds[1] || []);
  const prev3Set = new Set(recentIds[2] || []);
  const teamMode = Boolean(isTeamGame || engine.isTeamGame);
  const posPool = [];
  const negPool = [];

  // Historial contiguo oficial del mismo modo (requiere historyRows reales de API; nunca inferir rachas sobre registros locales dispersos ni mezclar Unranked/Custom)
  const modeHistory = (() => {
    if (!hasAuthoritativeHistory || !current || !current.startedAt || current.leaderboardId == null) return [];
    const merged = new Map();
    for (const row of [...(Array.isArray(historyRows) ? historyRows : []), ...(Array.isArray(records) ? records : [])]) {
      if (!row || !identity(row.matchId) || identity(row.matchId) === current.matchId) continue;
      if (row.profileId != null && identity(row.profileId) !== identity(current.profileId)) continue;
      if (modeId(row.leaderboardId) !== current.leaderboardId) continue;
      const at = timestamp(row.startedAt);
      if (!at || at >= current.startedAt) continue;
      const key = identity(row.matchId);
      const prev = merged.get(key);
      merged.set(key, prev ? {
        ...prev,
        ...row,
        won: typeof row.won === 'boolean' ? row.won : prev.won,
        rating: finite(row.rating, 100, 4000) ?? prev.rating ?? null,
        ratingDiff: finite(row.ratingDiff) ?? prev.ratingDiff ?? null,
        match: row.match || prev.match || null,
        players: row.players || prev.players || null,
      } : row);
    }
    return [...merged.values()].sort((a, b) => timestamp(b.startedAt) - timestamp(a.startedAt));
  })();

  const isShortAbandon = Number.isFinite(engine.durationSeconds) && engine.durationSeconds > 0 && engine.durationSeconds < 180;
  if (isShortAbandon) {
    return {
      verdict: 'Partida breve (<3 min) · sin diagnóstico de ejecución ni marcas personales.',
      streak: null,
      medals: [],
      issues: Array.isArray(engine.negatives) ? engine.negatives.slice(0, 2) : [],
      focus: engine.focus || {
        title: 'Partida demasiado breve para diagnóstico completo',
        detail: 'La partida terminó antes de los 3 minutos; el análisis completo aparece en partidas regulares.',
      },
    };
  }

  // A0. FAMILIA HISTORIA, RACHAS Y MOMENTUM (solo con historial contiguo real verificado)
  let winStreakCount = 0;
  if (resultStatus === 'won') {
    if (hasAuthoritativeHistory && modeHistory.length > 0) {
      winStreakCount = 1;
      for (const row of modeHistory) {
        if (row.won === true) winStreakCount += 1;
        else break; // Un resultado desconocido o derrota corta toda racha verificable
      }
      if (winStreakCount >= 3) {
        posPool.push({
          id: 'story-win-streak', domain: 'win_streak', flavor: 'story', requiresHistory: true,
          tier: 'gold', score: 97, icon: 'trophy',
          tag: 'EN RACHA', badgeName: 'Racha Imparable',
          title: `¡${winStreakCount} victorias seguidas!`,
          metric: `${winStreakCount} V al hilo`,
          detail: `Venís en tu mejor inercia: ${winStreakCount} triunfos consecutivos en este modo.`,
        });
      } else if (winStreakCount === 2) {
        posPool.push({
          id: 'story-win-streak-2', domain: 'win_streak', flavor: 'story', requiresHistory: true,
          tier: 'green', score: 83, icon: 'trophy',
          tag: 'EN RACHA', badgeName: 'Doble Victoria',
          title: '2 victorias consecutivas',
          metric: '2 V al hilo',
          detail: `Dos triunfos seguidos: consolidaste tu buena racha en este modo.`,
        });
      } else {
        // ¿Cortó una mala racha contigua de >= 2 derrotas?
        let priorLosses = 0;
        for (const row of modeHistory) {
          if (row.won === false) priorLosses += 1;
          else break;
        }
        if (priorLosses >= 2) {
          posPool.push({
            id: 'story-comeback-break', domain: 'win_streak', flavor: 'story', requiresHistory: true,
            tier: 'gold', score: 92, icon: 'shield',
            tag: 'CAMBIO DE INERCIA', badgeName: 'Vuelta al Triunfo',
            title: `Cortaste una racha de ${priorLosses} derrotas`,
            metric: 'Racha cortada',
            detail: `Diste vuelta la tendencia y volviste a sumar en este modo.`,
          });
        }
      }

      // Escalada neta de ELO en partidas contiguas con ratingDiff confirmado
      const contiguousDiffs = [];
      if (finite(current?.ratingDiff) != null) {
        contiguousDiffs.push(finite(current.ratingDiff));
        for (const r of modeHistory.slice(0, 4)) {
          const d = finite(r.ratingDiff);
          if (d == null) break;
          contiguousDiffs.push(d);
        }
      }
      if (contiguousDiffs.length >= 3) {
        const netElo = Math.round(contiguousDiffs.reduce((s, d) => s + d, 0));
        if (netElo >= 25) {
          posPool.push({
            id: 'story-elo-climb', domain: 'elo_momentum', flavor: 'story', requiresHistory: true,
            tier: netElo >= 45 ? 'gold' : 'green', score: netElo >= 45 ? 93 : 84, icon: 'trend',
            tag: 'ESCALADA', badgeName: 'Subida de ELO',
            title: `Sumaste +${netElo} ELO en tus últimas ${contiguousDiffs.length} partidas`,
            metric: `+${netElo} ELO`,
            detail: `Tu ranking viene creciendo de forma sostenida en este tramo.`,
          });
        }
      }
    }

    // Nuevo techo reciente de ELO (comparando post-partida contra máximos post-partida previos)
    const curRating = finite(player?.matchRating ?? player?.rating, 100, 4000);
    const curDiff = finite(current?.ratingDiff);
    const newElo = (curRating != null && curDiff != null) ? Math.round(curRating + curDiff) : null;
    const priorPostRatings = modeHistory
      .map((r) => {
        const base = finite(r.rating, 100, 4000);
        if (base == null) return null;
        const d = finite(r.ratingDiff) || 0;
        return Math.max(base, Math.round(base + d));
      })
      .filter((v) => v != null);
    if (hasAuthoritativeHistory && newElo != null && priorPostRatings.length >= 4 && newElo > Math.max(...priorPostRatings)) {
      posPool.push({
        id: 'story-new-elo-peak', domain: 'elo_peak', flavor: 'story', requiresHistory: true,
        tier: 'gold', score: 98, icon: 'crown',
        tag: 'NUEVO TECHO', badgeName: 'Pico de ELO',
        title: `Nuevo máximo reciente: ${newElo.toLocaleString('es-AR')} ELO`,
        metric: `${newElo} ELO`,
        detail: `Superaste tu punto más alto de las últimas ${priorPostRatings.length + 1} partidas en este modo.`,
      });
    }

    // Mata-Gigantes (1v1 contra rival +40 ELO arriba — hecho directo de esta partida)
    const rivalRating = finite(rivalPlayer?.matchRating ?? rivalPlayer?.rating, 100, 4000);
    if (!teamMode && curRating != null && rivalRating != null && rivalRating - curRating >= 40) {
      const gap = Math.round(rivalRating - curRating);
      posPool.push({
        id: 'story-giant-slayer', domain: 'matchup_feat', flavor: 'story',
        tier: 'gold', score: 95, icon: 'sword',
        tag: 'HAZAÑA', badgeName: 'Mata-Gigantes',
        title: `Venciste a un rival +${gap} ELO arriba tuyo`,
        metric: `+${gap} ELO rival`,
        delta: curDiff != null ? `+${curDiff} ELO` : null,
        detail: `Ganaste un cruce cuesta arriba frente a ${rivalPlayer?.name || 'un rival superior'} (${rivalRating} ELO).`,
      });
    }

    // Revancha cobrada / Le tenés la medida (historial contiguo real contra el MISMO rival)
    const rivalPid = identity(rivalPlayer?.profileId);
    if (hasAuthoritativeHistory && !teamMode && rivalPid) {
      const vsSameRival = modeHistory.filter((r) => {
        const ps = r.match?.players || r.players;
        return Array.isArray(ps) && ps.some((p) => identity(p.profileId) === rivalPid);
      });
      if (vsSameRival.length >= 1) {
        const lastVs = vsSameRival[0];
        const winsVs = vsSameRival.filter((r) => r.won === true).length + 1;
        const lossesVs = vsSameRival.filter((r) => r.won === false).length;
        if (lastVs.won === false) {
          posPool.push({
            id: 'story-rival-revenge', domain: 'rival_h2h', flavor: 'story', requiresHistory: true,
            tier: 'gold', score: 94, icon: 'matchup',
            tag: 'REVANCHA', badgeName: 'Revancha Cobrada',
            title: `Le diste vuelta el cruce a ${rivalPlayer?.name || 'tu rival'}`,
            metric: `${winsVs}-${lossesVs}`,
            detail: `Habías caído en el encuentro previo ante este mismo rival y hoy ganaste.`,
          });
        } else if (winsVs >= 2 && winsVs > lossesVs) {
          posPool.push({
            id: 'story-rival-owned', domain: 'rival_h2h', flavor: 'story', requiresHistory: true,
            tier: 'green', score: 83, icon: 'matchup',
            tag: 'DOMINIO H2H', badgeName: 'Le Tenés la Medida',
            title: `Historial ${winsVs}-${lossesVs} frente a ${rivalPlayer?.name || 'tu rival'}`,
            metric: `${winsVs}-${lossesVs}`,
            detail: `Volviste a imponerte contra un rival que ya conocías.`,
          });
        }
      }
    }

    // Dueño del Mapa (racha contigua de 3+ victorias en el mapa o >= 65% WR con >= 5 partidas)
    const mapLabel = current?.mapName && current.mapName !== '—' ? current.mapName : null;
    if (hasAuthoritativeHistory && mapLabel) {
      let mapStreak = 1;
      const mapRows = modeHistory.filter((r) => mapKey(r.mapName) === mapKey(mapLabel));
      for (const r of mapRows) {
        if (r.won === true) mapStreak += 1;
        else break;
      }
      if (mapStreak >= 3) {
        posPool.push({
          id: 'story-map-streak', domain: 'map_mastery', flavor: 'story', requiresHistory: true,
          tier: 'gold', score: 89, icon: 'map',
          tag: 'TU TERRENO', badgeName: `Dueño de ${mapLabel}`,
          title: `${mapStreak} victorias seguidas en ${mapLabel}`,
          metric: `${mapStreak} V en mapa`,
          detail: `Tenés totalmente leído este mapa en tu historial reciente.`,
        });
      } else if (benchmark && benchmark.games >= 4 && ((benchmark.wins + 1) / (benchmark.games + 1)) >= 0.65) {
        const totalG = benchmark.games + 1;
        const totalW = benchmark.wins + 1;
        const pct = Math.round((totalW / totalG) * 100);
        posPool.push({
          id: 'story-map-wr', domain: 'map_mastery', flavor: 'story', requiresHistory: true,
          tier: 'green', score: 80, icon: 'map',
          tag: 'MAPA FUERTE', badgeName: 'Terreno Favorito',
          title: `${pct}% de victorias en ${mapLabel}`,
          metric: `${totalW}V–${benchmark.losses}D`,
          detail: `Seguís construyendo un registro muy sólido cada vez que toca ${mapLabel}.`,
        });
      }
    }

    // Maestría de Civilización (invicto contiguo 3+ seguidas o >= 65% WR con esta civ)
    if (hasAuthoritativeHistory && current?.civ) {
      const civRows = modeHistory.filter((r) => r.civ && mapKey(r.civ) === mapKey(current.civ));
      let civStreak = 1;
      for (const r of civRows) {
        if (r.won === true) civStreak += 1;
        else break;
      }
      const civW = civRows.filter((r) => r.won === true).length + 1;
      const civL = civRows.filter((r) => r.won === false).length;
      if (civStreak >= 3) {
        posPool.push({
          id: 'story-civ-streak', domain: 'civ_mastery', flavor: 'story', requiresHistory: true,
          tier: 'gold', score: 88, icon: 'shield',
          tag: 'MAESTRÍA DE CIV', badgeName: `Invicto con ${current.civ}`,
          title: `${civStreak} victorias seguidas jugando ${current.civ}`,
          metric: `${civStreak} V al hilo`,
          detail: `Dominás los tiempos y el plan de juego de esta civilización.`,
        });
      } else if (civW + civL >= 4 && (civW / (civW + civL)) >= 0.65) {
        const pct = Math.round((civW / (civW + civL)) * 100);
        posPool.push({
          id: 'story-civ-wr', domain: 'civ_mastery', flavor: 'story', requiresHistory: true,
          tier: 'green', score: 79, icon: 'shield',
          tag: 'CIV FUERTE', badgeName: 'Civilización Confiable',
          title: `${pct}% de efectividad reciente con ${current.civ}`,
          metric: `${civW}V–${civL}D`,
          detail: `Es una de tus elecciones más rentables en este modo.`,
        });
      }
    }
  }

  // Personalidad de ritmo de partida: usa SOLO reloj de juego del replay (no mezcla 1.0x wall-clock con 1.7x game-clock)
  const durSec = finite(engine.durationSeconds, 1, 86400);
  if (resultStatus === 'won' && durSec != null && durSec >= 480 && durSec <= 1200) {
    posPool.push({
      id: 'story-blitz-win', domain: 'match_pace', flavor: 'story',
      tier: 'gold', score: 86, icon: 'scout',
      tag: 'RITMO ARROLLADOR', badgeName: 'Victoria Relámpago',
      title: `Cerraste la partida en ${fmtShortClock(durSec)}`,
      metric: fmtShortClock(durSec),
      detail: `Definiste antes del minuto 20 con presión constante sin darle respiro al rival.`,
    });
  } else if (durSec != null && durSec >= 2700) {
    const mins = Math.round(durSec / 60);
    if (resultStatus === 'won') {
      posPool.push({
        id: 'story-marathon-win', domain: 'match_pace', flavor: 'story',
        tier: 'gold', score: 87, icon: 'castle',
        tag: 'BATALLA ÉPICA', badgeName: 'Resistencia de Acero',
        title: `Ganaste una maratón de ${mins} minutos`,
        metric: `${mins} min`,
        detail: `Sostuviste el pulso en late game y definiste una partida larguísima.`,
      });
    } else if (resultStatus === 'lost' && (engine.self.eapmRetentionPct == null || engine.self.eapmRetentionPct >= 82)) {
      posPool.push({
        id: 'story-marathon-fight', domain: 'match_pace', flavor: 'story',
        tier: 'green', score: 79, icon: 'shield',
        tag: 'AGUANTE', badgeName: 'Batalla de Igual a Igual',
        title: `Peleaste ${mins} minutos sin bajar el ritmo`,
        metric: `${mins} min`,
        detail: `Aunque se escapó al final, mantuviste la intensidad durante toda la batalla.`,
      });
    }
  }

  // Mejora progresiva seguida (3 partidas al hilo mejorando) + Calentamiento de sesión
  if (evolution?.consecutiveImprovement) {
    const ci = evolution.consecutiveImprovement;
    posPool.push({
      id: `evo-climb-${ci.kind}`, domain: 'progressive_climb', flavor: 'evolution', requiresHistory: true,
      tier: 'gold', score: 95, icon: 'trend',
      tag: 'MEJORA SEGUIDA', badgeName: 'En Plena Evolución',
      title: ci.title,
      metric: `${ci.steps} al hilo`,
      delta: ci.chainLabel,
      detail: ci.detail,
    });
  }
  if (evolution?.sessionWarmup) {
    const sw = evolution.sessionWarmup;
    posPool.push({
      id: 'evo-session-warmup', domain: 'session_warmup', flavor: 'evolution', requiresHistory: true,
      tier: 'green', score: 84, icon: 'clock',
      tag: 'SESIÓN DE HOY', badgeName: 'Ya Entraste en Calor',
      title: sw.title,
      metric: sw.metric,
      delta: sw.deltaLabel,
      detail: sw.detail,
    });
  }

  // A. Inyectar récords personales y superaciones reales vs tu propia media
  if (evolution?.sampleSize >= 2) {

    if (em.eapm?.isBest) {
      posPool.push({
        id: 'evo-eapm-record', domain: 'stamina_pace', flavor: 'evolution', requiresHistory: true,
        tier: 'gold', score: 96, icon: 'record',
        tag: 'RÉCORD PERSONAL', badgeName: 'Pulso Acelerado',
        title: `Récord de ritmo mecánico (${fmtDec(em.eapm.current)} eAPM)`,
        metric: `${fmtDec(em.eapm.current)} eAPM`,
        delta: `+${fmtDec(em.eapm.delta)} vs mediana`,
        detail: `Tu velocidad efectiva más alta en las últimas ${evolution.sampleSize + 1} partidas.`,
      });
    } else if (em.eapm?.improved && em.eapm.delta >= 4) {
      posPool.push({
        id: 'evo-eapm-up', domain: 'stamina_pace', flavor: 'evolution', requiresHistory: true,
        tier: 'green', score: 84, icon: 'activity',
        tag: 'SOBRE TU MEDIANA', badgeName: 'Ritmo en Subida',
        title: `Jugaste +${fmtDec(em.eapm.delta)} eAPM sobre tu mediana`,
        metric: `${fmtDec(em.eapm.current)} eAPM`,
        delta: `Mediana ${fmtDec(em.eapm.median)}`,
        detail: em.eapm.betterThanPct >= 65
          ? `Mejor ritmo que el ${em.eapm.betterThanPct}% de tus últimas ${em.eapm.sampleSize}.`
          : `Superaste tu mediana reciente (${fmtDec(em.eapm.median)} eAPM) en las últimas ${em.eapm.sampleSize} partidas.`,
      });
    }



    // Regresiones claras verificables frente a tu propia media -> pool negativo
    if (em.eapm && em.eapm.delta != null && em.eapm.delta <= -7) {
      negPool.push({
        id: 'evo-eapm-drop', domain: 'stamina_pace', severity: 72, icon: 'activity',
        title: `Ritmo más lento que tu mediana (${fmtDec(em.eapm.current)} vs ${fmtDec(em.eapm.median)} eAPM)`,
        metric: `${fmtDec(em.eapm.delta)} eAPM`,
        detail: `Estuviste por debajo de tu velocidad habitual en esta partida.`,
      });
    }
  }

  // B. Incorporar el pool rico del motor (30+ detectores) con memoria anti-repetición de 3 partidas
  const TG_SKIP_POS = new Set(['medal-castle-first', 'medal-feudal-first', 'medal-first-strike', 'medal-blacksmith-lead']);
  const TG_SKIP_NEG = new Set(['neg-late-castle', 'neg-late-feudal', 'neg-1tc-behind', 'neg-blacksmith-behind']);
  const WIN_SKIP_NEG = new Set(['neg-late-castle', 'neg-late-feudal', 'neg-1tc-behind', 'neg-army-deficit', 'neg-blacksmith-behind']);

  const enginePos = (engine.positives && engine.positives.length)
    ? engine.positives
    : (engine.highlights || []).filter((h) => h.tone !== 'warn');
  for (const p of enginePos) {
    if (p.id === 'medal-blacksmith-lead') continue;
    if (teamMode && TG_SKIP_POS.has(p.id)) continue;
    const decay = prev1Set.has(p.id) ? 18 : prev2Set.has(p.id) ? 10 : prev3Set.has(p.id) ? 5 : 0;
    const flavor = p.id === 'medal-peak-adrenaline' ? 'story' : 'execution';
    posPool.push({
      ...p,
      flavor,
      tag: p.tag || (p.tier === 'gold' ? 'DESTACADO DE ORO' : 'LOGRO DE PARTIDA'),
      badgeName: p.badgeName || p.title,
      score: (p.score || 70) - decay,
    });
  }

  const engineNeg = (engine.negatives && engine.negatives.length)
    ? engine.negatives
    : (engine.highlights || []).filter((h) => h.tone === 'warn');
  for (const n of engineNeg) {
    if (n.id === 'neg-blacksmith-behind') continue;
    if (teamMode && TG_SKIP_NEG.has(n.id)) continue;
    if (resultStatus === 'won' && WIN_SKIP_NEG.has(n.id)) continue;
    negPool.push({
      ...n,
      severity: n.severity || 72,
    });
  }

  // Si aún hay un bache de TC significativo (>= 25 s) sin reflejar en negPool, agregarlo
  if (engine.self.biggestTcGap && engine.self.biggestTcGap.durationSec >= 25 && !negPool.some((n) => n.domain === 'macro_tc')) {
    negPool.push({
      id: 'gap-fallback', domain: 'macro_tc', severity: 78, icon: 'clock',
      title: `Mayor bache de TC (${engine.self.biggestTcGap.age})`,
      metric: `${engine.self.biggestTcGap.durationSec} s`,
      detail: engine.self.biggestTcGap.summary,
    });
  }

  const pickDistinct = (items, key, max) => {
    const sorted = [...items].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    const seen = new Set();
    const out = [];
    for (const item of sorted) {
      const dom = item.domain || item.id;
      if (dom && seen.has(dom)) continue;
      if (dom) seen.add(dom);
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  };

  // Selector balanceado de 3 sabores (1 Historia/Momentum + 1 Evolución personal + 1 Ejecución táctica)
  const pickBalancedMedals = (pool, max = 3) => {
    const sorted = [...pool].sort((a, b) => (b.score || 0) - (a.score || 0));
    const seenDomains = new Set();
    const chosen = [];
    const takeBestOfFlavor = (flavorName) => {
      const hit = sorted.find((item) => item.flavor === flavorName && !seenDomains.has(item.domain || item.id));
      if (hit) {
        seenDomains.add(hit.domain || hit.id);
        chosen.push(hit);
      }
    };
    takeBestOfFlavor('story');
    takeBestOfFlavor('evolution');
    takeBestOfFlavor('execution');
    for (const item of sorted) {
      if (chosen.length >= max) break;
      const dom = item.domain || item.id;
      if (dom && seenDomains.has(dom)) continue;
      if (dom) seenDomains.add(dom);
      chosen.push(item);
    }
    return chosen.sort((a, b) => {
      if ((b.tier === 'gold') !== (a.tier === 'gold')) return b.tier === 'gold' ? 1 : -1;
      return (b.score || 0) - (a.score || 0);
    });
  };

  const issues = pickDistinct(negPool, 'severity', 2);
  const issueDomains = new Set(issues.map((x) => x.domain).filter(Boolean));
  const coherentPosPool = posPool.filter((p) => {
    if (!p.domain || !issueDomains.has(p.domain)) return true;
    return String(p.id || '').startsWith('evo-') || String(p.id || '').startsWith('story-');
  });
  const medals = pickBalancedMedals(coherentPosPool.length ? coherentPosPool : posPool, 3);

  // Pill de racha superior: prioriza racha de victorias si >= 2, luego rachas de mejora/ejecución
  const headerStreak = winStreakCount >= 2
    ? { count: winStreakCount, label: `${winStreakCount} victorias seguidas`, kind: 'win' }
    : (evolution?.improvementStreak || null);

  // Veredicto humano en 1 frase (dopamina honesta incluso en derrota)
  const recordCount = medals.filter((m) => m.tier === 'gold').length;
  const improvedCount = medals.filter((m) => m.id?.startsWith('evo-')).length;
  let verdict = '';
  if (resultStatus === 'lost') {
    if (recordCount > 0) {
      verdict = `Perdiste el mapa, pero dejaste ${recordCount === 1 ? '1 marca sobresaliente' : `${recordCount} marcas sobresalientes`} en tu ejecución.`;
    } else if (improvedCount > 0 || medals.length >= 2) {
      verdict = `Perdiste la partida, pero destacaste en ${medals.length} pilares reales de juego.`;
    } else {
      verdict = `Partida exigente: acá tenés el cuello de botella clave para dar vuelta la próxima.`;
    }
  } else if (resultStatus === 'won') {
    if (winStreakCount >= 3) {
      verdict = `¡Imparable! ${winStreakCount} victorias seguidas con ejecución sólida.`;
    } else if (recordCount > 0) {
      verdict = `Victoria sólida con ${recordCount === 1 ? '1 sello dorado' : `${recordCount} sellos dorados`} de ejecución.`;
    } else if (medals.length >= 2) {
      verdict = `Buena victoria: dominaste ${medals.length} áreas clave en la partida.`;
    } else {
      verdict = `Victoria confirmada · revisá tu punto de ajuste para seguir escalando.`;
    }
  } else {
    verdict = medals.length ? `Destacaste en ${medals.length} áreas clave durante la partida.` : '';
  }

  // Foco coherente: si ganaste y el foco original del motor era un trade-off estratégico filtrado, usar el ajuste real #1
  let alignedFocus = engine.focus || null;
  const focusWasFilteredTradeoff = resultStatus === 'won' && alignedFocus &&
    /Castillos|clic a Feudal|2\.º TC|producción militar constante|Desventaja en Herrería/i.test(alignedFocus.title || '');
  const focusWasTgRole = teamMode && alignedFocus &&
    /Castillos|clic a Feudal|2\.º TC|Desventaja en Herrería/i.test(alignedFocus.title || '');
  if (focusWasFilteredTradeoff || focusWasTgRole) {
    if (issues.length) {
      alignedFocus = { title: issues[0].title, detail: issues[0].detail };
    } else {
      alignedFocus = {
        title: 'Ejecución táctica sólida',
        detail: `Sostuviste bien tu plan de partida sin fugas críticas de macro ni mejoras obligatorias pendientes.`,
      };
    }
  }

  return {
    verdict,
    streak: headerStreak,
    medals,
    issues,
    focus: alignedFocus,
  };
}

function normalizeTelemetry(raw, expected = {}) {
  if (!raw) return { status: 'missing', data: null, warnings: [] };
  const warnings = [];
  const fail = (reason) => ({ status: 'invalid', data: null, warnings: [reason] });
  if (typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== TELEMETRY_VERSION) {
    return fail('Formato de telemetría no compatible.');
  }
  const matchId = identity(raw.matchId);
  const profileId = identity(raw.profileId);
  if (!matchId || !profileId ||
      (expected.matchId != null && matchId !== identity(expected.matchId)) ||
      (expected.profileId != null && profileId !== identity(expected.profileId))) {
    return fail('La telemetría no corresponde a esta partida y jugador.');
  }
  if (raw.clock !== 'game') return fail('Las métricas requieren reloj de juego explícito.');
  const source = raw.source || {};
  const sourceId = text(source.id, 80);
  const sourceVersion = text(source.version, 80);
  if (!sourceId || !sourceVersion || !['replay-analysis', 'game-telemetry'].includes(source.type)) {
    return fail('Falta identificar la fuente y versión de las métricas.');
  }
  const context = raw.context || {};
  const mapName = text(context.mapName);
  const mode = modeId(context.leaderboardId);
  const civ = text(context.civ);
  const opening = text(context.opening);
  const gameSpeed = text(context.gameSpeed, 40);
  const startingAge = text(context.startingAge, 40);
  if (!mapName || mapName === '—' || !mode || !civ || !gameSpeed || !startingAge) {
    return fail('Falta contexto de mapa, modo, civilización, velocidad o edad inicial.');
  }
  if ((expected.mapName && mapKey(mapName) !== mapKey(expected.mapName)) ||
      (expected.leaderboardId != null && modeId(expected.leaderboardId) !== mode) ||
      (expected.civ && mapKey(civ) !== mapKey(expected.civ))) {
    return fail('El contexto del replay no coincide con la partida.');
  }
  const data = {
    schemaVersion: TELEMETRY_VERSION, matchId, profileId: Number(profileId), clock: 'game',
    source: { id: sourceId, version: sourceVersion, type: source.type,
      label: text(source.label, 120) || sourceId },
    context: { mapName, leaderboardId: mode, civ, opening, gameSpeed, startingAge,
      patch: text(context.patch, 60) },
    durationSeconds: finite(raw.durationSeconds, 0, 86400),
    metrics: {}, phases: {}, combat: null,
  };
  const summaryInput = { ...(raw.metrics || {}) };
  // The first bundled command adapter mislabeled Research as age reached.
  // Restore those saved values as command times without rewriting the file.
  if (sourceId === 'aoe2rec-js' && sourceVersion === '0.1.25' && source.type === 'replay-analysis') {
    for (const [reached, ordered] of [['feudalSeconds', 'feudalClickSeconds'], ['castleSeconds', 'castleClickSeconds']]) {
      if (summaryInput[reached]?.definition !== 'age-reached-game-seconds-v1') continue;
      summaryInput[ordered] = { ...summaryInput[reached], definition: 'first-age-research-command-game-seconds-v1' };
      delete summaryInput[reached];
      warnings.push('Un tiempo del analizador anterior se interpreta como orden de avance, no llegada confirmada.');
    }
  }
  for (const [key, spec] of Object.entries(SUMMARY_METRICS)) {
    const metric = normalizeMetric(summaryInput[key], spec);
    if (metric) data.metrics[key] = metric;
    else if (summaryInput[key] != null) warnings.push(`Métrica inválida: ${key}.`);
  }
  for (const phase of PHASES) {
    const input = raw.phases && raw.phases[phase.id];
    if (!input || typeof input !== 'object') continue;
    if (input.reached === false) {
      data.phases[phase.id] = { reached: false, complete: false, metrics: {} };
      continue;
    }
    const durationSeconds = finite(input.durationSeconds, 0.001, 86400);
    const output = { reached: input.reached === true, complete: input.complete === true,
      durationSeconds, metrics: {} };
    for (const [key, spec] of Object.entries(EXECUTION_METRICS)) {
      const metric = normalizeMetric(input.metrics && input.metrics[key], spec);
      if (metric) output.metrics[key] = metric;
      else if (input.metrics && input.metrics[key] != null) warnings.push(`Métrica inválida: ${phase.id}.${key}.`);
    }
    data.phases[phase.id] = output;
  }
  // Contradictory age ordering is not a sound comparison input.
  const feudal = data.metrics.feudalSeconds && data.metrics.feudalSeconds.value;
  const castle = data.metrics.castleSeconds && data.metrics.castleSeconds.value;
  const imperial = data.metrics.imperialSeconds?.value;
  const observedArrivals = [feudal, castle, imperial].filter((value) => value != null);
  if (observedArrivals.some((value, index) => index > 0 && value < observedArrivals[index - 1])) {
    return fail('Los tiempos de llegada a edades son inconsistentes.');
  }
  const feudalClick = data.metrics.feudalClickSeconds?.value;
  const castleClick = data.metrics.castleClickSeconds?.value;
  if (feudalClick != null && castleClick != null && castleClick < feudalClick) {
    return fail('Los tiempos de órdenes de avance son inconsistentes.');
  }
  if (data.durationSeconds != null && [...observedArrivals, feudalClick, castleClick].some((v) => v != null && v > data.durationSeconds)) {
    return fail('Un tiempo de edad supera la duración del replay.');
  }
  const phaseDuration = Object.values(data.phases).reduce((total, phase) =>
    total + (phase.durationSeconds || 0), 0);
  if (data.durationSeconds != null && phaseDuration > data.durationSeconds + 1) {
    return fail('Las etapas medidas superan la duración del replay.');
  }
  // Optional measured combat, independent from economic grades. A damaged
  // combat summary does not erase the confirmed result or other telemetry.
  if (raw.combat != null) {
    const combat = normalizeCombatSummary(raw.combat, { profileId: data.profileId,
      durationSeconds: data.durationSeconds, startingAge: data.context.startingAge });
    data.combat = combat.data;
    warnings.push(...combat.warnings);
  }
  validateMeasuredWindows(data, warnings);
  data.openingCheckpoint = normalizeCheckpoint(raw.openingCheckpoint, data);
  if (raw.openingCheckpoint && !data.openingCheckpoint) warnings.push('Hito de apertura incompatible con el replay.');
  data.castlesWindow = normalizeCastlesWindow(raw.castlesWindow, data);
  if (raw.castlesWindow && !data.castlesWindow) warnings.push('Ventana de Castillos incompatible con el replay.');
  if (raw.engineSummary != null) {
    data.engineSummary = normalizeEngineSummary(raw.engineSummary);
  }
  return { status: 'ready', data, warnings };
}

function storedMatch(input, record) {
  const players = (input && Array.isArray(input.players) ? input.players : []).slice(0, 16)
    .filter((player) => identity(player.profileId)).map((player) => ({
      profileId: Number(identity(player.profileId)), name: text(player.name) || null,
      civ: text(player.civ) || null, team: finite(player.team, 0, 16),
      won: typeof player.won === 'boolean' ? player.won : null,
      rating: finite(player.matchRating ?? player.rating, 100, 4000),
      matchRating: finite(player.matchRating ?? player.rating, 100, 4000),
      matchRatingDiff: finite(player.matchRatingDiff ?? player.ratingDiff),
    }));
  const self = players.find((player) => player.profileId === record.profileId);
  if (self) {
    self.name = record.playerName || self.name;
    self.civ = record.civ || self.civ;
    self.won = record.won;
    self.rating = record.rating ?? self.rating ?? null;
    self.matchRating = self.rating;
    self.matchRatingDiff = record.ratingDiff;
  } else players.push({ profileId: record.profileId, name: record.playerName, civ: record.civ,
    won: record.won, rating: record.rating ?? null, matchRating: record.rating ?? null, matchRatingDiff: record.ratingDiff, team: null });
  return { matchId: record.matchId, mapName: record.mapName,
    leaderboardId: record.leaderboardId,
    leaderboardName: (resolveMode(record.leaderboardId) || {}).label || 'Sin ranking confirmado',
    startedAt: record.startedAt, finishedAt: record.finishedAt, ongoing: false, players };
}

function recordFromMatch(match, profileId, telemetry, now = Date.now()) {
  if (!match || typeof match !== 'object') return null;
  const id = identity(profileId);
  const matchId = identity(match.matchId);
  const player = (Array.isArray(match.players) ? match.players : [])
    .find((p) => identity(p.profileId) === id);
  if (!matchId || !id || !player) return null;
  const startedAt = timestamp(match.startedAt);
  const finishedAt = timestamp(match.finishedAt);
  const won = typeof player.won === 'boolean' ? player.won : null;
  if (match.ongoing === true || (!finishedAt && won == null)) return null;
  const result = {
    matchId, profileId: Number(id), mapName: text(match.mapName) || '—',
    leaderboardId: modeId(match.leaderboardId),
    civ: text(player.civ) || null, playerName: text(player.name) || null,
    won, startedAt, finishedAt,
    elapsedSeconds: startedAt && finishedAt && finishedAt >= startedAt
      ? Math.round((finishedAt - startedAt) / 1000) : null,
    rating: finite(player.matchRating ?? player.rating, 100, 4000),
    ratingDiff: finite(player.matchRatingDiff ?? player.ratingDiff),
    updatedAt: finite(now, 1) || Date.now(), telemetry: null,
  };
  const normalized = normalizeTelemetry(telemetry, result);
  result.telemetry = normalized.data;
  result.match = storedMatch(match, result);
  return result;
}

function sanitizeRecord(raw) {
  if (!raw || !identity(raw.matchId) || !identity(raw.profileId)) return null;
  const normalized = {
    matchId: identity(raw.matchId), profileId: Number(identity(raw.profileId)),
    mapName: text(raw.mapName) || '—', leaderboardId: modeId(raw.leaderboardId),
    civ: text(raw.civ) || null, playerName: text(raw.playerName) || null,
    won: typeof raw.won === 'boolean' ? raw.won : null,
    startedAt: timestamp(raw.startedAt), finishedAt: timestamp(raw.finishedAt),
    elapsedSeconds: finite(raw.elapsedSeconds, 0, 86400),
    rating: finite(raw.rating, 100, 4000),
    ratingDiff: finite(raw.ratingDiff), updatedAt: timestamp(raw.updatedAt) || Date.now(),
    telemetry: null,
  };
  if (!normalized.finishedAt && normalized.won == null) return null;
  normalized.telemetry = normalizeTelemetry(raw.telemetry, normalized).data;
  normalized.match = storedMatch(raw.match, normalized);
  return normalized;
}

/** Bounded, local history; updating a match never inserts a duplicate. */
class PerformanceStore {
  constructor(options = {}) {
    if (typeof options === 'string') options = { filePath: options };
    this.filePath = options.filePath || null;
    this.log = typeof options.log === 'function' ? options.log : () => {};
    this.records = new Map();
    this._sortedByProfile = new Map();
    this.revision = 0;
    this.dirty = false;
    this.timer = null;
    this.lastError = null;
    if (!this.filePath) return;
    try {
      if (fs.statSync(this.filePath).size > MAX_BYTES) throw new Error('archivo demasiado grande');
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!data || data.version !== STORE_VERSION || !Array.isArray(data.records)) {
        throw new Error('formato no compatible');
      }
      for (const item of data.records.slice(-MAX_RECORDS)) {
        const record = sanitizeRecord(item);
        if (record) this.records.set(`${record.profileId}:${record.matchId}`, record);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.lastError = `No se pudo leer el historial de rendimiento: ${error.message}`;
        this.log(this.lastError);
      }
    }
  }

  upsert(input) {
    const record = sanitizeRecord(input);
    if (!record) return null;
    const key = `${record.profileId}:${record.matchId}`;
    const previous = this.records.get(key);
    // A delayed partial response must not erase the confirmed result/replay.
    const merged = previous ? {
      ...previous, ...record,
      won: record.won == null ? previous.won : record.won,
      civ: record.civ || previous.civ,
      playerName: record.playerName || previous.playerName,
      startedAt: record.startedAt || previous.startedAt,
      finishedAt: record.finishedAt || previous.finishedAt,
      elapsedSeconds: record.elapsedSeconds == null ? previous.elapsedSeconds : record.elapsedSeconds,
      rating: record.rating == null ? previous.rating : record.rating,
      ratingDiff: record.ratingDiff == null ? previous.ratingDiff : record.ratingDiff,
      telemetry: record.telemetry || previous.telemetry,
    } : record;
    // An initially unidentified ladder/map can become known after completion.
    if (previous) {
      merged.leaderboardId = record.leaderboardId || previous.leaderboardId;
      if (record.mapName === '—') merged.mapName = previous.mapName;
    }
    // Revalidate preserved telemetry against the final authoritative context.
    merged.telemetry = normalizeTelemetry(merged.telemetry, merged).data;
    if (previous) {
      const roster = new Map(previous.match.players.map((player) => [player.profileId, player]));
      for (const player of record.match.players) {
        const before = roster.get(player.profileId) || {};
        roster.set(player.profileId, { ...before, ...player,
          name: player.name || before.name || null,
          civ: player.civ || before.civ || null,
          team: player.team == null ? before.team ?? null : player.team,
          won: player.won == null ? before.won ?? null : player.won,
          rating: player.rating == null ? before.rating ?? null : player.rating,
          matchRating: player.matchRating == null ? before.matchRating ?? null : player.matchRating,
          matchRatingDiff: player.matchRatingDiff == null ? before.matchRatingDiff ?? null : player.matchRatingDiff,
        });
      }
      merged.match = storedMatch({ players: [...roster.values()] }, merged);
    }
    this.records.set(key, merged);
    if (this.records.size > MAX_RECORDS) {
      const oldest = [...this.records.entries()].sort((a, b) =>
        (a[1].startedAt || a[1].updatedAt) - (b[1].startedAt || b[1].updatedAt));
      for (const [oldKey] of oldest.slice(0, this.records.size - MAX_RECORDS)) this.records.delete(oldKey);
    }
    this._sortedByProfile.clear();
    this.revision += 1;
    this.dirty = true;
    this.scheduleFlush();
    return structuredClone(merged);
  }

  recordMatch(match, profileId, telemetry, now = Date.now()) {
    const record = recordFromMatch(match, profileId, telemetry, now);
    return record ? this.upsert(record) : null;
  }

  listReadOnly(profileId) {
    const id = identity(profileId) || '__all__';
    let cached = this._sortedByProfile.get(id);
    if (!cached) {
      cached = [...this.records.values()]
        .filter((r) => id === '__all__' || String(r.profileId) === id)
        .sort((a, b) => (b.startedAt || b.updatedAt) - (a.startedAt || a.updatedAt));
      this._sortedByProfile.set(id, cached);
    }
    return cached;
  }

  getLatest(profileId) {
    const arr = this.listReadOnly(profileId);
    return arr.length ? arr[0] : null;
  }

  getByMatchId(profileId, matchId) {
    const key = `${Number(identity(profileId))}:${identity(matchId)}`;
    return this.records.get(key) || null;
  }

  list(profileId) {
    return this.listReadOnly(profileId).map((record) => structuredClone(record));
  }

  getMatch(profileId, matchId) {
    const record = this.getByMatchId(profileId, matchId);
    return record ? structuredClone(record.match) : null;
  }

  scheduleFlush() {
    if (!this.filePath) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.flushAsync(); }, 400);
    if (this.timer.unref) this.timer.unref();
  }

  async flushAsync() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.filePath || !this.dirty) return true;
    try {
      const records = [...this.records.values()].sort((a, b) =>
        (a.startedAt || a.updatedAt) - (b.startedAt || b.updatedAt)).slice(-MAX_RECORDS);
      const json = JSON.stringify({ version: STORE_VERSION, records });
      if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('límite de tamaño excedido');
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporary, json, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(temporary, this.filePath);
      this.dirty = false;
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = `No se pudo guardar el historial de rendimiento: ${error.message}`;
      this.log(this.lastError);
      return false;
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.filePath || !this.dirty) return true;
    try {
      const records = [...this.records.values()].sort((a, b) =>
        (a.startedAt || a.updatedAt) - (b.startedAt || b.updatedAt)).slice(-MAX_RECORDS);
      const json = JSON.stringify({ version: STORE_VERSION, records });
      if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('límite de tamaño excedido');
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, json, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, this.filePath);
      this.dirty = false;
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = `No se pudo guardar el historial de rendimiento: ${error.message}`;
      this.log(this.lastError);
      return false;
    }
  }
}

function priorRecord(row, current) {
  if (!row || identity(row.matchId) === current.matchId) return false;
  if (row.profileId != null && identity(row.profileId) !== identity(current.profileId)) return false;
  if (mapKey(row.mapName) !== mapKey(current.mapName) || modeId(row.leaderboardId) !== current.leaderboardId) return false;
  const at = timestamp(row.startedAt);
  // Future games and undated entries cannot be a personal historical baseline.
  return Boolean(current.startedAt && at && at < current.startedAt);
}

function mapBenchmark(current, historyRows, records, historyError) {
  if (!current.leaderboardId || current.mapName === '—') {
    return { status: 'unavailable', games: 0, wins: 0, losses: 0, unknownResults: 0,
      winRate: null, afterWinRate: null, recent: [], summary: 'Falta confirmar mapa y modo para comparar.' };
  }
  const unique = new Map();
  // API rows are useful even before the local performance archive exists.
  // Stored records then supply known results that a partial API row omitted.
  for (const row of [...(Array.isArray(historyRows) ? historyRows : []), ...(Array.isArray(records) ? records : [])]) {
    if (!identity(row && row.matchId) || !priorRecord(row, current)) continue;
    const key = identity(row.matchId);
    const previous = unique.get(key);
    unique.set(key, previous ? { ...previous, ...row,
      won: typeof row.won === 'boolean' ? row.won : previous.won } : row);
  }
  const rows = [...unique.values()].sort((a, b) => timestamp(b.startedAt) - timestamp(a.startedAt));
  const wins = rows.filter((r) => r.won === true).length;
  const losses = rows.filter((r) => r.won === false).length;
  const games = wins + losses;
  const unknownResults = rows.length - games;
  const winRate = games ? Math.round(wins / games * 100) : null;
  const confirmed = typeof current.won === 'boolean';
  const afterWinRate = confirmed ? Math.round((wins + (current.won ? 1 : 0)) / (games + 1) * 100) : null;
  const status = historyError ? (rows.length ? 'partial' : 'error') : games === 0 ? 'empty' : games < MIN_BASELINE ? 'limited' : 'ready';
  return {
    status, games, wins, losses, unknownResults, winRate, afterWinRate,
    sampleSize: rows.length,
    recent: rows.slice(0, 8).map((row) => ({ matchId: identity(row.matchId),
      won: typeof row.won === 'boolean' ? row.won : null, startedAt: timestamp(row.startedAt), civ: row.civ || null })),
    summary: historyError ? (rows.length ? 'Comparativa parcial: no llegó todo el historial.' : 'El historial no está disponible; se reintentará.') :
      games === 0 ? 'Primera referencia de resultados en este mapa y modo.' :
        `${wins}V · ${losses}D anteriores en ${current.mapName}${games < MIN_BASELINE ? ' · muestra limitada' : ''}.`,
  };
}

function comparableTelemetry(row, current, telemetry) {
  if (!priorRecord(row, current)) return null;
  const parsed = normalizeTelemetry(row.telemetry, row);
  const other = parsed.data;
  if (!other) return null;
  const a = telemetry.context;
  const b = other.context;
  // Adapter extensions preserve the command metrics. Newly available age
  // arrivals only compare to other metrics with the same definition.
  const commandVersion = (source) => source.id === 'aoe2rec-js' && source.type === 'replay-analysis' &&
    ['0.1.25+command-adapter-v3', '0.1.25+command-adapter-v4', '0.1.25+command-adapter-v5', '0.1.25+command-adapter-v6', '0.1.25+command-adapter-v7'].includes(source.version)
    ? 'command-orders-v3-v7' : source.version;
  if (telemetry.source.id !== other.source.id || commandVersion(telemetry.source) !== commandVersion(other.source) ||
      telemetry.source.type !== other.source.type ||
      mapKey(a.civ) !== mapKey(b.civ) || mapKey(a.opening) !== mapKey(b.opening) ||
      a.gameSpeed !== b.gameSpeed || a.startingAge !== b.startingAge || a.patch !== b.patch) return null;
  // An unidentified opening cannot safely equate two different build orders.
  if (!a.opening || !b.opening || !a.patch || !b.patch) return null;
  return other;
}

function metricComparison(metric, others, direction = null) {
  const values = others.filter((other) => other && other.definition === metric.definition)
    .map((other) => other.value).filter(Number.isFinite);
  if (!values.length) return null;
  const center = median(values);
  const delta = metric.value - center;
  const tolerance = Math.max(1, Math.abs(metric.value)) * 1e-9;
  const better = direction === 'lower' ? values.filter((v) => metric.value < v - tolerance).length :
    direction === 'higher' ? values.filter((v) => metric.value > v + tolerance).length : null;
  const ties = values.filter((v) => Math.abs(metric.value - v) <= tolerance).length;
  return { sampleSize: values.length, median: center, delta,
    improved: direction ? (direction === 'lower' ? delta < 0 : delta > 0) : null,
    strictlyBetterPercent: better == null ? null : better / values.length * 100,
    percentile: better == null ? null : Math.round((better + ties * 0.5) / values.length * 100) };
}

function gradeFor(score) {
  if (!Number.isFinite(score)) return null;
  return score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'E';
}

function historyHighlights(current, benchmark) {
  if (typeof current.won !== 'boolean' || benchmark.status !== 'ready') return [];
  const highlights = [];
  const recent = [{ won: current.won }, ...benchmark.recent]
    .filter((row) => typeof row.won === 'boolean').slice(0, 5);
  const wins = recent.filter((row) => row.won).length;
  if (recent.length === 5 && wins >= 3) {
    highlights.push({ id: 'recent-map-results-v1', icon: 'map', title: `Buen momento en ${current.mapName}`,
      detail: `Ganaste ${wins} de tus últimos 5 resultados confirmados consultados en este mapa y modo.`,
      sampleSize: 5, wins });
  }
  if (current.won && benchmark.winRate != null && benchmark.afterWinRate > benchmark.winRate) {
    highlights.push({ id: 'map-record-progress-v1', icon: 'trend', title: 'Tu registro en el mapa crece',
      detail: `Pasaste de ${benchmark.winRate} % a ${benchmark.afterWinRate} % de victorias en ${benchmark.games + 1} resultados confirmados del historial consultado.`,
      sampleSize: benchmark.games + 1 });
  }
  return highlights.slice(0, 2);
}

function buildStage(phase, telemetry, baselines, telemetryStatus) {
  const base = { id: phase.id, label: phase.label, status: 'needs_replay',
    grade: null, score: null, sampleSize: 0, requiredBaseline: MIN_BASELINE,
    gradeLabel: 'Ejecución económica', metrics: [], missingMetrics: Object.keys(EXECUTION_METRICS),
    valueLabel: null, valueSeconds: null, detail: null,
    summary: 'Requiere métricas del replay para evaluar esta etapa.' };
  if (!telemetry) {
    if (telemetryStatus === 'invalid') base.summary = 'La telemetría recibida no se pudo validar.';
    return base;
  }
  // El replay sí aporta evidencia directa de apertura y llegada a edades.
  // Se muestra como dato medido, no como nota: la nota económica necesita
  // métricas que este replay no expone.
  let measured = null;
  if (phase.id === 'opening' && telemetry.context.opening) {
    measured = {
      valueLabel: openingShort(telemetry.context.opening),
      detail: 'Apertura inferida de las órdenes del replay.',
    };
  }
  const ageMetric = phase.id === 'feudal' ? telemetry.metrics.feudalSeconds
    : phase.id === 'castle' ? telemetry.metrics.castleSeconds : null;
  if (ageMetric && ageMetric.value != null) {
    measured = { valueSeconds: ageMetric.value, detail: 'Llegada medida en el replay.' };
  } else {
    const click = phase.id === 'feudal' ? telemetry.metrics.feudalClickSeconds
      : phase.id === 'castle' ? telemetry.metrics.castleClickSeconds : null;
    if (click && click.value != null) measured = { valueSeconds: click.value,
      detail: 'Primera orden de avance · llegada sin confirmar.', valueType: 'research-command' };
  }
  const withEvidence = (value) => ({ ...base, ...value, status: 'measured',
    summary: 'Dato medido del replay. La nota económica requiere más evidencia.' });

  const input = telemetry.phases[phase.id];
  if (input && input.reached === false) return { ...base, status: 'not_reached',
    missingMetrics: [], detail: 'La etapa no se alcanzó en la partida.',
    summary: 'No se alcanzó esta etapa en la partida.' };
  if (!input || input.reached !== true || !input.durationSeconds) {
    if (measured) return withEvidence(measured);
    return { ...base, status: 'incomplete', detail: 'Sin dato en el replay.',
      summary: 'El replay no registró esta etapa.' };
  }
  const entries = Object.entries(EXECUTION_METRICS).filter(([key]) => input.metrics[key]);
  const missingMetrics = Object.keys(EXECUTION_METRICS).filter((key) => !input.metrics[key]);
  const phases = baselines.map((other) => other.phases[phase.id]).filter((other) =>
    other && other.reached === true && other.complete === true && other.durationSeconds &&
    entries.every(([key]) => other.metrics[key] && other.metrics[key].definition === input.metrics[key].definition));
  const metrics = entries.map(([id, spec]) => ({ id, label: spec.label, unit: spec.unit,
    value: rounded(input.metrics[id].value * 100), definition: input.metrics[id].definition,
    comparison: (() => {
      const comparison = metricComparison(input.metrics[id], phases.map((p) => p.metrics[id]), spec.direction);
      return comparison ? { ...comparison, median: rounded(comparison.median * 100),
        delta: rounded(comparison.delta * 100), deltaUnit: 'puntos porcentuales' } : null;
    })() }));
  if (input.complete !== true) return { ...base, ...(measured || {}), status: 'incomplete', metrics, missingMetrics,
    summary: 'La etapa no tiene una medición completa; no se asigna nota.' };
  if (entries.length < 2) return { ...base, ...(measured || {}), status: 'measured', metrics, missingMetrics,
    summary: 'Se necesitan al menos dos indicadores económicos medidos para calificar.' };
  if (phases.length < MIN_BASELINE) return { ...base, status: 'needs_baseline', metrics,
    missingMetrics, sampleSize: phases.length,
    summary: `${phases.length}/${MIN_BASELINE} replays comparables para tu primera nota personal.` };
  const score = Math.round(metrics.reduce((sum, m) => sum + m.comparison.percentile, 0) / metrics.length);
  return { ...base, status: 'ready', metrics, missingMetrics, sampleSize: phases.length,
    grade: gradeFor(score), score,
    summary: `Ejecución económica frente a ${phases.length} partidas tuyas comparables en este mapa.` };
}

/**
 * Report is intentionally data-only. Renderers should display pending states
 * without inventing grades or treating missing metrics as zero.
 */
function buildPostMatchReport(options = {}) {
  const { match, profileId } = options;
  const now = finite(options.now, 1) || Date.now();
  const player = (match && Array.isArray(match.players) ? match.players : [])
    .find((p) => identity(p.profileId) === identity(profileId));
  const matchId = identity(match && match.matchId);
  if (!matchId || !identity(profileId) || !player) return null;
  const records = Array.isArray(options.records) ? options.records : [];
  const saved = records.find((r) => identity(r.matchId) === matchId && identity(r.profileId) === identity(profileId));
  const current = recordFromMatch(match, profileId, null, now) || {
    matchId, profileId: Number(profileId), mapName: text(match.mapName) || '—',
    leaderboardId: modeId(match.leaderboardId), civ: text(player.civ) || null,
    playerName: text(player.name) || null, startedAt: timestamp(match.startedAt),
    won: null, ratingDiff: null, elapsedSeconds: null,
  };
  const complete = match.ongoing !== true && Boolean(timestamp(match.finishedAt) || typeof player.won === 'boolean');
  const normalized = normalizeTelemetry(options.telemetry || (saved && saved.telemetry), current);
  const telemetry = complete ? normalized.data : null;
  const baselines = telemetry ? [...records].sort((a, b) => timestamp(b.startedAt) - timestamp(a.startedAt))
    .map((row) => comparableTelemetry(row, current, telemetry)).filter(Boolean) : [];
  const benchmark = mapBenchmark(current, options.historyRows, records, options.historyError);
  if (options.historyPending) benchmark.status = 'loading';
  const hasAuthoritativeHistory = Boolean(
    !options.historyPending && !options.historyError && Array.isArray(options.historyRows) && options.historyRows.length > 0,
  );
  const stages = PHASES.map((phase) => buildStage(phase, telemetry, baselines, normalized.status));
  const metrics = {};
  for (const [id, spec] of Object.entries(SUMMARY_METRICS)) {
    const metric = telemetry && telemetry.metrics[id];
    const comparison = metric ? metricComparison(metric, baselines.map((r) => r.metrics[id])) : null;
    metrics[id] = { id, label: spec.label, unit: spec.unit,
      status: metric ? 'ready' : telemetry ? 'unavailable' : 'needs_replay',
      value: metric ? rounded(metric.value) : null,
      definition: metric ? metric.definition : null,
      comparison: comparison ? { ...comparison, median: rounded(comparison.median), delta: rounded(comparison.delta) } : null };
  }
  const improvements = [];
  for (const stage of stages) {
    if (stage.status !== 'ready') continue;
    for (const metric of stage.metrics) {
      if (!metric.comparison || !metric.comparison.improved || metric.comparison.delta === 0) continue;
      improvements.push({ phase: stage.id, metric: metric.id,
        title: `${stage.label}: menos ${metric.label.toLowerCase()}`,
        detail: `${Math.abs(metric.comparison.delta)} puntos menos que tu mediana personal.`,
        delta: metric.comparison.delta, sampleSize: metric.comparison.sampleSize });
    }
  }
  const ownTeam = player && player.team != null ? Number(player.team) : null;
  const rivalPlayer = (match && Array.isArray(match.players) ? match.players : [])
    .find((p) => identity(p.profileId) !== identity(profileId) &&
      (ownTeam == null || p.team == null || Number(p.team) !== ownTeam));
  const resultStatus = complete && typeof current.won === 'boolean' ? (current.won ? 'won' : 'lost') : 'pending';
  const evolution = telemetry && telemetry.engineSummary
    ? buildPersonalEvolution(telemetry, records, current)
    : null;
  const resolvedMode = resolveMode(current.leaderboardId);
  const isTeamMatch = resolvedMode?.size === 'team' || (Array.isArray(match?.players) && match.players.length > 2);
  const engineData = telemetry && telemetry.engineSummary ? {
    ...telemetry.engineSummary,
    isTeamGame: Boolean(telemetry.engineSummary.isTeamGame || isTeamMatch),
    rivalName: rivalPlayer ? text(rivalPlayer.name) || 'Rival' : 'Rival',
    rivalCiv: rivalPlayer ? text(rivalPlayer.civ) || null : null,
    evolution,
    narrative: buildPostmatchNarrative(telemetry.engineSummary, evolution, resultStatus, {
      isTeamGame: isTeamMatch,
      current,
      player,
      rivalPlayer,
      records,
      historyRows: options.historyRows,
      benchmark,
      hasAuthoritativeHistory,
    }),
  } : null;
  const report = {
    version: 1, matchId, profileId: Number(profileId), updatedAt: now,
    status: resultStatus === 'pending' ? 'pending' : 'ready',
    context: { mapName: current.mapName, mode: resolveMode(current.leaderboardId),
      civ: current.civ, playerName: current.playerName,
      opening: telemetry ? telemetry.context.opening || null : null,
      openingLabel: telemetry && telemetry.context.opening
        ? openingLabel(telemetry.context.opening) : null },
    result: { status: resultStatus,
      label: resultStatus === 'won' ? 'Victoria' : resultStatus === 'lost' ? 'Derrota' : 'Confirmando resultado',
      ratingDiff: complete ? current.ratingDiff : null,
      elapsedSeconds: current.elapsedSeconds,
      durationSeconds: telemetry ? telemetry.durationSeconds : null },
    mapBenchmark: benchmark, stages, metrics, improvements: improvements.slice(0, 3),
    openingReview: buildOpeningReview(telemetry, baselines),
    castlesWindow: presentCastlesWindow(telemetry, match),
    engine: engineData,
    combat: telemetry ? telemetry.combat : null,
    historyHighlights: complete ? historyHighlights(current, benchmark) : [],
    analysis: {
      status: ['downloading', 'analyzing', 'ready', 'error'].includes(options.analysis && options.analysis.status)
        ? options.analysis.status : (telemetry ? 'ready' : 'idle'),
      label: text(options.analysis && options.analysis.label, 80) ||
        (telemetry ? 'Análisis listo' : 'Sin análisis de replay'),
      detail: text(options.analysis && options.analysis.detail, 240) || '',
    },
    data: { hasTelemetry: Boolean(telemetry), telemetryStatus: normalized.status,
      sourceLabel: telemetry ? telemetry.source.label : 'AoE2 Companion · resultados',
      warnings: normalized.warnings, gradingVersion: GRADING_VERSION,
      baselinePolicy: 'Mismo jugador, mapa, modo, civilización, apertura, velocidad, edad inicial, parche y definición de métricas. Solo partidas anteriores.',
      historyStatus: options.historyPending ? 'loading' : options.historyError ? 'error' : 'ready',
      telemetryNote: telemetry ? 'Las notas evalúan ejecución económica frente a tu propio historial; no atribuyen la causa de la victoria.' :
        'El replay se descarga y analiza automáticamente al terminar. Si Microsoft todavía no lo publicó, el informe queda con el resultado confirmado.' },
  };
  report.executionRatings = buildExecutionRatings(report);
  return report;
}

/** A completed historical game is shown only after the app observed it live. */
function completedMatchTransition(previous, next, profileId) {
  if (!previous || previous.status !== 'ongoing' || previous.phase === 'lobby' ||
      !next || next.status !== 'idle' || !next.lastMatch || !previous.match) return null;
  const match = next.lastMatch;
  if (identity(previous.match.matchId) !== identity(match.matchId)) return null;
  return recordFromMatch(match, profileId) ? match : null;
}

module.exports = {
  PerformanceStore, buildPostMatchReport, completedMatchTransition,
  normalizeTelemetry, recordFromMatch, gradeFor,
  MIN_BASELINE, GRADING_VERSION, TELEMETRY_VERSION,
};
