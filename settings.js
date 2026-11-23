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
  civCounterPick: el('civCounterPick'),
};
const RIVAL_LABELS = {
  rivalCivs: 'Últimas 5 civs del rival',
  rivalFavorites: 'Civ y mapa más usados',
  rivalOpenings: 'Aperturas reales',
  smartTips: 'Lectura de apertura',
  rivalH2H: 'Enfrentamientos previos',
  civRecommender: 'Historial y cruce de civilizaciones',
  civCounterPick: 'Recomendador de civilización',
};
const tgBalanceInput = el('tgBalance');
const smurfDetectorInput = el('smurfDetector');
const hideWhenMinimizedInput = el('hideWhenMinimized');
// "Resumen con F2": vista resumida del scouting con su atajo. Apagada de
// fábrica: sin permiso explícito no se captura una tecla global y el
// informe se ve completo.
const scoutF2Input = el('scoutF2');
const postMatchInput = el('postMatch');
const postMatchPopupInput = el('postMatchPopup');
const postMatchHideInput = el('postMatchHideSeconds');
const postMatchHideValue = el('postMatchHideSecondsValue');
const postMatchHideRow = el('postMatchHideRow');
let postMatchHideTimer = null;
const postMatchComparisonInput = el('postMatchComparison');
const postMatchCompareModeInput = el('postMatchCompareMode');
const postMatchCompareHelp = el('postMatchCompareHelp');
let savedPostMatchCompareMode = 'both';
const postMatchReplayInput = el('postMatchReplay');
const postMatchReportEl = el('postMatchReport');
const postMatchRecentStripEl = el('postMatchRecentStrip');
const refreshPostMatchBtn = el('refreshPostMatch');
const centralDashboardEl = el('centralDashboard');
const centralSearchShellEl = el('centralSearchShell');
const centralSearchInput = el('centralSearch');
const centralSearchStateEl = el('centralSearchState');
const centralSearchClearBtn = el('centralSearchClear');
const centralSearchBtn = el('centralSearchBtn');
const centralSearchResultsEl = el('centralSearchResults');
const accountSearchBoxEl = el('accountSearchBox');
const centralViewingBarEl = el('centralViewingBar');
const centralViewingNameEl = el('centralViewingName');
const centralViewingMetaEl = el('centralViewingMeta');
const centralBackBtn = el('centralBackBtn');
const accountRecentMatchesEl = el('accountRecentMatches');
const refreshCentralBtn = el('refreshCentralBtn');
const goToCentralBtn = el('goToCentralBtn');
const tacticalReportEl = el('tacticalReport');
const smartBuildOrderInput = el('smartBuildOrder');
const buildOrderReportEl = el('buildOrderReport');
const railPlanBtn = el('railPlan');
const railPlanIcon = el('railPlanIcon');
const railPlanKicker = el('railPlanKicker');
const railPlanGlyph = el('railPlanGlyph');
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
  const hideRow = hideAtInput.closest('.slider-row');
  const enabled = Boolean(hideEloInput && hideEloInput.checked);
  if (hideRow) hideRow.classList.toggle('is-disabled', !enabled);
  hideAtInput.disabled = !enabled;
  enterWindowLabel.textContent = t('overlay.enterWindow', `Al entrar · 0:01 – ${clock}`, { time: clock, seconds: value });
  civHelpDesc.textContent = t('overlay.civHelpDesc', `Escudos de ambas civs y resumen de bonos, unidades y debilidades · 0:01 – ${clock}`, { time: clock, seconds: value });
  hideEloName.textContent = t('overlay.hideEloTitle', `Ocultar Overlay ${value} segundos`, { time: clock, seconds: value });
  hideEloDesc.textContent = t('overlay.hideEloDesc', `Se oculta a ${clock} para no molestar · vuelve al terminar`, { time: clock, seconds: value });
}

function paintOpacity(value) {
  const percent = Math.min(100, Math.max(15, Math.round(Number(value) * 100) || 95));
  opacityInput.value = String(percent);
  opacityValue.textContent = `${percent}%`;
  opacityInput.style.setProperty('--fill', `${((percent - 15) / 85) * 100}%`);
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
    : product.plan === 'promax' ? t('plans.promax', 'Ultra')
      : product.plan === 'pro' ? t('plans.pro', 'Pro')
        : t('plans.free', 'Free');
  if (railPlanLabel) railPlanLabel.textContent = planLabel;
  if (planName) planName.textContent = planLabel;
  const railTier = (product.plan === 'promax' || product.plan === 'beta') ? 'ultra'
    : product.plan === 'pro' ? 'pro' : 'free';
  if (railPlanBtn) railPlanBtn.dataset.tier = railTier;
  const railProfile = el('railUser');
  if (railProfile) railProfile.dataset.tier = railTier;
  const navPlansBtn = el('navPlans');
  if (navPlansBtn) navPlansBtn.hidden = railTier !== 'free';
  if (railPlanIcon) {
    railPlanIcon.src = railTier === 'ultra'
      ? 'assets/icons/crown.png'
      : railTier === 'pro'
        ? 'assets/icons/medal.png'
        : 'assets/icons/shield.png';
  }
  if (railPlanKicker) {
    railPlanKicker.textContent = railTier === 'free'
      ? t('plans.kickerFree', 'Plan actual')
      : t('plans.kickerActive', 'Plan activo');
  }
  if (railPlanGlyph) {
    railPlanGlyph.textContent = railTier === 'ultra' ? '✦' : railTier === 'pro' ? '◆' : '→';
  }
  if (product.accessSource === 'access-key') {
    planDescription.textContent = t('plansPage.descKey', 'Acceso de prueba Ultra por clave. No es una suscripción.');
  } else if (product.plan === 'pro' || product.plan === 'promax') {
    planDescription.textContent = t('plansPage.descVerified', 'Licencia firmada verificada para las funciones de este plan.');
  } else if (product.plan === 'beta') {
    planDescription.textContent = t('plansPage.descBeta', 'Acceso beta explícito de esta versión. No es una suscripción activa.');
  } else {
    planDescription.textContent = t('plansPage.descFree', 'Las funciones esenciales para conocer la partida y a sus jugadores.');
  }
  const intlLoc = typeof AppI18n === 'object' ? AppI18n.getIntlLocale() : 'es-AR';
  const expTs = product.entitlement?.expiresAt || product.expiresAt || null;
  if (planExpiry) {
    planExpiry.hidden = false;
    if ((product.subscriptionVerified || product.plan === 'pro' || product.plan === 'promax') && expTs) {
      const expires = new Date(expTs);
      const fmtDate = expires.toLocaleDateString(intlLoc, { day: '2-digit', month: 'short', year: 'numeric' });
      planExpiry.textContent = t('plansPage.expDate', `Vence el ${fmtDate}`, { date: fmtDate });
    } else if (product.accessSource === 'access-key') {
      planExpiry.textContent = t('plansPage.expKey', 'Acceso por clave · sin suscripción');
    } else if (product.plan === 'beta') {
      planExpiry.textContent = t('plansPage.expBeta', 'Acceso beta · sin suscripción verificada');
    } else if (product.plan === 'pro' || product.plan === 'promax') {
      planExpiry.textContent = '';
      planExpiry.hidden = true;
    } else {
      planExpiry.textContent = t('plansPage.expNone', 'Sin suscripción verificada');
    }
  }

  const activeTierKey = product.plan === 'beta' ? 'promax' : (product.plan || 'free');
  document.querySelectorAll('.plan-card[data-plan-card]').forEach((card) => {
    const isCurrent = card.dataset.planCard === activeTierKey;
    card.classList.toggle('is-current', isCurrent);
    const badge = card.querySelector('.plan-current-badge');
    if (badge) badge.hidden = !isCurrent;
  });

  renderFeatureList(freeFeatures, features.filter((feature) => feature.plan === 'free'));
  renderFeatureList(proFeatures, features.filter((feature) => feature.plan === 'pro'));
  renderFeatureList(proMaxFeatures, features.filter((feature) => feature.plan === 'promax'));

  postMatchInput.disabled = !product.featureAccess.postMatch;
  civHelpInput.disabled = !product.featureAccess.civHelp;
  tgBalanceInput.disabled = !product.featureAccess.tgBalance;
  if (smurfDetectorInput) smurfDetectorInput.disabled = !product.featureAccess.smurfDetector;
  postMatchComparisonInput.disabled = !proAccess;
  paintPostmatchReference();
  postMatchReplayInput.disabled = !replayAccess;
  smartBuildOrderInput.disabled = !product.featureAccess.smartBuildOrder;
  postMatchInput.title = product.featureAccess.postMatch ? '' : t('postmatchPage.availableProMax', 'Disponible con Ultra.');
  postMatchComparisonInput.title = proAccess ? '' : t('postmatchPage.availableProMax', 'Disponible con Ultra.');
  postMatchReplayInput.title = replayAccess ? '' : t('postmatchPage.availableProMax', 'Disponible con Ultra.');
  scoutF2Input.closest('.row').hidden = true;
  scoutF2Input.disabled = true;
  const gatedInputs = [
    ...Object.entries(rivalInputs),
    ['civHelp', civHelpInput],
    ['tgBalance', tgBalanceInput],
    ['smurfDetector', smurfDetectorInput],
    ['smartBuildOrder', smartBuildOrderInput],
    ['postMatch', postMatchInput],
    ['postMatch', postMatchPopupInput],
    ['postMatchComparison', postMatchComparisonInput],
    ['postMatchReplay', postMatchReplayInput],
  ];
  for (const [key, input] of gatedInputs) {
    if (!input) continue;
    const allowed = product.featureAccess && product.featureAccess[key] === true;
    input.disabled = !allowed;
    const tier = features.find((feature) => feature.key === key)?.plan;
    const tierName = tier === 'promax' ? 'Ultra' : 'Pro';
    input.title = allowed ? '' : t('plansPage.availableWith', `Disponible con ${tierName}. Tu preferencia guardada se conserva.`, { tier: tierName });
    const row = input.closest('.row');
    if (row) {
      row.classList.toggle('feature-locked', !allowed);
      row.dataset.tier = tierName.toUpperCase();
    }
  }
  paintPostMatchPopupHide(Number(postMatchHideInput?.value ?? 60));

  const commerce = product.commerce || {};
  if (commerceStatus) {
    commerceStatus.textContent = commerce.configured
      ? t('plansPage.subsConfigured', 'La suscripción se gestiona en el sitio del producto.')
      : t('plansPage.subsStatus', 'La contratación todavía no está habilitada.');
  }
  if (commerceTitle) commerceTitle.textContent = t('plansPage.subsTitle', 'Suscripciones');
  if (accountCommerce) accountCommerce.disabled = !(commerce.account && commerce.account.enabled);
  if (checkoutCommerce) checkoutCommerce.disabled = !(commerce.checkout && commerce.checkout.enabled);
}

