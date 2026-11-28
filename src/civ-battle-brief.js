'use strict';

/**
 * Relic · Inteligencia Táctica de Civilización en Vivo (`src/civ-battle-brief.js`)
 *
 * Reemplaza el texto enciclopédico truncado de `Ayuda de civ` por una lectura
 * táctica de 4 segundos alimentada por:
 *   1) +165.152 partidas reales Top Pro / +2000 / +1900 (`pro-matchup-data.json`),
 *      tanto para cruces 1v1 como para roles y focos en partidas de equipo (TG).
 *   2) Perfiles competitivos verificados (`civ-matchup-profiles.js`) con unidad única,
 *      pico de edad y respuestas reales.
 *   3) Árbol tecnológico real (`civ-tech.json` + `techtree-data.json`), filtrando
 *      falsos huecos (p. ej. sin Pureza de sangre en Francos o sin Paladín en civs
 *      mesoamericanas) y priorizando las brechas que importan frente al rival actual.
 */

const { CIV_GUIDE } = require('./civ-guide');
const { CIV_SLUGS, civSlug } = require('./civs');
const CIV_SLUG_SET = CIV_SLUGS instanceof Set ? CIV_SLUGS : new Set(CIV_SLUGS || []);
const CIV_TECH = require('./civ-tech.json').civilizations || {};
const TECHTREE = require('./training/techtree-data.json');
const { CIV_MATCHUP_PROFILES } = require('./training/civ-matchup-profiles');
const {
  loadProMatchupDataset,
  resolveLandMapType,
  symWinPct,
  symBucketEdge,
} = require('./training/pro-matchup-engine');

// Índice en memoria por nombre inglés en techtree-data.json -> { id, ut, name, nameEn, icon }
const NODE_BY_EN = new Map();
for (const node of Object.values(TECHTREE.nodes || {})) {
  if (node && node.nameEn && !NODE_BY_EN.has(node.nameEn)) {
    NODE_BY_EN.set(node.nameEn, {
      id: node.id,
      ut: node.ut,
      nameEs: node.name || node.nameEn,
      nameEn: node.nameEn,
      icon: node.icon || null,
    });
  }
}

function getNodeRef(nameEn, fallbackIcon = null) {
  const hit = NODE_BY_EN.get(nameEn);
  if (hit) return hit;
  return { id: null, ut: 'U', nameEs: nameEn, nameEn, icon: fallbackIcon };
}

// Normalización de aperturas del dataset Pro -> clave canónica de AppI18n.openingName + icono real AoE2:DE
const PRO_OPENING_MAP = Object.freeze({
  'Rush de Scouts': { key: 'Scout Rush', nodeEn: 'Scout Cavalry' },
  'Apertura de Scouts': { key: 'Scout Rush', nodeEn: 'Scout Cavalry' },
  'Rush de Arqueros': { key: 'Archer Rush', nodeEn: 'Archer' },
  'Apertura de Arqueros': { key: 'Archer Rush', nodeEn: 'Archer' },
  'Drush → Arqueros': { key: 'Drush Archers', nodeEn: 'Archer' },
  'Drush temprano': { key: 'Drush', nodeEn: 'Militia' },
  'Drush → Fast Castle': { key: 'Drush Fast Castle', nodeEn: 'Militia' },
  'Rush de Hombres de armas': { key: 'M@A Rush', nodeEn: 'Man-at-Arms' },
  'Hombres de armas': { key: 'M@A Rush', nodeEn: 'Man-at-Arms' },
  'Hombres de armas → Guerrilleros': { key: 'M@A Rush', nodeEn: 'Man-at-Arms' },
  'Scouts → Arqueros': { key: 'Scouts into Archers', nodeEn: 'Scout Cavalry' },
  'Presión con Torres': { key: 'Tower Rush', nodeEn: 'Watch Tower' },
  'Donjon + Serjeants': { key: 'Serjeant Rush', nodeEn: 'Serjeant' },
  'Fast Castle': { key: 'Fast Castle', nodeEn: 'Knight' },
  'Fast Castle directo': { key: 'Fast Castle', nodeEn: 'Knight' },
  'Fast Castle → Boom 3 TC': { key: 'FC Boom', nodeEn: 'Town Center' },
  'Fast Castle → Unidad Única (1 TC)': { key: 'Fast Castle', nodeEn: 'Castle' },
  'Boom 2 TC en Feudal': { key: '2TC Feudal Boom', nodeEn: 'Town Center' },
  'Defensa Lancero + Guerrillero': { key: 'Pike Skirm', nodeEn: 'Skirmisher' },
  'Apertura defensiva de Guerrilleros': { key: 'Pike Skirm', nodeEn: 'Skirmisher' },
  'Apertura de Champis': { key: 'Scout Rush', nodeEn: 'Eagle Scout' },
});

