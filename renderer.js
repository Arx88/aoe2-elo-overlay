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
const rivalFootnoteEl = document.getElementById('rivalFootnote');
const scoutInfoEl = document.getElementById('scoutInfo');
const scoutGrid = document.getElementById('scoutGrid');
// Scouting unificado (v0.1.24): UNA sección compacta por defecto; las dos
// secciones de arriba pasan a ser el detalle que se abre con F2.
const scoutingEl = document.getElementById('scouting');
const scoutCardsEl = document.getElementById('scoutCards');
const scoutContextEl = document.getElementById('scoutContext');
const scoutFootnoteEl = document.getElementById('scoutFootnote');
const postMatchEl = document.getElementById('postMatch');
let postMatchPayload = null;
let postMatchEnabled = false;
let postMatchAccess = { comparison: true, replay: true };
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
// Compacto (false) = una sola tarjeta de scouting por rival. Detalle (true) =
// las dos secciones completas de siempre. Lo alterna F2 desde el main; no se
// persiste en config: es un gesto del momento, no una preferencia.
let detailMode = false;
// "Resumen con F2" (opción de Ajustes, APAGADA de fábrica): el resumen y su
// atajo son opt-in. Sin la opción, el informe se muestra COMPLETO siempre y
// ni el main registra la tecla.
let scoutF2Enabled = false;
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

/** ¿Hay ALGUNA fuente de scouting encendida? (informe, consejo o civ). */
function compactAvailable() {
  return rivalEnabled() || smartTipsEnabled || civRecommenderEnabled;
}

/**
 * F2: compacto <-> detalle. Solo existe con la opción "Resumen con F2"
 * encendida (sin ella el main ni registra la tecla). No se persiste en
 * config: es un gesto del momento (querés mirar el H2H un segundo y volver),
 * no una preferencia.
 */
function setDetail(on) {
  if (!scoutF2Enabled) return;
  const next = Boolean(on);
  if (next === detailMode) return;
  detailMode = next;
  renderScouting();
  applyVisibility();
}

