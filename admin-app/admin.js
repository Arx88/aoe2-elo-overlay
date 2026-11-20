'use strict';

const $ = (id) => document.getElementById(id);
let demoMode = false;
let accounts = [];
let settings = { paywallEnabled: true };

const demoAccounts = [
  { id: 'aoe2:25399083', profile_id: 25399083, alias: 'PSX | Acido', email: 'acido@aoe2helper.gg', plan: 'promax', enabled: 1, expires_at: null, max_devices: 3, device_count: 1, last_seen_at: Math.floor(Date.now() / 1000) - 600, last_version: '2.4.0', notes: 'Cuenta fundador' },
  { id: 'aoe2:10492811', profile_id: 10492811, alias: 'ViperFan99', email: 'fan@example.com', plan: 'pro', enabled: 1, expires_at: Math.floor(Date.now() / 1000) + 86400 * 24, max_devices: 2, device_count: 1, last_seen_at: Math.floor(Date.now() / 1000) - 7200, last_version: '2.4.0', notes: 'Plan mensual' },
  { id: 'aoe2:8841203', profile_id: 8841203, alias: 'FastCastleMX', email: 'fc@example.com', plan: 'promax', enabled: 0, expires_at: Math.floor(Date.now() / 1000) - 86400 * 2, max_devices: 2, device_count: 2, last_seen_at: Math.floor(Date.now() / 1000) - 180000, last_version: '2.3.1', notes: 'Desactivada manualmente' },
];
const demoAudit = [
  { created_at: Math.floor(Date.now() / 1000) - 3600, action: 'account.update', target_id: 'aoe2:8841203', detail: 'plan=promax enabled=0' },
  { created_at: Math.floor(Date.now() / 1000) - 14400, action: 'account.upsert', target_id: 'aoe2:10492811', detail: 'plan=pro enabled=1 alias=ViperFan99' },
];

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => { t.hidden = true; }, 3200);
}

