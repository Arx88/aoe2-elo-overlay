'use strict';

/**
 * MOTOR DE INTELIGENCIA COMPETITIVA Y MEJORA PERSONAL DE CENTRAL (src/central-intel.js)
 *
 * Implementa 4 bloques de alto valor táctico usando 100% telemetría y partidas ya cargadas
 * (0 consultas nuevas de red) y terminología oficial de Age of Empires II: Definitive Edition:
 *   1. Diagnóstico por Mapa y Terreno (Master-Detail: analyzeMapPerformance / buildModeMapDiagnostics)
 *   2. Laboratorio de Mejora Personal (computePersonalAcademy: evolución de notas S–D por edad + 6 hábitos mecánicos)
 *   3. Balance de Motores y Fugas de ELO (computeEloAttributionAndSession: atribución neta ajustada por ELO)
 *   4. Radar de Aperturas Rivales, Antídotos y Fatiga de Sesión / Tilt
 */

const { civSlug } = require('./civs');
const { mapKey } = require('./rival');
const { openingLabel, openingShort } = require('./replay-analysis');

const SESSION_GAP_MS = 90 * 60_000;
const PRIOR_STRENGTH = 5;

const STAGE_LABELS = Object.freeze({
  dark: 'Alta Edad Media',
  feudal: 'Edad Feudal',
  castle: 'Edad de los Castillos',
  imperial: 'Edad Imperial',
});

const FOCUS_DOMAIN_INFO = Object.freeze({
  macro_tc: {
    title: 'Evitar pausas en la cola de aldeanos (Alta Edad Media y Edad Feudal)',
    detail: 'Mantené el Centro urbano produciendo de forma continua con tu tecla de acceso rápido mientras manejás el explorador o el ejército.',
  },
  blacksmith_techs: {
    title: 'Acompañar tu ejército principal con mejoras de Herrería',
    detail: 'Priorizá armadura para caballería/infantería y Emplumado/Punzones para unidades a distancia antes de comprometer peleas.',
  },
  eco_techs: {
    title: 'Investigar Hacha de doble filo y Sierra de arco al subir de edad',
    detail: 'Activar la mejora de madera apenas llegás a Edad Feudal y Edad de los Castillos financia granjas y edificios militares sin cuellos de botella.',
  },
  defensive_micro: {
    title: 'Defender sin tocar la Campana urbana',
    detail: 'Guarecé únicamente a los aldeanos amenazados y usá Volver al trabajo para no paralizar toda tu economía.',
  },
  micro_combat: {
    title: 'Usar Movimiento de ataque o Patrullar en choques militares',
    detail: 'Evitá hacer clic derecho sobre una sola unidad enemiga en peleas grandes para que todo tu ejército ataque en simultáneo.',
  },
  tempo_ages: {
    title: 'Ajustar tiempos de avance a Edad Feudal y Edad de los Castillos',
    detail: 'Equilibrá comida y granjas tempranas para no ceder la iniciativa ni la ventana tecnológica frente al rival.',
  },
  workshops: {
    title: 'Escalar edificios militares al subir a Edad de los Castillos e Imperial',
    detail: 'Sumá cuarteles, galerías de tiro con arco o establos adicionales para convertir tus recursos en ejército en el mapa.',
  },
  economy_boom: {
    title: 'Equilibrar reparto de aldeanos y expansión de Centros urbanos',
    detail: 'Ajustá leñadores y granjeros temprano para no depender de comisiones del Mercado ni quedarte atrás en economía.',
  },
  stamina_pace: {
    title: 'Sostener el ritmo de producción en partidas largas (+30 min)',
    detail: 'Apoyate en grupos de control y selección múltiple de edificios militares en Edad Imperial.',
  },
});

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

function avg(values, digits = 1) {
  const valid = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!valid.length) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const scale = 10 ** digits;
  return Math.round(mean * scale) / scale;
}

function median(values) {
  const valid = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  const val = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  return Math.round(val * 10) / 10;
}

function gradeFromScore(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 88) return 'S';
  if (score >= 76) return 'A';
  if (score >= 62) return 'B';
  if (score >= 48) return 'C';
  return 'D';
}

function expectedWinProb(myElo, oppElo) {
  const a = Number(myElo);
  const b = Number(oppElo);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0.5;
  return 1 / (1 + 10 ** ((b - a) / 400));
}

function classifyTerrainLabel(mapName, openness) {
  const op = String(openness || '').toLowerCase();
  const mk = mapKey(mapName);
  if (op.includes('closed') || /arena|blackforest|selvanegra|hideout|fortress|muralla|michoacan|amazon/.test(mk)) return 'Cerrado';
  if (op.includes('water') || op.includes('hybrid') || /islands|islas|mediterranean|baltic|continental|fourlakes|cuatrolagos|migration|water|nomad|rivers/.test(mk)) {
    if (/nomad|nomada|landnomad/.test(mk)) return 'Nómada / Especial';
    return 'Agua / Híbrido';
  }
  if (/nomad|nomada|megarandom|megazar/.test(mk)) return 'Nómada / Especial';
  return 'Abierto';
}

function phaseLabelForSec(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const mins = sec / 60;
  if (mins < 22) return 'Feudal / Temprano (<22m)';
  if (mins < 35) return 'Edad de los Castillos (22–35m)';
  if (mins < 48) return 'Edad Imperial (35–48m)';
  return 'Post-Imperial (48m+)';
}

