'use strict';

/**
 * Analiza un .aoe2record local y devuelve la telemetría que consume el
 * postmatch. El parser WASM (aoe2rec-js) se carga sin el import de `.wasm`
 * experimental de Node: instanciamos el binario a mano, así funciona igual en
 * desarrollo y dentro del paquete de Electron.
 *
 * Lo que se mide acá es el registro de comandos del replay: apertura, llegada
 * a edades y APM. No inventamos economía, bajas ni eAPM: si el replay no lo
 * trae, el campo queda ausente.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const AGES = ['dark', 'feudal', 'castle', 'imperial'];
const IDS = {
  FEUDAL_AGE: 101,
  CASTLE_AGE: 102,
  IMPERIAL_AGE: 103,
  VILLAGERS: new Set([83, 293]),
  MILITIA: 74,
  MAN_AT_ARMS: 75,
  ARCHER: 4,
  CROSSBOWMAN: 24,
  SKIRMISHER: 7,
  SPEARMAN: 93,
  PIKEMAN: 358,
  SCOUT_CAVALRY: 448,
  LIGHT_CAVALRY: 37,
  SERJEANT: 1658,
  BATTLE_ELEPHANT: 1132,
  SCORPION: 279,
  HEAVY_SCORPION: 542,
  BATTERING_RAM: 35,
  CAPPED_RAM: 422,
  SIEGE_RAM: 548,
  ARCHERY_RANGES: new Set([10, 14, 87]),
  STABLES: new Set([86, 101, 153]),
  WATCH_TOWER: 79,
  GUARD_TOWER: 234,
  KEEP: 235,
  SIEGE_WORKSHOP: 49,
  MONASTERY: 104,
  DONJON: 1665,
  TOWN_CENTER: 621,
  ELEPHANT_CIVS: new Set(['Khmer', 'Burmese', 'Malay', 'Vietnamese']),
};
const FAST_CASTLE_MS = 9 * 60_000;

/** Etiquetas cortas para la tarjeta de tres etapas; el nombre canónico no cambia. */
const OPENING_LABELS = {
  'Serjeant Rush': 'Serjeants',
  'Elephant Rush': 'Elefantes',
  '2TC Feudal Boom': '2TC feudal',
  'Scorpions & Rams': 'Escorpiones',
  'Hoang Rush': 'Hoang',
  'Tower Rush': 'Torres',
  'Drush FC': 'Drush FC',
  'Drush Archers': 'Drush arq.',
  'Drush M@A': 'Drush M@A',
  Drush: 'Drush',
  'M@A Archers': 'M@A arq.',
  'M@A Rush': 'M@A',
  'Archer Rush': 'Arqueros',
  'Scout Rush': 'Scouts',
  'M@A Scouts': 'M@A scouts',
  'Pike Skirm': 'Pica + honda',
  'FC Boom': 'FC boom',
  'Fast Castle': 'FC',
  'Monk Rush': 'Monjes',
  'Archer Opening': 'Arqueros',
  'Scout Opening': 'Scouts',
  'Scouts into Archers': 'Scouts + arq.',
  Other: 'Otra',
};

const OPENING_SPANISH = {
  'Serjeant Rush': 'Rush de serjeants',
  'Elephant Rush': 'Rush de elefantes',
  '2TC Feudal Boom': 'Boom de 2TC en feudal',
  'Scorpions & Rams': 'Escorpiones y arietes',
  'Hoang Rush': 'Hoang rush',
  'Tower Rush': 'Tower rush',
  'Drush FC': 'Drush FC',
  'Drush Archers': 'Drush con arqueros',
  'Drush M@A': 'Drush con M@A',
  Drush: 'Drush',
  'M@A Archers': 'M@A con arqueros',
  'M@A Rush': 'Rush de M@A',
  'Archer Rush': 'Rush de arqueros',
  'Scout Rush': 'Scout rush',
  'M@A Scouts': 'M@A con scouts',
  'Pike Skirm': 'Picas y honderos',
  'FC Boom': 'Fast castle con boom',
  'Fast Castle': 'Fast castle',
  'Monk Rush': 'Rush de monjes',
  'Archer Opening': 'Apertura de arqueros',
  'Scout Opening': 'Apertura de scouts',
  'Scouts into Archers': 'Scouts hacia arqueros',
  Other: 'Otra apertura',
};

