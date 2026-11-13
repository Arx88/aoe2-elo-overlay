'use strict';

/**
 * Verifica la capa de datos contra las APIs reales, sin abrir Electron.
 * Uso: npm run selftest
 *
 * Regla bajo test: el ELO, el pico y el rank que se muestran son SIEMPRE de
 * RM 1v1 (ladder #3), juegues 1v1, TG, EW, DM o una sala personalizada.
 * El ELO del modo de la partida se conserva como `modeRating`/`matchRating`
 * solo para diagnóstico y jamás se pinta.
 */

const {
  ELO_LADDER,
  resolveLadder,
  fetchMatches,
  fetchLatestMatch,
  fetchPersonalStats,
  searchProfiles,
  fetchProfileIdentity,
  composeRows,
  normalizeMatch,
  buildExampleSnapshot,
  buildSnapshotFromLobby,
  buildSnapshotFromMatch,
} = require('../src/aoe');
const { detectProfile, listSteamIds } = require('../src/detect');
const { CIV_SLUGS, civShield } = require('../src/civs');
const {
  computeH2H,
  computeMyMapCivs,
  buildCivRecommendation,
  fetchMyHistory,
  mineCacheKey,
} = require('../src/mine');

const fs = require('node:fs');
const path = require('node:path');

// Perfiles públicos estables para validar el parseo, no dependen de la cuenta local.
const KNOWN_PROFILE = 196240; // 1v1 RM y unranked
const TEAM_PROFILE = 209118; // team games
const OTHER_PROFILE = 209118;

let failures = 0;

function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Backend simulado: devuelve ladder 3 y ladder 4/14 para los mismos perfiles. */
const FAKE_BACKEND = {
  result: { code: 0 },
  statGroups: [
    { id: 100, members: [{ profile_id: 101 }] },
    { id: 200, members: [{ profile_id: 102 }] },
    { id: 300, members: [{ profile_id: 103 }] }, // nunca jugó 1v1 ranked
  ],
  leaderboardStats: [
    { statgroup_id: 100, leaderboard_id: 3, rating: 1234, highestrating: 1300, rank: 800, wins: 40, losses: 35 },
    { statgroup_id: 100, leaderboard_id: 4, rating: 2222, highestrating: 2400, rank: 100 },
    { statgroup_id: 200, leaderboard_id: 3, rating: 1100, highestrating: 1250, rank: 1500 },
    { statgroup_id: 200, leaderboard_id: 14, rating: 9999, highestrating: 9999, rank: 2 },
    { statgroup_id: 300, leaderboard_id: 4, rating: 1800, highestrating: 1900, rank: 900 },
  ],
};

/** Roster de una partida con ELO DEL MODO distinto del 1v1. */
function fakeLobby(leaderboardId, leaderboardName) {
  return {
    matchId: 777,
    mapName: 'Nómada',
    leaderboardId,
    leaderboardName,
    players: [
      { profileId: 101, name: 'Yo', slot: 0, team: 1, rating: 2222, rank: 100 },
      { profileId: 102, name: 'Aliado', slot: 1, team: 1, rating: 9999, rank: 200 },
      { profileId: 103, name: 'Rival', slot: 2, team: 2, rating: 1800, rank: 300 },
    ],
  };
}

