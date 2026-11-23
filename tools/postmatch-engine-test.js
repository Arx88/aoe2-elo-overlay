'use strict';

const assert = require('node:assert/strict');
const { analyzePostmatchEngine } = require('../src/engine/postmatch-engine');
const { normalizeTelemetry, buildPostMatchReport } = require('../src/postmatch');
const TacticalUI = require('../ui/tactical-ui');

function op(playerId, ms, type, payload = {}) {
  return {
    Action: {
      world_time: ms,
      action_data: {
        [type]: { player_id: playerId, ...payload },
      },
    },
  };
}

// 1. TC Research deduction + multi-TC shortest-queue + military + debounced eAPM + habits
{
  const ops = [];
  // Self (slot 1): 10 villagers back-to-back on TC 100 (0..250s), then Loom (25s) + Feudal (130s) -> zero idle!
  for (let i = 0; i < 10; i += 1) {
    ops.push(op(1, i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100], building_type: 109 }));
  }
  ops.push(op(1, 250_000, 'Research', { technology_type: 22, building_ids: [100] })); // Loom 25s -> 275s
  ops.push(op(1, 275_000, 'Research', { technology_type: 101, building_ids: [100] })); // Feudal 130s -> 405s
  ops.push(op(1, 275_200, 'Research', { technology_type: 101, building_ids: [100] })); // Duplicate click must be ignored
  // Two TCs selected together at 405s: 2 villagers should distribute across TC 100 and TC 101 (shortest queue)
  ops.push(op(1, 405_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100, 101], building_type: 109 }));
  ops.push(op(1, 405_200, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100, 101], building_type: 109 }));
  // More villagers until 600s: queue both TCs every 25s -> 0s idle on both TCs
  for (let i = 0; i < 7; i += 1) {
    ops.push(op(1, 430_000 + i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100, 101], building_type: 109 }));
    ops.push(op(1, 430_200 + i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100, 101], building_type: 109 }));
  }

  // Military: 24 Knights (unit 38, stable building_type 101) across 2 stables + 10 Archers (unit 4, range 87)
  for (let i = 0; i < 12; i += 1) {
    ops.push(op(1, 420_000 + i * 15_000, 'DeQueue', { unit_id: 38, amount: 2, building_ids: [201, 202], building_type: 101 }));
  }
  for (let i = 0; i < 5; i += 1) {
    ops.push(op(1, 450_000 + i * 25_000, 'DeQueue', { unit_id: 4, amount: 2, building_ids: [203], building_type: 87 }));
  }

  // Debounced eAPM: 4 rapid Move clicks within 50ms each -> only 1 effective action
  ops.push(op(1, 500_000, 'Move', {}));
  ops.push(op(1, 500_040, 'Move', {}));
  ops.push(op(1, 500_080, 'Move', {}));
  ops.push(op(1, 500_120, 'Move', {}));
  // Click >= 150ms later counts as effective
  ops.push(op(1, 500_300, 'Move', {}));
  // Combat micro habits
  for (let i = 0; i < 10; i += 1) ops.push(op(1, 510_000 + i * 1000, 'DeAttackMove', {}));
  for (let i = 0; i < 4; i += 1) ops.push(op(1, 530_000 + i * 1000, 'Patrol', {}));
  ops.push(op(1, 540_000, 'Buy', { data: [0, 0, 2, 0] }));  // Buy 200 food
  ops.push(op(1, 541_000, 'Sell', { data: [1, 0, 4, 0] })); // Sell 400 wood

  // Rival (slot 2): huge TC idle gap (150s) and fewer military units
  for (let i = 0; i < 6; i += 1) {
    ops.push(op(2, i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [300], building_type: 109 }));
  }
  for (let i = 0; i < 6; i += 1) {
    ops.push(op(2, 350_000 + i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [300], building_type: 109 }));
  }
  for (let i = 0; i < 5; i += 1) {
    ops.push(op(2, 460_000 + i * 20_000, 'DeQueue', { unit_id: 4, amount: 2, building_ids: [301], building_type: 87 }));
  }

  const res = analyzePostmatchEngine(ops, {
    selfSlot: 1,
    rivalSlot: 2,
    selfCiv: 'Franks',
    rivalCiv: 'Britons',
    opening: 'Scout Rush',
    openingShort: 'Scouts',
    playerElo: 1200,
    durationMs: 600_000,
  });

  assert.equal(res.version, 'postmatch-engine-v1');
  assert.equal(res.self.villagersOrdered, 26);
  assert.equal(res.self.townCenters, 2);
  // Loom + Feudal were deducted properly, so TC utilization stays very high and idle is near 0
  assert.ok(res.self.tcUtilization >= 95, `expected TC utilization >= 95%, got ${res.self.tcUtilization}`);
  assert.ok(res.self.tcIdleSeconds <= 5, `expected TC idle <= 5s, got ${res.self.tcIdleSeconds}`);
  assert.ok(res.self.tcIdleDarkSeconds != null && res.self.tcIdleDarkSeconds <= 1, `expected Dark idle <= 1s, got ${res.self.tcIdleDarkSeconds}`);
  assert.ok(res.self.tcIdleFeudalSeconds != null && res.self.tcIdleFeudalSeconds <= 5, `expected Feudal idle <= 5s, got ${res.self.tcIdleFeudalSeconds}`);
  assert.ok(res.self.tcIdleTotalSeconds != null && res.self.tcIdleTotalSeconds <= 5, `expected Total idle <= 5s, got ${res.self.tcIdleTotalSeconds}`);
  assert.ok(res.rival.tcIdleSeconds >= 180, `expected rival TC idle >= 180s, got ${res.rival.tcIdleSeconds}`);

  // Military & workshops
  assert.equal(res.self.militaryOrdered, 34);
  assert.equal(res.self.workshopsCount, 3);
  assert.ok(res.self.topUnits.length >= 2);
  assert.equal(res.self.topUnits[0].count, 24);
  assert.equal(res.self.topUnits[1].count, 10);

  // Debounced eAPM < APM due to 3 duplicate Move clicks inside 150ms
  assert.ok(res.self.apm > res.self.eapm, `expected apm (${res.self.apm}) > eapm (${res.self.eapm})`);
  assert.equal(res.self.habits.move, 5);
  assert.equal(res.self.habits.attackMove, 10);
  assert.equal(res.self.habits.patrol, 4);
  assert.equal(res.self.habits.market, 2);

  // Timeline: 12 monotonic buckets
  assert.equal(res.timeline.length, 12);
  for (let i = 1; i < res.timeline.length; i += 1) {
    assert.ok(res.timeline[i].selfVillagers >= res.timeline[i - 1].selfVillagers);
    assert.ok(res.timeline[i].selfMilitary >= res.timeline[i - 1].selfMilitary);
  }
  assert.equal(res.timeline[11].selfVillagers, 26);
  assert.equal(res.timeline[11].selfMilitary, 34);

  // Highlights, opening summary, 4 explicit age stages (S-D) & universal focus
  assert.ok(res.openingSummary && res.openingSummary.name === 'Scouts');
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(res.openingSummary.grade));
  assert.ok(Array.isArray(res.stages) && res.stages.length === 4, 'must output 4 age stages (dark, feudal, castle, imperial)');
  assert.equal(res.stages[0].id, 'dark');
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(res.stages[0].grade));
  assert.equal(res.stages[1].id, 'feudal');
  assert.equal(res.stages[1].status, 'ready');
  assert.equal(res.stages[2].id, 'castle');
  assert.equal(res.stages[2].status, 'not_reached');
  assert.equal(res.stages[3].id, 'imperial');
  assert.equal(res.stages[3].status, 'not_reached');
  assert.ok(res.self.topWorkshops[0].peakQueue >= 1, 'workshops must track queue saturation');
  assert.ok(res.self.combatMicro && res.self.combatMicro.combatOrders === 14);
  assert.ok(res.self.marketProfile && res.self.marketProfile.sold.wood === 400 && res.self.marketProfile.bought.food === 200);
  assert.ok(res.rival.biggestTcGap && res.rival.biggestTcGap.durationSec >= 150, 'must detect exact rival TC gap');
  assert.ok(res.highlights.length >= 1 && res.highlights.length <= 3);
  assert.ok(res.focus && res.focus.title);
}

