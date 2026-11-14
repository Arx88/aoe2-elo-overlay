'use strict';

// El diseño llega por query (?theme=) para aplicarlo antes del primer paint.
const initialTheme = new URLSearchParams(location.search).get('theme') || 'clasico';
document.body.dataset.theme = initialTheme;

const el = (id) => document.getElementById(id);

const currentName = el('currentName');
const currentId = el('currentId');
const currentOrigin = el('currentOrigin');
const searchInput = el('search');
const resultsEl = el('results');
const accountAvatar = el('accountAvatar');
const searchStateEl = el('searchState');
const searchHelpEl = el('searchHelp');
const manualBtn = el('manualBtn');
const autoBtn = el('autoBtn');
const statusEl = el('status');
const versionEl = el('version');
const opacityInput = el('opacity');
const opacityValue = el('opacityValue');
const diagProfile = el('diagProfile');
const diagPoll = el('diagPoll');
const diagMatch = el('diagMatch');
const logBtn = el('logBtn');
const moveBtn = el('moveBtn');
const positionInfo = el('positionInfo');
const positionLabel = el('positionLabel');
const civHelpInput = el('civHelp');
const autoUpdateInput = el('autoUpdate');
const hideEloInput = el('hideEloAt20');
const hideAtInput = el('hideAtSeconds');
const hideAtValue = el('hideAtSecondsValue');
const enterWindowLabel = el('enterWindowLabel');
const civHelpDesc = el('civHelpDesc');
const hideEloName = el('hideEloName');
const hideEloDesc = el('hideEloDesc');
const civHelpTip = el('civHelpTip');
const civHelpTipTime = el('civHelpTipTime');
const civHelpTipNo = el('civHelpTipNo');
const civHelpTipYes = el('civHelpTipYes');
const matchClock = el('matchClock');
const rivalInputs = {
  rivalCivs: el('rivalCivs'),
  rivalFavorites: el('rivalFavorites'),
  rivalOpenings: el('rivalOpenings'),
  smartTips: el('smartTips'),
  rivalH2H: el('rivalH2H'),
  civRecommender: el('civRecommender'),
};
const RIVAL_LABELS = {
  rivalCivs: 'Últimas 5 civs del rival',
  rivalFavorites: 'Civ y mapa más usados',
  rivalOpenings: 'Aperturas reales',
  smartTips: 'Recomendaciones inteligentes',
  rivalH2H: 'Enfrentamientos previos',
  civRecommender: 'Civ recomendada',
};
const tgBalanceInput = el('tgBalance');
// "Resumen con F2": vista resumida del scouting con su atajo. Apagada de
// fábrica: sin permiso explícito no se captura una tecla global y el
// informe se ve completo.
const scoutF2Input = el('scoutF2');
const postMatchInput = el('postMatch');
const postMatchComparisonInput = el('postMatchComparison');
const postMatchReplayInput = el('postMatchReplay');
const postMatchReportEl = el('postMatchReport');
const refreshPostMatchBtn = el('refreshPostMatch');
const railPlanLabel = el('railPlanLabel');
const planName = el('planName');
const planDescription = el('planDescription');
const planExpiry = el('planExpiry');
const freeFeatures = el('freeFeatures');
const proFeatures = el('proFeatures');
const commerceTitle = el('commerceTitle');
const commerceStatus = el('commerceStatus');
const accountCommerce = el('accountCommerce');
const checkoutCommerce = el('checkoutCommerce');
const accessKeyForm = el('accessKeyForm');
const accessKeyInput = el('accessKey');
const accessKeyStatus = el('accessKeyStatus');
const activateAccessKeyBtn = el('activateAccessKey');
const licenseForm = el('licenseForm');
const licenseAccount = el('licenseAccount');
const licenseToken = el('licenseToken');
const licenseStatus = el('licenseStatus');
const activateLicenseBtn = el('activateLicense');
const pageIndex = el('pageIndex');
const themeButtons = [...document.querySelectorAll('.theme')];
const navButtons = [...document.querySelectorAll('.nav-item')];
const pageSections = [...document.querySelectorAll('.page')];
const pagesEl = document.querySelector('.pages');
const pageTitle = el('pageTitle');
const pageSub = el('pageSub');
const winMin = el('winMin');
const winMax = el('winMax');
const winClose = el('winClose');

let results = [];
let activeIndex = -1;
let searchTimer = null;
let searchToken = 0;
let currentTheme = initialTheme;
let opacityTimer = null;
let hideAtTimer = null;
let lastDiag = null;
let moving = false;
let positionCustom = false;
let matchStartedAt = null;
let currentProfileId = null;
let currentProduct = null;
let postMatchAccess = { comparison: false, replay: false };
let postMatchBusy = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function paintThemes() {
  for (const button of themeButtons) {
    button.classList.toggle('active', button.dataset.theme === currentTheme);
  }
}

