'use strict';

// Editorial checkpoints, not a live build tracker. The roster identifies a civ;
// it does not tell us what the player has trained, researched or completed.
const tree = require('./civ-tech.json');
const { CIV_GUIDE } = require('./civ-guide');
const { civSlug } = require('./civs');
const { resolveMode } = require('./insights');

const VERSION = 'smart-build-reference-v1';
const REFERENCE_LABEL = 'Guía de referencia · pasos actuales sin medir';
const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Positive allowlist: recognizing a map name is not evidence that a custom,
// Nomad, water or unusual-resource start matches a terrestrial RM recipe.
const MAPS = Object.freeze({
  arabia: 'open', runestones: 'open', goldenpit: 'open', goldrush: 'open',
  acropolis: 'open', serengeti: 'open', valley: 'open', landmadness: 'open',
  arena: 'closed', blackforest: 'closed', hideout: 'closed',
});
const URLS = Object.freeze({
  scouts: 'https://aoecompanion.com/build-guides/scout-rush',
  maa: 'https://aoecompanion.com/build-guides/men-at-arms-archers',
  archers: 'https://aoecompanion.com/build-guides/archer-rush',
  fc: 'https://aoecompanion.com/build-guides/fast-castle-boom',
  fi: 'https://aoecompanion.com/build-guides/fast-imperial',
  turksFi: 'https://www.youtube.com/watch?v=7TVgpsKBxWk',
  ages: 'https://www.ageofempires.com/learn-to-play/advancing-aoe2/',
});

const point = (icons, text) => ({ icons, text });

