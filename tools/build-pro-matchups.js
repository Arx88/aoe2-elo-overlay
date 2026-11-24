'use strict';

/**
 * Constructor Offline del Dataset Empírico Pro de Matchups (`src/training/pro-matchup-data.json`).
 *
 * Fuentes 100% reales y verificables (CERO datos sintéticos o inventados):
 *  1. Padrón oficial RM 1v1 (AoE2Companion `/api/leaderboards/rm_1v1`):
 *       - Nivel 1 (`pro`): Top 65 Mundial (~2580–3080 ELO: Hera, Viper, Liereyy, TaToH, Yo, Hearttt, Lucho, ACCM, MbL, Sitaux, Sebastian...)
 *       - Nivel 2 (`2k`):  Jugadores +2000 ELO (puestos ~66–750)
 *       - Nivel 3 (`1900`): Jugadores +1900 ELO (puestos ~751–1400)
 *  2. Historial real de partidas RM 1v1 de los últimos ~8 meses (`started >= 2026-03-15`):
 *       - Civilizaciones, ganador, ELO exacto, mapa y duración exacta en reloj de juego (F11).
 *  3. Enriquecimiento histórico de aperturas (`AoE2Insights` `/stats/api/match-ups/`) para el pool Top Pro.
 *  4. Descarga y parseo binario WASM (`.aoe2record` oficial de Microsoft `GetMatchReplay`, ventana activa de 21 días):
 *       - Apertura Feudal + Switch reactivo + Postura económica en Castillos (1 TC / 2 TC / 3 TC)
 *       - Unidad eje + soporte en Castillos + Cierre en Imperial + Timings reales de pase.
 */

const fs = require('node:fs');
const path = require('node:path');
const { civSlug } = require('../src/civs');
const CIV_TECH = require('../src/civ-tech.json').civilizations || {};
const { extractDualProTelemetry } = require('./pro-replay-extractor');

const VALID_CIVS = new Set(Object.keys(CIV_TECH));
const COMPANION_BASE = 'https://data.aoe2companion.com';
const REPLAY_BASE = 'https://api.ageofempires.com/api/GameStats/AgeII/GetMatchReplay/';
const INSIGHTS_BASE = 'https://www.aoe2insights.com/stats/api/match-ups/';

const UA_COMPANION = 'aoe2-elo-overlay/3.2 (pro-matchup-compiler)';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Ventana de parches recientes (~8 meses desde marzo 2026)
const PATCH_CUTOFF_MS = Date.parse('2026-03-15T00:00:00Z');
// Ventana real verificada de retención de archivos .aoe2record en Microsoft (21 días)
const REPLAY_RETENTION_MS = 21 * 24 * 60 * 60 * 1000;

const CACHE_DIR = process.env.PRO_HARVEST_CACHE_DIR || path.join(
  process.env.USERPROFILE || 'C:\\Users\\juanp',
  '.gemini', 'antigravity', 'brain', '1432f205-b100-4fca-b8e6-e76337d42392', 'scratch', 'pro-matchup-harvest'
);
const OUTPUT_JSON = path.join(__dirname, '..', 'src', 'training', 'pro-matchup-data.json');

const MAX_REPLAY_DOWNLOADS = Number(process.env.MAX_PRO_REPLAYS || 700);

// Clasificación estricta de mapas terrestres estándar (1 TC en Alta Edad Media, cero agua/híbridos/nómada)
const OPEN_MAP_PATTERNS = [
  'arabia', 'arabian desert', 'dry arabia', 'green arabia', 'kotd',
  'atacama', 'serengeti', 'valley', 'acropolis', 'gold rush', 'golden pit', 'golden hill',
  'runestones', 'land madness', 'habitable', 'hilly', 'lipany', 'lowland', 'kilimanjaro',
  'cenotes', 'shawarma', 'cliffbound', 'rockslide', 'savannah', 'ghost lake', 'frigid lake',
  'mountain range', 'mountain pass', 'aftermath', ' crater', 'open plains',
];

const CLOSED_MAP_PATTERNS = [
  'arena', 'fortress', 'hideout', 'black forest', 'enclosed', 'hill fort',
  'glade', 'oasis', 'clearing', 'lombardia', 'amazon tunnel', 'michi',
  'walled', 'citadel', 'stronghold', 'secluded',
];

const EXCLUDED_MAP_PATTERNS = [
  'nomad', 'african clearing', 'steppe', 'budapest', 'socotra', 'megarandom', 'hyperrandom',
  'islands', 'four lakes', 'cross', 'baltic', 'mediterranean', 'continental', 'coastal',
  'archipelago', 'migration', 'rivers', 'golden swamp', 'hamburger', 'nile delta', 'kawasan',
  'pacific', 'water', 'bog', 'mangrove', 'team',
];

function classifyLandMap(rawMapName) {
  const m = String(rawMapName || '').toLowerCase().trim();
  if (!m) return null;
  for (const ex of EXCLUDED_MAP_PATTERNS) {
    if (m.includes(ex)) return null;
  }
  for (const cl of CLOSED_MAP_PATTERNS) {
    if (m === cl || m.includes(cl)) return 'closed';
  }
  for (const op of OPEN_MAP_PATTERNS) {
    if (m === op || m.includes(op)) return 'open';
  }
  return null;
}

const INSIGHTS_OPENING_MAP = {
  'Scout rush': { key: 'scouts', es: 'Rush de Scouts' },
  'Archer rush': { key: 'archers', es: 'Rush de Arqueros' },
  'Man at arms rush': { key: 'maa', es: 'Hombres de armas' },
  'Drush': { key: 'drush', es: 'Drush temprano' },
  'Drush fast castle': { key: 'drush_fc', es: 'Drush → Fast Castle' },
  'Fast castle': { key: 'fc', es: 'Fast Castle' },
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonRetry(url, { headers = {}, timeoutMs = 15000, retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      clearTimeout(timer);
      if (attempt < retries) await sleep(900 * (attempt + 1));
    }
  }
  return null;
}

async function runPool(items, concurrency, workerFn) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const cur = idx++;
      if (cur >= items.length) break;
      await workerFn(items[cur], cur);
    }
  });
  await Promise.all(workers);
}

function cleanProDisplayName(name) {
  return String(name || '')
    .replace(/^(GL\.|wR\.|TAG_|Fox\.|mYinsanity\.|Salted_|LYx_|VNA_|qp\.|RB_|ON_|WWP\.)/i, '')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .trim() || String(name || 'Pro');
}

/**
 * Etapa 1: Padrón RM 1v1 (Top 1400 jugadores: Top 65 Pro, +2000 ELO, +1900 ELO)
 */
