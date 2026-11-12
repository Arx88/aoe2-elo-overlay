'use strict';

/**
 * Captura una página local completa a un PNG con Electron.
 *
 *   electron tools/shot-page.js <archivo.html> <salida.png> <ancho> <alto>
 *
 * Se usa para las capturas de revisión de diseño a tamaño real (por ejemplo,
 * el panel pegado sobre una pantalla de 2194×1234). No forma parte del build:
 * es una herramienta de desarrollo, igual que el resto de tools/.
 */

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const [, , fileArg, outArg, widthArg, heightArg, zoomArg] = process.argv;
const file = path.resolve(fileArg || '');
const out = path.resolve(outArg || 'shot.png');
const width = Math.round(Number(widthArg) || 1280);
const height = Math.round(Number(heightArg) || 800);

app.disableHardwareAcceleration();
// Misma densidad que la pantalla del usuario (175 %): la captura sale a
// 3840×2160 y, abierta al 100 %, mide lo mismo que la app en pantalla.
if (process.env.SHOT_DPR) {
  app.commandLine.appendSwitch('force-device-scale-factor', String(process.env.SHOT_DPR));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadFile(file);
  // La ventana se abre al tamaño FÍSICO (p. ej. 3840) y el zoom deja la página
  // en sus píxeles CSS (2194): el resultado es 1:1 con la pantalla del usuario.
  // El zoom queda guardado por origen (file://): se normaliza siempre, si no
  // la siguiente captura hereda el 1.75 de la anterior.
  win.webContents.setZoomFactor(Number(process.env.SHOT_ZOOM) || 1);
  if (process.env.SHOT_ZOOM) await new Promise((resolve) => setTimeout(resolve, 900));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const image = await win.webContents.capturePage();
  // .jpg → JPEG calidad 92: mismas dimensiones y ~4× menos peso para las
  // capturas de pantalla completa que se comparten en el chat.
  const bytes = /\.jpe?g$/i.test(out) ? image.toJPEG(92) : image.toPNG();
  fs.writeFileSync(out, bytes);
  const size = image.getSize();
  console.log(`captura ${size.width}x${size.height} → ${out}`);
  app.quit();
});
