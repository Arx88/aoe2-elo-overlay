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
      title: 'Sin producir aldeanos (Alta Edad)',
      shortRadar: 'CU Alta Edad',
      pill: 'CU Alta',
      sub: 'Segundos con el Centro Urbano quieto antes de Feudal',
      valSuffix: '',
      betterHint: '↓ Menos segundos es mejor',
    },
    tcIdleFeudalPerTcSec: {
      title: 'Sin producir aldeanos (Feudal)',
      shortRadar: 'CU Feudal',
      pill: 'CU Feudal',
      sub: 'Pausa promedio de cada Centro Urbano en Edad Feudal',
      valSuffix: '',
      betterHint: '↓ Menos segundos es mejor',
    },
    feudalSec: {
      title: 'Llegada a Edad Feudal',
      shortRadar: 'Edad Feudal',
      pill: 'Feudal',
      sub: 'Minuto exacto al completar Edad Feudal',
      valSuffix: '',
      betterHint: '↓ Llegar antes es mejor',
    },
    castleSec: {
      title: 'Llegada a Edad de los Castillos',
      shortRadar: 'Castillos',
      pill: 'Castillos',
      sub: 'Minuto exacto al entrar en Castillos',
      valSuffix: '',
      betterHint: '↓ Llegar antes es mejor',
    },
    dbaDelaySec: {
      title: 'Demora en Hacha de doble filo',
      shortRadar: 'Hacha madera',
      pill: 'Madera',
      sub: 'Segundos desde pisar Feudal hasta mejorar la tala',
      valSuffix: ' tras Feudal',
      betterHint: '↓ Investigarla apenas pisás Feudal',
    },
    eapm: {
      title: 'Ritmo efectivo de acciones (eAPM)',
      shortRadar: 'Ritmo eAPM',
      pill: 'eAPM',
      sub: 'Órdenes reales por minuto (sin clics repetidos)',
      valSuffix: '',
      betterHint: '↑ Más ritmo efectivo es mejor',
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
              if (!state.arena.locked) await fetchNextArenaQuestion(state.arena.unlockedLevel);
              else render();
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

    function renderLockVeil() {
      if (state?.unlocked) return '<div class="tr-lock-veil" hidden></div>';
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
            <p class="tr-lock-lead">Probalo gratis durante 24 horas y medí tu evolución partida a partida.</p>
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
              <button type="button" class="tr-lock-cta" id="trLockTrialBtn">Probar 24 h gratis</button>
              <button type="button" class="tr-lock-link" id="trLockPlanesBtn">Ver planes <span aria-hidden="true">→</span></button>
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

      const renderPendingRow = (it) => {
        const ruleLbl = it.verifyRule?.targetLabel || 'Se evalúa en tu próxima partida (≥ 12 min)';
        const trackingTxt = Number(it.attemptsAfterPin || 0) > 0
          ? `Evaluado en ${it.attemptsAfterPin} ${it.attemptsAfterPin === 1 ? 'partida' : 'partidas'}${it.lastCheckedDisplay ? ` · Último registro: ${it.lastCheckedDisplay}` : ''}`
          : 'En espera de tu próxima partida';
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
            <button type="button" class="tr-q-go" data-tr-q-go="${esc(it.targetTab || 'orders')}">Practicar →</button>
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
          <div class="tr-qc-head">
            <div>
              <span class="eyebrow">SEGUIMIENTO AUTOMÁTICO</span>
              <h4>Objetivos de Mi Plan (${pending.length} activos · ${completed.length} cumplidos)</h4>
            </div>
            ${completed.length ? `<span class="tr-subtab-badge is-em">✓ ${completed.length} ${completed.length === 1 ? 'cumplido' : 'cumplidos'}</span>` : ''}
          </div>
          ${listBody}
        </section>
      </div>`;
    }

    /* ==================== TOP COMMAND NAV (CLEAN RELIC UNDERLINE BAR · 5 CLEAR TABS) ==================== */
    const TAB_HINTS = {
      perf: 'Compará tu última partida con tu promedio en 6 indicadores clave.',
      plan: 'Relic sigue tus próximas partidas y te avisa cuando cumplís cada objetivo.',
      orders: 'Elegí o creá una build order visual para seguirla en vivo en el Overlay.',
      matchups: 'Elegí dos civilizaciones para ver en qué edad tenés ventaja y qué jugar.',
      arena: 'Desbloqueá las 7 unidades respondiendo desafíos de AoE2:DE (3 vidas por día).',
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

      const ladderHtml = levels.map((lv) => {
        const cls = lv.unitUnlocked ? ' is-unlocked' : lv.isCurrentTarget ? ' is-next' : lv.unlocked ? ' is-playable' : ' is-locked';
        const isSel = lv.level === curSelected ? ' is-selected' : '';
        const clickable = lv.unlocked && !a.locked;
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
        stageContent = `<section class="tr-arena-summary">
          <img class="tr-arena-summary-art" src="${resolveAsset(activeCfg.art, 'assets/art/prematch-estandartes.webp')}" alt="" draggable="false" />
          <img class="tr-as-unit" src="${resolveAsset(activeCfg.portrait)}" alt="" draggable="false" />
          <span class="eyebrow">CAMPAÑA DE UNIDADES · ${a.catalogTotal || 410} DESAFÍOS</span>
          <h3>Nivel ${curSelected}/7 · ${esc(activeCfg.rankTitle)}</h3>
          <p>Respondé correctamente para desbloquear <b>${esc(activeCfg.unitName)}</b>. Al tercer fallo del día la Arena se bloquea 24 h.</p>
          <button type="button" class="btn gold tr-cta-sheen" id="trArenaPlayBtn">Comenzar Desafío →</button>
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

    /* ==================== TAB 3: MATCHUPS (56 CIVS · WAR-TABLE) ==================== */
    function renderMatchupsView() {
      const lab = state?.matchupWarRoom || {};
      const myCiv = lab.myCiv || { slug: 'franks', name: 'Francos', role: 'Caballería' };
      const rivalCiv = lab.rivalCiv || { slug: 'hindustanis', name: 'Indostanos', role: 'Camellos y pólvora' };
      const mySlugNorm = String(myCiv.slug || 'franks').toLowerCase() === 'tupis' ? 'tupi' : String(myCiv.slug || 'franks').toLowerCase();
      const rivSlugNorm = String(rivalCiv.slug || 'hindustanis').toLowerCase() === 'tupis' ? 'tupi' : String(rivalCiv.slug || 'hindustanis').toLowerCase();

      const svg = lab.svg || {
        curvePath: 'M0,85 L110,78 L330,48 L550,124 L770,96 L880,96',
        areaFullPath: 'M0,85 L110,78 L330,48 L550,124 L770,96 L880,96 L880,85 L0,85 Z',
        nodes: [{ cx: 110, cy: 78 }, { cx: 330, cy: 48 }, { cx: 550, cy: 124 }, { cx: 770, cy: 96 }],
      };

      const civEntries = Object.entries(CIV_NAMES_ES).sort((a, b) => a[1].localeCompare(b[1]));
      const myOpts = civEntries.map(([slug, label]) => `<option value="${esc(slug)}"${slug === mySlugNorm ? ' selected' : ''}>${esc(label)}</option>`).join('');
      const rivOpts = civEntries.map(([slug, label]) => `<option value="${esc(slug)}"${slug === rivSlugNorm ? ' selected' : ''}>${esc(label)}</option>`).join('');

      const nemesisHtml = (lab.recentMatchups || []).map((m) =>
        `<button type="button" class="tr-nemesis-pill" data-tr-matchup-my="${esc(m.myCiv)}" data-tr-matchup-rival="${esc(m.rivalCiv)}">${esc(m.label)}</button>`
      ).join('');

      const gameplanHtml = (lab.gameplanByAge || []).map((g, idx) => `<div class="tr-age-plan-card tr-stagger-${idx + 1}">
        <div class="tr-age-plan-top">
          <span><img src="${resolveAsset(g.icon, 'assets/icons/ages/feudal.png')}" alt="" draggable="false" />${esc(g.ageLabel)}</span>
          <span class="tr-subtab-badge${g.edge >= 0 ? ' is-em' : ''}">${g.edge >= 0 ? 'Ventaja' : 'Cuidado'}</span>
        </div>
        <strong>${esc(g.bestLine)}</strong>
        <p>${esc(g.advice)}</p>
      </div>`).join('');

      const clashRowsHtml = (lab.clashLines || []).map((row) => {
        const wOwn = Math.max(8, Math.round((row.impOwn / 100) * 140));
        const wRiv = Math.max(8, Math.round((row.impRival / 100) * 140));
        return `<div class="tr-clash-row">
          <span class="tr-clash-label">${esc(row.label)}</span>
          <svg viewBox="0 0 300 14" width="100%" height="14" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="1" width="144" height="12" rx="3" fill="rgba(255,255,255,0.06)"></rect>
            <rect x="${144 - wOwn}" y="1" width="${wOwn}" height="12" rx="3" fill="#78d8a6"></rect>
            <rect x="156" y="1" width="144" height="12" rx="3" fill="rgba(255,255,255,0.06)"></rect>
            <rect x="156" y="1" width="${wRiv}" height="12" rx="3" fill="#ef8a81"></rect>
          </svg>
          <span class="tr-clash-vals mono">${row.impOwn} · ${row.impRival}</span>
        </div>`;
      }).join('');

      const trapsHtml = [
        ...(lab.myTraps || []).map((t) => `<div class="tr-trap-item">
          <strong>${esc(t.title)}</strong>
          <small>${esc(t.detail)}</small>
        </div>`),
        ...(lab.rivalHoles || []).map((h) => `<div class="tr-trap-item is-exploit">
          <strong>${esc(rivalCiv.name)} sin ${esc(h.es)}</strong>
          <small>${esc(h.desc)}</small>
        </div>`),
      ].slice(0, 4).join('') || '<div class="tr-trap-item is-exploit"><strong>Árboles parejos</strong><small>Se define por tempo y control de reliquias.</small></div>';

      const n0 = svg.nodes[0] || { cx: 110, cy: 85 };
      const n1 = svg.nodes[1] || { cx: 330, cy: 85 };
      const n2 = svg.nodes[2] || { cx: 550, cy: 85 };
      const n3 = svg.nodes[3] || { cx: 770, cy: 85 };

      return `<div class="tr-view${activeSubtab === 'matchups' ? ' is-active' : ''}" data-tr-view="matchups">
        <section class="tr-matchup-lab">
          ${nemesisHtml ? `<div class="tr-nemesis-strip"><span class="eyebrow">TUS CRUCES</span>${nemesisHtml}</div>` : ''}

          <div class="tr-war-table-head">
            <img class="tr-war-art-bg" src="assets/art/central-civs.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="tr-war-side is-ally">
              <img class="tr-war-shield-lg" src="${resolveCivCrest(mySlugNorm)}" alt="" draggable="false" />
              <div class="tr-war-select-col">
                <select id="trLabMyCiv" class="field" aria-label="Tu civilización">${myOpts}</select>
                <small>${esc(myCiv.role)}</small>
              </div>
            </div>

            <div class="tr-war-vs">
              <div class="tr-vs-medallion-lg"><span>VS</span></div>
              <button type="button" class="tr-swap-civs-btn" id="trSwapMatchupBtn">⇄ Invertir</button>
            </div>

            <div class="tr-war-side is-rival">
              <div class="tr-war-select-col">
                <select id="trLabRivalCiv" class="field" aria-label="Civilización rival">${rivOpts}</select>
                <small>${esc(rivalCiv.role)}</small>
              </div>
              <img class="tr-war-shield-lg is-rival" src="${resolveCivCrest(rivSlugNorm)}" alt="" draggable="false" />
            </div>
          </div>

          <div class="tr-powerspike-card">
            <div class="tr-ps-header">
              <h3>${esc(lab.verdictTitle || 'Ventanas de poder por edad')}</h3>
              <div class="tr-ps-badges">
                <span class="tr-ps-badge is-gold">${esc(lab.peakWindowLabel || 'Tu pico')}</span>
                <span class="tr-ps-badge is-crimson">${esc(lab.dangerWindowLabel || 'Pico rival')}</span>
              </div>
            </div>

            <svg class="tr-powerspike-svg" viewBox="0 0 880 184" preserveAspectRatio="none" aria-label="Curva de ventaja por edad">
              <defs>
                <linearGradient id="trSpikeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#78d8a6" stop-opacity="0.44"></stop>
                  <stop offset="50%" stop-color="#f2d799" stop-opacity="0.06"></stop>
                  <stop offset="100%" stop-color="#ef8a81" stop-opacity="0.44"></stop>
                </linearGradient>
              </defs>
              <line x1="220" y1="14" x2="220" y2="148" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4"></line>
              <line x1="440" y1="14" x2="440" y2="148" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4"></line>
              <line x1="660" y1="14" x2="660" y2="148" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4"></line>
              <line x1="0" y1="85" x2="880" y2="85" stroke="rgba(242, 215, 153, 0.36)" stroke-width="1.5"></line>
              <text x="14" y="24" fill="#98ecc0" font-size="11" font-weight="700">▲ ${esc(myCiv.name.toUpperCase())}</text>
              <text x="14" y="140" fill="#f5a9a2" font-size="11" font-weight="700">▼ ${esc(rivalCiv.name.toUpperCase())}</text>
              <path d="${esc(svg.areaFullPath)}" fill="url(#trSpikeFill)"></path>
              <path class="tr-spike-stroke" d="${esc(svg.curvePath)}" fill="none" stroke="#f5dfa6" stroke-width="3.2" stroke-linecap="round"></path>
              <circle cx="${n0.cx}" cy="${n0.cy}" r="6.5" fill="${n0.cy <= 85 ? '#78d8a6' : '#ef8a81'}" stroke="#0c1015" stroke-width="2.2"></circle>
              <circle cx="${n1.cx}" cy="${n1.cy}" r="7.5" fill="${n1.cy <= 85 ? '#78d8a6' : '#ef8a81'}" stroke="#0c1015" stroke-width="2.2"></circle>
              <circle cx="${n2.cx}" cy="${n2.cy}" r="7.5" fill="${n2.cy <= 85 ? '#78d8a6' : '#ef8a81'}" stroke="#0c1015" stroke-width="2.2"></circle>
              <circle cx="${n3.cx}" cy="${n3.cy}" r="7.5" fill="${n3.cy <= 85 ? '#78d8a6' : '#ef8a81'}" stroke="#0c1015" stroke-width="2.2"></circle>
              <text x="110" y="170" fill="#cfd8e3" font-size="11.5" font-weight="700" text-anchor="middle">I · ALTA EDAD</text>
              <text x="330" y="170" fill="#f6e1ae" font-size="11.5" font-weight="700" text-anchor="middle">II · FEUDAL</text>
              <text x="550" y="170" fill="#f6e1ae" font-size="11.5" font-weight="700" text-anchor="middle">III · CASTILLOS</text>
              <text x="770" y="170" fill="#cfd8e3" font-size="11.5" font-weight="700" text-anchor="middle">IV · IMPERIAL</text>
            </svg>
          </div>

          <div class="tr-age-gameplan-grid">${gameplanHtml}</div>

          <div class="tr-lab-bottom-split">
            <div class="tr-clash-card">
              <span class="eyebrow">IMPERIAL · ${esc(myCiv.name.toUpperCase())} VS ${esc(rivalCiv.name.toUpperCase())}</span>
              ${clashRowsHtml}
            </div>
            <div class="tr-traps-card">
              <span class="eyebrow">TRAMPAS Y VULNERABILIDADES</span>
              ${trapsHtml}
            </div>
          </div>
        </section>
      </div>`;
    }

    /* ==================== TAB 4: EVOLUCIÓN (SPIDER RADAR + TREND LINE · 100 % REAL) ==================== */
    function buildSpiderRadarSvg(metrics) {
      const cx = 210;
      const cy = 136;
      const R = 86;
      const hexPts = (scale) => Array.from({ length: 6 }, (_, i) => {
        const ang = (-90 + i * 60) * (Math.PI / 180);
        return `${(cx + R * scale * Math.cos(ang)).toFixed(1)},${(cy + R * scale * Math.sin(ang)).toFixed(1)}`;
      }).join(' ');

      const normVal = (m, val) => {
        if (!m || !m.hasSample || !Number.isFinite(val)) return 0.24;
        if (!Number.isFinite(m.bestVal) || !Number.isFinite(m.worstVal) || m.bestVal === m.worstVal) return 0.74;
        const raw = m.direction === 'lower'
          ? (m.worstVal - val) / (m.worstVal - m.bestVal)
          : (val - m.worstVal) / (m.bestVal - m.worstVal);
        return 0.24 + 0.76 * Math.max(0, Math.min(1, raw));
      };

      const curCoords = [];
      const medCoords = [];
      const labelsSvg = [];

      for (let i = 0; i < 6; i += 1) {
        const m = metrics[i] || { key: '', hasSample: false, currentDisplay: '—' };
        const hm = METRIC_HUMAN_META[m.key] || { shortRadar: m.title || '' };
        const ang = (-90 + i * 60) * (Math.PI / 180);
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);

        const rCur = R * normVal(m, m.currentVal);
        const rMed = R * normVal(m, m.medianVal);
        curCoords.push({ x: cx + rCur * cos, y: cy + rCur * sin, hasSample: m.hasSample });
        medCoords.push({ x: cx + rMed * cos, y: cy + rMed * sin });

        const lx = cx + (R + 24) * cos;
        const ly = cy + (R + 22) * sin;
        const anchor = Math.abs(cos) < 0.2 ? 'middle' : (cos > 0 ? 'start' : 'end');
        const valText = m.hasSample ? String(m.currentDisplay || '—').replace('/CU', '').replace(' eAPM', '') : '—';
        labelsSvg.push(`<g>
          <text x="${lx.toFixed(1)}" y="${(ly - 2).toFixed(1)}" text-anchor="${anchor}" fill="#dce5ee" font-size="11.5" font-weight="700">${esc(hm.shortRadar)}</text>
          <text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="${anchor}" fill="#f6e1ae" font-size="11.5" font-weight="750">${esc(valText)}</text>
        </g>`);
      }

      const spokeLines = Array.from({ length: 6 }, (_, i) => {
        const ang = (-90 + i * 60) * (Math.PI / 180);
        return `<line x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(ang)).toFixed(1)}" y2="${(cy + R * Math.sin(ang)).toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>`;
      }).join('');

      return `<svg class="tr-radar-svg" viewBox="0 0 420 274" aria-label="Gráfico de araña de rendimiento real">
        <polygon points="${hexPts(1)}" fill="rgba(10,14,20,0.45)" stroke="rgba(214,184,117,0.32)" stroke-width="1.2"></polygon>
        <polygon points="${hexPts(0.75)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"></polygon>
        <polygon points="${hexPts(0.50)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"></polygon>
        <polygon points="${hexPts(0.25)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"></polygon>
        ${spokeLines}
        <polygon points="${medCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="rgba(120,216,166,0.14)" stroke="#78d8a6" stroke-width="2" stroke-dasharray="5 4"></polygon>
        <polygon points="${curCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="rgba(242,215,153,0.24)" stroke="#f2d799" stroke-width="2.6"></polygon>
        ${curCoords.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.8" fill="${p.hasSample ? '#f2d799' : '#10151b'}" stroke="${p.hasSample ? '#10151b' : '#6c7b88'}" stroke-width="2"></circle>`).join('')}
        ${labelsSvg.join('')}
      </svg>`;
    }

    function buildTrendLineSvg(metric) {
      const hist = Array.isArray(metric?.history) ? metric.history : [];
      if (!hist.length) {
        return '<div class="tr-trend-empty">Sin suficiente muestra histórica para trazar la curva.</div>';
      }
      const W = 460;
      const H = 224;
      const padL = 54;
      const padR = 24;
      const padT = 24;
      const padB = 34;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB;

      const vals = hist.map((h) => Number(h.value)).filter(Number.isFinite);
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const span = Math.max(1, maxV - minV);
      const yFor = (v) => padT + innerH - ((v - minV) / span) * innerH;
      const xFor = (i) => hist.length === 1 ? padL + innerW / 2 : padL + (i / (hist.length - 1)) * innerW;

      const pts = hist.map((h, i) => ({
        x: xFor(i),
        y: hist.length === 1 ? padT + innerH / 2 : yFor(Number(h.value)),
        ...h,
      }));
      const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const areaD = `${lineD} L${pts[pts.length - 1].x.toFixed(1)},${padT + innerH} L${pts[0].x.toFixed(1)},${padT + innerH} Z`;
      const medY = Number.isFinite(metric.medianVal)
        ? (hist.length === 1 ? padT + innerH / 2 : yFor(metric.medianVal))
        : null;

      return `<svg class="tr-trend-svg" viewBox="0 0 ${W} ${H}" aria-label="Curva real de evolución">
        <defs>
          <linearGradient id="trEvoAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f2d799" stop-opacity="0.28"></stop>
            <stop offset="100%" stop-color="#f2d799" stop-opacity="0.00"></stop>
          </linearGradient>
        </defs>
        <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="rgba(255,255,255,0.07)"></line>
        <line x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}" stroke="rgba(255,255,255,0.12)"></line>
        <text x="${padL - 8}" y="${padT + 4}" text-anchor="end" fill="#8f9dab" font-size="10.5">${esc(metric.direction === 'lower' ? (hist.reduce((a, b) => (b.value > a.value ? b : a)).display) : metric.bestDisplay)}</text>
        <text x="${padL - 8}" y="${padT + innerH + 4}" text-anchor="end" fill="#8f9dab" font-size="10.5">${esc(metric.direction === 'lower' ? metric.bestDisplay : (hist.reduce((a, b) => (b.value < a.value ? b : a)).display))}</text>
        ${medY != null ? `<line x1="${padL}" y1="${medY.toFixed(1)}" x2="${W - padR}" y2="${medY.toFixed(1)}" stroke="#78d8a6" stroke-width="1.6" stroke-dasharray="5 4" stroke-opacity="0.72"></line>` : ''}
        ${pts.length >= 2 ? `<path d="${areaD}" fill="url(#trEvoAreaGrad)"></path><path class="tr-spike-stroke" d="${lineD}" fill="none" stroke="#f2d799" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></path>` : ''}
        ${pts.map((p) => {
          const dotColor = p.won === true ? '#78d8a6' : p.won === false ? '#ef8a81' : '#8f9dab';
          const shortMap = String(p.mapName || 'Partida').slice(0, 9);
          return `<g class="tr-trend-node" data-tr-replay-id="${esc(p.matchId)}">
            ${p.isCurrent ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" fill="rgba(242,215,153,0.22)"></circle>` : ''}
            ${p.isBest ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7.5" fill="none" stroke="#78d8a6" stroke-width="1.6"></circle>` : ''}
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.isCurrent ? '5.5' : '4.5'}" fill="${p.isCurrent ? '#faf0d4' : '#182029'}" stroke="#f2d799" stroke-width="2.2"></circle>
            ${p.isCurrent ? `<text x="${p.x.toFixed(1)}" y="${(p.y - 12).toFixed(1)}" text-anchor="middle" fill="#faf0d4" font-size="11.5" font-weight="800">${esc(p.display)}</text>` : ''}
            <text x="${p.x.toFixed(1)}" y="${H - 16}" text-anchor="middle" fill="#9aa8b5" font-size="10.5">${esc(shortMap)}</text>
            <circle cx="${p.x.toFixed(1)}" cy="${H - 6}" r="3" fill="${dotColor}"></circle>
          </g>`;
        }).join('')}
      </svg>`;
    }

    function renderPerfView() {
      let hi = state?.highElo || {};
      const isPerf = activeSubtab === 'perf';

      if ((!hi.hasData || !hi.sampleSize) && !state?.unlocked) {
        hi = {
          hasData: true,
          sampleSize: 12,
          selectedMatchId: 'preview-1',
          replays: [
            { matchId: 'preview-1', civSlug: 'franks', civName: 'Francos', mapName: 'Arabia', won: true },
            { matchId: 'preview-2', civSlug: 'mayans', civName: 'Mayas', mapName: 'Arena', won: true },
            { matchId: 'preview-3', civSlug: 'spanish', civName: 'Españoles', mapName: 'Arabia', won: false },
            { matchId: 'preview-4', civSlug: 'mongols', civName: 'Mongoles', mapName: 'Nómada', won: true },
          ],
          bottlenecks: [{ title: 'Inactividad en Alta Edad Media', severity: 'gold' }],
          metrics: [
            {
              key: 'tcIdleDarkSec', title: 'CU inactivo', direction: 'lower', currentVal: 18, medianVal: 32, bestVal: 9,
              currentDisplay: '0:18', medianDisplay: '0:32', bestDisplay: '0:09', improved: true,
              history: [
                { matchId: 'p1', value: 44, display: '0:44', mapName: 'Arabia', won: false },
                { matchId: 'p2', value: 36, display: '0:36', mapName: 'Arena', won: true },
                { matchId: 'p3', value: 29, display: '0:29', mapName: 'Arabia', won: true },
                { matchId: 'p4', value: 24, display: '0:24', mapName: 'Nómada', won: true },
                { matchId: 'p5', value: 18, display: '0:18', mapName: 'Arabia', won: true, isCurrent: true, isBest: true },
              ],
            },
            { key: 'feudalSec', title: 'Edad Feudal', direction: 'lower', currentVal: 595, medianVal: 618, bestVal: 575, currentDisplay: '9:55', medianDisplay: '10:18', bestDisplay: '9:35', improved: true },
            { key: 'castleSec', title: 'Edad Castillos', direction: 'lower', currentVal: 1180, medianVal: 1240, bestVal: 1120, currentDisplay: '19:40', medianDisplay: '20:40', bestDisplay: '18:40', improved: true },
            { key: 'vills20m', title: 'Aldeanos 20m', direction: 'higher', currentVal: 56, medianVal: 51, bestVal: 60, currentDisplay: '56', medianDisplay: '51', bestDisplay: '60', improved: true },
            { key: 'eapm', title: 'eAPM', direction: 'higher', currentVal: 52, medianVal: 46, bestVal: 58, currentDisplay: '52', medianDisplay: '46', bestDisplay: '58', improved: true },
            { key: 'houseIdleSec', title: 'Encasado', direction: 'lower', currentVal: 14, medianVal: 26, bestVal: 5, currentDisplay: '0:14', medianDisplay: '0:26', bestDisplay: '0:05', improved: true },
          ],
        };
      }

      if (!hi.hasData || !hi.sampleSize) {
        return `<div class="tr-view${isPerf ? ' is-active' : ''}" data-tr-view="perf">
          <div class="tr-empty-hero">
            <img class="tr-empty-bg" src="assets/art/postmatch-v3-cabecera.webp" alt="" draggable="false" />
            <div class="tr-empty-content">
              <img class="tr-empty-crest" src="assets/brand/review-town-center-v1.png" alt="" draggable="false" />
              <span class="eyebrow">PROGRESO</span>
              <h3>Sin replays analizados todavía</h3>
              <p>Jugá una partida o abrí Postmatch para ver tu gráfico de araña y tu curva de evolución.</p>
              <div class="tr-welcome-foot">
                <button type="button" class="btn gold tr-cta-sheen" id="trGoPostmatchBtn">Ir a Postmatch →</button>
                <button type="button" class="btn" data-tr-tab="arena">Jugar en la Arena →</button>
              </div>
            </div>
          </div>
        </div>`;
      }

      const selectedEntry = (hi.replays || []).find((r) => String(r.matchId) === String(hi.selectedMatchId)) || hi.replays?.[0] || {};
      const resLabel = selectedEntry.won === true ? 'Victoria' : selectedEntry.won === false ? 'Derrota' : 'Partida';
      const resTone = selectedEntry.won === true ? ' is-win' : selectedEntry.won === false ? ' is-loss' : '';
      const topBottleneck = (hi.bottlenecks || [])[0] || null;
      const metrics = Array.isArray(hi.metrics) ? hi.metrics : [];
      const activeTrendMetric = metrics.find((m) => m.key === selectedTrendMetricKey) || metrics[0] || null;
      const activeTrendMeta = METRIC_HUMAN_META[activeTrendMetric?.key] || {};

      const replayPills = (hi.replays || []).slice(0, 6).map((r) => {
        const active = String(r.matchId) === String(hi.selectedMatchId);
        const dotCls = r.won === true ? ' is-win' : r.won === false ? ' is-loss' : '';
        return `<button type="button" class="tr-replay-pill${active ? ' is-active' : ''}" data-tr-replay-id="${esc(r.matchId)}">
          <img src="${resolveCivCrest(r.civSlug)}" alt="" draggable="false" />
          <span>${esc(r.mapName)}</span>
          <i class="tr-res-dot${dotCls}"></i>
        </button>`;
      }).join('');

      const trendPillsHtml = metrics.map((m) => {
        const hm = METRIC_HUMAN_META[m.key] || { pill: m.title };
        const act = m.key === activeTrendMetric?.key;
        return `<button type="button" class="tr-trend-pill${act ? ' is-active' : ''}" data-tr-trend-key="${esc(m.key)}">${esc(hm.pill)}</button>`;
      }).join('');

      const metricCardsHtml = metrics.map((m, idx) => {
        const hm = METRIC_HUMAN_META[m.key] || { title: m.title, sub: m.explanation, valSuffix: '' };
        const toneCls = m.isPersonalBest ? ' is-pb' : m.improved === true ? ' is-good' : m.improved === false ? ' is-warn' : '';
        const isSelTrend = m.key === activeTrendMetric?.key ? ' is-selected' : '';
        const shortDelta = m.isPersonalBest
          ? '★ Récord'
          : (m.deltaDisplay ? m.deltaDisplay.replace(' vs tu mediana', '').replace('Igual a tu mediana', 'En tu promedio') : '');
        const cleanVal = m.currentDisplay === 'No medido en este replay'
          ? '—'
          : `${String(m.currentDisplay || '').replace('/CU', '')}${hm.valSuffix || ''}`;

        return `<article class="tr-metric-tile${toneCls}${isSelTrend} tr-stagger-${(idx % 6) + 1}" data-tr-trend-key="${esc(m.key)}">
          <div class="tr-mt-top">
            <img src="${resolveAsset(m.icon, 'assets/icons/postmatch/tempo.webp')}" alt="" draggable="false" />
            <div class="tr-mt-titles">
              <h4>${esc(hm.title)}</h4>
              <small>${esc(hm.sub)}</small>
            </div>
            ${shortDelta ? `<span class="tr-mt-pill${toneCls}">${esc(shortDelta)}</span>` : ''}
          </div>
          <div class="tr-mt-foot-row">
            <strong class="tr-mt-num mono">${esc(cleanVal)}</strong>
            <div class="tr-mt-refs">
              <span>Promedio <b>${esc(m.medianDisplay === 'Sin muestra' ? '—' : String(m.medianDisplay).replace('/CU', ''))}</b></span>
              <span>Récord <b class="is-best">${esc(m.bestDisplay === 'Sin muestra' ? '—' : String(m.bestDisplay).replace('/CU', ''))}</b></span>
            </div>
            <button type="button" class="train-pin-btn is-compact" data-train-pin="1" data-tp-source="Progreso" data-tp-title="${esc(hm.title)}" data-tp-detail="${esc(hm.sub)}" data-tp-metric="${esc(cleanVal)}" data-tp-tab="orders" title="Agregar a Mi Plan (verificación automática en próximas partidas)" aria-label="Agregar a Mi Plan: ${esc(hm.title)}">${renderDumbbellSvg()}</button>
          </div>
        </article>`;
      }).join('');

      return `<div class="tr-view${isPerf ? ' is-active' : ''}" data-tr-view="perf">
        <!-- Slim 1-Row Replay Bar (zero dead black space!) -->
        <section class="tr-evo-topbar">
          <div class="tr-hero-match">
            <img class="tr-evo-shield" src="${resolveCivCrest(selectedEntry.civSlug)}" alt="" draggable="false" />
            <div class="tr-hero-meta">
              <div class="tr-hero-badges">
                <h3>${esc(selectedEntry.mapName || 'Partida')} · ${esc(selectedEntry.civName || 'Civilización')}</h3>
                <span class="tr-res-tag${resTone}">${resLabel}</span>
                <span class="tr-hero-sample">${hi.sampleSize} partidas</span>
              </div>
              <div class="tr-replay-pills">${replayPills}</div>
            </div>
          </div>
          ${topBottleneck ? `<div class="tr-hero-callout${topBottleneck.severity === 'crimson' ? ' is-crimson' : ''}">
            <div class="tr-hc-copy">
              <span class="eyebrow">FOCO DETECTADO</span>
              <strong>${esc(topBottleneck.title)}</strong>
            </div>
            <button type="button" class="train-pin-btn" data-train-pin="1" data-tp-source="Progreso" data-tp-title="${esc(topBottleneck.title)}" data-tp-detail="Detectado en ${esc(selectedEntry.mapName || 'tu partida')}" data-tp-tab="orders" title="Agregar a Mi Plan (verificación automática en próximas partidas)" aria-label="Agregar a Mi Plan">${renderDumbbellSvg()}</button>
          </div>` : ''}
        </section>

        <!-- 2-Panel Visual Charts (100 % Above the Fold!): Spider Radar + Real Trend Line Curve -->
        <section class="tr-evo-charts-2col">
          <article class="tr-chart-panel">
            <div class="tr-cp-head">
              <div>
                <h4>Gráfico de Araña · Esta partida</h4>
                <small>El borde exterior marca tu mejor registro en cada indicador</small>
              </div>
              <div class="tr-radar-legend">
                <span class="is-gold">● Esta partida</span>
                <span class="is-em">┅ Tu mediana</span>
              </div>
            </div>
            ${buildSpiderRadarSvg(metrics)}
          </article>

          <article class="tr-chart-panel">
            <div class="tr-cp-head">
              <div>
                <h4>Curva de evolución</h4>
                <small>${esc(activeTrendMeta.betterHint || '')} · Mediana: <b>${esc(activeTrendMetric?.medianDisplay || '—')}</b> · Récord: <b class="is-best">${esc(activeTrendMetric?.bestDisplay || '—')}</b></small>
              </div>
            </div>
            <div class="tr-trend-pills">${trendPillsHtml}</div>
            ${buildTrendLineSvg(activeTrendMetric)}
          </article>
        </section>

        <!-- Crystal-Clear Human-Labeled Metric Breakdown (clickable to switch line chart!) -->
        <div class="tr-metrics-grid-3">${metricCardsHtml}</div>
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
        if (activeSubtab === 'arena' && !state?.arena?.locked) {
          if (!arenaQuestion) await fetchNextArenaQuestion();
          else if (!arenaAnswerResult) beginQuestionTimer(arenaTimeLeftMs);
        }
      };
      container.querySelector('#trWelcomeStartBtn')?.addEventListener('click', () => closeWelcome('perf'));
      container.querySelector('#trWelcomeSkipBtn')?.addEventListener('click', () => closeWelcome(null));
      container.querySelector('#trWelcomeXBtn')?.addEventListener('click', () => closeWelcome(null));
      container.querySelectorAll('[data-tr-welcome-go]').forEach((card) => {
        card.addEventListener('click', () => closeWelcome(card.dataset.trWelcomeGo));
      });

      container.querySelector('#trOpenGuideBtn')?.addEventListener('click', () => {
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

      container.querySelector('#trGoPostmatchBtn')?.addEventListener('click', () => {
        if (typeof goTo === 'function') goTo('postmatch');
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
          const lvl = Number(btn.dataset.trArenaLevel || 1);
          arenaSelectedLevel = lvl;
          fetchNextArenaQuestion(lvl);
        });
      });
      container.querySelectorAll('[data-tr-ans-id]').forEach((btn) => {
        btn.addEventListener('click', () => submitArenaChoice(btn.dataset.trAnsId, false));
      });

      // Evolución replay & trend-metric selectors
      container.querySelectorAll('[data-tr-replay-id]').forEach((elNode) => {
        elNode.addEventListener('click', async () => {
          const matchId = elNode.dataset.trReplayId;
          if (typeof root.settings?.trainingHighEloConfig === 'function') {
            const res = await root.settings.trainingHighEloConfig({ selectedMatchId: matchId });
            if (res?.ok && res.highElo) {
              state.highElo = res.highElo;
              render();
            }
          }
        });
      });
      container.querySelectorAll('[data-tr-trend-key]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          if (ev.target?.closest?.('[data-train-pin]')) return;
          selectedTrendMetricKey = btn.dataset.trTrendKey;
          render();
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
            studioStatusMsg = res.armedBuildOrderId ? 'Armada en Overlay' : 'Desactivada';
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
      const updateLabMatchup = async (mySlug, rivalSlug) => {
        if (typeof root.settings?.trainingHighEloConfig !== 'function') return;
        const res = await root.settings.trainingHighEloConfig({ myCivSlug: mySlug, rivalCivSlug: rivalSlug });
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
    }

    async function switchSubtab(tabId) {
      if (!['perf', 'orders', 'matchups', 'arena', 'plan'].includes(tabId)) return;
      if (tabId !== 'arena') {
        stopArenaTimer();
      }
      activeSubtab = tabId;
      if (tabId === 'arena' && state?.unlocked && !state?.arena?.locked && !arenaQuestion && !arenaUnlockBanner) {
        await fetchNextArenaQuestion(arenaSelectedLevel);
        return;
      }
      render();
      if (tabId === 'arena') {
        if (state?.arena?.locked) ensureLockoutCountdown();
        else if (arenaQuestion && !arenaAnswerResult && !showWelcomeModal) beginQuestionTimer(arenaTimeLeftMs);
      }
    }

    function render() {
      if (!container || !state) return;
      const lockedCls = state.unlocked ? '' : ' is-locked';
      container.innerHTML = `<div class="tr-root${lockedCls}">
        ${renderLockVeil()}
        ${renderWelcomeModal()}
        <div class="tr-workspace">
          ${renderSubnav()}
          ${renderPerfView()}
          ${renderOrdersView()}
          ${renderMatchupsView()}
          ${renderArenaView()}
          ${renderPlanView()}
        </div>
      </div>`;
      bindEvents();
    }

    async function load() {
      if (typeof root.settings?.trainingGet !== 'function') return;
      showWelcomeModal = !hasSeenWelcome();
      const res = await root.settings.trainingGet();
      if (res && res.ok) {
        state = res;
        draftRecipe = null;
        if (!arenaSelectedLevel && state.arena?.selectedLevel) {
          arenaSelectedLevel = state.arena.selectedLevel;
        }
        render();
        if (state.unlocked && activeSubtab === 'arena') {
          if (state.arena?.locked) ensureLockoutCountdown();
          else if (!arenaQuestion) await fetchNextArenaQuestion(arenaSelectedLevel);
        }
      }
    }

    function applyRealtimeUpdate(updatePayload) {
      if (!state || !updatePayload) return;
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
      switchSubtab,
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
