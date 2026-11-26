/* ============================================================================
   RELIC — Explicador Contextual por Clic Derecho (`ui/help-explainer.js`)
   - Cero ruido visual: no agrega íconos «?» ni pies redundantes.
   - Clic derecho sobre cualquier pestaña, tarjeta, fila, KPI, curiosidad o gráfico
     de Inicio, Central, Postmatch o Entrenamiento abre una guía clara y específica:
       1. Qué mide
       2. Cómo se calcula
       3. En qué influye
   - Resolución estricta de más específico a más general (sub-elemento -> métrica -> módulo).
   - Respeta clic derecho nativo en campos de texto y selecciones para copiar/pegar.
   - 100 % CSP-safe (cero atributos HTML inline) y localizado en es / en / zh-CN.
   ============================================================================ */
(function initRelicHelpExplainer(root) {
  'use strict';

  function getLangGroup() {
    try {
      const loc = String(root.AppI18n?.getLocale?.() || root.document?.documentElement?.lang || 'es-MX').toLowerCase();
      if (loc.startsWith('zh')) return 'zh';
      if (loc.startsWith('en')) return 'en';
      return 'es';
    } catch (_) {
      return 'es';
    }
  }

  function t(key, fallback) {
    try {
      if (root.AppI18n && typeof root.AppI18n.t === 'function') {
        const v = root.AppI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const g = (scope, es, en, zh) => ({ scope, es, en, zh });

  const GUIDES = {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. MÉTRICAS DE TELEMETRÍA Y FUNDAMENTOS INDIVIDUALES
    // ═══════════════════════════════════════════════════════════════════════
    metric_tc_dark: g('central',
      {
        title: 'Inactividad del Centro Urbano (Alta Edad)',
        what: 'Los segundos que tu Centro Urbano estuvo sin entrenar aldeanos ni investigar Telar/Feudal antes de llegar a Edad Feudal.',
        how: 'Cruza tus órdenes reales del .aoe2record con el aviso de llegada a Feudal y el máximo físico de aldeanos de tu civilización (Persas, Malayos, Chinos, Mayas, etc.).',
        why: 'Cada 25 s parado equivale a 1 aldeano menos desde el minuto 5: retrasa tu Feudal y acumula cientos de recursos perdidos.',
      },
      {
        title: 'Dark Age Town Center Idle Time',
        what: 'Seconds your Town Center sat idle without training villagers or researching Loom/Feudal before reaching Feudal Age.',
        how: 'Cross-checks real .aoe2record commands against the Feudal arrival timestamp and your civ’s exact physical villager ceiling.',
        why: 'Every 25s idle costs 1 full villager from minute 5 onward, compounding into hundreds of missing resources.',
      },
      {
        title: '黑暗时代城镇中心空闲时间',
        what: '升封建前城镇中心既未造农也未研发织布机/升级时代的总停顿秒数。',
        how: '结合录像指令与封建到达时间，按所属文明真实加成计算理论上限。',
        why: '每空闲 25 秒就少 1 个农民，直接拖慢整局经济与升级节奏。',
      },
    ),
    metric_tc_feudal: g('training',
      {
        title: 'Inactividad por Centro Urbano (Feudal)',
        what: 'Segundos promedio de pausa por cada Centro Urbano activo durante toda tu Edad Feudal.',
        how: 'Mide el tiempo sin entrenar aldeanos ni investigar Carretilla/Castillos dividido por tus Centros Urbanos activos en Feudal (ajustado a 2.º CU Cumano y bonos de civ).',
        why: 'Mantener el CU produciendo mientras peleás con scouts o arqueros es lo que separa pasar a Castillos primero de quedarte sin economía.',
      },
      {
        title: 'Feudal Age Idle per Town Center',
        what: 'Average idle seconds per active Town Center throughout Feudal Age.',
        how: 'Measures gaps without villager production or Wheelbarrow/Castle research divided by active TCs (including Cuman 2nd TC & civ bonuses).',
        why: 'Keeping villagers queued while microing Feudal fights is the #1 separator between fast Castle timings and falling behind.',
      },
      {
        title: '封建时代单城镇中心空闲',
        what: '封建时代期间平均每座城镇中心的空闲秒数。',
        how: '统计未造农及未研发手推车/城堡时代的时间，按活跃城镇中心数归一化（含库曼双本等文明加成）。',
        why: '一边控兵骚扰一边不断农，是率先升入城堡时代的关键。',
      },
    ),
    metric_tc_gap: g('central',
      {
        title: 'Bache máximo sin órdenes en CU',
        what: 'La pausa continua más larga que pasó tu Centro Urbano sin producir nada.',
        how: 'Busca el hueco más grande entre una orden terminada y la siguiente en tu .aoe2record.',
        why: 'Suele aparecer justo cuando empieza una pelea o te raidean: detecta en qué momento soltás tu macro.',
      },
      {
        title: 'Longest Continuous TC Gap',
        what: 'The single longest stretch your Town Center sat empty with nothing queued.',
        how: 'Finds the largest continuous gap between villager/tech completions and the next queue in your replay.',
        why: 'Typically happens during your first raid or fight — exposes the exact moment macro slips.',
      },
      {
        title: '城镇中心最长连续断档',
        what: '整局中城镇中心连续未造农的最长单次停顿。',
        how: '扫描录像队列空窗找出最大连续停产间隔。',
        why: '往往发生在首次交战或被骚扰时，能定位你漏操作的具体节点。',
      },
    ),
    metric_feudal_time: g('training',
      {
        title: 'Pase a Edad Feudal',
        what: 'El minuto exacto del reloj de juego en el que llegás a Edad Feudal.',
        how: 'Leído directamente del evento oficial de cambio de edad del archivo .aoe2record.',
        why: 'Llegar 30 segundos tarde te hace recibir la primera presión enemiga sin ejército ni defensas listas.',
      },
      {
        title: 'Feudal Age Timing',
        what: 'The exact in-game clock time you reach Feudal Age.',
        how: 'Read directly from the official age-advance event inside your .aoe2record.',
        why: 'Arriving 30s late means facing your opponent’s first raid before your military or walls are ready.',
      },
      {
        title: '到达封建时代时间',
        what: '进入封建时代的准确游戏时钟时间。',
        how: '直接读取 .aoe2record 官方时代升级事件。',
        why: '晚到 30 秒往往意味着在毫无防备时先吃对手第一波骚扰。',
      },
    ),
    metric_castle_time: g('training',
      {
        title: 'Pase a Edad de los Castillos',
        what: 'El minuto de juego en el que alcanzás la Edad de los Castillos.',
        how: 'Extraído del evento oficial de llegada a Castillos en tu replay local.',
        why: 'Llegar antes desbloquea Ballesteros, Jinetes, Asedio y Centros Urbanos extra antes que tu rival pueda responder.',
      },
      {
        title: 'Castle Age Timing',
        what: 'The exact in-game clock time you hit Castle Age.',
        how: 'Extracted directly from the official Castle Age arrival event in your local replay.',
        why: 'Hitting Castle first unlocks Crossbows, Knights, Siege, and extra TCs before your opponent can stabilize.',
      },
      {
        title: '到达城堡时代时间',
        what: '进入城堡时代的准确游戏时钟时间。',
        how: '直接从本地录像官方时代事件提取。',
        why: '抢先升城可率先解锁弩手、骑士、攻城器与多城镇中心扩张。',
      },
    ),
    metric_dba: g('central',
      {
        title: 'Hacha de doble filo (Demora)',
        what: 'Cuántos segundos tardás en investigar la primera mejora de madera después de llegar a Feudal.',
        how: 'Resta el minuto en que clickeaste Hacha de doble filo menos tu minuto de llegada a Feudal.',
        why: 'Aumenta 20% la recolección de madera: cada minuto de retraso son menos granjas, edificios militares y arqueros.',
      },
      {
        title: 'Double-Bit Axe Delay',
        what: 'Seconds between hitting Feudal Age and clicking Double-Bit Axe at the Lumber Camp.',
        how: 'Subtracts your Feudal arrival timestamp from the Double-Bit Axe research command.',
        why: '+20% wood rate immediately funds earlier farms, production buildings, and archers.',
      },
      {
        title: '双刃斧研发延迟',
        what: '到达封建时代后多久才点下第一级伐木科技。',
        how: '录像中研发双刃斧的时间减去封建到达时间。',
        why: '伐木效率 +20%，越早点越早铺农田和军事建筑。',
      },
    ),
    metric_bowsaw: g('central',
      {
        title: 'Sierra de arco (Demora)',
        what: 'Cuántos segundos tardás en investigar Sierra de arco al entrar en Edad de los Castillos.',
        how: 'Mide la diferencia entre tu llegada a Castillos y la orden de investigación en el Campamento Maderero.',
        why: 'Sostiene la madera para añadir 2.º/3.º Centro Urbano, granjas masivas y Taller de Maquinaria de Asedio.',
      },
      {
        title: 'Bow Saw Delay',
        what: 'Seconds after reaching Castle Age before you click Bow Saw.',
        how: 'Differences Castle Age arrival and your Bow Saw research command in the replay.',
        why: 'Fuels the wood surge required for extra TCs, mass farms, and Siege Workshop.',
      },
      {
        title: '弓锯研发延迟',
        what: '进入城堡时代后点下二级伐木科技的延迟秒数。',
        how: '计算升城到达与点下弓锯指令之间的时间差。',
        why: '直接决定你在城堡期能否顺畅拍下多本、大量农田与攻城厂。',
      },
    ),
    metric_townbell: g('central',
      {
        title: 'Disciplina sin Campana Urbana',
        what: 'Porcentaje de partidas donde defendiste raids sin tocar la Campana Urbana.',
        how: 'Detecta la orden específica de Campana Urbana en tus replays (ignora guarecer manualmente grupos puntuales).',
        why: 'Tocar la Campana frena al 100% de tus aldeanos en todo el mapa; guarecer solo el grupo atacado salva tu economía.',
      },
      {
        title: 'No Town Bell Discipline',
        what: 'Percentage of games where you defended raids without ringing the Town Bell.',
        how: 'Detects Town Bell commands in your replays while allowing clean manual garrisoning of threatened villagers.',
        why: 'Ringing the bell idles your entire economy map-wide; manual garrisoning protects woodlines without halting farms.',
      },
      {
        title: '禁用城镇警钟纪律',
        what: '防守骚扰时不按城镇警钟的局数占比。',
        how: '检测录像中是否触发城镇警钟（手动驻扎受威胁农民不扣分）。',
        why: '敲警钟会让全图农民停工，手动框选驻扎可保住整体经济。',
      },
    ),
    metric_market: g('central',
      {
        title: 'Uso del Mercado e Impuesto',
        what: 'Cuánto dependiste de comprar o vender recursos en el Mercado para corregir desbalances.',
        how: 'Cuenta tus transacciones de Mercado en el replay y estima el oro perdido en comisiones.',
        why: 'Un uso puntual acelera Castillos; abusar del Mercado todos los partidos delata un reparto desajustado de aldeanos.',
      },
      {
        title: 'Market Usage & Tax',
        what: 'How heavily you relied on Market trades to fix resource imbalances.',
        how: 'Counts Market buy/sell commands in your replay and estimates gold lost to trade fees.',
        why: 'A strategic trade wins Castle timing; frequent panic trades signal unbalanced villager allocation.',
      },
      {
        title: '市场交易与税损',
        what: '衡量你依赖市场买卖资源救火的频率。',
        how: '统计录像中的市场交易指令并估算手续费损耗。',
        why: '关键时刻用市场能抢升城，但频繁交易说明资源配比失衡。',
      },
    ),
    metric_blacksmith: g('central',
      {
        title: 'Mejoras de Herrería a tiempo',
        what: 'Si investigás ataque y armadura antes o al inicio de las peleas clave (Feudal y Castillos).',
        how: 'Compara el momento en que producís ejército militar con las órdenes de Herrería del replay.',
        why: 'Un +1/+2 de armadura o Emplumado de Flecha duplica la supervivencia de tu ejército y da vuelta combates parejos.',
      },
      {
        title: 'Timely Blacksmith Upgrades',
        what: 'Whether you research key armor and attack upgrades before major Feudal and Castle fights.',
        how: 'Compares army production timestamps against Blacksmith upgrade commands in your replay.',
        why: '+1/+2 armor or Bodkin Arrow dramatically multiplies army trades and turns even fights into snowballs.',
      },
      {
        title: '铁匠铺攻防及时率',
        what: '衡量关键团战前是否及时研发攻防升级。',
        how: '对比军事产出时间与录像中铁匠铺研发时间。',
        why: '多一级防御或锥头箭往往直接决定同等兵力团战的胜负。',
      },
    ),
    metric_control_micro: g('central',
      {
        title: 'Control de combate (Patrullar / Ataque)',
        what: 'Qué proporción de tus órdenes de batalla usan Patrullar o Movimiento de ataque en lugar de clic derecho sobre una sola unidad.',
        how: 'Divide tus órdenes de Patrullar/Ataque entre el total de órdenes de combate del replay.',
        why: 'Evita que tus unidades se traben persiguiendo un solo objetivo y maximiza el daño real en cada choque.',
      },
      {
        title: 'Combat Control (Patrol / Attack-Move)',
        what: 'Share of your combat orders using Patrol or Attack-Move instead of single-target right-clicks.',
        how: 'Divides Patrol and Attack-Move commands by total combat orders in the replay.',
        why: 'Prevents melee units from bumping around one target and ensures your whole army fights at once.',
      },
      {
        title: '团战操作（巡逻 / 攻击移动）',
        what: '交战指令中使用巡逻与攻击移动的比例。',
        how: '统计录像内巡逻/攻击移动指令占总交战指令的百分比。',
        why: '避免单位追着单个目标卡位，让全部兵力瞬间打出满额输出。',
      },
    ),
    metric_eapm: g('central',
      {
        title: 'Ritmo efectivo (eAPM)',
        what: 'Acciones útiles por minuto reales — cuántas decisiones efectivas tomás sin contar clics repetidos en el mismo punto.',
        how: 'Cuenta solo comandos reales del replay descartando spam (<150 ms) y lo divide por los minutos de partida.',
        why: 'Mide tu capacidad real de manejar economía y ejército a la vez sin saturarte en peleas largas.',
      },
      {
        title: 'Effective Actions Per Minute (eAPM)',
        what: 'Useful real decisions per minute, filtering out repetitive spam clicks.',
        how: 'Counts valid replay commands after debouncing <150 ms spam, divided by real game minutes.',
        why: 'Measures how smoothly you juggle macro and army micro without dropping production under pressure.',
      },
      {
        title: '有效每分钟操作（eAPM）',
        what: '过滤无效连点后的真实有效决策手速。',
        how: '去除 <150 ms 重复点击后按真实对局分钟数计算。',
        why: '反映高强度对战中同时兼顾经济运营与前线微操的能力。',
      },
    ),
    metric_age_timings: g('central',
      {
        title: 'Tiempos de Llegada a Edades',
        what: 'El reloj exacto en el que alcanzás Feudal, Castillos e Imperial.',
        how: 'Extraído directamente de los eventos de cambio de edad del archivo .aoe2record.',
        why: 'Llegar antes que tu rival te da iniciativa de mapa, unidades superiores y control de colinas y reliquias.',
      },
      {
        title: 'Age-Up Timings',
        what: 'Exact game clock when you reach Feudal, Castle, and Imperial Age.',
        how: 'Read directly from official age-advance events in your .aoe2record.',
        why: 'Hitting power-spike ages first grants map control, tech advantage, and relic dominance.',
      },
      {
        title: '各时代升级时间',
        what: '到达封建、城堡和帝王时代的准确时间节点。',
        how: '直接读取本地录像的官方时代事件。',
        why: '更早到时代意味着兵种压制、地图主动权与圣物优势。',
      },
    ),

    // ═══════════════════════════════════════════════════════════════════════
    // 2. INICIO (WELCOME HOME) — CADA SUB-MÓDULO INDIVIDUAL
    // ═══════════════════════════════════════════════════════════════════════
    wh_gold_hero: g('home',
      {
        title: 'Oro recaudado esta semana (Lunes a Domingo)',
        what: 'El oro acumulado por tu actividad competitiva de esta semana calendario fija.',
        how: 'Suma cada partida jugada entre el lunes 00:00 y el domingo 23:59 (con bonus por victorias, replays y misiones) y se reinicia a 0 cada lunes.',
        why: 'Te da un pulso claro de constancia semanal que siempre arranca parejo los lunes para compararte semana contra semana.',
      },
      {
        title: 'Weekly Gold Collected (Monday–Sunday)',
        what: 'Gold earned from your ranked activity inside this fixed calendar week.',
        how: 'Totals matches played from Monday 00:00 to Sunday 23:59 (with bonuses for wins, replays, and goals) and resets cleanly every Monday.',
        why: 'Gives you a stable, predictable weekly cadence without rolling 7-day drift.',
      },
      {
        title: '本周累计金币（周一至周日）',
        what: '当前固定自然周内通过排位对局累计获得的金币。',
        how: '统计周一 00:00 至周日 23:59 的对局与胜场奖励，每周一 0 点清零重算。',
        why: '提供清晰的自然周活跃度节奏，方便每周横向对比。',
      },
    ),
    wh_gold_rank: g('home',
      {
        title: 'Rango del Tesoro Semanal',
        what: 'Tu nivel de actividad semanal según el oro recaudado de lunes a domingo.',
        how: 'Avanza automáticamente por escalones a medida que jugás y completás partidas en la semana en curso.',
        why: 'Sirve como meta ligera de ritmo semanal para sostener hábito sin quemarte.',
      },
      {
        title: 'Weekly Treasury Rank',
        what: 'Your current weekly tier based on Monday–Sunday gold collected.',
        how: 'Advances through progressive thresholds as you play matches during the current calendar week.',
        why: 'Provides a clean weekly cadence target to keep your practice consistent.',
      },
      {
        title: '本周金库段位',
        what: '根据周一至周日累计金币评定的周活跃等级。',
        how: '随本周完赛场次与金币增长自动晋级。',
        why: '帮助保持稳定规律的每周练习节奏。',
      },
    ),
    wh_activity_strip: g('home',
      {
        title: 'Tira de Actividad Diaria (L M X J V S D)',
        what: 'Qué días de esta semana (de lunes a domingo) jugaste partidas y cuánto oro aportó cada día.',
        how: 'Cada columna fija representa un día de la semana calendario actual; la altura muestra el volumen de ese día.',
        why: 'Te muestra de un vistazo tu regularidad semanal: sesiones cortas y constantes rinden mucho más que maratones agotadores.',
      },
      {
        title: 'Daily Activity Strip (Mon–Sun)',
        what: 'Which days of the current Monday–Sunday week you played and how active each day was.',
        how: 'Each fixed bar maps to a day of the current calendar week, scaled by that day’s matches.',
        why: 'Reveals consistency at a glance — steady shorter sessions beat marathon tilt sessions.',
      },
      {
        title: '每日活跃柱状条（周一至周日）',
        what: '展示本周周一至周日每天的对局活跃分布。',
        how: '7 根固定柱对应自然周 7 天，高度反映当日场次。',
        why: '直观检视练习规律性，持续短练远胜疲劳连打。',
      },
    ),
    wh_ledger_villagers: g('home',
      {
        title: 'Aldeanos creados esta semana',
        what: 'Cantidad total de aldeanos entrenados en tus partidas analizadas de esta semana.',
        how: 'Suma todas las órdenes efectivas de aldeanos extraídas de tus replays de lunes a domingo.',
        why: 'Refleja el volumen económico real que produjiste en tus sesiones de la semana.',
      },
      {
        title: 'Villagers Trained This Week',
        what: 'Total villagers trained across your analyzed matches this week.',
        how: 'Sums valid villager production commands from your Monday–Sunday local replays.',
        why: 'Tracks the real economic volume you produced this week.',
      },
      {
        title: '本周训练村民总数',
        what: '本周已分析对局中累计训练的村民总数。',
        how: '汇总周一至周日本地录像中的有效造农指令。',
        why: '体现本周实战经济产出的总体量。',
      },
    ),
    wh_ledger_army: g('home',
      {
        title: 'Ejército entrenado esta semana',
        what: 'Total de unidades militares producidas en tus partidas analizadas de la semana.',
        how: 'Cuenta todas las unidades militares efectivas encargadas en tus replays de lunes a domingo.',
        why: 'Muestra tu volumen de producción militar semanal en conjunto con tu economía.',
      },
      {
        title: 'Military Units Trained This Week',
        what: 'Total military units produced across your analyzed matches this week.',
        how: 'Sums valid military unit production from your Monday–Sunday local replays.',
        why: 'Reflects your weekly military output alongside your villager economy.',
      },
      {
        title: '本周训练军队总数',
        what: '本周已分析对局中产出的军事单位总和。',
        how: '汇总周一至周日本地录像内的有效造兵指令。',
        why: '直观反映本周的军力产出规模。',
      },
    ),
    wh_ledger_castles: g('home',
      {
        title: 'Castillos y Granjas construidos',
        what: 'Cantidad total de Castillos levantados y Granjas sembradas en tus replays de esta semana.',
        how: 'Cuenta los comandos reales de construcción de Castillo y Granja de lunes a domingo.',
        why: 'Resume tanto tu control territorial (Castillos) como tu base alimentaria (Granjas).',
      },
      {
        title: 'Castles & Farms Built',
        what: 'Total Castles erected and Farms seeded across your replays this week.',
        how: 'Counts real Castle and Farm build commands from Monday to Sunday.',
        why: 'Captures both your map-control anchors (Castles) and food backbone (Farms).',
      },
      {
        title: '本周建造城堡与农田数',
        what: '本周录像中累计建造的城堡与农田数量。',
        how: '统计周一至周日录像中的真实建造指令。',
        why: '同时体现控图支点（城堡）与食物底盘（农田）。',
      },
    ),
    wh_ledger_eapm: g('home',
      {
        title: 'Pico de eAPM semanal',
        what: 'Tu minuto más intenso de acciones efectivas registrado esta semana (junto a tu TC de Alta Edad).',
        how: 'Toma el máximo eAPM efectivo verificado en tus replays de la semana calendario actual.',
        why: 'Te muestra tu techo mecánico real de esta semana en los momentos de mayor presión.',
      },
      {
        title: 'Weekly Peak eAPM',
        what: 'Your highest verified effective APM recorded this week alongside Dark Age TC health.',
        how: 'Takes the peak debounced eAPM across your current calendar week’s replays.',
        why: 'Shows your true mechanical ceiling under peak battle pressure this week.',
      },
      {
        title: '本周峰值 eAPM',
        what: '本周录得的最高有效手速峰值（附黑暗时代城镇中心状态）。',
        how: '取本周所有本地录像去重后的最高有效手速。',
        why: '展示你在本周激烈团战中的操作上限。',
      },
    ),
    wh_treasury: g('home',
      {
        title: 'Tesoro Semanal',
        what: 'Resumen de tu oro, rango y volumen producido en la semana calendario actual (lunes a domingo).',
        how: 'Se actualiza automáticamente al terminar cada partida y reinicia el contador cada lunes.',
        why: 'Concentra tu constancia semanal en un solo panel sin mezclar datos viejos.',
      },
      {
        title: 'Weekly Treasury',
        what: 'Overview of your Monday–Sunday gold, rank, and production totals.',
        how: 'Auto-updates after every match and resets cleanly every Monday.',
        why: 'Keeps your weekly momentum clear without rolling-window confusion.',
      },
      {
        title: '每周金库总览',
        what: '汇总本周一至周日的金币、段位与产出数据。',
        how: '每局结束自动更新，每周一重置。',
        why: '一屏掌握本周活跃节奏与成长。',
      },
    ),
    wh_hero_stage: g('home',
      {
        title: 'Foco de Batalla (Inicio)',
        what: 'Tu unidad y estado destacado actual al abrir Relic.',
        how: 'Combina tu actividad reciente y tus accesos directos principales para entrar directo a jugar o analizar.',
        why: 'Te orienta en 2 segundos antes de buscar partida.',
      },
      {
        title: 'Battle Focus Stage',
        what: 'Your live status spotlight and featured unit when launching Relic.',
        how: 'Combines your recent activity with quick navigation into ranked play or analytics.',
        why: 'Orients your session in 2 seconds before queueing.',
      },
      {
        title: '首页战备焦点',
        what: '打开 Relic 时展示的当前活跃状态与特色单位。',
        how: '整合近期状态与核心功能快捷入口。',
        why: '开排前 2 秒快速明确当前重点。',
      },
    ),
    wh_meta_top_wr: g('home',
      {
        title: 'Civilización #1 en Winrate del Meta Global',
        what: 'La civilización con mayor porcentaje de victorias en el ladder mundial durante los últimos días.',
        how: 'Calculado sobre miles de partidas clasificadas recientes del modo seleccionado (1v1 / Team Games).',
        why: 'Te muestra qué civilizaciones están dominando el parche actual para elegirlas o prepararte contra ellas.',
      },
      {
        title: '#1 Global Meta Winrate Civilization',
        what: 'The highest win-rate civilization on the global ranked ladder over the recent window.',
        how: 'Aggregated from thousands of recent ranked games in the selected ladder mode.',
        why: 'Shows which civs currently dominate the patch so you can play or prepare against them.',
      },
      {
        title: '全球胜率第一文明',
        what: '近期全球排位胜率最高的强势文明。',
        how: '基于所选模式近期数万局排位实战统计。',
        why: '快速掌握当前版本答案，方便选人或提前反制。',
      },
    ),
    wh_meta_top_pick: g('home',
      {
        title: 'Civilización Más Elegida del Meta',
        what: 'La civilización con mayor tasa de selección (pick rate) que más probablemente te cruces hoy.',
        how: 'Mide qué porcentaje del total de partidas recientes incluye a esa civilización.',
        why: 'Saber qué civ está jugando todo el mundo te permite preparar de antemano su counter exacto.',
      },
      {
        title: 'Most Picked Meta Civilization',
        what: 'The civilization with the highest pick rate — the opponent you are most likely to queue into today.',
        how: 'Measures what percentage of recent ranked matches feature each civilization.',
        why: 'Knowing the most common opponent lets you prep its counter before queueing.',
      },
      {
        title: '全球出场率最高文明',
        what: '当前排位中最热门、最容易遇到的对手文明。',
        how: '统计各文明在近期排位中的选人占比。',
        why: '提前熟悉热门文明的克制方案，上分事半功倍。',
      },
    ),
    wh_counter_bar: g('home',
      {
        title: 'Counters Recomendados contra el Meta',
        what: 'Las civilizaciones con mejor rendimiento real enfrentando a la civilización dominante del momento.',
        how: 'Extraído de enfrentamientos reales 1v1 de alto nivel indicando porcentaje de victoria y ruta sugerida.',
        why: 'Te da respuestas probadas en el acto cuando una civilización está de moda en el ladder.',
      },
      {
        title: 'Recommended Meta Counter-Picks',
        what: 'Civilizations with the strongest proven win rate against the current #1 meta civ.',
        how: 'Derived from real high-level 1v1 head-to-head matchups with win rate and gameplan route.',
        why: 'Gives you instant, data-backed answers whenever one civ takes over the ladder.',
      },
      {
        title: '版本热门文明推荐克星',
        what: '面对当前最火文明时胜率最高的反制选择。',
        how: '基于高分段 1v1 真实交手胜率与推荐打法生成。',
        why: '当某文明称霸天梯时，直接给出经过验证的反制方案。',
      },
    ),
    wh_maps_bar: g('home',
      {
        title: 'Mapas Más Jugados del Ladder',
        what: 'Distribución porcentual de los mapas que más están saliendo en la rotación actual.',
        how: 'Calculado sobre las partidas clasificadas recientes del modo seleccionado.',
        why: 'Te ayuda a decidir tus bans de mapa y qué aperturas (abiertas o cerradas) te conviene pulir primero.',
      },
      {
        title: 'Most Played Ladder Maps',
        what: 'Percentage breakdown of the maps appearing most frequently in the current map pool.',
        how: 'Aggregated from recent ranked matches in the selected ladder mode.',
        why: 'Helps you pick smart map bans and focus practice on the terrains you actually get.',
      },
      {
        title: '天梯热门地图分布',
        what: '当前排位地图池中出现频率最高的地图占比。',
        how: '基于近期排位对局地图分布实时汇总。',
        why: '帮你更合理地分配禁图名额和开局练习重心。',
      },
    ),
    wh_strip_terrain: g('home',
      {
        title: 'Tu Terreno Reciente',
        what: 'Vista rápida de tus últimos resultados, racha y civilización/mapa más recientes.',
        how: 'Lee directamente tu historial sincronizado de Central.',
        why: 'Te ubica al instante en cómo venís rindiendo hoy antes de abrir el diagnóstico completo.',
      },
      {
        title: 'Your Recent Terrain',
        what: 'Quick snapshot of your latest form, streak, and most recent civs/maps.',
        how: 'Pulled directly from your synced Central history.',
        why: 'Shows your current form at a glance before diving into full Central diagnostics.',
      },
      {
        title: '近期战况速览',
        what: '快速预览你最近的胜负走势、连胜与常用文明地图。',
        how: '直接读取数据中心同步的最新历史记录。',
        why: '无需翻页即可掌握近期手感。',
      },
    ),
    wh_strip_codex: g('home',
      {
        title: 'Dato del Día (Códice AoE2:DE)',
        what: 'Una píldora diaria de conocimiento táctico real sobre mecánicas, counters o bonos de AoE2:DE.',
        how: 'Rota diariamente entre mecánicas verificadas del juego y curiosidades de tus récords.',
        why: 'Aprender un detalle mecánico por día se acumula en ventaja real en partidas parejas.',
      },
      {
        title: 'Fact of the Day (AoE2:DE Codex)',
        what: 'A bite-sized daily tactical tip on real AoE2:DE mechanics, counters, or civ bonuses.',
        how: 'Rotates daily through verified game mechanics and personal milestones.',
        why: 'Absorbing one real mechanical detail per day compounds into sharper in-game decisions.',
      },
      {
        title: '每日帝国小知识',
        what: '每天推送一条经过验证的帝国时代 II 机制、兵种克制或文明细节。',
        how: '每日轮换实战机制与个人亮点记录。',
        why: '日积月累掌握冷门机制，关键对局少踩坑。',
      },
    ),
    wh_strip_training: g('home',
      {
        title: 'Resumen de Sesión de Entrenamiento',
        what: 'Estado actual de tus objetivos activos en Mi Plan y acceso directo al Laboratorio.',
        how: 'Lee tus metas pendientes de Entrenamiento y tu progreso semanal.',
        why: 'Te recuerda qué hábito puntual entrenar en las partidas que vas a jugar hoy.',
      },
      {
        title: 'Training Session Snapshot',
        what: 'Current status of your active My Plan goals with one-click jump into Training.',
        how: 'Reads your active training queue and weekly progress store.',
        why: 'Reminds you which exact habit to focus on in today’s games.',
      },
      {
        title: '训练进度快捷卡',
        what: '展示当前「我的计划」中的进行中目标并提供一键跳转。',
        how: '实时读取本地训练队列与本周进度。',
        why: '提醒你今天排位重点攻克哪项习惯。',
      },
    ),
    wh_news_banner: g('home',
      {
        title: 'Novedades y Anuncios de Relic',
        what: 'Avisos importantes sobre nuevas versiones, parches de AoE2:DE o mejoras del motor.',
        how: 'Se sincroniza livianamente en segundo plano sin interrumpir tus partidas.',
        why: 'Te mantiene al tanto de herramientas nuevas o cambios del juego que impactan el meta.',
      },
      {
        title: 'Relic News & Announcements',
        what: 'Highlights of new Relic updates, AoE2:DE patches, and engine upgrades.',
        how: 'Synced lightly in the background with zero impact on gameplay.',
        why: 'Keeps you up to speed on new features and game balance updates.',
      },
      {
        title: 'Relic 公告与更新快讯',
        what: '展示新版本功能、游戏补丁与引擎升级通知。',
        how: '后台轻量同步，不影响对局性能。',
        why: '第一时间了解新工具与版本变动。',
      },
    ),
    wh_global: g('home',
      {
        title: 'Meta Global de AoE2:DE',
        what: 'Fotografía actual de las civilizaciones y mapas más fuertes y más jugados del ladder.',
        how: 'Agrega miles de partidas clasificadas recientes con counters recomendados.',
        why: 'Te orienta sobre el meta actual antes de entrar a cola.',
      },
      {
        title: 'Global AoE2:DE Meta',
        what: 'Live snapshot of the strongest and most-picked civilizations and maps on the ladder.',
        how: 'Aggregates thousands of recent ranked games plus counter recommendations.',
        why: 'Keeps you informed on the current meta before queueing.',
      },
      {
        title: '全球天梯环境总览',
        what: '展示当前版本最强与最热门的文明及地图格局。',
        how: '汇总近期数万局排位数据与克制推荐。',
        why: '开排前快速了解版本大势。',
      },
    ),

    // ═══════════════════════════════════════════════════════════════════════
    // 3. CENTRAL — PESTAÑAS, HERO KPIs, SPOTLIGHTS, TROFEOS, CURIOSIDADES, ETC.
    // ═══════════════════════════════════════════════════════════════════════
    cx_tab_overview: g('central',
      {
        title: 'Pestaña Resumen (Central)',
        what: 'Tu radiografía general del modo: curva de ELO, ADN competitivo, mejores armas, Hora Dorada, récords y curiosidades.',
        how: 'Combina tu historial oficial clasificado con tus replays locales analizados en un solo tablero.',
        why: 'Te da la visión panorámica de quién sos como jugador y cómo viene tu tendencia.',
      },
      {
        title: 'Overview Tab (Central)',
        what: 'Your full mode snapshot: ELO curve, Competitive DNA, top picks, Golden Hour, records, and curiosities.',
        how: 'Blends official ranked match history with your analyzed local replays.',
        why: 'Gives you the big-picture view of your playstyle and momentum.',
      },
      {
        title: '概览标签页（数据中心）',
        what: '当前模式全景视图：ELO 曲线、竞技 DNA、王牌文明/地图、黄金时段与趣味记录。',
        how: '结合官方排位历史与本地录像深度数据生成。',
        why: '全面把握你的整体风格与走势。',
      },
    ),
    cx_tab_mastery: g('central',
      {
        title: 'Pestaña Civs y Mapas (Central)',
        what: 'Diagnóstico estadístico profundo de cada civilización y cada mapa que jugás.',
        how: 'Aplica filtros de muestra mínima y detecta causas reales detrás de tus mejores y peores picks (sin falsas alarmas).',
        why: 'Te dice exactamente con qué civilizaciones y mapas sumás ELO y cuáles te están frenando.',
      },
      {
        title: 'Civs & Maps Tab (Central)',
        what: 'Deep statistical diagnostics for every civilization and map in your pool.',
        how: 'Uses sample-size guards and causal checks to separate true strengths/leaks from short-term variance.',
        why: 'Shows exactly which civs and maps print ELO and which ones are silently costing you points.',
      },
      {
        title: '文明与地图标签页',
        what: '针对每个常用文明与地图的深度统计诊断。',
        how: '带小样本保护与因果校验，区分真实短板与随机波动。',
        why: '清晰找出帮你上分的王牌以及悄悄掉分的陷阱选择。',
      },
    ),
    cx_tab_intel: g('central',
      {
        title: 'Pestaña Mejora y ELO (Central)',
        what: 'Tu centro de entrenamiento estratégico: Hoja de Ruta al próximo ELO, Academia Personal, Balance de ELO y Antídotos/Fatiga.',
        how: 'Cruza tus replays locales con el impacto real en puntos de ELO de cada hábito, apertura rival y duración de sesión.',
        why: 'Responde la pregunta más importante: qué cambiar hoy para subir los próximos 100 puntos de ELO.',
      },
      {
        title: 'Improvement & ELO Tab (Central)',
        what: 'Your strategic coaching center: ELO Roadmap, Personal Academy, ELO Attribution, and Matchup/Session Fatigue intel.',
        how: 'Crosses local replay habits with real net ELO gain/loss per factor, opponent opening, and session length.',
        why: 'Answers the one question that matters: what to change right now to climb your next 100 ELO.',
      },
      {
        title: '提升与 ELO 标签页',
        what: '进阶核心面板：ELO 路线图、个人学院、净分来源归因与防连败疲劳分析。',
        how: '将本地录像基本功与各因素净增减分数关联分析。',
        why: '精准指出当下最值得改、最能助你冲刺下一个 100 分的突破口。',
      },
    ),
    cx_kpi_elo: g('central',
      {
        title: 'ELO Actual y Pico Histórico',
        what: 'Tu puntuación oficial vigente en el modo seleccionado y el puntaje más alto que alcanzaste.',
        how: 'Leído directamente del ladder oficial de AoE2:DE para el modo activo (o tu mejor modo en Global).',
        why: 'Marca tu banda competitiva actual y cuán cerca estás de romper tu récord personal.',
      },
      {
        title: 'Current & Peak ELO',
        what: 'Your official live rating in this ladder mode along with your all-time peak.',
        how: 'Synced directly from the official AoE2:DE leaderboard for the active mode.',
        why: 'Sets your current skill bracket and shows how close you are to a new personal record.',
      },
      {
        title: '当前 ELO 与历史最高分',
        what: '当前模式的官方实时排位分数与历史峰值。',
        how: '直接同步自帝国时代 II 官方天梯榜。',
        why: '定位你所处的分段以及距离突破个人纪录的差距。',
      },
    ),
    cx_kpi_wins: g('central',
      {
        title: 'Porcentaje de Victorias y Racha',
        what: 'Tu winrate acumulado, balance total de victorias/derrotas y tu racha activa.',
        how: 'Calculado sobre todas las partidas clasificadas registradas en el modo seleccionado.',
        why: 'Un winrate sostenido por encima del 52% indica que estás subiendo de nivel real; una racha negativa larga avisa cuándo conviene pausar.',
      },
      {
        title: 'Win Rate & Active Streak',
        what: 'Your overall win percentage, total W–L record, and live streak in this mode.',
        how: 'Computed across all official ranked games recorded in the selected ladder.',
        why: 'Sustaining >52% means steady climb; spotting a cold streak early helps avoid tilt.',
      },
      {
        title: '胜率与当前连胜/连败',
        what: '当前模式的总胜率、胜负场次及实时连胜/连败状态。',
        how: '汇总该模式全部官方排位战绩。',
        why: '稳定高于 52% 代表持续上分，识别连败苗头可及时止损。',
      },
    ),
    cx_kpi_rank: g('central',
      {
        title: 'Ranking Mundial y Percentil',
        what: 'Tu puesto exacto en la tabla global de jugadores activos y en qué porcentaje superior estás (Top X%).',
        how: 'Posición oficial del ladder dividida por el total de jugadores clasificados del modo.',
        why: 'Pone tu ELO en perspectiva global real: por ejemplo, 1200 ELO ya suele ubicarte en el Top 20–25% mundial.',
      },
      {
        title: 'Global Rank & Percentile',
        what: 'Your exact world leaderboard position and Top % standing among active ranked players.',
        how: 'Official leaderboard rank divided by total active ranked players in that mode.',
        why: 'Puts your rating in real perspective — e.g., 1200 ELO already places you near the Top 20–25% worldwide.',
      },
      {
        title: '全球排名与百分位',
        what: '你在全球活跃排位玩家中的具体名次及前百分之多少。',
        how: '官方天梯排名除以该模式活跃玩家总数。',
        why: '直观感知自己在全球玩家中的真实段位水平。',
      },
    ),
    cx_kpi_eapm: g('central',
      {
        title: 'eAPM Medio del Modo',
        what: 'Tu velocidad promedio de acciones efectivas por minuto en las partidas con replay de este modo.',
        how: 'Promedia el eAPM real (sin spam <150 ms) de todos tus replays locales guardados en este modo.',
        why: 'Sirve como línea base personal para ver si en un mapa o partida puntual jugaste ágil o más lento de lo normal.',
      },
      {
        title: 'Mode Average eAPM',
        what: 'Your average effective actions per minute across analyzed replays in this mode.',
        how: 'Averages debounced eAPM (<150 ms spam filtered) from your saved local replays in this mode.',
        why: 'Acts as your personal mechanical baseline to compare individual matches and maps against.',
      },
      {
        title: '模式平均有效手速（eAPM）',
        what: '当前模式下所有本地录像的平均有效每分钟操作数。',
        how: '对去重后的单局有效手速求均值。',
        why: '作为你的个人操作基准线，用来评估单局或特定地图的发挥状态。',
      },
    ),
    cx_spot_civ: g('central',
      {
        title: 'Tu Arma Secreta (Civilización Estrella)',
        what: 'La civilización con la que conseguís el mejor porcentaje de victorias sostenido en este modo.',
        how: 'Filtra solo civilizaciones con suficientes partidas reales para descartar suerte de 1 o 2 juegos y destaca tu mejor combo de civ + mapa.',
        why: 'Es tu pick más confiable cuando querés asegurar puntos o salir de una mala racha.',
      },
      {
        title: 'Your Secret Weapon (Best Civilization)',
        what: 'The civilization delivering your strongest sustained win rate in this mode.',
        how: 'Requires a minimum match sample to filter out 1–2 game luck and surfaces your best civ + map combo.',
        why: 'Your most reliable comfort pick when you want to climb or snap a cold streak.',
      },
      {
        title: '你的秘密武器（王牌文明）',
        what: '当前模式中稳定胜率最高的拿手文明。',
        how: '设置最低场次门槛排除偶然一两局的运气，并附带最佳文明+地图组合。',
        why: '冲分或止颓时最稳健的首选文明。',
      },
    ),
    cx_spot_map: g('central',
      {
        title: 'Tu Mapa Fortaleza',
        what: 'El mapa donde dominás con el mayor porcentaje de victorias de tu historial.',
        how: 'Compara tu winrate y volumen por mapa respetando un piso mínimo de partidas reales.',
        why: 'Es el terreno ideal para marcar como favorito en la cola clasificada y aprovechar tu ventaja natural.',
      },
      {
        title: 'Your Fortress Map',
        what: 'The map where you hold your highest sustained win rate.',
        how: 'Compares win rate and match volume per map with a minimum sample floor.',
        why: 'The #1 map to star/favorite in the ranked queue to maximize your natural edge.',
      },
      {
        title: '你的主场堡垒地图',
        what: '历史战绩中胜率最高、最擅长的优势地图。',
        how: '在满足最低样本量的前提下对比各图胜率与表现。',
        why: '最值得在排位池中标星优先匹配的地图。',
      },
    ),
    cx_spot_nemesis: g('central',
      {
        title: 'Tu Bestia Negra (Rival / Civ Némesis)',
        what: 'La civilización enemiga contra la cual tenés tu peor historial real en este modo.',
        how: 'Identifica la civ rival con suficiente muestra de cruces donde tu winrate cae más fuerte.',
        why: 'Es el cruce que más te conviene estudiar en Entrenamiento → Matchups para dejar de perder puntos cada vez que aparece.',
      },
      {
        title: 'Your Nemesis Matchup',
        what: 'The opposing civilization that gives you your toughest real win rate in this mode.',
        how: 'Finds the enemy civ with enough games played where your win rate drops the most.',
        why: 'Studying this single matchup in Training → Matchups plugs one of your biggest ELO leaks.',
      },
      {
        title: '你的克星对手文明',
        what: '实战交手中让你胜率跌得最狠的敌方文明。',
        how: '从足量交手记录中找出对你压制力最强的对手文明。',
        why: '去「训练 → 对位指南」重点研究这一组对位，能立刻堵住掉分缺口。',
      },
    ),
    cx_spot_trap: g('central',
      {
        title: 'Trampa Silenciosa (Fuga de ELO)',
        what: 'Un pick frecuente (civilización, mapa o combinación) que jugás seguido pero te está haciendo perder más de lo que ganás.',
        how: 'Cruza frecuencia de uso con porcentaje de victoria bajo para detectar fugas constantes de ELO.',
        why: 'Simplemente banear ese mapa o dejar de elegir esa civ sin práctica previa recupera ELO de inmediato.',
      },
      {
        title: 'Silent Trap (Hidden ELO Leak)',
        what: 'A frequently played civilization, map, or combo that quietly drains your ELO over time.',
        how: 'Combines high play frequency with consistently below-average win rate.',
        why: 'Banning this map or benching the civ until practiced stops an easy-to-fix ELO leak.',
      },
      {
        title: '隐形掉分陷阱',
        what: '你经常选、但胜率持续偏低并悄悄扣分的文明或地图。',
        how: '结合高出场频率与低胜率筛出持续失血的选择。',
        why: '禁掉该图或暂缓使用该文明即可迅速止损。',
      },
    ),
    cx_trophy_upset: g('central',
      {
        title: 'Mayor Batacazo (Matagigantes)',
        what: 'Tu victoria más meritoria contra un rival (o equipo) que tenía mucho más ELO que vos en ese momento.',
        how: 'Calcula la diferencia exacta de ELO entre tu rival y vos al inicio de cada partida ganada y guarda la brecha más grande (+X ELO).',
        why: 'Demuestra el techo real al que podés jugar cuando ejecutás limpio tu plan de partida.',
      },
      {
        title: 'Biggest Upset (Giant Slayer)',
        what: 'Your highest-gap victory against an opponent (or team) rated far above you.',
        how: 'Measures the exact pre-match ELO gap on every win and keeps your largest upset (+X ELO).',
        why: 'Proves the true skill ceiling you can already beat when your execution clicks.',
      },
      {
        title: '最大爆冷逆袭（屠龙纪录）',
        what: '你击败高分段对手（或强队）时分差最大的一场胜利。',
        how: '计算每场胜局赛前双方真实 ELO 分差并记录最大正差值。',
        why: '证明当你发挥顺畅时已经具备击败更高分段对手的上限。',
      },
    ),
    cx_trophy_streak: g('central',
      {
        title: 'Racha Récord de Victorias',
        what: 'La cantidad máxima de partidas ganadas seguidas sin perder una sola vez en este modo.',
        how: 'Recorre cronológicamente todo tu historial del modo contando la cadena más larga de victorias consecutivas (y avisa si sigue activa hoy).',
        why: 'Refleja tus mejores momentos de estado de forma y concentración competitiva.',
      },
      {
        title: 'Record Win Streak',
        what: 'Your longest unbroken streak of consecutive victories in this mode.',
        how: 'Scans your match history chronologically for the longest win chain (and flags if it is still live).',
        why: 'Captures your peak form and mental consistency.',
      },
      {
        title: '最高连胜纪录',
        what: '当前模式中连续获胜不断档的最高场次。',
        how: '按时间顺序扫描战绩统计最长连胜链（若仍在延续会标注活跃）。',
        why: '记录你手感与专注度的巅峰状态。',
      },
    ),
    cx_trophy_session: g('central',
      {
        title: 'Mejor Sesión de ELO',
        what: 'La jornada de juego en la que sumaste la mayor ganancia neta de puntos de ELO (+X ELO).',
        how: 'Agrupa partidas jugadas dentro de una misma sesión (separadas por menos de 2 h) y encuentra tu mayor salto neto de inicio a fin.',
        why: 'Te muestra cuánto podés escalar en un buen día y cuántas partidas duró tu sesión óptima.',
      },
      {
        title: 'Best ELO Session',
        what: 'The single play session where you earned your highest net ELO climb (+X ELO).',
        how: 'Clusters matches played in one continuous session (<2h gap) and picks your biggest net rating jump.',
        why: 'Shows your climbing potential on a locked-in day and how many games your best session lasted.',
      },
      {
        title: '最佳单次上分时段',
        what: '单次连续游玩中净赚 ELO 最多的巅峰场次组合。',
        how: '将间隔小于 2 小时的连续对局归为一次会话，取净涨分最高的一次。',
        why: '展示状态火热时的爆发力及理想单次场次长度。',
      },
    ),
    cx_trophy_fastest: g('central',
      {
        title: 'GG Más Rápido',
        what: 'Tu victoria real más veloz registrada en este modo (en minutos de reloj de juego).',
        how: 'Toma tu triunfo más corto filtrando abandonos instantáneos (<5 min) para contar solo victorias reales por presión temprana.',
        why: 'Muestra tu capacidad de cerrar partidas rápido cuando tu rush o presión inicial golpea duro.',
      },
      {
        title: 'Fastest Real GG',
        what: 'Your quickest real victory recorded in this mode (in game-clock minutes).',
        how: 'Finds your shortest win while excluding instant early resigns (<5 min) so only real early pressure counts.',
        why: 'Highlights your lethality when an opening rush lands cleanly.',
      },
      {
        title: '最快实战速胜',
        what: '排除开局秒退后最快拿下胜利的对局时长。',
        how: '过滤 <5 分钟异常秒退局，记录最短真实胜局时长。',
        why: '体现你前期快攻终结比赛的锋利度。',
      },
    ),
    cx_trophy_epic: g('central',
      {
        title: 'Batalla Más Épica',
        what: 'La victoria más larga que lograste sostener y ganar en guerra total de Imperial / post-Imperial.',
        how: 'Identifica la partida ganada con mayor duración real en tu historial del modo.',
        why: 'Refleja tu temple, resistencia y manejo de guerras de desgaste cuando se acaba el oro del mapa.',
      },
      {
        title: 'Most Epic Battle',
        what: 'The longest battle you survived and won in deep Imperial / post-Imperial trash wars.',
        how: 'Finds your longest winning game duration in the active mode’s history.',
        why: 'Shows your late-game endurance and poise when map gold runs dry.',
      },
      {
        title: '最长史诗鏖战',
        what: '历时最久且最终拿下的大后期拉锯战胜利。',
        how: '在当前模式胜局中提取游戏时长最长的一场。',
        why: '证明你在资源枯竭与大后期消耗战中的韧性。',
      },
    ),
    cx_trophy_pool: g('central',
      {
        title: 'Versatilidad de Pool (Civs Efectivas)',
        what: 'Mide si sos especialista en 1–2 civilizaciones o jugador versátil/random.',
        how: 'Calcula el índice efectivo de diversidad (entropía de tu selección de civs): «1.5 civs» = muy especialista; «8+ civs» = pool muy amplio.',
        why: 'Para subir ELO rápido suele rendir enfocarse en 2–4 civs sólidas en vez de cambiar en cada partida.',
      },
      {
        title: 'Civilization Pool Versatility',
        what: 'Measures whether you are a 1–2 civ specialist or a broad multi-civ / random player.',
        how: 'Computes effective civ diversity (Shannon entropy of your picks): ~1.5 civs = specialist; 8+ = very wide pool.',
        why: 'Tightening your pool to 2–4 core civs is one of the fastest ways to gain consistent ELO.',
      },
      {
        title: '文明池广度（有效文明数）',
        what: '衡量你是专精少数文明还是广泛随机型选手。',
        how: '按文明选择分布计算香农有效多样性：约 1–2 个为绝活哥，8 个以上为全能池。',
        why: '想快速稳步上分，聚焦 2–4 个主力文明通常效率最高。',
      },
    ),
    cx_trophies: g('central',
      {
        title: 'Vitrina de Carrera',
        what: 'Colección de tus hitos individuales: batacazos, rachas, mejor sesión, victoria más rápida, más épica y amplitud de pool.',
        how: 'Cada tarjeta interna se calcula sobre tu historial oficial del modo; hacé clic derecho sobre una tarjeta puntual para ver su detalle exacto.',
        why: 'Resume tus techos competitivos e identidad de jugador.',
      },
      {
        title: 'Career Showcase',
        what: 'Your individual milestones: biggest upset, win streak, best session, fastest/longest win, and civ versatility.',
        how: 'Each inner tile is computed from your mode history — right-click any specific tile for its exact formula.',
        why: 'Highlights your real career peaks and player profile.',
      },
      {
        title: '生涯荣誉橱窗',
        what: '收录爆冷逆袭、连胜、最佳时段、速胜、鏖战与文明池指标。',
        how: '每张小卡独立统计，右键具体卡片可查看详细算法。',
        why: '呈现你的个人竞技高光时刻。',
      },
    ),
    cx_tg_radio: g('central',
      {
        title: 'Radiografía de Team Games',
        what: 'Desglosa tu rendimiento en partidas por equipo según rol (Pocket vs Flank), formato (2v2/3v3/4v4) y si cargás o acompañás.',
        how: 'Deduce tu posición Pocket/Flank en mapas estándar 3v3/4v4 por orden de color (excluyendo nómadas) y compara tu ELO contra tus compañeros.',
        why: 'Te muestra en qué rol y tamaño de equipo rendís mejor para elegir civilización acorde (caballería en Pocket, arqueros en Flank).',
      },
      {
        title: 'Team Games Radiography',
        what: 'Breaks down your team-game performance by role (Pocket vs Flank), team size (2v2/3v3/4v4), and Carry vs Anchor.',
        how: 'Infers Pocket/Flank position from standard team color ordering (excluding nomad starts) and compares your ELO to teammates.',
        why: 'Shows which role and team size you thrive in so you pick cavalry for Pocket or archers for Flank.',
      },
      {
        title: '团战全息透视',
        what: '按内家/边家位置、人数规模（2v2/3v3/4v4）与核心/辅助定位拆解团战表现。',
        how: '在标准团战图依据颜色站位推断内外家（排除游牧），并对比队友分段。',
        why: '明确你最擅长的团战定位，合理分配骑兵/弓手文明。',
      },
    ),
    cx_tg_pocket: g('central',
      {
        title: 'Rendimiento como Pocket (Interior)',
        what: 'Tu porcentaje de victoria cuando salís protegido en el centro de tu equipo en 3v3/4v4.',
        how: 'Filtra tus Team Games estándar donde tu color corresponde a posición interior (excluyendo mapas nómadas).',
        why: 'Como Pocket marcás el ritmo de Caballería y boom económico: si tu WR baja acá, pulí tu Fast Castle o Scouts → Jinetes.',
      },
      {
        title: 'Pocket Role Win Rate',
        what: 'Your win rate when spawning safely in the center position in 3v3/4v4 team games.',
        how: 'Filters standard team maps where your color slot places you as Pocket (excludes nomad starts).',
        why: 'Pockets drive cavalry power spikes and booming — improving Scouts → Knights boosts this immediately.',
      },
      {
        title: '内家（Pocket）胜率',
        what: '3v3/4v4 中出生在队伍内侧安全位时的胜率。',
        how: '筛选标准团战图中位于内家色位的对局（排除游牧）。',
        why: '内家肩负骑兵支援与经济爆发重任，练好斥候转骑士能显著拉升此项胜率。',
      },
    ),
    cx_tg_flank: g('central',
      {
        title: 'Rendimiento como Flank (Borde)',
        what: 'Tu porcentaje de victoria cuando salís en la punta frente al rival directo en 3v3/4v4.',
        how: 'Filtra tus Team Games estándar donde tu color te ubica en el flanco expuesto (excluyendo nómadas).',
        why: 'El Flank aguanta la primera presión y sostiene la línea de Arqueros: muros tempranos y timing de Ballestero definen esta tasa.',
      },
      {
        title: 'Flank Role Win Rate',
        what: 'Your win rate when spawning on the exposed wing facing an enemy directly in 3v3/4v4.',
        how: 'Filters standard team maps where your color slot places you on the Flank (excludes nomad starts).',
        why: 'Flanks anchor early archer pressure and survival — tight walling and Crossbow timing drive this stat.',
      },
      {
        title: '边家（Flank）胜率',
        what: '3v3/4v4 中处于外侧直面敌方压力时的胜率。',
        how: '筛选标准团战图中处于边家色位的对局（排除游牧）。',
        why: '边家决定前线弓手压制与防线稳固，早围墙与快弩手是关键。',
      },
    ),
    cx_color_card: g('central',
      {
        title: 'Color Talismán y Color Mufa',
        what: 'Tu porcentaje de victoria desglosado según el color de jugador que usaste en AoE2:DE (Azul, Rojo, Verde, Amarillo, etc.).',
        how: 'Agrupa tus partidas clasificadas por el color asignado en sala y destaca tu mejor color (talismán) y el peor (mufa) cuando hay muestra suficiente.',
        why: 'Además de ser un dato curioso divertido, en Team Games el color define si jugás Pocket o Flank — por eso algunos colores rinden muy distinto.',
      },
      {
        title: 'Lucky Color & Cursed Color',
        what: 'Your win rate broken down by the in-game player color you played (Blue, Red, Green, Yellow, etc.).',
        how: 'Groups your ranked games by assigned lobby color and highlights your best and worst colors once sample thresholds are met.',
        why: 'Fun trivia in 1v1 — and genuinely strategic in Team Games because color determines Pocket vs Flank spawn!',
      },
      {
        title: '幸运色与魔咒色统计',
        what: '按游戏内玩家颜色（蓝、红、绿、黄等）统计的胜率分布。',
        how: '按对局分配颜色归类并在满足场次后标注最高与最低胜率颜色。',
        why: '单挑中是趣味彩蛋，在团战中还直接反映内外家色位差异。',
      },
    ),
    cx_fun_mirror: g('central',
      {
        title: 'El Espejo (Mirrors)',
        what: 'Tu porcentaje de victoria cuando vos y tu rival juegan exactamente la misma civilización.',
        how: 'Filtra tus partidas 1v1 donde ambos jugadores eligieron la misma civ.',
        why: 'En un mirror no existe excusa de matchup: mide 100% tu ejecución pura (macro, micro y decisiones) frente a tu ELO.',
      },
      {
        title: 'The Mirror (Same-Civ Matchups)',
        what: 'Your win rate when both you and your opponent play the exact same civilization.',
        how: 'Filters 1v1 matches where both players used identical civilizations.',
        why: 'Zero civ-advantage excuses — pure test of execution, macro, and decision-making at your ELO.',
      },
      {
        title: '镜像内战胜率（Mirrors）',
        what: '双方使用完全相同文明时的 1v1 胜率。',
        how: '筛选双方同文明对局计算胜负比。',
        why: '完全排除文明克制因素，纯粹检验同分段下的基本功与临场决策。',
      },
    ),
    cx_fun_meta: g('central',
      {
        title: 'Rendimiento Vs Meta (Top 8 vs Off-Meta)',
        what: 'Cómo te va enfrentando a las 8 civilizaciones más populares del ladder comparado contra picks poco comunes.',
        how: 'Separa tus partidas según si el rival eligió una de las 8 civs más jugadas del parche o una civ fuera del meta.',
        why: 'Si perdés mucho vs Meta, aprender 2 respuestas estándar te dará victorias casi todas las noches; si sufrís off-meta, te cuesta leer sorpresas.',
      },
      {
        title: 'Performance vs Meta (Top 8 vs Off-Meta)',
        what: 'Your win rate against the 8 most popular ladder civilizations compared to uncommon picks.',
        how: 'Splits matches by whether your opponent picked a Top-8 meta civ or an off-meta civ.',
        why: 'Low vs-Meta WR means prepping against popular civs pays off immediately; low off-meta WR points to scouting/adaptation gaps.',
      },
      {
        title: '对抗主流热门文明（Vs Meta）',
        what: '面对排位出场率前 8 主流文明 vs 冷门文明的胜率对比。',
        how: '按对手是否选用前 8 热门文明拆分胜率。',
        why: '打热门胜率低说明急需背熟常规对策；打冷门吃亏则要加强侦察应变。',
      },
    ),
    cx_fun_resign: g('central',
      {
        title: 'Perfil en Derrotas (Guerrero vs GG Temprano)',
        what: 'Mide cuánto tiempo seguís peleando las partidas que terminás perdiendo comparado con el promedio.',
        how: 'Analiza la duración media de tus derrotas para clasificarte entre quien defiende hasta el último aldeano o quien concede rápido al verse atrás.',
        why: 'Tirar GG demasiado temprano te quita remontadas ganables; alargar partidas perdidas 20 minutos desgasta tu energía mental para la siguiente.',
      },
      {
        title: 'Loss Profile (Fighter vs Early GG)',
        what: 'Measures how long you fight on in losing games compared to average.',
        how: 'Analyzes the median duration of your losses to classify whether you fight to the bitter end or resign early.',
        why: 'Resigning too early leaves comebacks on the table; dragging hopeless games drains focus for your next match.',
      },
      {
        title: '败局韧性画像',
        what: '反映你在劣势败局中是坚持反扑还是倾向较早认输。',
        how: '根据败局平均时长判断你的撤退时机倾向。',
        why: '过早 GG 会错失翻盘机会，而无望硬撑则消耗下一局的精力。',
      },
    ),
    cx_fun_hunter: g('central',
      {
        title: 'Estilo Rival (Vs Rush vs Vs Boom)',
        what: 'Indica contra qué estilo enemigo ganás más: rivales agresivos tempranos (Rush) o económicos lentos (Boom).',
        how: 'Compara tu winrate en partidas cortas/agresivas contra partidas largas de desarrollo económico.',
        why: 'Te revela tu debilidad estratégica: si sufrís contra Rush necesitás muros y defensa rápida; si sufrís contra Boom te falta castigar en Feudal/Castillos.',
      },
      {
        title: 'Opponent Style Matchup (vs Rush vs Boom)',
        what: 'Shows whether you score better against early-aggression rushers or greedy late-game boomers.',
        how: 'Compares your win rate against fast-pressure games versus long economic boom games.',
        why: 'Pinpoints strategic vulnerability: weak vs Rush = tighten early walls; weak vs Boom = apply earlier pressure.',
      },
      {
        title: '对手风格克制（抗快攻 vs 破龟缩）',
        what: '对比你面对前期快攻型对手与后期运营型对手的胜率差异。',
        how: '拆分快节奏压制局与长运营局的胜率表现。',
        why: '怕快攻就练早围与防守，怕运营就要加强中期压制节奏。',
      },
    ),
    cx_fun_marathon: g('central',
      {
        title: 'Resaca Post-Maratón (Tras guerra de +45 min)',
        what: 'Tu porcentaje de victoria en la partida inmediata siguiente a una guerra agotadora de más de 45 minutos (vs tras una rápida).',
        how: 'Detecta cada partida que jugaste justo después de una batalla de +45 min en la misma sesión y calcula tu winrate ahí.',
        why: 'Si tu winrate cae fuerte después de una maratón, tomarte 5 minutos de descanso tras una partida larga te ahorra ELO gratis.',
      },
      {
        title: 'Post-Marathon Hangover (After 45m+ Wars)',
        what: 'Your win rate in the very next match immediately following a 45+ minute marathon (vs after a quick game).',
        how: 'Finds matches queued right after a 45m+ war in the same session and computes your resulting win rate.',
        why: 'If your WR drops sharply after marathons, a 5-minute breather after long games protects free ELO.',
      },
      {
        title: '长盘赛后疲劳效应（45 分钟+ 之后）',
        what: '刚打完一场 45 分钟以上消耗战后紧接着下一局的胜率。',
        how: '追踪同一时段内长局之后下一场的胜负表现并与短局后对比。',
        why: '若长盘后胜率骤降，打完大战休息 5 分钟就能稳稳保分。',
      },
    ),
    cx_fun_rematch: g('central',
      {
        title: 'Karma de Revanchas (<24 h)',
        what: 'Cómo te va cuando te volvés a cruzar al mismo oponente en menos de 24 horas (incluyendo revanchas tras perder).',
        how: 'Detecta rivales repetidos en tu historial dentro de una ventana de 24 horas y mide tu porcentaje de victoria en el segundo cruce.',
        why: 'Mide tu capacidad de adaptación táctica: ajustar tu plan al conocer cómo juega el rival suele marcar la diferencia.',
      },
      {
        title: 'Rematch Karma (<24h)',
        what: 'Your win rate when queueing into the exact same opponent again within 24 hours (plus revenge rate after a loss).',
        how: 'Finds repeated opponents inside a 24-hour window and tracks your results on the rematch.',
        why: 'Measures tactical adaptation — adjusting your opening once you know their habits wins rematches.',
      },
      {
        title: '24 小时复仇战胜率',
        what: '24 小时内再次匹配到同一对手时的战绩（含落败后的复仇胜率）。',
        how: '自动识别 24 小时内的重复对手并统计二番战胜率。',
        why: '检验你根据首局信息快速调整战术的临场应变力。',
      },
    ),
    cx_ckpi_tc_dark: g('central',
      {
        title: 'TC Alta Edad (% Actividad)',
        what: 'Porcentaje promedio del tiempo de Alta Edad Media en que tu Centro Urbano estuvo trabajando sin pausas.',
        how: 'Calculado desde tus replays locales analizados (100% = cero segundos parado antes de Feudal).',
        why: 'Superar el 95% garantiza arrancar Feudal con ventaja económica real en la mayoría de partidas.',
      },
      {
        title: 'Dark Age TC Uptime (%)',
        what: 'Average percentage of Dark Age that your Town Center stayed actively producing.',
        how: 'Averaged across your analyzed local replays (100% = zero idle seconds before Feudal).',
        why: 'Staying above 95% ensures you enter Feudal with an immediate villager lead.',
      },
      {
        title: '黑暗时代城镇中心运转率',
        what: '黑暗时代城镇中心保持不间断运转的平均百分比。',
        how: '基于本地录像统计（100% 代表升封建前零空闲）。',
        why: '稳定超过 95% 即可在开局阶段建立扎实农民优势。',
      },
    ),
    cx_ckpi_adrenaline: g('central',
      {
        title: 'Pico de Adrenalina (eAPM máximo)',
        what: 'El minuto de mayor intensidad de acciones efectivas por minuto registrado en tus replays locales.',
        how: 'Detecta la ventana de 1 minuto con más comandos útiles (sin spam <150 ms) y te muestra en qué minuto ocurrió.',
        why: 'Te muestra tu máxima velocidad real bajo presión extrema en el pico de una batalla.',
      },
      {
        title: 'Adrenaline Peak (Max 1-Min eAPM)',
        what: 'Your highest single-minute effective APM burst recorded in your local replays.',
        how: 'Finds your peak debounced 1-minute command window and the match minute it happened.',
        why: 'Reveals your true peak mechanical gear during the fiercest fight of a match.',
      },
      {
        title: '肾上腺素峰值（单分钟最高 eAPM）',
        what: '本地录像中记录到的单分钟最高有效操作爆发值及发生分钟。',
        how: '扫描去重后的逐分钟手速找出最高峰。',
        why: '展示你在高强度团战时的爆发操作上限。',
      },
    ),
    cx_ckpi_siege: g('central',
      {
        title: 'Uso de Asedio',
        what: 'Porcentaje de partidas que llegan a Castillos/Imperial en las que producís maquinaria de asedio (Arietes, Mangonas, Escorpiones, Trabuquetes).',
        how: 'Revisa los comandos de Taller de Maquinaria de Asedio y Castillo en tus replays locales.',
        why: 'Sin asedio es muy difícil cerrar partidas contra muros, Centros Urbanos y Castillos enemigos.',
      },
      {
        title: 'Siege Usage Rate',
        what: 'Percentage of Castle/Imperial matches where you produce siege units (Mangonels, Rams, Scorpions, Trebuchets).',
        how: 'Scans Siege Workshop and Castle trebuchet production commands in your local replays.',
        why: 'Without siege, breaking enemy walls, TCs, and Castles becomes painfully slow and costly.',
      },
      {
        title: '攻城武器使用率',
        what: '进入城堡/帝王时代后制造攻城武器（投石车、冲车、巨投等）的局数占比。',
        how: '统计本地录像内攻城器制造厂与城堡巨投指令。',
        why: '缺乏攻城器往往导致占优却推不动防线而被拖入翻盘。',
      },
    ),
    cx_ckpi_monks: g('central',
      {
        title: 'Uso de Monjes y Reliquias',
        what: 'Porcentaje de partidas largas donde entrenás Monjes para capturar reliquias, curar o frenar caballería.',
        how: 'Detecta producción en Monasterio en tus replays que alcanzan Edad de los Castillos.',
        why: 'Asegurar 3 reliquias equivale a tener varios aldeanos en oro infinito gratis durante todo el late game.',
      },
      {
        title: 'Monk & Relic Usage',
        what: 'Percentage of Castle+ games where you train Monks to contest relics, heal, or counter knights.',
        how: 'Tracks Monastery production commands across replays reaching Castle Age.',
        why: 'Securing 3 relics gives permanent infinite gold income that decides long games.',
      },
      {
        title: '僧侣与圣物使用率',
        what: '进入城堡时代后训练僧侣抢圣物、治疗或招降的局数占比。',
        how: '检测本地录像修道院生产指令。',
        why: '控下 3 件圣物即可在后期获得源源不断的免费黄金。',
      },
    ),
    cx_ckpi_castles: g('central',
      {
        title: 'Castillos Construidos',
        what: 'Promedio o frecuencia con la que levantás Castillos en tus partidas de Castillos/Imperial.',
        how: 'Cuenta las órdenes de construcción de Castillo en tus replays locales.',
        why: 'Los Castillos aseguran colinas estratégicas, oro principal, unidades únicas y Trabuquetes para cerrar la partida.',
      },
      {
        title: 'Castles Built',
        what: 'Frequency/average of Castles constructed across your Castle & Imperial Age replays.',
        how: 'Counts Castle build commands in your saved local replays.',
        why: 'Castles lock down key hills, gold mines, unique units, and Trebuchets to close out games.',
      },
      {
        title: '城堡建造频率',
        what: '在城堡及帝王时代建造城堡的场均数量或占比。',
        how: '统计本地录像内建造城堡指令。',
        why: '城堡用于抢占高地、守护主金并解锁特色兵种与巨投。',
      },
    ),
    cx_ckpi_goldtrash: g('central',
      {
        title: 'Proporción Unidades de Oro vs Basura',
        what: 'Qué porcentaje de tu ejército son unidades de oro (Jinetes, Ballesteros, Águilas) frente a unidades sin oro (Piqueros, Escaramuzadores, Húsares).',
        how: 'Clasifica todas las unidades militares entrenadas en tus replays locales.',
        why: 'Te muestra tu estilo de composición: abusar de basura temprano pierde empuje; depender 100% de oro te seca en late game.',
      },
      {
        title: 'Gold vs Trash Unit Ratio',
        what: 'Percentage of your army composed of gold units (Knights, Crossbows) vs trash units (Pikes, Skirms, Hussars).',
        how: 'Classifies every military unit trained in your local replays.',
        why: 'Too much trash early lacks punch; relying only on gold leaves you vulnerable when mines run dry.',
      },
      {
        title: '黄金兵 vs 垃圾兵比例',
        what: '你的军队中消耗黄金的主力兵种与无金兵种（长枪、掷矛、轻骑）的占比。',
        how: '统计本地录像中所有训练军事单位的类型构成。',
        why: '前期过度出垃圾兵缺乏推进力，大后期不会转垃圾兵则会断金崩盘。',
      },
    ),
    cx_speed_vs_brain: g('central',
      {
        title: 'Velocidad vs Cerebro (Tu eAPM vs Rival)',
        what: 'Compara tu velocidad real contra la de tus rivales y separa tu winrate cuando sos más rápido frente a cuando sos más lento.',
        how: 'Calcula el eAPM de ambos jugadores en cada replay local y muestra incluso tu «victoria más cerebral» (ganada con menos eAPM que el rival).',
        why: 'Demuestra que no necesitás 100 APM para subir: las decisiones y la macro ordenada vencen a los clics vacíos.',
      },
      {
        title: 'Speed vs Brain (Your eAPM vs Opponent)',
        what: 'Compares your eAPM against opponents and splits your win rate when faster vs slower.',
        how: 'Computes debounced eAPM for both sides from local replays, highlighting your smartest win with lower eAPM.',
        why: 'Proves smart macro and clean decisions beat raw click speed.',
      },
      {
        title: '手速 vs 意识（双方 eAPM 对比）',
        what: '对比你与对手的有效手速，并拆分手速更快与更慢时的胜率。',
        how: '从本地录像计算双方 eAPM，并标注以慢打快的「最聪明胜局」。',
        why: '证明合理决策与清晰运营完全可以战胜盲目高 APM。',
      },
    ),
    cx_killer_window: g('central',
      {
        title: 'Tu Ventana Letal (Winrate por Duración)',
        what: 'Muestra en qué tramo de duración de partida (Feudal rápido, Castillos, Imperial temprano o Guerra Larga) ganás más.',
        how: 'Agrupa tu historial clasificado por minutos de juego y resalta en oro tu pico letal y en rojo tu zona débil.',
        why: 'Te indica si te conviene cerrar agresivo antes del minuto 30 o llevar la partida a tu zona de confort en late game.',
      },
      {
        title: 'Your Killer Window (Win Rate by Duration)',
        what: 'Shows which game-length phase (Early Feudal, Castle, Early Imp, or Late War) delivers your highest win rate.',
        how: 'Buckets your ranked matches by in-game duration, highlighting your peak window in gold and weakest in red.',
        why: 'Tells you whether to push aggressively early or steer games into your strongest late-game window.',
      },
      {
        title: '致胜时间窗口（按时长胜率）',
        what: '展示你在前期快攻、中期城堡、早帝王或大后期哪个时段胜率最高。',
        how: '按对局时长分桶统计胜率，金色标出最强窗口、红色标出薄弱期。',
        why: '明确你该抢前期终结，还是把节奏拖入自己的强势阶段。',
      },
    ),
    cx_roadmap: g('central',
      {
        title: 'Hoja de Ruta al Próximo ELO',
        what: 'Los hábitos concretos de RM 1v1 donde más diferencia tenés hoy frente a jugadores de la siguiente franja de 100 ELO.',
        how: 'Usa 100% partidas RM 1v1 reales (sin Team Games) comparando tus medianas contra referencias reales por banda de ELO.',
        why: 'Te ahorra adivinar: atacando las 2 o 3 filas marcadas arriba es el camino más corto a tu próximo escalón de ELO.',
      },
      {
        title: 'Next-ELO Roadmap',
        what: 'The exact RM 1v1 habits where you currently lag behind the next 100-ELO bracket.',
        how: 'Uses pure RM 1v1 replays (zero team-game noise) compared against empirical bracket benchmarks.',
        why: 'Removes guesswork — fixing the top 2–3 rows is the shortest path to your next ELO tier.',
      },
      {
        title: '冲分路线图（下一分段目标）',
        what: '定位你在 1v1 排位中落后于更高 100 分段基准的核心基本功差距。',
        how: '严格仅用 1v1 录像与真实分段统计基准横向对比。',
        why: '优先攻克排在最前的 2–3 项即可最快突破瓶颈。',
      },
    ),
    cx_dna: g('central',
      {
        title: 'ADN Competitivo (Perfil de Jugador)',
        what: 'Radar de 5 ejes de tu estilo natural: Agresión, Macro, Adaptación, Consistencia y Cierre.',
        how: 'Calculado sobre tus últimos partidos y replays reales (duraciones, aperturas, eficiencia económica y victorias en late game).',
        why: 'Te ayuda a elegir civilizaciones y estrategias que encajen con tus fortalezas en vez de jugar a contramano.',
      },
      {
        title: 'Competitive DNA Profile',
        what: '5-axis radar of your natural playstyle: Aggression, Macro, Adaptation, Consistency, and Closing.',
        how: 'Derived from your real match history and replays (durations, openings, economy, and closing stats).',
        why: 'Helps you pick civs and gameplans that play to your natural strengths.',
      },
      {
        title: '竞技 DNA 雷达图',
        what: '从进攻、运营、应变、稳定与终结 5 个维度刻画你的打法风格。',
        how: '综合近期战绩与本地录像特征生成。',
        why: '帮你选择与自身风格契合的文明和战术。',
      },
    ),
    cx_spotlights: g('central',
      {
        title: 'Destacados del Modo',
        what: 'Tus 3–4 cartas protagonistas del modo: Arma Secreta, Mapa Fortaleza y Bestia Negra / Trampa Silenciosa.',
        how: 'Hacé clic derecho sobre cada tarjeta individual para ver exactamente cómo se calcula esa carta.',
        why: 'Te resume tus mayores ventajas y mayores fugas en 3 segundos.',
      },
      {
        title: 'Mode Spotlights',
        what: 'Your top spotlight cards: Secret Weapon, Fortress Map, and Nemesis / Silent Trap.',
        how: 'Right-click any individual spotlight card to see its exact formula.',
        why: 'Surfaces your biggest edges and leaks in 3 seconds.',
      },
      {
        title: '模式焦点卡片',
        what: '汇总王牌文明、主场地图与克星/陷阱卡片。',
        how: '右键任意单张卡片即可查看该项详细说明。',
        why: '3 秒看清最大优势与最大短板。',
      },
    ),
    cx_golden_hour: g('central',
      {
        title: 'Tu Hora Dorada (Reloj Competitivo)',
        what: 'En qué franja horaria del día y qué días de la semana ganás más partidas.',
        how: 'Agrupa tus partidas clasificadas por tu hora local (Mañana, Tarde, Noche, Madrugada) y calcula tu winrate real por bloque.',
        why: 'Jugar ranked en tu franja más lúcida — y evitar la madrugada si tu WR se desploma — protege decenas de puntos de ELO.',
      },
      {
        title: 'Your Golden Hour (Competitive Clock)',
        what: 'Which time of day and days of the week deliver your highest win rate.',
        how: 'Buckets your ranked matches by local time (Morning, Afternoon, Evening, Late Night) and computes win rate per block.',
        why: 'Queueing ranked during your sharpest hours protects easy ELO from late-night fatigue.',
      },
      {
        title: '你的黄金竞技时段',
        what: '展示一天中不同时间段与星期几的胜率表现。',
        how: '按本地时间划分早/午/晚/深夜统计真实排位胜率。',
        why: '把排位留在状态最佳的时段，避开深夜疲劳掉分。',
      },
    ),
    cx_combat_dna: g('central',
      {
        title: 'Huella de Combate (Ejército y Disciplina)',
        what: 'Qué unidades y edificios militares entrenás más seguido junto a tu disciplina de TC, Campana y Herrería.',
        how: 'Analizado 100% desde las órdenes reales de tus replays locales (hacé clic derecho sobre cada KPI inferior para ver su detalle).',
        why: 'Revela si tu ejército es predecible o equilibrado y qué hábitos de combate están flojos.',
      },
      {
        title: 'Combat DNA (Army & Discipline)',
        what: 'Your most-produced military units and workshops alongside TC, Town Bell, and Blacksmith discipline.',
        how: 'Computed 100% from real local replay commands (right-click any KPI below for its specific breakdown).',
        why: 'Shows whether your army mix is balanced and which combat habits need work.',
      },
      {
        title: '作战基因（兵种构成与纪律）',
        what: '统计你最常生产的兵种与军营类型，并附带基本功指标。',
        how: '完全基于本地录像真实指令汇总（右键下方各项指标可看细分说明）。',
        why: '帮你审视出兵习惯是否单一以及基础纪律是否过关。',
      },
    ),
    cx_tempo: g('central',
      {
        title: 'Ritmo Mecánico y Ventana Letal',
        what: 'Combina Velocidad vs Cerebro (tu eAPM frente al rival) con tu Ventana Letal por duración.',
        how: 'Hacé clic derecho sobre el medidor de velocidad o sobre las columnas de duración para ver cada métrica por separado.',
        why: 'Conecta tu ritmo de juego con el momento exacto donde sos más peligroso.',
      },
      {
        title: 'Mechanical Tempo & Killer Window',
        what: 'Combines Speed vs Brain (your eAPM vs opponent) with your Win Rate by match duration.',
        how: 'Right-click either the speed gauge or the duration columns for each specific breakdown.',
        why: 'Connects your mechanical pace to the exact game phase where you win most.',
      },
      {
        title: '操作节奏与致胜窗口',
        what: '结合手速对比与按时长胜率窗口两项分析。',
        how: '右键上方速度仪表或下方时长柱图可分别查看详细说明。',
        why: '将个人手速节奏与最擅长终结比赛的时段对应起来。',
      },
    ),
    cx_clocks: g('central',
      {
        title: 'Reloj de Edades (Victorias vs Derrotas)',
        what: 'Compara a qué minuto llegás a Feudal, Castillos e Imperial cuando ganás frente a cuando perdés.',
        how: 'Separa tus tiempos reales de avance de edad entre partidas ganadas y perdidas.',
        why: 'Muestra al segundo cuánto te cuesta un retraso de 20–40 s al pasar de edad.',
      },
      {
        title: 'Age-Up Clocks (Wins vs Losses)',
        what: 'Compares your Feudal, Castle, and Imperial timings in wins versus losses.',
        how: 'Splits real replay age-advance timestamps between winning and losing games.',
        why: 'Proves to the exact second how much a 20–40s age-up delay impacts your win rate.',
      },
      {
        title: '胜负时代升级时钟对比',
        what: '对比你在胜局与败局中到达封建、城堡、帝王的时间差。',
        how: '按胜负分别统计本地录像中的真实升级时刻。',
        why: '精确量化晚升 20–40 秒对胜负的直接冲击。',
      },
    ),
    cx_civ_diag: g('central',
      {
        title: 'Diagnóstico por Civilización',
        what: 'Rendimiento detallado de cada civilización: winrate, racha reciente, mapas donde funciona y hallazgos causales.',
        how: 'Usa filtros estadísticos (mínimo de partidas, control por mapa y ELO rival) para nunca inventar falsas debilidades.',
        why: 'Te muestra exactamente por qué ganás o perdés con una civ puntual antes de cambiarla o practicarla.',
      },
      {
        title: 'Civilization Diagnostic',
        what: 'Deep breakdown for each civilization: win rate, recent trend, best maps, and causal findings.',
        how: 'Applies statistical sample guards plus map and opponent-ELO controls so noise never triggers fake alarms.',
        why: 'Explains why a civ works or struggles for you before you bench or practice it.',
      },
      {
        title: '单文明深度诊断',
        what: '逐一剖析每个文明的胜率、近期走势、强势图与因果结论。',
        how: '内置小样本与对手分段控制，杜绝误判。',
        why: '让你清楚知道某文明顺手或吃瘪的真正原因。',
      },
    ),
    cx_map_diag: g('central',
      {
        title: 'Diagnóstico por Mapa',
        what: 'Tu desempeño mapa por mapa: winrate, eAPM medio en ese terreno y cuál es tu mejor civilización ahí.',
        how: 'Cruza tu historial oficial con tu eAPM de replays locales y separa mapas abiertos, cerrados e híbridos.',
        why: 'Te ayuda a elegir tus favoritos, decidir tus bans y saber exactamente qué civilización llevar a cada mapa.',
      },
      {
        title: 'Map Diagnostic',
        what: 'Map-by-map breakdown: win rate, average eAPM on that terrain, and your #1 civilization there.',
        how: 'Combines official history with local replay eAPM across open, closed, and hybrid maps.',
        why: 'Guides your map bans, stars, and best civ pick per terrain.',
      },
      {
        title: '单地图深度诊断',
        what: '逐图统计胜率、该图平均手速与你在该图的王牌文明。',
        how: '结合官方战绩与本地录像 eAPM，区分开放图/封闭图/海图。',
        why: '精准指导标星、禁图以及按图选文明。',
      },
    ),
    cx_academy: g('central',
      {
        title: 'Laboratorio de Mejora Personal (Academia)',
        what: 'Evalúa tus notas por Edad (Alta Edad a Imperial) y tus 6 hábitos mecánicos a lo largo de tus últimos replays.',
        how: 'Descarta abandonos menores a 3 min y mide tu evolución real en cada etapa y hábito.',
        why: 'Te muestra en qué edad y en qué hábito específico está tu mayor margen de mejora.',
      },
      {
        title: 'Personal Improvement Academy',
        what: 'Tracks your Age grades (Dark through Imperial) and 6 core mechanical habits across recent replays.',
        how: 'Excludes <3 min early resigns and scores real execution across every age and habit.',
        why: 'Pinpoints the exact age and habit with your highest ELO upside.',
      },
      {
        title: '个人进阶学院',
        what: '追踪近局各时代执行评级与 6 大核心基本功习惯。',
        how: '自动过滤 <3 分钟秒退局，评估各时代真实执行质量。',
        why: '精准锁定提升回报最高的时代与习惯。',
      },
    ),
    cx_acad_focus: g('central',
      {
        title: 'Foco Prioritario de la Academia',
        what: 'La recomendación #1 más rentable detectada hoy en tus replays locales.',
        how: 'Cruza todas tus notas por edad y tus 6 hábitos para elegir el único punto que mayor salto te dará al corregirlo.',
        why: 'Te evita abrumarte: mejorar 1 hábito a la vez funciona mucho mejor que intentar cambiar 6 juntos.',
      },
      {
        title: 'Academy Priority Focus',
        what: 'The #1 highest-leverage habit detected in your local replays right now.',
        how: 'Weighs all age grades and 6 habits to surface the single fix with the biggest payoff.',
        why: 'Fixing one core habit at a time beats trying to change six at once.',
      },
      {
        title: '学院首要突破点',
        what: '当前本地录像中收益最高的第一优先改进建议。',
        how: '综合各时代评分与 6 项习惯自动筛选最核心短板。',
        why: '一次专注攻克一个习惯，进步最快最扎实。',
      },
    ),
    cx_acad_stage: g('central',
      {
        title: 'Nota Histórica por Edad (Academia)',
        what: 'Tu puntuación promedio de ejecución (0 a 100 y nota S–D) en esa edad específica a lo largo de tus replays.',
        how: 'Promedia las calificaciones deterministas de esa edad en tus partidas válidas (≥ 3 min).',
        why: 'Compara rápidamente si sos sólido al principio (Alta Edad/Feudal) pero perdés fuerza en Castillos o Imperial.',
      },
      {
        title: 'Historical Age Grade (Academy)',
        what: 'Your average execution score (0–100 and S–D grade) in this specific age across replays.',
        how: 'Averages deterministic stage ratings for this age across valid matches (≥ 3 min).',
        why: 'Immediately reveals whether you shine early or fade in Castle/Imperial Age.',
      },
      {
        title: '分时代历史评分',
        what: '你在该特定时代的平均执行得分（0–100 与 S–D 评级）。',
        how: '汇总全部有效录像中该时代的确定性评分均值。',
        why: '一眼看出你是开局稳健还是中后期乏力。',
      },
    ),
    cx_elo_attrib: g('central',
      {
        title: 'Balance de ELO (Dónde Ganás y Perdés Puntos)',
        what: 'Desglose real de cuántos puntos netos de ELO te dio o te quitó cada civilización, mapa y patrón.',
        how: 'Suma los cambios reales de ELO (+/−) de cada partida clasificada agrupados por factor.',
        why: 'Un 50% de winrate no cuenta todo: acá ves con números exactos qué te hace subir y qué te hace bajar.',
      },
      {
        title: 'ELO Attribution (Where Points Are Won & Lost)',
        what: 'Net ELO breakdown showing exactly how many points each civ, map, or pattern earned or cost you.',
        how: 'Sums real post-match ELO deltas (+/−) grouped by dimension.',
        why: 'Raw win rate hides magnitude — this shows in exact ELO points what drives your climb.',
      },
      {
        title: 'ELO 净分归因面板',
        what: '按文明、地图与打法精准拆解每项因素为你净赚或净亏的分数。',
        how: '汇总每局官方赛后真实 ELO 变动值并归类。',
        why: '比单纯看胜率更直观，一眼看清谁在帮你上分、谁在拖后腿。',
      },
    ),
    cx_session_intel: g('central',
      {
        title: 'Antídotos y Fatiga de Sesión',
        what: 'Cómo respondés contra aperturas enemigas (Scouts, Arqueros, Fast Castle) y en qué partida seguida de una sesión empieza a caer tu winrate.',
        how: 'Cruza aperturas rivales con tus mejores respuestas y agrupa tus partidas por posición dentro de una sesión (1.ª, 2.ª, 3.ª, 4.ª+ partida).',
        why: 'Te enseña tanto con qué contrarrestar aperturas rivales como cuándo cortar la sesión antes del tilt.',
      },
      {
        title: 'Matchup Antidotes & Session Fatigue',
        what: 'How you fare against enemy openings (Scouts, Archers, Fast Castle) and at which consecutive game your win rate drops from fatigue.',
        how: 'Matches enemy openings to your best counters and groups matches by session game number (1st, 2nd, 3rd, 4th+).',
        why: 'Shows both what counters enemy openings and when to stop queueing before tilt kicks in.',
      },
      {
        title: '开局反制与连打疲劳曲线',
        what: '分析你面对敌方常见开局的胜率，以及连续排位第几局开始因疲劳掉胜率。',
        how: '将对手开局与反制效果匹配，并按单次连续场次序统计胜率衰减。',
        why: '既给克制方案，又提醒你何时见好就收防止连败上头。',
      },
    ),
    cx_chart: g('central',
      {
        title: 'Curva de Evolución de ELO',
        what: 'Trayectoria partida a partida de tu ELO oficial en el modo seleccionado (filtrable por rango de tiempo).',
        how: 'Grafica cada cierre oficial de partida clasificada con tu línea de tendencia y picos.',
        why: 'Distingue una variación normal de un día malo frente a una verdadera subida sostenida o meseta.',
      },
      {
        title: 'ELO Progression Chart',
        what: 'Match-by-match trajectory of your official rating in the active mode.',
        how: 'Plots confirmed post-match official ELO points chronologically.',
        why: 'Separates normal daily variance from real long-term growth or plateaus.',
      },
      {
        title: 'ELO 历史走势曲线',
        what: '当前排位模式下每局结束后的官方分数变化轨迹。',
        how: '按时间顺序绘制每局赛后官方确认分数。',
        why: '帮助你区分正常波动与真实的长期增长。',
      },
    ),
    cx_last_match: g('central',
      {
        title: 'Última Partida Registrada',
        what: 'Resumen rápido de tu partida más reciente en este modo: resultado, cambio de ELO, civilizaciones y mapa.',
        how: 'Sincronizado automáticamente con tu último partido completado (con acceso directo al informe Postmatch).',
        why: 'Te permite revisar al instante el último juego sin buscarlo en la lista.',
      },
      {
        title: 'Latest Recorded Match',
        what: 'Quick summary of your most recent game in this mode: result, ELO delta, civs, and map.',
        how: 'Auto-synced with your newest completed match with direct jump to Postmatch.',
        why: 'Lets you inspect your last game in one click.',
      },
      {
        title: '最近一局战报卡',
        what: '快速预览本模式最新完赛的胜负、分数变动、文明与地图。',
        how: '赛后自动同步并支持一键跳转赛后深度复盘。',
        why: '无需翻找即可第一时间复盘刚结束的对局。',
      },
    ),
    cx_hero: g('central',
      {
        title: 'Cabecera de Perfil y Selector de Modo',
        what: 'Tu identidad de AoE2:DE, estadísticas globales y selector de cola (RM 1v1, RM Team, EW, Global).',
        how: 'Cada modo separa por completo sus métricas, mapas y diagnósticos para no mezclar 1v1 con Team Games.',
        why: 'Permite analizar cada cola por separado con total limpieza.',
      },
      {
        title: 'Profile Header & Mode Switcher',
        what: 'Your AoE2:DE identity, key stats, and queue switcher (RM 1v1, RM Team, EW, Global).',
        how: 'Isolates stats, maps, and diagnostics cleanly per ladder mode.',
        why: 'Keeps 1v1 and Team Game data cleanly separated.',
      },
      {
        title: '档案顶栏与模式切换',
        what: '展示你的游戏档案信息与排位模式切换器（1v1、团战、帝国战争、综合）。',
        how: '不同模式的数据与诊断完全独立隔离。',
        why: '确保单挑与团战数据互不干扰。',
      },
    ),

    // ═══════════════════════════════════════════════════════════════════════
    // 4. POSTMATCH — CADA EDAD, PESTAÑA, INSIGHT Y BLOQUE POR SEPARADO
    // ═══════════════════════════════════════════════════════════════════════
    pm_hero: g('postmatch',
      {
        title: 'Cabecera y Veredicto del Postmatch',
        what: 'Resultado de la partida, mapa, civilizaciones enfrentadas y síntesis en una frase de qué inclinó la balanza.',
        how: 'Cruza los datos oficiales del partido con el diagnóstico determinista de tu archivo .aoe2record.',
        why: 'En 3 segundos sabés el titular real de la partida antes de bajar al detalle técnico.',
      },
      {
        title: 'Postmatch Header & Verdict',
        what: 'Match outcome, map, civilizations, and a one-line summary of what decided the match.',
        how: 'Combines official match metadata with deterministic .aoe2record telemetry.',
        why: 'Gives you the real headline takeaway in 3 seconds.',
      },
      {
        title: '赛后总览与核心结论',
        what: '展示胜负、地图、双方文明及一句话核心胜负手总结。',
        how: '结合官方对局数据与本地录像确定性诊断生成。',
        why: '3 秒内看清本局最关键的成败原因。',
      },
    ),
    pm_trophy: g('postmatch',
      {
        title: 'Banner de Reto / Récord Personal',
        what: 'Te avisa al instante si esta partida rompió un récord personal tuyo o cumplió un objetivo activo de Mi Plan.',
        how: 'Compara automáticamente tus métricas del replay contra tu historial previo y contra tus metas fijadas en Entrenamiento.',
        why: 'Te confirma en vivo cuando tu entrenamiento se tradujo en una mejora real en partida.',
      },
      {
        title: 'Goal & Personal Record Banner',
        what: 'Notifies you immediately if this match broke a personal record or completed an active My Plan goal.',
        how: 'Auto-checks replay telemetry against your past records and pinned training goals.',
        why: 'Confirms live when practice translates into real ranked improvement.',
      },
      {
        title: '目标达成与个人纪录横幅',
        what: '第一时间提示本局是否刷新个人最佳纪录或完成了「我的计划」中的训练目标。',
        how: '自动比对本局录像数据与历史最佳及已固定目标。',
        why: '让每次练习成果在实战中立刻得到正向反馈。',
      },
    ),
    pm_stage_dark: g('postmatch',
      {
        title: 'Calificación de Alta Edad Media',
        what: 'Evalúa la limpieza de tu inicio hasta llegar a Feudal (TC inactivo, tiempo de Feudal y Telar).',
        how: 'Compara tus comandos reales del replay contra el estándar de tu banda de ELO (y tus propias partidas previas).',
        why: 'Una Alta Edad S o A te regala ventaja económica automática durante los primeros 15 minutos.',
      },
      {
        title: 'Dark Age Grade',
        what: 'Scores how cleanly you executed Dark Age up to Feudal (TC idle time, Feudal timing, Loom).',
        how: 'Evaluates deterministic replay commands against your ELO bracket and personal history.',
        why: 'An S or A Dark Age hands you an immediate villager lead for the first 15 minutes.',
      },
      {
        title: '黑暗时代评级',
        what: '评估你升封建前的开局流畅度（城镇中心空闲、封建时间与织布机）。',
        how: '基于录像真实指令对照你所在分段与个人历史打分。',
        why: '稳健的 S/A 级黑暗时代能为你奠定前 15 分钟的领先。',
      },
    ),
    pm_stage_feudal: g('postmatch',
      {
        title: 'Calificación de Edad Feudal',
        what: 'Mide si lograste producir aldeanos sin pausas, investigar Hacha de doble filo y sacar presión/defensa a tiempo.',
        how: 'Evalúa TC inactivo por CU en Feudal, demora de Hacha, producción militar y llegada a Castillos.',
        why: 'Feudal es donde se definen la mayoría de las partidas de 1v1: mantener el CU vivo bajo presión es clave.',
      },
      {
        title: 'Feudal Age Grade',
        what: 'Measures villager continuity, Double-Bit Axe timing, and military tempo during Feudal Age.',
        how: 'Scores Feudal idle per TC, eco-tech delay, military output, and Castle Age timing.',
        why: 'Most 1v1s swing in Feudal — keeping production running while fighting wins games.',
      },
      {
        title: '封建时代评级',
        what: '衡量封建期不断农能力、双刃斧时机与出兵/升城节奏。',
        how: '综合封建单本空闲、经济科技延迟、军力产出与升城时间评分。',
        why: '绝大多数 1v1 在封建期分出优劣，压制同时稳经济最关键。',
      },
    ),
    pm_stage_castle: g('postmatch',
      {
        title: 'Calificación de Edad de los Castillos',
        what: 'Evalúa tu expansión económica (TCs adicionales y Sierra de arco), mejoras de Herrería y ritmo militar de mitad de partida.',
        how: 'Revisa tus órdenes de Castillos del .aoe2record calibradas a tu nivel de ELO.',
        why: 'Es la edad donde se consolida la bola de nieve económica o militar para definir la partida.',
      },
      {
        title: 'Castle Age Grade',
        what: 'Evaluates mid-game expansion (extra TCs, Bow Saw), Blacksmith upgrades, and army momentum.',
        how: 'Scores Castle Age replay commands calibrated to your ELO band.',
        why: 'Castle Age is where economic booms and military snowballs lock in the win.',
      },
      {
        title: '城堡时代评级',
        what: '评估中盘多本扩张、弓锯、铁匠铺升级与主力军力推进节奏。',
        how: '按你的分段标准评估录像中城堡期各项执行。',
        why: '城堡期是滚大经济或军力雪球锁定胜局的黄金阶段。',
      },
    ),
    pm_stage_imperial: g('postmatch',
      {
        title: 'Calificación de Edad Imperial',
        what: 'Evalúa tu capacidad de sostener producción masiva, control de combate, asedio y eAPM en el tramo final.',
        how: 'Mide ritmo de producción, uso de patrullar/ataque, mejoras clave y estabilidad de eAPM en Imperial.',
        why: 'En guerras largas gana quien mantiene todos sus edificios militares produciendo sin colapsar su macro.',
      },
      {
        title: 'Imperial Age Grade',
        what: 'Scores late-game production scaling, combat control, siege pressure, and eAPM endurance.',
        how: 'Measures production volume, patrol/attack-move discipline, upgrades, and late eAPM stability.',
        why: 'Late-game wars are won by whoever keeps military buildings pumping without dropping macro.',
      },
      {
        title: '帝王时代评级',
        what: '评估大后期爆兵规模、团战微操、攻城推进与手速续航。',
        how: '依据录像帝王期的产能、巡逻/攻击移动、科技与 eAPM 稳定性打分。',
        why: '大后期决战拼的是高强度下保持全线不断兵的执行力。',
      },
    ),
    pm_tab_evo: g('postmatch',
      {
        title: 'Pestaña Evolución y Curva (Postmatch)',
        what: 'Muestra tus KPIs clave de la partida comparados contra tu promedio personal y la curva de producción minuto a minuto.',
        how: 'Combina los datos de este replay con tu historial local para resaltar mejoras y récords personales.',
        why: 'Te permite ver si esta partida fue mejor o peor que tu nivel habitual.',
      },
      {
        title: 'Evolution & Curve Tab (Postmatch)',
        what: 'Shows your key match KPIs versus your personal baseline plus the minute-by-minute production curve.',
        how: 'Compares this replay against your local history to flag personal records and improvements.',
        why: 'Shows whether this match was above or below your usual level.',
      },
      {
        title: '走势与曲线标签页（赛后）',
        what: '展示本局核心指标对比个人均值，以及逐分钟产能曲线。',
        how: '将本局与本地历史库比对，标出进步项与个人纪录。',
        why: '快速判断本局发挥是否超出日常水平。',
      },
    ),
    pm_tab_duel: g('postmatch',
      {
        title: 'Pestaña Duelo vs Rival (Postmatch)',
        what: 'Enfrentamiento cara a cara contra tu oponente: quién subió antes a cada edad, aperturas y volumen de producción.',
        how: 'Extrae la telemetría de ambos jugadores desde el mismo archivo .aoe2record sobre el mismo reloj.',
        why: 'Te muestra exactamente en qué momento tu rival te sacó ventaja o dónde lo superaste vos.',
      },
      {
        title: 'Duel vs Opponent Tab (Postmatch)',
        what: 'Head-to-head comparison against your opponent: age-up race, openings, and production output.',
        how: 'Extracts both players’ commands from the exact same .aoe2record on one synchronized clock.',
        why: 'Reveals the exact point where your opponent pulled ahead — or where you broke them.',
      },
      {
        title: '对手直面对比标签页（赛后）',
        what: '与对手逐项硬碰硬对比：各时代升级赛跑、开局路线与产能差距。',
        how: '在同一录像、同一时间轴下并行解析双方指令。',
        why: '直观看到被拉开或反超的具体瞬间。',
      },
    ),
    pm_tab_tech: g('postmatch',
      {
        title: 'Pestaña Mejoras y Producción (Postmatch)',
        what: 'Listado cronológico de tecnologías investigadas (Economía, Herrería, Universidad), edificios militares y disciplina de combate.',
        how: 'Lee todas las órdenes de investigación y construcción registradas en tu .aoe2record.',
        why: 'Te permite auditar al detalle qué mejora te faltó o qué edificio tardaste en levantar.',
      },
      {
        title: 'Upgrades & Production Tab (Postmatch)',
        what: 'Chronological breakdown of researched techs (Eco, Blacksmith, University), military buildings, and combat habits.',
        how: 'Reads all research and building commands directly from your .aoe2record.',
        why: 'Makes it effortless to spot missed upgrades or late production buildings.',
      },
      {
        title: '科技与生产标签页（赛后）',
        what: '按时间列出经济、铁匠铺与大学科技、军事建筑数量及操作纪律。',
        how: '直接读取录像内所有研发与建造记录。',
        why: '一眼查出漏点的重要攻防科技或偏晚的出兵建筑。',
      },
    ),
    pm_ins_ghost: g('postmatch',
      {
        title: 'Aldeanos Fantasma (Costo del TC parado)',
        what: 'Traduce los segundos que tu Centro Urbano estuvo inactivo a aldeanos perdidos y recursos que dejaron de recolectar.',
        how: 'Divide tus segundos de TC inactivo temprano por 25 s/aldeano y estima los recursos que habrían juntado en los minutos siguientes.',
        why: 'Hace tangible el costo invisible: ver «perdiste el equivalente a 7 Jinetes» te ayuda mucho más que un número frío.',
      },
      {
        title: 'Ghost Villagers (Idle TC Cost)',
        what: 'Converts your idle Town Center seconds into missing villagers and the resources they never gathered.',
        how: 'Divides early idle TC seconds by 25s per villager and estimates the lost resource income over subsequent minutes.',
        why: 'Makes hidden macro losses concrete — e.g., seeing how many Knights your idle TC cost you.',
      },
      {
        title: '幽灵村民（城镇中心空闲折损）',
        what: '把城镇中心空闲秒数换算成少造的农民数量及随之损失的资源。',
        how: '按每 25 秒 1 名农民折算，并估算后续数分钟少采集的资源量。',
        why: '将枯燥秒数具象为实战损失（例如少出了多少骑士）。',
      },
    ),
    pm_ins_turning: g('postmatch',
      {
        title: 'Minuto del Quiebre',
        what: 'El tramo exacto de la partida donde la ventaja económica o militar cambió de manos de forma decisiva.',
        how: 'Analiza la diferencia acumulada de producción de aldeanos y ejército entre vos y tu rival en cada segmento del reloj.',
        why: 'Te dice exactamente a qué minuto ir si querés mirar el replay en el juego sin ver 40 minutos enteros.',
      },
      {
        title: 'Turning Point Minute',
        what: 'The exact window in the match where economic or military momentum decisively swung.',
        how: 'Tracks cumulative villager and army production deltas between you and your opponent across match segments.',
        why: 'Tells you the exact minute to jump to when reviewing the replay in-game.',
      },
      {
        title: '局势转折点分钟',
        what: '指出本局经济或军力天平决定性倾斜的具体时间段。',
        how: '逐段计算双方农民与军队累计产出差值的最大拐点。',
        why: '进游戏看录像时直接跳到该分钟，省时高效。',
      },
    ),
    pm_ins_tgrole: g('postmatch',
      {
        title: 'Evaluación de Rol en Equipo (Pocket / Flank)',
        what: 'Evalúa si cumpliste lo que tu equipo necesitaba según tu posición real en la partida por equipos.',
        how: 'Detecta tu rol Pocket o Flank y revisa timing de avance, producción móvil/rango y ritmo económico acorde.',
        why: 'Jugar bien tu rol de equipo gana más Team Games que jugar aislado como si fuera 1v1.',
      },
      {
        title: 'Team Role Evaluation (Pocket / Flank)',
        what: 'Evaluates whether you fulfilled your team’s expectations for your Pocket or Flank spawn.',
        how: 'Infers your team position and checks age timings, cavalry/archer output, and boom pace accordingly.',
        why: 'Playing your team role properly wins far more Team Games than playing solo.',
      },
      {
        title: '团战定位评估（内家 / 边家）',
        what: '评估你在本局团战中是否履行了内家或边家的职责。',
        how: '识别站位后对照相应兵种节奏与经济要求进行评价。',
        why: '明确分工配合是团战取胜的核心。',
      },
    ),
    pm_ins_bsgap: g('postmatch',
      {
        title: 'Timing de Herrería',
        what: 'Si sacaste tus mejoras de ataque/armadura a tiempo o cuánto tarde llegaron respecto a tu producción militar.',
        how: 'Compara el minuto de tus primeras unidades de combate con las órdenes de Herrería del replay.',
        why: 'Pelear sin armadura o sin Emplumado de Flecha te hace perder ejércitos enteros en intercambios evitables.',
      },
      {
        title: 'Blacksmith Timing Gap',
        what: 'Whether your armor and attack upgrades arrived on time or lagged behind your army.',
        how: 'Compares military production timing against Blacksmith upgrade commands in the replay.',
        why: 'Fighting without armor or Bodkin Arrow turns winnable fights into costly wipes.',
      },
      {
        title: '铁匠铺时机评估',
        what: '评估你的攻防升级是准时到位还是明显滞后于出兵节奏。',
        how: '对比军力产出时刻与铁匠铺研发指令时间差。',
        why: '裸攻防接团会造成大量本可避免的战损。',
      },
    ),
    pm_ins_techswitch: g('postmatch',
      {
        title: 'Adaptación & Tech-Switch',
        what: 'Detecta si supiste cambiar de composición militar cuando la partida o el rival lo exigía.',
        how: 'Analiza la evolución de tus tipos de unidad entre Feudal, Castillos e Imperial en el .aoe2record.',
        why: 'Insistir con una sola unidad cuando el rival ya tiene su counter suele costar partidas ganadas.',
      },
      {
        title: 'Adaptation & Tech-Switch',
        what: 'Detects whether you smoothly transitioned army compositions when the match demanded it.',
        how: 'Tracks how your unit mix shifted between Feudal, Castle, and Imperial Age in the replay.',
        why: 'Forcing one unit into its hard counter throws winnable leads.',
      },
      {
        title: '转兵应变评估（Tech-Switch）',
        what: '检测你在中后期面对局势变化时是否果断完成兵种转型。',
        how: '追踪封建、城堡、帝王三阶段兵种构成演变。',
        why: '被对手出满克制兵种仍硬顶同一兵种往往痛失好局。',
      },
    ),
    pm_ins_trapped: g('postmatch',
      {
        title: 'Eficiencia de Gasto',
        what: 'Evalúa cuán limpio transformaste tus recursos en aldeanos, edificios y ejército sin desperdicios ni compras de pánico.',
        how: 'Cruza tu volumen de producción, ritmo de edificios militares y uso del Mercado en el replay.',
        why: 'Los recursos acumulados en el banco no pelean: gastar a tiempo equivale a tener más ejército en el mapa.',
      },
      {
        title: 'Spending Efficiency',
        what: 'Evaluates how cleanly you converted income into villagers, production buildings, and army without panic Market tax.',
        how: 'Analyzes production pace, military buildings, and Market trades in the replay.',
        why: 'Floating resources do not fight — spending smoothly means a bigger army on the field.',
      },
      {
        title: '资源花销效率',
        what: '衡量你将资源及时转化为农民、建筑和兵力而非囤积浪费的能力。',
        how: '结合造兵节奏、建筑数量与市场紧急交易综合评估。',
        why: '仓库里的资源不能打仗，花得干脆就是前线兵力优势。',
      },
    ),
    pm_ins_castle: g('postmatch',
      {
        title: 'Castle Drop (Primer Castillo)',
        what: 'Registra el minuto exacto de tu primer Castillo y compara quién aseguró antes el control territorial.',
        how: 'Extrae los comandos de construcción de Castillo de vos y tu rival en el archivo .aoe2record.',
        why: 'El primer Castillo define control de colinas, unidades únicas y el acceso temprano a Trabuquetes.',
      },
      {
        title: 'Castle Drop Timing',
        what: 'Tracks the exact minute of your first Castle and compares who claimed map control first.',
        how: 'Extracts Castle build commands for both sides from the .aoe2record.',
        why: 'First Castle secures key hills, unique units, and the Trebuchet race.',
      },
      {
        title: '首座城堡落地时机',
        what: '记录首座城堡建造时刻，并对比双方抢占战略高地的先后。',
        how: '读取录像中双方建造城堡指令时间。',
        why: '先落城堡意味着高地控制、特色兵种与巨投先机。',
      },
    ),
    pm_stages: g('postmatch',
      {
        title: 'Calificación por Edades (S a D)',
        what: 'Notas objetivas de Alta Edad, Feudal, Castillos e Imperial en esta partida.',
        how: 'Hacé clic derecho sobre una edad específica para ver qué métricas puntuales evalúa esa etapa.',
        why: 'Te señala en 2 segundos qué fase exacta definió la partida.',
      },
      {
        title: 'Age Stage Grades (S–D)',
        what: 'Objective ratings for Dark, Feudal, Castle, and Imperial Age in this match.',
        how: 'Right-click any specific age card to see the exact metrics scored in that phase.',
        why: 'Pinpoints which exact age decided the game in 2 seconds.',
      },
      {
        title: '分时代执行评级（S–D）',
        what: '本局黑暗、封建、城堡、帝王四阶段客观评分。',
        how: '右键具体某个时代卡片可查看该阶段的评分维度。',
        why: '两秒锁定决定本局胜负的时代。',
      },
    ),
    pm_curve: g('postmatch',
      {
        title: 'Curva de Producción (Vos vs Rival)',
        what: 'Compara minuto a minuto cuántos aldeanos y unidades militares encargaron vos y tu rival sobre el mismo reloj.',
        how: 'Agrupa todas las órdenes válidas del .aoe2record en 12 tramos sincronizados.',
        why: 'Hace visible el minuto exacto donde tu economía o ejército despegó — o donde se frenó.',
      },
      {
        title: 'Production Curve (You vs Opponent)',
        what: 'Minute-by-minute comparison of villagers and military queued by you and your opponent.',
        how: 'Buckets valid .aoe2record production commands into 12 synchronized intervals.',
        why: 'Makes the exact minute your economy or army pulled ahead immediately visible.',
      },
      {
        title: '双方产能曲线对比',
        what: '同一时钟下对比你与对手的农民及军事产出走势。',
        how: '将录像有效生产指令分成 12 个同步区间绘制。',
        why: '直观展现经济与军力何时拉开差距。',
      },
    ),
    pm_race: g('postmatch',
      {
        title: 'Carrera de Edades (Vos vs Rival)',
        what: 'Compara segundo a segundo quién llegó primero a Feudal, Castillos e Imperial en esta partida.',
        how: 'Toma los tiempos oficiales de cambio de edad de ambos jugadores del .aoe2record.',
        why: 'Muestra si tuviste ventaja de ventana tecnológica o si corriste desde atrás.',
      },
      {
        title: 'Age-Up Race (You vs Opponent)',
        what: 'Second-by-second comparison of who hit Feudal, Castle, and Imperial Age first.',
        how: 'Reads official age-arrival timestamps for both players from the .aoe2record.',
        why: 'Shows whether you held the tech-spike initiative or played from behind.',
      },
      {
        title: '升级赛跑（你 vs 对手）',
        what: '精确到秒对比双方谁先到封建、城堡与帝王时代。',
        how: '读取录像中双方官方时代到达时间戳。',
        why: '一眼看出每一波兵种强势期谁握有主动权。',
      },
    ),
    pm_queue: g('postmatch',
      {
        title: 'Edificios Militares y Ritmo de Producción',
        what: 'Cuántos Cuarteles, Establos, Galerías y Talleres levantaste y cuántas unidades produjo cada línea.',
        how: 'Cuenta edificios construidos y unidades efectivas producidas en el .aoe2record.',
        why: 'Si te sobran recursos pero perdés peleas, casi siempre faltaron edificios militares para gastar más rápido.',
      },
      {
        title: 'Military Buildings & Production Mix',
        what: 'How many Barracks, Stables, Ranges, and Workshops you built and how many units each produced.',
        how: 'Counts built military structures and valid unit queues in the .aoe2record.',
        why: 'Floating resources while losing fights almost always means you needed more production buildings.',
      },
      {
        title: '军事建筑与兵种产出明细',
        what: '统计兵营、马厩、靶场与攻城厂的数量及对应产兵量。',
        how: '直接统计录像中的建造与产兵记录。',
        why: '余钱多却打不过团战时，通常是因为出兵建筑不够。',
      },
    ),
    pm_eapm_multi: g('postmatch',
      {
        title: 'eAPM de Todos los Jugadores y Estabilidad (Caja Q1–Q3)',
        what: 'Curva minuto a minuto de todos los jugadores con su color real y caja estadística de estabilidad (cuartiles Q1–Q3 y mediana).',
        how: 'Filtra spam (<150 ms) para toda la sala; la caja sombreada marca tu rango habitual (25%–75%) y la línea brillante tu mediana.',
        why: 'Te muestra si mantuviste tu velocidad en las peleas decisivas o si bajaste el ritmo en late game.',
      },
      {
        title: 'All-Player eAPM Curves & Distribution Box',
        what: 'Every player’s minute-by-minute eAPM curve in real game color plus Q1–Q3 stability box-and-whisker plot.',
        how: 'Debounces <150 ms spam for the whole lobby; the shaded box shows 25th–75th percentile with the bright median line.',
        why: 'Shows whether you held your pace during peak fights or faded in late game.',
      },
      {
        title: '全场 eAPM 曲线与箱线分布图',
        what: '按真实颜色展示全场玩家逐分钟有效手速及 Q1–Q3 稳定性箱线图。',
        how: '对全部玩家去重（<150 ms），箱体代表 25%–75% 区间，亮线为中位数。',
        why: '清晰评估团战爆发与后期节奏保持能力。',
      },
    ),
    pm_insights: g('postmatch',
      {
        title: 'Hallazgos Clave del Replay',
        what: 'Tarjetas deterministas que traducen la telemetría del replay en impacto concreto de partida.',
        how: 'Hacé clic derecho sobre cualquiera de las tarjetas individuales (Aldeanos Fantasma, Minuto del Quiebre, Herrería, etc.) para ver su fórmula.',
        why: 'Convierte datos técnicos en lecciones prácticas al instante.',
      },
      {
        title: 'Key Replay Insights',
        what: 'Deterministic insight cards translating raw telemetry into concrete match impact.',
        how: 'Right-click any specific insight card (Ghost Villagers, Turning Point, Blacksmith, etc.) for its exact formula.',
        why: 'Turns numbers into instant, actionable takeaways.',
      },
      {
        title: '录像关键洞察',
        what: '将录像原始数据提炼为可执行的实战结论卡片。',
        how: '右键任意具体洞察卡片可查看对应计算方式。',
        why: '把数据变成一目了然的复盘要点。',
      },
    ),
    pm_civ_mastery: g('postmatch',
      {
        title: 'Aprovechamiento de Bonos de Civilización',
        what: 'Verifica si realmente usaste las ventajas únicas de tu civilización en esta partida (las 56 civs oficiales).',
        how: 'Aplica reglas deterministas sobre tus órdenes y edificios respetando el mapa y el árbol tecnológico.',
        why: 'Aprovechar el bono central de tu civ es ventaja gratuita que no cuesta más APM.',
      },
      {
        title: 'Civilization Bonus Mastery',
        what: 'Checks whether you actually leveraged your civilization’s signature strengths across all 56 ranked civs.',
        how: 'Runs verifiable replay checks respecting map type and tech tree.',
        why: 'Using your civ’s core bonuses is free value that requires zero extra APM.',
      },
      {
        title: '文明特色加成利用率',
        what: '核验本局是否用出了所选文明的核心优势（覆盖全部 56 文明）。',
        how: '结合地图类型与科技树对录像执行可验证规则检查。',
        why: '用好文明特色是最省力、回报最直接的胜率加成。',
      },
    ),
    pm_kpi_buildings: g('postmatch',
      {
        title: 'Edificios Militares Construidos',
        what: 'Cantidad total de edificios de producción militar (Cuarteles, Establos, Galerías, Talleres) que levantaste.',
        how: 'Cuenta los comandos de construcción de edificios militares registrados en el .aoe2record.',
        why: 'Tener suficientes edificios te permite convertir tus recursos en ejército en segundos ante cualquier contraataque.',
      },
      {
        title: 'Military Buildings Constructed',
        what: 'Total military production buildings (Barracks, Stables, Ranges, Workshops) constructed in this match.',
        how: 'Counts military structure build commands from the .aoe2record.',
        why: 'Enough production buildings let you turn income into reinforcements instantly.',
      },
      {
        title: '已建军事建筑数',
        what: '本局建造的兵营、马厩、靶场、攻城厂总数。',
        how: '直接统计录像中的军事建筑建造指令。',
        why: '充足的出兵建筑保证你随时把资源转化为前线兵力。',
      },
    ),

    // ═══════════════════════════════════════════════════════════════════════
    // 5. ENTRENAMIENTO — 7 PESTAÑAS + CADA SUB-MÓDULO DE PROGRESO / PLAN / ORDERS / MATCHUPS / APM / ARENA
    // ═══════════════════════════════════════════════════════════════════════
    tr_tab_perf: g('training',
      {
        title: 'Pestaña Progreso (Entrenamiento)',
        what: 'Tu laboratorio personal de telemetría: analiza tus replays recientes, muestra tu cuello de botella #1 y grafica cómo evoluciona cada fundamento.',
        how: 'Procesa automáticamente tus replays locales con el motor unificado y compara cada partida contra tu media y tu récord.',
        why: 'Convierte tus partidas reales en un plan medible semana a semana.',
      },
      {
        title: 'Progress Tab (Training)',
        what: 'Your personal telemetry lab: diagnoses your #1 bottleneck and charts every core fundamental match by match.',
        how: 'Analyzes your local replays through the unified engine against your personal baseline and records.',
        why: 'Turns ranked matches into measurable week-by-week improvement.',
      },
      {
        title: '进阶标签页（训练）',
        what: '个人录像数据实验室：定位头号短板并逐局追踪每项基本功曲线。',
        how: '通过统一引擎分析本地录像，对照个人均值与纪录。',
        why: '把每场实战变成清晰可量化的成长轨迹。',
      },
    ),
    tr_tab_plan: g('training',
      {
        title: 'Pestaña Mi Plan (Metas Automáticas)',
        what: 'Tu lista activa de objetivos fijados desde Central, Postmatch, Progreso o APM.',
        how: 'Después de cada partida real (≥ 12 min) o ronda de APM, Relic comprueba automáticamente si cumpliste la meta y la marca como ✓ CUMPLIDO.',
        why: 'Transforma los consejos en hábitos concretos con verificación automática.',
      },
      {
        title: 'My Plan Tab (Auto-Verified Goals)',
        what: 'Your active checklist of training goals pinned from Central, Postmatch, Progress, or APM.',
        how: 'After every real match (≥ 12 min) or APM drill, Relic automatically verifies your result and marks met goals ✓ COMPLETED.',
        why: 'Turns analytics into verifiable in-game habits.',
      },
      {
        title: '我的计划标签页（自动验收）',
        what: '集中管理从各模块收藏的训练目标清单。',
        how: '每局满 12 分钟的实战或 APM 练习后自动核验达标情况。',
        why: '形成「发现短板 → 固定目标 → 实战验收」的闭环。',
      },
    ),
    tr_tab_orders: g('training',
      {
        title: 'Pestaña Build Orders',
        what: 'Biblioteca de aperturas paso a paso (Scouts, Arqueros, Fast Castle, etc.) y editor para crear tus propios builds.',
        how: 'Podés armar cualquier Build Order para que aparezca sincronizado paso a paso sobre el juego en el overlay.',
        why: 'Automatiza tus primeros 12 minutos para llegar a Feudal y Castillos sin improvisar.',
      },
      {
        title: 'Build Orders Tab',
        what: 'Step-by-step opening library (Scouts, Archers, Fast Castle, etc.) plus a custom build editor.',
        how: 'Arm any Build Order to run synced step by step in your live in-game overlay.',
        why: 'Makes your first 12 minutes automatic so age-up timings stay sharp every game.',
      },
      {
        title: '建造顺序标签页',
        what: '标准开局库（斥候、弓手、速城等）及自定义建造流程编辑器。',
        how: '装配后可在游戏顶部悬浮栏随人口与时钟同步跟练。',
        why: '固化前 12 分钟开局节奏，消除配农犹豫。',
      },
    ),
    tr_tab_matchups: g('training',
      {
        title: 'Pestaña Matchups Pro',
        what: 'Comparador táctico entre dos civilizaciones: plan edad por edad, curva de ventaja por reloj, choque de fortalezas y trampas.',
        how: 'Construido sobre decenas de miles de partidas de alto ELO (+1900) separando mapas abiertos (Arabia) y cerrados (Arena).',
        why: 'Te dice de antemano qué ejército jugar y en qué momento de la partida tenés ventaja.',
      },
      {
        title: 'Pro Matchups Tab',
        what: 'Tactical civ-vs-civ planner: age-by-age gameplan, power-spike clock curve, stat clash, and matchup traps.',
        how: 'Built from tens of thousands of +1900 ELO matches split by open (Arabia) and closed (Arena) maps.',
        why: 'Tells you before the game starts what army to make and when to push or boom.',
      },
      {
        title: '职业对位指南标签页',
        what: '任意双文明战术规划：三时代打法、时长胜率曲线、属性碰撞与常见陷阱。',
        how: '基于数万局 +1900 高分段真实对局按开放图与封闭图分别统计。',
        why: '开局前就心中有数，知道该出什么兵、何时发力。',
      },
    ),
    tr_tab_arena: g('training',
      {
        title: 'Pestaña Arena Táctica',
        what: 'Desafío cronometrado de conocimiento competitivo de AoE2:DE: 7 niveles progresivos sobre counters, bonos y decisiones.',
        how: 'Tenés 3 vidas diarias; responder rápido suma puntos y salir de la pestaña durante una pregunta activa descuenta 1 vida.',
        why: 'Graba en memoria refleja qué counters y debilidades tiene cada civilización.',
      },
      {
        title: 'Tactical Arena Tab',
        what: 'Timed AoE2:DE competitive knowledge challenge across 7 tiers covering counters, bonuses, and game decisions.',
        how: '3 daily lives; leaving the tab during an active question costs 1 life to keep runs fair.',
        why: 'Builds instant recall of civ tech gaps and hard counters.',
      },
      {
        title: '战术竞技场标签页',
        what: '7 阶限时帝国知识挑战，涵盖兵种克制、文明加成与实战决策。',
        how: '每日 3 点生命，答题中途切走标签页会扣除 1 点生命。',
        why: '把文明短板与克制关系练成肌肉记忆。',
      },
    ),
    tr_tab_apm: g('training',
      {
        title: 'Pestaña Laboratorio de APM',
        what: 'Entrenador interactivo de velocidad de cursor, precisión y reconocimiento rápido de unidades y counters de AoE2:DE.',
        how: 'Incluye modos de 30 s estándar conectados al Ranking Global de Relic (solo muestra tu alias de AoE2 y ELO 1v1).',
        why: 'Hacer 1–2 rondas antes de jugar calienta la mano y afila tu selección en peleas.',
      },
      {
        title: 'APM Lab Tab',
        what: 'Interactive cursor-speed, precision, and AoE2:DE unit/counter recognition trainer.',
        how: 'Features official 30s standard drills connected to the Relic Global Leaderboard (AoE2 alias & 1v1 ELO only).',
        why: '1–2 quick warmup rounds sharpen fight micro before ranked.',
      },
      {
        title: 'APM 实验室标签页',
        what: '使用帝国真实单位头像训练鼠标速度、点击精度与克制反应。',
        how: '30 秒标准模式接入 Relic 全球排行榜（仅展示游戏名与 1v1 分数）。',
        why: '排位前热身 1–2 局可明显提升团战点杀效率。',
      },
    ),
    tr_tab_techtree: g('training',
      {
        title: 'Pestaña Árbol Tecnológico',
        what: 'Consulta rápida e interactiva de todas las unidades, tecnologías, mejoras y bonos de las 56 civilizaciones de AoE2:DE.',
        how: 'Muestra al instante qué tiene disponible o bloqueado cada civilización sin salir de Relic.',
        why: 'Te saca dudas en segundos antes o después de un partido (por ejemplo, si el rival tiene Alabardero o Pureza de Sangre).',
      },
      {
        title: 'Tech Tree Tab',
        what: 'Fast interactive reference of every unit, upgrade, and bonus for all 56 AoE2:DE civilizations.',
        how: 'Shows available and missing techs immediately inside Relic.',
        why: 'Answers matchup questions in seconds (e.g., whether your opponent gets Halberdier or Bloodlines).',
      },
      {
        title: '科技树标签页',
        what: '内置全部 56 个帝国 II 文明的兵种、科技与加成速查工具。',
        how: '无需切出 Relic 即可秒查任意文明的可用与缺失科技。',
        why: '赛前赛后快速确认对手有无戟兵、血统等关键科技。',
      },
    ),

    // Entrenamiento → Progreso (CADA bloque distinto!)
    tr_perf_matchbar: g('training',
      {
        title: 'Selector de Partidas Analizadas',
        what: 'Tus últimos 5 replays procesados para alternar qué partida estás inspeccionando abajo.',
        how: 'Hacé clic izquierdo en cualquier partida para cargar su diagnóstico, fundamentos y posición en la curva.',
        why: 'Te deja comparar en un clic una victoria limpia contra una derrota reciente.',
      },
      {
        title: 'Analyzed Match Selector',
        what: 'Your 5 most recent processed replays so you can switch which game is focused below.',
        how: 'Left-click any slot to inspect its diagnosis, fundamentals, and highlight on the trend chart.',
        why: 'Lets you compare a clean win against a tough loss in one click.',
      },
      {
        title: '近期录像切换栏',
        what: '展示最近 5 局已分析的本地录像，随时切换下方诊断焦点。',
        how: '左键点击任意一局即可切换对应数据与曲线高亮。',
        why: '一键对比顺风好局与失误败局的执行差异。',
      },
    ),
    tr_perf_banner: g('training',
      {
        title: 'Veredicto de la Partida Seleccionada',
        what: 'Resumen principal de cómo ejecutaste esta partida puntual frente a tu propio promedio histórico.',
        how: 'Compara los 6 fundamentos medidos de este replay contra tus medianas anteriores.',
        why: 'Te dice al instante si jugaste por encima o por debajo de tu estándar personal.',
      },
      {
        title: 'Selected Match Verdict',
        what: 'Headline summary of how you executed this specific match relative to your own historical baseline.',
        how: 'Compares all 6 measured fundamentals of this replay against your personal medians.',
        why: 'Instantly tells you whether you played above or below your standard.',
      },
      {
        title: '当前选中对局结论',
        what: '总结当前所选录像相对于你个人历史均值的整体发挥水平。',
        how: '将本局 6 项基本功与你的历史中位数逐项对比。',
        why: '一眼看出这局是超常发挥还是低于常态。',
      },
    ),
    tr_perf_directive: g('training',
      {
        title: 'Prioridad de Entrenamiento (Fijar en Mi Plan)',
        what: 'El cuello de botella #1 detectado en esta partida junto a la meta concreta recomendada para la próxima.',
        how: 'Calcula qué fundamento perdió más valor en este replay y te ofrece un objetivo verificable en 1 clic.',
        why: 'Al pulsar «Fijar en Mi Plan», Relic controla automáticamente tus próximas partidas y te avisa cuando lo superás.',
      },
      {
        title: 'Training Priority Directive',
        what: 'The #1 bottleneck detected in this match with a concrete next-match target.',
        how: 'Identifies the fundamental with the largest execution drop and offers one-click pinning to My Plan.',
        why: 'Pinning it lets Relic automatically verify when you beat this target in future games.',
      },
      {
        title: '首要训练指令（一键加入计划）',
        what: '提炼本局最核心的短板并给出下一局的具体达标线。',
        how: '定位失分最多的基本功，支持一键固定至「我的计划」。',
        why: '固定后 Relic 会在后续实战中自动追踪并验收你是否达标。',
      },
    ),
    tr_perf_kpi_above: g('training',
      {
        title: 'Arriba de tu Promedio',
        what: 'En cuántos de los fundamentos medidos (ej. 4 / 6) rendiste mejor que tu propia media histórica en esta partida.',
        how: 'Cuenta cuántos fundamentos de este replay igualaron récord personal o mejoraron tu mediana previa.',
        why: 'Mide consistencia real incluso cuando perdés una partida dura contra un rival superior.',
      },
      {
        title: 'Above Your Average',
        what: 'How many of the measured fundamentals (e.g., 4 / 6) beat your own historical median in this match.',
        how: 'Counts every fundamental in this replay that set a personal best or outperformed your baseline.',
        why: 'Tracks real execution quality even in tough losses against higher-ELO opponents.',
      },
      {
        title: '高于个人均值项数',
        what: '本局中共有几项基本功（如 4 / 6）表现优于你自己的历史中位数。',
        how: '统计刷新纪录或超越个人基线的基本功数量。',
        why: '即使输给强敌，也能客观衡量自身执行是否在线。',
      },
    ),
    tr_perf_kpi_vils: g('training',
      {
        title: 'Aldeanos Perdidos (Por TC Inactivo)',
        what: 'Cantidad combinada de aldeanos que dejaste de entrenar entre Alta Edad y Feudal por pausas en tu Centro Urbano.',
        how: 'Divide los segundos totales de inactividad temprana del CU por 25 s por aldeano.',
        why: 'Bajar este número por debajo de 1,5 aldeanos perdidos suele equivaler a subir una franja completa de ELO.',
      },
      {
        title: 'Lost Villagers (From Idle TC)',
        what: 'Combined villagers lost across Dark and Feudal Age due to Town Center idle gaps.',
        how: 'Divides combined early idle TC seconds by 25 seconds per villager.',
        why: 'Keeping this under ~1.5 lost villagers is one of the fastest jumps in ranked ELO.',
      },
      {
        title: '空闲折损村民数',
        what: '黑暗与封建期因城镇中心停产合计少造的农民数量。',
        how: '将前期城镇中心总空闲秒数按每 25 秒 1 农折算。',
        why: '把该数值压低到 1.5 名以内通常就能带来明显分段跃升。',
      },
    ),
    tr_perf_kpi_best: g('training',
      {
        title: 'Mejor Ejecución de la Partida',
        what: 'El fundamento en el que más sobresaliste en esta partida (récord personal o mayor mejora vs tu media).',
        how: 'Selecciona el fundamento con mejor salto relativo o marca histórica en el replay activo.',
        why: 'Refuerza lo que ya ejecutás bien para consolidarlo como hábito permanente.',
      },
      {
        title: 'Best Execution of the Match',
        what: 'The single fundamental where you performed strongest in this game (personal best or biggest gain vs average).',
        how: 'Selects the metric with the strongest positive delta or new record in the active replay.',
        why: 'Reinforces strengths you want to lock in as permanent habits.',
      },
      {
        title: '本局最佳执行项',
        what: '本局中表现最亮眼的一项基本功（刷新个人最佳或相对均值提升最大）。',
        how: '从 6 项基本功中自动挑出正向突破最大的一项。',
        why: '巩固已经做对的好习惯。',
      },
    ),
    tr_perf_ledger: g('training',
      {
        title: 'Fundamentos Medidos (Panel Selector)',
        what: 'Lista de tus 6 pilares mecánicos en la partida seleccionada con una mini-barra divergente frente a tu promedio.',
        how: 'Barra hacia la derecha = mejor que tu media; hacia la izquierda = por debajo. Hacé clic izquierdo en una fila para ver su curva a la derecha, o clic derecho en cada fila para entender esa métrica puntual.',
        why: 'Te permite auditar los 6 fundamentos clave en un solo vistazo y detectar exactamente qué falló.',
      },
      {
        title: 'Measured Fundamentals Ledger',
        what: 'Your 6 core mechanical pillars for this match with a diverging bar vs your personal average.',
        how: 'Bar to the right = better than your average; left = below. Left-click a row to plot its curve, or right-click any row for that metric’s guide.',
        why: 'Lets you audit all 6 core habits at once and spot the exact leak.',
      },
      {
        title: '已测基本功清单',
        what: '列出本局 6 大核心基本功及其相对个人均值的双向偏离条。',
        how: '偏右代表优于均值、偏左代表落后；左键切换右侧曲线，右键单行可查看该项详细说明。',
        why: '一屏体检全部基本功，快速锁定短板。',
      },
    ),
    tr_perf_chart_studio: g('training',
      {
        title: 'Evolución Partida a Partida (Gráfico de Tendencia)',
        what: 'Curva histórica del fundamento que elegiste a la izquierda a lo largo de tus últimas partidas analizadas.',
        how: 'Grafica cada replay (verde = victoria, rojo = derrota) junto a la línea punteada de tu promedio, tu récord personal y tu tendencia de las últimas 3 partidas.',
        why: 'Muestra si un problema fue un accidente de una sola partida o un hábito repetido que realmente estás mejorando.',
      },
      {
        title: 'Match-by-Match Evolution Chart',
        what: 'Historical trend line of the selected fundamental across your analyzed replays.',
        how: 'Plots each match (green = win, red = loss) against your dashed average line, personal record, and last-3-game trend.',
        why: 'Separates one-off bad games from true repeating habits and confirms real progress.',
      },
      {
        title: '逐局演变趋势图',
        what: '展示左侧所选基本功在最近多局录像中的连续变化走势。',
        how: '绿点为胜局、红点为败局，并叠加个人均值虚线、历史最佳与近 3 局趋势。',
        why: '区分偶然失误与长期习惯，直观验证训练是否真正见效。',
      },
    ),
    tr_perf_bm: g('training',
      {
        title: 'Referencias de la Curva (Partida / Promedio / Récord / Tendencia)',
        what: 'Los 4 números de control del fundamento graficado abajo: valor de esta partida, tu promedio histórico, tu récord personal y tendencia de últimas 3.',
        how: 'Se recalculan al instante cada vez que seleccionás otro fundamento en la lista de la izquierda.',
        why: 'Te dan contexto inmediato para saber si estás en racha de mejora o lejos de tu mejor versión.',
      },
      {
        title: 'Curve Benchmarks (Match / Average / Record / Trend)',
        what: 'The 4 control benchmarks for the plotted metric: this match, your personal average, your all-time record, and last-3 trend.',
        how: 'Recalculates live whenever you pick another fundamental from the ledger.',
        why: 'Instantly tells you whether you are trending up or slipping below your best form.',
      },
      {
        title: '曲线四大基准值',
        what: '展示当前所选指标的本局数值、个人均值、历史最佳与近 3 局走势。',
        how: '切换左侧基本功时实时刷新。',
        why: '瞬间判断当前发挥处于上升期还是回落期。',
      },
    ),
    tr_perf_timeline: g('training',
      {
        title: 'Ejecución Cronológica por Edades',
        what: 'Resume tu desempeño fase por fase (Alta Edad → Feudal → Castillos) frente a tu promedio personal.',
        how: 'Hacé clic derecho sobre una edad específica para ver qué evalúa esa etapa, o clic izquierdo para enfocar su curva arriba.',
        why: 'Ubica en qué momento exacto del reloj se te desarma el juego.',
      },
      {
        title: 'Chronological Execution by Age',
        what: 'Summarizes your execution phase by phase (Dark → Feudal → Castle) against your personal baseline.',
        how: 'Right-click any age card for its breakdown, or left-click to focus its trend curve above.',
        why: 'Pinpoints the exact phase of the clock where execution slips.',
      },
      {
        title: '分时代执行概览',
        what: '按时间顺序对比你在黑暗、封建、城堡三阶段相对个人均值的表现。',
        how: '右键具体时代卡可看细分指标，左键聚焦上方曲线。',
        why: '精准定位整局节奏在哪个阶段开始松动。',
      },
    ),
    tr_age_dark: g('training',
      {
        title: 'Etapa 1 · Alta Edad Media (Progreso)',
        what: 'Mide tu limpieza inicial hasta pulsar Feudal: tiempo de pase a Feudal e inactividad de Alta Edad.',
        how: 'Compara el rendimiento de Alta Edad de esta partida frente a tu promedio histórico.',
        why: 'Arrancar limpio en Alta Edad hace que toda tu Feudal sea más cómoda y rápida.',
      },
      {
        title: 'Stage 1 · Dark Age Execution',
        what: 'Tracks your opening cleanliness up to Feudal: Feudal arrival clock and Dark Age TC idle.',
        how: 'Compares this match’s Dark Age metrics against your personal average.',
        why: 'A clean Dark Age makes your entire Feudal opening faster and easier.',
      },
      {
        title: '第一阶段 · 黑暗时代执行',
        what: '评估升封建前的开局质量：升封建时间与黑暗期城镇中心空闲。',
        how: '对比本局与你的个人历史均值。',
        why: '开局顺畅能为整个封建期创造巨大主动。',
      },
    ),
    tr_age_feudal: g('training',
      {
        title: 'Etapa 2 · Edad Feudal (Progreso)',
        what: 'Mide si sostuviste tu economía en Feudal: inactividad por CU en Feudal y timing de Hacha de doble filo.',
        how: 'Compara tu ejecución Feudal de este replay contra tu línea base personal.',
        why: 'Evitar pausas de CU en Feudal es la clave para llegar a Castillos con ejército y economía sanos.',
      },
      {
        title: 'Stage 2 · Feudal Age Execution',
        what: 'Tracks Feudal Age macro continuity: idle per TC in Feudal and Double-Bit Axe timing.',
        how: 'Compares this match’s Feudal metrics against your personal baseline.',
        why: 'Eliminating Feudal TC pauses unlocks fast Castle timings without sacrificing army.',
      },
      {
        title: '第二阶段 · 封建时代执行',
        what: '评估封建期经济延续性：单本空闲秒数与双刃斧研发时机。',
        how: '对比本局封建期数据与个人基准。',
        why: '减少封建期断农是兼顾出兵与速升城堡的核心。',
      },
    ),
    tr_age_castle: g('training',
      {
        title: 'Etapa 3 · Edad de los Castillos (Progreso)',
        what: 'Mide tu ritmo de mitad de partida: llegada a Castillos y tu velocidad efectiva (eAPM).',
        how: 'Compara tu transición a Castillos y ritmo mecánico contra tu promedio personal.',
        why: 'Sostener eAPM alto al añadir TCs y pelear en Castillos decide la mayoría de las partidas.',
      },
      {
        title: 'Stage 3 · Castle Age Execution',
        what: 'Tracks mid-game tempo: Castle Age arrival clock and effective APM.',
        how: 'Compares your Castle transition and mechanical pace against your personal average.',
        why: 'Sustaining clean eAPM while adding TCs and fighting wins mid-game control.',
      },
      {
        title: '第三阶段 · 城堡时代执行',
        what: '评估中盘节奏：到达城堡时间与有效操作手速（eAPM）。',
        how: '对比本局升城与操作节奏相对于个人均值的表现。',
        why: '在多本运营与主力交战并行的城堡期稳住手速决定胜负。',
      },
    ),
    tr_perf_wl_bar: g('training',
      {
        title: 'Brecha en Derrotas (Victorias vs Derrotas)',
        what: 'Muestra el fundamento específico donde más cae tu ejecución cuando perdés comparado con cuando ganás.',
        how: 'Separa tus replays analizados en victorias y derrotas y detecta la mayor caída estadística entre ambos grupos.',
        why: 'Te señala el hábito exacto que suele romperse bajo presión cuando la partida se complica.',
      },
      {
        title: 'Win vs Loss Drop-Off Gap',
        what: 'Highlights the exact fundamental that degrades most in your losses compared to your wins.',
        how: 'Splits analyzed replays into wins vs losses and surfaces the biggest execution drop.',
        why: 'Exposes the exact habit that breaks down when an opponent pressures you.',
      },
      {
        title: '胜负局核心落差项',
        what: '指出你在败局相比胜局下滑最严重的那一项基本功。',
        how: '将已分析录像按胜负分组，自动找出最大落差指标。',
        why: '精准暴露逆风承压时最容易崩坏的习惯。',
      },
    ),
    tr_weekly_gains: g('training',
      {
        title: 'Mejoras Verificadas de Esta Semana',
        what: 'Lista únicamente los fundamentos donde lograste una mejora real y verificable esta semana (Antes → Ahora).',
        how: 'Compara tus partidas de esta semana contra tu base anterior aplicando márgenes mínimos para nunca inventar mejoras falsas.',
        why: 'Te muestra con total honestidad qué entrenamientos ya están dando resultados concretos.',
      },
      {
        title: 'Verified Weekly Gains (Before → Now)',
        what: 'Lists only fundamentals where you achieved a genuine verified improvement this week.',
        how: 'Compares this week’s matches against your prior baseline using strict deadbands so noise never counts as fake progress.',
        why: 'Honestly confirms which training habits are truly paying off.',
      },
      {
        title: '本周已验证真实进步',
        what: '仅列出本周经过严格对比确认真实提升的基本功（之前 → 现在）。',
        how: '设置最小波动门槛对比本周与前期基线，杜绝虚假进步。',
        why: '诚实反映真正见效的训练成果。',
      },
    ),
    tr_weekly_daily: g('training',
      {
        title: 'Actividad Diaria de la Semana (Progreso)',
        what: 'Cuántas partidas analizadas jugaste cada día de la semana para visualizar ritmo vs descanso.',
        how: 'Cuenta tus replays registrados por día dentro de la semana actual.',
        why: 'Mantener constancia regular consolida la memoria muscular mucho mejor que jugar solo un día al mes.',
      },
      {
        title: 'Weekly Daily Activity Chart',
        what: 'How many analyzed matches you played each day this week.',
        how: 'Counts recorded replays per day inside the current week.',
        why: 'Steady regular reps lock in muscle memory far better than sporadic marathons.',
      },
      {
        title: '本周每日训练场次',
        what: '展示本周每天已分析的对局数量分布。',
        how: '按日统计本周内记录的本地录像数量。',
        why: '稳定规律的日常练习最有助于巩固肌肉记忆。',
      },
    ),
    tr_weekly: g('training',
      {
        title: 'Balance Semanal',
        what: 'Resumen honesto de tus mejoras verificadas de la semana junto a tu actividad diaria.',
        how: 'Compara tus métricas de esta semana contra tu base anterior con márgenes estrictos.',
        why: 'Te muestra progreso real sin humo.',
      },
      {
        title: 'Weekly Balance',
        what: 'Honest summary of your verified weekly gains alongside daily match activity.',
        how: 'Compares this week’s telemetry against your prior baseline using strict deadbands.',
        why: 'Proves real progress with zero fluff.',
      },
      {
        title: '本周进度总结',
        what: '汇总本周真实提升指标与每日活跃场次。',
        how: '以严格阈值对比本周与历史基线。',
        why: '真实客观地呈现每周成长。',
      },
    ),
    tr_perf_apm_bar: g('training',
      {
        title: 'Práctica Recomendada en APM (Conectada a tus Replays)',
        what: 'Te sugiere el modo exacto del Laboratorio de APM (30 s) que mejor ataca tu ritmo mecánico actual.',
        how: 'Lee tu eAPM de replays recientes y calcula una meta realista de eAPM para calentar o fijar en Mi Plan.',
        why: 'Conecta directamente tus partidas reales con un ejercicio rápido de 30 segundos.',
      },
      {
        title: 'Recommended 30s APM Drill',
        what: 'Recommends the specific APM Lab drill mode and target eAPM tailored to your replay telemetry.',
        how: 'Reads your recent replay eAPM and sets a realistic 30s warmup goal you can run or pin to My Plan.',
        why: 'Bridges real ranked telemetry with a quick 30-second mechanical drill.',
      },
      {
        title: '智能推荐 30 秒 APM 训练',
        what: '根据你的实战录像手速推荐最对口的 30 秒 APM 练习模式与目标值。',
        how: '读取近期录像 eAPM 计算合理目标，支持一键开练或加入计划。',
        why: '将实战短板直接衔接为 30 秒热身练习。',
      },
    ),
    tr_plan: g('training',
      {
        title: 'Cola de Objetivos de Mi Plan',
        what: 'Tus metas activas en seguimiento automático y tus metas ya completadas (con botón «Limpiar completadas»).',
        how: 'Cada vez que cerrás una partida real (≥ 12 min) o una ronda de APM, Relic comprueba cada meta activa y la marca ✓ CUMPLIDO al lograrla.',
        why: 'Mantiene tu entrenamiento enfocado en 2 o 3 metas concretas por vez.',
      },
      {
        title: 'My Plan Goal Queue',
        what: 'Your active auto-tracked goals plus completed goals (with one-click «Clear completed»).',
        how: 'After every real match (≥ 12 min) or APM drill, Relic verifies each active goal and marks it ✓ COMPLETED when achieved.',
        why: 'Keeps practice laser-focused on 2–3 concrete goals at a time.',
      },
      {
        title: '我的计划目标队列',
        what: '展示正在自动追踪的进行中目标与已完成记录（支持一键清除已完成）。',
        how: '每局满 12 分钟的实战或 APM 练习后自动核验并打卡。',
        why: '让你每次聚焦 2–3 个明确目标稳步突破。',
      },
    ),
    tr_bo_library: g('training',
      {
        title: 'Biblioteca de Build Orders',
        what: 'Lista de aperturas estándar (Scouts, Arqueros, Fast Castle, etc.) y tus propias órdenes guardadas.',
        how: 'Podés elegir cualquiera para ver sus pasos, clonarla, editarla o extraer una desde tus propios replays.',
        why: 'Te da un repertorio ordenado de aperturas para mapas abiertos y cerrados.',
      },
      {
        title: 'Build Order Library',
        what: 'Curated opening guides (Scouts, Archers, Fast Castle, etc.) plus your custom builds.',
        how: 'Select any build to inspect steps, clone, edit, or extract directly from a replay.',
        why: 'Gives you a clean opening repertoire for both open and closed maps.',
      },
      {
        title: '建造顺序库',
        what: '收录标准开局流程及你自建或从录像提取的开局方案。',
        how: '点击可查看步骤、克隆编辑或装配到游戏内悬浮助手。',
        why: '为开放图与封闭图备好清晰开局库。',
      },
    ),
    tr_bo_steps: g('training',
      {
        title: 'Pasos del Build Order y Reparto de Aldeanos',
        what: 'Secuencia exacta paso a paso indicando población, reloj estimado y cuántos aldeanos van a Comida, Madera, Oro y Piedra.',
        how: 'Cada paso sincroniza con el Asistente en Vivo si armás este Build Order para tu próxima partida.',
        why: 'Elimina dudas sobre cuántos aldeanos mandar a madera o cuándo construir el siguiente edificio.',
      },
      {
        title: 'Build Order Steps & Villager Split',
        what: 'Exact step-by-step sequence showing population, target clock, and Food/Wood/Gold/Stone villager allocation.',
        how: 'Syncs directly with the live in-game Build Order overlay once armed.',
        why: 'Removes Dark & Feudal Age allocation guesswork completely.',
      },
      {
        title: '开局步骤与资源配农表',
        what: '逐步标明人口、参考时间及食物/木材/黄金/石头农民分配。',
        how: '装配后与游戏内实时悬浮助手自动同步推进。',
        why: '彻底消除前期配农与造建筑顺序的犹豫。',
      },
    ),
    tr_bo_preview: g('training',
      {
        title: 'Vista Previa y Simulador del Overlay en Vivo',
        what: 'Simulación interactiva de cómo verás este Build Order sobre Age of Empires II mientras jugás.',
        how: 'Podés darle Play para probar el ritmo en tiempo real y armarlo en 1 clic para tu próxima partida.',
        why: 'Te permite ensayar el ritmo antes de entrar a ranked.',
      },
      {
        title: 'Live Overlay Preview & Pacer',
        what: 'Interactive preview of how this Build Order looks on your in-game overlay.',
        how: 'Hit Play to pace through the steps in real time or arm it in one click for your next match.',
        why: 'Lets you rehearse the opening rhythm before queueing ranked.',
      },
      {
        title: '实战悬浮栏预览与节拍器',
        what: '模拟该建造顺序在游戏内悬浮显示的效果与节奏。',
        how: '点击播放可实时预演步骤，或一键装配至下一局。',
        why: '进排位前先熟悉节奏，实战不慌乱。',
      },
    ),
    tr_matchup_nemesis: g('training',
      {
        title: 'Accesos Directos a Tus Cruces Némesis',
        what: 'Atajos a los enfrentamientos de civilizaciones que más problemas reales te dieron en tu historial.',
        how: 'Lee tus peores matchups reales desde Central y te permite cargarlos en 1 clic en el comparador.',
        why: 'Te lleva directo a estudiar los cruces que más ELO te están costando hoy.',
      },
      {
        title: 'Your Nemesis Matchup Shortcuts',
        what: 'One-click shortcuts to the civ-vs-civ matchups that have hurt your win rate most.',
        how: 'Pulled from your real Central matchup history to load straight into the planner.',
        why: 'Focuses study time on the matchups actively costing you ELO.',
      },
      {
        title: '克星对位快捷入口',
        what: '一键载入历史战绩中让你最头疼的敌方文明对位。',
        how: '直接从数据中心同步你的真实劣势对局。',
        why: '把学习时间精准花在最影响上分的对位上。',
      },
    ),
    tr_matchup_gameplan: g('training',
      {
        title: 'Plan de Juego por Edades (Feudal → Castillos → Imperial)',
        what: 'Hoja de ruta táctica paso a paso para este cruce exacto: qué abrir, a qué transicionar y cómo cerrar.',
        how: 'Compilado con datos de alto nivel (+1900 ELO) adaptado a mapa abierto (Arabia) o cerrado (Arena).',
        why: 'Te evita improvisar composiciones a mitad de partida y te anticipa el cambio de unidades del rival.',
      },
      {
        title: '3-Age Matchup Gameplan',
        what: 'Age-by-age tactical roadmap for this exact civ clash: opening, Castle transition, and Imperial closer.',
        how: 'Compiled from +1900 ELO data tailored separately for open (Arabia) and closed (Arena) maps.',
        why: 'Prevents mid-game composition guesswork and anticipates enemy tech-switches.',
      },
      {
        title: '三时代对位路线图',
        what: '针对当前双文明对决给出封建开局、城堡转型与帝王终结的连贯方案。',
        how: '基于 +1900 分段实战按开放图与封闭图分别定制。',
        why: '避免中盘盲目出兵，提前预判对手转兵。',
      },
    ),
    tr_matchup_powerspike: g('training',
      {
        title: 'Curva de Ventaja por Reloj (Power Spikes)',
        what: 'Muestra qué civilización tiene mayor probabilidad de ganar en cada minuto de la partida (temprano vs tarde).',
        how: 'Grafica el winrate real del cruce por tramos de duración sobre miles de partidas clasificadas.',
        why: 'Te dice con claridad si tenés que atacar rápido antes de Castillos o si el tiempo corre a tu favor.',
      },
      {
        title: 'Power-Spike Clock Curve',
        what: 'Shows which civilization holds the win-rate edge at each stage of the game clock (early vs late).',
        how: 'Plots real matchup win rates by game duration across thousands of ranked matches.',
        why: 'Makes it crystal clear whether you must strike early or play patiently for late game.',
      },
      {
        title: '对局时长优势曲线（发力期）',
        what: '展示从前期到后期哪个时间段由哪一方文明占据胜率优势。',
        how: '基于海量排位按时长分段绘制真实胜率曲线。',
        why: '一眼决定该抢前期进攻还是稳健拖后期。',
      },
    ),
    tr_matchup_clash: g('training',
      {
        title: 'Choque de Fortalezas (Cara a Cara)',
        what: 'Comparativa directa de las líneas clave de ambos árboles (Caballería, Arqueros, Infantería, Asedio, Economía, etc.).',
        how: 'Evalúa mejoras disponibles y bonos de civilización de ambos lados en cada rama.',
        why: 'Deja al descubierto en segundos dónde tenés superioridad de árbol y qué rama no te conviene pelear.',
      },
      {
        title: 'Head-to-Head Strength Clash',
        what: 'Side-by-side comparison of both civs across key tech lines (Cavalry, Archers, Infantry, Siege, Economy).',
        how: 'Scores available upgrades and civ bonuses for both sides per branch.',
        why: 'Instantly shows which unit lines you win and which battles to avoid.',
      },
      {
        title: '双文明兵种强度碰撞',
        what: '横向对比双方在骑兵、弓手、步兵、攻城与经济等各条科技线的强弱。',
        how: '依据双方完整科技树与文明加成逐项评分。',
        why: '秒看自己哪条兵线占优、哪条兵线应避其锋芒。',
      },
    ),
    tr_matchup_traps: g('training',
      {
        title: 'Trampas y Errores a Evitar',
        what: 'Los errores tácticos más comunes que hacen perder este enfrentamiento específico.',
        how: 'Recopila los counters trampa y puntos ciegos clásicos entre ambas civilizaciones.',
        why: 'Evitar una sola trampa típica (como jugar caballería pesada sin respuesta contra Camellos) te ahorra partidas enteras.',
      },
      {
        title: 'Matchup Traps to Avoid',
        what: 'The most common tactical mistakes that throw this specific civ matchup.',
        how: 'Highlights classic hard-counter traps and tech-tree blind spots between both civs.',
        why: 'Avoiding one classic trap saves entire ranked matches.',
      },
      {
        title: '对位常见陷阱与避坑',
        what: '列出该组文明对决中最容易导致崩盘的经典战术误区。',
        how: '总结双方科技盲区与常见硬克制陷阱。',
        why: '避开一个致命误区就能保住一整局优势。',
      },
    ),
    tr_matchup_bonuses: g('training',
      {
        title: 'Bonos Clave del Cruce',
        what: 'Resumen rápido de las bonificaciones económicas y militares más relevantes de tu civ y la del rival.',
        how: 'Extraído directamente de las reglas oficiales actualizadas de AoE2:DE.',
        why: 'Te recuerda los bonos del rival que no podés olvidar (ej. descuentos, velocidad de trabajo o armadura extra).',
      },
      {
        title: 'Key Civilization Bonuses',
        what: 'Quick summary of the most impactful economic and military bonuses for both civilizations.',
        how: 'Sourced directly from current official AoE2:DE civ rules.',
        why: 'Keeps critical opponent bonuses (discounts, faster timings, extra armor) top of mind.',
      },
      {
        title: '双方核心文明加成速览',
        what: '集中对照你与对手最具实战价值的经济及军事文明加成。',
        how: '同步自最新官方帝国时代 II 文明规则。',
        why: '开局前牢记对手关键折扣与提速特性，防止误判节奏。',
      },
    ),
    tr_matchup_prorefs: g('training',
      {
        title: 'Referencias de Partidas Pro',
        what: 'Ejemplos reales de cómo jugadores de élite (+2000 ELO) jugaron y ganaron este mismo enfrentamiento.',
        how: 'Muestra las aperturas, composiciones y rutas reales que funcionaron en el más alto nivel.',
        why: 'Te da un modelo probado de ejecución real para imitar en tus partidas.',
      },
      {
        title: 'Pro Match References',
        what: 'Real examples of how elite (+2000 ELO) players approached and won this exact matchup.',
        how: 'Surfaces proven openings, unit transitions, and gameplan routes from top-level play.',
        why: 'Gives you a battle-tested blueprint to model your own games after.',
      },
      {
        title: '职业高分段实战参考',
        what: '展示 +2000 高手在同组文明对局中实际采用的开局与赢法。',
        how: '提炼真实顶尖对局中的有效路线与转型组合。',
        why: '提供可直接照搬的高胜率实战范本。',
      },
    ),

    // Entrenamiento → APM (CADA bloque y KPI!)
    tr_apm_toolbar: g('training',
      {
        title: 'Selector de Modo y Duración de APM',
        what: 'Elegí el tipo de ejercicio (Caza de Unidad, Counter Relámpago o Reflejos) y la duración de la ronda.',
        how: 'La duración estándar de 30 s es la única que clasifica oficialmente en el Ranking Global de Relic.',
        why: 'Cada modo entrena una habilidad distinta: precisión pura, lectura de counter o velocidad de reflejo.',
      },
      {
        title: 'APM Drill Mode & Duration Selector',
        what: 'Choose between Unit Snipe, Flash Counter, or Reflex drills and set the round length.',
        how: 'The 30-second standard duration is the official ranked format for the Relic Global Leaderboard.',
        why: 'Each drill targets a different skill: cursor accuracy, counter recognition, or raw reflex speed.',
      },
      {
        title: 'APM 训练模式与时长选择',
        what: '切换点杀单位、闪电克制或极速反应模式，并设定单局时长。',
        how: '30 秒标准时长为 Relic 全球排行榜官方认证赛制。',
        why: '不同模式分别针对点击精度、兵种克制识别与瞬时反应。',
      },
    ),
    tr_apm_kpi_time: g('training',
      {
        title: 'Reloj de la Ronda (APM)',
        what: 'Segundos restantes de la sesión de entrenamiento actual.',
        how: 'Corre de forma precisa en tiempo real desde tu primer clic o al pulsar Iniciar.',
        why: 'Te permite dosificar ritmo y precisión hasta el último segundo de la prueba de 30 s.',
      },
      {
        title: 'Round Timer (APM)',
        what: 'Remaining seconds in your active APM drill round.',
        how: 'Counts down accurately in real time from round start.',
        why: 'Helps you keep steady precision through the final second of a 30s run.',
      },
      {
        title: '训练倒计时',
        what: '当前 APM 练习回合的剩余秒数。',
        how: '回合开始后实时精确倒数。',
        why: '助你在 30 秒标准赛中稳住全程节奏。',
      },
    ),
    tr_apm_kpi_eapm: g('training',
      {
        title: 'eAPM Efectivo en Vivo',
        what: 'Tu ritmo efectivo proyectado por minuto combinando velocidad de aciertos y precisión.',
        how: 'Multiplica tus aciertos por minuto por tu porcentaje de precisión — fallar clics penaliza tu eAPM real.',
        why: 'Premia hacer clic rápido Y limpio (igual que en AoE2:DE), evitando spammear al aire.',
      },
      {
        title: 'Live Effective APM (eAPM)',
        what: 'Your effective actions-per-minute score combining hit speed with click accuracy.',
        how: 'Scales hits per minute by accuracy percentage — missed clicks reduce your effective score.',
        why: 'Rewards fast AND clean clicking rather than wild miss-spam.',
      },
      {
        title: '实时有效手速（eAPM）',
        what: '综合命中速度与准确率的每分钟有效操作分。',
        how: '按每分钟命中数乘以准确率折算，点空或点错会拉低分数。',
        why: '鼓励又快又准的操作，杜绝盲目狂点。',
      },
    ),
    tr_apm_kpi_target: g('training',
      {
        title: 'Objetivo Activo y Progreso de Rotación',
        what: 'Muestra la unidad exacta que tenés que clickear (o la amenaza que debés contrarrestar) y los puntos hasta que rote.',
        how: 'Cada acierto llena un punto (●); al completar la serie suena una señal sutil y cambia a una nueva unidad.',
        why: 'Te obliga a leer rápido y re-enfocar la vista igual que al cambiar de frente en una batalla real.',
      },
      {
        title: 'Active Target & Switch Progress',
        what: 'Shows the exact unit to snipe (or enemy threat to counter) plus pips until the next target switch.',
        how: 'Each hit fills a pip (●); completing the set plays a subtle chime and rotates to a new unit.',
        why: 'Trains rapid visual re-acquisition just like switching fronts in a real battle.',
      },
      {
        title: '当前目标与轮换进度点',
        what: '显示当前需要点杀的单位（或需反制的威胁兵种）以及距离切换目标的进度点。',
        how: '每次命中点亮一个圆点，集满后伴随提示音切换新单位。',
        why: '模拟实战中不断切换目标与战线的快速视觉锁定。',
      },
    ),
    tr_apm_kpi_acc: g('training',
      {
        title: 'Precisión de Clic (%)',
        what: 'Porcentaje de clics acertados sobre el total de clics realizados en la ronda.',
        how: 'Aciertos válidos dividido por (aciertos + clics fallidos o en unidades señuelo).',
        why: 'Mantener +90% de precisión evita seleccionar mal una unidad o cancelar acciones en medio de un micro.',
      },
      {
        title: 'Click Accuracy (%)',
        what: 'Percentage of clicks that hit a valid target out of all clicks in the round.',
        how: 'Valid hits divided by total clicks (hits + misses/decoys).',
        why: 'Staying above 90% prevents costly misclicks during intense micro battles.',
      },
      {
        title: '点击准确率（%）',
        what: '有效命中次数占本轮总点击次数的百分比。',
        how: '有效命中数除以总点击数（含点空与误点诱饵）。',
        why: '保持 90% 以上准确率能大幅减少团战误操作。',
      },
    ),
    tr_apm_kpi_ms: g('training',
      {
        title: 'Tiempo Medio de Reacción (ms)',
        what: 'Cuántos milisegundos tardás en promedio desde que aparece un objetivo válido hasta que lo clickeás.',
        how: 'Promedia la latencia exacta en milisegundos de cada acierto de la ronda.',
        why: 'Bajar de 550 ms a menos de 400 ms se siente al instante al esquivar mangonas o cazar monjes.',
      },
      {
        title: 'Average Reaction Time (ms)',
        what: 'Average milliseconds between a valid target appearing and your click landing on it.',
        how: 'Averages exact per-hit latency in milliseconds across the round.',
        why: 'Dropping from 550 ms under 400 ms directly sharpens mangonel dodges and monk snipes.',
      },
      {
        title: '平均反应时间（ms）',
        what: '从有效目标出现到成功点击命中的平均毫秒延迟。',
        how: '统计整轮每次命中的真实毫秒响应均值。',
        why: '反应越快，实战中躲投石车与点杀僧侣越得心应手。',
      },
    ),
    tr_apm: g('training',
      {
        title: 'Arena de Entrenamiento de APM',
        what: 'Campo interactivo donde aparecen unidades reales de AoE2:DE para entrenar cursor, precisión y counters.',
        how: 'Hacé clic izquierdo únicamente sobre los objetivos válidos (evitando señuelos) mientras el HUD registra tu eAPM y reacción.',
        why: 'Calentamiento rápido de 30 s que afila tu micro antes de entrar a partidas clasificadas.',
      },
      {
        title: 'APM Training Arena',
        what: 'Interactive canvas spawning real AoE2:DE unit tokens to train cursor speed, precision, and counters.',
        how: 'Click only valid targets while avoiding decoys as the HUD tracks live eAPM and reaction time.',
        why: 'Quick 30s warmup that sharpens micro before ranked games.',
      },
      {
        title: 'APM 交互训练场',
        what: '刷出帝国真实单位头像的实战热身画布。',
        how: '精准点击有效目标并避开诱饵，顶部实时统计 eAPM 与反应速度。',
        why: '排位前 30 秒快速热手，激活微操状态。',
      },
    ),
    tr_apm_lb: g('training',
      {
        title: 'Ranking Global de APM (Estándar 30 s)',
        what: 'Tabla mundial de los jugadores de Relic en este modo sobre rondas oficiales de 30 segundos.',
        how: 'Registra tu mejor marca verificada de 30 s mostrando únicamente tu alias de AoE2:DE y tu ELO 1v1 (nunca correos).',
        why: 'Te permite medir tu velocidad mecánica contra jugadores de tu mismo rango de ELO.',
      },
      {
        title: 'Global APM Leaderboard (30s Standard)',
        what: 'Worldwide ranking of Relic players in this mode on official 30-second runs.',
        how: 'Saves your best verified 30s run under your AoE2:DE alias and 1v1 ELO only (never emails).',
        why: 'Benchmarks your mechanical speed against peers in your ELO bracket.',
      },
      {
        title: '全球 APM 排行榜（30 秒标准）',
        what: '当前模式 30 秒标准赛的全球 Relic 玩家排名。',
        how: '仅公开你的帝国 II 游戏名与 1v1 ELO 记录最佳成绩，绝不暴露邮箱。',
        why: '方便与同分段玩家横向对比操作水准。',
      },
    ),
    tr_apm_history: g('training',
      {
        title: 'Historial Personal de Sesiones de APM',
        what: 'Registro local de tus últimas rondas de entrenamiento con eAPM, precisión y tiempo de reacción.',
        how: 'Se guarda automáticamente en tu PC al completar cada ronda.',
        why: 'Te permite comprobar cómo sube tu velocidad y baja tu tiempo de reacción día a día.',
      },
      {
        title: 'Personal APM Session History',
        what: 'Local log of your recent drill rounds with eAPM, accuracy, and reaction time.',
        how: 'Saved automatically on your PC after each completed run.',
        why: 'Shows your mechanical speed climbing and reaction time dropping over days.',
      },
      {
        title: '个人 APM 训练记录',
        what: '本地保存你近期各局 APM 练习的手速、准确率与反应成绩。',
        how: '每局结束自动记录在本地。',
        why: '直观见证手速提升与反应变快。',
      },
    ),
    tr_arena_campaign: g('training',
      {
        title: 'Campaña de Arena Táctica (7 Niveles y 3 Vidas)',
        what: 'Tu nivel actual en la escalera de conocimiento (de Nivel 1 a Nivel 7) y las 3 vidas diarias disponibles.',
        how: 'Cada nivel exige una racha de aciertos para ascender; si te quedás sin vidas se recargan automáticamente al día siguiente.',
        why: 'Convierte el estudio de counters y árboles tecnológicos en un reto diario divertido y medible.',
      },
      {
        title: 'Tactical Arena Campaign (7 Tiers & 3 Lives)',
        what: 'Your current tier on the 7-level knowledge ladder plus your 3 daily lives.',
        how: 'Each tier requires a streak of correct answers to advance; spent lives recharge automatically daily.',
        why: 'Turns learning tech trees and counters into a fun, measurable daily habit.',
      },
      {
        title: '战术竞技场段位与每日生命',
        what: '展示你在 7 阶知识天梯中的当前等级与今日剩余生命（共 3 点）。',
        how: '答对达标即可晋级，生命用尽后次日自动恢复。',
        why: '把枯燥的兵种科技背诵变成有趣的每日闯关。',
      },
    ),
    tr_arena: g('training',
      {
        title: 'Desafío de Arena Táctica',
        what: 'Pregunta cronometrada sobre situaciones reales de AoE2:DE (counters, bonos, tecnología o decisiones).',
        how: 'Elegí la respuesta correcta antes de que termine la barra de tiempo; cambiar de pestaña con una pregunta abierta descuenta 1 vida.',
        why: 'Te entrena a tomar la decisión táctica correcta en segundos bajo presión.',
      },
      {
        title: 'Tactical Arena Challenge',
        what: 'Timed competitive AoE2:DE scenario question (counters, civ bonuses, tech trees, or decisions).',
        how: 'Pick the right answer before the timer runs out; switching tabs mid-question costs 1 life.',
        why: 'Trains split-second tactical decision-making under pressure.',
      },
      {
        title: '战术竞技场限时挑战',
        what: '围绕真实对局情境的限时选择题（克制、加成、科技或决策）。',
        how: '在倒计时结束前选出正确答案，答题中途切页会扣除 1 点生命。',
        why: '训练高压实战下的瞬间正确决策能力。',
      },
    ),
  };

  const TREND_KEY_TO_GUIDE = {
    tcIdleDarkSec: 'metric_tc_dark',
    tcIdleFeudalPerTcSec: 'metric_tc_feudal',
    feudalSec: 'metric_feudal_time',
    castleSec: 'metric_castle_time',
    dbaDelaySec: 'metric_dba',
    bowDelaySec: 'metric_bowsaw',
    eapm: 'metric_eapm',
  };

  const TR_TAB_TO_GUIDE = {
    perf: 'tr_tab_perf',
    plan: 'tr_tab_plan',
    orders: 'tr_tab_orders',
    matchups: 'tr_tab_matchups',
    arena: 'tr_tab_arena',
    apm: 'tr_tab_apm',
    techtree: 'tr_tab_techtree',
  };

  const CX_VIEW_TO_GUIDE = {
    overview: 'cx_tab_overview',
    mastery: 'cx_tab_mastery',
    intel: 'cx_tab_intel',
  };

  function matchMetricFromText(text) {
    const s = String(text || '').toLowerCase();
    if (!s) return null;
    if (/alta edad|dark age|黑暗时代/.test(s) && /cu|tc|pausa|inactiv|idle|空闲/.test(s)) return 'metric_tc_dark';
    if (/feudal|封建/.test(s) && /cu|tc|pausa|inactiv|idle|空闲/.test(s)) return 'metric_tc_feudal';
    if (/bache|gap|parón|sin órdenes|停产/.test(s)) return 'metric_tc_gap';
    if (/hacha de doble filo|double-bit axe|双刃斧/.test(s)) return 'metric_dba';
    if (/sierra de arco|bow saw|弓锯/.test(s)) return 'metric_bowsaw';
    if (/campana urbana|town bell|警钟/.test(s)) return 'metric_townbell';
    if (/mercado|market|市场|madera vendida|impuesto/.test(s)) return 'metric_market';
    if (/herrer[íi]a|blacksmith|铁匠铺/.test(s)) return 'metric_blacksmith';
    if (/patrullar|movimiento de ataque|attack-move|control de combate|patrol|攻击移动/.test(s)) return 'metric_control_micro';
    if (/edificios militares|military buildings|军事建筑/.test(s)) return 'pm_kpi_buildings';
    if (/eapm|apm|ritmo efectivo|有效操作/.test(s)) return 'metric_eapm';
    if (/llegada a feudal|feudal time|到达封建/.test(s)) return 'metric_feudal_time';
    if (/llegada a castillos|castle time|到达城堡/.test(s)) return 'metric_castle_time';
    if (/edad|feudal|castillos|castle|feudal|封建|城堡/.test(s) && /tiempo|llegada|time|timing|升级/.test(s)) return 'metric_age_timings';
    return null;
  }

  // Reglas específicas de contenedor (de más interno/preciso a más general; CADA módulo tiene su propia guía única)
  const CONTAINER_RULES = [
    // Inicio (sub-bloques antes que el contenedor padre)
    ['.wh-gold-hero', 'wh_gold_hero'],
    ['.wh-gold-rank', 'wh_gold_rank'],
    ['.wh-activity-wrap', 'wh_activity_strip'],
    ['.wh-counter-bar', 'wh_counter_bar'],
    ['.wh-maps-bar', 'wh_maps_bar'],
    ['.wh-news-banner', 'wh_news_banner'],
    ['.wh-spot.is-gold', 'wh_meta_top_wr'],
    ['.wh-spot', 'wh_meta_top_pick'],
    ['.wh-treasury', 'wh_treasury'],
    ['.wh-hero-stage', 'wh_hero_stage'],
    ['.wh-global-swap', 'wh_global'],
    ['.wh-global-col', 'wh_global'],

    // Central (sub-bloques antes que tarjetas padre)
    ['.cx-acad-focus-strip', 'cx_acad_focus'],
    ['.cx-acad-stage-cell', 'cx_acad_stage'],
    ['.cx-speed-split', 'cx_speed_vs_brain'],
    ['.cx-killer-cols', 'cx_killer_window'],
    ['#cxEloRoadmapCard', 'cx_roadmap'],
    ['#cxSectionDna', 'cx_dna'],
    ['#cxSectionSpotlights', 'cx_spotlights'],
    ['#cxSectionGoldenHour', 'cx_golden_hour'],
    ['#cxSectionTrophies', 'cx_trophies'],
    ['#cxSectionCombatDna', 'cx_combat_dna'],
    ['#cxSectionTempo', 'cx_tempo'],
    ['#cxSectionWinLossClocks', 'cx_clocks'],
    ['#cxSectionCivMasteryHist', 'pm_civ_mastery'],
    ['#cxCivDiagPanel', 'cx_civ_diag'],
    ['#cxSectionCivs', 'cx_civ_diag'],
    ['#cxMapDiagPanel', 'cx_map_diag'],
    ['#cxSectionMaps', 'cx_map_diag'],
    ['#cxSectionAcademy', 'cx_academy'],
    ['#cxEloAttributionCard', 'cx_elo_attrib'],
    ['#cxMatchupSessionCard', 'cx_session_intel'],
    ['#cxSectionIntel', 'cx_elo_attrib'],
    ['#cxSectionLastMatch', 'cx_last_match'],
    ['#cxSectionChart', 'cx_chart'],
    ['.cx-hero', 'cx_hero'],

    // Postmatch (cada bloque distinto con su propia guía)
    ['.pm-hero-v6', 'pm_hero'],
    ['.pm-verdict-bar', 'pm_hero'],
    ['.pm-trophy-banner', 'pm_trophy'],
    ['.pm-stages-v2', 'pm_stages'],
    ['.pm-opening-bar', 'pm_stages'],
    ['.pm-apm-card', 'pm_eapm_multi'],
    ['.pm-curve-wrap', 'pm_curve'],
    ['.pm-race-box', 'pm_race'],
    ['.pm-queue-box', 'pm_queue'],
    ['.pm-insights-v6', 'pm_insights'],
    ['.pm-civ-mastery', 'pm_civ_mastery'],
    ['.pm-duel', 'pm_curve'],
    ['.pm-tech-box', 'metric_blacksmith'],
    ['.pm-habits', 'metric_control_micro'],

    // Entrenamiento → Progreso (CADA panel con su propia guía única!)
    ['.tr-perf-matchbar', 'tr_perf_matchbar'],
    ['.tr-perf-directive', 'tr_perf_directive'],
    ['.tr-perf-banner', 'tr_perf_banner'],
    ['.tr-perf-ledger', 'tr_perf_ledger'],
    ['.tr-studio-bm', 'tr_perf_bm'],
    ['.tr-perf-chart-studio', 'tr_perf_chart_studio'],
    ['.tr-perf-wl-bar', 'tr_perf_wl_bar'],
    ['.tr-perf-timeline-panel', 'tr_perf_timeline'],
    ['.tr-age-stages', 'tr_perf_timeline'],
    ['.tr-wk-gains', 'tr_weekly_gains'],
    ['.tr-wk-daily-stage', 'tr_weekly_daily'],
    ['.tr-weekly-sanctuary', 'tr_weekly'],
    ['.tr-perf-apm-bar', 'tr_perf_apm_bar'],

    // Entrenamiento → Mi Plan
    ['.tr-queue-card', 'tr_plan'],
    ['.tr-plan-hero', 'tr_plan'],
    ['.tr-plan-flow-card', 'tr_plan'],

    // Entrenamiento → Build Orders
    ['.tr-bo-cards-list', 'tr_bo_library'],
    ['.tr-bo-steps-panel', 'tr_bo_steps'],
    ['.tr-overlay-preview-stage', 'tr_bo_preview'],

    // Entrenamiento → Matchups
    ['.tr-nemesis-strip', 'tr_matchup_nemesis'],
    ['.tr-age-gameplan-grid', 'tr_matchup_gameplan'],
    ['.tr-powerspike-card', 'tr_matchup_powerspike'],
    ['.tr-clash-card', 'tr_matchup_clash'],
    ['.tr-traps-card', 'tr_matchup_traps'],
    ['.tr-civ-bonuses-card', 'tr_matchup_bonuses'],
    ['.tr-pro-refs-card', 'tr_matchup_prorefs'],
    ['.tr-matchup-lab', 'tr_tab_matchups'],

    // Entrenamiento → APM
    ['#trApmDirBox', 'tr_apm_kpi_target'],
    ['.tr-apm-toolbar', 'tr_apm_toolbar'],
    ['.tr-apm-lb-card', 'tr_apm_lb'],
    ['.tr-apm-history-card', 'tr_apm_history'],
    ['.tr-apm-stage', 'tr_apm'],

    // Entrenamiento → Arena
    ['.tr-campaign-bar', 'tr_arena_campaign'],
    ['.tr-arena-stage', 'tr_arena'],
  ];

  function resolveApmHudKpi(targetEl) {
    const kpi = targetEl.closest('.tr-apm-kpi');
    if (!kpi || typeof kpi.querySelector !== 'function') return null;
    if (kpi.querySelector('#trApmHudTime')) return GUIDES.tr_apm_kpi_time;
    if (kpi.querySelector('#trApmHudApm')) return GUIDES.tr_apm_kpi_eapm;
    if (kpi.querySelector('#trApmHudAcc')) return GUIDES.tr_apm_kpi_acc;
    if (kpi.querySelector('#trApmHudMs')) return GUIDES.tr_apm_kpi_ms;
    return null;
  }

  function resolveGuideForTarget(targetEl) {
    if (!targetEl || typeof targetEl.closest !== 'function') return null;

    // 1. Atributo explícito `data-help-id` en el sub-elemento más específico bajo el puntero
    const explicit = targetEl.closest('[data-help-id]');
    if (explicit) {
      const id = explicit.getAttribute('data-help-id');
      if (GUIDES[id]) return GUIDES[id];
    }

    // 2. Pestañas de Entrenamiento y Central (independientes del idioma)
    const trTab = targetEl.closest('.tr-tab[data-tr-tab]');
    if (trTab) {
      const gid = TR_TAB_TO_GUIDE[trTab.getAttribute('data-tr-tab')];
      if (gid && GUIDES[gid]) return GUIDES[gid];
    }
    const cxTab = targetEl.closest('.cx-subtab[data-central-view]');
    if (cxTab) {
      const gid = CX_VIEW_TO_GUIDE[cxTab.getAttribute('data-central-view')];
      if (gid && GUIDES[gid]) return GUIDES[gid];
    }

    // 3. Tarjetas cronológicas por edad de Progreso (antes de data-tr-trend-key para dar explicación de la etapa)
    const ageStage = targetEl.closest('.tr-age-stage');
    if (ageStage && ageStage.classList) {
      if (ageStage.classList.contains('is-stage-dark')) return GUIDES.tr_age_dark;
      if (ageStage.classList.contains('is-stage-feudal')) return GUIDES.tr_age_feudal;
      if (ageStage.classList.contains('is-stage-castle')) return GUIDES.tr_age_castle;
    }

    // 4. Filas de Fundamentos Medidos / Mejoras Semanales con `data-tr-trend-key` exacto
    const trendEl = targetEl.closest('[data-tr-trend-key]');
    if (trendEl) {
      const gid = TREND_KEY_TO_GUIDE[trendEl.getAttribute('data-tr-trend-key')];
      if (gid && GUIDES[gid]) return GUIDES[gid];
    }

    // 5. KPIs individuales del HUD de APM
    const apmKpiGuide = resolveApmHudKpi(targetEl);
    if (apmKpiGuide) return apmKpiGuide;

    // 6. Filas/KPIs específicos por texto (Hoja de Ruta, Academia, KPIs de Postmatch)
    const specificRow = targetEl.closest(
      '.cx-rm-row, .cx-acad-habit-row, .pm-kpi',
    );
    if (specificRow) {
      const rowKey = matchMetricFromText(specificRow.textContent || '');
      if (rowKey && GUIDES[rowKey]) return GUIDES[rowKey];
    }

    // 7. Reglas de contenedor de más interno a más general
    for (const [selector, guideId] of CONTAINER_RULES) {
      if (targetEl.closest(selector) && GUIDES[guideId]) {
        return GUIDES[guideId];
      }
    }
    return null;
  }

  let popoverEl = null;

  function ensurePopover() {
    if (popoverEl && popoverEl.isConnected) return popoverEl;
    const el = root.document.createElement('aside');
    el.id = 'relicHelpPopover';
    el.className = 'rx-help-popover';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    root.document.body.appendChild(el);
    popoverEl = el;
    return el;
  }

  function closePopover() {
    if (!popoverEl || popoverEl.hidden) return;
    popoverEl.hidden = true;
    popoverEl.classList.remove('is-open');
  }

  function scopeLabel(scope) {
    if (scope === 'postmatch') return t('help.badgePostmatch', 'POSTMATCH');
    if (scope === 'training') return t('help.badgeTraining', 'ENTRENAMIENTO');
    if (scope === 'home') return t('help.badgeHome', 'INICIO');
    return t('help.badgeCentral', 'CENTRAL');
  }

  function openPopover(guide, clientX, clientY) {
    const pop = ensurePopover();
    const lang = getLangGroup();
    const copy = guide[lang] || guide.es;
    if (!copy) return;

    pop.innerHTML = `
      <div class="rx-help-head">
        <div class="rx-help-head-copy">
          <span class="rx-help-scope">${esc(scopeLabel(guide.scope))}</span>
          <h4 class="rx-help-title">${esc(copy.title)}</h4>
        </div>
        <button type="button" class="rx-help-close" aria-label="${esc(t('help.closeAria', 'Cerrar explicación'))}">×</button>
      </div>
      <div class="rx-help-body">
        <div class="rx-help-sec">
          <span class="rx-help-k">${esc(t('help.whatLabel', 'QUÉ MIDE'))}</span>
          <p>${esc(copy.what)}</p>
        </div>
        <div class="rx-help-sec">
          <span class="rx-help-k">${esc(t('help.howLabel', 'CÓMO SE CALCULA'))}</span>
          <p>${esc(copy.how)}</p>
        </div>
        <div class="rx-help-sec is-impact">
          <span class="rx-help-k">${esc(t('help.whyLabel', 'EN QUÉ INFLUYE'))}</span>
          <p>${esc(copy.why)}</p>
        </div>
      </div>`;

    pop.hidden = false;
    pop.classList.add('is-open');

    // Posicionamiento inteligente dentro del viewport (CSSOM, cero atributos HTML inline)
    const vw = root.innerWidth || 1200;
    const vh = root.innerHeight || 800;
    const rect = pop.getBoundingClientRect();
    const pw = rect.width || 368;
    const ph = rect.height || 240;
    const pad = 14;
    let x = clientX + 12;
    let y = clientY + 12;
    if (x + pw + pad > vw) x = Math.max(pad, clientX - pw - 12);
    if (y + ph + pad > vh) y = Math.max(pad, vh - ph - pad);
    if (x < pad) x = pad;
    if (y < pad) y = pad;

    pop.style.left = '0px';
    pop.style.top = '0px';
    pop.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;

    pop.querySelector('.rx-help-close')?.addEventListener('click', closePopover);
    try { root.UiSfx?.play?.('soft'); } catch (_) {}
  }

  function isEditableOrSelected(targetEl) {
    if (!targetEl) return false;
    const tag = String(targetEl.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || targetEl.isContentEditable) return true;
    try {
      const sel = root.getSelection?.();
      if (sel && String(sel.toString() || '').trim().length > 0) return true;
    } catch (_) {}
    return false;
  }

  function init() {
    if (root.__relicHelpExplainerBound) return;
    root.__relicHelpExplainerBound = true;

    root.document.addEventListener('contextmenu', (ev) => {
      if (isEditableOrSelected(ev.target)) return;
      if (ev.target?.closest?.('#relicHelpPopover')) return;
      const guide = resolveGuideForTarget(ev.target);
      if (!guide) {
        closePopover();
        return;
      }
      ev.preventDefault();
      openPopover(guide, ev.clientX, ev.clientY);
    });

    root.document.addEventListener('pointerdown', (ev) => {
      if (!popoverEl || popoverEl.hidden) return;
      if (ev.button === 2) return;
      if (popoverEl.contains(ev.target)) return;
      closePopover();
    });

    root.document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closePopover();
    });

    root.addEventListener('wheel', () => closePopover(), { passive: true });
    root.addEventListener('resize', () => closePopover(), { passive: true });
  }

  if (typeof root.document !== 'undefined') {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  root.RelicHelpExplainer = {
    GUIDES,
    TREND_KEY_TO_GUIDE,
    TR_TAB_TO_GUIDE,
    CX_VIEW_TO_GUIDE,
    resolveGuideForTarget,
    openPopover,
    closePopover,
  };
})(typeof window !== 'undefined' ? window : globalThis);
