'use strict';

// El diseño llega por query (?theme=) para aplicarlo antes del primer paint.
const initialTheme = new URLSearchParams(location.search).get('theme') || 'clasico';
document.body.dataset.theme = initialTheme;

const el = (id) => document.getElementById(id);
function t(key, fallback, vars = null) {
  if (typeof AppI18n === 'object' && AppI18n.t) {
    const val = AppI18n.t(key, vars);
    if (val && val !== key) return val;
  }
  return fallback;
}

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
  smartTips: 'Lectura de apertura',
  rivalH2H: 'Enfrentamientos previos',
  civRecommender: 'Historial y cruce de civilizaciones',
};
const tgBalanceInput = el('tgBalance');
// "Resumen con F2": vista resumida del scouting con su atajo. Apagada de
// fábrica: sin permiso explícito no se captura una tecla global y el
// informe se ve completo.
const scoutF2Input = el('scoutF2');
const postMatchInput = el('postMatch');
const postMatchComparisonInput = el('postMatchComparison');
const postMatchCompareModeInput = el('postMatchCompareMode');
const postMatchCompareHelp = el('postMatchCompareHelp');
let savedPostMatchCompareMode = 'both';
const postMatchReplayInput = el('postMatchReplay');
const postMatchReportEl = el('postMatchReport');
const refreshPostMatchBtn = el('refreshPostMatch');
const tacticalReportEl = el('tacticalReport');
const smartBuildOrderInput = el('smartBuildOrder');
const buildOrderReportEl = el('buildOrderReport');
const railPlanLabel = el('railPlanLabel');
const planName = el('planName');
const planDescription = el('planDescription');
const planExpiry = el('planExpiry');
const freeFeatures = el('freeFeatures');
const proFeatures = el('proFeatures');
const proMaxFeatures = el('proMaxFeatures');
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
  const clock = clockShort(value);
  hideAtInput.value = String(value);
  hideAtValue.textContent = clock;
  hideAtInput.style.setProperty('--fill', `${((value - 10) / 50) * 100}%`);
  enterWindowLabel.textContent = t('overlay.enterWindow', `Al entrar · 0:01 – ${clock}`, { time: clock, seconds: value });
  civHelpDesc.textContent = t('overlay.civHelpDesc', `Escudos de ambas civs y resumen de bonos, unidades y debilidades · 0:01 – ${clock}`, { time: clock, seconds: value });
  hideEloName.textContent = t('overlay.hideEloTitle', `Ocultar Overlay ${value} segundos`, { time: clock, seconds: value });
  hideEloDesc.textContent = t('overlay.hideEloDesc', `Se oculta a ${clock} para no molestar · vuelve al terminar`, { time: clock, seconds: value });
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
    name.textContent = t(`featureList.${feature.key}.title`, feature.title);
    const emblem = document.createElement('span');
    emblem.className = 'feature-icon';
    emblem.setAttribute('aria-hidden', 'true');
    if (typeof TacticalUI === 'object') emblem.innerHTML = TacticalUI.icon(feature.icon || 'compass');
    const description = document.createElement('span');
    description.className = 'feature-desc';
    description.textContent = t(`featureList.${feature.key}.desc`, feature.description);
    item.append(emblem, name, description);
    target.append(item);
  }
}

function paintPostmatchReference() {
  if (!postMatchCompareModeInput) return;
  const hasAccess = !postMatchComparisonInput.disabled;
  const enabled = postMatchComparisonInput.checked && hasAccess;
  postMatchCompareModeInput.disabled = !enabled;
  postMatchCompareHelp.textContent = enabled
    ? t('postmatchPage.modeHelpOn', 'Elegí qué referencia se muestra en el informe')
    : hasAccess
      ? t('postmatchPage.modeHelpOff', 'Activá «Comparar mi evolución» para elegir la referencia')
      : t('postmatchPage.availableProMax', 'Disponible con ProMax.');
}

