'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RequestScheduler } = require('../src/request-scheduler');
const { createApiCache } = require('../src/aoe');
const { sliceColumnarPayload } = require('../src/insights');
const { fetchMyHistory } = require('../src/mine');
const { ReplayCache } = require('../src/replay-cache');
const { computeCentralAnalytics } = require('../src/central');
const {
  analyzeMapPerformance,
  buildModeMapDiagnostics,
  computePersonalAcademy,
  computeEloAttributionAndSession,
} = require('../src/central-intel');
const { openingShort, openingLabel } = require('../src/replay-analysis');
const TacticalUI = require('../ui/tactical-ui');

let passed = 0;
const pending = [];

function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      pending.push(
        res.then(() => {
          passed += 1;
          console.log(`  ✓ ${name}`);
        }).catch((err) => {
          console.error(`  ✗ ${name}`);
          throw err;
        }),
      );
    } else {
      passed += 1;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

// ============================================================================
// TRACK 1: API CONSUMPTION, CONCURRENCY & ZERO-REGRESSION ENGINEERING TESTS
// ============================================================================

test('1. Token-Bucket RequestScheduler dispatches parallel bursts at t=0ms and evicts aborted tasks', async () => {
  const sched = new RequestScheduler({ intervalMs: 220, maxConcurrent: 3, burstTokens: 3 });
  const start = Date.now();
  const starts = [];
  const tasks = [0, 1, 2].map((idx) =>
    sched.run(
      async () => {
        starts.push(Date.now() - start);
        await new Promise((r) => setTimeout(r, 40));
        return idx;
      },
      10,
    ),
  );
  const results = await Promise.all(tasks);
  assert.deepEqual(results, [0, 1, 2]);
  // All 3 tasks in the initial token-bucket burst should start almost simultaneously (<80ms)
  const spreadMs = Math.max(...starts) - Math.min(...starts);
  assert.ok(spreadMs < 80, `Expected parallel burst dispatch (<80ms spread), got starts=${JSON.stringify(starts)}`);

  // AbortSignal cancellation before execution
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => sched.run(async () => 'should-not-run', 0, { signal: ac.signal }),
    /cancelada/i,
  );
});

test('2. createApiCache exposes getInflight(key) for cross-endpoint in-flight coalescing', async () => {
  const cache = createApiCache({ maxEntries: 16 });
  let resolveSlow;
  const deferred = new Promise((res) => { resolveSlow = res; });
  const p = cache.getOrFetch(
    'profileExt:25399083',
    60_000,
    () => deferred,
  );
  const inflight = cache.getInflight('profileExt:25399083');
  assert.ok(inflight, 'getInflight must return the active promise while request is in flight');
  resolveSlow({ profileId: 25399083, leaderboards: [{ leaderboardId: 'rm_1v1', rating: 1350 }] });
  const val = await inflight;
  assert.equal(val.profileId, 25399083);
  await p;
  assert.equal(cache.getInflight('profileExt:25399083'), undefined, 'getInflight must clear after resolution');
});

test('3. sliceColumnarPayload slices AoE2Insights columnar payloads without mutating canonical 500-row cache', () => {
  const full = {
    count: 5,
    rows: {
      match_id: [101, 102, 103, 104, 105],
      civilization: ['Franks', 'Mayans', 'Britons', 'Mongols', 'Aztecs'],
      won: ['Won', 'Not Won', 'Won', 'Won', 'Not Won'],
    },
  };
  const sliced = sliceColumnarPayload(full, 3);
  assert.equal(sliced.count, 5, 'Must preserve total server match count while slicing row arrays');
  assert.deepEqual(sliced.rows.match_id, [101, 102, 103]);
  assert.deepEqual(sliced.rows.civilization, ['Franks', 'Mayans', 'Britons']);
  // Canonical payload must remain untouched
  assert.equal(full.count, 5);
  assert.equal(full.rows.match_id.length, 5);
});

test('4. fetchMyHistory Incremental Delta Sync stops at Page 1 on settled matchId and re-fetches unsettled matches', async () => {
  const cache = new Map();
  const makeCompanionMatch = (id, startedSecAgo, won = true, ratingDiff = 15) => ({
    matchId: id,
    startedAt: Date.now() - startedSecAgo * 1000,
    finishedAt: Date.now() - (startedSecAgo - 1200) * 1000,
    mapName: 'Arabia',
    leaderboardId: 'rm_1v1',
    leaderboardName: 'RM 1v1',
    players: [
      { profileId: 25399083, name: 'PSX | Acido', civ: 'Franks', team: 1, won, rating: 1250, ratingDiff },
      { profileId: 999, name: 'Rival', civ: 'Britons', team: 2, won: won === null ? null : !won, rating: 1240, ratingDiff: ratingDiff != null ? -ratingDiff : null },
    ],
  });

  // Initial cold fetch: 3 settled matches on page 1, empty page 2
  let pagesFetched = 0;
  const initialMatches = [
    makeCompanionMatch(1003, 3600, true, 16),
    makeCompanionMatch(1002, 7200, false, -15),
    makeCompanionMatch(1001, 10800, true, 14),
  ];
  const res1 = await fetchMyHistory({
    profileId: 25399083,
    leaderboardId: 3,
    cache,
    cacheTtlMs: 10, // Tiny TTL so next call triggers delta sync
    maxPages: 6,
    fetchMatchesImpl: async (_pid, _perPage, page) => {
      pagesFetched += 1;
      if (page === 1) return initialMatches;
      return [];
    },
  });
  assert.equal(res1.rows.length, 3);
  const cachedEntry = cache.get('mine:25399083:3');
  assert.ok(cachedEntry && cachedEntry.ts && cachedEntry.rows.length === 3 && cachedEntry.matches.length === 3);

  // Wait 20ms so cache entry expires and triggers Incremental Delta Sync
  await new Promise((r) => setTimeout(r, 25));
  pagesFetched = 0;

  // Now 1 new match (1004) was played; Page 1 returns 100 items starting with [1004, 1003, 1002...].
  // Because 1003 and 1002 are already settled in cache, Delta Sync MUST stop after Page 1 (1 request instead of 6!)
  const page1Full = [
    makeCompanionMatch(1004, 600, true, 17),
    makeCompanionMatch(1003, 3600, true, 16),
    makeCompanionMatch(1002, 7200, false, -15),
    ...Array.from({ length: 97 }, (_, idx) => makeCompanionMatch(900 - idx, 20000 + idx * 600, true, 12)),
  ];
  const res2 = await fetchMyHistory({
    profileId: 25399083,
    leaderboardId: 3,
    cache,
    cacheTtlMs: 10,
    maxPages: 6,
    fetchMatchesImpl: async (_pid, _perPage, page) => {
      pagesFetched += 1;
      if (page === 1) return page1Full;
      throw new Error('Delta Sync should NOT fetch page 2 when page 1 hits settled matchId!');
    },
  });
  assert.equal(pagesFetched, 1, 'Delta Sync must fetch only 1 page when hitting settled prior match');
  assert.ok(res2.rows.some((r) => r.matchId === 1004), 'Delta Sync must include the new match 1004');
  assert.ok(res2.rows.some((r) => r.matchId === 1001), 'Delta Sync must preserve older cached match 1001 without re-fetching page 2');

  // Verify provisional match (won: null) is NOT treated as settled and gets upgraded when settled
  const cacheProv = new Map();
  await fetchMyHistory({
    profileId: 25399083,
    leaderboardId: 3,
    cache: cacheProv,
    cacheTtlMs: 5,
    maxPages: 2,
    fetchMatchesImpl: async () => [
      makeCompanionMatch(2002, 120, null, null),
      makeCompanionMatch(2001, 5000, true, 15),
    ],
  });
  await new Promise((r) => setTimeout(r, 15));
  const upgraded = await fetchMyHistory({
    profileId: 25399083,
    leaderboardId: 3,
    cache: cacheProv,
    cacheTtlMs: 5,
    maxPages: 2,
    fetchMatchesImpl: async () => [
      makeCompanionMatch(2002, 120, true, 18),
      makeCompanionMatch(2001, 5000, true, 15),
    ],
  });
  assert.equal(upgraded.rows.find((r) => r.matchId === 2002).won, true, 'Provisional match must upgrade to won:true once settled');
});

