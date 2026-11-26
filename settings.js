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
const onlyWhenGameRunningInput = el('onlyWhenGameRunning');
const openAtLoginInput = el('openAtLogin');
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
  const ultraAllowed = Boolean(currentProduct?.featureAccess?.ultraSkin);
  for (const button of themeButtons) {
    const isUltraBtn = button.dataset.theme === 'ultra';
    button.classList.toggle('active', button.dataset.theme === currentTheme);
    if (isUltraBtn) {
      button.classList.toggle('is-locked', !ultraAllowed);
      button.setAttribute('aria-disabled', String(!ultraAllowed));
      button.title = ultraAllowed
        ? t('skins.ultraUnlockedTip', 'Modo Ultra: transforma toda la aplicación y el overlay en negro puro de alto contraste.')
        : t('skins.ultraLockedTip', 'Exclusivo de Relic Ultra. Transforma toda la aplicación y el overlay en negro puro de alto contraste.');
    }
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
      : t('postmatchPage.availableProMax', 'Disponible con Ultra.');
}

let currentTrialHours = 168;

function syncTrialHoursFrom(source) {
  const candidates = [
    source?.trialHours,
    source?.remoteLicense?.trialHours,
    source?.product?.trialHours,
    source?.product?.remoteLicense?.trialHours,
  ];
  for (const cand of candidates) {
    const num = Number(cand);
    if (Number.isFinite(num) && num >= 1 && num <= 720) {
      currentTrialHours = Math.round(num);
      return currentTrialHours;
    }
  }
  return currentTrialHours;
}

function formatTrialDuration(hours = currentTrialHours, { short = false } = {}) {
  const h = Math.max(1, Math.min(720, Math.round(Number(hours) || 168)));
  const lang = typeof AppI18n === 'object' && typeof AppI18n.getLocale === 'function' ? AppI18n.getLocale() : (selectedLanguage || 'es-MX');
  const isEn = lang === 'en';
  const isZh = lang === 'zh-CN';
  if (h >= 48 && h % 24 === 0) {
    const days = h / 24;
    if (isZh) return `${days} 天`;
    if (isEn) return `${days} days`;
    return `${days} días`;
  }
  if (isZh) return `${h} 小时`;
  if (isEn) return short ? `${h}h` : (h === 1 ? '1 hour' : `${h} hours`);
  return short ? `${h} h` : (h === 1 ? '1 hora' : `${h} horas`);
}

const ULTRA_WELCOME_SEEN_KEY = 'relic_ultra_welcome_seen_v1';
let lastRenderedPlan = null;

function ultraSubscriptionSig(product) {
  if (!product || product.plan !== 'promax') return '';
  const acct = product.accountId || product.entitlement?.accountId || 'local';
  const exp = product.entitlement?.expiresAt || product.expiresAt || 'active';
  return `${acct}:${exp}`;
}

function closeUltraWelcomePopup() {
  const bd = el('ultraWelcomeBackdrop');
  if (bd) bd.hidden = true;
}

function openUltraWelcomePopup(product = currentProduct, { force = false } = {}) {
  const bd = el('ultraWelcomeBackdrop');
  if (!bd) return false;
  const sig = ultraSubscriptionSig(product || currentProduct);
  if (!force && sig) {
    try {
      if (localStorage.getItem(ULTRA_WELCOME_SEEN_KEY) === sig) return false;
    } catch (_) {}
  }
  const primaryBtn = el('ultraWelcomePrimaryBtn');
  const dismissBtn = el('ultraWelcomeDismissBtn');
  const alreadyUltraSkin = currentTheme === 'ultra';
  if (primaryBtn) {
    primaryBtn.textContent = alreadyUltraSkin
      ? t('ultraWelcome.ctaStart', 'Empezar ahora')
      : t('ultraWelcome.ctaApplySkin', 'Activar skin Ultra y empezar');
  }
  if (dismissBtn) dismissBtn.hidden = alreadyUltraSkin;
  bd.hidden = false;
  if (sig) {
    try { localStorage.setItem(ULTRA_WELCOME_SEEN_KEY, sig); } catch (_) {}
  }
  try { window.UiSfx?.play?.('chime'); } catch (_) {}
  return true;
}

window.openUltraWelcomePopup = (opts) => openUltraWelcomePopup(currentProduct, { force: true, ...(opts || {}) });

el('ultraWelcomeCloseBtn')?.addEventListener('click', closeUltraWelcomePopup);
el('ultraWelcomeDismissBtn')?.addEventListener('click', closeUltraWelcomePopup);
el('ultraWelcomeBackdrop')?.addEventListener('click', (ev) => {
  if (ev.target === el('ultraWelcomeBackdrop')) closeUltraWelcomePopup();
});
el('ultraWelcomePrimaryBtn')?.addEventListener('click', async () => {
  if (currentTheme !== 'ultra' && currentProduct?.featureAccess?.ultraSkin) {
    const previousTheme = currentTheme;
    applyTheme('ultra');
    try {
      const response = await window.settings.theme('ultra');
      if (!response?.ok) applyTheme(previousTheme);
    } catch (_) {
      applyTheme(previousTheme);
    }
  }
  closeUltraWelcomePopup();
});

function renderProduct(product) {
  if (!product) return;
  const prevPlan = lastRenderedPlan;
  lastRenderedPlan = product.plan || null;
  currentProduct = product;
  if (prevPlan && prevPlan !== 'promax' && product.plan === 'promax') {
    openUltraWelcomePopup(product);
  }
  syncTrialHoursFrom(product);
  const features = Array.isArray(product.features) ? product.features : [];
  const proAccess = Boolean(product.featureAccess && product.featureAccess.postMatchComparison);
  const replayAccess = Boolean(product.featureAccess && product.featureAccess.postMatchReplay);

  const planLabel = product.plan === 'beta' ? t('plans.beta', 'Acceso beta')
    : product.plan === 'promax' ? t('plans.promax', 'Ultra')
      : product.plan === 'pro' ? t('plans.pro', 'Pro')
        : t('plans.free', 'Free');
  if (railPlanLabel) {
    railPlanLabel.textContent = planLabel;
    railPlanLabel.title = t('plans.openPlansHint', 'Ver y comparar planes');
    if (!railPlanLabel.dataset.boundPlanJump) {
      railPlanLabel.dataset.boundPlanJump = '1';
      railPlanLabel.setAttribute('role', 'link');
      railPlanLabel.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        goTo('plans');
      });
    }
  }
  if (planName) planName.textContent = planLabel;
  const railTier = (product.plan === 'promax' || product.plan === 'beta') ? 'ultra'
    : product.plan === 'pro' ? 'pro' : 'free';
  if (railPlanBtn) railPlanBtn.dataset.tier = railTier;
  const railProfile = el('railUser');
  if (railProfile) railProfile.dataset.tier = railTier;
  const navPlansBtn = el('navPlans');
  if (navPlansBtn) {
    navPlansBtn.hidden = false;
    navPlansBtn.dataset.tier = railTier;
  }
  const navPlansPill = el('navPlansPill');
  if (navPlansPill) {
    navPlansPill.dataset.tier = railTier;
    navPlansPill.textContent = railTier === 'free'
      ? t('plans.upgradePill', 'Mejorar')
      : planLabel;
  }
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
  if (typeof syncPlanPricingUi === 'function') syncPlanPricingUi();

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
    if (!allowed) {
      input.checked = false;
    } else if (lastLoadedInfo && Object.hasOwn(lastLoadedInfo, key)) {
      input.checked = Boolean(lastLoadedInfo[key]);
    }
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
  if (typeof trainingUi !== 'undefined' && trainingUi) {
    const trialAvail = typeof isUltraTrialAvailable === 'function' ? isUltraTrialAvailable(product) : true;
    if (typeof trainingUi.syncProduct === 'function') {
      trainingUi.syncProduct(product, { trialAvailable: trialAvail, trialHours: currentTrialHours });
    }
    if (activePage === 'training' && product.featureAccess?.trainingHub) {
      trainingUi.refresh();
    }
  }
  if (typeof renderPlansPricing === 'function') {
    renderPlansPricing();
  } else if (typeof syncLockedPageShowcases === 'function') {
    syncLockedPageShowcases(product);
  }
  const resolvedPlan = product?.plan || 'free';
  if (product?.effectiveTheme) {
    applyTheme(product.effectiveTheme);
  } else if (!product?.featureAccess?.ultraSkin && currentTheme === 'ultra') {
    applyTheme('clasico');
  } else {
    paintThemes();
  }
  if (resolvedPlan !== 'free') {
    try { localStorage.removeItem('relic.expiredModalDismissedV1'); } catch { /* ignore */ }
    pendingExpiredOfferLicense = null;
  } else if (product?.remoteLicense?.reason === 'expired') {
    queueExpiredOfferModal(product.remoteLicense);
  }
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
  const barsW = [...container.querySelectorAll('[data-w]')];
  const barsH = [...container.querySelectorAll('[data-h]')];
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apply = () => {
    barsW.forEach((bar) => {
      const width = Math.max(0, Math.min(100, Number(bar.dataset.w) || 0));
      bar.style.transition = '';
      bar.style.width = `${width}%`;
    });
    barsH.forEach((bar) => {
      const height = Math.max(0, Math.min(100, Number(bar.dataset.h) || 0));
      bar.style.transition = '';
      bar.style.height = `${height}%`;
    });
  };
  if (!reduced && typeof requestAnimationFrame === 'function') {
    barsW.forEach((bar) => {
      bar.style.transition = 'none';
      bar.style.width = '0%';
    });
    barsH.forEach((bar) => {
      bar.style.transition = 'none';
      bar.style.height = '0%';
    });
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
      if (currentProduct && !currentProduct.featureAccess?.postMatch) {
        if (typeof openFriendlyUpgradeModal === 'function') {
          openFriendlyUpgradeModal({
            tier: 'ultra',
            featureName: t('ui.pmDetailName', 'Análisis Postmatch detallado'),
            featureDesc: t('ui.pmDetailDesc', 'Revisá tiempos de edad, economía, combate y focos reales de mejora partida a partida.'),
          });
        } else {
          goTo('plans');
        }
        return;
      }
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
  bindPostMatchTabs(postMatchReportEl);
  if (window.RelicSmoothMotion?.observeReveal) {
    window.RelicSmoothMotion.observeReveal(postMatchReportEl);
  } else {
    applyDataWidths(postMatchReportEl);
  }
  syncAllTrainPinButtons();
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
      const on = pane.dataset.pmPane === target;
      pane.classList.toggle('is-active', on);
      if (on) {
        pane.classList.remove('pm-anim-in');
        void pane.offsetWidth;
        pane.classList.add('pm-anim-in');
        if (window.RelicSmoothMotion?.observeReveal) {
          window.RelicSmoothMotion.observeReveal(pane);
        } else {
          applyDataWidths(pane);
        }
      }
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

  bindPostMatchApmCharts(container);
}

function bindPostMatchApmCharts(container) {
  if (!container) return;
  container.querySelectorAll('.pm-apm-card').forEach((card) => {
    let payload = null;
    try { payload = JSON.parse(card.dataset.apmPayload || 'null'); } catch { payload = null; }
    if (!payload || !Array.isArray(payload.players) || payload.players.length < 2) return;

    let lockedSlot = null;
    const applyFocus = (slot) => {
      const hasFocus = slot != null;
      card.classList.toggle('has-focus', hasFocus);
      card.querySelectorAll('[data-apm-slot]').forEach((node) => {
        const match = hasFocus && String(node.dataset.apmSlot) === String(slot);
        node.classList.toggle('is-focused', match);
        if (node.classList.contains('pm-apm-card-item')) {
          node.setAttribute('aria-pressed', String(lockedSlot != null && String(lockedSlot) === String(node.dataset.apmSlot)));
        }
      });
    };

    const bindSlotInteractive = (node) => {
      const slot = node.dataset.apmSlot;
      node.addEventListener('click', () => {
        lockedSlot = (lockedSlot != null && String(lockedSlot) === String(slot)) ? null : slot;
        applyFocus(lockedSlot);
      });
      node.addEventListener('mouseenter', () => {
        if (lockedSlot == null) applyFocus(slot);
      });
      node.addEventListener('mouseleave', () => {
        if (lockedSlot == null) applyFocus(null);
      });
    };

    card.querySelectorAll('.pm-apm-card-item, .pm-apm-boxg').forEach(bindSlotInteractive);

    // Scrubber interactivo minuto a minuto sobre el gráfico de líneas
    const svg = card.querySelector('.pm-apm-line-svg');
    const hit = card.querySelector('.pm-apm-hit');
    const crosshair = card.querySelector('.pm-apm-crosshair');
    const tooltip = card.querySelector('.pm-apm-tooltip');
    if (!svg || !hit || !crosshair || !tooltip) return;

    const totalMin = Math.max(2, Number(payload.totalMinutes) || 2);
    const yMax = Math.max(40, Number(payload.yMax) || 100);
    const innerW = payload.w - payload.padL - payload.padR;
    const innerH = payload.h - payload.padT - payload.padB;

    const renderMinute = (minIdx) => {
      const m = Math.max(0, Math.min(totalMin - 1, minIdx));
      const x = Math.round((payload.padL + (m / (totalMin - 1)) * innerW) * 10) / 10;
      crosshair.setAttribute('x1', String(x));
      crosshair.setAttribute('x2', String(x));

      const rows = payload.players.map((p) => {
        const val = Number(p.series?.[m]) || 0;
        const y = Math.round((payload.padT + (1 - Math.max(0, Math.min(yMax, val)) / yMax) * innerH) * 10) / 10;
        const dot = svg.querySelector(`.pm-apm-hdot[data-apm-slot="${p.slot}"]`);
        if (dot) {
          dot.setAttribute('cx', String(x));
          dot.setAttribute('cy', String(y));
        }
        return { ...p, val };
      }).sort((a, b) => b.val - a.val);

      tooltip.classList.toggle('is-left', m < totalMin / 2);
      tooltip.innerHTML = `<div class="pm-apm-tip-head">${escapeHtml(t('postmatch.apmMinLabel', 'Min {m}:00', { m }))}</div>`
        + rows.map((r) => `<div class="pm-apm-tip-row pm-c${r.color}">
            <i class="pm-apm-tip-dot" aria-hidden="true"></i>
            <span class="pm-apm-tip-name" data-no-i18n="1">${escapeHtml(r.name)}</span>
            <b class="pm-apm-tip-val">${r.val}</b>
          </div>`).join('');
      tooltip.hidden = false;
      svg.classList.add('is-scrubbing');
    };

    hit.addEventListener('mousemove', (ev) => {
      const rect = hit.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      renderMinute(Math.round(ratio * (totalMin - 1)));
    });
    hit.addEventListener('mouseleave', () => {
      svg.classList.remove('is-scrubbing');
      tooltip.hidden = true;
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
let centralEloRange = '100';
let centralCivSort = 'games';
let centralMapSort = 'games';
let centralLmWindow = '20';
let centralSelectedCivSlug = null;
let centralCivFilter = '';
let centralDiagTab = 'maps';
let centralSelectedMapKey = null;
let centralMapDiagTab = 'civs';
let centralActiveView = 'overview';
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
  if (typeof window.__relicEloResizeCleanup === 'function') {
    window.__relicEloResizeCleanup();
  }
  window.addEventListener('resize', invalidateGeom, { passive: true });
  window.__relicEloResizeCleanup = () => window.removeEventListener('resize', invalidateGeom);

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
      const outcome = nearest.won === true ? t('ui.chartWin', 'Victoria') : nearest.won === false ? t('ui.chartLoss', 'Derrota') : '';
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
      // Hidratación perezosa de Empire Wars (ew_1v1 / ew_team) solo cuando el usuario toca la pestaña
      const modeObj = lastCentralPayload?.modes?.[nextMode];
      if ((nextMode === 'ew_1v1' || nextMode === 'ew_team') && modeObj?.ewNeedsHydration && typeof window.settings?.centralHydrateMode === 'function') {
        const reqPid = lastCentralPayload.profileId;
        window.settings.centralHydrateMode({
          modeId: nextMode,
          profileId: reqPid,
          alias: lastCentralPayload.alias,
        }).then((hydrated) => {
          if (hydrated && hydrated.ok && Number(lastCentralPayload?.profileId) === Number(reqPid)) {
            paintCentral(hydrated, { preserveMode: true });
          }
        }).catch(() => {});
      }
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
      const rawWin = String(btn.dataset.lmWindow || '');
      const nextWin = ['10', '20', '50', 'all'].includes(rawWin) ? rawWin : '20';
      if (nextWin === String(centralLmWindow)) return;
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

  centralDashboardEl.querySelectorAll('[data-diag-map]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mapKey = btn.dataset.diagMap;
      if (!mapKey) return;
      centralSelectedMapKey = mapKey;
      if (lastCentralPayload) {
        paintCentral(lastCentralPayload, { preserveMode: true });
        const panel = centralDashboardEl.querySelector('#cxMapDiagPanel');
        if (panel) smartScrollAndPulse(panel);
      }
    });
  });

  centralDashboardEl.querySelectorAll('[data-map-diag-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTab = btn.dataset.mapDiagTab;
      if (!nextTab || nextTab === centralMapDiagTab) return;
      centralMapDiagTab = nextTab;
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

  centralDashboardEl.querySelectorAll('[data-central-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextView = btn.dataset.centralView;
      if (!nextView || nextView === centralActiveView) return;
      centralActiveView = nextView;
      centralDashboardEl.querySelectorAll('[data-central-view]').forEach((b) => {
        const on = b.dataset.centralView === nextView;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      centralDashboardEl.querySelectorAll('[data-central-pane]').forEach((pane) => {
        pane.classList.toggle('is-active', pane.dataset.centralPane === nextView);
      });
      applyDataWidths(centralDashboardEl);
    });
  });

  centralDashboardEl.querySelectorAll('[data-scroll-target]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const targetView = trigger.dataset.scrollView;
      if (targetView && targetView !== centralActiveView) {
        centralActiveView = targetView;
        centralDashboardEl.querySelectorAll('[data-central-view]').forEach((b) => {
          const on = b.dataset.centralView === targetView;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });
        centralDashboardEl.querySelectorAll('[data-central-pane]').forEach((pane) => {
          pane.classList.toggle('is-active', pane.dataset.centralPane === targetView);
        });
        applyDataWidths(centralDashboardEl);
      }
      if (trigger.dataset.scrollMapEapm === '1' && centralMapSort !== 'eapm') {
        centralMapSort = 'eapm';
        if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
      }
      const sel = trigger.dataset.scrollTarget;
      const dest = sel ? centralDashboardEl.querySelector(sel) : null;
      if (dest) smartScrollAndPulse(dest);
    });
  });

  centralDashboardEl.querySelectorAll('[data-jump-civ]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.jumpCiv;
      if (!slug) return;
      centralActiveView = 'mastery';
      centralSelectedCivSlug = slug;
      if (lastCentralPayload) {
        paintCentral(lastCentralPayload, { preserveMode: true });
        const dest = centralDashboardEl.querySelector('#cxSectionCivs');
        if (dest) smartScrollAndPulse(dest);
      }
    });
  });

  centralDashboardEl.querySelectorAll('[data-jump-map]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mk = btn.dataset.jumpMap;
      if (!mk) return;
      centralActiveView = 'mastery';
      centralSelectedMapKey = mk;
      if (lastCentralPayload) {
        paintCentral(lastCentralPayload, { preserveMode: true });
        const dest = centralDashboardEl.querySelector('#cxSectionMaps');
        if (dest) smartScrollAndPulse(dest);
      }
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

  bindRecentMatchClicks(centralDashboardEl, { jumpToPostmatch: true });
  bindInteractiveEloChart();
}

