'use strict';

/**
 * Harvester empírico de benchmarks reales por franja de 100 ELO (800..2000)
 * usando replays reales de AoE2:DE (Microsoft GetMatchReplay) analizados con
 * el MISMO motor `analyzeReplayBuffer` que usa Relic en Postmatch.
 *
 * Cero números inventados: cada mediana proviene de partidas RM 1v1 reales (>=12 min)
 * separadas por tipo de mapa (`open` vs `closed` + `all`).
 */

const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { analyzeReplayBuffer } = require('../src/replay-analysis');

const COMPANION_BASE = 'https://data.aoe2companion.com';
const REPLAY_BASE = 'https://api.ageofempires.com/api/GameStats/AgeII/GetMatchReplay/';
const UA_COMPANION = 'aoe2-elo-overlay/3.3.11 (elo-bracket-benchmarks)';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const BUCKETS = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
const TARGET_REPLAYS_PER_BUCKET = Number(process.env.TARGET_REPLAYS_PER_BUCKET || 14);
const REPLAY_MAX_AGE_MS = 18 * 24 * 60 * 60 * 1000;
const MIN_MATCH_DURATION_SEC = 12 * 60;

const OPEN_MAPS = [
  'arabia', 'runestones', 'atacama', 'serengeti', 'valley', 'acropolis',
  'gold rush', 'golden pit', 'land madness', 'habitable', 'lipany', 'lowland',
  'kilimanjaro', 'cenotes', 'savannah', 'ghost lake', 'mountain range', 'aftermath',
];
const CLOSED_MAPS = [
  'arena', 'fortress', 'hideout', 'black forest', 'enclosed', 'hill fort',
  'glade', 'oasis', 'lombardia', 'amazon tunnel', 'michi', 'walled', 'citadel',
];
const EXCLUDED_MAPS = [
  'nomad', 'african clearing', 'steppe', 'budapest', 'socotra', 'megarandom',
  'islands', 'four lakes', 'cross', 'baltic', 'mediterranean', 'continental',
  'coastal', 'archipelago', 'migration', 'rivers', 'golden swamp', 'nile delta',
];

function classifyMap(rawName) {
  const m = String(rawName || '').toLowerCase().trim();
  if (!m) return null;
  for (const ex of EXCLUDED_MAPS) if (m.includes(ex)) return null;
  for (const cl of CLOSED_MAPS) if (m === cl || m.includes(cl)) return 'closed';
  for (const op of OPEN_MAPS) if (m === op || m.includes(op)) return 'open';
  return null;
}

