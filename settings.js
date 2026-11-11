'use strict';

// El diseño llega por query (?theme=) para aplicarlo antes del primer paint.
const initialTheme = new URLSearchParams(location.search).get('theme') || 'clasico';
document.body.dataset.theme = initialTheme;

const el = (id) => document.getElementById(id);

const currentName = el('currentName');
const currentId = el('currentId');
const currentOrigin = el('currentOrigin');
const searchInput = el('search');
const resultsEl = el('results');
const manualInput = el('manualId');
const manualBtn = el('manualBtn');
const autoBtn = el('autoBtn');
const statusEl = el('status');
const configPathEl = el('configPath');
const versionEl = el('version');
const opacityInput = el('opacity');
const opacityValue = el('opacityValue');
const diagProfile = el('diagProfile');
const diagPoll = el('diagPoll');
const diagMatch = el('diagMatch');
const logBtn = el('logBtn');
const moveBtn = el('moveBtn');
const positionInfo = el('positionInfo');
const civHelpInput = el('civHelp');
const hideEloInput = el('hideEloAt20');
const matchClock = el('matchClock');
const rivalInputs = {
  rivalCivs: el('rivalCivs'),
  rivalFavorites: el('rivalFavorites'),
  rivalOpenings: el('rivalOpenings'),
};
const RIVAL_LABELS = {
  rivalCivs: 'Últimas 5 civs del rival',
  rivalFavorites: 'Civ y mapa más usados',
  rivalOpenings: 'Aperturas reales',
};
const themeButtons = [...document.querySelectorAll('.theme')];
const navButtons = [...document.querySelectorAll('.nav-item')];
const pageSections = [...document.querySelectorAll('.page')];
const pagesEl = document.querySelector('.pages');
const pageTitle = el('pageTitle');
const pageSub = el('pageSub');

let results = [];
let activeIndex = -1;
let searchTimer = null;
let searchToken = 0;
let currentTheme = initialTheme;
let opacityTimer = null;
let lastDiag = null;
let moving = false;
let matchStartedAt = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function paintThemes() {
  for (const button of themeButtons) {
    button.classList.toggle('active', button.dataset.theme === currentTheme);
  }
}

function applyTheme(theme) {
  currentTheme = theme || 'clasico';
  document.body.dataset.theme = currentTheme;
  paintThemes();
}

function paintOpacity(value) {
  const percent = Math.round(value * 100);
  opacityValue.textContent = `${percent}%`;
  opacityInput.style.setProperty('--fill', `${percent}%`);
}

/* ---------- diseño ---------- */
for (const button of themeButtons) {
  button.addEventListener('click', async () => {
    applyTheme(button.dataset.theme);
    const response = await window.settings.theme(button.dataset.theme);
    if (!response.ok) {
      setStatus(response.error || 'No se pudo cambiar el diseño', true);
      return;
    }
    setStatus(`Diseño: ${button.querySelector('.tname').textContent}`);
  });
}

/* ---------- opacidad ---------- */
opacityInput.addEventListener('input', () => {
  const value = Number(opacityInput.value) / 100;
  paintOpacity(value);
  clearTimeout(opacityTimer);
  opacityTimer = setTimeout(async () => {
    const response = await window.settings.opacity(value);
    if (!response.ok) {
      setStatus(response.error || 'No se pudo aplicar la opacidad', true);
      return;
    }
    setStatus(`Opacidad: ${Math.round(response.opacity * 100)}%`);
  }, 120);
});

/* ---------- estado / diagnóstico ---------- */
function paintPoll() {
  if (!lastDiag || !lastDiag.lastPollAt) {
    diagPoll.textContent = 'esperando la primera consulta…';
    return;
  }
  const secs = Math.max(0, Math.round((Date.now() - lastDiag.lastPollAt) / 1000));
  const labels = {
    ongoing: 'en partida',
    idle: 'sin partida',
    error: 'error de red',
    'no-profile': 'sin cuenta',
  };
  diagPoll.textContent = `hace ${secs}s · ${labels[lastDiag.lastPollStatus] || lastDiag.lastPollStatus}`;
}

function renderDiag(diagnostics) {
  lastDiag = diagnostics;
  diagProfile.textContent = diagnostics.profileId
    ? `${diagnostics.alias || 'perfil'} (#${diagnostics.profileId})`
    : 'sin cuenta';
  diagMatch.textContent = diagnostics.lastMatch || '—';
  paintPoll();
}

