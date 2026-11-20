/**
 * AoE2 Helper · Licensing & Remote Access Control API (Cloudflare Workers + D1)
 *
 * Firma entitlements Ed25519 (`v1.<b64url-json>.<b64url-sig>`) 100% compatibles
 * con `src/product.js#verifyEntitlement()`. La clave privada vive únicamente en
 * secretos de Cloudflare y nunca toca la app pública de los usuarios.
 */

const TOKEN_PREFIX = 'aoe2-helper.entitlement.v1.';
const AUDIENCE = 'aoe2-helper';
const VALID_PLANS = new Set(['free', 'pro', 'promax']);

const b64url = (bytes) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64ToBytes = (b64) => {
  const bin = atob(String(b64 || '').trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ha = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(a || ''))));
  const hb = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(b || ''))));
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_SECRET) return false;
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const supplied = auth.slice(7).trim();
  if (!supplied) return false;
  return timingSafeEqual(supplied, env.ADMIN_SECRET);
}

async function signEntitlement(payload, env) {
  if (!env.ED25519_PRIVATE_KEY_B64) throw new Error('missing-signing-key');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    b64ToBytes(env.ED25519_PRIVATE_KEY_B64),
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  const encodedPayload = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = new TextEncoder().encode(TOKEN_PREFIX + encodedPayload);
  const sig = await crypto.subtle.sign('Ed25519', key, signingInput);
  return `v1.${encodedPayload}.${b64url(sig)}`;
}

async function getSettings(db) {
  const rows = await db.prepare('SELECT key, value FROM app_settings').all();
  const map = {};
  for (const r of rows.results || []) map[r.key] = r.value;
  return {
    paywallEnabled: map.paywall_enabled !== '0',
    offlineGraceHours: Math.max(0, Math.min(168, Number(map.offline_grace_hours || 48))),
  };
}

async function audit(db, action, targetId, detail) {
  await db
    .prepare('INSERT INTO audit_log (action, target_id, detail, created_at) VALUES (?, ?, ?, ?)')
    .bind(action, targetId || null, String(detail || '').slice(0, 500), Math.floor(Date.now() / 1000))
    .run();
}

