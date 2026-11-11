'use strict';

/**
 * Reloj de la "intro" de la partida.
 *
 * El usuario quiere dos cosas atadas al TIEMPO REAL DE PARTIDA, no a un
 * temporizador desde que la app detecta algo:
 *
 *   - "Ayuda de civ": aparece a 0:01 y se oculta a 0:20.
 *   - "Ocultar panel de ELO al segundo 20": el ELO se ve al empezar y se
 *     oculta a 0:20; vuelve a aparecer cuando termina la partida.
 *
 * `match.startedAt` viene del REST de AoE2 Companion (`raw.started`), que es
 * el timestamp real de inicio. En la pre-partida (`phase:'lobby'`, evento
 * `matched`) todavía no hay civs reales ni reloj: devolvemos null.
 *
 * Todo acá es puro (sin Electron, sin reloj del sistema salvo `now` explícito)
 * para poder testearlo en tools/selftest.js sin levantar la app.
 */

const SHOW_AT_MS = 1000; // 0:01
const HIDE_AT_MS = 20 * 1000; // 0:20
// Si la primera vez que vemos la partida ya pasó más de esto, no enganchamos
// la intro (p. ej. abrir la app en medio de una partida): así el ELO no queda
// oculto para siempre en una partida que no vimos empezar.
const ENGAGE_LIMIT_MS = 60 * 1000;

function introKey(state) {
  if (!state || state.status !== 'ongoing') return null;
  if (state.phase === 'lobby') return null; // pre-partida: sin civs reales
  const match = state.match || {};
  if (!Number.isFinite(match.startedAt) || match.startedAt <= 0) return null;
  return `${match.matchId ?? 'sin-id'}:${match.startedAt}`;
}

/**
 * Mantiene el estado de la intro entre snapshots. El mismo partido (mismo id +
 * startedAt) no reinicia el reloj aunque lleguen nuevos polls o cambie el ELO.
 */
function trackIntro(previous, state, now) {
  const key = introKey(state);
  if (!key) return null;
  if (previous && previous.key === key) return previous;

  const startedAt = state.match.startedAt;
  const elapsed = Math.max(0, now - startedAt);
  return {
    key,
    startedAt,
    engaged: elapsed <= ENGAGE_LIMIT_MS,
    seenElapsed: elapsed,
  };
}

/** Qué debe verse en un instante dado. */
function introView(intro, config, now) {
  const active = Boolean(intro && intro.engaged);
  const elapsed = active ? Math.max(0, now - intro.startedAt) : null;
  const civHelpVisible = Boolean(
    active && config && config.civHelp && elapsed >= SHOW_AT_MS && elapsed < HIDE_AT_MS,
  );
  const eloHidden = Boolean(
    active && config && config.hideEloAt20 && elapsed >= HIDE_AT_MS,
  );
  return { eloHidden, civHelpVisible, elapsed };
}

/** Milisegundos hasta el próximo cambio de vista, o null si ya no hay. */
function nextIntroTick(intro, now) {
  if (!intro || !intro.engaged) return null;
  const elapsed = Math.max(0, now - intro.startedAt);
  if (elapsed < SHOW_AT_MS) return SHOW_AT_MS - elapsed;
  if (elapsed < HIDE_AT_MS) return HIDE_AT_MS - elapsed;
  return null;
}

module.exports = {
  SHOW_AT_MS,
  HIDE_AT_MS,
  ENGAGE_LIMIT_MS,
  introKey,
  trackIntro,
  introView,
  nextIntroTick,
};