const INSIGHTS_OPENING_ALIASES = Object.freeze({
  'scout rush': 'Scout Rush',
  'archer rush': 'Archer Rush',
  'fast castle': 'Fast Castle',
  'man at arms rush': 'M@A Rush',
  'm@a rush': 'M@A Rush',
  'drush fast castle': 'Drush FC',
  'drush fc': 'Drush FC',
  'tower rush': 'Tower Rush',
  'hoang rush': 'Hoang Rush',
  'monk rush': 'Monk Rush',
  'pike skirm': 'Pike Skirm',
  '2tc feudal boom': '2TC Feudal Boom',
  'fc boom': 'FC Boom',
  'scouts into archers': 'Scouts into Archers',
  'drush archers': 'Drush Archers',
  'm@a archers': 'M@A Archers',
  'm@a scouts': 'M@A Scouts',
  'drush m@a': 'Drush M@A',
  'elephant rush': 'Elephant Rush',
  'serjeant rush': 'Serjeant Rush',
  'scorpions & rams': 'Scorpions & Rams',
});

function cleanOpeningName(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || /^other|otra|unknown/i.test(s)) return null;
  const canonical = INSIGHTS_OPENING_ALIASES[s.toLowerCase()] || s;
  return openingLabel(canonical) || openingShort(canonical) || s;
}

/* ============================================================================
 * 1. DIAGNÓSTICO POR MAPA Y TERRENO (Master-Detail)
 * ============================================================================ */