function applyTheme(theme) {
  currentTheme = theme || 'clasico';
  document.body.dataset.theme = currentTheme;
  paintThemes();
}

function clockShort(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function paintHideAt(seconds) {
  const value = Math.min(60, Math.max(10, Math.round(Number(seconds) || 20)));
  hideAtInput.value = String(value);
  hideAtValue.textContent = clockShort(value);
  hideAtInput.style.setProperty('--fill', `${((value - 10) / 50) * 100}%`);
  enterWindowLabel.textContent = `Al entrar · 0:01 – ${clockShort(value)}`;
  civHelpDesc.textContent =
    `Escudos de ambas civs y resumen de bonos, unidades y debilidades · 0:01 – ${clockShort(value)}`;
  hideEloName.textContent = `Ocultar ELO a ${clockShort(value)}`;
  hideEloDesc.textContent = `Se oculta a ${clockShort(value)} para no molestar · vuelve al terminar`;
}

function paintOpacity(value) {
  const percent = Math.round(value * 100);
  opacityValue.textContent = `${percent}%`;
  opacityInput.style.setProperty('--fill', `${percent}%`);
}

/* ---------- plan y postmatch ---------- */
function renderFeatureList(target, features) {
  if (!target) return;
  target.replaceChildren();
  for (const feature of features) {
    const item = document.createElement('li');
    if (!feature.allowed) item.classList.add('locked');
    const name = document.createElement('b');
    name.textContent = feature.title;
    const description = document.createElement('span');
    description.className = 'feature-desc';
    description.textContent = feature.description;
    item.append(name, description);
    target.append(item);
  }
}

function renderProduct(product) {
  if (!product) return;
  currentProduct = product;
  const features = Array.isArray(product.features) ? product.features : [];
  const proAccess = Boolean(product.featureAccess && product.featureAccess.postMatchComparison);
  const replayAccess = Boolean(product.featureAccess && product.featureAccess.postMatchReplay);

  railPlanLabel.textContent = product.label || 'Free';
  planName.textContent = product.label || 'Free';
  if (product.plan === 'pro' && product.accessSource === 'access-key') {
    planDescription.textContent = 'Acceso Pro temporal por clave. No es una suscripción verificada.';
  } else if (product.plan === 'pro') {
    planDescription.textContent = 'Suscripción verificada. Incluye las funciones de análisis avanzado.';
  } else if (product.plan === 'beta') {
    planDescription.textContent = 'Acceso beta explícito de esta versión. No es una suscripción activa.';
  } else {
    planDescription.textContent = 'Las funciones esenciales para conocer la partida y a sus jugadores.';
  }
  if (product.subscriptionVerified && product.entitlement && product.entitlement.expiresAt) {
    const expires = new Date(product.entitlement.expiresAt);
    planExpiry.textContent = `Vence el ${expires.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  } else if (product.plan === 'pro' && product.accessSource === 'access-key') {
    planExpiry.textContent = 'Acceso por clave · sin suscripción';
  } else if (product.plan === 'beta') {
    planExpiry.textContent = 'Acceso beta · sin suscripción verificada';
  } else {
    planExpiry.textContent = 'Sin suscripción verificada';
  }

  renderFeatureList(freeFeatures, features.filter((feature) => feature.plan === 'free'));
  renderFeatureList(proFeatures, features.filter((feature) => feature.plan === 'pro'));

  postMatchInput.disabled = false;
  postMatchComparisonInput.disabled = !proAccess;
  postMatchReplayInput.disabled = !replayAccess;
  postMatchComparisonInput.title = proAccess ? '' : 'Disponible con Pro.';
  postMatchReplayInput.title = replayAccess ? '' : 'Disponible con Pro.';

  const commerce = product.commerce || {};
  commerceStatus.textContent = commerce.message || 'La contratación todavía no está habilitada.';
  commerceTitle.textContent = 'Suscripciones';
  accountCommerce.disabled = !(commerce.account && commerce.account.enabled);
  checkoutCommerce.disabled = !(commerce.checkout && commerce.checkout.enabled);
}

const EMPTY_POSTMATCH = '<div class="empty-report"><svg aria-hidden="true"><use href="#ic-chart" /></svg><h3>Tu próxima partida marca el comienzo.</h3><p>Al terminar, el informe aparecerá acá y en el overlay.</p></div>';

function paintPostMatch(payload) {
  const report = payload && payload.report ? payload.report : payload;
  if (payload && payload.access) postMatchAccess = payload.access;
  if (payload && payload.product) renderProduct(payload.product);
  if (!postMatchReportEl) return;
  if (!report) {
    postMatchReportEl.innerHTML = EMPTY_POSTMATCH;
    return;
  }
  if (typeof TacticalUI !== 'object') {
    postMatchReportEl.textContent = 'No se pudo dibujar el informe.';
    return;
  }
  postMatchReportEl.innerHTML = TacticalUI.renderPostMatch(report, postMatchAccess);
}

async function loadPostMatch() {
  try {
    paintPostMatch(await window.settings.postmatchGet());
  } catch {
    postMatchReportEl.innerHTML = EMPTY_POSTMATCH;
  }
}

/* ---------- diseño ---------- */
for (const button of themeButtons) {
  button.addEventListener('click', async () => {
    applyTheme(button.dataset.theme);
    const response = await window.settings.theme(button.dataset.theme);
    if (!response.ok) {
      setStatus(response.error || 'No se pudo cambiar el diseño', true);
      return;
    }
    setStatus(`Diseño: ${button.querySelector('.tname').textContent}`);
  });
}

/* ---------- opacidad ---------- */
opacityInput.addEventListener('input', () => {
  const value = Number(opacityInput.value) / 100;
  paintOpacity(value);
  clearTimeout(opacityTimer);
  opacityTimer = setTimeout(async () => {
    const response = await window.settings.opacity(value);
    if (!response.ok) {
      setStatus(response.error || 'No se pudo aplicar la opacidad', true);
      return;
    }
    setStatus(`Opacidad: ${Math.round(response.opacity * 100)}%`);
  }, 120);
});

/* ---------- estado / diagnóstico ---------- */
function paintPoll() {
  if (!lastDiag || !lastDiag.lastPollAt) {
    diagPoll.textContent = 'esperando la primera consulta…';
    return;
  }
  const secs = Math.max(0, Math.round((Date.now() - lastDiag.lastPollAt) / 1000));
  const labels = {
    ongoing: 'en partida',
    idle: 'sin partida',
    error: 'error de red',
    'no-profile': 'sin cuenta',
  };
  diagPoll.textContent = `hace ${secs}s · ${labels[lastDiag.lastPollStatus] || lastDiag.lastPollStatus}`;
}

function renderDiag(diagnostics) {
  lastDiag = diagnostics;
  diagProfile.textContent = diagnostics.profileId
    ? `${diagnostics.alias || 'perfil'} (#${diagnostics.profileId})`
    : 'sin cuenta';
  diagMatch.textContent = diagnostics.lastMatch || '—';
  paintPoll();
}

function clockText(startedAt) {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function paintClock() {
  matchClock.textContent = clockText(matchStartedAt);
}

window.settings.onClock((payload) => {
  if (payload && typeof payload === 'object') {
    matchStartedAt = Number.isFinite(payload.startedAt) && payload.startedAt > 0
      ? payload.startedAt
      : null;
  } else {
    matchStartedAt = Number.isFinite(payload) && payload > 0 ? payload : null;
  }
  paintClock();
});

setInterval(() => {
  paintPoll();
  paintClock();
}, 1000);

logBtn.addEventListener('click', () => window.settings.openLog());

/* ---------- barra de ventana propia ---------- */
winMin.addEventListener('click', () => window.settings.minimize());
winMax.addEventListener('click', () => window.settings.toggleMaximize());
winClose.addEventListener('click', () => window.settings.close());
window.settings.onMaximized((on) => document.body.classList.toggle('maximized', Boolean(on)));

/* ---------- opciones ---------- */
async function applyToggle(input, invoke, label) {
  const wanted = input.checked;
  const response = await invoke(wanted);
  if (!response || !response.ok) {
    input.checked = !wanted;
    setStatus((response && response.error) || `No se pudo cambiar ${label}`, true);
    return;
  }
  setStatus(`${label}: ${wanted ? 'activado' : 'desactivado'}`);
}

/* Aviso al activar la Ayuda de civ: si el tiempo actual es corto, ofrecer
   dejarla visible hasta 0:40 para poder leerla antes de que se vaya. */
function openCivHelpTip() {
  const current = Math.min(60, Math.max(10, Math.round(Number(hideAtInput.value) || 20)));
  if (current >= 40) {
    setStatus(`Ayuda de civ: activada · visible hasta ${clockShort(current)}`);
    return;
  }
  civHelpTipTime.textContent = clockShort(current);
  civHelpTip.hidden = false;
  civHelpTipYes.focus();
}

function closeCivHelpTip() {
  civHelpTip.hidden = true;
}

civHelpInput.addEventListener('change', async () => {
  const wanted = civHelpInput.checked;
  await applyToggle(civHelpInput, (on) => window.settings.civHelp(on), 'Ayuda de civ');
  if (wanted && civHelpInput.checked) openCivHelpTip();
});

civHelpTipNo.addEventListener('click', () => {
  closeCivHelpTip();
  setStatus(`Ayuda de civ: se oculta a los ${clockShort(hideAtInput.value)}`);
});

civHelpTipYes.addEventListener('click', async () => {
  closeCivHelpTip();
  const response = await window.settings.hideAtSeconds(40);
  if (!response || !response.ok) {
    setStatus((response && response.error) || 'No se pudo cambiar el tiempo', true);
    return;
  }
  paintHideAt(response.hideAtSeconds);
  setStatus('Ayuda de civ: visible hasta 0:40');
});
hideEloInput.addEventListener('change', () =>
  applyToggle(hideEloInput, (on) => window.settings.hideEloAt20(on), 'Ocultar ELO'),
);

hideAtInput.addEventListener('input', () => {
  const value = Number(hideAtInput.value);
  paintHideAt(value);
  clearTimeout(hideAtTimer);
  hideAtTimer = setTimeout(async () => {
    const response = await window.settings.hideAtSeconds(value);
    if (!response || !response.ok) {
      setStatus((response && response.error) || 'No se pudo guardar el tiempo', true);
      return;
    }
    paintHideAt(response.hideAtSeconds);
    setStatus(`Ocultar ELO y ayuda a los ${clockShort(response.hideAtSeconds)}`);
  }, 120);
});

for (const [key, input] of Object.entries(rivalInputs)) {
  input.addEventListener('change', () =>
    applyToggle(input, (on) => window.settings.rivalOption(key, on), RIVAL_LABELS[key]),
  );
}

// Balance de equipos: dato de pintado del panel, sin consulta de red.
tgBalanceInput.addEventListener('change', () =>
  applyToggle(tgBalanceInput, (on) => window.settings.tgBalance(on), 'Balance de equipos'),
);

// Resumen con F2: el atajo y la vista compacta son opt-in. Al apagarlo se
// libera la tecla (deja de ser global) y el panel vuelve al informe completo.
scoutF2Input.addEventListener('change', () =>
  applyToggle(scoutF2Input, (on) => window.settings.scoutF2(on), 'Resumen con F2'),
);

// Postmatch: resultado Free; comparación y replay se validan en main.
for (const [key, input, label] of [
  ['postMatch', postMatchInput, 'Resumen postmatch'],
  ['postMatchComparison', postMatchComparisonInput, 'Comparar mi evolución'],
  ['postMatchReplay', postMatchReplayInput, 'Calificación por etapa y APM'],
]) {
  input.addEventListener('change', () =>
    applyToggle(input, (on) => window.settings.postMatchOption(key, on), label),
  );
}

refreshPostMatchBtn.addEventListener('click', async () => {
  if (postMatchBusy) return;
  postMatchBusy = true;
  refreshPostMatchBtn.disabled = true;
  try {
    const response = await window.settings.postmatchRefresh();
    if (!response.ok) {
      setStatus(response.error || 'No se pudo actualizar el informe', true);
      return;
    }
    paintPostMatch(response);
    setStatus('Informe postmatch actualizado.');
  } finally {
    postMatchBusy = false;
    refreshPostMatchBtn.disabled = false;
  }
});

window.settings.onPostMatch((payload) => paintPostMatch(payload));

accountCommerce.addEventListener('click', async () => {
  const response = await window.settings.openCommerce('account');
  if (!response.ok) setStatus(response.error || 'No se pudo abrir la gestión de cuenta', true);
});

checkoutCommerce.addEventListener('click', async () => {
  const response = await window.settings.openCommerce('checkout');
  if (!response.ok) setStatus(response.error || 'No se pudo abrir la contratación', true);
});

accessKeyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  activateAccessKeyBtn.disabled = true;
  accessKeyStatus.textContent = 'Verificando clave…';
  accessKeyStatus.classList.remove('error');
  try {
    const response = await window.settings.activateAccessKey(accessKeyInput.value);
    if (!response.ok) {
      accessKeyStatus.textContent = response.error || 'No se pudo activar la clave.';
      accessKeyStatus.classList.add('error');
      if (response.product) renderProduct(response.product);
      return;
    }
    accessKeyInput.value = '';
    accessKeyStatus.textContent = 'Pro activado. Ya podés prender las opciones Pro en Ajustes.';
    if (response.product) renderProduct(response.product);
    await loadCurrent();
  } finally {
    activateAccessKeyBtn.disabled = false;
  }
});

licenseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  activateLicenseBtn.disabled = true;
  licenseStatus.textContent = 'Verificando credencial…';
  licenseStatus.classList.remove('error');
  try {
    const response = await window.settings.activateLicense(licenseAccount.value, licenseToken.value);
    if (!response.ok) {
      licenseStatus.textContent = response.error || 'No se pudo verificar la credencial.';
      licenseStatus.classList.add('error');
      if (response.product) renderProduct(response.product);
      return;
    }
    licenseToken.value = '';
    licenseStatus.textContent = 'Acceso Pro verificado.';
    if (response.product) renderProduct(response.product);
    await loadCurrent();
  } finally {
    activateLicenseBtn.disabled = false;
  }
});

