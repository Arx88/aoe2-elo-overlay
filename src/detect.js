'use strict';

/**
 * Detecta el profile_id de AoE2 DE sin que el usuario lo busque a mano.
 *
 * Orden de prioridad (para soportar múltiples cuentas de Steam en la misma PC):
 *   1) Sesión activa de Steam en Windows:
 *        HKCU\Software\Valve\Steam\ActiveProcess -> ActiveUser (Steam32 -> SteamID64)
 *   2) Último inicio de sesión en Steam:
 *        <SteamPath>\config\loginusers.vdf ("MostRecent" "1" / mayor "Timestamp")
 *   3) Carpetas locales del juego (%USERPROFILE%\Games\Age of Empires 2 DE\<id>\),
 *      compatible tanto con SteamID64 (/steam/<id>) como con XUID de Xbox/Game Pass (/xbox/<id>).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');

const { getJson } = require('./aoe');

function sha256Hex(raw) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

function parseAllLoginUsersVdf(text) {
  if (!text || typeof text !== 'string') return [];
  const blockRe = /"(7656119\d{10})"\s*\{([^}]*)\}/g;
  const out = [];
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    out.push(m[1]);
  }
  return [...new Set(out)];
}

/**
 * Recolecta hashes SHA-256 de TODAS las cuentas Steam/Xbox locales vistas en esta PC
 * (loginusers.vdf + carpetas de Age of Empires 2 DE) para bloqueo antifraude anti-smurf.
 */
function collectLocalPlatformIdHashes(extraEntries = []) {
  const hashes = new Set();
  const add = (platform, id) => {
    const cleanId = String(id || '').trim();
    if (!platform || !cleanId) return;
    hashes.add(sha256Hex(`${platform}:${cleanId}`));
  };
  for (const entry of extraEntries) {
    if (entry && entry.platform && entry.id) add(entry.platform, entry.id);
  }
  if (process.platform === 'win32') {
    const pathOut = queryRegistry('HKCU\\Software\\Valve\\Steam', 'SteamPath');
    const steamPaths = [
      parseRegSz(pathOut, 'SteamPath'),
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
    ].filter(Boolean);
    for (const base of [...new Set(steamPaths)]) {
      try {
        const vdfPath = path.join(base, 'config', 'loginusers.vdf');
        if (!fs.existsSync(vdfPath)) continue;
        const ids = parseAllLoginUsersVdf(fs.readFileSync(vdfPath, 'utf8'));
        for (const sid of ids) add('steam', sid);
      } catch (_) {}
    }
  }
  for (const acc of listAccounts()) {
    const isSteam = /^7656119\d{10}$/.test(acc.id);
    add(isSteam ? 'steam' : 'xbox', acc.id);
  }
  return Array.from(hashes).slice(0, 20);
}

function buildLocalProof({ platform, platformId, source, accounts = [] }) {
  const cleanId = String(platformId || '').trim();
  const matchedAcc = accounts.find((a) => String(a.id) === cleanId) || null;
  let hasSavegameDir = false;
  if (matchedAcc && matchedAcc.dir) {
    try {
      const sgDir = path.join(matchedAcc.dir, 'savegame');
      if (fs.existsSync(sgDir)) {
        const files = fs.readdirSync(sgDir);
        hasSavegameDir = files.some((f) => /\.aoe2record$/i.test(f));
      }
    } catch (_) {}
  }
  return {
    platform,
    platformId: cleanId,
    source,
    hasProfileDir: Boolean(matchedAcc),
    hasSavegameDir,
    allLocalPlatformIdHashes: collectLocalPlatformIdHashes([{ platform, id: cleanId }]),
  };
}

const WE_BASE = process.env.AOE_WE_BASE || 'https://aoe-api.worldsedgelink.com';
const STEAM_ID64_BASE = 76561197960265728n;

function accountIdToSteamId64(accountId) {
  const n = typeof accountId === 'bigint' ? accountId : BigInt(accountId);
  if (n <= 0n || n > 0xffffffffn) return null;
  return (STEAM_ID64_BASE + n).toString();
}