function renderProduct(product) {
  if (!product) return;
  currentProduct = product;
  const features = Array.isArray(product.features) ? product.features : [];
  const proAccess = Boolean(product.featureAccess && product.featureAccess.postMatchComparison);
  const replayAccess = Boolean(product.featureAccess && product.featureAccess.postMatchReplay);

  const planLabel = product.plan === 'beta' ? t('plans.beta', 'Acceso beta')
    : product.plan === 'promax' ? t('plans.promax', 'ProMax')
      : product.plan === 'pro' ? t('plans.pro', 'Pro')
        : t('plans.free', 'Free');
  railPlanLabel.textContent = planLabel;
  planName.textContent = planLabel;
  if (product.accessSource === 'access-key') {
    planDescription.textContent = t('plansPage.descKey', 'Acceso de prueba ProMax por clave. No es una suscripción.');
  } else if (product.plan === 'pro' || product.plan === 'promax') {
    planDescription.textContent = t('plansPage.descVerified', 'Licencia firmada verificada para las funciones de este plan.');
  } else if (product.plan === 'beta') {
    planDescription.textContent = t('plansPage.descBeta', 'Acceso beta explícito de esta versión. No es una suscripción activa.');
  } else {
    planDescription.textContent = t('plansPage.descFree', 'Las funciones esenciales para conocer la partida y a sus jugadores.');
  }
  const intlLoc = typeof AppI18n === 'object' ? AppI18n.getIntlLocale() : 'es-AR';
  if (product.subscriptionVerified && product.entitlement && product.entitlement.expiresAt) {
    const expires = new Date(product.entitlement.expiresAt);
    const fmtDate = expires.toLocaleDateString(intlLoc, { day: '2-digit', month: 'short', year: 'numeric' });
    planExpiry.textContent = t('plansPage.expDate', `Vence el ${fmtDate}`, { date: fmtDate });
  } else if (product.accessSource === 'access-key') {
    planExpiry.textContent = t('plansPage.expKey', 'Acceso por clave · sin suscripción');
  } else if (product.plan === 'beta') {
    planExpiry.textContent = t('plansPage.expBeta', 'Acceso beta · sin suscripción verificada');
  } else {
    planExpiry.textContent = t('plansPage.expNone', 'Sin suscripción verificada');
  }

  renderFeatureList(freeFeatures, features.filter((feature) => feature.plan === 'free'));
  renderFeatureList(proFeatures, features.filter((feature) => feature.plan === 'pro'));
  renderFeatureList(proMaxFeatures, features.filter((feature) => feature.plan === 'promax'));

  postMatchInput.disabled = !product.featureAccess.postMatch;
  civHelpInput.disabled = !product.featureAccess.civHelp;
  tgBalanceInput.disabled = !product.featureAccess.tgBalance;
  postMatchComparisonInput.disabled = !proAccess;
  paintPostmatchReference();
  postMatchReplayInput.disabled = !replayAccess;
  smartBuildOrderInput.disabled = !product.featureAccess.smartBuildOrder;
  postMatchInput.title = product.featureAccess.postMatch ? '' : t('postmatchPage.availableProMax', 'Disponible con ProMax.');
  postMatchComparisonInput.title = proAccess ? '' : t('postmatchPage.availableProMax', 'Disponible con ProMax.');
  postMatchReplayInput.title = replayAccess ? '' : t('postmatchPage.availableProMax', 'Disponible con ProMax.');
  scoutF2Input.closest('.row').hidden = true;
  scoutF2Input.disabled = true;
  const gatedInputs = [
    ...Object.entries(rivalInputs),
    ['civHelp', civHelpInput],
    ['tgBalance', tgBalanceInput],
    ['smartBuildOrder', smartBuildOrderInput],
    ['postMatch', postMatchInput],
    ['postMatchComparison', postMatchComparisonInput],
    ['postMatchReplay', postMatchReplayInput],
  ];
  for (const [key, input] of gatedInputs) {
    if (!input) continue;
    const allowed = product.featureAccess && product.featureAccess[key] === true;
    input.disabled = !allowed;
    const tier = features.find((feature) => feature.key === key)?.plan;
    const tierName = tier === 'promax' ? 'ProMax' : 'Pro';
    input.title = allowed ? '' : t('plansPage.availableWith', `Disponible con ${tierName}. Tu preferencia guardada se conserva.`, { tier: tierName });
    const row = input.closest('.row');
    if (row) {
      row.classList.toggle('feature-locked', !allowed);
      row.dataset.tier = tierName.toUpperCase();
    }
  }

  const commerce = product.commerce || {};
  commerceStatus.textContent = commerce.configured
    ? t('plansPage.subsConfigured', 'La suscripción se gestiona en el sitio del producto.')
    : t('plansPage.subsStatus', 'La contratación todavía no está habilitada.');
  commerceTitle.textContent = t('plansPage.subsTitle', 'Suscripciones');
  accountCommerce.disabled = !(commerce.account && commerce.account.enabled);
  checkoutCommerce.disabled = !(commerce.checkout && commerce.checkout.enabled);
}

function getEmptyPostmatchHtml() {
  const tpl = el('emptyPostmatchState');
  return tpl ? tpl.innerHTML : '';
}
if (postMatchReportEl) postMatchReportEl.innerHTML = getEmptyPostmatchHtml();

let lastPostMatchPayload = null;
function paintPostMatch(payload) {
  lastPostMatchPayload = payload;
  const report = payload && Object.hasOwn(payload, 'report') ? payload.report : payload;
  if (payload && payload.access) postMatchAccess = payload.access;
  if (payload && payload.product) renderProduct(payload.product);
  if (!postMatchReportEl) return;
  if (!report) {
    postMatchReportEl.innerHTML = getEmptyPostmatchHtml();
    return;
  }
  if (typeof TacticalUI !== 'object') {
    postMatchReportEl.textContent = t('postmatchPage.drawError', 'No se pudo dibujar el informe.');
    return;
  }
  postMatchReportEl.innerHTML = TacticalUI.renderPostMatch(report, postMatchAccess);
  postMatchReportEl.querySelectorAll('[data-w]').forEach((bar) => {
    const width = Math.max(0, Math.min(100, Number(bar.dataset.w) || 0));
    bar.style.width = `${width}%`;
  });
}

