'use strict';

/**
 * Relic · Entrenamiento (Beta · Exclusivo Ultra) — Fachada Principal v2
 *
 * Incluye:
 *   1. Telemetría High-ELO (1200–2000+ ELO) + Autopsia de Presión en Combate + Misiones Auto-Verificadas
 *   2. Estudio y Creador de Build Orders + Sincronización con el Overlay Superior en Vivo (`kind: 'custom-armed'`)
 *   3. Laboratorio Táctico de Enfrentamientos (62 Civs · Curva de Poder por Edad · Trampas del Árbol)
 *   4. Arena de Decisiones (Dilemas de Transición Castillos → Imperial) + Metrónomo Macro Anti-Idle
 */

const { TrainingStore } = require('./training-store');
const {
  MISSION_FAMILIES,
  getMissionFamily,
  selectActiveMissions,
  evaluateRecordAgainstMissions,
  computeAgeMastery,
  computeHistoricalRank,
} = require('./training-missions');
const {
  getRecipeByKey,
  listRecipes,
  checkCivCompatibility,
  computeRecipeBenchmarks,
} = require('./training-recipes');
const {
  LEVEL_CONFIG,
  buildArenaCatalog,
  getLevelConfig,
  getCatalogQuestionById,
  pickNextQuestionForLevel,
  evaluateArenaAnswer,
  generateArenaBatch,
} = require('./training-arena');
const { CIV_GUIDE } = require('../civ-guide');
const {
  computeHighEloTelemetry,
  computeMatchupWarRoom,
  extractBuildFromBestReplay,
} = require('./training-high-elo');
const { evaluatePlanQueueAgainstRecord } = require('./training-plan-verifier');

const CIV_BONUSES_MAP = Object.fromEntries(
  Object.entries(CIV_GUIDE || {}).map(([slug, g]) => [
    slug,
    {
      name: slug === 'jurchens' ? 'Yurchen' : slug === 'khitans' ? 'Kitán' : (g.name || slug),
      role: g.role || '',
      bonuses: (Array.isArray(g.bonuses) ? g.bonuses : (typeof g.bonuses === 'string' ? [g.bonuses] : []))
        .flatMap((line) => String(line || '').split(/\s*[·|]\s*/))
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5),
      units: g.units || '',
    },
  ])
);