function paintCentral(payload, { preserveMode = false, animateSwap = false } = {}) {
  const prevPid = lastCentralPayload?.profileId;
  lastCentralPayload = payload;
  if (payload && payload.isOwnProfile !== false && Array.isArray(payload.recentMatches) && payload.recentMatches.length) {
    lastRecentMatches = payload.recentMatches;
  }
  const currentPlan = currentProduct?.plan || payload?.plan || (payload?.isUltra ? 'promax' : 'free');
  const currentIsUltra = currentProduct
    ? (currentProduct.plan === 'promax' || currentProduct.plan === 'beta')
    : (payload?.isUltra === true || currentPlan === 'promax' || currentPlan === 'beta');
  if (!preserveMode || Number(prevPid) !== Number(payload?.profileId)) {
    centralActiveModeId = payload?.defaultModeId || 'rm_1v1';
    centralEloRange = currentIsUltra ? '100' : (currentPlan === 'free' ? '10' : '20');
    centralLmWindow = currentPlan === 'free' ? '10' : '20';
    centralCivSort = 'games';
    centralMapSort = 'games';
    centralSelectedCivSlug = null;
    centralCivFilter = '';
    centralDiagTab = 'maps';
    centralSelectedMapKey = null;
    centralMapDiagTab = 'civs';
    centralActiveView = 'overview';
  } else {
    // Clamp ranges & sort cleanly on plan downgrade (e.g. after 24h trial expires!)
    if (!currentIsUltra && centralMapSort === 'eapm') centralMapSort = 'games';
    if (currentPlan === 'free') {
      centralEloRange = '10';
      centralLmWindow = '10';
    } else if (!currentIsUltra) {
      if (!['10', '20'].includes(centralEloRange)) centralEloRange = '20';
      if (!['10', '20'].includes(centralLmWindow)) centralLmWindow = '20';
    }
  }
  syncCentralViewingBanner(payload);
  if (!centralDashboardEl || typeof TacticalUI !== 'object' || !TacticalUI.renderCentralDashboard) return;
  const selectorNames = ['data-central-mode', 'data-central-view', 'data-elo-range', 'data-civ-sort', 'data-map-sort', 'data-lm-window', 'data-diag-tab', 'data-map-diag-tab'];
  const active = document.activeElement;
  const focusAttribute = preserveMode && centralDashboardEl.contains(active)
    ? selectorNames.find((name) => active.hasAttribute(name)) : null;
  const focusValue = focusAttribute ? active.getAttribute(focusAttribute) : null;
  centralDashboardEl.innerHTML = TacticalUI.renderCentralDashboard(payload, {
    activeModeId: centralActiveModeId,
    centralView: centralActiveView,
    eloRange: centralEloRange,
    civSort: centralCivSort,
    mapSort: centralMapSort,
    lmWindow: centralLmWindow,
    selectedCivSlug: centralSelectedCivSlug,
    civFilter: centralCivFilter,
    diagTab: centralDiagTab,
    selectedMapKey: centralSelectedMapKey,
    mapDiagTab: centralMapDiagTab,
    isUltra: currentIsUltra,
    plan: currentPlan,
  });
  if (animateSwap || Number(prevPid) !== Number(payload?.profileId)) {
    centralDashboardEl.classList.remove('cx-swap');
    void centralDashboardEl.offsetWidth;
    centralDashboardEl.classList.add('cx-swap');
  }
  if (window.RelicSmoothMotion?.observeReveal) {
    window.RelicSmoothMotion.observeReveal(centralDashboardEl);
  } else {
    applyDataWidths(centralDashboardEl);
  }
  bindCentralInteractions();
  syncAllTrainPinButtons();
  if (focusAttribute) {
    centralDashboardEl.querySelector(`[${focusAttribute}="${CSS.escape(focusValue)}"]`)?.focus({ preventScroll: true });
  }
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
    row.innerHTML = `<span class="search-spinner is-inline" aria-hidden="true"></span><span>${escapeHtml(text || t('ui.searchingQuery', 'Buscando "{q}"…', { q: query }))}</span>`;
  } else if (kind === 'error') {
    const msg = document.createElement('span');
    msg.textContent = text || t('ui.netSearchErr', 'Error de red al buscar.');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'link-btn';
    retry.textContent = t('central.retry', 'Reintentar');
    retry.addEventListener('click', () => executeCentralSearch(query));
    row.append(msg, retry);
  } else {
    row.textContent = text || t('ui.noResultsQuery', 'Sin resultados para "{q}". Probá otro nombre o pegá el #ID.', { q: query });
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
    if (profile.games) bits.push(`${profile.games} ${t('cx.pjAbbr', 'pj')}`);
    tag.textContent = bits.join(' · ');
    copy.append(name, tag);

    const action = document.createElement('span');
    action.className = 'central-search-go';
    action.textContent = t('ui.viewProfileArrow', 'Ver perfil →');

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
  if (centralSearchStateEl) centralSearchStateEl.textContent = t('ui.searching', 'Buscando…');
  renderCentralSearchFeedback({ kind: 'loading', query });
  try {
    const response = await window.settings.search(query);
    if (token !== centralSearchToken) return;
    setCentralSearchLoading(false);
    if (!response?.ok) {
      centralSearchHits = [];
      centralSearchActiveIdx = -1;
      if (centralSearchStateEl) centralSearchStateEl.textContent = 'Error';
      renderCentralSearchFeedback({ kind: 'error', text: response?.error || t('ui.netSearchErr', 'Error de red al buscar.'), query });
      return;
    }
    const list = Array.isArray(response.results) ? response.results.slice(0, 8) : [];
    if (!list.length) {
      centralSearchHits = [];
      centralSearchActiveIdx = -1;
      if (centralSearchStateEl) centralSearchStateEl.textContent = t('ui.zeroResults', '0 resultados');
      renderCentralSearchFeedback({ kind: 'empty', query });
      return;
    }
    centralSearchHits = list;
    centralSearchActiveIdx = 0;
    if (centralSearchStateEl) {
      centralSearchStateEl.textContent = centralSearchHits.length === 1
        ? t('ui.onePlayer', '1 jugador')
        : t('ui.manyPlayers', '{n} jugadores', { n: centralSearchHits.length });
    }
    renderCentralSearchResults();
  } catch (err) {
    if (token !== centralSearchToken) return;
    setCentralSearchLoading(false);
    centralSearchHits = [];
    centralSearchActiveIdx = -1;
    if (centralSearchStateEl) centralSearchStateEl.textContent = 'Error';
    renderCentralSearchFeedback({ kind: 'error', text: err?.message || t('ui.connErr', 'Error de conexión.'), query });
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
    setStatus(t('ui.loadingProfileOf', 'Cargando perfil de {name}…', { name: centralViewedProfile.alias || `#${centralViewedProfile.profileId}` }));
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
    if (centralSearchStateEl) centralSearchStateEl.textContent = t('ui.enterOpenId', 'Enter para abrir ID');
    closeCentralSearchDropdown();
    return;
  }
  centralSearchHits = [];
  centralSearchActiveIdx = -1;
  if (centralSearchStateEl) centralSearchStateEl.textContent = t('ui.searching', 'Buscando…');
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

refreshCentralBtn?.addEventListener('click', () => {
  if (typeof UiSfx === 'object') UiSfx.play('progress');
  loadCentral(true);
});
goToCentralBtn?.addEventListener('click', () => goTo('central'));

/* ---------- diseño ---------- */
for (const button of themeButtons) {
  button.addEventListener('click', async () => {
    const targetTheme = button.dataset.theme;
    if (targetTheme === 'ultra' && !currentProduct?.featureAccess?.ultraSkin) {
      setStatus(t('skins.ultraLockedStatus', 'El skin Ultra está incluido en Relic Ultra.'), true);
      goTo('plans');
      return;
    }
    const previousTheme = currentTheme;
    applyTheme(targetTheme);
    const response = await window.settings.theme(targetTheme);
    if (!response.ok) {
      applyTheme(previousTheme);
      setStatus(response.error || t('ui.errTheme', 'No se pudo cambiar el diseño'), true);
      if (response.ultraRequired) goTo('plans');
      return;
    }
    setStatus(t('ui.statusTheme', 'Diseño: {name}', { name: button.querySelector('.tname').textContent }));
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
      setStatus(response.error || t('ui.errOpacity', 'No se pudo aplicar la opacidad'), true);
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
      setStatus((response && response.error) || t('ui.errSaveTime', 'No se pudo guardar el tiempo'), true);
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
  applyToggle(tgBalanceInput, (on) => window.settings.tgBalance(on), t('ui.togTgBalance', 'Balance de equipos')),
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
onlyWhenGameRunningInput?.addEventListener('change', () =>
  applyToggle(
    onlyWhenGameRunningInput,
    (on) => window.settings.onlyWhenGameRunning(on),
    t('skins.onlyWhenGameTitle', 'Mostrar overlay solo con AoE2 abierto'),
  ),
);
openAtLoginInput?.addEventListener('change', () =>
  applyToggle(
    openAtLoginInput,
    async (on) => {
      const res = await window.settings.openAtLogin(on);
      openAtLoginPref = Boolean(res?.openAtLogin ?? on);
      if (res?.onlyWhenGameRunning != null && onlyWhenGameRunningInput) {
        onlyWhenGameRunningInput.checked = Boolean(res.onlyWhenGameRunning);
      }
      paintAutoStartToggle();
      return res;
    },
    t('skins.openAtLoginTitle', 'Iniciar automáticamente con Windows'),
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
  ['postMatchComparison', postMatchComparisonInput, t('ui.togPmCompare', 'Comparar mi evolución')],
  ['postMatchReplay', postMatchReplayInput, t('ui.togPmReplay', 'Análisis del replay y APM')],
]) {
  if (!input) continue;
  input.addEventListener('change', async () => {
    try {
      await applyToggle(input, (on) => window.settings.postMatchOption(key, on), label);
    } catch (error) {
      input.checked = !input.checked;
      setStatus(error.message || t('ui.errUpdateOpt', 'No se pudo actualizar la opción.'), true);
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
        setStatus(result?.error || t('ui.errSavePopupTime', 'No se pudo guardar el tiempo del popup.'), true);
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
    setStatus(t('ui.pmUpdated', 'Informe postmatch actualizado.'));
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
window.settings.onProfileDetected?.((detected) => {
  if (!detected || !detected.profileId) return;
  const prevId = currentProfileId;
  currentProfileId = Number(detected.profileId);
  if (lastLoadedInfo) {
    lastLoadedInfo.profileId = currentProfileId;
    if (detected.alias) lastLoadedInfo.alias = detected.alias;
    lastLoadedInfo.origin = 'auto';
    paintAccountHeader(lastLoadedInfo);
  } else {
    paintAccountHeader({ profileId: currentProfileId, alias: detected.alias || null, origin: 'auto' });
  }
  if (Number(prevId) !== Number(currentProfileId) || !lastCentralPayload?.ok) {
    loadCentral(false);
  }
});
window.settings.onProduct((product) => {
  renderProduct(product);
  if (activePage === 'tactics') loadTactics();
  if (lastCentralPayload) paintCentral(lastCentralPayload, { preserveMode: true });
});
window.settings.onTactics((payload) => paintTactics(payload));
window.settings.onBuildOrder((payload) => paintBuildOrder(payload));

let lastBuildOrderPayload = null;
function paintBuildOrder(payload) {
  lastBuildOrderPayload = payload;
  if (smartBuildOrderInput) {
    smartBuildOrderInput.checked = Boolean(payload?.enabled) && payload?.status !== 'locked';
    smartBuildOrderInput.disabled = payload?.status === 'locked' || Boolean(payload?.ongoing);
    smartBuildOrderInput.title = payload?.ongoing ? t('tactics.configBeforeMatch', 'Se configura antes de buscar partida.')
      : payload?.status === 'locked' ? t('postmatchPage.availableProMax', 'Disponible con Ultra.') : '';
  }
  if (!buildOrderReportEl || typeof TacticalUI !== 'object') return;
  buildOrderReportEl.innerHTML = TacticalUI.renderSmartBuildOrder(payload, { library: true });
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
  if (!response.ok) setStatus(response.error || t('ui.errOpenAcc', 'No se pudo abrir la gestión de cuenta'), true);
});

checkoutCommerce?.addEventListener('click', async () => {
  const response = await window.settings.openCommerce('checkout');
  if (!response.ok) setStatus(response.error || t('ui.errOpenSub', 'No se pudo abrir la contratación'), true);
});

accessKeyForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  activateAccessKeyBtn.disabled = true;
  accessKeyStatus.textContent = 'Verificando clave…';
  accessKeyStatus.classList.remove('error');
  try {
    const response = await window.settings.activateAccessKey(accessKeyInput.value);
    if (!response.ok) {
      accessKeyStatus.textContent = response.error || t('ui.errActivateKey', 'No se pudo activar la clave.');
      accessKeyStatus.classList.add('error');
      if (response.product) renderProduct(response.product);
      return;
    }
    accessKeyInput.value = '';
    accessKeyStatus.textContent = t('ui.proKeyActivated', 'Pro activado. Ya podés prender las opciones Pro en Ajustes.');
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
    t('ui.togAutoUpdate', 'Actualizaciones automáticas'),
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
let initialBootDone = false;
const bootStartedAt = Date.now();
const BOOT_MIN_MS = 520;

function setBootProgress(pct) {
  const fill = el('appBootFill');
  if (!fill) return;
  fill.classList.toggle('is-p35', pct >= 30 && pct < 65);
  fill.classList.toggle('is-p72', pct >= 65 && pct < 95);
  fill.classList.toggle('is-p100', pct >= 95);
}

if (typeof UiSfx === 'object') {
  setTimeout(() => {
    if (!initialBootDone) UiSfx.play('bootLoad');
  }, 60);
}
requestAnimationFrame(() => setBootProgress(35));

function finishBootLoader() {
  if (initialBootDone) return;
  initialBootDone = true;
  const loader = el('appBootLoader');
  if (!loader) return;
  setBootProgress(100);
  const elapsed = Date.now() - bootStartedAt;
  const waitMs = Math.max(240, BOOT_MIN_MS - elapsed);
  setTimeout(() => {
    if (typeof UiSfx === 'object') UiSfx.play('bootReady');
    loader.classList.add('is-done');
    if (activePage === 'welcome' && welcomeHomeUi && typeof welcomeHomeUi.playChoreography === 'function') {
      setTimeout(() => welcomeHomeUi.playChoreography({ force: true }), 90);
    } else if (activePage === 'central' && centralDashboardEl && window.RelicSmoothMotion?.observeReveal) {
      setTimeout(() => window.RelicSmoothMotion.observeReveal(centralDashboardEl), 90);
    }
    if (pendingExpiredOfferLicense) {
      const lic = pendingExpiredOfferLicense;
      pendingExpiredOfferLicense = null;
      setTimeout(() => openExpiredOfferModal(lic), 520);
    }
    setTimeout(() => { loader.hidden = true; }, 380);
  }, waitMs);
}
setTimeout(finishBootLoader, 3800);

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
      mapArt: info.mapArt,
      i18n: typeof AppI18n === 'object' ? AppI18n : null,
    });
  }
  if (!initialBootDone) setBootProgress(68);
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
  if (onlyWhenGameRunningInput) onlyWhenGameRunningInput.checked = info.onlyWhenGameRunning !== false;
  openAtLoginPref = info.openAtLogin !== false;
  if (openAtLoginInput) openAtLoginInput.checked = openAtLoginPref;
  paintAutoStartToggle();
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
  if (info.trialHours != null) syncTrialHoursFrom(info);
  if (info.product) renderProduct({ ...info.product, remoteLicense: info.remoteLicense || info.product.remoteLicense, trialHours: info.trialHours ?? info.product.trialHours });
  if (!initialBootDone && !info.profileId && window.settings?.auto) {
    try {
      const autoRes = await window.settings.auto();
      if (autoRes?.ok && autoRes.profileId) {
        info.profileId = autoRes.profileId;
        info.alias = autoRes.alias || info.alias;
        info.origin = 'auto';
      }
    } catch {
      /* ignore auto-detect fallback error */
    }
  }
  paintAccountHeader(info);
  applyLanguageUi(info.activeLanguage || 'es-MX');
  autoUpdateInput.checked = Boolean(info.autoUpdate);
  matchStartedAt = Number.isFinite(info.matchStartedAt) && info.matchStartedAt > 0
    ? info.matchStartedAt
    : null;
  paintClock();
  syncWizardAccount(info);
  showWelcomeHomePref = info.showWelcomeHome !== false;
  paintWelcomeToggle();
  if (!initialBootDone) {
    const canShowWelcome = showWelcomeHomePref && info.wizardCompleted !== false && !matchStartedAt;
    goTo(canShowWelcome ? 'welcome' : 'central');
  }
  // Cargar bajo demanda la pestaña activa y revelar la app con todo ya cargado.
  try {
    if (activePage === 'welcome') await loadWelcome(false);
    else if (activePage === 'central') await loadCentral(false);
    else if (activePage === 'postmatch') await loadPostMatch();
    else if (activePage === 'tactics') await loadTactics();
  } finally {
    finishBootLoader();
  }
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
  setStatus(t('ui.saving', 'Guardando…'));
  const response = await window.settings.pick(profileId);
  manualBtn.disabled = false;
  if (!response.ok) {
    setStatus(response.error || t('ui.errSaveProfile', 'No se pudo guardar el perfil'), true);
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
  paintSearchState(t('ui.searching', 'Buscando…'));
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
        results.length ? (results.length === 1 ? t('ui.oneResult', '1 resultado') : t('ui.manyResults', '{n} resultados', { n: results.length })) : t('ui.noResultsLabel', 'Sin resultados'),
      );
      paintSearchHelp(Boolean(results.length));
      setStatus('');
    } catch (err) {
      if (token !== searchToken) return;
      results = [];
      renderResults();
      paintSearchState('Error al buscar');
      setStatus(err?.message || t('ui.connSearchErr', 'Error de conexión al buscar'), true);
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
    setStatus(t('ui.pasteNumericId', 'Pegá un profile ID numérico'), true);
    return;
  }
  choose(numeric);
});

autoBtn.addEventListener('click', async () => {
  autoBtn.disabled = true;
  setStatus(t('ui.detectingPcAcc', 'Buscando la cuenta del juego en esta PC…'));
  const response = await window.settings.auto();
  autoBtn.disabled = false;
  if (!response.ok) {
    setStatus(response.error || t('ui.noAccFound', 'No se encontró ninguna cuenta'), true);
    return;
  }
  setStatus(`Detectada: ${response.alias || 'sin alias'} (#${response.profileId})`);
  await loadCurrent();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const referralBackdrop = el('referralBackdrop');
  if (referralBackdrop && !referralBackdrop.hidden) {
    closeReferralModal();
    return;
  }
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
const PAGE_ORDER = ['player', 'central', 'overlay', 'tactics', 'postmatch', 'training', 'skins', 'plans', 'updater'];
const PAGE_META = {
  welcome: { index: '00 / INICIO', title: 'Bienvenido a Relic', sub: 'Pulso global del ladder y tu resumen diario.' },
  player: { index: '01 / CUENTA', title: 'Cuenta de jugador', sub: 'Tu cuenta en el juego y tus últimas partidas.' },
  central: { index: '02 / CENTRAL', title: 'Central de estadísticas', sub: 'Tu evolución y el historial de cada modo.' },
  overlay: { index: '03 / PREMATCH', title: 'Prepará la partida.', sub: 'Qué se ve en cola y al entrar a la partida · vista previa en vivo.' },
  tactics: { index: '03 / BATALLA', title: 'Batalla', sub: 'Guía de civilización, build order y oportunidades en partida.' },
  postmatch: { index: '05 / POSTMATCH', title: 'Aprendé de cada partida.', sub: 'Tus últimas 10 partidas, resultado y evolución detallada.' },
  training: { index: '06 / ENTRENAMIENTO', title: 'Entrenamiento', sub: 'Práctica guiada de aperturas, tiempos de edad y objetivos tácticos.' },
  skins: { index: '07 / APARIENCIA', title: 'Tu panel, a tu manera.', sub: 'Cómo se ve el overlay sobre el juego.' },
  plans: { index: '08 / PLAN Y ACCESO', title: 'Elegí cuánto ver.', sub: 'Free para competir; Pro para el Prematch; Ultra para la experiencia completa.' },
  updater: { index: '09 / ACTUALIZACIONES', title: 'Mantené la app al día.', sub: 'Actualizaciones seguras, también en plena temporada.' },
};

let activePage = 'player';
let postmatchLoadedAt = 0;
let tacticsLoadedAt = 0;
document.body.dataset.page = activePage;

function syncSidebarGlideIndicator(instant = false) {
  if (typeof RelicSmoothMotion !== 'object' || typeof RelicSmoothMotion.syncGlideIndicator !== 'function') return;
  const railNav = document.querySelector('.rail-nav');
  if (!railNav) return;
  const activeBtn = railNav.querySelector('.nav-item.active');
  if (!activeBtn) {
    const existing = railNav.querySelector('.rail-glide-indicator');
    if (existing) existing.classList.add('is-hidden');
    return;
  }
  const existing = railNav.querySelector('.rail-glide-indicator');
  if (existing) existing.classList.remove('is-hidden');
  RelicSmoothMotion.syncGlideIndicator(railNav, activeBtn, {
    key: 'main-sidebar',
    axis: 'y',
    className: 'rail-glide-indicator',
    instant,
  });
}

function goTo(page) {
  if (!PAGE_META[page]) return;
  const prevPage = activePage;
  const changed = prevPage !== page;
  if (prevPage === 'training' && page !== 'training' && trainingUi && typeof trainingUi.onLeavePage === 'function') {
    trainingUi.onLeavePage();
  }
  activePage = page;
  document.body.dataset.page = page;
  for (const button of navButtons) {
    const current = button.dataset.page === page;
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  syncSidebarGlideIndicator(!changed);
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
  if (changed) {
    const headEl = document.querySelector('.content-head');
    if (headEl) {
      headEl.classList.remove('is-title-swap');
      void headEl.offsetWidth;
      headEl.classList.add('is-title-swap');
    }
  }
  if (page === 'welcome') {
    loadWelcome(false);
    if (changed && initialBootDone && welcomeHomeUi && typeof welcomeHomeUi.playChoreography === 'function') {
      welcomeHomeUi.playChoreography({ force: true });
    }
  }
  if (page === 'player') { paintPoll(); paintClock(); }
  if (page === 'central') {
    loadCentral(false);
    if (changed && initialBootDone && centralDashboardEl && centralDashboardEl.children.length && window.RelicSmoothMotion?.observeReveal) {
      requestAnimationFrame(() => window.RelicSmoothMotion.observeReveal(centralDashboardEl));
    }
  }
  if (page === 'postmatch') {
    if (!lastPostMatchPayload || Date.now() - postmatchLoadedAt > 20000) {
      postmatchLoadedAt = Date.now();
      loadPostMatch();
    } else if (changed && postMatchReportEl && postMatchReportEl.children.length && window.RelicSmoothMotion?.observeReveal) {
      requestAnimationFrame(() => window.RelicSmoothMotion.observeReveal(postMatchReportEl));
    }
  }
  if (page === 'tactics' && (!lastTacticsPayload || Date.now() - tacticsLoadedAt > 20000)) {
    tacticsLoadedAt = Date.now();
    loadTactics();
  }
  if (page === 'training' && trainingUi) {
    trainingUi.load();
  }
  if (pagesEl) {
    if (typeof RelicSmoothMotion === 'object' && typeof RelicSmoothMotion.cancelVertState === 'function') {
      RelicSmoothMotion.cancelVertState(pagesEl);
    }
    pagesEl.scrollTop = 0;
  }
}

window.addEventListener('resize', () => syncSidebarGlideIndicator(true));
requestAnimationFrame(() => syncSidebarGlideIndicator(true));

const trainingUi = (typeof TrainingUI === 'object' && typeof TrainingUI.createTrainingControllerUi === 'function' && el('trainingRoot'))
  ? TrainingUI.createTrainingControllerUi({
      container: el('trainingRoot'),
      goTo,
      onClaimTrial: () => {
        goTo('plans');
        const btn = el('claimUltraTrialBtn');
        if (btn && !btn.hidden) btn.click();
      },
    })
  : null;

const welcomeHomeUi = (typeof WelcomeHomeUI === 'object' && typeof WelcomeHomeUI.createWelcomeHomeUi === 'function' && el('welcomeRoot'))
  ? WelcomeHomeUI.createWelcomeHomeUi({
      container: el('welcomeRoot'),
      goTo,
      openTechTree: async () => {
        goTo('training');
        if (trainingUi) {
          await trainingUi.load();
          if (typeof trainingUi.switchSubtab === 'function') {
            trainingUi.switchSubtab('techtree');
          }
        }
      },
      openAnnouncementUrl: () => {
        if (typeof window.settings?.welcomeOpenAnnouncementUrl === 'function') {
          window.settings.welcomeOpenAnnouncementUrl();
        }
      },
    })
  : null;

let showWelcomeHomePref = true;
let openAtLoginPref = true;
async function loadWelcome(force = false) {
  if (!welcomeHomeUi || typeof window.settings?.welcomeGet !== 'function') return;
  try {
    const res = await window.settings.welcomeGet({ force });
    if (res && res.ok) welcomeHomeUi.setData(res);
  } catch { /* ignore */ }
}

if (typeof window.settings?.onWelcome === 'function') {
  window.settings.onWelcome((payload) => {
    if (welcomeHomeUi && payload && payload.ok) {
      welcomeHomeUi.setData(payload);
    }
  });
}

el('railHomeBtn')?.addEventListener('click', () => {
  if (typeof UiSfx === 'object') UiSfx.play('tab');
  goTo('welcome');
});

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
    updPhase.textContent = t('ui.updNewerFound', 'Apareció una versión más nueva: actualizo el estado…');
    renderUpdater(await window.settings.updaterCheck());
    return;
  }
  updateBtn.disabled = true;
  if (updaterState.ready) {
    updPhase.textContent = t('ui.updInstalling', 'Instalando la actualización…');
    const result = await window.settings.updaterInstall();
    // Si había partida, install() pospone y el broadcast ya repinta el panel.
    // Esto evita que quede «Instalando…» si el evento llega antes del repintado.
    if (result && result.ok === false && result.reason === 'match') {
      updPhase.textContent = t('ui.updInMatchWait', 'Hay partida en curso: se instala sola apenas termines.');
    }
    return;
  }
  if (updaterState.available) {
    updPhase.textContent = t('ui.updDownloading', 'Descargando paquete de actualización…');
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
  updPhase.textContent = t('ui.updChecking', 'Buscando una versión nueva…');
  renderUpdater(await window.settings.updaterCheck());
});

skipBtn.addEventListener('click', async () => {
  renderUpdater(await window.settings.updaterSkip());
  setStatus(t('ui.updSkipped', 'Omitida por ahora: no se instala al salir en esta sesión.'));
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
  paintWelcomeToggle();
  paintAutoStartToggle();
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
  if (typeof syncPlanPricingUi === 'function') syncPlanPricingUi();
  if (typeof paintReferralsSummary === 'function') paintReferralsSummary(latestReferralsState);
  if (typeof paintWelcomeStartupPref === 'function') paintWelcomeStartupPref();
  if (typeof welcomeHomeUi !== 'undefined' && welcomeHomeUi && typeof welcomeHomeUi.rerender === 'function') {
    welcomeHomeUi.rerender();
  }
  if (typeof trainingUi !== 'undefined' && trainingUi && typeof trainingUi.rerender === 'function') {
    trainingUi.rerender();
  }
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
      attachDiagnostics: el('feedbackAttachDiag') ? Boolean(el('feedbackAttachDiag').checked) : true,
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

function paintWelcomeToggle() {
  const btn = el('prefsWelcomeBtn');
  if (btn) {
    btn.textContent = showWelcomeHomePref
      ? t('prefs.welcomeOn', 'Inicio al abrir · Activo')
      : t('prefs.welcomeOff', 'Inicio al abrir · Oculto');
  }
  document.querySelectorAll('[data-startup-page]').forEach((segBtn) => {
    const isWelcome = segBtn.getAttribute('data-startup-page') === 'welcome';
    const active = isWelcome === showWelcomeHomePref;
    segBtn.classList.toggle('is-active', active);
    segBtn.setAttribute('aria-pressed', String(active));
  });
}
async function setStartupWelcomePref(nextVal) {
  const clean = Boolean(nextVal);
  if (showWelcomeHomePref === clean) return;
  showWelcomeHomePref = clean;
  paintWelcomeToggle();
  if (typeof UiSfx === 'object') UiSfx.play('toggle');
  if (typeof window.settings?.showWelcomeHome === 'function') {
    await window.settings.showWelcomeHome(showWelcomeHomePref);
  }
}
el('prefsWelcomeBtn')?.addEventListener('click', () => setStartupWelcomePref(!showWelcomeHomePref));

function paintAutoStartToggle() {
  const btn = el('prefsAutoStartBtn');
  if (btn) {
    btn.textContent = openAtLoginPref
      ? t('prefs.autoStartOn', 'Iniciar con Windows · Activo')
      : t('prefs.autoStartOff', 'Iniciar con Windows · Desactivado');
  }
}
el('prefsAutoStartBtn')?.addEventListener('click', async () => {
  const nextVal = !openAtLoginPref;
  openAtLoginPref = nextVal;
  if (openAtLoginInput) openAtLoginInput.checked = nextVal;
  paintAutoStartToggle();
  if (typeof UiSfx === 'object') UiSfx.play('toggle');
  if (typeof window.settings?.openAtLogin === 'function') {
    const res = await window.settings.openAtLogin(nextVal);
    if (res?.onlyWhenGameRunning != null && onlyWhenGameRunningInput) {
      onlyWhenGameRunningInput.checked = Boolean(res.onlyWhenGameRunning);
    }
  }
});
document.querySelectorAll('[data-startup-page]').forEach((segBtn) => {
  segBtn.addEventListener('click', () => {
    const wantsWelcome = segBtn.getAttribute('data-startup-page') === 'welcome';
    setStartupWelcomePref(wantsWelcome);
  });
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
        box.innerHTML = `<div class="central-search-feedback is-empty">${escapeHtml(t('ui.noResultsShort', 'Sin resultados para "{q}".', { q }))}</div>`;
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
            setStatus(picked?.error || t('ui.errSaveProfile', 'No se pudo guardar el perfil'), true);
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
      if (railUserAvatar) {
        railUserAvatar.classList.add('is-guest');
        railUserAvatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5.5 19.2c1.2-3 3.7-4.5 6.5-4.5s5.3 1.5 6.5 4.5"/></svg>';
      }
      if (railUserName) railUserName.textContent = lastAccountInfo.alias || t('account.signInRail', 'Iniciar sesión');
      if (railUserSub) railUserSub.textContent = lastAccountInfo.alias ? t('ui.unsynced', 'Sin sincronizar') : t('ui.accountShort', 'Cuenta');
      if (typeof syncPlanPricingUi === 'function') syncPlanPricingUi();
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

    // 3. Unified left rail profile footer
    if (railUserBtn) railUserBtn.classList.add('is-signed');
    if (railUserAvatar) {
      railUserAvatar.classList.remove('is-guest');
      railUserAvatar.textContent = initial;
    }
    if (railUserName) railUserName.textContent = displayName;
    if (railUserSub) railUserSub.textContent = `${activeDevices.length}/${maxDev} PCs`;

    // 4. First-launch wizard step 1 + summary
    if (wizSignedOut) wizSignedOut.hidden = true;
    if (wizSignedIn) wizSignedIn.hidden = false;
    if (wizAuthAvatar) wizAuthAvatar.textContent = initial;
    if (wizAuthName) wizAuthName.textContent = displayName;
    if (wizAuthEmail) wizAuthEmail.textContent = email;
    if (typeof syncPlanPricingUi === 'function') syncPlanPricingUi();
    renderWizardStep();

    if (devicesListEl) {
      devicesListEl.replaceChildren();
      if (!activeDevices.length) {
        const empty = document.createElement('li');
        empty.className = 'relic-device-item';
        empty.innerHTML = `<div class="relic-device-meta"><small>${escapeHtml(t('ui.noDevicesYet', 'Sin PCs registradas todavía.'))}</small></div>`;
        devicesListEl.appendChild(empty);
      } else {
        for (const dev of activeDevices) {
          const isCurrent = dev.machineHash === auth.currentMachineHash;
          const li = document.createElement('li');
          li.className = 'relic-device-item';
          const meta = document.createElement('div');
          meta.className = 'relic-device-meta';
          meta.innerHTML = `<b>${escapeHtml(dev.deviceName || 'PC')}${isCurrent ? '<span class="relic-this-pc">Esta PC</span>' : ''}</b>` +
            `<small>${escapeHtml([dev.appVersion ? `v${dev.appVersion}` : null, t('ui.lastSeenRel', 'última vez {time}', { time: fmtRelTime(dev.lastSeenAt) })].filter(Boolean).join(' · '))}</small>`;
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
        if (res.product?.plan === 'promax' || String(res.plan || '').toLowerCase() === 'promax') {
          openUltraWelcomePopup(res.product || currentProduct, { force: true });
        }
        setStatus(t('ui.googleSignedIn', 'Sesión de Google iniciada.'));
      } else {
        setAllAuthStatus(res?.error || t('ui.authSignInErr', 'No se pudo iniciar sesión.'));
      }
    } catch (err) {
      setAllAuthStatus(err?.message || t('ui.authSignInFail', 'Error al iniciar sesión.'));
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
      setStatus(t('ui.signedOut', 'Sesión cerrada.'));
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
        if (redeemStatusEl) redeemStatusEl.textContent = t('ui.planRedeemed', '¡Plan {plan} activado (+{days} días)!', { plan: String(res.plan || '').toUpperCase(), days: res.durationDays });
        if (res.auth) paintAuth(res.auth);
        if (res.product) renderProduct(res.product);
        if (res.product?.plan === 'promax' || String(res.plan || '').toLowerCase() === 'promax') {
          openUltraWelcomePopup(res.product || currentProduct, { force: true });
        }
      } else if (redeemStatusEl) {
        redeemStatusEl.textContent = res?.error || t('ui.invalidKey', 'Clave inválida.');
      }
    } finally {
      if (redeemBtn) redeemBtn.disabled = false;
    }
  });

  window.settings.onAuth?.((auth) => paintAuth(auth));
  window.settings.authStatus().then((res) => { if (res?.auth) paintAuth(res.auth); }).catch(() => {});
})();

/* ==================== PLANS BILLING CYCLE & CHECKOUT PREVIEW ==================== */
const PLAN_CATALOG = {
  pro: {
    name: 'Relic Pro',
    monthlyPrice: '$1.99',
    annualMonthlyEq: '$1.58',
    annualTotal: '$18.99',
    annualSave: '$4.89',
    monthlySub: 'USD · Facturación mensual',
    annualSub: 'USD / mes · Facturado anualmente',
    perks: [
      'Prematch completo: aperturas reales, counter-pick y plan de partida',
      'Central: ventanas seleccionables Últ. 10 y Últ. 20 partidas',
      'Incluye todo lo de Free (ELO y Cara a cara)',
    ],
  },
  promax: {
    name: 'Relic Ultra',
    monthlyPrice: '$2.99',
    annualMonthlyEq: '$2.42',
    annualTotal: '$28.99',
    annualSave: '$6.89',
    monthlySub: 'USD · Solo +$1 sobre Pro',
    annualSub: 'USD / mes · Facturado anualmente',
    perks: [
      'Todo Pro + Postmatch v6 completo (56 civilizaciones y 8 insights)',
      'Central ampliado: hasta 200 partidas oficiales por modo y diagnósticos',
      'Smart Build Order durante la partida + Smurf Detector',
    ],
  },
};

let activeBillingCycle = 'monthly';
let activeCheckoutPlan = 'promax';

function syncPlanPricingUi() {
  const isAnnual = activeBillingCycle === 'annual';
  const plansGrid = el('plansGrid');
  if (plansGrid) plansGrid.dataset.billingCycle = activeBillingCycle;

  document.querySelectorAll('[data-billing-cycle]').forEach((btn) => {
    const on = btn.dataset.billingCycle === activeBillingCycle;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  const proAmt = el('proPriceAmount');
  const proStrike = el('proPriceStrike');
  const proSub = el('proPriceSub');
  const proSave = el('proAnnualSave');
  if (proAmt) proAmt.textContent = isAnnual ? PLAN_CATALOG.pro.annualMonthlyEq : PLAN_CATALOG.pro.monthlyPrice;
  if (proStrike) proStrike.hidden = !isAnnual;
  if (proSub) proSub.textContent = isAnnual
    ? t('plansPage.proAnnualSub', PLAN_CATALOG.pro.annualSub)
    : t('plansPage.proMonthlySub', PLAN_CATALOG.pro.monthlySub);
  if (proSave) proSave.hidden = !isAnnual;

  const uAmt = el('ultraPriceAmount');
  const uStrike = el('ultraPriceStrike');
  const uSub = el('ultraPriceSub');
  const uSave = el('ultraAnnualSave');
  if (uAmt) uAmt.textContent = isAnnual ? PLAN_CATALOG.promax.annualMonthlyEq : PLAN_CATALOG.promax.monthlyPrice;
  if (uStrike) uStrike.hidden = !isAnnual;
  if (uSub) uSub.textContent = isAnnual
    ? t('plansPage.ultraAnnualSub', PLAN_CATALOG.promax.annualSub)
    : t('plansPage.ultraMonthlySub', PLAN_CATALOG.promax.monthlySub);
  if (uSave) uSave.hidden = !isAnnual;

  const curPlan = currentProduct?.plan === 'beta' ? 'promax' : (currentProduct?.plan || 'free');
  const PLAN_RANK = { free: 0, pro: 1, promax: 2 };
  const curRank = PLAN_RANK[curPlan] ?? 0;
  const trialBtn = el('claimUltraTrialBtn');
  const trialAvail = isUltraTrialAvailable(currentProduct);
  if (trialBtn) {
    trialBtn.hidden = !trialAvail;
    if (!trialBtn.disabled) {
      trialBtn.textContent = t('plansPage.ctaTrialDyn', 'Probar Ultra {dur} gratis', { dur: formatTrialDuration(currentTrialHours, { short: true }) });
    }
  }
  if (typeof trainingUi !== 'undefined' && trainingUi) {
    if (typeof trainingUi.setTrialHours === 'function') {
      trainingUi.setTrialHours(currentTrialHours);
    }
    if (typeof trainingUi.setTrialAvailable === 'function') {
      trainingUi.setTrialAvailable(trialAvail);
    }
  }
  if (currentProduct && typeof syncLockedPageShowcases === 'function') {
    syncLockedPageShowcases(currentProduct);
  }
  const periodWord = isAnnual ? t('plansPage.periodYr', 'año') : t('plansPage.periodMo', 'mes');
  document.querySelectorAll('[data-plan-checkout]').forEach((btn) => {
    const target = btn.dataset.planCheckout;
    const targetRank = PLAN_RANK[target] ?? 0;
    const isCurrent = target === curPlan;
    const isIncludedInHigher = targetRank < curRank;
    btn.disabled = isCurrent || isIncludedInHigher;
    if (isCurrent) {
      btn.textContent = t('plansPage.currentPlanBtn', 'Tu plan actual');
    } else if (isIncludedInHigher) {
      btn.textContent = t('plansPage.includedInUltra', 'Incluido en tu plan Ultra');
    } else if (target === 'pro') {
      const price = isAnnual ? '$18.99' : '$1.99';
      btn.textContent = t('plansPage.continueProPrice', 'Continuar con Pro · {price}/{period}', { price, period: periodWord });
    } else {
      const price = isAnnual ? '$28.99' : '$2.99';
      btn.textContent = t('plansPage.chooseUltraPrice', 'Elegir Ultra · {price}/{period} →', { price, period: periodWord });
    }
  });
}

let activeCheckoutMethod = 'crypto';
let activeCheckoutCoin = 'polygon_usdc';
let activeCheckoutOrderId = null;
let checkoutPollTimer = null;

function stopCheckoutPolling() {
  if (checkoutPollTimer) {
    clearInterval(checkoutPollTimer);
    checkoutPollTimer = null;
  }
}

function resetCheckoutOrderUi() {
  stopCheckoutPolling();
  activeCheckoutOrderId = null;
  const depBox = el('checkoutDepositBox');
  if (depBox) depBox.hidden = true;
  const confirmBtn = el('checkoutConfirmBtn');
  if (confirmBtn) confirmBtn.disabled = false;
}

function paintCheckoutModal() {
  const cfg = PLAN_CATALOG[activeCheckoutPlan] || PLAN_CATALOG.promax;
  const isAnnual = activeBillingCycle === 'annual';
  if (!isAnnual && activeCheckoutMethod === 'card') activeCheckoutMethod = 'crypto';
  const isCard = activeCheckoutMethod === 'card' && isAnnual;
  const coinLabel = activeCheckoutCoin === 'polygon_usdt' ? 'USDT' : 'USDC';

  const titleEl = el('checkoutModalTitle');
  const optM = el('checkoutOptMonthly');
  const optA = el('checkoutOptAnnual');
  const lineEl = el('checkoutPlanLine');
  const subEl = el('checkoutSubtotal');
  const saveRow = el('checkoutSaveRow');
  const saveVal = el('checkoutSaveVal');
  const totalEl = el('checkoutTotal');
  const perksEl = el('checkoutPerks');
  const confirmBtn = el('checkoutConfirmBtn');
  const noteEl = el('checkoutPreviewNote');
  const cardBtn = el('checkoutMethodCard');
  const cryptoBtn = el('checkoutMethodCrypto');
  const cardSub = el('checkoutMethodCardSub');
  const coinRow = el('checkoutCoinRow');
  const coinLabelEl = el('checkoutCoinLabel');

  if (titleEl) titleEl.textContent = cfg.name;
  const moLbl = t('plansPage.periodMo', 'mes');
  const yrLbl = t('plansPage.periodYr', 'año');
  const cycleLbl = isAnnual ? t('checkout.annual', 'Anual') : t('checkout.monthly', 'Mensual');
  if (optM) optM.textContent = `${cfg.monthlyPrice}/${moLbl}`;
  if (optA) optA.textContent = `${cfg.annualTotal}/${yrLbl}`;
  if (lineEl) lineEl.textContent = t('checkout.planLine', 'Plan {name} ({cycle})', { name: cfg.name, cycle: cycleLbl });
  if (subEl) subEl.textContent = isAnnual ? `${cfg.annualTotal} USD` : `${cfg.monthlyPrice} USD`;
  if (saveRow) {
    saveRow.hidden = false;
    saveRow.classList.toggle('is-muted', !isAnnual);
  }
  if (saveVal) saveVal.textContent = isAnnual ? `−${cfg.annualSave} USD` : t('checkout.noDiscount', 'Sin descuento');
  if (totalEl) totalEl.textContent = isAnnual ? `${cfg.annualTotal} USD` : `${cfg.monthlyPrice} USD`;

  document.querySelectorAll('[data-checkout-cycle]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.checkoutCycle === activeBillingCycle);
  });
  if (cryptoBtn) cryptoBtn.classList.toggle('is-active', !isCard);
  if (cardBtn) {
    cardBtn.classList.toggle('is-active', isCard);
    cardBtn.classList.toggle('is-annual-nudge', !isAnnual);
  }
  if (cardSub) {
    cardSub.textContent = isAnnual ? 'Visa · Mastercard · PayGate' : 'Solo plan Anual (−20%)';
  }
  if (coinRow) coinRow.classList.toggle('is-card-mode', isCard);
  if (coinLabelEl) {
    coinLabelEl.textContent = isCard
      ? t('ui.cardViaPaygate', 'Pago con tarjeta procesado vía PayGate.to')
      : 'Moneda en red Polygon (PoS)';
  }
  document.querySelectorAll('[data-checkout-coin]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.checkoutCoin === activeCheckoutCoin);
  });

  if (perksEl) {
    perksEl.replaceChildren();
    cfg.perks.forEach((txt) => {
      const li = document.createElement('li');
      li.textContent = txt;
      perksEl.appendChild(li);
    });
  }

  const priceStr = isAnnual ? cfg.annualTotal : cfg.monthlyPrice;
  if (confirmBtn && !activeCheckoutOrderId) {
    confirmBtn.textContent = isCard
      ? `Pagar ${priceStr} con tarjeta →`
      : `Pagar ${priceStr} en ${coinLabel} (Polygon)`;
  }
  if (noteEl && !activeCheckoutOrderId) {
    noteEl.hidden = false;
    noteEl.textContent = isCard
      ? t('ui.cardBrowserNote', 'Se abrirá PayGate.to en tu navegador. Al confirmarse el pago, tu plan se activa automáticamente.')
      : t('ui.polygonNote', 'Genera una dirección única en red Polygon ({coin}). Tu plan se activa automáticamente al confirmarse.', { coin: coinLabel });
  }
}

function startCheckoutPolling(orderId) {
  stopCheckoutPolling();
  activeCheckoutOrderId = orderId;
  checkoutPollTimer = setInterval(async () => {
    if (!activeCheckoutOrderId || typeof window.settings?.checkoutStatus !== 'function') return;
    try {
      const res = await window.settings.checkoutStatus(activeCheckoutOrderId);
      if (res?.ok && res.order?.status === 'paid') {
        stopCheckoutPolling();
        const badge = el('checkoutOrderStatusBadge');
        if (badge) {
          badge.textContent = t('ui.paymentConfirmed', '¡Pago confirmado!');
          badge.classList.add('is-paid');
        }
        const noteEl = el('checkoutPreviewNote');
        if (noteEl) noteEl.textContent = t('ui.paymentActiveNote', '¡Listo! Tu plan ya quedó activado en tu cuenta Relic.');
        const confirmBtn = el('checkoutConfirmBtn');
        if (confirmBtn) {
          confirmBtn.textContent = 'Plan activado ✓';
          confirmBtn.disabled = true;
        }
        if (res.product) renderProduct(res.product);
      }
    } catch (_) {}
  }, 5000);
}

function openCheckoutModal(planKey) {
  activeCheckoutPlan = planKey === 'pro' ? 'pro' : 'promax';
  activeCheckoutMethod = activeBillingCycle === 'annual' ? 'card' : 'crypto';
  resetCheckoutOrderUi();
  paintCheckoutModal();
  const modal = el('planCheckoutModal');
  if (modal) modal.hidden = false;
}

function closeCheckoutModal() {
  resetCheckoutOrderUi();
  const modal = el('planCheckoutModal');
  if (modal) modal.hidden = true;
  syncPlanPricingUi();
}

document.querySelectorAll('[data-billing-cycle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.billingCycle === 'annual' ? 'annual' : 'monthly';
    if (next === activeBillingCycle) return;
    activeBillingCycle = next;
    syncPlanPricingUi();
    paintCheckoutModal();
  });
});