// Pestaña Updater: consulta cada 30 min y aplica sola lo que encuentra.
autoUpdateInput.addEventListener('change', () =>
  applyToggle(
    autoUpdateInput,
    (on) => window.settings.autoUpdate(on),
    'Actualizaciones automáticas',
  ),
);

/* ---------- posición ---------- */
function paintPosition(info) {
  positionCustom = info.position === 'custom' && Number.isFinite(Number(info.x));
  positionLabel.textContent = positionCustom ? 'Posición personalizada' : 'Arriba al centro';
  positionInfo.textContent = positionCustom
    ? `Fija en ${Math.round(info.x)}, ${Math.round(info.y)} de la pantalla.`
    : 'El panel aparece arriba al centro.';
  moving = Boolean(info.moving);
  paintMoveButton();
}

function paintMoveButton() {
  moveBtn.textContent = moving ? 'Listo' : 'Mover';
  moveBtn.classList.toggle('active', moving);
}

async function setMoving(on) {
  const response = await window.settings.move(on);
  moving = Boolean(response.moving);
  paintMoveButton();
  if (moving) {
    positionLabel.textContent = 'Mové el panel';
    setStatus('Arrastrá el panel a donde quieras y tocá "Listo" (o Esc).');
    return;
  }
  setStatus('Posición guardada: el panel queda ahí y no vuelve a moverse.');
  await loadCurrent();
}

