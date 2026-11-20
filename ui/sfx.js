(function (root) {
  'use strict';

  /**
   * Micro-sonidos táctiles minimalistas para la interfaz (Web Audio API).
   * Sin archivos externos ni peticiones de red (100% compatible con CSP estricta).
   * Volumen muy sutil y envolventes suaves para nunca saturar.
   */
  const STORAGE_KEY = 'aoe2helper.uiSounds';
  let ctx = null;
  let lastKeyAt = 0;
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
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freqStart, freqEnd, duration, gainPeak, type = 'sine', delay = 0) {
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + duration);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + Math.min(0.008, duration * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.01);
  }

  function play(kind) {
    if (!enabled) return;
    try {
      if (kind === 'tab') {
        tone(290, 195, 0.048, 0.036, 'triangle');
      } else if (kind === 'toggleOn') {
        tone(420, 480, 0.05, 0.034, 'sine', 0);
        tone(560, 620, 0.065, 0.032, 'sine', 0.028);
      } else if (kind === 'toggleOff') {
        tone(440, 320, 0.06, 0.032, 'sine', 0);
      } else if (kind === 'confirm') {
        tone(523.25, 523.25, 0.09, 0.036, 'sine', 0);
        tone(659.25, 659.25, 0.13, 0.032, 'sine', 0.045);
      } else if (kind === 'key') {
        const now = performance.now();
        if (now - lastKeyAt < 48) return;
        lastKeyAt = now;
        const jitter = 0.94 + Math.random() * 0.12;
        tone(680 * jitter, 280 * jitter, 0.022, 0.018, 'triangle');
      } else if (kind === 'soft') {
        tone(360, 280, 0.038, 0.024, 'sine');
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
      } else if (btn.classList.contains('winbtn')) {
        play('soft');
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
