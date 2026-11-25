'use strict';

/**
 * Motor Empírico Pro de Matchups y Respuestas Anti-Apertura para Prematch.
 *
 * Lee exclusivamente `pro-matchup-data.json` (generado desde partidas RM 1v1 reales
 * Top Pro / +2000 / +1900 ELO y repeticiones oficiales).
 *
 * Garantías matemáticas y de producto:
 *  - CERO datos inventados: cada cifra expone su tamaño de muestra `n` y victorias exactas.
 *  - Antisimetría exacta: `winRatePct(A, B) + winRatePct(B, A) === 100` y `edge(A, B) === -edge(B, A)`
 *    en todos los tramos horarios (`< 22 min`, `22–34 min`, `+34 min`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { CIV_GUIDE } = require('../civ-guide');

const DATA_PATH = path.join(__dirname, 'pro-matchup-data.json');

let cachedDataset = null;
let cachedMtimeMs = 0;

function loadProMatchupDataset() {
  try {
    const stat = fs.statSync(DATA_PATH);
    if (cachedDataset && stat.mtimeMs === cachedMtimeMs) return cachedDataset;
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    cachedDataset = JSON.parse(raw);
    cachedMtimeMs = stat.mtimeMs;
    return cachedDataset;
  } catch {
    return null;
  }
}

const CLOSED_MAP_HINTS = [
  'closed', 'arena', 'fortress', 'fortaleza', 'hideout', 'escondite',
  'black forest', 'bosque negro', 'enclosed', 'encerrado', 'hill fort',
  'glade', 'oasis', 'clearing', 'lombardia', 'amazon tunnel', 'michi',
  'walled', 'citadel', 'stronghold', 'secluded',
];

function resolveLandMapType(mapSlugOrName) {
  const m = String(mapSlugOrName || 'arabia').toLowerCase().trim();
  for (const hint of CLOSED_MAP_HINTS) {
    if (m === hint || m.includes(hint)) return 'closed';
  }
  return 'open';
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function roundSym(x) {
  if (!Number.isFinite(x) || x === 0) return 0;
  return x >= 0 ? Math.round(x) : -Math.round(-x);
}

function fmtClockSec(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Convierte `(winsOwn, games)` en porcentaje entero estrictamente antisimétrico:
 * `symPct(w, g) + symPct(g - w, g) === 100`.
 */
function symWinPct(winsOwn, games) {
  if (!games || games <= 0) return null;
  const diff = 2 * winsOwn - games; // entero exacto: diff(w, g) === -diff(g - w, g) sin deriva IEEE-754
  const delta = roundSym((diff * 50) / games);
  return clamp(50 + delta, 0, 100);
}

/**
 * Convierte `(winsOwn, games)` en ventaja suavizada (`-36..+36`) estrictamente antisimétrica:
 * `symEdge(w, g) === -symEdge(g - w, g)`.
 */
function symBucketEdge(winsOwn, games, prior = 4) {
  if (!games || games <= 0) return 0;
  const diff = 2 * winsOwn - games; // winsOwn - winsRival
  return clamp(roundSym((diff / (games + prior)) * 42), -36, 36);
}

function fmtRecordTag(item, suffix = '') {
  if (!item || !item[1]) return null;
  const [, games, wins] = item;
  const pct = Math.round((wins / games) * 100);
  return `${wins}V–${games - wins}D (${pct}%)${suffix ? ` · ${suffix}` : ''}`;
}

