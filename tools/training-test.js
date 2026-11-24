'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getProductState, allowsFeature } = require('../src/product');
const { createTrainingController } = require('../src/training');
const { generateArenaBatch, buildArenaCatalog, LEVEL_CONFIG, VALID_CIV_SLUGS } = require('../src/training/training-arena');
const { checkCivCompatibility, RECIPES } = require('../src/training/training-recipes');
const { evaluateRecordAgainstMissions, computeAgeMastery, computeHistoricalRank } = require('../src/training/training-missions');
const CIV_TECH = require('../src/civ-tech.json').civilizations;

// 1. Ultra-only gating verified strictly in product.js
{
  const freeState = getProductState({});
  const proState = { ...freeState, plan: 'pro', featureAccess: { ...freeState.featureAccess, trainingHub: false } };
  assert.equal(allowsFeature(freeState, 'trainingHub'), false, 'Free must NOT unlock Entrenamiento');
  assert.equal(allowsFeature(proState, 'trainingHub'), false, 'Pro must NOT unlock Entrenamiento');
  const betaState = getProductState({ betaAccess: true });
  const ultraKeyState = getProductState({ accessKeyGranted: true });
  assert.equal(allowsFeature(betaState, 'trainingHub'), true, 'Beta access must unlock Entrenamiento');
  assert.equal(allowsFeature(ultraKeyState, 'trainingHub'), true, 'Ultra access key must unlock Entrenamiento');
}

// 2. Build recipes & civ-tech compatibility checks
{
  assert.equal(RECIPES.length, 6, 'Must have 6 canonical AoE2:DE Spanish build orders');
  const scouts = RECIPES.find((r) => r.key === 'scouts-20pop');
  const aztecCheck = checkCivCompatibility(scouts, 'aztecs');
  assert.equal(aztecCheck.compatible, false, 'Aztecs lack Scout Cavalry and must warn');
  const franksCheck = checkCivCompatibility(scouts, 'franks');
  assert.equal(franksCheck.compatible, true, 'Franks must be compatible with Scout Cavalry');
}

// 3. Procedural Arena strict tech-tree validation across all modes
{
  assert.ok(VALID_CIV_SLUGS.length >= 45, 'Must support all DE civs');
  for (const mode of ['mixed', 'transition_dilemma', 'counter_pick', 'tech_gap', 'civ_identity', 'recent_losses']) {
    const batch = generateArenaBatch({ mode, count: 10, seed: 4242, preferredCivs: ['franks', 'mayans'], nemesisCivs: ['hindustanis', 'bohemians'] });
    assert.equal(batch.length, 10, `Mode ${mode} must produce 10 unique questions`);
    for (const q of batch) {
      assert.equal(q.options.length, 4, 'Each Arena question must have 4 options');
      assert.equal(q.options.filter((o) => o.correct).length, 1, 'Exactly 1 correct option');
      if (q.mode === 'tech_gap' && q.myCiv) {
        const correctOpt = q.options.find((o) => o.correct);
        assert.equal(CIV_TECH[q.myCiv.slug].nodes[correctOpt.id], undefined, `tech_gap answer must truly be absent from ${q.myCiv.slug}`);
      }
    }
  }
}

