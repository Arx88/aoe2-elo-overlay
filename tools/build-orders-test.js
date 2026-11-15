'use strict';
const assert = require('node:assert/strict');
const { buildSmartBuildOrder, REFERENCE_LABEL } = require('../src/build-orders');
const { buildAutomaticOpportunityPlans } = require('../src/opportunities');
const { renderSmartBuildOrder, icon } = require('../ui/tactical-ui');
const base = { ownCiv: 'Franks', mapName: 'Arabia', mode: 3 };
const text = (guide) => guide.checkpoints.map((point) => point.text).join(' ');
const byKey = (result, key) => result.guides.find((guide) => guide.key === key);

const initial = buildSmartBuildOrder(base);
const markup = renderSmartBuildOrder(initial);
assert.match(markup, /Smart Build Order/);
assert.match(markup, /pasos actuales sin medir/);
assert.match(markup, /class="build-resource wood"/);
assert.doesNotMatch(markup, /<button|<input|<select|<a |<details|progress|aria-checked/);
assert.equal((renderSmartBuildOrder(initial, { library: true }).match(/<details>/g) || []).length, 5);
for (const key of new Set(initial.guides.flatMap((guide) => guide.checkpoints.flatMap((point) => point.icons)))) {
  if (key !== 'compass') assert.notEqual(icon(key), icon('compass'), `dedicated icon required: ${key}`);
}
assert.doesNotMatch(renderSmartBuildOrder({ ...initial, ownCiv: '<img src=x onerror=bad>' }), /<img src=x/);
assert.equal(initial.status, 'ready');
assert.equal(initial.selected.key, 'scouts');
assert.equal(initial.guides.length, 5);
assert.equal(initial.referenceLabel, REFERENCE_LABEL);
assert.equal(initial.data.liveOpeningKnown, false);
assert.equal(initial.data.liveStepsKnown, false);
assert.equal(initial.data.liveEconomyKnown, false);
assert.equal(initial.data.currentAgeKnown, false);
for (const guide of initial.guides) {
  assert.equal(guide.checkpoints.length, 5);
  assert.ok(guide.checkpoints.every((point) => point.icons.length && point.text));
  assert.ok(guide.sources.every((source) => source.startsWith('https://')));
  assert.equal('progress' in guide, false);
  assert.equal('currentStep' in guide, false);
}
assert.deepEqual(buildSmartBuildOrder({ ...base, now: 1, startedAt: 1, population: 100, observedOpening: 'Fast castle' }), initial,
  'wall time and unverified live hints cannot change the reference or mark progress');

for (const input of [
  { ownCiv: 'Random' }, { ownCiv: 'Franks', ownCivConfirmed: false },
  { mode: null }, { mode: 13 }, { mode: 1 }, { mode: 4 },
  { startingAge: 'feudal' }, { standardStart: false }, { settingsKnown: false }, { customStart: true },
  { mapName: 'Nomad' }, { mapName: 'Land Nomad' }, { mapName: 'African Clearing' },
  { mapName: 'Islands' }, { mapName: 'Four Lakes' }, { mapName: 'MegaRandom' },
  { mapName: 'Steppe' }, { mapName: 'Unknown' }, { mapName: '' },
]) {
  const result = buildSmartBuildOrder({ ...base, ...input });
  assert.equal(result.status, 'unavailable', JSON.stringify(input));
  assert.equal(result.selected, null, JSON.stringify(input));
  assert.equal(result.guides.length, 5, 'the launcher retains the reference library even when automatic selection abstains');
  assert.ok(result.reasons.length);
}
assert.equal(buildSmartBuildOrder({ ...base, startingAge: 'Dark Age' }).status, 'ready');
assert.equal(buildSmartBuildOrder({ ...base, mode: 'RM 1v1 (Controller)' }).status, 'ready');

