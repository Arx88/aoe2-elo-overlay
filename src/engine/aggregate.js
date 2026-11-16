'use strict';

/**
 * Acumulador de frames del motor.
 *
 * Traduce el stream binario a hechos de partida: producción, muertes, edades,
 * economía y conversiones. No guarda el patch del mundo (son decenas de MB por
 * frame): solo lo que el producto necesita, así una partida completa ocupa
 * unos pocos KB en memoria.
 */

const proto = require('./proto');

const VILLAGERS = new Set([83, 293]);
const AGES = ['dark', 'feudal', 'castle', 'imperial'];
const AGE_TECHS = { 101: 'feudal', 102: 'castle', 103: 'imperial' };

// Event.EventCase del protocolo.
const EVENT = {
  KILLED: 1, MARKET: 2, TRIBUTE: 3, CHAT: 4, SOUND: 5,
  DAMAGE: 6, CONVERSION: 7, TRAIN: 8, RESEARCH: 9, FARM: 10, WONDER: 11,
};

function createAccumulator({ startingVillagers = 3 } = {}) {
  return {
    startingVillagers,
    registry: new Map(),
    players: new Map(),
    timeline: [],
    totals: {
      production: 0, deaths: 0, kills: 0, unresolvedDeaths: 0,
      damageEvents: 0, killingBlows: 0, ageUps: 0, tributes: 0,
      marketTransactions: 0, conversions: 0, farmsLost: 0, chats: 0,
    },
    coverage: { firstWorldTime: null, lastWorldTime: 0, frames: 0, reconnects: 0 },
  };
}

function playerState(acc, id) {
  if (!acc.players.has(id)) {
    acc.players.set(id, {
      age: 'dark',
      ages: Object.fromEntries(AGES.map((age) => [age, null])),
      produced: { villagers: 0, units: 0, buildings: 0, byType: {} },
      lost: { villagers: 0, units: 0, buildings: 0, byType: {} },
      killed: { villagers: 0, units: 0, buildings: 0, byType: {} },
      techs: [],
    });
  }
  return acc.players.get(id);
}

function bucketOf(master) {
  return VILLAGERS.has(master) ? 'villagers' : 'units';
}

function count(section, bucket, master) {
  section[bucket] += 1;
  const key = String(master);
  section.byType[key] = (section.byType[key] || 0) + 1;
}

/** `Event` es un oneof: el primer campo es el tipo y su contenido el payload. */
function decodeEvent(raw) {
  const outer = proto.decodeFields(raw);
  if (!outer.length) return null;
  const payload = proto.decodeFields(outer[0].value);
  const fields = {};
  for (const field of payload) {
    fields[field.number] = field.wire === proto.WIRE_FIXED32
      ? proto.readFloat(field.value)
      : field.value;
  }
  return { tag: outer[0].number, fields };
}

function consumeSequence(acc, message) {
  const sequence = proto.decodeFields(message);
  for (const field of sequence) {
    if (field.number === 1) consumeFrame(acc, field.value);
  }
}

function consumeFrame(acc, raw) {
  const fields = proto.decodeFields(raw);
  const worldTime = proto.firstField(fields, 1, 0) || 0;
  acc.coverage.frames += 1;
  if (acc.coverage.firstWorldTime === null) acc.coverage.firstWorldTime = worldTime;
  if (worldTime > acc.coverage.lastWorldTime) acc.coverage.lastWorldTime = worldTime;
  for (const field of fields) {
    if (field.number === 3) applyEvent(acc, worldTime, field.value);
  }
}