const PROFILE_OPENING_FALLBACK = Object.freeze({
  scouts: { key: 'Scout Rush', nodeEn: 'Scout Cavalry', casNodeEn: 'Knight' },
  camels: { key: 'Scout Rush', nodeEn: 'Scout Cavalry', casNodeEn: 'Camel Rider' },
  archers: { key: 'Archer Rush', nodeEn: 'Archer', casNodeEn: 'Crossbowman' },
  cavarchers: { key: 'Scout Rush', nodeEn: 'Scout Cavalry', casNodeEn: 'Cavalry Archer' },
  infantry: { key: 'M@A Rush', nodeEn: 'Man-at-Arms', casNodeEn: 'Long Swordsman' },
  eagles: { key: 'Drush Archers', nodeEn: 'Eagle Scout', casNodeEn: 'Eagle Warrior' },
  champis: { key: 'Scout Rush', nodeEn: 'Eagle Scout', casNodeEn: 'Eagle Warrior' },
});

// Mapeo de transiciones de Castillos frecuentes en pro-matchup-data.json -> nodo oficial de AoE2:DE
const CASTLE_TOKEN_NODES = [
  [/jinetes|caballeros|knight/i, 'Knight'],
  [/ballesteros|crossbow/i, 'Crossbowman'],
  [/arqueros a caballo|cav.*archer/i, 'Cavalry Archer'],
  [/camello/i, 'Camel Rider'],
  [/águila|eagle/i, 'Eagle Warrior'],
  [/monjes|monk/i, 'Monk'],
  [/mangana|asedio/i, 'Mangonel'],
  [/guerrilleros|hostigador|skirm/i, 'Elite Skirmisher'],
  [/caballería ligera|light cav/i, 'Light Cavalry'],
  [/piquero|lancero/i, 'Pikeman'],
  [/infantería|espada/i, 'Long Swordsman'],
  [/elefante/i, 'Battle Elephant'],
  [/conquistador/i, 'Conquistador'],
  [/huscarle/i, 'Huskarl'],
  [/mangudai/i, 'Mangudai'],
  [/ghulam/i, 'Ghulam'],
  [/husita/i, 'Hussite Wagon'],
  [/shrivamsha/i, 'Shrivamsha Rider'],
  [/ratán/i, 'Rattan Archer'],
  [/hei guang/i, 'Knight'],
];

const ROLE_COUNTER_REFS = Object.freeze({
  skirmishers: 'Elite Skirmisher',
  siege: 'Mangonel',
  knights: 'Knight',
  scouts: 'Light Cavalry',
  archers: 'Crossbowman',
  cavarchers: 'Cavalry Archer',
  spears: 'Halberdier',
  camels: 'Camel Rider',
  monks: 'Monk',
  infantry: 'Champion',
  eagles: 'Eagle Warrior',
  champis: 'Eagle Warrior',
  gunpowder: 'Hand Cannoneer',
  elephants: 'Battle Elephant',
});

