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
  dialog,
  powerMonitor,
  safeStorage,
  clipboard,
} = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

// Mantener conexiones TLS/HTTP1.1 calientes (30s keep-alive) para reutilizar sockets entre APIs.
// IMPORTANTE: NO activar `allowH2: true` en el dispatcher global de Undici porque el WebSocket
// nativo de Node/Electron hereda este dispatcher y falla el upgrade 101 (código 1002/1006)
// contra wss://socket.aoe2companion.com, rompiendo la detección de Prematch.
try {
  const undici = require('undici');
  if (undici && typeof undici.Agent === 'function' && typeof undici.setGlobalDispatcher === 'function') {
    undici.setGlobalDispatcher(new undici.Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: 12,
    }));
  }
} catch {
  /* undici opcional en algunos builds de Electron */
}

const {
  buildSnapshot,
  buildExampleSnapshot,
  buildSnapshotFromLobby,
  buildSnapshotFromMatch,
  searchProfiles,
  fetchProfileIdentity,
  fetchMatches,
  fetchMatchById,
  fetchLatest1v1Match,
  fetchLatestTeamMatch,
  historyCutoff,
  hideLobbyCivs,
} = require('./src/aoe');
const { fetchCentralDashboard, hydrateCentralEwMode, mergeRecentMatches } = require('./src/central');
const { detectProfile, getActiveSteamId, getActiveSteamIdAsync, resolveSteamId, listAccounts, collectLocalPlatformIdHashes } = require('./src/detect');
let verifiedLocalDetection = null;
let cachedReferralsState = null;
let referralRetryTimer = null;
let referralActivating = false;
let lastActiveSteamId = null;
let lastSteamCheckAt = 0;
const { CIV_SLUGS, CIV_ALIASES, civSlug } = require('./src/civs');
const { CIV_GUIDE } = require('./src/civ-guide');
let MAP_ART = {};
try { MAP_ART = require('./src/map-art.json'); } catch { MAP_ART = {}; }
try { app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); } catch { /* ignore */ }
const {
  SHOW_AT_MS,
  HIDE_AT_MS,
  ENGAGE_LIMIT_MS,
  hideAtMs,
  trackIntro,
  introView,
  nextIntroTick,
} = require('./src/intro');
const { LobbyWatcher, QueueWatcher, FastLane, readSnapshot } = require('./src/live');
const { buildRivalInsights, opponentsOf, needsRivalHistory, mergeRivalReport, resolveMode, mapKey } = require('./src/rival');
const { progressiveScout } = require('./src/scout');
const { isPriorReplay } = require('./src/insights');
const { fetchMyHistory, computeH2H } = require('./src/mine');
// `./src/updater` (electron-updater) se carga en diferido 5s después de app.whenReady() para acelerar el arranque.
const { ReplayCache } = require('./src/replay-cache');
const {
  PerformanceStore,
  buildPostMatchReport,
  completedMatchTransition,
  normalizeTelemetry,
} = require('./src/postmatch');
const { fetchReplayTelemetry, tryLocalReplay } = require('./src/replay');
const { COMMAND_ADAPTER_VERSION } = require('./src/replay-analysis');
const { createProductStateCache, effectivePreferences, allowsFeature } = require('./src/product');
const { buildSmartBuildOrder } = require('./src/build-orders');
const { createTrainingController } = require('./src/training');
const { detectSmurfsForPlayers } = require('./src/smurf');
const { createMinimizeController, GameWindowWatcher } = require('./src/game-window');
const { projectOverlayState, projectRivalPayload, projectScoutPayload } = require('./src/presentation');
const i18n = require('./src/i18n');
const licenseClient = require('./src/license-client');
const { createDiagnosticReporter, rotateLogFileIfOversized } = require('./src/diagnostics');
const welcomeHome = require('./src/welcome-home');

// Empaquetada, __dirname vive dentro del app.asar (solo lectura): config y log
// van a %APPDATA%\AoE2 ELO Overlay\. En desarrollo quedan junto al código.
const ISOLATED = process.argv.includes('--isolated');
// El modo aislado también separa el userData de Electron: así se puede probar
// el arranque sin chocar con la instancia real que el usuario tenga abierta.
if (ISOLATED) {
  app.setPath('userData', path.join(app.getPath('temp'), 'aoe2-elo-overlay-dev-userdata'));
}
const DATA_DIR = ISOLATED ? path.join(app.getPath('temp'), 'aoe2-elo-overlay-dev')
  : app.isPackaged ? path.join(app.getPath('appData'), 'AoE2 ELO Overlay') : __dirname;
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const LOG_PATH = path.join(DATA_DIR, 'overlay.log');
const CENTRAL_CACHE_PATH = path.join(DATA_DIR, 'central-cache.json');
const GLOBAL_META_CACHE_PATH = path.join(DATA_DIR, 'global-meta-cache.json');
const ANNOUNCEMENT_CACHE_PATH = path.join(DATA_DIR, 'relic-announcement-cache.json');
const BRACKET_BENCHMARKS_CACHE_PATH = path.join(DATA_DIR, 'bracket-benchmarks-cache.json');
const BRACKET_SUBMITTED_PATH = path.join(DATA_DIR, 'bracket-submitted-matches.json');
const { setLiveBracketBenchmarks, extractBracketSampleFromRecord } = require('./src/elo-roadmap');

const BRACKET_BENCHMARKS_TTL_MS = 24 * 60 * 60 * 1000;
let bracketBenchmarksLoaded = false;
let bracketBenchmarksFetchedAt = 0;
let bracketRefreshInflight = false;
let bracketLastAttemptMs = 0;
let bracketSubmittedSet = null;

function ensureBracketBenchmarksInitialized() {
  if (!bracketBenchmarksLoaded) {
    bracketBenchmarksLoaded = true;
    try {
      if (fs.existsSync(BRACKET_BENCHMARKS_CACHE_PATH)) {
        const cached = JSON.parse(fs.readFileSync(BRACKET_BENCHMARKS_CACHE_PATH, 'utf8'));
        if (cached && cached.data && cached.data.brackets) {
          setLiveBracketBenchmarks(cached.data);
          bracketBenchmarksFetchedAt = Number(cached.fetchedAt || 0);
        }
      }
    } catch { /* ignore corrupted cache */ }
  }
  const now = Date.now();
  const isStale = !bracketBenchmarksFetchedAt || (now - bracketBenchmarksFetchedAt) >= BRACKET_BENCHMARKS_TTL_MS;
  if (!isStale || bracketRefreshInflight || (now - bracketLastAttemptMs) < 30 * 60 * 1000) return;
  bracketRefreshInflight = true;
  bracketLastAttemptMs = now;
  const apiUrl = licenseClient.DEFAULT_API_URL;
  licenseClient.fetchBracketBenchmarks({ apiUrl })
    .then((res) => {
      if (res && res.ok && res.brackets) {
        setLiveBracketBenchmarks(res);
        bracketBenchmarksFetchedAt = Date.now();
        try {
          fs.mkdirSync(path.dirname(BRACKET_BENCHMARKS_CACHE_PATH), { recursive: true });
          fs.writeFileSync(BRACKET_BENCHMARKS_CACHE_PATH, JSON.stringify({
            fetchedAt: bracketBenchmarksFetchedAt,
            data: res,
          }), 'utf8');
        } catch { /* ignore */ }
      }
    })
    .catch(() => {})
    .finally(() => { bracketRefreshInflight = false; });
}

function maybeContributeBracketSample(savedRec) {
  if (!savedRec || typeof savedRec !== 'object') return;
  const matchId = String(savedRec?.match?.matchId || savedRec?.matchId || '').trim();
  if (!matchId) return;
  if (!bracketSubmittedSet) {
    bracketSubmittedSet = new Set();
    try {
      if (fs.existsSync(BRACKET_SUBMITTED_PATH)) {
        const arr = JSON.parse(fs.readFileSync(BRACKET_SUBMITTED_PATH, 'utf8'));
        if (Array.isArray(arr)) arr.slice(-500).forEach((id) => bracketSubmittedSet.add(String(id)));
      }
    } catch { /* ignore */ }
  }
  if (bracketSubmittedSet.has(matchId)) return;
  const payload = extractBracketSampleFromRecord(savedRec);
  if (!payload) return;
  bracketSubmittedSet.add(matchId);
  try {
    fs.mkdirSync(path.dirname(BRACKET_SUBMITTED_PATH), { recursive: true });
    fs.writeFileSync(BRACKET_SUBMITTED_PATH, JSON.stringify([...bracketSubmittedSet].slice(-500)), 'utf8');
  } catch { /* ignore */ }
  const apiUrl = licenseClient.DEFAULT_API_URL;
  licenseClient.submitBracketSample({ apiUrl, payload }).catch(() => {});
}
// Emblema dorado (recortado y normalizado por tools/make-icon.py) es el icono oficial:
// ventanas, bandeja, configuración, exe y accesos directos usan el mismo arte.
// En Windows empaquetado, LoadImageW no puede leer .ico dentro de app.asar: resolvemos
// primero la copia desempaquetada (app.asar.unpacked) y, si no existe, cargamos el PNG
// como NativeImage para que la barra de tareas jamás caiga al icono genérico de Electron.
function resolveExternalAsset(assetPath) {
  if (!assetPath) return assetPath;
  const unpacked = assetPath.replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1');
  if (unpacked !== assetPath && fs.existsSync(unpacked)) return unpacked;
  return assetPath;
}
const ICON_PNG = resolveExternalAsset(path.join(__dirname, 'assets', 'app-icon.png'));
const ICON_ICO = resolveExternalAsset(path.join(__dirname, 'assets', 'icon.ico'));
function loadWindowIcon() {
  if (process.platform === 'win32' && !/app\.asar[\\/]/i.test(ICON_ICO) && fs.existsSync(ICON_ICO)) {
    const icoImg = nativeImage.createFromPath(ICON_ICO);
    if (!icoImg.isEmpty()) return icoImg;
    return ICON_ICO;
  }
  const pngImg = nativeImage.createFromPath(ICON_PNG);
  return !pngImg.isEmpty() ? pngImg : ICON_PNG;
}
const WINDOW_ICON = loadWindowIcon();

// Sin esto las notificaciones nativas de Windows pueden no aparecer (o salir
// con un nombre genérico). Tiene que coincidir con appId de electron-builder.
const APP_USER_MODEL_ID = 'com.local.aoe2elooverlay';
try {
  app.setAppUserModelId(APP_USER_MODEL_ID);
} catch (err) {
  console.error(`no pude fijar el AppUserModelID: ${err.message}`);
}

function ensureWindowsToastIdentity() {
  if (process.platform !== 'win32' || DEV_SESSION) return;
  try {
    const { execFile } = require('node:child_process');
    const runReg = (args) => new Promise((resolve) => {
      execFile('reg', args, { windowsHide: true, timeout: 2500 }, () => resolve());
    });
    const userDataDir = app.getPath('userData');
    const toastIconPath = path.join(userDataDir, 'relic-toast-icon.png');
    try {
      const iconBuf = fs.readFileSync(ICON_PNG);
      let needsWrite = true;
      try {
        const st = fs.statSync(toastIconPath);
        if (st.size === iconBuf.length) needsWrite = false;
      } catch {}
      if (needsWrite) {
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.writeFileSync(toastIconPath, iconBuf);
      }
    } catch {}
    const aumidKey = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_USER_MODEL_ID}`;
    const notifKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\${APP_USER_MODEL_ID}`;
    Promise.all([
      runReg(['add', aumidKey, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'Relic', '/f']),
      runReg(['add', aumidKey, '/v', 'IconUri', '/t', 'REG_SZ', '/d', toastIconPath, '/f']),
      runReg(['add', aumidKey, '/v', 'IconBackgroundColor', '/t', 'REG_SZ', '/d', '00000000', '/f']),
      runReg(['delete', notifKey, '/v', 'DisplayName', '/f']),
    ]).catch(() => {});
  } catch {}
}

const DEFAULT_CONFIG = {
  profileId: null,
  autoProfileId: null,
  autoAlias: null,
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
  // Consejo pre-partida (mapa × civ × apertura que le cuestan al rival).
  // Los horizontes de oportunidad se conservan durante la partida.
  smartTips: false,
  smartBuildOrder: false,
  // Head-to-head: tu V-D contra este rival, del propio historial (mismo modo).
  rivalH2H: false,
  // Historial y cruce de civilizaciones del rival (predicción + cruce exacto).
  civRecommender: false,
  // Recomendador de tu civilización (3 factores: mapa + tu WR + debilidades y aperturas).
  civCounterPick: false,
  // "Resumen con F2": APAGADA de fábrica. Sin esto el informe del rival se
  // muestra COMPLETO y la tecla F2 queda libre para el resto del sistema.
  // Al activarla, el panel arranca en resumen y F2 alterna (atajo global:
  // captura la tecla en todo Windows mientras el overlay corre).
  scoutF2: false,
  // Balance de equipos: promedio de ELO RM 1v1 por equipo en team games.
  tgBalance: false,
  smurfDetector: false,
  // Ocultar overlay si Age of Empires II: DE queda minimizado por más de 5 segundos.
  hideWhenMinimized: false,
  // Mostrar el panel superior únicamente cuando Age of Empires II: DE está abierto (ocultar si se cierra).
  onlyWhenGameRunning: true,
  // Iniciar Relic automáticamente en segundo plano (bandeja) al prender Windows.
  openAtLogin: true,
  // Mostrar el panel efímero de bienvenida (Inicio) al abrir Relic.
  showWelcomeHome: true,
  // Actualizaciones automáticas: consulta cada 30 min y, si hay una versión
  // nueva, la descarga e instala sola (nunca en media partida). Apagada de
  // fábrica: se activa desde la pestaña Updater.
  autoUpdate: false,
  // Postmatch: resumen de resultados Pro; comparación y replay ProMax.
  postMatch: true,
  postMatchPopup: true,
  postMatchHideSeconds: 60,
  postMatchComparison: false,
  postMatchCompareMode: 'both',
  postMatchReplay: false,
  // Clave temporal de acceso Pro. Se guarda el hash, nunca la clave.
  accessKeyGrant: null,
  // Idioma elegido en el wizard inicial o en Ajustes → Cuenta (en, es-ES, es-MX, zh-CN).
  language: null,
  wizardCompleted: false,
  ultraWelcomeSeen: {},
  autoDiagnostics: true,
  debug: false,
};

function normalizeUltraWelcomeSeen(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k || '').trim().slice(0, 160);
    const ts = Number(v);
    if (key && Number.isFinite(ts) && ts > 0) out[key] = ts;
  }
  const entries = Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return Object.fromEntries(entries);
}

// Las opciones entran al whitelist del IPC de configuración. rivalH2H arma el
// informe DURANTE la partida (viaja en el mismo payload que el informe);
// smartTips y civRecommender son pre-partida con su propio flujo
// (refreshScoutTips) para no recalcular el informe.
const RIVAL_OPTION_KEYS = ['rivalCivs', 'rivalFavorites', 'rivalOpenings', 'smartTips', 'rivalH2H', 'civRecommender', 'civCounterPick'];
const RIVAL_REPORT_KEYS = ['rivalCivs', 'rivalFavorites', 'rivalOpenings', 'rivalH2H', 'civRecommender'];

// Los `rating/peak/rank` de todos los demos son de RM 1v1 (igual que en vivo),
// aunque el `ladder` del demo diga RM team / EW / Unranked.
// Flags de desarrollo: --demo[=rm1v1|tg|ew|custom] muestra datos de ejemplo sin
// tocar la red; --shot captura la ventana (--out=archivo.png) y cierra.
// --settings abre la configuración; --settings-shot la captura y cierra.
// --civ-help (con --demo) simula una partida a 0:03 para capturar la tarjeta;
// --civ-help=late simula 0:21; --hide-elo fuerza la opción de ocultar a 0:20.
const ARGV = process.argv.slice(1);
// Beta explícita de desarrollo. Nunca la decide el renderer ni un selector de
// plan: sin este argumento y sin credencial firmada, el producto es Free.
const BETA_ACCESS = !app.isPackaged && ARGV.includes('--beta');
// Seguridad (C-02): eliminado el acceso offline por hash local (`ACCESS_KEY_HASH` / `accessKeyGrant`).
// Todo canje de claves y suscripciones pasa exclusivamente por el servidor con firma Ed25519.
function hasAccessKeyGrant() {
  return false;
}
const DEMO_ARG = ARGV.find((arg) => arg === '--demo' || arg.startsWith('--demo='));
const DEMO = Boolean(DEMO_ARG);
const DEMO_MODE = DEMO_ARG && DEMO_ARG.includes('=') ? DEMO_ARG.split('=')[1] : 'rm1v1';
const SHOT = ARGV.includes('--shot');
const NO_PROFILE = ARGV.includes('--no-profile');
const MOVE_TEST = ARGV.includes('--move');
const SETTINGS = ARGV.includes('--settings');
const SETTINGS_SHOT = ARGV.includes('--settings-shot');
const AUTOSTART = ARGV.includes('--autostart');
// Prueba local: simula el evento `matched` para verificar el panel sin hacer cola.
const FAKE_FOUND = ARGV.includes('--fake-found');
const CIV_HELP_ARG = ARGV.find((a) => a === '--civ-help' || a.startsWith('--civ-help='));
const CIV_HELP_DEMO = Boolean(CIV_HELP_ARG);
const CIV_HELP_LATE = CIV_HELP_ARG === '--civ-help=late';
const HIDE_ELO_DEMO = ARGV.includes('--hide-elo');
// --rival-info: siembra un informe de ejemplo para capturar la tarjeta nueva.
// --lobby: lo mismo pero en la FASE de preparación (`lobby`), con el informe y
// las recomendaciones ya listos — la vista completa de pre-partida. Solo
// capturas: no toca config.json ni consulta la red.
const LOBBY_DEMO = ARGV.includes('--lobby');
const RIVAL_DEMO = ARGV.includes('--rival-info') || LOBBY_DEMO;
// --analyzing: deja el informe en estado "analizando" para capturar la barrita
// de carga (sin esperar a que una consulta real tarde o falle). Solo capturas.
const ANALYZING = ARGV.includes('--analyzing');
// --detail: arranca en la VISTA DE DETALLE (la que abre F2) para poder
// capturarla sin simular la pulsación de una tecla global. Solo capturas.
const DETAIL_DEMO = ARGV.includes('--detail');
const OUT_ARG = ARGV.find((arg) => arg.startsWith('--out='));
const SHOT_PATH = path.join(__dirname, OUT_ARG ? OUT_ARG.split('=')[1] : 'demo-shot.png');
// --example=<nombre|id>: arranca el Modo ejemplo con datos REALES para poder
// capturar el overlay desde la línea de comandos. --shot-delay ajusta la espera
// (las aperturas reales de AoE2Insights tardan ~9s la primera vez).
const EXAMPLE_ARG = ARGV.find((arg) => arg.startsWith('--example='));
const EXAMPLE_QUERY = EXAMPLE_ARG ? EXAMPLE_ARG.split('=').slice(1).join('=') : null;
// --example-match=<matchId>: fija la partida exacta del ejemplo (si no, la última).
const EXAMPLE_MATCH_ARG = ARGV.find((arg) => arg.startsWith('--example-match='));
const EXAMPLE_MATCH_ID = EXAMPLE_MATCH_ARG
  ? Number(EXAMPLE_MATCH_ARG.split('=')[1]) || null
  : null;
const EXAMPLE_CLOCK_ARG = ARGV.find((arg) => arg.startsWith('--example-clock='));
const EXAMPLE_CLOCK = EXAMPLE_CLOCK_ARG ? EXAMPLE_CLOCK_ARG.split('=')[1] : '3';
// --example-phase=lobby: emite la partida de ejemplo como PRE-PARTIDA (fase
// `lobby`, sin reloj) para revisar/capturar el consejo con datos reales.
const EXAMPLE_PHASE_ARG = ARGV.find((arg) => arg.startsWith('--example-phase='));
const EXAMPLE_PHASE = EXAMPLE_PHASE_ARG ? EXAMPLE_PHASE_ARG.split('=')[1] : null;
// --example-real-config: usa las opciones REALES del usuario en vez de encender
// todas para la revisión; sirve para capturar lo que ve el usuario tal cual.
const EXAMPLE_REAL_CONFIG = ARGV.includes('--example-real-config');
const SHOT_DELAY_ARG = ARGV.find((arg) => arg.startsWith('--shot-delay='));
const SHOT_DELAY_MS = SHOT_DELAY_ARG ? Number(SHOT_DELAY_ARG.split('=')[1]) : 1500;
const EXAMPLE_SETTINGS_SHOT = ARGV.includes('--example-settings-shot');
// --example-cycle: recorre los botones de la UI antes de capturar (dev only).
const EXAMPLE_CYCLE = ARGV.includes('--example-cycle');

// --isolated: userData propio para capturar demos MIENTRAS el overlay real
// sigue abierto. requestSingleInstanceLock() comparte el userData, así que sin
// esto un demo en desarrollo choca con el .exe instalado/portable en uso.
// Es solo una herramienta de desarrollo: no cambia config.json ni el log.
if (ISOLATED) {
  app.setPath('userData', path.join(app.getPath('temp'), 'aoe2-elo-overlay-dev'));
}