document.querySelectorAll('[data-plan-checkout]').forEach((btn) => {
  btn.addEventListener('click', () => openCheckoutModal(btn.dataset.planCheckout));
});

document.querySelectorAll('[data-checkout-cycle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.checkoutCycle === 'annual' ? 'annual' : 'monthly';
    if (next === activeBillingCycle) return;
    activeBillingCycle = next;
    if (next === 'monthly') activeCheckoutMethod = 'crypto';
    resetCheckoutOrderUi();
    paintCheckoutModal();
  });
});

document.querySelectorAll('[data-checkout-method]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.checkoutMethod === 'card' ? 'card' : 'crypto';
    if (next === 'card' && activeBillingCycle !== 'annual') {
      activeBillingCycle = 'annual';
    }
    activeCheckoutMethod = next;
    resetCheckoutOrderUi();
    paintCheckoutModal();
  });
});

document.querySelectorAll('[data-checkout-coin]').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeCheckoutCoin = btn.dataset.checkoutCoin === 'polygon_usdt' ? 'polygon_usdt' : 'polygon_usdc';
    resetCheckoutOrderUi();
    paintCheckoutModal();
  });
});

el('checkoutCopyAddrBtn')?.addEventListener('click', async () => {
  const addr = el('checkoutDepositAddr')?.textContent?.trim();
  if (!addr) return;
  try {
    await navigator.clipboard.writeText(addr);
    const btn = el('checkoutCopyAddrBtn');
    if (btn) {
      btn.textContent = 'Copiada ✓';
      setTimeout(() => { btn.textContent = 'Copiar'; }, 1800);
    }
  } catch (_) {}
});

