'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const icons = require('../ui/relic-icons');
const tree = require('../src/training/techtree-data.json');
const maps = require('../src/map-art.json');
const { CIV_GUIDE } = require('../src/civ-guide');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const exists = (name) => fs.existsSync(path.join(root, name));

for (const role of Object.keys(icons.files)) {
  assert.ok(exists(icons.asset(role)), role);
  assert.match(icons.icon(role), new RegExp(`data-relic-icon="${role}"`));
}
assert.equal(icons.icon('toString'), '');
assert.match(icons.status('check', 12), /data-relic-icon="check" width="12" height="12"/);
assert.match(icons.dumbbell(), /data-relic-icon="training-plan"/);
assert.equal(icons.asset('training-plan'), 'assets/icons/relic/training-plan.png');
for (const meaning of ['gold', 'resources', 'activity', 'clock', 'record', 'medal', 'trophy', 'trend', 'arena', 'tech-tree']) {
  assert.ok(icons.asset(meaning), meaning);
}
const related = ['gold', 'resources', 'activity', 'clock', 'record', 'medal', 'trophy', 'trend'];
assert.equal(new Set(related.map(icons.asset)).size, related.length);

const metricRoles = {
  tcIdleDarkSec: 'town-center',
  tcIdleFeudalPerTcSec: 'town-center',
  feudalSec: 'age-feudal',
  castleSec: 'age-castle',
  dbaDelaySec: 'double-bit-axe',
  eapm: 'activity',
};
for (const [key, role] of Object.entries(metricRoles)) {
  assert.equal(icons.metricAsset(key, 'assets/icons/postmatch/tempo.webp'), icons.asset(role), key);
}
assert.equal(icons.metricAsset('unknown', 'assets/icons/trend.png'), 'assets/icons/trend.png');

for (const renderer of ['settings.html', 'index.html']) {
  const html = read(renderer);
  const registry = html.indexOf('src="ui/relic-icons.js"');
  assert.ok(registry >= 0 && registry < html.indexOf('src="ui/tactical-ui.js"'), renderer);
}
assert.doesNotMatch(read('ultra-gamma.css'), /\[src\$=/, 'Gamma must choose material by icon role');
assert.doesNotMatch(read('ultra-gamma.css'), /--gamma-section-icon|\.rival-title\)::before/);
assert.doesNotMatch(read('ui/techtree-ui.js'), /assets\/shields\//);
assert.doesNotMatch(read('settings.css'), /content:\s*['"]🔒/);

const training = read('ui/training-ui.js');
assert.match(training, /tr-ledger-ico[^\n]+metricAsset\(m\.key/);
assert.match(training, /metricAsset\(g\.metricKey/);
assert.doesNotMatch(training, /tr-ledger-ico[^\n]+m\.icon|<svg class="tr-life-shield/);
assert.doesNotMatch(read('src/training/training-high-elo.js'), /assets\/brand\/|assets\/icons\/postmatch\/tempo/);
assert.match(read('ui/tactical-ui.js'), /postmatchEmblem\(narrativeIcon\(n, 'target'\)\)/);
const editorNodes = new Map(Object.values(tree.nodes).filter((item) => item.icon).map((item) => [item.nameEn, item.icon]));
for (const [item, node] of Object.entries({
  b_houses: 'House', b_lumber: 'Lumber Camp', b_mill: 'Mill', b_mining: 'Mining Camp',
  b_archery: 'Archery Range', b_siege: 'Siege Workshop', b_monastery: 'Monastery',
  t_wheelbarrow: 'Wheelbarrow', t_handcart: 'Hand Cart', u_militia: 'Militia', u_spears: 'Spearman',
})) {
  const line = training.split('\n').find((entry) => entry.includes(`id: '${item}'`));
  const asset = editorNodes.get(node);
  assert.ok(asset && line?.includes(`chipImg: '${asset}'`) && exists(asset), item);
}

const screens = ['settings.html', 'index.html'];
const rendererFiles = new Set(screens);
for (const screen of screens) {
  for (const [, dependency] of read(screen).matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.(?:js|css))"/g)) {
    rendererFiles.add(dependency);
  }
}
const inventory = new Set();
for (const file of rendererFiles) {
  for (const [filePath] of read(file).matchAll(/assets\/icons\/[\w/.-]+\.(?:png|webp|svg)\b/g)) {
    inventory.add(filePath);
  }
}
const missing = [...inventory].filter((file) => !exists(file));
assert.deepEqual(missing, [], 'Every literal icon asset used by a renderer must exist');

const gameArt = new Set([
  'assets/icons/aoe2/u_218.png', // Monje estándar en APM y en el editor de Build Orders.
  ...Object.values(maps).map((slug) => `assets/maps/${slug}.webp`),
  ...Object.keys(CIV_GUIDE).map((slug) => `assets/civs/${slug}.png`),
  ...Object.values(tree.nodes).map((node) => node.icon).filter(Boolean),
]);
assert.deepEqual([...gameArt].filter((file) => !exists(file)), [], 'Data-selected game artwork must exist');
const productArt = new Set([
  ...Object.keys(icons.files).map(icons.asset),
  'assets/icons/relic/frame-crest.webp',
  'assets/icons/relic/frame-tile.webp',
  'assets/icons/relic/frame-portrait.webp',
]);
const unclassified = [...inventory].filter((file) => !productArt.has(file) && !gameArt.has(file));
assert.deepEqual(unclassified, [], 'Renderer icons must belong to the Relic catalog or the game data');
for (const file of fs.readdirSync(path.join(root, 'src/i18n/locales')).filter((file) => file.endsWith('.json'))) {
  const data = JSON.parse(read(`src/i18n/locales/${file}`));
  for (const [group, key] of [
    ['plansPage', 'ultraRibbon'], ['referrals', 'claimedTitle'], ['referrals', 'completed'],
    ['referrals', 'invActivated'], ['postmatch', 'recordTag'], ['postmatch', 'challengeDone'],
    ['postmatch', 'personalBest'], ['postmatch', 'improveTag'], ['cx', 'rmReplayBadge'],
    ['tt', 'availIn'], ['tt', 'missingIn'], ['apm', 'planGoalMetTag'],
  ]) {
    assert.doesNotMatch(data[group]?.[key] || '', /^[✓★×▲]\s*/, `${file} / ${group}.${key}`);
  }
}

console.log(`Iconografía: ${Object.keys(icons.files).length} funciones del catálogo, ${inventory.size} rutas estáticas y ${gameArt.size} recursos de juego por datos.`);
