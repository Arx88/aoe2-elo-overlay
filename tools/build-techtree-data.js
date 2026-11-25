'use strict';

/**
 * Compila el Árbol de Tecnología completo de las 56 civilizaciones de AoE2:DE
 * desde `SiegeEngineers/aoe2techtree` (datos oficiales del juego + textos en español)
 * y descarga todos los iconos PNG faltantes en `assets/icons/aoe2/`.
 *
 * Salida: `src/training/techtree-data.json` (100 % offline, deduplicado, CSP-safe).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'src', 'training', 'techtree-data.json');
const ICON_DIR = path.join(ROOT, 'assets', 'icons', 'aoe2');
const CACHE_DIR = 'C:/Users/juanp/.gemini/antigravity/brain/1432f205-b100-4fca-b8e6-e76337d42392/scratch/se-techtree-cache';

const SE_BASE = 'https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master';

const ARMOR_CLASS_ES = {
  0: 'Maravillas',
  1: 'Infantería',
  2: 'Barcos de guerra pesados',
  3: 'Armadura antiproyectil',
  4: 'Armadura cuerpo a cuerpo',
  5: 'Elefantes',
  8: 'Caballería',
  11: 'Edificios',
  13: 'Defensas de piedra',
  14: 'Depredadores',
  15: 'Arqueros',
  16: 'Barcos',
  17: 'Arietes / Asedio blindado',
  18: 'Árboles',
  19: 'Unidades únicas',
  20: 'Armas de asedio',
  21: 'Edificios estándar',
  22: 'Murallas y puertas',
  23: 'Unidades de pólvora',
  24: 'Caza agresiva',
  25: 'Monjes',
  26: 'Castillos y Krepost',
  27: 'Lanceros',
  28: 'Arqueros a caballo',
  29: 'Infantería de choque',
  30: 'Camellos',
  31: 'Daño que ignora armadura',
  32: 'Condotieros',
  34: 'Pesqueros',
  35: 'Mamelucos',
  36: 'Héroes y Reyes',
  37: 'Asedio pesado',
  38: 'Guerrilleros',
  39: 'Resistencia a caballería',
  40: 'Casas',
  41: 'Brulotes',
  60: 'Barcos de largo alcance',
};

const NODE_TYPE_CODE = {
  BuildingTech: 'bt',
  BuildingNonTech: 'bn',
  RegionalBuilding: 'rb',
  UniqueBuilding: 'ub',
  Unit: 'u',
  UnitUpgrade: 'uu',
  ResearchedCompleted: 'u',
  RegionalUnit: 'ru',
  UniqueUnit: 'qu',
  Research: 't',
  RegionalTech: 'rt',
  UniqueTech: 'qt',
};

const CIV_SLUG_FIX = {
  tupis: 'tupi',
  tupi: 'tupi',
};

function cleanName(raw) {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\r?\n+/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDesc(raw) {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?b>/gi, '')
    .replace(/<\/?i>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCivHelpEs(raw) {
  const txt = cleanDesc(raw);
  const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean);
  const arch = lines[0] || '';
  const bonuses = [];
  const uniqueUnits = [];
  const uniqueTechs = [];
  let teamBonus = '';
  let mode = 'bonus';

  for (let i = 1; i < lines.length; i += 1) {
    const ln = lines[i];
    if (/^unidad(es)?\s+única/i.test(ln)) { mode = 'uu'; continue; }
    if (/^tecnolog[ií]as?\s+única/i.test(ln)) { mode = 'ut'; continue; }
    if (/^bonificaci[oó]n\s+de\s+equipo/i.test(ln)) { mode = 'team'; continue; }
    const cleaned = ln.replace(/^[•·\-–—*]\s*/, '').trim();
    if (!cleaned) continue;
    if (mode === 'bonus') bonuses.push(cleaned);
    else if (mode === 'uu') uniqueUnits.push(cleaned);
    else if (mode === 'ut') uniqueTechs.push(cleaned);
    else if (mode === 'team') teamBonus = teamBonus ? `${teamBonus} ${cleaned}` : cleaned;
  }
  return { arch, bonuses, uniqueUnits, uniqueTechs, teamBonus };
}

