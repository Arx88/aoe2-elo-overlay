'use strict';

/**
 * Electron Builder `afterPack` hook · Seguridad B-01 (Electron Fuses + Integridad ASAR)
 *
 * Endurece el ejecutable empaquetado de Relic desactivando vectores clásicos
 * de manipulación de Electron:
 *   - RunAsNode = false (impide usar Relic.exe como runtime Node arbitrario)
 *   - EnableNodeOptionsEnvironmentVariable = false (bloquea NODE_OPTIONS)
 *   - EnableNodeCliInspectArguments = false (bloquea --inspect / --remote-debugging)
 *   - EnableCookieEncryption = true
 *   - OnlyLoadAppFromAsar = true (impide inyectar carpeta `resources/app` suelta)
 *   - EnableEmbeddedAsarIntegrityValidation = true (valida integridad del app.asar)
 */
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const appName = context.packager.appInfo.productFilename;
  let exePath;
  if (platform === 'win32') {
    exePath = path.join(context.appOutDir, `${appName}.exe`);
  } else if (platform === 'darwin') {
    exePath = path.join(context.appOutDir, `${appName}.app`);
  } else {
    exePath = path.join(context.appOutDir, appName);
  }

  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
  console.log(`  • applied Electron security fuses  executablePath=${exePath}`);
};
