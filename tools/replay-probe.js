'use strict';

/**
 * Sonda del contenido real de una repetición.
 *
 * Sirve para dos preguntas concretas:
 *   1. ¿qué tipos de acción aparecen y con qué frecuencia?
 *   2. ¿los opcodes sin decodificar (`Unknown44`, `DeUnknown196`) llevan datos
 *      que expliquen bajas, o son ruido de interfaz?
 *
 * No interpreta: muestra lo que hay para no afirmar de más.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadParser() {
  const directory = path.join(__dirname, '..', 'node_modules', 'aoe2rec-js');
  const parser = await import(pathToFileURL(path.join(directory, 'aoe2rec_js_bg.js')).href);
  const wasm = fs.readFileSync(path.join(directory, 'aoe2rec_js_bg.wasm'));
  const { instance } = await WebAssembly.instantiate(wasm, { './aoe2rec_js_bg.js': parser });
  parser.__wbg_set_wasm(instance.exports);
  instance.exports.__wbindgen_start();
  return parser;
}

function replayFiles() {
  const saves = path.join(os.homedir(), 'Games', 'Age of Empires 2 DE');
  const files = [];
  for (const user of fs.readdirSync(saves)) {
    const directory = path.join(saves, user, 'savegame');
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory)) {
      if (!name.endsWith('.aoe2record')) continue;
      const full = path.join(directory, name);
      files.push({ full, mtimeMs: fs.statSync(full).mtimeMs });
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

function describe(value) {
  if (!value || typeof value !== 'object') return String(value);
  const keys = Object.keys(value);
  const summary = keys.map((key) => {
    const field = value[key];
    if (Buffer.isBuffer(field) || field instanceof Uint8Array) {
      const buffer = Buffer.from(field);
      return `${key}=<${buffer.length}B ${buffer.subarray(0, 24).toString('hex')}>`;
    }
    if (Array.isArray(field)) return `${key}=[${field.length}]`;
    return `${key}=${JSON.stringify(field)}`;
  });
  return summary.join(' ');
}

async function main() {
  const parser = await loadParser();
  const limit = Number(process.argv[2]) || 1;
  for (const file of replayFiles().slice(0, limit)) {
    const buffer = fs.readFileSync(file.full);
    const record = parser.parse_rec(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    );
    const operations = record.chapters.flatMap((chapter) => chapter.operations || []);
    const types = new Map();
    for (const operation of operations) {
      const action = operation.Action;
      const data = action && action.action_data;
      if (!data) continue;
      const type = Object.keys(data)[0] || 'vacio';
      if (!types.has(type)) types.set(type, { count: 0, samples: [] });
      const entry = types.get(type);
      entry.count += 1;
      if (entry.samples.length < 4) {
        entry.samples.push({ ms: action.world_time, player: action.player_id, body: describe(data[type]) });
      }
    }
    console.log(`\n=== ${path.basename(file.full)} · ${operations.length} acciones ===`);
    for (const [type, entry] of [...types.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`\n${type}  ×${entry.count}`);
      for (const sample of entry.samples) {
        console.log(`   t=${(sample.ms / 1000).toFixed(1)}s j${sample.player} ${sample.body.slice(0, 220)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
