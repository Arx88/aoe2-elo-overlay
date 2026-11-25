'use strict';

/**
 * Relic · Welcome Home Briefing Engine (`src/welcome-home.js`)
 *
 * Prepara el briefing editorial efímero de bienvenida al iniciar Relic:
 *   1. Saludo dinámico según hora local, día de la semana y nombre del jugador.
 *   2. Pulso global semanal de AoE2:DE (Top 3 más jugadas, Top 3 mayor winrate,
 *      mapas de la semana y unidad única destacada) desde el edge cache de
 *      Cloudflare Worker (`/v1/meta/global`) + caché local en disco (0 ms).
 *   3. Tesoro de Oro & Crónica de Guerra real calculada sobre `performanceStore`
 *      usando los costos oficiales de cada unidad, edad y tecnología en
 *      `techtree-data.json` (se actualiza en vivo tras cada partida analizada).
 *   4. Pulso personal inmediato (ELO 1v1 & Team, racha, civ protagonista,
 *      mejor mapa reciente y progreso semanal de Entrenamiento).
 *   5. Ilustraciones de Unidades Únicas (`assets/units/<slug>.webp`) + Curiosidad
 *      del día verificada sobre el árbol oficial de 56 civilizaciones.
 */

const fs = require('fs');
const path = require('path');
let proMatchupEngine = null;
try {
  proMatchupEngine = require('./training/pro-matchup-engine');
} catch {
  proMatchupEngine = null;
}

const GLOBAL_META_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
const ANNOUNCEMENT_TTL_MS = 60 * 1000; // 60 segundos

const GOLD_RANKS = Object.freeze([
  { id: 'raider', label: 'Saqueador', min: 0 },
  { id: 'merchant', label: 'Mercader', min: 25000 },
  { id: 'treasurer', label: 'Tesorero Real', min: 75000 },
  { id: 'conqueror', label: 'Conquistador', min: 150000 },
  { id: 'mansa_musa', label: 'Mansa Musa', min: 300000 },
]);

function computeGoldRank(goldTotal) {
  const gold = Math.max(0, Math.round(Number(goldTotal) || 0));
  let idx = 0;
  for (let i = 0; i < GOLD_RANKS.length; i += 1) {
    if (gold >= GOLD_RANKS[i].min) idx = i;
  }
  const cur = GOLD_RANKS[idx];
  const next = GOLD_RANKS[idx + 1] || null;
  if (!next) {
    return {
      id: cur.id,
      label: cur.label,
      tierIndex: idx,
      nextLabel: null,
      nextThreshold: null,
      remainingGold: 0,
      pct: 100,
    };
  }
  const span = Math.max(1, next.min - cur.min);
  const pct = Math.max(0, Math.min(100, Math.round(((gold - cur.min) / span) * 100)));
  return {
    id: cur.id,
    label: cur.label,
    tierIndex: idx,
    nextLabel: next.label,
    nextThreshold: next.min,
    remainingGold: Math.max(0, next.min - gold),
    pct,
  };
}

function sanitizeClientAnnouncementImage(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(s) && s.length <= 480000) {
    return s;
  }
  if (/^https:\/\/[^\s"'<>]+$/i.test(s) && s.length <= 500) {
    try {
      const u = new URL(s);
      if (u.protocol === 'https:') return u.toString();
    } catch { /* ignore */ }
  }
  return '';
}

function normalizeClientAnnouncement(raw) {
  const src = raw && typeof raw === 'object' ? raw : null;
  if (!src || src.enabled !== true) return null;
  const title = String(src.title || '').trim().slice(0, 120);
  const body = String(src.body || '').trim().slice(0, 800);
  if (!title && !body) return null;
  const validTags = new Set(['novedad', 'torneo', 'actualizacion', 'aviso']);
  const tag = validTags.has(String(src.tag || '').toLowerCase()) ? String(src.tag).toLowerCase() : 'novedad';
  const imageUrl = sanitizeClientAnnouncementImage(src.imageUrl);
  const ctaLabel = String(src.ctaLabel || '').trim().slice(0, 40);
  let ctaUrl = '';
  if (src.ctaUrl && typeof src.ctaUrl === 'string') {
    try {
      const u = new URL(src.ctaUrl.trim());
      if (u.protocol === 'https:') ctaUrl = u.toString();
    } catch { /* ignore invalid url */ }
  }
  return {
    enabled: true,
    tag,
    title,
    body,
    imageUrl,
    ctaLabel: ctaUrl ? (ctaLabel || 'Ver más') : '',
    ctaUrl,
    updatedAt: Number(src.updatedAt) || 0,
  };
}

function readAnnouncementCache(cachePath) {
  const cached = readJsonSafe(cachePath);
  if (!cached || typeof cached !== 'object') return null;
  const ageMs = Date.now() - (Number(cached._cachedAt) || 0);
  return {
    data: normalizeClientAnnouncement(cached.announcement),
    fresh: ageMs >= 0 && ageMs < ANNOUNCEMENT_TTL_MS,
    ageMs,
  };
}

