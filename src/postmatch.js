'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveMode } = require('./insights');
const { mapKey } = require('./rival');

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

/**
 * Adapter contract for measured replay/game telemetry. Never infer execution
 * from outcome, civ choice, match duration, or a detected strategy label.
 * Invalid or unrelated telemetry is rejected as a whole; missing individual
 * metrics remain missing. This function makes no claim to authenticate an
 * external provider: source is attribution and compatibility metadata.
 */
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
    metrics: {}, phases: {},
  };
  for (const [key, spec] of Object.entries(SUMMARY_METRICS)) {
    const metric = normalizeMetric(raw.metrics && raw.metrics[key], spec);
    if (metric) data.metrics[key] = metric;
    else if (raw.metrics && raw.metrics[key] != null) warnings.push(`Métrica inválida: ${key}.`);
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
  if (feudal != null && castle != null && castle < feudal) {
    return fail('Los tiempos de llegada a edades son inconsistentes.');
  }
  if (data.durationSeconds != null && [feudal, castle].some((v) => v != null && v > data.durationSeconds)) {
    return fail('Un tiempo de edad supera la duración del replay.');
  }
  const phaseDuration = Object.values(data.phases).reduce((total, phase) =>
    total + (phase.durationSeconds || 0), 0);
  if (data.durationSeconds != null && phaseDuration > data.durationSeconds + 1) {
    return fail('Las etapas medidas superan la duración del replay.');
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
  if (telemetry.source.id !== other.source.id || telemetry.source.version !== other.source.version ||
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
    percentile: better == null ? null : Math.round((better + ties * 0.5) / values.length * 100) };
}

function gradeFor(score) {
  if (!Number.isFinite(score)) return null;
  return score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'E';
}

function buildStage(phase, telemetry, baselines, telemetryStatus) {
  const base = { id: phase.id, label: phase.label, status: 'needs_replay',
    grade: null, score: null, sampleSize: 0, requiredBaseline: MIN_BASELINE,
    gradeLabel: 'Ejecución económica', metrics: [], missingMetrics: Object.keys(EXECUTION_METRICS),
    summary: 'Requiere métricas del replay para evaluar esta etapa.' };
  if (!telemetry) {
    if (telemetryStatus === 'invalid') base.summary = 'La telemetría recibida no se pudo validar.';
    return base;
  }
  const input = telemetry.phases[phase.id];
  if (input && input.reached === false) return { ...base, status: 'not_reached',
    missingMetrics: [], summary: 'No se alcanzó esta etapa en la partida.' };
  if (!input || input.reached !== true || !input.durationSeconds) return base;
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
  if (input.complete !== true) return { ...base, status: 'incomplete', metrics, missingMetrics,
    summary: 'La etapa no tiene una medición completa; no se asigna nota.' };
  if (entries.length < 2) return { ...base, status: 'needs_replay', metrics, missingMetrics,
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
  const baselines = telemetry ? records.map((row) => comparableTelemetry(row, current, telemetry)).filter(Boolean) : [];
  const benchmark = mapBenchmark(current, options.historyRows, records, options.historyError);
  const stages = PHASES.map((phase) => buildStage(phase, telemetry, baselines, normalized.status));
  const metrics = {};
  for (const [id, spec] of Object.entries(SUMMARY_METRICS)) {
    const metric = telemetry && telemetry.metrics[id];
    const comparison = metric ? metricComparison(metric, baselines.map((r) => r.metrics[id])) : null;
    metrics[id] = { id, label: spec.label, unit: spec.unit,
      status: metric ? 'ready' : 'needs_replay', value: metric ? rounded(metric.value) : null,
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
  const resultStatus = complete && typeof current.won === 'boolean' ? (current.won ? 'won' : 'lost') : 'pending';
  return {
    version: 1, matchId, profileId: Number(profileId), updatedAt: now,
    status: resultStatus === 'pending' ? 'pending' : 'ready',
    context: { mapName: current.mapName, mode: resolveMode(current.leaderboardId),
      civ: current.civ, playerName: current.playerName,
      opening: telemetry ? telemetry.context.opening || null : null },
    result: { status: resultStatus,
      label: resultStatus === 'won' ? 'Victoria' : resultStatus === 'lost' ? 'Derrota' : 'Confirmando resultado',
      ratingDiff: complete ? current.ratingDiff : null,
      elapsedSeconds: current.elapsedSeconds,
      durationSeconds: telemetry ? telemetry.durationSeconds : null },
    mapBenchmark: benchmark, stages, metrics, improvements: improvements.slice(0, 3),
    data: { hasTelemetry: Boolean(telemetry), telemetryStatus: normalized.status,
      sourceLabel: telemetry ? telemetry.source.label : 'AoE2 Companion · resultados',
      warnings: normalized.warnings, gradingVersion: GRADING_VERSION,
      baselinePolicy: 'Mismo jugador, mapa, modo, civilización, apertura, velocidad, edad inicial, parche y definición de métricas. Solo partidas anteriores.',
      historyStatus: options.historyError ? 'error' : 'ready',
      telemetryNote: telemetry ? 'Las notas evalúan ejecución económica frente a tu propio historial; no atribuyen la causa de la victoria.' :
        'APM y ejecución por etapas requieren analizar el replay. La API de resultados no incluye estas métricas.' },
  };
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
