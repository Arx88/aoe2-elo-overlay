'use strict';

const assert = require('node:assert/strict');
const {
  analyzeCivPerformance,
  buildUnifiedModeMatches,
  fisherExactTwoSided,
  betaCredibleInterval90,
} = require('../src/civ-diagnostic');
const { createApiCache } = require('../src/aoe');
const { computeMapEapmStats, computeCentralAnalytics } = require('../src/central');
const { QueueWatcher, FastLane } = require('../src/live');
const { trackIntro, introView, hideAtMs } = require('../src/intro');
const TacticalUI = require('../ui/tactical-ui');

let passed = 0;
const pendingTests = [];
function test(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      pendingTests.push(
        out.then(
          () => {
            passed += 1;
            console.log(`  OK   ${name}`);
          },
          (err) => {
            console.error(`  FAIL ${name}`);
            console.error(`       ${err && err.message ? err.message : err}`);
            process.exitCode = 1;
          },
        ),
      );
      return;
    }
    passed += 1;
    console.log(`  OK   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
}

// Deterministic PRNG (Mulberry32) so Monte Carlo calibration is reproducible
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeMatch(id, overrides = {}) {
  return {
    matchId: String(id),
    source: 'insights',
    startedAt: 1700000000000 + Number(id) * 3600 * 1000,
    won: true,
    civ: 'Franks',
    civSlug: 'franks',
    oppCiv: 'Britons',
    oppCivSlug: 'britons',
    mapName: 'Arabia',
    mapKey: 'arabia',
    openness: 'open',
    myOpening: 'Scout rush',
    oppOpening: 'Archer rush',
    myElo: 1200,
    oppElo: 1200,
    myEapm: 50,
    oppEapm: 50,
    durationGameSec: 32 * 60,
    replay: null,
    ...overrides,
  };
}

console.log('=== Civ Diagnostic Statistical & Adversarial Suite ===');

// 1. Monte Carlo Pure Coin-Flip Calibration (False-Positive Rate <= 15%)
test('1. Monte Carlo coin-flip calibration (500 runs x N=6,12,25,40): FPR <= 15%', () => {
  const maps = ['Arabia', 'Arena', 'Runestones', 'Hideout', 'Nomad', 'Four Lakes', 'Gold Rush', 'Lombardia'];
  const openMap = { Arabia: 'open', Arena: 'closed', Runestones: 'open', Hideout: 'closed', Nomad: 'hybrid', 'Four Lakes': 'hybrid', 'Gold Rush': 'open', Lombardia: 'open' };
  const openings = ['Scout rush', 'Archer rush', 'Fast castle', 'Man at arms rush', 'Drush'];
  const oppCivs = ['Britons', 'Mongols', 'Mayans', 'Ethiopians', 'Huns', 'Persians', 'Japanese', 'Saracens', 'Spanish', 'Turks'];
  const rng = mulberry32(20261122);

  for (const nC of [6, 12, 25, 40]) {
    let flaggedCivs = 0;
    let totalFindings = 0;
    const runs = 300;
    for (let r = 0; r < runs; r += 1) {
      const matches = [];
      let mid = 1;
      for (let i = 0; i < nC + 120; i += 1) {
        const isTarget = i < nC;
        const mName = maps[Math.floor(rng() * maps.length)];
        const op = openings[Math.floor(rng() * openings.length)];
        const oppOp = openings[Math.floor(rng() * openings.length)];
        const oppC = oppCivs[Math.floor(rng() * oppCivs.length)];
        const dur = (12 + rng() * 50) * 60;
        const myElo = 1200 + Math.round((rng() - 0.5) * 60);
        const oppElo = 1200 + Math.round((rng() - 0.5) * 60);
        const won = rng() < 0.5;
        matches.push(makeMatch(mid++, {
          civ: isTarget ? 'Mongols' : oppCivs[i % oppCivs.length],
          civSlug: isTarget ? 'mongols' : oppCivs[i % oppCivs.length].toLowerCase(),
          mapName: mName,
          mapKey: mName.toLowerCase(),
          openness: openMap[mName],
          myOpening: op,
          oppOpening: oppOp,
          oppCiv: oppC,
          oppCivSlug: oppC.toLowerCase(),
          durationGameSec: dur,
          myElo,
          oppElo,
          myEapm: 48 + Math.round((rng() - 0.5) * 14),
          won,
        }));
      }
      const res = analyzeCivPerformance({ targetCiv: 'Mongols', modeId: 'rm_1v1', matches });
      if (res.findings.length > 0) flaggedCivs += 1;
      totalFindings += res.findings.length;
    }
    const fpr = flaggedCivs / runs;
    const avgFindings = totalFindings / runs;
    assert.ok(fpr <= 0.16, `FPR too high for N=${nC}: ${(fpr * 100).toFixed(1)}% (avg=${avgFindings.toFixed(2)})`);
    assert.ok(avgFindings <= 0.28, `Avg findings too high for N=${nC}: ${avgFindings.toFixed(2)}`);
  }
});

// 2. Small-Sample Volatility Guard (N = 3, 4, 5)
test('2. Small-sample guard: 0-3 and 0-4 => insufficient, 0 findings, 90% CrI includes 50%', () => {
  const baseline = Array.from({ length: 40 }, (_, i) => makeMatch(100 + i, { civ: 'Britons', civSlug: 'britons', won: i % 2 === 0 }));
  for (const n of [3, 4]) {
    const target = Array.from({ length: n }, (_, i) => makeMatch(i + 1, { civ: 'Goths', civSlug: 'goths', won: false }));
    const res = analyzeCivPerformance({ targetCiv: 'Goths', matches: [...target, ...baseline] });
    assert.equal(res.status, 'insufficient');
    assert.equal(res.verdict, 'sample');
    assert.equal(res.findings.length, 0);
    assert.ok(res.sample.ci90[1] >= 50, `90% CrI upper bound for 0-${n} should include 50%, got [${res.sample.ci90}]`);
  }
  const oneFour = [
    makeMatch(1, { civ: 'Goths', civSlug: 'goths', won: true }),
    makeMatch(2, { civ: 'Goths', civSlug: 'goths', won: false }),
    makeMatch(3, { civ: 'Goths', civSlug: 'goths', won: false }),
    makeMatch(4, { civ: 'Goths', civSlug: 'goths', won: false }),
    makeMatch(5, { civ: 'Goths', civSlug: 'goths', won: false }),
  ];
  const res5 = analyzeCivPerformance({ targetCiv: 'Goths', matches: [...oneFour, ...baseline] });
  assert.ok(res5.sample.shrunkWinRate >= 40, `1-4 shrunk WR should be >= 40%, got ${res5.sample.shrunkWinRate}%`);
  assert.equal(res5.findings.length, 0);
});

// 3. Simpson's Paradox (Map-Mix Confounding)
test('3. Simpson paradox: water map mix detected as map exposure, NOT civ weakness on water', () => {
  const matches = [];
  let id = 1;
  // Civ C (Vikings): 20 games on Water (30% WR = 6W-14L), 5 games on Open (60% WR = 3W-2L) -> raw 36%
  for (let i = 0; i < 20; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Vikings', civSlug: 'vikings', mapName: 'Islands', mapKey: 'islands', openness: 'water', won: i < 6 }));
  }
  for (let i = 0; i < 5; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Vikings', civSlug: 'vikings', mapName: 'Arabia', mapKey: 'arabia', openness: 'open', won: i < 3 }));
  }
  // Other civs: 20 games on Water (30% WR = 6W-14L), 80 games on Open (60% WR = 48W-32L) -> raw 54%
  for (let i = 0; i < 20; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Franks', civSlug: 'franks', mapName: 'Islands', mapKey: 'islands', openness: 'water', won: i < 6 }));
  }
  for (let i = 0; i < 80; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Franks', civSlug: 'franks', mapName: 'Arabia', mapKey: 'arabia', openness: 'open', won: i < 48 }));
  }

  const res = analyzeCivPerformance({ targetCiv: 'Vikings', matches });
  assert.ok(res.findings.length >= 1, 'Should detect map-mix exposure');
  assert.equal(res.findings[0].kind, 'mix', `Top finding should be mix exposure, got ${res.findings[0].kind}: ${res.findings[0].title}`);
  assert.ok(/penaliza/i.test(res.findings[0].title), `Title should explain map penalty, got "${res.findings[0].title}"`);
});

// 4. Long-Term ELO Climb (Temporal Confounding)
test('4. Long-term ELO climb (1000->1300 at 50% WR) does NOT trigger false peak-ELO warning', () => {
  const matches = [];
  for (let i = 0; i < 200; i += 1) {
    const elo = 1000 + Math.round(i * 1.5);
    const isC = i >= 170;
    matches.push(makeMatch(i + 1, {
      civ: isC ? 'Magyars' : 'Franks',
      civSlug: isC ? 'magyars' : 'franks',
      myElo: elo,
      oppElo: elo,
      won: i % 2 === 0,
    }));
  }
  const res = analyzeCivPerformance({ targetCiv: 'Magyars', matches });
  assert.equal(res.contextAlerts.length, 0, `Should not flag normal ELO climb, got ${JSON.stringify(res.contextAlerts)}`);
  assert.equal(res.findings.length, 0);
});

// 5. Pure Opponent ELO Mismatch
test('5. Pure opponent ELO mismatch (+200 oppElo) adjusts baseline and flags opponent ELO gap', () => {
  const matches = [];
  let id = 1;
  // Civ C: 3W-12L (20% WR) vs +200 ELO opponents (expected ~24%)
  for (let i = 0; i < 15; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Celts', civSlug: 'celts', myElo: 1100, oppElo: 1300, won: i < 3 }));
  }
  // Baseline: 50W-50L vs equal ELO
  for (let i = 0; i < 100; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Franks', civSlug: 'franks', myElo: 1100, oppElo: 1100, won: i < 50 }));
  }
  const res = analyzeCivPerformance({ targetCiv: 'Celts', matches });
  assert.ok(Math.abs(res.sample.deltaPp) <= 6, `Elo-adjusted delta should be near 0, got ${res.sample.deltaPp}pp`);
  assert.ok(res.contextAlerts.some((a) => a.id === 'elo-opponent-gap'), 'Should emit elo-opponent-gap context alert');
  assert.equal(res.verdict, 'balanced');
});

// 6. Reverse-Causality Symptom Tautology (TCs, eAPM, Duration)
test('6. Reverse-causality tautology: losing causes low eAPM/short duration equally across civs => 0 findings', () => {
  const matches = [];
  let id = 1;
  for (let i = 0; i < 120; i += 1) {
    const isC = i < 24;
    const won = i % 2 === 0;
    matches.push(makeMatch(id++, {
      civ: isC ? 'Japanese' : 'Britons',
      civSlug: isC ? 'japanese' : 'britons',
      won,
      myEapm: won ? 58 : 42,
      durationGameSec: won ? 42 * 60 : 21 * 60,
      replay: { durationSeconds: won ? 42 * 60 : 21 * 60, feudalSeconds: 600, castleSeconds: won ? 1100 : null, relevantBsRatio: won ? 0.85 : 0.35, marketOps: won ? 1 : 9 },
    }));
  }
  const res = analyzeCivPerformance({ targetCiv: 'Japanese', matches });
  assert.equal(res.findings.length, 0, `Tautological loss symptoms must NOT trigger findings: ${JSON.stringify(res.findings)}`);
});

// 7. Cross-Dimension Collinearity Deduplication
test('7. Cross-dimension collinearity: Arena + Closed + Fast Castle on same losses => deduplicated to 1 card', () => {
  const matches = [];
  let id = 1;
  // Civ C: 2W-12L on Arena (Closed + FC + 35m), 10W-2L on Arabia (Open + Scouts + 28m)
  for (let i = 0; i < 14; i += 1) {
    matches.push(makeMatch(id++, {
      civ: 'Aztecs', civSlug: 'aztecs',
      mapName: 'Arena', mapKey: 'arena', openness: 'closed',
      myOpening: 'Fast castle', durationGameSec: 36 * 60, won: i < 2,
    }));
  }
  for (let i = 0; i < 12; i += 1) {
    matches.push(makeMatch(id++, {
      civ: 'Aztecs', civSlug: 'aztecs',
      mapName: 'Arabia', mapKey: 'arabia', openness: 'open',
      myOpening: 'Scout rush', durationGameSec: 28 * 60, won: i < 10,
    }));
  }
  // Baseline ~C: 50% on Arena and 50% on Arabia
  for (let i = 0; i < 40; i += 1) {
    matches.push(makeMatch(id++, {
      civ: 'Franks', civSlug: 'franks',
      mapName: 'Arena', mapKey: 'arena', openness: 'closed',
      myOpening: 'Fast castle', durationGameSec: 36 * 60, won: i < 20,
    }));
  }
  for (let i = 0; i < 40; i += 1) {
    matches.push(makeMatch(id++, {
      civ: 'Franks', civSlug: 'franks',
      mapName: 'Arabia', mapKey: 'arabia', openness: 'open',
      myOpening: 'Scout rush', durationGameSec: 28 * 60, won: i < 20,
    }));
  }
  const res = analyzeCivPerformance({ targetCiv: 'Aztecs', matches });
  const lossFindings = res.findings.filter((f) => f.tone === 'loss');
  assert.equal(lossFindings.length, 1, `Should collapse collinear Arena+Closed losses to 1 card, got ${lossFindings.length}: ${lossFindings.map((x) => x.title).join(', ')}`);
});

// 8. All-Time vs Recent Divergence
test('8. All-Time vs Recent divergence: 67% historical vs 25% recent (0-8 vs Scouts) flags recent drop & oppOpening', () => {
  const matches = [];
  let id = 1;
  // Recent 16 games: 0W-8L vs Scout rush, 4W-4L vs Archer rush
  for (let i = 0; i < 8; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Mayans', civSlug: 'mayans', oppOpening: 'Scout rush', won: false }));
  }
  for (let i = 0; i < 8; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Mayans', civSlug: 'mayans', oppOpening: 'Archer rush', won: i < 4 }));
  }
  // Baseline ~C: 55% vs Scouts, 50% vs Archers
  for (let i = 0; i < 40; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Britons', civSlug: 'britons', oppOpening: 'Scout rush', won: i < 22 }));
  }
  for (let i = 0; i < 40; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Britons', civSlug: 'britons', oppOpening: 'Archer rush', won: i < 20 }));
  }
  const res = analyzeCivPerformance({
    targetCiv: 'Mayans',
    matches,
    allTimeCivStat: { games: 60, wins: 40, losses: 20, winRate: 67 },
  });
  assert.equal(res.verdict, 'weakness');
  assert.ok(res.historicalDivergence && res.historicalDivergence.direction === 'down', 'Should detect historical vs recent divergence');
  assert.ok(res.findings.some((f) => f.dimension === 'oppOpening'), 'Should identify oppOpening Scout rush');
});

// 9. Zero-Net Polarized Civ (9-1 Arena, 1-9 Arabia)
test('9. Polarized civ (50% overall, 9-1 Arena & 1-9 Arabia) => verdict=polarized + both splits surfaced', () => {
  const matches = [];
  let id = 1;
  for (let i = 0; i < 10; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Turks', civSlug: 'turks', mapName: 'Arena', mapKey: 'arena', openness: 'closed', won: i < 9 }));
    matches.push(makeMatch(id++, { civ: 'Turks', civSlug: 'turks', mapName: 'Arabia', mapKey: 'arabia', openness: 'open', won: i < 1 }));
  }
  for (let i = 0; i < 40; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Franks', civSlug: 'franks', mapName: 'Arena', mapKey: 'arena', openness: 'closed', won: i < 20 }));
    matches.push(makeMatch(id++, { civ: 'Franks', civSlug: 'franks', mapName: 'Arabia', mapKey: 'arabia', openness: 'open', won: i < 20 }));
  }
  const res = analyzeCivPerformance({ targetCiv: 'Turks', matches });
  assert.equal(res.verdict, 'polarized', `Expected polarized verdict, got ${res.verdict}`);
  assert.ok(res.findings.some((f) => f.tone === 'win'), 'Should surface Arena strength');
  assert.ok(res.findings.some((f) => f.tone === 'loss'), 'Should surface Arabia weakness');
});

// 10. Early resign filter (< 5:00 in-game) + API Cache Dedup
test('10. Early resigns (<5:00 in-game) excluded from Feudal phase weakness', () => {
  const matches = [];
  let id = 1;
  // 8 dodges at 2:00 in-game + 8 real games (5W-3L)
  for (let i = 0; i < 8; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Huns', civSlug: 'huns', durationGameSec: 120, won: false }));
  }
  for (let i = 0; i < 8; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Huns', civSlug: 'huns', durationGameSec: 30 * 60, won: i < 5 }));
  }
  for (let i = 0; i < 40; i += 1) {
    matches.push(makeMatch(id++, { civ: 'Franks', civSlug: 'franks', durationGameSec: 30 * 60, won: i < 20 }));
  }
  const res = analyzeCivPerformance({ targetCiv: 'Huns', matches });
  assert.equal(res.sample.earlyResigns, 8);
  assert.equal(res.sample.games, 8);
  assert.equal(res.sample.rawWinRate, 63);
  assert.ok(!res.findings.some((f) => f.dimension === 'phase' && f.tone === 'loss'));
});

test('11. API Cache TTL + in-flight dedup prevents duplicate concurrent calls', async () => {
  const cache = createApiCache({ maxEntries: 5 });
  let calls = 0;
  const fetchSlow = () => new Promise((resolve) => {
    calls += 1;
    setTimeout(() => resolve({ ok: true, calls }), 20);
  });
  const [a, b, c] = await Promise.all([
    cache.getOrFetch('k1', 5000, fetchSlow),
    cache.getOrFetch('k1', 5000, fetchSlow),
    cache.getOrFetch('k1', 5000, fetchSlow),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.calls, 1);
  assert.equal(b.calls, 1);
  assert.equal(c.calls, 1);
  const d = await cache.getOrFetch('k1', 5000, fetchSlow);
  assert.equal(calls, 1);
  assert.equal(d.calls, 1);
});

test('12. Average eAPM per Map aggregates real eAPM, sample count, and delta vs mode mean', () => {
  const unified = [
    makeMatch(1, { mapName: 'Arabia', mapKey: 'arabia', myEapm: 60, won: true }),
    makeMatch(2, { mapName: 'Arabia', mapKey: 'arabia', myEapm: 64, won: true }),
    makeMatch(3, { mapName: 'Arena', mapKey: 'arena', myEapm: 44, won: false }),
    makeMatch(4, { mapName: 'Arena', mapKey: 'arena', myEapm: 48, won: true }),
  ];
  const res = computeMapEapmStats(unified);
  assert.equal(res.modeAvgEapm, 54);
  assert.equal(res.topMapsByEapm.length, 2);
  assert.equal(res.topMapsByEapm[0].mapName, 'Arabia');
  assert.equal(res.topMapsByEapm[0].avgEapm, 62);
  assert.equal(res.topMapsByEapm[0].eapmDelta, 8);
  assert.equal(res.topMapsByEapm[1].mapName, 'Arena');
  assert.equal(res.topMapsByEapm[1].avgEapm, 46);
  assert.equal(res.topMapsByEapm[1].eapmDelta, -8);
});

test('13. Central dashboard renders Civ Diagnostic Master-Detail, Map eAPM, Smart Scroll & ULTRA Blur Veil', () => {
  const insightsRows = [];
  for (let i = 0; i < 12; i += 1) {
    insightsRows.push({
      matchId: 500 + i, won: i < 3, map: 'Arena', openness: 'Closed', civ: 'Franks',
      oppCiv: 'Britons', strategy: 'Fast castle', oppStrategy: 'Fast castle',
      duration: 36 * 60, elo: 1200, oppElo: 1200, meanEapm: 48, oppMeanEapm: 50,
    });
    insightsRows.push({
      matchId: 600 + i, won: i < 9, map: 'Arabia', openness: 'Open', civ: 'Mongols',
      oppCiv: 'Mayans', strategy: 'Scout rush', oppStrategy: 'Archer rush',
      duration: 28 * 60, elo: 1200, oppElo: 1200, meanEapm: 62, oppMeanEapm: 55,
    });
  }
  const toColPayload = (rows) => ({
    count: rows.length,
    rows: {
      match_id: rows.map((r) => r.matchId),
      won: rows.map((r) => (r.won ? 'Won' : 'Not Won')),
      map: rows.map((r) => r.map),
      map_openness: rows.map((r) => r.openness),
      civilization: rows.map((r) => r.civ),
      civilization_opponent: rows.map((r) => r.oppCiv),
      strategy: rows.map((r) => r.strategy),
      strategy_opponent: rows.map((r) => r.oppStrategy),
      match_duration: rows.map((r) => r.duration),
      started_time: rows.map((_, i) => new Date(1700000000000 + i * 3600000).toISOString()),
      ladder: rows.map(() => 'RM 1v1'),
      elo: rows.map((r) => r.elo),
      elo_opponent: rows.map((r) => r.oppElo),
      mean_eapm: rows.map((r) => r.meanEapm),
      mean_eapm_opponent: rows.map((r) => r.oppMeanEapm),
    },
  });
  const dash = computeCentralAnalytics({
    profileId: 25399083,
    alias: 'PSX | Acido',
    ladder1v1: { rating: 1250, peak: 1310, wins: 50, losses: 45, rank: 12000, rankTotal: 50000 },
    insights1v1: toColPayload(insightsRows),
    matches1v1: insightsRows.map((r) => ({
      matchId: r.matchId, mapName: r.map, leaderboardId: 'rm_1v1', leaderboardName: 'RM 1v1',
      startedAt: 1700000000000, finishedAt: 1700000000000 + 1800000,
      players: [
        { profileId: 25399083, name: 'PSX | Acido', civ: r.civ, team: 1, won: r.won, matchRating: 1200 },
        { profileId: 999, name: 'Rival', civ: r.oppCiv, team: 2, won: !r.won, matchRating: 1200 },
      ],
    })),
  });
  assert.ok(dash.modes.rm_1v1.civDiagnostics.franks, 'Should compute Franks diagnostic');
  assert.ok(dash.modes.rm_1v1.stats.topMapsByEapm.length >= 2, 'Should compute map eAPM list');

  const htmlUltra = TacticalUI.renderCentralDashboard(dash, { activeModeId: 'rm_1v1', isUltra: true });
  assert.ok(htmlUltra.includes('cxCivDiagPanel'), 'Should render Civ Diagnostic panel');
  assert.ok(htmlUltra.includes('eAPM'), 'Should render map eAPM');
  assert.ok(htmlUltra.includes('data-scroll-target'), 'Should render smart scroll targets');
  assert.ok(!htmlUltra.includes('cx-ultra-veil'), 'Ultra user must NOT see paywall veil');

  const htmlFree = TacticalUI.renderCentralDashboard(dash, { activeModeId: 'rm_1v1', isUltra: false });
  assert.ok(htmlFree.includes('cx-ultra-veil'), 'Free user must see frosted ULTRA veil');
  assert.ok(htmlFree.includes('cx-ultra-blur" aria-hidden="true" inert'), 'Blurred ULTRA container must be inert against keyboard focus');
  assert.ok(htmlFree.includes('data-goto-plan="1"'), 'ULTRA veil must link to Plan y acceso');
  assert.ok(htmlFree.includes('cx-diag-head'), 'Free user still sees crisp Civ Diagnostic header');

  // Fail-closed: omitting isUltra must default to locked (false)
  const htmlOmitted = TacticalUI.renderCentralDashboard({ ...dash, isUltra: undefined }, { activeModeId: 'rm_1v1' });
  assert.ok(htmlOmitted.includes('cx-ultra-veil'), 'Missing isUltra must fail-closed to locked');
});

test('14. QueueWatcher.clearMatch wipes stale matched state on fast match end', () => {
  const q = new QueueWatcher({ profileId: 12345, onMatched: () => {}, onGone: () => {} });
  q.handleEvents([{
    type: 'queueingAdded',
    data: { id: 'm_999', matchId: 999, status: 'matched', players: [{ profileId: 12345, name: 'Me' }] },
  }], true);
  assert.ok(q.matched, 'Matched item should be tracked');
  assert.equal(q.clearMatch(999), true);
  assert.equal(q.matched, null, 'clearMatch should wipe stale match cleanly');
});

test('15. Intro auto-hide timer respects exact configured hideAtSeconds', () => {
  const t0 = 1000000;
  const state = { status: 'ongoing', match: { matchId: 777, startedAt: t0 } };
  const intro = trackIntro(null, state, t0);
  const cfg = { hideEloAt20: true, civHelp: true, hideAtSeconds: 35 };
  assert.equal(hideAtMs(cfg), 35000);
  assert.equal(introView(intro, cfg, t0 + 34999).eloHidden, false);
  assert.equal(introView(intro, cfg, t0 + 35000).eloHidden, true);
  assert.equal(introView(intro, cfg, t0 + 35000).civHelpVisible, false);
});

test('16. QueueWatcher recentMatchGuard preserves q.matched across quiet empty snapshot', () => {
  let goneCalled = 0;
  const q = new QueueWatcher({ profileId: 12345, onMatched: () => {}, onGone: () => { goneCalled += 1; } });
  q.handleEvents([{
    type: 'queueingAdded',
    data: { id: 'm_555', matchId: 555, status: 'matched', players: [{ profileId: 12345, name: 'Me' }] },
  }], true);
  assert.ok(q.matched);
  // Quiet fast-lane snapshot misses the matched item within 15s replication window
  q.handleEvents([], true, { quiet: true });
  assert.equal(goneCalled, 0, 'recentMatchGuard must suppress spurious onGone');
  assert.ok(q.matched && q.matched.matchId === 555, 'recentMatchGuard must keep q.matched intact');
});

test('17. FastLane.probe ignores same pausedMatchId and only wakes on new match or queue', async () => {
  let snapEvents = [{
    type: 'queueingAdded',
    data: { id: 'm_100', matchId: 100, status: 'matched', players: [{ profileId: 12345, name: 'Me' }] },
  }];
  let delivered = 0;
  const lane = new FastLane({
    profileId: 12345,
    readSnapshotImpl: async () => snapEvents,
    onSnapshot: () => { delivered += 1; },
  });
  lane.pause(100);
  await lane.probe();
  assert.equal(lane.paused, true, 'probe must stay paused when same matchId=100 is still in feed');
  assert.equal(delivered, 0);

  // Now a NEW match (200) appears in feed → must resume and deliver!
  snapEvents = [{
    type: 'queueingAdded',
    data: { id: 'm_200', matchId: 200, status: 'matched', players: [{ profileId: 12345, name: 'Me' }] },
  }];
  await lane.probe();
  assert.equal(lane.paused, false, 'probe must wake up when a different matchId appears');
  assert.equal(delivered, 1);
  lane.stop();
});

test('18. createApiCache bypass refreshes entry and cacheNull:false skips null', async () => {
  const c = createApiCache({ maxEntries: 10 });
  let n = 0;
  const v1 = await c.getOrFetch('k', 60000, async () => ++n);
  const v2 = await c.getOrFetch('k', 60000, async () => ++n, { bypass: true });
  const v3 = await c.getOrFetch('k', 60000, async () => ++n);
  assert.equal(v1, 1);
  assert.equal(v2, 2);
  assert.equal(v3, 2, 'bypass:true must overwrite cached value for subsequent reads');

  let nullCalls = 0;
  const n1 = await c.getOrFetch('id:1', 60000, async () => { nullCalls += 1; return null; }, { cacheNull: false });
  const n2 = await c.getOrFetch('id:1', 60000, async () => { nullCalls += 1; return { ok: true }; }, { cacheNull: false });
  assert.equal(n1, null);
  assert.deepEqual(n2, { ok: true });
  assert.equal(nullCalls, 2, 'cacheNull:false must not cache null results');
});

Promise.all(pendingTests).then(() => {
  console.log(`\nPassed ${passed} civ-diagnostic & cache tests.`);
});