function buildSampleMeta(tier, nArr, mapType) {
  const [totalGames = 0, , nPro = 0, n2k = 0, n1900 = 0, nReplays = 0] = Array.isArray(nArr) ? nArr : [];
  const mapTag = mapType === 'closed' ? 'Mapas Cerrados' : 'Mapas Abiertos';
  if (!totalGames) {
    return {
      tier: 'none',
      totalGames: 0,
      nPro: 0,
      n2k: 0,
      n1900: 0,
      nReplays: 0,
      badgeTone: 'is-muted',
      badgeShort: 'Sin muestra directa',
      badgeFull: `Sin partidas registradas en el Top 1400 para este cruce en ${mapTag}`,
    };
  }
  const repSuffix = nReplays > 0 ? ` · ${nReplays} ${nReplays === 1 ? 'replay profundo' : 'replays profundos'}` : '';
  if (tier === 'pro') {
    return {
      tier: 'pro',
      totalGames,
      nPro,
      n2k,
      n1900,
      nReplays,
      badgeTone: 'is-pro',
      badgeShort: `${totalGames} pj Top Pro`,
      badgeFull: `Élite Top Pro · ${totalGames} partidas reales${repSuffix}`,
    };
  }
  if (tier === '2k') {
    const parts = [];
    if (nPro > 0) parts.push(`${nPro} Top Pro`);
    if (n2k > 0) parts.push(`${n2k} en +2000 ELO`);
    return {
      tier: '2k',
      totalGames,
      nPro,
      n2k,
      n1900,
      nReplays,
      badgeTone: 'is-2k',
      badgeShort: `${totalGames} pj (+2000 ELO)`,
      badgeFull: `Muestra Competitiva · ${parts.join(' + ')}${repSuffix}`,
    };
  }
  if (tier === '1900') {
    return {
      tier: '1900',
      totalGames,
      nPro,
      n2k,
      n1900,
      nReplays,
      badgeTone: 'is-1900',
      badgeShort: `${totalGames} pj (+1900 ELO)`,
      badgeFull: `Ladder Alto (+1900 ELO) · ${totalGames} partidas reales${repSuffix}`,
    };
  }
  return {
    tier: 'low',
    totalGames,
    nPro,
    n2k,
    n1900,
    nReplays,
    badgeTone: 'is-low',
    badgeShort: `Muestra baja (${totalGames} pj)`,
    badgeFull: `Muestra baja · solo ${totalGames} ${totalGames === 1 ? 'partida real hallada' : 'partidas reales halladas'}${repSuffix}`,
  };
}

/**
 * Construye el reporte completo para `Entrenamiento -> Matchups`.
 */
