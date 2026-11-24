'use strict';

/**
 * CENSO DEL PAYLOAD SYNC (sonda aislada, sin conexión con la app).
 *
 * Qué hace:
 *   1. Camina el body del .aoe2record espejando el binrw de aoe2rec
 *      (lib.rs:98-194), byte a byte, hasta el PostGame final.
 *   2. Extrae TODOS los sync-checksum: reloj del juego en ms (verificado
 *      contra el WorldTime del PostGame) y el vector de estado por jugador
 *      (11 uint32 por jugador, player_id en el offset +8, verificado).
 *   3. Verifica los conteos contra aoe2rec-js (mismo archivo, mismo parser
 *      que usa la app): Action/Sync/Viewlock/Chat/Pregame/PostGame deben
 *      coincidir exacto; si no, la sonda falla en lugar de mentir.
 *
 * Qué NO hace:
 *   - No etiqueta los campos del vector como "recursos"/"objetos": las
 *     conjeturas públicas (mgz PR #123) quedaron desmentidas en el build
 *     actual (obj_count=0 para un jugador activo; total_res que no cuadra).
 *     Se exponen crudos (f0..f10) con sus deltas.
 *
 * Uso:
 *   node tools/sync-census.js <replay.aoe2record|replay.zip> [--out=archivo.json]
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MAGIC_END = Buffer.from([0xce, 0xa4, 0x59, 0xb1, 0x05, 0xdb, 0x7b, 0x43]);

function readRecord(inputPath) {
  const buf = fs.readFileSync(inputPath);
  // GetMatchReplay entrega un ZIP que contiene el .aoe2record.
  if (buf.subarray(0, 2).toString('latin1') === 'PK') {
    const adm = require('adm-zip');
    const zip = new adm(buf);
    const entry = zip.getEntries().find((e) => e.entryName.endsWith('.aoe2record'));
    if (!entry) throw new Error('el zip no contiene un .aoe2record');
    return entry.getData();
  }
  return buf;
}

/** Camina el body y devuelve ops + checksums. Lanza si el framing no cierra. */
function walkBody(body) {
  const u32 = (off) => body.readUInt32LE(off);
  const counts = { action: 0, sync: 0, syncChecksum: 0, viewlock: 0, chat: 0, pregame: 0, postgame: 0 };
  const checksums = [];
  let p = 0;
  while (p + 4 <= body.length) {
    const magic = u32(p);
    if (magic === 6) { counts.postgame += 1; p = body.length; break; }
    if (magic === 5) { counts.pregame += 1; p += 32; continue; }
    if (magic === 3) { counts.viewlock += 1; p += 16; continue; }
    if (magic === 4) { counts.chat += 1; p += 12 + u32(p + 8); continue; }
    if (magic === 2) {
      counts.sync += 1;
      if (u32(p + 8) !== 0) { p += 8; continue; }
      counts.syncChecksum += 1;
      const sequence = u32(p + 24);
      if (sequence > 0) {
        // values = 88 u32 desde p+12 (layout yilinho/mgz: 8 jugadores × 11);
        // current_time = u32 en p+364 (verificado contra WorldTime).
        const values = [];
        for (let i = 0; i < 88; i += 1) values.push(u32(p + 12 + i * 4));
        const players = {};
        for (let ptr = 0; ptr < 88; ptr += 11) {
          const playerId = values[ptr + 8];
          if (!playerId || playerId > 8) continue;
          players[playerId] = values.slice(ptr, ptr + 11);
        }
        checksums.push({ clock: u32(p + 364), sequence, players });
        p += 368;
      } else {
        p += 36;
      }
      continue;
    }
    if (magic === 1) {
      counts.action += 1;
      const length = u32(p + 4);
      p += 12 + length;
      if (p > body.length) throw new Error(`action length ${length} se pasa del body en p=${p}`);
      continue;
    }
    throw new Error(`magic desconocido 0x${magic.toString(16)} en p=${p}: el framing cambió`);
  }
  return { counts, checksums };
}

