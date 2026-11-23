'use strict';

/**
 * Descarga y prepara el replay de una partida terminada.
 *
 * La API pública de Microsoft devuelve un ZIP con el .aoe2record. No se
 * guarda en disco más que el tiempo necesario para analizarlo: el usuario no
 * tiene que buscar archivos ni importar nada.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { analyzeReplayFile, analyzeReplayBuffer } = require('./replay-analysis');
const { listAccounts } = require('./detect');

const WORKER_IDLE_MS = 60_000;
const replayInflight = new Map();
let workerInstance = null;
let workerIdleTimer = null;
let workerReqId = 0;
const workerPending = new Map();

function stopIdleWorker() {
  if (workerIdleTimer) { clearTimeout(workerIdleTimer); workerIdleTimer = null; }
  if (workerInstance && workerPending.size === 0) {
    const w = workerInstance;
    workerInstance = null;
    w.terminate().catch(() => {});
  }
}

function bumpWorkerIdle() {
  if (workerIdleTimer) clearTimeout(workerIdleTimer);
  if (workerPending.size === 0) {
    workerIdleTimer = setTimeout(stopIdleWorker, WORKER_IDLE_MS);
    if (workerIdleTimer.unref) workerIdleTimer.unref();
  }
}

function getReplayWorker() {
  if (workerInstance) return workerInstance;
  const w = new Worker(path.join(__dirname, 'replay-worker.js'));
  w.on('message', (msg) => {
    const entry = msg && workerPending.get(msg.id);
    if (!entry) return;
    workerPending.delete(msg.id);
    bumpWorkerIdle();
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new Error(msg.error || 'Error analizando replay'));
  });
  const failAll = (err) => {
    if (workerInstance === w) workerInstance = null;
    for (const entry of workerPending.values()) entry.reject(err);
    workerPending.clear();
  };
  w.on('error', failAll);
  w.on('exit', (code) => {
    if (workerInstance === w) workerInstance = null;
    if (workerPending.size > 0) failAll(new Error(`Replay worker exited (${code})`));
  });
  workerInstance = w;
  return w;
}

function analyzeOffThread({ filePath = null, buffer = null, match, profileId }) {
  // Fallback directo en entornos sin worker_threads o si falla la creación
  if (process.env.AOE_REPLAY_INLINE === '1') {
    return filePath
      ? analyzeReplayFile(filePath, { match, profileId })
      : analyzeReplayBuffer(buffer, { match, profileId });
  }
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = getReplayWorker();
    } catch {
      const p = filePath
        ? analyzeReplayFile(filePath, { match, profileId })
        : analyzeReplayBuffer(buffer, { match, profileId });
      p.then(resolve, reject);
      return;
    }
    if (workerIdleTimer) { clearTimeout(workerIdleTimer); workerIdleTimer = null; }
    const id = ++workerReqId;
    workerPending.set(id, { resolve, reject });
    if (buffer) {
      const copy = new Uint8Array(buffer.byteLength);
      copy.set(buffer);
      w.postMessage({ id, buffer: copy.buffer, match, profileId }, [copy.buffer]);
    } else {
      w.postMessage({ id, filePath, match, profileId });
    }
  });
}

const REPLAY_BASE = process.env.AOE2_REPLAY_BASE ||
  'https://api.ageofempires.com/api/GameStats/AgeII/GetMatchReplay/';
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_RECORD_BYTES = 80 * 1024 * 1024;
const USER_AGENT = 'aoe2-elo-overlay/2.0 (overlay de escritorio local)';

function replayUrl(matchId, profileId) {
  const query = new URLSearchParams({
    matchId: String(matchId),
    profileId: String(profileId),
  });
  return `${REPLAY_BASE}?${query.toString()}`;
}

async function downloadReplay(matchId, profileId, { timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(replayUrl(matchId, profileId), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/zip, application/octet-stream' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = response.status === 404
        ? 'Microsoft todavía no publicó el replay de esta partida.'
        : `Microsoft respondió HTTP ${response.status} al pedir el replay.`;
      throw new Error(message);
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_ZIP_BYTES) {
      throw new Error('El replay descargado es demasiado grande.');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('Microsoft devolvió un replay vacío.');
    if (buffer.length > MAX_ZIP_BYTES) throw new Error('El replay descargado es demasiado grande.');
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('El archivo descargado no es un replay válido.');
    }
    return buffer;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('La descarga del replay tardó demasiado. Se reintentará al actualizar.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractRecordBuffer(zipBuffer) {
  const AdmZip = require('adm-zip');
  let zip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new Error('El replay descargado no se pudo abrir.');
  }
  const entries = zip.getEntries().filter((entry) =>
    !entry.isDirectory && /\.aoe2record$/i.test(entry.entryName || ''));
  if (!entries.length) throw new Error('El replay descargado no contiene un archivo .aoe2record.');
  const entry = entries[0];
  const size = Number(entry.header && entry.header.size) || 0;
  if (size > MAX_RECORD_BYTES) throw new Error('El replay descomprimido es demasiado grande.');
  const data = entry.getData();
  if (!data || data.byteLength > MAX_RECORD_BYTES) {
    throw new Error('El replay descomprimido es demasiado grande.');
  }
  return data;
}

function extractRecord(zipBuffer) {
  const data = extractRecordBuffer(zipBuffer);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aoe2-elo-replay-'));
  const filePath = path.join(directory, 'partida.aoe2record');
  try {
    fs.writeFileSync(filePath, data);
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    filePath,
    directory,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

/**
 * Busca el replay recién guardado localmente en `%USERPROFILE%\Games\Age of Empires 2 DE\<id>\savegame\`.
 * Evita esperar varios minutos a que Microsoft publique el ZIP (HTTP 404).
 * Valida roster completo y hora mediante `analyzeReplayFile` en un Worker (0 bloqueo del hilo principal).
 */
