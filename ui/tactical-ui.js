(function (root) {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value) => {
    if (!Number.isFinite(Number(value)) || value == null) return '—';
    const loc = (typeof getI18n === 'function' && getI18n()?.getLocale?.()) || 'es-AR';
    return Number(value).toLocaleString(loc === 'es-MX' ? 'es-AR' : loc);
  };
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
    ['pikes', 'Pike Skirm', 'Piqueros + Guerrilleros', 'Piqueros y guerrilleros', 'Pica + honda', 'Picas y honderos'],
    ['elephants', 'Elephant Rush', 'Elefantes', 'Rush de elefantes'],
    ['siege', 'Scorpions & Rams', 'Escorpiones', 'Escorpiones y arietes'],
    ['serjeants', 'Serjeant Rush', 'Serjeants', 'Rush de serjeants'],
    ['scouts-archers', 'Scouts into Archers', 'Scouts → Arqueros', 'Scouts + arq.', 'Scouts hacia arqueros'],
    ['drush-archers', 'Drush Archers', 'Drush + Arqueros', 'Drush arq.', 'Drush con arqueros'],
    ['drush-castle', 'Drush FC', 'Drush fast castle', 'Drush → FC'],
    ['swords-scouts', 'M@A Scouts', 'M@A con scouts'],
    ['swords-archers', 'M@A Archers', 'Hombres de armas + Arqueros', 'M@A arq.', 'M@A con arqueros'],
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
  let mapArtCatalog = null;
  if (typeof require === 'function') {
    try { mapArtCatalog = require('../src/map-art.json'); } catch { mapArtCatalog = null; }
  }
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
    if (options.mapArt && typeof options.mapArt === 'object') mapArtCatalog = options.mapArt;
    if (options.i18n !== undefined) activeI18n = options.i18n;
  }
  function mapArtSlug(name) {
    if (!name || !mapArtCatalog) return null;
    const key = String(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    return (key && mapArtCatalog[key]) || null;
  }
  function mapBadge(name, size = 'sm') {
    const slug = mapArtSlug(name);
    if (slug) {
      return `<img class="map-art-thumb is-${esc(size)}" src="assets/maps/${esc(slug)}.webp" alt="" title="${esc(locMap(name) || name)}" draggable="false" decoding="async" />`;
    }
    return icon('map');
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
    return `<img class="civ-badge" src="assets/civs/${slug}.png" alt="" title="${esc(locCiv(name) || name)}" draggable="false" decoding="async" />`;
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
    if (!m || !m.games) return note(mapName || tr('pm.currentMap', 'Mapa actual'), report.error ? tr('pm.histRetryErr', 'No se pudo consultar el historial. Se reintentará.') : 'Sin partidas públicas de este mapa en la muestra.', 'empty', 'rivalFavorites');
    const known = m.resultGames == null ? m.games : m.resultGames;
    const wins = m.wins;
    const value = known < 5 ? `${number(wins)}/${number(known)}` : m.winRate == null ? '—' : `${number(m.winRate)}%`;
    const resultLabel = report.mode?.size === 'team' ? tr('prematch.whoTeam', 'de su equipo') : tr('prematch.whoRival', 'del rival');
    const choices = m.civSampleGames;
    const civCoverage = Number.isFinite(choices) && choices > 0
      ? `<p class="intel-muted">Civilización identificada en <b>${number(choices)}</b> de ${number(m.sampleGames)} partidas revisadas.</p>`
      : '<p class="intel-muted">Sin elecciones de civ suficientes en la muestra.</p>';
    return section(tr('postmatch.mapRecordIn', `En ${locMap(m.name || mapName) || 'este mapa'}`, { map: locMap(m.name || mapName) || mapName }),
      `<p class="intel-statline"><b>${value}</b> · ${esc(tr('prematch.mapWinsLine', `${number(wins)} victorias ${resultLabel} en ${number(known)} resultados conocidos`, { wins: number(wins), who: resultLabel, known: number(known) }))}${report.partial ? ' · parcial' : ''}</p>` +
      (detail ? civCoverage : ''), 'map', '', 'rivalFavorites');
  }
  function historyBlock(report) {
    const title = tr('postmatch.last5Title', 'Últimas 5 partidas');
    const pending = dataState(report, title, 'rivalCivs'); if (pending) return pending;
    const rows = Array.isArray(report.history) ? report.history.slice(0, 5) : [];
    if (!rows.length) return note(title, report.error ? tr('pm.histUnavail', 'El historial no está disponible ahora.') : tr('pm.noRecentMode', 'Sin partidas recientes de este modo.'), 'empty', 'rivalCivs');
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
    if (o.modeUnavailable) return note(title, tr('pm.noReplayMode', 'No hay análisis de replays para este modo.'), 'empty', 'rivalOpenings');
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
    if (h.modeUnavailable || h.modePending) return note(title, h.modePending ? tr('pm.waitConfirmedMode', 'Esperando el modo confirmado.') : 'Sin historial compatible con este modo.', 'empty', 'rivalH2H');
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
    'Scout rush': tr('pm.scoutScoutRush', 'Al explorar, ¿se confirma un establo temprano?'),
    'Archer rush': tr('pm.scoutArcherRush', 'Al explorar, ¿se confirma una galería temprana?'),
    'Man at arms rush': tr('pm.scoutMaaRush', 'Al explorar, ¿aparecen milicias tempranas?'),
    Drush: tr('pm.scoutDrush', 'Al explorar, ¿aparecen milicias antes de Feudal?'),
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
    return `<div class="intel-dossier-strip" aria-label="${esc(tr('pm.rivalDossierAria', 'Perfil táctico del rival'))}">${cells.join('')}</div>`;
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
    if (tip.modePending || tip.modeUnavailable) return note(title, tip.modePending ? tr('pm.waitConfirmedMode', 'Esperando el modo confirmado.') : tr('pm.noCompatReplays', 'Este modo todavía no tiene replays compatibles.'), 'empty', 'smartTips');
    if (tip.error && !tip.sample) return note(title, tr('pm.replaySrcNoResp', 'La fuente de replays no respondió.'), 'empty', 'smartTips');
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
    const proCnt = tip.proCounterOpening;
    const proCounterLine = proCnt && proCnt.responseLabel
      ? `<p class="intel-weakness is-pro-counter"><span>${esc(tr('prematch.proCounterTitle', proCnt.isCivSpecific ? 'Respuesta Pro con tu civ' : 'Respuesta Pro contra su apertura'))}</span><b>${esc(proCnt.responseLabel)}</b> · ${number(proCnt.winRatePct)}% victoria (${number(proCnt.games)} pj)</p>`
      : '';
    return section(title, read + `<p class="intel-signal-scope">${esc(scope)}</p>` +
      split + weaknessLine + proCounterLine +
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
    const title = tr('pm.rivalTopCivs', 'Sus civs más jugadas');
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
    if (!civSlug(ownCiv)) return note(title, tr('pm.waitOwnCiv', 'Esperando tu civilización.'), 'empty', 'civRecommender');
    if (!tip || tip.loading) return note(title, 'Buscando el cruce para este mapa…', 'loading', 'civRecommender');
    if (tip.modePending || tip.modeUnavailable) return note(title, 'Sin historial compatible con el modo.', 'empty', 'civRecommender');
    if (tip.error) return note(title, tr('pm.replaySrcNoResp', 'La fuente de replays no respondió.'), 'empty', 'civRecommender');
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
  function fmtBoClock(sec) {
    const s = Math.max(0, Math.round(Number(sec || 0)));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function renderArmedBuildOrder(payload) {
    const st = payload.currentStep || {};
    const nx = payload.nextStep || null;
    const alloc = st.alloc || { food: 6, wood: 0, gold: 0, stone: 0 };
    const stepNum = Number(payload.activeStepIdx || 0) + 1;
    const total = Number(payload.totalSteps || 1);
    const iconsHtml = (st.icons || ['villager']).map((key) => `<span class="build-resource ${esc(key)}" title="${esc(RESOURCE_LABELS[key] || key)}">${icon(key)}</span>`).join('');
    const nextDelta = nx ? Math.max(0, Number(nx.gameSec || 0) - Number(payload.elapsedGameSec || 0)) : 0;
    const windowSteps = (payload.steps || []).slice(Math.max(0, stepNum - 1), Math.min(total, stepNum + 2));

    return `<section class="smart-build is-armed-bo">
      <header>
        ${icon('age')}
        <div>
          <span>${payload.liveTestActive ? 'ORDEN EN PRUEBA · OVERLAY EN VIVO' : 'ORDEN ARMADA EN PARTIDA'} · ${civLabel(payload.ownCiv)}</span>
          <h3>${esc(payload.name || 'Orden personalizada')}</h3>
        </div>
        <b>${fmtBoClock(payload.elapsedGameSec)} · POB ${esc(st.pop || '—')}</b>
      </header>
      <div class="bo-live-alloc">
        <span class="bo-alloc-pill is-food">${icon('food')}<small>Comida</small><b>${Number(alloc.food || 0)}</b></span>
        <span class="bo-alloc-pill is-wood">${icon('wood')}<small>Madera</small><b>${Number(alloc.wood || 0)}</b></span>
        <span class="bo-alloc-pill is-gold">${icon('gold')}<small>Oro</small><b>${Number(alloc.gold || 0)}</b></span>
        <span class="bo-alloc-pill is-stone">${icon('stone')}<small>Piedra</small><b>${Number(alloc.stone || 0)}</b></span>
      </div>
      <div class="bo-step-current">
        <div class="bo-step-head">
          <span class="bo-step-badge">PASO ${stepNum}/${total} · ${fmtBoClock(st.gameSec)}</span>
          <div class="build-icons">${iconsHtml}</div>
        </div>
        <strong>${esc(st.title || st.text || '')}</strong>
        ${st.note ? `<p>${esc(st.note)}</p>` : ''}
      </div>
      ${nx ? `<div class="bo-step-next"><span>Siguiente (${fmtBoClock(nx.gameSec)} · Pob ${esc(nx.pop || '—')}): <b>${esc(nx.title || nx.text || '')}</b></span><i>en ${fmtBoClock(nextDelta)}</i></div>` : ''}
      <ol class="build-checkpoints bo-mini-list">${windowSteps.map((item, idx) => {
        const realIdx = Math.max(0, stepNum - 1) + idx + 1;
        const isCur = realIdx === stepNum;
        return `<li class="${isCur ? 'is-active' : ''}"><span class="build-index">${realIdx}</span><p><b>${fmtBoClock(item.gameSec)} (${esc(item.pop)})</b> · ${esc(item.title || item.text || '')}</p></li>`;
      }).join('')}</ol>
    </section>`;
  }
  function renderSmartBuildOrder(payload, { library = false } = {}) {
    if (!payload) return '';
    if (payload.status === 'locked') return note('Smart Build Order', payload.message);
    if (payload.kind === 'custom-armed') return renderArmedBuildOrder(payload);
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
      const sampleText = bestCount ? bestCount : isLoading ? tr('pm.checking', 'Consultando…') : tr('pm.noFixedPattern', 'Sin patrón fijo');
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
    return `<article class="intel-rival">${compactIdentity ? '' : `<header class="intel-identity"><div><h3>${esc(name)}</h3></div>${options.rosterDetails === false ? '' : `<p>${civLabel(civ, tr('prematch.noCivYet', 'Civilización sin confirmar'))}</p>`}</header>`}<div class="intel-rival-content">${content.join('')}</div><footer class="intel-source">${options.rosterDetails === false ? esc(tr('prematch.h2hTitle', 'Historial entre ambos')) : `${esc(tr('prematch.source', 'Historial de partidas · Replays analizados'))}${r && r.partial ? ' · parcial' : ''}`}</footer></article>`;
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
      `<section class="review-combat"><h3>${icon('combat')}${esc(tr('pm.combatByAge', 'Combate por edad'))}</h3><p>Durante tus edades · eliminaciones enemigas atribuidas y pérdidas propias</p><table><caption class="sr-only">Bajas de aldeanos y militares según la edad del jugador</caption><thead><tr><th rowspan="2" scope="col">Edad</th><th colspan="2" scope="colgroup">Aldeanos</th><th colspan="2" scope="colgroup">Militares</th></tr><tr><th scope="col">Eliminados</th><th scope="col">Perdidos</th><th scope="col">Eliminados</th><th scope="col">Perdidos</th></tr></thead><tbody>${stages}</tbody></table>${trade}<p class="review-combat-note">Las pérdidas incluyen borrado propio y causas sin autor. Pesqueros, comercio y otras categorías se conservan aparte.${combat.status === 'partial' ? ' ≥ indica un mínimo observado; — indica cobertura incompleta.' : ''}${totals.unattributedDeaths ? ` ${number(totals.unattributedDeaths)} pérdidas sin autor identificado.` : ''}${totals.unclassifiedDeaths ? ` ${number(totals.unclassifiedDeaths)} bajas sin categoría; no se calcula valor ni logros afectados.` : ''}</p></section>`;
  }
  function executionBlock(ratings, comparison) {
    if (!ratings) return '';
    const economic = ratings.economic || {};
    const cards = [economic, ratings.micro, ratings.decisions].filter((rating) => rating?.grade).map((rating) =>
      `<article class="review-skill ${rating.grade ? 'graded' : ''}"><span>${icon(rating.id === 'economic' ? 'villager' : rating.id === 'micro' ? 'sword' : 'compass')}</span><div><small>${esc(rating.label)}</small><b>${esc(rating.grade || '—')}</b><p>${rating.grade ? esc(rating.scopeLabel) : 'Sin evaluación disponible'}</p></div></article>`).join('');
    const highlights = comparison && (ratings.personalHighlights || []).length
      ? `<div class="review-personal-highlights">${ratings.personalHighlights.map((item) => `<p>${icon('trend')}<span><b>${esc(item.title)}</b>${esc(item.detail)}</span></p>`).join('')}</div>` : '';
    if (!cards && !highlights) return '';
    return `<section class="review-execution"><h3>${icon('medal')}${esc(tr('pm.yourExecution', 'Tu ejecución'))}</h3><div class="review-skills">${cards}</div><p class="review-execution-note">${esc(economic.detail)}${economic.grade ? ` Escala personal S–D · ${number(economic.minimumStageSampleSize)} referencias mínimas por etapa.` : ''}</p>${highlights}</section>`;
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
    return `<section class="review-impact"><h3>${icon('combat')}${esc(tr('pm.tradesByAge', 'Intercambio por edad'))}</h3><p>Eliminaciones enemigas / pérdidas propias · tramos con cobertura validada</p>${rows}</section>`;
  }
  function compactExecution(ratings) {
    const stages = (ratings?.economic?.stages || []).filter((stage) => stage.grade);
    if (!stages.length) return '';
    const grades = stages.map((stage) => `<div><strong>${esc(stage.grade)}</strong><span>${esc(stage.label)}</span><small>${number(stage.sampleSize)} comparables</small></div>`).join('');
    const highlight = ratings.personalHighlights?.[0];
    return `<section class="review-impact"><h3>${icon('medal')}${esc(tr('pm.yourEcoExec', 'Tu ejecución económica'))}</h3><p>Frente a tus propias partidas comparables.</p>
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
    const title = arena ? tr('pm.prepBeforeCastle', 'Preparación antes de Castillos') : tr('pm.reviewFeudalClose', 'Revisá el cierre de Feudal');
    return `<section class="review-episode"><h3>${icon('combat')}${title}</h3>
      <p>Pedidos registrados hasta ${clock(window.cutoffMs / 1000)}</p>
      <div class="review-episode-sides">${column('Vos', window.self)}${column('Rival', window.rival)}</div>
      <p>${arena ? tr('pm.arenaReplayHint', 'En el replay, revisá qué inversión se concretó después y qué economía pudo sostenerla.') : 'En el replay, revisá qué ejército llegó a presionar y qué pudo seguir produciendo cada jugador.'}</p>
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
        <span>${esc(tr('postmatch.curveTitle', 'Ritmo de actividad por tramo'))}</span>
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

  /**
   * Genera una curva Bezier cúbica suave (Catmull-Rom amortiguada) sin sobreimpulsos
   * fuera de [minY, maxY] para las líneas de eAPM minuto a minuto.
   */
  function smoothCatmullRomPath(pts, minY, maxY) {
    if (!pts || !pts.length) return '';
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
    const clampY = (y) => Math.round(Math.max(minY, Math.min(maxY, y)) * 10) / 10;
    const r = (v) => Math.round(v * 10) / 10;
    let d = `M ${r(pts[0][0])} ${clampY(pts[0][1])}`;
    const tension = 0.22;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = r(p1[0] + (p2[0] - p0[0]) * tension);
      const cp1y = clampY(p1[1] + (p2[1] - p0[1]) * tension);
      const cp2x = r(p2[0] - (p3[0] - p1[0]) * tension);
      const cp2y = clampY(p2[1] - (p3[1] - p1[1]) * tension);
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${r(p2[0])} ${clampY(p2[1])}`;
    }
    return d;
  }

  function renderAllPlayersEapmBlock(eapmComparison, selfTimings = null) {
    const players = Array.isArray(eapmComparison?.players) ? eapmComparison.players : [];
    if (players.length < 2) return '';
    const totalMinutes = Math.max(2, Number(eapmComparison.totalMinutes) || players[0].series.length);

    let rawMax = 30;
    for (const p of players) {
      for (const v of (p.series || [])) if (v > rawMax) rawMax = v;
      if (p.max > rawMax) rawMax = p.max;
    }
    const yStep = rawMax > 140 ? 40 : 20;
    const yMax = Math.max(40, Math.ceil((rawMax * 1.12) / yStep) * yStep);
    const yTicks = [];
    for (let v = 0; v <= yMax; v += yStep) yTicks.push(v);

    // 1. Panel izquierdo: Curvas suaves de eAPM minuto a minuto
    const lw = 560, lh = 236, lPadL = 36, lPadR = 16, lPadT = 22, lPadB = 28;
    const lInnerW = lw - lPadL - lPadR;
    const lInnerH = lh - lPadT - lPadB;
    const xForMin = (m) => lPadL + (totalMinutes > 1 ? (m / (totalMinutes - 1)) * lInnerW : 0);
    const yForVal = (v, padT = lPadT, innerH = lInnerH) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * innerH;

    const xTickStep = totalMinutes <= 14 ? 2 : totalMinutes <= 34 ? 4 : totalMinutes <= 60 ? 6 : 10;
    const xTicks = [];
    for (let m = 0; m < totalMinutes; m += xTickStep) xTicks.push(m);
    if (xTicks[xTicks.length - 1] !== totalMinutes - 1 && (totalMinutes - 1 - xTicks[xTicks.length - 1]) >= Math.max(2, Math.floor(xTickStep / 2))) {
      xTicks.push(totalMinutes - 1);
    }

    const lGridY = yTicks.map((v) => {
      const y = Math.round(yForVal(v) * 10) / 10;
      return `<line class="pm-apm-grid-h${v === 0 ? ' is-base' : ''}" x1="${lPadL}" y1="${y}" x2="${lw - lPadR}" y2="${y}" />
        <text class="pm-apm-ytick" x="${lPadL - 8}" y="${y + 3}">${v}</text>`;
    }).join('');

    const lGridX = xTicks.map((m) => {
      const x = Math.round(xForMin(m) * 10) / 10;
      return `<text class="pm-apm-xtick" x="${x}" y="${lh - 8}">${m}m</text>`;
    }).join('');

    // Marcadores sutiles de edades propias (Feudal / Castillos / Imperial)
    const ageMarks = [];
    if (selfTimings) {
      const addAge = (sec, code) => {
        if (!Number.isFinite(sec) || sec <= 0) return;
        const m = sec / 60;
        if (m > 0.8 && m < totalMinutes - 0.8) ageMarks.push({ m, code });
      };
      addAge(selfTimings.feudalSeconds, 'F');
      addAge(selfTimings.castleSeconds, 'C');
      addAge(selfTimings.imperialSeconds, 'I');
    }
    const ageMarksSvg = ageMarks.map((am) => {
      const x = Math.round(xForMin(am.m) * 10) / 10;
      return `<g class="pm-apm-age-mark">
        <line x1="${x}" y1="${lPadT}" x2="${x}" y2="${lPadT + lInnerH}" />
        <rect class="pm-apm-age-pill" x="${x - 8}" y="${lPadT - 15}" width="16" height="12" rx="3" />
        <text x="${x}" y="${lPadT - 6}">${am.code}</text>
      </g>`;
    }).join('');

    // Dibujar rivales/aliados primero y al jugador propio encima para nitidez editorial
    const drawOrder = [...players].sort((a, b) => (a.isSelf ? 1 : 0) - (b.isSelf ? 1 : 0));
    const curvesSvg = drawOrder.map((p) => {
      const series = Array.isArray(p.series) ? p.series : [];
      const smoothed = series.map((val, i) => {
        if (series.length < 4 || i === 0 || i === series.length - 1) return val;
        return val * 0.62 + series[i - 1] * 0.19 + series[i + 1] * 0.19;
      });
      const pts = smoothed.map((val, m) => [xForMin(m), yForVal(val)]);
      const pathD = smoothCatmullRomPath(pts, lPadT, lPadT + lInnerH);
      const areaD = pts.length >= 2
        ? `${pathD} L ${Math.round(pts[pts.length - 1][0] * 10) / 10} ${lPadT + lInnerH} L ${Math.round(pts[0][0] * 10) / 10} ${lPadT + lInnerH} Z`
        : '';
      const cls = `pm-c${p.color}${p.isSelf ? ' is-self' : ''}`;
      return `<g class="pm-apm-series ${cls}" data-apm-slot="${p.slot}">
        ${areaD ? `<path class="pm-apm-area" d="${areaD}" />` : ''}
        <path class="pm-apm-line" d="${pathD}" />
      </g>`;
    }).join('');

    const hoverDotsSvg = players.map((p) =>
      `<circle class="pm-apm-hdot pm-c${p.color}" data-apm-slot="${p.slot}" cx="-20" cy="-20" r="3.6" />`
    ).join('');

    // 2. Panel derecho: Distribución Box-and-Whisker limpia (sin nubes ruidosas de puntos)
    const bw = 300, bh = 236, bPadL = 30, bPadR = 12, bPadT = 22, bPadB = 34;
    const bInnerW = bw - bPadL - bPadR;
    const bInnerH = bh - bPadT - bPadB;
    const colW = bInnerW / players.length;
    const boxW = Math.max(14, Math.min(32, Math.round(colW * 0.48)));

    const bGridY = yTicks.map((v) => {
      const y = Math.round(yForVal(v, bPadT, bInnerH) * 10) / 10;
      return `<line class="pm-apm-grid-h${v === 0 ? ' is-base' : ''}" x1="${bPadL}" y1="${y}" x2="${bw - bPadR}" y2="${y}" />
        <text class="pm-apm-ytick" x="${bPadL - 6}" y="${y + 3}">${v}</text>`;
    }).join('');

    const boxesSvg = players.map((p, idx) => {
      const cx = Math.round((bPadL + colW * (idx + 0.5)) * 10) / 10;
      const yMin = Math.round(yForVal(p.min, bPadT, bInnerH) * 10) / 10;
      const yMaxP = Math.round(yForVal(p.max, bPadT, bInnerH) * 10) / 10;
      const yQ1 = Math.round(yForVal(p.q1, bPadT, bInnerH) * 10) / 10;
      const yQ3 = Math.round(yForVal(p.q3, bPadT, bInnerH) * 10) / 10;
      const yMed = Math.round(yForVal(p.median, bPadT, bInnerH) * 10) / 10;
      const yAvg = Math.round(yForVal(p.avgEapm, bPadT, bInnerH) * 10) / 10;
      const boxH = Math.max(4, Math.round((yQ1 - yQ3) * 10) / 10);
      const capHalf = Math.round(boxW * 0.32);

      // Solo outliers genuinos (> Q3 + 1.5*IQR o < Q1 - 1.5*IQR), sutiles y sin borde blanco
      const iqr = Math.max(4, p.q3 - p.q1);
      const hiFence = p.q3 + 1.5 * iqr;
      const loFence = p.q1 - 1.5 * iqr;
      const outliers = (p.series || [])
        .filter((val) => val > hiFence || val < loFence)
        .slice(0, 4)
        .map((val) => `<circle class="pm-apm-outlier" cx="${cx}" cy="${Math.round(yForVal(val, bPadT, bInnerH) * 10) / 10}" r="1.8" />`)
        .join('');

      const maxChars = players.length >= 7 ? 4 : players.length >= 5 ? 6 : players.length >= 4 ? 7 : players.length === 3 ? 11 : 16;
      const shortName = p.name.length > maxChars ? `${p.name.slice(0, maxChars - 1)}…` : p.name;
      const tipText = `${p.name} · ${tr('postmatch.apmAvgShort', 'Media')} ${dec(p.avgEapm, 1)} · ${tr('postmatch.apmMedShort', 'Med')} ${dec(p.median, 0)} · Q1–Q3 ${dec(p.q1, 0)}–${dec(p.q3, 0)} · ${tr('postmatch.apmPeakShort', 'Máx')} ${number(p.max)}`;
      const barHalf = Math.min(12, Math.round(colW * 0.3));
      return `<g class="pm-apm-boxg pm-c${p.color}${p.isSelf ? ' is-self' : ''}" data-apm-slot="${p.slot}">
        <title>${esc(tipText)}</title>
        <rect class="pm-apm-box-hit" x="${Math.round((cx - colW / 2) * 10) / 10}" y="${bPadT}" width="${Math.round(colW * 10) / 10}" height="${bInnerH + 26}" />
        <line class="pm-apm-whisker" x1="${cx}" y1="${yMaxP}" x2="${cx}" y2="${yQ3}" />
        <line class="pm-apm-whisker" x1="${cx}" y1="${yQ1}" x2="${cx}" y2="${yMin}" />
        <line class="pm-apm-cap" x1="${cx - capHalf}" y1="${yMaxP}" x2="${cx + capHalf}" y2="${yMaxP}" />
        <line class="pm-apm-cap" x1="${cx - capHalf}" y1="${yMin}" x2="${cx + capHalf}" y2="${yMin}" />
        <rect class="pm-apm-iqr" x="${Math.round((cx - boxW / 2) * 10) / 10}" y="${yQ3}" width="${boxW}" height="${boxH}" rx="4" />
        <line class="pm-apm-med" x1="${Math.round((cx - boxW / 2 + 1.5) * 10) / 10}" y1="${yMed}" x2="${Math.round((cx + boxW / 2 - 1.5) * 10) / 10}" y2="${yMed}" />
        <polygon class="pm-apm-mean" points="${cx},${yAvg - 2.6} ${cx + 2.6},${yAvg} ${cx},${yAvg + 2.6} ${cx - 2.6},${yAvg}" />
        ${outliers}
        <rect class="pm-apm-baxis-bar" x="${cx - barHalf}" y="${bh - 20}" width="${barHalf * 2}" height="2.4" rx="1.2" />
        <text class="pm-apm-baxis-lbl" x="${cx}" y="${bh - 6}" data-no-i18n="1">${esc(shortName)}</text>
      </g>`;
    }).join('');

    // 3. Tarjetas editoriales de participantes (grid estructurado estilo Relic, no chips apretados)
    const rosterHtml = players.map((p) => {
      const crest = p.civ ? civBadge(p.civ) : '';
      return `<button type="button" class="pm-apm-card-item pm-c${p.color}${p.isSelf ? ' is-self' : ''}" data-apm-slot="${p.slot}" aria-pressed="false">
        <span class="pm-apm-rail" aria-hidden="true"></span>
        ${crest ? `<span class="pm-apm-crest">${crest}</span>` : ''}
        <span class="pm-apm-pmeta">
          <span class="pm-apm-prow">
            <span class="pm-apm-cname" data-no-i18n="1">${esc(p.name)}</span>
            ${p.isSelf ? `<em class="pm-apm-you">${esc(tr('postmatch.you', 'Vos'))}</em>` : ''}
          </span>
          <span class="pm-apm-pstats">
            <b class="pm-apm-cval">${dec(p.avgEapm, 1)}</b>
            <small class="pm-apm-csep">·</small>
            <small class="pm-apm-cpeak">${esc(tr('postmatch.apmMedShort', 'Med'))} ${dec(p.median, 0)}</small>
            <small class="pm-apm-csep">·</small>
            <small class="pm-apm-cpeak">${esc(tr('postmatch.apmPeakShort', 'máx'))} ${number(p.max)}</small>
          </span>
        </span>
      </button>`;
    }).join('');

    const payloadJson = JSON.stringify({
      totalMinutes,
      yMax,
      padL: lPadL,
      padR: lPadR,
      padT: lPadT,
      padB: lPadB,
      w: lw,
      h: lh,
      players: players.map((p) => ({
        slot: p.slot,
        name: p.name,
        color: p.color,
        isSelf: p.isSelf,
        avgEapm: p.avgEapm,
        median: p.median,
        q1: p.q1,
        q3: p.q3,
        min: p.min,
        max: p.max,
        series: p.series,
      })),
    });

      const rosterGridCls = players.length <= 2
        ? ' is-duel'
        : (players.length === 4 || players.length >= 7)
          ? ' is-grid-4'
          : ' is-grid-3';

    return `<section class="pm-apm-card" data-apm-payload="${esc(payloadJson)}">
      <div class="pm-apm-head">
        <div class="pm-apm-head-l">
          <span class="pm-apm-eyebrow">${esc(tr('postmatch.apmAllEyebrow', 'eAPM · TODOS LOS PARTICIPANTES'))}</span>
          <div class="pm-apm-title-row">
            <h4>${esc(tr('postmatch.apmAllTitle', 'Ritmo eAPM por jugador'))}</h4>
            <span class="pm-apm-count-pill">${esc(tr('postmatch.apmPlayersCount', '{n} jugadores', { n: number(players.length) }))}</span>
          </div>
        </div>
        <span class="pm-apm-hint">${esc(tr('postmatch.apmIsolateHint', 'Clic en un jugador para aislar'))}</span>
      </div>
      <div class="pm-apm-roster${rosterGridCls}" role="group" aria-label="${esc(tr('postmatch.apmAllTitle', 'Ritmo eAPM por jugador'))}">${rosterHtml}</div>
      <div class="pm-apm-grid">
        <div class="pm-apm-panel is-lines">
          <div class="pm-apm-panel-head">
            <span>${esc(tr('postmatch.apmCurveSub', 'Evolución minuto a minuto'))}</span>
            <small>eAPM</small>
          </div>
          <div class="pm-apm-canvas-wrap">
            <svg class="pm-apm-svg pm-apm-line-svg" viewBox="0 0 ${lw} ${lh}" role="img" aria-label="${esc(tr('postmatch.apmCurveSub', 'Evolución minuto a minuto'))}">
              ${lGridY}
              ${lGridX}
              ${ageMarksSvg}
              ${curvesSvg}
              <line class="pm-apm-crosshair" x1="-20" y1="${lPadT}" x2="-20" y2="${lPadT + lInnerH}" />
              ${hoverDotsSvg}
              <rect class="pm-apm-hit" x="${lPadL}" y="${lPadT}" width="${lInnerW}" height="${lInnerH}" />
            </svg>
            <div class="pm-apm-tooltip" hidden></div>
          </div>
        </div>
        <div class="pm-apm-panel is-boxes">
          <div class="pm-apm-panel-head">
            <span>${esc(tr('postmatch.apmDistSub', 'Distribución y estabilidad'))}</span>
            <small>${esc(tr('postmatch.apmBoxLegend', 'Mediana · Q1–Q3'))}</small>
          </div>
          <svg class="pm-apm-svg pm-apm-box-svg" viewBox="0 0 ${bw} ${bh}" role="img" aria-label="${esc(tr('postmatch.apmDistSub', 'Distribución y estabilidad'))}">
            ${bGridY}
            ${boxesSvg}
          </svg>
        </div>
      </div>
    </section>`;
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
    if (!item || item.snapshotOnly) return '';
    if (item.delta == null) return `<span class="pm-delta muted">${esc(tr('postmatch.initialBase', 'Base inicial'))}</span>`;
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
  const AGE_BRAND_ART = {
    dark: 'assets/icons/ages/dark.png',
    opening: 'assets/icons/ages/dark.png',
    feudal: 'assets/icons/ages/feudal.png',
    castle: 'assets/icons/ages/castle.png',
    imperial: 'assets/icons/ages/imperial.png',
  };
  function ageBrandEmblem(ageId, size = 34) {
    const src = AGE_BRAND_ART[ageId];
    return src
      ? `<img class="pm-age-brand" src="${src}" width="${size}" height="${size}" alt="" draggable="false"/>`
      : reportIcon(ageId);
  }
  function buildFallbackPostmatchInsights(eng, ctx, result) {
    const existing = eng?.postmatchInsights || null;
    if (existing && (existing.ghostVillagers || existing.turningPoint || existing.trappedResources || existing.replayChronicle || existing.tgRoleEval || existing.blacksmithGap || existing.techSwitch || existing.castleDrop)) {
      return existing;
    }
    const self = eng?.self || {};
    const timeline = Array.isArray(eng?.timeline) ? eng.timeline : [];
    const durMin = Math.max(1, Number(eng?.durationSeconds || result?.durationSeconds || 600) / 60);
    const out = { ...(existing || {}) };
    if (!out.ghostVillagers && Number.isFinite(Number(self.tcIdleEarlySeconds)) && Number(self.tcIdleEarlySeconds) >= 18) {
      const idle = Math.round(Number(self.tcIdleEarlySeconds));
      const count = Math.round((idle / 25) * 10) / 10;
      const targetMin = self.timings?.castleSeconds ? Math.min(28, self.timings.castleSeconds / 60) : Math.min(22, durMin);
      const lostResources = Math.round((count * Math.max(4, targetMin - 8) * 22) / 50) * 50;
      const eqKnights = Math.max(1, Math.round(lostResources / 135));
      out.ghostVillagers = {
        count,
        idleSeconds: idle,
        lostResources,
        eqKnights,
        label: `${String(count).replace('.', ',')} aldeanos fantasma`,
        detail: `~${number(lostResources)} recursos estimados sin recolectar antes de Castillos (≈ ${eqKnights} Jinetes).`,
      };
    }
    if (!out.turningPoint && timeline.length >= 4) {
      const isTg = Boolean(eng?.isTeamGame || ctx?.mode?.size === 'team');
      if (!isTg) {
        let best = null;
        let prevV = 0;
        let prevM = 0;
        for (let i = 0; i < timeline.length; i += 1) {
          const b = timeline[i];
          if (!Number.isFinite(b.rivalVillagers)) continue;
          const vd = (b.selfVillagers || 0) - (b.rivalVillagers || 0);
          const md = (b.selfMilitary || 0) - (b.rivalMilitary || 0);
          if (i >= 2) {
            const dv = vd - prevV;
            const dm = md - prevM;
            const sc = Math.abs(dv) * 1.4 + Math.abs(dm);
            if (!best || sc > best.sc) best = { sc, dv, dm, f: Math.round(timeline[i - 1].seconds / 60), t: Math.round(b.seconds / 60) };
          }
          prevV = vd;
          prevM = md;
        }
        if (best && best.sc >= 8) {
          const isEco = Math.abs(best.dv) >= Math.abs(best.dm);
          const good = isEco ? best.dv > 0 : best.dm > 0;
          out.turningPoint = {
            tone: good ? 'win' : 'loss',
            title: isEco
              ? (good ? tr('pm.ecoTakeoff', 'Despegue económico ({f}–{t}m)', { f: best.f, t: best.t }) : tr('pm.rivalEcoBreak', 'Quiebre económico rival ({f}–{t}m)', { f: best.f, t: best.t }))
              : (good ? tr('pm.decisiveMilPeak', 'Pico militar decisivo ({f}–{t}m)', { f: best.f, t: best.t }) : tr('pm.rivalMilPressure', 'Presión militar rival ({f}–{t}m)', { f: best.f, t: best.t })),
            detail: isEco
              ? (good ? `Entre el min ${best.f} y ${best.t} sacaste +${best.dv} aldeanos de ventaja.` : `Entre el min ${best.f} y ${best.t} el rival te sacó ${Math.abs(best.dv)} aldeanos extra.`)
              : (good ? tr('pm.milLeadWindow', 'Encargaste +{dm} militares más que el rival en ese tramo.', { dm: best.dm }) : `El rival volcó +${Math.abs(best.dm)} militares más en ese tramo.`),
          };
        }
      } else {
        let peak = null;
        for (let i = 1; i < timeline.length; i += 1) {
          const dm = (timeline[i].selfMilitary || 0) - (timeline[i - 1].selfMilitary || 0);
          if (!peak || dm > peak.dm) peak = { dm, f: Math.round(timeline[i - 1].seconds / 60), t: Math.round(timeline[i].seconds / 60) };
        }
        if (peak && peak.dm >= 10) {
          out.turningPoint = {
            tone: 'neutral',
            title: tr('pm.prodPeakTitle', 'Tu pico de producción ({f}–{t}m)', { f: peak.f, t: peak.t }),
            detail: tr('pm.prodPeakDet', 'Encargaste +{dm} unidades militares en tu ventana más explosiva de la partida.', { dm: peak.dm }),
          };
        }
      }
    }
    if (!out.trappedResources && self.topWorkshops) {
      const sat = (self.topWorkshops || []).filter((w) => Number(w.peakQueue) >= 5);
      const mOps = Number(self.marketProfile?.totalOps ?? self.habits?.market ?? 0);
      const isSar = /saracen|sarracen/i.test(String(ctx?.civ || ''));
      const estTax = (!isSar && mOps >= 4) ? Math.round(((self.marketProfile?.totalVolume || mOps * 100) * 0.25) / 50) * 50 : 0;
      if (sat.length || estTax >= 150) {
        out.trappedResources = {
          clean: false,
          tone: 'loss',
          title: sat.length ? `Colas saturadas (×${Math.round(sat[0].peakQueue)} en fila)` : `Impuesto de Mercado (~${estTax} res)`,
          detail: sat.length
            ? `${locBuilding(sat[0])} llegó a ${Math.round(sat[0].peakQueue)} en cola; sumar otro edificio convierte esos recursos en ejército.`
            : tr('pm.mktTaxDet', '{n} operaciones de Mercado con ~{tax} recursos en comisión.', { n: mOps, tax: estTax }),
        };
      }
    }
    if (!out.replayChronicle && self.habits) {
      const badges = [];
      if ((self.habits.tributes || 0) >= 2) badges.push({ label: `El Banquero (${self.habits.tributes} tributos)`, tone: 'gold' });
      if ((self.habits.walls || 0) >= 18) badges.push({ label: `La Gran Muralla (${self.habits.walls} muros)`, tone: 'neutral' });
      if ((self.habits.selfDeleted || 0) >= 12) badges.push({ label: tr('pm.surgeryBadge', 'Cirugía ({n} borrados)', { n: self.habits.selfDeleted }), tone: 'neutral' });
      if (badges.length) out.replayChronicle = { badges };
    }
    return out;
  }
  function trainDumbbellBtn({ source = 'Relic', title = '', detail = '', metric = '', tab = '', ruleType = '', stageId = '', civSlug = '', civName = '', mapName = '', compact = false } = {}) {
    if (!title) return '';
    return `<button type="button" class="train-pin-btn${compact ? ' is-compact' : ''}" data-train-pin="1" data-tp-source="${esc(source)}" data-tp-title="${esc(title)}" data-tp-detail="${esc(detail)}" data-tp-metric="${esc(metric)}" data-tp-tab="${esc(tab)}"${ruleType ? ` data-tp-rule="${esc(ruleType)}"` : ''}${stageId ? ` data-tp-stage="${esc(stageId)}"` : ''}${civSlug ? ` data-tp-civ="${esc(civSlug)}"` : ''}${civName ? ` data-tp-civ-name="${esc(civName)}"` : ''}${mapName ? ` data-tp-map="${esc(mapName)}"` : ''} title="Agregar a Mi Plan (se verifica automáticamente en tus próximas partidas)" aria-label="Agregar a Mi Plan: ${esc(title)}"><svg class="train-pin-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 7.5v9M17.5 7.5v9M4 9.5v5M20 9.5v5M6.5 12h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
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
    const isTeamGameHead = Boolean(eng.isTeamGame || c.mode?.size === 'team');
    const rivalLabel = eng.rivalName || 'Rival';
    const vsCivs = isTeamGameHead
      ? `${civLabel(c.civ)} <span class="pm-vs">·</span> <span class="pm-tg-tag">Equipo</span>`
      : (eng.rivalCiv ? `${civLabel(c.civ)} <span class="pm-vs">vs</span> ${civLabel(eng.rivalCiv)}` : civLabel(c.civ));
    const ratingChip = result.ratingDiff == null ? ''
      : `<strong class="review-result ${result.status === 'won' ? 'win' : result.status === 'lost' ? 'loss' : ''}">${result.ratingDiff >= 0 ? '+' : ''}${result.ratingDiff}<small>ELO</small></strong>`;
    const modePill = compareOn
      ? `<span class="pm-mode-tag">${esc(modePref === 'personal' ? tr('postmatch.modePersonal', 'Solo tu historial') : modePref === 'community' ? tr('postmatch.modeCommunity', 'Estándar por ELO') : tr('postmatch.modeBoth', 'Personal + Estándar ELO'))}</span>`
      : '';
    const pmIns = buildFallbackPostmatchInsights(eng, c, result);
    const tgRolePill = pmIns?.tgRoleEval
      ? `<span class="pm-role-pill is-${pmIns.tgRoleEval.role}">${esc(pmIns.tgRoleEval.roleLabel.toUpperCase())}</span>`
      : (eng.teamRole ? `<span class="pm-role-pill is-${esc(eng.teamRole)}">${esc(eng.teamRole === 'pocket' ? 'POCKET' : 'FLANK')}</span>` : '');
    const outcomeText = result.status === 'won'
      ? tr('postmatch.win', result.label || 'Victoria')
      : result.status === 'lost'
        ? tr('postmatch.loss', result.label || 'Derrota')
        : tr('postmatch.match', result.label || 'Partida');
    const heroMapArt = c.mapName ? `<span class="pm-hero-map-frame">${mapBadge(c.mapName, 'lg')}</span>` : '';
    const heroAgeBits = [
      self.timings?.feudalSeconds ? `Feudal ${clock(self.timings.feudalSeconds)}` : null,
      self.timings?.castleSeconds ? `Castillos ${clock(self.timings.castleSeconds)}` : null,
      self.timings?.imperialSeconds ? `Imperial ${clock(self.timings.imperialSeconds)}` : null,
    ].filter(Boolean).map((txt) => `<span class="pm-hero-chip">${esc(txt)}</span>`).join('');
    const heroClash = `<div class="pm-hero-clash" aria-label="Enfrentamiento de civilizaciones">
      <div class="pm-hero-side is-self">
        <span class="pm-hero-crest-frame is-self">${civBadge(c.civ)}</span>
        <div class="pm-hero-side-copy"><b>${esc(tr('postmatch.you', 'Vos'))}</b><small>${esc(locCiv(c.civ) || c.civ || '—')}</small></div>
      </div>
      <span class="pm-hero-vs-badge" aria-hidden="true">VS</span>
      <div class="pm-hero-side is-rival">
        <span class="pm-hero-crest-frame is-rival">${eng.rivalCiv ? civBadge(eng.rivalCiv) : reportIcon('shield')}</span>
        <div class="pm-hero-side-copy"><b>${esc(isTeamGameHead ? `${rivalLabel} (TG)` : rivalLabel)}</b><small>${esc(locCiv(eng.rivalCiv) || eng.rivalCiv || (isTeamGameHead ? 'Equipo rival' : 'Rival'))}</small></div>
      </div>
    </div>`;
    const header = `<header class="pm-head pm-hero-v6 is-${result.status === 'won' ? 'won' : result.status === 'lost' ? 'lost' : 'neutral'}">
      <div class="pm-hero-left">
        ${heroMapArt}
        <div class="pm-head-main">
          <div class="pm-title-row"><h2>${esc(outcomeText)}</h2>${dur ? `<span class="pm-dur">${esc(dur)}</span>` : ''}${tgRolePill}${modePill}</div>
          <p class="pm-sub">${esc(locMap(c.mapName) || c.mapName)}${mode ? ` · ${esc(mode)}` : ''} · ${vsCivs}</p>
          ${heroAgeBits ? `<div class="pm-hero-chips">${heroAgeBits}</div>` : ''}
        </div>
      </div>
      ${heroClash}
      <div class="pm-hero-right">${ratingChip}</div>
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
        ? `<section class="pm-trophy-banner is-record" aria-label="${esc(tr('pm.personalRecordAria', 'Récord personal'))}">
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
      ? `<div class="pm-focus"><span class="pm-icon-tile is-gold sm">${postmatchEmblem('focus')}</span><div><span>${esc(tr('postmatch.nextFocus', 'Foco próxima partida'))}</span><b>${esc(focusObj.title)}</b><p>${esc(focusObj.detail)}</p></div>${trainDumbbellBtn({ source: 'Postmatch', title: focusObj.title, detail: focusObj.detail || '', tab: 'orders' })}</div>` : '';

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
    const LEGACY_BAD_IDS = new Set([
      'medal-dark-clean', 'medal-tc-continuity', 'medal-tc-vs-rival', 'medal-vil-lead',
      'neg-workshop-sat', 'evo-tc-record', 'evo-tc-up', 'evo-idle-record', 'evo-idle-up',
      'evo-mil-record', 'evo-mil-up', 'evo-vil-up', 'evo-tc-drop',
    ]);
    const cleanStageMetric = (s) => {
      const m = String(s.metric || '');
      if (s.status !== 'ready') return m || '—';
      if (/%\s*TC|mil\s*·|talleres/i.test(m)) {
        if (s.id === 'dark') return self.timings?.feudalSeconds ? `${locAge('feudal', 'Feudal')} ${clock(self.timings.feudalSeconds)}` : '—';
        if (s.id === 'feudal') return self.techProfile?.hasDoubleBitAxe ? 'Hacha de doble filo ✓' : (self.townCenters ? `${self.townCenters} TC` : '—');
        if (s.id === 'castle') return `${number(self.townCenters || 1)} TC · ${number(self.workshopsCount || 0)} edificios militares`;
        if (s.id === 'imperial') return `${self.eapm != null ? dec(self.eapm, 1) : '—'} eAPM · ${number(self.workshopsCount || 0)} edificios militares`;
      }
      return m || '—';
    };
    const stageStrip = (eng.stages || []).length
      ? `<section class="pm-stages-v2" aria-label="${esc(tr('pm.gradeByAgeAria', 'Calificación por edad'))}">${eng.stages.map((s) => {
        const ready = s.status === 'ready' && s.grade;
        const sd = showPersonal ? stageDeltas[s.id] : null;
        const deltaChip = ready && sd && sd.deltaScore !== 0
          ? `<span class="pm-st-delta ${sd.deltaScore > 0 ? 'win' : 'loss'}">${sd.deltaScore > 0 ? '▲ +' : '▼ −'}${Math.abs(sd.deltaScore)}</span>`
          : '';
        const stampHtml = showCommunity
          ? `<strong class="pm-grade-stamp${ready ? ` grade-${s.grade}` : ''}">${ready ? esc(s.grade) : '—'}</strong>`
          : (ready && sd ? `<strong class="pm-grade-stamp">${sd.betterThanPct}%</strong>` : '<strong class="pm-grade-stamp">—</strong>');
        const tileTone = ready && showCommunity ? (STAGE_TONE[s.grade] || 'is-slate') : 'is-slate';
        const stageJumpTab = s.id === 'imperial' ? 'evo' : 'duel';
        const stageJumpSel = s.id === 'imperial' ? '.pm-habits' : '.pm-race-box, .pm-duel';
        return `<article class="pm-stage-card is-jumpable${ready ? ` is-ready${showCommunity ? ` grade-${s.grade}` : ''}` : ' is-dim'}" data-pm-jump-tab="${stageJumpTab}" data-scroll-target="${stageJumpSel}"${s.tip ? ` title="${esc(s.tip)}"` : ''}>
          <div class="pm-stage-top">
            <span class="pm-icon-tile ${tileTone} sm pm-age-tile">${ageBrandEmblem(s.id, 34)}</span>
            <div class="pm-stage-head">
              <span class="pm-stage-lbl">${esc(locAge(s.id, s.label))}</span>
              ${s.subtitle ? `<b class="pm-stage-sub">${esc(s.subtitle)}</b>` : ''}
            </div>
            ${stampHtml}
          </div>
          <div class="pm-stage-meta">
            <span>${esc(cleanStageMetric(s))}</span>
            ${deltaChip}
            ${ready ? trainDumbbellBtn({ source: 'Postmatch', title: `Mejorar ${locAge(s.id, s.label)}`, detail: s.tip || cleanStageMetric(s), metric: s.grade || '', tab: 'orders', ruleType: 'stage_grade', stageId: s.id, compact: true }) : ''}
          </div>
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
    const isCleanItem = (item) => item && !LEGACY_BAD_IDS.has(item.id) && !/pico \d+|faltaron ~\d+|talleres|aldeanos pedidos|TC inactivo|continuidad de TC/i.test(`${item.title || ''} ${item.metric || ''} ${item.detail || ''}`);
    const medalsList = [...filteredMedals, ...fallbackEnginePos].filter(isCleanItem).slice(0, 3);

    const rawIssues = rawNarrative && Array.isArray(rawNarrative.issues)
      ? rawNarrative.issues
      : ((eng.negatives && eng.negatives.length) ? eng.negatives : (eng.highlights || []).filter((h) => h.tone === 'warn'));
    const filteredIssues = showPersonal
      ? rawIssues
      : rawIssues.filter((n) => !String(n.id || '').startsWith('evo-'));
    const fallbackEngineNeg = (!showPersonal && filteredIssues.length < 2 && Array.isArray(eng.negatives))
      ? eng.negatives.filter((n) => !filteredIssues.some((x) => x.id === n.id || (x.domain && x.domain === n.domain)))
      : [];
    const issuesList = [...filteredIssues, ...fallbackEngineNeg].filter(isCleanItem).slice(0, 2);

    const rawStreak = showPersonal ? (rawNarrative?.streak || evo?.improvementStreak || null) : null;
    const streakObj = rawStreak && !/TC ≥|TC inactivo|continuidad de TC/i.test(rawStreak.label || '') ? rawStreak : null;
    const verdictText = rawNarrative?.verdict || '';
    const verdictBar = (verdictText || streakObj)
      ? `<div class="pm-verdict-bar">
          ${verdictText ? `<p class="pm-verdict-copy">${esc(verdictText)}</p>` : ''}
          ${streakObj ? `<span class="pm-streak-pill">${reportIcon('trophy')}<span>${esc(streakObj.label)}</span></span>` : ''}
        </div>`
      : '';

    const jumpInfoForNarrative = (item) => {
      const txt = `${item?.id || ''} ${item?.domain || ''} ${item?.title || ''}`.toLowerCase();
      if (/eapm|apm|ritmo|stamina|micro|late/.test(txt)) return { tab: 'evo', sel: '.pm-habits' };
      if (/feudal|castill|imperial|edad|apertura|opening/.test(txt)) return { tab: 'duel', sel: '.pm-race-box, .pm-duel' };
      if (/herrer|blacksmith|eco|mejora|tech|mercado|market|edif|producc/.test(txt)) return { tab: 'tech', sel: '.pm-tech-box, .pm-queue-box' };
      return { tab: 'evo', sel: '.pm-kpi-grid' };
    };

    const medalCards = medalsList.length
      ? medalsList.map((m) => {
        const isGold = m.tier === 'gold';
        const tagText = m.tag === 'DESTACADO DE ORO' || m.tag === 'LOGRO DE PARTIDA' ? '' : (m.tag || '');
        const badgeName = m.badgeName && m.badgeName !== m.title ? `<span class="pm-medal-name">${esc(m.badgeName)}</span>` : '';
        const metricChip = m.metric ? `<strong class="pm-medal-metric">${esc(m.metric)}</strong>` : '';
        const deltaChip = m.delta ? `<small class="pm-medal-delta">${esc(m.delta)}</small>` : '';
        const jmp = jumpInfoForNarrative(m);
        return `<article class="pm-medal-card is-jumpable ${isGold ? 'is-gold' : 'is-green'}" data-pm-jump-tab="${jmp.tab}" data-scroll-target="${jmp.sel}">
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
        const jmp = jumpInfoForNarrative(n);
        return `<article class="pm-issue-card is-jumpable" data-pm-jump-tab="${jmp.tab}" data-scroll-target="${jmp.sel}">
          <span class="pm-icon-tile is-rose sm">${postmatchEmblem(n.icon || 'target')}</span>
          <div class="pm-issue-body">
            <div class="pm-issue-top"><b>${esc(n.title)}</b></div>
            ${n.detail ? `<p>${esc(n.detail)}</p>` : ''}
          </div>
          <div class="pm-medal-stat">
            ${metricChip}
            ${trainDumbbellBtn({ source: 'Postmatch', title: n.title, detail: n.detail || '', metric: n.metric || '', tab: 'orders', compact: true })}
          </div>
        </article>`;
      }).join('')
      : `<div class="pm-issue-clean">${reportIcon('shield')}<span>${esc(tr('postmatch.noCriticalIssues', 'Sin cuellos de botella críticos detectados en esta partida.'))}</span></div>`;

    const narrativeGrid = `<section class="pm-narrative-grid" aria-label="${esc(tr('pm.execSummaryAria', 'Resumen de ejecución'))}">
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
    const evoCard = (item, mainVal, suffix, invert = false, customNote = null, jump = null) => {
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
      const jumpAttrs = jump ? ` data-pm-jump-tab="${esc(jump.tab)}" data-scroll-target="${esc(jump.sel)}"` : '';
      return `<article class="pm-kpi${jump ? ' is-jumpable' : ''} is-${tone}${showPersonal && item?.isBest ? ' is-best' : ''}"${jumpAttrs}>
        <div class="pm-kpi-top"><span>${esc(item?.label || '')}</span>${deltaBadge}</div>
        <div class="pm-kpi-mid"><b>${mainVal}</b>${spark}</div>
        ${note}
      </article>`;
    };

    const kpiTm = self.timings || {};
    const kpiMb = self.macroBuilds || {};
    const kpiTp = self.techProfile || {};
    const feudalSub = [
      kpiTm.castleSeconds != null ? `${locAge('castle', 'Castillos')} ${clock(kpiTm.castleSeconds)}` : null,
      eng.openingSummary?.name || null,
    ].filter(Boolean).join(' · ') || null;
    const ecoSub = [
      kpiTp.ecoCount != null ? `${number(kpiTp.ecoCount)} mejoras eco` : null,
      kpiMb.houses != null ? `${number(kpiMb.houses)} ${tr('postmatch.houses', 'casas')}` : null,
    ].filter(Boolean).join(' · ') || null;
    const bldSub = (self.topWorkshops || []).slice(0, 2)
      .map((w) => `${number(w.count)} ${locBuilding(w)}`).join(' · ') || null;

    const evoGrid = `<div class="pm-kpi-grid">
      ${evoCard({ label: tr('postmatch.kpiFeudal', 'Llegada a Feudal'), snapshotOnly: true }, kpiTm.feudalSeconds != null ? clock(kpiTm.feudalSeconds) : '—', '', false, feudalSub, { tab: 'duel', sel: '.pm-race-box, .pm-duel' })}
      ${evoCard({ label: tr('postmatch.kpiEco', 'Expansión económica'), snapshotOnly: true }, `${number(self.townCenters || 1)} TC · ${number(kpiMb.farms || 0)} granjas`, '', false, ecoSub, { tab: 'tech', sel: '.pm-tech-box' })}
      ${evoCard({ label: tr('postmatch.kpiBuildings', 'Edificios militares'), snapshotOnly: true }, `${number(self.workshopsCount || 0)} edificios`, '', false, bldSub, { tab: 'tech', sel: '.pm-queue-box' })}
      ${evoCard({ ...(em.eapm || {}), label: tr('postmatch.eapm', 'Ritmo eAPM') }, self.eapm != null ? dec(self.eapm, 1) : '—', '', false, null, { tab: 'evo', sel: '.pm-habits' })}
    </div>`;

    // 4. Duelo cara a cara con escudos + barras espejadas + carrera de edades
    const isTeamGame = Boolean(eng.isTeamGame || c.mode?.size === 'team');
    const selfCrest = civBadge(c.civ);
    const rivalCrest = civBadge(eng.rivalCiv);
    const duelFaceHead = `<div class="pm-duel-face">
      <div class="pm-side is-self">${selfCrest}<div><b>${esc(tr('postmatch.you', 'Vos'))}</b><small>${esc(locCiv(c.civ) || c.civ || '')}</small></div></div>
      <span class="pm-vs-pill">VS</span>
      <div class="pm-side is-rival"><div><b>${esc(rivalLabel)}</b><small>${esc(locCiv(eng.rivalCiv) || eng.rivalCiv || '')}${isTeamGame ? ' · Rival TG' : ''}</small></div>${rivalCrest}</div>
    </div>`;
    const duelRow = (label, aVal, bVal, aTxt, bTxt, lowerWins = false) => {
      const aNum = aVal != null && Number.isFinite(Number(aVal)) ? Number(aVal) : null;
      const bNum = bVal != null && Number.isFinite(Number(bVal)) ? Number(bVal) : null;
      const max = Math.max(1, aNum || 0, bNum || 0);
      const aW = aNum != null ? Math.max(6, Math.min(100, Math.round((aNum / max) * 100))) : 0;
      const bW = bNum != null ? Math.max(6, Math.min(100, Math.round((bNum / max) * 100))) : 0;
      const aLead = aNum != null && bNum != null && (lowerWins ? aNum < bNum : aNum > bNum);
      const bLead = aNum != null && bNum != null && (lowerWins ? bNum < aNum : bNum > aNum);
      const splitTone = aLead ? ' is-lead-self' : bLead ? ' is-lead-rival' : '';
      return `<div class="pm-duel-split${splitTone}">
        <div class="pm-duel-nums">
          <b class="${aLead ? 'is-accent' : ''}">${aTxt}</b>
          <span>${esc(label)}</span>
          <b class="is-r${bLead ? ' is-lead' : ''}">${bNum != null ? bTxt : '—'}</b>
        </div>
        <div class="pm-split-bars">
          <div class="pm-half left">${aNum != null ? `<i class="bar-self" data-w="${aW}"></i>` : ''}</div>
          <div class="pm-half right">${bNum != null ? `<i class="bar-rival" data-w="${bW}"></i>` : ''}</div>
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
        (selfTm.feudalSeconds || (!isTeamGame && rivalTm?.feudalSeconds))
          ? { lbl: locAge('feudal', 'Feudal'), a: selfTm.feudalSeconds, b: isTeamGame ? null : rivalTm?.feudalSeconds }
          : null,
        (selfTm.castleSeconds || (!isTeamGame && rivalTm?.castleSeconds))
          ? { lbl: locAge('castle', 'Castillos'), a: selfTm.castleSeconds, b: isTeamGame ? null : rivalTm?.castleSeconds }
          : null,
        (selfTm.imperialSeconds || (!isTeamGame && rivalTm?.imperialSeconds))
          ? { lbl: locAge('imperial', 'Imperial'), a: selfTm.imperialSeconds, b: isTeamGame ? null : rivalTm?.imperialSeconds }
          : null,
      ].filter(Boolean)
      : [];

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
              <b class="is-rival">${!isTeamGame && row.b != null ? clock(row.b) : ''}</b>
            </div>`;
          }).join('')}</div>
        </div>`
      : '';

    const selfTechTotal = (selfTp?.ecoCount || 0) + (selfTp?.blacksmithCount || 0) + (selfTp?.combatKeyCount || 0);
    const rivalTechTotal = rival ? ((rivalTp?.ecoCount || 0) + (rivalTp?.blacksmithCount || 0) + (rivalTp?.combatKeyCount || 0)) : null;
    const duelBlock = `<div class="pm-duel">
      ${duelFaceHead}
      ${duelRow(tr('postmatch.duelTcs', 'Centros Urbanos'), self.townCenters || 1, rival ? (rival.townCenters || 1) : null, `${number(self.townCenters || 1)} TC`, rival ? `${number(rival.townCenters || 1)} TC` : '')}
      ${duelRow(tr('postmatch.duelBuildings', 'Edificios militares'), self.workshopsCount || 0, rival ? (rival.workshopsCount || 0) : null, `${number(self.workshopsCount || 0)}`, rival ? `${number(rival.workshopsCount || 0)}` : '')}
      ${duelRow(tr('postmatch.duelTechs', 'Mejoras clave'), selfTechTotal, rivalTechTotal, `${number(selfTechTotal)} mejoras`, rivalTechTotal != null ? `${number(rivalTechTotal)} mejoras` : '')}
      ${duelRow(tr('postmatch.duelEapm', 'Ritmo eAPM'), self.eapm ?? null, rival?.eapm ?? null, self.eapm != null ? dec(self.eapm, 1) : '—', rival?.eapm != null ? dec(rival.eapm, 1) : '')}
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

    // 6. Infraestructura militar y composición real (sin picos de cola ficticios por clics fallidos)
    const wsRows = (self.topWorkshops || []).slice(0, 4).map((w) => {
      const wName = locBuilding(w);
      return `<li><span><b>${esc(wName)}</b></span><small>×${number(w.count)} ${esc(w.count === 1 ? 'edificio' : 'edificios')}</small></li>`;
    }).join('');
    const shortComp = (units) => (units || []).slice(0, 2).map((u) => `${esc(locUnit(u))}`).join(' + ') || '—';
    const marketLine = self.marketProfile
      ? `<div class="pm-market-note"><span class="pm-mini-ico">${reportIcon('market')}</span><span>${esc(self.marketProfile.note)}</span></div>` : '';
    const queueBox = `<div class="pm-queue-box">
      <div class="pm-queue-head">
        <span>${esc(tr('postmatch.queuesTitle', 'Edificios militares y composición'))}</span>
        <b>${esc(tr('postmatch.buildingsCount', `${self.workshopsCount} edificios`, { n: self.workshopsCount }))}</b>
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
    const amPatrol = (self.habits?.attackMove || 0) + (self.habits?.patrol || 0);
    const formStance = (cm.formations || 0) + (cm.stances || 0);
    const microVal = `${number(amPatrol)}`;
    const microSub = formStance > 0
      ? `<small>Mov. ataque / Patrullar · ${number(formStance)} form.</small>`
      : `<small>Mov. ataque / Patrullar</small>`;
    const tcCycleVal = cm.tcReturnSec != null ? `Cada ${number(cm.tcReturnSec)} s` : '—';
    const fourthHabit = self.eapmRetentionPct != null
      ? `<div><span>${esc(tr('postmatch.lateStamina', 'Ritmo Late'))}</span><b>${number(self.eapmRetentionPct)}% <small>${dec(self.eapmEarly, 0)}→${dec(self.eapmLate, 0)}</small></b></div>`
      : `<div><span>${esc(tr('postmatch.market', 'Mercado'))}</span><b>${number(self.habits?.market || 0)} <small>${esc(tr('postmatch.ops', 'operaciones'))}</small></b></div>`;
    const habitsStrip = `<div class="pm-habits">
      <div><span>APM / eAPM</span><b>${self.apm != null ? dec(self.apm, 1) : '—'} <small>/ ${self.eapm != null ? dec(self.eapm, 1) : '—'}</small></b></div>
      <div><span>${esc(tr('postmatch.combatMicro', 'Micro combate'))}</span><b>${microVal} ${microSub}</b></div>
      <div><span>${esc(tr('postmatch.tcCycle', 'Cola de aldeanos'))}</span><b>${tcCycleVal}</b></div>
      ${fourthHabit}
    </div>`;

    // Nivel 2: Detalle técnico organizado en 3 Chapter Tabs esculpidas (hermanas de Central v5)
    const duelRightHtml = `${ageRaceBox}${coachPanel}`;
    const techLeftHtml = techBox || queueBox;
    const techRightHtml = techBox ? `${queueBox}${coachPanel}` : coachPanel;
    const evoTabSub = evo?.sampleSize > 0 ? tr('pm.vsLastNMatches', 'vs últ. {n} partidas', { n: number(evo.sampleSize) }) : `${self.eapm != null ? `${dec(self.eapm, 1)} eAPM` : 'Ritmo y curva'}`;
    const duelTabSub = isTeamGame ? `Vos vs ${rivalLabel} (TG)` : `Vos vs ${rivalLabel}`;
    const techTabSub = `${number(selfTechTotal)} mejoras · ${number(self.workshopsCount || 0)} edif.`;
    const deepDive = `<section class="pm-deep-dive" aria-label="${esc(tr('pm.techDeepDiveAria', 'Análisis técnico detallado'))}">
      <div class="pm-tabs" role="tablist">
        <button type="button" class="pm-tab is-tab-evo is-active" role="tab" aria-selected="true" data-pm-tab="evo">
          <span class="pm-tab-ico" aria-hidden="true">${reportIcon('trend')}</span>
          <span class="pm-tab-copy"><strong>${esc(tr('postmatch.tabEvo', 'Evolución y Curva'))}</strong><small>${esc(evoTabSub)}</small></span>
        </button>
        <button type="button" class="pm-tab is-tab-duel" role="tab" aria-selected="false" data-pm-tab="duel">
          <span class="pm-tab-ico" aria-hidden="true">${reportIcon('combat')}</span>
          <span class="pm-tab-copy"><strong>${esc(tr('postmatch.tabDuel', 'Duelo vs Rival'))}</strong><small>${esc(duelTabSub)}</small></span>
        </button>
        <button type="button" class="pm-tab is-tab-tech" role="tab" aria-selected="false" data-pm-tab="tech">
          <span class="pm-tab-ico" aria-hidden="true">${reportIcon('blacksmith')}</span>
          <span class="pm-tab-copy"><strong>${esc(tr('postmatch.tabTech', 'Mejoras y Producción'))}</strong><small>${esc(techTabSub)}</small></span>
        </button>
      </div>
      <div class="pm-columns">
        <div class="pm-tab-pane is-active" role="tabpanel" data-pm-pane="evo">
          <div class="pm-eyebrow"><span>${esc(evoTitle)}</span><i></i></div>
          ${evoGrid}
          <div class="pm-pane-grid is-evo">
            <div class="pm-col">${productionCurveSvg(eng.timeline, rivalLabel)}</div>
            <div class="pm-col">${habitsStrip}</div>
          </div>
          ${renderAllPlayersEapmBlock(eng.eapmComparison, selfTm)}
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

    const civM = eng.civMastery && ((eng.civMastery.leveraged?.length || 0) + (eng.civMastery.missed?.length || 0) > 0)
      ? eng.civMastery
      : null;
    const civMasteryBlock = civM ? (() => {
      const levCount = (civM.leveraged || []).length;
      const missCount = (civM.missed || []).length;
      const utilPct = (levCount + missCount) > 0 ? Math.round((levCount / (levCount + missCount)) * 100) : 50;
      const ratingTone = civM.rating === 'high' ? 'is-win' : civM.rating === 'low' ? 'is-loss' : 'is-mid';
      const ratingLabel = civM.rating === 'high' ? 'Ventaja aprovechada'
        : civM.rating === 'low' ? 'Por explotar'
          : 'Aprovechamiento parcial';
      const crest = civBadge(civM.civSlug || civM.civName || c.civ);
      const civTitle = locCiv(civM.civSlug || civM.civName || c.civ) || civM.civName || '';
      const levRows = (civM.leveraged || []).map((item) => `<div class="pm-cm-row is-win">
        <span class="pm-cm-mark" aria-hidden="true">✓</span>
        <div class="pm-cm-copy">
          <strong>${esc(item.title)}</strong>
          ${item.detail ? `<small>${esc(item.detail)}</small>` : ''}
        </div>
        ${item.metric ? `<span class="pm-cm-metric">${esc(item.metric)}</span>` : ''}
      </div>`).join('');
      const missRows = (civM.missed || []).map((item) => `<div class="pm-cm-row is-loss">
        <span class="pm-cm-mark" aria-hidden="true">△</span>
        <div class="pm-cm-copy">
          <strong>${esc(item.title)}</strong>
          ${item.detail ? `<small>${esc(item.detail)}</small>` : ''}
        </div>
        ${item.metric ? `<span class="pm-cm-metric">${esc(item.metric)}</span>` : ''}
      </div>`).join('');
      return `<section class="pm-civ-mastery" aria-label="Aprovechamiento de bonos de civilización">
        <div class="pm-cm-head">
          <div class="pm-cm-title">
            ${crest ? `<span class="pm-cm-ring">${svgWrRing(utilPct, crest, 70)}</span>` : ''}
            <div>
              <span class="pm-cm-kicker">${esc(tr('pm.civBonusesKicker', 'Bonos de civilización · {civ} · {pct}% explotados', { civ: civTitle, pct: utilPct }))}</span>
              ${civM.summary ? `<p class="pm-cm-summary">${esc(civM.summary)}</p>` : ''}
            </div>
          </div>
          <span class="pm-cm-pill ${ratingTone}">${esc(ratingLabel)}</span>
        </div>
        <div class="pm-cm-list${levRows && missRows ? ' is-split' : ''}">${levRows}${missRows}</div>
      </section>`;
    })() : '';

    // 8 Nuevos Insights Competitivos y Curiosos de Postmatch
    const pmInsightCards = [];
    if (pmIns?.ghostVillagers) {
      const gv = pmIns.ghostVillagers;
      pmInsightCards.push(`<article class="pm-ins-card is-loss">
        <span class="pm-icon-tile is-rose sm">${reportIcon('villager')}</span>
        <div class="pm-ins-copy">
          <span class="pm-ins-k">ALDEANOS FANTASMA</span>
          <strong>${esc(gv.label)}</strong>
          <small>${esc(gv.detail)}</small>
        </div>
      </article>`);
    }
    if (pmIns?.turningPoint) {
      const tp = pmIns.turningPoint;
      const tCls = tp.tone === 'win' ? 'is-win' : tp.tone === 'loss' ? 'is-loss' : 'is-gold';
      pmInsightCards.push(`<article class="pm-ins-card ${tCls}">
        <span class="pm-icon-tile ${tp.tone === 'win' ? 'is-emerald' : tp.tone === 'loss' ? 'is-rose' : 'is-gold'} sm">${reportIcon('trend')}</span>
        <div class="pm-ins-copy">
          <span class="pm-ins-k">MINUTO DEL QUIEBRE</span>
          <strong>${esc(tp.title)}</strong>
          <small>${esc(tp.detail)}</small>
        </div>
      </article>`);
    }
    if (pmIns?.tgRoleEval) {
      const r = pmIns.tgRoleEval;
      pmInsightCards.push(`<article class="pm-ins-card ${r.tone === 'win' ? 'is-win' : 'is-gold'}">
        <span class="pm-icon-tile ${r.tone === 'win' ? 'is-emerald' : 'is-gold'} sm">${reportIcon('shield')}</span>
        <div class="pm-ins-copy">
          <span class="pm-ins-k">ROL EN EQUIPO · ${esc(r.roleLabel.toUpperCase())}</span>
          <strong>${esc(r.title)}</strong>
          <small>${esc(r.detail)}</small>
        </div>
      </article>`);
    }
    if (pmIns?.blacksmithGap) {
      const bg = pmIns.blacksmithGap;
      pmInsightCards.push(`<article class="pm-ins-card ${bg.tone === 'win' ? 'is-win' : 'is-loss'}">
        <span class="pm-icon-tile ${bg.tone === 'win' ? 'is-emerald' : 'is-rose'} sm">${reportIcon('blacksmith')}</span>
        <div class="pm-ins-copy">
          <span class="pm-ins-k">${esc(tr('pm.bsTimingKicker', 'TIMING DE HERRERÍA'))}</span>
          <strong>${esc(bg.title)}</strong>
          <small>${esc(bg.detail)}</small>
        </div>
      </article>`);
    }
    if (pmIns?.techSwitch) {
      const ts = pmIns.techSwitch;
      pmInsightCards.push(`<article class="pm-ins-card ${ts.tone === 'win' ? 'is-win' : 'is-loss'}">
        <span class="pm-icon-tile ${ts.tone === 'win' ? 'is-emerald' : 'is-rose'} sm">${reportIcon('sword')}</span>
        <div class="pm-ins-copy">
          <span class="pm-ins-k">${esc(tr('pm.techSwitchKicker', 'ADAPTACIÓN & TECH-SWITCH'))}</span>
          <strong>${esc(ts.title)}</strong>
          <small>${esc(ts.detail)}</small>
        </div>
      </article>`);
    }
    if (pmIns?.trappedResources) {
      const trRes = pmIns.trappedResources;
      pmInsightCards.push(`<article class="pm-ins-card ${trRes.tone === 'win' ? 'is-win' : 'is-loss'}">
        <span class="pm-icon-tile ${trRes.tone === 'win' ? 'is-emerald' : 'is-amber'} sm">${reportIcon('market')}</span>
        <div class="pm-ins-copy">
          <span class="pm-ins-k">EFICIENCIA DE GASTO</span>
          <strong>${esc(trRes.title)}</strong>
          <small>${esc(trRes.detail)}</small>
        </div>
      </article>`);
    }
    if (pmIns?.castleDrop) {
      const cd = pmIns.castleDrop;
      pmInsightCards.push(`<article class="pm-ins-card ${cd.tone === 'win' ? 'is-gold' : 'is-loss'}">
        <span class="pm-icon-tile ${cd.tone === 'win' ? 'is-gold' : 'is-rose'} sm">${reportIcon('castle')}</span>
        <div class="pm-ins-copy">
          <span class="pm-ins-k">CASTLE DROP</span>
          <strong>${esc(cd.title)}</strong>
          <small>${esc(cd.detail)}</small>
        </div>
      </article>`);
    }
    const chronicleStrip = pmIns?.replayChronicle?.badges?.length
      ? `<div class="pm-chronicle-strip" aria-label="Crónica del replay"><span class="pm-chronicle-k">${esc(tr('pm.chronicleKicker', 'CRÓNICA DEL REPLAY'))}</span>${pmIns.replayChronicle.badges.map((b) => `<span class="pm-chronicle-pill is-${esc(b.tone || 'neutral')}">${esc(b.label)}</span>`).join('')}</div>`
      : '';
    const pmInsightsBlock = (pmInsightCards.length || chronicleStrip)
      ? `<section class="pm-insights-v6" aria-label="Lectura táctica y curiosidades del replay">
          ${pmInsightCards.length ? `<div class="pm-ins-grid">${pmInsightCards.slice(0, 6).join('')}</div>` : ''}
          ${chronicleStrip}
        </section>`
      : '';

    return `<div class="pm-v2 detail is-${result.status === 'won' ? 'won' : result.status === 'lost' ? 'lost' : 'neutral'}">
      ${header}
      ${verdictBar}
      ${trophyBanner}
      ${openingBar}
      ${stageStrip}
      ${narrativeGrid}
      ${pmInsightsBlock}
      ${civMasteryBlock}
      ${focusShort}
      ${deepDive}
      <footer class="pm-foot"><span>${esc(tr('postmatch.localReplay', report.data?.sourceLabel || 'Replay local'))}</span><span>${showPersonal && report.mapBenchmark?.games ? `${number(report.mapBenchmark.wins)} V · ${number(report.mapBenchmark.losses)} D previas · ${esc(locMap(c.mapName) || c.mapName)}` : ''}</span></footer>
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
      : (access.compact ? '' : `<p class="intel-muted">${access.replayReason === 'disabled' ? 'Las métricas de replay están desactivadas en tus preferencias.' : 'Las métricas de replay y calificaciones están incluidas en Ultra.'}</p>`);
    const source = report.data && report.data.hasTelemetry
      ? report.data.sourceLabel
      : analysis.status === 'locked' ? tr('pm.replayLockedUltra', 'El análisis del replay está incluido en Ultra.')
        : scanning ? tr('pm.replayAutoScan', 'El replay se descarga y analiza automáticamente. Esto puede tardar unos segundos.')
          : analysis.status === 'error' ? tr('pm.replayErrRetry', 'Resultado confirmado. Podés volver a intentar desde Ajustes.')
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
          access.comparison !== false && !execution ? tr('pm.ecoNoComparable', 'Economía sin medición comparable') : ''].filter(Boolean).join(' · ') : '';
      const footer = coverage || compactApm || report.data?.hasTelemetry
        ? `<div class="review-compact-footer">${compactApm}${coverage ? `<span>${esc(coverage)}</span>` : ''}<small>Detalle del replay en Ajustes → Postmatch</small></div>` : '';
      return header + episode + impact + execution + arrivals + mapBody + (scanning ? scan : '') + warning + footer;
    }
    return header + episode + arrivals + replayBody + warning +
      (access.comparison !== false ? mapBody + historyMoments : `<p class="intel-muted">${access.comparisonReason === 'disabled' ? 'La comparación con tu historial está desactivada en tus preferencias.' : 'La evolución en este mapa está incluida en Ultra.'}</p>`) +
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
      const intlLocale = (typeof root !== 'undefined' && root.AppI18n && typeof root.AppI18n.getIntlLocale === 'function')
        ? root.AppI18n.getIntlLocale()
        : 'es-AR';
      return new Date(ts).toLocaleDateString(intlLocale, { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  }

  function renderRecentMatchesList(matches = [], { selectedMatchId = null, mode = 'list', limit = 10, jumpToPostmatch = false } = {}) {
    const list = (Array.isArray(matches) ? matches : []).slice(0, limit);
    if (!list.length) {
      return `<div class="central-empty-matches"><p>${esc(tr('central.noMatchesYet', 'Todavía no hay partidas recientes registradas para esta cuenta.'))}</p></div>`;
    }
    const items = list.map((m) => {
      const isSelected = selectedMatchId != null && String(m.matchId) === String(selectedMatchId);
      const outcomeCls = m.won === true ? 'is-win' : m.won === false ? 'is-loss' : 'is-pending';
      const outcomeWord = m.won === true
        ? tr('cx.rmWin', 'VICTORIA')
        : m.won === false
          ? tr('cx.rmLoss', 'DERROTA')
          : tr('cx.rmMatch', 'PARTIDA');
      const mapLabel = locMap(m.mapName) || m.mapName || '—';
      const myCivName = locCiv(m.myCiv) || m.myCiv || '?';
      const rivalCivName = locCiv(m.rivalCiv) || m.rivalCiv || '?';
      const diffVal = m.myRatingDiff != null && Number.isFinite(Number(m.myRatingDiff)) ? Number(m.myRatingDiff) : null;
      const diffTxt = diffVal != null
        ? `<strong class="rm-diff-hero ${diffVal >= 0 ? 'win' : 'loss'}">${diffVal >= 0 ? '+' : ''}${diffVal}</strong>`
        : `<strong class="rm-diff-hero neutral">${m.won === true ? esc(cxW()) : m.won === false ? esc(cxL()) : '·'}</strong>`;
      const ratingTxt = m.myRating != null ? `<span class="rm-elo">${number(m.myRating)} ELO</span>` : '';
      const durTxt = m.durationSeconds != null ? clock(m.durationSeconds) : '';
      const timeTxt = fmtRelativeTime(m.finishedAt || m.startedAt);
      const extraTag = m.extraRivals > 0 ? ` +${m.extraRivals}` : '';
      const rivalEloTxt = m.rivalRating != null ? ` (${number(m.rivalRating)})` : '';
      const replayBadge = isSelected
        ? `<span class="rm-telemetry is-active-view">${esc(tr('cx.rmViewing', 'VIENDO'))}</span>`
        : (m.hasTelemetry
          ? `<span class="rm-telemetry is-ready" title="${esc(tr('central.replayReady', 'Replay analizado'))}">${esc(tr('cx.rmReplayBadge', '★ Replay'))}</span>`
          : `<span class="rm-telemetry">${esc(tr('central.viewReport', 'Informe'))}</span>`);
      const mapSrc = typeof mapArtPath === 'function' ? mapArtPath(m.mapName) : null;
      const mapWash = mapSrc ? `<img class="rm-map-wash" src="${esc(mapSrc)}" alt="" aria-hidden="true" draggable="false"/>` : '';
      return `<button type="button" class="rm-card rm-epic ${outcomeCls}${isSelected ? ' is-selected' : ''}" data-match-id="${esc(m.matchId)}" aria-pressed="${isSelected}">
        ${mapWash}
        <span class="rm-arena">
          <span class="rm-map-frame">
            ${mapBadge(m.mapName, 'md')}
            <em class="rm-outcome-pill">${esc(outcomeWord)}</em>
          </span>
          <span class="rm-clash" aria-hidden="true">
            <span class="rm-crest is-self">${civBadge(m.myCiv)}</span>
            <span class="rm-vs-medallion">VS</span>
            <span class="rm-crest is-rival">${civBadge(m.rivalCiv)}</span>
          </span>
        </span>
        <span class="rm-identity">
          <span class="rm-id-top">
            <strong class="rm-map-title">${esc(mapLabel)}</strong>
            <span class="rm-mode-pill">${esc(m.modeLabel || tr('cx.rmDefaultMode', 'Partida'))}</span>
          </span>
          <span class="rm-id-mid">${esc(myCivName)} <em>vs</em> ${esc(rivalCivName)}</span>
          <span class="rm-id-sub">vs <b>${esc(m.rivalName || 'Rival')}${esc(extraTag)}</b>${esc(rivalEloTxt)}${durTxt || timeTxt ? ` · ${esc([durTxt, timeTxt].filter(Boolean).join(' · '))}` : ''}</span>
        </span>
        <span class="rm-telemetry-col">
          ${diffTxt}
          ${ratingTxt}
          ${replayBadge}
        </span>
      </button>`;
    }).join('');

    return `<div class="rm-list rm-epic-list rm-mode-${esc(mode)}" role="list">${items}</div>`;
  }

  function getCxIntlLocale() {
    const api = getI18n();
    const loc = api && typeof api.getLocale === 'function' ? api.getLocale() : 'es-MX';
    if (loc === 'en') return 'en-US';
    if (loc === 'zh-CN') return 'zh-CN';
    return loc || 'es-MX';
  }
  const cxW = () => tr('cx.wShort', 'V');
  const cxL = () => tr('cx.lShort', 'D');
  const cxPj = () => tr('cx.pj', 'pj');
  const cxWL = (w, l) => `${number(w)}${cxW()}-${number(l)}${cxL()}`;
  const cxRecSp = (w, l) => `${number(w)} ${cxW()} · ${number(l)} ${cxL()}`;

  const CX_AXIS_KEYS = { aggro: 'cx.axisAggro', rhythm: 'cx.axisRhythm', clutch: 'cx.axisClutch', versatility: 'cx.axisVersatility', late: 'cx.axisLate' };
  const CX_ARCH_TITLE_KEYS = {
    'Señor de los Establos': ['cx.archStableTitle', 'cx.archStableTag'],
    'Maestro Especialista': ['cx.archOtpTitle', 'cx.archOtpTag'],
    'Aplanadora de Feudal': ['cx.archFeudalTitle', 'cx.archFeudalTag'],
    'Relámpago de Castillos': ['cx.archCastleTitle', 'cx.archCastleTag'],
    'Titán del Post-Imperial': ['cx.archPostImpTitle', 'cx.archPostImpTag'],
    'Estratega Camaleón': ['cx.archChameleonTitle', 'cx.archChameleonTag'],
    'Comandante Versátil': ['cx.archBalancedTitle', 'cx.archBalancedTag'],
    'Comandante Equilibrado': ['cxe.archBalancedTitle', 'cxe.archBalancedTag'],
  };
  const CX_DAY_MAP = { Dom: 'cxe.day0', Lun: 'cxe.day1', Mar: 'cxe.day2', 'Mié': 'cxe.day3', Jue: 'cxe.day4', Vie: 'cxe.day5', 'Sáb': 'cxe.day6' };
  const CX_OTP_MAP = { 'Especialista (OTP)': 'cxe.otpSpecialist', 'Camaleón versátil': 'cxe.otpChameleon', 'Pool flexible': 'cxe.otpFlexible' };
  const CX_CONF_MAP = {
    'Confianza alta': 'cxe.confHigh',
    'Confianza media': 'cxe.confMed',
    'Muestra moderada': 'cxe.confMod',
    'Señal moderada': 'cxe.confLow',
    'Patrón sólido': 'cxe.confSolid',
    'Tendencia inicial': 'cxe.confInit',
    'Muestra chica': 'cxe.confSmall',
  };
  const CX_META_TAG_MAP = { 'Equilibrado vs Meta': 'cxe.metaBalanced', 'Cazador de Meta': 'cxe.metaHunter', 'Sufre contra el Meta': 'cxe.metaStruggle', 'Domina el Meta': 'cxe.metaDominate' };
  const CX_RESIGN_TAG_MAP = { 'GG Rápido': 'cxe.resignFast', 'Hasta el Último Aldeano': 'cxe.resignWarrior', 'Rendición Pragmática': 'cxe.resignPragmatic' };
  const CX_HUNTER_TAG_MAP = { 'Asesino de Boomers': 'cxe.hunterBoom', 'Muro Anti-Rush': 'cxe.hunterRush', 'Vulnerable al Rush': 'cxe.hunterVulnRush', 'Cede ante Boomers': 'cxe.hunterVulnBoom' };
  const CX_SESS_BUCKET_KEYS = { cold: 'cxe.sess_cold', warm: 'cxe.sess_warm', fatigue: 'cxe.sess_fatigue', tilt: 'cxe.sess_tilt' };
  const CX_BLOCK_KEYS = { morning: 'cx.blockMorning', afternoon: 'cx.blockAfternoon', evening: 'cx.blockEvening', night: 'cx.blockNight' };
  const CX_PHASE_KEYS = {
    feudal: 'cx.phaseFeudal',
    castle: 'cx.phaseCastle',
    imperial: 'cx.phaseImperial',
    postimp: 'cx.phasePostImp',
    Feudal: 'cx.phaseFeudal',
    Castillos: 'cx.phaseCastle',
    Imperial: 'cx.phaseImperial',
    'Post-Imp': 'cx.phasePostImp',
    'Post-Imperial': 'cx.phasePostImp',
  };
  const CX_CLOCK_KEYS = { feudal: 'cx.clockFeudal', firstMil: 'cx.clockFirstMil', castle: 'cx.clockCastle', imperial: 'cx.clockImperial' };
  const CX_VERDICT_KEYS = { strength: 'cx.verdictStrength', weakness: 'cx.verdictWeakness', polarized: 'cx.verdictPolarized', balanced: 'cx.verdictBalanced', sample: 'cx.verdictSample' };
  const CX_LM_KEYS = { duration: 'cx.lmDuration', eapm: 'cx.lmEapm', tc: 'cx.lmTc', windowWr: 'cx.lmWindowWr' };
  const locCxModeLabel = (id, label) => (id === 'global' || String(label || '').toLowerCase() === 'global' ? tr('cx.modeGlobal', 'Global') : (label || ''));

  function locRef(ref, fallback = '') {
    if (!Array.isArray(ref) || !ref[0]) return fallback || '';
    const rawVars = ref[1];
    let vars = null;
    if (rawVars && typeof rawVars === 'object') {
      vars = { ...rawVars };
      if (vars._civ) vars.civ = locCiv(vars._civ) || vars._civ;
      if (vars._civ2) vars.civ2 = locCiv(vars._civ2) || vars._civ2;
      if (vars._map) vars.map = locMap(vars._map) || vars._map;
      if (vars._opening) vars.opening = locOpening(vars._opening, vars._opening);
      if (vars._terrain) vars.terrain = locCxTerrain(vars._terrain);
      if (vars._phase) vars.phase = locCxPhase({ label: vars._phase });
      if (vars._gBlock) vars.gBlock = locCxBlock({ id: vars._gBlock, label: vars._gBlock });
      if (vars._cBlock) vars.cBlock = locCxBlock({ id: vars._cBlock, label: vars._cBlock });
      if (vars._w != null && vars._l != null) vars.rec = cxWL(vars._w, vars._l);
    }
    return tr(ref[0], fallback || '', vars);
  }
  const locCxDay = (lbl) => (CX_DAY_MAP[lbl] ? tr(CX_DAY_MAP[lbl], lbl) : (lbl || ''));
  const locCxOtp = (lbl) => (CX_OTP_MAP[lbl] ? tr(CX_OTP_MAP[lbl], lbl) : (lbl || ''));
  const locCxConf = (lbl, ref) => (ref ? locRef(ref, lbl) : (CX_CONF_MAP[lbl] ? tr(CX_CONF_MAP[lbl], lbl) : (lbl || '')));
  const locCxMetaTag = (lbl) => (CX_META_TAG_MAP[lbl] ? tr(CX_META_TAG_MAP[lbl], lbl) : (lbl || ''));
  const locCxResignTag = (lbl) => (CX_RESIGN_TAG_MAP[lbl] ? tr(CX_RESIGN_TAG_MAP[lbl], lbl) : (lbl || ''));
  const locCxHunterTag = (lbl) => (CX_HUNTER_TAG_MAP[lbl] ? tr(CX_HUNTER_TAG_MAP[lbl], lbl) : (lbl || ''));
  const locCxFindingMetric = (f) => {
    if (f?.i18n?.metric) return locRef(f.i18n.metric, f.metric || '');
    if (Array.isArray(f?.metricWL) && f.metricWL.length === 3) {
      return `${f.metricWL[0]}% WR (${cxWL(f.metricWL[1], f.metricWL[2])})`;
    }
    return f?.metric || '';
  };

  function locCxAxis(ax) {
    const k = ax && CX_AXIS_KEYS[ax.id];
    return k ? tr(k, ax.label) : (ax?.label || '');
  }
  function locCxBlock(b) {
    const k = b && CX_BLOCK_KEYS[b.id];
    return k ? tr(k, b.label) : (b?.label || '');
  }
  function locCxColor(c) {
    if (!c) return '';
    return c.id ? tr(`cx.color${c.id}`, c.name || '') : (c.name || '');
  }
  function locCxPhase(p) {
    const k = p && (CX_PHASE_KEYS[p.id] || CX_PHASE_KEYS[p.label]);
    if (k) return tr(k, p.label);
    const api = getI18n();
    return api && typeof api.locText === 'function' ? api.locText(p?.label || '') : (p?.label || '');
  }
  function locCxClock(m) {
    const k = m && CX_CLOCK_KEYS[m.id];
    return k ? tr(k, m.label) : (m?.label || '');
  }
  function locCxVerdict(verdict, fallback) {
    const k = CX_VERDICT_KEYS[verdict];
    return k ? tr(k, fallback || '') : (fallback || '');
  }
  function locCxTerrain(label) {
    const s = String(label || '').toLowerCase();
    if (s.includes('abierto')) return tr('cx.terrainOpen', 'Abierto');
    if (s.includes('cerrado')) return tr('cx.terrainClosed', 'Cerrado');
    if (s.includes('agua') || s.includes('híbrido') || s.includes('hibrido')) return tr('cx.terrainWater', 'Agua / Híbrido');
    if (s.includes('nómada') || s.includes('nomada') || s.includes('especial')) return tr('cx.terrainNomad', 'Nómada / Especial');
    return label || tr('cx.terrainMap', 'Mapa');
  }
  function locCxLmLabel(m) {
    const k = m && CX_LM_KEYS[m.id];
    return k ? tr(k, m.label) : (m?.label || '');
  }

  function fmtShortDate(ts) {
    if (!Number.isFinite(ts) || ts <= 0) return '';
    try {
      return new Date(ts).toLocaleDateString(getCxIntlLocale(), { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  }

  function renderInteractiveEloChart(mode, eloRange = '20', { planTier = 'ultra' } = {}) {
    const allPts = Array.isArray(mode.eloSeries) ? mode.eloSeries.filter((p) => Number.isFinite(p.rating)) : [];
    const ladderLabel = mode.label || 'RM 1v1';
    if (allPts.length < 2) {
      return `<section class="cx-card cx-chart-card">
        <div class="central-chart-empty"><p>${esc(tr('central.eloChartEmpty', 'Jugá al menos 2 partidas rankeadas en este modo para trazar tu curva de ELO.'))}</p></div>
      </section>`;
    }

    const isUltraTier = planTier === 'ultra';
    const isProOrUltra = planTier === 'pro' || isUltraTier;
    const reqRange = String(eloRange || '');
    let activeRange = '20';
    if (planTier === 'free') {
      activeRange = '10';
    } else if (planTier === 'pro') {
      activeRange = reqRange === '10' ? '10' : '20';
    } else {
      if (reqRange === '10') activeRange = '10';
      else if (reqRange === '20') activeRange = '20';
      else if ((reqRange === '100' || reqRange === '30') && allPts.length > 50) activeRange = '100';
      else if (reqRange === 'all' && allPts.length > 20) activeRange = 'all';
      else activeRange = allPts.length > 50 ? '100' : (allPts.length > 20 ? 'all' : '20');
    }

    const pts = activeRange === 'all'
      ? allPts
      : activeRange === '100'
        ? allPts.slice(-100)
        : activeRange === '10'
          ? allPts.slice(-10)
          : allPts.slice(-20);

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

    // P1-3: Incluir diff de la primera partida del tramo parcial para medir exactamente las N partidas
    const net = (lastPt.rating - firstPt.rating) + (pts.length < allPts.length ? (Number(firstPt.diff) || 0) : 0);
    const netDelta = `${net > 0 ? '+' : ''}${net}`;
    const netPill = `<span class="cx-delta ${net > 0 ? 'win' : net < 0 ? 'loss' : 'neutral'}">${esc(tr('cx.eloInSpan', '{delta} ELO en el tramo', { delta: netDelta }))}</span>`;
    const btn20 = isProOrUltra
      ? `<button type="button" class="central-range-btn${activeRange === '20' ? ' active' : ''}" aria-pressed="${activeRange === '20'}" data-elo-range="20">${esc(tr('cx.lastN', 'Últ. {n}', { n: 20 }))}</button>`
      : `<button type="button" class="central-range-btn is-tier-locked" data-goto-plan="1" data-upgrade-tier="pro" title="${esc(tr('cx.availPro', 'Disponible con Pro'))}">${esc(tr('cx.lastNPro', 'Últ. {n} · PRO', { n: 20 }))}</button>`;
    const btn100 = allPts.length > 50
      ? (isUltraTier
        ? `<button type="button" class="central-range-btn${activeRange === '100' ? ' active' : ''}" aria-pressed="${activeRange === '100'}" data-elo-range="100">${esc(tr('cx.lastN', 'Últ. {n}', { n: 100 }))}</button>`
        : `<button type="button" class="central-range-btn is-tier-locked" data-goto-plan="1" title="${esc(tr('cx.availUltra', 'Disponible con Ultra'))}">${esc(tr('cx.lastNUltra', 'Últ. {n} · ULTRA', { n: 100 }))}</button>`)
      : '';
    const btnAll = allPts.length > 20
      ? (isUltraTier
        ? `<button type="button" class="central-range-btn${activeRange === 'all' ? ' active' : ''}" aria-pressed="${activeRange === 'all'}" data-elo-range="all">${esc(tr('cx.totalN', 'Total ({n})', { n: allPts.length }))}</button>`
        : `<button type="button" class="central-range-btn is-tier-locked" data-goto-plan="1" title="${esc(tr('cx.availUltra', 'Disponible con Ultra'))}">${esc(tr('cx.totalNUltra', 'Total ({n}) · ULTRA', { n: allPts.length }))}</button>`)
      : '';
    const rangePills = allPts.length > 10 ? `<div class="central-range-pills" role="group" aria-label="${esc(tr('cx.rangeAria', 'Rango de partidas'))}">
      <button type="button" class="central-range-btn${activeRange === '10' ? ' active' : ''}" aria-pressed="${activeRange === '10'}" data-elo-range="10">${esc(tr('cx.lastN', 'Últ. {n}', { n: 10 }))}</button>
      ${btn20}
      ${btn100}
      ${btnAll}
    </div>` : `<span class="cx-meta-pill">${pts.length} ${esc(tr('cx.gamesWord', 'partidas'))}</span>`;

    const formPips = (mode.recentForm || []).map((f) =>
      `<span class="cx-pip ${f.won ? 'win' : 'loss'}" title="${esc(`${f.won ? tr('cx.winWord', 'Victoria') : tr('cx.lossWord', 'Derrota')}${f.rating ? ` · ${f.rating} ELO` : ''}${f.diff ? ` (${f.diff >= 0 ? '+' : ''}${f.diff})` : ''}`)}">${esc(f.won ? cxW() : cxL())}</span>`
    ).join('');
    const last10Txt = mode.last10
      ? `<span class="cx-last10">${esc(tr('cx.lastN', 'Últ. {n}', { n: mode.last10.games }))}: <b>${esc(cxWL(mode.last10.wins, mode.last10.losses))}</b>${mode.last10.netElo != null ? ` · <em class="${mode.last10.netElo >= 0 ? 'win' : 'loss'}">${mode.last10.netElo >= 0 ? '+' : ''}${mode.last10.netElo}</em>` : ''}</span>`
      : '';

    const serializedPts = esc(JSON.stringify(coords));

    return `<section class="cx-card cx-chart-card">
      <header class="cx-chart-head">
        <div class="cx-chart-title">
          <h3>${esc(tr('cx.eloEvolution', 'Evolución de ELO'))}</h3>
          <div class="cx-chart-nums">
            <strong>${number(lastPt.rating)}</strong>
            ${netPill}
          </div>
        </div>
        ${rangePills}
      </header>
      <div class="cx-chart-stage" tabindex="0" aria-label="${esc(tr('cx.eloEvolution', 'Evolución de ELO'))}" data-chart-points="${serializedPts}" data-chart-w="${w}" data-chart-h="${h}">
        <svg class="cx-chart-svg central-elo-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(tr('cx.eloEvolution', 'Evolución de ELO'))}">
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
      <p class="cx-chart-coverage">${esc(tr('cx.chartCoverage', '{mode} · {n} partidas · {from} a {to} · Pico del tramo {peak}', { mode: ladderLabel, n: pts.length, from: firstPt.date, to: lastPt.date, peak: number(rawMax) }))}</p>
      ${formPips ? `<footer class="cx-chart-foot">
        <span class="cx-foot-label">${esc(tr('cx.recentForm', 'Forma reciente'))}</span>
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
          <small>${number(l.games)} ${esc(cxPj())}${l.rank ? ` · #${number(l.rank)}` : ''}</small>
        </div>
        <div class="global-ladder-track-wrap">
          <div class="global-ladder-track">
            <i class="global-bar-peak" data-w="${peakW}"></i>
            <i class="global-bar-cur" data-w="${curW}"></i>
          </div>
          <div class="global-ladder-nums">
            <span><b>${number(l.rating)}</b> ELO · ${esc(tr('cx.eloPeakShort', 'pico'))} <em>${number(l.peak || l.rating)}</em></span>
            <span class="${wrTone}"><b>${l.winRate ?? '—'}% WR</b> (${esc(cxWL(l.wins, l.losses))})</span>
          </div>
        </div>
      </button>`;
    }).join('');

    return `<section class="cx-card">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.globalLaddersEyebrow', 'RESUMEN DE LADDERS ACTIVOS'))}</span>
          <h3>${esc(tr('cx.globalLaddersTitle', 'ELO actual y pico histórico por modo'))}</h3>
        </div>
        <span class="cx-meta-pill">${esc(tr('cx.clickModeEnter', 'Toca cualquier modo para entrar'))}</span>
      </header>
      <div class="global-ladders-list">${rows}</div>
    </section>`;
  }

  function wrapUltraGate(innerHtml, { locked = false, ctaLabel = '', compact = false } = {}) {
    if (!locked) return innerHtml;
    const rawLabel = ctaLabel || tr('central.ultraUnlockDefault', 'Ver este análisis en detalle');
    const softLabel = String(rawLabel)
      .replace(/^Desbloque[a\u00e1] tu\s+/i, 'Ver tu ')
      .replace(/^Desbloque[a\u00e1] tus\s+/i, 'Ver tus ')
      .replace(/^Desbloque[a\u00e1]\s+/i, 'Ver ');
    return `<div class="cx-ultra-gate${compact ? ' is-compact' : ''}">
      <div class="cx-ultra-blur" aria-hidden="true" inert>${innerHtml}</div>
      <button type="button" class="cx-ultra-veil" data-goto-plan="1" data-upgrade-tier="ultra" data-upgrade-context="${esc(softLabel)}">
        <span class="cx-ultra-pill">
          <svg class="cx-ultra-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l-1.5-9L8 12l4-6 4 6 5.5-4L20 17H4zm1 2h14v2H5v-2z" fill="currentColor"/></svg>
          <span>${esc(tr('cx.includedUltra', 'Incluido en Ultra'))}</span>
        </span>
        <strong>${esc(softLabel)}</strong>
      </button>
    </div>`;
  }

  function renderMasteryRows(items = [], { kind = 'civ', selectedCivSlug = null, selectedMapKey = null, mapSort = 'games', isUltra = true, maxEapm = 90 } = {}) {
    if (!Array.isArray(items) || !items.length) {
      return `<p class="intel-muted">${esc(tr('central.noDataYet', 'Sin datos suficientes en este modo.'))}</p>`;
    }
    return items.map((item) => {
      const wr = item.winRate;
      const wrTone = wr >= 55 ? 'win' : wr < 45 ? 'loss' : 'neutral';
      const title = kind === 'civ'
        ? (locCiv(item.civ) || item.civ)
        : (locMap(item.mapName) || item.mapName);
      const crest = kind === 'civ' ? civBadge(item.civ) : mapBadge(item.mapName, 'sm');

      if (kind === 'civ') {
        const slug = item.slug || String(item.civ || '').toLowerCase();
        const active = selectedCivSlug && slug === selectedCivSlug;
        return `<button type="button" class="cx-entity-row is-civ-btn${active ? ' is-selected' : ''}" data-diag-civ="${esc(slug)}" aria-pressed="${Boolean(active)}">
          <span class="central-entity-crest">${crest}</span>
          <div class="cx-entity-main">
            <div class="cx-entity-top">
              <strong>${esc(title)} <small class="pick-share">${number(item.games)} ${esc(cxPj())}</small></strong>
              <span class="cx-entity-stat"><small>${esc(cxWL(item.wins, item.losses))}</small> <b class="${wrTone}">${wr != null ? `${wr}%` : '—'}</b></span>
            </div>
            ${wr != null ? `<div class="central-bar-track has-mid" aria-hidden="true"><i class="bar-${wrTone === 'win' ? 'emerald' : wrTone === 'loss' ? 'rose' : 'gold'}" data-w="${Math.max(0, Math.min(100, wr))}"></i></div>` : `<small class="cx-missing-result">${esc(tr('cx.noConfirmedResults', 'Sin resultados confirmados'))}</small>`}
          </div>
        </button>`;
      }

      // Map row interactivo con eAPM integrado (Master-Detail de Diagnóstico por Mapa)
      const mapKeyAttr = String(item.mapKey || item.mapName || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const activeMap = selectedMapKey && mapKeyAttr === selectedMapKey;
      const hasEapm = Number.isFinite(item.avgEapm);
      const eapmDeltaTxt = hasEapm && Number.isFinite(item.eapmDelta) && item.eapmDelta !== 0
        ? `<em class="cx-map-eapm-delta ${item.eapmDelta > 0 ? 'win' : 'loss'}">${item.eapmDelta > 0 ? '+' : ''}${dec(item.eapmDelta, 1)}</em>`
        : '';
      const eapmBadge = hasEapm
        ? (isUltra
          ? `<span class="cx-map-eapm" title="${esc(`${item.eapmSample || 0} ${tr('cx.replaysWord', 'replays')}${item.avgApm ? ` · ${dec(item.avgApm, 1)} APM` : ''}`)}">${dec(item.avgEapm, 1)} eAPM ${eapmDeltaTxt}</span>`
          : `<span class="cx-map-eapm is-blurred" aria-hidden="true">${dec(item.avgEapm, 1)} eAPM</span>`)
        : '';
      const showEapmBar = mapSort === 'eapm' && hasEapm;
      const barPct = showEapmBar
        ? Math.max(12, Math.min(100, Math.round((item.avgEapm / Math.max(45, maxEapm)) * 100)))
        : (wr != null ? Math.max(0, Math.min(100, wr)) : 0);
      const barColor = showEapmBar ? 'gold' : (wrTone === 'win' ? 'emerald' : wrTone === 'loss' ? 'rose' : 'gold');
      return `<button type="button" class="cx-entity-row is-map-row is-map-btn${activeMap ? ' is-selected' : ''}" data-diag-map="${esc(mapKeyAttr)}" data-map-row="${esc(mapKeyAttr)}" aria-pressed="${Boolean(activeMap)}">
        <span class="central-entity-crest is-map">${crest}</span>
        <div class="cx-entity-main">
          <div class="cx-entity-top">
            <strong class="cx-map-row-name">${esc(title)}</strong>
            <b class="cx-map-row-wr ${wrTone}">${wr != null ? `${wr}%` : '—'}</b>
          </div>
          <div class="cx-map-row-sub">
            <small>${number(item.games)} ${esc(cxPj())} · ${esc(cxWL(item.wins, item.losses))}</small>
            ${eapmBadge}
          </div>
          ${showEapmBar || wr != null ? `<div class="central-bar-track${showEapmBar ? '' : ' has-mid'}" aria-hidden="true"><i class="bar-${barColor}" data-w="${barPct}"></i></div>` : `<small class="cx-missing-result">${esc(tr('cx.noConfirmedResults', 'Sin resultados confirmados'))}</small>`}
        </div>
      </button>`;
    }).join('');
  }

  function renderCivDiagnosticPanel(diag, { activeTab = 'maps', isUltra = true, modeLabel = 'RM 1v1' } = {}) {
    if (!diag || !diag.ok) {
      return `<div class="cx-diag-empty"><p>${esc(tr('central.diagSelectCiv', 'Elegí una civilización de la lista para ver tu diagnóstico.'))}</p></div>`;
    }
    const civName = locCiv(diag.civ) || diag.civ;
    const verdictCls = {
      strength: 'is-win',
      weakness: 'is-loss',
      polarized: 'is-polar',
      balanced: 'is-neutral',
      sample: 'is-muted',
    }[diag.verdict] || 'is-neutral';

    const s = diag.sample || {};
    const deltaTxt = Number.isFinite(s.deltaPp) && s.games >= 5
      ? `<span class="cx-delta ${s.deltaPp > 0 ? 'win' : s.deltaPp < 0 ? 'loss' : 'neutral'}">${esc(tr('cx.deltaExpected', '{delta} pp vs esperado', { delta: `${s.deltaPp > 0 ? '+' : ''}${s.deltaPp}` }))}</span>`
      : '';
    const allTimeBadge = s.allTime && s.allTime.games > (s.games || 0)
      ? `<span class="cx-diag-meta-chip">${esc(tr('cx.historicalBadge', 'Histórico: {wr}% ({n} pj)', { wr: s.allTime.winRate, n: number(s.allTime.games) }))}</span>`
      : '';

    const headerHtml = `<div class="cx-diag-head">
      <div class="cx-diag-id">
        ${svgWrRing(s.rawWinRate, civBadge(diag.civ), 74)}
        <div class="cx-diag-id-copy">
          <div class="cx-diag-title-row">
            <h4>${esc(civName)}</h4>
            <span class="cx-verdict-pill ${verdictCls}">${esc(locCxVerdict(diag.verdict, diag.verdictLabel || tr('cx.balancedFem', 'Equilibrada')))}</span>
          </div>
          <div class="cx-diag-anchor">
            <strong class="cx-diag-big-wr">${s.rawWinRate != null ? `${s.rawWinRate}%` : '—'}</strong>
            <span>${esc(cxWL(s.wins || 0, s.losses || 0))} · ${number(s.games || 0)} ${esc(cxPj())} · ${esc(modeLabel)}</span>
            ${deltaTxt}
            <span class="cx-diag-conf">${esc(locCxConf(diag.confidenceLabel, diag.confidenceI18n))}</span>
            ${allTimeBadge}
          </div>
        </div>
      </div>
    </div>`;

    const locDiagText = (txt) => {
      if (!txt || !diag.civ || !civName || civName === diag.civ) return txt || '';
      return String(txt).replace(new RegExp(`\\b${diag.civ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), civName);
    };

    const divAlert = diag.historicalDivergence
      ? `<div class="cx-diag-alert is-${diag.historicalDivergence.direction === 'up' ? 'win' : 'warn'}">
          <strong>${esc(diag.historicalDivergence.direction === 'up' ? tr('cx.recentSurge', 'En alza reciente') : tr('cx.recentSlump', 'Bache reciente'))}</strong>
          <span>${esc(diag.historicalDivergence.detailI18n ? locRef(diag.historicalDivergence.detailI18n, diag.historicalDivergence.detail) : locDiagText(diag.historicalDivergence.detail))}</span>
        </div>`
      : '';

    const ctxAlerts = (diag.contextAlerts || []).map((a) => {
      const aTitle = a.i18n?.title ? locRef(a.i18n.title, a.title) : locDiagText(a.title);
      const aMet = a.i18n?.metric ? locRef(a.i18n.metric, a.metric || '') : (a.metric || '');
      const aDet = a.i18n?.detail ? locRef(a.i18n.detail, a.detail) : locDiagText(a.detail);
      return `<div class="cx-diag-alert is-${esc(a.tone || 'info')}">
      <strong>${esc(aTitle)}${aMet ? ` · ${esc(aMet)}` : ''}</strong>
      <span>${esc(aDet)}</span>
    </div>`;
    }).join('');

    let findingsHtml = '';
    if (diag.status === 'insufficient') {
      const progressPct = Math.min(100, Math.round(((s.games || 0) / (s.needed || 5)) * 100));
      findingsHtml = `<div class="cx-diag-sample-gate">
        <p>${esc(diag.summaryI18n ? locRef(diag.summaryI18n, diag.summaryLine) : diag.summaryLine)}</p>
        <div class="central-bar-track sm" aria-hidden="true"><i class="bar-gold" data-w="${progressPct}"></i></div>
        <small>${esc(tr('cx.sampleDetailCiv', '{have}/{need} partidas con detalle para detectar patrones repetidos', { have: number(s.games || 0), need: number(s.needed || 5) }))}</small>
      </div>`;
    } else if (diag.findings && diag.findings.length) {
      findingsHtml = `<div class="cx-diag-findings">${diag.findings.map((f) => {
        const arrow = f.tone === 'loss' ? '▼' : '▲';
        const tags = (f.secondaryTags || []).length
          ? `<span class="cx-diag-tags">${f.secondaryTags.map((tg) => `<em>${esc(tg)}</em>`).join('')}</span>`
          : '';
        const mapJump = f.dimension === 'map'
          ? ` data-scroll-target="#cxSectionMaps"`
          : '';
        const fTitle = f.i18n?.title ? locRef(f.i18n.title, f.title) : f.title;
        const fMetric = locCxFindingMetric(f);
        const fDetail = f.i18n?.detail ? locRef(f.i18n.detail, f.detail || '') : (f.detail || '');
        const fTakeaway = f.i18n?.takeaway ? locRef(f.i18n.takeaway, f.takeaway || '') : (f.takeaway || '');
        return `<article class="cx-diag-finding is-${esc(f.tone)}${mapJump ? ' is-jumpable' : ''}"${mapJump}>
          <div class="cx-diag-f-top">
            <span class="cx-diag-arrow">${arrow}</span>
            <strong>${esc(fTitle)}</strong>
            ${tags}
            <b class="cx-diag-f-metric">${esc(fMetric)}</b>
            ${f.tone === 'loss' ? trainDumbbellBtn({ source: 'Central · Civ', title: fTitle, detail: fTakeaway || fDetail, metric: fMetric, tab: 'matchups', compact: true }) : ''}
          </div>
          <p>${esc(fDetail)}</p>
          ${fTakeaway ? `<small class="cx-diag-takeaway">${esc(fTakeaway)}</small>` : ''}
        </article>`;
      }).join('')}</div>`;
    } else {
      findingsHtml = `<p class="cx-diag-neutral-note">${esc(diag.summaryI18n ? locRef(diag.summaryI18n, diag.summaryLine) : (diag.summaryLine || tr('cx.evenPerformance', 'Rendimiento parejo en los distintos escenarios analizados.')))}</p>`;
    }

    // Mini-desglose [ Mapas | Fases | Aperturas | Ritmo ]
    const bd = diag.breakdowns || {};
    const tabKey = ['maps', 'phases', 'openings', 'pace'].includes(activeTab) ? activeTab : 'maps';
    const renderMiniBars = (rows, emptyMsg, { withMapThumb = false } = {}) => {
      if (!Array.isArray(rows) || !rows.length) return `<p class="intel-muted">${esc(emptyMsg)}</p>`;
      return `<div class="cx-diag-bars">${rows.map((r) => {
        const tone = r.winRate >= 55 ? 'emerald' : r.winRate < 45 ? 'rose' : 'gold';
        const thumb = withMapThumb ? `<span class="cx-inline-map">${mapBadge(r.rawLabel || r.label, 'sm')}</span>` : '';
        return `<div class="cx-diag-bar-row">
          <span class="cx-diag-bar-lbl">${thumb}${esc(r.label)}${r.sub ? ` <small>${esc(r.sub)}</small>` : ''}</span>
          <div class="central-bar-track sm has-mid" aria-hidden="true"><i class="bar-${tone}" data-w="${Math.max(4, Math.min(100, r.winRate ?? 0))}"></i></div>
          <span class="cx-diag-bar-val"><small>${esc(cxWL(r.wins, r.losses))}</small> <b>${r.winRate != null ? `${r.winRate}%` : '—'}</b></span>
        </div>`;
      }).join('')}</div>`;
    };

    let tabBody = '';
    const locTxt = (s) => {
      const api = getI18n();
      return api && typeof api.locText === 'function' ? api.locText(s) : s;
    };
    if (tabKey === 'maps') {
      const localizedMaps = (bd.maps || []).map((r) => ({ ...r, rawLabel: r.label, label: locMap(r.label) || r.label }));
      tabBody = renderMiniBars(localizedMaps, tr('cx.noMapsData', 'Sin suficientes partidas con mapa registrado.'), { withMapThumb: true });
    } else if (tabKey === 'phases') {
      const localizedPhases = (bd.phases || []).map((r) => ({ ...r, label: locTxt(r.label), sub: r.sub ? locTxt(r.sub) : r.sub }));
      tabBody = renderMiniBars(localizedPhases, tr('cx.noPhasesData', 'Sin duraciones suficientes (reloj in-game).'));
    } else if (tabKey === 'openings') {
      const localizedOps = (bd.openings || []).map((r) => ({ ...r, label: locOpening(r.label) || locTxt(r.label), sub: r.sub ? locTxt(r.sub) : r.sub }));
      tabBody = renderMiniBars(localizedOps, tr('cx.noOpeningsCiv', 'Sin aperturas detectadas en replays para esta civ.'));
    } else {
      const p = bd.pace || {};
      tabBody = p.sample > 0
        ? `<div class="cx-diag-pace-grid">
            <div class="cx-stat-chip"><span>${esc(tr('cx.medianEapm', 'Mediana eAPM'))}</span><b>${dec(p.medianEapm, 1)}</b><small>${number(p.sample)} ${esc(tr('cx.replaysWord', 'replays'))}</small></div>
            ${p.baselineMedianEapm != null ? `<div class="cx-stat-chip"><span>${esc(tr('cx.vsOtherCivs', 'vs Otras civs'))}</span><b class="${(p.deltaEapm || 0) >= 0 ? 'win' : 'loss'}">${p.deltaEapm > 0 ? '+' : ''}${dec(p.deltaEapm, 1)}</b><small>${esc(tr('cx.meanVal', 'media {val}', { val: dec(p.baselineMedianEapm, 1) }))}</small></div>` : ''}
            ${p.outpacedWinRate != null ? `<div class="cx-stat-chip"><span>${esc(tr('cx.outpacingEapm', 'Superando eAPM'))}</span><b class="${p.outpacedWinRate >= 55 ? 'win' : ''}">${p.outpacedWinRate}%</b><small>${number(p.outpacedGames)} ${esc(cxPj())}</small></div>` : ''}
          </div>`
        : `<p class="intel-muted">${esc(tr('cx.noEapmCiv', 'Sin replays con eAPM registrado para esta civ.'))}</p>`;
    }

    const tabsHtml = `<div class="cx-diag-tabs-wrap">
      <div class="cx-sort-pills" role="tablist" aria-label="${esc(tr('central.diagTabsLabel', 'Desglose de civilización'))}">
        <button type="button" class="cx-sort-btn${tabKey === 'maps' ? ' active' : ''}" data-diag-tab="maps">${esc(tr('central.diagTabMaps', 'Mapas'))}</button>
        <button type="button" class="cx-sort-btn${tabKey === 'phases' ? ' active' : ''}" data-diag-tab="phases">${esc(tr('central.diagTabPhases', 'Fases'))}</button>
        <button type="button" class="cx-sort-btn${tabKey === 'openings' ? ' active' : ''}" data-diag-tab="openings">${esc(tr('central.diagTabOpenings', 'Aperturas'))}</button>
        <button type="button" class="cx-sort-btn${tabKey === 'pace' ? ' active' : ''}" data-diag-tab="pace">${esc(tr('central.diagTabPace', 'Ritmo'))}</button>
      </div>
      <div class="cx-diag-tab-body">${tabBody}</div>
    </div>`;

    const deepBody = `<div class="cx-diag-body">
      ${divAlert}
      ${ctxAlerts}
      ${findingsHtml}
      ${tabsHtml}
    </div>`;

    return `<div class="cx-diag-panel" id="cxCivDiagPanel">
      ${headerHtml}
      ${wrapUltraGate(deepBody, { locked: !isUltra, ctaLabel: tr('central.ultraUnlockCivDiag', 'Desbloqueá patrones por civ, fase y mapa') })}
    </div>`;
  }

  function renderMapDiagnosticPanel(diag, { activeTab = 'civs', isUltra = true, modeLabel = 'RM 1v1' } = {}) {
    if (!diag || !diag.ok) {
      return `<div class="cx-diag-empty"><p>${esc(tr('central.diagSelectMap', 'Elegí un mapa de la lista para ver tu diagnóstico táctico.'))}</p></div>`;
    }
    const mapTitle = locMap(diag.mapName) || diag.mapName;
    const verdictCls = {
      strength: 'is-win',
      weakness: 'is-loss',
      balanced: 'is-neutral',
      sample: 'is-muted',
    }[diag.verdict] || 'is-neutral';

    const s = diag.sample || {};
    const deltaTxt = Number.isFinite(s.deltaPp) && s.games >= 4
      ? `<span class="cx-delta ${s.deltaPp > 0 ? 'win' : s.deltaPp < 0 ? 'loss' : 'neutral'}">${esc(tr('cx.deltaExpected', '{delta} pp vs esperado', { delta: `${s.deltaPp > 0 ? '+' : ''}${s.deltaPp}` }))}</span>`
      : '';
    const bestCivName = diag.bestCivHere ? (locCiv(diag.bestCivHere.civ) || diag.bestCivHere.civ) : null;
    const bestCivChip = diag.bestCivHere
      ? `<span class="cx-diag-meta-chip cx-diag-bestciv">${civBadge(diag.bestCivHere.civ)}<span>${esc(tr('cx.bestCivHere', 'Mejor civ aquí:'))} <b>${esc(bestCivName)}</b> (${diag.bestCivHere.winRate}% · ${number(diag.bestCivHere.games)} ${esc(cxPj())})</span></span>`
      : '';
    const allTimeBadge = s.allTime && s.allTime.games > (s.games || 0)
      ? `<span class="cx-diag-meta-chip">${esc(tr('cx.historicalBadge', 'Histórico: {wr}% ({n} pj)', { wr: s.allTime.winRate, n: number(s.allTime.games) }))}</span>`
      : '';

    const locMapFindingText = (txt, civNames = []) => {
      let out = String(txt || '');
      if (diag.mapName && mapTitle && mapTitle !== diag.mapName) {
        out = out.replace(new RegExp(`\\b${diag.mapName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), mapTitle);
      }
      const candidates = new Set([
        ...(Array.isArray(civNames) ? civNames : []),
        ...(diag.bestCivHere?.civ ? [diag.bestCivHere.civ] : []),
        ...((diag.breakdowns?.civs || []).map((c) => c.label).filter(Boolean)),
      ]);
      for (const rawCiv of candidates) {
        const localized = locCiv(rawCiv);
        if (localized && localized !== rawCiv) {
          out = out.replace(new RegExp(`\\b${rawCiv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), localized);
        }
      }
      return out;
    };

    const headerHtml = `<div class="cx-diag-head">
      <div class="cx-diag-id">
        <span class="cx-diag-crest is-map-art">${mapBadge(diag.mapName, 'xl')}</span>
        <div class="cx-diag-id-copy">
          <div class="cx-diag-title-row">
            <h4>${esc(mapTitle)}</h4>
            <span class="cx-diag-meta-chip">${esc(locCxTerrain(diag.terrainLabel))}</span>
            <span class="cx-verdict-pill ${verdictCls}">${esc(locCxVerdict(diag.verdict, diag.verdictLabel || tr('cx.balancedMasc', 'Equilibrado')))}</span>
          </div>
          <div class="cx-diag-anchor">
            <strong class="cx-diag-big-wr">${s.rawWinRate != null ? `${s.rawWinRate}%` : '—'}</strong>
            <span>${esc(cxWL(s.wins || 0, s.losses || 0))} · ${number(s.games || 0)} ${esc(cxPj())} · ${esc(modeLabel)}</span>
            ${deltaTxt}
            <span class="cx-diag-conf">${esc(locCxConf(diag.confidenceLabel, diag.confidenceI18n))}</span>
            ${bestCivChip}
            ${allTimeBadge}
          </div>
        </div>
      </div>
    </div>`;

    let findingsHtml = '';
    if (diag.status === 'insufficient') {
      const progressPct = Math.min(100, Math.round(((s.games || 0) / (s.needed || 4)) * 100));
      findingsHtml = `<div class="cx-diag-sample-gate">
        <p>${esc(diag.summaryI18n ? locRef(diag.summaryI18n, diag.summaryLine) : locMapFindingText(diag.summaryLine))}</p>
        <div class="central-bar-track sm" aria-hidden="true"><i class="bar-gold" data-w="${progressPct}"></i></div>
        <small>${esc(tr('cx.sampleDetailMap', '{have}/{need} partidas con detalle en este mapa', { have: number(s.games || 0), need: number(s.needed || 4) }))}</small>
      </div>`;
    } else if (diag.findings && diag.findings.length) {
      findingsHtml = `<div class="cx-diag-findings">${diag.findings.map((f) => {
        const arrow = f.tone === 'loss' ? '▼' : '▲';
        const mapFindTitle = f.i18n?.title ? locRef(f.i18n.title, f.title) : locMapFindingText(f.title, f.civNames);
        const mapFindMetric = locCxFindingMetric(f);
        const mapFindBody = f.i18n?.detail ? locRef(f.i18n.detail, f.detail || '') : locMapFindingText(f.detail || '', f.civNames);
        const mapFindTakeaway = f.i18n?.takeaway ? locRef(f.i18n.takeaway, f.takeaway || '') : (f.takeaway ? locMapFindingText(f.takeaway, f.civNames) : '');
        return `<article class="cx-diag-finding is-${esc(f.tone)}">
          <div class="cx-diag-f-top">
            <span class="cx-diag-arrow">${arrow}</span>
            <strong>${esc(mapFindTitle)}</strong>
            <b class="cx-diag-f-metric">${esc(mapFindMetric)}</b>
            ${f.tone === 'loss' ? trainDumbbellBtn({ source: 'Central · Mapa', title: mapFindTitle, detail: mapFindTakeaway || mapFindBody, metric: mapFindMetric, tab: 'orders', compact: true }) : ''}
          </div>
          <p>${esc(mapFindBody)}</p>
          ${mapFindTakeaway ? `<small class="cx-diag-takeaway">${esc(mapFindTakeaway)}</small>` : ''}
        </article>`;
      }).join('')}</div>`;
    } else {
      findingsHtml = `<p class="cx-diag-neutral-note">${esc(diag.summaryI18n ? locRef(diag.summaryI18n, diag.summaryLine) : locMapFindingText(diag.summaryLine || tr('cx.stableMapPerf', 'Rendimiento estable en este mapa.')))}</p>`;
    }

    const bd = diag.breakdowns || {};
    const tabKey = ['civs', 'openings', 'phases', 'pace'].includes(activeTab) ? activeTab : 'civs';
    const renderMiniBars = (rows, emptyMsg) => {
      if (!Array.isArray(rows) || !rows.length) return `<p class="intel-muted">${esc(emptyMsg)}</p>`;
      return `<div class="cx-diag-bars">${rows.map((r) => {
        const tone = r.winRate >= 55 ? 'emerald' : r.winRate < 45 ? 'rose' : 'gold';
        const lbl = tabKey === 'civs' ? (locCiv(r.label) || r.label) : r.label;
        const badgeHtml = tabKey === 'civs' ? civBadge(r.label) : '';
        return `<div class="cx-diag-bar-row">
          <span class="cx-diag-bar-lbl">${badgeHtml ? `<span class="cx-inline-crest">${badgeHtml}</span>` : ''}${esc(lbl)}${r.sub ? ` <small>${esc(r.sub)}</small>` : ''}</span>
          <div class="central-bar-track sm has-mid" aria-hidden="true"><i class="bar-${tone}" data-w="${Math.max(4, Math.min(100, r.winRate ?? 0))}"></i></div>
          <span class="cx-diag-bar-val"><small>${esc(cxWL(r.wins, r.losses))}</small> <b>${r.winRate != null ? `${r.winRate}%` : '—'}</b></span>
        </div>`;
      }).join('')}</div>`;
    };

    let tabBody = '';
    const locTxt = (s) => {
      const api = getI18n();
      return api && typeof api.locText === 'function' ? api.locText(s) : s;
    };
    if (tabKey === 'civs') tabBody = renderMiniBars(bd.civs, tr('cx.noCivsMap', 'Sin suficientes partidas por civilización en este mapa.'));
    else if (tabKey === 'openings') {
      const localizedOps = (bd.oppOpenings || []).map((r) => ({ ...r, label: locOpening(r.label) || locTxt(r.label), sub: r.sub ? locTxt(r.sub) : r.sub }));
      tabBody = renderMiniBars(localizedOps, tr('cx.noOppOpeningsMap', 'Sin aperturas rivales clasificadas en este mapa.'));
    } else if (tabKey === 'phases') {
      const localizedPhases = (bd.phases || []).map((r) => ({ ...r, label: locTxt(r.label), sub: r.sub ? locTxt(r.sub) : r.sub }));
      tabBody = renderMiniBars(localizedPhases, tr('cx.noPhasesMap', 'Sin duraciones suficientes en este mapa.'));
    } else {
      const p = bd.pace || {};
      tabBody = p.sample > 0
        ? `<div class="cx-diag-pace-grid">
            <div class="cx-stat-chip"><span>${esc(tr('cx.medianEapm', 'Mediana eAPM'))}</span><b>${dec(p.medianEapm, 1)}</b><small>${number(p.sample)} ${esc(tr('cx.replaysWord', 'replays'))}</small></div>
            ${p.baselineMedianEapm != null ? `<div class="cx-stat-chip"><span>${esc(tr('cx.vsOtherMaps', 'vs Otros mapas'))}</span><b class="${(p.deltaEapm || 0) >= 0 ? 'win' : 'loss'}">${p.deltaEapm > 0 ? '+' : ''}${dec(p.deltaEapm, 1)}</b><small>${esc(tr('cx.meanVal', 'media {val}', { val: dec(p.baselineMedianEapm, 1) }))}</small></div>` : ''}
            ${p.outpacedWinRate != null ? `<div class="cx-stat-chip"><span>${esc(tr('cx.outpacingEapm', 'Superando eAPM'))}</span><b class="${p.outpacedWinRate >= 55 ? 'win' : ''}">${p.outpacedWinRate}%</b><small>${number(p.outpacedGames)} ${esc(cxPj())}</small></div>` : ''}
          </div>`
        : `<p class="intel-muted">${esc(tr('cx.noEapmMap', 'Sin replays con eAPM registrado en este mapa.'))}</p>`;
    }

    const tabsHtml = `<div class="cx-diag-tabs-wrap">
      <div class="cx-sort-pills" role="tablist">
        <button type="button" class="cx-sort-btn${tabKey === 'civs' ? ' active' : ''}" data-map-diag-tab="civs">${esc(tr('cx.mapTabCivs', 'Tus civs'))}</button>
        <button type="button" class="cx-sort-btn${tabKey === 'openings' ? ' active' : ''}" data-map-diag-tab="openings">${esc(tr('cx.mapTabOpenings', 'Aperturas rivales'))}</button>
        <button type="button" class="cx-sort-btn${tabKey === 'phases' ? ' active' : ''}" data-map-diag-tab="phases">${esc(tr('cx.mapTabPhases', 'Fases'))}</button>
        <button type="button" class="cx-sort-btn${tabKey === 'pace' ? ' active' : ''}" data-map-diag-tab="pace">${esc(tr('cx.mapTabPace', 'Ritmo eAPM'))}</button>
      </div>
      <div class="cx-diag-tab-body">${tabBody}</div>
    </div>`;

    const deepBody = `<div class="cx-diag-body">
      ${findingsHtml}
      ${tabsHtml}
    </div>`;

    return `<div class="cx-diag-panel" id="cxMapDiagPanel">
      ${headerHtml}
      ${wrapUltraGate(deepBody, { locked: !isUltra, ctaLabel: tr('central.ultraUnlockMapDiag', 'Desbloqueá diagnóstico táctico por mapa') })}
    </div>`;
  }

  /* ==================== SVG Visual Helpers & Central v5 Discoveries (100% CSP-Safe) ==================== */
  function svgWrRing(winRate, innerHtml, size = 72) {
    const wr = Number.isFinite(Number(winRate)) ? Math.max(0, Math.min(100, Number(winRate))) : 0;
    const r = Math.round(size / 2) - 4;
    const cx = Math.round(size / 2);
    const circ = Math.round(2 * Math.PI * r * 10) / 10;
    const dashOffset = Math.round(circ * (1 - wr / 100) * 10) / 10;
    const tone = wr >= 56 ? 'win' : wr > 0 && wr < 46 ? 'loss' : 'gold';
    return `<span class="cx-ring-pedestal is-${tone} is-sz-${size}">
      <svg class="cx-wr-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="cx-ring-bg" cx="${cx}" cy="${cx}" r="${r}" />
        ${wr > 0 ? `<circle class="cx-ring-val is-${tone}" cx="${cx}" cy="${cx}" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 ${cx} ${cx})" />` : ''}
      </svg>
      <span class="cx-ring-inner">${innerHtml}</span>
    </span>`;
  }

  function svgDnaRadar(axes) {
    const list = Array.isArray(axes) && axes.length >= 5 ? axes.slice(0, 5) : [];
    if (!list.length) return '';
    const cx = 132;
    const cy = 112;
    const maxR = 72;
    const n = list.length;
    const ptAt = (idx, radius) => {
      const ang = (-Math.PI / 2) + (idx * 2 * Math.PI) / n;
      return [Math.round((cx + radius * Math.cos(ang)) * 10) / 10, Math.round((cy + radius * Math.sin(ang)) * 10) / 10];
    };
    const polyStr = (r) => list.map((_, i) => ptAt(i, r).join(',')).join(' ');
    const rings = [maxR * 0.25, maxR * 0.5, maxR * 0.75, maxR].map((r) => `<polygon class="cx-radar-web" points="${polyStr(r)}" />`).join('');
    const spokes = list.map((_, i) => {
      const [x, y] = ptAt(i, maxR);
      return `<line class="cx-radar-spoke" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" />`;
    }).join('');
    // Escala 1:1 exacta (0% = centro, 100% = toca el borde exterior maxR)
    const dataPts = list.map((ax, i) => ptAt(i, maxR * (Math.max(6, Math.min(100, ax.hasData ? ax.score : 25)) / 100)));
    const dataPoly = `<polygon class="cx-radar-poly" points="${dataPts.map((p) => p.join(',')).join(' ')}" />`;
    const dots = dataPts.map(([x, y], i) => {
      const tip = list[i].tooltipI18n ? locRef(list[i].tooltipI18n, list[i].tooltip) : list[i].tooltip;
      return `<circle class="cx-radar-dot${list[i].hasData ? ' is-live' : ' is-dim'}" cx="${x}" cy="${y}" r="${list[i].hasData ? 3.8 : 2.6}">${tip ? `<title>${esc(tip)}</title>` : ''}</circle>`;
    }).join('');
    const labels = list.map((ax, i) => {
      const [lx, ly] = ptAt(i, maxR + 21);
      const anchor = Math.abs(lx - cx) < 12 ? 'middle' : (lx > cx ? 'start' : 'end');
      const dy = ly < cy - 30 ? -4 : ly > cy + 40 ? 10 : 3;
      const tip = ax.tooltipI18n ? locRef(ax.tooltipI18n, ax.tooltip) : ax.tooltip;
      return `<g class="cx-radar-lbl-g">
        ${tip ? `<title>${esc(tip)}</title>` : ''}
        <text class="cx-radar-lbl" x="${lx}" y="${ly + dy}" text-anchor="${anchor}">${esc(locCxAxis(ax))}</text>
        <text class="cx-radar-val" x="${lx}" y="${ly + dy + 12}" text-anchor="${anchor}">${esc(ax.valueText || '—')}</text>
      </g>`;
    }).join('');
    return `<svg class="cx-dna-radar-svg" viewBox="0 0 264 224" role="img" aria-label="DNA Radar">
      ${rings}
      ${spokes}
      ${dataPoly}
      ${dots}
      ${labels}
    </svg>`;
  }

  function svgSpeedGauge(avgSelf, avgRival) {
    const selfVal = Number(avgSelf) || 0;
    const rivalVal = Number(avgRival) || 0;
    const maxScale = Math.max(90, Math.ceil(Math.max(selfVal, rivalVal) / 10) * 10 + 10);
    const selfPct = Math.max(0.06, Math.min(1, selfVal / maxScale));
    const rivalPct = Math.max(0.06, Math.min(1, rivalVal / maxScale));
    const r = 64;
    const cx = 90;
    const cy = 78;
    const semi = Math.round(Math.PI * r * 10) / 10;
    const selfOffset = Math.round(semi * (1 - selfPct) * 10) / 10;
    const rAng = Math.PI * (1 - rivalPct);
    const rx1 = Math.round((cx + (r - 8) * Math.cos(rAng)) * 10) / 10;
    const ry1 = Math.round((cy - (r - 8) * Math.sin(rAng)) * 10) / 10;
    const rx2 = Math.round((cx + (r + 8) * Math.cos(rAng)) * 10) / 10;
    const ry2 = Math.round((cy - (r + 8) * Math.sin(rAng)) * 10) / 10;
    return `<svg class="cx-speed-gauge-svg" viewBox="0 0 180 96" role="img" aria-label="eAPM">
      <path class="cx-gauge-track" d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" />
      <path class="cx-gauge-arc" d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke-dasharray="${semi}" stroke-dashoffset="${selfOffset}" />
      ${rivalVal > 0 ? `<line class="cx-gauge-rival-tick" x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" />` : ''}
      <text class="cx-gauge-num" x="${cx}" y="${cy - 10}" text-anchor="middle">${esc(dec(selfVal, 1))}</text>
      <text class="cx-gauge-sub" x="${cx}" y="${cy + 7}" text-anchor="middle">eAPM · ${esc(tr('cx.rivalAvg', 'rival {val}', { val: dec(rivalVal, 1) }))}</text>
    </svg>`;
  }

  function renderPlayerDnaBanner(dna, modeLabel) {
    if (!dna) return '';
    const mainCivHtml = dna.mainCiv && dna.mainCiv.civ
      ? svgWrRing(dna.mainCiv.winRate, civBadge(dna.mainCiv.civ), 74)
      : `<span class="cx-dna-fallback-ico">${icon('crown')}</span>`;
    const signalsHtml = (dna.signals || []).map((s) => {
      const sLbl = s.labelI18n ? locRef(s.labelI18n, s.label) : s.label;
      const sVal = s.valuePhase
        ? `${locCxPhase({ label: s.valuePhase })} · ${s.valueWr}%`
        : (s.valueOtp ? locCxOtp(s.value) : s.value);
      const sSub = s.subWL
        ? cxWL(s.subWL[0], s.subWL[1])
        : (s.subI18n ? locRef(s.subI18n, s.sub || '') : (s.sub || ''));
      return `<div class="cx-dna-sig">
        <span>${esc(sLbl)}</span>
        <b>${esc(sVal)}</b>
        <small>${esc(sSub)}</small>
      </div>`;
    }).join('');
    const radarHtml = dna.activeAxesCount >= 2 ? `<div class="cx-dna-radar-wrap">${svgDnaRadar(dna.axes)}</div>` : '';
    const archPair = CX_ARCH_TITLE_KEYS[dna.title] || null;
    const dnaTitleLoc = archPair ? tr(archPair[0], dna.title) : dna.title;
    const dnaTagLoc = dna.tagI18n ? locRef(dna.tagI18n, dna.tag || '') : (archPair ? tr(archPair[1], dna.tag || '') : (dna.tag || ''));
    const dnaPunchLoc = dna.punchlineI18n ? locRef(dna.punchlineI18n, dna.punchline || '') : (dna.punchline || '');
    return `<section class="cx-dna-banner${radarHtml ? '' : ' is-no-radar'}" id="cxSectionDna">
      <div class="cx-dna-left">
        <div class="cx-dna-id">
          ${mainCivHtml}
          <div class="cx-dna-copy">
            <span class="cx-eyebrow">${esc(tr('cx.dnaEyebrow', 'ADN DE JUGADOR · {mode}', { mode: modeLabel }))}${dnaTagLoc ? ` · ${esc(dnaTagLoc)}` : ''}</span>
            <h3>${esc(dnaTitleLoc)}</h3>
            <p>${esc(dnaPunchLoc)}</p>
          </div>
        </div>
        ${signalsHtml ? `<div class="cx-dna-signals">${signalsHtml}</div>` : ''}
      </div>
      ${radarHtml}
    </section>`;
  }

  function renderTacticalTridentStrip(trident, giantSlayer, ladder) {
    if (!trident && !giantSlayer) return '';
    const cards = [];

    // Poster 1: Tu Arma Secreta (Civ + Combo)
    if (trident?.secretCiv) {
      const sc = trident.secretCiv;
      const cName = locCiv(sc.civ) || sc.civ;
      const comboTxt = sc.combo
        ? tr('cx.comboFoot', 'Combo: {civ} en {map} ({wr}%)', { civ: locCiv(sc.combo.civ) || sc.combo.civ, map: locMap(sc.combo.mapName) || sc.combo.mapName, wr: sc.combo.winRate })
        : `${sc.deltaPp >= 0 ? tr('cx.aboveAvgFoot', '+{pp} pp sobre tu media', { pp: sc.deltaPp }) : `${number(sc.games)} ${tr('cx.gamesWord', 'partidas')}`} · ${cxWL(sc.wins, sc.losses)}`;
      cards.push(`<button type="button" class="cx-spot-card is-civ-spot is-win" data-jump-civ="${esc(sc.civSlug || '')}">
        <div class="cx-spot-head">
          <span class="cx-eyebrow is-win">${esc(tr('cx.secretWeapon', 'TU ARMA SECRETA'))}</span>
          <span class="cx-spot-pill is-win">${esc(cxWL(sc.wins, sc.losses))}</span>
        </div>
        <div class="cx-spot-mid">
          ${svgWrRing(sc.winRate, civBadge(sc.civ), 72)}
          <div class="cx-spot-hero">
            <b class="cx-spot-num is-win">${sc.winRate}%</b>
            <strong>${esc(cName)}</strong>
          </div>
        </div>
        <small class="cx-spot-foot">${esc(comboTxt)}</small>
      </button>`);
    }

    // Poster 2: Tu Mapa Fortaleza (Giant 76px Isometric Map Diamond!)
    if (trident?.fortressMap) {
      const fm = trident.fortressMap;
      const mName = locMap(fm.mapName) || fm.mapName;
      const foot = fm.avgEapm != null
        ? `${cxWL(fm.wins, fm.losses)} · ${tr('cx.avgEapmFoot', '{val} eAPM promedio', { val: dec(fm.avgEapm, 1) })}`
        : `${cxWL(fm.wins, fm.losses)} · ${fm.deltaPp >= 0 ? tr('cx.vsAvgFoot', '+{pp} pp vs media', { pp: fm.deltaPp }) : `${number(fm.games)} ${tr('cx.gamesWord', 'partidas')}`}`;
      cards.push(`<button type="button" class="cx-spot-card is-map-spot is-gold" data-jump-map="${esc(fm.mapKey || '')}">
        <div class="cx-spot-head">
          <span class="cx-eyebrow is-gold">${esc(tr('cx.fortressMap', 'TU MAPA FORTALEZA'))}</span>
          <span class="cx-spot-pill is-gold">${number(fm.games)} ${esc(cxPj())}</span>
        </div>
        <div class="cx-spot-mid">
          <span class="cx-spot-map-frame">${mapBadge(fm.mapName, 'xl')}</span>
          <div class="cx-spot-hero">
            <b class="cx-spot-num is-gold">${fm.winRate}%</b>
            <strong>${esc(mName)}</strong>
          </div>
        </div>
        <small class="cx-spot-foot">${esc(foot)}</small>
      </button>`);
    }

    // Poster 3: Trampa Silenciosa OR Tu Bestia Negra OR Matagigantes (highest-signal real card!)
    if (trident?.nemesis && trident.nemesis.kind === 'civ') {
      const nem = trident.nemesis;
      const nName = locCiv(nem.civ) || nem.civ;
      const preyNote = trident.prey && trident.prey.kind === 'civ'
        ? tr('cx.favPreyFoot', 'Presa favorita: {civ} ({wr}%)', { civ: locCiv(trident.prey.civ) || trident.prey.civ, wr: trident.prey.winRate })
        : tr('cx.hardestMatchupFoot', 'Tu cruce más difícil en este modo · {n} partidas', { n: number(nem.games) });
      cards.push(`<button type="button" class="cx-spot-card is-nemesis-spot is-loss" data-scroll-view="intel" data-scroll-target="#cxMatchupSessionCard">
        <div class="cx-spot-head">
          <span class="cx-eyebrow is-loss">${esc(tr('cx.nemesisTitle', 'TU BESTIA NEGRA'))}</span>
          <span class="cx-spot-pill is-loss">${esc(cxWL(nem.wins, nem.losses))}</span>
        </div>
        <div class="cx-spot-mid">
          ${svgWrRing(nem.winRate, civBadge(nem.civ), 72)}
          <div class="cx-spot-hero">
            <b class="cx-spot-num is-loss">${nem.winRate}%</b>
            <strong>vs ${esc(nName)}</strong>
          </div>
        </div>
        <small class="cx-spot-foot">${esc(preyNote)}</small>
      </button>`);
    } else if (trident?.silentTrap) {
      const st = trident.silentTrap;
      const isMap = st.kind === 'map';
      const title = st.kind === 'combo'
        ? `${locCiv(st.civ) || st.civ} · ${locMap(st.mapName) || st.mapName}`
        : isMap ? (locMap(st.mapName) || st.mapName) : (locCiv(st.civ) || st.civ);
      const visual = isMap
        ? `<span class="cx-spot-map-frame is-loss">${mapBadge(st.mapName, 'xl')}</span>`
        : svgWrRing(st.winRate, civBadge(st.civ), 72);
      const jumpAttr = isMap
        ? ` data-jump-map="${esc(st.mapKey || '')}"`
        : ` data-jump-civ="${esc(st.civSlug || '')}"`;
      cards.push(`<button type="button" class="cx-spot-card is-nemesis-spot is-loss"${jumpAttr}>
        <div class="cx-spot-head">
          <span class="cx-eyebrow is-loss">${esc(tr('cx.silentTrap', 'TRAMPA SILENCIOSA'))}</span>
          <span class="cx-spot-pill is-loss">${esc(cxWL(st.wins, st.losses))}</span>
        </div>
        <div class="cx-spot-mid">
          ${visual}
          <div class="cx-spot-hero">
            <b class="cx-spot-num is-loss">${st.winRate}%</b>
            <strong>${esc(title)}</strong>
          </div>
        </div>
        <small class="cx-spot-foot">${esc(st.kind === 'combo' ? tr('cx.lowEffCombo', 'Combinación con baja efectividad ({n} partidas)', { n: number(st.games) }) : tr('cx.eloLeakPick', 'Pick frecuente que resta ELO ({n} partidas)', { n: number(st.games) }))}</small>
      </button>`);
    } else if (giantSlayer?.biggestUpset) {
      const up = giantSlayer.biggestUpset;
      const mapLabel = up.mapName ? (locMap(up.mapName) || up.mapName) : '';
      const vsLabel = up.rivalName ? `vs ${up.rivalName}` : (giantSlayer.isTeam ? tr('cx.vsHigherTeam', 'vs equipo superior') : tr('cx.vsHigherRival', 'vs rival superior'));
      const upPill = up.ratingDiff > 0 ? `+${up.ratingDiff} ELO` : tr('cx.upsetPill', 'Batacazo');
      cards.push(`<div class="cx-spot-card is-upset-spot is-gold">
        <div class="cx-spot-head">
          <span class="cx-eyebrow is-gold">${esc(tr('cx.giantSlayer', 'MATAGIGANTES'))}</span>
          <span class="cx-spot-pill is-win">${esc(upPill)}</span>
        </div>
        <div class="cx-spot-mid">
          <span class="cx-spot-medal-frame">${up.myCiv ? civBadge(up.myCiv) : icon('sword')}</span>
          <div class="cx-spot-hero">
            <b class="cx-spot-num is-gold">+${up.gap}</b>
            <strong>${esc(vsLabel)}</strong>
          </div>
        </div>
        <small class="cx-spot-foot">${esc([up.myCiv ? (locCiv(up.myCiv) || up.myCiv) : null, mapLabel, giantSlayer.vsLower ? tr('cx.vsLowerShort', 'vs menor ELO: {wr}%', { wr: giantSlayer.vsLower.winRate }) : null].filter(Boolean).join(' · '))}</small>
      </div>`);
    } else if (ladder?.peak) {
      cards.push(`<div class="cx-spot-card is-upset-spot is-gold">
        <div class="cx-spot-head">
          <span class="cx-eyebrow is-gold">${esc(tr('cx.careerPeak', 'PICO DE CARRERA'))}</span>
          <span class="cx-spot-pill is-gold">${esc(tr('cx.recordPill', 'Récord'))}</span>
        </div>
        <div class="cx-spot-mid">
          <span class="cx-spot-medal-frame">${icon('crown')}</span>
          <div class="cx-spot-hero">
            <b class="cx-spot-num is-gold">${number(ladder.peak)}</b>
            <strong>${esc(tr('cx.maxElo', 'ELO máximo'))}</strong>
          </div>
        </div>
        <small class="cx-spot-foot">${esc(ladder.rating && ladder.peak > ladder.rating ? tr('cx.ptsToPeak', 'A {pts} pts de igualar tu récord', { pts: number(ladder.peak - ladder.rating) }) : tr('cx.atPeakNow', '¡Estás en tu pico histórico!'))}</small>
      </div>`);
    }

    if (!cards.length) return '';
    return `<section class="cx-spotlight-grid is-cols-${cards.length}" id="cxSectionSpotlights">
      ${cards.join('')}
    </section>`;
  }

  function renderGoldenHourAndTrophies(goldenHour, trophies, giantSlayer, isUltra) {
    if (!goldenHour && !trophies && !giantSlayer) return '';

    const circadianCard = goldenHour ? (() => {
      const cols = (goldenHour.blocks || []).map((b) => {
        const hasVal = b.games > 0 && b.winRate != null;
        const tone = b.isGolden ? 'gold' : b.isCursed ? 'loss' : (b.winRate >= 54 ? 'win' : b.winRate != null && b.winRate < 46 ? 'loss' : 'neutral');
        const eloSign = b.netElo > 0 ? '+' : '';
        return `<div class="cx-circ-col is-${tone}${b.isGolden ? ' is-golden' : ''}">
          <span class="cx-circ-wr">${hasVal ? `${b.winRate}%` : '—'}</span>
          <div class="cx-circ-track" aria-hidden="true">
            <i class="cx-circ-fill is-${tone}" data-h="${hasVal ? Math.max(10, Math.min(100, b.winRate)) : 0}"></i>
          </div>
          <strong>${esc(locCxBlock(b))}</strong>
          <small>${esc(b.range)}</small>
          <em class="cx-circ-elo ${b.netElo > 0 ? 'win' : b.netElo < 0 ? 'loss' : ''}">${hasVal ? `${eloSign}${b.netElo} · ${number(b.games)} ${esc(cxPj())}` : `0 ${esc(cxPj())}`}</em>
        </div>`;
      }).join('');
      const dayBadges = [
        goldenHour.bestDay ? `<span class="cx-day-chip is-win">${esc(tr('cx.bestDay', 'Mejor día:'))} <b>${esc(locCxDay(goldenHour.bestDay.label))}</b> (+${goldenHour.bestDay.netElo} ELO)</span>` : '',
        goldenHour.worstDay ? `<span class="cx-day-chip is-loss">${esc(tr('cx.worstDay', 'Peor día:'))} <b>${esc(locCxDay(goldenHour.worstDay.label))}</b> (${goldenHour.worstDay.netElo} ELO)</span>` : '',
      ].filter(Boolean).join('');
      return `<section class="cx-card cx-circadian-card" id="cxSectionGoldenHour">
        <header class="cx-card-head">
          <div>
            <span class="cx-eyebrow">${esc(tr('cx.clockEyebrow', 'RELOJ COMPETITIVO · {n} PARTIDAS', { n: number(goldenHour.totalRated) }))}</span>
            <h3>${esc(goldenHour.golden ? tr('cx.goldenHourTitle', 'Tu Hora Dorada: {block}', { block: locCxBlock(goldenHour.golden) }) : tr('cx.timeBandTitle', 'Rendimiento por franja horaria'))}</h3>
          </div>
          ${goldenHour.isPreliminary ? `<span class="cx-meta-pill">${esc(tr('cx.initialSample', 'Muestra inicial'))}</span>` : ''}
        </header>
        ${wrapUltraGate(`<div class="cx-circ-cols">${cols}</div>
        ${dayBadges ? `<div class="cx-day-chips">${dayBadges}</div>` : ''}
        ${goldenHour.punchline ? `<p class="cx-circ-punchline">${esc(goldenHour.punchlineI18n ? locRef(goldenHour.punchlineI18n, goldenHour.punchline) : goldenHour.punchline)}</p>` : ''}`, { locked: !isUltra, ctaLabel: tr('cx.unlockGoldenHour', 'Desbloquea tu Hora Dorada y mapa de días'), compact: true })}
      </section>`;
    })() : '';

    const trophyItems = [];
    if (giantSlayer?.biggestUpset) {
      const up = giantSlayer.biggestUpset;
      trophyItems.push({
        ico: up.myCiv ? civBadge(up.myCiv) : (up.mapName ? mapBadge(up.mapName, 'sm') : icon('sword')),
        tone: 'gold',
        kicker: tr('cx.biggestUpset', 'MAYOR BATACAZO'),
        val: `+${up.gap} ELO`,
        sub: `${up.rivalName ? `vs ${up.rivalName}` : tr('cx.higherTeam', 'Equipo superior')} · ${locMap(up.mapName) || up.mapName || ''}`,
      });
    }
    if (trophies?.bestWinStreak) {
      trophyItems.push({
        ico: icon('trophy'),
        tone: 'win',
        kicker: trophies.bestWinStreak.active ? tr('cx.bestStreakActive', 'RACHA RÉCORD · ACTIVA') : tr('cx.bestStreak', 'RACHA RÉCORD'),
        val: `${trophies.bestWinStreak.count}${cxW()}`,
        sub: trophies.bestWinStreak.modeLabel ? tr('cx.streakInMode', 'Victorias seguidas en {mode}', { mode: trophies.bestWinStreak.modeLabel }) : tr('cx.streakConsecutive', 'Victorias consecutivas en el modo'),
      });
    }
    if (trophies?.bestSession) {
      trophyItems.push({
        ico: icon('trend'),
        tone: 'win',
        kicker: tr('cx.bestSession', 'MEJOR SESIÓN'),
        val: `+${trophies.bestSession.netElo} ELO`,
        sub: `${cxWL(trophies.bestSession.wins, trophies.bestSession.losses)} (${number(trophies.bestSession.fromElo)} → ${number(trophies.bestSession.toElo)})${trophies.bestSession.modeLabel ? ` · ${trophies.bestSession.modeLabel}` : ''}`,
      });
    }
    if (trophies?.fastestWin) {
      trophyItems.push({
        ico: trophies.fastestWin.mapName ? mapBadge(trophies.fastestWin.mapName, 'sm') : icon('clock'),
        tone: 'gold',
        kicker: tr('cx.fastestGg', 'GG MÁS RÁPIDO'),
        val: tr('cx.gameMin', '{m}m juego', { m: trophies.fastestWin.minutes }),
        sub: `${locCiv(trophies.fastestWin.civ) || trophies.fastestWin.civ} · ${locMap(trophies.fastestWin.mapName) || trophies.fastestWin.mapName}`,
      });
    }
    if (trophies?.longestWin) {
      trophyItems.push({
        ico: trophies.longestWin.mapName ? mapBadge(trophies.longestWin.mapName, 'sm') : icon('castle'),
        tone: 'neutral',
        kicker: tr('cx.epicBattle', 'BATALLA MÁS ÉPICA'),
        val: tr('cx.gameMin', '{m}m juego', { m: trophies.longestWin.minutes }),
        sub: `${locCiv(trophies.longestWin.civ) || trophies.longestWin.civ} · ${locMap(trophies.longestWin.mapName) || trophies.longestWin.mapName}`,
      });
    }
    if (trophies?.otpIndex) {
      trophyItems.push({
        ico: civBadge(trophies.otpIndex.topCiv) || icon('shield'),
        tone: 'neutral',
        kicker: tr('cx.poolVersatility', 'VERSATILIDAD DE POOL'),
        val: tr('cx.effCivsVal', '{val} civs', { val: dec(trophies.otpIndex.effCivs, 1) }),
        sub: `${locCxOtp(trophies.otpIndex.label)} · ${locCiv(trophies.otpIndex.topCiv) || trophies.otpIndex.topCiv} (${trophies.otpIndex.topShare}%)`,
      });
    }

    const trophiesCard = trophyItems.length ? `<section class="cx-card cx-trophies-card" id="cxSectionTrophies">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.trophiesEyebrow', 'VITRINA DE CARRERA'))}</span>
          <h3>${esc(tr('cx.trophiesTitle', 'Récords, batacazos y curiosidades'))}</h3>
        </div>
        ${giantSlayer?.vsLower ? `<span class="cx-meta-pill">${esc(tr('cx.vsLowerShort', 'vs menor ELO: {wr}%', { wr: giantSlayer.vsLower.winRate }))}</span>` : ''}
      </header>
      <div class="cx-trophies-grid">
        ${trophyItems.slice(0, 6).map((t) => `<article class="cx-trophy-tile is-${t.tone}">
          <span class="cx-trophy-ico">${t.ico}</span>
          <div class="cx-trophy-copy">
            <span>${esc(t.kicker)}</span>
            <b>${esc(t.val)}</b>
            <small>${esc(t.sub)}</small>
          </div>
        </article>`).join('')}
      </div>
    </section>` : '';

    if (!circadianCard && !trophiesCard) return '';
    return `<div class="cx-grid-2${circadianCard && trophiesCard ? '' : ' is-single-col'}" id="cxSectionDiscoveriesRow">
      ${circadianCard}
      ${trophiesCard}
    </div>`;
  }

  function renderCombatAndTempoStrip(combatDna, speedVsBrain, killerWindow, isUltra) {
    if (!combatDna && !speedVsBrain && !killerWindow) return '';

    const combatCard = combatDna ? `<section class="cx-card cx-combat-dna-card" id="cxSectionCombatDna">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.combatDnaEyebrow', 'HUELLA DE COMBATE'))} · ${esc(tr('cxe.combatLocalReplays', combatDna.scopeLabel || '{n} replays locales', { n: number(combatDna.sample || 0) }))}</span>
          <h3>${esc(combatDna.dominantWorkshop ? tr('cx.yourArmyTitle', 'Tu ejército: {share}% {workshop}', { share: combatDna.dominantWorkshop.share, workshop: locBuilding(combatDna.dominantWorkshop.name) }) : tr('cx.localUnitsTitle', 'Unidades y disciplina local'))}</h3>
        </div>
      </header>
      ${wrapUltraGate(`<div class="cx-combat-units">
        ${(combatDna.topUnits || []).map((u) => `<div class="cx-unit-bar-row">
          <div class="cx-unit-bar-top"><strong>${esc(locUnit(u))}</strong><span><b>${number(u.count)}</b> <small>(${u.share}%)</small></span></div>
          <div class="central-bar-track sm" aria-hidden="true"><i class="bar-gold" data-w="${Math.max(6, Math.min(100, u.share))}"></i></div>
        </div>`).join('')}
      </div>
      <div class="cx-combat-kpis">
        ${combatDna.tcDarkAvg != null ? `<div class="cx-ckpi"><span>${esc(tr('cx.tcDarkLabel', 'TC Alta Edad'))}</span><b class="win">${dec(combatDna.tcDarkAvg, 1)}%</b></div>` : ''}
        <div class="cx-ckpi"><span>${esc(tr('cx.noBellLabel', 'Sin Campana'))}</span><b class="${combatDna.cleanDefensePct >= 80 ? 'win' : 'loss'}">${combatDna.cleanDefensePct}%</b></div>
        ${combatDna.blacksmithPct != null ? `<div class="cx-ckpi"><span>${esc(tr('cx.blacksmithLabel', 'Herrería al día'))}</span><b class="${combatDna.blacksmithPct >= 70 ? 'win' : ''}">${combatDna.blacksmithPct}%</b></div>` : ''}
        ${combatDna.peakEapm ? `<div class="cx-ckpi"><span>${esc(tr('cx.peakAdrenaline', 'Pico adrenalina'))}</span><b class="gold">${combatDna.peakEapm.peakEapm}</b><small>${esc(tr('cx.minShort', 'min {m}', { m: combatDna.peakEapm.minute || '—' }))}</small></div>` : ''}
      </div>`, { locked: !isUltra, ctaLabel: tr('cx.unlockCombatDna', 'Desbloquea tu Huella de Combate desde replays locales'), compact: true })}
    </section>` : '';

    const tempoCard = (speedVsBrain || killerWindow) ? `<section class="cx-card cx-tempo-card" id="cxSectionTempo">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.tempoEyebrow', 'VELOCIDAD VS CEREBRO · VENTANA LETAL'))}</span>
          <h3>${esc(speedVsBrain ? tr('cx.tempoTitle', 'Ritmo mecánico y reloj de partida') : tr('cx.lethalMinTitle', 'Tu minuto letal por edad'))}</h3>
        </div>
      </header>
      ${wrapUltraGate(`<div class="cx-tempo-body">
        ${speedVsBrain ? `<div class="cx-speed-split">
          <div class="cx-gauge-wrap">${svgSpeedGauge(speedVsBrain.avgSelf, speedVsBrain.avgRival)}</div>
          <div class="cx-speed-facts">
            ${speedVsBrain.faster ? `<div class="cx-sf-row is-win"><span>${esc(tr('cx.fasterLabel', 'Más rápido ({n} pj)', { n: number(speedVsBrain.faster.games) }))}</span><b>${speedVsBrain.faster.winRate}% WR</b></div>` : ''}
            ${speedVsBrain.slower ? `<div class="cx-sf-row is-neutral"><span>${esc(tr('cx.slowerLabel', 'Más lento ({n} pj)', { n: number(speedVsBrain.slower.games) }))}</span><b>${speedVsBrain.slower.winRate}% WR</b></div>` : ''}
            ${speedVsBrain.smartestWin ? `<small class="cx-sf-gem">${esc(tr('cx.smartestWin', 'Victoria más cerebral:'))} <b>${dec(speedVsBrain.smartestWin.myEapm, 1)} vs ${dec(speedVsBrain.smartestWin.oppEapm, 1)} eAPM</b> (${esc(locCiv(speedVsBrain.smartestWin.civ) || speedVsBrain.smartestWin.civ)})</small>` : (speedVsBrain.headline ? `<small class="cx-sf-gem">${esc(speedVsBrain.headlineI18n ? locRef(speedVsBrain.headlineI18n, speedVsBrain.headline) : speedVsBrain.headline)}</small>` : '')}
          </div>
        </div>` : ''}
        ${killerWindow ? `<div class="cx-killer-cols">
          ${(killerWindow.phases || []).map((p) => {
            const tone = p.isPeak ? 'gold' : p.isValley ? 'loss' : (p.winRate >= 55 ? 'win' : p.winRate != null && p.winRate < 45 ? 'loss' : 'neutral');
            return `<div class="cx-circ-col is-${tone}${p.isPeak ? ' is-golden' : ''}">
              <span class="cx-circ-wr">${p.winRate != null ? `${p.winRate}%` : '—'}</span>
              <div class="cx-circ-track sm" aria-hidden="true">
                <i class="cx-circ-fill is-${tone}" data-h="${p.winRate != null ? Math.max(10, Math.min(100, p.winRate)) : 0}"></i>
              </div>
              <strong>${esc(locCxPhase(p))}</strong>
              <small>${esc(p.range)} · ${number(p.games)} ${esc(cxPj())}</small>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>`, { locked: !isUltra, ctaLabel: tr('cx.unlockTempo', 'Desbloquea matriz Velocidad vs Cerebro y Ventana Letal'), compact: true })}
    </section>` : '';

    return `<div class="cx-grid-2${combatCard && tempoCard ? '' : ' is-single-col'}" id="cxSectionCombatTempo">
      ${combatCard}
      ${tempoCard}
    </div>`;
  }

  function renderCuriousDiscoveriesRow(disc = {}, isUltra = true) {
    const cards = [];

    // A. Radiografía de Team Games (Pocket vs Flank · 2v2/3v3/4v4 · Carry vs Ancla)
    const tg = disc.tgRadiography;
    if (tg) {
      const roleBoxes = [
        tg.pocket ? `<div class="cx-tg-role is-pocket"><span>${esc(tr('cx.rolePocket', 'POCKET'))}</span><b class="${tg.pocket.games >= 4 ? (tg.pocket.winRate >= 54 ? 'win' : tg.pocket.winRate < 46 ? 'loss' : '') : ''}">${tg.pocket.games >= 4 ? `${tg.pocket.winRate}%` : `${tg.pocket.games} ${esc(cxPj())}`}</b><small>${esc(tg.pocket.games >= 4 ? `${cxWL(tg.pocket.wins, tg.pocket.losses)} (${tg.pocket.games} ${cxPj()})` : tr('cx.smallSample4', 'Muestra chica (<4 pj)'))}</small></div>` : '',
        tg.flank ? `<div class="cx-tg-role is-flank"><span>${esc(tr('cx.roleFlank', 'FLANK'))}</span><b class="${tg.flank.games >= 4 ? (tg.flank.winRate >= 54 ? 'win' : tg.flank.winRate < 46 ? 'loss' : '') : ''}">${tg.flank.games >= 4 ? `${tg.flank.winRate}%` : `${tg.flank.games} ${esc(cxPj())}`}</b><small>${esc(tg.flank.games >= 4 ? `${cxWL(tg.flank.wins, tg.flank.losses)} (${tg.flank.games} ${cxPj()})` : tr('cx.smallSample4', 'Muestra chica (<4 pj)'))}</small></div>` : '',
      ].filter(Boolean).join('');
      const sizePills = (tg.sizes || []).map((s) =>
        `<span class="cx-mini-pill"><b>${esc(s.label)}</b> ${s.winRate}% <small>(${s.games})</small></span>`
      ).join('');
      const carryRow = (tg.carry || tg.anchor) ? `<div class="cx-tg-carry-row">
        ${tg.carry ? `<span class="cx-mini-pill is-gold">${esc(tr('cx.carryLabel', 'Capitán (Carry):'))} <b>${tg.carry.winRate}%</b> (${tg.carry.games})</span>` : ''}
        ${tg.anchor ? `<span class="cx-mini-pill">${esc(tr('cx.anchorLabel', 'Ancla del equipo:'))} <b>${tg.anchor.winRate}%</b> (${tg.anchor.games})</span>` : ''}
      </div>` : '';
      cards.push(`<section class="cx-card cx-curious-card cx-tg-radio-card">
        <header class="cx-card-head">
          <div>
            <span class="cx-eyebrow">${esc(tr('cx.tgRadioEyebrow', 'RADIOGRAFÍA DE TEAM GAMES · {n} PARTIDAS', { n: number(tg.sample) }))}</span>
            <h3>${esc(tr('cx.tgRadioTitle', 'Pocket vs Flank, tamaño y liderazgo'))}</h3>
          </div>
        </header>
        ${wrapUltraGate(`${roleBoxes ? `<div class="cx-tg-roles">${roleBoxes}</div>` : ''}
        ${sizePills ? `<div class="cx-mini-pills">${sizePills}</div>` : ''}
        ${carryRow}
        ${tg.roleTip ? `<p class="cx-circ-punchline">${esc(tg.roleTipI18n ? locRef(tg.roleTipI18n, tg.roleTip) : tg.roleTip)}</p>` : `<small class="cx-note-muted">${esc(tr('cxe.tgPosNote', 'Posición por color en mapas estándar 3v3/4v4 (excluye inicios nómadas)'))}</small>`}`, { locked: !isUltra, ctaLabel: tr('cx.unlockTgRadio', 'Desbloquea tu radiografía Pocket vs Flank'), compact: true })}
      </section>`);
    }

    // B. Tu Color de la Suerte & Maldición de Color
    const lc = disc.luckyColor;
    if (lc && lc.colors?.length) {
      const chips = lc.colors.map((c) => {
        const isBest = lc.lucky && lc.lucky.id === c.id;
        const isWorst = lc.cursed && lc.cursed.id === c.id;
        return `<div class="cx-color-chip${isBest ? ' is-lucky' : isWorst ? ' is-cursed' : ''}">
          <span class="cx-color-dot is-${esc(c.cls)}" aria-hidden="true"></span>
          <div class="cx-color-copy">
            <strong>${esc(locCxColor(c))}</strong>
            <small>${number(c.games)} ${esc(cxPj())}</small>
          </div>
          <b class="${c.winRate >= 55 ? 'win' : c.winRate < 46 ? 'loss' : ''}">${c.winRate}%</b>
        </div>`;
      }).join('');
      const headline = lc.lucky
        ? tr('cx.luckyColorTitle', 'Tu color talismán: {color} ({wr}% WR)', { color: locCxColor(lc.lucky), wr: lc.lucky.winRate })
        : tr('cx.favColorTitle', 'Color favorito: {color} ({n} pj)', { color: locCxColor(lc.favorite), n: lc.favorite.games });
      cards.push(`<section class="cx-card cx-curious-card cx-color-card">
        <header class="cx-card-head">
          <div>
            <span class="cx-eyebrow">${esc(tr('cx.curiosityEyebrow', 'CURIOSIDAD AOE2'))} · ${number(lc.sample)} ${esc(tr('cx.gamesWord', 'partidas'))}</span>
            <h3>${esc(headline)}</h3>
          </div>
          ${lc.cursed ? `<span class="cx-meta-pill is-loss">${esc(tr('cx.cursedPill', 'Mufa: {color} ({wr}%)', { color: locCxColor(lc.cursed), wr: lc.cursed.winRate }))}</span>` : ''}
        </header>
        <div class="cx-color-grid">${chips}</div>
      </section>`);
    }

    // C. El Espejo (Mirrors), Cazador de Meta, Perfil de GG & Resaca/Revanchas
    const mm = disc.mirrorAndMeta;
    const rp = disc.resignProfile;
    const mr = disc.marathonAndRematch;
    if (mm || rp || mr) {
      const tiles = [];
      if (mm?.mirror) {
        tiles.push(`<div class="cx-fun-tile is-gold">
          <span>${esc(tr('cx.mirrorsTile', 'EL ESPEJO (MIRRORS)'))}</span>
          <b>${mm.mirror.winRate}% WR</b>
          <small>${esc(tr('cx.sameCivSub', '{w}V-{l}D con misma civ', { w: mm.mirror.wins, l: mm.mirror.losses }))}</small>
        </div>`);
      }
      if (mm?.vsMeta) {
        tiles.push(`<div class="cx-fun-tile ${mm.vsMeta.winRate >= 54 ? 'is-win' : mm.vsMeta.winRate < 46 ? 'is-loss' : ''}">
          <span>${esc(tr('cx.vsMetaTile', 'VS META'))}</span>
          <b>${mm.vsMeta.winRate}% WR</b>
          <small>${esc(tr('cx.vsTopMetaSub', '{n} pj vs Top 8 meta', { n: mm.vsMeta.games }))}${mm.vsOffMeta ? ` · ${esc(tr('cx.offMetaSub', '{wr}% off-meta', { wr: mm.vsOffMeta.winRate }))}` : ''}</small>
        </div>`);
      }
      if (rp?.resignTag) {
        tiles.push(`<div class="cx-fun-tile">
          <span>${esc(tr('cx.resignTile', 'PERFIL EN DERROTAS'))}</span>
          <b>${esc(locCxResignTag(rp.resignTag))}</b>
          <small>${esc(rp.resignSubI18n ? locRef(rp.resignSubI18n, rp.resignSub || '') : (rp.resignSub || ''))}</small>
        </div>`);
      }
      if (rp?.hunterTag) {
        const sub = [
          rp.vsRush ? tr('cx.vsRushShort', 'vs Rush {wr}%', { wr: rp.vsRush.winRate }) : null,
          rp.vsBoom ? tr('cx.vsBoomShort', 'vs Boom {wr}%', { wr: rp.vsBoom.winRate }) : null,
        ].filter(Boolean).join(' · ');
        tiles.push(`<div class="cx-fun-tile ${/Asesino|Muro/.test(rp.hunterTag) ? 'is-win' : 'is-loss'}">
          <span>${esc(tr('cx.rivalStyleTile', 'ESTILO RIVAL'))}</span>
          <b>${esc(locCxHunterTag(rp.hunterTag))}</b>
          <small>${esc(sub)}</small>
        </div>`);
      }
      if (mr?.afterMarathon) {
        tiles.push(`<div class="cx-fun-tile ${mr.afterMarathon.winRate < 46 ? 'is-loss' : 'is-win'}">
          <span>${esc(tr('cx.postMarathonTile', 'RESACA POST-MARATÓN'))}</span>
          <b>${mr.afterMarathon.winRate}% WR</b>
          <small>${esc(tr('cx.afterMarathonSub', 'Tras guerra 45m+ ({n} pj)', { n: mr.afterMarathon.games }))}${mr.afterQuick ? ` ${esc(tr('cx.afterQuickSub', 'vs {wr}% tras rápida', { wr: mr.afterQuick.winRate }))}` : ''}</small>
        </div>`);
      }
      if (mr?.rematch) {
        tiles.push(`<div class="cx-fun-tile ${mr.rematch.winRate >= 55 ? 'is-win' : mr.rematch.winRate < 45 ? 'is-loss' : ''}">
          <span>${esc(tr('cx.rematchTile', 'KARMA DE REVANCHAS'))}</span>
          <b>${mr.rematch.winRate}% WR</b>
          <small>${esc(tr('cx.rematchSub', '{w}V-{l}D en revanchas <24h', { w: mr.rematch.wins, l: mr.rematch.losses }))}${mr.rematch.revengeWinRate != null ? ` · ${esc(tr('cx.revengeSub', 'revancha tras perder: {wr}%', { wr: mr.rematch.revengeWinRate }))}` : ''}</small>
        </div>`);
      }
      if (tiles.length) {
        cards.push(`<section class="cx-card cx-curious-card cx-fun-card">
          <header class="cx-card-head">
            <div>
              <span class="cx-eyebrow">${esc(tr('cx.hiddenProfileEyebrow', 'PERFIL OCULTO Y CURIOSIDADES COMPETITIVAS'))}</span>
              <h3>${esc(tr('cx.hiddenProfileTitle', 'Mirrors, meta, psicología y revanchas'))}</h3>
            </div>
          </header>
          <div class="cx-fun-grid">${tiles.slice(0, 6).join('')}</div>
        </section>`);
      }
    }

    // D. Estabilidad de Ladder & Rendimiento por Parche (editorial, zero nested boxes, zero overlapping SVG text)
    const ecp = disc.eloComfortAndPatch;
    if (ecp && (ecp.comfort || ecp.patches?.length)) {
      const cf = ecp.comfort;
      let rangeBlockHtml = '';
      if (cf) {
        const lo = Math.min(cf.minRating ?? cf.p20, cf.p20, cf.current) - 10;
        const hi = Math.max(cf.peak ?? cf.p80, cf.p80, cf.current) + 10;
        const span = Math.max(30, hi - lo);
        const W = 600;
        const xOf = (val) => +((Math.max(0, Math.min(1, (val - lo) / span)) * (W - 12)) + 6).toFixed(1);
        const xP20 = xOf(cf.p20);
        const xP80 = xOf(cf.p80);
        const xCur = xOf(cf.current);
        const xPeak = xOf(cf.peak);
        const medVal = cf.median ?? Math.round((cf.p20 + cf.p80) / 2);
        const xMed = xOf(medVal);
        const bandW = Math.max(10, +(xP80 - xP20).toFixed(1));
        const recentHtml = cf.recentDelta
          ? `<span class="cx-elo-delta ${cf.recentDelta > 0 ? 'win' : 'loss'}">${cf.recentDelta > 0 ? '+' : ''}${cf.recentDelta} · ${esc(tr('cx.lastN', 'Últ. {n}', { n: cf.recentLookback || 10 }))}</span>`
          : '';

        rangeBlockHtml = `<div class="cx-elo-band">
          <div class="cx-elo-hero">
            <div class="cx-elo-now">
              <strong class="mono">${number(cf.current)}</strong>
              <span class="cx-elo-status">${esc(cf.zoneStatusI18n ? locRef(cf.zoneStatusI18n, cf.zoneStatus) : (cf.zoneStatus || tr('cx.inUsualZone', 'En tu zona habitual')))}</span>
              ${recentHtml}
            </div>
            <div class="cx-elo-peak-meta">
              <span>${esc(tr('cx.peakWord', 'Pico'))} <b class="mono">${number(cf.peak)}</b></span>
              <span class="cx-elo-sep" aria-hidden="true">·</span>
              <span>${number(cf.sample)} ${esc(cxPj())}</span>
            </div>
          </div>

          <svg class="cx-elo-track-svg" viewBox="0 0 ${W} 18" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="7" width="${W}" height="4" rx="2" fill="rgba(255,255,255,0.08)"></rect>
            <rect x="${xP20}" y="5" width="${bandW}" height="8" rx="4" fill="rgba(223,190,120,0.34)"></rect>
            <rect x="${xP20}" y="4" width="2" height="10" rx="1" fill="rgba(242,215,153,0.72)"></rect>
            <rect x="${+(xP20 + bandW - 2).toFixed(1)}" y="4" width="2" height="10" rx="1" fill="rgba(242,215,153,0.72)"></rect>
            <rect x="${+(xMed - 0.75).toFixed(1)}" y="3" width="1.5" height="12" fill="rgba(255,255,255,0.32)"></rect>
            <rect x="${+(xPeak - 1.25).toFixed(1)}" y="2" width="2.5" height="14" rx="1.25" fill="#78d8a6"></rect>
            <rect x="${+(xCur - 3.5).toFixed(1)}" y="1" width="7" height="16" rx="3.5" fill="#faf0d4" stroke="#0c1016" stroke-width="1.6"></rect>
          </svg>

          <div class="cx-elo-axis">
            <span>${esc(tr('cx.floorLbl', 'Piso'))} <b class="mono">${number(cf.p20)}</b></span>
            <span>${esc(tr('cx.medianLbl', 'Mediana'))} <b class="mono">${number(medVal)}</b></span>
            <span>${esc(tr('cx.ceilingLbl', 'Techo'))} <b class="mono">${number(cf.p80)}</b></span>
          </div>
        </div>`;
      }

      const comfortStatsHtml = cf ? `<dl class="cx-comfort-metrics">
        <div><dt>${esc(tr('cx.usualZoneLbl', 'Zona habitual'))}</dt><dd class="gold mono">${number(cf.p20)}–${number(cf.p80)}</dd><small>${number(cf.bandWidth ?? (cf.p80 - cf.p20))} ELO</small></div>
        <div><dt>${esc(tr('cx.nextGoalLbl', 'Próxima meta'))}</dt><dd class="mono">${number(cf.nextBarrier)}</dd><small>${esc(tr('cx.toBarrier', 'a +{n}', { n: number(cf.distToBarrier) }))}</small></div>
        <div><dt>${esc(tr('cx.biggestClimbLbl', 'Mayor subida'))}</dt><dd class="win mono">+${number(cf.maxComeback)}</dd><small>${esc(tr('cx.fromMinLbl', 'desde mínimo'))}</small></div>
        <div><dt>${esc(tr('cx.biggestDropLbl', 'Mayor caída'))}</dt><dd class="loss mono">−${number(cf.maxDrawdown)}</dd><small>${esc(tr('cx.fromPeakLbl', 'desde pico'))}</small></div>
      </dl>` : '';

      const patchHtml = ecp.patches?.length ? `<div class="cx-patch-table">
        <div class="cx-pt-head">
          <span>${esc(tr('cx.patchTableTitle', 'Rendimiento por parche de AoE2:DE'))}</span>
          <small>${esc(tr(ecp.patches.length === 1 ? 'cx.updateOne' : 'cx.updateMany', '{n} actualizaciones', { n: ecp.patches.length }))}</small>
        </div>
        <div class="cx-pt-cols" aria-hidden="true">
          <span>${esc(tr('cx.colUpdate', 'Actualización'))}</span>
          <span>${esc(tr('cx.colWinrate', 'Winrate'))}</span>
          <span class="is-right">${esc(tr('cx.colRecord', 'Récord'))}</span>
          <span class="is-right">${esc(tr('cx.colMostUsed', 'Más usada'))}</span>
        </div>
        <div class="cx-pt-rows">${ecp.patches.map((p, idx) => {
          const wrTone = p.winRate >= 55 ? 'win' : p.winRate < 46 ? 'loss' : 'neutral';
          const barCls = wrTone === 'win' ? 'bar-emerald' : wrTone === 'loss' ? 'bar-rose' : 'bar-gold';
          const ageLabel = p.isLatest
            ? tr('cx.currentPatch', 'Parche actual')
            : (idx === 1 ? tr('cx.prevPatch', 'Parche anterior') : tr('cx.patchesAgo', 'Hace {n} parches', { n: idx }));
          const bestTag = (!p.isLatest && p.isBest)
            ? `<span class="cx-pt-mark is-best">${esc(tr('cx.bestMark', 'mejor'))}</span>`
            : '';
          const civLabel = p.topCiv ? (locCiv(p.topCiv) || p.topCiv) : '';
          const civHtml = p.topCiv
            ? `<span class="cx-pt-civ" title="${esc(civLabel)}">${civBadge(p.topCiv)}<span class="cx-pt-civ-name">${esc(civLabel)}</span></span>`
            : '<span class="cx-pt-civ is-empty">—</span>';
          const rowTip = `v${esc(p.patch)} · ${esc(cxRecSp(p.wins, p.losses))} (${p.winRate}% WR)`;
          return `<div class="cx-pt-row" title="${rowTip}">
            <div class="cx-pt-id">
              <strong class="${p.isLatest ? 'is-now' : ''}">${esc(ageLabel)}</strong>
              <span class="cx-pt-ver mono">v${esc(p.patch)}${bestTag}</span>
            </div>
            <div class="cx-pt-bar-col">
              <div class="cx-pt-track" aria-hidden="true"><i class="${barCls}" data-w="${Math.max(6, Math.min(100, p.winRate))}"></i></div>
              <b class="cx-pt-wr ${wrTone} mono">${p.winRate}%</b>
            </div>
            <div class="cx-pt-rec mono">${esc(cxRecSp(p.wins, p.losses))}</div>
            ${civHtml}
          </div>`;
        }).join('')}</div>
      </div>` : '';

      const comfortEyebrow = cf?.modeLabel
        ? tr('cx.stabilityEyebrowMode', 'ESTABILIDAD DE LADDER · {mode}', { mode: cf.modeLabel.toUpperCase() })
        : tr('cx.stabilityEyebrow', 'ESTABILIDAD DE LADDER Y PARCHES');
      const stabilityInline = cf?.stabilityLabel
        ? `<span class="cx-stability-inline is-${esc(cf.stabilityTone || 'gold')}">${esc(cf.stabilityKey ? tr(cf.stabilityKey, cf.stabilityLabel) : cf.stabilityLabel)}${cf.avgSwing ? ` · ±${cf.avgSwing}/${esc(cxPj())}` : ''}</span>`
        : '';

      cards.push(`<section class="cx-card cx-curious-card cx-comfort-card">
        <header class="cx-card-head">
          <div>
            <span class="cx-eyebrow">${esc(comfortEyebrow)}</span>
            <h3>${esc(tr('cx.eloRangePatchesTitle', 'Rango de ELO y parches'))}</h3>
          </div>
          ${stabilityInline}
        </header>
        ${rangeBlockHtml}
        ${comfortStatsHtml}
        ${patchHtml}
      </section>`);
    }

    if (!cards.length) return '';
    return `<div class="cx-grid-2 cx-curious-grid${cards.length === 1 ? ' is-single-col' : ''}" id="cxSectionCuriousDiscoveries">
      ${cards.join('')}
    </div>`;
  }

  function renderReplayClocksAndMasteryRow(disc = {}, isUltra = true) {
    const cards = [];
    const clocks = disc.winLossClocks;
    if (clocks && clocks.metrics?.length) {
      const rows = clocks.metrics.map((m) => {
        const hasPaired = m.winSec != null && m.lossSec != null;
        const pairHtml = hasPaired
          ? `<span class="cx-clock-pair"><em class="win">${esc(cxW())}: ${esc(clock(m.winSec))}</em><em class="loss">${esc(cxL())}: ${esc(clock(m.lossSec))}</em></span>`
          : `<span class="cx-clock-pair"><em>${esc(tr('cx.meanColon', 'Media:'))} ${esc(m.allSec != null ? clock(m.allSec) : '—')}</em></span>`;
        const dTxt = hasPaired && m.deltaSec != null && Math.abs(m.deltaSec) >= 5
          ? `<span class="cx-delta ${m.deltaSec < 0 ? 'win' : 'loss'}">${m.deltaSec < 0 ? '−' : '+'}${fmtIdle(Math.abs(m.deltaSec))}</span>`
          : `<span class="cx-delta neutral">${hasPaired ? (m.allSec != null ? clock(m.allSec) : '—') : `${m.winCount || 0}${cxW()}/${m.lossCount || 0}${cxL()}`}</span>`;
        return `<div class="cx-clock-row">
          <strong>${esc(locCxClock(m))}</strong>
          ${pairHtml}
          ${dTxt}
        </div>`;
      }).join('');
      cards.push(`<section class="cx-card cx-clocks-card" id="cxSectionWinLossClocks">
        <header class="cx-card-head">
          <div>
            <span class="cx-eyebrow">${esc(tr('cx.clocksEyebrow', 'RELOJES DE VICTORIA VS DERROTA · {n} REPLAYS', { n: number(clocks.sample) }))}</span>
            <h3>${esc(tr('cx.clocksTitle', 'Tus tiempos de avance al ganar vs al perder'))}</h3>
          </div>
          ${clocks.isPreliminary ? `<span class="cx-meta-pill">${esc(tr('cx.preliminary', 'Preliminar'))}</span>` : ''}
        </header>
        ${wrapUltraGate(`<div class="cx-clocks-list">${rows}</div>`, { locked: !isUltra, ctaLabel: tr('cx.unlockClocks', 'Desbloquea tus relojes de Victoria vs Derrota'), compact: true })}
      </section>`);
    }

    const cmh = disc.civMasteryHistory;
    if (cmh) {
      const ringHtml = cmh.utilizationPct != null
        ? svgWrRing(cmh.utilizationPct, icon('crown'), 68)
        : `<span class="cx-spot-medal-frame">${icon('crown')}</span>`;
      const missedList = (cmh.topMissed || []).map((x) =>
        `<li><b>${esc(x.title)}</b><small>${x.civ ? `${esc(locCiv(x.civ) || x.civ)} · ` : ''}${esc(tr('cx.timesMissed', '{n}× sin explotar', { n: x.count }))}</small></li>`
      ).join('');
      const siegeTxt = cmh.siegePct != null ? `${cmh.siegePct}%` : '—';
      const monkTxt = cmh.monkPct != null ? `${cmh.monkPct}%` : '—';
      const castleTxt = cmh.castlePct != null ? `${cmh.castlePct}%` : '—';
      cards.push(`<section class="cx-card cx-mastery-hist-card" id="cxSectionCivMasteryHist">
        <header class="cx-card-head">
          <div>
            <span class="cx-eyebrow">${esc(tr('cx.masteryHistEyebrow', 'MAESTRÍA HISTÓRICA (56 CIVS) Y PUNTOS CIEGOS'))}${cmh.castleReachedGames ? ` · ${esc(tr('cx.inCastleCount', '{n} EN CASTILLOS', { n: cmh.castleReachedGames }))}` : ''}</span>
            <h3>${esc(tr('cx.masteryHistTitle', 'Aprovechamiento de bonos y variedad de arsenal'))}</h3>
          </div>
        </header>
        ${wrapUltraGate(`<div class="cx-cmh-top">
          ${ringHtml}
          <div class="cx-cmh-kpis">
            <div class="cx-ckpi"><span>${esc(tr('cx.siegeLbl', 'Asedio'))}</span><b class="${cmh.siegePct != null ? (cmh.siegePct >= 35 ? 'win' : cmh.siegePct < 15 ? 'loss' : '') : ''}">${siegeTxt}</b></div>
            <div class="cx-ckpi"><span>${esc(tr('cx.monksLbl', 'Monjes'))}</span><b class="${cmh.monkPct != null && cmh.monkPct >= 25 ? 'win' : ''}">${monkTxt}</b></div>
            <div class="cx-ckpi"><span>${esc(tr('cx.castlesLbl', 'Castillos'))}</span><b class="gold">${castleTxt}</b></div>
            ${cmh.goldUnitPct != null ? `<div class="cx-ckpi"><span>${esc(tr('cx.goldTrashLbl', 'Oro / Basura'))}</span><b>${cmh.goldUnitPct}% / ${cmh.trashUnitPct}%</b></div>` : ''}
          </div>
        </div>
        ${missedList ? `<div class="cx-cmh-missed"><span class="central-mini-k">${esc(tr('cx.missedBonusesKicker', 'BONOS POR EXPLOTAR MÁS RECURRENTES'))}</span><ul>${missedList}</ul></div>` : ''}`, { locked: !isUltra, ctaLabel: tr('cx.unlockMasteryHist', 'Desbloquea tu Maestría Histórica de 56 Civs'), compact: true })}
      </section>`);
    }

    if (!cards.length) return '';
    return `<div class="cx-grid-2${cards.length === 1 ? ' is-single-col' : ''}" id="cxSectionClocksMastery">
      ${cards.join('')}
    </div>`;
  }

  function renderPersonalAcademySection(academy, { isUltra = true, isExternal = false } = {}) {
    if (isExternal || !academy || !academy.ok) return '';
    const stageStrip = (academy.stageEvolution || []).map((st) => {
      const hasGrade = Boolean(st.recentGrade);
      const d = st.deltaScore;
      const dTone = d == null || d === 0 ? 'neutral' : (d > 0 ? 'win' : 'loss');
      const dChip = d != null && d !== 0
        ? `<span class="cx-delta ${dTone}">${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d)}</span>`
        : (hasGrade ? `<span class="cx-delta neutral">${esc(tr('cx.stableLbl', 'Estable'))}</span>` : '');
      const barTone = st.recentGrade === 'S' ? 'gold' : st.recentGrade === 'A' ? 'emerald' : st.recentGrade === 'B' ? 'gold' : 'rose';
      const stLabelLoc = locAge(st.id, st.label);
      return `<div class="cx-acad-stage-cell${hasGrade ? ` grade-${esc(st.recentGrade)}` : ' is-empty'}">
        <div class="cx-acad-st-top">
          <span class="cx-acad-st-lbl">${ageBrandEmblem(st.id, 28)}${esc(stLabelLoc)}</span>
          <strong class="pm-grade-stamp${hasGrade ? ` grade-${esc(st.recentGrade)}` : ''}">${hasGrade ? esc(st.recentGrade) : '—'}</strong>
        </div>
        <div class="cx-acad-st-bottom">
          <b>${st.recentScore != null ? `${st.recentScore}` : '—'}<small>/100</small></b>
          ${dChip}
        </div>
        <div class="central-bar-track xs" aria-hidden="true"><i class="bar-${barTone}" data-w="${st.recentScore != null ? Math.max(8, Math.min(100, st.recentScore)) : 0}"></i></div>
        <small class="cx-acad-st-meta">${number(st.sample || 0)} ${esc(tr('cx.replaysWord', 'replays'))}${st.olderGrade ? ` · ${esc(tr('cx.beforeGrade', 'antes {grade}', { grade: st.olderGrade }))}` : ''}</small>
      </div>`;
    }).join('');

    const habitRows = (academy.habits || []).map((h) => {
      const toneCls = h.tone === 'win' ? 'win' : h.tone === 'loss' ? 'loss' : 'neutral';
      const arrow = h.deltaArrow || (h.improved ? '▲' : '▼');
      const deltaPill = h.deltaText
        ? `<span class="cx-delta ${h.improved ? 'win' : 'loss'}">${arrow} ${esc(h.deltaText)}</span>`
        : '';
      const hLbl = h.labelI18n ? locRef(h.labelI18n, h.label) : h.label;
      const hVal = h.valueI18n ? locRef(h.valueI18n, h.valueText) : h.valueText;
      const hSub = h.subI18n ? locRef(h.subI18n, h.subText || '') : (h.subText || '');
      return `<div class="cx-acad-habit-row is-${toneCls}">
        <div class="cx-acad-h-copy">
          <strong>${esc(hLbl)}</strong>
          <small>${esc(hSub)}</small>
        </div>
        <div class="cx-acad-h-stat">
          <b class="cx-acad-h-val">${esc(hVal)}</b>
          ${deltaPill}
          ${trainDumbbellBtn({ source: 'Central', title: hLbl, detail: hSub, metric: hVal || '', tab: 'orders', compact: true })}
        </div>
      </div>`;
    }).join('');

    const pf = academy.priorityFocus;
    const pfTitle = pf ? tr(`cxe.focus_${pf.domain}_t`, tr('cxe.focus_default_t', pf.title)) : '';
    const pfDetail = pf ? tr(`cxe.focus_${pf.domain}_d`, tr('cxe.focus_default_d', pf.detail || '')) : '';
    const focusBanner = pf
      ? `<div class="cx-acad-focus-strip">
          <span class="cx-acad-focus-ico">${icon('reviewFocus')}</span>
          <div class="cx-acad-focus-main">
            <span class="cx-eyebrow">${esc(tr('cx.priorityFocusEyebrow', 'FOCO PRIORITARIO #1 · {count}/{sample} PARTIDAS', { count: number(pf.count), sample: number(pf.sample) }))}</span>
            <h4>${esc(pfTitle)}</h4>
            <p>${esc(pfDetail)}</p>
          </div>
          <div class="cx-acad-focus-pct"><b>${pf.pct}%</b><small>${esc(tr('cx.frequencyWord', 'frecuencia'))}</small></div>
          ${trainDumbbellBtn({ source: 'Central', title: pfTitle, detail: pfDetail, metric: `${pf.pct}%`, tab: 'orders' })}
        </div>`
      : '';

    const inner = `<div class="cx-acad-body">
      ${focusBanner}
      <div class="cx-acad-stage-strip">${stageStrip}</div>
      <div class="cx-acad-habits-table">${habitRows}</div>
    </div>`;

    const acadScopeLoc = academy.isFallbackScope
      ? tr('cxe.acScopeFallback', academy.scopeLabel || '', { n: number(academy.totalReplays) })
      : tr('cxe.acScopeMode', academy.scopeLabel || `${number(academy.totalReplays)} ${tr('cx.replaysWord', 'replays')}`, { n: number(academy.totalReplays) });

    return `<section class="cx-card cx-academy-card" id="cxSectionAcademy">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.academyEyebrow', 'LABORATORIO DE MEJORA PERSONAL'))}</span>
          <h3>${esc(tr('cx.academyTitle', 'Progreso por edad y hábitos mecánicos'))}</h3>
          <p class="cx-card-context">${esc(tr('cx.academyWindowCtx', '{scope} · ventana reciente ({recent}) frente a previa ({older})', { scope: acadScopeLoc, recent: number(academy.recentWindow), older: number(academy.olderWindow) }))}</p>
        </div>
        <span class="cx-meta-pill${academy.isFallbackScope ? ' is-warn' : ''}">${esc(academy.isFallbackScope ? tr('cx.generalHistory', 'Historial general') : tr('cx.localTelemetry', 'Telemetría local'))}</span>
      </header>
      ${wrapUltraGate(inner, { locked: !isUltra, ctaLabel: tr('cx.unlockAcademy', 'Desbloquea tu Laboratorio de Mejora Personal') })}
    </section>`;
  }

  function renderCompetitiveIntelSection(intel, { isUltra = true, modeLabel = 'RM 1v1' } = {}) {
    if (!intel || !intel.ok) return '';
    const gains = Array.isArray(intel.gains) ? intel.gains : [];
    const leaks = Array.isArray(intel.leaks) ? intel.leaks : [];
    const vsOpenings = Array.isArray(intel.vsOpenings) ? intel.vsOpenings : [];
    const nemesis = Array.isArray(intel.nemesisCivs) ? intel.nemesisCivs : [];
    const prey = Array.isArray(intel.preyCivs) ? intel.preyCivs : [];
    const session = intel.session || null;

    const factorIconHtml = (f) => {
      if (String(f.id || '').startsWith('map-')) {
        const rawMap = String(f.title || '').replace(/^Mapa:\s*/i, '').trim();
        return `<span class="cx-elo-ico is-map">${mapBadge(rawMap, 'sm')}</span>`;
      }
      if (String(f.id || '').startsWith('vs-op-')) return `<span class="cx-elo-ico">${icon('combat')}</span>`;
      if (String(f.id || '').startsWith('phase-')) return `<span class="cx-elo-ico">${icon('clock')}</span>`;
      return `<span class="cx-elo-ico">${icon('crown')}</span>`;
    };

    const localizeFactorTitle = (f) => {
      const title = typeof f === 'string' ? f : (f?.title || '');
      const id = typeof f === 'object' ? String(f?.id || '') : '';
      if (id === 'pool-mains') return tr('cxe.eloMainsTitle', title);
      if (id === 'pool-experiments') return tr('cxe.eloExpTitle', title);
      if (id === 'phase-post-imp') {
        const cm = /\((\d+)m\+\)/.exec(title);
        return tr('cxe.eloLateTitle', title, { cut: cm ? cm[1] : '50' });
      }
      if (id === 'phase-early') {
        const cm = /\(<(\d+)m\)/.exec(title);
        return tr('cxe.eloEarlyTitle', title, { cut: cm ? cm[1] : '22' });
      }
      if (id.startsWith('vs-op-')) {
        const rawOp = title.replace(/^Contra\s+/i, '').trim();
        return tr('cxe.eloVsOpTitle', title, { opening: locOpening(rawOp, rawOp) });
      }
      const m = /^Mapa:\s*(.+)$/i.exec(String(title || ''));
      if (m) return tr('cx.mapPrefix', 'Mapa: {map}', { map: locMap(m[1]) || m[1] });
      return title || '';
    };

    const renderFactorRow = (f, kind) => {
      const sign = f.netElo > 0 ? '+' : '';
      const tone = kind === 'gain' ? 'win' : 'loss';
      const titleLoc = localizeFactorTitle(f);
      const pinBtn = kind === 'leak'
        ? trainDumbbellBtn({
            source: 'Central · ELO',
            title: titleLoc,
            detail: `${f.winRate}% WR (${cxWL(f.wins, f.losses)})`,
            metric: `${sign}${f.netElo} ELO`,
            tab: String(f.id || '').startsWith('vs-op-') ? 'matchups' : 'orders',
            ruleType: String(f.id || '').startsWith('map-') ? 'on_map' : '',
            mapName: String(f.id || '').startsWith('map-') ? String(f.title || '').replace(/^Mapa:\s*/i, '').trim() : '',
            compact: true,
          })
        : '';
      return `<div class="cx-elo-row is-${tone}">
        ${factorIconHtml(f)}
        <div class="cx-elo-copy">
          <strong>${esc(titleLoc)}</strong>
          <small>${f.winRate}% WR · ${esc(cxWL(f.wins, f.losses))} (${number(f.games)} ${esc(cxPj())})</small>
        </div>
        <b class="cx-elo-impact is-${tone}">${sign}${f.netElo} <small>ELO</small></b>
        ${pinBtn}
      </div>`;
    };

    const hasBoth = gains.length > 0 && leaks.length > 0;
    const hasAttribution = gains.length > 0 || leaks.length > 0;
    const eloBody = hasBoth
      ? `<div class="cx-elo-split">
          <div class="cx-elo-group">
            <span class="central-mini-k is-win">${esc(tr('cx.motorsKicker', '▲ MOTORES DE ELO'))}</span>
            <div class="cx-elo-list">${gains.map((g) => renderFactorRow(g, 'gain')).join('')}</div>
          </div>
          <div class="cx-elo-group">
            <span class="central-mini-k is-loss">${esc(tr('cx.leaksKicker', '▼ FUGAS DE ELO'))}</span>
            <div class="cx-elo-list">${leaks.map((l) => renderFactorRow(l, 'leak')).join('')}</div>
          </div>
        </div>`
      : `<div class="cx-elo-spotlight-row">
          ${(gains.length ? gains : leaks).map((f) => {
            const kind = gains.length ? 'gain' : 'leak';
            const sign = f.netElo > 0 ? '+' : '';
            const tone = kind === 'gain' ? 'win' : 'loss';
            return `<article class="cx-elo-spot is-${tone}">
              <div class="cx-elo-spot-top">
                ${factorIconHtml(f)}
                <b class="cx-elo-impact is-${tone}">${sign}${f.netElo} <small>${esc(tr('cx.netEloWord', 'ELO neto'))}</small></b>
              </div>
              <strong>${esc(localizeFactorTitle(f))}</strong>
              <small>${f.winRate}% WR · ${esc(cxWL(f.wins, f.losses))} · ${number(f.games)} ${esc(tr('cx.gamesWord', 'partidas'))}</small>
            </article>`;
          }).join('')}
        </div>`;

    const attributionCard = hasAttribution ? `<section class="cx-card cx-elo-card" id="cxEloAttributionCard">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.eloImpactEyebrow', 'IMPACTO EN ELO · {mode}', { mode: modeLabel }))}</span>
          <h3>${esc(hasBoth ? tr('cx.eloMotorsLeaksTitle', 'Motores y fugas de ELO') : (gains.length ? tr('cx.eloMotorsOnlyTitle', 'Principales motores de ELO') : tr('cx.eloLeaksOnlyTitle', 'Principales fugas de ELO')))}</h3>
          <p class="cx-card-context">${esc(tr('cx.eloNetCtx', 'Saldo neto ajustado por ELO del rival sobre {n} partidas', { n: number(intel.totalMatches) }))}${!hasBoth && gains.length ? ` · ${esc(tr('cx.noStructuralLeaks', 'sin fugas estructurales detectadas'))}` : ''}</p>
        </div>
      </header>
      ${wrapUltraGate(eloBody, { locked: !isUltra, ctaLabel: tr('cx.unlockEloBalance', 'Desbloquea tu balance de motores y fugas de ELO') })}
    </section>` : '';

    const openingRows = vsOpenings.slice(0, 5).map((op) => {
      const tone = op.winRate >= 55 ? 'win' : op.winRate < 45 ? 'loss' : 'neutral';
      const barTone = tone === 'win' ? 'emerald' : tone === 'loss' ? 'rose' : 'gold';
      const antLbl = op.antidote
        ? (op.antidote.kind === 'civ'
          ? tr('cxe.playCiv', op.antidote.label, { civ: locCiv(String(op.antidote.label || '').replace(/^Jugar\s+/i, '')) || String(op.antidote.label || '').replace(/^Jugar\s+/i, '') })
          : locOpening(op.antidote.label, op.antidote.label))
        : '';
      const ant = op.antidote
        ? `<span class="cx-antidote-pill">${esc(tr('cx.antidoteWord', 'Antídoto:'))} <b>${esc(antLbl)}</b> (${op.antidote.winRate}%)</span>`
        : '';
      const opLoc = locOpening(op.opening, op.opening);
      return `<div class="cx-vs-op-row">
        <div class="cx-vs-op-top">
          <strong>vs ${esc(opLoc)} <small>${number(op.games)} ${esc(cxPj())}</small></strong>
          <span class="cx-entity-stat">${ant}<small>${esc(cxWL(op.wins, op.losses))}</small> <b class="${tone}">${op.winRate}%</b>${op.winRate < 50 ? trainDumbbellBtn({ source: 'Central', title: `vs ${opLoc}`, detail: `${op.winRate}% WR (${cxWL(op.wins, op.losses)})`, metric: `${op.winRate}% WR`, tab: 'orders', compact: true }) : ''}</span>
        </div>
        <div class="central-bar-track sm has-mid" aria-hidden="true"><i class="bar-${barTone}" data-w="${Math.max(4, Math.min(100, op.winRate))}"></i></div>
      </div>`;
    }).join('');

    const renderCivPills = (list, tone) => list.map((c) => {
      const cName = locCiv(c.civ) || c.civ;
      const pin = tone === 'loss'
        ? trainDumbbellBtn({ source: 'Central', title: `vs ${cName}`, detail: `${c.winRate}% WR (${cxWL(c.wins, c.losses)})`, metric: `${c.winRate}%`, tab: 'matchups', ruleType: 'vs_civ', civSlug: c.civ, civName: cName, compact: true })
        : '';
      return `<span class="cx-matchup-pill is-${tone}">${civBadge(c.civ)}<span class="cx-mp-text"><b>${esc(cName)}</b><small>${c.winRate}% · ${esc(cxWL(c.wins, c.losses))}</small></span>${pin}</span>`;
    }).join('');

    const sessionHtml = session ? `<div class="cx-session-col">
      <span class="central-mini-k">${esc(tr('cx.sessionCurveKicker', 'CURVA DE SESIÓN ({n} SESIONES)', { n: number(session.totalSessions) }))}${session.modeLabel ? ` · ${esc(session.modeLabel.toUpperCase())}` : ''}</span>
      <div class="cx-session-rows">
        ${(session.buckets || []).map((b) => {
          const bTone = b.winRate >= 55 ? 'win' : b.winRate < 45 ? 'loss' : 'neutral';
          const barTone = bTone === 'win' ? 'emerald' : bTone === 'loss' ? 'rose' : 'gold';
          const bLbl = CX_SESS_BUCKET_KEYS[b.id] ? tr(CX_SESS_BUCKET_KEYS[b.id], b.label) : b.label;
          return `<div class="cx-sess-row">
            <div class="cx-sess-top">
              <strong>${esc(bLbl)}</strong>
              <span class="cx-entity-stat"><small>${esc(cxWL(b.wins, b.losses))} · ${b.netElo >= 0 ? '+' : ''}${b.netElo} ELO</small> <b class="${bTone}">${b.winRate}%</b></span>
            </div>
            <div class="central-bar-track sm has-mid" aria-hidden="true"><i class="bar-${barTone}" data-w="${Math.max(4, Math.min(100, b.winRate))}"></i></div>
          </div>`;
        }).join('')}
        ${session.postLossStreakTilt && session.postLossStreakTilt.isTiltRisk ? `<div class="cx-sess-tilt-alert">
          <strong>${esc(tr('cx.tiltAlertTitle', 'Alerta tras 2+ derrotas seguidas'))}</strong>
          <span>${session.postLossStreakTilt.winRate}% WR (${esc(cxWL(session.postLossStreakTilt.wins, session.postLossStreakTilt.losses))} · ${session.postLossStreakTilt.netElo} ELO)</span>
        </div>` : ''}
      </div>
      ${session.verdict ? `<p class="cx-session-verdict">${esc(session.verdictI18n ? locRef(session.verdictI18n, session.verdict) : session.verdict)}</p>` : ''}
    </div>` : '';

    const hasLeft = Boolean(openingRows || nemesis.length || prey.length);
    const hasRight = Boolean(sessionHtml);
    const matchupSessionCard = (hasLeft || hasRight) ? `<section class="cx-card cx-intel-card" id="cxMatchupSessionCard">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.antidotesEyebrow', 'ANTÍDOTOS TÁCTICOS Y RITMO DE SESIÓN'))}</span>
          <h3>${esc(tr('cx.antidotesTitle', 'Aperturas rivales, cruces y fatiga'))}</h3>
        </div>
      </header>
      ${wrapUltraGate(`<div class="cx-intel-split${hasLeft && hasRight ? '' : ' is-single'}">
        ${hasLeft ? `<div class="cx-intel-left">
          ${openingRows ? `<div class="cx-vs-openings-list"><span class="central-mini-k">${esc(tr('cx.vsOppOpeningsKicker', 'CONTRA APERTURAS RIVALES'))}</span>${openingRows}</div>` : ''}
          ${(nemesis.length || prey.length) ? `<div class="cx-cruces-wrap">
            ${nemesis.length ? `<div class="cx-cruces-group"><span class="central-mini-k">${esc(tr('cx.toughRivalsKicker', 'RIVALES INCÓMODOS'))}</span><div class="cx-matchup-pills">${renderCivPills(nemesis, 'loss')}</div></div>` : ''}
            ${prey.length ? `<div class="cx-cruces-group"><span class="central-mini-k">${esc(tr('cx.goodMatchupsKicker', 'CRUCES FAVORABLES'))}</span><div class="cx-matchup-pills">${renderCivPills(prey, 'win')}</div></div>` : ''}
          </div>` : ''}
        </div>` : ''}
        ${sessionHtml}
      </div>`, { locked: !isUltra, ctaLabel: tr('cx.unlockAntidotes', 'Desbloquea antídotos de apertura y curva de sesión') })}
    </section>` : '';

    if (!attributionCard && !matchupSessionCard) return '';
    return `<div class="cx-intel-stack" id="cxSectionIntel">
      ${attributionCard}
      ${matchupSessionCard}
    </div>`;
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
    const hasMapEapm = Array.isArray(stats.topMapsByEapm) && stats.topMapsByEapm.length >= 2;
    const civSort = options.civSort === 'wr' && stats.topCivsByWr?.length >= 2 ? 'wr' : 'games';
    const mapSort = options.mapSort === 'eapm' && hasMapEapm
      ? 'eapm'
      : (options.mapSort === 'wr' && stats.topMapsByWr?.length >= 2 ? 'wr' : 'games');
    const isExternal = data.isOwnProfile === false;
    const isUltra = options.isUltra !== undefined ? Boolean(options.isUltra) : (data.isUltra === true);
    const rawPlan = String(options.plan || data.plan || '').toLowerCase();
    const planTier = isUltra || rawPlan === 'promax' || rawPlan === 'ultra' || rawPlan === 'beta'
      ? 'ultra'
      : (rawPlan === 'pro' ? 'pro' : (rawPlan === 'free' ? 'free' : 'pro'));
    const isProOrUltra = planTier === 'pro' || planTier === 'ultra';
    const reqLmWin = String(options.lmWindow ?? '20');
    const lmWindow = planTier === 'free'
      ? '10'
      : planTier === 'pro'
        ? (reqLmWin === '10' ? '10' : '20')
        : (['10', '20', '50', 'all'].includes(reqLmWin) ? reqLmWin : '20');
    const civFilter = String(options.civFilter || '').trim().toLowerCase();
    const diagTab = options.diagTab || 'maps';

    // 1. HERO CARD + KPIs clickeables (Smart Auto-Scroll) + SEGMENTED MODE TABS
    const initials = String(data.alias || '?').replace(/[|·]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
    const streakVal = ladder.streak;
    const streakPill = streakVal > 0
      ? `<span class="cx-streak win">+${streakVal}${esc(cxW())}</span>`
      : streakVal < 0
        ? `<span class="cx-streak loss">${streakVal}${esc(cxL())}</span>`
        : '';

    const kpi4Title = ins?.eapm?.avgSelf != null ? tr('cx.avgEapmKpi', 'eAPM MEDIO') : tr('cx.matchesKpi', 'PARTIDAS');
    const kpi4Val = ins?.eapm?.avgSelf != null
      ? `${dec(ins.eapm.avgSelf, 1)}`
      : `${number(ladder.games || data.totalProfileGames || 0)}`;
    const kpi4Sub = ins?.eapm?.avgSelf != null
      ? [`${number(ins.eapm.sampleCount)} ${tr('cx.replaysWord', 'replays')}`, ins.eapm.avgRival != null ? tr('cx.rivalAvg', 'rival {val}', { val: dec(ins.eapm.avgRival, 1) }) : null].filter(Boolean).join(' · ')
      : tr('cx.civsPlayed', '{n} civs jugadas', { n: stats.totalDistinctCivs || 0 });

    const modePills = (data.availableModes || []).map((id) => {
      const m = data.modes && data.modes[id];
      if (!m || !m.ladder) return '';
      const active = id === modeId;
      const meta = id === 'global' ? `${number(m.ladder.games)} ${cxPj()}` : (m.ladder.rating ? number(m.ladder.rating) : '—');
      return `<button type="button" class="cx-mode-tab${active ? ' is-active' : ''}" data-central-mode="${esc(id)}" aria-pressed="${active}">
        <span>${esc(locCxModeLabel(id, m.label))}</span>
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
              ${data.country ? `<span class="identity-country">${esc(data.country.toUpperCase())}</span>` : ''}
            </div>
            <div class="cx-id-meta">
              <span class="mono">#${esc(data.profileId)}</span>
              ${data.totalProfileGames ? `<span>· <b>${number(data.totalProfileGames)}</b> ${esc(tr('cx.totalMatches', 'partidas totales'))}</span>` : ''}
              ${data.dropRate != null ? `<span>${esc(tr('cx.dropsPct', '· {pct}% drops', { pct: dec(data.dropRate, 1) }))}</span>` : ''}
              ${data.insightsPending ? `<span class="cx-sync-pill">${esc(tr('cx.analyzingReplays', 'Analizando replays…'))}</span>` : (data.stale ? `<span class="cx-sync-pill">${esc(tr('cx.updating', 'Actualizando…'))}</span>` : '')}
            </div>
          </div>
        </div>
        <div class="cx-kpi-row">
          <button type="button" class="cx-kpi is-gold is-jumpable" data-scroll-view="overview" data-scroll-target="#cxSectionChart">
            <span>${esc(modeId === 'global' ? tr('cx.bestElo', 'MEJOR ELO') : tr('cx.eloMode', 'ELO {mode}', { mode: mode.label }))}</span>
            <strong>${ladder.rating != null ? number(ladder.rating) : '—'}</strong>
            <small>${esc(ladder.peak ? `${tr('cx.peakWord', 'Pico')} ${number(ladder.peak)}` : tr('cx.noPeak', 'Sin pico'))}</small>
          </button>
          <button type="button" class="cx-kpi is-jumpable" data-scroll-view="overview" data-scroll-target="#cxSectionLastMatch, #cxSectionChart">
            <span>${esc(tr('cx.winsKpi', 'VICTORIAS'))}</span>
            <strong class="${ladder.winRate >= 54 ? 'win' : ladder.winRate != null && ladder.winRate < 46 ? 'loss' : ''}">${ladder.winRate != null ? `${ladder.winRate}%` : '—'}${streakPill}</strong>
            <small>${esc(cxWL(ladder.wins || 0, ladder.losses || 0))}</small>
          </button>
          <button type="button" class="cx-kpi is-jumpable" data-scroll-view="mastery" data-scroll-target="#cxSectionCivs">
            <span>${esc(modeId === 'global' ? tr('cx.bestRank', 'MEJOR RANKING') : tr('cx.modeRank', 'RANKING DEL MODO'))}</span>
            <strong>${ladder.rank ? `#${number(ladder.rank)}` : '—'}</strong>
            <small>${esc(ladder.ladderPercentile ? `Top ${dec(ladder.ladderPercentile, 1)}%` : (ladder.rankModeLabel || tr('cx.unranked', 'Sin clasificar')))}</small>
          </button>
          <button type="button" class="cx-kpi is-jumpable" data-scroll-view="mastery" data-scroll-target="#cxSectionMaps"${hasMapEapm ? ' data-scroll-map-eapm="1"' : ''}>
            <span>${esc(kpi4Title)}</span>
            <strong>${esc(kpi4Val)}</strong>
            <small>${esc(kpi4Sub)}</small>
          </button>
        </div>
      </div>
      <div class="cx-mode-bar" role="group" aria-label="${esc(tr('cx.statsModeAria', 'Modo de estadísticas'))}">${modePills}</div>
    </section>`;

    // 2. GRÁFICO PRINCIPAL
    const chartInner = modeId === 'global'
      ? renderGlobalLadderComparison(mode.ladderComparison || data.allLadders)
      : renderInteractiveEloChart(mode, eloRange, { planTier });
    const chartBlock = `<div id="cxSectionChart">${chartInner}</div>`;

    // 3. CIVILIZACIONES + DIAGNÓSTICO MASTER-DETAIL ("¿Cómo me va con esta civ?")
    const modeLabelLoc = locCxModeLabel(modeId, mode.label);
    const allCivsList = Array.isArray(stats.allCivs) && stats.allCivs.length ? stats.allCivs : (stats.topCivs || []);
    const baseCivList = civFilter
      ? allCivsList.filter((c) => {
          const en = String(c.civ || '').toLowerCase();
          const loc = String(locCiv(c.civ) || '').toLowerCase();
          return en.includes(civFilter) || loc.includes(civFilter);
        }).slice(0, 12)
      : (civSort === 'wr' ? stats.topCivsByWr : stats.topCivs);
    const civDiagnostics = mode.civDiagnostics || {};
    const defaultDiagSlug = (baseCivList[0]?.slug) || (allCivsList[0]?.slug) || Object.keys(civDiagnostics)[0] || null;
    const selectedCivSlug = (options.selectedCivSlug && (civDiagnostics[options.selectedCivSlug] || allCivsList.some((c) => c.slug === options.selectedCivSlug)))
      ? options.selectedCivSlug
      : defaultDiagSlug;
    const activeDiag = selectedCivSlug ? (civDiagnostics[selectedCivSlug] || null) : null;

    const civToggle = stats.topCivsByWr?.length >= 2 ? `<div class="cx-sort-pills">
      <button type="button" class="cx-sort-btn${civSort === 'games' ? ' active' : ''}" aria-pressed="${civSort === 'games'}" data-civ-sort="games">${esc(tr('cx.mostPlayed', 'Más jugadas'))}</button>
      <button type="button" class="cx-sort-btn${civSort === 'wr' ? ' active' : ''}" aria-pressed="${civSort === 'wr'}" data-civ-sort="wr">${esc(tr('cx.bestPct', 'Mejor %'))}</button>
    </div>` : '';

    const civMasterDetail = `<section class="cx-card cx-civ-master-card" id="cxSectionCivs">
      <header class="cx-card-head">
        <div>
          <h3>${esc(tr('central.civDiagTitle', 'Civilizaciones · ¿Cómo me va con esta civ?'))}</h3>
          <p class="cx-card-context">${stats.sourceScope === 'all-time' ? esc(tr('central.scopeAllTime', 'Historial disponible')) : esc(tr('central.scopeRecent', 'Muestra reciente'))} · ${number(stats.totalCivGames || 0)} ${esc(tr('central.matchesUnit', 'partidas'))} · ${esc(tr('central.civDiagHint', 'tocá cualquier civ para diagnosticar patrones'))}</p>
        </div>
        <div class="cx-civ-controls">
          <input type="search" class="cx-civ-filter" id="cxCivFilterInput" value="${esc(options.civFilter || '')}" placeholder="${esc(tr('central.civFilterPlaceholder', 'Buscar civ…'))}" autocomplete="off" spellcheck="false" />
          ${civToggle}
        </div>
      </header>
      <div class="cx-master-detail">
        <div class="cx-master-list">
          <div class="cx-entity-list">${renderMasteryRows(baseCivList, { kind: 'civ', selectedCivSlug, isUltra })}</div>
        </div>
        <div class="cx-detail-pane">
          ${renderCivDiagnosticPanel(activeDiag, { activeTab: diagTab, isUltra, modeLabel: modeLabelLoc })}
        </div>
      </div>
    </section>`;

    // 3b. MAPAS + DIAGNÓSTICO MASTER-DETAIL POR MAPA + PROMEDIO DE eAPM INTEGRADO
    const mapList = mapSort === 'eapm'
      ? (stats.topMapsByEapm || [])
      : (mapSort === 'wr' ? stats.topMapsByWr : stats.topMaps);
    const allMapsList = Array.isArray(stats.allMaps) && stats.allMaps.length ? stats.allMaps : (mapList || []);
    const mapDiagnosticsRaw = mode.mapDiagnostics || {};
    const normMapKey = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const mapDiagnostics = {};
    for (const [k, val] of Object.entries(mapDiagnosticsRaw)) {
      const nk = normMapKey(k);
      if (nk && val) mapDiagnostics[nk] = val;
    }
    const defaultMapKey = normMapKey(mapList?.[0]?.mapKey || mapList?.[0]?.mapName || allMapsList?.[0]?.mapName) || Object.keys(mapDiagnostics)[0] || null;
    const requestedMapKey = options.selectedMapKey ? normMapKey(options.selectedMapKey) : null;
    const selectedMapKey = (requestedMapKey && (mapDiagnostics[requestedMapKey] || allMapsList.some((m) => normMapKey(m.mapKey || m.mapName) === requestedMapKey)))
      ? requestedMapKey
      : defaultMapKey;
    const activeMapDiag = selectedMapKey ? (mapDiagnostics[selectedMapKey] || null) : null;
    const mapDiagTab = options.mapDiagTab || 'civs';

    const maxMapEapm = Math.max(50, ...(stats.topMapsByEapm || []).map((m) => Number(m.avgEapm) || 0));
    const mapToggle = `<div class="cx-sort-pills">
      <button type="button" class="cx-sort-btn${mapSort === 'games' ? ' active' : ''}" aria-pressed="${mapSort === 'games'}" data-map-sort="games">${esc(tr('central.mostPlayedMaps', 'Más jugados'))}</button>
      ${stats.topMapsByWr?.length >= 2 ? `<button type="button" class="cx-sort-btn${mapSort === 'wr' ? ' active' : ''}" aria-pressed="${mapSort === 'wr'}" data-map-sort="wr">${esc(tr('central.bestWr', 'Mejor %'))}</button>` : ''}
      ${hasMapEapm ? `<button type="button" class="cx-sort-btn${mapSort === 'eapm' ? ' active' : ''}" aria-pressed="${mapSort === 'eapm'}" data-map-sort="eapm">eAPM${!isUltra ? ' · ULTRA' : ''}</button>` : ''}
    </div>`;

    const mapRowsHtml = renderMasteryRows(mapList, { kind: 'map', selectedMapKey, mapSort, isUltra, maxEapm: maxMapEapm });
    const mapsSection = `<section class="cx-card cx-maps-card cx-civ-master-card" id="cxSectionMaps">
      <header class="cx-card-head">
        <div>
          <h3>${esc(tr('central.mapsEapmTitle', 'Mapas · ¿Cómo me va en este terreno?'))}</h3>
          <p class="cx-card-context">${stats.sourceScope === 'all-time' ? esc(tr('central.scopeAllTime', 'Historial disponible')) : esc(tr('central.scopeRecent', 'Muestra reciente'))} · ${number(stats.totalMapGames || 0)} ${esc(tr('central.matchesUnit', 'partidas'))}${stats.modeAvgEapm != null ? ` · ${esc(tr('central.modeAvgEapm', 'Media del modo'))}: ${dec(stats.modeAvgEapm, 1)} eAPM (${number(stats.mapEapmSample || 0)} ${esc(tr('cx.replaysWord', 'replays'))})` : ''} · ${esc(tr('cx.tapMapDiag', 'toca cualquier mapa para ver diagnóstico'))}</p>
        </div>
        ${mapToggle}
      </header>
      <div class="cx-master-detail">
        <div class="cx-master-list">
          <div class="cx-entity-list">${mapSort === 'eapm' && !isUltra ? wrapUltraGate(mapRowsHtml, { locked: true, ctaLabel: tr('central.ultraUnlockMapEapm', 'Desbloqueá eAPM promedio por mapa'), compact: true }) : mapRowsHtml}</div>
        </div>
        <div class="cx-detail-pane">
          ${renderMapDiagnosticPanel(activeMapDiag, { activeTab: mapDiagTab, isUltra, modeLabel: modeLabelLoc })}
        </div>
      </div>
    </section>`;

    const disc = mode.discoveries || {};
    const academySection = renderPersonalAcademySection(mode.academy, { isUltra, isExternal });
    const combatTempoSection = renderCombatAndTempoStrip(disc.combatDna, disc.speedVsBrain, disc.killerWindow, isUltra);
    const clocksMasterySection = renderReplayClocksAndMasteryRow(disc, isUltra);
    const intelSection = renderCompetitiveIntelSection(mode.competitiveIntel, { isUltra, modeLabel: modeLabelLoc });
    const hasIntelTab = Boolean(academySection || combatTempoSection || clocksMasterySection || intelSection);
    const requestedView = options.centralView || 'overview';
    const activeView = (requestedView === 'intel' && hasIntelTab)
      ? 'intel'
      : (requestedView === 'mastery' ? 'mastery' : 'overview');

    const civTotalCount = Array.isArray(stats.allCivs) && stats.allCivs.length ? stats.allCivs.length : (stats.topCivs?.length || 0);
    const mapTotalCount = Array.isArray(stats.allMaps) && stats.allMaps.length ? stats.allMaps.length : (stats.topMaps?.length || 0);
    const academyReplays = mode.academy?.totalReplays || mode.academy?.sampleSize || disc.combatDna?.sample || 0;
    const overviewBadge = ladder.rating != null
      ? `${number(ladder.rating)} ELO`
      : (ladder.winRate != null ? `${ladder.winRate}% WR` : mode.label);
    const masteryBadge = (civTotalCount > 0 || mapTotalCount > 0)
      ? tr('cx.masteryBadge', '{civs} civs · {maps} mapas', { civs: number(civTotalCount), maps: number(mapTotalCount) })
      : tr('cx.arsenalBadge', 'Arsenal');
    const intelBadge = academyReplays > 0
      ? `${number(academyReplays)} ${tr('cx.replaysWord', 'replays')}`
      : (mode.competitiveIntel?.gains?.length ? `+${mode.competitiveIntel.gains[0].netElo} ELO` : tr('cx.analysisBadge', 'Análisis'));

    const subNavHtml = `<nav class="cx-subnav${hasIntelTab ? ' is-3col' : ' is-2col'}" role="tablist" aria-label="${esc(tr('cx.viewsAria', 'Vistas de Central'))}">
      <button type="button" class="cx-subtab is-tab-overview${activeView === 'overview' ? ' is-active' : ''}" role="tab" aria-selected="${activeView === 'overview'}" data-central-view="overview">
        <span class="cx-subtab-ico" aria-hidden="true">${icon('crown')}</span>
        <span class="cx-subtab-copy">
          <strong>${esc(tr('cx.tabOverview', 'Resumen'))}</strong>
          <small>${esc(tr('cx.tabOverviewSub', 'ADN, récords y Hora Dorada'))}</small>
        </span>
        <span class="cx-subtab-badge">${esc(overviewBadge)}</span>
      </button>
      <button type="button" class="cx-subtab is-tab-mastery${activeView === 'mastery' ? ' is-active' : ''}" role="tab" aria-selected="${activeView === 'mastery'}" data-central-view="mastery">
        <span class="cx-subtab-ico" aria-hidden="true">${icon('shield')}</span>
        <span class="cx-subtab-copy">
          <strong>${esc(tr('cx.tabMastery', 'Civs y Mapas'))}</strong>
          <small>${esc(tr('cx.tabMasterySub', 'Escudos, terrenos y patrones'))}</small>
        </span>
        <span class="cx-subtab-badge">${esc(masteryBadge)}</span>
      </button>
      ${hasIntelTab ? `<button type="button" class="cx-subtab is-tab-intel${activeView === 'intel' ? ' is-active' : ''}" role="tab" aria-selected="${activeView === 'intel'}" data-central-view="intel">
        <span class="cx-subtab-ico" aria-hidden="true">${icon('trophy')}</span>
        <span class="cx-subtab-copy">
          <strong>${esc(tr('cx.tabIntel', 'Mejora y ELO'))}</strong>
          <small>${esc(tr('cx.tabIntelSub', 'Hábitos, ritmo y motores'))}</small>
        </span>
        <span class="cx-subtab-badge">${esc(intelBadge)}</span>
      </button>` : ''}
    </nav>`;

    const dnaBanner = renderPlayerDnaBanner(disc.dna, modeLabelLoc);
    const tridentStrip = renderTacticalTridentStrip(disc.trident, disc.giantSlayer, ladder);
    const goldenTrophiesRow = renderGoldenHourAndTrophies(disc.goldenHour, disc.trophies, disc.giantSlayer, isUltra);
    const curiousDiscoveriesRow = renderCuriousDiscoveriesRow(disc, isUltra);

    // 4. EVOLUCIÓN + ESTILO (Compacto, limpio, sin cajas deformadas)
    const bvnRows = (modeId === 'global' ? [] : mode.beforeVsNow || []).map((item) => {
      const neutral = item.id === 'eapm';
      const tone = neutral ? 'neutral' : (item.improved ? 'win' : 'loss');
      const sampleLoc = Array.isArray(item.sampleWL2)
        ? tr('cxe.bvnRecVsPrev', item.sampleText || '', { rec1: cxWL(item.sampleWL2[0], item.sampleWL2[1]), rec2: cxWL(item.sampleWL2[2], item.sampleWL2[3]) })
        : (item.sampleI18n ? locRef(item.sampleI18n, item.sampleText || '') : (item.sampleText || ''));
      const deltaLoc = item.deltaI18n ? locRef(item.deltaI18n, item.deltaText) : item.deltaText;
      return `<div class="cx-trend-row">
        <div class="cx-trend-copy">
          <strong>${esc(tr(item.labelKey, item.fallbackLabel))}</strong>
          <small>${esc(sampleLoc)}</small>
        </div>
        <div class="cx-trend-nums">
          <span class="cx-before">${esc(item.beforeText)}</span>
          <i aria-hidden="true">→</i>
          <b class="cx-now">${esc(item.nowText)}</b>
          <span class="cx-delta ${tone}">${neutral ? '' : (item.improved ? '▲' : '▼')} ${esc(deltaLoc)}</span>
        </div>
      </div>`;
    }).join('');

    // P0-6 & P2-6: Unificar vs Mayor/Menor ELO sobre giantSlayer (Companion con promedio de equipo) y localizar openness
    const locOpenness = (k) => {
      const s = String(k || '').trim().toLowerCase();
      if (s === 'open') return tr('cx.opennessOpen', 'abiertos');
      if (s === 'semi-open' || s === 'semi_open') return tr('cx.opennessSemi', 'semiabiertos');
      if (s === 'closed') return tr('cx.opennessClosed', 'cerrados');
      if (s === 'hybrid' || s === 'mixed') return tr('cx.opennessHybrid', 'híbridos');
      if (s === 'water') return tr('cx.opennessWater', 'con agua');
      return k;
    };
    const gsMatchup = disc.giantSlayer || null;
    const extraHighlights = [
      gsMatchup?.vsHigher?.games >= 4 ? `<div class="cx-stat-chip"><span>${esc(tr('cx.vsHigherElo', 'vs Mayor ELO'))}</span><b class="${gsMatchup.vsHigher.winRate >= 50 ? 'win' : 'loss'}">${gsMatchup.vsHigher.winRate}%</b><small>${esc(cxWL(gsMatchup.vsHigher.wins, gsMatchup.vsHigher.losses))}</small></div>` : '',
      gsMatchup?.vsLower?.games >= 4 ? `<div class="cx-stat-chip"><span>${esc(tr('cx.vsLowerElo', 'vs Menor ELO'))}</span><b class="${gsMatchup.vsLower.winRate >= 55 ? 'win' : ''}">${gsMatchup.vsLower.winRate}%</b><small>${esc(cxWL(gsMatchup.vsLower.wins, gsMatchup.vsLower.losses))}</small></div>` : '',
      ins?.eapm?.outpacedGames >= 3 ? `<div class="cx-stat-chip"><span>${esc(tr('cx.whenOutpacingEapm', 'Al superar en eAPM'))}</span><b class="${ins.eapm.outpacedWinRate >= 55 ? 'win' : ''}">${ins.eapm.outpacedWinRate}%</b><small>${ins.eapm.outpacedGames} ${esc(tr('cx.replaysWord', 'replays'))}</small></div>` : '',
      ...(ins?.byOpenness || []).slice(0, 2).map((o) => `<div class="cx-stat-chip"><span>${esc(tr('cx.mapsKind', 'Mapas {kind}', { kind: locOpenness(o.kind) }))}</span><b class="${o.winRate >= 54 ? 'win' : o.winRate < 46 ? 'loss' : ''}">${o.winRate}%</b><small>${esc(cxWL(o.wins, o.losses))}</small></div>`),
    ].filter(Boolean).join('');

    const agro = ins?.agroShare ?? null;
    const boom = ins?.boomShare ?? null;
    const hyb = ins?.hybridShare != null ? ins.hybridShare : ((agro != null && boom != null) ? Math.max(0, 100 - agro - boom) : 0);
    const openingsCompact = (ins?.openings || []).slice(0, 4).map((op) => `<div class="cx-op-row cx-op-illustrated${openingArtClass(op.name)}">
      <strong>${esc(locOpening(op.name, op.name))}</strong>
      <div class="central-bar-track sm"><i class="bar-gold" data-w="${Math.max(8, Math.min(100, op.share))}"></i></div>
      <span>${op.games} ${esc(cxPj())} · <b class="${op.winRate >= 55 ? 'win' : op.winRate < 45 ? 'loss' : ''}">${op.winRate != null ? `${op.winRate}%` : '—'}</b></span>
    </div>`).join('');

    const durBrandMap = { early: 'feudal', castle: 'castle', imp: 'imperial', late: 'imperial' };
    const durationRows = (mode.durationAnalysis?.buckets || []).filter((b) => b.games > 0);
    const durationHtml = durationRows.length ? `<div class="cx-duration-list">${durationRows.map((b) => {
      const resolved = b.wins + b.losses;
      const winRate = resolved > 0 ? Math.round(100 * b.wins / resolved) : null;
      return `<div class="cx-duration-row">
        <span class="cx-dur-label">${ageBrandEmblem(durBrandMap[b.id] || 'feudal', 22)}<strong>${esc(b.label)}</strong></span>
        <span>${esc(cxRecSp(b.wins, b.losses))}</span>
        ${winRate === null ? '<b>—</b>' : `<div class="central-bar-track has-mid" aria-hidden="true"><i class="bar-gold" data-w="${winRate}"></i></div><b>${winRate}%</b>`}</div>`;
    }).join('')}</div>` : '';

    const insightsInner = `${bvnRows ? `<div class="cx-trend-list">${bvnRows}</div>` : ''}
      ${extraHighlights ? `<div class="cx-stat-chips">${extraHighlights}</div>` : ''}
      ${agro != null ? `<div class="cx-style-wrap">
        <div class="intel-style-labels"><span>${esc(tr('cx.earlyPressure', 'Presión temprana'))} <b>${agro}%</b></span><span>${esc(tr('cx.fastCastle', 'Fast Castle'))} <b>${boom}%</b></span></div>
        <div class="intel-style-track"><i class="seg-agro" data-w="${agro}"></i><i class="seg-hyb" data-w="${hyb}"></i><i class="seg-fc" data-w="${boom}"></i></div>
        ${openingsCompact ? `<div class="cx-op-list">${openingsCompact}</div>` : ''}
      </div>` : ''}`;

    const cov = mode.insightsCoverage || null;
    const covSub = cov && cov.totalInsightsReplays > 0
      ? [
          tr('cx.replaysAnalyzed', '{n} replays analizados', { n: number(cov.totalInsightsReplays) }),
          cov.coveragePct != null && cov.officialTotal > 0 ? tr('cx.coverageOfLast', 'cobertura {pct}% de últ. {total} pj', { pct: cov.coveragePct, total: cov.officialTotal }) : null,
          cov.isPartial ? tr('cx.partialReplaySample', 'muestra parcial de replays') : null,
        ].filter(Boolean).join(' · ')
      : '';

    const insightsRow = (bvnRows || extraHighlights || openingsCompact || durationHtml) ? `<div class="cx-grid-2" id="cxSectionInsights">
      <section class="cx-card">
        <header class="cx-card-head">
          <div>
            <h3>${esc(tr('cx.formOpeningsTitle', 'Forma y aperturas'))}</h3>
            ${covSub ? `<p class="cx-card-context">${esc(covSub)}</p>` : ''}
          </div>
          <span class="cx-meta-pill">${esc(modeLabelLoc)}</span>
        </header>
        ${wrapUltraGate(insightsInner, { locked: !isUltra, ctaLabel: isExternal ? tr('cx.unlockScoutingOp', 'Desbloquea scouting de aperturas y ritmo') : tr('cx.unlockMyOp', 'Desbloquea aperturas, estilo y evolución') })}
      </section>

      ${durationHtml ? `<section class="cx-card cx-duration-card">
        <header class="cx-card-head">
          <div>
            <h3>${esc(tr('cx.durationResultsTitle', 'Resultados por duración'))}</h3>
            <p class="cx-card-context">${esc(mode.durationAnalysis.sourceI18n ? locRef(mode.durationAnalysis.sourceI18n, mode.durationAnalysis.sourceLabel || '') : (mode.durationAnalysis.sourceLabel || ''))}</p>
          </div>
        </header>
        ${wrapUltraGate(durationHtml, { locked: !isUltra && isExternal, ctaLabel: tr('cx.unlockDurationScout', 'Desbloquea fases de duración en scouting'), compact: true })}
      </section>` : ''}
    </div>` : '';

    // 5. ALIADOS & RIVALES FRECUENTES (Grid limpio y clickeable para explorar otros perfiles)
    const allies = Array.isArray(stats.allies) ? stats.allies.slice(0, 6) : [];
    const opps = Array.isArray(stats.opponents) ? stats.opponents.slice(0, 6) : [];
    const renderSocialGrid = (list) => `<div class="cx-social-grid">${list.map((p) => {
      const wrTone = p.winRate >= 55 ? 'win' : p.winRate < 45 ? 'loss' : 'neutral';
      return `<button type="button" class="social-player-chip" data-scout-profile="${esc(p.profileId)}" data-scout-name="${esc(p.name)}" title="${esc(tr('cx.exploreProfileTip', 'Explorar perfil de {name}', { name: p.name }))}">
        <span class="social-player-left">
          <span class="social-flag">${esc(p.countryIcon || (p.country ? p.country.toUpperCase() : '·'))}</span>
          <span class="social-name">
            <strong>${esc(p.name)}</strong>
            <small>${number(p.games)} ${esc(cxPj())} · ${esc(cxWL(p.wins, p.losses))}</small>
          </span>
        </span>
        <span class="social-right"><b class="${wrTone}">${p.winRate != null ? `${p.winRate}%` : '—'}</b><em>→</em></span>
      </button>`;
    }).join('')}</div>`;

    const sq = disc.squadAndRivals || null;
    const chemChips = sq ? [
      sq.bestAlly ? `<button type="button" class="cx-chem-chip is-win" data-scout-profile="${esc(sq.bestAlly.profileId)}" data-scout-name="${esc(sq.bestAlly.name)}"><span>${esc(tr('cx.bestDuo', 'MEJOR DUPLA'))}</span><b>${esc(sq.bestAlly.name)}</b><em>${sq.bestAlly.winRate}% · ${number(sq.bestAlly.games)} ${esc(cxPj())}</em></button>` : '',
      sq.roughAlly ? `<button type="button" class="cx-chem-chip is-loss" data-scout-profile="${esc(sq.roughAlly.profileId)}" data-scout-name="${esc(sq.roughAlly.name)}"><span>${esc(tr('cx.roughDuo', 'DUPLA CUESTA ARRIBA'))}</span><b>${esc(sq.roughAlly.name)}</b><em>${sq.roughAlly.winRate}% · ${number(sq.roughAlly.games)} ${esc(cxPj())}</em></button>` : '',
      sq.preyPlayer ? `<button type="button" class="cx-chem-chip is-win" data-scout-profile="${esc(sq.preyPlayer.profileId)}" data-scout-name="${esc(sq.preyPlayer.name)}"><span>${esc(tr('cx.favClient', 'CLIENTE FAVORITO'))}</span><b>${esc(sq.preyPlayer.name)}</b><em>${sq.preyPlayer.winRate}% · ${esc(cxWL(sq.preyPlayer.wins, sq.preyPlayer.losses))}</em></button>` : '',
      sq.nemesisPlayer ? `<button type="button" class="cx-chem-chip is-loss" data-scout-profile="${esc(sq.nemesisPlayer.profileId)}" data-scout-name="${esc(sq.nemesisPlayer.name)}"><span>${esc(tr('cx.cursedRival', 'RIVAL MALDITO'))}</span><b>${esc(sq.nemesisPlayer.name)}</b><em>${sq.nemesisPlayer.winRate}% · ${esc(cxWL(sq.nemesisPlayer.wins, sq.nemesisPlayer.losses))}</em></button>` : '',
    ].filter(Boolean).join('') : '';

    const socialSection = (allies.length || opps.length) ? `<section class="cx-card" id="cxSectionSocial">
      <header class="cx-card-head">
        <div>
          <span class="cx-eyebrow">${esc(tr('cx.squadEyebrow', 'QUÍMICA DE ESCUADRÓN Y RIVALES · {mode}', { mode: modeLabelLoc }))}</span>
          <h3>${esc(allies.length ? tr('cx.alliesAndRivals', 'Aliados y rivales frecuentes') : tr('cx.frequentRivals', 'Rivales frecuentes'))}</h3>
        </div>
        <span class="cx-meta-pill">${esc(tr('cx.tapPlayerProfile', 'Toca un jugador para abrir su perfil'))}</span>
      </header>
      ${chemChips ? `<div class="cx-chem-strip">${chemChips}</div>` : ''}
      ${allies.length ? `<div class="cx-social-group"><span class="central-mini-k">${esc(tr('cx.frequentAlliesKicker', 'ALIADOS FRECUENTES'))}</span>${renderSocialGrid(allies)}</div>` : ''}
      ${opps.length ? `<div class="cx-social-group"><span class="central-mini-k">${esc(tr('cx.frequentRivalsKicker', 'RIVALES FRECUENTES'))}</span>${renderSocialGrid(opps)}</div>` : ''}
    </section>` : '';

    // 2b. ÚLTIMA PARTIDA VS PROMEDIO (Free: 10 | Pro: 10/20 | Ultra: 10/20/50/Total)
    const lm = mode.lastMatchVsAvg || null;
    const lmKey = (lm && lm.windows && lm.windows[lmWindow]) ? lmWindow : (lm?.windows?.[20] && isProOrUltra ? '20' : '10');
    const lmBucket = lm && lm.windows ? (lm.windows[lmKey] || lm.windows[10]) : null;
    const lmSummary = lm?.summary || null;
    const lastMatchBlock = (lm && lmBucket && lmBucket.metrics.length) ? (() => {
      const outcomeCls = lmSummary.won === true ? 'win' : lmSummary.won === false ? 'loss' : 'neutral';
      const outcomeLbl = lmSummary.won === true ? tr('cx.winWord', 'Victoria') : lmSummary.won === false ? tr('cx.lossWord', 'Derrota') : tr('cx.lastMatchWord', 'Última partida');
      const subBits = [
        lmSummary.mapName ? (locMap(lmSummary.mapName) || lmSummary.mapName) : null,
        lmSummary.myCiv ? `${locCiv(lmSummary.myCiv) || lmSummary.myCiv}${lmSummary.rivalCiv ? ` vs ${locCiv(lmSummary.rivalCiv) || lmSummary.rivalCiv}` : ''}` : null,
        lmSummary.ratingDiff != null ? `${lmSummary.ratingDiff >= 0 ? '+' : ''}${lmSummary.ratingDiff} ELO` : null,
      ].filter(Boolean).join(' · ');
      const cards = lmBucket.metrics.map((m) => {
        const tone = m.neutral ? 'neutral' : (m.improved ? 'win' : 'loss');
        const arrow = m.neutral ? '' : (m.improved ? '▲ ' : '▼ ');
        const avgPrefix = m.id === 'windowWr' ? tr('cx.balanceWord', 'Balance') : tr('cx.averageWord', 'Promedio');
        const jumpTarget = m.id === 'eapm' ? '#cxSectionMaps' : (m.id === 'duration' ? '#cxSectionInsights' : '#cxSectionChart');
        const mLabel = m.labelI18n ? locRef(m.labelI18n, m.label) : locCxLmLabel(m);
        const mAvg = Array.isArray(m.avgWL) ? `${number(m.avgWL[0])}${cxW()} - ${number(m.avgWL[1])}${cxL()}` : m.avgText;
        const mSub = m.sampleI18n ? locRef(m.sampleI18n, m.sampleText) : m.sampleText;
        return `<button type="button" class="cx-lm-metric is-jumpable" data-scroll-target="${jumpTarget}">
          <div class="cx-lm-top">
            <span>${esc(mLabel)}</span>
            <b class="cx-delta ${tone}">${arrow}${esc(m.deltaText)}</b>
          </div>
          <div class="cx-lm-vals">
            <strong>${esc(m.latestText)}</strong>
            <small>${esc(avgPrefix)}: <em>${esc(mAvg)}</em></small>
          </div>
          <small class="cx-lm-sub">${esc(mSub)}</small>
        </button>`;
      }).join('');

      const lmMapArt = lmSummary.mapName ? `<span class="cx-lm-map-art">${mapBadge(lmSummary.mapName, 'md')}</span>` : '';
      const lmVsCrests = (lmSummary.myCiv || lmSummary.rivalCiv)
        ? `<span class="cx-lm-crests">${lmSummary.myCiv ? civBadge(lmSummary.myCiv) : ''}${lmSummary.rivalCiv ? `<em>vs</em>${civBadge(lmSummary.rivalCiv)}` : ''}</span>`
        : '';

      // Cero fugas de Battle Feed: cada modo usa exclusivamente su propio `mode.recentMatches`
      const modeMatchesExact = Array.isArray(mode.recentMatches)
        ? mode.recentMatches
        : (modeId === 'global' && Array.isArray(data.recentMatches) ? data.recentMatches : []);
      const modeRecentList = !isExternal && modeMatchesExact.length
        ? (() => {
            const feed = modeMatchesExact.slice(0, 4);
            const feedHeading = isUltra
              ? tr('cx.recentFeedUltra', 'ÚLTIMAS PARTIDAS · TOCA UNA PARA ABRIR SU POSTMATCH')
              : tr('cx.recentFeedFree', 'ÚLTIMAS PARTIDAS RECIENTES');
            return feed.length
              ? `<div class="cx-battle-feed">
                  <div class="cx-bf-head"><span class="central-mini-k">${esc(feedHeading)}</span></div>
                  ${renderRecentMatchesList(feed, { limit: 4, mode: 'feed', jumpToPostmatch: true })}
                </div>`
              : '';
          })()
        : '';

      const lmBtn20 = isProOrUltra
        ? `<button type="button" class="cx-sort-btn${String(lmKey) === '20' ? ' active' : ''}" data-lm-window="20">${esc(tr('cx.lastN', 'Últ. {n}', { n: 20 }))}</button>`
        : `<button type="button" class="cx-sort-btn is-tier-locked" data-goto-plan="1" data-upgrade-tier="pro" title="${esc(tr('cx.availPro', 'Disponible con Pro'))}">${esc(tr('cx.lastNPro', 'Últ. {n} · PRO', { n: 20 }))}</button>`;
      const lmBtn50 = lm.windows[50]
        ? (isUltra
          ? `<button type="button" class="cx-sort-btn${String(lmKey) === '50' ? ' active' : ''}" data-lm-window="50">${esc(tr('cx.lastN', 'Últ. {n}', { n: 50 }))}</button>`
          : `<button type="button" class="cx-sort-btn is-tier-locked" data-goto-plan="1" title="${esc(tr('cx.availUltra', 'Disponible con Ultra'))}">${esc(tr('cx.lastNUltra', 'Últ. {n} · ULTRA', { n: 50 }))}</button>`)
        : '';
      const totalN = lm.windows.all?.windowSize || lmSummary.availableGames || 0;
      const lmBtnAll = lm.windows.all && totalN > 20
        ? (isUltra
          ? `<button type="button" class="cx-sort-btn${String(lmKey) === 'all' ? ' active' : ''}" data-lm-window="all">${esc(tr('cx.totalN', 'Total ({n})', { n: totalN }))}</button>`
          : `<button type="button" class="cx-sort-btn is-tier-locked" data-goto-plan="1" title="${esc(tr('cx.availUltra', 'Disponible con Ultra'))}">${esc(tr('cx.totalNUltra', 'Total ({n}) · ULTRA', { n: totalN }))}</button>`)
        : '';
      const lmContextTxt = String(lmKey) === 'all'
        ? tr('cx.lmCtxAll', 'Comparación contra tu historial ampliado ({n} partidas) · {mode}', { n: lmBucket.windowSize, mode: lmSummary.modeLabel || mode.label })
        : tr('cx.lmCtxWindow', 'Comparación contra tus últimas {n} partidas · {mode}', { n: lmBucket.windowSize, mode: lmSummary.modeLabel || mode.label });

      return `<section class="cx-card cx-lm-card is-${outcomeCls}" id="cxSectionLastMatch">
        <header class="cx-card-head">
          <div class="cx-lm-head-left">
            ${lmMapArt}
            <div>
              <h3>${esc(tr('cx.lastMatchFormTitle', 'Última partida y forma reciente'))}</h3>
              <div class="cx-lm-title-row">
                <span class="cx-lm-outcome ${outcomeCls}">${esc(outcomeLbl)}</span>
                ${lmVsCrests}
                ${subBits ? `<span class="cx-lm-meta">${esc(subBits)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="cx-sort-pills" role="group">
            <button type="button" class="cx-sort-btn${String(lmKey) === '10' ? ' active' : ''}" data-lm-window="10">${esc(tr('cx.lastN', 'Últ. {n}', { n: 10 }))}</button>
            ${lmBtn20}
            ${lmBtn50}
            ${lmBtnAll}
          </div>
        </header>
        <p class="cx-card-context">${esc(lmContextTxt)}</p>
        ${wrapUltraGate(`<div class="cx-lm-grid">${cards}</div>`, { locked: !isUltra && isExternal, ctaLabel: tr('cx.unlockRecentTelemetry', 'Desbloquea telemetría reciente del jugador'), compact: true })}
        ${modeRecentList}
      </section>`;
    })() : '';

    return `<div class="central-dashboard cx-v4 cx-v5${isExternal ? ' is-external-profile' : ''}" data-active-mode="${esc(modeId)}" data-active-view="${esc(activeView)}">
      ${heroCard}
      ${subNavHtml}
      <div class="cx-view-pane${activeView === 'overview' ? ' is-active' : ''}" role="tabpanel" data-central-pane="overview">
        ${dnaBanner}
        ${tridentStrip}
        ${chartBlock}
        ${lastMatchBlock}
        ${goldenTrophiesRow}
        ${curiousDiscoveriesRow}
        ${insightsRow}
        ${socialSection}
      </div>
      <div class="cx-view-pane${activeView === 'mastery' ? ' is-active' : ''}" role="tabpanel" data-central-pane="mastery">
        ${civMasterDetail}
        ${mapsSection}
      </div>
      ${hasIntelTab ? `<div class="cx-view-pane${activeView === 'intel' ? ' is-active' : ''}" role="tabpanel" data-central-pane="intel">
        ${academySection}
        ${combatTempoSection}
        ${clocksMasterySection}
        ${intelSection}
      </div>` : ''}
    </div>`;
  }

  function renderCentralSkeleton({ profileId = null, alias = null, isExternal = false } = {}) {
    const displayName = alias || (profileId ? `#${profileId}` : tr('cx.yourProfile', 'Tu perfil'));
    const cleanWords = String(displayName).replace(/[^A-Za-zÀ-ÿ0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const initials = cleanWords.length >= 2
      ? (cleanWords[0][0] + cleanWords[cleanWords.length - 1][0]).toUpperCase()
      : String(displayName).replace(/[^A-Za-zÀ-ÿ0-9]/g, '').slice(0, 2).toUpperCase() || 'AO';
    return `<div class="central-dashboard cx-v4 cx-skeleton-wrap${isExternal ? ' is-external-profile' : ''}">
      <section class="cx-hero${isExternal ? ' is-external' : ''}">
        <div class="cx-hero-top">
          <div class="cx-hero-id">
            <div class="cx-avatar" aria-hidden="true">${esc(initials)}</div>
            <div class="cx-id-copy">
              <div class="cx-name-row">
                <h2>${esc(displayName)}</h2>
                <span class="cx-sync-pill">${esc(tr('cx.loadingData', 'Cargando datos…'))}</span>
              </div>
              <div class="cx-id-meta">
                ${profileId ? `<span class="mono">#${esc(profileId)}</span><span>·</span>` : ''}
                <span>${esc(tr('cx.fetchingHistory', 'Consultando historial y ladders oficiales'))}</span>
              </div>
            </div>
          </div>
          <div class="cx-kpi-row">
            <div class="cx-kpi is-gold"><span>${esc(tr('cx.eloMode', 'ELO {mode}', { mode: 'RM 1V1' }))}</span><i class="cx-skel cx-skel-lg"></i><i class="cx-skel cx-skel-sm"></i></div>
            <div class="cx-kpi"><span>${esc(tr('cx.winsKpi', 'VICTORIAS'))}</span><i class="cx-skel cx-skel-lg"></i><i class="cx-skel cx-skel-sm"></i></div>
            <div class="cx-kpi"><span>${esc(tr('cx.modeRank', 'RANKING DEL MODO'))}</span><i class="cx-skel cx-skel-lg"></i><i class="cx-skel cx-skel-sm"></i></div>
            <div class="cx-kpi"><span>${esc(tr('cx.avgEapmKpi', 'eAPM MEDIO'))}</span><i class="cx-skel cx-skel-lg"></i><i class="cx-skel cx-skel-sm"></i></div>
          </div>
        </div>
        <div class="cx-mode-bar">
          <span class="cx-skel cx-skel-pill"></span>
          <span class="cx-skel cx-skel-pill"></span>
          <span class="cx-skel cx-skel-pill"></span>
          <span class="cx-skel cx-skel-pill"></span>
        </div>
      </section>
      <section class="cx-card cx-chart-card">
        <header class="cx-chart-head">
          <div class="cx-chart-title">
            <h3>${esc(tr('cx.eloEvolution', 'Evolución de ELO'))}</h3>
            <i class="cx-skel cx-skel-md"></i>
          </div>
        </header>
        <div class="cx-skel cx-skel-chart"></div>
      </section>
    </div>`;
  }

  const api = {
    renderRival,
    renderPostMatch,
    renderAutomaticOpportunities,
    renderSmartBuildOrder,
    renderRecentMatchesList,
    renderCentralDashboard,
    renderCentralSkeleton,
    configure,
    civLabel,
    civRelation,
    mapBadge,
    esc,
    icon,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TacticalUI = api;
})(typeof globalThis === 'object' ? globalThis : this);
