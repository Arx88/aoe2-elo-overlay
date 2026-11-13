'use strict';

const stage = document.getElementById('stage');
const panel = document.getElementById('panel');
const head = document.getElementById('head');
const balanceEl = document.getElementById('balance');
const rowsEl = document.getElementById('rows');
const footText = document.getElementById('foottext');
const civHelpEl = document.getElementById('civHelp');
const civHelpGrid = document.getElementById('civhelpGrid');
const civHelpClock = document.getElementById('civhelpClock');
const civHelpBar = document.getElementById('civhelpBar');
const rivalInfoEl = document.getElementById('rivalInfo');
const rivalGrid = document.getElementById('rivalGrid');
const scoutInfoEl = document.getElementById('scoutInfo');
const scoutGrid = document.getElementById('scoutGrid');
const updateToastEl = document.getElementById('updateToast');
const updateToastText = document.getElementById('updateToastText');

/* -------------------------------------------------------------------------
 * ICONOS DE LÍNEA
 * Set mínimo en SVG inline: la CSP del panel no permite recursos externos y
 * así los iconos heredan el color del texto, sirven en los 11 temas y no
 * agregan ni un archivo ni una petición.
 * ---------------------------------------------------------------------- */
const ICONS = {
  escudo: '<path d="M12 3 4.8 5.9v5.3c0 4.1 3 7.4 7.2 9.8 4.2-2.4 7.2-5.7 7.2-9.8V5.9L12 3Z"/>',
  espadas: '<path d="M4.5 4.5h3.6l9 9"/><path d="m13.6 17.4 3.8-3.8 1.9 1.9-3.8 3.8-1.9-1.9Z"/><path d="M19.5 4.5h-3.6l-9 9"/><path d="m10.4 17.4-3.8-3.8-1.9 1.9 3.8 3.8 1.9-1.9Z"/>',
  balanza: '<path d="M12 4v14"/><path d="M6.2 6.2h11.6"/><path d="m6.2 6.2-2.3 5.4a2.7 2.7 0 0 0 4.6 0L6.2 6.2Z"/><path d="m17.8 6.2-2.3 5.4a2.7 2.7 0 0 0 4.6 0L17.8 6.2Z"/><path d="M8.4 20h7.2"/>',
  mapa: '<path d="M9 4.5 3.5 6.4v13.1L9 17.6l6 1.9 5.5-1.9V4.5L15 6.4 9 4.5Z"/><path d="M9 4.5v13.1"/><path d="M15 6.4v13.1"/>',
  reloj: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.3V12l3.1 1.9"/>',
  estrella: '<path d="m12 4.2 2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.5-4.6 2.5.9-5.1L4.5 9.7l5.2-.8L12 4.2Z"/>',
  bandera: '<path d="M6.2 20V4.4"/><path d="M6.2 5.2h10.6l-1.8 3.3 1.8 3.3H6.2"/>',
  alerta: '<path d="M12 4.4 20.8 19.6H3.2L12 4.4Z"/><path d="M12 9.8v4.1"/><path d="M12 17.1h.01"/>',
  foco: '<path d="M9.5 17.2h5"/><path d="M10.2 20h3.6"/><path d="M12 3.2a5.8 5.8 0 0 0-3.4 10.5c.6.4 1 1.1 1 1.8v.3h4.8v-.3c0-.7.4-1.4 1-1.8A5.8 5.8 0 0 0 12 3.2Z"/>',
  sube: '<path d="M12 19.2V4.8"/><path d="m6.3 10.5 5.7-5.7 5.7 5.7"/>',
  copa: '<path d="M8.2 4.2h7.6v4.6a3.8 3.8 0 0 1-7.6 0V4.2Z"/><path d="M8.2 5.8H5.4v1.8a2.8 2.8 0 0 0 2.8 2.8"/><path d="M15.8 5.8h2.8v1.8a2.8 2.8 0 0 1-2.8 2.8"/><path d="M12 12.6v4"/><path d="M9.2 20h5.6"/>',
  lista: '<path d="M8.5 6.2h11.2"/><path d="M8.5 12h11.2"/><path d="M8.5 17.8h11.2"/><path d="M4.6 6.2h.01"/><path d="M4.6 12h.01"/><path d="M4.6 17.8h.01"/>',
};

function icon(name) {
  const paths = ICONS[name];
  if (!paths) return '';
  return (
    '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true">${paths}</svg>`
  );
}

/* ============================================================
   Aviso de actualización
   El overlay es click-through y no recibe foco: el chip es SOLO
   informativo. Se auto-oculta y desaparece en cuanto empieza una
   partida, para no tapar el juego ni el ELO.
   ============================================================ */
const UPDATE_TOAST_MS = 12000;
let updateToastTimer = null;

function hideUpdateToast() {
  if (updateToastTimer) {
    clearTimeout(updateToastTimer);
    updateToastTimer = null;
  }
  if (!updateToastEl || updateToastEl.hidden) return;
  updateToastEl.hidden = true;
  scheduleHeight();
}

function showUpdateToast(payload) {
  if (!updateToastEl || !updateToastText) return;
  if (!payload || payload.visible === false) {
    hideUpdateToast();
    return;
  }
  // En partida o con el panel oculto por el reloj, el chip no se muestra.
  if ((lastState && lastState.status === 'ongoing') || civView.eloHidden || moving) {
    hideUpdateToast();
    return;
  }
  const version = payload.version || '';
  updateToastText.textContent = payload.kind === 'ready'
    ? `Actualización v${version} lista · se instala al salir`
    : `Actualización v${version} disponible · abrí Updater en la configuración`;
  updateToastEl.hidden = false;
  scheduleHeight();
  if (updateToastTimer) clearTimeout(updateToastTimer);
  updateToastTimer = setTimeout(hideUpdateToast, UPDATE_TOAST_MS);
}

const TEAM_COLORS = {
  1: '#3d7bff',
  2: '#ff4d4d',
  3: '#35d05a',
  4: '#ffd60a',
  5: '#22d3ee',
  6: '#c084fc',
  7: '#b0b0b0',
  8: '#ff9f45',
};

let lastReported = 0;
let configPath = 'config.json';
let shieldSlugs = new Set();
let lastState = null;
let moving = false;

// Dataset offline que manda el main por `overlay:config` (el renderer no puede
// usar require(): contextIsolation + CSP). Alias para nombres viejos de la API.
let civGuide = {};
let civAliases = {};
let civView = { eloHidden: false, civHelpVisible: false };
let civStartEpoch = 0;
let civHideEpoch = 0;
let civTotalMs = 19000;
let civHideSecs = 20;
let civCountdown = null;
// Modo ejemplo con reloj congelado: la cuenta regresiva no debe avanzar.
let civFrozenElapsed = null;

// Informe opcional del rival: llega por `overlay:rival` en SEGUNDO PLANO.
let rivalPayload = null;
let rivalOptions = {
  rivalCivs: false,
  rivalFavorites: false,
  rivalOpenings: false,
  rivalH2H: false,
};
// Recomendaciones inteligentes: llegan por `overlay:scout`; solo pre-partida.
let scoutPayload = null;
let smartTipsEnabled = false;
// Civ recomendada: comparte el payload de scout pero es su propia opción.
let civRecommenderEnabled = false;
// Balance de equipos (TG): puro pintado sobre el estado, sin datos extra.
let balanceEnabled = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function fmtNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '—';
}

/** Slug del escudo: mismo criterio que src/civs.js, con alias de la API. */
function civSlug(name) {
  const raw = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
  if (!raw) return null;
  const slug = civAliases[raw] || raw;
  return shieldSlugs.has(slug) ? slug : null;
}

/** Solo el escudo: sin texto de civ, como pidió el usuario. */
function civMarkup(civName) {
  const slug = civSlug(civName);
  if (!slug || !shieldSlugs.has(slug)) {
    return civName ? '<span class="shield-unknown" title="?">?</span>' : '';
  }
  return (
    `<img class="shield" src="assets/civs/${slug}.png" alt="" ` +
    `title="${escapeHtml(civName)}" draggable="false" />`
  );
}

/* -------------------------------------------------------------------------
 * "Ayuda de civ": resumen CORTO. El dataset trae bonos largos y a veces
 * cortados a mitad de palabra ("…"); acá se toman como máximo dos y se
 * limpian para que la tarjeta se lea de un vistazo en 19 segundos.
 * ---------------------------------------------------------------------- */