/** Converificación con el parser que usa la app: los conteos deben ser idénticos. */
async function verifyWithParser(recordBytes, counts) {
  let parser;
  try {
    const dir = path.join(__dirname, '..', 'node_modules', 'aoe2rec-js');
    parser = await import(require('node:url').pathToFileURL(path.join(dir, 'aoe2rec_js_bg.js')).href);
    const wasm = fs.readFileSync(path.join(dir, 'aoe2rec_js_bg.wasm'));
    const { instance } = await WebAssembly.instantiate(wasm, { './aoe2rec_js_bg.js': parser });
    parser.__wbg_set_wasm(instance.exports);
    instance.exports.__wbindgen_start();
  } catch (err) {
    return { verified: false, reason: `aoe2rec-js no disponible: ${err.message}` };
  }
  const replay = parser.parse_rec(recordBytes);
  const ops = replay.chapters[0].operations;
  const tally = { action: 0, sync: 0, syncChecksum: 0, viewlock: 0, chat: 0, pregame: 0, postgame: 0 };
  let worldTime = null;
  for (const op of ops) {
    if (op.Action) tally.action += 1;
    else if (op.Sync) { tally.sync += 1; if (op.Sync.checksum) tally.syncChecksum += 1; }
    else if (op.Viewlock) tally.viewlock += 1;
    else if (op.Chat) tally.chat += 1;
    else if (op.Pregame) tally.pregame += 1;
    else if (op.PostGame) {
      tally.postgame += 1;
      // El PostGame decodificado trae los bloques; el WorldTime es el reloj
      // final que confirma la cobertura de los checksums.
      const blocks = op.PostGame.blocks || [];
      for (const block of blocks) {
        const wt = block && block.WorldTime && block.WorldTime.world_time;
        if (Number.isFinite(wt)) worldTime = wt;
      }
    }
  }
  const ok = Object.keys(tally).every((k) => tally[k] === counts[k]);
  return { verified: ok, parserCounts: tally, worldTime, reason: ok ? 'conteos idénticos' : 'DIFERENCIA de conteos' };
}

/** Resumen humano: reloj verificado y eventos de caída de estado (posibles batallas). */
function summarize(checksums, worldTime) {
  const ids = Object.keys(checksums[checksums.length - 1]?.players || {});
  const lines = [];
  lines.push(`checksums: ${checksums.length} · reloj: ${checksums[0].clock} → ${checksums[checksums.length - 1].clock} ms` +
    (worldTime ? ` · WorldTime del PostGame: ${worldTime} ms` : ''));
  if (worldTime) {
    const last = checksums[checksums.length - 1].clock;
    lines.push(`  fin de cobertura: faltan ${worldTime - last} ms (${((worldTime - last) / 1000).toFixed(1)} s) para el fin declarado`);
  }
  lines.push(`jugadores detectados en el vector: ${ids.join(', ')} · offsets: id en +8`);
  // Deltas negativos grandes por jugador: caídas de la suma de estado (no las
  // etiquetamos: son la señal cruda de que algo murió/destruyó en ese tramo).
  const events = [];
  for (const id of ids) {
    let drops = 0;
    for (let i = 1; i < checksums.length; i += 1) {
      const a = checksums[i - 1].players[id];
      const b = checksums[i].players[id];
      if (!a || !b) continue;
      for (let f = 0; f < 11; f += 1) {
        const delta = b[f] - a[f];
        if (delta < -5000) {
          drops += 1;
          if (events.length < 12) {
            events.push(`  t=${(checksums[i].clock / 1000).toFixed(0)}s jugador ${id}: campo f${f} cayó ${delta.toLocaleString('es-AR')}`);
          }
          break;
        }
      }
    }
    lines.push(`  jugador ${id}: ${drops} tramos con caída grande de estado (>5000)`);
  }
  if (events.length) {
    lines.push('primeras caídas de estado (huella cruda de batallas/producción; semántica del campo sin confirmar):');
    lines.push(...events);
  }
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const input = argv.find((a) => !a.startsWith('--'));
  if (!input) {
    console.error('uso: node tools/sync-census.js <replay.aoe2record|replay.zip> [--out=archivo.json]');
    process.exit(2);
  }
  const record = readRecord(input);
  if (record.length > 8) {
    const tail = record.subarray(record.length - 8);
    if (!tail.equals(MAGIC_END)) {
      console.error(`aviso: el archivo no termina con el magic de fin de body (record truncado o formato nuevo)`);
    }
  }
  const headerEnd = record.readUInt32LE(0);
  const body = record.subarray(headerEnd);
  const { counts, checksums } = walkBody(body);
  const verification = await verifyWithParser(record, counts);

  // WorldTime real del PostGame: viene del propio parser (verifyWithParser).
  const worldTime = verification.worldTime ?? null;

  const result = {
    file: path.basename(input),
    bodyBytes: body.length,
    counts,
    verification,
    clock: {
      first: checksums[0]?.clock ?? null,
      last: checksums[checksums.length - 1]?.clock ?? null,
      worldTime,
      cadenceMs: checksums.length > 1
        ? Math.round((checksums[checksums.length - 1].clock - checksums[0].clock) / (checksums.length - 1))
        : null,
    },
    // Serie cruda por jugador: f0..f10 sin etiquetas semánticas (ver cabecera).
    series: checksums.map((c) => ({ t: c.clock, seq: c.sequence, players: c.players })),
  };

  const outArg = argv.find((a) => a.startsWith('--out='));
  if (outArg) {
    const outFile = outArg.split('=').slice(1).join('=');
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    console.log(`census completo → ${outFile}`);
  }
  console.log(summarize(checksums, worldTime));
  console.log(`verificación contra aoe2rec-js: ${verification.verified ? 'OK' : 'FALLÓ'} (${verification.reason})`);
  if (!verification.verified) process.exit(1);
}

main().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
