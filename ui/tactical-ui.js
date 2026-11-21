(function (root) {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value) => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('es-AR') : '—';
  const openingArtKey = (name) => String(name || '').normalize('NFD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const OPENING_ART = new Map([
    ['scouts', 'Scout Rush', 'Scout Opening', 'Scouts', 'Apertura de scouts'],
    ['archers', 'Archer Rush', 'Archer Opening', 'Arqueros', 'Rush de arqueros', 'Apertura de arqueros'],
    ['militia', 'Drush'],
    ['swords', 'M@A Rush', 'M@A', 'MAA rush', 'Man at arms rush', 'Rush de M@A', 'Hombres de Armas', 'Hombres de armas'],
    ['castle', 'Fast Castle', 'FC', 'Castillos rápido', 'Castillos rapido'],
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
    reviewFocus: 'postmatch-focus', reviewAdvice: 'postmatch-advice',
  };
  function icon(name) {
    const asset = ICONS[name];
    return asset ? `<img class="product-icon" src="assets/icons/${asset}.png" alt="" draggable="false">` : '';
  }
  function note(title, message, state = 'empty', feature = '') { return `<div class="intel-note ${esc(state)}"${feature ? ` data-feature="${esc(feature)}"` : ''}><span>${icon(state === 'loading' ? 'history' : 'target')}</span><div><b>${esc(title)}</b><p>${esc(message)}</p></div></div>`; }
  function section(title, content, ico = 'map', extra = '', feature = '') { return `<section class="intel-block ${extra}"${feature ? ` data-feature="${esc(feature)}"` : ''}><h4>${icon(ico)}${esc(title)}</h4>${content}</section>`; }
  function dataState(report, label, feature = '') {
    if (!report || report.loading) return note(label, 'Consultando datos…', 'loading', feature);
    if (report.modePending) return note(label, 'Esperando el modo confirmado de la partida.', 'empty', feature);
    if (report.modeUnavailable) return note(label, 'Esta fuente no ofrece datos de este modo.', 'empty', feature);
    return '';
  }
  function mapBlock(report, mapName, detail) {
    const pending = dataState(report, 'Perfil del mapa', 'rivalFavorites'); if (pending) return pending;
    const m = report.mapStats;
    if (!m || !m.games) return note(mapName || 'Mapa actual', report.error ? 'No se pudo consultar el historial. Se reintentará.' : 'Sin partidas públicas de este mapa en la muestra.', 'empty', 'rivalFavorites');
    const known = m.resultGames == null ? m.games : m.resultGames;
    const wins = m.wins;
    const value = known < 5 ? `${number(wins)}/${number(known)}` : m.winRate == null ? '—' : `${number(m.winRate)}%`;
    const resultLabel = report.mode?.size === 'team' ? tr('prematch.whoTeam', 'de su equipo') : tr('prematch.whoRival', 'del rival');
    const choices = m.civSampleGames;
    const civCoverage = Number.isFinite(choices) && choices > 0
      ? `<p class="intel-muted">Civilización identificada en <b>${number(choices)}</b> de ${number(m.sampleGames)} partidas revisadas.</p>`
      : '<p class="intel-muted">Sin elecciones de civ verificadas en la muestra.</p>';
    return section(tr('postmatch.mapRecordIn', `En ${locMap(m.name || mapName) || 'este mapa'}`, { map: locMap(m.name || mapName) || mapName }),
      `<p class="intel-statline"><b>${value}</b> · ${esc(tr('prematch.mapWinsLine', `${number(wins)} victorias ${resultLabel} en ${number(known)} resultados conocidos`, { wins: number(wins), who: resultLabel, known: number(known) }))}${report.partial ? ' · parcial' : ''}</p>` +
      (detail ? civCoverage : ''), 'map', '', 'rivalFavorites');
  }
  function historyBlock(report) {
    const title = tr('postmatch.last5Title', 'Últimas 5 partidas');
    const pending = dataState(report, title, 'rivalCivs'); if (pending) return pending;
    const rows = Array.isArray(report.history) ? report.history.slice(0, 5) : [];
    if (!rows.length) return note(title, report.error ? 'El historial no está disponible ahora.' : 'Sin partidas recientes de este modo.', 'empty', 'rivalCivs');
    const wLetter = tr('prematch.winLetter', 'V');
    const lLetter = tr('prematch.lossLetter', 'D');
    const entries = rows.map((row, index) => {
      const outcome = row.won === true ? tr('postmatch.win', 'Victoria') : row.won === false ? tr('postmatch.loss', 'Derrota') : 'Resultado pendiente';
      return `<li class="intel-history-row${index === 0 ? ' recent' : ''}"><strong>${civLabel(row.civ)}</strong><small>${esc(locMap(row.mapName) || 'Mapa sin dato')}</small><b class="result-letter ${row.won === true ? 'win' : row.won === false ? 'loss' : ''}" title="${outcome}" aria-label="${outcome}">${row.won === true ? esc(wLetter) : row.won === false ? esc(lLetter) : '—'}</b></li>`;
    }).join('');
    return `<section class="intel-block history-block" data-feature="rivalCivs"><div class="intel-history-head"><h4>${icon('history')}${esc(title)}</h4><p class="intel-history-label">${esc(tr('postmatch.moreRecentTop', 'Más reciente arriba · mismo modo'))}</p></div><ol class="intel-history-list">${entries}</ol></section>`;
  }
  function openingBlock(report, currentCiv) {
    const hasCiv = Boolean(civSlug(currentCiv));
    const title = hasCiv ? tr('postmatch.openingsCiv', 'Aperturas de su civilización') : tr('postmatch.openingsHistory', 'Aperturas del historial');
    const pending = dataState(report, title, 'rivalOpenings'); if (pending) return pending;
    const o = report.openings;
    if (report.openingError || o?.error) return note(title, 'No se pudieron consultar los replays.', 'empty', 'rivalOpenings');
    if (!o || report.pendingOpenings || o.loading || (hasCiv && civSlug(o.openingCiv) !== civSlug(currentCiv))) {
      return note(title, tr('prematch.searchingMapReplays', 'Buscando replays en el mapa…'), 'loading', 'rivalOpenings');
    }
    if (o.modeUnavailable) return note(title, 'No hay análisis de replays para este modo.', 'empty', 'rivalOpenings');
    const pick = hasCiv ? o.mapCivFavorite : o.mapFavorite;
    const n = Number(hasCiv ? o.mapCivAnalyzed : o.mapAnalyzed) || 0;
    if (!pick || !n) return note(title, tr('prematch.noMapOpenings', 'Sin aperturas clasificadas en este mapa.'), 'empty', 'rivalOpenings');
    return section(title, `<div class="intel-opening"><b>${esc(locOpening(pick.name, pick.short || pick.name))}</b><span>${esc(tr('postmatch.replaysOf', `${number(pick.count)} de ${number(n)} replays`, { a: number(pick.count), b: number(n) }))}</span></div><p class="intel-muted">${hasCiv ? civLabel(currentCiv) : esc(tr('prematch.allTheirCivsMap', 'Todas sus civs en este mapa'))}${n < 6 ? ` · ${esc(tr('prematch.smallSample', 'muestra chica'))}` : ''}</p>`, 'sword', openingArtClass(pick.name || pick.short).trim(), 'rivalOpenings');
  }
  function h2hBlock(report) {
    const title = tr('prematch.h2hTitle', 'Tu cara a cara');
    const pending = dataState(report, title, 'rivalH2H'); if (pending) return pending;
    const h = report.h2h;
    if (report.h2hPending || !h) return note(title, 'Consultando tus enfrentamientos…', 'loading', 'rivalH2H');
    if (h.error) return note(title, 'No se pudo consultar tu historial.', 'empty', 'rivalH2H');
    if (h.modeUnavailable || h.modePending) return note(title, h.modePending ? 'Esperando el modo confirmado.' : 'Sin historial compatible con este modo.', 'empty', 'rivalH2H');
    const wLetter = tr('prematch.winLetter', 'V');
    const lLetter = tr('prematch.lossLetter', 'D');
    return section(title, `<div class="intel-h2h"><b>${number(h.wins)} <small>${esc(wLetter)}</small> <i>—</i> ${number(h.losses)} <small>${esc(lLetter)}</small></b><p>${h.games ? esc(tr('prematch.h2hConfirmed', `${number(h.games)} enfrentamientos confirmados`, { n: number(h.games) })) : esc(tr('prematch.h2hNoneScanned', `Sin enfrentamientos en ${number(h.scanned || 0)} partidas revisadas`, { n: number(h.scanned || 0) }))}${h.asAllies ? ` · ${esc(tr('prematch.h2hAsAllies', `${number(h.asAllies)} como aliados`, { n: number(h.asAllies) }))}` : ''}${h.unresolved ? ` · ${number(h.unresolved)} con equipos sin confirmar` : ''}</p></div>`, 'combat', '', 'rivalH2H');
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
  function locPoolLabel(pool) {
    if (!pool) return '';
    if (pool.poolType === 'specialist') return tr('prematch.poolSpecialist', pool.label || 'Especialista');
    if (pool.poolType === 'focused') return tr('prematch.poolFocused', pool.label || 'Pool acotado');
    if (pool.poolType === 'random') return tr('prematch.poolRandom', pool.label || 'Jugador Random');
    return tr('prematch.poolInitial', pool.label || 'Muestra inicial');
  }
  function tacticalChipsBlock(player, report, tip) {
    const cells = [];
    const pred = report?.prediction?.status === 'ready' ? report.prediction
      : tip?.prediction?.status === 'ready' ? tip.prediction : null;
    const pool = pred?.pool;
    if (pool && pool.poolType && pool.poolType !== 'insufficient') {
      const sub = pool.distinctCivs && pool.sampleGames
        ? tr('prematch.civsInGames', `${number(pool.distinctCivs)} civs · ${number(pool.sampleGames)} pj`, { civs: number(pool.distinctCivs), games: number(pool.sampleGames) })
        : '';
      cells.push(`<div class="intel-kv${pool.poolType === 'specialist' ? ' is-accent' : ''}"><span>${esc(tr('prematch.profile', 'Perfil'))}</span><b>${esc(locPoolLabel(pool))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`);
    }
    const topPct = Number(player?.ladderPercentile);
    if (Number.isFinite(topPct) && topPct > 0) {
      const label = topPct < 1 ? 'Top 1%' : `Top ${topPct < 10 ? topPct.toFixed(1).replace('.', ',') : Math.round(topPct)}%`;
      const peakDelta = Number.isFinite(Number(player?.peakDelta)) ? Number(player.peakDelta)
        : Number.isFinite(Number(player?.peak)) && Number.isFinite(Number(player?.rating))
          ? Math.round(Number(player.peak) - Number(player.rating)) : null;
      const sub = peakDelta != null && peakDelta >= 120 ? tr('prematch.offPeak', `−${number(peakDelta)} del pico`, { n: number(peakDelta) }) : 'ladder 1v1';
      cells.push(`<div class="intel-kv"><span>${esc(tr('prematch.ladder', 'Ladder'))}</span><b>${esc(label)}</b><small>${esc(sub)}</small></div>`);
    } else {
      const peakDelta = Number.isFinite(Number(player?.peakDelta)) ? Number(player.peakDelta)
        : Number.isFinite(Number(player?.peak)) && Number.isFinite(Number(player?.rating))
          ? Math.round(Number(player.peak) - Number(player.rating)) : null;
      if (peakDelta != null && peakDelta >= 120) {
        cells.push(`<div class="intel-kv"><span>${esc(tr('prematch.peak', 'Pico'))}</span><b>−${number(peakDelta)}</b><small>${esc(tr('prematch.belowPeak', 'debajo del pico'))}</small></div>`);
      }
    }
    const streak = Number(player?.streak);
    if (Number.isFinite(streak) && Math.abs(streak) >= 3) {
      const cls = streak > 0 ? 'win' : 'loss';
      const sub = streak > 0 ? tr('prematch.winStreak', 'victorias seguidas') : tr('prematch.lossStreak', 'derrotas seguidas');
      cells.push(`<div class="intel-kv"><span>${esc(tr('prematch.streak', 'Racha'))}</span><b class="${cls}">${streak > 0 ? `+${streak}` : streak}</b><small>${esc(sub)}</small></div>`);
    }
    const eapm = tip?.eapm;
    if (eapm && Number.isFinite(eapm.value)) {
      const paceText = eapm.pace === 'fast' ? tr('prematch.paceFast', 'Rápido')
        : eapm.pace === 'deliberate' ? tr('prematch.paceSteady', 'Pausado')
          : tr('prematch.paceStandard', 'Estándar');
      const sub = eapm.peerMedian ? `${paceText} · vs ${number(eapm.peerMedian)}` : `${paceText} · ${number(eapm.sample)} ${tr('prematch.gamesShort', 'pj')}`;
      cells.push(`<div class="intel-kv${eapm.pace === 'fast' ? ' is-accent' : ''}"><span>${esc(tr('prematch.mechanics', 'Mecánica'))}</span><b>${number(eapm.value)} eAPM</b><small>${esc(sub)}</small></div>`);
    }
    if (!cells.length) return '';
    return `<div class="intel-dossier-strip" aria-label="Perfil táctico del rival">${cells.join('')}</div>`;
  }
  function styleBarMarkup(style) {
    if (!style || !style.analyzed || style.analyzed < 6) return '';
    const agro = Math.max(0, Math.min(100, Math.round((style.aggressive / style.analyzed) * 100)));
    const fc = Math.max(0, Math.min(100 - agro, Math.round((style.boom / style.analyzed) * 100)));
    const hyb = Math.max(0, 100 - agro - fc);
    return `<div class="intel-style-split"><div class="intel-style-labels"><span>${esc(tr('prematch.earlyPressure', 'Presión temprana'))} <b>${agro}%</b></span><span>${esc(tr('prematch.fastCastle', 'Castillos rápido'))} <b>${fc}%</b></span></div><div class="intel-style-track"><i class="seg-agro" data-w="${agro}"></i><i class="seg-hyb" data-w="${hyb}"></i><i class="seg-fc" data-w="${fc}"></i></div></div>`;
  }
  function tacticalBlock(tip, detail, matchup, civ, map) {
    const title = tr('prematch.openingsHistory', 'Aperturas del historial');
    if (!tip || tip.loading) return note(title, tr('prematch.searchingOpenings', 'Buscando aperturas del rival…'), 'loading', 'smartTips');
    if (tip.modePending || tip.modeUnavailable) return note(title, tip.modePending ? 'Esperando el modo confirmado.' : 'Este modo todavía no tiene replays compatibles.', 'empty', 'smartTips');
    if (tip.error && !tip.sample) return note(title, 'La fuente de replays no respondió.', 'empty', 'smartTips');
    const c = tip.tacticalPlan?.context || tip.context;
    const current = matchup?.openings?.length > 0;
    const openings = current ? matchup.openings : tip.likelyOpenings || [];
    const opening = openings[0];
    if (!c || !opening?.sample || !opening.games) {
      return note(title, tr('prematch.noClassifiedOpenings', 'Sin aperturas clasificadas en el historial consultado.'), 'empty', 'smartTips');
    }
    const read = `<div class="intel-opening-signal"><b>${esc(locOpening(opening.name, opening.short || opening.name))}</b><span>${esc(tr('prematch.classifiedReplays', `${number(opening.games)} de ${number(opening.sample)} replays clasificados`, { a: number(opening.games), b: number(opening.sample) }))}</span></div>`;
    const scope = [current ? tr('prematch.civOnMap', `${locCiv(civ) || civ} en ${locMap(map) || map}`, { civ: locCiv(civ) || civ, map: locMap(map) || map }) : c.scopeLabel, c.modeLabel,
      current ? (opening.sample < 6 ? tr('prematch.smallSample', 'muestra chica') : null) : tr('prematch.allTheirCivs', 'todas sus civs'),
      tip.stale ? 'datos guardados' : tip.provisional ? 'muestra inicial' : null].filter(Boolean).join(' · ');
    const question = (current || (!civ && c.scope === 'map')) && opening.games >= 4 && opening.sample >= 6
      ? OPENING_CHECKS[opening.name] : null;
    const caveat = current ? '' : [civ ? `Sin aperturas de ${civ} en este mapa en la muestra.` : null,
      c.fallbackReason].filter(Boolean).join(' ');
    const alternatives = detail && current && openings.length > 1
      ? `<p class="intel-muted">${openings.slice(1, 3).map((row) =>
        `${esc(locOpening(row.name, row.short || row.name))} (${number(row.games)}/${number(row.sample)})`).join(' · ')}</p>` : '';
    const split = !current ? styleBarMarkup(tip.style) : '';
    const weakOp = !current && tip.eloWeakness?.openings?.[0];
    const weaknessLine = weakOp
      ? `<p class="intel-weakness"><span>${esc(tr('prematch.observedWeakness', 'Vulnerabilidad observada'))}</span><b>${esc(openingDisplay(weakOp))}</b> · ${number(weakOp.losses)}/${number(weakOp.games)} ${esc(tr('prematch.losses', 'derrotas'))}${weakOp.excessLossPct != null ? ` (+${number(weakOp.excessLossPct)}% ELO)` : ''}</p>`
      : '';
    return section(title, read + `<p class="intel-signal-scope">${esc(scope)}</p>` +
      split + weaknessLine +
      (caveat ? `<p class="intel-muted">${esc(caveat)}</p>` : '') +
      (question ? `<p class="intel-check">${icon('target')}${esc(question)}</p>` : '') + alternatives, 'scout', 'tactical-block' + openingArtClass(opening.name || opening.short), 'smartTips');
  }
  function historicalCivBlock(tip, map, report, options = {}) {
    const pred = report?.prediction?.status === 'ready' && report.prediction.top3?.length ? report.prediction
      : options.smartTips && tip?.prediction?.status === 'ready' && tip.prediction.top3?.length ? tip.prediction : null;
    if (pred) {
      const pool = pred.pool || {};
      const isRandom = pool.poolType === 'random';
      const locMapLabel = map && map !== '—' ? (locMap(map) || map) : 'el mapa';
      const title = isRandom ? tr('prematch.pickProfile', 'Perfil de selección') : tr('prematch.predictionMap', `Predicción · ${locMapLabel}`, { map: locMapLabel });
      const confLabel = pool.poolType === 'specialist' ? tr('prematch.highConfidence', 'Confianza alta')
        : pool.poolType === 'focused' ? tr('prematch.poolFocused', 'Pool acotado')
          : isRandom ? tr('prematch.poolRandom', 'Jugador Random') : tr('prematch.poolInitial', 'Muestra inicial');
      const scopeParts = [
        pool.scope === 'map' && map ? locMapLabel : tr('prematch.recentHistory', 'historial reciente'),
        report?.mode?.label || tip?.context?.modeLabel,
        tr('prematch.civsInGamesLong', `${number(pool.distinctCivs)} civs en ${number(pool.sampleGames)} pj`, { civs: number(pool.distinctCivs), games: number(pool.sampleGames) }),
        report?.partial ? 'en carga' : null,
      ].filter(Boolean).join(' · ');
      const randomBanner = isRandom
        ? (options.civCounterPick
            ? `<div class="pred-random-note"><b>${esc(tr('prematch.randomUnpredictableTitle', 'Rival impredecible (Random)'))}</b><p>${esc(tr('prematch.randomUnpredictableBody', `Juega variedad alta (${number(pool.distinctCivs)} civs distintas): no busques adivinar su civ; abajo priorizamos tu mejor pick y las aperturas que le duelen.`, { n: number(pool.distinctCivs) }))}</p></div>`
            : `<div class="pred-random-note"><b>${esc(tr('prematch.randomNoCounterTitle', 'No counter-pickees una civ puntual'))}</b><p>${esc(tr('prematch.randomNoCounterBody', `Juega variedad alta (${number(pool.distinctCivs)} civs distintas). Elegí tu civ cómoda y enfocate en su patrón de apertura.`, { n: number(pool.distinctCivs) }))}</p></div>`)
        : '';
      const cards = pred.top3.filter((row) => civSlug(row.civ)).slice(0, 3).map((row, idx) => {
        const sub = row.mapGames > 0 && row.mapSample > 0
          ? tr('prematch.onMapSub', `${number(row.mapGames)}/${number(row.mapSample)} en mapa`, { a: number(row.mapGames), b: number(row.mapSample) })
          : tr('prematch.recentSub', `${number(row.recentGames)} recientes`, { n: number(row.recentGames) });
        return `<li class="${idx === 0 && !isRandom ? 'pred-lead' : ''}"><span class="pred-crest">${civBadge(row.civ)}</span>
          <strong>${esc(locCiv(row.civ) || row.civ)}</strong>
          <b class="pred-pct">${number(row.probability)}%</b>
          <div class="pred-bar"><i data-w="${Math.max(4, Math.min(100, row.probability))}"></i></div>
          <span>${esc(sub)}</span></li>`;
      }).join('');
      const threat = pred.threat?.threat
        ? `<p class="pred-threat">${icon('sword')}<span><b>${esc(locCiv(pred.top3[0].civ) || pred.top3[0].civ)}</b> — ${esc(pred.threat.threat)}</span></p>`
        : '';
      return `<section class="intel-block civ-picks predicted" data-feature="civRecommender"><div class="pred-head"><h4>${icon('matchup')}${esc(title)}</h4><span class="pred-conf${pool.poolType === 'specialist' ? ' is-accent' : ''}">${esc(confLabel)}</span></div><p class="civ-picks-scope">${esc(scopeParts)}</p>${randomBanner}<ul class="civ-picks-list">${cards}</ul>${threat}</section>`;
    }
    const title = 'Sus civs más jugadas';
    const stats = report?.mapStats;
    const observed = (stats?.civs || []).filter((row) => civSlug(row.name)).slice(0, 3);
    const count = stats?.civSampleGames ?? stats?.sampleGames;
    const render = (rows, scope) => section(title, `<p class="civ-picks-scope">${esc(scope)}</p>
      <ul class="civ-picks-list">${rows.map((row) => `<li>${civBadge(row.name)}
        <strong>${esc(row.name)}</strong><span>${number(row.games)} de ${number(row.sample)}</span></li>`).join('')}</ul>`,
      'matchup', 'civ-picks', 'civRecommender');
    if (count > 0 && observed.length) {
      const scope = [map, report.mode?.label, 'partidas con civ conocida', report.partial ? 'muestra en carga' : null]
        .filter(Boolean).join(' · ');
      return render(observed.map((row) => ({ ...row, sample: count })), scope);
    }
    if (!tip || tip.loading) return note(title, 'Consultando elecciones anteriores…', 'loading', 'civRecommender');
    if (tip.modePending || tip.modeUnavailable || tip.error) return note(title, 'Historial del modo no disponible.', 'empty', 'civRecommender');
    const context = tip.context;
    const choices = (Array.isArray(tip.likelyCivs) ? tip.likelyCivs : [])
      .filter((row) => civSlug(row.name)).slice(0, 3);
    if (!context || context.mapName !== map || !choices.length) return note(title, 'Sin muestra de elecciones en este mapa.', 'empty', 'civRecommender');
    return render(choices, [map, context.modeLabel, 'replays consultados',
      tip.stale ? 'datos guardados' : tip.provisional ? 'muestra inicial' : null].filter(Boolean).join(' · '));
  }
  function pickBestRecommendations(tip) {
    const raw = Array.isArray(tip?.recommend)
      ? tip.recommend.filter((entry) => entry && civSlug(entry.civ))
      : [];
    if (!raw.length) return [];
    const multi = raw.filter((entry) =>
      entry.basis === 'combined' || entry.basis === 'opening-synergy' || entry.basis === 'rival-opening');
    if (multi.length) return multi.slice(0, 3);
    const strongSingle = raw.filter((entry) =>
      (entry.mine && Number(entry.mine.games) >= 3 && Number(entry.mine.winRate) >= 52) ||
      (entry.vsRival && Number(entry.vsRival.games) >= 3 && Number(entry.vsRival.lossRate) >= 58));
    return (strongSingle.length ? strongSingle : raw).slice(0, 3);
  }
  function recommendBasisTag(rec, isRandom = false) {
    if (!rec) return '';
    if (rec.factors === 3 || (rec.basis === 'combined' && rec.openingMatch)) return tr('prematch.badgeTriple', 'Cruce 3/3');
    if (rec.basis === 'combined') return tr('prematch.badgeCombined', 'Cruce directo');
    if (rec.basis === 'opening-synergy') return isRandom ? tr('prematch.badgeComfortOpening', 'Confort + apertura') : tr('prematch.badgeOpeningSynergy', 'Sinergia apertura');
    if (rec.basis === 'rival-opening') return tr('prematch.badgeRivalOpening', 'Debilidad rival');
    if (rec.basis === 'own-history') return tr('prematch.badgeOwnBest', 'Tu mejor pick');
    if (rec.basis === 'rival-history') return tr('prematch.badgeRivalWeak', 'Rival sufre');
    return tr('prematch.counterSuggested', 'Sugerencia');
  }
  function openingDisplay(op) {
    if (!op) return '';
    const api = getI18n();
    const translated = api && api.openingName ? locOpening(op.name, null) : null;
    if (translated) return translated;
    return OPENING_LABELS_ES[op.name] || op.short || op.name;
  }
  function lobbyRecommendBlock(tip, map, { showEmpty = false, isRandom = false } = {}) {
    const mapLabel = locMap(map) || map || '';
    const kicker = isRandom
      ? (mapLabel ? tr('prematch.recRandomMap', `Tu mejor pick vs Random · ${mapLabel}`, { map: mapLabel }) : tr('prematch.recRandomDefault', 'Tu mejor pick vs rival Random'))
      : (mapLabel ? tr('prematch.recKickerMap', `Recomendación · ${mapLabel}`, { map: mapLabel }) : tr('prematch.recKickerDefault', 'Recomendación de civilización'));
    if (!tip || tip.loading || tip.recommendPending) {
      return `<section class="intel-block lobby-counter is-loading" data-feature="civCounterPick">` +
        `<div class="lobby-counter-head">` +
          `<span class="lobby-counter-crest is-skeleton">${icon('matchup')}</span>` +
          `<div class="lobby-counter-copy">` +
            `<span>${esc(kicker)}</span>` +
            `<b>${esc(tr('prematch.recLoadingTitle', 'Analizando tu mejor opción…'))}</b>` +
            `<p>${esc(tr('prematch.recLoadingBody', 'Cruzando tu winrate, debilidades del rival y aperturas que le duelen'))}</p>` +
          `</div>` +
        `</div>` +
      `</section>`;
    }
    const picks = pickBestRecommendations(tip);
    if (!picks.length) {
      if (!showEmpty) return '';
      return `<section class="intel-block lobby-counter is-empty" data-feature="civCounterPick">` +
        `<div class="lobby-counter-head">` +
          `<span class="lobby-counter-crest is-muted">${icon('matchup')}</span>` +
          `<div class="lobby-counter-copy">` +
            `<span>${esc(kicker)}</span>` +
            `<b>${esc(tr('prematch.recEmptyTitle', 'Sin counter-pick concluyente'))}</b>` +
            `<p>${esc(tr('prematch.recEmptyBody', 'Todavía falta muestra suficiente en este mapa para cruzar ambos historiales.'))}</p>` +
          `</div>` +
        `</div>` +
      `</section>`;
    }
    const rec = picks[0];
    const alts = picks.slice(1, 3);
    const civName = locCiv(rec.civ) || rec.civ;
    const tag = recommendBasisTag(rec, isRandom);
    const isTriple = rec.factors === 3 || (rec.basis === 'combined' && Boolean(rec.openingMatch));
    const lLetter = tr('prematch.lossLetter', 'D');
    const gamesWord = tr('prematch.gamesShort', 'pj');
    const tiles = [];
    if (rec.mine) {
      const tone = Number(rec.mine.winRate) >= 55 ? ' is-win' : '';
      const mineScopeText = rec.mine.scope === 'map' && mapLabel ? mapLabel : (tip?.context?.modeLabel || rec.mine.scopeLabel || '');
      tiles.push(
        `<div class="lobby-factor">` +
          `<span class="lobby-factor-k">${esc(tr('prematch.factorYourRecord', 'Tu historial'))}</span>` +
          `<b class="lobby-factor-v${tone}">${number(rec.mine.winRate)}% WR</b>` +
          `<small>${number(rec.mine.wins)}/${number(rec.mine.games)} ${esc(gamesWord)}${mineScopeText ? ` · ${esc(mineScopeText)}` : ''}</small>` +
        `</div>`,
      );
    }
    if (rec.vsRival) {
      tiles.push(
        `<div class="lobby-factor">` +
          `<span class="lobby-factor-k">${esc(tr('prematch.factorRivalVs', `Rival vs ${civName}`, { civ: civName }))}</span>` +
          `<b class="lobby-factor-v is-accent">${number(rec.vsRival.lossRate)}% ${esc(lLetter)}</b>` +
          `<small>${number(rec.vsRival.losses)}/${number(rec.vsRival.games)} ${esc(tr('prematch.losses', 'derrotas'))}</small>` +
        `</div>`,
      );
    }
    if (rec.openingMatch) {
      const opName = openingDisplay(rec.openingMatch);
      tiles.push(
        `<div class="lobby-factor">` +
          `<span class="lobby-factor-k">${esc(tr('prematch.factorWeakOpening', 'Apertura que le duele'))}</span>` +
          `<b class="lobby-factor-v is-accent">${esc(opName)}</b>` +
          `<small>${number(rec.openingMatch.losses)}/${number(rec.openingMatch.games)} ${esc(lLetter)} (${number(rec.openingMatch.lossRate)}%)</small>` +
        `</div>`,
      );
    }
    const altHtml = alts.length
      ? `<div class="lobby-counter-alts">` +
          `<span class="lobby-alts-k">${esc(tr('prematch.alternatives', 'Alternativas'))}</span>` +
          `<div class="lobby-alts-list">${alts.map((alt) => {
            const altName = locCiv(alt.civ) || alt.civ;
            const stat = alt.mine
              ? `${number(alt.mine.winRate)}% WR`
              : alt.vsRival
                ? `${number(alt.vsRival.lossRate)}% ${lLetter}`
                : '';
            return `<span class="lobby-alt-pill">${civBadge(alt.civ)}<b>${esc(altName)}</b>${stat ? `<small>${esc(stat)}</small>` : ''}</span>`;
          }).join('')}</div>` +
        `</div>`
      : '';
    return `<section class="intel-block lobby-counter${isTriple ? ' is-triple' : ''}" data-feature="civCounterPick">` +
      `<div class="lobby-counter-head">` +
        `<span class="lobby-counter-crest">${civBadge(rec.civ)}</span>` +
        `<div class="lobby-counter-copy">` +
          `<span>${esc(kicker)}</span>` +
          `<b>${esc(civName)}</b>` +
        `</div>` +
        `<span class="lobby-counter-badge${isTriple ? ' is-gold' : ''}">${esc(tag)}</span>` +
      `</div>` +
      (tiles.length ? `<div class="lobby-counter-factors" data-cols="${tiles.length}">${tiles.join('')}</div>` : '') +
      altHtml +
    `</section>`;
  }
  function matchupBlock(tip, matchup, ownCiv, rivalCiv, map, report) {
    const title = tr('prematch.matchupTitle', 'Antecedentes de este cruce');
    if (!civSlug(rivalCiv)) return historicalCivBlock(tip, map, report);
    if (!civSlug(ownCiv)) return note(title, 'Esperando tu civilización.', 'empty', 'civRecommender');
    if (!tip || tip.loading) return note(title, 'Buscando el cruce para este mapa…', 'loading', 'civRecommender');
    if (tip.modePending || tip.modeUnavailable) return note(title, 'Sin historial compatible con el modo.', 'empty', 'civRecommender');
    if (tip.error) return note(title, 'La fuente de replays no respondió.', 'empty', 'civRecommender');
    if (!matchup) return note(title, 'Esperando datos del cruce actual.', 'loading', 'civRecommender');
    if (matchup.teamGame) return note(title, 'El resultado de equipo no mide este mano a mano.', 'empty', 'civRecommender');
    if (!matchup.games) return note(title, tr('prematch.matchupNoResults', 'Sin resultados para este cruce en el mapa.'), 'empty', 'civRecommender');
    const against = (matchup.against || []).map((row) => `<p class="intel-muted">Ante ${esc(row.name)} · ${number(row.losses)}/${number(row.games)} derrotas</p>`).join('');
    return section(title, `<p class="intel-matchup">${civLabel(ownCiv)} <span>vs</span> ${civLabel(rivalCiv)}</p>
      <p class="intel-statline"><b>${number(matchup.losses)}/${number(matchup.games)}</b> derrotas del rival en el mapa</p>
      ${matchup.games < 6 ? '<p class="intel-muted">Muestra chica.</p>' : ''}
      ${against}`, 'matchup', '', 'civRecommender');
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
  function renderTeamRival({ entry, state, options = {} } = {}) {
    const { name, player, report, tip } = entry;
    const map = state && state.match && state.match.mapName;
    const locMapName = locMap(map) || map || 'este mapa';
    const r = report || null;
    const inLobby = state?.phase === 'lobby';
    const civ = inLobby ? null : player ? player.civ : r?.civ;
    const ownCiv = state?.players?.find((p) => p.isYou)?.civ;
    const knownCiv = civSlug(civ) ? civ : null;
    const mode = state?.ladder?.id ?? state?.match?.leaderboardId ?? tip?.mode?.id;
    const mapKey = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const raw = tip?.matchup;
    const matchup = raw && raw.rival === civSlug(knownCiv) && raw.own === civSlug(ownCiv) &&
      raw.map === mapKey(map) && (mode == null || String(raw.modeId) === String(mode)) ? raw : null;

    // 1) Cabecera compacta + fila fija de tags (nunca cambia de alto al cargar)
    const pills = [];
    const headerLoading = (!r || r.loading) && (!tip || tip.loading);
    if (options.rosterDetails !== false) {
      const pred = r?.prediction?.status === 'ready' ? r.prediction
        : tip?.prediction?.status === 'ready' ? tip.prediction : null;
      const pool = pred?.pool;
      if (pool && pool.poolType && pool.poolType !== 'insufficient') {
        pills.push(`<span class="tg-pill${pool.poolType === 'specialist' ? ' is-gold' : ''}">${esc(pool.label)}</span>`);
      }
      const eapm = tip?.eapm;
      if (eapm && Number.isFinite(eapm.value)) {
        pills.push(`<span class="tg-pill${eapm.pace === 'fast' ? ' is-gold' : ''}">${number(eapm.value)} eAPM</span>`);
      }
      const streak = Number(player?.streak);
      if (Number.isFinite(streak) && Math.abs(streak) >= 3) {
        pills.push(`<span class="tg-pill ${streak > 0 ? 'is-win' : 'is-loss'}">Racha ${streak > 0 ? `+${streak}` : streak}</span>`);
      } else {
        const topPct = Number(player?.ladderPercentile);
        if (Number.isFinite(topPct) && topPct > 0 && topPct <= 25) {
          const lbl = topPct < 1 ? 'Top 1%' : `Top ${Math.round(topPct)}%`;
          pills.push(`<span class="tg-pill">${esc(lbl)}</span>`);
        }
      }
      if (!pills.length) {
        if (headerLoading) {
          pills.push('<span class="tg-pill is-skeleton">Perfil…</span><span class="tg-pill is-skeleton">eAPM…</span>');
        } else {
          const peakText = Number.isFinite(Number(player?.peak)) ? `Pico ${number(Math.round(Number(player.peak)))}` : 'ELO RM 1v1';
          pills.push(`<span class="tg-pill">${esc(peakText)}</span>`);
        }
      }
    }
    const eloChip = Number.isFinite(Number(player?.rating))
      ? `<b class="tg-rival-elo">${number(Math.round(Number(player.rating)))}</b>`
      : '<b class="tg-rival-elo is-skeleton">…</b>';
    const civHeaderBadge = options.rosterDetails === false
      ? ''
      : knownCiv
        ? `<span class="tg-rival-civ">${civLabel(knownCiv)}</span>`
        : `<span class="tg-rival-civ is-pending">${esc(tr('hud.civPendingShort', 'Civ oculta'))}</span>`;

    const blocks = [];

    // 2) Apertura + Estilo en estructura fija de 3 filas (no salta ni se deforma al cargar)
    if (options.smartTips || options.rivalOpenings) {
      const feat = options.smartTips ? 'smartTips' : 'rivalOpenings';
      const current = matchup?.openings?.length > 0;
      const tipOpenings = current ? matchup.openings : tip?.likelyOpenings || [];
      const tipOpen = tipOpenings[0];
      const o = r?.openings;
      const repPick = knownCiv ? o?.mapCivFavorite : o?.mapFavorite;
      const repN = Number(knownCiv ? o?.mapCivAnalyzed : o?.mapAnalyzed) || 0;

      const bestName = (options.smartTips && tipOpen?.sample && tipOpen?.games)
        ? (tipOpen.short || tipOpen.name)
        : (repPick && repN)
          ? locOpening(repPick.name, repPick.short || repPick.name)
          : null;
      const bestCount = (options.smartTips && tipOpen?.sample && tipOpen?.games)
        ? `${number(tipOpen.games)}/${number(tipOpen.sample)} replays`
        : (repPick && repN)
          ? `${number(repPick.count)}/${number(repN)} replays`
          : null;

      const style = tip?.style;
      const hasStyle = Boolean(options.smartTips && style && style.analyzed >= 6);
      const agro = hasStyle ? Math.max(0, Math.min(100, Math.round((style.aggressive / style.analyzed) * 100))) : 50;
      const fc = hasStyle ? Math.max(0, Math.min(100 - agro, Math.round((style.boom / style.analyzed) * 100))) : 50;
      const hyb = hasStyle ? Math.max(0, 100 - agro - fc) : 0;
      const weakOp = options.smartTips && !current && tip?.eloWeakness?.openings?.[0];

      const isLoading = (options.smartTips && (!tip || tip.loading || tip.provisional)) ||
        (!options.smartTips && options.rivalOpenings && (!r || r.loading || r.pendingOpenings || !o || o.loading));

      const headlineText = bestName ? bestName : isLoading ? 'Analizando replays…' : 'Apertura variada';
      const sampleText = bestCount ? bestCount : isLoading ? 'Consultando…' : 'Sin patrón fijo';
      const agroText = hasStyle ? `${agro}%` : isLoading ? '…' : '—';
      const fcText = hasStyle ? `${fc}%` : isLoading ? '…' : '—';
      const weakLineHtml = weakOp
        ? `${icon('target')}<span>${esc(tr('prematch.tgSuffersVs', 'Sufre vs'))} <b>${esc(openingDisplay(weakOp))}</b> (${number(weakOp.losses)}/${number(weakOp.games)} ${esc(tr('prematch.lossLetter', 'D'))})</span>`
        : isLoading
          ? `${icon('history')}<span>${esc(tr('prematch.recLoadingBody', 'Cruzando aperturas y vulnerabilidades…'))}</span>`
          : bestName
            ? `${icon('target')}<span>${esc(tr('prematch.tgUsualOpening', 'Apertura habitual'))} · ${esc(locMapName)}</span>`
            : `${icon('sword')}<span>${esc(tr('prematch.noMapOpenings', 'Sin vulnerabilidad crítica en la muestra'))}</span>`;

      const rawOpeningKey = (options.smartTips && tipOpen?.sample && tipOpen?.games)
        ? (tipOpen.name || tipOpen.short)
        : (repPick && repN)
          ? (repPick.name || repPick.short)
          : null;
      const artCls = openingArtClass(rawOpeningKey || bestName || 'archive');

      blocks.push(
        `<section class="tg-block tg-open-card${artCls}${isLoading && !bestName ? ' is-loading' : ''}" data-feature="${feat}">` +
          `<div class="tg-open-main">` +
            `<span class="tg-open-kicker">${icon('sword')}${esc(tr('prematch.tgUsualOpening', 'Apertura habitual'))}</span>` +
            `<b class="tg-open-name">${esc(headlineText)}</b>` +
            `<span class="tg-open-sample">${esc(sampleText)}</span>` +
          `</div>` +
          `<div class="tg-style-bar${hasStyle ? '' : ' is-placeholder'}">` +
            `<div class="tg-style-labels"><span>Agro <b>${agroText}</b></span><span>FC/Boom <b>${fcText}</b></span></div>` +
            `<div class="intel-style-track"><i class="seg-agro" data-w="${agro}"></i><i class="seg-hyb" data-w="${hyb}"></i><i class="seg-fc" data-w="${fc}"></i></div>` +
          `</div>` +
          `<div class="tg-weak-line">${weakLineHtml}</div>` +
        `</section>`,
      );
    }

    // 3) Civs más probables / Cruce en estructura fija de 3 slots horizontales + 1 línea inferior
    if (options.civRecommender || options.civCounterPick || (!knownCiv && options.rivalFavorites)) {
      const pred = r?.prediction?.status === 'ready' && r.prediction.top3?.length ? r.prediction
        : options.smartTips && tip?.prediction?.status === 'ready' && tip.prediction.top3?.length ? tip.prediction : null;
      const rec = options.civCounterPick ? (pickBestRecommendations(tip)[0] || null) : null;
      const showRecLine = Boolean(options.civCounterPick && (!knownCiv || state?.example || state?.previewPhase === 'prematch'));
      const stats = r?.mapStats;
      const observed = (stats?.civs || []).filter((row) => civSlug(row.name)).slice(0, 3);
      const count = stats?.civSampleGames ?? stats?.sampleGames;
      const tipCivs = (Array.isArray(tip?.likelyCivs) ? tip.likelyCivs : []).filter((row) => civSlug(row.name)).slice(0, 3);
      const isLoadingCivs = (!r || r.loading) && (!tip || tip.loading);

      let rawPills = [];
      let isRandom = false;
      if (pred && pred.top3?.length) {
        isRandom = pred.pool?.poolType === 'random';
        rawPills = pred.top3.filter((row) => civSlug(row.civ)).slice(0, 3).map((row) => ({
          civ: row.civ,
          name: locCiv(row.civ) || row.civ,
          val: `${number(row.probability)}%`,
        }));
      } else if (count > 0 && observed.length) {
        rawPills = observed.map((row) => ({
          civ: row.name,
          name: locCiv(row.name) || row.name,
          val: `${number(row.games)}/${number(count)}`,
        }));
      } else if (tipCivs.length) {
        rawPills = tipCivs.map((row) => ({
          civ: row.name,
          name: locCiv(row.name) || row.name,
          val: `${number(row.games)}/${number(row.sample)}`,
        }));
      }

      const fixedPills = [0, 1, 2].map((idx) => {
        const item = rawPills[idx];
        if (item) {
          return `<li class="tg-civ-pill${idx === 0 && !isRandom ? ' is-lead' : ''}">` +
            `${civBadge(item.civ)}<strong>${esc(item.name)}</strong><b>${esc(item.val)}</b>` +
          `</li>`;
        }
        return `<li class="tg-civ-pill is-skeleton">` +
          `<span class="tg-no-crest">·</span><strong>${isLoadingCivs ? '…' : '—'}</strong><b>—</b>` +
        `</li>`;
      }).join('');

      const lLetter = tr('prematch.lossLetter', 'D');
      let footerLine = '';
      if (showRecLine && rec) {
        const recParts = [];
        if (rec.mine) recParts.push(tr('prematch.tgYouPct', `Vos ${number(rec.mine.winRate)}%`, { p: number(rec.mine.winRate) }));
        if (rec.vsRival) recParts.push(`${number(rec.vsRival.lossRate)}% ${lLetter}`);
        if (rec.openingMatch) recParts.push(`vs ${openingDisplay(rec.openingMatch)}`);
        const recTag = rec.factors === 3 ? tr('prematch.tgPick3', 'Pick 3/3') : tr('prematch.tgPickSuggested', 'Pick sugerido');
        footerLine = `<div class="tg-counter-line is-rec" data-feature="civCounterPick"><span class="tg-counter-tag">${esc(recTag)}</span><strong>${civLabel(rec.civ)}</strong><small>${esc(recParts.slice(0, 2).join(' · '))}</small></div>`;
      } else if (knownCiv && options.civRecommender && matchup && !matchup.teamGame && matchup.games > 0) {
        footerLine = `<div class="tg-counter-line"><span class="tg-counter-tag">${esc(tr('prematch.tgDirectMatchup', 'Cruce directo'))}</span><strong>${civLabel(ownCiv)} vs ${civLabel(knownCiv)}</strong><small>${number(matchup.losses)}/${number(matchup.games)} ${esc(lLetter)}</small></div>`;
      } else if (knownCiv) {
        footerLine = `<div class="tg-counter-line"><span class="tg-counter-tag">${esc(tr('prematch.tgCivInGame', 'Civ en partida'))}</span><strong>${civLabel(knownCiv)}</strong><small>${esc(locMapName)}</small></div>`;
      } else if (isRandom) {
        footerLine = `<div class="tg-counter-line"><span class="tg-counter-tag">${esc(tr('prematch.poolRandom', 'Jugador Random'))}</span><small>${esc(tr('prematch.tgRandomPool', 'Selección variada (Random)'))}</small></div>`;
      } else if (isLoadingCivs) {
        footerLine = `<div class="tg-counter-line is-skeleton"><span class="tg-counter-tag">${esc(tr('prematch.profile', 'Perfil'))}</span><small>…</small></div>`;
      } else {
        footerLine = `<div class="tg-counter-line"><span class="tg-counter-tag">${esc(tr('prematch.likelyCivs', 'Selección en mapa'))}</span><small>${esc(locMapName)}</small></div>`;
      }

      blocks.push(
        `<section class="tg-block tg-civ-card" data-feature="civRecommender">` +
          `<div class="tg-sec-head"><span>${esc(isRandom ? tr('prematch.tgRandomPool', 'Selección variada (Random)') : tr('prematch.tgMostPlayed', `Sus civs más jugadas · ${locMapName}`, { map: locMapName }))}</span></div>` +
          `<ul class="tg-civ-pills">${fixedPills}</ul>` +
          footerLine +
        `</section>`,
      );
    }

    // 4) Par de KPIs lado a lado: Mapa + Cara a cara (altura fija de 3 líneas siempre)
    const kpiTiles = [];
    if (options.rivalFavorites) {
      const m = r?.mapStats;
      if (!r || r.loading) {
        kpiTiles.push(`<div class="tg-kpi-tile is-skeleton" data-feature="rivalFavorites"><span>En ${esc(locMapName)}</span><b>…</b><small>Consultando mapa…</small></div>`);
      } else if (m && m.games > 0) {
        const known = m.resultGames == null ? m.games : m.resultGames;
        const wins = Number(m.wins) || 0;
        const losses = Math.max(0, known - wins);
        const val = known < 5 ? `${number(wins)}/${number(known)}` : m.winRate != null ? `${number(m.winRate)}%` : '—';
        const tone = known >= 10 && m.winRate != null ? (m.winRate >= 58 ? 'is-win' : m.winRate <= 42 ? 'is-loss' : '') : '';
        kpiTiles.push(
          `<div class="tg-kpi-tile" data-feature="rivalFavorites">` +
            `<span>En ${esc(locMapName)}</span>` +
            `<b class="${tone}">${val}</b>` +
            `<small>${number(wins)}V – ${number(losses)}D (${number(known)} pj)</small>` +
          `</div>`,
        );
      } else {
        kpiTiles.push(`<div class="tg-kpi-tile" data-feature="rivalFavorites"><span>En ${esc(locMapName)}</span><b>—</b><small>Sin partidas</small></div>`);
      }
    }
    if (options.rivalH2H) {
      const h = r?.h2h;
      if (!r || r.loading || r.h2hPending || !h) {
        kpiTiles.push(`<div class="tg-kpi-tile is-skeleton" data-feature="rivalH2H"><span>Cara a cara</span><b>…</b><small>Buscando cruces…</small></div>`);
      } else if (h.games > 0) {
        const wins = Number(h.wins) || 0;
        const losses = Number(h.losses) || 0;
        const tone = h.games >= 2 ? (wins > losses ? 'is-win' : losses > wins ? 'is-loss' : '') : '';
        kpiTiles.push(
          `<div class="tg-kpi-tile" data-feature="rivalH2H">` +
            `<span>Cara a cara</span>` +
            `<b class="${tone}">${number(wins)}V – ${number(losses)}D</b>` +
            `<small>${number(h.games)} cruces${h.asAllies ? ` · ${number(h.asAllies)} aliado` : ''}</small>` +
          `</div>`,
        );
      } else {
        kpiTiles.push(
          `<div class="tg-kpi-tile" data-feature="rivalH2H">` +
            `<span>Cara a cara</span>` +
            `<b>0 – 0</b>` +
            `<small>${h.asAllies ? `${number(h.asAllies)} como aliados` : 'Sin cruces previos'}</small>` +
          `</div>`,
        );
      }
    }
    if (kpiTiles.length) {
      blocks.push(`<div class="tg-kpi-pair${kpiTiles.length === 1 ? ' is-single' : ''}">${kpiTiles.join('')}</div>`);
    }

    // 5) Últimas 5 partidas: siempre 5 casillas fijas desde el primer instante
    if (options.rivalCivs) {
      const rows = Array.isArray(r?.history) ? r.history.slice(0, 5) : [];
      const isLoadingHist = !r || r.loading;
      const strip = [0, 1, 2, 3, 4].map((idx) => {
        const row = rows[idx];
        if (row) {
          const wl = row.won === true ? 'V' : row.won === false ? 'D' : '·';
          const cls = row.won === true ? 'win' : row.won === false ? 'loss' : '';
          const cName = locCiv(row.civ) || row.civ || '?';
          const mName = locMap(row.mapName) || row.mapName || '';
          const tipText = `${cName} · ${wl}${mName ? ` · ${mName}` : ''}`;
          return `<li class="tg-last5-chip ${cls}" title="${esc(tipText)}">` +
            `<div class="tg-last5-top">${civBadge(row.civ) || '<span class="tg-no-crest">?</span>'}<b class="result-letter ${cls}">${wl}</b></div>` +
            `<small>${esc(cName)}</small>` +
          `</li>`;
        }
        return `<li class="tg-last5-chip is-skeleton">` +
          `<div class="tg-last5-top"><span class="tg-no-crest">·</span><b class="result-letter">·</b></div>` +
          `<small>${isLoadingHist ? '…' : '—'}</small>` +
        `</li>`;
      }).join('');
      blocks.push(
        `<section class="tg-block tg-last5-card" data-feature="rivalCivs">` +
          `<div class="tg-sec-head"><span>${esc(tr('postmatch.last5Title', 'Últimas 5 partidas'))}</span><small>${esc(tr('prematch.tgRecentLeft', 'Más reciente a la izq.'))}</small></div>` +
          `<ol class="tg-last5-strip">${strip}</ol>` +
        `</section>`,
      );
    }

    return `<article class="intel-rival is-tg">` +
      `<header class="tg-rival-head">` +
        `<div class="tg-rival-title">` +
          `<h3>${esc(name)}</h3>` +
          `${eloChip}` +
          `${civHeaderBadge}` +
        `</div>` +
        `<div class="tg-pills">${pills.join('')}</div>` +
      `</header>` +
      `<div class="tg-rival-body">${blocks.join('')}</div>` +
    `</article>`;
  }

  function renderRival({ entry, state, options = {}, detail = true } = {}) {
    const isTeamLayout = Array.isArray(state?.players) && state.players.length > 2;
    if (isTeamLayout) {
      return renderTeamRival({ entry, state, options, detail });
    }
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
    const isPreviewPrematch = Boolean(state?.example || state?.previewPhase === 'prematch');
    const isRandomRival = (r?.prediction?.pool?.poolType || tip?.prediction?.pool?.poolType) === 'random';
    const showPicks = (!knownCiv || isPreviewPrematch) && (options.civRecommender || options.rivalFavorites);
    if (showPicks) content.push(historicalCivBlock(tip, map, r, options));
    if (options.civCounterPick && (!knownCiv || isPreviewPrematch)) {
      const counter = lobbyRecommendBlock(tip, map, { showEmpty: isPreviewPrematch, isRandom: isRandomRival });
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
    return `<article class="intel-rival">${compactIdentity ? '' : `<header class="intel-identity"><div><h3>${esc(name)}</h3></div>${options.rosterDetails === false ? '' : `<p>${civLabel(civ, tr('prematch.noCivYet', 'Civilización sin confirmar'))}</p>`}</header>`}<div class="intel-rival-content">${content.join('')}</div><footer class="intel-source">${options.rosterDetails === false ? esc(tr('prematch.h2hTitle', 'Historial entre ambos')) : `${esc(tr('prematch.source', 'Historial: Companion · Replays: AoE2Insights'))}${r && r.partial ? ' · partial' : ''}`}</footer></article>`;
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
        <span>${esc(tr('postmatch.curveTitle', 'Pedidos acumulados · aldeanos y otras unidades'))}</span>
        <div class="pm-legend"><i class="leg-self"></i>${esc(tr('postmatch.you', 'Vos'))}${rPts.length ? `<i class="leg-rival"></i>${esc(rivalName || tr('postmatch.rival', 'Rival'))}` : ''}</div>
      </div>
      <svg class="pm-curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(tr('postmatch.curveTitle', 'Pedidos acumulados'))}">
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
  const REPORT_ICON_ALIASES = { opening: 'history', dark: 'building', feudal: 'barracks',
    imperial: 'crown', target: 'reviewAdvice', focus: 'reviewFocus' };
  function reportIcon(name) {
    return icon(REPORT_ICON_ALIASES[name] || name) || icon('medal');
  }
  const POSTMATCH_EMBLEMS = {
    combat: 'combat', sword: 'combat', shield: 'defense', matchup: 'army',
    castle: 'castle', building: 'castle', food: 'farms', wood: 'upgrades',
    blacksmith: 'upgrades', resources: 'economy', villager: 'economy', market: 'market',
    clock: 'tempo', age: 'tempo', trophy: 'record', crown: 'record', medal: 'record',
    opening: 'opening', map: 'map', relic: 'relics', scout: 'cavalry',
    trend: 'activity', focus: 'map', target: 'activity', navy: 'navy',
  };
  function postmatchEmblem(name) {
    const file = Object.hasOwn(POSTMATCH_EMBLEMS, name) ? POSTMATCH_EMBLEMS[name] : null;
    return file
      ? `<img class="pm-emblem" src="assets/icons/postmatch/${file}.webp" width="24" height="24" alt="" draggable="false"/>`
      : reportIcon(name);
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
          <span class="pm-icon-tile is-emerald">${postmatchEmblem('trophy')}</span>
          <div class="pm-trophy-copy">
            <span class="pm-trophy-pill">${esc(tr('postmatch.challengeDone', '★ RETO CUMPLIDO'))}</span>
            <b>${esc(chal.detail)}</b>
          </div>
          <span class="pm-trophy-tag">${esc(tr('postmatch.improveTag', '▲ MEJORA'))}</span>
        </section>`
      : heroLine
        ? `<section class="pm-trophy-banner is-record" aria-label="Récord personal">
            <span class="pm-icon-tile is-gold">${postmatchEmblem('trophy')}</span>
            <div class="pm-trophy-copy">
              <span class="pm-trophy-pill">${esc(tr('postmatch.personalBest', '★ DESTACADO PERSONAL'))}</span>
              <b>${esc(heroLine)}</b>
            </div>
          </section>`
        : (chal && chal.status === 'pending')
          ? `<section class="pm-trophy-banner is-pending" aria-label="Reto activo">
              <span class="pm-icon-tile is-gold">${postmatchEmblem('target')}</span>
              <div class="pm-trophy-copy">
                <span class="pm-trophy-pill">${esc(tr('postmatch.challengeActive', 'RETO EN CURSO'))}</span>
                <b>${esc(chal.detail)}</b>
              </div>
            </section>`
          : '';
    const focusObj = eng.narrative?.focus || eng.focus;
    const focusShort = focusObj
      ? `<div class="pm-focus"><span class="pm-icon-tile is-gold sm">${postmatchEmblem('focus')}</span><div><span>${esc(tr('postmatch.nextFocus', 'Foco próxima partida'))}</span><b>${esc(focusObj.title)}</b><p>${esc(focusObj.detail)}</p></div></div>` : '';

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

    // 2. Tira compacta de 4 Edades explícitas: Alta Edad · Feudal · Castillos · Imperial
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
        return `<article class="pm-stage-card${ready ? ` is-ready${showCommunity ? ` grade-${s.grade}` : ''}` : ' is-dim'}"${s.tip ? ` title="${esc(s.tip)}"` : ''}>
          <div class="pm-stage-top">
            <span class="pm-icon-tile ${tileTone} sm">${reportIcon(s.id)}</span>
            <div class="pm-stage-head">
              <span class="pm-stage-lbl">${esc(locAge(s.id, s.label))}</span>
              ${s.subtitle ? `<b class="pm-stage-sub">${esc(s.subtitle)}</b>` : ''}
            </div>
            ${stampHtml}
          </div>
          <div class="pm-stage-meta"><span>${esc(s.metric || '—')}</span>${deltaChip}</div>
        </article>`;
      }).join('')}</section>` : '';

    // 3. NARRATIVA EN 3 ZONAS (Legible en 3 segundos: Veredicto + Verde/Oro + Rojo sutil + Ámbar Foco)
    const rawNarrative = eng.narrative || null;
    const rawMedals = rawNarrative && Array.isArray(rawNarrative.medals)
      ? rawNarrative.medals
      : ((eng.positives && eng.positives.length) ? eng.positives : (eng.highlights || []).filter((h) => h.tone !== 'warn'));
    const filteredMedals = showPersonal
      ? rawMedals
      : rawMedals.filter((m) => !m.requiresHistory && !String(m.id || '').startsWith('evo-'));
    const fallbackEnginePos = (!showPersonal && filteredMedals.length < 3 && Array.isArray(eng.positives))
      ? eng.positives.filter((p) => !filteredMedals.some((m) => m.id === p.id || (m.domain && m.domain === p.domain)))
      : [];
    const medalsList = [...filteredMedals, ...fallbackEnginePos].slice(0, 3);

    const rawIssues = rawNarrative && Array.isArray(rawNarrative.issues)
      ? rawNarrative.issues
      : ((eng.negatives && eng.negatives.length) ? eng.negatives : (eng.highlights || []).filter((h) => h.tone === 'warn'));
    const filteredIssues = showPersonal
      ? rawIssues
      : rawIssues.filter((n) => !String(n.id || '').startsWith('evo-'));
    const fallbackEngineNeg = (!showPersonal && filteredIssues.length < 2 && Array.isArray(eng.negatives))
      ? eng.negatives.filter((n) => !filteredIssues.some((x) => x.id === n.id || (x.domain && x.domain === n.domain)))
      : [];
    const issuesList = [...filteredIssues, ...fallbackEngineNeg].slice(0, 2);

    const streakObj = showPersonal ? (rawNarrative?.streak || evo?.improvementStreak || null) : null;
    const verdictText = rawNarrative?.verdict || '';
    const verdictBar = (verdictText || streakObj)
      ? `<div class="pm-verdict-bar">
          ${verdictText ? `<p class="pm-verdict-copy">${esc(verdictText)}</p>` : ''}
          ${streakObj ? `<span class="pm-streak-pill">${reportIcon('trophy')}<span>${esc(streakObj.label)}</span></span>` : ''}
        </div>`
      : '';

    const medalCards = medalsList.length
      ? medalsList.map((m) => {
        const isGold = m.tier === 'gold';
        const tagText = m.tag === 'DESTACADO DE ORO' || m.tag === 'LOGRO DE PARTIDA' ? '' : (m.tag || '');
        const badgeName = m.badgeName && m.badgeName !== m.title ? `<span class="pm-medal-name">${esc(m.badgeName)}</span>` : '';
        const metricChip = m.metric ? `<strong class="pm-medal-metric">${esc(m.metric)}</strong>` : '';
        const deltaChip = m.delta ? `<small class="pm-medal-delta">${esc(m.delta)}</small>` : '';
        return `<article class="pm-medal-card ${isGold ? 'is-gold' : 'is-green'}">
          <span class="pm-icon-tile ${isGold ? 'is-gold' : 'is-emerald'} sm">${postmatchEmblem(m.domain === 'macro_tc' ? 'clock' : (m.icon || 'medal'))}</span>
          <div class="pm-medal-body">
            ${tagText || badgeName ? `<div class="pm-medal-kicker">${tagText ? `<span class="pm-medal-tag">${esc(tagText)}</span>` : ''}${badgeName}</div>` : ''}
            <b>${esc(m.title)}</b>
            ${m.detail ? `<p>${esc(m.detail)}</p>` : ''}
          </div>
          ${(metricChip || deltaChip) ? `<div class="pm-medal-stat">${metricChip}${deltaChip}</div>` : ''}
        </article>`;
      }).join('')
      : `<p class="pm-zone-empty">${esc(tr('postmatch.medalsBaseline', 'Sumá más minutos o partidas para desbloquear medallas de ejecución y récords personales.'))}</p>`;

    const issueCards = issuesList.length
      ? issuesList.map((n) => {
        const metricChip = n.metric ? `<strong class="pm-issue-metric">${esc(n.metric)}</strong>` : '';
        return `<article class="pm-issue-card">
          <span class="pm-icon-tile is-rose sm">${postmatchEmblem(n.icon || 'target')}</span>
          <div class="pm-issue-body">
            <div class="pm-issue-top"><b>${esc(n.title)}</b></div>
            ${n.detail ? `<p>${esc(n.detail)}</p>` : ''}
          </div>
          ${metricChip ? `<div class="pm-medal-stat">${metricChip}</div>` : ''}
        </article>`;
      }).join('')
      : `<div class="pm-issue-clean">${reportIcon('shield')}<span>${esc(tr('postmatch.noCriticalIssues', 'Sin cuellos de botella críticos detectados en esta partida.'))}</span></div>`;

    const narrativeGrid = `<section class="pm-narrative-grid" aria-label="Resumen de ejecución">
      <div class="pm-zone is-good">
        <div class="pm-zone-head">
          <span class="pm-zone-dot is-good" aria-hidden="true"></span>
          <h3>${esc(tr('postmatch.zoneGoodTitle', 'Lo que hiciste bien y mejoraste'))}</h3>
          <small>${medalsList.length ? `${medalsList.length} ${medalsList.length === 1 ? 'destacado' : 'destacados'}` : ''}</small>
        </div>
        <div class="pm-zone-list">${medalCards}</div>
      </div>
      <div class="pm-zone is-bad">
        <div class="pm-zone-head">
          <span class="pm-zone-dot is-bad" aria-hidden="true"></span>
          <h3>${esc(tr('postmatch.zoneBadTitle', 'Lo que te costó'))}</h3>
          <small>${issuesList.length ? `${issuesList.length} ${issuesList.length === 1 ? 'ajuste' : 'ajustes'}` : 'Limpio'}</small>
        </div>
        <div class="pm-zone-list">${issueCards}</div>
      </div>
    </section>`;

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
    const minutes = (eng.durationSeconds || result.durationSeconds) / 60;
    const villagerOrdersPerMinute = em.villagersPerMin?.current ??
      (Number.isFinite(minutes) && minutes > 0 && Number.isFinite(self.villagersOrdered)
        ? self.villagersOrdered / Math.max(1, minutes) : null);
    const utilBreakdown = [
      self.tcUtilizationDark != null ? `${locAge('dark', 'Alta')} ${dec(self.tcUtilizationDark, 1)}%` : null,
      self.tcUtilizationFeudal != null ? `${locAge('feudal', 'Feudal')} ${dec(self.tcUtilizationFeudal, 1)}%` : null,
    ].filter(Boolean).join(' · ') || null;
    const idleBreakdown = [
      self.tcIdleDarkSeconds != null ? `${locAge('dark', 'Alta')} ${fmtIdle(self.tcIdleDarkSeconds)}` : null,
      self.tcIdleFeudalSeconds != null ? `${locAge('feudal', 'Feudal')} ${fmtIdle(self.tcIdleFeudalSeconds)}` : null,
    ].filter(Boolean).join(' · ') || null;

    const evoGrid = `<div class="pm-kpi-grid">
      ${evoCard({ ...(em.tcUtilization || {}), label: tr('postmatch.tcUsage', 'Uso de TC') }, earlyUtil != null ? `${dec(earlyUtil, 1)}%` : '—', ' pts', false, utilBreakdown)}
      ${evoCard({ ...(em.tcIdleSeconds || {}), label: tr('postmatch.tcIdle', 'TC inactivo est.') }, fmtIdle(earlyIdle), ' s', true, idleBreakdown)}
      ${evoCard({ ...(em.villagersPerMin || {}), label: tr('postmatch.vilsPerMin', 'Ald. pedidos / min') }, villagerOrdersPerMinute != null ? dec(villagerOrdersPerMinute, 2) : '—', '/m')}
      ${evoCard({ ...(em.eapm || {}), label: tr('postmatch.eapm', 'Ritmo eAPM') }, self.eapm != null ? dec(self.eapm, 1) : '—', '')}
    </div>`;

    // 4. Duelo cara a cara con escudos + barras espejadas + carrera de edades
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
      const splitTone = aLead ? ' is-lead-self' : bLead ? ' is-lead-rival' : '';
      return `<div class="pm-duel-split${splitTone}">
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
    const rivalEarlyIdle = rival?.tcIdleEarlySeconds ?? rival?.tcIdleSeconds;
    const rivalTotalIdle = rival?.tcIdleTotalSeconds ?? rival?.tcIdleSeconds;
    const selfTp = self.techProfile || null;
    const rivalTp = rival?.techProfile || null;
    const selfTm = self.timings || null;
    const rivalTm = rival?.timings || null;

    const ageRaceRows = (selfTm && (selfTm.feudalSeconds || selfTm.castleSeconds || selfTm.imperialSeconds))
      ? [
        selfTm.feudalSeconds || rivalTm?.feudalSeconds
          ? { lbl: locAge('feudal', 'Feudal'), a: selfTm.feudalSeconds, b: rivalTm?.feudalSeconds }
          : null,
        selfTm.castleSeconds || rivalTm?.castleSeconds
          ? { lbl: locAge('castle', 'Castillos'), a: selfTm.castleSeconds, b: rivalTm?.castleSeconds }
          : null,
        selfTm.imperialSeconds || rivalTm?.imperialSeconds
          ? { lbl: locAge('imperial', 'Imperial'), a: selfTm.imperialSeconds, b: rivalTm?.imperialSeconds }
          : null,
      ].filter(Boolean)
      : [];

    const isTeamGame = Boolean(eng.isTeamGame || c.mode?.size === 'team');
    const ageRaceBox = ageRaceRows.length
      ? `<div class="pm-race-box">
          <div class="pm-queue-head">
            <span>${esc(isTeamGame ? tr('postmatch.yourAgesTitle', 'Tus llegadas de edad') : tr('postmatch.ageRaceTitle', 'Carrera de edades'))}</span>
            <b>${isTeamGame ? esc(tr('postmatch.you', 'Vos')) : `${esc(tr('postmatch.you', 'Vos'))} vs ${esc(rivalLabel)}`}</b>
          </div>
          <div class="pm-race-rows">${ageRaceRows.map((row) => {
            const diff = (!isTeamGame && row.a != null && row.b != null) ? Math.round(row.b - row.a) : null;
            const cls = diff == null || Math.abs(diff) < 5 ? '' : diff > 0 ? ' is-win' : ' is-loss';
            const diffTxt = diff == null || Math.abs(diff) < 5
              ? ''
              : `<em class="pm-race-diff${cls}">${diff > 0 ? `−${fmtIdle(diff)} antes` : `+${fmtIdle(Math.abs(diff))} tarde`}</em>`;
            return `<div class="pm-race-row${cls}">
              <b class="is-self">${row.a != null ? clock(row.a) : '—'}</b>
              <span>${esc(row.lbl)}${diffTxt}</span>
              <b class="is-rival">${!isTeamGame && row.b != null ? clock(row.b) : '—'}</b>
            </div>`;
          }).join('')}</div>
        </div>`
      : '';

    const duelBlock = `<div class="pm-duel">
      ${duelFaceHead}
      ${duelRow(tr('postmatch.duelVils', 'Aldeanos pedidos'), self.villagersOrdered, rival?.villagersOrdered, `${number(self.villagersOrdered)} · ${self.townCenters} TC`, rival ? `${number(rival.villagersOrdered)} · ${rival.townCenters} TC` : '')}
      ${earlyIdle != null ? duelRow(tr('postmatch.duelIdleEarly', 'TC est. · Alta y Feudal'), earlyIdle, rivalEarlyIdle, fmtIdle(earlyIdle), rivalEarlyIdle != null ? fmtIdle(rivalEarlyIdle) : '', true) : ''}
      ${totalIdle != null ? duelRow(tr('postmatch.duelIdleTotal', 'TC est. · hasta últ. uso'), totalIdle, rivalTotalIdle, fmtIdle(totalIdle), rivalTotalIdle != null ? fmtIdle(rivalTotalIdle) : '', true) : ''}
      ${duelRow(tr('postmatch.duelArmy', 'Pedidos de unidades'), self.militaryOrdered, rival?.militaryOrdered, number(self.militaryOrdered), rival ? number(rival.militaryOrdered) : '')}
    </div>`;

    // 5. Mejoras económicas, Herrería acorde a TU composición y Macro del replay
    const mb = self.macroBuilds || null;
    const ar = selfTp?.armyRelevance || null;
    const bsContextLabel = ar && ar.primaryLabel
      ? `${tr('postmatch.bsTechs', 'Herrería y Combate')} · ${ar.primaryLabel} (${number(ar.relevantCount)}/${number(ar.relevantExpected)} clave)`
      : tr('postmatch.bsTechs', 'Herrería y Combate');
    const techChips = (names, kind) => (Array.isArray(names) && names.length)
      ? names.slice(0, 8).map((nm) => `<span class="pm-tech-chip is-${kind}">${esc(nm)}</span>`).join('')
      : `<span class="pm-tech-none">${esc(tr('postmatch.noneDetected', 'Sin mejoras detectadas'))}</span>`;
    const techBox = (selfTp || mb)
      ? `<div class="pm-tech-box">
          <div class="pm-queue-head">
            <span>${esc(tr('postmatch.techsTitle', 'Mejoras clave y macro'))}</span>
            <b>${selfTp ? `${number(selfTp.ecoCount || 0)} Eco · ${number(selfTp.blacksmithCount || 0)} Herrería${selfTp.combatKeyCount ? ` · ${number(selfTp.combatKeyCount)} Clave` : ''}` : ''}</b>
          </div>
          ${selfTp ? `<div class="pm-tech-group"><small>${esc(tr('postmatch.ecoTechs', 'Economía'))}</small><div class="pm-tech-chips">${techChips(selfTp.ecoNames, 'eco')}</div></div>` : ''}
          ${selfTp ? `<div class="pm-tech-group"><small>${esc(bsContextLabel)}</small><div class="pm-tech-chips">${techChips([...(selfTp.blacksmithNames || []), ...(selfTp.combatKeyNames || [])], 'bs')}</div></div>` : ''}
          ${mb ? `<div class="pm-macro-pills">
            <span><b>${number(mb.farms || 0)}</b> ${esc(tr('postmatch.farms', 'granjas'))}</span>
            <span><b>${number(mb.houses || 0)}</b> ${esc(tr('postmatch.houses', 'casas'))}</span>
            <span><b>${number(mb.castles || 0)}</b> ${esc(tr('postmatch.castles', 'castillos'))}</span>
            <span><b>${number(self.townCenters || 1)}</b> TC</span>
          </div>` : ''}
        </div>`
      : '';

    // 6. Producción y colas militares (saturación + edificios recomendados + Mercado decodificado + composición)
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

    // 7. Bloque entrenador (bache exacto + patrón repetido)
    const gapRow = self.biggestTcGap
      ? `<div class="pm-coach-row is-gap"><span class="pm-icon-tile is-rose sm">${reportIcon('clock')}</span><div><span class="pm-coach-k">${esc(tr('postmatch.biggestGap', 'Mayor bache de TC'))}</span><b>${esc(self.biggestTcGap.summary)}</b></div></div>` : '';
    const pat = showPersonal ? evo?.recurringPattern : null;
    const patRow = pat
      ? `<div class="pm-coach-row is-warn"><span class="pm-icon-tile is-amber sm">${reportIcon('target')}</span><div><span class="pm-coach-k">${esc(pat.title)}</span><b>${esc(pat.detail)}</b></div></div>` : '';
    const coachPanel = (gapRow || patRow)
      ? `<div class="pm-coach-stack">${gapRow}${patRow}</div>` : '';

    const cm = self.combatMicro || {};
    const microVal = cm.controlSharePct != null ? `${dec(cm.controlSharePct, 1)}%` : `${number((self.habits?.attackMove || 0) + (self.habits?.patrol || 0))}`;
    const microSub = cm.moveOrders > 0 ? `<small>${number(cm.combatOrders || 0)}/${number(cm.moveOrders)}</small>` : '';
    const tcCycleVal = cm.tcReturnSec != null ? `${number(cm.tcReturnSec)} s` : '—';
    const fourthHabit = self.eapmRetentionPct != null
      ? `<div><span>${esc(tr('postmatch.lateStamina', 'Ritmo Late'))}</span><b>${number(self.eapmRetentionPct)}% <small>${dec(self.eapmEarly, 0)}→${dec(self.eapmLate, 0)}</small></b></div>`
      : `<div><span>${esc(tr('postmatch.market', 'Mercado'))}</span><b>${number(self.habits?.market || 0)} <small>${esc(tr('postmatch.ops', 'ops'))}</small></b></div>`;
    const habitsStrip = `<div class="pm-habits">
      <div><span>APM / eAPM</span><b>${self.apm != null ? dec(self.apm, 1) : '—'} <small>/ ${self.eapm != null ? dec(self.eapm, 1) : '—'}</small></b></div>
      <div><span>${esc(tr('postmatch.combatMicro', 'Micro combate'))}</span><b>${microVal} ${microSub}</b></div>
      <div><span>${esc(tr('postmatch.tcCycle', 'Ciclo TC'))}</span><b>${tcCycleVal}</b></div>
      ${fourthHabit}
    </div>`;

    // Nivel 2: Detalle técnico organizado en 3 pestañas limpias (visible en Relic Launcher; oculto en overlay por CSS)
    const duelRightHtml = `${ageRaceBox}${coachPanel}`;
    const techLeftHtml = techBox || queueBox;
    const techRightHtml = techBox ? `${queueBox}${coachPanel}` : coachPanel;
    const deepDive = `<section class="pm-deep-dive" aria-label="Análisis técnico detallado">
      <div class="pm-tabs" role="tablist">
        <button type="button" class="pm-tab is-active" role="tab" aria-selected="true" data-pm-tab="evo">${esc(tr('postmatch.tabEvo', 'Evolución y Curva'))}</button>
        <button type="button" class="pm-tab" role="tab" aria-selected="false" data-pm-tab="duel">${esc(tr('postmatch.tabDuel', 'Duelo vs Rival'))}</button>
        <button type="button" class="pm-tab" role="tab" aria-selected="false" data-pm-tab="tech">${esc(tr('postmatch.tabTech', 'Mejoras, Colas y Combate'))}</button>
      </div>
      <div class="pm-columns">
        <div class="pm-tab-pane is-active" role="tabpanel" data-pm-pane="evo">
          <div class="pm-eyebrow"><span>${esc(evoTitle)}</span><i></i></div>
          ${evoGrid}
          <div class="pm-pane-grid is-evo">
            <div class="pm-col">${productionCurveSvg(eng.timeline, rivalLabel)}</div>
            <div class="pm-col">${habitsStrip}</div>
          </div>
        </div>
        <div class="pm-tab-pane" role="tabpanel" data-pm-pane="duel">
          <div class="pm-eyebrow"><span>${esc(tr('postmatch.duelTitle', 'Duelo de partida'))}</span><i></i></div>
          <div class="pm-pane-grid${duelRightHtml ? '' : ' is-single'}">
            <div class="pm-col">${duelBlock}</div>
            ${duelRightHtml ? `<div class="pm-col">${duelRightHtml}</div>` : ''}
          </div>
        </div>
        <div class="pm-tab-pane" role="tabpanel" data-pm-pane="tech">
          <div class="pm-eyebrow"><span>${esc(tr('postmatch.techPanelTitle', 'Tecnologías, producción y colas'))}</span><i></i></div>
          <div class="pm-pane-grid${techRightHtml ? '' : ' is-single'}">
            <div class="pm-col">${techLeftHtml}</div>
            ${techRightHtml ? `<div class="pm-col">${techRightHtml}</div>` : ''}
          </div>
          ${report.combat ? combatBlock(report.combat) : ''}
        </div>
      </div>
    </section>
    <p class="pm-overlay-hint">${esc(tr('postmatch.overlayDeepHint', 'Curva, duelo vs rival, mejoras eco/herrería y colas completas en Relic → Postmatch'))}</p>`;

    return `<div class="pm-v2 detail is-${result.status === 'won' ? 'won' : result.status === 'lost' ? 'lost' : 'neutral'}">
      ${header}
      ${verdictBar}
      ${trophyBanner}
      ${openingBar}
      ${stageStrip}
      ${narrativeGrid}
      ${focusShort}
      ${deepDive}
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
  function fmtRelativeTime(ts) {
    if (!Number.isFinite(ts) || ts <= 0) return '';
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSec < 60) return tr('central.justNow', 'recién');
    const mins = Math.round(diffSec / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days <= 14) return `${days}d`;
    try {
      return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  }

  function renderRecentMatchesList(matches = [], { selectedMatchId = null, mode = 'list', limit = 10 } = {}) {
    const list = (Array.isArray(matches) ? matches : []).slice(0, limit);
    if (!list.length) {
      return `<div class="central-empty-matches"><p>${esc(tr('central.noMatchesYet', 'Todavía no hay partidas recientes registradas para esta cuenta.'))}</p></div>`;
    }
    const items = list.map((m) => {
      const isSelected = selectedMatchId != null && String(m.matchId) === String(selectedMatchId);
      const outcomeCls = m.won === true ? 'is-win' : m.won === false ? 'is-loss' : 'is-pending';
      const outcomeLetter = m.won === true
        ? tr('central.winShort', 'V')
        : m.won === false
          ? tr('central.lossShort', 'D')
          : '·';
      const mapLabel = locMap(m.mapName) || m.mapName || '—';
      const myCivName = locCiv(m.myCiv) || m.myCiv || '?';
      const rivalCivName = locCiv(m.rivalCiv) || m.rivalCiv || '?';
      const diffTxt = m.myRatingDiff != null
        ? `<span class="rm-diff ${m.myRatingDiff >= 0 ? 'win' : 'loss'}">${m.myRatingDiff >= 0 ? '+' : ''}${m.myRatingDiff}</span>`
        : '';
      const ratingTxt = m.myRating != null ? `<span class="rm-elo">${number(m.myRating)}</span>` : '';
      const durTxt = m.durationSeconds != null ? clock(m.durationSeconds) : '';
      const timeTxt = fmtRelativeTime(m.finishedAt || m.startedAt);
      const extraTag = m.extraRivals > 0 ? ` +${m.extraRivals}` : '';
      const replayBadge = m.hasTelemetry
        ? `<span class="rm-telemetry is-ready" title="${esc(tr('central.replayReady', 'Replay analizado'))}">★ Replay</span>`
        : `<span class="rm-telemetry">${esc(tr('central.viewReport', 'Ver informe'))}</span>`;

      return `<button type="button" class="rm-card ${outcomeCls}${isSelected ? ' is-selected' : ''}" data-match-id="${esc(m.matchId)}" aria-pressed="${isSelected}">
        <span class="rm-outcome">${esc(outcomeLetter)}</span>
        <span class="rm-matchup">
          <span class="rm-civ-pair">${civBadge(m.myCiv)}<span class="rm-vs">vs</span>${civBadge(m.rivalCiv)}</span>
          <span class="rm-names">
            <strong>${esc(myCivName)} <small>vs</small> ${esc(m.rivalName || 'Rival')}${esc(extraTag)}</strong>
            <small>${esc(mapLabel)} · ${esc(m.modeLabel || 'Partida')}${rivalCivName && rivalCivName !== '?' ? ` · ${esc(rivalCivName)}` : ''}</small>
          </span>
        </span>
        <span class="rm-meta">
          <span class="rm-rating-row">${ratingTxt}${diffTxt}</span>
          <small>${[durTxt, timeTxt].filter(Boolean).join(' · ')}</small>
        </span>
        ${replayBadge}
      </button>`;
    }).join('');

    return `<div class="rm-list rm-mode-${esc(mode)}" role="list">${items}</div>`;
  }

  function fmtShortDate(ts) {
    if (!Number.isFinite(ts) || ts <= 0) return '';
    try {
      return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  }

  function renderInteractiveEloChart(mode, eloRange = '30') {
    const allPts = Array.isArray(mode.eloSeries) ? mode.eloSeries.filter((p) => Number.isFinite(p.rating)) : [];
    const ladderLabel = mode.label || 'RM 1v1';
    if (allPts.length < 2) {
      return `<section class="cx-card cx-chart-card">
        <div class="central-chart-empty"><p>${esc(tr('central.eloChartEmpty', 'Jugá al menos 2 partidas rankeadas en este modo para trazar tu curva de ELO.'))}</p></div>
      </section>`;
    }

    const activeRange = (eloRange === '100' && allPts.length > 100)
      ? '100'
      : (eloRange === 'all' && allPts.length > 30)
        ? 'all'
        : '30';
    const pts = activeRange === 'all'
      ? allPts
      : activeRange === '100'
        ? allPts.slice(-100)
        : allPts.slice(-30);

    const w = 800, h = 210, padL = 12, padR = 48, padT = 22, padB = 26;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const vals = pts.map((p) => p.rating);
    const rawMin = Math.min(...vals), rawMax = Math.max(...vals);
    const padVal = Math.max(10, Math.round((rawMax - rawMin) * 0.14));
    const min = rawMin - padVal;
    const max = rawMax + padVal;
    const span = Math.max(20, max - min);

    const coords = pts.map((p, i) => {
      const x = padL + (i / (pts.length - 1)) * innerW;
      const y = padT + (1 - (p.rating - min) / span) * innerH;
      return {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        rating: p.rating,
        diff: p.diff,
        won: p.won,
        date: fmtShortDate(p.startedAt) || `#${i + 1}`,
      };
    });

    const peakIdx = coords.reduce((best, cur, idx) => (cur.rating >= coords[best].rating ? idx : best), 0);
    const peakPt = coords[peakIdx];
    const lastPt = coords[coords.length - 1];
    const firstPt = coords[0];
    const splineD = coords.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
    const areaD = `${splineD} L ${lastPt.x} ${padT + innerH} L ${firstPt.x} ${padT + innerH} Z`;

    const gridSteps = [0, 0.5, 1].map((ratio) => {
      const y = Math.round((padT + ratio * innerH) * 10) / 10;
      const val = Math.round(max - ratio * span);
      return `<g class="elo-grid-row">
        <line class="cx-grid-line" x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" />
        <text class="cx-y-tick" x="${w - padR + 8}" y="${y + 3.5}">${number(val)}</text>
      </g>`;
    }).join('');

    const net = lastPt.rating - firstPt.rating;
    const netPill = `<span class="cx-delta ${net > 0 ? 'win' : net < 0 ? 'loss' : 'neutral'}">${net > 0 ? '+' : ''}${net} ELO en el tramo</span>`;
    const rangePills = allPts.length > 30 ? `<div class="central-range-pills" role="group" aria-label="Rango de partidas">
      <button type="button" class="central-range-btn${activeRange === '30' ? ' active' : ''}" aria-pressed="${activeRange === '30'}" data-elo-range="30">30 puntos</button>
      ${allPts.length > 100 ? `<button type="button" class="central-range-btn${activeRange === '100' ? ' active' : ''}" aria-pressed="${activeRange === '100'}" data-elo-range="100">100 puntos</button>` : ''}
      <button type="button" class="central-range-btn${activeRange === 'all' ? ' active' : ''}" aria-pressed="${activeRange === 'all'}" data-elo-range="all">${allPts.length} disponibles</button>
    </div>` : `<span class="cx-meta-pill">${pts.length} registros</span>`;

    const formPips = (mode.recentForm || []).map((f) =>
      `<span class="cx-pip ${f.won ? 'win' : 'loss'}" title="${esc(`${f.won ? 'Victoria' : 'Derrota'}${f.rating ? ` · ${f.rating} ELO` : ''}${f.diff ? ` (${f.diff >= 0 ? '+' : ''}${f.diff})` : ''}`)}">${f.won ? 'V' : 'D'}</span>`
    ).join('');
    const last10Txt = mode.last10
      ? `<span class="cx-last10">Últ. ${mode.last10.games}: <b>${mode.last10.wins}V-${mode.last10.losses}D</b>${mode.last10.netElo != null ? ` · <em class="${mode.last10.netElo >= 0 ? 'win' : 'loss'}">${mode.last10.netElo >= 0 ? '+' : ''}${mode.last10.netElo}</em>` : ''}</span>`
      : '';

    const serializedPts = esc(JSON.stringify(coords));

    return `<section class="cx-card cx-chart-card">
      <header class="cx-chart-head">
        <div class="cx-chart-title">
          <h3>Evolución de ELO</h3>
          <div class="cx-chart-nums">
            <strong>${number(lastPt.rating)}</strong>
            ${netPill}
          </div>
        </div>
        ${rangePills}
      </header>
      <div class="cx-chart-stage" tabindex="0" aria-label="Curva de ELO. Usá las flechas para recorrer los registros." data-chart-points="${serializedPts}" data-chart-w="${w}" data-chart-h="${h}">
        <svg class="cx-chart-svg central-elo-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Curva de evolución de ELO">
          <defs>
            <linearGradient id="cxEloFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#e6c882" stop-opacity="0.30" />
              <stop offset="70%" stop-color="#c7ad76" stop-opacity="0.06" />
              <stop offset="100%" stop-color="#c7ad76" stop-opacity="0.0" />
            </linearGradient>
            <linearGradient id="cxEloStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#a58c56" />
              <stop offset="50%" stop-color="#e5c882" />
              <stop offset="100%" stop-color="#f9e3a6" />
            </linearGradient>
          </defs>
          ${gridSteps}
          <line class="cx-peak-line" x1="${padL}" y1="${peakPt.y}" x2="${w - padR}" y2="${peakPt.y}" />
          <path class="cx-elo-area" d="${areaD}" fill="url(#cxEloFill)" />
          <path class="cx-elo-line" d="${splineD}" stroke="url(#cxEloStroke)" />
          <line class="cx-hover-line" x1="${lastPt.x}" y1="${padT}" x2="${lastPt.x}" y2="${padT + innerH}" opacity="0" />
          <circle class="cx-hover-ring" cx="${lastPt.x}" cy="${lastPt.y}" r="8" opacity="0" />
          <circle class="cx-hover-dot" cx="${lastPt.x}" cy="${lastPt.y}" r="4.5" opacity="0" />
          <circle class="central-elo-halo" cx="${lastPt.x}" cy="${lastPt.y}" r="8" />
          <circle class="cx-last-dot" cx="${lastPt.x}" cy="${lastPt.y}" r="4.4" />
          <text class="cx-x-tick" x="${padL}" y="${h - 6}">${esc(firstPt.date)}</text>
          <text class="cx-x-tick mid" x="${Math.round(padL + innerW * 0.5)}" y="${h - 6}">${esc(coords[Math.floor(coords.length / 2)]?.date || '')}</text>
          <text class="cx-x-tick end" x="${w - padR}" y="${h - 6}">${esc(lastPt.date)}</text>
        </svg>
        <div class="cx-tooltip" hidden>
          <div class="cx-tt-top"><strong class="cx-tt-elo">—</strong><span class="cx-tt-diff"></span></div>
          <small class="cx-tt-date">—</small>
        </div>
      </div>
      <p class="cx-chart-coverage">${esc(ladderLabel)} · ${pts.length} puntos · ${esc(firstPt.date)} a ${esc(lastPt.date)} · Pico del tramo ${number(rawMax)}</p>
      ${formPips ? `<footer class="cx-chart-foot">
        <span class="cx-foot-label">Forma reciente</span>
        <div class="cx-pips">${formPips}</div>
        ${last10Txt}
      </footer>` : ''}
    </section>`;
  }

  function renderGlobalLadderComparison(allLadders = []) {
    if (!Array.isArray(allLadders) || !allLadders.length) return '';
    const maxRating = Math.max(1600, ...allLadders.map((l) => l.peak || l.rating || 0));
    const rows = allLadders.map((l) => {
      const curW = Math.max(14, Math.round(((l.rating || 0) / maxRating) * 100));
      const peakW = Math.max(curW, Math.round(((l.peak || l.rating || 0) / maxRating) * 100));
      const wrTone = l.winRate >= 55 ? 'win' : l.winRate < 46 ? 'loss' : 'neutral';
      return `<button type="button" class="global-ladder-row is-clickable" data-central-mode="${esc(l.id)}">
        <div class="global-ladder-label">
          <strong>${esc(l.label)}</strong>
          <small>${number(l.games)} pj${l.rank ? ` · #${number(l.rank)}` : ''}</small>
        </div>
        <div class="global-ladder-track-wrap">
          <div class="global-ladder-track">
            <i class="global-bar-peak" data-w="${peakW}"></i>
            <i class="global-bar-cur" data-w="${curW}"></i>
          </div>
          <div class="global-ladder-nums">
            <span><b>${number(l.rating)}</b> ELO · pico <em>${number(l.peak || l.rating)}</em></span>
            <span class="${wrTone}"><b>${l.winRate ?? '—'}% WR</b> (${number(l.wins)}V-${number(l.losses)}D)</span>
          </div>
        </div>
      </button>`;
    }).join('');

    return `<section class="cx-card">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">RESUMEN DE LADDERS ACTIVOS</span>
          <h3>ELO actual y pico histórico por modo</h3>
        </div>
        <span class="cx-meta-pill">Tocá cualquier modo para entrar</span>
      </header>
      <div class="global-ladders-list">${rows}</div>
    </section>`;
  }

  function renderMasteryRows(items = [], { kind = 'civ' } = {}) {
    if (!Array.isArray(items) || !items.length) {
      return `<p class="intel-muted">${esc(tr('central.noDataYet', 'Sin datos suficientes en este modo.'))}</p>`;
    }
    return items.map((item) => {
      const wr = item.winRate;
      const wrTone = wr >= 55 ? 'win' : wr < 45 ? 'loss' : 'neutral';
      const title = kind === 'civ'
        ? (locCiv(item.civ) || item.civ)
        : (locMap(item.mapName) || item.mapName);
      const crest = kind === 'civ' ? civBadge(item.civ) : icon('map');
      return `<div class="cx-entity-row">
        <span class="central-entity-crest${kind === 'map' ? ' is-map' : ''}">${crest}</span>
        <div class="cx-entity-main">
          <div class="cx-entity-top">
            <strong>${esc(title)} <small class="pick-share">${number(item.games)} partidas</small></strong>
            <span class="cx-entity-stat"><small>${number(item.wins)} V / ${number(item.knownGames ?? (item.wins + item.losses))} con resultado</small> <b class="${wrTone}">${wr != null ? `${wr}%` : '—'}</b></span>
          </div>
          ${wr != null ? `<div class="central-bar-track has-mid" aria-hidden="true"><i class="bar-${wrTone === 'win' ? 'emerald' : wrTone === 'loss' ? 'rose' : 'gold'}" data-w="${Math.max(0, Math.min(100, wr))}"></i></div>` : '<small class="cx-missing-result">Sin resultados confirmados</small>'}
        </div>
      </div>`;
    }).join('');
  }

  function renderCentralDashboard(data, options = {}) {
    if (!data || !data.ok) {
      return `<div class="empty-report">
        <img class="product-icon" src="assets/icons/account.png" alt="" draggable="false">
        <h3>${esc(data?.error || tr('central.emptyTitle', 'Conectá tu cuenta para ver tu Central'))}</h3>
        <p>${esc(tr('central.emptyDesc', 'Tu evolución de ELO, civilizaciones históricas, mapas y scouting de jugadores aparecerán acá.'))}</p>
      </div>`;
    }

    const modeId = (options.activeModeId && data.modes && data.modes[options.activeModeId])
      ? options.activeModeId
      : (data.defaultModeId || 'global');
    const mode = (data.modes && data.modes[modeId]) || data.modes?.global || {};
    const ladder = mode.ladder || {};
    const stats = mode.stats || {};
    const ins = mode.insights || null;
    const eloRange = options.eloRange || '30';
    const civSort = options.civSort === 'wr' && stats.topCivsByWr?.length ? 'wr' : 'games';
    const mapSort = options.mapSort === 'wr' && stats.topMapsByWr?.length ? 'wr' : 'games';
    const lmWindow = Number(options.lmWindow) === 20 ? 20 : 10;
    const isExternal = data.isOwnProfile === false;

    // 1. HERO CARD + KPIs + SEGMENTED MODE TABS (un solo bloque protagonista, cero redundancia)
    const initials = String(data.alias || '?').replace(/[|·]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
    const streakVal = ladder.streak;
    const streakPill = streakVal > 0
      ? `<span class="cx-streak win">+${streakVal}V</span>`
      : streakVal < 0
        ? `<span class="cx-streak loss">${streakVal}D</span>`
        : '';

    const kpi4Title = ins?.eapm?.avgSelf != null ? 'eAPM MEDIO' : 'PARTIDAS';
    const kpi4Val = ins?.eapm?.avgSelf != null
      ? `${dec(ins.eapm.avgSelf, 1)}`
      : `${number(ladder.games || data.totalProfileGames || 0)}`;
    const kpi4Sub = ins?.eapm?.avgSelf != null
      ? [`${number(ins.eapm.sampleCount)} replays`, ins.eapm.avgRival != null ? `rival ${dec(ins.eapm.avgRival, 1)}` : null].filter(Boolean).join(' · ')
      : `${stats.totalDistinctCivs || 0} civs jugadas`;

    const modePills = (data.availableModes || []).map((id) => {
      const m = data.modes && data.modes[id];
      if (!m || !m.ladder) return '';
      const active = id === modeId;
      const meta = id === 'global' ? `${number(m.ladder.games)} pj` : (m.ladder.rating ? number(m.ladder.rating) : '—');
      return `<button type="button" class="cx-mode-tab${active ? ' is-active' : ''}" data-central-mode="${esc(id)}" aria-pressed="${active}">
        <span>${esc(m.label)}</span>
        <b>${esc(meta)}</b>
      </button>`;
    }).filter(Boolean).join('');

    const heroCard = `<section class="cx-hero${isExternal ? ' is-external' : ''}">
      <div class="cx-hero-top">
        <div class="cx-hero-id">
          <div class="cx-avatar" aria-hidden="true">${esc(initials)}</div>
          <div class="cx-id-copy">
            <div class="cx-name-row">
              <h2>${esc(data.alias || `#${data.profileId}`)}</h2>
              ${data.clan ? `<span class="identity-clan">[${esc(data.clan)}]</span>` : ''}
              ${data.countryIcon || data.country ? `<span class="identity-country">${esc(data.countryIcon || '')} ${esc((data.country || '').toUpperCase())}</span>` : ''}
            </div>
            <div class="cx-id-meta">
              <span class="mono">#${esc(data.profileId)}</span>
              ${data.totalProfileGames ? `<span>· <b>${number(data.totalProfileGames)}</b> partidas totales</span>` : ''}
              ${data.dropRate != null ? `<span>· ${dec(data.dropRate, 1)}% drops</span>` : ''}
            </div>
          </div>
        </div>
        <div class="cx-kpi-row">
          <div class="cx-kpi is-gold">
            <span>${modeId === 'global' ? 'MEJOR ELO' : `ELO ${esc(mode.label)}`}</span>
            <strong>${ladder.rating != null ? number(ladder.rating) : '—'}</strong>
            <small>${ladder.peak ? `Pico ${number(ladder.peak)}` : 'Sin pico'}</small>
          </div>
          <div class="cx-kpi">
            <span>VICTORIAS</span>
            <strong class="${ladder.winRate >= 54 ? 'win' : ladder.winRate != null && ladder.winRate < 46 ? 'loss' : ''}">${ladder.winRate != null ? `${ladder.winRate}%` : '—'}${streakPill}</strong>
            <small>${number(ladder.wins || 0)}V - ${number(ladder.losses || 0)}D</small>
          </div>
          <div class="cx-kpi">
            <span>${modeId === 'global' ? 'MEJOR RANKING' : 'RANKING DEL MODO'}</span>
            <strong>${ladder.rank ? `#${number(ladder.rank)}` : '—'}</strong>
            <small>${ladder.ladderPercentile ? `Top ${dec(ladder.ladderPercentile, 1)}%` : (ladder.rankModeLabel || 'Sin clasificar')}</small>
          </div>
          <div class="cx-kpi">
            <span>${esc(kpi4Title)}</span>
            <strong>${esc(kpi4Val)}</strong>
            <small>${esc(kpi4Sub)}</small>
          </div>
        </div>
      </div>
      <div class="cx-mode-bar" role="group" aria-label="Modo de estadísticas">${modePills}</div>
    </section>`;

    // 2. GRÁFICO PRINCIPAL (Curva interactiva con hover crosshair o Comparativa Global)
    const chartBlock = modeId === 'global'
      ? renderGlobalLadderComparison(mode.ladderComparison || data.allLadders)
      : renderInteractiveEloChart(mode, eloRange);

    // 3. MAESTRÍA HISTÓRICA (Civs + Mapas sobre TODA la historia, con switch Más jugadas / Mejor WR)
    const civList = civSort === 'wr' ? stats.topCivsByWr : stats.topCivs;
    const mapList = mapSort === 'wr' ? stats.topMapsByWr : stats.topMaps;
    const civToggle = stats.topCivsByWr?.length >= 2 ? `<div class="cx-sort-pills">
      <button type="button" class="cx-sort-btn${civSort === 'games' ? ' active' : ''}" aria-pressed="${civSort === 'games'}" data-civ-sort="games">Más jugadas</button>
      <button type="button" class="cx-sort-btn${civSort === 'wr' ? ' active' : ''}" aria-pressed="${civSort === 'wr'}" data-civ-sort="wr">Mejor %</button>
    </div>` : '';
    const mapToggle = stats.topMapsByWr?.length >= 2 ? `<div class="cx-sort-pills">
      <button type="button" class="cx-sort-btn${mapSort === 'games' ? ' active' : ''}" aria-pressed="${mapSort === 'games'}" data-map-sort="games">Más jugados</button>
      <button type="button" class="cx-sort-btn${mapSort === 'wr' ? ' active' : ''}" aria-pressed="${mapSort === 'wr'}" data-map-sort="wr">Mejor %</button>
    </div>` : '';

    const masteryGrid = `<div class="cx-grid-2">
      <section class="cx-card cx-civs-card">
        <header class="cx-card-head">
          <div>
            <h3>Civilizaciones</h3>
            <p class="cx-card-context">${stats.sourceScope === 'all-time' ? 'Historial disponible' : 'Muestra reciente'} · ${number(stats.totalCivGames || 0)} partidas</p>
          </div>
          ${civToggle}
        </header>
        <div class="cx-entity-list">${renderMasteryRows(civList, { kind: 'civ' })}</div>
      </section>

      <section class="cx-card cx-maps-card">
        <header class="cx-card-head">
          <div>
            <h3>Mapas</h3>
            <p class="cx-card-context">${stats.sourceScope === 'all-time' ? 'Historial disponible' : 'Muestra reciente'} · ${number(stats.totalMapGames || 0)} partidas</p>
          </div>
          ${mapToggle}
        </header>
        <div class="cx-entity-list">${renderMasteryRows(mapList, { kind: 'map' })}</div>
      </section>
    </div>`;

    // 4. EVOLUCIÓN + ESTILO (Compacto, limpio, sin cajas deformadas) + RADAR HONESTO
    const bvnRows = (modeId === 'global' ? [] : mode.beforeVsNow || []).map((item) => {
      const neutral = item.id === 'eapm';
      const tone = neutral ? 'neutral' : (item.improved ? 'win' : 'loss');
      return `<div class="cx-trend-row">
        <div class="cx-trend-copy">
          <strong>${esc(tr(item.labelKey, item.fallbackLabel))}</strong>
          <small>${esc(item.sampleText || '')}</small>
        </div>
        <div class="cx-trend-nums">
          <span class="cx-before">${esc(item.beforeText)}</span>
          <i aria-hidden="true">→</i>
          <b class="cx-now">${esc(item.nowText)}</b>
          <span class="cx-delta ${tone}">${neutral ? '' : (item.improved ? '▲' : '▼')} ${esc(item.deltaText)}</span>
        </div>
      </div>`;
    }).join('');

    const eloMatchup = ins?.eloMatchup;
    const extraHighlights = [
      eloMatchup?.vsHigher?.games >= 2 ? `<div class="cx-stat-chip"><span>vs Mayor ELO</span><b class="${eloMatchup.vsHigher.winRate >= 50 ? 'win' : 'loss'}">${eloMatchup.vsHigher.winRate}%</b><small>${eloMatchup.vsHigher.wins}V-${eloMatchup.vsHigher.losses}D</small></div>` : '',
      eloMatchup?.vsLower?.games >= 2 ? `<div class="cx-stat-chip"><span>vs Menor ELO</span><b class="${eloMatchup.vsLower.winRate >= 55 ? 'win' : ''}">${eloMatchup.vsLower.winRate}%</b><small>${eloMatchup.vsLower.wins}V-${eloMatchup.vsLower.losses}D</small></div>` : '',
      ins?.eapm?.outpacedGames >= 3 ? `<div class="cx-stat-chip"><span>Al superar en eAPM</span><b class="${ins.eapm.outpacedWinRate >= 55 ? 'win' : ''}">${ins.eapm.outpacedWinRate}%</b><small>${ins.eapm.outpacedGames} replays</small></div>` : '',
      ...(ins?.byOpenness || []).slice(0, 2).map((o) => `<div class="cx-stat-chip"><span>Mapas ${esc(o.kind)}</span><b class="${o.winRate >= 54 ? 'win' : o.winRate < 46 ? 'loss' : ''}">${o.winRate}%</b><small>${o.wins}V-${o.losses}D</small></div>`),
    ].filter(Boolean).join('');

    const agro = ins?.agroShare ?? null;
    const boom = ins?.boomShare ?? null;
    const hyb = (agro != null && boom != null) ? Math.max(0, 100 - agro - boom) : 0;
    const openingsCompact = (ins?.openings || []).slice(0, 4).map((op) => `<div class="cx-op-row">
      <strong>${esc(op.name)}</strong>
      <div class="central-bar-track sm"><i class="bar-gold" data-w="${Math.max(8, Math.min(100, op.share))}"></i></div>
      <span>${op.games} pj · <b class="${op.winRate >= 55 ? 'win' : op.winRate < 45 ? 'loss' : ''}">${op.winRate != null ? `${op.winRate}%` : '—'}</b></span>
    </div>`).join('');

    const durationRows = (mode.durationAnalysis?.buckets || []).filter((b) => b.games > 0);
    const durationHtml = durationRows.length ? `<div class="cx-duration-list">${durationRows.map((b) => {
      const resolved = b.wins + b.losses;
      const winRate = resolved > 0 ? Math.round(100 * b.wins / resolved) : null;
      return `<div class="cx-duration-row"><strong>${esc(b.label)}</strong>
        <span>${number(b.wins)} V · ${number(b.losses)} D</span>
        ${winRate === null ? '<b>—</b>' : `<div class="central-bar-track has-mid" aria-hidden="true"><i class="bar-gold" data-w="${winRate}"></i></div><b>${winRate}%</b>`}</div>`;
    }).join('')}</div>` : '';

    const insightsRow = (bvnRows || extraHighlights || openingsCompact || durationHtml) ? `<div class="cx-grid-2">
      <section class="cx-card">
        <header class="cx-card-head">
          <div>
            <h3>Forma y aperturas</h3>
          </div>
          <span class="cx-meta-pill">${esc(mode.label)}</span>
        </header>
        ${bvnRows ? `<div class="cx-trend-list">${bvnRows}</div>` : ''}
        ${extraHighlights ? `<div class="cx-stat-chips">${extraHighlights}</div>` : ''}
        ${agro != null ? `<div class="cx-style-wrap">
          <div class="intel-style-labels"><span>Presión temprana <b>${agro}%</b></span><span>Fast Castle <b>${boom}%</b></span></div>
          <div class="intel-style-track"><i class="seg-agro" data-w="${agro}"></i><i class="seg-hyb" data-w="${hyb}"></i><i class="seg-fc" data-w="${boom}"></i></div>
          ${openingsCompact ? `<div class="cx-op-list">${openingsCompact}</div>` : ''}
        </div>` : ''}
      </section>

      ${durationHtml ? `<section class="cx-card cx-duration-card">
        <header class="cx-card-head">
          <div>
            <h3>Resultados por duración</h3>
            <p class="cx-card-context">${esc(mode.durationAnalysis.sourceLabel || '')}</p>
          </div>
        </header>
        ${durationHtml}
      </section>` : ''}
    </div>` : '';

    // 5. ALIADOS & RIVALES FRECUENTES (Grid limpio y clickeable para explorar otros perfiles)
    const allies = Array.isArray(stats.allies) ? stats.allies.slice(0, 6) : [];
    const opps = Array.isArray(stats.opponents) ? stats.opponents.slice(0, 6) : [];
    const renderSocialGrid = (list) => `<div class="cx-social-grid">${list.map((p) => {
      const wrTone = p.winRate >= 55 ? 'win' : p.winRate < 45 ? 'loss' : 'neutral';
      return `<button type="button" class="social-player-chip" data-scout-profile="${esc(p.profileId)}" data-scout-name="${esc(p.name)}" title="Explorar perfil de ${esc(p.name)}">
        <span class="social-player-left">
          <span class="social-flag">${esc(p.countryIcon || (p.country ? p.country.toUpperCase() : '·'))}</span>
          <span class="social-name">
            <strong>${esc(p.name)}</strong>
            <small>${number(p.games)} pj · ${p.wins}V-${p.losses}D</small>
          </span>
        </span>
        <span class="social-right"><b class="${wrTone}">${p.winRate != null ? `${p.winRate}%` : '—'}</b><em>→</em></span>
      </button>`;
    }).join('')}</div>`;

    const socialSection = (allies.length || opps.length) ? `<section class="cx-card">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">EXPLORADOR DE JUGADORES · HISTÓRICO EN ${esc(mode.label)}</span>
          <h3>${allies.length ? 'Aliados y rivales frecuentes' : 'Rivales frecuentes'}</h3>
        </div>
        <span class="cx-meta-pill">Tocá un jugador para abrir su perfil</span>
      </header>
      ${allies.length ? `<div class="cx-social-group"><span class="central-mini-k">ALIADOS FRECUENTES</span>${renderSocialGrid(allies)}</div>` : ''}
      ${opps.length ? `<div class="cx-social-group"><span class="central-mini-k">RIVALES FRECUENTES</span>${renderSocialGrid(opps)}</div>` : ''}
    </section>` : '';

    // 2b. ÚLTIMA PARTIDA VS PROMEDIO (Últ. 10 / Últ. 20 seleccionable)
    const lm = mode.lastMatchVsAvg || null;
    const lmBucket = lm && lm.windows ? (lm.windows[lmWindow] || lm.windows[10]) : null;
    const lmSummary = lm?.summary || null;
    const lastMatchBlock = (lm && lmBucket && lmBucket.metrics.length) ? (() => {
      const outcomeCls = lmSummary.won === true ? 'win' : lmSummary.won === false ? 'loss' : 'neutral';
      const outcomeLbl = lmSummary.won === true ? 'Victoria' : lmSummary.won === false ? 'Derrota' : 'Última partida';
      const subBits = [
        lmSummary.mapName ? (locMap(lmSummary.mapName) || lmSummary.mapName) : null,
        lmSummary.myCiv ? `${locCiv(lmSummary.myCiv) || lmSummary.myCiv}${lmSummary.rivalCiv ? ` vs ${locCiv(lmSummary.rivalCiv) || lmSummary.rivalCiv}` : ''}` : null,
        lmSummary.ratingDiff != null ? `${lmSummary.ratingDiff >= 0 ? '+' : ''}${lmSummary.ratingDiff} ELO` : null,
      ].filter(Boolean).join(' · ');
      const cards = lmBucket.metrics.map((m) => {
        const tone = m.neutral ? 'neutral' : (m.improved ? 'win' : 'loss');
        const arrow = m.neutral ? '' : (m.improved ? '▲ ' : '▼ ');
        const avgPrefix = m.id === 'windowWr' ? 'Balance' : 'Promedio';
        return `<div class="cx-lm-metric">
          <div class="cx-lm-top">
            <span>${esc(m.label)}</span>
            <b class="cx-delta ${tone}">${arrow}${esc(m.deltaText)}</b>
          </div>
          <div class="cx-lm-vals">
            <strong>${esc(m.latestText)}</strong>
            <small>${avgPrefix}: <em>${esc(m.avgText)}</em></small>
          </div>
          <small class="cx-lm-sub">${esc(m.sampleText)}</small>
        </div>`;
      }).join('');

      return `<section class="cx-card cx-lm-card">
        <header class="cx-card-head">
          <div>
            <h3>Última partida y forma reciente</h3>
            <div class="cx-lm-title-row">
              <span class="cx-lm-outcome ${outcomeCls}">${esc(outcomeLbl)}</span>
              ${subBits ? `<span class="cx-lm-meta">${esc(subBits)}</span>` : ''}
            </div>
          </div>
          <div class="cx-sort-pills" role="group" aria-label="Ventana de promedio">
            <button type="button" class="cx-sort-btn${lmWindow === 10 ? ' active' : ''}" data-lm-window="10">Últ. 10</button>
            <button type="button" class="cx-sort-btn${lmWindow === 20 ? ' active' : ''}" data-lm-window="20">Últ. 20</button>
          </div>
        </header>
        <p class="cx-card-context">Comparación contra tus últimas ${lmWindow} partidas · ${esc(lmSummary.modeLabel || mode.label)}</p>
        <div class="cx-lm-grid">${cards}</div>
      </section>`;
    })() : '';

    return `<div class="central-dashboard cx-v4${isExternal ? ' is-external-profile' : ''}" data-active-mode="${esc(modeId)}">
      ${heroCard}
      ${chartBlock}
      ${lastMatchBlock}
      ${masteryGrid}
      ${insightsRow}
      ${socialSection}
    </div>`;
  }

  const api = {
    renderRival,
    renderPostMatch,
    renderAutomaticOpportunities,
    renderSmartBuildOrder,
    renderRecentMatchesList,
    renderCentralDashboard,
    configure,
    civLabel,
    civRelation,
    esc,
    icon,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TacticalUI = api;
})(typeof globalThis === 'object' ? globalThis : this);