async function handleEntitlementCheck(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'invalid-json' }, 400); }
  const rawPid = body?.profileId != null ? Number(body.profileId) : null;
  const profileId = Number.isSafeInteger(rawPid) && rawPid > 0 ? rawPid : null;
  const alias = typeof body?.alias === 'string' ? body.alias.trim().slice(0, 80) : '';
  const machineHash = typeof body?.machineHash === 'string' && /^[a-f0-9]{32,128}$/i.test(body.machineHash)
    ? body.machineHash.toLowerCase()
    : null;
  const appVersion = typeof body?.appVersion === 'string' ? body.appVersion.slice(0, 32) : null;
  if (!machineHash) {
    return json({ error: 'invalid-request' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const settings = await getSettings(env.DB);
  const deviceAccountId = `pc:${machineHash.slice(0, 16)}`;

  // Buscar cuenta por profile_id o por dispositivo; auto-registrar si es usuario nuevo
  let account = profileId
    ? await env.DB.prepare('SELECT * FROM accounts WHERE profile_id = ?').bind(profileId).first()
    : null;
  if (!account) {
    const byDevice = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(deviceAccountId).first();
    if (byDevice && profileId && !byDevice.profile_id) {
      // Actualizar el registro provisional de PC con el profileId real recién detectado
      const newId = `aoe2:${profileId}`;
      await env.DB.prepare(
        'UPDATE accounts SET id = ?, profile_id = ?, alias = CASE WHEN ? != \'\' THEN ? ELSE alias END, last_seen_at = ?, last_version = COALESCE(?, last_version), updated_at = ? WHERE id = ?'
      ).bind(newId, profileId, alias, alias, now, appVersion, now, deviceAccountId).run();
      await env.DB.prepare('UPDATE account_devices SET account_id = ? WHERE account_id = ?').bind(newId, deviceAccountId).run();
      account = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(newId).first();
    } else if (byDevice && !profileId) {
      account = byDevice;
    }
  }

  if (!account) {
    const newId = profileId ? `aoe2:${profileId}` : deviceAccountId;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO accounts (id, profile_id, alias, email, plan, enabled, expires_at, max_devices, notes, last_seen_at, last_version, created_at, updated_at)
       VALUES (?, ?, ?, '', 'free', 1, NULL, 2, 'Auto-registrado', ?, ?, ?, ?)`
    ).bind(newId, profileId, alias, now, appVersion, now, now).run();
    account = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(newId).first();
  } else {
    await env.DB.prepare(
      `UPDATE accounts SET
         alias = CASE WHEN ? != '' AND (alias = '' OR notes = 'Auto-registrado') THEN ? ELSE alias END,
         last_seen_at = ?,
         last_version = COALESCE(?, last_version)
       WHERE id = ?`
    ).bind(alias, alias, now, appVersion, account.id).run();
  }

  // Registrar dispositivo siempre para visibilidad real en la App Admin
  const devicesRes = await env.DB
    .prepare('SELECT machine_hash FROM account_devices WHERE account_id = ?')
    .bind(account.id)
    .all();
  const existing = (devicesRes.results || []).map((r) => r.machine_hash);
  const maxDevices = Math.max(1, Number(account.max_devices || 2));
  const overDeviceLimit = !existing.includes(machineHash) && existing.length >= maxDevices;
  if (!existing.includes(machineHash) && !overDeviceLimit) {
    await env.DB
      .prepare('INSERT OR IGNORE INTO account_devices (account_id, machine_hash, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)')
      .bind(account.id, machineHash, now, now)
      .run();
  } else if (existing.includes(machineHash)) {
    await env.DB
      .prepare('UPDATE account_devices SET last_seen_at = ? WHERE account_id = ? AND machine_hash = ?')
      .bind(now, account.id, machineHash)
      .run();
  }

  // KILL-SWITCH INDIVIDUAL: si el admin desactivó esta cuenta, se revoca SIEMPRE (incluso con paywall global apagado)
  if (account.enabled !== 1) {
    return json({ active: false, plan: 'free', revoked: true, reason: 'disabled-by-admin', accountId: account.id, paywallEnabled: settings.paywallEnabled, token: null });
  }

  // Si el paywall global está apagado, todos los habilitados reciben ProMax firmado temporal
  if (!settings.paywallEnabled) {
    const ttl = Math.max(300, Math.min(86400, Number(env.TOKEN_TTL_SECONDS || 86400)));
    const claims = {
      schema: 1,
      kid: env.KEY_ID || 'prod-2026-01',
      sub: account.id,
      aud: AUDIENCE,
      plan: 'promax',
      iat: now,
      exp: now + ttl,
    };
    if (profileId) claims.profileId = profileId;
    const token = await signEntitlement(claims, env);
    return json({ active: true, plan: 'promax', revoked: false, accountId: account.id, paywallEnabled: false, token, expiresAt: (now + ttl) * 1000 });
  }

  if (account.plan === 'free') {
    return json({ active: false, plan: 'free', revoked: false, reason: 'free-plan', accountId: account.id, paywallEnabled: true, token: null });
  }
  if (account.expires_at != null && Number(account.expires_at) <= now) {
    return json({ active: false, plan: 'free', revoked: true, reason: 'expired', accountId: account.id, paywallEnabled: true, token: null });
  }
  if (overDeviceLimit) {
    return json({ active: false, plan: 'free', revoked: true, reason: 'device-limit-exceeded', maxDevices, accountId: account.id, paywallEnabled: true, token: null });
  }

  const ttl = Math.max(300, Math.min(86400, Number(env.TOKEN_TTL_SECONDS || 86400)));
  const exp = account.expires_at != null ? Math.min(now + ttl, Number(account.expires_at)) : now + ttl;
  const claims = {
    schema: 1,
    kid: env.KEY_ID || 'prod-2026-01',
    sub: account.id,
    aud: AUDIENCE,
    plan: account.plan,
    iat: now,
    exp,
  };
  if (profileId) claims.profileId = profileId;
  const token = await signEntitlement(claims, env);

  return json({
    active: true,
    plan: account.plan,
    revoked: false,
    accountId: account.id,
    paywallEnabled: true,
    expiresAt: (account.expires_at ?? exp) * 1000,
    token,
  });
}

async function handleAdmin(request, env, url) {
  if (!(await requireAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const path = url.pathname;
  const method = request.method;
  const now = Math.floor(Date.now() / 1000);

  if (method === 'GET' && path === '/v1/admin/accounts') {
    const q = (url.searchParams.get('q') || '').trim();
    let stmt;
    if (q) {
      const like = `%${q}%`;
      stmt = env.DB.prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM account_devices d WHERE d.account_id = a.id) AS device_count
         FROM accounts a
         WHERE a.alias LIKE ? OR a.email LIKE ? OR CAST(a.profile_id AS TEXT) LIKE ? OR a.notes LIKE ?
         ORDER BY a.updated_at DESC LIMIT 200`
      ).bind(like, like, like, like);
    } else {
      stmt = env.DB.prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM account_devices d WHERE d.account_id = a.id) AS device_count
         FROM accounts a ORDER BY a.updated_at DESC LIMIT 200`
      );
    }
    const rows = (await stmt.all()).results || [];
    const settings = await getSettings(env.DB);
    const stats = {
      total: rows.length,
      activePaid: rows.filter((r) => r.enabled === 1 && r.plan !== 'free' && (!r.expires_at || r.expires_at > now)).length,
      pro: rows.filter((r) => r.enabled === 1 && r.plan === 'pro').length,
      promax: rows.filter((r) => r.enabled === 1 && r.plan === 'promax').length,
      disabled: rows.filter((r) => r.enabled === 0).length,
      seen24h: rows.filter((r) => r.last_seen_at && now - r.last_seen_at <= 86400).length,
    };
    return json({ accounts: rows, stats, settings });
  }

  if (method === 'POST' && path === '/v1/admin/accounts') {
    const body = await request.json();
    const profileId = Number(body?.profileId);
    const plan = VALID_PLANS.has(body?.plan) ? body.plan : 'pro';
    if (!Number.isSafeInteger(profileId) || profileId <= 0) return json({ error: 'invalid-profile-id' }, 400);
    const id = `aoe2:${profileId}`;
    const alias = String(body?.alias || '').trim().slice(0, 80);
    const email = String(body?.email || '').trim().slice(0, 120);
    const enabled = body?.enabled === false ? 0 : 1;
    const expiresAt = body?.expiresAt != null && Number.isFinite(Number(body.expiresAt))
      ? Math.floor(Number(body.expiresAt))
      : null;
    const maxDevices = Math.max(1, Math.min(10, Number(body?.maxDevices || 2)));
    const notes = String(body?.notes || '').trim().slice(0, 300);

    await env.DB.prepare(
      `INSERT INTO accounts (id, profile_id, alias, email, plan, enabled, expires_at, max_devices, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET
         alias = excluded.alias, email = excluded.email, plan = excluded.plan,
         enabled = excluded.enabled, expires_at = excluded.expires_at,
         max_devices = excluded.max_devices, notes = excluded.notes, updated_at = excluded.updated_at`
    ).bind(id, profileId, alias, email, plan, enabled, expiresAt, maxDevices, notes, now, now).run();

    await audit(env.DB, 'account.upsert', id, `plan=${plan} enabled=${enabled} alias=${alias}`);
    const saved = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
    return json({ account: saved }, 201);
  }

  const patchMatch = /^\/v1\/admin\/accounts\/([^/]+)$/.exec(path);
  if (patchMatch && method === 'PATCH') {
    const id = decodeURIComponent(patchMatch[1]);
    const existing = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'not-found' }, 404);
    const body = await request.json();
    const plan = body.plan !== undefined ? (VALID_PLANS.has(body.plan) ? body.plan : existing.plan) : existing.plan;
    const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled;
    const alias = body.alias !== undefined ? String(body.alias).trim().slice(0, 80) : existing.alias;
    const email = body.email !== undefined ? String(body.email).trim().slice(0, 120) : existing.email;
    const notes = body.notes !== undefined ? String(body.notes).trim().slice(0, 300) : existing.notes;
    const maxDevices = body.maxDevices !== undefined ? Math.max(1, Math.min(10, Number(body.maxDevices) || 2)) : existing.max_devices;
    const expiresAt = body.expiresAt === null
      ? null
      : (body.expiresAt !== undefined && Number.isFinite(Number(body.expiresAt)) ? Math.floor(Number(body.expiresAt)) : existing.expires_at);

    await env.DB.prepare(
      `UPDATE accounts SET alias = ?, email = ?, plan = ?, enabled = ?, expires_at = ?, max_devices = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    ).bind(alias, email, plan, enabled, expiresAt, maxDevices, notes, now, id).run();

    if (body.resetDevices === true) {
      await env.DB.prepare('DELETE FROM account_devices WHERE account_id = ?').bind(id).run();
    }
    await audit(env.DB, 'account.update', id, `plan=${plan} enabled=${enabled}${body.resetDevices ? ' resetDevices=1' : ''}`);
    const updated = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
    return json({ account: updated });
  }

  if (patchMatch && method === 'DELETE') {
    const id = decodeURIComponent(patchMatch[1]);
    await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
    await audit(env.DB, 'account.delete', id, 'deleted');
    return json({ deleted: true, id });
  }

  if (method === 'POST' && path === '/v1/admin/settings') {
    const body = await request.json();
    if (typeof body?.paywallEnabled === 'boolean') {
      await env.DB.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
        .bind('paywall_enabled', body.paywallEnabled ? '1' : '0', now).run();
      await audit(env.DB, 'settings.paywall', 'global', `paywallEnabled=${body.paywallEnabled}`);
    }
    if (body?.offlineGraceHours != null && Number.isFinite(Number(body.offlineGraceHours))) {
      const hrs = Math.max(0, Math.min(168, Math.round(Number(body.offlineGraceHours))));
      await env.DB.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
        .bind('offline_grace_hours', String(hrs), now).run();
      await audit(env.DB, 'settings.grace', 'global', `offlineGraceHours=${hrs}`);
    }
    return json({ settings: await getSettings(env.DB) });
  }

  if (method === 'GET' && path === '/v1/admin/audit') {
    const rows = await env.DB.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 80').all();
    return json({ entries: rows.results || [] });
  }

  return json({ error: 'not-found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      return json({ ok: true, kid: env.KEY_ID || 'prod-2026-01', ts: Date.now() });
    }
    if (request.method === 'POST' && url.pathname === '/v1/entitlement/check') {
      return handleEntitlementCheck(request, env);
    }
    if (url.pathname.startsWith('/v1/admin/')) {
      return handleAdmin(request, env, url);
    }
    return json({ error: 'not-found' }, 404);
  },
};