// Brechas del árbol tecnológico con valor real en partida (y su prioridad frente al arquetipo rival)
const CANDIDATE_TECH_HOLES = [
  { nodeEn: 'Halberdier', tags: ['antiCav'], requireStable: false },
  { nodeEn: 'Bloodlines', tags: ['cav', 'antiArch'], requireStable: true, skipCivs: new Set(['franks']) },
  { nodeEn: 'Bracer', tags: ['range', 'antiCav', 'antiInf'], requireStable: false },
  { nodeEn: 'Plate Barding Armor', tags: ['cav', 'antiArch'], requireStable: true },
  { nodeEn: 'Arbalester', tags: ['range', 'antiInf'], requireStable: false },
  { nodeEn: 'Thumb Ring', tags: ['range'], requireStable: false },
  { nodeEn: 'Ring Archer Armor', tags: ['range', 'antiArch'], requireStable: false },
  { nodeEn: 'Blast Furnace', tags: ['melee', 'cav', 'inf'], requireStable: false, skipCivs: new Set(['malians']) },
  { nodeEn: 'Plate Mail Armor', tags: ['inf', 'antiArch'], requireStable: false },
  { nodeEn: 'Redemption', tags: ['antiSiege', 'antiCav'], requireStable: false },
  { nodeEn: 'Bombard Cannon', tags: ['antiSiege', 'late'], requireStable: false },
  { nodeEn: 'Siege Engineers', tags: ['late', 'antiArch'], requireStable: false },
  { nodeEn: 'Siege Ram', tags: ['antiArch', 'late'], requireStable: false, altPresent: ['Armored Elephant', 'Siege Elephant'] },
  { nodeEn: 'Paladin', tags: ['cavLate'], requireStable: true, onlyIfCavFocus: true },
  { nodeEn: 'Champion', tags: ['antiTrash', 'inf'], requireStable: false },
];

function inferCivArchetype(slug) {
  const prof = CIV_MATCHUP_PROFILES[slug];
  if (!prof) return 'flex';
  const mods = prof.lineMods || {};
  const cavScore = Math.max(mods.knights || 0, mods.camels || 0, mods.elephants || 0, mods.scouts || 0);
  const rangeScore = Math.max(mods.archers || 0, mods.cavarchers || 0, mods.gunpowder || 0);
  const infScore = Math.max(mods.infantry || 0, mods.eagles || 0);
  if (cavScore >= rangeScore && cavScore >= infScore && cavScore >= 10) return 'cav';
  if (rangeScore >= cavScore && rangeScore >= infScore && rangeScore >= 8) return 'arch';
  if (infScore >= 12) return 'inf';
  return (prof.openings?.[0] === 'scouts' ? 'cav' : prof.openings?.[0] === 'archers' ? 'arch' : 'flex');
}

function resolveSpikeAge(slug) {
  const eco = CIV_MATCHUP_PROFILES[slug]?.ecoByAge;
  if (!Array.isArray(eco) || eco.length < 4) return 3;
  const [, feudal, castle, imperial] = eco;
  if (feudal >= castle && feudal >= imperial) return 2;
  if (imperial > castle + 3) return 4;
  return 3;
}

function parseOpeningStep(rawOpStr, fallbackSlug) {
  if (rawOpStr && PRO_OPENING_MAP[rawOpStr]) {
    const mapped = PRO_OPENING_MAP[rawOpStr];
    const ref = getNodeRef(mapped.nodeEn, 'assets/icons/ages/feudal.png');
    return {
      kind: 'opening',
      openingKey: mapped.key,
      unitId: ref.id,
      nameEs: mapped.key,
      nameEn: mapped.key,
      icon: ref.icon || 'assets/icons/ages/feudal.png',
    };
  }
  const profOp = CIV_MATCHUP_PROFILES[fallbackSlug]?.openings?.[0] || 'scouts';
  const fb = PROFILE_OPENING_FALLBACK[profOp] || PROFILE_OPENING_FALLBACK.scouts;
  const ref = getNodeRef(fb.nodeEn, 'assets/icons/ages/feudal.png');
  return {
    kind: 'opening',
    openingKey: fb.key,
    unitId: ref.id,
    nameEs: fb.key,
    nameEn: fb.key,
    icon: ref.icon || 'assets/icons/ages/feudal.png',
  };
}

