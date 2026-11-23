'use strict';

/**
 * MOTOR PREDICTIVO Y PERFIL TÁCTICO DE PREMATCH
 * =============================================
 *
 * Modela al rival antes de que se revelen las civilizaciones usando datos
 * reales de AoE2 Companion, World's Edge y AoE2Insights:
 *
 *  1. Entropía normalizada de Shannon (H_norm) y concentración Top-1 / Top-3
 *     para separar al instante:
 *       - Especialista (Civ Picker) → alta predictibilidad de civ
 *       - Pool acotado              → 2–3 civs de confort en este mapa
 *       - Jugador Random            → no counter-pickear civ; leer su patrón
 *  2. Fórmula `reciente_y_mapa` validada sobre 332.408 decisiones reales
 *     (decaimiento exponencial 30d + boost ×2 en el mismo mapa + historial del
 *     mapa) para estimar Top-3 civs probables con confianza explícita.
 *  3. Perfil táctico competitivo:
 *       - Velocidad mecánica (eAPM del rival vs eAPM real de sus oponentes)
 *       - Forma actual (racha, brecha respecto a pico, percentil de ladder,
 *         sesión reciente)
 *       - Debilidades ajustadas por diferencia real de ELO (evita falsos
 *         positivos por perder contra jugadores de mayor ELO)
 *       - Alerta táctica de amenaza clave / unidad única de la civ esperada.
 */

const { civSlug } = require('./civs');

