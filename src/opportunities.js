'use strict';

const tree = require('./civ-tech.json');
const { CIV_GUIDE } = require('./civ-guide');
const { civSlug } = require('./civs');
const { resolveMode } = require('./insights');

const VERSION = 'contextual-opportunities-v1';
const AGES = { feudal: 2, castle: 3, imperial: 4 };
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ARCHER_TECHS = [['Fletching', 2], ['Bodkin Arrow', 3], ['Bracer', 4], ['Padded Archer Armor', 2], ['Leather Archer Armor', 3], ['Ring Archer Armor', 4], ['Thumb Ring', 3], ['Ballistics', 3]];
const CAV_TECHS = [['Forging', 2], ['Iron Casting', 3], ['Blast Furnace', 4], ['Scale Barding Armor', 2], ['Chain Barding Armor', 3], ['Plate Barding Armor', 4], ['Bloodlines', 2], ['Husbandry', 3]];
const INF_TECHS = [['Forging', 2], ['Iron Casting', 3], ['Blast Furnace', 4], ['Scale Mail Armor', 2], ['Chain Mail Armor', 3], ['Plate Mail Armor', 4]];
// Tiers are potential availability, never research already completed in-game.
const LINES = {
  archers: { label: 'Arqueros', icon: 'bow', role: 'archers', tiers: [[2, 'Archer'], [3, 'Crossbowman'], [4, 'Arbalester']], techs: ARCHER_TECHS },
  scouts: { label: 'Caballería ligera', icon: 'sword', role: 'cavalry', tiers: [[2, 'Scout Cavalry'], [3, 'Light Cavalry'], [4, 'Hussar', 'Winged Hussar']], techs: CAV_TECHS },
  infantry: { label: 'Infantería de espada', icon: 'sword', role: 'infantry', tiers: [[2, 'Man-at-Arms'], [3, 'Long Swordsman'], [4, 'Two-Handed Swordsman'], [4, 'Champion', 'Legionary']], techs: INF_TECHS },
  knights: { label: 'Caballería pesada', icon: 'shield', role: 'cavalry', tiers: [[3, 'Knight', 'Hei Guang Cavalry'], [4, 'Cavalier', 'Heavy Hei Guang Cavalry'], [4, 'Paladin', 'Savar']], techs: CAV_TECHS },
  camels: { label: 'Camellos', icon: 'shield', role: 'camels', tiers: [[3, 'Camel Rider'], [4, 'Heavy Camel Rider', 'Imperial Camel Rider']], techs: CAV_TECHS },
  eagles: { label: 'Guerreros águila', icon: 'sword', role: 'infantry', tiers: [[2, 'Eagle Scout'], [3, 'Eagle Warrior'], [4, 'Elite Eagle Warrior']], techs: INF_TECHS },
  cavarchers: { label: 'Arqueros montados', icon: 'bow', role: 'cavarchers', tiers: [[3, 'Cavalry Archer', 'Mounted Crossbowman'], [4, 'Heavy Cavalry Archer', 'Heavy Mounted Crossbowman']], techs: [...ARCHER_TECHS, ['Bloodlines', 2], ['Husbandry', 3], ['Parthian Tactics', 4]] },
  siege: { label: 'Asedio de apoyo', icon: 'castle', role: 'siege', tiers: [[3, 'Mangonel'], [4, 'Onager'], [4, 'Siege Onager']], techs: [['Siege Engineers', 4]] },
  skirmishers: { label: 'Guerrilleros', icon: 'shield', response: true, tiers: [[2, 'Skirmisher'], [3, 'Elite Skirmisher'], [4, 'Imperial Skirmisher']], techs: ARCHER_TECHS.filter(([n]) => n !== 'Thumb Ring' && n !== 'Ballistics') },
  spears: { label: 'Lanzas y piqueros', icon: 'shield', response: true, tiers: [[2, 'Spearman'], [3, 'Pikeman'], [4, 'Halberdier']], techs: INF_TECHS },
  monks: { label: 'Monjes', icon: 'target', response: true, tiers: [[3, 'Monk']], techs: [['Sanctity', 3], ['Fervor', 3], ['Block Printing', 4], ['Theocracy', 4]] },
};
// Decision-policy weights, not measured damage or matchup win probabilities.
const COUNTERS = {
  archers: { skirmishers: 1, siege: .9, knights: .7, eagles: .85, scouts: .45 },
  scouts: { spears: 1, camels: 1, knights: .8 },
  infantry: { archers: .9, cavarchers: .95, siege: .6 },
  knights: { camels: 1, spears: .9, monks: .8 },
  camels: { spears: .95, infantry: .7, archers: .5 },
  eagles: { infantry: 1, knights: .7 },
  cavarchers: { skirmishers: 1, camels: .7, siege: .6 },
  siege: { scouts: 1, knights: 1, eagles: .9 },
  skirmishers: { scouts: 1, knights: 1, siege: .8 },
  spears: { archers: .95, infantry: .9, siege: .6 },
  monks: { scouts: 1, eagles: 1, archers: .7 },
};

