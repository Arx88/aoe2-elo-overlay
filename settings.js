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
const exampleUser = el('exampleUser');
const exampleBtn = el('exampleBtn');
const exampleControls = el('exampleControls');
const exampleClockEl = el('exampleClock');
const exampleMeta = el('exampleMeta');
const exampleStopBtn = el('exampleStopBtn');
const exampleStatusEl = el('exampleStatus');
const clockButtons = [...exampleClockEl.querySelectorAll('button[data-clock]')];
const rivalInputs = {
  rivalCivs: el('rivalCivs'),
  rivalFavorites: el('rivalFavorites'),
  rivalOpenings: el('rivalOpenings'),
};
const RIVAL_LABELS = {
  rivalCivs: 'Últimas 5 civis del rival',
  rivalFavorites: 'Civ y mapa más usados',
  rivalOpenings: 'Aperturas reales',
};

const themeButtons = [...document.querySelectorAll('.theme')];

let results = [];
let activeIndex = -1;
let searchTimer = null;
let searchToken = 0;
let currentTheme = initialTheme;
let opacityTimer = null;
let lastDiag = null;
let moving = false;
let matchStartedAt = null;
let frozenElapsedMs = null; // reloj congelado del Modo ejemplo
let exampleInfo = null;
let exampleBusy = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function setExampleStatus(message, isError = false) {
  exampleStatusEl.textContent = message;
  exampleStatusEl.classList.toggle('error', Boolean(isError));
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
    // Se pinta esta ventana al toque y después se guarda.
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

  // Debounce: mientras arrastrás no se manda una IPC por píxel.
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
  // En el ejemplo congelado el reloj NO avanza: muestra 0:03 / 0:21 fijos.
  if (frozenElapsedMs != null) {
    const fixed = Math.max(0, Math.floor(frozenElapsedMs / 1000));
    return `${Math.floor(fixed / 60)}:${String(fixed % 60).padStart(2, '0')} (fijo)`;
  }
  if (!Number.isFinite(startedAt) || startedAt <= 0) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function paintClock() {
  matchClock.textContent = clockText(matchStartedAt);
}

// El reloj se actualiza solo: main manda el timestamp real una sola vez.
// En el ejemplo llega además `elapsedMs` fijo para que no siga contando.
window.settings.onClock((payload) => {
  if (payload && typeof payload === 'object') {
    matchStartedAt = Number.isFinite(payload.startedAt) && payload.startedAt > 0
      ? payload.startedAt
      : null;
    frozenElapsedMs = Number.isFinite(payload.elapsedMs) ? payload.elapsedMs : null;
  } else {
    matchStartedAt = Number.isFinite(payload) && payload > 0 ? payload : null;
    frozenElapsedMs = null;
  }
  paintClock();
});

setInterval(() => {
  paintPoll();
  paintClock();
}, 1000);

logBtn.addEventListener('click', () => window.settings.openLog());

/* ---------- opciones durante la partida ---------- */
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

/* ---------- informe opcional del rival ---------- */
for (const [key, input] of Object.entries(rivalInputs)) {
  input.addEventListener('change', () =>
    applyToggle(input, (on) => window.settings.rivalOption(key, on), RIVAL_LABELS[key]),
  );
}

/* ---------- Modo ejemplo ---------- */
function exampleDate(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  try {
    return new Date(timestamp).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function paintExample() {
  const active = Boolean(exampleInfo && exampleInfo.active);
  exampleControls.hidden = !active;
  exampleStopBtn.disabled = !active || exampleBusy;
  for (const button of clockButtons) {
    button.classList.toggle('active', active && button.dataset.clock === String(exampleInfo.clock));
    button.disabled = !active || exampleBusy;
  }
  if (!active) {
    exampleMeta.replaceChildren();
    return;
  }

  const info = exampleInfo;
  if (!exampleUser.value) exampleUser.value = String(info.profileId || '');
  const fecha = exampleDate(info.realStartedAt);
  const estado = info.alreadyFinished ? 'ya terminó · se usa como ejemplo' : 'partida en curso';
  exampleMeta.innerHTML =
    `<div><b>${escapeHtml(info.name || 'Perfil')}</b> · #${escapeHtml(info.profileId)}</div>` +
    `<div>Partida real <b>#${escapeHtml(info.matchId)}</b> · <b>${escapeHtml(info.mapName)}</b> · ` +
    `${escapeHtml(info.leaderboardName)} · ${escapeHtml(info.players)} jugadores</div>` +
    `<div>${fecha ? `Jugada el ${escapeHtml(fecha)}` : 'Sin fecha'} · ${escapeHtml(estado)}</div>` +
    `<div>Reloj de prueba: <b>${escapeHtml(info.clockText)}</b> · ` +
    `${escapeHtml(info.source || 'datos reales')}</div>`;
}

async function runExample() {
  const query = exampleUser.value.trim();
  if (!query) {
    setExampleStatus('Escribí un nombre de jugador o un profile ID.', true);
    exampleUser.focus();
    return;
  }

  exampleBusy = true;
  exampleBtn.disabled = true;
  exampleBtn.textContent = 'Cargando…';
  setExampleStatus('Buscando el perfil y su última partida real…');
  paintExample();

  try {
    const response = await window.settings.exampleStart(
      query,
      exampleInfo ? exampleInfo.clock : '3',
    );
    if (!response.ok) {
      setExampleStatus(response.error || 'No se pudo armar el ejemplo.', true);
      return;
    }
    exampleInfo = response.example;
    setExampleStatus(
      `Listo: ${exampleInfo.name} · partida real #${exampleInfo.matchId}. Mirá el panel del juego.`,
    );
  } catch (err) {
    setExampleStatus(`No se pudo armar el ejemplo: ${err.message}`, true);
  } finally {
    exampleBusy = false;
    exampleBtn.disabled = false;
    exampleBtn.textContent = 'Ver test';
    paintExample();
  }
}

exampleBtn.addEventListener('click', runExample);
exampleUser.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runExample();
  }
});

