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

// 6. Exhaustive 56x55 = 3,080 Matchup Pairs Audit (Antisymmetry, Pixel-Mirror SVG, Tech-Tree Legality, Unique Units, Non-Forced Comps)
{
  const CIV_TECH = require('../src/civ-tech.json').civilizations;
  const { CIV_MATCHUP_PROFILES } = require('../src/training/civ-matchup-profiles');
  const { computeMatchupWarRoom } = require('../src/training/training-high-elo');
  const slugs = Object.keys(CIV_TECH).filter((s) => Boolean(CIV_TECH[s]?.nodes));
  assert.equal(slugs.length, 56, 'Expected all 56 standard AoE2:DE civilizations in civ-tech.json');
  for (const s of slugs) {
    assert.ok(CIV_MATCHUP_PROFILES[s], `Missing matchup profile for ${s}`);
    const uuNode = CIV_MATCHUP_PROFILES[s].uniqueUnit?.node;
    assert.ok(uuNode && CIV_TECH[s].nodes[uuNode] != null, `Unique Unit node "${uuNode}" must exist in civ-tech.json for ${s}`);
  }

  const cache = new Map();
  let feudalSingle = 0;
  let feudalMix = 0;
  let uuRecommended = 0;

  for (const a of slugs) {
    for (const b of slugs) {
      if (a === b) continue;
      const res = computeMatchupWarRoom({ myCivSlug: a, rivalCivSlug: b });
      cache.set(`${a}|${b}`, res);
      assert.ok(res.myCiv.uniqueUnit && res.rivalCiv.uniqueUnit, `Both sides must expose uniqueUnit for ${a} vs ${b}`);
      for (const g of res.gameplanByAge) {
        const nodes = CIV_TECH[a].nodes;
        if (g.primaryNode) {
          assert.ok(nodes[g.primaryNode] != null && nodes[g.primaryNode] <= g.age, `Illegal primaryNode ${g.primaryNode} for ${a} in age ${g.age}`);
        }
        if (g.complementNode) {
          assert.ok(nodes[g.complementNode] != null && nodes[g.complementNode] <= g.age, `Illegal complementNode ${g.complementNode} for ${a} in age ${g.age}`);
        }
        if (a === 'gurjaras') {
          assert.notEqual(g.primaryNode, 'Scout Cavalry', 'Gurjaras must use Camel Scout, never Scout Cavalry');
          assert.notEqual(g.complementNode, 'Scout Cavalry', 'Gurjaras must use Camel Scout, never Scout Cavalry');
        }
        if (g.age === 4) {
          assert.notEqual(g.primaryNode, 'Monk', `Pure Monk must never be Imperial closing condition (${a} vs ${b})`);
        }
        if (g.age === 2) {
          if (g.complementNode) feudalMix += 1; else feudalSingle += 1;
        }
        const uuNode = CIV_MATCHUP_PROFILES[a].uniqueUnit.node;
        if (g.age >= 3 && (g.primaryNode === uuNode || g.complementNode === uuNode)) uuRecommended += 1;
      }
    }
  }

  assert.equal(cache.size, 3080, 'Must evaluate all 56x55 = 3,080 directed pairs');
  assert.ok(feudalSingle >= 1000 && feudalMix >= 400, `Feudal plans must balance focused openings (${feudalSingle}) and reactive mixes (${feudalMix}) without forcing`);
  assert.ok(uuRecommended >= 800, `Unique Units must actively participate across matchups (got ${uuRecommended})`);

  for (let i = 0; i < slugs.length; i += 1) {
    for (let j = i + 1; j < slugs.length; j += 1) {
      const ab = cache.get(`${slugs[i]}|${slugs[j]}`);
      const ba = cache.get(`${slugs[j]}|${slugs[i]}`);
      for (const age of [1, 2, 3, 4]) {
        assert.equal(ab.ageEdgeScores[age] + ba.ageEdgeScores[age], 0, `Exact antisymmetry failed for ${slugs[i]} vs ${slugs[j]} age ${age}`);
      }
      for (let k = 0; k < 4; k += 1) {
        assert.equal(ab.svg.nodes[k].cy + ba.svg.nodes[k].cy, 170, `Exact SVG pixel mirror failed for ${slugs[i]} vs ${slugs[j]} node ${k}`);
      }
    }
  }

  // Golden AoE2:DE pro sanity checks
  const frVsHi = cache.get('franks|hindustanis');
  const hiVsFr = cache.get('hindustanis|franks');
  assert.ok(hiVsFr.ageEdgeScores[3] > 0 && frVsHi.ageEdgeScores[3] < 0, 'Hindustanis must hold Castle Age edge over Franks');
  assert.match(hiVsFr.gameplanByAge[2].bestLine, /Camello imperial/i, 'Hindustanis Imperial plan vs Franks must feature Camello imperial');

  const goVsBr = cache.get('goths|britons');
  assert.match(goVsBr.gameplanByAge[1].bestLine, /Huscarle/i, 'Goths Castle Age plan vs Britons must feature Huscarle');

  const brVsGo = cache.get('britons|goths');
  assert.doesNotMatch(brVsGo.gameplanByAge[1].bestLine, /Arquero con arco largo.*Huscarle/i, 'Britons must not suggest Longbowman as anti-Huskarl');
  assert.ok(brVsGo.ageEdgeScores[2] > 0, 'Britons must hold Feudal edge over Goths');

  const esVsFr = cache.get('spanish|franks');
  assert.match(esVsFr.gameplanByAge[1].bestLine, /Conquistador/i, 'Spanish Castle Age plan vs Franks must feature Conquistador');

  const inVsFr = cache.get('incas|franks');
  assert.match(inVsFr.gameplanByAge[0].bestLine, /champi/i, 'Incas Feudal plan must reflect Champi Runner (Last Chieftains)');
  assert.match(inVsFr.gameplanByAge[1].bestLine, /Kamayuk/i, 'Incas Castle Age plan vs Franks must feature Kamayuk');
}