const mayans = buildSmartBuildOrder({ ...base, ownCiv: 'Mayans' });
assert.equal(mayans.selected.key, 'archers');
assert.equal(byKey(mayans, 'scouts').available, false);
assert.match(text(mayans.selected), /sin copiar una numeración genérica/);
assert.match(text(buildSmartBuildOrder({ ...base, ownCiv: 'Chinese' }).selected), /sin copiar una numeración genérica/);
const huns = buildSmartBuildOrder({ ...base, ownCiv: 'Huns' });
assert.ok(huns.guides.every((guide) => guide.caveats.some((message) => message.includes('no necesitan casas'))));
assert.equal(buildSmartBuildOrder({ ...base, ownCiv: 'Gurjaras' }).selected, null);
assert.ok(buildSmartBuildOrder({ ...base, ownCiv: 'Gurjaras' }).guides.every((guide) => !guide.available));
const bulgarians = buildSmartBuildOrder({ ...base, ownCiv: 'Bulgarians' });
assert.match(text(byKey(bulgarians, 'maa-archers')), /mejora.*gratuita/);
assert.doesNotMatch(text(byKey(bulgarians, 'maa-archers')), /mejorá las milicias/);
const khmer = buildSmartBuildOrder({ ...base, ownCiv: 'Khmer', mapName: 'Arena' });
assert.equal(khmer.selected.key, 'fc');
assert.match(text(khmer.selected), /omite los prerrequisitos/);
assert.doesNotMatch(text(khmer.selected), /Mercado y herrería son/);
assert.match(text(byKey(buildSmartBuildOrder({ ...base, ownCiv: 'Spanish' }), 'archers')), /no tiene ballestero genérico/);
const mayanFc = buildSmartBuildOrder({ ...base, ownCiv: 'Mayans', mapName: 'Arena' });
assert.equal(mayanFc.selected.key, 'fc');
assert.doesNotMatch(text(mayanFc.selected), /caballeros/);
assert.match(text(buildSmartBuildOrder({ ...base, ownCiv: 'Armenians' }).selected), /carro de mulas/);
assert.ok(buildSmartBuildOrder({ ...base, ownCiv: 'Italians' }).selected.caveats.some((message) => message.includes('descuentos')));

const turksFi = buildSmartBuildOrder({ ...base, ownCiv: 'Turks', mapName: 'Arena' });
assert.equal(turksFi.selected.key, 'fi');
assert.notEqual(buildSmartBuildOrder({ ...base, ownCiv: 'Turks', mapName: 'Hideout' }).selected.key, 'fi');
assert.equal(byKey(buildSmartBuildOrder({ ...base, ownCiv: 'Britons', mapName: 'Arena' }), 'fi').available, false);

const opportunityStages = buildAutomaticOpportunityPlans({ ...base, rivalCiv: 'Britons' });
const linked = buildSmartBuildOrder({ ...base, opportunityStages });
assert.equal(linked.status, 'ready');
assert.match(linked.reasons[0], /mejor puntuada/);
const untrustedStage = [{ status: 'ready', age: 'castle', ownCiv: 'Franks', mapName: 'Arabia', candidates: [{ key: 'knights', score: 99 }] }];
assert.equal(buildSmartBuildOrder({ ...base, opportunityStages: untrustedStage }).selected.key, 'scouts',
  'a Castle cavalry opportunity cannot be treated as proof of a Scouts opening');
const archerStage = [{ status: 'ready', age: 'feudal', ownCiv: 'Franks', mapName: 'Arabia', candidates: [{ key: 'archers', score: 99 }] }];
assert.equal(buildSmartBuildOrder({ ...base, opportunityStages: archerStage }).selected.key, 'archers');
assert.equal(buildSmartBuildOrder({ ...base, opportunityStages: archerStage.map((stage) => ({ ...stage, mapName: 'Arena' })) }).selected.key, 'scouts');
assert.equal(buildSmartBuildOrder({ ...base, opportunityStages: archerStage.map((stage) => ({ ...stage, ownCiv: 'Mayans' })) }).selected.key, 'scouts');
assert.equal(buildSmartBuildOrder({ ...base, opportunityStages: archerStage.map((stage) => ({ ...stage, candidates: [{ key: 'archers', score: NaN }] })) }).selected.key, 'scouts');

// Independent results must not share mutable guide/checkpoint arrays.
initial.guides[0].checkpoints[0].text = 'mutated';
assert.notEqual(buildSmartBuildOrder(base).guides[0].checkpoints[0].text, 'mutated');
console.log('Smart Build Order: contexto RM, cinco referencias, civs, abstención, selección automática y ausencia de progreso ficticio OK.');