el('checkoutCloseBtn')?.addEventListener('click', closeCheckoutModal);

const checkoutBackdropEl = el('planCheckoutModal');
checkoutBackdropEl?.addEventListener('click', (e) => {
  if (e.target === checkoutBackdropEl) closeCheckoutModal();
});

el('checkoutConfirmBtn')?.addEventListener('click', async () => {
  const btn = el('checkoutConfirmBtn');
  const noteEl = el('checkoutPreviewNote');
  if (typeof window.settings?.checkoutCreate !== 'function') return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generando orden...';
  }
  try {
    const res = await window.settings.checkoutCreate({
      plan: activeCheckoutPlan,
      cycle: activeBillingCycle,
      method: activeCheckoutMethod,
      coin: activeCheckoutCoin,
    });
    if (!res?.ok) {
      if (btn) btn.disabled = false;
      paintCheckoutModal();
      if (res?.authRequired || res?.unauthorized) {
        if (noteEl) noteEl.textContent = t('ui.signInFirstCheckout', 'Iniciá sesión con Google primero para vincular tu plan automáticamente.');
        if (typeof window.settings?.authGoogleLogin === 'function') {
          await window.settings.authGoogleLogin();
        }
      } else if (noteEl) {
        noteEl.textContent = res?.error || t('ui.orderCreateErr', 'No se pudo generar la orden de pago. Intentá de nuevo.');
      }
      return;
    }
    const order = res.order || {};
    if (order.method === 'crypto' && order.depositAddress) {
      const depBox = el('checkoutDepositBox');
      const depAmt = el('checkoutDepositAmount');
      const depAddr = el('checkoutDepositAddr');
      const badge = el('checkoutOrderStatusBadge');
      if (depAmt) depAmt.textContent = `$${Number(order.amountUsd).toFixed(2)} ${order.currency || 'USDC'}`;
      if (depAddr) depAddr.textContent = order.depositAddress;
      if (badge) {
        badge.textContent = 'Esperando pago';
        badge.classList.remove('is-paid');
      }
      if (depBox) depBox.hidden = false;
      if (btn) btn.textContent = 'Esperando transferencia en Polygon...';
      if (noteEl) noteEl.textContent = 'Apenas se confirme en Polygon (suele tardar 10–30 s), tu plan se activa solo.';
    } else {
      if (btn) btn.textContent = 'Ventana de pago abierta · Esperando...';
      if (noteEl) noteEl.textContent = t('ui.completePaygateNote', 'Completá el pago en PayGate.to en tu navegador. Esta ventana se actualizará sola.');
    }
    if (order.orderId) startCheckoutPolling(order.orderId);
  } catch (_) {
    if (btn) btn.disabled = false;
    paintCheckoutModal();
    if (noteEl) noteEl.textContent = t('ui.orderConnErr', 'Error de conexión al crear la orden.');
  }
});

