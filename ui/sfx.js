(function (root) {
  'use strict';

  /**
   * Motor acústico artesanal Obsidian-Gold para Relic (Web Audio 100 % local, CSP-safe).
   *
   * Filosofía sonora:
   * - CERO pitidos agudos ("ti-ti-ti" chillones > 1000 Hz) y CERO spam en hover.
   * - Cuerpo cálido en medios-graves (140–580 Hz) filtrado pasa-bajos (cutoff 480–900 Hz),
   *   inspirado en hardware de precisión: dial de latón cepillado, madera amortiguada y fieltro.
   * - Cada acción (menú lateral, subpestaña, clic fino, toggle, codex, unidad única, teclado)
   *   tiene su propia firma acústica delicada, discreta y placentera.
   */
  const STORAGE_KEY = 'aoe2helper.uiSounds';
  let ctx = null;
  let warmNoiseBuf = null;
  let lastKeyAt = 0;
  let lastSliderAt = 0;
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

  /** Ruido marrón cálido (suavizado) para transientes orgánicos sin aspereza metálica. */
  function ensureWarmNoise(ac) {
    if (warmNoiseBuf && warmNoiseBuf.sampleRate === ac.sampleRate) return warmNoiseBuf;
    const length = Math.floor(ac.sampleRate * 0.045);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      const env = Math.pow(1 - i / length, 2.8);
      data[i] = last * 3.2 * env;
    }
    warmNoiseBuf = buffer;
    return warmNoiseBuf;
  }

  /** Pulso orgánico grave/medio tipo "thock" amortiguado con fieltro (cero chillido). */
  function feltTap(freqStart, freqEnd, duration, gainPeak, delay = 0, cutoff = 640) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;

    // Cuerpo tonal cálido (senoidal pura filtrada)
    const osc = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(48, freqEnd), t0 + duration);
    }
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t0);
    lp.Q.setValueAtTime(0.65, t0);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.0035);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(lp);
    lp.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.015);
  }

  /** Micro-roce de aire / fieltro ultra suave (sin frecuencias agudas irritantes). */
  function softBrush(centerFreq, q, duration, gainPeak, delay = 0) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = ensureWarmNoise(ac);

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(centerFreq, t0);
    bp.Q.setValueAtTime(q, t0);

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(950, centerFreq * 1.45), t0);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(ac.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.01);
  }

  /** Nota cálida tipo Rhodes / marimba con fieltro (envolvente redonda, jamás estridente). */
  function warmBell(freqStart, freqEnd, duration, gainPeak, delay = 0, cutoff = 820, wave = 'sine') {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, freqEnd), t0 + duration);
    }
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t0);
    lp.Q.setValueAtTime(0.55, t0);

    const attack = Math.min(0.014, duration * 0.24);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(lp);
    lp.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function play(kind) {
    if (!enabled) return;
    try {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (kind === 'hover') {
        // Silencio elegante en hover: evita el molesto "ti-ti-ti" al mover el mouse por el menú
        return;
      } else if (kind === 'tab') {
        // Menú lateral: "thock" cálido de dial de precisión + armónico grave aterciopelado
        feltTap(260, 128, 0.036, 0.024, 0, 520);
        softBrush(520, 1.3, 0.020, 0.014, 0);
        warmBell(293.66, 293.66, 0.085, 0.0085, 0.004, 620); // D4 cálido
      } else if (kind === 'subtab') {
        // Subpestañas y filtros: clic fino amortiguado de latón/madera
        feltTap(340, 195, 0.026, 0.018, 0, 620);
        softBrush(640, 1.5, 0.015, 0.010, 0);
        warmBell(392.0, 415.3, 0.058, 0.0055, 0.003, 720); // G4 suave
      } else if (kind === 'select') {
        // Selección de tarjeta o fila: toque táctil cálido y nítido
        feltTap(300, 170, 0.028, 0.019, 0, 580);
        warmBell(349.23, 392.0, 0.062, 0.0055, 0.003, 680);
      } else if (kind === 'soft') {
        // Botones discretos: toque mínimo de fieltro
        feltTap(245, 145, 0.024, 0.015, 0, 500);
        softBrush(480, 1.4, 0.014, 0.008, 0);
      } else if (kind === 'slider') {
        if (now - lastSliderAt < 48) return;
        lastSliderAt = now;
        feltTap(360, 250, 0.014, 0.008, 0, 620);
      } else if (kind === 'toggleOn') {
        // Interruptor encendido: dos notas cálidas en quinta suave
        feltTap(280, 170, 0.024, 0.015, 0, 560);
        warmBell(329.63, 329.63, 0.065, 0.009, 0.004, 720); // E4
        warmBell(440.0, 440.0, 0.095, 0.008, 0.026, 780);   // A4
      } else if (kind === 'toggleOff') {
        // Interruptor apagado: descenso sereno y cálido
        feltTap(230, 130, 0.026, 0.014, 0, 480);
        warmBell(349.23, 277.18, 0.065, 0.0075, 0.004, 560);
      } else if (kind === 'confirm') {
        // Acción confirmada: acorde cálido en quinta perfecta
        feltTap(275, 165, 0.028, 0.015, 0, 580);
        warmBell(293.66, 293.66, 0.12, 0.011, 0.005, 760); // D4
        warmBell(440.0, 440.0, 0.16, 0.0095, 0.036, 860);  // A4
      } else if (kind === 'techOpen') {
        // Abrir ficha de unidad/tecnología: tacto de pergamino + resonancia cálida
        feltTap(290, 160, 0.030, 0.018, 0, 580);
        softBrush(560, 1.4, 0.020, 0.011, 0);
        warmBell(329.63, 349.23, 0.090, 0.0075, 0.005, 740);
      } else if (kind === 'techUnique') {
        // Unidad o tecnología única: acorde regio aterciopelado (D4 + A4 + D5 filtrado)
        feltTap(295, 165, 0.032, 0.018, 0, 600);
        warmBell(293.66, 293.66, 0.14, 0.010, 0.005, 740);
        warmBell(440.0, 440.0, 0.17, 0.0085, 0.030, 840);
        warmBell(587.33, 587.33, 0.19, 0.0055, 0.060, 920);
      } else if (kind === 'techMuted') {
        // Nodo no disponible: golpe suave en madera grave amortiguada
        feltTap(195, 118, 0.042, 0.020, 0, 380);
        softBrush(340, 1.2, 0.018, 0.008, 0);
      } else if (kind === 'glide') {
        // Salto / deslizamiento de edificio: susurro de aire sedoso
        softBrush(460, 1.3, 0.032, 0.010, 0);
        warmBell(261.63, 329.63, 0.075, 0.0045, 0, 620);
      } else if (kind === 'key') {
        // Teclado mecánico lubricado ("thock" cálido, nunca chasquido chillón)
        if (now - lastKeyAt < 36) return;
        lastKeyAt = now;
        const j = 0.95 + Math.random() * 0.10;
        feltTap(270 * j, 145 * j, 0.018, 0.013, 0, 560);
        softBrush(760 * j, 1.8, 0.010, 0.008, 0);
      } else if (kind === 'keySpace') {
        if (now - lastKeyAt < 36) return;
        lastKeyAt = now;
        feltTap(210, 118, 0.022, 0.015, 0, 460);
        softBrush(580, 1.5, 0.012, 0.008, 0);
      } else if (kind === 'keyBack') {
        if (now - lastKeyAt < 36) return;
        lastKeyAt = now;
        feltTap(195, 112, 0.020, 0.013, 0, 440);
      } else if (kind === 'keyEnter') {
        feltTap(290, 165, 0.026, 0.016, 0, 580);
        warmBell(392.0, 440.0, 0.075, 0.007, 0.004, 740);
      } else if (kind === 'progress') {
        warmBell(293.66, 392.0, 0.20, 0.007, 0, 720, 'sine');
      } else if (kind === 'bootLoad') {
        warmBell(220.0, 293.66, 0.42, 0.010, 0, 680, 'sine');
        warmBell(329.63, 392.0, 0.34, 0.0055, 0.09, 760, 'sine');
      } else if (kind === 'bootReady') {
        feltTap(260, 140, 0.032, 0.012, 0, 520);
        warmBell(293.66, 293.66, 0.24, 0.011, 0.006, 740);
        warmBell(440.0, 440.0, 0.30, 0.0095, 0.050, 840);
        warmBell(587.33, 587.33, 0.32, 0.005, 0.095, 940);
      } else if (kind === 'paceTick') {
        feltTap(360, 220, 0.022, 0.022, 0, 680);
        warmBell(440.0, 440.0, 0.075, 0.026, 0.003, 920);
      } else if (kind === 'paceSplit') {
        feltTap(320, 190, 0.024, 0.024, 0, 660);
        warmBell(392.0, 392.0, 0.14, 0.032, 0.003, 900);
        warmBell(587.33, 587.33, 0.20, 0.028, 0.060, 1050);
      } else if (kind === 'quizHit') {
        feltTap(310, 185, 0.024, 0.020, 0, 640);
        warmBell(392.0, 392.0, 0.13, 0.030, 0, 900);
        warmBell(587.33, 587.33, 0.20, 0.028, 0.055, 1050);
      } else if (kind === 'quizMiss') {
        feltTap(210, 128, 0.048, 0.026, 0, 440);
        warmBell(246.94, 185.0, 0.17, 0.028, 0.004, 580, 'triangle');
      } else if (kind === 'tap') {
        // Impacto corto y limpio para rondas de APM (sin estridencia)
        feltTap(330, 195, 0.022, 0.016, 0, 620);
      } else if (kind === 'error') {
        // Error o señuelo en APM: madera grave amortiguada
        feltTap(185, 112, 0.040, 0.022, 0, 380);
      } else if (kind === 'apmSwitch') {
        // Cambio de unidad objetivo en APM: doble nota cálida ascendente (E4 -> B4) para dirigir la vista al centro
        softBrush(620, 1.4, 0.018, 0.010, 0);
        warmBell(329.63, 329.63, 0.095, 0.022, 0, 860);
        warmBell(493.88, 493.88, 0.155, 0.024, 0.048, 980);
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
    '.tr-tab', '.tr-subtab', '.tr-ans-card', '.tr-action-chip', '.tr-step-row',
    '.tr-mode-pill', '.tr-replay-pill', '.tr-nemesis-pill', '.tr-war-switch',
    '.tt-pill', '.tt-mode-btn', '.tt-jump-pill', '.tt-scroll-btn',
  ].join(', ');

  function attachAutoListeners(doc) {
    const target = doc || root.document;
    if (!target || target._uiSfxBound) return;
    target._uiSfxBound = true;

    // 1. Clic diferenciado cálido y refinado (sin spam en hover)
    target.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest(CLICK_SELECTOR);
      if (!btn || btn.disabled) return;
      if (
        btn.classList.contains('tr-ans-card') ||
        btn.classList.contains('tt-node') ||
        btn.classList.contains('tt-lane-head') ||
        btn.classList.contains('tt-evo-step') ||
        btn.classList.contains('tt-jump-pill') ||
        btn.classList.contains('tt-scroll-btn')
      ) {
        return; // Estas piezas disparan su propia firma dedicada
      } else if (btn.classList.contains('nav-item') || btn.classList.contains('rail-gear') || btn.classList.contains('rail-profile-card')) {
        play('tab');
      } else if (
        btn.classList.contains('cx-subtab') || btn.classList.contains('cx-mode-tab') ||
        btn.classList.contains('cx-sort-btn') || btn.classList.contains('pm-tab') ||
        btn.classList.contains('acct-subtab') || btn.classList.contains('tr-tab') ||
        btn.classList.contains('tr-subtab') || btn.classList.contains('tr-mode-pill') ||
        btn.classList.contains('tr-replay-pill') || btn.classList.contains('tr-cat-tab') ||
        btn.classList.contains('tt-pill') || btn.classList.contains('tt-mode-btn')
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

    // 2. Toggles y selects
    target.addEventListener('change', (ev) => {
      const input = ev.target;
      if (!input) return;
      if (input.type === 'checkbox') play(input.checked ? 'toggleOn' : 'toggleOff');
      else if (input.tagName === 'SELECT') play('subtab');
    }, true);

    // 3. Detent táctil suave en sliders
    target.addEventListener('input', (ev) => {
      const input = ev.target;
      if (input && input.type === 'range') play('slider');
    }, true);

    // 4. Teclado mecánico cálido al escribir en buscadores
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