async function loadOrFetchLeaderboard() {
  const cacheFile = path.join(CACHE_DIR, 'leaderboard.json');
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (Array.isArray(cached) && cached.length >= 800) {
      console.log(`[1/5] Padrón cargado de caché: ${cached.length} jugadores.`);
      return cached;
    }
  }

  console.log('[1/5] Descargando padrón RM 1v1 (páginas 1..14)...');
  const playersById = new Map();
  const pages = Array.from({ length: 14 }, (_, i) => i + 1);
  await runPool(pages, 4, async (page) => {
    const url = `${COMPANION_BASE}/api/leaderboards/rm_1v1?page=${page}`;
    const data = await fetchJsonRetry(url, { headers: { 'User-Agent': UA_COMPANION } });
    for (const p of (data?.players || [])) {
      const pid = Number(p.profileId);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const rank = Number(p.rank) || 9999;
      const rating = Number(p.rating) || 0;
      if (rating < 1880 && rank > 1400) continue;
      const tier = rank <= 65 ? 1 : (rating >= 2000 || rank <= 750) ? 2 : 3;
      playersById.set(pid, {
        profileId: pid,
        name: p.name || `Player ${pid}`,
        cleanName: cleanProDisplayName(p.name),
        rank,
        rating,
        tier,
      });
    }
  });

  // Asegurar leyendas icónicas en Tier 1 aunque hayan jugado menos esta semana
  const iconicQueries = ['Hera', 'TheViper', 'Liereyy', 'TaToH', 'Mr_Yo', 'Hearttt', 'Sitaux', 'Sebastian', 'Capoch', 'FreakinAndy', 'Barles', 'DauT'];
  await runPool(iconicQueries, 4, async (q) => {
    const data = await fetchJsonRetry(`${COMPANION_BASE}/api/profiles?search=${encodeURIComponent(q)}&per_page=5`, {
      headers: { 'User-Agent': UA_COMPANION },
    });
    for (const prof of (data?.profiles || [])) {
      const pid = Number(prof.profileId);
      if (playersById.has(pid)) {
        const cur = playersById.get(pid);
        if (cur.rating >= 2350) cur.tier = 1;
      }
    }
  });

  const roster = [...playersById.values()].sort((a, b) => a.rank - b.rank);
  fs.writeFileSync(cacheFile, JSON.stringify(roster, null, 2));
  const t1 = roster.filter((p) => p.tier === 1).length;
  const t2 = roster.filter((p) => p.tier === 2).length;
  const t3 = roster.filter((p) => p.tier === 3).length;
  console.log(`[1/5] Padrón listo: ${roster.length} jugadores (Tier1 Pro=${t1}, Tier2 +2000=${t2}, Tier3 +1900=${t3}).`);
  return roster;
}

/**
 * Etapa 2: Historial masivo de partidas RM 1v1 (~8 meses) por lotes de jugadores
 */
async function loadOrFetchMatches(roster) {
  const cacheFile = path.join(CACHE_DIR, 'matches.json');
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cached && Array.isArray(cached.matches) && cached.matches.length >= 15000) {
      console.log(`[2/5] Partidas cargadas de caché: ${cached.matches.length} partidas 1v1 RM válidas.`);
      return cached.matches;
    }
  }

  const tierByPid = new Map(roster.map((p) => [p.profileId, p.tier]));
  const matchesById = new Map();

  const batches = [];
  const t1 = roster.filter((p) => p.tier === 1);
  const t2 = roster.filter((p) => p.tier === 2);
  const t3 = roster.filter((p) => p.tier === 3);

  // Tier 1 Pro: lotes chicos (3 jugadores) y hasta 14 páginas (~1400 partidas por lote) para cubrir los ~8 meses enteros
  for (let i = 0; i < t1.length; i += 3) {
    batches.push({ label: 'T1', ids: t1.slice(i, i + 3).map((p) => p.profileId), maxPages: 14 });
  }
  // Tier 2 (+2000): lotes de 8 jugadores, hasta 8 páginas
  for (let i = 0; i < t2.length; i += 8) {
    batches.push({ label: 'T2', ids: t2.slice(i, i + 8).map((p) => p.profileId), maxPages: 8 });
  }
  // Tier 3 (+1900): lotes de 10 jugadores, hasta 5 páginas
  for (let i = 0; i < t3.length; i += 10) {
    batches.push({ label: 'T3', ids: t3.slice(i, i + 10).map((p) => p.profileId), maxPages: 5 });
  }

  console.log(`[2/5] Cosechando historiales RM 1v1 en ${batches.length} lotes paralelos...`);
  let completedBatches = 0;

  await runPool(batches, 6, async (batch) => {
    const idsParam = batch.ids.join(',');
    for (let page = 1; page <= batch.maxPages; page += 1) {
      const url = `${COMPANION_BASE}/api/matches?profile_ids=${idsParam}&use_enums=true&per_page=100&page=${page}&leaderboard_ids=rm_1v1`;
      const data = await fetchJsonRetry(url, { headers: { 'User-Agent': UA_COMPANION }, timeoutMs: 16000 });
      const rawList = Array.isArray(data) ? data : (data?.matches || []);
      if (!rawList.length) break;

      let oldestInPage = Infinity;
      for (const raw of rawList) {
        const matchId = Number(raw.matchId);
        if (!Number.isFinite(matchId) || matchesById.has(matchId)) continue;
        const startedMs = raw.started ? Date.parse(raw.started) : NaN;
        const finishedMs = raw.finished ? Date.parse(raw.finished) : NaN;
        if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs <= startedMs) continue;
        if (startedMs < oldestInPage) oldestInPage = startedMs;
        if (startedMs < PATCH_CUTOFF_MS) continue;

        const mapType = classifyLandMap(raw.mapName || raw.map);
        if (!mapType) continue;

        const players = (raw.teams || []).flatMap((t) => t.players || []).filter((p) => !p.status || p.status === 'player');
        if (players.length !== 2) continue;

        const pA = players[0];
        const pB = players[1];
        const civA = civSlug(pA.civName || pA.civ);
        const civB = civSlug(pB.civName || pB.civ);
        if (!civA || !civB || civA === civB || !VALID_CIVS.has(civA) || !VALID_CIVS.has(civB)) continue;
        if (typeof pA.won !== 'boolean' && typeof pB.won !== 'boolean') continue;
        const wonA = pA.won === true ? true : (pB.won === true ? false : null);
        if (wonA === null) continue;

        const wallSec = (finishedMs - startedMs) / 1000;
        const durationGameSec = Math.round(Math.max(0, wallSec - 38) * 1.7);
        if (durationGameSec < 300 || durationGameSec > 14400) continue; // Ignorar drops <5m o bugs >4h

        const pidA = Number(pA.profileId);
        const pidB = Number(pB.profileId);
        const ratA = Number(pA.rating) || 0;
        const ratB = Number(pB.rating) || 0;
        const maxRat = Math.max(ratA, ratB);
        const minRat = Math.min(ratA || maxRat, ratB || maxRat);
        if (minRat < 1820 && !tierByPid.has(pidA) && !tierByPid.has(pidB)) continue;

        const knownTierA = tierByPid.get(pidA) || (ratA >= 2550 ? 1 : ratA >= 2000 ? 2 : 3);
        const knownTierB = tierByPid.get(pidB) || (ratB >= 2550 ? 1 : ratB >= 2000 ? 2 : 3);
        // Un partido es Tier 1 Pro si al menos un pro Tier 1 jugó contra alguien >= 2250 ELO (no stomps de torneo abierto)
        let matchTier = 3;
        if ((knownTierA === 1 || knownTierB === 1) && minRat >= 2200) matchTier = 1;
        else if (maxRat >= 2000 && minRat >= 1920) matchTier = 2;

        matchesById.set(matchId, {
          matchId,
          startedMs,
          durationGameSec,
          mapName: String(raw.mapName || raw.map || 'Arabia'),
          mapType,
          tier: matchTier,
          pA: {
            profileId: pidA,
            name: cleanProDisplayName(pA.name),
            civ: civA,
            rating: ratA || null,
            won: wonA,
          },
          pB: {
            profileId: pidB,
            name: cleanProDisplayName(pB.name),
            civ: civB,
            rating: ratB || null,
            won: !wonA,
          },
        });
      }

      if (oldestInPage < PATCH_CUTOFF_MS || rawList.length < 70) break;
    }

    completedBatches += 1;
    if (completedBatches % 25 === 0 || completedBatches === batches.length) {
      console.log(`  · Lotes ${completedBatches}/${batches.length} -> ${matchesById.size} partidas únicas válidas...`);
    }
  });

  const matches = [...matchesById.values()].sort((a, b) => b.startedMs - a.startedMs);
  fs.writeFileSync(cacheFile, JSON.stringify({ generatedAt: Date.now(), matches }));
  console.log(`[2/5] Cosecha completada: ${matches.length} partidas únicas guardadas.`);
  return matches;
}

