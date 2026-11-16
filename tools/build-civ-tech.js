'use strict';
// Rebuild the offline fact table from one pinned public source revision.
const fs = require('node:fs');
const path = require('node:path');
const current = require('../src/civ-tech.json');
const ref = process.argv[2] || current.source.ref;
if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error('Indicá un SHA de revisión completo del árbol tecnológico.');
async function json(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'aoe2-helper/civ-tech-builder' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}
async function main() {
  const files = await json(`https://api.github.com/repos/SiegeEngineers/aoe2techtree/contents/data/trees?ref=${ref}`);
  if (!Array.isArray(files)) throw new Error('No se pudo listar el árbol tecnológico.');
  const entries = files.filter((file) => file.type === 'file' && /^data\/trees\/[A-Z_]+\.json$/.test(file.path));
  const civilizations = {};
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < entries.length) {
      const file = entries[cursor++];
      const data = await json(`https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/${ref}/${file.path}`);
      const nodes = {};
      for (const node of data.units_techs || []) {
        if (node.node_status === 'NotAvailable') continue;
        if (!['ResearchedCompleted', 'ResearchRequired'].includes(node.node_status) ||
            typeof node.name !== 'string' || !Number.isInteger(node.age_id)) throw new Error(`Nodo desconocido en ${file.path}`);
        nodes[node.name] = Math.min(nodes[node.name] ?? 99, node.age_id);
      }
      civilizations[file.name.replace('.json', '').toLowerCase()] = { nodes };
    }
  }));
  const ordered = Object.fromEntries(Object.entries(civilizations).sort(([a], [b]) => a.localeCompare(b)));
  const data = { schemaVersion: 1, source: { repository: 'SiegeEngineers/aoe2techtree', ref,
    generatedAt: new Date().toISOString().slice(0, 10), scope: 'standard-civilizations' }, civilizations: ordered };
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'civ-tech.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`${entries.length} árboles actualizados desde ${ref}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
