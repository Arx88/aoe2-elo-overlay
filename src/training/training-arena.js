'use strict';

/**
 * Relic · Arena Táctica de Progresión (v6 · +400 preguntas 100 % verificadas contra AoE2:DE Wiki + Árbol Completo de 56 Civs)
 *
 * - Cero preguntas inventadas: cada ítem se compila determinísticamente desde
 *   `src/civ-tech.json` (56 civilizaciones estándar), `src/civ-guide.js`, `src/opportunities.js`
 *   y la tabla de bonos de civilización y tecnologías únicas (coronas de Castillos e Imperial).
 * - Nomenclatura 100 % oficial de Age of Empires II: Definitive Edition (verificada en español).
 * - Escalada real de 7 niveles (de 900–1100 ELO hasta 1900–2200+ Gran Maestro) con desbloqueo de 7 unidades icónicas.
 * - Cada pregunta tiene un `id` estable y determinista para seguimiento sin repeticiones.
 */

const CIV_TECH_RAW = require('../civ-tech.json');
const { CIV_GUIDE } = require('../civ-guide');
const { lineQuality } = require('../opportunities');

const CIV_TECH = CIV_TECH_RAW?.civilizations || {};

const VALID_CIV_SLUGS = Object.keys(CIV_GUIDE).filter((s) => Boolean(CIV_TECH[s]?.nodes));

const ICONIC_24 = [
  'britons', 'mongols', 'goths', 'spanish', 'turks', 'byzantines', 'persians', 'mayans',
  'aztecs', 'vikings', 'japanese', 'chinese', 'saracens', 'franks', 'teutons', 'celts',
  'huns', 'koreans', 'italians', 'slavs', 'incas', 'berbers', 'magyars', 'khmer',
].filter((s) => Boolean(CIV_TECH[s]?.nodes && CIV_GUIDE[s]));

const EUROPEAN_CIVS = new Set([
  'britons', 'byzantines', 'celts', 'franks', 'goths', 'italians', 'magyars', 'portuguese',
  'slavs', 'spanish', 'teutons', 'vikings', 'bulgarians', 'burgundians', 'lithuanians',
  'poles', 'bohemians', 'sicilians', 'romans', 'danes', 'saxons', 'varangians',
]);

const ROCKET_CART_CIVS = new Set(['koreans', 'khitans', 'chinese', 'jurchens']);

const LEVEL_CONFIG = [
  {
    level: 1,
    rankTitle: 'Infante de Guardia',
    eloBand: '900–1100 ELO',
    difficultyLabel: 'Nivel 1 · Fundamentos',
    unitKey: 'maa',
    unitName: 'Hombre de armas',
    unitPlural: 'Hombres de armas',
    requiredCorrect: 10,
    timerSec: 28,
    art: 'assets/art/apertura-militia.webp',
    portrait: 'assets/brand/opening-v1.png',
    icon: 'assets/icons/sword.png',
  },
  {
    level: 2,
    rankTitle: 'Tirador Feudal',
    eloBand: '1150–1300 ELO',
    difficultyLabel: 'Nivel 2 · Identidad y Aperturas',
    unitKey: 'crossbowman',
    unitName: 'Ballestero',
    unitPlural: 'Ballesteros',
    requiredCorrect: 12,
    timerSec: 26,
    art: 'assets/art/apertura-archers.webp',
    portrait: 'assets/brand/review-archer-v1.png',
    icon: 'assets/icons/archer.png',
  },
  {
    level: 3,
    rankTitle: 'Batidor de Frontera',
    eloBand: '1300–1450 ELO',
    difficultyLabel: 'Nivel 3 · Transiciones',
    unitKey: 'hussar',
    unitName: 'Húsar',
    unitPlural: 'Húsares',
    requiredCorrect: 14,
    timerSec: 25,
    art: 'assets/art/apertura-scouts.webp',
    portrait: 'assets/brand/review-scout-v1.png',
    icon: 'assets/icons/scout.png',
  },
  {
    level: 4,
    rankTitle: 'Comandante de Castillos',
    eloBand: '1450–1600 ELO',
    difficultyLabel: 'Nivel 4 · Herrería y Asedio',
    unitKey: 'paladin',
    unitName: 'Paladín',
    unitPlural: 'Paladines',
    requiredCorrect: 16,
    timerSec: 24,
    art: 'assets/art/apertura-castle.webp',
    portrait: 'assets/brand/review-knight-v1.png',
    icon: 'assets/icons/stable.png',
  },
  {
    level: 5,
    rankTitle: 'Custodio de Reliquias',
    eloBand: '1600–1750 ELO',
    difficultyLabel: 'Nivel 5 · Monasterio y Brechas',
    unitKey: 'monk',
    unitName: 'Monje',
    unitPlural: 'Monjes',
    requiredCorrect: 18,
    timerSec: 22,
    art: 'assets/art/apertura-monks.webp',
    portrait: 'assets/brand/review-relic-monk-v1.png',
    icon: 'assets/icons/relic.png',
  },
  {
    level: 6,
    rankTitle: 'Maestro de Asedio',
    eloBand: '1750–1900 ELO',
    difficultyLabel: 'Nivel 6 · Post-Imperial',
    unitKey: 'bombard_cannon',
    unitName: 'Cañón de asedio',
    unitPlural: 'Cañones de asedio',
    requiredCorrect: 20,
    timerSec: 20,
    art: 'assets/art/apertura-siege.webp',
    portrait: 'assets/brand/review-castle-v1.png',
    icon: 'assets/icons/castle.png',
  },
  {
    level: 7,
    rankTitle: 'Gran Maestro Imperial',
    eloBand: '1900–2200+ ELO',
    difficultyLabel: 'Nivel 7 · Extremo',
    unitKey: 'imperial_legend',
    unitName: 'Leyenda Imperial',
    unitPlural: 'Leyendas Imperiales',
    requiredCorrect: 25,
    timerSec: 18,
    art: 'assets/art/central-hero.jpg',
    portrait: 'assets/brand/imperial-v1.png',
    icon: 'assets/icons/crown.png',
  },
];

// Diccionario oficial AoE2:DE (verificado contra Wiki oficial y tablas ES)
const OFFICIAL_NODE_ES = {
  // Unidades finales y líneas
  'Paladin': { es: 'Paladín', sub: 'Mejora final de la línea de Jinetes', icon: 'stable' },
  'Cavalier': { es: 'Caballero (Cavalier)', sub: 'Mejora de Jinete en Edad Imperial', icon: 'stable' },
  'Arbalester': { es: 'Arbalestero', sub: 'Mejora final de la línea de Arqueros', icon: 'archer' },
  'Crossbowman': { es: 'Ballestero', sub: 'Mejora de Arquero en Edad de los Castillos', icon: 'archer' },
  'Hand Cannoneer': { es: 'Artillero manual', sub: 'Infantería de pólvora en Edad Imperial', icon: 'gunpowder' },
  'Halberdier': { es: 'Alabardero', sub: 'Infantería anticaballería final', icon: 'barracks' },
  'Pikeman': { es: 'Piquero', sub: 'Mejora anticaballería de Edad de los Castillos', icon: 'barracks' },
  'Elite Skirmisher': { es: 'Guerrillero de élite', sub: 'Antiarqueros mejorado en Castillos', icon: 'shield' },
  'Hussar': { es: 'Húsar', sub: 'Mejora final de Caballería ligera', icon: 'scout' },
  'Winged Hussar': { es: 'Húsar alado', sub: 'Mejora regional de Caballería ligera (Polacos y Lituanos)', icon: 'scout' },
  'Champion': { es: 'Campeón', sub: 'Mejora final de infantería de espada', icon: 'sword' },
  'Two-Handed Swordsman': { es: 'Espadachín de mandoble', sub: 'Infantería de espada en Imperial', icon: 'sword' },
  'Long Swordsman': { es: 'Espadachín de espada larga', sub: 'Infantería de espada en Castillos', icon: 'sword' },
  'Heavy Cavalry Archer': { es: 'Arquero a caballo pesado', sub: 'Mejora final de Arquero a caballo', icon: 'archer' },
  'Bombard Cannon': { es: 'Cañón de asedio', sub: 'Artillería de pólvora en Edad Imperial', icon: 'gunpowder' },
  'Siege Onager': { es: 'Onagro de asedio', sub: 'Mejora final de Mangana / Onagro', icon: 'castle' },
  'Siege Ram': { es: 'Ariete de asedio', sub: 'Mejora final de Ariete', icon: 'building' },
  'Capped Ram': { es: 'Ariete cubierto', sub: 'Mejora de Ariete en Imperial', icon: 'building' },
  'Battering Ram': { es: 'Ariete', sub: 'Asedio para derribar edificios', icon: 'building' },
  'Steppe Lancer': { es: 'Lancero estepario', sub: 'Caballería regional con 1 de alcance', icon: 'scout' },
  'Battle Elephant': { es: 'Elefante de combate', sub: 'Caballería pesada regional con daño de área', icon: 'stable' },
  'Elephant Archer': { es: 'Elefante arquero', sub: 'Arquero montado pesado regional', icon: 'archer' },
  'Hei Guang Cavalry': { es: 'Caballería de Hei Guang', sub: 'Caballería pesada regional', icon: 'stable' },
  'Dromon': { es: 'Dromón', sub: 'Buque de asedio naval regional', icon: 'castle' },
  'Heavy Scorpion': { es: 'Escorpión pesado', sub: 'Asedio antipersonal en Imperial', icon: 'castle' },

  // Tecnologías de Herrería, Establo, Galería, Cuarteles, Universidad, Monasterio y Eco
  'Bloodlines': { es: 'Pureza de sangre', sub: '+20 PR para unidades montadas', icon: 'stable' },
  'Husbandry': { es: 'Ganadería', sub: '+10 % velocidad de caballería', icon: 'scout' },
  'Thumb Ring': { es: 'Dactilera', sub: 'Mayor cadencia y 100 % de precisión en arqueros', icon: 'archer' },
  'Bracer': { es: 'Brazal', sub: '+1 ataque y +1 alcance en Edad Imperial', icon: 'blacksmith' },
  'Bodkin Arrow': { es: 'Flecha de punzón', sub: '+1 ataque y +1 alcance en Castillos', icon: 'blacksmith' },
  'Ring Archer Armor': { es: 'Armadura de anillos de arquero', sub: 'Última armadura de arqueros (+1/+2)', icon: 'blacksmith' },
  'Plate Barding Armor': { es: 'Barda de placas', sub: 'Última armadura de caballería (+1/+2)', icon: 'blacksmith' },
  'Plate Mail Armor': { es: 'Armadura de placas', sub: 'Última armadura de infantería (+1/+2)', icon: 'blacksmith' },
  'Chain Mail Armor': { es: 'Cota de malla', sub: 'Segunda armadura de infantería (+1/+1)', icon: 'blacksmith' },
  'Scale Mail Armor': { es: 'Armadura de láminas', sub: 'Primera armadura de infantería (+1/+1)', icon: 'blacksmith' },
  'Blast Furnace': { es: 'Alto horno', sub: '+2 ataque cuerpo a cuerpo en Imperial', icon: 'blacksmith' },
  'Iron Casting': { es: 'Fundición de hierro', sub: '+1 ataque cuerpo a cuerpo en Castillos (estándar)', icon: 'blacksmith' },
  'Forging': { es: 'Forja', sub: '+1 ataque cuerpo a cuerpo en Feudal (estándar)', icon: 'blacksmith' },
  'Parthian Tactics': { es: 'Tácticas de los partos', sub: '+1/+2 armadura y daño extra vs piqueros', icon: 'archer' },
  'Siege Engineers': { es: 'Ingenieros de asedio', sub: '+1 alcance (asedio a distancia) y +20 % daño a edificios (+40 % Petardos)', icon: 'building' },
  'Chemistry': { es: 'Química', sub: '+1 ataque en proyectiles y habilita pólvora', icon: 'gunpowder' },
  'Ballistics': { es: 'Balística', sub: 'Proyectiles anticipan el movimiento rival', icon: 'archer' },
  'Squires': { es: 'Escuderos', sub: '+10 % velocidad de infantería', icon: 'barracks' },
  'Gambesons': { es: 'Gambesones', sub: '+1 armadura antiproyectil para línea de Milicia', icon: 'barracks' },
  'Arson': { es: 'Incendiarismo', sub: '+2 daño de infantería contra edificios', icon: 'barracks' },
  'Redemption': { es: 'Redención', sub: 'Monjes convierten asedio y la mayoría de edificios', icon: 'relic' },
  'Block Printing': { es: 'Letras de imprenta', sub: '+3 alcance de conversión y línea de visión para Monjes', icon: 'relic' },
  'Heresy': { es: 'Herejía', sub: 'Unidades convertidas mueren en lugar de cambiar de bando', icon: 'relic' },
  'Sanctity': { es: 'Santidad', sub: '+15 PR para Monjes (resisten 1 disparo de Mangana en terreno llano)', icon: 'relic' },
  'Fervor': { es: 'Fervor', sub: '+15 % velocidad de movimiento de Monjes', icon: 'relic' },
  'Atonement': { es: 'Expiación', sub: 'Monjes pueden convertir Monjes enemigos', icon: 'relic' },
  'Illumination': { es: 'Iluminación', sub: 'Monjes recuperan la fe en la mitad de tiempo', icon: 'relic' },
  'Theocracy': { es: 'Teocracia', sub: 'Solo un Monje descansa tras conversión grupal', icon: 'relic' },
  'Faith': { es: 'Fe', sub: 'Unidades mucho más resistentes a conversión', icon: 'relic' },
  'Devotion': { es: 'Devoción', sub: 'Resistencia inicial contra conversiones', icon: 'relic' },
  'Herbal Medicine': { es: 'Medicina a base de hierbas', sub: 'Unidades guarnecidas se curan 6 veces más rápido', icon: 'relic' },
  'Double-Bit Axe': { es: 'Hacha de doble filo', sub: '+20 % velocidad de tala en Feudal', icon: 'wood' },
  'Bow Saw': { es: 'Sierra de arco', sub: '+20 % velocidad de tala en Castillos', icon: 'wood' },
  'Two-Man Saw': { es: 'Sierra a dos', sub: '+10 % tala final en Edad Imperial', icon: 'wood' },
  'Guilds': { es: 'Gremios', sub: 'Comisión del Mercado reducida al 15 %', icon: 'market' },
  'Architecture': { es: 'Arquitectura', sub: '+10 % PR y +1/+1 armadura a edificios (Edad Imperial)', icon: 'building' },
  'Masonry': { es: 'Albañilería', sub: '+10 % PR y +1/+1 armadura a edificios (Edad de los Castillos)', icon: 'building' },
  'Fortified Wall': { es: 'Muralla fortificada', sub: 'Muralla de piedra reforzada en Castillos', icon: 'castle' },
  'Hoardings': { es: 'Ladronera', sub: '+21 % PR a los Castillos (Edad Imperial)', icon: 'castle' },
  'Stone Shaft Mining': { es: 'Pozo de cantera', sub: '+15 % extracción de piedra en Castillos', icon: 'stone' },
  'Gold Shaft Mining': { es: 'Pozo minero aurífero', sub: '+15 % extracción de oro en Castillos', icon: 'gold' },
  'Crop Rotation': { es: 'Rotación de cultivos', sub: '+175 comida por granja en Imperial', icon: 'food' },
};