function openingLabel(name) {
  return OPENING_SPANISH[name] || name || null;
}

function openingShort(name) {
  return OPENING_LABELS[name] || openingLabel(name);
}

let parserPromise = null;

function parserDirectory() {
  const candidates = [
    process.resourcesPath
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'aoe2rec-js')
      : null,
    path.join(__dirname, '..', 'node_modules', 'aoe2rec-js'),
  ].filter(Boolean);
  return candidates.find((dir) =>
    fs.existsSync(path.join(dir, 'aoe2rec_js_bg.js')) &&
    fs.existsSync(path.join(dir, 'aoe2rec_js_bg.wasm'))) || null;
}

async function loadParser() {
  if (parserPromise) return parserPromise;
  parserPromise = (async () => {
    const dir = parserDirectory();
    if (!dir) throw new Error('No se encontró el analizador de replays en esta instalación.');
    const parser = await import(pathToFileURL(path.join(dir, 'aoe2rec_js_bg.js')).href);
    const wasm = fs.readFileSync(path.join(dir, 'aoe2rec_js_bg.wasm'));
    const { instance } = await WebAssembly.instantiate(wasm, {
      './aoe2rec_js_bg.js': parser,
    });
    parser.__wbg_set_wasm(instance.exports);
    instance.exports.__wbindgen_start();
    return parser;
  })();
  return parserPromise;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function readInt32(data, offset) {
  if (!Array.isArray(data) || offset < 0 || offset + 4 > data.length) return 0;
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) |
    (data[offset + 3] << 24)) >>> 0;
}

/** El bloque Build trae coordenadas + building_id: el ID está en el byte 12. */
function buildingIds(payload) {
  if (Number.isFinite(payload && payload.building_id) && payload.building_id > 0) {
    return [payload.building_id];
  }
  const data = payload && payload.data;
  if (!Array.isArray(data) || data.length < 16) return [];
  const id = readInt32(data, 12);
  return id > 0 ? [id] : [];
}

function speedLabel(speed) {
  if (!Number.isFinite(speed)) return 'normal';
  if (speed <= 1.1) return 'slow';
  if (speed < 1.65) return 'normal';
  if (speed < 1.9) return 'fast';
  return 'fastest';
}

function startingAgeLabel(id) {
  // En los headers DE estándar: 2 = Edad Oscura, 3 = Feudal, 4 = Castillos,
  // 5 = Imperial. Si viene otro valor, no afirmamos una edad que no sabemos.
  return ({ 2: 'dark', 3: 'feudal', 4: 'castle', 5: 'imperial' })[id] || 'dark';
}

function emptyPlayer() {
  return {
    actions: 0,
    age: 'dark',
    feudalMs: null,
    castleMs: null,
    imperialMs: null,
    villagers: Object.fromEntries(AGES.map((age) => [age, 0])),
    units: Object.fromEntries(AGES.map((age) => [age, new Map()])),
    buildings: Object.fromEntries(AGES.map((age) => [age, new Map()])),
    resigned: false,
  };
}

function count(map, id, amount = 1) {
  map.set(id, (map.get(id) || 0) + amount);
}

function playerId(action) {
  if (!action || typeof action !== 'object') return null;
  for (const value of Object.values(action)) {
    if (!value || typeof value !== 'object') continue;
    if (Number.isFinite(value.player_id)) return value.player_id;
    if (value.game_command && Number.isFinite(value.game_command.player_id)) {
      return value.game_command.player_id;
    }
  }
  return null;
}

