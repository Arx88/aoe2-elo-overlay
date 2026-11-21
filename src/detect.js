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
const { execFileSync } = require('node:child_process');

const { getJson } = require('./aoe');

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
  // 1) Prioridad absoluta: sesión actual de Steam
  const activeSteam = getActiveSteamId(log);
  if (activeSteam && activeSteam.steamId) {
    try {
      const activeFound = await resolveSteamId(activeSteam.steamId);
      if (activeFound) {
        log(
          `cuenta Steam activa ${activeFound.alias || activeSteam.steamId} → profile_id ${activeFound.profileId} ` +
            `(${activeSteam.source})`,
        );
        return activeFound;
      }
      log(`la cuenta de Steam activa (${activeSteam.steamId}) no devolvió perfil de AoE2; pruebo carpetas locales`);
    } catch (err) {
      log(`no pude resolver cuenta Steam activa (${activeSteam.steamId}): ${err.message}`);
    }
  }

  // 2) Fallback: carpetas locales de AoE2 DE (Xbox/Game Pass o Steam sin sesión)
  const accounts = listAccounts();
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
          resolved.push(found);
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
  accountIdToSteamId64,
  parseRegDword,
  parseLoginUsersVdf,
  listAccounts,
  accountRoots,
  resolveSteamId,
  resolveAccountName,
  listSteamIds: () => listAccounts().map((a) => a.id),
};
