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
const AdmZip = require('adm-zip');
const { analyzeReplayFile } = require('./replay-analysis');

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

function extractRecord(zipBuffer) {
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

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aoe2-elo-replay-'));
  const filePath = path.join(directory, 'partida.aoe2record');
  try {
    fs.writeFileSync(filePath, entry.getData());
    if (fs.statSync(filePath).size > MAX_RECORD_BYTES) {
      throw new Error('El replay descomprimido es demasiado grande.');
    }
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
 * Pipeline completo: descarga, extracción segura y análisis local.
 * `onStatus` recibe los dos estados que muestra el overlay.
 */
async function fetchReplayTelemetry(match, profileId, { onStatus } = {}) {
  const id = match && match.matchId;
  if (!id) throw new Error('La partida no tiene un ID de replay.');
  if (!Number.isFinite(Number(profileId))) throw new Error('Falta el perfil para pedir el replay.');

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
      detail: 'Leyendo apertura, llegada a edades y APM del replay.',
    });
  }
  const extracted = extractRecord(zip);
  try {
    return await analyzeReplayFile(extracted.filePath, { match, profileId });
  } finally {
    extracted.cleanup();
  }
}

module.exports = {
  fetchReplayTelemetry,
  downloadReplay,
  extractRecord,
  replayUrl,
  MAX_ZIP_BYTES,
  MAX_RECORD_BYTES,
};
