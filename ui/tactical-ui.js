(function (root) {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value) => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('es-AR') : '—';
  const openingArtKey = (name) => String(name || '').normalize('NFD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const OPENING_ART = new Map([
    ['scouts', 'Scout Rush', 'Scout Opening', 'Scouts', 'Apertura de scouts'],
    ['archers', 'Archer Rush', 'Archer Opening', 'Arqueros', 'Rush de arqueros', 'Apertura de arqueros'],
    ['militia', 'Drush'],
    ['swords', 'M@A Rush', 'M@A', 'MAA rush', 'Man at arms rush', 'Rush de M@A'],
    ['castle', 'Fast Castle', 'FC'],
    ['boom', '2TC Feudal Boom', '2TC feudal', 'Boom de 2TC en feudal'],
    ['monks', 'Monk Rush', 'Monjes', 'Rush de monjes'],
    ['tower', 'Tower Rush', 'Torres'],
    ['pikes', 'Pike Skirm', 'Pica + honda', 'Picas y honderos'],
    ['elephants', 'Elephant Rush', 'Elefantes', 'Rush de elefantes'],
    ['siege', 'Scorpions & Rams', 'Escorpiones', 'Escorpiones y arietes'],
    ['serjeants', 'Serjeant Rush', 'Serjeants', 'Rush de serjeants'],
    ['scouts-archers', 'Scouts into Archers', 'Scouts + arq.', 'Scouts hacia arqueros'],
    ['drush-archers', 'Drush Archers', 'Drush arq.', 'Drush con arqueros'],
    ['drush-castle', 'Drush FC', 'Drush fast castle', 'Drush → FC'],
    ['swords-scouts', 'M@A Scouts', 'M@A con scouts'],
    ['swords-archers', 'M@A Archers', 'M@A arq.', 'M@A con arqueros'],
    ['drush-swords', 'Drush M@A', 'Drush con M@A'],
    ['hoang', 'Hoang Rush', 'Hoang'],
    ['castle-boom', 'FC Boom', 'Fast castle con boom'],
    ['archive', 'Other', 'Otra', 'Otra apertura', 'Apertura estándar', 'Apertura sin clasificar'],
  ].flatMap(([motif, ...names]) => names.map((name) => [openingArtKey(name), motif])));
  function openingArtClass(name) {
    return name ? ` opening-art opening-art-${OPENING_ART.get(openingArtKey(name)) || 'archive'}` : '';
  }
  const CIV_ALIASES = { inca: 'incas', maya: 'mayans', indians: 'hindustanis', khitansmongols: 'khitans' };
  let civSlugs = null;
  let civAliases = CIV_ALIASES;
  let activeI18n = null;
  const getI18n = () => activeI18n || (typeof root !== 'undefined' && root.AppI18n ? root.AppI18n : null);
  const tr = (key, fallback, vars = null) => {
    const api = getI18n();
    if (!api || !api.t) return fallback;
    const val = api.t(key, vars);
    return val && val !== key ? val : fallback;
  };
  const locCiv = (name) => {
    const api = getI18n();
    return api && api.civName ? api.civName(name) : (name || '');
  };
  const locUnit = (u) => {
    const api = getI18n();
    return api && api.unitName ? api.unitName(u.unitId ?? u.name) : (u.name || '');
  };
  const locBuilding = (w) => {
    const api = getI18n();
    return api && api.buildingName ? api.buildingName(w.typeId ?? w.name) : (w.name || '');
  };
  const locAge = (id, fallback) => {
    const api = getI18n();
    return api && api.ageName && ['dark', 'feudal', 'castle', 'imperial'].includes(id) ? api.ageName(id) : fallback;
  };
  const locMap = (name) => {
    const api = getI18n();
    return api && api.mapName ? api.mapName(name) : (name || '');
  };
  const locOpening = (key, fallback) => {
    const api = getI18n();
    if (!api || !api.openingName) return fallback;
    const translated = api.openingName(key || fallback);
    return translated && translated !== key ? translated : fallback;
  };
  /** El main entrega la misma lista de escudos que usa el roster. */
  function configure(options = {}) {
    if (Array.isArray(options.slugs)) civSlugs = new Set(options.slugs);
    if (Array.isArray(options.civSlugs)) civSlugs = new Set(options.civSlugs);
    if (options.aliases && typeof options.aliases === 'object') civAliases = options.aliases;
    if (options.i18n !== undefined) activeI18n = options.i18n;
  }
  function civSlug(name) {
    const raw = String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]/g, '');
    if (!raw) return null;
    const slug = civAliases[raw] || raw;
    return !civSlugs || civSlugs.has(slug) ? slug : null;
  }
  function civBadge(name) {
    const slug = civSlug(name);
    if (!slug) return '';
    return `<img class="civ-badge" src="assets/civs/${slug}.png" alt="" title="${esc(locCiv(name) || name)}" draggable="false" loading="lazy" />`;
  }
  /** Nombre de civilización con su escudo, sin alterar el flujo del texto. */
  function civLabel(name, fallback = 'Civ sin dato') {
    const value = name ? (locCiv(name) || name) : fallback;
    const badge = civBadge(name);
    return badge
      ? `<span class="intel-civ">${badge}<span>${esc(value)}</span></span>`
      : esc(value);
  }
  function civRelation(player, players = []) {
    if (player && player.isYou) return 'you';
    const own = players.find((item) => item && item.isYou);
    const ownTeam = Number(own && own.team);
    const otherTeam = Number(player && player.team);
    if (!Number.isSafeInteger(ownTeam) || ownTeam <= 0 || !Number.isSafeInteger(otherTeam) || otherTeam <= 0) return 'unknown';
    return ownTeam === otherTeam ? 'ally' : 'opponent';
  }
  const ICONS = {
    compass: 'eye', target: 'eye', map: 'map', history: 'history', trophy: 'trophy', crown: 'crown', objective: 'target',
    sword: 'sword', combat: 'combat', matchup: 'matchup',
    castle: 'castle', resources: 'gold', medal: 'medal', shield: 'shield',
    bow: 'archer', clock: 'clock', chart: 'trend', users: 'players', trend: 'trend',
    villager: 'villager', food: 'food', wood: 'wood', sheep: 'sheep', boar: 'boar',
    berries: 'berries', gold: 'gold', stone: 'stone', building: 'building',
    age: 'age', barracks: 'barracks', stable: 'stable', scout: 'scout',
    archer: 'archer', blacksmith: 'blacksmith', market: 'market', replay: 'replay',
    gunpowder: 'gunpowder', relic: 'relic',
  };
  function icon(name) {
    const asset = ICONS[name];
    return asset ? `<img class="product-icon" src="assets/icons/${asset}.png" alt="" draggable="false">` : '';
  }
  function note(title, message, state = 'empty') { return `<div class="intel-note ${esc(state)}"><span>${icon(state === 'loading' ? 'history' : 'target')}</span><div><b>${esc(title)}</b><p>${esc(message)}</p></div></div>`; }
  function section(title, content, ico = 'map', extra = '') { return `<section class="intel-block ${extra}"><h4>${icon(ico)}${esc(title)}</h4>${content}</section>`; }
  function dataState(report, label) {
    if (!report || report.loading) return note(label, 'Consultando datos…', 'loading');
    if (report.modePending) return note(label, 'Esperando el modo confirmado de la partida.');
    if (report.modeUnavailable) return note(label, 'Esta fuente no ofrece datos de este modo.');
    return '';
  }
  function mapBlock(report, mapName, detail) {
    const pending = dataState(report, 'Perfil del mapa'); if (pending) return pending;
    const m = report.mapStats;
    if (!m || !m.games) return note(mapName || 'Mapa actual', report.error ? 'No se pudo consultar el historial. Se reintentará.' : 'Sin partidas públicas de este mapa en la muestra.');
    const known = m.resultGames == null ? m.games : m.resultGames;
    const wins = m.wins;
    const value = known < 5 ? `${number(wins)}/${number(known)}` : m.winRate == null ? '—' : `${number(m.winRate)}%`;
    const resultLabel = report.mode?.size === 'team' ? 'de su equipo' : 'del rival';
    const choices = m.civSampleGames;
    const civCoverage = Number.isFinite(choices) && choices > 0
      ? `<p class="intel-muted">Civilización identificada en <b>${number(choices)}</b> de ${number(m.sampleGames)} partidas revisadas.</p>`
      : '<p class="intel-muted">Sin elecciones de civ verificadas en la muestra.</p>';
    return section(tr('postmatch.mapRecordIn', `En ${locMap(m.name || mapName) || 'este mapa'}`, { map: locMap(m.name || mapName) || mapName }),
      `<p class="intel-statline"><b>${value}</b> · ${number(wins)} victorias ${resultLabel} en ${number(known)} resultados conocidos${report.partial ? ' · parcial' : ''}</p>` +
      (detail ? civCoverage : ''), 'map');
  }
  function historyBlock(report) {
    const title = tr('postmatch.last5Title', 'Últimas 5 partidas');
    const pending = dataState(report, title); if (pending) return pending;
    const rows = Array.isArray(report.history) ? report.history.slice(0, 5) : [];
    if (!rows.length) return note(title, report.error ? 'El historial no está disponible ahora.' : 'Sin partidas recientes de este modo.');
    const entries = rows.map((row, index) => {
      const outcome = row.won === true ? tr('postmatch.win', 'Victoria') : row.won === false ? tr('postmatch.loss', 'Derrota') : 'Resultado pendiente';
      return `<li class="intel-history-row${index === 0 ? ' recent' : ''}"><strong>${civLabel(row.civ)}</strong><small>${esc(locMap(row.mapName) || 'Mapa sin dato')}</small><b class="result-letter ${row.won === true ? 'win' : row.won === false ? 'loss' : ''}" title="${outcome}" aria-label="${outcome}">${row.won === true ? 'V' : row.won === false ? 'D' : '—'}</b></li>`;
    }).join('');
    return `<section class="intel-block history-block"><div class="intel-history-head"><h4>${icon('history')}${esc(title)}</h4><p class="intel-history-label">${esc(tr('postmatch.moreRecentTop', 'Más reciente arriba · mismo modo'))}</p></div><ol class="intel-history-list">${entries}</ol></section>`;
  }
  function openingBlock(report, currentCiv) {
    const hasCiv = Boolean(civSlug(currentCiv));
    const title = hasCiv ? tr('postmatch.openingsCiv', 'Aperturas de su civilización') : tr('postmatch.openingsHistory', 'Aperturas del historial');
    const pending = dataState(report, title); if (pending) return pending;
    const o = report.openings;
    if (report.openingError || o?.error) return note(title, 'No se pudieron consultar los replays.');
    if (!o || report.pendingOpenings || o.loading || (hasCiv && civSlug(o.openingCiv) !== civSlug(currentCiv))) {
      return note(title, 'Buscando replays en el mapa…', 'loading');
    }
    if (o.modeUnavailable) return note(title, 'No hay análisis de replays para este modo.');
    const pick = hasCiv ? o.mapCivFavorite : o.mapFavorite;
    const n = Number(hasCiv ? o.mapCivAnalyzed : o.mapAnalyzed) || 0;
    if (!pick || !n) return note(title, 'Sin aperturas clasificadas en este mapa.');
    return section(title, `<div class="intel-opening"><b>${esc(locOpening(pick.name, pick.short || pick.name))}</b><span>${esc(tr('postmatch.replaysOf', `${number(pick.count)} de ${number(n)} replays`, { a: number(pick.count), b: number(n) }))}</span></div><p class="intel-muted">${hasCiv ? civLabel(currentCiv) : 'Todas sus civs en este mapa'}${n < 6 ? ' · muestra chica' : ''}</p>`, 'sword', openingArtClass(pick.name || pick.short).trim());
  }
  function h2hBlock(report) {
    const title = tr('prematch.h2hTitle', 'Tu cara a cara');
    const pending = dataState(report, title); if (pending) return pending;
    const h = report.h2h;
    if (report.h2hPending || !h) return note(title, 'Consultando tus enfrentamientos…', 'loading');
    if (h.error) return note(title, 'No se pudo consultar tu historial.');
    if (h.modeUnavailable || h.modePending) return note(title, h.modePending ? 'Esperando el modo confirmado.' : 'Sin historial compatible con este modo.');
    return section(title, `<div class="intel-h2h"><b>${number(h.wins)} <small>V</small> <i>—</i> ${number(h.losses)} <small>D</small></b><p>${h.games ? `${number(h.games)} enfrentamientos confirmados` : `Sin enfrentamientos en ${number(h.scanned || 0)} partidas revisadas`}${h.asAllies ? ` · ${number(h.asAllies)} como aliados` : ''}${h.unresolved ? ` · ${number(h.unresolved)} con equipos sin confirmar` : ''}</p></div>`, 'combat');
  }
  const OPENING_LABELS_ES = {
    'Scout rush': 'Scouts',
    'Archer rush': 'Arqueros',
    'Man at arms rush': 'Hombres de Armas',
    Drush: 'Drush',
    'Drush fast castle': 'Drush → FC',
    'Fast castle': 'Castillos rápido',
  };
  const OPENING_CHECKS = {
    'Scout rush': 'Al explorar, ¿se confirma un establo temprano?',
    'Archer rush': 'Al explorar, ¿se confirma una galería temprana?',
    'Man at arms rush': 'Al explorar, ¿aparecen milicias tempranas?',
    Drush: 'Al explorar, ¿aparecen milicias antes de Feudal?',
  };
  function tacticalChipsBlock(player, report, tip) {
    const cells = [];
    const pred = report?.prediction?.status === 'ready' ? report.prediction
      : tip?.prediction?.status === 'ready' ? tip.prediction : null;
    const pool = pred?.pool;
    if (pool && pool.poolType && pool.poolType !== 'insufficient') {
      const sub = pool.distinctCivs && pool.sampleGames
        ? `${number(pool.distinctCivs)} civs · ${number(pool.sampleGames)} pj`
        : '';
      cells.push(`<div class="intel-kv${pool.poolType === 'specialist' ? ' is-accent' : ''}"><span>Perfil</span><b>${esc(pool.label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`);
    }
    const topPct = Number(player?.ladderPercentile);
    if (Number.isFinite(topPct) && topPct > 0) {
      const label = topPct < 1 ? 'Top 1%' : `Top ${topPct < 10 ? topPct.toFixed(1).replace('.', ',') : Math.round(topPct)}%`;
      const peakDelta = Number.isFinite(Number(player?.peakDelta)) ? Number(player.peakDelta)
        : Number.isFinite(Number(player?.peak)) && Number.isFinite(Number(player?.rating))
          ? Math.round(Number(player.peak) - Number(player.rating)) : null;
      const sub = peakDelta != null && peakDelta >= 120 ? `−${number(peakDelta)} del pico` : 'ladder 1v1';
      cells.push(`<div class="intel-kv"><span>Ladder</span><b>${esc(label)}</b><small>${esc(sub)}</small></div>`);
    } else {
      const peakDelta = Number.isFinite(Number(player?.peakDelta)) ? Number(player.peakDelta)
        : Number.isFinite(Number(player?.peak)) && Number.isFinite(Number(player?.rating))
          ? Math.round(Number(player.peak) - Number(player.rating)) : null;
      if (peakDelta != null && peakDelta >= 120) {
        cells.push(`<div class="intel-kv"><span>Pico</span><b>−${number(peakDelta)}</b><small>debajo del pico</small></div>`);
      }
    }
    const streak = Number(player?.streak);
    if (Number.isFinite(streak) && Math.abs(streak) >= 3) {
      const cls = streak > 0 ? 'win' : 'loss';
      const sub = streak > 0 ? 'victorias seguidas' : 'derrotas seguidas';
      cells.push(`<div class="intel-kv"><span>Racha</span><b class="${cls}">${streak > 0 ? `+${streak}` : streak}</b><small>${sub}</small></div>`);
    }
    const eapm = tip?.eapm;
    if (eapm && Number.isFinite(eapm.value)) {
      const paceText = eapm.pace === 'fast' ? 'Rápido' : eapm.pace === 'deliberate' ? 'Pausado' : 'Estándar';
      const sub = eapm.peerMedian ? `${paceText} · vs ${number(eapm.peerMedian)}` : `${paceText} · ${number(eapm.sample)} pj`;
      cells.push(`<div class="intel-kv${eapm.pace === 'fast' ? ' is-accent' : ''}"><span>Mecánica</span><b>${number(eapm.value)} eAPM</b><small>${esc(sub)}</small></div>`);
    }
    if (!cells.length) return '';
    return `<div class="intel-dossier-strip" aria-label="Perfil táctico del rival">${cells.join('')}</div>`;
  }
  function styleBarMarkup(style) {
    if (!style || !style.analyzed || style.analyzed < 6) return '';
    const agro = Math.max(0, Math.min(100, Math.round((style.aggressive / style.analyzed) * 100)));
    const fc = Math.max(0, Math.min(100 - agro, Math.round((style.boom / style.analyzed) * 100)));
    const hyb = Math.max(0, 100 - agro - fc);
    return `<div class="intel-style-split"><div class="intel-style-labels"><span>Presión temprana <b>${agro}%</b></span><span>Castillos rápido <b>${fc}%</b></span></div><div class="intel-style-track"><i class="seg-agro" data-w="${agro}"></i><i class="seg-hyb" data-w="${hyb}"></i><i class="seg-fc" data-w="${fc}"></i></div></div>`;
  }
  function tacticalBlock(tip, detail, matchup, civ, map) {
    const title = 'Aperturas del historial';
    if (!tip || tip.loading) return note(title, 'Buscando aperturas del rival…', 'loading');
    if (tip.modePending || tip.modeUnavailable) return note(title, tip.modePending ? 'Esperando el modo confirmado.' : 'Este modo todavía no tiene replays compatibles.');
    if (tip.error && !tip.sample) return note(title, 'La fuente de replays no respondió.');
    const c = tip.tacticalPlan?.context || tip.context;
    const current = matchup?.openings?.length > 0;
    const openings = current ? matchup.openings : tip.likelyOpenings || [];
    const opening = openings[0];
    if (!c || !opening?.sample || !opening.games) {
      return note(title, 'Sin aperturas clasificadas en el historial consultado.');
    }
    const read = `<div class="intel-opening-signal"><b>${esc(opening.short || opening.name)}</b><span>${number(opening.games)} de ${number(opening.sample)} replays clasificados</span></div>`;
    const scope = [current ? `${civ} en ${map}` : c.scopeLabel, c.modeLabel,
      current ? (opening.sample < 6 ? 'muestra chica' : null) : 'todas sus civs',
      tip.stale ? 'datos guardados' : tip.provisional ? 'muestra inicial' : null].filter(Boolean).join(' · ');
    const question = (current || (!civ && c.scope === 'map')) && opening.games >= 4 && opening.sample >= 6
      ? OPENING_CHECKS[opening.name] : null;
    const caveat = current ? '' : [civ ? `Sin aperturas de ${civ} en este mapa en la muestra.` : null,
      c.fallbackReason].filter(Boolean).join(' ');
    const alternatives = detail && current && openings.length > 1
      ? `<p class="intel-muted">También registró ${openings.slice(1, 3).map((row) =>
        `${esc(row.short || row.name)} (${number(row.games)}/${number(row.sample)})`).join(' · ')}</p>` : '';
    const split = !current ? styleBarMarkup(tip.style) : '';
    const weakOp = !current && tip.eloWeakness?.openings?.[0];
    const weaknessLine = weakOp
      ? `<p class="intel-weakness"><span>Vulnerabilidad observada</span><b>${esc(OPENING_LABELS_ES[weakOp.name] || weakOp.name)}</b> · ${number(weakOp.losses)}/${number(weakOp.games)} derrotas${weakOp.excessLossPct != null ? ` (+${number(weakOp.excessLossPct)}% sobre ELO)` : ''}</p>`
      : '';
    return section(title, read + `<p class="intel-signal-scope">${esc(scope)}</p>` +
      split + weaknessLine +
      (caveat ? `<p class="intel-muted">${esc(caveat)}</p>` : '') +
      (question ? `<p class="intel-check">${icon('target')}${esc(question)}</p>` : '') + alternatives, 'scout', 'tactical-block' + openingArtClass(opening.name || opening.short));
  }
  function historicalCivBlock(tip, map, report, options = {}) {
    const pred = report?.prediction?.status === 'ready' && report.prediction.top3?.length ? report.prediction
      : options.smartTips && tip?.prediction?.status === 'ready' && tip.prediction.top3?.length ? tip.prediction : null;
    if (pred) {
      const pool = pred.pool || {};
      const isRandom = pool.poolType === 'random';
      const title = isRandom ? 'Perfil de selección' : `Predicción · ${map && map !== '—' ? map : 'el mapa'}`;
      const confLabel = pool.poolType === 'specialist' ? 'Confianza alta'
        : pool.poolType === 'focused' ? 'Pool acotado'
          : isRandom ? 'Jugador Random' : 'Muestra inicial';
      const scopeParts = [
        pool.scope === 'map' && map ? map : 'historial reciente',
        report?.mode?.label || tip?.context?.modeLabel,
        `${number(pool.distinctCivs)} civs en ${number(pool.sampleGames)} pj`,
        report?.partial ? 'en carga' : null,
      ].filter(Boolean).join(' · ');
      const randomBanner = isRandom
        ? `<div class="pred-random-note"><b>No counter-pickees una civ puntual</b><p>Juega variedad alta (${number(pool.distinctCivs)} civs distintas). Elegí tu civ cómoda y enfocate en su patrón de apertura.</p></div>`
        : '';
      const cards = pred.top3.filter((row) => civSlug(row.civ)).slice(0, 3).map((row, idx) => {
        const sub = row.mapGames > 0 && row.mapSample > 0
          ? `${number(row.mapGames)}/${number(row.mapSample)} en mapa`
          : `${number(row.recentGames)} recientes`;
        return `<li class="${idx === 0 && !isRandom ? 'pred-lead' : ''}"><span class="pred-crest">${civBadge(row.civ)}</span>
          <strong>${esc(row.civ)}</strong>
          <b class="pred-pct">${number(row.probability)}%</b>
          <div class="pred-bar"><i data-w="${Math.max(4, Math.min(100, row.probability))}"></i></div>
          <span>${esc(sub)}</span></li>`;
      }).join('');
      const threat = pred.threat?.threat
        ? `<p class="pred-threat">${icon('sword')}<span><b>${esc(pred.top3[0].civ)}</b> — ${esc(pred.threat.threat)}</span></p>`
        : '';
      return `<section class="intel-block civ-picks predicted"><div class="pred-head"><h4>${icon('matchup')}${esc(title)}</h4><span class="pred-conf${pool.poolType === 'specialist' ? ' is-accent' : ''}">${esc(confLabel)}</span></div><p class="civ-picks-scope">${esc(scopeParts)}</p>${randomBanner}<ul class="civ-picks-list">${cards}</ul>${threat}</section>`;
    }
    const title = 'Sus civs más jugadas';
    const stats = report?.mapStats;
    const observed = (stats?.civs || []).filter((row) => civSlug(row.name)).slice(0, 3);
    const count = stats?.civSampleGames ?? stats?.sampleGames;
    const render = (rows, scope) => section(title, `<p class="civ-picks-scope">${esc(scope)}</p>
      <ul class="civ-picks-list">${rows.map((row) => `<li>${civBadge(row.name)}
        <strong>${esc(row.name)}</strong><span>${number(row.games)} de ${number(row.sample)}</span></li>`).join('')}</ul>`,
      'matchup', 'civ-picks');
    if (count > 0 && observed.length) {
      const scope = [map, report.mode?.label, 'partidas con civ conocida', report.partial ? 'muestra en carga' : null]
        .filter(Boolean).join(' · ');
      return render(observed.map((row) => ({ ...row, sample: count })), scope);
    }
    if (!tip || tip.loading) return note(title, 'Consultando elecciones anteriores…', 'loading');
    if (tip.modePending || tip.modeUnavailable || tip.error) return note(title, 'Historial del modo no disponible.');
    const context = tip.context;
    const choices = (Array.isArray(tip.likelyCivs) ? tip.likelyCivs : [])
      .filter((row) => civSlug(row.name)).slice(0, 3);
    if (!context || context.mapName !== map || !choices.length) return note(title, 'Sin muestra de elecciones en este mapa.');
    return render(choices, [map, context.modeLabel, 'replays consultados',
      tip.stale ? 'datos guardados' : tip.provisional ? 'muestra inicial' : null].filter(Boolean).join(' · '));
  }
  function lobbyRecommendBlock(tip, map) {
    const rec = Array.isArray(tip?.recommend) ? tip.recommend.find((entry) => entry && entry.basis === 'combined' && civSlug(entry.civ)) : null;
    if (!rec) return '';
    return `<section class="intel-block lobby-counter"><div class="lobby-counter-row"><span class="lobby-counter-crest">${civBadge(rec.civ)}</span><div class="lobby-counter-copy"><span>Counter-pick sugerido</span><b>${esc(rec.civ)}</b><p>Vos ${number(rec.mine?.winRate)}% (${number(rec.mine?.games)} pj) · Rival pierde ${number(rec.vsRival?.lossRate)}% (${number(rec.vsRival?.games)} pj)${map ? ` en ${esc(map)}` : ''}</p></div></div></section>`;
  }
  function matchupBlock(tip, matchup, ownCiv, rivalCiv, map, report) {
    const title = 'Antecedentes de este cruce';
    if (!civSlug(rivalCiv)) return historicalCivBlock(tip, map, report);
    if (!civSlug(ownCiv)) return note(title, 'Esperando tu civilización.');
    if (!tip || tip.loading) return note(title, 'Buscando el cruce para este mapa…', 'loading');
    if (tip.modePending || tip.modeUnavailable) return note(title, 'Sin historial compatible con el modo.');
    if (tip.error) return note(title, 'La fuente de replays no respondió.');
    if (!matchup) return note(title, 'Esperando datos del cruce actual.', 'loading');
    if (matchup.teamGame) return note(title, 'El resultado de equipo no mide este mano a mano.');
    if (!matchup.games) return note(title, 'Sin resultados para este cruce en el mapa.');
    const against = (matchup.against || []).map((row) => `<p class="intel-muted">Ante ${esc(row.name)} · ${number(row.losses)}/${number(row.games)} derrotas</p>`).join('');
    return section(title, `<p class="intel-matchup">${civLabel(ownCiv)} <span>vs</span> ${civLabel(rivalCiv)}</p>
      <p class="intel-statline"><b>${number(matchup.losses)}/${number(matchup.games)}</b> derrotas del rival en el mapa</p>
      ${matchup.games < 6 ? '<p class="intel-muted">Muestra chica.</p>' : ''}
      ${against}`, 'matchup');
  }
  function renderAutomaticOpportunities(plans = [], { detail = false } = {}) {
    const ready = plans.filter((plan) => plan?.status === 'ready');
    if (!ready.length) return note(tr('tactics.routesEmptyTitle', 'Rutas de partida'), plans.find((plan) => plan?.reason)?.reason || tr('tactics.waitingBoth', 'Esperando ambas civilizaciones y contexto confirmado.'));
    const context = ready[0];
    return `<section class="opportunities automatic"><h4>${icon('target')}${esc(tr('tactics.routesTitle', 'Rutas de referencia frente a'))} ${civLabel(context.rivalCiv)}</h4><p class="opportunity-context">${civLabel(context.ownCiv)} · ${esc(locMap(context.mapName) || context.mapName)}${detail ? ` · ${esc(tr('tactics.sampleResults', `${number(context.contextSample)} resultados de la muestra`, { n: number(context.contextSample) }))}` : ''}</p>${(detail ? ready : ready.slice(0, 1)).map((plan) => {
      const best = plan.candidates[0];
      if (!best) return '';
      const age = locAge(plan.age, { feudal: 'Feudal', castle: 'Castillos', imperial: 'Imperial' }[plan.age]);
      return `<article class="opportunity-card"><header>${icon(best.icon)}<div><small>${esc(tr('tactics.optionOf', `Opción de ${age}`, { age }))}</small><b>${esc(best.label)}</b></div></header><p>${esc(best.condition)}</p>${detail ? `<p>${best.history.games >= 3 ? `${plan.data.teamResults ? 'Su equipo perdió' : 'Perdió'} ${best.history.losses}/${best.history.games} ante esta apertura en el contexto consultado.` : 'Orientación del árbol tecnológico con muestra insuficiente.'}</p>` : ''}</article>`;
    }).join('')}<p class="opportunity-note">${esc(tr('tactics.routesNote', 'Referencia de civilizaciones. El ejército y la edad actuales no están medidos.'))}</p></section>`;
  }
  const RESOURCE_LABELS = { villager: 'Aldeanos', food: 'Comida', sheep: 'Ovejas', boar: 'Jabalí',
    wood: 'Madera', berries: 'Bayas', gold: 'Oro', stone: 'Piedra', building: 'Edificios',
    age: 'Avance de edad', barracks: 'Cuartel', stable: 'Establo', scout: 'Scouts', sword: 'Infantería',
    archer: 'Arqueros', blacksmith: 'Herrería', castle: 'Castillos', market: 'Mercado',
    gunpowder: 'Pólvora', shield: 'Defensa' };
  function buildGuide(guide) {
    return `<ol class="build-checkpoints">${(guide.checkpoints || []).map((point, i) => `<li><span class="build-index">${i + 1}</span><div class="build-icons">${(point.icons || []).map((key) => `<span class="build-resource ${esc(key)}" title="${esc(RESOURCE_LABELS[key] || key)}">${icon(key)}<small>${esc(RESOURCE_LABELS[key] || key)}</small></span>`).join('')}</div><p>${esc(point.text)}</p></li>`).join('')}</ol>`;
  }
  function renderSmartBuildOrder(payload, { library = false } = {}) {
    if (!payload) return '';
    if (payload.status === 'locked') return note('Smart Build Order', payload.message);
    const guide = payload.selected;
    const selected = guide ? `<section class="smart-build"><header>${icon(guide.icon)}<div><span>${esc(tr('tactics.suggestedPlan', 'PLAN SUGERIDO'))} · ${civLabel(payload.ownCiv)}</span><h3>${esc(guide.label)}</h3></div><b>Smart Build Order</b></header><p class="build-reference">${esc(payload.referenceLabel)}</p>${buildGuide(guide)}<p class="build-condition">${esc(guide.condition)}</p>${library ? `<p class="build-reference">${(payload.reasons || []).map(esc).join(' ')} ${(guide.caveats || []).map(esc).join(' ')}</p>` : ''}</section>`
      : note('Smart Build Order', payload.reasons?.[0] || tr('tactics.waitingCivContext', 'Esperando una civilización y un contexto compatibles.'));
    const references = library ? `<div class="build-library"><h3>${esc(tr('tactics.libraryTitle', 'Cinco rutas de referencia'))}</h3><p class="mini">${esc(tr('tactics.librarySub', 'Se elige una sugerencia automáticamente. Estas fichas explican las rutas; no miden tu progreso en la partida.'))}</p>${(payload.guides || []).map((item) => `<details><summary>${icon(item.icon)}${esc(item.label)}${item.available ? '' : `<small>${esc(tr('tactics.unavailableVariant', 'Variante sin validar para tu civ'))}</small>`}</summary>${!item.available ? `<p class="build-condition">${esc(item.unavailableReason)}</p>` : ''}${buildGuide(item)}<p class="build-condition">${esc(item.condition)}</p></details>`).join('')}</div>` : '';
    return selected + references;
  }
  function renderRival({ entry, state, options = {}, detail = true } = {}) {
    const { name, player, report, tip } = entry;
    const map = state && state.match && state.match.mapName;
    const r = report || null;
    const inLobby = state?.phase === 'lobby';
    const civ = inLobby ? null : player ? player.civ : r?.civ;
    const ownCiv = state?.players?.find((p) => p.isYou)?.civ;
    const knownCiv = civSlug(civ) ? civ : null;
    const mode = state?.ladder?.id ?? state?.match?.leaderboardId ?? tip?.mode?.id;
    const mapKey = (name) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const raw = tip?.matchup;
    const matchup = raw && raw.rival === civSlug(knownCiv) && raw.own === civSlug(ownCiv) &&
      raw.map === mapKey(map) && (mode == null || String(raw.modeId) === String(mode)) ? raw : null;
    const content = [];
    if (options.rosterDetails !== false) {
      const chips = tacticalChipsBlock(player, r, tip);
      if (chips) content.push(chips);
    }
    const showPicks = !knownCiv && (options.civRecommender || options.rivalFavorites);
    if (showPicks) content.push(historicalCivBlock(tip, map, r, options));
    if (!knownCiv && options.civRecommender) {
      const counter = lobbyRecommendBlock(tip, map);
      if (counter) content.push(counter);
    }
    if (options.smartTips) content.push(tacticalBlock(tip, detail, matchup, knownCiv, map));
    const hasOpeningSignal = matchup?.openingsSample || (!knownCiv && tip?.likelyOpenings?.[0]?.sample > 0);
    if (options.rivalOpenings && !(options.smartTips && hasOpeningSignal)) content.push(openingBlock(r, knownCiv));
    if (options.rivalCivs) content.push(historyBlock(r));
    if (options.civRecommender && knownCiv) content.push(matchupBlock(tip, matchup, ownCiv, knownCiv, map, r));
    if (options.rivalFavorites) content.push(mapBlock(r, map, detail && !showPicks));
    if (options.rivalH2H) content.push(h2hBlock(r));
    const compactIdentity = options.rosterDetails !== false && state?.players?.length === 2 &&
      Number.isFinite(Number(player?.profileId)) && state.players.some((row) => row.profileId === player.profileId);
    return `<article class="intel-rival">${compactIdentity ? '' : `<header class="intel-identity"><div><h3>${esc(name)}</h3></div>${options.rosterDetails === false ? '' : `<p>${civLabel(civ, 'Civilización sin confirmar')}</p>`}</header>`}<div class="intel-rival-content">${content.join('')}</div><footer class="intel-source">${options.rosterDetails === false ? 'Historial entre ambos' : `Historial: Companion · Replays: AoE2Insights${r && r.partial ? ' · muestra parcial' : ''}`}</footer></article>`;
  }
  function clock(seconds) { return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '—'; }
  function combatBlock(combat) {
    if (!combat || !['ready', 'partial'].includes(combat.status)) return '';
    const count = (stage, key) => stage.status === 'complete' ? number(stage[key])
      : stage[key] > 0 ? `≥${number(stage[key])}` : '—';
    const stages = (combat.stages || []).map((stage) => `<tr><th scope="row">${esc(stage.label)}<small>${clock(stage.startSeconds)}–${clock(stage.endSeconds)}${stage.status === 'partial' ? ' · parcial' : ''}</small></th><td>${count(stage, 'villagersKilled')}</td><td>${count(stage, 'villagersLost')}</td><td>${count(stage, 'militaryKilled')}</td><td>${count(stage, 'militaryLost')}</td></tr>`).join('');
    const highlights = (combat.highlights || []).slice(0, 3).map((item) => `<article class="review-highlight">${icon('medal')}<div><b>${esc(item.title)}</b><p>${esc(item.detail)}</p></div></article>`).join('');
    const totals = combat.totals || {};
    const trade = totals.valueDestroyed != null && totals.valueLost != null
      ? `<div class="review-trade">${icon('resources')}<p><b>${number(totals.valueDestroyed)} destruidos <span>/ ${number(totals.valueLost)} perdidos</span></b><small>Valor nominal de reemplazo en combate enemigo · comida + madera + oro + piedra</small></p></div>` : '';
    return (highlights ? `<section class="review-highlights" aria-label="Momentos destacados">${highlights}</section>` : '') +
      `<section class="review-combat"><h3>${icon('combat')}Combate por edad</h3><p>Durante tus edades · eliminaciones enemigas atribuidas y pérdidas propias</p><table><caption class="sr-only">Bajas de aldeanos y militares según la edad del jugador</caption><thead><tr><th rowspan="2" scope="col">Edad</th><th colspan="2" scope="colgroup">Aldeanos</th><th colspan="2" scope="colgroup">Militares</th></tr><tr><th scope="col">Eliminados</th><th scope="col">Perdidos</th><th scope="col">Eliminados</th><th scope="col">Perdidos</th></tr></thead><tbody>${stages}</tbody></table>${trade}<p class="review-combat-note">Las pérdidas incluyen borrado propio y causas sin autor. Pesqueros, comercio y otras categorías se conservan aparte.${combat.status === 'partial' ? ' ≥ indica un mínimo observado; — indica cobertura incompleta.' : ''}${totals.unattributedDeaths ? ` ${number(totals.unattributedDeaths)} pérdidas sin autor identificado.` : ''}${totals.unclassifiedDeaths ? ` ${number(totals.unclassifiedDeaths)} bajas sin categoría; no se calcula valor ni logros afectados.` : ''}</p></section>`;
  }
  function executionBlock(ratings, comparison) {
    if (!ratings) return '';
    const economic = ratings.economic || {};
    const cards = [economic, ratings.micro, ratings.decisions].filter((rating) => rating?.grade).map((rating) =>
      `<article class="review-skill ${rating.grade ? 'graded' : ''}"><span>${icon(rating.id === 'economic' ? 'villager' : rating.id === 'micro' ? 'sword' : 'compass')}</span><div><small>${esc(rating.label)}</small><b>${esc(rating.grade || '—')}</b><p>${rating.grade ? esc(rating.scopeLabel) : 'Sin evaluación disponible'}</p></div></article>`).join('');
    const highlights = comparison && (ratings.personalHighlights || []).length
      ? `<div class="review-personal-highlights">${ratings.personalHighlights.map((item) => `<p>${icon('trend')}<span><b>${esc(item.title)}</b>${esc(item.detail)}</span></p>`).join('')}</div>` : '';
    if (!cards && !highlights) return '';
    return `<section class="review-execution"><h3>${icon('medal')}Tu ejecución</h3><div class="review-skills">${cards}</div><p class="review-execution-note">${esc(economic.detail)}${economic.grade ? ` Escala personal S–D · ${number(economic.minimumStageSampleSize)} referencias mínimas por etapa.` : ''}</p>${highlights}</section>`;
  }
  function matchHistoryContext(benchmark) {
    if (!benchmark.games || !['limited', 'ready', 'partial'].includes(benchmark.status)) return '';
    const partial = benchmark.status === 'partial' ? ' · parcial' : '';
    return `<p class="review-map-record">Historial consultado en este mapa · ${number(benchmark.wins)} V · ${number(benchmark.losses)} D · mismo modo${partial}</p>`;
  }
  function measuredAges(metrics) {
    const labels = { feudalSeconds: 'Feudal', castleSeconds: 'Castillos', imperialSeconds: 'Imperial' };
    const entries = Object.entries(labels).filter(([key]) =>
      metrics[key]?.definition === 'age-reached-game-seconds-v1' && Number.isFinite(metrics[key].value));
    if (!entries.length) return '';
    return `<section class="review-arrivals"><h3>${icon('clock')}Llegadas a cada edad</h3><dl>${entries.map(([key, label]) =>
      `<div><dt>${label}</dt><dd>${clock(metrics[key].value)}</dd></div>`).join('')}</dl></section>`;
  }
  function compactCombat(combat) {
    if (!combat || !['ready', 'partial'].includes(combat.status)) return '';
    const stages = (combat.stages || []).filter((stage) => stage.status === 'complete' &&
      ['feudal', 'castle'].includes(stage.age) && !stage.unclassifiedDeaths);
    if (!stages.length) return '';
    const rows = stages.map((stage) => `<div class="review-impact-row"><div><b>${esc(stage.label)}</b><small>${clock(stage.startSeconds)}–${clock(stage.endSeconds)}</small></div>
      <div><b>${number(stage.villagersKilled)} <span>/</span> ${number(stage.villagersLost)}</b><small>Aldeanos</small></div>
      <div><b>${number(stage.militaryKilled)} <span>/</span> ${number(stage.militaryLost)}</b><small>Militares</small></div></div>`).join('');
    return `<section class="review-impact"><h3>${icon('combat')}Intercambio por edad</h3><p>Eliminaciones enemigas / pérdidas propias · tramos con cobertura validada</p>${rows}</section>`;
  }
  function compactExecution(ratings) {
    const stages = (ratings?.economic?.stages || []).filter((stage) => stage.grade);
    if (!stages.length) return '';
    const grades = stages.map((stage) => `<div><strong>${esc(stage.grade)}</strong><span>${esc(stage.label)}</span><small>${number(stage.sampleSize)} comparables</small></div>`).join('');
    const highlight = ratings.personalHighlights?.[0];
    return `<section class="review-impact"><h3>${icon('medal')}Tu ejecución económica</h3><p>Frente a tus propias partidas comparables.</p>
      <div class="review-personal-grades">${grades}</div>
      ${highlight ? `<p><b>${esc(highlight.title)}</b> · ${esc(highlight.detail)}</p>` : ''}</section>`;
  }
  function replayEpisode(window, map) {
    if (!window?.self || !window?.rival || !Number.isFinite(window.cutoffMs)) return '';
    const column = (label, side) => {
      const orders = (side.military || []).map((line) => `${number(line.count)}&nbsp;${esc(line.label)}`);
      return `<div><span>${esc(label)} · ${civLabel(side.civ)}</span><b>${orders.join(' · ') || 'Sin encargos militares registrados'}</b><small>${number(side.villagers)} aldeanos encargados</small></div>`;
    };
    const arena = String(map).trim().toLowerCase() === 'arena';
    const title = arena ? 'Preparación antes de Castillos' : 'Revisá el cierre de Feudal';
    return `<section class="review-episode"><h3>${icon('combat')}${title}</h3>
      <p>Pedidos registrados hasta ${clock(window.cutoffMs / 1000)}</p>
      <div class="review-episode-sides">${column('Vos', window.self)}${column('Rival', window.rival)}</div>
      <p>${arena ? 'En el replay, revisá qué inversión se concretó después y qué economía pudo sostenerla.' : 'En el replay, revisá qué ejército llegó a presionar y qué pudo seguir produciendo cada jugador.'}</p>
    </section>`;
  }
  function sparklineSvg(series, invert = false, tone = 'neutral') {
    const vals = (Array.isArray(series) ? series : []).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return '';
    const w = 112, h = 28, pad = 4;
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const norm = (v - min) / span;
      const y = pad + (invert ? norm : 1 - norm) * (h - pad * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    const last = pts[pts.length - 1];
    const poly = pts.map(([x, y]) => `${x},${y}`).join(' ');
    const area = `${poly} ${last[0]},${h - 2} ${pts[0][0]},${h - 2}`;
    return `<svg class="pm-spark is-${tone}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polygon points="${area}" /><polyline points="${poly}" /><circle cx="${last[0]}" cy="${last[1]}" r="3.2" /></svg>`;
  }
  function productionCurveSvg(timeline, rivalName) {
    const list = Array.isArray(timeline) ? timeline : [];
    if (list.length < 3) return '';
    const w = 340, h = 112, padL = 6, padR = 8, padT = 10, padB = 18;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const selfTot = list.map((b) => (b.selfVillagers || 0) + (b.selfMilitary || 0));
    const rivalTot = list.map((b) => (b.rivalVillagers != null ? (b.rivalVillagers || 0) + (b.rivalMilitary || 0) : null));
    const maxVal = Math.max(10, ...selfTot, ...rivalTot.filter((v) => v != null));
    const toPts = (arr) => arr.map((v, i) => {
      if (v == null) return null;
      const x = padL + ((i + 1) / arr.length) * innerW;
      const y = padT + (1 - v / maxVal) * innerH;
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    }).filter(Boolean);
    const sPts = [[padL, padT + innerH], ...toPts(selfTot)];
    const rPts = rivalTot.every((v) => v != null) ? [[padL, padT + innerH], ...toPts(rivalTot)] : [];
    const sLine = sPts.map(([x, y]) => `${x},${y}`).join(' ');
    const sArea = `${sLine} ${sPts[sPts.length - 1][0]},${padT + innerH} ${padL},${padT + innerH}`;
    const rLine = rPts.map(([x, y]) => `${x},${y}`).join(' ');
    const sLast = sPts[sPts.length - 1];
    const rLast = rPts.length ? rPts[rPts.length - 1] : null;
    const endClock = clock(list[list.length - 1].seconds);
    const midClock = clock(list[Math.floor((list.length - 1) / 2)].seconds);
    return `<div class="pm-curve-wrap">
      <div class="pm-curve-head">
        <span>${esc(tr('postmatch.curveTitle', 'Ritmo acumulado (Aldeanos + Ejército)'))}</span>
        <div class="pm-legend"><i class="leg-self"></i>${esc(tr('postmatch.you', 'Vos'))}${rPts.length ? `<i class="leg-rival"></i>${esc(rivalName || tr('postmatch.rival', 'Rival'))}` : ''}</div>
      </div>
      <svg class="pm-curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva de producción acumulada">
        <line class="pm-grid" x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" />
        <line class="pm-grid" x1="${padL}" y1="${padT + innerH / 2}" x2="${w - padR}" y2="${padT + innerH / 2}" />
        <polygon class="pm-area-self" points="${sArea}" />
        ${rLine ? `<polyline class="pm-line-rival" points="${rLine}" />` : ''}
        <polyline class="pm-line-self" points="${sLine}" />
        ${rLast ? `<circle class="pm-dot-rival" cx="${rLast[0]}" cy="${rLast[1]}" r="2.8" />` : ''}
        <circle class="pm-dot-self" cx="${sLast[0]}" cy="${sLast[1]}" r="3.4" />
        <text class="pm-axis" x="${padL}" y="${h - 3}">0:00</text>
        <text class="pm-axis mid" x="${w / 2}" y="${h - 3}">${midClock}</text>
        <text class="pm-axis end" x="${w - padR}" y="${h - 3}">${endClock}</text>
      </svg>
    </div>`;
  }
  function dec(n, digits = 1) {
    if (!Number.isFinite(n)) return '—';
    const fixed = Number(n).toFixed(digits);
    return fixed.replace(/\.0+$/, '').replace('.', ',');
  }
  function fmtIdle(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const s = Math.max(0, Math.round(seconds));
    if (s < 120) return `${number(s)} s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${String(r).padStart(2, '0')}s`;
  }
  function fmtDelta(item, suffix = '', invertGood = false) {
    if (!item || item.delta == null) return `<span class="pm-delta muted">${esc(tr('postmatch.initialBase', 'Base inicial'))}</span>`;
    const d = item.delta;
    if (d === 0) return `<span class="pm-delta muted">${esc(tr('postmatch.eqAvg', '= Media'))}</span>`;
    const sign = d > 0 ? '+' : '−';
    const abs = Math.abs(d);
    const val = suffix === ' s' ? fmtIdle(abs)
      : suffix === '/m' && abs < 1 ? `${dec(abs, 2)}${suffix}`
        : `${abs < 10 ? dec(abs, 1) : number(Math.round(abs * 10) / 10)}${suffix}`;
    const good = invertGood ? d < 0 : d > 0;
    const arrow = good ? '▲' : '▼';
    const tag = item.isBest ? ` ${tr('postmatch.recordTag', '★ RÉCORD')}` : '';
    return `<span class="pm-delta ${good ? 'win' : 'loss'}${item.isBest ? ' is-record' : ''}">${arrow} ${sign}${val}${tag}</span>`;
  }
  const REPORT_ICON_ALIASES = { opening: 'history', dark: 'building', feudal: 'barracks', imperial: 'crown', target: 'objective' };
  function reportIcon(name) {
    return icon(REPORT_ICON_ALIASES[name] || name) || icon('medal');
  }
  function renderEnginePostMatch(report, access) {
    const c = report.context || {}, result = report.result || {}, eng = report.engine || {};
    const self = eng.self || {}, rival = eng.rival || null;
    const compareOn = access.comparison !== false;
    const modePref = ['both', 'personal', 'community'].includes(access.compareMode) ? access.compareMode : 'both';
    const showPersonal = compareOn && (modePref === 'both' || modePref === 'personal');
    const showCommunity = !compareOn || modePref === 'both' || modePref === 'community';
    const evo = showPersonal ? eng.evolution : null;
    const em = evo?.metrics || {};
    const mode = c.mode?.label;
    const dur = result.durationSeconds ? clock(result.durationSeconds) : '';
    const rivalLabel = eng.rivalName || 'Rival';
    const vsCivs = eng.rivalCiv ? `${civLabel(c.civ)} <span class="pm-vs">vs</span> ${civLabel(eng.rivalCiv)}` : civLabel(c.civ);
    const ratingChip = result.ratingDiff == null ? ''
      : `<strong class="review-result ${result.status === 'won' ? 'win' : result.status === 'lost' ? 'loss' : ''}">${result.ratingDiff >= 0 ? '+' : ''}${result.ratingDiff}<small>ELO</small></strong>`;
    const modePill = compareOn
      ? `<span class="pm-mode-tag">${esc(modePref === 'personal' ? tr('postmatch.modePersonal', 'Solo tu historial') : modePref === 'community' ? tr('postmatch.modeCommunity', 'Estándar por ELO') : tr('postmatch.modeBoth', 'Personal + Estándar ELO'))}</span>`
      : '';
    const outcomeText = result.status === 'won'
      ? tr('postmatch.win', result.label || 'Victoria')
      : result.status === 'lost'
        ? tr('postmatch.loss', result.label || 'Derrota')
        : tr('postmatch.match', result.label || 'Partida');
    const header = `<header class="pm-head">
      <div class="pm-head-main">
        <div class="pm-title-row"><h2>${esc(outcomeText)}</h2>${dur ? `<span class="pm-dur">${esc(dur)}</span>` : ''}${modePill}</div>
        <p class="pm-sub">${esc(locMap(c.mapName) || c.mapName)}${mode ? ` · ${esc(mode)}` : ''} · ${vsCivs}</p>
      </div>
      ${ratingChip}
    </header>`;

    const heroLine = evo?.headline?.text || null;
    const chal = showPersonal ? evo?.sessionChallenge : null;
    // Banner protagonista de celebración arriba (Reto cumplido / Récord personal)
    const trophyBanner = (chal && chal.status === 'completed')
      ? `<section class="pm-trophy-banner is-win" aria-label="Reto cumplido">
          <span class="pm-icon-tile is-emerald">${reportIcon('trophy')}</span>
          <div class="pm-trophy-copy">
            <span class="pm-trophy-pill">${esc(tr('postmatch.challengeDone', '★ RETO CUMPLIDO'))}</span>
            <b>${esc(chal.detail)}</b>
          </div>
          <span class="pm-trophy-tag">${esc(tr('postmatch.improveTag', '▲ MEJORA'))}</span>
        </section>`
      : heroLine
        ? `<section class="pm-trophy-banner is-record" aria-label="Récord personal">
            <span class="pm-icon-tile is-gold">${reportIcon('trophy')}</span>
            <div class="pm-trophy-copy">
              <span class="pm-trophy-pill">${esc(tr('postmatch.personalBest', '★ DESTACADO PERSONAL'))}</span>
              <b>${esc(heroLine)}</b>
            </div>
          </section>`
        : (chal && chal.status === 'pending')
          ? `<section class="pm-trophy-banner is-pending" aria-label="Reto activo">
              <span class="pm-icon-tile is-gold">${reportIcon('target')}</span>
              <div class="pm-trophy-copy">
                <span class="pm-trophy-pill">${esc(tr('postmatch.challengeActive', 'RETO EN CURSO'))}</span>
                <b>${esc(chal.detail)}</b>
              </div>
            </section>`
          : '';
    const focusShort = eng.focus
      ? `<div class="pm-focus"><span class="pm-icon-tile is-gold sm">${reportIcon('target')}</span><div><span>${esc(tr('postmatch.nextFocus', 'Foco próxima partida'))}</span><b>${esc(eng.focus.title)}</b><p>${esc(eng.focus.detail)}</p></div></div>` : '';

    // 1. Spotlight horizontal de Apertura detectada + nota S–D + consejo concreto
    const stageDeltas = evo?.stageDeltas || {};
    const op = eng.openingSummary || null;
    const opDelta = showPersonal && stageDeltas.opening && stageDeltas.opening.deltaScore !== 0
      ? `<span class="pm-st-delta ${stageDeltas.opening.deltaScore > 0 ? 'win' : 'loss'}">${stageDeltas.opening.deltaScore > 0 ? '▲ +' : '▼ −'}${Math.abs(stageDeltas.opening.deltaScore)} ${esc(tr('postmatch.vsAvg', 'vs media'))}</span>`
      : '';
    const openingBar = op ? `<section class="pm-opening-bar${showCommunity && op.grade === 'S' ? ' grade-S' : ''}${openingArtClass(op.key || op.name)}" aria-label="Apertura detectada">
      <span class="pm-icon-tile is-gold">${reportIcon('opening')}</span>
      <div class="pm-opening-copy">
        <div class="pm-opening-top"><span>${esc(tr('postmatch.openingDetected', 'Apertura detectada'))}</span><b>${esc(locOpening(op.key, op.name))}</b>${opDelta}</div>
        <p>${esc(op.tip || '')}</p>
      </div>
      ${showCommunity && op.grade ? `<strong class="pm-grade-stamp grade-${op.grade}">${esc(op.grade)}</strong>` : ''}
    </section>` : '';

    // 2. Tira de 4 Edades explícitas: Alta Edad · Feudal · Castillos · Imperial
    const STAGE_TONE = { S: 'is-gold', A: 'is-emerald', B: 'is-sky', C: 'is-amber', D: 'is-rose' };
    const stageStrip = (eng.stages || []).length
      ? `<section class="pm-stages-v2" aria-label="Calificación por edad">${eng.stages.map((s) => {
        const ready = s.status === 'ready' && s.grade;
        const sd = showPersonal ? stageDeltas[s.id] : null;
        const deltaChip = ready && sd && sd.deltaScore !== 0
          ? `<span class="pm-st-delta ${sd.deltaScore > 0 ? 'win' : 'loss'}">${sd.deltaScore > 0 ? '▲ +' : '▼ −'}${Math.abs(sd.deltaScore)}</span>`
          : '';
        const stampHtml = showCommunity
          ? `<strong class="pm-grade-stamp${ready ? ` grade-${s.grade}` : ''}">${ready ? esc(s.grade) : '—'}</strong>`
          : (ready && sd ? `<strong class="pm-grade-stamp">${sd.betterThanPct}%</strong>` : '<strong class="pm-grade-stamp">—</strong>');
        const tileTone = ready && showCommunity ? (STAGE_TONE[s.grade] || 'is-slate') : 'is-slate';
        return `<article class="pm-stage-card${ready ? ` is-ready${showCommunity ? ` grade-${s.grade}` : ''}` : ' is-dim'}">
          <div class="pm-stage-top">
            <span class="pm-icon-tile ${tileTone} sm">${reportIcon(s.id)}</span>
            <div class="pm-stage-head">
              <span class="pm-stage-lbl">${esc(locAge(s.id, s.label))}</span>
              ${s.subtitle ? `<b class="pm-stage-sub">${esc(s.subtitle)}</b>` : ''}
            </div>
            ${stampHtml}
          </div>
          <div class="pm-stage-meta"><span>${esc(s.metric || '—')}</span>${deltaChip}</div>
          ${s.tip ? `<p class="pm-stage-tip">${esc(s.tip)}</p>` : ''}
        </article>`;
      }).join('')}</section>` : '';

    const badges = (eng.highlights || []).slice(0, 3).map((h) => {
      const warn = h.tone === 'warn';
      return `<div class="pm-badge ${warn ? 'is-warn' : 'is-good'}"><span class="pm-icon-tile ${warn ? 'is-rose' : 'is-gold'} sm">${reportIcon(h.icon || 'medal')}</span><div><span class="pm-badge-tag">${esc(warn ? tr('postmatch.fixTag', '▼ A CORREGIR') : tr('postmatch.achieveTag', '★ LOGRO'))}</span><b>${esc(h.title)}</b><small>${esc(h.detail)}</small></div></div>`;
    }).join('');

    const evoTitle = !showPersonal
      ? tr('postmatch.evolutionBenchmark', 'Métricas de esta partida')
      : evo?.sampleSize > 0
        ? tr('postmatch.evolutionTitle', `Tu evolución · vs tus últimas ${number(evo.sampleSize)} partidas`, { n: number(evo.sampleSize) })
        : tr('postmatch.evolutionFirst', 'Tu rendimiento · primera referencia local');
    const evoCard = (item, mainVal, suffix, invert = false, customNote = null) => {
      const tone = !showPersonal || !item || item.delta == null || item.delta === 0
        ? 'neutral'
        : ((invert ? item.delta < 0 : item.delta > 0) ? 'win' : 'loss');
      const spark = showPersonal ? sparklineSvg(item?.series, invert, tone) : '';
      const deltaBadge = showPersonal ? fmtDelta(item, suffix, invert) : '';
      const note = customNote != null
        ? `<small>${esc(customNote)}</small>`
        : !showPersonal
          ? ''
          : item?.sampleSize >= 2 && item.betterThanPct != null
            ? `<small>${esc(tr('postmatch.betterThan', `Mejor que el ${item.betterThanPct}% de tus ${item.sampleSize} previas`, { pct: item.betterThanPct, n: item.sampleSize }))}</small>`
            : `<small>${item?.median != null ? esc(tr('postmatch.yourAvg', `Tu media: ${suffix === ' s' ? fmtIdle(item.median) : `${dec(item.median, suffix === '/m' ? 2 : 1)}${suffix}`}`, { val: suffix === ' s' ? fmtIdle(item.median) : `${dec(item.median, suffix === '/m' ? 2 : 1)}${suffix}` })) : esc(tr('postmatch.savingBase', 'Guardando base personal'))}</small>`;
      return `<article class="pm-kpi is-${tone}${showPersonal && item?.isBest ? ' is-best' : ''}">
        <div class="pm-kpi-top"><span>${esc(item?.label || '')}</span>${deltaBadge}</div>
        <div class="pm-kpi-mid"><b>${mainVal}</b>${spark}</div>
        ${note}
      </article>`;
    };

    const earlyUtil = self.tcUtilizationEarly ?? self.tcUtilization;
    const earlyIdle = self.tcIdleEarlySeconds ?? self.tcIdleSeconds;
    const totalIdle = self.tcIdleTotalSeconds ?? self.tcIdleSeconds;
    const feudPerTc = self.tcIdleFeudalPerTcSeconds ?? self.tcIdleFeudalSeconds;
    const utilBreakdown = [
      self.tcUtilizationDark != null ? `${locAge('dark', 'Alta')} ${dec(self.tcUtilizationDark, 1)}%` : null,
      self.tcUtilizationFeudal != null ? `${locAge('feudal', 'Feudal')} ${dec(self.tcUtilizationFeudal, 1)}%` : null,
    ].filter(Boolean).join(' · ') || null;
    const idleBreakdown = [
      self.tcIdleDarkSeconds != null ? `${locAge('dark', 'Alta')} ${fmtIdle(self.tcIdleDarkSeconds)}` : null,
      feudPerTc != null ? `${locAge('feudal', 'Feudal')} ${fmtIdle(feudPerTc)}${(self.feudalActiveTcs || 1) > 1 ? '/TC' : ''}` : null,
      totalIdle != null ? `Total ${fmtIdle(totalIdle)}` : null,
    ].filter(Boolean).join(' · ') || null;

    const evoGrid = `<div class="pm-kpi-grid">
      ${evoCard({ ...(em.tcUtilization || {}), label: tr('postmatch.tcUsage', 'Uso de TC') }, earlyUtil != null ? `${dec(earlyUtil, 1)}%` : '—', ' pts', false, utilBreakdown)}
      ${evoCard({ ...(em.tcIdleSeconds || {}), label: tr('postmatch.tcIdle', 'Idle de TC') }, fmtIdle(self.tcIdleDarkSeconds != null && feudPerTc != null ? (self.tcIdleDarkSeconds + feudPerTc) : earlyIdle), ' s', true, idleBreakdown)}
      ${evoCard({ ...(em.villagersPerMin || {}), label: tr('postmatch.vilsPerMin', 'Aldeanos / min') }, em.villagersPerMin ? dec(em.villagersPerMin.current, 2) : number(self.villagersOrdered), '/m')}
      ${evoCard({ ...(em.eapm || {}), label: tr('postmatch.eapm', 'Ritmo eAPM') }, self.eapm != null ? dec(self.eapm, 1) : '—', '')}
    </div>`;

    // 3. Duelo cara a cara con escudos de civilización a izquierda (Vos) y derecha (Rival) + barras espejadas
    const selfCrest = civBadge(c.civ);
    const rivalCrest = civBadge(eng.rivalCiv);
    const duelFaceHead = `<div class="pm-duel-face">
      <div class="pm-side is-self">${selfCrest}<div><b>${esc(tr('postmatch.you', 'Vos'))}</b><small>${esc(locCiv(c.civ) || c.civ || '')}</small></div></div>
      <span class="pm-vs-pill">VS</span>
      <div class="pm-side is-rival"><div><b>${esc(rivalLabel)}</b><small>${esc(locCiv(eng.rivalCiv) || eng.rivalCiv || '')}</small></div>${rivalCrest}</div>
    </div>`;
    const duelRow = (label, aVal, bVal, aTxt, bTxt, lowerWins = false) => {
      const max = Math.max(1, Number(aVal) || 0, Number(bVal) || 0);
      const aW = Math.max(6, Math.min(100, Math.round(((Number(aVal) || 0) / max) * 100)));
      const bW = Math.max(6, Math.min(100, Math.round(((Number(bVal) || 0) / max) * 100)));
      const aLead = bVal != null && (lowerWins ? aVal < bVal : aVal > bVal);
      const bLead = bVal != null && (lowerWins ? bVal < aVal : bVal > aVal);
      return `<div class="pm-duel-split">
        <div class="pm-duel-nums">
          <b class="${aLead ? 'is-accent' : ''}">${aTxt}</b>
          <span>${esc(label)}</span>
          <b class="is-r${bLead ? ' is-lead' : ''}">${bVal != null ? bTxt : '—'}</b>
        </div>
        <div class="pm-split-bars">
          <div class="pm-half left"><i class="bar-self" data-w="${aW}"></i></div>
          <div class="pm-half right">${bVal != null ? `<i class="bar-rival" data-w="${bW}"></i>` : ''}</div>
        </div>
      </div>`;
    };
    const selfEarlyDisplay = self.tcIdleDarkSeconds != null && feudPerTc != null ? (self.tcIdleDarkSeconds + feudPerTc) : earlyIdle;
    const rivalFeudPerTc = rival ? (rival.tcIdleFeudalPerTcSeconds ?? rival.tcIdleFeudalSeconds) : null;
    const rivalEarlyDisplay = rival
      ? (rival.tcIdleDarkSeconds != null && rivalFeudPerTc != null ? (rival.tcIdleDarkSeconds + rivalFeudPerTc) : (rival.tcIdleEarlySeconds ?? rival.tcIdleSeconds))
      : null;
    const rivalTotalIdle = rival ? (rival.tcIdleTotalSeconds ?? rival.tcIdleSeconds) : null;
    const duelBlock = `<div class="pm-duel">
      ${duelFaceHead}
      ${duelRow(tr('postmatch.duelVils', 'Aldeanos'), self.villagersOrdered, rival?.villagersOrdered, `${number(self.villagersOrdered)} · ${self.townCenters} TC`, rival ? `${number(rival.villagersOrdered)} · ${rival.townCenters} TC` : '')}
      ${selfEarlyDisplay != null ? duelRow(tr('postmatch.duelIdleEarly', 'Idle TC · Alta + Feudal'), selfEarlyDisplay, rivalEarlyDisplay, fmtIdle(selfEarlyDisplay), rivalEarlyDisplay != null ? fmtIdle(rivalEarlyDisplay) : '', true) : ''}
      ${totalIdle != null ? duelRow(tr('postmatch.duelIdleTotal', 'Idle TC · Total'), totalIdle, rivalTotalIdle, fmtIdle(totalIdle), rivalTotalIdle != null ? fmtIdle(rivalTotalIdle) : '', true) : ''}
      ${duelRow(tr('postmatch.duelArmy', 'Ejército encargado'), self.militaryOrdered, rival?.militaryOrdered, number(self.militaryOrdered), rival ? number(rival.militaryOrdered) : '')}
    </div>`;

    // 4. Producción y colas militares (saturación + edificios recomendados + Mercado decodificado + composición)
    const wsRows = (self.topWorkshops || []).slice(0, 3).map((w) => {
      const sat = w.status === 'saturated';
      const wName = locBuilding(w);
      const tag = sat
        ? `${tr('postmatch.peakQueue', `Pico ${Math.round(w.peakQueue || 0)}`, { n: Math.round(w.peakQueue || 0) })} · ${tr('postmatch.missingBld', `faltaron ~${Math.max(1, (w.recommendedCount || (w.count + 1)) - w.count)}`, { n: Math.max(1, (w.recommendedCount || (w.count + 1)) - w.count) })}`
        : `${tr('postmatch.peakQueue', `Pico ${Math.round(w.peakQueue || 1)}`, { n: Math.round(w.peakQueue || 1) })} ${tr('postmatch.inQueue', 'en cola')}`;
      return `<li class="${sat ? 'is-warn' : ''}"><span><b>${esc(wName)}</b> ×${number(w.count)}</span><small>${esc(tag)} · ${number(w.units)}</small></li>`;
    }).join('');
    const shortComp = (units) => (units || []).slice(0, 2).map((u) => `${esc(locUnit(u))} (${number(u.count)})`).join(' + ') || '—';
    const marketLine = self.marketProfile
      ? `<div class="pm-market-note"><span class="pm-mini-ico">${reportIcon('market')}</span><span>${esc(self.marketProfile.note)}</span></div>` : '';
    const queueBox = `<div class="pm-queue-box">
      <div class="pm-queue-head">
        <span>${esc(tr('postmatch.queuesTitle', 'Colas y edificios militares'))}</span>
        <b>${self.workshopUtilization != null ? `${self.workshopUtilization}% · ${tr('postmatch.buildingsCount', `${self.workshopsCount} edificios`, { n: self.workshopsCount })}` : tr('postmatch.buildingsCount', `${self.workshopsCount} edificios`, { n: self.workshopsCount })}</b>
      </div>
      ${wsRows ? `<ul class="pm-queue-list">${wsRows}</ul>` : '<p class="pm-queue-empty">—</p>'}
      ${marketLine}
      <div class="pm-comp-strip">
        <div>${selfCrest}<span>${shortComp(self.topUnits)}</span></div>
        ${rival ? `<div>${rivalCrest}<span>${shortComp(rival.topUnits)}</span></div>` : ''}
      </div>
    </div>`;

    // 5. Bloque entrenador: Mayor bache exacto de TC + Patrón repetido + Foco (con SVGs centrados)
    const gapRow = self.biggestTcGap
      ? `<div class="pm-coach-row is-gap"><span class="pm-icon-tile is-rose sm">${reportIcon('clock')}</span><div><span class="pm-coach-k">${esc(tr('postmatch.biggestGap', 'Mayor bache de TC'))}</span><b>${esc(self.biggestTcGap.summary)}</b></div></div>` : '';
    const pat = showPersonal ? evo?.recurringPattern : null;
    const patRow = pat
      ? `<div class="pm-coach-row is-warn"><span class="pm-icon-tile is-amber sm">${reportIcon('target')}</span><div><span class="pm-coach-k">${esc(pat.title)}</span><b>${esc(pat.detail)}</b></div></div>` : '';
    const coachPanel = (gapRow || patRow || focusShort)
      ? `<div class="pm-coach-stack">${gapRow}${patRow}${focusShort}</div>` : '';

    const cm = self.combatMicro || {};
    const microVal = cm.controlSharePct != null ? `${dec(cm.controlSharePct, 1)}%` : `${number((self.habits?.attackMove || 0) + (self.habits?.patrol || 0))}`;
    const microSub = cm.moveOrders > 0 ? `<small>${number(cm.combatOrders || 0)}/${number(cm.moveOrders)}</small>` : '';
    const tcCycleVal = cm.tcReturnSec != null ? `${number(cm.tcReturnSec)} s` : '—';
    const habitsStrip = `<div class="pm-habits">
      <div><span>APM / eAPM</span><b>${self.apm != null ? dec(self.apm, 1) : '—'} <small>/ ${self.eapm != null ? dec(self.eapm, 1) : '—'}</small></b></div>
      <div><span>${esc(tr('postmatch.combatMicro', 'Micro combate'))}</span><b>${microVal} ${microSub}</b></div>
      <div><span>${esc(tr('postmatch.tcCycle', 'Ciclo TC'))}</span><b>${tcCycleVal}</b></div>
      <div><span>${esc(tr('postmatch.market', 'Mercado'))}</span><b>${number(self.habits?.market || 0)} <small>${esc(tr('postmatch.ops', 'ops'))}</small></b></div>
    </div>`;

    return `<div class="pm-v2 detail is-${result.status === 'won' ? 'won' : result.status === 'lost' ? 'lost' : 'neutral'}">
      ${header}
      ${trophyBanner}
      ${openingBar}
      ${stageStrip}
      ${badges ? `<div class="pm-badges">${badges}</div>` : ''}
      <div class="pm-columns">
        <section class="pm-col">
          <div class="pm-eyebrow"><span>${esc(evoTitle)}</span><i></i></div>
          ${evoGrid}
          ${productionCurveSvg(eng.timeline, rivalLabel)}
          ${habitsStrip}
        </section>
        <section class="pm-col">
          <div class="pm-eyebrow"><span>${esc(tr('postmatch.duelTitle', 'Duelo de partida'))}</span><i></i></div>
          ${duelBlock}
          ${queueBox}
          ${coachPanel}
        </section>
      </div>
      ${report.combat ? combatBlock(report.combat) : ''}
      <footer class="pm-foot"><span>${esc(tr('postmatch.localReplay', report.data?.sourceLabel || 'Replay local'))}</span><span>${showPersonal && report.mapBenchmark?.games ? `${number(report.mapBenchmark.wins)} V · ${number(report.mapBenchmark.losses)} D · ${esc(locMap(c.mapName) || c.mapName)}` : ''}</span></footer>
    </div>`;
  }
  function renderPostMatch(report, access = {}) {
    if (!report) return '';
    const analysis = report.analysis || {};
    const scanning = analysis.status === 'downloading' || analysis.status === 'analyzing';
    if (report.engine && access.replay !== false && !scanning) {
      return renderEnginePostMatch(report, access);
    }
    const c = report.context || {}, result = report.result || {}, b = report.mapBenchmark || {};
    const stage = (report.stages || []).filter((s) => !access.compact && s.valueType !== 'research-command' &&
      (s.grade || s.id === 'opening' || s.valueSeconds == null)).map((s) => {
      const rating = report.executionRatings?.economic?.stages?.find((item) => item.id === s.id);
      const grade = rating?.grade;
      const value = grade || (s.valueSeconds != null ? clock(s.valueSeconds) : s.valueLabel || '—');
      const text = s.status === 'ready' ? `Tu referencia · ${s.sampleSize} partidas`
        : s.status === 'measured' ? (s.detail || 'Medido en el replay')
          : s.status === 'needs_baseline' ? 'Creando tu referencia'
            : s.status === 'not_reached' ? 'Edad no alcanzada'
              : s.status === 'incomplete' ? 'Sin dato en el replay'
                : 'Falta replay';
      const textValue = Boolean(s.valueLabel && !grade && s.valueSeconds == null);
      return `<article class="review-stage ${s.status === 'ready' ? 'graded' : ''}${s.status === 'measured' ? 'measured' : ''}${textValue ? ' text' : ''}">${reportIcon(s.id)}<div><span>${esc(s.label)}</span><b class="review-grade">${esc(value)}</b><small>${esc(text)}</small></div></article>`;
    }).join('');
    const metrics = report.metrics || {};
    const metric = (key, label, time = false) => {
      const m = metrics[key] || {};
      if (m.value == null) return '';
      return `<div><span>${label}</span><b>${time ? clock(m.value) : number(Math.round(m.value * 10) / 10)}</b><small>${esc(m.unit || '')}</small></div>`;
    };
    const scan = scanning ? `<div class="review-scan" data-phase="${esc(analysis.status)}" role="status" aria-live="polite"><span class="review-scan-icon"><img src="assets/icons/history.png" width="27" height="27" alt=""/></span><div class="review-scan-copy"><b>${esc(analysis.label || 'Preparando el análisis')}</b><small>${esc(analysis.detail || '')}</small></div><span class="review-scan-track" aria-hidden="true"><i></i><i></i></span></div>` : '';
    const warning = analysis.status === 'error' ? `<p class="review-warning">${esc(analysis.detail || 'No se pudo analizar el replay.')}</p>` : '';
    const arrivals = access.replay !== false && !scanning ? measuredAges(metrics) : '';
    const episode = access.replay !== false && !scanning ? replayEpisode(report.castlesWindow, c.mapName) : '';
    const shownMetrics = access.compact ? '' : metric('apm', 'APM') + metric('eapm', 'eAPM');
    const compactApm = access.replay !== false && !scanning && metrics.apm?.value != null
      ? `<span class="review-activity"><b>${number(metrics.apm.value)}</b> APM de comandos</span>` : '';
    const replayBody = access.replay !== false
      ? (scan || `${stage ? `<div class="review-stages">${stage}</div>` : ''}${shownMetrics ? `<div class="review-metrics">${shownMetrics}</div>` : ''}`)
      : (access.compact ? '' : `<p class="intel-muted">${access.replayReason === 'disabled' ? 'Las métricas de replay están desactivadas en tus preferencias.' : 'Las métricas de replay y calificaciones están incluidas en ProMax.'}</p>`);
    const source = report.data && report.data.hasTelemetry
      ? report.data.sourceLabel
      : analysis.status === 'locked' ? 'El análisis del replay está incluido en ProMax.'
        : scanning ? 'El replay se descarga y analiza automáticamente. Esto puede tardar unos segundos.'
          : analysis.status === 'error' ? 'Resultado confirmado. Podés volver a intentar desde Ajustes.'
            : 'Resultado confirmado.';
    const historyMoments = access.comparison !== false && (report.historyHighlights || []).length
      ? `<section class="review-history-highlights" aria-label="Tu evolución en el mapa">${report.historyHighlights.slice(0, 2).map((item) => `<article>${icon(item.icon || 'map')}<div><b>${esc(item.title)}</b><p>${esc(item.detail)}</p></div></article>`).join('')}</section>` : '';
    const mapBody = access.comparison !== false && report.data?.historyStatus !== 'loading' ? matchHistoryContext(b) : '';
    const mode = c.mode?.label;
    const header = `<header class="review-header"><img src="assets/icons/history.png" width="32" height="32" alt=""/><div><h2>${esc(result.label || 'Resultado pendiente')}</h2><p>${esc(c.mapName)} · ${civLabel(c.civ)}${mode ? ` · ${esc(mode)}` : ''}</p>${c.openingLabel ? `<small>Apertura probable · ${esc(c.openingLabel)}</small>` : ''}</div>${result.ratingDiff == null ? '' : `<strong class="review-result ${result.status === 'won' ? 'win' : result.status === 'lost' ? 'loss' : ''}">${result.ratingDiff >= 0 ? '+' : ''}${result.ratingDiff}<small>ELO del modo</small></strong>`}</header>`;
    if (access.compact) {
      const impact = access.replay !== false && !scanning ? compactCombat(report.combat) : '';
      const execution = access.replay !== false && access.comparison !== false && !scanning
        ? compactExecution(report.executionRatings) : '';
      const coverage = !scanning && analysis.status !== 'error' && access.replay !== false && report.data?.hasTelemetry
        ? [!arrivals ? 'Llegadas sin confirmar' : '', !impact ? 'Combate sin cobertura' : '',
          access.comparison !== false && !execution ? 'Economía sin medición comparable' : ''].filter(Boolean).join(' · ') : '';
      const footer = coverage || compactApm || report.data?.hasTelemetry
        ? `<div class="review-compact-footer">${compactApm}${coverage ? `<span>${esc(coverage)}</span>` : ''}<small>Detalle del replay en Ajustes → Postmatch</small></div>` : '';
      return header + episode + impact + execution + arrivals + mapBody + (scanning ? scan : '') + warning + footer;
    }
    return header + episode + arrivals + replayBody + warning +
      (access.comparison !== false ? mapBody + historyMoments : `<p class="intel-muted">${access.comparisonReason === 'disabled' ? 'La comparación con tu historial está desactivada en tus preferencias.' : 'La evolución en este mapa está incluida en ProMax.'}</p>`) +
      (access.replay !== false && !scanning ? executionBlock(report.executionRatings, access.comparison !== false) + combatBlock(report.combat) : '') +
      (access.replay !== false && access.comparison !== false && (report.improvements || []).length ? '<section class="review-insights">' + report.improvements.slice(0, 2).map((i) => `<div>${icon('trend')}<p><b>${esc(i.title)}</b><span>${esc(i.detail)}</span></p></div>`).join('') + '</section>' : '') +
      `<p class="review-data">${esc(source)}</p>`;
  }
  const api = { renderRival, renderPostMatch, renderAutomaticOpportunities, renderSmartBuildOrder, configure, civLabel, civRelation, esc, icon };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TacticalUI = api;
})(typeof globalThis === 'object' ? globalThis : this);