// 7. Global Blacksmith Technology Highlighter & Official PNG Icons Verification
{
  const bsDir = path.join(__dirname, '..', 'assets', 'icons', 'blacksmith');
  const expectedPngs = [
    'forging.png', 'iron_casting.png', 'blast_furnace.png',
    'fletching.png', 'bodkin_arrow.png', 'bracer.png',
    'scale_barding.png', 'chain_barding.png', 'plate_barding.png',
    'scale_mail.png', 'chain_mail.png', 'plate_mail.png',
    'padded_archer.png', 'leather_archer.png', 'ring_archer.png',
  ];
  for (const file of expectedPngs) {
    const full = path.join(bsDir, file);
    assert.ok(fs.existsSync(full), `Missing official Blacksmith PNG icon: ${file}`);
    const hdr = fs.readFileSync(full).subarray(0, 4);
    assert.deepEqual([...hdr], [0x89, 0x50, 0x4E, 0x47], `Blacksmith icon ${file} must be a valid PNG (not WebP/JPEG)`);
  }

  const bsSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'blacksmith-terms.js'), 'utf8');
  assert.equal(/\bstyle\s*=/.test(bsSrc), false, 'ui/blacksmith-terms.js must contain ZERO inline style= attributes');
  assert.ok(bsSrc.includes('Arquero emplumado'), 'ui/blacksmith-terms.js must guard against false-positive Arquero emplumado match');

  const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(settingsHtml.includes('ui/blacksmith-terms.js'), 'settings.html must load ui/blacksmith-terms.js globally');
  assert.ok(indexHtml.includes('ui/blacksmith-terms.js'), 'index.html must load ui/blacksmith-terms.js globally');
}

