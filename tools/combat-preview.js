'use strict';

// Offline visual fixture. Every number is synthetic and the page says so.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { analyzeCombatEvents, COST_DEFINITION } = require('../src/combat-analysis');
const { buildPostMatchReport } = require('../src/postmatch');
const { renderPostMatch } = require('../ui/tactical-ui');

const durationSeconds = 2000;
const partial = process.argv.includes('--partial');
const resultsOnly = process.argv.includes('--results-only');
const cost = (food, gold = 0) => ({ food, wood: 0, gold, stone: 0, definition: COST_DEFINITION });
const deaths = [];
function add(count, time, category, owner, killer, unitCost) {
  for (let i = 0; i < count; i += 1) {
    const n = deaths.length;
    deaths.push({ id: `synthetic-${n}`, unitInstanceId: `synthetic-unit-${n}`, type: 'unit-died',
      gameSeconds: time + i, unitCategory: category, ownerProfileId: owner,
      killerProfileId: killer, cause: 'enemy-combat', cost: unitCost });
  }
}
add(8, 700, 'villager', 8, 7, cost(50));
add(2, 900, 'villager', 7, 8, cost(50));
add(25, 1250, 'military', 8, 7, cost(60, 40));
add(6, 1500, 'military', 7, 8, cost(60, 70));
const ledger = { schemaVersion: 1, clock: 'game', matchId: '100', profileId: 7, durationSeconds,
  startingAge: 'dark', players: [{ profileId: 7, team: 1 }, { profileId: 8, team: 2 }], deaths,
  coverage: { agesComplete: true, deaths: [{ start: 0, end: partial ? 1200 : durationSeconds }] },
  ageEvents: ['dark', 'feudal', 'castle', 'imperial'].map((age, i) =>
    ({ profileId: 7, type: 'age-reached', age, gameSeconds: i * 600 })) };
const combat = analyzeCombatEvents(ledger);
if (!combat.data) throw new Error(combat.warnings.join(' '));
const match = { matchId: '100', mapName: 'Arabia', leaderboardId: 3,
  startedAt: 100000, finishedAt: 2100000, ongoing: false,
  players: [{ profileId: 7, civ: 'Franks', name: 'Jugador de ejemplo', won: false, matchRatingDiff: -14 },
    { profileId: 8, civ: 'Mayans', name: 'Rival de ejemplo', won: true }] };
const telemetry = { schemaVersion: 1, matchId: '100', profileId: 7, clock: 'game', durationSeconds,
  source: { id: 'synthetic-visual-fixture', version: '1', type: 'game-telemetry', label: 'Datos sintéticos · solo revisión visual' },
  context: { mapName: 'Arabia', leaderboardId: 3, civ: 'Franks', opening: 'Scout Rush',
    gameSpeed: 'normal', startingAge: 'dark', patch: 'synthetic-fixture' },
  metrics: { apm: { value: 112.4, definition: 'game-command-count-v1' },
    feudalSeconds: { value: 600, definition: 'age-reached-game-seconds-v1' },
    castleSeconds: { value: 1200, definition: 'age-reached-game-seconds-v1' } }, combat: combat.data };
const report = buildPostMatchReport({ match, profileId: 7, telemetry });
const base = pathToFileURL(path.join(__dirname, '..') + path.sep).href;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>Postmatch · fixture de desarrollo</title><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="command.css"><style>*{box-sizing:border-box}body{margin:0;background:#0e1214;color:var(--text);font:13px/1.45 'Segoe UI',system-ui,sans-serif}h2,h3,p{margin:0}main{max-width:760px;margin:32px auto;padding:28px;background:#171c1d;border:1px solid #353d3b}.fixture-label{display:flex;gap:12px;justify-content:space-between;color:#c9ad75;border-bottom:1px solid #353d3b;margin-bottom:22px;padding-bottom:12px;font-size:10px;letter-spacing:.08em}.fixture-note{font-size:11px;color:#aeb5b2;margin:18px 0 0}.review-close{display:none}@media(max-width:580px){main{margin:12px;padding:14px}.review-header h2{font-size:21px}.review-header p{font-size:11px}.review-result{font-size:20px}.fixture-label{display:block}.fixture-label span{display:block}.review-combat thead th{font-size:8px}.review-combat td{font-size:13px}.review-combat tbody th{font-size:10px}}</style></head><body data-theme="clasico"><main><div class="fixture-label"><b>AOE2 HELPER / POSTMATCH</b><span>DATOS SINTÉTICOS · VISTA DE DESARROLLO</span></div>${renderPostMatch(report, { replay: !resultsOnly, comparison: !resultsOnly })}<p class="fixture-note">Esta vista permite revisar el diseño con eventos ficticios. La extracción automática de bajas desde AoE2 todavía no está implementada.</p></main></body></html>`;
const output = path.join(os.tmpdir(), `aoe2-combat-preview${partial ? '-partial' : resultsOnly ? '-results-only' : ''}.html`);
fs.writeFileSync(output, html);
console.log(output);