function buildProMatchupReport({
  myCivSlug = 'franks',
  rivalCivSlug = 'hindustanis',
  mapSlug = 'arabia',
  myCivMeta = {},
  rivalCivMeta = {},
  rivalHoles = [],
  clashLines = [],
  recentMatchups = [],
  tacticalAges = null,
} = {}) {
  const dataset = loadProMatchupDataset();
  const mapType = resolveLandMapType(mapSlug);
  const mapTypeLabel = mapType === 'closed' ? 'Mapas Cerrados (Arena)' : 'Mapas Abiertos (Arabia)';
  const isFirst = myCivSlug < rivalCivSlug;
  const pairKey = isFirst ? `${myCivSlug}__${rivalCivSlug}` : `${rivalCivSlug}__${myCivSlug}`;
  const rawPair = dataset?.pairs?.[mapType]?.[pairKey] || null;

  // También informar cuántas partidas existen en el OTRO tipo de mapa por si el usuario quiere alternar
  const otherMapType = mapType === 'open' ? 'closed' : 'open';
  const otherMapGames = dataset?.pairs?.[otherMapType]?.[pairKey]?.n?.[0] || 0;

  const myName = myCivMeta.name || CIV_GUIDE[myCivSlug]?.name || myCivSlug;
  const rivalName = rivalCivMeta.name || CIV_GUIDE[rivalCivSlug]?.name || rivalCivSlug;

  const nArr = rawPair?.n || [0, 0, 0, 0, 0, 0];
  const totalGames = nArr[0] || 0;
  const wins1 = nArr[1] || 0;
  const myWins = isFirst ? wins1 : (totalGames - wins1);
  const rivalWins = totalGames - myWins;
  const overallWinPct = symWinPct(myWins, totalGames);
  const overallEdge = symBucketEdge(myWins, totalGames, 5);

  const sample = buildSampleMeta(rawPair?.t || 'none', nArr, mapType);

  // Ventanas reales de reloj (F11 en velocidad 1.7x): Temprano (<26m), Castillos (26-38m), Largo (+38m)
  const clkRaw = rawPair?.clk || [[0, 0], [0, 0], [0, 0]];
  const windowDefs = [
    { idx: 0, id: 'short', label: 'I · TEMPRANO (< 26 MIN)', shortLabel: '< 26 min', cx: 235 },
    { idx: 1, id: 'mid', label: 'II · CASTILLOS (26–38 MIN)', shortLabel: '26–38 min', cx: 490 },
    { idx: 2, id: 'long', label: 'III · JUEGO LARGO (+38 MIN)', shortLabel: '+38 min', cx: 745 },
  ];

  const clockWindows = windowDefs.map((w) => {
    const [g = 0, w1 = 0] = clkRaw[w.idx] || [0, 0];
    const myW = isFirst ? w1 : (g - w1);
    const rivW = g - myW;
    const wrPct = symWinPct(myW, g);
    const edge = symBucketEdge(myW, g, 4);
    return {
      id: w.id,
      label: w.label,
      shortLabel: w.shortLabel,
      cx: w.cx,
      games: g,
      wins: myW,
      losses: rivW,
      winRatePct: wrPct,
      edge,
      displayPct: g > 0 ? `${wrPct}%` : 'Sin pj',
      displaySub: g > 0 ? `${myW}V–${rivW}D (${g} pj)` : '0 partidas',
    };
  });

  // Coordenadas SVG estrictamente antisimétricas alrededor de y = 85 (`cy(A,B) + cy(B,A) === 170`)
  const yOf = (edge) => 85 - clamp(roundSym(edge * 1.35), -46, 46);
  const yStart = 85;
  const yShort = clockWindows[0].games > 0 ? yOf(clockWindows[0].edge) : yOf(overallEdge);
  const yMid = clockWindows[1].games > 0 ? yOf(clockWindows[1].edge) : yOf(overallEdge);
  const yLong = clockWindows[2].games > 0 ? yOf(clockWindows[2].edge) : yOf(overallEdge);
  const curvePath = `M0,85 L235,${yShort} L490,${yMid} L745,${yLong} L880,${yLong}`;
  const areaFullPath = `${curvePath} L880,85 L0,85 Z`;

  const svgNodes = [
    { cx: 235, cy: yShort, window: clockWindows[0] },
    { cx: 490, cy: yMid, window: clockWindows[1] },
    { cx: 745, cy: yLong, window: clockWindows[2] },
  ];

  // Directiva de Reloj ("Quién tiene el reloj")
  const earlyEdge = clockWindows[0].games >= clockWindows[1].games ? clockWindows[0].edge : clockWindows[1].edge;
  const bestEarlyMid = (clockWindows[0].games + clockWindows[1].games) > 0
    ? roundSym((clockWindows[0].edge * clockWindows[0].games + clockWindows[1].edge * clockWindows[1].games) / Math.max(1, clockWindows[0].games + clockWindows[1].games))
    : 0;
  const lateEdge = clockWindows[2].edge;
  const hasLateSample = clockWindows[2].games >= 2;
  const hasEarlySample = (clockWindows[0].games + clockWindows[1].games) >= 2;

  let verdictTitle;
  let clockDirective;
  let peakWindowLabel;
  let dangerWindowLabel;

  if (!totalGames) {
    verdictTitle = `Sin partidas en ${mapTypeLabel} dentro de la muestra Pro/+1900`;
    clockDirective = otherMapGames > 0
      ? `Este cruce tiene ${otherMapGames} partidas reales en ${otherMapType === 'open' ? 'Mapas Abiertos' : 'Mapas Cerrados'}. Cambiá el selector de mapa arriba para verlas.`
      : 'Cruce muy poco frecuente en el ladder actual: abajo se muestran las brechas verificadas del árbol tecnológico.';
    peakWindowLabel = 'Sin muestra de reloj';
    dangerWindowLabel = `${otherMapGames > 0 ? `${otherMapGames} pj en otro mapa` : '0 partidas'}`;
  } else {
    const withGames = clockWindows.filter((w) => w.games > 0);
    const bestWin = [...withGames].sort((a, b) => (b.edge - a.edge) || (b.games - a.games))[0] || clockWindows[1];
    const worstWin = [...withGames].sort((a, b) => (a.edge - b.edge) || (b.games - a.games))[0] || clockWindows[2];

    peakWindowLabel = bestWin.edge > 0
      ? `Mejor tramo: ${bestWin.shortLabel} (${bestWin.winRatePct}%)`
      : `Mejor resistencia: ${bestWin.shortLabel} (${bestWin.winRatePct}%)`;
    dangerWindowLabel = worstWin.edge < 0
      ? `Peligro rival: ${worstWin.shortLabel} (${worstWin.winRatePct}%)`
      : `Más parejo: ${worstWin.shortLabel} (${worstWin.winRatePct}%)`;

    if (hasLateSample && hasEarlySample && (bestEarlyMid - lateEdge) >= 8) {
      verdictTitle = `Reloj en contra · presioná antes del min 38`;
      clockDirective = `Rendís mejor temprano, pero en +38 min ${rivalName} escala fuerte (${clockWindows[2].winRatePct}% en ${clockWindows[2].games} pj).`;
    } else if (hasLateSample && hasEarlySample && (lateEdge - bestEarlyMid) >= 8) {
      verdictTitle = `Reloj a favor · escalá hacia +38 min`;
      clockDirective = `${myName} domina el juego largo (${clockWindows[2].winRatePct}% en +38 min). Defendé limpio y buscá 3 TC.`;
    } else if (overallEdge >= 5) {
      verdictTitle = `Ventaja para ${myName} (${overallWinPct}% en ${totalGames} pj)`;
      clockDirective = `Registro competitivo favorable (${myWins}V–${rivalWins}D) con mejor pico en ${bestWin.shortLabel}.`;
    } else if (overallEdge <= -5) {
      verdictTitle = `Cruce exigente vs ${rivalName} (${overallWinPct}% en ${totalGames} pj)`;
      clockDirective = `${rivalName} lidera el global (${myWins}V–${rivalWins}D). Tu mejor tramo para igualar es ${bestWin.shortLabel}.`;
    } else {
      verdictTitle = `Duelo parejo en alto nivel (${overallWinPct}% en ${totalGames} pj)`;
      clockDirective = `Paridad medida (${myWins}V–${rivalWins}D): define el pase y la transición a Castillos.`;
    }
  }

  // Plan encadenado real en las 3 edades (Feudal -> Castillos [Postura TC + Unidad] -> Imperial)
  const mySide = rawPair ? (isFirst ? rawPair.s1 : rawPair.s2) : null;
  const rivSide = rawPair ? (isFirst ? rawPair.s2 : rawPair.s1) : null;
  const myCivTr = dataset?.civTransitions?.[mapType]?.[myCivSlug] || null;
  const rivCivTr = dataset?.civTransitions?.[mapType]?.[rivalCivSlug] || null;

  const gameplanByAge = buildEmpiricalGameplanByAge({
    mySide,
    rivSide,
    myCivTr,
    rivCivTr,
    myName,
    rivalName,
    totalGames,
    clockWindows,
    overallEdge,
    mapType,
    rivalHoles,
    tacticalAges,
  });

  const planSummary = {
    headline: clockDirective,
    steps: gameplanByAge.map((g) => ({
      step: g.stepNum,
      ageLabel: g.ageLabel,
      short: g.shortLabel || g.bestLine,
      tone: g.edge >= 4 ? 'is-em' : (g.edge <= -4 ? 'is-warn' : 'is-even'),
    })),
  };

  // Trampas reales comprobadas + brechas verificadas del rival
  const empiricalTraps = [];
  if (mySide?.trap) {
    const [trapLabel, tGames, tWins] = mySide.trap;
    const tWr = Math.round((tWins / tGames) * 100);
    empiricalTraps.push({
      kind: 'risk',
      kicker: 'EVITAR',
      unitLabel: trapLabel,
      title: `Evitá ${trapLabel}`,
      detail: `Cayó en ${tGames - tWins} de ${tGames} partidas (${tWr}% WR).`,
    });
  }
  if (rivSide?.trap) {
    const [rTrapLabel, rGames, rWins] = rivSide.trap;
    const rLossPct = Math.round(((rGames - rWins) / rGames) * 100);
    empiricalTraps.push({
      kind: 'exploit',
      kicker: 'CASTIGAR',
      unitLabel: rTrapLabel,
      title: `Si abre ${rTrapLabel}`,
      detail: `${rivalName} perdió el ${rLossPct}% (${rWins}V–${rGames - rWins}D) forzándolo.`,
    });
  }

  // Partidas Pro reales de referencia (perspectiva del usuario)
  const proExamples = (rawPair?.refs || []).map((ref) => {
    const [winnerSide, p1Name, p2Name, durMin, exactMap, matchId, r1Route, r2Route, maxElo] = ref;
    const myPlayer = isFirst ? p1Name : p2Name;
    const rivPlayer = isFirst ? p2Name : p1Name;
    const myRoute = isFirst ? r1Route : r2Route;
    const rivRoute = isFirst ? r2Route : r1Route;
    const myWon = (isFirst && winnerSide === 1) || (!isFirst && winnerSide === 2);
    return {
      matchId: String(matchId),
      myPlayer,
      rivPlayer,
      myWon,
      durMin,
      mapName: exactMap,
      myRoute: myRoute || 'Apertura estándar',
      rivRoute: rivRoute || null,
      maxElo: maxElo || null,
    };
  });

  return {
    myCiv: myCivMeta,
    rivalCiv: rivalCivMeta,
    mapSlug: mapType === 'closed' ? 'arena' : 'arabia',
    mapType,
    mapTypeLabel,
    otherMapGames,
    hasEmpiricalData: totalGames > 0,
    sample,
    overallWinPct,
    myWins,
    rivalWins,
    clockDirective,
    verdictTitle,
    peakWindowLabel,
    dangerWindowLabel,
    clockWindows,
    ageEdgeScores: {
      1: clockWindows[0].edge,
      2: clockWindows[1].edge,
      3: clockWindows[2].edge,
    },
    svg: {
      yStart,
      curvePath,
      areaFullPath,
      nodes: svgNodes,
    },
    bestChain: mySide?.chain ? { label: mySide.chain[0], games: mySide.chain[1], wins: mySide.chain[2] } : null,
    planSummary,
    gameplanByAge,
    clashLines,
    empiricalTraps,
    myTraps: [], // reemplazado por empiricalTraps reales
    rivalHoles,
    proExamples,
    recentMatchups,
  };
}

