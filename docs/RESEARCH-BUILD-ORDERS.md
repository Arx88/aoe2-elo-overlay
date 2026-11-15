# Smart Build Order: referencia automática y visual

> Auditoría/propuesta de la revisión inicial. El resultado posterior, incluidas las correcciones y la presentación económica S–D, se documenta en [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md); este estudio no sustituye ese estado.
Revisión: 2026-11-14. Investigación y propuesta; no describe un seguimiento de pasos ya implementado. Alcance: Scout, M@A, Arqueros, Fast Castle (FC) y Fast Imperial (FI), sin entradas durante la partida.

## Recomendación de implementación

Un interruptor **Smart Build Order** activa una referencia que reconoce automáticamente la civ confirmada, el mapa y el modo. El encabezado debe decir **“Plan sugerido”** o **“Referencia”**. La aplicación no conoce el número actual de aldeanos, su reparto, los recursos, la cola del TC, la edad completada ni los edificios construidos. No debe mostrar “paso actual”, progreso completado, alertas de ejecución ni avanzar la receta según reloj de pared.

La apertura actual propia tampoco puede reconocerse con los metadatos integrados. La civ permite **sugerir**, no **detectar**, una apertura. Las aperturas de AoE2Insights pertenecen a partidas anteriores del perfil consultado. La apertura histórica del rival puede orientar la sugerencia; no demuestra qué build ejecuta el usuario. No confundir la ruta mejor puntuada en Castillos con una apertura de Feudal efectivamente elegida.

La opción práctica es mostrar una ruta sugerida con cuatro o cinco hitos siempre visibles, una condición para adaptar el plan y un rótulo breve: **“Guía de referencia · pasos actuales sin medir”**. La selección se actualiza si se confirma o corrige mapa/civ/modo, pero conviene evitar saltos entre planes por pequeñas variaciones del historial. No hace falta abrir Ajustes, elegir una estrategia ni pulsar “siguiente” durante la partida.

Si deben estar visibles los cinco planes, compartir un bloque inicial y presentar cinco ramas compactas con el plan sugerido resaltado. Un carrusel que oculta hitos automáticamente debe identificarse como presentación, no como progreso. Una colección completa de recetas puede estar en Ajustes para consultarla fuera de partida.

## Cinco rutas con hitos respaldados

Los números siguientes son **variantes clásicas de referencia** de sus autores, no el óptimo universal del parche actual. “21 pop” suele significar 20 aldeanos y la unidad exploradora inicial antes de producir otras unidades. No intercambiar población con número de aldeanos; milicias, scouts adicionales, pesqueros y cambios de unidad inicial alteran esa equivalencia.