function analyzeMapPerformance({ targetMap, matches = [], allTimeEntry = null } = {}) {
  const wantedKey = mapKey(targetMap);
  if (!wantedKey) return { ok: false };

  const valid = (Array.isArray(matches) ? matches : []).filter((m) => m && typeof m.won === 'boolean');
  const mapMatches = valid.filter((m) => mapKey(m.mapKey || m.mapName) === wantedKey);
  const otherMatches = valid.filter((m) => mapKey(m.mapKey || m.mapName) !== wantedKey);

  const mapName = mapMatches[0]?.mapName || allTimeEntry?.mapName || targetMap;
  const terrainLabel = classifyTerrainLabel(mapName, mapMatches[0]?.openness);

  const wins = mapMatches.filter((m) => m.won).length;
  const losses = mapMatches.length - wins;
  const games = mapMatches.length;
  const rawWinRate = games > 0 ? pct(wins, games) : (allTimeEntry?.winRate ?? null);

  const expList = mapMatches.map((m) => expectedWinProb(m.myElo, m.oppElo));
  const expectedMean = expList.length ? expList.reduce((a, b) => a + b, 0) / expList.length : 0.5;
  const shrunkRate = games > 0
    ? (wins + PRIOR_STRENGTH * expectedMean) / (games + PRIOR_STRENGTH)
    : expectedMean;
  const shrunkWinRate = Math.round(shrunkRate * 100);
  const deltaPp = games > 0 ? Math.round((shrunkRate - expectedMean) * 100) : 0;

  // Desglose por civilización propia en este mapa
  const civAcc = new Map();
  for (const m of mapMatches) {
    if (!m.civ) continue;
    const slug = m.civSlug || civSlug(m.civ) || String(m.civ).toLowerCase();
    const cur = civAcc.get(slug) || { civ: m.civ, slug, games: 0, wins: 0, losses: 0 };
    cur.games += 1;
    if (m.won) cur.wins += 1;
    else cur.losses += 1;
    civAcc.set(slug, cur);
  }
  const civRows = [...civAcc.values()]
    .map((c) => ({
      label: c.civ,
      slug: c.slug,
      games: c.games,
      wins: c.wins,
      losses: c.losses,
      winRate: pct(c.wins, c.games),
    }))
    .sort((a, b) => b.games - a.games || (b.winRate || 0) - (a.winRate || 0));

  const eligibleBestCivs = civRows.filter((c) => c.games >= 2 && c.winRate != null);
  const bestCivHere = eligibleBestCivs.length
    ? [...eligibleBestCivs].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
    : (civRows[0] || null);
  const worstCivHere = eligibleBestCivs.length >= 2
    ? [...eligibleBestCivs].sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0]
    : null;

  // Desglose por apertura rival en este mapa
  const oppOpAcc = new Map();
  for (const m of mapMatches) {
    const opName = cleanOpeningName(m.oppOpening);
    if (!opName) continue;
    const cur = oppOpAcc.get(opName) || { label: opName, games: 0, wins: 0, losses: 0 };
    cur.games += 1;
    if (m.won) cur.wins += 1;
    else cur.losses += 1;
    oppOpAcc.set(opName, cur);
  }
  const oppOpeningRows = [...oppOpAcc.values()]
    .map((o) => ({ ...o, winRate: pct(o.wins, o.games) }))
    .sort((a, b) => b.games - a.games || (a.winRate || 0) - (b.winRate || 0));

  // Desglose por fase de duración en este mapa
  const phaseOrder = [
    'Feudal / Temprano (<22m)',
    'Edad de los Castillos (22–35m)',
    'Edad Imperial (35–48m)',
    'Post-Imperial (48m+)',
  ];
  const phaseAcc = new Map();
  for (const m of mapMatches) {
    const durSec = Number(m.durationGameSec ?? m.replay?.durationSeconds);
    const pLbl = phaseLabelForSec(durSec);
    if (!pLbl) continue;
    const cur = phaseAcc.get(pLbl) || { label: pLbl, games: 0, wins: 0, losses: 0 };
    cur.games += 1;
    if (m.won) cur.wins += 1;
    else cur.losses += 1;
    phaseAcc.set(pLbl, cur);
  }
  const phaseRows = phaseOrder
    .map((lbl) => phaseAcc.get(lbl))
    .filter(Boolean)
    .map((p) => ({ ...p, winRate: pct(p.wins, p.games) }));

  // Ritmo eAPM en este mapa vs otros mapas
  const mapEapms = mapMatches.map((m) => Number(m.myEapm)).filter((v) => Number.isFinite(v) && v > 0);
  const otherEapms = otherMatches.map((m) => Number(m.myEapm)).filter((v) => Number.isFinite(v) && v > 0);
  const medianEapm = median(mapEapms);
  const baselineMedianEapm = median(otherEapms);
  const deltaEapm = (medianEapm != null && baselineMedianEapm != null)
    ? Math.round((medianEapm - baselineMedianEapm) * 10) / 10
    : null;
  const outpacedMatches = mapMatches.filter((m) => Number.isFinite(m.myEapm) && Number.isFinite(m.oppEapm) && m.myEapm > m.oppEapm);
  const outpacedWins = outpacedMatches.filter((m) => m.won).length;

  const sampleInfo = {
    games,
    wins,
    losses,
    needed: 4,
    rawWinRate,
    shrunkWinRate,
    deltaPp,
    allTime: allTimeEntry ? {
      games: allTimeEntry.games,
      wins: allTimeEntry.wins,
      losses: allTimeEntry.losses,
      winRate: allTimeEntry.winRate,
    } : null,
  };

  if (games < 4) {
    return {
      ok: true,
      mapName,
      mapKey: wantedKey,
      terrainLabel,
      status: 'insufficient',
      verdict: 'sample',
      verdictLabel: 'Muestra inicial',
      confidenceLabel: `${games}/4 partidas con detalle`,
      summaryLine: `Necesitás al menos 4 partidas analizadas en ${mapName} para detectar patrones tácticos confiables.`,
      sample: sampleInfo,
      bestCivHere: bestCivHere ? { civ: bestCivHere.label, slug: bestCivHere.slug, winRate: bestCivHere.winRate, games: bestCivHere.games } : null,
      findings: [],
      breakdowns: {
        civs: civRows.slice(0, 6),
        oppOpenings: oppOpeningRows.slice(0, 6),
        phases: phaseRows,
        pace: {
          sample: mapEapms.length,
          medianEapm,
          baselineMedianEapm,
          deltaEapm,
          outpacedGames: outpacedMatches.length,
          outpacedWinRate: outpacedMatches.length >= 2 ? pct(outpacedWins, outpacedMatches.length) : null,
        },
      },
    };
  }

  let verdict = 'balanced';
  let verdictLabel = 'Equilibrado';
  if (deltaPp >= 7 || (rawWinRate >= 58 && games >= 5)) {
    verdict = 'strength';
    verdictLabel = 'Mapa fuerte';
  } else if (deltaPp <= -7 || (rawWinRate <= 42 && games >= 5)) {
    verdict = 'weakness';
    verdictLabel = 'Punto débil';
  }

  const findings = [];

  // Hallazgo 1: Selección de civilización en este mapa (mejor vs peor civ)
  if (worstCivHere && worstCivHere.games >= 3 && worstCivHere.winRate <= 38) {
    const contrast = bestCivHere && bestCivHere.slug !== worstCivHere.slug && bestCivHere.winRate >= 55
      ? `Con ${bestCivHere.label} rendís al ${bestCivHere.winRate}% (${bestCivHere.wins}V-${bestCivHere.losses}D) en este mismo mapa.`
      : `Tu rendimiento con ${worstCivHere.label} en ${mapName} está muy por debajo de tu media.`;
    findings.push({
      id: 'map-civ-mismatch',
      tone: 'loss',
      civNames: [worstCivHere.label, bestCivHere?.label].filter(Boolean),
      title: `${worstCivHere.label} te penaliza en ${mapName}`,
      metric: `${worstCivHere.winRate}% WR (${worstCivHere.wins}V-${worstCivHere.losses}D)`,
      detail: contrast,
      takeaway: bestCivHere && bestCivHere.slug !== worstCivHere.slug
        ? `Priorizá ${bestCivHere.label} en ${mapName} y evitá ${worstCivHere.label}.`
        : `Probá una civilización más afín al terreno ${terrainLabel.toLowerCase()} de ${mapName}.`,
    });
  } else if (bestCivHere && bestCivHere.games >= 3 && bestCivHere.winRate >= 65) {
    findings.push({
      id: 'map-civ-comfort',
      tone: 'win',
      civNames: [bestCivHere.label],
      title: `${bestCivHere.label} es tu mejor elección en ${mapName}`,
      metric: `${bestCivHere.winRate}% WR (${bestCivHere.wins}V-${bestCivHere.losses}D)`,
      detail: `Lograste ${bestCivHere.wins} victorias en ${bestCivHere.games} partidas jugando ${bestCivHere.label} en este terreno.`,
      takeaway: `Mantené a ${bestCivHere.label} como tu civilización principal cuando salga ${mapName}.`,
    });
  }

  // Hallazgo 2: Apertura rival que más castiga o que mejor controlás en este mapa
  const toughOpening = oppOpeningRows.find((o) => o.games >= 3 && o.winRate <= 38);
  const dominatedOpening = oppOpeningRows.find((o) => o.games >= 3 && o.winRate >= 65);
  if (toughOpening) {
    findings.push({
      id: 'map-opp-opening-loss',
      tone: 'loss',
      title: `Sufrís contra ${toughOpening.label} en ${mapName}`,
      metric: `${toughOpening.winRate}% WR (${toughOpening.wins}V-${toughOpening.losses}D)`,
      detail: `Perdiste ${toughOpening.losses} de ${toughOpening.games} partidas en ${mapName} cuando el rival abrió con ${toughOpening.label}.`,
      takeaway: `Explorá temprano en ${mapName} para anticipar ${toughOpening.label} y preparar defensa a tiempo.`,
    });
  } else if (dominatedOpening) {
    findings.push({
      id: 'map-opp-opening-win',
      tone: 'win',
      title: `Dominás contra ${dominatedOpening.label} en ${mapName}`,
      metric: `${dominatedOpening.winRate}% WR (${dominatedOpening.wins}V-${dominatedOpening.losses}D)`,
      detail: `Ganaste ${dominatedOpening.wins} de ${dominatedOpening.games} cruces frente a ${dominatedOpening.label} en este mapa.`,
      takeaway: `Tu lectura defensiva contra ${dominatedOpening.label} en ${mapName} es muy sólida.`,
    });
  }

  // Hallazgo 3: Fase de partida crítica en este mapa
  const weakPhase = phaseRows.find((p) => p.games >= 3 && p.winRate <= 38);
  const strongPhase = phaseRows.find((p) => p.games >= 3 && p.winRate >= 65);
  if (weakPhase) {
    findings.push({
      id: 'map-phase-loss',
      tone: 'loss',
      title: `Caída en ${weakPhase.label}`,
      metric: `${weakPhase.winRate}% WR (${weakPhase.wins}V-${weakPhase.losses}D)`,
      detail: `En ${mapName}, tus derrotas se concentran cuando la partida entra en ${weakPhase.label}.`,
      takeaway: weakPhase.label.includes('48m+') || weakPhase.label.includes('Imperial')
        ? `Buscá cerrar o tomar ventaja territorial antes del juego tardío en ${mapName}.`
        : `Reforzá tu transición defensiva temprana en ${mapName}.`,
    });
  } else if (strongPhase) {
    findings.push({
      id: 'map-phase-win',
      tone: 'win',
      title: `Ventaja decisiva en ${strongPhase.label}`,
      metric: `${strongPhase.winRate}% WR (${strongPhase.wins}V-${strongPhase.losses}D)`,
      detail: `Cerrás con alta efectividad las partidas de ${mapName} que se definen en ${strongPhase.label}.`,
      takeaway: `Llevá el ritmo de ${mapName} hacia esa ventana de tiempo donde tenés ventaja.`,
    });
  }

  // Hallazgo 4: Ritmo mecánico eAPM en este mapa vs tu media
  if (findings.length < 3 && deltaEapm != null && Math.abs(deltaEapm) >= 4 && mapEapms.length >= 3) {
    findings.push({
      id: 'map-pace-delta',
      tone: deltaEapm > 0 ? 'win' : 'loss',
      title: deltaEapm > 0 ? `Ritmo mecánico superior en ${mapName}` : `Menor velocidad mecánica en ${mapName}`,
      metric: `${deltaEapm > 0 ? '+' : ''}${deltaEapm} eAPM vs otros mapas`,
      detail: `Promediás ${medianEapm} eAPM en ${mapName} frente a ${baselineMedianEapm} eAPM en el resto del pool.`,
      takeaway: deltaEapm < 0
        ? `En mapas de tipo ${terrainLabel.toLowerCase()}, no descuides tus atajos de edificios militares y Centros urbanos.`
        : `Te sentís cómodo con el ritmo táctico que exige ${mapName}.`,
    });
  }

  const confidenceLabel = games >= 15 ? 'Confianza alta' : games >= 8 ? 'Confianza media' : 'Muestra moderada';
  const summaryLine = findings.length
    ? findings[0].detail
    : `Rendimiento parejo en ${mapName} (${rawWinRate}% WR en ${games} partidas).`;

  return {
    ok: true,
    mapName,
    mapKey: wantedKey,
    terrainLabel,
    status: 'ready',
    verdict,
    verdictLabel,
    confidenceLabel,
    summaryLine,
    sample: sampleInfo,
    bestCivHere: bestCivHere ? { civ: bestCivHere.label, slug: bestCivHere.slug, winRate: bestCivHere.winRate, games: bestCivHere.games } : null,
    findings: findings.slice(0, 3),
    breakdowns: {
      civs: civRows.slice(0, 6),
      oppOpenings: oppOpeningRows.slice(0, 6),
      phases: phaseRows,
      pace: {
        sample: mapEapms.length,
        medianEapm,
        baselineMedianEapm,
        deltaEapm,
        outpacedGames: outpacedMatches.length,
        outpacedWinRate: outpacedMatches.length >= 2 ? pct(outpacedWins, outpacedMatches.length) : null,
      },
    },
  };
}

