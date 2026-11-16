'use strict';

/**
 * Trabajo de captura del motor.
 *
 * El archivo de la repetición no contiene muertes, recursos ni inactividad: es
 * un registro de comandos. Esas cifras solo existen si el motor vuelve a
 * simular la partida, y eso es lo que hace este módulo.
 *
 * Como la captura ocupa el juego, el diseño la trata como un trabajo caro:
 *   - se ejecuta una sola vez por repetición y se guarda en caché;
 *   - se puede cancelar en cualquier momento;
 *   - al terminar se detiene la reproducción, para devolverle el juego al
 *     jugador sin dejarlo reproduciendo una partida vieja.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createChannel, probe, loadReplay, pause, frames, GrpcError, delay } = require('./cade');
const { createAccumulator, consumeSequence, snapshot } = require('./aggregate');
const { fingerprintReplay } = require('./model');

const ENGINE_VERSION = 'engine-v1';

function artifactPath(directory, matchKey) {
  return path.join(directory, `${matchKey}.json`);
}

function readArtifact(directory, matchKey) {
  const file = artifactPath(directory, matchKey);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.engineVersion !== ENGINE_VERSION) return { status: 'stale', artifact: parsed };
    return { status: 'fresh', artifact: parsed };
  } catch {
    return { status: 'missing', artifact: null };
  }
}

/** Escritura atómica: un artefacto incompleto nunca se ve como válido. */
function writeArtifact(directory, matchKey, artifact) {
  fs.mkdirSync(directory, { recursive: true });
  const target = artifactPath(directory, matchKey);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(artifact));
  fs.renameSync(temporary, target);
  return target;
}

async function captureMatch({
  replayPath,
  certDir = null,
  maxWallSeconds = 600,
  speed = 3,
  startingVillagers = 3,
  signal = null,
  onProgress = null,
} = {}) {
  const stats = fs.statSync(replayPath);
  const matchKey = fingerprintReplay({
    filePath: replayPath,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  });

  const found = createChannel({ certDir });
  if (!found.ok) {
    return { ok: false, matchKey, reason: found.reason, detail: found.detail };
  }
  const health = await probe(found.channel);
  if (!health.ok) {
    return { ok: false, matchKey, reason: health.reason, detail: health.detail };
  }

  let accumulator = createAccumulator({ startingVillagers });
  const startedAt = Date.now();
  let stalled = 0;
  let lastError = null;

  try {
    // Cargar no garantiza volver al inicio: si el motor quedó en el estado
    // post-partida de una carga anterior, el stream arranca en el final y no
    // hay eventos. Se verifica el primer `world_time` y se reintenta.
    let startedTime = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await loadReplay(found.channel, replayPath, { speed, settleMs: 1200 * attempt });
      const candidate = createAccumulator({ startingVillagers });
      let firstTime = null;
      try {
        await frames(found.channel, {
          deadlineMs: 7000,
          signal,
          onFrame: (message) => {
            consumeSequence(candidate, message);
            if (firstTime === null) firstTime = candidate.coverage.firstWorldTime;
          },
        });
      } catch (error) {
        lastError = error.code || 'engine_error';
        if (error.code !== 'engine_cancelled' && !GrpcError.isRetryable(error)) throw error;
      }
      accumulator = candidate;
      startedTime = firstTime;
      if (firstTime !== null && firstTime < 30000) break;
    }
    if (startedTime === null || startedTime >= 30000) {
      return {
        ok: false,
        matchKey,
        reason: 'replay_did_not_restart',
        detail: `El motor arrancó en ${startedTime} ms en vez del inicio de la partida.`,
      };
    }
    while (Date.now() - startedAt < maxWallSeconds * 1000) {
      if (signal && signal.aborted) break;
      const before = accumulator.coverage.lastWorldTime;
      try {
        await frames(found.channel, {
          deadlineMs: 20000,
          signal,
          onFrame: (message) => consumeSequence(accumulator, message),
        });
      } catch (error) {
        lastError = error.code || 'engine_error';
        // El stream se corta cada ~16 s por diseño: reconectar es normal.
        if (error.code !== 'engine_cancelled' && !GrpcError.isRetryable(error)) {
          if (error.code === 'engine_protocol_changed') throw error;
        }
      }
      if (accumulator.coverage.lastWorldTime > before) {
        stalled = 0;
        accumulator.coverage.reconnects += 1;
      } else {
        stalled += 1;
        if (stalled >= 3) break;
        await delay(500);
      }
      if (onProgress) onProgress(snapshot(accumulator));
    }
  } finally {
    // Devolver el juego: si quedó reproduciendo, lo detenemos.
    try {
      await pause(found.channel, true);
    } catch {
      // Si el juego ya no está, no hay nada que restaurar.
    }
  }

  const result = snapshot(accumulator);
  const artifact = {
    engineVersion: ENGINE_VERSION,
    build: health.build || null,
    replay: { path: replayPath, size: stats.size, mtimeMs: stats.mtimeMs, key: matchKey },
    wallSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    lastError,
    ...result,
  };
  return { ok: true, matchKey, artifact };
}

/** Captura con caché: no se vuelve a molestar al jugador por la misma partida. */
async function captureCached({ directory, ...options }) {
  const stats = fs.statSync(options.replayPath);
  const matchKey = fingerprintReplay({
    filePath: options.replayPath,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  });
  const cached = readArtifact(directory, matchKey);
  if (cached.status === 'fresh') return { ok: true, cached: true, matchKey, artifact: cached.artifact };
  const result = await captureMatch({ ...options });
  if (result.ok) {
    writeArtifact(directory, matchKey, result.artifact);
  }
  return { ...result, cached: false };
}

function defaultCacheDirectory() {
  const base = process.env.AOE2_ENGINE_CACHE ||
    path.join(os.homedir(), 'AppData', 'Local', 'aoe2-elo-overlay');
  return path.join(base, 'engine');
}

module.exports = {
  ENGINE_VERSION,
  captureMatch,
  captureCached,
  readArtifact,
  writeArtifact,
  artifactPath,
  defaultCacheDirectory,
};
