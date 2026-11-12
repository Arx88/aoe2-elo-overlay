'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  shell,
  Menu,
  Tray,
  Notification,
  nativeImage,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildSnapshot,
  buildExampleSnapshot,
  buildSnapshotFromLobby,
  buildSnapshotFromMatch,
  searchProfiles,
  fetchProfileIdentity,
} = require('./src/aoe');
const { detectProfile } = require('./src/detect');
const { CIV_SLUGS, CIV_ALIASES } = require('./src/civs');
const { CIV_GUIDE } = require('./src/civ-guide');
const {
  SHOW_AT_MS,
  HIDE_AT_MS,
  ENGAGE_LIMIT_MS,
  hideAtMs,
  trackIntro,
  introView,
  nextIntroTick,
} = require('./src/intro');
const { LobbyWatcher, QueueWatcher } = require('./src/live');
const { buildRivalInsights, opponentsOf, resolveMode } = require('./src/rival');
const { initAutoUpdate } = require('./src/updater');

// Empaquetada, __dirname vive dentro del app.asar (solo lectura): config y log
// van a %APPDATA%\AoE2 ELO Overlay\. En desarrollo quedan junto al código.
const DATA_DIR = app.isPackaged ? path.join(app.getPath('appData'), 'AoE2 ELO Overlay') : __dirname;
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const LOG_PATH = path.join(DATA_DIR, 'overlay.log');
// Emblema dorado (recortado y normalizado por tools/make-icon.py) es el icono oficial:
// ventanas, bandeja, configuración, exe y accesos directos usan el mismo arte.
const ICON_PNG = path.join(__dirname, 'assets', 'app-icon.png');

// Sin esto las notificaciones nativas de Windows pueden no aparecer (o salir
// con un nombre genérico). Tiene que coincidir con appId de electron-builder.
try {
  app.setAppUserModelId('com.local.aoe2elooverlay');
} catch (err) {
  console.error(`no pude fijar el AppUserModelID: ${err.message}`);
}

const DEFAULT_CONFIG = {
  profileId: null,
  pollSeconds: 15,
  idlePollSeconds: 3,
  width: 520,
  scale: 1,
  opacity: 0.95,
  theme: 'clasico',
  position: 'top-center',
  offsetX: 0,
  offsetY: 16,
  x: null,
  y: null,
  statsCacheMinutes: 15,
  // Las opciones nuevas arrancan APAGADAS: el usuario elige qué quiere ver.
  civHelp: false,
  hideEloAt20: false,
  // Segundos tras el inicio en que se oculta la ayuda de civ y el ELO
  // (10 a 60). Antes estaba fijo en 0:20.
  hideAtSeconds: 20,
  // Informe opcional del rival (todo dato REAL, nada inferido).
  rivalCivs: false, // últimas 5 civilizaciones elegidas
  rivalFavorites: false, // civ más usada y winrate en el mapa de la partida
  rivalOpenings: false, // aperturas reales de AoE2Insights (replays analizados)
  debug: false,
};

const RIVAL_OPTION_KEYS = ['rivalCivs', 'rivalFavorites', 'rivalOpenings'];

// Los `rating/peak/rank` de todos los demos son de RM 1v1 (igual que en vivo),
// aunque el `ladder` del demo diga RM team / EW / Unranked.
// Flags de desarrollo: --demo[=rm1v1|tg|ew|custom] muestra datos de ejemplo sin
// tocar la red; --shot captura la ventana (--out=archivo.png) y cierra.
// --settings abre la configuración; --settings-shot la captura y cierra.
// --civ-help (con --demo) simula una partida a 0:03 para capturar la tarjeta;
// --civ-help=late simula 0:21; --hide-elo fuerza la opción de ocultar a 0:20.
const ARGV = process.argv.slice(1);
const DEMO_ARG = ARGV.find((arg) => arg === '--demo' || arg.startsWith('--demo='));
const DEMO = Boolean(DEMO_ARG);
const DEMO_MODE = DEMO_ARG && DEMO_ARG.includes('=') ? DEMO_ARG.split('=')[1] : 'rm1v1';
const SHOT = ARGV.includes('--shot');
const NO_PROFILE = ARGV.includes('--no-profile');
const MOVE_TEST = ARGV.includes('--move');
const SETTINGS = ARGV.includes('--settings');
const SETTINGS_SHOT = ARGV.includes('--settings-shot');
// Prueba local: simula el evento `matched` para verificar el panel sin hacer cola.
const FAKE_FOUND = ARGV.includes('--fake-found');
const CIV_HELP_ARG = ARGV.find((a) => a === '--civ-help' || a.startsWith('--civ-help='));
const CIV_HELP_DEMO = Boolean(CIV_HELP_ARG);
const CIV_HELP_LATE = CIV_HELP_ARG === '--civ-help=late';
const HIDE_ELO_DEMO = ARGV.includes('--hide-elo');
// --rival-info: siembra un informe de ejemplo para capturar la tarjeta nueva.
const RIVAL_DEMO = ARGV.includes('--rival-info');
const OUT_ARG = ARGV.find((arg) => arg.startsWith('--out='));
const SHOT_PATH = path.join(__dirname, OUT_ARG ? OUT_ARG.split('=')[1] : 'demo-shot.png');
// --example=<nombre|id>: arranca el Modo ejemplo con datos REALES para poder
// capturar el overlay desde la línea de comandos. --shot-delay ajusta la espera
// (las aperturas reales de AoE2Insights tardan ~9s la primera vez).
const EXAMPLE_ARG = ARGV.find((arg) => arg.startsWith('--example='));
const EXAMPLE_QUERY = EXAMPLE_ARG ? EXAMPLE_ARG.split('=').slice(1).join('=') : null;
const EXAMPLE_CLOCK_ARG = ARGV.find((arg) => arg.startsWith('--example-clock='));
const EXAMPLE_CLOCK = EXAMPLE_CLOCK_ARG ? EXAMPLE_CLOCK_ARG.split('=')[1] : '3';
const SHOT_DELAY_ARG = ARGV.find((arg) => arg.startsWith('--shot-delay='));
const SHOT_DELAY_MS = SHOT_DELAY_ARG ? Number(SHOT_DELAY_ARG.split('=')[1]) : 1500;
const EXAMPLE_SETTINGS_SHOT = ARGV.includes('--example-settings-shot');
// --example-cycle: recorre los botones de la UI antes de capturar (dev only).
const EXAMPLE_CYCLE = ARGV.includes('--example-cycle');

// --isolated: userData propio para capturar demos MIENTRAS el overlay real
// sigue abierto. requestSingleInstanceLock() comparte el userData, así que sin
// esto un demo en desarrollo choca con el .exe instalado/portable en uso.
// Es solo una herramienta de desarrollo: no cambia config.json ni el log.
const ISOLATED = ARGV.includes('--isolated');
if (ISOLATED) {
  app.setPath('userData', path.join(app.getPath('temp'), 'aoe2-elo-overlay-dev'));
}

// El canal de actualizaciones es solo para la app instalada de un jugador:
// ninguna corrida de desarrollo, demo o captura debe consultar GitHub Releases.
const DEV_SESSION = Boolean(
  DEMO || SHOT || SETTINGS_SHOT || EXAMPLE_QUERY || EXAMPLE_SETTINGS_SHOT ||
  EXAMPLE_CYCLE || CIV_HELP_DEMO || RIVAL_DEMO || FAKE_FOUND || MOVE_TEST || ISOLATED,
);

function demoPlayer(name, options) {
  return { profileId: options.id, name, civ: options.civ, team: options.team, colorHex: options.hex, ...options.extra };
}

const DEMO_STATES = {
  rm1v1: {
    mapName: 'Arabia',
    ladder: { id: 3, label: 'RM 1v1', source: 'ranked' },
    players: [
      demoPlayer('PSX | Acido', { id: 1, civ: 'Franks', team: 1, hex: '#3d7bff', extra: { isYou: true, color: 1, rating: 1180, peak: 1180, rank: 13876, hasStats: true } }),
      demoPlayer('Rival Ejemplo', { id: 2, civ: 'Poles', team: 2, hex: '#ff4d4d', extra: { isYou: false, color: 2, rating: 1254, peak: 1301, rank: 9214, hasStats: true } }),
    ],
  },
  tg: {
    mapName: 'MegaRandom',
    ladder: { id: 4, label: 'RM team', source: 'ranked' },
    players: [
      demoPlayer('PSX | Acido', { id: 1, civ: 'Gurjaras', team: 1, hex: '#3d7bff', extra: { isYou: true, color: 1, rating: 1982, peak: 2094, rank: 4210, hasStats: true } }),
      demoPlayer('Aliado Uno', { id: 2, civ: 'Vikings', team: 1, hex: '#35d05a', extra: { isYou: false, color: 3, rating: 1083, peak: 1120, rank: 18244, hasStats: true } }),
      demoPlayer('Aliado Dos', { id: 3, civ: 'Wu', team: 1, hex: '#ffd60a', extra: { isYou: false, color: 4, rating: 1171, peak: 1230, rank: 15102, hasStats: true } }),
      demoPlayer('Rival Uno', { id: 4, civ: 'Burgundians', team: 2, hex: '#ff4d4d', extra: { isYou: false, color: 2, rating: 1439, peak: 1502, rank: 9871, hasStats: true } }),
      demoPlayer('Rival Dos', { id: 5, civ: 'Poles', team: 2, hex: '#22d3ee', extra: { isYou: false, color: 5, rating: 1386, peak: 1440, rank: 11020, hasStats: true } }),
      demoPlayer('Rival Tres', { id: 6, civ: 'Jurchens', team: 2, hex: '#c084fc', extra: { isYou: false, color: 6, rating: 1433, peak: 1495, rank: 10004, hasStats: true } }),
    ],
  },
  ew: {
    mapName: 'Golden Pit',
    ladder: { id: 13, label: 'EW 1v1', source: 'ranked' },
    players: [
      demoPlayer('PSX | Acido', { id: 1, civ: 'Saracens', team: 1, hex: '#3d7bff', extra: { isYou: true, color: 1, rating: 2079, peak: 2082, rank: 3201, hasStats: true } }),
      demoPlayer('Rival EW', { id: 2, civ: 'Lithuanians', team: 2, hex: '#ff4d4d', extra: { isYou: false, color: 2, rating: 2054, peak: 2110, rank: 3488, hasStats: true } }),
    ],
  },
  custom: {
    mapName: 'SD3 Kerak v3 (Custom)',
    ladder: { id: 0, label: 'Unranked', source: 'match' },
    players: [
      demoPlayer('PSX | Acido', { id: 1, civ: 'Goths', team: 1, hex: '#3d7bff', extra: { isYou: true, color: 1, rating: 1180, peak: 1290, rank: 13876, hasStats: true } }),
      demoPlayer('Rival Custom', { id: 2, civ: 'Khmer', team: 2, hex: '#ff4d4d', extra: { isYou: false, color: 2, rating: 1254, peak: 1301, rank: 9214, hasStats: true } }),
    ],
  },
};