function applyEvent(acc, worldTime, raw) {
  const event = decodeEvent(raw);
  if (!event) return;
  const { tag, fields } = event;

  if (tag === EVENT.TRAIN) {
    const owner = fields[1] || 0;
    const master = fields[2] || 0;
    const building = fields[3] || 0;
    const obj = fields[4] || 0;
    if (!(owner > 0 && owner < 32 && master > 0 && master < 10000)) return;
    if (obj) acc.registry.set(obj, { owner, master, kind: 'unit' });
    // Sin edificio no es una cola de producción (spawn de escenario).
    if (!building) return;
    const player = playerState(acc, owner);
    count(player.produced, bucketOf(master), master);
    acc.totals.production += 1;
    return;
  }

  if (tag === EVENT.RESEARCH) {
    const owner = fields[1] || 0;
    const tech = fields[2] || 0;
    if (!(owner > 0 && owner < 32 && tech > 0)) return;
    const player = playerState(acc, owner);
    player.techs.push(tech);
    const age = AGE_TECHS[tech];
    if (age && player.ages[age] === null) {
      player.ages[age] = worldTime;
      player.age = age;
      acc.totals.ageUps += 1;
    }
    return;
  }

  if (tag === EVENT.KILLED) {
    const victim = fields[1] || 0;
    const killer = fields[2] || 0;
    const info = acc.registry.get(victim);
    if (!info) {
      // Nunca vimos producir esa entidad: no inventamos a quién pertenece.
      acc.totals.unresolvedDeaths += 1;
      return;
    }
    const owner = playerState(acc, info.owner);
    const bucket = info.kind === 'building' ? 'buildings' : bucketOf(info.master);
    count(owner.lost, bucket, info.master);
    acc.totals.deaths += 1;
    if (killer) {
      const killerInfo = acc.registry.get(killer);
      if (killerInfo && killerInfo.owner !== info.owner) {
        const attacker = playerState(acc, killerInfo.owner);
        const killerBucket = killerInfo.kind === 'building' ? 'buildings' : bucketOf(killerInfo.master);
        count(attacker.killed, killerBucket, killerInfo.master);
        acc.totals.kills += 1;
      }
    }
    return;
  }

  if (tag === EVENT.DAMAGE) {
    acc.totals.damageEvents += 1;
    if (fields[5]) acc.totals.killingBlows += 1;
    return;
  }

  if (tag === EVENT.MARKET) {
    const owner = fields[1] || 0;
    if (owner > 0 && owner < 32) playerState(acc, owner);
    acc.totals.marketTransactions += 1;
    return;
  }

  if (tag === EVENT.TRIBUTE) {
    const sender = fields[1] || 0;
    const receiver = fields[2] || 0;
    if (sender > 0 && sender < 32) playerState(acc, sender);
    if (receiver > 0 && receiver < 32) playerState(acc, receiver);
    acc.totals.tributes += 1;
    return;
  }

  if (tag === EVENT.CONVERSION) {
    const target = fields[3] || 0;
    const newOwner = fields[4] || 0;
    const info = acc.registry.get(target);
    // La unidad cambia de dueño: sin esto, sus bajas futuras irían al jugador
    // equivocado.
    if (info && newOwner) info.owner = newOwner;
    acc.totals.conversions += 1;
    return;
  }

  if (tag === EVENT.FARM) {
    acc.totals.farmsLost += 1;
    return;
  }

  if (tag === EVENT.CHAT) {
    const owner = fields[1] || 0;
    if (owner > 0 && owner < 32) playerState(acc, owner);
    acc.totals.chats += 1;
  }
}

/** Cierra la captura y devuelve el artefacto crudo del motor. */
function snapshot(acc) {
  const players = {};
  for (const [id, player] of [...acc.players.entries()].sort((a, b) => a[0] - b[0])) {
    const alive = acc.startingVillagers + player.produced.villagers - player.lost.villagers;
    players[id] = {
      age: player.age,
      ages: { ...player.ages },
      techs: [...new Set(player.techs)].sort((a, b) => a - b),
      produced: { ...player.produced, byType: { ...player.produced.byType } },
      lost: { ...player.lost, byType: { ...player.lost.byType } },
      killed: { ...player.killed, byType: { ...player.killed.byType } },
      villagersAlive: Math.max(0, alive),
    };
  }
  const duration = Math.max(0, acc.coverage.lastWorldTime - (acc.coverage.firstWorldTime || 0));
  return {
    schemaVersion: 1,
    source: 'engine-events',
    clock: 'game-ms',
    coverage: {
      ...acc.coverage,
      durationSeconds: Math.round((duration / 1000) * 10) / 10,
    },
    totals: { ...acc.totals },
    players,
  };
}

module.exports = {
  EVENT, AGES, VILLAGERS, AGE_TECHS,
  createAccumulator, consumeSequence, consumeFrame, applyEvent, decodeEvent, snapshot,
};