function formatTacticalUnitLine(ev) {
  if (!ev || !ev.bestPrimary) return null;
  const primary = ev.bestPrimary.unitEs;
  if (ev.complement && ev.complement.unitEs && ev.complement.unitEs !== primary) {
    return `${primary} + ${ev.complement.unitEs}`;
  }
  return primary;
}

function pickRivalCounterLine(ev) {
  if (!ev) return null;
  const sig = ev.bestPrimary?.sigAnsLine;
  const sigEff = Number(ev.bestPrimary?.sigAnsEff || 0);
  if (sig && sig.key !== 'siege' && sigEff >= 0.52 && sig.unitEs) return sig.unitEs;
  if (ev.rivTop1?.unitEs) return ev.rivTop1.unitEs;
  if (sig && sig.unitEs) return sig.unitEs;
  const worst = ev.bestPrimary?.worstAnsLine;
  if (worst?.unitEs) return worst.unitEs;
  return null;
}

function shortenPlanLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Plan estándar';
  return s
    .replace(/\bCaballería de exploración\b/gi, 'Scouts')
    .replace(/\bLanzadores de hachas de élite\b/gi, 'Lanzadores de hachas')
    .replace(/\bGuerrilleros de élite\b/gi, 'Guerrilleros')
    .replace(/\bArqueros con arco largo de élite\b/gi, 'Arcos largos')
    .replace(/\bJinetes a camello pesados\b/gi, 'Camellos pesados')
    .replace(/\bJinetes a camello imperiales\b/gi, 'Camellos imperiales')
    .replace(/\bJinetes a camello\b/gi, 'Camellos');
}

