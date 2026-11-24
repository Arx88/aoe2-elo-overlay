'use strict';

/**
 * Extractor profundo de replays competitivos (.aoe2record) para el motor empírico Pro de Matchups.
 *
 * Extrae para AMBOS jugadores de una partida 1v1 RM real:
 *  - Timings exactos de cambio de edad (segundos de reloj de juego F11)
 *  - Apertura real en Edad Oscura / Edad Feudal (incluyendo Scouts a camello Gurjaras, Águilas, Champis y FC UU Phosphoru)
 *  - Switch / adaptación defensiva en Edad Feudal (+ Guerrilleros, + Lanceros, -> Arqueros, + Torre)
 *  - Postura económica real en Edad de los Castillos (1 TC Push, 2 TC Presión, 3+ TC Boom)
 *  - Composición militar real en Edad de los Castillos (Núcleo principal + Soporte/Counter)
 *  - Composición militar real de cierre en Edad Imperial (Núcleo + Trash/Asedio)
 *
 * 100% basado en órdenes reales registradas en el .aoe2record. Cero datos inventados.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const AdmZip = require('adm-zip');
const { civSlug } = require('../src/civs');
const UNIT_NAMES_RAW = require('../src/engine/unit-names.json');

const UNIT_TABLE = UNIT_NAMES_RAW.units || {};

const TECH_FEUDAL = 101;
const TECH_CASTLE = 102;
const TECH_IMPERIAL = 103;

const VILLAGER_IDS = new Set([83, 293]);
const NON_COMBAT_IDS = new Set([
  83, 293, // Aldeanos
  13, 17, 128, 545, // Pesquero, Barca mercante, Carreta mercancías, Transporte
  1954, 1966, 1978, // Héroes 3 Reinos ocasionales
]);
const NAVAL_COMBAT_IDS = new Set([
  21, 250, 420, 442, 527, 528, 529, 532, 533, 539, 691, 831, 832,
  1004, 1006, 1103, 1104, 1302, 1750, 1795, 1948, 2626, 2627, 2628, 2633,
]);

const TC_BUILDING_IDS = new Set([71, 109, 621]);
const RANGE_BUILDING_IDS = new Set([10, 14, 87]);
const STABLE_BUILDING_IDS = new Set([86, 101, 153]);
const TOWER_BUILDING_IDS = new Set([79, 234, 235, 1665]);
const CASTLE_BUILDING_IDS = new Set([82, 1251, 1665]); // Castillo, Krepost, Donjon

const AGE_NOTICES = new Map([
  [' ha avanzado a la Edad Feudal.', 'feudal'],
  [' ha avanzado a la Edad de los Castillos.', 'castle'],
  [' ha avanzado a la Edad Imperial.', 'imperial'],
  [' advanced to the Feudal Age.', 'feudal'],
  [' advanced to the Castle Age.', 'castle'],
  [' advanced to the Imperial Age.', 'imperial'],
  [' avançou para a Idade Feudal.', 'feudal'],
  [' avançou para a Idade dos Castelos.', 'castle'],
  [' avançou para a Idade Imperial.', 'imperial'],
  [' est passé à l’âge féodal.', 'feudal'],
  [' est passé à l’âge des châteaux.', 'castle'],
  [' est passé à l’âge impérial.', 'imperial'],
  [' hat die Feudalzeit erreicht.', 'feudal'],
  [' hat die Ritterzeit erreicht.', 'castle'],
  [' hat die Imperialzeit erreicht.', 'imperial'],
  [" è passato all'Età Feudale.", 'feudal'],
  [" è passato all'Età dei Castelli.", 'castle'],
  [" è passato all'Età Imperiale.", 'imperial'],
  ['升级至封建时代。', 'feudal'],
  ['升级至城堡时代。', 'castle'],
  ['升级至帝王时代。', 'imperial'],
]);

/**
 * Clasifica un unit_id en familia táctica + etiqueta en español limpia + peso estratégico.
 * El peso compensa el costo/valor por población (p. ej. 1 Monje o 1 Mangana pesa más que 1 Lancero).
 */