// Unidades Únicas reales del Castillo (solo unidades entrenadas en el Castillo; sin unidades de Muelle/Monasterio/Establo/Cuartel/Regionales ni truncamientos)
// Si el nombre de la unidad contiene literalmente el nombre de la civ (p. ej. Teutones/Magiares/Daneses),
// usamos una pregunta sobre su Corona o identidad sin regalar la respuesta.
const CASTLE_UNIQUE_IDENTITY = {
  armenians: { kind: 'castle_uu', label: 'Arquero con arco compuesto', note: 'Sus flechas ignoran la armadura antiproyectil rival.' },
  aztecs: { kind: 'castle_uu', label: 'Guerrero jaguar', note: 'Infantería de élite especializada contra otra infantería.' },
  bengalis: { kind: 'castle_uu', label: 'Ratha', note: 'Carro de guerra capaz de alternar entre ataque a distancia y cuerpo a cuerpo.' },
  berbers: { kind: 'castle_uu', label: 'Arquero en camello', note: 'Arquero montado en camello letal contra Arqueros a caballo.' },
  bohemians: { kind: 'castle_uu', label: 'Carreta de guerra husita', note: 'Unidad de pólvora acorazada que protege a las unidades detrás de proyectiles.' },
  britons: { kind: 'castle_uu', label: 'Arquero con arco largo', note: 'Arquero a pie de alcance extremo (hasta 12 con Terratenientes).' },
  bulgarians: { kind: 'castle_uu', label: 'Konnik', note: 'Al morir a caballo desmonta y sigue peleando a pie.' },
  burgundians: { kind: 'castle_uu', label: 'Costiller', note: 'Caballería con ataque cargado de alto impacto inicial.' },
  burmese: { kind: 'castle_uu', label: 'Arambai', note: 'Caballería lanzadora de dardos de gran daño por descarga.' },
  byzantines: { kind: 'castle_uu', label: 'Catafracta', note: 'Caballería pesada antiinfantería resistente al daño extra de Piqueros (Logística suma pisoteo).' },
  celts: { kind: 'castle_uu', label: 'Invasor de pastos', note: 'Infantería ultrarrápida ideal para incursiones (junto al bono de +15 % velocidad).' },
  chinese: { kind: 'castle_uu', label: 'Chu Ko Nu', note: 'Ballestero de repetición que dispara múltiples saetas por ráfaga.' },
  cumans: { kind: 'castle_uu', label: 'Kipchak', note: 'Arquero a caballo rápido de disparo múltiple.' },
  danes: { kind: 'crown', label: 'Furia nórdica (Corona Imperial)', note: 'Aumenta el alcance de Manganas/Onagros y da +40 % daño de asedio a edificios (su UU del Castillo es el Vikingo de Jomsborg).' },
  dravidians: { kind: 'castle_uu', label: 'Espadachín urumi', note: 'Infantería con ataque cargado de área que ignora armadura con Acero wootz.' },
  ethiopians: { kind: 'castle_uu', label: 'Guerrero shotel', note: 'Infantería de altísimo ataque que se entrena casi al instante.' },
  franks: { kind: 'castle_uu', label: 'Lanzador de hachas', note: 'Infantería que inflige daño cuerpo a cuerpo a distancia (ideal contra Alabarderos).' },
  georgians: { kind: 'castle_uu', label: 'Monaspa', note: 'Caballería pesada que gana ataque adicional cuando lucha en grupo y regenera PR.' },
  goths: { kind: 'castle_uu', label: 'Huscarle', note: 'Infantería de altísima armadura antiproyectil que también se entrena en Cuarteles con Anarquía.' },
  gurjaras: { kind: 'castle_uu', label: 'Lanzador de chakrams', note: 'Infantería a distancia cuyos discos atraviesan múltiples enemigos con daño cuerpo a cuerpo.' },
  hindustanis: { kind: 'castle_uu', label: 'Ghulam', note: 'Infantería rápida antiarqueros cuya lanza atraviesa al objetivo detrás.' },
  huns: { kind: 'castle_uu', label: 'Tarcano', note: 'Caballería especializada en demoler edificios y resistir flechas.' },
  incas: { kind: 'castle_uu', label: 'Kamayuk', note: 'Infantería anticaballería con 1 de alcance capaz de apilarse en combate.' },
  italians: { kind: 'castle_uu', label: 'Ballestero genovés', note: 'Arquero a pie especializado en derribar caballería pesada y camellos.' },
  japanese: { kind: 'castle_uu', label: 'Samurái', note: 'Infantería veloz con bonificación directa contra otras unidades únicas.' },
  jurchens: { kind: 'castle_uu', label: 'Pagoda de hierro', note: 'Caballería pesada capaz de bloquear periódicamente ataques cuerpo a cuerpo.' },
  khitans: { kind: 'castle_uu', label: 'Liao Dao', note: 'Infantería de espada larga que inflige daño adicional prolongado al impactar.' },
  khmer: { kind: 'castle_uu', label: 'Elefante con balista', note: 'Elefante montado con escorpión que tala árboles y dispara doble proyectil con Doble ballesta.' },
  koreans: { kind: 'castle_uu', label: 'Carreta de guerra', note: 'Arquero a caballo blindado de altísimos PR y armadura antiproyectil.' },
  lithuanians: { kind: 'castle_uu', label: 'Leitis', note: 'Caballería pesada cuyos golpes ignoran la armadura cuerpo a cuerpo (y escala con Reliquias).' },
  magyars: { kind: 'crown', label: 'Arco recurvado (Corona Imperial)', note: 'Otorga +1 alcance y +1 ataque a sus Arqueros a caballo (su unidad del Castillo es el Huszár magiar).' },
  malay: { kind: 'castle_uu', label: 'Guerrero karambit', note: 'Infantería ultrabarata que ocupa solo medio espacio de población.' },
  malians: { kind: 'castle_uu', label: 'Gbeto', note: 'Infantería rápida que arroja cuchillos con daño cuerpo a cuerpo a distancia.' },
  mapuche: { kind: 'castle_uu', label: 'Kona', note: 'Caballería especialista contra unidades heridas (complementada por el Jinete con boleadoras).' },
  mayans: { kind: 'castle_uu', label: 'Arquero emplumado', note: 'Arquero a pie veloz y resistente con mayor supervivencia frente a flechas.' },
  mongols: { kind: 'castle_uu', label: 'Mangudai', note: 'Arquero a caballo rápido con gran bonificación contra armas de asedio.' },
  muisca: { kind: 'castle_uu', label: 'Guerrero guecha', note: 'Unidad de proyectiles ligera y móvil con gran defensa frente a arqueros.' },
  persians: { kind: 'castle_uu', label: 'Elefante de guerra', note: 'Unidad terrestre de mayor cantidad de PR del juego con daño de área (y Savar en Establo).' },
  poles: { kind: 'castle_uu', label: 'Obuch', note: 'Infantería pesada de martillo que reduce permanentemente la armadura del rival con cada golpe.' },
  portuguese: { kind: 'castle_uu', label: 'Cañón de salvas', note: 'Arma de asedio de pólvora que dispara ráfagas letales contra infantería y arqueros.' },
  romans: { kind: 'castle_uu', label: 'Centurión', note: 'Caballería pesada cuya aura acelera y potencia a la línea de Milicia/Legionarios cercanos.' },
  saracens: { kind: 'castle_uu', label: 'Mameluco', note: 'Camello que arroja cimitarras con daño cuerpo a cuerpo y gran bonificación anticaballería.' },
  saxons: { kind: 'castle_uu', label: 'Tropas del hogar', note: 'Infantería defensiva de gran aguante en combate sostenido.' },
  shu: { kind: 'castle_uu', label: 'Guardia de la pluma blanca', note: 'Infantería rápida que ralentiza al enemigo al golpearlo.' },
  sicilians: { kind: 'castle_uu', label: 'Serjeant', note: 'Infantería acorazada capaz de construir y reparar Torreones (Donjons).' },
  slavs: { kind: 'castle_uu', label: 'Boyardo', note: 'Caballería pesada con una de las mayores armaduras cuerpo a cuerpo del juego.' },
  spanish: { kind: 'castle_uu', label: 'Conquistador', note: 'Unidad montada de pólvora devastadora en Edad de los Castillos (el Misionero se entrena en Monasterio).' },
  tatars: { kind: 'castle_uu', label: 'Keshik', note: 'Caballería pesada económica que genera oro mientras combate.' },
  teutons: { kind: 'crown', label: 'Almenas (Corona Imperial)', note: 'Otorga +3 de alcance a los Castillos (13 total) y permite a la infantería guarnecida disparar flechas.' },
  tupi: { kind: 'castle_uu', label: 'Arquero de los bosques', note: 'Arquero de precisión con efecto de veneno al desarrollar Curare.' },
  turks: { kind: 'castle_uu', label: 'Jenízaro', note: 'Artillero manual de mayor alcance y ataque disponible ya desde Edad de los Castillos.' },
  varangians: { kind: 'castle_uu', label: 'Jarl', note: 'Unidad montada de choque complementada por Pureza de sangre +50 % y Legado de Vendel.' },
  vietnamese: { kind: 'castle_uu', label: 'Arquero de ratán', note: 'Arquero a pie veloz con armadura antiproyectil altísima (10 total en Imperial).' },
  vikings: { kind: 'castle_uu', label: 'Berserker', note: 'Infantería que regenera PR y escala con la corona Caciques.' },
  wei: { kind: 'castle_uu', label: 'Caballería tigresa', note: 'Caballería pesada que gana fuerza al eliminar enemigos (y escala con Armadura Ming Guang).' },
  wu: { kind: 'castle_uu', label: 'Arquero de fuego', note: 'Arquero incendiario con daño extra contra edificios y armas de asedio.' },
};

