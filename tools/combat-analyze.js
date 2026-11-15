'use strict';

// Usage: node tools/combat-analyze.js measured-events.json > combat-summary.json
// The input is measured events from a state extractor. This command cannot
// extract death events from .aoe2record command streams.
const fs = require('node:fs');
const { analyzeCombatEvents } = require('../src/combat-analysis');
try {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: node tools/combat-analyze.js eventos-medidos.json');
  if (fs.statSync(file).size > 5 * 1024 * 1024) throw new Error('El registro supera 5 MB.');
  const result = analyzeCombatEvents(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!result.data) throw new Error(result.warnings.join(' '));
  process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  for (const warning of result.warnings) process.stderr.write(`${warning}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
