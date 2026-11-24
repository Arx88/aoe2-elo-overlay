'use strict';

// Deterministic suites only. The network/Windows selftest remains separate.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['product-test.js', 'postmatch-test.js', 'postmatch-engine-test.js', 'engine-test.js', 'combat-test.js', 'execution-ratings-test.js',
  'replay-metrics-test.js', 'opening-review-test.js', 'contextual-advice-test.js', 'prematch-regression.js',
  'prematch-predict-test.js', 'opportunities-test.js', 'presentation-test.js', 'build-orders-test.js', 'product-ux-test.js',
  'i18n-license-test.js', 'civ-diagnostic-test.js', 'api-and-central-intel-test.js', 'training-test.js']) {
  const run = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status || 1);
}