moveBtn.addEventListener('click', () => setMoving(!moving));

/* ---------- cuenta ---------- */
async function loadCurrent() {
  const info = await window.settings.get();
  if (info.version) versionEl.textContent = `v${info.version}`;

  applyTheme(info.theme || currentTheme);
  paintOpacity(Number(info.opacity) || 0.95);
  renderDiag(info.diagnostics || {});
  paintPosition(info);
  civHelpInput.checked = Boolean(info.civHelp);
  hideEloInput.checked = Boolean(info.hideEloAt20);
  paintHideAt(Number(info.hideAtSeconds) || 20);
  for (const [key, input] of Object.entries(rivalInputs)) input.checked = Boolean(info[key]);
  scoutF2Input.checked = Boolean(info.scoutF2);
  tgBalanceInput.checked = Boolean(info.tgBalance);
  postMatchInput.checked = info.postMatch !== false;
  postMatchComparisonInput.checked = Boolean(info.postMatchComparison);
  postMatchReplayInput.checked = Boolean(info.postMatchReplay);
  if (typeof TacticalUI === 'object' && TacticalUI.configure) {
    TacticalUI.configure({ slugs: info.shields, aliases: info.civAliases });
  }
  if (info.product) renderProduct(info.product);
  await loadPostMatch();
  autoUpdateInput.checked = Boolean(info.autoUpdate);
  matchStartedAt = Number.isFinite(info.matchStartedAt) && info.matchStartedAt > 0
    ? info.matchStartedAt
    : null;
  paintClock();

  currentProfileId = info.profileId || null;
  if (info.profileId) {
    currentName.textContent = info.alias || `Perfil ${info.profileId}`;
    currentId.textContent = `#${info.profileId}`;
    currentOrigin.hidden = false;
    currentOrigin.textContent =
      info.origin === 'manual' ? 'elegida por vos' : 'detectada automáticamente';
    accountAvatar.textContent = initialsOf(info.alias || `Perfil ${info.profileId}`);
  } else {
    currentName.textContent = 'Todavía no hay cuenta elegida';
    currentId.textContent = '';
    currentOrigin.hidden = true;
    accountAvatar.textContent = '?';
  }
}

