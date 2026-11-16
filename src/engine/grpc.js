'use strict';

/**
 * Cliente gRPC sobre `node:http2`, sin dependencias ni binarios nativos.
 *
 * gRPC nativo es HTTP/2 con mensajes enmarcados: 1 byte de compresión, 4 bytes
 * de longitud big-endian y el protobuf. Node ya trae HTTP/2 y TLS, así que el
 * módulo pesa cero y funciona dentro del asar de Electron.
 *
 * Todo error de transporte se devuelve como GrpcError tipado: la UI necesita
 * distinguir "el juego no está abierto" de "el juego cambió el protocolo".
 */

const http2 = require('node:http2');

const STATUS = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  UNAUTHENTICATED: 16,
};

class GrpcError extends Error {
  constructor(status, message, detail) {
    super(message || `gRPC ${status}`);
    this.name = 'GrpcError';
    this.status = status;
    this.code = GrpcError.codeFor(status);
    this.detail = detail || null;
  }

  /**
   * Traduce el estado del transporte a una causa accionable. Esto es lo que la
   * interfaz necesita para decirle al usuario qué hacer, en vez de mostrar un
   * error técnico.
   */
  static codeFor(status) {
    switch (status) {
      case STATUS.UNAVAILABLE: return 'game_not_running';
      case STATUS.DEADLINE_EXCEEDED: return 'engine_timeout';
      case STATUS.PERMISSION_DENIED:
      case STATUS.UNAUTHENTICATED: return 'engine_access_denied';
      case STATUS.UNIMPLEMENTED: return 'engine_unsupported';
      case STATUS.CANCELLED: return 'engine_cancelled';
      case STATUS.INTERNAL:
      case STATUS.UNKNOWN: return 'engine_protocol_changed';
      default: return 'engine_error';
    }
  }

  static isRetryable(error) {
    if (!(error instanceof GrpcError)) return true;
    return error.code === 'game_not_running' || error.code === 'engine_timeout';
  }
}

class GrpcChannel {
  constructor({ host = '127.0.0.1', port = 4341, servername, ca, cert, key, rejectUnauthorized = true }) {
    this.host = host;
    this.port = port;
    this.servername = servername;
    this.tls = { ca, cert, key, rejectUnauthorized };
  }

  session(deadlineMs) {
    return new Promise((resolve, reject) => {
      const session = http2.connect(`https://${this.host}:${this.port}`, {
        ...this.tls,
        servername: this.servername,
        // La API escucha en loopback; el certificado está emitido a nombre del
        // servicio, por eso fijamos el nombre en vez de confiar en SNI.
        ALPNProtocols: ['h2'],
      });
      const timer = setTimeout(() => {
        session.destroy();
        reject(new GrpcError(STATUS.DEADLINE_EXCEEDED, 'tiempo de conexión agotado'));
      }, Math.max(1000, deadlineMs));
      session.once('connect', () => {
        clearTimeout(timer);
        resolve(session);
      });
      session.once('error', (error) => {
        clearTimeout(timer);
        reject(new GrpcError(STATUS.UNAVAILABLE, error.message, error.code || null));
      });
    });
  }

  /**
   * Ejecuta un RPC. Con `onMessage` funciona como server-streaming y resuelve
   * cuando llegan los trailers; sin `onMessage` acumula y devuelve los frames.
   */
  async call(path, payload, { deadlineMs = 15000, onMessage = null, signal = null } = {}) {
    if (signal && signal.aborted) throw new GrpcError(STATUS.CANCELLED, 'captura cancelada');
    const session = await this.session(deadlineMs);
    const frames = [];
    const body = Buffer.isBuffer(payload) ? payload : Buffer.alloc(0);

    return new Promise((resolve, reject) => {
      let settled = false;
      let status = null;
      let statusMessage = '';
      let pending = Buffer.alloc(0);

      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        session.close();
        if (error) reject(error);
        else resolve(value);
      };

      const frame = Buffer.alloc(5);
      frame.writeUInt8(0, 0);
      frame.writeUInt32BE(body.length, 1);

      const request = session.request({
        ':method': 'POST',
        ':path': path,
        'content-type': 'application/grpc',
        te: 'trailers',
        'grpc-accept-encoding': 'identity',
        'grpc-timeout': `${Math.max(1, Math.ceil(deadlineMs))}m`,
        'user-agent': 'aoe2-elo-overlay-engine/1',
      });

      const deadline = setTimeout(() => {
        request.close(http2.constants.NGHTTP2_CANCEL);
        finish(new GrpcError(STATUS.DEADLINE_EXCEEDED, 'la llamada al motor expiró'));
      }, deadlineMs + 500);

      const onAbort = () => {
        request.close(http2.constants.NGHTTP2_CANCEL);
        finish(new GrpcError(STATUS.CANCELLED, 'captura cancelada'));
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      request.on('response', (headers) => {
        // Respuesta "trailers-only": el estado viene en las cabeceras y no hay
        // ningún mensaje. Ocurre, por ejemplo, al pedir Frames sin partida.
        if (headers['grpc-status'] !== undefined) {
          status = Number(headers['grpc-status']);
          statusMessage = decodeURIComponent(String(headers['grpc-message'] || ''));
        }
      });

      request.on('trailers', (trailers) => {
        if (trailers['grpc-status'] !== undefined) {
          status = Number(trailers['grpc-status']);
          statusMessage = decodeURIComponent(String(trailers['grpc-message'] || ''));
        }
      });

      request.on('data', (chunk) => {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
        while (pending.length >= 5) {
          const length = pending.readUInt32BE(1);
          if (pending.length < 5 + length) break;
          if (pending[0] !== 0) {
            finish(new GrpcError(STATUS.INTERNAL, 'mensaje comprimido no soportado'));
            return;
          }
          const message = pending.subarray(5, 5 + length);
          pending = pending.subarray(5 + length);
          if (onMessage) onMessage(message);
          else frames.push(message);
        }
      });

      request.on('error', (error) => {
        finish(new GrpcError(STATUS.UNAVAILABLE, error.message, error.code || null));
      });

      request.on('end', () => {
        const code = status === null ? STATUS.INTERNAL : status;
        if (code !== STATUS.OK) {
          finish(new GrpcError(code, statusMessage || `el motor respondió ${code}`));
          return;
        }
        finish(null, { frames, count: frames.length });
      });

      request.end(Buffer.concat([frame, body]));
    });
  }
}

module.exports = { GrpcChannel, GrpcError, STATUS };