function getEmptyPostmatchHtml() {
  const tpl = el('emptyPostmatchState');
  return tpl ? tpl.innerHTML : '';
}
if (postMatchReportEl) postMatchReportEl.innerHTML = getEmptyPostmatchHtml();

let lastPostMatchPayload = null;
let lastRecentMatches = [];
let selectedPostMatchId = null;

function applyDataWidths(container) {
  if (!container) return;
  const apply = () => {
    container.querySelectorAll('[data-w]').forEach((bar) => {
      const width = Math.max(0, Math.min(100, Number(bar.dataset.w) || 0));
      bar.style.width = `${width}%`;
    });
    container.querySelectorAll('[data-h]').forEach((bar) => {
      const height = Math.max(0, Math.min(100, Number(bar.dataset.h) || 0));
      bar.style.height = `${height}%`;
    });
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(apply));
  } else {
    apply();
  }
}

function bindRecentMatchClicks(container, { jumpToPostmatch = false } = {}) {
  if (!container) return;
  container.querySelectorAll('.rm-card[data-match-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = btn.dataset.matchId;
      if (!matchId) return;
      if (jumpToPostmatch && activePage !== 'postmatch') {
        goTo('postmatch');
      }
      await selectPostMatchById(matchId);
    });
  });
}

function scrollToPostMatchReport() {
  if (!postMatchReportEl) return;
  postMatchReportEl.classList.remove('is-revealing');
  void postMatchReportEl.offsetWidth;
  postMatchReportEl.classList.add('is-revealing');
  requestAnimationFrame(() => {
    postMatchReportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function selectPostMatchById(matchId) {
  if (!matchId || !window.settings?.postmatchSelect) return;
  selectedPostMatchId = String(matchId);
  if (postMatchRecentStripEl && typeof TacticalUI === 'object' && TacticalUI.renderRecentMatchesList) {
    postMatchRecentStripEl.innerHTML = TacticalUI.renderRecentMatchesList(lastRecentMatches, {
      selectedMatchId: selectedPostMatchId,
      limit: 10,
      mode: 'postmatch',
    });
    bindRecentMatchClicks(postMatchRecentStripEl, { jumpToPostmatch: false });
  }
  scrollToPostMatchReport();
  setStatus(t('postmatchPage.loadingMatchStatus', `Cargando informe de la partida #${matchId}…`, { id: matchId }));
  try {
    const res = await window.settings.postmatchSelect(matchId);
    if (!res?.ok) {
      setStatus(res?.error || t('postmatchPage.drawError', 'No se pudo cargar el informe.'), true);
      return;
    }
    paintPostMatch(res);
    scrollToPostMatchReport();
    setStatus(t('postmatchPage.updatedStatus', 'Informe postmatch actualizado.'));
  } catch (err) {
    setStatus(err?.message || t('postmatchPage.drawError', 'No se pudo cargar el informe.'), true);
  }
}

function paintPostMatch(payload) {
  lastPostMatchPayload = payload;
  const report = payload && Object.hasOwn(payload, 'report') ? payload.report : payload;
  if (payload && payload.access) postMatchAccess = payload.access;
  if (payload && payload.product) renderProduct(payload.product);
  if (payload && Array.isArray(payload.recentMatches)) {
    lastRecentMatches = payload.recentMatches;
  }
  if (payload && payload.selectedMatchId) {
    selectedPostMatchId = String(payload.selectedMatchId);
  } else if (report && report.matchId) {
    selectedPostMatchId = String(report.matchId);
  }
  if (postMatchRecentStripEl && typeof TacticalUI === 'object' && TacticalUI.renderRecentMatchesList) {
    postMatchRecentStripEl.innerHTML = TacticalUI.renderRecentMatchesList(lastRecentMatches, {
      selectedMatchId: selectedPostMatchId,
      limit: 10,
      mode: 'postmatch',
    });
    bindRecentMatchClicks(postMatchRecentStripEl, { jumpToPostmatch: false });
  }
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
  applyDataWidths(postMatchReportEl);
  bindPostMatchTabs(postMatchReportEl);
}

function smartScrollAndPulse(targetEl, { alwaysScroll = false } = {}) {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const inView = rect.top >= 72 && rect.bottom <= (window.innerHeight - 24);
  if (alwaysScroll || !inView) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  targetEl.classList.remove('cx-pulse-highlight');
  void targetEl.offsetWidth;
  targetEl.classList.add('cx-pulse-highlight');
  setTimeout(() => targetEl.classList.remove('cx-pulse-highlight'), 1200);
}

function bindPostMatchTabs(container) {
  if (!container) return;
  const tabs = [...container.querySelectorAll('[data-pm-tab]')];
  const panes = [...container.querySelectorAll('[data-pm-pane]')];
  const activateTab = (target) => {
    if (!target || !tabs.length || !panes.length) return;
    tabs.forEach((b) => {
      const on = b.dataset.pmTab === target;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    panes.forEach((pane) => {
      pane.classList.toggle('is-active', pane.dataset.pmPane === target);
    });
    applyDataWidths(container);
  };
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.pmTab));
  });

  // Smart Auto-Scroll en Postmatch: tocar etapa, hallazgo o KPI lleva directo al detalle y pestaña correspondiente
  container.querySelectorAll('[data-pm-jump-tab], [data-scroll-target]').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select')) return;
      const tab = card.dataset.pmJumpTab;
      if (tab) activateTab(tab);
      const sel = card.dataset.scrollTarget;
      const dest = sel ? container.querySelector(sel) : container.querySelector('.pm-deep-dive');
      if (dest) smartScrollAndPulse(dest);
    });
  });
}

async function loadPostMatch() {
  try {
    paintPostMatch(await window.settings.postmatchGet());
  } catch {
    postMatchReportEl.innerHTML = getEmptyPostmatchHtml();
  }
}

let lastCentralPayload = null;
let centralBusy = false;
let centralRequest = 0;
let centralActiveModeId = null;
let centralEloRange = '30';
let centralCivSort = 'games';
let centralMapSort = 'games';
let centralLmWindow = 10;
let centralSelectedCivSlug = null;
let centralCivFilter = '';
let centralDiagTab = 'maps';
let centralViewedProfile = null; // null => perfil propio; { profileId, alias } => perfil buscado
let centralSearchTimer = null;
let centralSearchToken = 0;
let centralSearchHits = [];
let centralSearchActiveIdx = -1;

function syncCentralViewingBanner(payload) {
  if (!centralViewingBarEl) return;
  const viewingOther = Boolean(centralViewedProfile) || Boolean(payload && payload.ok && payload.isOwnProfile === false);
  centralViewingBarEl.hidden = !viewingOther;
  if (viewingOther) {
    const shownId = payload?.profileId || centralViewedProfile?.profileId || '';
    const shownAlias = payload?.alias || centralViewedProfile?.alias || (shownId ? `Perfil #${shownId}` : 'Perfil');
    if (centralViewingNameEl) {
      centralViewingNameEl.textContent = shownAlias;
    }
    if (centralViewingMetaEl) {
      const bits = shownId ? [`#${shownId}`] : [];
      if (payload?.totalProfileGames) bits.push(`${payload.totalProfileGames} ${t('central.matchesUnit', 'partidas')}`);
      bits.push(t('central.ownDataIntact', 'Tus datos propios siguen intactos'));
      centralViewingMetaEl.textContent = bits.join(' · ');
    }
    if (centralBackBtn) {
      const ownLabel = lastLoadedInfo?.alias ? ` (${lastLoadedInfo.alias})` : '';
      centralBackBtn.textContent = `${t('central.backToOwn', '← Volver a mi perfil')}${ownLabel}`;
    }
  }
}