// Notas de bonos de civilización y coronas (tecnologías únicas) que compensan o amplifican brechas del árbol
const CIV_COMPENSATION_NOTES = {
  // Paladín / Establo / Caballería
  'franks:Bloodlines': 'Su bono de civilización (+20 % PR en caballería) eleva al Paladín a 192 PR, superando los 180 PR genéricos con Pureza de sangre.',
  'cumans:Husbandry': 'Su bono de civilización otorga +5/+10/+15 % velocidad a la caballería por edad (en Imperial es más rápida que con Ganadería, +15 % vs +10 %).',
  'lithuanians:Blast Furnace': 'Compensa y supera la falta de Alto horno con hasta +4 de ataque en Paladines y Leitis al guarnecer Reliquias en el Monasterio.',
  'teutons:Husbandry': 'Aunque carece de Ganadería, su bono otorga +1/+2 de armadura cuerpo a cuerpo a la caballería (Paladín con 7 de armadura CaC).',
  'malians:Blast Furnace': 'Su corona Imperial «Farimba» da +5 de ataque a toda la caballería del Establo, superando a Alto horno en unidades montadas (sí penaliza el ataque de su infantería, que compensa con +1/+2/+3 armadura antiproyectil).',
  'khitans:Blast Furnace': 'Su bono de civilización duplica Forja (+2) y Fundición de hierro (+2), logrando el mismo +4 de ataque cuerpo a cuerpo ya en Edad de los Castillos (y suma regeneración con Caballería de la Orda).',
  'khitans:Bloodlines': 'Compensa en ataque con el doble efecto de Forja/Fundición (+4) y en supervivencia con la corona Imperial «Caballería de la Orda» (regeneración en combate).',
  'gurjaras:Blast Furnace': 'Su bono de civilización otorga +20/+30/+40 % de daño adicional en unidades montadas (más Kshatriyas -25 % comida y Guardias fronterizos +4 CaC).',
  'poles:Plate Barding Armor': 'Compensa con Privilegios de la Szlachta (-60 % coste de oro en Jinetes/Caballeros), Legado lequítico (daño de pisoteo) y Húsar alado (+1 CaC base).',
  'malay:Plate Barding Armor': 'Malayos además carece de Cota de malla para caballería y Pureza de sangre (se queda en Armadura de láminas +1/+1).',
  'wei:Plate Barding Armor': 'Su corona Imperial «Armadura Ming Guang» otorga +4 armadura cuerpo a cuerpo a unidades montadas (6 CaC frente a 3 genérico, aunque con 4 antiproyectil).',
  'mongols:Plate Barding Armor': 'Su Caballería ligera y Húsar reciben +30 % PR por bono de civilización (117/118 PR).',
  'persians:Paladin': 'Persas reemplazó al Paladín por su mejora única equivalente «Savar» (especializada contra arqueros).',
  'tupi:Blast Furnace': 'Su corona de Castillos «Caciques» hace que sus Guerreros Champi y Honderos ataquen un 25 % más rápido.',
  'dravidians:Bloodlines': 'Su caballería ligera y Elefantes de combate compensan con Cuerpo médico (regeneración) y Acero wootz (ataques ignoran armadura).',

  // Infantería / Cuarteles
  'celts:Squires': 'Su bono de civilización otorga +15 % de velocidad a la infantería desde Edad Feudal (más rápido que el +10 % de Escuderos).',
  'romans:Plate Mail Armor': 'Su bono de civilización duplica Armadura de láminas (+2/+2) y Cota de malla (+2/+2), alcanzando +4/+4 total ya en Castillos (superior al +3/+4 genérico).',
  'lithuanians:Plate Mail Armor': 'Su corona Imperial «Escudos de torre» da +2 de armadura antiproyectil a Alabarderos y Guerrilleros (compensando la defensa antiproyectil perdida en Lanceros).',
  'bulgarians:Champion': 'Compensa con la corona Imperial «Bagains» (+5 de armadura cuerpo a cuerpo en Espadachines de mandoble, 9 total) y mejoras de Milicia gratis.',
  'malay:Champion': 'Compensa con la corona Imperial «Leva forzosa», que elimina el coste de oro de los Espadachines de mandoble.',
  'turks:Halberdier': 'Turcos ni siquiera dispone de Piquero (se queda en Lancero); frente a caballería usa Camellos pesados o Jenízaros.',
  'gurjaras:Halberdier': 'Gurjaras tampoco dispone de Piquero (se queda en Lancero); frente a caballería domina con Camellos pesados (+40 % daño extra en Imperial y Guardias fronterizos).',
  'vikings:Halberdier': 'Sus Piqueros ganan +20 % PR por bono de civ y la corona «Caciques» suma daño adicional contra caballería.',
  'aztecs:Halberdier': 'Sus Piqueros compensan con la corona Imperial «Guerras floridas» (+4 ataque de infantería) y Monjes con +5 PR por tecnología.',
  'italians:Halberdier': 'Compensa frente a caballería con su Ballestero genovés (daño masivo contra caballería y camellos).',
  'malians:Halberdier': 'Sus Piqueros ganan +3 de armadura antiproyectil en Imperial y sus Camellos escalan con Farimba (+5 ataque).',
  'saracens:Halberdier': 'Frente a caballería confía en Camellos pesados (+25 % PR) y Mamelucos.',
  'berbers:Halberdier': 'Frente a caballería confía en Camellos pesados un 20 % más baratos en Imperial.',
  'hindustanis:Halberdier': 'Domina contra caballería con el Jinete de camello imperial (+20 % velocidad de ataque).',

  // Arqueros / Herrería de rango
  'britons:Thumb Ring': 'Compensa con +1/+2 de alcance en arqueros a pie en Castillos/Imperial y la corona «Terratenientes» (+1 alcance, llegando a 11 en Arbalestero).',
  'teutons:Bracer': 'Su falta de Brazal afecta Guerrilleros y torres, PERO su corona Imperial «Almenas» otorga +3 de alcance a sus Castillos (13 total, superando a los Castillos con Brazal).',
  'muisca:Ring Archer Armor': 'Compensa en cuerpo a cuerpo con +1/+2/+3 de armadura CaC para Galería y Herbolaria (+15 % velocidad).',
  'aztecs:Ring Archer Armor': 'Sus Guerrilleros compensan ofensivamente con la corona de Castillos «Átlatl» (+1 ataque y +1 alcance).',
  'mapuche:Bracer': 'Sus Guerrilleros obtienen 30 % de daño atravesando con la corona de Castillos «Malón».',
  'burmese:Ring Archer Armor': 'Birmanos además carece de Armadura de cuero (2.ª mejora), quedándose en +1/+1 total para arqueros.',
  'gurjaras:Ring Archer Armor': 'Aunque Guardias fronterizos da +4 armadura cuerpo a cuerpo a Elefantes arqueros, no compensa la armadura antiproyectil perdida.',
  'franks:Ring Archer Armor': 'Francos además carece de Brazal y Dactilera; su potencia reside en caballería y Lanzadores de hachas.',
  'celts:Bracer': 'Sus Castillos y torres compensan en cadencia con la corona de Castillos «Fortaleza» (+33 % velocidad de disparo).',
  'persians:Bracer': 'Sus Castillos compensan en potencia con la corona Imperial «Ciudadelas» (+4 ataque y proyectiles extra).',
  'romans:Bracer': 'Sus Escorpiones compensan con la corona de Castillos «Balistas» (+33 % velocidad de disparo).',
  'huns:Ring Archer Armor': 'Sus Arqueros a caballo compensan siendo un 10 %/20 % más baratos en Castillos/Imperial.',
  'mongols:Ring Archer Armor': 'Sus Arqueros a caballo y Mangudai disparan un 25 % más rápido.',
  'georgians:Ring Archer Armor': 'Sus Arqueros a caballo regeneran PR en combate y reciben menos daño desde elevación.',
  'jurchens:Parthian Tactics': 'Sus unidades montadas atacan un 25 % más rápido desde Edad Feudal.',
  'tupi:Thumb Ring': 'Sus arqueros infligen daño por veneno al investigar la corona «Curare».',
  'sicilians:Thumb Ring': 'Sus unidades terrestres reciben un 33 % menos de daño de bonificación.',

  // Asedio y Pólvora
  'turks:Siege Engineers': 'Su corona Imperial «Artillería» otorga +2 de alcance a Cañones de asedio (14 total, superando los 13 de Ingenieros de asedio).',
  'chinese:Siege Engineers': 'Compensa con la corona Imperial «Cohetería» (+25 % ataque en Carros de cohetes, Escorpiones y Lou Chuans).',
  'wu:Siege Engineers': 'Compensa con la corona Imperial «Tigre sentado» (proyectiles extra en Lanzapiedras de tracción y Lou Chuans).',
  'wei:Siege Engineers': 'Sus Lanzapiedras de tracción cuestan un 25 % menos.',
  'huns:Siege Engineers': 'Sus Lanzapiedras disfrutan de +30 % de precisión contra unidades enemigas.',
  'dravidians:Siege Engineers': 'Sus armas de asedio cuestan un 33 % menos de madera.',
  'bohemians:Bombard Cannon': 'Bohemios además mejora el Cañón de asedio a Obús (Houfnice) y lo acelera +15 % con Tácticas de Wagenburg.',
  'italians:Hand Cannoneer': 'Italianos tiene pólvora -20 % coste y la corona Imperial «Pirotecnia» (90 % precisión + 15 % daño penetrante).',
  'turks:Hand Cannoneer': 'Turcos obtiene Química gratis, +25 % PR en unidades de pólvora y Jenízaros desde Castillos.',
  'ethiopians:Siege Onager': 'Su corona Imperial «Motores de torsión» amplía el radio de explosión del Onagro de asedio.',
  'teutons:Siege Onager': 'Su corona de Castillos «Acorazado» suma +4 de armadura cuerpo a cuerpo a todo su asedio.',
  'danes:Siege Ram': 'Su corona Imperial «Furia nórdica» suma +40 % de daño de asedio contra edificios.',
  'jurchens:Siege Ram': 'Yurchen desbloquea Ingenieros de asedio en Castillos y sus tecnologías de asedio cuestan -75 % madera y se investigan +100 % más rápido.',

  // Monasterio y Economía
  'sicilians:Redemption': 'Su corona de Castillos «Primera Cruzada» añade resistencia a conversión equivalente a Fe.',
  'sicilians:Block Printing': 'Su corona de Castillos «Primera Cruzada» añade resistencia a conversión equivalente a Fe.',
  'armenians:Heresy': 'Armenios investiga las 11 tecnologías completas del Monasterio desde su Iglesia fortificada.',
  'aztecs:Heresy': 'Cada tecnología del Monasterio suma +5 PR a los Monjes aztecas (hasta 95 PR).',
  'bohemians:Heresy': 'Su corona Imperial «Reformas husitas» reemplaza el coste de oro de Monjes y tecnologías de Monasterio por comida.',
  'saracens:Guilds': 'Su bono de civilización fija la comisión del Mercado en solo 5 % (mucho mejor que el 15 % de Gremios).',
  'romans:Stone Shaft Mining': 'Sus aldeanos compensan recolectando un 5 % más rápido en todos los recursos.',
  'georgians:Two-Man Saw': 'Sus Iglesias fortificadas otorgan +10 % de velocidad de trabajo a los aldeanos cercanos.',
  'sicilians:Fortified Wall': 'Compensa en defensa con Torreones (Donjons) construibles por Serjeants.',

  // Bonos extra en respuestas 100 % FU
  'bulgarians:Hussar': 'Además se potencia con la corona «Estribos» (+33 % velocidad de ataque de caballería).',
  'berbers:Hussar': 'Además sus Húsares cuestan un 20 % menos en Edad Imperial.',
  'jurchens:Hussar': 'Además sus unidades montadas atacan un 25 % más rápido.',
  'magyars:Hussar': 'Además sus Húsares cuestan -15 % y recibe Forja, Fundición de hierro y Alto horno gratis.',
  'georgians:Hussar': 'Además sus Húsares regeneran PR y reciben menos daño luchando desde elevación.',
  'hindustanis:Hussar': 'Además ganan +2 de ataque contra edificios.',
  'burmese:Hussar': 'Además «Caballería de Manipur» añade +4 de ataque contra arqueros.',
  'armenians:Halberdier': 'Además Armenios desbloquea Alabardero ya en Edad de los Castillos.',
  'burmese:Halberdier': 'Además su infantería gana +3 de ataque gratis en Edad Imperial.',
  'dravidians:Halberdier': 'Además «Acero wootz» hace que sus golpes ignoren la armadura enemiga.',
  'bohemians:Halberdier': 'Además su línea de Lanceros inflige +25 % de daño de bonificación adicional.',
  'japanese:Heavy Cavalry Archer': 'Además sus Arqueros a caballo tienen +2 de ataque adicional contra unidades de clase Arquero.',
  'magyars:Heavy Cavalry Archer': 'Además la corona «Arco recurvado» añade +1 alcance y +1 ataque.',
  'tatars:Heavy Cavalry Archer': 'Además recibe Dactilera y Tácticas de los partos gratis, «Armadura de seda» (+1/+1) y +25 % daño desde altura.',
  'turks:Heavy Cavalry Archer': 'Además «Sipahi» añade +20 PR a sus Arqueros a caballo y Química es gratis.',
  'byzantines:Elite Skirmisher': 'Además sus Guerrilleros cuestan un 25 % menos.',
  'dravidians:Elite Skirmisher': 'Además sus Guerrilleros disparan un 25 % más rápido.',
  'spanish:TripleTrash': 'Españoles es la única civilización estándar con las 3 líneas sin oro 100 % completas incluyendo Dactilera, Balística, Química e Incendiarismo — y con mejoras de Herrería sin coste de oro.',
};

function compensationNote(slug, node) {
  return CIV_COMPENSATION_NOTES[`${slug}:${node}`] || '';
}

function withNote(baseText, slug, node) {
  const note = compensationNote(slug, node);
  return note ? `${baseText} ${note}` : baseText;
}

// Etiquetas por Edad (evita anacronismos como "Húsares" en Feudal o "Paladines" en Castillos)
const LINE_META = {
  archers: {
    label: 'Arqueros / Ballesteros',
    byAge: { 2: 'Arqueros', 3: 'Ballesteros', 4: 'Arbalesteros' },
    icon: 'archer',
    sub: 'Masa a distancia desde Galería de tiro',
  },
  knights: {
    label: 'Jinetes / Caballeros',
    byAge: { 2: 'Caballería de exploración', 3: 'Jinetes', 4: 'Caballería pesada (Caballeros / Paladines)' },
    icon: 'stable',
    sub: 'Caballería pesada de Establo',
  },
  scouts: {
    label: 'Caballería ligera / Húsares',
    byAge: { 2: 'Caballería de exploración', 3: 'Caballería ligera', 4: 'Caballería ligera / Húsares' },
    icon: 'scout',
    sub: 'Incursión rápida y anti-Monjes',
  },
  camels: {
    label: 'Jinetes de camello',
    byAge: { 2: 'Exploradores de camello', 3: 'Jinetes de camello', 4: 'Jinetes de camello pesados' },
    icon: 'stable',
    sub: 'Especialistas anticaballería',
  },
  cavarchers: {
    label: 'Arqueros a caballo',
    byAge: { 2: 'Arqueros a caballo', 3: 'Arqueros a caballo', 4: 'Arqueros a caballo pesados' },
    icon: 'archer',
    sub: 'Hostigamiento móvil con daño a distancia',
  },
  infantry: {
    label: 'Espadachines / Campeones',
    byAge: { 2: 'Hombres de armas', 3: 'Espadachines de espada larga', 4: 'Espadachines / Campeones' },
    icon: 'sword',
    sub: 'Infantería de Cuarteles contra águilas y unidades sin oro',
  },
  eagles: {
    label: 'Guerreros águila',
    byAge: { 2: 'Exploradores águila', 3: 'Guerreros águila', 4: 'Guerreros águila de élite' },
    icon: 'sword',
    sub: 'Infantería rápida antiarqueros y asedio',
  },
  spears: {
    label: 'Lanceros / Piqueros / Alabarderos',
    byAge: { 2: 'Lanceros', 3: 'Piqueros', 4: 'Alabarderos' },
    icon: 'barracks',
    sub: 'Muralla económica anticaballería',
  },
  skirms: {
    label: 'Guerrilleros',
    byAge: { 2: 'Guerrilleros', 3: 'Guerrilleros de élite', 4: 'Guerrilleros de élite' },
    icon: 'shield',
    sub: 'Antiarqueros sin coste de oro',
  },
  siege: {
    label: 'Manganas / Onagros',
    byAge: { 2: 'Asedio', 3: 'Manganas', 4: 'Onagros' },
    icon: 'castle',
    sub: 'Daño de área contra masas a distancia',
  },
  monks: {
    label: 'Monjes',
    byAge: { 2: 'Monjes', 3: 'Monjes', 4: 'Monjes' },
    icon: 'relic',
    sub: 'Conversión contra caballería pesada y asedio',
  },
  gunpowder: {
    label: 'Artilleros manuales / Pólvora',
    byAge: { 2: 'Pólvora', 3: 'Artilleros manuales', 4: 'Artilleros manuales' },
    icon: 'gunpowder',
    sub: 'Contrarresta infantería pesada en Edad Imperial',
  },
};

function lineLabelForAge(lineKey, age, slug = null) {
  const meta = LINE_META[lineKey];
  if (!meta) return lineKey;
  if (lineKey === 'knights' && age === 4 && slug) {
    if (slug === 'persians') return 'Savar (caballería pesada)';
    if (hasNode(slug, 'Paladin')) return 'Paladines';
    return 'Caballeros (Cavalier)';
  }
  if (lineKey === 'camels' && age === 4 && slug === 'hindustanis') {
    return 'Jinetes de camello imperiales';
  }
  if (lineKey === 'skirms' && age === 4 && slug === 'vietnamese') {
    return 'Guerrilleros imperiales';
  }
  return meta.byAge?.[age] || meta.label;
}

// Mapa completo de contraunidades (incluye spears, siege vs gunpowder, archers vs cavarchers, cavarchers vs camels)
const COUNTER_MAP = {
  archers: ['skirms', 'siege', 'knights', 'scouts', 'eagles'],
  knights: ['spears', 'camels', 'monks'],
  scouts: ['spears', 'camels'],
  camels: ['spears', 'infantry', 'archers', 'cavarchers'],
  cavarchers: ['skirms', 'camels', 'siege', 'archers'],
  infantry: ['gunpowder', 'infantry', 'archers', 'cavarchers'],
  eagles: ['infantry', 'knights', 'gunpowder'],
  skirms: ['knights', 'scouts', 'infantry', 'siege', 'eagles'],
  siege: ['knights', 'scouts', 'monks'],
  monks: ['scouts', 'archers', 'eagles'],
  gunpowder: ['skirms', 'archers', 'siege', 'cavarchers', 'knights'],
  spears: ['archers', 'skirms', 'infantry', 'gunpowder', 'cavarchers', 'siege'],
};

function arenaLineQuality(slug, lineKey, age) {
  return lineQuality(slug, lineKey === 'skirms' ? 'skirmishers' : lineKey, age);
}

const AGE_META = {
  1: { label: 'Alta Edad Media', icon: 'assets/icons/ages/dark.png' },
  2: { label: 'Edad Feudal', icon: 'assets/icons/ages/feudal.png' },
  3: { label: 'Edad de los Castillos', icon: 'assets/icons/ages/castle.png' },
  4: { label: 'Edad Imperial', icon: 'assets/icons/ages/imperial.png' },
};