// El canal de actualizaciones es solo para la app instalada de un jugador:
// ninguna corrida de desarrollo, demo o captura debe consultar GitHub Releases.
const DEV_SESSION = Boolean(
  DEMO || SHOT || SETTINGS_SHOT || EXAMPLE_QUERY || EXAMPLE_SETTINGS_SHOT ||
  EXAMPLE_CYCLE || CIV_HELP_DEMO || RIVAL_DEMO || ANALYZING || FAKE_FOUND || MOVE_TEST ||
  ISOLATED || LOBBY_DEMO,
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
      demoPlayer('Rival Dos', { id: 5, civ: 'Poles', team: 2, hex: '#22d3ee', extra: { isYou: false, color: 5, rating: 1386, peak: 1912, rank: 11020, hasStats: true } }),
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
    // En las capturas de "analizando" (todo pendiente) y de "--lobby" (todo
    // listo) se usa la fase de preparación: ahí es donde conviven el informe
    // del rival, las recomendaciones y el balance.
    ...(ANALYZING || LOBBY_DEMO ? { phase: 'lobby' } : {}),
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
    if (merged.theme === 'sakura') merged.theme = DEFAULT_CONFIG.theme;

    // Migración: agrega opciones nuevas (p. ej. opacity) sin pisar las del usuario,
    // para que estén visibles y editables en el archivo.
    if (Object.keys(raw).length !== Object.keys(merged).length || (!DEV_SESSION && raw.theme === 'sakura')) {
      try {
        fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`);
        log(`config migrada en ${CONFIG_PATH}`);
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
  'ultra',
  'ultra-gamma',
];
const THEME_ARG = ARGV.find((arg) => arg.startsWith('--theme='));
if (THEME_ARG) config.theme = THEME_ARG.split('=')[1];
if (!THEME_IDS.includes(config.theme)) config.theme = 'clasico';

function isUltraTheme(theme) {
  return theme === 'ultra' || theme === 'ultra-gamma';
}

function effectiveTheme(product = null) {
  const raw = THEME_IDS.includes(config.theme) ? config.theme : 'clasico';
  if (isUltraTheme(raw) && !(raw === 'ultra' && THEME_ARG === '--theme=ultra')) {
    const resolved = product || productState();
    if (!allowsFeature(resolved, 'ultraSkin')) return 'clasico';
  }
  return raw;
}

// Solo en memoria (las capturas no deben dejar tocada la config del usuario).
if (CIV_HELP_DEMO) config.civHelp = true;
if (HIDE_ELO_DEMO || CIV_HELP_LATE) config.hideEloAt20 = true;
if (RIVAL_DEMO) {
  config.rivalCivs = true;
  config.rivalFavorites = true;
  config.rivalOpenings = true;
  config.smartTips = true;
  config.rivalH2H = true;
  config.civRecommender = true;
  config.tgBalance = true;
  // El resumen compacto también es parte del demo (con F2 para alternar):
  // así las capturas muestran la vista por defecto de la opción encendida.
  config.scoutF2 = true;
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
let pollRateLimitUntil = 0;
let poll429Streak = 0;
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
// F2: compacto (una tarjeta de scouting por rival) <-> detalle completo.
// Vive en el main: si el renderer se recarga, se le reenvía en overlay:ready.
let detailMode = DETAIL_DEMO;
// El atajo F2 solo existe si el usuario lo pidió (opción "Resumen con F2").
let f2Registered = false;
let moveSaveTimer = null;
let liveWatcher = null; // salas personalizadas (handler=lobbies)
let queueWatcher = null; // matchmaking ranked (handler=queueing) ← el importante
let fastLane = null; // sondeo de snapshots frescos: detecta la partida en ~1s
let liveLobbyAt = 0;
let liveMatchAt = 0;
let searching = false; // en cola: el REST se consulta más seguido
let preMatchGraceUntil = 0; // no parpadear a "Sin partida" durante la carga
let lobbyGoneAt = 0; // instante en que cerró la sala: acelera el REST durante 30 s
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
// Última partida publicada: sirve para descartar el informe de la anterior.
let lastOngoingMatchId = null;
// Última vez que hubo una partida en pantalla. Gracia acotada (25 s) solo para
// absorber la pantalla de carga entre pre-partida y REST; jamás traba 3 min.
let lastOngoingAt = 0;
const ONGOING_HOLD_MS = 25 * 1000;
// Recomendaciones inteligentes (pre-partida): payload actual del consejo.
let scoutPayload = null;
let scoutSig = '';
let scoutFetching = false;
let scoutQueuedSig = null;
let rivalSig = '';
let rivalFetching = false;
let rivalQueuedSig = null;
// Reintento del informe: si el primer intento vuelve vacío (red caída, 502,
// timeout) se repite mientras siga la pre-partida. La pre-partida son ~60s:
// nunca se puede quedar sin datos por un fallo puntual.
let rivalRetryTimer = null;
let rivalRetryKey = '';
let rivalRetryCount = 0;
const RIVAL_RETRY_MS = 2500;
const RIVAL_RETRY_MAX = 2;
// Head-to-head: resultado por rival para la partida ACTUAL. Vive aparte del
// informe porque el informe se reconstruye por partes (onPartial) y pisaría
// el campo: sendRival() lo inyecta al publicar cada payload.
const h2hByRival = new Map();
const h2hPendingIds = new Set();
let h2hSig = '';
let h2hFetching = false;
let h2hQueuedSig = null;
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
let exampleUseRealConfig = false;
let examplePreviewPhase = null;

// En el ejemplo queremos ver TODAS las funciones, sin cambiar las preferencias
// reales del usuario. Es un override de PINTADO, no de configuración.
const EXAMPLE_ALL_ON = {
  civHelp: true,
  hideEloAt20: true,
  rivalCivs: true,
  rivalFavorites: true,
  rivalOpenings: true,
  smartTips: true,
  smartBuildOrder: true,
  rivalH2H: true,
  civRecommender: true,
  civCounterPick: true,
  tgBalance: true,
  smurfDetector: true,
  postMatch: true,
  postMatchComparison: true,
  postMatchReplay: true,
};

/** Config usada para dibujar. Nunca se persiste. */
function viewConfig() {
  const base = !exampleActive || EXAMPLE_REAL_CONFIG || exampleUseRealConfig
    ? config
    : { ...config, ...EXAMPLE_ALL_ON };
  // Las preferencias Pro guardadas se conservan, pero el flujo de consultas
  // solo las ve si el plan resuelto en main las permite. El renderer no decide.
  return effectivePreferences(base, productState());
}

/** Reloj usado por la intro: congelado en el ejemplo, real en partida. */
function clockNow() {
  return exampleFrozenAt != null ? exampleFrozenAt : Date.now();
}

const EXAMPLE_CLOCK_OFFSETS = { 3: 3000, 21: 21000, live: 3000 };

const statsCache = new ReplayCache(path.join(DATA_DIR, 'replay-cache.json'), (...args) => log(...args));
// Historial local de rendimiento: solo resultados confirmados por la fuente.
const performanceStore = new PerformanceStore({
  filePath: path.join(DATA_DIR, 'performance-history.json'),
  log,
});
const trainingController = createTrainingController({
  storePath: path.join(DATA_DIR, 'training-state.json'),
});
// El token y la cuenta viven en memoria durante la sesión. El renderer nunca
// recibe la credencial; solo el estado serializado del producto.
let productSession = { accountId: null, entitlementToken: null };
const resolveProductState = createProductStateCache();
let productExpiryTimer = null;
let productExpiryAt = null;
let postMatchReport = null;
let postMatchGeneration = 0;
let postMatchMatch = null;
let postMatchLastId = null;
// El informe postmatch tiene cierre explícito y auto-cierre configurable desde
// Postmatch (`postMatchHideSeconds`: 10–180 s, o 0 = sin auto-cierre hasta la
// próxima partida). `postMatchPopup` activa/desactiva el popup sobre el juego
// sin deshabilitar los informes dentro de Relic.
const POSTMATCH_AUTO_HIDE_MS = 60 * 1000;
const POSTMATCH_LOADING_MAX_MS = 3 * 60 * 1000;
let postMatchOverlayDismissed = false;
let postMatchHideTimer = null;

function postMatchHideSecondsValue() {
  const raw = Number(config.postMatchHideSeconds);
  if (!Number.isFinite(raw)) return 60;
  if (raw <= 0) return 0;
  return Math.round(clamp(raw, 10, 180));
}

function postMatchHideMs() {
  const secs = postMatchHideSecondsValue();
  return secs > 0 ? secs * 1000 : 0;
}

/** Claves públicas de licencia: en producción (app.isPackaged) SOLO se aceptan
 * las claves compiladas en el binario (C-01), ignorando archivos en %APPDATA% y variables de entorno. */
function loadProductPublicKeys() {
  const pinned = Object.freeze({ ...(licenseClient.RELEASE_PUBLIC_KEYS || {}) });
  if (app.isPackaged) {
    return Object.keys(pinned).length ? pinned : null;
  }
  const merged = { ...pinned };
  const candidates = [
    process.env.AOE2_PRODUCT_KEYS_PATH,
    path.join(__dirname, 'product-public-keys.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) Object.assign(merged, data);
    } catch {
      /* sin claves externas */
    }
  }
  return Object.keys(merged).length ? Object.freeze(merged) : null;
}
const PRODUCT_PUBLIC_KEYS = loadProductPublicKeys();
const SESSION_TOKEN_PATH = path.join(DATA_DIR, 'session.enc');
let remoteLicenseState = { status: 'unconfigured', lastCheckAt: null, reason: null, revoked: false, trialHours: 168 };
let cachedTrialHours = 168;
let remoteLicenseTimer = null;

function formatTrialDurationEs(hours = cachedTrialHours) {
  const h = Math.max(1, Math.round(Number(hours) || 168));
  if (h % 24 === 0 && h >= 48) return `${Math.round(h / 24)} días`;
  return h === 24 ? '24 horas' : `${h} horas`;
}
let remoteLicenseErrorStreak = 0;
let remoteLicenseFastRetryCount = 0;
let remoteLicenseFastRetryTimer = null;
let cachedAuthProfile = null;
let activeAuthServer = null;

function licenseApiUrl() {
  // Seguridad (C-01): en producción la URL de licencias es inmutable y HTTPS oficial.
  if (app.isPackaged) return licenseClient.DEFAULT_API_URL;
  return process.env.AOE2_LICENSE_API_URL || licenseClient.DEFAULT_API_URL;
}

function loadSessionToken() {
  try {
    if (!fs.existsSync(SESSION_TOKEN_PATH)) return null;
    const raw = fs.readFileSync(SESSION_TOKEN_PATH, 'utf8').trim();
    if (!raw) return null;
    if (raw.startsWith('dpapi:')) {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(raw.slice(6), 'base64'));
    }
    // Seguridad (M-03): en producción con DPAPI disponible no aceptar tokens en texto plano.
    if (app.isPackaged && safeStorage && safeStorage.isEncryptionAvailable()) return null;
    return raw;
  } catch {
    return null;
  }
}

function saveSessionToken(token) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const clean = String(token || '').trim();
    if (!clean) { clearSessionToken(); return; }
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(clean).toString('base64');
      fs.writeFileSync(SESSION_TOKEN_PATH, `dpapi:${enc}`, 'utf8');
    } else if (!app.isPackaged) {
      fs.writeFileSync(SESSION_TOKEN_PATH, clean, 'utf8');
    } else {
      log('aviso: Windows DPAPI no disponible; la sesión se mantiene solo en memoria.');
    }
  } catch (err) {
    log(`no pude guardar la sesión cifrada: ${err.message}`);
  }
}

function clearSessionToken() {
  cachedAuthProfile = null;
  try {
    if (fs.existsSync(SESSION_TOKEN_PATH)) fs.unlinkSync(SESSION_TOKEN_PATH);
  } catch {
    /* ya no existía */
  }
}

function broadcastAuthState(payload) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('auth:update', payload);
  }
}

async function fetchCurrentAuthState() {
  const token = loadSessionToken();
  const apiUrl = licenseApiUrl();
  if (!token) {
    cachedAuthProfile = { signedIn: false, user: null, devices: [], activeDeviceCount: 0, currentMachineAuthorized: false };
    return cachedAuthProfile;
  }
  const res = await licenseClient.fetchAccountMe({ apiUrl, sessionToken: token });
  if (res.unauthorized) {
    clearSessionToken();
    cachedAuthProfile = { signedIn: false, user: null, devices: [], activeDeviceCount: 0, currentMachineAuthorized: false, expired: true };
    return cachedAuthProfile;
  }
  if (!res.ok) {
    return cachedAuthProfile || { signedIn: true, offline: true, error: res.error, user: null, devices: [] };
  }
  if (Number.isFinite(Number(res.data?.trialHours)) && Number(res.data.trialHours) > 0) {
    cachedTrialHours = Math.round(Number(res.data.trialHours));
  }
  cachedAuthProfile = { signedIn: true, ...res.data };
  return cachedAuthProfile;
}

function broadcastReferralsState(data) {
  if (data) cachedReferralsState = data;
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('referrals:update', data);
  }
}

async function fetchCurrentReferralsState() {
  const apiUrl = licenseApiUrl();
  const sessionToken = loadSessionToken();
  if (!apiUrl) return { ok: false, error: 'Servidor no configurado.' };
  if (!sessionToken) {
    cachedReferralsState = null;
    return { ok: false, authRequired: true, error: 'Iniciá sesión con Google para ver tu programa de referidos.' };
  }
  const allLocalPlatformIdHashes = verifiedLocalDetection?.localProof?.allLocalPlatformIdHashes
    || collectLocalPlatformIdHashes();
  const res = await licenseClient.fetchMyReferrals({ apiUrl, sessionToken, allLocalPlatformIdHashes });
  if (!res.ok) {
    return { ok: false, unauthorized: Boolean(res.unauthorized), code: res.code || null, error: res.error };
  }
  cachedReferralsState = res.data;
  broadcastReferralsState(res.data);
  if (res.data?.myReferral?.status === 'pending') {
    const waitSec = Math.max(0, Number(res.data.myReferral.dwellRemainingSeconds || 0));
    scheduleReferralActivationAttempt(waitSec > 0 ? (waitSec + 2) * 1000 : 1200);
  }
  return { ok: true, referrals: res.data };
}

function scheduleReferralActivationAttempt(delayMs = 5000) {
  clearTimeout(referralRetryTimer);
  referralRetryTimer = setTimeout(() => {
    referralRetryTimer = null;
    tryAutoActivatePendingReferral().catch(() => {});
  }, Math.max(1000, Math.min(delayMs, 10 * 60 * 1000)));
  referralRetryTimer.unref?.();
}

async function tryAutoActivatePendingReferral({ force = false } = {}) {
  if (referralActivating) return { ok: false, busy: true };
  const apiUrl = licenseApiUrl();
  const sessionToken = loadSessionToken();
  if (!apiUrl || !sessionToken) return { ok: false, authRequired: true };
  if (!force && cachedReferralsState?.myReferral?.status !== 'pending') {
    return { ok: false, skipped: true };
  }
  referralActivating = true;
  try {
    if (!verifiedLocalDetection?.localProof) {
      const detected = await detectProfile(log).catch(() => null);
      if (detected && detected.localProof) {
        verifiedLocalDetection = detected;
      }
    }
    const aoeProof = verifiedLocalDetection?.localProof || null;
    if (!aoeProof) {
      scheduleReferralActivationAttempt(60 * 1000);
      return {
        ok: false,
        code: 'aoe-profile-required',
        error: 'Abrí Age of Empires II: DE o iniciá Steam en esta PC para detectar tu perfil automáticamente y activar el referido.',
      };
    }
    const res = await licenseClient.activateReferral({ apiUrl, sessionToken, aoeProof });
    if (res.ok && res.data?.status === 'activated') {
      log(`referido activado automáticamente (AoE2 profile ${res.data.aoeProfileId || 'ok'})`);
      await fetchCurrentReferralsState().catch(() => {});
      await syncRemoteLicense('referral-activated').catch(() => {});
      return { ok: true, data: res.data };
    }
    const errCode = res.code || res.data?.error || null;
    if (errCode === 'activation-dwell-pending') {
      const waitSec = Math.max(15, Number(res.data?.retryAfterSeconds || 30));
      scheduleReferralActivationAttempt((waitSec + 2) * 1000);
      return { ok: false, pending: true, code: errCode, error: res.error, retryAfterSeconds: waitSec };
    }
    if (res.data?.retryable) {
      scheduleReferralActivationAttempt(90 * 1000);
    } else if (res.data?.status === 'pending_review' || res.data?.status === 'rejected' || res.data?.status === 'expired') {
      await fetchCurrentReferralsState().catch(() => {});
    }
    return { ok: false, code: errCode, error: res.error, data: res.data };
  } finally {
    referralActivating = false;
  }
}

async function syncRemoteLicense(reason = 'startup') {
  const apiUrl = licenseApiUrl();
  if (!apiUrl) return remoteLicenseState;
  const sessionToken = loadSessionToken();
  const allLocalPlatformIdHashes = verifiedLocalDetection?.localProof?.allLocalPlatformIdHashes
    || collectLocalPlatformIdHashes();
  const res = await licenseClient.checkRemoteEntitlement({
    apiUrl,
    profileId: profileId || null,
    alias: playerAlias || '',
    appVersion: app.getVersion(),
    sessionToken,
    allLocalPlatformIdHashes,
    publicKeys: PRODUCT_PUBLIC_KEYS || {},
  });
  const prevTrialHours = cachedTrialHours;
  if (Number.isFinite(Number(res.trialHours)) && Number(res.trialHours) > 0) {
    cachedTrialHours = Math.round(Number(res.trialHours));
  }
  remoteLicenseState = { ...res, trialHours: cachedTrialHours, lastCheckAt: Date.now(), checkReason: reason };
  if (res.status === 'verified' && res.token && res.accountId) {
    remoteLicenseErrorStreak = 0;
    remoteLicenseFastRetryCount = 0;
    clearTimeout(remoteLicenseFastRetryTimer);
    remoteLicenseFastRetryTimer = null;
    productSession = { accountId: res.accountId, entitlementToken: res.token };
    log(`licencia remota verificada (${res.plan}) · ${reason}`);
    refreshAccessPresentation();
  } else if (res.revoked || res.status === 'free' || res.status === 'invalid-signature') {
    if (res.status !== 'invalid-signature') remoteLicenseErrorStreak = 0;
    remoteLicenseFastRetryCount = 0;
    clearTimeout(remoteLicenseFastRetryTimer);
    remoteLicenseFastRetryTimer = null;
    const hadAccess = Boolean(productSession.entitlementToken || config.accessKeyGrant);
    if ((res.revoked || res.paywallEnabled) && config.accessKeyGrant) persistConfig({ accessKeyGrant: null });
    productSession = { accountId: null, entitlementToken: null };
    if (hadAccess || res.revoked || res.paywallEnabled || res.status === 'invalid-signature' || cachedTrialHours !== prevTrialHours) {
      log(`acceso remoto retirado (${res.reason || res.status}) · ${reason}`);
      refreshAccessPresentation();
    }
    if (res.status === 'invalid-signature') {
      diagnosticReporter.report({
        kind: 'license_error',
        fingerprint: `license:invalid-sig:${res.reason || 'unknown'}`,
        summary: `Firma de licencia inválida (${res.reason || 'unknown'}) · ${reason}`,
      }).catch(() => {});
    }
  } else if (res.status === 'network-error' || res.status === 'http-error' || res.status === 'error') {
    remoteLicenseErrorStreak += 1;
    if (!productSession.entitlementToken && remoteLicenseFastRetryCount < 4) {
      const delays = [4000, 10000, 25000, 60000];
      const delayMs = delays[remoteLicenseFastRetryCount] || 60000;
      remoteLicenseFastRetryCount += 1;
      clearTimeout(remoteLicenseFastRetryTimer);
      remoteLicenseFastRetryTimer = setTimeout(() => {
        remoteLicenseFastRetryTimer = null;
        syncRemoteLicense('fast-retry').catch(() => {});
      }, delayMs);
      remoteLicenseFastRetryTimer.unref?.();
    }
    if (remoteLicenseErrorStreak >= 3) {
      remoteLicenseErrorStreak = 0;
      diagnosticReporter.report({
        kind: 'license_error',
        fingerprint: `license:${res.status}:${res.reason || 'err'}`,
        summary: `3 fallos seguidos verificando licencia (${res.status} · ${res.reason || 'error'})`,
      }).catch(() => {});
    }
  }
  return remoteLicenseState;
}

function scheduleRemoteLicenseChecks() {
  clearInterval(remoteLicenseTimer);
  remoteLicenseTimer = setInterval(() => {
    syncRemoteLicense('periodic').catch(() => {});
  }, 15 * 60 * 1000);
  remoteLicenseTimer.unref?.();
}

function productState() {
  const product = resolveProductState({
    betaAccess: BETA_ACCESS,
    accessKeyGranted: false,
    entitlementToken: productSession.entitlementToken,
    accountId: productSession.accountId,
    profileId,
    machineHash: licenseClient.getMachineHash(),
    publicKeys: PRODUCT_PUBLIC_KEYS,
    billing: config.commerce || {},
  });
  const expiresAt = product.subscriptionVerified ? product.entitlement.expiresAt : null;
  if (expiresAt !== productExpiryAt) {
    clearTimeout(productExpiryTimer);
    productExpiryTimer = null;
    productExpiryAt = expiresAt;
    if (expiresAt != null) {
      productExpiryTimer = setTimeout(() => {
        productExpiryTimer = null;
        productExpiryAt = null;
        const next = productState();
        if (next.plan === 'free' && productSession.entitlementToken) {
          productSession = { accountId: null, entitlementToken: null };
        }
        // Evitar que el renderer interprete una expiración breve del JWT en vuelo
        // como un downgrade confirmado a Free mientras ya estamos renovando.
        if (next.plan === 'free' && remoteLicenseState && remoteLicenseState.status === 'verified') {
          remoteLicenseState = { ...remoteLicenseState, status: 'refreshing', reason: 'jwt-expired' };
        }
        refreshAccessPresentation(next);
        syncRemoteLicense('expiry').catch(() => {});
        fetchCurrentAuthState().then((auth) => { if (auth) broadcastAuthState(auth); }).catch(() => {});
      }, Math.min(Math.max(250, expiresAt - Date.now() + 250), 2147483647));
      productExpiryTimer.unref?.();
    }
  }
  return product;
}

function refreshAccessPresentation(product = productState()) {
  if (!allowsFeature(product, 'trainingHub')) {
    if (trainingController?.liveOverlayState) {
      trainingController.liveOverlayState.testActive = false;
      trainingController.liveOverlayState.startedAt = null;
      trainingController.liveOverlayState.offsetGameSec = 0;
    }
    syncLiveArmedBuildTimer();
  }
  if (!allowsFeature(product, 'smurfDetector')) {
    clearSmurfReports();
  }
  send('overlay:state', projectOverlayState(lastGood || {
    status: profileId ? 'idle' : 'no-profile', profileId, players: [],
  }, product));
  send('overlay:rival', projectRivalPayload(rivalReports, product));
  send('overlay:scout', projectScoutPayload(scoutPayload, product));
  send('overlay:config', overlayConfig());
  sendBuildOrder();
  syncIntro(lastGood, { force: true });
  sendView(true);
  broadcastPostMatch();
  if (settingsWin && !settingsWin.isDestroyed()) {
    const resolvedTheme = effectiveTheme(product);
    try { settingsWin.setBackgroundColor(isUltraTheme(resolvedTheme) ? '#000000' : '#0c1014'); } catch {}
    settingsWin.webContents.send('product:update', {
      ...product,
      remoteLicense: remoteLicenseState,
      trialHours: cachedTrialHours,
      effectiveTheme: resolvedTheme,
      ultraWelcomeSeen: normalizeUltraWelcomeSeen(config.ultraWelcomeSeen),
    });
    settingsWin.webContents.send('tactics:update', tacticalPayload());
    if (!allowsFeature(product, 'trainingHub')) {
      settingsWin.webContents.send('training:update', { unlocked: false, plan: product.plan || 'free' });
    }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

let logBuffer = [];
let recentLogLines = [];
let wsDisconnectStreak = 0;
let wsDisconnectWindowAt = 0;
let logFlushTimer = null;
let logDirReady = false;
let logFlushing = false;

const diagnosticReporter = createDiagnosticReporter({
  submitFn: (payload) => licenseClient.submitRemoteDiagnostic({ apiUrl: licenseApiUrl(), ...payload }),
  getMetaFn: () => ({
    appVersion: app.getVersion(),
    profileId,
    alias: playerAlias || '',
  }),
  getLogTailFn: () => recentLogLines.join('\n'),
  logFn: (msg) => log(msg),
  enabledFn: () => !DEV_SESSION && config.autoDiagnostics !== false,
});

function flushLogsSync() {
  clearTimeout(logFlushTimer);
  logFlushTimer = null;
  if (!logBuffer.length) return;
  const chunk = logBuffer.join('');
  logBuffer = [];
  try {
    if (!logDirReady) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      logDirReady = true;
    }
    fs.appendFileSync(LOG_PATH, chunk);
  } catch {
    /* el log a archivo es best-effort */
  }
}

async function flushLogsAsync() {
  logFlushTimer = null;
  if (logFlushing || !logBuffer.length) return;
  logFlushing = true;
  const chunk = logBuffer.join('');
  logBuffer = [];
  try {
    if (!logDirReady) {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      logDirReady = true;
    }
    await fs.promises.appendFile(LOG_PATH, chunk);
  } catch {
    /* el log a archivo es best-effort */
  } finally {
    logFlushing = false;
    if (logBuffer.length && !logFlushTimer) {
      logFlushTimer = setTimeout(() => { flushLogsAsync().catch(() => {}); }, 250);
      if (logFlushTimer.unref) logFlushTimer.unref();
    }
  }
}

function redactSecretsForLog(raw) {
  return String(raw || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/\bv1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, 'v1.[REDACTED]')
    .replace(/([?&](?:token|session|access_token|secret)=)[^&\s]+/gi, '$1[REDACTED]');
}

function log(...args) {
  const stamp = new Date().toISOString().slice(11, 19);
  const text = redactSecretsForLog(args.join(' '));
  const line = `[${stamp}] ${text}`;
  console.log(line);
  recentLogLines.push(line);
  if (recentLogLines.length > 120) recentLogLines.shift();
  logBuffer.push(`${line}\n`);

  // Rastrear caídas reiteradas del WebSocket de prematch (ej. código 1006 / sin respuesta)
  if (/socket\s+\w+\s*:\s*(?:cerrado\s*\(código\s*1006\)|15s sin respuesta|error\b)/i.test(text)) {
    const now = Date.now();
    if (now - wsDisconnectWindowAt > 5 * 60 * 1000) {
      wsDisconnectStreak = 0;
      wsDisconnectWindowAt = now;
    }
    wsDisconnectStreak += 1;
    if (wsDisconnectStreak === 3) {
      diagnosticReporter.report({
        kind: 'ws_disconnect',
        fingerprint: 'ws:prematch-1006',
        summary: `Prematch WebSocket desconectado repetidamente (${text.slice(0, 120)})`,
      }).catch(() => {});
    }
  } else if (/socket\s+\w+\s*:\s*conectado/i.test(text)) {
    wsDisconnectStreak = 0;
  }

  if (logBuffer.length >= 25) {
    flushLogsAsync().catch(() => {});
  } else if (!logFlushTimer) {
    logFlushTimer = setTimeout(() => { flushLogsAsync().catch(() => {}); }, 250);
    if (logFlushTimer.unref) logFlushTimer.unref();
  }
}

// Sin esto, cualquier excepción o promesa rechazada sin capturar mata el
// proceso en silencio (la app "se cierra sola" y el log no dice por qué).
process.on('uncaughtException', (err) => {
  const detail = (err && (err.stack || err.message)) || String(err);
  log(`CRASH · excepción no capturada: ${detail}`);
  flushLogsSync();
  diagnosticReporter.report({
    kind: 'crash',
    fingerprint: `crash:uncaught:${String(err?.name || 'Error')}:${String(err?.message || '').slice(0, 48)}`,
    summary: `Excepción no capturada: ${String(err?.message || err).slice(0, 180)}`,
    extraDetail: detail,
  }).catch(() => {});
});
process.on('unhandledRejection', (reason) => {
  const detail = (reason && (reason.stack || reason.message)) || String(reason);
  log(`CRASH · promesa rechazada sin capturar: ${detail}`);
  flushLogsSync();
  diagnosticReporter.report({
    kind: 'crash',
    fingerprint: `crash:rejection:${String(reason?.message || reason).slice(0, 48)}`,
    summary: `Promesa rechazada: ${String(reason?.message || reason).slice(0, 180)}`,
    extraDetail: detail,
  }).catch(() => {});
});

// Marca el final REAL del proceso. Si en el log la última línea es un latido y
// NO aparece esta, el proceso fue matado desde afuera (kill / reinstalación /
// corte del launcher), no por un error de JS. Era la causa de "se cierra sola".
process.on('exit', (code) => {
  flushLogsSync();
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
    theme: effectiveTheme(),
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
    smartTips: Boolean(view.smartTips),
    smartBuildOrder: Boolean(view.smartBuildOrder),
    rivalH2H: Boolean(view.rivalH2H),
    civRecommender: Boolean(view.civRecommender),
    civCounterPick: Boolean(view.civCounterPick),
    // Vista resumida de scouting con F2 (opción "Resumen con F2").
    scoutF2: Boolean(view.scoutF2),
    tgBalance: Boolean(view.tgBalance),
    smurfDetector: Boolean(view.smurfDetector),
    // Postmatch resuelto: Free ve el resultado; Pro ve comparación y replay.
    postMatch: Boolean(view.postMatch),
    postMatchComparison: Boolean(view.postMatchComparison),
    postMatchCompareMode: ['both', 'personal', 'community'].includes(config.postMatchCompareMode) ? config.postMatchCompareMode : 'both',
    postMatchReplay: Boolean(view.postMatchReplay),
    language: i18n.getLocale(config.language),
    i18nBundle: i18n.getBundle(config.language),
    product: productState(),
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
 * La cuarta opción del grupo, `smartTips` (recomendaciones pre-partida), NO
 * pasa por este flujo: vive solo en la fase `lobby` y la maneja
 * refreshScoutTips (más abajo).
 *
 * Se dispara EN BACKGROUND desde emit(): el aviso de "partida encontrada" y
 * el ELO salen en 0-1ms; el informe llega después y se va completando por
 * partes (civs primero ~0.3s, aperturas ~9s la primera vez, luego cache).
 * ---------------------------------------------------------------------- */
const RIVAL_LIMIT = 4; // en TG consultamos hasta los 4 rivales y el panel los rota de a 2

function rivalOptionsOn() {
  const view = viewConfig();
  return RIVAL_REPORT_KEYS.some((key) => Boolean(view[key]));
}

function rivalSignature(state, rivals) {
  const view = viewConfig();
  // smartTips no entra en la firma: tiene su propio flujo pre-partida.
  const flags = RIVAL_REPORT_KEYS.map((key) => (view[key] ? '1' : '0')).join('');
  const matchId = (state && state.match && state.match.matchId) || 'sin-id';
  const mapName = (state && state.match && state.match.mapName) || 'sin-mapa';
  const mode = resolveMode(leaderboardOf(state));
  return `${matchId}:${mode ? mode.id : 'sin-modo'}:${mapName}:${rivals.map((rival) => `${rival.profileId}-${civSlug(rival.civ) || '?'}`).join(',')}:${flags}`;
}

/** Ladder de la partida: del payload del match; si falta, del etiquetado. */
function leaderboardOf(state) {
  if (!state) return null;
  const fromMatch = state.match && state.match.leaderboardId;
  if (fromMatch != null && fromMatch !== '') return fromMatch;
  return state.ladder ? state.ladder.id : null;
}

function sendRival(payload) {
  // El head-to-head vive en los Map de arriba y se INYECTA acá, al publicar.
  // Así sobrevive a que el informe se republish por partes (civs → aperturas)
  // sin que cada etapa tenga que saber de él.
  const decorated = payload && Array.isArray(payload.reports)
    ? { ...payload, matchId: payload.matchId ?? lastGood?.match?.matchId,
      reports: payload.reports.map(decorateH2H) }
    : payload;
  rivalReports = decorated;
  send('overlay:rival', projectRivalPayload(decorated, productState()));
}

/** Inyecta el h2h calculado (o su marcador de "buscando") en un reporte. */
function decorateH2H(report) {
  const id = Number(report && report.profileId);
  if (!Number.isFinite(id) || id <= 0) return report;
  const out = { ...report };
  if (h2hByRival.has(id)) {
    out.h2h = h2hByRival.get(id);
    delete out.h2hPending;
  } else if (h2hPendingIds.has(id)) {
    out.h2hPending = true;
  }
  return out;
}

let smurfReports = null;
let smurfSig = '';
let smurfFetching = false;

function sendSmurf(payload) {
  smurfReports = payload;
  send('overlay:smurf', payload);
}

function clearSmurfReports() {
  smurfSig = '';
  if (smurfReports) sendSmurf(null);
}

function buildExampleSmurfPreview(state) {
  if (!state || !state.example || !Array.isArray(state.players)) return null;
  const rivals = state.players.filter((p) => p && !p.isYou && Number(p.profileId) > 0);
  if (!rivals.length) return null;
  const byPlayer = {};
  const first = rivals[0];
  byPlayer[first.profileId] = {
    profileId: Number(first.profileId),
    flagged: true,
    level: 'high',
    label: 'SMURF',
    shortReason: 'alt 1640',
    reasons: ['Vista previa · Cuenta vinculada en 1640 ELO (+410)'],
    score: 75,
    example: true,
  };
  if (rivals.length >= 2) {
    const second = rivals[1];
    byPlayer[second.profileId] = {
      profileId: Number(second.profileId),
      flagged: true,
      level: 'possible',
      label: 'SMURF?',
      shortReason: '74%·26pj',
      reasons: ['Vista previa · 74% WR en solo 26 partidas de RM 1v1'],
      score: 45,
      example: true,
    };
  }
  return { ts: Date.now(), matchId: String(state.match?.matchId || 'ejemplo'), byPlayer, example: true };
}

async function refreshSmurfReports(state, options = {}) {
  const view = viewConfig();
  if (DEMO || !view.smurfDetector || !state || state.status !== 'ongoing') {
    clearSmurfReports();
    return;
  }
  // Esperar a fase 2 (cuando ya llegó el ELO/pico/partidas RM 1v1) para no correr sin datos completos.
  if (state.pending) return;
  const players = Array.isArray(state.players) ? state.players : [];
  const rivals = players.filter((p) => p && !p.isYou && Number(p.profileId) > 0);
  if (!rivals.length) {
    clearSmurfReports();
    return;
  }
  const matchId = state.match?.matchId || 'sin-id';
  const enemies = opponentsOf(state, RIVAL_LIMIT);
  const enemyIds = new Set(enemies.map((e) => Number(e.profileId)).filter((n) => n > 0));
  const modeObj = resolveMode(leaderboardOf(state) || 3);
  const sig = `${matchId}:${rivals.map((r) => r.profileId).join(',')}`;
  if (!options.force && sig === smurfSig && smurfReports) return;
  if (smurfFetching) return;
  smurfSig = sig;
  smurfFetching = true;
  try {
    const byPlayer = await detectSmurfsForPlayers(players, {
      cache: statsCache,
      enemyIds,
      mode: modeObj,
      onUpdate: (enrichedByPlayer) => {
        if (!lastGood || lastGood.status !== 'ongoing' || !viewConfig().smurfDetector) return;
        if (String(lastGood.match?.matchId || 'sin-id') !== String(matchId)) return;
        sendSmurf({ ts: Date.now(), matchId: String(matchId), byPlayer: enrichedByPlayer });
      },
      log,
    });
    if (!lastGood || lastGood.status !== 'ongoing' || !viewConfig().smurfDetector) return;
    const anyFlagged = Object.values(byPlayer || {}).some((entry) => entry && entry.flagged);
    if (!anyFlagged && state.example && activePreviewHighlight?.feature === 'smurfDetector') {
      const sample = buildExampleSmurfPreview(state);
      if (sample) {
        sendSmurf(sample);
        return;
      }
    }
    sendSmurf({ ts: Date.now(), matchId: String(matchId), byPlayer });
  } catch (err) {
    log(`smurf detector: ${err.message}`);
  } finally {
    smurfFetching = false;
    maybeArmPreviewAutoHide();
  }
}

function clearRivalReports() {
  rivalSig = '';
  rivalQueuedSig = null;
  clearTimeout(rivalRetryTimer);
  rivalRetryTimer = null;
  rivalRetryKey = '';
  rivalRetryCount = 0;
  h2hSig = '';
  h2hQueuedSig = null;
  h2hByRival.clear();
  h2hPendingIds.clear();
  if (rivalReports) sendRival(null);
  clearSmurfReports();
}

/** Datos de ejemplo (reales de una consulta de prueba) solo para capturas. */
function demoRivalReports(state) {
  // Captura de la barrita: todo pendiente, como en los primeros 1-9 s reales.
  if (ANALYZING) {
    return {
      ts: Date.now(),
      demo: true,
      pendingOpenings: true,
      partial: true,
      reports: opponentsOf(state, RIVAL_LIMIT).map((rival) => ({
        profileId: rival.profileId,
        name: rival.name,
        civ: rival.civ,
        loading: true,
      })),
    };
  }
  const mode = resolveMode(leaderboardOf(state)) || {
    id: 3, key: 'rm_1v1', label: 'RM 1v1', group: 'rm', size: '1v1',
  };
  // Dos mapStats distintos para las capturas TG: uno con civ dominante
  // (publica "Suele jugar…") y otro sin (publica "Sin civ dominante acá").
  // Nunca se usan en vivo.
  const DEMO_MAP_STATS = [
    { games: 34, wins: 19, winRate: 56, sampleGames: 34,
      civ: { name: 'Magyars', slug: 'magyars', games: 21, wins: 12, share: 62, winRate: 57 } },
    { games: 31, wins: 16, winRate: 52, sampleGames: 31,
      civ: { name: 'Poles', slug: 'poles', games: 9, wins: 5, share: 29, winRate: 56 } },
  ];
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
    reports: opponentsOf(state, RIVAL_LIMIT).map((rival, index) => ({
      profileId: rival.profileId,
      name: rival.name,
      civ: rival.civ,
      mode,
      // Head-to-head de ejemplo: los datos demo son del mismo estilo que los
      // reales (solo se usa para capturas, nunca en vivo).
      h2h: {
        games: 3,
        wins: 1,
        losses: 2,
        asAllies: 1,
        scanned: 612,
        lastMatch: {
          mapName: state.match.mapName === '—' ? 'Arabia' : state.match.mapName,
          startedAt: Date.now() - 12 * 24 * 60 * 60 * 1000,
          won: false,
        },
        // Los últimos 3 enfrentamientos (mi civ, resultado, mapa): mismos
        // campos que los reales de src/mine.js computeH2H.
        recent: [
          { civ: 'Magyars', slug: 'magyars', won: false, mapName: state.match.mapName === '—' ? 'Arabia' : state.match.mapName },
          { civ: 'Mongols', slug: 'mongols', won: true, mapName: 'Steppe' },
          { civ: 'Persians', slug: 'persians', won: false, mapName: 'African Clearing' },
        ],
      },
      history,
      favoriteCiv: { name: 'Ethiopians', slug: 'ethiopians', games: 145, share: 53, winRate: 54 },
      mapStats: {
        name: state.match.mapName,
        // games/wins/winRate: el histórico completo del mapa (/stats).
        // sampleGames + civ.games: las partidas del mapa que se LEYERON.
        // Mismo denominador que el renderer espera desde v0.1.25 (mezclarlos
        // era el bug del "0 %").
        ...DEMO_MAP_STATS[index % DEMO_MAP_STATS.length],
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
        openingCiv: rival.civ,
        mapCivAnalyzed: index === 0 ? 9 : 0,
        mapCivFavorite: index === 0 ? { name: 'Archer rush', short: 'Arqueros', count: 6, share: 67 } : null,
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
 * Reintento del informe DENTRO de la pre-partida.
 *
 * Si un rival vuelve sin civs (red caída, 502, timeout de la API) el panel
 * quedaría mostrando un bloque vacío justo en los ~60s que hay para leerlo.
 * Se reintenta hasta 2 veces, sin pasar de la fase `lobby` y sin repetir la
 * consulta cuando ya hay datos.
 */
function scheduleRivalRetry(reports, rivals) {
  if (!preStartState(lastGood)) return;
  const matchId = String((lastGood.match && lastGood.match.matchId) ?? '');
  if (rivalRetryKey !== matchId) {
    rivalRetryKey = matchId;
    rivalRetryCount = 0;
  }
  if (rivalRetryCount >= RIVAL_RETRY_MAX) return;
  // Las aperturas NO cuentan como dato faltante: con el historial completo de
  // replays tardan ~20 s en frío y ya vienen por `onOpenings`. Reintentar por
  // ellas duplicaba la consulta (hasta 3 por rival) sin adelantar nada.
  let reason = '';
  const missing = rivals.some((rival) => {
    const report = reports.find((item) => Number(item.profileId) === Number(rival.profileId));
    if (!report) reason = `sin informe de ${rival.name}`;
    else if (report.modeUnavailable) return false;
    else if (report.error && /HTTP 429/.test(String(report.error))) return false;
    else if (report.error) reason = `error de ${rival.name}: ${report.error}`;
    // Un historial vacío sin error es un resultado válido, no un fallo de red.
    return Boolean(reason);
  });
  if (!missing) return;
  clearTimeout(rivalRetryTimer);
  rivalRetryTimer = setTimeout(() => {
    rivalRetryTimer = null;
    if (!preStartState(lastGood)) return;
    rivalRetryCount += 1;
    log(`informe del rival incompleto (${reason}): reintento ${rivalRetryCount}/${RIVAL_RETRY_MAX}`);
    // La caché no guarda resultados con error: este intento sí puede traer datos.
    rivalSig = '';
    rivalQueuedSig = null;
    refreshRivalReports(lastGood, { force: true }).catch(() => {});
  }, RIVAL_RETRY_MS);
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

  const needsCivHistory = view.civRecommender && (Boolean(state.example) || rivals.some((rival) => !civSlug(rival.civ)));
  if (!needsRivalHistory(view) && !needsCivHistory) {
    // Solo H2H: el historial necesario es el propio, no el del rival.
    sendRival({ ts: Date.now(), pendingOpenings: false, reports: rivals.map((rival) => ({
      profileId: rival.profileId, name: rival.name, civ: rival.civ,
    })) });
    return;
  }

  rivalFetching = true;
  const startedAt = Date.now();
  const prevReportsList = Array.isArray(rivalReports?.reports) ? rivalReports.reports : [];
  let reports = rivals.map((rival) => {
    const prev = prevReportsList.find((item) => Number(item?.profileId) === Number(rival.profileId) && !item.loading);
    return prev
      ? { ...prev, name: rival.name, civ: rival.civ }
      : { profileId: rival.profileId, name: rival.name, civ: rival.civ, loading: true };
  });
  const publish = (report) => {
    // Una respuesta tardía no puede publicar datos de una sala anterior,
    // un mapa anterior ni de una combinación de opciones ya modificada.
    if (!lastGood || lastGood.status !== 'ongoing' || !rivalOptionsOn() ||
        rivalSignature(lastGood, opponentsOf(lastGood, RIVAL_LIMIT)) !== sig) return;
    const updated = mergeRivalReport(reports, report, view.rivalOpenings);
    reports = updated.reports;
    sendRival({ ts: Date.now(), ...updated });
  };

  try {
    // El panel ya puede mostrar "cargando…" sin esperar ninguna request.
    sendRival({
      ts: Date.now(),
      pendingOpenings: Boolean(view.rivalOpenings),
      partial: true,
      reports: reports.map((item) => ({ ...item })),
    });

    const leaderboardId = leaderboardOf(state);
    const mapName = state.match && state.match.mapName;
    const currentMatchId = state.match && state.match.matchId;

    // En PARALELO: en TG dos informes en serie tardaban 30-40 s y la partida
    // arrancaba antes de que llegara el segundo (la pre-partida se iba sin
    // datos). Cada uno publica su parte apenas la tiene.
    await Promise.all(rivals.map(async (rival) => {
      const decorated = (data) => ({ ...data, name: rival.name, civ: rival.civ });
      try {
        const report = await buildRivalInsights({
          profileId: rival.profileId,
          name: rival.name,
          civ: rival.civ,
          leaderboardId,
          mapName,
          currentMatchId,
          cutoff: historyCutoff(state),
          historical: exampleActive,
          cache: statsCache,
          cacheTtlMs: Number(config.statsCacheMinutes || 15) * 60 * 1000,
          includeOpenings: Boolean(view.rivalOpenings),
          // AoE2Insights contesta 202 y tarda ~9s: las civs se pintan YA.
          onPartial: (partial) => publish(decorated({ ...partial, openingsPending: Boolean(view.rivalOpenings) })),
          // Con el historial completo las aperturas pueden tardar ~20 s en
          // frío. El informe ya se publicó sin ellas; cuando llegan, se
          // repinta SOLO esa tarjeta (mismo `publish`, por profileId).
          onOpenings: (full) => {
            log(
              `aperturas tardías ${rival.name} (#${rival.profileId}): ` +
                `${full.openings ? full.openings.analyzed : 0} replays al ` +
                `${Date.now() - startedAt}ms`,
            );
            publish(decorated({ ...full, openingsPending: false }));
          },
          log,
        });
        publish(decorated(report));
        log(
          `informe del rival ${rival.name} (#${rival.profileId}) listo en ` +
            `${Date.now() - startedAt}ms · ${report.history.length} civs` +
            `${report.mode ? ` en ${report.mode.label}` : ''} · ` +
            `${report.mapStats ? `${report.mapStats.name}: ${report.mapStats.civ ? report.mapStats.civ.name : 'sin civ'}` : 'sin mapa'} · ` +
            `${report.openings ? Number(report.openings.analyzed) || 0 : 0} aperturas reales`,
        );
      } catch (err) {
        // Un rival que falla no puede dejar la barra trabada ni silenciar al otro.
        log(`no pude armar el informe de ${rival.name}: ${err.message}`);
        publish(decorated({ profileId: rival.profileId, history: [], loading: false,
          error: `historial: ${err.message} · stats: ${err.message}`,
          openingError: err.message, openingsPending: false }));
      }
    }));
  } catch (err) {
    log(`no pude armar el informe del rival: ${err.message}`);
  } finally {
    rivalFetching = false;
    // Va en el finally a propósito: si algo lanzó antes de publicar, el panel no
    // puede quedarse con el bloque vacío. Se reintenta mientras siga la
    // pre-partida y haya datos faltantes.
    scheduleRivalRetry(reports, rivals);
    if (rivalQueuedSig && rivalQueuedSig !== rivalSig) {
      rivalQueuedSig = null;
      rivalSig = '';
      refreshRivalReports(lastGood).catch(() => {});
    } else {
      rivalQueuedSig = null;
      maybeArmPreviewAutoHide();
    }
  }
}

