'use strict';

/**
 * Modelo normalizado de la partida.
 *
 * Regla central del producto: **nunca se muestra un cero por falta de datos**.
 * Cada métrica llega con `value`, `availability` y `definition`, igual que el
 * resto de la telemetría de la app. Si una fuente no cubrió la ventana, o la
 * repetición no contiene ese hecho, el valor es `null` y queda un `warning`.
 *
 * Fuentes, en orden de preferencia:
 *   1. `record`  — el propio archivo de la repetición. Siempre disponible,
 *                  offline, sin abrir el juego. Es la base que se cobra.
 *   2. `offline` — reconstrucción del archivo: producción, edades, edificios y
 *                  órdenes. Misma fuente, más hechos.
 *   3. `engine`  — captura del motor en vivo. Opcional: exige abrir el juego y
 *                  material TLS de un tercero, así que no se empaqueta.
 *
 * Las bajas solo existen en (3). Ninguna repetición guarda muertes, así que sin
 * motor se publican como «sin dato» con el motivo explícito.
 */

const AGES = ['dark', 'feudal', 'castle', 'imperial'];
const DEFINITIONS = {
  ageMs: 'age-reached-record-v1',
  ageMsEngine: 'age-reached-engine-v1',
  villagersProduced: 'villagers-produced-replay-v1',
  villagersLost: 'villagers-lost-engine-v1',
  unitsLost: 'units-lost-engine-v1',
  kills: 'kills-engine-v1',
};

const DEATH_METRICS = ['villagersLost', 'unitsLost', 'unitsKilled'];