(async () => {
  console.log('--- 1) detección de la cuenta local ---');
  console.log(`carpetas de cuenta encontradas: ${listSteamIds().length}`);
  let detected = null;
  try {
    detected = await detectProfile((msg) => console.log(`      ${msg}`));
    console.log(`elegida: ${detected ? `${detected.alias} → ${detected.profileId}` : 'ninguna'}`);
  } catch (err) {
    console.log(`      detección falló: ${err.message}`);
  }

  console.log('\n--- 2) etiqueta del modo y ladder fija del ELO ---');
  check(
    'la ladder del ELO es RM 1v1 (#3) y es única',
    ELO_LADDER.id === 3 && ELO_LADDER.label === 'RM 1v1',
    `${ELO_LADDER.id} / ${ELO_LADDER.label}`,
  );
  const cases = [
    ['rm_1v1', 3],
    ['rm_team', 4],
    ['ew_1v1', 13],
    ['ew_team', 14],
    ['dm_1v1', 1],
    ['dm_team', 2],
  ];
  for (const [key, expected] of cases) {
    const ladder = resolveLadder({ leaderboardId: key });
    check(`${key} → modo ${expected} (solo cabecera)`, ladder.id === expected && ladder.source === 'ranked', `${ladder.id}/${ladder.source}`);
  }
  const unrankedLadder = resolveLadder({ leaderboardId: 'unranked' });
  check(
    'unranked solo etiqueta el modo; no cambia la ladder del ELO',
    unrankedLadder.source === 'match' && ELO_LADDER.id === 3,
    JSON.stringify(unrankedLadder),
  );

  console.log(`\n--- 3) RM 1v1 real (perfil ${KNOWN_PROFILE}) ---`);
  const soloStats = await fetchPersonalStats([KNOWN_PROFILE], 3);
  const solo = soloStats.get(KNOWN_PROFILE);
  check('trae rating y pico del ladder 3', Boolean(solo && solo.rating > 0 && solo.peak >= solo.rating), solo ? `${solo.rating} / ${solo.peak}` : 'sin fila');
  const defaultStats = await fetchPersonalStats([KNOWN_PROFILE]);
  check(
    'sin pasar ladder, el default es RM 1v1',
    Boolean(solo && defaultStats.get(KNOWN_PROFILE) && defaultStats.get(KNOWN_PROFILE).rating === solo.rating),
    `${(defaultStats.get(KNOWN_PROFILE) || {}).rating}`,
  );

  console.log(`\n--- 4) RM team real (perfil ${TEAM_PROFILE}) ---`);
  const teamMatches = await fetchMatches(TEAM_PROFILE, 25);
  const teamMatch = teamMatches.find((m) => m.leaderboardId === 'rm_team');
  if (!teamMatch) {
    check('hay una partida de TG en el historial', false);
  } else {
    const ladder = resolveLadder(teamMatch);
    check('rm_team → etiqueta de equipo (4)', ladder.id === 4, `id ${ladder.id}`);
    check('la partida trae 4+ jugadores', teamMatch.players.length >= 4, `${teamMatch.players.length} jugadores`);

    const ids = teamMatch.players.map((p) => p.profileId);
    const teamStats = await fetchPersonalStats(ids, 4);
    const soloLadderStats = await fetchPersonalStats(ids, 3);
    const me = teamMatch.players[0];
    const teamRow = teamStats.get(me.profileId);
    const soloRow = soloLadderStats.get(me.profileId);

    check('trae ELO de equipo (solo para comparar)', Boolean(teamRow), teamRow ? `team ${teamRow.rating} / pico ${teamRow.peak}` : 'sin fila');
    check(
      'el ELO de equipo coincide con el del match (±150)',
      Boolean(teamRow && Math.abs(teamRow.rating - me.matchRating) <= 150),
      teamRow ? `${teamRow.rating} vs match ${me.matchRating}` : '',
    );
    check(
      'el ELO del modo TG es DISTINTO del 1v1 (por eso se fuerza ladder 3)',
      Boolean(soloRow && teamRow && soloRow.rating !== teamRow.rating),
      soloRow && teamRow ? `1v1 ${soloRow.rating} ≠ team ${teamRow.rating}` : 'sin contraste',
    );
    const ordered = teamMatch.players.every((p, i, arr) => i === 0 || Number(arr[i - 1].team) <= Number(p.team));
    check('jugadores ordenados por equipo', ordered);
  }

  console.log(`\n--- 5) personalizada / unranked real (perfil ${KNOWN_PROFILE}) ---`);
  const soloMatches = await fetchMatches(KNOWN_PROFILE, 25);
  const unrankedMatch = soloMatches.find((m) => m.leaderboardId === 'unranked');
  if (!unrankedMatch) {
    check('hay una partida unranked en el historial', false);
  } else {
    const ladder = resolveLadder(unrankedMatch);
    const rows = composeRows(unrankedMatch.players, new Map(), KNOWN_PROFILE);
    check('sigue etiquetando el modo como match', ladder.source === 'match', ladder.label);
    check(
      'NO muestra el ELO unranked del payload',
      rows[0].rating === null && rows[0].hasStats === false,
      `rating ${rows[0].rating} vs payload ${unrankedMatch.players[0].matchRating}`,
    );
    check('no inventa pico histórico', rows[0].peak === null);
  }

  console.log('\n--- 6) composición de filas ---');
  const rivalStats = await fetchPersonalStats([OTHER_PROFILE], 3);
  const merged = new Map([...soloStats, ...rivalStats]);
  const roster = [
    { profileId: KNOWN_PROFILE, name: 'Yo', team: 1, civ: 'Franks', color: 1, matchRating: null },
    { profileId: OTHER_PROFILE, name: 'Rival', team: 2, civ: 'Poles', color: 2, matchRating: 2814 },
  ];
  const rows = composeRows(roster, merged, KNOWN_PROFILE);
  console.log(`      ${rows.map((r) => `${r.name}${r.isYou ? '*' : ''}=${r.rating ?? '—'}/pico ${r.peak ?? '—'}`).join(' | ')}`);
  check('marca al jugador propio', Boolean(rows[0] && rows[0].isYou === true));
  check('no marca al rival como propio', Boolean(rows[1] && rows[1].isYou === false));
  check('usa el rating de la API (ladder 3)', Boolean(rows[0] && rows[0].hasStats && rows[0].rating === (soloStats.get(KNOWN_PROFILE) || {}).rating));
  check(
    'ignora matchRating aunque no haya stats de ese jugador',
    composeRows([roster[1]], new Map(), KNOWN_PROFILE)[0].rating === null,
  );

  console.log('\n--- 7) última partida del perfil detectado ---');
  const sampleId = detected ? detected.profileId : KNOWN_PROFILE;
  const latest = await fetchLatestMatch(sampleId);
  console.log(
    latest
      ? `      ${latest.mapName} · ${latest.leaderboardName} · ongoing=${latest.ongoing} · ${latest.players.length} jugadores`
      : '      sin partidas',
  );

  console.log('\n--- 8) búsqueda de perfiles (ventana de configuración) ---');
  const found = await searchProfiles('acido');
  console.log(`      ${found.slice(0, 4).map((p) => `${p.name} #${p.profileId}`).join(' | ')}`);
  check('devuelve sugerencias por nombre', found.length > 0, `${found.length} resultados`);
  check(
    'cada sugerencia trae profileId numérico y nombre',
    found.every((p) => Number.isFinite(p.profileId) && typeof p.name === 'string' && p.name.length > 0),
  );
  check('no busca con menos de 2 caracteres', (await searchProfiles('a')).length === 0);

  const identity = await fetchProfileIdentity(detected ? detected.profileId : KNOWN_PROFILE);
  check('resuelve alias de un perfil elegido a mano', Boolean(identity && identity.profileId), identity ? `${identity.alias} (${identity.profileId})` : 'sin identidad');
  check('rechaza un ID que no existe', (await fetchProfileIdentity(999999999)) === null);
  check(
    'rechaza IDs inválidos (0 y negativos)',
    (await fetchProfileIdentity(0)) === null && (await fetchProfileIdentity(-5)) === null,
  );

  console.log(`\n--- 9) escudos de civilización (${CIV_SLUGS.length} civs) ---`);
  const civDir = path.join(__dirname, '..', 'assets', 'civs');
  const missing = CIV_SLUGS.filter((slug) => !fs.existsSync(path.join(civDir, `${slug}.png`)));
  check('todos los escudos están en disco', missing.length === 0, missing.length ? `faltan: ${missing.join(', ')}` : '62 archivos');

  const apiNames = [
    'Spanish', 'Magyars', 'Franks', 'Gurjaras', 'Wu', 'Shu', 'Wei', 'Jurchens',
    'Khitans', 'Hindustanis', 'Burgundians', 'Lithuanians', 'Poles', 'Khmer', 'Goths',
  ];
  const unmapped = apiNames.filter((name) => !civShield(name));
  check('traduce los nombres de civ de la API', unmapped.length === 0, unmapped.length ? `sin mapa: ${unmapped.join(', ')}` : `${apiNames.length} nombres`);
  check(
    'normaliza mayúsculas y espacios',
    civShield('SPANISH') === 'assets/civs/spanish.png' && civShield('  poles ') === 'assets/civs/poles.png',
  );
  check('civ desconocida (Random) → sin escudo', civShield('Random') === null && civShield('') === null);

  console.log('\n--- 10) regla RM 1v1 en TG / EW / custom / partida encontrada (backend simulado) ---');
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    return { ok: true, json: async () => FAKE_BACKEND };
  };

  try {
    const cache = new Map();
    const options = { profileId: 101, cache, cacheTtlMs: 15 * 60 * 1000 };
    let partial = null;
    const tg = await buildSnapshotFromLobby(fakeLobby('rm_team', 'RM team'), {
      ...options,
      onPartial: (state) => { partial = state; },
    });

    check('el snapshot declara la ladder del ELO', tg.eloLadder.id === 3 && tg.eloLadder.label === 'RM 1v1', JSON.stringify(tg.eloLadder));
    check('la cabecera sigue diciendo el modo TG', tg.ladder.id === 4 && tg.ladder.label === 'RM team', `${tg.ladder.id}/${tg.ladder.label}`);
    check('TG muestra ELO 1v1, no el de equipo', tg.players[0].rating === 1234 && tg.players[0].rating !== tg.players[0].modeRating, `1v1 ${tg.players[0].rating} vs modo ${tg.players[0].modeRating}`);
    check('pico y rank también son de 1v1', tg.players[0].peak === 1300 && tg.players[0].rank === 800, `pico ${tg.players[0].peak} / #${tg.players[0].rank}`);
    check('modeRating/modeRank quedan solo como auxiliares', tg.players[0].modeRating === 2222 && tg.players[0].modeRank === 100);
    const without1v1 = tg.players.find((p) => p.profileId === 103);
    check('sin ladder 1v1 muestra — (nunca el ELO del modo)', without1v1.rating === null && without1v1.peak === null && without1v1.hasStats === false, `rating ${without1v1.rating}`);
    check('primera pintura: roster sin ELO (…), nunca el del modo', Boolean(partial && partial.pending === true && partial.players.every((p) => p.rating === null)));
    check('una sola request para los 3 jugadores', requestedUrls.length === 1, `${requestedUrls.length} requests`);
    check('cache compartida elo1v1:<id> para todos los modos', cache.has('elo1v1:101') && cache.has('elo1v1:103'));

    // Mismos jugadores, otros modos: no debe volver a pedir nada y el ELO
    // tiene que seguir siendo exactamente el mismo 1v1.
    const ew = await buildSnapshotFromLobby(fakeLobby('ew_team', 'EW team'), options);
    check('EW team muestra el mismo ELO 1v1', ew.players[0].rating === 1234 && ew.ladder.id === 14, `1v1 ${ew.players[0].rating} / modo ${ew.ladder.id}`);
    const custom = await buildSnapshotFromLobby(fakeLobby('unranked', 'Personalizada'), options);
    check('sala personalizada muestra el mismo ELO 1v1', custom.players[0].rating === 1234 && custom.ladder.source === 'match', `1v1 ${custom.players[0].rating}`);
    check('la cache 1v1 se reutiliza entre modos', requestedUrls.length === 1, `${requestedUrls.length} requests`);

    // Evento `matched` del minuto previo: misma regla, equipos normalizados.
    const matched = {
      id: 'q_test', status: 'matched', matchId: 888, leaderboard: 'rm_team',
      mapName: 'Arena',
      players: [
        { profileId: 101, name: 'Yo', team: 0, rating: 2222, rank: 100 },
        { profileId: 102, name: 'Aliado', team: 0, rating: 9999, rank: 200 },
        { profileId: 103, name: 'Rival', team: 1, rating: 1800, rank: 300 },
        { profileId: 104, name: 'Rival 2', team: 1, rating: 1700, rank: 400 },
      ],
    };
    const found = await buildSnapshotFromMatch(matched, options);
    check('partida encontrada usa fase lobby y ELO 1v1', found.phase === 'lobby' && found.eloLadder.id === 3);
    check('tu equipo queda arriba (1) y el rival (2)', found.players[0].isYou === true && found.players[0].team === 1 && found.players[2].team === 2);
    check('el evento matched tampoco pinta su rating de modo', found.players[0].rating === 1234 && found.players[0].modeRating === 2222, `1v1 ${found.players[0].rating}`);
    check('jugador nuevo sin ladder 1v1 → —', found.players[3].rating === null && found.players[3].hasStats === false);
    check('solo se piden los ids que faltaban', requestedUrls.length === 2, `${requestedUrls.length} requests`);

    // Si el backend cae, el panel se asienta en `—` y no inventa el ELO del modo.
    global.fetch = async () => { throw new Error('backend caído'); };
    const broken = await buildSnapshotFromLobby(fakeLobby('rm_team', 'RM team'), {
      profileId: 101, cache: new Map(), cacheTtlMs: 15 * 60 * 1000,
    });
    check('backend caído: no rompe ni usa el ELO del modo', broken.status === 'ongoing' && broken.players[0].rating === null && broken.players[0].modeRating === 2222);
  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n--- 11) reloj real de partida: ayuda 0:01→0:20 y ELO oculto en 0:20 ---');
  {
    const {
      SHOW_AT_MS, HIDE_AT_MS, MIN_HIDE_MS, MAX_HIDE_MS, ENGAGE_LIMIT_MS,
      hideAtMs, introKey, trackIntro, introView, nextIntroTick,
    } = require('../src/intro');
    const { CIV_GUIDE } = require('../src/civ-guide');

    const startedAt = 1700000000000;
    const state = {
      status: 'ongoing',
      phase: 'match',
      match: { matchId: 777, startedAt },
      players: [],
    };
    const t0 = startedAt + 0;
    const intro = trackIntro(null, state, t0);

    check('0:01 y 0:20 son las constantes pedidas', SHOW_AT_MS === 1000 && HIDE_AT_MS === 20000,
      `${SHOW_AT_MS}ms / ${HIDE_AT_MS}ms`);
    check('la intro engancha con el startedAt real del REST', Boolean(intro && intro.engaged && intro.startedAt === startedAt));
    check('pre-partida (lobby) NO inicia el reloj', introKey({ ...state, phase: 'lobby' }) === null);
    check('sin startedAt no hay reloj', introKey({ ...state, match: { startedAt: null } }) === null);

    const helpOn = { civHelp: true, hideEloAt20: false };
    const hideOn = { civHelp: false, hideEloAt20: true };
    const bothOn = { civHelp: true, hideEloAt20: true };
    check('0:00 → nada visible todavía', !introView(intro, bothOn, t0 + 500).civHelpVisible);
    check('0:01 → aparece la ayuda de civ', introView(intro, helpOn, t0 + 1000).civHelpVisible);
    check('0:19 → sigue visible', introView(intro, helpOn, t0 + 19999).civHelpVisible);
    check('0:20 → la ayuda se oculta', !introView(intro, bothOn, t0 + 20000).civHelpVisible);
    check('ELO visible al empezar (aunque hideEloAt20 esté ON)', !introView(intro, hideOn, t0 + 1000).eloHidden);
    check('0:20 → ELO oculto si la opción está ON', introView(intro, hideOn, t0 + 20000).eloHidden);
    check('ocultar ELO funciona con Ayuda de civ APAGADA',
      !introView(intro, hideOn, t0 + 5000).civHelpVisible && introView(intro, hideOn, t0 + 20000).eloHidden);
    check('ELO NO se oculta si la opción está OFF', !introView(intro, helpOn, t0 + 30000).eloHidden);
    check('al terminar la partida el ELO vuelve', trackIntro(intro, { status: 'idle' }, t0 + 30000) === null);
    check('mismo partido no reinicia el reloj al hacer poll', trackIntro(intro, state, t0 + 9000) === intro);

    // Regresión: el reloj es del PARTIDO, no del `startedAt`. Un poll que trae
    // otro startedAt (o que lo pierde un instante) creaba una intro nueva con
    // el reloj en 0:00 y VOLVÍA A ABRIR la tarjeta a mitad de partida.
    const otherStart = trackIntro(intro, { ...state, match: { matchId: 777, startedAt: startedAt + 8000 } }, t0 + 12000);
    check('mismo matchId con otro startedAt NO reinicia el reloj',
      otherStart === intro && introView(otherStart, bothOn, t0 + 21000).civHelpVisible === false);
    check('si el startedAt desaparece un instante, la intro se conserva',
      trackIntro(intro, { ...state, match: { matchId: 777, startedAt: null } }, t0 + 15000) === intro);
    check('la fase lobby del mismo partido tampoco reinicia la intro',
      trackIntro(intro, { ...state, phase: 'lobby' }, t0 + 13000) === intro);
    check('otra partida sí arranca un reloj nuevo',
      trackIntro(intro, { ...state, match: { matchId: 888, startedAt: t0 + 12000 } }, t0 + 13000).matchId === '888');

    const mainSrcForIntro = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    check('main: un idle con la partida en pantalla se respeta (fin real, no se traga)',
      /const showingLive = Boolean\([\s\S]{0,120}phase !== 'lobby'/.test(mainSrcForIntro) &&
        /snapshot\.status === 'idle' &&\s*\n\s*!showingLive/.test(mainSrcForIntro));
    check('main: al cambiar de partida se borra el informe y el consejo anteriores',
      /lastOngoingMatchId/.test(mainSrcForIntro) &&
        /if \(ongoingId && ongoingId !== lastOngoingMatchId\) \{[\s\S]{0,160}clearRivalReports\(\);[\s\S]{0,80}clearScoutTips\(\);/.test(mainSrcForIntro));
    check('próximos ticks: 0:01 y 0:20',
      nextIntroTick(intro, t0) === 1000 && nextIntroTick(intro, t0 + 1000) === 19000 &&
      nextIntroTick(intro, t0 + 20000) === null);

    // Tiempo de ocultado configurable por el usuario (10 a 60 s).
    const custom = { civHelp: true, hideEloAt20: true, hideAtSeconds: 45 };
    check('tiempo elegido 0:45 → la ayuda sigue visible a 0:44',
      introView(intro, custom, t0 + 44000).civHelpVisible);
    check('tiempo elegido 0:45 → se oculta todo a 0:45',
      !introView(intro, custom, t0 + 45000).civHelpVisible &&
        introView(intro, custom, t0 + 45000).eloHidden);
    check('nextIntroTick respeta el tiempo elegido',
      nextIntroTick(intro, t0 + 1000, custom) === 44000);
    check('hideAtSeconds se limita al rango 0:10 – 1:00',
      hideAtMs({ hideAtSeconds: 1 }) === MIN_HIDE_MS &&
        hideAtMs({ hideAtSeconds: 120 }) === MAX_HIDE_MS &&
        hideAtMs({}) === 20000);
    check('abrir la app en medio de la partida NO oculta el ELO para siempre',
      !introView(trackIntro(null, state, t0 + ENGAGE_LIMIT_MS + 1000), bothOn, t0 + ENGAGE_LIMIT_MS + 1000).eloHidden);

    const missing = CIV_SLUGS.filter((slug) => {
      const g = CIV_GUIDE[slug];
      return !g || !g.name || !g.bonuses || !g.units || !g.weaknesses;
    });
    check(`guía offline completa para las ${CIV_SLUGS.length} civs`, missing.length === 0,
      missing.length ? `faltan: ${missing.join(', ')}` : 'nombre/bonos/unidades/debilidades');
  }

  console.log('\n--- 12) detección instantánea: cola apareada + roster del socket ---');
  {
    const { QueueWatcher } = require('../src/live');
    const foundIds = [];
    const matchedItems = [];
    const goneIds = [];
    const q = new QueueWatcher({
      profileId: 101,
      onFound: (id) => foundIds.push(id),
      onMatched: (item) => matchedItems.push(item),
      onGone: (id) => goneIds.push(id),
      log: () => {},
    });

    const snapshot = [
      { type: 'queueingAdded', data: { id: 'q_mine', status: 'queueing', players: [{ profileId: 101 }] } },
      { type: 'queueingAdded', data: { id: 'q_other', status: 'queueing', players: [{ profileId: 999 }] } },
    ];
    q.handleEvents(snapshot, true);
    check('snapshot reconoce mi cola y la ajena', q.ownQueueIds.has('q_mine') && !q.ownQueueIds.has('q_other'));

    const batch = [
      { type: 'queueingRemoved', data: { id: 'q_mine', reason: 'matched', matchId: 888 } },
      { type: 'queueingAdded', data: {
        id: 'm_888', status: 'matched', matchId: 888, leaderboard: 'rm_1v1', mapName: 'Arabia',
        players: [{ profileId: 101, team: 0 }, { profileId: 102, team: 1 }],
      } },
    ];
    q.handleEvents(batch, false);
    check('aviso INSTANTÁNEO al aparearse mi cola', foundIds.length === 1 && foundIds[0] === 888);
    check('roster del rival entregado en el mismo lote', matchedItems.length === 1 && matchedItems[0].players.length === 2);
    check('la partida queda vigente para el polling', Boolean(q.matched));
    check('no se dispara por la cola de OTRO jugador', foundIds.length === 1);

    // Forma rara del payload: el roster no trae mi profileId pero sí el matchId.
    const q2 = new QueueWatcher({ profileId: 101, onFound: () => {}, onMatched: (i) => matchedItems.push(i), onGone: () => {}, log: () => {} });
    q2.handleEvents(snapshot, true);
    q2.handleEvents([
      { type: 'queueingRemoved', data: { id: 'q_mine', reason: 'matched', matchId: 889 } },
      { type: 'queueingAdded', data: { id: 'otro_id', status: 'matched', matchId: 889, players: [{ profileId: 102 }] } },
    ], false);
    check('fallback por matchId aunque el roster no me incluya', matchedItems.length === 2 && matchedItems[1].matchId === 889);

    q.handleEvents([{ type: 'queueingRemoved', data: { id: 'm_888', reason: 'started', matchId: 888 } }], false);
    check('al arrancar la partida se entrega el panel al REST', goneIds.length === 1 && goneIds[0] === 'm_888');

    // Carril rápido: el feed empujado manda lotes cada ~15 s. El snapshot
    // fresco (filtrado 300 B sin cola, global en cola) es lo que hace que la
    // partida apareada se vea en ~1 s en vez de esperar el lote.
    const { FastLane } = require('../src/live');
    const laneSnapshots = [];
    const laneQueue = [];
    const laneQueries = [];
    const lane = new FastLane({
      profileId: 101,
      log: () => {},
      onSnapshot: (events) => laneSnapshots.push(events),
      onQueue: (on) => laneQueue.push(on),
      readSnapshotImpl: async (query) => {
        laneQueries.push(query);
        if (!query.profile_ids) {
          return [{
            type: 'queueingAdded',
            data: {
              id: 'm_900', status: 'matched', matchId: 900, leaderboard: 'rm_1v1',
              mapName: 'Arabia', matchedAt: new Date().toISOString(),
              players: [{ profileId: 101, team: 0 }, { profileId: 102, team: 1 }],
            },
          }];
        }
        return [{
          type: 'queueingAdded',
          data: { id: 'q_lane', status: 'queueing', players: [{ profileId: 101 }] },
        }];
      },
    });
    await lane.poll();
    check('carril rápido: sin cola consulta el socket FILTRADO (300 B)',
      Boolean(laneQueries[0] && laneQueries[0].profile_ids) && lane.inQueue);
    check('carril rápido: avisa que empezó la búsqueda',
      laneQueue.length === 1 && laneQueue[0] === true);
    await lane.poll();
    check('carril rápido: en cola pide el snapshot GLOBAL con el roster',
      Boolean(laneQueries[1] && !laneQueries[1].profile_ids) &&
        laneSnapshots.length === 1 && laneSnapshots[0][0].data.players.length === 2);
    check('carril rápido: el snapshot global entra por handleEvents como snapshot',
      /queueWatcher\.handleEvents\(events, true, \{ quiet: true \}\)/.test(
        require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8'),
      ));
    const idleFlags = [];
    const idleLane = new FastLane({
      profileId: 101,
      log: () => {},
      onSnapshot: () => {},
      onQueue: (on) => idleFlags.push(on),
      readSnapshotImpl: async () => [],
    });
    await idleLane.poll();
    check('carril rápido: si no estoy en cola no dispara nada',
      idleFlags.length === 0 && idleLane.inQueue === false);

    // Regresión v0.1.16: una cola rápida puede pasar de `queueing` a `matched`
    // entre dos pings (6 s). Si el carril solo mira `queueing`, nunca se
    // acelera y la partida se ve recién cuando el REST la ve empezada.
    const fastSnapshots = [];
    const fastLaneCalls = [];
    const alreadyMatched = new FastLane({
      profileId: 101,
      log: () => {},
      onSnapshot: (events) => fastSnapshots.push(events),
      onQueue: () => {},
      readSnapshotImpl: async (query) => {
        fastLaneCalls.push(query);
        return [{
          type: 'queueingAdded',
          data: {
            id: 'm_901', status: 'matched', matchId: 901, leaderboard: 'rm_1v1',
            players: [{ profileId: 101 }, { profileId: 102 }],
          },
        }];
      },
    });
    await alreadyMatched.poll();
    check('carril rápido: una cola ya apareada también acelera (no espera "queueing")',
      alreadyMatched.inQueue === true && fastSnapshots.length === 1 &&
        fastLaneCalls.length === 2 && !fastLaneCalls[1].profile_ids);

    // Si el aviso de fin de partida se pierde, la pausa no puede ser eterna.
    const reviveLane = new FastLane({
      profileId: 101,
      log: () => {},
      onSnapshot: () => {},
      onQueue: () => {},
      readSnapshotImpl: async (query) =>
        query.profile_ids
          ? [{ type: 'queueingAdded', data: { id: 'q_mine', status: 'queueing', players: [{ profileId: 101 }] } }]
          : [],
    });
    reviveLane.pause();
    await reviveLane.probe();
    check('carril rápido: pausado se reactiva solo cuando volvés a la cola',
      reviveLane.paused === false);

    // El aviso "encontré rival" llega ANTES del roster: pausar ahí dejaba el
    // roster esperando el lote empujado (~15 s). Se pausa solo con el roster.
    const mainSource = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'main.js'),
      'utf8',
    );
    check('main: el carril se pausa al tener el roster, no al avisar "encontré rival"',
      (mainSource.match(/fastLane\.pause\(\)/g) || []).length === 1 &&
        (mainSource.match(/fastLane\.resume\(\)/g) || []).length >= 2);

    const liveSource = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'live.js'),
      'utf8',
    );
    check(
      'los sockets piden el mapa en inglés (Hideout, no Guaridas)',
      (liveSource.match(/language: 'en'/g) || []).length >= 3 &&
        !/language: 'es'/.test(liveSource),
    );
  }

  console.log('\n--- 13) aperturas REALES de AoE2Insights (sin red, backend simulado) ---');
  {
    const {
      BASE, SOURCE, ROW_LIMIT, openingName, openingShort, buildMatchUpsUrl,
      fetchOpeningRows, parseOpeningRows, emptyOpenings, buildRivalOpenings, hasCachedOpenings,
      resolveMode, ladderMode, sameMode, LADDER_MODES, openingsCacheKey,
    } = require('../src/insights');

    const url = buildMatchUpsUrl(25399083);
    const parsed = new URL(url);
    const filter = JSON.parse(parsed.searchParams.get('filter'));
    check(
      'consulta /stats/api/match-ups/ filtrada por player_relic_id (mismo profileId)',
      url.startsWith(BASE) && parsed.pathname === '/stats/api/match-ups/' &&
        parsed.searchParams.getAll('field').length === 7 &&
        filter.field === 'player_relic_id' && filter.operator === 'equals' &&
        filter.value === '25399083' && parsed.searchParams.get('order') === '-started_time' &&
        parsed.searchParams.get('limit') === String(ROW_LIMIT),
    );
    // EW 1v1 es el ladder 13 del enum; el segundo filter usa el ID numérico
    // (con la etiqueta "EW 1v1" o con operator "in" el endpoint da 404).
    const urlMode = new URL(buildMatchUpsUrl(25399083, ROW_LIMIT, resolveMode(13)));
    const filters = urlMode.searchParams.getAll('filter').map((raw) => JSON.parse(raw));
    const ladderFilter = filters.find((f) => f.field === 'ladder');
    check(
      'con modo se agrega un SEGUNDO filter por ladder (ID numérico del enum)',
      filters.length === 2 && ladderFilter && ladderFilter.operator === 'equals' &&
        ladderFilter.value === '13',
      JSON.stringify(filters),
    );
    const urlLegacy = new URL(buildMatchUpsUrl(25399083));
    check(
      'sin modo se conserva la consulta anterior (1 solo filter, retrocompatible)',
      urlLegacy.searchParams.getAll('filter').length === 1,
    );
    check(
      'solo cuentan etiquetas reales: Unknown / vacío / null se descartan',
      openingName(' Scout rush ') === 'Scout rush' && openingName('Unknown') === null &&
        openingName('unknown') === null && openingName('') === null && openingName(null) === null,
    );
    check(
      'abreviaturas compactas para el overlay',
      openingShort('Scout rush') === 'Scouts' && openingShort('Drush fast castle') === 'Drush → FC' &&
        openingShort('Man at arms rush') === 'MAA rush' && openingShort(null) === null,
    );
    check(
      'la fuente declara replays analizados y NO existe la guía genérica por civ',
      /replays analizados/i.test(SOURCE) && !/guía|inferid/i.test(SOURCE) &&
        !fs.existsSync(path.join(__dirname, '..', 'src', 'openings.js')),
    );

    // El backend responde 202 {"pending":true} la primera vez y 200 después.
    const payload = { rows: { strategy: ['Scout rush'], match_id: [1] } };
    const requests = [];
    let attempt = 0;
    const fakeFetch = async (u, opts) => {
      requests.push({ u, opts });
      attempt += 1;
      if (attempt === 1) {
        return {
          status: 202, ok: true,
          headers: { get: (h) => (h === 'retry-after' ? '3' : null) },
          json: async () => ({ pending: true }),
        };
      }
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => payload };
    };
    const delays = [];
    const rows = await fetchOpeningRows(25399083, {
      fetchImpl: fakeFetch, attempts: 3, sleep: async (ms) => { delays.push(ms); },
    });
    check(
      '202 pending se reintenta respetando retry-after (3 s)',
      requests.length === 2 && delays.length === 1 && delays[0] === 3000 && rows === payload,
      `${requests.length} requests / delay ${delays.join(',')}`,
    );
    check(
      'la request lleva UA de navegador (Cloudflare) y timeout por AbortController',
      /Mozilla/.test(requests[0].opts.headers['User-Agent']) && Boolean(requests[0].opts.signal),
    );

    let pendingCount = 0;
    let pendingError = '';
    try {
      await fetchOpeningRows(7, {
        fetchImpl: async () => {
          pendingCount += 1;
          return { status: 202, ok: true, headers: { get: () => null } };
        },
        attempts: 3, retryMs: 10, sleep: async () => {},
      });
    } catch (err) { pendingError = err.message; }
    check('pendiente eterno: error acotado, sin loop infinito', pendingCount === 3 && /pendiente/.test(pendingError));

    let httpError = '';
    try {
      await fetchOpeningRows(7, {
        fetchImpl: async () => ({ status: 403, ok: false, headers: { get: () => null } }),
        attempts: 2, sleep: async () => {},
      });
    } catch (err) { httpError = err.message; }
    check('HTTP 403 (Cloudflare) se reporta con su código', /403/.test(httpError));

    // `rows` viene en formato COLUMNA. match_id 100 se repite 3 veces: es un
    // 4v4 y match-ups tiene una fila por enfrentamiento -> hay que deduplicar.
    const columns = {
      count: 12,
      rows: {
        match_id: [100, 100, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91],
        strategy: ['Scout rush', 'Scout rush', 'Scout rush', 'Scout rush', 'Scout rush',
          'Drush', 'Archer rush', 'Fast castle', null, 'Unknown', '', 'Man at arms rush'],
        civilization: ['Magyars', 'Magyars', 'Magyars', 'Persians', 'Mongols', 'Berbers',
          'Franks', 'Goths', 'Wu', 'Huns', 'Celts', 'Ethiopians'],
        map: ['Arabia', 'Arabia', 'Arabia', 'Steppe', 'Arabia', 'Arena', 'Arabia',
          'Arabia', 'Arabia', 'Arabia', 'Arabia', 'Arabia'],
        ladder: ['RM 1v1', 'RM 1v1', 'RM 1v1', 'RM 1v1', 'RM 1v1', 'RM 1v1',
          'RM Team', 'RM Team', 'RM 1v1', 'RM 1v1', 'RM 1v1', 'RM 1v1'],
        started_time: [12, 12, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
        player_name: Array(12).fill('Acido'),
      },
    };
    const openings = parseOpeningRows(columns);
    check('formato columna + dedupe por match_id (TG no infla el conteo)',
      openings.uniqueMatches === 10 && openings.totalRows === 12,
      `${openings.uniqueMatches} partidas únicas de ${openings.totalRows} filas`);
    check('solo cuentan replays analizados', openings.analyzed === 7, `${openings.analyzed} analizados`);
    check('apertura más usada real: Scout rush 3/7 (43 %)',
      openings.favorite && openings.favorite.name === 'Scout rush' &&
        openings.favorite.count === 3 && openings.favorite.share === 43,
      openings.favorite ? `${openings.favorite.name} ${openings.favorite.count} (${openings.favorite.share}%)` : 'sin favorita');
    check('ranking top 3 y últimas 5 con etiquetas cortas',
      openings.ranking.length === 3 && openings.recent.length === 5 &&
        openings.recent.every((item) => item.strategy && item.short),
      openings.recent.map((r) => r.short).join(' · '));
    check('declara explícitamente que viene de replays', openings.fromReplays === true && openings.source === SOURCE);

    const empty = parseOpeningRows({});
    check('sin datos: analyzed 0, favorite null (NO se inventa nada)',
      empty.analyzed === 0 && empty.favorite === null && empty.ranking.length === 0 &&
        empty.recent.length === 0 && empty.fromReplays === true);
    check('emptyOpenings tampoco inventa una apertura por civilización',
      emptyOpenings(7, 1, 'offline').ok === false &&
        emptyOpenings(7, 1, 'offline').favorite === null &&
        emptyOpenings(7, 1, 'offline').analyzed === 0);

    const cache = new Map();
    const now = 1700000000000;
    const RM_MODE = resolveMode(3);
    let netCalls = 0;
    const liveFetch = async () => {
      netCalls += 1;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => columns };
    };
    const first = await buildRivalOpenings({ profileId: 4242, mode: RM_MODE, cache, now, fetchImpl: liveFetch });
    const second = await buildRivalOpenings({ profileId: 4242, mode: RM_MODE, cache, now, fetchImpl: liveFetch });
    check('buildRivalOpenings devuelve datos reales del modo pedido y cachea 30 min',
      first.ok === true && first.favorite.name === 'Scout rush' && first.mode.id === 3 && netCalls === 1,
      `${netCalls} request(s)`);
    check('segunda lectura sale de cache (clave incluye el modo)',
      second.fromCache === true && netCalls === 1);
    check('hasCachedOpenings respeta el TTL y el modo',
      hasCachedOpenings(cache, 4242, RM_MODE, now) === true &&
        hasCachedOpenings(cache, 4242, RM_MODE, now + 30 * 60 * 1000) === true &&
        hasCachedOpenings(cache, 4242, RM_MODE, now + 30 * 60 * 1000 + 1) === false &&
        hasCachedOpenings(cache, 4242, resolveMode(13), now) === false);
    const bad = await buildRivalOpenings({ profileId: 0, mode: RM_MODE, cache, now, fetchImpl: liveFetch });
    check('perfil inválido: error controlado, sin request', bad.ok === false && /inválido/.test(bad.error) && netCalls === 1);
    const offline = await buildRivalOpenings({
      profileId: 999, mode: RM_MODE, cache: new Map(), now,
      fetchImpl: async () => { throw new Error('offline'); },
    });
    check('red caída: no tira excepción y no fabrica apertura',
      offline.ok === false && /offline/.test(offline.error) && offline.analyzed === 0 && offline.favorite === null);
    const stale = await buildRivalOpenings({
      profileId: 4242, mode: RM_MODE, cache, now: now + 31 * 60 * 1000,
      fetchImpl: async () => { throw new Error('offline'); },
    });
    check('con cache vencida y red caída se reutiliza el dato anterior',
      stale.fromCache === true && stale.favorite.name === 'Scout rush' && /offline/.test(stale.error));
  }

  console.log('\n--- 14) informe opcional del rival (sin red) ---');
  {
    const {
      SOURCES, opponentsOf, statsLadder, resolveMode, parseRivalHistory, parseMapStats,
      summarizeOpeningsByMap, normalizeProfileStats, buildRivalInsights, hasCachedInsights,
    } = require('../src/rival');

    // Regresión del bug encontrado en la captura de TG: el informe mostraba a
    // "Aliado Uno / Aliado Dos" en vez de a los rivales, porque solo se filtraba
    // por isYou y RIVAL_LIMIT se gastaba en los compañeros de equipo.
    const tgState = {
      status: 'ongoing',
      players: [
        { profileId: 1, name: 'PSX | Acido', team: 1, isYou: true },
        { profileId: 2, name: 'Aliado Uno', team: 1, isYou: false },
        { profileId: 3, name: 'Aliado Dos', team: 1, isYou: false },
        { profileId: 4, name: 'Rival Uno', team: 2, isYou: false },
        { profileId: 5, name: 'Rival Dos', team: 2, isYou: false },
        { profileId: 6, name: 'Rival Tres', team: 2, isYou: false },
      ],
    };
    const tgRivals = opponentsOf(tgState, 2);
    check('TG: el informe muestra RIVALES, nunca a tus aliados',
      tgRivals.length === 2 && tgRivals[0].name === 'Rival Uno' && tgRivals[1].name === 'Rival Dos',
      tgRivals.map((p) => p.name).join(' · '));
    check('TG: respeta el límite de 2 rivales para no tapar el juego',
      opponentsOf(tgState, 2).length === 2 && opponentsOf(tgState, 3).length === 3);
    const soloState = {
      players: [
        { profileId: 1, name: 'Yo', team: 1, isYou: true },
        { profileId: 2, name: 'Rival', team: 2, isYou: false },
      ],
    };
    check('1v1: devuelve al único rival',
      opponentsOf(soloState).length === 1 && opponentsOf(soloState)[0].name === 'Rival');
    check('sin equipos en el payload: cae a "todos menos vos", nunca vacío',
      opponentsOf({ players: [
        { profileId: 1, name: 'Yo', isYou: true },
        { profileId: 2, name: 'Rival A' },
        { profileId: 3, name: 'Rival B' },
      ] }).length === 2);
    check('sin isYou: no descarta al rival por error',
      opponentsOf({ players: [{ profileId: 2, name: 'Rival' }] }).length === 1);
    check('roster vacío (partida encontrada) no rompe',
      opponentsOf({ status: 'ongoing', players: [] }).length === 0 && opponentsOf(null).length === 0);

    check('statsLadder traduce ids numéricos del juego a enums de la API',
      statsLadder(3) === 'rm_1v1' && statsLadder(4) === 'rm_team' &&
        statsLadder(13) === 'ew_1v1' && statsLadder(14) === 'ew_team' &&
        statsLadder(1) === 'dm_1v1' && statsLadder(2) === 'dm_team');
    check('enums ya válidos se respetan y unranked cae a RM 1v1',
      statsLadder('rm_team') === 'rm_team' && statsLadder('unranked') === 'rm_1v1' &&
        statsLadder(null) === 'rm_1v1');
    check('la fuente de aperturas es AoE2Insights, no una guía',
      /AoE2Insights/.test(SOURCES.openings) && /replays analizados/i.test(SOURCES.openings));

    const historyMatches = [
      { matchId: 900, ongoing: true, startedAt: 99000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Franks' }] },
      { matchId: 555, startedAt: 98000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Poles' }] },
      { matchId: 710, startedAt: 7000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Magyars', won: true }], mapName: 'Arabia' },
      { matchId: 709, startedAt: 6000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Mongols', won: false }], mapName: 'Steppe' },
      { matchId: 708, startedAt: 5000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Persians', won: true }], mapName: 'African Clearing' },
      { matchId: 707, startedAt: 4000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Berbers', won: false }], mapName: 'Arabia' },
      { matchId: 706, startedAt: 3000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Ethiopians', won: true }], mapName: 'Kawasan' },
      { matchId: 705, startedAt: 2000, leaderboardId: 4, players: [{ profileId: 4242, civ: 'Hindustanis', won: false }], mapName: 'Arena' },
      { matchId: 704, startedAt: 1000, leaderboardId: 4, players: [{ profileId: 4242, civ: null }], mapName: 'Arabia' },
      { matchId: 703, startedAt: 500, leaderboardId: 4, players: [{ profileId: 9999, civ: 'Goths' }], mapName: 'Arabia' },
    ];
    const hist = parseRivalHistory(historyMatches, 4242, 555);
    check('historia: saltea la partida en curso y la actual',
      hist.length > 0 && hist.every((m) => m.matchId !== 900 && m.matchId !== 555));
    check('historia: últimas 5, de más nueva a más vieja',
      hist.length === 5 && hist[0].matchId === 710 && hist[4].matchId === 706,
      hist.map((m) => m.matchId).join(','));
    check('historia: descarta partidas sin civ del rival y resuelve escudos',
      hist.every((m) => m.civ && m.slug) && hist[0].slug === 'magyars' && hist[2].slug === 'persians');
    check('historia: conserva resultado y mapa reales',
      hist[0].won === true && hist[1].won === false && hist[0].mapName === 'Arabia');

    const arabia = parseMapStats(historyMatches, 4242, 555, {
      mapName: 'arabia', mode: resolveMode(4),
    });
    check('mapa actual: filtra SOLO ese mapa (y ese modo), sin favoritos',
      arabia.name === 'arabia' && arabia.games === 2 && arabia.wins === 1 &&
        arabia.winRate === 50 && arabia.civ.name === 'Magyars' &&
        arabia.civ.winRate === 100 && arabia.civ.share === 50 &&
        arabia.civs.length === 2,
      JSON.stringify(arabia));
    check('mapa actual: mapa sin partidas se informa en cero, no se inventa',
      parseMapStats(historyMatches, 4242, 555, { mapName: 'Nomad', mode: resolveMode(4) }).games === 0 &&
        parseMapStats(historyMatches, 4242, 555, { mapName: 'Arena', mode: resolveMode(4) }).civ.name === 'Hindustanis' &&
        parseMapStats(historyMatches, 4242, 555, { mapName: null }) === null);

    // La muestra del mapa es TODO el historial, sin recortar a 20.
    const manyArabia = Array.from({ length: 25 }, (_, i) => ({
      matchId: 3000 + i,
      startedAt: (25 - i) * 1000,
      leaderboardId: 3,
      mapName: 'Arabia',
      // Franks 12, Magyars 8 y Goths 5: las tres cuentan.
      players: [{ profileId: 7, civ: i < 12 ? 'Franks' : i < 20 ? 'Magyars' : 'Goths', won: true }],
    }));
    const allMap = parseMapStats(manyArabia, 7, null, { mapName: 'Arabia', mode: resolveMode(3) });
    check('mapa actual: cuenta todo el historial del mapa',
      allMap.games === 25 && allMap.totalMapGames === 25 &&
        allMap.civ.name === 'Franks' && allMap.civ.games === 12 &&
        allMap.civs.find((c) => c.name === 'Goths') &&
        allMap.civs.find((c) => c.name === 'Goths').games === 5,
      JSON.stringify(allMap));

    const statsRaw = {
      leaderboardName: '1v1 Random Map',
      civ: [
        { civ: 'Ethiopians', civName: 'Ethiopians', games: 145, wins: 80, losses: 65 },
        { civ: 'Magyars', civName: 'Magyars', games: 60, wins: 30, losses: 30 },
        { civ: 'Franks', civName: 'Franks', games: 30, wins: 10, losses: 20 },
        { civ: 'Goths', civName: 'Goths', games: 10, wins: 2, losses: 8 },
        { civ: 'Wu', civName: 'Wu', games: 5, wins: 1, losses: 4 },
        { civ: 'Random', civName: 'Random', games: 0, wins: 0, losses: 0 },
      ],
      map: [
        { mapName: 'Arabia', games: 100, wins: 55 },
        { mapName: 'Thames', games: 168, wins: 90 },
      ],
    };
    const stats = normalizeProfileStats(statsRaw, 'Arabia');
    check('stats: civ y mapa más usados por partidas reales',
      stats.favoriteCiv.name === 'Ethiopians' && stats.favoriteCiv.games === 145 &&
        stats.favoriteMap.name === 'Thames' && stats.favoriteMap.games === 168);
    check('stats: cuota, winrate y top recortados',
      stats.favoriteCiv.share === 58 && stats.favoriteCiv.winRate === 55 &&
        stats.topCivs.length === 3 && stats.topMaps.length === 2 && stats.totalGames === 250,
      `total ${stats.totalGames}`);
    check('stats: el mapa de la partida sale del histórico, no el favorito',
      stats.currentMap.name === 'Arabia' && stats.currentMap.games === 100 &&
        stats.currentMap.wins === 55 && stats.currentMap.winRate === 55 &&
        stats.favoriteMap.name === 'Thames',
      JSON.stringify(stats.currentMap));

    const fakeOpenings = {
      ok: true, fromReplays: true, analyzed: 36, uniqueMatches: 43,
      favorite: { name: 'Scout rush', short: 'Scouts', count: 20, share: 56 },
      analyzedMatches: [
        { matchId: 1, strategy: 'Scout rush', short: 'Scouts', civ: 'Magyars', map: 'Arabia', ladder: 'RM 1v1' },
        { matchId: 2, strategy: 'Scout rush', short: 'Scouts', civ: 'Magyars', map: 'Arabia', ladder: 'RM 1v1' },
        { matchId: 3, strategy: 'Drush', short: 'Drush', civ: 'Magyars', map: 'Steppe', ladder: 'RM 1v1' },
        { matchId: 4, strategy: 'Archer rush', short: 'Archer rush', civ: 'Franks', map: 'Arabia', ladder: 'RM 1v1' },
      ],
      ranking: [], recent: [{ name: 'Scout rush', short: 'Scouts' }],
    };
    const civNoReplays = summarizeOpeningsByMap(
      fakeOpenings.analyzedMatches, 'Arabia', 'Ethiopians');
    check('sin replays de la civ más usada no se cae a otra civ del mapa',
      civNoReplays.mapCivFavorite === null && civNoReplays.recent.length === 0 &&
        civNoReplays.mapFavorite && civNoReplays.mapFavorite.name === 'Scout rush');

    const calls = { matches: 0, stats: 0, openings: 0 };
    const partials = [];
    const cache = new Map();
    const now = 1700000000000;
    const opts = {
      profileId: 4242, name: 'Rival', civ: 'Magyars', leaderboardId: 4,
      mapName: 'Arabia', currentMatchId: 555, cache, now,
      fetchMatchesImpl: async () => { calls.matches += 1; return historyMatches; },
      getJsonImpl: async (u) => { calls.stats += 1; calls.statsUrl = u; return statsRaw; },
      openingsImpl: async (o) => { calls.openings += 1; calls.openingsArg = o; return fakeOpenings; },
      onPartial: (p) => partials.push(p),
    };
    const report = await buildRivalInsights(opts);
    check('informe: ladder del modo traducida a enum para /stats',
      report.ladder === 'rm_team' &&
        /\/api\/profiles\/4242\/stats\?leaderboard_id=rm_team/.test(calls.statsUrl),
      calls.statsUrl);
    check('informe: el MODO de la partida viaja al módulo de aperturas',
      Boolean(calls.openingsArg && calls.openingsArg.mode) && calls.openingsArg.mode.id === 4 &&
        report.mode && report.mode.id === 4 && report.mode.label === 'RM Team',
      JSON.stringify(report.mode));
    check('informe: últimas 5 civs + civ/mapa favoritos (compatibilidad)',
      report.history.length === 5 && report.favoriteCiv.name === 'Ethiopians' &&
        report.favoriteMap.name === 'Thames');
    check('informe: civ más usada en el MAPA de la partida, no el mapa favorito',
      report.mapStats.name === 'Arabia' && report.mapStats.games === 100 &&
        report.mapStats.winRate === 55 && report.mapStats.civ.name === 'Magyars' &&
        report.mapStats.civ.winRate === 100 && report.mapStats.sampleGames === 2,
      JSON.stringify(report.mapStats));
    check('informe: usa las aperturas REALES que devuelve AoE2Insights',
      calls.openings === 1 && report.openings.favorite.name === 'Scout rush' &&
        report.openingError === null && report.openings.analyzedMatches === undefined);
    check('informe: estrategia con la civ del mapa (replays del mismo modo)',
      report.openings.mapCivFavorite.name === 'Scout rush' &&
        report.openings.mapCivFavorite.count === 2 &&
        report.openings.mapCivAnalyzed === 2 &&
        report.openings.mapFavorite.name === 'Scout rush',
      JSON.stringify({ civ: report.openings.mapCivFavorite, analyzed: report.openings.mapCivAnalyzed }));
    check('informe: las aperturas recientes son del mapa Y de la civ más usada',
      report.openings.recent.length === 2 &&
        report.openings.recent.every((row) => row.map === 'Arabia' && row.civ === 'Magyars'),
      JSON.stringify(report.openings.recent));
    check('informe: NO existe el campo inventado "opening" por civ',
      report.opening === undefined && !('typicalOpening' in report));
    check('primer pintado parcial: civs listas antes de las aperturas lentas',
      partials.length === 1 && partials[0].pendingOpenings === true &&
        partials[0].openings === null && partials[0].history.length === 5);
    check('el informe no rompe el panel: error null y fuentes declaradas',
      report.error === null && report.sources === SOURCES);

    const cached = await buildRivalInsights(opts);
    check('segunda lectura sale de cache, sin repetir requests',
      cached.fromCache === true && calls.matches === 1 && calls.stats === 1 && calls.openings === 1);
    check('hasCachedInsights distingue includeOpenings y el mapa en la clave',
      hasCachedInsights(cache, 4242, 4, { now, includeOpenings: true, mapName: 'Arabia' }) === true &&
        hasCachedInsights(cache, 4242, 4, { now, includeOpenings: false, mapName: 'Arabia' }) === false &&
        hasCachedInsights(cache, 4242, 4, { now, includeOpenings: true, mapName: 'Arena' }) === false);

    const noOpenings = await buildRivalInsights({
      ...opts, profileId: 4243, includeOpenings: false, onPartial: (p) => partials.push(p),
    });
    // Con las aperturas apagadas YA no se consulta AoE2Insights, pero sí se
    // avisa antes: ese parcial NO puede anunciar aperturas en camino.
    const noOpeningsPartials = partials.filter((p) => p.profileId === 4243);
    check('opción desactivada: NO consulta AoE2Insights y el aviso no promete aperturas',
      calls.openings === 1 && noOpenings.openings === null &&
        noOpeningsPartials.every((p) => p.openings === null && p.pendingOpenings === false) &&
        noOpenings.ladder === 'rm_team');

    const broken = await buildRivalInsights({
      ...opts, profileId: 4244,
      fetchMatchesImpl: async () => { throw new Error('historial caído'); },
      getJsonImpl: async () => { throw new Error('stats caídas'); },
    });
    check('APIs caídas: devuelve informe con error, sin lanzar excepción',
      /historial caído/.test(broken.error) && /stats caídas/.test(broken.error) &&
        broken.openings.favorite.name === 'Scout rush' && broken.history.length === 0);
    const beforeInvalid = calls.matches;
    const invalid = await buildRivalInsights({ ...opts, profileId: 0 });
    check('perfil inválido: error controlado y cero requests',
      /inválido/.test(invalid.error) && calls.matches === beforeInvalid);

    // v0.1.22: con el historial completo de replays la consulta de aperturas
    // tarda ~20 s en frío (medido contra la API real). El informe NO puede
    // esperarla: espera acotada + aviso tardío. Esto lo mide de verdad.
    {
      const slowCache = new Map();
      let late = null;
      const startedAt = Date.now();
      const slow = await buildRivalInsights({
        ...opts,
        profileId: 4245,
        cache: slowCache,
        openingsWaitMs: 200,
        openingsImpl: () =>
          new Promise((resolve) => setTimeout(() => resolve(fakeOpenings), 700)),
        onOpenings: (full) => {
          late = { at: Date.now() - startedAt, full };
        },
      });
      const elapsed = Date.now() - startedAt;
      check('aperturas lentas: el informe sale igual, sin esperarlas',
        slow.openings === null && slow.openingsPending === true && elapsed < 600,
        `tardó ${elapsed}ms esperando aperturas`);
      check('aperturas lentas: un informe incompleto NO se cachea',
        slowCache.size === 0, `${slowCache.size} entradas`);
      await new Promise((resolve) => setTimeout(resolve, 750));
      check('aperturas lentas: aviso tardío listo para repintar esa tarjeta',
        Boolean(late && late.full.openings && late.full.openingsPending === false) &&
          late.at >= 600,
        late ? `aviso a ${late.at}ms` : 'no hubo aviso');
    }

    const rivalSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'rival.js'), 'utf8');
    const insightsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'insights.js'), 'utf8');
    check('regresión: no queda ninguna inferencia de apertura por civilización',
      !/openingForCiv|require\(['"]\.\/openings['"]\)/.test(rivalSrc) &&
        !fs.existsSync(path.join(__dirname, '..', 'src', 'openings.js')));
    // PRE-PARTIDA: hay ~60s para leer al rival. El primer dato no puede esperar
    // a que termine todo el recorrido.
    check('dato al instante: /stats y la primera página del historial van en paralelo',
      rivalSrc.indexOf('const firstPagePromise = fetchPage(1)') > 0 &&
        rivalSrc.indexOf('const firstPagePromise = fetchPage(1)') <
          rivalSrc.indexOf('applyStats(await statsPromise)'));
    check('dato al instante: tope de tiempo para las páginas y NUNCA se cachea un fallo',
      /HISTORY_BUDGET_MS/.test(rivalSrc) &&
        /if \(cache && !result\.error && !result\.openingsPending\)/.test(rivalSrc));
    // v0.1.22: con el historial completo de replays (limit 500) la consulta de
    // aperturas tarda ~20 s en frío. Medido en dos cuentas reales, por eso el
    // informe NO puede quedar esperándola: espera acotada + aviso tardío.
    check('aperturas: el informe no se bloquea esperándolas (espera acotada + aviso tardío)',
      /const OPENINGS_WAIT_MS = \d+/.test(rivalSrc) &&
        /Promise\.race\(\[/.test(rivalSrc) &&
        /onOpenings\(applyOpenings\(late\)\)/.test(rivalSrc) &&
        /openingsPending = true/.test(rivalSrc));
    check('aperturas: se pide el historial completo del modo, no las 120 más recientes',
      /const ROW_LIMIT = 500/.test(insightsSrc));
  }

  console.log('\n--- 15) cableado del informe opcional (chequeo estático) ---');
  {
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const main = read('main.js');
    const preload = read('preload.js');
    const settingsPreload = read('settings-preload.js');
    const settingsHtml = read('settings.html');
    const settingsJs = read('settings.js');
    const renderer = read('renderer.js');
    const html = read('index.html');
    const css = read('styles.css');
    const builder = read('electron-builder.json');

    check('las 3 opciones nuevas arrancan APAGADAS en DEFAULT_CONFIG',
      ['rivalCivs', 'rivalFavorites', 'rivalOpenings'].every((key) =>
        new RegExp(`${key}: false`).test(main)));
    check('main.js publica overlay:rival y atiende settings:rivalOption',
      /overlay:rival/.test(main) && /settings:rivalOption/.test(main) &&
        /refreshRivalReports\(state\)/.test(main));
    check('el informe se dispara en segundo plano desde emit(), sin bloquear el ELO',
      /send\('overlay:state', state\)[\s\S]{0,400}refreshRivalReports/.test(main));
    check('main.js usa opponentsOf() de src/rival (excluye aliados en TG)',
      /opponentsOf\(state, RIVAL_LIMIT\)/.test(main) && !/function opponentsOf\(/.test(main));
    check('anti-parpadeo: un idle del REST no borra la partida que está en pantalla',
      /let lastOngoingAt = 0/.test(main) && /ONGOING_HOLD_MS/.test(main) &&
        /matchFinished/.test(main) && /holdingOngoing/.test(main));
    check('pre-partida a prueba de fallos: reintento del informe y rivales en paralelo',
      /function scheduleRivalRetry/.test(main) && /RIVAL_RETRY_MAX = 2/.test(main) &&
        /scheduleRivalRetry\(reports, rivals\)/.test(main) &&
        /await Promise\.all\(rivals\.map/.test(main));
    check('el consejo viaja atado al matchId y sobrevive al arranque de la partida',
      /String\(scoutPayload\.matchId/.test(main) &&
        /scoutPayload\.matchId/.test(renderer) && /sameMatch && tips\.length > 0/.test(renderer));
    // Regresión v0.1.20: el bloque de consejos no tenía regla de ocultado y
    // quedaba abierto (con su texto de "sin datos") toda la partida.
    check('a 0:20 se oculta TODO el contenido del stage, no solo el informe',
      /body\.elo-hidden #panel/.test(css) && /body\.elo-hidden #stage > section/.test(css) &&
        /body\.elo-hidden #analysis/.test(css) &&
        /function applyVisibility\(\)/.test(renderer) &&
        /civHelpEl\.hidden = !\(ongoing/.test(renderer) &&
        /rivalInfoEl\.hidden = !\(ongoing/.test(renderer) &&
        /scoutInfoEl\.hidden = !scoutVisible\(\)/.test(renderer) &&
        /if \(civView\.eloHidden\) return null;/.test(renderer));
    check('un solo pase de visibilidad: nada decide su hidden por su cuenta',
      /function applyVisibility\(\)/.test(renderer) &&
        !/rivalInfoEl\.hidden = false/.test(renderer) &&
        !/scoutInfoEl\.hidden = false/.test(renderer) &&
        !/civHelpEl\.hidden = false/.test(renderer) &&
        /let heightScheduled = false/.test(renderer));
    check('preloads exponen onRival y rivalOption',
      /onRival/.test(preload) && /rivalOption/.test(settingsPreload));
    check('renderer pinta #rivalInfo y respeta eloHidden',
      /renderRivalInfo/.test(renderer) &&
        /const hidden = Boolean\(civView\.eloHidden\) \|\| moving;/.test(renderer) &&
        /rivalOpeningsBlock/.test(renderer));
    check('index.html y styles.css tienen la tarjeta y sus estilos de tema',
      /id="rivalInfo"/.test(html) && /#rivalInfo/.test(css) && /--panel-bg/.test(css));
    check('configuración: 5 toggles cableados y sin referencias a webs externas',
      ['civHelp', 'hideEloAt20', 'rivalCivs', 'rivalFavorites', 'rivalOpenings'].every((key) =>
        settingsHtml.includes(`id="${key}"`) && settingsJs.includes(key)) &&
        !/AoE2Insights|AoE2 Companion|aoe2insights\.com/.test(settingsHtml));
    check('electron-builder incluye src/**/* (insights.js y rival.js van en el asar)',
      /"src\/\*\*\/\*"/.test(builder));
  }

  console.log('\n--- 15bis) head-to-head y civ recomendada (src/mine.js, sin red) ---');
  {
    const MY = 500;
    const RIVAL = 600;
    const ALLY = 700;
    const T = (teamId, players) => ({ teamId, players });
    const P = (profileId, name, civName, won) => ({
      profileId, name, civName, won, slot: profileId, status: 'player',
    });
    const rawMatch = (matchId, mapName, teams, started, leaderboardId = 'rm_team') => ({
      matchId, mapName, leaderboardId, leaderboardName: 'RM Team',
      started: new Date(Date.parse(started)).toISOString(),
      finished: new Date(Date.parse(started) + 22 * 60 * 1000).toISOString(),
      teams,
    });
    // m1: yo+aliado vs rival, gano · m2: igual, pierdo · m3: el rival en MI
    // equipo (aliados) · m4: 1v1 contra el rival, gano · m5: 1v1 contra OTRO
    // jugador en Arabia (para la cascada del recomendador, no toca el h2h).
    const rawMatches = [
      rawMatch(1, 'Arabia', [T(1, [P(MY, 'Yo', 'Franks', true), P(ALLY, 'Aliado', 'Vikings', true)]), T(2, [P(RIVAL, 'Rival', 'Poles', false)])], '2026-11-01T12:00:00Z'),
      rawMatch(2, 'Arabia', [T(1, [P(MY, 'Yo', 'Franks', false), P(ALLY, 'Aliado', 'Vikings', false)]), T(2, [P(RIVAL, 'Rival', 'Poles', true)])], '2026-11-02T12:00:00Z'),
      rawMatch(3, 'Steppe', [T(1, [P(MY, 'Yo', 'Mongols', true), P(RIVAL, 'Rival', 'Poles', true)]), T(2, [P(7, 'Otro', 'Huns', false)])], '2026-11-03T12:00:00Z'),
      rawMatch(4, 'Runestones', [T(1, [P(MY, 'Yo', 'Franks', true)]), T(2, [P(RIVAL, 'Rival', 'Poles', false)])], '2026-11-10T12:00:00Z'),
      rawMatch(5, 'Arabia', [T(1, [P(MY, 'Yo', 'Franks', true)]), T(2, [P(800, 'Otro Más', 'Huns', false)])], '2026-11-11T12:00:00Z'),
    ];
    const history = await fetchMyHistory({
      profileId: MY,
      leaderboardId: 4,
      fetchMatchesImpl: async () => rawMatches.map((m) => normalizeMatch(m)),
      sleep: async () => {},
    });
    check('mi historial: pagina, normaliza y ordena de más nueva a más vieja',
      history.rows.length === 5 && history.error === null &&
        history.rows[0].matchId === 5 && history.rows[0].myTeam === 1 &&
        history.rows[0].players.length === 2,
      JSON.stringify(history.rows.map((r) => r.matchId)));

    const h2h = computeH2H(history.rows, RIVAL);
    check('h2h: solo enfrentamientos; los aliados van aparte y la última es la más nueva',
      h2h.games === 3 && h2h.wins === 2 && h2h.losses === 1 && h2h.asAllies === 1 &&
        h2h.lastMatch && h2h.lastMatch.mapName === 'Runestones' && h2h.lastMatch.won === true,
      JSON.stringify(h2h));
    check('h2h: los últimos 3 enfrentamientos traen MI civ, resultado y mapa',
      Array.isArray(h2h.recent) && h2h.recent.length === 3 &&
        h2h.recent[0].mapName === 'Runestones' && h2h.recent[0].won === true &&
        h2h.recent[0].civ === 'Franks' && h2h.recent[1].won === false,
      JSON.stringify(h2h.recent));
    const h2hUnknown = computeH2H(history.rows, 999);
    check('h2h: un jugador que nunca compartió partida da cero en todo',
      h2hUnknown.games === 0 && h2hUnknown.asAllies === 0 && h2hUnknown.lastMatch === null);

    // Cascada del recomendador: Arabia tiene Franks ×3 (m1, m2, m5) → scope
    // 'map'. Mongols tiene 1 partida en el mapa pero 1 también en total → fuera.
    const civs = computeMyMapCivs(history.rows, 'Arabia');
    check('mis civs del mapa: cascada mapa→modo y mínimo de muestra',
      civs.length === 1 && civs[0].civ === 'Franks' && civs[0].games === 3 &&
        civs[0].wins === 2 && civs[0].winRate === 67 && civs[0].scope === 'map',
      JSON.stringify(civs));
    // Sin mapa exacto (o sin muestra en él): cae al modo completo Y LO DECLARA.
    const civsMode = computeMyMapCivs(history.rows, 'Arena');
    check('mis civs: si el mapa no llega a la muestra, cae al modo completo con scope declarado',
      civsMode.length === 1 && civsMode[0].civ === 'Franks' && civsMode[0].games === 4 &&
        civsMode[0].wins === 3 && civsMode[0].scope === 'mode',
      JSON.stringify(civsMode));

    const rec = buildCivRecommendation({
      weakAgainst: [
        { civ: 'Gurjaras', games: 5, losses: 4, lossRate: 80 },
        { civ: 'Teutons', games: 7, losses: 4, lossRate: 57 },
      ],
      myCivs: [
        { civ: 'Gurjaras', slug: 'gurjaras', games: 9, wins: 6, winRate: 67 },
        { civ: 'Franks', slug: 'franks', games: 2, wins: 2, winRate: 100 }, // 2 pj < mínimo: no entra
        { civ: 'Mongols', slug: 'mongols', games: 5, wins: 1, winRate: 20 },
      ],
    });
    check('civ recomendada: score 0.6×mía + 0.4×del rival, con ambas evidencias',
      rec.length === 3 && rec[0].civ === 'Gurjaras' && rec[0].score === 72 &&
        rec[0].mine.games === 9 && rec[0].vsRival.lossRate === 80,
      JSON.stringify(rec));
    check('civ recomendada: abajo del mínimo de muestra propia no entra (nunca inventa)',
      rec[1].civ === 'Teutons' && rec[1].mine === null && rec[1].score === 57 &&
        !rec.some((row) => row.civ === 'Franks'));
    check('civ recomendada: sin datos en ninguna dimensión devuelve vacío',
      buildCivRecommendation({ weakAgainst: [], myCivs: [] }).length === 0);
    check('civ recomendada: respeta el límite de líneas',
      buildCivRecommendation({
        weakAgainst: [
          { civ: 'A', games: 5, losses: 4, lossRate: 80 },
          { civ: 'B', games: 5, losses: 4, lossRate: 70 },
          { civ: 'C', games: 5, losses: 4, lossRate: 60 },
          { civ: 'D', games: 5, losses: 4, lossRate: 55 },
        ],
        myCivs: [],
      }).length === 3);

    // Cache de mi historial: misma clave por perfil+modo, un solo pedido.
    const cache = new Map();
    let fetchCalls = 0;
    const impl429 = async (id, perPage, page) => {
      fetchCalls += 1;
      if (fetchCalls === 1) throw new Error('HTTP 429 en /api/matches');
      return [];
    };
    const retried = await fetchMyHistory({
      profileId: 555, leaderboardId: 3, cache, now: 1000,
      fetchMatchesImpl: impl429, sleep: async () => {},
    });
    check('mi historial: reintenta el HTTP 429 y cachea vacío',
      retried.fromCache === false && fetchCalls === 2 && cache.has(mineCacheKey(555, 3)));
    const again = await fetchMyHistory({
      profileId: 555, leaderboardId: 3, cache, now: 1000 + 60 * 1000,
      fetchMatchesImpl: async () => { fetchCalls += 1; return []; },
    });
    check('mi historial: segunda lectura sale de cache sin pegarle a la red',
      again.fromCache === true && fetchCalls === 2);
    check('mi historial: la clave de cache separa por modo',
      mineCacheKey(555, 3) !== mineCacheKey(555, 4) &&
        mineCacheKey(555, null).endsWith('sin-modo'));

    // Cableado estático de las opciones nuevas.
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const mainSrc = read('main.js');
    const rendererSrc = read('renderer.js');
    const settingsHtmlSrc = read('settings.html');
    const settingsJsSrc = read('settings.js');
    const settingsPreloadSrc = read('settings-preload.js');
    const htmlSrc = read('index.html');
    const cssSrc = read('styles.css');
    const scoutSrc = read('src/scout.js');
    check('DEFAULT_CONFIG: las 3 opciones nuevas arrancan APAGADAS',
      ['rivalH2H', 'civRecommender', 'tgBalance'].every((key) =>
        new RegExp(`${key}: false`).test(mainSrc)));
    check('rivalH2H arma el informe y viaja en su firma; civRecommender entra al whitelist',
      /RIVAL_REPORT_KEYS = \[[^\]]*'rivalH2H'/.test(mainSrc) &&
        /RIVAL_OPTION_KEYS = \[[^\]]*'civRecommender'/.test(mainSrc));
    check('emit dispara el head-to-head en segundo plano, tras el consejo',
      /refreshScoutTips\(state\)\.catch\(\(\) => \{\}\);[\s\S]{0,220}refreshH2H\(state\)\.catch/.test(mainSrc));
    check('sendRival inyecta el h2h sin que las etapas del informe lo pisen',
      /function decorateH2H/.test(mainSrc) && /h2hByRival\.has\(/.test(mainSrc) &&
        /clearRivalReports[\s\S]{0,400}h2hByRival\.clear\(\)/.test(mainSrc));
    check('el consejo comparte flujo con la civ recomendada (guard y opciones)',
      /!view\.smartTips && !view\.civRecommender\)/.test(mainSrc) &&
        /recommend: Boolean\(view\.civRecommender\)/.test(mainSrc) &&
        /myHistoryImpl: view\.civRecommender && runtimeProfileId\(\)/.test(mainSrc));
    check('IPC del balance: settings:tgBalance persiste y reenvía config',
      /ipcMain\.handle\('settings:tgBalance'/.test(mainSrc) &&
        /tgBalance: \(on\) => ipcRenderer\.invoke\('settings:tgBalance', on\)/.test(settingsPreloadSrc));
    check('config viaja al renderer: rivalH2H, civRecommender y tgBalance',
      /rivalH2H: Boolean\(view\.rivalH2H\)/.test(mainSrc) &&
        /civRecommender: Boolean\(view\.civRecommender\)/.test(mainSrc) &&
        /tgBalance: Boolean\(view\.tgBalance\)/.test(mainSrc));
    // v0.1.22: el cara a cara usa el mismo hero que el mapa; los aliados van
    // en el subtítulo en vez de en un tile propio.
    check('renderer: cara a cara con tono solo con muestra y aliados en el subtítulo',
      /function rivalH2HBlock/.test(rendererSrc) && /Cara a cara/.test(rendererSrc) &&
        /de aliados/.test(rendererSrc) && /Number\(h2h\.games\) >= 3/.test(rendererSrc));
    // v0.1.23-ui: con menos de 5 partidas el porcentaje es ruido (Wilson
    // ~44-100 % con n=3). La fila se omite entera en vez de publicar un
    // "— sin muestra" que no ayuda a decidir en la pantalla de carga.
    check('renderer: la civ recomendada solo publica filas con muestra real',
      /Civ recomendada/.test(rendererSrc) && /row\.mine\.games/.test(rendererSrc) &&
        /row\.vsRival\.games/.test(rendererSrc) &&
        /mineN >= 5 \|\| rivalN >= 5/.test(rendererSrc));
    check('renderer: la tarjeta scout muestra cada bloque con su opción',
      /if \(smartTipsEnabled\) \{[\s\S]{0,140}scoutTipSections/.test(rendererSrc) &&
        /\(smartTipsEnabled \|\| civRecommenderEnabled\)/.test(rendererSrc));
    // Regresión de diseño: la etiqueta va ARRIBA del contenido. Con la etiqueta
    // en la misma fila cada frase arrancaba en una x distinta (zigzag) y el
    // texto se cortaba con '…'.
    check('renderer: el consejo usa bloques etiquetados, sin frases con la etiqueta adelante',
      /function scoutSection/.test(rendererSrc) && /scout-key/.test(rendererSrc) &&
        /scout-chip/.test(rendererSrc) && /rec-item/.test(rendererSrc) &&
        !/scout-line/.test(rendererSrc));
    check('renderer: h2h muestra los últimos enfrentamientos y declara dónde buscó',
      /h2h\.recent/.test(rendererSrc) && /rival-civ-list/.test(rendererSrc) &&
        /tus últimas \$\{fmtNumber\(scanned\)\} partidas/.test(rendererSrc) &&
        /Sin historial público reciente/.test(rendererSrc));
    check('renderer: balance por MEDIANA, con rango si el equipo está disperso',
      /function renderBalance/.test(rendererSrc) && /medianOf/.test(rendererSrc) &&
        /length >= 2/.test(rendererSrc) && /de \$\{fmtNumber\(min\)\} a \$\{fmtNumber\(max\)\}/.test(rendererSrc) &&
        /parcial/.test(rendererSrc) && /balanceEl\.hidden/.test(rendererSrc));
    check('renderer: la civ recomendada declara si su winrate viene del modo completo',
      /scope === 'mode' \? ' · modo'/.test(rendererSrc) &&
        /no solo de este mapa/.test(rendererSrc));
    check('overlay y estilos: la línea de balance existe y se oculta sola',
      /id="balance"/.test(htmlSrc) && /#balance \{/.test(cssSrc) && /#balance\[hidden\]/.test(cssSrc));
    check('configuración: los 3 toggles nuevos cableados',
      ['rivalH2H', 'civRecommender', 'tgBalance'].every((key) =>
        settingsHtmlSrc.includes(`id="${key}"`) && settingsJsSrc.includes(key)));
    check('scout: la recomendación falla SOFT, sin tirar el consejo',
      /recommendError = err\.message/.test(scoutSrc) && /buildCivRecommendation/.test(scoutSrc));
    // v0.1.23-tactics: señales que cambian una decisión dentro de la partida.
    check('scout: distribución agresivo/boom sobre replays ya cargados (coste cero)',
      /STYLE_KINDS/.test(scoutSrc) && /function styleProfile/.test(scoutSrc) &&
        /style: styleProfile\(/.test(scoutSrc) && /'Fast castle': 'boom'/.test(scoutSrc) &&
        !/Fast imperial/.test(scoutSrc));
    check('scout: "le duele" exige una derrota real, no un 39 %',
      /entry\.lossRate >= WEAK_MIN_LOSS_RATE/.test(scoutSrc));
    check('renderer: tira táctica con estilo, counter y ritmo',
      /class="tac-strip"/.test(rendererSrc) && /tip\.style/.test(rendererSrc) &&
        /tip\.tempo/.test(rendererSrc) && /LE DUELE/.test(rendererSrc));
    check('renderer: porcentaje solo con muestra real; si no, fracción',
      /TAC_MIN_PCT_GAMES = 20/.test(rendererSrc) && /function tacBig/.test(rendererSrc));
    check('renderer: smurf heurístico desde peak/rating, sin score inventado',
      /function smurfSignal/.test(rendererSrc) && /player\.peak/.test(rendererSrc) &&
        /POSIBLE SMURF/.test(rendererSrc));
    check('renderer: la racha no aparece como señal pre-partida',
      !/racha de resultados/.test(rendererSrc));
    check('scout: sin dominancia clara se declara MIXTO, no una falsa etiqueta',
      /STYLE_MIN_DOMINANCE/.test(scoutSrc) && /mixed \? 'mixto'/.test(scoutSrc));
    check('renderer: 8/11 declara qué significa y el consejo de ritmo exige muestra',
      /derrotas \/ partidas/.test(rendererSrc) &&
        /TAC_MIN_TEMPO_BUCKET/.test(rendererSrc) && /enoughTempo/.test(rendererSrc));
    check('ajustes: el head-to-head aclara que solo cuenta el mismo modo de juego',
      /Tu V-D contra este rival · del mismo modo de juego/.test(settingsHtmlSrc));
  }

  console.log('\n--- 16) Modo ejemplo: última partida REAL como panel (sin red) ---');
  {
    const REAL_STARTED = Date.parse('2026-11-09T16:25:00Z');
    const REAL_FINISHED = Date.parse('2026-11-09T16:42:00Z');
    const EXAMPLE_MATCH = {
      matchId: 519930302,
      mapName: 'Thames',
      leaderboardId: 'ew_1v1',
      leaderboardName: 'EW 1v1',
      startedAt: REAL_STARTED,
      finishedAt: REAL_FINISHED, // ya terminada: buildSnapshot la descartaría
      players: [
        { profileId: 25399083, name: 'PSX | Acido', civ: 'Gurjaras', team: 1, slot: 0, matchRating: 1600, won: true },
        { profileId: 1135135, name: 'Митхун', civ: 'Cumans', team: 2, slot: 1, matchRating: 1500, won: false },
      ],
    };

    const NOW = 1800000000000;
    const cache = new Map();
    let askedLadder = null;
    let statsCalls = 0;
    let latestCalls = 0;
    let latestId = null;

    const fakeStats = async (ids, ladderId) => {
      askedLadder = ladderId;
      statsCalls += 1;
      return new Map(ids.map((id) => [id, {
        rating: id === 25399083 ? 1180 : 901,
        peak: id === 25399083 ? 1180 : 987,
        rank: id === 25399083 ? 13918 : 25000,
        wins: 40,
        losses: 30,
      }]));
    };
    const fakeLatest = async (id) => {
      latestCalls += 1;
      latestId = id;
      return EXAMPLE_MATCH;
    };

    const partials = [];
    const snap = await buildExampleSnapshot({
      profileId: 25399083,
      cache,
      now: NOW,
      clockOffsetMs: 3000,
      fetchLatestImpl: fakeLatest,
      fetchStatsImpl: fakeStats,
      onPartial: (s) => partials.push(s),
    });

    check('busca la última partida del perfil escrito en el campo', latestCalls === 1 && latestId === 25399083);
    check('una partida YA TERMINADA se pinta igual (buildSnapshot la descartaría)',
      snap.status === 'ongoing' && snap.example.alreadyFinished === true);
    check('la marca example conserva partida real y fecha original',
      snap.example.matchId === 519930302 && snap.example.realStartedAt === REAL_STARTED &&
      snap.example.finishedAt === REAL_FINISHED && snap.example.clockOffsetMs === 3000);
    check('lo ÚNICO simulado es el reloj: startedAt = now - offset',
      snap.match.startedAt === NOW - 3000 && snap.checkedAt === NOW && snap.match.startedAt !== REAL_STARTED);
    check('mapa, modo, nombres y civilizaciones son los reales',
      snap.match.mapName === 'Thames' && snap.ladder.label === 'EW 1v1' &&
      snap.players.length === 2 && snap.players[0].civ === 'Gurjaras' && snap.players[1].civ === 'Cumans');
    check('el ELO se pide a RM 1v1 (#3), nunca al ladder del modo EW',
      askedLadder === 3 && snap.eloLadder.id === 3);
    check('pinta ELO/pico/rank reales de 1v1, no el rating del modo',
      snap.players[0].rating === 1180 && snap.players[0].peak === 1180 &&
      snap.players[1].rating === 901 && snap.players[0].matchRating === 1600 &&
      snap.players[0].hasStats === true);
    check('"VOS" apunta al perfil BUSCADO, no a la cuenta local',
      snap.players[0].isYou === true && snap.players[1].isYou === false);
    check('dos fases: parcial con ELO pendiente y final completo',
      partials.length === 1 && partials[0].pending === true &&
      partials[0].players[0].rating === null && snap.pending === false);
    check('el parcial también lleva la marca example (el estado real no lo pisa)',
      Boolean(partials[0].example) && partials[0].example.matchId === 519930302);

    // Cambiar de 0:03 a 0:21 reutiliza la partida en memoria y la cache de ELO.
    const NOW2 = NOW + 60000;
    const snap21 = await buildExampleSnapshot({
      profileId: 25399083,
      cache,
      now: NOW2,
      clockOffsetMs: 21000,
      fetchLatestImpl: async () => { throw new Error('no debe consultar la API'); },
      fetchStatsImpl: async () => { throw new Error('no debe consultar la API'); },
      match: EXAMPLE_MATCH,
    });
    check('cambiar el reloj NO vuelve a pegarle a ninguna API',
      latestCalls === 1 && statsCalls === 1);
    check('0:21 mueve solo el reloj de prueba; la partida real queda intacta',
      snap21.match.startedAt === NOW2 - 21000 && snap21.match.matchId === 519930302 &&
      snap21.example.realStartedAt === REAL_STARTED && snap21.players[0].rating === 1180);

    const rivalFirst = await buildExampleSnapshot({
      profileId: 1135135,
      cache: new Map(),
      now: NOW,
      fetchLatestImpl: async () => EXAMPLE_MATCH,
      fetchStatsImpl: fakeStats,
    });
    check('si el ejemplo es de OTRO jugador, "VOS" y los rivales se recalculan',
      rivalFirst.players.find((p) => p.profileId === 1135135).isYou === true &&
      rivalFirst.players.find((p) => p.profileId === 25399083).isYou === false);

    const raw = normalizeMatch({
      matchId: 519930302,
      mapName: 'Thames',
      leaderboardId: 'ew_1v1',
      started: '2026-11-09T16:25:00Z',
      finished: '2026-11-09T16:42:00Z',
      teams: [
        { teamId: 1, players: [{ profileId: 25399083, name: 'PSX | Acido', civName: 'Gurjaras', slot: 0, rating: 1600 }] },
        { teamId: 2, players: [{ profileId: 1135135, name: 'Митхун', civName: 'Cumans', slot: 1, rating: 1500 }] },
      ],
    });
    check('el payload real de /api/matches se normaliza con civs y equipos',
      raw.players.length === 2 && raw.players[0].civ === 'Gurjaras' &&
      raw.players[1].team === 2 && raw.finishedAt === REAL_FINISHED);
    const fromRaw = await buildExampleSnapshot({
      profileId: 25399083,
      cache: new Map(),
      now: NOW,
      fetchLatestImpl: async () => raw,
      fetchStatsImpl: fakeStats,
    });
    check('el ejemplo consume directamente el match normalizado de Companion',
      fromRaw.example.realStartedAt === REAL_STARTED && fromRaw.players[1].civ === 'Cumans');

    const badId = await buildExampleSnapshot({
      profileId: 0, cache: new Map(), now: NOW,
      fetchLatestImpl: fakeLatest, fetchStatsImpl: fakeStats,
    }).then(() => null, (err) => err);
    check('profile ID inválido → error claro, sin panel inventado',
      badId instanceof Error && /no es válido/i.test(badId.message));

    const noMatches = await buildExampleSnapshot({
      profileId: 25399083, cache: new Map(), now: NOW,
      fetchLatestImpl: async () => null, fetchStatsImpl: fakeStats,
    }).then(() => null, (err) => err);
    check('perfil sin partidas públicas → error claro, sin datos de relleno',
      noMatches instanceof Error && /partidas públicas/i.test(noMatches.message));
  }

  console.log('\n--- 17) reloj congelado del ejemplo: 0:03 visible / 0:21 oculto ---');
  {
    const { trackIntro, introView } = require('../src/intro');
    const ALL_ON = { civHelp: true, hideEloAt20: true, rivalCivs: true, rivalFavorites: true, rivalOpenings: true };
    const NOW = 1800000000000;
    const stateAt = (offset) => ({
      status: 'ongoing',
      phase: 'match',
      match: { matchId: 519930302, startedAt: NOW - offset },
      example: { matchId: 519930302 },
      players: [],
    });

    const intro3 = trackIntro(null, stateAt(3000), NOW);
    const v3 = introView(intro3, ALL_ON, NOW);
    check('congelado en 0:03 → ayuda de civ visible y ELO visible',
      v3.civHelpVisible === true && v3.eloHidden === false && v3.elapsed === 3000);
    const intro21 = trackIntro(null, stateAt(21000), NOW);
    const v21 = introView(intro21, ALL_ON, NOW);
    check('congelado en 0:21 → ayuda y ELO ocultos (no molesta en la partida)',
      v21.civHelpVisible === false && v21.eloHidden === true && v21.elapsed === 21000);
    check('el mismo ejemplo no reinicia el reloj al repintar',
      introView(trackIntro(intro3, stateAt(3000), NOW), ALL_ON, NOW).elapsed === 3000 &&
      trackIntro(intro3, stateAt(3000), NOW) === intro3);
    check('al terminar el ejemplo el ELO vuelve a estar visible',
      !introView(trackIntro(intro21, { status: 'idle' }, NOW), ALL_ON, NOW).eloHidden);
    check('sin las opciones forzadas, 0:21 no ocultaría nada',
      !introView(intro21, { civHelp: false, hideEloAt20: false }, NOW).eloHidden);
    check('pre-partida (lobby) no arranca el reloj ni en el ejemplo',
      trackIntro(null, { ...stateAt(3000), phase: 'lobby' }, NOW) === null);
  }

  console.log('\n--- 18) cableado del Modo ejemplo (chequeo estático) ---');
  {
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const main = read('main.js');
    const aoe = read('src/aoe.js');
    const settingsPreload = read('settings-preload.js');
    const settingsHtml = read('settings.html');
    const settingsJs = read('settings.js');
    const settingsCss = read('settings.css');
    const renderer = read('renderer.js');
    const css = read('styles.css');
    const builder = read('electron-builder.json');

    // Desde la orquestación del ejemplo hasta los IPC: acá NO debe haber ninguna
    // escritura de config.json (el override es solo de pintado, en memoria).
    const exampleBlock = main.slice(
      main.indexOf('const EXAMPLE_CACHE_TTL'),
      main.indexOf('function registerIpc()'),
    );

    check('main.js usa buildExampleSnapshot (no hay roster de maqueta)',
      /buildExampleSnapshot/.test(main) && /buildExampleSnapshot/.test(aoe) &&
      !/src\/example-data|fakeRoster|MOCK_ROSTER/.test(main));
    check('EXAMPLE_ALL_ON enciende las 5 opciones solo en memoria',
      /const EXAMPLE_ALL_ON = \{[\s\S]*?civHelp: true[\s\S]*?hideEloAt20: true[\s\S]*?rivalCivs: true[\s\S]*?rivalFavorites: true[\s\S]*?rivalOpenings: true/.test(main) &&
      // El flag de desarrollo `--example-real-config` solo salta el forzado
      // para sacar capturas con la config real; por defecto sigue forzando.
      /function viewConfig\(\) \{[\s\S]{0,200}!exampleActive[\s\S]{0,200}return \{ \.\.\.config, \.\.\.EXAMPLE_ALL_ON \};/.test(main));
    check('el ejemplo NO guarda nada en config.json ni toca la cuenta',
      exampleBlock.length > 1000 && !/persistConfig\s*\(|writeFileSync|chooseProfile/.test(exampleBlock));
    check('emit() bloquea el estado real mientras el ejemplo está activo',
      /if \(exampleActive && !\(state && state\.example\)\) return false;/.test(main));
    check('poll() no pisa el ejemplo y clockNow() respeta el reloj congelado',
      /lastPollStatus = 'ejemplo'/.test(main) &&
      /function clockNow\(\) \{[\s\S]{0,160}exampleFrozenAt != null \? exampleFrozenAt : Date\.now\(\)/.test(main));
    check('sendView() manda frozenElapsedMs y no reprograma timers congelados',
      /frozenElapsedMs: exampleFrozenAt != null \? view\.elapsed : null/.test(main) &&
      /!intro \|\| !intro\.engaged \|\| exampleFrozenAt != null/.test(main));
    check('settings:clock soporta el objeto { startedAt, elapsedMs } del ejemplo',
      /startedAt: clock,[\s\S]{0,200}elapsedMs: exampleFrozenAt != null/.test(main));
    check('settings:get publica example y el tiempo fijo',
      /exampleClockElapsedMs:/.test(main) && /example: exampleStatus\(\)/.test(main));
    check('deactivateExample devuelve la config REAL y limpia el estado',
      /function deactivateExample\(\)[\s\S]{0,900}send\('overlay:config', overlayConfig\(\)\)/.test(main) &&
      /clearRivalReports\(\)/.test(exampleBlock));
    check('3 IPC nuevos: exampleStart / exampleClock / exampleStop',
      ['settings:exampleStart', 'settings:exampleClock', 'settings:exampleStop'].every((ch) => main.includes(ch)));
    check('settings-preload expone los 3 invokes y onExample',
      ['exampleStart:', 'exampleClock:', 'exampleStop:', 'onExample:'].every((k) => settingsPreload.includes(k)));
    check('panel compacto: 4 pestañas (sin Comandos), sin Probar ni botones Atrás/Siguiente',
      ['player', 'overlay', 'skins', 'updater'].every((p) =>
        settingsHtml.includes(`data-page="${p}"`)) &&
        !settingsHtml.includes('data-page="comandos"') &&
        !/id="exampleUser"|Ver test|id="backBtn"|id="nextBtn"/.test(settingsHtml));
    check('pie limpio: sin ruta de config.json ni aviso de panel no clickeable',
      !settingsHtml.includes('Esc</b> la cierra') &&
        !settingsHtml.includes('id="configPath"') &&
        !settingsHtml.includes('El panel no se puede clickear') &&
        !settingsJs.includes('configPathEl') &&
        !settingsJs.includes("'comandos'"));
    const overlayHtmlCredit = read('index.html');
    const mainCredit = read('main.js');
    check('crédito By Acido: solo en el pie del riel, junto a la versión',
      !/By acido/i.test(overlayHtmlCredit) &&
        !/By acido/i.test(mainCredit) &&
        !/by Acido/.test(settingsHtml) &&
        (settingsHtml.match(/By acido/g) || []).length === 1 &&
        /id="version"[\s\S]{0,120}By acido/.test(settingsHtml));
    check('settings.js navega 4 pestañas y no cablea el ejemplo',
      ['player', 'overlay', 'skins', 'updater'].every((p) => settingsJs.includes(`'${p}'`)) &&
        !/window\.settings\.exampleStart/.test(settingsJs) &&
        !/window\.settings\.onExample/.test(settingsJs));
    check('renderer: badge EJEMPLO, pie con partida real y cuenta regresiva congelada',
      /example-badge/.test(renderer) && /partida real #/.test(renderer) &&
      /civFrozenElapsed/.test(renderer) && /classList\.toggle\('example'/.test(renderer));
    check('estilos del ejemplo en styles.css y settings.css',
      /\.example-badge/.test(css) && /#panel\.example/.test(css) &&
      /\.example-meta/.test(settingsCss) && /\.example-status/.test(settingsCss));
    check('flags CLI de verificación y --isolated',
      ['--example=', '--example-clock=', '--example-settings-shot', '--example-cycle', '--isolated']
        .every((flag) => main.includes(flag)));
    check('electron-builder empaqueta settings-preload.js y src/**/*',
      /"settings-preload\.js"/.test(builder) && /"src\/\*\*\/\*"/.test(builder));
  }

  console.log('\n--- 19) aperturas y civs filtradas por MODO DE JUEGO (EW no es RM) ---');
  {
    const {
      resolveMode, ladderMode, sameMode, parseOpeningRows, emptyOpenings,
      buildRivalOpenings, hasCachedOpenings, openingsCacheKey, buildMatchUpsUrl,
    } = require('../src/insights');
    const { parseRivalHistory } = require('../src/rival');
    const now = 1700000000000;

    check('resolveMode: números, enums de Companion y etiquetas de Insights',
      resolveMode(13).id === 13 && resolveMode('ew_1v1').id === 13 &&
        resolveMode('EW 1v1').id === 13 && resolveMode(3).id === 3 &&
        resolveMode('rm_team').id === 4 && resolveMode(1).group === 'dm' &&
        resolveMode(17).group === 'ew' && resolveMode(27).group === 'event');
    check('resolveMode: unranked/custom/quickplay NO se resuelven (no se mezcla)',
      resolveMode(0) === null && resolveMode('unranked') === null &&
        resolveMode('qp_1v1') === null && resolveMode('Empire Wars') === null &&
        resolveMode(null) === null && resolveMode(undefined) === null);
    check('ladderMode/sameMode: solo cuenta la ladder EXACTA del partido',
      sameMode('EW 1v1', resolveMode(13)) === true &&
        sameMode('RM 1v1', resolveMode(13)) === false &&
        sameMode('RM 1v1', resolveMode(3)) === true &&
        sameMode('RM Team', resolveMode(3)) === false &&
        sameMode('EW 1v1 (Controller)', resolveMode(17)) === true &&
        sameMode('EW 1v1 (Controller)', resolveMode(13)) === false &&
        sameMode('Unranked', resolveMode(13)) === false &&
        sameMode(null, resolveMode(13)) === false);
    check('ladderMode: Unknown y vacío no son un modo válido',
      ladderMode('Unknown') === null && ladderMode('') === null && ladderMode(null) === null);

    // Reproduce el caso real: las 10 filas de un rival mezclan EW 1v1, RM Team,
    // RM 1v1 y un evento. Sin filtro, "Fast castle 60%" mezclaba modos.
    const mixed = {
      count: 10,
      rows: {
        match_id: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        strategy: ['Fast castle', 'Fast castle', 'Drush', 'Scout rush', 'Scout rush',
          'Scout rush', 'Archer rush', 'Fast castle', 'Drush', 'Unknown'],
        civilization: ['Cumans', 'Gurjaras', 'Franks', 'Huns', 'Celts',
          'Britons', 'Magyars', 'Persians', 'Gurjaras', 'Vikings'],
        map: ['Glade', 'Glade', 'Arabia', 'Arabia', 'Arabia',
          'Steppe', 'Arabia', 'Arabia', 'Glade', 'Arabia'],
        ladder: ['EW 1v1', 'EW 1v1', 'RM Team', 'RM 1v1', 'RM 1v1',
          'RM Team', 'RM Team', 'RM 1v1', 'EW 1v1', 'Unranked'],
        started_time: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        player_name: Array(10).fill('Rival'),
      },
    };
    const ew = parseOpeningRows(mixed, { mode: resolveMode(13) });
    check('EW 1v1: solo cuentan los replays de EW 1v1 (nada de RM)',
      ew.mode.id === 13 && ew.uniqueMatches === 3 && ew.analyzed === 3,
      `${ew.uniqueMatches} únicas / ${ew.analyzed} analizadas`);
    check('EW 1v1: favorita real del modo (Fast castle 2/3, 67%)',
      ew.favorite.name === 'Fast castle' && ew.favorite.count === 2 && ew.favorite.share === 67,
      `${ew.favorite.name} ${ew.favorite.count} (${ew.favorite.share}%)`);
    check('los replays de otros modos se descartan y se CONTABILIZAN',
      ew.discardedOtherModes === 7, `${ew.discardedOtherModes} descartados`);
    check('EW 1v1: los chips recientes son todos del mismo modo',
      ew.recent.length === 3 && ew.recent.every((r) => r.ladder === 'EW 1v1'));
    const rm = parseOpeningRows(mixed, { mode: resolveMode(3) });
    check('RM 1v1: resultado distinto y también correcto por separado',
      rm.uniqueMatches === 3 && rm.analyzed === 3 && rm.favorite.name === 'Scout rush' &&
        rm.favorite.count === 2 && rm.discardedOtherModes === 7);
    const rmTeam = parseOpeningRows(mixed, { mode: resolveMode(4) });
    check('RM Team: la favorita del modo es Drush/Scout/Archer, nunca la de EW',
      rmTeam.uniqueMatches === 3 && rmTeam.analyzed === 3 &&
        !/Fast castle/.test(rmTeam.recent.map((r) => r.name).join(',')));
    const sinModo = parseOpeningRows(mixed);
    check('sin modo se conserva el conteo completo (retrocompatible)',
      sinModo.uniqueMatches === 10 && sinModo.analyzed === 9 && sinModo.mode === null);

    // Sin ladder rankeado: NI UNA request. Mejor mostrar "no disponible" que
    // mezclar aperturas de RM con una partida de EW.
    let ewNet = 0;
    const unavailable = await buildRivalOpenings({
      profileId: 4242, cache: new Map(), now,
      fetchImpl: async () => { ewNet += 1; throw new Error('no debería llamarse'); },
    });
    const unavailable2 = await buildRivalOpenings({
      profileId: 4242, leaderboardId: 'unranked', cache: new Map(), now,
      fetchImpl: async () => { ewNet += 1; throw new Error('no debería llamarse'); },
    });
    check('custom/unranked: no consulta AoE2Insights y avisa modo no disponible',
      unavailable.modeUnavailable === true && unavailable.ok === true &&
        unavailable.analyzed === 0 && unavailable.favorite === null &&
        unavailable2.modeUnavailable === true && ewNet === 0,
      `${ewNet} requests`);

    // Con modo se hace la request con los DOS filtros.
    let capturedUrl = '';
    const ewFetch = async (u) => {
      ewNet += 1; capturedUrl = u;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => mixed };
    };
    const ewCache = new Map();
    const ewLive = await buildRivalOpenings({
      profileId: 4242, leaderboardId: 13, cache: ewCache, now, fetchImpl: ewFetch,
    });
    const ewFilters = new URL(capturedUrl).searchParams.getAll('filter').map((raw) => JSON.parse(raw));
    check('leaderboardId 13 se traduce al segundo filter ladder=13',
      ewNet === 1 && ewFilters.length === 2 &&
        ewFilters.some((f) => f.field === 'ladder' && f.value === '13') &&
        ewFilters.some((f) => f.field === 'player_relic_id' && f.value === '4242'),
      JSON.stringify(ewFilters));
    check('la respuesta llega filtrada por el modo aunque el payload mezcle',
      ewLive.analyzed === 3 && ewLive.mode.id === 13 && ewLive.favorite.name === 'Fast castle');

    // Cache separada por modo: la misma persona en RM y en EW no se pisan.
    const rmCache = ewCache;
    const rmLive = await buildRivalOpenings({
      profileId: 4242, leaderboardId: 3, cache: rmCache, now, fetchImpl: ewFetch,
    });
    check('la cache se separa por ladder (RM no pisa a EW ni al revés)',
      rmLive.analyzed === 3 && rmLive.favorite.name === 'Scout rush' && ewNet === 2 &&
        openingsCacheKey(4242, resolveMode(3)) !== openingsCacheKey(4242, resolveMode(13)) &&
        hasCachedOpenings(rmCache, 4242, resolveMode(13), now) === true &&
        hasCachedOpenings(rmCache, 4242, resolveMode(4), now) === false,
      `${ewNet} requests totales`);

    // Historial de civs: mismo criterio, misma fuente, mismo modo.
    const mixedHistory = [
      { matchId: 900, ongoing: true, startedAt: 9000, leaderboardId: 13, players: [{ profileId: 9, civ: 'Cumans' }] },
      { matchId: 810, startedAt: 8000, leaderboardId: 13, players: [{ profileId: 9, civ: 'Gurjaras', won: true }], mapName: 'Glade' },
      { matchId: 800, startedAt: 7900, leaderboardId: 3, players: [{ profileId: 9, civ: 'Franks', won: true }], mapName: 'Arabia' },
      { matchId: 790, startedAt: 7800, leaderboardId: 'rm_1v1', players: [{ profileId: 9, civ: 'Huns', won: false }], mapName: 'Arabia' },
      { matchId: 780, startedAt: 7700, leaderboardId: 'unranked', players: [{ profileId: 9, civ: 'Celts', won: true }], mapName: 'Glade' },
      { matchId: 770, startedAt: 7600, leaderboardId: 14, players: [{ profileId: 9, civ: 'Britons', won: true }], mapName: 'Glade' },
    ];
    const histEw = parseRivalHistory(mixedHistory, 9, null, { mode: resolveMode(13) });
    check('historia EW 1v1: solo la partida de EW (aunque haya RM más reciente)',
      histEw.length === 1 && histEw[0].matchId === 810 && histEw[0].civ === 'Gurjaras',
      histEw.map((m) => m.matchId).join(','));
    const histRm = parseRivalHistory(mixedHistory, 9, null, { mode: resolveMode(3) });
    check('historia RM 1v1: enum y número se tratan igual; unranked queda fuera',
      histRm.length === 2 && histRm.map((m) => m.matchId).join(',') === '800,790');
    const histAll = parseRivalHistory(mixedHistory, 9, null);
    check('historia sin modo: conserva las 5 más recientes (retrocompatible)',
      histAll.length === 5 && histAll[0].matchId === 810 && histAll[4].matchId === 770);

    // Cableado estático: el modo viaja de la partida al módulo y se pinta.
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const mainSrc = read('main.js');
    const rendererSrc = read('renderer.js');
    const settingsHtmlSrc = read('settings.html');
    const rivalSrc = read('src/rival.js');
    check('main.js: la ladder del match viaja al informe (con fallback a state.ladder)',
      /function leaderboardOf\(state\)/.test(mainSrc) && /leaderboardId = leaderboardOf\(state\)/.test(mainSrc) &&
        /sin-modo/.test(mainSrc));
    // La firma se arma DENTRO de rivalSignature y el modo es parte del string:
    // una partida de EW no puede reutilizar el informe cacheado de una de RM.
    check('main.js: la firma del informe incluye el modo (no reutiliza de otro modo)',
      /function rivalSignature\(state, rivals\)[\s\S]*?\$\{mode \? mode\.id : 'sin-modo'\}/.test(mainSrc));
    check('main.js: la firma y el pedido incluyen el MAPA de la partida',
      /rivalSignature\(state, rivals\)[\s\S]{0,500}sin-mapa/.test(mainSrc) &&
        /const mapName = state\.match && state\.match\.mapName/.test(mainSrc) &&
        /leaderboardId,\s*\n\s*mapName,/.test(mainSrc));
    check('main.js: al ocultarse el ELO se adelanta el poll (vuelve rápido al terminar)',
      /eloHidden\) scheduleNext\('ongoing'\)/.test(mainSrc));
    check('rival.js: recorre todo el historial del mapa en el modo exacto',
      /MAP_MAX_PAGES/.test(rivalSrc) && /targetMapGames/.test(rivalSrc) &&
        /fetchMatchesImpl\(id, MAP_PAGE_SIZE, page, historyLadder\)/.test(rivalSrc) &&
        !/MAP_MATCH_LIMIT/.test(rivalSrc));
    check('aoe.js: el historial se filtra por el ladder EXACTO (modo)',
      /leaderboard_ids=\$\{encodeURIComponent\(ladder\)\}/.test(
        fs.readFileSync(path.join(__dirname, '..', 'src', 'aoe.js'), 'utf8')));
    check('rival.js: openingsImpl recibe el modo y la clave de cache lo incluye',
      /const mode = resolveMode\(leaderboardId\);/.test(rivalSrc) &&
        /openingsImpl\(\{[\s\S]{0,120}mode,/.test(rivalSrc) &&
        /rival:insights:\$\{id\}:\$\{ladder\}:\$\{modeId\}/.test(rivalSrc));
    // v0.1.16: el modo se lee en la cabecera ("HIDEOUT · RM 1V1") y NO se
    // repite en cada bloque. El caso "modo no disponible" se sigue avisando.
    check('renderer: el modo va solo en la cabecera, no repetido por bloque',
      /const title = 'APERTURA'/.test(rendererSrc) &&
        /'ASÍ JUGÓ SUS ÚLTIMAS 5'/.test(rendererSrc) &&
        /modeUnavailable/.test(rendererSrc) && !/\$\{modeLabel\}/.test(rendererSrc));
    // v0.1.22 (UX de datos): la conclusión de la tarjeta se lee sin recorrer
    // los bloques, y cada cifra viaja con su denominador real.
    const { opennessLabel } = require('../src/scout');
    const opennessLabelCheck =
      opennessLabel('Closed') === 'cerrados' &&
      opennessLabel('Open') === 'abiertos' &&
      opennessLabel('Semi-Open') === 'semiabiertos';
    check('renderer: franja "Si tuvieras que apostar" con la civ del mapa y su arranque',
      /function rivalPredStrip\(/.test(rendererSrc) &&
        /Si tuvieras que apostar/.test(rendererSrc) &&
        /Arranca con /.test(rendererSrc) &&
        /de sus \$\{escapeHtml\(gamesText\(total\)\)\} acá/.test(rendererSrc));
    check('renderer: el mapa y la civ se explican con "X de Y", no con porcentajes sueltos',
      /gana \$\{escapeHtml\(fmtNumber\(won\)\)\} de sus /.test(rendererSrc) &&
        /de sus \$\{escapeHtml\(gamesText\(total\)\)\} acá/.test(rendererSrc) &&
        /replay\$\{base === 1 \? '' : 's'\} acá/.test(rendererSrc));
    check('renderer: muestra chica declarada en vez de disfrazada de tendencia',
      /Muestra chica: es una pista, no una tendencia/.test(rendererSrc));
    // El panel no tiene scroll: si el contenido supera el alto del monitor hay
    // que encogerse, no recortar la última tarjeta (pasó: 1209 px en 1155).
    check('renderer: el panel se ajusta al alto del monitor en vez de recortarse',
      /function fitStage\(/.test(rendererSrc) &&
        /stageMaxHeight \/ natural/.test(rendererSrc) &&
        /function panelMaxHeight\(/.test(require('fs').readFileSync(
          require('path').join(__dirname, '..', 'main.js'), 'utf8')) &&
        /maxHeight,/.test(require('fs').readFileSync(
          require('path').join(__dirname, '..', 'main.js'), 'utf8')));
    // "MAPAS CLOSED" era map_openness sin traducir y se leía como un mapa.
    check('scout: el tipo de mapa se muestra en español',
      opennessLabelCheck);
    check('renderer: el informe da jerarquía al dato, no solo números',
      /function gamesText\(/.test(rendererSrc) && /function recordText\(/.test(rendererSrc) &&
        /le va mal/.test(rendererSrc) && /stat-row-value/.test(rendererSrc));
    // Un solo componente de dato (stat-hero) para mapa, cara a cara y consejo:
    // antes cada uno tenía su padding y su tamaño de número.
    // Un solo componente de dato (statRow) para mapa, cara a cara y consejo, y
    // sin cajas con padding propio dentro de las tarjetas (desalineaban todo).
    check('renderer: mapa, cara a cara y consejo comparten el mismo componente',
      /function statRow\(/.test(rendererSrc) &&
        (rendererSrc.match(/statRow\(\{/g) || []).length >= 3 &&
        !/class="rstat"/.test(rendererSrc) && !/stat-hero/.test(rendererSrc));
    const cssTail = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    check('styles: las tarjetas de datos son planas (una sola x de etiqueta)',
      !/\.stat-hero\b/.test(cssTail) && !/\.rstat-map\b/.test(cssTail) &&
        /\.stat-row \{/.test(cssTail) && /\.rival-key,\n\.scout-key \{/.test(cssTail));
    // Una sola caja por sección: la tarjeta de cada rival ya no dibuja borde ni
    // fondo propio (era caja dentro de caja).
    check('styles: la tarjeta del rival no es una caja dentro de la sección',
      /^\.rival-card \{\n  min-width: 0;\n/m.test(cssTail) &&
        !/\.rival-card \{[^}]*border:/.test(cssTail) &&
        !/\.rival-card \{[^}]*background:/.test(cssTail));
    check('renderer: la tarjeta usa el mapa de la partida, no el favorito',
      /report\.mapStats/.test(rendererSrc) &&
        !/rivalBlock\('MÁS USA'/.test(rendererSrc) && !/favoriteMap/.test(rendererSrc));
    check('renderer: la estrategia SOLO usa replays del mapa y de su civ más usada',
      /const title = 'APERTURA'/.test(rendererSrc) && /openings\.mapCivFavorite/.test(rendererSrc) &&
        !/openings\.mapFavorite/.test(rendererSrc) && !/openings\.favorite/.test(rendererSrc));
    // La apertura ya no es una fila más del bloque del mapa: tiene su bloque
    // (y se omite entero si no hay replays, para no dejar un vacío doble).
    check('renderer: la apertura usa la civ del mapa y se omite sin replays',
      /const civName = report\.mapStats && report\.mapStats\.civ/.test(rendererSrc) &&
        /mapCivFavorite/.test(rendererSrc) && /if \(!best \|\| !baseCount\) return '';/.test(rendererSrc));
    check('ajustes: la opción explica que solo cuenta el mismo modo de juego',
      /mismo modo de juego/.test(settingsHtmlSrc) && /EW no/.test(settingsHtmlSrc));
    check('ajustes: la opción habla del mapa de la partida, no del favorito',
      /Civ más usada en el mapa/.test(settingsHtmlSrc) &&
        /mapa y modo de la partida/.test(settingsHtmlSrc) && !/mapa más jugado/.test(settingsHtmlSrc));
    check('emptyOpenings también declara el modo y el motivo',
      emptyOpenings(1, 1, 'x', { mode: resolveMode(13), modeUnavailable: true }).mode.id === 13 &&
        emptyOpenings(1, 1, 'x').modeUnavailable === false);

    // Regresión: el cartel "Buscando…" no puede quedar colgado cuando ya se
    // informó "estás en la última versión".
    const updaterSrc = read('src/updater.js');
    const settingsJsSrc = read('settings.js');
    check('updater: el IPC espera la consulta y checking siempre se baja',
      /ipcMain\.handle\('updater:check', async \(\) =>/.test(mainSrc) &&
        /await updater\.check\(/.test(mainSrc) &&
        /patch\(\{ checking: false, checkedAt: Date\.now\(\) \}\)/.test(updaterSrc) &&
        /patch\(\{ checking: false, error: 'La consulta tardó demasiado\.' \}\)/.test(updaterSrc));
    check('panel: sin texto transitorio colgado y con estado pospuesto',
      !/setStatus\('Buscando actualizaciones/.test(settingsJsSrc) &&
        /startsWith\('Buscando actualizaciones'\)/.test(settingsJsSrc) &&
        /snapshot\.deferred/.test(settingsJsSrc));

    // --- Regresión del canal de actualizaciones (v0.1.11) ---
    const preloadSrc = read('preload.js');
    const settingsPreloadSrc2 = read('settings-preload.js');
    const overlayHtmlSrc = read('index.html');
    const stylesSrc = read('styles.css');
    const workflowSrc = read('.github/workflows/release.yml');
    check('updater: check() ya no se bloquea por una descarga lista',
      !/if \(closed \|\| readyToInstall \|\| downloading\) return/.test(updaterSrc) &&
        /if \(closed \|\| checkingPromise\) return/.test(updaterSrc));
    check('updater: compara versiones y descarta descargas obsoletas',
      /compareVersions\(/.test(updaterSrc) &&
        /activeGeneration !== generation/.test(updaterSrc) &&
        /resetForNewVersion/.test(updaterSrc) &&
        /descarga de v/.test(updaterSrc));
    check('updater: reconsulta más seguido con una versión pendiente',
      /PENDING_RECHECK_MS/.test(updaterSrc) && /hasPendingVersion\(\)/.test(updaterSrc));
    check('updater: el 404 de latest.yml no se muestra como error',
      /publishing: true/.test(updaterSrc) && /PUBLISHING_RETRY_MS/.test(updaterSrc));
    check('notificación nativa y salto directo a Updater',
      /Notification\.isSupported\(\)/.test(mainSrc) &&
        /app\.setAppUserModelId\('com\.local\.aoe2elooverlay'\)/.test(mainSrc) &&
        /settings:goto/.test(mainSrc) &&
        /onGoto:/.test(settingsPreloadSrc2) &&
        /onGoto\(/.test(settingsJsSrc));
    check('el aviso se pospone si hay partida en curso',
      /deferredUpdateNotice/.test(mainSrc) && /matchOngoing\(\)/.test(mainSrc));
    check('overlay: canal, chip, auto-ocultado y silencio en partida',
      /onUpdate:/.test(preloadSrc) &&
        /window\.overlay\.onUpdate\(showUpdateToast\)/.test(rendererSrc) &&
        /id="updateToast"/.test(overlayHtmlSrc) &&
        /#updateToast \{/.test(stylesSrc) &&
        /UPDATE_TOAST_MS/.test(rendererSrc) &&
        /status === 'ongoing'\) hideUpdateToast\(\)/.test(rendererSrc));
    check('panel Updater: siempre se puede volver a buscar',
      /id="checkBtn"/.test(settingsHtmlSrc) &&
        /checkBtn\.addEventListener\('click'/.test(settingsJsSrc) &&
        /updaterCheck\(\)/.test(settingsJsSrc));
    check('Updater: un solo botón de búsqueda (el primario solo descarga/instala)',
      !/Buscar de nuevo/.test(settingsHtmlSrc) &&
        !/\? 'Buscar actualizaciones'/.test(settingsJsSrc) &&
        /updateBtn\.disabled = !snapshot\.active \|\| !\(snapshot\.ready \|\| snapshot\.available\)/.test(settingsJsSrc) &&
        (settingsHtmlSrc.match(/Buscar actualizaciones/g) || []).length === 1);
    check('Updater: instalación silenciosa y reapertura automática',
      /quitAndInstall\(true, true\)/.test(updaterSrc) &&
        !/quitAndInstall\(false/.test(updaterSrc) &&
        /\/S/.test(updaterSrc) && /--force-run/.test(updaterSrc));
    check('Updater: instalar respeta la partida y se aplica al terminar',
      /installRequested/.test(updaterSrc) &&
        /installDeferred/.test(updaterSrc) &&
        /reason: 'match'/.test(updaterSrc) &&
        /installDeferred/.test(settingsJsSrc) &&
        /return updater\.install\(\)/.test(mainSrc));
    check('CI: sin versión hardcodeada y con verificación del canal',
      !/gh release edit v0\.1\.9/.test(workflowSrc) && /latest\.yml/.test(workflowSrc));
  }

  console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} chequeo(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error(`ERROR FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