function demoState(mode) {
  const state = DEMO_STATES[mode] || DEMO_STATES.rm1v1;
  const withClock = CIV_HELP_DEMO || HIDE_ELO_DEMO;
  return {
    status: 'ongoing',
    match: {
      matchId: `demo-${mode}`,
      mapName: state.mapName,
      leaderboardName: state.ladder.label,
      // Reloj de partida simulado: 0:03 (tarjeta visible) o 0:21 (ya oculta).
      startedAt: withClock ? Date.now() - (CIV_HELP_LATE ? HIDE_AT_MS + 1000 : 3000) : null,
    },
    ladder: state.ladder,
    eloLadder: { id: 3, label: 'RM 1v1' },
    players: state.players,
    checkedAt: Date.now(),
  };
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const merged = { ...DEFAULT_CONFIG, ...raw };

    // Migración: agrega opciones nuevas (p. ej. opacity) sin pisar las del usuario,
    // para que estén visibles y editables en el archivo.
    if (Object.keys(raw).length !== Object.keys(merged).length) {
      try {
        fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`);
        log(`config migrada: se agregaron opciones nuevas en ${CONFIG_PATH}`);
      } catch {
        /* si no se puede escribir, igual se usan los valores fusionados */
      }
    }

    return merged;
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
      } catch {
        /* sin permisos de escritura: se usan los defaults */
      }
    }
    return { ...DEFAULT_CONFIG };
  }
}

const config = loadConfig();

const THEME_IDS = [
  'clasico',
  'noche',
  'vidrio',
  'claro',
  'neon',
  'fantasma',
  'aurora',
  'dorado',
  'carbono',
  'pergamino',
  'sakura',
];
const THEME_ARG = ARGV.find((arg) => arg.startsWith('--theme='));
if (THEME_ARG) config.theme = THEME_ARG.split('=')[1];
if (!THEME_IDS.includes(config.theme)) config.theme = 'clasico';

// Solo en memoria (las capturas no deben dejar tocada la config del usuario).
if (CIV_HELP_DEMO) config.civHelp = true;
if (HIDE_ELO_DEMO || CIV_HELP_LATE) config.hideEloAt20 = true;
if (RIVAL_DEMO) {
  config.rivalCivs = true;
  config.rivalFavorites = true;
  config.rivalOpenings = true;
}

let win = null;
let settingsWin = null;
let tray = null;
let heartbeatTimer = null;
const bootedAt = Date.now();
let quitReason = 'desconocido';
let isQuitting = false;
let profileId = null;
let playerAlias = null;
let timer = null;
let polling = false;
let lastStatus = null;
let lastPollAt = null;
let lastPollStatus = 'iniciando';
let lastSent = '';
let lastGood = null;
let updater = null; // actualizaciones automáticas (null en desarrollo / demos)
// Aviso de actualización: se muestra al entrar, nunca en mitad de una partida.
const UPDATE_TOAST_MS = 12 * 1000;
let updateToast = null; // { payload, until }
let deferredUpdateNotice = null;
let heightLogged = false;
let moving = false;
let moveSaveTimer = null;
let liveWatcher = null; // salas personalizadas (handler=lobbies)
let queueWatcher = null; // matchmaking ranked (handler=queueing) ← el importante
let liveLobbyAt = 0;
let liveMatchAt = 0;
let searching = false; // en cola: el REST se consulta más seguido
let preMatchGraceUntil = 0; // no parpadear a "Sin partida" durante la carga
let windowCrashes = 0;
let windowCrashReset = null;
// Reloj de partida y vista actual (ELO oculto / tarjeta de civ visible).
let intro = null;
let introTimer = null;
let lastViewSig = '';
let lastClockSent = null;
// Informe del rival: se calcula en BACKGROUND para no retrasar el aviso de
// "partida encontrada". `rivalSig` evita repetir consultas en cada poll.
let rivalReports = null;
let rivalSig = '';
let rivalFetching = false;
let rivalQueuedSig = null;
/* -------------------------------------------------------------------------
 * MODO EJEMPLO
 *
 * Mientras está activo:
 *  - el polling en vivo y los websockets NO pueden pisar el estado de prueba
 *    (emit() descarta todo lo que no tenga la marca `example`);
 *  - TODAS las opciones visuales se fuerzan ON SOLO EN MEMORIA, para que se
 *    puedan revisar de una pasada (ayuda de civ, ocultar a 0:20, informe del
 *    rival con civs/favoritos/aperturas). config.json NO se toca;
 *  - el reloj puede congelarse en 0:03 o 0:21, o correr en vivo hasta 0:20.
 * ---------------------------------------------------------------------- */
let exampleActive = false;
let exampleInfo = null;
let exampleFrozenAt = null; // number ⇒ clockNow() queda fijo en ese instante
let exampleClockMode = '3'; // '3' | '21' | 'live'
let exampleProfileId = null;
let exampleMatch = null; // última partida REAL normalizada
let exampleName = null;
let exampleToken = 0; // invalida un "Ver test" que sigue en vuelo
let pendingExample = null; // arranque pedido por CLI antes de overlay:ready

// En el ejemplo queremos ver TODAS las funciones, sin cambiar las preferencias
// reales del usuario. Es un override de PINTADO, no de configuración.
const EXAMPLE_ALL_ON = {
  civHelp: true,
  hideEloAt20: true,
  rivalCivs: true,
  rivalFavorites: true,
  rivalOpenings: true,
};

/** Config usada para dibujar. Nunca se persiste. */
function viewConfig() {
  return exampleActive ? { ...config, ...EXAMPLE_ALL_ON } : config;
}

/** Reloj usado por la intro: congelado en el ejemplo, real en partida. */
function clockNow() {
  return exampleFrozenAt != null ? exampleFrozenAt : Date.now();
}

const EXAMPLE_CLOCK_OFFSETS = { 3: 3000, 21: 21000, live: 3000 };

const statsCache = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function log(...args) {
  const stamp = new Date().toISOString().slice(11, 19);
  const line = `[${stamp}] ${args.join(' ')}`;
  console.log(line);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    /* el log a archivo es best-effort */
  }
}

// Sin esto, cualquier excepción o promesa rechazada sin capturar mata el
// proceso en silencio (la app "se cierra sola" y el log no dice por qué).
process.on('uncaughtException', (err) => {
  log(`CRASH · excepción no capturada: ${(err && (err.stack || err.message)) || err}`);
});
process.on('unhandledRejection', (reason) => {
  log(`CRASH · promesa rechazada sin capturar: ${(reason && (reason.stack || reason.message)) || reason}`);
});

// Marca el final REAL del proceso. Si en el log la última línea es un latido y
// NO aparece esta, el proceso fue matado desde afuera (kill / reinstalación /
// corte del launcher), no por un error de JS. Era la causa de "se cierra sola".
process.on('exit', (code) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] proceso terminado · code=${code} · motivo=${quitReason} · uptime=${Math.round((Date.now() - bootedAt) / 1000)}s\n`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    /* best-effort */
  }
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    quitReason = `señal ${signal}`;
    log(`señal ${signal} recibida: cerrando`);
    app.quit();
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Payload que consume el renderer: diseño, escala, escudos y perfil. */
function overlayConfig() {
  const view = viewConfig();
  return {
    scale: config.scale,
    opacity: clamp(Number(config.opacity) || 1, 0.15, 1),
    profileId,
    alias: playerAlias,
    pollSeconds: config.pollSeconds,
    configPath: CONFIG_PATH,
    theme: config.theme,
    shields: CIV_SLUGS,
    civAliases: CIV_ALIASES,
    // Dataset offline en español: se manda una sola vez al renderer, que no
    // puede usar require() por contextIsolation + CSP.
    civGuide: CIV_GUIDE,
    civHelp: Boolean(view.civHelp),
    hideEloAt20: Boolean(view.hideEloAt20),
    hideAtSeconds: hideAtMs(view) / 1000,
    rivalCivs: Boolean(view.rivalCivs),
    rivalFavorites: Boolean(view.rivalFavorites),
    rivalOpenings: Boolean(view.rivalOpenings),
    example: Boolean(exampleActive && exampleInfo),
    moving,
  };
}

/** Datos para el bloque "Estado" de la configuración. */
function diagnostics() {
  const ongoing = Boolean(lastGood && lastGood.status === 'ongoing');
  return {
    profileId,
    alias: playerAlias,
    origin: config.profileId ? 'manual' : 'auto',
    lastPollAt,
    lastPollStatus,
    lastMatch: ongoing
      ? `${lastGood.match.mapName} · ${lastGood.ladder.label}`
      : lastGood && lastGood.lastMatch
        ? `última: ${lastGood.lastMatch.mapName} · ${lastGood.lastMatch.leaderboardName}`
        : null,
    pollMs: fastMs(),
    logPath: LOG_PATH,
    matchStartedAt: intro && intro.engaged ? intro.startedAt : null,
    civHelp: Boolean(config.civHelp),
    hideEloAt20: Boolean(config.hideEloAt20),
    hideAtSeconds: hideAtMs(config) / 1000,
  };
}

/** "0:07" a partir del timestamp real de inicio, para el bloque Estado. */
function clockLabel(startedAt, now = Date.now()) {
  if (!Number.isFinite(startedAt)) return null;
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------
 * INFORME OPCIONAL DEL RIVAL
 *
 * Tres opciones independientes, todas con datos REALES:
 *   rivalCivs      → últimas 5 civs (AoE2 Companion /api/matches)
 *   rivalFavorites → civ + mapa más usados (AoE2 Companion /stats)
 *   rivalOpenings  → aperturas detectadas en replays (AoE2Insights
 *                    /stats/api/match-ups/, campo `strategy`)
 *
 * Se dispara EN BACKGROUND desde emit(): el aviso de "partida encontrada" y
 * el ELO salen en 0-1ms; el informe llega después y se va completando por
 * partes (civs primero ~0.3s, aperturas ~9s la primera vez, luego cache).
 * ---------------------------------------------------------------------- */
const RIVAL_LIMIT = 2; // en TG mostramos hasta 2 rivales para no tapar el juego

function rivalOptionsOn() {
  const view = viewConfig();
  return RIVAL_OPTION_KEYS.some((key) => Boolean(view[key]));
}

function rivalSignature(state, rivals) {
  const view = viewConfig();
  const flags = RIVAL_OPTION_KEYS.map((key) => (view[key] ? '1' : '0')).join('');
  const matchId = (state && state.match && state.match.matchId) || 'sin-id';
  const mapName = (state && state.match && state.match.mapName) || 'sin-mapa';
  const mode = resolveMode(leaderboardOf(state));
  return `${matchId}:${mode ? mode.id : 'sin-modo'}:${mapName}:${rivals.map((rival) => rival.profileId).join(',')}:${flags}`;
}

/** Ladder de la partida: del payload del match; si falta, del etiquetado. */
function leaderboardOf(state) {
  if (!state) return null;
  const fromMatch = state.match && state.match.leaderboardId;
  if (fromMatch != null && fromMatch !== '') return fromMatch;
  return state.ladder ? state.ladder.id : null;
}

function sendRival(payload) {
  rivalReports = payload;
  send('overlay:rival', payload);
}

function clearRivalReports() {
  rivalSig = '';
  rivalQueuedSig = null;
  if (rivalReports) sendRival(null);
}

/** Datos de ejemplo (reales de una consulta de prueba) solo para capturas. */
function demoRivalReports(state) {
  const mode = resolveMode(leaderboardOf(state)) || {
    id: 3, key: 'rm_1v1', label: 'RM 1v1', group: 'rm', size: '1v1',
  };
  const history = [
    { civ: 'Magyars', slug: 'magyars', won: true, mapName: 'Arabia' },
    { civ: 'Mongols', slug: 'mongols', won: true, mapName: 'Steppe' },
    { civ: 'Magyars', slug: 'magyars', won: false, mapName: 'Arabia' },
    { civ: 'Persians', slug: 'persians', won: false, mapName: 'African Clearing' },
    { civ: 'Ethiopians', slug: 'ethiopians', won: true, mapName: 'Kawasan' },
  ];
  const recent = [
    { name: 'Scout rush', short: 'Scouts', civ: 'Magyars', map: 'Arabia' },
    { name: 'Scout rush', short: 'Scouts', civ: 'Persians', map: 'Arabia' },
    { name: 'Fast castle', short: 'FC', civ: 'Berbers', map: 'African Clearing' },
    { name: 'Drush', short: 'Drush', civ: 'Magyars', map: 'Arabia' },
    { name: 'Archer rush', short: 'Archer rush', civ: 'Mongols', map: 'Steppe' },
  ];
  return {
    ts: Date.now(),
    demo: true,
    pendingOpenings: false,
    reports: opponentsOf(state, RIVAL_LIMIT).map((rival) => ({
      profileId: rival.profileId,
      name: rival.name,
      civ: rival.civ,
      mode,
      history,
      favoriteCiv: { name: 'Ethiopians', slug: 'ethiopians', games: 145, share: 53, winRate: 54 },
      mapStats: {
        name: state.match.mapName,
        games: 12,
        wins: 7,
        winRate: 58,
        sampleGames: 2,
        civ: { name: 'Magyars', slug: 'magyars', games: 2, wins: 1, share: 100, winRate: 50 },
      },
      totalGames: 276,
      statsLadderLabel: '1v1 Empire Wars',
      error: null,
      openingError: null,
      openings: {
        ok: true,
        source: 'AoE2Insights · aperturas detectadas en replays analizados',
        fromReplays: true,
        mode,
        modeUnavailable: false,
        discardedOtherModes: 5,
        analyzed: 36,
        uniqueMatches: 43,
        favorite: { name: 'Scout rush', short: 'Scouts', count: 20, share: 56 },
        mapAnalyzed: 3,
        mapFavorite: { name: 'Scout rush', short: 'Scouts', count: 2, share: 67 },
        mapCivAnalyzed: 2,
        mapCivFavorite: { name: 'Scout rush', short: 'Scouts', count: 2, share: 100 },
        ranking: [
          { name: 'Scout rush', short: 'Scouts', count: 20, share: 56 },
          { name: 'Drush', short: 'Drush', count: 9, share: 25 },
          { name: 'Fast castle', short: 'FC', count: 7, share: 19 },
        ],
        recent,
      },
    })),
  };
}

/**
 * Consulta y publica el informe. Idempotente por partida+opciones, y encola
 * un solo refresh si cambia el roster mientras una consulta está en vuelo.
 */
async function refreshRivalReports(state, options = {}) {
  const view = viewConfig();
  if (DEMO) {
    if (RIVAL_DEMO && state && state.status === 'ongoing') sendRival(demoRivalReports(state));
    return;
  }

  if (!rivalOptionsOn() || !state || state.status !== 'ongoing') {
    clearRivalReports();
    return;
  }

  const rivals = opponentsOf(state, RIVAL_LIMIT);
  const sig = rivalSignature(state, rivals);
  if (!options.force && sig === rivalSig && rivalReports) return;
  if (rivalFetching) {
    rivalQueuedSig = sig;
    return;
  }

  rivalSig = sig;
  if (!rivals.length) {
    // Pre-partida: todavía no hay roster, pero ya avisamos que se está cargando.
    sendRival({ ts: Date.now(), pendingOpenings: false, reports: [] });
    return;
  }

  rivalFetching = true;
  const startedAt = Date.now();
  const reports = [];
  const publish = (report, pendingOpenings, partial) => {
    const index = reports.findIndex((item) => item.profileId === report.profileId);
    if (index >= 0) reports[index] = report;
    else reports.push(report);
    sendRival({
      ts: Date.now(),
      pendingOpenings,
      partial,
      reports: reports.map((item) => ({ ...item })),
    });
  };

  try {
    // El panel ya puede mostrar "cargando…" sin esperar ninguna request.
    sendRival({
      ts: Date.now(),
      pendingOpenings: Boolean(view.rivalOpenings),
      partial: true,
      reports: rivals.map((rival) => ({
        profileId: rival.profileId,
        name: rival.name,
        civ: rival.civ,
        loading: true,
      })),
    });

    const leaderboardId = leaderboardOf(state);
    const mapName = state.match && state.match.mapName;
    const currentMatchId = state.match && state.match.matchId;

    for (const [rivalIndex, rival] of rivals.entries()) {
      const decorated = (data) => ({ ...data, name: rival.name, civ: rival.civ });
      const report = await buildRivalInsights({
        profileId: rival.profileId,
        name: rival.name,
        civ: rival.civ,
        leaderboardId,
        mapName,
        currentMatchId,
        cache: statsCache,
        cacheTtlMs: Number(config.statsCacheMinutes || 15) * 60 * 1000,
        includeOpenings: Boolean(view.rivalOpenings),
        // AoE2Insights contesta 202 y tarda ~9s: las civs se pintan YA.
        onPartial: (partial) => publish(decorated(partial), true, true),
        log,
      });
      publish(decorated(report), false, rivalIndex < rivals.length - 1);
      log(
        `informe del rival ${rival.name} (#${rival.profileId}) listo en ` +
          `${Date.now() - startedAt}ms · ${report.history.length} civs` +
          `${report.mode ? ` en ${report.mode.label}` : ''} · ` +
          `${report.mapStats ? `${report.mapStats.name}: ${report.mapStats.civ ? report.mapStats.civ.name : 'sin civ'}` : 'sin mapa'} · ` +
          `${report.openings ? report.openings.analyzed : 0} aperturas reales`,
      );
    }
  } catch (err) {
    log(`no pude armar el informe del rival: ${err.message}`);
  } finally {
    rivalFetching = false;
    if (rivalQueuedSig && rivalQueuedSig !== rivalSig) {
      rivalQueuedSig = null;
      rivalSig = '';
      refreshRivalReports(lastGood).catch(() => {});
    } else {
      rivalQueuedSig = null;
    }
  }
}

/**
 * Posición inicial: la que el usuario guardó moviendo el panel; si no hay,
 * arriba al centro. Se limita al monitor para que nunca quede fuera de vista.
 */
function initialPosition(width, height) {
  const savedX = Number(config.x);
  const savedY = Number(config.y);

  if (config.position === 'custom' && Number.isFinite(savedX) && Number.isFinite(savedY)) {
    const area = screen.getDisplayNearestPoint({
      x: Math.round(savedX),
      y: Math.round(savedY),
    }).workArea;
    return {
      x: Math.round(clamp(savedX, area.x, area.x + area.width - width)),
      y: Math.round(clamp(savedY, area.y, area.y + area.height - height)),
    };
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2 + Number(config.offsetX || 0)),
    y: Math.round(workArea.y + Number(config.offsetY || 0)),
  };
}

/**
 * Bandeja del sistema. Además de darle al usuario una forma explícita de salir,
 * mantiene la app viva cuando se cierran TODAS las ventanas: antes eso llamaba
 * a app.quit() y el overlay desaparecía "solo" al cerrar la configuración.
 */
function createTray() {
  if (tray) return;
  try {
    const image = nativeImage.createFromPath(ICON_PNG);
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }));
    tray.setToolTip('AoE2 ELO Overlay');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `AoE2 ELO Overlay v${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        { label: 'Configuración…', click: () => openSettings() },
        { label: 'Mostrar / ocultar panel', click: () => toggleOverlay() },
        {
          label: 'Refrescar ahora',
          click: () => {
            log('refresco manual desde la bandeja');
            poll();
          },
        },
        { label: 'Abrir carpeta del log', click: () => shell.showItemInFolder(LOG_PATH) },
        {
          label: 'Buscar actualizaciones…',
          click: () => {
            if (updater && updater.active) updater.check('manual desde la bandeja');
            else log('update · solo disponible en la app instalada');
          },
        },
        { type: 'separator' },
        { label: 'Salir', click: () => quitApp('bandeja · Salir') },
      ]),
    );
    tray.on('double-click', () => openSettings());
    log('icono de la bandeja listo: la app sigue viva aunque cierres las ventanas');
  } catch (err) {
    log(`no pude crear el icono de la bandeja: ${err.message}`);
  }
}

function matchOngoing() {
  return Boolean(lastGood && lastGood.status === 'ongoing');
}

/**
 * Una actualización nueva se anuncia de dos formas, sin estorbar al juego:
 *  - notificación nativa de Windows (clickeable → panel Updater);
 *  - chip temporal en el overlay (solo visual: el panel es click-through).
 * Si hay partida en curso se pospone y el latido lo muestra al terminar.
 */
function showUpdateNotice(notice) {
  if (!notice || !notice.version) return;
  if (notice.kind === 'up-to-date') {
    updateToast = null;
    send('overlay:update', { visible: false });
    return;
  }
  if (matchOngoing()) {
    deferredUpdateNotice = notice;
    log(`update · aviso pospuesto: hay partida en curso (v${notice.version})`);
    return;
  }

  const payload = {
    visible: true,
    kind: notice.kind,
    version: notice.version,
    current: notice.current,
  };
  updateToast = { payload, until: Date.now() + UPDATE_TOAST_MS };
  send('overlay:update', payload);

  try {
    if (!Notification.isSupported()) {
      log('update · las notificaciones nativas no están disponibles en este Windows');
      return;
    }
    const title = notice.kind === 'ready'
      ? `Actualización v${notice.version} lista`
      : `Actualización v${notice.version} disponible`;
    const body = notice.kind === 'ready'
      ? 'Se instala al salir, sin cortar la partida. Tocá para abrir Updater.'
      : 'Hay una versión nueva. Tocá para abrir Updater.';
    const toast = new Notification({ title, body, icon: ICON_PNG });
    toast.on('click', () => {
      openSettings();
      const jump = () => {
        if (settingsWin && !settingsWin.isDestroyed()) {
          settingsWin.webContents.send('settings:goto', 'updater');
        }
      };
      jump();
      // Si la ventana recién se está creando, el renderer todavía no registró
      // el listener: reenviamos cuando ya cargó. goTo() es idempotente.
      setTimeout(jump, 700);
    });
    toast.show();
    log(`update · notificación: ${title}`);
  } catch (err) {
    log(`update · no pude mostrar la notificación: ${err.message}`);
  }
}

function toggleOverlay() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    win.hide();
    log('overlay oculto (Ctrl+Alt+E para volver)');
  } else {
    win.showInactive();
    log('overlay visible');
  }
}

/** Salida explícita y SIEMPRE logueada, para distinguirla de un kill externo. */
function quitApp(reason) {
  quitReason = reason;
  isQuitting = true;
  app.quit();
}

function createWindow() {
  const width = Math.round(config.width * Number(config.scale || 1));
  const height = 140;
  const opacity = clamp(Number(config.opacity) || 1, 0.15, 1);
  const start = initialPosition(width, height);

  win = new BrowserWindow({
    width,
    height,
    x: start.x,
    y: start.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    opacity,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: ICON_PNG,
    // Nunca puede recibir foco ni activarse: no le saca el foco al juego.
    focusable: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Errores del panel al log: sin esto un fallo se ve como "Iniciando…" eterno.
  win.webContents.on('console-message', (_event, _level, message) => {
    if (message) log(`[panel] ${message}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    log(`el panel se cerró: ${details.reason}`);
    // Antes un 'clean-exit' se ignoraba y quedaba una ventana muerta en
    // pantalla (la app parecía cerrada). Ahora TODO cierre se recupera.
    windowCrashes += 1;
    clearTimeout(windowCrashReset);
    windowCrashReset = setTimeout(() => {
      windowCrashes = 0;
    }, 5 * 60 * 1000);
    if (windowCrashes > 5) {
      log('el panel crasheó 5 veces en 5 minutos: no lo recreo para no loopear');
      return;
    }
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        log('recargando el panel tras el cierre del renderer…');
        win.reload();
      } else {
        log('recreando la ventana del overlay…');
        createWindow();
      }
    }, 1000);
  });
  win.webContents.on('unresponsive', () => log('el panel dejó de responder'));

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setFocusable(false);
  // Click-through permanente: los clicks pasan al juego.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setOpacity(opacity);
  win.loadFile(path.join(__dirname, 'index.html'));

  win.webContents.on('did-finish-load', () => log('renderer cargado'));
  win.webContents.on('did-fail-load', (_event, code, description) =>
    log(`el renderer no cargó: ${description} (${code})`),
  );

  win.once('ready-to-show', () => {
    win.showInactive();

    // Diagnóstico: confirma que la ventana existe, es visible y dónde está.
    setTimeout(() => {
      if (!win) return;
      log(
        `ventana visible=${win.isVisible()} focusable=${win.isFocusable()} ` +
          `opacidad=${win.getOpacity().toFixed(2)} bounds=${JSON.stringify(win.getBounds())}`,
      );
    }, 400);

    send('overlay:config', overlayConfig());

    if (DEMO) {
      // Por emit() y no send() directo: así el demo pasa por el mismo reloj de
      // partida que una partida real y se puede capturar la tarjeta de civ.
      setTimeout(() => emit(demoState(DEMO_MODE)), 250);
    }

    if (SHOT) {
      setTimeout(async () => {
        try {
          const dotColor = await win.webContents.executeJavaScript(
            "getComputedStyle(document.querySelector('.dot')).backgroundColor",
          );
          log(`color computado del punto de equipo: ${dotColor}`);
          const image = await win.webContents.capturePage();
          fs.writeFileSync(SHOT_PATH, image.toPNG());
          const size = image.getSize();
          log(`captura guardada en ${SHOT_PATH} (${size.width}x${size.height})`);
        } catch (err) {
          log(`no se pudo capturar la ventana: ${err.message}`);
        }
        app.quit();
      }, SHOT_DELAY_MS);
    }

    if (DEMO && !SHOT) log(`modo demo activo: ${DEMO_MODE} (Ctrl+Alt+Q para cerrar)`);
    if (MOVE_TEST) setTimeout(() => setMovable(true), 800);
  });

  // Guardado continuo mientras arrastra: si cierra la app en el medio, queda igual.
  win.on('moved', () => {
    if (!moving) return;
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      persistConfig({ position: 'custom', x, y });
    }, 400);
  });

  win.on('closed', () => {
    win = null;
  });
}