for (const button of clockButtons) {
  button.addEventListener('click', async () => {
    if (!exampleInfo || exampleBusy) return;
    exampleBusy = true;
    paintExample();
    try {
      const response = await window.settings.exampleClock(button.dataset.clock);
      if (!response.ok) {
        setExampleStatus(response.error || 'No se pudo cambiar el reloj.', true);
        return;
      }
      exampleInfo = response.example;
      setExampleStatus(`Reloj de ejemplo: ${exampleInfo.clockText}.`);
    } catch (err) {
      setExampleStatus(`No se pudo cambiar el reloj: ${err.message}`, true);
    } finally {
      exampleBusy = false;
      paintExample();
    }
  });
}

exampleStopBtn.addEventListener('click', async () => {
  const response = await window.settings.exampleStop();
  if (!response.ok) {
    setExampleStatus(response.error || 'No se pudo terminar el ejemplo.', true);
    return;
  }
  exampleInfo = null;
  frozenElapsedMs = null;
  paintExample();
  setExampleStatus('Ejemplo terminado: el panel volvió a tu partida real.');
});

// El main avisa también cuando el ejemplo arranca desde la línea de comandos.
window.settings.onExample((info) => {
  exampleInfo = info;
  paintExample();
  if (info) setExampleStatus(`Ejemplo activo: ${info.name} · partida real #${info.matchId}.`);
  else setExampleStatus('Ejemplo terminado.');
});

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
  // La ruta se trunca con "…" para no romper el pie en dos líneas; el tooltip
  // conserva el path completo por si hay que abrir la carpeta a mano.
  configPathEl.title = info.configPath || '';
  if (info.version) versionEl.textContent = `v${info.version}`;

  applyTheme(info.theme || currentTheme);
  paintOpacity(Number(info.opacity) || 0.95);
  renderDiag(info.diagnostics || {});
  paintPosition(info);
  civHelpInput.checked = Boolean(info.civHelp);
  hideEloInput.checked = Boolean(info.hideEloAt20);
  for (const [key, input] of Object.entries(rivalInputs)) input.checked = Boolean(info[key]);
  exampleInfo = info.example || null;
  paintExample();
  matchStartedAt = Number.isFinite(info.matchStartedAt) && info.matchStartedAt > 0
    ? info.matchStartedAt
    : null;
  frozenElapsedMs = Number.isFinite(info.exampleClockElapsedMs) ? info.exampleClockElapsedMs : null;
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

  // Con el modo mover activo, Esc confirma la posición en vez de cerrar.
  if (moving) {
    setMoving(false);
    return;
  }
  window.settings.close();
});

paintThemes();
paintOpacity(0.95);
loadCurrent();