function roleAffinity(slug, key) {
  const role = fold(CIV_GUIDE[slug]?.role);
  return key === 'archers' ? Number(role.includes('arqueros') && !role.includes('caballo'))
    : key === 'cavarchers' ? Number(role.includes('arquerosacaballo'))
      : Number(role.includes({ cavalry: 'caballeria', infantry: 'infanteria', camels: 'camellos', siege: 'asedio' }[key] || 'no-role'));
}

function lineQuality(slug, key, age) {
  const nodes = tree.civilizations[slug]?.nodes;
  const line = LINES[key];
  if (!nodes || !line) return null;
  const available = (name) => Number.isInteger(nodes[name]) && nodes[name] <= age;
  const targets = line.tiers.filter(([at]) => at <= age);
  const present = line.tiers.flatMap(([, ...names]) => names.filter(available));
  if (!present.length) return null;
  const chosen = present.at(-1);
  const reachedTier = line.tiers.findIndex(([, ...names]) => names.includes(chosen)) + 1;
  const tierCoverage = Math.min(1, reachedTier / Math.max(1, targets.length));
  const required = line.techs.filter(([, at]) => at <= age);
  const missing = required.filter(([name]) => !available(name)).map(([name]) => name);
  const techCoverage = required.length ? 1 - missing.length / required.length : 1;
  return { key, label: line.label, unit: chosen, score: .45 + .30 * tierCoverage + .25 * techCoverage,
    earlyAccess: Math.max(0, reachedTier - targets.length), tierCoverage, techCoverage, missingTechs: missing };
}

function openingLine(value) {
  const name = fold(value);
  if (/archer|arquer/.test(name)) return 'archers';
  if (/scout|explorador/.test(name)) return 'scouts';
  if (/manatarms|maa|militia|drush/.test(name) && !/castle|fc/.test(name)) return 'infantry';
  if (/knight/.test(name)) return 'knights';
  return null; // Fast Castle is not evidence of a specific army or boom.
}

function time(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  const result = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : null;
}

function historicalRows(rows, context, own = false) {
  const mode = resolveMode(context.mode);
  const now = context.now || Date.now();
  const cutoff = Math.min(time(context.cutoff) || now, now);
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const at = time(row.startedAt);
    const map = own ? row.mapName : row.map;
    const rowMode = own ? resolveMode(row.leaderboardId) : row.ladder ? resolveMode(row.ladder) : mode;
    if (!row.matchId || String(row.matchId) === String(context.currentMatchId) || typeof row.won !== 'boolean' ||
        !at || at >= cutoff || cutoff - at > 180 * 86400000 || !mode || !rowMode || rowMode.id !== mode.id ||
        fold(map) !== fold(context.mapName)) continue;
    unique.set(String(row.matchId), { ...row, weight: 2 ** (-(cutoff - at) / (90 * 86400000)) });
  }
  return [...unique.values()];
}

function posterior(rows, success, prior, strength = 12) {
  const weight = rows.reduce((s, row) => s + row.weight, 0);
  const successes = rows.reduce((s, row) => s + (success(row) ? row.weight : 0), 0);
  return { mean: (successes + strength * prior) / (weight + strength), weight,
    reliability: weight / (weight + strength), games: rows.length,
    successes: rows.filter(success).length };
}