function guideLibrary(slug) {
  const nodes = tree.civilizations[slug]?.nodes;
  const available = (name, age) => Boolean(nodes && Number.isInteger(nodes[name]) && nodes[name] <= age);
  const archers = available('Archer', 2);
  const scouts = available('Scout Cavalry', 2) && slug !== 'gurjaras';
  const maa = available('Militia', 1) && available('Man-at-Arms', 2) && archers;
  const feudalArmyBuildings = slug === 'khmer'
    ? 'Al llegar a Feudal, prepará la producción militar; esta civ no necesita cuartel como prerrequisito.'
    : 'Prepará el cuartel durante la subida; al llegar a Feudal, construí el edificio de producción.';
  const earlyFood = ['chinese', 'mayans'].includes(slug)
    ? 'Adaptá la primera producción a tus aldeanos y recursos iniciales; priorizá comida sin copiar una numeración genérica.'
    : 'Priorizá comida inicial con ovejas y caza, sosteniendo la producción de aldeanos.';
  const wood = ['armenians', 'georgians'].includes(slug)
    ? 'Sumá madera y bayas; ubicá el carro de mulas y los puntos de entrega cerca de los recursos.'
    : 'Sumá madera para economía y edificios; prepará el punto de entrega para las bayas.';
  const archerContinuation = available('Crossbowman', 3)
    ? 'Evaluá la continuidad a ballesteros cuando llegues a Castillos.'
    : 'Esta civ no tiene ballestero genérico: prepará otra continuación antes de Castillos.';
  const standardCaveats = ['Hitos orientativos: no son una receta de población ni un presupuesto exacto del parche actual.'];
  const guides = [
    { key: 'scouts', label: 'Scouts', icon: 'scout', available: scouts,
      unavailableReason: scouts ? null : 'La referencia necesita Scouts entrenables; no sustituye una variante de Camel Scout o águilas.',
      checkpoints: [
        point(['villager', 'food', 'sheep', 'boar'], earlyFood),
        point(['wood', 'berries', 'building'], wood),
        point(['food', 'age', 'villager'], 'Prepará la comida del avance y Telar según la seguridad, manteniendo la economía.'),
        point(['barracks', 'stable', 'age'], `${feudalArmyBuildings} Para esta ruta, el objetivo es el establo y Scouts.`),
        point(['scout', 'food', 'wood'], 'Sostené Scouts y aldeanos con comida; pasá a granjas al agotarse las fuentes iniciales.'),
      ], condition: 'Ante lanzas o accesos cerrados, evitá invertir todos los recursos en Scouts y prepará apoyo.',
      caveats: [...standardCaveats], sources: [URLS.scouts] },
    { key: 'maa-archers', label: 'M@A → Arqueros', icon: 'sword', available: maa,
      unavailableReason: maa ? null : 'La referencia necesita milicias, Hombres de Armas y arqueros disponibles en sus edades.',
      checkpoints: [
        point(['villager', 'food', 'sheep', 'boar'], earlyFood),
        point(['wood', 'berries', 'barracks'], `${wood} Prepará un cuartel antes de llegar a Feudal.`),
        point(['sword', 'gold', 'food'], 'Prepará un pequeño grupo de milicias y oro; reservá la comida del avance.'),
        point(['sword', 'age'], slug === 'bulgarians'
          ? 'Al alcanzar Feudal, la mejora a Hombres de Armas es gratuita para esta civ.'
          : 'Al alcanzar Feudal, mejorá las milicias a Hombres de Armas antes de comprometerlas.'),
        point(['wood', 'gold', 'archer', 'blacksmith'], `Transicioná a madera y oro para galería, arqueros y Emplumado. ${archerContinuation}`),
      ], condition: 'La presión de milicias compite con la comida del avance; ajustá la inversión ante defensas y contraataques.',
      caveats: [...standardCaveats], sources: [URLS.maa] },
    { key: 'archers', label: 'Arqueros', icon: 'archer', available: archers,
      unavailableReason: archers ? null : 'Esta civ no tiene la línea de arquero entrenable en Feudal.',
      checkpoints: [
        point(['villager', 'food', 'sheep', 'boar'], earlyFood),
        point(['wood', 'berries', 'building'], wood),
        point(['gold', 'wood', 'age'], 'Durante la subida, prepará oro y madera para la producción de arqueros.'),
        point(['barracks', 'archer', 'blacksmith'], `${feudalArmyBuildings} Sumá galería, herrería y Emplumado.`),
        point(['archer', 'food', 'gold'], `Sostené aldeanos y arqueros; la cantidad de galerías depende del presupuesto. ${archerContinuation}`),
      ], condition: 'Ante guerrilleros o asedio, prepará apoyo y cuidá la inversión en una sola línea.',
      caveats: [...standardCaveats], sources: [URLS.archers] },
    { key: 'fc', label: 'FC → Economía', icon: 'castle', available: Boolean(nodes),
      unavailableReason: nodes ? null : 'Hace falta confirmar una civilización compatible.',
      checkpoints: [
        point(['villager', 'food', 'sheep', 'boar'], earlyFood),
        point(['wood', 'gold', 'berries'], 'Prepará madera para edificios y oro antes de Feudal; cuidá los accesos y la economía.'),
        point(['market', 'blacksmith', 'age'], slug === 'khmer'
          ? 'Prepará la comida y el oro de Castillos; esta civ omite los prerrequisitos habituales de edificios.'
          : 'Mercado y herrería son una pareja habitual de edificios para habilitar Castillos; reservá comida y oro.'),
        point(['castle', 'wood', 'stone'], 'Al llegar a Castillos, prepará madera y piedra para centros urbanos adicionales cuando sea seguro.'),
        point(['villager', 'food', 'building'], 'Sostené aldeanos y granjas; financiá defensa antes de ampliar una economía bajo presión.'),
      ], condition: 'FC no implica caballeros ni unidad única: esta referencia tiene como objetivo ampliar la economía.',
      caveats: [...standardCaveats, 'En mapas abiertos, una agresión temprana puede invalidar un FC sin defensa.'], sources: [URLS.fc, URLS.ages] },
    { key: 'fi', label: 'FI → Pólvora', icon: 'gunpowder', available: slug === 'turks' && available('Hand Cannoneer', 4) && available('Bombard Cannon', 4),
      unavailableReason: slug === 'turks' ? null : 'La variante revisada es Turcos en Arena; no es una receta FI universal.',
      checkpoints: [
        point(['villager', 'food', 'wood'], 'Priorizá una economía protegida de comida y granjas; prepará la madera de los edificios.'),
        point(['gold', 'age', 'castle'], 'Pasá por Feudal y Castillos, reforzando oro sin abandonar la producción de aldeanos.'),
        point(['building', 'castle', 'age'], 'Prepará edificios habilitantes de Castillos o un castillo; reservá comida y oro para Imperial.'),
        point(['gunpowder', 'gold', 'wood'], 'Prepará la producción para arcabuceros y cañones de asedio, con madera y oro para sostenerla.'),
        point(['shield', 'gunpowder', 'food'], 'Protegé el ejército y conservá economía: el avance tecnológico necesita producción y posiciones seguras.'),
      ], condition: 'Especializada para Turcos en Arena; una agresión o un castillo enemigo puede exigir cambiar de plan.',
      caveats: [...standardCaveats, 'La fuente turca valida la estructura de la ruta, no un tiempo óptimo ni una población revisada para 2026.'],
      sources: [URLS.fi, URLS.turksFi, URLS.ages] },
  ];
  if (slug === 'huns') for (const guide of guides) guide.caveats.push('Los Hunos no necesitan casas; esta referencia no incluye una apertura de casas.');
  if (slug === 'italians') for (const guide of guides) guide.caveats.push('Los descuentos de avance de esta civ cambian el presupuesto; no se muestran costes genéricos como exactos.');
  if (slug === 'gurjaras') for (const guide of guides) {
    guide.available = false;
    guide.unavailableReason = 'Hace falta una variante revisada para ganado guarnecido y Camel Scout; no se aplica la receta genérica.';
  }
  return guides;
}

