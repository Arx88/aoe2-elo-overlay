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
 * ocurre al salir de la app, momento en el que el jugador ya terminó. Si no
 * hay red, simplemente se reintenta solo.
 *
 * Expone un `status` para la sección "Updater" del panel de configuración.
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

/** releaseNotes puede venir como string, como array de {version, note} o null. */
function notesOf(info) {
  const raw = info && info.releaseNotes;
  const chunks = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') chunks.push(item);
      else if (item && item.note) chunks.push(String(item.note));
    }
  } else if (typeof raw === 'string') {
    chunks.push(raw);
  }
  return chunks
    .join('\n')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*#]+\s*/, '').replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function disabled(app) {
  const status = {
    active: false,
    current: app && app.getVersion ? app.getVersion() : '—',
    latest: null,
    available: false,
    checking: false,
    downloading: false,
    percent: 0,
    ready: false,
    skipped: false,
    error: null,
    notes: [],
    checkedAt: null,
    deferred: false,
  };
  return {
    active: false,
    status,
    getStatus: () => ({ ...status }),
    check: () => {},
    download: () => {},
    install: () => {},
    skip: () => {},
    hasPending: () => false,
    stop: () => {},
  };
}

function initAutoUpdate(options = {}) {
  const {
    app,
    log = () => {},
    isBusy = () => false,
    enabled = true,
    broadcast = () => {},
    checkIntervalMs = DEFAULT_CHECK_MS,
  } = options;

  if (!enabled || !app || !app.isPackaged) return disabled(app);

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    log(`update · desactivado: no pude cargar electron-updater (${text(err)})`);
    return disabled(app);
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

  const status = {
    active: true,
    current: app.getVersion(),
    latest: null,
    available: false,
    checking: false,
    downloading: false,
    percent: 0,
    ready: false,
    skipped: false,
    error: null,
    notes: [],
    checkedAt: null,
    deferred: false,
  };

  let lastCheck = 0;
  let pendingInfo = null;
  let downloading = false;
  let readyToInstall = false;
  let closed = false;
  let lastBucket = -1;

  function emitStatus() {
    const snapshot = { ...status };
    try {
      broadcast(snapshot);
    } catch (err) {
      say(`no pude avisar al panel: ${text(err)}`);
    }
  }
  function patch(changes) {
    Object.assign(status, changes);
    emitStatus();
  }

  autoUpdater.on('checking-for-update', () => {
    say('consultando última versión');
    patch({ checking: true, error: null });
  });

  autoUpdater.on('update-available', (info) => {
    pendingInfo = info || {};
    say(`disponible v${pendingInfo.version || '?'} (instalada v${app.getVersion()})`);
    patch({
      latest: pendingInfo.version || null,
      available: true,
      checking: false,
      checkedAt: Date.now(),
      notes: notesOf(pendingInfo),
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    say('ya estás en la última versión');
    patch({
      latest: (info && info.version) || app.getVersion(),
      available: false,
      checking: false,
      checkedAt: Date.now(),
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress && progress.percent) || 0));
    patch({ percent, downloading: true });
    const bucket = Math.floor(percent / 25);
    if (bucket !== lastBucket) {
      lastBucket = bucket;
      say(`descarga ${Math.round(percent)}%`);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    readyToInstall = true;
    downloading = false;
    pendingInfo = null;
    say(`v${(info && info.version) || '?'} descargada · se instala al salir, sin cortar la partida`);
    patch({
      ready: true,
      downloading: false,
      percent: 100,
      latest: (info && info.version) || status.latest,
    });
  });

  autoUpdater.on('error', (err) => {
    downloading = false;
    const message = text(err);
    say(`falló: ${message} · se reintenta solo`);
    patch({ checking: false, downloading: false, error: message });
  });

  let checkTimeout = null;
  function clearCheckTimeout() {
    if (checkTimeout) {
      clearTimeout(checkTimeout);
      checkTimeout = null;
    }
  }

  /**
   * Devuelve una promesa que se resuelve con el resultado FINAL de la consulta.
   * Es clave: el IPC `updater:check` la espera, así el panel nunca recibe un
   * estado intermedio con `checking: true` que quede colgado en pantalla.
   */
  function check(reason = 'automática') {
    if (closed || readyToInstall || downloading) return Promise.resolve(null);
    if (isBusy()) {
      say(`consulta pospuesta: hay partida en curso (${reason})`);
      patch({ checking: false, deferred: true });
      return Promise.resolve(null);
    }

    lastCheck = Date.now();
    patch({ checking: true, error: null, deferred: false });
    clearCheckTimeout();

    // Red de seguridad: si el proveedor no emite NINGÚN evento (red cortada,
    // timeout raro), igual sacamos el cartel de "buscando" a los 30 s.
    checkTimeout = setTimeout(() => {
      checkTimeout = null;
      say('la consulta tardó demasiado: corto el estado "buscando"');
      patch({ checking: false, error: 'La consulta tardó demasiado.' });
    }, 30000);
    if (typeof checkTimeout.unref === 'function') checkTimeout.unref();

    return Promise.resolve(autoUpdater.checkForUpdates())
      .then((result) => {
        clearCheckTimeout();
        // update-available / update-not-available ya dejaron el estado
        // definitivo. Esto garantiza que `checking` NO quede en true aunque
        // el proveedor no haya emitido ninguno de los dos eventos.
        patch({ checking: false, checkedAt: Date.now() });
        return result;
      })
      .catch((err) => {
        clearCheckTimeout();
        say(`consulta falló: ${text(err)} · se reintenta solo`);
        patch({ checking: false, error: text(err) });
        return null;
      });
  }

  function download() {
    if (closed || readyToInstall || downloading || !pendingInfo || isBusy()) return;
    downloading = true;
    patch({ downloading: true, percent: 0, error: null });
    say(`descargando v${pendingInfo.version || '?'}`);
    Promise.resolve(autoUpdater.downloadUpdate()).catch((err) => {
      downloading = false;
      say(`descarga falló: ${text(err)} · se reintenta solo`);
      patch({ downloading: false, error: text(err) });
    });
  }

  function install() {
    if (!readyToInstall) return;
    say('instalando a pedido del usuario');
    autoUpdater.quitAndInstall(false, true);
  }

  function skip() {
    status.skipped = true;
    autoUpdater.autoInstallOnAppQuit = false;
    say('omitida por el usuario: no se instala al salir en esta sesión');
    emitStatus();
  }

  const startTimer = setTimeout(() => check('arranque'), START_DELAY_MS);
  const tickTimer = setInterval(() => {
    if (closed || readyToInstall || isBusy()) return;
    if (pendingInfo && !downloading) download();
    if (!pendingInfo && Date.now() - lastCheck >= checkIntervalMs) check('periódica');
  }, TICK_MS);

  if (typeof startTimer.unref === 'function') startTimer.unref();
  if (typeof tickTimer.unref === 'function') tickTimer.unref();

  say(`activo · v${app.getVersion()} · consulta cada ${Math.round(checkIntervalMs / 3600000)} h`);
  emitStatus();

  return {
    active: true,
    status,
    getStatus: () => ({ ...status }),
    check,
    download,
    install,
    skip,
    hasPending: () => readyToInstall,
    stop: () => {
      closed = true;
      clearTimeout(startTimer);
      clearInterval(tickTimer);
    },
  };
}

module.exports = { initAutoUpdate };