function fmtDate(sec) {
  if (!sec) return 'Permanente';
  return new Date(sec * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtAgo(sec) {
  if (!sec) return 'Nunca';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function renderAccounts() {
  const q = $('searchInput').value.trim().toLowerCase();
  const planFilter = $('filterPlan').value;
  const now = Math.floor(Date.now() / 1000);

  const filtered = accounts.filter((a) => {
    if (planFilter === 'disabled' && a.enabled !== 0) return false;
    if (['free', 'pro', 'promax'].includes(planFilter) && a.plan !== planFilter) return false;
    if (!q) return true;
    return [a.alias, a.email, String(a.profile_id), a.notes].some((v) => String(v || '').toLowerCase().includes(q));
  });

  $('kpiTotal').textContent = String(accounts.length);
  $('kpiPaid').textContent = String(accounts.filter((a) => a.enabled === 1 && a.plan !== 'free' && (!a.expires_at || a.expires_at > now)).length);
  $('kpiPromax').textContent = String(accounts.filter((a) => a.enabled === 1 && a.plan === 'promax').length);
  $('kpiDisabled').textContent = String(accounts.filter((a) => a.enabled === 0).length);
  $('kpiSeen').textContent = String(accounts.filter((a) => a.last_seen_at && now - a.last_seen_at <= 86400).length);
  $('paywallToggle').checked = settings.paywallEnabled !== false;
  $('paywallHint').textContent = settings.paywallEnabled !== false ? 'Cobro activo para usuarios' : 'Modo abierto (todo ProMax)';

  const body = $('accountsBody');
  body.innerHTML = '';
  if (!filtered.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Sin cuentas que coincidan.';
    td.style.color = '#9aa4ad';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  for (const a of filtered) {
    const tr = document.createElement('tr');
    const isOn = a.enabled === 1;
    if (!isOn) tr.className = 'is-off';
    const subBits = [a.profile_id ? `#${a.profile_id}` : a.id];
    if (a.notes) subBits.push(a.notes);
    else if (a.email) subBits.push(a.email);

    tr.innerHTML = `
      <td class="player-cell">
        <b></b>
        <small></small>
      </td>
      <td>
        <select class="plan-select is-${a.plan}" aria-label="Plan">
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="promax">ProMax</option>
        </select>
      </td>
      <td>
        <span class="access-cell">
          <label class="sw-wrap sm" title="Activar o desactivar acceso">
            <input class="toggle-inp" type="checkbox" ${isOn ? 'checked' : ''} />
            <span class="sw"></span>
          </label>
          <span class="state-txt ${isOn ? 'on' : 'off'}">${isOn ? 'Activa' : 'Pausada'}</span>
        </span>
      </td>
      <td>${fmtDate(a.expires_at)}</td>
      <td class="meta-mono">${a.device_count || 0}/${a.max_devices || 2}</td>
      <td>${fmtAgo(a.last_seen_at)}${a.last_version ? `<span class="meta-sub mono">v${a.last_version}</span>` : ''}</td>
      <td>
        <span class="row-actions">
          <button class="icon-btn reset-btn" type="button" title="Liberar dispositivos vinculados">Reset</button>
          <button class="icon-btn danger del-btn" type="button" title="Eliminar cuenta" aria-label="Eliminar cuenta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>
          </button>
        </span>
      </td>
    `;
    tr.querySelector('b').textContent = a.alias || `Perfil ${a.profile_id}`;
    const subEl = tr.querySelector('small');
    subEl.textContent = subBits.join(' · ');
    if (a.email) subEl.title = `${a.email}${a.notes ? ` · ${a.notes}` : ''}`;

    const sel = tr.querySelector('.plan-select');
    sel.value = a.plan;
    sel.addEventListener('change', () => {
      sel.className = `plan-select is-${sel.value}`;
      patchAccount(a.id, { plan: sel.value });
    });
    tr.querySelector('.toggle-inp').addEventListener('change', (e) => patchAccount(a.id, { enabled: e.target.checked }));
    tr.querySelector('.reset-btn').addEventListener('click', () => patchAccount(a.id, { resetDevices: true }));
    tr.querySelector('.del-btn').addEventListener('click', () => deleteAccount(a.id));
    body.appendChild(tr);
  }
}

async function loadAccounts() {
  if (demoMode) {
    accounts = demoAccounts;
    renderAccounts();
    return;
  }
  try {
    const res = await window.AdminAPI.listAccounts('');
    accounts = res.accounts || [];
    settings = res.settings || settings;
    renderAccounts();
    $('connPill').textContent = 'Conectado · Cloudflare D1';
    $('connPill').className = 'conn-pill ok';
  } catch (err) {
    $('connPill').textContent = 'Sin conexión';
    $('connPill').className = 'conn-pill';
    toast(err.message || 'No se pudo conectar al Worker.');
  }
}

async function patchAccount(id, patch) {
  if (demoMode) {
    const item = demoAccounts.find((a) => a.id === id);
    if (item) {
      if (patch.plan) item.plan = patch.plan;
      if (patch.enabled !== undefined) item.enabled = patch.enabled ? 1 : 0;
      if (patch.resetDevices) item.device_count = 0;
      demoAudit.unshift({ created_at: Math.floor(Date.now() / 1000), action: 'account.update', target_id: id, detail: JSON.stringify(patch) });
    }
    renderAccounts();
    toast('Cuenta actualizada (modo demo).');
    return;
  }
  try {
    await window.AdminAPI.patchAccount(id, patch);
    toast('Cambio aplicado en tiempo real.');
    await loadAccounts();
  } catch (err) {
    toast(err.message);
  }
}

async function deleteAccount(id) {
  if (demoMode) {
    const idx = demoAccounts.findIndex((a) => a.id === id);
    if (idx >= 0) demoAccounts.splice(idx, 1);
    renderAccounts();
    toast('Cuenta eliminada (modo demo).');
    return;
  }
  try {
    await window.AdminAPI.deleteAccount(id);
    toast('Cuenta eliminada.');
    await loadAccounts();
  } catch (err) {
    toast(err.message);
  }
}

async function loadAudit() {
  const entries = demoMode ? demoAudit : ((await window.AdminAPI.audit().catch(() => ({ entries: [] }))).entries || []);
  const body = $('auditBody');
  body.innerHTML = '';
  for (const e of entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td><code></code></td><td></td><td></td>`;
    tr.children[0].textContent = new Date(e.created_at * 1000).toLocaleString('es-ES');
    tr.children[1].querySelector('code').textContent = e.action;
    tr.children[2].textContent = e.target_id || '—';
    tr.children[3].textContent = e.detail || '';
    body.appendChild(tr);
  }
}

function wireUi() {
  $('winMin').onclick = () => window.AdminAPI.minimize();
  $('winMax').onclick = () => window.AdminAPI.maximize();
  $('winClose').onclick = () => window.AdminAPI.close();

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.dataset.tab === tab));
      if (tab === 'audit') loadAudit();
    });
  });

  $('searchInput').addEventListener('input', renderAccounts);
  $('filterPlan').addEventListener('change', renderAccounts);
  $('refreshBtn').onclick = () => loadAccounts();
  $('refreshAuditBtn').onclick = () => loadAudit();

  $('paywallToggle').addEventListener('change', async () => {
    const enabled = $('paywallToggle').checked;
    if (demoMode) {
      settings.paywallEnabled = enabled;
      renderAccounts();
      toast(enabled ? 'Paywall global activado (demo).' : 'Paywall global desactivado (demo).');
      return;
    }
    try {
      const res = await window.AdminAPI.updateSettings({ paywallEnabled: enabled });
      settings = res.settings || { paywallEnabled: enabled };
      renderAccounts();
      toast(enabled ? 'Control de cuentas de pago ACTIVADO.' : 'Modo abierto ACTIVADO (sin cobro).');
    } catch (err) {
      toast(err.message);
      $('paywallToggle').checked = !enabled;
    }
  });

  const openModal = () => { $('modalBackdrop').hidden = false; $('fProfileId').focus(); };
  const closeModal = () => { $('modalBackdrop').hidden = true; $('accountForm').reset(); };
  $('newAccountBtn').onclick = openModal;
  $('modalClose').onclick = closeModal;
  $('modalCancel').onclick = closeModal;

  $('accountForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const days = Number($('fDuration').value);
    const expiresAt = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : null;
    const payload = {
      profileId: Number($('fProfileId').value),
      alias: $('fAlias').value.trim(),
      email: $('fEmail').value.trim(),
      plan: $('fPlan').value,
      expiresAt,
      maxDevices: Number($('fMaxDevices').value) || 2,
      notes: $('fNotes').value.trim(),
      enabled: $('fEnabled').checked,
    };
    if (demoMode) {
      const id = `aoe2:${payload.profileId}`;
      const idx = demoAccounts.findIndex((a) => a.id === id);
      const row = { id, profile_id: payload.profileId, alias: payload.alias, email: payload.email, plan: payload.plan, enabled: payload.enabled ? 1 : 0, expires_at: expiresAt, max_devices: payload.maxDevices, device_count: 0, last_seen_at: null, notes: payload.notes };
      if (idx >= 0) demoAccounts[idx] = row; else demoAccounts.unshift(row);
      closeModal();
      renderAccounts();
      toast('Cuenta guardada (modo demo).');
      return;
    }
    try {
      await window.AdminAPI.upsertAccount(payload);
      closeModal();
      toast('Cuenta guardada en Cloudflare D1.');
      await loadAccounts();
    } catch (err) {
      toast(err.message);
    }
  });

  $('saveConnBtn').onclick = async () => {
    demoMode = $('demoToggle').checked;
    await window.AdminAPI.saveVault({
      apiUrl: $('apiUrlInput').value.trim(),
      secret: $('secretInput').value.trim(),
      demoMode,
    });
    $('secretInput').value = '';
    $('connStatus').textContent = demoMode ? 'Modo demo activado.' : 'Credenciales guardadas cifradas.';
    if (demoMode) {
      $('connPill').textContent = 'Modo demo local';
      $('connPill').className = 'conn-pill demo';
    }
    await loadAccounts();
  };

  $('testConnBtn').onclick = async () => {
    try {
      const h = await window.AdminAPI.health();
      $('connStatus').textContent = `Worker online · kid=${h.kid || 'ok'}`;
    } catch (err) {
      $('connStatus').textContent = `Error: ${err.message}`;
    }
  };
}

async function init() {
  wireUi();
  const vault = await window.AdminAPI.getVault();
  $('apiUrlInput').value = vault.apiUrl || '';
  $('demoToggle').checked = Boolean(vault.demoMode || !vault.apiUrl);
  demoMode = $('demoToggle').checked;
  if (demoMode) {
    $('connPill').textContent = 'Modo demo local';
    $('connPill').className = 'conn-pill demo';
  }
  await loadAccounts();
}

init();