function buildModeMapDiagnostics({ modeId, matches = [], allTimeMaps = [] } = {}) {
  const byKey = new Map();
  for (const entry of Array.isArray(allTimeMaps) ? allTimeMaps : []) {
    if (!entry || !entry.mapName) continue;
    const k = mapKey(entry.mapKey || entry.mapName);
    if (k) byKey.set(k, { mapName: entry.mapName, allTimeEntry: entry });
  }
  for (const m of Array.isArray(matches) ? matches : []) {
    if (!m || (!m.mapName && !m.mapKey)) continue;
    const k = mapKey(m.mapKey || m.mapName);
    if (k && !byKey.has(k)) {
      byKey.set(k, { mapName: m.mapName || m.mapKey, allTimeEntry: null });
    }
  }

  const out = {};
  for (const [k, info] of byKey.entries()) {
    const diag = analyzeMapPerformance({
      targetMap: info.mapName,
      matches,
      allTimeEntry: info.allTimeEntry,
      modeId,
    });
    if (diag && diag.ok) out[k] = diag;
  }
  return out;
}

/* ============================================================================
 * 2. LABORATORIO DE MEJORA PERSONAL (Replays locales .aoe2record)
 * ============================================================================ */

function extractEngineSummary(record) {
  const t = record?.telemetry;
  if (!t) return null;
  return t.engineSummary || t.engine || null;
}