el('checkoutUseKeyBtn')?.addEventListener('click', () => {
  closeCheckoutModal();
  const input = el('redeemKeyInput');
  const card = el('planRedeemCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (input && !input.closest('[hidden]')) input.focus();
});

el('claimUltraTrialBtn')?.addEventListener('click', async () => {
  const btn = el('claimUltraTrialBtn');
  const statusEl = el('claimUltraTrialStatus');
  if (typeof window.settings?.claimUltraTrial !== 'function') return;
  const durShort = formatTrialDuration(currentTrialHours, { short: true });
  const restoreBtnLabel = () => {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = t('plansPage.ctaTrialDyn', 'Probar Ultra {dur} gratis', { dur: formatTrialDuration(currentTrialHours, { short: true }) });
  };
  const setStatus = (msg, cls = '') => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = `plan-trial-status${cls ? ` ${cls}` : ''}`;
    statusEl.hidden = !msg;
  };
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('plansPage.ctaTrialActivating', 'Activando {dur} de Ultra…', { dur: durShort });
  }
  setStatus('');
  try {
    const res = await window.settings.claimUltraTrial();
    if (res?.trialHours != null) syncTrialHoursFrom(res);
    if (!res?.ok) {
      if (res?.authRequired || res?.unauthorized) {
        setStatus(t('ui.trialSignInReq', 'Iniciá sesión con Google para activar tu prueba gratis de {dur} de Ultra.', { dur: formatTrialDuration(currentTrialHours, { short: true }) }));
        if (typeof window.settings?.authGoogleLogin === 'function') {
          await window.settings.authGoogleLogin();
        }
      } else {
        setStatus(res?.error || t('ui.trialActErr', 'No se pudo activar la prueba de {dur}.', { dur: formatTrialDuration(currentTrialHours, { short: true }) }), 'is-err');
      }
      restoreBtnLabel();
      return;
    }
    if (res.product) renderProduct(res.product);
    if (res.product?.plan === 'promax') openUltraWelcomePopup(res.product, { force: true });
    if (btn) btn.hidden = true;
    setStatus(t('ui.trialActOk', '¡Prueba Ultra de {dur} activada! Disfrutá la experiencia completa.', { dur: formatTrialDuration(res.trialHours || currentTrialHours, { short: true }) }), 'is-ok');
  } catch (_) {
    setStatus(t('ui.trialConnErr', 'Error de conexión al activar la prueba.'), 'is-err');
    restoreBtnLabel();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && checkoutBackdropEl && !checkoutBackdropEl.hidden) closeCheckoutModal();
  if (e.key === 'Escape' && el('ultraWelcomeBackdrop') && !el('ultraWelcomeBackdrop').hidden) closeUltraWelcomePopup();
});

let latestTrainingQueue = [];

function normalizePinSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findMatchingQueueItemForButton(btn, queue = latestTrainingQueue) {
  if (!btn || !Array.isArray(queue) || !queue.length) return null;
  const active = queue.filter((q) => q && !q.done);
  if (!active.length) return null;
  const qid = btn.dataset.tpQueueId || '';
  if (qid) {
    const byId = active.find((q) => q.id === qid);
    if (byId) return byId;
  }
  const ruleType = String(btn.dataset.tpRule || '').trim();
  const stageId = normalizePinSlug(btn.dataset.tpStage || '');
  const civNorm = normalizePinSlug(btn.dataset.tpCiv || btn.dataset.tpCivName || '');
  const mapNorm = normalizePinSlug(btn.dataset.tpMap || '');
  const titleNorm = normalizePinSlug(btn.dataset.tpTitle || '');

  return active.find((q) => {
    const qr = q.verifyRule || {};
    if (ruleType) {
      if (ruleType === 'stage_grade' && stageId) {
        if (qr.type === 'stage_grade' && normalizePinSlug(qr.stageId) === stageId) return true;
      } else if (ruleType === 'vs_civ' && civNorm) {
        if (qr.type === 'vs_civ' && normalizePinSlug(qr.targetCiv || qr.targetCivName) === civNorm) return true;
      } else if (ruleType === 'on_map' && mapNorm) {
        if (qr.type === 'on_map' && normalizePinSlug(qr.targetMap || qr.targetMapName) === mapNorm) return true;
      } else if (qr.type === ruleType || q.ruleKey === `rule:${ruleType}`) {
        return true;
      }
    }
    if (titleNorm && normalizePinSlug(q.title) === titleNorm) return true;
    return false;
  }) || null;
}

function syncAllTrainPinButtons(queue = latestTrainingQueue) {
  if (Array.isArray(queue)) latestTrainingQueue = queue;
  document.querySelectorAll('[data-train-pin]').forEach((btn) => {
    const hit = findMatchingQueueItemForButton(btn, latestTrainingQueue);
    const labelSpan = btn.querySelector('span');
    if (hit) {
      btn.classList.add('is-pinned');
      btn.dataset.tpQueueId = hit.id;
      btn.setAttribute('aria-pressed', 'true');
      btn.title = t('ui.inMyPlanTip', 'En Mi Plan · Se verificará automáticamente en tus próximas partidas (tocá para quitar)');
      if (labelSpan) labelSpan.textContent = '✓ En Mi Plan';
    } else {
      btn.classList.remove('is-pinned');
      delete btn.dataset.tpQueueId;
      btn.setAttribute('aria-pressed', 'false');
      btn.title = t('ui.addMyPlanTip', 'Agregar a Mi Plan (se verifica automáticamente en tus próximas partidas)');
      if (labelSpan && /Mi Plan/i.test(labelSpan.textContent || '')) {
        labelSpan.textContent = 'Fijar en Mi Plan';
      }
    }
  });
}

