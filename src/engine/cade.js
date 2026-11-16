'use strict';

/**
 * Cliente del protocolo del motor de la partida (familia CADE).
 *
 * Alcance deliberado: este módulo NO empaqueta certificados. El material TLS
 * de cliente lo emite un tercero y no es nuestro para redistribuirlo, así que
 * el motor solo funciona si el usuario ya lo tiene instalado en su equipo.
 * La app lo trata como fuente opcional: sin esto, todo lo demás sigue andando.
 *
 * Los nombres de RPC y los campos son los que expone el propio juego.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { GrpcChannel, GrpcError, STATUS } = require('./grpc');
const proto = require('./proto');

const SERVICE = '/cade_api.rpc.CadeRemote';
const CERT_FILES = ['root.crt', 'cade-client.crt', 'cade-client.key'];

/**
 * Busca el material TLS en las ubicaciones donde el cliente de referencia lo
 * deja. Devuelve un resultado explícito en vez de lanzar: la app necesita
 * saber si el motor está disponible para decidir qué mostrar.
 */
function discoverCertificates(explicitDir = null) {
  const candidates = [];
  if (explicitDir) candidates.push(explicitDir);
  if (process.env.AOE2_ENGINE_CERTS) candidates.push(process.env.AOE2_ENGINE_CERTS);
  candidates.push(path.join(os.tmpdir(), 'com.captureage.cade'));
  candidates.push(os.tmpdir());
  candidates.push(path.join(__dirname, '..', '..', '.tmp-cade'));

  for (const dir of candidates) {
    try {
      const files = CERT_FILES.map((name) => path.join(dir, name));
      if (files.every((file) => fs.existsSync(file))) {
        return { ok: true, dir, files };
      }
    } catch {
      // Directorio ilegible: seguimos con el siguiente candidato.
    }
  }
  return {
    ok: false,
    reason: 'engine_credentials_missing',
    detail: 'No se encontró el material TLS del motor en este equipo.',
  };
}

function createChannel({ certDir = null, port = 4341 } = {}) {
  const found = discoverCertificates(certDir);
  if (!found.ok) return { ok: false, ...found };
  const [ca, cert, key] = found.files;
  const channel = new GrpcChannel({
    port,
    servername: 'ca-game-api',
    ca: fs.readFileSync(ca),
    cert: fs.readFileSync(cert),
    key: fs.readFileSync(key),
  });
  return { ok: true, channel, certDir: found.dir };
}

/** Estado del motor: sirve como sonda de disponibilidad antes de capturar. */
async function probe(channel, { deadlineMs = 4000 } = {}) {
  try {
    const { frames } = await channel.call(`${SERVICE}/Info`, Buffer.alloc(0), { deadlineMs });
    const fields = proto.decodeFields(frames[0] || Buffer.alloc(0));
    const build = proto.firstField(fields, 1, 0);
    const paths = proto.allFields(fields, 3).map((raw) => raw.toString('utf8'));
    return { ok: true, build, paths };
  } catch (error) {
    return { ok: false, reason: error.code || 'engine_error', detail: error.message };
  }
}

async function pause(channel, paused, { deadlineMs = 5000 } = {}) {
  const body = proto.encodeField(1, proto.WIRE_VARINT, paused ? 1 : 0);
  return channel.call(`${SERVICE}/Pause`, body, { deadlineMs });
}

/**
 * Carga una repetición con el juego pausado.
 *
 * `LoadGame` vuelve antes de que el mundo exista: si se abre el stream con el
 * juego detenido llega solo el snapshot y el stream se corta. Por eso la
 * captura espera a que el motor esté listo y recién ahí reanuda.
 */
async function loadReplay(channel, replayPath, { settleMs = 1500, speed = null, deadlineMs = 30000 } = {}) {
  // Si el motor quedó reproduciendo otra partida (o su pantalla final), el
  // pedido de carga se ignora. `Cancel` (campo 5) sale de esa reproducción
  // antes de cargar; si el build no lo soporta, no pasa nada.
  try {
    await channel.call(`${SERVICE}/LoadGame`, proto.encodeField(5, proto.WIRE_VARINT, 1), { deadlineMs: 5000 });
    await delay(800);
  } catch {
    // Sin soporte de cancelación: seguimos con la carga normal.
  }
  await pause(channel, true);
  const load = proto.encodeField(1, proto.WIRE_LENGTH, replayPath) + proto.encodeField(2, proto.WIRE_VARINT, 0);
  const request = proto.encodeField(2, proto.WIRE_LENGTH, load) +
    proto.encodeField(3, proto.WIRE_VARINT, 1) +
    proto.encodeField(6, proto.WIRE_VARINT, 20);
  await channel.call(`${SERVICE}/LoadGame`, request, { deadlineMs });
  await delay(settleMs);
  if (speed !== null) {
    try {
      await channel.call(`${SERVICE}/SetGameSpeed`, proto.encodeField(1, proto.WIRE_VARINT, speed), { deadlineMs: 5000 });
    } catch {
      // La velocidad es una optimización: si el build no la soporta seguimos.
    }
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await pause(channel, false);
    await delay(300);
  }
}

/**
 * Abre el stream de frames. Cada mensaje es una `FrameSequence`: como mínimo
 * trae un `Frame` con tiempo, patch y eventos.
 */
function frames(channel, { deadlineMs = 20000, onFrame, signal = null } = {}) {
  return channel.call(`${SERVICE}/Frames`, Buffer.alloc(0), {
    deadlineMs,
    signal,
    onMessage: (message) => onFrame(message),
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  SERVICE,
  CERT_FILES,
  GrpcError,
  STATUS,
  discoverCertificates,
  createChannel,
  probe,
  pause,
  loadReplay,
  frames,
  delay,
};
