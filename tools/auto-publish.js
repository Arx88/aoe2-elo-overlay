'use strict';

/**
 * Publicador automático: convierte "guardar un archivo" en un Release nuevo.
 *
 *   npm run watch:publish            vigila la carpeta (modo normal)
 *   npm run publish:once             un solo ciclo y sale
 *   node tools/auto-publish.js --once --dry-run
 *
 * Flujo: detecta cambios -> espera un debounce -> sube la versión patch ->
 * commit -> tag vX.Y.Z -> push. El tag dispara .github/workflows/release.yml,
 * que compila en Windows y publica el instalador en GitHub Releases.
 *
 * Seguridad:
 *  - Se niega a trabajar si este directorio no es la RAÍZ de su propio repo
 *    (en esta máquina el repo padre es C:/Users/juanp, que es de otro proyecto).
 *  - Nunca maneja tokens: la autenticación es por clave SSH de despliegue.
 *  - config.json, logs, capturas, dist/ y node_modules/ quedan fuera del repo.
 *  - Un archivo de lock evita dos watchers publicando a la vez.
 *  - Si no hay red, no pierde el cambio: reintenta en el próximo barrido.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG_PATH = path.join(ROOT, 'auto-publish.log');
const LOCK_PATH = path.join(ROOT, 'auto-publish.lock');

const DEBOUNCE_MS = Number(process.env.AUTO_PUBLISH_DEBOUNCE_MS || 10 * 60 * 1000);
const SWEEP_MS = Number(process.env.AUTO_PUBLISH_SWEEP_MS || 15 * 60 * 1000);
const ONCE = process.argv.includes('--once');
const DRY = process.argv.includes('--dry-run');

const IGNORE_PREFIXES = [
  '.git/', 'node_modules/', 'dist/', 'para-compartir/', '.workbuddy-ai/',
];
// Cambios en estos archivos NO disparan un release. package*.json se excluyen
// para que el propio bump de versión no realimente el watcher.
const IGNORE_FILES = new Set([
  'package.json', 'package-lock.json',
  'config.json', 'auto-publish.log', 'auto-publish.lock',
  'update-channel.local.json',
  'tools/auto-publish.js', 'tools/setup-updates.js', 'tools/install-autostart.js',
]);

function normalize(value) {
  return String(value || '').replace(/\\/g, '/');
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(line);
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 256 * 1024) {
      fs.writeFileSync(LOG_PATH, '');
    }
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    /* el log nunca debe tumbar el watcher */
  }
}

function git(gitArgs) {
  return execFileSync('git', ['-C', ROOT, ...gitArgs], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}
function gitSafe(gitArgs) {
  try {
    return git(gitArgs);
  } catch {
    return null;
  }
}

function relevant(relative) {
  const p = normalize(relative);
  if (!p || p === '.git') return false;
  if (IGNORE_FILES.has(p)) return false;
  if (IGNORE_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  if (/^[^/]+\.png$/i.test(p)) return false; // capturas de la raíz (assets/** sí cuenta)
  if (/\.log$/i.test(p) || /Thumbs\.db$|\.DS_Store$/i.test(p)) return false;
  return true;
}

function statusChanges() {
  return git(['status', '--porcelain'])
    .split('\n')
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}
function meaningful(changes) {
  return changes.filter((rel) => {
    const p = normalize(rel);
    if (p.endsWith('.log') || p === 'config.json' || p === 'auto-publish.lock') return false;
    if (/^[^/]+\.png$/i.test(p)) return false;
    return true;
  });
}

function assertRepo() {
  const top = gitSafe(['rev-parse', '--show-toplevel']);
  if (!top || path.resolve(top) !== ROOT) {
    throw new Error('Este directorio no es la raíz de su propio repo git. Corré: npm run setup:updates -- <usuario>/<repo>');
  }
  const remote = gitSafe(['remote', 'get-url', 'origin']);
  if (!remote) throw new Error('Falta el remote origin. Corré: npm run setup:updates -- <usuario>/<repo>');
  return remote;
}

function bumpPatch() {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const parts = String(pkg.version || '0.0.0').split('.').map((n) => Number(n) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  const version = parts.slice(0, 3).join('.');
  pkg.version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lockPath = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = version;
    if (lock.packages && lock.packages['']) lock.packages[''].version = version;
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
  return version;
}

function push() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  git(['push', '-u', 'origin', branch, '--tags']);
  log(`push OK · rama ${branch} + tags`);
}

let running = false;
let needsRetry = false;

function publishCycle(reason = 'cambio') {
  if (running) return;
  running = true;
  try {
    const changes = meaningful(statusChanges());
    const unpushed = gitSafe(['log', '--oneline', '@{u}..HEAD']) || '';

    if (!changes.length && !unpushed.trim() && !needsRetry) {
      if (reason !== 'barrido') log(`sin cambios (${reason})`);
      return;
    }

    if (DRY) {
      log(`DRY-RUN · ${changes.length} archivos · se crearía un tag v<patch+1> y se haría push`);
      return;
    }

    if (changes.length) {
      const tag = `v${bumpPatch()}`;
      git(['add', '-A']);
      git(['commit', '-m', `release: ${tag} (auto)`]);
      if (!gitSafe(['tag', '-l', tag])) git(['tag', tag]);
      log(`commit y ${tag} listos · ${changes.length} archivos (${reason})`);
    }

    push();
    needsRetry = false;
  } catch (err) {
    needsRetry = true;
    const detail = String((err && err.stderr && err.stderr.toString()) || (err && err.message) || err)
      .split('\n')[0]
      .slice(0, 180);
    log(`falló (${reason}): ${detail} · reintento automático`);
  } finally {
    running = false;
  }
}

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const pid = Number(fs.readFileSync(LOCK_PATH, 'utf8').trim());
      let alive = false;
      if (pid && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch (err) {
          if (err.code !== 'ESRCH') alive = true;
        }
      }
      if (alive) throw new Error(`Ya hay un watcher corriendo (pid ${pid}).`);
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
function releaseLock() {
  try {
    if (fs.readFileSync(LOCK_PATH, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK_PATH);
  } catch {
    /* nada que liberar */
  }
}
process.on('exit', releaseLock);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

function main() {
  const remote = assertRepo();
  acquireLock();
  log(`watcher activo · remote ${remote} · debounce ${Math.round(DEBOUNCE_MS / 60000)} min`);
  if (DRY) log('modo DRY-RUN: no se modifica ni se sube nada');

  if (ONCE) {
    publishCycle('manual');
    return;
  }

  let debounceTimer = null;
  const schedule = (reason) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      publishCycle(reason);
    }, DEBOUNCE_MS);
  };

  try {
    fs.watch(ROOT, { recursive: true }, (_event, filename) => {
      const rel = normalize(filename);
      if (!relevant(rel)) return;
      schedule(`cambio en ${rel}`);
    });
    log('fs.watch recursivo OK');
  } catch (err) {
    log(`fs.watch no disponible (${err.message}) · alcanza con el barrido periódico`);
  }

  // Red de seguridad: cubre eventos perdidos, cambios hechos con el watcher
  // apagado y los reintentos cuando no había conexión.
  setInterval(() => publishCycle('barrido'), SWEEP_MS);
  log(`barrido cada ${Math.round(SWEEP_MS / 60000)} min`);
}

main();