/** Ventana normal (clickeable, con foco) para elegir la cuenta. */
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }

  settingsWin = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 860,
    minHeight: 560,
    title: 'Aoe2 Helper',
    icon: ICON_PNG,
    backgroundColor: '#121211',
    autoHideMenuBar: true,
    show: false,
    // Sin barra nativa de Windows: la ventana dibuja su propia barra oscura
    // con minimizar / maximizar / cerrar, a juego con el overlay.
    frame: false,
    hasShadow: true,
    // Puede tener que aparecer por encima del juego: es la única ventana clickeable.
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.setMenuBarVisibility(false);
  settingsWin.setAlwaysOnTop(true, 'screen-saver');

  // La barra propia necesita saber si la ventana está maximizada para cambiar
  // el ícono (maximizar ↔ restaurar).
  settingsWin.on('maximize', () => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('settings:maximized', true);
    }
  });
  settingsWin.on('unmaximize', () => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('settings:maximized', false);
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'), { query: { theme: config.theme } });
  settingsWin.webContents.on('did-fail-load', (_event, code, description) =>
    log(`la configuración no cargó: ${description} (${code})`),
  );
  settingsWin.webContents.on('render-process-gone', (_event, details) =>
    log(`la configuración se cerró: ${details.reason}`),
  );

  settingsWin.once('ready-to-show', () => {
    if (!settingsWin) return;
    settingsWin.show();
    settingsWin.focus();
    settingsWin.webContents.send('settings:maximized', settingsWin.isMaximized());
    log('ventana de configuración abierta');

    if (SETTINGS_SHOT) {
      setTimeout(async () => {
        try {
          // Recorrido real de la UI: tipear, ver sugerencias, elegir y volver a auto.
          await settingsWin.webContents.executeJavaScript(`(() => {
            const input = document.getElementById('search');
            input.focus();
            input.value = 'acido';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 1400));

          const rendered = await settingsWin.webContents.executeJavaScript(
            "document.querySelectorAll('#results .result').length",
          );
          log(`config: sugerencias tipeando \"acido\" → ${rendered} filas en pantalla`);

          const image = await settingsWin.webContents.capturePage();
          fs.writeFileSync(SHOT_PATH, image.toPNG());
          const size = image.getSize();
          log(`captura de configuración en ${SHOT_PATH} (${size.width}x${size.height})`);

          // Elegir la primera sugerencia: verifica preload + IPC + guardado.
          const picked = await settingsWin.webContents.executeJavaScript(`(async () => {
            document.querySelector('#results .result').click();
            await new Promise((r) => setTimeout(r, 1500));
            return {
              status: document.getElementById('status').textContent,
              current: document.getElementById('currentName').textContent,
            };
          })()`);
          log(`config: al elegir → \"${picked.status}\" · cuenta activa \"${picked.current}\"`);

          // Vuelve a detección automática para no dejar la config tocada.
          await settingsWin.webContents.executeJavaScript('window.settings.auto()');
          await new Promise((resolve) => setTimeout(resolve, 800));
          const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).profileId;
          log(`config: tras detectar automáticamente profileId=${JSON.stringify(saved)}`);
        } catch (err) {
          log(`no se pudo capturar/probar la configuración: ${err.message}`);
        }
        app.quit();
      }, 1600);
    }

    if (EXAMPLE_SETTINGS_SHOT) {
      setTimeout(async () => {
        try {
          if (EXAMPLE_CYCLE) {
            const cycle = await settingsWin.webContents.executeJavaScript(`(async () => {
              const wait = (ms) => new Promise((r) => setTimeout(r, ms));
              const steps = [];
              for (const mode of ['21', '3', 'live', '3']) {
                const target = document.querySelector('#exampleClock button[data-clock="' + mode + '"]');
                const before = document.getElementById('exampleStatus').textContent.trim();
                target.click();
                await wait(900);
                const after = document.getElementById('exampleStatus').textContent.trim();
                steps.push(mode + '[id=' + target.id + ',disabled=' + target.disabled + ',antes=' + before + ']→' + after);
              }
              document.getElementById('exampleStopBtn').click();
              await wait(900);
              steps.push('stop→controlesOcultos=' + document.getElementById('exampleControls').hidden);
              document.getElementById('exampleBtn').click();
              await wait(3000);
              steps.push('restart→controlesVisibles=' + !document.getElementById('exampleControls').hidden);
              return steps.join(' | ');
            })()`);
            log(`--example-cycle: ${cycle}`);
          }
          await settingsWin.webContents.executeJavaScript(`(() => {
            const card = document.querySelector('.example-card');
            if (card) card.scrollIntoView({ block: 'center' });
            return true;
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const image = await settingsWin.webContents.capturePage();
          fs.writeFileSync(SHOT_PATH, image.toPNG());
          const size = image.getSize();
          log(`captura del Modo ejemplo en ${SHOT_PATH} (${size.width}x${size.height})`);
        } catch (err) {
          log(`no se pudo capturar el Modo ejemplo: ${err.message}`);
        }
        app.quit();
      }, SHOT_DELAY_MS);
    }
  });

  settingsWin.on('closed', () => {
    settingsWin = null;
  });

  return settingsWin;
}

/** Guarda opciones en config.json y las aplica en memoria. */
function persistConfig(patch) {
  try {
    let current = {};
    try {
      current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      current = {};
    }
    const next = { ...DEFAULT_CONFIG, ...current, ...patch };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`);
  } catch (err) {
    log(`no pude guardar la config: ${err.message}`);
  }
  Object.assign(config, patch);
}

/** Guarda profileId en el config (null = volver a detección automática). */
function persistProfile(value) {
  persistConfig({ profileId: value == null ? null : Number(value) });
}

/** Aplica un perfil nuevo en caliente, sin reiniciar la app. */
function setRuntimeProfile(nextProfileId, alias) {
  profileId = Number(nextProfileId);
  playerAlias = alias || null;
  statsCache.clear();
  lastSent = '';
  lastGood = null;
  clearRivalReports();
  intro = null;
  clearTimeout(introTimer);
  syncIntro(null, { force: true });
  startLive();
  poll();
}

/**
 * Detección instantánea de partida, ANTES de entrar al mapa.
 *
 * Dos sockets de AoE2 Companion:
 *  - `queueing`  → matchmaking ranked. Apenas el juego arma la partida llega
 *    un item `status:'matched'` con roster, ELO, rank y mapa. Es la ventana de
 *    ~60s de preparación. ESTE es el que resuelve el caso del usuario.
 *  - `lobbies`   → salas personalizadas (browser de lobbies), por completitud.
 *
 * El REST /api/matches solo lista la partida cuando ya empezó, así que mientras
 * hay pre-partida activa el polling no pisa el panel con "sin partida".
 */
function startLive() {
  stopLive();
  if (!profileId || DEMO || NO_PROFILE) return;

  // Primario: matchmaking ranked.
  queueWatcher = new QueueWatcher({
    profileId,
    log,
    // Apenas el servidor cierra MI cola con reason:'matched' pintamos el
    // cartel "Partida encontrada", sin esperar ni un solo request. El roster
    // (onMatched) llega en el mismo lote y lo reemplaza en milisegundos.
    onFound: (matchId) => {
      const at = Date.now();
      liveMatchAt = at;
      preMatchGraceUntil = at + 20000;
      log(`PARTIDA ENCONTRADA · cola apareada (matchId ${matchId}) · aviso en 0ms`);
      emit({
        status: 'ongoing',
        phase: 'lobby',
        match: { matchId, mapName: '—', leaderboardName: 'Ranked', startedAt: null },
        ladder: { id: null, label: 'Partida encontrada', source: 'ranked' },
        eloLadder: { id: 3, label: 'RM 1v1' },
        players: [],
        pending: true,
        checkedAt: at,
      });
    },
    onMatched: (item) => {
      liveMatchAt = Date.now();
      preMatchGraceUntil = liveMatchAt + 20000;
      showMatchFound(item);
    },
    onGone: (id) => {
      log(`partida apareada ${id} terminó/canceló: toma el control el REST`);
      liveMatchAt = 0;
      poll();
    },
    onSearching: (active) => {
      searching = active;
      log(active ? 'estás buscando partida (cola detectada) · polling acelerado' : 'cola finalizada');
      if (active) scheduleNext('idle');
    },
  });
  queueWatcher.start();

  // Secundario: salas personalizadas.
  liveWatcher = new LobbyWatcher({
    profileId,
    log,
    onLobby: (lobby) => {
      // Si ya hay match de ranked, ese manda: no lo pisa una sala ajena.
      if (matchFoundActive()) return;
      liveLobbyAt = Date.now();
      showLobby(lobby);
    },
    onLobbyGone: () => {
      liveLobbyAt = 0;
      poll();
    },
  });
  liveWatcher.start();
}

function stopLive() {
  if (liveWatcher) liveWatcher.stop();
  if (queueWatcher) queueWatcher.stop();
  liveWatcher = null;
  queueWatcher = null;
  liveLobbyAt = 0;
  liveMatchAt = 0;
  searching = false;
  preMatchGraceUntil = 0;
}

function matchFoundActive() {
  return Boolean(queueWatcher && queueWatcher.matched && Date.now() - liveMatchAt < 15 * 60 * 1000);
}

/** Hay pre-partida activa (match de ranked o sala custom). */
function lobbyActive() {
  return matchFoundActive() || Boolean(liveWatcher && liveWatcher.lobby && Date.now() - liveLobbyAt < 15 * 60 * 1000);
}

/** Dibuja el roster en el mismo instante en que el juego encontró partida. */
async function showMatchFound(item) {
  const startedAt = Date.now();
  try {
    const snapshot = await buildSnapshotFromMatch(item, {
      profileId,
      cache: statsCache,
      cacheTtlMs: Number(config.statsCacheMinutes || 15) * 60 * 1000,
      onPartial: (partial) => {
        if (emit(partial)) {
          log(
            `PARTIDA ENCONTRADA · roster en pantalla en ${Date.now() - startedAt}ms ` +
              `(${partial.players.length} jugadores, ${partial.match.mapName}) · pidiendo ELO RM 1v1`,
          );
        }
      },
    });
    if (emit(snapshot)) {
      const roster = snapshot.players
        .map((p) => `${p.name}${p.isYou ? '*' : ''} ${p.rating ?? '—'}/${p.peak ?? '—'}`)
        .join(' · ');
      log(
        `PRE-PARTIDA · ${snapshot.match.mapName} · ${snapshot.ladder.label} · ELO RM 1v1 · ` +
          `completo en ${Date.now() - startedAt}ms · ${roster}`,
      );
    }
  } catch (err) {
    log(`no pude armar la partida encontrada: ${err.message}`);
  }
}

async function showLobby(lobby) {
  const startedAt = Date.now();
  try {
    const snapshot = await buildSnapshotFromLobby(lobby, {
      profileId,
      cache: statsCache,
      cacheTtlMs: Number(config.statsCacheMinutes || 15) * 60 * 1000,
      onPartial: (partial) => {
        if (emit(partial)) {
          log(`sala encontrada · roster en pantalla (${Date.now() - startedAt}ms) · pidiendo ELO RM 1v1`);
        }
      },
    });
    if (emit(snapshot)) {
      const roster = snapshot.players
        .map((p) => `${p.name}${p.isYou ? '*' : ''} ${p.rating ?? '—'}/${p.peak ?? '—'}`)
        .join(' · ');
      log(
        `SALA · ${snapshot.match.mapName} · modo ${snapshot.ladder.label} · ELO RM 1v1 · ` +
          `${snapshot.players.length} jugadores · completo en ${Date.now() - startedAt}ms · ${roster}`,
      );
    }
  } catch (err) {
    log(`no pude armar la sala: ${err.message}`);
  }
}

async function chooseProfile(rawId) {
  const id = Number(String(rawId ?? '').trim());
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Ese ID no es válido.' };

  try {
    const identity = await fetchProfileIdentity(id);
    if (!identity) return { ok: false, error: 'No encontré un perfil de AoE2 con ese ID.' };

    persistProfile(identity.profileId);
    setRuntimeProfile(identity.profileId, identity.alias);
    log(`perfil elegido en configuración: ${identity.alias || 'sin alias'} (${identity.profileId})`);
    return { ok: true, profileId: identity.profileId, alias: identity.alias };
  } catch (err) {
    log(`no pude validar el perfil ${id}: ${err.message}`);
    return { ok: false, error: 'No pude consultar ese perfil (¿sin internet?).' };
  }
}

/* -------------------------------------------------------------------------
 * MODO EJEMPLO · "Ver test"
 *
 * 1) Resuelve el nombre/ID del jugador (búsqueda pública o validación del ID).
 * 2) Trae su ÚLTIMA PARTIDA REAL, aunque ya haya terminado, con ELO RM 1v1
 *    real de todo el roster (src/aoe.js → buildExampleSnapshot).
 * 3) La publica como `ongoing` con la marca `example`, así pasa por el MISMO
 *    renderer, el MISMO reloj de intro y el MISMO informe del rival que una
 *    partida de verdad. No hay maquetas ni datos inventados.
 * 4) Fuerza en memoria todas las opciones visuales para revisarlas de una.
 * 5) Congela el reloj en 0:03 / 0:21, o lo deja correr hasta 0:20.
 * ---------------------------------------------------------------------- */
const EXAMPLE_CACHE_TTL = () => Number(config.statsCacheMinutes || 15) * 60 * 1000;

function normalizeClockMode(mode) {
  const value = String(mode || '3');
  return Object.prototype.hasOwnProperty.call(EXAMPLE_CLOCK_OFFSETS, value) ? value : '3';
}

function clockModeLabel(mode) {
  return mode === 'live' ? 'en vivo' : `0:${String(mode).padStart(2, '0')}`;
}

function exampleStatus() {
  return exampleActive && exampleInfo ? { ...exampleInfo, active: true } : null;
}

function broadcastExample() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings:example', exampleStatus());
  }
}

/** Nombre de jugador → primer perfil público; número → ID validado. */
async function resolveExampleProfile(query) {
  const term = String(query || '').trim();
  if (!term) throw new Error('Escribí un nombre de jugador o un profile ID.');

  if (/^\d+$/.test(term)) {
    const identity = await fetchProfileIdentity(Number(term));
    if (!identity) throw new Error(`No encontré el perfil #${term}.`);
    return {
      profileId: identity.profileId,
      name: identity.alias || `Perfil ${identity.profileId}`,
    };
  }

  const profiles = await searchProfiles(term, 8);
  if (!profiles.length) throw new Error(`No encontré ningún jugador llamado "${term}".`);
  const exact = profiles.find((p) => String(p.name || '').toLowerCase() === term.toLowerCase());
  const best = exact || profiles[0];
  return {
    profileId: best.profileId,
    name: best.clan ? `${best.clan} | ${best.name}` : best.name,
  };
}

/** Reconstruye el partido normalizado para poder cambiar el reloj sin red. */
function exampleMatchFrom(snapshot) {
  return {
    matchId: snapshot.match.matchId,
    mapName: snapshot.match.mapName,
    leaderboardId: snapshot.match.leaderboardId,
    leaderboardName: snapshot.match.leaderboardName,
    startedAt: snapshot.example.realStartedAt,
    finishedAt: snapshot.example.finishedAt,
    players: snapshot.players.map((p) => ({
      profileId: p.profileId,
      name: p.name,
      civ: p.civ,
      colorHex: p.colorHex,
      color: p.color,
      team: p.team,
      slot: p.slot,
      matchRating: p.matchRating,
      matchRatingDiff: p.matchRatingDiff,
      won: p.won,
    })),
  };
}

function exampleInfoFrom(snapshot, resolved, mode, began) {
  const ex = snapshot.example;
  return {
    profileId: resolved.profileId,
    name: resolved.name,
    matchId: ex.matchId,
    mapName: snapshot.match.mapName,
    leaderboardName: snapshot.ladder.label,
    players: snapshot.players.length,
    realStartedAt: ex.realStartedAt,
    finishedAt: ex.finishedAt,
    alreadyFinished: ex.alreadyFinished,
    clock: mode,
    clockText: clockModeLabel(mode),
    elapsedMs: Date.now() - began,
    // Para que la UI sea honesta: datos reales, reloj de prueba.
    source: 'AoE2 Companion + World\'s Edge + AoE2Insights',
  };
}

/** Apaga el ejemplo SIN consultar aún el estado en vivo. */
function deactivateExample() {
  exampleActive = false;
  exampleInfo = null;
  exampleFrozenAt = null;
  exampleProfileId = null;
  exampleMatch = null;
  exampleName = null;
  exampleClockMode = '3';
  exampleToken += 1; // invalida cualquier "Ver test" que siga en vuelo
  intro = null;
  lastSent = '';
  lastGood = null; // que un reload del panel no vuelva a pintar el ejemplo
  lastViewSig = '';
  rivalSig = '';
  clearRivalReports();
  clearTimeout(introTimer);
  introTimer = null;
  send('overlay:config', overlayConfig()); // vuelven las opciones REALES
  syncIntro(null, { force: true }); // ELO visible de nuevo, ayuda oculta
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings:clock', null);
  }
  broadcastExample();
}

async function startExample(rawQuery, clockMode = '3') {
  const token = ++exampleToken;
  const mode = normalizeClockMode(clockMode);
  const began = Date.now();
  const hadExample = Boolean(exampleActive && exampleInfo);

  try {
    const resolved = await resolveExampleProfile(rawQuery);
    if (token !== exampleToken) return { ok: false, error: 'Otra prueba reemplazó a esta.' };

    // Se bloquea el estado en vivo ANTES de las consultas: mientras llega la
    // respuesta, los sockets siguen emitiendo y no deben pisar el panel.
    exampleActive = true;
    exampleProfileId = resolved.profileId;
    exampleName = resolved.name;
    exampleClockMode = mode;
    exampleFrozenAt = mode === 'live' ? null : began;

    const snapshot = await buildExampleSnapshot({
      profileId: resolved.profileId,
      cache: statsCache,
      cacheTtlMs: EXAMPLE_CACHE_TTL(),
      now: clockNow(),
      clockOffsetMs: EXAMPLE_CLOCK_OFFSETS[mode],
    });
    if (token !== exampleToken) return { ok: false, error: 'Otra prueba reemplazó a esta.' };

    exampleMatch = exampleMatchFrom(snapshot);
    exampleInfo = exampleInfoFrom(snapshot, resolved, mode, began);

    // Partida nueva ⇒ reloj e informe del rival nuevos.
    intro = null;
    lastSent = '';
    lastViewSig = '';
    rivalSig = '';
    clearRivalReports();
    send('overlay:config', overlayConfig()); // enciende todas las opciones (memoria)
    emit(snapshot);
    sendView(true);
    broadcastExample();

    log(
      `MODO EJEMPLO · ${resolved.name} (#${resolved.profileId}) · partida REAL ` +
        `#${snapshot.match.matchId} · ${snapshot.match.mapName} · ${snapshot.ladder.label} · ` +
        `${snapshot.players.length} jugadores · reloj ${clockModeLabel(mode)} · ` +
        `${Date.now() - began}ms · el informe del rival sigue en segundo plano`,
    );
    return { ok: true, example: exampleStatus() };
  } catch (err) {
    if (token === exampleToken) {
      log(`modo ejemplo: ${err.message}`);
      // Si ya había un ejemplo válido, no lo tiramos por una búsqueda fallida.
      if (!hadExample) deactivateExample();
    }
    return { ok: false, error: err.message };
  }
}

/** Cambia 0:03 / 0:21 / en vivo sin volver a consultar ninguna API. */
async function setExampleClock(clockMode) {
  if (!exampleActive || !exampleMatch) {
    return { ok: false, error: 'No hay ningún ejemplo activo.' };
  }
  const mode = normalizeClockMode(clockMode);
  exampleClockMode = mode;
  exampleFrozenAt = mode === 'live' ? null : Date.now();

  const snapshot = await buildExampleSnapshot({
    profileId: exampleProfileId,
    cache: statsCache,
    cacheTtlMs: EXAMPLE_CACHE_TTL(),
    now: clockNow(),
    clockOffsetMs: EXAMPLE_CLOCK_OFFSETS[mode],
    match: exampleMatch,
  });

  // `startedAt` cambió ⇒ intro nueva. NO se limpia rivalSig: el partido y los
  // rivales son los mismos, así que el informe ya calculado se reaprovecha.
  intro = null;
  lastSent = '';
  lastViewSig = '';
  if (exampleInfo) {
    exampleInfo = { ...exampleInfo, clock: mode, clockText: clockModeLabel(mode) };
  }
  emit(snapshot);
  sendView(true);
  broadcastExample();
  log(`modo ejemplo · reloj ${clockModeLabel(mode)}${mode === 'live' ? ' (corre hasta 0:20)' : ' (congelado)'}`);
  return { ok: true, example: exampleStatus() };
}

function stopExample() {
  if (!exampleActive) return { ok: true, active: false };
  deactivateExample();
  log('modo ejemplo terminado: el panel vuelve al estado real');
  // Repinta el estado en vivo sin esperar al próximo tick del polling.
  poll().catch(() => {});
  return { ok: true, active: false };
}

function registerIpc() {
  ipcMain.on('overlay:height', (_event, height) => {
    if (config.debug) log(`altura medida del panel: ${Math.round(height)}px`);
    else if (!heightLogged) {
      heightLogged = true;
      log(`panel dibujado (${Math.round(height)}px de alto)`);
    }
    applyHeight(height);
  });

  ipcMain.handle('settings:get', () => ({
    profileId,
    alias: playerAlias,
    origin: config.profileId ? 'manual' : 'auto',
    configPath: CONFIG_PATH,
    theme: config.theme,
    opacity: clamp(Number(config.opacity) || 1, 0.15, 1),
    position: config.position,
    x: config.x,
    y: config.y,
    moving,
    civHelp: Boolean(config.civHelp),
    hideEloAt20: Boolean(config.hideEloAt20),
    hideAtSeconds: hideAtMs(config) / 1000,
    rivalCivs: Boolean(config.rivalCivs),
    rivalFavorites: Boolean(config.rivalFavorites),
    rivalOpenings: Boolean(config.rivalOpenings),
    matchStartedAt: intro && intro.engaged ? intro.startedAt : null,
    exampleClockElapsedMs:
      exampleFrozenAt != null && intro && intro.engaged
        ? Math.max(0, exampleFrozenAt - intro.startedAt)
        : null,
    example: exampleStatus(),
    version: app.getVersion(),
    diagnostics: diagnostics(),
  }));

  // Panel "Updater": estado real de electron-updater. En desarrollo el módulo
  // devuelve active:false y la UI lo muestra sin inventar datos.
  const updaterState = () => (updater ? updater.getStatus() : { active: false, current: app.getVersion() });
  ipcMain.handle('updater:get', () => updaterState());
  ipcMain.handle('updater:check', async () => {
    // Esperar el resultado real evita devolver un estado intermedio con
    // `checking: true` que deje colgado el cartel "Buscando…" en el panel.
    if (updater) await updater.check('manual desde el panel');
    return updaterState();
  });
  ipcMain.handle('updater:download', () => {
    if (updater) updater.download();
    return updaterState();
  });
  ipcMain.handle('updater:install', () => {
    if (updater) updater.install();
    return { ok: true };
  });
  ipcMain.handle('updater:skip', () => {
    if (updater) updater.skip();
    return updaterState();
  });

  ipcMain.handle('settings:open-log', () => {
    try {
      shell.showItemInFolder(LOG_PATH);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('settings:search', async (_event, query) => {
    try {
      return { ok: true, results: await searchProfiles(query) };
    } catch (err) {
      log(`búsqueda de perfiles falló: ${err.message}`);
      return { ok: false, error: 'La búsqueda falló (¿sin internet?).', results: [] };
    }
  });

  ipcMain.handle('settings:pick', (_event, rawId) => chooseProfile(rawId));

  ipcMain.handle('settings:auto', async () => {
    try {
      const detected = await detectProfile(log);
      if (!detected) {
        return { ok: false, error: 'No encontré ninguna cuenta de AoE2 en esta PC. Escribí tu nombre o tu ID.' };
      }
      persistProfile(null);
      setRuntimeProfile(detected.profileId, detected.alias);
      log(`detección pedida desde configuración: ${detected.alias || 'sin alias'} (${detected.profileId})`);
      return { ok: true, profileId: detected.profileId, alias: detected.alias };
    } catch (err) {
      log(`detección desde configuración falló: ${err.message}`);
      return { ok: false, error: 'La detección automática falló.' };
    }
  });

  ipcMain.handle('settings:theme', (_event, raw) => {
    const theme = String(raw || '');
    if (!THEME_IDS.includes(theme)) return { ok: false, error: 'Ese diseño no existe.' };

    persistConfig({ theme });
    send('overlay:config', overlayConfig());
    log(`diseño del overlay: ${theme}`);
    return { ok: true, theme };
  });

  ipcMain.handle('settings:opacity', (_event, raw) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return { ok: false, error: 'Valor de opacidad inválido.' };

    const value = Math.round(clamp(parsed, 0.15, 1) * 100) / 100;
    persistConfig({ opacity: value });
    if (win && !win.isDestroyed()) win.setOpacity(value);
    log(
      `opacidad del overlay: ${value.toFixed(2)}` +
        (win && !win.isDestroyed() ? ` (aplicada=${win.getOpacity().toFixed(2)})` : ''),
    );
    return { ok: true, opacity: value };
  });

  // Las dos opciones nuevas. Se aplican EN CALIENTE: si hay una partida en
  // curso se recalcula la vista con el reloj ya andando, sin reiniciar nada.
  ipcMain.handle('settings:civHelp', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ civHelp: enabled });
    send('overlay:config', overlayConfig());
    syncIntro(lastGood, { force: true });
    log(`ayuda de civ: ${enabled ? 'activada (0:01 → 0:20)' : 'desactivada'}`);
    return { ok: true, civHelp: enabled };
  });

  ipcMain.handle('settings:hideEloAt20', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ hideEloAt20: enabled });
    send('overlay:config', overlayConfig());
    syncIntro(lastGood, { force: true });
    log(`ocultar ELO al segundo ${hideAtMs(config) / 1000}: ${enabled ? 'activado' : 'desactivado'}`);
    return { ok: true, hideEloAt20: enabled };
  });

  // Tiempo de ocultado elegido por el usuario (10 a 60 s, default 20).
  ipcMain.handle('settings:hideAtSeconds', (_event, raw) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return { ok: false, error: 'Ese tiempo no es válido.' };
    const seconds = Math.round(clamp(parsed, 10, 60));
    persistConfig({ hideAtSeconds: seconds });
    send('overlay:config', overlayConfig());
    syncIntro(lastGood, { force: true });
    log(`ocultar ELO y ayuda a los ${seconds}s`);
    return { ok: true, hideAtSeconds: seconds };
  });

  // Las tres opciones del informe del rival comparten un solo handler con
  // whitelist: se prenden/apagan en caliente, sin reiniciar y sin consultar
  // la red cuando la última opción se apaga.
  ipcMain.handle('settings:rivalOption', (_event, rawKey, rawValue) => {
    const key = String(rawKey || '');
    if (!RIVAL_OPTION_KEYS.includes(key)) return { ok: false, error: 'Esa opción no existe.' };
    const enabled = Boolean(rawValue);
    persistConfig({ [key]: enabled });
    send('overlay:config', overlayConfig());
    log(`informe del rival · ${key}: ${enabled ? 'activado' : 'desactivado'}`);

    if (!rivalOptionsOn()) {
      clearRivalReports();
    } else {
      // Cambió el conjunto de datos pedidos: recalcular con la firma nueva.
      rivalSig = '';
      refreshRivalReports(lastGood, { force: true }).catch(() => {});
    }
    return { ok: true, key, enabled };
  });

  // Modo ejemplo: arrancar con la última partida REAL, mover el reloj y salir.
  ipcMain.handle('settings:exampleStart', (_event, rawQuery, rawClock) =>
    startExample(rawQuery, rawClock || '3'),
  );
  ipcMain.handle('settings:exampleClock', (_event, rawMode) => setExampleClock(rawMode));
  ipcMain.handle('settings:exampleStop', () => stopExample());

  ipcMain.on('settings:minimize', () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.minimize();
  });

  ipcMain.on('settings:toggle-maximize', () => {
    if (!settingsWin || settingsWin.isDestroyed()) return;
    if (settingsWin.isMaximized()) settingsWin.unmaximize();
    else settingsWin.maximize();
  });

  ipcMain.on('settings:close', () => {
    if (moving) setMovable(false);
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
  });

  // El renderer avisa cuando ya escucha: recién ahí se le manda el estado actual.
  ipcMain.on('overlay:ready', () => {
    log('panel listo: reenvío configuración y estado actual');
    send('overlay:config', overlayConfig());
    lastSent = null;
    if (lastGood) emit(lastGood);
    // El renderer nuevo arranca sin clases: hay que reenviarle la vista activa.
    sendView(true);
    // Y también el informe del rival que ya estaba calculado.
    if (rivalReports) send('overlay:rival', rivalReports);

    // Si el renderer se recargó mientras el chip de actualización estaba
    // vigente, lo repintamos (se apaga solo por su propio timer).
    if (updateToast && updateToast.until > Date.now() && !matchOngoing()) {
      send('overlay:update', updateToast.payload);
    } else {
      updateToast = null;
      send('overlay:update', { visible: false });
    }

    // CLI --example: recién acá el renderer puede recibir el estado.
    if (pendingExample) {
      const pending = pendingExample;
      pendingExample = null;
      setTimeout(() => {
        startExample(pending.query, pending.clock).then((result) => {
          if (!result.ok) log(`--example no pudo arrancar: ${result.error}`);
        });
      }, 150);
    }
  });

  ipcMain.on('overlay:error', (_event, message) => log(`error en el panel: ${message}`));

  // "Mover": la configuración lo prende y apaga; el panel lo puede cerrar con Esc.
  ipcMain.handle('settings:move', (_event, enabled) => ({ ok: true, moving: setMovable(Boolean(enabled)) }));
  ipcMain.on('overlay:move-done', () => setMovable(false));
}

