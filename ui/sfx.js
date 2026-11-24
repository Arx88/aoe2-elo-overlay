(function (root) {
  'use strict';

  /**
   * Motor de micro-sonidos táctiles premium para Relic (Web Audio 100% local, CSP-safe).
   * - Hover aterciopelado ultra-discreto en elementos interactivos (con anti-spam).
   * - Teclado estilo iPhone (clics orgánicos cálidos al escribir en buscadores e inputs,
   *   con variación diferenciada para teclas normales, espacio, retroceso y Enter).
   * - Secuencia de inicio minimalista (`bootLoad` + `bootReady`) y pulsos sutiles de carga (`progress`).
   * - Cobertura uniforme en pestañas, sub-pestañas, filas Master-Detail, tarjetas, toggles y sliders.
   */
  const STORAGE_KEY = 'aoe2helper.uiSounds';
  let ctx = null;
  let noiseBuf = null;
  let lastKeyAt = 0;
  let lastHoverAt = 0;
  let lastSliderAt = 0;
  let lastHoverEl = null;
  let idleSuspendTimer = null;
  let enabled = true;

  try {
    const saved = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
    if (saved === '0' || saved === 'false') enabled = false;
  } catch (_) { /* ignore */ }

  function ensureCtx() {
    if (!enabled) return null;
    const AudioCtx = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function ensureNoise(ac) {
    if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
    const length = Math.floor(ac.sampleRate * 0.035);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, 3.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    noiseBuf = buffer;
    return noiseBuf;
  }

  /** Pulso táctil ultra corto filtrado pasa-banda (cristal mate / háptico). */
  function hapticTick(centerFreq, q, duration, gainPeak, delay = 0) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = ensureNoise(ac);
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, t0);
    filter.Q.setValueAtTime(q, t0);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.0014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ac.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.006);
  }

  /** Nota cálida filtrada pasa-bajos, envolvente sedosa y volumen discreto. */
  function velvetTone(freqStart, freqEnd, duration, gainPeak, delay = 0, cutoff = 1800, wave = 'sine') {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(55, freqEnd), t0 + duration);
    }
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + Math.min(0.012, duration * 0.22));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(lp);
    lp.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.012);
  }

  /** Barrido armónico suave para secuencias de carga minimalistas. */
  function shimmerSweep(freqStart, freqEnd, cutoffStart, cutoffEnd, duration, gainPeak, delay = 0) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freqEnd), t0 + duration);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoffStart, t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, cutoffEnd), t0 + duration * 0.85);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + duration * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(lp);
    lp.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.015);
  }

  function play(kind) {
    if (!enabled) return;
    try {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (kind === 'hover') {
        if (now - lastHoverAt < 58) return;
        lastHoverAt = now;
        const j = 0.96 + Math.random() * 0.08;
        hapticTick(2850 * j, 3.4, 0.006, 0.0052, 0);
        velvetTone(1240 * j, 1340 * j, 0.014, 0.0016, 0, 2200);
      } else if (kind === 'key') {
        // Tecla estilo iPhone: pulso cristalino nítido + cuerpo cálido muy corto
        if (now - lastKeyAt < 34) return;
        lastKeyAt = now;
        const j = 0.94 + Math.random() * 0.12;
        hapticTick(2250 * j, 2.6, 0.0075, 0.015, 0);
        velvetTone(355 * j, 210 * j, 0.015, 0.011, 0, 1100);
      } else if (kind === 'keySpace') {
        if (now - lastKeyAt < 34) return;
        lastKeyAt = now;
        hapticTick(1780, 2.2, 0.009, 0.014, 0);
        velvetTone(270, 175, 0.018, 0.012, 0, 900);
      } else if (kind === 'keyBack') {
        if (now - lastKeyAt < 34) return;
        lastKeyAt = now;
        hapticTick(1420, 2.4, 0.008, 0.012, 0);
        velvetTone(250, 165, 0.016, 0.009, 0, 850);
      } else if (kind === 'keyEnter') {
        hapticTick(2050, 2.6, 0.009, 0.016, 0);
        velvetTone(640, 860, 0.048, 0.0085, 0.002, 2000);
      } else if (kind === 'tab') {
        hapticTick(1650, 2.2, 0.011, 0.015, 0);
        velvetTone(590, 520, 0.028, 0.0075, 0, 1500);
      } else if (kind === 'subtab') {
        hapticTick(2050, 2.6, 0.009, 0.012, 0);
        velvetTone(740, 820, 0.026, 0.006, 0, 1900);
      } else if (kind === 'select') {
        hapticTick(1820, 2.5, 0.010, 0.013, 0);
        velvetTone(620, 760, 0.042, 0.0075, 0.002, 1850);
      } else if (kind === 'slider') {
        if (now - lastSliderAt < 42) return;
        lastSliderAt = now;
        hapticTick(2500, 3.2, 0.0055, 0.0065, 0);
      } else if (kind === 'toggleOn') {
        hapticTick(1820, 2.5, 0.010, 0.012, 0);
        velvetTone(587.33, 640, 0.036, 0.009, 0.002, 1950);
        velvetTone(880, 880, 0.058, 0.008, 0.024, 2150);
      } else if (kind === 'toggleOff') {
        hapticTick(1280, 2.1, 0.010, 0.011, 0);
        velvetTone(520, 400, 0.042, 0.008, 0.002, 1450);
      } else if (kind === 'confirm') {
        hapticTick(1950, 2.6, 0.010, 0.011, 0);
        velvetTone(523.25, 523.25, 0.085, 0.010, 0.004, 1900);
        velvetTone(783.99, 783.99, 0.12, 0.0085, 0.040, 2250);
      } else if (kind === 'progress') {
        shimmerSweep(440, 659.25, 520, 1450, 0.24, 0.009, 0);
      } else if (kind === 'bootLoad') {
        // Barrido minimalista cálido mientras se llena la barrita dorada de inicio
        shimmerSweep(293.66, 440, 380, 1350, 0.48, 0.013, 0);
        velvetTone(587.33, 659.25, 0.34, 0.0055, 0.10, 1600);
      } else if (kind === 'bootReady') {
        // Resolución satisfactoria Obsidian-Gold al abrirse la aplicación lista
        hapticTick(2200, 3.0, 0.009, 0.008, 0);
        velvetTone(587.33, 587.33, 0.22, 0.011, 0.005, 1900); // D5
        velvetTone(880.0, 880.0, 0.30, 0.0095, 0.048, 2200);  // A5
        velvetTone(1174.66, 1174.66, 0.28, 0.0045, 0.088, 2600); // D6 halo
      } else if (kind === 'paceTick') {
        hapticTick(1850, 2.6, 0.010, 0.028, 0);
        velvetTone(660, 660, 0.065, 0.036, 0.002, 2000, 'sine');
      } else if (kind === 'paceSplit') {
        hapticTick(2100, 2.8, 0.011, 0.032, 0);
        velvetTone(587.33, 587.33, 0.14, 0.045, 0.002, 2100, 'triangle');
        velvetTone(880.0, 880.0, 0.22, 0.042, 0.065, 2400, 'sine');
      } else if (kind === 'quizHit') {
        hapticTick(2200, 2.8, 0.010, 0.028, 0);
        velvetTone(523.25, 523.25, 0.12, 0.044, 0, 2100, 'sine');
        velvetTone(783.99, 783.99, 0.20, 0.042, 0.055, 2500, 'sine');
      } else if (kind === 'quizMiss') {
        hapticTick(1100, 2.2, 0.012, 0.030, 0);
        velvetTone(290, 205, 0.18, 0.048, 0, 1300, 'triangle');
      } else if (kind === 'soft') {
        hapticTick(1520, 2.2, 0.0095, 0.011, 0);
      }
    } catch (_) { /* audio opcional */ }
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch (_) { /* ignore */ }
    if (enabled) play('toggleOn');
    return enabled;
  }

  const CLICK_SELECTOR = [
    'button', 'summary', '.result', '[role="tab"]', '[role="option"]',
    '.pm-stage-card', '.pm-medal-card', '.pm-issue-card',
    '.cx-kpi', '.cx-lm-metric', '.rm-card', '.theme',
    '.social-player-chip', '.rail-profile-card', '.cx-entity-row',
    '.tr-subtab', '.tr-ans-card', '.tr-action-chip', '.tr-step-row',
    '.tr-mode-pill', '.tr-replay-pill', '.tr-nemesis-pill', '.tr-war-switch',
  ].join(', ');

  const HOVER_SELECTOR = [
    '.nav-item', '.cx-subtab', '.cx-mode-tab', '.cx-sort-btn',
    '.cx-entity-row', '.cx-kpi', '.cx-lm-metric', '.social-player-chip',
    '.btn', '.rail-profile-card', '.rail-gear', '.pm-tab',
    '.pm-stage-card', '.pm-medal-card', '.rm-card', '.theme',
    '.result', '.prefs-lang-item', '.prefs-pop-link', '.acct-subtab',
    '.winbtn', '.tr-subtab', '.tr-ans-card', '.tr-action-chip',
    '.tr-step-adj', '.tr-step-row', '.tr-mode-pill', '.tr-replay-pill',
    '.tr-nemesis-pill', '.tr-war-switch', '.tr-mission-card',
  ].join(', ');

  function attachAutoListeners(doc) {
    const target = doc || root.document;
    if (!target || target._uiSfxBound) return;
    target._uiSfxBound = true;

    // 1. Hover micro-tick sofisticado en todo elemento interactivo
    target.addEventListener('pointerover', (ev) => {
      const el = ev.target && ev.target.closest && ev.target.closest(HOVER_SELECTOR);
      if (!el || el === lastHoverEl || el.disabled) return;
      lastHoverEl = el;
      play('hover');
    }, true);

    target.addEventListener('pointerout', (ev) => {
      if (lastHoverEl && ev.target === lastHoverEl) {
        const rel = ev.relatedTarget;
        if (!rel || !lastHoverEl.contains(rel)) lastHoverEl = null;
      }
    }, true);

    // 2. Clic diferenciado en toda la aplicación (cero zonas mudas)
    target.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest(CLICK_SELECTOR);
      if (!btn || btn.disabled) return;
      if (btn.classList.contains('tr-ans-card')) {
        return; // Arena answer cards play dedicated quizHit / quizMiss cue
      } else if (btn.classList.contains('nav-item') || btn.classList.contains('rail-gear') || btn.classList.contains('rail-profile-card')) {
        play('tab');
      } else if (
        btn.classList.contains('cx-subtab') || btn.classList.contains('cx-mode-tab') ||
        btn.classList.contains('cx-sort-btn') || btn.classList.contains('pm-tab') ||
        btn.classList.contains('acct-subtab') || btn.classList.contains('tr-subtab') ||
        btn.classList.contains('tr-mode-pill') || btn.classList.contains('tr-replay-pill') ||
        btn.classList.contains('tr-cat-tab')
      ) {
        play('subtab');
      } else if (
        btn.classList.contains('cx-entity-row') || btn.classList.contains('rm-card') ||
        btn.classList.contains('result') || btn.classList.contains('social-player-chip') ||
        btn.classList.contains('theme') || btn.classList.contains('tr-action-chip') ||
        btn.classList.contains('tr-step-row') || btn.classList.contains('tr-step-adj') ||
        btn.classList.contains('tr-nemesis-pill')
      ) {
        play('select');
      } else if (
        btn.classList.contains('gold') || btn.classList.contains('primary') ||
        btn.classList.contains('wiz-lang-card') || btn.classList.contains('prefs-lang-item')
      ) {
        play('confirm');
      } else {
        play('soft');
      }
    }, true);

    // 3. Toggles y selects
    target.addEventListener('change', (ev) => {
      const input = ev.target;
      if (!input) return;
      if (input.type === 'checkbox') play(input.checked ? 'toggleOn' : 'toggleOff');
      else if (input.tagName === 'SELECT') play('subtab');
    }, true);

    // 4. Detent táctil en sliders (opacidad, tiempos)
    target.addEventListener('input', (ev) => {
      const input = ev.target;
      if (input && input.type === 'range') play('slider');
    }, true);

    // 5. Teclado táctil estilo iPhone al escribir en cualquier buscador o campo de texto
    target.addEventListener('keydown', (ev) => {
      const el = ev.target;
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
      if (el.type === 'checkbox' || el.type === 'range' || el.type === 'radio') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === ' ') play('keySpace');
      else if (ev.key === 'Backspace' || ev.key === 'Delete') play('keyBack');
      else if (ev.key === 'Enter') play('keyEnter');
      else if (ev.key && ev.key.length === 1) play('key');
    }, true);
  }

  const api = {
    play,
    isEnabled: () => enabled,
    setEnabled,
    attachAutoListeners,
    hover: () => play('hover'),
    soft: () => play('soft'),
    select: () => play('select'),
    tab: () => play('tab'),
    subtab: () => play('subtab'),
    confirm: () => play('confirm'),
    paceTick: () => play('paceTick'),
    paceSplit: () => play('paceSplit'),
    quizHit: () => play('quizHit'),
    quizMiss: () => play('quizMiss'),
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UiSfx = api;
})(typeof globalThis === 'object' ? globalThis : this);