// Delegado global "Pesita en círculo" (favorito de entrenamiento) -> Mi Plan con verificación automática en partidas reales
document.addEventListener('click', async (ev) => {
  const navBtn = ev.target?.closest?.('[data-open-training-tab]');
  if (navBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    const target = String(navBtn.dataset.openTrainingTab || '').trim();
    if (typeof UiSfx === 'object') UiSfx.play('tap');
    if (target === 'postmatch') {
      goTo('postmatch');
      return;
    }
    goTo('training');
    if (trainingUi) {
      try {
        if (typeof trainingUi.load === 'function') await trainingUi.load();
        if (target && typeof trainingUi.switchSubtab === 'function') trainingUi.switchSubtab(target);
      } catch (_) {}
    }
    return;
  }

  const btn = ev.target?.closest?.('[data-train-pin]');
  if (!btn) return;
  ev.preventDefault();
  ev.stopPropagation();

  // Si ya estaba iluminada, tocar de nuevo la quita de Mi Plan (igual que una estrella de favoritos)
  if (btn.classList.contains('is-pinned') && btn.dataset.tpQueueId && typeof window.settings?.trainingQueueRemove === 'function') {
    const rem = await window.settings.trainingQueueRemove(btn.dataset.tpQueueId).catch(() => null);
    if (rem?.ok) {
      if (Array.isArray(rem.trainingQueue)) {
        syncAllTrainPinButtons(rem.trainingQueue);
        if (trainingUi && typeof trainingUi.applyRealtimeUpdate === 'function') {
          trainingUi.applyRealtimeUpdate({ trainingQueue: rem.trainingQueue });
        }
      } else {
        btn.classList.remove('is-pinned');
        delete btn.dataset.tpQueueId;
        btn.setAttribute('aria-pressed', 'false');
      }
      if (typeof UiSfx === 'object') UiSfx.play('tap');
      setStatus('Quitado de «Mi Plan».');
    }
    return;
  }

  if (typeof window.settings?.trainingQueueAdd !== 'function') return;
  const payload = {
    source: btn.dataset.tpSource || 'Relic',
    title: btn.dataset.tpTitle || '',
    detail: btn.dataset.tpDetail || '',
    metric: btn.dataset.tpMetric || '',
    targetTab: btn.dataset.tpTab || '',
    ruleType: btn.dataset.tpRule || '',
    stageId: btn.dataset.tpStage || '',
    civSlug: btn.dataset.tpCiv || '',
    civName: btn.dataset.tpCivName || '',
    mapName: btn.dataset.tpMap || '',
  };
  if (!payload.title) return;
  const res = await window.settings.trainingQueueAdd(payload).catch(() => null);
  if (res?.ok) {
    if (res.itemId) btn.dataset.tpQueueId = res.itemId;
    if (Array.isArray(res.trainingQueue)) {
      syncAllTrainPinButtons(res.trainingQueue);
      if (trainingUi && typeof trainingUi.applyRealtimeUpdate === 'function') {
        trainingUi.applyRealtimeUpdate({ trainingQueue: res.trainingQueue });
      }
    } else {
      btn.classList.add('is-pinned');
      btn.setAttribute('aria-pressed', 'true');
    }
    if (res.duplicate) {
      if (typeof UiSfx === 'object') UiSfx.play('tap');
      setStatus(t('ui.alreadyInPlan', 'Este objetivo ya está activo en «Mi Plan».'));
    } else {
      if (typeof UiSfx === 'object') UiSfx.play('confirm');
      setStatus(t('ui.addedToPlan', 'Agregado a Mi Plan · Relic lo verificará automáticamente en tus próximas partidas.'));
    }
  } else if (res?.error === 'ultra-required') {
    setStatus(t('ui.planUltraOnly', 'Disponible en Plan Ultra · Guardá focos de mejora en Mi Plan.'));
  }
});

// Notificación automática cuando una partida real posterior cumple un objetivo de Mi Plan
function showPlanVerifiedToast(completedItems = []) {
  if (!Array.isArray(completedItems) || !completedItems.length) return;
  document.querySelector('#planVerifiedToast')?.remove();
  const first = completedItems[0];
  const more = completedItems.length > 1 ? t('ui.moreCompleted', ' (+{n} más)', { n: completedItems.length - 1 }) : '';
  const toast = document.createElement('div');
  toast.id = 'planVerifiedToast';
  toast.className = 'plan-verified-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<div class="pvt-badge">✓</div>
    <div class="pvt-copy">
      <span>${escapeHtml(t('ui.planCompletedBanner', '¡CUMPLISTE TU PLAN EN PARTIDA REAL!'))}</span>
      <strong>${escapeHtml(first.title)}${escapeHtml(more)}</strong>
      <small>${escapeHtml(first.verifiedEvidence || t('ui.planAutoVerified', 'Verificado automáticamente en tu última partida.'))}</small>
      <div class="pvt-actions">
        <button type="button" class="btn gold" id="pvtOpenPlanBtn">${escapeHtml(t('ui.viewMyPlanArrow', 'Ver Mi Plan →'))}</button>
      </div>
    </div>
    <button type="button" class="pvt-close" id="pvtCloseBtn" aria-label="Cerrar">×</button>`;
  document.body.appendChild(toast);
  if (typeof UiSfx === 'object') UiSfx.play('confirm');
  const dismiss = () => toast.remove();
  toast.querySelector('#pvtCloseBtn')?.addEventListener('click', dismiss);
  toast.querySelector('#pvtOpenPlanBtn')?.addEventListener('click', () => {
    dismiss();
    goTo('training');
    if (trainingUi && typeof trainingUi.switchSubtab === 'function') {
      trainingUi.switchSubtab('plan');
    }
  });
  setTimeout(() => { if (toast.isConnected) toast.remove(); }, 12000);
}

if (typeof window.settings?.onTraining === 'function') {
  window.settings.onTraining((payload) => {
    if (Array.isArray(payload?.trainingQueue)) {
      syncAllTrainPinButtons(payload.trainingQueue);
    }
    if (trainingUi && typeof trainingUi.applyRealtimeUpdate === 'function') {
      trainingUi.applyRealtimeUpdate(payload);
    }
    if (Array.isArray(payload?.newlyCompletedPlanItems) && payload.newlyCompletedPlanItems.length) {
      showPlanVerifiedToast(payload.newlyCompletedPlanItems);
    }
  });
}
if (typeof window.settings?.trainingGet === 'function') {
  window.settings.trainingGet().then((res) => {
    if (Array.isArray(res?.trainingQueue)) syncAllTrainPinButtons(res.trainingQueue);
  }).catch(() => {});
}

// Minimalist editorial Pro/Ultra upgrade modal when clicking locked features on a Free account
function openFriendlyUpgradeModal({ tier = 'ultra', featureName = '', featureDesc = '' } = {}) {
  document.querySelector('#relicUpgradeBackdrop')?.remove();
  const isPro = String(tier || '').toLowerCase() === 'pro';
  const tierLabel = isPro ? 'Relic Pro' : 'Relic Ultra';
  const heroArt = isPro ? 'assets/art/prematch-estandartes.webp' : 'assets/art/central-hero.jpg';

  const cleanFeature = String(featureName || '')
    .replace(/^Ver tus?\s+/i, '')
    .replace(/^Ver\s+/i, '')
    .replace(/^Desbloqueá tus?\s+/i, '')
    .replace(/^Desbloqueá\s+/i, '')
    .trim();
  const capFeature = cleanFeature ? cleanFeature.charAt(0).toUpperCase() + cleanFeature.slice(1) : '';

  const durLong = formatTrialDuration(currentTrialHours, { short: false });
  const durShort = formatTrialDuration(currentTrialHours, { short: true });
  const headline = capFeature || (isPro ? t('ui.upProHeadline', 'Conocé a tu rival antes de empezar') : t('ui.upUltraHeadline', 'Llevá tu juego un paso más allá'));
  const lead = featureDesc
    ? `${featureDesc} ${isPro ? t('ui.upIncPro', 'Incluido en Relic Pro.') : t('ui.upTryUltra24', 'Podés probar Ultra gratis {dur}.', { dur: durLong })}`
    : (isPro
      ? t('ui.upProSub', 'Forma parte de Relic Pro. Lectura completa de rivales e historial desde el minuto cero.')
      : t('ui.upUltraSub', 'Forma parte de Relic Ultra. Probalo gratis durante {dur} y decidí con tus partidas.', { dur: durLong }));

  const icoTrend = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icoList = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h7M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icoShield = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.2 8.7-7 10-3.8-1.3-7-5-7-10V6l7-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icoEye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const icoStar = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9L12 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const perks = isPro
    ? [
        { ico: icoEye, text: t('ui.upProPerk1', 'Lectura completa de aperturas y civs del rival') },
        { ico: icoShield, text: t('ui.upProPerk2', 'Recomendador de civilización según mapa') },
        { ico: icoTrend, text: t('ui.upProPerk3', 'Historial ampliado y métricas en Central') },
      ]
    : [
        { ico: icoTrend, text: t('ui.upUltraPerk1', 'Postmatch y evolución real con metas automáticas') },
        { ico: icoList, text: t('ui.upUltraPerk2', 'Build orders en vivo con bonos de civilización') },
        { ico: icoStar, text: t('ui.upUltraPerk3', 'Diagnósticos de Central, Matchups y Arena') },
      ];

  const backdrop = document.createElement('div');
  backdrop.id = 'relicUpgradeBackdrop';
  backdrop.className = 'relic-upgrade-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML = `<div class="relic-upgrade-stage is-art-right${isPro ? ' is-pro' : ''}">
    <img class="rum-art" src="${heroArt}" alt="" draggable="false" />
    <div class="rum-scrim" aria-hidden="true"></div>
    <button type="button" class="rum-close" id="rumCloseBtn" aria-label="${escapeHtml(t('common.close', 'Cerrar'))}">×</button>
    <div class="rum-copy">
      <span class="rum-eyebrow">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l-1.5-9L8 12l4-6 4 6 5.5-4L20 17H4zm1 2h14v2H5v-2z" fill="currentColor"/></svg>
        ${escapeHtml(tierLabel)}
      </span>
      <h3>${escapeHtml(headline)}</h3>
      <p class="rum-lead">${escapeHtml(lead)}</p>
      <div class="rum-rule" aria-hidden="true"></div>
      <ul class="rum-list">
        ${perks.map((p) => `<li>${p.ico}<span>${escapeHtml(p.text)}</span></li>`).join('')}
      </ul>
      <div class="rum-actions">
        ${!isPro && isUltraTrialAvailable()
          ? `<button type="button" class="rum-cta" id="rumTrialBtn">${escapeHtml(t('ui.upTry24Cta', 'Probar {dur} gratis', { dur: durShort }))}</button><button type="button" class="rum-link" id="rumPlansBtn">${escapeHtml(t('plans.viewPlans', 'Ver planes'))} <span aria-hidden="true">→</span></button>`
          : `<button type="button" class="rum-cta" id="rumPlansBtn">${escapeHtml(isPro ? t('ui.upSeeProCta', 'Ver Plan Pro') : t('ui.upSeeUltraCta', 'Ver Plan Ultra →'))}</button><button type="button" class="rum-link" id="rumDismissBtn">${escapeHtml(t('ui.upNotNow', 'Ahora no'))}</button>`}
      </div>
    </div>
  </div>`;
  document.body.appendChild(backdrop);

  const close = () => {
    document.removeEventListener('keydown', onEsc);
    backdrop.remove();
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#rumCloseBtn')?.addEventListener('click', close);
  backdrop.querySelector('#rumDismissBtn')?.addEventListener('click', close);
  backdrop.querySelector('#rumPlansBtn')?.addEventListener('click', () => { close(); goTo('plans'); });
  backdrop.querySelector('#rumTrialBtn')?.addEventListener('click', () => {
    close();
    goTo('plans');
    const trialBtn = el('claimUltraTrialBtn');
    if (trialBtn && !trialBtn.hidden && !trialBtn.disabled) trialBtn.click();
  });
}

let pendingExpiredOfferLicense = null;
let expiredModalShownThisSession = false;

function getExpiredModalKey(remoteLic) {
  const acct = remoteLic?.accountId || currentProfileId || 'user';
  return `v1:${acct}`;
}

function queueExpiredOfferModal(remoteLic) {
  if (!remoteLic || remoteLic.reason !== 'expired' || expiredModalShownThisSession) return;
  const key = getExpiredModalKey(remoteLic);
  try {
    if (localStorage.getItem('relic.expiredModalDismissedV1') === key) return;
  } catch { /* ignore */ }
  if (!initialBootDone) {
    pendingExpiredOfferLicense = remoteLic;
  } else {
    setTimeout(() => openExpiredOfferModal(remoteLic), 320);
  }
}

function openExpiredOfferModal(remoteLic) {
  if (expiredModalShownThisSession) return;
  if (currentProduct && currentProduct.plan && currentProduct.plan !== 'free') return;
  const key = getExpiredModalKey(remoteLic);
  try {
    if (localStorage.getItem('relic.expiredModalDismissedV1') === key) return;
  } catch { /* ignore */ }
  expiredModalShownThisSession = true;

  document.querySelector('#relicUpgradeBackdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'relicUpgradeBackdrop';
  backdrop.className = 'relic-upgrade-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML = `<div class="relic-upgrade-stage is-art-right">
    <img class="rum-art" src="assets/art/central-hero.jpg" alt="" draggable="false" />
    <div class="rum-scrim" aria-hidden="true"></div>
    <button type="button" class="rum-close" id="rumCloseBtn" aria-label="${escapeHtml(t('common.close', 'Cerrar'))}">×</button>
    <div class="rum-copy">
      <span class="rum-eyebrow">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l-1.5-9L8 12l4-6 4 6 5.5-4L20 17H4zm1 2h14v2H5v-2z" fill="currentColor"/></svg>
        ${escapeHtml(t('expiredModal.eyebrow', 'RELIC ULTRA · ACCESO FINALIZADO'))}
      </span>
      <h3>${escapeHtml(t('expiredModal.title', 'Tu prueba de Relic Ultra terminó'))}</h3>
      <p class="rum-lead">${escapeHtml(t('expiredModal.lead', 'Tu cuenta volvió al plan Free, pero todo tu historial y tus replays siguen intactos. Activá hoy tu plan y recuperá al instante Central avanzado, Postmatch, Matchups y Entrenamiento.'))}</p>
      <div class="rum-offer-banner">
        <span class="rum-offer-pill">${escapeHtml(t('expiredModal.offerPill', 'OFERTA PLAN ANUAL · −20 %'))}</span>
        <strong>${escapeHtml(t('expiredModal.offerTitle', 'Ahorrá 20 % contratando el plan anual hoy'))}</strong>
        <small>${escapeHtml(t('expiredModal.offerSub', 'Activación instantánea con tu cuenta Google · Tarjeta o USDT/USDC'))}</small>
      </div>
      <div class="rum-actions">
        <button type="button" class="rum-cta" id="rumExpiredAnnualBtn">${escapeHtml(t('expiredModal.ctaAnnual', 'Ver oferta (−20 %) →'))}</button>
        <button type="button" class="rum-link" id="rumDismissBtn">${escapeHtml(t('expiredModal.ctaFree', 'Seguir en Free'))}</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(backdrop);

  const dismiss = () => {
    try { localStorage.setItem('relic.expiredModalDismissedV1', key); } catch { /* ignore */ }
    document.removeEventListener('keydown', onEsc);
    backdrop.remove();
  };
  const onEsc = (e) => { if (e.key === 'Escape') dismiss(); };
  document.addEventListener('keydown', onEsc);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss(); });
  backdrop.querySelector('#rumCloseBtn')?.addEventListener('click', dismiss);
  backdrop.querySelector('#rumDismissBtn')?.addEventListener('click', dismiss);
  backdrop.querySelector('#rumExpiredAnnualBtn')?.addEventListener('click', () => {
    dismiss();
    goTo('plans');
    const annualBtn = document.querySelector('.plans-cycle-btn[data-billing-cycle="annual"]');
    if (annualBtn) annualBtn.click();
  });
}