test('5. Unified Cache Schema ({ ts, rows }) interoperates seamlessly between ReplayCache and computeCentralAnalytics', () => {
  const rc = new ReplayCache();
  const parsedRows = [
    {
      matchId: 901, won: true, map: 'Arabia', openness: 'Open', civ: 'Franks',
      oppCiv: 'Britons', strategy: 'Scout rush', oppStrategy: 'Archer rush',
      duration: 1650, startedAt: Date.now() - 7200_000, ladder: 'RM 1v1',
      elo: 1240, oppElo: 1250, meanEapm: 56, oppMeanEapm: 52,
    },
    {
      matchId: 902, won: false, map: 'Arena', openness: 'Closed', civ: 'Franks',
      oppCiv: 'Bohemians', strategy: 'Fast castle', oppStrategy: 'Fast castle',
      duration: 2400, startedAt: Date.now() - 3600_000, ladder: 'RM 1v1',
      elo: 1256, oppElo: 1260, meanEapm: 48, oppMeanEapm: 50,
    },
  ];
  rc.set('insights:25399083:rm_1v1:500', { ts: Date.now(), rows: parsedRows, totalRows: 2 });
  const hit = rc.get('insights:25399083:rm_1v1:500');
  assert.ok(hit && Array.isArray(hit.rows) && hit.rows.length === 2);

  // Passing ReplayCache's { ts, rows } entry directly as insights1v1 into computeCentralAnalytics must work seamlessly
  const dash = computeCentralAnalytics({
    profileId: 25399083,
    alias: 'PSX | Acido',
    ladder1v1: { rating: 1245, peak: 1300, wins: 20, losses: 18 },
    insights1v1: hit,
  });
  assert.equal(dash.ok, true);
  assert.equal(dash.modes.rm_1v1.insights.totalRows, 2);
  assert.equal(dash.modes.rm_1v1.insights.eapm.avgSelf, 52);
});

// ============================================================================
// TRACK 2: OFFICIAL AoE2:DE NOMENCLATURE & GLOSSARY GUARD
// ============================================================================

test('6. Official AoE2:DE Terminology Guard: 0 invented or legacy slang terms across src/ and ui/', () => {
  assert.equal(openingShort('Pike Skirm'), 'Piqueros + Guerrilleros');
  assert.equal(openingLabel('Pike Skirm'), 'Piqueros y guerrilleros');
  assert.equal(openingShort('Drush Archers'), 'Drush + Arqueros');
  assert.equal(openingShort('M@A Archers'), 'Hombres de armas + Arqueros');
  assert.equal(openingShort('Scouts into Archers'), 'Scouts → Arqueros');

  const unitNames = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'engine', 'unit-names.json'), 'utf8'));
  assert.equal(unitNames.units['6'].name, 'Guerrillero de élite');
  assert.equal(unitNames.units['7'].name, 'Guerrillero');
  assert.equal(unitNames.units['1155'].name, 'Guerrillero imperial');
  assert.equal(unitNames.buildings['87'].name, 'Galería de tiro con arco');
  assert.equal(unitNames.buildings['49'].name, 'Taller de maquinaria de asedio');

  const esMx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'locales', 'es-MX.json'), 'utf8'));
  const esEs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'locales', 'es-ES.json'), 'utf8'));
  assert.equal(esMx.postmatch.tcCycle, 'COLA DE ALDEANOS');
  assert.equal(esEs.postmatch.tcCycle, 'COLA DE ALDEANOS');
  assert.equal(esMx.openings['Pike Skirm'], 'Piqueros y guerrilleros');
  assert.equal(esEs.openings['Pike Skirm'], 'Piqueros y guerrilleros');

  // Scan source files to ensure forbidden terms never regress
  const forbiddenRegex = /CICLO TC|CICLO CU|TC CYCLE|Ciclo TC|Ciclo Relámpago|s\/ciclo|Piqueros y hostigadores|Hostigador|arcabuceros|cañones de bombardeo|escaramuzadores|mangoneles|Sierra de dos hombres|Anillo de pulgar|edif\. mil\.|\buds\b/;
  const filesToScan = [
    path.join(__dirname, '..', 'src', 'engine', 'postmatch-engine.js'),
    path.join(__dirname, '..', 'src', 'engine', 'unit-names.json'),
    path.join(__dirname, '..', 'src', 'replay-analysis.js'),
    path.join(__dirname, '..', 'src', 'postmatch.js'),
    path.join(__dirname, '..', 'src', 'prematch-predict.js'),
    path.join(__dirname, '..', 'src', 'build-orders.js'),
    path.join(__dirname, '..', 'src', 'opportunities.js'),
    path.join(__dirname, '..', 'src', 'civ-guide.js'),
    path.join(__dirname, '..', 'src', 'central-intel.js'),
    path.join(__dirname, '..', 'ui', 'tactical-ui.js'),
  ];
  for (const filePath of filesToScan) {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(forbiddenRegex);
    assert.equal(match, null, `Forbidden non-official term "${match?.[0]}" found in ${path.basename(filePath)}`);
  }
});

// ============================================================================
// TRACK 3: NEW CENTRAL PRODUCT & COMPETITIVE INTELLIGENCE TESTS
// ============================================================================

test('7. Map Diagnostic Engine (analyzeMapPerformance & buildModeMapDiagnostics): small-sample guard, causal findings & bestCivHere', () => {
  const mkMatch = (id, overrides = {}) => ({
    matchId: id,
    startedAt: 1700000000000 + id * 3600_000,
    mapName: 'Arabia',
    mapKey: 'arabia',
    openness: 'open',
    civ: 'Franks',
    civSlug: 'franks',
    oppCiv: 'Britons',
    oppCivSlug: 'britons',
    won: true,
    myElo: 1200,
    oppElo: 1200,
    myEapm: 55,
    oppEapm: 52,
    myOpening: 'Scout rush',
    oppOpening: 'Archer rush',
    durationGameSec: 26 * 60,
    ...overrides,
  });

  // Small sample (< 4 matches) -> insufficient, 0 findings
  const smallRes = analyzeMapPerformance({
    targetMap: 'Arabia',
    matches: [mkMatch(1), mkMatch(2), mkMatch(3, { won: false })],
  });
  assert.equal(smallRes.status, 'insufficient');
  assert.equal(smallRes.findings.length, 0);

  // Rich sample on Arena: player struggles on Arena (2W-10L) specifically vs Fast Castle / in late game, while winning with Bohemians (3W-1L) and losing with Franks (0W-8L)
  const matches = [];
  let id = 10;
  for (let i = 0; i < 8; i += 1) {
    matches.push(mkMatch(id++, {
      mapName: 'Arena', mapKey: 'arena', openness: 'closed',
      civ: 'Franks', civSlug: 'franks',
      oppOpening: 'Fast castle', durationGameSec: 44 * 60,
      myEapm: 42, won: false,
    }));
  }
  for (let i = 0; i < 4; i += 1) {
    matches.push(mkMatch(id++, {
      mapName: 'Arena', mapKey: 'arena', openness: 'closed',
      civ: 'Bohemians', civSlug: 'bohemians',
      oppOpening: 'Scout rush', durationGameSec: 32 * 60,
      myEapm: 48, won: i < 3,
    }));
  }
  // Baseline on Arabia: 14W-6L, eAPM 56
  for (let i = 0; i < 20; i += 1) {
    matches.push(mkMatch(id++, {
      mapName: 'Arabia', mapKey: 'arabia', openness: 'open',
      civ: 'Franks', civSlug: 'franks',
      oppOpening: 'Archer rush', durationGameSec: 26 * 60,
      myEapm: 56, won: i < 14,
    }));
  }

  const mapDiags = buildModeMapDiagnostics({
    modeId: 'rm_1v1',
    matches,
    allTimeMaps: [
      { mapName: 'Arabia', games: 20, wins: 14, losses: 6, winRate: 70 },
      { mapName: 'Arena', games: 12, wins: 3, losses: 9, winRate: 25 },
    ],
  });
  assert.ok(mapDiags.arena && mapDiags.arena.ok);
  assert.equal(mapDiags.arena.terrainLabel, 'Cerrado');
  assert.equal(mapDiags.arena.verdict, 'weakness');
  assert.ok(mapDiags.arena.bestCivHere && mapDiags.arena.bestCivHere.civ === 'Bohemians');
  assert.ok(mapDiags.arena.findings.length >= 1, 'Arena diagnostic must emit causal findings');
  assert.ok(mapDiags.arena.breakdowns.civs.length >= 2);
});

