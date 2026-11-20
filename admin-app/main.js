'use strict';

const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'admin-vault.json');

function readVault() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8'));
    let secret = '';
    if (raw.secretEnc && safeStorage.isEncryptionAvailable()) {
      secret = safeStorage.decryptString(Buffer.from(raw.secretEnc, 'base64'));
    } else if (raw.secretPlain) {
      secret = raw.secretPlain;
    }
    return { apiUrl: raw.apiUrl || '', secret, demoMode: raw.demoMode === true };
  } catch (_) {
    return { apiUrl: '', secret: '', demoMode: false };
  }
}

function writeVault({ apiUrl, secret, demoMode }) {
  const payload = {
    apiUrl: String(apiUrl || '').trim().replace(/\/+$/, ''),
    demoMode: Boolean(demoMode),
  };
  if (secret) {
    if (safeStorage.isEncryptionAvailable()) {
      payload.secretEnc = safeStorage.encryptString(String(secret)).toString('base64');
    } else {
      payload.secretPlain = String(secret);
    }
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(payload, null, 2), 'utf8');
}

function validateUrl(raw) {
  const u = new URL(String(raw || '').trim());
  const local = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (u.protocol !== 'https:' && !local) throw new Error('Solo se permite HTTPS (o localhost en desarrollo).');
  return u.origin + u.pathname.replace(/\/+$/, '');
}

async function apiRequest(method, endpoint, body = null) {
  const vault = readVault();
  if (!vault.apiUrl || !vault.secret) throw new Error('Configura la URL del Worker y tu ADMIN_SECRET primero.');
  const base = validateUrl(vault.apiUrl);
  const res = await fetch(`${base}${endpoint}`, {
    method,
    headers: {
      authorization: `Bearer ${vault.secret}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#0e1215',
    frame: false,
    title: 'AoE2 Helper · Consola Admin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('win:minimize', () => win?.minimize());
  ipcMain.handle('win:maximize', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('win:close', () => win?.close());

  ipcMain.handle('vault:get', () => {
    const v = readVault();
    return { apiUrl: v.apiUrl, hasSecret: Boolean(v.secret), demoMode: v.demoMode, encrypted: safeStorage.isEncryptionAvailable() };
  });
  ipcMain.handle('vault:save', (_, { apiUrl, secret, demoMode }) => {
    const prev = readVault();
    writeVault({
      apiUrl: apiUrl != null ? apiUrl : prev.apiUrl,
      secret: secret ? secret : prev.secret,
      demoMode: Boolean(demoMode),
    });
    return { ok: true };
  });
  ipcMain.handle('api:health', async () => {
    const v = readVault();
    const base = validateUrl(v.apiUrl);
    const res = await fetch(`${base}/v1/health`);
    return res.json();
  });
  ipcMain.handle('api:listAccounts', (_, query) =>
    apiRequest('GET', `/v1/admin/accounts${query ? `?q=${encodeURIComponent(query)}` : ''}`)
  );
  ipcMain.handle('api:upsertAccount', (_, payload) => apiRequest('POST', '/v1/admin/accounts', payload));
  ipcMain.handle('api:patchAccount', (_, { id, patch }) =>
    apiRequest('PATCH', `/v1/admin/accounts/${encodeURIComponent(id)}`, patch)
  );
  ipcMain.handle('api:deleteAccount', (_, id) =>
    apiRequest('DELETE', `/v1/admin/accounts/${encodeURIComponent(id)}`)
  );
  ipcMain.handle('api:updateSettings', (_, settings) => apiRequest('POST', '/v1/admin/settings', settings));
  ipcMain.handle('api:audit', () => apiRequest('GET', '/v1/admin/audit'));
});

app.on('window-all-closed', () => app.quit());