async function fetchAnnouncement({ apiUrl, cachePath, force = false } = {}) {
  const existing = readAnnouncementCache(cachePath);
  if (!force && existing && existing.fresh) {
    return existing.data;
  }
  const base = String(apiUrl || '').trim().replace(/\/+$/, '');
  if (!base) return existing ? existing.data : null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${base}/v1/announcement`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Relic-Desktop/3.2',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`http-${res.status}`);
    const data = await res.json();
    if (!data || data.ok !== true) throw new Error('invalid-payload');
    const clean = normalizeClientAnnouncement(data.announcement);
    writeJsonSafe(cachePath, { announcement: clean || { enabled: false }, _cachedAt: Date.now() });
    return clean;
  } catch {
    return existing ? existing.data : null;
  } finally {
    clearTimeout(timer);
  }
}

function toSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath, obj) {
  try {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch {
    /* ignore disk cache write failure */
  }
}

function readGlobalMetaCache(cachePath) {
  const cached = readJsonSafe(cachePath);
  if (!cached || !cached.ladders || !cached.ladders.rm_1v1) return null;
  const ageMs = Date.now() - (Number(cached._cachedAt) || 0);
  return {
    data: cached,
    fresh: ageMs >= 0 && ageMs < GLOBAL_META_TTL_MS,
    ageMs,
  };
}

async function fetchGlobalMeta({ apiUrl, cachePath, force = false } = {}) {
  const existing = readGlobalMetaCache(cachePath);
  if (!force && existing && existing.fresh) {
    return existing.data;
  }
  const base = String(apiUrl || '').trim().replace(/\/+$/, '');
  if (!base) return existing ? existing.data : null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${base}/v1/meta/global`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Relic-Desktop/3.2',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`http-${res.status}`);
    const data = await res.json();
    if (!data || !data.ok || !data.ladders) throw new Error('invalid-payload');
    const stamped = { ...data, _cachedAt: Date.now() };
    writeJsonSafe(cachePath, stamped);
    return stamped;
  } catch {
    return existing ? existing.data : null;
  } finally {
    clearTimeout(timer);
  }
}

function buildGreeting({ alias = '', now = new Date() } = {}) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  const hour = d.getHours();
  const day = d.getDay();

  let salutation = 'Buenas noches';
  if (hour >= 5 && hour < 12) salutation = 'Buenos días';
  else if (hour >= 12 && hour < 20) salutation = 'Buenas tardes';

  let subline = 'Buen entrenamiento y buenas partidas hoy.';
  if (day === 1) subline = 'Arrancando la semana — que tengas una gran semana de entrenamiento.';
  else if (day === 2 || day === 3) subline = 'Mitad de semana ideal para afinar mecánicas y consolidar tu ELO.';
  else if (day === 4) subline = 'Buen ritmo de semana — cada partida suma experiencia y oro al tesoro.';
  else if (day === 5) subline = 'Viernes de ladder — cerrá la semana en tu mejor nivel.';
  else if (day === 6 || day === 0) subline = 'Fin de semana de Age — buen momento para entrenar y mandar cola.';

  const cleanName = String(alias || '').trim();
  const headline = cleanName ? `${salutation}, ${cleanName}` : `${salutation}, comandante`;

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dateLabel = `${dayNames[day]} ${d.getDate()} ${monthNames[d.getMonth()]}`;

  return {
    salutation,
    playerName: cleanName || 'Comandante',
    headline,
    subline,
    dateLabel,
  };
}

function resolveCivShowcase(civNameOrSlug, techTreeData, availableUnitSlugs = null) {
  const slug = toSlug(civNameOrSlug);
  if (!slug) return null;
  const civObj = techTreeData?.civs?.[slug] || null;
  const rawUu = Array.isArray(civObj?.uniqueUnits) && civObj.uniqueUnits[0]
    ? String(civObj.uniqueUnits[0])
    : '';
  const firstEntry = rawUu.split(',')[0].trim();
  const roleMatch = firstEntry.match(/^([^(]+)\(([^)]+)\)/);
  const unitName = roleMatch ? roleMatch[1].trim() : (firstEntry || null);
  const unitRole = roleMatch ? roleMatch[2].trim() : null;

  const hasArt = !availableUnitSlugs || availableUnitSlugs.has(slug);
  return {
    slug,
    civName: civObj?.name || String(civNameOrSlug || ''),
    arch: civObj?.arch || '',
    unitName,
    unitRole,
    unitArt: hasArt ? `assets/units/${slug}.webp` : null,
  };
}

function buildGoldCostIndex(techTreeData) {
  const byUnitId = new Map();
  const byName = new Map();
  const nodes = (techTreeData && techTreeData.nodes) || {};
  for (const node of Object.values(nodes)) {
    if (!node || !node.cost) continue;
    const g = Number(node.cost.g || 0);
    if (!Number.isFinite(g) || g <= 0) continue;
    if (node.ut === 'U' && Number.isFinite(Number(node.id))) {
      byUnitId.set(Number(node.id), g);
    }
    if (node.name) byName.set(normText(node.name), g);
    if (node.nameEn) byName.set(normText(node.nameEn), g);
  }
  // Alias cortos frecuentes en engineSummary
  const fallback = {
    caballero: 75,
    paladin: 75,
    jinete: 75,
    arquero: 45,
    ballestero: 45,
    arbalesta: 45,
    'arquero a caballo': 60,
    mangana: 135,
    onagro: 135,
    ariete: 75,
    escorpion: 75,
    lanzapiedras: 200,
    'lanzapiedras (desarmado)': 200,
    monje: 100,
    conquistador: 60,
    mangudai: 65,
    'canon de asedio': 225,
    'artillero manual': 50,
    'jinete de camello': 60,
    'elefante de batalla': 70,
    espadachin: 20,
    campeon: 20,
    milicia: 20,
    'hombre de armas': 20,
    aguila: 50,
  };
  for (const [k, v] of Object.entries(fallback)) {
    if (!byName.has(k)) byName.set(k, v);
  }
  return { byUnitId, byName };
}

