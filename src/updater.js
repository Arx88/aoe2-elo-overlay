'use strict';

/**
 * Actualizaciones automáticas del overlay (solo en la app EMPAQUETADA).
 *
 * Canal: GitHub Releases. electron-builder genera `app-update.yml` dentro del
 * `app.asar` a partir del bloque `publish` de electron-builder.json, y en cada
 * release publica `latest.yml` + el instalador NSIS + su `.blockmap` (delta).
 *
 * Regla de producto: esto es un overlay de AoE2, así que NUNCA consulta ni
 * descarga mientras hay una partida en curso. La instalación es SIEMPRE
 * silenciosa (NSIS con /S), tanto al salir de la app como al apretar
 * "Actualizar ahora"; en ese último caso la app se reabre sola (--force-run).
 * En Windows el binario no se puede reemplazar en caliente: siempre hay un
 * cierre breve, el swap y la reapertura. Si no hay red, se reintenta solo.
 *
 * Regla de versiones: tener una versión descargada NO impide volver a buscar.
 * Si aparece una más nueva, la descarga anterior se descarta y se baja solo la
 * última. Nunca se instala una versión vieja. Consultas: al arranque, cada 6 h,
 * y cada 30 min mientras haya una actualización pendiente.
 *
 * Expone un `status` para la sección "Updater" del panel de configuración y un
 * callback `onNotice` para la notificación de Windows y el aviso del overlay.
 * No se requiere `electron` a nivel de módulo: `electron-updater` se carga de
 * forma diferida para que `npm run selftest` (Node plano) siga funcionando.
 */

const DEFAULT_CHECK_MS = 6 * 60 * 60 * 1000;
const PENDING_RECHECK_MS = 30 * 60 * 1000;
const TICK_MS = 60 * 1000;
const START_DELAY_MS = 20 * 1000;
const MANUAL_CHECK_GAP_MS = 5 * 1000;
const PUBLISHING_RETRY_MS = 3 * 60 * 1000;
const DOWNLOAD_RETRY_MS = 400;

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && value.message) return String(value.message);
  return String(value);
}