function summarize(value, max = 108, dropLast = true) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const parts = raw
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  // Conectores colgantes ("y…", "en las…") quedan feos: se podan tras el corte.
  const dangling = /\s+(?:y|e|o|u|ni|de|del|la|las|los|el|en|a|al|con|por|para|que|su|un|una|más)$/i;
  const tidy = (text) => {
    let out = text;
    while (dangling.test(out)) out = out.replace(dangling, '');
    return out.replace(/[·,;:\s]+$/, '');
  };
  // Si al podar la última palabra queda una cifra o abreviatura suelta
  // ("10/15/20 PR", "un 15 %"), es mejor conservar la frase completa.
  const numericTail = /(?:\d[\d/.,]*%?|%|[A-ZÁÉÍÓÚÑ]{1,3})$/;

  let result = parts
    .map((part) => {
      const cut = /…/.test(part);
      const full = part.replace(/[…\s.]+$/, '').replace(/\s+/g, ' ').trim();
      let text = full;
      if (cut && dropLast) {
        const short = tidy(full.replace(/\s+\S*$/, ''));
        text = numericTail.test(short) ? tidy(full) : short;
      } else if (cut) {
        // En UNIDADES la lista suele estar completa ("Martillos de guerra y
        // húsares…"): quitar la última palabra tiraría el nombre de la unidad.
        text = tidy(full);
      }
      return text ? `${text}${cut ? '…' : ''}` : '';
    })
    .filter(Boolean)
    .join(' · ');
  if (!result) return '—';
  if (result.length > max) {
    const slice = result.slice(0, max);
    const space = slice.lastIndexOf(' ');
    result = `${tidy(space > max * 0.6 ? slice.slice(0, space) : slice)}…`;
  }
  return result;
}

function civCard(civ) {
  const entry = (civ.slug && civGuide[civ.slug]) || {};
  const name = entry.name || String(civ.raw || 'Civilización');
  const role = entry.role || 'Sin datos de esta civilización';
  const shield = civ.slug
    ? `<img class="civhelp-shield" src="assets/civs/${civ.slug}.png" alt="" draggable="false" />`
    : '<span class="civhelp-no-shield">?</span>';
  const tag = civ.isYou
    ? '<span class="civhelp-tag">VOS</span>'
    : '<span class="civhelp-tag rival">RIVAL</span>';
  const fact = (ico, label, value, kind, dropLast = true) =>
    `<div class="civhelp-fact ${kind}">` +
    `<span class="civhelp-key">${icon(ico)}${label}</span>` +
    `<span class="civhelp-val">${escapeHtml(summarize(value, 108, dropLast))}</span>` +
    '</div>';

  return (
    '<article class="civhelp-civ">' +
    '<div class="civhelp-civ-head">' +
    shield +
    `<div class="civhelp-ident"><div class="civhelp-name">${escapeHtml(name)}${tag}</div>` +
    `<div class="civhelp-role">${escapeHtml(role)}</div></div>` +
    '</div>' +
    fact('estrella', 'BONOS', entry.bonuses, 'good') +
    fact('bandera', 'UNIDADES', entry.units, 'unit', false) +
    fact('alerta', 'DEBILIDADES', entry.weaknesses, 'bad') +
    '</article>'
  );
}

/** Escudos de AMBAS civs (o las únicas de un TG), la tuya primero. */
function renderCivHelp() {
  if (!civHelpEl) return;
  if (!civView.civHelpVisible || !lastState || lastState.status !== 'ongoing' || moving) {
    applyVisibility();
    return;
  }

  const players = Array.isArray(lastState.players) ? lastState.players : [];
  const ordered = [
    ...players.filter((player) => player.isYou),
    ...players.filter((player) => !player.isYou),
  ];
  const civs = [];
  const seen = new Set();
  for (const player of ordered) {
    const slug = civSlug(player.civ);
    const key = slug || String(player.civ || '?');
    if (seen.has(key)) continue;
    seen.add(key);
    civs.push({ slug, raw: player.civ, isYou: Boolean(player.isYou) });
    if (civs.length >= 4) break;
  }

  civHelpEl.classList.toggle('single', civs.length === 1);
  civHelpGrid.innerHTML = civs.some((civ) => civ.slug)
    ? civs.map(civCard).join('')
    : '<div class="civhelp-empty">Esperando las civilizaciones de la partida…</div>';
  applyVisibility();
}

/* -------------------------------------------------------------------------
 * Informe OPCIONAL del rival.
 *
 * Todo lo que se pinta acá viene de datos REALES:
 *  - history / mapStats (civ del mapa)    -> AoE2 Companion
 *  - openings.recent / favorite           -> AoE2Insights (replays analizados)
 *
 * No hay inferencias: si no hay replays analizados se dice explícitamente.
 * El bloque se oculta con el ELO cuando el usuario pidió ocultar a 0:20.
 * ---------------------------------------------------------------------- */
function rivalEnabled() {
  return (
    rivalOptions.rivalCivs ||
    rivalOptions.rivalFavorites ||
    rivalOptions.rivalOpenings ||
    rivalOptions.rivalH2H
  );
}

/* =====================================================================
   BARRA DE ANÁLISIS
   Todo lo que se calcula en segundo plano (ELO, informe del rival,
   aperturas de replays, recomendaciones) se avisa con una sola barrita.
   Es honesta: no inventa un porcentaje, solo dice QUÉ se está analizando
   y desaparece cuando no falta nada. En medio de una partida no queda
   nada animado tapando el juego.
   ===================================================================== */
const analysisEl = document.getElementById('analysis');
const analysisLabel = document.getElementById('analysisLabel');
const ANALYSIS_LABELS = {
  elo: 'Consultando ELO RM 1v1…',
  rival: 'Buscando datos del rival…',
  h2h: 'Buscando enfrentamientos previos…',
  replays: 'Analizando replays…',
  tips: 'Analizando replays del rival…',
};

/** Qué etapa está pendiente (o null si ya está todo). */
function analysisStage() {
  if (!lastState || lastState.status !== 'ongoing' || moving) return null;
  // Con el panel oculto no queda nada animado en pantalla.
  if (civView.eloHidden) return null;
  // 1) El roster ya está en pantalla y faltan los números de ELO.
  if (lastState.pending) return 'elo';
  // 2) Informe del rival: primero civs/favoritos, después las aperturas.
  if (rivalEnabled()) {
    const reports = rivalPayload && Array.isArray(rivalPayload.reports) ? rivalPayload.reports : [];
    if (!reports.length || reports.some((report) => report.loading)) return 'rival';
    if (rivalOptions.rivalH2H && reports.some((report) => report.h2hPending)) return 'h2h';
    if (rivalOptions.rivalOpenings && rivalPayload && rivalPayload.pendingOpenings) return 'replays';
  }
  // 3) Consejo pre-partida: solo existe mientras la fase sea `lobby`.
  if ((smartTipsEnabled || civRecommenderEnabled) && lastState.phase === 'lobby') {
    const tips = scoutPayload && Array.isArray(scoutPayload.tips) ? scoutPayload.tips : [];
    if (!tips.length || tips.some((tip) => tip.loading)) return 'tips';
    if (scoutPayload && scoutPayload.pending) return 'tips';
  }
  return null;
}

/* -------------------------------------------------------------------------
 * VISIBILIDAD · UNA SOLA FUENTE DE VERDAD
 *
 * Antes cada bloque decidía su `hidden` por su cuenta (y con condiciones
 * distintas: uno miraba `eloHidden`, otro no; la barrita vivía dentro del
 * panel), y encima había reglas CSS por id como segundo mecanismo. Eso dejó
 * bloques que se quedaban abiertos, bloques que aparecían tarde y ventanas de
 * altura rara. Ahora TODO se resuelve acá y se re-evalúa en cada entrada:
 * estado, vista (reloj), payloads, configuración y modo mover.
 * ---------------------------------------------------------------------- */

/** Tips del consejo + si pertenecen a la partida que está en pantalla. */
function tipsForCurrentMatch() {
  const tips = scoutPayload && Array.isArray(scoutPayload.tips) ? scoutPayload.tips : [];
  const sameMatch =
    Boolean(lastState && lastState.match && scoutPayload) &&
    String(scoutPayload.matchId ?? '') === String(lastState.match.matchId ?? '');
  return { tips, sameMatch };
}

