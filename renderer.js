'use strict';

const stage = document.getElementById('stage');
const panel = document.getElementById('panel');
const head = document.getElementById('head');
const rowsEl = document.getElementById('rows');
const footText = document.getElementById('foottext');
const civHelpEl = document.getElementById('civHelp');
const civHelpGrid = document.getElementById('civhelpGrid');
const civHelpClock = document.getElementById('civhelpClock');
const civHelpBar = document.getElementById('civhelpBar');
const rivalInfoEl = document.getElementById('rivalInfo');
const rivalGrid = document.getElementById('rivalGrid');
const rivalSource = document.getElementById('rivalSource');
const scoutInfoEl = document.getElementById('scoutInfo');
const scoutGrid = document.getElementById('scoutGrid');
const updateToastEl = document.getElementById('updateToast');
const updateToastText = document.getElementById('updateToastText');

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
  requestAnimationFrame(reportHeight);
}

function showUpdateToast(payload) {
  if (!updateToastEl || !updateToastText) return;
  if (!payload || payload.visible === false) {
    hideUpdateToast();
    return;
  }
  if (lastState && lastState.status === 'ongoing') {
    hideUpdateToast();
    return;
  }
  const version = payload.version || '';
  updateToastText.textContent = payload.kind === 'ready'
    ? `Actualización v${version} lista · se instala al salir`
    : `Actualización v${version} disponible · abrí Updater en la configuración`;
  updateToastEl.hidden = false;
  requestAnimationFrame(reportHeight);
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
let rivalOptions = { rivalCivs: false, rivalFavorites: false, rivalOpenings: false };
// Recomendaciones inteligentes: llegan por `overlay:scout`; solo pre-partida.
let scoutPayload = null;
let smartTipsEnabled = false;

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
  const fact = (label, value, kind, dropLast = true) =>
    `<div class="civhelp-fact ${kind}">` +
    `<span class="civhelp-key">${label}</span>` +
    `<span class="civhelp-val">${escapeHtml(summarize(value, 108, dropLast))}</span>` +
    '</div>';

  return (
    '<article class="civhelp-civ">' +
    '<div class="civhelp-civ-head">' +
    shield +
    `<div class="civhelp-ident"><div class="civhelp-name">${escapeHtml(name)}${tag}</div>` +
    `<div class="civhelp-role">${escapeHtml(role)}</div></div>` +
    '</div>' +
    fact('BONOS', entry.bonuses, 'good') +
    fact('UNIDADES', entry.units, 'unit', false) +
    fact('DEBILIDADES', entry.weaknesses, 'bad') +
    '</article>'
  );
}