test('8. Personal Improvement Academy (computePersonalAcademy): stage grade evolution, 6 habits, priority focus & <180s exclusion', () => {
  const mkRecord = (idx, { recent = false, durationSeconds = 1600, profileId = 25399083 } = {}) => ({
    matchId: String(5000 + idx),
    profileId,
    startedAt: 1700000000000 + idx * 3600_000,
    telemetry: {
      durationSeconds,
      metrics: { eapm: { value: recent ? 54 : 44 } },
      engineSummary: {
        durationSeconds,
        self: {
          tcIdleDarkSeconds: recent ? 8 : 24,
          tcIdleFeudalPerTcSeconds: recent ? 22 : 58,
          eapm: recent ? 54 : 44,
          militaryOrdered: 40,
          habits: {
            attackMove: recent ? 12 : 0,
            patrol: recent ? 4 : 0,
            townBell: recent ? 0 : 2,
          },
          combatMicro: { stopMicro: 0 },
          techProfile: {
            hasDoubleBitAxe: true,
            doubleBitAxeDelaySec: recent ? 20 : 180,
            armyRelevance: {
              primaryClass: 'cavalry',
              wellEquipped: recent,
            },
          },
        },
        stages: [
          { id: 'dark', status: 'ready', score: recent ? 92 : 74, grade: recent ? 'S' : 'B' },
          { id: 'feudal', status: 'ready', score: recent ? 86 : 68, grade: recent ? 'A' : 'B' },
          { id: 'castle', status: 'ready', score: recent ? 84 : 66, grade: recent ? 'A' : 'B' },
          { id: 'imperial', status: 'ready', score: recent ? 80 : 64, grade: recent ? 'A' : 'C' },
        ],
        negatives: [
          { id: 'neg-tc-gap', domain: 'macro_tc', severity: 85 },
        ],
      },
    },
  });

  // 4 recent records + 4 older records + 1 short abandon (<180s) + 1 foreign profile record
  const storedRecords = [
    mkRecord(10, { recent: true }),
    mkRecord(9, { recent: true }),
    mkRecord(8, { recent: true }),
    mkRecord(7, { recent: true }),
    mkRecord(6, { recent: false }),
    mkRecord(5, { recent: false }),
    mkRecord(4, { recent: false }),
    mkRecord(3, { recent: false }),
    mkRecord(2, { recent: true, durationSeconds: 95 }), // < 180s early abandon -> must be excluded
    mkRecord(1, { recent: true, profileId: 999999 }),   // different profileId -> must be excluded
  ];

  const acad = computePersonalAcademy({ storedRecords, profileId: 25399083, isOwnProfile: true });
  assert.ok(acad && acad.ok);
  assert.equal(acad.totalReplays, 8, 'Must exclude <180s abandon and foreign profile records');
  assert.equal(acad.stageEvolution.length, 4);
  assert.equal(acad.stageEvolution[0].label, 'Alta Edad Media');
  assert.equal(acad.stageEvolution[0].recentGrade, 'S');
  assert.ok(acad.stageEvolution[0].deltaScore > 10, 'Must detect stage score improvement from older to recent window');
  assert.equal(acad.habits.length, 6, 'Must compute all 6 official AoE2 mechanical habits');
  const tcHabit = acad.habits.find((h) => h.id === 'tc_idle');
  assert.equal(tcHabit.improved, true, 'Lower TC idle seconds in recent window must mark improved=true');
  assert.ok(acad.priorityFocus && acad.priorityFocus.domain === 'macro_tc', 'Must identify #1 recurring bottleneck');
});

test('9. ELO Attribution, Matchup Antidotes & Session Tilt Engine (computeEloAttributionAndSession)', () => {
  const matches = [];
  let id = 1;
  const baseTs = 1700000000000;

  // 6 sessions of 4 matches each (24 matches total):
  // Game #1 of session: Franks on Arabia vs Archer rush (wins with Scout rush)
  // Game #2 of session: Franks on Arabia vs Archer rush (wins with Scout rush)
  // Game #3 of session: Random civ_i on Arena vs Fast castle (loses in 50m+)
  // Game #4 of session: Random civ_j on Arena vs Fast castle (loses in 50m+)
  for (let s = 0; s < 6; s += 1) {
    const sessionStart = baseTs + s * 10 * 3600_000; // 10h apart -> distinct sessions
    matches.push({
      matchId: id++, startedAt: sessionStart + 0 * 1800_000,
      mapName: 'Arabia', mapKey: 'arabia', civ: 'Franks', civSlug: 'franks',
      oppCiv: 'Britons', oppCivSlug: 'britons',
      myOpening: 'Scout rush', oppOpening: 'Archer rush',
      durationGameSec: 24 * 60, myElo: 1200, oppElo: 1200, won: true,
    });
    matches.push({
      matchId: id++, startedAt: sessionStart + 1 * 1800_000,
      mapName: 'Arabia', mapKey: 'arabia', civ: 'Franks', civSlug: 'franks',
      oppCiv: 'Britons', oppCivSlug: 'britons',
      myOpening: 'Scout rush', oppOpening: 'Archer rush',
      durationGameSec: 25 * 60, myElo: 1200, oppElo: 1200, won: true,
    });
    matches.push({
      matchId: id++, startedAt: sessionStart + 2 * 1800_000,
      mapName: 'Arena', mapKey: 'arena', civ: `ExpCiv${s}A`, civSlug: `expciv${s}a`,
      oppCiv: 'Bohemians', oppCivSlug: 'bohemians',
      myOpening: 'Fast castle', oppOpening: 'Fast castle',
      durationGameSec: 52 * 60, myElo: 1200, oppElo: 1200, won: false,
    });
    matches.push({
      matchId: id++, startedAt: sessionStart + 3 * 1800_000,
      mapName: 'Arena', mapKey: 'arena', civ: `ExpCiv${s}B`, civSlug: `expciv${s}b`,
      oppCiv: 'Bohemians', oppCivSlug: 'bohemians',
      myOpening: 'Fast castle', oppOpening: 'Fast castle',
      durationGameSec: 54 * 60, myElo: 1200, oppElo: 1200, won: false,
    });
  }

  const intel = computeEloAttributionAndSession({ matches });
  assert.ok(intel && intel.ok);
  assert.ok(intel.gains.length >= 1, 'Must identify ELO gain drivers (Mains / Arabia / vs Archer rush)');
  assert.ok(intel.leaks.length >= 1, 'Must identify ELO leaks (Experiments / Post-Imperial / Arena)');
  const vsArchers = intel.vsOpenings.find((o) => /arqueros/i.test(o.opening));
  assert.ok(vsArchers && vsArchers.antidote, 'Must compute player antidote against enemy opening');
  assert.ok(intel.nemesisCivs.some((c) => c.civ === 'Bohemians'), 'Must detect Bohemians as nemesis civ');
  assert.ok(intel.preyCivs.some((c) => c.civ === 'Britons'), 'Must detect Britons as favorable prey civ');
  assert.ok(intel.session && intel.session.buckets.length === 3, 'Must compute 3 session length buckets');
  assert.equal(intel.session.totalSessions, 6);
});

