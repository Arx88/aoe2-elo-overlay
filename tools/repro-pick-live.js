/* Repro END-TO-END del bug "0 %" (v0.1.25):
 *   1. baja el informe REAL de un perfil público (196240, Arabia, RM 1v1);
 *   2. ejecuta renderer.js en un VM con DOM stub (igual que selftest);
 *   3. llama a scoutPickHero sobre el mapStats real y compara contra la
 *      cuenta mezclada de antes (civ.games / games de /stats).
 * Uso: node tools/repro-pick-live.js [profileId] [mapa] [leaderboardId]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildRivalInsights } = require('../src/rival.js');

const PROFILE = Number(process.argv[2] || 196240);
const MAP = process.argv[3] || 'Arabia';
const LADDER = Number(process.argv[4] || 3);

(async () => {
  console.log(`repro live: perfil ${PROFILE} · ${MAP} · leaderboard ${LADDER}\n`);
  const report = await buildRivalInsights({
    profileId: PROFILE, mapName: MAP, leaderboardId: LADDER,
    includeOpenings: false,
    log: (m) => process.stderr.write(`  [src] ${m}\n`),
  });
  if (report.error) throw new Error(`informe con error: ${report.error}`);
  const map = report.mapStats || {};
  const civ = map.civ || {};
  console.log('mapStats real:');
  console.log(`  games        : ${map.games}      <- /stats (histórico completo)`);
  console.log(`  sampleGames  : ${map.sampleGames}      <- historial LEÍDO`);
  console.log(`  civ top      : ${civ.name} · ${civ.games} partidas`);
  if (map.sampleGames && civ.games) {
    const vieja = (civ.games / map.games) * 100;
    const honesta = (civ.games / map.sampleGames) * 100;
    console.log(`  share ANTES  : ${vieja.toFixed(0)} %  (civ.games / games   -> fuentes mezcladas)`);
    console.log(`  share AHORA  : ${honesta.toFixed(0)} %  (civ.games / sample -> misma fuente)`);
  }

  // renderer.js en VM, mismo stub que selftest
  const rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const stub = () => ({
    hidden: false, textContent: '', innerHTML: '', dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll: () => [], appendChild() {},
  });
  const sandbox = {
    document: {
      getElementById: () => stub(), addEventListener() {}, body: stub(),
      documentElement: { style: { setProperty() {} } },
    },
    window: { overlay: { onState() {}, onConfig() {}, onUpdate() {}, onMovable() {},
      onView() {}, onRival() {}, onScout() {}, onDetail() {}, ready() {}, reportError() {} },
      addEventListener() {} },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame() {}, console,
    setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {},
    Date, Math, Number, String, Boolean, Array, Object, JSON, Intl,
  };
  vm.createContext(sandbox);
  vm.runInContext(rendererSrc, sandbox, { filename: 'renderer.js' });

  const pick = sandbox.scoutPickHero(report);
  console.log('\nscoutPickHero(mapStats real):');
  if (!pick) {
    console.log('  (null: sin datos de civ)');
  } else {
    console.log(`  value : ${pick.value}`);
    console.log(`  label : ${pick.label}`);
    console.log(`  sub   : ${pick.sub}`);
    console.log(`  dist  : ${pick.dist}`);
    if (pick.none) console.log('  -> none=true: no publica "Suele jugar" con un share sin dominancia');
  }

  const mala = pick && pick.none !== undefined && String(pick.value).includes('%') === false &&
    !pick.none && pick.value === '—';
  if (pick && !pick.none && /^\d/.test(pick.value)) {
    console.log('\n  sin clipping: comparte UNA fuente, así que el número no puede caer a 0-2 %');
  }
  console.log('\nOK');
})().catch((err) => { console.error(`FALLO: ${err.stack || err.message}`); process.exit(1); });