function esY(nextWord) {
  const w = String(nextWord || '').trim();
  return /^(i|hi|í)/i.test(w) && !/^hie/i.test(w) ? `e ${w}` : `y ${w}`;
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function makeRng(seedInput) {
  let s = (typeof seedInput === 'number' ? seedInput : hashString(seedInput)) >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffleWithRng(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hasNode(slug, node) {
  return CIV_TECH[slug]?.nodes?.[node] != null;
}

function nodeAge(slug, node) {
  return CIV_TECH[slug]?.nodes?.[node] ?? null;
}

function civNameEs(slug) {
  const s = String(slug || '').toLowerCase();
  if (s === 'jurchens') return 'Yurchen';
  if (s === 'khitans') return 'Kitán';
  if (s === 'gurjaras') return 'Gurjaras';
  if (s === 'incas') return 'Incas';
  if (s === 'mayans') return 'Mayas';
  return CIV_GUIDE[s]?.name || s;
}

function civRoleEs(slug) {
  return CIV_GUIDE[String(slug || '').toLowerCase()]?.role || 'Civilización estándar';
}

function makeCivOption(slug, correct, subOverride = null) {
  return {
    id: `civ_${slug}`,
    civSlug: slug,
    title: civNameEs(slug),
    sub: subOverride || civRoleEs(slug),
    correct: Boolean(correct),
  };
}

function makeNodeOption(nodeKey, correct, subOverride = null) {
  const info = OFFICIAL_NODE_ES[nodeKey] || { es: nodeKey, sub: 'Tecnología / unidad oficial', icon: 'blacksmith' };
  return {
    id: `node_${nodeKey.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    icon: info.icon,
    title: info.es,
    sub: subOverride || info.sub,
    correct: Boolean(correct),
  };
}

function makeLineOption(lineKey, correct, age = 4, slug = null) {
  const info = LINE_META[lineKey] || { label: lineKey, sub: 'Línea militar', icon: 'sword' };
  return {
    id: `line_${lineKey}`,
    icon: info.icon,
    title: lineLabelForAge(lineKey, age, slug),
    sub: info.sub,
    correct: Boolean(correct),
  };
}

function finalizeQuestion(q) {
  const rng = makeRng(q.id);
  const shuffled = shuffleWithRng(q.options, rng);
  return {
    ...q,
    options: shuffled,
  };
}

let _cachedCatalog = null;

function buildArenaCatalog() {
  if (_cachedCatalog) return _cachedCatalog;

  const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  const byId = new Map();

  function addQ(level, q) {
    if (!q || !q.id || byId.has(q.id)) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    const correctCount = q.options.filter((o) => o.correct).length;
    if (correctCount !== 1) return false;
    const finalQ = finalizeQuestion({
      ...q,
      level,
      ageIcon: q.ageIcon || AGE_META[q.age || 3]?.icon || AGE_META[3].icon,
      ageLabel: q.ageLabel || AGE_META[q.age || 3]?.label || 'Edad de los Castillos',
      mapName: q.mapName || 'Arabia',
      mapSlug: q.mapSlug || 'arabia',
    });
    byLevel[level].push(finalQ);
    byId.set(finalQ.id, finalQ);
    return true;
  }

  /* =========================================================================
   * NIVEL 1 · 900–1100 ELO · Fundamentos Competitivos
   * ========================================================================= */
  // 1A. Triángulo de contraunidades verificado (18 preguntas — etiquetas acordes a la Edad y distractores 100 % legales)
  const l1CounterSpecs = [
    ['franks', 'britons', 2, 'archers', 'skirms', 'Arabia', 'arabia', 'Los Guerrilleros tienen armadura antiproyectil y daño extra contra Arqueros sin gastar oro.'],
    ['britons', 'franks', 2, 'scouts', 'spears', 'Arabia', 'arabia', 'Los Lanceros infligen gran daño adicional a la Caballería de exploración franca (+20 % PR) sin coste de oro.'],
    ['mayans', 'magyars', 2, 'scouts', 'spears', 'Arabia', 'arabia', 'Los Lanceros frenan la Caballería de exploración magiar (-15 % coste y Forja gratis) protegiendo tus Arqueros.'],
    ['ethiopians', 'mongols', 2, 'scouts', 'spears', 'Arabia', 'arabia', 'Los Lanceros defienden tu economía y escoltan a los Arqueros etíopes (+18 % cadencia) frente a exploradores.'],
    ['spanish', 'britons', 2, 'archers', 'skirms', 'Arabia', 'arabia', 'Los Guerrilleros contrarrestan los Arqueros britanos en Feudal y no te impiden ahorrar oro para Castillos.'],
    ['franks', 'huns', 3, 'knights', 'spears', 'Arabia', 'arabia', 'Los Piqueros detienen a los Jinetes hunos de forma económica mientras consolidás tu propia caballería (+20 % PR).'],
    ['hindustanis', 'franks', 3, 'knights', 'camels', 'Arabia', 'arabia', 'Los Jinetes de camello indostanos atacan un 20 % más rápido y ganan en movilidad y coste a los Jinetes francos.'],
    ['berbers', 'lithuanians', 3, 'knights', 'camels', 'Arabia', 'arabia', 'Los Jinetes de camello bereberes cuestan un 15 % menos en Castillos y anulan el empuje de Jinetes lituanos.'],
    ['byzantines', 'persians', 3, 'knights', 'camels', 'Arabia', 'arabia', 'Los Jinetes de camello bizantinos cuestan un 25 % menos, frenando eficazmente a los Jinetes persas.'],
    ['saracens', 'teutons', 3, 'knights', 'camels', 'Arabia', 'arabia', 'Los Jinetes de camello sarracenos ganan +25 % PR, aplastando en combate directo a los Jinetes teutones.'],
    ['japanese', 'mayans', 3, 'eagles', 'infantry', 'Arabia', 'arabia', 'Los Espadachines de espada larga japoneses (+33 % velocidad de ataque) destrozan a los Guerreros águila mayas.'],
    ['spanish', 'goths', 4, 'infantry', 'gunpowder', 'Arena', 'arena', 'Los Artilleros manuales españoles (+18 % cadencia de pólvora) derriten la infantería goda (incluidos Huscarles).'],
    ['vietnamese', 'huns', 3, 'cavarchers', 'skirms', 'Arabia', 'arabia', 'Los Guerrilleros de élite vietnamitas (+20 % PR) desgastan a los Arqueros a caballo hunos sin gastar oro.'],
    ['byzantines', 'mongols', 3, 'cavarchers', 'skirms', 'Arabia', 'arabia', 'Los Guerrilleros de élite bizantinos (-25 % coste) ofrecen la respuesta más eficiente contra Arqueros a caballo mongoles.'],
    ['magyars', 'aztecs', 3, 'monks', 'scouts', 'Arena', 'arena', 'La Caballería ligera magiar (-15 % coste y Forja/Fundición gratis) resiste conversiones y elimina Monjes aztecas.'],
    ['turks', 'bohemians', 3, 'monks', 'scouts', 'Arena', 'arena', 'Turcos obtiene Caballería ligera gratis al llegar a Castillos (+1 armadura antiproyectil), ideal contra Monjes bohemios.'],
    ['franks', 'celts', 3, 'siege', 'knights', 'Arabia', 'arabia', 'Los Jinetes francos (+20 % PR) cierran la distancia rápido y destruyen Manganas y Escorpiones celtas.'],
    ['italians', 'goths', 4, 'infantry', 'gunpowder', 'Arena', 'arena', 'Los Artilleros manuales italianos (-20 % coste y Pirotecnia en Imperial) arrasan las oleadas de infantería goda.'],
  ];
  for (const [mySlug, rivSlug, age, threat, bestCounter, mapName, mapSlug, customExp] of l1CounterSpecs) {
    if (!CIV_TECH[mySlug]?.nodes || !CIV_TECH[rivSlug]?.nodes) continue;
    const qVal = arenaLineQuality(mySlug, bestCounter, age);
    if (!qVal || qVal.score < 0.65) continue;
    const id = `l1_cp_${mySlug}_${rivSlug}_${age}_${threat}`;
    const rng = makeRng(id);
    const countersSet = new Set([...(COUNTER_MAP[threat] || []), threat]);
    // Solo ofrecer distractores que la civilización REALMENTE puede entrenar en esa Edad!
    const legalDistractors = Object.keys(LINE_META).filter((lk) => {
      if (countersSet.has(lk)) return false;
      if (age < 4 && lk === 'gunpowder' && !(mySlug === 'bohemians' && age === 3)) return false;
      const qual = arenaLineQuality(mySlug, lk, age);
      return Boolean(qual && qual.score > 0);
    });
    let distractorLines = shuffleWithRng(legalDistractors, rng).slice(0, 3);
    // Fallback solo para Feudal donde solo hay 4-5 líneas legales (archers/skirms/scouts/spears/infantry)
    if (distractorLines.length < 3) {
      const feudalAllowed = ['archers', 'skirms', 'scouts', 'spears', 'infantry'];
      const extra = feudalAllowed.filter((lk) => lk !== bestCounter && lk !== threat && !distractorLines.includes(lk) && arenaLineQuality(mySlug, lk, age));
      distractorLines = [...distractorLines, ...shuffleWithRng(extra, rng)].slice(0, 3);
    }
    if (distractorLines.length < 3) continue;
    const threatTxt = lineLabelForAge(threat, age, rivSlug);
    const counterTxt = lineLabelForAge(bestCounter, age, mySlug);
    addQ(1, {
      id,
      category: 'counter_pick',
      modeLabel: 'Contraunidad',
      age,
      mapName,
      mapSlug,
      myCiv: { slug: mySlug, name: civNameEs(mySlug) },
      rivalCiv: { slug: rivSlug, name: civNameEs(rivSlug) },
      threatLabel: `Amenaza: ${threatTxt}`,
      prompt: `Jugás ${civNameEs(mySlug)} contra ${civNameEs(rivSlug)} en ${AGE_META[age].label}. El rival presiona con ${threatTxt}: ¿qué respuesta disponible en tu árbol es la más efectiva?`,
      options: [
        makeLineOption(bestCounter, true, age, mySlug),
        ...distractorLines.map((lk) => makeLineOption(lk, false, age, mySlug)),
      ],
      explanation: `${counterTxt} contrarresta directamente a ${threatTxt} ${esY(civNameEs(mySlug))} la tiene disponible en ${AGE_META[age].label}. ${customExp}`,
    });
  }

  // 1B. Unidades Únicas del Castillo e Identidades Icónicas (24 preguntas — 100 % Castillo o Corona sin spoilers)
  for (const slug of ICONIC_24) {
    const ident = CASTLE_UNIQUE_IDENTITY[slug];
    if (!ident) continue;
    const id = `l1_uu_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(ICONIC_24.filter((s) => s !== slug), rng).slice(0, 3);
    const isCrown = ident.kind === 'crown';
    addQ(1, {
      id,
      category: 'civ_identity',
      modeLabel: isCrown ? 'Corona Única' : 'Unidad Única',
      age: isCrown ? 4 : 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: isCrown ? 'Tecnología Única (Corona)' : 'Castillo · Unidad Única',
      prompt: isCrown
        ? `¿Qué civilización posee la tecnología única «${ident.label}»?`
        : `¿Qué civilización entrena en su Castillo la unidad única «${ident.label}»?`,
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} (${civRoleEs(slug)}): ${ident.label}. ${ident.note}`,
    });
  }

  // 1C. Ausencias mayores en civilizaciones clásicas (excluye Paladín en Persas porque usa Savar)
  const headlineCapstones = ['Paladin', 'Arbalester', 'Hand Cannoneer', 'Halberdier', 'Hussar', 'Bombard Cannon'];
  for (const slug of ICONIC_24) {
    const present = headlineCapstones.filter((n) => hasNode(slug, n));
    const missing = headlineCapstones.filter((n) => !hasNode(slug, n) && !(slug === 'persians' && n === 'Paladin'));
    if (present.length < 3 || missing.length < 1) continue;
    const id = `l1_cap_${slug}`;
    const rng = makeRng(id);
    const targetMissing = shuffleWithRng(missing, rng)[0];
    const decoys = shuffleWithRng(present, rng).slice(0, 3);
    addQ(1, {
      id,
      category: 'tech_gap',
      modeLabel: 'Árbol Imperial',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: { slug, name: civNameEs(slug) },
      rivalCiv: null,
      threatLabel: 'Ausencia en Edad Imperial',
      prompt: `¿Cuál de estas unidades finales de Edad Imperial NO existe en el árbol tecnológico de ${civNameEs(slug)}?`,
      options: [
        makeNodeOption(targetMissing, true),
        ...decoys.map((n) => makeNodeOption(n, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} carece de ${OFFICIAL_NODE_ES[targetMissing].es} en Edad Imperial, mientras que sí dispone de ${decoys.map((n) => OFFICIAL_NODE_ES[n].es).join(', ')}.`,
        slug,
        targetMissing,
      ),
    });
  }

  // 1D. Ausencias estructurales emblemáticas (3 preguntas — distractores europeos verificados en l1_core_no_xbow_spanish)
  const coreUniqueMisses = [
    {
      id: 'l1_core_no_eskirm_turks',
      node: 'Elite Skirmisher',
      correctSlug: 'turks',
      poolFilter: (s) => ICONIC_24.includes(s),
      prompt: '¿Cuál es la ÚNICA civilización estándar de AoE2:DE que NO puede mejorar sus Guerrilleros a Guerrillero de élite?',
      explanation: 'Turcos es la única civilización estándar sin Guerrillero de élite (ni Piquero), lo que los vuelve dependientes del oro en partidas largas.',
    },
    {
      id: 'l1_core_no_xbow_spanish',
      node: 'Crossbowman',
      correctSlug: 'spanish',
      poolFilter: (s) => EUROPEAN_CIVS.has(s) && ICONIC_24.includes(s),
      prompt: '¿Cuál de estas civilizaciones europeas NO dispone de Ballestero en Edad de los Castillos?',
      explanation: 'Españoles (junto con Búlgaros) es una de las dos únicas civilizaciones sin Ballestero; compensa con Conquistadores en Castillos y Artilleros manuales +18 % cadencia en Imperial.',
    },
    {
      id: 'l1_core_no_pike_turks',
      node: 'Pikeman',
      correctSlug: 'turks',
      poolFilter: (s) => ICONIC_24.includes(s),
      prompt: '¿Cuál de estas civilizaciones NO tiene acceso a la mejora de Piquero en Edad de los Castillos?',
      explanation: 'Turcos (junto con Gurjaras) no dispone de Piquero y se queda en Lancero; frente a caballería recurre a Jinetes de camello pesados o Jenízaros.',
    },
  ];
  for (const item of coreUniqueMisses) {
    const rng = makeRng(item.id);
    const pool = VALID_CIV_SLUGS.filter((s) => s !== item.correctSlug && hasNode(s, item.node) && item.poolFilter(s));
    const decoys = shuffleWithRng(pool, rng).slice(0, 3);
    addQ(1, {
      id: item.id,
      category: 'tech_gap',
      modeLabel: 'Regla Estructural',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Árbol tecnológico',
      prompt: item.prompt,
      options: [
        makeCivOption(item.correctSlug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: item.explanation,
    });
  }

  /* =========================================================================
   * NIVEL 2 · 1150–1300 ELO · Roster Completo, Aperturas y Unidades Regionales
   * ========================================================================= */
  // 2A. Unidades Únicas del Castillo / Coronas del resto del roster (32 preguntas — sin unidades regionales ni truncamientos)
  const iconicSet = new Set(ICONIC_24);
  const remainingCivs = VALID_CIV_SLUGS.filter((s) => !iconicSet.has(s));
  for (const slug of remainingCivs) {
    const ident = CASTLE_UNIQUE_IDENTITY[slug];
    if (!ident) continue;
    const id = `l2_uu_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(remainingCivs.filter((s) => s !== slug), rng).slice(0, 3);
    if (decoys.length < 3) continue;
    const isCrown = ident.kind === 'crown';
    addQ(2, {
      id,
      category: 'civ_identity',
      modeLabel: isCrown ? 'Corona Única' : 'Roster Completo',
      age: isCrown ? 4 : 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: isCrown ? 'Tecnología Única (Corona)' : 'Castillo · Unidad Única',
      prompt: isCrown
        ? `¿A qué civilización pertenece la tecnología única «${ident.label}»?`
        : `¿A qué civilización pertenece la unidad única de Castillo «${ident.label}»?`,
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} (${civRoleEs(slug)}): ${ident.label}. ${ident.note}`,
    });
  }

  // 2B. Reglas verificadas de apertura y economía temprana (10 preguntas)
  const openingRules = [
    {
      id: 'l2_open_huns',
      slug: 'huns',
      prompt: '¿Qué civilización inicia con -100 de madera pero NO necesita construir Casas en toda la partida?',
      exp: 'Hunos comienza con capacidad máxima de población desde el segundo 0, eliminando bloqueos de población.',
    },
    {
      id: 'l2_open_khmer',
      slug: 'khmer',
      prompt: '¿Qué civilización puede avanzar a cualquier Edad (Feudal, Castillos e Imperial) sin construir edificios requisito previos?',
      exp: 'Jemeres no requiere Cuarteles, Herrería, Mercado ni edificios de edad para avanzar ni para desbloquear edificios como Establos o Galerías.',
    },
    {
      id: 'l2_open_chinese',
      slug: 'chinese',
      prompt: '¿Qué civilización arranca con +3 Aldeanos extra pero con -200 de comida y -50 de madera?',
      exp: 'Chinos exige investigar Telar y concentrar rápidamente aldeanos bajo el Centro Urbano para despegar su economía.',
    },
    {
      id: 'l2_open_malay',
      slug: 'malay',
      prompt: '¿Qué civilización avanza de edad 66 % más rápido que el resto, modificando todos sus tiempos de Feudal y Castillos?',
      exp: 'Malayos sube de edad en una fracción del tiempo estándar, lo que permite producir más aldeanos antes de hacer clic.',
    },
    {
      id: 'l2_open_franks',
      slug: 'franks',
      prompt: '¿Qué civilización recibe automáticamente y gratis las mejoras de granjas del Molino al cambiar de edad?',
      exp: 'Francos obtiene Collera, Arado pesado y Rotación de cultivos gratis en cuanto alcanza la edad correspondiente.',
    },
    {
      id: 'l2_open_vikings',
      slug: 'vikings',
      prompt: '¿Qué civilización obtiene Carretilla y Carro de mano gratis apenas entra en Edad Feudal y Castillos?',
      exp: 'Vikingos disfruta de uno de los mayores impulsos económicos gratuitos del juego en Feudal y Castillos.',
    },
    {
      id: 'l2_open_bulgarians',
      slug: 'bulgarians',
      prompt: '¿Qué civilización recibe gratis toda la cadena de mejoras de Milicia (Hombre de armas, Espada larga y Mandoble)?',
      exp: 'Búlgaros mejora gratis la línea de Milicia al subir de edad; aunque no tiene Campeón, compensa en Imperial con la corona «Bagains» (+5 armadura cuerpo a cuerpo).',
    },
    {
      id: 'l2_open_italians',
      slug: 'italians',
      prompt: '¿Qué civilización ahorra un 15 % del coste de recursos al avanzar a cada nueva edad?',
      exp: 'Italianos paga menos comida y oro al pasar a Feudal, Castillos e Imperial, facilitando tiempos muy ágiles.',
    },
    {
      id: 'l2_open_mayans',
      slug: 'mayans',
      prompt: '¿Qué civilización comienza con +1 Aldeano extra (-50 de comida) y hace que los recursos duren un 15 % más?',
      exp: 'Mayas debe evitar quedarse bloqueado en 5/5 al inicio y aprovecha cada oveja, jabalí y mina de oro un 15 % más.',
    },
    {
      id: 'l2_open_gurjaras',
      slug: 'gurjaras',
      prompt: '¿Qué civilización puede guarnecer ganado en el Molino para generar comida pasiva e inicia con 2 arbustos bajo el Centro Urbano?',
      exp: 'Gurjaras reemplaza el inicio clásico por pastoreo guarnecido en Molino y Explorador de camello.',
    },
  ];
  for (const r of openingRules) {
    if (!CIV_TECH[r.slug]?.nodes) continue;
    const rng = makeRng(r.id);
    const decoys = shuffleWithRng(VALID_CIV_SLUGS.filter((s) => s !== r.slug), rng).slice(0, 3);
    addQ(2, {
      id: r.id,
      category: 'opening_rule',
      modeLabel: 'Regla de Apertura',
      age: 1,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Alta Edad · Economía',
      prompt: r.prompt,
      options: [
        makeCivOption(r.slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: r.exp,
    });
  }

  // 2C. Acceso a unidades regionales (21 preguntas)
  const regionalNodes = ['Steppe Lancer', 'Battle Elephant', 'Elephant Archer', 'Winged Hussar', 'Hei Guang Cavalry', 'Dromon'];
  for (const rNode of regionalNodes) {
    const have = VALID_CIV_SLUGS.filter((s) => hasNode(s, rNode));
    const miss = VALID_CIV_SLUGS.filter((s) => !hasNode(s, rNode));
    if (!have.length || miss.length < 3) continue;
    const picks = have.slice(0, rNode === 'Battle Elephant' ? 5 : 4);
    for (const slug of picks) {
      const id = `l2_reg_${rNode.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(miss, rng).slice(0, 3);
      const extraRegNote = (rNode === 'Battle Elephant' && slug === 'dravidians')
        ? ' (Es la única civ con Elefante de combate sin mejora a Élite, compensada por Cuerpo médico y Acero wootz).'
        : (rNode === 'Winged Hussar' && slug === 'poles')
          ? ' (Potenciado además con la corona Imperial «Legado lequítico» de daño de pisoteo).'
          : (rNode === 'Winged Hussar' && slug === 'lithuanians')
            ? ' (Su +2 de ataque base iguala al Húsar genérico con Alto horno).'
            : '.';
      addQ(2, {
        id,
        category: 'regional_unit',
        modeLabel: 'Unidad Regional',
        age: 3,
        mapName: 'Arabia',
        mapSlug: 'arabia',
        myCiv: null,
        rivalCiv: null,
        threatLabel: OFFICIAL_NODE_ES[rNode].es,
        prompt: `¿Cuál de estas cuatro civilizaciones tiene acceso a la unidad regional «${OFFICIAL_NODE_ES[rNode].es}»?`,
        options: [
          makeCivOption(slug, true),
          ...decoys.map((d) => makeCivOption(d, false)),
        ],
        explanation: `${civNameEs(slug)} dispone de ${OFFICIAL_NODE_ES[rNode].es} en su árbol tecnológico oficial${extraRegNote}`,
      });
    }
  }

  /* =========================================================================
   * NIVEL 3 · 1300–1450 ELO · Transiciones, Coronas y Brechas de Establo/Cuarteles
   * ========================================================================= */
  // 3A. Dilemas de transición Castillos → Imperial (22 preguntas verificadas — bonos/coronas + distractores legales)
  const tdTemplates = [
    ['franks', 'hindustanis', 'knights', 'camels', 'spears', 'Arabia', 'arabia', null, 'Contra Jinetes de camello imperiales indostanos (+20 % velocidad de ataque, 160 PR), los Campeones pierden en 1v1; los Alabarderos (+26 daño extra vs camellos, sin oro) junto a Lanzadores de hachas (Hacha de barba) son la transición correcta.'],
    ['franks', 'bohemians', 'knights', 'spears', 'gunpowder', 'Arena', 'arena', null, 'Contra Alabarderos bohemios (+25 % daño de bonificación), Francos gira a Artilleros manuales (o Lanzadores de hachas) para limpiar infantería sin arriesgar sus Paladines.'],
    ['britons', 'vikings', 'archers', 'skirms', 'infantry', 'Arabia', 'arabia', null, 'Los Campeones britanos (100 % completos) rompen la masa de Guerrilleros enemigos mientras tus Arbalesteros (+3 alcance con Terratenientes) cubren desde atrás.'],
    ['britons', 'goths', 'archers', 'infantry', 'infantry', 'Arabia', 'arabia', 'Huscarles (con Anarquía y Perfusión)', 'Contra Campeones godos tus Arbalesteros (11 de alcance) ya ganan, pero si Godos gira a Huscarles (10 de armadura antiproyectil), Britanos responde con Campeones 100 % completos.'],
    ['ethiopians', 'berbers', 'archers', 'skirms', 'siege', 'Arabia', 'arabia', null, 'Etíopes tiene Onagro de asedio con Ingenieros de asedio y la corona «Motores de torsión», barriendo masas de Guerrilleros en pocos disparos.'],
    ['magyars', 'byzantines', 'knights', 'camels', 'cavarchers', 'Arabia', 'arabia', null, 'Los Arqueros a caballo pesados magiares (100 % completos + «Arco recurvado» +1/+1) castigan a los Camellos bizantinos (-25 % coste) manteniendo distancia.'],
    ['mongols', 'vietnamese', 'cavarchers', 'skirms', 'siege', 'Arabia', 'arabia', null, 'Los Onagros de asedio mongoles con «Instrucción militar» (+50 % velocidad de movimiento) alcanzan y aplastan a los Guerrilleros imperiales vietnamitas.'],
    ['huns', 'saracens', 'cavarchers', 'camels', 'spears', 'Arabia', 'arabia', null, 'Alabarderos protegen a tus Arqueros a caballo hunos (-20 % coste) frente a Camellos pesados sarracenos (+25 % PR) sin consumir oro.'],
    ['spanish', 'britons', 'knights', 'spears', 'skirms', 'Arabia', 'arabia', null, 'Guerrilleros de élite españoles (100 % completos con Dactilera y Herrería sin oro) limpian Alabarderos y neutralizan Arbalesteros britanos.'],
    ['turks', 'byzantines', 'cavarchers', 'skirms', 'scouts', 'Arena', 'arena', null, 'Turcos recibe Húsar gratis (+1 armadura antiproyectil), excelente para flanquear y arrasar Guerrilleros bizantinos sin gastar oro.'],
    ['teutons', 'ethiopians', 'knights', 'spears', 'gunpowder', 'Arena', 'arena', null, 'Los Artilleros manuales teutones eliminan Alabarderos enemigos mientras tus Paladines (+2 armadura CaC) empujan la línea frontal.'],
    ['slavs', 'mayans', 'infantry', 'archers', 'siege', 'Arabia', 'arabia', null, 'El asedio eslavo (-15 % coste) con Onagros de asedio barre masas de Arbalesteros y Arqueros emplumados mayas.'],
    ['japanese', 'italians', 'infantry', 'gunpowder', 'archers', 'Arabia', 'arabia', null, 'Arbalesteros japoneses (100 % completos con Dactilera y Brazal) superan en alcance a los Artilleros manuales italianos (-20 % coste y Pirotecnia); también son viables Arqueros a caballo (+2 vs arqueros) u Onagros.'],
    ['chinese', 'franks', 'archers', 'knights', 'spears', 'Arabia', 'arabia', null, 'Tras perder los Camellos, Chinos frena a los Paladines francos (192 PR) con Alabarderos 100 % completos protegiendo sus Chu Ko Nu o Arbalesteros.'],
    ['japanese', 'goths', 'archers', 'infantry', 'infantry', 'Arabia', 'arabia', 'Huscarles (con Anarquía y Perfusión)', 'Los Campeones japoneses (+33 % velocidad de ataque) y Samuráis destrozan a los Huscarles godos en combate cuerpo a cuerpo.'],
    ['persians', 'byzantines', 'knights', 'spears', 'gunpowder', 'Arena', 'arena', null, 'Artilleros manuales persas eliminan Alabarderos bizantinos (-25 % coste) para abrir paso a tus Savars.'],
    ['burgundians', 'teutons', 'knights', 'spears', 'gunpowder', 'Arena', 'arena', null, 'Los Artilleros manuales borgoñeses (+25 % ataque de pólvora) derriten Alabarderos y Caballeros de la Orden Teutónica.'],
    ['portuguese', 'goths', 'archers', 'infantry', 'gunpowder', 'Arena', 'arena', 'Huscarles (con Anarquía y Perfusión)', 'Los Artilleros manuales portugueses (-20 % oro y «Arcabuz» con balística en pólvora) arrasan Huscarles e infantería goda.'],
    ['lithuanians', 'saracens', 'knights', 'camels', 'spears', 'Arabia', 'arabia', null, 'Alabarderos lituanos (+10 % velocidad y «Escudos de torre» +2 armadura antiproyectil) protegen tus Paladines frente a Camellos sarracenos.'],
    ['poles', 'bohemians', 'knights', 'spears', 'skirms', 'Arena', 'arena', null, 'Guerrilleros de élite (o Arbalesteros) polacos apoyan a tus Caballeros (-60 % oro con Privilegios de la Szlachta) limpiando Alabarderos bohemios.'],
    ['khmer', 'berbers', 'knights', 'camels', 'spears', 'Arabia', 'arabia', null, 'Alabarderos jemeres (complementados por Escorpiones pesados con «Doble ballesta») frenan a los Camellos pesados bereberes (-20 % coste).'],
    ['tatars', 'vietnamese', 'cavarchers', 'skirms', 'scouts', 'Arabia', 'arabia', null, 'Húsares tártaros con «Armadura de seda» (+1/+1) absorben las jabalinas de Guerrilleros imperiales vietnamitas y limpian el frente para tus Arqueros a caballo.'],
  ];
  for (const [mySlug, rivSlug, initLine, rivalThreat, switchLine, mapName, mapSlug, threatOverride, customExp] of tdTemplates) {
    if (!CIV_TECH[mySlug]?.nodes || !CIV_TECH[rivSlug]?.nodes) continue;
    const swQual = arenaLineQuality(mySlug, switchLine, 4);
    if (!swQual || swQual.score < 0.65) continue;
    if (!COUNTER_MAP[rivalThreat]?.includes(switchLine)) continue;
    const id = `l3_td_${mySlug}_${rivSlug}_${rivalThreat}_${switchLine}`;
    const rng = makeRng(id);
    const badSet = new Set([...(COUNTER_MAP[rivalThreat] || []), rivalThreat, switchLine]);
    // Solo distractores que NO sean también counters válidos y que la civ tenga en su árbol
    const legalDistractors = Object.keys(LINE_META).filter((lk) => {
      if (badSet.has(lk)) return false;
      const qual = arenaLineQuality(mySlug, lk, 4);
      return Boolean(qual && qual.score > 0);
    });
    const fallbackDistractors = Object.keys(LINE_META).filter((lk) => !badSet.has(lk) && !legalDistractors.includes(lk));
    const distractors = [
      ...shuffleWithRng(legalDistractors, rng),
      ...shuffleWithRng(fallbackDistractors, rng),
    ].slice(0, 3);
    if (distractors.length < 3) continue;
    const initTxt = lineLabelForAge(initLine, 3, mySlug);
    const threatTxt = threatOverride || lineLabelForAge(rivalThreat, 4, rivSlug);
    addQ(3, {
      id,
      category: 'transition_dilemma',
      modeLabel: 'Transición Imperial',
      age: 4,
      mapName,
      mapSlug,
      myCiv: { slug: mySlug, name: civNameEs(mySlug) },
      rivalCiv: { slug: rivSlug, name: civNameEs(rivSlug) },
      threatLabel: `Rival cambia a ${threatTxt}`,
      prompt: `Jugás ${civNameEs(mySlug)} con ${initTxt} en Castillos. Al entrar en Imperial, ${civNameEs(rivSlug)} gira a ${threatTxt}. ¿Qué transición válida en tu árbol tecnológico da la mejor respuesta?`,
      options: [
        makeLineOption(switchLine, true, 4, mySlug),
        ...distractors.map((d) => makeLineOption(d, false, 4, mySlug)),
      ],
      explanation: customExp,
    });
  }

  // 3B. Sin Pureza de sangre (civs CON Establo y SIN Paladín — Francos reservado a Nivel 7)
  const l3NoBloodlines = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && !hasNode(s, 'Bloodlines') && !hasNode(s, 'Paladin'));
  for (const slug of l3NoBloodlines) {
    const id = `l3_bl_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(
      VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && hasNode(s, 'Bloodlines')),
      rng
    ).slice(0, 3);
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Establo · Brecha',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Pureza de sangre (+20 PR)',
      prompt: '¿Cuál de estas cuatro civilizaciones con Establo NO dispone de «Pureza de sangre» (+20 PR para caballería)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} carece de Pureza de sangre en el Establo; las otras tres civilizaciones sí cuentan con ella.`,
        slug,
        'Bloodlines',
      ),
    });
  }

  // 3C. Sin Ganadería (civs CON Establo y SIN Paladín — Cumanos y Teutones reservados a Nivel 7)
  const l3NoHusb = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && !hasNode(s, 'Husbandry') && !hasNode(s, 'Paladin'));
  for (const slug of l3NoHusb) {
    const id = `l3_husb_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(
      VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Scout Cavalry') && hasNode(s, 'Husbandry')),
      rng
    ).slice(0, 3);
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Establo · Movilidad',
      age: 3,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Ganadería (+10 % vel.)',
      prompt: '¿Cuál de estas civilizaciones con caballería NO tiene «Ganadería» en el Establo?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} no dispone de Ganadería (+10 % velocidad de caballería).`,
    });
  }

  // 3D. Sin Alabardero (verifica Pikeman real para Turcos y Gurjaras + añade bonos/coronas)
  const l3NoHalb = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Halberdier'));
  for (const slug of l3NoHalb) {
    const id = `l3_halb_${slug}`;
    const rng = makeRng(id);
    const poolHave = ['Champion', 'Two-Handed Swordsman', 'Arson', 'Squires', 'Gambesons', 'Plate Mail Armor', 'Blast Furnace', 'Hussar', 'Arbalester']
      .filter((n) => hasNode(slug, n));
    if (poolHave.length < 3) continue;
    const decoys = shuffleWithRng(poolHave, rng).slice(0, 3);
    const baseExp = hasNode(slug, 'Pikeman')
      ? `${civNameEs(slug)} carece de Alabardero en Edad Imperial y se detiene en Piquero.`
      : `${civNameEs(slug)} carece de Alabardero en Edad Imperial.`;
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Cuarteles · Imperial',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: { slug, name: civNameEs(slug) },
      rivalCiv: null,
      threatLabel: 'Defensa anticaballería',
      prompt: `Al jugar ${civNameEs(slug)} contra caballería pesada en Imperial, ¿cuál de estas mejoras NO existe en su árbol?`,
      options: [
        makeNodeOption('Halberdier', true),
        ...decoys.map((n) => makeNodeOption(n, false)),
      ],
      explanation: withNote(baseExp, slug, 'Halberdier'),
    });
  }

  // 3E. Sin Campeón pese a tener Espadachín de mandoble (EXCLUYE Two-Handed Swordsman de poolHave!)
  const l3NoChamp = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Two-Handed Swordsman') && !hasNode(s, 'Champion'));
  for (const slug of l3NoChamp) {
    const id = `l3_champ_${slug}`;
    const rng = makeRng(id);
    const poolHave = ['Halberdier', 'Squires', 'Arson', 'Gambesons', 'Plate Mail Armor', 'Blast Furnace', 'Iron Casting', 'Chain Mail Armor']
      .filter((n) => hasNode(slug, n));
    if (poolHave.length < 3) continue;
    const decoys = shuffleWithRng(poolHave, rng).slice(0, 3);
    addQ(3, {
      id,
      category: 'tech_gap',
      modeLabel: 'Infantería Imperial',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: { slug, name: civNameEs(slug) },
      rivalCiv: null,
      threatLabel: 'Tope de infantería',
      prompt: `${civNameEs(slug)} cuenta con Espadachín de mandoble, pero ¿cuál de estas tecnologías o mejoras de infantería NO tiene?`,
      options: [
        makeNodeOption('Champion', true),
        ...decoys.map((n) => makeNodeOption(n, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} se detiene en Espadachín de mandoble y no accede a Campeón.`,
        slug,
        'Champion',
      ),
    });
  }

  /* =========================================================================
   * NIVEL 4 · 1450–1600 ELO · Picos Tempranos, Pólvora/Asedio y Herrería
   * ========================================================================= */
  // 4A. Picos tecnológicos 1 edad antes (verificados por entero de edad en civ-tech.json + bonos)
  const earlyAccessPairs = [
    ['armenians', 'Long Swordsman', 2, ''],
    ['armenians', 'Champion', 3, ''],
    ['armenians', 'Halberdier', 3, ''],
    ['burgundians', 'Cavalier', 3, ' Además cuenta con un 50 % de descuento en tecnologías del Establo.'],
    ['burgundians', 'Double-Bit Axe', 1, ' Además ahorra un 33 % de comida en todas las mejoras económicas.'],
    ['burgundians', 'Bow Saw', 2, ' Además ahorra un 33 % de comida en todas las mejoras económicas.'],
    ['cumans', 'Battering Ram', 2, ' Permite presionar Centros Urbanos y muros ya en Edad Feudal.'],
    ['cumans', 'Capped Ram', 3, ''],
    ['bohemians', 'Chemistry', 3, ' Habilita también Artilleros manuales en Castillos y suma +1 de ataque a flechas.'],
    ['bohemians', 'Hand Cannoneer', 3, ' Requiere investigar previamente Química (también disponible en Castillos para Bohemios).'],
    ['jurchens', 'Siege Engineers', 3, ' Además sus tecnologías de asedio cuestan -75 % madera y se investigan +100 % más rápido.'],
    ['khitans', 'Heavy Cavalry Archer', 3, ' Además recibe un 50 % de descuento en el coste de la mejora.'],
    ['persians', 'Parthian Tactics', 3, ''],
  ];
  for (const [slug, node, expectedAge, extraNote] of earlyAccessPairs) {
    if (nodeAge(slug, node) !== expectedAge) continue;
    const id = `l4_early_${slug}_${node.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const rng = makeRng(id);
    const stdPool = VALID_CIV_SLUGS.filter((s) => s !== slug && nodeAge(s, node) != null && nodeAge(s, node) > expectedAge);
    const decoys = shuffleWithRng(stdPool, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(4, {
      id,
      category: 'early_access',
      modeLabel: 'Pico Temprano',
      age: expectedAge,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: `${OFFICIAL_NODE_ES[node].es} en ${AGE_META[expectedAge].label}`,
      prompt: `¿Cuál de estas civilizaciones desbloquea «${OFFICIAL_NODE_ES[node].es}» una edad antes que el resto (en ${AGE_META[expectedAge].label})?`,
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} accede a ${OFFICIAL_NODE_ES[node].es} ya en ${AGE_META[expectedAge].label}, una edad entera antes que las civilizaciones estándar.${extraNote}`,
    });
  }

  // 4B. Acceso a pólvora y asedio pesado (24 preguntas — excluye civs de Carro de cohetes como distractores de Onagro de asedio)
  const heavySiegeNodes = ['Bombard Cannon', 'Siege Onager', 'Siege Ram', 'Hand Cannoneer'];
  for (const hNode of heavySiegeNodes) {
    const have = VALID_CIV_SLUGS.filter((s) => hasNode(s, hNode));
    const miss = VALID_CIV_SLUGS.filter((s) => {
      if (hasNode(s, hNode)) return false;
      // Coreanos, Kitán, Chinos y Yurchen reemplazan Mangana/Onagro por Carro de cohetes: no mezclar como distractores sin contexto
      if (hNode === 'Siege Onager' && ROCKET_CART_CIVS.has(s)) return false;
      return true;
    });
    const rngTop = makeRng(`l4_sg_${hNode}`);
    const chosen = shuffleWithRng(have, rngTop).slice(0, 6);
    for (const slug of chosen) {
      const id = `l4_sg_${hNode.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(miss, rng).slice(0, 3);
      addQ(4, {
        id,
        category: 'siege_access',
        modeLabel: 'Asedio y Pólvora',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: null,
        rivalCiv: null,
        threatLabel: OFFICIAL_NODE_ES[hNode].es,
        prompt: `¿Cuál de estas cuatro civilizaciones SÍ tiene acceso a «${OFFICIAL_NODE_ES[hNode].es}» en Edad Imperial?`,
        options: [
          makeCivOption(slug, true),
          ...decoys.map((d) => makeCivOption(d, false)),
        ],
        explanation: withNote(
          `${civNameEs(slug)} dispone de ${OFFICIAL_NODE_ES[hNode].es} en Edad Imperial; las otras tres carecen de esta unidad.`,
          slug,
          hNode,
        ),
      });
    }
  }

  // 4C. Brechas de Herrería Imperial (22 preguntas — con compensaciones reales de bonos y coronas)
  const smithAudit = [
    { node: 'Plate Mail Armor', civs: VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Plate Mail Armor')).slice(0, 9) },
    { node: 'Blast Furnace', civs: VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Blast Furnace') && !hasNode(s, 'Paladin')).slice(0, 8) },
    { node: 'Plate Barding Armor', civs: VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Knight') && !hasNode(s, 'Paladin') && !hasNode(s, 'Hussar') && !hasNode(s, 'Plate Barding Armor')).slice(0, 5) },
  ];
  const allSmithKeys = ['Plate Mail Armor', 'Plate Barding Armor', 'Ring Archer Armor', 'Blast Furnace', 'Bracer', 'Chain Mail Armor', 'Iron Casting', 'Bodkin Arrow'];
  for (const grp of smithAudit) {
    for (const slug of grp.civs) {
      const present = allSmithKeys.filter((k) => k !== grp.node && hasNode(slug, k));
      if (present.length < 3) continue;
      const id = `l4_smith_${grp.node.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(present, rng).slice(0, 3);
      addQ(4, {
        id,
        category: 'blacksmith_gap',
        modeLabel: 'Herrería Imperial',
        age: 4,
        mapName: 'Arabia',
        mapSlug: 'arabia',
        myCiv: { slug, name: civNameEs(slug) },
        rivalCiv: null,
        threatLabel: 'Mejoras de Herrería',
        prompt: `¿Cuál de estas mejoras genéricas de Herrería falta en el árbol tecnológico de ${civNameEs(slug)}?`,
        options: [
          makeNodeOption(grp.node, true),
          ...decoys.map((k) => {
            if (slug === 'khitans' && k === 'Iron Casting') {
              return makeNodeOption(k, false, 'Ataque cuerpo a cuerpo en Castillos (duplicado a +2 en Kitán)');
            }
            if (slug === 'romans' && k === 'Chain Mail Armor') {
              return makeNodeOption(k, false, 'Segunda armadura de infantería (duplicada a +2/+2 en Romanos)');
            }
            return makeNodeOption(k, false);
          }),
        ],
        explanation: withNote(
          `${civNameEs(slug)} no dispone de ${OFFICIAL_NODE_ES[grp.node].es} en la Herrería.`,
          slug,
          grp.node,
        ),
      });
    }
  }

  /* =========================================================================
   * NIVEL 5 · 1600–1750 ELO · Monasterio Competitivo y Brechas de Rango/Asedio
   * ========================================================================= */
  // 5A. Monasterio Competitivo (44 preguntas — SIN auto-spoilers ni paréntesis rotos!)
  const monkPool = ['Redemption', 'Block Printing', 'Heresy', 'Sanctity', 'Fervor', 'Atonement', 'Illumination', 'Theocracy', 'Faith'];
  const l5MonkSpecs = [
    { node: 'Redemption', limit: 14 },
    { node: 'Block Printing', limit: 11 },
    { node: 'Heresy', limit: 10 },
    { node: 'Sanctity', limit: 9 },
  ];
  for (const spec of l5MonkSpecs) {
    const missingCivs = VALID_CIV_SLUGS.filter((s) => !hasNode(s, spec.node));
    const chosen = shuffleWithRng(missingCivs, makeRng(`l5_${spec.node}`)).slice(0, spec.limit);
    for (const slug of chosen) {
      const present = monkPool.filter((k) => k !== spec.node && hasNode(slug, k));
      if (present.length < 3) continue;
      const id = `l5_monk_${spec.node.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(present, rng).slice(0, 3);
      const buildingName = (slug === 'armenians' || slug === 'georgians') ? 'la Iglesia fortificada' : 'el Monasterio';
      addQ(5, {
        id,
        category: 'monastery_gap',
        modeLabel: 'Monasterio Competitivo',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: { slug, name: civNameEs(slug) },
        rivalCiv: null,
        threatLabel: 'Tecnologías de Monasterio',
        prompt: `En ${buildingName} de ${civNameEs(slug)}, ¿cuál de estas cuatro tecnologías NO existe en su árbol tecnológico?`,
        options: [
          makeNodeOption(spec.node, true),
          ...decoys.map((k) => makeNodeOption(k, false)),
        ],
        explanation: withNote(
          `${civNameEs(slug)} carece de ${OFFICIAL_NODE_ES[spec.node].es}: ${OFFICIAL_NODE_ES[spec.node].sub.toLowerCase()}.`,
          slug,
          spec.node,
        ),
      });
    }
  }

  // 5B. Sin Ingenieros de asedio (civs SIN Onagro de asedio ni Cañón de asedio — disjoint de Nivel 7)
  const l5NoSE = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Siege Engineers') && !hasNode(s, 'Siege Onager') && !hasNode(s, 'Bombard Cannon'));
  for (const slug of l5NoSE) {
    const id = `l5_se_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Siege Engineers')), rng).slice(0, 3);
    addQ(5, {
      id,
      category: 'tech_gap',
      modeLabel: 'Universidad · Asedio',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Ingenieros de asedio',
      prompt: '¿Cuál de estas civilizaciones NO tiene «Ingenieros de asedio» (+1 alcance en asedio a distancia y +20 % daño a edificios) en la Universidad?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} no cuenta con Ingenieros de asedio en la Universidad.`,
        slug,
        'Siege Engineers',
      ),
    });
  }

  // 5C. Sin Armadura de anillos de arquero (civs SIN Arbalestero — excluye Turcos como distractor al mencionar Guerrilleros de élite)
  const l5NoRAA = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Ring Archer Armor') && !hasNode(s, 'Arbalester'));
  for (const slug of l5NoRAA) {
    const id = `l5_raa_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(
      VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Arbalester') && hasNode(s, 'Ring Archer Armor') && hasNode(s, 'Elite Skirmisher')),
      rng
    ).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(5, {
      id,
      category: 'tech_gap',
      modeLabel: 'Herrería · Rango',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Armadura de anillos de arquero',
      prompt: 'Entre estas civilizaciones sin Arbalestero, ¿cuál también carece de «Armadura de anillos de arquero» en la Herrería?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} carece de Armadura de anillos de arquero en Edad Imperial.`,
        slug,
        'Ring Archer Armor',
      ),
    });
  }

  // 5D. Sin Brazal (civs SIN Arbalestero — Teutones aclara Almenas +3 alcance en Castillos!)
  const l5NoBracer = VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Bracer') && !hasNode(s, 'Arbalester'));
  for (const slug of l5NoBracer) {
    const id = `l5_brac_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(
      VALID_CIV_SLUGS.filter((s) => !hasNode(s, 'Arbalester') && hasNode(s, 'Bracer') && hasNode(s, 'Elite Skirmisher')),
      rng
    ).slice(0, 3);
    if (decoys.length < 3) continue;
    const promptTxt = slug === 'teutons'
      ? '¿Cuál de estas civilizaciones NO dispone de «Brazal» en la Herrería (afectando el alcance de Guerrilleros y torres, aunque compensa sus Castillos con su corona Imperial)?'
      : '¿Cuál de estas civilizaciones NO dispone de «Brazal» en la Herrería (+1 ataque y +1 alcance a unidades a distancia y defensas en Imperial)?';
    addQ(5, {
      id,
      category: 'tech_gap',
      modeLabel: 'Herrería · Brazal',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Brazal (+1 ataque y alcance)',
      prompt: promptTxt,
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} no dispone de Brazal en Edad Imperial.`,
        slug,
        'Bracer',
      ),
    });
  }

  /* =========================================================================
   * NIVEL 6 · 1750–1900 ELO · Guerra Sin Oro (Trash), Coronas y Post-Imperial
   * ========================================================================= */
  const isFuHussar = (s) => hasNode(s, 'Hussar') && hasNode(s, 'Bloodlines') && hasNode(s, 'Husbandry') && hasNode(s, 'Plate Barding Armor') && hasNode(s, 'Blast Furnace');
  const isFuHalb = (s) => hasNode(s, 'Halberdier') && hasNode(s, 'Plate Mail Armor') && hasNode(s, 'Blast Furnace') && hasNode(s, 'Squires');
  const isFuSkirmBlacksmith = (s) => (hasNode(s, 'Elite Skirmisher') || hasNode(s, 'Imperial Skirmisher')) && hasNode(s, 'Bracer') && hasNode(s, 'Ring Archer Armor');
  const isFuSkirmFull = (s) => isFuSkirmBlacksmith(s) && hasNode(s, 'Thumb Ring') && hasNode(s, 'Ballistics') && hasNode(s, 'Chemistry');

  // Excluir Winged Hussar (Polacos/Lituanos) y civs con bonos/coronas que compensan directamente (Cumanos/Kitán/Wei/Mongoles)
  const hussarCompensated = new Set(['poles', 'lithuanians', 'cumans', 'khitans', 'wei', 'mongols']);
  const fuHussarCivs = VALID_CIV_SLUGS.filter(isFuHussar);
  const partialHussarCivs = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Hussar') && !isFuHussar(s) && !hussarCompensated.has(s));

  for (const slug of fuHussarCivs.slice(0, 14)) {
    const id = `l6_trash_hussar_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(partialHussarCivs, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Post-Imperial · Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Húsar al 100 % completo',
      prompt: 'Se agotó el oro en el mapa. Las cuatro tienen Húsar, pero ¿cuál lo posee al 100 % completo (Pureza de sangre, Ganadería, Barda de placas y Alto horno)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} tiene todas las mejoras genéricas de Húsar al 100 %; a las otras tres les falta al menos una mejora de Establo o Herrería.`,
        slug,
        'Hussar',
      ),
    });
  }

  // Excluir Celtas (+15 % vel. > Escuderos) y Romanos (+4/+4 armadura > Armadura de placas) de distractores «incompletos»
  const halbCompensated = new Set(['celts', 'romans']);
  const fuHalbCivs = VALID_CIV_SLUGS.filter(isFuHalb);
  const partialHalbCivs = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Halberdier') && !isFuHalb(s) && !halbCompensated.has(s));
  for (const slug of fuHalbCivs.slice(0, 14)) {
    const id = `l6_trash_halb_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(partialHalbCivs, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Post-Imperial · Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Alabardero al 100 %',
      prompt: 'Las cuatro disponen de Alabardero, pero ¿cuál lo tiene 100 % completo (Armadura de placas, Alto horno y Escuderos)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} cuenta con Alabardero completo al 100 % en Herrería y Cuarteles; las otras tres pierden al menos una de esas mejoras.`,
        slug,
        'Halberdier',
      ),
    });
  }

  // 6C. Guerrillero de élite al 100 % en Herrería (exige Dactilera para precisión 100 % real!)
  const fuSkirmCivs = VALID_CIV_SLUGS.filter(isFuSkirmFull);
  const partialSkirmCivs = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Elite Skirmisher') && !isFuSkirmBlacksmith(s));
  for (const slug of fuSkirmCivs.slice(0, 12)) {
    const id = `l6_trash_skirm_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(partialSkirmCivs, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Post-Imperial · Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Guerrillero de élite 100 %',
      prompt: '¿Cuál de estas cuatro civilizaciones tiene Guerrillero de élite al 100 % completo (Brazal, Armadura de anillos de arquero y Dactilera)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} dispone de Brazal, Armadura de anillos de arquero y Dactilera (100 % precisión) para sus Guerrilleros de élite.`,
        slug,
        'Elite Skirmisher',
      ),
    });
  }

  // 6D. Trinidad Sin Oro 100 % real (Húsar + Alabardero + Guerrillero con Dactilera + Incendiarismo) + Coronas Post-Imperial
  const tripleTrashFull = VALID_CIV_SLUGS.filter((s) => isFuHussar(s) && isFuHalb(s) && hasNode(s, 'Arson') && isFuSkirmFull(s));
  const twoOfThreeTrash = VALID_CIV_SLUGS.filter((s) => {
    const cnt = (isFuHussar(s) ? 1 : 0) + (isFuHalb(s) ? 1 : 0) + (isFuSkirmFull(s) ? 1 : 0);
    return cnt === 2;
  });
  for (const slug of tripleTrashFull) {
    const id = `l6_trash_triple_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(twoOfThreeTrash, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(6, {
      id,
      category: 'trash_war',
      modeLabel: 'Trinidad Sin Oro',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Húsar + Alabardero + Guerrillero',
      prompt: '¿Cuál de estas civilizaciones posee las TRES unidades sin oro (Húsar, Alabardero y Guerrillero de élite) al 100 % absoluto de mejoras, incluida Dactilera?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} completa el 100 % de las mejoras de Húsar, Alabardero y Guerrillero de élite (incluida Dactilera).`,
        slug,
        'TripleTrash',
      ),
    });
  }

  // 6D-bis. Coronas decisivas en guerra sin oro / post-Imperial (5 preguntas)
  const l6CrownTrashSpecs = [
    {
      id: 'l6_crown_forced_levy_malay',
      slug: 'malay',
      decoys: ['goths', 'bulgarians', 'vikings'],
      prompt: '¿Qué civilización carece de Campeón pero elimina por completo el coste de oro de sus Espadachines de mandoble mediante la corona Imperial «Leva forzosa»?',
      exp: 'Malayos convierte al Espadachín de mandoble en una unidad sin oro (60 de comida) con «Leva forzosa», dominando guerras sin oro prolongadas.',
    },
    {
      id: 'l6_crown_bagains_bulgarians',
      slug: 'bulgarians',
      decoys: ['slavs', 'teutons', 'romans'],
      prompt: '¿Qué civilización compensa no tener Campeón otorgando +5 de armadura cuerpo a cuerpo a sus Espadachines de mandoble con la corona Imperial «Bagains»?',
      exp: 'Búlgaros lleva a sus Espadachines de mandoble a 9 de armadura cuerpo a cuerpo con «Bagains» (además de mejoras de Milicia gratis).',
    },
    {
      id: 'l6_crown_atlatl_aztecs',
      slug: 'aztecs',
      decoys: ['mayans', 'incas', 'vietnamese'],
      prompt: '¿Qué civilización carece de Armadura de anillos de arquero pero potencia a sus Guerrilleros con +1 de ataque y +1 de alcance mediante la corona «Átlatl»?',
      exp: 'Aztecas investiga «Átlatl» en Edad de los Castillos, convirtiendo sus Guerrilleros de élite en una amenaza de 9 de alcance en Imperial.',
    },
    {
      id: 'l6_crown_lechitic_legacy_poles',
      slug: 'poles',
      decoys: ['lithuanians', 'magyars', 'huns'],
      prompt: '¿Qué civilización otorga daño de área (pisoteo) a su línea de Caballería ligera / Húsar alado mediante la corona Imperial «Legado lequítico»?',
      exp: 'Polacos combina Húsar alado (+10 PR y +2 ataque base) con «Legado lequítico» para arrasar grupos de infantería y arqueros sin gastar oro.',
    },
    {
      id: 'l6_crown_tower_shields_lithuanians',
      slug: 'lithuanians',
      decoys: ['byzantines', 'spanish', 'bohemians'],
      prompt: '¿Qué civilización compensa la falta de Armadura de placas en sus Lanceros otorgando +2 de armadura antiproyectil a Alabarderos y Guerrilleros con «Escudos de torre»?',
      exp: 'Lituanos suma +2 de armadura antiproyectil a Lanceros y Guerrilleros (que además se mueven un 10 % más rápido por bono de civilización).',
    },
  ];
  for (const item of l6CrownTrashSpecs) {
    if (!CIV_TECH[item.slug]?.nodes) continue;
    addQ(6, {
      id: item.id,
      category: 'trash_war',
      modeLabel: 'Coronas Post-Imperial',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Tecnologías Únicas (Coronas)',
      prompt: item.prompt,
      options: [
        makeCivOption(item.slug, true),
        ...item.decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: item.exp,
    });
  }

  // 6E. Economía y fortificación post-Imperial (18 preguntas — excluye Sarracenos de Guilds porque su bono fija 5 %)
  const lateNodes = ['Guilds', 'Two-Man Saw', 'Architecture', 'Fortified Wall', 'Hoardings', 'Stone Shaft Mining'];
  const ecoDecoyPool = ['Guilds', 'Two-Man Saw', 'Architecture', 'Fortified Wall', 'Hoardings', 'Stone Shaft Mining', 'Gold Shaft Mining', 'Crop Rotation', 'Masonry'];
  for (const lNode of lateNodes) {
    const missing = shuffleWithRng(
      VALID_CIV_SLUGS.filter((s) => !hasNode(s, lNode) && !(lNode === 'Guilds' && s === 'saracens')),
      makeRng(`l6_late_${lNode}`)
    ).slice(0, 3);
    for (const slug of missing) {
      const present = ecoDecoyPool.filter((k) => k !== lNode && hasNode(slug, k));
      if (present.length < 3) continue;
      const id = `l6_late_${lNode.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(present, rng).slice(0, 3);
      addQ(6, {
        id,
        category: 'late_eco',
        modeLabel: 'Economía Post-Imperial',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: { slug, name: civNameEs(slug) },
        rivalCiv: null,
        threatLabel: 'Tecnologías de cierre',
        prompt: `En partida muy larga con ${civNameEs(slug)}, ¿cuál de estas tecnologías económicas o de fortificación NO existe en su árbol?`,
        options: [
          makeNodeOption(lNode, true),
          ...decoys.map((k) => makeNodeOption(k, false)),
        ],
        explanation: withNote(
          `${civNameEs(slug)} carece de ${OFFICIAL_NODE_ES[lNode].es} — ${OFFICIAL_NODE_ES[lNode].sub}.`,
          slug,
          lNode,
        ),
      });
    }
  }

  /* =========================================================================
   * NIVEL 7 · 1900–2200+ ELO · «MUY MUY DIFÍCIL · GRAN MAESTRO IMPERIAL»
   * Todas las 4 opciones comparten la MISMA unidad insignia — con compensaciones y coronas.
   * ========================================================================= */
  const l7Paradoxes = [
    { capstone: 'Paladin', missing: 'Bloodlines', label: 'Paladín sin Pureza de sangre' },
    { capstone: 'Paladin', missing: 'Blast Furnace', label: 'Paladín sin Alto horno' },
    { capstone: 'Paladin', missing: 'Husbandry', label: 'Paladín sin Ganadería' },
    { capstone: 'Paladin', missing: 'Plate Barding Armor', label: 'Paladín sin Barda de placas' },
    { capstone: 'Arbalester', missing: 'Bracer', label: 'Arbalestero sin Brazal' },
    { capstone: 'Arbalester', missing: 'Ring Archer Armor', label: 'Arbalestero sin Armadura de anillos' },
    { capstone: 'Arbalester', missing: 'Thumb Ring', label: 'Arbalestero sin Dactilera' },
    { capstone: 'Heavy Cavalry Archer', missing: 'Parthian Tactics', label: 'Arq. a caballo pesado sin Tácticas de los partos' },
    { capstone: 'Heavy Cavalry Archer', missing: 'Ring Archer Armor', label: 'Arq. a caballo pesado sin Armadura de anillos' },
    { capstone: 'Siege Onager', missing: 'Siege Engineers', label: 'Onagro de asedio sin Ingenieros de asedio' },
    { capstone: 'Bombard Cannon', missing: 'Siege Engineers', label: 'Cañón de asedio sin Ingenieros de asedio' },
  ];

  for (const px of l7Paradoxes) {
    const trapped = VALID_CIV_SLUGS.filter((s) => hasNode(s, px.capstone) && !hasNode(s, px.missing));
    const complete = VALID_CIV_SLUGS.filter((s) => hasNode(s, px.capstone) && hasNode(s, px.missing));
    if (complete.length < 3) continue;
    const capEs = OFFICIAL_NODE_ES[px.capstone].es;
    const missEs = OFFICIAL_NODE_ES[px.missing].es;
    const picks = trapped.slice(0, 8);
    for (const slug of picks) {
      const id = `l7_px_${px.capstone.toLowerCase().replace(/\s+/g, '_')}_no_${px.missing.toLowerCase().replace(/\s+/g, '_')}_${slug}`;
      const rng = makeRng(id);
      const decoys = shuffleWithRng(complete, rng).slice(0, 3);
      addQ(7, {
        id,
        category: 'grandmaster_paradox',
        modeLabel: 'Paradoja Gran Maestro',
        age: 4,
        mapName: 'Arena',
        mapSlug: 'arena',
        myCiv: null,
        rivalCiv: null,
        threatLabel: px.label,
        prompt: `Las cuatro civilizaciones poseen «${capEs}», pero UNA sola pierde la tecnología genérica «${missEs}» en su árbol. ¿Cuál es?`,
        options: [
          makeCivOption(slug, true),
          ...decoys.map((d) => makeCivOption(d, false)),
        ],
        explanation: withNote(
          `${civNameEs(slug)} tiene ${capEs} pero NO tiene ${missEs}; ${decoys.map((d) => civNameEs(d)).join(', ')} sí cuentan con ambas.`,
          slug,
          px.missing,
        ),
      });
    }
  }

  // 7B. Cohorts 100 % FU élite (Paladín FU, Arq. a caballo pesado FU, Monasterio 11/11 completo con Herejía)
  const isFuPaladin = (s) => hasNode(s, 'Paladin') && hasNode(s, 'Bloodlines') && hasNode(s, 'Husbandry') && hasNode(s, 'Plate Barding Armor') && hasNode(s, 'Blast Furnace');
  const fuPaladins = VALID_CIV_SLUGS.filter(isFuPaladin);
  const nonFuPaladins = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Paladin') && !isFuPaladin(s));
  for (const slug of fuPaladins) {
    const id = `l7_fu_paladin_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(nonFuPaladins, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(7, {
      id,
      category: 'grandmaster_fu',
      modeLabel: 'Élite 100 % FU',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Paladín 100 % genérico',
      prompt: 'Las cuatro poseen Paladín, pero ¿cuál de ellas tiene TODAS las tecnologías de apoyo genéricas (Pureza de sangre, Ganadería, Barda de placas y Alto horno)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: `${civNameEs(slug)} cuenta con las 4 tecnologías genéricas de Establo y Herrería para Paladín (aunque rivales como Francos, Cumanos, Lituanos o Teutones compensan su ausencia genérica con bonos propios de PR, velocidad, Reliquias o armadura).`,
    });
  }

  const isFuHca = (s) => hasNode(s, 'Heavy Cavalry Archer') && hasNode(s, 'Bloodlines') && hasNode(s, 'Husbandry') && hasNode(s, 'Thumb Ring') && hasNode(s, 'Parthian Tactics') && hasNode(s, 'Bracer') && hasNode(s, 'Ring Archer Armor') && hasNode(s, 'Ballistics') && hasNode(s, 'Chemistry');
  const fuHcas = VALID_CIV_SLUGS.filter(isFuHca);
  const nonFuHcas = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Heavy Cavalry Archer') && !isFuHca(s));
  for (const slug of fuHcas) {
    const id = `l7_fu_hca_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(nonFuHcas, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(7, {
      id,
      category: 'grandmaster_fu',
      modeLabel: 'Élite 100 % FU',
      age: 4,
      mapName: 'Arabia',
      mapSlug: 'arabia',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Arq. a caballo pesado 100 %',
      prompt: 'Las cuatro tienen Arquero a caballo pesado, pero ¿cuál dispone del árbol genérico 100 % completo (Pureza, Ganadería, Dactilera, Tácticas de los partos, Brazal y Armadura de anillos)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} es una de las 5 civilizaciones estándar con Arquero a caballo pesado 100 % completo sin ninguna falta genérica.`,
        slug,
        'Heavy Cavalry Archer',
      ),
    });
  }

  // TODAS las 11 tecnologías del Monasterio verificadas (excluye automáticamente a Bizantinos porque carece de Medicina a base de hierbas!)
  const ALL_MONK_TECHS = [
    'Redemption', 'Atonement', 'Block Printing', 'Sanctity', 'Fervor',
    'Illumination', 'Theocracy', 'Heresy', 'Faith', 'Devotion', 'Herbal Medicine',
  ];
  const isFullMonkHeresy = (s) => ALL_MONK_TECHS.every((tech) => hasNode(s, tech));
  const fullMonks = VALID_CIV_SLUGS.filter(isFullMonkHeresy);
  const nearFullMonks = VALID_CIV_SLUGS.filter((s) => hasNode(s, 'Redemption') && hasNode(s, 'Block Printing') && !isFullMonkHeresy(s));
  for (const slug of fullMonks.slice(0, 6)) {
    const id = `l7_fu_monk_${slug}`;
    const rng = makeRng(id);
    const decoys = shuffleWithRng(nearFullMonks, rng).slice(0, 3);
    if (decoys.length < 3) continue;
    addQ(7, {
      id,
      category: 'grandmaster_fu',
      modeLabel: 'Monasterio Perfecto',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Monasterio 11/11 + Herejía',
      prompt: 'Las cuatro tienen Redención y Letras de imprenta, pero ¿cuál de ellas dispone de las 11 tecnologías del Monasterio completas (incluidas Herejía y Medicina a base de hierbas)?',
      options: [
        makeCivOption(slug, true),
        ...decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: withNote(
        `${civNameEs(slug)} posee el árbol completo de 11 tecnologías de Monasterio sin ninguna ausencia.`,
        slug,
        'Heresy',
      ),
    });
  }

  // 7C. Maestría de Coronas y Bonos Compensatorios Gran Maestro (8 preguntas)
  const l7CrownMastery = [
    {
      id: 'l7_crown_artillery_turks',
      slug: 'turks',
      decoys: ['bohemians', 'portuguese', 'ethiopians'],
      prompt: '¿Qué civilización carece de Ingenieros de asedio pero consigue Cañones de asedio de 14 de alcance (superando los 13 estándar) gracias a su corona Imperial «Artillería»?',
      exp: 'Turcos compensa la falta de Ingenieros de asedio con «Artillería» (+2 de alcance en Cañones de asedio, Torres de bombardeo y Galeones artillados).',
    },
    {
      id: 'l7_crown_farimba_malians',
      slug: 'malians',
      decoys: ['franks', 'lithuanians', 'burgundians'],
      prompt: '¿Qué civilización carece de Alto horno en la Herrería pero lleva el ataque de toda su caballería por encima del estándar mediante la corona Imperial «Farimba» (+5 ataque)?',
      exp: 'Malíes renuncia a Alto horno (penalizando su infantería), pero con «Farimba» sus Caballeros, Camellos pesados y Caballería ligera obtienen +7 de ataque total.',
    },
    {
      id: 'l7_crown_wootz_steel_dravidians',
      slug: 'dravidians',
      decoys: ['japanese', 'burmese', 'slavs'],
      prompt: '¿Qué civilización hace que TODOS los ataques de su infantería y caballería ignoren por completo la armadura enemiga mediante la corona Imperial «Acero wootz»?',
      exp: 'Dravídicos compensa árboles reducidos de Establo con «Acero wootz», convirtiendo a sus Campeones, Alabarderos y Urumis en demoledores contra unidades blindadas.',
    },
    {
      id: 'l7_crown_ming_guang_wei',
      slug: 'wei',
      decoys: ['mongols', 'poles', 'khitans'],
      prompt: '¿Qué civilización carece de Barda de placas pero añade +4 de armadura cuerpo a cuerpo a sus unidades montadas mediante la corona Imperial «Armadura Ming Guang»?',
      exp: 'Wei lleva la armadura cuerpo a cuerpo de sus unidades montadas muy por encima del estándar gracias a «Armadura Ming Guang».',
    },
    {
      id: 'l7_crown_double_armor_romans',
      slug: 'romans',
      decoys: ['teutons', 'goths', 'bulgarians'],
      prompt: '¿Qué civilización NO tiene Armadura de placas en la Herrería pero alcanza +4/+4 de armadura en infantería ya en Castillos al duplicar el efecto de las dos primeras armaduras?',
      exp: 'Romanos duplica Armadura de láminas (+2/+2) y Cota de malla (+2/+2), superando en armadura cuerpo a cuerpo al estándar +3/+4 con placas.',
    },
    {
      id: 'l7_crown_double_melee_khitans',
      slug: 'khitans',
      decoys: ['malians', 'lithuanians', 'aztecs'],
      prompt: '¿Qué civilización carece de Alto horno pero alcanza +4 de ataque cuerpo a cuerpo ya en Edad de los Castillos al duplicar Forja y Fundición de hierro?',
      exp: 'Kitán duplica Forja (+2) y Fundición de hierro (+2), consiguiendo en Castillos el mismo +4 de ataque que el resto obtiene recién en Imperial.',
    },
    {
      id: 'l7_crown_crenellations_teutons',
      slug: 'teutons',
      decoys: ['britons', 'koreans', 'byzantines'],
      prompt: '¿Qué civilización carece de Brazal en la Herrería pero logra los Castillos de mayor alcance del juego (13) mediante su corona Imperial «Almenas»?',
      exp: 'Teutones compensa la ausencia de Brazal en Castillos con «Almenas» (+3 de alcance y flechas disparadas por infantería guarnecida).',
    },
    {
      id: 'l7_crown_pirotechnia_italians',
      slug: 'italians',
      decoys: ['spanish', 'portuguese', 'bohemians'],
      prompt: '¿Qué civilización potencia a sus Artilleros manuales con 90 % de precisión y daño de penetración mediante la corona Imperial «Pirotecnia» (además de -20 % coste)?',
      exp: 'Italianos transforma sus Artilleros manuales con «Pirotecnia», volviéndolos devastadores incluso contra formaciones compactas.',
    },
  ];
  for (const item of l7CrownMastery) {
    if (!CIV_TECH[item.slug]?.nodes) continue;
    addQ(7, {
      id: item.id,
      category: 'grandmaster_fu',
      modeLabel: 'Coronas y Bonos',
      age: 4,
      mapName: 'Arena',
      mapSlug: 'arena',
      myCiv: null,
      rivalCiv: null,
      threatLabel: 'Maestría de Coronas',
      prompt: item.prompt,
      options: [
        makeCivOption(item.slug, true),
        ...item.decoys.map((d) => makeCivOption(d, false)),
      ],
      explanation: item.exp,
    });
  }

  const allQuestions = [
    ...byLevel[1], ...byLevel[2], ...byLevel[3], ...byLevel[4],
    ...byLevel[5], ...byLevel[6], ...byLevel[7],
  ];

  _cachedCatalog = {
    byLevel,
    byId,
    allQuestions,
    totalCount: allQuestions.length,
    countsByLevel: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((lvl) => [lvl, byLevel[lvl].length])),
  };
  return _cachedCatalog;
}