function initialsOf(name) {
  const words = String(name || '')
    .replace(/[|·]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0] || '';
  const last = words.length > 1 ? words[words.length - 1][0] || '' : '';
  return `${first}${last}`.toUpperCase();
}

function renderResults() {
  resultsEl.replaceChildren();
  results.forEach((profile, index) => {
    const row = document.createElement('div');
    row.className = `result${index === activeIndex ? ' active' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === activeIndex));

    const avatar = document.createElement('span');
    avatar.className = 'result-avatar';
    avatar.textContent = initialsOf(profile.name);

    const copy = document.createElement('span');
    copy.className = 'result-copy';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = profile.clan ? `${profile.clan} | ${profile.name}` : profile.name;

    const tag = document.createElement('span');
    tag.className = 'tag';
    const bits = [`#${profile.profileId}`];
    if (profile.country) bits.push(profile.country.toUpperCase());
    if (profile.games) bits.push(`${profile.games} pj`);
    tag.textContent = bits.join(' · ');
    copy.append(name, tag);

    const check = document.createElement('span');
    check.className = 'result-check';
    check.textContent = String(profile.profileId) === String(currentProfileId) ? '✓' : '';

    row.append(avatar, copy, check);
    row.addEventListener('click', () => choose(profile.profileId));
    resultsEl.append(row);
  });
}