async function loadPostMatch() {
  try {
    paintPostMatch(await window.settings.postmatchGet());
  } catch {
    postMatchReportEl.innerHTML = getEmptyPostmatchHtml();
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
    diagPoll.textContent = t('account.diagWaiting', 'esperando la primera consulta…');
    return;
  }
  const secs = Math.max(0, Math.round((Date.now() - lastDiag.lastPollAt) / 1000));
  const labels = {
    ongoing: t('account.diagOngoing', 'en partida'),
    idle: t('account.diagIdle', 'sin partida'),
    error: t('account.diagError', 'error de red'),
    'no-profile': t('account.diagNoAccount', 'sin cuenta'),
  };
  const st = labels[lastDiag.lastPollStatus] || lastDiag.lastPollStatus;
  diagPoll.textContent = t('account.diagAgo', `hace ${secs}s · ${st}`, { s: secs, state: st });
}

function renderDiag(diagnostics) {
  lastDiag = diagnostics;
  diagProfile.textContent = diagnostics.profileId
    ? `${diagnostics.alias || t('account.profilePrefix', 'Perfil')} (#${diagnostics.profileId})`
    : t('account.diagNoAccount', 'sin cuenta');
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
    setStatus((response && response.error) || `${label}`, true);
    return;
  }
  setStatus(`${label}: ${wanted ? t('overlay.enabled', 'activado') : t('overlay.disabled', 'desactivado')}`);
}

/* Aviso al activar la Ayuda de civ: si el tiempo actual es corto, ofrecer
   dejarla visible hasta 0:40 para poder leerla antes de que se vaya. */
