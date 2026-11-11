'use strict';

/**
 * Detecta el profile_id de AoE2 DE sin que el usuario lo busque a mano.
 *
 * El juego guarda una carpeta por cuenta en:
 *   %USERPROFILE%\Games\Age of Empires 2 DE\<id>\
 * Ese <id> es el SteamID64 en Steam, pero en Microsoft Store / Game Pass es un
 * XUID numérico. Por eso se aceptan ambos y se prueban los dos formatos de
 * nombre de perfil que entiende el backend:
 *   /steam/<id>  y  /xbox/<id>
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getJson } = require('./aoe');

const WE_BASE = process.env.AOE_WE_BASE || 'https://aoe-api.worldsedgelink.com';

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
 * Devuelve { profileId, alias } de la cuenta más activa, o null.
 * Con varias cuentas en la máquina se queda con la que jugó más recientemente.
 */
async function detectProfile(log = () => {}) {
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

module.exports = { detectProfile, listAccounts, accountRoots, resolveSteamId, resolveAccountName, listSteamIds: () => listAccounts().map((a) => a.id) };
