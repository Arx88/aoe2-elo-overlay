'use strict';

/**
 * Sonda de un guardado de AoE2 DE (`.aoe2mpgame` / `.aoe2spgame`).
 *
 * Objetivo: entender el contenedor antes de interpretarlo. Un guardado es un
 * volcado del estado del mundo, no un historial, así que lo que buscamos es el
 * bloque de estadísticas por jugador (bajas, pérdidas) si existe.
 *
 * No interpreta: mide. Magic, offsets, streams comprimidos que se pueden
 * inflar y qué aparece adentro de cada uno.
 */

const fs = require('node:fs');
const zlib = require('node:zlib');

function hex(buffer, length = 64) {
  return buffer.subarray(0, length).toString('hex').replace(/(..)/g, '$1 ').trim();
}

function ascii(buffer, length = 64) {
  return buffer.subarray(0, length).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
}

function tryInflate(buffer, offset) {
  try {
    const out = zlib.inflateSync(buffer.subarray(offset), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    return out;
  } catch {
    try {
      const out = zlib.inflateRawSync(buffer.subarray(offset), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      return out;
    } catch {
      return null;
    }
  }
}

function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('Uso: node tools/savegame-probe.js <archivo>');
    process.exit(2);
  }
  const buffer = fs.readFileSync(file);
  console.log(`archivo: ${file}`);
  console.log(`tamaño:  ${buffer.length} bytes`);
  console.log(`magic:   ${hex(buffer, 32)}`);
  console.log(`ascii:   ${ascii(buffer, 64)}`);

  // Cabecera de texto típica de DE: versión y longitud de cabecera.
  const head = buffer.subarray(0, 256).toString('latin1');
  const versionMatch = /(v\d+\.\d+\.\d+|\d+\.\d+\.\d+)/.exec(head);
  console.log(`versión en cabecera: ${versionMatch ? versionMatch[1] : 'no encontrada'}`);

  // ¿Hay streams zlib? Se buscan cabeceras válidas y se intenta inflar cada una.
  const streams = [];
  for (let offset = 0; offset < buffer.length - 2; offset += 1) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const looksLikeZlib = first === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(second);
    if (!looksLikeZlib) continue;
    const out = tryInflate(buffer, offset);
    if (!out || out.length < 32) continue;
    streams.push({ offset, size: out.length, out });
    offset += Math.max(1, Math.floor(out.length / 8)); // saltear para no encadenar falsos positivos
  }

  console.log(`\nstreams comprimidos legibles: ${streams.length}`);
  for (const stream of streams.slice(0, 12)) {
    const text = stream.out.subarray(0, 48).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
    const words = [];
    for (let i = 0; i + 4 <= Math.min(stream.out.length, 4096); i += 1) {
      const slice = stream.out.subarray(i, i + 12).toString('latin1');
      if (/^[a-z_]{4,12}$/.test(slice)) words.push(slice);
      if (words.length > 6) break;
    }
    console.log(
      `  offset ${String(stream.offset).padStart(9)} · ${String(stream.size).padStart(9)} bytes ` +
      `· ${text}${words.length ? ` · palabras: ${words.join(',')}` : ''}`,
    );
  }

  // Texto plano notable: nombres de campo de estadísticas si el formato los deja sueltos.
  const plain = buffer.toString('latin1');
  for (const needle of ['stat', 'kill', 'lost', 'villager', 'resign']) {
    const index = plain.toLowerCase().indexOf(needle);
    console.log(`texto "${needle}": ${index >= 0 ? `en offset ${index}` : 'no aparece'}`);
  }
}

main();
