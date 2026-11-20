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
    .map((u) => ({ key: text(u.key, 60) || text(u.name, 60), name: text(u.name, 60), count: Math.round(u.count) })) : [];
  const topWorkshops = Array.isArray(side.topWorkshops) ? side.topWorkshops.slice(0, 4)
    .filter((w) => w && text(w.name) && num(w.count, 1, 500) != null)
    .map((w) => ({
      key: text(w.key, 60) || text(w.name, 60),
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
    workshopsCount: Math.round(num(side.workshopsCount, 0, 500) || 0),
    workshopUtilization: num(side.workshopUtilization, 0, 100) != null ? Math.round(side.workshopUtilization) : null,
    topUnits,
    topWorkshops,
    apm: num(side.apm, 0, 2000) != null ? rounded(side.apm) : null,
    eapm: num(side.eapm, 0, 2000) != null ? rounded(side.eapm) : null,
    militarySharePct: num(side.militarySharePct, 0, 100) != null ? Math.round(side.militarySharePct) : null,
    ecoSharePct: num(side.ecoSharePct, 0, 100) != null ? Math.round(side.ecoSharePct) : null,
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
  const highlights = Array.isArray(raw.highlights) ? raw.highlights.slice(0, 3)
    .filter((item) => item && text(item.title) && text(item.detail))
    .map((item) => ({
      id: text(item.id, 60),
      tone: item.tone === 'warn' ? 'warn' : 'good',
      icon: text(item.icon, 30) || 'medal',
      title: text(item.title, 80),
      detail: text(item.detail, 180),
    })) : [];
  const focus = raw.focus && text(raw.focus.title) && text(raw.focus.detail)
    ? { title: text(raw.focus.title, 90), detail: text(raw.focus.detail, 220) } : null;
  return {
    version: raw.version,
    durationSeconds: finite(raw.durationSeconds, 0, 86400) != null ? rounded(raw.durationSeconds) : null,
    self,
    rival,
    openingSummary,
    stages,
    timeline,
    highlights,
    focus,
  };
}

function buildPersonalEvolution(telemetry, records, current) {
  const engine = telemetry && telemetry.engineSummary;
  if (!engine || !engine.self) return null;
  const minsOf = (eng, fallbackDur) => Math.max(1, ((eng.durationSeconds || fallbackDur || 600) / 60));
  const extract = (eng, fallbackDur) => {
    const mins = minsOf(eng, fallbackDur);
    const earlyIdlePerTc = (eng.self.tcIdleDarkSeconds != null && eng.self.tcIdleFeudalPerTcSeconds != null)
      ? rounded(eng.self.tcIdleDarkSeconds + eng.self.tcIdleFeudalPerTcSeconds)
      : (eng.self.tcIdleEarlySeconds ?? eng.self.tcIdleSeconds);
    return {
      tcUtilization: eng.self.tcUtilizationEarly ?? eng.self.tcUtilization,
      tcIdleSeconds: earlyIdlePerTc,
      tcIdleDarkSeconds: eng.self.tcIdleDarkSeconds,
      tcIdleFeudalSeconds: eng.self.tcIdleFeudalPerTcSeconds ?? eng.self.tcIdleFeudalSeconds,
      tcIdleTotalSeconds: eng.self.tcIdleTotalSeconds ?? eng.self.tcIdleSeconds,
      villagersPerMin: rounded(eng.self.villagersOrdered / mins, 2),
      militaryPerMin: rounded(eng.self.militaryOrdered / mins, 2),
      eapm: eng.self.eapm,
    };
  };

  // Partidas previas del MISMO jugador y mismo modo con motor local (todos los mapas del modo)
  const prior = (Array.isArray(records) ? records : [])
    .filter((row) => {
      if (!row || identity(row.matchId) === current.matchId) return false;
      if (row.profileId != null && identity(row.profileId) !== identity(current.profileId)) return false;
      if (modeId(row.leaderboardId) !== current.leaderboardId) return false;
      const at = timestamp(row.startedAt);
      if (!current.startedAt || !at || at >= current.startedAt) return false;
      return Boolean(row.telemetry && row.telemetry.engineSummary && row.telemetry.engineSummary.self);
    })
    .sort((a, b) => timestamp(b.startedAt) - timestamp(a.startedAt))
    .slice(0, 12);

  const nowVals = extract(engine, telemetry.durationSeconds);
  const priorVals = prior.map((row) => extract(row.telemetry.engineSummary, row.telemetry.durationSeconds));

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

  // Titular personal si mejoró claramente frente a su propia historia
  let headline = null;
  if (prior.length >= 2) {
    if (metrics.tcUtilization?.isBest) {
      headline = { kind: 'record', text: `Récord personal · ${metrics.tcUtilization.current}% de continuidad de TC (mejor que tus últimas ${prior.length} partidas)` };
    } else if (metrics.tcIdleSeconds?.isBest) {
      headline = { kind: 'record', text: `Récord personal · solo ${Math.round(metrics.tcIdleSeconds.current)} s de TC inactivo (${Math.round(Math.abs(metrics.tcIdleSeconds.delta))} s menos que tu media)` };
    } else if (metrics.tcUtilization?.improved && metrics.tcUtilization.delta >= 2) {
      headline = { kind: 'up', text: `Mejoraste tu TC · +${metrics.tcUtilization.delta} pts sobre tu media personal (${prior.length} partidas)` };
    } else if (metrics.militaryPerMin?.improved && metrics.militaryPerMin.betterThanPct >= 75) {
      headline = { kind: 'up', text: `Mejor ritmo militar que en el ${metrics.militaryPerMin.betterThanPct}% de tus últimas ${prior.length} partidas` };
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
        completed = Number.isFinite(curIdle) && Number.isFinite(prevIdle) && (curIdle < prevIdle - 10 || curIdle <= 45);
        detail = completed
          ? `Bajaste el idle de ${Math.round(prevIdle)} s a ${Math.round(curIdle)} s`
          : `Objetivo: bajar de ${Math.round(prevIdle || 0)} s (hoy ${Math.round(curIdle || 0)} s)`;
      } else if (/Attack-Move|Patrullar/i.test(prevFocus)) {
        const curMicro = (engine.self.habits?.attackMove || 0) + (engine.self.habits?.patrol || 0);
        completed = curMicro >= 5;
        detail = completed
          ? `${curMicro} órdenes de Attack-Move / Patrol registradas hoy`
          : `Objetivo: usar al menos 5 Attack-Move / Patrol (hoy ${curMicro})`;
      } else if (/Campana Urbana/i.test(prevFocus)) {
        const bells = engine.self.habits?.townBell || 0;
        completed = bells === 0;
        detail = completed ? '0 usos de Campana Urbana hoy' : `Tocaste la campana ${bells} veces`;
      } else if (/Mercado|aldeanos/i.test(prevFocus)) {
        const prevM = prevEng.self.habits?.market || 0;
        const curM = engine.self.habits?.market || 0;
        completed = curM < prevM;
        detail = completed ? `Bajaste el Mercado de ${prevM} a ${curM} ops` : `Mercado: ${curM} ops (antes ${prevM})`;
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
    const noMicroGames = milGames.filter((e) => ((e.self.habits?.attackMove || 0) + (e.self.habits?.patrol || 0)) === 0);
    const woodSellGames = recentSet.filter((e) => (e.self.marketProfile?.sold?.wood || 0) >= 200);
    const satGames = recentSet.filter((e) => (e.self.topWorkshops || []).some((w) => w.status === 'saturated'));
    if (milGames.length >= 3 && noMicroGames.length >= Math.ceil(milGames.length * 0.6)) {
      recurringPattern = {
        id: 'pattern-no-micro',
        title: 'Patrón repetido · Sin Attack-Move / Patrol',
        detail: `Ocurrió en ${noMicroGames.length} de tus últimas ${milGames.length} partidas con ejército.`,
      };
    } else if (woodSellGames.length >= Math.ceil(recentSet.length * 0.5)) {
      recurringPattern = {
        id: 'pattern-wood-sell',
        title: 'Patrón repetido · Exceso de madera en Mercado',
        detail: `Vendiste madera en ${woodSellGames.length} de tus últimas ${recentSet.length} partidas: probá dejar 2–3 leñadores menos.`,
      };
    } else if (satGames.length >= 2) {
      recurringPattern = {
        id: 'pattern-ws-sat',
        title: 'Patrón repetido · Colas militares saturadas',
        detail: `En ${satGames.length} de tus últimas ${recentSet.length} partidas te faltaron edificios militares.`,
      };
    }
  }

  return {
    sampleSize: prior.length,
    headline,
    metrics,
    stageDeltas,
    sessionChallenge,
    recurringPattern,
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
      matchRatingDiff: finite(player.matchRatingDiff),
    }));
  const self = players.find((player) => player.profileId === record.profileId);
  if (self) {
    self.name = record.playerName || self.name;
    self.civ = record.civ || self.civ;
    self.won = record.won;
    self.matchRatingDiff = record.ratingDiff;
  } else players.push({ profileId: record.profileId, name: record.playerName, civ: record.civ,
    won: record.won, matchRatingDiff: record.ratingDiff, team: null });
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
    ratingDiff: finite(player.matchRatingDiff),
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
    this.scheduleFlush();
    return structuredClone(merged);
  }

  recordMatch(match, profileId, telemetry, now = Date.now()) {
    const record = recordFromMatch(match, profileId, telemetry, now);
    return record ? this.upsert(record) : null;
  }

  list(profileId) {
    const id = identity(profileId);
    return [...this.records.values()].filter((r) => id == null || String(r.profileId) === id)
      .sort((a, b) => (b.startedAt || b.updatedAt) - (a.startedAt || a.updatedAt))
      .map((record) => structuredClone(record));
  }

  getMatch(profileId, matchId) {
    const key = `${Number(identity(profileId))}:${identity(matchId)}`;
    const record = this.records.get(key);
    return record ? structuredClone(record.match) : null;
  }

  scheduleFlush() {
    if (!this.filePath) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
    if (this.timer.unref) this.timer.unref();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.filePath) return true;
    try {
      const records = [...this.records.values()].sort((a, b) =>
        (a.startedAt || a.updatedAt) - (b.startedAt || b.updatedAt)).slice(-MAX_RECORDS);
      const json = JSON.stringify({ version: STORE_VERSION, records });
      if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('límite de tamaño excedido');
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, json, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, this.filePath);
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
    ['0.1.25+command-adapter-v3', '0.1.25+command-adapter-v4', '0.1.25+command-adapter-v5'].includes(source.version)
    ? 'command-orders-v3-v5' : source.version;
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
  if (options.historyPending && !benchmark.games && benchmark.status === 'empty') benchmark.status = 'loading';
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
  const engineData = telemetry && telemetry.engineSummary ? {
    ...telemetry.engineSummary,
    rivalName: rivalPlayer ? text(rivalPlayer.name) || 'Rival' : 'Rival',
    rivalCiv: rivalPlayer ? text(rivalPlayer.civ) || null : null,
    evolution: buildPersonalEvolution(telemetry, records, current),
  } : null;

  const resultStatus = complete && typeof current.won === 'boolean' ? (current.won ? 'won' : 'lost') : 'pending';
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