function parseRegDword(output, valueName) {
  const re = new RegExp(`${valueName}\\s+REG_DWORD\\s+(0x[0-9a-f]+|\\d+)`, 'i');
  const m = re.exec(String(output || ''));
  if (!m) return null;
  const raw = m[1];
  const num = raw.toLowerCase().startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function parseRegSz(output, valueName) {
  const re = new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)`, 'i');
  const m = re.exec(String(output || ''));
  return m ? m[1].trim() : null;
}

function parseLoginUsersVdf(text) {
  if (!text || typeof text !== 'string') return null;
  // Cada usuario en loginusers.vdf es un bloque "7656119..." { ... }
  const blockRe = /"(7656119\d{10})"\s*\{([^}]*)\}/g;
  const users = [];
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const steamId = m[1];
    const body = m[2];
    const mostRecent = /"MostRecent"\s*"1"/i.test(body);
    const tsMatch = /"Timestamp"\s*"(\d+)"/i.exec(body);
    const timestamp = tsMatch ? Number(tsMatch[1]) : 0;
    users.push({ steamId, mostRecent, timestamp });
  }
  if (!users.length) return null;
  users.sort((a, b) => {
    if (a.mostRecent !== b.mostRecent) return a.mostRecent ? -1 : 1;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });
  return users[0].steamId;
}

function queryRegistry(keyPath, valueName) {
  if (process.platform !== 'win32') return null;
  try {
    return execFileSync('reg', ['query', keyPath, '/v', valueName], {
      encoding: 'utf8',
      timeout: 1500,
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

function queryRegistryAsync(keyPath, valueName) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', keyPath, '/v', valueName],
      { encoding: 'utf8', timeout: 1500, windowsHide: true },
      (err, stdout) => {
        resolve(err ? null : stdout);
      },
    );
  });
}

/** Versión asíncrona no bloqueante de getActiveSteamId (ideal para polling periódico en main.js). */
async function getActiveSteamIdAsync(log = () => {}) {
  if (process.platform !== 'win32') return null;

  const activeOut = await queryRegistryAsync('HKCU\\Software\\Valve\\Steam\\ActiveProcess', 'ActiveUser');
  const activeAccountId = parseRegDword(activeOut, 'ActiveUser');
  if (activeAccountId) {
    const steamId = accountIdToSteamId64(activeAccountId);
    if (steamId) {
      log(`Steam activo detectado (ActiveUser): ${steamId}`);
      return { steamId, source: 'steam-active-process' };
    }
  }

  const pathOut = await queryRegistryAsync('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  const steamPaths = [
    parseRegSz(pathOut, 'SteamPath'),
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ].filter(Boolean);

  for (const base of [...new Set(steamPaths)]) {
    const vdfPath = path.join(base, 'config', 'loginusers.vdf');
    try {
      const raw = await fs.promises.readFile(vdfPath, 'utf8');
      const steamId = parseLoginUsersVdf(raw);
      if (steamId) {
        log(`Steam reciente detectado (loginusers.vdf): ${steamId}`);
        return { steamId, source: 'steam-loginusers' };
      }
    } catch {
      /* archivo inexistente o ilegible: seguir con el siguiente candidato */
    }
  }

  return null;
}

/**
 * Devuelve { steamId, source } de la cuenta de Steam actualmente activa en Windows,
 * o null si Steam no está activo / instalado.
 */
function getActiveSteamId(log = () => {}) {
  if (process.platform !== 'win32') return null;

  // 1) Proceso activo de Steam (cambia al instante cuando el usuario cambia de cuenta)
  const activeOut = queryRegistry('HKCU\\Software\\Valve\\Steam\\ActiveProcess', 'ActiveUser');
  const activeAccountId = parseRegDword(activeOut, 'ActiveUser');
  if (activeAccountId) {
    const steamId = accountIdToSteamId64(activeAccountId);
    if (steamId) {
      log(`Steam activo detectado (ActiveUser): ${steamId}`);
      return { steamId, source: 'steam-active-process' };
    }
  }

  // 2) Fallback: loginusers.vdf cuando Steam está cerrado o en transición
  const pathOut = queryRegistry('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  const steamPaths = [
    parseRegSz(pathOut, 'SteamPath'),
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ].filter(Boolean);

  for (const base of [...new Set(steamPaths)]) {
    const vdfPath = path.join(base, 'config', 'loginusers.vdf');
    try {
      if (!fs.existsSync(vdfPath)) continue;
      const raw = fs.readFileSync(vdfPath, 'utf8');
      const steamId = parseLoginUsersVdf(raw);
      if (steamId) {
        log(`Steam reciente detectado (loginusers.vdf): ${steamId}`);
        return { steamId, source: 'steam-loginusers' };
      }
    } catch {
      /* archivo ilegible: seguir con el siguiente candidato */
    }
  }

  return null;
}

/** Rutas donde el juego crea las carpetas de cuenta (se prueban todas). */
function accountRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, 'Games', 'Age of Empires 2 DE'),
    path.join(home, 'Games', 'Age of Empires II DE'),
    path.join(home, 'Games', 'Age of Empires 2 Definitive Edition'),
  ];
  return [...new Set(roots)];
}

/** Cuentas encontradas en disco, la más usada primero. */
function listAccounts() {
  const accounts = [];

  for (const root of accountRoots()) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue; // esa raíz no existe en esta PC
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // SteamID64 tiene 17 dígitos; el XUID de Xbox es numérico más corto.
      if (!/^\d{6,20}$/.test(entry.name)) continue;

      let mtime = 0;
      try {
        mtime = fs.statSync(path.join(root, entry.name)).mtimeMs;
      } catch {
        /* carpeta ilegible: se ignora */
      }
      accounts.push({ id: entry.name, root, dir: path.join(root, entry.name), mtime });
    }
  }

  return accounts.sort((a, b) => b.mtime - a.mtime);
}

/** Nombres de perfil que el backend acepta; se prueban en orden. */
const NAME_PREFIXES = ['/steam/', '/xbox/'];

async function resolveAccountName(name) {
  const url =
    `${WE_BASE}/community/leaderboard/getPersonalStat?title=age2` +
    `&profile_names=${encodeURIComponent(JSON.stringify([name]))}`;
  const data = await getJson(url);

  // Ojo: al buscar por profile_names el backend responde con statGroups[] pero
  // deja profiles[] vacío. El perfil está en statGroups[0].members[0].
  const group = (data.statGroups || [])[0];
  const member = (data.profiles || [])[0] || (group && (group.members || [])[0]);
  if (!member || member.profile_id == null) return null;

  let lastMatchAt = null;
  for (const row of data.leaderboardStats || []) {
    const ts = Number(row.lastmatchdate) * 1000;
    if (Number.isFinite(ts) && (!lastMatchAt || ts > lastMatchAt)) lastMatchAt = ts;
  }

  return { profileId: Number(member.profile_id), alias: member.alias || null, lastMatchAt, name };
}

async function resolveSteamId(steamId) {
  return resolveAccountName(`/steam/${steamId}`);
}

/**
 * Devuelve { profileId, alias } priorizando la cuenta de Steam actualmente
 * iniciada en esta PC. Si no hay sesión de Steam con perfil de AoE2 (p. ej.
 * Game Pass / Xbox), cae a las carpetas locales ordenadas por partida reciente.
 */
async function detectProfile(log = () => {}) {
  const accounts = listAccounts();
  // 1) Prioridad absoluta: sesión actual de Steam (no bloqueante)
  const activeSteam = await getActiveSteamIdAsync(log);
  if (activeSteam && activeSteam.steamId) {
    try {
      const activeFound = await resolveSteamId(activeSteam.steamId);
      if (activeFound) {
        log(
          `cuenta Steam activa ${activeFound.alias || activeSteam.steamId} → profile_id ${activeFound.profileId} ` +
            `(${activeSteam.source})`,
        );
        const proofSource = activeSteam.source === 'steam-active-process' ? 'steam-active' : 'steam-vdf';
        return {
          ...activeFound,
          localProof: buildLocalProof({
            platform: 'steam',
            platformId: activeSteam.steamId,
            source: proofSource,
            accounts,
          }),
        };
      }
      log(`la cuenta de Steam activa (${activeSteam.steamId}) no devolvió perfil de AoE2; pruebo carpetas locales`);
    } catch (err) {
      log(`no pude resolver cuenta Steam activa (${activeSteam.steamId}): ${err.message}`);
    }
  }

  // 2) Fallback: carpetas locales de AoE2 DE (Xbox/Game Pass o Steam sin sesión)
  if (!accounts.length) {
    log(`no encontré carpetas de cuenta en: ${accountRoots().join(' | ')}`);
    return null;
  }

  log(`carpetas de cuenta encontradas: ${accounts.map((a) => a.id).join(', ')}`);

  const resolved = [];
  for (const account of accounts) {
    for (const prefix of NAME_PREFIXES) {
      try {
        const found = await resolveAccountName(`${prefix}${account.id}`);
        if (found) {
          const platform = prefix === '/steam/' ? 'steam' : 'xbox';
          resolved.push({
            ...found,
            localProof: buildLocalProof({
              platform,
              platformId: account.id,
              source: 'local-folder',
              accounts,
            }),
          });
          log(
            `cuenta ${found.alias || account.id} → profile_id ${found.profileId} ` +
              `(${prefix}${account.id})`,
          );
          break;
        }
      } catch (err) {
        log(`no pude resolver ${prefix}${account.id}: ${err.message}`);
      }
    }
  }

  if (!resolved.length) return null;
  resolved.sort((a, b) => (b.lastMatchAt || 0) - (a.lastMatchAt || 0));
  return resolved[0];
}

module.exports = {
  detectProfile,
  getActiveSteamId,
  getActiveSteamIdAsync,
  accountIdToSteamId64,
  parseRegDword,
  parseLoginUsersVdf,
  collectLocalPlatformIdHashes,
  listAccounts,
  accountRoots,
  resolveSteamId,
  resolveAccountName,
  listSteamIds: () => listAccounts().map((a) => a.id),
};
