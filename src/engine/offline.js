'use strict';

/**
 * Reconstrucción offline desde el archivo de la repetición.
 *
 * Esta es la capa que siempre está disponible: lee el `.aoe2record`, no abre
 * el juego, no roba el foco y no necesita instalar nada más. Devuelve el mismo
 * formato que el motor en vivo para que el modelo lo consuma igual.
 *
 * Qué sí se puede afirmar desde el archivo:
 *   - órdenes de entrenamiento (`DeQueue` con unidad, cantidad y edificio);
 *     son órdenes, no confirmaciones de salida: la unidad aparece al terminar;
 *   - edades y tecnologías (`Research`);
 *   - edificios con posición y momento (`Build`);
 *   - órdenes de ejército y hacia dónde (movimientos, ataque-mover, patrulla);
 *   - economía de mercado, tributos, rendiciones y auto-borrados.
 *
 * Qué NO trae el archivo: bajas. Ninguna repetición de AoE2 guarda quién murió.
 * Por eso el resultado marca `deathsMeasured: false` y el modelo publica esas
 * métricas como «sin dato», nunca como cero.
 */

const { AGE_TECHS, VILLAGERS, AGES } = require('./aggregate');

const UNIT = { MIN: 1000, MAX: 10000 };

/**
 * Nombres con los que distintas builds exponen el cuadro final de estadísticas
 * por jugador. Es tolerante a propósito: el bloque no está en todas las
 * versiones, y cuando no está preferimos no inventar nada.
 */
const AGGREGATE_FIELDS = {
  villagersLost: ['villagers_lost', 'lost_villagers', 'villager_lost'],
  unitsLost: ['units_lost', 'lost_units', 'military_lost'],
  unitsKilled: ['units_killed', 'killed_units', 'military_killed'],
  villagersKilled: ['villagers_killed', 'killed_villagers'],
};