function openCivHelpTip() {
  const current = Math.min(60, Math.max(10, Math.round(Number(hideAtInput.value) || 20)));
  const cStr = clockShort(current);
  if (current >= 40) {
    setStatus(t('overlay.civHelpVisibleUntil', `Ayuda de civ: activada · visible hasta ${cStr}`, { time: cStr }));
    return;
  }
  const tipBody = el('civHelpTipBody');
  if (tipBody) {
    tipBody.textContent = t('common.civTipBody', `La tarjeta se oculta a los ${cStr}. Si querés leerla con calma durante la partida, podés dejarla visible hasta los 0:40.`, { time: cStr });
  } else if (civHelpTipTime) {
    civHelpTipTime.textContent = cStr;
  }
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
  applyToggle(hideEloInput, (on) => window.settings.hideEloAt20(on), hideEloName.textContent || 'Ocultar Overlay'),
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
    const secs = Math.round(Number(response.hideAtSeconds) || value);
    const cStr = clockShort(secs);
    setStatus(t('overlay.hideAtSaved', `Ocultar Overlay y ayuda a los ${secs} segundos`, { time: cStr, seconds: secs }));
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
  ['postMatchReplay', postMatchReplayInput, 'Análisis del replay y APM'],
]) {
  input.addEventListener('change', async () => {
    try {
      await applyToggle(input, (on) => window.settings.postMatchOption(key, on), label);
    } catch (error) {
      input.checked = !input.checked;
      setStatus(error.message || 'No se pudo actualizar la opción.', true);
    }
    if (input === postMatchComparisonInput) paintPostmatchReference();
  });
}
if (postMatchCompareModeInput) {
  postMatchCompareModeInput.addEventListener('change', async () => {
    const value = postMatchCompareModeInput.value;
    try {
      const result = await window.settings.postMatchOption('postMatchCompareMode', value);
      if (!result?.ok) throw new Error(result?.error || 'No se pudo cambiar la referencia del postmatch.');
      savedPostMatchCompareMode = value;
      setStatus('Referencia del postmatch actualizada.');
    } catch (error) {
      postMatchCompareModeInput.value = savedPostMatchCompareMode;
      setStatus(error.message || 'No se pudo cambiar la referencia del postmatch.', true);
    }
  });
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
window.settings.onProduct((product) => { renderProduct(product); loadTactics(); });
window.settings.onTactics((payload) => paintTactics(payload));
window.settings.onBuildOrder((payload) => paintBuildOrder(payload));

let lastBuildOrderPayload = null;
function paintBuildOrder(payload) {
  lastBuildOrderPayload = payload;
  if (!buildOrderReportEl || typeof TacticalUI !== 'object') return;
  buildOrderReportEl.innerHTML = TacticalUI.renderSmartBuildOrder(payload, { library: true });
  smartBuildOrderInput.checked = Boolean(payload?.enabled);
  smartBuildOrderInput.disabled = payload?.status === 'locked' || Boolean(payload?.ongoing);
  smartBuildOrderInput.title = payload?.ongoing ? t('tactics.configBeforeMatch', 'Se configura antes de buscar partida.')
    : payload?.status === 'locked' ? t('postmatchPage.availableProMax', 'Disponible con ProMax.') : '';
}

async function loadBuildOrder() {
  try { paintBuildOrder(await window.settings.buildOrderGet()); }
  catch { paintBuildOrder({ status: 'unavailable', reasons: [t('tactics.guideError', 'No se pudo consultar la guía.')] }); }
}

smartBuildOrderInput.addEventListener('change', async () => {
  await applyToggle(smartBuildOrderInput, (on) => window.settings.smartBuildOrder(on), t('tactics.sboTitle', 'Smart Build Order'));
  await loadBuildOrder();
});

let lastTacticsPayload = null;
function paintTactics(payload) {
  lastTacticsPayload = payload;
  if (!tacticalReportEl || typeof TacticalUI !== 'object') return;
  const tips = Array.isArray(payload?.tips) ? payload.tips : [];
  const content = tips.filter((tip) => tip.opportunityStages || tip.opportunities).map((tip) =>
    `<article class="tactical-rival"><h3>${TacticalUI.esc(tip.name || t('postmatch.rival', 'Rival'))}</h3>${TacticalUI.renderAutomaticOpportunities(tip.opportunityStages || [tip.opportunities], { detail: true })}</article>`).join('');
  const error = tips.find((tip) => tip.error)?.error;
  const message = payload?.message || error || (payload?.status === 'loading'
    ? t('tactics.loadingMatchup', 'Actualizando el cruce de civilizaciones y el historial…')
    : t('tactics.waitingBoth', 'Esperando ambas civilizaciones y datos de la partida.'));
  tacticalReportEl.innerHTML = content || `<div class="empty-report"><h3>${TacticalUI.esc(message)}</h3></div>`;
}

async function loadTactics() {
  await loadBuildOrder();
  try { paintTactics(await window.settings.tacticsGet()); }
  catch { paintTactics({ status: 'error', message: t('tactics.loadError', 'No se pudo consultar el análisis. Podés reintentar.') }); }
}


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
let lastPosInfo = { position: 'top-center', moving: false };
function paintPosition(info) {
  lastPosInfo = info || lastPosInfo;
  positionCustom = lastPosInfo.position === 'custom' && Number.isFinite(Number(lastPosInfo.x));
  positionLabel.textContent = positionCustom
    ? t('skins.posCustom', 'Posición personalizada')
    : t('skins.posTopCenter', 'Arriba al centro');
  positionInfo.textContent = positionCustom
    ? t('skins.posCustomInfo', `Fija en ${Math.round(lastPosInfo.x)}, ${Math.round(lastPosInfo.y)} de la pantalla.`, { x: Math.round(lastPosInfo.x), y: Math.round(lastPosInfo.y) })
    : t('skins.posTopCenterInfo', 'El panel aparece arriba al centro.');
  moving = Boolean(lastPosInfo.moving);
  paintMoveButton();
}

function paintMoveButton() {
  moveBtn.textContent = moving ? t('skins.posDone', 'Listo') : t('skins.posMove', 'Mover');
  moveBtn.classList.toggle('active', moving);
}

async function setMoving(on) {
  const response = await window.settings.move(on);
  moving = Boolean(response.moving);
  paintMoveButton();
  if (moving) {
    positionLabel.textContent = t('skins.posMovingTitle', 'Mové el panel');
    setStatus(t('skins.posMovingHint', 'Arrastrá el panel a donde quieras y tocá "Listo" (o Esc).'));
    return;
  }
  setStatus(t('skins.posSaved', 'Posición guardada: el panel queda ahí y no vuelve a moverse.'));
  await loadCurrent();
}

moveBtn.addEventListener('click', () => setMoving(!moving));

/* ---------- cuenta ---------- */
let lastLoadedInfo = null;
function paintAccountHeader(info) {
  if (!info) return;
  currentProfileId = info.profileId || null;
  el('accountProfile').classList.toggle('has-profile', Boolean(currentProfileId));
  el('accountHint').textContent = currentProfileId
    ? t('account.hintLinked', 'El overlay usa tu perfil para reconocerte en la partida y mostrar tu ELO de RM 1v1.')
    : t('account.hintEmpty', 'Detectá tu perfil del juego o buscá tu nombre abajo para activar el overlay.');
  if (info.profileId) {
    currentName.textContent = info.alias || `${t('account.profilePrefix', 'Perfil')} ${info.profileId}`;
    currentId.textContent = `#${info.profileId}`;
    currentOrigin.hidden = false;
    currentOrigin.textContent = info.origin === 'manual'
      ? t('account.originManual', 'elegida por vos')
      : t('account.originAuto', 'detectada automáticamente');
    accountAvatar.textContent = initialsOf(info.alias || `${t('account.profilePrefix', 'Perfil')} ${info.profileId}`);
  } else {
    currentName.textContent = t('account.none', 'Todavía no hay cuenta elegida');
    currentId.textContent = '';
    currentOrigin.hidden = true;
    accountAvatar.textContent = '';
  }
}

async function loadCurrent() {
  const info = await window.settings.get();
  lastLoadedInfo = info;
  if (info.version) versionEl.textContent = `v${info.version}`;

  if (typeof AppI18n === 'object' && info.i18nBundles) {
    AppI18n.configure({ locale: info.activeLanguage || 'es-MX', allBundles: info.i18nBundles });
  }
  if (typeof TacticalUI === 'object' && TacticalUI.configure) {
    TacticalUI.configure({
      slugs: info.shields,
      aliases: info.civAliases,
      i18n: typeof AppI18n === 'object' ? AppI18n : null,
    });
  }
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
  if (postMatchCompareModeInput) {
    savedPostMatchCompareMode = [...postMatchCompareModeInput.options].some((option) => option.value === info.postMatchCompareMode)
      ? info.postMatchCompareMode : 'both';
    postMatchCompareModeInput.value = savedPostMatchCompareMode;
  }
  postMatchReplayInput.checked = Boolean(info.postMatchReplay);
  smartBuildOrderInput.checked = Boolean(info.smartBuildOrder);
  if (info.product) renderProduct(info.product);
  paintAccountHeader(info);
  applyLanguageUi(info.activeLanguage || 'es-MX');
  await loadPostMatch();
  await loadBuildOrder();
  autoUpdateInput.checked = Boolean(info.autoUpdate);
  matchStartedAt = Number.isFinite(info.matchStartedAt) && info.matchStartedAt > 0
    ? info.matchStartedAt
    : null;
  paintClock();
  syncWizardAccount(info);
  if (info.wizardCompleted === false && !wizardDismissed) {
    openWizard(1);
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
  searchHelpEl.textContent = hasResults
    ? t('account.searchHintArrows', '↑ ↓ para elegir · Enter para confirmar')
    : t('account.searchHelp', 'Buscá por nombre o pegá tu profile ID.');
}

function paintManualButton(value) {
  const numeric = parseNumeric(value);
  manualBtn.hidden = !numeric;
  if (numeric) manualBtn.textContent = t('account.useIdBtn', `Usar ID #${numeric}`, { id: numeric });
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
const PAGE_ORDER = ['player', 'overlay', 'tactics', 'postmatch', 'skins', 'plans', 'updater'];
const PAGE_META = {
  player: { index: '01 / CUENTA', title: 'Cuenta de jugador', sub: 'Tu cuenta en el juego y cómo cambiarla.' },
  overlay: { index: '02 / PREMATCH', title: 'Prepará la partida.', sub: 'Qué se ve en cola y al entrar a la partida.' },
  tactics: { index: '03 / DURANTE', title: 'Elegí cómo responder.', sub: 'Oportunidades por civilización, historial y composición observada.' },
  postmatch: { index: '04 / POSTMATCH', title: 'Aprendé de cada partida.', sub: 'El resultado y tu evolución cuando termina.' },
  skins: { index: '05 / APARIENCIA', title: 'Tu panel, a tu manera.', sub: 'Cómo se ve el overlay sobre el juego.' },
  plans: { index: '06 / PLAN Y ACCESO', title: 'Elegí cuánto ver.', sub: 'Free para competir; Pro para preparar y evolucionar.' },
  updater: { index: '07 / ACTUALIZACIONES', title: 'Mantené la app al día.', sub: 'Actualizaciones seguras, también en plena temporada.' },
};

let activePage = 'player';

function goTo(page) {
  if (!PAGE_META[page]) return;
  activePage = page;
  for (const button of navButtons) {
    const current = button.dataset.page === page;
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const section of pageSections) section.classList.toggle('active', section.dataset.page === page);
  const locTitle = typeof AppI18n === 'object' ? AppI18n.t(`pages.${page}.title`) : null;
  const locSub = typeof AppI18n === 'object' ? AppI18n.t(`pages.${page}.sub`) : null;
  const locIdx = typeof AppI18n === 'object' ? AppI18n.t(`pages.${page}.index`) : null;
  pageTitle.textContent = (locTitle && locTitle !== `pages.${page}.title`) ? locTitle : PAGE_META[page].title;
  pageSub.textContent = (locSub && locSub !== `pages.${page}.sub`) ? locSub : PAGE_META[page].sub;
  pageIndex.textContent = (locIdx && locIdx !== `pages.${page}.index`) ? locIdx : PAGE_META[page].index;
  if (page === 'postmatch') loadPostMatch();
  if (page === 'tactics') loadTactics();
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
  updCurrent.textContent = snapshot.current || '—';
  updLatest.textContent = snapshot.latest || '—';

  updPill.classList.remove('muted', 'error');
  if (snapshot.publishing) {
    updPill.textContent = t('updater.pillPublishing', 'Publicándose…');
    updPill.classList.add('muted');
  } else if (snapshot.installDeferred) {
    updPill.textContent = t('updater.pillDeferredInstall', 'Instalación pospuesta');
    updPill.classList.add('muted');
  } else if (snapshot.error) {
    updPill.textContent = t('updater.pillError', 'Error de consulta');
    updPill.classList.add('error');
  } else if (snapshot.skipped) {
    updPill.textContent = t('updater.pillSkipped', 'Omitida en esta sesión');
    updPill.classList.add('muted');
  } else if (snapshot.ready) {
    updPill.textContent = t('updater.pillReady', 'Lista para instalar');
  } else if (snapshot.available) {
    updPill.textContent = t('updater.pillAvailable', 'Actualización disponible');
  } else if (snapshot.deferred) {
    updPill.textContent = t('updater.pillDeferred', 'Consulta pospuesta');
    updPill.classList.add('muted');
  } else if (!snapshot.active) {
    updPill.textContent = t('updater.pillInstalledOnly', 'Solo en la app instalada');
    updPill.classList.add('muted');
  } else {
    updPill.textContent = t('updater.upToDate', 'Al día');
  }

  const percent = Math.max(0, Math.min(100, Math.round(Number(snapshot.percent) || 0)));
  updFill.style.setProperty('width', `${percent}%`);
  updPercent.textContent = snapshot.downloading || snapshot.ready ? `${percent}%` : '';

  const readyVer = snapshot.readyVersion || snapshot.latest || '';
  if (snapshot.publishing) updPhase.textContent = t('updater.phasePublishing', 'El release se está publicando. Reintento automático en unos minutos.');
  else if (snapshot.installDeferred) updPhase.textContent = t('updater.phaseDeferredInstall', 'Hay partida en curso: se instala sola apenas termines.');
  else if (snapshot.error) updPhase.textContent = snapshot.error;
  else if (!snapshot.active) updPhase.textContent = t('updater.phaseInstalledOnly', 'Las actualizaciones se consultan al abrir la app instalada.');
  else if (snapshot.skipped) updPhase.textContent = t('updater.phaseSkipped', 'Omitida: no se instala al salir. Podés buscar una versión más nueva.');
  else if (snapshot.ready) updPhase.textContent = t('updater.phaseReady', `v${readyVer} descargada. Se instala al salir.`, { ver: readyVer });
  else if (snapshot.downloading) updPhase.textContent = t('updater.phaseDownloading', 'Descargando paquete de actualización…');
  else if (snapshot.deferred) updPhase.textContent = t('updater.phaseDeferred', 'Consulta pospuesta: hay partida en curso. Se reintenta solo.');
  else if (snapshot.checking) updPhase.textContent = t('updater.checking', 'Buscando una versión nueva…');
  else if (snapshot.available) updPhase.textContent = t('updater.phaseAvailable', 'Hay una versión nueva disponible.');
  else updPhase.textContent = t('updater.phaseUpToDate', 'Estás usando la última versión.');

  const notes = Array.isArray(snapshot.notes) ? snapshot.notes.filter(Boolean) : [];
  updNotes.replaceChildren();
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = snapshot.active
      ? t('updater.noNotesPublished', 'Sin notas publicadas para esta versión.')
      : t('updater.noNotesShow', 'Sin notas para mostrar.');
    updNotes.append(li);
  } else {
    for (const note of notes) {
      const li = document.createElement('li');
      li.textContent = note;
      updNotes.append(li);
    }
  }

  autoUpdateInput.disabled = !snapshot.active;
  updateBtn.disabled = !snapshot.active || !(snapshot.ready || snapshot.available);
  checkBtn.disabled = !snapshot.active || Boolean(snapshot.checking);
  skipBtn.disabled = !snapshot.active || Boolean(snapshot.skipped) || !(snapshot.available || snapshot.ready);
  skipBtn.textContent = snapshot.skipped ? t('updater.skippedBtn', 'Omitida') : t('updater.skip', 'Omitir');
  updateBtn.textContent = !snapshot.active
    ? t('updater.unavailable', 'No disponible')
    : snapshot.ready
      ? t('updater.installNow', 'Actualizar ahora')
      : t('updater.download', 'Descargar');
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

/* ============================================================
   Idioma (en, es-ES, es-MX, zh-CN) + Wizard de primer inicio
   ============================================================ */
const LANG_CARDS = [
  { code: 'en', label: 'English', region: 'International', sample: 'Knight · Town Center' },
  { code: 'es-ES', label: 'Español (España)', region: 'España', sample: 'Caballero · Centro urbano' },
  { code: 'es-MX', label: 'Español (México)', region: 'México / LATAM', sample: 'Jinete · Centro urbano' },
  { code: 'zh-CN', label: '简体中文', region: '中国大陆', sample: '骑士 · 城镇中心' },
];

let selectedLanguage = 'es-MX';
let wizardStep = 1;
let wizardDismissed = false;
let lastAccountInfo = { profileId: null, alias: null };

function applyLanguageUi(lang) {
  selectedLanguage = lang || 'es-MX';
  if (typeof AppI18n === 'object') {
    AppI18n.setLocale(selectedLanguage);
    AppI18n.applyToDom(document);
  }
  const badge = el('sessionBadge');
  if (badge) badge.textContent = t('plans.badgeConfig', 'CONFIGURACIÓN');
  pageTitle.textContent = t(`pages.${activePage}.title`, PAGE_META[activePage].title);
  pageSub.textContent = t(`pages.${activePage}.sub`, PAGE_META[activePage].sub);
  pageIndex.textContent = t(`pages.${activePage}.index`, PAGE_META[activePage].index);
  paintHideAt(Number(hideAtInput?.value) || 20);
  paintPosition(lastPosInfo);
  paintSoundToggle();
  paintSearchHelp(Boolean(results.length));
  paintPostmatchReference();
  if (lastLoadedInfo) paintAccountHeader(lastLoadedInfo);
  if (lastDiag) renderDiag(lastDiag);
  if (currentProduct) renderProduct(currentProduct);
  if (updaterState) renderUpdater(updaterState);
  if (lastPostMatchPayload !== null) paintPostMatch(lastPostMatchPayload);
  else if (postMatchReportEl) postMatchReportEl.innerHTML = getEmptyPostmatchHtml();
  if (lastBuildOrderPayload) paintBuildOrder(lastBuildOrderPayload);
  if (lastTacticsPayload) paintTactics(lastTacticsPayload);
  renderLanguageSelectors();
  renderWizardStep();
}

async function chooseLanguage(code, persist = true) {
  applyLanguageUi(code);
  setStatus(t('account.statusReady', 'Listo para preparar tu próxima partida.'));
  if (persist && window.settings?.setLanguage) {
    await window.settings.setLanguage(code).catch(() => {});
    if (activePage === 'postmatch') loadPostMatch();
    if (activePage === 'tactics') loadTactics();
  }
}

function renderLanguageSelectors() {
  const accountGrid = el('accountLangGrid');
  if (accountGrid) {
    accountGrid.innerHTML = LANG_CARDS.map((item) => {
      const flag = typeof AppI18n === 'object' ? AppI18n.flagSvg(item.code) : '';
      const active = item.code === selectedLanguage;
      return `<button type="button" class="prefs-lang-item${active ? ' active' : ''}" role="radio" aria-checked="${active}" data-lang="${item.code}">
        ${flag}
        <span>${escapeHtml(item.label)}</span>
        <em>${active ? '✓' : ''}</em>
      </button>`;
    }).join('');
    accountGrid.querySelectorAll('.prefs-lang-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        chooseLanguage(btn.dataset.lang, true);
        setPrefsPopover(false);
      });
    });
  }

  const wizGrid = el('wizLangGrid');
  if (wizGrid) {
    wizGrid.innerHTML = LANG_CARDS.map((item) => {
      const flag = typeof AppI18n === 'object' ? AppI18n.flagSvg(item.code) : '';
      const sel = item.code === selectedLanguage;
      return `<button type="button" class="wiz-lang-card${sel ? ' selected' : ''}" role="radio" aria-checked="${sel}" data-lang="${item.code}">
        ${flag}
        <span class="wiz-lang-copy">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.region)}</span>
          <small>${escapeHtml(item.sample)}</small>
        </span>
      </button>`;
    }).join('');
    wizGrid.querySelectorAll('.wiz-lang-card').forEach((btn) => {
      btn.addEventListener('click', () => chooseLanguage(btn.dataset.lang, true));
    });
  }
}