| Plan | Hitos visuales recomendados | Cuándo limitarlo | Fuente de receta |
| --- | --- | --- | --- |
| **Scouts** | 6 aldeanos a ovejas; 3 a madera; atraer jabalíes y completar 4 en bayas; preparar segunda maderera; Telar y 500 comida para Feudal; cuartel durante subida; establo al llegar y comida/granjas para sostener aldeanos y scouts | Variante clásica de 20 aldeanos. Mapa abierto terrestre y civ con entrenamiento de scouts compatible. Cambiar ante lanzas/cierres; no recomendarlo como plan para atravesar murallas de Arena | [AoE Companion: Scout Rush](https://aoecompanion.com/build-guides/scout-rush); [Morley Games, receta propia](https://steamcommunity.com/sharedfiles/filedetails/?id=2360858027&l=english) |
| **M@A → Arqueros** | 6 a ovejas y 4 a madera; jabalíes/bayas; cuartel y 3 milicias antes de llegar a Feudal; 2 aldeanos a oro; mejora M@A al llegar; transición a madera/oro, galería y arqueros | Milicias consumen comida que también necesita la subida. No confundir el gasto de crear milicias con el de mejorarlas. La continuación puede requerir guerrilleros según lo observado por el jugador | [Jupe / AOEBuilds, guía original](https://www.aoebuilds.com/build-orders/main-build-orders/intermediate/download/men-at-arms-into-archers); [AoE Companion](https://aoecompanion.com/build-guides/men-at-arms-archers) |
| **Arqueros** | 6 a ovejas y 4 a madera; jabalíes y 4 en bayas; segunda maderera; mover aldeanos a oro durante subida; cuartel; galerías al llegar; herrería y Emplumado antes de atacar; granjas al agotarse la comida inicial | Variante clásica de 21 aldeanos. Una y dos galerías requieren distribuciones distintas; no prometer producción continua sin verificar presupuesto. Revisar la continuidad a ballesteros del árbol propio | [AoE Companion: Archer Rush](https://aoecompanion.com/build-guides/archer-rush) |
| **FC** | Priorizar comida inicial; madera para economía y edificios; reunir oro antes de Feudal; mercado + herrería en Feudal como pareja típica; reunir 800 comida / 200 oro; en Castillos ejecutar un objetivo definido | Separar **FC → economía**, **FC → caballeros** y **FC → unidad única**. La última necesita piedra/castillo; la segunda necesita caballeros disponibles. Menor seguridad en mapas abiertos bajo presión | [AoE Companion: FC → Boom](https://aoecompanion.com/build-guides/fast-castle-boom); [Morley Games, tutorial propio](https://www.youtube.com/watch?v=Ae2k3ah1mRA) |
| **FI** | Mantener comida/granjas y reforzar oro; pasar por Feudal y Castillos; preparar dos edificios habilitantes de Castillos o un castillo; reunir 1000 comida / 800 oro; preparar producción para el objetivo militar de Imperial | Mostrar como ruta especializada, no recomendación por defecto de toda civ en cualquier mapa cerrado. Ejemplo documentado: turcos en Arena, con objetivo pólvora. Hideout no brinda la misma protección; una agresión/castillo rival puede invalidarla | [Morley Games: Turks Fast Imperial](https://www.youtube.com/watch?v=7TVgpsKBxWk); [AoE Companion: FI genérico](https://aoecompanion.com/build-guides/fast-imperial) |

Las fuentes de recetas publican variantes distintas; no mezclar la edad de subida de una con las asignaciones de otra. El ejemplo turco de Morley es de 2020: respalda la estructura del plan y sus condiciones, pero no certifica el balance de 2026 ni una población óptima actual. Las recetas de comunidad también pueden carecer de fecha/parche explícito. Para una primera versión es preferible publicar hitos y gastos base, evitando tiempos exactos de llegada o variantes extremas.

### Gastos y prerrequisitos que conviene mostrar

La [guía oficial de avances](https://www.ageofempires.com/learn-to-play/advancing-aoe2/) confirma los costos base de Feudal (**500 comida**), Castillos (**800 comida / 200 oro**) e Imperial (**1000 comida / 800 oro**). Normalmente se necesitan dos edificios habilitantes de la edad actual; Imperial admite un castillo como alternativa. Galería/establo normalmente requieren cuartel. Son requisitos para **empezar** el avance, no recursos totales de ejecutar toda la receta. Descuentos y excepciones de civ necesitan adaptación.

No convertir “podés pagar la subida” en “ya estás subiendo”. Tampoco mostrar el costo base como exacto para italianos u otras civs con descuentos de avance. El snapshot tecnológico local informa disponibilidad; no contiene todos los efectos económicos necesarios para calcular esos presupuestos.

## Selección automática recomendada

Ordenar decisiones por datos confirmados:

1. **Modo y condiciones de inicio:** usar RM de inicio estándar para las recetas de Dark Age. Con EW, escenario, edad inicial especial o condiciones desconocidas, abstenerse de aplicar su secuencia de ovejas/jabalíes. En EW se necesita una referencia específica desde Feudal.
2. **Mapa:** abierto terrestre permite presión Feudal; cerrado terrestre permite considerar FC. FI requiere una variante especializada revisada. Agua/híbridos necesitan madera, muelles, pesca y flota; no esconder esa economía bajo una receta terrestre. Nomad necesita otro inicio. MegaRandom no garantiza recursos ni una configuración estándar.
3. **Legalidad del árbol propio:** no sugerir Scouts/FC-caballeros a una civ que carece de esa línea entrenable; reconocer sustituciones regionales. Consultar el árbol completo, no una lista abreviada de debilidades.
4. **Afinidad y excepciones de civ:** favorecer rutas con bonos relevantes verificados, usando una prioridad editorial conservadora. El texto del rol no permite calcular una eficiencia exacta.
5. **Historial compatible:** usar aperturas históricas, mapa y matchup como contexto para elegir entre rutas viables. Con poca muestra, preferir una referencia general adecuada al mapa. Las derrotas del rival frente a una apertura no prueban que ejecutarla causará una victoria.

La recomendación puede reutilizar la puntuación contextual del overlay, pero debe conservar la distinción entre **línea militar** y **build order completo**. “Infantería” no identifica automáticamente M@A; “caballería” en Castillos no identifica una apertura de scouts; FC no identifica boom. FI tampoco aparece como etiqueta en la taxonomía histórica actual de AoE2Insights.

## Excepciones imprescindibles

| Contexto | Adaptación necesaria |
| --- | --- |
| **Empire Wars** | La [descripción oficial](https://www.ageofempires.com/games/aoeiide/empire-wars/) parte de Feudal, economía y edificios ya establecidos; no hay jabalíes en su configuración descrita. No aplicar la receta RM desde Dark Age |
| **Chinos / Mayas** | Aldeanos y recursos iniciales diferentes modifican la numeración y la primera producción. No pegar una receta genérica de tres aldeanos. En EW sus compensaciones también cambian |
| **Hunos** | El paso inicial “dos casas” no se aplica; su presupuesto inicial también difiere. Hace falta una variante, no solo esconder un icono |
| **Gurjaras** | Ganado guarnecido y Camel Scout cambian decisiones centrales. “6 a ovejas” y “Scouts estándar” necesitan variante revisada. La tabla local puede incluir una unidad genérica y su reemplazo; verificar entrenamiento real |
| **Jemeres** | Su excepción de prerrequisitos cambia edificios y avances. No ordenar mercado/herrería como requisitos universales de FC, aunque una receta pueda usarlos por razones económicas |
| **Búlgaros** | Las mejoras gratuitas de milicia cambian el paso y presupuesto de M@A. No indicar pagar una mejora gratuita |
| **Españoles / otras ramas sin ballestero genérico** | Una apertura de arqueros puede ser una decisión de Feudal, pero su continuidad no puede prometer Crossbowman. Consultar el árbol fijado y sus sustituciones |
| **Civs sin Knight** | FC sigue siendo posible, pero FC-caballeros no. El destino debe ser economía, monjes, águilas, camellos, elefantes o unidad única según una receta revisada |
| **Turcos / FI** | Distinguir pólvora habilitada por la civ de cualquier receta FI. Confirmar disponibilidad y gratuidad de tecnologías con fuente versionada; otras civs pueden necesitar tiempo/gasto de investigación adicional |
| **Bonos de comida, aldeanos, recolección o velocidad de avance** | Hindustanis, bengalíes, malayos, italianos y muchas otras civs no comparten tiempos/presupuestos estándar. No interpolar automáticamente una build completa desde dos porcentajes |
| **TG, agua, Nomad, Megarandom y mapas personalizados** | Sin posición de flank/pocket ni condiciones verificadas, no atribuir un rol ni fingir un inicio estándar. Usar guía específica o explicar brevemente que falta una variante compatible |

Los bonos/ausencias citados en esta tabla se comprobaron en el código local y su fuente, [SiegeEngineers/aoe2techtree](https://github.com/SiegeEngineers/aoe2techtree), además de la fuente oficial de EW. `civ-tech.json` está fijado a una revisión; `tools/build-civ-guide.js` consulta `master` al generar y sus descripciones están recortadas. Ambos archivos pueden divergir: no usarlos como un único dataset versionado de efectos. La futura biblioteca de recetas debería registrar fuente, versión/parche revisado, modo, mapas, civs compatibles y excepciones por receta.

## Iconografía y lectura durante la partida

Prioridad visual: **aldeano**, **madera**, **comida**, **oveja**, **jabalí**, **bayas**, **oro**. Completar con casa, molino, campamento maderero, cuartel, establo, galería, herrería, mercado y edades cuando aporten una acción concreta. El icono de comida genérica y el de oveja no son intercambiables: uno expresa recurso y el otro una fuente.

Cada hito puede representarse como una pequeña combinación: **[aldeano] 6 → [oveja]** o **[aldeano] 3 → [madera]**. Los números deben identificarse como objetivo del ejemplo, nunca como conteo medido. En la UI renderizada usar imágenes/SVG y texto real con etiquetas accesibles; no flechas ASCII ni emojis como único identificador. El color ayuda, pero la especie/recurso y la cifra deben reconocerse sin depender de él.

No mezclar “nuevo aldeano”, “aldeanos totales en recurso” y “mover aldeanos existentes”. Son acciones diferentes. Una receta utilizable debe marcar cuál es cada una. “4 madera” por sí solo resulta ambiguo: **“4 nuevos a madera”**, **“dejar 4 en madera”** y **“mover 4 a madera”** no equivalen.

## Criterios de aceptación

* El interruptor se guarda y el overlay se actualiza automáticamente con el contexto confirmado.
* No existen controles requeridos dentro del juego ni detección ficticia de apertura/edad/población.
* Las cinco rutas existen como referencias; la selección automática puede abstenerse si la variante no encaja.
* Ninguna civ recibe unidades ausentes, investigación gratuita presentada como pagada o prerrequisitos genéricos que la civ omite.
* EW/agua/Nomad/inicio desconocido no muestran un BO RM terrestre desde Dark Age sin advertir el alcance.
* El progreso no depende del reloj desde `startedAt`. El nombre, los hitos y el texto explican su condición de referencia.

## Fuentes primarias complementarias

* [Age of Empires: Expanding Your Empire](https://www.ageofempires.com/learn-to-play/expanding-your-empire-aoe2/): producción de aldeanos, vivienda, comida, maderera y transición de recursos.
* [Forgotten Empires: Feudal Rushing](https://www.forgottenempires.net/strategy/age-of-empires-ii-strategy-center/feudal-rushing): propósito de las aperturas y necesidad de adaptación. Es material de fundamentos con ejemplos antiguos; no valida un número de población óptimo ni el balance actual.
* [Morley Games: canal y catálogo de recetas del propio autor](https://morley-games-shop.fourthwall.com/en-eur/collections/build-order-pdfs): confirma que existen variantes específicas por civ, incluidas scouts francos y FI turco. No se compró ni se extrajo contenido de pago.
* [Age of Empires: Dynasties of India](https://www.ageofempires.com/news/dynasties_of_india_is_here/): presentación original de Camel Scout y economía gurjara. Sus porcentajes de lanzamiento no deben reutilizarse como cifras actuales.
* [Investigación de estado y fuentes de esta revisión](RESEARCH-INGAME.md): límites del estado normalizado y del parser de comandos. No se incorporó una nueva fuente de telemetría en vivo.

Los enlaces de YouTube se conservaron como fuentes originales del jugador. Algunos no abrieron directamente en el lector web, pero los resultados indexados y publicaciones del propio autor permitieron verificar las descripciones. No se observaron partidas completas ni se validaron tiempos perfectos; por eso la recomendación se limita a hitos y condiciones, sin prometer ejecución óptima.
