'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('AdminAPI', {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  close: () => ipcRenderer.invoke('win:close'),
  getVault: () => ipcRenderer.invoke('vault:get'),
  saveVault: (data) => ipcRenderer.invoke('vault:save', data),
  health: () => ipcRenderer.invoke('api:health'),
  listAccounts: (q) => ipcRenderer.invoke('api:listAccounts', q),
  upsertAccount: (payload) => ipcRenderer.invoke('api:upsertAccount', payload),
  patchAccount: (id, patch) => ipcRenderer.invoke('api:patchAccount', { id, patch }),
  deleteAccount: (id) => ipcRenderer.invoke('api:deleteAccount', id),
  updateSettings: (settings) => ipcRenderer.invoke('api:updateSettings', settings),
  audit: () => ipcRenderer.invoke('api:audit'),
});
