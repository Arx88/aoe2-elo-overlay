'use strict';

// This is a presentation of the existing PERSONAL economic score, not a new
// telemetry source, a full macro-skill rating, or a population percentile.
const METHOD_VERSION = 'personal-economic-sd-v1';
const MIN_BASELINE = 5;
const PHASES = [
  { id: 'opening', label: 'Apertura' },
  { id: 'feudal', label: 'Feudal' },
  { id: 'castle', label: 'Castillos' },
];
const INDICATORS = {
  tcIdleRatio: 'TC inactivo',
  housedRatio: 'Bloqueo de población',
  villagerIdleRatio: 'Aldeanos inactivos',
};

const finite = (value, min, max) => typeof value === 'number' &&
  Number.isFinite(value) && value >= min && value <= max;
const sample = (value) => Number.isSafeInteger(value) && value >= MIN_BASELINE;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);

function gradeForScore(score) {
  if (!finite(score, 0, 100)) return null;
  // Product thresholds for a versioned personal score; not calibrated skill
  // percentiles. The original postmatch A-E score remains untouched.
  return score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 50 ? 'B' : score >= 25 ? 'C' : 'D';
}

function validMetric(metric, sampleSize) {
  if (!object(metric) || !Object.hasOwn(INDICATORS, metric.id) ||
      !finite(metric.value, 0, 100) || typeof metric.definition !== 'string' ||
      !metric.definition.trim() || metric.definition.length > 120) return false;
  const comparison = metric.comparison;
  return object(comparison) && comparison.sampleSize === sampleSize &&
    finite(comparison.percentile, 0, 100) && finite(comparison.median, 0, 100) &&
    finite(comparison.delta, -100, 100);
}

function rateStage(phase, input) {
  const base = { ...phase, status: 'unavailable', grade: null, score: null,
    sampleSize: 0, metricCount: 0 };
  if (!object(input)) return { ...base, reason: 'missing-stage' };
  if (input.status === 'not_reached' && input.score == null &&
      (!input.metrics || (Array.isArray(input.metrics) && input.metrics.length === 0))) {
    return { ...base, status: 'not_reached', reason: 'stage-not-reached' };
  }
  if (input.status !== 'ready') return { ...base, reason: 'stage-not-ready' };
  const metrics = input.metrics;
  if (!sample(input.sampleSize) || !finite(input.score, 0, 100) ||
      !Array.isArray(metrics) || metrics.length < 2 || metrics.length > 3 ||
      new Set(metrics.map((metric) => metric && metric.id)).size !== metrics.length ||
      !Array.from(metrics).every((metric) => validMetric(metric, input.sampleSize))) {
    return { ...base, reason: 'invalid-economic-evidence' };
  }
  // Do not use a purported economic score that includes APM, kills, or a
  // different weighting. Existing postmatch rounds the mean of these ranks.
  const score = Math.round(metrics.reduce((sum, metric) => sum + metric.comparison.percentile, 0) / metrics.length);
  if (input.score !== score) return { ...base, reason: 'inconsistent-economic-score' };
  return { ...base, status: 'ready', grade: gradeForScore(score), score,
    sampleSize: input.sampleSize, metricCount: metrics.length, reason: null };
}

function personalHighlight(stages, inputs) {
  const candidates = [];
  for (const stage of stages.filter((item) => item.status === 'ready')) {
    for (const metric of inputs.get(stage.id).metrics) {
      const comparison = metric.comparison;
      const strict = comparison.strictlyBetterPercent;
      // Midrank includes half of ties. Never turn it (or a composite score)
      // into a claim about strictly better performances.
      if (!finite(strict, 0, 100) || strict <= 50 || strict > comparison.percentile + 0.5 ||
          comparison.improved !== true || comparison.delta >= 0 ||
          metric.value >= comparison.median) continue;
      const shown = Math.floor(strict * 10) / 10;
      candidates.push({ id: `personal-economic-${stage.id}-${metric.id}-v1`,
        scope: 'personal', phaseId: stage.id, metricId: metric.id,
        title: `${INDICATORS[metric.id]} · ${stage.label}`,
        detail: `Menor valor que en el ${shown} % de tus ${stage.sampleSize} partidas anteriores comparables.`,
        strictlyBetterPercent: strict, sampleSize: stage.sampleSize });
    }
  }
  return candidates.sort((a, b) => b.strictlyBetterPercent - a.strictlyBetterPercent).slice(0, 1);
}

/**
 * Consumes an existing buildPostMatchReport result. A ready upstream stage
 * certifies compatible PERSONAL references; this pure adapter cannot verify
 * their raw identities or authenticate telemetry. Inputs are never mutated.
 * Overall economic rating needs every expected stage ready or not reached.
 * Ready stages remain individually visible when the overall rating is partial.
 */
function buildExecutionRatings(report) {
  const inputs = new Map();
  const duplicates = new Set();
  const acceptable = object(report) && (report.status == null || report.status === 'ready') &&
    report.data?.telemetryStatus !== 'invalid';
  if (acceptable && Array.isArray(report.stages) && report.stages.length <= PHASES.length) {
    for (const stage of report.stages) {
      if (!object(stage) || !PHASES.some((phase) => phase.id === stage.id)) continue;
      if (inputs.has(stage.id)) duplicates.add(stage.id);
      inputs.set(stage.id, stage);
    }
  }
  const stages = PHASES.map((phase) => rateStage(phase,
    duplicates.has(phase.id) ? null : inputs.get(phase.id)));
  const ready = stages.filter((stage) => stage.status === 'ready');
  const complete = ready.length > 0 && stages.every((stage) =>
    ['ready', 'not_reached'].includes(stage.status));
  const score = complete ? Math.round(ready.reduce((sum, stage) => sum + stage.score, 0) / ready.length) : null;
  return {
    schemaVersion: 1, methodVersion: METHOD_VERSION,
    economic: {
      id: 'economic', label: 'Macro económica', scope: 'personal',
      scopeLabel: 'Ejecución económica personal',
      status: complete ? 'ready' : ready.length ? 'partial' : 'unavailable',
      grade: gradeForScore(score), score, stages,
      // This is the smallest PER-STAGE sample, not a pooled or common cohort.
      minimumStageSampleSize: ready.length ? Math.min(...ready.map((stage) => stage.sampleSize)) : 0,
      requiredBaseline: MIN_BASELINE,
      detail: complete ? 'Media de las etapas económicas evaluadas frente a tus propias partidas comparables.' :
        'La nota requiere indicadores económicos medidos y referencias personales compatibles por etapa.',
    },
    micro: { id: 'micro', label: 'Micro', status: 'unavailable', grade: null, score: null,
      detail: 'Sin evidencia validada para evaluar el control de unidades.' },
    decisions: { id: 'decisions', label: 'Decisiones estratégicas', status: 'unavailable', grade: null, score: null,
      detail: 'Sin un método validado para evaluar las decisiones de esta partida.' },
    personalHighlights: personalHighlight(stages, inputs),
  };
}

module.exports = { buildExecutionRatings, METHOD_VERSION, MIN_BASELINE };
