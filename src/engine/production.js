'use strict';

/**
 * Producción por edificio, reconstruida del archivo de la repetición.
 *
 * Cada orden de entrenamiento (`action_data.DeQueue`) trae:
 *   - `unit_id`      qué unidad se pidió,
 *   - `amount`       cuántas,
 *   - `building_ids` qué edificio(s) estaban seleccionados,
 *   - `building_type` tipo de ese edificio.
 *
 * El pedido lo ejecuta **uno** de los edificios seleccionados (el de la cola
 * más corta); los demás solo aparecen por estar en la selección. Contarlo en
 * todos multiplicaba la producción, así que se atribuye a uno solo.
 *
 * Los conteos son exactos: son órdenes registradas. El tiempo de idle es una
 * reconstrucción, porque una orden cancelada no deja rastro y el archivo no
 * guarda el estado de la cola. Se publica como `derived`.
 *
 * Nombres y tiempos de entrenamiento salen de `unit-names.json`, generado del
 * dataset del juego y de sus textos: no hay ids sin mapear ni tiempos
 * estimados.
 */

const TABLE = require('./unit-names.json');

const UNIT_TABLE = TABLE.units;
const BUILDING_TABLE = TABLE.buildings;

// El Centro Urbano y los talleres producen; el resto de edificios no.
const PRODUCING_CATEGORY = {
  109: 'economy', // centro urbano
  12: 'military', // cuarteles
  87: 'military', // galería de tiro con arco
  101: 'military', // establo
  49: 'military', // taller de asedio
  45: 'military', // muelle
  82: 'military', // castillo
  104: 'military', // monasterio
};

function unitInfo(id) {
  const known = UNIT_TABLE[id];
  if (known) return known;
  return { name: `Unidad ${id}`, key: `unidad-${id}` };
}

function buildingInfo(id) {
  const known = BUILDING_TABLE[id];
  if (known) return known;
  return { name: `Edificio ${id}`, key: `edificio-${id}` };
}

function mergeIntervals(intervals) {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function ensureBuilding(player, key, buildingType, ms) {
  if (player.buildings.has(key)) return player.buildings.get(key);
  const info = buildingInfo(buildingType);
  const building = {
    id: key,
    typeId: buildingType,
    type: info.key,
    typeName: info.name,
    category: PRODUCING_CATEGORY[buildingType] || 'other',
    units: {},
    orders: 0,
    intervals: [],
    busyUntil: null,
    firstOrderMs: ms,
    lastOrderMs: ms,
  };
  player.buildings.set(key, building);
  return building;
}

/**
 * @param {Array} operations operaciones del replay
 */
function productionFromOperations(operations) {
  const list = Array.isArray(operations) ? operations : [];
  const players = new Map();

  for (const operation of list) {
    const action = operation && operation.Action;
    const data = action && action.action_data;
    if (!data) continue;
    const type = Object.keys(data)[0];
    if (type !== 'DeQueue') continue;
    const payload = data[type];
    const playerId = Number(payload.player_id ?? action.player_id);
    if (!Number.isFinite(playerId) || playerId <= 0 || playerId > 31) continue;
    const unitId = Number(payload.unit_id);
    if (!Number.isFinite(unitId) || unitId <= 0) continue;
    const amount = Math.max(1, Number(payload.amount) || 1);
    const ms = Number(action.world_time) || 0;
    const buildingType = Number(payload.building_type) || 0;
    const unit = unitInfo(unitId);
    const trainSeconds = unit.trainSeconds || 25;

    if (!players.has(playerId)) players.set(playerId, { buildings: new Map() });
    const player = players.get(playerId);

    const candidates = (Array.isArray(payload.building_ids) && payload.building_ids.length
      ? payload.building_ids
      : [`tipo_${buildingType}`]).map((id) => ensureBuilding(player, String(id), buildingType, ms));
    candidates.sort((left, right) => {
      const a = left.busyUntil === null ? -1 : left.busyUntil;
      const b = right.busyUntil === null ? -1 : right.busyUntil;
      if (a !== b) return a - b;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });

    const building = candidates[0];
    building.orders += 1;
    building.units[unitId] = (building.units[unitId] || 0) + amount;
    building.lastOrderMs = Math.max(building.lastOrderMs, ms);
    building.firstOrderMs = Math.min(building.firstOrderMs, ms);

    const start = building.busyUntil === null ? ms : Math.max(ms, building.busyUntil);
    const end = start + amount * trainSeconds * 1000;
    building.intervals.push([start, end]);
    building.busyUntil = end;
  }

  if (!players.size) return null;

  const output = {};
  for (const [playerId, player] of [...players.entries()].sort((a, b) => a[0] - b[0])) {
    const buildings = {};
    const categories = {};
    const names = {};
    let villagers = 0;

    for (const building of player.buildings.values()) {
      const merged = mergeIntervals(building.intervals);
      const busySeconds = merged.reduce((total, [s, e]) => total + (e - s), 0) / 1000;
      const windowSeconds = (building.busyUntil - building.firstOrderMs) / 1000;

      const units = {};
      let totalUnits = 0;
      for (const [unitId, count] of Object.entries(building.units)) {
        const unit = unitInfo(Number(unitId));
        units[unit.key] = (units[unit.key] || 0) + count;
        names[unit.key] = unit.name;
        totalUnits += count;
        if (Number(unitId) === 83 || Number(unitId) === 293) villagers += count;
      }

      buildings[building.id] = {
        typeId: building.typeId,
        type: building.type,
        typeName: building.typeName,
        category: building.category,
        units,
        totalUnits,
        orders: building.orders,
        firstOrderSeconds: Math.round(building.firstOrderMs / 100) / 10,
        lastOrderSeconds: Math.round(building.lastOrderMs / 100) / 10,
        busySeconds: Math.round(busySeconds * 10) / 10,
        idleSeconds: Math.max(0, Math.round((windowSeconds - busySeconds) * 10) / 10),
      };

      names[building.type] = building.typeName;
      const bucket = categories[building.type] || {
        name: building.typeName, buildings: 0, totalUnits: 0, units: {}, busySeconds: 0, idleSeconds: 0,
      };
      bucket.buildings += 1;
      bucket.totalUnits += totalUnits;
      bucket.busySeconds += buildings[building.id].busySeconds;
      bucket.idleSeconds += buildings[building.id].idleSeconds;
      for (const [key, count] of Object.entries(units)) {
        bucket.units[key] = (bucket.units[key] || 0) + count;
      }
      categories[building.type] = bucket;
    }

    output[playerId] = { villagersTrained: villagers, buildings, categories, names };
  }
  return output;
}

module.exports = {
  productionFromOperations,
  unitInfo,
  buildingInfo,
  UNIT_TABLE,
  BUILDING_TABLE,
};