/* -------------------------------------------------------------------------
 * RECOMENDACIONES INTELIGENTES (opción `smartTips`, pre-partida)
 *
 * Consejo corto por rival calculado con datos REALES de AoE2Insights
 * (src/scout.js): qué civs y qué aperturas le cuestan en el mapa/modo de la
 * partida, y su perfil de ritmo. REGLA DE PRODUCTO: solo existe en la fase
 * `lobby` (la ventana de ~60s entre "partida encontrada" y el inicio); cuando
 * el REST confirma que la partida arrancó, el estado ya no trae esa fase y
 * el bloque se borra solo.
 * ---------------------------------------------------------------------- */

/** ¿Estamos en la ventana de preparación (partida encontrada, no empezada)? */
function preStartState(state) {
  return Boolean(state && state.status === 'ongoing' && state.phase === 'lobby');
}

function scoutSignature(state) {
  const mode = resolveMode(leaderboardOf(state));
  const players = Array.isArray(state && state.players) ? state.players : [];
  const own = players.find((player) => player.isYou) || players.find((player) => Number(player.profileId) === Number(runtimeProfileId()));
  const view = viewConfig();
  return `${state?.match?.matchId || 'sin-id'}:${mapKey(state?.match?.mapName)}:${mode ? mode.id : 'sin-modo'}:${view.civCounterPick ? 'cp1' : 'cp0'}:${own?.civ || '?'}:${opponentsOf(state, RIVAL_LIMIT).map((rival) => `${rival.profileId}:${rival.civ || players.find((p) => p.profileId === rival.profileId)?.civ || '?'}`).join(',')}`;
}

function tacticalPayload() {
  const product = productState();
  if (!product.featureAccess.smartBuildOrder) return { status: 'locked', tips: [], message: 'El análisis de oportunidades durante la partida está incluido en Ultra.' };
  if (!viewConfig().smartTips) return { status: 'disabled', tips: [], message: 'Activá Lectura de apertura en Prematch para analizar las oportunidades.' };
  if (!lastGood || lastGood.status !== 'ongoing' || !scoutPayload || String(scoutPayload.matchId) !== String(lastGood.match?.matchId)) {
    return { status: 'pending', tips: [], message: 'El análisis aparecerá cuando se confirme una partida.' };
  }
  const pending = scoutPayload.pending || scoutSig !== scoutSignature(lastGood);
  return { ...scoutPayload, status: pending ? 'loading' : 'ready', automatic: true };
}

let liveArmedBuildTimer = null;

function buildOrderPayload() {
  const prod = productState();
  if (!prod.featureAccess.smartBuildOrder && !allowsFeature(prod, 'trainingHub')) {
    return { status: 'locked', enabled: false, message: 'Smart Build Order está incluido en Ultra.', guides: [], selected: null };
  }
  const helperEnabled = Boolean(viewConfig().smartBuildOrder);
  const ongoing = lastGood?.status === 'ongoing';
  const inLobby = Boolean(ongoing && (lastGood?.phase === 'lobby' || lastGood?.previewPhase === 'prematch'));
  const pid = runtimeProfileId();
  const own = ongoing ? (lastGood.players || []).find((player) => player.isYou ||
    Number(player.profileId) === Number(pid)) : null;

  if (allowsFeature(prod, 'trainingHub')) {
    const armedPayload = trainingController.getArmedOverlayPayload({
      profileId: pid,
      ongoing: Boolean(ongoing && !inLobby),
      matchId: ongoing ? lastGood.match?.matchId : 'live-test',
      ownCiv: own?.civ || null,
      mapName: ongoing ? lastGood.match?.mapName : null,
    });
    // La prueba explícita ("Probar en pantalla") corre SOLO fuera de partida;
    // en partida real el Build Order de Entrenamiento SOLO se activa si
    // "Build Order Helper" (Batalla) está encendido.
    const isLiveTestOnly = Boolean(armedPayload && armedPayload.liveTestActive && !ongoing);
    if (armedPayload && (isLiveTestOnly || (helperEnabled && ongoing && !inLobby))) {
      return { ...armedPayload, enabled: helperEnabled, liveTestActive: isLiveTestOnly };
    }
  }

  const sameMatch = ongoing && scoutPayload && String(scoutPayload.matchId) === String(lastGood.match?.matchId);
  const opportunityStages = sameMatch ? (scoutPayload.tips || []).flatMap((tip) => tip.opportunityStages || []) : [];
  return { ...buildSmartBuildOrder({ ownCiv: own?.civ,
    mapName: ongoing ? lastGood.match?.mapName : null,
    mode: ongoing ? resolveMode(leaderboardOf(lastGood)) : null, opportunityStages }),
    enabled: helperEnabled, ongoing,
    matchId: ongoing ? lastGood.match?.matchId : null };
}

function sendBuildOrder() {
  const payload = buildOrderPayload();
  const shouldShow = Boolean(
    payload && (
      payload.liveTestActive ||
      (payload.enabled && payload.ongoing)
    )
  );
  send('overlay:build-order', shouldShow ? payload : null);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('build-order:update', payload);
}

function syncLiveArmedBuildTimer() {
  if (!allowsFeature(productState(), 'trainingHub')) {
    if (liveArmedBuildTimer) {
      clearInterval(liveArmedBuildTimer);
      liveArmedBuildTimer = null;
    }
    return;
  }
  const pid = runtimeProfileId();
  const prof = trainingController.store.getProfile(pid);
  const helperEnabled = Boolean(viewConfig().smartBuildOrder);
  const needTimer = Boolean(
    trainingController.liveOverlayState?.testActive ||
    (helperEnabled && lastGood?.status === 'ongoing' && prof?.armedBuildOrderId)
  );
  if (needTimer && !liveArmedBuildTimer) {
    liveArmedBuildTimer = setInterval(() => {
      const stillAllowed = allowsFeature(productState(), 'trainingHub');
      const stillHelperEnabled = Boolean(viewConfig().smartBuildOrder);
      const stillNeeded = stillAllowed && Boolean(
        trainingController.liveOverlayState?.testActive ||
        (stillHelperEnabled && lastGood?.status === 'ongoing' && trainingController.store.getProfile(runtimeProfileId())?.armedBuildOrderId)
      );
      if (!stillNeeded) {
        clearInterval(liveArmedBuildTimer);
        liveArmedBuildTimer = null;
      }
      sendBuildOrder();
    }, 1000);
    if (liveArmedBuildTimer.unref) liveArmedBuildTimer.unref();
  } else if (!needTimer && liveArmedBuildTimer) {
    clearInterval(liveArmedBuildTimer);
    liveArmedBuildTimer = null;
  }
}

function sendScout(payload) {
  // La partida a la que pertenece el consejo viaja en el payload: el renderer
  // lo mantiene visible mientras sea el MISMO match, aunque el REST avise que
  // la partida ya arrancó. Antes se borraba en 0:00 justo cuando llegaba.
  const matchId = lastGood && lastGood.match ? lastGood.match.matchId : null;
  const stamped = payload ? { ...payload, matchId: matchId ?? null } : payload;
  scoutPayload = stamped;
  send('overlay:scout', projectScoutPayload(stamped, productState()));
  sendBuildOrder();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('tactics:update', tacticalPayload());
}

function clearScoutTips() {
  scoutSig = '';
  scoutQueuedSig = null;
  if (scoutPayload) sendScout(null);
}

/** Datos de ejemplo solo para capturas/demos (mismo criterio que demoRivalReports). */
function demoScoutTips(state) {
  if (ANALYZING) {
    return {
      ts: Date.now(),
      demo: true,
      pending: true,
      tips: opponentsOf(state, RIVAL_LIMIT).map((rival) => ({
        profileId: rival.profileId,
        name: rival.name,
        loading: true,
      })),
    };
  }
  const mode = resolveMode(leaderboardOf(state)) || {
    id: 3, key: 'rm_1v1', label: 'RM 1v1', group: 'rm', size: '1v1',
  };
  const mapName = (state && state.match && state.match.mapName) || 'Arabia';
  return {
    ts: Date.now(),
    pending: false,
    demo: true,
    tips: opponentsOf(state, RIVAL_LIMIT).map((rival, index) => {
      // Dos perfiles DISTINTOS: si las dos tarjetas de TG muestran lo mismo,
      // la captura no sirve para comprobar que cada una refleja a SU rival.
      const p = DEMO_SCOUT_PROFILES[index % DEMO_SCOUT_PROFILES.length];
      return {
        profileId: rival.profileId,
        name: rival.name,
        ok: true,
        source: 'AoE2Insights · replays analizados',
        mode,
        modeUnavailable: false,
        totalMatches: p.totalMatches,
        scope: p.scope,
        scopeLabel: p.scope === 'mode' ? `en ${mode.label}` : `en ${mapName}`,
        // Datos sintéticos de --demo. Ejercitan alcance local y degradado.
        context: index === 0
          ? { scope: 'map', scopeLabel: `en ${mapName}`, modeLabel: mode.label }
          : { scope: 'mode', scopeLabel: 'en todo el modo', modeLabel: mode.label, fallbackReason: 'Muestra limitada en este mapa.' },
        likelyOpenings: [{ name: p.style.top.name, short: p.style.top.short,
          games: p.style.top.games, sample: p.style.analyzed }],
        sample: p.sample,
        wins: p.wins,
        winRate: p.winRate,
        weakAgainst: p.weakAgainst,
        openingsAgainst: p.openingsAgainst,
        style: p.style,
        tempo: p.tempo,
        matchup: {
          map: mapKey(mapName), modeId: mode.id, modeLabel: mode.label, teamGame: mode.size === 'team',
          own: civSlug(state.players.find((player) => player.isYou)?.civ), rival: civSlug(rival.civ),
          openings: index === 0 ? [{ name: 'Archer rush', short: 'Arqueros', games: 6, sample: 9 },
            { name: 'Scout rush', short: 'Scouts', games: 3, sample: 9 }] : [],
          openingsSample: index === 0 ? 9 : 0, games: mode.size === '1v1' ? 6 : 0, losses: 3,
          against: [{ name: 'Arqueros', losses: 3, games: 4 }],
        },
        proCounterOpening: mode.size !== 'team' ? require('./src/training/pro-matchup-engine').lookupPrematchProIntel({
          myCivSlug: civSlug(state.players.find((player) => player.isYou)?.civ),
          rivalCivSlug: civSlug(rival.civ),
          rivalHabitualOpening: index === 0 ? 'Archer rush' : p.style.top.name,
          mapName,
        }).counterOpening : null,
        recommendError: null,
        fetchedAt: Date.now(),
        fromCache: false,
      };
    }),
  };
}

/* Perfiles de ejemplo para capturas: uno agresivo y uno que boomea, con
   debilidades y muestras distintas. Nunca se usan en vivo. */
const DEMO_SCOUT_PROFILES = [
  {
    totalMatches: 96, scope: 'map', sample: 48, wins: 25, winRate: 52,
    weakAgainst: [
      { civ: 'Gurjaras', games: 5, losses: 4, lossRate: 80 },
      { civ: 'Bengalis', games: 5, losses: 4, lossRate: 80 },
      { civ: 'Teutons', games: 7, losses: 4, lossRate: 57 },
    ],
    openingsAgainst: [
      { name: 'Archer rush', short: 'Archer rush', games: 11, losses: 8, lossRate: 73, scope: 'recorte' },
      { name: 'Scout rush', short: 'Scouts', games: 14, losses: 8, lossRate: 57, scope: 'recorte' },
    ],
    style: {
      scope: 'recorte', analyzed: 34, aggressive: 25, boom: 9, hybrid: 6,
      aggressiveShare: 74, dominant: 'agresivo', share: 74,
      top: { name: 'Scout rush', short: 'Scouts', games: 16 },
    },
    tempo: { shortGames: 9, shortWinRate: 33, longGames: 22, longWinRate: 64 },
  },
  {
    totalMatches: 74, scope: 'map', sample: 31, wins: 15, winRate: 48,
    weakAgainst: [
      { civ: 'Teutons', games: 6, losses: 4, lossRate: 67 },
      { civ: 'Magyars', games: 8, losses: 5, lossRate: 63 },
    ],
    openingsAgainst: [
      { name: 'Man at arms rush', short: 'MAA rush', games: 9, losses: 6, lossRate: 67, scope: 'recorte' },
      { name: 'Archer rush', short: 'Archer rush', games: 12, losses: 7, lossRate: 58, scope: 'recorte' },
    ],
    // Boomea y el estilo viene del MODO completo: la tarjeta lo declara.
    style: {
      scope: 'modo', analyzed: 22, aggressive: 7, boom: 15, hybrid: 3,
      aggressiveShare: 32, dominant: 'boom', share: 68,
      top: { name: 'Fast castle', short: 'FC', games: 12 },
    },
    tempo: { shortGames: 12, shortWinRate: 64, longGames: 10, longWinRate: 42 },
  },
];

/**
 * Consulta y publica los consejos. Misma disciplina que el informe del rival:
 * idempotente por partida, una consulta en vuelo como máximo, y jamás
 * bloquea el aviso de partida encontrada.
 */
async function refreshScoutTips(state, options = {}) {
  const view = viewConfig();
  if (DEMO) {
    if (RIVAL_DEMO && preStartState(state)) sendScout(demoScoutTips(state));
    return;
  }
  // smartTips (consejo) y civRecommender (civ recomendada) comparten la misma
  // consulta de replays: cualquiera de las dos enciende el flujo pre-partida.
  const ongoing = Boolean(state && state.status === 'ongoing');
  if ((!view.smartTips && !view.civRecommender && !view.civCounterPick) || !ongoing) {
    clearScoutTips();
    return;
  }
  // También funciona si la app detecta la partida ya empezada. La firma
  // evita repetir consultas y se renueva si se confirman nuevas civs.

  const rivals = opponentsOf(state, RIVAL_LIMIT);
  const mode = resolveMode(leaderboardOf(state));
  const mapName = (state.match && state.match.mapName) || null;
  const sig = scoutSignature(state);
  if (!options.force && sig === scoutSig && scoutPayload) return;
  if (scoutFetching) {
    scoutQueuedSig = sig;
    return;
  }
  scoutSig = sig;

  if (!rivals.length) {
    sendScout({ ts: Date.now(), pending: false, tips: [] });
    return;
  }
  // Sin ladder rankeada no se mezclan modos: se avisa y listo.
  if (!mode) {
    sendScout({
      ts: Date.now(),
      pending: false,
      tips: rivals.map((rival) => ({
        profileId: rival.profileId,
        name: rival.name,
        modeUnavailable: true,
        modePending: leaderboardOf(state) == null,
      })),
    });
    return;
  }

  scoutFetching = true;
  const startedAt = Date.now();
  // Un hueco por rival: en TG se consultan en paralelo y cada uno publica su
  // consejo apenas está, sin esperar al anterior.
  const tips = rivals.map((rival) => ({ profileId: rival.profileId, name: rival.name, loading: true }));
  const publish = () => {
    const current = lastGood;
    const currentSig = scoutSignature(current);
    const currentView = viewConfig();
    if (!current || current.status !== 'ongoing' || currentSig !== sig ||
        (!currentView.smartTips && !currentView.civRecommender && !currentView.civCounterPick)) return;
    const ready = tips.filter(Boolean);
    sendScout({
      ts: Date.now(),
      pending: ready.some((item) => item.loading || item.provisional),
      tips: ready.map((item) => ({ ...item })),
    });
  };
  try {
    sendScout({
      ts: Date.now(),
      pending: true,
      tips: rivals.map((rival) => ({ profileId: rival.profileId, name: rival.name, loading: true })),
    });
    await Promise.all(rivals.map(async (rival, index) => {
      let tip;
      try {
        const matchupContext = {
          matchId: state.match?.matchId,
          cutoff: historyCutoff(state),
          historical: Boolean(state.example),
          ownCiv: (state.players || []).find((player) => player.isYou || Number(player.profileId) === Number(runtimeProfileId()))?.civ,
          rivalCiv: rival.civ || (state.players || []).find((player) => Number(player.profileId) === Number(rival.profileId))?.civ,
        };
        const scoutOptions = {
        profileId: rival.profileId,
        name: rival.name,
        mode,
        mapName,
        cache: statsCache,
        cacheTtlMs: 30 * 60 * 1000,
        recommend: Boolean(view.civCounterPick),
        matchupContext,
        opportunityContext: view.smartTips ? {
          ...matchupContext,
          currentMatchId: state.match && state.match.matchId,
          cutoff: historyCutoff(state),
        } : null,
        myHistoryImpl: (view.smartTips || view.civCounterPick) && runtimeProfileId()
          ? () => fetchMyHistory({
              profileId: runtimeProfileId(),
              leaderboardId: leaderboardOf(state),
              currentMatchId: state.match && state.match.matchId,
              cache: statsCache,
              cacheTtlMs: 30 * 60 * 1000,
              log,
            })
          : null,
          log,
        };
        // Primera lectura pequeña y análisis completo en paralelo. Nunca se
        // reemplaza el análisis completo con una respuesta corta tardía.
        tip = await progressiveScout(scoutOptions, (initial) => {
          tips[index] = initial;
          publish();
        });
      } catch (err) {
        // Un rival que falla no puede trabar la barra ni tapar al otro.
        log(`no pude armar el consejo de ${rival.name}: ${err.message}`);
        tips[index] = { profileId: rival.profileId, name: rival.name, error: err.message };
        publish();
        return;
      }
      tips[index] = tip;
      publish();
      log(
        `consejo pre-partida de ${rival.name} listo en ${Date.now() - startedAt}ms · ` +
          `${tip.totalMatches} replays del modo`,
      );
    }));
  } catch (err) {
    log(`no pude armar el consejo pre-partida: ${err.message}`);
  } finally {
    scoutFetching = false;
    if (scoutQueuedSig && scoutQueuedSig !== scoutSig) {
      scoutQueuedSig = null;
      scoutSig = '';
      refreshScoutTips(lastGood).catch(() => {});
    } else {
      scoutQueuedSig = null;
      maybeArmPreviewAutoHide();
    }
  }
}

/* -------------------------------------------------------------------------
 * HEAD-TO-HEAD (opción `rivalH2H`)
 *
 * Tu V-D contra cada rival, del PROPIO historial (src/mine.js). La descarga
 * de tu historial se comparte con la civ recomendada y queda en cache 30 min,
 * así que habilitar las dos opciones no duplica la consulta.
 *
 * En modo ejemplo "vos" es el perfil del ejemplo (misma regla que isYou):
 * el panel muestra cómo se vería contra los rivales de ESA partida.
 *
 * El resultado NO se guarda en el informe (que se republish por partes y lo
 * pisaría): va a `h2hByRival` y sendRival() lo inyecta en cada payload. Los
 * datos son de la partida actual: clearRivalReports() los descarta cuando
 * cambia la partida, igual que el resto del informe.
 * ---------------------------------------------------------------------- */

/** Perfil del que sale MI historial: el del ejemplo si está activo, el real si no. */
function runtimeProfileId() {
  return exampleActive && exampleProfileId ? exampleProfileId : profileId;
}

async function refreshH2H(state, options = {}) {
  const view = viewConfig();
  if (DEMO) return; // las capturas usan los datos demo del informe
  const myId = runtimeProfileId();
  if (!view.rivalH2H || !state || state.status !== 'ongoing' || !myId) return;

  const rivals = opponentsOf(state, RIVAL_LIMIT);
  if (!rivals.length) return;

  const matchId = (state.match && state.match.matchId) || 'sin-id';
  const mode = resolveMode(leaderboardOf(state));
  if (!mode) {
    for (const rival of rivals) h2hByRival.set(rival.profileId, { modeUnavailable: true, modePending: leaderboardOf(state) == null });
    sendRival(rivalReports);
    return;
  }
  const sig = `${matchId}:${mode ? mode.id : 'sin-modo'}:${rivals
    .map((rival) => rival.profileId)
    .join(',')}`;
  if (!options.force && sig === h2hSig) return;
  if (h2hFetching) {
    h2hQueuedSig = sig;
    return;
  }
  h2hSig = sig;

  h2hFetching = true;
  const startedAt = Date.now();
  try {
    for (const rival of rivals) {
      h2hByRival.delete(rival.profileId);
      h2hPendingIds.add(rival.profileId);
    }
    // El marcador "buscando…" viaja re-enviando el payload actual decorado.
    sendRival(rivalReports);

    const mine = await fetchMyHistory({
      profileId: myId,
      leaderboardId: leaderboardOf(state),
      currentMatchId: state.match && state.match.matchId,
      cache: statsCache,
      cacheTtlMs: 30 * 60 * 1000,
      log,
    });
    const current = lastGood;
    const currentMode = resolveMode(leaderboardOf(current));
    const currentSig = `${(current && current.match && current.match.matchId) || 'sin-id'}:${currentMode ? currentMode.id : 'sin-modo'}:${opponentsOf(current, RIVAL_LIMIT).map((rival) => rival.profileId).join(',')}`;
    if (!current || current.status !== 'ongoing' || !viewConfig().rivalH2H ||
        runtimeProfileId() !== myId || currentSig !== sig) return;
    const cutoff = historyCutoff(state);
    const priorRows = state.example ? (cutoff == null ? [] : mine.rows.filter((row) =>
      isPriorReplay(row, state.match?.matchId, cutoff))) : mine.rows;
    for (const rival of rivals) {
      // Siempre se publica, incluso sin enfrentamientos: `scanned` le dice al
      // panel en cuántas partidas se buscó, para que "no apareció" no se lea
      // como "nunca jugaron" a secas.
      const h2h = mine.error ? { error: mine.error } : computeH2H(priorRows, rival.profileId);
      h2h.scanned = priorRows.length;
      h2hByRival.set(rival.profileId, h2h);
      h2hPendingIds.delete(rival.profileId);
    }
    sendRival(rivalReports);
    log(
      `head-to-head listo en ${Date.now() - startedAt}ms · ` +
        rivals
          .map((rival) => {
            const h2h = h2hByRival.get(rival.profileId);
            return `${rival.name}: ${h2h ? `${h2h.wins}-${h2h.losses}` : 'sin datos'}`;
          })
          .join(' · '),
    );
  } catch (err) {
    log(`no pude armar el head-to-head: ${err.message}`);
  } finally {
    for (const rival of rivals) h2hPendingIds.delete(rival.profileId);
    h2hFetching = false;
    if (h2hQueuedSig && h2hQueuedSig !== h2hSig) {
      h2hQueuedSig = null;
      h2hSig = '';
      refreshH2H(lastGood).catch(() => {});
    } else {
      h2hQueuedSig = null;
      maybeArmPreviewAutoHide();
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
    tray.setToolTip('Relic');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Relic v${app.getVersion()}`, enabled: false },
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

let lastAutoDetectRetryAt = 0;
let manuallyHiddenByHotkey = false;
let gameWindowWatcher = null;
let minimizeController = null;
let activePreviewHighlight = null;
let previewHighlightSeq = 0;

function sendPreviewHighlight(feature = null) {
  activePreviewHighlight = feature
    ? { feature: String(feature), seq: ++previewHighlightSeq }
    : null;
  send('overlay:highlight', activePreviewHighlight);
}

function syncAutoStartWithWindows(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged || DEV_SESSION) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: Boolean(enabled) ? ['--autostart'] : [],
    });
    log(`inicio automático con Windows: ${enabled ? 'activado (--autostart)' : 'desactivado'}`);
  } catch (err) {
    log(`no se pudo configurar inicio con Windows: ${err.message}`);
  }
}

function initMinimizeWatcher() {
  if (!minimizeController) {
    minimizeController = createMinimizeController({
      delayMs: 5000,
      canHide: () => Boolean(
        win && !win.isDestroyed() &&
        !DEMO && !SHOT && !EXAMPLE_QUERY && !FAKE_FOUND &&
        !exampleActive &&
        !postMatchPreviewActive &&
        !moving &&
        !(trainingController && trainingController.liveOverlayState?.testActive) &&
        !manuallyHiddenByHotkey,
      ),
      onHide: (reason) => {
        if (win && !win.isDestroyed() && win.isVisible()) {
          win.hide();
          log(reason === 'not-running'
            ? 'overlay oculto automáticamente: Age of Empires II: DE cerrado'
            : 'overlay oculto automáticamente: AoE2 minimizado por más de 5s');
        }
      },
      onShow: () => {
        if (win && !win.isDestroyed() && !manuallyHiddenByHotkey) {
          win.setAlwaysOnTop(true, 'screen-saver');
          win.showInactive();
          log('overlay visible automáticamente: Age of Empires II: DE detectado activo');
        }
      },
    });
  }
  const wantMin = Boolean(config.hideWhenMinimized) && !DEMO && !SHOT && !EXAMPLE_QUERY && !FAKE_FOUND;
  const wantGameOnly = (config.onlyWhenGameRunning !== false) && !DEMO && !SHOT && !EXAMPLE_QUERY && !FAKE_FOUND;
  const wanted = wantMin || wantGameOnly;
  minimizeController.setRules({
    hideWhenMinimized: wantMin,
    hideWhenNotRunning: wantGameOnly,
  });
  if (wanted) {
    if (!gameWindowWatcher) {
      gameWindowWatcher = new GameWindowWatcher({
        ownPid: process.pid,
        log,
        onState: (state) => {
          if (minimizeController) minimizeController.updateState(state);
        },
      });
    }
    gameWindowWatcher.start();
  } else if (gameWindowWatcher) {
    gameWindowWatcher.stop();
  }
}

function toggleOverlay() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    manuallyHiddenByHotkey = true;
    win.hide();
    log('overlay oculto (Ctrl+Alt+E para volver)');
  } else {
    manuallyHiddenByHotkey = false;
    if (minimizeController) minimizeController.cancelAndShow();
    win.setAlwaysOnTop(true, 'screen-saver');
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

const TRUSTED_APP_HTML_URLS = new Set(
  ['index.html', 'settings.html'].map((name) => {
    try {
      return require('node:url').pathToFileURL(path.join(__dirname, name)).href.toLowerCase();
    } catch {
      return '';
    }
  }).filter(Boolean)
);

function isTrustedAppFileUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'file:') return false;
    const base = `${u.protocol}//${u.host}${u.pathname}`.toLowerCase();
    return TRUSTED_APP_HTML_URLS.has(base);
  } catch {
    return false;
  }
}

function isTrustedIpcEvent(event) {
  if (!event || !event.sender) return false;
  const senderId = event.sender.id;
  const knownIds = [];
  if (win && !win.isDestroyed() && win.webContents) knownIds.push(win.webContents.id);
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents) knownIds.push(settingsWin.webContents.id);
  if (!knownIds.includes(senderId)) return false;
  const frameUrl = (event.senderFrame && event.senderFrame.url) || (typeof event.sender.getURL === 'function' ? event.sender.getURL() : '');
  return isTrustedAppFileUrl(frameUrl);
}