function contextProblem(options, slug, mode, mapKind) {
  if (!tree.civilizations[slug] || options.ownCivConfirmed === false) return 'Esperando la civilización propia confirmada.';
  if (!mode || mode.group !== 'rm') return 'Estas referencias empiezan en Alta Edad Media de RM; no se aplican a EW, DM ni modos desconocidos.';
  if (mode.size !== '1v1') return 'Falta una variante de equipo que contemple la posición y el papel de cada jugador.';
  if (options.standardStart === false || options.settingsKnown === false || options.customStart === true) return 'El inicio de esta partida no está confirmado como estándar.';
  if (options.startingAge != null && !['dark', 'darkage', '1'].includes(fold(options.startingAge))) return 'La edad inicial no corresponde a una referencia RM desde Alta Edad Media.';
  if (!mapKind) return 'Sin variante revisada para este mapa: agua, Nomad, MegaRandom e inicios desconocidos requieren otra referencia.';
  if (slug === 'gurjaras') return 'La economía gurjara y Camel Scout necesitan una variante propia revisada.';
  return null;
}

function preferredOpening(options, slug, guides) {
  const plan = (Array.isArray(options.opportunityStages) ? options.opportunityStages : []).find((entry) => entry?.status === 'ready' && entry.age === 'feudal' && civSlug(entry.ownCiv) === slug && fold(entry.mapName) === fold(options.mapName));
  const mapping = { scouts: 'scouts', archers: 'archers', infantry: 'maa-archers' };
  const viable = (plan?.candidates || []).filter((entry) => Number.isFinite(entry.score) && entry.score >= 0 && entry.score <= 100 && guides.some((guide) => guide.key === mapping[entry.key] && guide.available))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  if (viable.length) return { key: mapping[viable[0].key], reason: 'La ruta Feudal viable mejor puntuada orienta esta referencia; no demuestra cuál es tu apertura actual.' };
  const role = fold(CIV_GUIDE[slug]?.role);
  const preference = role.includes('arqueros') ? ['archers', 'scouts', 'maa-archers']
    : role.includes('infanteria') ? ['maa-archers', 'archers', 'scouts'] : ['scouts', 'archers', 'maa-archers'];
  return { key: preference.find((key) => guides.some((guide) => guide.key === key && guide.available)),
    reason: 'Referencia terrestre sugerida por líneas disponibles y afinidad general de la civilización, sin apertura actual detectada.' };
}

function buildSmartBuildOrder(options = {}) {
  const slug = civSlug(options.ownCiv);
  const mode = resolveMode(options.mode);
  const mapKind = MAPS[fold(options.mapName)] || null;
  const guides = guideLibrary(slug);
  const problem = contextProblem(options, slug, mode, mapKind);
  const caveats = [
    'La civilización y el contexto permiten sugerir una referencia; no conocemos tu apertura actual, reparto de aldeanos ni pasos completados.',
    'La guía no avanza con el reloj y no exige controles durante la partida.',
  ];
  const result = { status: problem ? 'unavailable' : 'ready', version: VERSION, automatic: true,
    title: 'Plan sugerido', referenceLabel: REFERENCE_LABEL, ownCiv: options.ownCiv || null,
    mapName: options.mapName || null, mode: mode?.key || null, selected: null, guides,
    reasons: problem ? [problem] : [], caveats,
    source: { kind: 'editorial-reference', reviewedAt: '2026-11-14', treeRef: tree.source.ref, urls: [...new Set(Object.values(URLS))] },
    data: { liveOpeningKnown: false, liveStepsKnown: false, liveEconomyKnown: false, currentAgeKnown: false, standardRankedContext: !problem },
  };
  if (problem) return result;
  let choice;
  if (slug === 'turks' && fold(options.mapName) === 'arena' && guides.find((guide) => guide.key === 'fi').available) {
    choice = { key: 'fi', reason: 'Turcos en Arena coincide con una variante especializada de FI revisada como referencia.' };
  } else if (mapKind === 'closed') {
    choice = { key: 'fc', reason: 'El mapa cerrado permite considerar FC hacia economía; su seguridad depende de la presión rival.' };
  } else choice = preferredOpening(options, slug, guides);
  result.selected = guides.find((guide) => guide.key === choice.key && guide.available) || null;
  if (!result.selected) {
    result.status = 'unavailable';
    result.reasons.push('No hay una ruta inicial revisada compatible con esta civilización y este mapa.');
  } else result.reasons.push(choice.reason);
  return result;
}

module.exports = { buildSmartBuildOrder, VERSION, REFERENCE_LABEL };