// 8. 24h Ultra Trial Expiration -> Locked Free payload must strip ALL Ultra training & Build Order Creator data
{
  const tmpLockFile = path.join(os.tmpdir(), `relic-training-lock-${Date.now()}.json`);
  const ctrl = createTrainingController({ filePath: tmpLockFile });
  const saveRes = ctrl.saveCustomBuild({
    profileId: 555,
    armNow: true,
    build: {
      name: 'Scouts 19 pop Trial',
      civSlug: 'franks',
      mapName: 'Arabia',
      steps: [{ age: 1, pop: '06/05', gameSec: 0, alloc: { food: 6, wood: 0, gold: 0, stone: 0 }, title: '6 ovejas' }],
    },
  });
  const unlockedDash = ctrl.buildDashboard({ profileId: 555, unlocked: true, plan: 'promax', records: [] });
  assert.equal(unlockedDash.unlocked, true);
  assert.equal(unlockedDash.customBuilds.length, 1);
  assert.equal(unlockedDash.armedBuildOrderId, saveRes.saved.id);

  // Trial expires -> unlocked: false (Free)
  const lockedDash = ctrl.buildDashboard({ profileId: 555, unlocked: false, plan: 'free', records: [] });
  assert.equal(lockedDash.unlocked, false);
  assert.equal(lockedDash.customBuilds.length, 0, 'Locked Free dashboard must NOT leak saved Build Orders');
  assert.equal(lockedDash.armedBuildOrderId, null, 'Locked Free dashboard must NOT leak armedBuildOrderId');
  assert.equal(lockedDash.pacer, null, 'Locked Free dashboard must NOT expose pacer');
  assert.equal(lockedDash.matchupWarRoom, null, 'Locked Free dashboard must NOT expose matchupWarRoom');
  assert.equal(lockedDash.arena, null, 'Locked Free dashboard must NOT expose arena');
  assert.equal(lockedDash.liveOverlayTestActive, false);
  assert.equal(lockedDash.highElo.hasData, false);

  // Build Order Helper master gate: renderer.js & main.js must NEVER activate armed training BO in-match when smartBuildOrder is OFF
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  assert.equal(/\(smartBuildOrderEnabled\s*\|\|\s*buildOrderPayload\.isArmedCustom\)/.test(rendererSrc), false,
    'renderer.js must NOT bypass smartBuildOrderEnabled for armed training build orders in-match');
  assert.equal(/\(payload\.isArmedCustom\s*&&\s*payload\.ongoing\)/.test(mainSrc), false,
    'main.js sendBuildOrder must NOT bypass smartBuildOrder for armed training build orders in-match');

  // Arena v6 Wiki + 56-Civ Tech Tree + Crowns integrity checks
  const arenaCat = buildArenaCatalog();
  assert.ok(arenaCat.totalCount >= 420, `Arena v6 must contain >= 420 verified questions (got ${arenaCat.totalCount})`);
  assert.equal(arenaCat.byId.has('l7_fu_monk_byzantines'), false, 'Byzantines lacks Herbal Medicine and must NOT appear as full Monastery');
  assert.equal(arenaCat.byId.has('l6_trash_triple_varangians'), false, 'Varangians lacks Thumb Ring and must NOT appear as 100% triple trash');
  assert.ok(arenaCat.byId.has('l3_td_franks_hindustanis_camels_spears'), 'Franks vs Hindustani Imperial Camels must transition to Halberdiers (spears), not Champions');
  assert.ok(arenaCat.byId.has('l7_crown_artillery_turks') && arenaCat.byId.has('l6_crown_forced_levy_malay'), 'Arena v6 must include dedicated Crown / Unique Tech mastery questions');
  const teutBrac = arenaCat.byId.get('l5_brac_teutons');
  assert.ok(teutBrac && /Almenas/i.test(teutBrac.explanation), 'Teutons Bracer question must explain Crenellations (+3 Castle range)');
  const xbowSp = arenaCat.byId.get('l1_core_no_xbow_spanish');
  assert.ok(xbowSp && !xbowSp.options.some((o) => o.id === 'civ_aztecs' || o.id === 'civ_mongols'), 'European Crossbowman question must use European distractors only');
  for (const q of arenaCat.allQuestions) {
    const joined = `${q.prompt} ${q.explanation} ${q.options.map((o) => `${o.title} ${o.sub}`).join(' ')}`;
    assert.equal(/…/.test(joined), false, `Arena question ${q.id} must not contain truncated ellipsis`);
    assert.equal(/\)\)/.test(joined), false, `Arena question ${q.id} must not contain broken double parentheses`);
    if (q.id.startsWith('l3_champ_')) {
      assert.equal(q.options.some((o) => o.id === 'node_two_handed_swordsman'), false, `${q.id} must not offer Two-Handed Swordsman as a missing option`);
    }
  }
  try { fs.unlinkSync(tmpLockFile); } catch (_) {}
}