/** Escudos de AMBAS civs (o las únicas de un TG), la tuya primero. */
function renderCivHelp() {
  if (!civHelpEl) return;
  if (!civView.civHelpVisible || !lastState || lastState.status !== 'ongoing' || moving) {
    civHelpEl.hidden = true;
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
  civHelpEl.hidden = false;
  requestAnimationFrame(reportHeight);
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
  return rivalOptions.rivalCivs || rivalOptions.rivalFavorites || rivalOptions.rivalOpenings;
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
  replays: 'Analizando replays…',
  tips: 'Analizando replays del rival…',
};

/** Qué etapa está pendiente (o null si ya está todo). */
function analysisStage() {
  if (!lastState || lastState.status !== 'ongoing' || moving) return null;
  // 1) El roster ya está en pantalla y faltan los números de ELO.
  if (lastState.pending) return 'elo';
  // 2) Informe del rival: primero civs/favoritos, después las aperturas.
  if (rivalEnabled()) {
    const reports = rivalPayload && Array.isArray(rivalPayload.reports) ? rivalPayload.reports : [];
    if (!reports.length || reports.some((report) => report.loading)) return 'rival';
    if (rivalOptions.rivalOpenings && rivalPayload && rivalPayload.pendingOpenings) return 'replays';
  }
  // 3) Consejo pre-partida: solo existe mientras la fase sea `lobby`.
  if (smartTipsEnabled && lastState.phase === 'lobby') {
    const tips = scoutPayload && Array.isArray(scoutPayload.tips) ? scoutPayload.tips : [];
    if (!tips.length || tips.some((tip) => tip.loading)) return 'tips';
    if (scoutPayload && scoutPayload.pending) return 'tips';
  }
  return null;
}

function renderAnalysis() {
  if (!analysisEl) return;
  const stage = analysisStage();
  if (!stage) {
    if (!analysisEl.hidden) {
      analysisEl.hidden = true;
      requestAnimationFrame(reportHeight);
    }
    return;
  }
  if (analysisLabel) analysisLabel.textContent = ANALYSIS_LABELS[stage] || 'Analizando…';
  if (analysisEl.hidden) {
    analysisEl.hidden = false;
    requestAnimationFrame(reportHeight);
  }
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

function rivalBlock(label, body, extraClass = '', badge = '') {
  return (
    `<div class="rival-block ${extraClass}">` +
    `<div class="rival-key">${escapeHtml(label)}${badge ? `<span class="rival-badge">${escapeHtml(badge)}</span>` : ''}</div>` +
    body +
    '</div>'
  );
}

function rivalHistoryBlock(report) {
  const rows = Array.isArray(report.history) ? report.history : [];
  if (report.loading) {
    return rivalBlock(
      'ÚLTIMAS 5 CIVS',
      `<div class="rival-empty">Buscando sus últimas civs…</div>`,
    );
  }
  if (!rows.length) {
    const msg = report.mode && report.mode.label
      ? `Sin partidas públicas recientes en ${report.mode.label}.`
      : 'Sin historial público reciente.';
    return rivalBlock('ÚLTIMAS 5 CIVS', `<div class="rival-empty">${escapeHtml(msg)}</div>`);
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
  return rivalBlock('ÚLTIMAS 5 CIVS', `<div class="rival-civ-list">${items}</div>`, 'civs');
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
      'EN ESTE MAPA',
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
      'EN ESTE MAPA',
      '<div class="rival-empty">Esperando el mapa de la partida…</div>',
      'favs',
    );
  }
  const games = map && Number(map.games) > 0 ? Number(map.games) : 0;
  if (!games) {
    return rivalBlock(
      'EN ESTE MAPA',
      `<div class="rival-empty">Sin partidas públicas en ${escapeHtml(mapName)}.</div>`,
      'favs',
    );
  }

  // Dos frases en vez de dos filas etiqueta/valor. Antes había que cruzar
  // "9 pj · 33 % wr" con "2 de 8" para entender qué decía el informe; ahora
  // la conclusión está escrita y los números llevan su récord al lado.
  const rate = map.winRate != null ? Number(map.winRate) : null;
  const tone = rate == null ? null : rate < 40 ? 'le va mal' : rate >= 60 ? 'le va bien' : 'va parejo';
  const head =
    rate == null
      ? `En ${mapName} jugó ${gamesText(games)}${recordText(games, map.wins, null)}.`
      : `En ${mapName} ${tone}: ${fmtNumber(rate)} % en ${gamesText(games)}` +
        `${recordText(games, map.wins, rate)}.`;
  const civ = map.civ;
  const civLine =
    civ && civ.name && Number(civ.games) > 0
      ? `<span>Usa <b>${escapeHtml(civ.name)}</b> ahí: ${escapeHtml(gamesText(civ.games))}` +
        `${civ.winRate != null ? `, gana el ${escapeHtml(fmtNumber(civ.winRate))} %` : ''}` +
        `${escapeHtml(recordText(civ.games, civ.wins, civ.winRate))}.</span>`
      : '';
  const verdict = `<div class="rival-verdict"><b>${escapeHtml(head)}</b>${civLine}</div>`;

  // La apertura tiene su PROPIO bloque cuando hay replays. Si no hay, se dice
  // una sola vez acá: antes quedaban dos avisos iguales seguidos (mapa y
  // aperturas) y el informe parecía roto.
  let note = '';
  if (rivalOptions.rivalOpenings) {
    const openings = report.openings;
    const pending = Boolean(rivalPayload && rivalPayload.pendingOpenings);
    const hasOpening = Boolean(openings && openings.mapCivFavorite) &&
      Number(openings.mapCivAnalyzed) > 0;
    if (!hasOpening && !pending) {
      note =
        openings && openings.ok === false
          ? '<div class="rival-empty">Aperturas no disponibles ahora mismo.</div>'
          : '<div class="rival-empty">Sin replays de ' +
            `${escapeHtml(civ ? civ.name : 'su civ')} en ${escapeHtml(mapName)} ` +
            'para leer su apertura.</div>';
    }
  }

  return rivalBlock('EN ESTE MAPA', verdict + note, 'favs');
}

function rivalOpeningsBlock(report, pending) {
  const openings = report.openings;
  const mode = (openings && openings.mode) || report.mode || null;
  const mapName =
    (report.mapStats && report.mapStats.name) ||
    (lastState && lastState.match && lastState.match.mapName) ||
    null;
  const title = 'APERTURA EN ESTE MAPA';
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
  const top =
    `<div class="rival-opening-top" title="${escapeHtml(`Apertura ${scope}`)}">` +
    `<b>${escapeHtml(best.short || best.name)}</b>` +
    `<span>${escapeHtml(fmtNumber(best.count))} de ${escapeHtml(fmtNumber(baseCount))}` +
    `${best.share != null ? ` · ${escapeHtml(fmtNumber(best.share))}%` : ''}</span>` +
    '</div>';
  const chips = (Array.isArray(openings.recent) ? openings.recent : [])
    .slice(0, 5)
    .map((item) => {
      const tip = `${item.name || item.short || ''}${item.civ ? ` · ${item.civ}` : ''}${item.map ? ` · ${item.map}` : ''}${item.ladder ? ` · ${item.ladder}` : ''}`;
      return `<span class="rival-chip" title="${escapeHtml(tip)}">${escapeHtml(item.short || item.name)}</span>`;
    })
    .join('');
  const recent = chips ? `<div class="rival-chip-list"><span class="rival-sub">ÚLTIMAS DE ESA CIV</span>${chips}</div>` : '';
  return rivalBlock(
    title,
    top + recent,
    'openings',
    `${fmtNumber(openings.mapCivAnalyzed)} replays de ${civName || 'esa civ'}`,
  );
}

function rivalCard(report) {
  const name = report.name || `Perfil ${report.profileId || '?'}`;
  const blocks = [];
  // La conclusión va primero: qué se juega en este mapa se lee antes que el historial.
  if (rivalOptions.rivalFavorites) blocks.push(rivalMapBlock(report));
  if (rivalOptions.rivalCivs) blocks.push(rivalHistoryBlock(report));
  if (rivalOptions.rivalOpenings) {
    blocks.push(rivalOpeningsBlock(report, Boolean(rivalPayload && rivalPayload.pendingOpenings)));
  }
  return (
    '<article class="rival-card">' +
    '<div class="rival-card-head">' +
    `<span class="rival-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>` +
    (report.civ
      ? `<span class="rival-now">${rivalShield(report.civ, 'rival-shield xs')}<span>${escapeHtml(report.civ)}</span></span>`
      : '') +
    '</div>' +
    blocks.filter(Boolean).join('') +
    '</article>'
  );
}

function renderRivalInfo() {
  if (!rivalInfoEl) return;
  const active =
    rivalEnabled() &&
    lastState &&
    lastState.status === 'ongoing' &&
    !moving &&
    !civView.eloHidden;
  if (!active) {
    rivalInfoEl.hidden = true;
    return;
  }

  const reports = rivalPayload && Array.isArray(rivalPayload.reports) ? rivalPayload.reports : [];
  rivalInfoEl.classList.toggle('single', reports.length <= 1);
  rivalGrid.innerHTML = reports.length
    ? reports.map(rivalCard).join('')
    : `<div class="rival-empty">Buscando los datos del rival…</div>`;
  if (rivalSource) {
    rivalSource.textContent = rivalOptions.rivalOpenings
      ? 'AoE2 Companion · AoE2Insights'
      : 'AoE2 Companion';
  }
  rivalInfoEl.hidden = false;
  renderAnalysis();
  requestAnimationFrame(reportHeight);
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

function scoutLine(text, sub) {
  return (
    `<div class="scout-line">` +
    (sub ? `<span class="rival-sub">${escapeHtml(sub)}</span>` : '') +
    `<span>${escapeHtml(text)}</span></div>`
  );
}

function scoutTipLines(tip) {
  if (!tip) return ['<div class="rival-empty">Sin datos.</div>'];
  if (tip.loading) {
    return [`<div class="rival-empty">Analizando replays del rival…</div>`];
  }
  if (tip.modeUnavailable) {
    return ['<div class="rival-empty">Solo en partidas ranked: en custom no se mezclan modos.</div>'];
  }
  if (tip.error) return ['<div class="rival-empty">Replays no disponibles ahora mismo.</div>'];
  if (!tip.sample) {
    return [
      `<div class="rival-empty">Sin replays analizados de este rival` +
        `${tip.mode ? ` en ${escapeHtml(tip.mode.label)}` : ''}.</div>`,
    ];
  }

  const lines = [];
  const where = tip.scopeLabel || '';
  if (tip.winRate != null) {
    lines.push(scoutLine(`Gana el ${fmtNumber(tip.winRate)}%${where ? ` ${where}` : ''}`, `${fmtNumber(tip.sample)} PJ`));
  }
  if (tip.weakAgainst && tip.weakAgainst.length) {
    const civs = tip.weakAgainst
      .map((row) => `${row.civ} (pierde ${fmtNumber(row.lossRate)}% · ${fmtNumber(row.games)} pj)`)
      .join(' · ');
    lines.push(scoutLine(civs, 'LE CUESTAN'));
  }
  if (tip.openingsAgainst && tip.openingsAgainst.length) {
    const scope = tip.openingsAgainst[0].scope === 'modo' ? ' · todo el modo' : '';
    const openings = tip.openingsAgainst
      .map((row) => `${row.short || row.name} ${fmtNumber(row.lossRate)}% (${fmtNumber(row.games)} pj)`)
      .join(' · ');
    lines.push(scoutLine(`${openings}${scope}`, 'APERTURAS QUE LE DUELEN'));
  }
  if (tip.tempo) {
    const diff = tip.tempo.longWinRate - tip.tempo.shortWinRate;
    if (diff >= 10) {
      lines.push(
        scoutLine(
          `Le salen mejor las largas: ${fmtNumber(tip.tempo.longWinRate)}% si pasa de 25 min ` +
            `(${fmtNumber(tip.tempo.shortWinRate)}% en cortas)`,
          'RITMO',
        ),
      );
    } else if (diff <= -10) {
      lines.push(
        scoutLine(
          `Le cuestan las largas: ${fmtNumber(tip.tempo.shortWinRate)}% antes de 15 min ` +
            `(${fmtNumber(tip.tempo.longWinRate)}% si se alarga)`,
          'RITMO',
        ),
      );
    }
  }
  return lines.length ? lines : ['<div class="rival-empty">Sin punto débil claro en su historial.</div>'];
}

function scoutCard(tip) {
  const name = tip.name || `Perfil ${tip.profileId || '?'}`;
  return (
    '<article class="rival-card">' +
    '<div class="rival-card-head">' +
    `<span class="rival-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>` +
    '</div>' +
    `<div class="rival-block tips">${scoutTipLines(tip).join('')}</div>` +
    '</article>'
  );
}

function renderScoutInfo() {
  if (!scoutInfoEl) return;
  const active =
    smartTipsEnabled &&
    lastState &&
    lastState.status === 'ongoing' &&
    lastState.phase === 'lobby' &&
    !moving;
  if (!active) {
    scoutInfoEl.hidden = true;
    return;
  }
  const tips = scoutPayload && Array.isArray(scoutPayload.tips) ? scoutPayload.tips : [];
  scoutInfoEl.classList.toggle('single', tips.length <= 1);
  scoutGrid.innerHTML = tips.length
    ? tips.map(scoutCard).join('')
    : `<div class="rival-empty">Preparando el consejo del rival…</div>`;
  scoutInfoEl.hidden = false;
  renderAnalysis();
  requestAnimationFrame(reportHeight);
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
  panel.classList.toggle('elo-hidden', civView.eloHidden);
  document.body.classList.toggle('elo-hidden', civView.eloHidden);
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
  // El informe del rival se oculta junto con el ELO a 0:20.
  renderRivalInfo();
  renderAnalysis();
  requestAnimationFrame(reportHeight);
}

function reportHeight() {
  // Mide TODO el stage: si el ELO está oculto a 0:20, la ventana se achica
  // sola y deja de estorbar; si vuelve la tarjeta de civ, vuelve a crecer.
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

function renderOngoing(state) {
  // `ladder` es el MODO de la partida (RM team, EW 1v1, Unranked…). El ELO,
  // el pico y el rank que se ven abajo son SIEMPRE de RM 1v1, por eso el tag.
  const ladder = state.ladder || { label: state.match.leaderboardName, source: 'ranked' };
  const eloLabel = (state.eloLadder && state.eloLadder.label) || 'RM 1v1';
  const inLobby = state.phase === 'lobby';
  const example = state.example || null;
  const title = inLobby
    ? `Partida encontrada · ${ladder.label}`
    : `${state.match.mapName} · ${ladder.label}`;
  // El Modo ejemplo se distingue a simple vista: los DATOS son reales, lo que
  // se simula es el reloj. Hay que decirlo para no confundirlo con una partida.
  const badge = example
    ? '<span class="example-badge" title="Última partida real de este perfil · reloj de prueba">EJEMPLO</span>'
    : '';
  head.innerHTML =
    badge +
    `<span class="head-title">${escapeHtml(title)}</span>` +
    `<span class="elo-tag">ELO ${escapeHtml(eloLabel)}</span>`;

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
      const peak = player.peak ? `pico ${fmtNumber(player.peak)}` : waiting ? '…' : '—';
      return `${divider}
        <div class="row${player.isYou ? ' you' : ''}">
          <span class="dot"></span>
          <span class="name">${name}${badge}</span>
          ${civ}
          <span class="elo">${elo}</span>
          ${rank}
          <span class="peak">${peak}</span>
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
  // El consejo pre-partida se reevalúa con CADA estado: cuando la fase deja
  // de ser `lobby` (la partida arrancó), el bloque desaparece acá mismo.
  renderScoutInfo();
  renderAnalysis();
  requestAnimationFrame(reportHeight);
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
  if (config.moving !== undefined) setMoving(config.moving);
  document.documentElement.style.setProperty('--scale', String(config.scale || 1));

  // Cambiar de diseño o de dataset cambia la altura de la tarjeta.
  renderCivHelp();
  renderRivalInfo();
  renderScoutInfo();
  renderAnalysis();
  if (lastState) render(lastState);
  requestAnimationFrame(reportHeight);
});

window.overlay.onState(render);
window.overlay.onUpdate(showUpdateToast);
window.overlay.onMovable(setMoving);
if (window.overlay.onView) window.overlay.onView(applyView);
if (window.overlay.onRival) {
  window.overlay.onRival((payload) => {
    rivalPayload = payload;
    renderRivalInfo();
    requestAnimationFrame(reportHeight);
  });
}
if (window.overlay.onScout) {
  window.overlay.onScout((payload) => {
    scoutPayload = payload;
    renderScoutInfo();
    requestAnimationFrame(reportHeight);
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