function buildWindowStatus(winObj, edge, rivalName) {
  if (!winObj || !winObj.games) {
    return {
      badgeTxt: 'Sin muestra directa',
      statusHint: 'Sin partidas medidas en este tramo de duración.',
    };
  }
  if (winObj.games < 3) {
    return {
      badgeTxt: '● Muestra chica',
      statusHint: `Solo ${winObj.wins}V–${winObj.losses}D medidos en ${winObj.shortLabel}; guiate por el plan táctico.`,
    };
  }
  if (edge >= 4) {
    return {
      badgeTxt: '✓ Tu ventaja',
      statusHint: `Ganás el ${winObj.winRatePct}% (${winObj.wins}V–${winObj.losses}D) si la partida se define en ${winObj.shortLabel}.`,
    };
  }
  if (edge <= -4) {
    return {
      badgeTxt: '⚠ Peligro rival',
      statusHint: `${rivalName} gana el ${100 - winObj.winRatePct}% (${winObj.wins}V–${winObj.losses}D) si fuerza peleas en ${winObj.shortLabel}.`,
    };
  }
  return {
    badgeTxt: '● Tramo parejo',
    statusHint: `Cruce parejo (${winObj.winRatePct}% · ${winObj.wins}V–${winObj.losses}D) en ${winObj.shortLabel}.`,
  };
}