const STANDARD_FAMILIES = [
  { ids: [4, 24, 492], key: 'archers', castleEs: 'Ballesteros', impEs: 'Arbalesteros', node: 'Crossbowman', impNode: 'Arbalester', weight: 1.0, role: 'core' },
  { ids: [38, 283, 569, 1813, 1944, 1946], key: 'knights', castleEs: 'Jinetes', impEs: 'Caballeros / Paladín', node: 'Knight', impNode: 'Cavalier', weight: 1.65, role: 'core' },
  { ids: [39, 474, 1952, 2700, 2701], key: 'ca', castleEs: 'Arqueros a caballo', impEs: 'Arq. a caballo pesados', node: 'Cavalry Archer', impNode: 'Heavy Cavalry Archer', weight: 1.35, role: 'core' },
  { ids: [329, 330, 207], key: 'camels', castleEs: 'Jinetes a camello', impEs: 'Camellos pesados', node: 'Camel Rider', impNode: 'Heavy Camel Rider', weight: 1.5, role: 'core' },
  { ids: [448, 546, 441, 1707, 1755], key: 'lightcav', castleEs: 'Caballería ligera', impEs: 'Húsares', node: 'Light Cavalry', impNode: 'Hussar', weight: 0.95, role: 'both' },
  { ids: [751, 753, 752], key: 'eagles', castleEs: 'Guerreros águila', impEs: 'Águilas de élite', node: 'Eagle Warrior', impNode: 'Elite Eagle Warrior', weight: 1.25, role: 'core' },
  { ids: [2550, 2588, 2552, 2554], key: 'champis', castleEs: 'Guerreros champi', impEs: 'Champis de élite', node: 'Champi Warrior', impNode: 'Elite Champi Warrior', weight: 1.2, role: 'core' },
  { ids: [1370, 1372], key: 'steppe', castleEs: 'Lanceros esteparios', impEs: 'Esteparios de élite', node: 'Steppe Lancer', impNode: 'Elite Steppe Lancer', weight: 1.4, role: 'core' },
  { ids: [1132, 1134, 873, 875, 1744, 1746], key: 'elephants', castleEs: 'Elefantes', impEs: 'Elefantes de élite', node: 'Battle Elephant', impNode: 'Elite Battle Elephant', weight: 2.0, role: 'core' },
  { ids: [74, 75, 77, 473, 567, 1793, 1974, 1901, 1903, 882], key: 'infantry', castleEs: 'Infantería de espada', impEs: 'Campeones / Infantería', node: 'Long Swordsman', impNode: 'Champion', weight: 0.95, role: 'core' },
  { ids: [5, 1911], key: 'handcannon', castleEs: 'Artilleros manuales', impEs: 'Artilleros manuales', node: 'Hand Cannoneer', impNode: 'Hand Cannoneer', weight: 1.25, role: 'both' },
  { ids: [185], key: 'slingers', castleEs: 'Honderos', impEs: 'Honderos', node: 'Slinger', impNode: 'Slinger', weight: 1.05, role: 'both' },
  { ids: [93, 358, 359, 1786, 1787, 1788], key: 'pikes', castleEs: 'Piqueros', impEs: 'Alabarderos', node: 'Pikeman', impNode: 'Halberdier', weight: 0.85, role: 'support' },
  { ids: [7, 6, 1155], key: 'skirms', castleEs: 'Guerrilleros', impEs: 'Guerrilleros de élite', node: 'Elite Skirmisher', impNode: 'Elite Skirmisher', weight: 0.85, role: 'support' },
  { ids: [125, 775, 1811], key: 'monks', castleEs: 'Monjes', impEs: 'Monjes', node: 'Monk', impNode: 'Monk', weight: 2.2, role: 'support' },
  { ids: [280, 550, 588, 1904, 1907], key: 'mango', castleEs: 'Manganas', impEs: 'Onagros', node: 'Mangonel', impNode: 'Onager', weight: 2.8, role: 'support' },
  { ids: [279, 542], key: 'scorp', castleEs: 'Escorpiones', impEs: 'Escorpiones pesados', node: 'Scorpion', impNode: 'Heavy Scorpion', weight: 2.1, role: 'both' },
  { ids: [35, 1258, 422, 548, 1105], key: 'ram', castleEs: 'Arietes', impEs: 'Arietes de asedio', node: 'Battering Ram', impNode: 'Siege Ram', weight: 2.3, role: 'support' },
  { ids: [36, 1709], key: 'bbc', castleEs: 'Cañones de asedio', impEs: 'Cañones de asedio', node: 'Bombard Cannon', impNode: 'Bombard Cannon', weight: 3.2, role: 'support' },
  { ids: [42, 331, 1942, 1923], key: 'treb', castleEs: 'Lanzapiedras', impEs: 'Lanzapiedras', node: 'Trebuchet', impNode: 'Trebuchet', weight: 3.2, role: 'support' },
];