test('10. TacticalUI.renderCentralDashboard renders Map Diagnostic Master-Detail, Personal Academy & ELO Intel with 0 inline styles', () => {
  const insightsRows = [];
  for (let i = 0; i < 8; i += 1) {
    insightsRows.push({
      matchId: 700 + i, won: true, map: 'Arabia', openness: 'Open', civ: 'Franks',
      oppCiv: 'Britons', strategy: 'Scout rush', oppStrategy: 'Archer rush',
      duration: 24 * 60, elo: 1250, oppElo: 1250, meanEapm: 58, oppMeanEapm: 52,
      startedAt: 1700000000000 + i * 2400_000,
    });
    insightsRows.push({
      matchId: 800 + i, won: false, map: 'Arena', openness: 'Closed', civ: `Civ${i}`,
      oppCiv: 'Bohemians', strategy: 'Fast castle', oppStrategy: 'Fast castle',
      duration: 50 * 60, elo: 1250, oppElo: 1250, meanEapm: 45, oppMeanEapm: 49,
      startedAt: 1700000000000 + (i + 10) * 2400_000,
    });
  }
  const storedRecords = Array.from({ length: 6 }, (_, idx) => ({
    matchId: String(700 + idx),
    profileId: 25399083,
    startedAt: 1700000000000 + idx * 2400_000,
    match: { matchId: 700 + idx, leaderboardId: 'rm_1v1', mapName: 'Arabia' },
    telemetry: {
      durationSeconds: 1500,
      metrics: { eapm: { value: 58 } },
      engine: {
        durationSeconds: 1500,
        self: {
          tcUtilizationEarly: 93,
          tcIdleEarlySeconds: 28,
          villagersOrdered: 65,
          eapm: 58,
        },
      },
      engineSummary: {
        durationSeconds: 1500,
        self: {
          tcIdleDarkSeconds: 10,
          tcIdleFeudalPerTcSeconds: 18,
          eapm: 58,
          militaryOrdered: 42,
          habits: { attackMove: 10, patrol: 4, townBell: 0 },
          combatMicro: { stopMicro: 0 },
          techProfile: {
            hasDoubleBitAxe: true,
            doubleBitAxeDelaySec: 25,
            armyRelevance: { primaryClass: 'cavalry', wellEquipped: true },
          },
        },
        stages: [
          { id: 'dark', status: 'ready', score: 90, grade: 'S' },
          { id: 'feudal', status: 'ready', score: 85, grade: 'A' },
          { id: 'castle', status: 'ready', score: 82, grade: 'A' },
          { id: 'imperial', status: 'not_reached', score: null, grade: null },
        ],
        negatives: [{ id: 'neg-tc-gap', domain: 'macro_tc', severity: 80 }],
      },
    },
  }));

  const dash = computeCentralAnalytics({
    profileId: 25399083,
    alias: 'PSX | Acido',
    isOwnProfile: true,
    ladder1v1: { rating: 1250, peak: 1310, wins: 40, losses: 35, rank: 11000, rankTotal: 48000 },
    insights1v1: { ts: Date.now(), rows: insightsRows },
    storedRecords,
  });

  const html = TacticalUI.renderCentralDashboard(dash, {
    activeModeId: 'rm_1v1',
    selectedMapKey: 'arena',
    mapDiagTab: 'openings',
    isUltra: true,
  });

  assert.match(html, /id="cxMapDiagPanel"/, 'Must render Map Diagnostic Master-Detail panel');
  assert.match(html, /data-diag-map="arena"/, 'Must render interactive map buttons');
  assert.match(html, /data-map-diag-tab="openings"/, 'Must render map diagnostic breakdown tabs');
  assert.match(html, /id="cxSectionAcademy"/, 'Must render Laboratorio de Mejora Personal');
  assert.match(html, /Alta Edad Media/, 'Must render official AoE2:DE age names in Academy');
  assert.match(html, /Hacha de doble filo a tiempo/, 'Must render official AoE2:DE habit names in Academy');
  assert.match(html, /id="cxSectionIntel"/, 'Must render Competitive Intelligence section');
  assert.match(html, /id="cxEloAttributionCard"/, 'Must render ELO Attribution card');
  assert.match(html, /id="cxMatchupSessionCard"/, 'Must render Matchup Antidotes & Session Tilt card');
  assert.doesNotMatch(html, /\sstyle=/i, 'CSP: must not emit inline style="" attributes');
});

test('11. Startup auto-detect, full-window boot loader (#appBootLoader) & exact Relic logo centering', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'settings.css'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'settings-preload.js'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'settings.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

  assert.match(html, /id="appBootLoader"/, 'settings.html must include full-window startup loader');
  assert.match(html, /rel="preload" as="image" href="assets\/art\/wizard-umbral\.webp"/, 'settings.html must preload boot background art');
  assert.match(css, /\.app-boot-loader[\s\S]*wizard-umbral\.webp/, 'settings.css must render wizard-umbral.webp behind startup loader');
  assert.match(css, /\.rail-logo\s*\{[^}]*margin:\s*0 auto !important/, 'settings.css must center .rail-logo cleanly');
  assert.match(preload, /onProfileDetected:/, 'settings-preload.js must expose onProfileDetected');
  assert.match(settingsJs, /onProfileDetected/, 'settings.js must subscribe to onProfileDetected');
  assert.match(settingsJs, /finishBootLoader/, 'settings.js must fade out boot loader after initial load');
  assert.match(mainJs, /ensureProfileReady/, 'main.js must await startup auto-detection before returning empty profile');
  assert.match(mainJs, /autoplay-policy/, 'main.js must allow subtle startup sound without gesture block');
});

