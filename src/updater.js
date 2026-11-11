'use strict';

/**
 * Actualizaciones automáticas del overlay (solo en la app EMPAQUETADA).
 *
 * Canal: GitHub Releases. electron-builder genera `app-update.yml` dentro del
 * `app.asar` a partir del bloque `publish` de electron-builder.json, y en cada
 * release publica `latest.yml` + el instalador NSIS + su `.blockmap` (delta).
 *
 * Regla de producto: esto es un overlay de AoE2, así que NUNCA consulta ni
 * descarga mientras hay una partida en curso. La instalación es silenciosa y
 * ocurre al salir de la app (`autoInstallOnAppQuit`), momento en el que el
 * jugador ya terminó. Si no hay red, simplemente se reintenta solo.
 *
 * No se requiere `electron` a nivel de módulo: `electron-updater` se carga de
 * forma diferida para que `npm run selftest` (Node plano) siga funcionando.
 */

const DEFAULT_CHECK_MS = 6 * 60 * 60 * 1000;
const TICK_MS = 60 * 1000;
const START_DELAY_MS = 20 * 1000;

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && value.message) return String(value.message);
  return String(value);
}

function disabled() {
  return { active: false, check: () => {}, hasPending: () => false, stop: () => {} };
}

function initAutoUpdate(options = {}) {
  const {
    app,
    log = () => {},
    isBusy = () => false,
    enabled = true,
    checkIntervalMs = DEFAULT_CHECK_MS,
  } = options;

  if (!enabled || !app || !app.isPackaged) return disabled();

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    log(`update · desactivado: no pude cargar electron-updater (${text(err)})`);
    return disabled();
  }

  const say = (message) => log(`update · ${message}`);

  autoUpdater.logger = {
    info: (message) => say(text(message)),
    warn: (message) => say(`aviso: ${text(message)}`),
    error: (message) => say(`error: ${text(message)}`),
    debug: () => {},
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let lastCheck = 0;
  let pendingInfo = null;
  let downloading = false;
  let readyToInstall = false;
  let closed = false;
  let lastBucket = -1;

  autoUpdater.on('checking-for-update', () => say('consultando última versión'));

  autoUpdater.on('update-available', (info) => {
    pendingInfo = info || {};
    say(`disponible v${pendingInfo.version || '?'} (instalada v${app.getVersion()})`);
  });

  autoUpdater.on('update-not-available', () => say('ya estás en la última versión'));

  autoUpdater.on('download-progress', (progress) => {
    const percent = Number(progress && progress.percent) || 0;
    const bucket = Math.floor(percent / 25);
    if (bucket === lastBucket) return;
    lastBucket = bucket;
    say(`descarga ${Math.round(percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    readyToInstall = true;
    downloading = false;
    pendingInfo = null;
    say(`v${(info && info.version) || '?'} descargada · se instala al salir, sin cortar la partida`);
  });

  autoUpdater.on('error', (err) => {
    downloading = false;
    say(`falló: ${text(err)} · se reintenta solo`);
  });

  function check(reason = 'automática') {
    if (closed || readyToInstall || downloading) return;
    if (isBusy()) {
      say(`consulta pospuesta: hay partida en curso (${reason})`);
      return;
    }
    lastCheck = Date.now();
    Promise.resolve(autoUpdater.checkForUpdates()).catch((err) => {
      say(`consulta falló: ${text(err)} · se reintenta solo`);
    });
  }

  function downloadIfPossible() {
    if (closed || readyToInstall || downloading || !pendingInfo || isBusy()) return;
    downloading = true;
    say(`descargando v${pendingInfo.version || '?'}`);
    Promise.resolve(autoUpdater.downloadUpdate()).catch((err) => {
      downloading = false;
      say(`descarga falló: ${text(err)} · se reintenta solo`);
    });
  }

  const startTimer = setTimeout(() => check('arranque'), START_DELAY_MS);
  const tickTimer = setInterval(() => {
    if (closed || readyToInstall || isBusy()) return;
    downloadIfPossible();
    if (!pendingInfo && Date.now() - lastCheck >= checkIntervalMs) check('periódica');
  }, TICK_MS);

  // No mantener vivo el proceso solo por los timers (la bandeja ya lo hace).
  if (typeof startTimer.unref === 'function') startTimer.unref();
  if (typeof tickTimer.unref === 'function') tickTimer.unref();

  say(`activo · v${app.getVersion()} · consulta cada ${Math.round(checkIntervalMs / 3600000)} h`);

  return {
    active: true,
    check,
    hasPending: () => readyToInstall,
    stop: () => {
      closed = true;
      clearTimeout(startTimer);
      clearInterval(tickTimer);
    },
  };
}

module.exports = { initAutoUpdate };