const VERSION = 'prematch-predict-v1';
const TOTAL_RANKED_CIVS = 56;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_HALF_LIFE_DAYS = 30;
const RECENT_WINDOW = 30;
const SESSION_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Amenazas concretas de civs competitivas (lo que define la partida). */
const CIV_THREATS = Object.freeze({
  mongols: { threat: 'Caza +40%: esperá Feudal 17–18 pop y Mangudai en Castillos', unit: 'Mangudai' },
  franks: { threat: 'Bayas +15% y Caballeros +20% PR: prepará lanceros y muros en Feudal', unit: 'Caballeros / Lanzadores' },
  britons: { threat: 'Arqueros con +1/+2 alcance: no regales masa sin guerrilleros ni asedio', unit: 'Arquero de arco largo' },
  mayans: { threat: 'Recursos +15% y arqueros baratos: cuidá el pico de ballesteros y águilas', unit: 'Arquero emplumado' },
  turks: { threat: 'Oro +25%: peligro de Jenízaros en Castillos o Fast Imp de pólvora', unit: 'Jenízaro / Cañón' },
  spanish: { threat: 'Conquistadores móviles en Castillos: prepará Monjes o Guerrilleros con defensa', unit: 'Conquistador' },
  bohemians: { threat: 'Carretas husitas + pólvora en Castillos y Monjes fuertes en cerrados', unit: 'Carreta husita' },
  goths: { threat: 'Huscarles anti-arquero: evitá depender solo de ballesteros en Castillos', unit: 'Huscarle' },
  gurjaras: { threat: 'Jinetes Shrivamsha esquivan flechas y camellos dominan caballería', unit: 'Shrivamsha / Chakram' },
  hindustanis: { threat: 'Aldeanos más baratos + Ghulam anti-arquero y camellos rápidos', unit: 'Ghulam / Camello' },
  burmese: { threat: 'Arambai de altísimo daño y Monjes baratos: evitá peleas abiertas sin defensa', unit: 'Arambai' },
  portuguese: { threat: 'Unidades -20% oro y Cañón de salvas letal en choke points / Arena', unit: 'Cañón de salvas' },
  georgians: { threat: 'Monaspas en masa escalan ataque y regeneran: cortá su producción temprano', unit: 'Monaspa' },
  bengalis: { threat: '+2 aldeanos gratis al subir de edad y Rathas versátiles en Castillos', unit: 'Ratha' },
  koreans: { threat: 'Carromatos de guerra muy tanques y presión con torres: usá monjes o guerrilleros', unit: 'Carromato de guerra' },
  cumans: { threat: 'Puede meter 2º TC en Feudal o arietes tempranos: explorá su base al minuto 10', unit: 'Kipchak / 2º TC Feudal' },
  ethiopians: { threat: '+100 comida/oro al subir y arqueros +18% velocidad de disparo', unit: 'Arqueros rápidos / Shotel' },
  magyars: { threat: 'Scouts -15% y Forja gratis: su presión inicial de caballería pega muy fuerte', unit: 'Scouts / Huszár' },
  huns: { threat: 'Sin casas y arqueros a caballo baratos: prepará defensa contra raids constantes', unit: 'Arqueros a caballo' },
  chinese: { threat: '+3 aldeanos iniciales: si no lo presionás, su eco despega desde Feudal', unit: 'Chu Ko Nu' },
  poles: { threat: 'Folwark dispara su comida en Castillos y caballeros baratos con privilegio', unit: 'Obuch / Caballeros' },
  lithuanians: { threat: '+100 comida inicial (Feudal rápido) y ataque extra por reliquias', unit: 'Leitis / Reliquias' },
  berbers: { threat: 'Establos -15% en Castillos y Arqueros en camello anti-CA', unit: 'Arquero en camello' },
  aztecs: { threat: 'Eco fuerte y águilas/monjes en Castillos: vigilá push temprano de reliquias', unit: 'Águilas / Monjes' },
  incas: { threat: 'Guerrilleros y águilas duros + Kamayuk anti-caballería en Castillos', unit: 'Kamayuk / Águilas' },
  japanese: { threat: 'Infantería +33% velocidad de ataque: cuidado con M@A muy agresivo en Feudal', unit: 'M@A / Samurái' },
  vikings: { threat: 'Carretilla y Carro de mano gratis: su eco de Feudal/Castillos es brutal', unit: 'Eco + Berserker' },
  tatars: { threat: '+25% daño desde colina y Arqueros a caballo con Dactilera gratis', unit: 'Arqueros a caballo / Keshik' },
  celts: { threat: 'Madera +15% y asedio rápido: vigilá push de Hoang/manganas en Castillos', unit: 'Asedio rápido' },
  teutons: { threat: 'Granjas -40% madera y armadura cuerpo a cuerpo extra: lento pero muy sólido', unit: 'Caballeros / Asedio' },
  saracens: { threat: 'Mercado con 5% de comisión: puede forzar Castillos rápido y Mamelucos', unit: 'Mercado / Mameluco' },
  persians: { threat: 'TC trabaja más rápido desde Feudal y Savar letal contra arqueros en Imperial', unit: 'Boom TC / Savar' },
  khmer: { threat: 'Sube sin edificios prerequisito y granjeros sin molino: timing de FC muy rápido', unit: 'FC rápido / Escorpiones' },
  vietnamese: { threat: 'Ve tu TC desde 0:00 y Arqueros de ratán muy resistentes a flechas', unit: 'Arquero de ratán' },
  malay: { threat: 'Sube de edad 66% más rápido: llega con ventaja de población y timing', unit: 'Subida rápida / Karambit' },
  malians: { threat: 'Edificios -15% madera e infantería con armadura anti-flecha extra', unit: 'Gbeto / Caballería Farimba' },
  burgundians: { threat: 'Mejoras eco una edad antes y Caballero en Castillos: boom muy peligroso', unit: 'Costiller / Boom eco' },
  bulgarians: { threat: 'M@A gratis en Feudal y Krepost para controlar mapa en Castillos', unit: 'M@A gratis / Konnik' },
  italians: { threat: 'Avance de edad -15% coste y Ballestero genovés anti-caballería', unit: 'Ballestero genovés' },
  byzantines: { threat: 'Counters (lanceros, guerrilleros, camellos) -25% coste y Catafractas', unit: 'Counters baratos' },
  romans: { threat: 'Aldeanos +5% más eficientes y escorpiones/infantería con doble armadura', unit: 'Escorpiones / Centurión' },
  armenians: { threat: 'Piqueros/Espada larga una edad antes y Arquero compuesto ignora armadura', unit: 'Arquero compuesto' },
  khitans: { threat: 'Pasturas y mejoras de ataque cuerpo a cuerpo potenciadas en presión temprana', unit: 'Liao Dao / Caballería' },
  jurchens: { threat: 'Carne sin descomposición y caballería/granaderos con explosión de área', unit: 'Pagoda / Granadero' },
  shu: { threat: 'Leñadores generan comida y arqueros con mejoras baratas en transición', unit: 'Guardia pluma blanca' },
  wei: { threat: 'Aldeanos gratis por mejoras eco y caballería Hei Guang muy móvil', unit: 'Caballería tigresa' },
  wu: { threat: 'Infantería con regeneración y edificios militares generan comida al construir', unit: 'Espadachín de Jian' },
});

function mapKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 100);
}

/**
 * Clasifica la concentración del pool de civilizaciones del rival usando
 * entropía normalizada de Shannon (H_norm ∈ [0, 1]) + cuotas Top-1 / Top-3.
 */
function classifyCivPool(rows, mapName) {
  const valid = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.civ && civSlug(row.civ));
  const wanted = mapKey(mapName);
  const mapRows = wanted ? valid.filter((row) => mapKey(row.mapName ?? row.map) === wanted) : [];
  const useMap = mapRows.length >= 5;
  const target = useMap ? mapRows : valid;
  const sampleGames = target.length;

  if (!sampleGames) {
    return {
      poolType: 'insufficient',
      label: 'Sin muestra',
      scope: useMap ? 'map' : 'mode',
      sampleGames: 0,
      mapSampleGames: mapRows.length,
      distinctCivs: 0,
      entropy: null,
      top1Share: null,
      top3Share: null,
    };
  }

  const counts = new Map();
  for (const row of target) {
    const slug = civSlug(row.civ);
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const sortedCounts = [...counts.values()].sort((a, b) => b - a);
  const distinctCivs = sortedCounts.length;
  const top1Share = sortedCounts[0] / sampleGames;
  const top3Share = sortedCounts.slice(0, 3).reduce((s, c) => s + c, 0) / sampleGames;

  let entropy = 0;
  if (distinctCivs > 1) {
    for (const c of sortedCounts) {
      const p = c / sampleGames;
      entropy -= p * Math.log(p);
    }
    const maxEntropy = Math.log(Math.min(sampleGames, TOTAL_RANKED_CIVS));
    entropy = maxEntropy > 0 ? Math.min(1, Math.max(0, entropy / maxEntropy)) : 0;
  }
  const normEntropy = Math.round(entropy * 1000) / 1000;

  let poolType = 'insufficient';
  let label = 'Muestra chica';
  if (sampleGames >= 5) {
    if (top1Share >= 0.45 || (top3Share >= 0.72 && normEntropy <= 0.55)) {
      poolType = 'specialist';
      label = top1Share >= 0.6 ? 'Especialista' : 'Civ picker';
    } else if (sampleGames >= 6 && normEntropy > 0.75 && top1Share < 0.25) {
      poolType = 'random';
      label = 'Jugador Random';
    } else if (top3Share >= 0.52 || normEntropy <= 0.75) {
      poolType = 'focused';
      label = 'Pool acotado';
    } else {
      poolType = 'random';
      label = 'Jugador variado';
    }
  }

  return {
    poolType,
    label,
    scope: useMap ? 'map' : 'mode',
    sampleGames,
    mapSampleGames: mapRows.length,
    distinctCivs,
    entropy: normEntropy,
    top1Share: Math.round(top1Share * 100),
    top3Share: Math.round(top3Share * 100),
  };
}