/** ¿Hay que mostrar el bloque de recomendaciones en este instante? */
function scoutVisible() {
  if (!(smartTipsEnabled || civRecommenderEnabled)) return false;
  if (!lastState || lastState.status !== 'ongoing') return false;
  if (moving || civView.eloHidden) return false;
  if (lastState.phase === 'lobby') return true;
  const { tips, sameMatch } = tipsForCurrentMatch();
  return sameMatch && tips.length > 0;
}

/** Aplica visibilidad de TODOS los bloques y pide una sola medición de alto. */
function applyVisibility() {
  const ongoing = Boolean(lastState && lastState.status === 'ongoing');
  const hidden = Boolean(civView.eloHidden) || moving;

  panel.classList.toggle('elo-hidden', Boolean(civView.eloHidden));
  document.body.classList.toggle('elo-hidden', Boolean(civView.eloHidden));
  document.body.classList.toggle('moving', moving);

  civHelpEl.hidden = !(ongoing && civView.civHelpVisible && !moving);
  rivalInfoEl.hidden = !(ongoing && rivalEnabled() && !hidden);
  scoutInfoEl.hidden = !scoutVisible();
  analysisEl.hidden = analysisStage() == null;

  scheduleHeight();
}

// Una sola medición por frame: con 4 bloques se pedían 4 alturas seguidas y la
// ventana saltaba de tamaño mientras se acomodaba.
let heightScheduled = false;
function scheduleHeight() {
  if (heightScheduled) return;
  heightScheduled = true;
  requestAnimationFrame(() => {
    heightScheduled = false;
    reportHeight();
  });
}

function renderAnalysis() {
  if (!analysisEl) return;
  const stage = analysisStage();
  if (stage && analysisLabel) analysisLabel.textContent = ANALYSIS_LABELS[stage] || 'Analizando…';
  applyVisibility();
}

function rivalShield(civ, className) {
  const slug = civSlug(civ);
  if (slug && shieldSlugs.has(slug)) {
    return (
      `<img class="${className}" src="assets/civs/${slug}.png" alt="" ` +
      `title="${escapeHtml(civ)}" draggable="false" />`
    );
  }
  return `<span class="${className} no-shield" title="${escapeHtml(civ || '?')}">?</span>`;
}

/** "1 partida" / "9 partidas", siempre con la unidad al lado del número. */
function gamesText(count) {
  const n = Number(count) || 0;
  return n === 1 ? '1 partida' : `${fmtNumber(n)} partidas`;
}

/** Récord corto `(3-6)` para que el winrate no quede sin contexto. */
function recordText(games, wins, winRate) {
  const total = Number(games) || 0;
  if (!total) return '';
  const won = Number.isFinite(Number(wins))
    ? Number(wins)
    : Math.round((total * (Number(winRate) || 0)) / 100);
  return ` (${fmtNumber(won)}-${fmtNumber(Math.max(0, total - won))})`;
}

/** Icono de cada bloque del informe: el título solo ya no alcanza. */
const BLOCK_ICONS = { favs: 'mapa', civs: 'lista', openings: 'espadas', tips: 'foco' };

function rivalBlock(label, body, extraClass = '', badge = '') {
  // Sin etiqueta, el bloque es solo su contenido: el título propio de una
  // tarjeta que ya dice el mapa en la cabecera era texto de más.
  const head = label
    ? `<div class="rival-key">${icon(BLOCK_ICONS[extraClass])}${escapeHtml(label)}` +
      `${badge ? `<span class="rival-badge">${escapeHtml(badge)}</span>` : ''}</div>`
    : '';
  return `<div class="rival-block ${extraClass}">${head}${body}</div>`;
}

function rivalHistoryBlock(report) {
  const rows = Array.isArray(report.history) ? report.history : [];
  if (report.loading) {
    return rivalBlock(
      'ASÍ JUGÓ SUS ÚLTIMAS 5',
      `<div class="rival-empty">Buscando sus últimas civs…</div>`,
    );
  }
  if (!rows.length) {
    const msg = report.mode && report.mode.label
      ? `Sin partidas públicas recientes en ${report.mode.label}.`
      : 'Sin historial público reciente.';
    return rivalBlock('ASÍ JUGÓ SUS ÚLTIMAS 5', `<div class="rival-empty">${escapeHtml(msg)}</div>`);
  }
  const items = rows
    .slice(0, 5)
    .map((row) => {
      const result = row.won === true ? 'V' : row.won === false ? 'D' : '·';
      const cls = row.won === true ? 'win' : row.won === false ? 'loss' : '';
      const tip = `${row.civ || '?'} · ${result} · ${row.mapName || '—'}`;
      return (
        `<span class="rival-civ-item ${cls}" title="${escapeHtml(tip)}">` +
        rivalShield(row.civ, 'rival-shield') +
        `<i class="rival-wl">${result}</i>` +
        '</span>'
      );
    })
    .join('');
  return rivalBlock(
    'ASÍ JUGÓ SUS ÚLTIMAS 5',
    `<div class="rival-civ-list">${items}</div>`,
    'civs',
  );
}

/**
 * SOLO el mapa de la partida: cuántas jugó y winrate ahí, más la civ que más
 * usó en ESE mapa. El mapa favorito global no se muestra: si no es el que se
 * está jugando, no sirve para preparar la partida.
 */
function rivalMapBlock(report) {
  const map = report.mapStats;
  if (report.loading) {
    return rivalBlock(
      '',
      `<div class="rival-empty">Buscando su historial en este mapa…</div>`,
      'favs',
    );
  }
  const mapName =
    (map && map.name) ||
    (lastState && lastState.match && lastState.match.mapName) ||
    '—';
  if (!mapName || mapName === '—') {
    return rivalBlock(
      '',
      '<div class="rival-empty">Esperando el mapa de la partida…</div>',
      'favs',
    );
  }
  const games = map && Number(map.games) > 0 ? Number(map.games) : 0;
  if (!games) {
    return rivalBlock(
      '',
      `<div class="rival-empty">Sin partidas públicas en ${escapeHtml(mapName)}.</div>`,
      'favs',
    );
  }

  // Jerarquía de dato: número grande, etiqueta chica, contexto en una línea.
  // Antes era una frase entera ("En Hideout le va mal: 33 % en 9 partidas"):
  // para saber cómo le va había que leerla completa. El color del número y la
  // etiqueta corta lo dicen de un vistazo.
  const rate = map.winRate != null ? Number(map.winRate) : null;
  const tone = rate == null ? '' : rate < 40 ? 'bad' : rate >= 60 ? 'good' : '';
  const toneText = rate == null ? '' : rate < 40 ? 'le va mal' : rate >= 60 ? 'le va bien' : 'parejo';
  const total = Number(games) || 0;
  const won = Number.isFinite(Number(map.wins))
    ? Number(map.wins)
    : Math.round((total * (rate || 0)) / 100);
  const lost = Math.max(0, total - won);

  // Un solo componente para el dato grande (acá, cara a cara y en el consejo):
  // etiqueta arriba, contexto abajo, número a la derecha. Antes el mapa eran
  // DOS tiles con paddings distintos y la civ se repetía en la franja de
  // arriba; con un hero de ancho completo sobra aire y no se repite el dato.
  const hero = statRow({
    iconName: 'mapa',
    label: mapName,
    sub:
      `gana ${escapeHtml(fmtNumber(won))} de sus ${escapeHtml(gamesText(total))}` +
      `${toneText ? ` · <span class="rstat-tag ${tone}">${escapeHtml(toneText)}</span>` : ''}`,
    value: rate != null ? `${fmtNumber(rate)}\u00a0%` : '—',
    tone,
    title: `${won}-${lost} en ${mapName}`,
  });

  return rivalBlock('', hero, 'favs');
}

/**
 * HEAD-TO-HEAD (opción rivalH2H): tu V-D contra este rival, del propio
 * historial, en el mismo modo. Mismo lenguaje visual que el bloque del mapa:
 * número grande + contexto chico, sin frases que haya que leer completas.
 */