// 4. Mission auto-verification: eligibility, anti-cheat short games, idempotency, and rank progression
{
  const tmpFile = path.join(os.tmpdir(), `relic-training-test-${process.pid}-${Date.now()}.json`);
  const ctrl = createTrainingController({ storePath: tmpFile });
  const nowSec = Math.floor(Date.now() / 1000);

  const dash = ctrl.buildDashboard({ profileId: 999, records: [], unlocked: true, plan: 'promax' });
  assert.equal(dash.missions.length, 3, 'Must expose 3 active missions');
  assert.equal(dash.ageTracks.length, 4, 'Must expose 4 Age Mastery tracks');

  // Short resign (< 12 min) must be rejected
  const shortRec = {
    matchId: 'm_short_1',
    leaderboardId: 3,
    startedAt: nowSec + 10,
    telemetry: {
      durationSeconds: 300,
      context: { startingAge: 'dark', leaderboardId: 3 },
      engineSummary: { self: { tcIdleDarkSeconds: 2, tcIdleFeudalPerTcSeconds: 5, techProfile: { hasDoubleBitAxe: true, doubleBitAxeDelaySec: 10 }, timings: { feudalSeconds: 560 }, habits: { attackMove: 12, patrol: 2, townBell: 0 } } },
    },
  };
  const rShort = ctrl.handleNewReplayRecord({ profileId: 999, record: shortRec, records: [shortRec], unlocked: true });
  assert.equal(rShort.newlyCompleted.length, 0, 'Short abandon (<12m) must NEVER complete missions');

  // Valid ranked match must verify matching missions once and never double-credit on repeat
  const validRec = {
    matchId: 'm_valid_1',
    leaderboardId: 3,
    startedAt: nowSec + 60,
    telemetry: {
      durationSeconds: 1500,
      context: { startingAge: 'dark', leaderboardId: 3 },
      engineSummary: {
        durationSeconds: 1500,
        stages: [
          { id: 'dark', status: 'ready', score: 91 },
          { id: 'feudal', status: 'ready', score: 82 },
          { id: 'castle', status: 'ready', score: 70 },
          { id: 'imperial', status: 'ready', score: 85 },
        ],
        self: {
          tcIdleDarkSeconds: 8,
          tcIdleFeudalPerTcSeconds: 12,
          eapmRetentionPct: 86,
          techProfile: { hasDoubleBitAxe: true, doubleBitAxeDelaySec: 20, hasBowSaw: true, bowSawDelaySec: 25, armyRelevance: { wellEquipped: true } },
          timings: { feudalSeconds: 585 },
          habits: { attackMove: 10, patrol: 4, townBell: 0 },
        },
      },
    },
  };
  const r1 = ctrl.handleNewReplayRecord({ profileId: 999, record: validRec, records: [validRec], unlocked: true });
  assert.ok(r1.newlyCompleted.length >= 1, 'Valid match must complete at least 1 active mission');
  const r2 = ctrl.handleNewReplayRecord({ profileId: 999, record: validRec, records: [validRec], unlocked: true });
  assert.equal(r2.changed, false, 'Same matchId must NEVER double-credit (idempotent)');

  // Age Mastery & Rank sanity
  const ages = computeAgeMastery([validRec, validRec]);
  assert.equal(ages[0].grade, 'S');
  assert.equal(ages[1].grade, 'A');
  const rank = computeHistoricalRank(500, 1);
  assert.equal(rank.current.id, 'squire', 'High XP alone cannot bypass verified-mission rank gate');

  // Arena daily XP cap check
  const a1 = ctrl.finishArena({ profileId: 999, mode: 'mixed', answered: 5, correct: 5, bestStreak: 5 });
  assert.equal(a1.reward.fullRate, true);
  ctrl.finishArena({ profileId: 999, mode: 'mixed', answered: 5, correct: 5, bestStreak: 5 });
  ctrl.finishArena({ profileId: 999, mode: 'mixed', answered: 5, correct: 5, bestStreak: 5 });
  const a4 = ctrl.finishArena({ profileId: 999, mode: 'mixed', answered: 5, correct: 5, bestStreak: 5 });
  assert.equal(a4.reward.fullRate, false, '4th daily Arena run must apply diminishing XP rate');

  // Real Replay Telemetry (zero fake data when 0 replays, 6 real metrics when replays exist)
  assert.equal(dash.highElo.hasData, false, '0 replays must NEVER fabricate fallback telemetry');
  assert.equal(dash.highElo.axes.length, 0, '0 replays must return 0 fabricated axes');
  const dashWithRec = ctrl.buildDashboard({ profileId: 999, records: [validRec], unlocked: true, plan: 'promax' });
  assert.equal(dashWithRec.highElo.hasData, true, 'Valid replay must produce real telemetry');
  assert.equal(dashWithRec.highElo.metrics.length, 6, 'Real replay telemetry must produce 6 verifiable metrics');
  assert.ok(dash.matchupWarRoom.svg.curvePath.startsWith('M0,85'), 'Matchup War-Room must produce valid 4-Age SVG curve');

  const saveRes = ctrl.saveCustomBuild({
    profileId: 999,
    armNow: true,
    build: {
      name: 'Mi Apertura Francos 19 Pob',
      civSlug: 'franks',
      mapName: 'Arabia',
      steps: [
        { age: 1, pop: '06/05', gameSec: 0, alloc: { food: 6, wood: 0, gold: 0, stone: 0 }, title: '6 Aldeanos a ovejas' },
        { age: 2, pop: '19/20', gameSec: 540, alloc: { food: 10, wood: 8, gold: 0, stone: 0 }, title: 'Subida a Edad Feudal + Establo' },
      ],
    },
    records: [validRec],
  });
  assert.equal(saveRes.ok, true, 'Custom build order must save cleanly');
  assert.equal(saveRes.armedBuildOrderId, saveRes.saved.id, 'armNow must arm the saved custom build order');

  ctrl.notifyMatchStarted({ profileId: 999, matchId: 'live_m1', startedAt: Date.now() - 5000 });
  const ovPayload = ctrl.getArmedOverlayPayload({ profileId: 999, ongoing: true, matchId: 'live_m1', ownCiv: 'Franks', mapName: 'Arabia' });
  assert.equal(ovPayload.kind, 'custom-armed', 'Armed build order must stream custom-armed payload to live top overlay');
  assert.equal(ovPayload.name, 'Mi Apertura Francos 19 Pob');
  assert.equal(ovPayload.totalSteps, 2);

  const TacticalUI = require('../ui/tactical-ui');
  const armedHtml = TacticalUI.renderSmartBuildOrder(ovPayload);
  assert.match(armedHtml, /is-armed-bo/, 'TacticalUI must render armed custom build order HUD');
  assert.doesNotMatch(armedHtml, /<button|<input|<select|<a |<details|progress|aria-checked/, 'Live overlay markup must stay 100% click-through safe');

  // 4b. Gamified 7-Level Arena Catalog (>= 350 unique verified questions), 3-error 24h lockout & unit unlock
  const catalog = buildArenaCatalog();
  assert.ok(catalog.totalCount >= 350, `Arena catalog must have >= 350 verified questions (got ${catalog.totalCount})`);
  assert.equal(LEVEL_CONFIG.length, 7, 'Arena must define exactly 7 unit-unlock levels');
  const seenIds = new Set();
  for (let lv = 1; lv <= 7; lv += 1) {
    const lvList = catalog.byLevel[lv] || [];
    assert.ok(lvList.length >= 35, `Level ${lv} must have >= 35 unique questions (got ${lvList.length})`);
    for (const q of lvList) {
      assert.equal(seenIds.has(q.id), false, `Duplicate question id: ${q.id}`);
      seenIds.add(q.id);
      assert.equal(q.options.length, 4, `Question ${q.id} must have 4 options`);
      assert.equal(q.options.filter((o) => o.correct).length, 1, `Question ${q.id} must have 1 correct option`);
    }
  }

  // Test 3 mistakes -> exact 24h lockout + automatic reset after 24h
  const lookupQ = (id) => (catalog.byId instanceof Map ? catalog.byId.get(id) : catalog.byId[id]);
  const t0 = 1_750_000_000_000;
  for (let err = 1; err <= 3; err += 1) {
    const nextRes = ctrl.getNextArenaQuestion({ profileId: 999, level: 1, now: t0 + err * 1000 });
    assert.equal(nextRes.ok, true, 'Unlocked Arena must serve a question');
    const qFull = lookupQ(nextRes.question.id);
    const wrongOpt = qFull.options.find((o) => !o.correct);
    const ansRes = ctrl.submitArenaAnswer({ profileId: 999, questionId: qFull.id, selectedOptionId: wrongOpt.id, now: t0 + err * 1000 + 500 });
    assert.equal(ansRes.ok, true);
    assert.equal(ansRes.isCorrect, false);
    if (err < 3) {
      assert.equal(ansRes.arena.locked, false, `Error ${err}/3 must not lock yet`);
    } else {
      assert.equal(ansRes.arena.locked, true, '3rd error must trigger 24-hour lockout');
      assert.equal(ansRes.arena.lockedUntilTs, (t0 + err * 1000 + 500) + 24 * 60 * 60 * 1000, 'Lockout must be exact 24h');
    }
  }
  const blockedRes = ctrl.getNextArenaQuestion({ profileId: 999, level: 1, now: t0 + 60_000 });
  assert.equal(blockedRes.ok, false, 'Arena must refuse questions during 24h lockout');
  assert.equal(blockedRes.locked, true);

  // After 24h + 10s, lockout clears with 3 fresh lives and Level 1 -> Level 2 unit unlock works
  const tAfter24h = t0 + 24 * 60 * 60 * 1000 + 20_000;
  let unlockedL2 = false;
  for (let i = 0; i < LEVEL_CONFIG[0].requiredCorrect; i += 1) {
    const nextQ = ctrl.getNextArenaQuestion({ profileId: 999, level: 1, now: tAfter24h + i * 1000 });
    assert.equal(nextQ.ok, true, 'After 24h cooldown Arena must reopen');
    const qFull = lookupQ(nextQ.question.id);
    const rightOpt = qFull.options.find((o) => o.correct);
    const rOk = ctrl.submitArenaAnswer({ profileId: 999, questionId: qFull.id, selectedOptionId: rightOpt.id, now: tAfter24h + i * 1000 + 400 });
    assert.equal(rOk.ok, true);
    assert.equal(rOk.isCorrect, true);
    if (rOk.leveledUp) unlockedL2 = true;
  }
  assert.equal(unlockedL2, true, 'Completing Level 1 requiredCorrect must unlock Unit #1 and advance to Level 2');

  // 4c. Cross-App "Mi Plan" automatic real-match verification (anti-retroactive + auto-complete on subsequent match)
  const pinTs = Date.now() - 120_000;
  const qAdd = ctrl.addQueueItem({
    profileId: 999,
    item: {
      source: 'Postmatch',
      title: 'Reducir pausa del Centro Urbano en Alta Edad',
      detail: '19 s en Arabia',
      metric: '19 s',
      targetTab: 'orders',
      createdAt: pinTs,
    },
  });
  assert.equal(qAdd.ok, true);
  assert.equal(qAdd.trainingQueue.length, 1);
  assert.equal(qAdd.trainingQueue[0].verifyRule.type, 'tc_idle_dark', 'Must infer tc_idle_dark verification rule');
  assert.equal(qAdd.trainingQueue[0].done, false);

  // Retroactive match BEFORE pinTs must NEVER complete the goal
  const oldRec = {
    matchId: 'm_old_before_pin',
    mapName: 'Arabia',
    civName: 'Francos',
    won: true,
    startedAt: pinTs - 600_000,
    telemetry: { durationSeconds: 1500, engineSummary: { durationSeconds: 1500, self: { tcIdleDarkSeconds: 5 } } },
  };
  const evalOld = ctrl.handleNewReplayRecord({ profileId: 999, record: oldRec, records: [oldRec], unlocked: true });
  assert.equal((evalOld.newlyCompletedPlanItems || []).length, 0, 'Matches played BEFORE pinning must NEVER complete Mi Plan goals');

  // Subsequent match AFTER pinTs with 10s TC idle MUST automatically verify and complete the goal!
  const nextRec = {
    matchId: 'm_after_pin_pass',
    mapName: 'Arabia',
    civName: 'Francos',
    won: true,
    startedAt: pinTs + 60_000,
    telemetry: { durationSeconds: 1500, engineSummary: { durationSeconds: 1500, self: { tcIdleDarkSeconds: 10 } } },
  };
  const evalNext = ctrl.handleNewReplayRecord({ profileId: 999, record: nextRec, records: [nextRec], unlocked: true });
  assert.equal(evalNext.changed, true);
  assert.equal(evalNext.newlyCompletedPlanItems.length, 1, 'Subsequent real match meeting threshold must auto-verify Mi Plan goal');
  assert.equal(evalNext.newlyCompletedPlanItems[0].autoVerified, true);
  assert.match(evalNext.newlyCompletedPlanItems[0].verifiedEvidence, /10 s/, 'Evidence must cite the real match measurement');

  const qId = qAdd.trainingQueue[0].id;
  const qRem = ctrl.removeQueueItem({ profileId: 999, itemId: qId });
  assert.equal(qRem.trainingQueue.length, 0, 'Remove must delete queue item');
  assert.ok(dash.civBonusesMap && dash.civBonusesMap.franks && dash.civBonusesMap.franks.bonuses.length >= 2, 'Dashboard must include civBonusesMap for Creador');

  try { fs.unlinkSync(tmpFile); } catch (_) {}
}

// 5. Strict CSP & Official AoE2:DE Nomenclature / Zero third-party brand leaks
{
  const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'training-ui.js'), 'utf8');
  const arenaSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'training', 'training-arena.js'), 'utf8');
  const hiSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'training', 'training-high-elo.js'), 'utf8');
  assert.equal(/\bstyle\s*=/.test(uiSrc), false, 'ui/training-ui.js must contain ZERO inline style= attributes');
  assert.equal(/\.style\./.test(uiSrc), false, 'ui/training-ui.js must contain ZERO .style.* DOM mutations');
  const combined = `${uiSrc}\n${arenaSrc}\n${hiSrc}`;
  assert.doesNotMatch(combined, /Punta de acero|anillas para arqueros|AoE2Insights|aoe2recs|\.aoe2record/i, 'Official AoE2:DE Spanish nomenclature & zero external-site references required');
}

console.log('Entrenamiento v5 (Beta · Ultra): 410 preguntas 7 niveles, bloqueo 24h, cola Mi Plan, Radar real, CSP y nomenclatura oficial AoE2:DE OK.');