function clockText(startedAt) {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function paintClock() {
  matchClock.textContent = clockText(matchStartedAt);
}

window.settings.onClock((payload) => {
  if (payload && typeof payload === 'object') {
    matchStartedAt = Number.isFinite(payload.startedAt) && payload.startedAt > 0
      ? payload.startedAt
      : null;
  } else {
    matchStartedAt = Number.isFinite(payload) && payload > 0 ? payload : null;
  }
  paintClock();
});

setInterval(() => {
  paintPoll();
  paintClock();
}, 1000);

logBtn.addEventListener('click', () => window.settings.openLog());

/* ---------- opciones ---------- */
async function applyToggle(input, invoke, label) {
  const wanted = input.checked;
  const response = await invoke(wanted);
  if (!response || !response.ok) {
    input.checked = !wanted;
    setStatus((response && response.error) || `No se pudo cambiar ${label}`, true);
    return;
  }
  setStatus(`${label}: ${wanted ? 'activado' : 'desactivado'}`);
}

civHelpInput.addEventListener('change', () =>
  applyToggle(civHelpInput, (on) => window.settings.civHelp(on), 'Ayuda de civ'),
);
hideEloInput.addEventListener('change', () =>
  applyToggle(hideEloInput, (on) => window.settings.hideEloAt20(on), 'Ocultar ELO a 0:20'),
);

for (const [key, input] of Object.entries(rivalInputs)) {
  input.addEventListener('change', () =>
    applyToggle(input, (on) => window.settings.rivalOption(key, on), RIVAL_LABELS[key]),
  );
}

/* ---------- posición ---------- */
function paintPosition(info) {
  const custom = info.position === 'custom' && Number.isFinite(Number(info.x));
  positionInfo.textContent = custom
    ? `Fija en ${Math.round(info.x)}, ${Math.round(info.y)} de la pantalla.`
    : 'Ahora está arriba al centro. Movelo y queda ahí para siempre.';
  moving = Boolean(info.moving);
  paintMoveButton();
}

function paintMoveButton() {
  moveBtn.textContent = moving ? 'Listo, quedar acá' : 'Mover el panel';
  moveBtn.classList.toggle('active', moving);
}

async function setMoving(on) {
  const response = await window.settings.move(on);
  moving = Boolean(response.moving);
  paintMoveButton();
  if (moving) {
    setStatus('Arrastrá el panel a donde quieras y tocá "Listo" (o Esc).');
    return;
  }
  setStatus('Posición guardada: el panel queda ahí y no vuelve a moverse.');
  await loadCurrent();
}

moveBtn.addEventListener('click', () => setMoving(!moving));

/* ---------- cuenta ---------- */
async function loadCurrent() {
  const info = await window.settings.get();
  configPathEl.textContent = info.configPath || '';
  configPathEl.title = info.configPath || '';
  if (info.version) versionEl.textContent = `v${info.version}`;

  applyTheme(info.theme || currentTheme);
  paintOpacity(Number(info.opacity) || 0.95);
  renderDiag(info.diagnostics || {});
  paintPosition(info);
  civHelpInput.checked = Boolean(info.civHelp);
  hideEloInput.checked = Boolean(info.hideEloAt20);
  for (const [key, input] of Object.entries(rivalInputs)) input.checked = Boolean(info[key]);
  matchStartedAt = Number.isFinite(info.matchStartedAt) && info.matchStartedAt > 0
    ? info.matchStartedAt
    : null;
  paintClock();

  if (info.profileId) {
    currentName.textContent = info.alias || `Perfil ${info.profileId}`;
    currentId.textContent = `#${info.profileId}`;
    currentOrigin.hidden = false;
    currentOrigin.textContent =
      info.origin === 'manual' ? 'elegida por vos' : 'detectada automáticamente';
  } else {
    currentName.textContent = 'Todavía no hay cuenta elegida';
    currentId.textContent = '';
    currentOrigin.hidden = true;
  }
}

function renderResults() {
  resultsEl.replaceChildren();
  results.forEach((profile, index) => {
    const row = document.createElement('div');
    row.className = `result${index === activeIndex ? ' active' : ''}`;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = profile.clan ? `${profile.clan} | ${profile.name}` : profile.name;

    const tag = document.createElement('span');
    tag.className = 'tag';
    const bits = [`#${profile.profileId}`];
    if (profile.country) bits.push(profile.country.toUpperCase());
    if (profile.games) bits.push(`${profile.games} pj`);
    tag.textContent = bits.join(' · ');

    row.append(name, tag);
    row.addEventListener('click', () => choose(profile.profileId));
    resultsEl.append(row);
  });
}

async function choose(profileId) {
  manualBtn.disabled = true;
  setStatus('Guardando…');
  const response = await window.settings.pick(profileId);
  manualBtn.disabled = false;
  if (!response.ok) {
    setStatus(response.error || 'No se pudo guardar el perfil', true);
    return;
  }
  setStatus(`Listo: ${response.alias || 'perfil'} (#${response.profileId})`);
  await loadCurrent();
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  clearTimeout(searchTimer);
  activeIndex = -1;
  if (query.length < 2) {
    results = [];
    renderResults();
    setStatus('');
    return;
  }
  const token = ++searchToken;
  searchTimer = setTimeout(async () => {
    const response = await window.settings.search(query);
    if (token !== searchToken) return;
    if (!response.ok) {
      results = [];
      renderResults();
      setStatus(response.error || 'No se pudo buscar', true);
      return;
    }
    results = response.results;
    activeIndex = results.length ? 0 : -1;
    renderResults();
    setStatus(results.length ? `${results.length} resultados` : 'Sin resultados para esa búsqueda');
  }, 320);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    if (!results.length) return;
    event.preventDefault();
    activeIndex = (activeIndex + 1) % results.length;
    renderResults();
  } else if (event.key === 'ArrowUp') {
    if (!results.length) return;
    event.preventDefault();
    activeIndex = (activeIndex - 1 + results.length) % results.length;
    renderResults();
  } else if (event.key === 'Enter') {
    if (activeIndex >= 0 && results[activeIndex]) choose(results[activeIndex].profileId);
  }
});

