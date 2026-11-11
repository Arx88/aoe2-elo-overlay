'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onState: (callback) => ipcRenderer.on('overlay:state', (_event, state) => callback(state)),
  onConfig: (callback) => ipcRenderer.on('overlay:config', (_event, config) => callback(config)),
  onMovable: (callback) => ipcRenderer.on('overlay:movable', (_event, on) => callback(on)),
  onView: (callback) => ipcRenderer.on('overlay:view', (_event, view) => callback(view)),
  onRival: (callback) => ipcRenderer.on('overlay:rival', (_event, report) => callback(report)),
  // Aviso de actualización: el overlay es click-through, así que es solo visual.
  onUpdate: (callback) => ipcRenderer.on('overlay:update', (_event, payload) => callback(payload)),
  moveDone: () => ipcRenderer.send('overlay:move-done'),
  reportHeight: (height) => ipcRenderer.send('overlay:height', height),
  // El renderer avisa cuando ya tiene los listeners puestos: main reenvía el
  // estado actual, así ningún estado temprano se pierde.
  ready: () => ipcRenderer.send('overlay:ready'),
  reportError: (message) => ipcRenderer.send('overlay:error', String(message).slice(0, 800)),
});
