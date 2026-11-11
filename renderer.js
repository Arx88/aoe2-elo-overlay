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

function rivalBlock(label, body, extraClass = '', badge = '') {
  return (
    `<div class="rival-block ${extraClass}">` +
    `<div class="rival-key">${escapeHtml(label)}${badge ? `<span class="rival-badge">${escapeHtml(badge)}</span>` : ''}</div>` +
    body +
    '</div>'
  );
}

function rivalHistoryBlock(report) {
  const modeLabel = report.mode && report.mode.label ? ` · ${report.mode.label}` : '';
  const rows = Array.isArray(report.history) ? report.history : [];
  if (!rows.length) {
    const msg = report.mode && report.mode.label
      ? `Sin partidas públicas recientes en ${report.mode.label}.`
      : 'Sin historial público reciente.';
    return rivalBlock(`ÚLTIMAS 5 CIVS${modeLabel}`, `<div class="rival-empty">${escapeHtml(msg)}</div>`);
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
  return rivalBlock(`ÚLTIMAS 5 CIVS${modeLabel}`, `<div class="rival-civ-list">${items}</div>`, 'civs');
}

/**
 * SOLO el mapa de la partida: cuántas jugó y winrate ahí, más la civ que más
 * usó en ESE mapa. El mapa favorito global no se muestra: si no es el que se
 * está jugando, no sirve para preparar la partida.
 */
function rivalMapBlock(report) {
  const map = report.mapStats;
  const modeLabel = report.mode && report.mode.label ? ` · ${report.mode.label}` : '';
  const mapName =
    (map && map.name) ||
    (lastState && lastState.match && lastState.match.mapName) ||
    '—';
  if (!mapName || mapName === '—') {
    return rivalBlock(
      `EN ESTE MAPA${modeLabel}`,
      '<div class="rival-empty">Esperando el mapa de la partida…</div>',
      'favs',
    );
  }
  const games = map && Number(map.games) > 0 ? Number(map.games) : 0;
  if (!games) {
    return rivalBlock(
      `EN ESTE MAPA${modeLabel}`,
      `<div class="rival-empty">Sin partidas públicas en ${escapeHtml(mapName)}.</div>`,
      'favs',
    );
  }

  const mapRow =
    '<div class="rival-map-row">' +
    '<span class="rival-map-key">MAPA</span>' +
    `<span class="rival-map-name">${escapeHtml(mapName)}</span>` +
    `<span class="rival-fav-meta">${escapeHtml(fmtNumber(games))} pj` +
    `${map.winRate != null ? ` · ${escapeHtml(fmtNumber(map.winRate))}% wr` : ''}</span>` +
    '</div>';

  const civ = map.civ;
  const civRow = civ
    ? '<div class="rival-map-row" title="Civilización que más usó en todo el historial de este mapa y modo">' +
      '<span class="rival-map-key">CIV</span>' +
      rivalShield(civ.name, 'rival-shield sm') +
      `<span class="rival-fav-name">${escapeHtml(civ.name)}</span>` +
      `<span class="rival-fav-meta">${escapeHtml(fmtNumber(civ.games))} de ${escapeHtml(fmtNumber(map.sampleGames))}` +
      `${civ.winRate != null ? ` · ${escapeHtml(fmtNumber(civ.winRate))}% wr` : ''}</span>` +
      '</div>'
    : '<div class="rival-empty">Sin civ registrada en las últimas partidas de este mapa.</div>';

  // Estrategia con la civ que más usó en este mapa (replays analizados).
  let strategyRow = '';
  if (rivalOptions.rivalOpenings) {
    const openings = report.openings;
    const pending = Boolean(rivalPayload && rivalPayload.pendingOpenings);
    if (openings && openings.mapCivFavorite) {
      const best = openings.mapCivFavorite;
      strategyRow =
        '<div class="rival-map-row" title="Apertura detectada en replays de ' +
        escapeHtml(civ ? civ.name : '') + ' en ' + escapeHtml(mapName) + '">' +
        '<span class="rival-map-key">ESTRATEGIA</span>' +
        `<span class="rival-fav-name">${escapeHtml(best.short || best.name)}</span>` +
        `<span class="rival-fav-meta">${escapeHtml(fmtNumber(best.count))} de ${escapeHtml(fmtNumber(openings.mapCivAnalyzed))}` +
        `${best.share != null ? ` · ${escapeHtml(fmtNumber(best.share))}%` : ''}</span>` +
        '</div>';
    } else if (pending) {
      strategyRow = '<div class="rival-empty">Buscando replays en este mapa…</div>';
    } else if (openings && openings.ok === false) {
      strategyRow = '<div class="rival-empty">Aperturas no disponibles.</div>';
    } else if (civ) {
      strategyRow = `<div class="rival-empty">Sin replays analizados de ${escapeHtml(civ.name)} en este mapa.</div>`;
    }
  }

  return rivalBlock(`EN ESTE MAPA${modeLabel}`, mapRow + civRow + strategyRow, 'favs');
}

function rivalOpeningsBlock(report, pending) {
  const openings = report.openings;
  const mode = (openings && openings.mode) || report.mode || null;
  const modeLabel = mode && mode.label ? ` · ${mode.label}` : '';
  const mapName =
    (report.mapStats && report.mapStats.name) ||
    (lastState && lastState.match && lastState.match.mapName) ||
    null;
  const title = `APERTURA EN ESTE MAPA${modeLabel}`;
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
  if (!openings || openings.ok === false) {
    let msg = 'Sin replays analizados para este rival';
    if (openings && openings.error) msg += ` · ${openings.error}`;
    return rivalBlock(title, `<div class="rival-empty">${escapeHtml(msg)}</div>`, 'openings', 'AoE2Insights');
  }

  // SOLO replays de ESTE mapa. La apertura general del rival (la de todos
  // los mapas) no sirve para preparar la partida actual: un Scout rush en
  // Arabia no dice nada de lo que el rival hace en Arena.
  const civName = report.mapStats && report.mapStats.civ ? report.mapStats.civ.name : null;
  // Solo la apertura de ESA civ en ESE mapa. Si no hay replays de esa
  // combinación, no se cae ni a la apertura del mapa con otra civ ni a la
  // apertura general del rival.
  const best = openings.mapCivFavorite || null;
  const baseCount = Number(openings.mapCivAnalyzed) || 0;
  if (!best || !baseCount) {
    const where = mapName ? ` en ${mapName}` : '';
    const who = civName ? ` de ${civName}` : '';
    let msg = `Sin replays analizados${who}${where} para este rival.`;
    if (openings.discardedOtherModes > 0) {
      msg += ` · se descartaron ${fmtNumber(openings.discardedOtherModes)} de otros modos`;
    }
    return rivalBlock(
      title,
      `<div class="rival-empty">${escapeHtml(msg)}</div>`,
      'openings',
      'AoE2Insights',
    );
  }

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
  if (rivalOptions.rivalCivs) blocks.push(rivalHistoryBlock(report));
  if (rivalOptions.rivalFavorites) blocks.push(rivalMapBlock(report));
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
    blocks.join('') +
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
    : '<div class="rival-empty">Buscando los datos del rival…</div>';
  if (rivalSource) {
    rivalSource.textContent = rivalOptions.rivalOpenings
      ? 'AoE2 Companion · AoE2Insights'
      : 'AoE2 Companion';
  }
  rivalInfoEl.hidden = false;
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

  // El crédito ("By acido") vive en el mismo pie y no se toca acá.
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
  if (config.moving !== undefined) setMoving(config.moving);
  document.documentElement.style.setProperty('--scale', String(config.scale || 1));

  // Cambiar de diseño o de dataset cambia la altura de la tarjeta.
  renderCivHelp();
  renderRivalInfo();
  if (lastState) render(lastState);
  requestAnimationFrame(reportHeight);
});

window.overlay.onState(render);
window.overlay.onMovable(setMoving);
if (window.overlay.onView) window.overlay.onView(applyView);
if (window.overlay.onRival) {
  window.overlay.onRival((payload) => {
    rivalPayload = payload;
    renderRivalInfo();
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