function applyHeight(height) {
  if (!win) return;
  const target = clamp(Math.round(height), 110, 640);
  const [currentWidth] = win.getContentSize();
  win.setContentSize(currentWidth, target);

  // Si el usuario eligió el lugar, no se mueve solo nunca más.
  if (moving || config.position === 'custom') return;

  const display = screen.getDisplayMatching(win.getBounds());
  const workArea = display.workArea;
  const x = Math.round(
    workArea.x + (workArea.width - currentWidth) / 2 + Number(config.offsetX || 0),
  );
  win.setPosition(x, Math.round(workArea.y + Number(config.offsetY || 0)));
}

/**
 * Modo mover: el panel pasa a ser arrastrable (se le devuelve el mouse y el foco)
 * y al confirmar se guarda dónde quedó. Después vuelve a ser click-through y
 * sin foco, así no molesta mientras jugás.
 */
function setMovable(enabled) {
  if (!win || win.isDestroyed()) {
    moving = false;
    return false;
  }

  moving = Boolean(enabled);
  clearTimeout(moveSaveTimer);

  if (moving) {
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show();
    win.focus();
    log('modo mover activo: arrastrá el panel y confirmá con Listo o Esc');
  } else {
    const [x, y] = win.getPosition();
    config.position = 'custom';
    config.x = x;
    config.y = y;
    persistConfig({ position: 'custom', x, y });
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
    log(`posición guardada: x=${x} y=${y} (queda fija ahí, sin molestar en partida)`);
  }

  send('overlay:movable', moving);
  send('overlay:config', overlayConfig());
  return moving;
}