const RAW_CACHE_PATH = path.join(
  process.env.USERPROFILE || 'C:\\Users\\juanp',
  '.gemini', 'antigravity', 'brain', '1432f205-b100-4fca-b8e6-e76337d42392', 'scratch', 'elo-bracket-harvest-raw.json'
);
const OUT_JSON = path.join(__dirname, '..', 'src', 'elo-bracket-benchmarks.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, retries = 4) {
  for (let i = 0; i <= retries; i += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 16000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA_COMPANION, Accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        await sleep(1400 * (i + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      clearTimeout(t);
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

async function downloadReplayRecord(matchId, profileId) {
  const url = `${REPLAY_BASE}?matchId=${encodeURIComponent(matchId)}&profileId=${encodeURIComponent(profileId)}`;
  for (let i = 0; i < 2; i += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA_BROWSER }, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      const arrBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      if (buf.length < 4000) return null;
      const zip = new AdmZip(buf);
      const entry = zip.getEntries().find((e) => /\.aoe2record$/i.test(e.entryName));
      return entry ? entry.getData() : null;
    } catch {
      clearTimeout(t);
      await sleep(500);
    }
  }
  return null;
}

async function getLeaderboardPage(page) {
  const data = await fetchJson(`${COMPANION_BASE}/api/leaderboards/rm_1v1?page=${page}`);
  if (!data || !Array.isArray(data.players) || !data.players.length) return null;
  return data;
}

async function findPageForElo(targetElo, maxPage) {
  let lo = 1;
  let hi = maxPage;
  let bestPage = 1;
  let bestDiff = Infinity;
  for (let step = 0; step < 11 && lo <= hi; step += 1) {
    const mid = Math.floor((lo + hi) / 2);
    const data = await getLeaderboardPage(mid);
    if (!data) { hi = mid - 1; continue; }
    const ratings = data.players.map((p) => Number(p.rating)).filter(Number.isFinite);
    if (!ratings.length) { hi = mid - 1; continue; }
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const diff = Math.abs(avg - targetElo);
    if (diff < bestDiff) { bestDiff = diff; bestPage = mid; }
    if (diff <= 18) return { page: mid, players: data.players };
    // Leaderboard is sorted descending by rating (high rating = low page number)
    if (avg > targetElo) lo = mid + 1;
    else hi = mid - 1;
    await sleep(160);
  }
  const finalData = await getLeaderboardPage(bestPage);
  return { page: bestPage, players: finalData?.players || [] };
}

function extractPlayerMetrics(summaryNode) {
  if (!summaryNode || typeof summaryNode !== 'object') return null;
  const tp = summaryNode.techProfile || null;
  const out = {};
  if (Number.isFinite(summaryNode.tcIdleDarkSeconds) && summaryNode.tcIdleDarkSeconds >= 0 && summaryNode.tcIdleDarkSeconds <= 400) {
    out.tcIdleDarkSec = Math.round(summaryNode.tcIdleDarkSeconds * 10) / 10;
  }
  const fIdle = Number.isFinite(summaryNode.tcIdleFeudalPerTcSeconds)
    ? summaryNode.tcIdleFeudalPerTcSeconds
    : summaryNode.tcIdleFeudalSeconds;
  if (Number.isFinite(fIdle) && fIdle >= 0 && fIdle <= 900) {
    out.tcIdleFeudalSec = Math.round(fIdle * 10) / 10;
  }
  if (Number.isFinite(summaryNode.tcUtilizationTotal) && summaryNode.tcUtilizationTotal >= 10 && summaryNode.tcUtilizationTotal <= 100) {
    out.tcUtilTotalPct = Math.round(summaryNode.tcUtilizationTotal * 10) / 10;
  }
  if (Number.isFinite(summaryNode.biggestTcGap?.durationSec) && summaryNode.biggestTcGap.durationSec >= 0 && summaryNode.biggestTcGap.durationSec <= 600) {
    out.biggestTcGapSec = Math.round(summaryNode.biggestTcGap.durationSec);
  }
  if (tp && tp.hasDoubleBitAxe && Number.isFinite(tp.doubleBitAxeDelaySec) && tp.doubleBitAxeDelaySec >= 0 && tp.doubleBitAxeDelaySec <= 600) {
    out.dbaDelaySec = Math.round(tp.doubleBitAxeDelaySec);
  }
  if (tp && tp.hasBowSaw && Number.isFinite(tp.bowSawDelaySec) && tp.bowSawDelaySec >= 0 && tp.bowSawDelaySec <= 700) {
    out.bowSawDelaySec = Math.round(tp.bowSawDelaySec);
  }
  if (Number.isFinite(summaryNode.eapm) && summaryNode.eapm >= 10 && summaryNode.eapm <= 200) {
    out.eapm = Math.round(summaryNode.eapm * 10) / 10;
  }
  if (Number.isFinite(summaryNode.eapmRetentionPct) && summaryNode.eapmRetentionPct >= 25 && summaryNode.eapmRetentionPct <= 180) {
    out.eapmRetentionPct = Math.round(summaryNode.eapmRetentionPct);
  }
  if (Number.isFinite(summaryNode.timings?.feudalSeconds) && summaryNode.timings.feudalSeconds >= 420 && summaryNode.timings.feudalSeconds <= 1500) {
    out.feudalSec = Math.round(summaryNode.timings.feudalSeconds);
  }
  if (Number.isFinite(summaryNode.timings?.castleSeconds) && summaryNode.timings.castleSeconds >= 720 && summaryNode.timings.castleSeconds <= 2700) {
    out.castleSec = Math.round(summaryNode.timings.castleSeconds);
  }
  if (Number.isFinite(summaryNode.workshopUtilization) && summaryNode.workshopUtilization >= 0 && summaryNode.workshopUtilization <= 100) {
    out.workshopUtilPct = Math.round(summaryNode.workshopUtilization);
  }
  if (Number.isFinite(summaryNode.feudalMilitaryOrdered) && summaryNode.feudalMilitaryOrdered >= 0 && summaryNode.feudalMilitaryOrdered <= 120) {
    out.feudalMilitary = Math.round(summaryNode.feudalMilitaryOrdered);
  }
  if (Number.isFinite(summaryNode.combatMicro?.controlSharePct) && summaryNode.combatMicro.controlSharePct >= 0 && summaryNode.combatMicro.controlSharePct <= 100) {
    out.controlSharePct = Math.round(summaryNode.combatMicro.controlSharePct * 10) / 10;
  }
  if (tp?.armyRelevance && typeof tp.armyRelevance.wellEquipped === 'boolean') {
    out.wellEquipped = tp.armyRelevance.wellEquipped ? 1 : 0;
  }
  return Object.keys(out).length >= 3 ? out : null;
}

function bucketOf(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n) || n < 750) return null;
  const b = Math.floor(n / 100) * 100;
  if (b < 800) return 800;
  if (b > 2000) return 2000;
  return b;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const val = lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  return Math.round(val * 10) / 10;
}

