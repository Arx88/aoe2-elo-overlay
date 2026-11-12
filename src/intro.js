'use strict';

/**
 * Reloj de la "intro" de la partida.
 *
 * El usuario quiere dos cosas atadas al TIEMPO REAL DE PARTIDA, no a un
 * temporizador desde que la app detecta algo:
 *
 *   - "Ayuda de civ": aparece a 0:01 y se oculta al tiempo elegido.
 *   - "Ocultar panel de ELO": el ELO se ve al empezar y se oculta al tiempo
 *     elegido; vuelve a aparecer cuando termina la partida.
 *
 * El tiempo de ocultado es configurable (`hideAtSeconds`, de 10 a 60 s,
 * 20 s por defecto), tanto para la ayuda de civ como para el ELO y el informe
 * del rival.
 *
 * `match.startedAt` viene del REST de AoE2 Companion (`raw.started`), que es
 * el timestamp real de inicio. En la pre-partida (`phase:'lobby'`, evento
 * `matched`) todavía no hay civs reales ni reloj: devolvemos null.
 *
 * Todo acá es puro (sin Electron, sin reloj del sistema salvo `now` explícito)
 * para poder testearlo en tools/selftest.js sin levantar la app.
 */

const SHOW_AT_MS = 1000; // 0:01
const HIDE_AT_MS = 20 * 1000; // 0:20 (valor por defecto)
const MIN_HIDE_MS = 10 * 1000; // 0:10
const MAX_HIDE_MS = 60 * 1000; // 1:00
// Si la primera vez que vemos la partida ya pasó más de esto, no enganchamos
// la intro (p. ej. abrir la app en medio de una partida): así el ELO no queda
// oculto para siempre en una partida que no vimos empezar.
const ENGAGE_LIMIT_MS = 60 * 1000;

/** Tiempo de ocultado (ms) a partir de la config, siempre entre 10 y 60 s. */
function hideAtMs(config) {
  const raw = Number(config && config.hideAtSeconds);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : HIDE_AT_MS / 1000;
  const ms = Math.round(seconds) * 1000;
  return Math.min(MAX_HIDE_MS, Math.max(MIN_HIDE_MS, ms));
}

function introKey(state) {
  if (!state || state.status !== 'ongoing') return null;
  if (state.phase === 'lobby') return null; // pre-partida: sin civs reales
  const match = state.match || {};
  if (!Number.isFinite(match.startedAt) || match.startedAt <= 0) return null;
  return `${match.matchId ?? 'sin-id'}:${match.startedAt}`;
}

/**
 * Mantiene el estado de la intro entre snapshots.
 *
 * REGLA: el reloj pertenece al PARTIDO (matchId), no al `startedAt`. Mientras
 * el estado siga siendo `ongoing` para el mismo matchId, la intro se conserva
 * aunque `startedAt` cambie, falte un instante o el estado pase por la fase
 * `lobby`. Antes cualquier variación de `startedAt` creaba una intro nueva con
 * el reloj en 0:00 y la tarjeta de civ se volvía a abrir a mitad de partida.
 *
 * Cuando la partida termina (el estado deja de ser `ongoing`) la intro se
 * suelta en el acto, para que el ELO vuelva a mostrarse.
 */
function trackIntro(previous, state, now) {
  const ongoing = Boolean(state && state.status === 'ongoing');
  const key = introKey(state);
  const matchId = ongoing && state.match ? String(state.match.matchId ?? 'sin-id') : null;

  if (!key) {
    // Pre-partida del MISMO partido: el reloj no arranca, pero si ya había uno
    // (el REST todavía no completa `startedAt`) tampoco se pierde.
    if (ongoing && previous && previous.matchId === matchId) {
      previous.lastSeen = now;
      return previous;
    }
    return null;
  }

  if (previous && previous.matchId === matchId) {
    // Mismo partido: se muta en el lugar a propósito. Devolver un objeto nuevo
    // rompía la identidad que usa main (`intro === otro`) para no reprogramar.
    previous.lastSeen = now;
    return previous;
  }

  const startedAt = state.match.startedAt;
  const elapsed = Math.max(0, now - startedAt);
  return {
    key,
    matchId,
    startedAt,
    engaged: elapsed <= ENGAGE_LIMIT_MS,
    seenElapsed: elapsed,
    lastSeen: now,
  };
}

/** Qué debe verse en un instante dado. */
function introView(intro, config, now) {
  const active = Boolean(intro && intro.engaged);
  const elapsed = active ? Math.max(0, now - intro.startedAt) : null;
  const hideAt = hideAtMs(config);
  const civHelpVisible = Boolean(
    active && config && config.civHelp && elapsed >= SHOW_AT_MS && elapsed < hideAt,
  );
  const eloHidden = Boolean(
    active && config && config.hideEloAt20 && elapsed >= hideAt,
  );
  return { eloHidden, civHelpVisible, elapsed };
}

/** Milisegundos hasta el próximo cambio de vista, o null si ya no hay. */
function nextIntroTick(intro, now, config) {
  if (!intro || !intro.engaged) return null;
  const elapsed = Math.max(0, now - intro.startedAt);
  if (elapsed < SHOW_AT_MS) return SHOW_AT_MS - elapsed;
  const hideAt = hideAtMs(config);
  if (elapsed < hideAt) return hideAt - elapsed;
  return null;
}

module.exports = {
  SHOW_AT_MS,
  HIDE_AT_MS,
  MIN_HIDE_MS,
  MAX_HIDE_MS,
  ENGAGE_LIMIT_MS,
  hideAtMs,
  introKey,
  trackIntro,
  introView,
  nextIntroTick,
};