function isUltraTrialAvailable(product = currentProduct) {
  const curPlan = product?.plan === 'beta' ? 'promax' : (product?.plan || 'free');
  if (curPlan !== 'free') return false;
  if (lastAuthState?.user?.trialClaimed) return false;
  if (product?.trialClaimed || product?.trialAvailable === false) return false;
  return true;
}

function setPageChildrenInert(pageEl, locked) {
  if (!pageEl) return;
  Array.from(pageEl.children).forEach((child) => {
    if (child.classList?.contains('page-lock-veil')) return;
    if (locked) {
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    } else {
      child.removeAttribute('inert');
      child.removeAttribute('aria-hidden');
    }
  });
}

function buildPageLockStageHtml({ tier = 'ultra', art = 'assets/art/postmatch-v3-cabecera.webp', artRight = true, eyebrow = 'Relic Ultra', title = '', lead = '', perks = [], primaryLabel = 'Probar 24 h gratis', secondaryLabel = 'Ver planes', isTrial = true, compact = false } = {}) {
  const isPro = tier === 'pro';
  const crownSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l-1.5-9L8 12l4-6 4 6 5.5-4L20 17H4zm1 2h14v2H5v-2z" fill="currentColor"/></svg>';
  const cls = `relic-upgrade-stage${isPro ? ' is-pro' : ''}${artRight ? ' is-art-right' : ''}${compact ? ' is-compact-stage' : ''}`;
  return `<div class="page-lock-veil">
    <div class="${cls}">
      <img class="rum-art" src="${art}" alt="" draggable="false" />
      <div class="rum-scrim" aria-hidden="true"></div>
      <div class="rum-copy">
        <span class="rum-eyebrow">${crownSvg}${escapeHtml(eyebrow)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p class="rum-lead">${escapeHtml(lead)}</p>
        <div class="rum-rule" aria-hidden="true"></div>
        <ul class="rum-list">
          ${perks.map((p) => `<li>${p.ico}<span>${escapeHtml(p.text)}</span></li>`).join('')}
        </ul>
        <div class="rum-actions">
          <button type="button" class="rum-cta" data-page-lock-action="${isTrial ? 'trial' : 'plans'}">${escapeHtml(primaryLabel)}</button>
          <button type="button" class="rum-link" data-page-lock-action="plans">${escapeHtml(secondaryLabel)} <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </div>
  </div>`;
}

function bindPageLockActions(rootNode) {
  if (!rootNode) return;
  rootNode.querySelectorAll('[data-page-lock-action="plans"]').forEach((btn) => {
    btn.addEventListener('click', () => goTo('plans'));
  });
  rootNode.querySelectorAll('[data-page-lock-action="trial"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      goTo('plans');
      const trialBtn = el('claimUltraTrialBtn');
      if (trialBtn && !trialBtn.hidden && !trialBtn.disabled) trialBtn.click();
    });
  });
}

function syncLockedPageShowcases(product) {
  const access = product?.featureAccess || {};
  const trialAvail = isUltraTrialAvailable(product);
  const durLong = formatTrialDuration(currentTrialHours, { short: false });
  const durShort = formatTrialDuration(currentTrialHours, { short: true });
  const icoTrend = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icoList = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h7M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icoShield = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.2 8.7-7 10-3.8-1.3-7-5-7-10V6l7-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icoEye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const icoStar = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9L12 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // 1. Postmatch (Ultra)
  const pmPage = document.querySelector('section.page[data-page="postmatch"]');
  if (pmPage) {
    const pmLocked = !access.postMatch;
    pmPage.classList.toggle('is-page-locked', pmLocked);
    pmPage.querySelector(':scope > .page-lock-veil')?.remove();
    pmPage.querySelector('.pm-locked-preview')?.remove();
    if (pmLocked) {
      if (postMatchReportEl && !lastPostMatchPayload?.report) {
        const preview = document.createElement('div');
        preview.className = 'pm-locked-preview';
        preview.setAttribute('aria-hidden', 'true');
        preview.innerHTML = `<div class="pm-lp-hero">
          <div><span class="pm-lp-tag">${escapeHtml(t('lockShowcase.pmPreviewTag', 'VICTORIA · ARABIA · RM 1V1'))}</span><h4>${escapeHtml(t('lockShowcase.pmPreviewMatch', 'Francos vs Mayas · 32:14'))}</h4></div>
          <div class="pm-lp-grade">A+</div>
        </div>
        <div class="pm-lp-kpis">
          <div><span>${escapeHtml(t('lockShowcase.pmPreviewFeudal', 'Feudal'))}</span><b>09:52</b></div>
          <div><span>${escapeHtml(t('lockShowcase.pmPreviewCastle', 'Castillos'))}</span><b>19:38</b></div>
          <div><span>${escapeHtml(t('lockShowcase.pmPreviewIdleTc', 'CU inactivo'))}</span><b>0:19</b></div>
          <div><span>eAPM</span><b>54</b></div>
        </div>
        <div class="pm-lp-bars">
          <div><span>${escapeHtml(t('lockShowcase.pmPreviewEco', 'Economía'))}</span><i></i></div>
          <div><span>${escapeHtml(t('lockShowcase.pmPreviewAgeTempo', 'Ritmo de edades'))}</span><i></i></div>
          <div><span>${escapeHtml(t('lockShowcase.pmPreviewCombat', 'Combate y eficiencia'))}</span><i></i></div>
        </div>`;
        postMatchReportEl.appendChild(preview);
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = buildPageLockStageHtml({
        tier: 'ultra',
        art: 'assets/art/postmatch-v3-cabecera.webp',
        artRight: true,
        eyebrow: 'Relic Ultra',
        title: t('lockShowcase.pmTitle', 'Revisa cada partida apenas termina'),
        lead: trialAvail
          ? t('lockShowcase.pmLeadTrial', 'Pruébalo gratis durante {dur} y mira tus tiempos, economía y focos reales de mejora.', { dur: durLong })
          : t('lockShowcase.pmLeadNoTrial', 'Incluido en Relic Ultra: tiempos de edad, economía, combate y focos reales de mejora.'),
        perks: [
          { ico: icoTrend, text: t('lockShowcase.pmPerk1', 'Tiempos de Edad, inactividad del CU y comparativa ELO') },
          { ico: icoStar, text: t('lockShowcase.pmPerk2', 'Resumen flotante automático al terminar cada partida') },
          { ico: icoList, text: t('lockShowcase.pmPerk3', 'Focos detectados enviados directo a tu plan de Entrenamiento') },
        ],
        primaryLabel: trialAvail ? t('lockShowcase.try24h', 'Probar {dur} gratis', { dur: durShort }) : t('lockShowcase.viewUltra', 'Ver Plan Ultra'),
        secondaryLabel: t('lockShowcase.viewPlans', 'Ver planes'),
        isTrial: trialAvail,
      });
      const veil = wrap.firstElementChild;
      pmPage.appendChild(veil);
      bindPageLockActions(veil);
    }
    setPageChildrenInert(pmPage, pmLocked);
  }

  // 2. Batalla / Tactics (Pro + Ultra)
  const tacPage = document.querySelector('section.page[data-page="tactics"]');
  if (tacPage) {
    const tacLocked = !access.civHelp && !access.smartBuildOrder;
    tacPage.classList.toggle('is-page-locked', tacLocked);
    tacPage.querySelector(':scope > .page-lock-veil')?.remove();
    if (tacLocked) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildPageLockStageHtml({
        tier: 'ultra',
        art: 'assets/art/wizard-umbral.webp',
        artRight: true,
        eyebrow: t('lockShowcase.tacEyebrow', 'Relic Pro · Ultra'),
        title: t('lockShowcase.tacTitle', 'Ayuda táctica en batalla'),
        lead: trialAvail
          ? t('lockShowcase.tacLeadTrial', 'Bonos de civilización al empezar y Build Orders en vivo sobre el juego. Prueba Ultra gratis {dur}.', { dur: durLong })
          : t('lockShowcase.tacLeadNoTrial', 'Bonos de civilización al empezar y Build Orders en vivo sobre el juego con Relic Pro y Ultra.'),
        perks: [
          { ico: icoShield, text: t('lockShowcase.tacPerk1', 'Bonos, unidades fuertes y debilidades de ambas civs') },
          { ico: icoList, text: t('lockShowcase.tacPerk2', 'Smart Build Order en pantalla según tu civ y mapa') },
          { ico: icoStar, text: t('lockShowcase.tacPerk3', 'Overlay discreto pensado para no distraerte en partida') },
        ],
        primaryLabel: trialAvail ? t('lockShowcase.try24h', 'Probar {dur} gratis', { dur: durShort }) : t('lockShowcase.viewUltra', 'Ver Plan Ultra'),
        secondaryLabel: t('lockShowcase.viewPlans', 'Ver planes'),
        isTrial: trialAvail,
      });
      const veil = wrap.firstElementChild;
      tacPage.appendChild(veil);
      bindPageLockActions(veil);
    }
    setPageChildrenInert(tacPage, tacLocked);
  }

  // 3. Prematch / Overlay — centered full-page blurred Pro showcase on Free (dismissible to tweak the 1 free timer)
  const ovPage = document.querySelector('section.page[data-page="overlay"]');
  if (ovPage) {
    if (access.rivalCivs) delete ovPage.dataset.freeVeilDismissed;
    const prematchLocked = !access.rivalCivs && ovPage.dataset.freeVeilDismissed !== '1';
    ovPage.classList.toggle('is-page-locked', prematchLocked);
    ovPage.querySelector(':scope > .page-lock-veil')?.remove();
    ovPage.querySelector('details.pm-config-details')?.classList.remove('is-section-locked');
    ovPage.querySelector('details.pm-config-details > .page-lock-veil')?.remove();
    if (prematchLocked) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildPageLockStageHtml({
        tier: 'pro',
        art: 'assets/art/prematch-estandartes.webp',
        artRight: true,
        eyebrow: 'Relic Pro',
        title: t('lockShowcase.ovTitle', 'Conoce a tu rival antes de empezar'),
        lead: t('lockShowcase.ovLead', 'Suma lectura completa de rivales, historial de cruces y recomendador de civilización desde el minuto cero.'),
        perks: [
          { ico: icoEye, text: t('lockShowcase.ovPerk1', 'Últimas 5 civs, mapa favorito y aperturas del rival') },
          { ico: icoShield, text: t('lockShowcase.ovPerk2', 'Recomendador de civilización según el mapa y tu oponente') },
          { ico: icoTrend, text: t('lockShowcase.ovPerk3', 'Enfrentamientos previos y balance de equipos en TG') },
        ],
        primaryLabel: t('lockShowcase.viewPro', 'Ver Plan Pro'),
        secondaryLabel: trialAvail ? t('lockShowcase.tryUltra24h', 'Probar Ultra {dur}', { dur: durShort }) : t('lockShowcase.viewPlans', 'Ver planes'),
        isTrial: false,
      });
      const veil = wrap.firstElementChild;
      const secBtn = veil.querySelector('.rum-link');
      if (secBtn && trialAvail) secBtn.dataset.pageLockAction = 'trial';
      const stage = veil.querySelector('.relic-upgrade-stage');
      if (stage) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'rum-close';
        closeBtn.setAttribute('aria-label', t('lockShowcase.freeSettingsTip', 'Ver ajuste gratuito de tiempo'));
        closeBtn.title = t('lockShowcase.freeSettingsTip', 'Ver ajuste gratuito de tiempo');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => {
          ovPage.dataset.freeVeilDismissed = '1';
          ovPage.classList.remove('is-page-locked');
          setPageChildrenInert(ovPage, false);
          veil.remove();
        });
        stage.appendChild(closeBtn);
      }
      ovPage.appendChild(veil);
      bindPageLockActions(veil);
    }
    setPageChildrenInert(ovPage, prematchLocked);
  }
}

document.addEventListener('click', (ev) => {
  const lockedRow = ev.target?.closest?.('.row.feature-locked');
  if (lockedRow) {
    ev.preventDefault();
    ev.stopPropagation();
    const tier = String(lockedRow.dataset.tier || 'ULTRA').toLowerCase() === 'pro' ? 'pro' : 'ultra';
    const featureName = lockedRow.querySelector('.rname')?.textContent?.trim() || '';
    const featureDesc = lockedRow.querySelector('.rdesc')?.textContent?.trim() || '';
    openFriendlyUpgradeModal({ tier, featureName, featureDesc });
    return;
  }
  const veilBtn = ev.target?.closest?.('.cx-ultra-veil, [data-goto-plan="1"]');
  if (veilBtn && !ev.target.closest('#relicUpgradeBackdrop')) {
    ev.preventDefault();
    ev.stopPropagation();
    const tier = String(veilBtn.dataset.upgradeTier || 'ultra').toLowerCase();
    const ctx = veilBtn.dataset.upgradeContext || '';
    openFriendlyUpgradeModal({ tier, featureName: ctx });
  }
}, true);

syncPlanPricingUi();

/* ==================== PROGRAMA DE REFERIDOS (UI + MODAL + SYNC) ==================== */
let latestReferralsState = null;

function setRefSegments(container, activatedCount = 0, pendingCount = 0, goal = 10) {
  if (!container) return;
  const segs = container.querySelectorAll('.ref-seg');
  const filled = Math.max(0, Math.min(goal, Number(activatedCount) || 0));
  const pend = Math.max(0, Math.min(goal - filled, Number(pendingCount) || 0));
  segs.forEach((seg, idx) => {
    seg.classList.toggle('is-filled', idx < filled);
    seg.classList.toggle('is-pending', idx >= filled && idx < filled + pend);
  });
}