function buildOpportunityPlan(options = {}) {
  const { ownCiv, rivalCiv, mapName, age = 'feudal', rows = [], ownRows = [] } = options;
  const observedArmy = options.observedArmySource === 'verified-telemetry' ? options.observedArmy || null : null;
  const ownSlug = civSlug(ownCiv), rivalSlug = civSlug(rivalCiv), ageId = AGES[age];
  if (!ageId || (observedArmy != null && !LINES[observedArmy])) return { status: 'invalid', version: VERSION, candidates: [] };
  if (!tree.civilizations[ownSlug] || !tree.civilizations[rivalSlug] || !mapName || !resolveMode(options.mode)) {
    return { status: 'unavailable', version: VERSION, candidates: [], reason: 'Esperando ambas civilizaciones, mapa y modo compatibles.' };
  }
  const mode = resolveMode(options.mode);
  const all = historicalRows(rows, options);
  if (['islands', 'teamislands'].includes(fold(mapName)) || all.some((row) => fold(row.openness) === 'water')) return { status: 'unavailable', version: VERSION,
    candidates: [], reason: 'Este modelo evalúa combate terrestre; todavía falta incorporar armadas para mapas de agua.' };
  const sameCiv = all.filter((row) => civSlug(row.civ) === rivalSlug);
  const civRows = sameCiv.length >= 5 ? sameCiv : all;
  const matchupRows = civRows.filter((row) => (row.opponents || [row]).some((opponent) => civSlug(opponent.oppCiv) === ownSlug));
  const exactMatchup = sameCiv.length >= 5 && matchupRows.length >= 8;
  const scopeRows = exactMatchup ? matchupRows : civRows;
  const specificity = exactMatchup ? 1 : sameCiv.length >= 5 ? .85 : .60;
  const baseline = posterior(scopeRows, (row) => !row.won, .5, 4);
  const mine = historicalRows(ownRows, options, true);
  const ownCivRows = mine.filter((row) => civSlug(row.civ) === ownSlug);
  const ownBase = posterior(mine, (row) => row.won, .5, 4);
  const ownFit = posterior(ownCivRows, (row) => row.won, ownBase.mean);
  const proficiency = ownCivRows.length >= 3 ? clamp((ownFit.mean - ownBase.mean) / .25, -1, 1) * ownFit.reliability : 0;
  const own = Object.keys(LINES).map((key) => lineQuality(ownSlug, key, ageId)).filter(Boolean);
  const enemy = Object.keys(LINES).map((key) => lineQuality(rivalSlug, key, ageId)).filter(Boolean);
  const enemyFrequency = new Map();
  const classified = scopeRows.filter((row) => openingLine(row.strategy));
  for (const row of classified) {
    const key = openingLine(row.strategy);
    enemyFrequency.set(key, (enemyFrequency.get(key) || 0) + row.weight);
  }
  const frequencyTotal = scopeRows.reduce((sum, row) => sum + row.weight, 0);
  const historical = classified.length >= 5 ? [...enemyFrequency].map(([key, weight]) => ({ key, share: weight / frequencyTotal })) : [];
  const threats = observedArmy ? [{ key: observedArmy, share: 1 }] : historical;
  const threatWeight = observedArmy ? 1 : ageId === 2 ? 1 : ageId === 3 ? .5 : .2;
  const teamFactor = mode.size === 'team' ? .4 : 1;
  const candidates = own.filter((line) => !LINES[line.key].response).map((line) => {
    const counters = enemy.map((response) => ({ ...response, risk: (COUNTERS[line.key]?.[response.key] || 0) * response.score }))
      .filter((response) => response.risk > 0).sort((a, b) => b.risk - a.risk);
    // A unique counter is modeled explicitly; absence of Halberdier alone
    // never turns a civ with camels/monks/pikes into a cavalry weakness.
    if (line.key === 'archers' && rivalSlug === 'goths' && tree.civilizations[rivalSlug].nodes.Huskarl <= ageId) {
      counters.unshift({ key: 'huskarl', label: 'Huskarls', risk: .98 });
    }
    const counterRisk = clamp((counters[0]?.risk || 0) + .05 * Math.max(0, counters.filter((c) => c.risk >= .6).length - 1));
    const faced = scopeRows.filter((row) => (row.opponents || [row]).some((opponent) =>
      (!exactMatchup || civSlug(opponent.oppCiv) === ownSlug) && openingLine(opponent.oppStrategy) === line.key));
    const observed = posterior(faced, (row) => !row.won, baseline.mean);
    const evidenceStrength = faced.length >= 3 ? observed.reliability * specificity * teamFactor : 0;
    const empirical = evidenceStrength * clamp((observed.mean - baseline.mean) / .25, -1, 1);
    const responseFit = threats.reduce((sum, threat) => sum + (COUNTERS[threat.key]?.[line.key] || 0) * threat.share, 0);
    const currentRisk = observedArmy ? (COUNTERS[line.key]?.[observedArmy] || 0) : 0;
    const components = { tree: 30 * (line.score - .65), affinity: 8 * roleAffinity(ownSlug, LINES[line.key].role), earlyAccess: Math.min(6, 4 * line.earlyAccess), counter: 18 * (.55 - counterRisk),
      history: 18 * empirical, response: 10 * responseFit * threatWeight, proficiency: 6 * proficiency, observedRisk: -17 * currentRisk };
    const score = Math.round(clamp(50 + Object.values(components).reduce((s, n) => s + n, 0), 0, 100));
    const supporting = own.filter((entry) => entry.key !== line.key).map((entry) => ({ ...entry,
      response: threats.reduce((sum, threat) => sum + (COUNTERS[threat.key]?.[entry.key] || 0) * entry.score * threat.share, 0) }))
      .sort((a, b) => b.response - a.response).find((entry) => entry.response >= .35);
    return { key: line.key, label: line.label, icon: LINES[line.key].icon, score,
      unit: line.unit, missingTechs: line.missingTechs, components,
      counters: counters.slice(0, 3).map(({ key, label, risk }) => ({ key, label, risk })),
      history: { games: faced.length, losses: observed.successes, baselineGames: scopeRows.length,
        adjustedLossRate: Math.round(observed.mean * 100), baselineLossRate: Math.round(baseline.mean * 100),
        reliability: evidenceStrength, scope: exactMatchup ? 'same-map-and-matchup' : sameCiv.length >= 5 ? 'same-map-and-civ' : 'same-map-all-civs' },
      support: supporting ? { key: supporting.key, label: supporting.label, unit: supporting.unit } : null,
      condition: counters.length ? `Confirmá si produce ${counters.slice(0, 2).map((c) => c.label.toLowerCase()).join(' o ')} antes de invertir en masa.` : 'Confirmá su composición y las unidades únicas antes de invertir en masa.',
    };
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return { status: 'ready', version: VERSION, ownCiv, rivalCiv, mapName, age, observedArmy,
    contextSample: scopeRows.length, sameCivSample: sameCiv.length, candidates: candidates.slice(0, 3),
    confidence: !scopeRows.length ? 'sin muestra histórica' : baseline.weight >= 20 ? 'moderada' : 'limitada',
    ownExperience: { games: ownCivRows.length, wins: ownCivRows.filter((row) => row.won).length },
    data: { treeRef: tree.source.ref, historicalWindowDays: 180, halfLifeDays: 90,
      unadjustedHistoricalElo: true, unverifiedHistoricalPatch: true, teamResults: mode.size === 'team',
      actualResourcesKnown: false, actualResearchKnown: false, actualArmySource: observedArmy ? 'verified-telemetry' : 'historical-or-unknown' },
  };
}

function buildAutomaticOpportunityPlans(options = {}) {
  return Object.keys(AGES).map((age) => buildOpportunityPlan({ ...options, age,
    observedArmy: null, observedArmySource: null }));
}

module.exports = { buildOpportunityPlan, buildAutomaticOpportunityPlans, lineQuality, openingLine, AGES, LINES, VERSION };