function rivalH2HBlock(report) {
  if (report.loading || report.h2hPending) {
    return rivalBlock(
      '',
      '<div class="rival-empty">Buscando enfrentamientos previos…</div>',
      'h2h',
    );
  }
  const h2h = report.h2h;
  if (!h2h) return '';
  const neverFaced = !Number(h2h.games);
  if (neverFaced && !Number(h2h.asAllies)) {
    // Decir DÓNDE se buscó: "nunca" sin ventana es una media verdad (el
    // historial se recorre hasta ~600 partidas del modo).
    const scanned = Number(h2h.scanned) || 0;
    const msg = scanned
      ? `Sin enfrentamientos en tus últimas ${fmtNumber(scanned)} partidas del modo.`
      : 'Sin historial público reciente en este modo.';
    return rivalBlock('', `<div class="rival-empty">${escapeHtml(msg)}</div>`, 'h2h');
  }

  if (neverFaced) {
    // Ya jugaron juntos pero nunca uno contra el otro: también es información.
    return rivalBlock(
      '',
      statRow({
        iconName: 'espadas',
        label: 'Cara a cara',
        sub: `nunca como rivales · ${escapeHtml(gamesText(h2h.asAllies))} de aliados`,
        value: '0-0',
      }),
      'h2h',
    );
  }

  const wins = Number(h2h.wins) || 0;
  const losses = Number(h2h.losses) || 0;
  // Un 1-0 no es "ganás la serie": el color se fiaría solo con muestra.
  const reliable = Number(h2h.games) >= 3;
  const tone = reliable ? (wins > losses ? 'good' : losses > wins ? 'bad' : '') : '';
  const subParts = [gamesText(h2h.games)];
  if (h2h.lastMatch && h2h.lastMatch.mapName && h2h.lastMatch.mapName !== '—') {
    subParts.push(`última en ${h2h.lastMatch.mapName}`);
  }
  // Las veces que jugaron como ALIADOS no son enfrentamientos, pero dan
  // contexto (y explican por qué el V-D no suma todas las partidas compartidas).
  if (Number(h2h.asAllies)) subParts.push(`${fmtNumber(h2h.asAllies)} de aliados`);
  const tile = statRow({
    iconName: 'espadas',
    label: 'Cara a cara',
    sub: escapeHtml(subParts.join(' · ')),
    value: `${fmtNumber(wins)}-${fmtNumber(losses)}`,
    tone,
  });
  // Los últimos 3 enfrentamientos: mi civ, resultado y mapa. El mismo
  // lenguaje visual que las ÚLTIMAS 5 del informe.
  // Con UN solo enfrentamiento el escudo suelto quedaba huérfano debajo del
  // número (y no agrega nada que el subtítulo no diga). Desde 2, sí: se ve la
  // racha de resultados.
  const meetings = Number(h2h.games) >= 2 && Array.isArray(h2h.recent)
    ? h2h.recent.slice(0, 3)
    : [];
  const chips = meetings.length
    ? '<div class="rival-civ-list">' +
      meetings
        .map((row) => {
          const result = row.won === true ? 'V' : row.won === false ? 'D' : '·';
          const cls = row.won === true ? 'win' : row.won === false ? 'loss' : '';
          const tip = `Vos con ${row.civ || '?'} · ${result} · ${row.mapName || '—'}`;
          return (
            `<span class="rival-civ-item ${cls}" title="${escapeHtml(tip)}">` +
            rivalShield(row.civ, 'rival-shield') +
            `<i class="rival-wl">${result}</i>` +
            '</span>'
          );
        })
        .join('') +
      '</div>'
    : '';
  return rivalBlock('', tile + chips, 'h2h');
}

function rivalOpeningsBlock(report, pending) {
  const openings = report.openings;
  const mode = (openings && openings.mode) || report.mode || null;
  const mapName =
    (report.mapStats && report.mapStats.name) ||
    (lastState && lastState.match && lastState.match.mapName) ||
    null;
  // El mapa ya está en la cabecera y en el bloque de arriba: repetirlo acá
  // era texto que no aporta.
  const title = 'APERTURA';
  if (report.loading || (pending && !openings)) {
    return rivalBlock(
      title,
      `<div class="rival-empty">Analizando replays del rival${mapName ? ` en ${mapName}` : ''}${mode ? ` (${mode.label})` : ''}…</div>`,
      'openings',
      'AoE2Insights',
    );
  }
  if (openings && openings.modeUnavailable) {
    return rivalBlock(
      title,
      '<div class="rival-empty">Partida sin ladder rankeado: para no mezclar modos (EW no es RM), no se muestran aperturas.</div>',
      'openings',
      'AoE2Insights',
    );
  }
  // Sin replays no hay bloque: el informe ya lo dice UNA vez en «EN ESTE MAPA».
  // Un bloque vacío con su propio título duplicaba el aviso y parecía un error.
  if (!openings || openings.ok === false) return '';

  // SOLO replays de ESTE mapa. La apertura general del rival (la de todos
  // los mapas) no sirve para preparar la partida actual: un Scout rush en
  // Arabia no dice nada de lo que el rival hace en Arena.
  const civName = report.mapStats && report.mapStats.civ ? report.mapStats.civ.name : null;
  // Solo la apertura de ESA civ en ESE mapa. Si no hay replays de esa
  // combinación, no se cae ni a la apertura del mapa con otra civ ni a la
  // apertura general del rival.
  const best = openings.mapCivFavorite || null;
  const baseCount = Number(openings.mapCivAnalyzed) || 0;
  if (!best || !baseCount) return '';

  const scope = civName
    ? `con ${civName} en ${mapName || 'este mapa'}`
    : `en ${mapName || 'este mapa'}`;
  // Frase, no tablero: "Abre con FC en 3 de 7 replays de Fortress". Un 43 %
  // suelto obliga a deducir sobre cuántos replays, y con muestra de 1 no dice
  // nada. La muestra chica se avisa en vez de disfrazarse de tendencia.
  const sampleNote = baseCount < 5
    ? '<p class="rival-small">Muestra chica: es una pista, no una tendencia.</p>'
    : '';
  const top =
    `<p class="rival-lead" title="${escapeHtml(`Apertura ${scope}`)}">` +
    `Abre con <b>${escapeHtml(best.short || best.name)}</b> ` +
    `<i>en ${escapeHtml(fmtNumber(best.count))} de ${escapeHtml(fmtNumber(baseCount))} ` +
    `replay${baseCount === 1 ? '' : 's'} de ${escapeHtml(mapName || 'este mapa')}</i>.</p>` +
    sampleNote;
  const chips = (Array.isArray(openings.recent) ? openings.recent : [])
    .slice(0, 5)
    .map((item) => {
      const tip = `${item.name || item.short || ''}${item.civ ? ` · ${item.civ}` : ''}${item.map ? ` · ${item.map}` : ''}${item.ladder ? ` · ${item.ladder}` : ''}`;
      return `<span class="rival-chip" title="${escapeHtml(tip)}">${escapeHtml(item.short || item.name)}</span>`;
    })
    .join('');
  const recent = chips ? `<div class="rival-chip-list">${chips}</div>` : '';
  return rivalBlock(
    title,
    top + recent,
    'openings',
    `${fmtNumber(openings.mapCivAnalyzed)} replay${Number(openings.mapCivAnalyzed) === 1 ? '' : 's'}`,
  );
}

/**
 * FRANJA "SI TUVIERAS QUE APOSTAR": las dos cosas que más sirven para
 * preparar la partida, en dos líneas y sin leer el resto de la tarjeta. Todo
 * sale de datos ya cargados (no hay ni una request nueva): la civ más usada
 * EN ESTE MAPA con su cuota real, y su arranque según los replays del mapa.
 * Un porcentaje sin denominador no se muestra: siempre "X de Y".
 */