async function choose(profileId) {
  manualBtn.disabled = true;
  setStatus('Guardando…');
  const response = await window.settings.pick(profileId);
  manualBtn.disabled = false;
  if (!response.ok) {
    setStatus(response.error || 'No se pudo guardar el perfil', true);
    return;
  }
  setStatus(`Listo: ${response.alias || 'perfil'} (#${response.profileId})`);
  await loadCurrent();
}

function parseNumeric(value) {
  const raw = String(value || '').trim();
  return /^\d{5,}$/.test(raw) ? raw : null;
}

function paintSearchState(text) {
  searchStateEl.textContent = text || '';
}

function paintSearchHelp(hasResults) {
  searchHelpEl.innerHTML = hasResults
    ? '<b>↑</b> <b>↓</b> para elegir · <b>Enter</b> para confirmar'
    : 'Buscá por nombre o pegá tu profile ID.';
}

function paintManualButton(value) {
  const numeric = parseNumeric(value);
  manualBtn.hidden = !numeric;
  if (numeric) manualBtn.textContent = `Usar ID #${numeric}`;
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  clearTimeout(searchTimer);
  paintManualButton(query);
  activeIndex = -1;

  if (query.length < 2) {
    results = [];
    renderResults();
    paintSearchState('');
    paintSearchHelp(false);
    setStatus('');
    return;
  }

  // Un ID numérico se usa directo: no se busca por nombre.
  if (parseNumeric(query)) {
    results = [];
    renderResults();
    paintSearchState('ID listo');
    paintSearchHelp(false);
    setStatus('');
    return;
  }

  const token = ++searchToken;
  paintSearchState('Buscando…');
  searchTimer = setTimeout(async () => {
    const response = await window.settings.search(query);
    if (token !== searchToken) return;
    if (!response.ok) {
      results = [];
      renderResults();
      paintSearchState('Sin resultados');
      setStatus(response.error || 'No se pudo buscar', true);
      return;
    }
    results = response.results;
    activeIndex = results.length ? 0 : -1;
    renderResults();
    paintSearchState(
      results.length ? `${results.length} resultado${results.length === 1 ? '' : 's'}` : 'Sin resultados',
    );
    paintSearchHelp(Boolean(results.length));
    setStatus('');
  }, 320);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    if (!results.length) return;
    event.preventDefault();
    activeIndex = (activeIndex + 1) % results.length;
    renderResults();
  } else if (event.key === 'ArrowUp') {
    if (!results.length) return;
    event.preventDefault();
    activeIndex = (activeIndex - 1 + results.length) % results.length;
    renderResults();
  } else if (event.key === 'Enter') {
    if (activeIndex >= 0 && results[activeIndex]) {
      choose(results[activeIndex].profileId);
      return;
    }
    const numeric = parseNumeric(searchInput.value);
    if (numeric) choose(numeric);
  }
});

manualBtn.addEventListener('click', () => {
  const numeric = parseNumeric(searchInput.value);
  if (!numeric) {
    setStatus('Pegá un profile ID numérico', true);
    return;
  }
  choose(numeric);
});