function computePersonalAcademy({ storedRecords = [], profileId = null, isOwnProfile = true } = {}) {
  if (!isOwnProfile) return null;
  const pid = Number(profileId);

  // Filtrar replays propios válidos y excluir abandonos tempranos (< 180 s)
  const valid = (Array.isArray(storedRecords) ? storedRecords : [])
    .filter((r) => {
      if (!r || !r.telemetry) return false;
      if (Number.isFinite(pid) && pid > 0 && Number.isFinite(Number(r.profileId)) && Number(r.profileId) !== pid) return false;
      const eng = extractEngineSummary(r);
      if (!eng || !eng.self) return false;
      const dur = Number(eng.durationSeconds ?? r.telemetry.durationSeconds ?? r.durationSeconds ?? 0);
      return dur >= 180;
    })
    .sort((a, b) => (Number(b.startedAt) || 0) - (Number(a.startedAt) || 0));

  if (valid.length < 3) return null;

  const splitIdx = Math.max(2, Math.min(8, Math.ceil(valid.length / 2)));
  const recent = valid.slice(0, splitIdx);
  const older = valid.slice(splitIdx, splitIdx * 2);

  // 1. Evolución de Calificación por Edad (Alta Edad Media, Edad Feudal, Edad de los Castillos, Edad Imperial)
  const stageIds = ['dark', 'feudal', 'castle', 'imperial'];
  const stageEvolution = stageIds.map((stageId) => {
    const getScores = (list) => list
      .map((rec) => {
        const eng = extractEngineSummary(rec);
        const st = (Array.isArray(eng?.stages) ? eng.stages : []).find((s) => s && s.id === stageId && s.status === 'ready' && Number.isFinite(s.score));
        return st ? Number(st.score) : null;
      })
      .filter((v) => v != null);

    const recScores = getScores(recent);
    const oldScores = getScores(older);
    const allScores = getScores(valid);
    const recentScore = recScores.length ? Math.round(avg(recScores, 0)) : (allScores.length ? Math.round(avg(allScores, 0)) : null);
    const olderScore = oldScores.length ? Math.round(avg(oldScores, 0)) : null;
    const deltaScore = (recentScore != null && olderScore != null) ? (recentScore - olderScore) : null;

    return {
      id: stageId,
      label: STAGE_LABELS[stageId] || stageId,
      sample: allScores.length,
      recentScore,
      recentGrade: gradeFromScore(recentScore),
      olderScore,
      olderGrade: gradeFromScore(olderScore),
      deltaScore,
    };
  });

  // 2. 6 Hábitos Mecánicos con terminología 100% oficial de AoE2:DE
  const earlyIdleOf = (rec) => {
    const self = extractEngineSummary(rec)?.self;
    if (!self) return null;
    if (Number.isFinite(self.tcIdleDarkSeconds) && Number.isFinite(self.tcIdleFeudalPerTcSeconds)) {
      return self.tcIdleDarkSeconds + self.tcIdleFeudalPerTcSeconds;
    }
    if (Number.isFinite(self.tcIdleEarlySeconds)) return self.tcIdleEarlySeconds;
    return Number.isFinite(self.tcIdleSeconds) ? self.tcIdleSeconds : null;
  };
  const eapmOf = (rec) => {
    const eng = extractEngineSummary(rec);
    const v = eng?.self?.eapm ?? rec?.telemetry?.metrics?.eapm?.value;
    return Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
  };

  const recIdles = recent.map(earlyIdleOf).filter((v) => v != null);
  const oldIdles = older.map(earlyIdleOf).filter((v) => v != null);
  const curIdleAvg = recIdles.length ? Math.round(avg(recIdles, 0)) : Math.round(avg(valid.map(earlyIdleOf).filter((v) => v != null), 0) || 0);
  const oldIdleAvg = oldIdles.length ? Math.round(avg(oldIdles, 0)) : null;
  const idleDelta = (oldIdleAvg != null && recIdles.length) ? (curIdleAvg - oldIdleAvg) : null;

  // Hábito 2: Hacha de doble filo a tiempo (<= 75s de llegar a Edad Feudal)
  const dbaEligible = valid.filter((r) => extractEngineSummary(r)?.self?.techProfile != null);
  const dbaTimely = dbaEligible.filter((r) => {
    const tp = extractEngineSummary(r)?.self?.techProfile;
    return tp?.hasDoubleBitAxe && (tp.doubleBitAxeDelaySec == null || tp.doubleBitAxeDelaySec <= 75);
  });
  const dbaPct = dbaEligible.length ? pct(dbaTimely.length, dbaEligible.length) : null;

  // Hábito 3: Herrería al día con tu ejército
  const bsEligible = valid.filter((r) => extractEngineSummary(r)?.self?.techProfile?.armyRelevance?.primaryClass != null);
  const bsEquipped = bsEligible.filter((r) => extractEngineSummary(r)?.self?.techProfile?.armyRelevance?.wellEquipped === true);
  const bsPct = bsEligible.length ? pct(bsEquipped.length, bsEligible.length) : null;

  // Hábito 4: Movimiento de ataque y Patrullar
  const microList = valid.map((r) => {
    const h = extractEngineSummary(r)?.self?.habits;
    if (!h) return null;
    return (Number(h.attackMove) || 0) + (Number(h.patrol) || 0);
  }).filter((v) => v != null);
  const avgMicroOrders = microList.length ? avg(microList, 1) : 0;
  const activeMicroGames = microList.filter((v) => v >= 4).length;
  const activeMicroPct = microList.length ? pct(activeMicroGames, microList.length) : 0;

  // Hábito 5: Defensa sin Campana urbana
  const bellList = valid.map((r) => extractEngineSummary(r)?.self?.habits?.townBell).filter((v) => v != null);
  const cleanBellGames = bellList.filter((v) => Number(v) === 0).length;
  const cleanBellPct = bellList.length ? pct(cleanBellGames, bellList.length) : 100;

  // Hábito 6: Velocidad efectiva (eAPM)
  const recEapms = recent.map(eapmOf).filter((v) => v != null);
  const oldEapms = older.map(eapmOf).filter((v) => v != null);
  const curEapmAvg = recEapms.length ? avg(recEapms, 1) : avg(valid.map(eapmOf).filter((v) => v != null), 1);
  const oldEapmAvg = oldEapms.length ? avg(oldEapms, 1) : null;
  const eapmDelta = (curEapmAvg != null && oldEapmAvg != null) ? Math.round((curEapmAvg - oldEapmAvg) * 10) / 10 : null;

  const habits = [
    {
      id: 'tc_idle',
      label: 'Centro urbano inactivo (Alta + Feudal)',
      valueText: `${curIdleAvg} s`,
      subText: oldIdleAvg != null ? `Antes ${oldIdleAvg} s por partida` : `Promedio en ${valid.length} replays`,
      deltaText: idleDelta != null && idleDelta !== 0 ? `${Math.abs(idleDelta)} s` : null,
      improved: idleDelta != null ? idleDelta < 0 : curIdleAvg <= 45,
      tone: curIdleAvg <= 45 ? 'win' : curIdleAvg >= 95 ? 'loss' : 'neutral',
    },
    {
      id: 'double_bit_axe',
      label: 'Hacha de doble filo a tiempo',
      valueText: dbaPct != null ? `${dbaPct}%` : '—',
      subText: dbaEligible.length ? `${dbaTimely.length}/${dbaEligible.length} partidas al subir a Feudal` : 'Sin muestra de tecnologías',
      deltaText: null,
      improved: (dbaPct || 0) >= 75,
      tone: (dbaPct || 0) >= 75 ? 'win' : (dbaPct != null && dbaPct < 50) ? 'loss' : 'neutral',
    },
    {
      id: 'blacksmith',
      label: 'Herrería al día con tu ejército',
      valueText: bsPct != null ? `${bsPct}%` : '—',
      subText: bsEligible.length ? `${bsEquipped.length}/${bsEligible.length} partidas bien equipadas` : 'Ejércitos sin rama dominante',
      deltaText: null,
      improved: (bsPct || 0) >= 70,
      tone: (bsPct || 0) >= 70 ? 'win' : (bsPct != null && bsPct < 45) ? 'loss' : 'neutral',
    },
    {
      id: 'combat_micro',
      label: 'Movimiento de ataque y Patrullar',
      valueText: `${String(avgMicroOrders).replace('.', ',')} / pj`,
      subText: `${activeMicroPct}% de partidas con control activo`,
      deltaText: null,
      improved: activeMicroPct >= 65,
      tone: activeMicroPct >= 65 ? 'win' : activeMicroPct < 35 ? 'loss' : 'neutral',
    },
    {
      id: 'clean_defense',
      label: 'Defensa sin Campana urbana',
      valueText: `${cleanBellPct}%`,
      subText: `${cleanBellGames}/${bellList.length || valid.length} partidas sin paralizar economía`,
      deltaText: null,
      improved: cleanBellPct >= 85,
      tone: cleanBellPct >= 85 ? 'win' : cleanBellPct < 60 ? 'loss' : 'neutral',
    },
    {
      id: 'eapm',
      label: 'Velocidad efectiva (eAPM)',
      valueText: curEapmAvg != null ? `${String(curEapmAvg).replace('.', ',')} eAPM` : '—',
      subText: oldEapmAvg != null ? `Antes ${String(oldEapmAvg).replace('.', ',')} eAPM` : `${valid.length} replays medidos`,
      deltaText: eapmDelta != null && eapmDelta !== 0 ? `${eapmDelta > 0 ? '+' : ''}${String(eapmDelta).replace('.', ',')} eAPM` : null,
      improved: eapmDelta != null ? eapmDelta > 0 : true,
      tone: eapmDelta != null && eapmDelta > 0 ? 'win' : 'neutral',
    },
  ];

  // 3. #1 Foco prioritario recurrente en los últimos replays
  const domainCounts = new Map();
  const recentFocusPool = valid.slice(0, 12);
  for (const rec of recentFocusPool) {
    const negs = extractEngineSummary(rec)?.negatives;
    if (!Array.isArray(negs) || !negs.length) continue;
    const seenInMatch = new Set();
    for (const n of negs) {
      const dom = n?.domain;
      if (!dom || seenInMatch.has(dom)) continue;
      seenInMatch.add(dom);
      domainCounts.set(dom, (domainCounts.get(dom) || 0) + 1);
    }
  }
  let priorityFocus = null;
  if (domainCounts.size > 0) {
    const [topDomain, count] = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count >= 2) {
      const info = FOCUS_DOMAIN_INFO[topDomain] || {
        title: 'Mantener consistencia macro y control de ejército',
        detail: 'Revisá el cuello de botella recurrente detectado en tus últimos replays.',
      };
      priorityFocus = {
        domain: topDomain,
        count,
        sample: recentFocusPool.length,
        pct: pct(count, recentFocusPool.length),
        title: info.title,
        detail: info.detail,
      };
    }
  }

  return {
    ok: true,
    totalReplays: valid.length,
    recentWindow: recent.length,
    olderWindow: older.length,
    stageEvolution,
    habits,
    priorityFocus,
  };
}

