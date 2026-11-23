(function (root) {
  'use strict';

  /**
   * Micro-sonidos táctiles premium (estilo háptico / vidrio esmerilado).
   * Síntesis Web Audio 100% local (compatible con CSP estricta, sin assets externos):
   * impulsos cortos filtrados pasa-banda + senoidales cálidas muy suaves.
   */
  const STORAGE_KEY = 'aoe2helper.uiSounds';
  let ctx = null;
  let noiseBuf = null;
  let lastKeyAt = 0;
  let idleSuspendTimer = null;
  let enabled = true;

  try {
    const saved = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
    if (saved === '0' || saved === 'false') enabled = false;
  } catch (_) { /* ignore */ }

  function scheduleSuspend() {
    if (idleSuspendTimer) clearTimeout(idleSuspendTimer);
    idleSuspendTimer = setTimeout(() => {
      idleSuspendTimer = null;
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    }, 8000);
  }

  function ensureCtx() {
    if (!enabled) return null;
    const AudioCtx = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    scheduleSuspend();
    return ctx;
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('blur', () => {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    });
  }

  function ensureNoise(ac) {
    if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
    const length = Math.floor(ac.sampleRate * 0.03);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Envolvente rápida exponencial para un chasquido orgánico sin siseo.
      const env = Math.pow(1 - i / length, 3.2);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    noiseBuf = buffer;
    return noiseBuf;
  }

  /** Pulso táctil ultra corto filtrado (sensación de clic háptico / cristal mate). */
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
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.0018);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ac.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.005);
  }

  /** Nota cálida filtrada pasa-bajos, ataque aterciopelado y volumen muy discreto. */
  function velvetTone(freqStart, freqEnd, duration, gainPeak, delay = 0, cutoff = 1800) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, freqEnd), t0 + duration);
    }
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + Math.min(0.009, duration * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(lp);
    lp.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.01);
  }

  function play(kind) {
    if (!enabled) return;
    try {
      if (kind === 'tab') {
        // Clic háptico sobrio y silencioso, sin zumbido grave ni "bloop".
        hapticTick(1650, 2.2, 0.012, 0.014, 0);
        velvetTone(640, 580, 0.024, 0.006, 0, 1400);
      } else if (kind === 'toggleOn') {
        hapticTick(1800, 2.4, 0.010, 0.011, 0);
        velvetTone(587.33, 620, 0.036, 0.009, 0.002, 1900);
        velvetTone(880, 880, 0.055, 0.008, 0.026, 2100);
      } else if (kind === 'toggleOff') {
        hapticTick(1250, 2.0, 0.011, 0.010, 0);
        velvetTone(520, 410, 0.042, 0.008, 0.002, 1400);
      } else if (kind === 'confirm') {
        hapticTick(1900, 2.6, 0.010, 0.010, 0);
        velvetTone(523.25, 523.25, 0.08, 0.010, 0.004, 1900);
        velvetTone(783.99, 783.99, 0.11, 0.008, 0.042, 2200);
      } else if (kind === 'key') {
        const now = performance.now();
        if (now - lastKeyAt < 52) return;
        lastKeyAt = now;
        const jitter = 0.93 + Math.random() * 0.14;
        hapticTick(2100 * jitter, 2.8, 0.008, 0.007, 0);
      } else if (kind === 'soft') {
        hapticTick(1450, 2.0, 0.010, 0.010, 0);
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

  function attachAutoListeners(doc) {
    const target = doc || root.document;
    if (!target || target._uiSfxBound) return;
    target._uiSfxBound = true;

    target.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest('button, summary, .result');
      if (!btn || btn.disabled) return;
      if (btn.classList.contains('nav-item') || btn.classList.contains('rail-gear')) {
        play('tab');
      } else if (btn.classList.contains('gold') || btn.classList.contains('primary') ||
          btn.classList.contains('wiz-lang-card') || btn.classList.contains('prefs-lang-item')) {
        play('confirm');
      } else {
        play('soft');
      }
    }, true);

    target.addEventListener('change', (ev) => {
      const input = ev.target;
      if (!input) return;
      if (input.type === 'checkbox') play(input.checked ? 'toggleOn' : 'toggleOff');
      else if (input.tagName === 'SELECT') play('tab');
    }, true);

    target.addEventListener('keydown', (ev) => {
      const el = ev.target;
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
      if (el.type === 'checkbox' || el.type === 'range') return;
      if (ev.key && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        play('key');
      } else if (ev.key === 'Backspace') {
        play('key');
      }
    }, true);
  }

  const api = {
    play,
    isEnabled: () => enabled,
    setEnabled,
    attachAutoListeners,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UiSfx = api;
})(typeof globalThis === 'object' ? globalThis : this);