/**
 * Predicción de civilizaciones en el mapa actual usando el modelo `reciente_y_mapa`
 * validado sobre el corpus de Companion (decaimiento 30d + boost ×2 mismo mapa
 * + historial del mapa + suavizado por tamaño de muestra).
 */
function predictRivalCivs(rows, mapName, options = {}) {
  const now = toMs(options.now) || Date.now();
  const wanted = mapKey(mapName);
  const valid = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.civ && civSlug(row.civ))
    .map((row) => ({
      civ: String(row.civ),
      slug: civSlug(row.civ),
      mapName: row.mapName ?? row.map ?? null,
      mapKey: mapKey(row.mapName ?? row.map),
      won: typeof row.won === 'boolean' ? row.won : null,
      startedAt: toMs(row.startedAt),
    }))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

  const pool = classifyCivPool(valid, mapName);
  if (!valid.length) {
    return {
      version: VERSION,
      status: 'empty',
      confidence: 'insuficiente',
      pool,
      top3: [],
      lastCiv: null,
      threat: null,
      sampleGames: 0,
      mapSampleGames: 0,
    };
  }

  const mapRows = wanted ? valid.filter((row) => row.mapKey === wanted) : [];
  const recent = valid.slice(0, RECENT_WINDOW);

  // Acumuladores por civ: peso reciente + historial del mapa + estadísticas observadas
  const byCiv = new Map();
  const ensure = (slug, name) => {
    let entry = byCiv.get(slug);
    if (!entry) {
      entry = {
        civ: name,
        slug,
        recentWeight: 0,
        recentGames: 0,
        mapGames: 0,
        mapWins: 0,
        mapResults: 0,
        totalGames: 0,
        totalWins: 0,
        totalResults: 0,
      };
      byCiv.set(slug, entry);
    }
    return entry;
  };

  for (const row of valid) {
    const entry = ensure(row.slug, row.civ);
    entry.totalGames += 1;
    if (row.won !== null) {
      entry.totalResults += 1;
      if (row.won) entry.totalWins += 1;
    }
    if (wanted && row.mapKey === wanted) {
      entry.mapGames += 1;
      if (row.won !== null) {
        entry.mapResults += 1;
        if (row.won) entry.mapWins += 1;
      }
    }
  }

  const latestTs = valid[0].startedAt || now;
  const anchorTs = Math.min(now, Math.max(latestTs, now - 7 * DAY_MS)) === latestTs ? latestTs : latestTs;

  recent.forEach((row, index) => {
    const entry = ensure(row.slug, row.civ);
    entry.recentGames += 1;
    // Anclado a la partida más reciente del jugador para que un descanso de
    // semanas (o una partida histórica) no anule el peso de sus picks recientes.
    const days = row.startedAt && anchorTs ? Math.max(0, (anchorTs - row.startedAt) / DAY_MS) : index * 1.5;
    const decay = 2 ** (-days / RECENCY_HALF_LIFE_DAYS);
    const mapBoost = wanted && row.mapKey === wanted ? 2.2 : 1;
    entry.recentWeight += decay * mapBoost;
  });

  // Suavizado tipo Dirichlet calibrado por entropía del pool:
  // especialistas conservan alta concentración; jugadores Random se suavizan.
  const mapBonusWeight = 0.25;
  const rawTotal = [...byCiv.values()].reduce(
    (sum, item) => sum + item.recentWeight + item.mapGames * mapBonusWeight,
    0,
  );
  const smoothK = pool.poolType === 'random' ? 12 : pool.poolType === 'specialist' ? 2.5 : 5;
  const denom = rawTotal + smoothK;
  const uniformPrior = 1 / Math.max(byCiv.size, 10);

  const ranked = [...byCiv.values()]
    .map((item) => {
      const score = item.recentWeight + item.mapGames * mapBonusWeight + smoothK * uniformPrior;
      const probability = denom > 0 ? Math.min(95, Math.max(1, Math.round((score / denom) * 100))) : 0;
      const winRate = item.mapResults >= 3
        ? pct(item.mapWins, item.mapResults)
        : item.totalResults >= 3
          ? pct(item.totalWins, item.totalResults)
          : null;
      return {
        civ: item.civ,
        slug: item.slug,
        probability,
        mapGames: item.mapGames,
        mapSample: mapRows.length,
        recentGames: item.recentGames,
        totalGames: item.totalGames,
        winRate,
        threat: CIV_THREATS[item.slug] || null,
      };
    })
    .sort((a, b) => b.probability - a.probability || b.mapGames - a.mapGames || b.recentGames - a.recentGames);

  const last = valid[0];
  const lastCiv = last
    ? { civ: last.civ, slug: last.slug, sameMap: Boolean(wanted && last.mapKey === wanted), startedAt: last.startedAt }
    : null;

  let confidence = 'insuficiente';
  if (pool.poolType === 'random') {
    confidence = 'random';
  } else if (pool.poolType === 'specialist' && pool.sampleGames >= 8) {
    confidence = 'alta';
  } else if ((pool.poolType === 'specialist' || pool.poolType === 'focused') && pool.sampleGames >= 5) {
    confidence = 'media';
  } else if (valid.length >= 3) {
    confidence = 'baja';
  }

  const top3 = ranked.slice(0, 3);
  const topThreat = pool.poolType !== 'random' && top3[0] && top3[0].probability >= 22
    ? top3[0].threat
    : null;

  return {
    version: VERSION,
    status: 'ready',
    confidence,
    pool,
    top3,
    lastCiv,
    threat: topThreat,
    sampleGames: valid.length,
    mapSampleGames: mapRows.length,
  };
}