function rivalPredStrip(report) {
  if (!report || report.loading) return '';
  const map = report.mapStats;
  const mapName = (map && map.name) || null;
  if (!mapName || mapName === '—' || !(Number(map.games) > 0)) return '';
  const total = Number(map.games);
  const items = [];

  const civ = map.civ;
  if (civ && civ.name && Number(civ.games) > 0) {
    const share = Math.round((Number(civ.games) / total) * 100);
    items.push(
      predRow(
        rivalShield(civ.name, 'rival-shield xs'),
        `<b>${escapeHtml(civ.name)}</b> en <b>${escapeHtml(fmtNumber(share))}\u00a0%</b> ` +
          `<i>de sus ${escapeHtml(gamesText(total))} acá</i>`,
      ),
    );
  }

  if (rivalOptions.rivalOpenings) {
    const openings = report.openings;
    const best = openings && openings.mapCivFavorite ? openings.mapCivFavorite : null;
    const base = openings ? Number(openings.mapCivAnalyzed) || 0 : 0;
    const pending = Boolean(report.openingsPending) ||
      Boolean(rivalPayload && rivalPayload.pendingOpenings);
    if (best && base > 0) {
      items.push(
        predRow(
          icon('espadas'),
          `<b>Arranca con ${escapeHtml(best.short || best.name)}</b> ` +
            `<i>en ${escapeHtml(fmtNumber(best.count))} de ${escapeHtml(fmtNumber(base))} ` +
            `replay${base === 1 ? '' : 's'} acá</i>`,
        ),
      );
    } else if (pending) {
      items.push(
        predRow(icon('espadas'), '<i>Analizando sus replays para ver cómo arranca…</i>'),
      );
    } else if (openings) {
      // Hay que distinguir "no hay replays del mapa" de "hay replays del mapa,
      // pero ninguno con SU civ": decir lo primero con lo segundo en la mano
      // era una media verdad (123456 tenía 3 replays de Fortress, de otras civs).
      const mapSaw = Number(openings.mapAnalyzed) || 0;
      const civName = map.civ && map.civ.name ? map.civ.name : null;
      const why = mapSaw > 0 && civName
        ? `Sin replays de ${civName} acá (${fmtNumber(mapSaw)} de otras civs)`
        : `Sin replays de ${mapName} para saber cómo arranca`;
      items.push(predRow(icon('espadas'), `<i>${escapeHtml(why)}</i>`));
    }
  }

  if (!items.length) return '';
  // Misma etiqueta de bloque que el resto (rival-key): antes tenía una clase
  // propia con otro tamaño y otro color, y se notaba el salto.
  return (
    '<div class="rival-pred">' +
    `<span class="rival-key">${icon('foco')}Si tuvieras que apostar</span>` +
    items.join('') +
    '</div>'
  );
}

/** Fila de la franja: icono en una columna fija, texto alineado a la misma x. */
function predRow(ico, text) {
  return (
    '<span class="pred-row">' +
    `<span class="pred-ico">${ico}</span>` +
    `<span class="pred-text">${text}</span>` +
    '</span>'
  );
}

function rivalCard(report) {
  const name = report.name || `Perfil ${report.profileId || '?'}`;
  const blocks = [];
  // La conclusión va primero: qué se juega en este mapa se lee antes que el historial.
  if (rivalOptions.rivalFavorites) blocks.push(rivalMapBlock(report));
  // Cara a cara: el dato "ustedes dos" va pegado al dato "él en este mapa".
  if (rivalOptions.rivalH2H) blocks.push(rivalH2HBlock(report));
  if (rivalOptions.rivalCivs) blocks.push(rivalHistoryBlock(report));
  if (rivalOptions.rivalOpenings) {
    blocks.push(
      rivalOpeningsBlock(
        report,
        Boolean(report.openingsPending) ||
          Boolean(rivalPayload && rivalPayload.pendingOpenings),
      ),
    );
  }
  return (
    '<article class="rival-card">' +
    '<div class="rival-card-head">' +
    `<span class="rival-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>` +
    (report.civ
      ? `<span class="rival-now">${rivalShield(report.civ, 'rival-shield xs')}<span>${escapeHtml(report.civ)}</span>` +
        '<i class="rival-now-tag">eligió ahora</i></span>'
      : '') +
    '</div>' +
    rivalPredStrip(report) +
    blocks.filter(Boolean).join('') +
    '</article>'
  );
}

function renderRivalInfo() {
  if (!rivalInfoEl) return;
  // La visibilidad la decide applyVisibility(): acá solo se pinta el contenido.
  const reports = rivalPayload && Array.isArray(rivalPayload.reports) ? rivalPayload.reports : [];
  rivalInfoEl.classList.toggle('single', reports.length <= 1);
  rivalGrid.innerHTML = reports.length
    ? reports.map(rivalCard).join('')
    : `<div class="rival-empty">Buscando los datos del rival…</div>`;
  applyVisibility();
}

/* -------------------------------------------------------------------------
 * RECOMENDACIONES INTELIGENTES (opción smartTips).
 *
 * REGLA: solo se ven ANTES de que la partida arranque (fase `lobby`, la
 * ventana de ~60s tras "partida encontrada"). Apenas el estado llega sin
 * esa fase (la partida empezó), el bloque se oculta solo: no hay timer ni
 * reloj, el gate es la fase que manda main.
 * Cada línea muestra su muestra ("pierde 80% · 5 pj"): nunca un número solo.
 * ---------------------------------------------------------------------- */

/**
 * Bloque con etiqueta ARRIBA y contenido debajo.
 *
 * Antes cada línea era `etiqueta + frase` en la misma fila: como cada etiqueta
 * mide distinto, cada frase arrancaba en una x diferente (borde izquierdo en
 * zigzag) y el texto quedaba apretado contra el borde y cortado con '…'. Con
 * la etiqueta como encabezado, todo el contenido comparte el mismo margen.
 */
/**
 * Componente ÚNICO de dato principal: etiqueta arriba, contexto abajo y el
 * número grande a la DERECHA, al ras del borde de la tarjeta.
 *
 * Es plano a propósito: nada de cajas con su propio padding dentro de la
 * tarjeta. Antes la mitad de los bloques eran cajas (texto desfasado 11 px) y
 * la otra mitad iba al ras, así que ninguna columna alineaba con la de al lado.
 */
function statRow({ iconName = '', label = '', sub = '', value = '', tone = '', title = '' } = {}) {
  const head = label
    ? `<span class="rival-key">${iconName ? icon(iconName) : ''}${escapeHtml(label)}</span>`
    : '';
  return (
    `<div class="stat-row"${title ? ` title="${escapeHtml(title)}"` : ''}>` +
    `<div class="stat-row-text">${head}` +
    `${sub ? `<span class="stat-row-sub">${sub}</span>` : ''}</div>` +
    `<b class="stat-row-value${tone ? ` ${tone}` : ''}">${escapeHtml(String(value))}</b>` +
    '</div>'
  );
}

function scoutSection(ico, label, body, extraClass = '') {
  return (
    `<div class="scout-sec${extraClass ? ` ${extraClass}` : ''}">` +
    `<span class="scout-key">${icon(ico)}${escapeHtml(label)}</span>` +
    body +
    '</div>'
  );
}

/** Chip de dato del consejo: escudo opcional, nombre, cifra y muestra. */
function scoutChip(civ, label, value, sample, tone = '') {
  return (
    '<span class="scout-chip">' +
    (civ ? rivalShield(civ, 'rival-shield xs') : '') +
    `<span class="scout-chip-name">${escapeHtml(label)}</span>` +
    (value != null ? `<b class="scout-chip-value${tone ? ` ${tone}` : ''}">${fmtNumber(value)} %</b>` : '') +
    (sample != null ? `<i>${escapeHtml(sample)}</i>` : '') +
    '</span>'
  );
}

