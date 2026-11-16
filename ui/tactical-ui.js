(function (root) {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value) => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('es-AR') : '—';
  const CIV_ALIASES = { indians: 'hindustanis', khitansmongols: 'khitans' };
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
    const badge = civBadge(value);
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
  const paths = {
    compass: '<circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4 4-2ZM12 2v2m0 16v2M2 12h2m16 0h2"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8m-4 0h4v4"/>',
    history: '<path d="M4 10a8 8 0 1 1 0 5M3 4v6h6m3-3v5l3 2"/>',
    sword: '<path d="m6 18 9-9 4-5 1 1-4 5-9 9m-3-4 5 5m-5 1 3-3"/>',
    castle: '<path d="M4 21V6h3v3h3V4h4v5h3V6h3v15H4Zm5 0v-5a3 3 0 0 1 6 0v5"/>',
    resources: '<path d="m12 3 8 5v8l-8 5-8-5V8l8-5Zm-8 5 8 5 8-5m-8 5v8M8 5.5l8 5"/>',
    medal: '<path d="m8 3 4 6 4-6M5 3h5m4 0h5"/><circle cx="12" cy="15" r="6"/><path d="m12 11 1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4L12 11Z"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm0 0v18M4 9h16"/>',
    bow: '<path d="M5 3c13 1 15 3 16 16M5 3l16 16M4 20 19 5m-5 0h5v5M2 16l4 4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    chart: '<path d="M3 3v18h18M7 17v-4m5 4V9m5 8V5"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
    trend: '<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
    villager: '<circle cx="10" cy="5" r="3"/><path d="M5 21v-6l2-5h6l3 5m-6-5v7m-3 4 3-4 3 4m4-13 4 4m-6 5 6-9"/>',
    food: '<path d="M12 8c-8-5-10 8-4 12 2 1 3-1 4-1s2 2 4 1c6-4 4-17-4-12Zm0 0c0-3 1-5 4-5m-4 4C8 7 7 5 7 3c3 0 5 1 5 4Z"/>',
    wood: '<path d="m12 2-7 9h4l-5 7h6v4h4v-4h6l-5-7h4l-7-9Z"/>',
    sheep: '<path d="M6 8a3 3 0 0 1 5-2 3 3 0 0 1 5 1 3 3 0 0 1 2 5 4 4 0 0 1-5 5H7a4 4 0 0 1-1-9Zm0 8v5m8-4v4m3-13h3v6h-3m2-5h.1"/>',
    boar: '<path d="M4 9c4-4 10-4 14 0l3 1v6h-4l-3 2H7l-3-3V9Zm3 8v4m7-3v3M4 10 2 7m15 2V5l3 3m-2 4h.1m0 4 1 3 2-2"/>',
    berries: '<circle cx="8" cy="14" r="4"/><circle cx="16" cy="14" r="4"/><circle cx="12" cy="19" r="3"/><path d="M12 11V5m0 3C7 8 5 6 5 3c5 0 7 2 7 5Zm0-1c3-4 5-4 8-4-1 4-4 5-8 5"/>',
    gold: '<path d="m3 17 4-8h10l4 8-3 4H6l-3-4Zm4-8 4 5h10M3 17h8l2-3m-2 3v4m0-7v3M13 3v2m5-2-1 2"/>',
    stone: '<path d="m3 17 3-9 9-5 6 7-2 11H7l-4-4Zm3-9 7 5 8-3m-8 3-6 8m6-8 6 8"/>',
    building: '<path d="m3 10 9-7 9 7M5 9v12h14V9m-10 12v-7h6v7"/>',
    age: '<path d="M4 21h16M6 21v-5h4v-5h4V6h4v15M3 11l8-8m-5 0h5v5"/>',
    barracks: '<path d="M4 21V9l8-6 8 6v12M4 10h16m-12 4 8 6m0-6-8 6"/>',
    stable: '<path d="M4 21V9l8-6 8 6v12M7 21v-7l4-4 5 3-1 3-4-1v6"/>',
    scout: '<path d="m5 21 2-8 6-9h5l-1 5 3 3-2 4-6-2-1 7m2-17-3-2m5 6h.1"/>',
    archer: '<path d="M5 3c13 1 15 3 16 16M5 3l16 16M4 20 19 5m-5 0h5v5M2 16l4 4"/>',
    blacksmith: '<path d="M3 9h18l-5 5h-4v4h5v3H6v-3h3v-4L3 9Zm7-6 3 3m-1-4 3 3"/>',
    market: '<path d="M3 9h18l-2-6H5L3 9Zm1 0v12h16V9m-13 4h10m-8 8v-5h6v5"/>',
    gunpowder: '<path d="m4 13 16-5 1 4-16 5-1-4Zm5 3 5 5m3-7 2 7M2 9l2 1M4 5l2 2m4-4v3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.compass}</svg>`; }
  function note(title, message, state = 'empty') { return `<div class="intel-note ${esc(state)}"><span>${icon(state === 'loading' ? 'compass' : 'target')}</span><div><b>${esc(title)}</b><p>${esc(message)}</p></div></div>`; }
  function section(title, content, ico = 'map', extra = '') { return `<section class="intel-block ${extra}"><h4>${icon(ico)}${esc(title)}</h4>${content}</section>`; }
  function dataState(report, label) {
    if (!report || report.loading) return note(label, 'Consultando datos…', 'loading');
    if (report.modePending) return note(label, 'Esperando el modo confirmado de la partida.');
    if (report.modeUnavailable) return note(label, 'Esta fuente no ofrece datos de este modo.');
    return '';
  }
  function mapBlock(report, mapName) {
    const pending = dataState(report, 'Perfil del mapa'); if (pending) return pending;
    const m = report.mapStats;
    if (!m || !m.games) return note(mapName || 'Mapa actual', report.error ? 'No se pudo consultar el historial. Se reintentará.' : 'Sin partidas públicas de este mapa en la muestra.');
    const known = m.resultGames == null ? m.games : m.resultGames;
    const wins = m.wins;
    const value = known < 5 ? `${number(wins)}/${number(known)}` : m.winRate == null ? '—' : `${number(m.winRate)}%`;
    const civ = m.civ;
    return section(`En ${m.name || mapName || 'este mapa'}`, `<div class="intel-map"><div><b class="intel-value">${value}</b><span>victorias del rival</span></div><p>${number(wins)} victorias · ${number(known)} resultados<br><small>${known < 20 ? 'Muestra limitada' : 'Historial del mapa'}${report.partial ? ' · consulta parcial' : ''}</small></p></div>` +
      (civ ? `<div class="intel-pick"><span>Elección más frecuente</span><b>${civLabel(civ.name)}</b><small>${number(civ.games)} de ${number(m.sampleGames == null ? m.games : m.sampleGames)} partidas leídas en este mapa</small></div>` : '<p class="intel-muted">Sin elección de civilización suficiente en este mapa.</p>'), 'map');
  }
  function historyBlock(report) {
    const pending = dataState(report, 'Últimas 5 elecciones'); if (pending) return pending;
    const rows = Array.isArray(report.history) ? report.history.slice(0, 5) : [];
    if (!rows.length) return note('Últimas 5 elecciones', report.error ? 'El historial no está disponible ahora.' : 'Sin partidas recientes de este modo.');
    return section('Últimas 5 elecciones', '<div class="intel-history">' + rows.map((r) => `<div><b class="result-letter ${r.won === true ? 'win' : r.won === false ? 'loss' : ''}">${r.won === true ? 'V' : r.won === false ? 'D' : '—'}</b><strong>${civLabel(r.civ)}</strong><span>${esc(r.mapName || 'Mapa sin dato')}</span></div>`).join('') + '</div>', 'history');
  }
  function openingBlock(report) {
    const pending = dataState(report, 'Apertura con su civ del mapa'); if (pending) return pending;
    const o = report.openings;
    if (report.openingError || (o && o.error)) return note('Aperturas del mapa', 'No se pudieron consultar los replays.');
    if (!o || report.pendingOpenings || o.loading) return note('Aperturas del mapa', 'Buscando replays analizados…', 'loading');
    if (o.modeUnavailable) return note('Aperturas del mapa', 'No hay análisis de replays para este modo.');
    const pick = o.mapCivFavorite;
    const n = Number(o.mapCivAnalyzed) || 0;
    if (!pick || !n) return note('Aperturas del mapa', 'Sin replays de su civilización más usada en este mapa.');
    const civ = report.mapStats && report.mapStats.civ;
    return section('Apertura con su civ del mapa', `<div class="intel-opening"><b>${esc(pick.short || pick.name)}</b><span>${number(pick.count)} de ${number(n)} replays</span></div><p class="intel-muted">${civLabel(civ && civ.name, 'Civilización del mapa')}${n < 5 ? ' · pocos replays; confirmar explorando' : ' · frecuencia histórica'}</p>`, 'sword');
  }
  function h2hBlock(report) {
    const pending = dataState(report, 'Tu cara a cara'); if (pending) return pending;
    const h = report.h2h;
    if (report.h2hPending || !h) return note('Tu cara a cara', 'Consultando tus enfrentamientos…', 'loading');
    if (h.error) return note('Tu cara a cara', 'No se pudo consultar tu historial.');
    if (h.modeUnavailable || h.modePending) return note('Tu cara a cara', h.modePending ? 'Esperando el modo confirmado.' : 'Sin historial compatible con este modo.');
    return section('Tu cara a cara', `<div class="intel-h2h"><b>${number(h.wins)} <small>V</small> <i>—</i> ${number(h.losses)} <small>D</small></b><p>${h.games ? `${number(h.games)} enfrentamientos confirmados` : `Sin enfrentamientos en ${number(h.scanned || 0)} partidas revisadas`}${h.asAllies ? ` · ${number(h.asAllies)} como aliados` : ''}${h.unresolved ? ` · ${number(h.unresolved)} con equipos sin confirmar` : ''}</p></div>`, 'target');
  }
  function evidence(e) { return `${e.label || ''}${e.value != null ? ` ${e.value}` : ''}${e.total != null ? ` · ${number(e.part)}/${number(e.total)}` : ''}`.trim(); }
  function tacticalBlock(tip, detail) {
    if (!tip || tip.loading) return note('Plan de partida', 'Preparando un análisis con replays del rival…', 'loading');
    if (tip.modePending || tip.modeUnavailable) return note('Plan de partida', tip.modePending ? 'Esperando el modo confirmado.' : 'Este modo todavía no tiene replays compatibles.');
    if (tip.error && !tip.sample) return note('Plan de partida', 'La fuente de replays no respondió. El resto del informe sigue disponible.');
    const plan = tip.tacticalPlan;
    if (!plan || !plan.context) return note('Plan de partida', 'Sin replays suficientes para recomendar una respuesta.');
    const c = plan.context;
    const scope = `<div class="intel-scope ${c.scope !== 'map' ? 'fallback' : ''}"><b>${esc(c.scopeLabel)}</b><span>${number(c.sample)} replays · ${esc(c.modeLabel || '')}</span>${c.fallbackReason ? `<p>${esc(c.fallbackReason)}</p>` : ''}${tip.stale ? '<p>Datos guardados · actualizando la fuente</p>' : tip.provisional ? '<p>Muestra inicial · ampliando el análisis</p>' : ''}</div>`;
    const opening = tip.likelyOpenings && tip.likelyOpenings[0];
    const read = opening ? `<div class="intel-reading"><img src="assets/brand/opening-v1.png" width="44" height="44" alt=""/><div><span>Lo que más repite en este alcance</span><b>${esc(opening.short || opening.name)}</b><small>${number(opening.games)} de ${number(opening.sample)} aperturas detectadas · frecuencia histórica</small></div></div>` : '<p class="intel-muted">Sin una apertura dominante con muestra suficiente.</p>';
    const actions = (plan.actions || []).slice(0, detail ? 3 : 2);
    const body = actions.length ? '<ol class="intel-actions">' + actions.map((a, i) => `<li><span class="action-index">0${i + 1}</span><div><b>${esc(a.title)}</b><p>${esc(a.reason)}</p>${a.evidence && a.evidence.length ? `<div class="intel-evidence">${a.evidence.map((e) => `<span>${esc(evidence(e))}</span>`).join('')}</div>` : ''}</div></li>`).join('') + '</ol>' : '<p class="intel-muted">Todavía no hay evidencia suficiente para una acción específica.</p>';
    const caveat = plan.caveat ? `<p class="intel-caveat">${esc(plan.caveat)}</p>` : '';
    return section('Lectura y respuesta', scope + read + body + caveat, 'compass', 'tactical-block');
  }
  function recommendationBlock(tip, detail) {
    if (!tip || tip.loading) return note('Tu elección de civilización', 'Cruzando tu historial del mapa con el rival…', 'loading');
    if (tip.recommendError) return note('Tu elección de civilización', 'No se pudo consultar tu historial.');
    if (tip.modePending || tip.modeUnavailable) return note('Tu elección de civilización', tip.modePending ? 'Esperando el modo confirmado.' : 'Sin historial compatible con este modo.');
    const rows = Array.isArray(tip.recommend) ? tip.recommend.slice(0, detail ? 2 : 1) : [];
    if (!rows.length) return note('Tu elección de civilización', 'Falta una muestra suficiente para sugerir una civilización en este mapa.');
    return section('Una elección para considerar', rows.map((r) => `<div class="intel-recommend"><b>${civLabel(r.civ || r.name)}</b><span>${esc(r.basisLabel || 'Historial comparable')}</span><p>${(r.evidence || []).map(evidence).map(esc).join(' · ') || esc(r.reason || '')}</p>${r.crossScope ? `<small>${esc(r.caveat || 'El historial propio y el del rival tienen alcances distintos.')}</small>` : ''}</div>`).join('') + '<p class="intel-muted">Orientación histórica; no estima la probabilidad de ganar.</p>', 'castle');
  }
  function renderAutomaticOpportunities(plans = [], { detail = false } = {}) {
    const ready = plans.filter((plan) => plan?.status === 'ready');
    if (!ready.length) return note('Rutas de partida', plans.find((plan) => plan?.reason)?.reason || 'Esperando ambas civilizaciones y contexto confirmado.');
    const context = ready[0];
    return `<section class="opportunities automatic"><h4>${icon('target')}Tu ruta frente a ${civLabel(context.rivalCiv)}</h4><p class="opportunity-context">${civLabel(context.ownCiv)} · ${esc(context.mapName)} · ${context.contextSample} resultados del contexto</p>${ready.map((plan) => {
      const best = plan.candidates[0];
      if (!best) return '';
      const age = { feudal: 'Feudal', castle: 'Castillos', imperial: 'Imperial' }[plan.age];
      return `<article class="opportunity-card"><header>${icon(best.icon)}<div><small>Al llegar a ${esc(age)}</small><b>${esc(best.label)}</b></div><strong>${best.score}<small>prioridad / 100</small></strong></header><p>${esc(best.condition)}</p>${detail ? `<p>${best.history.games >= 3 ? `${plan.data.teamResults ? 'Su equipo perdió' : 'Perdió'} ${best.history.losses}/${best.history.games} ante esta apertura en el contexto consultado.` : 'Muestra específica insuficiente: orientación del árbol tecnológico.'}${best.support ? ` Complemento posible: ${esc(best.support.label)}.` : ''}</p>` : ''}</article>`;
    }).join('')}<p class="opportunity-note">Ventanas condicionales automáticas. La edad y el ejército actuales no están medidos. Índice de prioridad experimental, no probabilidad de victoria.</p></section>`;
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
    const civ = player && player.civ || r && r.civ;
    const content = [];
    if (options.rivalFavorites) content.push(mapBlock(r, map));
    if (options.rivalOpenings) content.push(openingBlock(r));
    if (options.smartTips) {
      if (tip && tip.opportunityStages) content.push(renderAutomaticOpportunities(tip.opportunityStages));
      else content.push(tacticalBlock(tip, detail));
    }
    if (options.civRecommender) content.push(recommendationBlock(tip, detail));
    if (options.rivalH2H) content.push(h2hBlock(r));
    if (options.rivalCivs) content.push(historyBlock(r));
    return `<article class="intel-rival"><header class="intel-identity"><span class="intel-crest">${icon('compass')}</span><div><span class="intel-eyebrow">INFORME DEL RIVAL</span><h3>${esc(name)}</h3>${options.rosterDetails === false ? '' : `<p>${civLabel(civ, 'Civilización sin confirmar')}</p>`}</div><span class="intel-rating">${number(player && player.rating)}<small>ELO 1v1</small></span></header>${content.join('')}<footer class="intel-source">${options.rosterDetails === false ? 'Historial entre ambos' : `Historial: Companion · Replays: AoE2Insights${r && r.partial ? ' · muestra parcial' : ''}`}</footer></article>`;
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
      `<section class="review-combat"><h3>${icon('sword')}Combate por edad</h3><p>Durante tus edades · eliminaciones enemigas atribuidas y pérdidas propias</p><table><caption class="sr-only">Bajas de aldeanos y militares según la edad del jugador</caption><thead><tr><th rowspan="2" scope="col">Edad</th><th colspan="2" scope="colgroup">Aldeanos</th><th colspan="2" scope="colgroup">Militares</th></tr><tr><th scope="col">Eliminados</th><th scope="col">Perdidos</th><th scope="col">Eliminados</th><th scope="col">Perdidos</th></tr></thead><tbody>${stages}</tbody></table>${trade}<p class="review-combat-note">Las pérdidas incluyen borrado propio y causas sin autor. Pesqueros, comercio y otras categorías se conservan aparte.${combat.status === 'partial' ? ' ≥ indica un mínimo observado; — indica cobertura incompleta.' : ''}${totals.unattributedDeaths ? ` ${number(totals.unattributedDeaths)} pérdidas sin autor identificado.` : ''}${totals.unclassifiedDeaths ? ` ${number(totals.unclassifiedDeaths)} bajas sin categoría; no se calcula valor ni logros afectados.` : ''}</p></section>`;
  }
  function executionBlock(ratings, comparison) {
    if (!ratings) return '';
    const economic = ratings.economic || {};
    const cards = [economic, ratings.micro, ratings.decisions].filter(Boolean).map((rating) =>
      `<article class="review-skill ${rating.grade ? 'graded' : ''}"><span>${icon(rating.id === 'economic' ? 'resources' : rating.id === 'micro' ? 'sword' : 'compass')}</span><div><small>${esc(rating.label)}</small><b>${esc(rating.grade || '—')}</b><p>${rating.grade ? esc(rating.scopeLabel) : 'Sin evaluación disponible'}</p></div></article>`).join('');
    const highlights = comparison && (ratings.personalHighlights || []).length
      ? `<div class="review-personal-highlights">${ratings.personalHighlights.map((item) => `<p>${icon('trend')}<span><b>${esc(item.title)}</b>${esc(item.detail)}</span></p>`).join('')}</div>` : '';
    return `<section class="review-execution"><h3>${icon('medal')}Tu ejecución</h3><div class="review-skills">${cards}</div><p class="review-execution-note">${esc(economic.detail)}${economic.grade ? ` Mínimo de ${number(economic.minimumStageSampleSize)} referencias por etapa. Escala personal S–D; no es un ranking de usuarios.` : ' Micro y decisiones requieren evidencia propia; el APM no las sustituye.'}</p>${highlights}</section>`;
  }
  function renderPostMatch(report, access = {}) {
    if (!report) return '';
    const c = report.context || {}, result = report.result || {}, b = report.mapBenchmark || {};
    const analysis = report.analysis || {};
    const scanning = analysis.status === 'downloading' || analysis.status === 'analyzing';
    const stage = (report.stages || []).map((s) => {
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
      const missing = m.status === 'unavailable' ? 'No disponible'
        : m.status === 'needs_replay' ? 'Requiere replay' : 'Sin dato';
      return `<div><span>${label}</span><b>${m.value == null ? '—' : time ? clock(m.value) : number(Math.round(m.value * 10) / 10)}</b><small>${m.value == null ? missing : esc(m.unit || '')}</small></div>`;
    };
    const scan = scanning ? `<div class="review-scan" role="status" aria-live="polite"><span class="review-scan-icon"><img src="assets/brand/watchtower-v1.png" width="34" height="34" alt=""/></span><div class="review-scan-copy"><span class="intel-eyebrow">POSTMATCH</span><b>${esc(analysis.label || 'Preparando el análisis')}</b><small>${esc(analysis.detail || '')}</small></div><span class="review-scan-track" aria-hidden="true"><i></i></span></div>` : '';
    const ageMetric = (age, label) => metrics[`${age}Seconds`]?.value != null
      ? metric(`${age}Seconds`, `Llegada a ${label}`, true)
      : metric(`${age}ClickSeconds`, `Orden de avance a ${label}`, true);
    const warning = analysis.status === 'error' ? `<p class="review-warning">${esc(analysis.detail || 'No se pudo analizar el replay.')}</p>` : '';
    const replayBody = access.replay !== false
      ? (scan || `<div class="review-stages">${stage}</div><div class="review-metrics">${metric('apm', 'APM')}${metric('eapm', 'eAPM')}${ageMetric('feudal', 'Feudal')}${ageMetric('castle', 'Castillos')}</div>`)
      : `<p class="intel-muted">${access.replayReason === 'disabled' ? 'Las métricas de replay están desactivadas en tus preferencias.' : 'Las métricas de replay y calificaciones están incluidas en ProMax.'}</p>`;
    const source = report.data && report.data.hasTelemetry
      ? report.data.sourceLabel
      : analysis.status === 'locked' ? 'El análisis del replay está incluido en ProMax.'
        : scanning ? 'El replay se descarga y analiza automáticamente. Esto puede tardar unos segundos.'
          : 'Resultado confirmado. El replay se descarga y analiza automáticamente al terminar la partida.';
    const historyMoments = access.comparison !== false && (report.historyHighlights || []).length
      ? `<section class="review-history-highlights" aria-label="Tu evolución en el mapa">${report.historyHighlights.slice(0, 2).map((item) => `<article>${icon(item.icon || 'map')}<div><b>${esc(item.title)}</b><p>${esc(item.detail)}</p></div></article>`).join('')}</section>` : '';
    const mapBody = ['error', 'unavailable'].includes(b.status)
      ? note('Tu referencia en el mapa', b.summary || 'El historial no está disponible.')
      : `<section class="review-map"><div><span>Tu referencia en ${esc(c.mapName)}</span><b>${b.games ? `${number(b.wins)} V — ${number(b.losses)} D` : scanning ? 'Cargando referencia' : 'Primera referencia'}</b><small>${b.games ? `${number(b.games)} partidas anteriores del mismo modo${b.status === 'partial' ? ' · historial parcial' : ''}` : scanning ? 'Consultando tus partidas anteriores' : '0 partidas anteriores del mismo modo'}</small></div><div class="review-recent">${(b.recent || []).slice(0, 8).map((r) => `<span class="${r.won === true ? 'win' : r.won === false ? 'loss' : ''}">${r.won === true ? 'V' : r.won === false ? 'D' : '—'}</span>`).join('')}</div></section>`;
    return `<header class="review-header"><img src="assets/brand/watchtower-v1.png" width="44" height="44" alt=""/><div><span class="intel-eyebrow">INFORME POSTMATCH</span><h2>${esc(result.label || 'Resultado pendiente')}</h2><p>${esc(c.mapName)} · ${civLabel(c.civ)}${c.openingLabel ? ` · ${esc(c.openingLabel)}` : ''}</p></div><strong class="review-result ${result.status === 'won' ? 'win' : result.status === 'lost' ? 'loss' : ''}">${result.ratingDiff == null ? '' : `${result.ratingDiff >= 0 ? '+' : ''}${result.ratingDiff}`}<small>${result.ratingDiff == null ? 'Esperando resultado' : 'ELO del modo'}</small></strong></header>` +
      historyMoments + (access.comparison !== false ? mapBody : `<p class="intel-muted">${access.comparisonReason === 'disabled' ? 'La comparación con tu historial está desactivada en tus preferencias.' : 'La evolución en este mapa está incluida en ProMax.'}</p>`) +
      replayBody + warning + (access.replay !== false && !scanning ? executionBlock(report.executionRatings, access.comparison !== false) + combatBlock(report.combat) : '') +
      (access.replay !== false && access.comparison !== false && (report.improvements || []).length ? '<section class="review-insights">' + report.improvements.slice(0, 2).map((i) => `<div>${icon('trend')}<p><b>${esc(i.title)}</b><span>${esc(i.detail)}</span></p></div>`).join('') + '</section>' : '') +
      `<p class="review-data">${esc(source)}</p><footer class="intel-source">Las notas comparan tu ejecución con tu historial comparable. Más APM no implica jugar mejor.</footer>`;
  }
  const api = { renderRival, renderPostMatch, renderAutomaticOpportunities, renderSmartBuildOrder, configure, civLabel, civRelation, esc, icon };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TacticalUI = api;
})(typeof globalThis === 'object' ? globalThis : this);