const hardenedSessions = new WeakSet();
function hardenWebContents(wc) {
  if (!wc) return;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Seguridad (M-04): bloquear navegación fuera de los archivos HTML propios de la app.
  wc.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedAppFileUrl(targetUrl)) {
      log(`[seguridad] navegación bloqueada: ${String(targetUrl || '').slice(0, 120)}`);
      event.preventDefault();
    }
  });
  // Seguridad (M-04): denegar por defecto permisos de cámara, micrófono, geolocalización, etc.
  if (wc.session && !hardenedSessions.has(wc.session)) {
    hardenedSessions.add(wc.session);
    try {
      wc.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      wc.session.setPermissionCheckHandler(() => false);
    } catch { /* ignore */ }
  }
  if (app.isPackaged) {
    wc.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      if (key === 'f12' || ((input.control || input.meta) && input.shift && ['i', 'j', 'c'].includes(key))) {
        event.preventDefault();
      }
    });
  }
}

/**
 * Compensa suavemente el escalado DPI de Windows (125%, 150%, 175%, 200%)
 * para que la app no se vea gigante ni desborde en pantallas con Zoom activo.
 * A 100% (scaleFactor === 1) devuelve 1.0 exacto sin alterar nada.
 */
function computeAdaptiveZoom(display, kind = 'settings') {
  const sf = Number(display && display.scaleFactor) || 1;
  const wa = (display && display.workArea) || { width: 1920, height: 1080 };
  if (kind === 'settings') {
    // El Centro de Mando es una ventana de escritorio estándar: Chromium ya
    // aplica el escalado DPI nativo de Windows (125%–200%). Reducirlo a 0.76x
    // en monitores 1440p/4K dejaba el texto minúsculo y la barra lateral
    // desproporcionada. Solo se reduce si el área lógica real es muy chica
    // (notebooks 1366×768 con zoom alto).
    if (wa.width >= 1180 && wa.height >= 700) return 1;
    const fitH = wa.height / 760;
    const fitW = wa.width / 1200;
    return Math.round(clamp(Math.min(fitH, fitW), 0.78, 1) * 100) / 100;
  }
  let zoom = 1;
  if (sf > 1.02) {
    zoom = Math.max(0.74, 1 / Math.pow(sf, 0.62));
  }
  return Math.round(clamp(zoom, 0.72, 1) * 100) / 100;
}

function getWindowDisplay(targetWin) {
  try {
    if (targetWin && !targetWin.isDestroyed()) {
      return screen.getDisplayMatching(targetWin.getBounds());
    }
  } catch { /* fallback primary */ }
  return screen.getPrimaryDisplay();
}

function applyAdaptiveZoom(targetWin, kind = 'settings') {
  if (!targetWin || targetWin.isDestroyed()) return 1;
  const display = getWindowDisplay(targetWin);
  const zoom = computeAdaptiveZoom(display, kind);
  try {
    const p = targetWin.webContents.setVisualZoomLevelLimits(1, 1);
    if (p && typeof p.catch === 'function') p.catch(() => {});
    if (Math.abs(targetWin.webContents.getZoomFactor() - zoom) > 0.01) {
      targetWin.webContents.setZoomFactor(zoom);
    }
  } catch { /* ventana cerrándose */ }
  return zoom;
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const initialZoom = computeAdaptiveZoom(primaryDisplay, 'overlay');
  const maxW = Math.max(320, primaryDisplay.workArea.width - 32);
  const width = Math.min(maxW, Math.round(config.width * Number(config.scale || 1) * initialZoom));
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
    icon: WINDOW_ICON,
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
      sandbox: true,
      devTools: !app.isPackaged,
      backgroundThrottling: true,
    },
  });
  hardenWebContents(win.webContents);
  win.on('show', () => {
    try { if (win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(false); } catch { /* ignore */ }
  });
  win.on('hide', () => {
    try { if (win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(true); } catch { /* ignore */ }
  });
  applyAdaptiveZoom(win, 'overlay');
  win.webContents.on('did-finish-load', () => applyAdaptiveZoom(win, 'overlay'));
  win.on('moved', () => {
    applyAdaptiveZoom(win, 'overlay');
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
    if (minimizeController && minimizeController.shouldSuppressShow()) {
      minimizeController.markSuppressedAtBoot();
      log('overlay en espera silenciosa: se mostrará automáticamente al abrir Age of Empires II: DE');
    } else {
      win.showInactive();
    }

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
            "(() => { const dot = document.querySelector('.dot'); return dot ? getComputedStyle(dot).backgroundColor : null; })()",
          );
          if (dotColor) log(`color computado del punto de equipo: ${dotColor}`);
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

  const wa = screen.getPrimaryDisplay().workArea;
  const initWidth = Math.min(1480, Math.max(980, wa.width - 48));
  const initHeight = Math.min(940, Math.max(660, wa.height - 48));
  const minW = Math.min(920, Math.max(760, wa.width - 24));
  const minH = Math.min(600, Math.max(480, wa.height - 24));

  const initTheme = effectiveTheme();
  settingsWin = new BrowserWindow({
    width: initWidth,
    height: initHeight,
    minWidth: minW,
    minHeight: minH,
    title: 'Relic',
    icon: WINDOW_ICON,
    backgroundColor: isUltraTheme(initTheme) ? '#000000' : '#0c1014',
    autoHideMenuBar: true,
    show: false,
    // Sin barra nativa de Windows: la ventana dibuja su propia barra oscura
    // con minimizar / maximizar / cerrar, a juego con el overlay.
    frame: false,
    hasShadow: true,
    // Ventana normal de escritorio: no bloquea navegadores (ej. login Google) ni otras ventanas detrás.
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  hardenWebContents(settingsWin.webContents);
  applyAdaptiveZoom(settingsWin, 'settings');
  settingsWin.webContents.on('did-finish-load', () => applyAdaptiveZoom(settingsWin, 'settings'));
  settingsWin.on('moved', () => applyAdaptiveZoom(settingsWin, 'settings'));
  if (process.platform === 'win32' && typeof settingsWin.setIcon === 'function') {
    try { settingsWin.setIcon(WINDOW_ICON); } catch {}
  }

  settingsWin.setMenuBarVisibility(false);

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
  settingsWin.loadFile(path.join(__dirname, 'settings.html'), { query: { theme: initTheme } });
  settingsWin.webContents.on('did-fail-load', (_event, code, description) =>
    log(`la configuración no cargó: ${description} (${code})`),
  );
  settingsWin.webContents.on('render-process-gone', (_event, details) => {
    log(`la configuración se cerró: ${details.reason}`);
    diagnosticReporter.report({
      kind: 'crash',
      fingerprint: `renderer:settings:${details.reason || 'gone'}`,
      summary: `Ventana principal cerrada inesperadamente (${details.reason || 'gone'})`,
    }).catch(() => {});
  });
  settingsWin.on('unresponsive', () => {
    log('ventana de configuración sin responder (unresponsive)');
    diagnosticReporter.report({
      kind: 'crash',
      fingerprint: 'renderer:settings:unresponsive',
      summary: 'Ventana principal congelada (unresponsive)',
    }).catch(() => {});
  });
  settingsWin.on('responsive', () => {
    log('ventana de configuración volvió a responder');
  });
  settingsWin.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2 && message) {
      log(`[config:err] ${message} (${sourceId || ''}:${line || 0})`);
    }
  });

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
    if (exampleActive && exampleUseRealConfig) {
      stopExample();
    }
  });

  return settingsWin;
}

let configSaveTimer = null;
let configDirty = false;
let configSaving = false;

function serializeConfigForDisk() {
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    current = {};
  }
  return `${JSON.stringify({ ...DEFAULT_CONFIG, ...current, ...config }, null, 2)}\n`;
}

async function flushConfigAsync() {
  configSaveTimer = null;
  if (!configDirty || configSaving) return;
  configSaving = true;
  configDirty = false;
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    let current = {};
    try {
      current = JSON.parse(await fs.promises.readFile(CONFIG_PATH, 'utf8'));
    } catch {
      current = {};
    }
    const next = `${JSON.stringify({ ...DEFAULT_CONFIG, ...current, ...config }, null, 2)}\n`;
    const tmp = `${CONFIG_PATH}.tmp`;
    await fs.promises.writeFile(tmp, next);
    await fs.promises.rename(tmp, CONFIG_PATH);
  } catch (err) {
    log(`no pude guardar la config: ${err.message}`);
  } finally {
    configSaving = false;
    if (configDirty && !configSaveTimer) {
      configSaveTimer = setTimeout(() => { flushConfigAsync().catch(() => {}); }, 250);
      if (configSaveTimer.unref) configSaveTimer.unref();
    }
  }
}

function flushConfigSync() {
  clearTimeout(configSaveTimer);
  configSaveTimer = null;
  if (!configDirty) return;
  configDirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, serializeConfigForDisk());
  } catch (err) {
    log(`no pude guardar la config: ${err.message}`);
  }
}

/** Guarda opciones en config.json (asíncrono con debounce) y las aplica en memoria al instante. */
function persistConfig(patch) {
  Object.assign(config, patch);
  configDirty = true;
  clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(() => { flushConfigAsync().catch(() => {}); }, 250);
  if (configSaveTimer.unref) configSaveTimer.unref();
}

/** Guarda profileId en el config (null = volver a detección automática). */
function persistProfile(value) {
  persistConfig({ profileId: value == null ? null : Number(value) });
}

/** Aplica un perfil nuevo en caliente, sin reiniciar la app. */
function setRuntimeProfile(nextProfileId, alias) {
  const prevPid = profileId;
  profileId = Number(nextProfileId);
  playerAlias = alias || null;
  // Limpieza selectiva: invalidar cachés dependientes del perfil propio SIN borrar
  // el caché persistido de replays de rivales (`scout:rows:v2:...`).
  for (const key of [...statsCache.keys()]) {
    const k = String(key);
    if (
      k.startsWith('mine:') ||
      k.startsWith('rival:') ||
      k.startsWith('h2h:') ||
      k.startsWith('central:') ||
      k.startsWith('smurf:') ||
      (prevPid != null && k === `elo1v1:${prevPid}`)
    ) {
      statsCache.delete(key);
    }
  }
  // El informe visible pertenece al perfil anterior; el historial local queda
  // separado por perfil y se puede volver a consultar.
  postMatchReport = null;
  postMatchGeneration += 1;
  clearPostMatchHide();
  postMatchMatch = null;
  postMatchLastId = null;
  broadcastPostMatch();
  lastSent = '';
  lastGood = null;
  clearRivalReports();
  clearScoutTips();
  intro = null;
  clearTimeout(introTimer);
  syncIntro(null, { force: true });
  if (!DEV_SESSION) syncRemoteLicense('profile-selected').catch(() => {});
  refreshAccessPresentation();
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
      // Una partida real SIEMPRE tiene prioridad sobre cualquier vista previa o ejemplo.
      if (exampleActive) {
        clearPreviewAutoHide();
        deactivateExample();
      }
      const at = Date.now();
      liveMatchAt = at;
      preMatchGraceUntil = at + 20000;
      if (win && !win.isDestroyed() && !manuallyHiddenByHotkey) {
        if (minimizeController) minimizeController.cancelAndShow();
        win.setAlwaysOnTop(true, 'screen-saver');
        if (!win.isVisible()) win.showInactive();
      }
      // El carril rápido SIGUE sondeando: este aviso llega antes que el
      // roster, y es justamente el snapshot global el que lo trae en ~1,5 s.
      // Pausarlo acá dejaba el roster a merced del lote empujado (~15 s).
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
      // Si el servidor mandó `reason:'matched'` huérfano (sin `queueingAdded` en el mismo lote),
      // pedimos un snapshot global coalescido a los 2,5 s para rescatar el roster sin esperar 15 s.
      clearTimeout(pendingRosterTimer);
      pendingRosterTimer = setTimeout(async () => {
        pendingRosterTimer = null;
        if (!queueWatcher || !queueWatcher.awaitingRoster || queueWatcher.matched) return;
        const snap = await readSnapshot({ handler: 'queueing', language: 'en' }).catch(() => null);
        if (queueWatcher && snap && snap.length) {
          queueWatcher.mergeFastLaneEvents(snap, { filtered: false });
        }
        if (queueWatcher && queueWatcher.awaitingRoster && !queueWatcher.matched) {
          poll().then((next) => scheduleNext(next)).catch(() => {});
        }
      }, 2500);
    },
    onMatched: (item) => {
      clearTimeout(pendingRosterTimer);
      pendingRosterTimer = null;
      queueEndedBurstUntil = 0;
      if (exampleActive) {
        clearPreviewAutoHide();
        deactivateExample();
      }
      liveMatchAt = Date.now();
      preMatchGraceUntil = liveMatchAt + 20000;
      if (win && !win.isDestroyed() && !manuallyHiddenByHotkey) {
        if (minimizeController) minimizeController.cancelAndShow();
        win.setAlwaysOnTop(true, 'screen-saver');
        if (!win.isVisible()) win.showInactive();
      }
      if (fastLane) {
        fastLane.pause(item && (item.matchId ?? item.id), {
          inLobby: true,
          matchedAt: item && item.matchedAt,
          preQueueIds: queueWatcher ? queueWatcher.preMatchQueueIds : null,
        });
      }
      showMatchFound(item);
    },
    onGone: (id, meta = {}) => {
      clearTimeout(pendingRosterTimer);
      pendingRosterTimer = null;
      const isRequeued = Boolean(meta && meta.reason === 'requeued');
      if (isRequeued) {
        log(`partida apareada ${id} caída/cancelada (vuelta a cola): limpio el panel y busco partida nueva`);
        liveMatchAt = 0;
        lobbyGoneAt = 0;
        preMatchGraceUntil = 0;
        lastOngoingAt = 0;
        clearTimeout(eloRetryTimer);
        eloRetryTimer = null;
        searching = true;
        // Si el panel seguía mostrando a los jugadores de la sala caída, limpiarlo al instante.
        if (lastGood && lastGood.status === 'ongoing' && lastGood.phase === 'lobby') {
          emit({
            status: 'idle',
            lastMatch: lastGood.lastMatch || null,
            checkedAt: Date.now(),
          });
        }
        if (fastLane) fastLane.resume();
        scheduleNext('idle');
        return;
      }
      log(`partida apareada ${id} terminó/canceló: toma el control el REST`);
      liveMatchAt = 0;
      lobbyGoneAt = Date.now();
      preMatchGraceUntil = lobbyGoneAt + 22000;
      if (fastLane) fastLane.resume();
      scheduleNext('idle');
      poll();
    },
    onSearching: (active, queueItem) => {
      searching = active;
      log(active ? 'estás buscando partida (cola detectada) · polling acelerado' : 'cola finalizada');
      // Volviste a la cola: si el carril quedó pausado (aviso de fin perdido),
      // se reactiva sin esperar a que se reinicie la app.
      if (active && fastLane) fastLane.resume();
      // Cuando la cola informa una ladder conocida, precalentar el historial
      // propio mientras se busca rival. No adivinar el modo si no está.
      const mode = active && queueItem ? resolveMode(queueItem.leaderboard ?? queueItem.leaderboardId) : null;
      if (mode && ['rm_1v1', 'rm_team', 'ew_1v1', 'ew_team', 'dm_1v1', 'dm_team'].includes(mode.key) &&
          (viewConfig().rivalH2H || viewConfig().civRecommender || viewConfig().civCounterPick)) {
        fetchMyHistory({ profileId, leaderboardId: mode.id, cache: statsCache,
          cacheTtlMs: 30 * 60 * 1000, log }).catch((err) => log(`precarga de historial: ${err.message}`));
      }
      if (active) {
        queueEndedBurstUntil = 0;
        scheduleNext('idle');
      } else if (!lobbyActive()) {
        // La cola desapareció sin sala apareada: puede haber arrancado una partida cuyo
        // evento `matched` no llegó al feed WS. Aceleramos REST 20 s para capturarla rápido.
        queueEndedBurstUntil = Date.now() + 20000;
        scheduleNext('idle');
      }
    },
  });
  queueWatcher.start();

  // Carril rápido: pide snapshots coalescidos (Frame 1 + Frame 2) cada 1,5 s mientras
  // estás en cola y los mezcla de forma NO destructiva sobre QueueWatcher (sin borrar
  // el mapa global ni `ownQueueIds` del socket persistente).
  fastLane = new FastLane({
    profileId,
    log,
    isDismissedMatch: (id) => Boolean(queueWatcher && queueWatcher.isMatchDismissed(id)),
    isGlobalHealthy: () => Boolean(queueWatcher && queueWatcher.isHealthy),
    onRequeued: (queueItem, droppedMatchId) => {
      if (queueWatcher) queueWatcher.handleRequeueFromFastLane(queueItem, droppedMatchId);
    },
    onSnapshot: (events, meta) => {
      if (queueWatcher) queueWatcher.mergeFastLaneEvents(events, meta);
    },
    onQueue: (active, queueItem) => {
      if (active && queueItem && queueWatcher) {
        queueWatcher.recordQueueIdFromFastLane(queueItem);
      }
      if (active === searching) return;
      searching = active;
      log(
        active
          ? 'estás buscando partida (carril rápido) · polling acelerado'
          : 'cola finalizada (carril rápido)',
      );
      if (active) {
        queueEndedBurstUntil = 0;
        const mode = queueItem ? resolveMode(queueItem.leaderboard ?? queueItem.leaderboardId) : null;
        if (mode && ['rm_1v1', 'rm_team', 'ew_1v1', 'ew_team', 'dm_1v1', 'dm_team'].includes(mode.key) &&
            (viewConfig().rivalH2H || viewConfig().civRecommender || viewConfig().civCounterPick)) {
          fetchMyHistory({ profileId, leaderboardId: mode.id, cache: statsCache,
            cacheTtlMs: 30 * 60 * 1000, log }).catch((err) => log(`precarga de historial: ${err.message}`));
        }
        scheduleNext('idle');
      } else if (!lobbyActive()) {
        queueEndedBurstUntil = Date.now() + 20000;
        scheduleNext('idle');
      }
    },
  });
  fastLane.start();

  // Secundario: salas personalizadas.
  liveWatcher = new LobbyWatcher({
    profileId,
    log,
    onLobby: (lobby) => {
      // Si ya hay match de ranked, ese manda: no lo pisa una sala ajena.
      if (matchFoundActive()) return;
      if (exampleActive) {
        clearPreviewAutoHide();
        deactivateExample();
      }
      liveLobbyAt = Date.now();
      showLobby(lobby);
    },
    onLobbyGone: () => {
      liveLobbyAt = 0;
      if (fastLane) fastLane.resume();
      poll();
    },
  });
  liveWatcher.start();
  startSavegameWatchers();
}

let savegameWatchers = [];
let savegamePollTimer = null;
let lastSavegameTriggerAt = 0;
let pendingRosterTimer = null;
let savegameBurstUntil = 0;
let queueEndedBurstUntil = 0;
let pendingSavegamePoll = false;

function stopSavegameWatchers() {
  if (savegamePollTimer) {
    clearTimeout(savegamePollTimer);
    savegamePollTimer = null;
  }
  for (const w of savegameWatchers) {
    try { w.close(); } catch { /* ignore */ }
  }
  savegameWatchers = [];
}