/**
 * Velocidad mecánica real del rival (eAPM) comparada contra los oponentes
 * reales de su propio nivel (mean_eapm vs mean_eapm_opponent del mismo feed).
 */
function computeEapmProfile(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const own = [];
  const opp = [];
  for (const row of list) {
    const mine = Number(row && row.meanEapm);
    if (Number.isFinite(mine) && mine > 0 && mine < 400) own.push(mine);
    const theirs = Number(row && row.oppMeanEapm);
    if (Number.isFinite(theirs) && theirs > 0 && theirs < 400) opp.push(theirs);
  }
  if (own.length < 3) return null;
  const value = Math.round(median(own));
  const peerMedian = opp.length >= 3 ? Math.round(median(opp)) : null;
  const deltaPct = peerMedian && peerMedian > 0
    ? Math.round(((value - peerMedian) / peerMedian) * 100)
    : null;

  let pace = 'steady';
  let label = 'Ritmo estándar';
  if (deltaPct != null && deltaPct >= 14) {
    pace = 'fast';
    label = 'Mecánica rápida';
  } else if (deltaPct != null && deltaPct <= -14) {
    pace = 'deliberate';
    label = 'Ritmo pausado';
  }
  return { value, peerMedian, deltaPct, pace, label, sample: own.length };
}

/**
 * Debilidades ajustadas por ELO: compara derrotas observadas contra las
 * derrotas esperadas por fórmula Elo, evitando falsos positivos cuando el
 * rival perdió contra jugadores de ELO superior.
 */