function extractPlayerCivContext(records = []) {
  const civCounts = new Map();
  const lossVsCiv = new Map();
  for (const r of (records || []).slice(0, 40)) {
    const mySlug = String(r?.civSlug || r?.telemetry?.context?.civSlug || '').toLowerCase();
    if (mySlug) civCounts.set(mySlug, (civCounts.get(mySlug) || 0) + 1);
    if (r?.won === false) {
      const rivalSlug = String(r?.opponentCivSlug || r?.telemetry?.context?.opponentCivSlug || '').toLowerCase();
      if (rivalSlug) lossVsCiv.set(rivalSlug, (lossVsCiv.get(rivalSlug) || 0) + 1);
    }
  }
  const preferredCivs = [...civCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  const nemesisCivs = [...lossVsCiv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  return { preferredCivs, nemesisCivs };
}

function buildFocusHeadline(activeMissions = [], records = []) {
  const top = activeMissions.find((m) => m.status !== 'completed') || activeMissions[0] || null;
  if (!top) {
    return {
      eyebrow: 'SESIÓN INICIAL · ENTRENAMIENTO ULTRA',
      title: 'Calibrá tu primer objetivo en partida real',
      detail: 'Jugá una partida grabada o armá una orden en el Estudio para establecer tu línea base.',
      chip: `${records.length} replays`,
      recommendedRecipe: 'scouts-20pop',
    };
  }
  const hasBase = top.baselineSample >= 2 && top.baselineDisplay && top.baselineDisplay !== 'Sin muestra';
  return {
    eyebrow: hasBase ? 'FOCO DE HOY · DETECTADO EN TUS REPLAYS' : 'FOCO INICIAL · MODO CALIBRACIÓN',
    title: `${top.title} (${top.targetDisplay})`,
    detail: hasBase
      ? `Tu mediana reciente es ${top.baselineDisplay} (${top.baselineSample} partidas). Ajustá tu ritmo y verificá la mejora automáticamente al terminar tu próxima partida.`
      : 'Al completar tu próxima partida válida de ≥ 12 min, Relic verificará automáticamente este hito sobre tu partida grabada.',
    chip: hasBase ? `Actual: ${top.baselineDisplay} → ${top.targetDisplay}` : `Meta ${top.tierLabel}: ${top.targetDisplay}`,
    recommendedRecipe: top.recommendedRecipe || 'scouts-20pop',
  };
}

function createTrainingController({ storePath }) {
  const store = new TrainingStore(storePath);

  // Runtime state for Live Overlay Runner (both live match auto-trigger & instant test mode)
  const liveOverlayState = {
    testActive: false,
    startedAt: null,
    offsetGameSec: 0,
    clockSpeed: 1.7,
    activeMatchId: null,
  };

  function resolveBuildById(profileId, buildId) {
    const p = store.getProfile(profileId);
    const id = String(buildId || p.pacer?.selectedBuildKey || 'scouts-20pop');
    const custom = (p.customBuilds || []).find((b) => b.id === id || b.key === id);
    if (custom) return custom;
    return getRecipeByKey(id);
  }

  function listAllBuilds(profileId) {
    const p = store.getProfile(profileId);
    const custom = (p.customBuilds || []).map((b) => ({
      key: b.id,
      id: b.id,
      isCustom: true,
      name: b.name,
      shortName: b.shortName,
      civSlug: b.civSlug || '',
      mapName: b.mapName || 'Arabia',
      difficulty: 'Personalizada',
      targetFeudalSec: b.targetFeudalSec,
      targetCastleSec: b.targetCastleSec,
      summary: b.summary,
      stepCount: Array.isArray(b.steps) ? b.steps.length : 0,
    }));
    const canonical = listRecipes().map((r) => ({ ...r, id: r.key, isCustom: false }));
    return [...custom, ...canonical];
  }

  function computeLiveElapsedGameSec() {
    if (!liveOverlayState.startedAt) return Math.max(0, liveOverlayState.offsetGameSec || 0);
    const realDeltaSec = Math.max(0, (Date.now() - liveOverlayState.startedAt) / 1000);
    return Math.max(0, (liveOverlayState.offsetGameSec || 0) + realDeltaSec * (liveOverlayState.clockSpeed || 1.7));
  }

  function notifyMatchStarted({ profileId, matchId, startedAt = Date.now() }) {
    liveOverlayState.testActive = false;
    const p = store.getProfile(profileId);
    if (!p.armedBuildOrderId) return false;
    if (String(liveOverlayState.activeMatchId) !== String(matchId)) {
      liveOverlayState.activeMatchId = String(matchId || 'match');
      liveOverlayState.startedAt = startedAt;
      liveOverlayState.offsetGameSec = 0;
    }
    return true;
  }

  function controlLiveOverlay({ profileId, buildId, armed, testNow, action, clockSpeed } = {}) {
    const p = store.getProfile(profileId);
    if (buildId !== undefined && buildId !== null) {
      p.pacer.selectedBuildKey = String(buildId);
    }
    if (typeof armed === 'boolean') {
      store.setArmedBuildOrder(profileId, armed ? (buildId || p.pacer.selectedBuildKey || 'scouts-20pop') : null);
    }
    if (clockSpeed === 1.0 || clockSpeed === 1.7) {
      liveOverlayState.clockSpeed = clockSpeed;
      p.pacer.clockSpeed = clockSpeed;
    }
    if (typeof testNow === 'boolean') {
      liveOverlayState.testActive = testNow;
      if (testNow) {
        const targetId = buildId || p.armedBuildOrderId || p.pacer.selectedBuildKey || 'scouts-20pop';
        if (!p.armedBuildOrderId) {
          store.setArmedBuildOrder(profileId, targetId);
        }
        liveOverlayState.startedAt = Date.now();
        liveOverlayState.offsetGameSec = 0;
      } else {
        liveOverlayState.startedAt = null;
        liveOverlayState.offsetGameSec = 0;
      }
    }
    if (action === 'reset') {
      liveOverlayState.startedAt = liveOverlayState.testActive ? Date.now() : null;
      liveOverlayState.offsetGameSec = 0;
    } else if (action === 'step-next' || action === 'step-prev') {
      const build = resolveBuildById(profileId, p.armedBuildOrderId || p.pacer.selectedBuildKey);
      const steps = build?.steps || [];
      const curSec = computeLiveElapsedGameSec();
      let idx = 0;
      for (let i = 0; i < steps.length; i += 1) {
        if (curSec >= Number(steps[i].gameSec || 0)) idx = i;
      }
      const nextIdx = action === 'step-next'
        ? Math.min(steps.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      liveOverlayState.offsetGameSec = Number(steps[nextIdx]?.gameSec || 0);
      if (liveOverlayState.startedAt) liveOverlayState.startedAt = Date.now();
    }
    store.touch(profileId);
    return {
      ok: true,
      armedBuildOrderId: p.armedBuildOrderId,
      liveTestActive: liveOverlayState.testActive,
      elapsedGameSec: Math.round(computeLiveElapsedGameSec()),
    };
  }

  function getArmedOverlayPayload({ profileId, ongoing = false, matchId = null, ownCiv = null, mapName = null } = {}) {
    const p = store.getProfile(profileId);
    const activeId = p.armedBuildOrderId || (liveOverlayState.testActive ? p.pacer?.selectedBuildKey : null);
    if (!activeId) return null;
    if (!ongoing && !liveOverlayState.testActive) return null;

    if (ongoing && !liveOverlayState.startedAt) {
      liveOverlayState.startedAt = Date.now();
      liveOverlayState.activeMatchId = String(matchId || 'live');
    }

    const build = resolveBuildById(profileId, activeId);
    if (!build || !Array.isArray(build.steps) || !build.steps.length) return null;

    const elapsedGameSec = Math.round(computeLiveElapsedGameSec());
    const steps = build.steps;
    let activeStepIdx = 0;
    for (let i = 0; i < steps.length; i += 1) {
      if (elapsedGameSec >= Number(steps[i].gameSec || 0)) activeStepIdx = i;
    }
    const currentStep = steps[activeStepIdx] || steps[0];
    const nextStep = steps[activeStepIdx + 1] || null;

    return {
      kind: 'custom-armed',
      status: 'ready',
      enabled: true,
      isArmedCustom: true,
      liveTestActive: Boolean(liveOverlayState.testActive),
      ongoing: Boolean(ongoing || liveOverlayState.testActive),
      matchId: matchId || 'live-test',
      buildId: build.id || build.key,
      name: build.name,
      shortName: build.shortName || build.name,
      ownCiv: ownCiv || build.civSlug || p.pacer?.selectedCiv || null,
      mapName: mapName || build.mapName || 'Arabia',
      elapsedGameSec,
      clockSpeed: liveOverlayState.clockSpeed || 1.7,
      activeStepIdx,
      totalSteps: steps.length,
      currentStep,
      nextStep,
      steps,
    };
  }

  function buildDashboard({ profileId, records = [], unlocked = false, plan = 'free' }) {
    if (!unlocked) {
      return {
        ok: true,
        unlocked: false,
        plan,
        profileId: null,
        replayCount: 0,
        focus: null,
        rank: null,
        sessionStreak: 0,
        missions: [],
        completedCount: 0,
        recentCompleted: [],
        ageTracks: [],
        highElo: { hasData: false, sampleSize: 0 },
        matchupWarRoom: null,
        civBonusesMap: {},
        armedBuildOrderId: null,
        liveOverlayTestActive: false,
        customBuilds: [],
        trainingQueue: [],
        pacer: null,
        arena: null,
      };
    }
    const p = store.getProfile(profileId);
    const { preferredCivs, nemesisCivs } = extractPlayerCivContext(records);
    const activeMissions = selectActiveMissions({ records, profileState: p });
    if (unlocked && JSON.stringify(activeMissions.map((m) => m.id)) !== JSON.stringify((p.activeMissions || []).map((m) => m.id))) {
      p.activeMissions = activeMissions;
      store.touch(profileId);
    }

    const ageTracks = computeAgeMastery(records);
    const rank = computeHistoricalRank(p.xp, p.verifiedCount);
    const focus = buildFocusHeadline(activeMissions, records);
    const recipeKey = p.pacer?.selectedBuildKey || focus.recommendedRecipe || 'scouts-20pop';
    const selectedRecipe = resolveBuildById(profileId, recipeKey);
    const effectiveCiv = selectedRecipe.civSlug || p.pacer?.selectedCiv || preferredCivs[0] || '';
    const civCompat = checkCivCompatibility(selectedRecipe, effectiveCiv);
    const benchmarks = computeRecipeBenchmarks(selectedRecipe, records);

    const highElo = computeHighEloTelemetry(records, p.selectedReplayMatchId || null);
    const labMyCiv = p.matchupLab?.myCivSlug || preferredCivs[0] || 'franks';
    const labRivalCiv = p.matchupLab?.rivalCivSlug || nemesisCivs[0] || 'hindustanis';
    const matchupWarRoom = computeMatchupWarRoom({
      myCivSlug: labMyCiv,
      rivalCivSlug: labRivalCiv,
      mapSlug: p.matchupLab?.mapSlug || 'arabia',
      records,
    });

    return {
      ok: true,
      unlocked: Boolean(unlocked),
      plan,
      profileId: profileId || null,
      replayCount: records.length,
      focus,
      rank,
      sessionStreak: Number(p.sessionStreak || 0),
      missions: activeMissions,
      completedCount: Number(p.verifiedCount || 0),
      recentCompleted: (p.completedLog || []).slice(0, 5),
      ageTracks,
      highElo,
      matchupWarRoom,
      civBonusesMap: CIV_BONUSES_MAP,
      armedBuildOrderId: p.armedBuildOrderId || null,
      liveOverlayTestActive: Boolean(liveOverlayState.testActive),
      customBuilds: p.customBuilds || [],
      trainingQueue: Array.isArray(p.trainingQueue) ? p.trainingQueue : [],
      pacer: {
        recipes: listAllBuilds(profileId),
        canonicalRecipes: listRecipes(),
        selectedRecipe,
        selectedCiv: effectiveCiv,
        clockSpeed: Number(p.pacer?.clockSpeed || 1.7),
        soundEnabled: p.pacer?.soundEnabled !== false,
        civCompat,
        benchmarks,
        runsCount: Array.isArray(p.pacer?.runs) ? p.pacer.runs.length : 0,
      },
      arena: getArenaState({ profileId }),
    };
  }

  function handleNewReplayRecord({ profileId, record, records = [], unlocked = false }) {
    if (!unlocked || !profileId || !record) {
      return { changed: false, newlyCompleted: [], newlyCompletedPlanItems: [] };
    }
    const p = store.getProfile(profileId);
    const active = p.activeMissions?.length ? p.activeMissions : selectActiveMissions({ records, profileState: p });
    const { updatedMissions, newlyCompleted, changed: missionsChanged } = evaluateRecordAgainstMissions(
      active,
      record,
      p.processedMatchIds
    );
    if (missionsChanged) {
      store.markMissionCompletions(profileId, String(record.matchId || ''), updatedMissions, newlyCompleted);
    }

    // Automatic real-match verification of «Mi Plan» items added BEFORE this match!
    const planEval = evaluatePlanQueueAgainstRecord(p.trainingQueue || [], record);
    if (planEval.changed) {
      store.saveEvaluatedTrainingQueue(profileId, planEval.updatedQueue);
    }

    if (!missionsChanged && !planEval.changed) {
      return { changed: false, newlyCompleted: [], newlyCompletedPlanItems: [] };
    }
    return {
      changed: true,
      newlyCompleted,
      newlyCompletedPlanItems: planEval.newlyCompletedPlanItems,
      missions: missionsChanged ? updatedMissions : active,
      trainingQueue: planEval.changed ? planEval.updatedQueue : (p.trainingQueue || []),
      ageTracks: computeAgeMastery(records),
      rank: computeHistoricalRank(p.xp, p.verifiedCount),
    };
  }

  function advanceOrRerollMission({ profileId, familyId, action = 'advance', records = [] }) {
    const p = store.getProfile(profileId);
    const current = Array.isArray(p.activeMissions) ? p.activeMissions : selectActiveMissions({ records, profileState: p });
    if (action === 'advance') {
      const updated = current.map((m) => {
        if (m.familyId !== familyId) return m;
        const fam = getMissionFamily(m.familyId);
        if (!fam) return m;
        const nextIdx = Math.min(fam.tiers.length - 1, Number(m.tierIdx || 0) + 1);
        const tier = fam.tiers[nextIdx];
        return {
          ...m,
          id: `mis_${fam.id}_${tier.key}_${Date.now()}`,
          tierIdx: nextIdx,
          tierKey: tier.key,
          tierLabel: tier.label,
          targetDisplay: tier.unit,
          progressCurrent: 0,
          progressRequired: tier.requiredMatches,
          rankedOnly: Boolean(tier.rankedOnly),
          verifiedMatchIds: [],
          createdAt: Date.now(),
          status: 'active',
        };
      });
      p.activeMissions = updated;
      store.touch(profileId);
      return updated;
    }
    if (action === 'reroll') {
      const currentIds = new Set(current.map((m) => m.familyId));
      const alt = MISSION_FAMILIES.find((f) => !currentIds.has(f.id));
      if (!alt) return current;
      const tier = alt.tiers[0];
      const replaced = current.map((m) => (m.familyId !== familyId ? m : {
        id: `mis_${alt.id}_${tier.key}_${Date.now()}`,
        familyId: alt.id,
        tierIdx: 0,
        tierKey: tier.key,
        tierLabel: tier.label,
        category: alt.category,
        title: alt.title,
        icon: alt.icon,
        recommendedRecipe: alt.recommendedRecipe,
        targetDisplay: tier.unit,
        baselineDisplay: 'Calibrando',
        baselineSample: 0,
        progressCurrent: 0,
        progressRequired: tier.requiredMatches,
        rankedOnly: Boolean(tier.rankedOnly),
        verifiedMatchIds: [],
        createdAt: Date.now(),
        status: 'active',
        lastMeasuredDisplay: null,
      }));
      p.activeMissions = replaced;
      store.touch(profileId);
      return replaced;
    }
    return current;
  }

  function selectPacer({ profileId, buildKey, civ = '', clockSpeed = 1.7, soundEnabled = true, records = [] }) {
    const p = store.getProfile(profileId);
    const recipe = resolveBuildById(profileId, buildKey);
    p.pacer.selectedBuildKey = recipe.id || recipe.key;
    p.pacer.selectedCiv = String(civ || recipe.civSlug || '').trim().toLowerCase();
    p.pacer.clockSpeed = clockSpeed === 1.0 ? 1.0 : 1.7;
    p.pacer.soundEnabled = soundEnabled !== false;
    store.touch(profileId);
    return {
      recipes: listAllBuilds(profileId),
      selectedRecipe: recipe,
      selectedCiv: p.pacer.selectedCiv,
      clockSpeed: p.pacer.clockSpeed,
      soundEnabled: p.pacer.soundEnabled,
      civCompat: checkCivCompatibility(recipe, p.pacer.selectedCiv),
      benchmarks: computeRecipeBenchmarks(recipe, records),
    };
  }

  function saveCustomBuild({ profileId, build, armNow = false, records = [] }) {
    const saved = store.saveCustomBuild(profileId, build);
    if (!saved) return { ok: false, error: 'Datos de orden inválidos' };
    if (armNow) {
      store.setArmedBuildOrder(profileId, saved.id);
    }
    const p = store.getProfile(profileId);
    return {
      ok: true,
      saved,
      armedBuildOrderId: p.armedBuildOrderId,
      customBuilds: p.customBuilds,
      pacer: selectPacer({
        profileId,
        buildKey: saved.id,
        civ: saved.civSlug || p.pacer.selectedCiv,
        clockSpeed: p.pacer.clockSpeed,
        soundEnabled: p.pacer.soundEnabled,
        records,
      }),
    };
  }

  function extractCustomBuildFromReplay({ profileId, records = [] }) {
    const template = extractBuildFromBestReplay(records);
    return saveCustomBuild({ profileId, build: template, armNow: false, records });
  }

  function deleteCustomBuild({ profileId, buildId, records = [] }) {
    store.deleteCustomBuild(profileId, buildId);
    const p = store.getProfile(profileId);
    return {
      ok: true,
      armedBuildOrderId: p.armedBuildOrderId,
      customBuilds: p.customBuilds,
      pacer: selectPacer({
        profileId,
        buildKey: p.pacer.selectedBuildKey || 'scouts-20pop',
        civ: p.pacer.selectedCiv,
        clockSpeed: p.pacer.clockSpeed,
        soundEnabled: p.pacer.soundEnabled,
        records,
      }),
    };
  }

  function updateHighEloConfig({ profileId, selectedMatchId, myCivSlug, rivalCivSlug, mapSlug, records = [] }) {
    const p = store.getProfile(profileId);
    if (selectedMatchId !== undefined) {
      p.selectedReplayMatchId = selectedMatchId ? String(selectedMatchId) : null;
      store.touch(profileId);
    }
    if (myCivSlug || rivalCivSlug || mapSlug) {
      store.setMatchupLab(profileId, { myCivSlug, rivalCivSlug, mapSlug });
    }
    return {
      ok: true,
      highElo: computeHighEloTelemetry(records, p.selectedReplayMatchId || null),
      matchupWarRoom: computeMatchupWarRoom({
        myCivSlug: p.matchupLab?.myCivSlug || 'franks',
        rivalCivSlug: p.matchupLab?.rivalCivSlug || 'hindustanis',
        mapSlug: p.matchupLab?.mapSlug || 'arabia',
        records,
      }),
    };
  }

  function getArenaState({ profileId, now = Date.now() }) {
    const cat = buildArenaCatalog();
    return store.getArenaSnapshot(profileId, {
      levelsConfig: LEVEL_CONFIG,
      catalogTotal: cat.totalCount,
      now,
    });
  }

  function getNextArenaQuestion({ profileId, level = null, now = Date.now() }) {
    const cat = buildArenaCatalog();
    const snap = store.getArenaSnapshot(profileId, {
      levelsConfig: LEVEL_CONFIG,
      catalogTotal: cat.totalCount,
      now,
    });
    if (snap.locked) {
      return { ok: false, locked: true, arena: snap };
    }
    const p = store.getProfile(profileId, now);
    const targetLevel = Math.max(1, Math.min(snap.unlockedLevel, Number(level || snap.selectedLevel || snap.unlockedLevel)));
    const lvlKey = String(targetLevel);
    const pinnedId = p.arena.activeQuestionByLevel?.[lvlKey];
    let q = pinnedId ? getCatalogQuestionById(pinnedId) : null;
    if (!q || q.level !== targetLevel) {
      q = pickNextQuestionForLevel({
        level: targetLevel,
        masteryCompleted: snap.masteryCompleted,
        answeredCorrectIds: p.arena.answeredCorrectIds || [],
        seed: now ^ (Number(p.arena.totalAnswered || 0) * 1315423911),
      });
      if (q) store.pinArenaQuestion(profileId, targetLevel, q.id, now);
    } else {
      p.arena.selectedLevel = targetLevel;
      store.touch(profileId);
    }
    if (!q) return { ok: false, error: 'no_questions', arena: snap };
    const cfg = getLevelConfig(targetLevel);
    return {
      ok: true,
      question: {
        ...q,
        timerSec: cfg.timerSec,
        levelConfig: cfg,
      },
      arena: getArenaState({ profileId, now }),
    };
  }

  function submitArenaAnswer({ profileId, questionId, selectedOptionId, timedOut = false, now = Date.now() }) {
    const evalRes = evaluateArenaAnswer(questionId, selectedOptionId, timedOut);
    if (!evalRes.ok) {
      return { ok: false, error: evalRes.error, arena: getArenaState({ profileId, now }) };
    }
    const q = evalRes.question;
    const p = store.getProfile(profileId, now);
    const lvlKey = String(q.level);
    const pinned = p.arena.activeQuestionByLevel?.[lvlKey];
    if (pinned && String(pinned) !== String(questionId)) {
      return { ok: false, error: 'stale_question', arena: getArenaState({ profileId, now }) };
    }
    const cfg = getLevelConfig(q.level);
    const rec = store.recordArenaAnswer(profileId, {
      questionId: q.id,
      level: q.level,
      isCorrect: evalRes.isCorrect,
      timedOut,
      levelConfig: cfg,
      now,
    });
    if (!rec.ok) {
      return { ok: false, locked: Boolean(rec.locked), arena: getArenaState({ profileId, now }) };
    }
    const updatedProfile = store.getProfile(profileId, now);
    return {
      ok: true,
      isCorrect: rec.isCorrect,
      timedOut: rec.timedOut,
      correctOptionId: evalRes.correctOptionId,
      correctTitle: evalRes.correctTitle,
      explanation: evalRes.explanation,
      xpEarned: rec.xpEarned,
      leveledUp: rec.leveledUp,
      prestigeUp: rec.prestigeUp,
      unlockedUnit: rec.unlockedUnit,
      dailyErrors: rec.dailyErrors,
      remainingLives: rec.remainingLives,
      lockedNow: rec.lockedNow,
      lockedUntilTs: rec.lockedUntilTs,
      rank: computeHistoricalRank(updatedProfile.xp, updatedProfile.verifiedCount),
      arena: getArenaState({ profileId, now }),
    };
  }

  function startArena({ profileId, mode = 'mixed', count = 5, records = [] }) {
    const { preferredCivs, nemesisCivs } = extractPlayerCivContext(records);
    const questions = generateArenaBatch({
      mode,
      count: Math.max(3, Math.min(10, Number(count) || 5)),
      seed: Date.now() ^ Math.floor(Math.random() * 1e9),
      preferredCivs,
      nemesisCivs,
    });
    return { ok: true, mode, questions, arena: getArenaState({ profileId }) };
  }

  function finishArena({ profileId, mode = 'mixed', answered = 0, correct = 0, bestStreak = 0 }) {
    const reward = store.awardArenaRun(profileId, { mode, answered, correct, bestStreak });
    const p = store.getProfile(profileId);
    return {
      ok: true,
      reward,
      rank: computeHistoricalRank(p.xp, p.verifiedCount),
      arena: getArenaState({ profileId }),
    };
  }

  return {
    store,
    liveOverlayState,
    buildDashboard,
    handleNewReplayRecord,
    advanceOrRerollMission,
    selectPacer,
    saveCustomBuild,
    extractCustomBuildFromReplay,
    deleteCustomBuild,
    controlLiveOverlay,
    getArmedOverlayPayload,
    notifyMatchStarted,
    updateHighEloConfig,
    recordPacerRun: (profileId, payload) => store.recordPacerRun(profileId, payload),
    getArenaState,
    getNextArenaQuestion,
    submitArenaAnswer,
    startArena,
    finishArena,
    addQueueItem: ({ profileId, item }) => {
      const res = store.addTrainingQueueItem(profileId, item);
      return {
        ok: true,
        duplicate: Boolean(res.duplicate),
        itemId: res.itemId || null,
        trainingQueue: res.trainingQueue || [],
      };
    },
    toggleQueueItem: ({ profileId, itemId }) => ({ ok: true, trainingQueue: store.toggleTrainingQueueItem(profileId, itemId) }),
    removeQueueItem: ({ profileId, itemId }) => ({ ok: true, trainingQueue: store.removeTrainingQueueItem(profileId, itemId) }),
    flush: () => store.flush(),
  };
}

module.exports = {
  createTrainingController,
};