// 9. Weekly Progress Real Telemetry & Anti-Fabrication Integrity
{
  const { computeHighEloTelemetry } = require('../src/training/training-high-elo');
  const fixedNowMs = new Date(2026, 10, 24, 15, 0, 0).getTime(); // 2026-11-24 15:00 local
  const DAY = 86400_000;
  const makeRec = ({ id, startedAt, updatedAt, finishedAt, won = true, dur = 1600, darkIdle = 20, feudalIdle = 25, feudal = 610, castle = 1200, dba = 20, eapm = 46, bell = 0, wellEq = true, startingAge = 'dark' }) => ({
    matchId: id,
    mapName: 'Arabia',
    civSlug: 'franks',
    civ: 'Franks',
    won,
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(finishedAt !== undefined ? { finishedAt } : {}),
    telemetry: {
      durationSeconds: dur,
      context: { startingAge },
      engineSummary: {
        durationSeconds: dur,
        self: {
          tcIdleDarkSeconds: darkIdle,
          tcIdleFeudalPerTcSeconds: feudalIdle,
          timings: { feudalSeconds: feudal, castleSeconds: castle },
          techProfile: { hasDoubleBitAxe: true, doubleBitAxeDelaySec: dba, armyRelevance: { wellEquipped: wellEq } },
          eapm,
          habits: { attackMove: 14, patrol: 8, townBell: bell },
        },
      },
    },
  });

  // C1: 0 replays
  const c1 = computeHighEloTelemetry([], null, { nowMs: fixedNowMs });
  assert.equal(c1.weeklyProgress.status, 'no_replays_week');
  assert.equal(c1.weeklyProgress.gains.length, 0);
  assert.equal(c1.weeklyProgress.milestones.length, 0);
  assert.equal(c1.weeklyProgress.dailySeries.length, 7);
  assert.ok(c1.weeklyProgress.dailySeries.every((d) => d.matchCount === 0 && d.improvedFundamentalsAvg === null));

  // C2: 0 replays this week, 4 older replays
  const old4 = [10, 12, 14, 16].map((dAgo, i) => makeRec({ id: `old_${i}`, startedAt: fixedNowMs - dAgo * DAY }));
  const c2 = computeHighEloTelemetry(old4, null, { nowMs: fixedNowMs });
  assert.equal(c2.weeklyProgress.status, 'idle_week');
  assert.equal(c2.weeklyProgress.weekMatchCount, 0);
  assert.equal(c2.weeklyProgress.priorMatchCount, 4);
  assert.equal(c2.weeklyProgress.gains.length, 0);
  assert.ok(c2.weeklyProgress.dailySeries.every((d) => d.matchCount === 0 && d.improvedFundamentalsAvg === null));

  // C3: 1 replay this week, 0 older -> calibrating_first_match (isBaselineOnly, zero gains)
  const oneWeekRec = [makeRec({ id: 'first_1', startedAt: fixedNowMs - 3600_000 })];
  const c3 = computeHighEloTelemetry(oneWeekRec, null, { nowMs: fixedNowMs });
  assert.equal(c3.weeklyProgress.status, 'calibrating_first_match');
  assert.equal(c3.weeklyProgress.hasComparison, false);
  assert.equal(c3.weeklyProgress.gains.length, 0);
  const todayC3 = c3.weeklyProgress.dailySeries[6];
  assert.equal(todayC3.matchCount, 1);
  assert.equal(todayC3.isBaselineOnly, true);
  assert.equal(todayC3.improvedFundamentalsAvg, null);

  // Backfill trap (updatedAt = now, NO startedAt/finishedAt) MUST NOT land in today!
  const backfillRec = makeRec({ id: 'backfill_1', updatedAt: fixedNowMs });
  const futureCorruptRec = makeRec({ id: 'future_1', startedAt: fixedNowMs + 7 * DAY });
  const bfRes = computeHighEloTelemetry([backfillRec, futureCorruptRec], null, { nowMs: fixedNowMs });
  assert.equal(bfRes.weeklyProgress.weekMatchCount, 0, 'Backfilled undated & far-future replays must NEVER be placed into this week');
  assert.equal(bfRes.weeklyProgress.undatedExcludedCount, 2);

  // Mixed Unix seconds vs ms + minor +60s clock skew
  const secRec = makeRec({ id: 'sec_1', startedAt: Math.floor((fixedNowMs - 2 * DAY) / 1000) });
  const msRec = makeRec({ id: 'ms_1', startedAt: fixedNowMs - 2 * DAY + 1000 });
  const skewRec = makeRec({ id: 'skew_1', startedAt: fixedNowMs + 60_000 });
  const mixedRes = computeHighEloTelemetry([skewRec, msRec, secRec], null, { nowMs: fixedNowMs });
  assert.equal(mixedRes.weeklyProgress.weekMatchCount, 3);
  assert.equal(mixedRes.weeklyProgress.dailySeries[4].matchCount, 2, 'Seconds and ms timestamps on same day must bucket together');
  assert.equal(mixedRes.weeklyProgress.dailySeries[6].matchCount, 1, 'Minor +60s skew must bucket cleanly into today');

  // Case A (>20 replays un-slicing + deadband enforcement + PB milestone guard + Empire Wars guard + dedup + short match filter)
  const prior5 = [10, 11, 12, 13, 14].map((dAgo, i) => makeRec({
    id: `p_${i}`, startedAt: fixedNowMs - dAgo * DAY,
    darkIdle: 32, feudalIdle: 34, feudal: 635, castle: 1260, dba: 32, eapm: 44,
  }));
  const week22 = [];
  for (let i = 0; i < 22; i += 1) {
    const dayOff = i % 5; // spread across last 5 days
    week22.push(makeRec({
      id: `w_${i}`, startedAt: fixedNowMs - dayOff * DAY - i * 60_000,
      darkIdle: 22, // -10s > 4s deadband => MUST qualify (+0.4 villagers)
      feudalIdle: 31, // -3s <= 5s deadband => MUST NOT qualify!
      feudal: 610, // -25s > 10s deadband => qualifies
      castle: 1245, // -15s <= 20s deadband => MUST NOT qualify!
      dba: 18, // -14s > 10s deadband => qualifies
      eapm: 48.5, // +4.5 > 2.5 deadband => qualifies
    }));
  }
  // Add duplicate matchId, short <180s match, and Empire Wars match (feudal=0)
  const dupRec = { ...week22[0] };
  const shortRec = makeRec({ id: 'short_1', startedAt: fixedNowMs - 1000, dur: 120, darkIdle: 0 });
  const ewRec = makeRec({ id: 'ew_1', startedAt: fixedNowMs - 2000, startingAge: 'feudal', feudal: 0, darkIdle: 0, castle: 1000 });
  const caseA = computeHighEloTelemetry([...week22, dupRec, shortRec, ewRec, ...prior5], null, { nowMs: fixedNowMs });
  assert.equal(caseA.weeklyProgress.comparisonMode, 'prior_baseline', 'Prior baseline must NOT be lost even with >20 weekly replays');
  assert.equal(caseA.weeklyProgress.weekMatchCount, 23, '22 unique standard + 1 valid EW (deduped, excluding <180s short match)');
  assert.equal(caseA.weeklyProgress.priorMatchCount, 5);
  const darkGain = caseA.weeklyProgress.gains.find((g) => g.metricKey === 'tcIdleDarkSec');
  assert.ok(darkGain && darkGain.villagersSaved === 0.4, 'Dark TC idle -10s must surface with +0.4 villagers saved');
  assert.equal(caseA.weeklyProgress.gains.some((g) => g.metricKey === 'tcIdleFeudalPerTcSec'), false, '-3s feudal idle within 5s deadband must NOT appear as gain');
  assert.equal(caseA.weeklyProgress.gains.some((g) => g.metricKey === 'castleSec'), false, '-15s castle within 20s deadband must NOT appear as gain');
  assert.ok(caseA.weeklyProgress.milestones.some((m) => m.kind === 'personal_best'), 'Real PB broken with >=2 prior samples must emit personal_best milestone');
  const feudalGain = caseA.weeklyProgress.gains.find((g) => g.metricKey === 'feudalSec');
  assert.ok(feudalGain && feudalGain.nowVal === 610, 'EW feudal=0 match must NOT pollute feudalSec median');

  // Case B (within_week_split: 4 replays this week, 0 older -> zero future leakage, never says "semana pasada")
  const weekOnly4 = [
    makeRec({ id: 'wo_1', startedAt: fixedNowMs - 4 * DAY, darkIdle: 40, feudal: 650, eapm: 40 }),
    makeRec({ id: 'wo_2', startedAt: fixedNowMs - 3 * DAY, darkIdle: 38, feudal: 645, eapm: 41 }),
    makeRec({ id: 'wo_3', startedAt: fixedNowMs - 1 * DAY, darkIdle: 20, feudal: 605, eapm: 48 }),
    makeRec({ id: 'wo_4', startedAt: fixedNowMs - 3600_000, darkIdle: 16, feudal: 598, eapm: 50 }),
  ];
  const caseB = computeHighEloTelemetry(weekOnly4, null, { nowMs: fixedNowMs });
  assert.equal(caseB.weeklyProgress.comparisonMode, 'within_week_split');
  assert.equal(caseB.weeklyProgress.baselineLabel, 'vs inicio de esta semana');
  assert.doesNotMatch(`${caseB.weeklyProgress.headline} ${caseB.weeklyProgress.subhead} ${caseB.weeklyProgress.baselineDetail}`, /semana pasada/i);
  assert.equal(caseB.weeklyProgress.dailySeries[2].isBaselineOnly, true, 'First chronological match day must be baseline-only (zero future leakage)');
  assert.equal(caseB.weeklyProgress.dailySeries[2].improvedFundamentalsAvg, null);
  assert.ok(caseB.weeklyProgress.gains.length >= 2, 'Genuine within-week improvement must be detected');

  // Case D (Tough / Steady week: 3 matches this week worse/flat vs 5 prior -> ZERO fake green gains!)
  const toughWeek3 = [
    makeRec({ id: 'tw_1', startedAt: fixedNowMs - 3 * DAY, won: false, darkIdle: 44, feudalIdle: 48, feudal: 655, castle: 1310, dba: 45, eapm: 40, bell: 0 }),
    makeRec({ id: 'tw_2', startedAt: fixedNowMs - 1 * DAY, won: false, darkIdle: 33, feudalIdle: 36, feudal: 636, castle: 1265, dba: 33, eapm: 43, bell: 0 }),
    makeRec({ id: 'tw_3', startedAt: fixedNowMs - 3600_000, won: true, darkIdle: 32, feudalIdle: 35, feudal: 634, castle: 1258, dba: 31, eapm: 44, bell: 0 }),
  ];
  const caseD = computeHighEloTelemetry([...toughWeek3, ...prior5], null, { nowMs: fixedNowMs });
  assert.equal(caseD.weeklyProgress.gains.length, 0, 'Tough/steady week must NEVER fabricate fake gains');
  assert.equal(caseD.weeklyProgress.hasGains, false);
  assert.ok(caseD.weeklyProgress.status === 'steady_week' || caseD.weeklyProgress.status === 'tough_week');
  assert.ok(caseD.weeklyProgress.encouragingFacts.length >= 1, 'Case D must surface verified encouraging facts');

  // Locked Free dashboard must NOT leak weeklyProgress
  const tmpFreeWp = path.join(os.tmpdir(), `relic-wp-lock-${Date.now()}.json`);
  const ctrlWp = createTrainingController({ stateFile: tmpFreeWp, saveCustomBuilds: () => {} });
  const lockedWpDash = ctrlWp.buildDashboard({ profileId: 777, unlocked: false, plan: 'free', records: week22 });
  assert.equal(lockedWpDash.highElo.weeklyProgress, undefined, 'Locked Free dashboard must NOT leak weeklyProgress');
  try { fs.unlinkSync(tmpFreeWp); } catch (_) {}
}

console.log('Entrenamiento v5 (Beta · Ultra): 410 preguntas 7 niveles, 3080 matchups antisimétricos + UU, 15 PNGs Herrería globales, bloqueo 24h, cola Mi Plan, Radar real, Weekly real, CSP y nomenclatura oficial AoE2:DE OK.');
