/* ============================================================================
   RELIC — Explicador Contextual por Clic Derecho (`ui/help-explainer.js`)
   - Cero ruido visual: no agrega íconos «?» sobre las tarjetas.
   - Al hacer clic derecho sobre cualquier cuadro, gráfico o métrica de Inicio,
     Central, Postmatch o Entrenamiento despliega una guía clara y sencilla:
       1. Qué mide
       2. Cómo se calcula
       3. En qué influye para mejorar y subir de ELO
   - Respeta clic derecho nativo en campos de texto y selecciones para copiar/pegar.
   - 100 % CSP-safe (0 estilos inline HTML) y localizado en es / en / zh-CN.
   ============================================================================ */
(function (root) {
  'use strict';

  function getLangGroup() {
    try {
      const loc = root.AppI18n?.getLocale?.() || 'es-MX';
      if (loc === 'en') return 'en';
      if (loc === 'zh-CN') return 'zh';
      return 'es';
    } catch (_) {
      return 'es';
    }
  }

  function t(key, fallback) {
    try {
      const api = root.AppI18n;
      if (api && typeof api.t === 'function') {
        const val = api.t(key);
        if (val && val !== key) return val;
      }
    } catch (_) {}
    return fallback;
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Catálogo user-friendly de explicaciones por métrica / cuadro.
   * Cada entrada responde exactamente: qué mide, cómo se calcula y en qué influye.
   */
  const GUIDES = {
    // ── MÉTRICAS INDIVIDUALES (alta prioridad al hacer clic derecho sobre una fila/KPI) ──
    metric_tc_dark: {
      scope: 'central',
      es: {
        title: 'Tiempo parado del Centro Urbano en Alta Edad',
        what: 'Los segundos que tu Centro Urbano estuvo sin producir aldeanos ni investigar Telar/Feudal antes de llegar a Edad Feudal.',
        how: 'Cruza tus órdenes del replay local con el aviso oficial del servidor al llegar a Feudal y calcula el máximo físico real de aldeanos posibles en ese tiempo (descontando bonos de Persas, Malayos, Godos, Chinos o Mayas).',
        why: 'Cada 25 segundos parado equivalen a 1 aldeano menos desde el minuto 5. Ese aldeano faltante acumula cientos de recursos perdidos antes de Castillos y retrasa todo tu pase de edad.',
      },
      en: {
        title: 'Dark Age Town Center Idle Time',
        what: 'Seconds your Town Center spent not training villagers or researching Loom/Feudal before reaching Feudal Age.',
        how: 'Cross-checks your local replay orders against the official Feudal Age arrival notice to compute the exact physical villager capacity (accounting for Persians, Malay, Goths, Chinese, and Mayans).',
        why: 'Every 25 idle seconds equals 1 missing villager from minute 5 onward, compounding into hundreds of lost resources and slower age-ups.',
      },
      zh: {
        title: '黑暗时代城镇中心空闲时间',
        what: '升至封建时代前，城镇中心没有训练村民或研究织布机/升级时代的总秒数。',
        how: '结合本地录像指令与官方到达封建时代的时间戳，精确计算物理最大可产村民数（自动适配波斯、马来、哥特、中国、玛雅等文明加成）。',
        why: '每空闲 25 秒就少 1 个村民，前期少 1 个村民会在城堡时代前滚雪球般损失数百资源并拖慢升级节奏。',
      },
    },
    metric_tc_gap: {
      scope: 'central',
      es: {
        title: 'Mayor bache sin órdenes al Centro Urbano',
        what: 'La pausa continua más larga sin encargar aldeanos antes de Edad de los Castillos, indicando si ocurrió mientras peleabas o en economía.',
        how: 'Mide el silencio real más largo entre órdenes de producción en tu Centro Urbano dentro del archivo .aoe2record (ignorando los últimos 30 segundos antes de rendirse).',
        why: 'Pausas de 35–60 s durante escaramuzas en Feudal significan perder 2 aldeanos de golpe mientras microeás tu ejército. Usar el atajo de «Seleccionar todos los CU» sin mover la cámara elimina este bache.',
      },
      en: {
        title: 'Longest Town Center Gap',
        what: 'The longest uninterrupted pause without queueing villagers before Castle Age, tagged by whether it happened during combat micro or eco tasks.',
        how: 'Measures the longest silence between TC production intervals in your .aoe2record file, excluding the final 30 seconds before resignation.',
        why: 'A 40–60s gap during a Feudal skirmish costs 2 villagers while you focus on army micro. Cycling your Select All TCs hotkey without moving the camera fixes this fast.',
      },
      zh: {
        title: '城镇中心最长停产间隔',
        what: '城堡时代前连续未排队村民的最长停顿时间，并标注是否发生在控兵交战期间。',
        how: '统计录像中城镇中心队列的最大连续空闲间隔（自动排除投降前最后 30 秒）。',
        why: '封建交战时停产 40–60 秒会直接少 2 个村民。养成不切屏直接按全选城镇中心补农民的习惯能显著提分。',
      },
    },
    metric_dba: {
      scope: 'central',
      es: {
        title: 'Hacha de Doble Filo tras Feudal',
        what: 'Cuántos segundos tardás en investigar Hacha de Doble Filo después de entrar en Edad Feudal (o si la olvidaste).',
        how: 'Resta el segundo exacto en que clickeaste Hacha de Doble Filo menos el segundo oficial de llegada a Feudal en tu replay (se excluyen Birmanos por tenerla gratis).',
        why: 'Aumenta +20% tu recolección de madera al instante. Retrasarla 2 minutos te hace llegar sin madera suficiente para granjas, establos o galerías en Feudal.',
      },
      en: {
        title: 'Double-Bit Axe Delay',
        what: 'How many seconds after reaching Feudal Age you click Double-Bit Axe (or whether it was skipped).',
        how: 'Subtracts the exact Feudal Age arrival timestamp from your Double-Bit Axe research command in the replay (Burmese excluded since it is free).',
        why: 'Gives an immediate +20% wood gather boost. Delaying it starves your farms, ranges, and stables throughout Feudal Age.',
      },
      zh: {
        title: '双刃斧研发延迟',
        what: '进入封建时代后多少秒点下双刃斧（或是否完全漏点）。',
        how: '用录像中研发双刃斧的时间减去官方到达封建时代的时间（缅甸免费获得已自动排除）。',
        why: '双刃斧立刻提升 20% 伐木效率，拖延研发会导致封建期农田与军事建筑木材紧张。',
      },
    },
    metric_bowsaw: {
      scope: 'central',
      es: {
        title: 'Sierra de Arco en Edad de los Castillos',
        what: 'Cuántos segundos después de llegar a Castillos investigás Sierra de Arco (y con qué frecuencia queda olvidada en partidas largas).',
        how: 'Compara el comando de investigación de Sierra de Arco contra tu llegada oficial a Castillos en partidas con al menos 4,5 min en Castillos.',
        why: 'Es el motor que financia tus 2.º y 3.º Centros Urbanos, las granjas y los edificios militares de mitad de partida. Olvidarla frena todo tu boom.',
      },
      en: {
        title: 'Bow Saw Timing in Castle Age',
        what: 'How many seconds after hitting Castle Age you research Bow Saw, including games where it was forgotten entirely.',
        how: 'Compares your Bow Saw research timestamp against official Castle Age arrival in matches with at least 4.5 minutes in Castle Age.',
        why: 'Bow Saw fuels your extra Town Centers, farms, and production buildings in mid-game. Forgetting it chokes your whole economy.',
      },
      zh: {
        title: '弓锯研发时机',
        what: '到达城堡时代后多少秒点下弓锯，并统计长局中是否漏点。',
        how: '在至少进行了 4.5 分钟城堡时代的对局中，对比弓锯研发时间与到达城堡时代的时间。',
        why: '弓锯是中期多城镇中心种田与爆兵的木材核心，漏点会严重拖慢整体经济。',
      },
    },
    metric_eapm: {
      scope: 'central',
      es: {
        title: 'eAPM (Acciones Efectivas por Minuto)',
        what: 'Tu velocidad real de toma de decisiones por minuto, sin contar el spam repetitivo de clics.',
        how: 'Cuenta todas las órdenes válidas enviadas al juego en el replay y descarta clics duplicados del mismo tipo en menos de 150 milisegundos.',
        why: 'Un eAPM sostenido te permite producir aldeanos, sacar ejército y microear peleas al mismo tiempo sin congelar tu economía en partidas largas.',
      },
      en: {
        title: 'eAPM (Effective Actions Per Minute)',
        what: 'Your real decision speed per minute after filtering out redundant click spam.',
        how: 'Counts valid game commands in your replay while debouncing repeated commands of the same type within 150 ms.',
        why: 'Steady eAPM lets you queue villagers, build economy, and micro fights simultaneously without freezing your macro.',
      },
      zh: {
        title: 'eAPM（每分钟有效操作数）',
        what: '过滤无效重复连点后的真实每分钟操作速度。',
        how: '统计录像中全部有效指令，并剔除 150 毫秒内同类型的重复连点。',
        why: '稳定的 eAPM 让你在交战控兵的同时持续补农民与扩张经济，避免后期掉节奏。',
      },
    },
    metric_blacksmith: {
      scope: 'central',
      es: {
        title: 'Herrería al día con tu ejército',
        what: 'Si acompañaste tu unidad principal (caballería, arqueros o infantería) con las mejoras obligatorias de Herrería disponibles para tu civilización.',
        how: 'Identifica qué rama entrenaste en mayor volumen en el replay y revisa solo las mejoras relevantes en tu árbol tecnológico oficial (nunca pide mejoras que tu civ no tiene).',
        why: 'Pelear sin armadura de caballería o sin Emplumado/Punzones hace que pierdas intercambios incluso teniendo más unidades que el rival.',
      },
      en: {
        title: 'Army-Matched Blacksmith Upgrades',
        what: 'Whether you researched the essential Blacksmith upgrades for your main army class (cavalry, archers, or infantry).',
        how: 'Detects your primary unit class from the replay and checks only relevant upgrades available in your civilization tech tree.',
        why: 'Fighting without cavalry armor or Fletching/Bodkin causes you to lose engagements even with a larger army.',
      },
      zh: {
        title: '主力兵种铁匠铺升级',
        what: '检查你是否为主力兵种（骑兵、弓箭手或步兵）及时升级了关键铁匠铺科技。',
        how: '根据录像识别你的核心兵种，仅校验你所选文明科技树中实际拥有的对应攻防科技。',
        why: '缺少骑兵防御或羽箭/锥头箭会让你即便兵力占优也打输关键团战。',
      },
    },
    metric_market: {
      scope: 'central',
      es: {
        title: 'Uso del Mercado e impuesto de comisión',
        what: 'Cuánta madera vendés o cuánta comida comprás de emergencia en el Mercado fuera de Sarracenos.',
        how: 'Suma los comandos reales Buy/Sell del archivo .aoe2record (Sarracenos queda exento porque su comisión es solo del 5%).',
        why: 'Vender madera para comprar comida pierde cerca del 30% en comisiones. Reducir ese desbalance te deja más oro libre para Castillos y ejército.',
      },
      en: {
        title: 'Market Usage & Trade Tax',
        what: 'How much wood you emergency-sell or food you buy at the Market (excluding Saracens).',
        how: 'Totals actual Buy/Sell replay commands. Saracens are exempt thanks to their 5% market fee.',
        why: 'Selling wood to buy food loses roughly 30% in fees; balancing lumberjacks vs farms earlier saves hundreds of gold.',
      },
      zh: {
        title: '市场应急买卖与手续费损耗',
        what: '统计你在市场卖木头或买食物的应急操作量（萨拉森 5% 费率已豁免）。',
        how: '直接统计录像中的真实买卖指令。',
        why: '反复卖木买粮会损失约 30% 的市场税，提前调整伐木与种田比例能省下大量黄金。',
      },
    },
    metric_townbell: {
      scope: 'central',
      es: {
        title: 'Uso de la Campana Urbana',
        what: 'Cantidad de veces que activaste la Campana Urbana del Centro Urbano durante la partida.',
        how: 'Cuenta únicamente los comandos reales de activar campana (ON) en el replay, sin duplicar si tenías varios Centros Urbanos seleccionados.',
        why: 'La campana frena a todos tus aldeanos del mapa a la vez, incluso los que están lejos del ataque. Guarecer manualmente solo al grupo amenazado protege tu economía.',
      },
      en: {
        title: 'Town Bell Usage',
        what: 'How many times you rang the Town Bell during the match.',
        how: 'Counts only real Town Bell ON commands in the replay, deduplicated across multiple selected Town Centers.',
        why: 'Ringing the bell idles your entire economy even on safe resources. Manually garrisoning only the raided villagers saves huge resources.',
      },
      zh: {
        title: '城镇警钟使用次数',
        what: '对局中拉响城镇中心警钟的次数。',
        how: '仅统计录像中真实触发警钟开启的指令，多城镇中心同时选中不会重复计数。',
        why: '拉警钟会让安全区域的农民也全部停工，手动框选受袭农民驻扎能保住整体经济。',
      },
    },
    metric_control_micro: {
      scope: 'central',
      es: {
        title: 'Control de combate (Ataque / Patrullar)',
        what: 'Qué porcentaje de tus órdenes de movimiento militar usan Movimiento de ataque o Patrullar en lugar de solo clic derecho.',
        how: 'Divide tus comandos de Attack-Move y Patrol sobre el total de órdenes de movimiento militar del replay.',
        why: 'Usar Patrullar o Movimiento de ataque evita que tus unidades persigan a un solo enemigo sin pegar, aumentando mucho el daño real en cada pelea.',
      },
      en: {
        title: 'Combat Control (Attack-Move / Patrol)',
        what: 'Share of your military movement orders using Attack-Move or Patrol instead of plain Move clicks.',
        how: 'Divides Attack-Move + Patrol commands by total military movement orders recorded in the replay.',
        why: 'Attack-Move and Patrol prevent units from chasing a single target without attacking, dramatically improving melee fight efficiency.',
      },
      zh: {
        title: '交战控兵指令占比（攻击移动/巡逻）',
        what: '军事移动指令中使用攻击移动或巡逻的比例。',
        how: '用录像中的攻击移动和巡逻指令数除以总军事移动指令数。',
        why: '使用攻击移动或巡逻能避免部队追着单个目标傻跑不输出，显著提升团战战损比。',
      },
    },
    metric_age_timings: {
      scope: 'central',
      es: {
        title: 'Tiempos de llegada a Edades (Feudal / Castillos)',
        what: 'En qué minuto del reloj del juego alcanzaste cada edad (Feudal, Castillos o Imperial).',
        how: 'Toma el reloj oficial de llegada del servidor registrado en la partida (equivalente a AoE2Insights / CaptureAge), separado por mapas abiertos y cerrados.',
        why: 'Llegar 30–60 segundos antes abre ventanas clave de presión militar o expansión económica antes de que tu rival tenga respuesta.',
      },
      en: {
        title: 'Age-Up Timings (Feudal / Castle)',
        what: 'The exact in-game clock minute when you reached Feudal, Castle, or Imperial Age.',
        how: 'Uses the authoritative server age-reached timestamp from your replay, split between open and closed maps.',
        why: 'Arriving 30–60 seconds earlier creates power-spike windows before your opponent can react.',
      },
      zh: {
        title: '升级时代时间（封建 / 城堡）',
        what: '你在游戏内时钟到达封建、城堡或帝王时代的准确分钟数。',
        how: '读取录像中的官方时代到达时间戳，并区分开放图与封闭图进行对比。',
        why: '提前 30–60 秒升级能抢先拿到兵种科技强势期或经济扩张窗口。',
      },
    },

    // ── INICIO (HOME) ──
    wh_treasury: {
      scope: 'home',
      es: {
        title: 'Tu Oro esta semana (Lunes a Domingo)',
        what: 'Todo el oro que moviste esta semana en tus partidas analizadas (unidades entrenadas, mejoras, edades y ventas de mercado) más tu rango semanal.',
        how: 'Suma los costos oficiales en oro del árbol de AoE2:DE de todas tus partidas jugadas de lunes 00:00 a domingo 23:59 y se reinicia automáticamente a 0 cada lunes.',
        why: 'Sirve como termómetro divertido de actividad semanal y resume tus récords de la semana (victoria más rápida, mejor Alta Edad y mayor botín).',
      },
      en: {
        title: 'Your Weekly Gold Treasury (Mon–Sun)',
        what: 'Total gold spent and generated across your analyzed matches this week, along with your weekly rank.',
        how: 'Totals official AoE2:DE gold costs for trained units, ages, techs, and market sales from Monday 00:00 to Sunday 23:59, resetting every Monday.',
        why: 'Tracks your weekly momentum alongside your fastest win, best Dark Age TC uptime, and biggest single-game gold haul.',
      },
      zh: {
        title: '本周黄金库（周一至周日）',
        what: '统计本周已分析对局中消耗与获取的黄金总量以及每周黄金段位。',
        how: '按官方科技树金价累计周一 00:00 至周日 23:59 的造兵、升级、科技与市场卖资源黄金，每周一零点重置。',
        why: '直观记录你本周的对局活跃度与最佳纪录（最快胜局、最佳黑暗时代等）。',
      },
    },
    wh_hero_stage: {
      scope: 'home',
      es: {
        title: 'Pulso Personal y Tira Semanal (L–D)',
        what: 'Un vistazo rápido a tu ELO actual (1v1 y Team), tu racha, tus resultados día por día de lunes a domingo y tu civilización protagonista.',
        how: 'Se construye directo desde tu historial oficial de partidas clasificatorias sin necesidad de abrir el juego.',
        why: 'Te permite ver al abrir Relic cómo venís en la semana, qué días rendiste mejor y cuál es tu civilización más efectiva.',
      },
      en: {
        title: 'Personal Pulse & Mon–Sun Strip',
        what: 'Quick snapshot of your current 1v1 and Team ELO, win streak, Monday-to-Sunday daily results, and signature civ.',
        how: 'Pulled directly from your official ranked match history.',
        why: 'Shows your weekly rhythm, best-performing days, and strongest recent civilization at a glance.',
      },
      zh: {
        title: '个人状态与周一至周日活跃条',
        what: '快速查看当前 1v1 / 团战 ELO、连胜状态、周一至周日每日胜负以及近期主力文明。',
        how: '直接汇总自官方排位对局历史。',
        why: '打开 Relic 即可一眼了解本周手感与最顺手的文明。',
      },
    },
    wh_global: {
      scope: 'home',
      es: {
        title: 'Meta Global de AoE2:DE y Counters Pro',
        what: 'Las civilizaciones más elegidas, las de mayor porcentaje de victoria, los mapas más jugados de la semana y los mejores counters contra la #1 del meta.',
        how: 'Se actualiza automáticamente desde datos reales del ladder global y cruces empíricos de partidas Pro (+1900 ELO).',
        why: 'Te avisa qué civilizaciones te vas a cruzar seguido esta semana en ranked y con qué picks podés castigarlas.',
      },
      en: {
        title: 'Global AoE2:DE Meta & Pro Counters',
        what: 'Most picked civilizations, highest winrate picks, top maps this week, and empirical counters against the #1 meta civ.',
        how: 'Updated automatically from global ladder statistics and high-ELO (+1900) matchup datasets.',
        why: 'Prepares you for what opponents are spamming on ladder this week and which civs counter them best.',
      },
      zh: {
        title: '全球天梯环境与职业克制推荐',
        what: '展示本周登场率与胜率最高的文明、热门地图以及克制当前头号热门文明的职业数据。',
        how: '自动同步全球排位环境与高分段（+1900 ELO）真实对局克制数据。',
        why: '帮你提前掌握天梯热门套路并选出针对性的克制文明。',
      },
    },

    // ── CENTRAL ──
    cx_roadmap: {
      scope: 'central',
      es: {
        title: 'Hoja de Ruta al Próximo ELO',
        what: 'Identifica los 2 o 3 frenos concretos que hoy te separan del siguiente escalón de +100 ELO en RM 1v1.',
        how: 'Analiza únicamente tus replays puros de RM 1v1 estándar (sin mezclar Team Games) y compara tu mediana real contra la mediana de jugadores del próximo rango de ELO.',
        why: 'En vez de darte consejos genéricos, te muestra exactamente dónde estás perdiendo más ventaja (con la muesca vertical indicando la meta) y una regla práctica para entrenarlo en Mi Plan.',
      },
      en: {
        title: 'Road to Next ELO',
        what: 'Pinpoints the top 2–3 bottlenecks currently holding you back from the next +100 ELO bracket in RM 1v1.',
        how: 'Analyzes only pure standard RM 1v1 replays (never mixed with Team Games) and compares your real median against empirical benchmarks of the target bracket.',
        why: 'Replaces vague tips with your highest-impact gaps (the vertical notch marks the target) plus an actionable drill you can pin straight to My Plan.',
      },
      zh: {
        title: '冲分路线图（下一 ELO 分段）',
        what: '定位阻碍你突破下一个 +100 ELO 分段的 2–3 个最核心瓶颈（纯单挑 RM 1v1）。',
        how: '仅分析标准黑暗开局的单挑录像，将你的真实中位数与目标分段玩家的真实基准数据对比。',
        why: '用垂直目标刻度直观标出差距最大的短板，并附带可直接加入“我的计划”的实战练习规则。',
      },
    },
    cx_hero: {
      scope: 'central',
      es: {
        title: 'Resumen de Ladder (ELO, Pico, Winrate y Racha)',
        what: 'Tu puntuación actual en el modo seleccionado, tu máximo histórico (pico), porcentaje de victorias y racha reciente.',
        how: 'Se sincroniza en vivo con los servidores oficiales de Age of Empires II: DE y tu historial de partidas.',
        why: 'Te da el contexto real de tu nivel actual y si estás en subida, meseta o racha negativa antes de analizar los detalles.',
      },
      en: {
        title: 'Ladder Summary (ELO, Peak, Winrate & Streak)',
        what: 'Your current rating in the active ladder mode, all-time peak ELO, overall winrate, and current streak.',
        how: 'Synced directly from official Age of Empires II: DE leaderboards and match history.',
        why: 'Gives immediate context on your current form before diving into mechanical or strategic diagnostics.',
      },
      zh: {
        title: '天梯总览（当前分、最高分、胜率与连胜）',
        what: '当前模式下的排位分数、历史最高 ELO、胜率与近期连胜/连败状态。',
        how: '直接同步自帝国时代 II 官方天梯与战绩接口。',
        why: '在深入分析战术与操作细节前，快速掌握当前整体状态。',
      },
    },
    cx_dna: {
      scope: 'central',
      es: {
        title: 'ADN de Jugador (Radar de 6 ejes)',
        what: 'Un perfil visual de tu estilo competitivo en 6 dimensiones: Apertura, Macro, Agresión, Control, Adaptación y Consistencia.',
        how: 'Combina datos reales de tus partidas y replays (tiempos de edad, producción de aldeanos, presión temprana, uso de micro y estabilidad de resultados).',
        why: 'Te deja ver de un vistazo si ganás más por macro sólido o por agresión temprana, y qué faceta de tu juego está más desequilibrada.',
      },
      en: {
        title: 'Player DNA (6-Axis Radar)',
        what: 'Visual fingerprint of your playstyle across 6 pillars: Opening, Macro, Aggression, Control, Adaptation, and Consistency.',
        how: 'Blends real match and replay telemetry (age timings, eco scaling, early pressure, micro orders, and result stability).',
        why: 'Instantly reveals whether you win through booming or aggression and which pillar lags behind.',
      },
      zh: {
        title: '玩家基因雷达图（六维风格）',
        what: '从开局、运营、进攻、操作、应变与稳定性六个维度描绘你的打法画像。',
        how: '综合真实排位与录像数据（升级时间、农民运营、前期压制、交战指令与发挥波动）。',
        why: '一眼看清你是偏运营还是偏进攻，以及哪一项能力最需要补强。',
      },
    },
    cx_spotlights: {
      scope: 'central',
      es: {
        title: 'Tu Arma Secreta y Destacados',
        what: 'Muestra tu civilización más letal, tu mejor mapa y las combinaciones donde tu winrate sobresale por encima de tu promedio.',
        how: 'Filtra tus civilizaciones y mapas con suficiente cantidad de partidas para evitar falsos 100% de 1 sola partida.',
        why: 'Te ayuda a reconocer tus picks de máxima confianza cuando querés asegurar puntos en ranked.',
      },
      en: {
        title: 'Secret Weapon & Highlights',
        what: 'Highlights your deadliest civilization, strongest map, and top-performing combinations above your baseline winrate.',
        how: 'Applies minimum sample filters so single-game luck never skews your real strengths.',
        why: 'Identifies your highest-confidence comfort picks when climbing ranked.',
      },
      zh: {
        title: '王牌武器与高光组合',
        what: '展示你胜率明显高于平均水平的强势文明、拿手地图与最佳搭配。',
        how: '设置最小样本量门槛，避免 1 局 100% 胜率的偶然噪音。',
        why: '帮你锁定上分最稳的绝活文明与主场地图。',
      },
    },
    cx_golden_hour: {
      scope: 'central',
      es: {
        title: 'Hora Dorada (Rendimiento por franja horaria)',
        what: 'En qué momento del día (mañana, tarde, noche o madrugada) ganás más partidas y sumás más ELO.',
        how: 'Agrupa todas tus partidas reales según tu hora local de inicio y calcula tu winrate real en cada bloque.',
        why: 'Muchos jugadores pierden ELO jugando cansados de madrugada sin notarlo. Saber tu franja más fuerte evita sesiones de desgaste.',
      },
      en: {
        title: 'Golden Hour (Performance by Time of Day)',
        what: 'Which time window of the day (morning, afternoon, evening, late night) yields your highest winrate.',
        how: 'Groups your ranked matches by local start time and computes winrate per block.',
        why: 'Many players bleed ELO playing fatigued late at night without realizing it. Knowing your peak window protects your rating.',
      },
      zh: {
        title: '黄金时段（按时间段胜率）',
        what: '统计你在一天中不同时段（上午、下午、晚间、深夜）的真实胜率表现。',
        how: '按本地开局时间对排位对局分组计算胜率。',
        why: '帮你发现是否总在深夜疲劳期掉分，合理安排冲分时间。',
      },
    },
    cx_trophies: {
      scope: 'central',
      es: {
        title: 'Vitrina de Récords Personales',
        what: 'Tus mejores marcas históricas verificadas: mayor racha, victoria más rápida, mayor remontada, pico de eAPM y partidas épicas.',
        how: 'Recorre tu historial de partidas y replays guardados y extrae tus extremos reales comprobados.',
        why: 'Sirve como referencia de tu techo real: te muestra hasta dónde ya demostraste que podés rendir.',
      },
      en: {
        title: 'Personal Records Showcase',
        what: 'Your verified personal bests: longest win streak, fastest victory, peak eAPM, and standout games.',
        how: 'Scans your real match history and analyzed replays for verified record highs.',
        why: 'Shows your proven ceiling and tracks milestone improvements over time.',
      },
      zh: {
        title: '个人纪录陈列馆',
        what: '记录你真实达成的个人最佳表现：最长连胜、最快胜局、最高 eAPM 等。',
        how: '从历史排位与本地录像数据中提取经过验证的极值纪录。',
        why: '清晰呈现你的实力上限与阶段性突破。',
      },
    },
    cx_combat_dna: {
      scope: 'central',
      es: {
        title: 'Huella de Combate',
        what: 'Qué tipos de unidades (caballería, arqueros, infantería, asedio) y edificios militares entrenás con mayor frecuencia.',
        how: 'Suma las órdenes reales de creación de unidades y construcción militar de todos tus replays analizados.',
        why: 'Te muestra si dependés siempre de una sola composición (por ejemplo solo Jinetes) o si combinás unidades de apoyo y counters.',
      },
      en: {
        title: 'Combat Footprint',
        what: 'Which unit classes (cavalry, archers, infantry, siege) and military buildings you rely on most.',
        how: 'Aggregates real unit queue and building commands across your analyzed replays.',
        why: 'Reveals if you over-rely on one unit line instead of adding counters and siege.',
      },
      zh: {
        title: '战斗风格印记',
        what: '统计你最常使用的兵种类型（骑兵、弓手、步兵、攻城）与军事建筑偏好。',
        how: '汇总已分析录像中的真实造兵与军事建筑建造指令。',
        why: '帮你看清自己是否过于依赖单一兵种，从而有意识地练习多兵种配合与转兵。',
      },
    },
    cx_tempo: {
      scope: 'central',
      es: {
        title: 'Velocidad vs Cerebro (eAPM y Ritmo)',
        what: 'Compara tu velocidad mecánica (eAPM) contra tu eficiencia táctica y cómo se reparte tu atención entre economía y combate.',
        how: 'Usa tu eAPM real sin spam y la proporción de comandos económicos vs militares leídos de tus replays.',
        why: 'En AoE2 no siempre gana el más rápido: ayuda a ver si te falta velocidad de manos o si ya tenés buena velocidad pero te conviene mejorar decisiones.',
      },
      en: {
        title: 'Speed vs Brain (eAPM & Pace)',
        what: 'Compares your mechanical speed (eAPM) against tactical efficiency and your eco vs military attention split.',
        how: 'Uses debounced eAPM and the ratio of economy vs military commands from your replays.',
        why: 'Helps you tell whether your main bottleneck is hand speed or decision-making/macro discipline.',
      },
      zh: {
        title: '手速与意识（eAPM 与节奏）',
        what: '对比你的有效手速与战术效率，以及经济操作与军事操作的注意力分配。',
        how: '基于录像中的去重 eAPM 与经济/军事指令占比计算。',
        why: '帮你判断当前短板是手速不足还是运营决策与转兵意识问题。',
      },
    },
    cx_clocks: {
      scope: 'central',
      es: {
        title: 'Reloj de Victorias vs Derrotas',
        what: 'Muestra en qué duración de partida (temprana <25m, media 25–40m o larga +40m) ganás más y dónde perdés más.',
        how: 'Convierte la duración real del servidor al reloj estándar de AoE2 (1,7×) y calcula tu winrate por tramo.',
        why: 'Si perdés la mayoría de tus partidas largas de Imperial, sabés al instante que te conviene entrenar cierre en Castillos o composición de late game.',
      },
      en: {
        title: 'Win vs Loss Clock Curve',
        what: 'Shows in which match length (early <25m, mid 25–40m, late 40m+) you win most often vs where you drop games.',
        how: 'Converts official match durations to standard 1.7× AoE2 game time and computes winrate per phase.',
        why: 'Immediately shows if you shine in early aggression or struggle to close out Imperial wars.',
      },
      zh: {
        title: '胜负时长分布曲线',
        what: '展示你在前期（<25分）、中期（25–40分）与大后期（40分+）各阶段的胜率变化。',
        how: '将官方对局时长换算为标准 1.7× 游戏内时钟并分段统计胜率。',
        why: '快速发现你是擅长前期速推还是容易在帝王后期被翻盘。',
      },
    },
    cx_civ_diag: {
      scope: 'central',
      es: {
        title: 'Diagnóstico por Civilización',
        what: 'Evalúa con rigor estadístico cómo rendís con cada civilización, en qué mapas funciona mejor y contra qué aperturas o rivales sufrís.',
        how: 'Aplica guardas de muestra mínima, intervalos de confianza y ajusta por diferencia de ELO rival para no sacar conclusiones falsas de pocas partidas.',
        why: 'Te dice qué civilizaciones te están dando ELO de verdad y cuáles conviene pulir o reservar solo para ciertos mapas (abiertos vs cerrados).',
      },
      en: {
        title: 'Civilization Diagnostic',
        what: 'Statistically evaluates your real performance per civilization, open vs closed map splits, and recent form.',
        how: 'Uses sample-size guards, confidence intervals, and opponent ELO adjustment to avoid false alarms from small samples.',
        why: 'Shows which civs genuinely earn you ELO and which ones only work on specific map types.',
      },
      zh: {
        title: '文明专项诊断',
        what: '用严谨统计评估你每个文明的真实表现、开放/封闭图差异以及近期走势。',
        how: '引入样本量保护、置信区间与对手 ELO 校正，避免小样本误判。',
        why: '帮你分辨哪些文明真正能稳定上分，哪些只适合特定地图。',
      },
    },
    cx_map_diag: {
      scope: 'central',
      es: {
        title: 'Diagnóstico por Mapa y eAPM por Mapa',
        what: 'Analiza tu rendimiento real mapa por mapa (Arabia, Arena, Nómada, etc.), tu mejor civilización en cada uno y tu ritmo de eAPM en ese terreno.',
        how: 'Cruza tu historial oficial de resultados en cada mapa con el eAPM real de tus replays jugados en ese mismo mapa.',
        why: 'Te ayuda a elegir tus baneos de mapa con datos reales y a elegir la civilización correcta según el terreno.',
      },
      en: {
        title: 'Map Diagnostic & eAPM by Map',
        what: 'Breaks down your real winrate per map (Arabia, Arena, Nomad, etc.), best civ there, and your eAPM on each terrain.',
        how: 'Joins official ranked outcomes per map with real replay eAPM measured on that exact map.',
        why: 'Makes map bans effortless and shows which civ fits each map best for your playstyle.',
      },
      zh: {
        title: '地图专项诊断与分图 eAPM',
        what: '逐图分析你在阿拉伯、竞技场、游牧等地图的胜率、最佳文明与分图操作节奏。',
        how: '结合官方分图胜负记录与同地图本地录像的真实 eAPM。',
        why: '用真实数据指导你 Ban 图与选文明。',
      },
    },
    cx_academy: {
      scope: 'central',
      es: {
        title: 'Academia Personal (Edades y 6 Hábitos)',
        what: 'Mide tu evolución reciente frente a tus partidas anteriores en las 4 edades y en tus 6 hábitos mecánicos clave.',
        how: 'Compara el bloque más reciente de replays locales contra tu bloque previo usando el mismo motor unificado (excluyendo abandonos menores a 3 min).',
        why: 'Te muestra de forma objetiva si realmente estás mejorando hábitos como TC inactivo, Hacha a tiempo, Herrería y micro de combate.',
      },
      en: {
        title: 'Personal Academy (Age Grades & 6 Habits)',
        what: 'Tracks how your 4 ages and 6 core mechanical habits evolved between older and recent replays.',
        how: 'Compares your newest local replays against prior ones via the unified engine (excluding <3 min quits).',
        why: 'Proves objectively whether your practice is turning into cleaner TC uptime, faster eco techs, and better combat micro.',
      },
      zh: {
        title: '个人学院（四时代评级与六大习惯）',
        what: '对比近期与早期录像在四个时代和六项核心基本功上的进步幅度。',
        how: '使用统一引擎对比新旧本地录像（自动排除 3 分钟内秒退局）。',
        why: '客观验证你的练习是否真正转化为了更少的空闲时间和更稳的基本功。',
      },
    },
    cx_elo_intel: {
      scope: 'central',
      es: {
        title: 'Motores de ELO, Antídotos y Curva de Sesión',
        what: 'Desglosa qué factores te hicieron ganar o perder más puntos de ELO, qué rivales te complican y cómo rinde tu sesión partido tras partido.',
        how: 'Suma los cambios reales de ELO (+ / −) por mapa, civilización, apertura rival y número de partida dentro de cada sesión continua.',
        why: 'Detecta fugas ocultas como seguir jugando después de 3 derrotas seguidas (tilt/fatiga) o perder siempre contra un mismo estilo.',
      },
      en: {
        title: 'ELO Drivers, Antidotes & Session Curve',
        what: 'Breaks down exactly where you gained or lost rating points, toughest matchups, and how you perform deeper into a play session.',
        how: 'Totals real rating deltas by map, civ, matchup, and match index within continuous play sessions.',
        why: 'Exposes hidden ELO leaks like session fatigue/tilt or recurring matchup weaknesses.',
      },
      zh: {
        title: 'ELO 涨跌归因、克制方案与连打曲线',
        what: '拆解你的涨分来源与掉分漏洞、棘手对位以及连续对局中的状态变化。',
        how: '按地图、文明、对位与单次连打局数汇总真实 ELO 变动值。',
        why: '帮你识别连败上头、疲劳掉分以及特定对位短板。',
      },
    },
    cx_chart: {
      scope: 'central',
      es: {
        title: 'Curva de Evolución de ELO',
        what: 'La trayectoria histórica de tu puntuación partida a partida en el modo actual.',
        how: 'Grafica el rating oficial confirmado al final de cada partida clasificada.',
        why: 'Permite distinguir una mala racha pasajera de una tendencia real de subida o estancamiento.',
      },
      en: {
        title: 'ELO Progression Chart',
        what: 'Your rating trajectory match by match in the selected ladder mode.',
        how: 'Plots confirmed post-match official ratings chronologically.',
        why: 'Helps separate normal short-term variance from real long-term growth or plateaus.',
      },
      zh: {
        title: 'ELO 历史走势图',
        what: '展示当前排位模式下每局结束后的分数轨迹。',
        how: '按时间顺序绘制官方确认的赛后分数。',
        why: '帮你区分短期波动与真实的长期实力提升。',
      },
    },

    // ── POSTMATCH ──
    pm_stages: {
      scope: 'postmatch',
      es: {
        title: 'Calificación por Edades (S a D)',
        what: 'Una nota objetiva de cómo ejecutaste Alta Edad, Feudal, Castillos e Imperial en esa partida puntual.',
        how: 'Evalúa datos 100% del replay (TC inactivo, tiempos de avance, Hacha, expansión de TCs, ritmo militar, micro y eAPM) calibrados a tu banda de ELO.',
        why: 'Te señala en 2 segundos en qué etapa exacta de la partida se te escapó la ventaja para revisar solo ese tramo.',
      },
      en: {
        title: 'Age Stage Grades (S–D)',
        what: 'Objective grade for your Dark, Feudal, Castle, and Imperial Age execution in this match.',
        how: 'Scores deterministic replay metrics (TC idle, age timings, eco techs, TC boom, military pace, micro, eAPM) calibrated to your ELO band.',
        why: 'Pinpoints in 2 seconds which exact age decided the match so you know where to focus.',
      },
      zh: {
        title: '分时代执行评级（S–D）',
        what: '针对本局黑暗、封建、城堡、帝王四个时代执行质量的客观打分。',
        how: '基于录像真实指标（城镇中心空闲、升级时间、经济科技、扩张与控兵）按你的分段标准评分。',
        why: '两秒定位本局在哪个时代被拉开差距，复盘更有针对性。',
      },
    },
    pm_curve: {
      scope: 'postmatch',
      es: {
        title: 'Curva de Producción (Vos vs Rival)',
        what: 'Compara minuto a minuto cuántos aldeanos y unidades militares encargaron vos y tu rival en el mismo reloj.',
        how: 'Agrupa todas las órdenes válidas de producción del archivo .aoe2record en 12 tramos sincronizados.',
        why: 'Hace visible el minuto exacto donde tu economía o tu ejército despegó — o donde el rival te sacó diferencia.',
      },
      en: {
        title: 'Production Curve (You vs Opponent)',
        what: 'Minute-by-minute comparison of villagers and military units queued by you and your opponent on the same game clock.',
        how: 'Buckets valid production commands from the .aoe2record into 12 synchronized intervals.',
        why: 'Reveals the exact minute where your economy or army pulled ahead — or fell behind.',
      },
      zh: {
        title: '双方产能曲线对比',
        what: '在同一游戏时钟下对比你与对手的农民及军事单位累计产出趋势。',
        how: '将录像中的有效造兵与造农指令划分为 12 个同步时间段绘制。',
        why: '直观看到经济或军力在具体哪一分钟拉开差距。',
      },
    },
    pm_eapm_multi: {
      scope: 'postmatch',
      es: {
        title: 'Comparativa de eAPM de Todos los Jugadores',
        what: 'Muestra la curva minuto a minuto y la estabilidad (caja Q1–Q3 y mediana) del eAPM de cada jugador con su color real de partida.',
        how: 'Filtra spam (<150 ms) para todos los participantes del replay; la caja central muestra tu rango habitual (25%–75%) y la línea blanca tu mediana.',
        why: 'Te permite ver si mantuviste tu velocidad en las peleas grandes o si caíste por cansancio en late game frente al resto de la sala.',
      },
      en: {
        title: 'All-Player eAPM Curves & Distribution',
        what: 'Shows every player’s minute-by-minute eAPM curve and box-and-whisker stability (Q1–Q3 & median) in their real in-game color.',
        how: 'Debounces spam (<150 ms) for all players in the replay; the shaded box spans the 25th–75th percentile with the bright median line inside.',
        why: 'Shows whether you kept pace during peak battles or slowed down in late game compared to the lobby.',
      },
      zh: {
        title: '全场玩家 eAPM 曲线与稳定性箱线图',
        what: '按游戏内真实颜色展示所有玩家的逐分钟有效手速曲线及 Q1–Q3 分布箱线图。',
        how: '对录像内每位玩家去重（<150 ms）；箱体代表 25%–75% 区间，亮线为中位数。',
        why: '一眼看出你在关键团战与大后期的节奏保持能力。',
      },
    },
    pm_insights: {
      scope: 'postmatch',
      es: {
        title: 'Hallazgos Clave del Replay',
        what: 'Traduce tus datos en consecuencias reales de partida: Aldeanos Fantasma (recursos perdidos por TC parado), Minuto del Quiebre, Brecha de Herrería y Adaptación.',
        how: 'Calcula cada tarjeta de forma determinista sobre los comandos y tiempos del .aoe2record (nunca adivina datos ocultos).',
        why: 'Convierte números fríos en una historia fácil de entender: por ejemplo cuántos Jinetes equivalen a tu TC inactivo.',
      },
      en: {
        title: 'Key Replay Insights',
        what: 'Translates raw telemetry into concrete game impact: Ghost Villagers (lost resources from idle TC), Turning Point, Blacksmith Gap, and Tech-Switch.',
        how: 'Computed deterministically from real .aoe2record commands and timestamps.',
        why: 'Turns abstract numbers into clear takeaways — like how many Knights your idle TC cost you.',
      },
      zh: {
        title: '录像关键洞察',
        what: '把冰冷数据转化为实战后果：幽灵村民（空闲损失的资源折算）、转折点分钟、铁匠铺延迟与转兵应变。',
        how: '全部基于 .aoe2record 真实指令与时间戳确定性计算。',
        why: '直观理解失误代价，例如城镇中心空闲相当于少出了多少骑士。',
      },
    },
    pm_civ_mastery: {
      scope: 'postmatch',
      es: {
        title: 'Aprovechamiento de Bonos de Civilización',
        what: 'Revisa si realmente aprovechaste las ventajas únicas de tu civilización en esa partida (ej. 2.º CU Cumano en Feudal, Pasturas Kitán, Mercado Sarraceno o Folwarks Polacos).',
        how: 'Evalúa reglas verificables en el replay para las 56 civilizaciones oficiales respetando tu árbol tecnológico y tipo de mapa.',
        why: 'Jugar una civilización sin usar su bono principal es regalar ventaja gratis al rival.',
      },
      en: {
        title: 'Civilization Bonus Mastery',
        what: 'Checks whether you actually leveraged your civilization’s signature bonuses (e.g., Cuman 2TC Feudal, Khitan Pastures, Saracen Market, Polish Folwarks).',
        how: 'Runs verifiable replay checks across all 56 ranked civilizations respecting tech tree and map context.',
        why: 'Playing a civ without leveraging its core strengths leaves free value on the table.',
      },
      zh: {
        title: '文明加成利用率',
        what: '评估本局是否真正发挥了所选文明的核心优势（如库曼封建双城镇中心、契丹牧场、萨拉森市场、波兰庄园等）。',
        how: '覆盖全部 56 个标准文明的可验证录像规则。',
        why: '选对文明并把特色加成用出来，是提升胜率最直接的杠杆。',
      },
    },

    // ── ENTRENAMIENTO ──
    tr_perf_hero: {
      scope: 'training',
      es: {
        title: 'Consola de Progreso y Cuello de Botella',
        what: 'Resume tu foco prioritario actual y traduce tus segundos de TC inactivo a aldeanos perdidos para medir el costo real.',
        how: 'Agrega tus replays analizados con el motor unificado y compara tus últimos partidos contra tu referencia personal y de rango.',
        why: 'Te da un único objetivo claro para entrenar en tu próxima sesión sin dispersarte en 20 cosas a la vez.',
      },
      en: {
        title: 'Progress Console & Bottleneck Diagnosis',
        what: 'Highlights your #1 current bottleneck and converts idle TC seconds into lost villagers so the cost is crystal clear.',
        how: 'Aggregates your analyzed replays through the unified engine against your personal and bracket benchmarks.',
        why: 'Focuses your next practice session on one high-impact habit instead of 20 scattered stats.',
      },
      zh: {
        title: '进阶控制台与瓶颈诊断',
        what: '提炼当前最核心的短板，并将城镇中心空闲秒数换算为损失的村民数。',
        how: '通过统一分析引擎汇总你的录像数据，对比个人基准与分段目标。',
        why: '让你每次练习只攻克一个高回报习惯，效率最高。',
      },
    },
    tr_weekly: {
      scope: 'training',
      es: {
        title: 'Balance Semanal (Mejoras de esta semana)',
        what: 'Muestra únicamente mejoras reales verificadas en tus fundamentos durante esta semana (Antes → Ahora) junto a tu actividad diaria.',
        how: 'Compara tus partidas recientes de la semana contra tu base previa aplicando márgenes mínimos para nunca inventar mejoras falsas.',
        why: 'Refuerza lo que realmente está funcionando en tu entrenamiento y te muestra días activos vs descanso con total honestidad.',
      },
      en: {
        title: 'Weekly Balance (Verified Gains)',
        what: 'Shows only genuinely verified mechanical improvements this week (Before → Now) alongside your daily activity chart.',
        how: 'Compares this week’s matches against your prior baseline using strict deadbands so noise never counts as a fake gain.',
        why: 'Proves what is actually improving in your gameplay with zero fluff.',
      },
      zh: {
        title: '本周进步总结',
        what: '仅展示本周经过严格验证的真实基本功提升（之前 → 现在）与每日活跃记录。',
        how: '设置严格波动门槛对比本周与前期基线，杜绝虚假进步提示。',
        why: '诚实记录真正见效的训练成果。',
      },
    },
    tr_plan: {
      scope: 'training',
      es: {
        title: 'Mi Plan (Seguimiento Automático)',
        what: 'Tu lista personal de objetivos fijados desde Central, Postmatch, Progreso o APM.',
        how: 'Cada vez que terminás una partida real (≥ 12 min) o una ronda de APM, Relic revisa automáticamente si cumpliste la meta y la marca como ✓ CUMPLIDO.',
        why: 'Convierte las estadísticas en hábitos concretos: elegís 2 o 3 metas, jugás y ves en vivo cómo las vas superando.',
      },
      en: {
        title: 'My Plan (Auto-Verified Goals)',
        what: 'Your personal checklist of training goals pinned from Central, Postmatch, Progress, or APM Lab.',
        how: 'After every real match (≥ 12 min) or APM drill round, Relic automatically checks your performance and marks achieved goals ✓ COMPLETED.',
        why: 'Turns analytics into real habits: pick 2–3 goals, play ranked, and watch them get checked off automatically.',
      },
      zh: {
        title: '我的计划（自动验收目标）',
        what: '收录你从数据中心、赛后报告、进阶或 APM 实验室收藏的训练目标。',
        how: '每局满 12 分钟的实战或 APM 练习结束后，Relic 会自动核验是否达标并标记为 ✓ 已完成。',
        why: '把数据分析变成可执行的日常训练闭环。',
      },
    },
    tr_orders: {
      scope: 'training',
      es: {
        title: 'Build Orders y Asistente en Vivo',
        what: 'Guías paso a paso de aperturas (Scouts, Arqueros, Fast Castle, etc.) que podés seguir en vivo sobre el juego.',
        how: 'Sincroniza cada paso por población y reloj de juego con el overlay superior si activás el Build Order Helper en Batalla.',
        why: 'Evita improvisar el reparto de aldeanos en Alta Edad y Feudal, eliminando los retrasos más comunes al subir de edad.',
      },
      en: {
        title: 'Build Orders & Live Helper',
        what: 'Step-by-step opening guides (Scouts, Archers, Fast Castle, etc.) you can arm for the live in-game overlay.',
        how: 'Syncs each villager allocation step with the in-game clock when Build Order Helper is enabled.',
        why: 'Removes Dark & Feudal Age guesswork so your age-up timings stay crisp every game.',
      },
      zh: {
        title: '建造顺序与实战悬浮助手',
        what: '提供斥候、弓手、速城等标准开局步骤，可装配至游戏内顶部悬浮栏同步跟练。',
        how: '开启对战助手后按人口与游戏时钟自动推进步骤。',
        why: '消除黑暗与封建期配农犹豫，稳定每一次升级时间。',
      },
    },
    tr_matchups: {
      scope: 'training',
      es: {
        title: 'Matchups Pro (3 Edades + Curva de Reloj)',
        what: 'Plan táctico edad por edad (Feudal → Castillos → Imperial) entre dos civilizaciones y quién lleva ventaja según la duración de la partida.',
        how: 'Compilado a partir de decenas de miles de partidas reales de alto nivel (+1900 ELO) separadas en mapas abiertos (Arabia) y cerrados (Arena).',
        why: 'Te muestra de antemano qué composición preparar, qué trampa evitar y si te conviene cerrar rápido o escalar a Imperial.',
      },
      en: {
        title: 'Pro Matchups (3-Age Gameplan & Clock Curve)',
        what: 'Age-by-age gameplan (Feudal → Castle → Imperial) between any two civilizations plus who wins early vs late.',
        how: 'Compiled from tens of thousands of high-ELO (+1900) matches split by open (Arabia) and closed (Arena) maps.',
        why: 'Tells you before the game starts what army to tech into and whether to push early or boom.',
      },
      zh: {
        title: '职业对位指南（三时代规划与时长胜率）',
        what: '展示任意双文明在封建、城堡、帝王三阶段的联动打法以及前中后期谁占优势。',
        how: '基于数万局高分段（+1900 ELO）真实对局按开放图与封闭图分别统计。',
        why: '开局前就知道该转什么兵、躲什么坑以及该速推还是运营。',
      },
    },
    tr_apm: {
      scope: 'training',
      es: {
        title: 'Laboratorio de APM y Micro',
        what: 'Entrena velocidad de cursor, precisión de clic y lectura rápida de unidades/counters reales de AoE2:DE.',
        how: 'Calcula tu eAPM efectivo (clics acertados por minuto multiplicados por tu precisión %) y tu tiempo medio de reacción en milisegundos.',
        why: 'Hacer 1 o 2 rondas de 30 s antes de jugar calienta la mano y mejora tu capacidad de seleccionar unidades clave en medio de una pelea.',
      },
      en: {
        title: 'APM & Micro Lab',
        what: 'Trains cursor speed, click precision, and instant recognition of real AoE2:DE units and counters.',
        how: 'Computes effective eAPM (valid hits per minute scaled by accuracy %) and average reaction time in milliseconds.',
        why: 'Running 1–2 quick 30s warmup rounds before ranked sharpens unit selection and fight micro.',
      },
      zh: {
        title: 'APM 与微操实验室',
        what: '使用帝国时代 II 真实单位头像训练鼠标速度、点击精度与克制反应。',
        how: '按命中率折算每分钟有效 APM，并记录平均反应毫秒数。',
        why: '排位前热身 1–2 局 30 秒练习能明显提升团战点杀与切屏效率。',
      },
    },
    tr_apm_lb: {
      scope: 'training',
      es: {
        title: 'Ranking Global de APM (30 s Estándar)',
        what: 'Clasificación mundial de jugadores de Relic en cada modo sobre la duración oficial de 30 segundos.',
        how: 'Registra tu mejor marca verificada de 30 s asociada únicamente a tu nombre de AoE2:DE y tu ELO 1v1 (nunca muestra correos ni datos personales).',
        why: 'Te da una referencia clara contra otros jugadores de tu mismo ELO para medir tu progreso mecánico.',
      },
      en: {
        title: 'Global APM Leaderboard (30s Standard)',
        what: 'Worldwide ranking of Relic players in each drill mode on the official 30-second standard.',
        how: 'Records your best verified 30s score under your AoE2:DE alias and 1v1 ELO only (zero emails or personal info).',
        why: 'Lets you benchmark your mechanical speed against players in your exact ELO bracket.',
      },
      zh: {
        title: '全球 APM 排行榜（30 秒标准）',
        what: '展示各模式下 30 秒标准赛的全球 Relic 玩家排名。',
        how: '仅绑定你的帝国时代 II 游戏名与单挑 ELO 记录最高有效成绩，绝不公开邮箱。',
        why: '方便与同分段玩家横向对比操作水准。',
      },
    },
    tr_arena: {
      scope: 'training',
      es: {
        title: 'Arena Táctica (Desafíos de AoE2:DE)',
        what: 'Preguntas rápidas de conocimiento competitivo real sobre counters, árboles tecnológicos, bonos de civilización y decisiones de partida.',
        how: 'Son 7 niveles progresivos con 3 vidas diarias; salir de la pestaña durante una pregunta activa descuenta 1 vida para mantener el desafío justo.',
        why: 'Dominar qué mejoras y counters tiene cada civilización evita errores tácticos que cuestan partidas enteras.',
      },
      en: {
        title: 'Tactical Arena (AoE2:DE Quiz)',
        what: 'Timed competitive knowledge challenges on counters, tech trees, civ bonuses, and real game decisions.',
        how: '7 progressive tiers with 3 daily lives; leaving the tab during an active question costs 1 life to keep it fair.',
        why: 'Knowing every civ’s tech gaps and counters prevents game-losing strategic blunders.',
      },
      zh: {
        title: '战术竞技场（帝国 II 知识挑战）',
        what: '限时测试兵种克制、科技树盲区、文明加成与实战决策。',
        how: '共 7 个进阶等级，每日 3 次机会；答题中途切走标签页会扣除 1 点生命以保证公平。',
        why: '熟记对手文明短板与克制关系，能避免关键决策失误。',
      },
    },
  };

  /**
   * Detecta la guía más específica posible bajo el puntero al hacer clic derecho:
   * primero intenta identificar la métrica exacta (fila/KPI), luego el cuadro contenedor.
   */
  function matchMetricFromText(text) {
    const s = String(text || '').toLowerCase();
    if (!s) return null;
    if (/alta edad|dark age|黑暗时代/.test(s) && /cu|tc|pausa|inactiv|idle|空闲/.test(s)) return 'metric_tc_dark';
    if (/bache|gap|parón|sin órdenes|停产/.test(s)) return 'metric_tc_gap';
    if (/hacha de doble filo|double-bit axe|双刃斧/.test(s)) return 'metric_dba';
    if (/sierra de arco|bow saw|弓锯/.test(s)) return 'metric_bowsaw';
    if (/campana urbana|town bell|警钟/.test(s)) return 'metric_townbell';
    if (/mercado|market|市场|madera vendida|impuesto/.test(s)) return 'metric_market';
    if (/herrer[íi]a|blacksmith|铁匠铺/.test(s)) return 'metric_blacksmith';
    if (/patrullar|movimiento de ataque|attack-move|control de combate|patrol|攻击移动/.test(s)) return 'metric_control_micro';
    if (/eapm|apm|ritmo efectivo|有效操作/.test(s)) return 'metric_eapm';
    if (/llegada a edad|feudal|castillos|castle time|feudal time|封建|城堡/.test(s) && /tiempo|llegada|time|timing|升级/.test(s)) return 'metric_age_timings';
    return null;
  }

  const CONTAINER_RULES = [
    // Inicio
    ['.wh-treasury', 'wh_treasury'],
    ['.wh-hero-stage', 'wh_hero_stage'],
    ['.wh-global-swap', 'wh_global'],
    ['.wh-global-col', 'wh_global'],
    // Central (IDs exactos)
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
    ['#cxEloAttributionCard', 'cx_elo_intel'],
    ['#cxMatchupSessionCard', 'cx_elo_intel'],
    ['#cxSectionIntel', 'cx_elo_intel'],
    ['#cxSectionChart', 'cx_chart'],
    ['.cx-hero', 'cx_hero'],
    // Postmatch
    ['.pm-stages-v2', 'pm_stages'],
    ['.pm-opening-bar', 'pm_stages'],
    ['.pm-apm-card', 'pm_eapm_multi'],
    ['.pm-curve-wrap', 'pm_curve'],
    ['.pm-insights-v6', 'pm_insights'],
    ['.pm-civ-mastery', 'pm_civ_mastery'],
    ['.pm-duel', 'pm_curve'],
    ['.pm-tech-box', 'metric_blacksmith'],
    ['.pm-habits', 'metric_control_micro'],
    // Entrenamiento
    ['.tr-weekly-sanctuary', 'tr_weekly'],
    ['.tr-perf-banner', 'tr_perf_hero'],
    ['.tr-perf-console', 'tr_perf_hero'],
    ['.tr-perf-chart-studio', 'tr_perf_hero'],
    ['.tr-perf-ledger', 'tr_perf_hero'],
    ['.tr-perf-timeline-panel', 'tr_perf_hero'],
    ['.tr-age-stages', 'tr_perf_hero'],
    ['.tr-queue-card', 'tr_plan'],
    ['.tr-bo-steps-panel', 'tr_orders'],
    ['.tr-bo-cards-list', 'tr_orders'],
    ['.tr-matchup-lab', 'tr_matchups'],
    ['.tr-powerspike-card', 'tr_matchups'],
    ['.tr-apm-lb-card', 'tr_apm_lb'],
    ['.tr-apm-stage', 'tr_apm'],
    ['.tr-arena-stage', 'tr_arena'],
  ];

  function resolveGuideForTarget(targetEl) {
    if (!targetEl || typeof targetEl.closest !== 'function') return null;

    // 1. Atributo explícito `data-help-id` si existiera
    const explicit = targetEl.closest('[data-help-id]');
    if (explicit) {
      const id = explicit.getAttribute('data-help-id');
      if (GUIDES[id]) return GUIDES[id];
    }

    // 2. Coincidencia específica sobre una fila/KPI puntual antes de caer al cuadro padre
    const specificRow = targetEl.closest(
      '.cx-rm-row, .cx-acad-habit-row, .tr-perf-kpi, .tr-perf-ledger-row, .pm-kpi, .pm-ins-card, .tr-apm-kpi',
    );
    if (specificRow) {
      const rowKey = matchMetricFromText(specificRow.textContent || '');
      if (rowKey && GUIDES[rowKey]) return GUIDES[rowKey];
    }

    // 3. Coincidencia por cuadro/sección contenedora
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
      </div>
      <div class="rx-help-foot">
        <span>${esc(t('help.footerHint', 'Clic derecho en cualquier cuadro o dato para ver cómo funciona'))}</span>
      </div>`;

    pop.hidden = false;
    pop.classList.remove('is-open');

    // Posicionamiento inteligente dentro del viewport (CSSOM, cero inline style=)
    const vw = root.innerWidth || 1200;
    const vh = root.innerHeight || 800;
    const rect = pop.getBoundingClientRect();
    const pw = rect.width || 360;
    const ph = rect.height || 260;
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

    requestAnimationFrame(() => pop.classList.add('is-open'));
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
    resolveGuideForTarget,
    openPopover,
    closePopover,
  };
})(typeof window !== 'undefined' ? window : globalThis);