function scoutTipSections(tip) {
  if (!tip) return '<div class="rival-empty">Sin datos.</div>';
  if (tip.loading) {
    return '<div class="rival-empty">Analizando replays del rival…</div>';
  }
  if (tip.modeUnavailable) {
    return '<div class="rival-empty">Solo en partidas ranked: en custom no se mezclan modos.</div>';
  }
  if (tip.error) return '<div class="rival-empty">Replays no disponibles ahora mismo.</div>';
  if (!tip.sample) {
    return (
      '<div class="rival-empty">Sin replays analizados de este rival' +
      `${tip.mode ? ` en ${escapeHtml(tip.mode.label)}` : ''}.</div>`
    );
  }

  const sections = [];

  // 1) Dato base: su winrate. Número grande, como el resto del informe.
  if (tip.winRate != null) {
    const scope = String(tip.scopeLabel || 'en este mapa').replace(/^en\s+/i, '');
    // La cifra chica ya no repite "partidas · gana": dice el hecho completo.
    const won = Math.round((Number(tip.sample) * Number(tip.winRate)) / 100);
    const heroSub = `gana ${fmtNumber(won)} de sus ${gamesText(tip.sample)}`;
    // Tira horizontal en vez de tile de ancho completo: el número manda pero
    // no se come una fila entera de la tarjeta.
    sections.push(
      statRow({
        iconName: 'mapa',
        label: scope,
        sub: escapeHtml(heroSub),
        value: `${fmtNumber(tip.winRate)}\u00a0%`,
      }),
    );
  }

  // 2) Civs que le cuestan: chips con escudo, cifra y muestra.
  if (tip.weakAgainst && tip.weakAgainst.length) {
    const chips = tip.weakAgainst
      .map((row) => scoutChip(row.civ, row.civ || '?', row.lossRate, `${fmtNumber(row.games)} pj`, 'bad'))
      .join('');
    sections.push(scoutSection('alerta', 'Le cuestan', `<div class="scout-chips">${chips}</div>`));
  }

  // 3) Aperturas contra las que pierde, en frase: "Cuando le arrancan con FC
  // pierde 46 % de 13 partidas". El chip suelto obligaba a armar la oración.
  if (tip.openingsAgainst && tip.openingsAgainst.length) {
    const allMode = tip.openingsAgainst[0].scope === 'modo';
    const lines = tip.openingsAgainst
      .map((row) => {
        const label = row.short || row.name || '?';
        return (
          '<p class="scout-note">Cuando le arrancan con ' +
          `<b>${escapeHtml(label)}</b> pierde ` +
          `<b>${fmtNumber(row.lossRate)}\u00a0%</b> ` +
          `<i>de ${escapeHtml(gamesText(row.games))}</i>.</p>`
        );
      })
      .join('');
    sections.push(
      scoutSection(
        'espadas',
        'Pierde contra',
        lines + (allMode ? '<p class="scout-note">Datos de todo el modo, no solo de este mapa.</p>' : ''),
      ),
    );
  }

  // 4) Ritmo: una frase corta con las dos cifras en negrita.
  if (tip.tempo) {
    const diff = tip.tempo.longWinRate - tip.tempo.shortWinRate;
    if (diff >= 10) {
      sections.push(
        scoutSection(
          'reloj',
          'Ritmo',
          '<p class="scout-note">Le salen mejor las largas: ' +
            `<b>${fmtNumber(tip.tempo.longWinRate)} %</b> si pasa de 25 min · ` +
            `<b>${fmtNumber(tip.tempo.shortWinRate)} %</b> en cortas.</p>`,
        ),
      );
    } else if (diff <= -10) {
      sections.push(
        scoutSection(
          'reloj',
          'Ritmo',
          '<p class="scout-note">Le cuestan las largas: ' +
            `<b>${fmtNumber(tip.tempo.shortWinRate)} %</b> antes de 15 min · ` +
            `<b>${fmtNumber(tip.tempo.longWinRate)} %</b> si se alarga.</p>`,
        ),
      );
    }
  }

  return sections.length
    ? sections.join('')
    : '<div class="rival-empty">Sin punto débil claro en su historial.</div>';
}

function scoutCard(tip) {
  const name = tip.name || `Perfil ${tip.profileId || '?'}`;
  // El consejo (smartTips) y la civ recomendada (civRecommender) comparten
  // payload y tarjeta: cada bloque se muestra solo con su opción encendida.
  const blocks = [];
  if (smartTipsEnabled) {
    blocks.push(`<div class="rival-block tips">${scoutTipSections(tip)}</div>`);
  }
  const recommend = scoutRecommendBlock(tip);
  if (recommend) blocks.push(recommend);
  return (
    '<article class="rival-card">' +
    '<div class="rival-card-head">' +
    `<span class="rival-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>` +
    '</div>' +
    blocks.join('') +
    '</article>'
  );
}

/**
 * CIV RECOMENDADA (opción civRecommender): qué civ jugársele a ESTE rival.
 * Cada línea muestra sus dos evidencias: tu winrate con la civ en el mapa y
 * lo que el rival pierde contra ella. Sin muestra suficiente no hay línea.
 */
function scoutRecommendBlock(tip) {
  if (!civRecommenderEnabled) return '';
  if (!tip || tip.loading) {
    return '<div class="rival-block tips"><div class="rival-empty">Cruzando su debilidad con tu historial…</div></div>';
  }
  if (tip.modeUnavailable) {
    return '<div class="rival-block tips"><div class="rival-empty">Solo en partidas ranked: en custom no se mezclan modos.</div></div>';
  }
  if (tip.recommendError) {
    return '<div class="rival-block tips"><div class="rival-empty">No pude cruzar con tu historial ahora mismo.</div></div>';
  }
  const recs = Array.isArray(tip.recommend) ? tip.recommend : [];
  if (!recs.length) {
    return '<div class="rival-block tips"><div class="rival-empty">Sin muestra suficiente para recomendar una civ.</div></div>';
  }
  // Filas: número + escudo + nombre, y las DOS evidencias abajo alineadas.
  // Antes todo iba en una frase ('1. Gurjaras · vos 67% (9 pj) · le cuesta…')
  // y las tres recomendaciones se leían como un párrafo.
  const rows = recs
    .map((row, index) => {
      // Dos columnas de dato alineadas a la derecha: VOS y LO QUE LE CUESTA.
      // Así los números quedan en columna entre filas y no hay que leer una
      // frase con puntos medios para separar las evidencias.
      let mineStat;
      if (row.mine && row.mine.winRate != null) {
        // La cascada de alcance: si mi winrate viene del modo completo (no del
        // mapa exacto), se declara — nunca se disfraza de dato del mapa.
        // "modo" en vez de "todo el modo": la etiqueta no debe envolver y
        // desalinear la fila. El detalle completo va en el tooltip.
        const scopeTag = row.mine.scope === 'mode' ? ' · modo' : '';
        const scopeTip =
          row.mine.scope === 'mode' ? 'Winrate de todo el modo, no solo de este mapa' : '';
        mineStat =
          `<span class="rec-stat"${scopeTip ? ` title="${scopeTip}"` : ''}>` +
          '<em>vos</em>' +
          `<b>${fmtNumber(row.mine.winRate)} %</b>` +
          `<i>${fmtNumber(row.mine.games)} pj${scopeTag}</i></span>`;
      } else {
        mineStat =
          '<span class="rec-stat"><em>vos</em><b>—</b><i>sin muestra</i></span>';
      }
      const rivalStat =
        row.vsRival && row.vsRival.lossRate != null
          ? '<span class="rec-stat">' +
            '<em>le cuesta</em>' +
            `<b class="bad">${fmtNumber(row.vsRival.lossRate)} %</b>` +
            `<i>${fmtNumber(row.vsRival.games)} pj</i></span>`
          : '';
      return (
        '<li class="rec-item">' +
        `<span class="rec-rank">${index + 1}</span>` +
        rivalShield(row.civ, 'rival-shield xs') +
        `<span class="rec-civ">${escapeHtml(row.civ || '?')}</span>` +
        mineStat +
        rivalStat +
        '</li>'
      );
    })
    .join('');
  return (
    '<div class="rival-block tips">' +
    `<div class="rival-key">${icon('estrella')}Civ recomendada</div>` +
    `<ol class="rec-list">${rows}</ol>` +
    '</div>'
  );
}

function renderScoutInfo() {
  if (!scoutInfoEl) return;
  // La visibilidad la decide applyVisibility(); el `matchId` del payload hace
  // que el consejo sobreviva al arranque de la partida.
  const { tips } = tipsForCurrentMatch();
  scoutInfoEl.classList.toggle('single', tips.length <= 1);
  scoutGrid.innerHTML = tips.length
    ? tips.map(scoutCard).join('')
    : `<div class="rival-empty">Preparando el consejo del rival…</div>`;
  applyVisibility();
}

/* -------------------------------------------------------------------------
 * Cuenta regresiva y barra: el main manda el tiempo REAL de partida que
 * falta hasta 0:20, así que activar la opción a 0:12 o recargar el panel
 * no reinicia el reloj.
 * ---------------------------------------------------------------------- */
function paintCountdown() {
  const now = Date.now();
  const frozen = civFrozenElapsed != null;
  const elapsed = frozen ? civFrozenElapsed : Math.max(0, now - civStartEpoch);
  const remaining = frozen
    ? Math.max(0, civHideSecs * 1000 - elapsed)
    : Math.max(0, civHideEpoch - now);
  const secs = Math.min(99, Math.floor(elapsed / 1000));
  const fmt = (value) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  civHelpClock.textContent = `${fmt(secs)} / ${fmt(civHideSecs)}`;
  const ratio = Math.max(0, Math.min(100, (remaining / civTotalMs) * 100));
  civHelpBar.style.width = `${ratio}%`;
}