function buildEmpiricalGameplanByAge({
  mySide,
  rivSide,
  myCivTr,
  rivCivTr,
  myName,
  rivalName,
  totalGames,
  clockWindows,
  overallEdge,
  mapType,
  rivalHoles,
  tacticalAges,
}) {
  const isClosed = mapType === 'closed';
  const t2 = tacticalAges?.[2] || null;
  const t3 = tacticalAges?.[3] || null;
  const t4 = tacticalAges?.[4] || null;

  const fEdge = clockWindows[0].games > 0 ? clockWindows[0].edge : overallEdge;
  const cEdge = clockWindows[1].games > 0 ? clockWindows[1].edge : overallEdge;
  const iEdge = clockWindows[2].games > 0 ? clockWindows[2].edge : overallEdge;

  const fStatus = buildWindowStatus(clockWindows[0], fEdge, rivalName);
  const cStatus = buildWindowStatus(clockWindows[1], cEdge, rivalName);
  const iStatus = buildWindowStatus(clockWindows[2], iEdge, rivalName);

  // 1. PASO 1 · EDAD FEUDAL (coherente con el tipo de mapa y conectada hacia Castillos)
  const hasStrongDirectOp = Boolean(mySide?.op && mySide.op[1] >= 4);
  const fMedStr = fmtClockSec((mySide?.fMed && mySide.op?.[1] >= 2) ? mySide.fMed : (myCivTr?.fMed || mySide?.fMed));

  let feudalHeadline;
  let feudalTag;
  let feudalRivalLine;
  if (isClosed) {
    feudalHeadline = 'Fast Castle limpio';
    feudalTag = fMedStr ? `Mapa cerrado · Pase ~${fMedStr}` : 'Mapa cerrado · Priorizá Castillos';
    feudalRivalLine = 'Fast Castle / Reliquias';
  } else {
    feudalHeadline = hasStrongDirectOp
      ? mySide.op[0]
      : (formatTacticalUnitLine(t2) || mySide?.op?.[0] || myCivTr?.op?.[0] || 'Apertura según exploración');
    feudalTag = hasStrongDirectOp
      ? `Datos del cruce · ${mySide.op[2]}V–${mySide.op[1] - mySide.op[2]}D${fMedStr ? ` · ~${fMedStr}` : ''}`
      : (fMedStr ? `Apertura recomendada · Pase ~${fMedStr}` : 'Apertura recomendada');
    feudalRivalLine = (rivSide?.op && rivSide.op[1] >= 4)
      ? rivSide.op[0]
      : (pickRivalCounterLine(t2) || rivSide?.op?.[0] || rivCivTr?.op?.[0] || 'Presión estándar en Feudal');
  }

  // 2. PASO 2 · EDAD DE LOS CASTILLOS (siempre contra-aware frente a la respuesta real del rival)
  const hasStrongDirectCas = Boolean(mySide?.cas && mySide.cas[1] >= 4);
  const cMedStr = fmtClockSec((mySide?.cMed && hasStrongDirectCas) ? mySide.cMed : (myCivTr?.cMed || mySide?.cMed));
  const castleHeadline = hasStrongDirectCas
    ? mySide.cas[0]
    : (formatTacticalUnitLine(t3) || mySide?.cas?.[0] || myCivTr?.cas?.[0] || 'Transición según exploración');
  const castleRivalLine = (rivSide?.cas && rivSide.cas[1] >= 4)
    ? rivSide.cas[0]
    : (pickRivalCounterLine(t3) || rivSide?.cas?.[0] || rivCivTr?.cas?.[0] || 'Ejército principal de Castillos');

  let castlePosture;
  if (cEdge <= -4 && iEdge > cEdge) {
    castlePosture = 'Defendé y escalá (Boom 3 TC)';
  } else if (cEdge >= 4) {
    castlePosture = 'Presioná tu ventaja (1–2 TC)';
  } else if (mySide?.post?.[1] >= 3) {
    castlePosture = mySide.post[0];
  } else if (isClosed) {
    castlePosture = 'Boom 3 TC + Reliquias';
  } else {
    castlePosture = 'Economía sólida (2–3 TC)';
  }

  const castleTag = hasStrongDirectCas
    ? `${castlePosture} · ${mySide.cas[2]}V–${mySide.cas[1] - mySide.cas[2]}D`
    : `${castlePosture}${cMedStr ? ` · ~${cMedStr}` : ''}`;

  // 3. PASO 3 · EDAD IMPERIAL (composición de cierre contra-aware + brecha del rival)
  const hasStrongDirectImp = Boolean(mySide?.imp && mySide.imp[1] >= 4);
  const impHeadline = hasStrongDirectImp
    ? mySide.imp[0]
    : (formatTacticalUnitLine(t4) || mySide?.imp?.[0] || myCivTr?.imp?.[0] || 'Cierre de partida');
  const impRivalLine = (rivSide?.imp && rivSide.imp[1] >= 4)
    ? rivSide.imp[0]
    : (pickRivalCounterLine(t4) || rivSide?.imp?.[0] || rivCivTr?.imp?.[0] || (rivalHoles[0] ? `Sin ${rivalHoles[0].es}` : null));
  const impRivalIsHole = !impRivalLine && Boolean(rivalHoles[0]);

  const impTag = hasStrongDirectImp
    ? `Cierre verificado · ${mySide.imp[2]}V–${mySide.imp[1] - mySide.imp[2]}D`
    : (clockWindows[2].games > 0
      ? `Composición de cierre · +38m: ${clockWindows[2].winRatePct}%`
      : 'Composición de cierre Imperial');

  // Textos humanos y conexiones explícitas Paso 1 -> Paso 2 -> Paso 3
  const feudalShort = shortenPlanLabel(feudalHeadline);
  const castleShort = shortenPlanLabel(castleHeadline);
  const impShort = shortenPlanLabel(impHeadline);

  let feudalAdvice;
  if (isClosed) {
    feudalAdvice = `En mapa cerrado no gastes recursos peleando en Feudal: subí limpio para llegar a ${castleShort} antes que ${rivalName}.`;
  } else if (t2?.complement && t2.complementReason) {
    feudalAdvice = `Arrancá con ${feudalShort} (${t2.complementReason}) para controlar el mapa y preparar la transición a ${castleShort}.`;
  } else {
    feudalAdvice = `Abrí con ${feudalShort} para marcar ritmo frente a ${rivalName} y llegar ordenado a ${castleShort} en Castillos.`;
  }

  let castleAdvice;
  if (t3?.complement && t3.complementReason) {
    castleAdvice = `${rivalName} suele responder con ${shortenPlanLabel(castleRivalLine)}; combiná ${castleShort} (${t3.complementReason}) para no regalar peleas.`;
  } else if (cEdge <= -4) {
    castleAdvice = `En 26–38 min ${rivalName} aprieta con ${shortenPlanLabel(castleRivalLine)}: jugá defensivo con ${castleShort} y prepará tu salto a ${impShort}.`;
  } else {
    castleAdvice = `Transicioná a ${castleShort} para presionar a ${rivalName} frente a ${shortenPlanLabel(castleRivalLine)} sin perder ritmo económico.`;
  }

  let impAdvice;
  const impRivalShort = shortenPlanLabel(impRivalLine);
  if (t4?.complement && t4.complementReason) {
    const holeNote = rivalHoles[0] ? ` Además, ${rivalName} no tiene ${rivalHoles[0].es}.` : '';
    const alreadyMentionsRival = impRivalShort && t4.complementReason.toLowerCase().includes(impRivalShort.toLowerCase());
    impAdvice = alreadyMentionsRival
      ? `Cerrá con ${impShort} (${t4.complementReason}).${holeNote}`
      : `Cerrá con ${impShort} (${t4.complementReason}) frente a ${impRivalShort}.${holeNote}`;
  } else if (rivalHoles[0]) {
    impAdvice = `Tu cierre ideal es ${impShort} frente a ${impRivalShort}. Explotá que ${rivalName} no tiene ${rivalHoles[0].es}.`;
  } else {
    impAdvice = `Consolidá ${impShort} con asedio y mejoras completas para imponerte a ${impRivalShort} en juego largo.`;
  }

  return [
    {
      stepNum: 1,
      age: 2,
      ageLabel: 'Edad Feudal',
      icon: 'assets/icons/ages/feudal.png',
      bestLine: feudalHeadline,
      shortLabel: feudalShort,
      transitionFrom: isClosed ? 'Inicio · Economía limpia' : 'Inicio · Apertura del cruce',
      compTag: feudalTag,
      posture: fMedStr ? `Pase ~${fMedStr}` : null,
      rivalLine: feudalRivalLine,
      rivalIsHole: false,
      edge: fEdge,
      badgeTxt: fStatus.badgeTxt,
      statusHint: fStatus.statusHint,
      advice: feudalAdvice,
    },
    {
      stepNum: 2,
      age: 3,
      ageLabel: 'Edad de los Castillos',
      icon: 'assets/icons/ages/castle.png',
      bestLine: castleHeadline,
      shortLabel: castleShort,
      transitionFrom: `Desde ${feudalShort} →`,
      compTag: castleTag,
      posture: castlePosture,
      rivalLine: castleRivalLine,
      rivalIsHole: false,
      edge: cEdge,
      badgeTxt: cStatus.badgeTxt,
      statusHint: cStatus.statusHint,
      advice: castleAdvice,
    },
    {
      stepNum: 3,
      age: 4,
      ageLabel: 'Edad Imperial',
      icon: 'assets/icons/ages/imperial.png',
      bestLine: impHeadline,
      shortLabel: impShort,
      transitionFrom: `Desde ${castleShort} →`,
      compTag: impTag,
      posture: clockWindows[2].games > 0 ? `${clockWindows[2].wins}V–${clockWindows[2].losses}D en +38m` : null,
      rivalLine: impRivalLine,
      rivalIsHole: impRivalIsHole,
      edge: iEdge,
      badgeTxt: iStatus.badgeTxt,
      statusHint: iStatus.statusHint,
      advice: impAdvice,
    },
  ];
}

