'use strict';

/**
 * Códec protobuf mínimo, sin dependencias.
 *
 * El motor de la partida habla protobuf por gRPC, pero no queremos sumar
 * dependencias nativas al paquete de Electron: alcanza con varints, campos
 * length-delimited y floats de 32 bits, que es todo lo que usa el protocolo.
 *
 * Los errores de este módulo son de programación (un wire inesperado significa
 * que cambió el protocolo), así que se lanzan y los maneja la capa de captura.
 */

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH = 2;
const WIRE_FIXED32 = 5;

function encodeVarint(value) {
  let remaining = BigInt(value);
  if (remaining < 0n) remaining += 1n << 64n;
  const out = [];
  while (true) {
    const byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining) out.push(byte | 0x80);
    else {
      out.push(byte);
      return Buffer.from(out);
    }
  }
}

function encodeField(number, wire, value) {
  const key = encodeVarint((number << 3) | wire);
  if (wire === WIRE_VARINT) return Buffer.concat([key, encodeVarint(value)]);
  if (wire === WIRE_LENGTH) {
    const body = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    return Buffer.concat([key, encodeVarint(body.length), body]);
  }
  if (wire === WIRE_FIXED32 || wire === WIRE_FIXED64) {
    const width = wire === WIRE_FIXED32 ? 4 : 8;
    if (!Buffer.isBuffer(value) || value.length !== width) {
      throw new Error(`wire ${wire} requiere ${width} bytes`);
    }
    return Buffer.concat([key, value]);
  }
  throw new Error(`wire no soportado al codificar: ${wire}`);
}

/** Deserializa un mensaje plano en [{ number, wire, value }]. */
function decodeFields(buffer) {
  const fields = [];
  let pos = 0;
  while (pos < buffer.length) {
    const key = readVarint(buffer, pos);
    pos = key.pos;
    const number = key.value >>> 3;
    const wire = key.value & 7;
    if (wire === WIRE_VARINT) {
      const read = readVarint(buffer, pos);
      pos = read.pos;
      fields.push({ number, wire, value: read.value });
    } else if (wire === WIRE_LENGTH) {
      const length = readVarint(buffer, pos);
      pos = length.pos;
      const end = pos + length.value;
      if (end > buffer.length) throw new Error(`campo ${number} truncado`);
      fields.push({ number, wire, value: buffer.subarray(pos, end) });
      pos = end;
    } else if (wire === WIRE_FIXED32) {
      if (pos + 4 > buffer.length) throw new Error(`campo ${number} truncado`);
      fields.push({ number, wire, value: buffer.subarray(pos, pos + 4) });
      pos += 4;
    } else if (wire === WIRE_FIXED64) {
      if (pos + 8 > buffer.length) throw new Error(`campo ${number} truncado`);
      fields.push({ number, wire, value: buffer.subarray(pos, pos + 8) });
      pos += 8;
    } else {
      throw new Error(`wire no soportado al decodificar: ${wire}`);
    }
  }
  return fields;
}

function readVarint(buffer, start) {
  let value = 0n;
  let shift = 0n;
  let pos = start;
  while (true) {
    if (pos >= buffer.length) throw new Error('varint truncado');
    const byte = buffer[pos];
    pos += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value: Number(value), pos };
    shift += 7n;
    if (shift > 63n) throw new Error('varint demasiado largo');
  }
}

function firstField(fields, number, fallback = undefined) {
  for (const field of fields) {
    if (field.number === number) return field.value;
  }
  return fallback;
}

function allFields(fields, number) {
  return fields.filter((field) => field.number === number).map((field) => field.value);
}

/** float32 little-endian (wire 5). */
function readFloat(buffer) {
  return buffer.readFloatLE(0);
}

function readInt32(buffer) {
  return buffer.readInt32LE(0);
}

module.exports = {
  WIRE_VARINT, WIRE_LENGTH, WIRE_FIXED32, WIRE_FIXED64,
  encodeVarint, encodeField, decodeFields, firstField, allFields,
  readFloat, readInt32,
};
