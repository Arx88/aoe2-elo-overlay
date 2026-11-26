'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const welcomeHome = require(path.join(ROOT, 'src', 'welcome-home.js'));
const techTreeData = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src', 'training', 'techtree-data.json'), 'utf8')
);

// 1. Dynamic time-of-day greeting
const morning = welcomeHome.buildGreeting({ alias: 'PSX | Acido', now: new Date(2026, 10, 23, 9, 30) });
assert.match(morning.headline, /^Buenos días, PSX \| Acido$/);
assert.equal(morning.playerName, 'PSX | Acido');

const afternoon = welcomeHome.buildGreeting({ alias: 'Acido', now: new Date(2026, 10, 25, 15, 0) });
assert.match(afternoon.headline, /^Buenas tardes, Acido$/);

const night = welcomeHome.buildGreeting({ alias: '', now: new Date(2026, 10, 28, 22, 0) });
assert.match(night.headline, /^Buenas noches, comandante$/);

// 2. Personal pulse + Unique Unit showcase extraction
const unitDir = path.join(ROOT, 'assets', 'units');
const unitSlugs = new Set(fs.readdirSync(unitDir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)));
assert.ok(unitSlugs.size >= 50, `Expected >=50 unique unit cutouts, got ${unitSlugs.size}`);
const spanArt = welcomeHome.resolveCivShowcase('Spanish', techTreeData, unitSlugs);
assert.equal(spanArt.unitName, 'Conquistador');
assert.equal(spanArt.unitArt, 'assets/units/spanish.webp');

const now = new Date('2026-11-25T00:00:00Z');
const twoDaysAgo = now.getTime() - 2 * 86400 * 1000;
const pulse = welcomeHome.summarizePersonalPulse({
  profileId: 25399083,
  alias: 'PSX | Acido',
  techTreeData,
  availableUnitSlugs: unitSlugs,
  centralCacheRaw: {
    profileId: 25399083,
    raw: {
      profileData: {
        name: 'PSX | Acido',
        leaderboards: [
          { leaderboardId: 'rm_1v1', rating: 1212, maxRating: 1212, games: 32, wins: 21, streak: 4 },
          { leaderboardId: 'rm_team', rating: 1378, maxRating: 1684, games: 396, wins: 203, streak: 2 },
        ],
      },
      matchesAll: [
        { matchId: 1, mapName: 'Arabia', leaderboardId: 'rm_team', startedAt: twoDaysAgo, players: [{ profileId: 25399083, civ: 'Spanish', won: true }] },
        { matchId: 2, mapName: 'Arabia', leaderboardId: 'rm_team', startedAt: twoDaysAgo + 1000, players: [{ profileId: 25399083, civ: 'Spanish', won: true }] },
        { matchId: 3, mapName: 'Arena', leaderboardId: 'rm_team', startedAt: twoDaysAgo + 2000, players: [{ profileId: 25399083, civ: 'Mongols', won: false }] },
        { matchId: 4, mapName: 'Arabia', leaderboardId: 'rm_team', startedAt: twoDaysAgo + 3000, players: [{ profileId: 25399083, civ: 'Spanish', won: true }] },
      ],
    },
  },
  trainingDashboard: { unlocked: true, weekly: { daysActive: 3, daysTarget: 5, streakDays: 3 } },
  now,
});

assert.equal(pulse.primaryMode, 'rm_team');
assert.equal(pulse.topCiv.name, 'Españoles');
assert.equal(pulse.topCiv.unitName, 'Conquistador');
assert.equal(pulse.topCiv.unitArt, 'assets/units/spanish.webp');
assert.equal(pulse.topMap.name, 'Arabia');
assert.equal(pulse.topMap.winRate, 100);

