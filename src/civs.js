'use strict';

/**
 * Escudos de civilización.
 *
 * Los PNG viven en assets/civs/ (descargados una vez de aoe2techtree.net, así
 * el overlay no depende de la red para dibujar). El nombre que devuelve la API
 * de la partida es el nombre en inglés del juego ("Spanish", "Wu", "Jurchens"),
 * así que se normaliza a slug: minúsculas, sin espacios ni signos.
 */

const CIV_SLUGS = [
  'achaemenids',
  'armenians',
  'athenians',
  'aztecs',
  'bengalis',
  'berbers',
  'bohemians',
  'britons',
  'bulgarians',
  'burgundians',
  'burmese',
  'byzantines',
  'celts',
  'chinese',
  'cumans',
  'danes',
  'dravidians',
  'ethiopians',
  'franks',
  'georgians',
  'goths',
  'gurjaras',
  'hindustanis',
  'huns',
  'incas',
  'italians',
  'japanese',
  'jurchens',
  'khitans',
  'khmer',
  'koreans',
  'lithuanians',
  'macedonians',
  'magyars',
  'malay',
  'malians',
  'mapuche',
  'mayans',
  'mongols',
  'muisca',
  'persians',
  'poles',
  'portuguese',
  'puru',
  'romans',
  'saracens',
  'saxons',
  'shu',
  'sicilians',
  'slavs',
  'spanish',
  'spartans',
  'tatars',
  'teutons',
  'thracians',
  'tupi',
  'turks',
  'varangians',
  'vietnamese',
  'vikings',
  'wei',
  'wu',
];

const CIV_SET = new Set(CIV_SLUGS);

// Nombres viejos o variantes que puede devolver la API. Se exporta para que
// el renderer (sin Node) pueda resolver la guía de civ con el mismo criterio.
const CIV_ALIASES = {
  indians: 'hindustanis',
  khitansmongols: 'khitans',
};

/** Slug del escudo, o null si la civ no se reconoce (p. ej. "Random"). */
function civSlug(name) {
  const raw = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
  if (!raw) return null;
  const slug = CIV_ALIASES[raw] || raw;
  return CIV_SET.has(slug) ? slug : null;
}

/** Ruta relativa del escudo (relativa a index.html), o null. */
function civShield(name) {
  const slug = civSlug(name);
  return slug ? `assets/civs/${slug}.png` : null;
}

module.exports = { CIV_SLUGS, CIV_ALIASES, civSlug, civShield };