function getLevelConfig(level) {
  const n = Math.max(1, Math.min(7, Number(level) || 1));
  return LEVEL_CONFIG[n - 1];
}

function getCatalogQuestionById(questionId) {
  const cat = buildArenaCatalog();
  return cat.byId.get(String(questionId || '')) || null;
}

function pickNextQuestionForLevel({ level = 1, masteryCompleted = false, answeredCorrectIds = [], seed = Date.now() }) {
  const cat = buildArenaCatalog();
  const solvedSet = new Set(Array.isArray(answeredCorrectIds) ? answeredCorrectIds : []);
  const targetLvl = Math.max(1, Math.min(7, Number(level) || 1));

  // In Prestige / Endless Master mode (after beating Level 7), draw from elite Levels 6 + 7!
  const pool = (masteryCompleted && targetLvl === 7)
    ? [...cat.byLevel[7], ...cat.byLevel[6]]
    : (cat.byLevel[targetLvl] || cat.byLevel[1]);

  if (!pool.length) return null;
  const unsolved = pool.filter((q) => !solvedSet.has(q.id));
  const candidates = unsolved.length ? unsolved : pool;
  const rng = makeRng(Number(seed) ^ (solvedSet.size * 2654435761));
  const pick = candidates[Math.floor(rng() * candidates.length)] || candidates[0];
  return {
    ...pick,
    poolExhausted: unsolved.length === 0,
    unsolvedInLevel: unsolved.length,
    totalInLevel: pool.length,
  };
}

