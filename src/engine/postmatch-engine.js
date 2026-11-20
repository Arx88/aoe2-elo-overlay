'use strict';

/**
 * Motor unificado de análisis post-partida desde el .aoe2record local.
 *
 * Extrae hechos deterministas y comparables (Vos vs Rival) en < 50 ms sin
 * abrir el juego ni depender de CaptureAge:
 *   - TC inactivo estimado por colas (atribución a un único TC + descuento de
 *     investigaciones reales del TC: Telar, Edades, Carretilla, Carro de mano).
 *   - Producción de aldeanos, Centros Urbanos y composición militar completa
 *     por edificio (256 unidades y 40 edificios con nombres oficiales en español).
 *   - Curva acumulada por tramos de tiempo (Vos vs Rival en el mismo reloj).
 *   - eAPM real (filtrado de clics repetidos < 150 ms), reparto Eco vs Militar
 *     y hábitos de micro (Attack-Move, Patrol, Mercado, Campana Urbana).
 *   - Destacados ganados con cifras comprobables y 1 foco accionable universal.
 */

const TABLE = require('./unit-names.json');

const VERSION = 'postmatch-engine-v1';
const UNIT_TABLE = TABLE.units || {};
const BUILDING_TABLE = TABLE.buildings || {};
const VILLAGERS = new Set([83, 293]);
const VILLAGER_TRAIN_S = 25;
/** Tope de cola por TC (6 aldeanos) para permitir colas reales sin que clics fallidos arrastren minutos. */
const TC_MAX_QUEUE_AHEAD_MS = 150_000;

/** Investigaciones que ocupan la cola del Centro Urbano (duración base en s). */
const TC_RESEARCH_SECONDS = Object.freeze({
  22: 25,   // Telar (Loom)
  101: 130, // Edad Feudal
  102: 160, // Edad de los Castillos
  103: 190, // Edad Imperial
  213: 75,  // Carretilla (Wheelbarrow)
  249: 55,  // Carro de mano (Hand Cart)
  8: 25,    // Guardia urbana (Town Watch)
  280: 40,  // Patrulla urbana (Town Patrol)
});

const MILITARY_BUILDING_TYPES = new Set([12, 87, 101, 49, 45, 82, 104, 1665]);
const MILITARY_COMMANDS = new Set(['Move', 'DeAttackMove', 'AttackGround', 'Patrol', 'Formation', 'Stance', 'Target', 'Attack', 'Order']);
const ECO_COMMANDS = new Set(['DeQueue', 'Queue', 'Multiqueue', 'Build', 'Wall', 'Research', 'Buy', 'Sell', 'Tribute', 'Gatherpoint', 'GatherPoint', 'BackToWork', 'Repair', 'Interact']);

function unitInfo(id) {
  return UNIT_TABLE[id] || { name: `Unidad ${id}`, key: `unidad-${id}`, trainSeconds: 25 };
}