/** Firma estable: checkedAt cambia en cada poll y no debe gatillar repintados. */
function signatureOf(state) {
  if (!state) return '';
  const { checkedAt, ...stable } = state;
  return JSON.stringify(stable);
}

function emit(state) {
  // Mientras el ejemplo está abierto, el panel le pertenece a esa partida de
  // prueba: ni el polling ni los sockets pueden reemplazarla por la partida
  // real del usuario. Solo pasan los estados marcados con `example`.
  if (exampleActive && !(state && state.example)) return false;
  const signature = signatureOf(state);
  if (signature === lastSent) return false;
  lastSent = signature;
  lastGood = state;
  send('overlay:state', state);
  syncIntro(state);
  // El informe del rival NO bloquea: se dispara y llega cuando esté listo.
  refreshRivalReports(state).catch(() => {});
  return true;
}

/* -------------------------------------------------------------------------
 * Reloj de partida: 0:01 → ayuda de civ, 0:20 → se oculta todo lo que el
 * usuario haya pedido ocultar. Al terminar la partida (estado idle) el ELO
 * vuelve a aparecer solo.
 *
 * La visibilidad se maneja DENTRO del renderer (clases CSS), no con
 * win.hide(): así el atajo manual Ctrl+Alt+E sigue siendo independiente y
 * nunca queda pisado por el auto-ocultado.
 * ---------------------------------------------------------------------- */