function findAggregateRows(source) {
  if (!source || typeof source !== 'object') return null;
  const header = source.zheader || source.header || {};
  const candidates = [
    header.player_stats,
    header.extra_player_stats,
    header.save && header.save.player_stats,
    source.player_stats,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return null;
}

/** Agregados por jugador del cuadro final, si el archivo los trae. */
function readAggregates(source) {
  const rows = findAggregateRows(source);
  if (!rows) return null;
  const result = new Map();
  const pick = (row, names) => {
    for (const name of names) {
      const value = Number(row[name]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
    return null;
  };
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = Number(row.player_number ?? row.player_id ?? row.player);
    if (!(id > 0 && id < 32)) continue;
    result.set(id, {
      villagersLost: pick(row, AGGREGATE_FIELDS.villagersLost),
      unitsLost: pick(row, AGGREGATE_FIELDS.unitsLost),
      unitsKilled: pick(row, AGGREGATE_FIELDS.unitsKilled),
      villagersKilled: pick(row, AGGREGATE_FIELDS.villagersKilled),
    });
  }
  return result.size ? result : null;
}

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
  const nested = action && action.game_command && Number(action.game_command.player_id);
  return Number.isFinite(nested) && nested > 0 ? nested : null;
}

function playerState(players, id) {
  if (!players.has(id)) {
    players.set(id, {
      age: 'dark',
      ages: Object.fromEntries(AGES.map((age) => [age, null])),
      techs: new Set(),
      produced: { villagers: 0, units: 0, buildings: 0, byType: {} },
      buildings: [],
      orders: { move: 0, attackMove: 0, patrol: 0, interact: 0 },
      market: 0,
      tributesSent: 0,
      tributesReceived: 0,
      resignMs: null,
      selfDeleted: 0,
    });
  }
  return players.get(id);
}

function bump(section, master, amount = 1) {
  const key = String(master);
  section.byType[key] = (section.byType[key] || 0) + amount;
}

/**
 * @param {Array} operations operaciones de `parse_rec().chapters[].operations`
 * @param {{startingVillagers?: number}} options
 */
function analyzeOperations(operations, { startingVillagers = 3, source = null } = {}) {
  const players = new Map();
  const list = Array.isArray(operations) ? operations : [];
  let firstMs = null;
  let lastMs = 0;
  let production = 0;
  let ageUps = 0;
  let actions = 0;

  for (const operation of list) {
    const action = actionOf(operation);
    if (!action) continue;
    const type = typeOf(action);
    if (!type) continue;
    const payload = payloadOf(action);
    // `world_time` es el reloj de juego en ms. Es la única marca temporal
    // válida: el orden de los comandos no es cronológico entre jugadores.
    const ms = Number(action.world_time) || 0;
    if (firstMs === null || ms < firstMs) firstMs = ms;
    if (ms > lastMs) lastMs = ms;
    const id = playerOf(payload, action);
    if (!id || id > 31) continue;
    const player = playerState(players, id);
    actions += 1;

    if (type === 'DeQueue') {
      // En las repeticiones de DE, `DeQueue` es la orden de entrenar (no una
      // cancelación): trae unidad, cantidad y los edificios que la reciben.
      const master = Number(payload.unit_id);
      const amount = Math.max(1, Number(payload.amount) || 1);
      if (!(master > 0 && master < UNIT.MAX)) continue;
      player.produced[VILLAGERS.has(master) ? 'villagers' : 'units'] += amount;
      bump(player.produced, master, amount);
      production += amount;
      continue;
    }

    if (type === 'Build') {
      const raw = toBuffer(payload.data);
      if (!raw || raw.length < 16) continue;
      const x = raw.readFloatLE(4);
      const y = raw.readFloatLE(8);
      const buildingType = raw.readInt32LE(12);
      if (!(buildingType > 0 && buildingType < UNIT.MAX)) continue;
      if (!(x > 0 && x < 400 && y > 0 && y < 400)) continue;
      player.produced.buildings += 1;
      bump(player.produced, buildingType);
      player.buildings.push({
        type: buildingType,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        ms,
      });
      continue;
    }

    if (type === 'Research') {
      const tech = Number(payload.technology_type);
      if (!(tech > 0 && tech < UNIT.MAX)) continue;
      player.techs.add(tech);
      const age = AGE_TECHS[tech];
      if (age && player.ages[age] === null) {
        player.ages[age] = ms;
        player.age = age;
        ageUps += 1;
      }
      continue;
    }

    if (type === 'Move') {
      player.orders.move += 1;
      continue;
    }
    if (type === 'DeAttackMove' || type === 'AttackGround') {
      player.orders.attackMove += 1;
      continue;
    }
    if (type === 'Patrol') {
      player.orders.patrol += 1;
      continue;
    }
    if (type === 'Interact') {
      player.orders.interact += 1;
      continue;
    }
    if (type === 'Buy' || type === 'Sell') {
      player.market += 1;
      continue;
    }
    if (type === 'Tribute') {
      player.tributesSent += 1;
      continue;
    }
    if (type === 'Delete') {
      player.selfDeleted += 1;
      continue;
    }
    if (type === 'Resign') {
      if (player.resignMs === null) player.resignMs = ms;
    }
  }

  // Si el archivo expone el cuadro final, cada jugador que aparece ahí existe
  // aunque no haya emitido comandos en la ventana analizada.
  const aggregates = readAggregates(source);
  if (aggregates) {
    for (const id of aggregates.keys()) playerState(players, id);
  }
  const output = {};
  for (const [id, player] of [...players.entries()].sort((a, b) => a[0] - b[0])) {
    const aggregate = aggregates ? aggregates.get(id) || null : null;
    output[id] = {
      age: player.age,
      ages: { ...player.ages },
      techs: [...player.techs].sort((a, b) => a - b),
      produced: {
        villagers: player.produced.villagers,
        units: player.produced.units,
        buildings: player.produced.buildings,
        byType: player.produced.byType,
      },
      buildings: player.buildings,
      orders: player.orders,
      market: player.market,
      tributesSent: player.tributesSent,
      resigned: player.resignMs !== null,
      resignMs: player.resignMs,
      selfDeleted: player.selfDeleted,
      // La repetición no guarda muertes: el cálculo de vivos se limita a lo
      // producido. El modelo lo publica como derivado, no como medido.
      villagersAlive: startingVillagers + player.produced.villagers -
        (aggregate && aggregate.villagersLost !== null ? aggregate.villagersLost : 0),
      // Solo cuando el archivo trae el cuadro final: son totales de partida,
      // no eventos, así que no hay desglose por minuto.
      lost: aggregate ? {
        villagers: aggregate.villagersLost ?? 0,
        units: aggregate.unitsLost ?? 0,
        buildings: 0,
      } : null,
      killed: aggregate ? {
        villagers: aggregate.villagersKilled ?? 0,
        units: aggregate.unitsKilled ?? 0,
        buildings: 0,
      } : null,
    };
  }

  return {
    schemaVersion: 1,
    source: 'offline-replay',
    clock: 'game-ms',
    deathsMeasured: Boolean(aggregates),
    coverage: {
      firstWorldTime: firstMs === null ? null : firstMs,
      lastWorldTime: lastMs,
      durationSeconds: Math.round(((lastMs - (firstMs || 0)) / 1000) * 10) / 10,
      frames: 0,
      complete: true,
      actions,
    },
    totals: {
      production,
      deaths: 0,
      kills: 0,
      unresolvedDeaths: 0,
      damageEvents: 0,
      ageUps,
    },
    players: output,
  };
}

module.exports = { analyzeOperations, AGE_TECHS };