function setPrefsPopover(open) {
  const pop = el('appPrefsPopover');
  const btn = el('appPrefsBtn');
  if (!pop || !btn) return;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', String(Boolean(open)));
}

el('appPrefsBtn')?.addEventListener('click', (event) => {
  event.stopPropagation();
  const pop = el('appPrefsPopover');
  setPrefsPopover(pop ? pop.hidden : false);
});
el('prefsPlanBtn')?.addEventListener('click', () => {
  setPrefsPopover(false);
  goTo('plans');
});
function paintSoundToggle() {
  const btn = el('prefsSoundBtn');
  if (!btn || typeof UiSfx !== 'object') return;
  btn.textContent = UiSfx.isEnabled()
    ? t('common.soundsOn', 'Sonidos de interfaz · Activos')
    : t('common.soundsOff', 'Sonidos de interfaz · Silenciados');
}
el('prefsSoundBtn')?.addEventListener('click', () => {
  if (typeof UiSfx !== 'object') return;
  UiSfx.setEnabled(!UiSfx.isEnabled());
  paintSoundToggle();
});
if (typeof UiSfx === 'object') {
  UiSfx.attachAutoListeners(document);
  paintSoundToggle();
}
el('prefsVerifyBtn')?.addEventListener('click', async () => {
  setPrefsPopover(false);
  if (!window.settings?.refreshLicense) return;
  setStatus(typeof AppI18n === 'object' ? AppI18n.t('plans.checking') : 'Verificando licencia…');
  try {
    const res = await window.settings.refreshLicense();
    if (res?.product) renderProduct(res.product);
    setStatus(res?.ok
      ? (typeof AppI18n === 'object' ? AppI18n.t('plans.verified') : 'Acceso verificado.')
      : (typeof AppI18n === 'object' ? AppI18n.t('account.statusReady') : 'Estado actualizado.'));
  } catch (_) {
    setStatus('No se pudo verificar el acceso ahora.', true);
  }
});
document.addEventListener('click', (event) => {
  const pop = el('appPrefsPopover');
  const btn = el('appPrefsBtn');
  if (!pop || pop.hidden) return;
  if (!pop.contains(event.target) && (!btn || !btn.contains(event.target))) {
    setPrefsPopover(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setPrefsPopover(false);
});

function syncWizardAccount(info) {
  lastAccountInfo = { profileId: info?.profileId || null, alias: info?.alias || null };
  const nameEl = el('wizAccountName');
  const metaEl = el('wizAccountMeta');
  const avEl = el('wizAvatar');
  if (!nameEl) return;
  if (lastAccountInfo.profileId) {
    const label = lastAccountInfo.alias || `Perfil ${lastAccountInfo.profileId}`;
    nameEl.textContent = label;
    metaEl.textContent = `#${lastAccountInfo.profileId}`;
    avEl.textContent = initialsOf(label);
  } else {
    nameEl.textContent = typeof AppI18n === 'object' ? AppI18n.t('account.none') : 'Sin cuenta todavía';
    metaEl.textContent = typeof AppI18n === 'object' ? AppI18n.t('wizard.accountDesc') : '';
    avEl.textContent = '?';
  }
  renderWizardSummary();
}

function renderWizardSummary() {
  const sumLang = el('wizSumLang');
  const sumAcc = el('wizSumAccount');
  if (!sumLang || !sumAcc) return;
  const item = LANG_CARDS.find((c) => c.code === selectedLanguage) || LANG_CARDS[0];
  const flag = typeof AppI18n === 'object' ? AppI18n.flagSvg(item.code) : '';
  sumLang.innerHTML = `${flag}<span>${escapeHtml(item.label)}</span>`;
  sumAcc.textContent = lastAccountInfo.profileId
    ? `${lastAccountInfo.alias || 'AoE2'} (#${lastAccountInfo.profileId})`
    : (typeof AppI18n === 'object' ? AppI18n.t('wizard.summaryNoAccount') : 'Sin vincular');
}

function renderWizardStep() {
  const overlay = el('setupWizard');
  if (!overlay) return;
  overlay.querySelectorAll('.wiz-pane').forEach((p) => {
    p.classList.toggle('active', Number(p.dataset.wizPane) === wizardStep);
  });
  overlay.querySelectorAll('[data-wiz-dot]').forEach((d) => {
    const n = Number(d.dataset.wizDot);
    d.classList.toggle('active', n === wizardStep);
    d.classList.toggle('done', n < wizardStep);
  });
  const tr = (k, fb) => (typeof AppI18n === 'object' ? AppI18n.t(k) : fb);
  const titleEl = el('wizTitle');
  const subEl = el('wizSubtitle');
  if (wizardStep === 1) {
    titleEl.textContent = tr('wizard.langTitle', 'Elige tu idioma');
    subEl.textContent = tr('wizard.langDesc', 'Las unidades, edificios y civilizaciones coincidirán con el juego.');
  } else if (wizardStep === 2) {
    titleEl.textContent = tr('wizard.accountTitle', 'Conecta tu cuenta de AoE2');
    subEl.textContent = tr('wizard.accountDesc', 'Detecta tu perfil de Steam o búscalo por nombre.');
  } else {
    titleEl.textContent = tr('wizard.readyTitle', 'Todo listo para jugar');
    subEl.textContent = tr('wizard.readyDesc', 'El overlay se oculta mientras juegas y analiza tus partidas.');
  }
  const backBtn = el('wizBackBtn');
  const skipBtn = el('wizSkipBtn');
  const nextBtn = el('wizNextBtn');
  if (backBtn) backBtn.hidden = wizardStep <= 1;
  if (skipBtn) skipBtn.hidden = wizardStep !== 2 || Boolean(lastAccountInfo.profileId);
  if (nextBtn) {
    nextBtn.textContent = wizardStep === 3
      ? tr('wizard.finish', 'Abrir Centro de mando')
      : tr('wizard.next', 'Continuar');
  }
  renderWizardSummary();
}

function openWizard(step = 1) {
  wizardStep = step;
  wizardDismissed = false;
  const overlay = el('setupWizard');
  if (overlay) overlay.hidden = false;
  renderLanguageSelectors();
  renderWizardStep();
}

async function finishWizard() {
  wizardDismissed = true;
  const overlay = el('setupWizard');
  if (overlay) overlay.hidden = true;
  if (window.settings?.completeWizard) {
    await window.settings.completeWizard({ language: selectedLanguage }).catch(() => {});
  }
}

el('reopenWizardBtn')?.addEventListener('click', () => {
  setPrefsPopover(false);
  openWizard(1);
});
el('wizBackBtn')?.addEventListener('click', () => {
  if (wizardStep > 1) { wizardStep -= 1; renderWizardStep(); }
});
el('wizSkipBtn')?.addEventListener('click', () => {
  wizardStep = 3;
  renderWizardStep();
});
el('wizNextBtn')?.addEventListener('click', () => {
  if (wizardStep < 3) { wizardStep += 1; renderWizardStep(); }
  else finishWizard();
});
el('wizDetectBtn')?.addEventListener('click', async () => {
  const btn = el('wizDetectBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await window.settings.auto();
    if (res && res.profileId) {
      syncWizardAccount(res);
      await loadCurrent();
    }
  } finally {
    if (btn) btn.disabled = false;
  }
});

let wizSearchTimer = null;
el('wizSearch')?.addEventListener('input', () => {
  clearTimeout(wizSearchTimer);
  const q = el('wizSearch').value.trim();
  const box = el('wizResults');
  if (!box) return;
  if (q.length < 2) { box.replaceChildren(); return; }
  wizSearchTimer = setTimeout(async () => {
    try {
      const list = await window.settings.search(q);
      box.replaceChildren();
      for (const p of (list || []).slice(0, 5)) {
        const row = document.createElement('div');
        row.className = 'result';
        row.innerHTML = `<span class="result-avatar">${escapeHtml(initialsOf(p.name))}</span>
          <span class="result-copy"><span class="name">${escapeHtml(p.clan ? `${p.clan} | ${p.name}` : p.name)}</span>
          <span class="tag">#${escapeHtml(p.profileId)}</span></span>`;
        row.addEventListener('click', async () => {
          const picked = await window.settings.pick(p.profileId);
          syncWizardAccount(picked || { profileId: p.profileId, alias: p.name });
          box.replaceChildren();
          await loadCurrent();
        });
        box.appendChild(row);
      }
    } catch (_) { /* ignore */ }
  }, 260);
});

paintThemes();
paintOpacity(0.95);
paintSearchHelp(false);
goTo('player');
loadCurrent();