function fingerprintReplay({ filePath, size, mtimeMs, build = null }) {
  const key = [filePath, size, Math.round(mtimeMs || 0), build || ''].join('|');
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}-${size}`;
}

function metric(value, definition, source, availability = 'measured', extra = {}) {
  const known = value !== null && value !== undefined && Number.isFinite(value);
  return {
    value: known ? value : null,
    definition,
    source,
    availability: known ? availability : 'unavailable',
    ...extra,
  };
}

function unavailable(definition, source, reason) {
  return { value: null, definition, source, availability: 'unavailable', reason };
}

function emptyPlayer(id) {
  return {
    id,
    age: null,
    ages: Object.fromEntries(AGES.map((age) => [age, null])),
    villagersProduced: unavailable(DEFINITIONS.villagersProduced, 'record', 'no_replay_facts'),
    villagersAlive: unavailable(DEFINITIONS.villagersProduced, 'record', 'no_replay_facts'),
    villagersLost: unavailable(DEFINITIONS.villagersLost, 'engine', 'no_engine_capture'),
    unitsLost: unavailable(DEFINITIONS.unitsLost, 'engine', 'no_engine_capture'),
    unitsKilled: unavailable(DEFINITIONS.kills, 'engine', 'no_engine_capture'),
    buildings: null,
    buildOrder: null,
  };
}

/**
 * Hechos que llegan de una captura (motor en vivo) o de la reconstrucción
 * offline. `source` decide cómo se etiqueta, porque al usuario le importa de
 * dónde salió el número tanto como el número.
 */
function fromFacts(facts, { source = 'engine' } = {}) {
  const warnings = [];
  const players = {};
  if (!facts || !facts.players) {
    return {
      available: false,
      reason: (facts && facts.reason) || (source === 'engine' ? 'no_engine_capture' : 'no_replay_facts'),
      players,
      warnings,
      source,
    };
  }

  const coverage = facts.coverage || {};
  const coveredMinutes = (coverage.durationSeconds || 0) / 60;
  // Sin muertes no sabemos si no hubo o si la fuente no las reporta. Solo se
  // publican como cero cuando la propia fuente afirma haberlas medido.
  const deathsMeasured = facts.deathsMeasured === true ||
    (facts.deathsMeasured !== false && Number(facts.totals && facts.totals.deaths) > 0);
  const gapReason = facts.deathsMeasured === false
    ? 'replay_has_no_deaths'
    : 'engine_deaths_unreported';
  const damageSeen = Number(facts.totals && facts.totals.damageEvents) > 0;

  if (!deathsMeasured && (source === 'record' || (coveredMinutes >= 8 && damageSeen))) {
    warnings.push({
      code: source === 'record' ? 'replay_has_no_deaths' : 'engine_deaths_unreported',
      detail: source === 'record'
        ? 'La repetición no contiene información de bajas.'
        : `Se capturaron ${coveredMinutes.toFixed(1)} min con daño y ninguna muerte reportada.`,
    });
  }

  for (const [id, raw] of Object.entries(facts.players)) {
    const player = emptyPlayer(Number(id));
    const produce = raw.produced || {};
    const lost = raw.lost || {};
    const killed = raw.killed || {};

    player.villagersProduced = metric(produce.villagers, DEFINITIONS.villagersProduced, source);
    player.villagersAlive = metric(raw.villagersAlive, DEFINITIONS.villagersProduced, source, 'derived');
    for (const key of DEATH_METRICS) {
      player[key] = unavailable(DEFINITIONS[key], source, gapReason);
    }
    if (deathsMeasured) {
      player.villagersLost = metric(lost.villagers, DEFINITIONS.villagersLost, source);
      player.unitsLost = metric(lost.units, DEFINITIONS.unitsLost, source);
      player.unitsKilled = metric(
        (killed.units || 0) + (killed.villagers || 0),
        DEFINITIONS.kills,
        source,
      );
    }
    player.age = raw.age || null;
    player.buildings = Array.isArray(raw.buildings) ? raw.buildings : null;
    for (const age of AGES) {
      const ms = raw.ages ? raw.ages[age] : null;
      player.ages[age] = ms === null || ms === undefined
        ? null
        : metric(ms, source === 'engine' ? DEFINITIONS.ageMsEngine : DEFINITIONS.ageMs, source);
    }
    players[id] = player;
  }

  return {
    available: true,
    players,
    warnings,
    source,
    deathsMeasured,
    coverage: {
      startMs: coverage.firstWorldTime ?? null,
      endMs: coverage.lastWorldTime ?? null,
      complete: coverage.complete === true,
      minutes: Math.round(coveredMinutes * 10) / 10,
    },
    diagnostics: {
      frames: coverage.frames || 0,
      reconnects: coverage.reconnects || 0,
      wallSeconds: coverage.wallSeconds || 0,
      actions: coverage.actions || 0,
      unresolvedDeaths: facts.totals ? facts.totals.unresolvedDeaths || 0 : 0,
    },
  };
}

/** Compatibilidad: el motor en vivo y la capa offline comparten contrato. */
function fromEngine(engine, options = {}) {
  return fromFacts(engine, { source: 'engine', ...options });
}

/** Hechos mínimos que el parser de la repetición ya produce (edades, apertura). */
function fromRecord(record) {
  if (!record || !record.players) return { available: false, players: {}, warnings: [] };
  const players = {};
  for (const [id, raw] of Object.entries(record.players)) {
    const player = emptyPlayer(Number(id));
    const ages = raw.ages || {};
    player.age = raw.age || 'dark';
    for (const age of AGES) {
      const ms = ages[age];
      player.ages[age] = ms === null || ms === undefined
        ? null
        : metric(ms, DEFINITIONS.ageMs, 'record');
    }
    if (Array.isArray(raw.buildOrder) && raw.buildOrder.length) {
      player.buildOrder = raw.buildOrder;
    }
    players[id] = player;
  }
  return { available: true, players, warnings: [] };
}

/**
 * Fusiona fuentes sin mezclar responsabilidades:
 *   - edades: manda la repetición (determinista y siempre presente);
 *   - producción y posiciones: la fuente con hechos (motor si está, si no
 *     la reconstrucción offline);
 *   - bajas: solo del motor, y con su disponibilidad explícita.
 * Cualquier discrepancia se registra en vez de resolverse en silencio.
 */
function mergeModel({ matchKey, record, engine, offline }) {
  const recordFacts = fromRecord(record);
  const live = engine && engine.players ? engine : null;
  const fallback = offline && offline.players ? offline : null;
  const chosen = live || fallback;
  const facts = fromFacts(chosen, { source: live ? 'engine' : 'record' });
  const warnings = [...recordFacts.warnings, ...facts.warnings];
  const conflicts = [];

  const ids = new Set([
    ...Object.keys(recordFacts.players),
    ...Object.keys(facts.players),
  ]);
  const players = {};
  for (const id of ids) {
    const base = recordFacts.players[id] || emptyPlayer(Number(id));
    const extra = facts.players[id] || null;
    const merged = { ...base };
    if (extra) {
      for (const key of ['villagersProduced', 'villagersAlive', 'villagersLost', 'unitsLost', 'unitsKilled', 'buildings']) {
        if (extra[key] !== undefined) merged[key] = extra[key];
      }
      if (!merged.age && extra.age) merged.age = extra.age;
      for (const age of AGES) {
        const fromRecordAge = base.ages[age];
        const fromFactsAge = extra.ages[age];
        if (fromRecordAge && fromFactsAge) {
          if (Math.abs(fromRecordAge.value - fromFactsAge.value) > 2000) {
            conflicts.push({
              player: Number(id),
              age,
              recordMs: fromRecordAge.value,
              captureMs: fromFactsAge.value,
            });
          }
          merged.ages[age] = fromRecordAge;
        } else {
          merged.ages[age] = fromRecordAge || fromFactsAge || null;
        }
      }
    }
    players[id] = merged;
  }

  return {
    schemaVersion: 1,
    matchKey: matchKey || null,
    clock: 'game-ms',
    sources: {
      record: { available: recordFacts.available, type: 'replay-analysis' },
      offline: { available: Boolean(fallback), type: 'offline-replay' },
      engine: {
        available: Boolean(live),
        type: 'engine-capture',
        reason: live ? null : (engine && engine.reason) || 'not_captured',
        // La cobertura que se publica es la de la fuente que realmente se usó:
        // nunca la de una captura que no ocurrió.
        coverage: live ? facts.coverage || null : null,
        diagnostics: live ? facts.diagnostics || null : null,
      },
    },
    deathsMeasured: facts.deathsMeasured === true,
    players,
    warnings,
    conflicts,
  };
}

/**
 * Invariantes del modelo. Se ejecutan antes de publicar un artefacto: preferimos
 * degradar un dato a fallar en la cara del usuario.
 */
function validateModel(model) {
  const problems = [];
  for (const [id, player] of Object.entries(model.players || {})) {
    for (const key of ['villagersProduced', 'villagersAlive', 'villagersLost', 'unitsLost', 'unitsKilled']) {
      const entry = player[key];
      if (!entry) {
        problems.push(`${id}.${key} ausente`);
        continue;
      }
      if (entry.availability === 'unavailable' && entry.value !== null) {
        problems.push(`${id}.${key} no disponible pero con valor`);
      }
      if (entry.value !== null && entry.value < 0) {
        problems.push(`${id}.${key} negativo`);
      }
    }
    const produced = player.villagersProduced;
    const alive = player.villagersAlive;
    if (produced && alive && produced.value !== null && alive.value !== null && alive.value > produced.value + 3) {
      problems.push(`${id}.villagersAlive mayor que los producidos`);
    }
    let previous = null;
    for (const age of AGES) {
      const entry = player.ages[age];
      if (!entry) continue;
      if (previous !== null && entry.value !== null && entry.value < previous) {
        problems.push(`${id}.${age} anterior a la edad previa`);
      }
      if (entry.value !== null) previous = entry.value;
    }
  }
  return { ok: problems.length === 0, problems };
}

module.exports = {
  AGES,
  DEFINITIONS,
  DEATH_METRICS,
  fingerprintReplay,
  metric,
  unavailable,
  fromFacts,
  fromEngine,
  fromRecord,
  mergeModel,
  validateModel,
};