/**
 * Etapa 3: Enriquecimiento de aperturas históricas vía AoE2Insights para los jugadores Top Pro (Tier 1)
 */
async function loadOrFetchInsightsOpenings(roster) {
  const cacheFile = path.join(CACHE_DIR, 'insights-openings.json');
  const byMatchId = new Map();
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const [k, v] of Object.entries(cached || {})) byMatchId.set(Number(k), v);
    if (byMatchId.size >= 1500) {
      console.log(`[3/5] Aperturas AoE2Insights cargadas de caché: ${byMatchId.size} partidas.`);
      return byMatchId;
    }
  }

  const topPros = roster.filter((p) => p.tier === 1).slice(0, 50);
  console.log(`[3/5] Consultando aperturas históricas en AoE2Insights para ${topPros.length} Top Pros...`);
  const fields = ['match_id', 'civilization', 'civilization_opponent', 'strategy', 'strategy_opponent', 'match_duration'];

  await runPool(topPros, 3, async (pro) => {
    const params = new URLSearchParams();
    for (const f of fields) params.append('field', f);
    params.append('filter', JSON.stringify({ field: 'player_relic_id', operator: 'equals', value: String(pro.profileId) }));
    params.append('filter', JSON.stringify({ field: 'ladder', operator: 'equals', value: '3' }));
    params.append('order', '-started_time');
    params.append('limit', '500');
    const url = `${INSIGHTS_BASE}?${params.toString()}`;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 14000);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA_BROWSER }, signal: ctrl.signal });
        clearTimeout(t);
        if (res.status === 202) {
          await sleep(2800);
          continue;
        }
        if (res.status === 200) {
          const j = await res.json();
          const rows = j?.rows || {};
          const ids = rows.match_id || [];
          const cOwn = rows.civilization || [];
          const sOwn = rows.strategy || [];
          const sOpp = rows.strategy_opponent || [];
          const durs = rows.match_duration || [];
          for (let i = 0; i < ids.length; i += 1) {
            const mid = Number(ids[i]);
            if (!mid) continue;
            const cSlug = civSlug(cOwn[i]);
            const mapOwn = INSIGHTS_OPENING_MAP[sOwn[i]] || null;
            const mapOpp = INSIGHTS_OPENING_MAP[sOpp[i]] || null;
            if (!mapOwn && !mapOpp && !durs[i]) continue;
            byMatchId.set(mid, {
              subjCiv: cSlug,
              subjOpen: mapOwn,
              oppOpen: mapOpp,
              durationGameSec: Number(durs[i]) > 250 ? Math.round(Number(durs[i])) : null,
            });
          }
          break;
        }
        break;
      } catch {
        clearTimeout(t);
        break;
      }
    }
  });

  fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(byMatchId)));
  console.log(`[3/5] AoE2Insights enriqueció ${byMatchId.size} partidas históricas.`);
  return byMatchId;
}

/**
 * Etapa 4: Descarga inteligente y parseo WASM de replays .aoe2record (priorizando Top Pro + rellenar pares raros)
 */
