'use strict';

/**
 * Verificador automático de objetivos de «Mi Plan» sobre partidas reales posteriores.
 *
 * Regla sagrada:
 * - Solo partidas jugadas DESPUÉS de agregar el objetivo (matchTs >= createdAt - 60s) pueden cumplirlo.
 * - Cada objetivo tiene una regla verificable sobre telemetría real o resultado confirmado de la partida.
 * - Si el jugador mejora o cumple la condición, se marca automáticamente como cumplido con evidencia exacta.
 */

const MIN_TELEMETRY_DURATION_SEC = 720; // 12 min reales para métricas macro
const MIN_WIN_DURATION_SEC = 420;       // 7 min reales para victorias por civ/mapa

function fmtClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function normalizeSlug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseSecondsFromText(txt) {
  const s = String(txt || '');
  const mmss = /(\d{1,2}):(\d{2})/.exec(s);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const secs = /(\d+(?:[.,]\d+)?)\s*s\b/i.exec(s);
  if (secs) return Number(secs[1].replace(',', '.'));
  return null;
}

function parseNumberFromText(txt) {
  const m = /(\d+(?:[.,]\d+)?)/.exec(String(txt || ''));
  return m ? Number(m[1].replace(',', '.')) : null;
}

function inferPlanRule(item = {}) {
  const explicitType = String(item.ruleType || '').trim();
  const title = String(item.title || '');
  const detail = String(item.detail || '');
  const metric = String(item.metric || '');
  const titleNorm = normalizeSlug(title);
  const hay = normalizeSlug(`${title} ${detail} ${metric}`);

  // 0. Reglas explícitas tienen prioridad absoluta (nunca pisadas por texto descriptivo en `detail`)
  if (explicitType === 'stage_grade') {
    let stageId = String(item.stageId || '').toLowerCase();
    if (!stageId) {
      if (titleNorm.includes('alta edad')) stageId = 'dark';
      else if (titleNorm.includes('feudal')) stageId = 'feudal';
      else if (titleNorm.includes('castillos')) stageId = 'castle';
      else if (titleNorm.includes('imperial')) stageId = 'imperial';
    }
    const stageLabel = stageId === 'dark' ? 'Alta Edad' : stageId === 'feudal' ? 'Edad Feudal' : stageId === 'castle' ? 'Edad de los Castillos' : stageId === 'imperial' ? 'Edad Imperial' : 'esa edad';
    if (stageId) {
      return {
        type: 'stage_grade',
        stageId,
        threshold: 75,
        targetLabel: `Lograr nota A o S (≥ 75) en ${stageLabel}`,
      };
    }
  }
  if (explicitType === 'vs_civ') {
    const targetCivName = String(item.civName || item.civSlug || '').trim();
    const targetCivNorm = normalizeSlug(item.civSlug || targetCivName);
    if (targetCivNorm) {
      return {
        type: 'vs_civ',
        targetCiv: targetCivNorm,
        targetCivName: targetCivName || targetCivNorm,
        targetLabel: `Ganar una partida real contra ${targetCivName || targetCivNorm}`,
      };
    }
  }
  if (explicitType === 'on_map') {
    const targetMap = String(item.mapName || '').trim();
    if (targetMap) {
      return {
        type: 'on_map',
        targetMap: normalizeSlug(targetMap),
        targetMapName: targetMap,
        targetLabel: `Ganar una partida real en ${targetMap}`,
      };
    }
  }

  // 1. Explicit or inferred TC Idle Dark Age
  if (explicitType === 'tc_idle_dark' || (titleNorm.includes('alta edad') && (titleNorm.includes('cu') || titleNorm.includes('centro urbano') || titleNorm.includes('aldeano') || titleNorm.includes('pausa') || titleNorm.includes('idle') || titleNorm.includes('inactividad')))) {
    const baseSec = Number.isFinite(Number(item.ruleTarget)) ? Number(item.ruleTarget) : parseSecondsFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 8 ? Math.max(6, Math.min(18, Math.round(baseSec * 0.78))) : 15;
    return {
      type: 'tc_idle_dark',
      threshold,
      targetLabel: `Pausa de CU en Alta Edad ≤ ${threshold} s`,
    };
  }

  // 2. TC Idle Feudal
  if (explicitType === 'tc_idle_feudal' || (titleNorm.includes('feudal') && (titleNorm.includes('cu') || titleNorm.includes('centro urbano') || titleNorm.includes('aldeano') || titleNorm.includes('pausa') || titleNorm.includes('idle') || titleNorm.includes('inactividad')))) {
    const baseSec = Number.isFinite(Number(item.ruleTarget)) ? Number(item.ruleTarget) : parseSecondsFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 10 ? Math.max(8, Math.min(22, Math.round(baseSec * 0.80))) : 18;
    return {
      type: 'tc_idle_feudal',
      threshold,
      targetLabel: `Pausa de CU en Feudal ≤ ${threshold} s`,
    };
  }

  // 3. Biggest continuous TC gap (e.g. "Tu Centro Urbano estuvo detenido 44 s seguidos")
  if (explicitType === 'tc_gap' || (titleNorm.includes('detenido') && titleNorm.includes('seguidos')) || (titleNorm.includes('pausa') && titleNorm.includes('centro urbano'))) {
    const baseSec = parseSecondsFromText(`${title} ${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 16 ? Math.max(12, Math.min(28, Math.round(baseSec * 0.70))) : 25;
    return {
      type: 'tc_gap',
      threshold,
      targetLabel: `Sin pausas de CU mayores a ${threshold} s`,
    };
  }

  // 4. Specific Age stage grade improvement ("Mejorar Edad Feudal", "Mejorar Alta Edad", etc.)
  // Evaluar ANTES de keywords genéricos del `detail` (ej. "Hacha de doble filo ✓" en una nota de Edad Feudal)
  if (!explicitType && titleNorm.startsWith('mejorar ')) {
    let stageId = String(item.stageId || '').toLowerCase();
    let stageLabel = 'esa edad';
    if (!stageId) {
      if (titleNorm.includes('alta edad')) { stageId = 'dark'; stageLabel = 'Alta Edad'; }
      else if (titleNorm.includes('feudal')) { stageId = 'feudal'; stageLabel = 'Edad Feudal'; }
      else if (titleNorm.includes('castillos')) { stageId = 'castle'; stageLabel = 'Edad de los Castillos'; }
      else if (titleNorm.includes('imperial')) { stageId = 'imperial'; stageLabel = 'Edad Imperial'; }
    } else {
      stageLabel = stageId === 'dark' ? 'Alta Edad' : stageId === 'feudal' ? 'Edad Feudal' : stageId === 'castle' ? 'Edad de los Castillos' : 'Edad Imperial';
    }
    if (stageId) {
      return {
        type: 'stage_grade',
        stageId,
        threshold: 75,
        targetLabel: `Lograr nota A o S (≥ 75) en ${stageLabel}`,
      };
    }
  }

  // 5. Double-Bit Axe delay
  if (explicitType === 'dba_delay' || titleNorm.includes('hacha de doble filo') || titleNorm.includes('hacha madera') || (!titleNorm.startsWith('mejorar ') && (hay.includes('hacha de doble filo') || hay.includes('hacha madera')))) {
    const baseSec = parseSecondsFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 12 ? Math.max(10, Math.min(25, Math.round(baseSec * 0.75))) : 25;
    return {
      type: 'dba_delay',
      threshold,
      targetLabel: `Hacha de doble filo en ≤ ${threshold} s tras Feudal`,
    };
  }

  // 6. Bow Saw delay
  if (explicitType === 'bow_saw' || titleNorm.includes('sierra de arco') || hay.includes('sierra de arco')) {
    return {
      type: 'bow_saw',
      threshold: 40,
      targetLabel: 'Investigar Sierra de arco en ≤ 40 s tras Castillos',
    };
  }

  // 7. Feudal arrival time
  if (explicitType === 'feudal_time' || titleNorm.includes('llegada a edad feudal') || titleNorm.includes('pase a edad feudal') || titleNorm.includes('pase feudal') || (titleNorm.includes('feudal') && /\d{1,2}:\d{2}/.test(`${metric} ${detail}`))) {
    const baseSec = parseSecondsFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 480 ? Math.max(540, Math.round(baseSec - 12)) : 600;
    return {
      type: 'feudal_time',
      threshold,
      targetLabel: `Llegar a Edad Feudal en ≤ ${fmtClock(threshold)}`,
    };
  }

  // 8. Castle arrival time
  if (explicitType === 'castle_time' || titleNorm.includes('llegada a edad de los castillos') || titleNorm.includes('pase a edad de los castillos') || titleNorm.includes('pase castillos') || (titleNorm.includes('castillos') && /\d{1,2}:\d{2}/.test(`${metric} ${detail}`))) {
    const baseSec = parseSecondsFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 800 ? Math.max(930, Math.round(baseSec - 20)) : 1080;
    return {
      type: 'castle_time',
      threshold,
      targetLabel: `Llegar a Castillos en ≤ ${fmtClock(threshold)}`,
    };
  }

  // 9. Effective eAPM
  if (explicitType === 'eapm' || titleNorm.includes('eapm') || titleNorm.includes('ritmo efectivo') || hay.includes('eapm') || hay.includes('ritmo efectivo')) {
    const baseVal = parseNumberFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseVal) && baseVal > 15 ? Math.round(baseVal + 4) : 45;
    return {
      type: 'eapm',
      threshold,
      targetLabel: `Alcanzar ≥ ${threshold} eAPM efectivos`,
    };
  }

  // 10. Town Bell habit
  if (explicitType === 'no_town_bell' || hay.includes('campana urbana') || hay.includes('town bell')) {
    return {
      type: 'no_town_bell',
      threshold: 0,
      targetLabel: 'Terminar la partida con 0 usos de Campana urbana',
    };
  }

  // 11. Fallback TC Idle Dark / Feudal detected via `hay`
  if (hay.includes('alta edad') && (hay.includes('cu') || hay.includes('centro urbano') || hay.includes('pausa') || hay.includes('idle'))) {
    const baseSec = parseSecondsFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 8 ? Math.max(6, Math.min(18, Math.round(baseSec * 0.78))) : 15;
    return { type: 'tc_idle_dark', threshold, targetLabel: `Pausa de CU en Alta Edad ≤ ${threshold} s` };
  }
  if (hay.includes('feudal') && (hay.includes('cu') || hay.includes('centro urbano') || hay.includes('pausa') || hay.includes('idle'))) {
    const baseSec = parseSecondsFromText(`${metric} ${detail}`);
    const threshold = Number.isFinite(baseSec) && baseSec > 10 ? Math.max(8, Math.min(22, Math.round(baseSec * 0.80))) : 18;
    return { type: 'tc_idle_feudal', threshold, targetLabel: `Pausa de CU en Feudal ≤ ${threshold} s` };
  }

  // 12. Win against a specific Rival Civ ("Practicar contra Indostanos" / "contra <Civ>")
  const civMatch = /(?:contra|vs\.?)\s+([a-záéíóúñ\s]{3,24})$/i.exec(title.trim());
  if (item.civSlug || (hay.includes('rival') && civMatch)) {
    const targetCivName = String(item.civName || (civMatch && civMatch[1]) || '').trim();
    const targetCivNorm = normalizeSlug(item.civSlug || targetCivName);
    if (targetCivNorm) {
      return {
        type: 'vs_civ',
        targetCiv: targetCivNorm,
        targetCivName: targetCivName || targetCivNorm,
        targetLabel: `Ganar una partida real contra ${targetCivName || targetCivNorm}`,
      };
    }
  }

  // 13. Win on a specific Map ("Mejorar Mapa: Arabia")
  const mapMatch = /mapa:\s*([a-záéíóúñ\s]{3,28})/i.exec(title);
  if (item.mapName || mapMatch) {
    const targetMap = String(item.mapName || (mapMatch && mapMatch[1]) || '').trim();
    if (targetMap) {
      return {
        type: 'on_map',
        targetMap: normalizeSlug(targetMap),
        targetMapName: targetMap,
        targetLabel: `Ganar una partida real en ${targetMap}`,
      };
    }
  }

  // 14. Blacksmith / army upgrades
  if (explicitType === 'army_upgrades' || hay.includes('herreria') || hay.includes('mejoras militares') || hay.includes('armadura')) {
    return {
      type: 'army_upgrades',
      targetLabel: 'Pelear con mejoras de Herrería al día en tu próxima partida',
    };
  }

  // 15. Default verifiable goal: Win or achieve strong execution (≥ 75) in a real subsequent match
  return {
    type: 'win_clean',
    threshold: 75,
    targetLabel: 'Ganar o lograr nota ≥ 75 en una partida posterior (≥ 12 min)',
  };
}

/**
 * Clave canónica de deduplicación semántica para «Mi Plan».
 * Evita agregar objetivos duplicados o equivalentes desde Central, Postmatch o Progreso
 * aunque cambie la redacción o el umbral numérico en el título.
 */
function planRuleKey(rule, item = {}) {
  const r = rule && rule.type ? rule : inferPlanRule(item);
  if (r.type === 'stage_grade') return `rule:stage_grade:${normalizeSlug(r.stageId || 'any')}`;
  if (r.type === 'vs_civ') return `rule:vs_civ:${normalizeSlug(r.targetCiv || r.targetCivName || 'any')}`;
  if (r.type === 'on_map') return `rule:on_map:${normalizeSlug(r.targetMap || r.targetMapName || 'any')}`;
  if (r.type && r.type !== 'win_clean') return `rule:${r.type}`;
  const cleanTitle = normalizeSlug(
    String(item.title || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\d+(?:[.,:]\d+)?\s*(?:s|seg|m|min|%|eapm)?/gi, ' ')
  );
  return `title:${cleanTitle || normalizeSlug(item.title || item.id || 'item')}`;
}

function defaultTabForPlanRule(rule) {
  const type = rule?.type || '';
  if (['feudal_time', 'castle_time', 'tc_idle_dark', 'dba_delay'].includes(type)) return 'orders';
  if (['vs_civ', 'on_map'].includes(type)) return 'matchups';
  if (type === 'army_upgrades') return 'arena';
  return 'perf';
}

function recordTimestampMs(record) {
  const raw = Number(record?.endedAt || record?.startedAt || record?.savedAt || 0);
  if (!Number.isFinite(raw) || raw <= 0) return Date.now();
  // Convert unix seconds to ms if needed
  return raw < 1e12 ? raw * 1000 : raw;
}

function evaluateSinglePlanItem(item, record) {
  if (!item || item.done || !record) return { checked: false, passed: false };

  const matchId = String(record.matchId || '');
  if (matchId && Array.isArray(item.checkedMatchIds) && item.checkedMatchIds.includes(matchId)) {
    return { checked: false, passed: false };
  }

  // Anti-retroactive check: ONLY matches played AFTER adding the item to Mi Plan!
  const createdAt = Number(item.createdAt || 0);
  const recTs = recordTimestampMs(record);
  if (createdAt > 0 && recTs < createdAt - 60_000) {
    return { checked: false, passed: false };
  }

  const rule = item.verifyRule || inferPlanRule(item);
  const tel = record.telemetry || {};
  const eng = tel.engineSummary || {};
  const self = eng.self || {};
  const durationSec = Number(tel.durationSeconds || eng.durationSeconds || 0);
  const mapName = String(record.mapName || tel.context?.mapName || 'Partida').trim();
  const civName = String(record.civName || record.civSlug || tel.context?.civSlug || '').trim();
  const oppCivNorm = normalizeSlug(record.opponentCivName || record.opponentCivSlug || tel.context?.opponentCivSlug || '');
  const mapNorm = normalizeSlug(mapName);
  const matchTag = civName ? `${mapName} (${civName})` : mapName;

  if (rule.type === 'vs_civ') {
    if (durationSec > 0 && durationSec < MIN_WIN_DURATION_SEC) return { checked: false, passed: false };
    if (!oppCivNorm || (!oppCivNorm.includes(rule.targetCiv) && !rule.targetCiv.includes(oppCivNorm))) {
      return { checked: false, passed: false };
    }
    const won = record.won === true;
    return {
      checked: true,
      passed: won,
      measuredDisplay: won ? `Victoria vs ${rule.targetCivName}` : `Derrota vs ${rule.targetCivName}`,
      evidence: won ? `¡Victoria confirmada contra ${rule.targetCivName} en ${matchTag}!` : null,
    };
  }

  if (rule.type === 'on_map') {
    if (durationSec > 0 && durationSec < MIN_WIN_DURATION_SEC) return { checked: false, passed: false };
    if (!mapNorm || (!mapNorm.includes(rule.targetMap) && !rule.targetMap.includes(mapNorm))) {
      return { checked: false, passed: false };
    }
    const won = record.won === true;
    return {
      checked: true,
      passed: won,
      measuredDisplay: won ? `Victoria en ${mapName}` : `Derrota en ${mapName}`,
      evidence: won ? `¡Victoria confirmada en ${matchTag}!` : null,
    };
  }

  // Telemetry-based rules require a real match of >= 12 minutes
  if (durationSec < MIN_TELEMETRY_DURATION_SEC) {
    return { checked: false, passed: false };
  }

  if (rule.type === 'tc_idle_dark') {
    const val = Number(self.tcIdleDarkSeconds);
    if (!Number.isFinite(val)) return { checked: false, passed: false };
    const passed = val <= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: `${Math.round(val)} s`,
      evidence: passed ? `Cumplido en ${matchTag}: pausa de CU en Alta Edad de ${Math.round(val)} s (meta ≤ ${rule.threshold} s).` : null,
    };
  }

  if (rule.type === 'tc_idle_feudal') {
    const val = Number(self.tcIdleFeudalPerTcSeconds);
    if (!Number.isFinite(val)) return { checked: false, passed: false };
    const passed = val <= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: `${Math.round(val)} s`,
      evidence: passed ? `Cumplido en ${matchTag}: pausa de CU en Feudal de ${Math.round(val)} s (meta ≤ ${rule.threshold} s).` : null,
    };
  }

  if (rule.type === 'tc_gap') {
    const gap = Number(self.biggestTcGap?.durationSec);
    if (!Number.isFinite(gap)) return { checked: false, passed: false };
    const passed = gap <= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: `${Math.round(gap)} s`,
      evidence: passed ? `Cumplido en ${matchTag}: tu mayor pausa de CU bajó a ${Math.round(gap)} s (meta ≤ ${rule.threshold} s).` : null,
    };
  }

  if (rule.type === 'dba_delay') {
    const tp = self.techProfile || {};
    if (!tp.hasDoubleBitAxe || !Number.isFinite(Number(tp.doubleBitAxeDelaySec))) {
      return { checked: true, passed: false, measuredDisplay: 'Sin mejorar', evidence: null };
    }
    const val = Number(tp.doubleBitAxeDelaySec);
    const passed = val <= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: `${Math.round(val)} s`,
      evidence: passed ? `Cumplido en ${matchTag}: Hacha de doble filo investigada en ${Math.round(val)} s tras Feudal.` : null,
    };
  }

  if (rule.type === 'bow_saw') {
    const tp = self.techProfile || {};
    if (!tp.hasBowSaw || !Number.isFinite(Number(tp.bowSawDelaySec))) {
      return { checked: true, passed: false, measuredDisplay: 'Sin mejorar', evidence: null };
    }
    const val = Number(tp.bowSawDelaySec);
    const passed = val <= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: `${Math.round(val)} s`,
      evidence: passed ? `Cumplido en ${matchTag}: Sierra de arco investigada en ${Math.round(val)} s tras Castillos.` : null,
    };
  }

  if (rule.type === 'feudal_time') {
    const val = Number(self.timings?.feudalSeconds);
    if (!Number.isFinite(val) || val <= 0) return { checked: false, passed: false };
    const passed = val <= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: fmtClock(val),
      evidence: passed ? `Cumplido en ${matchTag}: llegada a Edad Feudal en ${fmtClock(val)} (meta ≤ ${fmtClock(rule.threshold)}).` : null,
    };
  }

  if (rule.type === 'castle_time') {
    const val = Number(self.timings?.castleSeconds);
    if (!Number.isFinite(val) || val <= 0) return { checked: false, passed: false };
    const passed = val <= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: fmtClock(val),
      evidence: passed ? `Cumplido en ${matchTag}: llegada a Castillos en ${fmtClock(val)} (meta ≤ ${fmtClock(rule.threshold)}).` : null,
    };
  }

  if (rule.type === 'eapm') {
    const val = Number(self.eapm);
    if (!Number.isFinite(val) || val <= 0) return { checked: false, passed: false };
    const passed = val >= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: `${Math.round(val)} eAPM`,
      evidence: passed ? `Cumplido en ${matchTag}: ritmo efectivo de ${Math.round(val)} eAPM (meta ≥ ${rule.threshold}).` : null,
    };
  }

  if (rule.type === 'no_town_bell') {
    const bells = Number(self.habits?.townBell);
    if (!Number.isFinite(bells)) return { checked: false, passed: false };
    const passed = bells === 0;
    return {
      checked: true,
      passed,
      measuredDisplay: `${bells} usos`,
      evidence: passed ? `Cumplido en ${matchTag}: terminaste con 0 usos de Campana urbana.` : null,
    };
  }

  if (rule.type === 'stage_grade') {
    const stages = Array.isArray(eng.stages) ? eng.stages : [];
    const st = stages.find((s) => s.id === rule.stageId && s.status === 'ready');
    if (!st || !Number.isFinite(Number(st.score))) return { checked: false, passed: false };
    const passed = Number(st.score) >= rule.threshold;
    return {
      checked: true,
      passed,
      measuredDisplay: `${Math.round(st.score)}/100`,
      evidence: passed ? `Cumplido en ${matchTag}: lograste ${Math.round(st.score)}/100 en ${rule.stageId === 'dark' ? 'Alta Edad' : rule.stageId === 'feudal' ? 'Edad Feudal' : rule.stageId === 'castle' ? 'Castillos' : 'Imperial'}.` : null,
    };
  }

  if (rule.type === 'army_upgrades') {
    const wellEq = self.techProfile?.armyRelevance?.wellEquipped;
    if (typeof wellEq !== 'boolean') return { checked: false, passed: false };
    return {
      checked: true,
      passed: wellEq,
      measuredDisplay: wellEq ? 'Al día' : 'Faltaron mejoras',
      evidence: wellEq ? `Cumplido en ${matchTag}: mantuviste tus mejoras militares al día.` : null,
    };
  }

  // Fallback verifiable rule: win or strong overall stage score >= 75
  const stages = Array.isArray(eng.stages) ? eng.stages.filter((s) => s.status === 'ready' && Number.isFinite(Number(s.score))) : [];
  const avgScore = stages.length ? Math.round(stages.reduce((acc, s) => acc + Number(s.score), 0) / stages.length) : null;
  const passed = record.won === true || (avgScore != null && avgScore >= (rule.threshold || 75));
  return {
    checked: true,
    passed,
    measuredDisplay: record.won === true ? 'Victoria' : (avgScore != null ? `${avgScore}/100` : 'Evaluada'),
    evidence: passed
      ? (record.won === true ? `Cumplido con victoria real en ${matchTag}.` : `Cumplido en ${matchTag} con ejecución promedio de ${avgScore}/100.`)
      : null,
  };
}

function evaluatePlanQueueAgainstRecord(queue = [], record) {
  if (!Array.isArray(queue) || !queue.length || !record) {
    return { updatedQueue: Array.isArray(queue) ? queue : [], newlyCompletedPlanItems: [], changed: false };
  }
  const matchId = String(record.matchId || '');
  const newlyCompletedPlanItems = [];
  let changed = false;

  const updatedQueue = queue.map((item) => {
    if (!item || item.done) return item;
    const res = evaluateSinglePlanItem(item, record);
    if (!res.checked) return item;

    changed = true;
    const nextCheckedIds = matchId
      ? [...(Array.isArray(item.checkedMatchIds) ? item.checkedMatchIds : []), matchId].slice(-30)
      : (Array.isArray(item.checkedMatchIds) ? item.checkedMatchIds : []);

    if (res.passed) {
      const completed = {
        ...item,
        done: true,
        autoVerified: true,
        doneAt: Date.now(),
        verifiedMatchId: matchId || null,
        verifiedEvidence: res.evidence || 'Cumplido automáticamente en tu partida real.',
        lastCheckedDisplay: res.measuredDisplay || null,
        attemptsAfterPin: Number(item.attemptsAfterPin || 0) + 1,
        checkedMatchIds: nextCheckedIds,
      };
      newlyCompletedPlanItems.push(completed);
      return completed;
    }

    return {
      ...item,
      attemptsAfterPin: Number(item.attemptsAfterPin || 0) + 1,
      lastCheckedDisplay: res.measuredDisplay || null,
      checkedMatchIds: nextCheckedIds,
    };
  });

  return { updatedQueue, newlyCompletedPlanItems, changed };
}

module.exports = {
  inferPlanRule,
  planRuleKey,
  defaultTabForPlanRule,
  evaluateSinglePlanItem,
  evaluatePlanQueueAgainstRecord,
};