function sendView(force = false) {
  const now = clockNow();
  const view = introView(intro, viewConfig(), now);
  const signature = `${view.eloHidden ? 1 : 0}${view.civHelpVisible ? 1 : 0}${exampleClockMode}`;
  if (!force && signature === lastViewSig) return;
  lastViewSig = signature;
  const hideAt = hideAtMs(viewConfig());
  send('overlay:view', {
    eloHidden: view.eloHidden,
    civHelpVisible: view.civHelpVisible,
    // Congelado: el renderer muestra 0:03 / 0:21 fijos en vez de contar.
    frozenElapsedMs: exampleFrozenAt != null ? view.elapsed : null,
    // Tiempo REAL de partida que falta hasta el ocultado elegido. El renderer
    // usa esto para la cuenta regresiva y la barra, aunque la opción se active
    // a mitad de camino o el panel se recargue en medio de la intro.
    elapsedMs: view.elapsed,
    hideInMs: view.elapsed == null ? null : Math.max(0, hideAt - view.elapsed),
    hideAtSecs: hideAt / 1000,
    showAtSecs: SHOW_AT_MS / 1000,
  });
  log(
    `vista · ELO ${view.eloHidden ? 'oculto' : 'visible'} · ayuda de civ ` +
      `${view.civHelpVisible ? 'visible' : 'oculta'}` +
      (view.elapsed != null ? ` · tiempo ${clockLabel(intro.startedAt, now)}` : '') +
      (exampleFrozenAt != null ? ' · reloj congelado' : ''),
  );
}

