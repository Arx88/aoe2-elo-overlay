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
  let entityIndex = {};
  let lowerPhrasebooks = {};
  let dynamicRules = null;
  let observer = null;
  let pendingRoots = new Set();
  let flushScheduled = false;
  let isMutatingDom = false;

  const ORIG_TEXT = new WeakMap();
  const ORIG_ATTRS = new WeakMap();

  const rulesLib = (typeof module === 'object' && module.exports)
    ? (() => { try { return require('./content-rules'); } catch { return null; } })()
    : (root.RelicContentRules || null);

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

  function rebuildEntityIndex() {
    entityIndex = {};
    const langs = Object.keys(bundles);
    for (const lang of langs) entityIndex[lang] = new Map();
    const buckets = ['civs', 'maps', 'ages', 'units', 'buildings', 'resources', 'keyBuildings'];
    for (const bucket of buckets) {
      const refIds = new Set();
      for (const b of Object.values(bundles)) {
        for (const id of Object.keys(b?.gameTerms?.[bucket] || {})) refIds.add(id);
      }
      for (const id of refIds) {
        const variants = new Set([id]);
        for (const b of Object.values(bundles)) {
          const v = b?.gameTerms?.[bucket]?.[id];
          if (v) variants.add(v);
        }
        for (const lang of langs) {
          const targetVal = bundles[lang]?.gameTerms?.[bucket]?.[id];
          if (!targetVal) continue;
          const map = entityIndex[lang];
          for (const variant of variants) {
            const k = normKey(variant);
            if (k && !map.has(k)) map.set(k, targetVal);
          }
        }
      }
    }
  }

  function locEntity(raw, locale) {
    const lang = locale || currentLocale;
    const map = entityIndex[lang];
    if (!map || !raw) return String(raw || '');
    return map.get(normKey(raw)) || String(raw);
  }

  function ensureDynamicRules() {
    if (!dynamicRules && rulesLib && typeof rulesLib.createDynamicRules === 'function') {
      dynamicRules = rulesLib.createDynamicRules({
        locEnt: (raw, l) => locEntity(raw, l),
        translateText: (raw, l) => locText(raw, l),
      });
    }
    return dynamicRules || [];
  }

  function configure({ locale, bundle, allBundles } = {}) {
    if (allBundles && typeof allBundles === 'object') bundles = { ...bundles, ...allBundles };
    if (bundle && bundle.locale) bundles[bundle.locale] = bundle;
    lowerPhrasebooks = {};
    if (locale && bundles[locale]) {
      currentLocale = locale;
      active = bundles[locale];
    } else if (bundle) {
      currentLocale = bundle.locale || currentLocale;
      active = bundle;
    }
    rebuildEntityIndex();
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLocale;
      ensureObserver();
    }
    return api;
  }

  function setLocale(locale) {
    if (bundles[locale]) {
      currentLocale = locale;
      active = bundles[locale];
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = currentLocale;
        ensureObserver();
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
      for (const b of Object.values(bundles)) {
        for (const [k, v] of Object.entries(b?.strings?.openings || {})) {
          if (normKey(v) === nk && dict[k]) return dict[k];
        }
      }
    }
    return String(raw || '');
  }

  function getLowerPhrasebook(lang) {
    if (!lowerPhrasebooks[lang]) {
      const map = new Map();
      const pb = (bundles[lang] || active)?.phrasebook || {};
      for (const [k, v] of Object.entries(pb)) {
        const lk = k.toLowerCase();
        if (!map.has(lk)) map.set(lk, v);
      }
      lowerPhrasebooks[lang] = map;
    }
    return lowerPhrasebooks[lang];
  }

  function translateSegment(trimmed, lang, allowEntity) {
    const targetBundle = bundles[lang] || active;
    const pb = targetBundle?.phrasebook;
    if (pb && Object.prototype.hasOwnProperty.call(pb, trimmed)) {
      return pb[trimmed];
    }
    const lpb = getLowerPhrasebook(lang);
    if (lpb) {
      const lowHit = lpb.get(trimmed.toLowerCase());
      if (lowHit) {
        // Preserve ALL-CAPS style on short headings/badges in EN
        if (lang === 'en' && trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed) && trimmed.length <= 42) {
          return lowHit.toUpperCase();
        }
        return lowHit;
      }
    }
    if (allowEntity && trimmed.length <= 36 && !/\d/.test(trimmed)) {
      const op = openingName(trimmed);
      if (op && op !== trimmed) return op;
      const ent = entityIndex[lang]?.get(normKey(trimmed));
      if (ent) return ent;
    }
    const rules = ensureDynamicRules();
    for (let i = 0; i < rules.length; i += 1) {
      const m = rules[i][0].exec(trimmed);
      if (m) return rules[i][1](m, lang);
    }
    return null;
  }

  function locText(raw, locale, { allowEntity = true } = {}) {
    if (typeof raw !== 'string' || !raw) return raw;
    const lang = locale || currentLocale;
    if (!lang || lang === 'es-MX') return raw;
    if (lang === 'es-ES') {
      return rulesLib && typeof rulesLib.applyEsEs === 'function' ? rulesLib.applyEsEs(raw) : raw;
    }
    if (lang !== 'en' && lang !== 'zh-CN') return raw;

    const trimmed = raw.replace(/\u00a0/g, ' ').trim();
    if (!trimmed || trimmed.length < 2) return raw;
    if (/^(?:https?:|data:|assets\/|#[0-9a-f]{3,8}$|[+\-−]?\d[\d.,:%/×x–—\-+\s]*$)/i.test(trimmed)) return raw;

    const direct = translateSegment(trimmed, lang, allowEntity);
    if (direct != null) {
      const lead = raw.match(/^\s*/)?.[0] || '';
      const trail = raw.match(/\s*$/)?.[0] || '';
      return `${lead}${direct}${trail}`;
    }

    // Handle leading bullet prefixes like '· ', '★ ', '● '
    const bulletMatch = /^([·★●↑↓←→]\s+)(.+)$/.exec(trimmed);
    if (bulletMatch) {
      const restHit = translateSegment(bulletMatch[2].trim(), lang, allowEntity);
      if (restHit != null && restHit !== bulletMatch[2].trim()) {
        const lead = raw.match(/^\s*/)?.[0] || '';
        const trail = raw.match(/\s*$/)?.[0] || '';
        return `${lead}${bulletMatch[1]}${restHit}${trail}`;
      }
    }

    for (const sep of [' · ', ' — ', ': ']) {
      if (trimmed.includes(sep)) {
        const parts = trimmed.split(sep);
        let changed = false;
        const mapped = parts.map((p) => {
          const pt = p.trim();
          if (!pt) return p;
          const hit = translateSegment(pt, lang, allowEntity);
          if (hit != null && hit !== pt) {
            changed = true;
            return p === pt ? hit : p.replace(pt, hit);
          }
          return p;
        });
        if (changed) {
          const joined = mapped.join(sep);
          const lead = raw.match(/^\s*/)?.[0] || '';
          const trail = raw.match(/\s*$/)?.[0] || '';
          return `${lead}${joined}${trail}`;
        }
      }
    }
    return raw;
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'SVG']);
  const PLAYER_NAME_SELECTOR = '[data-no-i18n], .no-i18n, .player-name, .row-name, .rival-name, .opp-name, .account-name, #welcomeName, #accountName, #accHeroName, .pm-side > div > b, .cx-rival-name, .referral-friend-name, .wh-player-name';

  function isSkippedElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute && el.hasAttribute('data-no-i18n')) return true;
    return false;
  }

  function isPlayerNameNode(el) {
    if (!el || el.nodeType !== 1 || typeof el.closest !== 'function') return false;
    try {
      return Boolean(el.closest(PLAYER_NAME_SELECTOR));
    } catch {
      return false;
    }
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const parent = node.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName)) return;
    if (parent.closest?.('[data-no-i18n], .no-i18n')) return;

    const current = node.nodeValue;
    if (!current || !current.trim()) return;

    const allowEntity = !isPlayerNameNode(parent);
    let orig = ORIG_TEXT.get(node);
    if (orig == null) {
      orig = current;
      ORIG_TEXT.set(node, orig);
    } else if (current !== orig && current !== locText(orig, currentLocale, { allowEntity })) {
      orig = current;
      ORIG_TEXT.set(node, orig);
    }

    const next = currentLocale === 'es-MX' ? orig : locText(orig, currentLocale, { allowEntity });
    if (next !== current) {
      node.nodeValue = next;
    }
  }

  function translateElementAttrs(el) {
    if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return;
    if (el.hasAttribute('data-no-i18n')) return;
    const attrs = ['title', 'placeholder', 'aria-label'];
    let saved = ORIG_ATTRS.get(el);
    for (let i = 0; i < attrs.length; i += 1) {
      const attr = attrs[i];
      const cur = el.getAttribute(attr);
      if (!cur || !cur.trim()) continue;
      if (!saved) {
        saved = {};
        ORIG_ATTRS.set(el, saved);
      }
      if (saved[attr] == null) {
        saved[attr] = cur;
      } else if (cur !== saved[attr] && cur !== locText(saved[attr], currentLocale)) {
        saved[attr] = cur;
      }
      const next = currentLocale === 'es-MX' ? saved[attr] : locText(saved[attr], currentLocale);
      if (next !== cur) el.setAttribute(attr, next);
    }
  }

  function translateSubtree(rootEl) {
    const scope = rootEl || (typeof document !== 'undefined' ? document.body : null);
    if (!scope || !active) return;
    isMutatingDom = true;
    try {
      if (scope.nodeType === 3) {
        translateTextNode(scope);
        return;
      }
      if (scope.nodeType === 1) {
        if (isSkippedElement(scope)) return;
        translateElementAttrs(scope);
      }
      if (typeof document !== 'undefined' && typeof document.createTreeWalker === 'function') {
        const walker = document.createTreeWalker(scope, 5 /* SHOW_ELEMENT | SHOW_TEXT */);
        let cur = walker.nextNode();
        while (cur) {
          if (cur.nodeType === 3) {
            translateTextNode(cur);
          } else if (cur.nodeType === 1) {
            if (!SKIP_TAGS.has(cur.tagName)) translateElementAttrs(cur);
          }
          cur = walker.nextNode();
        }
      }
    } finally {
      isMutatingDom = false;
    }
  }

  function scheduleSubtreeFlush(node) {
    if (!node) return;
    pendingRoots.add(node);
    if (flushScheduled) return;
    flushScheduled = true;
    const run = () => {
      flushScheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      if (currentLocale === 'es-MX') return;
      for (let i = 0; i < roots.length; i += 1) {
        if (roots[i] && roots[i].isConnected !== false) {
          translateSubtree(roots[i]);
        }
      }
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else setTimeout(run, 0);
  }

  function ensureObserver() {
    if (observer || typeof MutationObserver !== 'function' || typeof document === 'undefined' || !document.body) return;
    observer = new MutationObserver((mutations) => {
      if (isMutatingDom || currentLocale === 'es-MX') return;
      for (let i = 0; i < mutations.length; i += 1) {
        const m = mutations[i];
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j += 1) {
            const n = m.addedNodes[j];
            if (n.nodeType === 1 || n.nodeType === 3) scheduleSubtreeFlush(n);
          }
        } else if (m.type === 'characterData' && m.target) {
          scheduleSubtreeFlush(m.target);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function flagSvg(code) {
    return FLAG_SVGS[code] || FLAG_SVGS.en;
  }

  function applyToDom(rootEl) {
    const scope = rootEl || (typeof document !== 'undefined' ? document : null);
    if (!scope || !active) return;
    isMutatingDom = true;
    try {
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
    } finally {
      isMutatingDom = false;
    }
    const bodyTarget = rootEl || (typeof document !== 'undefined' ? document.body : null);
    if (bodyTarget) translateSubtree(bodyTarget);
    ensureObserver();
  }

  const api = {
    configure,
    setLocale,
    getLocale: () => currentLocale,
    getIntlLocale,
    getSupported: () => active?.supported || Object.values(bundles).map((b) => b.strings?.meta).filter(Boolean),
    t,
    locText,
    translateSubtree,
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