function bindInteractiveEloChart() {
  if (!centralDashboardEl) return;
  const stage = centralDashboardEl.querySelector('.cx-chart-stage[data-chart-points]');
  if (!stage) return;
  let pts = [];
  try { pts = JSON.parse(stage.dataset.chartPoints || '[]'); } catch { return; }
  if (!pts.length) return;

  const svg = stage.querySelector('.cx-chart-svg');
  const hoverLine = stage.querySelector('.cx-hover-line');
  const hoverRing = stage.querySelector('.cx-hover-ring');
  const hoverDot = stage.querySelector('.cx-hover-dot');
  const tooltip = stage.querySelector('.cx-tooltip');
  const ttElo = stage.querySelector('.cx-tt-elo');
  const ttDiff = stage.querySelector('.cx-tt-diff');
  const ttDate = stage.querySelector('.cx-tt-date');
  if (!svg || !tooltip) return;

  const hideHover = () => {
    if (hoverLine) hoverLine.setAttribute('opacity', '0');
    if (hoverRing) hoverRing.setAttribute('opacity', '0');
    if (hoverDot) hoverDot.setAttribute('opacity', '0');
    tooltip.hidden = true;
  };

  let activePoint = pts.length - 1;
  let hoverVisible = false;
  let cachedMatrix = null;
  let cachedInvMatrix = null;
  let cachedRect = null;
  let hoverRaf = 0;
  let pendingClientX = 0;
  let pendingClientY = 0;

  const invalidateGeom = () => {
    cachedMatrix = null;
    cachedInvMatrix = null;
    cachedRect = null;
  };
  const ensureGeom = () => {
    if (!cachedMatrix || !cachedRect) {
      const m = svg.getScreenCTM();
      if (!m) return false;
      cachedMatrix = m;
      try { cachedInvMatrix = m.inverse(); } catch { cachedInvMatrix = null; }
      cachedRect = stage.getBoundingClientRect();
    }
    return Boolean(cachedMatrix && cachedRect);
  };
  window.addEventListener('resize', invalidateGeom, { passive: true });

  function showPoint(index) {
    if (hoverVisible && index === activePoint) return;
    activePoint = index;
    hoverVisible = true;
    const nearest = pts[index];
    if (hoverLine) {
      hoverLine.setAttribute('x1', String(nearest.x));
      hoverLine.setAttribute('x2', String(nearest.x));
      hoverLine.setAttribute('opacity', '1');
    }
    if (hoverRing) {
      hoverRing.setAttribute('cx', String(nearest.x));
      hoverRing.setAttribute('cy', String(nearest.y));
      hoverRing.setAttribute('opacity', '1');
    }
    if (hoverDot) {
      hoverDot.setAttribute('cx', String(nearest.x));
      hoverDot.setAttribute('cy', String(nearest.y));
      hoverDot.setAttribute('opacity', '1');
    }
    if (ttElo) ttElo.textContent = `${nearest.rating} ELO`;
    if (ttDiff) {
      const diff = Number(nearest.diff);
      if (Number.isFinite(diff) && diff !== 0) {
        ttDiff.textContent = `${diff > 0 ? '+' : ''}${diff}`;
        ttDiff.className = `cx-tt-diff ${diff > 0 ? 'win' : 'loss'}`;
      } else {
        ttDiff.textContent = '';
        ttDiff.className = 'cx-tt-diff';
      }
    }
    if (ttDate) {
      const outcome = nearest.won === true ? 'Victoria' : nearest.won === false ? 'Derrota' : '';
      ttDate.textContent = [outcome, nearest.date].filter(Boolean).join(' · ');
    }
    tooltip.hidden = false;
    if (ensureGeom()) {
      const point = new DOMPoint(nearest.x, nearest.y).matrixTransform(cachedMatrix);
      const ttW = tooltip.offsetWidth || 120;
      const ttH = tooltip.offsetHeight || 42;
      const left = Math.max(0, Math.min(cachedRect.width - ttW, point.x - cachedRect.left - ttW / 2));
      const top = Math.max(0, point.y - cachedRect.top - ttH - 12);
      tooltip.style.left = '0px';
      tooltip.style.top = '0px';
      tooltip.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    }
    if (document.activeElement === stage) {
      stage.setAttribute('aria-label', `${nearest.rating} ELO · ${ttDate?.textContent || nearest.date}. Flechas para recorrer partidas.`);
    }
  }

  stage.addEventListener('mouseenter', invalidateGeom, { passive: true });
  stage.addEventListener('mousemove', (event) => {
    pendingClientX = event.clientX;
    pendingClientY = event.clientY;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (!ensureGeom() || !cachedInvMatrix) return;
      const relX = new DOMPoint(pendingClientX, pendingClientY).matrixTransform(cachedInvMatrix).x;
      let nearest = 0;
      let bestDist = Math.abs(pts[0].x - relX);
      for (let i = 1; i < pts.length; i += 1) {
        const d = Math.abs(pts[i].x - relX);
        if (d < bestDist) { bestDist = d; nearest = i; }
      }
      showPoint(nearest);
    });
  }, { passive: true });

  stage.addEventListener('focus', () => { invalidateGeom(); showPoint(activePoint); });
  stage.addEventListener('blur', () => { hoverVisible = false; hideHover(); });
  stage.addEventListener('mouseleave', () => {
    if (hoverRaf) { cancelAnimationFrame(hoverRaf); hoverRaf = 0; }
    if (document.activeElement !== stage) { hoverVisible = false; hideHover(); }
  });
  stage.addEventListener('keydown', (event) => {
    const index = { ArrowLeft: activePoint - 1, ArrowRight: activePoint + 1, Home: 0, End: pts.length - 1 }[event.key];
    if (index == null) return;
    event.preventDefault();
    showPoint(Math.max(0, Math.min(pts.length - 1, index)));
  });
}

function bindCentralInteractions() {
  if (!centralDashboardEl) return;
  centralDashboardEl.querySelectorAll('[data-central-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextMode = btn.dataset.centralMode;
      if (!nextMode || nextMode === centralActiveModeId) return;
      centralActiveModeId = nextMode;
      if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
    });
  });

  centralDashboardEl.querySelectorAll('[data-elo-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextRange = btn.dataset.eloRange;
      if (!nextRange || nextRange === centralEloRange) return;
      centralEloRange = nextRange;
      if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
    });
  });

  centralDashboardEl.querySelectorAll('[data-civ-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextSort = btn.dataset.civSort;
      if (!nextSort || nextSort === centralCivSort) return;
      centralCivSort = nextSort;
      if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
    });
  });

  centralDashboardEl.querySelectorAll('[data-map-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextSort = btn.dataset.mapSort;
      if (!nextSort || nextSort === centralMapSort) return;
      centralMapSort = nextSort;
      if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
    });
  });

  centralDashboardEl.querySelectorAll('[data-lm-window]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextWin = Number(btn.dataset.lmWindow) === 20 ? 20 : 10;
      if (nextWin === centralLmWindow) return;
      centralLmWindow = nextWin;
      if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
    });
  });

  centralDashboardEl.querySelectorAll('[data-diag-civ]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.diagCiv;
      if (!slug) return;
      centralSelectedCivSlug = slug;
      if (lastCentralPayload) {
        paintCentral(lastCentralPayload, { preserveMode: true });
        const panel = centralDashboardEl.querySelector('#cxCivDiagPanel');
        if (panel) smartScrollAndPulse(panel);
      }
    });
  });

  centralDashboardEl.querySelectorAll('[data-diag-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTab = btn.dataset.diagTab;
      if (!nextTab || nextTab === centralDiagTab) return;
      centralDiagTab = nextTab;
      if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
    });
  });

  const civFilterInput = centralDashboardEl.querySelector('#cxCivFilterInput');
  if (civFilterInput) {
    let civFilterTimer = null;
    const applyCivFilter = () => {
      clearTimeout(civFilterTimer);
      civFilterTimer = null;
      const pos = civFilterInput.selectionStart;
      centralCivFilter = civFilterInput.value;
      if (lastCentralPayload) {
        paintCentral(lastCentralPayload, { preserveMode: true });
        const fresh = centralDashboardEl.querySelector('#cxCivFilterInput');
        if (fresh) {
          fresh.focus({ preventScroll: true });
          if (pos != null) fresh.setSelectionRange(pos, pos);
        }
      }
    };
    civFilterInput.addEventListener('input', (event) => {
      if (event.isComposing) return;
      clearTimeout(civFilterTimer);
      civFilterTimer = setTimeout(applyCivFilter, 100);
    });
    civFilterInput.addEventListener('compositionend', applyCivFilter);
  }

  centralDashboardEl.querySelectorAll('[data-goto-plan]').forEach((btn) => {
    btn.addEventListener('click', () => goTo('plans'));
  });

  centralDashboardEl.querySelectorAll('[data-scroll-target]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (trigger.dataset.scrollMapEapm === '1' && centralMapSort !== 'eapm') {
        centralMapSort = 'eapm';
        if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
      }
      const sel = trigger.dataset.scrollTarget;
      const dest = sel ? centralDashboardEl.querySelector(sel) : null;
      if (dest) smartScrollAndPulse(dest);
    });
  });

  centralDashboardEl.querySelectorAll('[data-scout-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = Number(btn.dataset.scoutProfile);
      const name = btn.dataset.scoutName || null;
      if (!Number.isFinite(pid) || pid <= 0) return;
      openCentralProfile({ profileId: pid, alias: name });
    });
  });

  bindInteractiveEloChart();
}

