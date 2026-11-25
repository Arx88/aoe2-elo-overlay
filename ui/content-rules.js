(function (root) {
  'use strict';

  // Common Rioplatense voseo -> Castilian tuteo replacements for es-ES
  const ES_ES_RULES = [
    [/\bJugá\b/g, 'Juega'], [/\bjugá\b/g, 'juega'],
    [/\bElegí\b/g, 'Elige'], [/\belegí\b/g, 'elige'],
    [/\bRevisá\b/g, 'Revisa'], [/\brevisá\b/g, 'revisa'],
    [/\bMirá\b/g, 'Mira'], [/\bmirá\b/g, 'mira'],
    [/\bTocá\b/g, 'Pulsa'], [/\btocá\b/g, 'pulsa'],
    [/\bArmá\b/g, 'Crea'], [/\barmá\b/g, 'crea'],
    [/\bProbá\b/g, 'Prueba'], [/\bprobá\b/g, 'prueba'],
    [/\bProbalo\b/g, 'Pruébalo'], [/\bprobalo\b/g, 'pruébalo'],
    [/\bProbala\b/g, 'Pruébala'], [/\bprobala\b/g, 'pruébala'],
    [/\bBuscá\b/g, 'Busca'], [/\bbuscá\b/g, 'busca'],
    [/\bTenés\b/g, 'Tienes'], [/\btenés\b/g, 'tienes'],
    [/\bPodés\b/g, 'Puedes'], [/\bpodés\b/g, 'puedes'],
    [/\bQuerés\b/g, 'Quieres'], [/\bquerés\b/g, 'quieres'],
    [/\bVenís\b/g, 'Vienes'], [/\bvenís\b/g, 'vienes'],
    [/\bRendís\b/g, 'Rindes'], [/\brendís\b/g, 'rindes'],
    [/\bDominás\b/g, 'Dominas'], [/\bdominás\b/g, 'dominas'],
    [/\bSufrís\b/g, 'Sufres'], [/\bsufrís\b/g, 'sufres'],
    [/\bCerrás\b/g, 'Cierras'], [/\bcerrás\b/g, 'cierras'],
    [/\bDejá\b/g, 'Deja'], [/\bdejá\b/g, 'deja'],
    [/\bDejás\b/g, 'Dejas'], [/\bdejás\b/g, 'dejas'],
    [/\bPegá\b/g, 'Pega'], [/\bpegá\b/g, 'pega'],
    [/\bIngresá\b/g, 'Introduce'], [/\bingresá\b/g, 'introduce'],
    [/\bActivá\b/g, 'Activa'], [/\bactivá\b/g, 'activa'],
    [/\bDesbloqueá\b/g, 'Desbloquea'], [/\bdesbloqueá\b/g, 'desbloquea'],
    [/\bEntrená\b/g, 'Entrena'], [/\bentrená\b/g, 'entrena'],
    [/\bAnalizá\b/g, 'Analiza'], [/\banalizá\b/g, 'analiza'],
    [/\bFijá\b/g, 'Fija'], [/\bfijá\b/g, 'fija'],
    [/\bLlevá\b/g, 'Lleva'], [/\bllevá\b/g, 'lleva'],
    [/\bEvitá\b/g, 'Evita'], [/\bevitá\b/g, 'evita'],
    [/\bEvitala\b/g, 'Evítala'], [/\bevitala\b/g, 'evítala'],
    [/\bPriorizá\b/g, 'Prioriza'], [/\bpriorizá\b/g, 'prioriza'],
    [/\bPriorizala\b/g, 'Priorízala'], [/\bpriorizala\b/g, 'priorízala'],
    [/\bExplorá\b/g, 'Explora'], [/\bexplorá\b/g, 'explora'],
    [/\bMantené\b/g, 'Mantén'], [/\bmantené\b/g, 'mantén'],
    [/\bAjustá\b/g, 'Ajusta'], [/\bajustá\b/g, 'ajusta'],
    [/\bAsegurá\b/g, 'Asegura'], [/\basegurá\b/g, 'asegura'],
    [/\bPulí\b/g, 'Pule'], [/\bpulí\b/g, 'pule'],
    [/\bPrepará\b/g, 'Prepara'], [/\bprepará\b/g, 'prepara'],
    [/\bPresioná\b/g, 'Presiona'], [/\bpresioná\b/g, 'presiona'],
    [/\bReforzá\b/g, 'Refuerza'], [/\breforzá\b/g, 'refuerza'],
    [/\bSumá\b/g, 'Suma'], [/\bsumá\b/g, 'suma'],
    [/\bGuarecé\b/g, 'Guarece'], [/\bguarecé\b/g, 'guarece'],
    [/\bUsá\b/g, 'Usa'], [/\busá\b/g, 'usa'],
    [/\bMedí\b/g, 'Mide'], [/\bmedí\b/g, 'mide'],
    [/\bSeguí\b/g, 'Sigue'], [/\bseguí\b/g, 'sigue'],
    [/\bSeguís\b/g, 'Sigues'], [/\bseguís\b/g, 'sigues'],
    [/\bVolvé\b/g, 'Vuelve'], [/\bvolvé\b/g, 'vuelve'],
    [/\bSubí\b/g, 'Sube'], [/\bsubí\b/g, 'sube'],
    [/\bDefendé\b/g, 'Defiende'], [/\bdefendé\b/g, 'defiende'],
    [/\bVigilá\b/g, 'Vigila'], [/\bvigilá\b/g, 'vigila'],
    [/\bConocé\b/g, 'Conoce'], [/\bconocé\b/g, 'conoce'],
    [/\bIniciá\b/g, 'Inicia'], [/\biniciá\b/g, 'inicia'],
    [/\bCompletá\b/g, 'Completa'], [/\bcompletá\b/g, 'completa'],
    [/\bDisfrutá\b/g, 'Disfruta'], [/\bdisfrutá\b/g, 'disfruta'],
    [/\bContanos\b/g, 'Cuéntanos'], [/\bcontanos\b/g, 'cuéntanos'],
    [/\bGuardá\b/g, 'Guarda'], [/\bguardá\b/g, 'guarda'],
    [/\bAcá\b/g, 'Aquí'], [/\bacá\b/g, 'aquí'],
    [/\bJinetes\b/g, 'Caballeros'], [/\bJinete\b/g, 'Caballero'],
  ];

  function applyEsEs(str) {
    let out = String(str || '');
    for (let i = 0; i < ES_ES_RULES.length; i += 1) {
      out = out.replace(ES_ES_RULES[i][0], ES_ES_RULES[i][1]);
    }
    return out;
  }

  /**
   * Build parameterized dynamic rules using caller-provided `locEnt(name, locale)`
   * and `translateText(str, locale)` helpers so both Node and Renderer share ONE table.
   */
  function createDynamicRules({ locEnt, translateText }) {
    const tr = (s, l) => (translateText ? translateText(s, l) : s);
    const ent = (s, l) => (locEnt ? locEnt(s, l) : s);
    return [
      // Central map/civ breakdown phase labels & age clocks
      [/^Feudal \/ Temprano \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `封建 / 前期（${m[1]}）` : `Feudal / Early (${m[1]})`)],
      [/^Edad Feudal \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `封建时代（${m[1]}）` : `Feudal Age (${m[1]})`)],
      [/^Edad de los Castillos \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `城堡时代（${m[1]}）` : `Castle Age (${m[1]})`)],
      [/^Edad Imperial \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `帝王时代（${m[1]}）` : `Imperial Age (${m[1]})`)],
      [/^Post-Imperial \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `后帝王时代（${m[1]}）` : `Post-Imperial (${m[1]})`)],
      [/^Agregar a Mi Plan:\s*(.+)$/, (m, l) => (l === 'zh-CN' ? `添加到我的计划：${tr(m[1], l)}` : `Add to My Plan: ${tr(m[1], l)}`)],
      [/^Castillos (\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `城堡 ${m[1]}` : `Castle ${m[1]}`)],
      [/^Feudal ~(\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `封建 ~${m[1]}` : `Feudal ~${m[1]}`)],
      [/^Feudal (\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `封建 ${m[1]}` : `Feudal ${m[1]}`)],
      [/^Imperial (\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `帝王 ${m[1]}` : `Imperial ${m[1]}`)],
      [/^Alta Edad Media$/, (_, l) => (l === 'zh-CN' ? '黑暗时代' : 'Dark Age')],
      [/^Edad Feudal$/, (_, l) => (l === 'zh-CN' ? '封建时代' : 'Feudal Age')],
      [/^Edad de los Castillos$/, (_, l) => (l === 'zh-CN' ? '城堡时代' : 'Castle Age')],
      [/^Edad Castillos$/, (_, l) => (l === 'zh-CN' ? '城堡时代' : 'Castle Age')],
      [/^Edad Imperial$/, (_, l) => (l === 'zh-CN' ? '帝王时代' : 'Imperial Age')],
      [/^Castillos$/, (_, l) => (l === 'zh-CN' ? '城堡时代' : 'Castle Age')],
      [/^Castillo$/, (_, l) => (l === 'zh-CN' ? '城堡' : 'Castle')],

      // Postmatch KPI sublabels & counts
      [/^([\d.,]+)\s+TC\s*·\s*([\d.,]+)\s+granjas?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 城镇中心 · ${m[2]} 农田` : `${m[1]} TC · ${m[2]} farms`)],
      [/^([\d.,]+)\s+edificios?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 座建筑` : `${m[1]} buildings`)],
      [/^([\d.,]+)\s+mejoras? eco$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 项经济科技` : `${m[1]} eco upgrades`)],
      [/^([\d.,]+)\s+casas?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 座房屋` : `${m[1]} houses`)],
      [/^([\d.,]+)\s+aldeanos? fantasma$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 名幽灵村民` : `${m[1]} ghost villagers`)],
      [/^~([\d.,]+)\s+recursos estimados sin recolectar antes de Castillos \(≈ (\d+) Jinetes\)\.$/, (m, l) => (l === 'zh-CN' ? `城堡时代前约漏采 ${m[1]} 资源（≈ ${m[2]} 名骑士）。` : `~${m[1]} estimated uncollected resources before Castle Age (≈ ${m[2]} Knights).`)],
      [/^([\d.,]+)\s+aldeanos? encargados?$/, (m, l) => (l === 'zh-CN' ? `已训练 ${m[1]} 名村民` : `${m[1]} villagers queued`)],
      [/^([\d.,]+)\s+comparables?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 场可比对局` : `${m[1]} comparable`)],
      [/^Pedidos registrados hasta (\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `截至 ${m[1]} 的生产指令` : `Orders recorded up to ${m[1]}`)],
      [/^Historial consultado en este mapa · ([\d.,]+) V · ([\d.,]+) D · mismo modo( · parcial)?$/, (m, l) => (l === 'zh-CN' ? `该地图战绩 · ${m[1]} 胜 · ${m[2]} 负 · 同模式${m[3] ? ' · 部分' : ''}` : `Map history · ${m[1]} W · ${m[2]} L · same mode${m[3] ? ' · partial' : ''}`)],

      // Pro Matchups dynamic verdicts & cards
      [/^Sin partidas registradas en el Top 1400 para este cruce en (.+)$/, (m, l) => (l === 'zh-CN' ? `Top 1400 暂无此对局在${tr(m[1], l)}的记录` : `No Top 1400 matches recorded for this matchup on ${tr(m[1], l)}`)],
      [/^Élite Top Pro · (\d+) partidas reales(?: · (\d+) replays? profundos?)?$/, (m, l) => (l === 'zh-CN' ? `顶级职业组 · ${m[1]} 场真实对局${m[2] ? ` · ${m[2]} 场深度录像` : ''}` : `Top Pro Elite · ${m[1]} real matches${m[2] ? ` · ${m[2]} deep replays` : ''}`)],
      [/^Ladder Alto \(\+1900 ELO\) · (\d+) partidas reales(?: · (\d+) replays? profundos?)?$/, (m, l) => (l === 'zh-CN' ? `高分段天梯（+1900 ELO）· ${m[1]} 场真实对局${m[2] ? ` · ${m[2]} 场深度录像` : ''}` : `High Ladder (+1900 ELO) · ${m[1]} real matches${m[2] ? ` · ${m[2]} deep replays` : ''}`)],
      [/^Muestra baja · solo (\d+) partidas? reales? halladas?(?: · (\d+) replays? profundos?)?$/, (m, l) => (l === 'zh-CN' ? `小样本 · 仅检索到 ${m[1]} 场真实对局${m[2] ? ` · ${m[2]} 场深度录像` : ''}` : `Small sample · only ${m[1]} real match(es) found${m[2] ? ` · ${m[2]} deep replays` : ''}`)],
      [/^Sin partidas en (.+) dentro de la muestra Pro\/\+1900$/, (m, l) => (l === 'zh-CN' ? `职业/+1900 样本中暂无${tr(m[1], l)}对局` : `No matches on ${tr(m[1], l)} in the Pro/+1900 sample`)],
      [/^Este cruce tiene (\d+) partidas reales en (Mapas Abiertos|Mapas Cerrados)\.(.*)$/, (m, l) => (l === 'zh-CN' ? `此对局在${m[2] === 'Mapas Abiertos' ? '开放地图' : '封闭地图'}有 ${m[1]} 场真实对局，请切换地图类型查看。` : `This matchup has ${m[1]} real matches on ${m[2] === 'Mapas Abiertos' ? 'Open Maps' : 'Closed Maps'}. Switch map type to view.`)],
      [/^Mejor tramo: ([^(]+) \((\d+%)\)$/, (m, l) => (l === 'zh-CN' ? `最佳时段：${tr(m[1].trim(), l)}（${m[2]}）` : `Best window: ${tr(m[1].trim(), l)} (${m[2]})`)],
      [/^Mejor resistencia: ([^(]+) \((\d+%)\)$/, (m, l) => (l === 'zh-CN' ? `最佳抗压时段：${tr(m[1].trim(), l)}（${m[2]}）` : `Best survival window: ${tr(m[1].trim(), l)} (${m[2]})`)],
      [/^Más parejo: ([^(]+) \((\d+%)\)$/, (m, l) => (l === 'zh-CN' ? `最胶着时段：${tr(m[1].trim(), l)}（${m[2]}）` : `Closest window: ${tr(m[1].trim(), l)} (${m[2]})`)],
      [/^Ventaja para (.+) \((\d+%) en (\d+) pj\)$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}占优（${m[3]} 场胜率 ${m[2]}）` : `Edge for ${ent(m[1], l)} (${m[2]} across ${m[3]} games)`)],
      [/^Registro competitivo favorable \((\d+)V–(\d+)D\) con mejor pico en (.+)\.$/, (m, l) => (l === 'zh-CN' ? `实战战绩占优（${m[1]}胜–${m[2]}负），发力峰值在${tr(m[3], l)}。` : `Favorable competitive record (${m[1]}W–${m[2]}L), peaking in ${tr(m[3], l)}.`)],
      [/^(.+) lidera el global \((\d+)V–(\d+)D\)\. Tu mejor tramo para igualar es (.+)\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}整体领先（${m[2]}胜–${m[3]}负），你的最佳追平时段在${tr(m[4], l)}。` : `${ent(m[1], l)} leads overall (${m[2]}W–${m[3]}L). Your best window to equalize is ${tr(m[4], l)}.`)],
      [/^Paridad medida \((\d+)V–(\d+)D\): define el pase y la transición a Castillos\.$/, (m, l) => (l === 'zh-CN' ? `势均力敌（${m[1]}胜–${m[2]}负）：胜负取决于升级节奏与城堡时代转兵。` : `Evenly matched (${m[1]}W–${m[2]}L): decided by uptime and Castle Age transition.`)],
      [/^Rendís mejor temprano, pero en \+38 min (.+) escala fuerte \((\d+%) en (\d+) pj\)\.$/, (m, l) => (l === 'zh-CN' ? `你前期更强，但 38 分钟后${ent(m[1], l)}后期发力迅猛（${m[3]} 场 ${m[2]}）。` : `You perform better early, but past 38m ${ent(m[1], l)} scales hard (${m[2]} in ${m[3]} games).`)],
      [/^(.+) domina el juego largo \((\d+%) en \+38 min\)\. Defendé limpio y buscá 3 TC\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}统治后期（38 分钟后 ${m[2]}），稳健防守并运营 3 城镇中心。` : `${ent(m[1], l)} dominates late game (${m[2]} past 38m). Defend cleanly and scale to 3 TCs.`)],
      [/^Evitá (.+)$/, (m, l) => (l === 'zh-CN' ? `避免${tr(m[1], l)}` : `Avoid ${tr(m[1], l)}`)],
      [/^Cayó en (\d+) de (\d+) partidas \((\d+%) WR\)\.$/, (m, l) => (l === 'zh-CN' ? `${m[2]} 场输了 ${m[1]} 场（胜率 ${m[3]}）。` : `Lost ${m[1]} of ${m[2]} matches (${m[3]} WR).`)],
      [/^(.+) perdió el (\d+%) \((\d+)V–(\d+)D\) forzándolo\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}强打此路线输率达 ${m[2]}（${m[3]}胜–${m[4]}负）。` : `${ent(m[1], l)} lost ${m[2]} (${m[3]}W–${m[4]}L) forcing this line.`)],
      [/^Patrón Pro ([^(\n]+)(?: \((\d+) replays?\)| \((\d+)V–(\d+)D\))?$/, (m, l) => {
        const civ = ent(m[1].trim(), l);
        if (m[2]) return l === 'zh-CN' ? `${civ}职业套路（${m[2]} 场录像）` : `${civ} Pro pattern (${m[2]} replays)`;
        if (m[3]) return l === 'zh-CN' ? `${civ}职业套路（${m[3]}胜–${m[4]}负）` : `${civ} Pro pattern (${m[3]}W–${m[4]}L)`;
        return l === 'zh-CN' ? `${civ}职业套路` : `${civ} Pro pattern`;
      }],
      [/^Mejor respuesta de (.+) en el cruce: ([^(]+) \((\d+)V–(\d+)D, (\d+%)\)\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}在此对局的最佳应对：${tr(m[2].trim(), l)}（${m[3]}胜–${m[4]}负，${m[5]}）。` : `Best response for ${ent(m[1], l)} here: ${tr(m[2].trim(), l)} (${m[3]}W–${m[4]}L, ${m[5]}).`)],
      [/^Núcleo principal en este cruce: ([^(]+) \((\d+)V–(\d+)D\)\.$/, (m, l) => (l === 'zh-CN' ? `本对局核心兵种：${tr(m[1].trim(), l)}（${m[2]}胜–${m[3]}负）。` : `Primary core in this matchup: ${tr(m[1].trim(), l)} (${m[2]}W–${m[3]}L).`)],
      [/^Transición Pro sólida de (.+): ([^(]+) \((\d+)V–(\d+)D\)\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}稳健职业转兵：${tr(m[2].trim(), l)}（${m[3]}胜–${m[4]}负）。` : `Solid Pro transition for ${ent(m[1], l)}: ${tr(m[2].trim(), l)} (${m[3]}W–${m[4]}L).`)],
      [/^Vigilá el giro de (.+) hacia (.+)\.$/, (m, l) => (l === 'zh-CN' ? `提防${ent(m[1], l)}转为${tr(m[2], l)}。` : `Watch out for ${ent(m[1], l)} switching into ${tr(m[2], l)}.`)],
      [/^Transición típica de (.+): (.+)\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}常见转兵：${tr(m[2], l)}。` : `Typical ${ent(m[1], l)} transition: ${tr(m[2], l)}.`)],
      [/^Estándar Pro de (.+): (.+)\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}职业标准开局：${tr(m[2], l)}。` : `${ent(m[1], l)} Pro standard: ${tr(m[2], l)}.`)],
      [/^Ejecución Pro verificada \((.+)\)$/, (m, l) => (l === 'zh-CN' ? `职业选手实测打法（${tr(m[1], l)}）` : `Verified Pro execution (${tr(m[1], l)})`)],
      [/^CURVA REAL DE RELOJ · QUIÉN TIENE EL TEMPO \((.+)\)$/, (m, l) => (l === 'zh-CN' ? `真实时长曲线 · 节奏主导权（${tr(m[1], l)}）` : `REAL CLOCK CURVE · WHO HOLDS TEMPO (${tr(m[1], l)})`)],

      // Training Progress, Weekly, Plan Verifier, Build Orders & Arena dynamic templates
      [/^([+\-−]?[\d,.]+\s*(?:s|min|eAPM)?)\s+vs tu promedio$/, (m, l) => (l === 'zh-CN' ? `较个人均值 ${m[1]}` : `${m[1]} vs your average`)],
      [/^CUELLO DE BOTELLA #1 · (IMPACTO EN ECONOMÍA|ALTA EDAD MEDIA) \((\d+) PARTIDAS?\)$/, (m, l) => {
        const part = m[1] === 'ALTA EDAD MEDIA' ? (l === 'zh-CN' ? '黑暗时代' : 'DARK AGE') : (l === 'zh-CN' ? '经济影响' : 'ECONOMY IMPACT');
        return l === 'zh-CN' ? `首要瓶颈 #1 · ${part}（${m[2]} 场）` : `BOTTLENECK #1 · ${part} (${m[2]} MATCHES)`;
      }],
      [/^Perdiste (.+) aldeanos? por Centro Urbano en Edad Feudal$/, (m, l) => (l === 'zh-CN' ? `封建时代城镇中心空闲损失 ${m[1]} 名村民` : `Lost ${m[1]} Villager(s) to Feudal Town Center idle`)],
      [/^Regalaste (.+) aldeanos? antes de llegar a Edad Feudal$/, (m, l) => (l === 'zh-CN' ? `升封建前城镇中心空闲白送 ${m[1]} 名村民` : `Gave away ${m[1]} Villager(s) before reaching Feudal Age`)],
      [/^Pausa medida: ([^(]+) \(promedio ([^·]+) · récord ([^)]+)\)\.$/, (m, l) => (l === 'zh-CN' ? `实测空闲：${m[1]}（均值 ${m[2].trim()} · 纪录 ${m[3]}）。` : `Measured idle: ${m[1]} (avg ${m[2].trim()} · best ${m[3]}).`)],
      [/^Inactividad en Alta Edad Media: ([^(]+) \(promedio ([^·]+) · récord ([^)]+)\)\.$/, (m, l) => (l === 'zh-CN' ? `黑暗时代空闲：${m[1]}（均值 ${m[2].trim()} · 纪录 ${m[3]}）。` : `Dark Age idle: ${m[1]} (avg ${m[2].trim()} · best ${m[3]}).`)],
      [/^Demora medida: ([^(]+) \(promedio ([^·]+) · récord ([^)]+)\)\.$/, (m, l) => (l === 'zh-CN' ? `实测延迟：${m[1]}（均值 ${m[2].trim()} · 纪录 ${m[3]}）。` : `Measured delay: ${m[1]} (avg ${m[2].trim()} · best ${m[3]}).`)],
      [/^Objetivo (.+)$/, (m, l) => (l === 'zh-CN' ? `目标 ${m[1]}` : `Target ${m[1]}`)],
      [/^Superar tu récord \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `打破个人纪录（${m[1]}）` : `Beat your record (${m[1]})`)],
      [/^Acercarte a tu récord \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `逼近个人纪录（${m[1]}）` : `Close in on your record (${m[1]})`)],
      [/^Próximo desafío: batir tu récord \(([^)]+)\)$/, (m, l) => (l === 'zh-CN' ? `下一挑战：打破个人纪录（${m[1]}）` : `Next challenge: beat your record (${m[1]})`)],
      [/^Hacha de doble filo llegó (\d+) s tarde tras pisar Feudal$/, (m, l) => (l === 'zh-CN' ? `升封建后双刃斧晚点了 ${m[1]} 秒` : `Double-Bit Axe was ${m[1]}s late after hitting Feudal`)],
      [/^Ganar una partida real contra (.+)$/, (m, l) => (l === 'zh-CN' ? `在实战中击败${ent(m[1], l)}` : `Win a live match against ${ent(m[1], l)}`)],
      [/^Ganar una partida real en (.+)$/, (m, l) => (l === 'zh-CN' ? `在${ent(m[1], l)}赢下一场实战` : `Win a live match on ${ent(m[1], l)}`)],
      [/^Pausa de CU en Alta Edad ≤ (\d+) s$/, (m, l) => (l === 'zh-CN' ? `黑暗时代城镇中心空闲 ≤ ${m[1]} 秒` : `Dark Age TC idle ≤ ${m[1]}s`)],
      [/^Pausa de CU en Feudal ≤ (\d+) s$/, (m, l) => (l === 'zh-CN' ? `封建时代城镇中心空闲 ≤ ${m[1]} 秒` : `Feudal Age TC idle ≤ ${m[1]}s`)],
      [/^Hacha de doble filo en ≤ (\d+) s tras Feudal$/, (m, l) => (l === 'zh-CN' ? `升封建后 ≤ ${m[1]} 秒内研究双刃斧` : `Double-Bit Axe within ≤ ${m[1]}s of Feudal`)],
      [/^Llegar a Edad Feudal en ≤ (\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `≤ ${m[1]} 到达封建时代` : `Reach Feudal Age by ≤ ${m[1]}`)],
      [/^Llegar a Castillos en ≤ (\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `≤ ${m[1]} 到达城堡时代` : `Reach Castle Age by ≤ ${m[1]}`)],
      [/^(\d+) partidas? esta semana vs (\d+) previas$/, (m, l) => (l === 'zh-CN' ? `本周 ${m[1]} 场对比此前 ${m[2]} 场` : `${m[1]} match(es) this week vs ${m[2]} prior`)],
      [/^Últimas (\d+) vs primeras (\d+) partidas de esta semana \(sin historial previo\)$/, (m, l) => (l === 'zh-CN' ? `本周后 ${m[1]} 场对比前 ${m[2]} 场（无历史基线）` : `Last ${m[1]} vs first ${m[2]} matches this week (no prior history)`)],
      [/^Evaluado en (\d+) partidas?(?: · (.+))?$/, (m, l) => (l === 'zh-CN' ? `已追踪 ${m[1]} 场${m[2] ? ` · ${tr(m[2], l)}` : ''}` : `Checked across ${m[1]} match(es)${m[2] ? ` · ${tr(m[2], l)}` : ''}`)],
      [/^(\d+) órd\.$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 次指令` : `${m[1]} orders`)],
      [/^Prestigio (\d+) · Gran Maestro$/, (m, l) => (l === 'zh-CN' ? `声望 ${m[1]} · 宗师` : `Prestige ${m[1]} · Grandmaster`)],
      [/^Próximo desbloqueo: (.+)$/, (m, l) => (l === 'zh-CN' ? `下个解锁：${tr(m[1], l)}` : `Next unlock: ${tr(m[1], l)}`)],
      [/^Nivel (\d+)$/, (m, l) => (l === 'zh-CN' ? `第 ${m[1]} 级` : `Level ${m[1]}`)],
      [/^Pregunta (\d+) de (\d+)$/, (m, l) => (l === 'zh-CN' ? `第 ${m[1]} / ${m[2]} 题` : `Question ${m[1]} of ${m[2]}`)],
      [/^(\d+) de (\d+) preguntas?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} / ${m[2]} 题` : `${m[1]} of ${m[2]} questions`)],
      [/^(\d+) pasos?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 步` : `${m[1]} steps`)],
      [/^(\d+) alds?\.?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 农` : `${m[1]} vils`)],
      [/^(\d+) pop$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 人口` : `${m[1]} pop`)],

      // Postmatch v6 & Welcome Home dynamic templates
      [/^¡(\d+) victorias seguidas!$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 连胜！` : `${m[1]} wins in a row!`)],
      [/^Cortaste una racha de (\d+) derrotas$/, (m, l) => (l === 'zh-CN' ? `终结 ${m[1]} 连败` : `Snapped a ${m[1]}-loss streak`)],
      [/^Sumaste \+(\d+) ELO en tus últimas (\d+) partidas$/, (m, l) => (l === 'zh-CN' ? `近 ${m[2]} 场净赚 +${m[1]} ELO` : `Gained +${m[1]} ELO over your last ${m[2]} matches`)],
      [/^Nuevo máximo reciente: ([\d.,]+) ELO$/, (m, l) => (l === 'zh-CN' ? `近期新高：${m[1]} ELO` : `New recent peak: ${m[1]} ELO`)],
      [/^Dueño de (.+)$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}霸主` : `Master of ${ent(m[1], l)}`)],
      [/^Cerraste la partida en (\d+:\d+)$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 终结对局` : `Closed the match in ${m[1]}`)],
      [/^Ganaste una maratón de (\d+) minutos$/, (m, l) => (l === 'zh-CN' ? `赢下 ${m[1]} 分钟拉锯战` : `Won a ${m[1]}-minute marathon`)],
      [/^Peleaste (\d+) minutos sin bajar el ritmo$/, (m, l) => (l === 'zh-CN' ? `激战 ${m[1]} 分钟节奏不减` : `Fought ${m[1]} minutes without dropping pace`)],
      [/^Récord de ritmo mecánico \(([\d.,]+) eAPM\)$/, (m, l) => (l === 'zh-CN' ? `操作速度纪录（${m[1]} eAPM）` : `Mechanical pace record (${m[1]} eAPM)`)],
      [/^Esta semana · (\d+) partidas?$/, (m, l) => (l === 'zh-CN' ? `本周 · ${m[1]} 场对局` : `This week · ${m[1]} match(es)`)],
      [/^Últimas (\d+) partidas$/, (m, l) => (l === 'zh-CN' ? `最近 ${m[1]} 场对局` : `Last ${m[1]} matches`)],
      [/^LA MÁS JUGADA ESTA SEMANA · (1V1|TEAM)$/, (m, l) => (l === 'zh-CN' ? `本周最热门文明 · ${m[1]}` : `MOST PLAYED THIS WEEK · ${m[1]}`)],
      [/^([\d.,]+)% de las partidas · ([\d.,]+)% WR$/, (m, l) => (l === 'zh-CN' ? `登场率 ${m[1]}% · 胜率 ${m[2]}%` : `${m[1]}% pick rate · ${m[2]}% WR`)],
      [/^([+-]?\d+) racha$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 连胜` : `${m[1]} streak`)],
      [/^(\d+) partidas?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 场` : `${m[1]} games`)],
      [/^(\d+) replays?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 场录像` : `${m[1]} replays`)],
      [/^(\d+) min$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 分钟` : `${m[1]} min`)],
      [/^(\d+) s$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 秒` : `${m[1]}s`)],
      [/^Mapas Abiertos$/, (_, l) => (l === 'zh-CN' ? '开放地图' : 'Open Maps')],
      [/^Mapas Cerrados$/, (_, l) => (l === 'zh-CN' ? '封闭地图' : 'Closed Maps')],
      [/^Abiertos$/, (_, l) => (l === 'zh-CN' ? '开放图' : 'Open')],
      [/^Cerrados$/, (_, l) => (l === 'zh-CN' ? '封闭图' : 'Closed')],
      [/^(\d+)V–(\d+)D$/, (m, l) => (l === 'zh-CN' ? `${m[1]}胜–${m[2]}负` : `${m[1]}W–${m[2]}L`)],
      [/^(\d+)V\s*-\s*(\d+)D$/, (m, l) => (l === 'zh-CN' ? `${m[1]}胜 - ${m[2]}负` : `${m[1]}W - ${m[2]}L`)],
      [/^(\d+) V · (\d+) D$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 胜 · ${m[2]} 负` : `${m[1]} W · ${m[2]} L`)],
      [/^(\d+) pj$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 场` : `${m[1]} g`)],
      [/^Hace (\d+) min$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 分钟前` : `${m[1]}m ago`)],
      [/^Hace (\d+) h$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 小时前` : `${m[1]}h ago`)],
      [/^Hace (\d+) d(?:ías?)?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 天前` : `${m[1]}d ago`)],
      [/^hace (\d+) min$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 分钟前` : `${m[1]}m ago`)],
      [/^hace (\d+) h$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 小时前` : `${m[1]}h ago`)],
      [/^hace (\d+) d(?:ías?)?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 天前` : `${m[1]}d ago`)],

      // Welcome Home greetings, dates & codex dynamic facts
      [/^Buenos días,\s*(.+)$/, (m, l) => (l === 'zh-CN' ? `早上好，${m[1]}` : `Good morning, ${m[1]}`)],
      [/^Buenas tardes,\s*(.+)$/, (m, l) => (l === 'zh-CN' ? `下午好，${m[1]}` : `Good afternoon, ${m[1]}`)],
      [/^Buenas noches,\s*(.+)$/, (m, l) => (l === 'zh-CN' ? `晚上好，${m[1]}` : `Good evening, ${m[1]}`)],
      [/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)\s+(\d+)\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i, (m, l) => {
        const daysEn = { lunes: 'Mon', martes: 'Tue', 'miércoles': 'Wed', jueves: 'Thu', viernes: 'Fri', 'sábado': 'Sat', domingo: 'Sun' };
        const daysZh = { lunes: '周一', martes: '周二', 'miércoles': '周三', jueves: '周四', viernes: '周五', 'sábado': '周六', domingo: '周日' };
        const monsEn = { ene: 'Jan', feb: 'Feb', mar: 'Mar', abr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dic: 'Dec' };
        const monsZh = { ene: '1月', feb: '2月', mar: '3月', abr: '4月', may: '5月', jun: '6月', jul: '7月', ago: '8月', sep: '9月', oct: '10月', nov: '11月', dic: '12月' };
        const dk = m[1].toLowerCase();
        const mk = m[3].toLowerCase();
        return l === 'zh-CN'
          ? `${monsZh[mk] || mk}${m[2]}日 ${daysZh[dk] || dk}`
          : `${daysEn[dk] || m[1]} ${monsEn[mk] || m[3]} ${m[2]}`;
      }],
      [/^En los últimos 7 días,\s*(.+?) concentró el ([\d.,]+)\s*% de las partidas 1v1, mientras que (.+?) lideró Team Games con ([\d.,]+)\s*%\.$/, (m, l) => (l === 'zh-CN'
        ? `过去 7 天，${ent(m[1], l)}占 1v1 对局的 ${m[2]}%，而${ent(m[3], l)}以 ${m[4]}% 领跑组队赛。`
        : `Over the last 7 days, ${ent(m[1], l)} accounted for ${m[2]}% of 1v1 matches, while ${ent(m[3], l)} led Team Games at ${m[4]}%.`)],

      // Training UI dynamic strings
      [/^Paso (\d+)$/, (m, l) => (l === 'zh-CN' ? `步骤 ${m[1]}` : `Step ${m[1]}`)],
      [/^Paso #(\d+):\s*(.+)$/, (m, l) => (l === 'zh-CN' ? `步骤 #${m[1]}：${tr(m[2], l)}` : `Step #${m[1]}: ${tr(m[2], l)}`)],
      [/^Ascendiste a Nivel (\d+)\/7\. Desafíos más exigentes te esperan\.$/, (m, l) => (l === 'zh-CN' ? `已晋升至第 ${m[1]}/7 级，更严峻的挑战正等着你。` : `Promoted to Level ${m[1]}/7. Tougher challenges await.`)],
      [/^Tu promedio:\s*(.+)$/, (m, l) => (l === 'zh-CN' ? `你的均值：${tr(m[1], l)}` : `Your average: ${tr(m[1], l)}`)],
      [/^Promedio diario:\s*(\d+)\/(\d+)\s+fundamentos mejorados$/, (m, l) => (l === 'zh-CN' ? `日均提升：${m[1]}/${m[2]} 项基本功` : `Daily average: ${m[1]}/${m[2]} fundamentals improved`)],

      // Tactical / Postmatch / Settings / Live HUD dynamic strings
      [/^Siguiente \(([^·]+)\s*·\s*Pob ([^)]+)\):$/, (m, l) => (l === 'zh-CN' ? `下一步（${tr(m[1].trim(), l)} · 人口 ${m[2]}）：` : `Next (${tr(m[1].trim(), l)} · Pop ${m[2]}):`)],
      [/^(\d+)\/(\d+)\s+replays?$/, (m, l) => (l === 'zh-CN' ? `${m[1]}/${m[2]} 场录像` : `${m[1]}/${m[2]} replays`)],
      [/^Entre el min (\d+) y (\d+) sacaste \+(\d+) aldeanos de ventaja\.$/, (m, l) => (l === 'zh-CN' ? `在 ${m[1]}–${m[2]} 分钟期间，你建立了 +${m[3]} 名村民优势。` : `Between min ${m[1]} and ${m[2]} you built a +${m[3]} villager lead.`)],
      [/^Entre el min (\d+) y (\d+) el rival te sacó (\d+) aldeanos extra\.$/, (m, l) => (l === 'zh-CN' ? `在 ${m[1]}–${m[2]} 分钟期间，对手多领先你 ${m[3]} 名村民。` : `Between min ${m[1]} and ${m[2]} your opponent pulled ${m[3]} villagers ahead.`)],
      [/^Impuesto de Mercado \(~([\d.,]+) res\)$/, (m, l) => (l === 'zh-CN' ? `市场交易损耗（约 ${m[1]} 资源）` : `Market tax (~${m[1]} res)`)],
      [/^(.+?) llegó a (\d+) en cola; sumar otro edificio convierte esos recursos en ejército\.$/, (m, l) => (l === 'zh-CN' ? `${ent(m[1], l)}队列高达 ${m[2]}；多建一座军事建筑能更快把资源转化为兵力。` : `${ent(m[1], l)} queued up to ${m[2]}; adding another building turns those resources into army.`)],
      [/^([\d.,]+)\s+TC\s*·\s*([\d.,]+)\s+edificios militares$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 城镇中心 · ${m[2]} 座军事建筑` : `${m[1]} TC · ${m[2]} military buildings`)],
      [/^([\d.,]+)\s+eAPM\s*·\s*([\d.,]+)\s+edificios militares$/, (m, l) => (l === 'zh-CN' ? `${m[1]} eAPM · ${m[2]} 座军事建筑` : `${m[1]} eAPM · ${m[2]} military buildings`)],
      [/^(\d+) Eco · (\d+) Herrería(?: · (\d+) Combate)?$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 经济 · ${m[2]} 铁匠铺${m[3] ? ` · ${m[3]} 战斗` : ''}` : `${m[1]} Eco · ${m[2]} Blacksmith${m[3] ? ` · ${m[3]} Combat` : ''}`)],
      [/^(\d+) mejoras? · (\d+) edif\.$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 项科技 · ${m[2]} 座建筑` : `${m[1]} techs · ${m[2]} bldgs`)],
      [/^Tu referencia · (\d+) partidas?$/, (m, l) => (l === 'zh-CN' ? `个人基线 · ${m[1]} 场` : `Your baseline · ${m[1]} games`)],
      [/^([\d.,]+) ELO · (.+)\. Flechas para recorrer partidas\.$/, (m, l) => (l === 'zh-CN' ? `${m[1]} ELO · ${tr(m[2], l)}。使用方向键浏览对局。` : `${m[1]} ELO · ${tr(m[2], l)}. Use arrow keys to browse matches.`)],
      [/^Ayuda de civ: se oculta a los (.+)$/, (m, l) => (l === 'zh-CN' ? `文明提示：将于 ${m[1]} 自动隐藏` : `Civ helper: auto-hides at ${m[1]}`)],
      [/^(\d+) partidas? compartidas sin equipos confirmados\.$/, (m, l) => (l === 'zh-CN' ? `${m[1]} 场共同对局（分队信息未确认）。` : `${m[1]} shared matches without confirmed teams.`)],
      [/^Analizando replays del rival(?: en (.+?))?…$/, (m, l) => (l === 'zh-CN' ? `正在分析对手${m[1] ? `在${ent(m[1], l)}的` : ''}录像…` : `Analyzing opponent replays${m[1] ? ` on ${ent(m[1], l)}` : ''}…`)],
      [/^(\d+) replays? de (\d+)$/, (m, l) => (l === 'zh-CN' ? `${m[1]} / ${m[2]} 场录像` : `${m[1]} of ${m[2]} replays`)],
      [/^En replays:\s*(.+)$/, (m, l) => (l === 'zh-CN' ? `录像记录：${tr(m[1], l)}` : `In replays: ${tr(m[1], l)}`)],
      [/^(\d+) replays? acá$/, (m, l) => (l === 'zh-CN' ? `此图 ${m[1]} 场录像` : `${m[1]} replays here`)],
      [/^Hay (\d+) replays? del mapa, pero falta identificar su civ más usada\.$/, (m, l) => (l === 'zh-CN' ? `此图有 ${m[1]} 场录像，但尚未识别其最常用文明。` : `${m[1]} map replays found, but top civ is not identified yet.`)],
      [/^Considerá (.+)$/, (m, l) => (l === 'zh-CN' ? `建议考虑 ${tr(m[1], l)}` : `Consider ${tr(m[1], l)}`)],
      [/^(\d+) partidas? en el tramo observado$/, (m, l) => (l === 'zh-CN' ? `观测区间内共 ${m[1]} 场对局` : `${m[1]} matches in observed window`)],
      [/^(\d+) de (\d+) partidas revisadas\.$/, (m, l) => (l === 'zh-CN' ? `已分析 ${m[2]} 场中的 ${m[1]} 场。` : `${m[1]} of ${m[2]} reviewed matches.`)],
      [/^Civilización identificada en$/, (_, l) => (l === 'zh-CN' ? '文明已识别于' : 'Civilization identified in')],
      [/^\$([\d.,]+)\/año$/, (m, l) => (l === 'zh-CN' ? `$${m[1]}/年` : `$${m[1]}/yr`)],
      [/^\$([\d.,]+)\/mes$/, (m, l) => (l === 'zh-CN' ? `$${m[1]}/月` : `$${m[1]}/mo`)],
    ];
  }

  const api = { ES_ES_RULES, applyEsEs, createDynamicRules };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RelicContentRules = api;
})(typeof globalThis === 'object' ? globalThis : this);