async function tryLocalReplay(match, profileId) {
  let accounts;
  try {
    accounts = listAccounts();
  } catch {
    return null;
  }
  const rawRef = match && (match.finishedAt || match.startedAt);
  const refTime = (typeof rawRef === 'string' ? Date.parse(rawRef) : Number(rawRef)) || Date.now();
  const candidates = [];
  for (const acc of accounts) {
    const dir = path.join(acc.dir, 'savegame');
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.aoe2record$/i.test(entry.name)) continue;
      // Excluir rec.aoe2record (grabación viva/incompleta)
      if (/^rec\.aoe2record$/i.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      try {
        const stat = await fs.promises.stat(full);
        if (stat.size <= 0 || stat.size > MAX_RECORD_BYTES) continue;
        // Solo archivos cercanos alrededor de la partida (±2 horas para tolerar desfase)
        if (Math.abs(stat.mtimeMs - refTime) > 2 * 60 * 60 * 1000) continue;
        candidates.push({ full, mtimeMs: stat.mtimeMs, dist: Math.abs(stat.mtimeMs - refTime) });
      } catch { /* ignorar */ }
    }
  }
  // Ordenar por cercanía real a la partida (no más nuevo primero) para no enganchar otro replay en revanchas
  candidates.sort((a, b) => a.dist - b.dist);
  for (const item of candidates.slice(0, 6)) {
    try {
      const telemetry = await analyzeOffThread({ filePath: item.full, match, profileId });
      if (telemetry) {
        return {
          ...telemetry,
          source: {
            ...telemetry.source,
            label: 'Replay local · análisis instantáneo',
          },
        };
      }
    } catch {
      // No coincide roster u hora: probar siguiente candidato
    }
  }
  return null;
}

/**
 * Pipeline completo: primero intenta el .aoe2record local (<1s) y, si no está,
 * descarga desde Microsoft, extrae en memoria (0 archivo temporal) y analiza en Worker.
 * Deduplicado en vuelo por (matchId, profileId).
 */
async function fetchReplayTelemetry(match, profileId, { onStatus, skipLocal = false } = {}) {
  const id = match && match.matchId;
  if (!id) throw new Error('La partida no tiene un ID de replay.');
  if (!Number.isFinite(Number(profileId))) throw new Error('Falta el perfil para pedir el replay.');

  const inflightKey = `${id}:${Number(profileId)}:${skipLocal ? 'net' : 'all'}`;
  if (replayInflight.has(inflightKey)) return replayInflight.get(inflightKey);

  const task = (async () => {
    if (!skipLocal) {
      if (onStatus) {
        onStatus({
          status: 'analyzing',
          label: 'Analizando replay local',
          detail: 'Leyendo economía, producción y ritmo desde tu carpeta savegame.',
        });
      }
      const local = await tryLocalReplay(match, profileId);
      if (local) return local;
    }

    if (onStatus) {
      onStatus({
        status: 'downloading',
        label: 'Descargando partida',
        detail: `Replay de #${id} desde Microsoft.`,
      });
    }
    const zip = await downloadReplay(id, profileId);

    if (onStatus) {
      onStatus({
        status: 'analyzing',
        label: 'Analizando partida',
        detail: 'Leyendo órdenes del replay: economía, ejército, edades y ritmo.',
      });
    }
    const recordBuffer = extractRecordBuffer(zip);
    return analyzeOffThread({ buffer: recordBuffer, match, profileId });
  })().finally(() => {
    if (replayInflight.get(inflightKey) === task) replayInflight.delete(inflightKey);
  });

  replayInflight.set(inflightKey, task);
  return task;
}

module.exports = {
  fetchReplayTelemetry,
  tryLocalReplay,
  downloadReplay,
  extractRecord,
  replayUrl,
  MAX_ZIP_BYTES,
  MAX_RECORD_BYTES,
};
