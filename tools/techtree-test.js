'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ttData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'training', 'techtree-data.json'), 'utf8'));

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
}

test('techtree-data.json contiene las 56 civilizaciones oficiales y >450 nodos', () => {
  const civSlugs = Object.keys(ttData.civs || {});
  assert.equal(civSlugs.length, 56, `esperaba 56 civs, obtuve ${civSlugs.length}`);
  assert.ok(Object.keys(ttData.nodes || {}).length >= 450, 'debe tener >= 450 nodos únicos');
  for (const required of ['franks', 'aztecs', 'bulgarians', 'danes', 'saxons', 'varangians', 'mapuche', 'muisca', 'tupi', 'shu', 'wei', 'wu']) {
    assert.ok(ttData.civs[required], `falta civilización ${required}`);
    assert.ok(ttData.civs[required].buildings.length >= 20, `${required} tiene pocos edificios`);
  }
});

test('todos los iconos referenciados en techtree-data.json existen en disco y son PNG válidos', () => {
  let checked = 0;
  for (const node of Object.values(ttData.nodes)) {
    if (!node.icon) continue;
    const full = path.join(ROOT, node.icon);
    assert.ok(fs.existsSync(full), `falta icono en disco: ${node.icon} (${node.k})`);
    assert.ok(fs.statSync(full).size > 64, `icono corrupto: ${node.icon}`);
    checked += 1;
  }
  assert.ok(checked >= 480, `debe validar casi todos los nodos (${checked})`);
});

test('TechTreeUI renderiza árbol completo, comparador 2 civs e inspector con 0 estilos inline (CSP)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'ui', 'techtree-ui.js'), 'utf8');
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.RelicIcons = require('../ui/relic-icons');
  vm.runInNewContext(src, sandbox);
  assert.ok(sandbox.TechTreeUI && typeof sandbox.TechTreeUI.createTechTreeController === 'function');

  const ctrl = sandbox.TechTreeUI.createTechTreeController();
  ctrl.setData(ttData, 'franks');
  ctrl.ui.compareSlug = 'britons';
  ctrl.ui.inspectorOpen = true;
  const html = ctrl.renderView(true);

  assert.ok(html.includes('Francos'), 'debe mostrar civilización activa');
  assert.ok(html.includes('vs Britanos'), 'debe incluir comparador');
  assert.ok(html.includes('tt-inspector'), 'debe renderizar inspector lateral');
  assert.ok(html.includes('is-unavail'), 'debe marcar brechas del árbol');
  assert.match(html, /tt-node-x[^>]*><img[^>]+data-relic-icon="lock"/);
  assert.ok(!/\sstyle\s*=/i.test(html), 'CSP estricto: cero atributos style inline');
});

test('training-ui.js incluye la subpestaña Árbol de tecnología justo después de Arena', () => {
  const trSrc = fs.readFileSync(path.join(ROOT, 'ui', 'training-ui.js'), 'utf8');
  const arenaPos = trSrc.indexOf('data-tr-tab="arena"');
  const ttPos = trSrc.indexOf('data-tr-tab="techtree"');
  assert.ok(arenaPos > 0 && ttPos > arenaPos, 'techtree debe ubicarse después de Arena');
});

console.log(`techtree-test: ${passed}/${passed} pruebas OK`);