function startSavegameWatchers() {
  stopSavegameWatchers();
  if (DEMO || NO_PROFILE) return;
  let accounts = [];
  try {
    accounts = listAccounts();
  } catch {
    return;
  }
  const seenDirs = new Set();
  for (const acc of accounts.slice(0, 4)) {
    const dir = acc && acc.dir ? path.join(acc.dir, 'savegame') : null;
    if (!dir || seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    try {
      if (!fs.existsSync(dir)) continue;
      const watcher = fs.watch(dir, { persistent: false }, (_eventType, filename) => {
        if (!filename || !/\.aoe2record$/i.test(String(filename))) return;
        if (exampleActive || DEMO || !profileId) return;
        const now = Date.now();
        // Al escribirse un .aoe2record el juego acaba de iniciar o cerrar partida:
        // mantenemos ráfaga REST cada 2 s durante 35 s para no esperar 10 s si Companion tarda en indexar.
        savegameBurstUntil = now + 35000;
        if (now - lastSavegameTriggerAt < 4000) return;
        clearTimeout(savegamePollTimer);
        savegamePollTimer = setTimeout(() => {
          savegamePollTimer = null;
          if (exampleActive || DEMO || !profileId) return;
          if (polling) {
            pendingSavegamePoll = true;
            return;
          }
          lastSavegameTriggerAt = Date.now();
          log(`savegame detectado (${filename}): adelantando poll en vivo`);
          poll().then((next) => scheduleNext(next)).catch(() => {});
        }, 500);
      });
      watcher.on('error', () => {
        try { watcher.close(); } catch { /* ignore */ }
      });
      savegameWatchers.push(watcher);
    } catch {
      /* carpeta savegame no accesible; Companion WS/REST sigue como fallback */
    }
  }
}

function stopLive() {
  clearTimeout(pendingRosterTimer);
  pendingRosterTimer = null;
  savegameBurstUntil = 0;
  queueEndedBurstUntil = 0;
  pendingSavegamePoll = false;
  stopSavegameWatchers();
  if (liveWatcher) liveWatcher.stop();
  if (queueWatcher) queueWatcher.stop();
  if (fastLane) fastLane.stop();
  liveWatcher = null;
  queueWatcher = null;
  fastLane = null;
  liveLobbyAt = 0;
  liveMatchAt = 0;
  searching = false;
  preMatchGraceUntil = 0;
}

function matchFoundActive() {
  // Cuenta también el aviso "encontré rival" mientras llega el roster: si no,
  // el polling podía tapar el cartel con "Sin partida" a los 20 s.
  return Boolean(
    queueWatcher &&
      (queueWatcher.matched || queueWatcher.awaitingRoster) &&
      Date.now() - liveMatchAt < 15 * 60 * 1000,
  );
}

/** Hay pre-partida activa (match de ranked o sala custom). */
function lobbyActive() {
  return matchFoundActive() || Boolean(liveWatcher && liveWatcher.lobby && Date.now() - liveLobbyAt < 15 * 60 * 1000);
}

/**
 * Cuánto hace que el SERVIDOR marcó la partida (campo `matchedAt` del feed).
 * Sirve para medir la latencia de punta a punta en el log: cuánto se tardó en
 * pasar del hecho (el juego armó la partida) a los datos en pantalla.
 */
function serverMatchedLag(item) {
  const serverAt = Date.parse((item && item.matchedAt) || '');
  return Number.isFinite(serverAt) ? Math.max(0, Date.now() - serverAt) : null;
}

// Reintento del ELO si el backend falla justo cuando aparece la partida. Un
// solo fallo dejaba el panel en `…` hasta el inicio de la partida.
let eloRetryTimer = null;
let eloRetryKey = '';
let eloRetryCount = 0;
const ELO_RETRY_MS = 1500;
const ELO_RETRY_MAX = 3;

function scheduleEloRetry(matchId, item) {
  const key = String(matchId ?? '');
  if (!key) return;
  if (eloRetryKey !== key) {
    eloRetryKey = key;
    eloRetryCount = 0;
  }
  clearTimeout(eloRetryTimer);
  eloRetryTimer = null;
  if (eloRetryCount >= ELO_RETRY_MAX) return;
  eloRetryTimer = setTimeout(() => {
    eloRetryTimer = null;
    if (exampleActive || !lobbyActive()) return;
    eloRetryCount += 1;
    log(`ELO RM 1v1: reintento ${eloRetryCount}/${ELO_RETRY_MAX} de la consulta`);
    showMatchFound(item);
  }, ELO_RETRY_MS);
}

/** Dibuja el roster en el mismo instante en que el juego encontró partida. */
async function showMatchFound(item) {
  const startedAt = Date.now();
  const serverLag = serverMatchedLag(item);
  const itemMatchId = item && (item.matchId ?? item.id);
  const isStaleMatch = () =>
    Boolean(
      queueWatcher &&
        itemMatchId != null &&
        (queueWatcher.isMatchDismissed(itemMatchId) ||
          (queueWatcher.matched &&
            queueWatcher.matched.matchId != null &&
            item &&
            item.matchId != null &&
            String(queueWatcher.matched.matchId) !== String(item.matchId))),
    );
  if (isStaleMatch()) return;
  try {
    const snapshot = await buildSnapshotFromMatch(item, {
      profileId,
      cache: statsCache,
      cacheTtlMs: Number(config.statsCacheMinutes || 15) * 60 * 1000,
      onPartial: (partial) => {
        if (isStaleMatch()) return;
        if (emit(partial)) {
          log(
            `PARTIDA ENCONTRADA · roster en pantalla en ${Date.now() - startedAt}ms ` +
              `(${partial.players.length} jugadores, ${partial.match.mapName}) · pidiendo ELO RM 1v1` +
              (serverLag == null ? '' : ` · el servidor la marcó hace ${serverLag}ms`),
          );
        }
      },
    });
    if (isStaleMatch()) return;
    if (emit(snapshot)) {
      const roster = snapshot.players
        .map((p) => `${p.name}${p.isYou ? '*' : ''} ${p.rating ?? '—'}/${p.peak ?? '—'}`)
        .join(' · ');
      log(
        `PRE-PARTIDA · ${snapshot.match.mapName} · ${snapshot.ladder.label} · ELO RM 1v1 · ` +
          `completo en ${Date.now() - startedAt}ms` +
          (serverLag == null ? '' : ` (servidor→pantalla ${serverLag}ms)`) +
          ` · ${roster}`,
      );
    }
    // Si el backend de ELO falló, se reintenta sin esperar al próximo poll.
    if (snapshot.statsError && !isStaleMatch()) {
      log(`ELO RM 1v1 no llegó (${snapshot.statsError}): reintento en ${ELO_RETRY_MS}ms`);
      scheduleEloRetry(snapshot.match.matchId, item);
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
  if (exampleActive) {
    postMatchGeneration += 1;
    postMatchReport = null;
    postMatchMatch = null;
    postMatchLastId = null;
    clearPostMatchHide();
    broadcastPostMatch();
  }
  exampleActive = false;
  exampleInfo = null;
  exampleFrozenAt = null;
  exampleProfileId = null;
  exampleMatch = null;
  exampleName = null;
  exampleClockMode = '3';
  exampleUseRealConfig = false;
  examplePreviewPhase = null;
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
  sendPreviewHighlight(null);
  syncIntro(null, { force: true }); // ELO visible de nuevo, ayuda oculta
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings:clock', null);
  }
  broadcastExample();
  if (minimizeController) minimizeController.recheck();
}

async function startExample(rawQuery, clockMode = '3', options = {}) {
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
    exampleUseRealConfig = Boolean(options.useRealConfig);
    examplePreviewPhase = options.previewPhase || null;
    exampleProfileId = resolved.profileId;
    exampleName = resolved.name;
    exampleClockMode = mode;
    exampleFrozenAt = mode === 'live' ? null : began;

    // Una partida puntual (--example-match) evita depender de cuál fue la última.
    const explicitMatch = EXAMPLE_MATCH_ID ? await fetchMatchById(EXAMPLE_MATCH_ID) : null;
    if (token !== exampleToken) return { ok: false, error: 'Otra prueba reemplazó a esta.' };

    const snapshot = await buildExampleSnapshot({
      profileId: resolved.profileId,
      cache: statsCache,
      cacheTtlMs: EXAMPLE_CACHE_TTL(),
      now: clockNow(),
      clockOffsetMs: EXAMPLE_CLOCK_OFFSETS[mode],
      match: explicitMatch,
      fetchLatestImpl: options.prefer1v1
        ? fetchLatest1v1Match
        : options.preferTeamGame
          ? fetchLatestTeamMatch
          : undefined,
    });
    if (token !== exampleToken) return { ok: false, error: 'Otra prueba reemplazó a esta.' };

    exampleMatch = exampleMatchFrom(snapshot);
    exampleInfo = exampleInfoFrom(snapshot, resolved, mode, began);
    if (examplePreviewPhase) snapshot.previewPhase = examplePreviewPhase;

    // Captura de pre-partida: el MISMO partido real, emitido como `lobby`.
    if (EXAMPLE_PHASE === 'lobby') {
      snapshot.phase = 'lobby';
      snapshot.players = snapshot.players.map((player) => ({ ...player, civ: null }));
      snapshot.match = { ...snapshot.match, startedAt: null };
    }

    // Vista de postmatch con la MISMA partida real: recorre el flujo completo
    // (descarga + análisis) sin guardar nada en el historial local. La
    // telemetría que se ve es la que produce el replay, no una maqueta.
    if (EXAMPLE_PHASE === 'postmatch') {
      const match = explicitMatch || exampleMatch;
      // No guarda nada en el historial local: el modo ejemplo sirve para ver
      // el flujo real completo, incluida la descarga automática del replay.
      publishPostMatch(match, { force: true, persist: false, profileId: resolved.profileId })
        .catch((err) => log(`postmatch de ejemplo: ${err.message}`));
      // El overlay vuelve al estado idle (panel normal oculto) para que se vea
      // la sección de revisión, igual que después de terminar una partida.
      snapshot.status = 'idle';
      snapshot.lastMatch = match;
      delete snapshot.match;
      delete snapshot.players;
      delete snapshot.ladder;
      delete snapshot.eloLadder;
      delete snapshot.pending;
    }

    // Partida nueva ⇒ reloj e informe del rival nuevos.
    intro = null;
    lastSent = '';
    lastViewSig = '';
    rivalSig = '';
    clearRivalReports();
    send('overlay:config', overlayConfig()); // enciende todas las opciones (memoria)
    emit(snapshot);
    if (EXAMPLE_PHASE === 'postmatch') broadcastPostMatch();
    sendView(true);
    broadcastExample();

    log(
      `MODO EJEMPLO · ${resolved.name} (#${resolved.profileId}) · partida REAL ` +
        `#${exampleInfo.matchId} · ${exampleInfo.mapName} · ${exampleInfo.leaderboardName} · ` +
        `${exampleInfo.players} jugadores · reloj ${clockModeLabel(mode)} · ` +
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
async function setExampleClock(clockMode, options = {}) {
  if (!exampleActive || !exampleMatch) {
    return { ok: false, error: 'No hay ningún ejemplo activo.' };
  }
  const mode = normalizeClockMode(clockMode);
  exampleClockMode = mode;
  exampleFrozenAt = mode === 'live' ? null : Date.now();
  if (options.previewPhase !== undefined) examplePreviewPhase = options.previewPhase;

  const snapshot = await buildExampleSnapshot({
    profileId: exampleProfileId,
    cache: statsCache,
    cacheTtlMs: EXAMPLE_CACHE_TTL(),
    now: clockNow(),
    clockOffsetMs: EXAMPLE_CLOCK_OFFSETS[mode],
    match: exampleMatch,
  });
  if (examplePreviewPhase) snapshot.previewPhase = examplePreviewPhase;

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
  sendBuildOrder();
  broadcastExample();
  log(`modo ejemplo · reloj ${clockModeLabel(mode)}${mode === 'live' ? ' (corre hasta 0:20)' : ' (congelado)'}`);
  return { ok: true, example: exampleStatus() };
}

function stopExample() {
  if (!exampleActive) return { ok: true, active: false };
  deactivateExample();
  if (minimizeController) minimizeController.recheck();
  log('modo ejemplo terminado: el panel vuelve al estado real');
  // Si ya había una partida apareada en el socket, la mostramos al instante.
  if (queueWatcher && queueWatcher.reemitIfMatched()) {
    return { ok: true, active: false };
  }
  // Repinta el estado en vivo sin esperar al próximo tick del polling.
  poll().catch(() => {});
  return { ok: true, active: false };
}

async function getRecentMatchesList(limit = 10) {
  if (!profileId) return [];
  const stored = performanceStore.listReadOnly(profileId);
  let remote = [];
  const cacheKey = `recent-matches:${profileId}`;
  const cached = statsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60 * 1000 && Array.isArray(cached.matches)) {
    remote = cached.matches;
  } else {
    try {
      remote = await fetchMatches(profileId, 15, 1, null, { priority: 'own' });
      if (Array.isArray(remote) && remote.length) {
        statsCache.set(cacheKey, { ts: Date.now(), matches: remote });
      }
    } catch (err) {
      log(`historial reciente: ${err.message}`);
    }
  }
  return mergeRecentMatches(remote, stored, profileId, limit);
}

const PREVIEW_AUTO_HIDE_MS = 20 * 1000;
const PREVIEW_LOADING_CAP_MS = 60 * 1000;
let previewAutoHideTimer = null;
let previewWaitingForData = false;
let postMatchPreviewActive = false;
let previewCycleToken = 0;
let lastReportedCssHeight = 110;

function clearPreviewAutoHide() {
  if (previewAutoHideTimer) {
    clearTimeout(previewAutoHideTimer);
    previewAutoHideTimer = null;
  }
  previewWaitingForData = false;
  postMatchPreviewActive = false;
}

function schedulePreviewAutoHide(delayMs = PREVIEW_AUTO_HIDE_MS) {
  if (previewAutoHideTimer) clearTimeout(previewAutoHideTimer);
  previewWaitingForData = false;
  previewAutoHideTimer = setTimeout(() => {
    previewAutoHideTimer = null;
    if (exampleActive && exampleUseRealConfig) {
      log('vista previa de toggles finalizada a los 20s');
      stopExample();
    }
    if (postMatchReport && !postMatchOverlayDismissed && !(lastGood && lastGood.status === 'ongoing')) {
      dismissPostMatch('fin de vista previa 20s');
    }
  }, delayMs);
}

/**
 * Arranca la cuenta regresiva de 20s SOLO cuando ya terminó de cargar TODA la
 * información de la vista previa (rivales, aperturas, consejos y H2H).
 */
let introAnchoredAfterLoadMatchId = null;

function maybeArmPreviewAutoHide() {
  if (rivalFetching || scoutFetching || h2hFetching || smurfFetching) return;
  if (!previewWaitingForData) return;
  const isMultiPageTg = Boolean(lastGood && Array.isArray(lastGood.players) && lastGood.players.length > 4);
  const holdMs = isMultiPageTg ? 25 * 1000 : PREVIEW_AUTO_HIDE_MS;
  log(`vista previa cargada por completo: contando ${Math.round(holdMs / 1000)}s para auto-ocultar`);
  schedulePreviewAutoHide(holdMs);
}

/**
 * Vista previa en vivo al activar/desactivar toggles en Ajustes: usa la última
 * partida RM 1v1 real del jugador con sus opciones reales (`exampleUseRealConfig`).
 * Los 20 segundos comienzan a contar recién cuando termina de cargar toda la info.
 */
async function triggerTogglePreview(phase = 'prematch', highlightFeature = null) {
  if (lastGood && lastGood.status === 'ongoing' && !lastGood.example) return;
  if (!profileId) return;

  const cycle = ++previewCycleToken;
  clearPreviewAutoHide();
  clearPostMatchHide();
  if (minimizeController) minimizeController.cancelAndShow();
  if (win && !win.isDestroyed() && !manuallyHiddenByHotkey && !win.isVisible()) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
  }
  sendPreviewHighlight(highlightFeature);

  if (phase === 'postmatch') {
    if (exampleActive) deactivateExample();
    sendPreviewHighlight(highlightFeature);
    let targetMatch = postMatchMatch || latestStoredMatch();
    if (!targetMatch) {
      const recent = await getRecentMatchesList(10);
      const rm1v1 = recent.find((m) => m && m.is1v1 && m.rawMatch) || recent[0];
      targetMatch = (rm1v1 && rm1v1.rawMatch) || null;
    }
    if (cycle !== previewCycleToken) return;
    if (targetMatch) {
      postMatchPreviewActive = true;
      if (!postMatchReport || String(postMatchLastId) !== String(targetMatch.matchId)) {
        await publishPostMatch(targetMatch, {
          force: true,
          persist: true,
          profileId,
          showOverlay: true,
          forceOverlay: true,
          autoHide: false,
        });
      } else {
        postMatchOverlayDismissed = false;
        broadcastPostMatch();
      }
      if (cycle !== previewCycleToken) return;
      sendPreviewHighlight(highlightFeature);
      log('vista previa postmatch cargada: contando 20s para auto-ocultar');
      schedulePreviewAutoHide(PREVIEW_AUTO_HIDE_MS);
    }
    return;
  }

  if (postMatchReport && !postMatchOverlayDismissed) {
    dismissPostMatch('vista previa de toggles');
  }

  // En Durante, "Ayuda de civ" vive en la ventana 0:01–hideAt (clockMode '3') y es solo 1v1;
  // Smart Build Order usa '21' para mostrar la vista limpia durante la partida.
  const clockMode = phase === 'durante' && highlightFeature !== 'civHelp' ? '21' : '3';
  const prefer1v1 = highlightFeature === 'civHelp' || phase === 'durante';
  const preferTeamGame = !prefer1v1 && (highlightFeature === 'tgBalance' || Boolean(viewConfig().tgBalance));
  const currentIsTeam = Boolean(lastGood && Array.isArray(lastGood.players) && lastGood.players.length > 2);
  const needStart = !exampleActive || !exampleUseRealConfig || Number(exampleProfileId) !== Number(profileId) ||
    (prefer1v1 && currentIsTeam) ||
    (preferTeamGame !== currentIsTeam && !prefer1v1);
  const prevPreviewPhase = examplePreviewPhase;
  exampleUseRealConfig = true;
  examplePreviewPhase = phase;
  previewWaitingForData = true;
  // Tope defensivo por si una API externa se colgara indefinidamente
  previewAutoHideTimer = setTimeout(() => {
    previewAutoHideTimer = null;
    previewWaitingForData = false;
    if (exampleActive && exampleUseRealConfig) stopExample();
  }, PREVIEW_LOADING_CAP_MS);

  if (needStart) {
    await startExample(String(profileId), clockMode, { useRealConfig: true, previewPhase: phase, preferTeamGame, prefer1v1 });
  } else if (exampleClockMode !== clockMode || prevPreviewPhase !== phase) {
    await setExampleClock(clockMode, { previewPhase: phase });
  } else {
    send('overlay:config', overlayConfig());
    if (lastGood && lastGood.example) {
      const updated = { ...lastGood, previewPhase: phase };
      lastSent = '';
      emit(updated);
    }
    syncIntro(lastGood, { force: true });
    sendView(true);
    sendBuildOrder();
  }

  if (cycle !== previewCycleToken) return;
  if (highlightFeature === 'smurfDetector' && lastGood && lastGood.example && viewConfig().smurfDetector) {
    const hasFlagged = smurfReports && smurfReports.byPlayer &&
      Object.values(smurfReports.byPlayer).some((entry) => entry && entry.flagged);
    if (!hasFlagged) {
      const sample = buildExampleSmurfPreview(lastGood);
      if (sample) sendSmurf(sample);
    }
  }
  sendPreviewHighlight(highlightFeature);
  await Promise.resolve();
  if (cycle !== previewCycleToken) return;
  maybeArmPreviewAutoHide();
}

function registerIpc() {
  // Seguridad (A-01): validar origen (senderFrame + webContents propio) en TODOS los handlers IPC.
  const rawHandle = ipcMain.handle.bind(ipcMain);
  const rawOn = ipcMain.on.bind(ipcMain);
  ipcMain.handle = (channel, listener) => rawHandle(channel, (event, ...args) => {
    if (!isTrustedIpcEvent(event)) {
      log(`[seguridad] IPC handle rechazado (${channel})`);
      throw new Error('unauthorized-ipc-sender');
    }
    return listener(event, ...args);
  });
  ipcMain.on = (channel, listener) => rawOn(channel, (event, ...args) => {
    if (!isTrustedIpcEvent(event)) {
      log(`[seguridad] IPC event rechazado (${channel})`);
      return;
    }
    return listener(event, ...args);
  });

  ipcMain.on('postmatch:dismiss', () => dismissPostMatch('cerrado desde el overlay'));

  ipcMain.on('overlay:height', (_event, height) => {
    const parsedHeight = Number(height);
    if (Number.isFinite(parsedHeight) && parsedHeight > 0) {
      lastReportedCssHeight = parsedHeight;
    }
    if (config.debug) log(`altura medida del panel: ${Math.round(height)}px`);
    else if (!heightLogged) {
      heightLogged = true;
      log(`panel dibujado (${Math.round(height)}px de alto)`);
    }
    applyHeight(height);
  });

  ipcMain.handle('settings:get', async () => {
    await ensureProfileReady();
    const resolvedProduct = productState();
    return {
    profileId,
    alias: playerAlias,
    origin: config.profileId ? 'manual' : 'auto',
    configPath: CONFIG_PATH,
    theme: effectiveTheme(resolvedProduct),
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
    smartTips: Boolean(config.smartTips),
    smartBuildOrder: Boolean(config.smartBuildOrder),
    rivalH2H: Boolean(config.rivalH2H),
    civRecommender: Boolean(config.civRecommender),
    civCounterPick: Boolean(config.civCounterPick),
    tgBalance: Boolean(config.tgBalance),
    smurfDetector: Boolean(config.smurfDetector),
    hideWhenMinimized: Boolean(config.hideWhenMinimized),
    onlyWhenGameRunning: config.onlyWhenGameRunning !== false,
    openAtLogin: config.openAtLogin !== false,
    showWelcomeHome: config.showWelcomeHome !== false,
    autoUpdate: Boolean(config.autoUpdate),
    postMatch: config.postMatch !== false,
    postMatchPopup: config.postMatchPopup !== false,
    postMatchHideSeconds: postMatchHideSecondsValue(),
    postMatchComparison: Boolean(config.postMatchComparison),
    postMatchCompareMode: ['both', 'personal', 'community'].includes(config.postMatchCompareMode) ? config.postMatchCompareMode : 'both',
    postMatchReplay: Boolean(config.postMatchReplay),
    shields: CIV_SLUGS,
    civAliases: CIV_ALIASES,
    mapArt: MAP_ART,
    language: config.language ? i18n.getLocale(config.language) : null,
    activeLanguage: i18n.getLocale(config.language),
    wizardCompleted: Boolean(config.wizardCompleted),
    ultraWelcomeSeen: normalizeUltraWelcomeSeen(config.ultraWelcomeSeen),
    i18nBundles: i18n.getAllBundles(),
    remoteLicense: remoteLicenseState,
    trialHours: cachedTrialHours,
    product: resolvedProduct,
    matchStartedAt: intro && intro.engaged ? intro.startedAt : null,
    exampleClockElapsedMs:
      exampleFrozenAt != null && intro && intro.engaged
        ? Math.max(0, exampleFrozenAt - intro.startedAt)
        : null,
    example: exampleStatus(),
    version: app.getVersion(),
    diagnostics: diagnostics(),
  };
  });

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
    // install() devuelve { ok, reason }: el panel necesita saber si se pospuso
    // por una partida en curso para no dejar colgado «Instalando…».
    if (!updater) return { ok: false, reason: 'inactive' };
    return updater.install();
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
      if (detected.localProof) {
        verifiedLocalDetection = detected;
        if (cachedReferralsState?.myReferral?.status === 'pending') {
          scheduleReferralActivationAttempt(2000);
        }
      }
      persistConfig({ profileId: null, autoProfileId: Number(detected.profileId), autoAlias: detected.alias || null });
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
    if (isUltraTheme(theme) && !allowsFeature(productState(), 'ultraSkin')) {
      return { ok: false, ultraRequired: true, error: 'El skin Ultra está incluido en Relic Ultra.' };
    }

    persistConfig({ theme });
    if (settingsWin && !settingsWin.isDestroyed()) {
      try { settingsWin.setBackgroundColor(isUltraTheme(theme) ? '#000000' : '#0c1014'); } catch {}
    }
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

  ipcMain.handle('settings:hideWhenMinimized', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ hideWhenMinimized: enabled });
    initMinimizeWatcher();
    log(`ocultar si AoE2 minimizado (>5s): ${enabled ? 'activado' : 'desactivado'}`);
    return { ok: true, hideWhenMinimized: enabled };
  });

  ipcMain.handle('settings:onlyWhenGameRunning', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ onlyWhenGameRunning: enabled });
    initMinimizeWatcher();
    log(`mostrar overlay solo con AoE2 abierto: ${enabled ? 'activado' : 'desactivado'}`);
    return { ok: true, onlyWhenGameRunning: enabled };
  });

  ipcMain.handle('settings:openAtLogin', (_event, raw) => {
    const enabled = Boolean(raw);
    const patch = { openAtLogin: enabled };
    if (enabled && config.onlyWhenGameRunning === false) {
      patch.onlyWhenGameRunning = true;
    }
    persistConfig(patch);
    syncAutoStartWithWindows(enabled);
    initMinimizeWatcher();
    return {
      ok: true,
      openAtLogin: enabled,
      onlyWhenGameRunning: config.onlyWhenGameRunning !== false,
    };
  });

  ipcMain.handle('settings:showWelcomeHome', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ showWelcomeHome: enabled });
    return { ok: true, showWelcomeHome: enabled };
  });

  let cachedTechTreeData = null;
  let cachedUnitArtSlugs = null;
  let welcomeMetaRefreshPromise = null;
  let welcomeAnnouncementRefreshPromise = null;

  function getAvailableUnitArtSlugs() {
    if (cachedUnitArtSlugs) return cachedUnitArtSlugs;
    const set = new Set();
    try {
      const dir = path.join(__dirname, 'assets', 'units');
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.webp')) set.add(f.slice(0, -5).toLowerCase());
        }
      }
    } catch { /* ignore */ }
    cachedUnitArtSlugs = set;
    return set;
  }

  function buildWelcomeSnapshot(globalMeta, announcement = undefined) {
    let centralCacheRaw = null;
    try {
      if (fs.existsSync(CENTRAL_CACHE_PATH)) {
        centralCacheRaw = JSON.parse(fs.readFileSync(CENTRAL_CACHE_PATH, 'utf8'));
      }
    } catch { /* ignore */ }
    let trainingDashboard = null;
    let performanceRecords = [];
    try {
      const { prod, unlocked, pid, records } = trainingAccessContext();
      performanceRecords = Array.isArray(records) ? records : [];
      trainingDashboard = trainingController.buildDashboard({
        profileId: pid,
        records: performanceRecords,
        unlocked,
        plan: prod.plan || 'free',
      });
    } catch { /* ignore */ }
    let techTreeData = cachedTechTreeData;
    if (!techTreeData) {
      try {
        techTreeData = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'training', 'techtree-data.json'), 'utf8'));
        cachedTechTreeData = techTreeData;
      } catch { /* ignore */ }
    }
    const resolvedAnnouncement = announcement !== undefined
      ? announcement
      : (welcomeHome.readAnnouncementCache(ANNOUNCEMENT_CACHE_PATH)?.data || null);
    return welcomeHome.buildWelcomePayload({
      globalMeta,
      announcement: resolvedAnnouncement,
      centralCacheRaw,
      performanceRecords,
      profileId,
      alias: playerAlias || cachedAuthProfile?.displayName || null,
      trainingDashboard,
      techTreeData,
      availableUnitSlugs: getAvailableUnitArtSlugs(),
      showWelcomeHome: config.showWelcomeHome !== false,
      matchActive: Boolean(intro && intro.engaged),
    });
  }

  function pushWelcomeUpdate() {
    if (!settingsWin || settingsWin.isDestroyed()) return;
    try {
      const cached = welcomeHome.readGlobalMetaCache(GLOBAL_META_CACHE_PATH);
      const cachedAnn = welcomeHome.readAnnouncementCache(ANNOUNCEMENT_CACHE_PATH);
      settingsWin.webContents.send('welcome:update', buildWelcomeSnapshot(cached ? cached.data : null, cachedAnn ? cachedAnn.data : null));
    } catch { /* ignore */ }
  }

  ipcMain.handle('welcome:open-announcement-url', async () => {
    const ann = welcomeHome.readAnnouncementCache(ANNOUNCEMENT_CACHE_PATH)?.data;
    if (!ann || !ann.enabled || !ann.ctaUrl) return { ok: false };
    try {
      const u = new URL(ann.ctaUrl);
      if (u.protocol !== 'https:') return { ok: false };
      await shell.openExternal(u.toString());
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('welcome:get', async (_event, opts = {}) => {
    await ensureProfileReady();
    const force = Boolean(opts && opts.force);
    const cached = welcomeHome.readGlobalMetaCache(GLOBAL_META_CACHE_PATH);
    const cachedAnn = welcomeHome.readAnnouncementCache(ANNOUNCEMENT_CACHE_PATH);
    const initial = buildWelcomeSnapshot(cached ? cached.data : null, cachedAnn ? cachedAnn.data : null);

    if (force || !cached || !cached.fresh) {
      if (!welcomeMetaRefreshPromise) {
        welcomeMetaRefreshPromise = welcomeHome
          .fetchGlobalMeta({
            apiUrl: licenseApiUrl(),
            cachePath: GLOBAL_META_CACHE_PATH,
            force: true,
          })
          .then((freshMeta) => {
            if (freshMeta && settingsWin && !settingsWin.isDestroyed()) {
              const latestAnn = welcomeHome.readAnnouncementCache(ANNOUNCEMENT_CACHE_PATH);
              settingsWin.webContents.send('welcome:update', buildWelcomeSnapshot(freshMeta, latestAnn ? latestAnn.data : null));
            }
            return freshMeta;
          })
          .catch(() => null)
          .finally(() => {
            welcomeMetaRefreshPromise = null;
          });
      }
    }
    if (force || !cachedAnn || !cachedAnn.fresh) {
      if (!welcomeAnnouncementRefreshPromise) {
        welcomeAnnouncementRefreshPromise = welcomeHome
          .fetchAnnouncement({
            apiUrl: licenseApiUrl(),
            cachePath: ANNOUNCEMENT_CACHE_PATH,
            force: true,
          })
          .then((freshAnn) => {
            if (settingsWin && !settingsWin.isDestroyed()) {
              const latestMeta = welcomeHome.readGlobalMetaCache(GLOBAL_META_CACHE_PATH);
              settingsWin.webContents.send('welcome:update', buildWelcomeSnapshot(latestMeta ? latestMeta.data : null, freshAnn));
            }
            return freshAnn;
          })
          .catch(() => null)
          .finally(() => {
            welcomeAnnouncementRefreshPromise = null;
          });
      }
    }
    return initial;
  });

  ipcMain.handle('feedback:submit', async (_event, payload = {}) => {
    const apiUrl = licenseApiUrl();
    const plan = productState().plan || 'free';
    const result = await licenseClient.submitRemoteFeedback({
      apiUrl,
      category: payload.category,
      message: payload.message,
      contact: payload.contact,
      profileId,
      alias: playerAlias || '',
      plan,
      appVersion: app.getVersion(),
      locale: i18n.getLocale(config.language),
    });
    log(`feedback enviado: ${result.ok ? `ok (id=${result.id ?? '—'})` : result.error}`);
    let diagnosticsAttached = false;
    if (result.ok && payload.attachDiagnostics !== false) {
      const cat = String(payload.category || 'other').slice(0, 20);
      const shortMsg = String(payload.message || '').replace(/\s+/g, ' ').trim().slice(0, 170);
      const diagRes = await diagnosticReporter.report({
        kind: 'user_report',
        manual: true,
        fingerprint: `user:${cat}:${result.id || Date.now()}`,
        summary: `[${cat}${result.id ? ` #${result.id}` : ''}] ${shortMsg}`,
      }).catch(() => ({ ok: false }));
      diagnosticsAttached = Boolean(diagRes && diagRes.ok);
    }
    return { ...result, diagnosticsAttached };
  });

  // Las dos opciones nuevas. Se aplican EN CALIENTE: si hay una partida en
  // curso se recalcula la vista con el reloj ya andando, sin reiniciar nada.
  ipcMain.handle('settings:civHelp', (_event, raw) => {
    const enabled = Boolean(raw);
    if (enabled && !allowsFeature(productState(), 'civHelp')) {
      return { ok: false, error: 'Disponible con Pro.' };
    }
    persistConfig({ civHelp: enabled });
    send('overlay:config', overlayConfig());
    syncIntro(lastGood, { force: true });
    triggerTogglePreview('durante', enabled ? 'civHelp' : null).catch(() => {});
    log(`ayuda de civ: ${enabled ? 'activada (0:01 → 0:20)' : 'desactivada'}`);
    return { ok: true, civHelp: enabled };
  });

  ipcMain.handle('settings:hideEloAt20', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ hideEloAt20: enabled });
    send('overlay:config', overlayConfig());
    syncIntro(lastGood, { force: true });
    triggerTogglePreview('prematch', enabled ? 'hideEloAt20' : null).catch(() => {});
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

  // Las opciones de "Datos del rival" comparten un solo handler con
  // whitelist: se prenden/apagan en caliente, sin reiniciar y sin consultar
  // la red cuando la última opción se apaga.
  ipcMain.handle('settings:rivalOption', (_event, rawKey, rawValue) => {
    const key = String(rawKey || '');
    if (!RIVAL_OPTION_KEYS.includes(key)) return { ok: false, error: 'Esa opción no existe.' };
    const enabled = Boolean(rawValue);
    if (enabled && !allowsFeature(productState(), key)) {
      return { ok: false, error: 'Disponible con Pro.' };
    }
    persistConfig({ [key]: enabled });
    send('overlay:config', overlayConfig());
    log(`informe del rival · ${key}: ${enabled ? 'activado' : 'desactivado'}`);

    if (!rivalOptionsOn()) {
      clearRivalReports();
    } else {
      // Cambió el conjunto de datos pedidos: recalcular con la firma nueva.
      rivalSig = '';
      refreshRivalReports(lastGood, { force: true }).catch(() => {});
      // El head-to-head viaja en el mismo payload: refrescarlo también.
      h2hSig = '';
      refreshH2H(lastGood, { force: true }).catch(() => {});
    }
    // El consejo pre-partida (y la civ recomendada, que comparte la consulta)
    // es otra opción del mismo grupo: mismo tratamiento.
    if (!viewConfig().smartTips && !viewConfig().civRecommender && !viewConfig().civCounterPick) {
      clearScoutTips();
    } else {
      scoutSig = '';
      refreshScoutTips(lastGood, { force: true }).catch(() => {});
    }
    triggerTogglePreview('prematch', enabled ? key : null).catch(() => {});
    return { ok: true, key, enabled };
  });

  // Balance de equipos (TG): es un dato de PINTADO, no consulta nada. Se
  // aplica en caliente como civHelp: persistir + reenviar configuración.
  ipcMain.handle('settings:tgBalance', (_event, raw) => {
    const enabled = Boolean(raw);
    if (enabled && !allowsFeature(productState(), 'tgBalance')) {
      return { ok: false, error: 'Disponible con Pro.' };
    }
    persistConfig({ tgBalance: enabled });
    send('overlay:config', overlayConfig());
    triggerTogglePreview('prematch', enabled ? 'tgBalance' : null).catch(() => {});
    log(`balance de equipos: ${enabled ? 'activado' : 'desactivado'}`);
    return { ok: true, tgBalance: enabled };
  });

  ipcMain.handle('settings:smurfDetector', (_event, raw) => {
    const enabled = Boolean(raw);
    if (enabled && !productState().featureAccess.smurfDetector) {
      return { ok: false, error: 'Disponible con Ultra.' };
    }
    persistConfig({ smurfDetector: enabled });
    send('overlay:config', overlayConfig());
    if (!enabled) {
      clearSmurfReports();
    } else if (lastGood && lastGood.status === 'ongoing') {
      smurfSig = '';
      refreshSmurfReports(lastGood, { force: true }).catch(() => {});
    }
    triggerTogglePreview('prematch', enabled ? 'smurfDetector' : null).catch(() => {});
    log(`smurf detector: ${enabled ? 'activado' : 'desactivado'}`);
    return { ok: true, smurfDetector: enabled };
  });

  // "Resumen con F2": la vista compacta y SU atajo son opt-in. Apagado (por
  // defecto): informe completo siempre, F2 libre para el sistema, sin chip.
  // Encendido: resumen por defecto y F2 alterna. Apagarlo en caliente libera
  // la tecla y devuelve el panel al informe completo.
  ipcMain.handle('settings:scoutF2', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ scoutF2: enabled });
    if (!enabled) {
      // Coherencia: sin opción no hay "detalle" que recordar.
      detailMode = false;
      sendDetail();
    }
    if (!syncDetailShortcut()) {
      persistConfig({ scoutF2: false });
      send('overlay:config', overlayConfig());
      return { ok: false, error: 'F2 ya está en uso. Se mantiene el informe completo.' };
    }
    send('overlay:config', overlayConfig());
    triggerTogglePreview('prematch', enabled ? 'scoutF2' : null).catch(() => {});
    log(`resumen con F2: ${enabled ? 'activado (F2 alterna resumen/detalle)' : 'desactivado (informe completo, F2 libre)'}`);
    return { ok: true, scoutF2: enabled };
  });

  // Postmatch: el resumen es Free; comparación y métricas se resuelven con el
  // mismo estado de producto que usa viewConfig(). Activar una opción Pro sin
  // acceso se rechaza también acá, no solo deshabilitando el control.
  ipcMain.handle('settings:postMatchOption', (_event, rawKey, rawValue) => {
    const key = String(rawKey || '');
    if (key === 'postMatchCompareMode') {
      if (!allowsFeature(productState(), 'postMatchComparison')) {
        return { ok: false, error: 'Disponible con Ultra.' };
      }
      const mode = ['both', 'personal', 'community'].includes(String(rawValue)) ? String(rawValue) : null;
      if (!mode) return { ok: false, error: 'Modo de comparación inválido.' };
      persistConfig({ postMatchCompareMode: mode });
      send('overlay:config', overlayConfig());
      broadcastPostMatch();
      triggerTogglePreview('postmatch', 'postMatchComparison').catch(() => {});
      log(`postmatch · modo de comparación: ${mode}`);
      return { ok: true, key, value: mode };
    }
    if (key === 'postMatchPopup') {
      if (!productState().featureAccess.postMatch) {
        return { ok: false, error: 'Disponible con Ultra.' };
      }
      const enabled = Boolean(rawValue);
      persistConfig({ postMatchPopup: enabled });
      send('overlay:config', overlayConfig());
      if (!enabled) dismissPostMatch('popup postmatch desactivado', { force: true });
      else broadcastPostMatch();
      log(`postmatch · popup en overlay: ${enabled ? 'activado' : 'desactivado'}`);
      return { ok: true, key, enabled };
    }
    if (key === 'postMatchHideSeconds') {
      if (!productState().featureAccess.postMatch) {
        return { ok: false, error: 'Disponible con Ultra.' };
      }
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) return { ok: false, error: 'Tiempo de ocultado inválido.' };
      const seconds = parsed <= 0 ? 0 : Math.round(clamp(parsed, 10, 180));
      persistConfig({ postMatchHideSeconds: seconds });
      send('overlay:config', overlayConfig());
      if (reviewVisible()) schedulePostMatchHide();
      log(`postmatch · auto-ocultar popup: ${seconds > 0 ? `${seconds}s` : 'manual (hasta próxima partida)'}`);
      return { ok: true, key, value: seconds };
    }
    if (!['postMatch', 'postMatchComparison', 'postMatchReplay'].includes(key)) {
      return { ok: false, error: 'Esa opción de postmatch no existe.' };
    }
    const enabled = Boolean(rawValue);
    if (enabled && !productState().featureAccess[key]) {
      return { ok: false, error: 'Disponible con Ultra.' };
    }
    persistConfig({ [key]: enabled });
    send('overlay:config', overlayConfig());
    if (key === 'postMatch' && !enabled) {
      dismissPostMatch('postmatch desactivado', { force: true });
      if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.webContents.send('postmatch:update', postMatchPayload());
        pushWelcomeUpdate();
      }
    } else {
      broadcastPostMatch();
      if (viewConfig().postMatch) {
        triggerTogglePreview('postmatch', enabled ? key : null).catch(() => {});
      }
    }
    log(`postmatch · ${key}: ${enabled ? 'activado' : 'desactivado'}`);
    return { ok: true, key, enabled };
  });

  ipcMain.handle('postmatch:get', async () => {
    await ensureProfileReady();
    const recentMatches = await getRecentMatchesList(10);
    if (!postMatchReport && recentMatches.length > 0 && productState().featureAccess.postMatch) {
      const first = recentMatches[0];
      if (first && first.rawMatch) {
        const storedRec = performanceStore.getByMatchId(profileId, first.matchId);
        const isStaleAdapter = Boolean(
          storedRec?.telemetry?.source?.id === 'aoe2rec-js' &&
          storedRec.telemetry.source.version !== COMMAND_ADAPTER_VERSION,
        );
        if (isStaleAdapter && postMatchAccess().replay) {
          // Re-analizar en segundo plano replays viejos con el motor v9 corregido
          publishPostMatch(first.rawMatch, {
            force: true,
            refreshReplay: true,
            persist: true,
            profileId,
            showOverlay: false,
          }).catch((err) => log(`postmatch:get refresh: ${err.message}`));
        } else {
          const gen = ++postMatchGeneration;
          const targetPid = Number(profileId);
          postMatchLastId = String(first.matchId);
          postMatchMatch = first.rawMatch;
          postMatchOverlayDismissed = true;
          const wantHistory = postMatchAccess().comparison;
          let initHistory = { rows: [], pending: wantHistory };
          if (wantHistory) {
            // Si el historial ya está en caché en memoria resuelve en ~1ms; si falta red, pinta al instante y actualiza al llegar.
            const histPromise = fetchMyHistory({
              profileId: targetPid,
              leaderboardId: first.rawMatch.leaderboardId,
              currentMatchId: first.rawMatch.matchId,
              cache: statsCache,
              cacheTtlMs: 30 * 1000,
              log,
            }).catch((err) => ({ rows: [], error: err.message, pending: false }));
            const quick = await Promise.race([
              histPromise,
              new Promise((resolve) => setTimeout(() => resolve(null), 35)),
            ]);
            if (quick) {
              initHistory = quick;
            } else {
              histPromise.then((res) => {
                if (gen !== postMatchGeneration || Number(profileId) !== targetPid) return;
                postMatchReport = buildPostMatchReport({
                  match: first.rawMatch,
                  profileId: targetPid,
                  records: performanceStore.listReadOnly(targetPid),
                  telemetry: storedRec ? storedRec.telemetry : null,
                  historyRows: res.rows || [],
                  historyError: res.error || null,
                  historyPending: false,
                  analysis: storedRec && storedRec.telemetry
                    ? { status: 'ready', label: 'Análisis listo', detail: 'El replay ya estaba analizado.' }
                    : { status: 'idle', label: 'Tocá la partida para analizar el replay', detail: '' },
                });
                broadcastPostMatch();
              });
            }
          }
          postMatchReport = buildPostMatchReport({
            match: first.rawMatch,
            profileId: targetPid,
            records: performanceStore.listReadOnly(targetPid),
            telemetry: storedRec ? storedRec.telemetry : null,
            historyRows: initHistory.rows || [],
            historyError: initHistory.error || null,
            historyPending: Boolean(initHistory.pending),
            analysis: storedRec && storedRec.telemetry
              ? { status: 'ready', label: 'Análisis listo', detail: 'El replay ya estaba analizado.' }
              : { status: 'idle', label: 'Tocá la partida para analizar el replay', detail: '' },
          });
        }
      }
    }
    const payload = postMatchPayload() || { report: null, access: postMatchAccess() };
    return {
      ok: true,
      ...payload,
      recentMatches,
      selectedMatchId: postMatchLastId || (recentMatches[0] && recentMatches[0].matchId) || null,
      product: productState(),
    };
  });

  let hydratingCentralPid = null;
  const hydratedAttemptedIds = new Set();
  async function hydrateRecentReplaysForCentral(targetPid, candidates = []) {
    if (!allowsFeature(productState(), 'postMatchReplay')) return;
    const pid = Number(targetPid);
    if (!pid || hydratingCentralPid === pid) return;
    const allStored = performanceStore.listReadOnly(pid).filter((r) => r && r.telemetry);
    const freshIds = new Set(
      allStored
        .filter((r) => (r.telemetry?.engineSummary?.engineRev || 1) >= 2)
        .map((r) => String(r.matchId)),
    );
    const staleStored = allStored.filter((r) => (r.telemetry?.engineSummary?.engineRev || 1) < 2 && r.match && r.match.matchId != null);
    const existingRm1v1 = allStored.filter((r) => {
      if ((r.telemetry?.engineSummary?.engineRev || 1) < 2) return false;
      const lb = Number(r.leaderboardId ?? r.telemetry?.context?.leaderboardId);
      const isTeam = Boolean(r.telemetry?.engineSummary?.isTeamGame);
      return lb === 3 || (!Number.isFinite(lb) && !isTeam);
    });
    if (existingRm1v1.length >= 12 && staleStored.length === 0) return;

    const rawById = new Map();
    for (const st of staleStored) {
      rawById.set(String(st.match.matchId), st.match);
    }
    for (const item of (Array.isArray(candidates) ? candidates : [])) {
      if (item && item.is1v1 && item.rawMatch && item.rawMatch.matchId != null) {
        rawById.set(String(item.rawMatch.matchId), item.rawMatch);
      }
    }
    if (rawById.size < 12 && CENTRAL_CACHE_PATH && fs.existsSync(CENTRAL_CACHE_PATH)) {
      try {
        const disk = JSON.parse(fs.readFileSync(CENTRAL_CACHE_PATH, 'utf8'));
        const rawMatches1v1 = disk?.raw?.matches1v1 || disk?.matches1v1 || [];
        for (const rm of rawMatches1v1) {
          if (rm && rm.matchId != null && !rawById.has(String(rm.matchId))) {
            rawById.set(String(rm.matchId), rm);
          }
        }
      } catch { /* ignore cache read error */ }
    }

    const needed = Math.max(staleStored.length, 12 - existingRm1v1.length);
    const rm1v1Candidates = [...rawById.values()]
      .filter((m) => {
        const mid = String(m.matchId);
        return !freshIds.has(mid) && !hydratedAttemptedIds.has(`${pid}:${mid}`);
      })
      .slice(0, Math.min(20, needed));
    if (!rm1v1Candidates.length) return;

    hydratingCentralPid = pid;
    try {
      let added = 0;
      let cloudDownloads = 0;
      const nowMs = Date.now();
      for (const rawMatch of rm1v1Candidates) {
        if (Number(profileId) !== pid) break;
        const mid = String(rawMatch.matchId);
        hydratedAttemptedIds.add(`${pid}:${mid}`);
        try {
          // 1. Prioridad absoluta: archivo .aoe2record en savegame/ local (0 red, < 50 ms)
          let telemetry = await tryLocalReplay(rawMatch, pid);
          // 2. Solo intentar nube si es reciente (< 10 días) y como máximo 1 descarga por sesión
          if (!telemetry && cloudDownloads < 1) {
            const refTs = Date.parse(rawMatch.finishedAt || rawMatch.startedAt || '') || 0;
            if (refTs > 0 && nowMs - refTs <= 10 * 24 * 3600_000) {
              cloudDownloads += 1;
              telemetry = await fetchReplayTelemetry(rawMatch, pid, {});
            }
          }
          if (telemetry) {
            const savedRec = performanceStore.recordMatch(rawMatch, pid, telemetry);
            if (added === 0) maybeContributeBracketSample(savedRec);
            added += 1;
          }
        } catch (err) {
          log(`central · replay #${rawMatch.matchId} no disponible: ${err.message}`);
        }
      }
      if (added > 0 && settingsWin && !settingsWin.isDestroyed() && Number(profileId) === pid) {
        const fresh = await fetchCentralDashboard({
          profileId: pid,
          ownProfileId: pid,
          alias: playerAlias,
          cache: statsCache,
          performanceStore,
          diskCachePath: CENTRAL_CACHE_PATH,
          force: false,
          log,
        });
        const prod = productState();
        settingsWin.webContents.send('central:update', {
          ...fresh,
          isUltra: prod.plan === 'promax' || prod.plan === 'beta',
          plan: prod.plan,
        });
      }
    } finally {
      if (hydratingCentralPid === pid) hydratingCentralPid = null;
    }
  }

  ipcMain.handle('postmatch:select', async (_event, rawMatchId) => {
    if (!allowsFeature(productState(), 'postMatch')) {
      return { ok: false, error: 'Disponible con Ultra.' };
    }
    const targetId = String(rawMatchId || '').trim();
    if (!targetId || !profileId) return { ok: false, error: 'Elegí una partida válida.' };
    if (exampleActive) deactivateExample();
    clearPreviewAutoHide();
    const recentMatches = await getRecentMatchesList(15);
    const found = recentMatches.find((m) => String(m.matchId) === targetId);
    let targetMatch = found ? found.rawMatch : null;
    if (!targetMatch) {
      try {
        targetMatch = await fetchMatchById(Number(targetId));
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
    // Al revisar una partida anterior en la pestaña Postmatch, se carga
    // exclusivamente inline abajo en Ajustes, sin abrir el overlay encima.
    const report = await publishPostMatch(targetMatch, {
      force: true,
      persist: true,
      profileId,
      showOverlay: false,
    });
    if (!report) return { ok: false, error: 'No se pudo cargar el informe de esa partida.' };
    const updatedMatches = await getRecentMatchesList(10);
    return {
      ok: true,
      ...(postMatchPayload() || {}),
      recentMatches: updatedMatches,
      selectedMatchId: String(targetMatch.matchId),
      overlayVisible: false,
      product: productState(),
    };
  });

  ipcMain.handle('postmatch:dismiss-overlay', () => {
    dismissPostMatch('cerrado desde Central / Ajustes');
    return { ok: true, overlayVisible: false };
  });

  let centralAbort = null;
  ipcMain.handle('central:get', async (_event, rawOptions) => {
    ensureBracketBenchmarksInitialized();
    await ensureProfileReady();
    const opts = (rawOptions && typeof rawOptions === 'object')
      ? rawOptions
      : { force: Boolean(rawOptions) };
    const targetPid = Number(opts.profileId) > 0 ? Number(opts.profileId) : Number(profileId);
    const isOwn = Number.isFinite(targetPid) && targetPid === Number(profileId);
    if (centralAbort) {
      try { centralAbort.abort(); } catch { /* ignore */ }
    }
    const ctrl = new AbortController();
    centralAbort = ctrl;
    const data = await fetchCentralDashboard({
      profileId: targetPid,
      alias: opts.alias || (isOwn ? playerAlias : null),
      cache: statsCache,
      performanceStore: isOwn ? performanceStore : null,
      diskCachePath: isOwn ? CENTRAL_CACHE_PATH : null,
      force: Boolean(opts.force),
      isOwnProfile: isOwn,
      ownProfileId: profileId ? Number(profileId) : null,
      signal: ctrl.signal,
      onUpdate: (updated) => {
        if (ctrl.signal.aborted || centralAbort !== ctrl) return;
        if (!updated || !updated.ok || !settingsWin || settingsWin.isDestroyed()) return;
        const prod = productState();
        const isUltra = prod.plan === 'promax' || prod.plan === 'beta';
        settingsWin.webContents.send('central:update', { ...updated, isUltra, plan: prod.plan });
        if (isOwn && Array.isArray(updated.recentMatches)) {
          hydrateRecentReplaysForCentral(profileId, updated.recentMatches).catch(() => {});
        }
      },
      log,
    });
    const product = productState();
    const isUltra = product.plan === 'promax' || product.plan === 'beta';
    if (isOwn && data && data.ok) {
      hydrateRecentReplaysForCentral(profileId, data.recentMatches || []).catch(() => {});
    }
    return data ? { ...data, isUltra, plan: product.plan } : data;
  });

  ipcMain.handle('central:hydrate-mode', async (_event, rawOpts) => {
    await ensureProfileReady();
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    const modeId = String(opts.modeId || '');
    if (modeId !== 'ew_1v1' && modeId !== 'ew_team') return null;
    const targetPid = Number(opts.profileId) > 0 ? Number(opts.profileId) : Number(profileId);
    const isOwn = Number.isFinite(targetPid) && targetPid === Number(profileId);
    const updated = await hydrateCentralEwMode({
      profileId: targetPid,
      modeId,
      alias: opts.alias || (isOwn ? playerAlias : null),
      cache: statsCache,
      performanceStore: isOwn ? performanceStore : null,
      diskCachePath: isOwn ? CENTRAL_CACHE_PATH : null,
      isOwnProfile: isOwn,
      ownProfileId: profileId ? Number(profileId) : null,
      log,
    });
    if (!updated) return null;
    const product = productState();
    const isUltra = product.plan === 'promax' || product.plan === 'beta';
    return { ...updated, isUltra, plan: product.plan };
  });

  ipcMain.handle('settings:tactics-get', () => {
    if (viewConfig().smartTips && lastGood?.status === 'ongoing' && !scoutPayload) {
      refreshScoutTips(lastGood, { force: true }).catch((error) => log(`oportunidades: ${error.message}`));
    }
    return tacticalPayload();
  });

  ipcMain.handle('settings:build-order-get', () => buildOrderPayload());
  ipcMain.handle('settings:smart-build-order', (_event, raw) => {
    if (lastGood?.status === 'ongoing' && !lastGood?.example) return { ok: false, error: 'Configurá Smart Build Order antes de buscar partida.' };
    if (!productState().featureAccess.smartBuildOrder) return { ok: false, error: 'Disponible con Ultra.' };
    const enabled = Boolean(raw);
    persistConfig({ smartBuildOrder: enabled });
    send('overlay:config', overlayConfig());
    syncLiveArmedBuildTimer();
    sendBuildOrder();
    triggerTogglePreview('durante', enabled ? 'smartBuildOrder' : null).catch(() => {});
    return { ok: true, enabled };
  });

  ipcMain.handle('postmatch:refresh', async () => {
    if (!allowsFeature(productState(), 'postMatch')) {
      return { ok: false, error: 'Disponible con Ultra.' };
    }
    const match = latestStoredMatch();
    if (!match) {
      return { ok: false, error: 'Todavía no hay una partida terminada para analizar.' };
    }
    const report = await publishPostMatch(match, {
      force: true,
      refreshReplay: true,
      showOverlay: false,
    });
    if (!report) return { ok: false, error: 'No se pudo reconstruir el informe.' };
    const recentMatches = await getRecentMatchesList(10);
    return {
      ok: true,
      ...(postMatchPayload() || {}),
      recentMatches,
      selectedMatchId: String(match.matchId),
      overlayVisible: false,
      product: productState(),
    };
  });

  // Importación opcional de métricas adicionales ya normalizadas. El parser
  // automático de comandos no produce economía ni eventos de combate.
  ipcMain.handle('postmatch:import', async () => {
    if (!postMatchAccess().replay) {
      return { ok: false, error: 'Activá el análisis del replay con acceso Ultra para importar métricas.' };
    }
    const match = latestStoredMatch();
    if (!match) {
      return { ok: false, error: 'Primero necesitás una partida terminada y registrada.' };
    }
    const owner = settingsWin && !settingsWin.isDestroyed()
      ? settingsWin
      : (win && !win.isDestroyed() ? win : null);
    const options = {
      title: 'Importar informe de telemetría',
      properties: ['openFile'],
      filters: [{ name: 'Informe JSON compatible', extensions: ['json'] }],
    };
    const picked = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const file = picked.filePaths[0];
    try {
      if (fs.statSync(file).size > 5 * 1024 * 1024) {
        return { ok: false, error: 'El informe supera el límite de 5 MB.' };
      }
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const self = (match.players || []).find((p) => String(p.profileId) === String(profileId));
      const normalized = normalizeTelemetry(raw, {
        matchId: match.matchId,
        profileId,
        mapName: match.mapName,
        leaderboardId: match.leaderboardId,
        civ: self && self.civ,
      });
      if (normalized.status !== 'ready') {
        return {
          ok: false,
          error: normalized.warnings[0] || 'El informe no corresponde a esta partida y jugador.',
        };
      }
      const report = await publishPostMatch(match, {
        force: true,
        telemetry: normalized.data,
        showOverlay: false,
      });
      if (!report) return { ok: false, error: 'No se pudo guardar la telemetría.' };
      return {
        ok: true,
        ...(postMatchPayload() || {}),
        product: productState(),
        warnings: normalized.warnings,
      };
    } catch (err) {
      log(`importación de telemetría falló: ${err.message}`);
      return { ok: false, error: `No se pudo leer el informe: ${err.message}` };
    }
  });

  // Seguridad (C-02): canje local por hash deshabilitado permanentemente.
  // Las claves prepagas se canjean exclusivamente en el servidor mediante `auth:redeemKey`.
  ipcMain.handle('settings:activate-access-key', () => ({
    ok: false,
    error: 'Las claves locales están desactivadas. Iniciá sesión con Google y canjeá tu clave en el servidor.',
    product: productState(),
  }));

  // Seguridad (C-01): inyección manual de tokens deshabilitada en builds de producción.
  ipcMain.handle('settings:activate-license', (_event, rawAccount, rawToken) => {
    if (app.isPackaged) {
      return { ok: false, error: 'La activación manual no está disponible en producción. Iniciá sesión con tu cuenta.', product: productState() };
    }
    const accountId = String(rawAccount || '').trim();
    const token = String(rawToken || '').trim();
    if (!accountId || !token) {
      return { ok: false, error: 'Ingresá la cuenta y la credencial firmada.', product: productState() };
    }
    const previousSession = productSession;
    productSession = { accountId, entitlementToken: token };
    const product = productState();
    if (!product.entitlement.valid) {
      const reason = product.entitlement && product.entitlement.reason;
      const messages = {
        'no-entitlement': 'Ingresá una credencial.',
        malformed: 'La credencial no tiene el formato esperado.',
        'untrusted-key': 'Esta versión no incluye claves públicas de licencia; no se puede verificar la credencial.',
        'invalid-signature': 'La firma de la credencial no es válida.',
        expired: 'La credencial está vencida.',
        'not-yet-valid': 'La credencial todavía no es válida.',
        'account-mismatch': 'La credencial no corresponde a esa cuenta.',
        'profile-mismatch': 'La credencial está asociada a otro perfil de AoE2.',
        'device-mismatch': 'La credencial pertenece a otro equipo.',
        'invalid-claims': 'La credencial tiene datos inválidos.',
      };
      productSession = previousSession;
      refreshAccessPresentation();
      return { ok: false, error: messages[reason] || 'No se pudo verificar la credencial.', product: productState() };
    }
    log(`licencia ${product.entitlement.plan} verificada para la sesión · cuenta ${accountId}`);
    refreshAccessPresentation(product);
    return { ok: true, product };
  });

  ipcMain.handle('settings:open-commerce', async (_event, rawKind) => {
    const product = productState();
    const link = rawKind === 'account' ? product.commerce.account : product.commerce.checkout;
    if (!link || !link.enabled) {
      return { ok: false, error: product.commerce.message };
    }
    try {
      await shell.openExternal(link.url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `No se pudo abrir el enlace: ${err.message}` };
    }
  });

  ipcMain.handle('checkout:create', async (_event, payload = {}) => {
    const apiUrl = licenseApiUrl();
    const sessionToken = loadSessionToken();
    if (!apiUrl) return { ok: false, error: 'Servidor de licencias no configurado.' };
    if (!sessionToken) return { ok: false, authRequired: true, error: 'Iniciá sesión con Google para vincular el plan a tu cuenta.' };
    const res = await licenseClient.createCheckoutOrder({
      apiUrl,
      sessionToken,
      plan: payload?.plan,
      cycle: payload?.cycle,
      method: payload?.method,
      coin: payload?.coin,
    });
    if (!res.ok) return { ok: false, unauthorized: Boolean(res.unauthorized), error: res.error || 'No se pudo iniciar el pago.' };
    const data = res.data || {};
    if (data.checkoutUrl) {
      try {
        const parsed = new URL(data.checkoutUrl);
        if (parsed.protocol === 'https:' && parsed.hostname === 'checkout.paygate.to') {
          await shell.openExternal(parsed.toString());
        }
      } catch (err) {
        log(`checkout openExternal error: ${err.message}`);
      }
    }
    return { ok: true, order: data };
  });

  ipcMain.handle('checkout:status', async (_event, orderId) => {
    const apiUrl = licenseApiUrl();
    const sessionToken = loadSessionToken();
    if (!apiUrl || !sessionToken || !orderId) return { ok: false, error: 'missing-context' };
    const res = await licenseClient.getCheckoutOrderStatus({ apiUrl, sessionToken, orderId });
    if (!res.ok) return { ok: false, error: res.error };
    const data = res.data || {};
    if (data.status === 'paid') {
      await syncRemoteLicense('checkout-paid').catch(() => {});
      const auth = await fetchCurrentAuthState().catch(() => null);
      if (auth) broadcastAuthState(auth);
      return { ok: true, order: data, product: productState(), auth };
    }
    return { ok: true, order: data };
  });

  ipcMain.handle('app:copyText', (_event, text) => {
    const clean = String(text ?? '');
    if (!clean) return { ok: false, error: 'empty' };
    try {
      clipboard.writeText(clean);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'clipboard-failed' };
    }
  });

  ipcMain.handle('trial:claim', async () => {
    const apiUrl = licenseApiUrl();
    const sessionToken = loadSessionToken();
    const durLabel = formatTrialDurationEs(cachedTrialHours);
    if (!apiUrl) return { ok: false, error: 'Servidor de licencias no configurado.' };
    if (!sessionToken) return { ok: false, authRequired: true, error: `Iniciá sesión con Google para activar tu prueba gratis de ${durLabel} de Ultra.` };
    const res = await licenseClient.claimUltraTrial({ apiUrl, sessionToken });
    if (!res.ok) {
      const code = res.error;
      const msg = code === 'trial-already-claimed'
        ? 'Esta cuenta ya utilizó su prueba gratuita de Relic Ultra.'
        : code === 'trial-device-already-used'
          ? 'Esta PC ya utilizó la prueba gratuita de Relic Ultra.'
          : code === 'already-has-active-plan'
            ? 'Tu cuenta ya tiene un plan pago activo.'
            : (res.error || `No se pudo activar la prueba de ${durLabel}.`);
      return { ok: false, unauthorized: Boolean(res.unauthorized), code, error: msg };
    }
    if (Number.isFinite(Number(res.data?.trialHours)) && Number(res.data.trialHours) > 0) {
      cachedTrialHours = Math.round(Number(res.data.trialHours));
    }
    await syncRemoteLicense('trial-claimed').catch(() => {});
    const auth = await fetchCurrentAuthState().catch(() => null);
    if (auth) broadcastAuthState(auth);
    return { ok: true, trial: res.data, trialHours: cachedTrialHours, product: productState(), auth };
  });

  ipcMain.handle('referrals:me', async () => {
    const out = await fetchCurrentReferralsState();
    return out;
  });

  ipcMain.handle('referrals:apply', async (_event, rawCode) => {
    const apiUrl = licenseApiUrl();
    const sessionToken = loadSessionToken();
    if (!apiUrl) return { ok: false, error: 'Servidor de licencias no configurado.' };
    if (!sessionToken) {
      return { ok: false, authRequired: true, code: 'auth-required', error: 'Iniciá sesión con Google para ingresar un código de referido.' };
    }
    const allLocalPlatformIdHashes = verifiedLocalDetection?.localProof?.allLocalPlatformIdHashes
      || collectLocalPlatformIdHashes();
    const res = await licenseClient.applyReferralCode({
      apiUrl,
      sessionToken,
      code: String(rawCode || '').trim(),
      allLocalPlatformIdHashes,
    });
    if (!res.ok) {
      return { ok: false, unauthorized: Boolean(res.unauthorized), code: res.code || null, error: res.error };
    }
    const latest = await fetchCurrentReferralsState().catch(() => null);
    const dwellSec = Math.max(60, Number(res.data?.dwellSeconds || 60));
    scheduleReferralActivationAttempt((dwellSec + 2) * 1000);
    return { ok: true, applied: res.data, referrals: latest?.referrals || cachedReferralsState };
  });

  ipcMain.handle('referrals:activate', async () => {
    const act = await tryAutoActivatePendingReferral({ force: true });
    const latest = await fetchCurrentReferralsState().catch(() => null);
    return { ...act, referrals: latest?.referrals || cachedReferralsState };
  });

  function trainingAccessContext() {
    const prod = productState();
    const unlocked = allowsFeature(prod, 'trainingHub');
    let pid = profileId || config.profileId || config.autoProfileId || null;
    if (!pid && typeof readCachedDiskProfile === 'function') {
      const cachedDisk = readCachedDiskProfile();
      if (cachedDisk?.profileId) pid = cachedDisk.profileId;
    }
    const records = pid ? performanceStore.listReadOnly(pid) : [];
    return { prod, unlocked, pid, records };
  }

  ipcMain.handle('training:get', () => {
    const { prod, unlocked, pid, records } = trainingAccessContext();
    return trainingController.buildDashboard({
      profileId: pid,
      records,
      unlocked,
      plan: prod.plan || 'free',
    });
  });

  ipcMain.handle('training:mission-action', (_event, payload = {}) => {
    const { unlocked, pid, records } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    const missions = trainingController.advanceOrRerollMission({
      profileId: pid,
      familyId: String(payload?.familyId || ''),
      action: payload?.action === 'reroll' ? 'reroll' : 'advance',
      records,
    });
    return { ok: true, missions };
  });

  ipcMain.handle('training:pacer-select', (_event, payload = {}) => {
    const { unlocked, pid, records } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    const pacer = trainingController.selectPacer({
      profileId: pid,
      buildKey: payload?.buildKey,
      civ: payload?.civ,
      clockSpeed: Number(payload?.clockSpeed),
      soundEnabled: payload?.soundEnabled,
      records,
    });
    return { ok: true, pacer };
  });

  ipcMain.handle('training:pacer-complete', (_event, payload = {}) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    trainingController.recordPacerRun(pid, payload || {});
    return { ok: true };
  });

  ipcMain.handle('training:queue-add', (_event, payload = {}) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.addQueueItem({ profileId: pid, item: payload || {} });
  });

  ipcMain.handle('training:queue-toggle', (_event, itemId) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.toggleQueueItem({ profileId: pid, itemId: String(itemId || '') });
  });

  ipcMain.handle('training:queue-remove', (_event, itemId) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.removeQueueItem({ profileId: pid, itemId: String(itemId || '') });
  });

  ipcMain.handle('training:queue-clear-completed', () => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.clearCompletedQueueItems({ profileId: pid });
  });

  function resolveOwnAoeIdentityForApm() {
    let centralCacheRaw = null;
    try {
      if (fs.existsSync(CENTRAL_CACHE_PATH)) {
        centralCacheRaw = JSON.parse(fs.readFileSync(CENTRAL_CACHE_PATH, 'utf8'));
      }
    } catch { /* ignore */ }
    const raw = centralCacheRaw?.raw || centralCacheRaw || null;
    const pid = Number(profileId || centralCacheRaw?.profileId || raw?.profileId || 0) || null;
    const aoeAlias = String(playerAlias || raw?.alias || raw?.profileData?.name || '').trim();
    const lbs = Array.isArray(raw?.profileData?.leaderboards) ? raw.profileData.leaderboards : [];
    const lb1v1 = lbs.find((l) => l && l.leaderboardId === 'rm_1v1');
    const lbTeam = lbs.find((l) => l && l.leaderboardId === 'rm_team');
    let elo = Number.isFinite(Number(lb1v1?.rating)) && Number(lb1v1.rating) > 0
      ? Math.round(Number(lb1v1.rating))
      : (Number.isFinite(Number(lbTeam?.rating)) && Number(lbTeam.rating) > 0 ? Math.round(Number(lbTeam.rating)) : null);
    if (!elo && pid) {
      try {
        const recs = performanceStore.listReadOnly(pid);
        const latestElo = Number(recs?.[0]?.match?.elo || recs?.[0]?.report?.elo || 0);
        if (Number.isFinite(latestElo) && latestElo >= 200) elo = Math.round(latestElo);
      } catch { /* ignore */ }
    }
    return { profileId: pid, aoeAlias, elo };
  }

  ipcMain.handle('training:apm-leaderboard', async (_event, payload = {}) => {
    const apiUrl = licenseApiUrl();
    const sessionToken = loadSessionToken();
    const mode = ['snipe', 'counter', 'reflex'].includes(String(payload?.mode || '')) ? String(payload.mode) : 'snipe';
    const identity = resolveOwnAoeIdentityForApm();
    const res = await licenseClient.fetchApmLeaderboard({ apiUrl, sessionToken, mode, limit: 20 });
    return {
      ...res,
      signedIn: Boolean(sessionToken),
      aoeLinked: Boolean(identity.profileId && identity.aoeAlias),
      myAoeAlias: identity.aoeAlias || '',
      myElo: identity.elo || null,
    };
  });

  ipcMain.handle('training:apm-complete', async (_event, payload = {}) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    const planRes = trainingController.recordApmDrillRun({ profileId: pid, run: payload });
    let rankRes = { ok: false, skipped: true };
    const apiUrl = licenseApiUrl();
    const sessionToken = loadSessionToken();
    const identity = resolveOwnAoeIdentityForApm();
    if (Number(payload?.durationSec) === 30) {
      if (!sessionToken) {
        rankRes = { ok: false, reason: 'auth-required' };
      } else if (!identity.profileId || !identity.aoeAlias) {
        rankRes = { ok: false, reason: 'aoe-account-required' };
      } else if (apiUrl) {
        rankRes = await licenseClient.submitApmScore({
          apiUrl,
          sessionToken,
          payload: {
            mode: String(payload.mode || 'snipe'),
            durationSec: 30,
            hits: Number(payload.hits || 0),
            misses: Number(payload.misses || 0),
            maxStreak: Number(payload.maxStreak || 0),
            avgReactionMs: Number(payload.avgReactionMs || 0),
            minReactionMs: Number(payload.minReactionMs || 0),
            reactionStdDevMs: payload.reactionStdDevMs != null ? Number(payload.reactionStdDevMs) : null,
            profileId: identity.profileId,
            aoeAlias: identity.aoeAlias,
            elo: identity.elo,
          },
        });
      }
    }
    return {
      ok: true,
      trainingQueue: planRes.trainingQueue || [],
      newlyCompletedPlanItems: planRes.newlyCompletedPlanItems || [],
      ranking: rankRes,
      aoeLinked: Boolean(identity.profileId && identity.aoeAlias),
      signedIn: Boolean(sessionToken),
    };
  });

  ipcMain.handle('training:arena-status', () => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return { ok: true, arena: trainingController.getArenaState({ profileId: pid }) };
  });

  ipcMain.handle('training:arena-next', (_event, payload = {}) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.getNextArenaQuestion({
      profileId: pid,
      level: payload?.level != null ? Number(payload.level) : null,
    });
  });

  ipcMain.handle('training:arena-answer', (_event, payload = {}) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.submitArenaAnswer({
      profileId: pid,
      questionId: String(payload?.questionId || ''),
      selectedOptionId: payload?.selectedOptionId != null ? String(payload.selectedOptionId) : null,
      timedOut: Boolean(payload?.timedOut),
    });
  });

  ipcMain.handle('training:arena-start', (_event, payload = {}) => {
    const { unlocked, pid, records } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.startArena({
      profileId: pid,
      mode: String(payload?.mode || 'mixed'),
      count: Number(payload?.count || 5),
      records,
    });
  });

  ipcMain.handle('training:arena-finish', (_event, payload = {}) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.finishArena({
      profileId: pid,
      mode: String(payload?.mode || 'mixed'),
      answered: Number(payload?.answered || 0),
      correct: Number(payload?.correct || 0),
      bestStreak: Number(payload?.bestStreak || 0),
    });
  });

  ipcMain.handle('training:build-save', (_event, payload = {}) => {
    const { unlocked, pid, records } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    const res = trainingController.saveCustomBuild({
      profileId: pid,
      build: payload?.build,
      armNow: Boolean(payload?.armNow),
      records,
    });
    syncLiveArmedBuildTimer();
    sendBuildOrder();
    return { ...res, buildOrderHelperEnabled: Boolean(viewConfig().smartBuildOrder) };
  });

  ipcMain.handle('training:build-extract', () => {
    const { unlocked, pid, records } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    const res = trainingController.extractCustomBuildFromReplay({
      profileId: pid,
      records,
    });
    sendBuildOrder();
    return res;
  });

  ipcMain.handle('training:build-delete', (_event, buildId) => {
    const { unlocked, pid, records } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    const res = trainingController.deleteCustomBuild({
      profileId: pid,
      buildId: String(buildId || ''),
      records,
    });
    syncLiveArmedBuildTimer();
    sendBuildOrder();
    return { ...res, buildOrderHelperEnabled: Boolean(viewConfig().smartBuildOrder) };
  });

  ipcMain.handle('training:build-arm', (_event, payload = {}) => {
    const { unlocked, pid } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    const res = trainingController.controlLiveOverlay({
      profileId: pid,
      buildId: payload?.buildId,
      armed: payload?.armed,
      testNow: payload?.testNow,
      action: payload?.action,
      clockSpeed: payload?.clockSpeed,
    });
    if (res.liveTestActive && win && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, 'screen-saver');
      if (!win.isVisible()) win.showInactive();
    }
    syncLiveArmedBuildTimer();
    sendBuildOrder();
    return { ...res, buildOrderHelperEnabled: Boolean(viewConfig().smartBuildOrder) };
  });

  ipcMain.handle('training:techtree-get', () => {
    const { unlocked } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    try {
      if (!cachedTechTreeData) {
        const raw = fs.readFileSync(path.join(__dirname, 'src', 'training', 'techtree-data.json'), 'utf8');
        cachedTechTreeData = JSON.parse(raw);
      }
      return { ok: true, data: cachedTechTreeData };
    } catch (err) {
      log(`error cargando techtree-data.json: ${err.message}`);
      return { ok: false, error: 'No se pudo cargar el árbol de tecnología.' };
    }
  });

  ipcMain.handle('training:high-elo-config', (_event, payload = {}) => {
    const { unlocked, pid, records } = trainingAccessContext();
    if (!unlocked) return { ok: false, error: 'ultra-required' };
    return trainingController.updateHighEloConfig({
      profileId: pid,
      selectedMatchId: payload?.selectedMatchId,
      myCivSlug: payload?.myCivSlug,
      rivalCivSlug: payload?.rivalCivSlug,
      mapSlug: payload?.mapSlug,
      records,
    });
  });

  ipcMain.handle('settings:language', (_event, rawLang) => {
    const next = i18n.normalizeLocale(rawLang);
    if (!next) return { ok: false, language: i18n.getLocale(config.language) };
    persistConfig({ language: next });
    send('overlay:config', overlayConfig());
    log(`idioma cambiado a ${next}`);
    return { ok: true, language: next, bundle: i18n.getBundle(next) };
  });

  ipcMain.handle('settings:wizard-complete', (_event, payload = {}) => {
    const patch = { wizardCompleted: true };
    const nextLang = i18n.normalizeLocale(payload && payload.language);
    if (nextLang) patch.language = nextLang;
    persistConfig(patch);
    send('overlay:config', overlayConfig());
    log(`wizard inicial completado (${i18n.getLocale(config.language)})`);
    return { ok: true, language: i18n.getLocale(config.language), wizardCompleted: true };
  });

  ipcMain.handle('settings:markUltraWelcomeSeen', (_event, rawKey) => {
    const keys = Array.isArray(rawKey) ? rawKey : [rawKey];
    const next = { ...normalizeUltraWelcomeSeen(config.ultraWelcomeSeen) };
    const now = Date.now();
    let changed = false;
    for (const k of keys) {
      const clean = String(k || '').trim().slice(0, 160);
      if (clean) {
        if (!next[clean]) changed = true;
        next[clean] = next[clean] || now;
      }
    }
    const bounded = normalizeUltraWelcomeSeen(next);
    if (changed) persistConfig({ ultraWelcomeSeen: bounded });
    return { ok: true, ultraWelcomeSeen: bounded };
  });

  ipcMain.handle('settings:license-refresh', async () => {
    const remote = await syncRemoteLicense('manual');
    const auth = await fetchCurrentAuthState();
    broadcastAuthState(auth);
    return { ok: remote.status === 'verified', remote, auth, product: productState() };
  });

  ipcMain.handle('auth:status', async () => {
    const auth = await fetchCurrentAuthState();
    return { ok: true, auth, product: productState() };
  });

  ipcMain.handle('auth:googleLogin', async () => {
    const apiUrl = licenseApiUrl();
    if (!apiUrl) return { ok: false, error: 'Servicio de cuentas no configurado.' };
    if (activeAuthServer) {
      try { activeAuthServer.close(); } catch {}
      activeAuthServer = null;
    }
    return new Promise((resolve) => {
      let finished = false;
      const done = (result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        if (activeAuthServer) {
          try { activeAuthServer.close(); } catch {}
          activeAuthServer = null;
        }
        resolve(result);
      };
      const expectedState = crypto.randomBytes(16).toString('hex');
      const server = http.createServer(async (req, res) => {
        try {
          const parsed = new URL(req.url || '/', 'http://127.0.0.1');
          if (parsed.pathname !== '/auth/callback') {
            res.writeHead(404);
            res.end();
            return;
          }
          const code = parsed.searchParams.get('code');
          const returnedState = parsed.searchParams.get('state');
          const errParam = parsed.searchParams.get('error');
          const redirectBrowser = (ok, extra = {}) => {
            const cleanBase = licenseClient.validateApiUrl(apiUrl);
            if (cleanBase) {
              const target = new URL(`${cleanBase}/v1/auth/connected`);
              target.searchParams.set('ok', ok ? '1' : '0');
              if (extra.email) target.searchParams.set('email', String(extra.email).slice(0, 120));
              if (extra.error) target.searchParams.set('error', String(extra.error).slice(0, 180));
              res.writeHead(302, { location: target.toString(), 'cache-control': 'no-store' });
              res.end();
              return;
            }
            res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' });
            res.end(ok
              ? '<h2>¡Sesión conectada!</h2><p>Ya podés cerrar esta pestaña y volver a Relic.</p>'
              : `<h2>${extra.error || 'No se pudo iniciar sesión'}</h2><p>Podés cerrar esta pestaña y volver a Relic.</p>`);
          };
          if (errParam) {
            const friendlyErr = errParam === 'access_denied'
              ? 'Google bloqueó o canceló el acceso a esta cuenta.'
              : 'Inicio de sesión cancelado.';
            redirectBrowser(false, { error: friendlyErr });
            done({ ok: false, error: friendlyErr });
            return;
          }
          // Seguridad (M-01): jamás aceptar `?token=` directo en query; exigir siempre `code` + `state` exacto.
          const stateBuf = Buffer.from(String(returnedState || ''), 'utf8');
          const expBuf = Buffer.from(expectedState, 'utf8');
          const stateOk = stateBuf.length === expBuf.length && crypto.timingSafeEqual(stateBuf, expBuf);
          if (!code || !stateOk) {
            redirectBrowser(false, { error: 'Estado OAuth inválido. Volvé a intentarlo desde Relic.' });
            done({ ok: false, error: 'Estado OAuth inválido.' });
            return;
          }
          let sessionToken = null;
          let sessionEmail = '';
          let deviceLimit = false;
          {
            const { port } = server.address();
            const allLocalPlatformIdHashes = verifiedLocalDetection?.localProof?.allLocalPlatformIdHashes
              || collectLocalPlatformIdHashes();
            const exchanged = await licenseClient.exchangeGoogleCode({
              apiUrl,
              code,
              redirectUri: `http://127.0.0.1:${port}/auth/callback`,
              profileId: profileId || null,
              alias: playerAlias || '',
              appVersion: app.getVersion(),
              allLocalPlatformIdHashes,
            });
            if (!exchanged.ok || !exchanged.sessionToken) {
              const errMsg = exchanged.error || 'No se pudo validar con Google.';
              log(`login con Google falló en exchange: ${errMsg}`);
              diagnosticReporter.report({
                kind: 'auth_error',
                fingerprint: `auth:google-exchange:${errMsg.slice(0, 40)}`,
                summary: `Google OAuth exchange falló: ${errMsg}`,
              }).catch(() => {});
              redirectBrowser(false, { error: errMsg });
              done({ ok: false, error: errMsg });
              return;
            }
            sessionToken = exchanged.sessionToken;
            sessionEmail = exchanged.email || '';
            deviceLimit = Boolean(exchanged.deviceLimit);
          }
          if (!sessionToken) {
            redirectBrowser(false, { error: 'Google no devolvió sesión válida.' });
            done({ ok: false, error: 'Google no devolvió sesión válida.' });
            return;
          }
          saveSessionToken(sessionToken);
          redirectBrowser(true, { email: sessionEmail });
          log('sesión de Google iniciada y guardada con DPAPI');
          const [auth] = await Promise.all([
            fetchCurrentAuthState(),
            syncRemoteLicense('google-login'),
          ]);
          broadcastAuthState(auth);
          fetchCurrentReferralsState().catch(() => {});
          if (settingsWin && !settingsWin.isDestroyed()) {
            if (settingsWin.isMinimized()) settingsWin.restore();
            settingsWin.focus();
          }
          done({ ok: true, auth, deviceLimit, product: productState() });
        } catch (err) {
          log(`login con Google falló en callback local: ${err.message}`);
          diagnosticReporter.report({
            kind: 'auth_error',
            fingerprint: `auth:callback:${String(err?.message || 'error').slice(0, 40)}`,
            summary: `Callback OAuth local falló: ${String(err?.message || err).slice(0, 160)}`,
            extraDetail: err?.stack || '',
          }).catch(() => {});
          res.writeHead(500);
          res.end();
          done({ ok: false, error: err.message });
        }
      });
      activeAuthServer = server;
      const timeout = setTimeout(() => {
        done({ ok: false, error: 'Tiempo agotado esperando el inicio de sesión en el navegador.' });
      }, 3 * 60 * 1000);
      server.on('error', (err) => done({ ok: false, error: err.message }));
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        const startUrl = licenseClient.buildGoogleDesktopAuthUrl({
          port,
          state: expectedState,
        });
        shell.openExternal(startUrl).catch((err) => done({ ok: false, error: err.message }));
      });
    });
  });

  ipcMain.handle('auth:logout', async () => {
    const token = loadSessionToken();
    if (token) {
      await licenseClient.logoutRemoteSession({ apiUrl: licenseApiUrl(), sessionToken: token }).catch(() => {});
    }
    clearSessionToken();
    cachedReferralsState = null;
    clearTimeout(referralRetryTimer);
    referralRetryTimer = null;
    productSession = { accountId: null, entitlementToken: null };
    await syncRemoteLicense('logout').catch(() => {});
    refreshAccessPresentation();
    const auth = { signedIn: false, user: null, devices: [], activeDeviceCount: 0, currentMachineAuthorized: false };
    broadcastAuthState(auth);
    return { ok: true, auth, product: productState() };
  });

  ipcMain.handle('auth:revokeDevice', async (_event, machineHash) => {
    const token = loadSessionToken();
    if (!token) return { ok: false, error: 'Iniciá sesión primero.' };
    const res = await licenseClient.revokeOwnDevice({
      apiUrl: licenseApiUrl(),
      sessionToken: token,
      machineHash: String(machineHash || ''),
    });
    if (!res.ok) return { ok: false, error: res.error || 'No se pudo desconectar la PC.' };
    // Si esta PC no estaba autorizada por límite, reclamar el asiento liberado automáticamente.
    await licenseClient.claimCurrentDevice({
      apiUrl: licenseApiUrl(),
      sessionToken: token,
      appVersion: app.getVersion(),
    }).catch(() => {});
    await syncRemoteLicense('device-revoked');
    const auth = await fetchCurrentAuthState();
    broadcastAuthState(auth);
    return { ok: true, auth, product: productState() };
  });

  ipcMain.handle('auth:redeemKey', async (_event, rawCode) => {
    const token = loadSessionToken();
    if (!token) return { ok: false, error: 'Iniciá sesión con Google antes de canjear una clave.' };
    const res = await licenseClient.redeemLicenseKey({
      apiUrl: licenseApiUrl(),
      sessionToken: token,
      code: String(rawCode || ''),
    });
    if (!res.ok) {
      const map = {
        'invalid-key': 'Formato de clave inválido.',
        'key-not-found': 'Clave no encontrada o revocada.',
        'key-already-used': 'Esa clave ya fue canjeada.',
      };
      return { ok: false, error: map[res.error] || res.error || 'No se pudo canjear la clave.' };
    }
    await syncRemoteLicense('key-redeemed');
    const auth = await fetchCurrentAuthState();
    broadcastAuthState(auth);
    log(`clave prepaga canjeada (${res.data.plan}, +${res.data.durationDays} días)`);
    return { ok: true, ...res.data, auth, product: productState() };
  });

  // Actualizaciones automáticas (pestaña Updater). Al activarlas se consulta
  // enseguida: si ya hay una versión nueva, se descarga e instala sola. Nunca
  // en media partida: el updater lo pospone hasta que termines.
  ipcMain.handle('settings:autoUpdate', (_event, raw) => {
    const enabled = Boolean(raw);
    persistConfig({ autoUpdate: enabled });
    log(
      `actualizaciones automáticas: ${enabled ? 'activadas · consulta cada 30 min' : 'desactivadas'}`,
    );
    if (enabled && updater && updater.active) {
      updater.check('al activar automáticas');
    }
    return { ok: true, autoUpdate: enabled };
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
    // El renderer nuevo arranca sin clases: hay que reenviarle la vista activa
    // y el modo de scouting (F2) que estuviera puesto antes de la recarga.
    sendView(true);
    sendDetail();
    // El renderer se puede recargar: el informe ya calculado se reenvía una vez
    // que sus listeners están puestos (null si ya se había cerrado).
    send('postmatch:update', overlayPostMatchPayload());
    syncReviewInteraction();
    // Y también el informe del rival que ya estaba calculado.
    if (rivalReports) send('overlay:rival', projectRivalPayload(rivalReports, productState()));
    if (smurfReports && allowsFeature(productState(), 'smurfDetector')) send('overlay:smurf', smurfReports);
    // Ídem el consejo pre-partida (si sigue vigente: el renderer lo valida).
    if (scoutPayload) send('overlay:scout', projectScoutPayload(scoutPayload, productState()));
    sendBuildOrder();
    if (activePreviewHighlight) send('overlay:highlight', activePreviewHighlight);

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

let lastAppliedBounds = null;
function applyHeight(height) {
  if (!win) return;
  const display = screen.getDisplayMatching(win.getBounds());
  const workArea = display.workArea;
  const overlayZoom = applyAdaptiveZoom(win, 'overlay');
  const reviewing = reviewVisible() && !moving;
  const isTeamMatch = Boolean(lastGood && lastGood.status === 'ongoing' && Array.isArray(lastGood.players) && lastGood.players.length > 2);
  const is1v1Match = Boolean(lastGood && lastGood.status === 'ongoing' && Array.isArray(lastGood.players) && lastGood.players.length === 2);
  const civHelpActiveNow = Boolean(is1v1Match && introView(intro, viewConfig(), clockNow()).civHelpVisible);
  const baseOverlayWidth = isTeamMatch
    ? Math.max(Number(config.width) || 520, 720)
    : civHelpActiveNow
      ? Math.max(Number(config.width) || 520, 680)
      : (Number(config.width) || 520);
  const overlayWidth = Math.min(
    Math.max(300, workArea.width - 32),
    Math.round(baseOverlayWidth * Number(config.scale || 1) * overlayZoom),
  );
  const reviewWidth = Math.max(320, Math.min(Math.round(1080 * overlayZoom), workArea.width - 40));

  const offset = Math.max(0, Number(config.offsetY) || 0);
  const maxHeight = Math.max(200, workArea.height - offset - 16);
  const scaledHeight = Math.round(Number(height) * overlayZoom);
  const target = clamp(scaledHeight, 110, maxHeight);
  if (target < scaledHeight) {
    log(
      `alto recortado: el contenido pide ${scaledHeight} px y el monitor ` +
        `deja ${maxHeight} (workArea ${workArea.height}, offset ${offset}, zoom ${overlayZoom})`,
    );
  }
  const [currentWidth, currentHeight] = win.getContentSize();
  const width = moving ? currentWidth : reviewing ? reviewWidth : overlayWidth;

  let nextX = null;
  let nextY = null;
  if (reviewing) {
    nextX = Math.round(workArea.x + (workArea.width - width) / 2);
    nextY = Math.round(workArea.y + Number(config.offsetY || 0));
  } else if (!moving) {
    if (config.position === 'custom') {
      if (currentWidth !== width) {
        const position = initialPosition(width, target);
        nextX = position.x;
        nextY = position.y;
      }
    } else {
      nextX = Math.round(workArea.x + (workArea.width - width) / 2 + Number(config.offsetX || 0));
      nextY = Math.round(workArea.y + Number(config.offsetY || 0));
    }
  }

  if (
    lastAppliedBounds &&
    lastAppliedBounds.width === width &&
    lastAppliedBounds.height === target &&
    lastAppliedBounds.x === nextX &&
    lastAppliedBounds.y === nextY &&
    currentWidth === width &&
    currentHeight === target
  ) {
    return;
  }
  lastAppliedBounds = { width, height: target, x: nextX, y: nextY };

  if (currentWidth !== width || currentHeight !== target) {
    win.setContentSize(width, target);
  }
  if (nextX != null && nextY != null) {
    win.setPosition(nextX, nextY);
  }
}

/**
 * Modo mover: el panel pasa a ser arrastrable (se le devuelve el mouse y el foco)
 * y al confirmar se guarda dónde quedó. Después vuelve a ser click-through y
 * sin foco, así no molesta mientras jugás.
 */
function setMovable(enabled) {
  if (enabled && lastGood?.status === 'ongoing') return false;
  if (!win || win.isDestroyed()) {
    moving = false;
    return false;
  }

  moving = Boolean(enabled);
  clearTimeout(moveSaveTimer);

  if (moving) {
    if (minimizeController) minimizeController.cancelAndShow();
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
    syncReviewInteraction();
    if (minimizeController) minimizeController.recheck();
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

/** Acceso efectivo al postmatch. Nunca se deduce del reporte ya calculado. */
function postMatchAccess() {
  const view = viewConfig();
  const product = productState();
  const compareMode = ['both', 'personal', 'community'].includes(config.postMatchCompareMode)
    ? config.postMatchCompareMode : 'both';
  return {
    comparison: Boolean(view.postMatchComparison),
    compareMode,
    replay: Boolean(view.postMatchReplay),
    comparisonReason: product.featureAccess.postMatchComparison ? 'disabled' : 'pro',
    replayReason: product.featureAccess.postMatchReplay ? 'disabled' : 'pro',
  };
}

/** Recorta el reporte antes de cruzar el IPC: Free no recibe datos Pro. */
function visiblePostMatchReport() {
  if (!postMatchReport) return null;
  if (!productState().featureAccess.postMatch) return null;
  const access = postMatchAccess();
  const report = JSON.parse(JSON.stringify(postMatchReport));
  if (!access.comparison) {
    if (report.openingReview) report.openingReview.comparison = null;
    if (report.engine) report.engine.evolution = null;
    if (report.verdict) report.verdict.personal = null;
    if (report.narrative) report.narrative = null;
    report.historyHighlights = [];
    report.improvements = [];
    report.executionRatings = null;
    for (const metric of Object.values(report.metrics || {})) metric.comparison = null;
    for (const stage of report.stages || []) {
      for (const metric of stage.metrics || []) metric.comparison = null;
      if (stage.status === 'ready' || stage.status === 'needs_baseline') {
        stage.status = 'measured';
        stage.grade = stage.score = null;
        stage.sampleSize = 0;
        stage.summary = 'Indicadores medidos en esta partida.';
        stage.detail = 'Comparación personal desactivada.';
      }
    }
    report.mapBenchmark = {
      status: 'locked', games: 0, wins: 0, losses: 0, unknownResults: 0,
      winRate: null, afterWinRate: null, recent: [], sampleSize: 0,
      summary: 'La comparación con tu historial está incluida en Ultra.',
    };
  }
  if (!access.replay) {
    report.openingReview = null;
    report.castlesWindow = null;
    report.engine = null;
    report.stages = [];
    report.metrics = {};
    report.improvements = [];
    report.combat = null;
    report.executionRatings = null;
    report.context.opening = null;
    report.context.openingLabel = null;
    report.result.durationSeconds = null;
    report.analysis = {
      status: 'locked', label: 'Análisis de replay',
      detail: 'La descarga y el análisis del replay están incluidos en Ultra.',
    };
    report.data = {
      ...(report.data || {}),
      hasTelemetry: false,
      telemetryStatus: 'locked',
      sourceLabel: 'AoE2 Companion · resultados',
      warnings: [],
      telemetryNote: 'APM y ejecución por etapas están incluidos en Ultra.',
    };
  }
  return report;
}

function postMatchPayload() {
  return postMatchReport
    ? { report: visiblePostMatchReport(), access: postMatchAccess() }
    : null;
}

function reviewVisible() {
  if (!postMatchReport || postMatchOverlayDismissed) return false;
  if (!viewConfig().postMatch) return false;
  if (config.postMatchPopup === false && !exampleActive && !previewAutoHideTimer && !postMatchPreviewActive) return false;
  // Durante una partida el panel normal manda; el informe de la anterior no.
  return !(lastGood && lastGood.status === 'ongoing');
}

function clearPostMatchHide() {
  if (!postMatchHideTimer) return;
  clearTimeout(postMatchHideTimer);
  postMatchHideTimer = null;
}

/**
 * El overlay nunca captura clicks ni roba foco al juego (excepto en modo mover).
 * Todo se oculta automáticamente por temporizador o al comenzar otra partida.
 */
function syncReviewInteraction() {
  if (!win || win.isDestroyed() || moving) return;
  win.setFocusable(false);
  win.setIgnoreMouseEvents(true, { forward: true });
}

function overlayPostMatchPayload() {
  return reviewVisible() ? postMatchPayload() : null;
}

function schedulePostMatchHide(delayMs = null) {
  clearPostMatchHide();
  if (!reviewVisible()) return;
  const effectiveMs = delayMs != null ? Number(delayMs) : postMatchHideMs();
  // 0 = sin auto-cierre por tiempo (se cierra manualmente o al arrancar la próxima partida).
  if (!Number.isFinite(effectiveMs) || effectiveMs <= 0) return;
  postMatchHideTimer = setTimeout(() => {
    postMatchHideTimer = null;
    dismissPostMatch('tiempo de lectura terminado');
  }, effectiveMs);
}

/** Cierra el informe sin borrar el último resultado del historial. */
function dismissPostMatch(reason = 'cerrado', options = {}) {
  const force = Boolean(options && options.force);
  const wasVisible = Boolean(postMatchReport && !postMatchOverlayDismissed);
  if (!force && !wasVisible) return false;
  postMatchOverlayDismissed = true;
  postMatchPreviewActive = false;
  clearPostMatchHide();
  send('postmatch:update', null);
  if (win && !win.isDestroyed()) applyHeight(lastReportedCssHeight);
  syncReviewInteraction();
  if (minimizeController) minimizeController.recheck();
  if (wasVisible || force) log(`postmatch: informe cerrado (${reason})`);
  return true;
}

function broadcastPostMatch() {
  // El panel recibe null cuando el informe ya se cerró; Ajustes conserva el
  // último informe para poder consultarlo o actualizarlo por separado.
  send('postmatch:update', overlayPostMatchPayload());
  if (win && !win.isDestroyed()) applyHeight(lastReportedCssHeight);
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('postmatch:update', postMatchPayload());
  }
  syncReviewInteraction();
}

function latestStoredMatch() {
  if (postMatchMatch) return postMatchMatch;
  if (!profileId) return null;
  const record = performanceStore.listReadOnly(profileId)[0];
  return record && record.match ? record.match : null;
}

/**
 * Registra el resultado confirmado, descarga y analiza el replay, cruza el
 * historial público y publica el informe.
 *
 * El resultado se emite ANTES de esperar la red: cuando el overlay vuelve a
 * aparecer ya muestra "Descargando partida" y después "Analizando partida".
 * El usuario no tiene que importar nada. Se llama solo desde una transición en
 * vivo (o desde el modo ejemplo), nunca al arrancar con una partida histórica.
 */
async function publishPostMatch(match, options = {}) {
  const id = String(match.matchId);
  if (!options.force && postMatchLastId === id && postMatchReport) return postMatchReport;
  const persist = options.persist !== false;
  const targetProfileId = Number(options.profileId || profileId);
  const saved = persist
    ? (options.telemetry
      ? performanceStore.recordMatch(match, targetProfileId, options.telemetry)
      : performanceStore.recordMatch(match, targetProfileId))
    : null;
  if (persist && !saved) {
    log(`postmatch: la partida ${id} no se pudo registrar`);
    return null;
  }
  const generation = ++postMatchGeneration;
  const example = exampleActive;
  const isCurrent = () => generation === postMatchGeneration &&
    exampleActive === example &&
    (example ? Number(exampleProfileId) === targetProfileId : Number(profileId) === targetProfileId);
  postMatchLastId = id;
  postMatchMatch = match;
  // Por defecto (partida terminada en vivo) se abre en el overlay si el usuario
  // tiene el popup activado y NO hay ya otra partida en curso (p. ej. tras
  // resign rápido + re-cola inmediata). Al revisar partidas pasadas desde Ajustes
  // (`showOverlay: false`), permanece inline.
  const popupAllowed = options.forceOverlay === true || config.postMatchPopup !== false;
  const showOverlay = options.showOverlay !== false && popupAllowed && !matchOngoing();
  const allowAutoHide = showOverlay && options.autoHide !== false;
  postMatchOverlayDismissed = !showOverlay;
  clearPostMatchHide();

  let telemetry = options.telemetry || (saved && saved.telemetry) || null;
  const hadCachedTelemetry = Boolean(telemetry);
  const replayAllowed = Boolean(viewConfig().postMatch) && postMatchAccess().replay;
  const missingRichTelemetry = Boolean(telemetry?.engineSummary && !telemetry.engineSummary.self?.techProfile?.armyRelevance);
  const refreshLegacyReplay = Boolean(telemetry && (
    missingRichTelemetry ||
    (telemetry?.source?.id === 'aoe2rec-js' && telemetry.source.version !== COMMAND_ADAPTER_VERSION)
  ));
  const fetchingReplay = replayAllowed && options.autoReplay !== false && (!telemetry || refreshLegacyReplay || options.refreshReplay === true);
  let analysis = fetchingReplay && !hadCachedTelemetry
    ? { status: 'downloading', label: 'Descargando partida', detail: 'Buscando la grabación de la partida.' }
    : telemetry
    ? { status: 'ready', label: 'Análisis listo', detail: 'El replay ya estaba analizado.' }
    : { status: 'idle', label: 'Sin análisis de replay', detail: '' };

  let history = { rows: [], pending: postMatchAccess().comparison };
  const paint = () => {
    if (!isCurrent()) return;
    postMatchReport = buildPostMatchReport({
      match,
      profileId: targetProfileId,
      records: performanceStore.listReadOnly(targetProfileId),
      telemetry,
      historyRows: history.rows,
      historyError: history.error,
      historyPending: history.pending,
      analysis,
    });
    broadcastPostMatch();
  };
  // Ambos datos progresan de forma independiente. El análisis del replay no
  // se queda detrás de la paginación del historial.
  const historyPromise = history.pending ? fetchMyHistory({
    profileId: targetProfileId,
    leaderboardId: match.leaderboardId,
    currentMatchId: match.matchId,
    cache: statsCache,
    cacheTtlMs: options.refreshReplay ? 0 : 30 * 1000,
    log,
  }).catch((err) => ({ rows: [], error: err.message })).then((result) => {
    history = result;
    paint();
  }) : Promise.resolve();
  paint();
  if (allowAutoHide) {
    const customMs = postMatchHideMs();
    if (fetchingReplay) {
      schedulePostMatchHide(customMs > 0 ? Math.max(customMs, POSTMATCH_LOADING_MAX_MS) : POSTMATCH_LOADING_MAX_MS);
    } else if (customMs > 0) {
      schedulePostMatchHide(customMs);
    }
  }

  let error = null;
  if (fetchingReplay) {
    try {
      telemetry = await fetchReplayTelemetry(match, targetProfileId, {
        onStatus: (next) => {
          if (!hadCachedTelemetry) {
            analysis = next;
            paint();
          }
        },
      });
      analysis = { status: 'ready', label: 'Análisis listo', detail: 'Replay descargado y analizado.' };
    } catch (err) {
      error = err.message;
      analysis = hadCachedTelemetry
        ? { status: 'ready', label: 'Análisis listo', detail: 'Se conserva el análisis guardado.' }
        : {
          status: 'error', label: 'No se pudo analizar el replay',
          detail: err.message,
        };
      log(`postmatch: replay de #${id} no analizado: ${err.message}`);
    }
  }

  if (!isCurrent()) return null;
  if (telemetry && persist && fetchingReplay && !error) {
    const savedRec = performanceStore.recordMatch(match, targetProfileId, telemetry);
    maybeContributeBracketSample(savedRec);
    try {
      const prod = productState();
      if (allowsFeature(prod, 'trainingHub') && savedRec) {
        const allRecs = performanceStore.listReadOnly(targetProfileId);
        const trRes = trainingController.handleNewReplayRecord({
          profileId: targetProfileId,
          record: savedRec,
          records: allRecs,
          unlocked: true,
        });
        if (trRes.changed && settingsWin && !settingsWin.isDestroyed()) {
          settingsWin.webContents.send('training:update', trRes);
        }
      }
    } catch (trErr) {
      log(`training verify error: ${trErr.message}`);
    }
  }
  paint();
  if (allowAutoHide && fetchingReplay) schedulePostMatchHide();
  await historyPromise;
  if (!isCurrent()) return null;
  const result = postMatchReport && postMatchReport.result;
  log(
    `postmatch: ${match.mapName || '—'} · ${result ? result.label : 'sin resultado'} · ` +
      `${telemetry ? `replay listo (${telemetry.context.opening || 'apertura sin detectar'})` : `replay: ${error || 'no disponible'}`} · ` +
      `${history.rows.length} partidas de historial${history.error ? ` · error: ${history.error}` : ''}`,
  );
  return postMatchReport;
}

function attachProMatchupBrief(state) {
  if (!state || state.status !== 'ongoing' || !Array.isArray(state.players) || state.players.length !== 2) return state;
  let next = state;
  try {
    const { buildCivBattleBrief } = require('./src/civ-battle-brief');
    const civBattleBrief = buildCivBattleBrief(state);
    if (civBattleBrief) next = { ...next, civBattleBrief };
  } catch {}
  const you = state.players.find((p) => p && p.isYou);
  const rival = state.players.find((p) => p && !p.isYou);
  const mySlug = you ? civSlug(you.civ) : null;
  const rivSlug = rival ? civSlug(rival.civ) : null;
  if (!mySlug || !rivSlug || mySlug === rivSlug) return next;
  try {
    const { civMatchupBrief } = require('./src/training/pro-matchup-engine').lookupPrematchProIntel({
      myCivSlug: mySlug,
      rivalCivSlug: rivSlug,
      mapName: state.match?.mapName || 'Arabia',
    });
    return civMatchupBrief ? { ...next, proMatchupBrief: civMatchupBrief } : next;
  } catch {
    return next;
  }
}

function emit(state) {
  // Mientras el ejemplo está abierto, el panel le pertenece a esa partida de
  // prueba: ni el polling ni los sockets pueden reemplazarla por la partida
  // real del usuario. Solo pasan los estados marcados con `example`.
  if (exampleActive && !(state && state.example)) return false;
  state = attachProMatchupBrief(hideLobbyCivs(state));
  const signature = signatureOf(state);
  if (signature === lastSent) return false;
  lastSent = signature;
  const previous = lastGood;
  lastGood = state;
  if (state?.status === 'ongoing' && moving) setMovable(false);
  // Solo una partida que vimos EN VIVO y que termina con el mismo matchId
  // confirmado por la fuente puede generar un postmatch.
  const finished = completedMatchTransition(previous, state, profileId);
  if (finished) {
    preMatchGraceUntil = 0;
    lobbyGoneAt = 0;
    liveMatchAt = 0;
    if (queueWatcher) queueWatcher.clearMatch(finished.matchId);
    publishPostMatch(finished).catch((err) => log(`postmatch falló: ${err.message}`));
  }
  // Al empezar otra partida (incluida pre-partida rápida tras resign instantáneo),
  // se cierra incondicionalmente el popup anterior (aunque aún esté cargando).
  if (state && state.status === 'ongoing') {
    dismissPostMatch('partida en curso', { force: true });
    if (state.phase !== 'lobby') {
      lobbyGoneAt = 0;
      savegameBurstUntil = 0;
      queueEndedBurstUntil = 0;
      const liveId = state.match && state.match.matchId;
      // La partida ya arrancó en vivo (confirmada por REST): descartamos su pre-partida
      // para que ninguna réplica atrasada la resucite como PRE-PARTIDA minutos después,
      // y pasamos la sonda del carril rápido a modo en-partida (10 s).
      if (!state.example && liveId != null) {
        if (queueWatcher) queueWatcher.dismissMatch(liveId);
        if (fastLane && (!fastLane.paused || fastLane.pausedInLobby)) {
          fastLane.pause(liveId, { inLobby: false });
        }
      }
    }
  }

  // Partida nueva ⇒ el informe del rival y el consejo son los de la ANTERIOR.
  // Se borran acá, no cuando llegue la consulta nueva: si la partida es de
  // otro rival/mapa, durante los 1-9 s de carga se veían los datos viejos (y
  // si la consulta fallaba, quedaban para siempre).
  const ongoingId =
    state && state.status === 'ongoing' && state.match
      ? String(state.match.matchId ?? '')
      : null;
  if (ongoingId) lastOngoingAt = Date.now();
  if (ongoingId && ongoingId !== lastOngoingMatchId) {
    lastOngoingMatchId = ongoingId;
    clearRivalReports();
    clearScoutTips();
    if (allowsFeature(productState(), 'trainingHub')) {
      trainingController.notifyMatchStarted({ profileId: runtimeProfileId(), matchId: ongoingId, startedAt: Date.now() });
    }
    syncLiveArmedBuildTimer();
    // Asegurar que Windows DWM mantenga el overlay por encima del juego al detectar partida nueva.
    if (win && !win.isDestroyed() && !manuallyHiddenByHotkey && !(minimizeController && minimizeController.isHiddenByMinimized())) {
      win.setAlwaysOnTop(true, 'screen-saver');
      if (!win.isVisible()) win.showInactive();
    }
  }
  if (!ongoingId) lastOngoingMatchId = null;

  send('overlay:state', projectOverlayState(state, productState()));
  sendBuildOrder();
  syncIntro(state);
  // El informe del rival NO bloquea: se dispara y llega cuando esté listo.
  refreshRivalReports(state).catch(() => {});
  // El consejo pre-partida tampoco: solo vive en la fase `lobby`.
  refreshScoutTips(state).catch(() => {});
  // El head-to-head es otro cálculo en segundo plano, sobre MI historial.
  refreshH2H(state).catch(() => {});
  // Smurf Detector (Ultra): cruza cuentas vinculadas, WR, pico y eAPM en paralelo.
  refreshSmurfReports(state).catch(() => {});
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
/**
 * Alto MÁXIMO útil del panel: área de trabajo del monitor menos el margen
 * superior. El panel no tiene scroll, así que esto es lo que el renderer usa
 * para saber cuánto tiene que encogerse cuando el contenido no entra.
 */
function panelMaxHeight() {
  if (!win || win.isDestroyed()) return 0;
  const display = screen.getDisplayMatching(win.getBounds());
  const offset = Math.max(0, Number(config.offsetY) || 0);
  const zoom = computeAdaptiveZoom(display, 'overlay');
  return Math.max(200, Math.round((display.workArea.height - offset - 16) / zoom));
}

/** Reenvía el modo de scouting activo (compacto / detalle) al renderer. */
function sendDetail() {
  send('overlay:detail', { detail: detailMode });
}

/*
 * El atajo F2 es una OPCIÓN, no una imposición: `globalShortcut` captura la
 * tecla en TODO Windows mientras el overlay corre (renombrar en el
 * Explorador, Excel, lo que sea). De fábrica (scoutF2 apagado) F2 queda
 * libre y el informe del rival se muestra completo. Encendido, arranca en
 * resumen y F2 alterna resumen <-> detalle.
 */
function syncDetailShortcut() {
  const wanted = Boolean(viewConfig().scoutF2);
  // Las capturas aisladas no deben reservar F2 en el escritorio del usuario.
  if (SHOT && DEMO) { f2Registered = wanted; return true; }
  if (wanted === f2Registered) return true;
  if (!wanted) {
    globalShortcut.unregister('F2');
    f2Registered = false;
    return true;
  }
  f2Registered = globalShortcut.register('F2', () => {
    detailMode = !detailMode;
    sendDetail();
    log(`scouting: ${detailMode ? 'detalle (F2 para resumen)' : 'resumen (F2 para detalle)'}`);
  });
  if (!f2Registered) {
    log('no pude registrar F2: otro proceso ya usa ese atajo; se muestra el informe completo');
    config.scoutF2 = false;
    detailMode = false;
    send('overlay:config', overlayConfig());
    return false;
  }
  return true;
}

function sendView(force = false) {
  const now = clockNow();
  const view = introView(intro, viewConfig(), now);
  const maxHeight = panelMaxHeight();
  const signature = `${view.eloHidden ? 1 : 0}${view.civHelpVisible ? 1 : 0}${exampleClockMode}:${maxHeight}`;
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
    // Techo real de la ventana: si el contenido lo pasa, el renderer lo escala
    // (en vez de recortar la última tarjeta, que es lo que pasaba).
    maxHeight,
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
  const now = clockNow();
  let effectiveState = state;
  if (
    !exampleActive &&
    !DEMO &&
    state &&
    state.status === 'ongoing' &&
    state.phase !== 'lobby' &&
    state.match &&
    Number.isFinite(state.match.startedAt)
  ) {
    const matchId = String(state.match.matchId ?? 'sin-id');
    const isNewMatchIntro = !intro || intro.matchId !== matchId;
    const rawElapsed = now - state.match.startedAt;
    // Anclar el reloj UNA sola vez al instante local exacto (`now`) en que la
    // partida entra en vivo (descartando el desfase de pantalla de carga,
    // indexación de Companion o reloj de servidor). Así el tiempo configurado
    // en Ajustes (`hideAtSeconds`) se cumple con fidelidad al segundo exacto,
    // sin robos ni reinicios a mitad de cuenta regresiva. Si la app se abrió
    // en medio de una partida vieja (> 2.5 min), se conserva `startedAt` real
    // para que `engaged` quede en false y no se oculte el overlay de golpe.
    if (isNewMatchIntro && rawElapsed <= 150 * 1000) {
      effectiveState = {
        ...state,
        match: { ...state.match, startedAt: now },
      };
    }
  }
  intro = trackIntro(intro, effectiveState, now);

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
    // Si la autodetección falló al iniciar (p. ej. tras actualizar por timeout/firewall),
    // reintentamos cada 15 s para que el usuario no quede sin detección de partidas.
    if (!profileId && !NO_PROFILE && !config.profileId && Date.now() - lastAutoDetectRetryAt >= 15000) {
      lastAutoDetectRetryAt = Date.now();
      try {
        const detected = await detectProfile(log);
        if (detected && detected.profileId) {
          log(`perfil auto-detectado en reintento: ${detected.alias || 'sin alias'} (${detected.profileId})`);
          polling = false;
          setRuntimeProfile(detected.profileId, detected.alias);
          return lastStatus;
        }
      } catch {
        /* se reintenta en el próximo ciclo */
      }
    }

    // Si el jugador abandonó rápido una partida y ya se apareó en la siguiente
    // por WebSocket, el REST puede reportar todavía la partida vieja como
    // `ongoing` por 15-45 s. Nunca dejamos que esa partida vieja pise el lobby
    // nuevo ni borre su scouting.
    const isStaleRestOngoing = (state) => {
      if (!state || state.status !== 'ongoing' || !matchFoundActive()) return false;
      const activeId = queueWatcher?.matched?.matchId ?? queueWatcher?.pendingMatchId ?? null;
      const restId = state.match?.matchId ?? null;
      if (activeId == null || restId == null || String(restId) === String(activeId)) return false;
      const restStarted = Number(state.match?.startedAt || 0);
      return !restStarted || restStarted < liveMatchAt - 5000;
    };

    const snapshot = await buildSnapshot({
      profileId,
      cache: statsCache,
      cacheTtlMs: Number(config.statsCacheMinutes || 15) * 60 * 1000,

      // Primera fase: roster en pantalla sin esperar al backend. El ELO se
      // muestra como `…` hasta que llega RM 1v1; nunca se usa el ELO del modo.
      onPartial: (partial) => {
        if (isStaleRestOngoing(partial)) return;
        if (!emit(partial)) return;
        if (partial.status === 'ongoing') {
          log(`partida detectada en ${Date.now() - startedAt}ms · roster en pantalla, pidiendo ELO RM 1v1`);
        }
      },
    });

    if (isStaleRestOngoing(snapshot)) {
      log(
        `REST ignorado: reportó partida previa #${snapshot.match?.matchId} como ongoing mientras ya hay sala nueva #${queueWatcher?.matched?.matchId ?? queueWatcher?.pendingMatchId}`,
      );
      lastPollAt = Date.now();
      lastPollStatus = 'lobby';
      return 'lobby';
    }

    // Mientras hay sala abierta el REST todavía no lista la partida (no
    // empezó): el panel se queda con la sala y no parpadea a "sin partida".
    // ...pero SOLO mientras el panel no esté mostrando ya la partida en curso:
    // si la está mostrando, un idle del REST es el FIN real. Tragárselo dejaba
    // la partida anterior trabada en pantalla hasta que el socket avisara (y a
    // veces el aviso no llega).
    const showingLive = Boolean(
      lastGood && lastGood.status === 'ongoing' && lastGood.phase !== 'lobby',
    );
    // Una partida EN PANTALLA no se borra por un `idle` del REST salvo que ese
    // mismo matchId ya figure como último jugado (fin real). El REST tarda en
    // listar la partida y el feed de cola la suelta al arrancar: antes eso
    // hacía parpadear "Sin partida" en medio de una partida real.
    const matchFinished = Boolean(
      lastGood &&
        lastGood.status === 'ongoing' &&
        lastGood.match &&
        snapshot.lastMatch &&
        String(snapshot.lastMatch.matchId ?? '') === String(lastGood.match.matchId ?? ''),
    );
    if (matchFinished) {
      preMatchGraceUntil = 0;
      lobbyGoneAt = 0;
      liveMatchAt = 0;
      liveLobbyAt = 0;
      if (queueWatcher) queueWatcher.clearMatch(lastGood.match.matchId);
    }
    // Si el REST dice idle y ya no hay sala activa, reactivar el carril rápido
    // SIEMPRE antes de cualquier gracia: si hubo dodge o resign rápido y el
    // jugador vuelve a buscar partida enseguida, la detecta en ~1,5 s.
    if (snapshot.status === 'idle' && fastLane && !lobbyActive()) {
      fastLane.resume();
    }
    const holdingOngoing = Boolean(
      lastGood &&
        lastGood.status === 'ongoing' &&
        lastGood.phase === 'lobby' &&
        !matchFinished &&
        Date.now() - lastOngoingAt < ONGOING_HOLD_MS,
    );
    if (
      snapshot.status === 'idle' &&
      !showingLive &&
      !matchFinished &&
      (lobbyActive() || Date.now() < preMatchGraceUntil || holdingOngoing)
    ) {
      // Todavía en la pantalla de carga: el REST no la lista pero el panel ya
      // tiene el roster. No lo reemplazamos por "Sin partida".
      lastPollAt = Date.now();
      lastPollStatus = 'lobby';
      return 'idle';
    }

    // Si el perfil está en modo automático y el usuario cambió de cuenta en Steam
    // con Relic abierto en segundo plano, cambiamos de perfil automáticamente.
    if (snapshot.status === 'idle' && !config.profileId && Date.now() - lastSteamCheckAt >= 12000) {
      lastSteamCheckAt = Date.now();
      const activeSteam = await getActiveSteamIdAsync();
      if (activeSteam && activeSteam.steamId && activeSteam.steamId !== lastActiveSteamId) {
        const previousSteam = lastActiveSteamId;
        lastActiveSteamId = activeSteam.steamId;
        if (previousSteam) {
          resolveSteamId(activeSteam.steamId)
            .then((found) => {
              if (found && found.profileId && Number(found.profileId) !== Number(profileId)) {
                log(`cambio de cuenta Steam detectado en vivo: ${found.alias || activeSteam.steamId} (${found.profileId})`);
                setRuntimeProfile(found.profileId, found.alias);
              }
            })
            .catch(() => {});
        }
      }
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

    poll429Streak = 0;
    pollRateLimitUntil = 0;
    lastStatus = snapshot.status;
    lastPollAt = Date.now();
    lastPollStatus = snapshot.status;
    return snapshot.status;
  } catch (err) {
    const isRateLimit = Number(err && err.status) === 429 || /HTTP 429|too many requests/i.test(String(err && err.message || ''));
    if (isRateLimit) {
      const retryMs = Number(err && err.retryAfterMs) || 0;
      const backoffMs = Math.max(retryMs, Math.min(120000, 20000 * 2 ** Math.min(poll429Streak, 3)));
      poll429Streak += 1;
      pollRateLimitUntil = Date.now() + backoffMs;
      log(`rate limit en AoE2 Companion (HTTP 429): pauso polling REST ${Math.round(backoffMs / 1000)}s (WebSocket sigue activo)`);
    } else {
      log(`error: ${err.message}`);
    }
    if (lastGood) {
      // Si ya hay una partida real/sala en pantalla y solo hubo 429 de fondo, no ensuciar el panel.
      if (!isRateLimit || lastGood.status !== 'ongoing') {
        send('overlay:state', projectOverlayState({ ...lastGood, stale: true, error: err.message }, productState()));
      }
    } else {
      send('overlay:state', { status: 'error', message: err.message });
    }
    lastStatus = 'error';
    lastPollAt = Date.now();
    lastPollStatus = isRateLimit ? 'rate-limited' : 'error';
    return 'error';
  } finally {
    polling = false;
    if (pendingSavegamePoll && !exampleActive && !DEMO && profileId) {
      pendingSavegamePoll = false;
      setTimeout(() => {
        poll().then((next) => scheduleNext(next)).catch(() => {});
      }, 250);
    }
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
  const now = Date.now();
  if (pollRateLimitUntil > now) {
    const waitMs = Math.max(2000, pollRateLimitUntil - now);
    timer = setTimeout(async () => {
      const next = await poll();
      scheduleNext(next);
    }, waitMs);
    return;
  }
  const hidden = introView(intro, viewConfig(), clockNow()).eloHidden;
  const ongoingMs = hidden ? Math.min(slowMs(), 6000) : slowMs();
  // Si el WebSocket de matchmaking está sano y recibiendo eventos en vivo, no
  // martillamos /api/matches cada 3 s (evita bloqueos HTTP 429 de Companion).
  // Pero justo al cerrar el lobby, terminar la cola sin sala apareada o detectarse
  // un savegame nuevo en disco, aceleramos a 2–2,5 s para capturar la partida al instante.
  const wsHealthy = Boolean(queueWatcher && queueWatcher.isHealthy);
  const inLobbyTransition = Boolean(lobbyGoneAt && now - lobbyGoneAt < 30000);
  const inSavegameBurst = Boolean(savegameBurstUntil && now < savegameBurstUntil);
  const inQueueEndBurst = Boolean(queueEndedBurstUntil && now < queueEndedBurstUntil);
  const fastRestBurst = inLobbyTransition || inQueueEndBurst;
  const idleDelay = inSavegameBurst
    ? 2000
    : fastRestBurst
      ? 2500
      : (wsHealthy ? Math.max(fastMs(), 10000) : Math.max(fastMs(), 4000));
  const queueDelay = inSavegameBurst
    ? 2000
    : fastRestBurst
      ? 2500
      : (wsHealthy ? Math.max(fastMs(), 4000) : Math.max(fastMs(), 2500));
  const delay = status === 'ongoing' ? ongoingMs : searching ? queueDelay : idleDelay;
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

let startupDetectPromise = null;

function readCachedDiskProfile() {
  try {
    if (!fs.existsSync(CENTRAL_CACHE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(CENTRAL_CACHE_PATH, 'utf8'));
    const pid = Number(parsed?.profileId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const alias = parsed?.raw?.profileData?.name || null;
    return { profileId: pid, alias };
  } catch {
    return null;
  }
}

async function ensureProfileReady() {
  if (profileId || NO_PROFILE || DEMO) return;
  if (startupDetectPromise) {
    await Promise.race([
      startupDetectPromise,
      new Promise((resolve) => setTimeout(resolve, 3500)),
    ]);
  }
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

  const needsAutoDetect = !config.profileId;
  if (config.profileId) {
    profileId = Number(config.profileId);
    log(`profile_id desde config.json: ${profileId}`);
  } else {
    // Sembrar al instante el último perfil auto-detectado (o el de central-cache.json) para que
    // Central y Mi cuenta abran cargados en t=0ms mientras se verifica Steam en segundo plano.
    const cachedDisk = readCachedDiskProfile();
    const seededPid = Number(config.autoProfileId) > 0
      ? Number(config.autoProfileId)
      : (cachedDisk?.profileId || null);
    const seededAlias = config.autoAlias || cachedDisk?.alias || null;
    if (seededPid) {
      profileId = seededPid;
      playerAlias = seededAlias;
      log(`profile_id auto-sembrado al instante: ${playerAlias || 'sin alias'} (${profileId})`);
    } else {
      log('config.json sin profileId: detectando la cuenta del juego…');
    }
  }
  initMinimizeWatcher();
  createWindow();
  screen.on('display-metrics-changed', () => {
    applyAdaptiveZoom(win, 'overlay');
    applyAdaptiveZoom(settingsWin, 'settings');
    sendView(true);
  });
  syncAutoStartWithWindows(config.openAtLogin !== false);
  if (profileId) {
    startPolling();
    startLive();
  }
  // Precargar huella de hardware en segundo plano (SMBIOS + placa + disco, sin bloquear arranque)
  licenseClient.initHardwareProfile().catch(() => {});
  if (needsAutoDetect) {
    startupDetectPromise = detectProfile(log)
      .then((detected) => {
        if (detected && detected.localProof) {
          verifiedLocalDetection = detected;
          if (cachedReferralsState?.myReferral?.status === 'pending') {
            scheduleReferralActivationAttempt(2500);
          }
        }
        if (detected && Number(detected.profileId) > 0) {
          persistConfig({ autoProfileId: Number(detected.profileId), autoAlias: detected.alias || null });
          const changed = Number(profileId) !== Number(detected.profileId);
          if (changed) {
            log(`perfil detectado: ${detected.alias || 'sin alias'} (${detected.profileId})`);
            setRuntimeProfile(detected.profileId, detected.alias);
          } else if (detected.alias && playerAlias !== detected.alias) {
            playerAlias = detected.alias;
          }
          if (settingsWin && !settingsWin.isDestroyed()) {
            settingsWin.webContents.send('settings:profile-detected', {
              profileId: Number(detected.profileId),
              alias: detected.alias || playerAlias || null,
              changed,
            });
          }
        } else if (!profileId) {
          log('no pude detectar el perfil; abro la configuración para elegir la cuenta');
          startPolling();
        }
      })
      .catch((err) => {
        log(`detección falló: ${err.message}`);
        if (!profileId) startPolling();
      })
      .finally(() => {
        startupDetectPromise = null;
      });
  }

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

  if (AUTOSTART && config.wizardCompleted && !SETTINGS) {
    log('arranque silencioso con Windows (--autostart): Relic activo en bandeja esperando Age of Empires II: DE');
  } else {
    openSettings();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('ya hay otra instancia corriendo: esta se cierra');
  app.quit();
} else {
  app.whenReady().then(() => {
    // Log acotado: si supera 1,5 MB se recorta conservando los últimos 400 KB.
    rotateLogFileIfOversized(LOG_PATH, 1_500_000, 400_000);

    // La bandeja va ANTES de crear ventanas: si algo falla en bootstrap, igual
    // queda una forma de reabrir la config y de salir limpiamente.
    createTray();

    // Actualizaciones: diferido 5s para no frenar el arranque con require('electron-updater').
    setTimeout(() => {
      if (isQuitting) return;
      try {
        const { initAutoUpdate } = require('./src/updater');
        updater = initAutoUpdate({
          app,
          log,
          enabled: !DEV_SESSION,
          isBusy: matchOngoing,
          // Opción "Actualizaciones automáticas" de la pestaña Updater: consulta
          // cada 30 min y aplica sola lo que encuentre (siempre fuera de partida).
          isAuto: () => Boolean(config.autoUpdate),
          onNotice: showUpdateNotice,
          broadcast: (snapshot) => {
            if (settingsWin && !settingsWin.isDestroyed()) {
              settingsWin.webContents.send('updater:status', snapshot);
            }
          },
        });
      } catch (err) {
        log(`updater diferido falló: ${err.message}`);
      }
    }, 5000);

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
    bootstrap()
      .then(() => {
        if (!DEV_SESSION) {
          ensureWindowsToastIdentity();
          scheduleRemoteLicenseChecks();
          syncRemoteLicense('startup').catch(() => {});
          if (loadSessionToken()) fetchCurrentReferralsState().catch(() => {});
          if (!config.wizardCompleted) openSettings();
        }
      })
      .catch((err) => log(`bootstrap falló: ${(err && (err.stack || err.message)) || err}`));

    globalShortcut.register('Control+Alt+E', () => toggleOverlay());

    // Al volver de suspensión o desbloquear Windows los websockets suelen quedar
    // silenciosamente muertos: reiniciamos detección en vivo y refrescamos.
    if (powerMonitor && typeof powerMonitor.on === 'function') {
      const recoverLive = (reason) => {
        if (!DEV_SESSION) {
          const cur = productState();
          // Al despertar de suspensión/bloqueo, un JWT corto pudo vencer en sueño:
          // marcar 'refreshing' evita un falso downgrade Free→Ultra antes de revalidar.
          if (cur.plan === 'free' && remoteLicenseState && remoteLicenseState.status === 'verified') {
            remoteLicenseState = { ...remoteLicenseState, status: 'refreshing', reason: 'resume' };
          }
          refreshAccessPresentation(cur);
          syncRemoteLicense('resume').catch(() => {});
        }
        if (!profileId || DEMO || NO_PROFILE) return;
        log(`sistema ${reason}: reconectando detección en vivo de partidas`);
        startLive();
        poll().catch(() => {});
      };
      powerMonitor.on('resume', () => recoverLive('reanudado'));
      powerMonitor.on('unlock-screen', () => recoverLive('desbloqueado'));
    }

    globalShortcut.register('Control+Alt+S', () => {
      log('abriendo configuración (Ctrl+Alt+S)');
      openSettings();
    });

    globalShortcut.register('Control+Alt+R', () => {
      log('refresh manual: reiniciando sockets en vivo y consultando');
      pollRateLimitUntil = 0;
      poll429Streak = 0;
      startLive();
      poll();
    });

    globalShortcut.register('Control+Alt+Q', () => {
      log('cerrando por hotkey');
      quitApp('hotkey Ctrl+Alt+Q');
    });

    // F2: resumen <-> detalle. SOLO si la opción "Resumen con F2" está
    // encendida (de fábrica no: sin permiso explícito no se captura una
    // tecla global). El overlay es click-through, así que con la opción
    // activa el atajo es la única forma de abrir el detalle.
    syncDetailShortcut();
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
    flushConfigSync();
    statsCache.flush();
    performanceStore.flush();
    trainingController.flush();
    flushLogsSync();
    globalShortcut.unregisterAll();
    clearInterval(timer);
    clearInterval(heartbeatTimer);
    clearTimeout(introTimer);
    stopLive();
    if (gameWindowWatcher) gameWindowWatcher.stop();
    if (minimizeController) minimizeController.dispose();
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