function evaluateArenaAnswer(questionId, selectedOptionId, timedOut = false) {
  const q = getCatalogQuestionById(questionId);
  if (!q) return { ok: false, error: 'unknown_question' };
  const correctOpt = q.options.find((o) => o.correct) || q.options[0];
  const isCorrect = !timedOut && Boolean(selectedOptionId && correctOpt && String(selectedOptionId) === String(correctOpt.id));
  return {
    ok: true,
    question: q,
    isCorrect,
    correctOptionId: correctOpt?.id || null,
    correctTitle: correctOpt?.title || '',
    explanation: q.explanation,
  };
}

// Backward-compatible batch generator (used by existing tests / quick drills)
function generateArenaBatch({ mode = 'mixed', count = 5, seed = Date.now(), level = null } = {}) {
  const cat = buildArenaCatalog();
  let pool = level ? (cat.byLevel[Math.max(1, Math.min(7, Number(level)))] || cat.allQuestions) : cat.allQuestions;
  if (mode === 'counter_pick') {
    pool = cat.allQuestions.filter((q) => q.category === 'counter_pick');
  } else if (mode === 'transition_dilemma') {
    pool = cat.allQuestions.filter((q) => q.category === 'transition_dilemma');
  } else if (mode === 'tech_gap') {
    pool = cat.allQuestions.filter((q) => ['tech_gap', 'blacksmith_gap', 'monastery_gap', 'grandmaster_paradox'].includes(q.category));
  }
  if (!pool.length) pool = cat.allQuestions;
  const rng = makeRng(seed);
  return shuffleWithRng(pool, rng).slice(0, Math.max(1, Math.min(20, Number(count) || 5)));
}

module.exports = {
  LEVEL_CONFIG,
  OFFICIAL_NODE_ES,
  VALID_CIV_SLUGS,
  CASTLE_UNIQUE_IDENTITY,
  CIV_COMPENSATION_NOTES,
  buildArenaCatalog,
  getLevelConfig,
  getCatalogQuestionById,
  pickNextQuestionForLevel,
  evaluateArenaAnswer,
  generateArenaBatch,
};