test('12. Official AoE2:DE Map Art Catalog, Central 3-Tab Layout, Localized Findings & Sophisticated UiSfx Engine', () => {
  const mapArt = require('../src/map-art.json');
  const slugs = new Set(Object.values(mapArt));
  assert.ok(slugs.size >= 150, `Expected >=150 bundled official map images, got ${slugs.size}`);
  for (const slug of slugs) {
    const fp = path.join(__dirname, '..', 'assets', 'maps', `${slug}.webp`);
    assert.ok(fs.existsSync(fp), `Missing bundled map image file: assets/maps/${slug}.webp`);
  }
  assert.equal(mapArt.arabia, 'arabia');
  assert.equal(mapArt.arena, 'arena');
  assert.equal(mapArt.guaridas, 'hideout', 'Spanish map alias Guaridas must map to hideout.webp');

  const TacticalUI = require('../ui/tactical-ui');
  const i18n = require('../src/i18n');
  const AppI18n = require('../ui/i18n');
  AppI18n.configure({ locale: 'es-MX', allBundles: i18n.getAllBundles() });
  TacticalUI.configure({ mapArt, i18n: AppI18n });
  const arabiaBadge = TacticalUI.mapBadge('Arabia', 'md');
  assert.match(arabiaBadge, /class="map-art-thumb is-md"/);
  assert.match(arabiaBadge, /src="assets\/maps\/arabia\.webp"/);
  assert.doesNotMatch(arabiaBadge, /loading="lazy"/, 'Local map art must not lazy-delay tab switching');

  const { computeCentralAnalytics } = require('../src/central');
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    rows.push({
      matchId: String(9000 + i),
      map: 'Arabia',
      civ: i < 6 ? 'Persians' : 'Spanish',
      opening: 'Scout rush',
      opponentOpening: 'Archer rush',
      eapm: 52,
      oppEapm: 46,
      durationSec: 1600,
      started: 1700000000 + i * 3600,
      won: i < 6,
      elo: 1200 + i * 2,
      oppElo: 1200,
    });
  }
  const dash = computeCentralAnalytics({
    profileId: 25399083, alias: 'PSX | Acido', isOwnProfile: true,
    ladder1v1: { rating: 1220, peak: 1250, wins: 6, losses: 6, rank: 12000, rankTotal: 45000 },
    insights1v1: { ts: Date.now(), rows },
    storedRecords: [],
  });
  const html = TacticalUI.renderCentralDashboard(dash, { activeModeId: 'rm_1v1', centralView: 'mastery', selectedMapKey: 'arabia', isUltra: true });
  assert.match(html, /data-central-view="overview"/, 'Must render Resumen sub-tab');
  assert.match(html, /data-central-view="mastery"/, 'Must render Civilizaciones y Mapas sub-tab');
  assert.match(html, /assets\/maps\/arabia\.webp/, 'Central must display official Arabia map art');
  assert.doesNotMatch(html, /\bPersians\b/, 'Map diagnostic findings must localize English civ names to Spanish (Persas)');
  assert.doesNotMatch(html, /\sstyle=/i, 'CSP: Central HTML must have 0 inline styles');

  // Verify upgraded UiSfx engine exposes all tactile sounds
  const sfxSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'sfx.js'), 'utf8');
  for (const cue of ['hover', 'key', 'keySpace', 'keyBack', 'keyEnter', 'subtab', 'select', 'slider', 'progress', 'bootLoad', 'bootReady']) {
    assert.ok(sfxSrc.includes(`'${cue}'`), `ui/sfx.js must implement tactile sound cue: ${cue}`);
  }
});