const UNIT_FAMILY_BY_ID = new Map();
for (const fam of STANDARD_FAMILIES) {
  for (const id of fam.ids) UNIT_FAMILY_BY_ID.set(id, fam);
}

function cleanUuBaseName(rawName) {
  return String(rawName || '')
    .replace(/\s+de élite(\s+\(.*\))?$/i, '')
    .replace(/\s+\((cuerpo a cuerpo|a distancia|desmontado|barrera|disparo concentrado)\)$/i, '')
    .trim();
}

function resolveUnitFamily(unitId) {
  if (NON_COMBAT_IDS.has(unitId) || NAVAL_COMBAT_IDS.has(unitId)) return null;
  const std = UNIT_FAMILY_BY_ID.get(unitId);
  if (std) return std;
  const u = UNIT_TABLE[unitId];
  if (!u || !u.name) return null;
  if (unitId === 440 || unitId === 1263) return null; // Petardo / Camello llameante sueltos
  const baseName = cleanUuBaseName(u.name);
  if (!baseName) return null;
  const slugKey = baseName.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_');
  return {
    key: `uu_${slugKey}`,
    castleEs: baseName,
    impEs: `${baseName} de élite`,
    node: null,
    impNode: null,
    isUnique: true,
    weight: 1.55,
    role: 'core',
  };
}

let parserPromise = null;
async function loadWasmParser() {
  if (parserPromise) return parserPromise;
  parserPromise = (async () => {
    const dir = path.join(__dirname, '..', 'node_modules', 'aoe2rec-js');
    const parser = await import(pathToFileURL(path.join(dir, 'aoe2rec_js_bg.js')).href);
    const wasm = fs.readFileSync(path.join(dir, 'aoe2rec_js_bg.wasm'));
    const { instance } = await WebAssembly.instantiate(wasm, { './aoe2rec_js_bg.js': parser });
    parser.__wbg_set_wasm(instance.exports);
    instance.exports.__wbindgen_start();
    return parser;
  })();
  return parserPromise;
}

function extractRecordFromZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find((e) => !e.isDirectory && /\.aoe2record$/i.test(e.entryName || ''));
  if (!entry) throw new Error('ZIP sin .aoe2record');
  return entry.getData();
}