const PREMATCH_OPENING_KEY_MAP = {
  'scout rush': 'scouts',
  'scouts': 'scouts',
  'scout opening': 'scouts',
  'archer rush': 'archers',
  'archers': 'archers',
  'archer opening': 'archers',
  'man at arms rush': 'maa',
  'm@a rush': 'maa',
  'm@a archers': 'maa_archers',
  'drush': 'drush',
  'drush fast castle': 'drush_fc',
  'drush fc': 'drush_fc',
  'fast castle': 'fc',
  'fc': 'fc',
  'fc boom': 'fc_boom',
};

/**
 * Consulta ultrarrápida (< 0.1 ms en memoria) para el Overlay Prematch en vivo:
 *  1) `counterOpening`: qué abren los Pros (con tu civ o global) para ganarle a la apertura habitual del rival.
 *  2) `civMatchupBrief`: resumen de 1 línea del cruce real `myCiv vs rivalCiv` cuando las civs ya están confirmadas.
 */
function lookupPrematchProIntel({ myCivSlug = null, rivalCivSlug = null, rivalHabitualOpening = null, mapName = 'Arabia' } = {}) {
  const dataset = loadProMatchupDataset();
  if (!dataset) return { counterOpening: null, civMatchupBrief: null };

  const mapType = resolveLandMapType(mapName);
  let counterOpening = null;

  if (rivalHabitualOpening) {
    const normOp = PREMATCH_OPENING_KEY_MAP[String(rivalHabitualOpening).toLowerCase().trim()] || null;
    if (normOp) {
      const civSpec = myCivSlug ? dataset.vsOpening?.[mapType]?.byCiv?.[myCivSlug]?.[normOp]?.[0] : null;
      const globSpec = dataset.vsOpening?.[mapType]?.global?.[normOp]?.[0] || null;
      const chosen = (civSpec && civSpec[1] >= 4 && (civSpec[2] / civSpec[1]) >= 0.50)
        ? { item: civSpec, isCivSpecific: true }
        : (globSpec && globSpec[1] >= 6 ? { item: globSpec, isCivSpecific: false } : null);
      if (chosen) {
        const [label, games, wins] = chosen.item;
        counterOpening = {
          responseLabel: label,
          games,
          wins,
          winRatePct: Math.round((wins / games) * 100),
          isCivSpecific: chosen.isCivSpecific,
        };
      }
    }
  }

  let civMatchupBrief = null;
  if (myCivSlug && rivalCivSlug && myCivSlug !== rivalCivSlug) {
    const isFirst = myCivSlug < rivalCivSlug;
    const pairKey = isFirst ? `${myCivSlug}__${rivalCivSlug}` : `${rivalCivSlug}__${myCivSlug}`;
    const rawPair = dataset.pairs?.[mapType]?.[pairKey];
    if (rawPair && rawPair.n?.[0] >= 3) {
      const totalGames = rawPair.n[0];
      const myWins = isFirst ? rawPair.n[1] : (totalGames - rawPair.n[1]);
      const wrPct = symWinPct(myWins, totalGames);
      const mySide = isFirst ? rawPair.s1 : rawPair.s2;
      const route = mySide?.chain?.[0]
        || [mySide?.op?.[0], mySide?.cas?.[0] ? `${mySide.cas[0]}${mySide?.post?.[0] ? ` (${mySide.post[0]})` : ''}` : null].filter(Boolean).join(' → ')
        || null;

      const clk = rawPair.clk || [[0, 0], [0, 0], [0, 0]];
      const earlyG = (clk[0]?.[0] || 0) + (clk[1]?.[0] || 0);
      const earlyW = isFirst ? ((clk[0]?.[1] || 0) + (clk[1]?.[1] || 0)) : (earlyG - ((clk[0]?.[1] || 0) + (clk[1]?.[1] || 0)));
      const lateG = clk[2]?.[0] || 0;
      const lateW = isFirst ? (clk[2]?.[1] || 0) : (lateG - (clk[2]?.[1] || 0));
      const earlyEdge = symBucketEdge(earlyW, earlyG, 4);
      const lateEdge = symBucketEdge(lateW, lateG, 4);

      let clockCue = `${wrPct}% en ${totalGames} pj`;
      if (earlyG >= 2 && lateG >= 2 && (earlyEdge - lateEdge) >= 8) {
        clockCue = `Presioná <34m (${wrPct}% · ${totalGames} pj)`;
      } else if (earlyG >= 2 && lateG >= 2 && (lateEdge - earlyEdge) >= 8) {
        clockCue = `Escalá +34m (${wrPct}% · ${totalGames} pj)`;
      }

      civMatchupBrief = {
        tier: rawPair.t,
        totalGames,
        winRatePct: wrPct,
        route,
        clockCue,
      };
    }
  }

  return { counterOpening, civMatchupBrief };
}

module.exports = {
  loadProMatchupDataset,
  resolveLandMapType,
  buildProMatchupReport,
  lookupPrematchProIntel,
  symWinPct,
  symBucketEdge,
};