function computeMatchGoldSpent(record, costIndex) {
  const self = record?.telemetry?.engineSummary?.self;
  if (!self) return null;
  let gold = 0;

  // 1. Unidades entrenadas con costo oficial en oro
  if (Array.isArray(self.topUnits)) {
    for (const u of self.topUnits) {
      const cnt = Number(u?.count || 0);
      if (!Number.isFinite(cnt) || cnt <= 0) continue;
      let unitGold = 0;
      if (Number.isFinite(Number(u.unitId)) && costIndex.byUnitId.has(Number(u.unitId))) {
        unitGold = costIndex.byUnitId.get(Number(u.unitId));
      } else if (u.name) {
        unitGold = costIndex.byName.get(normText(u.name)) || 0;
      }
      gold += cnt * unitGold;
    }
  }

  // 2. Avances de edad oficiales (Castillos = 200 oro, Imperial = 800 oro)
  const timings = self.timings || {};
  if (Number(timings.castleSeconds) > 0) gold += 200;
  if (Number(timings.imperialSeconds) > 0) gold += 800;

  // 3. Tecnologías investigadas registradas en techProfile
  const tp = self.techProfile || {};
  const techLists = [tp.ecoNames, tp.blacksmithNames, tp.combatKeyNames];
  for (const list of techLists) {
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      const g = costIndex.byName.get(normText(name)) || 0;
      gold += g;
    }
  }

  // 4. Oro neto obtenido vendiendo en el mercado (conservador ~55g/100u promedio)
  const sold = self.marketProfile?.sold;
  if (sold) {
    const soldUnits = (Number(sold.wood) || 0) + (Number(sold.food) || 0) + (Number(sold.stone) || 0);
    if (soldUnits > 0) gold += Math.round((soldUnits / 100) * 55);
  }

  return Math.round(gold);
}

function summarizeWarLedger({ performanceRecords = [], techTreeData = null, now = new Date() } = {}) {
  const records = Array.isArray(performanceRecords) ? performanceRecords : [];
  if (!records.length) return null;

  const d = now instanceof Date ? now : new Date(now || Date.now());
  const weekCutoff = d.getTime() - 7 * 24 * 60 * 60 * 1000;
  const costIndex = buildGoldCostIndex(techTreeData);

  const valid = records.filter((r) => r && r.telemetry && r.telemetry.engineSummary && r.telemetry.engineSummary.self);
  if (!valid.length) return null;

  const weekValid = valid.filter((r) => Number(r.startedAt || r.finishedAt || r.updatedAt || 0) >= weekCutoff);
  const useWeek = weekValid.length > 0;
  const pool = useWeek ? weekValid : valid;

  function aggregate(list) {
    let goldTotal = 0;
    let villagers = 0;
    let military = 0;
    let farms = 0;
    let castles = 0;
    let extraTcs = 0;
    let totalSeconds = 0;
    let peakEapm = 0;
    let peakEapmMatch = null;
    let darkUtilSum = 0;
    let darkUtilCount = 0;
    let bestDarkTc = null;
    let fastestWin = null;
    let maxGoldMatch = null;

    for (const r of list) {
      const self = r.telemetry.engineSummary.self;
      const g = computeMatchGoldSpent(r, costIndex);
      const matchCivSlug = toSlug(r.selfCiv || r.civ || self.civ || '');
      const matchCivName = techTreeData?.civs?.[matchCivSlug]?.name || r.selfCiv || r.civ || '';
      const matchMap = String(r.mapName || r.map || '').trim();
      if (Number.isFinite(g)) {
        goldTotal += g;
        if (!maxGoldMatch || g > maxGoldMatch.gold) {
          maxGoldMatch = { gold: Math.round(g), civ: matchCivName, map: matchMap };
        }
      }
      villagers += Number(self.villagersOrdered || 0);
      military += Number(self.militaryOrdered || 0);
      farms += Number(self.macroBuilds?.farms || 0);
      castles += Number(self.macroBuilds?.castles || 0);
      extraTcs += Number(self.macroBuilds?.extraTcs || 0);
      const durSec = Number(r.elapsedSeconds || r.telemetry.durationSeconds || 0);
      totalSeconds += durSec;
      const wonFlag = r.won === true || r.result === 'win';
      if (wonFlag && durSec >= 300 && (!fastestWin || durSec < fastestWin.seconds)) {
        fastestWin = { seconds: Math.round(durSec), civ: matchCivName, map: matchMap };
      }
      if (Number(self.peakEapm) > peakEapm) {
        peakEapm = Math.round(Number(self.peakEapm));
        peakEapmMatch = { value: peakEapm, civ: matchCivName, map: matchMap };
      }
      if (Number.isFinite(Number(self.tcUtilizationDark)) && Number(self.tcUtilizationDark) > 0) {
        const tcVal = Number(self.tcUtilizationDark);
        darkUtilSum += tcVal;
        darkUtilCount += 1;
        if (!bestDarkTc || tcVal > bestDarkTc.pct) {
          bestDarkTc = { pct: +tcVal.toFixed(1), civ: matchCivName, map: matchMap };
        }
      }
    }

    let weeklyRecord = null;
    const fmtDur = (sec) => {
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    };
    const highlights = [];
    if (fastestWin) {
      highlights.push({
        id: 'fastest_win',
        label: 'Victoria más rápida',
        value: fmtDur(fastestWin.seconds),
        context: [fastestWin.civ, fastestWin.map].filter(Boolean).join(' · '),
      });
    }
    if (bestDarkTc && bestDarkTc.pct >= 85) {
      highlights.push({
        id: 'best_dark_tc',
        label: 'Mejor TC Alta Edad',
        value: `${String(bestDarkTc.pct).replace('.', ',')}%`,
        context: [bestDarkTc.civ, bestDarkTc.map].filter(Boolean).join(' · '),
      });
    }
    if (peakEapmMatch && peakEapmMatch.value >= 30) {
      highlights.push({
        id: 'peak_eapm',
        label: 'Pico de velocidad',
        value: `${peakEapmMatch.value} eAPM`,
        context: [peakEapmMatch.civ, peakEapmMatch.map].filter(Boolean).join(' · '),
      });
    }
    if (maxGoldMatch && maxGoldMatch.gold >= 1000) {
      highlights.push({
        id: 'max_gold',
        label: 'Mayor botín en 1 partida',
        value: `${maxGoldMatch.gold.toLocaleString('es-AR')} oro`,
        context: [maxGoldMatch.civ, maxGoldMatch.map].filter(Boolean).join(' · '),
      });
    }
    if (highlights.length) {
      weeklyRecord = {
        primary: highlights[0],
        items: highlights.slice(0, 3),
      };
    }

    return {
      matchesCount: list.length,
      goldTotal: Math.round(goldTotal),
      villagers: Math.round(villagers),
      military: Math.round(military),
      farms: Math.round(farms),
      castles: Math.round(castles),
      extraTcs: Math.round(extraTcs),
      hoursPlayed: +(totalSeconds / 3600).toFixed(1),
      peakEapm,
      avgDarkTcPct: darkUtilCount > 0 ? +(darkUtilSum / darkUtilCount).toFixed(1) : null,
      weeklyRecord,
    };
  }

  const active = aggregate(pool);
  const allTime = aggregate(valid);

  // Oro juntado HOY (suma de todas las partidas terminadas hoy desde medianoche local)
  const todayStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  let todayGold = 0;
  let todayMatchesCount = 0;
  for (const r of valid) {
    const startTs = Number(r.startedAt || 0);
    const durMs = Math.max(0, Number(r.elapsedSeconds || r.telemetry?.durationSeconds || 0)) * 1000;
    const completedTs = Number(r.finishedAt || 0) || (startTs > 0 ? startTs + durMs : Number(r.updatedAt || 0));
    const g = computeMatchGoldSpent(r, costIndex);
    if (!Number.isFinite(g) || g <= 0) continue;
    if (completedTs >= todayStartMs) {
      todayGold += g;
      todayMatchesCount += 1;
    }
  }
  todayGold = Math.round(todayGold);

  // Equivalencia divertida y concreta en unidades de AoE2
  const paladinsEq = Math.max(1, Math.round(active.goldTotal / 75));
  const trebsEq = Math.max(1, Math.round(active.goldTotal / 200));
  const goldEquivalence = active.goldTotal >= 200
    ? `Equivale a ${paladinsEq.toLocaleString('es-AR')} Caballeros o ${trebsEq.toLocaleString('es-AR')} Lanzapiedras`
    : 'Jugá una partida con Relic abierto para empezar a juntar oro';

  return {
    scope: useWeek ? 'week' : 'all',
    scopeLabel: useWeek
      ? `Esta semana · ${active.matchesCount} ${active.matchesCount === 1 ? 'partida' : 'partidas'}`
      : `Últimas ${active.matchesCount} partidas`,
    ...active,
    todayGold,
    todayMatchesCount,
    goldRank: computeGoldRank(active.goldTotal),
    allTimeGold: allTime.goldTotal,
    allTimeMatches: allTime.matchesCount,
    goldEquivalence,
  };
}