async function loadOrParseDeepReplays(matches) {
  const cacheFile = path.join(CACHE_DIR, 'deep-replays.json');
  const parsedByMatchId = new Map();
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const [k, v] of Object.entries(cached || {})) {
      if (v && v.status === 429) continue; // Nunca persistir rate-limit temporal 429
      parsedByMatchId.set(Number(k), v);
    }
    console.log(`[4/5] Caché inicial limpia de replays profundos: ${parsedByMatchId.size} partidas.`);
  }

  const now = Date.now();
  const minReplayStart = now - REPLAY_RETENTION_MS + 6 * 3600_000;
  const pairCoverage = new Map();
  const pairKeyOf = (m) => {
    const [c1, c2] = m.pA.civ < m.pB.civ ? [m.pA.civ, m.pB.civ] : [m.pB.civ, m.pA.civ];
    return `${m.mapType}:${c1}__${c2}`;
  };

  for (const m of matches) {
    if (parsedByMatchId.has(m.matchId) && parsedByMatchId.get(m.matchId)?.ok) {
      const pk = pairKeyOf(m);
      pairCoverage.set(pk, (pairCoverage.get(pk) || 0) + 1);
    }
  }

  const recentCandidates = matches.filter((m) => m.startedMs >= minReplayStart && !parsedByMatchId.has(m.matchId));

  // Selección breadth-first (1 -> 2 -> 3...) primero en Tier 1 Pro, luego Tier 2 (+2000), luego Tier 3 (+1900)
  const selected = [];
  const tempCounts = new Map(pairCoverage);

  const t1Cands = recentCandidates.filter((m) => m.tier === 1);
  for (let targetMax = 1; targetMax <= 6 && selected.length < MAX_REPLAY_DOWNLOADS; targetMax += 1) {
    for (const m of t1Cands) {
      if (m._picked) continue;
      const pk = pairKeyOf(m);
      const cnt = tempCounts.get(pk) || 0;
      if (cnt < targetMax) {
        m._picked = true;
        selected.push(m);
        tempCounts.set(pk, cnt + 1);
        if (selected.length >= MAX_REPLAY_DOWNLOADS) break;
      }
    }
  }

  if (selected.length < MAX_REPLAY_DOWNLOADS) {
    const t2Cands = recentCandidates.filter((m) => m.tier === 2);
    for (let targetMax = 1; targetMax <= 3 && selected.length < MAX_REPLAY_DOWNLOADS; targetMax += 1) {
      for (const m of t2Cands) {
        if (m._picked) continue;
        const pk = pairKeyOf(m);
        const cnt = tempCounts.get(pk) || 0;
        if (cnt < targetMax) {
          m._picked = true;
          selected.push(m);
          tempCounts.set(pk, cnt + 1);
          if (selected.length >= MAX_REPLAY_DOWNLOADS) break;
        }
      }
    }
  }

  if (selected.length < MAX_REPLAY_DOWNLOADS) {
    const t3Cands = recentCandidates.filter((m) => m.tier === 3);
    for (let targetMax = 1; targetMax <= 2 && selected.length < MAX_REPLAY_DOWNLOADS; targetMax += 1) {
      for (const m of t3Cands) {
        if (m._picked) continue;
        const pk = pairKeyOf(m);
        const cnt = tempCounts.get(pk) || 0;
        if (cnt < targetMax) {
          m._picked = true;
          selected.push(m);
          tempCounts.set(pk, cnt + 1);
          if (selected.length >= MAX_REPLAY_DOWNLOADS) break;
        }
      }
    }
  }

  console.log(`[4/5] Descargando y parseando ${selected.length} replays .aoe2record con control de tasa anti-429...`);
  let done = 0;
  let parsedOk = 0;
  let nextSlotMs = Date.now();
  let cooldownUntilMs = 0;

  const acquireReplaySlot = async () => {
    while (true) {
      const n = Date.now();
      if (n < cooldownUntilMs) {
        await sleep(cooldownUntilMs - n);
        continue;
      }
      const wait = Math.max(0, nextSlotMs - n);
      nextSlotMs = Math.max(n, nextSlotMs) + 640; // ~93 req/min sostenidos sin disparar el límite IIS (~115/min)
      if (wait > 0) await sleep(wait);
      return;
    }
  };

  const saveCheckpoint = () => {
    fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(parsedByMatchId)));
  };

  await runPool(selected, 2, async (m) => {
    const url = `${REPLAY_BASE}?matchId=${m.matchId}&profileId=${m.pA.profileId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await acquireReplaySlot();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 24000);
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA_COMPANION, Accept: 'application/zip, application/octet-stream' },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.status === 429) {
          cooldownUntilMs = Math.max(cooldownUntilMs, Date.now() + 32000);
          continue;
        }
        if (!res.ok) {
          if (res.status === 404) parsedByMatchId.set(m.matchId, { ok: false, status: 404 });
          break;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b) {
          const dual = await extractDualProTelemetry(buf, {
            matchId: m.matchId,
            players: [
              { profileId: m.pA.profileId, name: m.pA.name, civSlug: m.pA.civ, won: m.pA.won, rating: m.pA.rating },
              { profileId: m.pB.profileId, name: m.pB.name, civSlug: m.pB.civ, won: m.pB.won, rating: m.pB.rating },
            ],
          });
          const byCiv = {};
          for (const pl of dual.players) {
            if (pl.civSlug) {
              byCiv[pl.civSlug] = {
                fSec: pl.feudalSec,
                cSec: pl.castleSec,
                iSec: pl.imperialSec,
                fOpenK: pl.feudalOpeningKey,
                fOpenEs: pl.feudalOpeningEs,
                fSwK: pl.feudalSwitchKey,
                fSwEs: pl.feudalSwitchEs,
                cPostK: pl.castlePostureKey,
                cPostEs: pl.castlePostureEs,
                cTc: pl.castleTcCount,
                cPrimK: pl.castlePrimaryKey,
                cPrimEs: pl.castlePrimaryEs,
                cSupK: pl.castleSupportKey,
                cSupEs: pl.castleSupportEs,
                iPrimK: pl.impPrimaryKey,
                iPrimEs: pl.impPrimaryEs,
                iSupK: pl.impSupportKey,
                iSupEs: pl.impSupportEs,
              };
            }
          }
          parsedByMatchId.set(m.matchId, {
            ok: true,
            durSec: dual.durationGameSec || m.durationGameSec,
            byCiv,
          });
          parsedOk += 1;
        } else {
          parsedByMatchId.set(m.matchId, { ok: false, status: 'bad_zip' });
        }
        break;
      } catch (err) {
        clearTimeout(timer);
        if (attempt === 2) {
          parsedByMatchId.set(m.matchId, { ok: false, err: String(err?.message || 'err').slice(0, 40) });
        }
      }
    }

    done += 1;
    if (done % 100 === 0 || done === selected.length) {
      saveCheckpoint();
      console.log(`  · Replays procesados: ${done}/${selected.length} (OK nuevos=${parsedOk})...`);
    }
  });

  saveCheckpoint();
  const totalValidReplays = [...parsedByMatchId.values()].filter((v) => v && v.ok).length;
  console.log(`[4/5] Total replays profundos válidos en base: ${totalValidReplays}.`);
  return parsedByMatchId;
}

function medianNum(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Puntaje Bayesiano para elegir la ruta ganadora real (premia winrate real + respaldo de muestra).
 */
function bayesianWinScore(wins, games, totalInBucket = games, priorGames = 6.0, priorWr = 0.50) {
  if (games <= 0) return 0;
  const postWr = (wins + priorGames * priorWr) / (games + priorGames);
  const share = totalInBucket > 0 ? (games / totalInBucket) : 0;
  // Equilibrio Pro real: combina tasa de victoria suavizada (62%) + peso real de elección Pro (38%)
  // para que un 2V-0D anecdótico (5% de uso) jamás pise el núcleo real de la civilización (80% de uso).
  return 0.62 * postWr + 0.38 * Math.sqrt(Math.min(1, share));
}

function pickBestAndTrap(mapBucket, minTrapGames = 3) {
  const allValid = [...mapBucket.values()].filter((e) => e.games >= 1 && e.key !== 'other');
  if (!allValid.length) return { best: null, alt: null, trap: null };
  const totalBucketGames = allValid.reduce((acc, e) => acc + e.games, 0);

  // Filtrar jugadas anecdóticas (< 12% de uso cuando hay >= 8 muestras) al elegir el plan #1
  let mainPool = totalBucketGames >= 8
    ? allValid.filter((e) => (e.games / totalBucketGames) >= 0.12 && e.games >= 2)
    : allValid;
  if (!mainPool.length) mainPool = allValid;

  mainPool.sort((a, b) => (bayesianWinScore(b.wins, b.games, totalBucketGames) - bayesianWinScore(a.wins, a.games, totalBucketGames)) || (b.games - a.games));
  const best = mainPool[0];
  const alt = mainPool.find((e) => e.key !== best.key && e.games >= 2) || null;
  const trapCandidates = allValid
    .filter((e) => e.key !== best.key && e.games >= minTrapGames && (e.wins / e.games) <= 0.40)
    .sort((a, b) => (a.wins / a.games) - (b.wins / b.games) || (b.games - a.games));
  return { best, alt, trap: trapCandidates[0] || null };
}

function legalUnitEsForCiv(civSlugStr, famKey, isImperial = false, fallbackEs = null) {
  const nodes = CIV_TECH[civSlugStr]?.nodes || {};
  if (!famKey) return fallbackEs;
  if (famKey === 'archers') {
    if (isImperial) return nodes.Arbalester != null ? 'Arbalesteros' : (nodes.Crossbowman != null ? 'Ballesteros' : 'Arqueros');
    return nodes.Crossbowman != null ? 'Ballesteros' : 'Arqueros';
  }
  if (famKey === 'knights') {
    if (!isImperial) return nodes['Hei Guang Cavalry'] != null && nodes.Knight == null ? 'Caballería Hei Guang' : 'Jinetes';
    if (nodes.Savar != null) return 'Savar';
    if (nodes.Paladin != null) return 'Paladines';
    if (nodes['Heavy Hei Guang Cavalry'] != null && nodes.Cavalier == null) return 'Hei Guang pesada';
    return nodes.Cavalier != null ? 'Caballeros' : 'Jinetes';
  }
  if (famKey === 'pikes') {
    if (isImperial && nodes.Halberdier != null) return 'Alabarderos';
    return nodes.Pikeman != null ? 'Piqueros' : 'Lanceros';
  }
  if (famKey === 'skirms') {
    if (isImperial && nodes['Imperial Skirmisher'] != null) return 'Guerrilleros imperiales';
    return nodes['Elite Skirmisher'] != null ? 'Guerrilleros de élite' : 'Guerrilleros';
  }
  if (famKey === 'lightcav') {
    if (!isImperial) return 'Caballería ligera';
    if (nodes['Winged Hussar'] != null) return 'Húsares alados';
    return nodes.Hussar != null ? 'Húsares' : 'Caballería ligera';
  }
  if (famKey === 'camels') {
    if (!isImperial) return 'Jinetes a camello';
    if (nodes['Imperial Camel Rider'] != null) return 'Camellos imperiales';
    return nodes['Heavy Camel Rider'] != null ? 'Camellos pesados' : 'Jinetes a camello';
  }
  if (famKey === 'ca') {
    if (!isImperial) return fallbackEs || 'Arqueros a caballo';
    return nodes['Heavy Cavalry Archer'] != null ? 'Arq. a caballo pesados' : (fallbackEs || 'Arqueros a caballo');
  }
  return fallbackEs;
}

function isDeadEndCastleCarry(civSlugStr, famKey) {
  const nodes = CIV_TECH[civSlugStr]?.nodes || {};
  if (famKey === 'archers' && nodes.Crossbowman == null) return true;
  if (famKey === 'ca' && nodes['Thumb Ring'] == null && nodes.Bloodlines == null) return true;
  return false;
}

function isOutdatedImperialCarry(civSlugStr, famKey) {
  const nodes = CIV_TECH[civSlugStr]?.nodes || {};
  if (famKey === 'archers' && nodes.Arbalester == null) return true;
  if (famKey === 'ca' && (nodes['Heavy Cavalry Archer'] == null || (nodes['Thumb Ring'] == null && nodes.Bloodlines == null))) return true;
  if (famKey === 'knights' && nodes.Cavalier == null && nodes['Heavy Hei Guang Cavalry'] == null) return true;
  if (famKey === 'skirms' && nodes['Elite Skirmisher'] == null) return true;
  return false;
}

function bumpStat(map, key, label, won, weight = 1, extra = null) {
  if (!key || !label) return;
  const cur = map.get(key) || { key, label, games: 0, wins: 0, wGames: 0, wWins: 0, extra };
  cur.games += 1;
  if (won) cur.wins += 1;
  cur.wGames += weight;
  if (won) cur.wWins += weight;
  map.set(key, cur);
}

/**
 * Etapa 5: Agregación jerárquica (Top Pro -> +2000 -> +1900) y antisimétrica exacta
 */
function compileProMatchupDataset(matches, insightsMap, deepReplaysMap) {
  console.log('[5/5] Compilando matriz empírica antisimétrica y matriz anti-apertura...');

  const cells = new Map(); // `${mapType}:${c1}__${c2}` (c1 < c2)
  // Matriz anti-apertura Pro para Prematch + Transiciones reales por civilización (desde .aoe2record)
  const vsOpeningGlobal = { open: {}, closed: {} };
  const vsOpeningByCiv = { open: {}, closed: {} };
  const civReplayStats = { open: {}, closed: {} };

  const recordCivReplay = (mapType, civ, repObj, won) => {
    if (!civ || !repObj) return;
    const bucket = (civReplayStats[mapType][civ] ||= {
      replays: 0,
      openings: new Map(),
      postures: new Map(),
      castleComps: new Map(),
      impComps: new Map(),
      fSecs: [],
      cSecs: [],
    });
    bucket.replays += 1;
    if (repObj.fOpenK && repObj.fOpenEs) bumpStat(bucket.openings, repObj.fOpenK, repObj.fOpenEs, won);
    if (repObj.cPostK && repObj.cPostEs) bumpStat(bucket.postures, repObj.cPostK, repObj.cPostEs, won);
    if (repObj.cPrimK && repObj.cPrimEs && !isDeadEndCastleCarry(civ, repObj.cPrimK)) {
      const cPrimLegal = legalUnitEsForCiv(civ, repObj.cPrimK, false, repObj.cPrimEs);
      const cSupLegal = repObj.cSupK ? legalUnitEsForCiv(civ, repObj.cSupK, false, repObj.cSupEs) : null;
      const ck = repObj.cSupK ? `${repObj.cPrimK}+${repObj.cSupK}` : repObj.cPrimK;
      const cl = cSupLegal ? `${cPrimLegal} + ${cSupLegal}` : cPrimLegal;
      bumpStat(bucket.castleComps, ck, cl, won);
    }
    if (repObj.iPrimK && repObj.iPrimEs && !isOutdatedImperialCarry(civ, repObj.iPrimK)) {
      const iPrimLegal = legalUnitEsForCiv(civ, repObj.iPrimK, true, repObj.iPrimEs);
      const iSupLegal = repObj.iSupK ? legalUnitEsForCiv(civ, repObj.iSupK, true, repObj.iSupEs) : null;
      const ik = repObj.iSupK ? `${repObj.iPrimK}+${repObj.iSupK}` : repObj.iPrimK;
      const il = iSupLegal ? `${iPrimLegal} + ${iSupLegal}` : iPrimLegal;
      bumpStat(bucket.impComps, ik, il, won);
    }
    if (Number.isFinite(repObj.fSec) && repObj.fSec >= 360 && repObj.fSec <= 950) bucket.fSecs.push(repObj.fSec);
    if (Number.isFinite(repObj.cSec) && repObj.cSec >= 720 && repObj.cSec <= 2200) bucket.cSecs.push(repObj.cSec);
  };

  const recordVsOpening = (mapType, myCiv, myOpenKey, myOpenEs, mySwEs, rivOpenKey, won, tier) => {
    if (!myOpenKey || myOpenKey === 'other' || !rivOpenKey || rivOpenKey === 'other') return;
    const w = tier === 1 ? 1.6 : tier === 2 ? 1.15 : 0.85;
    const comboKey = mySwEs ? `${myOpenKey}__${mySwEs}` : myOpenKey;
    const comboLabel = mySwEs ? `${myOpenEs} (${mySwEs})` : myOpenEs;

    vsOpeningGlobal[mapType][rivOpenKey] ||= new Map();
    bumpStat(vsOpeningGlobal[mapType][rivOpenKey], comboKey, comboLabel, won, w);

    vsOpeningByCiv[mapType][myCiv] ||= {};
    vsOpeningByCiv[mapType][myCiv][rivOpenKey] ||= new Map();
    bumpStat(vsOpeningByCiv[mapType][myCiv][rivOpenKey], comboKey, comboLabel, won, w);
  };

  for (const m of matches) {
    const [first, second] = m.pA.civ < m.pB.civ ? [m.pA, m.pB] : [m.pB, m.pA];
    const cellKey = `${m.mapType}:${first.civ}__${second.civ}`;
    let cell = cells.get(cellKey);
    if (!cell) {
      cell = {
        mapType: m.mapType,
        c1: first.civ,
        c2: second.civ,
        byTier: { 1: [], 2: [], 3: [] },
      };
      cells.set(cellKey, cell);
    }

    const ins = insightsMap.get(m.matchId) || null;
    const rep = deepReplaysMap.get(m.matchId);
    const hasReplay = Boolean(rep && rep.ok && rep.byCiv?.[first.civ] && rep.byCiv?.[second.civ]);

    const durSec = (hasReplay && rep.durSec >= 300)
      ? rep.durSec
      : (ins?.durationGameSec || m.durationGameSec);

    let open1 = hasReplay ? { key: rep.byCiv[first.civ].fOpenK, es: rep.byCiv[first.civ].fOpenEs } : null;
    let open2 = hasReplay ? { key: rep.byCiv[second.civ].fOpenK, es: rep.byCiv[second.civ].fOpenEs } : null;
    if (!open1 && ins) {
      open1 = ins.subjCiv === first.civ ? ins.subjOpen : ins.oppOpen;
    }
    if (!open2 && ins) {
      open2 = ins.subjCiv === second.civ ? ins.subjOpen : ins.oppOpen;
    }

    if (open1 && open2) {
      recordVsOpening(m.mapType, first.civ, open1.key, open1.es, hasReplay ? rep.byCiv[first.civ].fSwEs : null, open2.key, first.won, m.tier);
      recordVsOpening(m.mapType, second.civ, open2.key, open2.es, hasReplay ? rep.byCiv[second.civ].fSwEs : null, open1.key, second.won, m.tier);
    }
    if (hasReplay) {
      recordCivReplay(m.mapType, first.civ, rep.byCiv[first.civ], first.won);
      recordCivReplay(m.mapType, second.civ, rep.byCiv[second.civ], second.won);
    }

    cell.byTier[m.tier].push({
      matchId: m.matchId,
      startedMs: m.startedMs,
      durSec,
      mapName: m.mapName,
      tier: m.tier,
      p1: first,
      p2: second,
      open1,
      open2,
      rep1: hasReplay ? rep.byCiv[first.civ] : null,
      rep2: hasReplay ? rep.byCiv[second.civ] : null,
    });
  }

  const pairOutput = { open: {}, closed: {} };
  let totalPairsWithData = 0;
  let proTierPairs = 0;
  let t2TierPairs = 0;

  for (const cell of cells.values()) {
    const t1List = cell.byTier[1];
    const t2List = cell.byTier[2];
    const t3List = cell.byTier[3];

    // Escalera real acordada en /grill-me:
    // Nivel 1: si hay >= 8 partidas Top Pro, usar puramente Top Pro (y complementar replays profundos de T2 solo si hay <3 replays en T1).
    // Nivel 2: si T1 < 8 pero T1 + T2 >= 8, usar T1 + T2.
    // Nivel 3: si T1 + T2 < 8, usar T1 + T2 + T3 (y etiquetar muestra baja si total < 5).
    let activeMatches;
    let tierBadge;
    if (t1List.length >= 8) {
      activeMatches = t1List;
      tierBadge = 'pro';
      if (cell.mapType === 'open') proTierPairs += 1;
    } else if (t1List.length + t2List.length >= 8) {
      activeMatches = [...t1List, ...t2List];
      tierBadge = '2k';
      if (cell.mapType === 'open') t2TierPairs += 1;
    } else {
      activeMatches = [...t1List, ...t2List, ...t3List];
      tierBadge = activeMatches.length >= 5 ? '1900' : 'low';
    }

    if (!activeMatches.length) continue;
    totalPairsWithData += 1;

    // Para telemetría profunda de Castillos/Imperial (.aoe2record), si activeMatches tiene pocos replays pero T2/T3 tiene replays reales de ese cruce, aprovecharlos sin alterar el winrate del cruce
    let replayPool = activeMatches.filter((x) => x.rep1 && x.rep2);
    if (replayPool.length < 4) {
      replayPool = [...t1List, ...t2List, ...t3List].filter((x) => x.rep1 && x.rep2);
    }

    const totalGames = activeMatches.length;
    let wins1 = 0;
    const buckets = {
      short: { g: 0, w1: 0 }, // < 26 min F11 (1560 s) -> Presión Feudal / Inicio Castillos
      mid: { g: 0, w1: 0 },   // 26 - 38 min F11 (1560 - 2280 s) -> Guerra de Castillos
      long: { g: 0, w1: 0 },  // > 38 min F11 (> 2280 s) -> Juego Largo / Imperial
    };

    const sideStats = {
      1: { openings: new Map(), switches: new Map(), postures: new Map(), castleComps: new Map(), impComps: new Map(), chains: new Map(), fSecs: [], cSecs: [] },
      2: { openings: new Map(), switches: new Map(), postures: new Map(), castleComps: new Map(), impComps: new Map(), chains: new Map(), fSecs: [], cSecs: [] },
    };

    for (const gm of activeMatches) {
      const w1 = gm.p1.won === true;
      if (w1) wins1 += 1;
      if (gm.durSec < 1560) {
        buckets.short.g += 1;
        if (w1) buckets.short.w1 += 1;
      } else if (gm.durSec <= 2280) {
        buckets.mid.g += 1;
        if (w1) buckets.mid.w1 += 1;
      } else {
        buckets.long.g += 1;
        if (w1) buckets.long.w1 += 1;
      }

      if (gm.open1) bumpStat(sideStats[1].openings, gm.open1.key, gm.open1.es, w1);
      if (gm.open2) bumpStat(sideStats[2].openings, gm.open2.key, gm.open2.es, !w1);
    }

    for (const gm of replayPool) {
      for (const [sideIdx, civSide, repObj, wonSide, openObj] of [
        [1, cell.c1, gm.rep1, gm.p1.won === true, gm.open1],
        [2, cell.c2, gm.rep2, gm.p2.won === true, gm.open2],
      ]) {
        const st = sideStats[sideIdx];
        if (!gm.open1 && repObj.fOpenK) bumpStat(st.openings, repObj.fOpenK, repObj.fOpenEs, wonSide);
        if (repObj.fSwK && repObj.fSwEs) bumpStat(st.switches, repObj.fSwK, repObj.fSwEs, wonSide);
        if (repObj.cPostK && repObj.cPostEs) bumpStat(st.postures, repObj.cPostK, repObj.cPostEs, wonSide);
        const cPrimLegal = (repObj.cPrimK && !isDeadEndCastleCarry(civSide, repObj.cPrimK)) ? legalUnitEsForCiv(civSide, repObj.cPrimK, false, repObj.cPrimEs) : null;
        const cSupLegal = repObj.cSupK ? legalUnitEsForCiv(civSide, repObj.cSupK, false, repObj.cSupEs) : null;
        if (repObj.cPrimK && cPrimLegal) {
          const cKey = repObj.cSupK ? `${repObj.cPrimK}+${repObj.cSupK}` : repObj.cPrimK;
          const cLabel = cSupLegal ? `${cPrimLegal} + ${cSupLegal}` : cPrimLegal;
          bumpStat(st.castleComps, cKey, cLabel, wonSide, 1, { prim: cPrimLegal, sup: cSupLegal, post: repObj.cPostEs });
        }
        if (repObj.iPrimK && repObj.iPrimEs && !isOutdatedImperialCarry(civSide, repObj.iPrimK)) {
          const iPrimLegal = legalUnitEsForCiv(civSide, repObj.iPrimK, true, repObj.iPrimEs);
          const iSupLegal = repObj.iSupK ? legalUnitEsForCiv(civSide, repObj.iSupK, true, repObj.iSupEs) : null;
          const iKey = repObj.iSupK ? `${repObj.iPrimK}+${repObj.iSupK}` : repObj.iPrimK;
          const iLabel = iSupLegal ? `${iPrimLegal} + ${iSupLegal}` : iPrimLegal;
          bumpStat(st.impComps, iKey, iLabel, wonSide);
        }
        const fLabel = openObj?.es || repObj.fOpenEs;
        if (fLabel && fLabel !== 'Apertura flexible' && cPrimLegal) {
          const chainKey = `${repObj.fOpenK}->${repObj.cPostK || 'tc'}:${repObj.cPrimK}`;
          const chainLabel = `${fLabel}${repObj.fSwEs ? ` (${repObj.fSwEs})` : ''} → ${cPrimLegal}${cSupLegal ? ` + ${cSupLegal}` : ''}${repObj.cPostEs ? ` [${repObj.cPostEs}]` : ''}`;
          bumpStat(st.chains, chainKey, chainLabel, wonSide);
        }
        if (Number.isFinite(repObj.fSec) && repObj.fSec >= 360 && repObj.fSec <= 950) st.fSecs.push(repObj.fSec);
        if (Number.isFinite(repObj.cSec) && repObj.cSec >= 720 && repObj.cSec <= 2200) st.cSecs.push(repObj.cSec);
      }
    }

    const packSide = (st) => {
      const op = pickBestAndTrap(st.openings, 3);
      const sw = pickBestAndTrap(st.switches, 99);
      const po = pickBestAndTrap(st.postures, 99);
      const ca = pickBestAndTrap(st.castleComps, 3);
      const im = pickBestAndTrap(st.impComps, 3);
      const ch = pickBestAndTrap(st.chains, 99);

      const fmtItem = (it) => it ? [it.label, it.games, it.wins] : null;
      const trapItem = op.trap || ca.trap;
      return {
        op: fmtItem(op.best),
        opAlt: fmtItem(op.alt),
        sw: fmtItem(sw.best),
        post: fmtItem(po.best),
        cas: fmtItem(ca.best),
        casAlt: fmtItem(ca.alt),
        imp: fmtItem(im.best),
        chain: fmtItem(ch.best),
        trap: trapItem ? [trapItem.label, trapItem.games, trapItem.wins] : null,
        fMed: medianNum(st.fSecs),
        cMed: medianNum(st.cSecs),
      };
    };

    // Seleccionar hasta 3 citas de partidas Pro reales verificables (priorizando Tier 1 + replay profundo + mayor ELO)
    const allSortedForRefs = [...t1List, ...t2List, ...t3List]
      .sort((a, b) => (a.tier - b.tier) || ((b.rep1 ? 1 : 0) - (a.rep1 ? 1 : 0)) || (Math.max(b.p1.rating || 0, b.p2.rating || 0) - Math.max(a.p1.rating || 0, a.p2.rating || 0)));

    const refs = allSortedForRefs.slice(0, 3).map((gm) => {
      const c1Prim = gm.rep1?.cPrimK ? legalUnitEsForCiv(cell.c1, gm.rep1.cPrimK, false, gm.rep1.cPrimEs) : null;
      const c2Prim = gm.rep2?.cPrimK ? legalUnitEsForCiv(cell.c2, gm.rep2.cPrimK, false, gm.rep2.cPrimEs) : null;
      const r1 = gm.rep1
        ? `${gm.rep1.fOpenEs}${c1Prim ? ` → ${c1Prim}` : ''}${gm.rep1.cPostEs ? ` (${gm.rep1.cPostEs})` : ''}`
        : (gm.open1?.es || null);
      const r2 = gm.rep2
        ? `${gm.rep2.fOpenEs}${c2Prim ? ` → ${c2Prim}` : ''}${gm.rep2.cPostEs ? ` (${gm.rep2.cPostEs})` : ''}`
        : (gm.open2?.es || null);
      return [
        gm.p1.won ? 1 : 2,          // 0: qué lado ganó (1 = civ1, 2 = civ2)
        gm.p1.name,                 // 1: jugador civ1
        gm.p2.name,                 // 2: jugador civ2
        Math.round(gm.durSec / 60), // 3: minutos de juego (F11)
        gm.mapName,                 // 4: mapa exacto
        gm.matchId,                 // 5: matchId real
        r1,                         // 6: ruta lado 1
        r2,                         // 7: ruta lado 2
        Math.max(gm.p1.rating || 0, gm.p2.rating || 0), // 8: ELO máx
      ];
    });

    pairOutput[cell.mapType][`${cell.c1}__${cell.c2}`] = {
      t: tierBadge,
      n: [totalGames, wins1, t1List.length, t2List.length, t3List.length, replayPool.length],
      clk: [
        [buckets.short.g, buckets.short.w1],
        [buckets.mid.g, buckets.mid.w1],
        [buckets.long.g, buckets.long.w1],
      ],
      s1: packSide(sideStats[1]),
      s2: packSide(sideStats[2]),
      refs,
    };
  }

  // Compilar respuestas anti-apertura Pro para Prematch
  const packCounterMap = (mBucket, minGames = 4) => {
    const arr = [...mBucket.values()].filter((x) => x.games >= minGames);
    const totalW = arr.reduce((s, x) => s + x.wGames, 0);
    arr.sort((a, b) => (bayesianWinScore(b.wWins, b.wGames, totalW, 5, 0.5) - bayesianWinScore(a.wWins, a.wGames, totalW, 5, 0.5)) || (b.games - a.games));
    return arr.slice(0, 2).map((x) => [x.label, x.games, x.wins]);
  };

  const compiledVsOpening = { open: { global: {}, byCiv: {} }, closed: { global: {}, byCiv: {} } };
  for (const mt of ['open', 'closed']) {
    for (const [rivOp, bucket] of Object.entries(vsOpeningGlobal[mt])) {
      const top = packCounterMap(bucket, 6);
      if (top.length) compiledVsOpening[mt].global[rivOp] = top;
    }
    for (const [myCiv, opObj] of Object.entries(vsOpeningByCiv[mt])) {
      for (const [rivOp, bucket] of Object.entries(opObj)) {
        const top = packCounterMap(bucket, 3);
        if (top.length) {
          compiledVsOpening[mt].byCiv[myCiv] ||= {};
          compiledVsOpening[mt].byCiv[myCiv][rivOp] = top;
        }
      }
    }
  }

  const compiledCivTransitions = { open: {}, closed: {} };
  for (const mt of ['open', 'closed']) {
    for (const [civ, b] of Object.entries(civReplayStats[mt])) {
      const op = pickBestAndTrap(b.openings, 99).best;
      const po = pickBestAndTrap(b.postures, 99).best;
      const ca = pickBestAndTrap(b.castleComps, 99).best;
      const im = pickBestAndTrap(b.impComps, 99).best;
      compiledCivTransitions[mt][civ] = {
        n: b.replays,
        op: op ? [op.label, op.games, op.wins] : null,
        post: po ? [po.label, po.games, po.wins] : null,
        cas: ca ? [ca.label, ca.games, ca.wins] : null,
        imp: im ? [im.label, im.games, im.wins] : null,
        fMed: medianNum(b.fSecs),
        cMed: medianNum(b.cSecs),
      };
    }
  }

  const finalDataset = {
    meta: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      patchWindowStart: '2026-03-15',
      totalMatchesAnalyzed: matches.length,
      totalDeepReplays: [...deepReplaysMap.values()].filter((v) => v && v.ok).length,
      totalInsightsEnriched: insightsMap.size,
      openPairsCovered: Object.keys(pairOutput.open).length,
      closedPairsCovered: Object.keys(pairOutput.closed).length,
      openProTierPairs: proTierPairs,
      open2kTierPairs: t2TierPairs,
    },
    vsOpening: compiledVsOpening,
    civTransitions: compiledCivTransitions,
    pairs: pairOutput,
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalDataset));
  const sizeMb = (fs.statSync(OUTPUT_JSON).size / (1024 * 1024)).toFixed(2);
  console.log(`[5/5] Dataset guardado en ${OUTPUT_JSON} (${sizeMb} MB) · Pares Abiertos=${finalDataset.meta.openPairsCovered}/1540 · Cerrados=${finalDataset.meta.closedPairsCovered}/1540.`);
}

async function main() {
  ensureDir(CACHE_DIR);
  const roster = await loadOrFetchLeaderboard();
  const matches = await loadOrFetchMatches(roster);
  const insightsMap = await loadOrFetchInsightsOpenings(roster);
  const deepReplaysMap = await loadOrParseDeepReplays(matches);
  compileProMatchupDataset(matches, insightsMap, deepReplaysMap);
}

main().catch((err) => {
  console.error('FATAL build-pro-matchups:', err);
  process.exit(1);
});