function compactCost(costObj) {
  if (!costObj || typeof costObj !== 'object') return null;
  const out = {};
  if (Number(costObj.Food) > 0) out.f = Number(costObj.Food);
  if (Number(costObj.Wood) > 0) out.w = Number(costObj.Wood);
  if (Number(costObj.Gold) > 0) out.g = Number(costObj.Gold);
  if (Number(costObj.Stone) > 0) out.s = Number(costObj.Stone);
  return Object.keys(out).length ? out : null;
}

function extractBonuses(attacks) {
  if (!Array.isArray(attacks)) return [];
  const out = [];
  for (const a of attacks) {
    const cls = Number(a?.Class);
    const amt = Number(a?.Amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (cls === 3 || cls === 4) continue; // Base pierce / Base melee
    const label = ARMOR_CLASS_ES[cls];
    if (label) out.push(`+${amt} vs ${label}`);
  }
  return out.slice(0, 8);
}

function extractArmorClasses(armours) {
  if (!Array.isArray(armours)) return [];
  const seen = new Set();
  const out = [];
  for (const a of armours) {
    const cls = Number(a?.Class);
    if (cls === 3 || cls === 4 || cls === 21 || cls === 11) continue;
    const label = ARMOR_CLASS_ES[cls];
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out.slice(0, 6);
}

function classifyLaneCategory(buildingId, nameEn) {
  const n = String(nameEn || '').toLowerCase();
  if ([12, 87, 101].includes(buildingId) || /barracks|archery|stable/.test(n)) return 'military';
  if ([49, 82, 1251, 1665].includes(buildingId) || /siege|castle|krepost|donjon/.test(n)) return 'siege_castle';
  if ([103, 209, 104, 1806].includes(buildingId) || /blacksmith|university|monastery|fortified church|church/.test(n)) return 'tech';
  if ([45, 1189].includes(buildingId) || /dock|harbor|shipyard/.test(n)) return 'naval_def';
  if ([72, 117, 155, 79, 234, 235, 236, 598, 487, 64, 63, 78, 80, 81, 88, 789].includes(buildingId) || /wall|gate|tower|outpost|bombard|\bkeep\b/.test(n)) return 'naval_def';
  return 'economy';
}

async function fetchJsonCached(relUrl, cacheFile) {
  const full = path.join(CACHE_DIR, cacheFile);
  if (fs.existsSync(full) && fs.statSync(full).size > 20) {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  }
  const url = `${SE_BASE}/${relUrl}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const txt = await res.text();
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, txt, 'utf8');
  return JSON.parse(txt);
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(ICON_DIR, { recursive: true });

  console.log('1. Descargando data.json y strings oficiales (ES + EN)...');
  const [seData, esStrings, enStrings] = await Promise.all([
    fetchJsonCached('data/data.json', 'data.json'),
    fetchJsonCached('data/locales/es/strings.json', 'es-strings.json'),
    fetchJsonCached('data/locales/en/strings.json', 'en-strings.json'),
  ]);

  const civEntries = Object.entries(seData.civs || {});
  console.log(`2. Cargando árboles oficiales de ${civEntries.length} civilizaciones...`);

  const civTrees = {};
  const queue = civEntries.map(([civName, civMeta]) => ({ civName, civMeta }));
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const { civName, civMeta } = queue.shift();
      const upper = String(civMeta.internal_name || civName).toUpperCase();
      try {
        civTrees[civName] = await fetchJsonCached(`data/trees/${upper}.json`, `trees/${upper}.json`);
      } catch (err) {
        const alt = civName.toUpperCase();
        civTrees[civName] = await fetchJsonCached(`data/trees/${alt}.json`, `trees/${alt}.json`);
      }
    }
  }));

  const nodes = {}; // 'B:87' / 'U:4' / 'T:437' -> shared node metadata
  const iconNeeded = new Map(); // 'b_0.png' -> { folder, pic, file }

  const registerIcon = (folder, pic) => {
    if (pic == null || Number(pic) < 0) return null;
    const num = Number(pic);
    const prefix = folder === 'Building' ? 'b' : (folder === 'Tech' ? 't' : 'u');
    const file = `${prefix}_${num}.png`;
    iconNeeded.set(file, { folder, pic: num, file });
    return `assets/icons/aoe2/${file}`;
  };

  const ensureNode = (useType, nodeId, pic, nameStringId, helpStringId, fallbackName) => {
    const prefix = useType === 'Building' ? 'B' : (useType === 'Tech' ? 'T' : 'U');
    const key = `${prefix}:${nodeId}`;
    const icon = registerIcon(useType, pic);
    if (nodes[key]) {
      if (!nodes[key].icon && icon) nodes[key].icon = icon;
      return key;
    }

    const rawEsName = esStrings[String(nameStringId)] || '';
    const rawEnName = enStrings[String(nameStringId)] || fallbackName || '';
    const rawEsHelp = esStrings[String(helpStringId)] || enStrings[String(helpStringId)] || '';

    const statSource = useType === 'Building'
      ? seData.data?.Building?.[String(nodeId)]
      : useType === 'Tech'
        ? seData.data?.Tech?.[String(nodeId)]
        : seData.data?.Unit?.[String(nodeId)];

    const upgSource = useType === 'Unit' ? seData.data?.unit_upgrades?.[String(nodeId)] : null;

    const entry = {
      id: Number(nodeId),
      k: key,
      ut: prefix,
      name: cleanName(rawEsName || rawEnName || fallbackName || `#${nodeId}`),
      nameEn: cleanName(rawEnName || fallbackName || ''),
      desc: cleanDesc(rawEsHelp),
      icon,
    };

    const cost = compactCost(statSource?.Cost);
    if (cost) entry.cost = cost;

    if (useType === 'Unit' && statSource) {
      const st = {};
      if (statSource.HP) st.hp = statSource.HP;
      if (statSource.Attack != null && statSource.Attack > 0) st.atk = statSource.Attack;
      if (statSource.MeleeArmor != null) st.ma = statSource.MeleeArmor;
      if (statSource.PierceArmor != null) st.pa = statSource.PierceArmor;
      if (statSource.Range > 0) st.rng = statSource.Range;
      if (statSource.Speed > 0) st.spd = Number(statSource.Speed.toFixed(2));
      if (statSource.ReloadTime > 0) st.rld = Number(statSource.ReloadTime.toFixed(2));
      if (statSource.TrainTime > 0) st.tt = statSource.TrainTime;
      if (statSource.AccuracyPercent > 0 && statSource.Range > 0) st.acc = statSource.AccuracyPercent;
      if (statSource.LineOfSight > 0) st.los = statSource.LineOfSight;
      if (statSource.GarrisonCapacity > 0) st.gar = statSource.GarrisonCapacity;
      const bonus = extractBonuses(statSource.Attacks);
      if (bonus.length) st.bonus = bonus;
      const armorCls = extractArmorClasses(statSource.Armours);
      if (armorCls.length) st.armors = armorCls;
      if (Object.keys(st).length) entry.st = st;
      if (upgSource) {
        const uCost = compactCost(upgSource.Cost);
        if (uCost) entry.upg = { cost: uCost, rt: upgSource.ResearchTime || 0 };
      }
    } else if (useType === 'Building' && statSource) {
      const st = {};
      if (statSource.HP) st.hp = statSource.HP;
      if (statSource.Attack > 0) st.atk = statSource.Attack;
      if (statSource.MeleeArmor != null) st.ma = statSource.MeleeArmor;
      if (statSource.PierceArmor != null) st.pa = statSource.PierceArmor;
      if (statSource.Range > 0) st.rng = statSource.Range;
      if (statSource.TrainTime > 0) st.tt = statSource.TrainTime;
      if (statSource.LineOfSight > 0) st.los = statSource.LineOfSight;
      if (statSource.GarrisonCapacity > 0) st.gar = statSource.GarrisonCapacity;
      if (Object.keys(st).length) entry.st = st;
    } else if (useType === 'Tech' && statSource) {
      if (statSource.ResearchTime > 0) entry.st = { rt: statSource.ResearchTime };
    }

    nodes[key] = entry;
    return key;
  };

  const civs = {};
  for (const [civName, civMeta] of civEntries) {
    const rawSlug = civName.toLowerCase();
    const slug = CIV_SLUG_FIX[rawSlug] || rawSlug;
    const tree = civTrees[civName];
    if (!tree) continue;

    // Indexar nodos de units_techs de esta civ por su id compuesto (`Unit_4_87`)
    const utMap = new Map();
    for (const u of (tree.units_techs || [])) {
      utMap.set(u.id, u);
      ensureNode(u.use_type === 'Tech' ? 'Tech' : 'Unit', u.node_id, u.picture_index, u.name_string_id, u.help_string_id, u.name);
    }

    // Construir columnas de edificios (preservando el orden y grid de 8 filas = 2 por Edad)
    const buildings = [];
    for (const b of (tree.buildings || [])) {
      const bKey = ensureNode('Building', b.node_id, b.picture_index, b.name_string_id, b.help_string_id, b.name);
      const avail = b.node_status !== 'NotAvailable' ? 1 : 0;
      const bType = NODE_TYPE_CODE[b.node_type] || 'bt';
      const cat = classifyLaneCategory(b.building_id, b.name);

      // Compactar grid 8 filas × N cols -> eliminar columnas completamente vacías
      const rawGrid = Array.isArray(b.grid) ? b.grid : [];
      const colCount = rawGrid.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 0), 0);
      const activeCols = [];
      for (let c = 0; c < colCount; c += 1) {
        if (rawGrid.some((r) => r && r[c])) activeCols.push(c);
      }

      const cells = []; // lista compacta de celdas { r: 0..7, c: 0..cols-1, k, av, t, a, p? }
      for (let r = 0; r < rawGrid.length; r += 1) {
        const row = rawGrid[r];
        if (!Array.isArray(row)) continue;
        for (let ci = 0; ci < activeCols.length; ci += 1) {
          const cellId = row[activeCols[ci]];
          if (!cellId) continue;
          const item = utMap.get(cellId);
          if (!item) continue;
          const nKey = `${item.use_type === 'Tech' ? 'T' : 'U'}:${item.node_id}`;
          cells.push({
            r,
            c: ci,
            k: nKey,
            av: item.node_status !== 'NotAvailable' ? 1 : 0,
            t: NODE_TYPE_CODE[item.node_type] || (item.use_type === 'Tech' ? 't' : 'u'),
            a: item.age_id || Math.floor(r / 2) + 1,
          });
        }
      }

      buildings.push({
        k: bKey,
        id: b.building_id,
        age: b.age_id || 1,
        av: avail,
        t: bType,
        cat,
        upFrom: b.building_upgraded_from_id > 0 ? b.building_upgraded_from_id : 0,
        cols: activeCols.length,
        cells,
      });
    }

    const helpEs = esStrings[String(civMeta.help_string_id)] || enStrings[String(civMeta.help_string_id)] || '';
    const parsedHelp = parseCivHelpEs(helpEs);
    const civNameEs = cleanName(esStrings[String(civMeta.name_string_id)] || civName);

    // Calcular resumen rápido de disponibilidad de la civ
    let totalAvail = 0;
    let totalNodes = 0;
    for (const b of buildings) {
      totalNodes += 1;
      if (b.av) totalAvail += 1;
      for (const c of b.cells) {
        totalNodes += 1;
        if (c.av) totalAvail += 1;
      }
    }

    civs[slug] = {
      slug,
      name: civNameEs,
      arch: parsedHelp.arch,
      bonuses: parsedHelp.bonuses,
      uniqueUnits: parsedHelp.uniqueUnits,
      uniqueTechs: parsedHelp.uniqueTechs,
      teamBonus: parsedHelp.teamBonus,
      coverage: { avail: totalAvail, total: totalNodes },
      buildings,
    };
  }

  // Calcular rareza global (cuántas de las 56 civs tienen cada nodo) y edificio padre canónico
  const nodeAvailCivs = new Map(); // nodeKey -> Set(slug)
  for (const civ of Object.values(civs)) {
    for (const b of civ.buildings) {
      if (b.av) {
        if (!nodeAvailCivs.has(b.k)) nodeAvailCivs.set(b.k, new Set());
        nodeAvailCivs.get(b.k).add(civ.slug);
      }
      for (const c of b.cells) {
        if (nodes[c.k] && !nodes[c.k].bldg) nodes[c.k].bldg = b.k;
        if (c.av) {
          if (!nodeAvailCivs.has(c.k)) nodeAvailCivs.set(c.k, new Set());
          nodeAvailCivs.get(c.k).add(civ.slug);
        }
      }
    }
  }
  for (const [k, n] of Object.entries(nodes)) {
    const set = nodeAvailCivs.get(k);
    n.civCount = set ? set.size : 0;
  }

  // Descargar todos los PNGs faltantes con concurrencia 8
  const iconList = [...iconNeeded.values()];
  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  const iconQueue = [...iconList];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (iconQueue.length) {
      const item = iconQueue.shift();
      const dest = path.join(ICON_DIR, item.file);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
        cached += 1;
        continue;
      }
      const url = `${SE_BASE}/img/${item.folder}/${item.pic}.png`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          failed += 1;
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 64 || buf[0] !== 0x89 || buf[1] !== 0x50) {
          failed += 1;
          continue;
        }
        fs.writeFileSync(dest, buf);
        downloaded += 1;
      } catch (_) {
        failed += 1;
      }
    }
  }));

    // Limpiar referencia a iconos que no existan en disco para evitar imágenes rotas
  for (const n of Object.values(nodes)) {
    if (n.icon) {
      const full = path.join(ROOT, n.icon);
      if (!fs.existsSync(full) || fs.statSync(full).size < 64) {
        // Fallback: si era Unit con índice de Building (ej. Puerto/Harbor malayo), probar b_<pic>.png o b_6.png (Muelle)
        const altB = n.icon.replace(/\/u_(\d+)\.png$/, '/b_$1.png');
        if (altB !== n.icon && fs.existsSync(path.join(ROOT, altB))) {
          n.icon = altB;
        } else if (n.k === 'U:1189' && fs.existsSync(path.join(ROOT, 'assets/icons/aoe2/b_6.png'))) {
          n.icon = 'assets/icons/aoe2/b_6.png';
        } else {
          n.icon = null;
        }
      }
    }
  }

  const output = {
    meta: {
      version: 1,
      civCount: Object.keys(civs).length,
      nodeCount: Object.keys(nodes).length,
      builtAt: new Date().toISOString(),
    },
    ages: [
      { id: 1, name: 'Alta Edad Media', short: 'Alta Edad', icon: 'assets/icons/ages/dark.png' },
      { id: 2, name: 'Edad Feudal', short: 'Feudal', icon: 'assets/icons/ages/feudal.png' },
      { id: 3, name: 'Edad de los Castillos', short: 'Castillos', icon: 'assets/icons/ages/castle.png' },
      { id: 4, name: 'Edad Imperial', short: 'Imperial', icon: 'assets/icons/ages/imperial.png' },
    ],
    nodes,
    civs,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(output), 'utf8');
  const sizeKb = (fs.statSync(OUT_JSON).size / 1024).toFixed(1);
  console.log(`Listo! ${OUT_JSON} (${sizeKb} KB)`);
  console.log(`Civilizaciones: ${Object.keys(civs).length} · Nodos únicos: ${Object.keys(nodes).length}`);
  console.log(`Iconos: ${iconList.length} totales (${cached} en caché, ${downloaded} descargados, ${failed} faltantes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
