'use strict';

/**
 * Idle de Centro Urbano reconstruido sin tocar el juego.
 *
 * El archivo trae cada orden de entrenamiento (`action_data.DeQueue`) con su
 * reloj de juego, el edificio que la recibe (`building_ids`) y la cantidad.
 * Con eso se puede reconstruir la ocupación de la cola de cada Centro Urbano:
 *
 *   - una orden arranca el trabajo del edificio en ese instante;
 *   - la cola se vacía a razón de un aldeano cada `trainSeconds`;
 *   - si llega una orden cuando la cola ya está vacía, ese hueco es idle.
 *
 * Es una reconstrucción, no una medición: si una orden se canceló, la cola
 * simulada queda ocupada de más y el idle sale por defecto. Por eso la métrica
 * se publica como `derived` y con su definición versionada.
 *
 * Nada de esto requiere abrir el juego.
 */

const VILLAGERS = new Set([83, 293]);
const VILLAGER_TRAIN_SECONDS = 25;

function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data) || data instanceof Uint8Array) return Buffer.from(data);
  return null;
}

function actionOf(operation) {
  return operation && operation.Action ? operation.Action : null;
}

function typeOf(action) {
  const data = action && action.action_data;
  if (!data || typeof data !== 'object') return null;
  const keys = Object.keys(data);
  return keys.length ? keys[0] : null;
}

function payloadOf(action) {
  const data = action.action_data;
  return data[Object.keys(data)[0]];
}

function playerOf(payload, action) {
  const direct = Number(payload && payload.player_id);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const inner = Number(action && action.player_id);
  if (Number.isFinite(inner) && inner > 0) return inner;
  return null;
}

/** Une intervalos [inicio, fin) y devuelve el total ocupado. */
function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function unionSeconds(intervals) {
  return mergeIntervals(intervals).reduce((total, [start, end]) => total + (end - start), 0) / 1000;
}

/**
 * @param {Array} operations operaciones del replay
 * @param {{trainSeconds?: number}} options
 * @returns {Record<string, object>|null} idle por jugador, en segundos
 */
function tcIdleFromOperations(operations, { trainSeconds = VILLAGER_TRAIN_SECONDS } = {}) {
  const list = Array.isArray(operations) ? operations : [];
  const players = new Map();
  let earliest = null;

  for (const operation of list) {
    const action = actionOf(operation);
    if (!action) continue;
    if (typeOf(action) !== 'DeQueue') continue;
    const payload = payloadOf(action);
    const master = Number(payload.unit_id);
    if (!VILLAGERS.has(master)) continue; // el Centro Urbano solo entrena aldeanos
    const id = playerOf(payload, action);
    if (!id || id > 31) continue;
    const ms = Number(action.world_time) || 0;
    const amount = Math.max(1, Number(payload.amount) || 1);
    const buildings = Array.isArray(payload.building_ids) ? payload.building_ids : [];
    const keys = buildings.length ? buildings : [`p${id}`];

    if (!players.has(id)) players.set(id, { tcs: new Map(), orders: 0, villagers: 0 });
    const player = players.get(id);
    player.orders += 1;
    player.villagers += amount;
    if (earliest === null || ms < earliest) earliest = ms;

    for (const key of keys) {
      const tc = player.tcs.get(key) || { busyUntil: null, intervals: [] };
      const start = tc.busyUntil === null ? ms : Math.max(ms, tc.busyUntil);
      const end = start + amount * trainSeconds * 1000;
      tc.intervals.push([start, end]);
      tc.busyUntil = end;
      player.tcs.set(key, tc);
    }
  }

  if (!players.size) return null;

  const output = {};
  for (const [id, player] of [...players.entries()].sort((a, b) => a[0] - b[0])) {
    const all = [];
    for (const tc of player.tcs.values()) all.push(...tc.intervals);
    const lastEnd = all.reduce((max, [, end]) => Math.max(max, end), 0);
    const windowStart = earliest === null ? 0 : earliest;
    const windowSeconds = Math.max(0, (lastEnd - windowStart) / 1000);
    if (!windowSeconds) continue;
    const busySeconds = unionSeconds(all);
    output[id] = {
      tcIdleSeconds: Math.round((windowSeconds - busySeconds) * 10) / 10,
      tcBusySeconds: Math.round(busySeconds * 10) / 10,
      utilization: Math.round((busySeconds / windowSeconds) * 1000) / 1000,
      villagersTrained: player.villagers,
      orders: player.orders,
      townCenters: player.tcs.size,
      windowSeconds: Math.round(windowSeconds * 10) / 10,
    };
  }
  return output;
}

module.exports = { tcIdleFromOperations, VILLAGER_TRAIN_SECONDS, mergeIntervals };