function parseCastleStep(rawCasStr, fallbackSlug) {
  if (rawCasStr) {
    for (const [re, nodeEn] of CASTLE_TOKEN_NODES) {
      if (re.test(rawCasStr)) {
        const ref = getNodeRef(nodeEn);
        return {
          kind: 'unit',
          unitId: ref.id,
          ut: ref.ut,
          nameEs: ref.nameEs,
          nameEn: ref.nameEn,
          icon: ref.icon || 'assets/icons/ages/castle.png',
        };
      }
    }
  }
  const prof = CIV_MATCHUP_PROFILES[fallbackSlug];
  const mods = prof?.lineMods || {};
  if ((mods.camels || 0) >= 14 && (mods.camels || 0) > (mods.knights || 0)) {
    const camRef = getNodeRef('Camel Rider');
    return {
      kind: 'unit',
      unitId: camRef.id,
      ut: camRef.ut,
      nameEs: camRef.nameEs,
      nameEn: camRef.nameEn,
      icon: camRef.icon || 'assets/icons/ages/castle.png',
    };
  }
  if ((mods.cavarchers || 0) >= 15 && (mods.cavarchers || 0) > (mods.archers || 0) && (mods.cavarchers || 0) >= (mods.knights || 0)) {
    const caRef = getNodeRef('Cavalry Archer');
    return {
      kind: 'unit',
      unitId: caRef.id,
      ut: caRef.ut,
      nameEs: caRef.nameEs,
      nameEn: caRef.nameEn,
      icon: caRef.icon || 'assets/icons/ages/castle.png',
    };
  }
  if (prof?.uniqueUnit?.node && (prof.uniqueUnit.power || 0) >= 88) {
    const uuRef = getNodeRef(prof.uniqueUnit.node);
    return {
      kind: 'unit',
      unitId: uuRef.id,
      ut: uuRef.ut,
      nameEs: prof.uniqueUnit.es || uuRef.nameEs,
      nameEn: uuRef.nameEn,
      icon: uuRef.icon || 'assets/icons/ages/castle.png',
    };
  }
  const profOp = prof?.openings?.[0] || 'scouts';
  const fb = PROFILE_OPENING_FALLBACK[profOp] || PROFILE_OPENING_FALLBACK.scouts;
  const ref = getNodeRef(fb.casNodeEn);
  return {
    kind: 'unit',
    unitId: ref.id,
    ut: ref.ut,
    nameEs: ref.nameEs,
    nameEn: ref.nameEn,
    icon: ref.icon || 'assets/icons/ages/castle.png',
  };
}