/** Reprograma el próximo cambio (0:01 y 0:20) desde el timestamp absoluto. */
function armIntroTimer() {
  clearTimeout(introTimer);
  introTimer = null;
  // Con el reloj congelado no hay "próximo cambio": reprogramar solo haría
  // timers que recalculan exactamente la misma vista.
  if (!intro || !intro.engaged || exampleFrozenAt != null) return;
  const delay = nextIntroTick(intro, clockNow(), viewConfig());
  if (delay == null) return;
  introTimer = setTimeout(() => {
    sendView();
    armIntroTimer();
    // Justo al ocultarse el ELO (0:20) se adelanta el próximo poll: si la
    // partida termina, el panel vuelve en ~5s y no espera el intervalo lento.
    if (introView(intro, viewConfig(), clockNow()).eloHidden) scheduleNext('ongoing');
  }, Math.max(16, delay));
}

function syncIntro(state, options = {}) {
  const previousKey = intro && intro.key;
  const view = viewConfig();
  intro = trackIntro(intro, state, clockNow());

  if (intro && intro.engaged && previousKey !== intro.key) {
    log(
      `reloj de partida: ${intro.key} · empezó hace ${Math.round(intro.seenElapsed)}ms · ` +
        `ayuda 0:${String(Math.round(SHOW_AT_MS / 1000)).padStart(2, '0')}` +
        `→0:${hideAtMs(view) / 1000} · ayuda de civ ${view.civHelp ? 'ON' : 'OFF'}` +
        ` · ocultar ELO ${view.hideEloAt20 ? 'ON' : 'OFF'}` +
        (exampleActive ? ' · MODO EJEMPLO' : ''),
    );
  } else if (intro && !intro.engaged && previousKey !== intro.key) {
    log(
      `reloj de partida: ya pasaron más de ${ENGAGE_LIMIT_MS / 1000}s ` +
        '(app abierta en medio de la partida) → no aplico la intro',
    );
  } else if (!intro && previousKey) {
    log('partida terminada: el panel de ELO vuelve a estar visible');
  }

  const clock = intro && intro.engaged ? intro.startedAt : null;
  if (clock !== lastClockSent) {
    lastClockSent = clock;
    if (settingsWin && !settingsWin.isDestroyed()) {
      // En el ejemplo congelado también mandamos el tiempo fijo: si no, la
      // configuración seguiría contando con Date.now() y mostraría 1:45.
      settingsWin.webContents.send(
        'settings:clock',
        clock == null
          ? null
          : {
              startedAt: clock,
              elapsedMs: exampleFrozenAt != null ? Math.max(0, exampleFrozenAt - clock) : null,
            },
      );
    }
  }

  sendView(Boolean(options.force));
  armIntroTimer();
}

