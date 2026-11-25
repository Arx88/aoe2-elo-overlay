'use strict';

/**
 * Relic · Ephemeral Welcome Home Editorial Briefing (`ui/welcome-ui.js`)
 *
 * Coreografía sofisticada y suave sincronizada con el reveal real de pantalla:
 *   - Contadores numéricos fluidos (easeOutExpo/Quart) en un solo loop RAF
 *     (Oro, ELO Team/1v1, Pick %, Winrate %, Aldeanos, Ejército, Castillos, Granjas, eAPM).
 *   - Barras de progreso (ranking global y rango de oro) con llenado real de 0% → valor
 *     en dos frames + transición cubic-bezier(0.16, 1, 0.3, 1).
 *   - Cascada sutil de entrada por actos + tira de 7 días escalonada.
 *   - 100 % CSP-safe (cero atributos `style=` inline) y 0 animaciones infinitas GPU.
 */
(function initWelcomeUi() {
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function wt(key, fallback, vars = null) {
    if (typeof AppI18n === 'object' && typeof AppI18n.t === 'function') {
      const val = AppI18n.t(key, vars || undefined);
      if (val && val !== key) return val;
    }
    if (!vars) return fallback;
    return String(fallback).replace(/\{(\w+)\}/g, (_m, k) => (vars[k] != null ? String(vars[k]) : ''));
  }

  function getLocaleTag() {
    const loc = typeof AppI18n === 'object' && typeof AppI18n.getLocale === 'function' ? AppI18n.getLocale() : 'es-MX';
    if (loc === 'en') return 'en-US';
    if (loc === 'zh-CN') return 'zh-CN';
    return loc || 'es-MX';
  }

  function fmtInt(n) {
    const v = Math.round(Number(n) || 0);
    try {
      return v.toLocaleString(getLocaleTag());
    } catch {
      return String(v);
    }
  }

  function fmtPct(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    const loc = getLocaleTag();
    const s = v.toFixed(1);
    return loc.startsWith('es') ? `${s.replace('.', ',')}%` : `${s}%`;
  }

  const GOLD_RANK_KEYS = {
    Saqueador: 'welcome.rankRaider',
    Mercader: 'welcome.rankMerchant',
    'Tesorero Real': 'welcome.rankTreasurer',
    Conquistador: 'welcome.rankConqueror',
    'Mansa Musa': 'welcome.rankMansaMusa',
  };

  function locGoldRank(label) {
    if (!label) return '';
    const key = GOLD_RANK_KEYS[label];
    return key ? wt(key, label) : String(label);
  }

  const RECORD_LABEL_KEYS = {
    fastest_win: 'welcome.recFastestWin',
    best_dark_tc: 'welcome.recBestDarkTc',
    peak_eapm: 'welcome.recPeakEapm',
    max_gold: 'welcome.recMaxGold',
  };

  function locRecord(rec) {
    if (!rec) return null;
    const lblKey = RECORD_LABEL_KEYS[rec.id];
    const label = lblKey ? wt(lblKey, rec.label) : rec.label;
    const value = rec.id === 'max_gold' && Number.isFinite(rec.rawGold)
      ? `${fmtInt(rec.rawGold)} ${wt('welcome.goldWord', 'oro')}`
      : rec.value;
    const ctx = rec.civ
      ? [locCiv(rec.civ), rec.map ? locMap(rec.map) : null].filter(Boolean).join(' · ')
      : rec.context;
    return { ...rec, label, value, context: ctx };
  }

  function locMap(name) {
    if (!name) return '';
    if (typeof AppI18n === 'object' && typeof AppI18n.map === 'function') {
      const translated = AppI18n.map(name);
      if (translated) return translated;
    }
    return String(name);
  }

  function locUnitOrTech(name, nameEn) {
    const loc = getLocaleTag();
    if (typeof AppI18n === 'object' && typeof AppI18n.unit === 'function') {
      const u = AppI18n.unit(nameEn || name);
      if (u && u !== (nameEn || name)) return u;
    }
    if (loc.startsWith('en') && nameEn) return nameEn;
    return name || nameEn || '';
  }

  function formatDateLocalized(tsMs, fallback) {
    if (!tsMs) return fallback || wt('welcome.dailyBrief', 'RESUMEN DIARIO');
    try {
      const d = new Date(tsMs);
      const loc = getLocaleTag();
      const raw = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'short' }).format(d);
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    } catch {
      return fallback || wt('welcome.dailyBrief', 'RESUMEN DIARIO');
    }
  }

  function locCiv(name) {
    if (!name) return '';
    if (typeof AppI18n === 'object' && typeof AppI18n.civ === 'function') {
      const translated = AppI18n.civ(name);
      if (translated) return translated;
    }
    return String(name);
  }

  function civSlug(name, fallbackSlug) {
    if (fallbackSlug) return String(fallbackSlug).toLowerCase().replace(/[^a-z0-9_]/g, '');
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function crestImg(name, slug, cls = 'wh-civ-crest') {
    const s = civSlug(name, slug);
    if (!s) return `<span class="${cls} is-fallback" aria-hidden="true"></span>`;
    return `<img class="${cls}" src="assets/civs/${esc(s)}.png" alt="" width="22" height="22" loading="lazy" draggable="false" />`;
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  const NEWS_TAG_META = {
    novedad: { labelKey: 'welcome.newsTag.novedad', fallback: 'Novedad', cls: 'is-gold' },
    actualizacion: { labelKey: 'welcome.newsTag.actualizacion', fallback: 'Actualización', cls: 'is-emerald' },
    torneo: { labelKey: 'welcome.newsTag.torneo', fallback: 'Torneo', cls: 'is-gold' },
    aviso: { labelKey: 'welcome.newsTag.aviso', fallback: 'Aviso', cls: 'is-alert' },
  };

  function isBootLoaderCovering() {
    if (typeof document === 'undefined') return false;
    const loader = document.getElementById('appBootLoader');
    return Boolean(loader && !loader.hidden && !loader.classList.contains('is-done'));
  }

  function prefersReducedMotion() {
    return Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function createWelcomeHomeUi({ container, goTo, openTechTree, openAnnouncementUrl } = {}) {
    let payload = null;
    let selectedLadder = null;
    let userPickedLadder = false;
    let activeRafId = 0;
    let barTimerIds = [];
    let settleTimerId = 0;
    let lastRevealAt = 0;

    function resolveLadderKey(data) {
      if (userPickedLadder && selectedLadder && data?.globalMeta?.ladders?.[selectedLadder]) {
        return selectedLadder;
      }
      if (data?.globalMeta?.ladders?.rm_1v1) return 'rm_1v1';
      return 'rm_team';
    }

    function cancelRunningMotion() {
      if (activeRafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(activeRafId);
        activeRafId = 0;
      }
      for (const id of barTimerIds) clearTimeout(id);
      barTimerIds = [];
      if (settleTimerId) {
        clearTimeout(settleTimerId);
        settleTimerId = 0;
      }
    }

    function snapBarsImmediate(scope = container) {
      if (!scope) return;
      scope.querySelectorAll('[data-wh-bar]').forEach((bar) => {
        const w = Number(bar.getAttribute('data-wh-bar'));
        if (!Number.isFinite(w)) return;
        const minW = bar.hasAttribute('data-wh-bar-min') ? Number(bar.getAttribute('data-wh-bar-min')) : 10;
        bar.style.transition = 'none';
        bar.style.width = `${Math.max(minW, Math.min(100, w))}%`;
        void bar.offsetWidth;
        bar.style.transition = '';
      });
    }

    function snapNumbersImmediate(scope = container) {
      if (!scope) return;
      scope.querySelectorAll('[data-wh-count]').forEach((el) => {
        const target = Number(el.getAttribute('data-wh-count'));
        const fmt = el.getAttribute('data-wh-fmt') || 'int';
        if (!Number.isFinite(target)) return;
        el.textContent = fmt === 'pct1' ? fmtPct(target) : fmtInt(target);
      });
    }

    /**
     * Llenado fluido real de 0% → destino (doble RAF para garantizar transición CSS)
     * + incremento suave de números en un único loop requestAnimationFrame.
     */
    function animateBarsAndNumbers({ scope = container, staggerBaseMs = 120, onlyMeta = false } = {}) {
      if (!scope) return;
      cancelRunningMotion();

      if (prefersReducedMotion() || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        snapBarsImmediate(scope);
        snapNumbersImmediate(scope);
        return;
      }

      // 1. Preparar barras en 0% sin transición para que la subida desde 0% sea 100% real
      const bars = [...scope.querySelectorAll('[data-wh-bar]')];
      bars.forEach((bar) => {
        bar.style.transition = 'none';
        bar.style.width = '0%';
      });

      // 2. Preparar contadores numéricos
      const counters = [...scope.querySelectorAll('[data-wh-count]')]
        .map((el, idx) => {
          const target = Number(el.getAttribute('data-wh-count'));
          if (!Number.isFinite(target) || target <= 0) return null;
          const fmt = el.getAttribute('data-wh-fmt') || 'int';
          const role = el.getAttribute('data-wh-role') || 'stat';
          const isHeroGold = role === 'gold';
          const delay = onlyMeta ? 40 : 160;
          const duration = isHeroGold ? 1150 : 760;
          const startVal = 0;
          el.textContent = fmt === 'pct1' ? fmtPct(0) : '0';
          return { el, target, startVal, fmt, delay, duration, isHeroGold };
        })
        .filter(Boolean);

      // Doble RAF: garantiza que el layout con width=0% y texto=0 haya hecho paint antes de animar
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          // Lanzar llenado suave escalonado de barras
          bars.forEach((bar, idx) => {
            const w = Number(bar.getAttribute('data-wh-bar'));
            if (!Number.isFinite(w)) return;
            const minW = bar.hasAttribute('data-wh-bar-min') ? Number(bar.getAttribute('data-wh-bar-min')) : 10;
            const targetW = `${Math.max(minW, Math.min(100, w))}%`;
            const isGoldBar = bar.closest('.wh-gold-rank-track') != null;
            const delay = onlyMeta ? 60 + idx * 75 : (isGoldBar ? 260 : staggerBaseMs + 140 + idx * 75);
            const tid = setTimeout(() => {
              bar.style.transition = '';
              bar.style.width = targetW;
            }, delay);
            barTimerIds.push(tid);
          });

          // Un solo RAF loop suave para todos los contadores numéricos
          if (!counters.length) return;
          const t0 = performance.now();
          const tick = (now) => {
            const elapsed = now - t0;
            let remaining = 0;
            for (const c of counters) {
              if (elapsed < c.delay) {
                remaining += 1;
                continue;
              }
              const p = Math.min(1, (elapsed - c.delay) / c.duration);
              const eased = c.isHeroGold ? easeOutExpo(p) : easeOutQuart(p);
              const current = c.startVal + (c.target - c.startVal) * eased;
              if (p >= 1) {
                c.el.textContent = c.fmt === 'pct1' ? fmtPct(c.target) : fmtInt(c.target);
              } else {
                c.el.textContent = c.fmt === 'pct1' ? fmtPct(current) : fmtInt(current);
                remaining += 1;
              }
            }
            if (remaining > 0) {
              activeRafId = window.requestAnimationFrame(tick);
            } else {
              activeRafId = 0;
            }
          };
          activeRafId = window.requestAnimationFrame(tick);
        });
      });
    }

    function playChoreography({ force = false } = {}) {
      if (!container || !payload) return;
      const now = Date.now();
      if (!force && now - lastRevealAt < 350) return;
      lastRevealAt = now;

      if (prefersReducedMotion()) {
        container.classList.remove('is-entering', 'is-holding');
        snapBarsImmediate(container);
        snapNumbersImmediate(container);
        return;
      }

      container.classList.remove('is-holding', 'is-entering');
      void container.offsetWidth;
      container.classList.add('is-entering');

      animateBarsAndNumbers({ scope: container, staggerBaseMs: 140, onlyMeta: false });

      settleTimerId = setTimeout(() => {
        container.classList.remove('is-entering');
        settleTimerId = 0;
      }, 1150);
    }

    function renderAnnouncement(ann) {
      const hasLive = Boolean(ann && ann.enabled === true && (ann.title || ann.body));
      const effective = hasLive
        ? ann
        : {
            enabled: true,
            tag: 'novedad',
            title: wt('welcome.defaultNewsTitle', 'Relic v3.2 · Novedades de la semana'),
            body: wt('welcome.defaultNewsBody', 'Meta global de 56 civilizaciones, counters Pro 1v1, rango semanal de oro y seguridad reforzada.'),
            imageUrl: 'assets/art/wizard-umbral.webp',
            ctaLabel: '',
            ctaUrl: '',
            isDefault: true,
          };
      const meta = NEWS_TAG_META[effective.tag] || NEWS_TAG_META.novedad;
      const tagLabel = wt(meta.labelKey, meta.fallback);
      const hasImage = Boolean(effective.imageUrl);
      const mediaHtml = hasImage
        ? `<div class="wh-news-media">
            <img src="${esc(effective.imageUrl)}" alt="" loading="lazy" draggable="false" />
          </div>`
        : '';
      const ctaHtml = effective.ctaUrl
        ? `<div class="wh-news-foot"><button type="button" class="wh-news-cta" data-wh-open-news="1">${esc(effective.ctaLabel || wt('welcome.newsMore', 'Ver más'))} <span class="wh-arrow" aria-hidden="true">→</span></button></div>`
        : '';
      return `<section class="wh-news-banner ${meta.cls}${hasImage ? ' has-media' : ''}${effective.isDefault ? ' is-editorial' : ''}" aria-label="${esc(wt('welcome.newsAria', 'Noticia de Relic'))}">
        ${mediaHtml}
        <div class="wh-news-body-wrap">
          <div class="wh-news-meta-row">
            <span class="wh-news-tag ${meta.cls}">${esc(tagLabel)}</span>
            <span class="wh-news-badge mono">${esc(wt('welcome.newsChannel', 'NOTICIA DE RELIC'))}</span>
          </div>
          ${effective.title ? `<h3 class="wh-news-title">${esc(effective.title)}</h3>` : ''}
          ${effective.body ? `<p class="wh-news-paragraph">${esc(effective.body)}</p>` : ''}
          ${ctaHtml}
        </div>
      </section>`;
    }

    function renderActivityStrip(strip) {
      if (!Array.isArray(strip) || !strip.length) return '';
      const anyPlayed = strip.some((d) => d.games > 0);
      if (!anyPlayed) return '';
      const loc = getLocaleTag();
      const cells = strip.map((day, idx) => {
        let dayShort = day.dayLabel;
        if (day.dateKey) {
          try {
            const parts = String(day.dateKey).split('-').map(Number);
            if (parts.length === 3) {
              const dt = new Date(parts[0], parts[1] - 1, parts[2]);
              dayShort = new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(dt).toUpperCase();
            }
          } catch { /* fallback to day.dayLabel */ }
        }
        const title = day.games > 0
          ? wt(day.games === 1 ? 'welcome.dayRecordOne' : 'welcome.dayRecordMany', '{day}: {w}V–{l}D ({n} partidas)', {
            day: dayShort, w: day.wins, l: day.losses, n: day.games,
          })
          : wt('welcome.dayNoMatches', '{day}: Sin partidas', { day: dayShort });
        return `<div class="wh-act-day wh-act-d${idx} is-${esc(day.polarity)}${day.isToday ? ' is-today' : ''}" title="${esc(title)}">
          <span class="wh-act-dot" aria-hidden="true">${day.games > 0 ? esc(String(day.games)) : ''}</span>
          <span class="wh-act-lbl mono">${esc(dayShort)}</span>
        </div>`;
      }).join('');
      return `<div class="wh-activity-wrap">
        <span class="wh-act-kicker">${esc(wt('welcome.activity7d', 'Últimos 7 días'))}</span>
        <div class="wh-activity-strip">${cells}</div>
      </div>`;
    }

    function renderSpotlightColumn({ kicker, rows, kind }) {
      if (!Array.isArray(rows) || !rows.length) {
        return `<div class="wh-meta-col">
          <span class="wh-kicker">${esc(kicker)}</span>
          <p class="wh-meta-empty">${esc(wt('welcome.metaSyncing', 'Sincronizando estadísticas globales del ladder…'))}</p>
        </div>`;
      }

      const leader = rows[0];
      const runners = rows.slice(1, 3);
      const tone = kind === 'wr' ? 'is-emerald' : 'is-gold';
      const leaderLabel = locCiv(leader.name);
      const leaderNum = kind === 'wr' ? Number(leader.winRate) : Number(leader.pickRate);
      const leaderVal = fmtPct(leaderNum);
      const leaderMeta = kind === 'wr'
        ? `${fmtPct(leader.pickRate)} pick`
        : `${fmtPct(leader.winRate)} WR`;

      const maxVal = kind === 'pick'
        ? Math.max(...rows.map((r) => Number(r.pickRate) || 0), 6)
        : Math.max(...rows.map((r) => Math.max(1, (Number(r.winRate) || 50) - 44)), 14);

      const unitArtHtml = leader.unitArt
        ? `<img class="wh-spot-unit" src="${esc(leader.unitArt)}" alt="${esc(leader.unitName || leaderLabel)}" loading="lazy" draggable="false" />`
        : '';

      const runnersHtml = runners.map((r, idx) => {
        const label = locCiv(r.name);
        const valNum = kind === 'wr' ? Number(r.winRate) : Number(r.pickRate);
        const val = fmtPct(valNum);
        const barPct = kind === 'pick'
          ? ((Number(r.pickRate) || 0) / maxVal) * 100
          : (Math.max(2, (Number(r.winRate) || 50) - 44) / maxVal) * 100;
        const sub = kind === 'wr'
          ? `${fmtPct(r.pickRate)} pick`
          : `${fmtPct(r.winRate)} WR`;
        return `<li class="wh-runner">
          <span class="wh-runner-rank mono">0${idx + 2}</span>
          ${crestImg(r.name, r.slug)}
          <div class="wh-runner-mid">
            <div class="wh-runner-top">
              <strong>${esc(label)}</strong>
              <span class="wh-runner-sub mono">${esc(sub)}</span>
            </div>
            <div class="wh-runner-track" aria-hidden="true"><i class="${tone}" data-wh-bar="${barPct.toFixed(1)}"></i></div>
          </div>
          <span class="wh-runner-val mono ${tone}">${esc(val)}</span>
        </li>`;
      }).join('');

      return `<div class="wh-meta-col">
        <div class="wh-spot ${tone}">
          <div class="wh-spot-top">
            <span class="wh-spot-kicker">${esc(kicker)}</span>
            <span class="wh-spot-rank mono">#01</span>
          </div>
          <div class="wh-spot-main">
            <div class="wh-spot-copy">
              <div class="wh-spot-title-row">
                ${crestImg(leader.name, leader.slug, 'wh-spot-crest')}
                <strong class="wh-spot-civ">${esc(leaderLabel)}</strong>
              </div>
              <span class="wh-spot-uu">${esc(leader.unitName || '')}</span>
              <div class="wh-spot-metric">
                <b class="mono ${tone}">${esc(leaderVal)}</b>
              </div>
              <small class="wh-spot-meta mono">${esc(leaderMeta)}</small>
            </div>
            <div class="wh-spot-art" aria-hidden="true">
              ${unitArtHtml}
            </div>
          </div>
        </div>
        <ol class="wh-runners">${runnersHtml}</ol>
      </div>`;
    }

    function renderCounterStrip(topCounter) {
      if (!topCounter || !Array.isArray(topCounter.picks) || !topCounter.picks.length) return '';
      const picksHtml = topCounter.picks.map((pick) => {
        const routeHtml = pick.route ? `<span class="wh-counter-route">${esc(pick.route)}</span>` : '';
        return `<div class="wh-counter-chip">
          ${crestImg(pick.name, pick.slug, 'wh-counter-crest')}
          <div class="wh-counter-copy">
            <div class="wh-counter-top">
              <strong>${esc(locCiv(pick.name))}</strong>
              <span class="wh-counter-wr mono is-emerald">${esc(String(pick.winRatePct))}% WR</span>
            </div>
            ${routeHtml}
          </div>
        </div>`;
      }).join('');

      return `<div class="wh-counter-bar">
        <div class="wh-counter-head">
          <span class="wh-maps-label">${esc(wt('welcome.counterLabel', 'CÓMO FRENAR A {civ} (#1)', { civ: locCiv(topCounter.targetName) }))}</span>
          <span class="wh-counter-src mono">${esc(wt('welcome.counterSrc', 'Datos Pro 1v1'))}</span>
        </div>
        <div class="wh-counter-picks">${picksHtml}</div>
      </div>`;
    }

    function renderTreasury(warLedger) {
      if (!warLedger) {
        return `<aside class="wh-treasury">
          <header class="wh-treasury-head">
            <span class="wh-kicker">${esc(wt('welcome.goldTitle', 'TU ORO ESTA SEMANA'))}</span>
            <span class="wh-treasury-scope">${esc(wt('welcome.noMatchesYet', 'Sin partidas todavía'))}</span>
          </header>
          <div class="wh-gold-hero">
            <div class="wh-gold-orb" aria-hidden="true">
              <img class="wh-gold-ico" src="assets/icons/gold.png" alt="" width="30" height="30" draggable="false" />
            </div>
            <div class="wh-gold-nums">
              <strong class="wh-gold-amount mono">0</strong>
              <span class="wh-gold-unit">${esc(wt('welcome.goldWeekUnit', 'de oro juntado esta semana'))}</span>
            </div>
          </div>
          <p class="wh-gold-hint">${esc(wt('welcome.goldEmptyHint', 'Cada vez que jugás una partida con Relic abierto, se suma automáticamente todo el oro que juntaste.'))}</p>
        </aside>`;
      }

      const tcDark = warLedger.avgDarkTcPct != null
        ? wt('welcome.tcDarkPct', '{pct}% TC Alta Edad', { pct: getLocaleTag().startsWith('es') ? String(warLedger.avgDarkTcPct).replace('.', ',') : String(warLedger.avgDarkTcPct) })
        : wt('welcome.hoursPlayed', '{h} h jugadas', { h: warLedger.hoursPlayed });
      const goldSubLabel = warLedger.scope === 'week'
        ? wt('welcome.goldWeekUnit', 'de oro juntado esta semana')
        : wt('welcome.goldRecentUnit', 'de oro en tus últimas partidas');

      const rank = warLedger.goldRank || null;
      const rankHtml = rank
        ? `<div class="wh-gold-rank">
            <div class="wh-gold-rank-head">
              <span class="wh-gold-rank-title">${esc(locGoldRank(rank.label))}</span>
              <span class="wh-gold-rank-next mono">${rank.nextLabel
                ? esc(wt('welcome.goldRankNext', 'Faltan {gold} para {next}', { gold: fmtInt(rank.remainingGold), next: locGoldRank(rank.nextLabel) }))
                : esc(wt('welcome.goldRankMax', 'Rango máximo semanal'))}</span>
            </div>
            <div class="wh-gold-rank-track" aria-hidden="true">
              <i data-wh-bar="${esc(String(rank.pct))}" data-wh-bar-min="4"></i>
            </div>
          </div>`
        : '';

      const rec = locRecord(warLedger.weeklyRecord?.primary || null);
      const recordHtml = rec
        ? `<div class="wh-record-foot">
            <span class="wh-record-kicker">${esc(wt('welcome.weeklyRecord', 'RÉCORD DE LA SEMANA'))}</span>
            <div class="wh-record-main">
              <strong class="wh-record-val mono">${esc(rec.value)}</strong>
              <span class="wh-record-lbl">${esc(rec.label)}${rec.context ? ` · <em>${esc(rec.context)}</em>` : ''}</span>
            </div>
          </div>`
        : '';

      const todayGoldVal = Math.max(0, Math.round(Number(warLedger.todayGold) || 0));
      const todayInlineHtml = `<span class="wh-gold-today-sep" aria-hidden="true">·</span><span class="wh-gold-today${todayGoldVal > 0 ? ' has-gain' : ''} mono" title="${esc(wt('welcome.goldTodayTip', 'Oro juntado en tus partidas de hoy'))}">+${fmtInt(todayGoldVal)} ${esc(wt('welcome.today', 'hoy'))}</span>`;
      const scopeLabelText = warLedger.scope === 'week'
        ? wt(warLedger.matchesCount === 1 ? 'welcome.weekScopeOne' : 'welcome.weekScopeMany', 'Esta semana · {n} partidas', { n: warLedger.matchesCount || 0 })
        : wt('welcome.recentScope', 'Últimas {n} partidas', { n: warLedger.matchesCount || 0 });
      const knightsEq = Number.isFinite(warLedger.paladinsEq) ? warLedger.paladinsEq : Math.max(1, Math.round((warLedger.goldTotal || 0) / 75));
      const trebsEq = Number.isFinite(warLedger.trebsEq) ? warLedger.trebsEq : Math.max(1, Math.round((warLedger.goldTotal || 0) / 200));
      const goldEqText = (warLedger.goldTotal || 0) >= 200
        ? wt('welcome.goldEq', 'Equivale a {knights} Caballeros o {trebs} Lanzapiedras', { knights: fmtInt(knightsEq), trebs: fmtInt(trebsEq) })
        : wt('welcome.goldEqEmpty', 'Juega una partida con Relic abierto para empezar a juntar oro');

      return `<aside class="wh-treasury">
        <header class="wh-treasury-head">
          <span class="wh-kicker">${esc(wt('welcome.goldTitle', 'TU ORO ESTA SEMANA'))}</span>
          <span class="wh-treasury-scope mono">${esc(scopeLabelText)}</span>
        </header>

        <div class="wh-gold-hero">
          <div class="wh-gold-orb" aria-hidden="true">
            <img class="wh-gold-ico" src="assets/icons/gold.png" alt="" width="30" height="30" draggable="false" />
          </div>
          <div class="wh-gold-nums">
            <strong class="wh-gold-amount mono" data-wh-count="${esc(String(warLedger.goldTotal))}" data-wh-fmt="int" data-wh-role="gold">${fmtInt(warLedger.goldTotal)}</strong>
            <div class="wh-gold-subline">
              <span class="wh-gold-unit">${esc(goldSubLabel)}</span>
              ${todayInlineHtml}
            </div>
          </div>
        </div>

        ${rankHtml}

        <p class="wh-gold-eq">${esc(goldEqText)}</p>
        <p class="wh-gold-hint">${esc(wt('welcome.goldAutoHint', 'Se actualiza solo cada vez que terminás una partida.'))}</p>

        <dl class="wh-ledger-grid">
          <div class="wh-ledger-cell">
            <dt><img src="assets/icons/villager.png" alt="" width="14" height="14" draggable="false" /><span>${esc(wt('welcome.villagers', 'Aldeanos'))}</span></dt>
            <dd class="mono">${fmtInt(warLedger.villagers)}</dd>
            <small>${esc(wt('welcome.created', 'creados'))}</small>
          </div>
          <div class="wh-ledger-cell">
            <dt><img src="assets/icons/sword.png" alt="" width="14" height="14" draggable="false" /><span>${esc(wt('welcome.army', 'Ejército'))}</span></dt>
            <dd class="mono">${fmtInt(warLedger.military)}</dd>
            <small>${esc(wt('welcome.units', 'unidades'))}</small>
          </div>
          <div class="wh-ledger-cell">
            <dt><img src="assets/icons/castle.png" alt="" width="14" height="14" draggable="false" /><span>${esc(wt('welcome.castlesFarms', 'Castillos · Granjas'))}</span></dt>
            <dd class="mono">${fmtInt(warLedger.castles)} <span class="wh-ledger-sep">/</span> ${fmtInt(warLedger.farms)}</dd>
            <small>${esc(wt('welcome.built', 'construidos'))}</small>
          </div>
          <div class="wh-ledger-cell">
            <dt><img src="assets/icons/clock.png" alt="" width="14" height="14" draggable="false" /><span>${esc(wt('welcome.peakEapm', 'Pico eAPM'))}</span></dt>
            <dd class="mono">${warLedger.peakEapm ? `${warLedger.peakEapm}` : '—'}</dd>
            <small>${esc(tcDark)}</small>
          </div>
        </dl>

        ${recordHtml}
      </aside>`;
    }

    function renderGlobalMetaBody(ladder, winDays) {
      const mapsHtml = (ladder && Array.isArray(ladder.topMaps) && ladder.topMaps.length)
        ? `<div class="wh-maps-bar">
            <span class="wh-maps-label">${esc(wt('welcome.maps', 'Mapas'))}</span>
            <div class="wh-maps-items">${ladder.topMaps.map((m, i) => `<span class="wh-map-item${i === 0 ? ' is-lead' : ''}"><b>${esc(m.name)}</b> <i class="mono">${fmtPct(m.share)}</i></span>`).join('')}</div>
            <span class="wh-maps-total mono">${esc(wt('welcome.lastDays', 'Últimos {days} días', { days: winDays }))}</span>
          </div>`
        : '';

      const counterHtml = renderCounterStrip(ladder?.topCounter);

      return `
        <div class="wh-meta-duet">
          ${renderSpotlightColumn({ kicker: wt('welcome.mostPlayed', 'MÁS JUGADA'), rows: ladder?.topPlayed, kind: 'pick' })}
          ${renderSpotlightColumn({ kicker: wt('welcome.highestWr', 'MAYOR WINRATE'), rows: ladder?.topWinrate, kind: 'wr' })}
        </div>
        ${mapsHtml}
        ${counterHtml}
      `;
    }

    function render({ animate = true } = {}) {
      if (!container) return;
      const d = payload || {};
      const rawG = d.greeting || {};
      const salKey = rawG.salutationKey ? `welcome.${rawG.salutationKey}` : 'welcome.salMorning';
      const subKey = rawG.sublineKey ? `welcome.${rawG.sublineKey}` : 'welcome.subDefault';
      const greeting = {
        salutation: wt(salKey, 'Buenos días'),
        playerName: rawG.hasAlias === false ? wt('welcome.commander', 'Comandante') : (rawG.playerName || wt('welcome.commander', 'Comandante')),
        subline: wt(subKey, 'Buen entrenamiento y buenas partidas hoy.'),
        dateLabel: formatDateLocalized(rawG.timestampMs, rawG.dateLabel),
      };
      const wShort = wt('welcome.winShort', 'V');
      const lShort = wt('welcome.lossShort', 'D');
      const p = d.personal || {};
      const gm = d.globalMeta || null;
      const ladderKey = resolveLadderKey(d);
      selectedLadder = ladderKey;
      const ladder = gm?.ladders?.[ladderKey] || null;
      const winDays = gm?.windowDays || 7;
      const hs = d.heroShowcase || null;

      // Línea editorial de pulso ELO
      const statTicks = [];
      if (p.eloTeam && Number.isFinite(p.eloTeam.rating)) {
        statTicks.push(`<div class="wh-tick"><strong class="mono is-gold">${fmtInt(p.eloTeam.rating)}</strong><span>ELO Team</span></div>`);
      }
      if (p.elo1v1 && Number.isFinite(p.elo1v1.rating)) {
        statTicks.push(`<div class="wh-tick"><strong class="mono">${fmtInt(p.elo1v1.rating)}</strong><span>ELO 1v1</span></div>`);
      }
      const streakSrc = p.primaryMode === 'rm_team' ? (p.eloTeam || p.elo1v1) : (p.elo1v1 || p.eloTeam);
      if (streakSrc && Math.abs(streakSrc.streak || 0) >= 2) {
        const up = streakSrc.streak > 0;
        statTicks.push(`<div class="wh-tick"><strong class="mono ${up ? 'is-emerald' : 'is-loss'}">${up ? `+${streakSrc.streak}` : streakSrc.streak}</strong><span>${esc(up ? wt('welcome.streakHot', 'Racha activa') : wt('welcome.streakCold', 'Últimas caídas'))}</span></div>`);
      }
      if (p.weekSummary && p.weekSummary.games > 0) {
        const ws = p.weekSummary;
        const periodLbl = ws.periodLabel === 'Últimos 7 días'
          ? wt('welcome.activity7d', 'Últimos 7 días')
          : wt('welcome.recentLabel', 'Reciente');
        statTicks.push(`<div class="wh-tick"><strong class="mono">${ws.wins}${wShort} – ${ws.losses}${lShort}</strong><span>${esc(periodLbl)} (${ws.winRate}%)</span></div>`);
      }

      const activityHtml = renderActivityStrip(p.activityStrip);

      // Héroe visual derecho
      const hsKicker = hs
        ? (hs.origin === 'personal'
          ? wt('welcome.heroYourCiv', 'TU CIVILIZACIÓN')
          : `${wt('welcome.heroMetaCiv', 'DESTACADA DEL META')} · ${hs.isTeam ? 'TEAM' : '1V1'}`)
        : '';
      const hsStat = hs
        ? (hs.origin === 'personal' && Number.isFinite(hs.wins)
          ? `${hs.wins}${wShort} – ${hs.losses}${lShort} · ${hs.winRate}% WR`
          : (Number.isFinite(hs.pickRate) ? `${fmtPct(hs.pickRate)} Pick · ${hs.winRate}% WR` : hs.statLine))
        : '';
      const heroVisualHtml = hs && hs.unitArt
        ? `<div class="wh-hero-stage">
            <img class="wh-hero-unit" src="${esc(hs.unitArt)}" alt="" draggable="false" />
            <div class="wh-hero-caption">
              <span class="wh-cap-kicker">${esc(hsKicker)}</span>
              <div class="wh-hero-cap-title">
                ${crestImg(hs.civName, hs.slug, 'wh-cap-crest')}
                <strong>${esc(hs.unitName ? locUnitOrTech(hs.unitName, hs.unitName) : locCiv(hs.civName))}</strong>
              </div>
              <span class="wh-hero-cap-sub">${esc(locCiv(hs.civName))}${hsStat ? ` · ${esc(hsStat)}` : ''}</span>
            </div>
          </div>`
        : '';

      // Franja inferior editorial de 3 columnas abiertas
      const topCiv = p.topCiv;
      const topMap = p.topMap;
      const rcp = p.rivalCivPulse || null;
      let rivalPulseHtml = '';
      if (rcp && (rcp.victim || rcp.nemesis)) {
        const rows = [];
        if (rcp.victim) {
          rows.push(`<div class="wh-rival-row">
            <span class="wh-rival-tag is-emerald">${esc(wt('welcome.victim', 'Víctima'))}</span>
            ${crestImg(rcp.victim.name, rcp.victim.slug, 'wh-rival-crest')}
            <strong>${esc(locCiv(rcp.victim.name))}</strong>
            <span class="wh-rival-rec mono is-emerald">${rcp.victim.wins}${wShort}–${rcp.victim.losses}${lShort}</span>
          </div>`);
        }
        if (rcp.nemesis) {
          rows.push(`<div class="wh-rival-row">
            <span class="wh-rival-tag is-loss">${esc(wt('welcome.nemesis', 'Némesis'))}</span>
            ${crestImg(rcp.nemesis.name, rcp.nemesis.slug, 'wh-rival-crest')}
            <strong>${esc(locCiv(rcp.nemesis.name))}</strong>
            <span class="wh-rival-rec mono is-loss">${rcp.nemesis.wins}${wShort}–${rcp.nemesis.losses}${lShort}</span>
          </div>`);
        }
        rivalPulseHtml = `<div class="wh-rival-pulse">${rows.join('')}</div>`;
      }

      const personalColHtml = topCiv
        ? `<div class="wh-strip-civ">
            ${crestImg(topCiv.name, topCiv.slug, 'wh-strip-crest')}
            <div>
              <strong>${esc(locCiv(topCiv.name))}</strong>
              <small class="mono"><em class="${topCiv.winRate >= 54 ? 'is-emerald' : topCiv.winRate < 46 ? 'is-loss' : 'is-gold'}">${topCiv.winRate}% WR</em> · ${topCiv.wins}${wShort}–${topCiv.losses}${lShort}</small>
            </div>
          </div>
          ${topMap ? `<p class="wh-strip-note">${esc(wt('welcome.mostPlayedMap', 'Mapa más jugado:'))} <b>${esc(locMap(topMap.name))}</b> <span class="mono">(${topMap.wins}${wShort}–${topMap.losses}${lShort} · ${topMap.winRate}%)</span></p>` : ''}
          ${rivalPulseHtml}`
        : `<p class="wh-strip-note">${esc(wt('welcome.noRecentMatches', 'Jugá unas partidas clasificatorias para descubrir tu civilización y mapa protagonista de la semana.'))}</p>`;

      const rawCur = d.curiosity || null;
      let cur;
      if (rawCur && rawCur.factKey && rawCur.vars) {
        const fk = rawCur.factKey;
        const localizedName = locUnitOrTech(rawCur.vars.name, rawCur.vars.nameEn);
        const fVars = { ...rawCur.vars, name: localizedName };
        cur = {
          tag: wt(`welcome.codex.${fk}Tag`, rawCur.tag),
          title: wt(`welcome.codex.${fk}Title`, rawCur.title, fVars),
          body: wt(`welcome.codex.${fk}Body`, rawCur.body, fVars),
          ctaLabel: rawCur.ctaKey ? wt(`welcome.${rawCur.ctaKey}`, rawCur.ctaLabel) : wt('welcome.codexViewTree', rawCur.ctaLabel),
          action: rawCur.action || 'techtree',
        };
      } else {
        cur = {
          tag: wt('welcome.codexDefaultTag', 'CÓDICE AOE2:DE'),
          title: wt('welcome.codexDefaultTitle', '56 civilizaciones oficiales para comparar'),
          body: wt('welcome.codexDefaultBody', 'Abre el Árbol de tecnología en Entrenamiento para comparar dos civilizaciones lado a lado.'),
          ctaLabel: wt('welcome.codexDefaultCta', 'Abrir Árbol de tecnología'),
          action: rawCur?.action || 'techtree',
        };
      }

      const tr = p.training;
      const trPct = tr && tr.daysTarget > 0 ? Math.min(100, Math.round((tr.daysActive / tr.daysTarget) * 100)) : 0;
      const trDetail = tr && tr.daysActive > 0
        ? (tr.streakDays >= 2
          ? wt('welcome.daysActiveStreak', '{active} de {target} días activos esta semana · racha de {streak} días.', { active: tr.daysActive, target: tr.daysTarget, streak: tr.streakDays })
          : wt('welcome.daysActive', '{active} de {target} días activos esta semana.', { active: tr.daysActive, target: tr.daysTarget }))
        : (tr?.nextMissionTitle
          ? wt('welcome.nextGoal', 'Siguiente objetivo: {title}.', { title: tr.nextMissionTitle })
          : wt('welcome.defaultTrainDesc', 'Entrena aperturas, Arena táctica y compara las 56 civilizaciones oficiales.'));
      const trBarHtml = tr && tr.daysTarget > 0
        ? `<div class="wh-tr-progress">
            <div class="wh-tr-track" aria-hidden="true"><i data-wh-bar="${esc(String(trPct))}" data-wh-bar-min="4"></i></div>
            <span class="wh-tr-meta mono">${esc(`${tr.daysActive}/${tr.daysTarget}`)} · ${esc(wt('welcome.arenaLvl', 'Arena Nv.{n}', { n: tr.arenaLevel || 1 }))}</span>
          </div>`
        : '';

      const extraRecords = Array.isArray(d.warLedger?.weeklyRecord?.items) ? d.warLedger.weeklyRecord.items.slice(1, 3).map(locRecord) : [];
      const extraRecordsHtml = extraRecords.length
        ? `<div class="wh-extra-records">${extraRecords.map((item) => `
            <div class="wh-extra-rec-row">
              <span class="wh-extra-rec-lbl">${esc(item.label)}</span>
              <strong class="mono">${esc(item.value)}</strong>
            </div>`).join('')}</div>`
        : '';

      container.innerHTML = `
          <section class="wh-stage-hero">
            <img class="wh-bg-flag" src="assets/art/referral-hero.jpg" alt="" aria-hidden="true" draggable="false" />
            <div class="wh-bg-veil" aria-hidden="true"></div>

            <div class="wh-hero-grid">
              <div class="wh-hero-left">
                <div class="wh-date-row">
                  <span class="wh-date-label mono">${esc(greeting.dateLabel || 'RESUMEN DIARIO')}</span>
                  <span class="wh-date-sep" aria-hidden="true">·</span>
                  <span class="wh-date-ctx">${esc(wt('welcome.weeklyBrief', 'Resumen de la semana'))}</span>
                </div>

                <h1 class="wh-display">
                  <span class="wh-display-sal">${esc(greeting.salutation)},</span>
                  <span class="wh-display-name">${esc(greeting.playerName)}</span>
                </h1>

                <p class="wh-lead">${esc(greeting.subline)}</p>

                <div class="wh-cta-row">
                  <button type="button" class="btn gold wh-btn-main" data-wh-go="central">${esc(wt('welcome.ctaCentral', 'Entrar a Central'))}</button>
                  <button type="button" class="wh-text-action" data-wh-go="training">${esc(wt('welcome.ctaTrain', 'Entrenar hoy'))}</button>
                  <span class="wh-action-dot" aria-hidden="true">·</span>
                  <button type="button" class="wh-text-action" data-wh-go="techtree">${esc(wt('welcome.ctaTechTree', 'Árbol de tecnología'))}</button>
                </div>

                ${(statTicks.length || activityHtml) ? `<div class="wh-hero-foot">${statTicks.length ? `<div class="wh-ticks">${statTicks.join('')}</div>` : ''}${activityHtml}</div>` : ''}
              </div>

              ${heroVisualHtml}
            </div>
          </section>

          ${renderAnnouncement(d.announcement)}

          <section class="wh-spread">
            <div class="wh-global-col">
              <header class="wh-section-head">
                <div>
                  <span class="wh-kicker">${esc(wt('welcome.globalKicker', 'META GLOBAL · AGE OF EMPIRES II: DE'))}</span>
                  <h2>${esc(wt('welcome.globalTitle', 'Qué domina la comunidad esta semana'))}</h2>
                </div>
                <div class="wh-mode-tabs" role="tablist" aria-label="Modo del ladder global">
                  <button type="button" class="wh-mode-tab${ladderKey === 'rm_1v1' ? ' active' : ''}" data-wh-ladder="rm_1v1" role="tab" aria-selected="${ladderKey === 'rm_1v1'}">1v1 Ranked</button>
                  <button type="button" class="wh-mode-tab${ladderKey === 'rm_team' ? ' active' : ''}" data-wh-ladder="rm_team" role="tab" aria-selected="${ladderKey === 'rm_team'}">Team Ranked</button>
                </div>
              </header>

              <div class="wh-global-swap" id="whGlobalSwap">
                ${renderGlobalMetaBody(ladder, winDays)}
              </div>
            </div>

            ${renderTreasury(d.warLedger)}
          </section>

          <section class="wh-editorial-strip">
            <div class="wh-strip-col">
              <span class="wh-kicker">${esc(wt('welcome.recentTerrain', 'TU TERRENO RECIENTE'))}</span>
              ${personalColHtml}
              <button type="button" class="wh-link-subtle" data-wh-go="central">${esc(wt('welcome.openCentral', 'Abrir diagnóstico en Central'))} <span class="wh-arrow" aria-hidden="true">→</span></button>
            </div>

            <div class="wh-strip-col">
              <span class="wh-kicker">${esc(cur.tag || wt('welcome.codexDefaultTag', 'CÓDICE AOE2:DE'))} · ${esc(wt('welcome.factOfDay', 'DATO DEL DÍA'))}</span>
              <h3>${esc(cur.title)}</h3>
              <p class="wh-strip-note">${esc(cur.body)}</p>
              ${extraRecordsHtml}
              <button type="button" class="wh-link-subtle" data-wh-go="${esc(cur.action || 'techtree')}">${esc(cur.ctaLabel || wt('welcome.codexExplore', 'Explorar'))} <span class="wh-arrow" aria-hidden="true">→</span></button>
            </div>

            <div class="wh-strip-col">
              <span class="wh-kicker">${esc(wt('welcome.trainingSession', 'SESIÓN DE ENTRENAMIENTO'))}</span>
              <h3>${esc(tr?.unlocked ? wt('welcome.labActive', 'Laboratorio activo') : wt('welcome.trainingModule', 'Módulo de Entrenamiento'))}</h3>
              <p class="wh-strip-note">${esc(trDetail)}</p>
              ${trBarHtml}
              <button type="button" class="wh-link-subtle" data-wh-go="training">${esc(wt('welcome.goTraining', 'Ir a Entrenamiento'))} <span class="wh-arrow" aria-hidden="true">→</span></button>
            </div>
          </section>
      `;

      bindEvents();

      if (!animate) {
        snapBarsImmediate(container);
        snapNumbersImmediate(container);
      } else if (isBootLoaderCovering()) {
        // Sostener barras en 0% detrás del splash para que la coreografía arranque justo al revelar
        container.classList.add('is-holding');
        container.querySelectorAll('[data-wh-bar]').forEach((bar) => {
          bar.style.transition = 'none';
          bar.style.width = '0%';
        });
      } else {
        playChoreography({ force: true });
      }
    }

    function switchLadderSmooth(nextKey) {
      if (!container || !payload) return;
      const swap = container.querySelector('#whGlobalSwap');
      if (!swap) {
        render({ animate: true });
        return;
      }
      container.querySelectorAll('[data-wh-ladder]').forEach((btn) => {
        const active = btn.getAttribute('data-wh-ladder') === nextKey;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
      });
      const gm = payload.globalMeta || null;
      const ladder = gm?.ladders?.[nextKey] || null;
      const winDays = gm?.windowDays || 7;
      swap.classList.remove('is-swapping');
      swap.innerHTML = renderGlobalMetaBody(ladder, winDays);
      void swap.offsetWidth;
      swap.classList.add('is-swapping');
      animateBarsAndNumbers({ scope: swap, staggerBaseMs: 30, onlyMeta: true });
    }

    function bindEvents() {
      if (!container) return;
      container.querySelectorAll('[data-wh-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-wh-go');
          if (typeof UiSfx === 'object') UiSfx.play('tab');
          if (target === 'techtree') {
            if (typeof openTechTree === 'function') openTechTree();
            else if (typeof goTo === 'function') goTo('training');
          } else if (target && typeof goTo === 'function') {
            goTo(target);
          }
        });
      });

      container.querySelectorAll('[data-wh-open-news]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (typeof UiSfx === 'object') UiSfx.play('tab');
          if (typeof openAnnouncementUrl === 'function') openAnnouncementUrl();
        });
      });

      container.querySelectorAll('[data-wh-ladder]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.getAttribute('data-wh-ladder');
          if (!next || next === selectedLadder) return;
          userPickedLadder = true;
          selectedLadder = next;
          if (typeof UiSfx === 'object') UiSfx.play('subtab');
          switchLadderSmooth(next);
        });
      });
    }

    let pendingUpdatePayload = null;
    let pendingUpdateTimer = 0;

    function setData(nextPayload) {
      if (!nextPayload || !nextPayload.ok) return;
      const hadData = Boolean(payload);
      // Si la coreografía de bienvenida está corriendo en vivo, no cortar a mitad el contador
      // ni el llenado de barras por un refresh silencioso del Worker; aplicarlo apenas termina.
      if (hadData && !isBootLoaderCovering() && (activeRafId || barTimerIds.length || settleTimerId)) {
        pendingUpdatePayload = nextPayload;
        if (!pendingUpdateTimer) {
          pendingUpdateTimer = setTimeout(() => {
            pendingUpdateTimer = 0;
            const queued = pendingUpdatePayload;
            pendingUpdatePayload = null;
            if (queued) {
              payload = queued;
              render({ animate: false });
            }
          }, 1250);
        }
        return;
      }
      payload = nextPayload;
      render({ animate: !hadData || isBootLoaderCovering() });
    }

    function rerender() {
      if (payload) render({ animate: false });
    }

    return {
      setData,
      render,
      rerender,
      playChoreography,
    };
  }

  window.WelcomeHomeUI = {
    createWelcomeHomeUi,
  };
})();