test('13. Central v5 Real Player Discoveries (9 modules, TG team-avg ELO gap, engineSummary fix & CSP-safe SVG visuals)', () => {
  const { computeModeDiscoveries } = require('../src/central-discoveries');
  const { computeCentralAnalytics } = require('../src/central');
  const TacticalUI = require('../ui/tactical-ui');
  const mapArt = require('../src/map-art.json');
  const i18n = require('../src/i18n');
  const AppI18n = require('../ui/i18n');
  AppI18n.configure({ locale: 'es-MX', allBundles: i18n.getAllBundles() });
  TacticalUI.configure({ mapArt, i18n: AppI18n });

  const baseTs = new Date(2026, 9, 10, 9, 0, 0).getTime(); // 09:00 local (Mañana)
  const aftTs = new Date(2026, 9, 10, 15, 0, 0).getTime(); // 15:00 local (Tarde)
  const eloSeries = [];
  for (let i = 0; i < 16; i += 1) {
    const morning = i < 8;
    eloSeries.push({
      startedAt: (morning ? baseTs + i * 15 * 60_000 : aftTs + (i - 8) * 15 * 60_000),
      rating: 1200 + (morning ? i * 16 : (8 * 16 - (i - 7) * 14)),
      diff: morning ? 16 : -14,
      won: morning,
    });
  }
  const unifiedMatches = [];
  for (let i = 0; i < 16; i += 1) {
    unifiedMatches.push({
      matchId: String(4000 + i),
      civ: i < 8 ? 'Khmer' : 'Persians',
      civSlug: i < 8 ? 'khmer' : 'persians',
      oppCiv: i < 8 ? 'Chinese' : 'Huns',
      mapName: i < 8 ? 'Lombardia' : 'Arabia',
      mapKey: i < 8 ? 'lombardia' : 'arabia',
      won: i < 10,
      myEapm: i < 10 ? 64 : 42,
      oppEapm: i < 10 ? 44 : 58,
      durationGameSec: i < 6 ? 19 * 60 : (i < 12 ? 29 * 60 : 54 * 60),
      startedAt: baseTs + i * 3600_000,
    });
  }
  // Team Game match with team-avg ELO gap (+50 oppTeam vs myTeam)
  const modeMatches = [
    {
      matchId: '4001', won: true, mapName: 'Arabia', myCiv: 'Khmer', myRating: 1350, myRatingDiff: 18,
      rawMatch: {
        players: [
          { profileId: 25399083, team: 1, matchRating: 1350, matchRatingDiff: 18, civ: 'Khmer', won: true },
          { profileId: 111, team: 1, matchRating: 1350, civ: 'Franks', won: true },
          { profileId: 222, team: 2, name: 'TitanRival', matchRating: 1420, civ: 'Huns', won: false },
          { profileId: 333, team: 2, name: 'AllyRival', matchRating: 1380, civ: 'Mayans', won: false },
        ],
      },
    },
    ...Array.from({ length: 5 }, (_, k) => ({
      matchId: String(4100 + k), won: k < 4, mapName: 'Arabia', myCiv: 'Khmer', myRating: 1380, myRatingDiff: k < 4 ? 12 : -18,
      rawMatch: {
        players: [
          { profileId: 25399083, team: 1, matchRating: 1380, matchRatingDiff: k < 4 ? 12 : -18, civ: 'Khmer', won: k < 4 },
          { profileId: 111, team: 1, matchRating: 1380, civ: 'Franks', won: k < 4 },
          { profileId: 222, team: 2, name: 'LowRival', matchRating: 1330, civ: 'Britons', won: !(k < 4) },
          { profileId: 333, team: 2, name: 'LowAlly', matchRating: 1330, civ: 'Franks', won: !(k < 4) },
        ],
      },
    })),
  ];
  const storedRecords = Array.from({ length: 4 }, (_, k) => ({
    matchId: String(5000 + k),
    profileId: 25399083,
    leaderboardId: 4,
    civ: 'Magyars',
    mapName: 'Arena',
    telemetry: {
      durationSeconds: 1800,
      engineSummary: {
        durationSeconds: 1800,
        self: {
          tcUtilizationDark: 99.4,
          tcUtilizationEarly: 94.0,
          peakEapm: 140 + k * 3,
          peakEapmMinute: 38,
          habits: { townBell: 0, market: 12, attackMove: 6, patrol: 2, move: 400 },
          techProfile: { armyRelevance: { primaryClass: 'cavalry', wellEquipped: true } },
          topUnits: [{ name: 'Caballero', count: 120 }, { name: 'Caballería de exploración', count: 80 }],
          topWorkshops: [{ name: 'Establo', units: 200, count: 6 }],
        },
      },
    },
  }));

  const disc = computeModeDiscoveries({
    modeId: 'rm_team',
    isTeam: true,
    profileId: 25399083,
    isOwnProfile: true,
    ladder: { rating: 1360, peak: 1684, winRate: 56, streak: 4 },
    stats: {
      allCivs: [
        { civ: 'Khmer', civSlug: 'khmer', games: 30, wins: 20, losses: 10, winRate: 67 },
        { civ: 'Persians', civSlug: 'persians', games: 28, wins: 12, losses: 16, winRate: 43 },
      ],
      allMaps: [
        { mapName: 'Lombardia', mapKey: 'lombardia', games: 24, wins: 18, losses: 6, winRate: 75 },
        { mapName: 'Arabia', mapKey: 'arabia', games: 20, wins: 10, losses: 10, winRate: 50 },
      ],
      allies: [
        { profileId: 111, name: 'Aldeano sin telar', games: 20, wins: 13, losses: 7, winRate: 65 },
        { profileId: 112, name: 'Compa Cuesta', games: 20, wins: 8, losses: 12, winRate: 40 },
      ],
      opponents: [
        { profileId: 222, name: 'ClientePro', games: 5, wins: 4, losses: 1, winRate: 80 },
      ],
    },
    insights: { agroShare: 68, boomShare: 18, classifiedCount: 16 },
    eloSeries,
    modeMatches,
    unifiedMatches,
    storedRecords,
  });

  assert.equal(disc.dna.title, 'Señor de los Establos', 'Must derive cavalry archetype from local replays');
  assert.equal(disc.goldenHour.golden.id, 'morning', 'Must detect Morning Golden Hour');
  assert.equal(disc.goldenHour.cursed.id, 'afternoon', 'Must detect Afternoon Cursed Hour');
  assert.equal(disc.trident.secretCiv.civSlug, 'khmer');
  assert.equal(disc.trident.fortressMap.mapKey, 'lombardia');
  assert.equal(disc.trident.nemesis.civSlug, 'huns');
  assert.equal(disc.giantSlayer.biggestUpset.gap, 50, 'TG Giant Slayer must use team-avg ELO gap (1400 - 1350 = +50)');
  assert.equal(disc.speedVsBrain.faster.winRate, 100);
  assert.equal(disc.combatDna.cavalryShare, 100);
  assert.equal(disc.squadAndRivals.bestAlly.name, 'Aldeano sin telar');
  assert.equal(disc.squadAndRivals.roughAlly.name, 'Compa Cuesta');
  assert.ok(disc.trophies.bestWinStreak.count >= 8);

  // Verify central.js engineSummary bugfix unlocks telemetrySummary.avgTcUtilization
  const dash = computeCentralAnalytics({
    profileId: 25399083, alias: 'PSX | Acido', isOwnProfile: true,
    ladder1v1: { rating: 1212, peak: 1212, wins: 21, losses: 11, rank: 12000, rankTotal: 45000 },
    storedRecords,
  });
  assert.equal(dash.telemetrySummary.avgTcUtilization, 94, 'central.js must read telemetry.engineSummary.self');

  // Render full v5 dashboard and assert CSP (0 inline styles) + SVG Radar + Spotlights + multi-word Map Diagnostic lookup
  dash.modes.rm_1v1.discoveries = disc;
  dash.modes.rm_1v1.stats.topMaps = [{ mapName: 'African Clearing', mapKey: 'african clearing', games: 12, wins: 7, losses: 5, winRate: 58 }];
  dash.modes.rm_1v1.mapDiagnostics = {
    'african clearing': {
      ok: true, mapName: 'African Clearing', terrainLabel: 'Nómada / Especial', verdict: 'strength',
      verdictLabel: 'Mapa fuerte', confidenceLabel: 'Confianza media',
      sample: { games: 12, wins: 7, losses: 5, rawWinRate: 58, deltaPp: 8 },
      findings: [], breakdowns: { civs: [], oppOpenings: [], phases: [], pace: {} },
    },
  };
  const html = TacticalUI.renderCentralDashboard(dash, { activeModeId: 'rm_1v1', centralView: 'overview', selectedMapKey: 'africanclearing', isUltra: true });
  assert.match(html, /class="cx-dna-banner/, 'Must render Player DNA Banner');
  assert.match(html, /class="cx-dna-radar-svg"/, 'Must render pure SVG 5-axis DNA radar');
  assert.match(html, /class="cx-spotlight-grid/, 'Must render 3-Card Tactical Trident Spotlights');
  assert.match(html, /cx-circadian-card/, 'Must render Circadian Golden Hour');
  assert.match(html, /cx-trophies-card/, 'Must render Career Trophy Vitrina');
  assert.match(html, /class="cx-speed-gauge-svg"/, 'Must render SVG 180-deg Speed Gauge in Mejora y ELO pane');
  assert.match(html, /id="cxMapDiagPanel"/, 'Multi-word map key (African Clearing -> africanclearing) must resolve Map Diagnostic panel');
  assert.doesNotMatch(html, /\sstyle=/i, 'CSP: Central v5 HTML must contain 0 inline style="" attributes');
});

/* ============================================================================
 * 14. Forensic P0/P1 Fixes, Representative Map Sample Floor, 16 Insights & Postmatch v6 CSP
 * ============================================================================ */
test('14. Forensic P0/P1 fixes, representative map sample floor, 16 AoE2 insights & Postmatch v6 CSP', () => {
  const { parseScoutRows } = require('../src/scout');
  const { analyzeMapPerformance, computePersonalAcademy } = require('../src/central-intel');
  const {
    computeTrident,
    computeTrophies,
    computePlayerDna,
    computeTgRadiography,
    computeLuckyColor,
    computeMirrorAndMeta,
    computeEloComfortAndPatch,
  } = require('../src/central-discoveries');
  const { analyzePostmatchEngine } = require('../src/engine/postmatch-engine');

  // P0-1: parseScoutRows averages oppAvgElo & oppAvgEapm across ALL opponents in TG
  const tgParsed = parseScoutRows({
    rows: {
      match_id: [901, 901, 901],
      won: ['Won', 'Won', 'Won'],
      map: ['Arabia', 'Arabia', 'Arabia'],
      civilization: ['Persians', 'Persians', 'Persians'],
      civilization_opponent: ['Franks', 'Britons', 'Mongols'],
      strategy: ['Scout rush', 'Scout rush', 'Scout rush'],
      strategy_opponent: ['Unknown', 'Archer rush', 'Fast castle'],
      elo: [1300, 1300, 1300],
      elo_opponent: [1200, 1350, 1500],
      mean_eapm: [55, 55, 55],
      mean_eapm_opponent: [30, 45, 60],
      match_duration: [2100, 2100, 2100],
      started_time: ['2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z'],
    },
  });
  assert.equal(tgParsed.length, 1);
  assert.equal(tgParsed[0].oppAvgElo, 1350, 'P0-1: TG oppAvgElo must average all 3 opponents');
  assert.equal(tgParsed[0].oppAvgEapm, 45, 'P0-1: TG oppAvgEapm must average all 3 opponents');
  assert.equal(tgParsed[0].oppStrategy, 'Archer rush', 'P0-1: Must backfill oppStrategy when slot 0 is Unknown');

  // Representative map sample floor: 4 games MUST be insufficient with 0 findings
  const tinyMapMatches = Array.from({ length: 4 }, (_, i) => ({
    matchId: `tm-${i}`, mapName: 'Socotra', mapKey: 'socotra', civ: 'Persians', won: true, myElo: 1200, oppElo: 1200,
  }));
  const tinyDiag = analyzeMapPerformance({ targetMap: 'Socotra', matches: tinyMapMatches, modeId: 'rm_1v1' });
  assert.equal(tinyDiag.status, 'insufficient', '4 games on a map must NEVER be declared ready/expert');
  assert.equal(tinyDiag.findings.length, 0);

  // Trident: NEVER crown 3-4 game map as Fortress Map, and combo MUST match secretCiv
  const trident = computeTrident({
    stats: {
      allCivs: [
        { civ: 'Burgundians', civSlug: 'burgundians', games: 15, wins: 11, losses: 4, winRate: 73 },
        { civ: 'Persians', civSlug: 'persians', games: 15, wins: 9, losses: 6, winRate: 60 },
      ],
      allMaps: [
        { mapName: 'Socotra', mapKey: 'socotra', games: 4, wins: 4, losses: 0, winRate: 100 },
        { mapName: 'Arabia', mapKey: 'arabia', games: 20, wins: 9, losses: 11, winRate: 45 },
      ],
    },
    unifiedMatches: Array.from({ length: 6 }, (_, i) => ({
      matchId: `c-${i}`, won: i < 5, civ: 'Persians', civSlug: 'persians', mapName: 'Arena', mapKey: 'arena',
    })),
    ladder: { winRate: 52 },
  });
  assert.equal(trident.fortressMap, null, '4-game 100% map must NOT be crowned Fortress Map');
  assert.equal(trident.secretCiv.civSlug, 'burgundians');
  assert.equal(trident.secretCiv.combo, null, 'P0-5: Burgundians Arma Secreta must NOT display Persians Arena combo');

  // P0-3: Global trophies must NEVER fuse two ladders into one session
  const baseT = Date.UTC(2026, 10, 20, 12, 0, 0);
  const trophiesGlobal = computeTrophies({
    eloSeries: [],
    modeEloSeriesMap: {
      ew_1v1: {
        label: 'EW 1v1', streak: 0,
        series: Array.from({ length: 6 }, (_, i) => ({ startedAt: baseT + i * 15 * 60_000, rating: 1000 + (i + 1) * 15, diff: 15, won: true })),
      },
      rm_1v1: {
        label: 'RM 1v1', streak: 0,
        series: Array.from({ length: 5 }, (_, i) => ({ startedAt: baseT + i * 15 * 60_000 + 60_000, rating: 1300 + (i + 1) * 10, diff: 10, won: true })),
      },
    },
    unifiedMatches: [],
    stats: { allCivs: [] },
    ladder: {},
  });
  assert.equal(trophiesGlobal.bestSession.modeLabel, 'EW 1v1');
  assert.equal(trophiesGlobal.bestSession.toElo - trophiesGlobal.bestSession.fromElo, trophiesGlobal.bestSession.netElo, 'P0-3: Session arithmetic must be exact');

  // P0-4 & P1-4: Empire Wars DNA & Academy must NEVER show Dark Age / TC Alta Edad, and TC idle improvement has ▼ arrow
  const ewDna = computePlayerDna({
    modeId: 'ew_1v1',
    stats: { allCivs: [{ civ: 'Ethiopians', games: 30, wins: 18, losses: 12, winRate: 60 }] },
    combatDna: { isModeExact: false, sample: 8, tcDarkAvg: 99.6, tcEarlyAvg: 94, cavalryShare: 95 },
  });
  assert.notEqual(ewDna.title, 'Señor de los Establos', 'P0-4: Non-mode-exact RM Team replays must not hijack EW DNA');
  assert.ok(!ewDna.signals.some((s) => /Alta Edad/i.test(s.label)), 'P0-4: EW must never display TC Alta Edad');

  const mkRec = (idx, idle) => ({
    profileId: 1, startedAt: baseT - idx * 3600_000,
    telemetry: {
      engineSummary: {
        durationSeconds: 1200,
        stages: [
          { id: 'dark', status: 'ready', score: 90 },
          { id: 'feudal', status: 'ready', score: 80 },
          { id: 'castle', status: 'ready', score: 75 },
        ],
        self: { tcIdleDarkSeconds: idle, tcIdleFeudalPerTcSeconds: 0, eapm: 50, habits: { townBell: 0, attackMove: 5, patrol: 2 } },
      },
    },
  });
  const ewAcad = computePersonalAcademy({
    storedRecords: [mkRec(0, 40), mkRec(1, 40), mkRec(2, 80), mkRec(3, 80)],
    profileId: 1, isOwnProfile: true, modeId: 'ew_1v1', isFallbackScope: true,
  });
  assert.ok(!ewAcad.stageEvolution.some((s) => s.id === 'dark'), 'P0-4: EW Academy must omit Alta Edad Media');
  const tcHabit = ewAcad.habits.find((h) => h.id === 'tc_idle');
  assert.equal(tcHabit.deltaArrow, '▼', 'P1-4: Lower TC idle must use ▼ arrow');
  assert.equal(tcHabit.improved, true);

  // New Central insights: TG Radiography (Pocket vs Flank) + Lucky Color + Mirror/Meta + Comfort/Patch
  const tgMatches = Array.from({ length: 8 }, (_, i) => ({
    won: i < 6,
    players: [
      { profileId: 1, team: 1, color: 3, civ: 'Persians', matchRating: 1450 },
      { profileId: 2, team: 1, color: 1, civ: 'Britons', matchRating: 1300 },
      { profileId: 3, team: 1, color: 5, civ: 'Mayans', matchRating: 1320 },
      { profileId: 4, team: 2, color: 2, civ: 'Franks', matchRating: 1350 },
      { profileId: 5, team: 2, color: 4, civ: 'Mongols', matchRating: 1360 },
      { profileId: 6, team: 2, color: 6, civ: 'Khmer', matchRating: 1340 },
    ],
  }));
  const tgRadio = computeTgRadiography(tgMatches, { profileId: 1 });
  assert.equal(tgRadio.pocket.games, 8, 'Color 3 between 1 and 5 must be detected as Pocket');
  assert.equal(tgRadio.carry.games, 8, 'Highest ELO on team must be detected as Carry');

  const lc = computeLuckyColor([
    ...tgMatches,
    ...Array.from({ length: 6 }, () => ({ won: false, players: [{ profileId: 1, color: 4 }] })),
  ], { profileId: 1 });
  assert.equal(lc.lucky.name, 'Verde');
  assert.equal(lc.cursed.name, 'Amarillo');

  const mm = computeMirrorAndMeta([
    ...Array.from({ length: 5 }, (_, i) => ({ won: i < 4, civSlug: 'franks', oppCivSlug: 'franks', opponents: [{ civSlug: 'franks' }] })),
    ...Array.from({ length: 5 }, (_, i) => ({ won: i < 2, civSlug: 'persians', oppCivSlug: 'sicilians', opponents: [{ civSlug: 'sicilians' }] })),
  ]);
  assert.equal(mm.mirror.games, 5);
  assert.equal(mm.mirror.winRate, 80);

  const ecp = computeEloComfortAndPatch({
    fullRatingSeries: Array.from({ length: 20 }, (_, i) => ({ rating: 1200 + i * 10 })),
    unifiedMatches: Array.from({ length: 5 }, () => ({ won: true, patch: 188329, civ: 'Persians' })),
    ladder: { rating: 1390, peak: 1450 },
  });
  assert.ok(ecp.comfort.p20 < ecp.comfort.p80);
  assert.equal(ecp.patches[0].patch, 188329);

  // Postmatch v6 insights + Epic Match Plaques + strict CSP (0 inline styles)
  const syntheticOps = [
    { Chat: JSON.stringify({ player: 1, tauntNumber: 11, message: '11 gg wp' }) },
    { Action: { world_time: 50_000, action_data: { DeQueue: { player_id: 1, unit_id: 83, amount: 1, building_ids: [10] } } } },
    { Action: { world_time: 180_000, action_data: { DeQueue: { player_id: 1, unit_id: 83, amount: 2, building_ids: [10] } } } },
    { Action: { world_time: 400_000, action_data: { Flare: { player_id: 1 } } } },
    { Action: { world_time: 650_000, action_data: { Resign: { player_id: 2 } } } },
  ];
  const engOut = analyzePostmatchEngine(syntheticOps, {
    selfSlot: 1, rivalSlot: 2, selfCiv: 'Persians', rivalCiv: 'Franks',
    durationMs: 700_000, isTeamGame: true, teamRole: 'pocket', won: true,
  });
  assert.ok(engOut.postmatchInsights.ghostVillagers, 'Postmatch must compute Aldeanos Fantasma');
  assert.equal(engOut.postmatchInsights.tgRoleEval.role, 'pocket', 'Postmatch must evaluate Pocket/Flank TG role');
  assert.equal(engOut.postmatchInsights.replayChronicle.laugh11, 1, 'Postmatch must detect taunt 11 in Chat');

  const rmHtml = TacticalUI.renderRecentMatchesList([
    { matchId: '1', mapName: 'Arabia', myCiv: 'Persians', rivalCiv: 'Franks', rivalName: 'HANK_I', myRating: 1212, myRatingDiff: 17, won: true, durationSeconds: 1500, modeLabel: 'RM 1v1', hasTelemetry: true },
  ], { selectedMatchId: '1' });
  assert.match(rmHtml, /rm-epic/, 'Must render Epic Match Plaque');
  assert.match(rmHtml, /rm-vs-medallion/, 'Must render VS medallion clash');
  assert.doesNotMatch(rmHtml, /\sstyle=/i, 'CSP: Epic Match Plaques must have 0 inline styles');

  const pmHtml = TacticalUI.renderPostMatch({
    context: { mapName: 'Arabia', civ: 'Persians', mode: { label: 'RM Team', size: 'team' } },
    result: { status: 'won', label: 'Victoria', ratingDiff: 16, durationSeconds: 1500 },
    engine: { ...engOut, rivalCiv: 'Franks', rivalName: 'HANK_I' },
  }, { comparison: true, compareMode: 'both', replay: true });
  assert.match(pmHtml, /pm-hero-v6/, 'Must render Postmatch v6 Hero Banner');
  assert.match(pmHtml, /pm-insights-v6/, 'Must render 8 new Postmatch insights section');
  assert.match(pmHtml, /ALDEANOS FANTASMA/, 'Must render Ghost Villagers card');
  assert.doesNotMatch(pmHtml, /\sstyle=/i, 'CSP: Postmatch v6 HTML must contain 0 inline style="" attributes');
});

/* ============================================================================
 * 15. Deep Coherence v6: Companion-First Left-Join, 200-Match Delta Sync,
 *     Nomad/Closed AoE2 Guards, Paired Clocks & Free/Pro/Ultra Window Tiering
 * ============================================================================ */
test('15. Companion-First Left-Join, 200-match Delta Sync, AoE2 domain guards & Free/Pro/Ultra sample windows', () => {
  const { mergeRawMatches } = require('../src/central');
  const { buildUnifiedModeMatches } = require('../src/civ-diagnostic');
  const { computeWinLossClocks, computeCivMasteryHistory, computeTgRadiography } = require('../src/central-discoveries');

  // A. mergeRawMatches Delta Sync preserves older settled matches up to 200 and updates fresh settled fields
  const cached150 = Array.from({ length: 150 }, (_, i) => ({
    matchId: String(1000 + i),
    startedAt: (1000 + i) * 1000,
    won: i % 2 === 0,
  }));
  const fresh60 = Array.from({ length: 60 }, (_, i) => ({
    matchId: String(1100 + i),
    startedAt: (1100 + i) * 1000,
    won: true,
    ratingDiff: 15,
  }));
  const merged200 = mergeRawMatches(fresh60, cached150, 200);
  assert.equal(merged200.length, 160, 'Delta Sync must union 100 older + 60 fresh matches without truncation below 200');
  assert.equal(merged200[0].matchId, '1159', 'Must sort newest first');
  assert.equal(merged200[0].ratingDiff, 15, 'Fresh entry must overwrite cached entry for same matchId');

  // B. Companion-First Left-Join: orphan AoE2Insights rows never pollute official match count or winrate
  const comp10 = Array.from({ length: 10 }, (_, i) => ({
    matchId: String(2000 + i),
    startedAt: (2000 + i) * 1000,
    won: i < 5, // 50% official WR
    myCiv: 'Magyars',
    rivalCiv: 'Franks',
    mapName: 'Arabia',
    myRating: 1300,
    rivalRating: 1300,
    myRatingDiff: i < 5 ? 16 : -16,
  }));
  const biasedIns = [
    { matchId: '2000', civ: 'Magyars', oppCiv: 'Franks', map: 'Arabia', won: true, strategy: 'Scout rush', meanEapm: 55 },
    ...Array.from({ length: 30 }, (_, i) => ({
      matchId: String(9000 + i), // orphan Insights-only wins
      civ: 'Magyars', oppCiv: 'Franks', map: 'Arabia', won: true, strategy: 'Fast castle', meanEapm: 60,
    })),
  ];
  const strictPool = buildUnifiedModeMatches({
    companionMatches: comp10,
    insightsRows: biasedIns,
    strictLeftJoin: true,
  });
  assert.equal(strictPool.length, 10, 'Strict Left-Join must keep exact 10 official Companion matches and drop 30 orphan Insights rows');
  assert.equal(strictPool.filter((m) => m.won).length, 5, 'Official 50% winrate must not be inflated by orphan Insights wins');
  assert.equal(strictPool.find((m) => m.matchId === '2000').myOpening, 'Scout rush', 'Matching matchId must still left-join opening and eAPM from Insights');

  // C. Nomad-start maps (African Clearing) excluded from Pocket vs Flank color positions
  const nomadTg = Array.from({ length: 8 }, (_, i) => ({
    won: true,
    mapName: i < 4 ? 'African Clearing' : 'Arabia',
    players: [
      { profileId: 1, team: 1, color: 3, civ: 'Persians', matchRating: 1400 },
      { profileId: 2, team: 1, color: 1, civ: 'Britons', matchRating: 1350 },
      { profileId: 3, team: 1, color: 5, civ: 'Mayans', matchRating: 1350 },
      { profileId: 4, team: 2, color: 2, civ: 'Franks', matchRating: 1350 },
      { profileId: 5, team: 2, color: 4, civ: 'Mongols', matchRating: 1350 },
      { profileId: 6, team: 2, color: 6, civ: 'Khmer', matchRating: 1350 },
    ],
  }));
  const nomadRadio = computeTgRadiography(nomadTg, { profileId: 1 });
  assert.equal(nomadRadio.sample, 8);
  assert.equal(nomadRadio.pocket, null, '4 Arabia games (<5 minRole) after excluding 4 African Clearing Nomad games must not emit noisy Pocket WR');

  // D. winLossClocks per-metric paired sample guard (n=1 win in Castle Age must not emit deltaSec)
  const clockRecs = Array.from({ length: 5 }, (_, i) => ({
    profileId: 1,
    leaderboardId: 4,
    won: i === 0, // 1 win, 4 losses
    telemetry: {
      durationSeconds: 1800,
      engineSummary: {
        durationSeconds: 1800,
        self: {
          timings: {
            feudalSeconds: 600 + i * 10,
            castleSeconds: i === 0 ? 2094 : 1400 + i * 20,
          },
        },
      },
    },
  }));
  const clocksOut = computeWinLossClocks(clockRecs, { modeId: 'rm_team', profileId: 1, isOwnProfile: true });
  const castleMetric = clocksOut.metrics.find((m) => m.id === 'castle');
  assert.equal(castleMetric.deltaSec, null, '1 win vs 4 losses in Castle Age must not emit misleading V vs D deltaSec');
  assert.equal( computeWinLossClocks(clockRecs, { modeId: 'ew_1v1', profileId: 1, isOwnProfile: true }), null, 'RM Team replays must never leak into EW 1v1 clocks');

  // E. civMasteryHistory requires >=3 masteryGames and divides siegePct only by Castle-Age games
  const cmhRecs = Array.from({ length: 4 }, (_, i) => ({
    profileId: 1,
    leaderboardId: 4,
    telemetry: {
      durationSeconds: 1500,
      engineSummary: {
        durationSeconds: 1500,
        civMastery: i === 0 ? { leveraged: ['Bonus 1'], missed: [] } : null,
        self: {
          timings: { castleSeconds: i < 3 ? 1200 : null }, // only 3 reached Castle Age
          topUnits: [{ name: 'Caballero', count: 20 }],
          topWorkshops: i === 0 ? [{ name: 'Taller de maquinaria de asedio', count: 1 }] : [],
        },
      },
    },
  }));
  const cmhOut = computeCivMasteryHistory(cmhRecs, { modeId: 'rm_team', profileId: 1, isOwnProfile: true });
  assert.equal(cmhOut.utilizationPct, null, '1 single mastery game must not render a 100% mastery ring');
  assert.equal(cmhOut.castleReachedGames, 3);
  assert.equal(cmhOut.siegePct, 33, '1 siege game out of 3 Castle-Age games must be 33%, not 25%');
});

Promise.all(pending).then(() => {
  console.log(`\napi-and-central-intel-test: all ${passed} suites passed!`);
});