async function poll() {
  // Modo ejemplo: no se consulta el estado en vivo ni se pisa el panel.
  if (exampleActive) {
    lastPollAt = Date.now();
    lastPollStatus = 'ejemplo';
    return 'ejemplo';
  }
  if (polling) return lastStatus;
  polling = true;
  const startedAt = Date.now();

  try {
    const snapshot = await buildSnapshot({
      profileId,
      cache: statsCache,
      cacheTtlMs: Number(config.statsCacheMinutes || 15) * 60 * 1000,

      // Primera fase: roster en pantalla sin esperar al backend. El ELO se
      // muestra como `…` hasta que llega RM 1v1; nunca se usa el ELO del modo.
      onPartial: (partial) => {
        if (!emit(partial)) return;
        if (partial.status === 'ongoing') {
          log(`partida detectada en ${Date.now() - startedAt}ms · roster en pantalla, pidiendo ELO RM 1v1`);
        }
      },
    });

    // Mientras hay sala abierta el REST todavía no lista la partida (no
    // empezó): el panel se queda con la sala y no parpadea a "sin partida".
    if (snapshot.status === 'idle' && (lobbyActive() || Date.now() < preMatchGraceUntil)) {
      // Todavía en la pantalla de carga: el REST no la lista pero el panel ya
      // tiene el roster. No lo reemplazamos por "Sin partida".
      lastPollAt = Date.now();
      lastPollStatus = 'lobby';
      return 'idle';
    }

    // La firma se calcula sin checkedAt: si nada cambió, no se repinta ni se loguea.
    if (emit(snapshot)) {
      if (snapshot.status === 'ongoing') {
        const roster = snapshot.players
          .map((p) => `${p.name}${p.isYou ? '*' : ''} ${p.rating ?? '—'}/${p.peak ?? '—'}`)
          .join(' · ');
        log(
          `EN PARTIDA · ${snapshot.match.mapName} · modo ${snapshot.ladder.label} · ELO RM 1v1 · ` +
            `${snapshot.players.length} jugadores · ` +
            `completo en ${Date.now() - startedAt}ms · ${roster}`,
        );
      } else if (snapshot.status === 'idle') {
        const last = snapshot.lastMatch
          ? ` · última: ${snapshot.lastMatch.mapName} (${snapshot.lastMatch.leaderboardName})`
          : ' · sin partidas en el historial';
        log(`sin partida en curso${last}`);
      } else {
        log('falta configurar el perfil');
      }
    }

    lastStatus = snapshot.status;
    lastPollAt = Date.now();
    lastPollStatus = snapshot.status;
    return snapshot.status;
  } catch (err) {
    log(`error: ${err.message}`);
    if (lastGood) {
      send('overlay:state', { ...lastGood, stale: true, error: err.message });
    } else {
      send('overlay:state', { status: 'error', message: err.message });
    }
    lastStatus = 'error';
    lastPollAt = Date.now();
    lastPollStatus = 'error';
    return 'error';
  } finally {
    polling = false;
  }
}

function fastMs() {
  return clamp(Number(config.idlePollSeconds) || 3, 1.5, 15) * 1000;
}

function slowMs() {
  return clamp(Number(config.pollSeconds) || 15, 3, 60) * 1000;
}

/** Esperando partida se consulta seguido; en partida, espaciado. */
function scheduleNext(status) {
  clearTimeout(timer);
  // En cola consultamos el REST cada 1.5s: si el socket no publica el roster
  // (ciertas ladders), la partida en curso se detecta igual de inmediato.
  // Con el ELO oculto (a partir de 0:20) se consulta más seguido: el REST tarda
  // en dejar de listar la partida al terminarla y el panel tiene que volver
  // rápido, no esperar el poll lento completo.
  const hidden = introView(intro, viewConfig(), clockNow()).eloHidden;
  const ongoingMs = hidden ? Math.min(slowMs(), 5000) : slowMs();
  const delay = status === 'ongoing' ? ongoingMs : searching ? Math.min(fastMs(), 1500) : fastMs();
  timer = setTimeout(async () => {
    const next = await poll();
    scheduleNext(next);
  }, delay);
}

function startPolling() {
  clearTimeout(timer);
  log(`polling: cada ${fastMs() / 1000}s esperando partida, ${slowMs() / 1000}s en partida`);
  poll().then((status) => scheduleNext(status));
}

async function bootstrap() {
  if (EXAMPLE_QUERY) {
    // Captura/verificación por línea de comandos: datos REALES, sin tocar la
    // cuenta del usuario. El arranque real espera a `overlay:ready`.
    log(`--example: "${EXAMPLE_QUERY}" · reloj ${EXAMPLE_CLOCK} · datos reales`);
    createWindow();
    pendingExample = { query: EXAMPLE_QUERY, clock: EXAMPLE_CLOCK };
    if (SETTINGS || EXAMPLE_SETTINGS_SHOT) openSettings();
    return;
  }

  if (DEMO) {
    log(`modo demo: estado ${DEMO_MODE}, sin consultas a las APIs`);
    createWindow();
    return;
  }

  if (NO_PROFILE) {
    log('modo --no-profile: simulando una PC sin cuenta detectada');
    createWindow();
    startPolling();
    openSettings();
    return;
  }

  if (config.profileId) {
    profileId = Number(config.profileId);
    log(`profile_id desde config.json: ${profileId}`);
  } else {
    log('config.json sin profileId: detectando la cuenta del juego…');
    try {
      const detected = await detectProfile(log);
      if (detected) {
        profileId = detected.profileId;
        playerAlias = detected.alias;
        log(`perfil detectado: ${detected.alias || 'sin alias'} (${profileId})`);
      } else {
        log('no pude detectar el perfil; abro la configuración para elegir la cuenta');
      }
    } catch (err) {
      log(`detección falló: ${err.message}`);
    }
  }
  createWindow();
  startPolling();
  startLive();

  if (FAKE_FOUND) {
    setTimeout(() => {
      const rival = (n, team, rating, rank) => ({
        profileId: 9000000 + n, name: `Rival ${n}`, civ: 0, team, rating, rank,
      });
      const fake = {
        id: 'm_test', status: 'matched', matchId: 999000111, server: 'test',
        matchedAt: new Date().toISOString(), leaderboard: 'rm_team',
        map: 'rm_nomad', mapName: 'Nómada',
        players: [
          { profileId, name: playerAlias || 'PSX | Acido', civ: 0, team: 0, rating: 1180, rank: 13876 },
          rival(1, 0, 1083, 18244), rival(2, 0, 1171, 15102),
          rival(3, 1, 1439, 9871), rival(4, 1, 1386, 11020), rival(5, 1, 1433, 10004),
        ],
      };
      // Los ids del fake no existen en el backend. Se siembra la cache con
      // ELO RM 1v1 DISTINTO del `rating` del evento (que es de equipo) para
      // que la captura muestre justamente la regla del panel: 1v1 siempre.
      const fakeElo = [
        [profileId, 1243, 1290, 8120],
        [9000001, 1102, 1180, 18244],
        [9000002, 1215, 1260, 15102],
        [9000003, 1366, 1490, 9871],
        [9000004, 1298, 1410, 11020],
        [9000005, 1507, 1588, 7402],
      ];
      const seededAt = Date.now();
      for (const [id, rating, peak, rank] of fakeElo) {
        statsCache.set(`elo1v1:${id}`, { rating, peak, rank, ts: seededAt });
      }
      log('--fake-found: inyectando partida apareada de prueba (ELO RM 1v1 simulado en cache)');
      liveMatchAt = Date.now();
      preMatchGraceUntil = liveMatchAt + 20000;
      showMatchFound(fake);
    }, 900);
  }

  // La app siempre abre la configuración primero, para que empieces eligiendo la cuenta.
  openSettings();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('ya hay otra instancia corriendo: esta se cierra');
  app.quit();
} else {
  app.whenReady().then(() => {
    // Log acotado: no crece sin control entre sesiones.
    try {
      if (fs.statSync(LOG_PATH).size > 512 * 1024) fs.writeFileSync(LOG_PATH, '');
    } catch {
      /* el archivo todavía no existe */
    }

    // La bandeja va ANTES de crear ventanas: si algo falla en bootstrap, igual
    // queda una forma de reabrir la config y de salir limpiamente.
    createTray();

    // Actualizaciones: consulta al arranque y cada 6 h, nunca con partida en
    // curso. electron-updater instala en silencio cuando el jugador sale.
    updater = initAutoUpdate({
      app,
      log,
      enabled: !DEV_SESSION,
      isBusy: matchOngoing,
      onNotice: showUpdateNotice,
      broadcast: (snapshot) => {
        if (settingsWin && !settingsWin.isDestroyed()) {
          settingsWin.webContents.send('updater:status', snapshot);
        }
      },
    });

    // Latido cada 2 minutos. Si en el log la última línea es un latido y NO
    // aparece "proceso terminado", el proceso fue matado desde afuera (launcher,
    // reinstalación, kill) y no fue un error del overlay.
    heartbeatTimer = setInterval(() => {
      // Aviso de actualización que llegó durante una partida: se muestra
      // apenas el jugador termina, sin interrumpirlo.
      if (deferredUpdateNotice && !matchOngoing()) {
        const pending = deferredUpdateNotice;
        deferredUpdateNotice = null;
        showUpdateNotice(pending);
      }
      log(
        `latido · uptime=${Math.round((Date.now() - bootedAt) / 1000)}s · ` +
          `panel=${win && !win.isDestroyed() ? (win.isVisible() ? 'visible' : 'oculto') : 'sin ventana'} · ` +
          `config=${settingsWin && !settingsWin.isDestroyed() ? 'abierta' : 'cerrada'}`,
      );
    }, 2 * 60 * 1000);

    registerIpc();
    bootstrap().catch((err) => log(`bootstrap falló: ${(err && (err.stack || err.message)) || err}`));

    globalShortcut.register('Control+Alt+E', () => {
      if (!win) return;
      if (win.isVisible()) {
        win.hide();
        log('overlay oculto (Ctrl+Alt+E para volver)');
      } else {
        win.showInactive();
        log('overlay visible');
      }
    });

    globalShortcut.register('Control+Alt+S', () => {
      log('abriendo configuración (Ctrl+Alt+S)');
      openSettings();
    });

    globalShortcut.register('Control+Alt+R', () => {
      log('refresh manual');
      poll();
    });

    globalShortcut.register('Control+Alt+Q', () => {
      log('cerrando por hotkey');
      quitApp('hotkey Ctrl+Alt+Q');
    });
  });

  app.on('second-instance', () => {
    log('se abrió una segunda instancia: traigo la configuración al frente');
    openSettings();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    log('saliendo de la app');
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    clearInterval(timer);
    clearInterval(heartbeatTimer);
    clearTimeout(introTimer);
    stopLive();
    if (tray && !tray.isDestroyed()) tray.destroy();
  });

  app.on('window-all-closed', () => {
    // ANTES esto llamaba a app.quit(): cerrar la ventana de configuración
    // (o un cierre del renderer) mataba la app y parecía que "se cerraba sola".
    // Con la bandeja activa el overlay sigue vivo y se puede reabrir.
    log('no quedan ventanas: sigo vivo en la bandeja (Salir para cerrar)');
    if (!tray || tray.isDestroyed()) createTray();
    if (isQuitting) return;
    // Si se cerró también la ventana del overlay, la volvemos a levantar:
    // el usuario nunca debería quedarse sin panel sin haber pedido salir.
    setTimeout(() => {
      if (!isQuitting && (!win || win.isDestroyed())) {
        log('recreando el overlay tras el cierre de todas las ventanas');
        createWindow();
      }
    }, 400);
  });

  app.on('child-process-gone', (_event, details) => {
    log(`proceso hijo terminado: ${details.type} · ${details.reason}`);
  });
}