function computeEloAdjustedWeaknesses(rows, { minGames = 4, minLossRate = 55, minExcessPct = 8 } = {}) {
  const byOpening = new Map();
  const byCiv = new Map();

  const record = (map, key, label, lost, expectedLoss) => {
    const entry = map.get(key) || { key, label, games: 0, losses: 0, expectedLosses: 0, eloSamples: 0 };
    entry.games += 1;
    if (lost) entry.losses += 1;
    if (expectedLoss != null) {
      entry.expectedLosses += expectedLoss;
      entry.eloSamples += 1;
    }
    map.set(key, entry);
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.won !== 'boolean') continue;
    const lost = !row.won;
    const elo = Number(row.elo);
    const oppElo = Number(row.oppElo);
    const expectedLoss = Number.isFinite(elo) && elo > 0 && Number.isFinite(oppElo) && oppElo > 0
      ? 1 / (1 + 10 ** ((elo - oppElo) / 400))
      : null;

    const opponents = Array.isArray(row.opponents) && row.opponents.length ? row.opponents : [row];
    const seenOpenings = new Set();
    const seenCivs = new Set();
    for (const op of opponents) {
      if (op.oppStrategy && !seenOpenings.has(op.oppStrategy)) {
        seenOpenings.add(op.oppStrategy);
        record(byOpening, op.oppStrategy, op.oppStrategy, lost, expectedLoss);
      }
      if (op.oppCiv && !seenCivs.has(op.oppCiv)) {
        seenCivs.add(op.oppCiv);
        record(byCiv, op.oppCiv, op.oppCiv, lost, expectedLoss);
      }
    }
  }

  const PRIOR_STRENGTH = 3;
  const finalize = (map) => [...map.values()]
    .filter((entry) => entry.games >= minGames)
    .map((entry) => {
      const lossRate = pct(entry.losses, entry.games);
      const hasElo = entry.eloSamples >= Math.ceil(entry.games * 0.6);
      const expectedMean = hasElo ? entry.expectedLosses / entry.eloSamples : null;
      const expectedLossRate = expectedMean != null ? Math.round(expectedMean * 100) : null;
      // Suavizado bayesiano hacia la derrota esperada por ELO: evita que un
      // 5/5 contra rivales +350 ELO pase por debilidad estructural.
      const shrunkLoss = expectedMean != null
        ? (entry.losses + PRIOR_STRENGTH * expectedMean) / (entry.games + PRIOR_STRENGTH)
        : null;
      const excessLossPct = shrunkLoss != null ? Math.round((shrunkLoss - expectedMean) * 100) : null;
      return {
        name: entry.label,
        games: entry.games,
        losses: entry.losses,
        lossRate,
        expectedLossRate,
        excessLossPct,
        eloVerified: expectedLossRate != null,
      };
    })
    .filter((entry) => entry.lossRate >= minLossRate && (entry.excessLossPct == null || entry.excessLossPct >= minExcessPct))
    .sort((a, b) => (b.excessLossPct ?? b.lossRate) - (a.excessLossPct ?? a.lossRate) || b.games - a.games)
    .slice(0, 3);

  return {
    openings: finalize(byOpening),
    civs: finalize(byCiv),
  };
}

/**
 * Forma actual, racha, percentil oficial de ladder y actividad de sesión.
 */
