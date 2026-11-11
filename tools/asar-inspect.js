'use strict';

/**
 * Inspecciona el contenido del app.asar empaquetado.
 * Uso: node tools/asar-inspect.js
 */

const asar = require('@electron/asar');
const path = require('node:path');

const target = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
const files = asar.listPackage(target);

const civs = files.filter((file) => file.includes('assets') && file.endsWith('.png'));

console.log(`archivos totales: ${files.length}`);
console.log(`escudos en el asar: ${civs.length}`);
console.log(`ejemplos: ${civs.slice(0, 4).join(' ')}`);

for (const name of [
  'settings.html',
  'settings.js',
  'settings.css',
  'settings-preload.js',
  'src/civs.js',
]) {
  const present = files.some((file) => file.replace(/\\/g, '/').endsWith(name));
  console.log(`${name} → ${present ? 'OK' : 'FALTA'}`);
}