function buildingInfo(id) {
  return BUILDING_TABLE[id] || { name: `Edificio ${id}`, key: `edificio-${id}` };
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function sumIntervalSeconds(intervals) {
  return mergeIntervals(intervals).reduce((total, [s, e]) => total + (e - s), 0) / 1000;
}

function actionInfo(operation) {
  const action = operation && operation.Action;
  const data = action && action.action_data;
  if (!data || typeof data !== 'object') return null;
  const keys = Object.keys(data);
  if (!keys.length) return null;
  const type = keys[0];
  const payload = data[type];
  if (!payload || typeof payload !== 'object') return null;
  const pid = Number(payload.player_id ?? action.player_id ?? (action.game_command && action.game_command.player_id));
  if (!Number.isFinite(pid) || pid <= 0 || pid > 31) return null;
  const ms = Number(action.world_time);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return { type, payload, playerId: pid, ms };
}

function tcResearchDuration(techId, civ) {
  const base = TC_RESEARCH_SECONDS[techId];
  if (!base) return 0;
  const name = String(civ || '').toLowerCase();
  if (techId === 22 && name.includes('goth')) return 1;
  if ((techId === 101 || techId === 102 || techId === 103) && name.includes('malay')) return Math.round(base / 1.66);
  return base;
}

function createSlotState(slot, civ, ages = null) {
  return {
    slot,
    civ: civ || null,
    tcs: new Map(),           // buildingKey -> { busyUntil, intervals, villagers }
    seenTcTechs: new Set(),   // evita sumar doble un Research repetido en el replay
    feudalReachedMs: Number.isFinite(ages?.feudal) ? ages.feudal : null,
    castleReachedMs: Number.isFinite(ages?.castle) ? ages.castle : null,
    imperialReachedMs: Number.isFinite(ages?.imperial) ? ages.imperial : null,
    feudalClickMs: null,
    firstMilitaryMs: null,
    effectiveActionTimes: [],
    militaryActionTimes: [],
    ecoActionTimes: [],
    tcOrderTimes: [],
    marketBought: { food: 0, wood: 0, stone: 0 },
    marketSold: { food: 0, wood: 0, stone: 0 },
    marketEarlyOps: 0,
    workshops: new Map(),     // buildingKey -> { typeId, busyUntil, intervals, units, firstMs, lastMs }
    unitCounts: new Map(),    // unitKey -> { key, name, count }
    villagerEvents: [],       // { ms, amount }
    militaryEvents: [],       // { ms, amount }
    villagersOrdered: 0,
    militaryOrdered: 0,
    totalActions: 0,
    effectiveActions: 0,
    lastActionByType: new Map(),
    ecoActions: 0,
    militaryActions: 0,
    moveCount: 0,
    attackMoveCount: 0,
    patrolCount: 0,
    marketCount: 0,
    townBellCount: 0,
    tributesSent: 0,
    selfDeleted: 0,
    firstTcOrderMs: null,
    lastTcOrderMs: null,
  };
}

function ensureTc(state, key) {
  let tc = state.tcs.get(key);
  if (!tc) {
    tc = { id: key, busyUntil: null, intervals: [], villagers: 0 };
    state.tcs.set(key, tc);
  }
  return tc;
}

function pickShortestQueue(list) {
  list.sort((a, b) => {
    const la = a.busyUntil === null ? -1 : a.busyUntil;
    const lb = b.busyUntil === null ? -1 : b.busyUntil;
    if (la !== lb) return la - lb;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
  return list[0];
}

function tcWindowStats(tcs, winStart, winEnd, { zeroPrimary = false, capEachToLast = false } = {}) {
  if (!tcs.size || !Number.isFinite(winEnd) || winEnd <= winStart) {
    return { idleSeconds: null, utilization: null, busySeconds: 0, windowSeconds: 0 };
  }
  let totalBusy = 0;
  let totalWindow = 0;
  let tcCount = 0;
  let index = 0;
  for (const tc of tcs.values()) {
    const isPrimary = index === 0;
    index += 1;
    if (!tc.intervals.length) continue;
    const allMerged = mergeIntervals(tc.intervals);
    const firstEver = allMerged[0][0];
    const lastEver = allMerged[allMerged.length - 1][1];
    const tcStart = Math.max(winStart, (isPrimary && zeroPrimary) ? 0 : firstEver);
    const tcEnd = Math.min(winEnd, capEachToLast ? lastEver : (isPrimary ? winEnd : lastEver));
    if (tcEnd <= tcStart) continue;
    const clamped = allMerged
      .map(([s, e]) => [Math.max(s, tcStart), Math.min(e, tcEnd)])
      .filter(([s, e]) => e > s);
    const busy = clamped.reduce((sum, [s, e]) => sum + (e - s), 0) / 1000;
    const span = Math.max(busy, (tcEnd - tcStart) / 1000);
    totalBusy += busy;
    totalWindow += span;
    tcCount += 1;
  }
  if (totalWindow <= 0) {
    return { idleSeconds: null, utilization: null, busySeconds: 0, windowSeconds: 0, tcCount: 0 };
  }
  const idleSeconds = Math.max(0, Math.round((totalWindow - totalBusy) * 10) / 10);
  const utilization = Math.max(0, Math.min(100, Math.round((totalBusy / totalWindow) * 1000) / 10));
  return { idleSeconds, utilization, busySeconds: totalBusy, windowSeconds: totalWindow, tcCount };
}

function findBiggestTcGap(state, durationMs) {
  if (!state.tcs.size) return null;
  const endLimitMs = state.castleReachedMs != null ? Math.min(state.castleReachedMs, durationMs) : durationMs;
  const feudalMs = state.feudalReachedMs != null ? state.feudalReachedMs : Infinity;
  let best = null;
  let idx = 0;
  for (const tc of state.tcs.values()) {
    const isPrimary = idx === 0;
    idx += 1;
    if (!tc.intervals.length) continue;
    const merged = mergeIntervals(tc.intervals);
    const tcStart = isPrimary ? 0 : merged[0][0];
    const tcEnd = Math.min(endLimitMs, isPrimary ? endLimitMs : merged[merged.length - 1][1]);
    if (tcEnd <= tcStart) continue;
    const clamped = merged
      .map(([s, e]) => [Math.max(s, tcStart), Math.min(e, tcEnd)])
      .filter(([s, e]) => e > s);
    let cursor = tcStart;
    for (const [s, e] of clamped) {
      if (s - cursor >= 15_000) {
        const dur = s - cursor;
        if (!best || dur > best.durMs) best = { startMs: cursor, endMs: s, durMs: dur };
      }
      cursor = Math.max(cursor, e);
    }
    if (tcEnd - cursor >= 15_000) {
      const dur = tcEnd - cursor;
      if (!best || dur > best.durMs) best = { startMs: cursor, endMs: tcEnd, durMs: dur };
    }
  }
  if (!best || best.durMs < 20_000) return null;
  const startSec = Math.round(best.startMs / 1000);
  const endSec = Math.round(best.endMs / 1000);
  const durationSec = Math.round(best.durMs / 1000);
  const age = best.startMs >= feudalMs ? 'Feudal' : 'Alta Edad';
  const milOrders = state.militaryActionTimes.filter((t) => t >= best.startMs - 5000 && t <= best.endMs).length;
  const ecoOrders = state.ecoActionTimes.filter((t) => t >= best.startMs && t <= best.endMs).length;
  const cause = milOrders >= 10 ? 'combat' : ecoOrders >= 8 ? 'eco' : 'quiet';
  const causeText = cause === 'combat'
    ? `mientras microeabas · ${milOrders} órdenes mil.`
    : cause === 'eco'
      ? `durante tareas eco · ${ecoOrders} órdenes`
      : 'sin presión militar registrada';
  return {
    startSec,
    endSec,
    durationSec,
    age,
    militaryOrdersInGap: milOrders,
    cause,
    summary: `${fmtClockShort(startSec)}–${fmtClockShort(endSec)} (${fmtDurShort(durationSec)} en ${age} · ${causeText})`,
  };
}

function buildMarketProfile(state) {
  const b = state.marketBought;
  const s = state.marketSold;
  const totalOps = state.marketCount;
  if (!totalOps) return null;
  let note = `${totalOps} operaciones en el Mercado`;
  if (s.wood >= 300 && b.food >= 200) {
    note = `Vendiste ${s.wood} mad. y compraste ${b.food} com. → exceso de leñadores / faltaron granjas`;
  } else if (s.wood >= 400) {
    note = `Vendiste ${s.wood} de madera → revisá si dejás demasiados leñadores`;
  } else if (b.food >= 400) {
    note = `Compraste ${b.food} de comida → faltó transición temprana a granjas`;
  } else if (s.food >= 400) {
    note = `Vendiste ${s.food} de comida para financiar oro`;
  } else if (s.stone >= 200) {
    note = `Vendiste ${s.stone} de piedra para acelerar oro`;
  } else if (b.stone >= 200) {
    note = `Compraste ${b.stone} de piedra (castillo / TCs)`;
  }
  return {
    totalOps,
    earlyOps: state.marketEarlyOps,
    bought: { ...b },
    sold: { ...s },
    note,
  };
}

function medianOf(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function finalizePlayer(state, durationMs) {
  const durSec = Math.max(1, durationMs / 1000);
  const durMin = durSec / 60;

  // TC inactivo separado por edad:
  // - Alta Edad (0:00 -> llegada a Feudal)
  // - Feudal (llegada a Feudal -> llegada a Castillos)
  // - Alta + Feudal (ventana crítica de macro antes de Castillos / 200 pop)
  // - Total partida (hasta el último aldeano activo de cada TC, sin contar pausas tras dejar de sacar)
  const darkEndMs = state.feudalReachedMs != null ? Math.min(state.feudalReachedMs, durationMs) : durationMs;
  const feudalEndMs = state.castleReachedMs != null ? Math.min(state.castleReachedMs, durationMs) : durationMs;
  const darkStats = tcWindowStats(state.tcs, 0, darkEndMs, { zeroPrimary: true });
  const feudalStats = state.feudalReachedMs != null && feudalEndMs > darkEndMs
    ? tcWindowStats(state.tcs, darkEndMs, feudalEndMs, { zeroPrimary: false })
    : { idleSeconds: null, utilization: null };
  const earlyStats = tcWindowStats(state.tcs, 0, feudalEndMs, { zeroPrimary: true });
  const totalStats = tcWindowStats(state.tcs, 0, durationMs, { zeroPrimary: true, capEachToLast: true });

  const tcIdleDarkSeconds = darkStats.idleSeconds;
  const tcUtilizationDark = darkStats.utilization;
  const tcIdleFeudalSeconds = feudalStats.idleSeconds;
  const tcUtilizationFeudal = feudalStats.utilization;
  const feudalActiveTcs = feudalStats.tcCount || 0;
  const tcIdleFeudalPerTcSeconds = tcIdleFeudalSeconds != null && feudalActiveTcs > 0
    ? Math.round((tcIdleFeudalSeconds / feudalActiveTcs) * 10) / 10
    : tcIdleFeudalSeconds;
  const tcIdleEarlySeconds = earlyStats.idleSeconds;
  const tcUtilizationEarly = earlyStats.utilization;
  const tcIdleTotalSeconds = totalStats.idleSeconds;
  const tcUtilizationTotal = totalStats.utilization;

  // Alias principales apuntan a Alta + Feudal (la fase crítica de macro en AoE2)
  const tcIdleSeconds = tcIdleEarlySeconds ?? tcIdleTotalSeconds;
  const tcUtilization = tcUtilizationEarly ?? tcUtilizationTotal;
  const tcIdleRatio = tcUtilization != null
    ? Math.max(0, Math.min(1, Math.round((1 - tcUtilization / 100) * 1000) / 1000))
    : null;

  // Talleres militares, utilización y salud de colas (saturación real por edificio)
  let workshopBusy = 0;
  let workshopWindow = 0;
  const workshopTypes = new Map();
  for (const ws of state.workshops.values()) {
    const busy = sumIntervalSeconds(ws.intervals);
    const span = ws.intervals.length
      ? Math.max(busy, (Math.min(durationMs, ws.busyUntil || ws.lastMs) - ws.firstMs) / 1000)
      : 0;
    workshopBusy += busy;
    workshopWindow += span;
    const info = buildingInfo(ws.typeId);
    const bucket = workshopTypes.get(info.key) || {
      key: info.key, typeId: ws.typeId, name: info.name, count: 0, units: 0,
      peakQueue: 0, orders: 0, overloadedOrders: 0,
    };
    bucket.count += 1;
    bucket.units += ws.units;
    bucket.peakQueue = Math.max(bucket.peakQueue, ws.maxQueue || 0);
    bucket.orders += ws.orders || 0;
    bucket.overloadedOrders += ws.overloadedOrders || 0;
    workshopTypes.set(info.key, bucket);
  }
  const workshopUtilization = workshopWindow > 0
    ? Math.max(0, Math.min(100, Math.round((workshopBusy / workshopWindow) * 100)))
    : null;

  const topUnits = [...state.unitCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  const topWorkshops = [...workshopTypes.values()]
    .sort((a, b) => b.units - a.units || b.count - a.count)
    .slice(0, 4)
    .map((w) => {
      const overloadedPct = w.orders > 0 ? Math.round((w.overloadedOrders / w.orders) * 100) : 0;
      const peakQueue = Math.round(w.peakQueue * 10) / 10;
      const status = peakQueue >= 5 && overloadedPct >= 25
        ? 'saturated'
        : (w.units >= 6 ? 'balanced' : 'light');
      const recommendedCount = status === 'saturated'
        ? Math.min(w.count * 2 + 2, Math.max(w.count + 1, Math.ceil(w.count * (peakQueue / 3.5))))
        : null;
      const note = status === 'saturated'
        ? `Saturado (pico ${Math.round(peakQueue)}) · necesitabas ~${recommendedCount} ${w.name.toLowerCase()}s`
        : `Pico ${Math.round(peakQueue)} en cola · flujo parejo`;
      return {
        key: w.key,
        typeId: w.typeId,
        name: w.name,
        count: w.count,
        units: w.units,
        peakQueue,
        overloadedPct,
        recommendedCount,
        status,
        note,
      };
    });

  const classifiedActions = state.ecoActions + state.militaryActions;
  const militarySharePct = classifiedActions >= 20
    ? Math.round((state.militaryActions / classifiedActions) * 100)
    : null;

  // Precisión de micro en combate (Attack-Move + Patrol vs clics de Move) y ciclo de retorno al TC
  const combatOrders = state.attackMoveCount + state.patrolCount;
  const totalMoveOrders = state.moveCount + combatOrders;
  const controlSharePct = totalMoveOrders >= 20
    ? Math.round((combatOrders / totalMoveOrders) * 1000) / 10
    : null;
  const tcGaps = [];
  const earlyCut = state.castleReachedMs != null ? Math.min(state.castleReachedMs, durationMs) : durationMs;
  const earlyTcTimes = state.tcOrderTimes.filter((t) => t <= earlyCut).sort((a, b) => a - b);
  for (let i = 1; i < earlyTcTimes.length; i += 1) {
    const dtSec = (earlyTcTimes[i] - earlyTcTimes[i - 1]) / 1000;
    if (dtSec >= 2) tcGaps.push(dtSec); // descarta doble clic inmediato
  }
  const tcReturnSec = tcGaps.length >= 4 ? Math.round(medianOf(tcGaps)) : null;
  const biggestTcGap = findBiggestTcGap(state, durationMs);
  const marketProfile = buildMarketProfile(state);

  return {
    villagersOrdered: state.villagersOrdered,
    townCenters: state.tcs.size,
    tcIdleSeconds,
    tcUtilization,
    tcIdleRatio,
    tcIdleDarkSeconds,
    tcUtilizationDark,
    tcIdleFeudalSeconds,
    tcIdleFeudalPerTcSeconds,
    feudalActiveTcs,
    tcUtilizationFeudal,
    tcIdleEarlySeconds,
    tcUtilizationEarly,
    tcIdleTotalSeconds,
    tcUtilizationTotal,
    biggestTcGap,
    militaryOrdered: state.militaryOrdered,
    workshopsCount: state.workshops.size,
    workshopUtilization,
    topUnits,
    topWorkshops,
    apm: Math.round((state.totalActions / durMin) * 10) / 10,
    eapm: Math.round((state.effectiveActions / durMin) * 10) / 10,
    militarySharePct,
    ecoSharePct: militarySharePct != null ? 100 - militarySharePct : null,
    combatMicro: {
      controlSharePct,
      combatOrders,
      moveOrders: state.moveCount,
      tcReturnSec,
    },
    marketProfile,
    habits: {
      move: state.moveCount,
      attackMove: state.attackMoveCount,
      patrol: state.patrolCount,
      market: state.marketCount,
      townBell: state.townBellCount,
      tributes: state.tributesSent,
      selfDeleted: state.selfDeleted,
    },
  };
}

function buildTimelineBuckets(selfState, rivalState, durationMs, bucketCount = 12) {
  if (!Number.isFinite(durationMs) || durationMs < 120_000) return [];
  const stepMs = durationMs / bucketCount;
  const buckets = [];
  for (let i = 1; i <= bucketCount; i += 1) {
    const cutoff = Math.round(stepMs * i);
    const sumBefore = (events) => events.reduce((sum, ev) => (ev.ms <= cutoff ? sum + ev.amount : sum), 0);
    buckets.push({
      seconds: Math.round(cutoff / 1000),
      selfVillagers: sumBefore(selfState.villagerEvents),
      rivalVillagers: rivalState ? sumBefore(rivalState.villagerEvents) : null,
      selfMilitary: sumBefore(selfState.militaryEvents),
      rivalMilitary: rivalState ? sumBefore(rivalState.militaryEvents) : null,
    });
  }
  return buckets;
}

function clampScore(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function gradeFromScore(score) {
  if (!Number.isFinite(score)) return null;
  return score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 58 ? 'B' : score >= 40 ? 'C' : 'D';
}

function fmtClockShort(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtDurShort(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  if (s < 120) return `${s} s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Benchmarks reales de tiempo (en s de juego) por familia de apertura. */
const OPENING_TARGETS = Object.freeze({
  'Scout Rush': { feudalSec: 605, militarySec: 695, mode: 'feudal' },
  'Scout Opening': { feudalSec: 615, militarySec: 710, mode: 'feudal' },
  'Scouts into Archers': { feudalSec: 610, militarySec: 700, mode: 'feudal' },
  'Archer Rush': { feudalSec: 625, militarySec: 725, mode: 'feudal' },
  'Archer Opening': { feudalSec: 630, militarySec: 735, mode: 'feudal' },
  'M@A Rush': { feudalSec: 615, militarySec: 560, mode: 'feudal' },
  'M@A Archers': { feudalSec: 615, militarySec: 560, mode: 'feudal' },
  'M@A Scouts': { feudalSec: 615, militarySec: 560, mode: 'feudal' },
  'Drush': { feudalSec: 660, militarySec: 495, mode: 'feudal' },
  'Drush Archers': { feudalSec: 660, militarySec: 495, mode: 'feudal' },
  'Drush M@A': { feudalSec: 655, militarySec: 495, mode: 'feudal' },
  'Drush FC': { feudalSec: 690, castleSec: 1020, mode: 'fc' },
  'Fast Castle': { feudalSec: 685, castleSec: 990, mode: 'fc' },
  'FC Boom': { feudalSec: 690, castleSec: 1005, mode: 'fc' },
  'Monk Rush': { feudalSec: 685, castleSec: 990, mode: 'fc' },
  '2TC Feudal Boom': { feudalSec: 590, mode: 'boom' },
  'Tower Rush': { feudalSec: 605, mode: 'feudal' },
  'Pike Skirm': { feudalSec: 625, militarySec: 735, mode: 'feudal' },
  'Serjeant Rush': { feudalSec: 625, militarySec: 740, mode: 'feudal' },
  'Elephant Rush': { feudalSec: 690, castleSec: 1020, mode: 'fc' },
  'Scorpions & Rams': { feudalSec: 690, castleSec: 1020, mode: 'fc' },
  'Hoang Rush': { feudalSec: 675, castleSec: 995, mode: 'fc' },
});

function linearScore(val, best, worst) {
  if (!Number.isFinite(val)) return 50;
  if (best === worst) return 50;
  const ratio = (val - worst) / (best - worst);
  return clampScore(ratio * 100);
}

/**
 * Califica las 4 etapas (Apertura, Feudal, Castillos, Imperial) con letras S–D
 * calibradas a la banda de ELO del jugador y basadas 100% en comandos del replay.
 */
function buildStageGrades(self, state, { opening = null, openingShort = null, playerElo = null, durationMs = 0 } = {}) {
  // Factor de exigencia suave por ELO (1000 ELO -> -0.6, 1200 -> 0, 1500 -> +0.8, 1800 -> +1.4)
  const elo = Number.isFinite(Number(playerElo)) && Number(playerElo) > 300 ? Number(playerElo) : 1150;
  const eloBand = Math.max(-1.0, Math.min(1.5, (elo - 1200) / 380));
  const durMs = Math.max(1, Number(durationMs) || 1);
  const fMs = state.feudalReachedMs != null && state.feudalReachedMs <= durMs ? state.feudalReachedMs : null;
  const cMs = state.castleReachedMs != null && state.castleReachedMs <= durMs ? state.castleReachedMs : null;
  const iMs = state.imperialReachedMs != null && state.imperialReachedMs <= durMs ? state.imperialReachedMs : null;

  const countBetween = (events, startMs, endMs) =>
    events.reduce((sum, ev) => (ev.ms >= startMs && ev.ms <= endMs ? sum + ev.amount : sum), 0);

  // 1. APERTURA (Alta Edad + detección automática de apertura)
  const target = (opening && OPENING_TARGETS[opening]) || { feudalSec: 640, mode: 'generic' };
  const darkIdle = self.tcIdleDarkSeconds;
  const idleBest = Math.max(3, 10 - eloBand * 4);
  const idleWorst = Math.max(45, 85 - eloBand * 16);
  const darkScore = darkIdle != null ? linearScore(darkIdle, idleBest, idleWorst) : 55;

  let timingScore = 72;
  let timingDeltaSec = null;
  const feudalSec = fMs != null ? fMs / 1000 : null;
  const castleSec = cMs != null ? cMs / 1000 : null;
  if (target.mode === 'fc' && castleSec != null) {
    const goal = target.castleSec - eloBand * 25;
    timingDeltaSec = Math.round(castleSec - goal);
    timingScore = linearScore(castleSec, goal - 20, goal + 150);
  } else if (feudalSec != null) {
    const goal = target.feudalSec - eloBand * 20;
    timingDeltaSec = Math.round(feudalSec - goal);
    timingScore = linearScore(feudalSec, goal - 15, goal + 135);
  }

  let followScore = 75;
  if (target.militarySec && state.firstMilitaryMs != null) {
    const firstMilSec = state.firstMilitaryMs / 1000;
    followScore = linearScore(firstMilSec, target.militarySec - 20, target.militarySec + 180);
  } else if (target.mode === 'boom') {
    followScore = self.townCenters >= 2 ? 92 : 55;
  }

  const openingScore = clampScore(darkScore * 0.50 + timingScore * 0.35 + followScore * 0.15);
  const darkAgeScore = clampScore(darkScore * 0.75 + timingScore * 0.25);
  const openingTitle = openingShort || (opening && opening !== 'Other' ? opening : 'Apertura estándar');
  let openingTip;
  if (darkIdle != null && darkIdle > 35) {
    openingTip = `Recortá ${fmtDurShort(darkIdle)} de TC inactivo antes de Feudal`;
  } else if (timingDeltaSec != null && timingDeltaSec > 45) {
    openingTip = `${target.mode === 'fc' ? 'Castillos' : 'Feudal'} +${timingDeltaSec} s sobre referencia de ${openingTitle}`;
  } else if (darkIdle != null && darkIdle <= 12) {
    openingTip = `Ejecución limpia · Alta ${fmtDurShort(darkIdle)}${feudalSec ? ` · Feudal ${fmtClockShort(feudalSec)}` : ''}`;
  } else {
    openingTip = feudalSec ? `Feudal ${fmtClockShort(feudalSec)} · ${fmtDurShort(darkIdle ?? 0)} idle en Alta` : 'Ejecución de apertura estable';
  }

  const openingSummary = {
    key: opening,
    name: openingTitle,
    grade: gradeFromScore(openingScore),
    score: openingScore,
    feudalSeconds: feudalSec != null ? Math.round(feudalSec) : null,
    darkIdleSeconds: darkIdle != null ? Math.round(darkIdle) : null,
    tip: openingTip,
  };

  // 1. ALTA EDAD (Dark Age explícita: TC inactivo + clic a Feudal)
  const darkTip = darkIdle != null && darkIdle <= 12
    ? `Alta impecable (${fmtDurShort(darkIdle)} inactivo)`
    : darkIdle != null && darkIdle <= 30
      ? `${fmtDurShort(darkIdle)} idle · ajustá el inicio de aldeanos`
      : `Perdiste ${fmtDurShort(darkIdle ?? 0)} en Alta Edad`;
  const stages = [
    {
      id: 'dark',
      label: 'Alta Edad',
      subtitle: feudalSec ? `Feudal ${fmtClockShort(feudalSec)}` : '0:00',
      status: 'ready',
      grade: gradeFromScore(darkAgeScore),
      score: darkAgeScore,
      metric: self.tcUtilizationDark != null ? `${String(self.tcUtilizationDark).replace('.', ',')}% TC · ${fmtDurShort(darkIdle ?? 0)}` : '—',
      tip: darkTip,
    },
  ];

  // 2. FEUDAL
  if (fMs == null) {
    stages.push({ id: 'feudal', label: 'Feudal', subtitle: null, status: 'not_reached', grade: null, score: null, metric: 'No alcanzada', tip: '' });
  } else {
    const fEnd = cMs ?? durMs;
    const fDurSec = Math.max(1, (fEnd - fMs) / 1000);
    const fUtil = self.tcUtilizationFeudal;
    const fIdle = self.tcIdleFeudalSeconds;
    const fIdlePerTc = self.tcIdleFeudalPerTcSeconds ?? fIdle;
    const fTcs = self.feudalActiveTcs || 1;
    const fVils = countBetween(state.villagerEvents, fMs, fEnd);
    const fMil = countBetween(state.militaryEvents, fMs, fEnd);
    const fPace = ((fVils + fMil) / (fDurSec / 60));

    const utilBest = Math.min(98, 94 + eloBand * 2.5);
    const utilWorst = Math.max(55, 68 + eloBand * 5);
    const utilScore = fUtil != null ? linearScore(fUtil, utilBest, utilWorst) : 60;
    const isFastTransition = fDurSec < 195;
    const paceScore = linearScore(fPace, 3.6 + eloBand * 0.5, 1.2);
    const feudalScore = isFastTransition
      ? clampScore(utilScore * 0.85 + 15)
      : clampScore(utilScore * 0.65 + paceScore * 0.35);

    let feudalTip;
    if (fIdlePerTc != null && fIdlePerTc >= 120) {
      feudalTip = fTcs > 1
        ? `${fmtDurShort(fIdlePerTc)}/TC inactivo en ${fTcs} TC (${Math.round(fDurSec / 60)}m de Feudal)`
        : `Perdiste ${fmtDurShort(fIdlePerTc)} de TC en Feudal`;
    } else if (isFastTransition) {
      feudalTip = `Transición limpia a Castillos (${fmtDurShort(fIdlePerTc ?? 0)} idle)`;
    } else if (fUtil != null && fUtil >= 93) {
      feudalTip = `TC firme (${String(fUtil).replace('.', ',')}%) · ${fVils} ald y ${fMil} mil`;
    } else {
      feudalTip = `${fVils} ald · ${fMil} mil producidos en Feudal`;
    }

    stages.push({
      id: 'feudal',
      label: 'Feudal',
      subtitle: fmtClockShort(fMs / 1000),
      status: 'ready',
      grade: gradeFromScore(feudalScore),
      score: feudalScore,
      metric: fUtil != null
        ? `${String(fUtil).replace('.', ',')}% TC · ${fmtDurShort(fIdlePerTc ?? 0)}${fTcs > 1 ? '/TC' : ''}`
        : `${fVils} ald · ${fMil} mil`,
      tip: feudalTip,
    });
  }

  // 3. CASTILLOS (boom + masa militar + talleres + micro; sin castigar tope 200 pop)
  if (cMs == null) {
    stages.push({ id: 'castle', label: 'Castillos', subtitle: null, status: 'not_reached', grade: null, score: null, metric: 'No alcanzada', tip: '' });
  } else {
    const cEnd = iMs ?? durMs;
    const cDurSec = Math.max(1, (cEnd - cMs) / 1000);
    const cMin = Math.max(1, cDurSec / 60);
    const cVils = countBetween(state.villagerEvents, cMs, cEnd);
    const cMil = countBetween(state.militaryEvents, cMs, cEnd);
    const cVilsPerMin = cVils / cMin;
    const cMilPerMin = cMil / cMin;

    // Si ya tiene >= 100 aldeanos totales (ej. 2TC Feudal Cumanos), no penaliza no sacar más en Castillos
    const boomScore = self.villagersOrdered >= 100
      ? 90
      : linearScore(cVilsPerMin, 4.2 + eloBand * 0.5, 1.0);
    const milPaceScore = linearScore(cMilPerMin, 3.8 + eloBand * 0.7, 0.4);
    const wsScore = self.workshopUtilization != null
      ? linearScore(self.workshopUtilization, 82, 25)
      : (cMil >= 15 ? 65 : 40);
    const combatMicro = state.attackMoveCount + state.patrolCount;
    const microScore = clampScore(
      (combatMicro >= 12 ? 95 : combatMicro >= 4 ? 75 : combatMicro >= 1 ? 58 : 35)
      - Math.min(30, state.townBellCount * 15),
    );
    const castleScore = clampScore(boomScore * 0.35 + milPaceScore * 0.30 + wsScore * 0.15 + microScore * 0.20);

    let castleTip;
    if (cMilPerMin < 1.2 && cDurSec >= 240) {
      castleTip = `Producción militar baja (${cMil} uds en Castillos)`;
    } else if (combatMicro === 0 && cMil >= 15) {
      castleTip = 'Sumá Attack-Move o Patrol en peleas';
    } else if (self.workshopsCount >= 4 && (self.workshopUtilization ?? 0) >= 75) {
      castleTip = `${self.workshopsCount} talleres activos al ${self.workshopUtilization}%`;
    } else {
      castleTip = `${cMil} uds militares · ${cVils} aldeanos en Castillos`;
    }

    stages.push({
      id: 'castle',
      label: 'Castillos',
      subtitle: fmtClockShort(cMs / 1000),
      status: 'ready',
      grade: gradeFromScore(castleScore),
      score: castleScore,
      metric: `${cMil} mil · ${self.workshopsCount} talleres`,
      tip: castleTip,
    });
  }

  // 4. IMPERIAL (0% penalización por TC inactivo; mide masa militar, talleres y eAPM)
  if (iMs == null || durMs - iMs < 45_000) {
    stages.push({ id: 'imperial', label: 'Imperial', subtitle: null, status: 'not_reached', grade: null, score: null, metric: 'No alcanzada', tip: '' });
  } else {
    const iMin = Math.max(1, (durMs - iMs) / 60_000);
    const iMil = countBetween(state.militaryEvents, iMs, durMs);
    const iMilPerMin = iMil / iMin;
    const iEffActions = state.effectiveActionTimes.filter((t) => t >= iMs).length;
    const iEapm = Math.round((iEffActions / iMin) * 10) / 10;

    const impMilScore = linearScore(iMilPerMin, 5.5 + eloBand * 0.9, 1.0);
    const wsScore = self.workshopUtilization != null ? linearScore(self.workshopUtilization, 82, 30) : 55;
    const eapmScore = linearScore(iEapm, 46 + eloBand * 9, 18);
    const impScore = clampScore(impMilScore * 0.50 + wsScore * 0.30 + eapmScore * 0.20);

    let impTip;
    if (iMilPerMin >= 4.5) {
      impTip = `Ritmo sostenido · ${String(Math.round(iMilPerMin * 10) / 10).replace('.', ',')} uds/min`;
    } else if (self.workshopsCount < 5) {
      impTip = `Solo ${self.workshopsCount} talleres: sumá producción en Imperial`;
    } else {
      impTip = `${iMil} uds militares · ${String(iEapm).replace('.', ',')} eAPM en Imperial`;
    }

    stages.push({
      id: 'imperial',
      label: 'Imperial',
      subtitle: fmtClockShort(iMs / 1000),
      status: 'ready',
      grade: gradeFromScore(impScore),
      score: impScore,
      metric: `${String(Math.round(iMilPerMin * 10) / 10).replace('.', ',')} uds/m · ${String(iEapm).replace('.', ',')} eAPM`,
      tip: impTip,
    });
  }

  return { openingSummary, stages };
}

function buildHighlightsAndFocus(self, rival) {
  const highlights = [];

  if (self.tcIdleDarkSeconds != null && self.tcIdleDarkSeconds <= 15 && self.villagersOrdered >= 15) {
    highlights.push({
      id: 'dark-clean-v1',
      tone: 'good',
      icon: 'villager',
      title: 'Alta Edad muy limpia',
      detail: `Solo ${fmtDurShort(self.tcIdleDarkSeconds)} de TC inactivo (${String(self.tcUtilizationDark ?? 0).replace('.', ',')}%).`,
    });
  } else if (self.tcUtilization != null && self.villagersOrdered >= 20 &&
      (self.tcUtilization >= 92 || (self.tcIdleSeconds != null && self.tcIdleSeconds <= 45))) {
    highlights.push({
      id: 'tc-continuity-v1',
      tone: 'good',
      icon: 'villager',
      title: 'Continuidad de TC',
      detail: `${String(self.tcUtilization).replace('.', ',')}% en Alta + Feudal · ${fmtDurShort(self.tcIdleSeconds ?? 0)} inactivo.`,
    });
  }

  if (self.workshopsCount >= 4 && (self.workshopUtilization ?? 0) >= 80) {
    highlights.push({
      id: 'workshops-active-v1',
      tone: 'good',
      icon: 'sword',
      title: 'Talleres bien aprovechados',
      detail: `${self.workshopsCount} edificios militares al ${self.workshopUtilization}% de uso.`,
    });
  } else if (rival && self.militaryOrdered >= 20 && rival.militaryOrdered >= 10 &&
      self.militaryOrdered >= rival.militaryOrdered * 1.2) {
    const pctMore = Math.round(((self.militaryOrdered - rival.militaryOrdered) / rival.militaryOrdered) * 100);
    highlights.push({
      id: 'military-volume-v1',
      tone: 'good',
      icon: 'sword',
      title: 'Superioridad militar',
      detail: `${self.militaryOrdered} unidades frente a ${rival.militaryOrdered} del rival (+${pctMore}%).`,
    });
  }

  if (self.habits.attackMove + self.habits.patrol >= 12) {
    highlights.push({
      id: 'combat-micro-v1',
      tone: 'good',
      icon: 'combat',
      title: 'Control activo en combate',
      detail: `${self.habits.attackMove + self.habits.patrol} órdenes de Attack-Move / Patrol.`,
    });
  }

  // Alertas accionables con iconografía (máx. 1–2 para completar 3 badges)
  const saturatedWs = (self.topWorkshops || []).find((w) => w.status === 'saturated');
  if (saturatedWs) {
    highlights.push({
      id: 'workshop-queue-saturated-v1',
      tone: 'warn',
      icon: 'building',
      title: `Colas altas en ${saturatedWs.name}`,
      detail: `Pico de ${Math.round(saturatedWs.peakQueue)} uds en cola (${saturatedWs.count} edif.): te faltó sumar producción.`,
    });
  }

  const fIdleCheck = self.tcIdleFeudalPerTcSeconds ?? self.tcIdleFeudalSeconds;
  if (fIdleCheck != null && fIdleCheck >= 120) {
    highlights.push({
      id: 'feudal-tc-leak-v1',
      tone: 'warn',
      icon: 'clock',
      title: 'Fuga de TC en Feudal',
      detail: `${fmtDurShort(fIdleCheck)}${(self.feudalActiveTcs || 1) > 1 ? `/TC en ${self.feudalActiveTcs} TC` : ''} sin producir (${String(self.tcUtilizationFeudal ?? 0).replace('.', ',')}%).`,
    });
  }

  if (self.militaryOrdered >= 25 && self.habits.attackMove + self.habits.patrol === 0 && self.habits.move >= 100) {
    highlights.push({
      id: 'no-attack-move-v1',
      tone: 'warn',
      icon: 'combat',
      title: 'Sin Attack-Move / Patrol',
      detail: `${self.habits.move} clics de mover y 0 órdenes de combate en área.`,
    });
  }

  if (self.habits.market >= 10) {
    highlights.push({
      id: 'market-heavy-v1',
      tone: 'warn',
      icon: 'market',
      title: 'Uso alto de Mercado',
      detail: `${self.habits.market} operaciones: revisá el balance de aldeanos.`,
    });
  }

  if (self.habits.townBell >= 2) {
    highlights.push({
      id: 'town-bell-v1',
      tone: 'warn',
      icon: 'shield',
      title: 'Campana Urbana',
      detail: `Usada ${self.habits.townBell} veces: frena toda tu economía.`,
    });
  }

  // Un solo foco accionable universal de AoE2 (nunca consejos contextuales de tech)
  const earlySelfPerTc = (self.tcIdleDarkSeconds != null && self.tcIdleFeudalPerTcSeconds != null)
    ? Math.round((self.tcIdleDarkSeconds + self.tcIdleFeudalPerTcSeconds) * 10) / 10
    : self.tcIdleSeconds;
  const earlyRivalPerTc = rival
    ? ((rival.tcIdleDarkSeconds != null && rival.tcIdleFeudalPerTcSeconds != null)
      ? Math.round((rival.tcIdleDarkSeconds + rival.tcIdleFeudalPerTcSeconds) * 10) / 10
      : rival.tcIdleSeconds)
    : null;
  let focus = null;
  if (earlySelfPerTc != null && earlySelfPerTc >= 90 && (earlyRivalPerTc == null || earlySelfPerTc > earlyRivalPerTc)) {
    focus = {
      title: 'Reducir huecos de TC en Alta + Feudal',
      detail: `Registraste ${fmtDurShort(earlySelfPerTc)}${(self.feudalActiveTcs || 1) > 1 ? '/TC' : ''} de TC inactivo antes de Castillos (${String(self.tcUtilization).replace('.', ',')}%${earlyRivalPerTc != null ? ` · rival ${fmtDurShort(earlyRivalPerTc)}` : ''}). Mantené el ciclo de TC constante en Feudal.`,
    };
  } else if (self.habits.townBell >= 2) {
    focus = {
      title: 'Evitar la Campana Urbana',
      detail: `Tocaste la campana ${self.habits.townBell} veces: paraliza toda tu economía. Guarecé manualmente solo el grupo de aldeanos bajo ataque.`,
    };
  } else if (self.militaryOrdered >= 25 && self.habits.attackMove + self.habits.patrol === 0 && self.habits.move >= 100) {
    focus = {
      title: 'Usar Attack-Move o Patrullar en peleas',
      detail: `Registraste ${self.habits.move} órdenes de mover y 0 de Attack-Move/Patrullar. Usarlo evita que tus unidades persigan a un solo objetivo sin disparar.`,
    };
  } else if (rival && self.militaryOrdered >= 10 && self.militaryOrdered < rival.militaryOrdered * 0.8) {
    focus = {
      title: 'Sostener producción militar constante',
      detail: `Encargaste ${self.militaryOrdered} unidades frente a ${rival.militaryOrdered} del rival (${self.workshopsCount} talleres activos). Sumar talleres antes de flotar recursos evita quedarte sin masa.`,
    };
  } else if (self.habits.market >= 8) {
    focus = {
      title: 'Equilibrar reparto de aldeanos',
      detail: `Usaste el Mercado ${self.habits.market} veces. Revisá si acumulaste exceso de un recurso por falta de ajuste temprano de aldeanos.`,
    };
  } else if (self.tcUtilization != null && self.tcUtilization >= 90) {
    focus = {
      title: 'Ejecución de producción muy limpia',
      detail: `Sostuviste ${String(self.tcUtilization).replace('.', ',')}% de continuidad de TC en Alta + Feudal y ${self.militaryOrdered} unidades militares. Revisá los intercambios clave en el replay.`,
    };
  }

  return { highlights: highlights.slice(0, 3), focus };
}

/**
 * Ejecuta el análisis completo sobre `chapter.operations` del .aoe2record.
 */
function analyzePostmatchEngine(operations, {
  selfSlot, rivalSlot = null, selfCiv = null, rivalCiv = null,
  selfAges = null, rivalAges = null, opening = null, openingShort = null,
  playerElo = null, durationMs = 0,
} = {}) {
  const list = Array.isArray(operations) ? operations : [];
  if (!list.length || !Number.isFinite(Number(selfSlot))) return null;

  const selfId = Number(selfSlot);
  const rivalId = Number.isFinite(Number(rivalSlot)) && Number(rivalSlot) > 0 ? Number(rivalSlot) : null;
  const tracked = new Map([[selfId, createSlotState(selfId, selfCiv, selfAges)]]);
  if (rivalId && rivalId !== selfId) tracked.set(rivalId, createSlotState(rivalId, rivalCiv, rivalAges));

  let maxMs = Number(durationMs) || 0;

  for (const op of list) {
    const info = actionInfo(op);
    if (!info) continue;
    if (info.ms > maxMs) maxMs = info.ms;
    const state = tracked.get(info.playerId);
    if (!state) continue;

    state.totalActions += 1;
    // eAPM: ignora clics duplicados del mismo comando en < 150 ms
    const prevMs = state.lastActionByType.get(info.type);
    if (prevMs == null || info.ms - prevMs >= 150) {
      state.effectiveActions += 1;
      state.effectiveActionTimes.push(info.ms);
      state.lastActionByType.set(info.type, info.ms);
    }

    if (MILITARY_COMMANDS.has(info.type)) {
      state.militaryActions += 1;
      state.militaryActionTimes.push(info.ms);
    } else if (ECO_COMMANDS.has(info.type)) {
      state.ecoActions += 1;
      state.ecoActionTimes.push(info.ms);
    }

    if (info.type === 'Move') state.moveCount += 1;
    else if (info.type === 'DeAttackMove' || info.type === 'AttackGround') state.attackMoveCount += 1;
    else if (info.type === 'Patrol') state.patrolCount += 1;
    else if (info.type === 'Buy' || info.type === 'Sell') {
      state.marketCount += 1;
      if (info.ms <= 20 * 60_000) state.marketEarlyOps += 1;
      const bytes = Array.isArray(info.payload.data) ? info.payload.data : null;
      const resId = bytes ? Number(bytes[0]) : Number(info.payload.resource_type);
      const mult = bytes && Number(bytes[2]) > 0 ? Math.min(20, Number(bytes[2])) : 1;
      const resKey = resId === 0 ? 'food' : resId === 1 ? 'wood' : resId === 2 ? 'stone' : null;
      if (resKey) {
        if (info.type === 'Buy') state.marketBought[resKey] += mult * 100;
        else state.marketSold[resKey] += mult * 100;
      }
    }
    else if (info.type === 'TownBell') state.townBellCount += 1;
    else if (info.type === 'Tribute') state.tributesSent += 1;
    else if (info.type === 'Delete') state.selfDeleted += 1;

    if (info.type === 'Research') {
      const techId = Number(info.payload.technology_type);
      const tcSec = tcResearchDuration(techId, state.civ);
      if (tcSec > 0 && !state.seenTcTechs.has(techId)) {
        state.seenTcTechs.add(techId);
        const bIds = Array.isArray(info.payload.building_ids) && info.payload.building_ids.length
          ? info.payload.building_ids.map(String)
          : state.tcs.size ? [[...state.tcs.keys()][0]] : [`tc_${info.playerId}`];
        const tc = pickShortestQueue(bIds.map((k) => ensureTc(state, k)));
        const start = tc.busyUntil === null
          ? info.ms
          : Math.min(info.ms + VILLAGER_TRAIN_S * 1000, Math.max(info.ms, tc.busyUntil));
        const end = start + tcSec * 1000;
        tc.intervals.push([start, end]);
        tc.busyUntil = end;
        if (techId === 101) {
          if (state.feudalClickMs == null) state.feudalClickMs = info.ms;
          if (state.feudalReachedMs == null) state.feudalReachedMs = end;
        }
        if (techId === 102 && state.castleReachedMs == null) state.castleReachedMs = end;
        if (techId === 103 && state.imperialReachedMs == null) state.imperialReachedMs = end;
      }
      continue;
    }

    if (info.type === 'DeQueue') {
      const unitId = Number(info.payload.unit_id);
      if (!Number.isFinite(unitId) || unitId <= 0) continue;
      const amount = Math.max(1, Math.min(256, Number(info.payload.amount) || 1));
      const bType = Number(info.payload.building_type) || 0;
      const unit = unitInfo(unitId);

      if (VILLAGERS.has(unitId)) {
        state.villagersOrdered += amount;
        state.villagerEvents.push({ ms: info.ms, amount });
        state.tcOrderTimes.push(info.ms);
        const bIds = Array.isArray(info.payload.building_ids) && info.payload.building_ids.length
          ? info.payload.building_ids.map(String)
          : [`tc_${info.playerId}`];
        const tc = pickShortestQueue(bIds.map((k) => ensureTc(state, k)));
        const start = tc.busyUntil === null ? info.ms : Math.max(info.ms, tc.busyUntil);
        const maxEnd = info.ms + TC_MAX_QUEUE_AHEAD_MS;
        const end = Math.min(maxEnd, start + Math.min(5, amount) * VILLAGER_TRAIN_S * 1000);
        if (end > start) {
          tc.intervals.push([start, end]);
          tc.busyUntil = end;
        }
        tc.villagers += amount;
        if (state.firstTcOrderMs === null || info.ms < state.firstTcOrderMs) state.firstTcOrderMs = info.ms;
        state.lastTcOrderMs = Math.max(state.lastTcOrderMs || 0, info.ms);
      } else {
        state.militaryOrdered += amount;
        state.militaryEvents.push({ ms: info.ms, amount });
        if (state.firstMilitaryMs == null) state.firstMilitaryMs = info.ms;
        const bucket = state.unitCounts.get(unit.key) || { key: unit.key, unitId, name: unit.name, count: 0 };
        bucket.count += amount;
        state.unitCounts.set(unit.key, bucket);

        if (MILITARY_BUILDING_TYPES.has(bType) || bType > 0) {
          const bIds = Array.isArray(info.payload.building_ids) && info.payload.building_ids.length
            ? info.payload.building_ids.map(String)
            : [`ws_${bType}`];
          const candidates = bIds.map((k) => {
            let ws = state.workshops.get(k);
            if (!ws) {
              ws = { id: k, typeId: bType, busyUntil: null, intervals: [], units: 0, firstMs: info.ms, lastMs: info.ms, maxQueue: 0, orders: 0, overloadedOrders: 0 };
              state.workshops.set(k, ws);
            }
            return ws;
          });
          const ws = pickShortestQueue(candidates);
          const trainSec = unit.trainSeconds || 25;
          const trainMs = trainSec * 1000;
          const remMs = ws.busyUntil !== null ? Math.max(0, ws.busyUntil - info.ms) : 0;
          const qDepth = remMs / trainMs + amount;
          ws.maxQueue = Math.max(ws.maxQueue, qDepth);
          ws.orders += 1;
          if (qDepth >= 4) ws.overloadedOrders += 1;
          const start = ws.busyUntil === null ? info.ms : Math.max(info.ms, ws.busyUntil);
          const end = Math.min(info.ms + 10 * trainMs, start + amount * trainMs);
          if (end > start) {
            ws.intervals.push([start, end]);
            ws.busyUntil = end;
          }
          ws.units += amount;
          ws.lastMs = Math.max(ws.lastMs, info.ms);
        }
      }
    }
  }

  const selfState = tracked.get(selfId);
  const rivalState = rivalId ? tracked.get(rivalId) : null;
  const self = finalizePlayer(selfState, maxMs);
  const rival = rivalState ? finalizePlayer(rivalState, maxMs) : null;
  const timeline = buildTimelineBuckets(selfState, rivalState, maxMs, 12);
  const { openingSummary, stages } = buildStageGrades(self, selfState, { opening, openingShort, playerElo, durationMs: maxMs });
  const { highlights, focus } = buildHighlightsAndFocus(self, rival);

  return {
    version: VERSION,
    durationSeconds: Math.round((maxMs / 1000) * 10) / 10,
    self,
    rival,
    openingSummary,
    stages,
    timeline,
    highlights,
    focus,
  };
}

module.exports = {
  VERSION,
  analyzePostmatchEngine,
  gradeFromScore,
  TC_RESEARCH_SECONDS,
};
