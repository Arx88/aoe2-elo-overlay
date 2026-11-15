'use strict';

// Counts measured death events. This is not a game simulator: a replay command
// such as Attack/Research/Queue is never accepted as a death or age arrival.
const DEFINITION = 'combat-event-ledger-v1';
const COST_DEFINITION = 'nominal-unit-replacement-cost-at-death-v1';
const AGES = ['dark', 'feudal', 'castle', 'imperial'];
const LABELS = ['Oscura', 'Feudal', 'Castillos', 'Imperial'];
const CATEGORIES = ['villager', 'military', 'fishing-ship', 'trade', 'other-economic', 'building', 'other', 'unknown'];
const CAUSES = ['enemy-combat', 'own-delete', 'gaia', 'friendly-fire', 'unknown'];
const COUNTS = ['villagersKilled', 'villagersLost', 'militaryKilled', 'militaryLost',
  'otherKilled', 'otherLost', 'unattributedDeaths', 'unclassifiedDeaths'];
const LIMIT = 20000;

const number = (v, min = 0, max = 86400) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const id = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const matchId = (v) => ['string', 'number'].includes(typeof v) && /^\d{1,20}$/.test(String(v)) && Number(v) > 0;
const token = (v) => typeof v === 'string' && v.length > 0 && v.length <= 120;
const emptyCounts = () => Object.fromEntries(COUNTS.map((key) => [key, 0]));
const invalid = (message) => ({ status: 'invalid', data: null, warnings: [message] });

function covered(ranges, start, end) {
  let cursor = start;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (range.end <= cursor) continue;
    if (range.start > cursor) return false;
    cursor = Math.max(cursor, range.end);
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

function summaryData(profileId, durationSeconds, stages) {
  const totals = emptyCounts();
  for (const stage of stages) for (const key of COUNTS) totals[key] += stage[key];
  const complete = stages.every((stage) => stage.status === 'complete');
  const valuesKnown = complete && stages.every((stage) => stage.valueDestroyed != null && stage.valueLost != null);
  totals.valueDestroyed = valuesKnown ? stages.reduce((sum, stage) => sum + stage.valueDestroyed, 0) : null;
  totals.valueLost = valuesKnown ? stages.reduce((sum, stage) => sum + stage.valueLost, 0) : null;
  totals.valueBalance = valuesKnown ? totals.valueDestroyed - totals.valueLost : null;
  const highlights = [];
  const feudal = stages.find((stage) => stage.age === 'feudal');
  // Initial rules intentionally use absolute facts rather than an invented
  // competitive percentile. Rule IDs keep future recalibration explicit.
  if (feudal && feudal.status === 'complete' && !feudal.unclassifiedDeaths && feudal.villagersKilled >= 5) {
    highlights.push({ id: 'feudal-raider-v1', title: 'Depredador Feudal', icon: 'sword',
      detail: `${feudal.villagersKilled} aldeanos enemigos eliminados durante tu Feudal.`,
      metric: 'villagersKilled', value: feudal.villagersKilled, phase: 'feudal' });
  }
  if (complete && !totals.unclassifiedDeaths && totals.militaryKilled >= 25 && totals.militaryKilled >= 2 * totals.militaryLost) {
    highlights.push({ id: 'serial-killer-kd-2-v1', title: 'Serial Killer', icon: 'sword',
      detail: `${totals.militaryKilled} militares enemigos eliminados frente a ${totals.militaryLost} pérdidas militares propias.`,
      metric: 'militaryKilled', value: totals.militaryKilled });
  }
  if (valuesKnown && !totals.unclassifiedDeaths && totals.valueLost > 0 &&
      totals.valueDestroyed + totals.valueLost >= 1000 && totals.valueDestroyed >= 1.5 * totals.valueLost) {
    highlights.push({ id: 'resource-trade-1.5-v1', title: 'Buen negocio', icon: 'resources',
      detail: `${totals.valueDestroyed} recursos destruidos frente a ${totals.valueLost} perdidos en combate.`,
      metric: 'resourceExchange', value: Math.round(totals.valueDestroyed / totals.valueLost * 10) / 10 });
  }
  return { schemaVersion: 1, definition: DEFINITION, profileId, durationSeconds,
    costDefinition: COST_DEFINITION, status: complete ? 'ready' : 'partial',
    stages, totals, highlights: highlights.slice(0, 3) };
}

/** Validate a compact summary on import AND when restoring the local store.
 * Derived totals/highlights from input are ignored and rebuilt. Raw ledgers
 * stay outside the 8 MB history store; only this bounded summary is persisted.
 */
function normalizeCombatSummary(raw, expected = {}) {
  if (!raw) return { status: 'missing', data: null, warnings: [] };
  if (raw.schemaVersion !== 1 || raw.definition !== DEFINITION || !id(raw.profileId) ||
      (expected.profileId != null && raw.profileId !== Number(expected.profileId)) ||
      !number(raw.durationSeconds, 0.001) ||
      (expected.durationSeconds != null && raw.durationSeconds !== expected.durationSeconds) ||
      raw.costDefinition !== COST_DEFINITION || !Array.isArray(raw.stages) ||
      !raw.stages.length || raw.stages.length > 4) return invalid('Resumen de combate no compatible.');
  const stages = [];
  for (const input of raw.stages) {
    if (!input || !AGES.includes(input.age) || !['complete', 'partial'].includes(input.status) ||
        !number(input.startSeconds) || !number(input.endSeconds) ||
        input.endSeconds <= input.startSeconds || input.endSeconds > raw.durationSeconds) {
      return invalid('Intervalo de combate inválido.');
    }
    const index = AGES.indexOf(input.age);
    if ((!stages.length && input.startSeconds !== 0) ||
        (stages.length && (input.startSeconds !== stages.at(-1).endSeconds ||
          index !== AGES.indexOf(stages.at(-1).age) + 1))) return invalid('Las edades de combate no son contiguas.');
    const stage = { age: input.age, label: LABELS[index], startSeconds: input.startSeconds,
      endSeconds: input.endSeconds, status: input.status };
    for (const key of COUNTS) {
      if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > LIMIT) return invalid('Conteo de combate inválido.');
      stage[key] = input[key];
    }
    for (const key of ['valueDestroyed', 'valueLost']) {
      if (input[key] != null && !number(input[key], 0, 1e9)) return invalid('Valor de intercambio inválido.');
      stage[key] = input.status === 'complete' && !stage.unclassifiedDeaths ? (input[key] ?? null) : null;
    }
    const deaths = stage.villagersLost + stage.militaryLost + stage.otherLost;
    const allEvents = deaths + stage.villagersKilled + stage.militaryKilled + stage.otherKilled;
    if (stage.unattributedDeaths > deaths || stage.unclassifiedDeaths > allEvents) return invalid('Conteos de combate contradictorios.');
    stages.push(stage);
  }
  if (stages.at(-1).endSeconds !== raw.durationSeconds) return invalid('El combate no cubre la duración declarada.');
  if (expected.startingAge && stages[0].age !== expected.startingAge) return invalid('La edad inicial del combate no coincide.');
  const data = summaryData(raw.profileId, raw.durationSeconds, stages);
  return { status: data.status, data, warnings: [] };
}