function paintCentral(payload, { preserveMode = false, animateSwap = false } = {}) {
  const prevPid = lastCentralPayload?.profileId;
  lastCentralPayload = payload;
  if (payload && payload.isOwnProfile !== false && Array.isArray(payload.recentMatches) && payload.recentMatches.length) {
    lastRecentMatches = payload.recentMatches;
  }
  if (!preserveMode || Number(prevPid) !== Number(payload?.profileId)) {
    centralActiveModeId = payload?.defaultModeId || 'rm_1v1';
    centralEloRange = '30';
    centralCivSort = 'games';
    centralMapSort = 'games';
    centralSelectedCivSlug = null;
    centralCivFilter = '';
    centralDiagTab = 'maps';
  }
  syncCentralViewingBanner(payload);
  if (!centralDashboardEl || typeof TacticalUI !== 'object' || !TacticalUI.renderCentralDashboard) return;
  const selectorNames = ['data-central-mode', 'data-elo-range', 'data-civ-sort', 'data-map-sort', 'data-lm-window', 'data-diag-tab'];
  const active = document.activeElement;
  const focusAttribute = preserveMode && centralDashboardEl.contains(active)
    ? selectorNames.find((name) => active.hasAttribute(name)) : null;
  const focusValue = focusAttribute ? active.getAttribute(focusAttribute) : null;
  const currentIsUltra = currentProduct
    ? (currentProduct.plan === 'promax' || currentProduct.plan === 'beta')
    : (payload?.isUltra === true);
  centralDashboardEl.innerHTML = TacticalUI.renderCentralDashboard(payload, {
    activeModeId: centralActiveModeId,
    eloRange: centralEloRange,
    civSort: centralCivSort,
    mapSort: centralMapSort,
    lmWindow: centralLmWindow,
    selectedCivSlug: centralSelectedCivSlug,
    civFilter: centralCivFilter,
    diagTab: centralDiagTab,
    isUltra: currentIsUltra,
  });
  if (animateSwap || Number(prevPid) !== Number(payload?.profileId)) {
    centralDashboardEl.classList.remove('cx-swap');
    void centralDashboardEl.offsetWidth;
    centralDashboardEl.classList.add('cx-swap');
  }
  applyDataWidths(centralDashboardEl);
  bindCentralInteractions();
  if (focusAttribute) {
    centralDashboardEl.querySelector(`[${focusAttribute}="${CSS.escape(focusValue)}"]`)?.focus({ preventScroll: true });
  }
  bindRecentMatchClicks(centralDashboardEl, { jumpToPostmatch: true });
}

function setCentralSearchLoading(on, { disableButton = false } = {}) {
  centralSearchShellEl?.classList.toggle('is-searching', Boolean(on));
  if (centralSearchBtn) centralSearchBtn.disabled = Boolean(on && disableButton);
}

function closeCentralSearchDropdown() {
  clearTimeout(centralSearchTimer);
  centralSearchToken += 1;
  setCentralSearchLoading(false);
  if (centralSearchResultsEl) {
    centralSearchResultsEl.replaceChildren();
    centralSearchResultsEl.hidden = true;
  }
  centralSearchHits = [];
  centralSearchActiveIdx = -1;
}

function renderCentralSearchFeedback({ kind = 'loading', text = '', query = '' } = {}) {
  if (!centralSearchResultsEl) return;
  centralSearchResultsEl.replaceChildren();
  centralSearchResultsEl.hidden = false;
  const row = document.createElement('div');
  row.className = `central-search-feedback is-${kind}`;
  if (kind === 'loading') {
    row.innerHTML = `<span class="search-spinner is-inline" aria-hidden="true"></span><span>${escapeHtml(text || `Buscando "${query}"…`)}</span>`;
  } else if (kind === 'error') {
    const msg = document.createElement('span');
    msg.textContent = text || 'No se pudo consultar AoE2 Companion.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'link-btn';
    retry.textContent = 'Reintentar';
    retry.addEventListener('click', () => executeCentralSearch(query));
    row.append(msg, retry);
  } else {
    row.textContent = text || `Sin resultados para "${query}". Probá otro nombre o pegá el #ID.`;
  }
  centralSearchResultsEl.append(row);
}

