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
  const paths = {
    compass: '<circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4 4-2ZM12 2v2m0 16v2M2 12h2m16 0h2"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8m-4 0h4v4"/>',
    history: '<path d="M4 10a8 8 0 1 1 0 5M3 4v6h6m3-3v5l3 2"/>',
    sword: '<path d="m6 18 9-9 4-5 1 1-4 5-9 9m-3-4 5 5m-5 1 3-3"/>',
    castle: '<path d="M4 21V6h3v3h3V4h4v5h3V6h3v15H4Zm5 0v-5a3 3 0 0 1 6 0v5"/>',
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
  function renderRival({ entry, state, options = {}, detail = true } = {}) {
    const { name, player, report, tip } = entry;
    const map = state && state.match && state.match.mapName;
    const r = report || null;
    const civ = player && player.civ || r && r.civ;
    const content = [];
    if (options.rivalFavorites) content.push(mapBlock(r, map));
    if (options.rivalOpenings) content.push(openingBlock(r));
    if (options.smartTips) content.push(tacticalBlock(tip, detail));
    if (options.civRecommender) content.push(recommendationBlock(tip, detail));
    if (options.rivalH2H) content.push(h2hBlock(r));
    if (options.rivalCivs) content.push(historyBlock(r));
    return `<article class="intel-rival"><header class="intel-identity"><span class="intel-crest">${icon('compass')}</span><div><span class="intel-eyebrow">INFORME DEL RIVAL</span><h3>${esc(name)}</h3><p>${civLabel(civ, 'Civilización sin confirmar')}</p></div><span class="intel-rating">${number(player && player.rating)}<small>ELO 1v1</small></span></header>${content.join('')}<footer class="intel-source">Historial: Companion · Replays: AoE2Insights${r && r.partial ? ' · muestra parcial' : ''}</footer></article>`;
  }
  function clock(seconds) { return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '—'; }
  function renderPostMatch(report, access = {}) {
    if (!report) return '';
    const c = report.context || {}, result = report.result || {}, b = report.mapBenchmark || {};
    const analysis = report.analysis || {};
    const scanning = analysis.status === 'downloading' || analysis.status === 'analyzing';
    const stage = (report.stages || []).map((s) => {
      const value = s.grade || (s.valueSeconds != null ? clock(s.valueSeconds) : s.valueLabel || '—');
      const text = s.status === 'ready' ? `Tu referencia · ${s.sampleSize} partidas`
        : s.status === 'measured' ? (s.detail || 'Medido en el replay')
          : s.status === 'needs_baseline' ? 'Creando tu referencia'
            : s.status === 'not_reached' ? 'Edad no alcanzada'
              : s.status === 'incomplete' ? 'Sin dato en el replay'
                : 'Falta replay';
      const textValue = Boolean(s.valueLabel && !s.grade && s.valueSeconds == null);
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
    const warning = analysis.status === 'error' ? `<p class="review-warning">${esc(analysis.detail || 'No se pudo analizar el replay.')}</p>` : '';
    const replayBody = access.replay !== false
      ? (scan || `<div class="review-stages">${stage}</div><div class="review-metrics">${metric('apm', 'APM')}${metric('eapm', 'eAPM')}${metric('feudalSeconds', 'Llegada a Feudal', true)}${metric('castleSeconds', 'Llegada a Castillos', true)}</div>`)
      : `<p class="intel-muted">${access.replayReason === 'disabled' ? 'Las métricas de replay están desactivadas en tus preferencias.' : 'Las métricas de replay y calificaciones están incluidas en Pro.'}</p>`;
    const source = report.data && report.data.hasTelemetry
      ? report.data.sourceLabel
      : analysis.status === 'locked' ? 'El análisis del replay está incluido en Pro.'
        : scanning ? 'El replay se descarga y analiza automáticamente. Esto puede tardar unos segundos.'
          : 'Resultado confirmado. El replay se descarga y analiza automáticamente al terminar la partida.';
    return `<header class="review-header"><img src="assets/brand/watchtower-v1.png" width="44" height="44" alt=""/><div><span class="intel-eyebrow">INFORME POSTMATCH</span><h2>${esc(result.label || 'Resultado pendiente')}</h2><p>${esc(c.mapName)} · ${civLabel(c.civ)}${c.openingLabel ? ` · ${esc(c.openingLabel)}` : ''}</p></div><strong class="review-result ${result.status === 'won' ? 'win' : result.status === 'lost' ? 'loss' : ''}">${result.ratingDiff == null ? '' : `${result.ratingDiff >= 0 ? '+' : ''}${result.ratingDiff}`}<small>${result.ratingDiff == null ? 'Esperando resultado' : 'ELO del modo'}</small></strong><button class="review-close" type="button" data-postmatch-close aria-label="Cerrar informe" title="Cerrar informe">&#215;</button></header>` +
      (access.comparison !== false ? `<section class="review-map"><div><span>Tu referencia en ${esc(c.mapName)}</span><b>${b.games ? `${number(b.wins)} V — ${number(b.losses)} D` : scanning ? 'Cargando referencia' : 'Primera referencia'}</b><small>${b.games ? `${number(b.games)} partidas anteriores del mismo modo` : scanning ? 'Consultando tus partidas anteriores' : '0 partidas anteriores del mismo modo'}</small></div><div class="review-recent">${(b.recent || []).slice(0, 8).map((r) => `<span class="${r.won === true ? 'win' : r.won === false ? 'loss' : ''}">${r.won === true ? 'V' : r.won === false ? 'D' : '—'}</span>`).join('')}</div></section>` : `<p class="intel-muted">${access.comparisonReason === 'disabled' ? 'La comparación con tu historial está desactivada en tus preferencias.' : 'La evolución en este mapa está incluida en Pro.'}</p>`) +
      replayBody + warning +
      ((report.improvements || []).length ? '<section class="review-insights">' + report.improvements.slice(0, 2).map((i) => `<div>${icon('check')}<p><b>${esc(i.title)}</b><span>${esc(i.detail)}</span></p></div>`).join('') + '</section>' : '') +
      `<p class="review-data">${esc(source)}</p><footer class="intel-source">Las notas comparan tu ejecución con tu historial comparable. Más APM no implica jugar mejor.</footer>`;
  }
  const api = { renderRival, renderPostMatch, configure, civLabel, esc, icon };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TacticalUI = api;
})(typeof globalThis === 'object' ? globalThis : this);
