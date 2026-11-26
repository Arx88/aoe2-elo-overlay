'use strict';

/**
 * Relic · Entrenamiento (Beta) — Persistencia atómica local (`training-state.json`)
 *
 * Mismo patrón seguro que `PerformanceStore`:
 *   - Particionado por `profileId`
 *   - Escritura atómica (.tmp → rename) con debounce + flush síncrono al cerrar la app
 *   - Idempotencia por `processedMatchIds`, techo diario de XP en Arena y CRUD de Build Orders personalizados
 */

const fs = require('node:fs');
const path = require('node:path');
const { inferPlanRule, planRuleKey, defaultTabForPlanRule } = require('./training-plan-verifier');

const SCHEMA_VERSION = 3;
const MAX_PROCESSED_MATCHES = 200;
const MAX_COMPLETED_LOG = 100;
const MAX_PACER_RUNS = 60;
const MAX_CUSTOM_BUILDS = 40;
const DAILY_ARENA_FULL_XP_RUNS = 3;
const ARENA_LOCKOUT_MS = 24 * 60 * 60 * 1000;
const ARENA_MAX_DAILY_ERRORS = 3;
const ARENA_MAX_LEVEL = 7;

const VALID_STEP_ICONS = new Set([
  'villager', 'food', 'sheep', 'boar', 'wood', 'berries', 'gold', 'stone',
  'building', 'age', 'barracks', 'stable', 'scout', 'sword', 'archer',
  'blacksmith', 'castle', 'market', 'gunpowder', 'shield', 'relic',
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function clampInt(val, min, max, fallback = min) {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeCustomStep(step, idx) {
  const alloc = step?.alloc && typeof step.alloc === 'object' ? step.alloc : {};
  const food = clampInt(alloc.food, 0, 200, 6);
  const wood = clampInt(alloc.wood, 0, 200, 0);
  const gold = clampInt(alloc.gold, 0, 200, 0);
  const stone = clampInt(alloc.stone, 0, 200, 0);
  const builders = clampInt(step?.builders, 0, 50, 0);
  const totalVills = food + wood + gold + stone + builders;
  const age = clampInt(step?.age, 1, 4, 1);
  const defaultGameSec = idx === 0 ? 0 : Math.max(20, totalVills * 25 - 75);
  const gameSec = clampInt(step?.gameSec, 0, 7200, defaultGameSec);
  const rawPop = String(step?.pop || '').trim();
  const popCap = Math.ceil((totalVills + 2) / 5) * 5;
  const pop = rawPop || `${String(totalVills + 1).padStart(2, '0')}/${String(Math.max(5, popCap)).padStart(2, '0')}`;
  const title = String(step?.title || step?.text || `Paso ${idx + 1}`).trim().slice(0, 140) || `Paso ${idx + 1}`;
  const note = String(step?.note || '').trim().slice(0, 220);
  const rawIcons = Array.isArray(step?.icons) ? step.icons : [];
  const icons = rawIcons.filter((ic) => VALID_STEP_ICONS.has(String(ic))).slice(0, 3);
  if (!icons.length) {
    if (food >= wood && food >= gold) icons.push('food');
    else if (wood >= gold) icons.push('wood');
    else icons.push('gold');
  }
  return {
    id: String(step?.id || `st_${idx + 1}`),
    age,
    pop,
    gameSec,
    alloc: { food, wood, gold, stone },
    builders,
    icons,
    title,
    text: title,
    note,
  };
}

function sanitizeCustomBuild(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || raw.key || '').startsWith('cbo_')
    ? String(raw.id || raw.key)
    : `cbo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const name = String(raw.name || 'Mi Orden Personalizada').trim().slice(0, 80) || 'Mi Orden Personalizada';
  const shortName = String(raw.shortName || name).trim().slice(0, 36) || name.slice(0, 36);
  const civSlug = String(raw.civSlug || '').trim().toLowerCase().slice(0, 32);
  const mapName = String(raw.mapName || 'Arabia').trim().slice(0, 40) || 'Arabia';
  const mapSlug = String(raw.mapSlug || 'arabia').trim().toLowerCase().slice(0, 32) || 'arabia';
  const artClass = String(raw.artClass || 'is-art-scouts').trim().slice(0, 40);
  const summary = String(raw.summary || 'Orden personalizada creada en el Estudio de Relic.').trim().slice(0, 240);

  const rawSteps = Array.isArray(raw.steps) && raw.steps.length ? raw.steps.slice(0, 25) : [
    { age: 1, pop: '06/05', gameSec: 0, alloc: { food: 6, wood: 0, gold: 0, stone: 0 }, icons: ['villager', 'sheep'], title: 'Construí 2 Casas y enviá 6 Aldeanos a ovejas', note: 'Cola continua en Centro Urbano.' },
  ];
  const steps = rawSteps.map((st, idx) => sanitizeCustomStep(st, idx));
  const feudalStep = steps.find((s) => s.age >= 2);
  const castleStep = steps.find((s) => s.age >= 3);
  const targetFeudalSec = clampInt(raw.targetFeudalSec, 240, 2400, feudalStep?.gameSec || 580);
  const targetCastleSec = clampInt(raw.targetCastleSec, 480, 3600, castleStep?.gameSec || 1120);

  return {
    id,
    key: id,
    isCustom: true,
    name,
    shortName,
    civSlug,
    mapName,
    mapSlug,
    artClass,
    difficulty: 'Personalizada',
    targetFeudalSec,
    targetCastleSec,
    summary,
    requiredNodes: Array.isArray(raw.requiredNodes) ? raw.requiredNodes.slice(0, 6) : [],
    matchOpenings: Array.isArray(raw.matchOpenings) ? raw.matchOpenings.slice(0, 6) : [],
    updatedAt: Date.now(),
    steps,
  };
}

function emptyProfileState() {
  return {
    updatedAt: Date.now(),
    xp: 0,
    verifiedCount: 0,
    sessionStreak: 0,
    lastSessionDay: null,
    targetEloTier: 1600,
    armedBuildOrderId: null,
    customBuilds: [],
    matchupLab: {
      myCivSlug: 'franks',
      rivalCivSlug: 'hindustanis',
      mapSlug: 'arabia',
    },
    medals: {},
    activeMissions: [],
    completedLog: [],
    processedMatchIds: [],
    trainingQueue: [],
    pacer: {
      selectedBuildKey: 'scouts-20pop',
      selectedCiv: '',
      clockSpeed: 1.7,
      soundEnabled: true,
      runs: [],
    },
    arena: {
      dailyDate: todayIso(),
      dailyRuns: 0,
      dailyErrors: 0,
      lockedUntilTs: null,
      unlockedLevel: 1,
      selectedLevel: 1,
      levelCorrectCount: 0,
      unlockedUnits: [],
      masteryCompleted: false,
      prestigeCycles: 0,
      answeredCorrectIds: [],
      activeQuestionByLevel: {},
      totalAnswered: 0,
      totalCorrect: 0,
      bestStreak: 0,
      currentStreak: 0,
      answered: 0,
      correct: 0,
      byMode: {},
      byLevel: {},
    },
  };
}

class TrainingStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { version: SCHEMA_VERSION, profiles: {} };
    this._timer = null;
    this._dirty = false;
    this._load();
  }

  _load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.profiles && typeof parsed.profiles === 'object') {
        this.data = { version: SCHEMA_VERSION, profiles: parsed.profiles };
      }
    } catch (_) {
      this.data = { version: SCHEMA_VERSION, profiles: {} };
    }
  }

  getProfile(profileId, now = Date.now()) {
    const key = String(profileId || 'default');
    if (!this.data.profiles[key]) {
      this.data.profiles[key] = emptyProfileState();
    }
    const p = this.data.profiles[key];
    const today = todayIso();
    if (!p.arena) p.arena = emptyProfileState().arena;
    if (p.arena.dailyDate !== today) {
      p.arena.dailyDate = today;
      p.arena.dailyRuns = 0;
    }
    if (!Number.isFinite(p.arena.dailyErrors)) p.arena.dailyErrors = 0;
    if (p.arena.lockedUntilTs === undefined) p.arena.lockedUntilTs = null;
    if (!Number.isFinite(p.arena.unlockedLevel) || p.arena.unlockedLevel < 1) p.arena.unlockedLevel = 1;
    p.arena.unlockedLevel = Math.min(ARENA_MAX_LEVEL, Math.round(p.arena.unlockedLevel));
    if (!Number.isFinite(p.arena.selectedLevel) || p.arena.selectedLevel < 1) p.arena.selectedLevel = p.arena.unlockedLevel;
    p.arena.selectedLevel = Math.min(p.arena.unlockedLevel, Math.max(1, Math.round(p.arena.selectedLevel)));
    if (!Number.isFinite(p.arena.levelCorrectCount) || p.arena.levelCorrectCount < 0) p.arena.levelCorrectCount = 0;
    if (!Array.isArray(p.arena.unlockedUnits)) p.arena.unlockedUnits = [];
    if (typeof p.arena.masteryCompleted !== 'boolean') p.arena.masteryCompleted = false;
    if (!Number.isFinite(p.arena.prestigeCycles)) p.arena.prestigeCycles = 0;
    if (!Array.isArray(p.arena.answeredCorrectIds)) p.arena.answeredCorrectIds = [];
    if (!p.arena.activeQuestionByLevel || typeof p.arena.activeQuestionByLevel !== 'object') p.arena.activeQuestionByLevel = {};
    if (!Number.isFinite(p.arena.totalAnswered)) p.arena.totalAnswered = Number(p.arena.answered || 0);
    if (!Number.isFinite(p.arena.totalCorrect)) p.arena.totalCorrect = Number(p.arena.correct || 0);
    if (!p.arena.byLevel || typeof p.arena.byLevel !== 'object') p.arena.byLevel = {};
    this._normalizeArenaCooldown(p.arena, now);
    if (!p.pacer) p.pacer = emptyProfileState().pacer;
    if (!p.matchupLab || typeof p.matchupLab !== 'object') {
      p.matchupLab = { myCivSlug: 'franks', rivalCivSlug: 'hindustanis', mapSlug: 'arabia' };
    }
    if (!Number.isFinite(p.targetEloTier)) p.targetEloTier = 1600;
    if (p.armedBuildOrderId === undefined) p.armedBuildOrderId = null;
    if (!Array.isArray(p.customBuilds)) p.customBuilds = [];
    if (!p.medals) p.medals = {};
    if (!Array.isArray(p.activeMissions)) p.activeMissions = [];
    if (!Array.isArray(p.completedLog)) p.completedLog = [];
    if (!Array.isArray(p.processedMatchIds)) p.processedMatchIds = [];
    if (!Array.isArray(p.trainingQueue)) p.trainingQueue = [];
    // Normalizar claves semánticas y depurar duplicados activos ya guardados en disco
    if (p.trainingQueue.length) {
      const seenActiveKeys = new Set();
      const deduped = [];
      let changed = false;
      for (const entry of p.trainingQueue) {
        if (!entry || !entry.title) { changed = true; continue; }
        const rule = entry.verifyRule && entry.verifyRule.type ? entry.verifyRule : inferPlanRule(entry);
        const rKey = planRuleKey(rule, entry);
        if (!entry.ruleKey) { entry.ruleKey = rKey; changed = true; }
        if (!entry.done) {
          if (seenActiveKeys.has(rKey)) {
            changed = true;
            continue;
          }
          seenActiveKeys.add(rKey);
        }
        deduped.push(entry);
      }
      if (changed) {
        p.trainingQueue = deduped;
        this._dirty = true;
        this._scheduleFlush();
      }
    }
    return p;
  }

  touch(profileId) {
    const p = this.getProfile(profileId);
    p.updatedAt = Date.now();
    this._dirty = true;
    this._scheduleFlush();
  }

  recordSessionActivity(profileId) {
    const p = this.getProfile(profileId);
    const today = todayIso();
    if (p.lastSessionDay !== today) {
      p.sessionStreak = Number(p.sessionStreak || 0) + 1;
      p.lastSessionDay = today;
    }
    this.touch(profileId);
  }

  setTargetEloTier(profileId, tier) {
    const p = this.getProfile(profileId);
    const valid = [1200, 1400, 1600, 1800, 2000];
    p.targetEloTier = valid.includes(Number(tier)) ? Number(tier) : 1600;
    this.touch(profileId);
    return p.targetEloTier;
  }

  setMatchupLab(profileId, { myCivSlug, rivalCivSlug, mapSlug } = {}) {
    const p = this.getProfile(profileId);
    if (myCivSlug) p.matchupLab.myCivSlug = String(myCivSlug).toLowerCase();
    if (rivalCivSlug) p.matchupLab.rivalCivSlug = String(rivalCivSlug).toLowerCase();
    if (mapSlug) p.matchupLab.mapSlug = String(mapSlug).toLowerCase();
    this.touch(profileId);
    return p.matchupLab;
  }

  saveCustomBuild(profileId, rawBuild) {
    const p = this.getProfile(profileId);
    const clean = sanitizeCustomBuild(rawBuild);
    if (!clean) return null;
    const idx = p.customBuilds.findIndex((b) => b.id === clean.id || b.key === clean.id);
    if (idx >= 0) {
      p.customBuilds[idx] = clean;
    } else {
      p.customBuilds = [clean, ...p.customBuilds].slice(0, MAX_CUSTOM_BUILDS);
    }
    p.pacer.selectedBuildKey = clean.id;
    if (clean.civSlug) p.pacer.selectedCiv = clean.civSlug;
    this.recordSessionActivity(profileId);
    return clean;
  }

  deleteCustomBuild(profileId, buildId) {
    const p = this.getProfile(profileId);
    const id = String(buildId || '');
    p.customBuilds = p.customBuilds.filter((b) => b.id !== id && b.key !== id);
    if (p.armedBuildOrderId === id) p.armedBuildOrderId = null;
    if (p.pacer.selectedBuildKey === id) p.pacer.selectedBuildKey = 'scouts-20pop';
    this.touch(profileId);
    return true;
  }

  setArmedBuildOrder(profileId, buildIdOrNull) {
    const p = this.getProfile(profileId);
    p.armedBuildOrderId = buildIdOrNull ? String(buildIdOrNull) : null;
    if (p.armedBuildOrderId) {
      p.pacer.selectedBuildKey = p.armedBuildOrderId;
    }
    this.touch(profileId);
    return p.armedBuildOrderId;
  }

  addTrainingQueueItem(profileId, item = {}) {
    const p = this.getProfile(profileId);
    const title = String(item.title || '').trim().slice(0, 120);
    if (!title) return { duplicate: false, itemId: null, trainingQueue: p.trainingQueue };
    const nowTs = Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now();
    const verifyRule = item.verifyRule && item.verifyRule.type ? item.verifyRule : inferPlanRule(item);
    const ruleKey = planRuleKey(verifyRule, item);
    const rawId = String(item.id || `${ruleKey.replace(/[^a-z0-9:_-]+/gi, '_')}`);

    // Bloqueo estricto de duplicados activos: mismo ID o misma clave semántica de objetivo
    const existingActive = p.trainingQueue.find((x) => {
      if (!x || x.done) return false;
      if (x.id === rawId) return true;
      const xRule = x.verifyRule && x.verifyRule.type ? x.verifyRule : inferPlanRule(x);
      return (x.ruleKey || planRuleKey(xRule, x)) === ruleKey;
    });
    if (existingActive) {
      return {
        duplicate: true,
        itemId: existingActive.id,
        existing: existingActive,
        trainingQueue: p.trainingQueue,
      };
    }

    const defaultTab = defaultTabForPlanRule(verifyRule);
    const targetTab = ['arena', 'orders', 'matchups', 'perf'].includes(item.targetTab)
      ? item.targetTab
      : defaultTab;

    // Si existía un item archivado/cumplido con el mismo id, generamos un id único para el nuevo intento
    const idTaken = p.trainingQueue.some((x) => x && x.id === rawId);
    const finalId = idTaken ? `${rawId}_${nowTs}` : rawId;

    p.trainingQueue = [
      {
        id: finalId,
        ruleKey,
        source: String(item.source || 'Postmatch').trim().slice(0, 24),
        title,
        detail: String(item.detail || '').trim().slice(0, 220),
        metric: String(item.metric || '').trim().slice(0, 48),
        civSlug: String(item.civSlug || '').trim().toLowerCase().slice(0, 32),
        targetTab,
        verifyRule,
        done: false,
        autoVerified: false,
        verifiedEvidence: null,
        verifiedMatchId: null,
        attemptsAfterPin: 0,
        lastCheckedDisplay: null,
        checkedMatchIds: [],
        createdAt: nowTs,
        addedAt: nowTs,
      },
      ...p.trainingQueue,
    ].slice(0, 30);
    this.touch(profileId);
    return {
      duplicate: false,
      itemId: finalId,
      trainingQueue: p.trainingQueue,
    };
  }

  saveEvaluatedTrainingQueue(profileId, updatedQueue = []) {
    const p = this.getProfile(profileId);
    p.trainingQueue = Array.isArray(updatedQueue) ? updatedQueue.slice(0, 30) : [];
    this.touch(profileId);
    this.flush();
    return p.trainingQueue;
  }

  toggleTrainingQueueItem(profileId, itemId) {
    const p = this.getProfile(profileId);
    const hit = p.trainingQueue.find((x) => x.id === String(itemId || ''));
    if (hit) {
      hit.done = !hit.done;
      hit.doneAt = hit.done ? Date.now() : null;
      this.touch(profileId);
    }
    return p.trainingQueue;
  }

  removeTrainingQueueItem(profileId, itemId) {
    const p = this.getProfile(profileId);
    p.trainingQueue = p.trainingQueue.filter((x) => x.id !== String(itemId || ''));
    this.touch(profileId);
    return p.trainingQueue;
  }

  clearCompletedTrainingQueueItems(profileId) {
    const p = this.getProfile(profileId);
    const prev = Array.isArray(p.trainingQueue) ? p.trainingQueue : [];
    const next = prev.filter((x) => x && !x.done);
    if (next.length !== prev.length) {
      p.trainingQueue = next;
      this.touch(profileId);
      this.flush();
    }
    return p.trainingQueue;
  }

  _normalizeArenaCooldown(arena, now = Date.now()) {
    if (!arena) return false;
    if (arena.lockedUntilTs != null && now >= arena.lockedUntilTs) {
      arena.lockedUntilTs = null;
      arena.dailyErrors = 0;
      this._dirty = true;
      return true;
    }
    if (arena.lockedUntilTs != null && arena.lockedUntilTs - now > ARENA_LOCKOUT_MS * 2) {
      arena.lockedUntilTs = now + ARENA_LOCKOUT_MS;
      this._dirty = true;
      return true;
    }
    return false;
  }

  getArenaSnapshot(profileId, { levelsConfig = [], catalogTotal = 0, now = Date.now() } = {}) {
    const p = this.getProfile(profileId, now);
    const a = p.arena;
    const mutated = this._normalizeArenaCooldown(a, now);
    if (mutated) this.touch(profileId);
    const locked = Boolean(a.lockedUntilTs && a.lockedUntilTs > now);
    const remainingMs = locked ? Math.max(0, a.lockedUntilTs - now) : 0;
    const activeCfg = levelsConfig.find((c) => c.level === a.unlockedLevel) || levelsConfig[0] || { requiredCorrect: 10 };
    const levelTarget = a.masteryCompleted ? 25 : Number(activeCfg.requiredCorrect || 10);
    return {
      locked,
      lockedUntilTs: locked ? a.lockedUntilTs : null,
      remainingMs,
      dailyErrors: Number(a.dailyErrors || 0),
      maxErrors: ARENA_MAX_DAILY_ERRORS,
      remainingLives: Math.max(0, ARENA_MAX_DAILY_ERRORS - Number(a.dailyErrors || 0)),
      unlockedLevel: a.unlockedLevel,
      selectedLevel: a.selectedLevel,
      levelCorrectCount: Number(a.levelCorrectCount || 0),
      levelTarget,
      unlockedUnits: Array.isArray(a.unlockedUnits) ? [...a.unlockedUnits] : [],
      masteryCompleted: Boolean(a.masteryCompleted),
      prestigeCycles: Number(a.prestigeCycles || 0),
      solvedCount: Array.isArray(a.answeredCorrectIds) ? a.answeredCorrectIds.length : 0,
      catalogTotal: Number(catalogTotal || 0),
      answered: Number(a.totalAnswered || 0),
      correct: Number(a.totalCorrect || 0),
      accuracyPct: a.totalAnswered ? Math.round((a.totalCorrect / a.totalAnswered) * 100) : null,
      currentStreak: Number(a.currentStreak || 0),
      bestStreak: Number(a.bestStreak || 0),
      dailyRuns: Number(a.dailyRuns || 0),
      dailyFullCap: DAILY_ARENA_FULL_XP_RUNS,
      levelsMeta: levelsConfig.map((cfg) => ({
        ...cfg,
        unlocked: cfg.level <= a.unlockedLevel,
        unitUnlocked: Array.isArray(a.unlockedUnits) && a.unlockedUnits.includes(cfg.unitKey),
        isCurrentTarget: !a.masteryCompleted && cfg.level === a.unlockedLevel,
      })),
    };
  }

  pinArenaQuestion(profileId, level, questionId, now = Date.now()) {
    const p = this.getProfile(profileId, now);
    const lvlKey = String(Math.max(1, Math.min(ARENA_MAX_LEVEL, Number(level) || 1)));
    p.arena.selectedLevel = Number(lvlKey);
    if (!p.arena.activeQuestionByLevel || typeof p.arena.activeQuestionByLevel !== 'object') {
      p.arena.activeQuestionByLevel = {};
    }
    p.arena.activeQuestionByLevel[lvlKey] = String(questionId || '');
    this._dirty = true;
    this._scheduleFlush();
    return p.arena.activeQuestionByLevel[lvlKey];
  }

  recordArenaAnswer(profileId, { questionId, level, isCorrect, timedOut = false, levelConfig, now = Date.now() }) {
    const p = this.getProfile(profileId, now);
    const a = p.arena;
    this._normalizeArenaCooldown(a, now);
    if (a.lockedUntilTs && a.lockedUntilTs > now) {
      return { ok: false, locked: true, lockedUntilTs: a.lockedUntilTs, remainingMs: a.lockedUntilTs - now };
    }

    const lvl = Math.max(1, Math.min(ARENA_MAX_LEVEL, Number(level) || 1));
    const lvlKey = String(lvl);
    a.totalAnswered = Number(a.totalAnswered || 0) + 1;
    a.answered = a.totalAnswered;
    if (!a.byLevel[lvlKey]) a.byLevel[lvlKey] = { answered: 0, correct: 0 };
    a.byLevel[lvlKey].answered += 1;

    if (a.activeQuestionByLevel) {
      delete a.activeQuestionByLevel[lvlKey];
    }

    let xpEarned = 0;
    let leveledUp = false;
    let prestigeUp = false;
    let unlockedUnit = null;
    let lockedNow = false;

    if (isCorrect) {
      a.totalCorrect = Number(a.totalCorrect || 0) + 1;
      a.correct = a.totalCorrect;
      a.byLevel[lvlKey].correct += 1;
      a.currentStreak = Number(a.currentStreak || 0) + 1;
      a.bestStreak = Math.max(Number(a.bestStreak || 0), a.currentStreak);
      if (questionId && !a.answeredCorrectIds.includes(questionId)) {
        a.answeredCorrectIds.push(questionId);
        if (a.answeredCorrectIds.length > 600) {
          a.answeredCorrectIds = a.answeredCorrectIds.slice(-600);
        }
      }
      xpEarned = 10 + lvl * 4;
      p.xp = Number(p.xp || 0) + xpEarned;

      if (lvl === a.unlockedLevel) {
        if (!a.masteryCompleted) {
          a.levelCorrectCount = Number(a.levelCorrectCount || 0) + 1;
          const req = Number(levelConfig?.requiredCorrect || 10);
          if (a.levelCorrectCount >= req) {
            if (levelConfig?.unitKey && !a.unlockedUnits.includes(levelConfig.unitKey)) {
              a.unlockedUnits.push(levelConfig.unitKey);
            }
            leveledUp = true;
            unlockedUnit = levelConfig || null;
            if (a.unlockedLevel < ARENA_MAX_LEVEL) {
              a.unlockedLevel += 1;
              a.selectedLevel = a.unlockedLevel;
              a.levelCorrectCount = 0;
            } else {
              a.masteryCompleted = true;
              a.levelCorrectCount = 0;
              a.prestigeCycles = Math.max(1, Number(a.prestigeCycles || 0));
            }
          }
        } else {
          a.levelCorrectCount = Number(a.levelCorrectCount || 0) + 1;
          if (a.levelCorrectCount >= 25) {
            a.prestigeCycles = Number(a.prestigeCycles || 0) + 1;
            a.levelCorrectCount = 0;
            prestigeUp = true;
            xpEarned += 250;
            p.xp += 250;
          }
        }
      }
      this.recordSessionActivity(profileId);
      if (leveledUp || prestigeUp) this.flush();
    } else {
      a.currentStreak = 0;
      a.dailyErrors = Math.min(ARENA_MAX_DAILY_ERRORS, Number(a.dailyErrors || 0) + 1);
      if (a.dailyErrors >= ARENA_MAX_DAILY_ERRORS) {
        a.lockedUntilTs = now + ARENA_LOCKOUT_MS;
        lockedNow = true;
        this._dirty = true;
        this.flush();
      } else {
        this.touch(profileId);
      }
    }

    return {
      ok: true,
      isCorrect: Boolean(isCorrect),
      timedOut: Boolean(timedOut),
      xpEarned,
      leveledUp,
      prestigeUp,
      unlockedUnit,
      dailyErrors: a.dailyErrors,
      remainingLives: Math.max(0, ARENA_MAX_DAILY_ERRORS - a.dailyErrors),
      lockedNow,
      lockedUntilTs: a.lockedUntilTs,
    };
  }

  awardArenaRun(profileId, { mode = 'mixed', answered = 0, correct = 0, bestStreak = 0 } = {}) {
    const p = this.getProfile(profileId);
    const today = todayIso();
    if (p.arena.dailyDate !== today) {
      p.arena.dailyDate = today;
      p.arena.dailyRuns = 0;
    }
    p.arena.dailyRuns += 1;
    p.arena.answered = Number(p.arena.answered || 0) + Math.max(0, Number(answered || 0));
    p.arena.correct = Number(p.arena.correct || 0) + Math.max(0, Number(correct || 0));
    p.arena.bestStreak = Math.max(Number(p.arena.bestStreak || 0), Number(bestStreak || 0));
    if (!p.arena.byMode) p.arena.byMode = {};
    if (!p.arena.byMode[mode]) p.arena.byMode[mode] = { answered: 0, correct: 0 };
    p.arena.byMode[mode].answered += Math.max(0, Number(answered || 0));
    p.arena.byMode[mode].correct += Math.max(0, Number(correct || 0));

    const fullRate = p.arena.dailyRuns <= DAILY_ARENA_FULL_XP_RUNS;
    const xpEarned = Math.round(Math.max(0, Number(correct || 0)) * (fullRate ? 12 : 3));
    p.xp = Number(p.xp || 0) + xpEarned;
    if (correct > 0) this.recordSessionActivity(profileId);
    else this.touch(profileId);

    return {
      xpEarned,
      fullRate,
      dailyRuns: p.arena.dailyRuns,
      dailyFullCap: DAILY_ARENA_FULL_XP_RUNS,
      totalXp: p.xp,
    };
  }

  recordPacerRun(profileId, { buildKey, civ = '', elapsedGameSec = 0, clockSpeed = 1.7 } = {}) {
    const p = this.getProfile(profileId);
    p.pacer.selectedBuildKey = buildKey || p.pacer.selectedBuildKey;
    p.pacer.selectedCiv = civ;
    p.pacer.clockSpeed = clockSpeed;
    p.pacer.runs = [
      { buildKey, civ, elapsedGameSec: Math.round(Number(elapsedGameSec || 0)), at: Date.now() },
      ...(Array.isArray(p.pacer.runs) ? p.pacer.runs : []),
    ].slice(0, MAX_PACER_RUNS);
    this.recordSessionActivity(profileId);
  }

  markMissionCompletions(profileId, matchId, updatedMissions, newlyCompleted = []) {
    const p = this.getProfile(profileId);
    p.activeMissions = updatedMissions;
    if (matchId && !p.processedMatchIds.includes(matchId)) {
      p.processedMatchIds = [matchId, ...p.processedMatchIds].slice(0, MAX_PROCESSED_MATCHES);
    }
    const xpByTier = { bronze: 60, silver: 100, gold: 160, obsidian: 240 };
    for (const c of newlyCompleted) {
      if (!Array.isArray(p.medals[c.familyId])) p.medals[c.familyId] = [];
      if (!p.medals[c.familyId].includes(c.tierKey)) p.medals[c.familyId].push(c.tierKey);
      p.verifiedCount = Number(p.verifiedCount || 0) + 1;
      p.xp = Number(p.xp || 0) + (xpByTier[c.tierKey] || 80);
      p.completedLog = [{ ...c, completedAt: Date.now() }, ...p.completedLog].slice(0, MAX_COMPLETED_LOG);
    }
    if (newlyCompleted.length) this.recordSessionActivity(profileId);
    else this.touch(profileId);
  }

  _scheduleFlush() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flushAsync().catch(() => {});
    }, 400);
    this._timer.unref?.();
  }

  async flushAsync() {
    if (!this._dirty || !this.filePath) return;
    this._dirty = false;
    const dir = path.dirname(this.filePath);
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(tmp, this.filePath);
  }

  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (!this._dirty || !this.filePath) return;
    this._dirty = false;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.filePath);
    } catch (_) {}
  }
}

module.exports = {
  TrainingStore,
  DAILY_ARENA_FULL_XP_RUNS,
  ARENA_LOCKOUT_MS,
  ARENA_MAX_DAILY_ERRORS,
  ARENA_MAX_LEVEL,
  sanitizeCustomBuild,
};
