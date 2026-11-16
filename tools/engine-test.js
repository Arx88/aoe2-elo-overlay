'use strict';

/**
 * Pruebas del motor de reconstrucción.
 *
 * No necesitan el juego ni la red: cubren el códec, el contrato de
 * disponibilidad (un dato que no se midió nunca es 0) y los invariantes del
 * modelo. Las partes que hablan con el juego se prueban aparte, porque exigen
 * que AoE2 esté abierto.
 */

const assert = require('node:assert/strict');
const proto = require('../src/engine/proto');
const { GrpcError, STATUS } = require('../src/engine/grpc');
const {
  AGES, fingerprintReplay, metric, unavailable,
  fromFacts, fromEngine, fromRecord, mergeModel, validateModel,
} = require('../src/engine/model');
const { createAccumulator, consumeSequence, snapshot } = require('../src/engine/aggregate');
const { analyzeOperations } = require('../src/engine/offline');

// --- utilidades de protobuf ------------------------------------------------ //

function seq(...frames) {
  return Buffer.concat(frames.map((frame) => proto.encodeField(1, proto.WIRE_LENGTH, frame)));
}

function frame(worldTime, events = [], patch = Buffer.alloc(0)) {
  const parts = [proto.encodeField(1, proto.WIRE_VARINT, worldTime)];
  if (patch.length) parts.push(proto.encodeField(2, proto.WIRE_LENGTH, patch));
  for (const event of events) parts.push(proto.encodeField(3, proto.WIRE_LENGTH, event));
  return Buffer.concat(parts);
}

/** Event es un oneof: `tag` + payload. */
function event(tag, fields) {
  return proto.encodeField(tag, proto.WIRE_LENGTH, Buffer.concat(fields));
}

function intField(number, value) { return proto.encodeField(number, proto.WIRE_VARINT, value); }
function floatField(number, value) {
  const raw = Buffer.alloc(4);
  raw.writeFloatLE(value, 0);
  return proto.encodeField(number, proto.WIRE_FIXED32, raw);
}

function trainDone(owner, master, building, obj) {
  return event(8, [intField(1, owner), intField(2, master), intField(3, building), intField(4, obj)]);
}

function researchDone(owner, tech) {
  return event(9, [intField(1, owner), intField(2, tech), intField(3, 100)]);
}

function entityKilled(id, killer) {
  return event(1, [intField(1, id), intField(2, killer)]);
}

// --- códec ----------------------------------------------------------------- //

function testProto() {
  assert.equal(proto.encodeVarint(0).toString('hex'), '00');
  assert.equal(proto.encodeVarint(300).toString('hex'), 'ac02');
  const body = Buffer.concat([
    proto.encodeField(1, proto.WIRE_VARINT, 7),
    proto.encodeField(2, proto.WIRE_LENGTH, Buffer.from('hola')),
    floatField(3, 1.5),
  ]);
  const fields = proto.decodeFields(body);
  assert.equal(proto.firstField(fields, 1), 7);
  assert.equal(proto.firstField(fields, 2).toString(), 'hola');
  assert.equal(proto.readFloat(proto.firstField(fields, 3)), 1.5);
  assert.deepEqual(proto.decodeFields(Buffer.alloc(0)), []);
  assert.throws(() => proto.decodeFields(Buffer.from([0x0f, 0x01])), /wire no soportado/);
}

// --- cliente gRPC ---------------------------------------------------------- //

function testGrpcErrors() {
  assert.equal(new GrpcError(STATUS.UNAVAILABLE).code, 'game_not_running');
  assert.equal(new GrpcError(STATUS.PERMISSION_DENIED).code, 'engine_access_denied');
  assert.equal(new GrpcError(STATUS.UNIMPLEMENTED).code, 'engine_unsupported');
  assert.equal(GrpcError.isRetryable(new GrpcError(STATUS.UNAVAILABLE)), true);
  assert.equal(GrpcError.isRetryable(new GrpcError(STATUS.INTERNAL)), false);
}

// --- acumulador de eventos ------------------------------------------------- //

