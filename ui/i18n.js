(function (root) {
  'use strict';

  const FLAG_SVGS = {
    en: `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
      <clipPath id="fl-en"><rect width="28" height="20" rx="2.5"/></clipPath>
      <g clip-path="url(#fl-en)">
        <rect width="28" height="20" fill="#1e3a6e"/>
        <polygon points="0,0 3.2,0 28,17.6 28,20 24.8,20 0,2.4" fill="#fff"/>
        <polygon points="28,0 24.8,0 0,17.6 0,20 3.2,20 28,2.4" fill="#fff"/>
        <polygon points="0,0 1.8,0 28,18.7 28,20 26.2,20 0,1.3" fill="#c8102e"/>
        <polygon points="28,0 26.2,0 0,18.7 0,20 1.8,20 28,1.3" fill="#c8102e"/>
        <rect x="11.4" width="5.2" height="20" fill="#fff"/>
        <rect y="7.4" width="28" height="5.2" fill="#fff"/>
        <rect x="12.5" width="3" height="20" fill="#c8102e"/>
        <rect y="8.5" width="28" height="3" fill="#c8102e"/>
      </g>
    </svg>`,
    'es-ES': `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
      <clipPath id="fl-es"><rect width="28" height="20" rx="2.5"/></clipPath>
      <g clip-path="url(#fl-es)">
        <rect width="28" height="20" fill="#aa151b"/>
        <rect y="5" width="28" height="10" fill="#f1bf00"/>
        <rect x="6.5" y="7.5" width="3.8" height="5" rx="0.8" fill="#aa151b" opacity="0.88"/>
        <rect x="7.4" y="8.4" width="2" height="3.2" rx="0.4" fill="#f1bf00" opacity="0.9"/>
      </g>
    </svg>`,
    'es-MX': `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
      <clipPath id="fl-mx"><rect width="28" height="20" rx="2.5"/></clipPath>
      <g clip-path="url(#fl-mx)">
        <rect width="9.4" height="20" fill="#006847"/>
        <rect x="9.3" width="9.4" height="20" fill="#ffffff"/>
        <rect x="18.6" width="9.4" height="20" fill="#ce1126"/>
        <circle cx="14" cy="10" r="2.2" fill="#7c5428"/>
        <path d="M12.2 11.4a2.4 2.4 0 0 0 3.6 0" fill="none" stroke="#006847" stroke-width="0.9"/>
      </g>
    </svg>`,
    'zh-CN': `<svg class="flag-svg" viewBox="0 0 28 20" aria-hidden="true">
      <clipPath id="fl-zh"><rect width="28" height="20" rx="2.5"/></clipPath>
      <g clip-path="url(#fl-zh)">
        <rect width="28" height="20" fill="#de2910"/>
        <polygon points="6.2,3.4 7.0,5.8 9.5,5.8 7.5,7.3 8.2,9.7 6.2,8.2 4.2,9.7 4.9,7.3 2.9,5.8 5.4,5.8" fill="#ffde00"/>
        <circle cx="11.3" cy="3.6" r="0.85" fill="#ffde00"/>
        <circle cx="12.9" cy="5.4" r="0.85" fill="#ffde00"/>
        <circle cx="12.9" cy="7.9" r="0.85" fill="#ffde00"/>
        <circle cx="11.3" cy="9.6" r="0.85" fill="#ffde00"/>
      </g>
    </svg>`,
  };

  let currentLocale = 'es-MX';
  let bundles = {};
  let active = null;

  function normKey(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
  }

  function lookup(obj, dotPath) {
    let cur = obj;
    for (const part of String(dotPath || '').split('.')) {
      if (!cur || typeof cur !== 'object' || !(part in cur)) return undefined;
      cur = cur[part];
    }
    return cur;
  }

  function configure({ locale, bundle, allBundles } = {}) {
    if (allBundles && typeof allBundles === 'object') bundles = { ...bundles, ...allBundles };
    if (bundle && bundle.locale) bundles[bundle.locale] = bundle;
    if (locale && bundles[locale]) {
      currentLocale = locale;
      active = bundles[locale];
    } else if (bundle) {
      currentLocale = bundle.locale || currentLocale;
      active = bundle;
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLocale;
    }
    return api;
  }

  function setLocale(locale) {
    if (bundles[locale]) {
      currentLocale = locale;
      active = bundles[locale];
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = currentLocale;
      }
    }
    return active;
  }

  function t(key, vars = null) {
    let val = lookup(active?.strings, key);
    if (val == null) val = lookup(bundles.en?.strings, key);
    if (typeof val !== 'string') return String(key);
    if (vars && typeof vars === 'object') {
      val = val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
    }
    return val;
  }

  function getIntlLocale() {
    return active?.strings?.meta?.intl || (currentLocale === 'en' ? 'en-US' : currentLocale);
  }

  function formatNumber(n) {
    return Number.isFinite(Number(n)) && n != null ? Number(n).toLocaleString(getIntlLocale()) : '—';
  }

  const CIV_ALIASES = { inca: 'incas', maya: 'mayans', indians: 'hindustanis', khitansmongols: 'khitans' };

  function civName(raw) {
    if (!raw) return '';
    const k = normKey(raw);
    const slug = CIV_ALIASES[k] || k;
    return active?.gameTerms?.civs?.[slug] || String(raw);
  }

  function ageName(ageKey) {
    return active?.gameTerms?.ages?.[ageKey] || String(ageKey || '');
  }

  function resourceName(resKey) {
    return active?.gameTerms?.resources?.[resKey] || String(resKey || '');
  }

  function mapName(raw) {
    if (!raw) return '';
    const k = normKey(raw);
    return active?.gameTerms?.maps?.[k] || String(raw);
  }

  function buildingName(idOrKeyOrName) {
    const s = String(idOrKeyOrName ?? '');
    const gt = active?.gameTerms;
    if (!gt) return s;
    if (gt.keyBuildings?.[s]) return gt.keyBuildings[s];
    if (gt.buildings?.[s]) return gt.buildings[s];
    const target = normKey(s);
    if (target) {
      for (const [id, name] of Object.entries(gt.buildings || {})) {
        if (normKey(name) === target) return name;
      }
      // Cross-locale fallback (e.g. engine emitted Spanish 'Establo' and UI is in en/zh-CN)
      for (const b of Object.values(bundles)) {
        for (const [id, name] of Object.entries(b?.gameTerms?.buildings || {})) {
          if (normKey(name) === target && gt.buildings?.[id]) return gt.buildings[id];
        }
      }
    }
    return s;
  }

  function unitName(idOrName) {
    const s = String(idOrName ?? '');
    const gt = active?.gameTerms;
    if (!gt) return s;
    if (gt.units?.[s]) return gt.units[s];
    const target = normKey(s);
    if (target) {
      for (const b of Object.values(bundles)) {
        for (const [id, name] of Object.entries(b?.gameTerms?.units || {})) {
          if (normKey(name) === target && gt.units?.[id]) return gt.units[id];
        }
      }
    }
    return s;
  }

  const OPENING_NORM_ALIASES = {
    scoutrush: 'Scout Rush', scoutopening: 'Scout Rush', scouts: 'Scout Rush', rushdescouts: 'Scout Rush', aperturadescouts: 'Scout Rush',
    archerrush: 'Archer Rush', archeropening: 'Archer Rush', archers: 'Archer Rush', arqueros: 'Archer Rush', rushdearqueros: 'Archer Rush', aperturadearqueros: 'Archer Rush',
    fastcastle: 'Fast Castle', fc: 'Fast Castle', castillosrapido: 'Fast Castle',
    drushfastcastle: 'Drush Fast Castle', drushfc: 'Drush Fast Castle', drushcastillos: 'Drush Fast Castle',
    drush: 'Drush', drushmilicias: 'Drush',
    marush: 'M@A Rush', maa: 'M@A Rush', maarush: 'M@A Rush', manatarmsrush: 'M@A Rush', manatarms: 'Man-at-Arms', hombresdearmas: 'M@A Rush', rushdema: 'M@A Rush',
    towerrush: 'Tower Rush', torres: 'Tower Rush', rushdetorres: 'Tower Rush',
    fcboom: 'FC Boom', fastcastleconboom: 'FC Boom',
    '2tcfeudalboom': '2TC Feudal Boom', '2tcfeudal': '2TC Feudal Boom', boomde2tcenfeudal: '2TC Feudal Boom',
    scoutsintoarchers: 'Scouts into Archers', scoutsarqueros: 'Scouts into Archers', scoutshaciaarqueros: 'Scouts into Archers',
    drusharchers: 'Drush Archers', drusharqueros: 'Drush Archers', drushconarqueros: 'Drush Archers',
    maarchers: 'M@A Archers', hombresdearmasarqueros: 'M@A Archers', maconarqueros: 'M@A Archers',
    mascouts: 'M@A Scouts', maconscouts: 'M@A Scouts',
    monkrush: 'Monk Rush', monjes: 'Monk Rush', rushdemonjes: 'Monk Rush',
    elephantrush: 'Elephant Rush', elefantes: 'Elephant Rush', rushdeelefantes: 'Elephant Rush',
    serjeantrush: 'Serjeant Rush', serjeants: 'Serjeant Rush', rushdeserjeants: 'Serjeant Rush',
    hoangrush: 'Hoang Rush', hoang: 'Hoang Rush',
    pikeskirm: 'Pike Skirm', piquerosguerrilleros: 'Pike Skirm', piquerosyguerrilleros: 'Pike Skirm',
    scorpionsrams: 'Scorpions & Rams', escorpionesyarietes: 'Scorpions & Rams',
    other: 'Other', otra: 'Other', otraapertura: 'Other', aperturaestandar: 'Other',
  };

  function openingName(raw) {
    if (!raw) return '';
    const dict = active?.strings?.openings;
    if (dict && Object.prototype.hasOwnProperty.call(dict, raw)) return dict[raw];
    const nk = normKey(raw);
    if (dict && nk) {
      const canonical = OPENING_NORM_ALIASES[nk];
      if (canonical && dict[canonical]) return dict[canonical];
      for (const [k, v] of Object.entries(dict)) {
        if (normKey(k) === nk) return v;
      }
      // Cross-locale fallback
      for (const b of Object.values(bundles)) {
        for (const [k, v] of Object.entries(b?.strings?.openings || {})) {
          if (normKey(v) === nk && dict[k]) return dict[k];
        }
      }
    }
    return String(raw || '');
  }

  function flagSvg(code) {
    return FLAG_SVGS[code] || FLAG_SVGS.en;
  }

  function applyToDom(rootEl) {
    const scope = rootEl || (typeof document !== 'undefined' ? document : null);
    if (!scope || !active) return;
    scope.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      const translated = t(key);
      if (translated && translated !== key) node.textContent = translated;
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      const translated = t(key);
      if (translated && translated !== key) node.setAttribute('placeholder', translated);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((node) => {
      const key = node.getAttribute('data-i18n-title');
      const translated = t(key);
      if (translated && translated !== key) node.setAttribute('title', translated);
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      const key = node.getAttribute('data-i18n-aria-label');
      const translated = t(key);
      if (translated && translated !== key) node.setAttribute('aria-label', translated);
    });
    scope.querySelectorAll('template').forEach((tpl) => {
      if (tpl.content) applyToDom(tpl.content);
    });
  }

  const api = {
    configure,
    setLocale,
    getLocale: () => currentLocale,
    getIntlLocale,
    getSupported: () => active?.supported || Object.values(bundles).map((b) => b.strings?.meta).filter(Boolean),
    t,
    formatNumber,
    civName,
    civ: civName,
    ageName,
    resourceName,
    mapName,
    map: mapName,
    buildingName,
    building: buildingName,
    unitName,
    unit: unitName,
    openingName,
    flagSvg,
    applyToDom,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppI18n = api;
})(typeof globalThis === 'object' ? globalThis : this);