function applyAction(player, type, payload, time) {
  if (type === 'Research') {
    const tech = payload.technology_type;
    if (tech === IDS.FEUDAL_AGE && player.feudalMs == null) {
      player.feudalMs = time;
      player.age = 'feudal';
    } else if (tech === IDS.CASTLE_AGE && player.castleMs == null) {
      player.castleMs = time;
      player.age = 'castle';
    } else if (tech === IDS.IMPERIAL_AGE && player.imperialMs == null) {
      player.imperialMs = time;
      player.age = 'imperial';
    }
    return;
  }
  if (type === 'DeQueue' || type === 'Queue' || type === 'Multiqueue') {
    const unit = Number(payload.unit_id);
    if (!unit) return;
    const amount = Math.max(1, Number(payload.amount) || 1);
    if (IDS.VILLAGERS.has(unit)) {
      player.villagers[player.age] += amount;
      return;
    }
    count(player.units[player.age], unit, amount);
    // El edificio que produjo la unidad también delata la estructura aunque
    // el bloque Build venga sin decodificar.
    if (Number(payload.building_type) > 0) {
      count(player.buildings[player.age], Number(payload.building_type), 1);
    }
    return;
  }
  if (type === 'Build') {
    for (const id of buildingIds(payload)) count(player.buildings[player.age], id, 1);
    return;
  }
  if (type === 'Wall') {
    for (const id of buildingIds(payload)) count(player.buildings[player.age], id, 1);
    return;
  }
  if (type === 'Resign') player.resigned = true;
}

function sum(map, ids) {
  let total = 0;
  for (const id of ids) total += map.get(id) || 0;
  return total;
}

function has(map, ids) {
  for (const id of ids) if ((map.get(id) || 0) > 0) return true;
  return false;
}

function signals(player, civ) {
  const dark = player.units.dark;
  const feudal = player.units.feudal;
  const castle = player.units.castle;
  const feudalBuildings = player.buildings.feudal;
  const castleBuildings = player.buildings.castle;
  return {
    civ,
    dark_militia: dark.get(IDS.MILITIA) || 0,
    feudal_archers: sum(feudal, [IDS.ARCHER, IDS.CROSSBOWMAN]),
    feudal_men_at_arms: sum(feudal, [IDS.MILITIA, IDS.MAN_AT_ARMS]),
    feudal_scouts: sum(feudal, [IDS.SCOUT_CAVALRY, IDS.LIGHT_CAVALRY]),
    feudal_skirmishers: feudal.get(IDS.SKIRMISHER) || 0,
    feudal_spears: sum(feudal, [IDS.SPEARMAN, IDS.PIKEMAN]),
    feudal_serjeants: feudal.get(IDS.SERJEANT) || 0,
    feudal_towers: sum(feudalBuildings, [IDS.WATCH_TOWER, IDS.GUARD_TOWER, IDS.KEEP]),
    feudal_archery_range: has(feudalBuildings, IDS.ARCHERY_RANGES),
    feudal_stable: has(feudalBuildings, IDS.STABLES),
    feudal_siege_workshop: (feudalBuildings.get(IDS.SIEGE_WORKSHOP) || 0) > 0,
    feudal_monastery: (feudalBuildings.get(IDS.MONASTERY) || 0) > 0,
    feudal_town_center: (feudalBuildings.get(IDS.TOWN_CENTER) || 0) > 0,
    feudal_donjon: (feudalBuildings.get(IDS.DONJON) || 0) > 0,
    castle_elephants: castle.get(IDS.BATTLE_ELEPHANT) || 0,
    castle_scorpions: sum(castle, [IDS.SCORPION, IDS.HEAVY_SCORPION]),
    castle_rams: sum(castle, [IDS.BATTERING_RAM, IDS.CAPPED_RAM, IDS.SIEGE_RAM]),
    castle_town_center: (castleBuildings.get(IDS.TOWN_CENTER) || 0) > 0,
    feudal_to_castle_ms: player.feudalMs != null && player.castleMs != null
      ? player.castleMs - player.feudalMs : null,
  };
}

