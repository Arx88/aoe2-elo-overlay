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
  const delta = roundSym(((winsOwn / games) - 0.5) * 100);
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
  });

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
    gameplanByAge,
    clashLines,
    empiricalTraps,
    myTraps: [], // reemplazado por empiricalTraps reales
    rivalHoles,
    proExamples,
    recentMatchups,
  };
}

function buildEmpiricalGameplanByAge({ mySide, rivSide, myCivTr, rivCivTr, myName, rivalName, totalGames, clockWindows, overallEdge, mapType, rivalHoles }) {
  if (!totalGames || !mySide) {
    return [
      {
        age: 2,
        ageLabel: 'Edad Feudal',
        icon: 'assets/icons/ages/feudal.png',
        bestLine: myCivTr?.op ? myCivTr.op[0] : 'Sin replays directos en este mapa',
        compTag: myCivTr?.op ? `Patrón Pro ${myName} (${myCivTr.n} replays)` : 'Sin muestra directa',
        edge: 0,
        badgeTxt: 'Sin muestra del par',
        advice: myCivTr?.op
          ? `No hay partidas recientes de este par exacto en ${mapType === 'closed' ? 'Cerrados' : 'Abiertos'}, pero en ${myCivTr.n} replays Pro de ${myName} la apertura ganadora es ${myCivTr.op[0]} (${myCivTr.op[2]}V–${myCivTr.op[1] - myCivTr.op[2]}D).`
          : 'No se registraron partidas directas de este par en el padrón competitivo reciente.',
      },
      {
        age: 3,
        ageLabel: 'Edad de los Castillos',
        icon: 'assets/icons/ages/castle.png',
        bestLine: myCivTr?.cas ? myCivTr.cas[0] : 'Transición según exploración',
        compTag: myCivTr?.post ? `${myCivTr.post[0]} · Patrón Pro ${myName}` : 'Árbol verificado',
        edge: 0,
        badgeTxt: 'Sin muestra del par',
        advice: myCivTr?.cas
          ? `Transición Pro habitual de ${myName} en este tipo de mapa: ${myCivTr.cas[0]}${myCivTr.post ? ` con ${myCivTr.post[0]}` : ''}${rivCivTr?.cas ? ` (frente al estándar de ${rivalName}: ${rivCivTr.cas[0]})` : ''}.`
          : 'Sin repeticiones directas analizadas para este cruce en este tipo de mapa.',
      },
      {
        age: 4,
        ageLabel: 'Edad Imperial',
        icon: 'assets/icons/ages/imperial.png',
        bestLine: myCivTr?.imp ? myCivTr.imp[0] : (rivalHoles[0] ? `Explotar falta de ${rivalHoles[0].es}` : 'Cierre por árbol tecnológico'),
        compTag: myCivTr?.imp ? `Patrón Pro ${myName}` : 'Referencia técnica',
        edge: 0,
        badgeTxt: 'Sin muestra del par',
        advice: rivalHoles[0]
          ? `${rivalName} carece de ${rivalHoles[0].es}: ${rivalHoles[0].desc}`
          : 'Apoyate en el comparador de choque Imperial de abajo para evaluar techos de mejora.',
      },
    ];
  }

  // 1. EDAD FEUDAL (exigir >= 2 partidas directas antes de pisar el patrón Pro consolidado de la civ con un 1V-0D aislado)
  const hasDirectOp = Boolean(mySide.op && (mySide.op[1] >= 2 || !myCivTr?.op));
  const op = hasDirectOp ? mySide.op : (myCivTr?.op || mySide.op || null);
  const opIsCivFallback = !hasDirectOp && Boolean(myCivTr?.op);
  const opAlt = hasDirectOp ? mySide.opAlt : (mySide.op && mySide.op[0] !== op?.[0] ? mySide.op : null);
  const sw = mySide.sw && mySide.sw[1] >= 2 ? mySide.sw : null;
  const rivOp = (rivSide?.op && rivSide.op[1] >= 2) ? rivSide.op : (rivCivTr?.op || rivSide?.op || null);
  const fMedStr = fmtClockSec((mySide.fMed && mySide.op?.[1] >= 2) ? mySide.fMed : (myCivTr?.fMed || mySide.fMed));
  const fEdge = clockWindows[0].games > 0 ? clockWindows[0].edge : overallEdge;

  let feudalHeadline = op ? op[0] : (mapType === 'closed' ? 'Pase limpio hacia Castillos' : 'Apertura según exploración');
  if (!opIsCivFallback && op && sw && !feudalHeadline.includes(sw[0].replace('+ ', '').replace('→ ', ''))) {
    feudalHeadline = `${op[0]} ${sw[0]}`;
  }
  const feudalTag = op
    ? (opIsCivFallback ? `Patrón Pro ${myName} (${op[2]}V–${op[1] - op[2]}D)` : fmtRecordTag(op, fMedStr ? `Feudal ~${fMedStr}` : ''))
    : (fMedStr ? `Pase mediano ~${fMedStr}` : 'Medido en partidas reales');

  const feudalParts = [];
  if (rivSide?.op && rivSide.op[1] >= 2) {
    feudalParts.push(`${rivalName} abrió ${rivSide.op[0]} (${rivSide.op[1]} pj en este cruce).`);
  } else if (rivOp) {
    feudalParts.push(`Estándar Pro de ${rivalName}: ${rivOp[0]}.`);
  }
  if (op && !opIsCivFallback) {
    const wr = Math.round((op[2] / op[1]) * 100);
    feudalParts.push(`Mejor respuesta de ${myName} en el cruce: ${op[0]} (${op[2]}V–${op[1] - op[2]}D, ${wr}%).`);
  } else if (op && opIsCivFallback) {
    const wr = Math.round((op[2] / op[1]) * 100);
    feudalParts.push(`Apertura Pro consolidada de ${myName}: ${op[0]} (${wr}% en ${op[1]} repeticiones).`);
  }
  if (opAlt) {
    const altWr = Math.round((opAlt[2] / opAlt[1]) * 100);
    feudalParts.push(`También jugado en el cruce: ${opAlt[0]} (${altWr}% en ${opAlt[1]} pj).`);
  }

  // 2. EDAD DE LOS CASTILLOS (exigir >= 2 repeticiones directas para evitar anomalías 1V-0D)
  const hasDirectCas = Boolean(mySide.cas && (mySide.cas[1] >= 2 || !myCivTr?.cas));
  const cas = hasDirectCas ? mySide.cas : (myCivTr?.cas || mySide.cas || null);
  const casIsCivFallback = !hasDirectCas && Boolean(myCivTr?.cas);
  const hasDirectPost = Boolean(mySide.post && (mySide.post[1] >= 2 || !myCivTr?.post));
  const post = hasDirectPost ? mySide.post : (myCivTr?.post || mySide.post || null);
  const postIsCivFallback = !hasDirectPost && Boolean(myCivTr?.post);
  const rivCas = (rivSide?.cas && rivSide.cas[1] >= 2) ? rivSide.cas : (rivCivTr?.cas || rivSide?.cas || null);
  const cMedStr = fmtClockSec((mySide.cMed && hasDirectCas) ? mySide.cMed : (myCivTr?.cMed || mySide.cMed));
  const cEdge = clockWindows[1].games > 0 ? clockWindows[1].edge : overallEdge;

  const castleHeadline = cas
    ? cas[0]
    : (post ? post[0] : 'Transición medida en partida');
  const castleTag = casIsCivFallback
    ? `Patrón Pro ${myName}${post ? ` · ${post[0]}` : ''}`
    : ([
        post ? post[0] : null,
        cas ? `${cas[2]}V–${cas[1] - cas[2]}D` : null,
        cMedStr ? `~${cMedStr}` : null,
      ].filter(Boolean).join(' · ') || 'Etapa media');

  const castleParts = [];
  if (post && !postIsCivFallback) {
    const pWr = Math.round((post[2] / post[1]) * 100);
    castleParts.push(`Postura ganadora en este cruce: ${post[0]} (${pWr}% en ${post[1]} repeticiones).`);
  } else if (post && postIsCivFallback) {
    castleParts.push(`Postura Pro habitual de ${myName}: ${post[0]}.`);
  }
  if (mySide.chain && mySide.chain[1] >= 2) {
    castleParts.push(`Ruta ganadora verificada: ${mySide.chain[0]}.`);
  } else if (cas && !casIsCivFallback) {
    castleParts.push(`Núcleo principal en este cruce: ${cas[0]} (${cas[2]}V–${cas[1] - cas[2]}D).`);
  } else if (cas && casIsCivFallback) {
    castleParts.push(`Transición Pro sólida de ${myName}: ${cas[0]} (${cas[2]}V–${cas[1] - cas[2]}D).`);
  }
  if (rivSide?.cas && rivSide.cas[1] >= 2) {
    castleParts.push(`Vigilá el giro de ${rivalName} hacia ${rivSide.cas[0]}.`);
  } else if (rivCas) {
    castleParts.push(`Transición típica de ${rivalName}: ${rivCas[0]}.`);
  }

  // 3. EDAD IMPERIAL (exigir >= 2 repeticiones directas o respaldo Pro de la civ)
  const hasDirectImp = Boolean(mySide.imp && (mySide.imp[1] >= 2 || !myCivTr?.imp));
  const imp = hasDirectImp ? mySide.imp : (clockWindows[2].games > 0 ? (myCivTr?.imp || mySide.imp) : null);
  const impIsCivFallback = !hasDirectImp && Boolean(imp && myCivTr?.imp && imp === myCivTr.imp);
  const rivImp = (rivSide?.imp && rivSide.imp[1] >= 2) ? rivSide.imp : (rivCivTr?.imp || rivSide?.imp || null);
  const iEdge = clockWindows[2].games > 0 ? clockWindows[2].edge : overallEdge;

  const impHeadline = imp
    ? imp[0]
    : (clockWindows[2].games === 0 ? 'Se define antes de Imperial' : 'Cierre de juego tardío');
  const impTag = imp
    ? (impIsCivFallback ? `Patrón Pro ${myName} · +38m: ${clockWindows[2].winRatePct}%` : fmtRecordTag(imp, clockWindows[2].games > 0 ? `+38m: ${clockWindows[2].winRatePct}%` : ''))
    : (clockWindows[2].games > 0 ? `${clockWindows[2].wins}V–${clockWindows[2].losses}D en +38 min` : '0 cierres largos');

  const impParts = [];
  if (imp && !impIsCivFallback) {
    const iWr = Math.round((imp[2] / imp[1]) * 100);
    impParts.push(`Cierre ganador en repeticiones del cruce: ${imp[0]} (${imp[2]}V–${imp[1] - imp[2]}D, ${iWr}%).`);
  } else if (clockWindows[2].games === 0) {
    impParts.push(`Las ${totalGames} partidas reales de este cruce terminaron antes del minuto 38 (ninguna llegó al juego largo).`);
  } else if (imp && impIsCivFallback) {
    impParts.push(`En +38 min registrás ${clockWindows[2].wins}V–${clockWindows[2].losses}D (${clockWindows[2].winRatePct}%). Cierre Pro estándar de ${myName}: ${imp[0]}.`);
  } else {
    impParts.push(`En partidas de +38 min el registro real es ${clockWindows[2].wins}V–${clockWindows[2].losses}D (${clockWindows[2].winRatePct}%).`);
  }
  if (rivSide?.imp && rivSide.imp[1] >= 2) {
    impParts.push(`Cierre observado en ${rivalName}: ${rivSide.imp[0]}.`);
  } else if (rivalHoles[0]) {
    impParts.push(`Brecha de ${rivalName} en late-game: sin ${rivalHoles[0].es}.`);
  }

  const feudalRivalLine = (rivSide?.op && rivSide.op[1] >= 2)
    ? rivSide.op[0]
    : (rivOp ? rivOp[0] : null);
  const castleRivalLine = (rivSide?.cas && rivSide.cas[1] >= 2)
    ? rivSide.cas[0]
    : (rivCas ? rivCas[0] : null);
  const impRivalLine = (rivSide?.imp && rivSide.imp[1] >= 2)
    ? rivSide.imp[0]
    : (rivImp ? rivImp[0] : (rivalHoles[0] ? `Sin ${rivalHoles[0].es}` : null));
  const impRivalIsHole = !(rivSide?.imp && rivSide.imp[1] >= 2) && !rivImp && Boolean(rivalHoles[0]);

  const feudalShort = opAlt
    ? `Alternativa medida: ${opAlt[0]} (${Math.round((opAlt[2] / opAlt[1]) * 100)}% en ${opAlt[1]} pj).`
    : (op ? `Mejor respuesta Pro de ${myName} en la apertura.` : 'Priorizá exploración limpia.');

  const castleShort = (mySide.chain && mySide.chain[1] >= 2)
    ? `Ruta ganadora: ${mySide.chain[0]}.`
    : (post ? `Postura óptima: ${post[0]}.` : 'Ajustá TCs según presión rival.');

  const impShort = clockWindows[2].games === 0
    ? `Las ${totalGames} partidas terminaron antes del min 38.`
    : (rivalHoles[0] ? `Explotá que ${rivalName} juega sin ${rivalHoles[0].es}.` : `Registro en +38m: ${clockWindows[2].wins}V–${clockWindows[2].losses}D.`);

  return [
    {
      age: 2,
      ageLabel: 'Edad Feudal',
      icon: 'assets/icons/ages/feudal.png',
      bestLine: feudalHeadline,
      compTag: feudalTag,
      posture: fMedStr ? `Pase ~${fMedStr}` : null,
      rivalLine: feudalRivalLine,
      rivalIsHole: false,
      edge: fEdge,
      badgeTxt: clockWindows[0].games > 0 ? `${clockWindows[0].winRatePct}% · <26m` : null,
      advice: feudalShort,
    },
    {
      age: 3,
      ageLabel: 'Edad de los Castillos',
      icon: 'assets/icons/ages/castle.png',
      bestLine: castleHeadline,
      compTag: castleTag,
      posture: post ? post[0] : (cMedStr ? `Pase ~${cMedStr}` : null),
      rivalLine: castleRivalLine,
      rivalIsHole: false,
      edge: cEdge,
      badgeTxt: clockWindows[1].games > 0 ? `${clockWindows[1].winRatePct}% · 26–38m` : null,
      advice: castleShort,
    },
    {
      age: 4,
      ageLabel: 'Edad Imperial',
      icon: 'assets/icons/ages/imperial.png',
      bestLine: impHeadline,
      compTag: impTag,
      posture: clockWindows[2].games > 0 ? `${clockWindows[2].wins}V–${clockWindows[2].losses}D en +38m` : null,
      rivalLine: impRivalLine,
      rivalIsHole: impRivalIsHole,
      edge: iEdge,
      badgeTxt: clockWindows[2].games > 0 ? `${clockWindows[2].winRatePct}% · +38m` : null,
      advice: impShort,
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