manualBtn.addEventListener('click', () => {
  const raw = manualInput.value.trim();
  if (!raw) {
    setStatus('Escribí un ID numérico', true);
    return;
  }
  choose(raw);
});

manualInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') manualBtn.click();
});

autoBtn.addEventListener('click', async () => {
  autoBtn.disabled = true;
  setStatus('Buscando la cuenta del juego en esta PC…');
  const response = await window.settings.auto();
  autoBtn.disabled = false;
  if (!response.ok) {
    setStatus(response.error || 'No se encontró ninguna cuenta', true);
    return;
  }
  setStatus(`Detectada: ${response.alias || 'sin alias'} (#${response.profileId})`);
  await loadCurrent();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (moving) {
    setMoving(false);
    return;
  }
  window.settings.close();
});

/* ============================================================
   Navegación del wizard: solo el rail, sin botones de pie.
   ============================================================ */
const PAGE_ORDER = ['player', 'overlay', 'skins', 'comandos', 'updater'];
const PAGE_META = {
  player: { title: 'Player Detection', sub: 'Detectá y elegí la cuenta que usa el overlay.' },
  overlay: { title: 'Overlay', sub: 'Qué se ve en COLA y al entrar a la partida.' },
  skins: { title: 'Skins', sub: 'Diseño, opacidad y posición del panel.' },
  comandos: { title: 'Comandos', sub: 'Atajos de teclado para abrir y cerrar.' },
  updater: { title: 'Updater', sub: 'Mantené la app al día.' },
};

let activePage = 'player';

function goTo(page) {
  if (!PAGE_META[page]) return;
  activePage = page;
  for (const button of navButtons) button.classList.toggle('active', button.dataset.page === page);
  for (const section of pageSections) section.classList.toggle('active', section.dataset.page === page);
  pageTitle.textContent = PAGE_META[page].title;
  pageSub.textContent = PAGE_META[page].sub;
  if (pagesEl) pagesEl.scrollTop = 0;
}

for (const button of navButtons) button.addEventListener('click', () => goTo(button.dataset.page));

/* ============================================================
   Updater: estado real de electron-updater. Nada inventado.
   ============================================================ */
