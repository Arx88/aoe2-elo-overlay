'use strict';

/**
 * Analiza una sola repetición y reporta producción e ids sin mapear.
 * Va por archivo porque una repetición corrupta puede tumbar el parser.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { productionFromOperations } = require('../src/engine/production');

async function main() {
  const file = process.argv[2];
  const directory = path.join(__dirname, '..', 'node_modules', 'aoe2rec-js');
  const parser = await import(pathToFileURL(path.join(directory, 'aoe2rec_js_bg.js')).href);
  const wasm = fs.readFileSync(path.join(directory, 'aoe2rec_js_bg.wasm'));
  const { instance } = await WebAssembly.instantiate(wasm, { './aoe2rec_js_bg.js': parser });
  parser.__wbg_set_wasm(instance.exports);
  instance.exports.__wbindgen_start();

  const buffer = fs.readFileSync(file);
  const record = parser.parse_rec(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const production = productionFromOperations(record.chapters.flatMap((c) => c.operations || []));
  const unmapped = new Set();
  let players = 0;
  for (const player of Object.values(production || {})) {
    players += 1;
    for (const key of Object.keys(player.names)) {
      if (/^(unidad|edificio)-/.test(key)) unmapped.add(player.names[key]);
    }
  }
  console.log(
    `${path.basename(file)} | ${players} jugadores | ` +
    `${unmapped.size ? [...unmapped].join(', ') : 'sin ids sin mapear'}`,
  );
}

main().catch((error) => {
  console.log(`ILEGIBLE: ${path.basename(process.argv[2])} — ${String(error.message).slice(0, 80)}`);
  process.exit(1);
});