function rejoinBrokenLines(rawList) {
  if (!Array.isArray(rawList)) return [];
  const merged = [];
  for (const raw of rawList) {
    const line = String(raw || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const prev = merged.length > 0 ? merged[merged.length - 1] : '';
    const prevDangling = /(?:[,;:/]|\b(?:y|e|o|de|del|la|las|los|el|en|a|al|con|por|para|que|un|una))\s*$/i.test(prev);
    const startsContinuation = /^[a-záéíóúñ]|^(?:la Edad|las edades|Edad de|Edad Imperial|de los Castillos|e Imperial)/i.test(line) &&
      (prevDangling || /^[a-záéíóúñ]/.test(line));
    if (merged.length > 0 && (prevDangling || startsContinuation)) {
      merged[merged.length - 1] = `${prev.replace(/\s+$/, '')} ${line}`;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

function compactBonusText(raw) {
  let s = String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  s = s
    .replace(/,?\s*respectivamente\.?$/i, '')
    .replace(/\ben la (?:Alta Edad Media|Edad Oscura),\s*la Edad Feudal,\s*la Edad de los Castillos y la Edad Imperial\b/gi, '(por edad)')
    .replace(/\ben la Edad Feudal,\s*la Edad de los Castillos y la Edad Imperial\b/gi, '(Feudal/Castillos/Imp)')
    .replace(/\ben las edades Feudal[,/]\s*(?:de los )?Castillos\s*(?:e|\/)\s*Imperial\b/gi, '(Feudal/Castillos/Imp)')
    .replace(/\ben la Edad Feudal\s*\/\s*Edad de los Castillos\s*\/\s*Edad Imperial\b/gi, '(Feudal/Castillos/Imp)')
    .replace(/\ben la Edad de los Castillos y (?:en )?la Edad Imperial\b/gi, '(Castillos/Imp)')
    .replace(/\ba partir de la Edad de los Castillos\b/gi, '(desde Castillos)')
    .replace(/\ba partir de la Edad Feudal\b/gi, '(desde Feudal)')
    .replace(/\ba partir de la (?:Alta Edad Media|Edad Oscura)\b/gi, '(desde Alta Edad)')
    .replace(/\ben la Edad de los Castillos\b/gi, '(Castillos)')
    .replace(/\ben la Edad Feudal\b/gi, '(Feudal)')
    .replace(/\ben la Edad Imperial\b/gi, '(Imperial)')
    .replace(/\ben la (?:Alta Edad Media|Edad Oscura)\b/gi, '(Alta Edad)')
    .replace(/\(Feudal\)\/Edad de los Castillos\/Edad Imperial/gi, '(Feudal/Castillos/Imp)')
    .replace(/^Los centros urbanos\b/i, 'Centros urbanos')
    .replace(/^Las unidades montadas ganan un\s+/i, 'Caballería ')
    .replace(/^Los arqueros a pie ganan\s+/i, 'Arqueros a pie ')
    .replace(/^El coste de los arqueros a pie se reduce un\s+/i, 'Arqueros a pie -')
    .replace(/\bcuestan un (\d+(?:\/\d+)*\s*%)\s+menos de\s+/gi, '-$1 ')
    .replace(/\bcuestan un (\d+(?:\/\d+)*\s*%)\s+menos\b/gi, '-$1 coste')
    .replace(/^Los recolectores trabajan un\s+/i, 'Bayas ')
    .replace(/^Los pastores trabajan un\s+/i, 'Pastores ')
    .replace(/^Los leñadores trabajan un\s+/i, 'Leñadores ')
    .replace(/^Los agricultores trabajan un\s+/i, 'Granjeros ')
    .replace(/^Los cazadores trabajan un\s+/i, 'Cazadores ')
    .replace(/^Los mineros de oro trabajan un\s+/i, 'Mineros de oro ')
    .replace(/^Los canteros trabajan un\s+/i, 'Canteros ')
    .replace(/^Los constructores trabajan un\s+/i, 'Constructores ')
    .replace(/\bmás de PR\b/gi, 'PR')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/[.,;:\s]+$/, '')
    .trim();
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

const MILITARY_BONUS_RE = /\b(arquero|caballer|infanter|jinete|camello|águila|elefante|asedio|alcance|ataque|armadura|pólvora|lancero|piquero|guerrillero|milicia|establo|galería|cuartel|castillo|monje|PR)\b/i;
const ECO_TEMPO_BONUS_RE = /\b(aldeano|centro[s]? urbano|madera|comida|oro|piedra|granja|molino|bayas|recolector|pastor|cazador|leñador|minero|edad|tecnolog|carretilla|telar)\b/i;
const UNIT_LABEL_LEAK_RE = /^[^.]{2,35}\((?:infantería|caballería|arquero[^)]*|asedio|naval|barco[^)]*|pólvora|monje)\)$/i;

function selectKeyBonuses(slug) {
  const rawList = rejoinBrokenLines(TECHTREE.civs?.[slug]?.bonuses);
  if (rawList.length > 0) {
    const allClean = rawList
      .filter((line) => !UNIT_LABEL_LEAK_RE.test(line))
      .map(compactBonusText)
      .filter(Boolean);
    const cleaned = allClean.filter((line) => !/buque|pesca|pescador|muelle|galera|barco|astillero|transporte/i.test(line));
    const pool = cleaned.length > 0 ? cleaned : allClean;
    if (pool.length <= 2) return pool;

    // Elegir 1 bono económico/tempo + 1 bono militar definitorio (sin truncar jamás)
    const milIdx = pool.findIndex((b) => MILITARY_BONUS_RE.test(b) && b.length <= 92);
    const ecoIdx = pool.findIndex((b, idx) => idx !== milIdx && ECO_TEMPO_BONUS_RE.test(b) && b.length <= 92);
    const picked = [];
    if (ecoIdx >= 0) picked.push(pool[ecoIdx]);
    if (milIdx >= 0 && milIdx !== ecoIdx) picked.push(pool[milIdx]);
    for (let i = 0; i < pool.length && picked.length < 2; i++) {
      if (i !== ecoIdx && i !== milIdx && pool[i].length <= 96) picked.push(pool[i]);
    }
    for (let i = 0; i < pool.length && picked.length < 2; i++) {
      if (!picked.includes(pool[i])) picked.push(pool[i]);
    }
    return picked.slice(0, 2);
  }

  // Fallback para civs de Chronicles fuera de las 56 competitivas estándar
  const guideBonuses = CIV_GUIDE[slug]?.bonuses;
  if (guideBonuses) {
    return String(guideBonuses)
      .split(/\s*·\s*/)
      .map((s) => s.replace(/…+$/, '').trim())
      .filter(Boolean)
      .slice(0, 2);
  }
  return [];
}

function selectTacticalHoles(slug, enemyArchetypes = []) {
  const nodes = CIV_TECH[slug]?.nodes;
  if (!nodes) return [];
  const prof = CIV_MATCHUP_PROFILES[slug];
  const waived = new Set(prof?.waivedTechs || []);
  const hasStable = Boolean(nodes['Scout Cavalry'] || nodes['Knight'] || nodes['Camel Rider']);
  const myArch = inferCivArchetype(slug);

  const enemyHasCav = enemyArchetypes.includes('cav');
  const enemyHasArch = enemyArchetypes.includes('arch');
  const enemyHasInf = enemyArchetypes.includes('inf');

  const scored = [];
  for (const cand of CANDIDATE_TECH_HOLES) {
    if (nodes[cand.nodeEn]) continue;
    if (waived.has(cand.nodeEn)) continue;
    if (cand.skipCivs && cand.skipCivs.has(slug)) continue;
    if (cand.requireStable && !hasStable) continue;
    if (cand.onlyIfCavFocus && myArch !== 'cav') continue;
    if (cand.nodeEn === 'Paladin' && !nodes['Knight']) continue;
    if (Array.isArray(cand.altPresent) && cand.altPresent.some((alt) => Boolean(nodes[alt]))) continue;

    let priority = 10;
    if (enemyHasCav && cand.tags.includes('antiCav')) priority += 22;
    if (enemyHasArch && cand.tags.includes('antiArch')) priority += 20;
    if (enemyHasInf && cand.tags.includes('antiInf')) priority += 18;
    if (myArch === 'cav' && cand.tags.includes('cav')) priority += 14;
    if (myArch === 'arch' && cand.tags.includes('range')) priority += 14;
    if (cand.nodeEn === 'Halberdier' || cand.nodeEn === 'Bracer' || cand.nodeEn === 'Bloodlines') priority += 8;
    if (cand.nodeEn === 'Redemption' || cand.nodeEn === 'Bombard Cannon') priority += 4;

    const ref = getNodeRef(cand.nodeEn);
    scored.push({
      priority,
      id: ref.id,
      ut: ref.ut,
      nameEs: ref.nameEs,
      nameEn: ref.nameEn,
      icon: ref.icon,
    });
  }

  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, 3).map(({ id, ut, nameEs, nameEn, icon }) => ({ id, ut, nameEs, nameEn, icon }));
}

function buildCivCardBrief(slug, { mapType = 'open', pairSide = null, enemyArchetypes = [], dataset = null } = {}) {
  if (!slug || !CIV_SLUG_SET.has(slug)) return null;
  const prof = CIV_MATCHUP_PROFILES[slug] || null;
  const guide = CIV_GUIDE[slug] || {};
  const civTrans = dataset?.civTransitions?.[mapType]?.[slug] || dataset?.civTransitions?.open?.[slug] || null;

  const isTrustedOp = (item, minGames) => {
    if (!Array.isArray(item) || (item[1] || 0) < minGames) return false;
    if (item[0] === 'Presión con Torres' && (item[1] || 0) < 8 && !prof?.openings?.includes('trush')) return false;
    return true;
  };
  const rawOpItem = isTrustedOp(pairSide?.op, 5)
    ? pairSide.op
    : isTrustedOp(pairSide?.opAlt, 5)
      ? pairSide.opAlt
      : isTrustedOp(civTrans?.op, 6)
        ? civTrans.op
        : null;
  const rawCasItem = (pairSide?.cas && pairSide.cas[1] >= 4)
    ? pairSide.cas
    : (civTrans?.cas && civTrans.cas[1] >= 4 ? civTrans.cas : null);

  const opStep = parseOpeningStep(rawOpItem?.[0] || null, slug);
  const casStep = parseCastleStep(rawCasItem?.[0] || null, slug);
  const opGames = Number(rawOpItem?.[1] || 0);
  const opWins = Number(rawOpItem?.[2] || 0);
  const opWinPct = opGames >= 5 ? Math.round((opWins / opGames) * 100) : null;

  let uniqueUnit = null;
  if (prof?.uniqueUnit?.node) {
    const uuRef = getNodeRef(prof.uniqueUnit.node);
    const counters = (prof.uniqueUnit.counteredBy || [])
      .slice(0, 2)
      .map((roleKey) => ROLE_COUNTER_REFS[roleKey])
      .filter(Boolean)
      .map((en) => {
        const r = getNodeRef(en);
        return { id: r.id, ut: r.ut, nameEs: r.nameEs, nameEn: r.nameEn, icon: r.icon };
      });
    const beats = (prof.uniqueUnit.counters || [])
      .slice(0, 2)
      .map((roleKey) => ROLE_COUNTER_REFS[roleKey])
      .filter(Boolean)
      .map((en) => {
        const r = getNodeRef(en);
        return { id: r.id, ut: r.ut, nameEs: r.nameEs, nameEn: r.nameEn, icon: r.icon };
      });
    uniqueUnit = {
      id: uuRef.id,
      ut: uuRef.ut,
      nameEs: prof.uniqueUnit.es || uuRef.nameEs,
      nameEn: uuRef.nameEn,
      icon: uuRef.icon,
      counters,
      beats,
    };
  }

  const spikeAge = resolveSpikeAge(slug);
  const archetype = inferCivArchetype(slug);
  const bonuses = selectKeyBonuses(slug);
  const holes = selectTacticalHoles(slug, enemyArchetypes);

  return {
    slug,
    archetype,
    roleFallback: guide.role || '',
    bonuses,
    spikeAge,
    ageIcon: spikeAge === 2
      ? 'assets/icons/ages/feudal.png'
      : spikeAge === 4
        ? 'assets/icons/ages/imperial.png'
        : 'assets/icons/ages/castle.png',
    proPlan: {
      opening: opStep,
      castle: casStep,
      games: opGames,
      winPct: opWinPct,
    },
    uniqueUnit,
    holes,
  };
}

function lookupPairEntry(dataset, mapType, slugA, slugB) {
  if (!dataset || !slugA || !slugB || slugA === slugB) return null;
  const isFirst = slugA < slugB;
  const key = isFirst ? `${slugA}__${slugB}` : `${slugB}__${slugA}`;
  const raw = dataset.pairs?.[mapType]?.[key] || dataset.pairs?.open?.[key] || null;
  if (!raw || !Array.isArray(raw.n) || (raw.n[0] || 0) < 3) return null;
  const totalGames = raw.n[0];
  const winsA = isFirst ? raw.n[1] : (totalGames - raw.n[1]);
  const winRatePct = symWinPct(winsA, totalGames);
  const clk = raw.clk || [[0, 0], [0, 0], [0, 0]];
  const earlyG = (clk[0]?.[0] || 0) + (clk[1]?.[0] || 0);
  const earlyW = isFirst ? ((clk[0]?.[1] || 0) + (clk[1]?.[1] || 0)) : (earlyG - ((clk[0]?.[1] || 0) + (clk[1]?.[1] || 0)));
  const lateG = clk[2]?.[0] || 0;
  const lateW = isFirst ? (clk[2]?.[1] || 0) : (lateG - (clk[2]?.[1] || 0));
  const earlyEdge = symBucketEdge(earlyW, earlyG, 4);
  const lateEdge = symBucketEdge(lateW, lateG, 4);

  let windowState = 'even';
  if (earlyEdge >= 6 && earlyEdge >= lateEdge + 4) windowState = 'earlyAdv';
  else if (lateEdge >= 6 && lateEdge >= earlyEdge + 4) windowState = 'lateAdv';
  else if (lateEdge <= -7) windowState = 'dangerLate';
  else if (earlyEdge <= -7) windowState = 'dangerEarly';

  return {
    totalGames,
    winRatePct,
    tier: raw.t || '1900',
    windowState,
    sideA: isFirst ? raw.s1 : raw.s2,
    sideB: isFirst ? raw.s2 : raw.s1,
  };
}

/**
 * Construye el payload táctico completo `civBattleBrief` exclusivamente para 1v1.
 */
function buildCivBattleBrief(state) {
  if (!state || state.status !== 'ongoing' || !Array.isArray(state.players) || state.players.length !== 2) {
    return null;
  }
  const dataset = loadProMatchupDataset();
  const mapName = state.match?.mapName || state.match?.map || 'Arabia';
  const mapType = resolveLandMapType(mapName);

  const players = state.players;
  const you = players.find((p) => p && p.isYou) || players[0];
  const rival = players.find((p) => p && p !== you) || players[1];
  const mySlug = you ? civSlug(you.civ) : null;
  const rivSlug = rival ? civSlug(rival.civ) : null;

  const opponentSlugs = rivSlug ? [rivSlug] : [];
  const myArchetype = mySlug ? inferCivArchetype(mySlug) : 'flex';
  const enemyArchetypes = opponentSlugs.map(inferCivArchetype);

  let banner = null;
  let pairForCards = null;

  if (mySlug && rivSlug) {
    if (mySlug === rivSlug) {
      const mirrorCard = buildCivCardBrief(mySlug, { mapType, enemyArchetypes: [myArchetype], dataset });
      banner = {
        mode: 'mirror',
        mySlug,
        rivalSlug: rivSlug,
        opening: mirrorCard?.proPlan?.opening || null,
        castle: mirrorCard?.proPlan?.castle || null,
      };
    } else {
      pairForCards = lookupPairEntry(dataset, mapType, mySlug, rivSlug);
      const myPlanCard = buildCivCardBrief(mySlug, {
        mapType,
        pairSide: pairForCards?.sideA || null,
        enemyArchetypes,
        dataset,
      });
      banner = {
        mode: '1v1',
        mySlug,
        rivalSlug: rivSlug,
        winRatePct: pairForCards?.winRatePct ?? null,
        totalGames: pairForCards?.totalGames ?? 0,
        tier: pairForCards?.tier || null,
        windowState: pairForCards?.windowState || 'even',
        opening: myPlanCard?.proPlan?.opening || null,
        castle: myPlanCard?.proPlan?.castle || null,
      };
    }
  }

  const byCiv = {};
  const allSlugs = [...new Set([mySlug, rivSlug].filter(Boolean))];
  for (const slug of allSlugs) {
    const isMine = slug === mySlug;
    const pairSide = (pairForCards && isMine)
      ? pairForCards.sideA
      : (pairForCards && slug === rivSlug)
        ? pairForCards.sideB
        : null;
    const relevantEnemies = isMine ? enemyArchetypes : [myArchetype];
    byCiv[slug] = buildCivCardBrief(slug, {
      mapType,
      pairSide,
      enemyArchetypes: relevantEnemies,
      dataset,
    });
  }

  return {
    mapType,
    totalMatchesPool: dataset?.meta?.totalMatchesAnalyzed || 165152,
    banner,
    byCiv,
  };
}

module.exports = {
  buildCivBattleBrief,
  buildCivCardBrief,
  inferCivArchetype,
  selectKeyBonuses,
  selectTacticalHoles,
};