function computeFormProfile(player, historyRows = [], now = Date.now()) {
  const p = player || {};
  const streakNum = Number(p.streak);
  const streak = Number.isFinite(streakNum) && streakNum !== 0
    ? {
        value: streakNum,
        kind: streakNum >= 3 ? 'hot' : streakNum <= -3 ? 'cold' : 'neutral',
        label: streakNum > 0 ? `+${streakNum} racha` : `${streakNum} racha`,
      }
    : null;

  const peakDelta = Number.isFinite(Number(p.peakDelta))
    ? Number(p.peakDelta)
    : Number.isFinite(Number(p.peak)) && Number.isFinite(Number(p.rating))
      ? Math.round(Number(p.peak) - Number(p.rating))
      : null;
  const peakGap = peakDelta != null && peakDelta >= 120
    ? { delta: peakDelta, peak: Number(p.peak), label: `−${peakDelta} del pico` }
    : null;

  const topPct = Number.isFinite(Number(p.ladderPercentile))
    ? Number(p.ladderPercentile)
    : Number(p.rank) > 0 && Number(p.rankTotal) > 0
      ? Math.max(0.1, Math.min(100, Math.round((Number(p.rank) / Number(p.rankTotal)) * 1000) / 10))
      : null;
  const percentile = topPct != null
    ? {
        topPct,
        betterThanPct: Math.min(99.9, Math.round((100 - topPct) * 10) / 10),
        label: topPct < 1 ? 'Top 1%' : `Top ${topPct < 10 ? topPct.toFixed(1).replace('.', ',') : Math.round(topPct)}%`,
      }
    : null;

  const sessionGames = (Array.isArray(historyRows) ? historyRows : []).filter((row) => {
    const ts = toMs(row && row.startedAt);
    return ts != null && now - ts >= 0 && now - ts <= SESSION_WINDOW_MS;
  }).length;

  const wins = Number(p.wins);
  const losses = Number(p.losses);
  const drops = Number(p.drops);
  const totalLadder = Number.isFinite(wins) && Number.isFinite(losses) ? wins + losses : 0;
  const dropRatePct = totalLadder >= 20 && Number.isFinite(drops) && drops > 0
    ? Math.round((drops / totalLadder) * 1000) / 10
    : null;

  return {
    streak,
    peakGap,
    percentile,
    sessionGames,
    dropRatePct: dropRatePct != null && dropRatePct >= 4 ? dropRatePct : null,
    clan: p.clan || null,
  };
}

/**
 * Veredicto táctico en una sola línea para leer en 3 segundos durante el lobby.
 */
function buildPrematchVerdict({ prediction, eapm, style, openings, recommend, mapName, knownCiv }) {
  if (knownCiv) {
    const slug = civSlug(knownCiv);
    const threat = slug ? CIV_THREATS[slug] : null;
    if (threat) return { kind: 'revealed', text: threat.threat };
    return null;
  }

  const pool = prediction && prediction.pool;
  const top = prediction && prediction.top3 && prediction.top3[0];
  const topOpening = Array.isArray(openings) ? openings[0] : null;
  const bestRec = Array.isArray(recommend) && recommend[0] && recommend[0].basis === 'combined'
    ? recommend[0]
    : null;

  if (pool && pool.poolType === 'random') {
    if (topOpening && topOpening.games >= 4 && topOpening.sample >= 6) {
      return {
        kind: 'random',
        text: `Juega Random · no counter-pickees civ; preparate para ${topOpening.short || topOpening.name} (${topOpening.games}/${topOpening.sample}).`,
      };
    }
    return {
      kind: 'random',
      text: 'Juega Random · priorizá tu civ más cómoda en este mapa y confirmá su apertura explorando.',
    };
  }

  if (pool && (pool.poolType === 'specialist' || pool.poolType === 'focused') && top) {
    const parts = [`${pool.label}${mapName ? ` en ${mapName}` : ''}: ${top.civ} (${top.probability}%)`];
    if (topOpening && topOpening.games >= 3) {
      parts.push(`suele abrir ${topOpening.short || topOpening.name}`);
    } else if (style && style.dominant && style.dominant !== 'mixto') {
      parts.push(`perfil ${style.label.toLowerCase()}`);
    }
    if (bestRec) {
      parts.push(`en tu repertorio encaja ${bestRec.civ}`);
    }
    return { kind: pool.poolType, text: `${parts.join(' · ')}.` };
  }

  if (eapm && eapm.pace === 'fast' && topOpening) {
    return {
      kind: 'pace',
      text: `Mecánica rápida (${eapm.value} eAPM) con tendencia a ${topOpening.short || topOpening.name}.`,
    };
  }
  return null;
}

module.exports = {
  VERSION,
  CIV_THREATS,
  classifyCivPool,
  predictRivalCivs,
  computeEapmProfile,
  computeEloAdjustedWeaknesses,
  computeFormProfile,
  buildPrematchVerdict,
};