function testAccumulator() {
  const acc = createAccumulator({ startingVillagers: 3 });
  consumeSequence(acc, seq(frame(1000, [
    trainDone(1, 83, 27889, 31494),
    trainDone(2, 83, 27890, 31495),
    trainDone(1, 74, 27900, 31496),
    researchDone(1, 101),
  ])));
  consumeSequence(acc, seq(frame(2000, [
    entityKilled(31496, 31495),
  ])));
  const result = snapshot(acc);
  assert.equal(result.players[1].produced.villagers, 1);
  assert.equal(result.players[1].produced.units, 1, 'una unidad miliciana no cuenta como aldeano');
  assert.equal(result.players[1].ages.feudal, 1000);
  assert.equal(result.players[2].produced.villagers, 1);
  assert.equal(result.totals.production, 3);
  assert.equal(result.totals.deaths, 1, 'la muerte se atribuye por el registro de producción');
  assert.equal(result.players[1].lost.units, 1);
  assert.equal(result.players[2].killed.villagers, 1, 'el asesino era un aldeano, no una unidad militar');
  assert.equal(result.totals.unresolvedDeaths, 0);

  // Una muerte de una entidad que nunca vimos producir no se atribuye a nadie.
  const orphan = createAccumulator();
  consumeSequence(orphan, seq(frame(1000, [entityKilled(999, 1)])));
  const orphanResult = snapshot(orphan);
  assert.equal(orphanResult.totals.deaths, 0);
  assert.equal(orphanResult.totals.unresolvedDeaths, 1);

  // El reloj no retrocede y la cobertura refleja la ventana real.
  const coverage = createAccumulator();
  consumeSequence(coverage, seq(frame(5000, []), frame(7000, [])));
  const covered = snapshot(coverage);
  assert.equal(covered.coverage.firstWorldTime, 5000);
  assert.equal(covered.coverage.lastWorldTime, 7000);
  assert.equal(covered.coverage.frames, 2);
}

// --- contrato de disponibilidad -------------------------------------------- //

function testAvailability() {
  const missing = metric(null, 'x-v1', 'engine');
  assert.equal(missing.value, null);
  assert.equal(missing.availability, 'unavailable');
  assert.equal(unavailable('x-v1', 'engine', 'no_engine_capture').value, null);

  const noEngine = fromEngine(null);
  assert.equal(noEngine.available, false);
  assert.equal(noEngine.reason, 'no_engine_capture');

  // Captura larga con daño y sin ninguna muerte: el motor puede no reportarlas,
  // así que las bajas quedan sin dato y con aviso. Nunca un cero.
  const engine = {
    coverage: { firstWorldTime: 0, lastWorldTime: 600000, durationSeconds: 600, frames: 30000 },
    totals: { deaths: 0, damageEvents: 400, unresolvedDeaths: 0 },
    players: {
      1: {
        age: 'castle',
        ages: { dark: null, feudal: 620000, castle: 1200000, imperial: null },
        produced: { villagers: 30, units: 4 },
        lost: { villagers: 0, units: 0, buildings: 0 },
        killed: { villagers: 0, units: 0, buildings: 0 },
        villagersAlive: 30,
      },
    },
  };
  const facts = fromEngine(engine);
  assert.equal(facts.available, true);
  const player = facts.players['1'];
  assert.equal(player.villagersProduced.value, 30);
  assert.equal(player.villagersProduced.availability, 'measured');
  assert.equal(player.villagersLost.value, null);
  assert.equal(player.villagersLost.availability, 'unavailable');
  assert.equal(player.villagersLost.reason, 'engine_deaths_unreported');
  assert.equal(player.unitsKilled.value, null);
  assert.ok(facts.warnings.some((warning) => warning.code === 'engine_deaths_unreported'));

  // Si el motor sí reportó muertes, el valor se publica tal cual.
  const withDeaths = { ...engine, totals: { ...engine.totals, deaths: 12 } };
  const resolved = fromEngine(withDeaths).players['1'];
  assert.equal(resolved.villagersLost.value, 0);
  assert.equal(resolved.villagersLost.availability, 'measured');
}

// --- fusión de fuentes ------------------------------------------------------ //