autoBtn.addEventListener('click', async () => {
  autoBtn.disabled = true;
  setStatus('Buscando la cuenta del juego en esta PC…');
  const response = await window.settings.auto();
  autoBtn.disabled = false;
  if (!response.ok) {
    setStatus(response.error || 'No se encontró ninguna cuenta', true);
    return;
  }
  setStatus(`Detectada: ${response.alias || 'sin alias'} (#${response.profileId})`);
  await loadCurrent();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!civHelpTip.hidden) {
    closeCivHelpTip();
    return;
  }
  if (moving) {
    setMoving(false);
    return;
  }
  window.settings.close();
});

/* ============================================================
   Navegación del wizard: solo el rail, sin botones de pie.
   ============================================================ */
const PAGE_ORDER = ['player', 'overlay', 'postmatch', 'skins', 'plans', 'updater'];
const PAGE_META = {
  player: { index: '01 / CUENTA', title: 'Tu punto de partida.', sub: 'Tu cuenta en el juego y cómo cambiarla.' },
  overlay: { index: '02 / PREMATCH', title: 'Prepará la partida.', sub: 'Qué se ve en cola y al entrar a la partida.' },
  postmatch: { index: '03 / POSTMATCH', title: 'Aprendé de cada partida.', sub: 'El resultado y tu evolución cuando termina.' },
  skins: { index: '04 / APARIENCIA', title: 'Tu panel, a tu manera.', sub: 'Cómo se ve el overlay sobre el juego.' },
  plans: { index: '05 / PLAN Y ACCESO', title: 'Elegí cuánto ver.', sub: 'Free para competir; Pro para preparar y evolucionar.' },
  updater: { index: '06 / ACTUALIZACIONES', title: 'Mantené la app al día.', sub: 'Actualizaciones seguras, también en plena temporada.' },
};

let activePage = 'player';

function goTo(page) {
  if (!PAGE_META[page]) return;
  activePage = page;
  for (const button of navButtons) button.classList.toggle('active', button.dataset.page === page);
  for (const section of pageSections) section.classList.toggle('active', section.dataset.page === page);
  pageTitle.textContent = PAGE_META[page].title;
  pageSub.textContent = PAGE_META[page].sub;
  pageIndex.textContent = PAGE_META[page].index;
  if (page === 'postmatch') loadPostMatch();
  if (pagesEl) pagesEl.scrollTop = 0;
}

for (const button of navButtons) button.addEventListener('click', () => goTo(button.dataset.page));

/* ============================================================
   Updater: estado real de electron-updater. Nada inventado.
   ============================================================ */
const updCurrent = el('updCurrent');
const updLatest = el('updLatest');
const updPill = el('updPill');
const updPhase = el('updPhase');
const updPercent = el('updPercent');
const updFill = el('updFill');
const updNotes = el('updNotes');
const skipBtn = el('skipBtn');
const checkBtn = el('checkBtn');
const updateBtn = el('updateBtn');

let updaterState = null;

