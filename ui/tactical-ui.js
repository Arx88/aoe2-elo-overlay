(function (root) {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value) => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('es-AR') : '—';
  const CIV_ALIASES = { inca: 'incas', maya: 'mayans', indians: 'hindustanis', khitansmongols: 'khitans' };
  let civSlugs = null;
  let civAliases = CIV_ALIASES;
  /** El main entrega la misma lista de escudos que usa el roster. */
  function configure(options = {}) {
    if (Array.isArray(options.slugs)) civSlugs = new Set(options.slugs);
    if (options.aliases && typeof options.aliases === 'object') civAliases = options.aliases;
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
    return `<img class="civ-badge" src="assets/civs/${slug}.png" alt="" title="${esc(name)}" draggable="false" loading="lazy" />`;
  }
  /** Nombre de civilización con su escudo, sin alterar el flujo del texto. */
  function civLabel(name, fallback = 'Civ sin dato') {
    const value = name || fallback;
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
    compass: 'eye', target: 'eye', map: 'map', history: 'history',
    sword: 'sword', combat: 'combat', matchup: 'matchup',
    castle: 'castle', resources: 'gold', medal: 'medal', shield: 'shield',
    bow: 'archer', clock: 'clock', chart: 'trend', users: 'players', trend: 'trend',
    villager: 'villager', food: 'food', wood: 'wood', sheep: 'sheep', boar: 'boar',
    berries: 'berries', gold: 'gold', stone: 'stone', building: 'building',
    age: 'age', barracks: 'barracks', stable: 'stable', scout: 'scout',
    archer: 'archer', blacksmith: 'blacksmith', market: 'market',
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
    return section(`En ${m.name || mapName || 'este mapa'}`,
      `<p class="intel-statline"><b>${value}</b> · ${number(wins)} victorias ${resultLabel} en ${number(known)} resultados conocidos${report.partial ? ' · parcial' : ''}</p>` +
      (detail ? civCoverage : ''), 'map');
  }
  function historyBlock(report) {
    const title = 'Últimas 5 partidas';
    const pending = dataState(report, title); if (pending) return pending;
    const rows = Array.isArray(report.history) ? report.history.slice(0, 5) : [];
    if (!rows.length) return note(title, report.error ? 'El historial no está disponible ahora.' : 'Sin partidas recientes de este modo.');
    const entries = rows.map((row, index) => {
      const outcome = row.won === true ? 'Victoria' : row.won === false ? 'Derrota' : 'Resultado pendiente';
      return `<li class="intel-history-row${index === 0 ? ' recent' : ''}"><strong>${civLabel(row.civ)}</strong><small>${esc(row.mapName || 'Mapa sin dato')}</small><b class="result-letter ${row.won === true ? 'win' : row.won === false ? 'loss' : ''}" title="${outcome}" aria-label="${outcome}">${row.won === true ? 'V' : row.won === false ? 'D' : '—'}</b></li>`;
    }).join('');
    return `<section class="intel-block history-block"><div class="intel-history-head"><h4>${icon('history')}${title}</h4><p class="intel-history-label">Más reciente arriba · mismo modo</p></div><ol class="intel-history-list">${entries}</ol></section>`;
  }
  function openingBlock(report, currentCiv) {
    const hasCiv = Boolean(civSlug(currentCiv));
    const title = hasCiv ? 'Aperturas de su civilización' : 'Aperturas del historial';
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
    return section(title, `<div class="intel-opening"><b>${esc(pick.short || pick.name)}</b><span>${number(pick.count)} de ${number(n)} replays</span></div><p class="intel-muted">${hasCiv ? civLabel(currentCiv) : 'Todas sus civs en este mapa'}${n < 6 ? ' · muestra chica' : ''}</p>`, 'sword');
  }
  function h2hBlock(report) {
    const pending = dataState(report, 'Tu cara a cara'); if (pending) return pending;
    const h = report.h2h;
    if (report.h2hPending || !h) return note('Tu cara a cara', 'Consultando tus enfrentamientos…', 'loading');
    if (h.error) return note('Tu cara a cara', 'No se pudo consultar tu historial.');
    if (h.modeUnavailable || h.modePending) return note('Tu cara a cara', h.modePending ? 'Esperando el modo confirmado.' : 'Sin historial compatible con este modo.');
    return section('Tu cara a cara', `<div class="intel-h2h"><b>${number(h.wins)} <small>V</small> <i>—</i> ${number(h.losses)} <small>D</small></b><p>${h.games ? `${number(h.games)} enfrentamientos confirmados` : `Sin enfrentamientos en ${number(h.scanned || 0)} partidas revisadas`}${h.asAllies ? ` · ${number(h.asAllies)} como aliados` : ''}${h.unresolved ? ` · ${number(h.unresolved)} con equipos sin confirmar` : ''}</p></div>`, 'combat');
  }
  const OPENING_CHECKS = {
    'Scout rush': 'Al explorar, ¿se confirma un establo temprano?',
    'Archer rush': 'Al explorar, ¿se confirma una galería temprana?',
    'Man at arms rush': 'Al explorar, ¿aparecen milicias tempranas?',
    Drush: 'Al explorar, ¿aparecen milicias antes de Feudal?',
  };
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
    return section(title, read + `<p class="intel-signal-scope">${esc(scope)}</p>` +
      (caveat ? `<p class="intel-muted">${esc(caveat)}</p>` : '') +
      (question ? `<p class="intel-check">${icon('target')}${esc(question)}</p>` : '') + alternatives, 'scout', 'tactical-block');
  }
  function historicalCivBlock(tip, map, report) {
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
    if (!ready.length) return note('Rutas de partida', plans.find((plan) => plan?.reason)?.reason || 'Esperando ambas civilizaciones y contexto confirmado.');
    const context = ready[0];
    return `<section class="opportunities automatic"><h4>${icon('target')}Rutas de referencia frente a ${civLabel(context.rivalCiv)}</h4><p class="opportunity-context">${civLabel(context.ownCiv)} · ${esc(context.mapName)}${detail ? ` · ${number(context.contextSample)} resultados de la muestra` : ''}</p>${(detail ? ready : ready.slice(0, 1)).map((plan) => {
      const best = plan.candidates[0];
      if (!best) return '';
      const age = { feudal: 'Feudal', castle: 'Castillos', imperial: 'Imperial' }[plan.age];
      return `<article class="opportunity-card"><header>${icon(best.icon)}<div><small>Opción de ${esc(age)}</small><b>${esc(best.label)}</b></div></header><p>${esc(best.condition)}</p>${detail ? `<p>${best.history.games >= 3 ? `${plan.data.teamResults ? 'Su equipo perdió' : 'Perdió'} ${best.history.losses}/${best.history.games} ante esta apertura en el contexto consultado.` : 'Orientación del árbol tecnológico con muestra insuficiente.'}</p>` : ''}</article>`;
    }).join('')}<p class="opportunity-note">Referencia de civilizaciones. El ejército y la edad actuales no están medidos.</p></section>`;
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
    const selected = guide ? `<section class="smart-build"><header>${icon(guide.icon)}<div><span>PLAN SUGERIDO · ${civLabel(payload.ownCiv)}</span><h3>${esc(guide.label)}</h3></div><b>Smart Build Order</b></header><p class="build-reference">${esc(payload.referenceLabel)}</p>${buildGuide(guide)}<p class="build-condition">${esc(guide.condition)}</p>${library ? `<p class="build-reference">${(payload.reasons || []).map(esc).join(' ')} ${(guide.caveats || []).map(esc).join(' ')}</p>` : ''}</section>`
      : note('Smart Build Order', payload.reasons?.[0] || 'Esperando una civilización y un contexto compatibles.');
    const references = library ? `<div class="build-library"><h3>Cinco rutas de referencia</h3><p class="mini">Se elige una sugerencia automáticamente. Estas fichas explican las rutas; no miden tu progreso en la partida.</p>${(payload.guides || []).map((item) => `<details><summary>${icon(item.icon)}${esc(item.label)}${item.available ? '' : '<small>Variante sin validar para tu civ</small>'}</summary>${!item.available ? `<p class="build-condition">${esc(item.unavailableReason)}</p>` : ''}${buildGuide(item)}<p class="build-condition">${esc(item.condition)}</p></details>`).join('')}</div>` : '';
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
    const showPicks = !knownCiv && (options.civRecommender || options.rivalFavorites);
    if (showPicks) content.push(historicalCivBlock(tip, map, r));
    if (options.smartTips) content.push(tacticalBlock(tip, detail, matchup, knownCiv, map));
    const hasOpeningSignal = matchup?.openingsSample || (!knownCiv && tip?.context?.scope === 'map' &&
      tip.likelyOpenings?.[0]?.sample > 0);
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
  function renderPostMatch(report, access = {}) {
    if (!report) return '';
    const c = report.context || {}, result = report.result || {}, b = report.mapBenchmark || {};
    const analysis = report.analysis || {};
    const scanning = analysis.status === 'downloading' || analysis.status === 'analyzing';
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
      return `<article class="review-stage ${s.status === 'ready' ? 'graded' : ''}${s.status === 'measured' ? 'measured' : ''}${textValue ? ' text' : ''}"><img src="assets/brand/${s.id}-v1.png" width="50" height="50" alt=""/><div><span>${esc(s.label)}</span><b class="review-grade">${esc(value)}</b><small>${esc(text)}</small></div></article>`;
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
