/* ============================================================================
   RELIC — Entrenamiento de APM y Micro AoE2:DE (ui/apm-trainer.js)
   - 3 modos nativos con retratos oficiales de AoE2:DE (Caza de Unidad, Counter
     Relámpago y Reflejos) sobre duraciones 30s (estándar oficial) y 60s.
   - Integración bidireccional con «Mi Plan» (verificación automática `apm_drill`
     + sugerencias basadas en telemetría real de Progreso).
   - Ranking Global de Relic (30s estándar · nombre AoE2:DE + ELO 1v1, cero Gmail).
   - Renderizado HiDPI en <canvas>, 100% CSP-safe (0 estilos inline), Clásico + Ultra OLED.
   ============================================================================ */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'relic_apm_trainer_v1';

  function t(key, fallback, vars = null) {
    const api = root.AppI18n;
    if (api && typeof api.t === 'function') {
      const val = api.t(key, vars || undefined);
      if (val && val !== key) return val;
    }
    if (!vars) return fallback;
    return String(fallback).replace(/\{(\w+)\}/g, (_m, k) => (vars[k] != null ? String(vars[k]) : ''));
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    const v = Math.round(Number(n) || 0);
    try {
      const loc = root.AppI18n?.getLocale?.() || 'es-MX';
      return v.toLocaleString(loc === 'en' ? 'en-US' : (loc === 'zh-CN' ? 'zh-CN' : 'es-AR'));
    } catch (_) {
      return String(v);
    }
  }

  function locUnit(nameEs, nameEn) {
    const api = root.AppI18n;
    if (api && typeof api.unit === 'function') {
      const u = api.unit(nameEn || nameEs);
      if (u && u !== (nameEn || nameEs)) return u;
    }
    const loc = api && typeof api.getLocale === 'function' ? api.getLocale() : 'es-MX';
    if (loc === 'en' && nameEn) return nameEn;
    return nameEs || nameEn || '';
  }

  // Catálogo verificado con iconos oficiales locales (assets/icons/aoe2/u_*.png)
  const UNITS = {
    monk:          { id: 'monk',          icon: 'assets/icons/aoe2/u_218.png', es: 'Monje',                   en: 'Monk',              uu: false },
    mangonel:      { id: 'mangonel',      icon: 'assets/icons/aoe2/u_27.png',  es: 'Mangonel',                en: 'Mangonel',          uu: false },
    knight:        { id: 'knight',        icon: 'assets/icons/aoe2/u_1.png',   es: 'Jinete',                  en: 'Knight',            uu: false },
    xbow:          { id: 'xbow',          icon: 'assets/icons/aoe2/u_18.png',  es: 'Ballestero',              en: 'Crossbowman',       uu: false },
    pikeman:       { id: 'pikeman',       icon: 'assets/icons/aoe2/u_11.png',  es: 'Piquero',                 en: 'Pikeman',           uu: false },
    skirm:         { id: 'skirm',         icon: 'assets/icons/aoe2/u_21.png',  es: 'Guerrillero de élite',    en: 'Elite Skirmisher',  uu: false },
    camel:         { id: 'camel',         icon: 'assets/icons/aoe2/u_78.png',  es: 'Jinete de camello',       en: 'Camel Rider',       uu: false },
    hussar:        { id: 'hussar',        icon: 'assets/icons/aoe2/u_103.png', es: 'Húsar',                   en: 'Hussar',            uu: false },
    cavArcher:     { id: 'cavArcher',     icon: 'assets/icons/aoe2/u_19.png',  es: 'Arquero a caballo',       en: 'Cavalry Archer',    uu: false },
    handCannoneer: { id: 'handCannoneer', icon: 'assets/icons/aoe2/u_22.png',  es: 'Artillero manual',        en: 'Hand Cannoneer',    uu: false },
    champion:      { id: 'champion',      icon: 'assets/icons/aoe2/u_72.png',  es: 'Campeón',                 en: 'Champion',          uu: false },
    eagle:         { id: 'eagle',         icon: 'assets/icons/aoe2/u_148.png', es: 'Guerrero águila',         en: 'Eagle Warrior',     uu: false },
    bbc:           { id: 'bbc',           icon: 'assets/icons/aoe2/u_30.png',  es: 'Cañón de asedio',         en: 'Bombard Cannon',    uu: false },
    huskarl:       { id: 'huskarl',       icon: 'assets/icons/aoe2/u_50.png',  es: 'Huscarle',                en: 'Huskarl',           uu: true },
    conquistador:  { id: 'conquistador',  icon: 'assets/icons/aoe2/u_106.png', es: 'Conquistador',            en: 'Conquistador',      uu: true },
    mangudai:      { id: 'mangudai',      icon: 'assets/icons/aoe2/u_42.png',  es: 'Mangudai',                en: 'Mangudai',          uu: true },
    longbow:       { id: 'longbow',       icon: 'assets/icons/aoe2/u_41.png',  es: 'Arquero con arco largo',  en: 'Longbowman',        uu: true },
    warEle:        { id: 'warEle',        icon: 'assets/icons/aoe2/u_43.png',  es: 'Elefante de guerra',      en: 'War Elephant',      uu: true },
    janissary:     { id: 'janissary',     icon: 'assets/icons/aoe2/u_39.png',  es: 'Jenízaro',                en: 'Janissary',         uu: true },
    samurai:       { id: 'samurai',       icon: 'assets/icons/aoe2/u_44.png',  es: 'Samurái',                 en: 'Samurai',           uu: true },
    cataphract:    { id: 'cataphract',    icon: 'assets/icons/aoe2/u_35.png',  es: 'Catafracta',              en: 'Cataphract',        uu: true },
    chukonu:       { id: 'chukonu',       icon: 'assets/icons/aoe2/u_36.png',  es: 'Chu Ko Nu',               en: 'Chu Ko Nu',         uu: true },
    axeman:        { id: 'axeman',        icon: 'assets/icons/aoe2/u_46.png',  es: 'Lanzador de hachas',      en: 'Throwing Axeman',   uu: true },
    teutonic:      { id: 'teutonic',      icon: 'assets/icons/aoe2/u_45.png',  es: 'Caballero teutónico',     en: 'Teutonic Knight',   uu: true },
  };

  const UNIT_IDS = Object.keys(UNITS);

  const SNIPE_TARGETS = [
    'monk', 'mangonel', 'bbc', 'huskarl', 'conquistador', 'mangudai',
    'warEle', 'janissary', 'longbow', 'cataphract', 'knight', 'xbow',
    'eagle', 'chukonu', 'teutonic', 'samurai',
  ];

  const COUNTER_DRILLS = [
    { threat: 'knight',     counters: ['pikeman', 'camel', 'monk'],            decoys: ['xbow', 'skirm', 'mangonel', 'hussar', 'champion'] },
    { threat: 'xbow',       counters: ['skirm', 'mangonel', 'huskarl'],        decoys: ['pikeman', 'champion', 'camel', 'monk', 'teutonic'] },
    { threat: 'monk',       counters: ['hussar', 'eagle'],                     decoys: ['knight', 'warEle', 'teutonic', 'pikeman', 'bbc'] },
    { threat: 'mangonel',   counters: ['bbc', 'hussar', 'mangudai'],           decoys: ['xbow', 'skirm', 'pikeman', 'chukonu', 'longbow'] },
    { threat: 'huskarl',    counters: ['champion', 'handCannoneer', 'teutonic'], decoys: ['xbow', 'longbow', 'skirm', 'chukonu', 'monk'] },
    { threat: 'warEle',     counters: ['monk', 'pikeman'],                     decoys: ['hussar', 'skirm', 'champion', 'xbow', 'mangonel'] },
    { threat: 'longbow',    counters: ['huskarl', 'skirm', 'mangonel'],        decoys: ['pikeman', 'champion', 'teutonic', 'axeman', 'samurai'] },
    { threat: 'cavArcher',  counters: ['skirm', 'camel'],                      decoys: ['pikeman', 'champion', 'teutonic', 'bbc', 'axeman'] },
    { threat: 'eagle',      counters: ['champion', 'handCannoneer', 'axeman'], decoys: ['monk', 'skirm', 'pikeman', 'xbow', 'longbow'] },
    { threat: 'cataphract', counters: ['xbow', 'knight'],                      decoys: ['pikeman', 'champion', 'eagle', 'huskarl', 'samurai'] },
    { threat: 'teutonic',   counters: ['handCannoneer', 'longbow', 'xbow'],    decoys: ['champion', 'pikeman', 'hussar', 'huskarl', 'eagle'] },
    { threat: 'camel',      counters: ['pikeman', 'xbow'],                     decoys: ['knight', 'hussar', 'warEle', 'mangonel', 'conquistador'] },
  ];

  const imgCache = new Map();
  function getUnitImage(unitId) {
    const def = UNITS[unitId];
    if (!def) return null;
    if (imgCache.has(unitId)) return imgCache.get(unitId);
    const img = new Image();
    img.src = def.icon;
    imgCache.set(unitId, img);
    return img;
  }

  function preloadIcons() {
    for (const id of UNIT_IDS) getUnitImage(id);
  }

  function loadStats() {
    try {
      const raw = root.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return { best: {}, history: [] };
      const parsed = JSON.parse(raw);
      return {
        best: parsed && typeof parsed.best === 'object' && parsed.best ? parsed.best : {},
        history: Array.isArray(parsed?.history) ? parsed.history.filter((h) => h && h.durationSec !== 15).slice(0, 24) : [],
      };
    } catch (_) {
      return { best: {}, history: [] };
    }
  }

  function saveStats(stats) {
    try {
      root.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
        best: stats.best || {},
        history: (stats.history || []).slice(0, 24),
      }));
    } catch (_) {}
  }

  function modeLabel(mode) {
    if (mode === 'counter') return t('apm.modeCounter', 'Counter Relámpago');
    if (mode === 'reflex') return t('apm.modeReflex', 'Reflejos');
    return t('apm.modeSnipe', 'Caza de Unidad');
  }

  function computeNextPlanTarget(mode, currentEapm = 0, currentAcc = 85) {
    const base = mode === 'reflex' ? 96 : (mode === 'counter' ? 46 : 58);
    const step = mode === 'reflex' ? 14 : 10;
    const rawTarget = currentEapm > 0 ? Math.max(base, Math.ceil((currentEapm + step) / 5) * 5) : base;
    const maxCap = mode === 'reflex' ? 165 : (mode === 'counter' ? 85 : 105);
    const targetEapm = Math.min(maxCap, rawTarget);
    const targetAcc = Math.max(82, Math.min(92, currentAcc >= 90 ? 90 : 85));
    return { targetEapm, targetAcc };
  }

  function computeRecommendedDrillFromPerf(highElo) {
    if (!highElo || !highElo.hasData) return null;
    const metrics = Array.isArray(highElo.metrics) ? highElo.metrics : [];
    const eapmM = metrics.find((m) => m.key === 'eapm' && m.hasSample);
    const diag = highElo.primaryDiagnosis || null;
    if (diag?.metricKey === 'eapm' || (eapmM && eapmM.improved === false)) {
      return {
        mode: 'reflex',
        durationSec: 30,
        reason: t('apm.recReasonEapm', 'Tu ritmo efectivo reciente ({val}) tiene margen para subir: 2 rondas de Reflejos antes de rankear activan el cursor.', { val: eapmM?.currentDisplay || 'eAPM' }),
        targetEapm: 95,
        targetAcc: 86,
      };
    }
    if (diag?.metricKey === 'tcIdleFeudalPerTcSec' || diag?.metricKey === 'castleSec') {
      return {
        mode: 'snipe',
        durationSec: 30,
        reason: t('apm.recReasonSnipe', 'Entrená Caza de Unidad (30s) para seleccionar unidades clave rápido sin soltar la economía en Feudal y Castillos.'),
        targetEapm: 60,
        targetAcc: 86,
      };
    }
    return {
      mode: 'counter',
      durationSec: 30,
      reason: t('apm.recReasonCounter', 'Afilá reflejos tácticos con Counter Relámpago (30s) para reaccionar al instante a la composición rival.'),
      targetEapm: 46,
      targetAcc: 85,
    };
  }

  function evaluateGrade(mode, eApm, accuracy) {
    const thresholds = mode === 'reflex'
      ? [
          { grade: 'S+', minApm: 150, minAcc: 92, tierKey: 'apm.tierPro',    tierFb: 'Nivel Pro · +2000 ELO' },
          { grade: 'S',  minApm: 120, minAcc: 88, tierKey: 'apm.tierMaster', tierFb: 'Nivel Maestro · 1700–2000 ELO' },
          { grade: 'A',  minApm: 94,  minAcc: 82, tierKey: 'apm.tierComp',   tierFb: 'Nivel Competitivo · 1400–1700 ELO' },
          { grade: 'B',  minApm: 68,  minAcc: 74, tierKey: 'apm.tierSolid',  tierFb: 'Nivel Sólido · 1100–1400 ELO' },
          { grade: 'C',  minApm: 44,  minAcc: 0,  tierKey: 'apm.tierDev',    tierFb: 'En desarrollo · 850–1100 ELO' },
        ]
      : mode === 'counter'
        ? [
            { grade: 'S+', minApm: 72, minAcc: 90, tierKey: 'apm.tierPro',    tierFb: 'Nivel Pro · +2000 ELO' },
            { grade: 'S',  minApm: 56, minAcc: 86, tierKey: 'apm.tierMaster', tierFb: 'Nivel Maestro · 1700–2000 ELO' },
            { grade: 'A',  minApm: 42, minAcc: 80, tierKey: 'apm.tierComp',   tierFb: 'Nivel Competitivo · 1400–1700 ELO' },
            { grade: 'B',  minApm: 28, minAcc: 70, tierKey: 'apm.tierSolid',  tierFb: 'Nivel Sólido · 1100–1400 ELO' },
            { grade: 'C',  minApm: 16, minAcc: 0,  tierKey: 'apm.tierDev',    tierFb: 'En desarrollo · 850–1100 ELO' },
          ]
        : [
            { grade: 'S+', minApm: 92, minAcc: 90, tierKey: 'apm.tierPro',    tierFb: 'Nivel Pro · +2000 ELO' },
            { grade: 'S',  minApm: 72, minAcc: 86, tierKey: 'apm.tierMaster', tierFb: 'Nivel Maestro · 1700–2000 ELO' },
            { grade: 'A',  minApm: 54, minAcc: 80, tierKey: 'apm.tierComp',   tierFb: 'Nivel Competitivo · 1400–1700 ELO' },
            { grade: 'B',  minApm: 38, minAcc: 72, tierKey: 'apm.tierSolid',  tierFb: 'Nivel Sólido · 1100–1400 ELO' },
            { grade: 'C',  minApm: 22, minAcc: 0,  tierKey: 'apm.tierDev',    tierFb: 'En desarrollo · 850–1100 ELO' },
          ];
    for (const row of thresholds) {
      if (eApm >= row.minApm && accuracy >= row.minAcc) {
        return { grade: row.grade, tier: t(row.tierKey, row.tierFb) };
      }
    }
    return { grade: 'D', tier: t('apm.tierWarmup', 'Calentamiento · Seguí sumando ritmo') };
  }

  function buildCoachingNote({ mode, hits, misses, decoyHits, accuracy, avgReactionMs }) {
    if (hits === 0) {
      return t('apm.noteNoHits', 'Sin aciertos registrados en esta ronda. Empezá priorizando precisión antes que velocidad.');
    }
    if (decoyHits >= 3 && decoyHits >= Math.ceil(misses * 0.5)) {
      return mode === 'counter'
        ? t('apm.noteCounterDecoy', 'Tocaste {n} unidades que no eran counter. Tomate medio segundo extra para leer la amenaza arriba.', { n: decoyHits })
        : t('apm.noteSnipeDecoy', 'Tocaste {n} señuelos. Fijá la vista en el retrato objetivo antes de mover el cursor.', { n: decoyHits });
    }
    if (accuracy < 80) {
      return t('apm.noteLowAcc', 'Velocidad alta pero precisión baja ({acc}%). Bajá un 10% el ritmo para clavar +90% y subir tu eAPM real.', { acc: accuracy });
    }
    if (accuracy >= 94 && avgReactionMs > 460) {
      return t('apm.noteHighAccSlow', 'Precisión impecable ({acc}%). Ya dominás el clic limpio: animate a acelerar la transición entre unidades.', { acc: accuracy });
    }
    if (accuracy >= 92 && avgReactionMs > 0 && avgReactionMs <= 340) {
      return t('apm.noteElite', 'Ritmo y precisión de nivel alto ({ms} ms medios, {acc}%). Listo para entrar a ranked en caliente.', { ms: avgReactionMs, acc: accuracy });
    }
    return t('apm.noteBalanced', 'Buen equilibrio entre velocidad y control ({acc}% precisión · {ms} ms). Repetí 1–2 rondas para bajar tu tiempo de reacción.', { acc: accuracy, ms: avgReactionMs });
  }

  function isUltraTheme() {
    try { return root.document?.body?.dataset?.theme === 'ultra'; } catch (_) { return false; }
  }

  function getPalette() {
    if (isUltraTheme()) {
      return {
        bg: '#040406',
        grid: 'rgba(255, 255, 255, 0.032)',
        bezelFill: '#0c0c10',
        bezelBorder: 'rgba(255, 255, 255, 0.16)',
        ringTrack: 'rgba(255, 255, 255, 0.09)',
        ringActive: '#e4e4e7',
        ringUrgent: '#f87171',
        hitGood: '#c084fc',
        hitFast: '#e8c068',
        miss: '#f87171',
        timerTrack: 'rgba(255, 255, 255, 0.08)',
        timerFill: '#ffffff',
        comboText: '#e4e4e7',
      };
    }
    return {
      bg: '#0a0f15',
      grid: 'rgba(214, 184, 117, 0.04)',
      bezelFill: '#141c26',
      bezelBorder: 'rgba(214, 184, 117, 0.30)',
      ringTrack: 'rgba(255, 255, 255, 0.09)',
      ringActive: '#f2d799',
      ringUrgent: '#ef8a81',
      hitGood: '#78d8a6',
      hitFast: '#faf0d4',
      miss: '#ef8a81',
      timerTrack: 'rgba(255, 255, 255, 0.08)',
      timerFill: '#f2d799',
      comboText: '#f2d799',
    };
  }

  function pickRandom(list, exclude = null) {
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    let choice = list[Math.floor(Math.random() * list.length)];
    let guard = 0;
    while (choice === exclude && guard < 8) {
      choice = list[Math.floor(Math.random() * list.length)];
      guard += 1;
    }
    return choice;
  }

  function computeStdDev(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.round(Math.sqrt(variance) * 10) / 10;
  }

  function createApmTrainerController({ onNotifyRender, onQueueUpdated, onAddPlanGoal } = {}) {
    let mode = 'snipe'; // 'snipe' | 'counter' | 'reflex'
    let durationSec = 30; // 30 (estándar oficial) | 60
    let phase = 'idle'; // 'idle' | 'running' | 'summary'
    let stats = loadStats();

    // Contexto de Entrenamiento + Mi Plan + Ranking Global
    let trainingContext = { trainingQueue: [], highElo: null };
    const leaderboardCache = {}; // mode -> { loading, error, data, fetchedAt }
    let planPinFeedback = '';

    // Runtime state
    let mountRoot = null;
    let canvas = null;
    let ctx = null;
    let rafId = null;
    let lastFrameTs = 0;
    let roundStartMs = 0;
    let roundEndMs = 0;
    let remainingMs = durationSec * 1000;
    let hits = 0;
    let misses = 0;
    let decoyHits = 0;
    let expiredTargets = 0;
    let streak = 0;
    let maxStreak = 0;
    let reactionTimes = [];
    let lastHitTs = 0;
    let nextTargetId = 1;

    let snipeUnitId = 'monk';
    let snipeHitsOnCurrent = 0;
    let snipeSwitchAtMs = 0;
    let counterDrillIdx = 0;
    let counterHitsOnCurrent = 0;
    let counterHintText = '';
    let counterHintUntilMs = 0;

    let tokens = [];
    let ripples = [];
    let lastResult = null;
    let resizeObs = null;
    let keydownHandler = null;
    let hudUpdateAccum = 0;

    function playSfx(kind) {
      try {
        if (typeof root.UiSfx === 'object' && typeof root.UiSfx.play === 'function') {
          root.UiSfx.play(kind);
        }
      } catch (_) {}
    }

    function stopLoop() {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
      if (resizeObs) { try { resizeObs.disconnect(); } catch (_) {} resizeObs = null; }
      if (keydownHandler) { root.removeEventListener('keydown', keydownHandler); keydownHandler = null; }
    }

    function resetToIdle() {
      stopLoop();
      phase = 'idle';
      remainingMs = durationSec * 1000;
      tokens = [];
      ripples = [];
      lastResult = null;
      counterHintText = '';
      planPinFeedback = '';
    }

    function getActivePlanGoalForCurrentMode() {
      const q = Array.isArray(trainingContext.trainingQueue) ? trainingContext.trainingQueue : [];
      return q.find((it) => it && !it.done && it.verifyRule?.type === 'apm_drill' && it.verifyRule?.mode === mode && Number(it.verifyRule?.durationSec || 30) === durationSec) || null;
    }

    async function loadLeaderboard(targetMode = mode, { force = false } = {}) {
      const cur = leaderboardCache[targetMode];
      if (!force && cur && cur.loading) return;
      if (!force && cur && cur.data && Date.now() - (cur.fetchedAt || 0) < 45_000) return;
      if (typeof root.settings?.trainingApmLeaderboard !== 'function') return;

      leaderboardCache[targetMode] = { loading: true, error: null, data: cur?.data || null, fetchedAt: cur?.fetchedAt || 0 };
      if (targetMode === mode && phase !== 'running' && typeof onNotifyRender === 'function') {
        onNotifyRender();
      }
      try {
        const res = await root.settings.trainingApmLeaderboard({ mode: targetMode });
        if (res && res.ok) {
          leaderboardCache[targetMode] = { loading: false, error: null, data: res, fetchedAt: Date.now() };
        } else {
          leaderboardCache[targetMode] = { loading: false, error: res?.error || 'load-error', data: cur?.data || null, fetchedAt: Date.now() };
        }
      } catch (_) {
        leaderboardCache[targetMode] = { loading: false, error: 'network-error', data: cur?.data || null, fetchedAt: Date.now() };
      }
      if (targetMode === mode && phase !== 'running' && typeof onNotifyRender === 'function') {
        onNotifyRender();
      }
    }

    async function pinApmGoalToPlan({ targetMode = mode, targetDur = durationSec, targetEapm, targetAcc } = {}) {
      const mLabel = modeLabel(targetMode);
      const item = {
        source: 'APM',
        title: t('apm.planItemTitle', '{mode} ({s}s) · ≥ {apm} eAPM', { mode: mLabel, s: targetDur, apm: targetEapm }),
        detail: t('apm.planItemDetail', 'Alcanzá ≥ {apm} eAPM con ≥ {acc}% de precisión en {mode}.', { apm: targetEapm, acc: targetAcc, mode: mLabel }),
        metric: `${targetEapm} eAPM · ${targetAcc}%`,
        ruleType: 'apm_drill',
        apmMode: targetMode,
        apmDuration: targetDur,
        ruleTarget: targetEapm,
        targetEapm,
        targetAcc,
        targetTab: 'apm',
      };
      if (typeof onAddPlanGoal === 'function') {
        const res = await onAddPlanGoal(item);
        if (res?.ok) {
          planPinFeedback = res.duplicate
            ? t('apm.planAlreadyAdded', 'Esta meta ya está activa en Mi Plan.')
            : t('apm.planAddedOk', '✓ Meta agregada a Mi Plan (se verifica automáticamente).');
          playSfx('confirm');
          if (typeof onNotifyRender === 'function') onNotifyRender();
        }
        return res;
      }
      return { ok: false };
    }

    function getCanvasDims() {
      if (!canvas) return { w: 860, h: 400 };
      const rect = canvas.getBoundingClientRect();
      return {
        w: Math.max(320, Math.round(rect.width || 860)),
        h: Math.max(260, Math.round(rect.height || 400)),
      };
    }

    function syncCanvasResolution() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width || 860));
      const h = Math.max(260, Math.round(rect.height || 400));
      const dpr = Math.min(2.5, Math.max(1, root.devicePixelRatio || 1));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function findSpawnPoint(radius, w, h) {
      const padX = radius + 24;
      const padTop = radius + 28;
      const padBot = radius + 22;
      const minDist = radius * 2.45;
      let best = { x: padX + Math.random() * Math.max(40, w - padX * 2), y: padTop + Math.random() * Math.max(40, h - padTop - padBot) };
      let bestClearance = -1;
      for (let attempt = 0; attempt < 36; attempt += 1) {
        const cx = padX + Math.random() * Math.max(40, w - padX * 2);
        const cy = padTop + Math.random() * Math.max(40, h - padTop - padBot);
        let nearest = 1e9;
        for (const tk of tokens) {
          const d = Math.hypot(cx - tk.x, cy - tk.y);
          if (d < nearest) nearest = d;
        }
        if (nearest >= minDist) return { x: cx, y: cy };
        if (nearest > bestClearance) {
          bestClearance = nearest;
          best = { x: cx, y: cy };
        }
      }
      return best;
    }

    function pickDecoyUnit(excludedSet) {
      const pool = UNIT_IDS.filter((id) => !excludedSet.has(id));
      return pickRandom(pool.length ? pool : UNIT_IDS);
    }

    function spawnToken(unitId, isTarget, nowMs, opts = {}) {
      const { w, h } = getCanvasDims();
      const radius = mode === 'reflex' ? 31 : 35;
      const pos = findSpawnPoint(radius, w, h);
      const speed = opts.drift ? (18 + Math.random() * 20) : 0;
      const angle = Math.random() * Math.PI * 2;
      const lifeMs = opts.lifeMs || (mode === 'reflex' ? 0 : (mode === 'counter' ? 5600 : 4400));
      tokens.push({
        id: nextTargetId++,
        unitId,
        isTarget,
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: radius,
        bornMs: nowMs,
        lifeMs,
      });
      getUnitImage(unitId);
    }

    function seedBoardForMode(nowMs) {
      tokens = [];
      if (mode === 'reflex') {
        const pool = [...SNIPE_TARGETS];
        for (let i = 0; i < 3; i += 1) {
          spawnToken(pickRandom(pool), true, nowMs, { drift: false, lifeMs: 0 });
        }
        return;
      }
      if (mode === 'snipe') {
        const elapsed = Math.max(0, (nowMs - roundStartMs) / 1000);
        const drift = elapsed >= 8;
        const excluded = new Set([snipeUnitId]);
        for (let i = 0; i < 2; i += 1) {
          spawnToken(snipeUnitId, true, nowMs, { drift, lifeMs: 4600 + i * 500 });
        }
        for (let i = 0; i < 5; i += 1) {
          const d = pickDecoyUnit(excluded);
          excluded.add(d);
          spawnToken(d, false, nowMs, { drift, lifeMs: 5200 + i * 350 });
        }
        return;
      }
      if (mode === 'counter') {
        const drill = COUNTER_DRILLS[counterDrillIdx % COUNTER_DRILLS.length];
        const validCounter = pickRandom(drill.counters);
        spawnToken(validCounter, true, nowMs, { drift: false, lifeMs: 5800 });
        if (drill.counters.length > 1) {
          const second = pickRandom(drill.counters, validCounter);
          spawnToken(second, true, nowMs, { drift: false, lifeMs: 6400 });
        }
        const decoys = [...drill.decoys].sort(() => Math.random() - 0.5).slice(0, 4);
        for (const d of decoys) {
          spawnToken(d, false, nowMs, { drift: false, lifeMs: 6500 });
        }
      }
    }

    function maintainBoard(nowMs) {
      if (mode === 'reflex') {
        while (tokens.length < 3) {
          spawnToken(pickRandom(SNIPE_TARGETS), true, nowMs, { drift: false, lifeMs: 0 });
        }
        return;
      }
      if (mode === 'snipe') {
        const elapsed = Math.max(0, (nowMs - roundStartMs) / 1000);
        const drift = elapsed >= 8;
        let switched = false;
        if (snipeHitsOnCurrent >= 5 || nowMs >= snipeSwitchAtMs) {
          snipeUnitId = pickRandom(SNIPE_TARGETS, snipeUnitId);
          snipeHitsOnCurrent = 0;
          snipeSwitchAtMs = nowMs + 8500;
          for (const tk of tokens) {
            tk.isTarget = tk.unitId === snipeUnitId;
            if (tk.isTarget) tk.bornMs = nowMs;
          }
          syncDirectiveDom(true);
          playSfx('apmSwitch');
          switched = true;
        }
        let targetCount = tokens.filter((tk) => tk.isTarget).length;
        while (targetCount < 2) {
          spawnToken(snipeUnitId, true, nowMs, { drift, lifeMs: 4400 });
          targetCount += 1;
        }
        const usedDecoys = new Set([snipeUnitId, ...tokens.map((tk) => tk.unitId)]);
        while (tokens.length < 7) {
          const d = pickDecoyUnit(usedDecoys);
          usedDecoys.add(d);
          spawnToken(d, false, nowMs, { drift, lifeMs: 5200 });
        }
        return switched;
      }
      if (mode === 'counter') {
        const drill = COUNTER_DRILLS[counterDrillIdx % COUNTER_DRILLS.length];
        const counterSet = new Set(drill.counters);
        let validCount = tokens.filter((tk) => tk.isTarget).length;
        if (counterHitsOnCurrent >= 3 || validCount === 0) {
          if (counterHitsOnCurrent >= 3) {
            const nextIdx = (counterDrillIdx + 1 + Math.floor(Math.random() * (COUNTER_DRILLS.length - 1))) % COUNTER_DRILLS.length;
            counterDrillIdx = nextIdx;
            counterHitsOnCurrent = 0;
            seedBoardForMode(nowMs);
            syncDirectiveDom(true);
            playSfx('apmSwitch');
            return true;
          }
          spawnToken(pickRandom(drill.counters), true, nowMs, { drift: false, lifeMs: 5800 });
        }
        const used = new Set([...tokens.map((tk) => tk.unitId), drill.threat, ...drill.counters]);
        while (tokens.length < 6) {
          const pool = drill.decoys.filter((d) => !used.has(d));
          const dec = pool.length ? pickRandom(pool) : pickDecoyUnit(new Set([drill.threat, ...counterSet]));
          used.add(dec);
          spawnToken(dec, false, nowMs, { drift: false, lifeMs: 6200 });
        }
        return false;
      }
      return false;
    }

    function syncDirectiveDom(pulse = false) {
      if (!mountRoot) return;
      const kickerEl = mountRoot.querySelector('#trApmDirKicker');
      const nameEl = mountRoot.querySelector('#trApmDirName');
      const imgEl = mountRoot.querySelector('#trApmDirIcon');
      const hintEl = mountRoot.querySelector('#trApmDirSub');
      const boxEl = mountRoot.querySelector('#trApmDirBox');
      const pipsEl = mountRoot.querySelector('#trApmDirPips');

      if (boxEl) {
        boxEl.classList.toggle('is-counter-threat', mode === 'counter');
        boxEl.classList.toggle('is-reflex-mode', mode === 'reflex');
      }

      if (mode === 'snipe') {
        const u = UNITS[snipeUnitId] || UNITS.monk;
        if (kickerEl) kickerEl.textContent = t('apm.dirSnipeKicker', 'OBJETIVO A ELIMINAR');
        if (nameEl) nameEl.textContent = locUnit(u.es, u.en);
        if (imgEl) { imgEl.src = u.icon; imgEl.hidden = false; }
        if (hintEl) {
          hintEl.textContent = t('apm.dirSnipeHint', 'Cliqueá solo esta unidad · cambia cada 5 aciertos');
          hintEl.classList.remove('is-warn');
        }
        if (pipsEl) {
          pipsEl.hidden = false;
          pipsEl.innerHTML = Array.from({ length: 5 }, (_, idx) => `<i class="tr-apm-pip${idx < snipeHitsOnCurrent ? ' is-filled' : ''}"></i>`).join('');
        }
      } else if (mode === 'counter') {
        const drill = COUNTER_DRILLS[counterDrillIdx % COUNTER_DRILLS.length];
        const threat = UNITS[drill.threat] || UNITS.knight;
        if (kickerEl) kickerEl.textContent = t('apm.dirCounterKicker', 'AMENAZA RIVAL');
        if (nameEl) nameEl.textContent = locUnit(threat.es, threat.en);
        if (imgEl) { imgEl.src = threat.icon; imgEl.hidden = false; }
        if (hintEl) {
          const now = performance.now();
          if (counterHintText && now < counterHintUntilMs) {
            hintEl.textContent = counterHintText;
            hintEl.classList.add('is-warn');
          } else {
            hintEl.textContent = t('apm.dirCounterHint', 'Cliqueá la unidad que le hace counter');
            hintEl.classList.remove('is-warn');
          }
        }
        if (pipsEl) {
          pipsEl.hidden = false;
          pipsEl.innerHTML = Array.from({ length: 3 }, (_, idx) => `<i class="tr-apm-pip${idx < counterHitsOnCurrent ? ' is-filled' : ''}"></i>`).join('');
        }
      } else {
        if (kickerEl) kickerEl.textContent = t('apm.dirReflexKicker', 'CALENTAMIENTO PURO');
        if (nameEl) nameEl.textContent = t('apm.dirReflexTitle', '3 objetivos activos');
        if (imgEl) { imgEl.src = UNITS.knight.icon; imgEl.hidden = false; }
        if (hintEl) {
          hintEl.textContent = t('apm.dirReflexHint', 'Sin señuelos · máxima velocidad y precisión');
          hintEl.classList.remove('is-warn');
        }
        if (pipsEl) {
          pipsEl.hidden = true;
          pipsEl.innerHTML = '';
        }
      }

      if (pulse && boxEl) {
        boxEl.classList.remove('is-pulse');
        void boxEl.offsetWidth;
        boxEl.classList.add('is-pulse');
      }
    }

    function syncLiveHudDom(nowMs) {
      if (!mountRoot) return;
      const timeEl = mountRoot.querySelector('#trApmHudTime');
      const apmEl = mountRoot.querySelector('#trApmHudApm');
      const accEl = mountRoot.querySelector('#trApmHudAcc');
      const msEl = mountRoot.querySelector('#trApmHudMs');

      const secLeft = Math.max(0, remainingMs / 1000);
      const elapsedSec = Math.max(0.6, (nowMs - roundStartMs) / 1000);
      const totalClicks = hits + misses;
      const acc = totalClicks > 0 ? Math.round((hits / totalClicks) * 100) : 100;
      const eApm = totalClicks > 0 ? Math.round((hits / elapsedSec) * 60 * (acc / 100)) : 0;
      const avgMs = reactionTimes.length
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
        : 0;

      if (timeEl) {
        timeEl.textContent = `${secLeft.toFixed(1)}s`;
        timeEl.classList.toggle('is-urgent', phase === 'running' && secLeft <= 5.0);
      }
      if (apmEl) apmEl.textContent = String(eApm);
      if (accEl) accEl.textContent = `${acc}%`;
      if (msEl) msEl.textContent = avgMs > 0 ? `${avgMs} ms` : '—';
    }

    async function finishRound() {
      stopLoop();
      phase = 'summary';
      remainingMs = 0;
      planPinFeedback = '';

      const totalClicks = hits + misses;
      const accuracy = totalClicks > 0 ? Math.round((hits / totalClicks) * 100) : 0;
      const rawApm = Math.round((hits / durationSec) * 60);
      const eApm = Math.round(rawApm * (accuracy / 100));
      const avgReactionMs = reactionTimes.length
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
        : 0;
      const minReactionMs = reactionTimes.length ? Math.min(...reactionTimes) : 0;
      const reactionStdDevMs = computeStdDev(reactionTimes);
      const evalRes = evaluateGrade(mode, eApm, accuracy);
      const coaching = buildCoachingNote({ mode, hits, misses, decoyHits, accuracy, avgReactionMs });

      const bestKey = `${mode}:${durationSec}`;
      const prevBest = stats.best[bestKey];
      const isNewRecord = hits > 0 && (!prevBest || eApm > prevBest.eApm || (eApm === prevBest.eApm && accuracy > prevBest.accuracy));
      if (isNewRecord) {
        stats.best[bestKey] = { eApm, rawApm, accuracy, avgReactionMs, grade: evalRes.grade, hits, at: Date.now() };
      }
      if (hits > 0 || totalClicks > 0) {
        stats.history.unshift({
          mode,
          durationSec,
          eApm,
          accuracy,
          avgReactionMs,
          grade: evalRes.grade,
          hits,
          maxStreak,
          at: Date.now(),
        });
        stats.history = stats.history.slice(0, 24);
        saveStats(stats);
      }

      lastResult = {
        mode,
        durationSec,
        hits,
        misses,
        decoyHits,
        expiredTargets,
        totalClicks,
        rawApm,
        eApm,
        accuracy,
        avgReactionMs,
        maxStreak,
        grade: evalRes.grade,
        tier: evalRes.tier,
        coaching,
        isNewRecord,
        bestEapm: stats.best[bestKey]?.eApm || eApm,
        newlyCompletedPlanItems: [],
        rankNote: '',
      };
      playSfx('confirm');
      if (typeof onNotifyRender === 'function') onNotifyRender();

      // Verificación automática en Mi Plan + envío al Ranking Global (solo 30s estándar)
      if (typeof root.settings?.trainingApmComplete === 'function' && hits > 0) {
        try {
          const resp = await root.settings.trainingApmComplete({
            mode,
            durationSec,
            hits,
            misses,
            maxStreak,
            avgReactionMs,
            minReactionMs,
            reactionStdDevMs,
            eApm,
            accuracy,
          });
          if (resp?.ok) {
            if (Array.isArray(resp.trainingQueue)) {
              trainingContext.trainingQueue = resp.trainingQueue;
              if (typeof onQueueUpdated === 'function') onQueueUpdated(resp.trainingQueue);
            }
            if (Array.isArray(resp.newlyCompletedPlanItems) && resp.newlyCompletedPlanItems.length && lastResult) {
              lastResult.newlyCompletedPlanItems = resp.newlyCompletedPlanItems;
            }
            if (durationSec === 30) {
              const rk = resp.ranking || {};
              if (rk.ok && rk.me?.rank) {
                lastResult.rankNote = rk.improved
                  ? t('apm.rankImprovedNote', 'Ranking Global 30s: #{rank} ({alias})', { rank: rk.me.rank, alias: rk.me.aoeAlias })
                  : t('apm.rankCurrentNote', 'Posición global 30s: #{rank}', { rank: rk.me.rank });
                await loadLeaderboard(mode, { force: true });
              } else if (rk.reason === 'auth-required') {
                lastResult.rankNote = t('apm.rankNeedAuth', 'Iniciá sesión en Cuenta para entrar al Ranking Global.');
              } else if (rk.reason === 'aoe-account-required') {
                lastResult.rankNote = t('apm.rankNeedAoe', 'Vinculá tu cuenta de AoE2:DE para aparecer en el Ranking Global.');
              }
            }
            if (typeof onNotifyRender === 'function') onNotifyRender();
          }
        } catch (_) {}
      }
    }

    function handleCanvasPointerDown(ev) {
      if (phase !== 'running' || !canvas) return;
      if (ev.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const nowMs = performance.now();
      const pal = getPalette();

      let hitIdx = -1;
      for (let i = tokens.length - 1; i >= 0; i -= 1) {
        const tk = tokens[i];
        if (Math.hypot(x - tk.x, y - tk.y) <= tk.r + 4) {
          hitIdx = i;
          break;
        }
      }

      if (hitIdx >= 0) {
        const tk = tokens[hitIdx];
        if (tk.isTarget) {
          tokens.splice(hitIdx, 1);
          hits += 1;
          streak += 1;
          if (streak > maxStreak) maxStreak = streak;
          const reactMs = Math.max(90, Math.min(3500, Math.round(nowMs - (mode === 'reflex' ? Math.max(tk.bornMs, lastHitTs || roundStartMs) : tk.bornMs))));
          lastHitTs = nowMs;
          reactionTimes.push(reactMs);
          const isFast = reactMs <= 340;
          ripples.push({
            x: tk.x,
            y: tk.y,
            r: tk.r * 0.75,
            maxR: tk.r * 1.85,
            color: isFast ? pal.hitFast : pal.hitGood,
            bornMs: nowMs,
            lifeMs: 420,
            label: `${reactMs} ms`,
            isCross: false,
          });
          if (mode === 'snipe') snipeHitsOnCurrent += 1;
          if (mode === 'counter') {
            counterHitsOnCurrent += 1;
            counterHintText = '';
          }
          const didSwitch = maintainBoard(nowMs);
          if (!didSwitch) playSfx('tap');
          if (!didSwitch && (mode === 'snipe' || mode === 'counter')) syncDirectiveDom(false);
        } else {
          misses += 1;
          decoyHits += 1;
          streak = 0;
          ripples.push({
            x: tk.x,
            y: tk.y,
            r: tk.r * 0.7,
            maxR: tk.r * 1.55,
            color: pal.miss,
            bornMs: nowMs,
            lifeMs: 460,
            label: '✕',
            isCross: true,
          });
          if (mode === 'counter') {
            const drill = COUNTER_DRILLS[counterDrillIdx % COUNTER_DRILLS.length];
            const ansNames = drill.counters.map((id) => locUnit(UNITS[id].es, UNITS[id].en)).join(' / ');
            counterHintText = t('apm.counterHintAnswer', 'Counter correcto: {units}', { units: ansNames });
            counterHintUntilMs = nowMs + 2600;
            syncDirectiveDom(false);
          }
          playSfx('error');
        }
      } else {
        misses += 1;
        streak = 0;
        ripples.push({
          x,
          y,
          r: 8,
          maxR: 26,
          color: pal.miss,
          bornMs: nowMs,
          lifeMs: 360,
          label: '✕',
          isCross: true,
        });
        playSfx('error');
      }
      syncLiveHudDom(nowMs);
    }

    function drawFrame(nowMs) {
      if (!ctx || !canvas) return;
      const { w, h } = getCanvasDims();
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - (lastFrameTs || nowMs)) / 1000));
      lastFrameTs = nowMs;

      if (phase === 'running') {
        remainingMs = Math.max(0, roundEndMs - nowMs);
        if (remainingMs <= 0) {
          finishRound();
          return;
        }
        const pad = 42;
        for (let i = tokens.length - 1; i >= 0; i -= 1) {
          const tk = tokens[i];
          if (tk.vx || tk.vy) {
            tk.x += tk.vx * dt;
            tk.y += tk.vy * dt;
            if (tk.x < pad) { tk.x = pad; tk.vx = Math.abs(tk.vx); }
            if (tk.x > w - pad) { tk.x = w - pad; tk.vx = -Math.abs(tk.vx); }
            if (tk.y < pad) { tk.y = pad; tk.vy = Math.abs(tk.vy); }
            if (tk.y > h - pad) { tk.y = h - pad; tk.vy = -Math.abs(tk.vy); }
          }
          if (tk.lifeMs > 0 && nowMs - tk.bornMs >= tk.lifeMs) {
            if (tk.isTarget) expiredTargets += 1;
            tokens.splice(i, 1);
          }
        }
        maintainBoard(nowMs);
        hudUpdateAccum += dt;
        if (hudUpdateAccum >= 0.08) {
          hudUpdateAccum = 0;
          syncLiveHudDom(nowMs);
          if (mode === 'counter' && counterHintText && nowMs >= counterHintUntilMs) {
            counterHintText = '';
            syncDirectiveDom(false);
          }
        }
      }

      const pal = getPalette();

      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = 48;
      for (let gx = step; gx < w; gx += step) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, h); }
      for (let gy = step; gy < h; gy += step) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(w, gy + 0.5); }
      ctx.stroke();

      const ratio = phase === 'running' ? Math.max(0, Math.min(1, remainingMs / (durationSec * 1000))) : 1;
      ctx.fillStyle = pal.timerTrack;
      ctx.fillRect(0, 0, w, 2);
      ctx.fillStyle = (phase === 'running' && remainingMs <= 5000) ? pal.ringUrgent : pal.timerFill;
      ctx.fillRect(0, 0, w * ratio, 2);

      for (const tk of tokens) {
        const ageMs = Math.max(0, nowMs - tk.bornMs);
        const popT = Math.min(1, ageMs / 130);
        const scale = 0.72 + 0.28 * (1 - Math.pow(1 - popT, 3));
        const r = tk.r * scale;

        ctx.save();
        ctx.beginPath();
        ctx.arc(tk.x, tk.y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = pal.bezelFill;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = pal.bezelBorder;
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.arc(tk.x, tk.y, r - 2, 0, Math.PI * 2);
        ctx.clip();
        const img = getUnitImage(tk.unitId);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, tk.x - r + 1, tk.y - r + 1, (r - 1) * 2, (r - 1) * 2);
        }
        ctx.restore();

        if (tk.lifeMs > 0) {
          const frac = Math.max(0, 1 - ageMs / tk.lifeMs);
          ctx.beginPath();
          ctx.arc(tk.x, tk.y, r + 2, 0, Math.PI * 2);
          ctx.strokeStyle = pal.ringTrack;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(tk.x, tk.y, r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          ctx.strokeStyle = frac < 0.28 ? pal.ringUrgent : pal.ringActive;
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(tk.x, tk.y, r + 2, 0, Math.PI * 2);
          ctx.strokeStyle = pal.ringActive;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        ctx.restore();
      }

      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const rp = ripples[i];
        const p = (nowMs - rp.bornMs) / rp.lifeMs;
        if (p >= 1) { ripples.splice(i, 1); continue; }
        const alpha = Math.max(0, 1 - p);
        const curR = rp.r + (rp.maxR - rp.r) * (1 - Math.pow(1 - p, 2));
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, curR, 0, Math.PI * 2);
        ctx.strokeStyle = rp.color;
        ctx.lineWidth = rp.isCross ? 1.8 : 2;
        ctx.stroke();
        if (rp.label) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = rp.color;
          ctx.font = rp.isCross
            ? '700 13px "JetBrains Mono", Consolas, monospace'
            : '700 11.5px "JetBrains Mono", Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rp.label, rp.x, rp.y - (rp.isCross ? 0 : 12 + p * 18));
        }
        ctx.restore();
      }

      if (phase === 'running' && streak >= 3) {
        ctx.save();
        ctx.fillStyle = pal.comboText;
        ctx.globalAlpha = 0.85;
        ctx.font = '700 12px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`×${streak}`, w - 16, 14);
        ctx.restore();
      }

      if (phase === 'running') {
        rafId = requestAnimationFrame(drawFrame);
      }
    }

    function startRound() {
      preloadIcons();
      stopLoop();
      phase = 'running';
      lastResult = null;
      planPinFeedback = '';
      hits = 0;
      misses = 0;
      decoyHits = 0;
      expiredTargets = 0;
      streak = 0;
      maxStreak = 0;
      reactionTimes = [];
      tokens = [];
      ripples = [];
      counterHintText = '';
      counterHintUntilMs = 0;
      hudUpdateAccum = 0;

      const nowMs = performance.now();
      roundStartMs = nowMs;
      roundEndMs = nowMs + durationSec * 1000;
      remainingMs = durationSec * 1000;
      lastFrameTs = nowMs;
      lastHitTs = nowMs;

      snipeUnitId = pickRandom(SNIPE_TARGETS);
      snipeHitsOnCurrent = 0;
      snipeSwitchAtMs = nowMs + 8500;
      counterDrillIdx = Math.floor(Math.random() * COUNTER_DRILLS.length);
      counterHitsOnCurrent = 0;

      if (typeof onNotifyRender === 'function') onNotifyRender();
      playSfx('tap');
    }

    function renderPlanContextBanner() {
      const activeGoal = getActivePlanGoalForCurrentMode();
      if (activeGoal) {
        const ruleLbl = activeGoal.verifyRule?.targetLabel || activeGoal.title;
        return `<div class="tr-apm-plan-strip is-active-goal">
          <div class="tr-apm-plan-copy">
            <span class="tr-apm-plan-kicker">${esc(t('apm.activeGoalKicker', 'META ACTIVA EN MI PLAN'))}</span>
            <strong>${esc(ruleLbl)}</strong>
          </div>
          <span class="tr-apm-plan-status">${esc(t('apm.activeGoalAuto', 'Se completa sola al superarla'))}</span>
        </div>`;
      }
      const rec = computeRecommendedDrillFromPerf(trainingContext.highElo);
      const bestRec = stats.best[`${mode}:${durationSec}`] || null;
      const nextTgt = computeNextPlanTarget(mode, bestRec?.eApm || 0, bestRec?.accuracy || 85);
      if (rec && rec.mode !== mode) {
        return `<div class="tr-apm-plan-strip">
          <div class="tr-apm-plan-copy">
            <span class="tr-apm-plan-kicker">${esc(t('apm.suggestedKicker', 'SUGERENCIA SEGÚN TUS PARTIDAS'))}</span>
            <strong>${esc(rec.reason)}</strong>
          </div>
          <div class="tr-apm-plan-actions">
            <button type="button" class="btn tr-apm-mini-btn" id="trApmSwitchRecBtn" data-rec-mode="${esc(rec.mode)}">${esc(t('apm.tryRecMode', 'Probar {mode}', { mode: modeLabel(rec.mode) }))}</button>
            <button type="button" class="btn tr-apm-mini-btn" id="trApmPinCurrentBtn" data-pin-mode="${esc(rec.mode)}" data-pin-dur="30" data-pin-eapm="${rec.targetEapm}" data-pin-acc="${rec.targetAcc}">+ ${esc(t('apm.addToPlanBtn', 'Agregar a Mi Plan'))}</button>
          </div>
        </div>`;
      }
      return `<div class="tr-apm-plan-strip">
        <div class="tr-apm-plan-copy">
          <span class="tr-apm-plan-kicker">${esc(t('apm.goalKicker', 'RUTINA EN MI PLAN'))}</span>
          <strong>${esc(t('apm.goalSuggestLine', 'Próximo escalón sugerido: ≥ {apm} eAPM y ≥ {acc}% en {mode} ({s}s).', { apm: nextTgt.targetEapm, acc: nextTgt.targetAcc, mode: modeLabel(mode), s: durationSec }))}</strong>
          ${planPinFeedback ? `<small class="tr-apm-plan-fb">${esc(planPinFeedback)}</small>` : ''}
        </div>
        <div class="tr-apm-plan-actions">
          <button type="button" class="btn tr-apm-mini-btn" id="trApmPinCurrentBtn" data-pin-mode="${esc(mode)}" data-pin-dur="${durationSec}" data-pin-eapm="${nextTgt.targetEapm}" data-pin-acc="${nextTgt.targetAcc}">+ ${esc(t('apm.addToPlanBtn', 'Agregar a Mi Plan'))}</button>
        </div>
      </div>`;
    }

    function renderIdleOverlay() {
      const mTitle = modeLabel(mode);
      const modeDesc = mode === 'snipe'
        ? t('apm.idleSnipeDesc', 'Identificá y cliqueá solo la unidad objetivo entre señuelos reales de AoE2:DE. Cambia cada 5 aciertos.')
        : mode === 'counter'
          ? t('apm.idleCounterDesc', 'Leé la amenaza rival arriba y cliqueá las unidades que le hacen counter antes de que cierre el anillo.')
          : t('apm.idleReflexDesc', 'Siempre 3 retratos activos sin señuelos. Entrenamiento puro de velocidad de cursor y eAPM.');
      const previewIcons = mode === 'snipe'
        ? [UNITS.monk.icon, UNITS.mangonel.icon, UNITS.huskarl.icon]
        : mode === 'counter'
          ? [UNITS.knight.icon, UNITS.pikeman.icon, UNITS.camel.icon]
          : [UNITS.conquistador.icon, UNITS.mangudai.icon, UNITS.xbow.icon];
      return `<div class="tr-apm-overlay">
        <div class="tr-apm-idle-units" aria-hidden="true">
          ${previewIcons.map((src) => `<span class="tr-apm-idle-ring"><img src="${src}" alt="" draggable="false" /></span>`).join('')}
        </div>
        <span class="tr-apm-overlay-eyebrow">${esc(t('apm.eyebrow', 'ENTRENAMIENTO DE APM Y MICRO'))}</span>
        <h3>${esc(mTitle)}</h3>
        <p>${esc(modeDesc)}</p>
        <div class="tr-apm-overlay-actions">
          <button type="button" class="btn gold tr-apm-start-btn" id="trApmStartBtn">${esc(t('apm.startCta', 'Iniciar ronda · {s} s →', { s: durationSec }))}</button>
        </div>
        <span class="tr-apm-kbd-hint">${esc(t('apm.kbdHint', 'Tip: Espacio para iniciar o repetir · Esc para reiniciar'))}</span>
      </div>`;
    }

    function renderSummaryOverlay() {
      const r = lastResult;
      if (!r) return '';
      const gradeCls = r.grade.startsWith('S') ? 'is-gold' : (r.grade === 'A' ? 'is-em' : (r.grade === 'D' ? 'is-warn' : ''));
      const nextTgt = computeNextPlanTarget(r.mode, r.eApm, r.accuracy);
      const alreadyGoal = getActivePlanGoalForCurrentMode();
      const completedGoal = Array.isArray(r.newlyCompletedPlanItems) && r.newlyCompletedPlanItems.length > 0;
      return `<div class="tr-apm-overlay is-summary">
        <div class="tr-apm-summary-grid">
          <div class="tr-apm-grade-col">
            <div class="tr-apm-grade-badge ${gradeCls}">${esc(r.grade)}</div>
            <div class="tr-apm-grade-copy">
              <div class="tr-apm-grade-head">
                <strong>${esc(r.tier)}</strong>
                ${r.isNewRecord ? `<span class="tr-apm-record-tag">${esc(t('apm.newRecord', 'Nuevo récord'))}</span>` : ''}
                ${completedGoal ? `<span class="tr-apm-record-tag">${esc(t('apm.planGoalMetTag', '✓ Meta de Mi Plan cumplida'))}</span>` : ''}
              </div>
              <p>${esc(r.coaching)}</p>
              ${r.rankNote ? `<small class="tr-apm-rank-note mono">${esc(r.rankNote)}</small>` : ''}
            </div>
          </div>
          <div class="tr-apm-metrics-grid">
            <div class="tr-apm-metric-cell">
              <span>${esc(t('apm.kpiEapm', 'eAPM efectivo'))}</span>
              <b class="mono">${r.eApm}</b>
              <small>${esc(t('apm.kpiBest', 'Récord: {n}', { n: r.bestEapm }))}</small>
            </div>
            <div class="tr-apm-metric-cell">
              <span>${esc(t('apm.kpiAcc', 'Precisión'))}</span>
              <b class="mono">${r.accuracy}%</b>
              <small>${r.hits}/${r.totalClicks} ${esc(t('apm.kpiHits', 'aciertos'))}</small>
            </div>
            <div class="tr-apm-metric-cell">
              <span>${esc(t('apm.kpiReact', 'Reacción media'))}</span>
              <b class="mono">${r.avgReactionMs > 0 ? `${r.avgReactionMs} ms` : '—'}</b>
              <small>${esc(t('apm.kpiDuration', 'Ronda de {s} s', { s: r.durationSec }))}</small>
            </div>
            <div class="tr-apm-metric-cell">
              <span>${esc(t('apm.kpiStreak', 'Mejor racha'))}</span>
              <b class="mono">×${r.maxStreak}</b>
              <small>${r.decoyHits > 0 ? esc(t('apm.kpiDecoys', '{n} señuelos', { n: r.decoyHits })) : esc(t('apm.kpiClean', 'Sin errores de unidad'))}</small>
            </div>
          </div>
        </div>
        <div class="tr-apm-overlay-actions">
          <button type="button" class="btn gold tr-apm-start-btn" id="trApmRetryBtn">${esc(t('apm.retryCta', 'Repetir ronda →'))}</button>
          ${!alreadyGoal
            ? `<button type="button" class="btn" id="trApmPinSummaryBtn" data-pin-mode="${esc(r.mode)}" data-pin-dur="${r.durationSec}" data-pin-eapm="${nextTgt.targetEapm}" data-pin-acc="${nextTgt.targetAcc}">+ ${esc(t('apm.pinNextTarget', 'Fijar ≥ {apm} eAPM en Mi Plan', { apm: nextTgt.targetEapm }))}</button>`
            : ''}
          <button type="button" class="btn" id="trApmResetBtn">${esc(t('apm.backToSetup', 'Cambiar ajustes'))}</button>
        </div>
        ${planPinFeedback ? `<span class="tr-apm-plan-fb">${esc(planPinFeedback)}</span>` : ''}
      </div>`;
    }

    function renderGlobalLeaderboardCard() {
      const slot = leaderboardCache[mode] || { loading: false, error: null, data: null };
      const data = slot.data || null;
      const top = Array.isArray(data?.top) ? data.top.slice(0, 20) : [];
      const total = Number(data?.totalPlayers || 0);
      const me = data?.me || null;
      const leaderEapm = top.length ? Math.max(1, Number(top[0].eApm || 1)) : 1;

      const padRank = (r) => String(Number(r || 0)).padStart(2, '0');
      const renderGradeCls = (g) => {
        const s = String(g || '');
        if (s === 'S+') return 'is-splus';
        if (s === 'S') return 'is-gold';
        if (s === 'A') return 'is-em';
        return '';
      };
      const eloTierCls = (elo) => {
        const n = Number(elo || 0);
        if (n >= 2000) return 'is-elo-gm';
        if (n >= 1600) return 'is-elo-hi';
        if (n >= 1200) return 'is-elo-mid';
        return 'is-elo-std';
      };
      const crownSvg = `<svg class="tr-apm-lb-crown" viewBox="0 0 16 12" width="13" height="10" aria-hidden="true"><path d="M1.2 10.5L2.4 2.8L5.7 6.2L8 1.4L10.3 6.2L13.6 2.8L14.8 10.5H1.2Z" fill="currentColor"/></svg>`;

      let bodyHtml = '';
      if (slot.loading && !top.length) {
        bodyHtml = `<div class="tr-apm-lb-empty">${esc(t('apm.lbLoading', 'Cargando Ranking Global de Relic…'))}</div>`;
      } else if (slot.error && !top.length) {
        bodyHtml = `<div class="tr-apm-lb-empty">${esc(t('apm.lbError', 'No se pudo cargar el Ranking Global ahora mismo.'))}</div>`;
      } else if (!top.length) {
        bodyHtml = `<div class="tr-apm-lb-empty">
          <strong>${esc(t('apm.lbEmptyTitle', 'Todavía no hay marcas en este modo (30s)'))}</strong>
          <small>${esc(t('apm.lbEmptySub', 'Jugá una ronda de 30 s con tu cuenta de AoE2:DE vinculada para inaugurar el #1 global.'))}</small>
        </div>`;
      } else {
        bodyHtml = `<div class="tr-apm-lb-board" role="table" aria-label="${esc(modeLabel(mode))}">
          <div class="tr-apm-lb-thead" role="row">
            <span class="is-pos">#</span>
            <span>${esc(t('apm.lbColPlayer', 'Jugador AoE2:DE'))}</span>
            <span class="is-num">${esc(t('apm.lbColElo', 'ELO 1v1'))}</span>
            <span class="is-ctr">${esc(t('apm.lbColGrade', 'Nota'))}</span>
            <span class="is-num">eAPM</span>
            <span class="is-num">${esc(t('apm.lbColAcc', 'Precisión'))}</span>
            <span class="is-num">${esc(t('apm.lbColMs', 'Reacción'))}</span>
            <span class="is-num is-gap-col">${esc(t('apm.lbColGap', 'DIF'))}</span>
          </div>
          ${top.map((p) => {
            const rankNum = Number(p.rank || 0);
            const tierRowCls = rankNum === 1 ? ' is-r1' : (rankNum === 2 ? ' is-r2' : (rankNum === 3 ? ' is-r3' : ''));
            const pacePct = Math.max(8, Math.min(100, Math.round((Number(p.eApm || 0) / leaderEapm) * 100)));
            const diff = Math.max(0, leaderEapm - Number(p.eApm || 0));
            const gapHtml = rankNum === 1
              ? `<span class="tr-apm-lb-gap is-leader mono">${esc(t('apm.lbLeaderWord', 'LÍDER'))}</span>`
              : `<span class="tr-apm-lb-gap mono">${diff === 0 ? '0' : `-${diff}`}</span>`;
            const posHtml = rankNum === 1
              ? `<span class="tr-apm-lb-pos is-r1 mono"><span>${padRank(rankNum)}</span>${crownSvg}</span>`
              : `<span class="tr-apm-lb-pos${tierRowCls} mono">${padRank(rankNum)}</span>`;
            return `<div class="tr-apm-lb-row${tierRowCls}${p.isMe ? ' is-me' : ''}" role="row">
              ${posHtml}
              <span class="tr-apm-lb-name">
                <strong class="tr-apm-lb-nick">${esc(p.aoeAlias)}</strong>
                ${p.isMe ? `<em class="tr-apm-lb-you mono">${esc(t('apm.lbYouTag', 'VOS'))}</em>` : ''}
              </span>
              <span class="tr-apm-lb-elo-val mono ${eloTierCls(p.elo)}">${p.elo ? esc(fmtNum(p.elo)) : '—'}</span>
              <span class="tr-apm-lb-grade-txt mono ${renderGradeCls(p.grade)}">${esc(p.grade)}</span>
              <span class="tr-apm-lb-eapm-cell">
                <progress class="tr-apm-lb-pace${tierRowCls}${p.isMe ? ' is-me' : ''}" max="100" value="${pacePct}"></progress>
                <b class="tr-apm-lb-val mono">${p.eApm}</b>
              </span>
              <span class="tr-apm-lb-sub is-num mono">${p.accuracy}%</span>
              <span class="tr-apm-lb-sub is-num mono">${p.avgReactionMs > 0 ? `${p.avgReactionMs} ms` : '—'}</span>
              <span class="tr-apm-lb-gap-cell is-gap-col">${gapHtml}</span>
            </div>`;
          }).join('')}
        </div>`;
      }

      let myStripHtml = '';
      if (me) {
        const nextMsg = me.nextTarget
          ? t('apm.lbNextTarget', 'A {gap} eAPM del #{rank} ({name})', { gap: me.nextTarget.gapEapm, rank: me.nextTarget.rank, name: me.nextTarget.aoeAlias })
          : t('apm.lbLeaderMsg', '¡Liderás el Ranking Global de Relic en este modo!');
        myStripHtml = `<div class="tr-apm-lb-me">
          <div class="tr-apm-lb-me-left">
            <span class="tr-apm-lb-me-tag mono">${esc(t('apm.lbYourRank', 'TU POSICIÓN'))}</span>
            <strong class="tr-apm-lb-me-rank mono">#${padRank(me.rank)}</strong>
            <span class="tr-apm-lb-me-name">${esc(me.aoeAlias)}</span>
            ${me.elo ? `<span class="tr-apm-lb-me-elo mono">${esc(fmtNum(me.elo))} ELO</span>` : ''}
          </div>
          <div class="tr-apm-lb-me-right mono">
            <b>${me.eApm} eAPM</b>
            <span>${me.accuracy}%</span>
            <span>${me.avgReactionMs > 0 ? `${me.avgReactionMs} ms` : '—'}</span>
            <small class="tr-apm-lb-me-gap">${esc(nextMsg)}</small>
          </div>
        </div>`;
      } else if (data && !data.signedIn) {
        myStripHtml = `<div class="tr-apm-lb-me is-muted"><span>${esc(t('apm.lbSignInPrompt', 'Iniciá sesión en Cuenta con tu perfil de AoE2:DE vinculado para competir en el Ranking Global (solo se muestra tu nombre de AoE2, nunca tu correo).'))}</span></div>`;
      } else if (data && !data.aoeLinked) {
        myStripHtml = `<div class="tr-apm-lb-me is-muted"><span>${esc(t('apm.lbLinkAoePrompt', 'Vinculá tu cuenta de AoE2:DE en Cuenta para publicar tus marcas en el Ranking Global.'))}</span></div>`;
      } else if (data) {
        myStripHtml = `<div class="tr-apm-lb-me is-muted"><span>${esc(t('apm.lbPlay30Prompt', 'Completá una ronda estándar de 30 s en este modo para registrar tu marca global como {alias}.', { alias: data.myAoeAlias || 'AoE2' }))}</span></div>`;
      }

      return `<section class="tr-apm-lb-wrap">
        <div class="tr-apm-lb-card">
          <div class="tr-apm-lb-head">
            <div class="tr-apm-lb-title-col">
              <span class="tr-apm-lb-kicker mono">${esc(t('apm.lbEyebrow', 'RANKING GLOBAL DE RELIC · ESTÁNDAR 30s'))}</span>
              <div class="tr-apm-lb-title-row">
                <h4>${esc(modeLabel(mode))}</h4>
                <span class="tr-apm-lb-sep" aria-hidden="true">/</span>
                <span class="tr-apm-lb-meta mono">${esc(t('apm.lbPlayersCount', '{n} jugadores', { n: total }))}</span>
                ${durationSec !== 30 ? `<span class="tr-apm-lb-sep" aria-hidden="true">/</span><span class="tr-apm-lb-30-note">${esc(t('apm.lbOnly30Note', 'Clasificación oficial solo sobre 30 s'))}</span>` : ''}
              </div>
            </div>
            <div class="tr-apm-lb-head-right">
              ${top.length ? `<span class="tr-apm-lb-top-stat mono">${esc(t('apm.lbRecordStat', 'LÍDER {apm} eAPM', { apm: top[0].eApm }))}</span>` : ''}
              <button type="button" class="btn tr-apm-mini-btn tr-apm-lb-refresh" id="trApmLbRefreshBtn">${esc(t('common.refresh', 'Actualizar'))}</button>
            </div>
          </div>
          ${bodyHtml}
          ${myStripHtml}
        </div>
        <p class="tr-apm-lb-privacy">${esc(t('apm.lbPrivacy', 'Muestra únicamente la cuenta vinculada de AoE2:DE y ELO 1v1 — nunca correos ni nombres de Gmail.'))}</p>
      </section>`;
    }

    function renderHistoryStrip() {
      const modeHist = (stats.history || []).filter((h) => h.mode === mode).slice(0, 8);
      if (!modeHist.length) return '';
      return `<section class="tr-apm-history-card">
        <div class="tr-apm-history-head">
          <span class="tr-apm-history-kicker">${esc(t('apm.recentRuns', 'ÚLTIMAS RONDAS EN ESTE MODO'))}</span>
          <span class="tr-apm-history-sub mono">${modeHist.length} ${esc(t('apm.sessionsWord', 'sesiones'))}</span>
        </div>
        <div class="tr-apm-history-list">
          ${modeHist.map((h) => {
            const gCls = String(h.grade || '').startsWith('S') ? 'is-gold' : (h.grade === 'A' ? 'is-em' : '');
            return `<div class="tr-apm-hist-chip">
              <strong class="tr-apm-hist-grade ${gCls}">${esc(h.grade)}</strong>
              <span class="mono">${h.eApm} eAPM</span>
              <small class="mono">${h.durationSec}s · ${h.accuracy}% · ${h.avgReactionMs > 0 ? `${h.avgReactionMs}ms` : '—'}</small>
            </div>`;
          }).join('')}
        </div>
      </section>`;
    }

    function renderView(isActive) {
      const bestKey = `${mode}:${durationSec}`;
      const best = stats.best[bestKey] || null;
      const bestLabel = best
        ? t('apm.bestPill', 'Mejor: {grade} · {apm} eAPM', { grade: best.grade, apm: best.eApm })
        : t('apm.bestEmpty', 'Sin récord todavía');

      return `<div class="tr-view${isActive ? ' is-active' : ''}" data-tr-view="apm">
        <div class="tr-apm-toolbar">
          <div class="tr-map-mode-switch" role="group" aria-label="${esc(t('apm.modeAria', 'Modo de entrenamiento APM'))}">
            <button type="button" class="tr-map-mode-btn${mode === 'snipe' ? ' is-active' : ''}" data-apm-mode="snipe">${esc(t('apm.modeSnipe', 'Caza de Unidad'))}</button>
            <button type="button" class="tr-map-mode-btn${mode === 'counter' ? ' is-active' : ''}" data-apm-mode="counter">${esc(t('apm.modeCounter', 'Counter Relámpago'))}</button>
            <button type="button" class="tr-map-mode-btn${mode === 'reflex' ? ' is-active' : ''}" data-apm-mode="reflex">${esc(t('apm.modeReflex', 'Reflejos'))}</button>
          </div>
          <div class="tr-apm-toolbar-right">
            <div class="tr-map-mode-switch tr-apm-dur-switch" role="group" aria-label="${esc(t('apm.durAria', 'Duración de ronda'))}">
              <button type="button" class="tr-map-mode-btn${durationSec === 30 ? ' is-active' : ''}" data-apm-dur="30">30s · ${esc(t('apm.stdBadge', 'Estándar'))}</button>
              <button type="button" class="tr-map-mode-btn${durationSec === 60 ? ' is-active' : ''}" data-apm-dur="60">60s</button>
            </div>
            <span class="tr-sample-pill mono">${esc(bestLabel)}</span>
          </div>
        </div>

        ${phase !== 'running' ? renderPlanContextBanner() : ''}

        <section class="tr-apm-stage">
          <header class="tr-apm-hud">
            <div class="tr-apm-hud-side is-left">
              <div class="tr-apm-kpi">
                <span>${esc(t('apm.hudTime', 'TIEMPO'))}</span>
                <b class="mono" id="trApmHudTime">${durationSec.toFixed(1)}s</b>
              </div>
              <div class="tr-apm-kpi">
                <span>eAPM</span>
                <b class="mono" id="trApmHudApm">0</b>
              </div>
            </div>

            <div class="tr-apm-directive${mode === 'counter' ? ' is-counter-threat' : (mode === 'reflex' ? ' is-reflex-mode' : '')}" id="trApmDirBox">
              <span class="tr-apm-dir-ico">
                <img id="trApmDirIcon" src="${UNITS[snipeUnitId]?.icon || UNITS.monk.icon}" alt="" draggable="false" />
              </span>
              <div class="tr-apm-dir-copy">
                <div class="tr-apm-dir-head">
                  <span class="tr-apm-dir-kicker" id="trApmDirKicker">${esc(t('apm.dirSnipeKicker', 'OBJETIVO A ELIMINAR'))}</span>
                  <span class="tr-apm-dir-pips" id="trApmDirPips" aria-hidden="true"></span>
                </div>
                <strong id="trApmDirName">—</strong>
                <small id="trApmDirSub">—</small>
              </div>
            </div>

            <div class="tr-apm-hud-side is-right">
              <div class="tr-apm-kpi">
                <span>${esc(t('apm.hudAcc', 'PRECISIÓN'))}</span>
                <b class="mono" id="trApmHudAcc">100%</b>
              </div>
              <div class="tr-apm-kpi">
                <span>${esc(t('apm.hudMs', 'REACCIÓN'))}</span>
                <b class="mono" id="trApmHudMs">—</b>
              </div>
              ${phase === 'running' ? `<button type="button" class="btn tr-apm-abort-btn" id="trApmAbortBtn">${esc(t('apm.restartBtn', 'Reiniciar'))}</button>` : ''}
            </div>
          </header>

          <div class="tr-apm-arena-wrap">
            <canvas id="trApmCanvas" class="tr-apm-canvas${phase === 'running' ? ' is-live' : ''}"></canvas>
            ${phase === 'idle' ? renderIdleOverlay() : ''}
            ${phase === 'summary' ? renderSummaryOverlay() : ''}
          </div>
        </section>

        ${renderHistoryStrip()}
        ${renderGlobalLeaderboardCard()}
      </div>`;
    }

    function bindEvents(containerEl) {
      mountRoot = containerEl?.querySelector('[data-tr-view="apm"]') || null;
      if (!mountRoot) return;
      preloadIcons();
      loadLeaderboard(mode, { force: false });

      mountRoot.querySelectorAll('[data-apm-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.apmMode;
          if (!next || next === mode) return;
          mode = next;
          resetToIdle();
          playSfx('tap');
          if (typeof onNotifyRender === 'function') onNotifyRender();
          loadLeaderboard(mode, { force: false });
        });
      });

      mountRoot.querySelectorAll('[data-apm-dur]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = Number(btn.dataset.apmDur);
          if (![30, 60].includes(next) || next === durationSec) return;
          durationSec = next;
          resetToIdle();
          playSfx('tap');
          if (typeof onNotifyRender === 'function') onNotifyRender();
        });
      });

      mountRoot.querySelector('#trApmSwitchRecBtn')?.addEventListener('click', (ev) => {
        const nextMode = ev.currentTarget?.dataset?.recMode;
        if (nextMode && ['snipe', 'counter', 'reflex'].includes(nextMode)) {
          mode = nextMode;
          durationSec = 30;
          resetToIdle();
          playSfx('tap');
          if (typeof onNotifyRender === 'function') onNotifyRender();
          loadLeaderboard(mode, { force: false });
        }
      });

      mountRoot.querySelectorAll('#trApmPinCurrentBtn, #trApmPinSummaryBtn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetMode = btn.dataset.pinMode || mode;
          const targetDur = Number(btn.dataset.pinDur) === 60 ? 60 : 30;
          const targetEapm = Number(btn.dataset.pinEapm || 60);
          const targetAcc = Number(btn.dataset.pinAcc || 85);
          pinApmGoalToPlan({ targetMode, targetDur, targetEapm, targetAcc });
        });
      });

      mountRoot.querySelector('#trApmLbRefreshBtn')?.addEventListener('click', () => {
        playSfx('tap');
        loadLeaderboard(mode, { force: true });
      });

      mountRoot.querySelector('#trApmStartBtn')?.addEventListener('click', startRound);
      mountRoot.querySelector('#trApmRetryBtn')?.addEventListener('click', startRound);
      mountRoot.querySelector('#trApmResetBtn')?.addEventListener('click', () => {
        resetToIdle();
        if (typeof onNotifyRender === 'function') onNotifyRender();
      });
      mountRoot.querySelector('#trApmAbortBtn')?.addEventListener('click', () => {
        resetToIdle();
        if (typeof onNotifyRender === 'function') onNotifyRender();
      });

      canvas = mountRoot.querySelector('#trApmCanvas');
      if (canvas) {
        syncCanvasResolution();
        canvas.addEventListener('pointerdown', handleCanvasPointerDown);
        if (typeof ResizeObserver === 'function') {
          resizeObs = new ResizeObserver(() => {
            syncCanvasResolution();
            if (phase !== 'running') drawFrame(performance.now());
          });
          resizeObs.observe(canvas);
        }
      }

      syncDirectiveDom(false);
      syncLiveHudDom(performance.now());

      if (phase === 'running') {
        const nowMs = performance.now();
        if (!tokens.length) seedBoardForMode(nowMs);
        syncDirectiveDom(false);
        rafId = requestAnimationFrame(drawFrame);
      } else {
        drawFrame(performance.now());
      }

      if (keydownHandler) root.removeEventListener('keydown', keydownHandler);
      keydownHandler = (ev) => {
        const page = containerEl?.closest('.page[data-page="training"]');
        if (!page || !page.classList.contains('active')) return;
        if (!mountRoot || !mountRoot.classList.contains('is-active')) return;
        const tag = ev.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (ev.code === 'Space' && phase !== 'running') {
          ev.preventDefault();
          startRound();
        } else if (ev.key === 'Escape' && phase === 'running') {
          ev.preventDefault();
          resetToIdle();
          if (typeof onNotifyRender === 'function') onNotifyRender();
        }
      };
      root.addEventListener('keydown', keydownHandler);
    }

    return {
      renderView,
      bindEvents,
      setTrainingContext: (ctxObj = {}) => {
        trainingContext = {
          trainingQueue: Array.isArray(ctxObj.trainingQueue) ? ctxObj.trainingQueue : [],
          highElo: ctxObj.highElo || null,
        };
      },
      selectPreset: ({ mode: nextMode, durationSec: nextDur } = {}) => {
        if (nextMode && ['snipe', 'counter', 'reflex'].includes(nextMode)) mode = nextMode;
        if (nextDur === 30 || nextDur === 60) durationSec = nextDur;
        resetToIdle();
      },
      onLeave: () => {
        if (phase === 'running') resetToIdle();
        else stopLoop();
      },
      stop: stopLoop,
      getState: () => ({ mode, durationSec, phase, lastResult }),
    };
  }

  root.RelicApmTrainer = {
    createApmTrainerController,
    computeRecommendedDrillFromPerf,
    UNITS,
    COUNTER_DRILLS,
    evaluateGrade,
  };
})(typeof window !== 'undefined' ? window : globalThis);
