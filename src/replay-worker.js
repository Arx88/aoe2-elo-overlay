'use strict';

const { parentPort } = require('node:worker_threads');
const { analyzeReplayFile, analyzeReplayBuffer } = require('./replay-analysis');

if (parentPort) {
  parentPort.on('message', async (msg) => {
    const { id, filePath, buffer, match, profileId } = msg || {};
    try {
      const result = filePath
        ? await analyzeReplayFile(filePath, { match, profileId })
        : await analyzeReplayBuffer(Buffer.from(buffer), { match, profileId });
      parentPort.postMessage({ id, ok: true, result });
    } catch (error) {
      parentPort.postMessage({ id, ok: false, error: error && error.message ? error.message : String(error) });
    }
  });
}