function testMerge() {
  const record = {
    players: {
      1: { age: 'castle', ages: { dark: null, feudal: 620000, castle: 1200000, imperial: null } },
      3: { age: 'feudal', ages: { dark: null, feudal: 700000, castle: null, imperial: null } },
    },
  };
  const engine = {
    coverage: { firstWorldTime: 0, lastWorldTime: 900000, durationSeconds: 900, frames: 40000 },
    totals: { deaths: 6, damageEvents: 900, unresolvedDeaths: 1 },
    players: {
      1: {
        age: 'castle',
        ages: { dark: null, feudal: 615000, castle: 1195000, imperial: null },
        produced: { villagers: 40, units: 6 },
        lost: { villagers: 2, units: 1, buildings: 0 },
        killed: { villagers: 0, units: 3, buildings: 0 },
        villagersAlive: 38,
      },
    },
  };
  const model = mergeModel({ matchKey: 'abc-1', record, engine });
  assert.equal(model.sources.engine.available, true);
  assert.equal(model.sources.record.available, true);

  // Las edades las manda la repetición: es determinista y siempre está.
  assert.equal(model.players['1'].ages.feudal.source, 'record');
  assert.equal(model.players['1'].ages.feudal.value, 620000);
  assert.equal(model.players['1'].villagersProduced.source, 'engine');
  assert.equal(model.players['1'].villagersProduced.value, 40);
  assert.equal(model.players['1'].unitsKilled.value, 3);

  // Un jugador que solo aparece en la repetición mantiene sus edades.
  assert.equal(model.players['3'].ages.feudal.value, 700000);
  assert.equal(model.players['3'].villagersProduced.availability, 'unavailable');

  const validated = validateModel(model);
  assert.equal(validated.ok, true, validated.problems.join(' | '));

  // Una discrepancia grande se registra, no se promedia en silencio.
  const shifted = {
    ...engine,
    players: { 1: { ...engine.players[1], ages: { dark: null, feudal: 400000, castle: null, imperial: null } } },
  };
  const conflicting = mergeModel({ matchKey: 'abc-1', record, engine: shifted });
  assert.equal(conflicting.conflicts.length, 1);
  assert.equal(conflicting.conflicts[0].age, 'feudal');
  assert.equal(conflicting.players['1'].ages.feudal.value, 620000);

  // Invariantes: nada negativo, nada imposible.
  const broken = mergeModel({ matchKey: 'x', record, engine });
  broken.players['1'].villagersAlive.value = 999;
  broken.players['1'].villagersLost.value = -1;
  const problems = validateModel(broken);
  assert.equal(problems.ok, false);
  assert.ok(problems.problems.length >= 2);
}

// --- huella de repetición --------------------------------------------------- //

function testFingerprint() {
  const base = { filePath: 'C:/r/a.aoe2record', size: 1000, mtimeMs: 5, build: '101.103' };
  const first = fingerprintReplay(base);
  assert.equal(first, fingerprintReplay({ ...base }));
  assert.notEqual(first, fingerprintReplay({ ...base, size: 1001 }));
  assert.notEqual(first, fingerprintReplay({ ...base, mtimeMs: 6 }));
  assert.notEqual(first, fingerprintReplay({ ...base, build: '101.104' }));
  assert.match(first, /^[0-9a-f]{8}-1000$/);
}

// --- cuadro final por jugador -------------------------------------------- //

function operation(type, ms, payload) {
  return { Action: { world_time: ms, action_data: { [type]: payload } } };
}

function testOfflineAggregates() {
  const ops = [
    operation('DeQueue', 20_000, { player_id: 1, unit_id: 83, amount: 1 }),
    operation('DeQueue', 22_000, { player_id: 1, unit_id: 83, amount: 1 }),
    operation('Research', 480_000, { player_id: 1, technology_type: 101 }),
  ];

  // Sin cuadro final, la producción se mide y las bajas no se inventan.
  const plain = analyzeOperations(ops);
  assert.equal(plain.deathsMeasured, false);
  assert.equal(plain.players[1].produced.villagers, 2);
  assert.equal(plain.players[1].lost, null);
  const plainFacts = fromFacts(plain, { source: 'record' });
  assert.equal(plainFacts.players['1'].villagersProduced.value, 2);
  assert.equal(plainFacts.players['1'].villagersLost.value, null);
  assert.equal(plainFacts.players['1'].villagersLost.reason, 'replay_has_no_deaths');

  // Con cuadro final, se publican como medidas y se descuentan de los vivos.
  const withStats = analyzeOperations(ops, {
    source: {
      zheader: {
        player_stats: [
          { player_number: 1, villagers_lost: 5, units_lost: 2, units_killed: 4, villagers_killed: 1 },
          { player_number: 2, villagers_lost: 0, units_lost: 0, units_killed: 0, villagers_killed: 0 },
        ],
      },
    },
  });
  assert.equal(withStats.deathsMeasured, true);
  assert.equal(withStats.players[1].lost.villagers, 5);
  assert.equal(withStats.players[2].produced.villagers, 0, 'el cuadro final crea al jugador aunque no haya comandos');
  assert.equal(withStats.players[1].villagersAlive, 3 + 2 - 5);
  const measured = fromFacts(withStats, { source: 'record' });
  assert.equal(measured.players['1'].villagersLost.value, 5);
  assert.equal(measured.players['1'].villagersLost.availability, 'measured');
  assert.equal(measured.players['1'].unitsLost.value, 2);
  assert.equal(measured.players['1'].unitsKilled.value, 5, 'unidades + aldeanos del rival eliminados');
  assert.equal(measured.players['2'].villagersLost.value, 0, 'un cero declarado por el archivo sí es un cero');
  assert.ok(!measured.warnings.some((warning) => warning.code === 'replay_has_no_deaths'));
}

