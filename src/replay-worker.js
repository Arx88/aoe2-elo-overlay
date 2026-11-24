'use strict';

const { parentPort } = require('node:worker_threads');
const { analyzeReplayFile, analyzeReplayBuffer } = require('./replay-analysis');

const MAX_RECORD_BYTES = 80 * 1024 * 1024;
let AdmZipCtor = null;

function extractZipBufferOffThread(zipBuf) {
  if (!AdmZipCtor) AdmZipCtor = require('adm-zip');
  let zip;
  try {
    zip = new AdmZipCtor(zipBuf);
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

if (parentPort) {
  parentPort.on('message', async (msg) => {
    const { id, filePath, buffer, zipBuffer, match, profileId } = msg || {};
    try {
      let result;
      if (filePath) {
        result = await analyzeReplayFile(filePath, { match, profileId });
      } else if (zipBuffer) {
        const recordBuffer = extractZipBufferOffThread(Buffer.from(zipBuffer));
        result = await analyzeReplayBuffer(recordBuffer, { match, profileId });
      } else {
        result = await analyzeReplayBuffer(Buffer.from(buffer), { match, profileId });
      }
      parentPort.postMessage({ id, ok: true, result });
    } catch (error) {
      parentPort.postMessage({ id, ok: false, error: error && error.message ? error.message : String(error) });
    }
  });
}