function renderUpdater(snapshot) {
  if (!snapshot) return;
  updaterState = snapshot;
  // Mensaje transitorio de versiones anteriores: nunca debe quedar colgado.
  if (statusEl.textContent.startsWith('Buscando actualizaciones')) setStatus('');
  updCurrent.textContent = snapshot.current || '—';
  updLatest.textContent = snapshot.latest || '—';

  updPill.classList.remove('muted', 'error');
  if (snapshot.publishing) {
    updPill.textContent = 'Publicándose…';
    updPill.classList.add('muted');
  } else if (snapshot.installDeferred) {
    updPill.textContent = 'Instalación pospuesta';
    updPill.classList.add('muted');
  } else if (snapshot.error) {
    updPill.textContent = 'Error de consulta';
    updPill.classList.add('error');
  } else if (snapshot.skipped) {
    updPill.textContent = 'Omitida en esta sesión';
    updPill.classList.add('muted');
  } else if (snapshot.ready) {
    updPill.textContent = 'Lista para instalar';
  } else if (snapshot.available) {
    updPill.textContent = 'Actualización disponible';
  } else if (snapshot.deferred) {
    updPill.textContent = 'Consulta pospuesta';
    updPill.classList.add('muted');
  } else if (!snapshot.active) {
    updPill.textContent = 'Solo en la app instalada';
    updPill.classList.add('muted');
  } else {
    updPill.textContent = 'Al día';
  }

  const percent = Math.max(0, Math.min(100, Math.round(Number(snapshot.percent) || 0)));
  updFill.style.setProperty('width', `${percent}%`);
  updPercent.textContent = snapshot.downloading || snapshot.ready ? `${percent}%` : '';

  if (snapshot.publishing) updPhase.textContent = 'El release se está publicando. Reintento automático en unos minutos.';
  else if (snapshot.installDeferred) updPhase.textContent = 'Hay partida en curso: se instala sola apenas termines.';
  else if (snapshot.error) updPhase.textContent = snapshot.error;
  else if (!snapshot.active) updPhase.textContent = 'Las actualizaciones se consultan al abrir la app instalada.';
  else if (snapshot.skipped) updPhase.textContent = 'Omitida: no se instala al salir. Podés buscar una versión más nueva.';
  else if (snapshot.ready) updPhase.textContent = `v${snapshot.readyVersion || snapshot.latest || ''} descargada. Se instala al salir.`;
  else if (snapshot.downloading) updPhase.textContent = 'Descargando paquete de actualización…';
  else if (snapshot.deferred) updPhase.textContent = 'Consulta pospuesta: hay partida en curso. Se reintenta solo.';
  else if (snapshot.checking) updPhase.textContent = 'Buscando una versión nueva…';
  else if (snapshot.available) updPhase.textContent = 'Hay una versión nueva disponible.';
  else updPhase.textContent = 'Estás usando la última versión.';

  const notes = Array.isArray(snapshot.notes) ? snapshot.notes.filter(Boolean) : [];
  updNotes.replaceChildren();
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = snapshot.active ? 'Sin notas publicadas para esta versión.' : 'Sin notas para mostrar.';
    updNotes.append(li);
  } else {
    for (const note of notes) {
      const li = document.createElement('li');
      li.textContent = note;
      updNotes.append(li);
    }
  }

  // Un solo botón busca: checkBtn. El primario únicamente descarga o instala
  // y queda inactivo cuando no hay nada que hacer (antes también buscaba).
  // El interruptor de automáticas solo tiene sentido en la app instalada
  // (en desarrollo no hay updater).
  autoUpdateInput.disabled = !snapshot.active;
  updateBtn.disabled = !snapshot.active || !(snapshot.ready || snapshot.available);
  checkBtn.disabled = !snapshot.active || Boolean(snapshot.checking);
  skipBtn.disabled = !snapshot.active || Boolean(snapshot.skipped) || !(snapshot.available || snapshot.ready);
  skipBtn.textContent = snapshot.skipped ? 'Omitida' : 'Omitir';
  updateBtn.textContent = !snapshot.active
    ? 'No disponible'
    : snapshot.ready
      ? 'Actualizar ahora'
      : 'Descargar';
}

window.settings.onUpdater(renderUpdater);
window.settings.onGoto((page) => {
  if (PAGE_ORDER.includes(page)) goTo(page);
});
window.settings.updaterGet().then(renderUpdater).catch(() => {});

updateBtn.addEventListener('click', async () => {
  if (!updaterState || !updaterState.active) return;
  // Nunca instalar una versión vieja si ya se detectó una más nueva.
  if (updaterState.ready && updaterState.latest && updaterState.readyVersion &&
      updaterState.latest !== updaterState.readyVersion) {
    updateBtn.disabled = true;
    updPhase.textContent = 'Apareció una versión más nueva: actualizo el estado…';
    renderUpdater(await window.settings.updaterCheck());
    return;
  }
  updateBtn.disabled = true;
  if (updaterState.ready) {
    updPhase.textContent = 'Instalando la actualización…';
    const result = await window.settings.updaterInstall();
    // Si había partida, install() pospone y el broadcast ya repinta el panel.
    // Esto evita que quede «Instalando…» si el evento llega antes del repintado.
    if (result && result.ok === false && result.reason === 'match') {
      updPhase.textContent = 'Hay partida en curso: se instala sola apenas termines.';
    }
    return;
  }
  if (updaterState.available) {
    updPhase.textContent = 'Descargando paquete de actualización…';
    renderUpdater(await window.settings.updaterDownload());
    return;
  }
  // El primario jamás busca: si el estado cambió mientras tanto, se repinta
  // con el último snapshot en vez de habilitar una acción inválida.
  renderUpdater(updaterState);
});

// Siempre se puede volver a consultar, incluso con una versión ya descargada:
// así, si salió otra más nueva, el panel la detecta sin instalar la anterior.
checkBtn.addEventListener('click', async () => {
  if (!updaterState || !updaterState.active) return;
  checkBtn.disabled = true;
  updPhase.textContent = 'Buscando una versión nueva…';
  renderUpdater(await window.settings.updaterCheck());
});

skipBtn.addEventListener('click', async () => {
  renderUpdater(await window.settings.updaterSkip());
  setStatus('Omitida por ahora: no se instala al salir en esta sesión.');
});

paintThemes();
paintOpacity(0.95);
paintSearchHelp(false);
goTo('player');
loadCurrent();