function isDrush(s) { return s.dark_militia >= 3; }
function isFastCastle(s) {
  const army = s.feudal_men_at_arms + s.feudal_archers + s.feudal_scouts;
  return s.feudal_to_castle_ms != null && s.feudal_to_castle_ms < FAST_CASTLE_MS && army < 4;
}

/** Misma lista de reglas que usa aoe2-openings, en el mismo orden. */
const RULES = [
  ['Serjeant Rush', (s) => s.civ === 'Sicilians' && (s.feudal_donjon || s.feudal_serjeants >= 2)],
  ['Elephant Rush', (s) => IDS.ELEPHANT_CIVS.has(s.civ) && s.castle_elephants >= 4],
  ['2TC Feudal Boom', (s) => s.civ === 'Cumans' && s.feudal_town_center],
  ['Scorpions & Rams', (s) => s.civ === 'Romans' && s.castle_scorpions >= 2 && s.castle_rams >= 1],
  ['Hoang Rush', (s) => s.feudal_siege_workshop],
  ['Tower Rush', (s) => s.feudal_towers >= 3],
  ['Drush FC', (s) => isDrush(s) && isFastCastle(s)],
  ['Drush Archers', (s) => isDrush(s) && s.feudal_archers >= 3],
  ['Drush M@A', (s) => isDrush(s) && s.feudal_men_at_arms >= 2],
  ['Drush', (s) => isDrush(s)],
  ['M@A Archers', (s) => s.feudal_men_at_arms >= 2 && s.feudal_archers >= 3],
  ['M@A Rush', (s) => s.feudal_men_at_arms >= 4],
  ['Archer Rush', (s) => s.feudal_archers >= 4],
  ['Scout Rush', (s) => s.feudal_scouts >= 3 && s.feudal_stable],
  ['M@A Scouts', (s) => s.feudal_men_at_arms >= 2 && s.feudal_scouts >= 2],
  ['Pike Skirm', (s) => s.feudal_skirmishers >= 2 && s.feudal_spears >= 2],
  ['FC Boom', (s) => isFastCastle(s) && s.castle_town_center],
  ['Fast Castle', (s) => isFastCastle(s)],
  ['Monk Rush', (s) => s.feudal_monastery && s.feudal_archers < 2 &&
    s.feudal_men_at_arms < 2 && s.feudal_scouts < 2],
  ['Archer Rush', (s) => s.feudal_archers >= 2 && s.feudal_archery_range],
  ['Scout Rush', (s) => s.feudal_scouts >= 2 && s.feudal_stable],
  ['M@A Rush', (s) => s.feudal_men_at_arms >= 2],
  ['Archer Opening', (s) => s.feudal_archery_range && !s.feudal_stable],
  ['Scout Opening', (s) => s.feudal_stable && !s.feudal_archery_range],
  ['Scouts into Archers', (s) => s.feudal_archery_range && s.feudal_stable],
];

function classify(player, civ) {
  const s = signals(player, civ);
  for (const [name, test] of RULES) {
    if (test(s)) return { name, signals: s };
  }
  return { name: 'Other', signals: s };
}

function gameDuration(chapter) {
  let total = 0;
  let postgame = 0;
  for (const operation of chapter.operations || []) {
    if (operation.Sync) total += Number(operation.Sync.time_increment) || 0;
    if (operation.PostGame) {
      for (const block of operation.PostGame.blocks || []) {
        if (block.WorldTime && Number.isFinite(block.WorldTime.world_time)) {
          postgame = Math.max(postgame, Number(block.WorldTime.world_time));
        }
      }
    }
  }
  return Math.max(total, postgame);
}

/**
 * Lee el replay y devuelve la telemetría normalizable. `match` es la partida
 * confirmada por la API: su mapa/modo/civ mandan para validar el archivo.
 */