const updCurrent = el('updCurrent');
const updLatest = el('updLatest');
const updPill = el('updPill');
const updPhase = el('updPhase');
const updPercent = el('updPercent');
const updFill = el('updFill');
const updNotes = el('updNotes');
const skipBtn = el('skipBtn');
const updateBtn = el('updateBtn');

let updaterState = null;

function renderUpdater(snapshot) {
  if (!snapshot) return;
  updaterState = snapshot;
  // Mensaje transitorio de versiones anteriores: nunca debe quedar colgado.
  if (statusEl.textContent.startsWith('Buscando actualizaciones')) setStatus('');
  updCurrent.textContent = snapshot.current || '—';
  updLatest.textContent = snapshot.latest || '—';

  updPill.classList.remove('muted', 'error');
  if (snapshot.error) {
    updPill.textContent = 'Error de consulta';
    updPill.classList.add('error');
  } else if (snapshot.ready) {
    updPill.textContent = 'Lista para instalar';
  } else if (snapshot.available) {
    updPill.textContent = 'Actualización disponible';
  } else if (snapshot.deferred) {
    updPill.textContent = 'Consulta pospuesta';
    updPill.classList.add('muted');
  } else if (!snapshot.active) {
    updPill.textContent = 'Solo en la app instalada';
    updPill.classList.add('muted');
  } else {
    updPill.textContent = 'Al día';
  }

  const percent = Math.max(0, Math.min(100, Math.round(Number(snapshot.percent) || 0)));
  updFill.style.setProperty('width', `${percent}%`);
  updPercent.textContent = snapshot.downloading || snapshot.ready ? `${percent}%` : '';

  if (snapshot.error) updPhase.textContent = snapshot.error;
  else if (!snapshot.active) updPhase.textContent = 'Las actualizaciones se consultan al abrir la app instalada.';
  else if (snapshot.ready) updPhase.textContent = 'Actualización descargada. Se instala al salir.';
  else if (snapshot.downloading) updPhase.textContent = 'Descargando paquete de actualización…';
  else if (snapshot.deferred) updPhase.textContent = 'Consulta pospuesta: hay partida en curso. Se reintenta solo.';
  else if (snapshot.checking) updPhase.textContent = 'Buscando una versión nueva…';
  else if (snapshot.available) updPhase.textContent = 'Hay una versión nueva disponible.';
  else updPhase.textContent = 'Estás usando la última versión.';

  const notes = Array.isArray(snapshot.notes) ? snapshot.notes.filter(Boolean) : [];
  updNotes.replaceChildren();
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = snapshot.active ? 'Sin notas publicadas para esta versión.' : 'Sin notas para mostrar.';
    updNotes.append(li);
  } else {
    for (const note of notes) {
      const li = document.createElement('li');
      li.textContent = note;
      updNotes.append(li);
    }
  }

  updateBtn.disabled = !snapshot.active;
  skipBtn.disabled = !snapshot.active;
  updateBtn.textContent = snapshot.ready
    ? 'Actualizar ahora'
    : snapshot.available
      ? 'Descargar'
      : snapshot.active
        ? 'Buscar actualizaciones'
        : 'No disponible';
}

window.settings.onUpdater(renderUpdater);
window.settings.updaterGet().then(renderUpdater).catch(() => {});

updateBtn.addEventListener('click', async () => {
  if (!updaterState || !updaterState.active) return;
  updateBtn.disabled = true;
  if (updaterState.ready) {
    updPhase.textContent = 'Instalando la actualización…';
    await window.settings.updaterInstall();
    return;
  }
  if (updaterState.available) {
    updPhase.textContent = 'Descargando paquete de actualización…';
    renderUpdater(await window.settings.updaterDownload());
  } else {
    // Feedback inmediato en el propio panel (no en la barra de estado, que
    // quedaba con el texto colgado). El IPC espera la consulta real y el
    // renderUpdater que llega después pisa este texto con el estado final.
    updPhase.textContent = 'Buscando una versión nueva…';
    renderUpdater(await window.settings.updaterCheck());
  }
});

skipBtn.addEventListener('click', async () => {
  renderUpdater(await window.settings.updaterSkip());
  setStatus('Omitida por ahora: no se instala al salir en esta sesión.');
});

paintThemes();
paintOpacity(0.95);
goTo('player');
loadCurrent();