function renderCentralSearchResults() {
  if (!centralSearchResultsEl) return;
  centralSearchResultsEl.replaceChildren();
  if (!centralSearchHits.length) {
    centralSearchResultsEl.hidden = true;
    return;
  }
  centralSearchResultsEl.hidden = false;
  centralSearchHits.forEach((profile, idx) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `result central-search-row${idx === centralSearchActiveIdx ? ' active' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(idx === centralSearchActiveIdx));

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

    const action = document.createElement('span');
    action.className = 'central-search-go';
    action.textContent = 'Ver perfil →';

    row.append(avatar, copy, action);
    row.addEventListener('click', () => {
      const displayName = profile.clan ? `${profile.clan} | ${profile.name}` : profile.name;
      openCentralProfile({ profileId: profile.profileId, alias: displayName });
    });
    centralSearchResultsEl.append(row);
  });
}

async function executeCentralSearch(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) return;
  const token = ++centralSearchToken;
  setCentralSearchLoading(true, { disableButton: true });
  if (centralSearchStateEl) centralSearchStateEl.textContent = 'Buscando…';
  renderCentralSearchFeedback({ kind: 'loading', query });
  try {
    const response = await window.settings.search(query);
    if (token !== centralSearchToken) return;
    setCentralSearchLoading(false);
    if (!response?.ok) {
      centralSearchHits = [];
      centralSearchActiveIdx = -1;
      if (centralSearchStateEl) centralSearchStateEl.textContent = 'Error';
      renderCentralSearchFeedback({ kind: 'error', text: response?.error || 'Error de red al buscar.', query });
      return;
    }
    const list = Array.isArray(response.results) ? response.results.slice(0, 8) : [];
    if (!list.length) {
      centralSearchHits = [];
      centralSearchActiveIdx = -1;
      if (centralSearchStateEl) centralSearchStateEl.textContent = '0 resultados';
      renderCentralSearchFeedback({ kind: 'empty', query });
      return;
    }
    centralSearchHits = list;
    centralSearchActiveIdx = 0;
    if (centralSearchStateEl) centralSearchStateEl.textContent = `${centralSearchHits.length} ${centralSearchHits.length === 1 ? 'jugador' : 'jugadores'}`;
    renderCentralSearchResults();
  } catch (err) {
    if (token !== centralSearchToken) return;
    setCentralSearchLoading(false);
    centralSearchHits = [];
    centralSearchActiveIdx = -1;
    if (centralSearchStateEl) centralSearchStateEl.textContent = 'Error';
    renderCentralSearchFeedback({ kind: 'error', text: err?.message || 'Error de conexión.', query });
  }
}

async function openCentralProfile(target) {
  clearTimeout(centralSearchTimer);
  centralSearchToken += 1;
  setCentralSearchLoading(false);
  closeCentralSearchDropdown();
  if (centralSearchInput) centralSearchInput.value = '';
  if (centralSearchStateEl) centralSearchStateEl.textContent = '';
  if (centralSearchClearBtn) centralSearchClearBtn.hidden = true;

  if (!target || Number(target.profileId) === Number(currentProfileId)) {
    centralViewedProfile = null;
  } else {
    centralViewedProfile = { profileId: Number(target.profileId), alias: target.alias || null };
  }
  const scrollHost = document.querySelector('.pages');
  if (scrollHost) scrollHost.scrollTo({ top: 0, behavior: 'smooth' });
  await loadCentral(false, { animateSwap: true });
}

async function runCentralSearchNow() {
  if (!centralSearchInput) return;
  clearTimeout(centralSearchTimer);
  const query = centralSearchInput.value.trim();
  if (!query) return;
  const numeric = parseNumeric(query);
  if (numeric) {
    openCentralProfile({ profileId: Number(numeric), alias: null });
    return;
  }
  if (centralSearchHits.length && centralSearchActiveIdx >= 0 && centralSearchHits[centralSearchActiveIdx]) {
    const picked = centralSearchHits[centralSearchActiveIdx];
    const displayName = picked.clan ? `${picked.clan} | ${picked.name}` : picked.name;
    openCentralProfile({ profileId: picked.profileId, alias: displayName });
    return;
  }
  if (query.length < 2) return;
  await executeCentralSearch(query);
}

let centralLoadedAt = 0;
let centralLoadedPid = null;

async function loadCentral(force = false, { animateSwap = false } = {}) {
  if (!window.settings?.centralGet || (centralBusy && !animateSwap)) return;
  const targetPid = centralViewedProfile?.profileId ?? currentProfileId ?? null;
  const targetAlias = centralViewedProfile?.alias || lastLoadedInfo?.alias || null;
  // Si ya tenemos datos frescos (< 15s) para este mismo perfil y no es refresh forzado, cambio de pestaña en <1ms.
  if (
    !force &&
    !animateSwap &&
    lastCentralPayload?.ok &&
    !lastCentralPayload.stale &&
    Number(centralLoadedPid) === Number(targetPid) &&
    Date.now() - centralLoadedAt < 15000
  ) {
    return;
  }
  const request = ++centralRequest;
  centralBusy = true;
  if (refreshCentralBtn) refreshCentralBtn.disabled = true;
  const reqOpts = centralViewedProfile
    ? { profileId: centralViewedProfile.profileId, alias: centralViewedProfile.alias, force: Boolean(force) }
    : { force: Boolean(force) };
  // Mostrar siempre el nombre del jugador + skeleton instantáneo a t=0ms (nunca pantalla vacía).
  const hasSameProfileOnScreen = Boolean(
    lastCentralPayload?.ok &&
    targetPid != null &&
    Number(lastCentralPayload.profileId) === Number(targetPid),
  );
  if (!hasSameProfileOnScreen && centralDashboardEl && typeof TacticalUI === 'object' && TacticalUI.renderCentralSkeleton) {
    centralDashboardEl.innerHTML = TacticalUI.renderCentralSkeleton({
      alias: targetAlias,
      profileId: targetPid,
      isExternal: Boolean(centralViewedProfile),
    });
  } else if (animateSwap && centralDashboardEl) {
    centralDashboardEl.classList.add('is-loading');
  }
  if (centralViewedProfile) {
    setStatus(`Cargando perfil de ${centralViewedProfile.alias || `#${centralViewedProfile.profileId}`}…`);
  }
  try {
    const res = await window.settings.centralGet(reqOpts);
    if (request !== centralRequest) return;
    if (res?.ok) {
      centralLoadedAt = Date.now();
      centralLoadedPid = res.profileId ?? targetPid;
    }
    paintCentral(res, { animateSwap });
    if (res?.ok && centralViewedProfile) {
      setStatus(`Explorando perfil: ${res.alias || `#${res.profileId}`}`);
    } else if (res?.ok && animateSwap) {
      setStatus(`De vuelta en tu perfil: ${res.alias || `#${res.profileId}`}`);
    }
  } catch (err) {
    if (request === centralRequest) paintCentral({ ok: false, error: err?.message });
  } finally {
    if (request === centralRequest) {
      centralBusy = false;
      if (centralDashboardEl) centralDashboardEl.classList.remove('is-loading');
      if (refreshCentralBtn) refreshCentralBtn.disabled = false;
    }
  }
}

centralBackBtn?.addEventListener('click', () => openCentralProfile(null));
centralSearchBtn?.addEventListener('click', () => runCentralSearchNow());

centralSearchClearBtn?.addEventListener('click', () => {
  clearTimeout(centralSearchTimer);
  centralSearchToken += 1;
  setCentralSearchLoading(false);
  if (centralSearchInput) centralSearchInput.value = '';
  if (centralSearchStateEl) centralSearchStateEl.textContent = '';
  centralSearchClearBtn.hidden = true;
  closeCentralSearchDropdown();
});

centralSearchInput?.addEventListener('input', () => {
  const query = centralSearchInput.value.trim();
  clearTimeout(centralSearchTimer);
  if (centralSearchClearBtn) centralSearchClearBtn.hidden = !query;
  if (query.length < 2) {
    centralSearchToken += 1;
    setCentralSearchLoading(false);
    if (centralSearchStateEl) centralSearchStateEl.textContent = '';
    closeCentralSearchDropdown();
    return;
  }
  const numeric = parseNumeric(query);
  if (numeric) {
    centralSearchToken += 1;
    setCentralSearchLoading(false);
    if (centralSearchStateEl) centralSearchStateEl.textContent = 'Enter para abrir ID';
    closeCentralSearchDropdown();
    return;
  }
  centralSearchHits = [];
  centralSearchActiveIdx = -1;
  if (centralSearchStateEl) centralSearchStateEl.textContent = 'Buscando…';
  setCentralSearchLoading(true);
  renderCentralSearchFeedback({ kind: 'loading', query });
  centralSearchTimer = setTimeout(() => executeCentralSearch(query), 240);
});

centralSearchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (centralSearchResultsEl && !centralSearchResultsEl.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeCentralSearchDropdown();
      if (centralSearchStateEl) centralSearchStateEl.textContent = '';
    }
    return;
  }
  if (event.key === 'ArrowDown') {
    if (!centralSearchHits.length) return;
    event.preventDefault();
    centralSearchActiveIdx = (centralSearchActiveIdx + 1) % centralSearchHits.length;
    renderCentralSearchResults();
    return;
  }
  if (event.key === 'ArrowUp') {
    if (!centralSearchHits.length) return;
    event.preventDefault();
    centralSearchActiveIdx = (centralSearchActiveIdx - 1 + centralSearchHits.length) % centralSearchHits.length;
    renderCentralSearchResults();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    runCentralSearchNow();
  }
});

document.addEventListener('click', (event) => {
  if (!centralSearchResultsEl || centralSearchResultsEl.hidden) return;
  if (!event.target.closest('.central-search-wrap')) {
    closeCentralSearchDropdown();
  }
});

refreshCentralBtn?.addEventListener('click', () => loadCentral(true));
goToCentralBtn?.addEventListener('click', () => goTo('central'));

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
  if (matchClock) matchClock.textContent = clockText(matchStartedAt);
  const clockRow = el('matchClockRow');
  if (clockRow) clockRow.hidden = !matchStartedAt;
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
  if (document.hidden || activePage !== 'player') return;
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
hideEloInput.addEventListener('change', async () => {
  await applyToggle(hideEloInput, (on) => window.settings.hideEloAt20(on), hideEloName.textContent || 'Ocultar Overlay');
  paintHideAt(Number(hideAtInput.value) || 20);
});

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
smurfDetectorInput?.addEventListener('change', () =>
  applyToggle(smurfDetectorInput, (on) => window.settings.smurfDetector(on), 'Smurf Detector'),
);
hideWhenMinimizedInput?.addEventListener('change', () =>
  applyToggle(
    hideWhenMinimizedInput,
    (on) => window.settings.hideWhenMinimized(on),
    t('skins.hideMinimizedTitle', 'Ocultar si AoE2 está minimizado'),
  ),
);

// Resumen con F2: el atajo y la vista compacta son opt-in. Al apagarlo se
// libera la tecla (deja de ser global) y el panel vuelve al informe completo.
scoutF2Input.addEventListener('change', () =>
  applyToggle(scoutF2Input, (on) => window.settings.scoutF2(on), 'Resumen con F2'),
);

function paintPostMatchPopupHide(seconds) {
  const secs = Number(seconds);
  const clean = Number.isFinite(secs) ? (secs <= 0 ? 0 : Math.min(180, Math.max(10, Math.round(secs)))) : 60;
  if (postMatchHideInput) {
    postMatchHideInput.value = String(clean);
    postMatchHideInput.style.setProperty('--fill', `${(clean / 180) * 100}%`);
  }
  if (postMatchHideValue) {
    postMatchHideValue.textContent = clean <= 0
      ? t('postmatchPage.hideManual', 'Manual')
      : clockShort(clean);
  }
  const allowed = !currentProduct || Boolean(currentProduct.featureAccess?.postMatch);
  const masterOn = !postMatchInput || Boolean(postMatchInput.checked);
  if (postMatchPopupInput) {
    postMatchPopupInput.disabled = !(allowed && masterOn);
    const popupRow = postMatchPopupInput.closest('.row');
    if (popupRow) popupRow.classList.toggle('is-disabled', allowed && !masterOn);
  }
  if (postMatchHideRow && postMatchPopupInput) {
    const enabled = allowed && masterOn && Boolean(postMatchPopupInput.checked);
    postMatchHideRow.classList.toggle('is-disabled', !enabled);
    if (postMatchHideInput) postMatchHideInput.disabled = !enabled;
  }
}

// Postmatch: resultado Free; comparación y replay se validan en main.
for (const [key, input, label] of [
  ['postMatch', postMatchInput, 'Resumen postmatch'],
  ['postMatchPopup', postMatchPopupInput, 'Popup postmatch'],
  ['postMatchComparison', postMatchComparisonInput, 'Comparar mi evolución'],
  ['postMatchReplay', postMatchReplayInput, 'Análisis del replay y APM'],
]) {
  if (!input) continue;
  input.addEventListener('change', async () => {
    try {
      await applyToggle(input, (on) => window.settings.postMatchOption(key, on), label);
    } catch (error) {
      input.checked = !input.checked;
      setStatus(error.message || 'No se pudo actualizar la opción.', true);
    }
    if (input === postMatchComparisonInput) paintPostmatchReference();
    if (input === postMatchPopupInput || input === postMatchInput) {
      paintPostMatchPopupHide(Number(postMatchHideInput?.value ?? 60));
    }
  });
}
if (postMatchHideInput) {
  postMatchHideInput.addEventListener('input', () => {
    const value = Number(postMatchHideInput.value);
    paintPostMatchPopupHide(value);
    clearTimeout(postMatchHideTimer);
    postMatchHideTimer = setTimeout(async () => {
      const result = await window.settings.postMatchOption('postMatchHideSeconds', value);
      if (!result?.ok) {
        setStatus(result?.error || 'No se pudo guardar el tiempo del popup.', true);
        return;
      }
      paintPostMatchPopupHide(result.value);
      setStatus(result.value > 0
        ? t('postmatchPage.hideSaved', `Popup postmatch: se oculta a los ${result.value}s`, { s: result.value })
        : t('postmatchPage.hideManualSaved', 'Popup postmatch: visible hasta la próxima partida'));
    }, 120);
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
window.settings.onCentral?.((payload) => {
  if (!payload || !payload.ok) return;
  const visibleId = centralViewedProfile?.profileId ?? currentProfileId;
  if (visibleId ? Number(payload.profileId) !== Number(visibleId) : payload.isOwnProfile === false) return;
  centralLoadedAt = Date.now();
  centralLoadedPid = payload.profileId ?? visibleId;
  paintCentral(payload, { preserveMode: true });
});
window.settings.onProduct((product) => {
  renderProduct(product);
  loadTactics();
  if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
});
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


accountCommerce?.addEventListener('click', async () => {
  const response = await window.settings.openCommerce('account');
  if (!response.ok) setStatus(response.error || 'No se pudo abrir la gestión de cuenta', true);
});

checkoutCommerce?.addEventListener('click', async () => {
  const response = await window.settings.openCommerce('checkout');
  if (!response.ok) setStatus(response.error || 'No se pudo abrir la contratación', true);
});

accessKeyForm?.addEventListener('submit', async (event) => {
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

licenseForm?.addEventListener('submit', async (event) => {
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
  const hintEl = el('accountHint');
  if (hintEl) {
    hintEl.hidden = false;
    hintEl.textContent = currentProfileId
      ? t('account.hintLinked', 'El overlay usa tu perfil para reconocerte en la partida y mostrar tu ELO de RM 1v1.')
      : t('account.hintEmpty', 'Detecta tu perfil del juego o busca tu nombre abajo para activar el overlay.');
  }
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
  if (smurfDetectorInput) smurfDetectorInput.checked = Boolean(info.smurfDetector);
  if (hideWhenMinimizedInput) hideWhenMinimizedInput.checked = Boolean(info.hideWhenMinimized);
  postMatchInput.checked = info.postMatch !== false;
  if (postMatchPopupInput) postMatchPopupInput.checked = info.postMatchPopup !== false;
  paintPostMatchPopupHide(info.postMatchHideSeconds != null ? Number(info.postMatchHideSeconds) : 60);
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
  // Cargar bajo demanda solo la pestaña activa (evita 3 IPC + API duplicados al arranque).
  if (activePage === 'central') loadCentral(false);
  else if (activePage === 'postmatch') loadPostMatch();
  else if (activePage === 'tactics') loadTactics();
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
    searchToken += 1;
    accountSearchBoxEl?.classList.remove('is-searching');
    results = [];
    renderResults();
    paintSearchState('');
    paintSearchHelp(false);
    setStatus('');
    return;
  }

  // Un ID numérico se usa directo: no se busca por nombre.
  if (parseNumeric(query)) {
    searchToken += 1;
    accountSearchBoxEl?.classList.remove('is-searching');
    results = [];
    renderResults();
    paintSearchState('ID listo');
    paintSearchHelp(false);
    setStatus('');
    return;
  }

  const token = ++searchToken;
  accountSearchBoxEl?.classList.add('is-searching');
  paintSearchState('Buscando…');
  searchTimer = setTimeout(async () => {
    try {
      const response = await window.settings.search(query);
      if (token !== searchToken) return;
      if (!response?.ok) {
        results = [];
        renderResults();
        paintSearchState('Error al buscar');
        setStatus(response?.error || 'No se pudo buscar', true);
        return;
      }
      results = response.results || [];
      activeIndex = results.length ? 0 : -1;
      renderResults();
      paintSearchState(
        results.length ? `${results.length} resultado${results.length === 1 ? '' : 's'}` : 'Sin resultados',
      );
      paintSearchHelp(Boolean(results.length));
      setStatus('');
    } catch (err) {
      if (token !== searchToken) return;
      results = [];
      renderResults();
      paintSearchState('Error al buscar');
      setStatus(err?.message || 'Error de conexión al buscar', true);
    } finally {
      if (token === searchToken) accountSearchBoxEl?.classList.remove('is-searching');
    }
  }, 260);
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
  const feedbackModal = el('feedbackModal');
  if (feedbackModal && !feedbackModal.hidden) {
    closeFeedbackModal();
    return;
  }
  const prefsPop = el('appPrefsPopover');
  if (prefsPop && !prefsPop.hidden) {
    setPrefsPopover(false);
    return;
  }
  const wizardOverlay = el('setupWizard');
  if (wizardOverlay && !wizardOverlay.hidden) {
    return;
  }
  if (centralSearchResultsEl && !centralSearchResultsEl.hidden) {
    closeCentralSearchDropdown();
    if (centralSearchStateEl) centralSearchStateEl.textContent = '';
    return;
  }
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
const PAGE_ORDER = ['player', 'central', 'overlay', 'tactics', 'postmatch', 'skins', 'plans', 'updater'];
const PAGE_META = {
  player: { index: '01 / CUENTA', title: 'Cuenta de jugador', sub: 'Tu cuenta en el juego y tus últimas partidas.' },
  central: { index: '02 / CENTRAL', title: 'Central de estadísticas', sub: 'Tu evolución y el historial de cada modo.' },
  overlay: { index: '03 / PREMATCH', title: 'Prepará la partida.', sub: 'Qué se ve en cola y al entrar a la partida · vista previa en vivo.' },
  tactics: { index: '04 / DURANTE', title: 'Elegí cómo responder.', sub: 'Oportunidades por civilización, historial y composición observada.' },
  postmatch: { index: '05 / POSTMATCH', title: 'Aprendé de cada partida.', sub: 'Tus últimas 10 partidas, resultado y evolución detallada.' },
  skins: { index: '06 / APARIENCIA', title: 'Tu panel, a tu manera.', sub: 'Cómo se ve el overlay sobre el juego.' },
  plans: { index: '07 / PLAN Y ACCESO', title: 'Elegí cuánto ver.', sub: 'Free para competir; Pro para el Prematch; Ultra para la experiencia completa.' },
  updater: { index: '08 / ACTUALIZACIONES', title: 'Mantené la app al día.', sub: 'Actualizaciones seguras, también en plena temporada.' },
};

let activePage = 'player';
let postmatchLoadedAt = 0;
let tacticsLoadedAt = 0;
document.body.dataset.page = activePage;

function goTo(page) {
  if (!PAGE_META[page]) return;
  activePage = page;
  document.body.dataset.page = page;
  for (const button of navButtons) {
    const current = button.dataset.page === page;
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const railProfile = el('railUser');
  const navPlansBtn = el('navPlans');
  if (railProfile) {
    const isAcct = page === 'player' || (page === 'plans' && Boolean(navPlansBtn && navPlansBtn.hidden));
    railProfile.classList.toggle('active', isAcct);
    if (isAcct) railProfile.setAttribute('aria-current', 'page');
    else railProfile.removeAttribute('aria-current');
  }
  for (const section of pageSections) section.classList.toggle('active', section.dataset.page === page);
  const locTitle = typeof AppI18n === 'object' ? AppI18n.t(`pages.${page}.title`) : null;
  const locSub = typeof AppI18n === 'object' ? AppI18n.t(`pages.${page}.sub`) : null;
  const locIdx = typeof AppI18n === 'object' ? AppI18n.t(`pages.${page}.index`) : null;
  pageTitle.textContent = (locTitle && locTitle !== `pages.${page}.title`) ? locTitle : PAGE_META[page].title;
  pageSub.textContent = (locSub && locSub !== `pages.${page}.sub`) ? locSub : PAGE_META[page].sub;
  pageIndex.textContent = (locIdx && locIdx !== `pages.${page}.index`) ? locIdx : PAGE_META[page].index;
  if (page === 'player') { paintPoll(); paintClock(); }
  if (page === 'central') loadCentral(false);
  if (page === 'postmatch' && (!lastPostMatchPayload || Date.now() - postmatchLoadedAt > 20000)) {
    postmatchLoadedAt = Date.now();
    loadPostMatch();
  }
  if (page === 'tactics' && (!lastTacticsPayload || Date.now() - tacticsLoadedAt > 20000)) {
    tacticsLoadedAt = Date.now();
    loadTactics();
  }
  if (pagesEl) pagesEl.scrollTop = 0;
}

for (const button of navButtons) button.addEventListener('click', () => goTo(button.dataset.page));
document.querySelectorAll('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.goto;
    if (target) goTo(target);
  });
});

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
let lastAuthState = null;

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
  if (lastCentralPayload) paintCentral(lastCentralPayload);
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

  const wizTopBar = el('wizTopLangBar');
  if (wizTopBar) {
    wizTopBar.innerHTML = LANG_CARDS.map((item) => {
      const flag = typeof AppI18n === 'object' ? AppI18n.flagSvg(item.code) : '';
      const sel = item.code === selectedLanguage;
      return `<button type="button" class="wiz-top-flag${sel ? ' active' : ''}" role="radio" aria-checked="${sel}" data-lang="${item.code}" title="${escapeHtml(item.label)}">${flag}</button>`;
    }).join('');
    wizTopBar.querySelectorAll('.wiz-top-flag').forEach((btn) => {
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

/* ============ FEEDBACK MODAL (GEAR POPOVER -> ADMIN APP) ============ */
let feedbackCategory = 'suggestion';
let feedbackBusy = false;

function openFeedbackModal() {
  const modal = el('feedbackModal');
  if (!modal) return;
  setPrefsPopover(false);
  const statusEl = el('feedbackStatus');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('is-error');
  }
  modal.hidden = false;
  el('feedbackMessage')?.focus();
}

function closeFeedbackModal() {
  const modal = el('feedbackModal');
  if (modal) modal.hidden = true;
}

el('prefsFeedbackBtn')?.addEventListener('click', openFeedbackModal);
el('feedbackCloseBtn')?.addEventListener('click', closeFeedbackModal);
el('feedbackCancelBtn')?.addEventListener('click', closeFeedbackModal);
el('feedbackModal')?.addEventListener('click', (event) => {
  if (event.target === el('feedbackModal')) closeFeedbackModal();
});
document.querySelectorAll('.fb-cat').forEach((btn) => {
  btn.addEventListener('click', () => {
    feedbackCategory = btn.dataset.fbCat || 'suggestion';
    document.querySelectorAll('.fb-cat').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
  });
});
el('feedbackMessage')?.addEventListener('input', () => {
  const len = (el('feedbackMessage')?.value || '').length;
  const counter = el('feedbackCount');
  if (counter) counter.textContent = `${len} / 1200`;
});
el('feedbackForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (feedbackBusy || !window.settings?.submitFeedback) return;
  const msgEl = el('feedbackMessage');
  const contactEl = el('feedbackContact');
  const statusEl = el('feedbackStatus');
  const submitBtn = el('feedbackSubmitBtn');
  const message = (msgEl?.value || '').trim();
  if (message.length < 5) {
    if (statusEl) {
      statusEl.textContent = t('feedback.tooShort', 'Escribí al menos 5 caracteres.');
      statusEl.classList.add('is-error');
    }
    msgEl?.focus();
    return;
  }
  feedbackBusy = true;
  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) {
    statusEl.textContent = t('feedback.sending', 'Enviando feedback…');
    statusEl.classList.remove('is-error');
  }
  try {
    const res = await window.settings.submitFeedback({
      category: feedbackCategory,
      message,
      contact: (contactEl?.value || '').trim(),
    });
    if (!res || !res.ok) {
      if (statusEl) {
        statusEl.textContent = (res && res.error) || t('feedback.error', 'No se pudo enviar el feedback.');
        statusEl.classList.add('is-error');
      }
      return;
    }
    if (msgEl) msgEl.value = '';
    if (el('feedbackCount')) el('feedbackCount').textContent = '0 / 1200';
    if (statusEl) {
      statusEl.textContent = t('feedback.sent', '¡Gracias! Tu feedback fue enviado correctamente.');
      statusEl.classList.remove('is-error');
    }
    setStatus(t('feedback.sent', '¡Gracias! Tu feedback fue enviado correctamente.'));
    setTimeout(() => closeFeedbackModal(), 1300);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = (err && err.message) || t('feedback.error', 'No se pudo enviar el feedback.');
      statusEl.classList.add('is-error');
    }
  } finally {
    feedbackBusy = false;
    if (submitBtn) submitBtn.disabled = false;
  }
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
const handleVerifyAccess = async () => {
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
};
el('prefsVerifyBtn')?.addEventListener('click', handleVerifyAccess);
el('planRefreshBtn')?.addEventListener('click', handleVerifyAccess);
document.addEventListener('click', (event) => {
  const pop = el('appPrefsPopover');
  const btn = el('appPrefsBtn');
  if (!pop || pop.hidden) return;
  if (!pop.contains(event.target) && (!btn || !btn.contains(event.target))) {
    setPrefsPopover(false);
  }
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
  const sumAuth = el('wizSumAuth');
  const sumLang = el('wizSumLang');
  const sumAcc = el('wizSumAccount');
  if (sumAuth) {
    if (lastAuthState?.signedIn && lastAuthState.user) {
      const u = lastAuthState.user;
      sumAuth.textContent = u.displayName && u.email
        ? `${u.displayName} (${u.email})`
        : (u.email || u.displayName || 'Google');
    } else {
      sumAuth.textContent = typeof AppI18n === 'object' ? AppI18n.t('wizard.summaryNoAuth') : 'Sin iniciar sesión';
    }
  }
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
    titleEl.textContent = tr('wizard.authTitle', 'Iniciá sesión en Relic');
    subEl.textContent = tr('wizard.authDesc', 'Conectá tu cuenta de Google para sincronizar tu plan, usar Relic hasta en 2 PCs y canjear claves prepagas.');
  } else if (wizardStep === 2) {
    titleEl.textContent = tr('wizard.langTitle', 'Elige tu idioma');
    subEl.textContent = tr('wizard.langDesc', 'Las unidades, edificios y civilizaciones coincidirán con el juego.');
  } else if (wizardStep === 3) {
    titleEl.textContent = tr('wizard.accountTitle', 'Conecta tu cuenta de AoE2');
    subEl.textContent = tr('wizard.accountDesc', 'Detecta tu perfil de Steam o búscalo por nombre.');
  } else {
    titleEl.textContent = tr('wizard.readyTitle', 'Todo listo para jugar');
    subEl.textContent = tr('wizard.readyDesc', 'El overlay se oculta mientras juegas y analiza tus partidas.');
  }
  const backBtn = el('wizBackBtn');
  const skipBtn = el('wizSkipBtn');
  const nextBtn = el('wizNextBtn');
  const isSignedIn = Boolean(lastAuthState?.signedIn && lastAuthState?.user);
  if (backBtn) backBtn.hidden = wizardStep <= 1;
  if (skipBtn) {
    skipBtn.hidden = !(
      (wizardStep === 1 && !isSignedIn) ||
      (wizardStep === 3 && !lastAccountInfo.profileId)
    );
  }
  if (nextBtn) {
    nextBtn.textContent = wizardStep === 4
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
  if (wizardStep === 1) wizardStep = 2;
  else if (wizardStep === 3) wizardStep = 4;
  renderWizardStep();
});
el('wizNextBtn')?.addEventListener('click', () => {
  if (wizardStep < 4) { wizardStep += 1; renderWizardStep(); }
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
let wizSearchToken = 0;
el('wizSearch')?.addEventListener('input', () => {
  clearTimeout(wizSearchTimer);
  const q = el('wizSearch').value.trim();
  const box = el('wizResults');
  if (!box) return;
  if (q.length < 2) { wizSearchToken += 1; box.replaceChildren(); return; }
  const token = ++wizSearchToken;
  box.innerHTML = `<div class="central-search-feedback is-loading"><span class="search-spinner is-inline" aria-hidden="true"></span><span>Buscando "${escapeHtml(q)}"…</span></div>`;
  wizSearchTimer = setTimeout(async () => {
    try {
      const response = await window.settings.search(q);
      if (token !== wizSearchToken) return;
      const list = Array.isArray(response) ? response : (Array.isArray(response?.results) ? response.results : []);
      box.replaceChildren();
      if (!list.length) {
        box.innerHTML = `<div class="central-search-feedback is-empty">Sin resultados para "${escapeHtml(q)}".</div>`;
        return;
      }
      for (const p of list.slice(0, 5)) {
        const row = document.createElement('div');
        row.className = 'result';
        row.innerHTML = `<span class="result-avatar">${escapeHtml(initialsOf(p.name))}</span>
          <span class="result-copy"><span class="name">${escapeHtml(p.clan ? `${p.clan} | ${p.name}` : p.name)}</span>
          <span class="tag">#${escapeHtml(p.profileId)}</span></span>`;
        row.addEventListener('click', async () => {
          const picked = await window.settings.pick(p.profileId);
          if (!picked?.ok) {
            setStatus(picked?.error || 'No se pudo guardar ese perfil.', true);
            return;
          }
          syncWizardAccount(picked);
          box.replaceChildren();
          await loadCurrent();
        });
        box.appendChild(row);
      }
    } catch (_) {
      if (token === wizSearchToken) box.innerHTML = '<div class="central-search-feedback is-error">Error al buscar.</div>';
    }
  }, 240);
});