// 3. Real Weekly Gold Treasury & War Ledger from performanceStore telemetry
const ledger = welcomeHome.summarizeWarLedger({
  techTreeData,
  now,
  performanceRecords: [
    {
      matchId: 'm1',
      startedAt: twoDaysAgo,
      elapsedSeconds: 1800,
      telemetry: {
        engineSummary: {
          self: {
            villagersOrdered: 120,
            militaryOrdered: 80,
            peakEapm: 142,
            tcUtilizationDark: 98.5,
            timings: { castleSeconds: 880, imperialSeconds: 2100 },
            topUnits: [
              { unitId: 771, name: 'Conquistador', count: 50 }, // 50 * 60g = 3000g
              { unitId: 38, name: 'Caballero', count: 20 },     // 20 * 75g = 1500g
            ],
            macroBuilds: { castles: 2, farms: 64 },
            techProfile: { ecoNames: [], blacksmithNames: [], combatKeyNames: [] },
          },
        },
      },
    },
  ],
});
assert.equal(ledger.scope, 'week');
assert.equal(ledger.goldTotal, 5500); // 3000 + 1500 + 200 (Castle) + 800 (Imperial)
assert.equal(ledger.villagers, 120);
assert.equal(ledger.military, 80);
assert.equal(ledger.castles, 2);
assert.equal(ledger.farms, 64);
assert.equal(ledger.peakEapm, 142);

// 4. Verified daily Codex curiosity + CSP & HTML integrity
const curDay1 = welcomeHome.buildDailyCodexCuriosity({ techTreeData, now: new Date(2026, 10, 25) });
const curDay2 = welcomeHome.buildDailyCodexCuriosity({ techTreeData, now: new Date(2026, 10, 26) });
assert.ok(curDay1.title && curDay1.body && curDay1.tag);
assert.notEqual(curDay1.title, curDay2.title);