function startCountdown() {
  paintCountdown();
  clearInterval(civCountdown);
  // Congelado: basta con pintar una vez, no hace falta un intervalo.
  if (civFrozenElapsed == null) civCountdown = setInterval(paintCountdown, 200);
}

function stopCountdown() {
  clearInterval(civCountdown);
  civCountdown = null;
}

/**
 * `overlay:view` es la ÚNICA fuente de verdad para mostrar/ocultar. Se hace
 * con clases CSS (no win.hide()) para no pisar el atajo manual Ctrl+Alt+E.
 */
function applyView(payload) {
  const next = payload || {};
  civView = {
    eloHidden: Boolean(next.eloHidden),
    civHelpVisible: Boolean(next.civHelpVisible),
  };
  // Alto disponible en este monitor: lo usa fitStage() para no recortar.
  if (Number.isFinite(Number(next.maxHeight))) stageMaxHeight = Number(next.maxHeight);
  // Las clases las aplica applyVisibility() (fuente única).
  if (civView.eloHidden) hideUpdateToast();

  const now = Date.now();
  civFrozenElapsed = Number.isFinite(next.frozenElapsedMs)
    ? Math.max(0, next.frozenElapsedMs)
    : null;
  const showAtMs = Number(next.showAtSecs || 1) * 1000;
  civHideSecs = Math.round(Number(next.hideAtSecs || 20));
  civTotalMs = Math.max(1, civHideSecs * 1000 - showAtMs);
  const elapsed = Number.isFinite(next.elapsedMs) ? Math.max(0, next.elapsedMs) : showAtMs;
  const remaining = Number.isFinite(next.hideInMs) ? Math.max(0, next.hideInMs) : civTotalMs;
  civStartEpoch = now - elapsed;
  civHideEpoch = now + remaining;

  stopCountdown();
  if (civView.civHelpVisible) startCountdown();
  renderCivHelp();
  // El informe del rival y el consejo se ocultan junto con el ELO a 0:20.
  renderRivalInfo();
  renderScoutInfo();
  renderAnalysis();
  applyVisibility();
}

/**
 * El panel NO tiene scroll: si el contenido mide más que el monitor, la
 * última tarjeta quedaba cortada (pasó con las recomendaciones: 1209 px de
 * contenido en 1155 disponibles). Acá se escala lo mínimo necesario para que
 * entre — un 4 % no se nota, una tarjeta cortada sí. `maxHeight` lo manda
 * main desde el área de trabajo del monitor, así no se adivina.
 */
let stageMaxHeight = 0;
let stageScale = 1;

function fitStage() {
  if (!stage) return;
  const natural = stage.scrollHeight;
  let scale = 1;
  if (stageMaxHeight > 0 && natural > stageMaxHeight) {
    scale = Math.max(0.82, stageMaxHeight / natural);
  }
  if (Math.abs(scale - stageScale) > 0.002) {
    stageScale = scale;
    stage.style.transform = scale < 1 ? `scale(${scale.toFixed(4)})` : '';
  }
}

function reportHeight() {
  // Mide TODO el stage: si el ELO está oculto a 0:20, la ventana se achica
  // sola y deja de estorbar; si vuelve la tarjeta de civ, vuelve a crecer.
  fitStage();
  const height = Math.ceil(stage.getBoundingClientRect().height) + 8;
  if (Math.abs(height - lastReported) > 1) {
    lastReported = height;
    window.overlay.reportHeight(height);
  }
}

