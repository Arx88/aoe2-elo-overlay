'use strict';

const { resolveMode } = require('./insights');

const VERSION = 'opening-orders-v1';
const MIN_BASELINE = 3;
const MAX_BASELINE = 8;
const OPEN_MAPS = new Set(['arabia', 'runestones']);
const STARTING_AGE_DARK = 2;

const CHECKPOINTS = Object.freeze({
  scout: {
    label: 'Primer Scout encargado',
    open: true,
    anchor: 'feudalClickSeconds',
  },
  archer: {
    label: 'Primer arquero encargado',
    open: true,
    anchor: 'feudalClickSeconds',
  },
  monk: {
    label: 'Primer monje encargado',
    anchor: 'castleClickSeconds',
  },
  knight: {
    label: 'Primer caballero encargado',
    anchor: 'castleClickSeconds',
  },
  tc: {
    label: 'Primera orden de construir TC',
    anchor: 'castleClickSeconds',
  },
});
const TRAIN_IDS = new Map([[448, 'scout'], [4, 'archer'], [125, 'monk'], [38, 'knight']]);
const TC_IDS = new Set([109, 621]);
const FC_OPENINGS = new Set(['Fast Castle', 'FC Boom', 'Drush FC']);
const SCOUT_OPENINGS = new Set(['Scout Rush', 'Scout Opening', 'M@A Scouts', 'Scouts into Archers']);
const ARCHER_OPENINGS = new Set(['Archer Rush', 'Archer Opening', 'M@A Archers', 'Drush Archers', 'Scouts into Archers']);
const mapSlug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function seeOrder(orders, type, payload, worldTime, buildings = []) {
  if (!Number.isFinite(worldTime) || worldTime < 0) return;
  let key;
  if (type === 'DeQueue') key = TRAIN_IDS.get(Number(payload.unit_id));
  if (type === 'Build' && buildings.some((building) => TC_IDS.has(building))) key = 'tc';
  if (!key) return;
  if (orders[key] === undefined || worldTime < orders[key]) orders[key] = worldTime;
}

function pickCheckpoint({ player, opening, settings, build, mapName, mode, playerCount }) {
  // Start settings are verified from the replay header. Limit the first
  // comparison to RM land maps with recognizable openings.
  const modeId = resolveMode(mode)?.id;
  const solo = modeId === 3 && playerCount === 2;
  const team = modeId === 4 && playerCount >= 4 && playerCount <= 8 && playerCount % 2 === 0;
  if ((!solo && !team) ||
    settings.starting_age_id !== STARTING_AGE_DARK ||
    settings.starting_resources_id !== 0 || settings.num_starting_units !== 0 ||
    !Number.isInteger(build) || build < 1 || !Number.isFinite(settings.speed)) return null;
  const map = mapSlug(mapName);
  const orders = player.practiceOrders || {};
  const present = (keys, anchor, end, maxWindowMs = Infinity) => keys
    .filter((key) => Number.isFinite(orders[key]) && orders[key] >= anchor &&
      (end == null || orders[key] < end) && orders[key] - anchor <= maxWindowMs)
    .sort((a, b) => orders[a] - orders[b])[0];
  let key;
  if (OPEN_MAPS.has(map) && Number.isFinite(player.feudalMs)) {
    const keys = [];
    if (SCOUT_OPENINGS.has(opening)) keys.push('scout');
    if (ARCHER_OPENINGS.has(opening)) keys.push('archer');
    key = present(keys, player.feudalMs, player.castleMs);
  } else if (map === 'arena' && FC_OPENINGS.has(opening) && Number.isFinite(player.castleMs)) {
    // This is a first investment, not a classification of the entire Castle Age.
    key = present(['monk', 'knight', 'tc'], player.castleMs, player.imperialMs, 6 * 60_000);
  }
  if (!key) return null;
  return {
    version: VERSION,
    key,
    atSeconds: orders[key] / 1000,
    build,
    speed: Math.round(settings.speed * 100) / 100,
  };
}

function normalizeCheckpoint(raw, telemetry) {
  if (!raw || raw.version !== VERSION || !Object.hasOwn(CHECKPOINTS, raw.key)) return null;
  const entry = CHECKPOINTS[raw.key];
  const context = telemetry.context;
  const map = mapSlug(context.mapName);
  const anchorSeconds = telemetry.metrics[entry.anchor]?.value;
  const nextClick = entry.open ? telemetry.metrics.castleClickSeconds?.value : null;
  if (![3, 4].includes(context.leaderboardId) || context.startingAge !== 'dark' ||
      (entry.open ? !OPEN_MAPS.has(map) : map !== 'arena') ||
      !Number.isFinite(anchorSeconds) || !Number.isFinite(raw.atSeconds) ||
      raw.atSeconds < anchorSeconds || raw.atSeconds > (telemetry.durationSeconds ?? 86400) ||
      (nextClick != null && raw.atSeconds >= nextClick) ||
      (!entry.open && raw.atSeconds - anchorSeconds > 360.1) ||
      !Number.isInteger(raw.build) || raw.build < 1 ||
      !Number.isFinite(raw.speed) || raw.speed < 0.5 || raw.speed > 5) return null;
  return {
    version: VERSION, key: raw.key, atSeconds: raw.atSeconds,
    build: raw.build, speed: raw.speed,
  };
}

function buildOpeningReview(current, history) {
  const checkpoint = current?.openingCheckpoint;
  if (!checkpoint) return null;
  const entry = CHECKPOINTS[checkpoint.key];
  const team = current.context.leaderboardId === 4;
  const anchorSeconds = current.metrics[entry.anchor].value;
  const transitionSeconds = Math.round(checkpoint.atSeconds - anchorSeconds);
  const comparable = (team ? [] : history)
    .filter((record) => {
      const previous = record.openingCheckpoint;
      return previous && previous.key === checkpoint.key &&
        previous.version === checkpoint.version && previous.build === checkpoint.build &&
        previous.speed === checkpoint.speed &&
        record.metrics[entry.anchor]?.definition === current.metrics[entry.anchor].definition;
    }).slice(0, MAX_BASELINE);
  const observed = comparable.map((record) => Math.round(
    record.openingCheckpoint.atSeconds - record.metrics[entry.anchor].value));
  const values = [...observed].sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const medianSeconds = values.length >= MIN_BASELINE
    ? Math.round(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2)
    : null;
  return {
    key: checkpoint.key,
    label: entry.label,
    anchorAge: entry.open ? 'feudal' : 'castle',
    anchorLabel: entry.open ? 'Orden a Feudal' : 'Orden a Castillos',
    atSeconds: Math.floor(checkpoint.atSeconds),
    anchorSeconds: Math.floor(anchorSeconds),
    transitionSeconds,
    comparison: team ? null : {
      sampleSize: values.length,
      required: MIN_BASELINE,
      medianSeconds,
      deltaSeconds: medianSeconds == null ? null : transitionSeconds - medianSeconds,
      recentSeconds: observed.reverse(),
    },
  };
}

module.exports = { seeOrder, pickCheckpoint, normalizeCheckpoint, buildOpeningReview, VERSION };
