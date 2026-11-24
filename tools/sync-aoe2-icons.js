'use strict';

/**
 * Descarga los iconos oficiales de unidades, tecnologías y edificios desde
 * `SiegeEngineers/aoe2techtree` hacia `assets/icons/aoe2/` y genera `ui/aoe2-icons.js`
 * para uso local estricto bajo CSP (`img-src 'self'`).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'icons', 'aoe2');
const OUT_JS = path.join(ROOT, 'ui', 'aoe2-icons.js');
const PIC_MAP_PATH = 'C:/Users/juanp/.gemini/antigravity/brain/1432f205-b100-4fca-b8e6-e76337d42392/scratch/aoe2-picture-map.json';

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<br>\s*/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pm = JSON.parse(fs.readFileSync(PIC_MAP_PATH, 'utf8'));

  // Catálogo base requerido (carpeta + picture_index)
  const required = new Map(); // key 'u_64' -> { folder: 'Unit', pic: 64 }
  const register = (folder, pic) => {
    if (pic == null || pic < 0) return null;
    const prefix = folder === 'Building' ? 'b' : (folder === 'Tech' ? 't' : 'u');
    const file = `${prefix}_${pic}.png`;
    required.set(file, { folder, pic, file });
    return `assets/icons/aoe2/${file}`;
  };

  // 1. 56 Unidades Únicas por civilización
  const civUuIcons = {};
  const uuNameIcons = {};
  for (const [civ, info] of Object.entries(pm.civUU)) {
    const rel = register(info.folder, info.pic);
    const slug = civ === 'tupis' ? 'tupi' : civ;
    civUuIcons[slug] = rel;
    uuNameIcons[norm(info.es)] = rel;
    uuNameIcons[norm(info.en)] = rel;
  }

  // También indexar TODAS las unidades únicas / regionales / de élite del árbol
  for (const info of Object.values(pm.nodes)) {
    if (info.folder === 'Unit' && (info.nodeType === 'UniqueUnit' || info.nodeType === 'RegionalUnit')) {
      const rel = register('Unit', info.pic);
      const nEs = norm(info.es);
      const nEn = norm(info.en);
      if (nEs && !uuNameIcons[nEs]) uuNameIcons[nEs] = rel;
      if (nEn && !uuNameIcons[nEn]) uuNameIcons[nEn] = rel;
    }
  }

  // 2. Iconos canónicos explícitos para aperturas, unidades estándar, edificios y tecnologías
  const ICONS = {
    // Caballería ligera / Scouts
    scout: register('Unit', 64),
    lightCav: register('Unit', 91),
    hussar: register('Unit', 103),
    wingedHussar: register('Unit', 371),
    // Caballería pesada
    knight: register('Unit', 1),
    cavalier: register('Unit', 49),
    paladin: register('Unit', 2),
    heiGuang: register('Unit', 429),
    heiGuangHeavy: register('Unit', 430),
    steppe: register('Unit', 273),
    steppeElite: register('Unit', 274),
    battleEle: register('Unit', 228),
    battleEleElite: register('Unit', 246),
    // Camellos
    camelScout: register('Unit', 392),
    camel: register('Unit', 78),
    heavyCamel: register('Unit', 79),
    impCamel: register('Unit', 185),
    // Arquería
    archer: register('Unit', 17),
    xbow: register('Unit', 18),
    arbalester: register('Unit', 90),
    skirm: register('Unit', 20),
    eliteSkirm: register('Unit', 21),
    impSkirm: register('Unit', 229),
    cavArcher: register('Unit', 19),
    heavyCavArcher: register('Unit', 71),
    eleArcher: register('Unit', 393),
    eleArcherElite: register('Unit', 93),
    handCannoneer: register('Unit', 22),
    // Infantería
    militia: register('Unit', 8),
    maa: register('Unit', 10),
    longsword: register('Unit', 13),
    twoHanded: register('Unit', 12),
    champion: register('Unit', 72),
    spear: register('Unit', 31),
    pikeman: register('Unit', 11),
    halberdier: register('Unit', 104),
    eagleScout: register('Unit', 109),
    eagle: register('Unit', 148),
    eliteEagle: register('Unit', 149),
    champiScout: register('Unit', 540),
    champi: register('Unit', 555),
    fireLancer: register('Unit', 457),
    fireLancerElite: register('Unit', 458),
    // Asedio y Monasterio
    ram: register('Unit', 74),
    cappedRam: register('Unit', 63),
    siegeRam: register('Unit', 73),
    armoredEle: register('Unit', 394),
    siegeEle: register('Unit', 395),
    mangonel: register('Unit', 27),
    onager: register('Unit', 101),
    siegeOnager: register('Unit', 102),
    rocketCart: register('Unit', 459),
    rocketCartHeavy: register('Unit', 460),
    scorpion: register('Unit', 80),
    heavyScorpion: register('Unit', 89),
    bbc: register('Unit', 30),
    treb: register('Unit', 29),
    monk: register('Unit', 218),
    missionary: register('Unit', 107),
    // Edificios
    tc: register('Building', 28),
    castle: register('Building', 7),
    tower: register('Building', 25),
    bombardTower: register('Building', 42),
    krepost: register('Building', 55),
    donjon: register('Building', 84),
    siegeWorkshop: register('Building', 22),
    monastery: register('Building', 10),
    // Tecnologías críticas (Brechas del árbol)
    bloodlines: register('Tech', 110),
    thumbRing: register('Tech', 112),
    parthian: register('Tech', 111),
    bracer: register('Tech', 37),
    ringArcherArmor: register('Tech', 51),
    plateBarding: register('Tech', 65),
    plateMail: register('Tech', 64),
    blastFurnace: register('Tech', 21),
    siegeEngineers: register('Tech', 101),
    redemption: register('Tech', 92),
    heresy: register('Tech', 108),
    sanctity: register('Tech', 83),
    atonement: register('Tech', 93),
    chemistry: register('Tech', 12),
  };

  // Descargar todos los PNGs faltantes con concurrencia controlada
  const entries = [...required.values()];
  let downloaded = 0;
  let cached = 0;
  const queue = [...entries];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      const dest = path.join(OUT_DIR, item.file);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
        cached += 1;
        continue;
      }
      const url = `https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/${item.folder}/${item.pic}.png`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed downloading ${url}: HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        throw new Error(`Invalid PNG bytes for ${url}`);
      }
      fs.writeFileSync(dest, buf);
      downloaded += 1;
    }
  });
  await Promise.all(workers);

  const jsSource = `/* Auto-generado por tools/sync-aoe2-icons.js — Iconos oficiales AoE2:DE (SiegeEngineers/aoe2techtree) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AoE2Icons = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ICONS = ${JSON.stringify(ICONS, null, 2)};
  const CIV_UU = ${JSON.stringify(civUuIcons, null, 2)};
  const UU_BY_NAME = ${JSON.stringify(uuNameIcons, null, 2)};

  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\\s]/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  const KEYWORD_RULES = [
    // Unidades únicas y regionales específicas antes de reglas genéricas
    ['lanzador de hachas', 'u_43.png'],
    ['huscarle', 'u_42.png'],
    ['mangudai', 'u_44.png'],
    ['catafracta', 'u_40.png'],
    ['arquero con arco largo', 'u_41.png'],
    ['arquero emplumado', 'u_111.png'],
    ['arquero de ratan', 'u_232.png'],
    ['arquero en camello', 'u_200.png'],
    ['arquero con arco compuesto', 'u_407.png'],
    ['arquero de fuego', 'u_461.png'],
    ['arquero de los bosques', 'u_544.png'],
    ['chu ko nu', 'u_48.png'],
    ['jenizaro', 'u_46.png'],
    ['genizaro', 'u_46.png'],
    ['conquistador', 'u_106.png'],
    ['carro de guerra husita', 'u_370.png'],
    ['carro de guerra', 'u_112.png'],
    ['canon de salvas', 'u_204.png'],
    ['caballeria tigresa', 'u_462.png'],
    ['caballeria hei guang', 'u_429.png'],
    ['hei guang', 'u_429.png'],
    ['ghulam', 'u_391.png'],
    ['shrivamsha', 'u_396.png'],
    ['chakram', 'u_390.png'],
    ['ratha', 'u_389.png'],
    ['monaspa', 'u_408.png'],
    ['leitis', 'u_271.png'],
    ['konnik', 'u_269.png'],
    ['keshik', 'u_270.png'],
    ['kipchak', 'u_272.png'],
    ['boyardo', 'u_183.png'],
    [' costiller', 'u_352.png'],
    ['coustillier', 'u_352.png'],
    ['serjeant', 'u_353.png'],
    ['sargento', 'u_353.png'],
    ['obuch', 'u_369.png'],
    ['arambai', 'u_230.png'],
    ['karambit', 'u_233.png'],
    ['gbeto', 'u_203.png'],
    ['shotel', 'u_202.png'],
    ['zenete', 'u_201.png'],
    ['kamayuk', 'u_181.png'],
    ['ondero', 'u_186.png'],
    ['hondero', 'u_186.png'],
    ['condotiero', 'u_184.png'],
    ['magiar', 'u_182.png'],
    ['tark', 'u_105.png'],
    ['samurai', 'u_39.png'],
    ['berserker', 'u_38.png'],
    ['caballero teutonico', 'u_45.png'],
    ['mameluco', 'u_37.png'],
    ['elefante persa', 'u_36.png'],
    ['elefante con balista', 'u_231.png'],
    ['centurion', 'u_405.png'],
    ['legionario', 'u_404.png'],
    ['varego', ICONS.champion],

    // Edificios / Posturas
    ['krepost', ICONS.krepost],
    ['donjon', ICONS.donjon],
    ['torre de bombardeo', ICONS.bombardTower],
    ['trush', ICONS.tower],
    ['torre', ICONS.tower],
    ['unidad unica', ICONS.castle],
    ['fast castle', ICONS.castle],
    ['castillo', ICONS.castle],
    ['1 tc', ICONS.tc],
    ['2 tc', ICONS.tc],
    ['3 tc', ICONS.tc],
    ['boom', ICONS.tc],
    ['pase rapido', ICONS.tc],
    ['pase limpio', ICONS.tc],

    // Unidades estándar (específico -> general)
    ['husar alado', ICONS.wingedHussar],
    ['husares alados', ICONS.wingedHussar],
    ['husar', ICONS.hussar],
    ['caballeria ligera', ICONS.lightCav],
    ['scout camello', ICONS.camelScout],
    ['scouts camello', ICONS.camelScout],
    ['explorador a camello', ICONS.camelScout],
    ['camello imperial', ICONS.impCamel],
    ['camellos imperiales', ICONS.impCamel],
    ['camello pesado', ICONS.heavyCamel],
    ['camellos pesados', ICONS.heavyCamel],
    ['camello', ICONS.camel],
    ['scouts', ICONS.scout],
    ['scout', ICONS.scout],
    ['paladin', ICONS.paladin],
    ['caballeros', ICONS.cavalier],
    ['jinetes', ICONS.knight],
    ['jinete', ICONS.knight],
    ['lancero estepario', ICONS.steppe],
    ['lanceros esteparios', ICONS.steppe],
    ['esteparios de elite', ICONS.steppeElite],
    ['estepario', ICONS.steppe],
    ['lancero incendiario', ICONS.fireLancer],
    ['lanceros incendiarios', ICONS.fireLancer],
    ['lanceros de fuego', ICONS.fireLancer],
    ['elefante de asedio', ICONS.siegeEle],
    ['elefantes de asedio', ICONS.siegeEle],
    ['elefante acorazado', ICONS.armoredEle],
    ['elefantes acorazados', ICONS.armoredEle],
    ['arquero en elefante', ICONS.eleArcher],
    ['arqueros en elefante', ICONS.eleArcher],
    ['elefante', ICONS.battleEle],

    ['arbalestero', ICONS.arbalester],
    ['ballestero', ICONS.xbow],
    ['arq a caballo pesado', ICONS.heavyCavArcher],
    ['caballeria pesada', ICONS.cavalier],
    ['arqueros a caballo', ICONS.cavArcher],
    ['arquero a caballo', ICONS.cavArcher],
    ['guerrillero imperial', ICONS.impSkirm],
    ['guerrilleros de elite', ICONS.eliteSkirm],
    ['hostigador de elite', ICONS.eliteSkirm],
    ['guerrillero', ICONS.skirm],
    ['hostigador', ICONS.skirm],
    ['artillero', ICONS.handCannoneer],
    ['polvora', ICONS.handCannoneer],
    ['arquero', ICONS.archer],

    ['alabardero', ICONS.halberdier],
    ['piquero', ICONS.pikeman],
    ['lancero', ICONS.spear],
    ['aguilas de elite', ICONS.eliteEagle],
    ['aguila de elite', ICONS.eliteEagle],
    ['guerrero aguila', ICONS.eagle],
    ['guerreros aguila', ICONS.eagle],
    ['aguila', ICONS.eagleScout],
    ['champis de elite', ICONS.champi],
    ['champi', ICONS.champiScout],
    ['campeon', ICONS.champion],
    ['mandoble', ICONS.twoHanded],
    ['espada larga', ICONS.longsword],
    ['infanteria de espada', ICONS.champion],
    ['espadachin', ICONS.longsword],
    ['hombre de armas', ICONS.maa],
    ['hombres de armas', ICONS.maa],
    ['milicia', ICONS.militia],
    ['drush', ICONS.militia],

    ['onagro de asedio', ICONS.siegeOnager],
    ['onagros de asedio', ICONS.siegeOnager],
    ['onagro', ICONS.onager],
    ['mangonel', ICONS.mangonel],
    ['mangana', ICONS.mangonel],
    ['carro de cohetes', ICONS.rocketCart],
    ['carros de cohetes', ICONS.rocketCart],
    ['escorpion pesado', ICONS.heavyScorpion],
    ['escorpiones pesados', ICONS.heavyScorpion],
    ['escorpion', ICONS.scorpion],
    ['ariete de asedio', ICONS.siegeRam],
    ['arietes de asedio', ICONS.siegeRam],
    ['ariete cubierto', ICONS.cappedRam],
    ['ariete', ICONS.ram],
    ['canon de asedio', ICONS.bbc],
    ['canones de asedio', ICONS.bbc],
    ['lanzapiedras', ICONS.treb],
    ['asedio', ICONS.mangonel],
    ['misionero', ICONS.missionary],
    ['monje', ICONS.monk],
  ];

  const TECH_RULES = [
    ['pureza de sangre', ICONS.bloodlines],
    ['dactilera', ICONS.thumbRing],
    ['partias', ICONS.parthian],
    ['brazal', ICONS.bracer],
    ['anillas', ICONS.ringArcherArmor],
    ['anillos', ICONS.ringArcherArmor],
    ['barda de placas', ICONS.plateBarding],
    ['placas', ICONS.plateBarding],
    ['alto horno', ICONS.blastFurnace],
    ['ingenieros de asedio', ICONS.siegeEngineers],
    ['redencion', ICONS.redemption],
    ['herejia', ICONS.heresy],
    ['santidad', ICONS.sanctity],
    ['expiacion', ICONS.atonement],
    ['alabardero', ICONS.halberdier],
    ['arbalestero', ICONS.arbalester],
    ['ballestero', ICONS.xbow],
    ['paladin', ICONS.paladin],
    ['husar', ICONS.hussar],
    ['canon de asedio', ICONS.bbc],
  ];

  function fixPath(p) {
    if (!p) return ICONS.tc;
    return p.startsWith('assets/') ? p : ('assets/icons/aoe2/' + p);
  }

  function civUniqueUnitIcon(civSlug) {
    const k = String(civSlug || '').toLowerCase() === 'tupis' ? 'tupi' : String(civSlug || '').toLowerCase();
    return CIV_UU[k] || ICONS.castle;
  }

  function unitIcon(label, civSlug) {
    const n = norm(label);
    if (!n) return ICONS.tc;
    if (UU_BY_NAME[n]) return UU_BY_NAME[n];
    // Substring match against exact 56 UU names (longest first)
    let bestUu = null;
    let bestLen = 0;
    for (const [uuKey, iconPath] of Object.entries(UU_BY_NAME)) {
      if (uuKey.length >= 4 && n.includes(uuKey) && uuKey.length > bestLen) {
        bestUu = iconPath;
        bestLen = uuKey.length;
      }
    }
    if (bestUu) return bestUu;
    for (const [kw, iconPath] of KEYWORD_RULES) {
      if (n.includes(kw.trim())) {
        if (kw === 'unidad unica' && civSlug) return civUniqueUnitIcon(civSlug);
        return fixPath(iconPath);
      }
    }
    if (civSlug && CIV_UU[civSlug]) return CIV_UU[civSlug];
    return ICONS.tc;
  }

  function techIcon(holeLabel) {
    const n = norm(holeLabel);
    for (const [kw, iconPath] of TECH_RULES) {
      if (n.includes(kw)) return fixPath(iconPath);
    }
    return unitIcon(holeLabel);
  }

  function clashIcon(clashLabel, civSlug) {
    const n = norm(clashLabel);
    if (n.includes('unidades unicas')) return civSlug ? civUniqueUnitIcon(civSlug) : ICONS.castle;
    if (n.includes('polvora')) return ICONS.handCannoneer;
    if (n.includes('asedio')) return ICONS.bbc;
    if (n.includes('espada')) return ICONS.champion;
    if (n.includes('camello')) return ICONS.heavyCamel;
    if (n.includes('caballeria')) return ICONS.paladin;
    if (n.includes('lancero') || n.includes('piquero')) return ICONS.halberdier;
    return unitIcon(clashLabel, civSlug);
  }

  function shortenPlanToken(raw) {
    return String(raw || '')
      .replace(/^Apertura defensiva de\\s+/i, '')
      .replace(/^Apertura de\\s+/i, '')
      .replace(/^Rush de\\s+/i, '')
      .replace(/^Defensa\\s+/i, '')
      .replace(/\\s*\\[[^\\]]+\\]\\s*/g, '')
      .trim();
  }

  function tokenizePlanLine(rawLine, civSlug) {
    const clean = String(rawLine || '').trim();
    if (!clean) return [];
    const chunks = clean.split(/\\s*(?:\\+|→)\\s*/).map((s) => s.trim()).filter(Boolean);
    const seps = (clean.match(/\\+|→/g) || []);
    return chunks.slice(0, 3).map((chunk, idx) => ({
      raw: chunk,
      short: shortenPlanToken(chunk),
      icon: unitIcon(chunk, civSlug),
      sepBefore: idx > 0 ? (seps[idx - 1] || '+') : null,
    }));
  }

  return {
    ICONS,
    CIV_UU,
    civUniqueUnitIcon,
    unitIcon,
    techIcon,
    clashIcon,
    tokenizePlanLine,
  };
});
`;

  // Asegurar que cualquier u_XXX referenciado en KEYWORD_RULES también se descargue
  const extraMatches = [...jsSource.matchAll(/'u_(\d+)\.png'/g)];
  for (const m of extraMatches) {
    const pic = Number(m[1]);
    const file = `u_${pic}.png`;
    const dest = path.join(OUT_DIR, file);
    if (!fs.existsSync(dest)) {
      const url = `https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/img/Unit/${pic}.png`;
      const res = await fetch(url);
      if (res.ok) {
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        downloaded += 1;
      }
    }
  }

  fs.writeFileSync(OUT_JS, jsSource, 'utf8');
  console.log(`Done! Icons ready in assets/icons/aoe2/ (downloaded=${downloaded}, cached=${cached}, totalFiles=${fs.readdirSync(OUT_DIR).length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