function extractPlayerFromMatch(match, profileId) {
  if (!match || !Array.isArray(match.players)) return null;
  const pid = Number(profileId);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return match.players.find((p) => Number(p?.profileId) === pid) || null;
}

function summarizePersonalPulse({
  centralCacheRaw = null,
  profileId = null,
  alias = null,
  trainingDashboard = null,
  techTreeData = null,
  availableUnitSlugs = null,
  now = new Date(),
} = {}) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  const nowMs = d.getTime();
  const weekCutoff = nowMs - 7 * 24 * 60 * 60 * 1000;

  const raw = centralCacheRaw?.raw || centralCacheRaw || null;
  const pid = Number(profileId || centralCacheRaw?.profileId || raw?.profileId || 0) || null;
  const displayName = String(alias || raw?.alias || raw?.profileData?.name || '').trim() || null;

  const lbs = Array.isArray(raw?.profileData?.leaderboards) ? raw.profileData.leaderboards : [];
  const pickLb = (id) => {
    const row = lbs.find((l) => l && l.leaderboardId === id);
    if (!row || !Number.isFinite(Number(row.rating))) return null;
    const games = Number(row.games) || 0;
    const wins = Number(row.wins) || 0;
    return {
      rating: Math.round(Number(row.rating)),
      peak: Math.round(Number(row.maxRating || row.rating)),
      games,
      wins,
      losses: Math.max(0, games - wins),
      winRate: games > 0 ? Math.round((wins / games) * 100) : null,
      streak: Number.isFinite(Number(row.streak)) ? Math.round(Number(row.streak)) : 0,
    };
  };

  const elo1v1 = pickLb('rm_1v1');
  const eloTeam = pickLb('rm_team');

  const seen = new Set();
  const recentMatches = [];
  for (const list of [raw?.matchesAll, raw?.matchesTeam, raw?.matches1v1]) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m || m.ongoing) continue;
      const mid = m.matchId || `${m.startedAt}-${m.mapName}`;
      if (seen.has(mid)) continue;
      seen.add(mid);
      const me = extractPlayerFromMatch(m, pid);
      if (!me || typeof me.won !== 'boolean') continue;
      const myTeam = me.team != null ? Number(me.team) : null;
      const oppCivs = [];
      if (Array.isArray(m.players)) {
        for (const pl of m.players) {
          if (!pl || Number(pl.profileId) === pid) continue;
          if (myTeam != null && pl.team != null && Number(pl.team) === myTeam) continue;
          const oc = String(pl.civ || pl.civName || '').trim();
          if (oc) oppCivs.push(oc);
        }
      }
      recentMatches.push({
        matchId: mid,
        startedAt: Number(m.startedAt || m.finishedAt || 0),
        leaderboardId: m.leaderboardId || '',
        civ: String(me.civ || me.civName || '').trim() || null,
        won: Boolean(me.won),
        mapName: m.mapName || null,
        oppCivs,
      });
    }
  }
  recentMatches.sort((a, b) => b.startedAt - a.startedAt);

  let recent1v1Count = 0;
  let recentTeamCount = 0;
  for (const m of recentMatches.slice(0, 20)) {
    if (m.leaderboardId === 'rm_1v1' || m.leaderboardId === 'ew_1v1') recent1v1Count += 1;
    else if (m.leaderboardId === 'rm_team' || m.leaderboardId === 'ew_team') recentTeamCount += 1;
  }
  let primaryMode = 'rm_1v1';
  if (recentTeamCount > recent1v1Count) primaryMode = 'rm_team';
  else if (recentTeamCount === recent1v1Count && (eloTeam?.games || 0) > (elo1v1?.games || 0) * 1.5) primaryMode = 'rm_team';
  else if (!elo1v1 && eloTeam) primaryMode = 'rm_team';

  const weekOnly = recentMatches.filter((m) => m.startedAt >= weekCutoff);
  const samplePool = weekOnly.length >= 3 ? weekOnly : recentMatches.slice(0, 15);
  const periodLabel = weekOnly.length >= 3
    ? 'Últimos 7 días'
    : (samplePool.length ? `Últimas ${samplePool.length} partidas` : null);

  let weekSummary = null;
  let topCiv = null;
  let topMap = null;
  if (samplePool.length > 0) {
    const wins = samplePool.filter((m) => m.won).length;
    const losses = samplePool.length - wins;
    weekSummary = {
      games: samplePool.length,
      wins,
      losses,
      winRate: Math.round((wins / samplePool.length) * 100),
      periodLabel,
    };

    const byCiv = new Map();
    const byMap = new Map();
    for (const m of samplePool) {
      if (m.civ) {
        const cur = byCiv.get(m.civ) || { name: m.civ, slug: toSlug(m.civ), games: 0, wins: 0 };
        cur.games += 1;
        if (m.won) cur.wins += 1;
        byCiv.set(m.civ, cur);
      }
      if (m.mapName) {
        const curM = byMap.get(m.mapName) || { name: m.mapName, games: 0, wins: 0 };
        curM.games += 1;
        if (m.won) curM.wins += 1;
        byMap.set(m.mapName, curM);
      }
    }
    const sortedCivs = [...byCiv.values()].sort((a, b) => (b.games - a.games) || (b.wins - a.wins));
    if (sortedCivs.length) {
      const c = sortedCivs[0];
      const showcase = resolveCivShowcase(c.slug, techTreeData, availableUnitSlugs);
      topCiv = {
        name: showcase?.civName || c.name,
        rawName: c.name,
        slug: c.slug,
        games: c.games,
        wins: c.wins,
        losses: c.games - c.wins,
        winRate: Math.round((c.wins / c.games) * 100),
        periodLabel,
        unitName: showcase?.unitName || null,
        unitRole: showcase?.unitRole || null,
        unitArt: showcase?.unitArt || null,
      };
    }
    const bestWinning = sortedCivs
      .map((c) => ({ ...c, winRate: Math.round((c.wins / c.games) * 100) }))
      .filter((c) => c.games >= 2 && c.winRate >= 50)
      .sort((a, b) => (b.wins - a.wins) || (b.winRate - a.winRate))[0] || null;
    if (bestWinning) {
      const scBest = resolveCivShowcase(bestWinning.slug, techTreeData, availableUnitSlugs);
      topCiv.bestRecent = {
        name: scBest?.civName || bestWinning.name,
        slug: bestWinning.slug,
        games: bestWinning.games,
        wins: bestWinning.wins,
        losses: bestWinning.games - bestWinning.wins,
        winRate: bestWinning.winRate,
        unitName: scBest?.unitName || null,
        unitRole: scBest?.unitRole || null,
        unitArt: scBest?.unitArt || null,
      };
    }
    const sortedMaps = [...byMap.values()].sort((a, b) => (b.games - a.games) || (b.wins - a.wins));
    if (sortedMaps.length) {
      const mp = sortedMaps[0];
      topMap = {
        name: mp.name,
        games: mp.games,
        wins: mp.wins,
        losses: mp.games - mp.wins,
        winRate: Math.round((mp.wins / mp.games) * 100),
      };
    }
  }

  let training = null;
  if (trainingDashboard && typeof trainingDashboard === 'object') {
    const weekly = trainingDashboard.weekly || {};
    const arena = trainingDashboard.arena || {};
    const missions = Array.isArray(trainingDashboard.missions) ? trainingDashboard.missions : [];
    const nextMission = missions.find((m) => m && !m.completed) || null;
    training = {
      unlocked: Boolean(trainingDashboard.unlocked),
      daysActive: Number(weekly.daysActive || weekly.activeDays || 0),
      daysTarget: Number(weekly.daysTarget || weekly.targetDays || 5),
      streakDays: Number(weekly.streakDays || weekly.streak || 0),
      xpWeek: Number(weekly.weekXp || weekly.xp || 0),
      arenaLevel: Number(arena.currentLevel || arena.unlockedLevel || 1),
      nextMissionTitle: nextMission ? String(nextMission.title || '').slice(0, 72) : null,
    };
  }

  // Tira de actividad de los últimos 7 días (L M X J V S D, de hace 6 días hasta hoy)
  const SHORT_DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const dayBuckets = new Map();
  const activityStrip = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const entry = {
      key,
      dayLabel: SHORT_DAYS[dt.getDay()],
      games: 0,
      wins: 0,
      losses: 0,
      isToday: offset === 0,
      polarity: 'idle',
    };
    dayBuckets.set(key, entry);
    activityStrip.push(entry);
  }
  for (const m of recentMatches) {
    if (!m.startedAt || m.startedAt < nowMs - 8 * 24 * 60 * 60 * 1000) continue;
    const md = new Date(m.startedAt);
    const key = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}`;
    const bucket = dayBuckets.get(key);
    if (!bucket) continue;
    bucket.games += 1;
    if (m.won) bucket.wins += 1;
    else bucket.losses += 1;
  }
  for (const b of activityStrip) {
    if (b.games === 0) b.polarity = 'idle';
    else if (b.wins > b.losses) b.polarity = 'win';
    else if (b.losses > b.wins) b.polarity = 'loss';
    else b.polarity = 'even';
  }

  // Némesis y víctima reciente (últimas 30 partidas)
  let rivalCivPulse = null;
  const oppMap = new Map();
  for (const m of recentMatches.slice(0, 30)) {
    if (!Array.isArray(m.oppCivs) || !m.oppCivs.length) continue;
    const seenInMatch = new Set();
    for (const oc of m.oppCivs) {
      const slug = toSlug(oc);
      if (!slug || seenInMatch.has(slug)) continue;
      seenInMatch.add(slug);
      const cur = oppMap.get(slug) || { slug, rawName: oc, games: 0, wins: 0 };
      cur.games += 1;
      if (m.won) cur.wins += 1;
      oppMap.set(slug, cur);
    }
  }
  const oppStats = [...oppMap.values()]
    .filter((c) => c.games >= 2)
    .map((c) => {
      const sc = resolveCivShowcase(c.slug, techTreeData, availableUnitSlugs);
      return {
        slug: c.slug,
        name: sc?.civName || c.rawName,
        games: c.games,
        wins: c.wins,
        losses: c.games - c.wins,
        winRate: Math.round((c.wins / c.games) * 100),
      };
    });
  const victim = oppStats
    .filter((c) => c.winRate >= 60)
    .sort((a, b) => (b.wins - a.wins) || (b.winRate - a.winRate))[0] || null;
  const nemesis = oppStats
    .filter((c) => c.winRate <= 40 && (!victim || c.slug !== victim.slug))
    .sort((a, b) => (b.losses - a.losses) || (a.winRate - b.winRate))[0] || null;
  if (victim || nemesis) {
    rivalCivPulse = { victim, nemesis };
  }

  return {
    profileId: pid,
    displayName,
    primaryMode,
    elo1v1,
    eloTeam,
    weekSummary,
    activityStrip,
    rivalCivPulse,
    topCiv,
    topMap,
    training,
  };
}

function lookupTopCountersForCiv(targetSlug, proMatchupDataset, techTreeData, availableUnitSlugs) {
  const slug = toSlug(targetSlug);
  const openPairs = proMatchupDataset?.pairs?.open;
  if (!slug || !openPairs || typeof openPairs !== 'object') return null;

  const candidates = [];
  for (const [pairKey, pair] of Object.entries(openPairs)) {
    const parts = pairKey.split('__');
    if (parts.length !== 2) continue;
    const [c1, c2] = parts;
    if (c1 !== slug && c2 !== slug) continue;
    const totalGames = Number(pair?.n?.[0] || 0);
    if (totalGames < 8) continue;
    const c1Wins = Number(pair?.n?.[1] || 0);
    const counterSlug = c1 === slug ? c2 : c1;
    const counterWins = c1 === slug ? (totalGames - c1Wins) : c1Wins;
    const wrPct = Math.round((counterWins / totalGames) * 100);
    if (wrPct < 52) continue;
    const counterSide = c1 === slug ? pair.s2 : pair.s1;
    const route = counterSide?.chain?.[0]
      || [counterSide?.op?.[0], counterSide?.cas?.[0]].filter(Boolean).join(' → ')
      || null;
    const score = (wrPct - 50) * Math.log2(totalGames + 1);
    const sc = resolveCivShowcase(counterSlug, techTreeData, availableUnitSlugs);
    candidates.push({
      slug: counterSlug,
      name: sc?.civName || counterSlug,
      winRatePct: wrPct,
      games: totalGames,
      unitName: sc?.unitName || null,
      unitArt: sc?.unitArt || null,
      route,
      _score: score,
    });
  }
  candidates.sort((a, b) => (b._score - a._score) || (b.winRatePct - a.winRatePct));
  const top = candidates.slice(0, 2).map(({ _score, ...rest }) => rest);
  if (!top.length) return null;
  const targetSc = resolveCivShowcase(slug, techTreeData, availableUnitSlugs);
  return {
    targetSlug: slug,
    targetName: targetSc?.civName || slug,
    picks: top,
  };
}

function enrichGlobalMetaWithArt(globalMeta, techTreeData, availableUnitSlugs, proMatchupDataset = null) {
  if (!globalMeta || !globalMeta.ladders) return null;
  const out = { ...globalMeta, ladders: {} };
  for (const [key, ladder] of Object.entries(globalMeta.ladders)) {
    if (!ladder) continue;
    const enrichList = (arr) => (Array.isArray(arr) ? arr.map((item) => {
      const sc = resolveCivShowcase(item.slug || item.name, techTreeData, availableUnitSlugs);
      return {
        ...item,
        name: sc?.civName || item.name,
        unitName: sc?.unitName || null,
        unitRole: sc?.unitRole || null,
        unitArt: sc?.unitArt || null,
      };
    }) : []);
    const topPlayed = enrichList(ladder.topPlayed);
    const topWinrate = enrichList(ladder.topWinrate);
    const top1Slug = topPlayed[0]?.slug || toSlug(topPlayed[0]?.name);
    const topCounter = top1Slug
      ? lookupTopCountersForCiv(top1Slug, proMatchupDataset, techTreeData, availableUnitSlugs)
      : null;
    out.ladders[key] = {
      ...ladder,
      topPlayed,
      topWinrate,
      topCounter,
    };
  }
  return out;
}

function buildDailyCodexCuriosity({ techTreeData = null, globalMeta = null, now = new Date() } = {}) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  const daySeed = (d.getFullYear() * 1000) + Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);

  const facts = [];
  const totalCivs = techTreeData && techTreeData.civs ? Object.keys(techTreeData.civs).length : 56;
  const nodes = (techTreeData && techTreeData.nodes) || {};

  const techSpecs = [
    {
      id: 'U:569',
      tag: 'CÓDICE · CABALLERÍA',
      build: (n) => ({
        title: `El club exclusivo del ${n.name}`,
        body: `Solo ${n.civCount} de las ${totalCivs} civilizaciones de AoE2:DE pueden desarrollar ${n.name}, convirtiéndolo en una de las mejoras imperiales más raras del juego.`,
        ctaLabel: 'Ver en Árbol de tecnología',
        action: 'techtree',
      }),
    },
    {
      id: 'U:330',
      tag: 'CÓDICE · CONTRA-CABALLERÍA',
      build: (n) => ({
        title: `El poder selecto del ${n.name}`,
        body: `Únicamente ${n.civCount} de las ${totalCivs} civilizaciones tienen acceso a ${n.name}, la respuesta más móvil para frenar composiciones de caballería pesada.`,
        ctaLabel: 'Explorar árbol oficial',
        action: 'techtree',
      }),
    },
    {
      id: 'U:588',
      tag: 'CÓDICE · ASEDIO',
      build: (n) => ({
        title: `Solo ${n.civCount} civilizaciones tienen ${n.name}`,
        body: `De las ${totalCivs} civilizaciones actuales, apenas ${n.civCount} desbloquean ${n.name} en Imperial — decisivo en mapas cerrados y partidas tardías.`,
        ctaLabel: 'Ver en Árbol de tecnología',
        action: 'techtree',
      }),
    },
    {
      id: 'U:36',
      tag: 'CÓDICE · PÓLVORA',
      build: (n) => ({
        title: `Pólvora de largo alcance: ${n.name}`,
        body: `${n.civCount} de las ${totalCivs} civilizaciones cuentan con ${n.name}, la pieza clave para neutralizar onagros, escorpiones y castillos rivales a distancia.`,
        ctaLabel: 'Ver en Árbol de tecnología',
        action: 'techtree',
      }),
    },
    {
      id: 'T:316',
      tag: 'CÓDICE · MONASTERIO',
      build: (n) => ({
        title: `${n.name}: el terror del asedio enemigo`,
        body: `${n.civCount} de las ${totalCivs} civilizaciones pueden investigar ${n.name} para convertir mangoneles y edificios rivales en plena Edad de los Castillos.`,
        ctaLabel: 'Explorar árbol oficial',
        action: 'techtree',
      }),
    },
    {
      id: 'T:437',
      tag: 'CÓDICE · ARQUERÍA',
      build: (n) => ({
        title: `Precisión al 100 %: ${n.name}`,
        body: `${n.civCount} de las ${totalCivs} civilizaciones disponen de ${n.name}, que lleva la precisión de los arqueros al 100 % y acelera su cadencia de disparo.`,
        ctaLabel: 'Ver en Árbol de tecnología',
        action: 'techtree',
      }),
    },
    {
      id: 'T:435',
      tag: 'CÓDICE · ESTABLO',
      build: (n) => ({
        title: `La frontera de ${n.name}`,
        body: `${n.civCount} de las ${totalCivs} civilizaciones investigan ${n.name} (+20 PV a toda la caballería). Conocer cuáles NO la tienen define si conviene abrir Scouts o Caballeros.`,
        ctaLabel: 'Comparar civilizaciones',
        action: 'techtree',
      }),
    },
    {
      id: 'U:5',
      tag: 'CÓDICE · INFANTERÍA',
      build: (n) => ({
        title: `${n.name}: el freno de emergencia`,
        body: `${n.civCount} de las ${totalCivs} civilizaciones entrenan ${n.name} en Imperial — sin mejoras previas, rinde desde el primer segundo contra infantería masiva.`,
        ctaLabel: 'Ver en Árbol de tecnología',
        action: 'techtree',
      }),
    },
    {
      id: 'U:359',
      tag: 'CÓDICE · CUARTEL',
      build: (n) => ({
        title: `${totalCivs - n.civCount} civilizaciones carecen de ${n.name}`,
        body: `Aunque ${n.civCount} de ${totalCivs} civilizaciones tienen ${n.name}, las ${totalCivs - n.civCount} que se quedan en Piquero sufren mucho más al defender caballería pesada en Imperial.`,
        ctaLabel: 'Ver qué civs lo tienen',
        action: 'techtree',
      }),
    },
    {
      id: 'T:230',
      tag: 'CÓDICE · MONASTERIO',
      build: (n) => ({
        title: `${n.name} (+3 de alcance)`,
        body: `${n.civCount} de las ${totalCivs} civilizaciones tienen ${n.name}, llevando el alcance de conversión de los monjes a 12 casillas para castigar asedio a distancia.`,
        ctaLabel: 'Explorar árbol oficial',
        action: 'techtree',
      }),
    },
  ];

  for (const spec of techSpecs) {
    const node = nodes[spec.id];
    if (node && Number(node.civCount) > 0) {
      facts.push({ tag: spec.tag, nodeId: spec.id, ...spec.build(node) });
    }
  }

  const l1 = globalMeta?.ladders?.rm_1v1;
  const lt = globalMeta?.ladders?.rm_team;
  if (l1?.topMaps?.[0] && lt?.topMaps?.[0]) {
    facts.push({
      tag: 'META GLOBAL DEL LADDER',
      title: `${l1.topMaps[0].name} manda en 1v1 · ${lt.topMaps[0].name} en Team`,
      body: `En los últimos ${globalMeta.windowDays || 7} días, ${l1.topMaps[0].name} concentró el ${l1.topMaps[0].share} % de las partidas 1v1, mientras que ${lt.topMaps[0].name} lideró Team Games con ${lt.topMaps[0].share} %.`,
      ctaLabel: 'Ver tus mapas en Central',
      action: 'central',
    });
  }

  if (!facts.length) {
    return {
      tag: 'CÓDICE AOE2:DE',
      title: '56 civilizaciones oficiales listas para comparar',
      body: 'Podés abrir el Árbol de tecnología en Entrenamiento para comparar dos civilizaciones lado a lado y detectar brechas exactas antes de jugar.',
      ctaLabel: 'Abrir Árbol de tecnología',
      action: 'techtree',
    };
  }

  return facts[Math.abs(daySeed) % facts.length];
}

function buildWelcomePayload({
  globalMeta = null,
  announcement = null,
  centralCacheRaw = null,
  performanceRecords = [],
  profileId = null,
  alias = null,
  trainingDashboard = null,
  techTreeData = null,
  proMatchupDataset = undefined,
  availableUnitSlugs = null,
  showWelcomeHome = true,
  matchActive = false,
  now = new Date(),
} = {}) {
  const personal = summarizePersonalPulse({
    centralCacheRaw,
    profileId,
    alias,
    trainingDashboard,
    techTreeData,
    availableUnitSlugs,
    now,
  });
  const warLedger = summarizeWarLedger({
    performanceRecords,
    techTreeData,
    now,
  });
  const matchupData = proMatchupDataset !== undefined
    ? proMatchupDataset
    : (proMatchupEngine ? proMatchupEngine.loadProMatchupDataset() : null);
  const enrichedMeta = enrichGlobalMetaWithArt(globalMeta, techTreeData, availableUnitSlugs, matchupData);
  const cleanAnnouncement = normalizeClientAnnouncement(announcement);
  const greeting = buildGreeting({
    alias: personal.displayName || alias || '',
    now,
  });
  const curiosity = buildDailyCodexCuriosity({
    techTreeData,
    globalMeta: enrichedMeta,
    now,
  });

  // Héroe visual: tu mejor civ reciente (con >=50% WR), o si no, la #1 más jugada de la comunidad esta semana
  let heroShowcase = null;
  const bestPersonal = personal.topCiv?.bestRecent || (personal.topCiv && personal.topCiv.winRate >= 50 ? personal.topCiv : null);
  if (bestPersonal && bestPersonal.unitArt) {
    heroShowcase = {
      origin: 'personal',
      kicker: 'TU MEJOR CIV RECIENTE',
      civName: bestPersonal.name,
      slug: bestPersonal.slug,
      unitName: bestPersonal.unitName,
      unitRole: bestPersonal.unitRole,
      unitArt: bestPersonal.unitArt,
      statLine: `${bestPersonal.wins}V – ${bestPersonal.losses}D · ${bestPersonal.winRate}% WR`,
    };
  } else {
    const isTeam = personal.primaryMode === 'rm_team';
    const prefLadder = enrichedMeta?.ladders?.[personal.primaryMode] || enrichedMeta?.ladders?.rm_1v1;
    const top1 = prefLadder?.topPlayed?.[0];
    if (top1 && top1.unitArt) {
      heroShowcase = {
        origin: 'global',
        kicker: `LA MÁS JUGADA ESTA SEMANA · ${isTeam ? 'TEAM' : '1V1'}`,
        civName: top1.name,
        slug: top1.slug,
        unitName: top1.unitName,
        unitRole: top1.unitRole,
        unitArt: top1.unitArt,
        statLine: `${top1.pickRate}% de las partidas · ${top1.winRate}% WR`,
      };
    }
  }

  return {
    ok: true,
    showWelcomeHome: showWelcomeHome !== false,
    matchActive: Boolean(matchActive),
    greeting,
    personal,
    warLedger,
    heroShowcase,
    globalMeta: enrichedMeta,
    announcement: cleanAnnouncement,
    curiosity,
    generatedAt: Date.now(),
  };
}

module.exports = {
  GLOBAL_META_TTL_MS,
  ANNOUNCEMENT_TTL_MS,
  GOLD_RANKS,
  computeGoldRank,
  normalizeClientAnnouncement,
  readGlobalMetaCache,
  fetchGlobalMeta,
  readAnnouncementCache,
  fetchAnnouncement,
  lookupTopCountersForCiv,
  buildGreeting,
  resolveCivShowcase,
  summarizeWarLedger,
  summarizePersonalPulse,
  buildDailyCodexCuriosity,
  buildWelcomePayload,
};