paintThemes();
paintOpacity(0.95);
paintSearchHelp(false);
goTo('central');
loadCurrent();


/* ============ CUENTA RELIC · GOOGLE OAUTH, DISPOSITIVOS Y CLAVES PREPAGAS ============ */
(function initRelicAuthUi() {
  const limitAlertEl = el('relicDeviceLimitAlert');
  const devicesListEl = el('relicDevicesList');
  const redeemForm = el('redeemKeyForm');
  const redeemInput = el('redeemKeyInput');
  const redeemBtn = el('redeemKeyBtn');
  const redeemStatusEl = el('redeemKeyStatus');
  const planRedeemSignInPrompt = el('planRedeemSignInPrompt');
  const planLoginBtn = el('planGoogleLoginBtn');

  // Rail user pill + Cuenta page session card + Wizard step 1
  const railUserBtn = el('railUser');
  const railUserAvatar = el('railUserAvatar');
  const railUserName = el('railUserName');
  const railUserSub = el('railUserSub');

  const accSignedOut = el('accAuthSignedOut');
  const accSignedIn = el('accAuthSignedIn');
  const accLoginBtn = el('accGoogleLoginBtn');
  const accLogoutBtn = el('accGoogleLogoutBtn');
  const accAuthStatus = el('accAuthStatus');
  const accUserAvatar = el('accUserAvatar');
  const accUserName = el('accUserName');
  const accUserEmail = el('accUserEmail');
  const accSeatsBadge = el('accSeatsBadge');

  const wizSignedOut = el('wizAuthSignedOut');
  const wizSignedIn = el('wizAuthSignedIn');
  const wizLoginBtn = el('wizGoogleLoginBtn');
  const wizSwitchBtn = el('wizSwitchAccountBtn');
  const wizAuthStatus = el('wizAuthStatus');
  const wizAuthAvatar = el('wizAuthAvatar');
  const wizAuthName = el('wizAuthName');
  const wizAuthEmail = el('wizAuthEmail');

  if (!accSignedOut || !window.settings?.authStatus) return;

  function fmtRelTime(tsSec) {
    if (!tsSec) return '—';
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - Number(tsSec));
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
  }

  function setAllAuthStatus(msg) {
    if (accAuthStatus) accAuthStatus.textContent = msg;
    if (wizAuthStatus) wizAuthStatus.textContent = msg;
  }

  function setLoginButtonsDisabled(disabled) {
    if (planLoginBtn) planLoginBtn.disabled = disabled;
    if (accLoginBtn) accLoginBtn.disabled = disabled;
    if (wizLoginBtn) wizLoginBtn.disabled = disabled;
  }

  function paintAuth(auth) {
    lastAuthState = auth || null;
    const isSigned = Boolean(auth && auth.signedIn && auth.user);

    if (!isSigned) {
      if (accSignedOut) accSignedOut.hidden = false;
      if (accSignedIn) accSignedIn.hidden = true;
      if (redeemForm) redeemForm.hidden = true;
      if (planRedeemSignInPrompt) planRedeemSignInPrompt.hidden = false;
      if (wizSignedOut) wizSignedOut.hidden = false;
      if (wizSignedIn) wizSignedIn.hidden = true;
      if (railUserBtn) railUserBtn.classList.remove('is-signed');
      if (railUserAvatar) railUserAvatar.textContent = 'G';
      if (railUserName) railUserName.textContent = t('account.signInRail', 'Iniciar sesión');
      if (railUserSub) railUserSub.textContent = t('account.signInRailSub', 'Google · sincronizá tu plan');
      renderWizardStep();
      return;
    }

    const u = auth.user;
    const displayName = u.displayName || u.email || 'Usuario Relic';
    const email = u.email || '';
    const initial = String(displayName).trim().charAt(0).toUpperCase() || 'R';
    const activeDevices = (Array.isArray(auth.devices) ? auth.devices : []).filter((d) => d.active);
    const maxDev = Number(u.maxDevices || 2);

    // 1. Plan y acceso: show unified redeem key form when signed in
    if (redeemForm) redeemForm.hidden = false;
    if (planRedeemSignInPrompt) planRedeemSignInPrompt.hidden = true;

    // 2. Cuenta page: Relic account + active PCs (single source of truth)
    if (accSignedOut) accSignedOut.hidden = true;
    if (accSignedIn) accSignedIn.hidden = false;
    if (accUserAvatar) accUserAvatar.textContent = initial;
    if (accUserName) accUserName.textContent = displayName;
    if (accUserEmail) accUserEmail.textContent = email;
    if (accSeatsBadge) accSeatsBadge.textContent = `${activeDevices.length}/${maxDev} PCs activas`;
    if (limitAlertEl) limitAlertEl.hidden = Boolean(auth.currentMachineAuthorized);

    // 3. Unified left rail profile + plan card
    if (railUserBtn) railUserBtn.classList.add('is-signed');
    if (railUserAvatar) railUserAvatar.textContent = initial;
    if (railUserName) railUserName.textContent = displayName;
    if (railUserSub) railUserSub.textContent = lastAccountInfo.alias ? `${lastAccountInfo.alias} · ${activeDevices.length}/${maxDev} PCs` : `Google · ${activeDevices.length}/${maxDev} PCs`;

    // 4. First-launch wizard step 1 + summary
    if (wizSignedOut) wizSignedOut.hidden = true;
    if (wizSignedIn) wizSignedIn.hidden = false;
    if (wizAuthAvatar) wizAuthAvatar.textContent = initial;
    if (wizAuthName) wizAuthName.textContent = displayName;
    if (wizAuthEmail) wizAuthEmail.textContent = email;
    renderWizardStep();

    if (devicesListEl) {
      devicesListEl.replaceChildren();
      if (!activeDevices.length) {
        const empty = document.createElement('li');
        empty.className = 'relic-device-item';
        empty.innerHTML = '<div class="relic-device-meta"><small>Sin PCs registradas todavía.</small></div>';
        devicesListEl.appendChild(empty);
      } else {
        for (const dev of activeDevices) {
          const isCurrent = dev.machineHash === auth.currentMachineHash;
          const li = document.createElement('li');
          li.className = 'relic-device-item';
          const meta = document.createElement('div');
          meta.className = 'relic-device-meta';
          meta.innerHTML = `<b>${escapeHtml(dev.deviceName || 'PC')}${isCurrent ? '<span class="relic-this-pc">Esta PC</span>' : ''}</b>` +
            `<small>${escapeHtml([dev.appVersion ? `v${dev.appVersion}` : null, `última vez ${fmtRelTime(dev.lastSeenAt)}`].filter(Boolean).join(' · '))}</small>`;
          const kickBtn = document.createElement('button');
          kickBtn.type = 'button';
          kickBtn.className = 'btn';
          kickBtn.textContent = isCurrent ? 'Desvincular' : 'Desconectar';
          kickBtn.addEventListener('click', async () => {
            kickBtn.disabled = true;
            try {
              const res = await window.settings.authRevokeDevice(dev.machineHash);
              if (res?.auth) paintAuth(res.auth);
              if (res?.product) renderProduct(res.product);
            } finally {
              kickBtn.disabled = false;
            }
          });
          li.append(meta, kickBtn);
          devicesListEl.appendChild(li);
        }
      }
    }
  }

  async function triggerGoogleLogin() {
    setLoginButtonsDisabled(true);
    setAllAuthStatus('Abriendo Google en tu navegador…');
    try {
      const res = await window.settings.authGoogleLogin();
      if (res?.ok) {
        setAllAuthStatus('');
        if (res.auth) paintAuth(res.auth);
        if (res.product) renderProduct(res.product);
        setStatus('Sesión de Google iniciada.');
      } else {
        setAllAuthStatus(res?.error || 'No se pudo iniciar sesión.');
      }
    } catch (err) {
      setAllAuthStatus(err?.message || 'Error al iniciar sesión.');
    } finally {
      setLoginButtonsDisabled(false);
    }
  }

  async function triggerGoogleLogout() {
    if (accLogoutBtn) accLogoutBtn.disabled = true;
    if (wizSwitchBtn) wizSwitchBtn.disabled = true;
    try {
      const res = await window.settings.authLogout();
      if (res?.auth) paintAuth(res.auth);
      if (res?.product) renderProduct(res.product);
      setStatus('Sesión cerrada.');
    } finally {
      if (accLogoutBtn) accLogoutBtn.disabled = false;
      if (wizSwitchBtn) wizSwitchBtn.disabled = false;
    }
  }

  planLoginBtn?.addEventListener('click', triggerGoogleLogin);
  accLoginBtn?.addEventListener('click', triggerGoogleLogin);
  wizLoginBtn?.addEventListener('click', triggerGoogleLogin);

  accLogoutBtn?.addEventListener('click', triggerGoogleLogout);
  wizSwitchBtn?.addEventListener('click', async () => {
    await triggerGoogleLogout();
    await triggerGoogleLogin();
  });

  redeemForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const code = String(redeemInput?.value || '').trim();
    if (!code) return;
    if (redeemBtn) redeemBtn.disabled = true;
    if (redeemStatusEl) redeemStatusEl.textContent = 'Verificando clave…';
    try {
      const res = await window.settings.authRedeemKey(code);
      if (res?.ok) {
        if (redeemInput) redeemInput.value = '';
        if (redeemStatusEl) redeemStatusEl.textContent = `¡Plan ${String(res.plan || '').toUpperCase()} activado (+${res.durationDays} días)!`;
        if (res.auth) paintAuth(res.auth);
        if (res.product) renderProduct(res.product);
      } else if (redeemStatusEl) {
        redeemStatusEl.textContent = res?.error || 'Clave inválida.';
      }
    } finally {
      if (redeemBtn) redeemBtn.disabled = false;
    }
  });

  window.settings.onAuth?.((auth) => paintAuth(auth));
  window.settings.authStatus().then((res) => { if (res?.auth) paintAuth(res.auth); }).catch(() => {});
})();