/** Aplica visibilidad de TODOS los bloques y pide una sola medición de alto. */
function applyVisibility() {
  const ongoing = Boolean(lastState && lastState.status === 'ongoing');
  const hidden = Boolean(civView.eloHidden) || moving;

  panel.classList.toggle('elo-hidden', Boolean(civView.eloHidden));
  document.body.classList.toggle('elo-hidden', Boolean(civView.eloHidden));
  document.body.classList.toggle('moving', moving);

  civHelpEl.hidden = !(ongoing && civView.civHelpVisible && !moving);
  // UNA SOLA FUENTE DE VERDAD y una sola sección visible a la vez:
  //   opción apagada (fábrica) -> SIEMPRE el informe completo (#rivalInfo +
  //   #scoutInfo), sin atajo y sin chips de F2
  //   opción encendida          -> resumen (#scouting) y F2 alterna
  // Nunca las tres juntas: era exactamente la duplicación a eliminar.
  const detail = !scoutF2Enabled || detailMode;
  document.body.classList.toggle('scout-f2', scoutF2Enabled);
  document.body.classList.toggle('scout-detail', detail);
  scoutingEl.hidden = !(ongoing && compactAvailable() && !hidden);
  rivalInfoEl.hidden = true;
  scoutInfoEl.hidden = true;
  const reviewing = Boolean(postMatchEnabled && postMatchPayload && !ongoing && !moving);
  if (postMatchEl) postMatchEl.hidden = !reviewing;
  panel.classList.toggle('reviewing', reviewing);
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
  if (report.modePending) return rivalBlock('ÚLTIMAS CIVS', '<div class="rival-empty">Esperando el modo de la partida…</div>');
  if (report.modeUnavailable) return rivalBlock('ÚLTIMAS CIVS', '<div class="rival-empty">Historial del modo no disponible en esta partida.</div>');
  if (report.loading) {
    return rivalBlock(
      'ASÍ JUGÓ SUS ÚLTIMAS 5',
      `<div class="rival-empty">Buscando sus últimas civs…</div>`,
    );
  }
  if (!rows.length) {
    const msg = report.error && report.error.includes('historial:')
      ? 'No se pudo consultar el historial del rival.'
      : report.mode && report.mode.label
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
        `<span class="rival-civ-item history-item ${cls}" title="${escapeHtml(tip)}">` +
        rivalShield(row.civ, 'rival-shield') +
        `<span class="history-copy"><b>${escapeHtml(row.civ || 'Civ desconocida')}</b>` +
        `<small>${escapeHtml(row.mapName || 'Mapa desconocido')}</small></span>` +
        `<i class="rival-wl">${result}</i>` +
        '</span>'
      );
    })
    .join('');
  return rivalBlock(
    'ASÍ JUGÓ SUS ÚLTIMAS 5',
    `<div class="rival-civ-list history-list">${items}</div>`,
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
  if (report.modePending) return rivalBlock('', '<div class="rival-empty">Esperando el modo para consultar el mapa…</div>', 'favs');
  if (report.modeUnavailable) return rivalBlock('', '<div class="rival-empty">Estadísticas del mapa no disponibles para este modo.</div>', 'favs');
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
    if (report.error && report.error.includes('stats:')) {
      return rivalBlock('', '<div class="rival-empty">No se pudieron consultar las estadísticas del mapa.</div>', 'favs');
    }
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
  const total = Number(games) || 0;
  const resultGames = map.resultGames != null ? Number(map.resultGames) : total;
  const reliable = resultGames >= 20;
  const tone = rate == null || !reliable ? '' : rate < 40 ? 'bad' : rate >= 60 ? 'good' : '';
  const toneText = rate == null ? '' : !reliable ? 'muestra limitada' : rate < 40 ? 'le va mal' : rate >= 60 ? 'le va bien' : 'parejo';
  const won = Number.isFinite(Number(map.wins))
    ? Number(map.wins)
    : Math.round((total * (rate || 0)) / 100);
  const lost = Math.max(0, resultGames - won);

  // Un solo componente para el dato grande (acá, cara a cara y en el consejo):
  // etiqueta arriba, contexto abajo, número a la derecha. Antes el mapa eran
  // DOS tiles con paddings distintos y la civ se repetía en la franja de
  // arriba; con un hero de ancho completo sobra aire y no se repite el dato.
  const hero = statRow({
    iconName: 'mapa',
    label: mapName,
    sub: rate == null
      ? `${escapeHtml(gamesText(total))} · sin resultados suficientes`
      : `gana ${escapeHtml(fmtNumber(won))} de sus ${escapeHtml(gamesText(resultGames))}` +
        (resultGames < total ? ` con resultado conocido · ${escapeHtml(gamesText(total))} analizadas` : '') +
        `${toneText ? ` · <span class="rstat-tag ${tone}">${escapeHtml(toneText)}</span>` : ''}`,
    value: rate == null ? '—' : resultGames < 5 ? `${fmtNumber(won)}/${fmtNumber(resultGames)}` : `${fmtNumber(rate)}\u00a0%`,
    tone,
    title: rate == null ? '' : `${won}-${lost} en ${mapName}`,
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
  if (!h2h) return rivalBlock('', '<div class="rival-empty">Cara a cara todavía no disponible.</div>', 'h2h');
  if (h2h.modePending) return rivalBlock('', '<div class="rival-empty">Esperando el modo para consultar el cara a cara…</div>', 'h2h');
  if (h2h.modeUnavailable) return rivalBlock('', '<div class="rival-empty">Cara a cara no disponible para este modo.</div>', 'h2h');
  if (h2h.error) return rivalBlock('', '<div class="rival-empty">No se pudo consultar tu historial para el cara a cara.</div>', 'h2h');
  const neverFaced = !Number(h2h.games);
  if (neverFaced && !Number(h2h.asAllies)) {
    // Decir DÓNDE se buscó: "nunca" sin ventana es una media verdad (el
    // historial se recorre hasta ~600 partidas del modo).
    const scanned = Number(h2h.scanned) || 0;
    const msg = scanned
      ? `Sin enfrentamientos confirmados en tus últimas ${fmtNumber(scanned)} partidas del modo.`
      : 'Sin historial público reciente en este modo.';
    const caveat = Number(h2h.unresolved) > 0
      ? ` ${fmtNumber(h2h.unresolved)} partidas compartidas sin equipos confirmados.` : '';
    return rivalBlock('', `<div class="rival-empty">${escapeHtml(msg + caveat)}</div>`, 'h2h');
  }

  if (neverFaced) {
    // Ya jugaron juntos pero nunca uno contra el otro: también es información.
    return rivalBlock(
      '',
      statRow({
        iconName: 'espadas',
        label: 'Cara a cara',
        sub: `sin rivales confirmados · ${escapeHtml(gamesText(h2h.asAllies))} de aliados` +
          (h2h.unresolved ? ` · ${fmtNumber(h2h.unresolved)} sin equipos` : ''),
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
  if (Number(h2h.unresolved)) subParts.push(`${fmtNumber(h2h.unresolved)} sin equipos`);
  if (Number(h2h.unknownResult)) subParts.push(`${fmtNumber(h2h.unknownResult)} sin resultado`);
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
  // número (y no agrega nada que el subtítulo no diga). Desde 2 se ven los
  // últimos enfrentamientos, cada uno con su civ y su resultado.
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
  // UNA línea: apertura en grande + su muestra real. Los chips de últimas
  // aperturas repetían el mismo dato y el badge "1 replay" duplicaba el
  // denominador. El aviso de muestra chica va una sola vez al pie de la
  // sección (renderRivalInfo), no por cada tarjeta.
  const top =
    `<div class="opening-line" title="${escapeHtml(`Apertura ${scope}`)}">` +
    `<b>${escapeHtml(best.short || best.name)}</b>` +
    `<i>en ${escapeHtml(fmtNumber(best.count))} de ${escapeHtml(fmtNumber(baseCount))} ` +
    `replay${baseCount === 1 ? '' : 's'} de ${escapeHtml(mapName || 'este mapa')}</i>` +
    '</div>';
  return rivalBlock(title, top, 'openings');
}

/**
 * FRANJA "SI TUVIERAS QUE APOSTAR": las dos cosas que más sirven para
 * preparar la partida, en dos líneas y sin leer el resto de la tarjeta. Todo
 * sale de datos ya cargados (no hay ni una request nueva): la civ más usada
 * EN ESTE MAPA con su cuota real, y su arranque según los replays del mapa.
 * Un porcentaje sin denominador no se muestra: siempre "X de Y".
 */
function rivalPredStrip(report) {
  if (!report) return '';
  if (report.loading) {
    return rivalOptions.rivalOpenings
      ? rivalBlock('APERTURAS', '<div class="rival-empty">Buscando sus aperturas…</div>', 'openings')
      : '';
  }
  const map = report.mapStats;
  const mapName = (map && map.name) || (lastState && lastState.match && lastState.match.mapName) || 'este mapa';
  const items = [];

  const pick = rivalOptions.rivalFavorites ? scoutPickHero(report) : null;
  if (pick && !pick.none) {
    // HERO de la tarjeta. La señal más predictiva en pre-partida no es el
    // winrate (con 10-30 partidas tiene ±18 pp de error) sino QUÉ civ juega
    // acá y cada cuánto: escudo grande + número grande + una línea de contexto.
    items.push(
      '<div class="pick-hero">' +
        rivalShield(pick.name, 'rival-shield pick-shield') +
        '<div class="pick-copy">' +
          '<span class="pick-label">Suele jugar</span>' +
          `<b class="pick-name">${escapeHtml(pick.name)}</b>` +
          `<i class="pick-sub">${escapeHtml(pick.sub)}</i>` +
        '</div>' +
        `<b class="pick-value">${pick.value}</b>` +
      '</div>',
    );
  } else if (pick) {
    // Sin dominancia no hay apuesta posible: se dice explícito en una línea.
    // Decir "Suele jugar X 3 %" era una etiqueta que se contradecía sola.
    items.push(predRow(icon('lista'), `<i>${escapeHtml(pick.sub)}</i>`));
  }

  // Con smartTips la tira táctica ya responde "cómo arranca" con la
  // DISTRIBUCIÓN completa y su muestra. Repetir acá la moda (a veces de 2
  // replays) era el mismo dato dos veces y con la muestra más débil.
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
          `<b>En replays: ${escapeHtml(best.short || best.name)}</b> ` +
            `<i>en ${escapeHtml(fmtNumber(best.count))} de ${escapeHtml(fmtNumber(base))} ` +
            `replay${base === 1 ? '' : 's'} acá</i>`,
        ),
      );
    } else if (pending) {
      items.push(
        predRow(icon('espadas'), '<i>Analizando sus replays para ver cómo arranca…</i>'),
      );
    } else if (report.modePending) {
      items.push(predRow(icon('espadas'), '<i>Esperando el modo para consultar aperturas…</i>'));
    } else if (report.openingError || (openings && openings.ok === false)) {
      items.push(predRow(icon('espadas'), '<i>No se pudieron consultar sus aperturas.</i>'));
    } else if (openings && openings.modeUnavailable) {
      items.push(predRow(icon('espadas'), '<i>Aperturas disponibles solo en modos ranked compatibles.</i>'));
    } else if (openings) {
      // Hay que distinguir "no hay replays del mapa" de "hay replays del mapa,
      // pero ninguno con SU civ": decir lo primero con lo segundo en la mano
      // era una media verdad (123456 tenía 3 replays de Fortress, de otras civs).
      const mapSaw = Number(openings.mapAnalyzed) || 0;
      const civName = map && map.civ && map.civ.name ? map.civ.name : null;
      const why = !mapName || mapName === '—' || mapName === 'este mapa'
        ? 'Esperando el mapa para analizar aperturas.'
        : mapSaw > 0 && civName
          ? `Sin replays de ${civName} acá (${fmtNumber(mapSaw)} de otras civs)`
          : mapSaw > 0
            ? `Hay ${fmtNumber(mapSaw)} replays del mapa, pero falta identificar su civ más usada.`
            : `Sin replays de ${mapName} para saber cómo arranca`;
      items.push(predRow(icon('espadas'), `<i>${escapeHtml(why)}</i>`));
    } else {
      items.push(predRow(icon('espadas'), '<i>Sin datos de aperturas disponibles.</i>'));
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
  // La apertura YA está en la franja "Arranca con FC en X de Y replays acá".
  // rivalOpeningsBlock() repetía el mismo dato con otro título, otra frase,
  // chips y un badge: cuatro capas para una sola conclusión. Queda la franja.
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

/** Cuenta solo rivales cuyo equipo se conoce; no inventa el total en FFA. */
function knownOpponentCount() {
  const players = lastState && Array.isArray(lastState.players) ? lastState.players : [];
  const me = players.find((player) => player && player.isYou);
  const team = me && me.team != null ? Number(me.team) : NaN;
  if (!Number.isFinite(team)) return 0;
  return players.filter((player) => player && !player.isYou && player.team != null &&
    Number.isFinite(Number(player.team)) && Number(player.team) !== team).length;
}

function renderRivalInfo() {
  if (!rivalInfoEl) return;
  // La visibilidad la decide applyVisibility(): acá solo se pinta el contenido.
  const reports = rivalPayload && Array.isArray(rivalPayload.reports) ? rivalPayload.reports : [];
  rivalInfoEl.classList.toggle('single', reports.length <= 1);
  rivalGrid.innerHTML = reports.length
    ? reports.map(rivalCard).join('')
    : `<div class="rival-empty">Buscando los datos del rival…</div>`;
  // Con 1-4 replays un porcentaje parece certeza. Se dice UNA vez por
  // sección: antes cada tarjeta repetía el mismo aviso y ocupaba dos líneas.
  const smallSample = reports.some((r) => {
    const o = r && r.openings;
    const n = o ? Number(o.mapCivAnalyzed) || 0 : 0;
    return Boolean(o && o.mapCivFavorite) && n > 0 && n < 5;
  });
  if (rivalFootnoteEl) {
    const total = knownOpponentCount();
    const notes = [];
    if (reports.length && total > reports.length) notes.push(`Análisis de ${reports.length} de ${total} rivales.`);
    if (smallSample) notes.push('Muestra chica: es una pista, no una tendencia.');
    rivalFootnoteEl.hidden = !notes.length;
    rivalFootnoteEl.textContent = notes.join(' ');
  }
  renderScouting();
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

/**
 * TIRA TÁCTICA (pre-partida). Presupuesto: TRES bloques y ~10 s de lectura.
 *
 *   1. ESTILO   -> AGRESIVO / BOOM   : walling + counter preventivo, o eco.
 *   2. LE DUELE -> ARCHER RUSH      : la orden de producción en Feudal.
 *   3. RITMO    -> CERRÁ TEMPRANO   : alargar o forzar el choque.
 *
 * Son las tres preguntas que cambian una decisión DENTRO de la partida. La
 * racha NO está: saber si el rival viene de ganar o perder no cambia ninguna
 * decisión. El winrate general tampoco se repite: ya está en el informe.
 *
 * Honestidad de muestra: con n < 20 NO se publica porcentaje (con n=10 el
 * intervalo de Wilson al 95 % vale aprox. +-26 pp). Se publica la FRACCIÓN
 * "8/11", que sigue siendo un número grande sin fingir precisión; con n < 5
 * se degrada a guion + "muestra chica". Cada tile declara su denominador.
 */
const TAC_MIN_PCT_GAMES = 20;
// El CONSEJO de ritmo se fía solo con muestra en AMBOS extremos. No basta con
// esconder el %: una frase como "cerrá temprano" derivada de 3 partidas cortas
// también es una inferencia sin sustento.
const TAC_MIN_TEMPO_BUCKET = 8;
const TAC_MIN_TEMPO_GAP = 15;

function tacBig(part, games) {
  const n = Number(games) || 0;
  const hits = Number(part) || 0;
  if (n >= TAC_MIN_PCT_GAMES) {
    return {
      big: `${fmtNumber(Math.round((hits / n) * 100))}<small>%</small>`,
      note: `de ${fmtNumber(n)}`,
    };
  }
  if (n >= 5) {
    return {
      big: `${fmtNumber(hits)}<small>/${fmtNumber(n)}</small>`,
      note: `de ${fmtNumber(n)}`,
    };
  }
  return { big: '—', note: `solo ${fmtNumber(n)} · muestra chica` };
}

/**
 * Consejo de RITMO compartido por la vista compacta y el detalle. No basta
 * con esconder el porcentaje: una frase como "cerrá temprano" derivada de 3
 * partidas cortas es una inferencia sin sustento. Exige gap >= 15 pp y
 * muestra en AMBOS extremos.
 */
function tempoAdvice(tempo) {
  if (!tempo || !Number.isFinite(tempo.shortWinRate) || !Number.isFinite(tempo.longWinRate)) return null;
  const gap = tempo.longWinRate - tempo.shortWinRate;
  const shortGames = Number(tempo.shortGames) || 0;
  const longGames = Number(tempo.longGames) || 0;
  const enoughTempo = shortGames >= TAC_MIN_TEMPO_BUCKET && longGames >= TAC_MIN_TEMPO_BUCKET;
  if (Math.abs(gap) < TAC_MIN_TEMPO_GAP || !enoughTempo) return null;
  const forceShort = gap > 0;
  const games = forceShort ? shortGames : longGames;
  const exactWins = forceShort ? tempo.shortWins : tempo.longWins;
  const wins = Number.isInteger(exactWins) && exactWins >= 0 && exactWins <= games
    ? exactWins : Math.round(((forceShort ? tempo.shortWinRate : tempo.longWinRate) * games) / 100);
  return { forceShort, games, wins };
}

/** Tile: etiqueta arriba, número dominante, denominador abajo. Sin párrafos. */
function tacTile({ label = '', value = '', sub = '', tone = '', ico = '', hero = false } = {}) {
  return (
    `<div class="tac-tile${hero ? ' hero' : ''}">` +
    `<span class="tac-label">${ico ? icon(ico) : ''}${escapeHtml(label)}</span>` +
    `<b class="tac-value${tone ? ` ${tone}` : ''}">${value}</b>` +
    `<span class="tac-sub">${sub}</span>` +
    '</div>'
  );
}

function scoutTipSections(tip) {
  if (!tip) return '<div class="rival-empty">Sin datos.</div>';
  if (tip.modePending) return '<div class="rival-empty">Esperando el modo para analizar replays…</div>';
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

  const tiles = [];

  // 1) ESTILO. Distribución agresivo/boom, no la moda de una sola apertura.
  const style = tip.style;
  if (style && style.analyzed >= 5) {
    // Sin dominancia clara NO se publica una etiqueta: se publica el reparto.
    // Un 45/40/15 es mixto, no "scouts" ni "boom".
    const mixed = style.dominant === 'mixto';
    const big = mixed
      ? { big: `${fmtNumber(style.aggressive)}<small>:${fmtNumber(style.boom)}</small>`, note: `de ${fmtNumber(style.analyzed)}` }
      : tacBig(style.dominant === 'agresivo' ? style.aggressive : style.boom, style.analyzed);
    const label = mixed ? 'MIXTO' : style.dominant === 'agresivo' ? 'AGRESIVAS' : 'FAST CASTLE';
    const top = !mixed && style.top ? ` · ${escapeHtml(style.top.short)}` : '';
    const hybrids = Number(style.hybrid) ? ` · ${fmtNumber(style.hybrid)} híbridos` : '';
    const scope = style.scope === 'modo' ? ' · todo el modo' : '';
    tiles.push(tacTile({
      label: mixed ? 'ESTILO · MIXTO' : 'ESTILO',
      ico: style.dominant === 'agresivo' ? 'espadas' : 'estrella',
      value: big.big,
      sub: `${label}${top}${hybrids} · ${escapeHtml(big.note)} replays${scope}`,
      // Rojo = amenaza a preparar, verde = ventaja explotable, neutro = mixto.
      tone: '', // Una apertura frecuente no es por sí sola ventaja ni amenaza.
      hero: true,
    }));
  }

  // 2) LE DUELE. strategy_opponent = la apertura que le ganó. Es la orden
  //    de producción concreta (arqueros, piqueros, muros), no una civ.
  const weak = tip.openingsAgainst && tip.openingsAgainst[0];
  const hard = tip.weakAgainst && tip.weakAgainst[0];
  const outcomeLabel = tip.mode && tip.mode.size === 'team' ? 'derrotas del equipo / partidas' : 'derrotas / partidas';
  if (weak) {
    const big = tacBig(weak.losses, Number(weak.games) || 0);
    tiles.push(tacTile({
      label: 'LE DUELE',
      ico: 'espadas',
      value: big.big,
      // Leyenda explícita: sin esto "8/11" se lee como victorias.
      sub: `${escapeHtml(weak.short || weak.name || '?')} · ${outcomeLabel} · ${escapeHtml(weak.scope === 'modo' ? 'todo el modo' : (tip.scopeLabel || 'muestra disponible'))}`,
      tone: 'good',
    }));
  }
  if (hard) {
    const big = tacBig(hard.losses, Number(hard.games) || 0);
    tiles.push(tacTile({
      label: 'LE CUESTA',
      ico: 'estrella',
      value: big.big,
      sub: `${escapeHtml(hard.civ || '?')} · ${outcomeLabel} · ${escapeHtml(tip.scopeLabel || 'muestra disponible')}`,
      tone: 'good',
    }));
  }

  // 3) RITMO. La etiqueta ES el consejo; el número es SU winrate en el tramo
  //    que te conviene forzar. `tempoAdvice` comparte el mismo umbral con la
  //    tarjeta compacta, así las dos vistas nunca se contradicen.
  const advice = tempoAdvice(tip.tempo);
  if (advice) {
    const big = tacBig(advice.wins, advice.games);
    tiles.push(tacTile({
      label: advice.forceShort ? 'PARTIDAS CORTAS' : 'PARTIDAS LARGAS',
      ico: 'foco',
      value: big.big,
      sub: `${tip.mode && tip.mode.size === 'team' ? 'su equipo gana' : 'gana'} en ${advice.forceShort ? 'cortas' : 'largas'} · ${escapeHtml(big.note)}`,
      tone: 'good',
    }));
  }

  if (!tiles.length) return '<div class="rival-empty">Sin punto débil claro en su historial.</div>';
  return `<div class="tac-strip">${tiles.join('')}</div>`;
}

/**
 * SMURF con COSTE CERO. `peak` (highestrating de RM 1v1) y `rating` ya viajan
 * en cada fila del roster (src/aoe.js -> composeRows); el renderer incluso
 * pinta el pico en la columna de ELO. Un pico histórico muy por encima del
 * ELO actual es la señal más limpia de cuenta alternativa o de un jugador
 * mucho más fuerte volviendo a subir. Es HEURÍSTICO: se muestra la evidencia
 * (pico y ELO actual), nunca un score con decimales que aparente precisión.
 */
function smurfSignal(tip) {
  const players = lastState && Array.isArray(lastState.players) ? lastState.players : [];
  const player = players.find((p) => Number(p && p.profileId) === Number(tip && tip.profileId));
  if (!player || player.peak == null || player.rating == null) return null;
  const peak = Number(player.peak);
  const rating = Number(player.rating);
  if (!(peak >= 1400 && peak - rating >= 300)) return null;
  return { peak, rating };
}

function scoutCard(tip) {
  const name = tip.name || `Perfil ${tip.profileId || '?'}`;
  // El consejo (smartTips) y la civ recomendada (civRecommender) comparten
  // payload y tarjeta: cada bloque se muestra solo con su opción encendida.
  const blocks = [];
  if (tip.stale) blocks.push('<div class="rival-empty">Datos guardados anteriormente · pueden estar desactualizados</div>');
  else if (tip.provisional || tip.limited) blocks.push(`<div class="rival-empty">${tip.provisional ? 'Muestra inicial · ampliando análisis…' : 'Muestra inicial · análisis completo no disponible'}</div>`);
  if (smartTipsEnabled) {
    blocks.push(`<div class="rival-block tips">${scoutTipSections(tip)}</div>`);
  }
  const recommend = scoutRecommendBlock(tip);
  if (recommend) blocks.push(recommend);
  const smurf = smurfSignal(tip);
  const badge = smurf
    ? `<span class="smurf-tag" title="Pico histórico de ELO RM 1v1; ELO actual ${fmtNumber(smurf.rating)}.">` +
      `${icon('foco')}PICO <b>${fmtNumber(smurf.peak)}</b></span>`
    : '';
  return (
    '<article class="rival-card">' +
    '<div class="rival-card-head">' +
    `<span class="rival-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>` +
    badge +
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
  if (tip && tip.modePending) return '<div class="rival-block tips"><div class="rival-empty">Esperando el modo para recomendar una civ…</div></div>';
  if (!tip || tip.loading || tip.recommendPending) {
    return '<div class="rival-block tips"><div class="rival-empty">Cruzando su debilidad con tu historial…</div></div>';
  }
  if (tip.modeUnavailable) {
    return '<div class="rival-block tips"><div class="rival-empty">Solo en partidas ranked: en custom no se mezclan modos.</div></div>';
  }
  if (tip.error) {
    return '<div class="rival-block tips"><div class="rival-empty">No se pudieron consultar los replays para recomendar una civ.</div></div>';
  }
  if (tip.recommendError) {
    return '<div class="rival-block tips"><div class="rival-empty">No pude cruzar con tu historial ahora mismo.</div></div>';
  }
  // Solo la nº 1 y solo si alguna de sus dos evidencias tiene muestra real.
  // Tres filas con dos porcentajes cada una eran 6 cifras compitiendo con el
  // hero; una fila con "— sin muestra" es ruido directamente, se omite entera.
  const all = Array.isArray(tip.recommend) ? tip.recommend : [];
  const recs = all
    .filter((row) => {
      const mineN = row.mine ? Number(row.mine.games) || 0 : 0;
      const rivalN = row.vsRival ? Number(row.vsRival.games) || 0 : 0;
      return mineN >= 5 || rivalN >= 5;
    })
    .slice(0, 1);
  if (!recs.length) return '<div class="rival-block tips"><div class="rival-empty">Sin muestra suficiente para recomendar una civ.</div></div>';
  // Filas: número + escudo + nombre, y las DOS evidencias abajo alineadas.
  // Antes todo iba en una frase ('1. Gurjaras · vos 67% (9 pj) · le cuesta…')
  // y las tres recomendaciones se leían como un párrafo.
  const rows = recs
    .map((row, index) => {
      // Dos columnas de dato alineadas a la derecha: VOS y LO QUE LE CUESTA.
      // Así los números quedan en columna entre filas y no hay que leer una
      // frase con puntos medios para separar las evidencias.
      // Con menos de 5 partidas NO se publica el porcentaje: un 100 % de 3
      // partidas parece certeza y no lo es (Wilson: ~44-100 % al 95 %).
      const mineN = row.mine ? Number(row.mine.games) || 0 : 0;
      let mineStat;
      if (row.mine && row.mine.winRate != null && mineN >= 5) {
        // La cascada de alcance: si mi winrate viene del modo completo (no del
        // mapa exacto), se declara — nunca se disfraza de dato del mapa.
        const scopeTag = row.mine.scope === 'mode' ? ' · modo' : '';
        const scopeTip =
          row.mine.scope === 'mode' ? 'Winrate de todo el modo, no solo de este mapa' : '';
        mineStat =
          `<span class="rec-stat"${scopeTip ? ` title="${scopeTip}"` : ''}>` +
          '<em>vos</em>' +
          `<b>${fmtNumber(row.mine.winRate)} %</b>` +
          `<i>${fmtNumber(mineN)} pj${scopeTag}</i></span>`;
      } else {
        mineStat =
          '<span class="rec-stat"><em>vos</em><b>—</b><i>sin muestra</i></span>';
      }
      const rivalN = row.vsRival ? Number(row.vsRival.games) || 0 : 0;
      const rivalStat =
        row.vsRival && row.vsRival.lossRate != null && rivalN >= 5
          ? '<span class="rec-stat">' +
            `<em>${tip.mode && tip.mode.size === 'team' ? 'pierde equipo' : 'le cuesta'}</em>` +
            `<b class="bad">${fmtNumber(row.vsRival.lossRate)} %</b>` +
            `<i>${fmtNumber(rivalN)} pj</i></span>`
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
  renderScouting();
  applyVisibility();
}

/* =====================================================================
   SCOUTING UNIFICADO (v0.1.24) · VISTA COMPACTA POR DEFECTO
   ---------------------------------------------------------------------
   Une `overlay:rival` (civ / mapa / H2H) y `overlay:scout` (estilo,
   debilidades, ritmo) por profileId en UNA sola tarjeta por rival. Antes
   eran dos secciones con dos cabeceras, el mismo nombre dos veces y dos
   números hero compitiendo por la misma mirada en ~10 s de lectura.

   Reglas de la tarjeta, en este orden y sin excepciones:
     1) un escudo grande y el nombre;
     2) UN número dominante (estilo, o el pick de civ si no hay replays);
     3) una barra de reparto con su muestra en una línea;
     4) UNA acción concreta con su evidencia y su denominador;
     5) proveniencia y honestidad UNA sola vez, al pie de la sección.

   Nada se inventa: sin muestra no hay porcentaje ni consejo. El detalle
   completo sigue vivo en #rivalInfo + #scoutInfo, detrás de F2.
   ===================================================================== */

/** `strategy_opponent` dice qué apertura le GANÓ: esa es la orden de producción. */
const SCOUT_ACTIONS = {
  'Scout rush': 'Jugá scouts',
  'Archer rush': 'Jugá arqueros',
  Drush: 'Drusheá',
  'Drush fast castle': 'Drush y subí a Castillo',
  'Man at arms rush': 'Jugá MAA',
  'Fast castle': 'Subí a Castillo',
};

function scoutActionFor(opening) {
  const name = (opening && opening.name) || '';
  if (SCOUT_ACTIONS[name]) return SCOUT_ACTIONS[name];
  const short = (opening && (opening.short || opening.name)) || '';
  return short ? `Jugá ${short}` : 'Aprovechá su punto débil';
}

/** Número hero + barra. Con estilo -> reparto; si no, el pick de civ del mapa. */
function scoutHero(tip, report) {
  const style = tip && tip.style;
  const total = style ? Number(style.analyzed) || 0 : 0;
  if (style && total >= 5) {
    const mixed = style.dominant === 'mixto';
    const agro = Number(style.aggressive) || 0;
    const boom = Number(style.boom) || 0;
    const hybrid = Number(style.hybrid) || 0;
    const big = mixed
      ? { big: `${fmtNumber(agro)}<small>:${fmtNumber(boom)}</small>` }
      : tacBig(style.dominant === 'agresivo' ? agro : boom, total);
    return {
      value: big.big,
      label: mixed
        ? 'MIXTO · sin estilo dominante'
        : style.dominant === 'agresivo' ? 'Aperturas agresivas' : 'Fast Castle frecuente',
      tone: '', // La frecuencia no implica ventaja ni amenaza por sí sola.
      bar: {
        agro: Math.round((agro / total) * 100),
        boom: Math.round((boom / total) * 100),
      },
      // Longitud acotada a propósito: con dos columnas, una línea de más en
      // una sola tarjeta desalinea las dos cajas de acción. El alcance
      // ("estilo de todo el modo") se declara UNA vez al pie de la sección.
      dist:
        `${fmtNumber(agro)} agresivas · ${fmtNumber(boom)} Fast Castle de ${fmtNumber(total)}` +
        (hybrid ? ` · ${fmtNumber(hybrid)} híbridos` : ''),
      styleScope: style.scope === 'modo',
    };
  }
  // Sin replays analizados: el pick de civ del mapa es la única señal real.
  return scoutPickHero(report);
}

/*
 * PICK DE CIV DEL MAPA · una sola fuente de verdad para el porcentaje.
 *
 * BUG que corrige (v0.1.25): `mapStats.civ.games` cuenta partidas del
 * historial LEÍDO y `mapStats.games` es el total de /stats (el histórico
 * completo del mapa). Dividir una por el otro daba "0 %": medido real,
 * Huns 32 de 1748 en Arabia. Peor: el informe parcial usaba el sample de la
 * primera página y el final el total de /stats, así que el número CAMBIABA
 * solo mientras cargaban los datos. Ahora numerador y denominador salen
 * SIEMPRE de las partidas del mapa que se leyeron (`sampleGames`).
 *
 * Y umbral de honestidad: si la civ más usada no llega al 30 % del sample,
 * no existe una apuesta posible y no se publica la etiqueta "Suele jugar"
 * (un rival que rota 40 civs no "suele jugar" ninguna: medido 3 % real).
 */
const PICK_MIN_GAMES = 5;
const PICK_MIN_SHARE = 30;

function scoutPickHero(report) {
  const map = report && report.mapStats;
  const civ = map && map.civ;
  if (!civ || !civ.name) return null;
  const hits = Number(civ.games) || 0;
  if (hits <= 0) return null;
  // La primera página llega antes de /stats: en ese parcial `games` todavía
  // es el tamaño de la muestra y `sampleGames` aún no está definido.
  const sample = Math.max(Number(map.sampleGames != null ? map.sampleGames : map.games) || 0, hits);
  const total = Number(map.games) || 0;
  const share = (hits / sample) * 100;
  // Si se leyó menos de lo que declara /stats, se dice "últimas": el recorrido
  // del historial va de la más nueva a la más vieja, así que es una ventana
  // reciente, no el histórico completo. Declararlo es gratis y es verdad.
  const recent = sample < total ? 'últimas ' : '';
  const scope = map.name && map.name !== '—' ? ` · ${map.name}` : '';
  if (hits >= PICK_MIN_GAMES && share >= PICK_MIN_SHARE) {
    return {
      name: civ.name,
      value: tacBig(hits, sample).big,
      label: `Suele jugar ${civ.name}`,
      sub: `en ${fmtNumber(hits)} de sus ${recent}${fmtNumber(sample)} partidas acá`,
      tone: '',
      bar: null,
      dist: `${fmtNumber(hits)} de sus ${recent}${fmtNumber(sample)} partidas acá${scope}`,
    };
  }
  return {
    none: true,
    name: civ.name,
    value: '—',
    label: 'Sin civ dominante acá',
    sub: `juega de todo · ${civ.name} es su más usada: ${fmtNumber(hits)} de ${fmtNumber(sample)} acá`,
    tone: '',
    bar: null,
    dist: `juega de todo · ${civ.name} es su más usada: ${fmtNumber(hits)} de ${fmtNumber(sample)} acá${scope}`,
  };
}

/** UNA acción: apertura que le duele > civ que le cuesta > ritmo. */
function scoutAction(tip) {
  const team = Boolean(tip && tip.mode && tip.mode.size === 'team');
  const weak = tip && tip.openingsAgainst && tip.openingsAgainst[0];
  if (weak) {
    const n = Number(weak.games) || 0;
    const losses = Number(weak.losses) || 0;
    return {
      title: `${team ? 'Apertura rival' : 'Considerá'}: ${weak.short || weak.name || 'esta apertura'}`,
      sub: `${team ? 'Derrotas de su equipo' : 'Derrotas frente a esta apertura'} · ${weak.scope === 'modo' ? 'todo el modo' : (tip.scopeLabel || 'muestra disponible')}`,
      value: tacBig(losses, n).big,
      legend: team ? 'derrotas de equipo / partidas' : 'derrotas / partidas',
    };
  }
  const hard = tip && tip.weakAgainst && tip.weakAgainst[0];
  if (hard) {
    const n = Number(hard.games) || 0;
    const losses = Number(hard.losses) || 0;
    return {
      title: team ? `Contra equipos con ${hard.civ || 'esa civ'}` : `Considerá ${hard.civ || 'esa civ'}`,
      sub: team ? 'Derrotas de su equipo' : `Le cuesta ${hard.civ || '?'}`,
      value: tacBig(losses, n).big,
      legend: team ? 'derrotas de equipo / partidas' : 'derrotas / partidas',
    };
  }
  const advice = tempoAdvice(tip && tip.tempo);
  if (advice) {
    return {
      title: advice.forceShort ? 'Menor winrate en partidas cortas' : 'Menor winrate en partidas largas',
      sub: `${fmtNumber(advice.games)} partidas en el tramo observado`,
      value: tacBig(advice.wins, advice.games).big,
      legend: 'victorias / partidas',
    };
  }
  return {
    empty: true,
    title: 'Sin punto débil claro',
    sub: 'Sin evidencia suficiente para recomendar una apertura.',
    value: '—',
    legend: '',
  };
}

/** Conserva las otras señales activadas sin convertir correlación en certeza. */
function scoutAdditionalEvidence(tip) {
  if (!tip) return '';
  const weak = tip.openingsAgainst && tip.openingsAgainst[0];
  const hard = tip.weakAgainst && tip.weakAgainst[0];
  const lines = [];
  if (weak && hard) {
    const subject = tip.mode && tip.mode.size === 'team' ? 'Su equipo perdió' : 'Perdió';
    lines.push(`${subject} ${fmtNumber(hard.losses)} de ${fmtNumber(hard.games)} contra ${hard.civ || 'esa civ'} · ${tip.scopeLabel || 'muestra disponible'}`);
  }
  const tempo = tempoAdvice(tip.tempo);
  if (tempo && (weak || hard)) {
    const subject = tip.mode && tip.mode.size === 'team' ? 'su equipo ganó' : 'ganó';
    lines.push(`En partidas ${tempo.forceShort ? 'cortas' : 'largas'} ${subject} ${fmtNumber(tempo.wins)} de ${fmtNumber(tempo.games)} · todo el modo`);
  }
  return lines.map((line) => `<p class="scout-evidence">${escapeHtml(line)}</p>`).join('');
}

/**
 * Universo de rivales: la UNIÓN de los dos payloads, limitada a 2 (el mismo
 * RIVAL_LIMIT del main). Si todavía no llegó ninguno, se cae al roster para
 * dibujar la tarjeta vacía con la MISMA geometría: el panel no salta cuando
 * llegan los datos en segundo plano.
 */
function scoutUniverse() {
  const reports = rivalPayload && Array.isArray(rivalPayload.reports) ? rivalPayload.reports : [];
  const { tips, sameMatch } = tipsForCurrentMatch();
  const usableTips = (Boolean(lastState && lastState.phase === 'lobby') || sameMatch) ? tips : [];
  const ids = [];
  const push = (id) => {
    const key = String(id == null ? '' : id);
    if (key && key !== 'NaN' && !ids.includes(key)) ids.push(key);
  };
  for (const report of reports) push(report && report.profileId);
  for (const tip of usableTips) push(tip && tip.profileId);
  if (!ids.length) {
    const players = lastState && Array.isArray(lastState.players) ? lastState.players : [];
    const you = players.find((player) => player && player.isYou);
    const myTeam = you && you.team != null ? Number(you.team) : NaN;
    for (const player of players) {
      if (!player || player.isYou) continue;
      if (players.length > 2 && (!Number.isFinite(myTeam) || player.team == null || player.team === '')) continue;
      if (Number.isFinite(myTeam) && player.team != null && Number(player.team) === myTeam) continue;
      push(player.profileId);
      if (ids.length >= 2) break;
    }
  }
  const players = lastState && Array.isArray(lastState.players) ? lastState.players : [];
  return ids.slice(0, 2).map((key) => {
    const report = reports.find((item) => String(item && item.profileId) === key) || null;
    const tip = usableTips.find((item) => String(item && item.profileId) === key) || null;
    const player = players.find((item) => String(item && item.profileId) === key) || null;
    return {
      key,
      report,
      tip,
      player,
      name: (report && report.name) || (tip && tip.name) || (player && player.name) || `Perfil ${key}`,
    };
  });
}

/** Una tarjeta por rival: identidad -> hero -> barra -> acción. Nada más. */
function scoutCompactCard(entry, wide) {
  const { report, tip, player, name } = entry;
  const civ = (report && report.civ) || (player && player.civ) || null;
  const mapName = (lastState && lastState.match && lastState.match.mapName) || null;
  const modeLabel = (lastState && lastState.ladder && lastState.ladder.label) || null;
  const smurf = smurfSignal(tip || { profileId: entry.key });
  // Con dos columnas el badge a la derecha recortaba el nombre a "Ri...".
  // Va DENTRO de la línea de contexto, primero para que nunca se corte, y
  // sin su propia fila: así las dos tarjetas siguen alineadas.
  const smurfTag = smurf
    ? `<b class="scout-smurf-inline" title="Pico histórico de ELO en RM 1v1; el ELO actual es ${fmtNumber(smurf.rating)}.">` +
      `PICO ${fmtNumber(smurf.peak)}</b>`
    : '';
  // Mapa y modo ya están en la cabecera y al pie de la SECCIÓN: repetirlos
  // en cada tarjeta era ruido. Solo se agregan cuando hay una columna ancha.
  const metaParts = [civ];
  if (wide && mapName && mapName !== '—') metaParts.push(mapName);
  if (wide && modeLabel) metaParts.push(modeLabel);
  const meta = metaParts.filter((part) => part && part !== '—').join(' · ');
  const head =
    '<div class="scout-unit-head">' +
    rivalShield(civ || '', 'rival-shield scout-shield') +
    '<div class="scout-who">' +
    `<b class="scout-name" title="${escapeHtml(name)}">${escapeHtml(name)}</b>` +
    `<span class="scout-meta">${smurfTag}${smurfTag && meta ? ' · ' : ''}${escapeHtml(meta || 'Sin civ detectada')}</span>` +
    '</div>' +
    '</div>';

  const hero = smartTipsEnabled ? scoutHero(tip, rivalOptions.rivalFavorites ? report : null) : null;
  const action = smartTipsEnabled ? scoutAction(tip) : null;
  let dist = hero ? hero.dist : 'Sin replays analizados ni civ del mapa con muestra.';
  if (tip && tip.stale) dist += ' · datos guardados anteriormente';
  else if (tip && tip.provisional) dist += ' · muestra inicial, ampliando';
  else if (tip && tip.limited) dist += ' · muestra inicial, análisis completo no disponible';
  if (tip && tip.error) dist += ' · replays no disponibles ahora mismo';
  else if (tip && tip.modeUnavailable) dist += ' · solo partidas ranked';

  const heroMarkup = hero
    ? `<b class="scout-hero-value${hero.tone ? ` ${hero.tone}` : ''}">${hero.value}</b>` +
      `<span class="scout-hero-label${hero.tone ? ` ${hero.tone}` : ''}">${escapeHtml(hero.label)}</span>`
    : '<b class="scout-hero-value">—</b><span class="scout-hero-label">Sin muestra suficiente</span>';
  // CSP `style-src 'self'`: el ancho se aplica por CSSOM en renderScouting(),
  // nunca con un atributo style inline (el CSP lo bloquearía).
  const barMarkup = hero && hero.bar
    ? `<div class="scout-bar"><i class="agro" data-w="${hero.bar.agro}"></i>` +
      `<i class="boom" data-w="${hero.bar.boom}"></i></div>`
    : '<div class="scout-bar"><i class="flat" data-w="100"></i></div>';

  // Cada opción mantiene su propio estado aunque otras consultas sigan en vuelo.
  const rival = report || { loading: true };
  const details = [];
  if (rivalOptions.rivalFavorites || rivalOptions.rivalOpenings) {
    details.push(rival.loading
      ? '<div class="rival-empty">Buscando datos del mapa y aperturas…</div>'
      : rivalPredStrip(rival));
  }
  if (rivalOptions.rivalFavorites) details.push(rivalMapBlock(rival));
  if (rivalOptions.rivalH2H) details.push(rivalH2HBlock(rival));
  if (rivalOptions.rivalCivs) details.push(rivalHistoryBlock(rival));
  if (civRecommenderEnabled) details.push(scoutRecommendBlock(tip || { loading: true }));
  const tactical = !smartTipsEnabled ? '' : tip && tip.modePending
    ? '<div class="rival-empty">Esperando el modo para analizar replays…</div>'
    : (!tip || tip.loading)
    ? '<div class="rival-empty">Analizando replays del rival…</div>'
    : `<div class="scout-hero">${heroMarkup}</div>${barMarkup}` +
      `<p class="scout-dist">${escapeHtml(dist)}</p>` +
      `<div class="scout-action${action.empty ? ' empty' : ''}">` +
      '<div class="scout-action-copy">' +
      `<div class="scout-action-title">${escapeHtml(action.title)}</div>` +
      `<div class="scout-action-sub">${escapeHtml(action.sub)}</div></div>` +
      `<div class="scout-action-stat"><b class="scout-action-value">${action.value}</b>` +
      (action.legend ? `<span class="scout-action-legend">${escapeHtml(action.legend)}</span>` : '') +
      '</div></div>' + scoutAdditionalEvidence(tip);
  return (
    '<article class="scout-unit">' + head +
    tactical + details.filter(Boolean).join('') +
    '</article>'
  );
}

/** Pinta la sección compacta. La visibilidad la decide applyVisibility(). */
function renderScouting() {
  if (!scoutingEl || !scoutCardsEl) return;
  const entries = scoutUniverse();
  const mapName = (lastState && lastState.match && lastState.match.mapName) || null;
  scoutingEl.classList.toggle('single', entries.length <= 1);
  if (scoutContextEl) {
    const total = knownOpponentCount();
    scoutContextEl.textContent = entries.length
      ? `${fmtNumber(entries.length)}${total > entries.length ? ` de ${fmtNumber(total)}` : ''} rival${entries.length === 1 && total <= 1 ? '' : 'es'}` +
        (mapName && mapName !== '—' ? ` · ${mapName}` : '')
      : '';
  }
  const wide = entries.length <= 1;
  scoutCardsEl.innerHTML = entries.length
    ? entries.map((entry) => typeof TacticalUI === 'object' ? TacticalUI.renderRival({ entry, state: lastState,
        options: { ...rivalOptions, smartTips: smartTipsEnabled, civRecommender: civRecommenderEnabled },
        detail: !scoutF2Enabled || detailMode }) : scoutCompactCard(entry, wide)).join('')
    : '<div class="rival-empty">Buscando los datos del rival…</div>';
  // Los anchos de barra se aplican por CSSOM (CSP sin unsafe-inline).
  scoutCardsEl.querySelectorAll('[data-w]').forEach((bar) => {
    const width = Math.max(0, Math.min(100, Number(bar.dataset.w) || 0));
    bar.style.width = `${width}%`;
  });
  // Proveniencia + honestidad de muestra: UNA vez por sección, y SOLO por
  // datos que esta vista realmente muestra. Antes la disparaba el informe
  // del rival (que en modo compacto ni se ve): un aviso sin causa visible.
  const smallSample = entries.some(({ tip }) => {
    const style = tip && tip.style;
    if (style && Number(style.analyzed) < TAC_MIN_PCT_GAMES) return true;
    const weak = tip && tip.openingsAgainst && tip.openingsAgainst[0];
    return Boolean(weak) && Number(weak.games) < TAC_MIN_PCT_GAMES;
  });
  // Sin mapa ni modo: ya están en la cabecera del ELO y en la de esta misma
  // sección. Repetirlos acá era el tercer "MegaRandom" de la pantalla.
  const foot = ['AoE2Insights · aperturas de replays analizados'];
  // Si algún estilo cayó al modo completo, se declara UNA vez acá en vez de
  // alargar el caption de una sola tarjeta y desalinear las dos columnas.
  if (entries.some(({ tip }) => tip && tip.style && tip.style.scope === 'modo')) {
    foot.push('sin replays del mapa, el estilo se tomó de todo el modo');
  }
  if (smallSample) foot.push('muestra chica: es una pista, no una tendencia');
  if (scoutFootnoteEl) {
    scoutFootnoteEl.hidden = true;
  }
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
// Aire que reportHeight() suma siempre. fitStage() tiene que RESERVARLO:
// si escala hasta el máximo exacto, esos 8 px se recortan y la última fila
// del detalle queda cortada (pasó en TG: 1164 px de contenido / 1155 px).
const HEIGHT_PADDING = 8;

function fitStage() {
  if (!stage) return;
  const natural = stage.scrollHeight;
  // -2 por el redondeo subpíxel de getBoundingClientRect(): sin eso el
  // Math.ceil de reportHeight() pedía 1156 contra 1155 disponibles.
  const usable = stageMaxHeight - HEIGHT_PADDING - 2;
  let scale = 1;
  if (usable > 0 && natural > usable) {
    // No recortar información: con muchas opciones en un monitor pequeño,
    // el mínimo anterior de 0.82 dejaba la parte inferior fuera de pantalla.
    scale = usable / natural;
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
  const height = Math.ceil(stage.getBoundingClientRect().height) + HEIGHT_PADDING;
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
      if (!player || player.rating == null || player.rating === '' || !Number.isFinite(Number(player.rating))) continue;
      if (player.team == null || player.team === '') continue;
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

function renderPostMatch(payload) {
  postMatchPayload = payload && payload.report ? payload.report : payload;
  if (postMatchEl && typeof TacticalUI === 'object') {
    postMatchEl.innerHTML = postMatchPayload ? TacticalUI.renderPostMatch(postMatchPayload, postMatchAccess) : '';
  }
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
  if (typeof TacticalUI === 'object' && TacticalUI.configure) {
    TacticalUI.configure({ slugs: config.shields, aliases: config.civAliases });
  }
  if (config.theme) applyTheme(config.theme);
  for (const key of Object.keys(rivalOptions)) {
    if (config[key] !== undefined) rivalOptions[key] = Boolean(config[key]);
  }
  if (config.smartTips !== undefined) smartTipsEnabled = Boolean(config.smartTips);
  if (config.civRecommender !== undefined) civRecommenderEnabled = Boolean(config.civRecommender);
  if (config.scoutF2 !== undefined) scoutF2Enabled = Boolean(config.scoutF2);
  if (config.tgBalance !== undefined) balanceEnabled = Boolean(config.tgBalance);
  if (config.postMatch !== undefined) postMatchEnabled = Boolean(config.postMatch);
  if (config.product) postMatchAccess = {
    comparison: Boolean(config.product.featureAccess.postMatchComparison && config.postMatchComparison),
    replay: Boolean(config.product.featureAccess.postMatchReplay && config.postMatchReplay),
    comparisonReason: config.product.featureAccess.postMatchComparison ? 'disabled' : 'pro',
    replayReason: config.product.featureAccess.postMatchReplay ? 'disabled' : 'pro',
  };
  if (postMatchPayload) renderPostMatch(postMatchPayload);
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
if (window.overlay.onPostMatch) window.overlay.onPostMatch(renderPostMatch);
// La X vive dentro del informe. El main habilita el mouse solo mientras el
// informe está abierto; al cerrarlo vuelve el click-through del overlay.
if (postMatchEl) {
  postMatchEl.addEventListener('click', (event) => {
    const target = event.target && event.target.closest
      ? event.target.closest('[data-postmatch-close]')
      : null;
    if (!target) return;
    event.preventDefault();
    if (window.overlay.dismissPostMatch) window.overlay.dismissPostMatch();
  });
}
if (window.overlay.onView) window.overlay.onView(applyView);
// F2: el main posee el estado (el renderer se puede recargar en caliente).
if (window.overlay.onDetail) window.overlay.onDetail((payload) => setDetail(payload && payload.detail));
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
