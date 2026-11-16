'use strict';

/**
 * Captura una repetición con el motor del juego y guarda el artefacto.
 *
 * Uso:
 *   node tools/engine-capture.js --latest --max-wall-seconds 900
 *   node tools/engine-capture.js "C:\ruta\partida.aoe2record" --certs .tmp-cade
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { captureCached, defaultCacheDirectory } = require('../src/engine/capture');

function latestReplay() {
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
  return files.length ? files[0].full : null;
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const replayPath = process.argv.includes('--latest')
    ? latestReplay()
    : process.argv.slice(2).find((value) => value.endsWith('.aoe2record'));
  if (!replayPath || !fs.existsSync(replayPath)) {
    console.error('No encontré la repetición.');
    process.exit(2);
  }
  const maxWallSeconds = Number(argument('--max-wall-seconds', '900'));
  const speed = argument('--speed') === null ? 3 : Number(argument('--speed'));
  const certDir = argument('--certs');
  const directory = argument('--cache-dir') || defaultCacheDirectory();

  console.log(`Repetición: ${path.basename(replayPath)}`);
  console.log(`Caché: ${directory}`);
  const startedAt = Date.now();
  const result = await captureCached({
    directory,
    replayPath,
    certDir,
    maxWallSeconds,
    speed,
    onProgress: (partial) => {
      const totals = partial.totals;
      console.log(
        `  ${partial.coverage.frames} frames · ${(partial.coverage.lastWorldTime / 1000).toFixed(0)}s ` +
        `· ${totals.production} producciones · ${totals.deaths} bajas · ${totals.kills} kills`,
      );
    },
  });

  if (!result.ok) {
    console.error(`Sin captura: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`);
    process.exit(1);
  }
  const artifact = result.artifact;
  console.log(
    `\n${result.cached ? 'Desde caché' : 'Capturado'} en ` +
    `${((Date.now() - startedAt) / 1000).toFixed(1)}s · ` +
    `${artifact.coverage.frames} frames · ${artifact.coverage.durationSeconds}s de juego`,
  );
  console.log('Totales:', JSON.stringify(artifact.totals));
  for (const [id, player] of Object.entries(artifact.players)) {
    console.log(
      `  jugador ${id}: edad ${player.age} | aldeanos ${player.produced.villagers}` +
      ` | perdidos ${player.lost.villagers} aldeanos / ${player.lost.units} unidades` +
      ` | eliminó ${player.killed.villagers} aldeanos / ${player.killed.units} unidades` +
      ` | vivos ${player.villagersAlive}`,
    );
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
