'use strict';

(function initTrainingUi(root) {
  /**
   * Relic · Entrenamiento v5 (Beta · Exclusivo Ultra)
   * - Pestaña inicial = Arena (Campaña de 7 Unidades · +400 preguntas verificadas · 3 vidas / bloqueo 24 h).
   * - Pop-up de bienvenida a escala completa con arte pintado de 210 px y aire generoso.
   * - Creador visual con Escudo de Civilización + Tarjeta de Bonos Oficiales arriba de la paleta de íconos.
   * - Evolución con Gráfico de Araña Hexagonal + Gráfico de Líneas (100 % real de tus replays, cero ELO inventado).
   * - Cola interactiva "★ Quiero entrenar esto" conectada desde Central y Postmatch.
   * - Nomenclatura 100 % oficial AoE2:DE · 0 imágenes rotas · 0 estilos inline (100 % CSP-safe).
   */

  const WELCOME_STORAGE_KEY = 'relic_training_welcome_seen_v5';

  // 56 civilizaciones estándar verificadas con árbol tecnológico oficial
  const CIV_NAMES_ES = {
    armenians: 'Armenios', aztecs: 'Aztecas', bengalis: 'Bengalíes', berbers: 'Bereberes',
    bohemians: 'Bohemios', britons: 'Britanos', bulgarians: 'Búlgaros', burgundians: 'Borgoñones',
    burmese: 'Birmanos', byzantines: 'Bizantinos', celts: 'Celtas', chinese: 'Chinos',
    cumans: 'Cumanos', danes: 'Daneses', dravidians: 'Dravídicos', ethiopians: 'Etíopes',
    franks: 'Francos', georgians: 'Georgianos', goths: 'Godos', gurjaras: 'Gurjaras',
    hindustanis: 'Indostanos', huns: 'Hunos', incas: 'Incas', italians: 'Italianos',
    japanese: 'Japoneses', jurchens: 'Yurchen', khitans: 'Kitán', khmer: 'Jemeres',
    koreans: 'Coreanos', lithuanians: 'Lituanos', magyars: 'Magiares', malay: 'Malayos',
    malians: 'Malíes', mapuche: 'Mapuches', mayans: 'Mayas', mongols: 'Mongoles',
    muisca: 'Muiscas', persians: 'Persas', poles: 'Polacos', portuguese: 'Portugueses',
    romans: 'Romanos', saracens: 'Sarracenos', saxons: 'Sajones', shu: 'Shu',
    sicilians: 'Sicilianos', slavs: 'Eslavos', spanish: 'Españoles', tatars: 'Tártaros',
    teutons: 'Teutones', tupi: 'Tupíes', turks: 'Turcos', varangians: 'Varegos',
    vietnamese: 'Vietnamitas', vikings: 'Vikingos', wei: 'Wei', wu: 'Wu',
  };

  const BO_ACTION_PALETTE = [
    {
      category: 'gather',
      label: 'Caza y Recursos',
      icon: 'assets/icons/boar.png',
      items: [
        { id: 'g_sheep', label: '6 a Ovejas', chipImg: 'assets/icons/sheep.png', icons: ['sheep', 'villager'], age: 1, allocDelta: { food: 6 }, title: '6 Aldeanos a ovejas bajo el Centro Urbano', note: 'Cola continua de aldeanos.' },
        { id: 'g_boar1', label: '1.er Jabalí', chipImg: 'assets/icons/boar.png', icons: ['boar', 'food'], age: 1, allocDelta: { food: 1 }, title: 'Atraé el 1.er Jabalí al Centro Urbano', note: '2 flechas y guarnecé si baja su salud.' },
        { id: 'g_boar2', label: '2.º Jabalí', chipImg: 'assets/icons/boar.png', icons: ['boar', 'food'], age: 1, allocDelta: { food: 1 }, title: 'Atraé el 2.º Jabalí (al 40 % del 1.º)', note: 'Evitá que se pudra la caza.' },
        { id: 'g_deer', label: 'Empujar Ciervos', chipImg: 'assets/icons/food.png', icons: ['food', 'scout'], age: 1, allocDelta: { food: 1 }, title: 'Empujá Ciervos al CU con el Explorador', note: 'Ahorra madera antes de granjas.' },
        { id: 'g_berries', label: '4 a Bayas', chipImg: 'assets/icons/berries.png', icons: ['berries', 'food'], age: 1, allocDelta: { food: 4 }, title: 'Molino en bayas con 4 Aldeanos', note: 'Recolección estable de arbustos.' },
        { id: 'g_farms', label: 'Sembrar Granjas', chipImg: 'assets/icons/postmatch/farms.webp', icons: ['food', 'wood'], age: null, allocDelta: { food: 2 }, title: 'Sembrá Granjas junto al CU o Molino', note: 'Cada 60 de madera libre → granja.' },
        { id: 'g_wood', label: 'Talar Madera', chipImg: 'assets/icons/wood.png', icons: ['wood', 'villager'], age: null, allocDelta: { wood: 3 }, title: 'Aldeanos a madera en Campamento maderero', note: 'Renová campamento si caminan >3 casillas.' },
        { id: 'g_gold', label: 'Extraer Oro', chipImg: 'assets/icons/gold.png', icons: ['gold', 'villager'], age: null, allocDelta: { gold: 3 }, title: 'Aldeanos a Oro en Campamento minero', note: 'Para mejoras y avance de edad.' },
        { id: 'g_stone', label: 'Extraer Piedra', chipImg: 'assets/icons/stone.png', icons: ['stone', 'villager'], age: null, allocDelta: { stone: 3 }, title: 'Aldeanos a Piedra para Castillo o CU', note: 'Asegurá piedra antes de Castillos.' },
      ],
    },
    {
      category: 'buildings',
      label: 'Edificios',
      icon: 'assets/icons/building.png',
      items: [
        { id: 'b_houses', label: '2 Casas', chipImg: 'assets/icons/building.png', icons: ['building', 'villager'], age: 1, title: 'Construí 2 Casas iniciales (2+1 Aldeanos)', note: 'Evitá bloqueo de población.' },
        { id: 'b_lumber', label: 'Camp. maderero', chipImg: 'assets/icons/wood.png', icons: ['wood', 'building'], age: 1, title: 'Campamento maderero en bosque seguro', note: 'Pegado a los árboles.' },
        { id: 'b_mill', label: 'Molino', chipImg: 'assets/icons/berries.png', icons: ['berries', 'building'], age: 1, title: 'Molino pegado a las bayas', note: 'Habilita granjas y Collera.' },
        { id: 'b_mining', label: 'Camp. minero', chipImg: 'assets/icons/gold.png', icons: ['gold', 'building'], age: 1, title: 'Campamento minero a 1 casilla del oro', note: 'Dejá espacio para evitar bloqueos.' },
        { id: 'b_barracks', label: 'Cuarteles', chipImg: 'assets/icons/barracks.png', icons: ['barracks', 'building'], age: 1, title: 'Cuarteles durante la subida a Feudal', note: 'Requisito para Establo y Galería.' },
        { id: 'b_stable', label: 'Establo', chipImg: 'assets/icons/stable.png', icons: ['stable', 'scout'], age: 2, title: 'Establo al entrar en Edad Feudal', note: 'Caballería de exploración / Caballeros.' },
        { id: 'b_archery', label: 'Galería', chipImg: 'assets/icons/archer.png', icons: ['archer', 'building'], age: 2, title: 'Galería de tiro con arco', note: 'Producción constante de Arqueros.' },
        { id: 'b_blacksmith', label: 'Herrería', chipImg: 'assets/icons/blacksmith.png', icons: ['blacksmith', 'shield'], age: 2, title: 'Herrería para ataque y armadura', note: 'Requisito para Edad de los Castillos.' },
        { id: 'b_market', label: 'Mercado', chipImg: 'assets/icons/market.png', icons: ['market', 'gold'], age: 2, title: 'Mercado para equilibrar recursos', note: 'Vender excedente o habilitar Castillos.' },
        { id: 'b_siege', label: 'Taller de asedio', chipImg: 'assets/icons/gunpowder.png', icons: ['gunpowder', 'building'], age: 3, title: 'Taller de maquinaria de asedio', note: 'Manganas, Escorpiones o Arietes.' },
        { id: 'b_monastery', label: 'Monasterio', chipImg: 'assets/icons/relic.png', icons: ['relic', 'building'], age: 3, title: 'Monasterio para Monjes y Reliquias', note: 'Defensa anti-Caballeros y oro pasivo.' },
        { id: 'b_tc', label: 'Centro Urbano', chipImg: 'assets/brand/review-town-center-v1.png', icons: ['building', 'villager'], age: 3, title: 'Centro Urbano extra en madera y oro', note: '275 madera + 100 piedra.' },
        { id: 'b_castle', label: 'Castillo', chipImg: 'assets/icons/castle.png', icons: ['castle', 'stone'], age: 3, title: 'Castillo en colina o recurso clave', note: 'Control de mapa y Unidad Única.' },
      ],
    },
    {
      category: 'techs',
      label: 'Tecnologías',
      icon: 'assets/icons/blacksmith.png',
      items: [
        { id: 't_loom', label: 'Telar', chipImg: 'assets/icons/shield.png', icons: ['shield', 'villager'], age: 1, title: 'Investigar Telar (+15 PS y armadura)', note: 'Antes de hacer clic a Edad Feudal.' },
        { id: 't_feudal', label: 'Edad Feudal', chipImg: 'assets/icons/ages/feudal.png', icons: ['age', 'food'], age: 1, title: 'Clic a Edad Feudal (500 comida)', note: 'Reasigná aldeanos durante la subida.' },
        { id: 't_bitaxe', label: 'Hacha doble filo', chipImg: 'assets/icons/wood.png', icons: ['wood', 'age'], age: 2, title: 'Investigar Hacha de doble filo (+20 % tala)', note: 'Prioridad #1 al llegar a Feudal.' },
        { id: 't_horsecollar', label: 'Collera', chipImg: 'assets/icons/postmatch/farms.webp', icons: ['food', 'wood'], age: 2, title: 'Investigar Collera (+75 comida/granja)', note: 'Antes de sembrar granjas en Feudal.' },
        { id: 't_wheelbarrow', label: 'Carretilla', chipImg: 'assets/icons/villager.png', icons: ['villager', 'food'], age: 2, title: 'Investigar Carretilla (~15 granjas)', note: '+10 % velocidad y +25 % carga.' },
        { id: 't_fletching', label: 'Emplumado', chipImg: 'assets/icons/blacksmith.png', icons: ['blacksmith', 'archer'], age: 2, title: 'Emplumado de flechas (+1 ataque y rango)', note: 'Antes del primer combate a distancia.' },
        { id: 't_forging', label: 'Forja / Armadura', chipImg: 'assets/icons/sword.png', icons: ['blacksmith', 'sword'], age: 2, title: 'Forja y Armadura en Herrería', note: 'Priorizá armadura para caballería.' },
        { id: 't_bloodlines', label: 'Pureza de sangre', chipImg: 'assets/icons/stable.png', icons: ['stable', 'shield'], age: 2, title: 'Pureza de sangre (+20 PS caballería)', note: 'Clave para escalar Establos.' },
        { id: 't_castle', label: 'Edad Castillos', chipImg: 'assets/icons/ages/castle.png', icons: ['age', 'gold'], age: 2, title: 'Clic a Castillos (800 comida, 200 oro)', note: 'Prepará mejoras en la subida.' },
        { id: 't_bowsaw', label: 'Sierra de arco', chipImg: 'assets/icons/wood.png', icons: ['wood', 'age'], age: 3, title: 'Sierra de arco (+20 % extra de tala)', note: 'Inmediata al pisar Castillos.' },
        { id: 't_bodkin', label: 'Flecha de punzón', chipImg: 'assets/icons/blacksmith.png', icons: ['blacksmith', 'archer'], age: 3, title: 'Flecha de punzón (+1 ataque y alcance)', note: 'Pico de poder de Ballesteros.' },
        { id: 't_ballistics', label: 'Balística', chipImg: 'assets/icons/postmatch/upgrades.webp', icons: ['archer', 'building'], age: 3, title: 'Universidad + Balística', note: 'Anticipa movimiento enemigo.' },
        { id: 't_handcart', label: 'Carro de mano', chipImg: 'assets/icons/villager.png', icons: ['villager', 'food'], age: 3, title: 'Carro de mano (~35 granjas)', note: 'Impulsa economía a Imperial.' },
        { id: 't_imperial', label: 'Edad Imperial', chipImg: 'assets/icons/ages/imperial.png', icons: ['age', 'castle'], age: 3, title: 'Clic a Edad Imperial (1000 C / 800 O)', note: 'Alistá producción y mejoras finales.' },
        { id: 't_bracer', label: 'Brazal', chipImg: 'assets/icons/blacksmith.png', icons: ['blacksmith', 'archer'], age: 4, title: 'Brazal en Herrería (+1 ataque y rango)', note: 'Prioridad en Edad Imperial.' },
        { id: 't_chemistry', label: 'Química', chipImg: 'assets/icons/gunpowder.png', icons: ['gunpowder', 'archer'], age: 4, title: 'Química en Universidad (+1 ataque / pólvora)', note: 'Habilita Cañón y Artillero manual.' },
      ],
    },
    {
      category: 'units',
      label: 'Unidades',
      icon: 'assets/icons/sword.png',
      items: [
        { id: 'u_militia', label: '3 Milicias', chipImg: 'assets/icons/sword.png', icons: ['sword', 'barracks'], age: 1, title: '3 Milicias en Cuarteles para presión temprana', note: 'Hostigá madera o bayas rivales.' },
        { id: 'u_maa', label: 'Hombres de armas', chipImg: 'assets/icons/sword.png', icons: ['sword', 'barracks'], age: 2, title: 'Mejorar a Hombres de armas en Feudal', note: 'Rompé empalizadas y frená economía.' },
        { id: 'u_scouts', label: 'Cab. exploración', chipImg: 'assets/brand/review-scout-v1.png', icons: ['scout', 'stable'], age: 2, title: '3–4 Caballería de exploración en Establo', note: 'Incursioná sin dejar de sembrar granjas.' },
        { id: 'u_archers', label: 'Arqueros', chipImg: 'assets/brand/review-archer-v1.png', icons: ['archer', 'gold'], age: 2, title: 'Arqueros continuos en Galería', note: 'Conservá la masa para Ballesteros.' },
        { id: 'u_skirms', label: 'Guerrilleros', chipImg: 'assets/icons/shield.png', icons: ['shield', 'archer'], age: 2, title: 'Guerrilleros contra Arqueros rivales', note: 'Sumá armadura en Herrería.' },
        { id: 'u_spears', label: 'Lanceros', chipImg: 'assets/icons/barracks.png', icons: ['barracks', 'shield'], age: 2, title: 'Lanceros en Feudal contra caballería', note: 'Protegé oro, madera y arqueros.' },
        { id: 'u_knights', label: 'Caballeros', chipImg: 'assets/brand/review-knight-v1.png', icons: ['stable', 'shield'], age: 3, title: 'Caballeros constantes en doble Establo', note: 'Con +2 armadura incursioná bajo fuego.' },
        { id: 'u_camels', label: 'Camellos', chipImg: 'assets/icons/postmatch/cavalry.webp', icons: ['stable', 'sword'], age: 3, title: 'Jinetes de camello anti-caballería', note: 'Cazan Caballeros y Exploradores.' },
        { id: 'u_ca', label: 'Arq. a caballo', chipImg: 'assets/icons/archer.png', icons: ['archer', 'scout'], age: 3, title: 'Arqueros a caballo en múltiples Galerías', note: 'Pureza de sangre + Dactilera.' },
        { id: 'u_monks', label: 'Monjes', chipImg: 'assets/brand/review-relic-monk-v1.png', icons: ['relic', 'gold'], age: 3, title: 'Monjes para conversiones y Reliquias', note: 'Cada reliquia aporta oro continuo.' },
      ],
    },
  ];

  const METRIC_HUMAN_META = {
    tcIdleDarkSec: {
      title: 'Centro Urbano · Alta Edad',
      shortRadar: 'CU Alta Edad',
      pill: 'Alta Edad Media',
      sub: 'Pausa antes de Edad Feudal',
      valSuffix: '',
      betterHint: 'Menos segundos quieto = más aldeanos al pasar a Edad Feudal',
    },
    tcIdleFeudalPerTcSec: {
      title: 'Centro Urbano · Edad Feudal',
      shortRadar: 'CU Feudal',
      pill: 'Edad Feudal',
      sub: 'Pausa media por Centro Urbano',
      valSuffix: '',
      betterHint: 'Menos pausas en Edad Feudal = economía más sólida bajo presión',
    },
    feudalSec: {
      title: 'Pase a Edad Feudal',
      shortRadar: 'Pase Feudal',
      pill: 'Edad Feudal',
      sub: 'Llegada a la 2.ª edad',
      valSuffix: '',
      betterHint: 'Llegar antes habilita presión temprana y control del mapa',
    },
    castleSec: {
      title: 'Pase a Edad de los Castillos',
      shortRadar: 'Pase Castillos',
      pill: 'Edad de los Castillos',
      sub: 'Llegada a la 3.ª edad',
      valSuffix: '',
      betterHint: 'Entrar antes desbloquea Centros Urbanos adicionales y pico militar',
    },
    dbaDelaySec: {
      title: 'Hacha de doble filo',
      shortRadar: 'Hacha doble filo',
      pill: 'Hacha de doble filo',
      sub: 'Demora tras llegar a Feudal',
      valSuffix: '',
      betterHint: 'Investigarla al instante al pisar Feudal acelera toda tu madera',
    },
    eapm: {
      title: 'Ritmo efectivo (eAPM)',
      shortRadar: 'Ritmo efectivo',
      pill: 'Ritmo efectivo',
      sub: 'Acciones útiles por minuto',
      valSuffix: '',
      betterHint: 'Mayor ritmo sostenido mejora tu respuesta táctica y económica',
    },
  };

  function esc(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveAsset(val, fallback = 'assets/icons/target.png') {
    const raw = String(val || '').trim();
    if (!raw) return fallback;
    if (raw.startsWith('assets/')) return raw;
    if (/\.(png|webp|jpg|svg)$/i.test(raw)) return `assets/icons/${raw}`;
    return `assets/icons/${raw}.png`;
  }

  function resolveCivCrest(slug) {
    let norm = String(slug || 'franks').trim().toLowerCase();
    if (norm === 'tupis') norm = 'tupi';
    if (!CIV_NAMES_ES[norm]) norm = 'franks';
    return `assets/civs/${norm}.png`;
  }

  function fmtClock(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const total = Math.round(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function fmtCountdownMs(ms) {
    const totalSec = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function playSfx(method) {
    try {
      if (root.UiSfx && typeof root.UiSfx.play === 'function') {
        root.UiSfx.play(method);
      } else if (root.UiSfx && typeof root.UiSfx[method] === 'function') {
        root.UiSfx[method]();
      }
    } catch (_) {}
  }

  function hasSeenWelcome() {
    try {
      return Boolean(root.localStorage && root.localStorage.getItem(WELCOME_STORAGE_KEY) === '1');
    } catch (_) {
      return true;
    }
  }

  function markWelcomeSeen() {
    try {
      if (root.localStorage) root.localStorage.setItem(WELCOME_STORAGE_KEY, '1');
    } catch (_) {}
  }

  function cloneRecipeForDraft(rec) {
    const src = rec || {};
    return {
      id: src.isCustom ? src.id : '',
      isCustom: Boolean(src.isCustom),
      name: src.name || 'Mi Orden Personalizada',
      shortName: src.shortName || src.name || 'Mi Orden',
      civSlug: String(src.civSlug || '').toLowerCase(),
      mapName: src.mapName || 'Arabia',
      mapSlug: src.mapSlug || 'arabia',
      artClass: src.artClass || 'is-art-scouts',
      targetFeudalSec: Number(src.targetFeudalSec || 580),
      targetCastleSec: Number(src.targetCastleSec || 1120),
      summary: src.summary || 'Orden personalizada para el Overlay.',
      steps: Array.isArray(src.steps) && src.steps.length
        ? src.steps.map((st, idx) => ({
            id: st.id || `st_${idx + 1}`,
            age: Number(st.age || 1),
            pop: String(st.pop || '06/05'),
            gameSec: Number(st.gameSec || 0),
            alloc: {
              food: Number(st.alloc?.food || 0),
              wood: Number(st.alloc?.wood || 0),
              gold: Number(st.alloc?.gold || 0),
              stone: Number(st.alloc?.stone || 0),
            },
            icons: Array.isArray(st.icons) && st.icons.length ? [...st.icons] : ['villager'],
            title: String(st.title || st.text || `Paso ${idx + 1}`),
            text: String(st.title || st.text || `Paso ${idx + 1}`),
            note: String(st.note || ''),
          }))
        : [
            {
              id: 'st_1',
              age: 1,
              pop: '06/05',
              gameSec: 0,
              alloc: { food: 6, wood: 0, gold: 0, stone: 0 },
              icons: ['sheep', 'villager'],
              title: '2 Casas y 6 Aldeanos a ovejas',
              text: '2 Casas y 6 Aldeanos a ovejas',
              note: 'Cola continua de aldeanos desde 00:00.',
            },
          ],
    };
  }

  function createTrainingUi({ container, goTo, onNavigateToPlanes, onClaimTrial }) {
    const navToPlanes = typeof onNavigateToPlanes === 'function'
      ? onNavigateToPlanes
      : (typeof goTo === 'function' ? () => goTo('plans') : null);

    let state = null;
    // DEFAULT TAB = EVOLUCIÓN (Visual Spider Radar + Trend Line Curve; Arena is NEVER first)
    let activeSubtab = 'perf';
    let showWelcomeModal = !hasSeenWelcome();

    // Evolución chart state
    let selectedTrendMetricKey = 'tcIdleDarkSec';

    // Studio & Pacer runtime state (2-mode clean UX: browse/arm vs edit steps)
    let studioEditMode = false;
    let draftRecipe = null;
    let selectedStepIdx = 0;
    let activePaletteCategory = 'gather';
    let paletteClickMode = 'append';
    let studioStatusMsg = '';
    let pacerTimer = null;
    let pacerRunning = false;
    let pacerElapsedSec = 0;
    let pacerLastTs = 0;
    let pacerLastStepIdx = 0;
    let pacerWarnedStepIdx = -1;

    // Arena Campaign Game State (server-authoritative 7-tier progression + 24h lockout)
    let arenaQuestion = null;
    let arenaSelectedLevel = null;
    let arenaAnswerResult = null;
    let arenaPickedOptionId = null;
    let arenaSubmitting = false;
    let arenaLoading = false;
    let arenaTimerHandle = null;
    let arenaTimeTotalMs = 28000;
    let arenaTimeLeftMs = 28000;
    let arenaLockoutTimer = null;
    let arenaUnlockBanner = null;
    let arenaLeavePenaltyMsg = null;

    // Árbol de Tecnología Oficial AoE2:DE (carga perezosa al abrir la pestaña)
    const techTreeCtrl = root.TechTreeUI && typeof root.TechTreeUI.createTechTreeController === 'function'
      ? root.TechTreeUI.createTechTreeController({ onStateChange: () => render() })
      : null;
    let techTreeLoadPromise = null;

    async function ensureTechTreeLoaded() {
      if (!techTreeCtrl || techTreeCtrl.ui.data) return;
      if (techTreeLoadPromise) return techTreeLoadPromise;
      if (typeof root.settings?.trainingTechTreeGet !== 'function') {
        techTreeCtrl.setError('Servicio de árbol no disponible.');
        render();
        return;
      }
      techTreeCtrl.setLoading(true);
      render();
      techTreeLoadPromise = root.settings.trainingTechTreeGet()
        .then((res) => {
          if (res?.ok && res.data) {
            const prefCiv = state?.matchupWarRoom?.myCivSlug || state?.pacer?.selectedCiv || 'franks';
            techTreeCtrl.setData(res.data, prefCiv);
          } else {
            techTreeCtrl.setError(res?.error || 'No se pudo cargar el árbol.');
          }
        })
        .catch((err) => {
          techTreeCtrl.setError(err?.message || 'Error al cargar el árbol.');
        })
        .finally(() => {
          techTreeLoadPromise = null;
          render();
        });
      return techTreeLoadPromise;
    }

    function stopPacerClock() {
      if (pacerTimer) { clearInterval(pacerTimer); pacerTimer = null; }
      pacerRunning = false;
    }

    function stopArenaTimer() {
      if (arenaTimerHandle) { clearInterval(arenaTimerHandle); arenaTimerHandle = null; }
    }

    function stopLockoutTimer() {
      if (arenaLockoutTimer) { clearInterval(arenaLockoutTimer); arenaLockoutTimer = null; }
    }

    function ensureLockoutCountdown() {
      stopLockoutTimer();
      const arena = state?.arena;
      if (!arena?.locked || !arena.lockedUntilTs) return;
      arenaLockoutTimer = setInterval(async () => {
        const rem = Math.max(0, Number(state?.arena?.lockedUntilTs || 0) - Date.now());
        const elClock = container.querySelector('#trLockoutClock');
        if (elClock) elClock.textContent = fmtCountdownMs(rem);
        if (rem <= 0) {
          stopLockoutTimer();
          if (typeof root.settings?.trainingArenaStatus === 'function') {
            const res = await root.settings.trainingArenaStatus();
            if (res?.ok && res.arena) {
              state.arena = res.arena;
              arenaQuestion = null;
              arenaAnswerResult = null;
              render();
            }
          }
        }
      }, 1000);
    }

    function beginQuestionTimer(resumeFromMs = null) {
      stopArenaTimer();
      if (!arenaQuestion || arenaAnswerResult || state?.arena?.locked || showWelcomeModal || activeSubtab !== 'arena') return;
      const totalMs = Math.max(15, Number(arenaQuestion.timerSec || 25)) * 1000;
      arenaTimeTotalMs = totalMs;
      const startRem = resumeFromMs != null ? Math.max(1500, Math.min(totalMs, resumeFromMs)) : totalMs;
      arenaTimeLeftMs = startRem;
      const deadline = Date.now() + startRem;
      let lastWarnSec = -1;
      arenaTimerHandle = setInterval(() => {
        if (!arenaQuestion || arenaAnswerResult || showWelcomeModal || activeSubtab !== 'arena' || state?.arena?.locked) {
          stopArenaTimer();
          return;
        }
        arenaTimeLeftMs = Math.max(0, deadline - Date.now());
        const secLeft = Math.ceil(arenaTimeLeftMs / 1000);
        if (secLeft <= 4 && secLeft > 0 && secLeft !== lastWarnSec) {
          lastWarnSec = secLeft;
          playSfx('paceTick');
        }
        const bar = container.querySelector('#trArenaTimerFill');
        if (bar) {
          bar.setAttribute('width', String(Math.round((arenaTimeLeftMs / arenaTimeTotalMs) * 1000)));
          bar.setAttribute('fill', arenaTimeLeftMs < 5000 ? '#ef8a81' : '#d6b875');
        }
        if (arenaTimeLeftMs <= 0) {
          stopArenaTimer();
          submitArenaChoice(null, true);
        }
      }, 100);
    }

    async function fetchNextArenaQuestion(levelOverride = null) {
      if (!state?.unlocked || typeof root.settings?.trainingArenaNext !== 'function' || arenaLoading) return;
      arenaLoading = true;
      stopArenaTimer();
      arenaAnswerResult = null;
      arenaPickedOptionId = null;
      arenaUnlockBanner = null;
      arenaLeavePenaltyMsg = null;
      try {
        const reqLevel = levelOverride || arenaSelectedLevel || state?.arena?.selectedLevel || state?.arena?.unlockedLevel || 1;
        const res = await root.settings.trainingArenaNext({ level: reqLevel });
        if (res?.arena) state.arena = res.arena;
        if (res?.ok && res.question) {
          arenaQuestion = res.question;
          arenaSelectedLevel = res.question.level;
          arenaTimeTotalMs = Math.max(15, Number(res.question.timerSec || 25)) * 1000;
          arenaTimeLeftMs = arenaTimeTotalMs;
        } else {
          arenaQuestion = null;
        }
      } finally {
        arenaLoading = false;
      }
      render();
      if (state?.arena?.locked) ensureLockoutCountdown();
      else if (arenaQuestion && !showWelcomeModal && activeSubtab === 'arena') beginQuestionTimer();
    }

    async function submitArenaChoice(optionId, timedOut = false) {
      if (!arenaQuestion || arenaSubmitting || state?.arena?.locked) return;
      if (arenaAnswerResult) {
        await fetchNextArenaQuestion(arenaSelectedLevel);
        return;
      }
      if (typeof root.settings?.trainingArenaAnswer !== 'function') return;
      arenaSubmitting = true;
      stopArenaTimer();
      arenaPickedOptionId = optionId;
      try {
        const res = await root.settings.trainingArenaAnswer({
          questionId: arenaQuestion.id,
          selectedOptionId: optionId,
          timedOut,
        });
        if (res?.arena) state.arena = res.arena;
        if (res?.rank) state.rank = res.rank;
        if (res?.ok) {
          arenaAnswerResult = res;
          if (res.isCorrect) {
            playSfx(res.leveledUp || res.prestigeUp ? 'confirm' : 'quizHit');
            if (res.leveledUp && res.unlockedUnit) {
              arenaUnlockBanner = res.unlockedUnit;
              arenaSelectedLevel = state.arena.unlockedLevel;
            }
          } else {
            playSfx('quizMiss');
          }
        }
      } finally {
        arenaSubmitting = false;
      }
      render();
      if (state?.arena?.locked) ensureLockoutCountdown();
    }

    /**
     * Anti-trampa de Arena: la navegación queda siempre libre, pero si salís de Arena
     * mientras hay una pregunta activa sin responder, se descarta la pregunta y perdés 1 vida.
     */
    async function handleLeaveArena() {
      stopArenaTimer();
      if (arenaQuestion && !arenaAnswerResult && !arenaSubmitting && !state?.arena?.locked) {
        const abandonedId = arenaQuestion.id;
        arenaQuestion = null;
        arenaAnswerResult = null;
        arenaPickedOptionId = null;
        arenaUnlockBanner = null;
        arenaLeavePenaltyMsg = 'Saliste de Arena durante una pregunta activa: perdiste 1 vida y se descartó el desafío.';
        if (typeof root.settings?.trainingArenaAnswer === 'function' && abandonedId) {
          arenaSubmitting = true;
          try {
            const res = await root.settings.trainingArenaAnswer({
              questionId: abandonedId,
              selectedOptionId: null,
              timedOut: true,
            });
            if (res?.arena) state.arena = res.arena;
            if (res?.rank) state.rank = res.rank;
          } catch (_) { /* ignore */ } finally {
            arenaSubmitting = false;
          }
        }
        render();
        if (state?.arena?.locked) ensureLockoutCountdown();
      } else if (arenaQuestion && arenaAnswerResult) {
        arenaQuestion = null;
        arenaAnswerResult = null;
        arenaPickedOptionId = null;
      }
    }

    function computeActiveStep(recipe) {
      const steps = recipe?.steps || [];
      if (!steps.length) return { idx: 0, step: null, next: null };
      if (!pacerRunning && pacerElapsedSec === 0) {
        const clamped = Math.max(0, Math.min(steps.length - 1, selectedStepIdx));
        return { idx: clamped, step: steps[clamped], next: steps[clamped + 1] || null };
      }
      let idx = 0;
      for (let i = 0; i < steps.length; i += 1) {
        if (pacerElapsedSec >= steps[i].gameSec) idx = i;
      }
      selectedStepIdx = idx;
      return { idx, step: steps[idx], next: steps[idx + 1] || null };
    }

    function ensureDraftSynced() {
      const rec = state?.pacer?.selectedRecipe;
      if (!rec) return;
      if (!draftRecipe || (rec.id || rec.key) !== (draftRecipe.sourceKey || draftRecipe.id)) {
        draftRecipe = cloneRecipeForDraft(rec);
        draftRecipe.sourceKey = rec.id || rec.key;
        selectedStepIdx = 0;
      }
    }

    /* ==================== FULL-THEATER WELCOME POP-UP ==================== */
    function renderWelcomeModal() {
      if (!showWelcomeModal || !state?.unlocked) return '';
      return `<div class="tr-welcome-backdrop" id="trWelcomeBackdrop" role="dialog" aria-modal="true" aria-label="Bienvenida a Entrenamiento">
        <div class="tr-welcome-modal">
          <button type="button" class="tr-welcome-x" id="trWelcomeXBtn" aria-label="Cerrar">×</button>
          <div class="tr-welcome-head">
            <img class="tr-welcome-emblem" src="assets/brand/relic-icon.png" alt="Relic" draggable="false" />
            <div>
              <span class="eyebrow">ENTRENAMIENTO · RELIC ULTRA</span>
              <h2>Tu centro de entrenamiento competitivo</h2>
              <p class="tr-welcome-sub">Elegí por dónde empezar hoy según tu historial y tus objetivos.</p>
            </div>
          </div>

          <div class="tr-welcome-cards">
            <button type="button" class="tr-welcome-card is-featured" data-tr-welcome-go="perf">
              <div class="tr-wc-art">
                <img src="assets/art/postmatch-v3-cabecera.webp" alt="" draggable="false" />
                <img class="tr-wc-icon" src="assets/icons/postmatch/tempo.webp" alt="" draggable="false" />
                <span class="tr-wc-pill is-gold">PROGRESO</span>
              </div>
              <div class="tr-wc-body">
                <strong>Evolución · Radar y Curvas</strong>
                <small>Gráfico de araña, evolución por partida y tus objetivos en Mi Plan.</small>
              </div>
            </button>

            <button type="button" class="tr-welcome-card" data-tr-welcome-go="orders">
              <div class="tr-wc-art">
                <img src="assets/art/apertura-scouts.webp" alt="" draggable="false" />
                <img class="tr-wc-icon" src="assets/brand/opening-v1.png" alt="" draggable="false" />
                <span class="tr-wc-pill">EN VIVO</span>
              </div>
              <div class="tr-wc-body">
                <strong>Creador en Overlay</strong>
                <small>Armá build orders visuales con los bonos de tu civilización y seguilas arriba en partida.</small>
              </div>
            </button>

            <button type="button" class="tr-welcome-card" data-tr-welcome-go="arena">
              <div class="tr-wc-art">
                <img src="assets/art/prematch-estandartes.webp" alt="" draggable="false" />
                <img class="tr-wc-icon" src="assets/brand/review-knight-v1.png" alt="" draggable="false" />
                <span class="tr-wc-pill">7 NIVELES</span>
              </div>
              <div class="tr-wc-body">
                <strong>Matchups &amp; Arena</strong>
                <small>Curvas de ventaja para 56 civs y la campaña de +400 preguntas con 7 unidades desbloqueables.</small>
              </div>
            </button>
          </div>

          <div class="tr-welcome-foot">
            <button type="button" class="tr-skip-link" data-tr-welcome-go="arena">Ir a la Arena →</button>
            <div class="tr-wf-right">
              <button type="button" class="tr-skip-link" id="trWelcomeSkipBtn">Saltear</button>
              <button type="button" class="btn gold tr-cta-sheen" id="trWelcomeStartBtn">Ver mi Evolución →</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    let trialAvailable = true;

    function enforceLockedState() {
      stopPacerClock();
      stopArenaTimer();
      stopLockoutTimer();
      activeSubtab = 'perf';
      studioEditMode = false;
      draftRecipe = null;
      showWelcomeModal = false;
      arenaQuestion = null;
      arenaAnswerResult = null;
      arenaPickedOptionId = null;
      arenaUnlockBanner = null;
    }

    function renderLockVeil() {
      if (state?.unlocked) return '<div class="tr-lock-veil" hidden></div>';
      const leadCopy = trialAvailable
        ? 'Probalo gratis durante 24 horas y medí tu evolución partida a partida.'
        : 'Desbloqueá Progreso, Mi Plan, Build Orders en vivo, Matchups y Arena con Relic Ultra.';
      const primaryAction = trialAvailable
        ? '<button type="button" class="tr-lock-cta" id="trLockTrialBtn">Probar 24 h gratis</button><button type="button" class="tr-lock-link" id="trLockPlanesBtn">Ver planes <span aria-hidden="true">→</span></button>'
        : '<button type="button" class="tr-lock-cta" id="trLockPlanesBtn">Ver Plan Ultra →</button>';
      return `<div class="tr-lock-veil">
        <div class="tr-lock-stage">
          <img class="tr-lock-art" src="assets/art/central-hero.jpg" alt="" draggable="false" />
          <div class="tr-lock-scrim" aria-hidden="true"></div>
          <div class="tr-lock-copy">
            <span class="tr-lock-eyebrow">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l-1.5-9L8 12l4-6 4 6 5.5-4L20 17H4zm1 2h14v2H5v-2z" fill="currentColor"/></svg>
              Relic Ultra
            </span>
            <h2>Entrená con tus propias partidas</h2>
            <p class="tr-lock-lead">${leadCopy}</p>
            <div class="tr-lock-rule" aria-hidden="true"></div>
            <ul class="tr-lock-list">
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Progreso por indicador y metas que se actualizan al jugar</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h7M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Build orders en vivo con bonos de civilización</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.2 8.7-7 10-3.8-1.3-7-5-7-10V6l7-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Matchups y counters de las 56 civilizaciones</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9L12 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Arena diaria con 7 unidades desbloqueables</span>
              </li>
            </ul>
            <div class="tr-lock-actions">
              ${primaryAction}
            </div>
          </div>
        </div>
      </div>`;
    }

    /* ==================== TAB 2: "MI PLAN" (AUTO-VERIFIED ON SUBSEQUENT REAL MATCHES) ==================== */
    function renderDumbbellSvg() {
      return '<svg class="train-pin-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 7.5v9M17.5 7.5v9M4 9.5v5M20 9.5v5M6.5 12h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    function renderPlanView() {
      const items = Array.isArray(state?.trainingQueue) ? state.trainingQueue : [];
      const pending = items.filter((i) => !i.done);
      const completed = items.filter((i) => i.done);

      const PLAN_GO_LABELS = {
        orders: 'Build Orders →',
        matchups: 'Matchups →',
        arena: 'Arena →',
        perf: 'Ver en Progreso →',
      };

      const resolvePlanGoTab = (it) => {
        const ruleType = it?.verifyRule?.type || '';
        if (['feudal_time', 'castle_time', 'tc_idle_dark', 'dba_delay'].includes(ruleType)) return 'orders';
        if (['vs_civ', 'on_map'].includes(ruleType)) return 'matchups';
        if (ruleType === 'army_upgrades') return 'arena';
        if (['tc_idle_feudal', 'tc_gap', 'eapm', 'no_town_bell', 'stage_grade', 'bow_saw'].includes(ruleType)) return 'perf';
        return ['orders', 'matchups', 'arena', 'perf'].includes(it?.targetTab) ? it.targetTab : 'perf';
      };

      const renderPendingRow = (it) => {
        const ruleLbl = it.verifyRule?.targetLabel || 'Se evalúa en tu próxima partida (≥ 12 min)';
        const trackingTxt = Number(it.attemptsAfterPin || 0) > 0
          ? `Evaluado en ${it.attemptsAfterPin} ${it.attemptsAfterPin === 1 ? 'partida' : 'partidas'}${it.lastCheckedDisplay ? ` · Último registro: ${it.lastCheckedDisplay}` : ''}`
          : 'En espera de tu próxima partida';
        const goTab = resolvePlanGoTab(it);
        const goLabel = PLAN_GO_LABELS[goTab] || 'Ver en Progreso →';
        return `<div class="tr-q-item is-tracking">
          <div class="tr-q-status-ico is-pending" title="Se actualiza automáticamente al terminar tus próximas partidas">
            ${renderDumbbellSvg()}
          </div>
          <div class="tr-q-copy">
            <div class="tr-q-head-row">
              <span class="tr-q-src">${esc(it.source || 'Relic')}</span>
              <strong>${esc(it.title)}</strong>
              ${it.metric ? `<span class="tr-q-metric mono">${esc(it.metric)}</span>` : ''}
            </div>
            <div class="tr-q-goal-line">
              <span class="tr-q-goal-pill">Meta: ${esc(ruleLbl)}</span>
              <small>${esc(trackingTxt)}</small>
            </div>
          </div>
          <div class="tr-q-actions">
            <button type="button" class="tr-q-go" data-tr-q-go="${esc(goTab)}">${esc(goLabel)}</button>
            <button type="button" class="tr-q-del" data-tr-q-del="${esc(it.id)}" title="Quitar objetivo">×</button>
          </div>
        </div>`;
      };

      const renderCompletedRow = (it) => `<div class="tr-q-item is-verified">
        <div class="tr-q-status-ico is-verified" title="Objetivo cumplido en partida">✓</div>
        <div class="tr-q-copy">
          <div class="tr-q-head-row">
            <span class="tr-q-verified-tag">✓ CUMPLIDO</span>
            <strong>${esc(it.title)}</strong>
          </div>
          <small class="tr-q-evidence">${esc(it.verifiedEvidence || 'Cumpliste este objetivo en una partida posterior.')}</small>
        </div>
        <div class="tr-q-actions">
          <button type="button" class="tr-q-del" data-tr-q-del="${esc(it.id)}" title="Archivar objetivo cumplido">×</button>
        </div>
      </div>`;

      const listBody = items.length
        ? `${completed.length ? `<div class="tr-q-section-label is-verified">CUMPLIDOS (${completed.length})</div><div class="tr-q-list">${completed.map(renderCompletedRow).join('')}</div>` : ''}
           ${pending.length ? `<div class="tr-q-section-label">EN SEGUIMIENTO (${pending.length})</div><div class="tr-q-list">${pending.map(renderPendingRow).join('')}</div>` : ''}`
        : `<div class="tr-q-empty">
            <div class="tr-q-status-ico is-pending">${renderDumbbellSvg()}</div>
            <div>
              <strong>Todavía no marcaste objetivos para entrenar</strong>
              <small>Tocá el ícono de la pesita en cualquier estadística de <b>Central</b>, <b>Postmatch</b> o <b>Progreso</b>. Relic evaluará tus próximas partidas y te avisará cuando lo cumplas.</small>
            </div>
          </div>`;

      return `<div class="tr-view${activeSubtab === 'plan' ? ' is-active' : ''}" data-tr-view="plan">
        <section class="tr-queue-card">
          <div class="tr-plan-hero">
            <img class="tr-panel-art-bg" src="assets/art/prematch-estandartes.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="tr-qc-head">
              <div>
                <span class="eyebrow">SEGUIMIENTO AUTOMÁTICO DE PARTIDAS</span>
                <h4>Objetivos de Mi Plan (${pending.length} activos · ${completed.length} cumplidos)</h4>
                <small class="tr-plan-sub">Cada objetivo se verifica solo al terminar tus próximas partidas reales.</small>
              </div>
              ${completed.length ? `<span class="tr-subtab-badge is-em">✓ ${completed.length} ${completed.length === 1 ? 'cumplido' : 'cumplidos'}</span>` : ''}
            </div>
          </div>
          ${listBody}
        </section>
      </div>`;
    }

    /* ==================== TOP COMMAND NAV (CLEAN RELIC UNDERLINE BAR · 5 CLEAR TABS) ==================== */
    const TAB_HINTS = {
      perf: 'Mirá en 2 segundos en qué fundamentos mejoraste frente a tu promedio y cómo evolucionás partida a partida.',
      plan: 'Relic sigue tus próximas partidas y te avisa cuando cumplís cada objetivo.',
      orders: 'Elegí o creá una build order visual para seguirla en vivo en el Overlay.',
      matchups: 'Elegí dos civilizaciones para ver en qué edad tenés ventaja y qué jugar.',
      arena: 'Desbloqueá las 7 unidades respondiendo desafíos de AoE2:DE (3 vidas por día).',
      techtree: 'Explorá el árbol oficial de las 56 civilizaciones, compará brechas y revisá costos y estadísticas reales.',
    };

    function renderSubnav() {
      const activeId = state?.armedBuildOrderId;
      const arena = state?.arena || {};
      const pendingQueue = (state?.trainingQueue || []).filter((i) => !i.done).length;
      const arenaTag = arena.locked ? '24h' : `Nv.${arena.unlockedLevel || 1}`;

      return `<div class="tr-nav-wrap">
        <div class="tr-nav-bar">
          <nav class="tr-tabs-row" role="tablist" aria-label="Centro de Entrenamiento">
            <button type="button" class="tr-tab${activeSubtab === 'perf' ? ' is-active' : ''}" data-tr-tab="perf" role="tab" aria-selected="${activeSubtab === 'perf'}">
              <img src="assets/icons/postmatch/tempo.webp" alt="" draggable="false" />
              <span>Progreso</span>
            </button>
            <button type="button" class="tr-tab${activeSubtab === 'plan' ? ' is-active' : ''}" data-tr-tab="plan" role="tab" aria-selected="${activeSubtab === 'plan'}">
              <span class="tr-tab-dumb" aria-hidden="true">${renderDumbbellSvg()}</span>
              <span>Mi Plan</span>
              ${pendingQueue > 0 ? `<b class="tr-tab-count mono">${pendingQueue}</b>` : ''}
            </button>
            <button type="button" class="tr-tab${activeSubtab === 'orders' ? ' is-active' : ''}" data-tr-tab="orders" role="tab" aria-selected="${activeSubtab === 'orders'}">
              <img src="assets/brand/opening-v1.png" alt="" draggable="false" />
              <span>Build Orders</span>
              ${activeId ? '<i class="tr-tab-dot" aria-hidden="true"></i>' : ''}
            </button>
            <button type="button" class="tr-tab${activeSubtab === 'matchups' ? ' is-active' : ''}" data-tr-tab="matchups" role="tab" aria-selected="${activeSubtab === 'matchups'}">
              <img src="assets/icons/postmatch/combat.webp" alt="" draggable="false" />
              <span>Matchups</span>
            </button>
            <button type="button" class="tr-tab${activeSubtab === 'arena' ? ' is-active' : ''}" data-tr-tab="arena" role="tab" aria-selected="${activeSubtab === 'arena'}">
              <img src="assets/brand/review-knight-v1.png" alt="" draggable="false" />
              <span>Arena</span>
              <em class="tr-tab-pill${arena.locked ? ' is-warn' : ''}">${arenaTag}</em>
            </button>
            <button type="button" class="tr-tab${activeSubtab === 'techtree' ? ' is-active' : ''}" data-tr-tab="techtree" role="tab" aria-selected="${activeSubtab === 'techtree'}">
              <img src="assets/icons/aoe2/b_7.png" alt="" draggable="false" />
              <span>Árbol de tecnología</span>
            </button>
          </nav>
          <button type="button" class="tr-guide-icon-btn" id="trOpenGuideBtn" title="Abrir guía rápida">?</button>
        </div>
        <p class="tr-tab-hint">${esc(TAB_HINTS[activeSubtab] || TAB_HINTS.perf)}</p>
      </div>`;
    }

    /* ==================== TAB 1 (DEFAULT): ARENA CAMPAIGN GAME ==================== */
    function renderHeartSvg(alive) {
      return `<svg class="tr-life-shield${alive ? ' is-alive' : ' is-lost'}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2L4 5.5v5.8c0 5.1 3.4 9.6 8 10.7 4.6-1.1 8-5.6 8-10.7V5.5L12 2z" fill="${alive ? '#c94f48' : 'rgba(255,255,255,0.06)'}" stroke="${alive ? '#f2d799' : 'rgba(255,255,255,0.22)'}" stroke-width="1.6"/>
        ${alive ? '<path d="M12 6.8l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#faf0d4"/>' : '<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-linecap="round"/>'}
      </svg>`;
    }

    function renderArenaView() {
      const a = state?.arena || {
        locked: false, remainingLives: 3, maxErrors: 3, unlockedLevel: 1, selectedLevel: 1,
        levelCorrectCount: 0, levelTarget: 10, unlockedUnits: [], levelsMeta: [], catalogTotal: 410,
      };
      const levels = Array.isArray(a.levelsMeta) ? a.levelsMeta : [];
      const curSelected = arenaSelectedLevel || a.selectedLevel || a.unlockedLevel || 1;
      const activeCfg = levels.find((l) => l.level === (a.unlockedLevel || 1)) || levels[0] || {
        level: 1, unitName: 'Hombre de armas', portrait: 'assets/brand/opening-v1.png', requiredCorrect: 10, rankTitle: 'Infante de Guardia',
      };
      const pctProg = a.levelTarget > 0 ? Math.min(100, Math.round(((a.levelCorrectCount || 0) / a.levelTarget) * 100)) : 0;

      const arenaQuestionActive = Boolean(arenaQuestion && !arenaAnswerResult && !a.locked);
      const selectedCfg = levels.find((l) => l.level === curSelected) || activeCfg;

      const ladderHtml = levels.map((lv) => {
        const cls = lv.unitUnlocked ? ' is-unlocked' : lv.isCurrentTarget ? ' is-next' : lv.unlocked ? ' is-playable' : ' is-locked';
        const isSel = lv.level === curSelected ? ' is-selected' : '';
        const clickable = lv.unlocked && !a.locked && !arenaQuestionActive;
        return `<button type="button" class="tr-unit-node${cls}${isSel}" ${clickable ? `data-tr-arena-level="${lv.level}"` : 'disabled'} title="Nivel ${lv.level} · ${esc(lv.unitName)} (${esc(lv.eloBand)})">
          <span class="tr-un-circle">
            <img src="${resolveAsset(lv.portrait, 'assets/brand/opening-v1.png')}" alt="" draggable="false" />
            ${lv.unitUnlocked ? '<i class="tr-un-check">✓</i>' : (!lv.unlocked ? '<img class="tr-un-lock" src="assets/icons/lock.png" alt="" draggable="false" />' : '')}
          </span>
          <small>${esc(lv.unitName)}</small>
        </button>`;
      }).join('');

      const livesHtml = [0, 1, 2].map((i) => renderHeartSvg(i < (a.remainingLives ?? 3))).join('');
      const livesStatus = a.locked
        ? 'Bloqueado 24 h'
        : a.remainingLives === 1 ? '¡Última vida hoy!' : `${a.remainingLives}/3 vidas hoy`;

      let stageContent = '';

      if (arenaUnlockBanner) {
        stageContent = `<section class="tr-unlock-celebration">
          <img class="tr-uc-bg" src="${resolveAsset(arenaUnlockBanner.art, 'assets/art/central-hero.jpg')}" alt="" draggable="false" />
          <div class="tr-uc-inner">
            <img class="tr-uc-portrait" src="${resolveAsset(arenaUnlockBanner.portrait)}" alt="" draggable="false" />
            <span class="eyebrow">¡UNIDAD DESBLOQUEADA · NIVEL ${arenaUnlockBanner.level} COMPLETADO!</span>
            <h3>${esc(arenaUnlockBanner.unitName)}</h3>
            <p>${a.masteryCompleted ? 'Completaste los 7 niveles de la Arena. Desbloqueaste el Modo Prestigio (Nivel 6 y 7).' : `Ascendiste a Nivel ${a.unlockedLevel}/7. Desafíos más exigentes te esperan.`}</p>
            <button type="button" class="btn gold tr-cta-sheen" id="trArenaNextQuestionBtn">Continuar Campaña →</button>
          </div>
        </section>`;
      } else if (a.locked) {
        stageContent = `<section class="tr-arena-lockout">
          <img class="tr-lo-bg" src="assets/art/apertura-castle.webp" alt="" draggable="false" />
          <div class="tr-lo-inner">
            <div class="tr-lo-crest"><img src="assets/icons/lock.png" alt="" draggable="false" /></div>
            <span class="eyebrow">3 ERRORES EN EL DÍA · DESCANSO OBLIGATORIO DE 24 HORAS</span>
            <h3>Las puertas de la Arena descansan por hoy</h3>
            <div class="tr-lockout-clock mono" id="trLockoutClock">${fmtCountdownMs(a.remainingMs)}</div>
            <p>Tu progreso está guardado: <b>${a.unlockedUnits?.length || 0}/7 unidades desbloqueadas</b> · Nivel ${a.unlockedLevel}/7 (${a.levelCorrectCount}/${a.levelTarget} aciertos).</p>
            <div class="tr-lo-actions">
              <button type="button" class="btn gold tr-cta-sheen" data-tr-tab="orders">Armar una Build Order en Overlay →</button>
              <button type="button" class="btn" data-tr-tab="matchups">Estudiar Matchups →</button>
            </div>
          </div>
        </section>`;
      } else if (!arenaQuestion) {
        const penaltyHtml = arenaLeavePenaltyMsg
          ? `<div class="tr-arena-penalty-note" role="status">${esc(arenaLeavePenaltyMsg)}</div>`
          : '';
        stageContent = `<section class="tr-arena-summary">
          <img class="tr-arena-summary-art" src="${resolveAsset(selectedCfg.art || activeCfg.art, 'assets/art/prematch-estandartes.webp')}" alt="" draggable="false" />
          <img class="tr-as-unit" src="${resolveAsset(selectedCfg.portrait || activeCfg.portrait)}" alt="" draggable="false" />
          <span class="eyebrow">ARENA · NIVEL ${curSelected}/7 · ${a.catalogTotal || 410} DESAFÍOS</span>
          <h3>${esc(selectedCfg.rankTitle || activeCfg.rankTitle)} · ${esc(selectedCfg.unitName || activeCfg.unitName)}</h3>
          ${penaltyHtml}
          <p>El tiempo arranca recién al tocar <b>Iniciar desafío</b>. Si salís de Arena con una pregunta activa, perdés <b>1 vida</b> y esa pregunta se descarta.</p>
          <button type="button" class="btn gold tr-cta-sheen tr-arena-start-btn" id="trArenaPlayBtn">Iniciar desafío →</button>
        </section>`;
      } else {
        const q = arenaQuestion;
        const timerW = Math.max(0, Math.round((arenaTimeLeftMs / Math.max(1, arenaTimeTotalMs)) * 1000));
        const mySide = q.myCiv
          ? `<div class="tr-civ-side"><img class="tr-civ-crest-lg" src="${resolveCivCrest(q.myCiv.slug)}" alt="" draggable="false" /><strong>${esc(q.myCiv.name)}</strong><span class="eyebrow">TU CIV</span></div>`
          : `<div class="tr-civ-side"><img class="tr-civ-crest-lg" src="${resolveAsset(q.levelConfig?.portrait || activeCfg.portrait)}" alt="" draggable="false" /><strong>Nivel ${q.level}/7</strong><span class="eyebrow">${esc(q.modeLabel)}</span></div>`;
        const rivalSide = q.rivalCiv
          ? `<div class="tr-civ-side"><img class="tr-civ-crest-lg is-rival" src="${resolveCivCrest(q.rivalCiv.slug)}" alt="" draggable="false" /><strong>${esc(q.rivalCiv.name)}</strong><span class="tr-civ-threat">${esc(q.threatLabel)}</span></div>`
          : `<div class="tr-civ-side"><img class="tr-civ-crest-lg is-age" src="${resolveAsset(q.ageIcon, 'assets/icons/ages/castle.png')}" alt="" draggable="false" /><strong>${esc(q.ageLabel || 'AoE2:DE')}</strong><span class="tr-civ-threat">${esc(q.threatLabel)}</span></div>`;

        const optHtml = (q.options || []).map((o, i) => {
          const icoSrc = o.civSlug ? resolveCivCrest(o.civSlug) : resolveAsset(o.icon, 'assets/icons/sword.png');
          let stateCls = '';
          if (arenaAnswerResult) {
            if (o.id === arenaAnswerResult.correctOptionId) stateCls = ' is-correct';
            else if (o.id === arenaPickedOptionId) stateCls = ' is-wrong';
            else stateCls = ' is-dimmed';
          }
          return `<button type="button" class="tr-ans-card${stateCls} tr-stagger-${i + 1}" data-tr-ans-id="${esc(o.id)}">
            <span class="tr-ans-key">${i + 1}</span>
            <img class="tr-ans-ico" src="${icoSrc}" alt="" draggable="false" />
            <span class="tr-ans-copy"><strong>${esc(o.title)}</strong><small>${esc(o.sub || '')}</small></span>
          </button>`;
        }).join('');

        const res = arenaAnswerResult;
        const fbMsg = res
          ? `${res.timedOut ? 'Tiempo agotado · ' : res.isCorrect ? '¡Correcto! ' : 'Incorrecto (−1 vida) · '}${res.explanation}`
          : '';

        stageContent = `<div class="tr-arena-stage">
          <img class="tr-arena-map-bg" src="assets/maps/${esc(q.mapSlug || 'arabia')}.webp" alt="" aria-hidden="true" draggable="false" />
          <svg class="tr-arena-timer" viewBox="0 0 1000 5" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="0" width="1000" height="5" fill="rgba(255,255,255,0.08)"></rect>
            <rect id="trArenaTimerFill" x="0" y="0" width="${timerW}" height="5" fill="${arenaTimeLeftMs < 5000 ? '#ef8a81' : '#d6b875'}"></rect>
          </svg>
          <div class="tr-vs-row">
            ${mySide}
            <div class="tr-vs-center">
              <div class="tr-vs-diamond"><span>VS</span></div>
              <span class="tr-arena-ctx">
                <img src="${resolveAsset(q.ageIcon, 'assets/icons/ages/castle.png')}" alt="" draggable="false" />
                <span>${esc(q.mapName)} · ${esc(q.levelConfig?.difficultyLabel || `Nivel ${q.level}`)}</span>
              </span>
            </div>
            ${rivalSide}
          </div>
          <p class="tr-arena-prompt">${esc(q.prompt)}</p>
        </div>

        <div class="tr-arena-feedback${res && !res.isCorrect ? ' is-wrong' : ''}" id="trArenaFeedback"${res ? '' : ' hidden'}>
          <span id="trArenaFbText">${esc(fbMsg)}</span>
          <button type="button" class="btn gold tr-cta-sheen" id="trArenaNextQuestionBtn">Siguiente desafío →</button>
        </div>

        <div class="tr-ans-grid" id="trArenaOptions">${optHtml}</div>`;
      }

      return `<div class="tr-view${activeSubtab === 'arena' ? ' is-active' : ''}" data-tr-view="arena">
        <!-- Unified Compact Campaign Header (7 Units + 3 Daily Lives + Metronome) -->
        <section class="tr-campaign-bar">
          <img class="tr-panel-art-bg is-subtle" src="assets/art/wizard-umbral.webp" alt="" aria-hidden="true" draggable="false" />
          <div class="tr-cb-ladder-col">
            <div class="tr-cb-head">
              <div class="tr-cb-title-row">
                <span class="tr-lvl-pill">NV. ${a.unlockedLevel || 1}/7</span>
                <strong>${a.masteryCompleted ? `Prestigio ${a.prestigeCycles || 1} · Gran Maestro` : `Próximo desbloqueo: ${esc(activeCfg.unitName)}`}</strong>
                <span class="tr-cb-prog-txt mono">${a.levelCorrectCount || 0}/${a.levelTarget || 10} · ${a.solvedCount || 0}/${a.catalogTotal || 410}</span>
              </div>
              <div class="tr-cb-right-tools">
                <span class="tr-cb-elo-tag">${esc(activeCfg.eloBand || '')}</span>
                <span class="tr-arena-kpi"><img src="assets/icons/medal.png" alt="" draggable="false" />${a.accuracyPct != null ? `${a.accuracyPct} %` : '—'}</span>
              </div>
            </div>
            <svg class="tr-cb-bar-svg" viewBox="0 0 600 5" preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y="0" width="600" height="5" rx="2.5" fill="rgba(255,255,255,0.08)"></rect>
              <rect x="0" y="0" width="${Math.round((pctProg / 100) * 600)}" height="5" rx="2.5" fill="#e5c678"></rect>
            </svg>
            <div class="tr-unit-ladder">${ladderHtml}</div>
          </div>

          <div class="tr-cb-lives-col">
            <span class="eyebrow">VIDAS HOY</span>
            <div class="tr-lives-row">${livesHtml}</div>
            <strong class="tr-lives-lbl${a.remainingLives <= 1 ? ' is-danger' : ''}">${livesStatus}</strong>
            <small>Racha ${a.currentStreak || 0} · Récord ${a.bestStreak || 0}</small>
          </div>
        </section>

        ${stageContent}
      </div>`;
    }

    /* ==================== TAB 2: CREADOR VISUAL + BONOS DE CIV + OVERLAY ==================== */
    function renderOrdersView() {
      ensureDraftSynced();
      const pacer = state?.pacer || {};
      const rec = draftRecipe || pacer.selectedRecipe || { name: 'Caballería de exploración', steps: [] };
      const activeId = state?.armedBuildOrderId;
      const currentBuildId = rec.id || rec.key || pacer.selectedRecipe?.id || pacer.selectedRecipe?.key || 'scouts-20pop';
      const isArmed = Boolean(activeId && String(activeId) === String(currentBuildId));
      const isLiveTesting = Boolean(state?.liveOverlayTestActive);

      const { idx, step, next } = computeActiveStep(rec);
      const st = step || { title: 'Lista para iniciar', note: '', pop: '06/05', age: 1, gameSec: 0, alloc: { food: 6, wood: 0, gold: 0, stone: 0 }, icons: ['sheep', 'villager'] };
      const alloc = st.alloc || { food: 6, wood: 0, gold: 0, stone: 0 };
      const totalVills = alloc.food + alloc.wood + alloc.gold + alloc.stone;
      const displayClockSec = pacerRunning || pacerElapsedSec > 0 ? pacerElapsedSec : Number(st.gameSec || 0);

      const selectedCivSlug = String(rec.civSlug || pacer.selectedCiv || 'franks').toLowerCase();
      const civGuideObj = (state?.civBonusesMap && state.civBonusesMap[selectedCivSlug]) || null;

      const recipeOpts = (pacer.recipes || []).map((r) => {
        const rId = r.id || r.key;
        const prefix = r.isCustom ? '★ ' : '';
        return `<option value="${esc(rId)}"${rId === (pacer.selectedRecipe?.id || pacer.selectedRecipe?.key) ? ' selected' : ''}>${prefix}${esc(r.name)}</option>`;
      }).join('');

      const civOpts = ['<option value="">Cualquier civilización</option>']
        .concat(Object.entries(CIV_NAMES_ES).sort((a, b) => a[1].localeCompare(b[1])).map(([slug, label]) =>
          `<option value="${esc(slug)}"${slug === selectedCivSlug ? ' selected' : ''}>${esc(label)}</option>`
        )).join('');

      const ageImg = st.age === 4 ? 'assets/brand/imperial-v1.png'
        : st.age === 3 ? 'assets/brand/castle-v1.png'
        : st.age === 2 ? 'assets/brand/feudal-v1.png'
        : 'assets/icons/ages/dark.png';

      const hudStepIcons = (st.icons || ['villager']).map((ic) => `<img src="${resolveAsset(ic, 'assets/icons/villager.png')}" alt="" draggable="false" />`).join('');
      const artClass = rec.artClass || 'is-art-scouts';

      const ageStepsCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const s of (rec.steps || [])) {
        const a = Number(s.age || 1);
        ageStepsCount[a] = (ageStepsCount[a] || 0) + 1;
      }
      const ageMilestonesHtml = [
        { age: 1, name: 'Alta Edad', icon: 'assets/icons/ages/dark.png', count: ageStepsCount[1] },
        { age: 2, name: 'Feudal', icon: 'assets/icons/ages/feudal.png', count: ageStepsCount[2] },
        { age: 3, name: 'Castillos', icon: 'assets/icons/ages/castle.png', count: ageStepsCount[3] },
        { age: 4, name: 'Imperial', icon: 'assets/icons/ages/imperial.png', count: ageStepsCount[4] },
      ].map((m) => `<div class="tr-age-mile${st.age === m.age ? ' is-current' : st.age > m.age ? ' is-done' : ''}">
        <img src="${m.icon}" alt="" draggable="false" />
        <strong>${m.name}</strong>
        <span class="mono">${m.count}</span>
      </div>`).join('');

      const stepsListHtml = (rec.steps || []).map((s, i) => {
        const cls = i === idx ? ' is-current' : '';
        const a = s.alloc || { food: 0, wood: 0, gold: 0, stone: 0 };
        const iconsHtml = (s.icons || ['villager']).slice(0, 2).map((ic) =>
          `<img src="${resolveAsset(ic, 'assets/icons/villager.png')}" alt="" draggable="false" />`
        ).join('');
        return `<button type="button" class="tr-step-row${cls}" data-tr-step-jump="${i}">
          <span class="tr-step-row-icons">${iconsHtml}</span>
          <div class="tr-step-row-main">
            <strong>${esc(s.title)}</strong>
            <div class="tr-step-row-badges">
              <span class="tr-badge-time">${fmtClock(s.gameSec)}</span>
              <span class="tr-badge-pop">${esc(s.pop)}</span>
              <span class="tr-badge-res"><img src="assets/icons/food.png" alt="" />${a.food || 0}</span>
              <span class="tr-badge-res"><img src="assets/icons/wood.png" alt="" />${a.wood || 0}</span>
              <span class="tr-badge-res"><img src="assets/icons/gold.png" alt="" />${a.gold || 0}</span>
              ${a.stone ? `<span class="tr-badge-res"><img src="assets/icons/stone.png" alt="" />${a.stone}</span>` : ''}
            </div>
          </div>
        </button>`;
      }).join('');

      const activeCatObj = BO_ACTION_PALETTE.find((c) => c.category === activePaletteCategory) || BO_ACTION_PALETTE[0];
      const catTabsHtml = BO_ACTION_PALETTE.map((c) => `<button type="button" class="tr-cat-tab${c.category === activeCatObj.category ? ' is-active' : ''}" data-tr-pal-cat="${esc(c.category)}">
        <img src="${resolveAsset(c.icon)}" alt="" draggable="false" />
        <span>${esc(c.label)}</span>
      </button>`).join('');

      const actionChipsHtml = activeCatObj.items.map((item) => `<button type="button" class="tr-action-chip" data-tr-pal-item="${esc(item.id)}" title="${esc(item.title)}">
        <img src="${resolveAsset(item.chipImg)}" alt="" draggable="false" />
        <span>${esc(item.label)}</span>
      </button>`).join('');

      // Civ Bonuses Showcase Card right above Acciones e Íconos!
      const civBonusCardHtml = civGuideObj
        ? `<div class="tr-civ-bonuses-card">
            <img class="tr-panel-art-bg" src="assets/art/apertura-castle.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="tr-cbc-head">
              <img class="tr-cbc-shield" src="${resolveCivCrest(selectedCivSlug)}" alt="" draggable="false" />
              <div class="tr-cbc-meta">
                <span class="eyebrow">BONOS DE CIVILIZACIÓN PARA ESTA BUILD ORDER</span>
                <h4>${esc(civGuideObj.name)} <small>· ${esc(civGuideObj.role)}</small></h4>
              </div>
              <select id="trCreatorCiv" class="field tr-cbc-select" aria-label="Elegir civilización">${civOpts}</select>
            </div>
            <div class="tr-cbc-chips">
              ${(civGuideObj.bonuses || []).slice(0, 4).map((b) => `<span class="tr-cbc-chip">${esc(b)}</span>`).join('')}
            </div>
          </div>`
        : `<div class="tr-civ-bonuses-card">
            <div class="tr-cbc-head">
              <img class="tr-cbc-shield" src="assets/icons/shield.png" alt="" draggable="false" />
              <div class="tr-cbc-meta">
                <span class="eyebrow">CIVILIZACIÓN DE LA BUILD ORDER</span>
                <h4>Elegí una civilización para ver sus bonos económicos</h4>
              </div>
              <select id="trCreatorCiv" class="field tr-cbc-select" aria-label="Elegir civilización">${civOpts}</select>
            </div>
          </div>`;

      const recipesListHtml = (pacer.recipes || []).map((r) => {
        const rId = r.id || r.key;
        const isSel = String(rId) === String(pacer.selectedRecipe?.id || pacer.selectedRecipe?.key);
        const isThisArmed = Boolean(activeId && String(activeId) === String(rId));
        const rCiv = String(r.civSlug || 'franks').toLowerCase();
        return `<button type="button" class="tr-bo-card${isSel ? ' is-selected' : ''}" data-tr-select-recipe="${esc(rId)}">
          <img class="tr-bo-card-ico" src="${r.civSlug ? resolveCivCrest(rCiv) : 'assets/brand/opening-v1.png'}" alt="" draggable="false" />
          <div class="tr-bo-card-copy">
            <strong>${r.isCustom ? '★ ' : ''}${esc(r.name)}</strong>
            <small>${r.stepsCount || (r.steps || []).length || 6} pasos${r.mapName ? ` · ${esc(r.mapName)}` : ''}</small>
          </div>
          ${isThisArmed ? '<span class="tr-subtab-badge is-em">Activa</span>' : ''}
        </button>`;
      }).join('');

      const studioBodyHtml = !studioEditMode
        ? `<div class="tr-bo-browse-2col">
            <section class="tr-bo-library">
              <div class="tr-studio-panel-head">
                <h4>Tus Build Orders</h4>
                <div class="tr-studio-actions">
                  <button type="button" id="trNewBuildBtn" class="btn">+ Crear nueva</button>
                  <button type="button" id="trExtractReplayBtn" class="btn">De Replay</button>
                </div>
              </div>
              <div class="tr-bo-cards-list">${recipesListHtml}</div>
            </section>

            <section class="tr-bo-detail">
              ${civBonusCardHtml}
              <div class="tr-bo-steps-panel">
                <div class="tr-studio-panel-head">
                  <h4>Pasos de «${esc(rec.name)}» (${(rec.steps || []).length})</h4>
                  <div class="tr-studio-actions">
                    <button type="button" id="trEnterEditBtn" class="btn">✎ Editar pasos</button>
                    <button type="button" id="trCloneBuildBtn" class="btn">Duplicar</button>
                    ${rec.isCustom ? '<button type="button" id="trDeleteBuildBtn" class="btn">Eliminar</button>' : ''}
                  </div>
                </div>
                <div class="tr-steps-list">${stepsListHtml}</div>
              </div>
            </section>
          </div>`
        : `<div class="tr-edit-topbar">
            <button type="button" id="trExitEditBtn" class="btn">← Volver a la lista</button>
            <input id="trCreatorName" type="text" class="field tr-edit-name" value="${esc(rec.name)}" maxlength="75" placeholder="Nombre de tu Build Order" aria-label="Nombre de la orden" />
            <button type="button" id="trSaveBuildBtn" class="btn gold tr-cta-sheen">Guardar y Armar en Overlay</button>
          </div>
          <div class="tr-studio-2col">
            <div class="tr-studio-left">
              <div class="tr-studio-panel-head">
                <h4>Pasos (${(rec.steps || []).length})</h4>
                <div class="tr-studio-actions">
                  <button type="button" id="trAddStepBtn" class="btn">+ Paso</button>
                  <button type="button" id="trRemoveStepBtn" class="btn">− Quitar</button>
                </div>
              </div>
              <div class="tr-steps-list">${stepsListHtml}</div>
            </div>

            <div class="tr-studio-right">
              ${civBonusCardHtml}

              <div class="tr-palette-box">
                <div class="tr-palette-head">
                  <h4>Acciones e Íconos</h4>
                  <div class="tr-click-mode-switch" role="group" aria-label="Modo de clic">
                    <button type="button" class="tr-mode-chip${paletteClickMode === 'append' ? ' is-active' : ''}" data-tr-pal-mode="append">+ Nuevo paso</button>
                    <button type="button" class="tr-mode-chip${paletteClickMode === 'replace' ? ' is-active' : ''}" data-tr-pal-mode="replace">Editar #${idx + 1}</button>
                  </div>
                </div>
                <div class="tr-cat-tabs">${catTabsHtml}</div>
                <div class="tr-action-chips-grid">${actionChipsHtml}</div>
              </div>

              <div class="tr-inspector-box">
                <div class="tr-inspector-head">
                  <h4>Paso #${idx + 1}</h4>
                  <span class="tr-vills-total-pill"><img src="assets/icons/villager.png" alt="" />${totalVills} aldeanos</span>
                </div>

                <div class="tr-alloc-sculptor" role="group" aria-label="Aldeanos por recurso">
                  <div class="tr-alloc-card is-food">
                    <div class="tr-alloc-top"><img src="assets/icons/food.png" alt="" /><span>Comida</span></div>
                    <div class="tr-alloc-ctrl">
                      <button type="button" class="tr-step-adj" data-tr-adj-res="food" data-tr-adj-delta="-1">−</button>
                      <strong class="mono" id="trCntFood">${alloc.food}</strong>
                      <button type="button" class="tr-step-adj" data-tr-adj-res="food" data-tr-adj-delta="1">+</button>
                    </div>
                  </div>
                  <div class="tr-alloc-card is-wood">
                    <div class="tr-alloc-top"><img src="assets/icons/wood.png" alt="" /><span>Madera</span></div>
                    <div class="tr-alloc-ctrl">
                      <button type="button" class="tr-step-adj" data-tr-adj-res="wood" data-tr-adj-delta="-1">−</button>
                      <strong class="mono" id="trCntWood">${alloc.wood}</strong>
                      <button type="button" class="tr-step-adj" data-tr-adj-res="wood" data-tr-adj-delta="1">+</button>
                    </div>
                  </div>
                  <div class="tr-alloc-card is-gold">
                    <div class="tr-alloc-top"><img src="assets/icons/gold.png" alt="" /><span>Oro</span></div>
                    <div class="tr-alloc-ctrl">
                      <button type="button" class="tr-step-adj" data-tr-adj-res="gold" data-tr-adj-delta="-1">−</button>
                      <strong class="mono" id="trCntGold">${alloc.gold}</strong>
                      <button type="button" class="tr-step-adj" data-tr-adj-res="gold" data-tr-adj-delta="1">+</button>
                    </div>
                  </div>
                  <div class="tr-alloc-card is-stone">
                    <div class="tr-alloc-top"><img src="assets/icons/stone.png" alt="" /><span>Piedra</span></div>
                    <div class="tr-alloc-ctrl">
                      <button type="button" class="tr-step-adj" data-tr-adj-res="stone" data-tr-adj-delta="-1">−</button>
                      <strong class="mono" id="trCntStone">${alloc.stone}</strong>
                      <button type="button" class="tr-step-adj" data-tr-adj-res="stone" data-tr-adj-delta="1">+</button>
                    </div>
                  </div>
                </div>

                <div class="tr-inspector-fields-row">
                  <div class="tr-labeled-input">
                    <label for="trStepAgeInput">Edad</label>
                    <select id="trStepAgeInput" class="field">
                      <option value="1"${st.age === 1 ? ' selected' : ''}>I · Alta</option>
                      <option value="2"${st.age === 2 ? ' selected' : ''}>II · Feudal</option>
                      <option value="3"${st.age === 3 ? ' selected' : ''}>III · Castillos</option>
                      <option value="4"${st.age === 4 ? ' selected' : ''}>IV · Imperial</option>
                    </select>
                  </div>

                  <div class="tr-labeled-input">
                    <label for="trStepSecInput">Tiempo (${fmtClock(st.gameSec)})</label>
                    <div class="tr-time-stepper">
                      <button type="button" class="tr-step-adj" id="trTimeMinus15Btn" title="−15s">−15</button>
                      <input id="trStepSecInput" type="number" class="field mono" value="${Math.round(Number(st.gameSec || 0))}" min="0" max="7200" step="5" />
                      <button type="button" class="tr-step-adj" id="trTimePlus15Btn" title="+15s">+15</button>
                    </div>
                  </div>

                  <div class="tr-labeled-input">
                    <label for="trStepPopInput">Población</label>
                    <input id="trStepPopInput" type="text" class="field mono" value="${esc(st.pop)}" placeholder="12/15" />
                  </div>
                </div>

                <div class="tr-inspector-fields-stack">
                  <input id="trStepTitleInput" type="text" class="field" value="${esc(st.title)}" placeholder="Texto principal en el Overlay" aria-label="Texto en el Overlay" />
                  <input id="trStepNoteInput" type="text" class="field" value="${esc(st.note)}" placeholder="Nota táctica breve (opcional)" aria-label="Nota táctica" />
                </div>
              </div>
            </div>
          </div>`;

      return `<div class="tr-view${activeSubtab === 'orders' ? ' is-active' : ''}" data-tr-view="orders">
        <section class="tr-overlay-preview-stage ${esc(artClass)}">
          <div class="tr-ov-topbar">
            <div class="tr-ov-status">
              <span class="tr-live-dot"></span>
              <span class="eyebrow">VISTA PREVIA EN OVERLAY${studioStatusMsg ? ` · ${esc(studioStatusMsg.toUpperCase())}` : ''}</span>
            </div>
            <div class="tr-ov-arm-bar">
              <button type="button" id="trPacerPlayBtn" class="btn">${pacerRunning ? '⏸ Pausar' : '▶ Simular'}</button>
              <button type="button" id="trPacerResetBtn" class="btn" title="Reiniciar reloj">↺</button>
              <button type="button" id="trTestOverlayBtn" class="btn${isLiveTesting ? ' gold' : ''}">
                ${isLiveTesting ? 'Detener prueba' : 'Probar arriba'}
              </button>
              <button type="button" id="trArmOverlayBtn" class="btn ${isArmed ? 'tr-armed-btn' : 'gold tr-cta-sheen'}" aria-pressed="${isArmed}">
                ${isArmed ? '✓ Armada en Overlay' : 'Armar en Overlay'}
              </button>
            </div>
          </div>

          <div class="tr-hud-mockup" role="region" aria-label="Vista previa del Overlay Superior">
            <div class="tr-hud-age-crest">
              <img src="${ageImg}" alt="" draggable="false" />
              <span class="mono" id="trHudClock">${fmtClock(displayClockSec)}</span>
            </div>
            <div class="tr-hud-step-main">
              <div class="tr-hud-step-head">
                <span class="tr-hud-pop-pill mono" id="trHudPop">${esc(st.pop)}</span>
                <span class="tr-step-icons">${hudStepIcons}</span>
                <strong id="trHudStepTitle">${esc(st.title)}</strong>
              </div>
              <div class="tr-hud-next-bright" id="trHudStepSub">
                ${next ? `<span class="tr-hud-next-tag mono">SIGUE ${fmtClock(next.gameSec)}</span><b>${esc(next.title)}</b>` : `<span>${esc(st.note) || 'Paso final de la orden'}</span>`}
              </div>
            </div>
            <div class="tr-hud-res-strip">
              <span class="tr-hud-res is-food"><img src="assets/icons/food.png" alt="" /><b id="trHudFood">${alloc.food}</b></span>
              <span class="tr-hud-res is-wood"><img src="assets/icons/wood.png" alt="" /><b id="trHudWood">${alloc.wood}</b></span>
              <span class="tr-hud-res is-gold"><img src="assets/icons/gold.png" alt="" /><b id="trHudGold">${alloc.gold}</b></span>
              <span class="tr-hud-res is-stone"><img src="assets/icons/stone.png" alt="" /><b id="trHudStone">${alloc.stone}</b></span>
            </div>
          </div>
        </section>

        ${studioBodyHtml}
      </div>`;
    }

    /* ==================== TAB 3: MATCHUPS (56 CIVS · PRO EMPIRICAL WAR-ROOM) ==================== */
    const iconRegistry = (typeof globalThis !== 'undefined' && globalThis.AoE2Icons)
      || (typeof require === 'function' ? (() => { try { return require('./aoe2-icons'); } catch { return null; } })() : null);

    function renderMatchupsView() {
      const lab = state?.matchupWarRoom || {};
      const myCiv = lab.myCiv || { slug: 'franks', name: 'Francos', role: 'Caballería' };
      const rivalCiv = lab.rivalCiv || { slug: 'hindustanis', name: 'Indostanos', role: 'Camellos y pólvora' };
      const mySlugNorm = String(myCiv.slug || 'franks').toLowerCase() === 'tupis' ? 'tupi' : String(myCiv.slug || 'franks').toLowerCase();
      const rivSlugNorm = String(rivalCiv.slug || 'hindustanis').toLowerCase() === 'tupis' ? 'tupi' : String(rivalCiv.slug || 'hindustanis').toLowerCase();
      const activeMapType = lab.mapType === 'closed' ? 'closed' : 'open';
      const activeMapSlug = activeMapType === 'closed' ? 'arena' : 'arabia';
      const sample = lab.sample || { tier: 'none', totalGames: 0, badgeTone: 'is-muted', badgeFull: 'Cargando muestra real…' };

      const getUnitIcon = (label, civSlug) => resolveAsset(
        iconRegistry ? iconRegistry.unitIcon(label, civSlug) : 'assets/icons/ages/castle.png',
        'assets/icons/ages/castle.png'
      );
      const getTechIcon = (label) => resolveAsset(
        iconRegistry ? iconRegistry.techIcon(label) : 'assets/icons/ages/imperial.png',
        'assets/icons/ages/imperial.png'
      );
      const getCivUuIcon = (civSlug) => resolveAsset(
        iconRegistry ? iconRegistry.civUniqueUnitIcon(civSlug) : 'assets/icons/ages/castle.png',
        'assets/icons/ages/castle.png'
      );
      const getClashIcon = (label, civSlug) => resolveAsset(
        iconRegistry ? iconRegistry.clashIcon(label, civSlug) : 'assets/icons/ages/imperial.png',
        'assets/icons/ages/imperial.png'
      );

      const civEntries = Object.entries(CIV_NAMES_ES).sort((a, b) => a[1].localeCompare(b[1]));
      const myOpts = civEntries.map(([slug, label]) => `<option value="${esc(slug)}"${slug === mySlugNorm ? ' selected' : ''}>${esc(label)}</option>`).join('');
      const rivOpts = civEntries.map(([slug, label]) => `<option value="${esc(slug)}"${slug === rivSlugNorm ? ' selected' : ''}>${esc(label)}</option>`).join('');

      const nemesisHtml = (lab.recentMatchups || []).map((m) =>
        `<button type="button" class="tr-nemesis-pill" data-tr-matchup-my="${esc(m.myCiv)}" data-tr-matchup-rival="${esc(m.rivalCiv)}">${esc(m.label)}</button>`
      ).join('');

      const gameplanHtml = (lab.gameplanByAge || []).map((g, idx) => {
        const edgeVal = Number(g.edge) || 0;
        const edgeCls = edgeVal >= 4 ? 'is-em' : (edgeVal <= -4 ? 'is-warn' : 'is-even');
        const badgeLabel = g.badgeTxt || (edgeVal >= 4 ? 'Ventaja' : (edgeVal <= -4 ? 'Cuidado' : 'Parejo'));
        const rawLine = String(g.bestLine || 'Economía y control');
        const tokens = iconRegistry
          ? iconRegistry.tokenizePlanLine(rawLine, mySlugNorm)
          : [{ raw: rawLine, short: rawLine, icon: 'assets/icons/ages/castle.png', sepBefore: null }];

        const showcaseHtml = tokens.map((tok) => {
          const sepHtml = tok.sepBefore ? `<span class="tr-unit-sep" aria-hidden="true">${esc(tok.sepBefore)}</span>` : '';
          return `${sepHtml}<div class="tr-unit-token">
            <span class="tr-unit-medallion"><img src="${resolveAsset(tok.icon, 'assets/icons/ages/castle.png')}" alt="" draggable="false" /></span>
            <strong class="tr-unit-name">${esc(tok.short || tok.raw)}</strong>
          </div>`;
        }).join('');

        const tagText = String(g.compTag || 'Medido en replays');
        const isProDirect = /\d+V–\d+D/.test(tagText);
        const hasTcPosture = /\b[123]\s*TC\b/i.test(tagText);
        const tcIconHtml = hasTcPosture
          ? `<img class="tr-inline-tc-ico" src="${getUnitIcon('2 TC', mySlugNorm)}" alt="" draggable="false" />`
          : '';

        const rivalLine = g.rivalLine ? String(g.rivalLine) : '';
        const rivalIcon = rivalLine
          ? (g.rivalIsHole ? getTechIcon(rivalLine) : getUnitIcon(rivalLine, rivSlugNorm))
          : '';
        const rivalStripHtml = rivalLine
          ? `<div class="tr-age-rival-strip${g.rivalIsHole ? ' is-hole' : ''}">
              <span class="tr-age-rival-kicker">${g.rivalIsHole ? 'BRECHA' : 'VS RIVAL'}</span>
              <span class="tr-age-rival-chip">
                <img src="${rivalIcon}" alt="" draggable="false" />
                <b>${esc(rivalLine)}</b>
              </span>
            </div>`
          : '';

        return `<article class="tr-age-plan-card ${edgeCls} tr-stagger-${idx + 1}">
        <div class="tr-age-plan-top">
          <span class="tr-age-plan-age"><img src="${resolveAsset(g.icon, 'assets/icons/ages/feudal.png')}" alt="" draggable="false" />${esc(g.ageLabel)}</span>
          <span class="tr-age-edge-badge ${edgeCls}">${esc(badgeLabel)}</span>
        </div>
        <div class="tr-unit-showcase">${showcaseHtml}</div>
        <div class="tr-age-meta-row">
          <span class="tr-comp-tag${isProDirect ? ' is-uu' : ''}">${tcIconHtml}${esc(tagText)}</span>
        </div>
        <p class="tr-age-micro">${esc(g.advice)}</p>
        ${rivalStripHtml}
      </article>`;
      }).join('');

      const clashRowsHtml = (lab.clashLines || []).map((row) => {
        const wOwn = row.impOwn > 0 ? Math.max(5, Math.min(144, Math.round((row.impOwn / 100) * 140))) : 0;
        const wRiv = row.impRival > 0 ? Math.max(5, Math.min(144, Math.round((row.impRival / 100) * 140))) : 0;
        const ownLead = row.impOwn > row.impRival;
        const rivLead = row.impRival > row.impOwn;
        const rowIcon = getClashIcon(row.label, mySlugNorm);
        return `<div class="tr-clash-row">
          <span class="tr-clash-label" title="${esc(row.label)}">
            <img class="tr-clash-ico" src="${rowIcon}" alt="" draggable="false" />
            <span>${esc(row.label)}</span>
          </span>
          <svg viewBox="0 0 300 14" width="100%" height="14" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="2" width="144" height="10" rx="5" fill="rgba(255,255,255,0.06)"></rect>
            ${wOwn > 0 ? `<rect x="${144 - wOwn}" y="2" width="${wOwn}" height="10" rx="5" fill="${ownLead ? '#78d8a6' : 'rgba(120,216,166,0.58)'}"></rect>` : ''}
            <line x1="150" y1="0" x2="150" y2="14" stroke="rgba(242,215,153,0.34)" stroke-width="1.2"></line>
            <rect x="156" y="2" width="144" height="10" rx="5" fill="rgba(255,255,255,0.06)"></rect>
            ${wRiv > 0 ? `<rect x="156" y="2" width="${wRiv}" height="10" rx="5" fill="${rivLead ? '#ef8a81' : 'rgba(239,138,129,0.58)'}"></rect>` : ''}
          </svg>
          <span class="tr-clash-vals mono"><b class="${ownLead ? 'is-own-lead' : (row.impOwn === 0 ? 'is-zero' : '')}">${row.impOwn}</b><i class="tr-clash-sep">·</i><b class="${rivLead ? 'is-riv-lead' : (row.impRival === 0 ? 'is-zero' : '')}">${row.impRival}</b></span>
        </div>`;
      }).join('');

      const empTraps = Array.isArray(lab.empiricalTraps) ? lab.empiricalTraps : [];
      const rivalHolesSlice = (lab.rivalHoles || []).slice(0, Math.max(1, 4 - empTraps.length));
      const trapsHtml = [
        ...empTraps.map((t) => {
          const isExp = t.kind === 'exploit';
          const trapIco = getUnitIcon(t.unitLabel || t.title, isExp ? rivSlugNorm : mySlugNorm);
          return `<div class="tr-trap-row ${isExp ? 'is-exploit' : 'is-risk'}">
            <span class="tr-trap-medallion ${isExp ? 'is-exploit' : 'is-risk'}"><img src="${trapIco}" alt="" draggable="false" /></span>
            <div class="tr-trap-copy">
              <div class="tr-trap-head"><span class="tr-trap-kicker ${isExp ? 'is-exploit' : 'is-risk'}">${esc(t.kicker)}</span><strong>${esc(t.title)}</strong></div>
              <small>${esc(t.detail)}</small>
            </div>
          </div>`;
        }),
        ...rivalHolesSlice.map((h) => {
          const holeIco = getTechIcon(h.es);
          const shortDesc = String(h.desc || '').split('.')[0].trim();
          return `<div class="tr-trap-row is-exploit">
            <span class="tr-trap-medallion is-hole"><img src="${holeIco}" alt="" draggable="false" /><i class="tr-hole-x" aria-hidden="true">✕</i></span>
            <div class="tr-trap-copy">
              <div class="tr-trap-head"><span class="tr-trap-kicker is-exploit">SIN MEJORA</span><strong>${esc(rivalCiv.name)} sin ${esc(h.es)}</strong></div>
              <small>${esc(shortDesc ? `${shortDesc}.` : h.desc)}</small>
            </div>
          </div>`;
        }),
      ].slice(0, 4).join('') || `<div class="tr-trap-row is-exploit">
          <span class="tr-trap-medallion is-exploit"><img src="${getCivUuIcon(mySlugNorm)}" alt="" draggable="false" /></span>
          <div class="tr-trap-copy">
            <div class="tr-trap-head"><span class="tr-trap-kicker is-exploit">ESTABLE</span><strong>Sin líneas trampa críticas</strong></div>
            <small>Ambos árboles sostienen sus transiciones naturales.</small>
          </div>
        </div>`;

      const proExamples = Array.isArray(lab.proExamples) ? lab.proExamples : [];
      const proExamplesHtml = proExamples.length
        ? `<section class="tr-pro-refs-card">
            <div class="tr-pro-refs-head">
              <div>
                <span class="eyebrow">PARTIDAS REALES DE REFERENCIA</span>
                <h4>Ejecución Pro verificada (${esc(lab.mapTypeLabel || 'Mapas Abiertos')})</h4>
              </div>
              <span class="tr-sample-pill ${esc(sample.badgeTone || 'is-pro')}">${esc(sample.badgeShort || '')}</span>
            </div>
            <div class="tr-pro-refs-grid">
              ${proExamples.map((ex) => {
                const resTone = ex.myWon ? 'is-win' : 'is-loss';
                const resTxt = ex.myWon ? `✓ ${myCiv.name}` : `✕ ${rivalCiv.name}`;
                const routeTokens = iconRegistry
                  ? iconRegistry.tokenizePlanLine(ex.myRoute, mySlugNorm).slice(0, 2)
                  : [{ short: ex.myRoute, icon: 'assets/icons/ages/feudal.png', sepBefore: null }];
                const routeChips = routeTokens.map((rt) =>
                  `${rt.sepBefore ? `<i class="tr-ref-arrow">${esc(rt.sepBefore)}</i>` : ''}<span class="tr-ref-unit-chip"><img src="${resolveAsset(rt.icon, 'assets/icons/ages/feudal.png')}" alt="" draggable="false" /><b>${esc(rt.short || rt.raw)}</b></span>`
                ).join('');
                return `<div class="tr-pro-ref-item ${resTone}">
                  <div class="tr-pro-ref-top">
                    <span class="tr-pro-ref-res ${resTone}">${esc(resTxt)}</span>
                    <span class="tr-pro-ref-meta mono">${ex.maxElo ? `${ex.maxElo} ELO · ` : ''}${esc(ex.mapName)} · ${ex.durMin}m</span>
                  </div>
                  <strong class="tr-pro-ref-players">${esc(ex.myPlayer)} <em>vs</em> ${esc(ex.rivPlayer)}</strong>
                  <div class="tr-pro-ref-route-row">${routeChips}</div>
                </div>`;
              }).join('')}
            </div>
          </section>`
        : '';

      const clkWins = Array.isArray(lab.clockWindows) && lab.clockWindows.length === 3
        ? lab.clockWindows
        : [
            { cx: 235, shortLabel: '< 26 min', displayPct: '—', displaySub: '0 pj', games: 0 },
            { cx: 490, shortLabel: '26–38 min', displayPct: '—', displaySub: '0 pj', games: 0 },
            { cx: 745, shortLabel: '+38 min', displayPct: '—', displaySub: '0 pj', games: 0 },
          ];

      const svgData = lab.svg || {};
      const rawNodes = Array.isArray(svgData.nodes) && svgData.nodes.length === 3
        ? svgData.nodes
        : [{ cx: 235, cy: 85 }, { cx: 490, cy: 85 }, { cx: 745, cy: 85 }];
      const yStart = Number.isFinite(svgData.yStart) ? svgData.yStart : 85;
      const c0 = rawNodes[0];
      const c1 = rawNodes[1];
      const c2 = rawNodes[2];
      const dotFill = (cy) => (cy < 81 ? '#78d8a6' : (cy > 89 ? '#ef8a81' : '#f2d799'));
      const labelY = (cy) => (cy <= 85 ? Math.max(22, cy - 14) : Math.min(142, cy + 21));

      const pts = [
        { x: 0, y: yStart },
        { x: c0.cx, y: c0.cy },
        { x: c1.cx, y: c1.cy },
        { x: c2.cx, y: c2.cy },
        { x: 880, y: c2.cy },
      ];
      let smoothCurve = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const pA = pts[i];
        const pB = pts[i + 1];
        const midX = ((pA.x + pB.x) / 2).toFixed(1);
        smoothCurve += ` C${midX},${pA.y} ${midX},${pB.y} ${pB.x},${pB.y}`;
      }
      const smoothArea = `${smoothCurve} L880,85 L0,85 Z`;

      const shortUt = (raw) => String(raw || '').split('(')[0].trim();
      const myUuLine = myCiv.uniqueUnit
        ? `<span class="tr-war-uu" title="${esc(myCiv.keyUniqueTech || '')}"><img class="tr-war-uu-ico" src="${getCivUuIcon(mySlugNorm)}" alt="" draggable="false" /><span>${esc(myCiv.uniqueUnit)}${shortUt(myCiv.keyUniqueTech) ? ` <em>· ${esc(shortUt(myCiv.keyUniqueTech))}</em>` : ''}</span></span>`
        : '';
      const rivalUuLine = rivalCiv.uniqueUnit
        ? `<span class="tr-war-uu is-rival" title="${esc(rivalCiv.keyUniqueTech || '')}"><span>${esc(rivalCiv.uniqueUnit)}${shortUt(rivalCiv.keyUniqueTech) ? ` <em>· ${esc(shortUt(rivalCiv.keyUniqueTech))}</em>` : ''}</span><img class="tr-war-uu-ico" src="${getCivUuIcon(rivSlugNorm)}" alt="" draggable="false" /></span>`
        : '';

      const overallChipTone = lab.overallWinPct == null ? '' : (lab.overallWinPct >= 53 ? ' is-good' : lab.overallWinPct <= 47 ? ' is-warn' : '');
      const overallRecordChip = lab.hasEmpiricalData && lab.overallWinPct != null
        ? `<span class="tr-vs-record mono${overallChipTone}">${lab.overallWinPct}% · ${lab.myWins}V–${lab.rivalWins}D</span>`
        : '<span class="tr-vs-record mono">Sin pj en mapa</span>';

      return `<div class="tr-view${activeSubtab === 'matchups' ? ' is-active' : ''}" data-tr-view="matchups">
        <section class="tr-matchup-lab" data-active-map="${esc(activeMapSlug)}">
          <div class="tr-matchup-topbar">
            <div class="tr-map-mode-switch" role="group" aria-label="Tipo de mapa">
              <button type="button" class="tr-map-mode-btn${activeMapType === 'open' ? ' is-active' : ''}" data-tr-matchup-map="arabia">Abiertos · Arabia</button>
              <button type="button" class="tr-map-mode-btn${activeMapType === 'closed' ? ' is-active' : ''}" data-tr-matchup-map="arena">Cerrados · Arena</button>
            </div>
            <span class="tr-sample-pill ${esc(sample.badgeTone || 'is-muted')}">${esc(sample.badgeFull || '')}</span>
          </div>

          ${nemesisHtml ? `<div class="tr-nemesis-strip"><span class="eyebrow">TUS CRUCES RECIENTES</span>${nemesisHtml}</div>` : ''}

          <div class="tr-war-table-head">
            <img class="tr-war-art-bg" src="assets/art/central-civs.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="tr-war-side is-ally">
              <div class="tr-war-crest-ring is-ally">
                <img class="tr-war-shield-lg" src="${resolveCivCrest(mySlugNorm)}" alt="" draggable="false" />
              </div>
              <div class="tr-war-select-col">
                <span class="tr-war-kicker is-ally">TU CIVILIZACIÓN</span>
                <select id="trLabMyCiv" class="field tr-war-select" aria-label="Tu civilización">${myOpts}</select>
                <small>${esc(myCiv.role)}</small>
                ${myUuLine}
              </div>
            </div>

            <div class="tr-war-vs">
              <div class="tr-vs-diamond-lg"><span>VS</span></div>
              ${overallRecordChip}
              <button type="button" class="tr-swap-civs-btn" id="trSwapMatchupBtn" title="Invertir civilizaciones">⇄ Invertir</button>
            </div>

            <div class="tr-war-side is-rival">
              <div class="tr-war-select-col">
                <span class="tr-war-kicker is-rival">CIVILIZACIÓN RIVAL</span>
                <select id="trLabRivalCiv" class="field tr-war-select" aria-label="Civilización rival">${rivOpts}</select>
                <small>${esc(rivalCiv.role)}</small>
                ${rivalUuLine}
              </div>
              <div class="tr-war-crest-ring is-rival">
                <img class="tr-war-shield-lg is-rival" src="${resolveCivCrest(rivSlugNorm)}" alt="" draggable="false" />
              </div>
            </div>
          </div>

          <div class="tr-powerspike-card">
            <img class="tr-panel-art-bg is-subtle" src="assets/art/durante.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="tr-ps-header">
              <div class="tr-ps-title-wrap">
                <span class="tr-ps-eyebrow">CURVA REAL DE RELOJ · QUIÉN TIENE EL TEMPO (${esc(lab.mapTypeLabel || 'Mapas Abiertos')})</span>
                <h3>${esc(lab.verdictTitle || 'Ventanas reales de victoria por duración')}</h3>
                ${lab.clockDirective ? `<p class="tr-ps-directive">${esc(lab.clockDirective)}</p>` : ''}
              </div>
              <div class="tr-ps-badges">
                <span class="tr-ps-badge is-gold">${esc(lab.peakWindowLabel || 'Mejor tramo')}</span>
                <span class="tr-ps-badge is-crimson">${esc(lab.dangerWindowLabel || 'Riesgo')}</span>
              </div>
            </div>

            <svg class="tr-powerspike-svg" viewBox="0 0 880 194" preserveAspectRatio="none" aria-label="Curva real de victoria según duración de partida">
              <defs>
                <linearGradient id="trSpikeAbove" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#78d8a6" stop-opacity="0.48"></stop>
                  <stop offset="100%" stop-color="#78d8a6" stop-opacity="0.03"></stop>
                </linearGradient>
                <linearGradient id="trSpikeBelow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#ef8a81" stop-opacity="0.03"></stop>
                  <stop offset="100%" stop-color="#ef8a81" stop-opacity="0.48"></stop>
                </linearGradient>
                <clipPath id="trClipAbove"><rect x="0" y="0" width="880" height="85"></rect></clipPath>
                <clipPath id="trClipBelow"><rect x="0" y="85" width="880" height="109"></rect></clipPath>
              </defs>
              <line x1="0" y1="36" x2="880" y2="36" stroke="rgba(120, 216, 166, 0.09)" stroke-dasharray="3 5"></line>
              <line x1="0" y1="134" x2="880" y2="134" stroke="rgba(239, 138, 129, 0.09)" stroke-dasharray="3 5"></line>
              <line x1="362" y1="16" x2="362" y2="152" stroke="rgba(255,255,255,0.07)" stroke-dasharray="4 4"></line>
              <line x1="618" y1="16" x2="618" y2="152" stroke="rgba(255,255,255,0.07)" stroke-dasharray="4 4"></line>
              <line x1="0" y1="85" x2="880" y2="85" stroke="rgba(242, 215, 153, 0.42)" stroke-width="1.4"></line>
              <text x="12" y="21" fill="#8ee8ba" font-size="10" font-weight="800" letter-spacing="0.05em">▲ ${esc(myCiv.name.toUpperCase())}</text>
              <text x="12" y="149" fill="#f4a49d" font-size="10" font-weight="800" letter-spacing="0.05em">▼ ${esc(rivalCiv.name.toUpperCase())}</text>
              <path d="${esc(smoothArea)}" fill="url(#trSpikeAbove)" clip-path="url(#trClipAbove)"></path>
              <path d="${esc(smoothArea)}" fill="url(#trSpikeBelow)" clip-path="url(#trClipBelow)"></path>
              <path class="tr-spike-stroke" d="${esc(smoothCurve)}" fill="none" stroke="#f7e3b0" stroke-width="3.2" stroke-linecap="round"></path>
              <circle cx="${c0.cx}" cy="${c0.cy}" r="13" fill="${dotFill(c0.cy)}" fill-opacity="0.18"></circle>
              <circle cx="${c1.cx}" cy="${c1.cy}" r="13" fill="${dotFill(c1.cy)}" fill-opacity="0.18"></circle>
              <circle cx="${c2.cx}" cy="${c2.cy}" r="13" fill="${dotFill(c2.cy)}" fill-opacity="0.18"></circle>
              <circle cx="${c0.cx}" cy="${c0.cy}" r="7" fill="${dotFill(c0.cy)}" stroke="#0b0f15" stroke-width="2.2"></circle>
              <circle cx="${c1.cx}" cy="${c1.cy}" r="7" fill="${dotFill(c1.cy)}" stroke="#0b0f15" stroke-width="2.2"></circle>
              <circle cx="${c2.cx}" cy="${c2.cy}" r="7" fill="${dotFill(c2.cy)}" stroke="#0b0f15" stroke-width="2.2"></circle>
              <text x="${c0.cx}" y="${labelY(c0.cy)}" fill="${dotFill(c0.cy)}" font-size="11.5" font-weight="800" text-anchor="middle">${esc(clkWins[0].displayPct)}</text>
              <text x="${c1.cx}" y="${labelY(c1.cy)}" fill="${dotFill(c1.cy)}" font-size="11.5" font-weight="800" text-anchor="middle">${esc(clkWins[1].displayPct)}</text>
              <text x="${c2.cx}" y="${labelY(c2.cy)}" fill="${dotFill(c2.cy)}" font-size="11.5" font-weight="800" text-anchor="middle">${esc(clkWins[2].displayPct)}</text>
              <text x="235" y="170" fill="#f6e1ae" font-size="10.8" font-weight="760" text-anchor="middle" letter-spacing="0.04em">TEMPRANO (&lt; 26 MIN)</text>
              <text x="235" y="185" fill="#8f9ead" font-size="10" font-weight="650" text-anchor="middle">${esc(clkWins[0].displaySub)}</text>
              <text x="490" y="170" fill="#f6e1ae" font-size="10.8" font-weight="760" text-anchor="middle" letter-spacing="0.04em">CASTILLOS (26–38 MIN)</text>
              <text x="490" y="185" fill="#8f9ead" font-size="10" font-weight="650" text-anchor="middle">${esc(clkWins[1].displaySub)}</text>
              <text x="745" y="170" fill="#d7e1ec" font-size="10.8" font-weight="760" text-anchor="middle" letter-spacing="0.04em">JUEGO LARGO (+38 MIN)</text>
              <text x="745" y="185" fill="#8f9ead" font-size="10" font-weight="650" text-anchor="middle">${esc(clkWins[2].displaySub)}</text>
            </svg>
          </div>

          <div class="tr-age-gameplan-grid">${gameplanHtml}</div>

          ${proExamplesHtml}

          <div class="tr-lab-bottom-split">
            <div class="tr-clash-card">
              <div class="tr-clash-head">
                <span class="eyebrow">CHOQUE IMPERIAL · TECHO DE ÁRBOL</span>
                <div class="tr-clash-legend">
                  <span class="is-ally"><img src="${resolveCivCrest(mySlugNorm)}" alt="" draggable="false" />${esc(myCiv.name)}</span>
                  <em>vs</em>
                  <span class="is-rival">${esc(rivalCiv.name)}<img src="${resolveCivCrest(rivSlugNorm)}" alt="" draggable="false" /></span>
                </div>
              </div>
              <div class="tr-clash-list">${clashRowsHtml}</div>
            </div>
            <div class="tr-traps-card">
              <div class="tr-traps-head">
                <span class="eyebrow">TRAMPAS REALES Y BRECHAS</span>
                <small>Partidas reales + árbol verificado</small>
              </div>
              <div class="tr-traps-list">${trapsHtml}</div>
            </div>
          </div>
        </section>
      </div>`;
    }

    /* ==================== TAB 1: PROGRESO · SALA DE TELEMETRÍA Y ALTO RENDIMIENTO ==================== */
    function buildDivergingDeltaSvg(metric) {
      const hasVal = Boolean(metric && metric.hasSample && Number.isFinite(metric.currentVal));
      const med = Number(metric?.medianVal);
      const best = Number(metric?.bestVal);
      const worst = Number(metric?.worstVal);
      const cur = Number(metric?.currentVal);
      const center = 52;
      let barX = center;
      let barW = 0;
      let fill = '#8e9ca9';

      if (hasVal && Number.isFinite(med)) {
        const diff = metric.direction === 'lower' ? (med - cur) : (cur - med);
        const goodSpan = Math.max(1, Math.abs(best - med));
        const badSpan = Math.max(1, Math.abs(worst - med));
        if (diff > 0) {
          const frac = Math.max(0.14, Math.min(1, diff / goodSpan));
          barW = Math.round(frac * 46);
          barX = center;
          fill = metric.isPersonalBest ? '#f2d799' : '#78d8a6';
        } else if (diff < 0) {
          const frac = Math.max(0.14, Math.min(1, Math.abs(diff) / badSpan));
          barW = Math.round(frac * 46);
          barX = center - barW;
          fill = '#ef8a81';
        } else {
          barW = 4;
          barX = center - 2;
          fill = '#d6b875';
        }
      }

      return `<svg class="tr-diverging-svg" viewBox="0 0 104 18" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect x="4" y="6" width="96" height="6" rx="2" fill="rgba(255,255,255,0.06)"></rect>
        ${barW > 0 ? `<rect x="${barX}" y="6" width="${barW}" height="6" rx="2" fill="${fill}"></rect>` : ''}
        <line x1="${center}" y1="2" x2="${center}" y2="16" stroke="rgba(242,215,153,0.72)" stroke-width="1.4" stroke-linecap="round"></line>
      </svg>`;
    }

    function buildAgeExecutionStagesHtml(hi, snap, metrics) {
      const byKey = new Map(metrics.map((m) => [m.key, m]));
      const mDark = byKey.get('tcIdleDarkSec');
      const mFeudal = byKey.get('feudalSec');
      const mCastle = byKey.get('castleSec');
      const mFeudalTc = byKey.get('tcIdleFeudalPerTcSec');
      const mDba = byKey.get('dbaDelaySec');
      const mEapm = byKey.get('eapm');

      const hasFeudal = Boolean(mFeudal?.hasSample && Number.isFinite(mFeudal.currentVal));
      const hasCastle = Boolean(mCastle?.hasSample && Number.isFinite(mCastle.currentVal));
      const hasDark = Boolean(mDark?.hasSample && Number.isFinite(mDark.currentVal));
      const hasFeudalTc = Boolean(mFeudalTc?.hasSample && Number.isFinite(mFeudalTc.currentVal));
      const hasDba = Boolean(mDba?.hasSample && Number.isFinite(mDba.currentVal));
      const hasEapm = Boolean(mEapm?.hasSample && Number.isFinite(mEapm.currentVal));

      if (!hasFeudal && !hasCastle && !hasDark && !hasEapm) return '';

      const fmtAld = (v) => (v != null ? `${String(v).replace('.', ',')} ald.` : '');
      const deltaTag = (m) => {
        if (!m?.hasSample) return '';
        if (m.isPersonalBest) return `<span class="tr-age-delta is-gold">★ Récord</span>`;
        if (!m.signedDeltaShort || m.signedDeltaShort === 'Base inicial' || m.signedDeltaShort === '—') return '';
        const cls = m.improved === true ? 'is-good' : m.improved === false ? 'is-warn' : 'is-flat';
        return `<span class="tr-age-delta ${cls}">${esc(m.signedDeltaShort)}</span>`;
      };

      const stage1Warn = (hasDark && (mDark.improved === false || mDark.currentVal >= 35))
        || (hasFeudal && mFeudal.improved === false && Number(mFeudal.rawDelta || 0) >= 15);
      const stage1Good = !stage1Warn && ((hasFeudal && mFeudal.improved === true) || (hasDark && mDark.improved === true));
      const stage1Tone = stage1Warn ? 'is-warn' : stage1Good ? 'is-good' : 'is-neutral';

      const stage2Warn = (hasFeudalTc && (mFeudalTc.improved === false || mFeudalTc.currentVal >= 30))
        || (hasDba && mDba.currentVal >= 45);
      const stage2Good = !stage2Warn && ((hasCastle && mCastle.improved === true) || (hasFeudalTc && mFeudalTc.improved === true));
      const stage2Tone = stage2Warn ? 'is-warn' : stage2Good ? 'is-good' : 'is-neutral';

      const hasTownBellPenalty = Number.isFinite(snap?.townBells) && snap.townBells > 0;
      const stage3Warn = (hasEapm && mEapm.improved === false) || hasTownBellPenalty;
      const stage3Good = !stage3Warn && hasEapm && mEapm.improved === true;
      const stage3Tone = stage3Warn ? 'is-warn' : stage3Good ? 'is-good' : 'is-neutral';

      const durEnd = snap?.durationDisplay || 'Fin';
      const w1 = hasFeudal ? `00:00 → ${mFeudal.currentDisplay}` : `00:00 → ${durEnd}`;
      const w2 = hasFeudal
        ? (hasCastle ? `${mFeudal.currentDisplay} → ${mCastle.currentDisplay}` : `${mFeudal.currentDisplay} → ${durEnd}`)
        : 'Sin avance';
      const w3 = hasCastle ? `${mCastle.currentDisplay} → ${durEnd}` : (snap?.durationDisplay ? `Total ${snap.durationDisplay}` : 'Partida');

      const darkTcTone = !hasDark ? '' : (mDark.improved === false || mDark.currentVal >= 35) ? ' is-warn' : ' is-good';
      const feudalTcTone = !hasFeudalTc ? '' : (mFeudalTc.improved === false || mFeudalTc.currentVal >= 30) ? ' is-warn' : ' is-good';
      const dbaTone = !hasDba ? '' : (mDba.improved === false || mDba.currentVal >= 45) ? ' is-warn' : ' is-good';
      const bowTone = !Number.isFinite(snap?.bowDelaySec) ? '' : snap.bowDelaySec >= 45 ? ' is-warn' : ' is-good';

      const cleanEapm = hasEapm ? String(mEapm.currentDisplay || '').replace(' eAPM', '') : '—';
      const cleanEapmMed = hasEapm ? String(mEapm.medianDisplay || '').replace(' eAPM', '') : '—';

      const microText = Number.isFinite(snap?.microOrders) ? `${snap.microOrders} órd.` : '—';
      const bellText = Number.isFinite(snap?.townBells) ? `${snap.townBells} camp.` : '—';

      return `<div class="tr-age-stages" role="list" aria-label="Ejecución cronológica por edades">
        <button type="button" class="tr-age-stage is-stage-dark ${stage1Tone}" data-tr-trend-key="feudalSec" role="listitem">
          <div class="tr-age-stage-head">
            <span class="tr-age-step">I · ALTA EDAD MEDIA</span>
            <span class="tr-age-window tr-perf-num">${esc(w1)}</span>
          </div>
          <div class="tr-age-hero">
            <span class="tr-age-hero-k">Pase a Edad Feudal</span>
            <div class="tr-age-hero-row">
              <strong class="tr-age-hero-val tr-perf-num">${hasFeudal ? esc(mFeudal.currentDisplay) : '—'}</strong>
              ${deltaTag(mFeudal)}
            </div>
            <small class="tr-age-hero-ref tr-perf-num">${hasFeudal && mFeudal.medianDisplay ? `Tu promedio: ${esc(mFeudal.medianDisplay)}` : 'Sin referencia previa'}</small>
          </div>
          <div class="tr-age-rows">
            <div class="tr-age-row">
              <span>Pausa Centro Urbano</span>
              <strong class="tr-perf-num${darkTcTone}">${hasDark ? esc(mDark.currentDisplay) : '—'}${hasDark && mDark.villagersLostCurrent != null ? ` <em>(${esc(fmtAld(mDark.villagersLostCurrent))})</em>` : ''}</strong>
            </div>
            <div class="tr-age-row">
              <span>Actividad Centro Urbano</span>
              <strong class="tr-perf-num">${Number.isFinite(snap?.tcUtilDarkPct) ? `${String(snap.tcUtilDarkPct).replace('.', ',')}%` : '—'}</strong>
            </div>
            <div class="tr-age-row">
              <span>Tu mejor Feudal</span>
              <strong class="tr-perf-num is-muted-gold">${hasFeudal && mFeudal.bestDisplay ? esc(mFeudal.bestDisplay) : '—'}</strong>
            </div>
          </div>
        </button>

        <button type="button" class="tr-age-stage is-stage-feudal ${stage2Tone}" data-tr-trend-key="tcIdleFeudalPerTcSec" role="listitem">
          <div class="tr-age-stage-head">
            <span class="tr-age-step">II · EDAD FEUDAL</span>
            <span class="tr-age-window tr-perf-num">${esc(w2)}</span>
          </div>
          <div class="tr-age-hero">
            <span class="tr-age-hero-k">Pase a Edad de los Castillos</span>
            <div class="tr-age-hero-row">
              <strong class="tr-age-hero-val${hasCastle ? ' tr-perf-num' : ' is-text'}">${hasCastle ? esc(mCastle.currentDisplay) : 'Finalizó en Feudal'}</strong>
              ${hasCastle ? deltaTag(mCastle) : ''}
            </div>
            <small class="tr-age-hero-ref tr-perf-num">${hasCastle && mCastle.medianDisplay ? `Tu promedio: ${esc(mCastle.medianDisplay)}` : 'Decidida antes de la 3.ª edad'}</small>
          </div>
          <div class="tr-age-rows">
            <div class="tr-age-row">
              <span>Pausa por Centro Urbano</span>
              <strong class="tr-perf-num${feudalTcTone}">${hasFeudalTc ? esc(mFeudalTc.currentDisplay) : '—'}${hasFeudalTc && mFeudalTc.villagersLostCurrent != null ? ` <em>(${esc(fmtAld(mFeudalTc.villagersLostCurrent))})</em>` : ''}</strong>
            </div>
            <div class="tr-age-row">
              <span>Hacha de doble filo</span>
              <strong class="tr-perf-num${dbaTone}">${hasDba ? `+${mDba.currentVal} s` : 'No registrada'}${hasDba ? ' <em>tras Feudal</em>' : ''}</strong>
            </div>
            <div class="tr-age-row">
              <span>Tu mejor Castillos</span>
              <strong class="tr-perf-num is-muted-gold">${hasCastle && mCastle.bestDisplay ? esc(mCastle.bestDisplay) : '—'}</strong>
            </div>
          </div>
        </button>

        <button type="button" class="tr-age-stage is-stage-castle ${stage3Tone}" data-tr-trend-key="eapm" role="listitem">
          <div class="tr-age-stage-head">
            <span class="tr-age-step">III · CASTILLOS Y COMBATE</span>
            <span class="tr-age-window tr-perf-num">${esc(w3)}</span>
          </div>
          <div class="tr-age-hero">
            <span class="tr-age-hero-k">Ritmo efectivo sostenido</span>
            <div class="tr-age-hero-row">
              <strong class="tr-age-hero-val tr-perf-num">${esc(cleanEapm)}${hasEapm ? '<small> eAPM</small>' : ''}</strong>
              ${deltaTag(mEapm)}
            </div>
            <small class="tr-age-hero-ref tr-perf-num">${hasEapm && cleanEapmMed !== '—' ? `Tu promedio: ${esc(cleanEapmMed)} eAPM` : 'Sin referencia previa'}</small>
          </div>
          <div class="tr-age-rows">
            <div class="tr-age-row">
              <span>Sierra de arco</span>
              <strong class="tr-perf-num${bowTone}">${Number.isFinite(snap?.bowDelaySec) ? `+${snap.bowDelaySec} s` : 'No registrada'}</strong>
            </div>
            <div class="tr-age-row">
              <span>Retención de ritmo</span>
              <strong class="tr-perf-num">${Number.isFinite(snap?.eapmRetentionPct) ? `${snap.eapmRetentionPct}%` : '—'}</strong>
            </div>
            <div class="tr-age-row">
              <span>Micro · Campana urbana</span>
              <strong class="tr-perf-num${hasTownBellPenalty ? ' is-warn' : ''}">${esc(microText)} <em>· ${esc(bellText)}</em></strong>
            </div>
          </div>
        </button>
      </div>`;
    }

    function buildTrendLineSvg(metric) {
      const hist = Array.isArray(metric?.history) ? metric.history : [];
      if (hist.length < 2) {
        return `<div class="tr-trend-empty">
          <strong>Línea base registrada (${hist.length === 1 ? esc(hist[0].display) : '—'})</strong>
          <span>Jugá 1 partida más con análisis de replay para activar tu curva de evolución y brecha contra tu promedio.</span>
        </div>`;
      }
      const W = 740;
      const H = 264;
      const padL = 62;
      const padR = 88;
      const padT = 42;
      const padB = 46;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB;

      const vals = hist.map((h) => Number(h.value)).filter(Number.isFinite);
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const span = Math.max(1, maxV - minV);
      const yFor = (v) => {
        const t = metric.direction === 'lower' ? (maxV - v) / span : (v - minV) / span;
        return padT + innerH - t * innerH;
      };
      const xFor = (i) => padL + 32 + (i / (hist.length - 1)) * (innerW - 60);

      const pts = hist.map((h, i) => ({
        x: xFor(i),
        y: yFor(Number(h.value)),
        ...h,
      }));

      let smoothLine = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        const mx = ((a.x + b.x) / 2).toFixed(1);
        smoothLine += ` C${mx},${a.y.toFixed(1)} ${mx},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
      }
      const medY = Number.isFinite(metric.medianVal)
        ? Math.max(padT + 4, Math.min(padT + innerH - 4, yFor(metric.medianVal)))
        : (padT + innerH / 2);

      const areaToMed = `${smoothLine} L${pts[pts.length - 1].x.toFixed(1)},${medY.toFixed(1)} L${pts[0].x.toFixed(1)},${medY.toFixed(1)} Z`;

      const worstDisp = metric.direction === 'lower'
        ? hist.reduce((a, b) => (b.value > a.value ? b : a)).display
        : hist.reduce((a, b) => (b.value < a.value ? b : a)).display;

      const clipKey = String(metric.key || 'm').replace(/[^a-zA-Z0-9]/g, '');

      return `<svg class="tr-studio-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Evolución partida a partida">
        <defs>
          <linearGradient id="trAboveGrad_${clipKey}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#78d8a6" stop-opacity="0.24"></stop>
            <stop offset="100%" stop-color="#78d8a6" stop-opacity="0.02"></stop>
          </linearGradient>
          <linearGradient id="trBelowGrad_${clipKey}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ef8a81" stop-opacity="0.02"></stop>
            <stop offset="100%" stop-color="#ef8a81" stop-opacity="0.22"></stop>
          </linearGradient>
          <clipPath id="trClipAbove_${clipKey}">
            <rect x="${padL}" y="0" width="${innerW}" height="${medY.toFixed(1)}"></rect>
          </clipPath>
          <clipPath id="trClipBelow_${clipKey}">
            <rect x="${padL}" y="${medY.toFixed(1)}" width="${innerW}" height="${(H - medY).toFixed(1)}"></rect>
          </clipPath>
        </defs>

        <!-- Guías horizontales sutiles -->
        <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="rgba(255,255,255,0.06)"></line>
        <line x1="${padL}" y1="${(padT + innerH / 2).toFixed(1)}" x2="${W - padR}" y2="${(padT + innerH / 2).toFixed(1)}" stroke="rgba(255,255,255,0.04)"></line>
        <line x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}" stroke="rgba(255,255,255,0.11)"></line>

        <!-- Etiquetas eje Y -->
        <text x="${padL - 12}" y="${padT - 13}" text-anchor="end" fill="#78d8a6" font-size="9.5" font-weight="740">↑ MEJOR</text>
        <text x="${padL - 12}" y="${padT + 4}" text-anchor="end" fill="#8be6b6" font-size="10.5" font-weight="720">${esc(String(metric.bestDisplay || '').replace(' eAPM', ''))}</text>
        <text x="${padL - 12}" y="${padT + innerH + 4}" text-anchor="end" fill="#7c8b99" font-size="10.5">${esc(String(worstDisp || '').replace(' eAPM', ''))}</text>

        <!-- Áreas divididas arriba (esmeralda) y abajo (carmesí) de Tu Promedio -->
        <path d="${areaToMed}" fill="url(#trAboveGrad_${clipKey})" clip-path="url(#trClipAbove_${clipKey})"></path>
        <path d="${areaToMed}" fill="url(#trBelowGrad_${clipKey})" clip-path="url(#trClipBelow_${clipKey})"></path>

        <!-- Línea de Tu Promedio (oro antiguo #d6b875, 100 % coherente con leyenda) -->
        <line x1="${padL}" y1="${medY.toFixed(1)}" x2="${W - padR}" y2="${medY.toFixed(1)}" stroke="#d6b875" stroke-width="1.5" stroke-dasharray="5 4" stroke-opacity="0.82"></line>
        <text x="${W - padR + 8}" y="${(medY - 2).toFixed(1)}" fill="#f2d799" font-size="10" font-weight="760">PROMEDIO</text>
        <text x="${W - padR + 8}" y="${(medY + 11).toFixed(1)}" fill="#d6b875" font-size="10.5" font-weight="700">${esc(String(metric.medianDisplay || '').replace(' eAPM', ''))}</text>

        <!-- Curva principal -->
        <path class="tr-spike-stroke" d="${smoothLine}" fill="none" stroke="#f2d799" stroke-width="2.6" stroke-linecap="round"></path>

        <!-- Nodos clicables por partida -->
        ${pts.map((p) => {
          const dotColor = p.won === true ? '#78d8a6' : p.won === false ? '#ef8a81' : '#8f9dab';
          const shortMap = String(p.mapName || 'Partida').slice(0, 9);
          const cleanDisp = String(p.display || '').replace(' eAPM', '');
          const labelBelow = p.y < padT + 28;
          const clearance = p.isBest ? 24 : 18;
          const upClearance = p.isBest ? 16 : 13;
          const labelY = Math.max(18, Math.min(padT + innerH - 8, labelBelow ? p.y + clearance : p.y - upClearance));
          return `<g class="tr-trend-node" data-tr-replay-id="${esc(p.matchId)}">
            ${p.isCurrent ? `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${padT + innerH}" stroke="rgba(242,215,153,0.36)" stroke-dasharray="3 3"></line>` : ''}
            ${p.isBest ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="9" fill="none" stroke="#78d8a6" stroke-width="1.5" opacity="0.85"></circle>` : ''}
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.isCurrent ? '5.6' : '4.4'}" fill="${p.isCurrent ? '#faf0d4' : '#111720'}" stroke="${p.isCurrent ? '#d6b875' : dotColor}" stroke-width="2.2"></circle>
            ${p.isCurrent
              ? `<rect x="${(p.x - 28).toFixed(1)}" y="${(labelY - 12).toFixed(1)}" width="56" height="17" rx="4" fill="#0b0f16" stroke="rgba(242,215,153,0.62)" stroke-width="1"></rect>
                 <text x="${p.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" fill="#faf0d4" font-size="11" font-weight="800">${esc(cleanDisp)}</text>`
              : `<text x="${p.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" fill="#aebcc9" font-size="10" font-weight="660">${esc(cleanDisp)}</text>`}
            <text x="${p.x.toFixed(1)}" y="${H - 20}" text-anchor="middle" fill="${p.isCurrent ? '#f2d799' : '#8594a3'}" font-size="10" font-weight="${p.isCurrent ? '760' : '600'}">${esc(shortMap)}</text>
            <circle cx="${p.x.toFixed(1)}" cy="${H - 8}" r="3" fill="${dotColor}"></circle>
          </g>`;
        }).join('')}
      </svg>`;
    }

    function buildWeeklyDailyChartSvg(wp) {
      const days = Array.isArray(wp?.dailySeries) ? wp.dailySeries : [];
      if (!days.length) return '';

      const W = 460;
      const H = 218;
      const padL = 34;
      const padR = 12;
      const padT = 28;
      const plotW = W - padL - padR; // 414
      const plotH = 132;
      const baseY = padT + plotH; // 160
      const slotW = plotW / days.length;
      const barW = 30;

      const fmtAvgScore = (val) => {
        if (!Number.isFinite(val)) return '0';
        const rounded = Math.round(val * 10) / 10;
        return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
      };

      const colsHtml = days.map((d, idx) => {
        const cx = padL + (idx + 0.5) * slotW;
        const bx = cx - barW / 2;
        const isToday = Boolean(d.isToday);
        const dayTextFill = isToday ? '#f5dfa8' : d.hasMatches ? '#d5e4dc' : '#657a73';
        const dayWeight = isToday ? '780' : d.hasMatches ? '680' : '600';
        const partText = d.matchCount === 1 ? '1 part.' : `${d.matchCount} part.`;
        const tooltipLines = [
          `${d.dayLabel} (${d.dateShort})`,
          d.hasMatches
            ? `${d.matchCount} ${d.matchCount === 1 ? 'partida' : 'partidas'}${d.wins || d.losses ? ` (${d.wins}V–${d.losses}D)` : ''}`
            : 'Sin partidas registradas',
          d.hasComparison
            ? `Promedio diario: ${fmtAvgScore(d.improvedFundamentalsAvg)}/${fmtAvgScore(d.measuredFundamentalsAvg)} fundamentos mejorados`
            : d.isBaselineOnly
              ? 'Partida base inicial (sin comparación previa)'
              : null,
          d.peakHighlight ? `Destacado: ${d.peakHighlight}` : null,
        ].filter(Boolean).join(' · ');

        const todayTick = isToday
          ? `<rect x="${(cx - 8).toFixed(1)}" y="${baseY + 6}" width="16" height="2" rx="1" fill="#7fe0ae"></rect>`
          : '';
        const selectedHalo = d.containsSelectedMatch && d.hasMatches
          ? `<rect x="${(cx - 18).toFixed(1)}" y="${padT - 3}" width="36" height="${plotH + 6}" rx="8" fill="none" stroke="#f2d799" stroke-width="1.4" opacity="0.88"></rect>`
          : '';

        if (!d.hasMatches) {
          return `<g class="tr-wk-day-col is-rest">
            <title>${esc(tooltipLines)}</title>
            <rect x="${(cx - 11).toFixed(1)}" y="${baseY - 3}" width="22" height="3" rx="1.5" fill="rgba(142, 168, 159, 0.22)"></rect>
            <text x="${cx.toFixed(1)}" y="${baseY - 13}" text-anchor="middle" fill="#60746e" font-size="11" font-weight="600">—</text>
            ${todayTick}
            <text x="${cx.toFixed(1)}" y="183" text-anchor="middle" fill="${dayTextFill}" font-size="11" font-weight="${dayWeight}">${esc(d.dayLabel)}</text>
          </g>`;
        }

        const clickAttr = d.bestMatchId ? ` data-tr-replay-id="${esc(d.bestMatchId)}"` : '';
        const clickableCls = d.bestMatchId ? ' is-clickable' : '';

        if (d.isBaselineOnly) {
          const stubH = 18;
          const stubY = baseY - stubH;
          return `<g class="tr-wk-day-col is-base${clickableCls}"${clickAttr}>
            <title>${esc(tooltipLines)}</title>
            <rect x="${(cx - 26).toFixed(1)}" y="12" width="52" height="198" fill="transparent"></rect>
            ${selectedHalo}
            <rect x="${bx.toFixed(1)}" y="${padT}" width="${barW}" height="${plotH}" rx="6" fill="rgba(214, 184, 117, 0.045)"></rect>
            <rect x="${bx.toFixed(1)}" y="${stubY}" width="${barW}" height="${stubH}" rx="5" fill="rgba(214, 184, 117, 0.28)" stroke="rgba(242, 215, 153, 0.52)" stroke-width="1"></rect>
            <text x="${cx.toFixed(1)}" y="${stubY - 8}" text-anchor="middle" fill="#e5cf99" font-size="10.5" font-weight="740">Base</text>
            ${todayTick}
            <text x="${cx.toFixed(1)}" y="183" text-anchor="middle" fill="${dayTextFill}" font-size="11" font-weight="${dayWeight}">${esc(d.dayLabel)}</text>
            <text x="${cx.toFixed(1)}" y="200" text-anchor="middle" fill="#859f96" font-size="10" font-weight="600">${esc(partText)}</text>
          </g>`;
        }

        const avg = Number(d.improvedFundamentalsAvg || 0);
        if (avg <= 0) {
          const stubH = 12;
          const stubY = baseY - stubH;
          return `<g class="tr-wk-day-col is-zero${clickableCls}"${clickAttr}>
            <title>${esc(tooltipLines)}</title>
            <rect x="${(cx - 26).toFixed(1)}" y="12" width="52" height="198" fill="transparent"></rect>
            ${selectedHalo}
            <rect x="${bx.toFixed(1)}" y="${padT}" width="${barW}" height="${plotH}" rx="6" fill="rgba(214, 184, 117, 0.035)"></rect>
            <rect x="${bx.toFixed(1)}" y="${stubY}" width="${barW}" height="${stubH}" rx="4" fill="rgba(214, 184, 117, 0.24)" stroke="rgba(214, 184, 117, 0.48)" stroke-width="1"></rect>
            <text x="${cx.toFixed(1)}" y="${stubY - 8}" text-anchor="middle" fill="#c6b892" font-size="11" font-weight="720">0</text>
            ${todayTick}
            <text x="${cx.toFixed(1)}" y="183" text-anchor="middle" fill="${dayTextFill}" font-size="11" font-weight="${dayWeight}">${esc(d.dayLabel)}</text>
            <text x="${cx.toFixed(1)}" y="200" text-anchor="middle" fill="#859f96" font-size="10" font-weight="600">${esc(partText)}</text>
          </g>`;
        }

        const norm = Math.max(0, Math.min(1, avg / 6));
        const barH = Math.max(22, Math.round(norm * plotH));
        const barY = baseY - barH;
        const isHighlight = Boolean(d.isBestDay || d.hasPersonalBest);
        const fillUrl = isHighlight ? 'url(#trWkPeakGrad)' : 'url(#trWkBarGrad)';
        const capFill = isHighlight ? '#faf0d4' : '#c6f8dc';
        const valText = isHighlight ? `★ ${fmtAvgScore(avg)}` : fmtAvgScore(avg);
        const valColor = isHighlight ? '#f5dfa8' : '#8ceab8';

        return `<g class="tr-wk-day-col is-active${isHighlight ? ' is-peak' : ''}${clickableCls}"${clickAttr}>
          <title>${esc(tooltipLines)}</title>
          <rect x="${(cx - 26).toFixed(1)}" y="12" width="52" height="198" fill="transparent"></rect>
          ${selectedHalo}
          <rect x="${bx.toFixed(1)}" y="${padT}" width="${barW}" height="${plotH}" rx="6" fill="rgba(127, 224, 174, 0.05)"></rect>
          <rect class="tr-wk-bar-fill" x="${bx.toFixed(1)}" y="${barY}" width="${barW}" height="${barH}" rx="6" fill="${fillUrl}"></rect>
          <rect x="${(bx + 4).toFixed(1)}" y="${barY + 2}" width="${barW - 8}" height="2.4" rx="1.2" fill="${capFill}" opacity="0.88"></rect>
          <text x="${cx.toFixed(1)}" y="${Math.max(18, barY - 8)}" text-anchor="middle" fill="${valColor}" font-size="11.2" font-weight="780">${esc(valText)}</text>
          ${todayTick}
          <text x="${cx.toFixed(1)}" y="183" text-anchor="middle" fill="${dayTextFill}" font-size="11" font-weight="${dayWeight}">${esc(d.dayLabel)}</text>
          <text x="${cx.toFixed(1)}" y="200" text-anchor="middle" fill="#859f96" font-size="10" font-weight="600">${esc(partText)}</text>
        </g>`;
      }).join('');

      const quietOverlay = !wp.hasWeeklyActivity
        ? `<g class="tr-wk-quiet-note">
            <rect x="64" y="66" width="354" height="52" rx="10" fill="rgba(11, 20, 18, 0.88)" stroke="rgba(127, 224, 174, 0.24)" stroke-width="1"></rect>
            <text x="241" y="88" text-anchor="middle" fill="#f5efd8" font-size="11.5" font-weight="720">Sin partidas en los últimos 7 días</text>
            <text x="241" y="105" text-anchor="middle" fill="#8ea89f" font-size="10.2" font-weight="600">Analizá 1 partida en Postmatch para encender tu día de hoy</text>
          </g>`
        : '';

      return `<svg class="tr-wk-daily-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Mejoras diarias de los últimos 7 días">
        <defs>
          <linearGradient id="trWkBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8ceab8" stop-opacity="0.96"></stop>
            <stop offset="55%" stop-color="#4bb785" stop-opacity="0.84"></stop>
            <stop offset="100%" stop-color="#204e3f" stop-opacity="0.58"></stop>
          </linearGradient>
          <linearGradient id="trWkPeakGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f7e4b2" stop-opacity="0.98"></stop>
            <stop offset="48%" stop-color="#82dfa9" stop-opacity="0.90"></stop>
            <stop offset="100%" stop-color="#2c6650" stop-opacity="0.62"></stop>
          </linearGradient>
        </defs>

        <!-- Guías horizontales (escala real 0 a 6 fundamentos mejorados por partida) -->
        <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="3 4"></line>
        <line x1="${padL}" y1="${padT + plotH / 2}" x2="${W - padR}" y2="${padT + plotH / 2}" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="3 4"></line>
        <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="rgba(164, 214, 188, 0.22)" stroke-width="1.2"></line>

        <!-- Etiquetas eje Y -->
        <text x="${padL - 8}" y="${padT + 3}" text-anchor="end" fill="#7aa093" font-size="10" font-weight="660">6/6</text>
        <text x="${padL - 8}" y="${padT + plotH / 2 + 3}" text-anchor="end" fill="#6f8d83" font-size="10" font-weight="640">3/6</text>
        <text x="${padL - 8}" y="${baseY + 3}" text-anchor="end" fill="#607870" font-size="10" font-weight="640">0</text>

        ${colsHtml}
        ${quietOverlay}
      </svg>`;
    }

    function renderWeeklySanctuaryHtml(wp, activeTrendKey, isSamplePreview) {
      if (!wp || !Array.isArray(wp.dailySeries) || !wp.dailySeries.length) return '';

      const artCycle = ['is-art-seal', 'is-art-sanctuary', 'is-art-scroll', 'is-art-courtyard'];
      const gains = Array.isArray(wp.gains) ? wp.gains : [];
      const shownGains = gains.slice(0, 4);
      const extraGains = Math.max(0, gains.length - shownGains.length);
      const milestones = Array.isArray(wp.milestones) ? wp.milestones : [];
      const facts = Array.isArray(wp.encouragingFacts) ? wp.encouragingFacts : [];

      const medallionSrc = wp.hasGains
        ? 'assets/brand/imperial-v1.png'
        : 'assets/brand/review-relic-monk-v1.png';
      const eyebrowText = isSamplePreview
        ? 'MUESTRA ULTRA · BALANCE SEMANAL'
        : 'BALANCE SEMANAL · ÚLTIMOS 7 DÍAS';

      const fmtScore = (val) => {
        if (!Number.isFinite(val)) return '—';
        const r = Math.round(val * 10) / 10;
        return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
      };

      const thirdStatLabel = wp.weeklyPbsCount > 0
        ? 'RÉCORDS'
        : wp.bestDay
          ? 'MEJOR DÍA'
          : 'BASE PREVIA';
      const thirdStatVal = wp.weeklyPbsCount > 0
        ? `★ ${wp.weeklyPbsCount}`
        : wp.bestDay
          ? `${wp.bestDay.dayLabel} · ${fmtScore(wp.bestDay.improvedFundamentalsAvg)}/6`
          : `${wp.priorMatchCount || 0} part.`;
      const thirdStatTone = wp.weeklyPbsCount > 0
        ? ' is-gold'
        : wp.bestDay
          ? ' is-jade'
          : '';

      const colSubRight = wp.baselineLabel || (wp.hasWeeklyActivity ? 'Calibrando referencia' : 'Esperando tu próxima partida');

      let leftBodyHtml = '';
      if (shownGains.length > 0) {
        const rowsHtml = shownGains.map((g, idx) => {
          const artCls = artCycle[idx % artCycle.length];
          const isInsp = g.metricKey === activeTrendKey;
          const cleanBefore = String(g.beforeDisplay || '').replace(' eAPM', '').replace(/(\d)\.(\d)/g, '$1,$2');
          const cleanNow = String(g.nowDisplay || '').replace(' eAPM', '').replace(/(\d)\.(\d)/g, '$1,$2');
          const cleanDelta = String(g.deltaDisplay || '').replace(/(\d)\.(\d)/g, '$1,$2');
          return `<button type="button" class="tr-wk-gain-row ${artCls}${g.isPersonalBest ? ' is-record' : ''}${isInsp ? ' is-inspected' : ''}" data-tr-trend-key="${esc(g.metricKey)}" title="${esc(g.proofNote || '')}">
            <span class="tr-wk-ico-frame">
              <img src="${resolveAsset(g.icon, 'assets/icons/postmatch/tempo.webp')}" alt="" draggable="false" />
            </span>
            <span class="tr-wk-gain-copy">
              <span class="tr-wk-gain-head">
                <strong>${esc(g.label)}</strong>
                ${g.isPersonalBest ? '<span class="tr-wk-pb-tag">★ Récord</span>' : ''}
              </span>
              <small>${esc(g.humanImpact || g.proofNote || '')}</small>
            </span>
            <span class="tr-wk-gain-shift tr-wk-num">
              <span class="tr-wk-shift-vals">
                <span class="tr-wk-before">${esc(cleanBefore)}</span>
                <span class="tr-wk-arrow" aria-hidden="true">→</span>
                <strong class="tr-wk-now">${esc(cleanNow)}</strong>
              </span>
              <small class="tr-wk-shift-delta">${esc(cleanDelta)}</small>
            </span>
          </button>`;
        }).join('');
        leftBodyHtml = `<div class="tr-wk-gain-list">${rowsHtml}</div>
          <div class="tr-wk-col-foot">
            <span>Clic en cualquier mejora para abrir su curva abajo</span>
            ${extraGains > 0 ? `<strong class="tr-wk-more">+${extraGains} ${extraGains === 1 ? 'mejora más' : 'mejoras más'}</strong>` : ''}
          </div>`;
      } else if (wp.status === 'steady_week' || wp.status === 'tough_week') {
        const factArtCycle = ['is-art-sanctuary', 'is-art-scroll', 'is-art-courtyard'];
        const factCards = facts.map((f, idx) => {
          const artCls = factArtCycle[idx % factArtCycle.length];
          const isBtn = Boolean(f.metricKey || f.matchId);
          const attr = f.metricKey
            ? ` data-tr-trend-key="${esc(f.metricKey)}"`
            : f.matchId
              ? ` data-tr-replay-id="${esc(f.matchId)}"`
              : '';
          const tag = isBtn ? 'button type="button"' : 'div';
          const closeTag = isBtn ? 'button' : 'div';
          return `<${tag} class="tr-wk-fact-card ${artCls}${isBtn ? ' is-clickable' : ''}"${attr}>
            <strong>${esc(f.title)}</strong>
            <small>${esc(f.detail)}</small>
          </${closeTag}>`;
        }).join('');
        leftBodyHtml = `<div class="tr-wk-fact-list">${factCards}</div>
          <div class="tr-wk-col-foot">
            <span>Sin mejoras artificiales: solo datos reales verificados de tus partidas</span>
          </div>`;
      } else {
        const anchorLine = wp.quietAnchor
          ? `Tu mejor marca guardada en <strong>${esc(wp.quietAnchor.label)}</strong> sigue firme en <b class="tr-wk-num">${esc(wp.quietAnchor.bestDisplay)}</b>.`
          : wp.status === 'calibrating_first_match'
            ? 'Ya guardamos tu primera marca semanal. Con 1 partida más vas a ver exactamente qué mejoraste esta semana.'
            : 'Cuando analices tus primeras partidas en Postmatch, acá vas a ver cada avance real de tu semana.';
        leftBodyHtml = `<div class="tr-wk-calm-card is-art-courtyard">
          <div class="tr-wk-calm-copy">
            <strong>${wp.status === 'calibrating_first_match' ? 'Base semanal en calibración' : 'Tu progreso semanal te espera'}</strong>
            <p>${anchorLine}</p>
          </div>
          <div class="tr-wk-calm-actions">
            <button type="button" class="tr-wk-calm-btn" data-tr-open-postmatch="1">Analizar partida en Postmatch →</button>
            <button type="button" class="tr-wk-calm-link" data-tr-tab="orders">Practicar Build Order</button>
          </div>
        </div>`;
      }

      const footItems = [];
      for (const ms of milestones.slice(0, 2)) {
        const ico = ms.kind === 'personal_best' ? 'assets/icons/postmatch/record.webp' : 'assets/icons/medal.png';
        footItems.push(`<span class="tr-wk-foot-item">
          <img src="${ico}" alt="" draggable="false" />
          <span><strong>${esc(ms.title)}</strong> · ${esc(ms.valueDisplay)}</span>
        </span>`);
      }
      if (!footItems.length && wp.bestDay?.peakHighlight) {
        footItems.push(`<span class="tr-wk-foot-item">
          <img src="assets/icons/medal.png" alt="" draggable="false" />
          <span><strong>Día destacado (${esc(wp.bestDay.dayLabel)})</strong> · ${esc(wp.bestDay.peakHighlight)}</span>
        </span>`);
      }

      return `<section class="tr-weekly-sanctuary is-status-${esc(wp.status || 'improved')}" aria-label="Mejoras reales de esta semana">
        <div class="tr-wk-head">
          <div class="tr-wk-lead">
            <div class="tr-wk-medallion">
              <img src="${medallionSrc}" alt="" draggable="false" />
            </div>
            <div class="tr-wk-title-wrap">
              <span class="tr-wk-kicker">${eyebrowText}</span>
              <h3>${esc(wp.headline || 'Mejoras de esta semana')}</h3>
              <p class="tr-wk-subtitle">${esc(wp.subhead || '')}</p>
            </div>
          </div>
          <div class="tr-wk-summary">
            <div class="tr-wk-stat">
              <span>PARTIDAS</span>
              <strong class="tr-wk-num">${wp.weekMatchCount || 0}</strong>
            </div>
            <div class="tr-wk-stat">
              <span>DÍAS ACTIVOS</span>
              <strong class="tr-wk-num">${wp.activeDaysCount || 0} / 7</strong>
            </div>
            <div class="tr-wk-stat">
              <span>${thirdStatLabel}</span>
              <strong class="tr-wk-num${thirdStatTone}">${esc(thirdStatVal)}</strong>
            </div>
          </div>
        </div>

        <div class="tr-wk-body">
          <div class="tr-wk-gains">
            <div class="tr-wk-col-head">
              <h4>${shownGains.length > 0 ? 'Lo que mejoraste esta semana' : 'Resumen real de tu semana'}</h4>
              <small>${esc(colSubRight)}</small>
            </div>
            ${leftBodyHtml}
          </div>

          <div class="tr-wk-daily-stage">
            <div class="tr-wk-col-head">
              <h4>Mejoras por día</h4>
              <small>Fundamentos sobre tu base · 7 días</small>
            </div>
            ${buildWeeklyDailyChartSvg(wp)}
            <div class="tr-wk-daily-foot">
              <div class="tr-wk-legend">
                <span class="is-jade">■ Mejoró</span>
                <span class="is-sand">▪ Jugado (0)</span>
                <span class="is-rest">— Descanso</span>
              </div>
              <small>${wp.hasWeeklyActivity ? 'Clic en un día activo para inspeccionar' : 'Solo días con partidas reales'}</small>
            </div>
          </div>
        </div>

        ${footItems.length ? `<div class="tr-wk-foot">${footItems.join('<i class="tr-wk-foot-sep" aria-hidden="true"></i>')}</div>` : ''}
      </section>`;
    }

    function renderPerfView() {
      let hi = state?.highElo || {};
      const isPerf = activeSubtab === 'perf';
      const isSamplePreview = Boolean((!hi.hasData || !hi.sampleSize) && !state?.unlocked);

      if (isSamplePreview) {
        hi = {
          hasData: true,
          sampleSize: 12,
          selectedMatchId: 'preview-1',
          selectedReplay: {
            matchId: 'preview-1', civSlug: 'franks', civName: 'Francos', mapName: 'Arabia', opening: 'Scouts', won: true,
            durationDisplay: '28:14', tcUtilDarkPct: 96, bowDelaySec: 22, eapmRetentionPct: 84, microOrders: 34, townBells: 0,
            biggestTcGap: { durationSec: 26, villagersLost: 1, startSec: 678, endSec: 704, age: 'Edad Feudal', militaryOrdersInGap: 14 },
          },
          replays: [
            { matchId: 'preview-1', civSlug: 'franks', civName: 'Francos', mapName: 'Arabia', opening: 'Scouts', durationDisplay: '28:14', won: true },
            { matchId: 'preview-2', civSlug: 'mayans', civName: 'Mayas', mapName: 'Arena', opening: 'Castillos', durationDisplay: '34:20', won: true },
            { matchId: 'preview-3', civSlug: 'spanish', civName: 'Españoles', mapName: 'Arabia', opening: 'Scouts', durationDisplay: '24:05', won: false },
            { matchId: 'preview-4', civSlug: 'mongols', civName: 'Mongoles', mapName: 'Nómada', opening: 'Castillos', durationDisplay: '31:10', won: true },
          ],
          villagerLossSummary: { darkVillagers: 0.7, feudalVillagersPerTc: 1.5, combinedEarlyVillagers: 2.2, combinedDisplay: '2,2 aldeanos' },
          winLossComparison: {
            hasComparison: true, isReliable: true, winsCount: 8, lossesCount: 4,
            biggestDropOff: { headline: 'En tus derrotas, inactividad por Centro Urbano (Feudal) empeora +18 s (+0,7 aldeanos)' },
          },
          primaryDiagnosis: {
            severity: 'crimson',
            metricKey: 'tcIdleFeudalPerTcSec',
            eyebrow: 'DATOS DE MUESTRA · CUELLO DE BOTELLA #1',
            headline: 'Perdiste 1,5 aldeanos por Centro Urbano en Edad Feudal',
            evidenceLine: 'Mayor apagón del Centro Urbano: 26 s (1 aldeano) entre 11:18 y 11:44 mientras enviaste 14 órdenes militares.',
            targetDisplay: 'Objetivo Plata (≤ 28 s)',
            drillCue: 'Dejá 2 aldeanos en cola antes de microear el ejército y renová la cola cada vez que ponés una granja.',
            actionTab: 'orders',
            actionLabel: 'Entrenar este cuello de botella →',
            planTitle: 'Reducir pausa del Centro Urbano en Edad Feudal (≤ 28 s)',
            planDetail: 'Actual 38 s (1,5 aldeanos perdidos) en Arabia',
            planMetric: '38 s',
          },
          metrics: [
            {
              key: 'tcIdleDarkSec', title: 'Inactividad del Centro Urbano (Alta Edad)', direction: 'lower', hasSample: true, currentVal: 18, medianVal: 32, bestVal: 9, worstVal: 55,
              currentDisplay: '18 s', medianDisplay: '32 s', bestDisplay: '9 s', signedDeltaShort: '-14 s', villagersLostCurrent: 0.7, improved: true,
              nextTarget: { targetDisplay: 'Oro (≤ 10 s)', shortTarget: '≤ 10 s' },
              trendDelta3: { status: 'improving', display: '-11 s' },
              history: [
                { matchId: 'p1', value: 44, display: '44 s', mapName: 'Arabia', won: false },
                { matchId: 'p2', value: 36, display: '36 s', mapName: 'Arena', won: true },
                { matchId: 'p3', value: 29, display: '29 s', mapName: 'Arabia', won: true },
                { matchId: 'p4', value: 24, display: '24 s', mapName: 'Nómada', won: true },
                { matchId: 'p5', value: 18, display: '18 s', mapName: 'Arabia', won: true, isCurrent: true, isBest: true },
              ],
            },
            { key: 'tcIdleFeudalPerTcSec', title: 'Inactividad por Centro Urbano (Feudal)', direction: 'lower', hasSample: true, currentVal: 38, medianVal: 29, bestVal: 14, worstVal: 64, currentDisplay: '38 s', medianDisplay: '29 s', bestDisplay: '14 s', signedDeltaShort: '+9 s', villagersLostCurrent: 1.5, improved: false, nextTarget: { targetDisplay: 'Plata (≤ 28 s)', shortTarget: '≤ 28 s' } },
            { key: 'feudalSec', title: 'Pase a Edad Feudal', direction: 'lower', hasSample: true, currentVal: 595, medianVal: 618, bestVal: 575, worstVal: 660, currentDisplay: '09:55', medianDisplay: '10:18', bestDisplay: '09:35', signedDeltaShort: '-23 s', improved: true, nextTarget: { targetDisplay: 'Obsidiana (≤ 09:50)', shortTarget: '≤ 09:50' } },
            { key: 'castleSec', title: 'Pase a Edad de los Castillos', direction: 'lower', hasSample: true, currentVal: 1180, medianVal: 1240, bestVal: 1120, worstVal: 1320, currentDisplay: '19:40', medianDisplay: '20:40', bestDisplay: '18:40', signedDeltaShort: '-1:00', improved: true, nextTarget: { targetDisplay: 'Oro (≤ 20:00)', shortTarget: '≤ 20:00' } },
            { key: 'dbaDelaySec', title: 'Hacha de doble filo', direction: 'lower', hasSample: true, currentVal: 14, medianVal: 26, bestVal: 5, worstVal: 50, currentDisplay: '14 s', medianDisplay: '26 s', bestDisplay: '5 s', signedDeltaShort: '-12 s', improved: true, nextTarget: { targetDisplay: 'Oro (≤ 25 s)', shortTarget: '≤ 25 s' } },
            { key: 'eapm', title: 'Ritmo efectivo (eAPM)', direction: 'higher', hasSample: true, currentVal: 52, medianVal: 46, bestVal: 58, worstVal: 34, currentDisplay: '52 eAPM', medianDisplay: '46 eAPM', bestDisplay: '58 eAPM', signedDeltaShort: '+6', improved: true },
          ],
          weeklyProgress: {
            status: 'improved',
            comparisonMode: 'prior_baseline',
            hasWeeklyActivity: true,
            hasComparison: true,
            hasGains: true,
            headline: 'Esta semana mejoraste 3 fundamentos reales',
            subhead: '8 partidas esta semana vs 12 previas. Cada mejora supera el margen de ruido real.',
            baselineLabel: 'vs tu base previa',
            weekMatchCount: 8,
            priorMatchCount: 12,
            activeDaysCount: 5,
            weeklyPbsCount: 2,
            bestDay: { dayLabel: 'Hoy', improvedFundamentalsAvg: 5, peakHighlight: 'CU Alta Edad: 18 s (-14 s vs base)' },
            gains: [
              { metricKey: 'tcIdleDarkSec', label: 'Centro Urbano · Alta Edad', icon: 'assets/brand/review-town-center-v1.png', beforeDisplay: '32 s', nowDisplay: '18 s', deltaDisplay: '-14 s', humanImpact: '-14 s · +0,6 aldeanos ganados', isPersonalBest: true },
              { metricKey: 'feudalSec', label: 'Pase a Edad Feudal', icon: 'assets/brand/feudal-v1.png', beforeDisplay: '10:18', nowDisplay: '09:55', deltaDisplay: '-23 s', humanImpact: '-23 s antes en Edad Feudal', isPersonalBest: false },
              { metricKey: 'dbaDelaySec', label: 'Hacha de doble filo', icon: 'assets/icons/wood.png', beforeDisplay: '26 s', nowDisplay: '14 s', deltaDisplay: '-12 s', humanImpact: '-12 s más rápido al pisar Feudal', isPersonalBest: true },
            ],
            milestones: [
              { kind: 'personal_best', title: 'Nuevo récord en Centro Urbano · Alta Edad', valueDisplay: '18 s' },
              { kind: 'clean_town_bell', title: 'Defensa limpia sin Campana urbana', valueDisplay: '7/8 partidas' },
            ],
            encouragingFacts: [],
            dailySeries: [
              { dayLabel: 'Mié', dateShort: '18/11', isToday: false, matchCount: 0, hasMatches: false, hasComparison: false, isBaselineOnly: false, improvedFundamentalsAvg: null },
              { dayLabel: 'Jue', dateShort: '19/11', isToday: false, matchCount: 1, hasMatches: true, hasComparison: true, isBaselineOnly: false, improvedFundamentalsAvg: 3, measuredFundamentalsAvg: 6, bestMatchId: 'preview-4' },
              { dayLabel: 'Vie', dateShort: '20/11', isToday: false, matchCount: 2, hasMatches: true, hasComparison: true, isBaselineOnly: false, improvedFundamentalsAvg: 4, measuredFundamentalsAvg: 6, bestMatchId: 'preview-2' },
              { dayLabel: 'Sáb', dateShort: '21/11', isToday: false, matchCount: 0, hasMatches: false, hasComparison: false, isBaselineOnly: false, improvedFundamentalsAvg: null },
              { dayLabel: 'Dom', dateShort: '22/11', isToday: false, matchCount: 2, hasMatches: true, hasComparison: true, isBaselineOnly: false, improvedFundamentalsAvg: 0, measuredFundamentalsAvg: 6, bestMatchId: 'preview-3' },
              { dayLabel: 'Lun', dateShort: '23/11', isToday: false, matchCount: 1, hasMatches: true, hasComparison: true, isBaselineOnly: false, improvedFundamentalsAvg: 4, measuredFundamentalsAvg: 6, bestMatchId: 'preview-2' },
              { dayLabel: 'Hoy', dateShort: '24/11', isToday: true, matchCount: 2, hasMatches: true, hasComparison: true, isBaselineOnly: false, improvedFundamentalsAvg: 5, measuredFundamentalsAvg: 6, hasPersonalBest: true, isBestDay: true, containsSelectedMatch: true, bestMatchId: 'preview-1' },
            ],
          },
        };
      }

      if (!hi.hasData || !hi.sampleSize) {
        return `<div class="tr-view${isPerf ? ' is-active' : ''}" data-tr-view="perf">
          <section class="tr-perf-empty-lab">
            <img class="tr-panel-art-bg" src="assets/art/postmatch-v3-cabecera.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="tr-pel-left">
              <div class="tr-perf-crest-frame">
                <img src="assets/brand/review-town-center-v1.png" alt="" draggable="false" />
              </div>
              <span class="eyebrow">LABORATORIO DE RENDIMIENTO REAL</span>
              <h3>Tu sala de telemetría está lista</h3>
              <p>Analizá tu primera partida para medir exactamente cuántos aldeanos perdés por pausas del Centro Urbano, tu cronología por edades, dónde se escapan tus derrotas y tu próximo objetivo verificable.</p>
              <div class="tr-pel-actions">
                <button type="button" class="btn gold tr-cta-sheen" id="trGoPostmatchBtn">Analizar mi última partida en Postmatch →</button>
                <button type="button" class="btn" data-tr-tab="orders">Practicar Build Order →</button>
              </div>
            </div>
            <ol class="tr-pel-steps">
              <li><span>01</span><div><strong>Analizá 1 partida en Postmatch</strong><small>Lectura automática de tiempos, Centro Urbano, tecnologías y ritmo efectivo.</small></div></li>
              <li><span>02</span><div><strong>Detectamos tu cuello de botella real</strong><small>En segundos exactos y aldeanos perdidos frente a tu propio promedio.</small></div></li>
              <li><span>03</span><div><strong>Rutina con verificación automática</strong><small>Fijá el objetivo en Mi Plan y Relic confirma cuando lo superás en partida.</small></div></li>
            </ol>
          </section>
        </div>`;
      }

      const selectedEntry = (hi.replays || []).find((r) => String(r.matchId) === String(hi.selectedMatchId)) || hi.replays?.[0] || {};
      const snap = hi.selectedReplay || selectedEntry;
      const resLabel = selectedEntry.won === true ? 'VICTORIA' : selectedEntry.won === false ? 'DERROTA' : 'PARTIDA';
      const resTone = selectedEntry.won === true ? ' is-win' : selectedEntry.won === false ? ' is-loss' : '';
      const metrics = Array.isArray(hi.metrics) ? hi.metrics : [];
      const diag = hi.primaryDiagnosis || null;
      const defaultKey = diag?.metricKey || metrics[0]?.key || 'tcIdleDarkSec';
      const activeTrendMetric = metrics.find((m) => m.key === selectedTrendMetricKey) || metrics.find((m) => m.key === defaultKey) || metrics[0] || null;
      const activeTrendMeta = METRIC_HUMAN_META[activeTrendMetric?.key] || {};

      const measured = metrics.filter((m) => m.hasSample);
      const improvedCount = measured.filter((m) => m.isPersonalBest || m.improved === true).length;
      const bestExecMetric = measured.find((m) => m.isPersonalBest) || measured.find((m) => m.improved === true) || null;
      const bestExecMeta = bestExecMetric ? (METRIC_HUMAN_META[bestExecMetric.key] || { shortRadar: bestExecMetric.title }) : null;

      const METRIC_TO_RULE_TYPE = {
        tcIdleDarkSec: 'tc_idle_dark',
        tcIdleFeudalPerTcSec: 'tc_idle_feudal',
        feudalSec: 'feudal_time',
        castleSec: 'castle_time',
        dbaDelaySec: 'dba_delay',
        bowDelaySec: 'bow_saw',
        eapm: 'eapm',
      };
      const activePlanItems = (state?.trainingQueue || []).filter((q) => q && !q.done);
      const findPlanItemForRule = (ruleType, title) => {
        const cleanTitle = String(title || '').trim().toLowerCase();
        return activePlanItems.find((q) => {
          if (ruleType && (q.verifyRule?.type === ruleType || q.ruleKey === `rule:${ruleType}`)) return true;
          if (cleanTitle && String(q.title || '').trim().toLowerCase() === cleanTitle) return true;
          return false;
        }) || null;
      };
      const diagRuleType = METRIC_TO_RULE_TYPE[diag?.metricKey] || '';
      const diagPlanMatch = diag ? findPlanItemForRule(diagRuleType, diag.planTitle) : null;
      const diagAlreadyInPlan = Boolean(diagPlanMatch);
      const activeTrendRuleType = METRIC_TO_RULE_TYPE[activeTrendMetric?.key] || '';
      const activeTrendPlanMatch = activeTrendMetric
        ? findPlanItemForRule(activeTrendRuleType, activeTrendMeta.title || activeTrendMetric.title)
        : null;

      // ZONE 1: Match Selector Rail (5 rectangular architectural slots so all fit cleanly without scrollbar clipping)
      const matchSlotsHtml = (hi.replays || []).slice(0, 5).map((r) => {
        const active = String(r.matchId) === String(hi.selectedMatchId);
        const slotTone = r.won === true ? ' is-win' : r.won === false ? ' is-loss' : '';
        const metaLine = [r.civName, r.opening || r.durationDisplay].filter(Boolean).join(' · ');
        return `<button type="button" class="tr-pm-slot${slotTone}${active ? ' is-active' : ''}" data-tr-replay-id="${esc(r.matchId)}">
          <img src="${resolveCivCrest(r.civSlug)}" alt="" draggable="false" />
          <span class="tr-pm-meta">
            <strong>${esc(r.mapName || 'Partida')}</strong>
            <small>${esc(metaLine)}</small>
          </span>
        </button>`;
      }).join('');

      // ZONE 3: Chronological 3-Stage Age Execution Breakdown + Win-Loss Dropoff
      const ageStagesHtml = buildAgeExecutionStagesHtml(hi, snap, metrics);
      const wlDrop = hi.winLossComparison?.biggestDropOff || null;

      // ZONE 4 Left: Precision 6-Row Telemetry Ledger (ordered chronologically by match phase)
      const ledgerOrder = ['tcIdleDarkSec', 'feudalSec', 'dbaDelaySec', 'tcIdleFeudalPerTcSec', 'castleSec', 'eapm'];
      const orderedMetrics = ledgerOrder
        .map((k) => metrics.find((m) => m.key === k))
        .filter(Boolean);

      const ledgerRowsHtml = orderedMetrics.map((m) => {
        const hm = METRIC_HUMAN_META[m.key] || { title: m.title, sub: m.explanation };
        const isSel = m.key === activeTrendMetric?.key;
        const cleanVal = !m.hasSample
          ? '—'
          : String(m.currentDisplay || '').replace(' eAPM', '');
        const deltaText = !m.hasSample
          ? 'Sin dato'
          : m.isPersonalBest
            ? '★ Récord'
            : (m.signedDeltaShort || 'En media');
        const deltaTone = !m.hasSample
          ? ''
          : m.isPersonalBest
            ? ' is-pb'
            : m.improved === true
              ? ' is-good'
              : m.improved === false
                ? ' is-warn'
                : '';
        const villSub = (m.villagersLostCurrent != null && m.hasSample)
          ? `${String(m.villagersLostCurrent).replace('.', ',')} ald. perdidos · ${m.key === 'tcIdleDarkSec' ? 'Alta Edad' : 'por CU'}`
          : hm.sub;

        return `<button type="button" class="tr-ledger-row${isSel ? ' is-selected' : ''}" data-tr-trend-key="${esc(m.key)}">
          <img class="tr-ledger-ico" src="${resolveAsset(m.icon, 'assets/icons/postmatch/tempo.webp')}" alt="" draggable="false" />
          <span class="tr-ledger-copy">
            <strong>${esc(hm.title)}</strong>
            <small>${esc(villSub)}</small>
          </span>
          <span class="tr-ledger-val">
            <strong class="tr-perf-num">${esc(cleanVal)}</strong>
            <small class="tr-perf-delta${deltaTone}">${esc(deltaText)}</small>
          </span>
          ${buildDivergingDeltaSvg(m)}
        </button>`;
      }).join('');

      const activeCleanVal = activeTrendMetric?.hasSample ? String(activeTrendMetric.currentDisplay || '').replace(' eAPM', '') : '—';
      const activeMedVal = activeTrendMetric?.hasSample ? String(activeTrendMetric.medianDisplay || '').replace(' eAPM', '') : '—';
      const activeBestVal = activeTrendMetric?.hasSample ? String(activeTrendMetric.bestDisplay || '').replace(' eAPM', '') : '—';
      const activeValTone = activeTrendMetric?.isPersonalBest ? ' is-gold' : activeTrendMetric?.improved === true ? ' is-good' : activeTrendMetric?.improved === false ? ' is-warn' : '';
      const activeFourthLabel = activeTrendMetric?.trendDelta3 ? 'TENDENCIA (ÚLT. 3)' : 'PRÓXIMO OBJETIVO';
      const activeFourthVal = activeTrendMetric?.trendDelta3
        ? activeTrendMetric.trendDelta3.display
        : (activeTrendMetric?.nextTarget?.targetDisplay || (activeTrendMetric?.signedDeltaShort || '—'));
      const activeFourthTone = activeTrendMetric?.trendDelta3
        ? (activeTrendMetric.trendDelta3.status === 'improving' ? ' is-good' : activeTrendMetric.trendDelta3.status === 'regressing' ? ' is-warn' : '')
        : ' is-gold';

      return `<div class="tr-view${isPerf ? ' is-active' : ''}" data-tr-view="perf">
        <div class="tr-perf-console">
          <!-- ZONE 1: SELECTOR ARQUITECTÓNICO DE PARTIDAS -->
          <div class="tr-perf-matchbar">
            <div class="tr-pm-rail">${matchSlotsHtml}</div>
            <div class="tr-pm-sample">
              <span>${isSamplePreview ? 'MUESTRA ULTRA' : 'BASE MEDIDA'}</span>
              <strong class="tr-perf-num">${hi.sampleSize} ${hi.sampleSize === 1 ? 'partida' : 'partidas'}</strong>
            </div>
            <button type="button" class="tr-pm-postmatch-link" id="trGoPostmatchBtn" title="Abrir análisis detallado en Postmatch">Postmatch ↗</button>
          </div>

          <!-- ZONE 2: DIAGNÓSTICO DE PARTIDA Y DIRECTIVA DE ENTRENAMIENTO -->
          <section class="tr-perf-banner">
            <img class="tr-panel-art-bg" src="assets/art/postmatch-v3-cabecera.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="tr-perf-verdict">
              <div class="tr-perf-verdict-top">
                <div class="tr-perf-crest-frame">
                  <img src="${resolveCivCrest(selectedEntry.civSlug)}" alt="" draggable="false" />
                </div>
                <div class="tr-perf-verdict-copy">
                  <div class="tr-perf-kicker">
                    <span class="tr-perf-outcome${resTone}">● ${resLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>${esc(selectedEntry.mapName || 'Mapa')}</span>
                    <span aria-hidden="true">·</span>
                    <span>${esc(selectedEntry.civName || 'Civilización')}</span>
                    ${snap?.durationDisplay ? `<span aria-hidden="true">·</span><span class="tr-perf-num">${esc(snap.durationDisplay)}</span>` : ''}
                  </div>
                  <h2>${esc(diag?.headline || `Mejoraste en ${improvedCount} de ${measured.length} fundamentos`)}</h2>
                  ${diag?.evidenceLine ? `<p class="tr-perf-evidence">${esc(diag.evidenceLine)}</p>` : ''}
                </div>
              </div>
              <div class="tr-perf-kpi-strip">
                <div class="tr-perf-kpi">
                  <span>ARRIBA DE TU PROMEDIO</span>
                  <strong class="tr-perf-num${improvedCount >= Math.ceil(measured.length * 0.6) ? ' is-good' : ''}">${improvedCount} / ${measured.length} fundamentos</strong>
                </div>
                <div class="tr-perf-kpi">
                  <span>ALDEANOS PERDIDOS</span>
                  <strong class="tr-perf-num${(hi.villagerLossSummary?.combinedEarlyVillagers || 0) >= 2 ? ' is-warn' : ' is-good'}">${esc(hi.villagerLossSummary?.combinedDisplay || '—')}</strong>
                </div>
                <div class="tr-perf-kpi">
                  <span>MEJOR EJECUCIÓN</span>
                  <strong class="is-gold">${bestExecMetric ? `${esc(bestExecMeta.shortRadar)} (${esc(bestExecMetric.isPersonalBest ? '★ Récord' : bestExecMetric.signedDeltaShort)})` : 'Base inicial'}</strong>
                </div>
              </div>
            </div>

            <aside class="tr-perf-directive${diag?.severity === 'crimson' ? ' is-crimson' : diag?.severity === 'gold' ? ' is-gold' : ' is-emerald'}">
              <div class="tr-perf-dir-body">
                <span class="eyebrow">${esc(diag?.eyebrow || 'PRIORIDAD DE ENTRENAMIENTO')}</span>
                <strong>${esc(diag?.targetDisplay || 'Superar tu promedio en la próxima partida')}</strong>
                <p>${esc(diag?.drillCue || 'Fijá este objetivo en Mi Plan para verificar tu mejora automática en próximas partidas.')}</p>
              </div>
              <button type="button" class="tr-perf-pin-cta tr-cta-sheen${diagAlreadyInPlan ? ' is-pinned' : ''}" id="trTrainBottleneckBtn"
                data-tp-title="${esc(diag?.planTitle || 'Mejorar ejecución temprana')}"
                data-tp-detail="${esc(diag?.planDetail || `Detectado en ${selectedEntry.mapName || 'tu partida'}`)}"
                data-tp-metric="${esc(diag?.planMetric || '')}"
                data-tp-rule="${esc(diagRuleType)}"
                data-tp-in-plan="${diagAlreadyInPlan ? '1' : '0'}">
                ${renderDumbbellSvg()}
                <span>${diagAlreadyInPlan ? '✓ Ya en Mi Plan · Ver Mi Plan →' : 'Fijar en Mi Plan →'}</span>
              </button>
            </aside>
          </section>

          <!-- ZONE 3: CURVA DE EVOLUCIÓN PARTIDA A PARTIDA Y SELECTOR DE FUNDAMENTOS (ARRIBA DEL TODO, SIN SCROLLEAR) -->
          <section class="tr-perf-studio">
            <div class="tr-perf-ledger">
              <div class="tr-perf-ledger-head">
                <span class="eyebrow">FUNDAMENTOS MEDIDOS</span>
                <small>Clic para cambiar curva · Der. mejor que tu media</small>
              </div>
              <div class="tr-perf-ledger-list">${ledgerRowsHtml}</div>
            </div>

            <div class="tr-perf-chart-studio">
              <img class="tr-panel-art-bg is-subtle" src="assets/art/central-elo.webp" alt="" aria-hidden="true" draggable="false" />
              <div class="tr-perf-panel-head">
                <div>
                  <span class="eyebrow">EVOLUCIÓN PARTIDA A PARTIDA</span>
                  <h3>${esc(activeTrendMeta.title || activeTrendMetric?.title || 'Evolución')}</h3>
                  <small class="tr-studio-hint">${esc(activeTrendMeta.betterHint || '')}</small>
                </div>
                ${activeTrendMetric ? `<button type="button" class="tr-perf-pin-cta is-subtle${activeTrendPlanMatch ? ' is-pinned' : ''}" data-train-pin="1" data-tp-source="Progreso" data-tp-title="${esc(activeTrendMeta.title || activeTrendMetric.title)}" data-tp-detail="${esc(activeTrendMeta.sub || '')}" data-tp-metric="${esc(activeCleanVal)}" data-tp-rule="${esc(activeTrendRuleType)}"${activeTrendPlanMatch ? ` data-tp-queue-id="${esc(activeTrendPlanMatch.id)}" aria-pressed="true"` : ' aria-pressed="false"'}>${renderDumbbellSvg()}<span>${activeTrendPlanMatch ? '✓ En Mi Plan' : 'Fijar en Mi Plan'}</span></button>` : ''}
              </div>

              <div class="tr-studio-benchmarks">
                <div class="tr-studio-bm">
                  <span>ESTA PARTIDA</span>
                  <strong class="tr-perf-num${activeValTone}">${esc(activeCleanVal)}</strong>
                </div>
                <div class="tr-studio-bm">
                  <span>TU PROMEDIO</span>
                  <strong class="tr-perf-num is-gold">${esc(activeMedVal)}</strong>
                </div>
                <div class="tr-studio-bm">
                  <span>TU RÉCORD</span>
                  <strong class="tr-perf-num is-good">${esc(activeBestVal)}</strong>
                </div>
                <div class="tr-studio-bm">
                  <span>${activeFourthLabel}</span>
                  <strong class="tr-perf-num${activeFourthTone}">${esc(activeFourthVal)}</strong>
                </div>
              </div>

              ${buildTrendLineSvg(activeTrendMetric)}

              <div class="tr-studio-foot">
                <div class="tr-perf-legend">
                  <span class="is-best">● Victoria</span>
                  <span class="is-loss">● Derrota</span>
                  <span class="is-median">┅ Tu promedio</span>
                  <span class="is-current">◎ Récord personal</span>
                </div>
                <small>Clic en cualquier punto de la curva para inspeccionar esa partida</small>
              </div>
            </div>
          </section>

          <!-- ZONE 4: EJECUCIÓN POR EDADES (3 FASES CRONOLÓGICAS + BRECHA EN DERROTAS) -->
          ${ageStagesHtml ? `<section class="tr-perf-timeline-panel">
            <div class="tr-perf-panel-head">
              <div>
                <span class="eyebrow">EJECUCIÓN POR EDADES</span>
                <h3>Rendimiento etapa por etapa frente a tu promedio</h3>
              </div>
              <span class="tr-age-panel-cue">Clic en una etapa para enfocar su curva arriba</span>
            </div>
            ${ageStagesHtml}
            ${wlDrop ? `<div class="tr-perf-wl-bar">
              <span class="tr-wl-tag">BRECHA EN DERROTAS (${hi.winLossComparison.winsCount}V–${hi.winLossComparison.lossesCount}D)</span>
              <strong>${esc(wlDrop.headline)}</strong>
            </div>` : ''}
          </section>` : ''}

          <!-- ZONE 5: SANTUARIO SEMANAL (DATOS MEJORADOS ESTA SEMANA + GRÁFICO DIARIO REAL) -->
          ${renderWeeklySanctuaryHtml(hi.weeklyProgress, activeTrendMetric?.key, isSamplePreview)}
        </div>
      </div>`;
    }

    /* ==================== PACER & METRONOME HELPERS ==================== */
    function updatePacerClockTick() {
      const rec = draftRecipe || state?.pacer?.selectedRecipe;
      if (!rec) return;
      const { idx, next } = computeActiveStep(rec);
      const hudClockEl = container.querySelector('#trHudClock');
      if (hudClockEl) hudClockEl.textContent = fmtClock(pacerElapsedSec);

      const soundOn = state?.pacer?.soundEnabled !== false;
      if (next && soundOn && pacerWarnedStepIdx !== idx + 1) {
        const rem = next.gameSec - pacerElapsedSec;
        if (rem > 0 && rem <= 5) {
          pacerWarnedStepIdx = idx + 1;
          playSfx('paceTick');
        }
      }
      if (idx !== pacerLastStepIdx) {
        pacerLastStepIdx = idx;
        if (soundOn) playSfx('paceSplit');
        render();
      }
    }

    function togglePacerClock() {
      if (!state?.unlocked) return;
      if (pacerRunning) { stopPacerClock(); render(); return; }
      pacerRunning = true;
      pacerLastTs = Date.now();
      const speed = Number(state?.pacer?.clockSpeed || 1.7);
      playSfx('paceTick');
      pacerTimer = setInterval(() => {
        const now = Date.now();
        pacerElapsedSec += ((now - pacerLastTs) / 1000) * speed;
        pacerLastTs = now;
        updatePacerClockTick();
      }, 200);
      render();
    }

    function syncDraftInputsFromDom() {
      if (!draftRecipe) return;
      const nameEl = container.querySelector('#trCreatorName');
      const civEl = container.querySelector('#trCreatorCiv');
      const ageEl = container.querySelector('#trStepAgeInput');
      const popEl = container.querySelector('#trStepPopInput');
      const secEl = container.querySelector('#trStepSecInput');
      const titleEl = container.querySelector('#trStepTitleInput');
      const noteEl = container.querySelector('#trStepNoteInput');

      if (nameEl) draftRecipe.name = nameEl.value.trim() || 'Mi Orden Personalizada';
      if (civEl) draftRecipe.civSlug = civEl.value;
      const st = draftRecipe.steps?.[selectedStepIdx];
      if (st) {
        if (ageEl) st.age = Number(ageEl.value) || 1;
        if (popEl) st.pop = popEl.value.trim() || st.pop;
        if (secEl) st.gameSec = Math.max(0, Number(secEl.value) || 0);
        if (titleEl) {
          st.title = titleEl.value.trim() || st.title;
          st.text = st.title;
        }
        if (noteEl) st.note = noteEl.value.trim();
      }
    }

    function applyPaletteActionItem(itemId) {
      ensureDraftSynced();
      syncDraftInputsFromDom();
      let found = null;
      for (const cat of BO_ACTION_PALETTE) {
        const hit = cat.items.find((it) => it.id === itemId);
        if (hit) { found = hit; break; }
      }
      if (!found || !draftRecipe) return;

      const curStep = draftRecipe.steps[selectedStepIdx] || draftRecipe.steps[draftRecipe.steps.length - 1];
      const baseAlloc = curStep?.alloc ? { ...curStep.alloc } : { food: 6, wood: 0, gold: 0, stone: 0 };

      if (paletteClickMode === 'append') {
        if (found.allocDelta) {
          baseAlloc.food = Math.max(0, (baseAlloc.food || 0) + (found.allocDelta.food || 0));
          baseAlloc.wood = Math.max(0, (baseAlloc.wood || 0) + (found.allocDelta.wood || 0));
          baseAlloc.gold = Math.max(0, (baseAlloc.gold || 0) + (found.allocDelta.gold || 0));
          baseAlloc.stone = Math.max(0, (baseAlloc.stone || 0) + (found.allocDelta.stone || 0));
        }
        const tot = baseAlloc.food + baseAlloc.wood + baseAlloc.gold + baseAlloc.stone;
        const cap = Math.max(5, Math.ceil((tot + 2) / 5) * 5);
        const nextAge = found.age ? Math.max(curStep?.age || 1, found.age) : (curStep?.age || 1);
        const nextSec = Number(curStep?.gameSec || 0) + (found.id.startsWith('t_feudal') ? 130 : found.id.startsWith('t_castle') ? 160 : 45);
        const newStep = {
          id: `st_${Date.now()}`,
          age: nextAge,
          pop: `${String(tot + 1).padStart(2, '0')}/${String(cap).padStart(2, '0')}`,
          gameSec: nextSec,
          alloc: baseAlloc,
          icons: [...found.icons],
          title: found.title,
          text: found.title,
          note: found.note,
        };
        draftRecipe.steps.splice(selectedStepIdx + 1, 0, newStep);
        selectedStepIdx += 1;
        studioStatusMsg = `+ ${found.label}`;
      } else if (curStep) {
        curStep.icons = [...found.icons];
        curStep.title = found.title;
        curStep.text = found.title;
        curStep.note = found.note;
        if (found.age) curStep.age = found.age;
        studioStatusMsg = `Paso #${selectedStepIdx + 1}: ${found.label}`;
      }
      draftRecipe.isDirty = true;
      render();
    }

    async function saveAndArmCurrentDraft(armNow = true) {
      if (!state?.unlocked || typeof root.settings?.trainingBuildSave !== 'function') return;
      syncDraftInputsFromDom();
      const res = await root.settings.trainingBuildSave({ build: draftRecipe, armNow });
      if (res?.ok && res.saved) {
        draftRecipe = cloneRecipeForDraft(res.saved);
        draftRecipe.sourceKey = res.saved.id;
        state.armedBuildOrderId = res.armedBuildOrderId;
        state.customBuilds = res.customBuilds;
        if (res.pacer) state.pacer = { ...state.pacer, ...res.pacer };
        studioStatusMsg = armNow ? 'Armada en Overlay' : 'Guardada';
        studioEditMode = false;
        playSfx('confirm');
        render();
      }
    }

    function bindEvents() {
      const closeWelcome = async (targetTab = null) => {
        showWelcomeModal = false;
        markWelcomeSeen();
        playSfx('confirm');
        if (targetTab && ['perf', 'orders', 'matchups', 'arena'].includes(targetTab)) {
          await switchSubtab(targetTab);
          return;
        }
        render();
        if (activeSubtab === 'arena' && !state?.arena?.locked && arenaQuestion && !arenaAnswerResult) {
          beginQuestionTimer(arenaTimeLeftMs);
        }
      };
      container.querySelector('#trWelcomeStartBtn')?.addEventListener('click', () => closeWelcome('perf'));
      container.querySelector('#trWelcomeSkipBtn')?.addEventListener('click', () => closeWelcome(null));
      container.querySelector('#trWelcomeXBtn')?.addEventListener('click', () => closeWelcome(null));
      container.querySelectorAll('[data-tr-welcome-go]').forEach((card) => {
        card.addEventListener('click', () => closeWelcome(card.dataset.trWelcomeGo));
      });

      container.querySelector('#trOpenGuideBtn')?.addEventListener('click', () => {
        if (activeSubtab === 'arena' && arenaQuestion && !arenaAnswerResult && !state?.arena?.locked) {
          return;
        }
        stopArenaTimer();
        showWelcomeModal = true;
        render();
      });

      container.querySelector('#trToggleQueueBtn')?.addEventListener('click', () => {
        showQueueDrawer = !showQueueDrawer;
        render();
      });
      container.querySelector('#trCloseQueueBtn')?.addEventListener('click', () => {
        showQueueDrawer = false;
        render();
      });

      // Queue ("Quiero entrenar esto") actions
      container.querySelectorAll('[data-tr-q-toggle]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (typeof root.settings?.trainingQueueToggle !== 'function') return;
          const res = await root.settings.trainingQueueToggle(btn.dataset.trQToggle);
          if (res?.ok && Array.isArray(res.trainingQueue)) {
            state.trainingQueue = res.trainingQueue;
            playSfx('confirm');
            render();
          }
        });
      });
      container.querySelectorAll('[data-tr-q-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (typeof root.settings?.trainingQueueRemove !== 'function') return;
          const res = await root.settings.trainingQueueRemove(btn.dataset.trQDel);
          if (res?.ok && Array.isArray(res.trainingQueue)) {
            state.trainingQueue = res.trainingQueue;
            render();
          }
        });
      });
      container.querySelectorAll('[data-tr-q-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          switchSubtab(btn.dataset.trQGo);
        });
      });

      container.querySelectorAll('#trGoPostmatchBtn, [data-tr-open-postmatch]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (typeof goTo === 'function') goTo('postmatch');
        });
      });

      container.querySelectorAll('[data-tr-tab]').forEach((btn) => {
        btn.addEventListener('click', () => switchSubtab(btn.dataset.trTab));
      });
      container.querySelectorAll('[data-tr-jump]').forEach((btn) => {
        btn.addEventListener('click', () => switchSubtab(btn.dataset.trJump));
      });

      // Arena Campaign events
      container.querySelector('#trArenaPlayBtn')?.addEventListener('click', () => fetchNextArenaQuestion(arenaSelectedLevel));
      container.querySelector('#trArenaNextQuestionBtn')?.addEventListener('click', () => fetchNextArenaQuestion(arenaSelectedLevel));
      container.querySelectorAll('[data-tr-arena-level]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (arenaQuestion && !arenaAnswerResult && !state?.arena?.locked) return;
          const lvl = Number(btn.dataset.trArenaLevel || 1);
          arenaSelectedLevel = lvl;
          arenaQuestion = null;
          arenaAnswerResult = null;
          arenaPickedOptionId = null;
          arenaLeavePenaltyMsg = null;
          render();
        });
      });
      container.querySelectorAll('[data-tr-ans-id]').forEach((btn) => {
        btn.addEventListener('click', () => submitArenaChoice(btn.dataset.trAnsId, false));
      });

      // Evolución replay & trend-metric selectors + 1-click bottleneck training CTA (SIEMPRE abre Mi Plan, nunca Build Orders)
      container.querySelector('#trTrainBottleneckBtn')?.addEventListener('click', async (ev) => {
        if (!state?.unlocked) return;
        const btn = ev.currentTarget;
        const alreadyInPlan = btn.dataset.tpInPlan === '1';
        if (!alreadyInPlan && typeof root.settings?.trainingQueueAdd === 'function') {
          const res = await root.settings.trainingQueueAdd({
            source: 'Progreso',
            title: btn.dataset.tpTitle || 'Mejorar ejecución',
            detail: btn.dataset.tpDetail || '',
            metric: btn.dataset.tpMetric || '',
            ruleType: btn.dataset.tpRule || '',
          });
          if (res?.ok && Array.isArray(res.trainingQueue)) {
            state.trainingQueue = res.trainingQueue;
            playSfx('confirm');
          }
        }
        switchSubtab('plan');
      });

      container.querySelectorAll('[data-tr-replay-id]').forEach((elNode) => {
        elNode.addEventListener('click', async () => {
          const matchId = elNode.dataset.trReplayId;
          if (typeof root.settings?.trainingHighEloConfig === 'function') {
            const res = await root.settings.trainingHighEloConfig({ selectedMatchId: matchId });
            if (res?.ok && res.highElo) {
              state.highElo = res.highElo;
              if (res.highElo.primaryDiagnosis?.metricKey) {
                selectedTrendMetricKey = res.highElo.primaryDiagnosis.metricKey;
              }
              render();
            }
          }
        });
      });
      container.querySelectorAll('[data-tr-trend-key]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          if (ev.target?.closest?.('[data-train-pin]')) return;
          const fromOutsideStudio = !btn.closest('.tr-perf-studio');
          selectedTrendMetricKey = btn.dataset.trTrendKey;
          render();
          if (fromOutsideStudio) {
            const studioEl = container.querySelector('.tr-perf-studio');
            if (studioEl && typeof studioEl.scrollIntoView === 'function') {
              studioEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        });
      });

      // Studio & Palette events
      container.querySelectorAll('[data-tr-pal-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          syncDraftInputsFromDom();
          activePaletteCategory = btn.dataset.trPalCat;
          render();
        });
      });
      container.querySelectorAll('[data-tr-pal-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          syncDraftInputsFromDom();
          paletteClickMode = btn.dataset.trPalMode === 'replace' ? 'replace' : 'append';
          render();
        });
      });
      container.querySelectorAll('[data-tr-pal-item]').forEach((btn) => {
        btn.addEventListener('click', () => applyPaletteActionItem(btn.dataset.trPalItem));
      });

      container.querySelector('#trRecipeSelect')?.addEventListener('change', async (ev) => {
        stopPacerClock();
        pacerElapsedSec = 0;
        selectedStepIdx = 0;
        draftRecipe = null;
        studioStatusMsg = '';
        if (typeof root.settings?.trainingPacerSelect === 'function') {
          const res = await root.settings.trainingPacerSelect({
            buildKey: ev.target.value,
            civ: state.pacer?.selectedCiv || '',
            clockSpeed: state.pacer?.clockSpeed || 1.7,
            soundEnabled: state.pacer?.soundEnabled !== false,
          });
          if (res?.ok && res.pacer) state.pacer = { ...state.pacer, ...res.pacer };
        }
        render();
      });

      container.querySelector('#trArmOverlayBtn')?.addEventListener('click', async () => {
        if (!state?.unlocked) return;
        syncDraftInputsFromDom();
        const curId = draftRecipe?.id || state.pacer?.selectedRecipe?.id || state.pacer?.selectedRecipe?.key || 'scouts-20pop';
        const isCurrentlyArmed = Boolean(state.armedBuildOrderId && String(state.armedBuildOrderId) === String(curId));
        if (!isCurrentlyArmed && draftRecipe && (!draftRecipe.id || draftRecipe.isDirty)) {
          await saveAndArmCurrentDraft(true);
          return;
        }
        if (typeof root.settings?.trainingBuildArm === 'function') {
          const res = await root.settings.trainingBuildArm({ buildId: curId, armed: !isCurrentlyArmed });
          if (res?.ok) {
            state.armedBuildOrderId = res.armedBuildOrderId;
            studioStatusMsg = res.armedBuildOrderId
              ? (res.buildOrderHelperEnabled === false ? 'Armada · activá Build Order Helper en Batalla' : 'Armada en Overlay')
              : 'Desactivada';
            render();
          }
        }
      });

      container.querySelector('#trTestOverlayBtn')?.addEventListener('click', async () => {
        if (!state?.unlocked || typeof root.settings?.trainingBuildArm !== 'function') return;
        syncDraftInputsFromDom();
        const nextTestState = !state.liveOverlayTestActive;
        if (nextTestState && draftRecipe && draftRecipe.isDirty) {
          await saveAndArmCurrentDraft(true);
        }
        const curId = draftRecipe?.id || state.pacer?.selectedRecipe?.id || state.pacer?.selectedRecipe?.key || 'scouts-20pop';
        const res = await root.settings.trainingBuildArm({ buildId: curId, testNow: nextTestState });
        if (res?.ok) {
          state.liveOverlayTestActive = Boolean(res.liveTestActive);
          state.armedBuildOrderId = res.armedBuildOrderId;
          studioStatusMsg = res.liveTestActive ? 'Visible arriba' : 'Prueba detenida';
          render();
        }
      });

      container.querySelector('#trEnterEditBtn')?.addEventListener('click', () => {
        studioEditMode = true;
        render();
      });
      container.querySelector('#trExitEditBtn')?.addEventListener('click', () => {
        syncDraftInputsFromDom();
        studioEditMode = false;
        render();
      });
      container.querySelectorAll('[data-tr-select-recipe]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          stopPacerClock();
          pacerElapsedSec = 0;
          selectedStepIdx = 0;
          draftRecipe = null;
          studioStatusMsg = '';
          if (typeof root.settings?.trainingPacerSelect === 'function') {
            const res = await root.settings.trainingPacerSelect({
              buildKey: btn.dataset.trSelectRecipe,
              civ: state.pacer?.selectedCiv || '',
              clockSpeed: state.pacer?.clockSpeed || 1.7,
              soundEnabled: state.pacer?.soundEnabled !== false,
            });
            if (res?.ok && res.pacer) state.pacer = { ...state.pacer, ...res.pacer };
          }
          render();
        });
      });

      container.querySelector('#trNewBuildBtn')?.addEventListener('click', () => {
        stopPacerClock();
        pacerElapsedSec = 0;
        selectedStepIdx = 0;
        studioEditMode = true;
        draftRecipe = {
          id: '', isCustom: true, isDirty: true, sourceKey: '__new__',
          name: 'Mi Orden Personalizada', shortName: 'Mi Orden',
          civSlug: state.pacer?.selectedCiv || 'franks',
          mapName: 'Arabia', mapSlug: 'arabia', artClass: 'is-art-scouts',
          targetFeudalSec: 580, targetCastleSec: 1120, summary: 'Creada en Relic.',
          steps: [{
            id: 'st_1', age: 1, pop: '07/10', gameSec: 0,
            alloc: { food: 6, wood: 0, gold: 0, stone: 0 }, icons: ['sheep', 'villager'],
            title: '2 Casas y 6 Aldeanos a ovejas', text: '2 Casas y 6 Aldeanos a ovejas',
            note: 'Elegí íconos a la derecha para sumar pasos.',
          }],
        };
        studioStatusMsg = 'Nueva orden';
        render();
      });

      container.querySelector('#trCloneBuildBtn')?.addEventListener('click', async () => {
        ensureDraftSynced();
        draftRecipe = {
          ...cloneRecipeForDraft(draftRecipe),
          id: '', isCustom: true, isDirty: true, sourceKey: '__clone__',
          name: `${draftRecipe.name} (Personalizada)`,
        };
        await saveAndArmCurrentDraft(true);
      });

      container.querySelector('#trExtractReplayBtn')?.addEventListener('click', async () => {
        if (typeof root.settings?.trainingBuildExtract !== 'function') return;
        const res = await root.settings.trainingBuildExtract();
        if (res?.ok && res.saved) {
          draftRecipe = cloneRecipeForDraft(res.saved);
          draftRecipe.sourceKey = res.saved.id;
          state.customBuilds = res.customBuilds;
          if (res.pacer) state.pacer = { ...state.pacer, ...res.pacer };
          studioStatusMsg = 'Extraída del replay';
          render();
        }
      });

      container.querySelector('#trDeleteBuildBtn')?.addEventListener('click', async () => {
        const idToDel = draftRecipe?.id || state.pacer?.selectedRecipe?.id;
        if (!idToDel || typeof root.settings?.trainingBuildDelete !== 'function') return;
        const res = await root.settings.trainingBuildDelete(idToDel);
        if (res?.ok) {
          draftRecipe = null;
          selectedStepIdx = 0;
          state.armedBuildOrderId = res.armedBuildOrderId;
          state.customBuilds = res.customBuilds;
          if (res.pacer) state.pacer = { ...state.pacer, ...res.pacer };
          studioStatusMsg = 'Eliminada';
          render();
        }
      });

      container.querySelector('#trSaveBuildBtn')?.addEventListener('click', () => saveAndArmCurrentDraft(true));

      container.querySelectorAll('[data-tr-adj-res]').forEach((btn) => {
        btn.addEventListener('click', () => {
          ensureDraftSynced();
          syncDraftInputsFromDom();
          const resKey = btn.dataset.trAdjRes;
          const delta = Number(btn.dataset.trAdjDelta || 0);
          const st = draftRecipe?.steps?.[selectedStepIdx];
          if (!st || !st.alloc) return;
          st.alloc[resKey] = Math.max(0, Math.min(200, Number(st.alloc[resKey] || 0) + delta));
          const tot = st.alloc.food + st.alloc.wood + st.alloc.gold + st.alloc.stone;
          const cap = Math.max(5, Math.ceil((tot + 2) / 5) * 5);
          st.pop = `${String(tot + 1).padStart(2, '0')}/${String(cap).padStart(2, '0')}`;
          if (selectedStepIdx > 0) st.gameSec = Math.max(20, (tot - 3) * 25);
          draftRecipe.isDirty = true;
          render();
        });
      });

      container.querySelector('#trTimeMinus15Btn')?.addEventListener('click', () => {
        ensureDraftSynced(); syncDraftInputsFromDom();
        const st = draftRecipe?.steps?.[selectedStepIdx];
        if (st) { st.gameSec = Math.max(0, Number(st.gameSec || 0) - 15); draftRecipe.isDirty = true; render(); }
      });
      container.querySelector('#trTimePlus15Btn')?.addEventListener('click', () => {
        ensureDraftSynced(); syncDraftInputsFromDom();
        const st = draftRecipe?.steps?.[selectedStepIdx];
        if (st) { st.gameSec = Number(st.gameSec || 0) + 15; draftRecipe.isDirty = true; render(); }
      });

      ['#trStepAgeInput', '#trStepPopInput', '#trStepSecInput', '#trStepTitleInput', '#trStepNoteInput', '#trCreatorName', '#trCreatorCiv'].forEach((sel) => {
        const el = container.querySelector(sel);
        if (el) {
          el.addEventListener('change', () => {
            syncDraftInputsFromDom();
            if (draftRecipe) draftRecipe.isDirty = true;
            render();
          });
        }
      });

      container.querySelector('#trAddStepBtn')?.addEventListener('click', () => {
        ensureDraftSynced(); syncDraftInputsFromDom();
        const cur = draftRecipe.steps[selectedStepIdx] || draftRecipe.steps[draftRecipe.steps.length - 1];
        const prevAlloc = cur?.alloc || { food: 6, wood: 4, gold: 0, stone: 0 };
        const nextWood = prevAlloc.wood + 2;
        const tot = prevAlloc.food + nextWood + prevAlloc.gold + prevAlloc.stone;
        const cap = Math.max(5, Math.ceil((tot + 2) / 5) * 5);
        draftRecipe.steps.splice(selectedStepIdx + 1, 0, {
          id: `st_${Date.now()}`, age: cur?.age || 1,
          pop: `${String(tot + 1).padStart(2, '0')}/${String(cap).padStart(2, '0')}`,
          gameSec: Number(cur?.gameSec || 0) + 50,
          alloc: { food: prevAlloc.food, wood: nextWood, gold: prevAlloc.gold, stone: prevAlloc.stone },
          icons: ['villager', 'wood'], title: 'Nuevo paso táctico', text: 'Nuevo paso táctico', note: '',
        });
        selectedStepIdx += 1;
        draftRecipe.isDirty = true;
        render();
      });

      container.querySelector('#trRemoveStepBtn')?.addEventListener('click', () => {
        ensureDraftSynced();
        if (!draftRecipe || draftRecipe.steps.length <= 1) return;
        draftRecipe.steps.splice(selectedStepIdx, 1);
        selectedStepIdx = Math.max(0, Math.min(draftRecipe.steps.length - 1, selectedStepIdx));
        draftRecipe.isDirty = true;
        render();
      });

      container.querySelector('#trPacerPlayBtn')?.addEventListener('click', togglePacerClock);
      container.querySelector('#trPacerResetBtn')?.addEventListener('click', () => {
        stopPacerClock(); pacerElapsedSec = 0; selectedStepIdx = 0; pacerLastStepIdx = 0; pacerWarnedStepIdx = -1; render();
      });

      container.querySelectorAll('[data-tr-step-jump]').forEach((row) => {
        row.addEventListener('click', () => {
          syncDraftInputsFromDom();
          const stepIdx = Number(row.dataset.trStepJump || 0);
          selectedStepIdx = stepIdx;
          const st = draftRecipe?.steps?.[stepIdx] || state.pacer?.selectedRecipe?.steps?.[stepIdx];
          if (st && pacerRunning) { pacerElapsedSec = st.gameSec; pacerLastStepIdx = stepIdx; }
          else pacerElapsedSec = 0;
          render();
        });
      });

      // Matchups events
      const labMySel = container.querySelector('#trLabMyCiv');
      const labRivSel = container.querySelector('#trLabRivalCiv');
      const currentLabMap = () => container.querySelector('.tr-matchup-lab')?.dataset?.activeMap || state?.matchupWarRoom?.mapSlug || 'arabia';
      const updateLabMatchup = async (mySlug, rivalSlug, mapSlug = null) => {
        if (typeof root.settings?.trainingHighEloConfig !== 'function') return;
        const nextMap = mapSlug || currentLabMap();
        const res = await root.settings.trainingHighEloConfig({ myCivSlug: mySlug, rivalCivSlug: rivalSlug, mapSlug: nextMap });
        if (res?.ok && res.matchupWarRoom) {
          state.matchupWarRoom = res.matchupWarRoom;
          render();
        }
      };
      if (labMySel && labRivSel) {
        labMySel.addEventListener('change', () => updateLabMatchup(labMySel.value, labRivSel.value));
        labRivSel.addEventListener('change', () => updateLabMatchup(labMySel.value, labRivSel.value));
      }
      container.querySelector('#trSwapMatchupBtn')?.addEventListener('click', () => {
        if (labMySel && labRivSel) updateLabMatchup(labRivSel.value, labMySel.value);
      });
      container.querySelectorAll('[data-tr-matchup-map]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mSlug = btn.dataset.trMatchupMap;
          if (labMySel && labRivSel) updateLabMatchup(labMySel.value, labRivSel.value, mSlug);
        });
      });
      container.querySelectorAll('[data-tr-matchup-my]').forEach((pill) => {
        pill.addEventListener('click', () => updateLabMatchup(pill.dataset.trMatchupMy, pill.dataset.trMatchupRival));
      });

      // Lock Veil CTAs
      container.querySelector('#trLockTrialBtn')?.addEventListener('click', () => {
        if (typeof onClaimTrial === 'function') onClaimTrial();
      });
      container.querySelector('#trLockPlanesBtn')?.addEventListener('click', () => {
        if (typeof navToPlanes === 'function') navToPlanes();
      });

      if (activeSubtab === 'techtree' && techTreeCtrl) {
        techTreeCtrl.bindEvents(container);
      }
    }

    async function switchSubtab(tabId) {
      if (!state?.unlocked) return;
      if (!['perf', 'orders', 'matchups', 'arena', 'techtree', 'plan'].includes(tabId)) return;
      const leavingArena = activeSubtab === 'arena' && tabId !== 'arena';
      activeSubtab = tabId;
      if (leavingArena) {
        await handleLeaveArena();
      }
      if (tabId === 'techtree') {
        if (techTreeCtrl && !techTreeCtrl.ui.data) {
          ensureTechTreeLoaded();
          return;
        }
        render();
        return;
      }
      render();
      if (tabId === 'arena' && state?.arena?.locked) {
        ensureLockoutCountdown();
      }
    }

    function bindLockVeilOnly() {
      container.querySelector('#trLockTrialBtn')?.addEventListener('click', () => {
        if (typeof onClaimTrial === 'function') onClaimTrial();
      });
      container.querySelector('#trLockPlanesBtn')?.addEventListener('click', () => {
        if (typeof navToPlanes === 'function') navToPlanes();
      });
    }

    function render() {
      if (!container || !state) return;
      if (!state.unlocked) {
        enforceLockedState();
        // Locked state: render ONLY static illustrative backdrop with `inert` — ZERO Build Order Creator or user data in DOM!
        container.innerHTML = `<div class="tr-root is-locked">
          ${renderLockVeil()}
          <div class="tr-workspace" inert aria-hidden="true">
            ${renderSubnav()}
            ${renderPerfView()}
          </div>
        </div>`;
        bindLockVeilOnly();
        return;
      }
      container.innerHTML = `<div class="tr-root">
        ${renderLockVeil()}
        ${renderWelcomeModal()}
        <div class="tr-workspace">
          ${renderSubnav()}
          ${renderPerfView()}
          ${renderOrdersView()}
          ${renderMatchupsView()}
          ${renderArenaView()}
          ${techTreeCtrl ? techTreeCtrl.renderView(activeSubtab === 'techtree') : ''}
          ${renderPlanView()}
        </div>
      </div>`;
      bindEvents();
      if (root.RelicSmoothMotion && typeof root.RelicSmoothMotion.syncGlideIndicator === 'function') {
        const tabsRow = container.querySelector('.tr-tabs-row');
        const activeTab = tabsRow?.querySelector('.tr-tab.is-active');
        root.RelicSmoothMotion.syncGlideIndicator(tabsRow, activeTab, {
          key: 'training-subtabs',
          axis: 'x',
          className: 'tr-glide-indicator',
        });
      }
    }

    function syncProduct(product, opts = {}) {
      if (typeof opts.trialAvailable === 'boolean') trialAvailable = opts.trialAvailable;
      const nowUnlocked = Boolean(product?.featureAccess?.trainingHub);
      if (!nowUnlocked) {
        enforceLockedState();
        state = {
          ok: true,
          unlocked: false,
          plan: product?.plan || 'free',
          highElo: { hasData: false, sampleSize: 0 },
          customBuilds: [],
          trainingQueue: [],
          missions: [],
          pacer: null,
          matchupWarRoom: null,
          arena: null,
        };
        render();
      } else if (state && !state.unlocked) {
        load();
      }
    }

    async function load() {
      if (typeof root.settings?.trainingGet !== 'function') return;
      const res = await root.settings.trainingGet();
      if (res && res.ok) {
        state = res;
        if (!state.unlocked) {
          enforceLockedState();
          render();
          return;
        }
        showWelcomeModal = !hasSeenWelcome();
        draftRecipe = null;
        if (!arenaSelectedLevel && state.arena?.selectedLevel) {
          arenaSelectedLevel = state.arena.selectedLevel;
        }
        render();
        if (state.unlocked && activeSubtab === 'arena' && state.arena?.locked) {
          ensureLockoutCountdown();
        }
      }
    }

    function applyRealtimeUpdate(updatePayload) {
      if (!state || !updatePayload) return;
      if (updatePayload.unlocked === false) {
        syncProduct({ plan: updatePayload.plan || 'free', featureAccess: { trainingHub: false } });
        return;
      }
      if (!state.unlocked) return;
      if (Array.isArray(updatePayload.missions)) state.missions = updatePayload.missions;
      if (Array.isArray(updatePayload.trainingQueue)) state.trainingQueue = updatePayload.trainingQueue;
      if (Array.isArray(updatePayload.ageTracks)) state.ageTracks = updatePayload.ageTracks;
      if (updatePayload.rank) state.rank = updatePayload.rank;
      render();
    }

    root.addEventListener('keydown', (ev) => {
      if (activeSubtab !== 'arena' || !state?.unlocked || !arenaQuestion || showWelcomeModal || state?.arena?.locked) return;
      const pageEl = container?.closest('.page[data-page="training"]');
      if (!pageEl || !pageEl.classList.contains('active')) return;
      if (!arenaAnswerResult && ['1', '2', '3', '4'].includes(ev.key)) {
        const opt = arenaQuestion.options?.[Number(ev.key) - 1];
        if (opt) {
          ev.preventDefault();
          submitArenaChoice(opt.id, false);
        }
      } else if (arenaAnswerResult && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        fetchNextArenaQuestion(arenaSelectedLevel);
      }
    });

    return {
      load,
      refresh: load,
      render,
      syncProduct,
      setTrialAvailable: (avail) => {
        const next = Boolean(avail);
        if (next === trialAvailable) return;
        trialAvailable = next;
        if (state && !state.unlocked) render();
      },
      switchSubtab,
      onLeavePage: handleLeaveArena,
      applyRealtimeUpdate,
      onRealtimeUpdate: applyRealtimeUpdate,
      stopAllTimers: () => {
        stopPacerClock();
        stopArenaTimer();
        stopLockoutTimer();
      },
    };
  }

  root.TrainingUI = {
    createTrainingUi,
    createTrainingControllerUi: createTrainingUi,
    BO_ACTION_PALETTE,
    resolveAsset,
    resolveCivCrest,
  };
})(typeof window !== 'undefined' ? window : globalThis);