function summarizeSamples(list) {
  const keys = [
    'tcIdleDarkSec', 'tcIdleFeudalSec', 'tcUtilTotalPct', 'biggestTcGapSec',
    'dbaDelaySec', 'bowSawDelaySec', 'eapm', 'eapmRetentionPct',
    'feudalSec', 'castleSec', 'workshopUtilPct', 'feudalMilitary', 'controlSharePct',
  ];
  const metrics = {};
  for (const k of keys) {
    const vals = list.map((s) => s[k]).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
    if (vals.length >= 3) {
      metrics[k] = {
        p50: percentile(vals, 0.5),
        p25: percentile(vals, 0.25),
        p75: percentile(vals, 0.75),
        n: vals.length,
      };
    }
  }
  const eqVals = list.map((s) => s.wellEquipped).filter((v) => v === 0 || v === 1);
  if (eqVals.length >= 3) {
    const pct = Math.round((eqVals.reduce((a, b) => a + b, 0) / eqVals.length) * 100);
    metrics.wellEquippedPct = { p50: pct, n: eqVals.length };
  }
  return { samples: list.length, metrics };
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const cur = items[idx++];
      await worker(cur);
    }
  });
  await Promise.all(workers);
}

async function main() {
  let cache = { doneMatches: {}, samples: [] };
  if (fs.existsSync(RAW_CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(RAW_CACHE_PATH, 'utf8')); } catch {}
  }

  const countByBucket = () => {
    const map = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    for (const s of cache.samples) {
      if (map[s.bucket] != null) map[s.bucket] += 1;
    }
    return map;
  };

  console.log('Initial sample counts:', countByBucket());

  // Determine total pages in RM 1v1 leaderboard
  const page1 = await getLeaderboardPage(1);
  const totalPlayers = Number(page1?.total || 48000);
  const perPage = Number(page1?.perPage || page1?.players?.length || 100);
  const maxPage = Math.max(50, Math.ceil(totalPlayers / perPage));
  console.log(`RM 1v1 Leaderboard: ${totalPlayers} players (${maxPage} pages)`);

  const nowMs = Date.now();
  const saveCache = () => {
    fs.mkdirSync(path.dirname(RAW_CACHE_PATH), { recursive: true });
    fs.writeFileSync(RAW_CACHE_PATH, JSON.stringify(cache), 'utf8');
  };

  for (const targetBucket of BUCKETS) {
    const counts = countByBucket();
    const targetSamples = TARGET_REPLAYS_PER_BUCKET * 2;
    if (counts[targetBucket] >= targetSamples) {
      console.log(`Bucket ${targetBucket}: already has ${counts[targetBucket]} samples, skipping.`);
      continue;
    }

    const targetMidElo = targetBucket === 2000 ? 2040 : targetBucket + 45;
    const found = await findPageForElo(targetMidElo, maxPage);
    const candidatePlayers = (found.players || [])
      .filter((p) => Number(p.rating) >= targetBucket - 25 && Number(p.rating) <= targetBucket + 115)
      .slice(0, 32);

    console.log(`Bucket ${targetBucket}: page ${found.page}, ${candidatePlayers.length} players`);
    if (!candidatePlayers.length) continue;

    // Fetch matches in batches of 8 profile_ids
    const candidateMatches = [];
    const seenMatchIds = new Set(Object.keys(cache.doneMatches));
    for (let i = 0; i < candidatePlayers.length && candidateMatches.length < TARGET_REPLAYS_PER_BUCKET * 3; i += 8) {
      const pids = candidatePlayers.slice(i, i + 8).map((p) => p.profileId).join(',');
      const res = await fetchJson(`${COMPANION_BASE}/api/matches?profile_ids=${pids}&leaderboard_ids=rm_1v1&count=30`);
      const matches = Array.isArray(res?.matches) ? res.matches : [];
      for (const m of matches) {
        const mid = String(m.matchId || '');
        if (!mid || seenMatchIds.has(mid)) continue;
        const startedMs = Date.parse(m.started || '');
        const finishedMs = Date.parse(m.finished || '');
        if (!Number.isFinite(startedMs) || nowMs - startedMs > REPLAY_MAX_AGE_MS) continue;
        const durSec = Number.isFinite(finishedMs) ? (finishedMs - startedMs) / 1000 : 0;
        if (durSec < MIN_MATCH_DURATION_SEC) continue;
        const mapClass = classifyMap(m.mapName);
        if (!mapClass) continue;
        const players = (m.teams || []).flatMap((tm) => tm.players || []);
        if (players.length !== 2) continue;
        if (!players.every((p) => Number.isFinite(Number(p.rating)))) continue;
        seenMatchIds.add(mid);
        candidateMatches.push({
          matchId: mid,
          mapName: m.mapName,
          mapClass,
          leaderboardId: 'rm_1v1',
          started: m.started,
          finished: m.finished,
          players: players.map((p) => ({
            profileId: Number(p.profileId),
            name: p.name || '',
            civ: p.civName || p.civ || '',
            rating: Number(p.rating),
            won: Boolean(p.won),
            team: Number(p.team || 1),
          })),
        });
      }
      await sleep(220);
    }

    // Prioritize a healthy mix of open + closed maps
    const openList = candidateMatches.filter((m) => m.mapClass === 'open');
    const closedList = candidateMatches.filter((m) => m.mapClass === 'closed');
    const ordered = [];
    const maxLen = Math.max(openList.length, closedList.length);
    for (let i = 0; i < maxLen; i += 1) {
      if (openList[i]) ordered.push(openList[i]);
      if (closedList[i]) ordered.push(closedList[i]);
    }

    let okCount = 0;
    const neededReplays = Math.ceil((targetSamples - counts[targetBucket]) / 2);
    await runPool(ordered.slice(0, neededReplays * 2 + 8), 2, async (m) => {
      if (okCount >= neededReplays) return;
      await sleep(350);
      const p0 = m.players[0];
      const p1 = m.players[1];
      const recBuf = await downloadReplayRecord(m.matchId, p0.profileId);
      if (!recBuf) {
        cache.doneMatches[m.matchId] = 'no_zip';
        return;
      }
      try {
        const parsed = await analyzeReplayBuffer(recBuf, {
          match: {
            matchId: m.matchId,
            mapName: m.mapName,
            leaderboardId: 'rm_1v1',
            players: m.players,
          },
          profileId: p0.profileId,
        });
        const eng = parsed?.engineSummary;
        const m0 = extractPlayerMetrics(eng?.self);
        const m1 = extractPlayerMetrics(eng?.rival);
        let added = 0;
        if (m0) {
          const b0 = bucketOf(p0.rating);
          if (b0 != null) {
            cache.samples.push({ matchId: m.matchId, bucket: b0, mapClass: m.mapClass, rating: p0.rating, ...m0 });
            added += 1;
          }
        }
        if (m1) {
          const b1 = bucketOf(p1.rating);
          if (b1 != null) {
            cache.samples.push({ matchId: m.matchId, bucket: b1, mapClass: m.mapClass, rating: p1.rating, ...m1 });
            added += 1;
          }
        }
        cache.doneMatches[m.matchId] = added > 0 ? 'ok' : 'empty';
        if (added > 0) okCount += 1;
      } catch (err) {
        cache.doneMatches[m.matchId] = 'err';
      }
    });

    saveCache();
    console.log(`  -> Bucket ${targetBucket}: +${okCount} replays parsed. Totals now:`, countByBucket()[targetBucket]);
  }

  // Compile compact production JSON (`src/elo-bracket-benchmarks.json`)
  const brackets = {};
  for (const b of BUCKETS) {
    const allB = cache.samples.filter((s) => s.bucket === b);
    const openB = allB.filter((s) => s.mapClass === 'open');
    const closedB = allB.filter((s) => s.mapClass === 'closed');
    brackets[String(b)] = {
      all: summarizeSamples(allB),
      open: summarizeSamples(openB),
      closed: summarizeSamples(closedB),
    };
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'aoe2-de-rm1v1-real-replays',
    totalSamples: cache.samples.length,
    totalMatches: Object.values(cache.doneMatches).filter((v) => v === 'ok').length,
    brackets,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\nWROTE ${OUT_JSON} (${output.totalSamples} real player samples from ${output.totalMatches} replays)`);
  for (const b of BUCKETS) {
    const row = brackets[String(b)].all;
    const m = row.metrics;
    console.log(
      `  ${b} ELO (n=${row.samples}): DarkTC=${m.tcIdleDarkSec?.p50 ?? '-'}s | FeudTC=${m.tcIdleFeudalSec?.p50 ?? '-'}s | DBA=${m.dbaDelaySec?.p50 ?? '-'}s | eAPM=${m.eapm?.p50 ?? '-'} | Feud=${m.feudalSec?.p50 ?? '-'}s | WellEq=${m.wellEquippedPct?.p50 ?? '-'}%`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