const welcomeUiSrc = fs.readFileSync(path.join(ROOT, 'ui', 'welcome-ui.js'), 'utf8');
assert.ok(!/\sstyle\s*=\s*["'`]/i.test(welcomeUiSrc), 'ui/welcome-ui.js must not contain inline style= attributes');
const settingsHtml = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
assert.ok(settingsHtml.includes('id="welcomeRoot"'));
assert.ok(settingsHtml.includes('id="railHomeBtn"'));
assert.ok(settingsHtml.includes('src="ui/welcome-ui.js"'));

// 5. New Welcome Home v2 features (#1 Gold Rank, #2 7d Activity, #4 Top Counter, #5 Weekly Record, #6 Nemesis/Victim, #7 Announcement)
assert.equal(welcomeHome.computeGoldRank(0).label, 'Saqueador');
assert.equal(welcomeHome.computeGoldRank(94825).label, 'Tesorero Real');
assert.equal(welcomeHome.computeGoldRank(94825).nextLabel, 'Conquistador');
assert.equal(welcomeHome.computeGoldRank(350000).label, 'Mansa Musa');
assert.equal(welcomeHome.computeGoldRank(350000).pct, 100);

assert.equal(ledger.goldRank.label, 'Saqueador');
assert.ok(ledger.weeklyRecord && ledger.weeklyRecord.primary, 'Expected weeklyRecord primary highlight');

assert.equal(pulse.activityStrip.length, 7, 'Activity strip must always have 7 days');
assert.deepEqual(pulse.activityStrip.map((d) => d.dayLabel), ['L', 'M', 'X', 'J', 'V', 'S', 'D'], 'Activity strip must always run Monday through Sunday');
assert.equal(pulse.activityStrip.reduce((acc, d) => acc + d.games, 0), 4);

// Fixed Monday->Sunday reset test: Sunday match must NOT leak into Monday 00:01 of the next week
const sundayLate = new Date(2026, 10, 29, 23, 30, 0).getTime(); // Sun Nov 29, 2026 23:30
const nextMondayMorning = new Date(2026, 10, 30, 0, 5, 0);       // Mon Nov 30, 2026 00:05
const sundayNow = new Date(2026, 10, 29, 23, 55, 0);             // Sun Nov 29, 2026 23:55
const sunRec = [{
  matchId: 'sun-1',
  startedAt: sundayLate - 1200_000,
  finishedAt: sundayLate,
  elapsedSeconds: 1200,
  telemetry: {
    engineSummary: {
      self: {
        villagersOrdered: 80,
        militaryOrdered: 40,
        topUnits: [{ unitId: 38, name: 'Caballero', count: 20 }], // 1500g
        timings: { castleSeconds: 950 }, // 200g -> 1700g
        macroBuilds: { castles: 1, farms: 30 },
        techProfile: { ecoNames: [], blacksmithNames: [], combatKeyNames: [] },
      },
    },
  },
}];
const ledgerSunday = welcomeHome.summarizeWarLedger({ techTreeData, now: sundayNow, performanceRecords: sunRec });
assert.equal(ledgerSunday.goldTotal, 1700, 'Sunday 23:55 must still count Sunday match in Mon-Sun week');
const ledgerMondayReset = welcomeHome.summarizeWarLedger({ techTreeData, now: nextMondayMorning, performanceRecords: sunRec });
assert.equal(ledgerMondayReset.scope, 'week');
assert.equal(ledgerMondayReset.goldTotal, 0, 'Monday 00:05 must reset weekly gold to 0');
assert.equal(ledgerMondayReset.matchesCount, 0, 'Monday 00:05 must reset weekly match count to 0');

const rivalPulseTest = welcomeHome.summarizePersonalPulse({
  profileId: 1,
  techTreeData,
  centralCacheRaw: {
    profileId: 1,
    raw: {
      matchesAll: [
        { matchId: 10, startedAt: twoDaysAgo, players: [{ profileId: 1, team: 1, civ: 'Spanish', won: true }, { profileId: 2, team: 2, civ: 'Franks', won: false }] },
        { matchId: 11, startedAt: twoDaysAgo + 1, players: [{ profileId: 1, team: 1, civ: 'Spanish', won: true }, { profileId: 3, team: 2, civ: 'Franks', won: false }] },
        { matchId: 12, startedAt: twoDaysAgo + 2, players: [{ profileId: 1, team: 1, civ: 'Spanish', won: false }, { profileId: 4, team: 2, civ: 'Mongols', won: true }] },
        { matchId: 13, startedAt: twoDaysAgo + 3, players: [{ profileId: 1, team: 1, civ: 'Spanish', won: false }, { profileId: 5, team: 2, civ: 'Mongols', won: true }] },
      ],
    },
  },
  now,
});
assert.equal(rivalPulseTest.rivalCivPulse.victim.slug, 'franks');
assert.equal(rivalPulseTest.rivalCivPulse.nemesis.slug, 'mongols');

const payloadWithNews = welcomeHome.buildWelcomePayload({
  globalMeta: {
    ok: true,
    windowDays: 7,
    ladders: {
      rm_1v1: {
        topPlayed: [{ slug: 'mongols', name: 'Mongols', pickRate: 5.6, winRate: 49.9 }],
        topWinrate: [{ slug: 'goths', name: 'Goths', pickRate: 1.6, winRate: 59.5 }],
        topMaps: [{ name: 'Arabia', share: 42.6 }],
      },
    },
  },
  announcement: { enabled: true, tag: 'torneo', title: 'Copa Relic', body: 'Inscripciones abiertas', ctaLabel: 'Anotarse', ctaUrl: 'https://example.com/torneo' },
  techTreeData,
  availableUnitSlugs: unitSlugs,
  now,
});
assert.equal(payloadWithNews.announcement.title, 'Copa Relic');
assert.equal(payloadWithNews.announcement.ctaUrl, 'https://example.com/torneo');
assert.ok(payloadWithNews.globalMeta.ladders.rm_1v1.topCounter.picks.length >= 1, 'Expected real pro counters for #1 Mongols');

// Non-HTTPS CTA URL and invalid imageUrl must be stripped safely
const badUrlAnn = welcomeHome.normalizeClientAnnouncement({ enabled: true, title: 'Aviso', body: 'Test', imageUrl: 'javascript:alert(1)', ctaLabel: 'Click', ctaUrl: 'javascript:alert(1)' });
assert.equal(badUrlAnn.ctaUrl, '');
assert.equal(badUrlAnn.imageUrl, '');
const goodImgAnn = welcomeHome.normalizeClientAnnouncement({ enabled: true, title: 'Editorial', body: 'Párrafo largo', imageUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=' });
assert.ok(goodImgAnn.imageUrl.startsWith('data:image/webp;base64,'));
assert.equal(welcomeHome.normalizeClientAnnouncement({ enabled: false, title: 'Off' }), null);

console.log('welcome-home-test: 5/5 pruebas OK');