/** Compara "0.1.10" > "0.1.9" (comparación numérica por componente). */
function versionParts(value) {
  return String(value || '')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
}
function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta) return delta > 0 ? 1 : -1;
  }
  return 0;
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
    readyVersion: null,
    skipped: false,
    skippedVersion: null,
    error: null,
    publishing: false,
    notes: [],
    checkedAt: null,
    deferred: false,
    installDeferred: false,
    targetVersion: null,
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
    onNotice = () => {},
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
  // Un instalador web no aplica acá: siempre publicamos el NSIS completo.
  autoUpdater.disableWebInstaller = true;

  const status = {
    active: true,
    current: app.getVersion(),
    latest: null,
    available: false,
    checking: false,
    downloading: false,
    percent: 0,
    ready: false,
    readyVersion: null,
    skipped: false,
    skippedVersion: null,
    error: null,
    publishing: false,
    notes: [],
    checkedAt: null,
    deferred: false,
    installDeferred: false,
    targetVersion: null,
  };

  let lastCheck = 0;
  let lastManualCheck = 0;
  let pendingInfo = null;
  let downloading = false;
  let readyToInstall = false;
  let closed = false;
  let lastBucket = -1;
  // `generation` invalida los eventos de una descarga vieja cuando aparece
  // una versión más nueva mientras esa descarga todavía está en vuelo.
  let generation = 0;
  let activeGeneration = -1;
  let activeVersion = null;
  let skippedVersion = null;
  let publishingUntil = 0;
  let wantsNewDownload = false;
  let checkTimeout = null;
  let retryTimer = null;
  let checkingPromise = null;
  // El usuario pidió instalar pero había partida: se ejecuta solo al terminar.
  let installRequested = false;

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
  function notice(kind, version) {
    try {
      onNotice({ kind, version, current: app.getVersion(), notes: status.notes.slice() });
    } catch (err) {
      say(`no pude avisar: ${text(err)}`);
    }
  }
  function hasPendingVersion() {
    return Boolean(status.latest && compareVersions(status.latest, app.getVersion()) > 0);
  }
  function intervalMs() {
    if (Date.now() < publishingUntil) return PUBLISHING_RETRY_MS;
    if (hasPendingVersion()) return Math.min(checkIntervalMs, PENDING_RECHECK_MS);
    return checkIntervalMs;
  }

  /** Apareció una versión más nueva: todo lo anterior deja de valer. */
  function resetForNewVersion(version) {
    generation += 1;
    readyToInstall = false;
    activeVersion = null;
    skippedVersion = null;
    wantsNewDownload = true;
    publishingUntil = 0;
    autoUpdater.autoInstallOnAppQuit = true;
    patch({
      ready: false,
      readyVersion: null,
      percent: 0,
      skipped: false,
      skippedVersion: null,
      available: true,
      latest: version,
      targetVersion: version,
      error: null,
      publishing: false,
    });
  }

  function queueDownload() {
    if (closed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!downloading && !isBusy()) download();
    }, DOWNLOAD_RETRY_MS);
    if (typeof retryTimer.unref === 'function') retryTimer.unref();
  }

  autoUpdater.on('checking-for-update', () => {
    say('consultando última versión');
    patch({ checking: true, error: null });
  });

  autoUpdater.on('update-available', (info) => {
    const version = info && info.version;
    if (!version) return;
    pendingInfo = info || {};
    publishingUntil = 0;
    const known = status.latest;
    if (!known || compareVersions(version, known) > 0) {
      say(`disponible v${version} (instalada v${app.getVersion()})`);
      resetForNewVersion(version);
      patch({ notes: notesOf(pendingInfo), checking: false, checkedAt: Date.now() });
      notice('available', version);
      if (!downloading) queueDownload();
      else say(`descarga de la versión anterior en curso: se reemplaza al terminar`);
    } else {
      // Misma versión (o GitHub reportó una más vieja por carrera de releases):
      // no reiniciamos nada y conservamos la más nueva ya conocida.
      say(`sin cambio de versión (v${version})`);
      patch({ checking: false, checkedAt: Date.now(), error: null, publishing: false });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    const reported = (info && info.version) || app.getVersion();
    const keepNewer = Boolean(status.latest && compareVersions(status.latest, reported) > 0);
    publishingUntil = 0;
    say('ya estás en la última versión');
    patch({
      latest: keepNewer ? status.latest : reported,
      available: keepNewer || readyToInstall,
      checking: false,
      checkedAt: Date.now(),
      error: null,
      publishing: false,
      deferred: false,
      installDeferred: false,
    });
    if (!keepNewer && !readyToInstall) notice('up-to-date', reported);
  });

  autoUpdater.on('download-progress', (progress) => {
    if (activeGeneration !== generation) return;
    const percent = Math.max(0, Math.min(100, Number(progress && progress.percent) || 0));
    patch({ percent, downloading: true });
    const bucket = Math.floor(percent / 25);
    if (bucket !== lastBucket) {
      lastBucket = bucket;
      say(`descarga ${Math.round(percent)}%`);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    const version = (info && info.version) || activeVersion || status.latest;
    downloading = false;
    const stale =
      activeGeneration !== generation ||
      Boolean(status.latest && version && compareVersions(status.latest, version) > 0);
    if (stale) {
      say(`descarga de v${version || '?'} descartada: ya está v${status.latest || '?'}`);
      patch({ downloading: false, percent: 0 });
      wantsNewDownload = true;
      queueDownload();
      return;
    }
    readyToInstall = true;
    pendingInfo = null;
    wantsNewDownload = false;
    skippedVersion = null;
    say(`v${version || '?'} descargada · se instala al salir, sin cortar la partida`);
    patch({
      ready: true,
      readyVersion: version || null,
      downloading: false,
      percent: 100,
      latest: version || status.latest,
      available: true,
      skipped: false,
      skippedVersion: null,
      targetVersion: version || null,
      publishing: false,
    });
    notice('ready', version || status.latest);
  });

  autoUpdater.on('error', (err) => {
    const message = text(err);
    const staleDownload = downloading && activeGeneration !== generation;
    downloading = false;
    if (staleDownload) {
      say(`descarga anterior falló, se ignora: ${message}`);
      patch({ downloading: false, percent: 0 });
      wantsNewDownload = true;
      queueDownload();
      return;
    }
    // GitHub marca el tag como "latest" antes de que CI suba latest.yml.
    // No es un error del usuario: reintentamos en unos minutos y sin cartel rojo.
    const publishing = /latest\.yml|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|404/i.test(message);
    if (publishing) {
      publishingUntil = Date.now() + 10 * 60 * 1000;
      say(`el release se está publicando todavía: reintento en ${PUBLISHING_RETRY_MS / 60000} min`);
      patch({
        checking: false,
        downloading: false,
        error: null,
        publishing: true,
      });
      return;
    }
    say(`falló: ${message} · se reintenta solo`);
    patch({ checking: false, downloading: false, error: message, publishing: false });
  });

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
   *
   * A diferencia de la versión anterior, NO se bloquea por tener una descarga
   * lista: ese era el bug que impedía ver una versión nueva sin instalar la
   * anterior. electron-updater deduplica las consultas concurrentes por su
   * cuenta, así que reconsultar durante una descarga es seguro.
   */
  function check(reason = 'automática') {
    if (closed || checkingPromise) return Promise.resolve(checkingPromise);
    if (isBusy()) {
      say(`consulta pospuesta: hay partida en curso (${reason})`);
      patch({ checking: false, deferred: true });
      return Promise.resolve(null);
    }
    const manual = reason.includes('manual');
    if (manual && Date.now() - lastManualCheck < MANUAL_CHECK_GAP_MS) {
      say('consulta manual ignorada: demasiado seguida');
      return Promise.resolve(null);
    }
    if (manual) lastManualCheck = Date.now();

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

    checkingPromise = Promise.resolve(autoUpdater.checkForUpdates())
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
      })
      .finally(() => {
        checkingPromise = null;
      });
    return checkingPromise;
  }

  function download() {
    if (closed || downloading || readyToInstall || isBusy()) return;
    const version = status.latest;
    if (!version || !pendingInfo || !hasPendingVersion()) return;
    if (skippedVersion === version) return;

    const myGeneration = generation;
    activeGeneration = myGeneration;
    activeVersion = version;
    downloading = true;
    wantsNewDownload = false;
    lastBucket = -1;
    patch({ downloading: true, percent: 0, error: null, targetVersion: version });
    say(`descargando v${version}`);

    Promise.resolve(autoUpdater.downloadUpdate())
      .catch((err) => {
        if (activeGeneration !== myGeneration) return;
        downloading = false;
        say(`descarga falló: ${text(err)} · se reintenta solo`);
        patch({ downloading: false, error: text(err) });
      })
      .finally(() => {
        if (activeGeneration === myGeneration) downloading = false;
        // Si mientras descargábamos apareció una versión más nueva, el evento
        // viejo se descartó y acá arranca la descarga correcta.
        if (wantsNewDownload || (hasPendingVersion() && !readyToInstall && !downloading)) {
          queueDownload();
        }
      });
  }

  /**
   * Devuelve { ok, reason } para que el panel sepa si la instalación arrancó
   * o quedó pospuesta. Nunca reinicia la app con una partida en curso: en ese
   * caso se agenda y el tick la ejecuta apenas el jugador termina.
   */
  function install() {
    if (!readyToInstall) return { ok: false, reason: 'not-ready' };
    if (status.latest && status.readyVersion && compareVersions(status.latest, status.readyVersion) > 0) {
      say('hay una versión más nueva: no instalo la vieja');
      queueDownload();
      return { ok: false, reason: 'newer' };
    }
    if (isBusy()) {
      installRequested = true;
      say('instalación pospuesta: hay partida en curso · se aplica al terminar');
      patch({ installDeferred: true, error: null });
      return { ok: false, reason: 'match' };
    }
    installRequested = false;
    patch({ installDeferred: false, deferred: false });
    say('instalando en silencio a pedido del usuario · se reabre sola');
    autoUpdater.autoInstallOnAppQuit = true;
    // isSilent=true      → electron-updater le pasa /S al NSIS: sin bienvenida,
    //                      sin elegir carpeta, sin accesos directos, sin "Finalizar".
    // isForceRunAfter=true → le pasa --force-run: la app vuelve a abrirse sola.
    // Antes era (false, true) y mostraba el asistente de instalación cada vez.
    // El quit handler de electron-updater ya hacía install(true, false), o sea
    // que salir normalmente SIEMPRE fue silencioso; acá igualamos ese criterio.
    // Nota: en Windows el .exe está en uso mientras la app corre, así que no se
    // puede reemplazar en caliente; lo que desaparece es la UI, no el reinicio.
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  }

  function skip() {
    const version = status.readyVersion || status.latest;
    if (!version) return;
    skippedVersion = version;
    installRequested = false;
    autoUpdater.autoInstallOnAppQuit = false;
    say(`v${version} omitida: no se instala al salir en esta sesión`);
    patch({ skipped: true, skippedVersion: version, installDeferred: false });
  }

  const startTimer = setTimeout(() => check('arranque'), START_DELAY_MS);
  const tickTimer = setInterval(() => {
    if (closed) return;
    // Pedido de instalar hecho durante una partida: se ejecuta solo apenas
    // termina. No cortamos el juego ni queda esperando otro clic del usuario.
    // Si en el medio apareció otra versión, readyToInstall se limpia y se
    // espera a la descarga nueva (nunca se instala una vieja).
    if (installRequested && readyToInstall && !status.skipped && !isBusy()) {
      installRequested = false;
      install();
      return;
    }
    if (isBusy()) return;
    if (wantsNewDownload && !downloading) queueDownload();
    else if (pendingInfo && !downloading && !readyToInstall && skippedVersion !== status.latest) download();
    if (Date.now() - lastCheck >= intervalMs()) check('periódica');
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
      installRequested = false;
      clearTimeout(startTimer);
      clearInterval(tickTimer);
      clearCheckTimeout();
      clearTimeout(retryTimer);
    },
  };
}

module.exports = { initAutoUpdate, compareVersions };