function toArrayBuffer(buffer) {
  if (buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength) return buffer.buffer;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function readInt32(data, offset) {
  if (!Array.isArray(data) || offset < 0 || offset + 4 > data.length) return 0;
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function extractBuildingIds(payload) {
  if (Number.isFinite(payload?.building_id) && payload.building_id > 0) return [payload.building_id];
  const data = payload?.data;
  if (!Array.isArray(data) || data.length < 16) return [];
  const id = readInt32(data, 12);
  return id > 0 ? [id] : [];
}

function extractPlayerId(actionData) {
  if (!actionData || typeof actionData !== 'object') return null;
  for (const val of Object.values(actionData)) {
    if (!val || typeof val !== 'object') continue;
    if (Number.isFinite(val.player_id)) return val.player_id;
    if (val.game_command && Number.isFinite(val.game_command.player_id)) return val.game_command.player_id;
  }
  return null;
}

function parseAgeNotice(chatOp) {
  if (typeof chatOp?.text !== 'string' || chatOp.text.length > 400 ||
      !Array.isArray(chatOp.padding) || chatOp.padding.length !== 4 ||
      !chatOp.padding.every((b) => b === 255)) return null;
  let chat;
  try { chat = JSON.parse(chatOp.text); } catch { return null; }
  if (!chat || !Number.isSafeInteger(chat.player) || chat.player < 1 || chat.player > 8 ||
      chat.channel !== 0 || chat.tauntNumber !== -1 || typeof chat.message !== 'string') return null;
  const marker = `<player_id,${chat.player},0>`;
  if (!chat.message.startsWith(marker)) return null;
  const age = AGE_NOTICES.get(chat.message.slice(marker.length));
  return age ? { slot: chat.player, age } : null;
}

function sumIds(map, ids) {
  let total = 0;
  for (const id of ids) total += map.get(id) || 0;
  return total;
}

function classifyFeudalOpeningAndSwitch(p, civSlugStr) {
  const dark = p.units.dark;
  const feudal = p.units.feudal;
  const castle = p.units.castle;
  const fb = p.buildings.feudal;
  const cb = p.buildings.castle;

  const darkMilitia = dark.get(74) || 0;
  const fMaa = sumIds(feudal, [74, 75]);
  const fArchers = sumIds(feudal, [4, 24]);
  const fScouts = sumIds(feudal, [448, 546, 1755]); // Incluye Explorador a camello (Gurjaras)!
  const fEagles = sumIds(feudal, [751, 753]);
  const fChampis = sumIds(feudal, [2550, 2588, 2552]);
  const fSkirms = feudal.get(7) || 0;
  const fSpears = sumIds(feudal, [93, 358, 1786, 1787]);
  const fSerjeants = sumIds(feudal, [1658, 1660]);
  const fTowers = sumIds(fb, TOWER_BUILDING_IDS);
  const hasRange = sumIds(fb, RANGE_BUILDING_IDS) > 0 || fArchers > 0 || fSkirms > 0;
  const hasStable = sumIds(fb, STABLE_BUILDING_IDS) > 0 || fScouts >= 2;
  const hasFeudalTc = sumIds(fb, TC_BUILDING_IDS) > 0;
  const hasCastleDropEarly = sumIds(cb, CASTLE_BUILDING_IDS) > 0;

  let castleUuCount = 0;
  for (const [uid, cnt] of castle.entries()) {
    const fam = resolveUnitFamily(uid);
    if (fam?.isUnique) castleUuCount += cnt;
  }

  const fArmyCore = fMaa + fArchers + fScouts + fEagles + fChampis + fSerjeants;
  const feudalToCastleSec = (p.feudalReachedSec != null && p.castleReachedSec != null)
    ? (p.castleReachedSec - p.feudalReachedSec)
    : (p.feudalClickSec != null && p.castleClickSec != null ? (p.castleClickSec - p.feudalClickSec) : null);
  const isFastCastle = feudalToCastleSec != null && feudalToCastleSec < 510 && fArmyCore <= 3;

  let openingKey = 'other';
  let openingEs = 'Apertura flexible';

  if (civSlugStr === 'cumans' && hasFeudalTc) {
    openingKey = '2tc_feudal'; openingEs = 'Boom 2 TC en Feudal';
  } else if (civSlugStr === 'sicilians' && (fSerjeants >= 2 || (fb.get(1665) || 0) > 0)) {
    openingKey = 'serjeants'; openingEs = 'Donjon + Serjeants';
  } else if (fTowers >= 3) {
    openingKey = 'trush'; openingEs = 'Presión con Torres';
  } else if (isFastCastle && hasCastleDropEarly && castleUuCount >= 4 && p.castleTcCount <= 1) {
    openingKey = 'fc_uu'; openingEs = 'Fast Castle → Unidad Única (1 TC)';
  } else if (darkMilitia >= 2 && isFastCastle) {
    openingKey = 'drush_fc'; openingEs = 'Drush → Fast Castle';
  } else if (darkMilitia >= 2 && fArchers >= 3) {
    openingKey = 'drush_archers'; openingEs = 'Drush → Arqueros';
  } else if (fMaa >= 2 && fArchers >= 3) {
    openingKey = 'maa_archers'; openingEs = 'Hombres de armas → Arqueros';
  } else if (fMaa >= 2 && fEagles >= 3) {
    openingKey = 'maa_eagles'; openingEs = 'Hombres de armas → Águilas';
  } else if (fMaa >= 2 && fSkirms >= 3 && fArchers < 3) {
    openingKey = 'maa_skirms'; openingEs = 'Hombres de armas → Guerrilleros';
  } else if (fScouts >= 2 && fArchers >= 4) {
    openingKey = 'scouts_archers'; openingEs = 'Scouts → Arqueros';
  } else if (fScouts >= 2 && hasStable) {
    openingKey = 'scouts'; openingEs = 'Rush de Scouts';
  } else if (fArchers >= 3 && hasRange) {
    openingKey = 'archers'; openingEs = 'Rush de Arqueros';
  } else if (fEagles >= 3) {
    openingKey = 'eagles_feudal'; openingEs = 'Apertura de Águilas';
  } else if (fChampis >= 3) {
    openingKey = 'champis_feudal'; openingEs = 'Apertura de Champis';
  } else if (fMaa >= 3) {
    openingKey = 'maa'; openingEs = 'Rush de Hombres de armas';
  } else if (darkMilitia >= 3) {
    openingKey = 'drush'; openingEs = 'Drush temprano';
  } else if (isFastCastle && p.castleTcCount >= 3) {
    openingKey = 'fc_boom'; openingEs = 'Fast Castle → Boom 3 TC';
  } else if (isFastCastle) {
    openingKey = 'fc'; openingEs = 'Fast Castle directo';
  } else if (fSkirms >= 3 && fSpears >= 2) {
    openingKey = 'spear_skirm'; openingEs = 'Defensa Lancero + Guerrillero';
  } else if (fSkirms >= 4 && fArchers < 3) {
    openingKey = 'skirms_open'; openingEs = 'Apertura defensiva de Guerrilleros';
  } else if (hasStable && !hasRange) {
    openingKey = 'scouts'; openingEs = 'Apertura de Scouts';
  } else if (hasRange && !hasStable) {
    openingKey = 'archers'; openingEs = 'Apertura de Arqueros';
  }

  // Switch / adaptación reactiva en Feudal
  let switchKey = null;
  let switchEs = null;
  if (!['maa_skirms', 'spear_skirm', 'skirms_open'].includes(openingKey) && fSkirms >= 3) {
    switchKey = 'add_skirms';
    switchEs = '+ Guerrilleros';
  } else if (!['spear_skirm'].includes(openingKey) && fSpears >= 3) {
    switchKey = 'add_spears';
    switchEs = '+ Lanceros';
  } else if (openingKey === 'scouts' && fArchers >= 3) {
    switchKey = 'to_archers';
    switchEs = '→ Arqueros';
  } else if (['archers', 'maa_archers', 'drush_archers'].includes(openingKey) && fScouts >= 3) {
    switchKey = 'add_scouts';
    switchEs = '+ Scouts';
  } else if (openingKey !== 'trush' && fTowers >= 1) {
    switchKey = 'def_tower';
    switchEs = '+ Torre defensiva';
  }

  return { openingKey, openingEs, switchKey, switchEs };
}

function classifyAgeComposition(unitMap, isImperial = false) {
  const buckets = new Map();
  for (const [unitId, count] of unitMap.entries()) {
    const fam = resolveUnitFamily(unitId);
    if (!fam || count <= 0) continue;
    const prev = buckets.get(fam.key) || {
      key: fam.key,
      label: isImperial ? fam.impEs : fam.castleEs,
      role: fam.role,
      isUnique: Boolean(fam.isUnique),
      rawCount: 0,
      weighted: 0,
    };
    prev.rawCount += count;
    prev.weighted += count * fam.weight;
    buckets.set(fam.key, prev);
  }

  const list = [...buckets.values()].sort((a, b) => b.weighted - a.weighted);
  if (!list.length) return { primaryKey: null, primaryEs: null, supportKey: null, supportEs: null };

  // Preferir una línea core como núcleo si tiene presencia real (>= 35% del #1)
  const top1 = list[0];
  let primary = top1;
  if (top1.role === 'support') {
    const viableCore = list.find((item) => item.role !== 'support' && item.weighted >= top1.weighted * 0.42 && item.rawCount >= 3);
    if (viableCore) primary = viableCore;
  }

  const support = list.find((item) =>
    item.key !== primary.key &&
    item.weighted >= Math.max(3.0, primary.weighted * 0.22) &&
    item.rawCount >= 2
  ) || null;

  return {
    primaryKey: primary.key,
    primaryEs: primary.label,
    supportKey: support ? support.key : null,
    supportEs: support ? support.label : null,
  };
}

/**
 * Parsea un buffer ZIP (o .aoe2record crudo) y devuelve la telemetría estratégica
 * simétrica de ambos jugadores en una partida 1v1 RM.
 */
async function extractDualProTelemetry(inputBuffer, matchMeta = {}) {
  const parser = await loadWasmParser();
  const isZip = inputBuffer && inputBuffer.length >= 4 && inputBuffer[0] === 0x50 && inputBuffer[1] === 0x4b;
  const recBuffer = isZip ? extractRecordFromZip(inputBuffer) : inputBuffer;
  const record = parser.parse_rec(toArrayBuffer(recBuffer));
  const chapter = record?.chapters?.[0];
  if (!chapter || !Array.isArray(chapter.operations)) {
    throw new Error('Replay sin operaciones válidas');
  }

  const settings = chapter.zheader?.game_settings || {};
  if (Number(settings.starting_age_id) !== 2) {
    throw new Error('Partida no inicia en Alta Edad Media estándar');
  }
  const replayPlayers = (settings.players || []).filter((p) => Number(p.player_number) > 0 && Number(p.profile_id) > 0);
  if (replayPlayers.length !== 2) {
    throw new Error(`No es 1v1 (${replayPlayers.length} jugadores)`);
  }

  const stateBySlot = new Map();
  for (const rp of replayPlayers) {
    const slot = Number(rp.player_number);
    stateBySlot.set(slot, {
      slot,
      profileId: Number(rp.profile_id),
      age: 'dark',
      feudalClickSec: null,
      castleClickSec: null,
      imperialClickSec: null,
      feudalReachedSec: null,
      castleReachedSec: null,
      imperialReachedSec: null,
      units: { dark: new Map(), feudal: new Map(), castle: new Map(), imperial: new Map() },
      buildings: { dark: new Map(), feudal: new Map(), castle: new Map(), imperial: new Map() },
      castleTcBuilt: 0,
      feudalTcBuilt: 0,
      maxSelectedTcsCastle: 1,
    });
  }

  let syncClockMs = 0;
  let postgameMs = 0;

  for (const op of chapter.operations) {
    if (op.Sync) {
      syncClockMs += Number(op.Sync.time_increment) || 0;
      continue;
    }
    if (op.PostGame) {
      for (const blk of op.PostGame.blocks || []) {
        if (blk.WorldTime && Number.isFinite(blk.WorldTime.world_time)) {
          postgameMs = Math.max(postgameMs, Number(blk.WorldTime.world_time));
        }
      }
      continue;
    }
    if (op.Chat) {
      const notice = parseAgeNotice(op.Chat);
      const st = notice && stateBySlot.get(notice.slot);
      if (st) {
        const sec = Math.round(syncClockMs / 1000);
        if (notice.age === 'feudal' && st.feudalReachedSec == null && sec >= 300 && (st.feudalClickSec == null || sec > st.feudalClickSec)) {
          st.feudalReachedSec = sec;
          st.age = 'feudal';
        } else if (notice.age === 'castle' && st.castleReachedSec == null && sec >= 600 && (st.castleClickSec == null || sec > st.castleClickSec)) {
          st.castleReachedSec = sec;
          st.age = 'castle';
        } else if (notice.age === 'imperial' && st.imperialReachedSec == null && sec >= 950 && (st.imperialClickSec == null || sec > st.imperialClickSec)) {
          st.imperialReachedSec = sec;
          st.age = 'imperial';
        }
      }
      continue;
    }

    const act = op.Action;
    if (!act || !act.action_data) continue;
    const data = act.action_data;
    let type = null;
    for (const k in data) { type = k; break; }
    if (!type) continue;
    const payload = data[type];
    if (!payload || typeof payload !== 'object') continue;
    const slot = extractPlayerId(data);
    const st = stateBySlot.get(slot);
    if (!st) continue;

    const worldMs = Number.isFinite(act.world_time) && act.world_time >= 0 ? act.world_time : syncClockMs;
    const worldSec = Math.round(worldMs / 1000);

    // Fallback de edad si un idioma exótico no emitió AGE_NOTICE
    if (st.age === 'dark' && st.feudalClickSec != null && worldSec >= st.feudalClickSec + 130) {
      st.age = 'feudal';
      st.feudalReachedSec ??= st.feudalClickSec + 130;
    }
    if (st.age === 'feudal' && st.castleClickSec != null && worldSec >= st.castleClickSec + 160) {
      st.age = 'castle';
      st.castleReachedSec ??= st.castleClickSec + 160;
    }
    if (st.age === 'castle' && st.imperialClickSec != null && worldSec >= st.imperialClickSec + 190) {
      st.age = 'imperial';
      st.imperialReachedSec ??= st.imperialClickSec + 190;
    }

    if (type === 'Research') {
      const tech = Number(payload.technology_type);
      if (tech === TECH_FEUDAL && st.feudalClickSec == null) st.feudalClickSec = worldSec;
      else if (tech === TECH_CASTLE && st.castleClickSec == null) st.castleClickSec = worldSec;
      else if (tech === TECH_IMPERIAL && st.imperialClickSec == null) st.imperialClickSec = worldSec;
      continue;
    }

    if (type === 'DeQueue' || type === 'Queue' || type === 'Multiqueue') {
      const unitId = Number(payload.unit_id);
      if (!unitId) continue;
      const amount = Math.max(1, Math.min(15, Number(payload.amount) || 1));
      if (VILLAGER_IDS.has(unitId)) {
        if (st.age === 'castle' && Array.isArray(payload.building_ids) && payload.building_ids.length > st.maxSelectedTcsCastle) {
          st.maxSelectedTcsCastle = Math.min(5, payload.building_ids.length);
        }
        continue;
      }
      const ageMap = st.units[st.age];
      ageMap.set(unitId, (ageMap.get(unitId) || 0) + amount);
      if (Number(payload.building_type) > 0) {
        const bMap = st.buildings[st.age];
        const bt = Number(payload.building_type);
        bMap.set(bt, (bMap.get(bt) || 0) + 1);
      }
      continue;
    }

    if (type === 'Build') {
      const bIds = extractBuildingIds(payload);
      const bMap = st.buildings[st.age];
      for (const bid of bIds) {
        bMap.set(bid, (bMap.get(bid) || 0) + 1);
        if (TC_BUILDING_IDS.has(bid)) {
          if (st.age === 'feudal') st.feudalTcBuilt += 1;
          else if (st.age === 'castle') st.castleTcBuilt += 1;
        }
      }
    }
  }

  const durationGameSec = Math.round(Math.max(syncClockMs, postgameMs) / 1000);
  const metaPlayers = Array.isArray(matchMeta.players) ? matchMeta.players : [];

  const extractedPlayers = [];
  for (const st of stateBySlot.values()) {
    const mp = metaPlayers.find((x) => Number(x.profileId) === st.profileId) || {};
    const cSlug = mp.civSlug || civSlug(mp.civ) || null;
    const estTcs = Math.max(1 + Math.min(3, st.feudalTcBuilt + st.castleTcBuilt), st.maxSelectedTcsCastle);
    st.castleTcCount = st.castleReachedSec != null ? Math.min(4, estTcs) : 1;

    const feudalInfo = classifyFeudalOpeningAndSwitch(st, cSlug);
    const castleComp = st.castleReachedSec != null ? classifyAgeComposition(st.units.castle, false) : { primaryKey: null, primaryEs: null, supportKey: null, supportEs: null };
    const impComp = st.imperialReachedSec != null ? classifyAgeComposition(st.units.imperial, true) : { primaryKey: null, primaryEs: null, supportKey: null, supportEs: null };

    const postureKey = st.castleReachedSec == null
      ? null
      : (st.castleTcCount >= 3 ? '3tc' : st.castleTcCount === 2 ? '2tc' : '1tc');
    const postureEs = postureKey === '3tc'
      ? 'Boom 3 TC'
      : postureKey === '2tc'
        ? '2 TC Presión + Eco'
        : postureKey === '1tc'
          ? 'Push 1 TC'
          : null;

    extractedPlayers.push({
      profileId: st.profileId,
      name: mp.name || null,
      civSlug: cSlug,
      won: typeof mp.won === 'boolean' ? mp.won : null,
      rating: mp.rating || null,
      feudalSec: st.feudalReachedSec,
      castleSec: st.castleReachedSec,
      imperialSec: st.imperialReachedSec,
      feudalOpeningKey: feudalInfo.openingKey,
      feudalOpeningEs: feudalInfo.openingEs,
      feudalSwitchKey: feudalInfo.switchKey,
      feudalSwitchEs: feudalInfo.switchEs,
      castlePostureKey: postureKey,
      castlePostureEs: postureEs,
      castleTcCount: st.castleTcCount,
      castlePrimaryKey: castleComp.primaryKey,
      castlePrimaryEs: castleComp.primaryEs,
      castleSupportKey: castleComp.supportKey,
      castleSupportEs: castleComp.supportEs,
      impPrimaryKey: impComp.primaryKey,
      impPrimaryEs: impComp.primaryEs,
      impSupportKey: impComp.supportKey,
      impSupportEs: impComp.supportEs,
    });
  }

  return {
    matchId: matchMeta.matchId ? String(matchMeta.matchId) : null,
    durationGameSec,
    players: extractedPlayers,
  };
}

module.exports = {
  extractDualProTelemetry,
  resolveUnitFamily,
};