/* ============================================================================
 * 3 & 4. BALANCE DE MOTORES Y FUGAS DE ELO + RADAR DE ANTÍDOTOS Y SESIÓN/TILT
 * ============================================================================ */

function matchNetEloImpact(m) {
  const won = m.won ? 1 : 0;
  const exp = expectedWinProb(m.myElo, m.oppElo);
  return 32 * (won - exp);
}

function computeEloAttributionAndSession({ matches = [] } = {}) {
  const valid = (Array.isArray(matches) ? matches : [])
    .filter((m) => m && typeof m.won === 'boolean')
    .sort((a, b) => (Number(a.startedAt) || 0) - (Number(b.startedAt) || 0));

  if (valid.length < 5) return null;

  // Conteo de partidas por civ para separar Mains (>= 5 pj) vs Experimentos (<= 3 pj)
  const civCounts = new Map();
  for (const m of valid) {
    if (!m.civ) continue;
    const slug = m.civSlug || civSlug(m.civ) || String(m.civ).toLowerCase();
    civCounts.set(slug, (civCounts.get(slug) || 0) + 1);
  }

  const factors = [];
  const addFactor = (id, title, subset, detailFn) => {
    if (subset.length < 3) return;
    const wins = subset.filter((m) => m.won).length;
    const losses = subset.length - wins;
    const wr = pct(wins, subset.length);
    const netElo = Math.round(subset.reduce((acc, m) => acc + matchNetEloImpact(m), 0));
    if (Math.abs(netElo) < 12) return;
    factors.push({
      id,
      title,
      games: subset.length,
      wins,
      losses,
      winRate: wr,
      netElo,
      detail: detailFn({ games: subset.length, wins, losses, winRate: wr, netElo }),
    });
  };

  // Factor A: Civilizaciones principales (Mains >= 5 pj) vs Experimentos (<= 3 pj)
  const mainMatches = valid.filter((m) => {
    const slug = m.civSlug || civSlug(m.civ) || String(m.civ || '').toLowerCase();
    return (civCounts.get(slug) || 0) >= 5;
  });
  const expMatches = valid.filter((m) => {
    const slug = m.civSlug || civSlug(m.civ) || String(m.civ || '').toLowerCase();
    const c = civCounts.get(slug) || 0;
    return c >= 1 && c <= 3;
  });
  addFactor(
    'pool-mains',
    'Tus civilizaciones principales (≥5 partidas)',
    mainMatches,
    ({ wins, losses }) => `Sólido rendimiento jugando tu repertorio principal (${wins}V-${losses}D).`,
  );
  addFactor(
    'pool-experiments',
    'Civilizaciones ocasionales (≤3 partidas)',
    expMatches,
    ({ wins, losses }) => `Rotar fuera de tus civilizaciones principales registró ${wins}V-${losses}D.`,
  );

  // Factor B: Fases de duración (Post-Imperial 48m+ y Juego temprano <22m)
  const postImpMatches = valid.filter((m) => Number(m.durationGameSec ?? m.replay?.durationSeconds) >= 48 * 60);
  const earlyMatches = valid.filter((m) => {
    const d = Number(m.durationGameSec ?? m.replay?.durationSeconds);
    return Number.isFinite(d) && d > 0 && d < 22 * 60;
  });
  addFactor(
    'phase-post-imp',
    'Partidas largas / Post-Imperial (48m+)',
    postImpMatches,
    ({ winRate }) => `Rendimiento del ${winRate}% cuando la partida supera los 48 minutos.`,
  );
  addFactor(
    'phase-early',
    'Definiciones tempranas (<22m)',
    earlyMatches,
    ({ winRate }) => `Efectividad del ${winRate}% en choques de Edad Feudal.`,
  );

  // Factor C: Mapas individuales
  const byMap = new Map();
  for (const m of valid) {
    if (!m.mapName) continue;
    const k = mapKey(m.mapKey || m.mapName);
    if (!k) continue;
    const list = byMap.get(k) || [];
    list.push(m);
    byMap.set(k, list);
  }
  for (const [k, list] of byMap.entries()) {
    const mName = list[0].mapName;
    addFactor(
      `map-${k}`,
      `Mapa: ${mName}`,
      list,
      ({ wins, losses, winRate }) => `Balance de ${wins}V-${losses}D (${winRate}% WR) en ${mName}.`,
    );
  }

  // Factor D: Aperturas rivales + Radar de Aperturas Rivales y Antídotos
  const byOppOpening = new Map();
  for (const m of valid) {
    const op = cleanOpeningName(m.oppOpening);
    if (!op) continue;
    const list = byOppOpening.get(op) || [];
    list.push(m);
    byOppOpening.set(op, list);
  }

  const vsOpenings = [];
  for (const [opName, list] of byOppOpening.entries()) {
    addFactor(
      `vs-op-${opName}`,
      `Contra ${opName}`,
      list,
      ({ wins, losses, winRate }) => `Registraste ${wins}V-${losses}D (${winRate}% WR) enfrentando ${opName}.`,
    );
    if (list.length >= 2) {
      const wins = list.filter((m) => m.won).length;
      const losses = list.length - wins;
      const netElo = Math.round(list.reduce((acc, m) => acc + matchNetEloImpact(m), 0));

      // Buscar el mejor antídoto propio registrado contra esta apertura rival (apertura propia o civ propia)
      const counterAcc = new Map();
      for (const m of list) {
        const myOp = cleanOpeningName(m.myOpening);
        const label = myOp || (m.civ ? `Jugar ${m.civ}` : null);
        if (!label) continue;
        const cur = counterAcc.get(label) || { label, games: 0, wins: 0, losses: 0 };
        cur.games += 1;
        if (m.won) cur.wins += 1;
        else cur.losses += 1;
        counterAcc.set(label, cur);
      }
      const bestCounter = [...counterAcc.values()]
        .filter((c) => c.games >= 2 && c.wins > c.losses)
        .map((c) => ({ ...c, winRate: pct(c.wins, c.games) }))
        .sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0] || null;

      vsOpenings.push({
        opening: opName,
        games: list.length,
        wins,
        losses,
        winRate: pct(wins, list.length),
        netElo,
        antidote: bestCounter,
      });
    }
  }
  vsOpenings.sort((a, b) => b.games - a.games || a.winRate - b.winRate);

  const gains = factors
    .filter((f) => f.netElo > 0)
    .sort((a, b) => b.netElo - a.netElo)
    .slice(0, 3);
  const leaks = factors
    .filter((f) => f.netElo < 0)
    .sort((a, b) => a.netElo - b.netElo)
    .slice(0, 3);

  // Némesis y Presas (Civilizaciones rivales enfrentadas >= 3 veces)
  const byOppCiv = new Map();
  for (const m of valid) {
    if (!m.oppCiv) continue;
    const slug = m.oppCivSlug || civSlug(m.oppCiv) || String(m.oppCiv).toLowerCase();
    const cur = byOppCiv.get(slug) || { civ: m.oppCiv, slug, games: 0, wins: 0, losses: 0, netElo: 0 };
    cur.games += 1;
    if (m.won) cur.wins += 1;
    else cur.losses += 1;
    cur.netElo += matchNetEloImpact(m);
    byOppCiv.set(slug, cur);
  }
  const oppCivList = [...byOppCiv.values()]
    .filter((c) => c.games >= 3)
    .map((c) => ({ ...c, netElo: Math.round(c.netElo), winRate: pct(c.wins, c.games) }));

  const nemesisCivs = [...oppCivList]
    .filter((c) => c.winRate <= 45)
    .sort((a, b) => a.winRate - b.winRate || b.games - a.games)
    .slice(0, 3);
  const preyCivs = [...oppCivList]
    .filter((c) => c.winRate >= 58)
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, 3);

  // 4. Inteligencia de Sesión y Fatiga / Tilt (agrupando partidas con < 90 min de separación)
  const withTime = valid.filter((m) => Number.isFinite(Number(m.startedAt)) && Number(m.startedAt) > 0);
  let session = null;
  if (withTime.length >= 5) {
    const sessions = [];
    let currentSession = [];
    for (const m of withTime) {
      const ts = Number(m.startedAt);
      const prev = currentSession[currentSession.length - 1];
      if (!prev || ts - Number(prev.startedAt) <= SESSION_GAP_MS) {
        currentSession.push(m);
      } else {
        sessions.push(currentSession);
        currentSession = [m];
      }
    }
    if (currentSession.length) sessions.push(currentSession);

    const b1 = []; // Partida #1 (frío)
    const b23 = []; // Partidas #2–3 (en calor)
    const b4p = []; // Partida #4+ (desgaste)
    const post2Loss = []; // Tras 2+ derrotas seguidas en la misma sesión

    for (const sess of sessions) {
      let lossStreak = 0;
      sess.forEach((m, idx) => {
        if (idx === 0) b1.push(m);
        else if (idx <= 2) b23.push(m);
        else b4p.push(m);

        if (lossStreak >= 2) post2Loss.push(m);
        if (m.won === false) lossStreak += 1;
        else if (m.won === true) lossStreak = 0;
      });
    }

    const summarizeBucket = (id, label, list) => {
      if (!list.length) return null;
      const wins = list.filter((m) => m.won).length;
      const losses = list.length - wins;
      return {
        id,
        label,
        games: list.length,
        wins,
        losses,
        winRate: pct(wins, list.length),
        netElo: Math.round(list.reduce((acc, m) => acc + matchNetEloImpact(m), 0)),
      };
    };

    const buckets = [
      summarizeBucket('cold', 'Partida #1 (frío)', b1),
      summarizeBucket('warm', 'Partidas #2–3 (en calor)', b23),
      summarizeBucket('fatigue', 'Partida #4+ (desgaste)', b4p),
    ].filter(Boolean);

    const tiltRaw = post2Loss.length >= 2
      ? summarizeBucket('tilt', 'Tras 2+ derrotas seguidas', post2Loss)
      : null;
    const tiltBucket = tiltRaw && (tiltRaw.winRate < 50 || tiltRaw.games >= 4)
      ? { ...tiltRaw, isTiltRisk: tiltRaw.winRate < 46 }
      : null;

    const warmWr = buckets.find((b) => b.id === 'warm')?.winRate;
    const fatBucket = buckets.find((b) => b.id === 'fatigue');
    let verdict = null;
    if (tiltBucket && tiltBucket.winRate <= 38) {
      verdict = `Tras 2 derrotas seguidas en una misma sesión tu winrate cae al ${tiltBucket.winRate}% (${tiltBucket.netElo} ELO). Cortar 15 minutos evita perder puntos por inercia.`;
    } else if (fatBucket && fatBucket.games >= 3 && warmWr != null && warmWr - fatBucket.winRate >= 15) {
      verdict = `Tu pico de rendimiento está en las partidas #2–3 (${warmWr}% WR) y cae al ${fatBucket.winRate}% a partir de la 4.ª partida seguida.`;
    } else if (warmWr != null) {
      verdict = `Rendimiento estable a lo largo de tus sesiones (${warmWr}% WR en partidas #2–3).`;
    }

    session = {
      totalSessions: sessions.length,
      buckets,
      postLossStreakTilt: tiltBucket,
      verdict,
    };
  }

  return {
    ok: true,
    totalMatches: valid.length,
    gains,
    leaks,
    vsOpenings,
    nemesisCivs,
    preyCivs,
    session,
  };
}

module.exports = {
  analyzeMapPerformance,
  buildModeMapDiagnostics,
  computePersonalAcademy,
  computeEloAttributionAndSession,
};