// 2. TownBell focus trigger & Goth Loom / Malay age-up duration adjustments
{
  const ops = [
    op(1, 0, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [10], building_type: 109 }),
    op(1, 25_000, 'Research', { technology_type: 22, building_ids: [10] }), // Goth Loom = 1s
    op(1, 50_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [10], building_type: 109 }),
    op(1, 60_000, 'TownBell', {}),
    op(1, 90_000, 'TownBell', {}),
  ];
  const goth = analyzePostmatchEngine(ops, { selfSlot: 1, selfCiv: 'Goths', durationMs: 120_000 });
  assert.ok(goth.self.tcIdleSeconds >= 23, `Goth Loom should only cover 1s, leaving ~24s idle (got ${goth.self.tcIdleSeconds})`);
  assert.equal(goth.self.habits.townBell, 2);
  assert.match(goth.focus.title, /Campana Urbana/i);
}

// 3. Personal evolution vs own prior saved matches + UI rendering (compact & detail) + CSP safety
{
  function makeRecord(matchId, startedAt, { tcUtil, tcIdle, vils, mil, eapm, mode = 3 }) {
    const engineSummary = {
      version: 'postmatch-engine-v1',
      durationSeconds: 1800,
      self: {
        villagersOrdered: vils,
        townCenters: 3,
        tcIdleSeconds: tcIdle,
        tcIdleTotalSeconds: tcIdle + 30,
        tcUtilization: tcUtil,
        tcIdleRatio: Math.round((1 - tcUtil / 100) * 1000) / 1000,
        militaryOrdered: mil,
        workshopsCount: 5,
        workshopUtilization: 72,
        topUnits: [{ key: 'caballero', name: 'Caballero', count: Math.round(mil * 0.6) }, { key: 'guerrillero', name: 'Guerrillero', count: Math.round(mil * 0.4) }],
        topWorkshops: [{ key: 'establo', name: 'Establo', count: 3, units: Math.round(mil * 0.6) }],
        apm: eapm + 12,
        eapm,
        militarySharePct: 54,
        ecoSharePct: 46,
        habits: { move: 220, attackMove: 18, patrol: 9, market: 3, townBell: 0, tributes: 0, selfDeleted: 1 },
      },
      rival: {
        villagersOrdered: 62,
        townCenters: 2,
        tcIdleSeconds: 132,
        tcIdleTotalSeconds: 165,
        tcUtilization: 86.2,
        tcIdleRatio: 0.138,
        militaryOrdered: 48,
        workshopsCount: 4,
        workshopUtilization: 64,
        topUnits: [{ key: 'ballestero', name: 'Ballestero', count: 32 }, { key: 'piquero', name: 'Piquero', count: 16 }],
        topWorkshops: [{ key: 'galeria-de-tiro-con-arco', name: 'Galería de tiro con arco', count: 2, units: 32 }],
        apm: 44,
        eapm: 35,
        militarySharePct: 50,
        ecoSharePct: 50,
        habits: { move: 180, attackMove: 6, patrol: 2, market: 5, townBell: 1, tributes: 0, selfDeleted: 0 },
      },
      timeline: Array.from({ length: 12 }, (_, idx) => ({
        seconds: (idx + 1) * 150,
        selfVillagers: Math.round((vils / 12) * (idx + 1)),
        rivalVillagers: Math.round((62 / 12) * (idx + 1)),
        selfMilitary: Math.round((mil / 12) * Math.max(0, idx - 1)),
        rivalMilitary: Math.round((48 / 12) * Math.max(0, idx - 1)),
      })),
      openingSummary: {
        name: 'Scouts', grade: tcUtil >= 94 ? 'S' : 'A', score: Math.round(tcUtil),
        feudalSeconds: 605, darkIdleSeconds: 6, tip: 'Ejecución limpia · Alta 6 s · Feudal 10:05',
      },
      stages: [
        { id: 'dark', label: 'Alta Edad', subtitle: 'Feudal 10:05', status: 'ready', grade: tcUtil >= 94 ? 'S' : 'A', score: Math.round(tcUtil), metric: '99% TC · 6 s', tip: 'Alta impecable' },
        { id: 'feudal', label: 'Feudal', subtitle: '10:05', status: 'ready', grade: 'A', score: Math.round(tcUtil - 4), metric: '92% TC · 38 s', tip: 'TC firme en Feudal' },
        { id: 'castle', label: 'Castillos', subtitle: '18:40', status: 'ready', grade: 'B', score: 68, metric: '48 mil · 5 talleres', tip: 'Buen ritmo de talleres' },
        { id: 'imperial', label: 'Imperial', subtitle: null, status: 'not_reached', grade: null, score: null, metric: 'No alcanzada', tip: '' },
      ],
      highlights: [
        { id: 'tc-continuity-v1', icon: 'villager', title: 'Continuidad de Centro Urbano', detail: `${tcUtil}% de aprovechamiento · solo ${tcIdle} s sin producir en 3 TC.` },
        { id: 'military-volume-v1', icon: 'sword', title: 'Superioridad de producción militar', detail: `Encargaste ${mil} unidades frente a 48 del rival.` },
      ],
      focus: {
        title: 'Ejecución de producción muy limpia',
        detail: `Sostuviste ${tcUtil}% de continuidad de TC (${vils} aldeanos) y ${mil} unidades militares.`,
      },
    };
    const rawTelemetry = {
      schemaVersion: 1,
      matchId,
      profileId: '25399083',
      clock: 'game',
      durationSeconds: 1800,
      source: { id: 'aoe2rec-local', type: 'replay-analysis', version: '2.2.4' },
      context: { mapName: 'Arabia', leaderboardId: mode, civ: 'Franks', gameSpeed: 'normal', startingAge: 'dark' },
      metrics: {
        apm: { value: eapm + 12, definition: 'raw-command-apm-v1' },
        eapm: { value: eapm, definition: 'debounced-command-eapm-v1' },
        feudalSeconds: { value: 605, definition: 'age-reached-game-seconds-v1' },
        castleSeconds: { value: 1120, definition: 'age-reached-game-seconds-v1' },
      },
      phases: {},
      engineSummary,
    };
    const norm = normalizeTelemetry(rawTelemetry, { matchId, profileId: '25399083' });
    assert.equal(norm.status, 'ready', `telemetry should validate: ${norm.warnings.join('; ')}`);
    return {
      matchId,
      profileId: '25399083',
      startedAt,
      leaderboardId: mode,
      mapName: 'Arabia',
      civ: 'Franks',
      won: true,
      ratingDiff: 15,
      durationSeconds: 1800,
      rival: { name: 'El brujo embrujado', civ: 'Britons' },
      telemetry: norm.data,
    };
  }

  const history = [
    makeRecord('1001', '2026-11-15T10:00:00Z', { tcUtil: 88.0, tcIdle: 115, vils: 66, mil: 52, eapm: 38 }),
    makeRecord('1002', '2026-11-16T10:00:00Z', { tcUtil: 90.2, tcIdle: 92, vils: 70, mil: 58, eapm: 40 }),
    makeRecord('1003', '2026-11-17T10:00:00Z', { tcUtil: 91.5, tcIdle: 78, vils: 72, mil: 60, eapm: 41 }),
    makeRecord('1004', '2026-11-18T10:00:00Z', { tcUtil: 89.4, tcIdle: 102, vils: 68, mil: 55, eapm: 39 }),
    // Different mode (Team RM = 4) must NOT pollute 1v1 personal baseline
    makeRecord('1005', '2026-11-19T10:00:00Z', { tcUtil: 99.9, tcIdle: 2, vils: 120, mil: 140, eapm: 90, mode: 4 }),
  ];

  const current = makeRecord('1006', '2026-11-20T10:00:00Z', { tcUtil: 95.8, tcIdle: 38, vils: 81, mil: 74, eapm: 46 });

  const report = buildPostMatchReport({
    match: {
      matchId: current.matchId,
      startedAt: current.startedAt,
      finishedAt: '2026-11-20T10:30:00Z',
      leaderboardId: 3,
      mapName: 'Arabia',
      players: [
        { profileId: '25399083', name: 'PSX | Acido', civ: 'Franks', team: 1, won: true, ratingDiff: 16 },
        { profileId: '99999999', name: 'El brujo embrujado', civ: 'Britons', team: 2, won: false, ratingDiff: -16 },
      ],
    },
    profileId: '25399083',
    telemetry: current.telemetry,
    records: history,
  });

  assert.ok(report.engine, 'report.engine must be present');
  assert.equal(report.engine.rivalName, 'El brujo embrujado');
  assert.equal(report.engine.rivalCiv, 'Britons');
  assert.ok(report.engine.evolution, 'report.engine.evolution must be computed');
  assert.equal(report.engine.evolution.sampleSize, 4, 'only the 4 prior RM 1v1 matches should count');
  assert.equal(report.engine.evolution.metrics.tcUtilization.isBest, true);
  assert.equal(report.engine.evolution.metrics.tcUtilization.betterThanPct, 100);
  assert.ok(report.engine.evolution.metrics.tcUtilization.delta > 5);
  assert.equal(report.engine.evolution.metrics.tcUtilization.series.length, 5);
  assert.equal(report.engine.evolution.metrics.tcIdleSeconds.isBest, true);
  assert.equal(report.engine.evolution.metrics.tcIdleSeconds.improved, true);
  assert.ok(report.engine.evolution.headline && /Récord personal/i.test(report.engine.evolution.headline.text));

  // Render unified single Postmatch card (no separate compact variant)
  const unifiedHtml = TacticalUI.renderPostMatch(report, { replay: true, comparison: true });
  const unifiedWithCompactFlag = TacticalUI.renderPostMatch(report, { compact: true, replay: true, comparison: true });
  assert.equal(unifiedHtml, unifiedWithCompactFlag, 'Postmatch must render one unified card, not a separate compact version');
  assert.match(unifiedHtml, /class="pm-v2 detail/);
  assert.match(unifiedHtml, /class="pm-columns"/);
  assert.match(unifiedHtml, /class="pm-trophy-banner/);
  assert.match(unifiedHtml, /class="pm-opening-bar/);
  assert.match(unifiedHtml, /class="pm-stages-v2"/);
  assert.match(unifiedHtml, /Alta Edad/);
  assert.match(unifiedHtml, /class="pm-icon-tile is-gold"><img class="product-icon" src="assets\/icons\/history\.png"/);
  assert.match(unifiedHtml, /class="pm-opening-bar grade-S opening-art opening-art-scouts"/);
  assert.match(unifiedHtml, /pm-grade-stamp grade-S/);
  assert.match(unifiedHtml, /pm-icon-tile/);
  assert.match(unifiedHtml, /Tu evolución · vs tus últimas 4 partidas/);
  assert.match(unifiedHtml, /Llegada a Feudal/);
  assert.match(unifiedHtml, /Expansión económica/);
  assert.match(unifiedHtml, /Edificios militares/);
  assert.match(unifiedHtml, /Centros Urbanos/);
  assert.doesNotMatch(unifiedHtml, /Aldeanos pedidos|TC inactivo est\.|Uso de TC|Pico \d+ · faltaron/i);
  assert.match(unifiedHtml, /Récord personal/);
  assert.match(unifiedHtml, /Feudal/);
  assert.match(unifiedHtml, /class="pm-spark/);
  assert.match(unifiedHtml, /class="pm-curve"/);
  assert.match(unifiedHtml, /class="pm-duel-face"/);
  assert.match(unifiedHtml, /data-w="/);
  assert.match(unifiedHtml, /class="pm-queue-box"/);
  assert.match(unifiedHtml, /Caballero/);
  assert.match(unifiedHtml, /Ballestero/);
  assert.match(unifiedHtml, /class="pm-habits"/);
  assert.doesNotMatch(unifiedHtml, /Combate sin cobertura/i);
  assert.doesNotMatch(unifiedHtml, /Llegadas sin confirmar/i);
  assert.doesNotMatch(unifiedHtml, /\sstyle=/i, 'CSP: must not emit inline style="" attributes');

  // Compare modes: personal-only vs community-only
  const personalOnly = TacticalUI.renderPostMatch(report, { replay: true, comparison: true, compareMode: 'personal' });
  assert.match(personalOnly, /Solo tu historial/);
  assert.match(personalOnly, /class="pm-spark/);
  assert.doesNotMatch(personalOnly, /pm-grade-stamp grade-S/);

  const communityOnly = TacticalUI.renderPostMatch(report, { replay: true, comparison: true, compareMode: 'community' });
  assert.match(communityOnly, /Estándar por ELO/);
  assert.match(communityOnly, /pm-grade-stamp grade-S/);
  assert.doesNotMatch(communityOnly, /class="pm-spark/);

  // When personal comparison is disabled in config, omit sparklines & historical deltas cleanly
  const noCompareHtml = TacticalUI.renderPostMatch(report, { replay: true, comparison: false });
  assert.match(noCompareHtml, /Métricas de esta partida/);
  assert.doesNotMatch(noCompareHtml, /class="pm-spark/);

  // When replay access is locked, engine dashboard must not render
  const lockedHtml = TacticalUI.renderPostMatch(report, { replay: false, comparison: false });
  assert.doesNotMatch(lockedHtml, /class="pm-v2/);
}

// 4. Rich telemetry detectors (eco/blacksmith techs, age race, macro builds, clean defense) + 3-zone narrative + tabs
{
  const ops = [];
  // Self (slot 1): clean Dark Age -> Feudal at 550s -> Castle at 1050s -> Eco + Blacksmith + Bloodlines + Ballistics + Castles + Farms + BackToWork
  for (let i = 0; i < 16; i += 1) {
    ops.push(op(1, i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100], building_type: 109 }));
  }
  ops.push(op(1, 400_000, 'Research', { technology_type: 22, building_ids: [100] })); // Loom 25s
  ops.push(op(1, 425_000, 'Research', { technology_type: 101, building_ids: [100] })); // Feudal -> 555s
  ops.push(op(1, 570_000, 'Research', { technology_type: 202, building_ids: [110] })); // Double-Bit Axe (+15s after Feudal)
  ops.push(op(1, 590_000, 'Research', { technology_type: 14, building_ids: [111] })); // Horse Collar
  ops.push(op(1, 610_000, 'Research', { technology_type: 67, building_ids: [112] })); // Forging
  ops.push(op(1, 630_000, 'Research', { technology_type: 81, building_ids: [112] })); // Scale Barding Armor
  ops.push(op(1, 660_000, 'Research', { technology_type: 435, building_ids: [113] })); // Bloodlines
  ops.push(op(1, 890_000, 'Research', { technology_type: 102, building_ids: [100] })); // Castle -> 1050s
  ops.push(op(1, 1_065_000, 'Research', { technology_type: 203, building_ids: [110] })); // Bow Saw (+15s after Castle)
  ops.push(op(1, 1_080_000, 'Research', { technology_type: 68, building_ids: [112] })); // Iron Casting
  ops.push(op(1, 1_100_000, 'Research', { technology_type: 82, building_ids: [112] })); // Chain Barding Armor
  ops.push(op(1, 1_120_000, 'Research', { technology_type: 93, building_ids: [114] })); // Ballistics
  for (let i = 0; i < 12; i += 1) ops.push(op(1, 600_000 + i * 20_000, 'Build', { building_id: 50 })); // 12 Farms
  ops.push(op(1, 1_150_000, 'Build', { building_id: 82 })); // Castle 1
  ops.push(op(1, 1_300_000, 'Build', { building_id: 82 })); // Castle 2
  for (let i = 0; i < 4; i += 1) ops.push(op(1, 700_000 + i * 30_000, 'BackToWork', {}));
  for (let i = 0; i < 20; i += 1) {
    ops.push(op(1, 620_000 + i * 35_000, 'DeQueue', { unit_id: 38, amount: 2, building_ids: [201, 202], building_type: 101 }));
  }

  // Rival (slot 2): later Castle (1220s), 0 Blacksmith, fewer units
  for (let i = 0; i < 12; i += 1) {
    ops.push(op(2, i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [300], building_type: 109 }));
  }
  ops.push(op(2, 520_000, 'Research', { technology_type: 101, building_ids: [300] })); // Feudal -> 650s
  ops.push(op(2, 1_060_000, 'Research', { technology_type: 102, building_ids: [300] })); // Castle -> 1220s
  for (let i = 0; i < 10; i += 1) {
    ops.push(op(2, 750_000 + i * 40_000, 'DeQueue', { unit_id: 4, amount: 2, building_ids: [301], building_type: 87 }));
  }

  const res = analyzePostmatchEngine(ops, {
    selfSlot: 1, rivalSlot: 2, selfCiv: 'Franks', rivalCiv: 'Britons',
    opening: 'Scout Rush', openingShort: 'Scouts', playerElo: 1250, durationMs: 1_500_000,
  });

  assert.equal(res.self.techProfile.hasDoubleBitAxe, true);
  assert.equal(res.self.techProfile.hasBowSaw, true);
  // Franks reciben Arado pesado (13) gratis al llegar a Castillos -> 3 investigadas + 1 gratis = 4
  assert.equal(res.self.techProfile.ecoCount, 4);
  assert.equal(res.self.techProfile.blacksmithCount, 4);
  assert.equal(res.self.techProfile.combatKeyCount, 2);
  assert.equal(res.self.macroBuilds.farms, 12);
  assert.equal(res.self.macroBuilds.castles, 2);
  assert.equal(res.self.combatMicro.backToWork, 4);
  assert.ok(res.self.timings.castleSeconds < res.rival.timings.castleSeconds - 100);
  assert.ok(res.positives.length >= 4, `expected >= 4 distinct positives, got ${res.positives.length}`);
  assert.ok(res.positives.some((p) => p.id === 'medal-blacksmith-relevant'), 'must award unit-matched Caballería Blindada');
  assert.ok(res.positives.some((p) => p.id === 'medal-castle-first'), 'must award Carrera de Edades');
  assert.ok(res.positives.some((p) => p.id === 'medal-eco-techs'), 'must award Maestro Leñador');
  assert.ok(res.positives.some((p) => p.id === 'medal-clean-defense'), 'must award Defensa Limpia');
  assert.equal(res.self.techProfile.armyRelevance.primaryClass, 'cavalry');
  assert.equal(res.self.techProfile.armyRelevance.wellEquipped, true);
  assert.equal(res.self.techProfile.armyRelevance.criticalMissing, null);

  const norm = normalizeTelemetry({
    schemaVersion: 1, matchId: '2001', profileId: '25399083', clock: 'game', durationSeconds: 1500,
    source: { id: 'aoe2rec-local', type: 'replay-analysis', version: '2.6.1' },
    context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', gameSpeed: 'normal', startingAge: 'dark' },
    metrics: { apm: { value: res.self.apm, definition: 'raw-command-apm-v1' }, eapm: { value: res.self.eapm, definition: 'debounced-command-eapm-v1' } },
    phases: {}, engineSummary: res,
  }, { matchId: '2001', profileId: '25399083' });
  assert.equal(norm.status, 'ready');

  const rep = buildPostMatchReport({
    match: {
      matchId: '2001', startedAt: '2026-11-21T10:00:00Z', finishedAt: '2026-11-21T10:25:00Z',
      leaderboardId: 3, mapName: 'Arabia',
      players: [
        { profileId: '25399083', name: 'PSX | Acido', civ: 'Franks', team: 1, won: true, ratingDiff: 15 },
        { profileId: '88888888', name: 'Rival', civ: 'Britons', team: 2, won: false, ratingDiff: -15 },
      ],
    },
    profileId: '25399083', telemetry: norm.data, records: [],
  });
  assert.ok(rep.engine.narrative && rep.engine.narrative.medals.length === 3);
  assert.equal(new Set(rep.engine.narrative.medals.map((m) => m.domain)).size, 3, 'top 3 medals must be from 3 distinct domains');

  const html = TacticalUI.renderPostMatch(rep, { replay: true, comparison: true });
  assert.match(html, /class="pm-verdict-bar"/);
  assert.match(html, /class="pm-narrative-grid"/);
  assert.match(html, /class="pm-zone is-good"/);
  assert.match(html, /class="pm-zone is-bad"/);
  assert.match(html, /class="pm-medal-card /);
  assert.match(html, /class="pm-deep-dive"/);
  assert.match(html, /data-pm-tab="evo"/);
  assert.match(html, /data-pm-tab="duel"/);
  assert.match(html, /data-pm-tab="tech"/);
  assert.match(html, /class="pm-tech-box"/);
  assert.match(html, /class="pm-race-box"/);
  assert.match(html, /Hacha de doble filo/);
  assert.match(html, /Sierra de arco/);
  assert.match(html, /Forja/);
  assert.doesNotMatch(html, /\sstyle=/i, 'CSP: zero inline style attributes');
}

// 5. Tactical AoE2 sense checks:
//    - Pure Cavalry (3 relevant BS techs) vs rival who switched 3 lines (10 BS techs) -> ZERO Blacksmith penalty!
//    - Monks + Siege (0 BS techs) -> ZERO Blacksmith penalty!
//    - Crossbows with 0 Fletching -> flags missing Emplumado!
//    - Team Game -> never compares Castle timing against 1 arbitrary opponent!
{
  // 5a: Pure Cavalry vs 10-tech rival
  const cavOps = [];
  for (let i = 0; i < 16; i += 1) cavOps.push(op(1, i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100], building_type: 109 }));
  cavOps.push(op(1, 450_000, 'Research', { technology_type: 101, building_ids: [100] })); // Feudal
  cavOps.push(op(1, 900_000, 'Research', { technology_type: 102, building_ids: [100] })); // Castle
  cavOps.push(op(1, 1_080_000, 'Research', { technology_type: 81, building_ids: [112] })); // Scale Barding
  cavOps.push(op(1, 1_120_000, 'Research', { technology_type: 82, building_ids: [112] })); // Chain Barding
  cavOps.push(op(1, 1_160_000, 'Research', { technology_type: 67, building_ids: [112] })); // Forging
  for (let i = 0; i < 15; i += 1) cavOps.push(op(1, 1_080_000 + i * 20_000, 'DeQueue', { unit_id: 38, amount: 2, building_ids: [201, 202], building_type: 101 }));
  // Rival researched 10 random blacksmith techs across all 3 lines
  for (const tid of [67, 68, 74, 76, 81, 82, 199, 200, 211, 212]) {
    cavOps.push(op(2, 600_000 + tid * 1000, 'Research', { technology_type: tid, building_ids: [312] }));
  }
  const cavRes = analyzePostmatchEngine(cavOps, { selfSlot: 1, rivalSlot: 2, selfCiv: 'Franks', durationMs: 1_600_000 });
  assert.equal(cavRes.negatives.some((n) => n.domain === 'blacksmith_techs'), false, 'pure cav with 3/4 relevant techs must NEVER be penalized vs 10-tech rival');
  assert.ok(cavRes.positives.some((p) => p.id === 'medal-blacksmith-relevant' && p.badgeName === 'Caballería Blindada'));

  // 5b: Monks + Siege (0 Blacksmith techs) -> ZERO Blacksmith penalty
  const siegeOps = [];
  for (let i = 0; i < 16; i += 1) siegeOps.push(op(1, i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100], building_type: 109 }));
  siegeOps.push(op(1, 450_000, 'Research', { technology_type: 101, building_ids: [100] }));
  siegeOps.push(op(1, 880_000, 'Research', { technology_type: 102, building_ids: [100] }));
  for (let i = 0; i < 15; i += 1) siegeOps.push(op(1, 1_060_000 + i * 25_000, 'DeQueue', { unit_id: 125, amount: 2, building_ids: [210], building_type: 104 })); // Monks
  for (let i = 0; i < 8; i += 1) siegeOps.push(op(1, 1_100_000 + i * 35_000, 'DeQueue', { unit_id: 280, amount: 1, building_ids: [211], building_type: 49 })); // Mangonels
  const siegeRes = analyzePostmatchEngine(siegeOps, { selfSlot: 1, selfCiv: 'Aztecs', durationMs: 1_500_000 });
  assert.equal(siegeRes.self.techProfile.armyRelevance.primaryClass, null);
  assert.equal(siegeRes.negatives.some((n) => n.domain === 'blacksmith_techs'), false, 'Monks + Siege must NEVER be criticized for 0 Blacksmith');

  // 5c: Archers with 0 Fletching -> flags missing Emplumado
  const archOps = [];
  for (let i = 0; i < 16; i += 1) archOps.push(op(1, i * 25_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100], building_type: 109 }));
  archOps.push(op(1, 450_000, 'Research', { technology_type: 101, building_ids: [100] }));
  for (let i = 0; i < 10; i += 1) archOps.push(op(1, 620_000 + i * 25_000, 'DeQueue', { unit_id: 4, amount: 2, building_ids: [203], building_type: 87 })); // 20 Archers
  const archRes = analyzePostmatchEngine(archOps, { selfSlot: 1, selfCiv: 'Britons', durationMs: 1_200_000 });
  assert.equal(archRes.self.techProfile.armyRelevance.primaryClass, 'ranged');
  assert.ok(archRes.negatives.some((n) => n.id === 'neg-bs-ranged-fletching'), '20 Archers without Fletching MUST flag missing Emplumado');

  // 5d: Team Game ignores arbitrary 1v1 rival Castle timing difference
  const tgOps = [
    ...cavOps,
    op(2, 350_000, 'Research', { technology_type: 101, building_ids: [300] }),
    op(2, 650_000, 'Research', { technology_type: 102, building_ids: [300] }), // Rival Pocket fast castle
  ];
  const tgRes = analyzePostmatchEngine(tgOps, { selfSlot: 1, rivalSlot: 2, selfCiv: 'Franks', durationMs: 1_600_000, isTeamGame: true });
  assert.equal(tgRes.negatives.some((n) => n.id === 'neg-late-castle'), false, 'TG must NEVER flag late Castle vs an arbitrary opponent');
}

// 6. Momentum, Streaks, Progressive Improvement Ladders, Giant Slayer, Revenge, Blitz & 3-flavor variety
{
  const mkPrior = (id, minsAgo, { won, rating, ratingDiff, tcIdle, tcUtil, eapm, rivalId = '777' }) => {
    const startedAt = Date.now() - minsAgo * 60_000;
    const norm = normalizeTelemetry({
      schemaVersion: 1, matchId: id, profileId: '25399083', clock: 'game', durationSeconds: 1100,
      source: { id: 'aoe2rec-local', type: 'replay-analysis', version: '2.6.1' },
      context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', gameSpeed: 'normal', startingAge: 'dark' },
      metrics: { apm: { value: eapm + 10, definition: 'raw-command-apm-v1' }, eapm: { value: eapm, definition: 'debounced-command-eapm-v1' } },
      phases: {},
      engineSummary: {
        version: 'postmatch-engine-v1', durationSeconds: 1100,
        self: {
          villagersOrdered: 52, townCenters: 2, tcIdleSeconds: tcIdle, tcIdleEarlySeconds: tcIdle,
          tcUtilization: tcUtil, tcUtilizationEarly: tcUtil, militaryOrdered: 36, workshopsCount: 4,
          eapm, apm: eapm + 10, habits: { move: 120, attackMove: 14, patrol: 4, market: 1, townBell: 0 },
        },
        positives: [{ id: 'medal-dark-clean', domain: 'macro_tc', tier: 'gold', score: 88, title: 'Alta limpia', detail: 'ok' }],
      },
    }, { matchId: id, profileId: '25399083' });
    return {
      matchId: id, profileId: '25399083', startedAt, finishedAt: startedAt + 1_100_000,
      leaderboardId: 3, mapName: 'Arabia', civ: 'Franks', won, rating, ratingDiff,
      match: {
        matchId: id, leaderboardId: 3, mapName: 'Arabia',
        players: [
          { profileId: 25399083, name: 'PSX | Acido', civ: 'Franks', team: 1, won, rating, matchRatingDiff: ratingDiff },
          { profileId: Number(rivalId), name: 'RivalX', civ: 'Britons', team: 2, won: !won, rating: rating + 20 },
        ],
      },
      telemetry: norm.data,
    };
  };

  // 3 consecutive wins + progressive TC idle reduction (64s -> 38s -> 16s) + Giant Slayer (+60 ELO rival) + Blitz (<20m)
  const records = [
    mkPrior('3001', 120, { won: true, rating: 1200, ratingDiff: 15, tcIdle: 64, tcUtil: 88.0, eapm: 38 }),
    mkPrior('3002', 60, { won: true, rating: 1215, ratingDiff: 16, tcIdle: 38, tcUtil: 92.0, eapm: 43 }),
  ];
  const curNorm = normalizeTelemetry({
    schemaVersion: 1, matchId: '3003', profileId: '25399083', clock: 'game', durationSeconds: 980,
    source: { id: 'aoe2rec-local', type: 'replay-analysis', version: '2.6.1' },
    context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', gameSpeed: 'normal', startingAge: 'dark' },
    metrics: { apm: { value: 58, definition: 'raw-command-apm-v1' }, eapm: { value: 49, definition: 'debounced-command-eapm-v1' } },
    phases: {},
    engineSummary: {
      version: 'postmatch-engine-v1', durationSeconds: 980,
      self: {
        villagersOrdered: 48, townCenters: 2, tcIdleSeconds: 16, tcIdleEarlySeconds: 16,
        tcUtilization: 96.5, tcUtilizationEarly: 96.5, militaryOrdered: 42, workshopsCount: 4,
        eapm: 49, apm: 58, habits: { move: 120, attackMove: 16, patrol: 4, market: 0, townBell: 0 },
      },
      positives: [
        { id: 'medal-dark-clean', domain: 'macro_tc', tier: 'gold', score: 88, badgeName: 'Reloj Suizo', title: 'Alta limpia', detail: 'ok' },
        { id: 'medal-combined-arms', domain: 'combined_arms', tier: 'green', score: 78, badgeName: 'Ejército Combinado', title: 'Combinaste Caballería y Distancia', detail: 'ok' },
      ],
    },
  }, { matchId: '3003', profileId: '25399083' });

  const rep = buildPostMatchReport({
    match: {
      matchId: '3003', startedAt: Date.now() - 10 * 60_000, finishedAt: Date.now(),
      leaderboardId: 3, mapName: 'Arabia',
      players: [
        { profileId: '25399083', name: 'PSX | Acido', civ: 'Franks', team: 1, won: true, rating: 1231, matchRatingDiff: 21 },
        { profileId: '99999', name: 'GrandMaster', civ: 'Mayans', team: 2, won: false, rating: 1295, matchRatingDiff: -21 },
      ],
    },
    profileId: '25399083', telemetry: curNorm.data, records, historyRows: records,
  });

  assert.ok(rep.engine.evolution.consecutiveImprovement, 'must detect 3-match progressive improvement');
  assert.match(rep.engine.evolution.consecutiveImprovement.chainLabel, /38 → 43 → 49/);
  assert.ok(rep.engine.evolution.sessionWarmup, 'must detect same-session warm-up improvement');
  assert.equal(rep.engine.narrative.streak.count, 3);
  assert.match(rep.engine.narrative.streak.label, /3 victorias seguidas/);
  assert.equal(rep.engine.narrative.medals.length, 3);
  const flavors = new Set(rep.engine.narrative.medals.map((m) => m.flavor));
  assert.equal(flavors.size, 3, `expected 3 distinct flavors (story + evolution + execution), got ${[...flavors].join(',')}`);

  // Sparse local records WITHOUT authoritative API historyRows must NEVER fabricate fake win/loss streaks
  const sparseRep = buildPostMatchReport({
    match: {
      matchId: '3003', startedAt: Date.now() - 10 * 60_000, finishedAt: Date.now(),
      leaderboardId: 3, mapName: 'Arabia',
      players: [
        { profileId: '25399083', name: 'PSX | Acido', civ: 'Franks', team: 1, won: true, matchRating: 1231, matchRatingDiff: 21 },
        { profileId: '99999', name: 'GrandMaster', civ: 'Mayans', team: 2, won: false, matchRating: 1295, matchRatingDiff: -21 },
      ],
    },
    profileId: '25399083', telemetry: curNorm.data, records, historyRows: [], historyPending: false,
  });
  assert.ok(!sparseRep.engine.narrative.medals.some((m) => m.id === 'story-win-streak' || m.id === 'story-comeback-break'),
    'must not fabricate win/loss streaks without authoritative historyRows');
}

// 10. 100% Civilization-Aware Postmatch Engine & 56-Civ Mastery Suite
{
  const {
    classifyCombatClass,
    tcResearchDuration,
    normalizeCivSlug,
    civHasTech,
  } = require('../src/engine/postmatch-engine');
  const { CIV_MASTERY_PROFILES } = require('../src/engine/civ-mastery');
  const CIV_TECH = require('../src/civ-tech.json');

  // 10.1 Coverage: EVERY single standard civilization in civ-tech.json has a mastery profile
  const allStdCivs = Object.keys(CIV_TECH.civilizations || {});
  assert.ok(allStdCivs.length >= 56, `Expected >=56 standard civs in civ-tech.json, got ${allStdCivs.length}`);
  for (const slug of allStdCivs) {
    assert.ok(Array.isArray(CIV_MASTERY_PROFILES[slug]) && CIV_MASTERY_PROFILES[slug].length >= 1,
      `Missing mastery profile for standard civ: ${slug}`);
  }
  assert.equal(normalizeCivSlug('Sarracenos'), 'saracens');
  assert.equal(normalizeCivSlug('Borgoñeses'), 'burgundians');
  assert.equal(normalizeCivSlug('Godos'), 'goths');
  assert.equal(normalizeCivSlug('Malayos'), 'malay');
  assert.equal(normalizeCivSlug('Kitán'), 'khitans');

  // 10.2 Combat class audit fixes (14 previously misclassified units)
  assert.equal(classifyCombatClass(1709, 49, { key: 'obus' }), 'none', 'Houfnice 1709 is siege (none)');
  assert.equal(classifyCombatClass(1911, 87, { key: 'granadero' }), 'gunpowder', 'Jurchen Grenadier 1911 is gunpowder');
  assert.equal(classifyCombatClass(2562, 82, { key: 'guerrero-guecha' }), 'ranged');
  assert.equal(classifyCombatClass(2569, 82, { key: 'jinete-con-boleadoras' }), 'ranged');
  assert.equal(classifyCombatClass(1010, 87, { key: 'escaramuzador-zenete' }), 'ranged');
  assert.equal(classifyCombatClass(1952, 87, { key: 'saqueador-xianbei' }), 'ranged');
  assert.equal(classifyCombatClass(755, 82, { key: 'tarcano' }), 'cavalry');
  assert.equal(classifyCombatClass(869, 82, { key: 'huszar-magiar' }), 'cavalry');
  assert.equal(classifyCombatClass(1655, 82, { key: 'costiller' }), 'cavalry');
  assert.equal(classifyCombatClass(2566, 82, { key: 'kona' }), 'cavalry');
  assert.equal(classifyCombatClass(751, 0, { key: 'explorador-aguila' }), 'infantry');
  assert.equal(classifyCombatClass(2550, 0, { key: 'explorador-champi' }), 'infantry');
  assert.equal(classifyCombatClass(7, 2556, { key: 'guerrillero' }), 'ranged', 'Settlement Skirm is ranged');
  assert.equal(classifyCombatClass(1786, 2556, { key: 'lancero' }), 'infantry', 'Settlement Spear is infantry');

  // 10.3 TC research speed bonuses (Portuguese TB, Vietnamese 2x WB/HC, Goths Loom, Malay ages)
  assert.equal(tcResearchDuration(22, 'Godos', 'dark'), 1, 'Goths Spanish name gets instant Loom');
  assert.equal(tcResearchDuration(101, 'Malayos', 'dark'), Math.round(130 / 1.66), 'Malay Spanish name ages up +66% faster');
  assert.equal(tcResearchDuration(213, 'Vietnamese', 'feudal'), 38, 'Vietnamese Wheelbarrow 2x faster (38s)');
  assert.equal(tcResearchDuration(249, 'Vietnamese', 'castle'), 28, 'Vietnamese Hand Cart 2x faster (28s)');
  assert.equal(tcResearchDuration(22, 'Franks', 'dark', new Set(['franks', 'portuguese'])), 20, 'Portuguese ally TB speeds up Loom (20s)');
  assert.equal(tcResearchDuration(213, 'Franks', 'feudal', new Set(['franks', 'portuguese'])), 60, 'Portuguese ally TB speeds up Wheelbarrow (60s)');
  assert.equal(tcResearchDuration(101, 'Franks', 'dark', new Set(['franks', 'portuguese'])), 130, 'Portuguese ally TB must NOT speed up Age-Up');

  const mkBuildOp = (pid, ms, buildingId) => ({
    Action: { world_time: ms, action_data: { Build: { player_id: pid, building_id: buildingId } } },
  });
  const mkMarketOp = (pid, ms, type = 'Sell', resType = 1) => ({
    Action: { world_time: ms, action_data: { [type]: { player_id: pid, resource_type: resType, data: [resType, 0, 1] } } },
  });
  const mkBaseEcoOps = (pid, maxMin = 24) => {
    const out = [];
    for (let t = 5_000; t <= maxMin * 60_000; t += 25_000) out.push(op(pid, t, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100] }));
    out.push(op(pid, 610_000, 'Research', { technology_type: 202, building_id: 200 }));
    return out;
  };

  // 10.4 SARACENS (Spanish 'Sarracenos'): heavy early Market MUST NEVER trigger neg-market-heavy AND MUST award civ-saracens-market!
  {
    const ops = [...mkBaseEcoOps(1, 24)];
    for (let i = 0; i < 14; i += 1) ops.push(mkMarketOp(1, 650_000 + i * 20_000, i % 2 === 0 ? 'Sell' : 'Buy', i % 2 === 0 ? 1 : 0));
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, selfCiv: 'Sarracenos', durationMs: 24 * 60_000,
      selfAges: { feudal: 600_000, castle: 1020_000 },
    });
    assert.ok(!res.negatives.some((n) => n.id === 'neg-market-heavy'), 'Saracens MUST NEVER be penalized for Market usage');
    assert.match(res.self.marketProfile.note, /Mercado sarraceno|5%/i, 'Saracens market note must not accuse player');
    assert.ok(res.civMastery && res.civMastery.leveraged.some((l) => l.id === 'civ-saracens-market'), 'Saracens Market leverage must be recognized');
  }

  // 10.5 TECH-TREE GUARD: Mapuche Kona (no Barding in tech tree!) must NEVER get neg-bs-cav-armor; Burmese Arambai wellEquipped with Padded (211)
  {
    assert.equal(civHasTech('mapuche', 81), false, 'Mapuche lacks Scale Barding');
    const ops = [...mkBaseEcoOps(1, 24)];
    ops.push(op(1, 1080_000, 'DeQueue', { unit_id: 2566, amount: 24, building_type: 82, building_ids: [500] }));
    ops.push(op(1, 700_000, 'Research', { technology_type: 67, building_id: 300 }));
    ops.push(op(1, 1060_000, 'Research', { technology_type: 68, building_id: 300 }));
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, selfCiv: 'Mapuche', durationMs: 24 * 60_000,
      selfAges: { feudal: 600_000, castle: 1020_000 },
    });
    assert.ok(!res.negatives.some((n) => n.id === 'neg-bs-cav-armor'), 'Mapuche Kona must NOT be penalized for missing Barding armor');
    assert.equal(res.self.techProfile.armyRelevance.relevantExpected, 2, 'Mapuche Castle cav expects only Forging + Iron Casting (2)');
    assert.equal(res.self.techProfile.armyRelevance.wellEquipped, true);
  }
  {
    const ops = [];
    for (let t = 5_000; t <= 24 * 60_000; t += 25_000) ops.push(op(1, t, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100] }));
    ops.push(op(1, 1080_000, 'DeQueue', { unit_id: 1126, amount: 22, building_type: 82, building_ids: [500] }));
    ops.push(op(1, 1050_000, 'Research', { technology_type: 211, building_id: 300 })); // Only archer armor Burmese have!
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, selfCiv: 'Burmese', durationMs: 24 * 60_000,
      selfAges: { feudal: 600_000, castle: 1020_000 },
    });
    assert.equal(res.self.techProfile.armyRelevance.relevantExpected, 1, 'Burmese gunpowder expects only Padded Archer Armor (1)');
    assert.equal(res.self.techProfile.armyRelevance.wellEquipped, true, 'Burmese Arambai with Padded Archer Armor must be wellEquipped');
    // Also verify Burmese passive free DBA/BowSaw does NOT award manual-click medal-eco-techs
    assert.ok(!res.positives.some((p) => p.id === 'medal-eco-techs'), 'Burmese must not auto-win medal-eco-techs for free lumber techs');
  }

  // 10.6 CHINESE DARK AGE GRACE: 35s unavoidable food-starvation pause at 0:00 must NOT emit neg-tc-gap
  {
    const ops = [];
    for (let t = 35_000; t <= 16 * 60_000; t += 25_000) ops.push(op(1, t, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100] }));
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, selfCiv: 'Chinese', durationMs: 16 * 60_000,
      selfAges: { feudal: 600_000 },
    });
    assert.ok(!res.negatives.some((n) => n.id === 'neg-tc-gap'), 'Chinese structural 35s Dark opening must NOT trigger neg-tc-gap');
  }

  // 10.7 BURGUNDIANS EARLY ECO TECHS + KHITANS PASTURES + CUMANS 2TC FEUDAL + RIVAL MALAY BUFFER
  {
    const ops = [];
    for (let t = 5_000; t <= 24 * 60_000; t += 25_000) ops.push(op(1, t, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100] }));
    ops.push(op(1, 300_000, 'Research', { technology_type: 202, building_id: 200 })); // DBA in Dark Age!
    ops.push(op(1, 720_000, 'Research', { technology_type: 203, building_id: 200 })); // Bow Saw in Feudal!
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, selfCiv: 'Borgoñeses', durationMs: 24 * 60_000,
      selfAges: { feudal: 600_000, castle: 1020_000 },
    });
    assert.ok(res.self.techProfile.doubleBitAxeOffsetSec < 0, 'Burgundians Dark DBA must record negative offset');
    assert.ok(res.civMastery && res.civMastery.leveraged.some((l) => l.id === 'civ-burgundians-early-eco'), 'Burgundians early eco must be leveraged');
  }
  {
    const ops = [...mkBaseEcoOps(1, 24)];
    for (let i = 0; i < 12; i += 1) ops.push(mkBuildOp(1, 700_000 + i * 20_000, 1889)); // 12 Pastures
    ops.push(op(1, 680_000, 'Research', { technology_type: 1014, building_id: 201 })); // Domestication
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, selfCiv: 'Khitans', durationMs: 24 * 60_000,
      selfAges: { feudal: 600_000, castle: 1020_000 },
    });
    assert.equal(res.self.effectiveFarms, 24, 'Khitans 12 Pastures must count as 24 effective farms');
    assert.ok(res.civMastery && res.civMastery.leveraged.some((l) => l.id === 'civ-khitans-pastures'), 'Khitans Pastures mastery must be leveraged');
  }
  {
    const ops = [...mkBaseEcoOps(1, 24)];
    ops.push(mkBuildOp(1, 660_000, 621)); // 2nd TC in Feudal!
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, rivalSlot: 2, selfCiv: 'Cumans', rivalCiv: 'Franks', durationMs: 24 * 60_000,
      selfAges: { feudal: 600_000, castle: 1200_000 },
      rivalAges: { feudal: 600_000, castle: 1020_000 },
    });
    assert.ok(!res.negatives.some((n) => n.id === 'neg-late-castle'), 'Cumans 2TC Feudal boom must NOT trigger neg-late-castle');
    assert.ok(res.civMastery && res.civMastery.leveraged.some((l) => l.id === 'civ-cumans-2tc'));
  }
  {
    // Rival Malay reaches Castle 80s faster (normal +66% bonus) -> must NOT falsely fire neg-late-castle
    const ops = [...mkBaseEcoOps(1, 22)];
    const res = analyzePostmatchEngine(ops, {
      selfSlot: 1, rivalSlot: 2, selfCiv: 'Franks', rivalCiv: 'Malayos', durationMs: 22 * 60_000,
      selfAges: { feudal: 600_000, castle: 1060_000 },
      rivalAges: { feudal: 560_000, castle: 980_000 },
    });
    assert.ok(!res.negatives.some((n) => n.id === 'neg-late-castle'), 'Rival Malay +66% age-up speed must raise castle lag threshold');
  }

  // 10.8 FAIRNESS GATES & POSTMATCH UI RENDERING (0 inline styles)
  {
    const shortOps = [op(1, 10_000, 'DeQueue', { unit_id: 83, amount: 1, building_ids: [100] })];
    const shortRes = analyzePostmatchEngine(shortOps, { selfSlot: 1, selfCiv: 'Saracens', durationMs: 6 * 60_000 });
    assert.equal(shortRes.civMastery, null, 'Short match (<10 min) must abstain from civMastery');

    // Normalize & render civMastery in Postmatch UI cleanly with 0 inline styles
    const ops = [...mkBaseEcoOps(1, 24)];
    for (let i = 0; i < 6; i += 1) ops.push(mkMarketOp(1, 650_000 + i * 20_000, 'Sell', 1));
    const eng = analyzePostmatchEngine(ops, {
      selfSlot: 1, selfCiv: 'Saracens', durationMs: 24 * 60_000,
      selfAges: { feudal: 600_000, castle: 1020_000 },
    });
    const norm = normalizeTelemetry({
      schemaVersion: 1, matchId: '8888', profileId: '25399083', clock: 'game', durationSeconds: 1440,
      source: { id: 'aoe2rec-local', type: 'replay-analysis', version: '2.9.0' },
      context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Saracens', gameSpeed: 'normal', startingAge: 'dark' },
      metrics: { apm: { value: 50, definition: 'raw-command-apm-v1' }, eapm: { value: 44, definition: 'debounced-command-eapm-v1' } },
      phases: {},
      engineSummary: eng,
    }, { matchId: '8888', profileId: '25399083' });
    assert.ok(norm.data.engineSummary.civMastery, 'normalizeTelemetry must preserve civMastery');
    const rep = buildPostMatchReport({
      match: {
        matchId: '8888', startedAt: Date.now() - 25 * 60_000, finishedAt: Date.now(),
        leaderboardId: 3, mapName: 'Arabia',
        players: [
          { profileId: '25399083', name: 'PSX | Acido', civ: 'Saracens', team: 1, won: true, ratingDiff: 15 },
          { profileId: '99999', name: 'Rival', civ: 'Franks', team: 2, won: false, ratingDiff: -15 },
        ],
      },
      profileId: '25399083', telemetry: norm.data, records: [],
    });
    const html = TacticalUI.renderPostMatch(rep, { replay: true, comparison: true });
    assert.match(html, /class="pm-civ-mastery"/, 'Postmatch UI must render Civ Mastery section');
    assert.match(html, /Bonos de civilización/, 'Postmatch UI must label Civ Bonuses section');
    assert.match(html, /Mercado sarraceno/, 'Postmatch UI must display Saracens Market leverage');
    assert.doesNotMatch(html, /\sstyle=/i, 'CSP: Postmatch HTML with Civ Mastery must have 0 inline styles');
  }
}

console.log('postmatch-engine-test: ok');