function formatReferralDate(ms) {
  if (!ms) return '';
  try {
    const loc = selectedLanguage === 'en' ? 'en-US' : selectedLanguage === 'zh-CN' ? 'zh-CN' : selectedLanguage || 'es-MX';
    return new Date(ms).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

function paintReferralsSummary(data) {
  const railBtn = el('railReferralBtn');
  const railSub = el('railRefSub');
  const railBadge = el('railRefBadge');
  const accCount = el('accRefCountBadge');
  const accSegs = el('accRefSegments');
  const accStatus = el('accRefStatusText');

  if (!data || !data.ok) {
    if (railBtn) railBtn.classList.remove('is-claimed');
    if (railSub) railSub.textContent = t('referrals.railSub', 'Trae 10 amigos');
    if (railBadge) railBadge.textContent = '0/10';
    if (accCount) accCount.textContent = '0 / 10';
    setRefSegments(accSegs, 0, 0, 10);
    if (accStatus) accStatus.textContent = t('referrals.signInStatus', 'Inicia sesión con Google para obtener tu código de referido.');
    return;
  }

  const goal = Number(data.goal || 10);
  const activated = Number(data.activatedCount || 0);
  const pending = Number(data.pendingCount || 0) + Number(data.pendingReviewCount || 0);
  const claimed = Boolean(data.rewardClaimed);
  const blocked = Boolean(data.rewardMachineBlocked);

  if (railBtn) railBtn.classList.toggle('is-claimed', claimed);
  if (railBadge) railBadge.textContent = claimed ? '✓ Ultra' : `${Math.min(activated, goal)}/${goal}`;
  if (railSub) {
    railSub.textContent = claimed
      ? t('referrals.monthCredited', 'Mes gratis acreditado')
      : blocked
        ? t('referrals.machineUsedShort', 'Recompensa usada en esta PC')
        : (pending > 0
          ? t(pending === 1 ? 'referrals.pendingOne' : 'referrals.pendingMany', '{n} pendientes', { n: pending })
          : t('referrals.railSub', 'Trae 10 amigos'));
  }

  if (accCount) accCount.textContent = claimed ? t('referrals.completed', '✓ Completado') : `${Math.min(activated, goal)} / ${goal}`;
  setRefSegments(accSegs, claimed ? goal : activated, claimed ? 0 : pending, goal);
  if (accStatus) {
    if (claimed) {
      accStatus.textContent = data.rewardExpiresAt
        ? t('referrals.claimedUntil', '¡1 mes gratis de Ultra activado! Vigente hasta {date}.', { date: formatReferralDate(data.rewardExpiresAt) })
        : t('referrals.claimedGeneric', '¡1 mes gratis de Relic Ultra ya acreditado en tu cuenta!');
    } else if (blocked) {
      accStatus.textContent = data.rewardMachineBlockedMessage || t('referrals.machineBlocked', 'Esta PC ya recibió anteriormente la recompensa única.');
    } else if (activated > 0) {
      const left = Math.max(0, goal - activated);
      accStatus.textContent = t(left === 1 ? 'referrals.friendsLeftOne' : 'referrals.friendsLeftMany', 'Te faltan {n} amigos activados para desbloquear 1 mes gratis de Ultra.', { n: left });
    } else {
      accStatus.textContent = t('referrals.shareCodeHint', 'Tu código: {code} · Compártelo con tus amigos de AoE2:DE.', { code: data.code || '—' });
    }
  }
}

function paintReferralModal(data, { signedOut = false, loading = false, errorMsg = null } = {}) {
  const signedOutBox = el('referralSignedOutBox');
  const loadingBox = el('referralLoadingBox');
  const mainBody = el('referralMainBody');
  const claimedBanner = el('referralClaimedBanner');
  const claimedDetail = el('referralClaimedDetail');
  const blockedBanner = el('referralBlockedBanner');
  const blockedDetail = el('referralBlockedDetail');
  const countBig = el('referralCountBig');
  const pendingChip = el('referralPendingChip');
  const segsEl = el('referralSegments');
  const shareUrlEl = el('referralShareUrl');
  const codeValEl = el('referralCodeVal');
  const applySection = el('referralApplySection');
  const applyFormWrap = el('referralApplyFormWrap');
  const myStatusBox = el('referralMyStatusBox');
  const myStatusTitle = el('referralMyStatusTitle');
  const myStatusDesc = el('referralMyStatusDesc');
  const verifyNowBtn = el('referralVerifyNowBtn');
  const cannotApplyEl = el('referralCannotApplyMsg');
  const friendsSection = el('referralFriendsSection');
  const friendsListEl = el('referralFriendsList');
  const signInErrorEl = el('referralSignInError');

  if (signInErrorEl && !signedOut) {
    signInErrorEl.hidden = true;
    signInErrorEl.textContent = '';
  }

  if (signedOutBox) signedOutBox.hidden = !signedOut;
  if (loadingBox) loadingBox.hidden = !loading;
  if (mainBody) mainBody.hidden = signedOut || loading || !data;

  if (signedOut || loading || !data) {
    if (errorMsg && loadingBox && !signedOut) {
      loadingBox.hidden = false;
      loadingBox.innerHTML = `<span class="mini">${escapeHtml(errorMsg)}</span>`;
    }
    return;
  }

  const goal = Number(data.goal || 10);
  const activated = Number(data.activatedCount || 0);
  const pending = Number(data.pendingCount || 0) + Number(data.pendingReviewCount || 0);
  const claimed = Boolean(data.rewardClaimed);
  const blocked = Boolean(data.rewardMachineBlocked);

  if (claimedBanner) claimedBanner.hidden = !claimed;
  if (claimed && claimedDetail) {
    claimedDetail.textContent = data.rewardExpiresAt
      ? t('referrals.claimedOnUntil', 'Acreditado el {from} · Tu plan Ultra queda activo hasta el {until}.', {
        from: formatReferralDate(data.rewardClaimedAt),
        until: formatReferralDate(data.rewardExpiresAt),
      })
      : t('referrals.claimedOneTime', 'Recompensa única de 1 mes de Relic Ultra acreditada en tu cuenta.');
  }
  if (blockedBanner) blockedBanner.hidden = claimed || !blocked;
  if (blocked && blockedDetail) {
    blockedDetail.textContent = data.rewardMachineBlockedMessage || t('referrals.blockedDetail', 'Esta PC ya recibió anteriormente el mes gratis de Relic Ultra por referidos.');
  }

  if (countBig) countBig.textContent = `${Math.min(activated, goal)} / ${goal}`;
  if (pendingChip) {
    pendingChip.hidden = pending <= 0;
    pendingChip.textContent = t(pending === 1 ? 'referrals.pendingOne' : 'referrals.pendingMany', '{n} pendientes', { n: pending });
  }
  setRefSegments(segsEl, claimed ? goal : activated, claimed ? 0 : pending, goal);

  if (shareUrlEl) shareUrlEl.textContent = data.shareUrl || '—';
  if (codeValEl) codeValEl.textContent = data.code || '—';

  const myRef = data.myReferral || null;
  if (myRef) {
    if (applySection) applySection.hidden = false;
    if (applyFormWrap) applyFormWrap.hidden = true;
    if (cannotApplyEl) cannotApplyEl.hidden = true;
    if (myStatusBox) myStatusBox.hidden = false;
    if (myStatusTitle) {
      myStatusTitle.textContent = myRef.status === 'activated'
        ? t('referrals.invActivated', '✓ Invitación de {name} activada', { name: myRef.inviterLabel })
        : myRef.status === 'pending_review'
          ? t('referrals.invReview', 'Invitación de {name} en revisión', { name: myRef.inviterLabel })
          : myRef.status === 'pending'
            ? t('referrals.invApplied', 'Código {code} aplicado', { code: myRef.code })
            : t('referrals.invRejected', 'Código {code} no validado', { code: myRef.code });
    }
    if (myStatusDesc) {
      myStatusDesc.textContent = myRef.status === 'activated'
        ? t('referrals.invActivatedDesc', 'Sumó 1 referido válido para tu amigo.')
        : myRef.status === 'pending_review'
          ? t('referrals.invReviewDesc', 'Se confirmará automáticamente.')
          : myRef.status === 'pending'
            ? t('referrals.invPendingDesc', 'Abre AoE2:DE o Steam para completar la activación.')
            : (myRef.rejectMessage || t('referrals.invRejectedDesc', 'No cumplió los requisitos.'));
    }
    if (verifyNowBtn) verifyNowBtn.hidden = myRef.status !== 'pending';
  } else if (data.canApplyCode) {
    if (applySection) applySection.hidden = false;
    if (applyFormWrap) applyFormWrap.hidden = false;
    if (myStatusBox) myStatusBox.hidden = true;
    if (cannotApplyEl) cannotApplyEl.hidden = true;
  } else {
    if (applySection) applySection.hidden = true;
    if (applyFormWrap) applyFormWrap.hidden = true;
    if (myStatusBox) myStatusBox.hidden = true;
    if (cannotApplyEl) cannotApplyEl.hidden = true;
  }

  if (friendsListEl) {
    const friends = Array.isArray(data.friends) ? data.friends : [];
    if (friendsSection) friendsSection.hidden = friends.length === 0;
    if (!friends.length) {
      friendsListEl.innerHTML = '';
    } else {
      friendsListEl.innerHTML = friends.map((f) => {
        const pillCls = f.status === 'activated'
          ? 'is-activated'
          : f.status === 'pending_review'
            ? 'is-review'
            : f.status === 'pending'
              ? 'is-pending'
              : 'is-rejected';
        const pillTxt = f.status === 'activated'
          ? 'Activado ✓'
          : f.status === 'pending_review'
            ? t('ui.refInReview', 'En revisión')
            : f.status === 'pending'
              ? 'Pendiente'
              : (f.status === 'expired' ? 'Vencido' : 'Rechazado');
        const sub = f.status === 'activated' && f.activatedAt
          ? `Activado el ${formatReferralDate(f.activatedAt)}`
          : f.status === 'rejected' && f.rejectMessage
            ? f.rejectMessage
            : (f.appliedAt ? t('ui.refJoinedOn', 'Ingresó el {date}', { date: formatReferralDate(f.appliedAt) }) : '');
        return `<div class="referral-friend-row">
          <div class="referral-friend-meta">
            <strong>${escapeHtml(f.label || t('ui.refPlayerFallback', 'Jugador'))}</strong>
            ${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
          </div>
          <span class="referral-status-pill ${pillCls}">${escapeHtml(pillTxt)}</span>
        </div>`;
      }).join('');
    }
  }
}

function setReferralFeedback(message, tone = 'err') {
  const box = el('referralApplyFeedback');
  if (!box) return;
  if (!message) {
    box.hidden = true;
    box.textContent = '';
    box.classList.remove('is-err', 'is-ok');
    return;
  }
  box.hidden = false;
  box.textContent = message;
  box.classList.toggle('is-err', tone === 'err');
  box.classList.toggle('is-ok', tone === 'ok');
}

async function loadReferralsState({ showLoading = false } = {}) {
  if (typeof window.settings?.referralsGet !== 'function') return null;
  if (showLoading) paintReferralModal(null, { loading: true });
  const res = await window.settings.referralsGet().catch(() => null);
  if (!res) {
    paintReferralModal(null, { errorMsg: 'No se pudo consultar el servidor de referidos.' });
    return null;
  }
  if (res.authRequired || res.unauthorized) {
    latestReferralsState = null;
    paintReferralsSummary(null);
    paintReferralModal(null, { signedOut: true });
    return null;
  }
  if (!res.ok || !res.referrals) {
    paintReferralModal(null, { errorMsg: res.error || 'No se pudo cargar tu estado de referidos.' });
    return null;
  }
  latestReferralsState = res.referrals;
  paintReferralsSummary(res.referrals);
  paintReferralModal(res.referrals);
  return res.referrals;
}

function openReferralModal() {
  const bd = el('referralBackdrop');
  if (!bd) return;
  bd.hidden = false;
  setReferralFeedback('');
  if (typeof UiSfx === 'object') UiSfx.play('tap');
  if (latestReferralsState) {
    paintReferralModal(latestReferralsState);
    loadReferralsState({ showLoading: false });
  } else {
    loadReferralsState({ showLoading: true });
  }
}

function closeReferralModal() {
  const bd = el('referralBackdrop');
  if (bd) bd.hidden = true;
}

el('railReferralBtn')?.addEventListener('click', openReferralModal);
el('accOpenReferralBtn')?.addEventListener('click', openReferralModal);
el('referralCloseBtn')?.addEventListener('click', closeReferralModal);
el('referralBackdrop')?.addEventListener('click', (e) => {
  if (e.target === el('referralBackdrop')) closeReferralModal();
});
el('referralRefreshBtn')?.addEventListener('click', () => {
  loadReferralsState({ showLoading: false });
});

el('referralSignInBtn')?.addEventListener('click', async () => {
  const btn = el('referralSignInBtn');
  const errEl = el('referralSignInError');
  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  if (btn) btn.disabled = true;
  try {
    const res = await window.settings?.authGoogleLogin?.();
    if (res?.ok) {
      await loadReferralsState({ showLoading: true });
    } else if (errEl && res?.error) {
      errEl.textContent = res.error;
      errEl.hidden = false;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
});

async function copyReferralText(text, btn, defaultLabel) {
  const clean = String(text || '').trim();
  if (!clean || clean === '—') return;
  let copied = false;
  try {
    if (typeof window.settings?.copyText === 'function') {
      const res = await window.settings.copyText(clean);
      copied = Boolean(res?.ok);
    }
  } catch (_) {}
  if (!copied) {
    try {
      await navigator.clipboard.writeText(clean);
      copied = true;
    } catch (_) {}
  }
  if (copied) {
    if (typeof UiSfx === 'object') UiSfx.play('confirm');
    if (btn) {
      btn.textContent = t('ui.copiedExcl', '¡Copiado!');
      setTimeout(() => { btn.textContent = defaultLabel; }, 1600);
    }
  } else {
    setStatus(t('ui.copyErr', 'No se pudo copiar al portapapeles.'));
  }
}

el('referralCopyLinkBtn')?.addEventListener('click', () => {
  const shareUrl = latestReferralsState?.shareUrl || el('referralShareUrl')?.textContent;
  copyReferralText(shareUrl, el('referralCopyLinkBtn'), t('referrals.copyLink', 'Copiar enlace de invitación'));
});
el('referralCopyCodeBtn')?.addEventListener('click', () => {
  const code = latestReferralsState?.code || el('referralCodeVal')?.textContent;
  copyReferralText(code, el('referralCopyCodeBtn'), t('common.copy', 'Copiar'));
});

el('referralApplyBtn')?.addEventListener('click', async () => {
  const input = el('referralCodeInput');
  const btn = el('referralApplyBtn');
  const code = String(input?.value || '').trim();
  if (!code) {
    setReferralFeedback(t('ui.refEnterCode', 'Ingresá el código de referido que te compartió tu amigo.'), 'err');
    return;
  }
  setReferralFeedback('');
  if (btn) btn.disabled = true;
  try {
    const res = await window.settings?.referralsApply?.(code);
    if (!res?.ok) {
      setReferralFeedback(res?.error || t('ui.refApplyErr', 'No se pudo aplicar el código de referido.'), 'err');
      if (typeof UiSfx === 'object') UiSfx.play('error');
      return;
    }
    if (input) input.value = '';
    if (typeof UiSfx === 'object') UiSfx.play('confirm');
    if (res.referrals) {
      latestReferralsState = res.referrals;
      paintReferralsSummary(res.referrals);
      paintReferralModal(res.referrals);
    } else {
      await loadReferralsState({ showLoading: false });
    }
  } finally {
    if (btn) btn.disabled = false;
  }
});

el('referralVerifyNowBtn')?.addEventListener('click', async () => {
  const btn = el('referralVerifyNowBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verificando…';
  }
  try {
    const res = await window.settings?.referralsActivate?.();
    if (res?.referrals) {
      latestReferralsState = res.referrals;
      paintReferralsSummary(res.referrals);
      paintReferralModal(res.referrals);
    }
    if (res?.ok) {
      if (typeof UiSfx === 'object') UiSfx.play('confirm');
      setStatus(t('ui.refVerifiedOk', '¡Cuenta de referido verificada correctamente!'));
    } else if (res?.error) {
      setStatus(res.error);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verificar ahora';
    }
  }
});

if (typeof window.settings?.onReferrals === 'function') {
  window.settings.onReferrals((data) => {
    latestReferralsState = data || null;
    paintReferralsSummary(latestReferralsState);
    const bd = el('referralBackdrop');
    if (bd && !bd.hidden) {
      if (latestReferralsState) paintReferralModal(latestReferralsState);
      else paintReferralModal(null, { signedOut: true });
    }
  });
}

if (typeof window.settings?.referralsGet === 'function') {
  window.settings.referralsGet().then((res) => {
    if (res?.ok && res.referrals) {
      latestReferralsState = res.referrals;
      paintReferralsSummary(res.referrals);
    } else {
      paintReferralsSummary(null);
    }
  }).catch(() => {});
}
