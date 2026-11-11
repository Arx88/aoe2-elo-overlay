'use strict';

/**
 * Configura el canal de actualizaciones. Uso:
 *
 *   npm run setup:updates -- <usuario>/<repo>
 *   npm run setup:updates -- <usuario>/<repo> --ssh
 *
 * Es idempotente: se puede correr las veces que haga falta. NO sube nada a la
 * red (el push queda a cargo de `tools/auto-publish.js` o de un push manual),
 * y NUNCA escribe tokens en archivos: con --ssh la autenticación queda en una
 * clave de despliegue de ~/.ssh, fuera del repo.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const useSsh = args.includes('--ssh');

if (!target || !/^[\w.-]+\/[\w.-]+$/.test(target)) {
  console.error('Uso: npm run setup:updates -- <usuario>/<repo> [--ssh]');
  process.exit(1);
}

const [owner, repo] = target.split('/');
const httpsUrl = `https://github.com/${owner}/${repo}.git`;
const remoteUrl = useSsh ? `git@github.com:${owner}/${repo}.git` : httpsUrl;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}
function writeJson(file, data) {
  fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data, null, 2)}\n`);
}
function git(gitArgs, options = {}) {
  return execFileSync('git', ['-C', ROOT, ...gitArgs], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}
function gitSafe(gitArgs) {
  try {
    return git(gitArgs);
  } catch {
    return null;
  }
}

// 1. Repo aislado: el watcher jamás debe caer en el repo del directorio home.
let top = gitSafe(['rev-parse', '--show-toplevel']);
if (path.resolve(top || '') !== ROOT) {
  execFileSync('git', ['-C', ROOT, 'init', '-b', 'main'], { stdio: 'inherit' });
  top = git(['rev-parse', '--show-toplevel']);
}
if (path.resolve(top) !== ROOT) throw new Error('No pude aislar el repo git del overlay.');

// 2. .gitignore mínimo si faltara (config.json NUNCA debe subirse).
const ignorePath = path.join(ROOT, '.gitignore');
if (!fs.existsSync(ignorePath)) {
  fs.writeFileSync(ignorePath, [
    'node_modules/', 'dist/', 'para-compartir/', 'config.json', '*.log',
    'auto-publish.lock', '/*.png', '.workbuddy-ai/', 'Thumbs.db', '.DS_Store', '',
  ].join('\n'));
}

// 3. package.json: repository (electron-builder también lo usa para inferir).
const pkg = readJson('package.json');
pkg.repository = { type: 'git', url: httpsUrl };
writeJson('package.json', pkg);

// 4. electron-builder.json: proveedor GitHub + actualizaciones diferenciales.
const builder = readJson('electron-builder.json');
builder.publish = [{ provider: 'github', owner, repo, releaseType: 'release' }];
builder.nsis = { ...(builder.nsis || {}), differentialPackage: true };
writeJson('electron-builder.json', builder);

// 5. Remote limpio, sin credenciales embebidas.
const current = gitSafe(['remote', 'get-url', 'origin']);
if (current !== remoteUrl) {
  if (current) git(['remote', 'remove', 'origin']);
  git(['remote', 'add', 'origin', remoteUrl]);
}

// 6. Commit inicial y tag de la versión actual (si hacen falta).
git(['add', '-A']);
const changes = git(['status', '--porcelain']);
if (changes) {
  git(['commit', '-m', 'chore: overlay con canal de actualizaciones automáticas']);
}
const tag = `v${pkg.version}`;
if (!gitSafe(['tag', '-l', tag])) git(['tag', tag]);

console.log('');
console.log('Canal de actualizaciones configurado');
console.log(`  repo      : ${owner}/${repo}`);
console.log(`  publish   : github (latest.yml + NSIS + .blockmap)`);
console.log(`  remote    : ${remoteUrl}`);
console.log(`  tag       : ${tag}`);
console.log('');
console.log('Falta publicar el primer release:');
console.log('  git push -u origin main --tags');
console.log('');
console.log('Después, para no volver a tocar nada: npm run autostart');