/** Input is a measured event ledger, not a .aoe2record file. */
function analyzeCombatEvents(raw, expected = {}) {
  if (!raw || raw.schemaVersion !== 1 || raw.clock !== 'game' || !matchId(raw.matchId) || !id(raw.profileId) ||
      (expected.matchId != null && String(raw.matchId) !== String(expected.matchId)) ||
      (expected.profileId != null && raw.profileId !== Number(expected.profileId)) ||
      !number(raw.durationSeconds, 0.001) || !AGES.includes(raw.startingAge) ||
      !Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 16 ||
      !Array.isArray(raw.ageEvents) || raw.ageEvents.length > 64 ||
      !Array.isArray(raw.deaths) || raw.deaths.length > LIMIT) return invalid('Registro de combate no compatible.');
  const players = new Map();
  for (const player of raw.players) {
    if (!player || !id(player.profileId) || players.has(player.profileId) ||
        !Number.isSafeInteger(player.team) || player.team < 1 || player.team > 16) return invalid('Roster de combate inválido o sin equipos confirmados.');
    players.set(player.profileId, player.team);
  }
  if (!players.has(raw.profileId)) return invalid('El jugador no está en el registro de combate.');
  if (Array.isArray(expected.players) && (expected.players.length !== players.size ||
      expected.players.some((player) => !players.has(Number(player.profileId)) ||
        (Number.isSafeInteger(player.team) && player.team > 0 && players.get(Number(player.profileId)) !== player.team)))) {
    return invalid('El roster no coincide con la partida.');
  }
  const coverage = raw.coverage || {};
  if (coverage.agesComplete !== true || !Array.isArray(coverage.deaths) || coverage.deaths.length > 100) {
    return invalid('Se requiere cobertura completa de edades y cobertura declarada de muertes.');
  }
  for (const range of coverage.deaths) {
    if (!range || !number(range.start) || !number(range.end) || range.end <= range.start || range.end > raw.durationSeconds) {
      return invalid('Cobertura de muertes inválida.');
    }
  }
  const arrivals = raw.ageEvents.filter((event) => event && event.profileId === raw.profileId)
    .sort((a, b) => a.gameSeconds - b.gameSeconds);
  if (!arrivals.length || arrivals[0].age !== raw.startingAge || arrivals[0].gameSeconds !== 0) {
    return invalid('Falta la edad inicial confirmada del jugador.');
  }
  for (let i = 0; i < arrivals.length; i += 1) {
    const event = arrivals[i];
    if (event.type !== 'age-reached' || !number(event.gameSeconds) || event.gameSeconds > raw.durationSeconds ||
        !AGES.includes(event.age) || (i && (event.gameSeconds <= arrivals[i - 1].gameSeconds ||
          AGES.indexOf(event.age) !== AGES.indexOf(arrivals[i - 1].age) + 1))) {
      return invalid('Las llegadas de edad no están confirmadas o son inconsistentes.');
    }
  }
  const stages = arrivals.filter((event) => event.gameSeconds < raw.durationSeconds).map((event, index) => {
    const endSeconds = arrivals[index + 1] ? arrivals[index + 1].gameSeconds : raw.durationSeconds;
    return { age: event.age, label: LABELS[AGES.indexOf(event.age)], startSeconds: event.gameSeconds, endSeconds,
      status: covered(coverage.deaths, event.gameSeconds, endSeconds) ? 'complete' : 'partial',
      ...emptyCounts(), valueDestroyed: 0, valueLost: 0 };
  });
  const events = new Map();
  const units = new Set();
  const warnings = [];
  for (const event of raw.deaths) {
    if (!event || event.type !== 'unit-died' || !token(event.id) || !token(event.unitInstanceId) ||
        !number(event.gameSeconds) || event.gameSeconds >= raw.durationSeconds ||
        !CATEGORIES.includes(event.unitCategory) || !CAUSES.includes(event.cause) ||
        !players.has(event.ownerProfileId) ||
        (event.killerProfileId != null && !players.has(event.killerProfileId))) return invalid('Evento de muerte inválido.');
    const ownerTeam = players.get(event.ownerProfileId);
    const killerTeam = event.killerProfileId == null ? null : players.get(event.killerProfileId);
    if ((event.cause === 'enemy-combat' && killerTeam != null && ownerTeam === killerTeam) ||
        (event.cause === 'friendly-fire' && killerTeam != null && ownerTeam !== killerTeam) ||
        (['gaia', 'own-delete', 'unknown'].includes(event.cause) && event.killerProfileId != null)) {
      return invalid('La atribución de la muerte contradice su causa o los equipos.');
    }
    let cost = null;
    if (event.cost != null) {
      if (event.cost.definition !== COST_DEFINITION ||
          !['food', 'wood', 'gold', 'stone'].every((key) => number(event.cost[key], 0, 1e6))) {
        return invalid('Coste de unidad inválido o incompatible.');
      }
      cost = ['food', 'wood', 'gold', 'stone'].reduce((sum, key) => sum + event.cost[key], 0);
    }
    const normalized = { unit: event.unitInstanceId, time: event.gameSeconds, category: event.unitCategory,
      owner: event.ownerProfileId, killer: event.killerProfileId ?? null, cause: event.cause, cost };
    const fingerprint = JSON.stringify(normalized);
    if (events.has(event.id)) {
      if (events.get(event.id) !== fingerprint) return invalid('Un ID de muerte contiene eventos contradictorios.');
      warnings.push('Se omitió un evento de muerte duplicado.');
      continue;
    }
    if (units.has(event.unitInstanceId)) return invalid('Una misma unidad tiene más de una muerte.');
    events.set(event.id, fingerprint);
    units.add(event.unitInstanceId);
    const stage = stages.find((item) => event.gameSeconds >= item.startSeconds && event.gameSeconds < item.endSeconds);
    const lost = event.ownerProfileId === raw.profileId;
    const killed = event.killerProfileId === raw.profileId && event.cause === 'enemy-combat';
    if (!lost && !killed) continue;
    const prefix = event.unitCategory === 'villager' ? 'villagers' : event.unitCategory === 'military' ? 'military' : 'other';
    stage[`${prefix}${lost ? 'Lost' : 'Killed'}`] += 1;
    if (lost && event.killerProfileId == null && !['own-delete', 'gaia'].includes(event.cause)) stage.unattributedDeaths += 1;
    if (event.unitCategory === 'unknown') stage.unclassifiedDeaths += 1;
    if (killed) stage.valueDestroyed = cost == null || stage.valueDestroyed == null ? null : stage.valueDestroyed + cost;
    if (lost && event.cause === 'enemy-combat') stage.valueLost = cost == null || stage.valueLost == null ? null : stage.valueLost + cost;
  }
  const result = normalizeCombatSummary({ schemaVersion: 1, definition: DEFINITION,
    profileId: raw.profileId, durationSeconds: raw.durationSeconds, costDefinition: COST_DEFINITION, stages }, expected);
  return { ...result, warnings: [...result.warnings, ...new Set(warnings)] };
}

module.exports = { analyzeCombatEvents, normalizeCombatSummary, DEFINITION, COST_DEFINITION };