async function analyzeReplayFile(filePath, { match, profileId } = {}) {
  if (!match || !Number.isFinite(Number(profileId))) {
    throw new Error('Falta la partida o el jugador para analizar el replay.');
  }
  const parser = await loadParser();
  const buffer = fs.readFileSync(filePath);
  if (buffer.length > 80 * 1024 * 1024) throw new Error('El replay supera el límite de 80 MB.');
  let record;
  try {
    record = parser.parse_rec(toArrayBuffer(buffer));
  } catch (error) {
    throw new Error(`El replay no se pudo leer: ${error.message}`);
  }
  const chapter = record && record.chapters && record.chapters[0];
  if (!chapter || !Array.isArray(chapter.operations)) {
    throw new Error('El replay no tiene una secuencia de operaciones válida.');
  }
  const settings = (chapter.zheader && chapter.zheader.game_settings) || {};
  const replayPlayers = Array.isArray(settings.players) ? settings.players : [];
  const self = replayPlayers.find((p) => Number(p.profile_id) === Number(profileId));
  if (!self) throw new Error('El replay no corresponde al jugador de esta partida.');

  const players = new Map();
  for (const p of replayPlayers) {
    if (Number.isFinite(p.player_number) && p.player_number > 0) {
      players.set(p.player_number, emptyPlayer());
    }
  }
  const durationMs = gameDuration(chapter);
  for (const operation of chapter.operations) {
    const action = operation.Action;
    if (!action) continue;
    const data = action.action_data;
    if (!data || typeof data !== 'object') continue;
    const type = Object.keys(data)[0];
    const payload = data[type];
    if (!payload || typeof payload !== 'object') continue;
    const number = playerId(data);
    const player = players.get(number);
    if (!player) continue;
    player.actions += 1;
    // `world_time` del action es el reloj de juego en ms. El Sync suma lo
    // mismo, pero usar el del action evita acumular cientos de miles de ops.
    applyAction(player, type, payload, Number(action.world_time) || 0);
  }

  const player = players.get(Number(self.player_number));
  if (!player) throw new Error('El replay no tiene datos del jugador de esta partida.');
  const matchPlayer = (Array.isArray(match.players) ? match.players : [])
    .find((p) => Number(p.profileId) === Number(profileId));
  const civ = (matchPlayer && matchPlayer.civ) || 'Unknown';
  const opening = classify(player, civ);
  const minutes = Math.max(durationMs / 60_000, 1);
  const metrics = {};
  const apm = Math.round(player.actions / minutes * 10) / 10;
  if (Number.isFinite(apm) && apm > 0) {
    metrics.apm = { value: apm, definition: 'game-command-count-v1' };
  }
  if (player.feudalMs != null) {
    metrics.feudalSeconds = {
      value: Math.round(player.feudalMs / 1000 * 10) / 10,
      definition: 'age-reached-game-seconds-v1',
    };
  }
  if (player.castleMs != null) {
    metrics.castleSeconds = {
      value: Math.round(player.castleMs / 1000 * 10) / 10,
      definition: 'age-reached-game-seconds-v1',
    };
  }

  return {
    schemaVersion: 1,
    matchId: String(match.matchId),
    profileId: Number(profileId),
    clock: 'game',
    source: {
      id: 'aoe2rec-js',
      version: '0.1.25',
      type: 'replay-analysis',
      label: 'Replay de Microsoft · análisis local',
    },
    context: {
      mapName: match.mapName,
      leaderboardId: match.leaderboardId,
      civ,
      opening: opening.name,
      gameSpeed: speedLabel(Number(settings.speed)),
      startingAge: startingAgeLabel(Number(settings.starting_age_id)),
      patch: String((chapter.zheader && chapter.zheader.game) || 'desconocido').slice(0, 60),
    },
    durationSeconds: Math.round(durationMs / 1000),
    metrics,
  };
}

module.exports = {
  analyzeReplayFile,
  classify,
  signals,
  openingLabel,
  openingShort,
  OPENING_LABELS,
  OPENING_SPANISH,
};