/** "11/11/26" para aclarar de cuándo es la partida REAL del ejemplo. */
function shortDate(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  try {
    return new Date(timestamp).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * BALANCE DE EQUIPOS (opción tgBalance, solo TG): MEDIANA de ELO RM 1v1 por
 * equipo, no el promedio — un smurf 2000 entre tres 1200 daba "parejo" con el
 * promedio y la mediana lo muestra como es. Es puro pintado sobre el roster
 * (no consulta nada) y vive dentro del panel: se oculta con él a 0:20.
 * Exige dos equipos con ≥2 jugadores CON ELO cada uno; si un equipo está muy
 * disperso (rango ≥200) declara el rango en vez de esconderlo.
 */
function renderBalance(state) {
  if (!balanceEl) return;
  let content = null;
  if (state && state.status === 'ongoing' && balanceEnabled) {
    const players = Array.isArray(state.players) ? state.players : [];
    const teams = new Map();
    for (const player of players) {
      if (!player || !Number.isFinite(Number(player.rating))) continue;
      const team = Number(player.team);
      if (!Number.isFinite(team)) continue;
      const list = teams.get(team) || [];
      list.push(Number(player.rating));
      teams.set(team, list);
    }
    const medianOf = (list) => {
      const sorted = [...list].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    const rangeOf = (list) => [Math.min(...list), Math.max(...list)];
    const you = players.find((player) => player && player.isYou);
    const myTeam = you && you.team != null ? Number(you.team) : null;
    const solidTeams = [...teams.keys()].filter((team) => teams.get(team).length >= 2);
    const isTeamGame =
      players.length > 2 &&
      solidTeams.length === 2 &&
      myTeam != null &&
      solidTeams.includes(myTeam);
    if (isTeamGame) {
      const otherTeam = solidTeams.find((team) => team !== myTeam);
      const mine = Math.round(medianOf(teams.get(myTeam)));
      const theirs = Math.round(medianOf(teams.get(otherTeam)));
      const diff = mine - theirs;
      const verdict =
        diff > 0
          ? `arrancás ${fmtNumber(diff)} arriba`
          : diff < 0
            ? `arrancás ${fmtNumber(-diff)} abajo`
            : 'parejos';
      // Un equipo con ELOs muy separados no es un "equipo 1412": se declara.
      const fmtTeam = (team) => {
        const [min, max] = rangeOf(teams.get(team));
        const value = team === myTeam ? mine : theirs;
        return max - min >= 200
          ? `${fmtNumber(value)} (de ${fmtNumber(min)} a ${fmtNumber(max)})`
          : fmtNumber(value);
      };
      // Si hay jugadores sin ladder 1v1, la mediana está incompleta: se avisa.
      const rated = teams.get(myTeam).length + teams.get(otherTeam).length;
      const parcial = rated < players.length ? ' · parcial' : '';
      content =
        `<span class="bal-ic" title="Mediana de ELO RM 1v1 por equipo">${icon('balanza')}</span>` +
        `<span>Tu equipo <b>${fmtTeam(myTeam)}</b> · Rival <b>${fmtTeam(otherTeam)}</b>` +
        ` · ${verdict}${parcial}</span>`;
    }
  }
  if (content == null) {
    if (!balanceEl.hidden) balanceEl.hidden = true;
    balanceEl.innerHTML = '';
    return;
  }
  balanceEl.innerHTML = content;
  balanceEl.hidden = false;
}

function renderOngoing(state) {
  // `ladder` es el MODO de la partida (RM team, EW 1v1, Unranked…). El ELO,
  // el pico y el rank que se ven abajo son SIEMPRE de RM 1v1, por eso el tag.
  const ladder = state.ladder || { label: state.match.leaderboardName, source: 'ranked' };
  const eloLabel = (state.eloLadder && state.eloLadder.label) || 'RM 1v1';
  const inLobby = state.phase === 'lobby';
  const example = state.example || null;
  // El modo se repite solo si NO es RM 1v1: cuando el tag de la derecha ya
  // dice "ELO RM 1v1", volver a escribirlo en el título es ruido.
  const mode = ladder.label === 'RM 1v1' ? '' : ` · ${ladder.label}`;
  const title = inLobby ? `Partida encontrada${mode}` : `${state.match.mapName}${mode}`;
  // El Modo ejemplo se distingue a simple vista: los DATOS son reales, lo que
  // se simula es el reloj. Hay que decirlo para no confundirlo con una partida.
  const badge = example
    ? '<span class="example-badge" title="Última partida real de este perfil · reloj de prueba">EJEMPLO</span>'
    : '';
  head.innerHTML =
    badge +
    `<span class="head-title">${escapeHtml(title)}</span>` +
    `<span class="elo-tag">ELO ${escapeHtml(eloLabel)}</span>`;

  // El balance se calcula con el roster actual; si todavía no hay jugadores
  // (aviso de "cola apareada") se oculta hasta que llegue.
  renderBalance(state);

  // El pie muestra solo el modo y el pico (o el dato de la partida en ejemplo).
  const fecha = example ? shortDate(example.realStartedAt) : '';
  footText.textContent = example
    ? `partida real #${example.matchId ?? '—'}${fecha ? ` · ${fecha}` : ''} · reloj de prueba`
    : inLobby
      ? `${state.match.mapName !== '—' ? `${state.match.mapName} · ` : ''}empezando…`
      : `${ladder.label} · pico ${eloLabel}`;

  // Aviso de "cola apareada" antes de que llegue el roster del rival (0ms).
  if (!Array.isArray(state.players) || !state.players.length) {
    rowsEl.innerHTML = '<div class="hint">Partida encontrada · cargando rivales…</div>';
    return;
  }

  let previousTeam = null;
  rowsEl.innerHTML = state.players
    .map((player) => {
      const divider = previousTeam !== null && player.team !== previousTeam ? '<div class="sep"></div>' : '';
      previousTeam = player.team;
      const name = escapeHtml(player.name || 'Jugador');
      const badge = player.isYou ? '<em>vos</em>' : '';
      const civ = `<span class="civ">${civMarkup(player.civ)}</span>`;
      // Mientras llega el RM 1v1 se muestra "…", nunca el ELO del modo.
      // "—" significa "este jugador no tiene ladder 1v1".
      const waiting = Boolean(state.pending) && !player.hasStats;
      const elo = player.rating != null ? fmtNumber(player.rating) : waiting ? '…' : '—';
      const rank = player.rank
        ? `<span class="rank">#${player.rank}</span>`
        : `<span class="rank">${waiting ? '…' : ''}</span>`;
      // Pico con flecha en vez de la palabra: se entiende igual y deja de
      // repetirse "pico" en cada fila del panel.
      const peak = player.peak
        ? `${icon('sube')}${fmtNumber(player.peak)}`
        : waiting ? '…' : '—';
      return `${divider}
        <div class="row${player.isYou ? ' you' : ''}">
          <span class="dot"></span>
          <span class="name">${name}${badge}</span>
          ${civ}
          <span class="elo">${elo}</span>
          ${rank}
          <span class="peak" title="Pico de ELO (RM 1v1)">${peak}</span>
        </div>`;
    })
    .join('');

  // El CSP del HTML bloquea atributos style inline: el color del equipo se
  // aplica por CSSOM una vez renderizadas las filas.
  rowsEl.querySelectorAll('.dot').forEach((dot, index) => {
    const player = state.players[index];
    if (!player) return;
    dot.style.background = player.colorHex || TEAM_COLORS[player.color] || '#d9b26a';
  });
}

function renderRows(state) {
  if (state.status === 'ongoing') {
    renderOngoing(state);
    return;
  }

  // Sin partida (o error) no hay balance que mostrar.
  renderBalance(null);
  footText.textContent = '';

  if (state.status === 'idle') {
    head.textContent = 'Sin partida';
    const last = state.lastMatch
      ? `<div class="hint dim">última: ${escapeHtml(state.lastMatch.mapName)} · ${escapeHtml(state.lastMatch.leaderboardName)}</div>`
      : '';
    rowsEl.innerHTML = `<div class="hint">Esperando partida clasificatoria…</div>${last}`;
    return;
  }

  if (state.status === 'no-profile') {
    // Sin cuenta no hay nada que mostrar: que se entienda de un vistazo.
    head.textContent = 'No encontré tu cuenta';
    rowsEl.innerHTML =
      '<div class="alert">' +
      '<div class="alert-line">Abrí la configuración con <b>Ctrl+Alt+S</b><br />y buscá tu nombre en el juego.</div>' +
      `<div class="alert-sub">o poné tu profile ID en<br /><span class="path">${escapeHtml(configPath)}</span></div>` +
      '</div>';
    return;
  }

  head.textContent = 'Sin conexión';
  rowsEl.innerHTML = `<div class="hint">${escapeHtml(state.message || 'error de red')}<br /><span class="dim">reintentando…</span></div>`;
}

function render(state) {
  lastState = state;
  // En media partida no mostramos ningún aviso de actualización.
  if (state && state.status === 'ongoing') hideUpdateToast();
  try {
    renderRows(state);
  } catch (err) {
    // Nunca dejar el panel clavado en "Iniciando…": el error se ve y se loguea.
    window.overlay.reportError(`${err && err.message}`);
    head.textContent = 'Error al dibujar';
    rowsEl.innerHTML = `<div class="hint">${escapeHtml((err && err.message) || 'error')}</div>`;
  }
  panel.classList.toggle('stale', Boolean(state && state.stale));
  panel.classList.toggle('example', Boolean(state && state.example));
  panel.classList.toggle('idle', Boolean(state && state.status === 'idle'));
  panel.classList.toggle(
    'lobby',
    Boolean(state && state.status === 'ongoing' && state.phase === 'lobby'),
  );
  // Las civs pueden llegar en un poll posterior: refrescá la tarjeta también.
  renderCivHelp();
  renderRivalInfo();
  renderScoutInfo();
  renderAnalysis();
  // Un solo pase de visibilidad con TODAS las condiciones juntas.
  applyVisibility();
}

function applyTheme(theme) {
  document.body.dataset.theme = theme || 'clasico';
}

/** Modo mover: el panel entero es la manija de arrastre. */
function setMoving(on) {
  moving = Boolean(on);
  document.body.classList.toggle('moving', moving);

  if (moving) {
    head.textContent = 'Mové el panel';
    rowsEl.innerHTML =
      '<div class="hint">Arrastralo donde quieras que quede.<br />' +
      'Tocá <b>Listo</b> en la configuración o <b>Esc</b>.</div>';
    footText.textContent = '';
  } else if (lastState) {
    render(lastState);
  }
  renderCivHelp();
  renderRivalInfo();
  renderScoutInfo();
  applyVisibility();
}

window.overlay.onConfig((config) => {
  if (config.configPath) configPath = config.configPath;
  if (Array.isArray(config.shields)) shieldSlugs = new Set(config.shields);
  if (config.civAliases) civAliases = config.civAliases;
  if (config.civGuide) civGuide = config.civGuide;
  if (config.theme) applyTheme(config.theme);
  for (const key of Object.keys(rivalOptions)) {
    if (config[key] !== undefined) rivalOptions[key] = Boolean(config[key]);
  }
  if (config.smartTips !== undefined) smartTipsEnabled = Boolean(config.smartTips);
  if (config.civRecommender !== undefined) civRecommenderEnabled = Boolean(config.civRecommender);
  if (config.tgBalance !== undefined) balanceEnabled = Boolean(config.tgBalance);
  if (config.moving !== undefined) setMoving(config.moving);
  document.documentElement.style.setProperty('--scale', String(config.scale || 1));

  // Cambiar de diseño o de dataset cambia la altura de la tarjeta.
  renderCivHelp();
  renderRivalInfo();
  renderScoutInfo();
  renderAnalysis();
  if (lastState) render(lastState);
  applyVisibility();
});

window.overlay.onState(render);
window.overlay.onUpdate(showUpdateToast);
window.overlay.onMovable(setMoving);
if (window.overlay.onView) window.overlay.onView(applyView);
if (window.overlay.onRival) {
  window.overlay.onRival((payload) => {
    rivalPayload = payload;
    renderRivalInfo();
    applyVisibility();
  });
}
if (window.overlay.onScout) {
  window.overlay.onScout((payload) => {
    scoutPayload = payload;
    renderScoutInfo();
    applyVisibility();
  });
}

// Esc o Enter terminan el modo mover sin tocar la configuración.
document.addEventListener('keydown', (event) => {
  if (!moving) return;
  if (event.key === 'Escape' || event.key === 'Enter') window.overlay.moveDone();
});

// Cualquier excepción suelta termina en el log en vez de morir en silencio.
window.addEventListener('error', (event) => window.overlay.reportError(event.message));
window.addEventListener('unhandledrejection', (event) =>
  window.overlay.reportError(String(event.reason)),
);

const resizeObserver = new ResizeObserver(() => reportHeight());
resizeObserver.observe(stage);

// Avisar recién ahora que los listeners están puestos.
window.overlay.ready();
