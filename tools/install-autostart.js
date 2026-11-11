'use strict';

/**
 * Registra el publicador automático para que arranque al iniciar sesión.
 *
 *   npm run autostart              instala la tarea
 *   npm run autostart -- --remove  la quita
 *
 * Usa una tarea programada de usuario (/RL LIMITED): no requiere administrador
 * y no modifica el Registro ni carpetas del sistema. El watcher no publica
 * nada al arrancar; espera un cambio real y aplica su debounce.
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TASK = 'AoE2 ELO Overlay Auto Publish';
const remove = process.argv.includes('--remove');

if (process.platform !== 'win32') {
  console.error('Este script es para Windows. En macOS/Linux usá launchd/systemd/cron con:');
  console.error(`  ${process.execPath} ${path.join(ROOT, 'tools', 'auto-publish.js')}`);
  process.exit(1);
}

const args = remove
  ? ['/Delete', '/TN', TASK, '/F']
  : [
      '/Create', '/TN', TASK,
      '/TR', `"${process.execPath}" "${path.join(ROOT, 'tools', 'auto-publish.js')}"`,
      '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F',
    ];

try {
  execFileSync('schtasks', args, { stdio: 'inherit' });
  console.log(remove ? 'Tarea eliminada.' : 'Tarea instalada: el publicador arranca al iniciar sesión.');
  if (!remove) {
    console.log('Para desactivarlo: npm run autostart -- --remove');
    console.log('Logs del watcher: auto-publish.log (en la carpeta del proyecto)');
  }
} catch (err) {
  console.error('No pude configurar la tarea programada:', err.message);
  console.error('Alternativa manual: ejecutá "npm run watch:publish" cuando quieras publicar.');
  process.exit(1);
}