function testTcIdle() {
  const { tcIdleFromOperations } = require('../src/engine/idle');
  const order = (player, ms, amount, building) => ({
    time: ms,
    Action: {
      player_id: player,
      world_time: ms,
      action_data: {
        DeQueue: { player_id: player, unit_id: 83, amount, building_ids: [building], building_type: 109 },
      },
    },
  });

  // Un solo Centro Urbano que descansa 50 s entre el segundo y el tercer aldeano.
  const one = tcIdleFromOperations([order(1, 0, 1, 100), order(1, 25000, 1, 100), order(1, 100000, 1, 100)]);
  assert.equal(one[1].villagersTrained, 3);
  assert.equal(one[1].windowSeconds, 125);
  assert.equal(one[1].tcIdleSeconds, 50, 'el hueco de 50 s es idle');
  assert.equal(one[1].utilization, 0.6);

  // Dos Centros Urbanos: el segundo cubre el hueco del primero → sin idle.
  const two = tcIdleFromOperations([order(1, 0, 1, 100), order(1, 25000, 1, 200), order(1, 50000, 1, 100)]);
  assert.equal(two[1].townCenters, 2);
  assert.equal(two[1].tcIdleSeconds, 0, 'la unión de intervalos evita contar idle falso');

  // Unidades que no son aldeanos no ocupan el Centro Urbano.
  const other = tcIdleFromOperations([
    { Action: { player_id: 1, world_time: 0, action_data: { DeQueue: { player_id: 1, unit_id: 448, amount: 1, building_ids: [200] } } } },
  ]);
  assert.equal(other, null);
}

function testProduction() {
  const { productionFromOperations, unitInfo } = require('../src/engine/production');
  const order = (ids, ms, unit = 83, amount = 1, type = 109) => ({
    Action: {
      player_id: 1,
      world_time: ms,
      action_data: { DeQueue: { player_id: 1, unit_id: unit, amount, building_ids: ids, building_type: type } },
    },
  });

  // Dos CU seleccionados: el pedido lo ejecuta uno, no los dos.
  const shared = productionFromOperations([order([10, 20], 0), order([10, 20], 25000)]);
  assert.equal(shared[1].villagersTrained, 2, 'dos órdenes son dos aldeanos, no cuatro');
  assert.equal(Object.keys(shared[1].buildings).length, 2, 'ambos CU quedan registrados');
  assert.equal(shared[1].buildings['10'].units[unitInfo(83).key], 1, 'el primero recibe la orden');

  // Producción militar separada por edificio y por tipo de unidad.
  const military = productionFromOperations([
    order([500], 0, 74, 3, 12),
    order([500], 63000, 93, 2, 12),
    order([900], 10000, 38, 1, 101),
  ]);
  assert.equal(military[1].buildings['500'].typeId, 12, 'cuarteles');
  assert.equal(military[1].buildings['500'].category, 'military');
  assert.equal(military[1].buildings['500'].totalUnits, 5);
  assert.equal(military[1].buildings['500'].units[unitInfo(74).key], 3, 'milicias');
  assert.equal(military[1].buildings['900'].units[unitInfo(38).key], 1, 'caballeros');
  assert.ok(unitInfo(83).name && unitInfo(83).trainSeconds > 0, 'la tabla trae nombre y tiempo real');
  assert.equal(unitInfo(882).key !== 'unidad-882', true, 'ningún id estándar queda sin mapear');
  assert.equal(military[1].villagersTrained, 0, 'un taller militar no produce aldeanos');
  // 3 milicias de 21 s = 63 s; la siguiente orden llega justo al terminar.
  assert.equal(military[1].buildings['500'].idleSeconds, 0);
}

function main() {
  testProto();
  testGrpcErrors();
  testAccumulator();
  testAvailability();
  testMerge();
  testFingerprint();
  testOfflineAggregates();
  testTcIdle();
  testProduction();
  console.log('Motor: códec, acumulador, disponibilidad, fusión, invariantes e idle OK.');
}

main();
