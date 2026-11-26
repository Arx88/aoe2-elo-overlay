## v3.3.14 · Botón «Limpiar completadas» en Entrenamiento → Mi Plan

- **Limpieza en 1 clic de objetivos cumplidos en Mi Plan (`src/training/training-store.js`, `ui/training-ui.js`):** nuevo botón **«Limpiar completadas»** en **Entrenamiento → Mi Plan** que archiva de una sola vez todas las metas marcadas como `✓ CUMPLIDO` y conserva intactos tus objetivos activos en seguimiento (traducido en `es-MX`, `es-ES`, `en` y `zh-CN`).

---

## v3.3.13 · Inicio automático con Windows activado por defecto

- **Inicio silencioso con Windows activado de fábrica (`openAtLogin: true`):** toda instalación nueva o actualización arranca Relic automáticamente en la bandeja del sistema al encender la PC (con el overlay oculto hasta que abrís Age of Empires II: DE). Puede desactivarse cuando quieras desde **Apariencia → Visibilidad automática** o desde el menú rápido de preferencias.

---

## v3.3.12 · Semana fija Lunes–Domingo para el Tesoro de Oro, Inicio automático con Windows y Overlay inteligente solo con AoE2 abierto

- **Tesoro de Oro y tira semanal en bloque fijo de Lunes a Domingo (`src/welcome-home.js`, `ui/welcome-ui.js`):** el oro recaudado y la tira de actividad `L M X J V S D` en **Inicio** ahora cuentan exclusivamente de **lunes 00:00 a domingo 23:59** y se reinician automáticamente a `0` cada lunes (en lugar de una ventana móvil de 7 días).
- **Inicio automático silencioso con Windows (`--autostart`) + Overlay visible solo con Age of Empires II abierto (`src/game-window.js`, `main.js`):** nueva opción **«Iniciar automáticamente con Windows»** (disponible en **Apariencia → Visibilidad automática** y en el menú rápido de preferencias) que levanta Relic silenciosamente en la bandeja del sistema al encender la PC, junto con **«Mostrar overlay solo con AoE2 abierto»** (compatible tanto con Steam `AoE2DE_s.exe` como con Xbox / Microsoft Store `AoE2DE.exe`), mostrando la barra superior únicamente cuando abrís el juego y ocultándola al instante al cerrarlo.

---

## v3.3.11 · Motor determinista unificado (`engineRev: 2`), Hoja de Ruta ELO v3 con iconografía oficial y Ranking Esports de APM

- **Motor de telemetría 100 % determinista y unificado en toda la app (`src/engine/postmatch-engine.js`, `engineRev: 2`):** alineado con el reloj oficial y avisos de servidor del `.aoe2record` (estándar AoE2Insights / `aoc-mgz`), con cota física exacta de tiempo muerto en Alta Edad Media, manejo real de cancelaciones (`Unqueue`) sin descontar aldeanos por tecnologías canceladas, filtrado de ráfagas sin recursos, recorte de ventana final previa a rendición en Feudal, soporte completo de bonificaciones de las **56 civilizaciones** (incluyendo 2.º Centro Urbano cumano en Feudal, Carretilla borgoñesa temprana y tecnologías únicas de velocidad militar) y rehidratación automática de caché local desde `savegame/` en `< 50 ms` sin llamadas de red.
- **Nueva tarjeta protagonista «Hoja de Ruta al Próximo ELO» en Central (`src/elo-roadmap.js`, `ui/tactical-ui.js`):** diagnóstico causal 100 % puro de **RM 1v1** (cero contaminación con partidas de equipo ni Empire Wars) comparado contra benchmarks empíricos de cada franja de 100 ELO sincronizados con Cloudflare D1, escudos oficiales transparentes de las 4 edades, medallones con íconos oficiales de AoE2:DE, comparador directo con muesca de objetivo (sin porcentajes sintéticos), reglas accionables *SI → ENTONCES* y conexión en 1 clic con el botón oficial de **Mi Plan**.
- **Nuevo Laboratorio de APM y Ranking Mundial Esports en Entrenamiento:** simulador interactivo de velocidad y precisión mecánica comparado contra rangos competitivos globales, integrado en los 4 idiomas (`es-MX`, `es-ES`, `en`, `zh-CN`) y compatible con el skin **Ultra** OLED y **CSP estricto** (`0` estilos inline).

---

## v3.3.10 · Pulido de precisión del skin Ultra (tabs unificados y cajas con aire en toda la app)

- **Tabs unificados y sin bordes dobles en skin Ultra (`ultra-skin.css`):** se corrigieron las barras de pestañas de **Central** (`RM 1v1 / Global` y `Resumen / Civs y Mapas / Mejora y ELO`), **Entrenamiento** (eliminando el solapamiento con el indicador deslizante `.tr-glide-indicator`), **barra lateral**, **Cuenta** y **Postmatch Deep Dive**, logrando subrayados activos blancos nítidos y cero colisión de bordes.
- **Eliminación de cajas pegadas al texto sin padding:** se quitaron los bordes forzados sobre bloques internos sin margen propio en **Prematch**, **Batalla**, **Postmatch**, **Apariencia** (`.pm-config-block`), **Central** (`.cx-dna-sig`, filas y divisores KPI), **Entrenamiento → Progreso** (`.tr-pel-steps`) y **Postmatch** (`.pm-eyebrow`).
- **Limpieza total de restos heredados:** unificación final de **Build Orders**, **Arena** (sin arte de fondo heredado) y tarjetas de **Cuenta** al negro puro OLED (`#000000` / `#09090c`).

---

## v3.3.9 · Skin exclusiva Ultra (OLED Negro Puro), Matchups conectados por edad, Prueba Ultra de 7 días y enlace de referidos renovado

- **Nueva apariencia exclusiva **Ultra** (Negro Puro OLED para toda la app y overlay transparente):** tema de alta precisión exclusivo del plan Ultra con negro absoluto (`#000000`), tipografía de alto contraste, micro-bordes hairline, eliminación completa de acentos dorados heredados en Central/Postmatch/Entrenamiento y ventana de overlay 100 % transparente sin recuadro de fondo.
- **Entrenamiento → Matchups rediseñado con cadena conectada de 3 edades (3.080 cruces):** plan de partida paso a paso (**PASO 1 · Edad Feudal → PASO 2 · Edad de los Castillos → PASO 3 · Edad Imperial**) sensible a los counters reales del rival (ej. Camellos contra Francos, Huscarles contra Britanos, Fast Castle limpio en Arena), puentes explícitos de transición entre edades, badges claros en español (*Tu ventaja*, *Tramo parejo*, *Peligro rival*) y curva de reloj reordenada debajo del plan táctico con leyendas claras.
- **Prueba gratuita de Relic Ultra ampliada a 7 días (configurable en tiempo real):** la prueba gratuita de Ultra ahora dura **7 días** y sincroniza dinámicamente su duración desde el servidor en todas las pantallas (Planes, modales de mejora, pantallas bloqueadas y Entrenamiento) en los 4 idiomas (`es-MX`, `es-ES`, `en`, `zh-CN`).
- **Enlace de referidos reparado y página oficial de invitación:** los enlaces de invitación ahora apuntan a la página oficial de Relic (`https://relic-aoe2.pages.dev/r/<código>`) con descarga directa para Windows y copiado nativo desde el portapapeles de Electron en el modal de Referidos.

---

## v3.3.8 · Escudos oficiales limpios de las 4 Edades (PNG transparente) y scroll vertical sedoso global

- **Emblemas oficiales de AoE2:DE en PNG transparente sin bordes sucios (`assets/icons/ages/{dark,feudal,castle,imperial}.png`):** se reemplazaron los escudos con manchas de pergamino por las versiones oficiales limpias de *Age of Empires II: Definitive Edition* (`112×112` RGBA transparente, verificados visualmente en Chromium sobre fondo oscuro en Postmatch, Central, Árbol Tecnológico y Entrenamiento).
- **Scroll vertical sedoso global corregido (`ui/smooth-motion.js`):** se eliminaron los dos bloqueos que impedían sentir el scroll suave vertical en Central, Postmatch y el resto de las pantallas — el filtro `Math.abs(dy) < 20 && !Number.isInteger(dy)` (que descartaba eventos de rueda en monitores 4K / 175 % DPI y ratones de alta resolución) y el corte prematuro `stallFrames >= 3` en el tramo final de desaceleración — alineando la física vertical (`tau = 155 ms`, multiplicador `1.18×`) con la suavidad del Árbol Tecnológico y añadiendo soporte limpio sobre elementos SVG y cancelación instantánea con teclado o barra lateral.

---

## v3.3.7 · Rediseño visual editorial del bloque eAPM en Postmatch (verificado en Chromium para 2, 6 y 8 jugadores)

- **Aislamiento estricto de SVG contra estilos globales (`command.css`):** se corrigió la regla heredada de `settings.css` (`svg { stroke: currentColor; stroke-width: 1.5 }`) que dibujaba bordes blancos alrededor de los gráficos y aros blancos sobre los puntos de dispersión, usando `:where()` para preservar los contornos nítidos de cada caja intercuartil `Q1–Q3` y las píldoras de edad `F/C/I`.
- **Tarjetas de participantes estructuradas y simétricas (`ui/tactical-ui.js`, `command.css`, `settings.js`):** se reemplazaron las píldoras apretadas por tarjetas de telemetría Relic con riel lateral de color oficial in-game (3 px), escudo de civilización (22 px), jerarquía tipográfica tabular (`media · Med · máx`) y grillas equilibradas sin filas huérfanas para 2, 3, 4, 6 y 8 jugadores.
- **Box-and-Whisker editorial limpio:** se eliminó la nube de puntos superpuestos; ahora muestra cajas `Q1–Q3` con borde y relleno translúcido del color exacto del jugador, mediana luminosa, rombo de promedio (`◆`), bigotes limpios, outliers genuinos únicamente (`> Q3 + 1.5×IQR`), soporte refinado en temas claros/pergamino y barra de color alineada sobre cada nombre sin solapamientos.

---

## v3.3.6 · Nuevo bloque comparativo de eAPM de todos los participantes en Postmatch

- **Gráfico editorial de eAPM por jugador en Postmatch (`Evolución y Curva`):** debajo del bloque de *Ritmo de actividad por tramo* se incorporó la comparativa completa de **todos los participantes de la partida** (2 en 1v1 y 4/6/8 en Team Games), cada uno con su **color oficial real de la partida** (colores 1–8 refinados para la estética obsidiana y oro envejecido de Relic).
- **Doble panel interactivo:**
  - **Curvas suaves minuto a minuto** (splines Catmull-Rom con marcas sutiles de llegada a Feudal/Castillos/Imperial y cursor interactivo que ordena el eAPM exacto de todos los jugadores minuto por minuto).
  - **Distribución y estabilidad (Box-and-Whisker + puntos por minuto)** en la misma escala vertical con mediana luminosa, rango intercuartil `Q1–Q3`, mínimos/máximos y leyenda interactiva con escudo de civilización para aislar a cualquier jugador con un clic.
- **Actualización automática de replays locales (`command-adapter-v10`) y 4 idiomas completos:** compatible con CSP estricto (0 estilos inline) y traducido desde el primer día en `es-MX`, `es-ES`, `en` y `zh-CN`.

---

## v3.3.5 · Traducción real verificada en Chromium en las 22 pantallas (4.162 frases · 0 fugas en `en` y `zh-CN`)

- **Árbol Tecnológico (56 civilizaciones y 486 nodos) y Entrenamiento al 100 %:** se tradujeron al inglés y chino simplificado oficial de AoE2:DE todas las bonificaciones de civilización, tecnologías únicas, unidades únicas, bonificaciones de equipo, clases de armadura, bonificaciones de daño y plantillas dinámicas de Progreso, Mi Plan, Build Orders, Matchups Pro y Arena (`4.162` frases totales).
- **Corrección del traductor reactivo del DOM (`ui/i18n.js`):** se eliminó el salto prematuro en nodos con `data-i18n` sobrescritos dinámicamente por JS, se normalizaron espacios no separables (`\u00a0`), prefijos con viñetas y búsqueda insensible a mayúsculas.
- **Verificación real en Electron/Chromium (22 pantallas × `en` y `zh-CN`):** auditoría en vivo sobre el DOM renderizado de Inicio, Central (todas las vistas y diagnósticos), Prematch, Batalla, Postmatch, las 6 pestañas de Entrenamiento desbloqueadas, Apariencia, Planes, Actualizaciones, Cuenta, Preferencias y Referidos con **0 errores y 0 fugas**.

---

## v3.3.4 · Traducción universal al 100 % en los 4 idiomas (0 fugas verificadas en toda la app)

- **Cobertura total del 100 % en `es-MX`, `es-ES`, `en` y `zh-CN` (0 fugas reales):** se integró el motor universal de traducción de contenido (`src/i18n/content-translator.js`, `ui/content-rules.js` y `ui/i18n.js`) con **2.873 frases oficiales de AoE2:DE**, reglas dinámicas para todas las plantillas de motor y traductor reactivo del DOM (`MutationObserver` + reversibilidad completa al cambiar idioma).
- **Central 100 % limpia en todos los modos y pestañas:** se corrigieron las fases dinámicas de diagnóstico por mapa y civilización (`Edad de los Castillos (28–42m)`, `Feudal / Temprano (<28m)`, `Edad Imperial (42–58m)`), nombres de edificios en *Huella de combate* (`Establo`, `Cuartel`, etc.), aperturas y tooltips de *Agregar a Mi Plan*.
- **Entrenamiento, Arena (410 preguntas), Órdenes de Construcción, 56 Guías/Matchups, Postmatch, Prematch, Inicio y HUD:** el 100 % de los textos, preguntas, opciones, explicaciones, recetas, rangos, términos de Herrería y atributos de `settings.html` / `index.html` se traducen automáticamente con terminología oficial de AoE2:DE y 0 fugas verificadas en auditoría real (`zh-CN` y `en`).
- **Guardián de calidad reforzado:** `i18n-guard-test` ahora valida la integridad de los diccionarios de contenido (`2.873` frases) y la traducción real de fases dinámicas junto con las 24 suites completas de pruebas.

---

## v3.3.3 · Limpieza integral de traducciones (2.090 claves × 4 idiomas), 120 mapas oficiales y noticias 100 % desde el Administrador

- **Noticias de Inicio 100 % sincronizadas con el panel de administrador:** se eliminó la tarjeta de relleno hardcodeada en Bienvenida; Relic ahora muestra únicamente la noticia activa publicada en D1 (y la oculta por completo cuando está apagada en el administrador).
- **Central verificada con datos reales (0 fugas en `zh-CN` y `en` en los 5 modos):** se tradujeron los textos dinámicos restantes (`VICTORIA`/`DERROTA` en partidas recientes, resumen de Hora Dorada, estabilidad de ladder, comparativa *Antes vs Ahora*, alertas de contexto de civilización, *Muestra chica*, *Pocket/Flank*, `Global` y `drops`), se amplió el catálogo oficial a **120 mapas de AoE2:DE** y se unificó la traducción de aperturas sin distinción de mayúsculas ni idioma origen.
- **Interfaz general, Prematch, Postmatch, HUD y Entrenamiento (2.090 claves × 4 idiomas):** traducción de modales de mejora/checkout/referidos, buscador de Central, toasts y estados en `settings.js` / `settings.html`, tarjetas de Prematch/Postmatch, bloques del overlay en vivo (`renderer.js`) y cabeceras/civilizaciones de Entrenamiento.
- **Guardián de calidad con render real en `zh-CN`:** `i18n-guard-test` ahora ejecuta un render real de Central en chino simplificado con partidas e insights y falla ante cualquier fuga de español (con o sin tildes).

---

## v3.3.2 · Central 100 % traducida en los 4 idiomas y nombres oficiales de civs/mapas

- **Central completamente localizada (4 idiomas × 1.763 claves · `es-MX`, `es-ES`, `en`, `zh-CN`):** traducción total de todas las pestañas de **Central** (*Resumen*, *Civs y Mapas*, *Mejora y ELO*), incluyendo **ADN de jugador**, **Tridente táctico**, **Hora Dorada**, **Vitrina de récords**, **Huella de combate**, **Velocidad vs Cerebro**, **Radiografía de Team Games**, **Color de la suerte**, **Espejo / Meta / GG**, **Laboratorio de Mejora Personal**, **Motores y fugas de ELO**, **Antídotos y curva de sesión**, y todos los hallazgos dinámicos de **Diagnóstico por civilización y por mapa** con cambio de idioma instantáneo.
- **Nombres oficiales de civilizaciones, mapas, unidades y edificios corregidos:** se unificaron los alias `AppI18n.civ` / `map` / `unit` / `building` para que Inicio, Árbol Tecnológico y Central muestren siempre la nomenclatura oficial de AoE2:DE en el idioma activo.
- **Guardián de traducciones extendido a Central y sus motores:** `i18n-guard-test` ahora verifica también `ui/tactical-ui.js` (Central completo) y las claves dinámicas `cxe.*` de los motores analíticos para evitar regresiones de idiomas mezclados.

---

## v3.3.1 · Traducción integral en los 4 idiomas y botón de oferta de vencimiento en una línea

- **Botón de oferta de prueba vencida corregido:** se fijó `white-space: nowrap`, ajuste limpio del contenedor y texto más conciso (`Ver oferta (−20 %) →` / `View offer (−20%) →`) para que el botón principal nunca vuelva a partirse en dos líneas en ningún idioma.
- **Traducción completa (4 idiomas × 1.191 claves · `es-MX`, `es-ES`, `en`, `zh-CN`):** localización total de la pantalla de **Inicio**, **Árbol Tecnológico**, subpestañas y **Arena** de Entrenamiento, pantallas bloqueadas (**Prematch**, **Batalla**, **Postmatch**), **Planes**, **Checkout**, **Programa de referidos**, barra lateral y pie de versión, con re-render instantáneo al cambiar de idioma sin reiniciar Relic.
- **Guardián automático de i18n endurecido en CI:** `i18n-guard-test` ahora verifica todos los elementos visibles de HTML, todas las claves invocadas por `t()` / `wt()` / `tt()` / `trT()` y cadenas hardcodeadas en JS para impedir que vuelvan a filtrarse textos sin traducir.

---

## v3.3.0 · Inicio editorial, Árbol Tecnológico 56 civs, animaciones al scroll, Arena anti-trampa y seguridad reforzada

- **Nueva pantalla de Inicio editorial (Relic Home):** Rango de Oro (*Saqueador → Mansa Musa*) con conteo semanal y ganancia de hoy (`+X hoy`), tira de actividad de 7 días, **Meta global · Age of Empires II: DE** en vivo con counters empíricos Pro, récords de la semana, Víctima favorita / Némesis reciente y bloque de **Novedades de Relic** con imagen editorial. Podés elegir si abrir siempre en Bienvenida o directo en Central desde **Cuenta → Inicio de la aplicación**.
- **Árbol Tecnológico completo de las 56 civilizaciones:** consulta interactiva local con las 56 unidades únicas, tecnologías, bonificaciones y comparativa rápida dentro de Entrenamiento, junto a iconos oficiales AoE2:DE re-afilados.
- **Animaciones fluidas al desplazarte en Central y Postmatch:** los porcentajes, el gráfico radar de ADN, los anillos de winrate (*Tu Arma Secreta*, medidor de eAPM) y las barras se revelan suavemente a medida que bajás por la pantalla.
- **Entrenamiento → Arena mejorada:** el cronómetro ya no corre solo al entrar (requiere tocar **Iniciar desafío →**), salir de la pestaña con una pregunta activa descuenta 1 vida para evitar consultas externas y se corrigió el botón al agotarse el tiempo.
- **Popup de vencimiento con oferta y unificación a Ultra:** al finalizar la prueba gratuita de 24 horas, Relic muestra un aviso único con acceso directo al plan **Anual (−20%)** y todas las etiquetas visibles quedan unificadas bajo el nombre **Ultra**.
- **Seguridad reforzada y diagnósticos sanitizados:** Electron Fuses con verificación de integridad ASAR (`RunAsNode=0`, `OnlyLoadAppFromAsar=1`), licencias Ed25519 vinculadas a dispositivo, diagnóstico técnico opcional sanitizado y guardián automático de traducciones completas en los 4 idiomas (`es-MX`, `es-ES`, `en`, `zh-CN`).

---

## v3.2.2 · Matchups Pro con iconos oficiales, Referidos renovado, Progreso y Fix Login Gmail

- **Inicio de sesión con Google reparado y más limpio:** optimización crítica en el servidor de cuentas (reducción de consultas DDL en frío de ~11 s a ~310 ms para LatAm/Argentina y blindaje de restricciones en D1), ampliación del timeout de intercambio OAuth a `20 s` y redirección automática HTTPS a Relic al finalizar para no dejar `127.0.0.1` visible en el navegador.
- **Entrenamiento → Matchups con datos reales Pro e iconos oficiales AoE2:DE:** reemplazo de fórmulas abstractas por el motor empírico compilado desde 29.220 partidas reales (`Top Pro / +2000 / +1900 ELO`) y 612 repeticiones oficiales separadas en **Abiertos · Arabia** y **Cerrados · Arena**, con curva real de reloj (`<26m`, `26–38m`, `+38m`), postura económica (`1 TC / 2 TC / 3 TC`), 239 iconos oficiales locales de unidades/tecnologías (`SiegeEngineers/aoe2techtree`), estética aireada estilo Central y `PLAN PRO` en Prematch.
- **Entrenamiento → Progreso optimizado:** la **Evolución partida a partida** con selector rápido de los 6 fundamentos ahora aparece arriba junto al banner principal para leer tu tendencia sin hacer scroll.
- **Modal de Referidos renovado:** nueva cabecera hero a sangre completa con el estandarte de Relic, progreso `X / 10` claro y texto reducido al mínimo para invitar amigos en 1 clic.

---

## v3.2.1 · Fix de Prematch en vivo, Entrenamiento sin duplicados y Programa de Referidos

- **Overlay de Prematch restaurado en tiempo real:** corrección crítica en el agente global de red (`undici`) que bloqueaba el handshake de los WebSockets de matchmaking y salas personalizadas con código `1006`, y mejora en el carril rápido (`FastLane`) para detectar partidas apareadas sin perder el estado global.
- **Entrenamiento → Mi Plan más limpio y sin duplicados:** fijar un cuello de botella desde **Progreso** ahora te lleva directamente a **Mi Plan** (ya no salta a Build Orders), los accesos muestran su destino real y la deduplicación semántica impide agregar dos veces el mismo objetivo aunque cambie la redacción o la pantalla de origen.
- **Nuevo Programa de Referidos (10 invitados activados → 1 mes gratis de Relic Ultra):** acceso dedicado **«Ganá 1 mes Ultra»** en la barra lateral, tarjeta en **Cuenta** y modal interactivo con progreso 10/10, enlace/código propio y protección antifraude por hardware, red e identidad real de AoE2:DE (recompensa única por cuenta y por PC).

---

## v3.2.0 · Progreso de alto rendimiento, Balance Semanal real, Arena v6 verificada y optimización integral

- **Entrenamiento → Progreso rediseñado con arte coherente con Central:** nueva consola de telemetría con selector de partidas, diagnóstico de cuello de botella con pérdida exacta en aldeanos, **Ejecución por Edades en 3 etapas cronológicas ilustradas** (**I · Alta Edad Media**, **II · Edad Feudal** y **III · Castillos y Combate**), libro de 6 fundamentos con barras divergentes y curva partida a partida.
- **Nuevo Balance Semanal («Mejoras de esta semana») + Gráfico de mejoras por día:** módulo adicional con estética propia en verde bosque, jade y oro champán que muestra únicamente mejoras reales verificadas de los últimos 7 días (`Antes → Ahora`, aldeanos ganados y récords reales) junto a un gráfico diario honesto que distingue días con mejoras, días jugados sin mejoras y días de descanso sin inventar datos.
- **Arena v6 auditada contra la wiki y el árbol tecnológico completo de las 56 civilizaciones:** más de 420 preguntas verificadas, correcciones de bonos, unidades únicas y tecnologías de Corona, sin contradicciones ni opciones ilegales.
- **Coherencia de planes y Build Order Helper:** blindaje total al vencer la prueba gratuita de 24 horas en Ultra (sin restos de funciones Ultra en cuentas Free) y respeto estricto del interruptor maestro de **Build Order Helper** en **Batalla** para que un Build Order armado en Entrenamiento nunca se active en partida si el interruptor está desactivado.
- **Corrección del overlay de Postmatch y barra lateral:** eliminación de bloques de la vista de Ajustes que se filtraban en el overlay al terminar una partida, y pie de barra lateral limpio en una sola línea (`v3.2.0 · Derechos reservados`).
- **Mejoras de rendimiento y fluidez:** Prematch en dos fases, lectura de replays fuera del hilo principal, sincronización delta optimizada, HTTP/2 con `undici` y caché LRU.

---

## v3.1.0 · Entrenamiento completo, Batalla, Central renovada y popups minimalistas

- **Entrenamiento (Beta · Relic Ultra):** navegación limpia en 5 pestañas (**Progreso**, **Mi Plan**, **Build Orders**, **Matchups** y **Arena**) con gráfico de araña, curva de evolución por indicador, creador/editor de Build Orders con bonos de civilización y campaña de 7 unidades con 410 desafíos.
- **Mi Plan con seguimiento automático y botón de pesita:** tocá el nuevo ícono minimalista de pesita en **Central**, **Postmatch** o **Progreso** para agendar focos de entrenamiento; Relic evalúa automáticamente tus próximas partidas y te avisa cuando cumplís cada objetivo.
- **Sección «Durante» renombrada a «Batalla»:** identidad unificada en barra lateral, cabeceras, popups y planes.
- **Central renovada:** pestañas con subrayado dorado unificadas con Entrenamiento, rediseño editorial de **Estabilidad de Ladder y Parches** (rango visual de ELO, métricas limpias y tabla de parches sin solapamientos) y corrección del scroll horizontal en la barra lateral.
- **Popups de plan minimalistas:** vistas centradas sobre fondo borroso sin scroll en **Prematch**, **Batalla**, **Postmatch** y **Entrenamiento**, con las ilustraciones oscuras de Relic y prueba gratuita de 24 horas en Ultra.
- **Animaciones suaves en Central y Postmatch:** entrada escalonada de tarjetas, transiciones fluidas al cambiar de pestaña y micro-elevación interactiva.

---

## v2.11.0 · Datos coherentes en Central, 200 partidas por modo, Postmatch v6 y ventanas Pro / Ultra

- **Central con datos oficiales sin sesgo:** los winrates, mapas, civilizaciones, colores, roles de equipo y Motores/Fugas de ELO se calculan sobre tus partidas oficiales de AoE2 Companion. AoE2Insights solo aporta aperturas y eAPM, con su cobertura declarada.
- **Hasta 200 partidas por modo con sincronización incremental:** Central amplía la muestra sin demorar el inicio, guarda el historial en caché local y en cada actualización solo pide las partidas nuevas. Empire Wars se carga al abrir su pestaña.
- **Muestras mínimas unificadas y realidad de AoE2:DE:** sin conclusiones con 1–4 partidas, sin mezclar replays de RM Team en RM 1v1 o Empire Wars, relojes de victoria vs derrota con muestra pareada por edad, Maestría calculada solo sobre partidas que llegaron a Edad de los Castillos, Arena sin penalizar el menor eAPM y mapas de inicio nómada fuera del cálculo Pocket/Flank.
- **Ventanas por plan:** Free ve `Últ. 10`; Pro alterna `Últ. 10` y `Últ. 20`; Ultra desbloquea `Últ. 50`, `Últ. 100` y el historial total.
- **16 nuevos descubrimientos:** 8 en Central (Radiografía de Team Games, Color de la suerte, Espejo y meta, Perfil en derrotas, Resaca y revanchas, Relojes de victoria, Maestría histórica, Zona de confort de ELO) y 8 en Postmatch (Aldeanos fantasma, Punto de quiebre, Brecha de Herrería, Cambio de composición, Rol en equipo, Recursos atrapados, Crónica del replay y Castillo decisivo).
- **Postmatch v6 y placas de partida:** banner principal a ancho completo, tarjetas por edad, anillo de maestría de civilización, capítulos navegables y lista de partidas recientes rediseñada.
- **ADN del Jugador a escala exacta:** el radar dibuja cada eje 1:1 con su porcentaje y el eje `Clutch` pasa a llamarse **vs +ELO** (winrate contra rivales o equipos de mayor ELO).
- **Ventana de Centro de mando normal:** deja de fijarse siempre al frente (`alwaysOnTop`), permitiendo usar el navegador (por ejemplo al iniciar sesión con Google) u otras ventanas sin tener que mover Relic, manteniendo el overlay en partida siempre visible.

---

## v2.10.0 · Central v5, 9 Descubrimientos de Jugador, 194 Mapas Oficiales y Postmatch de las 56 Civilizaciones

- **Rediseño visual de Central (v5) con jerarquía de launcher de juego:** nueva barra de navegación en 3 capítulos ilustrados (**Resumen**, **Civs y Mapas**, **Mejora y ELO**) con medallones de icono, arte integrado, escudos de civilización grandes con anillo de winrate y **194 imágenes isométricas oficiales de mapas de AoE2:DE** en fichas, listas y diagnósticos.
- **9 descubrimientos reales y no genéricos en Central:**
  - **ADN del Jugador + Radar SVG de 5 ejes** (`Agresión`, `Ritmo`, `Clutch`, `Arsenal`, `Late`) con arquetipo táctico calculado.
  - **Tridente Táctico clicable:** *Tu Arma Secreta*, *Tu Mapa Fortaleza* y *Tu Bestia Negra / Trampa Silenciosa / Matagigantes* (con brecha real por ELO promedio de equipo en partidas en equipo).
  - **Tu Hora Dorada y Vitrina de Carrera:** rendimiento por franja horaria y día de la semana, más 6 trofeos históricos reales.
  - **Química de Escuadrón y Rivales:** *Mejor Dupla*, *Dupla Cuesta Arriba*, *Cliente Favorito* y *Rival Maldito*.
  - **Huella de Combate, Velocidad vs Cerebro (medidor SVG de eAPM) y Ventana Letal por Edad:** conecta las grabaciones `.aoe2record` locales con tu ritmo y fases de partida.
- **Motor Postmatch consciente de las 56 civilizaciones:** auditoría completa de bonificaciones propias, ocultas y de equipo (incluyendo exención total de mercado para Sarracenos, restricciones reales de árbol tecnológico y tarjeta de maestría de civilización).
- **Pantalla de inicio atmosférica y motor de sonidos ampliado:** secuencia de arranque a pantalla completa con ilustración umbral, emblema **R**, barra dorada y audio sutil; nuevos efectos táctiles para hover, tecleo en búsqueda, cambios de pestaña y progreso.
- **Sincronización delta de API, caché unificada y nomenclatura oficial de AoE2:DE:** menor tráfico de red, detección automática de perfil al inicio y corrección de terminología oficial en español en toda la interfaz.

---

## v2.8.0 · Sistema visual Obsidian Gold, Diagnóstico por Civilización, eAPM por Mapa y Detección Blindada

- **Identidad visual Obsidian Gold unificada (Launcher + Overlay default + Postmatch):** gradiente obsidiana oscuro con bordes dorados finos en toda la aplicación, barra superior integrada sin cortes, encabezados limpios en cada sección, sin abuso de sombras y piel predeterminada del overlay (`Clásico`) alineada al mismo lenguaje visual.
- **Resolución nativa 100 % en monitores 4K / alto DPI:** ventana de Centro de mando ampliada (`1480×940`), barra lateral fija (`248 px`) y grilla fluida con espaciado universal de 8 px.
- **Central de estadísticas con Diagnóstico por Civilización, eAPM por Mapa y Velo ULTRA:** diagnóstico estadístico bayesiano por civilización (filtro anti-Simpson, control por ELO rival y divergencia reciente vs histórica), promedio de eAPM real por mapa, buscador rediseñado y vista previa con velo elegante para usuarios Free/Pro.
- **Durante la partida simplificado y Postmatch renovado:** sección Durante enfocada en *Ficha de civilizaciones* y *Smart Build Order*, configuración Postmatch reorganizada en dos columnas e informe completo del motor Postmatch unificado en Obsidian Gold.
- **Detección de partidas en vivo y rendimiento:** resolución inmediata de partidas rápidas, temporizador exacto de auto-ocultado (`hideAtSeconds`), caché de API con deduplicación en vuelo y reducción de tamaño del instalador.

---

## v2.7.5 · Estandartes de Relic

- Nuevo arte de la barra lateral y fortaleza con estandartes en la cabecera de Prematch.
- Ilustración propia para el asistente de primer inicio.
- Arte de cabecera y lateral para el instalador de Windows.

---

## v2.7.2 · Rediseño Team Game, Recomendador de civilización 3-factores, detección blindada e i18n completo

- **Rediseño integral de Team Game (TG):** ancho adaptativo (720 px), roster en dos columnas (*Tu equipo* vs *Equipo rival*), tarjetas sintetizadas de estructura fija con arte de aperturas de Postmatch, consulta paralela de los 4 rivales y carrusel automático cada 10 segundos (que solo empieza a contar cuando cargan los datos del par activo).
- **Recomendador de civilización independiente (3 factores):** nuevo toggle propio en **Prematch** que sugiere tu mejor civ cruzando mapa, tu winrate, las civs y las aperturas que le duelen al rival, sin pisar los 3 escudos de predicción del rival y con aviso coherente frente a jugadores Random.
- **Detección de partidas en vivo blindada contra `HTTP 429`:** backoff exponencial real ante límites de AoE2 Companion, cadencia REST adaptativa mientras el WebSocket de matchmaking está sano, keepalive `ping` cada 30 s en sockets y prioridad absoluta de partidas reales sobre vistas previas.
- **Pulido visual, icono oficial y traducciones:** icono oficial de Relic desempaquetado correctamente para la barra de tareas de Windows, unificación del overlay al iniciar partida (`0:00`), corrección de superposición del badge de Smurf y del espaciado de *Head to head*, y traducción completa de Prematch en los 4 idiomas (`es-ES`, `es-MX`, `en`, `zh-CN`).

---

## v2.7.1 · Mejoras visuales en Postmatch y Central

- **Postmatch:** cifras más visibles y su evidencia al lado en «Lo que hiciste bien» y «Lo que te costó».
- **Arte de Postmatch:** cabecera ilustrada, emblemas propios por tipo de logro e icono centrado en «Próxima partida».
- **Central:** ilustración cartográfica en la cabecera de Evolución de ELO, con la gráfica despejada.

---

## v2.7.0 · Postmatch v3 con 40+ destacados, Feedback integrado, detección en vivo blindada y adaptación DPI

- **Postmatch v3 en 3 zonas con lectura en 3 segundos:** resumen narrativo con barra de veredicto y rachas, zona verde/oro (*Lo que hiciste bien y mejoraste* con hasta 3 medallas de dominios distintos), zona roja sutil (*Lo que te costó*) y una única misión clara para la próxima partida, dejando el análisis técnico organizado en pestañas (*Evolución y Curva*, *Duelo vs Rival* y *Mejoras, Colas y Combate*).
- **Más de 40 destacados con relevancia táctica real y memoria anti-repetición:** suma rachas de victoria, escaleras de mejora de 3 partidas consecutivas, récords personales, hazañas de ELO/mapa/civilización y personalidad de la partida, evaluando Herrería y consejos según las unidades reales de tu ejército, el resultado y si jugaste 1v1 o Team Game.
- **Botón de Feedback integrado:** enviá sugerencias o reportes directo desde el ícono de ajustes del Centro de mando, con enlace inmediato al panel de administración.
- **Interfaz más clara y adaptable a cualquier escala de Windows:** gráficos de Postmatch y tarjetas de evolución fluidos sin desbordes de etiquetas, compensación automática de zoom para pantallas con escalado Windows (125 % / 150 % / 175 %), indicador *Beta* en la pestaña **Durante**, etiqueta imperial para el plan **Ultra**, **Ayuda de civ** movida a **Durante**, ejemplo visual al activar **Smurf Detector** y opción para ocultar el overlay si AoE2 se minimiza por más de 5 segundos.
- **Detección de partidas en vivo y Central reforzadas:** corrección de filtros `Últ. 10` vs `Últ. 20` en Central, recuperación automática tras suspensión de Windows, reconexión silenciosa ante sockets colgados y actualización en segundo plano de replays guardados al nuevo motor.

---

## v2.6.1 · Central de estadísticas renovada

- Nueva cabecera de perfil y cuatro ilustraciones propias para Central.
- Curva de ELO interactiva con navegación por teclado, fechas del tramo y cantidad de registros por modo.
- Resultados por duración y comparativas de mapas y civilizaciones con el tamaño de la muestra a la vista.
- La última partida se vincula con su propio replay y se compara con antecedentes del mismo modo.

---

## v2.6.0 · Central de Estadísticas, Smurf Detector (Ultra), Planes Free/Pro/Ultra y Launcher Responsive

- **Nueva pestaña Central de estadísticas:** histórico completo oficial por modo (`RM 1v1`, `RM Team`, `EW 1v1`, `EW Team` y `Global`) con caché en memoria y respaldo en disco, curva interactiva de ELO con tooltip flotante y selector de tramo (`30 pj / 100 pj / Todo`), panel **Última partida vs tu promedio (`Últ. 10 / Últ. 20`)**, maestría histórica de civilizaciones y mapas (`Más jugadas / Mejor WR`), radar táctico honesto y **buscador de jugadores** con regreso instantáneo a tu perfil.
- **Smurf Detector (Ultra):** nuevo toggle en Prematch que sugiere posibles cuentas secundarias junto al ELO en el overlay cruzando 6 señales reales (cuentas vinculadas con mayor ELO en RM 1v1, winrate extremo en cuentas jóvenes, escalada vertical/racha, caída desde pico histórico, anomalía de eAPM por banda y tasa alta de abandonos).
- **Postmatch con selector de últimas 10 partidas:** revisá el informe de cualquiera de tus últimas 10 partidas directamente inline en Ajustes con scroll suave, manteniendo el overlay exclusivo para partidas recién terminadas (100% click-through y sin botón de cerrar).
- **Vista previa en vivo al activar toggles:** usa tu última partida real de `RM 1v1` y cuenta 20 segundos recién cuando termina de cargar toda la información.
- **Planes rediseñados (`Free`, `Pro $1`, `Ultra $1.99`) y launcher 100% responsive:** barra lateral con logo centrado y menú centrado verticalmente, grillas y proporciones fluidas al maximizar en cualquier resolución, e ícono dorado **R** de Relic en la barra de tareas de Windows.

---

## v2.5.12 · Postmatch horizontal y métricas más claras

- En pantallas con espacio, el informe se abre más ancho, con las edades en una fila y el duelo junto a tu evolución. Al cerrar, el overlay recupera su ancho habitual.
- Pictogramas nuevos para el foco de la próxima partida y los consejos.
- El informe distingue los pedidos de unidades de los recuentos de población. La tasa de aldeanos pedidos se calcula incluso si la comparación personal está desactivada.
- El TC inactivo temprano mantiene el mismo criterio acumulado en el duelo y en la comparación personal. Se identifica como estimación y se indica el recorte del acumulado hasta el último uso.

---

## v2.5.11 · Estructura de planes (Free · Pro $1 · ProMax $1.99) y centrado del logotipo

- **Logo lateral centrado en la barra:** el logotipo de Relic (`138 px`) ahora queda perfectamente centrado en el eje horizontal de la barra lateral.
- **Planes claros por etapa de partida y precios oficiales:**
  - **Free (`Gratis`):** Nombre, ELO actual e historial cara a cara entre ambos.
  - **Pro (`$1`):** Todo lo de Gratis + **Prematch** completo (roster ampliado, guía de civ, últimas 5 civs, perfil del mapa, aperturas reales, lectura de apertura, elección de civ y balance TG).
  - **ProMax (`$1.99`):** **Prematch** + **Durante** (Smart Build Order y rutas de oportunidad) + **Postmatch** (resumen, evolución en el mapa y análisis local del replay).

---

## v2.5.10 · Ajuste fino del logotipo lateral

- **Logo lateral un 10% más compacto (`138 px`):** mayor aire visual en la barra izquierda del Centro de mando.

---

## v2.5.9 · Prioridad directa de partida en curso y cambio automático de Steam en vivo

- **Consulta de partida en curso sin cola de espera:** `fetchLatestMatch` ahora consulta directamente sin pasar por el planificador de historial en segundo plano y revisa las 3 partidas más recientes para que ninguna partida activa quede bloqueada por descargas de historial o salas previas.
- **Cambio automático de cuenta de Steam en segundo plano:** si cambiás de cuenta en Steam con Relic abierto en la bandeja, el perfil activo se actualiza solo sin siquiera tener que abrir Ajustes.

---

## v2.5.8 · Endurecimiento de detección de partida en vivo

- **Inmunidad a desfase de reloj de Windows:** la validación de partida en curso ahora calibra la hora contra el encabezado `Date` del servidor, evitando que un reloj de PC desincronizado ignore la partida.
- **El temporizador de "Ocultar Overlay 20 segundos" ya no nace vencido tras pantallas de carga largas:** si la pantalla de carga del juego tarda más de 20 s antes de que la API reporte el inicio, la cuenta regresiva de 20 s arranca al detectar la partida en vez de ocultarla en el segundo 0.
- **Fallback rápido en redes con latencia:** si el snapshot global de matchmaking (~100 KB) demora, el carril rápido entrega directamente el evento `matched` del snapshot filtrado (~400 B) con todos los jugadores y reconecta sockets mudos a los 45 s.

---

## v2.5.7 · Licencia compartida en la misma PC y ajuste visual del logotipo

- **Licencia por PC (1 activación simultánea):** si tu PC ya tiene un plan activo, podés cambiar a cualquier cuenta de Steam/AoE2 en esa misma computadora sin bajar a Free.
- **Proporción más equilibrada del logotipo:** se ajustó un 10% el tamaño del logo de Relic en la barra lateral izquierda del Centro de mando.

---

## v2.5.6 · Detección real de la cuenta activa de Steam

- **Cambio de cuenta de Steam instantáneo:** al tocar **Detectar cuenta** (o al iniciar), Relic ahora lee directamente la sesión activa real de Steam en Windows (`ActiveUser` y `loginusers.vdf`) en lugar de quedarse pegado a la cuenta anterior que tuvo la última partida registrada. Funciona incluso con cuentas secundarias recién iniciadas.

---

## v2.5.5 · Pulido de textos y asistente inicial de Relic

- **Etiqueta más clara en Prematch:** la opción de ocultado automático ahora dice **"Ocultar Overlay 20 segundos"** (actualizada en los 4 idiomas: español, inglés y chino).
- **Asistente inicial e instalador 100% unificados con el nuevo logo geométrico de Relic:** se incorporó el logotipo horizontal en el asistente inicial, se fijaron los íconos explícitos de instalador/desinstalador NSIS y se eliminaron restos del logotipo anterior.

---

## v2.5.4 · Nuevo logotipo geométrico oficial de Relic

- **Nuevo logotipo y símbolo `R` de Relic:** integrado en el Centro de mando, barra de ventana, ícono de aplicación (`.ico`), bandeja del sistema, asistente inicial e instalador Windows NSIS.

---

## v2.5.3 · Nueva identidad oficial: Relic

- **Identidad unificada bajo la marca Relic:** nuevo logotipo horizontal dorado en el Centro de mando, medallón circular oficial como ícono de aplicación (`.ico`, bandeja del sistema, barra de ventana y asistente inicial), instalador `Relic Setup` y accesos directos unificados.
- **Compatibilidad total al actualizar:** mantiene intactos tu perfil, configuración, idioma e historial de partidas al actualizar desde versiones anteriores.

---

## v2.5.2 · Traducción integral 100%, acústica háptica premium y cierre total de claves antiguas

- **Traducción completa 100% en toda la aplicación (`English`, `Español España`, `Español México` y `简体中文`):** todas las 7 pestañas del Centro de mando (**Cuenta**, **Prematch**, **Durante**, **Postmatch**, **Apariencia**, **Plan y acceso**, **Actualizaciones**), tarjetas de planes, modales, textos dinámicos, estados del actualizador y el **Overlay HUD** en vivo ahora cambian de idioma al instante sin restos sin traducir.
- **Sonidos táctiles premium rediseñados:** se reemplazó el tono grave de las pestañas por micro-impulsos hápticos filtrados ultra sutiles y cálidos, a volumen muy discreto.
- **Control estricto de claves antiguas al activar el modo de pago global:** cuando el servidor activa el control de pago global, las claves temporales compartidas de prueba quedan desactivadas automáticamente y solo conservan acceso las cuentas habilitadas en la base remota.

---

## v2.5.1 · Multi-idioma oficial de AoE2 DE, asistente inicial, seguridad de licencias y pulido integral

- **Multi-idioma oficial de Age of Empires II: DE (`English`, `Español España`, `Español México` y `简体中文`):** 256 unidades, 40 edificios, 62 civilizaciones, 44 mapas, edades y recursos sincronizados con los archivos oficiales del juego (respetando diferencias reales como *Knight / Caballero / Jinete / 骑士*).
- **Asistente de primer inicio unificado (pantalla completa):** selección de idioma con banderitas SVG nítidas y detección rápida de cuenta con la misma estética cartográfica del Launcher; cambiable en cualquier momento desde la tuerquita compacta debajo de tu plan.
- **Control seguro de licencias y cuentas de pago:** verificación remota cifrada con firmas **Ed25519**, vinculación por dispositivo (`max_devices`), registro automático de cuentas activas, endurecimiento de seguridad en producción (`sandbox`, sin DevTools ni navegaciones externas) y consola de administración privada fuera del instalador público.
- **Pulido estético, espaciado y micro-sonidos táctiles:** escala unificada de tipografía, márgenes y aire (incluyendo la pestaña **Durante**), desplegables oscuros personalizados, mejor contraste de etiquetas sobre ilustraciones y sonidos minimalistas sutiles con opción de silenciarlos en 1 clic.
- **Instalador Windows (NSIS) con identidad del Launcher:** arte cartográfico lateral y cabecera con el emblema dorado y selector de los 4 idiomas.

---

## v2.3.1 · Nueva identidad visual

- Cada pestaña del launcher y cada fase del overlay tiene una composición propia con el mismo estilo cartográfico.
- La cuenta activa tiene una cabecera de perfil, con iniciales, alias, ID y origen de la cuenta.
- Los cuadros de apertura de Prematch y Postmatch muestran un fondo que corresponde al tipo de apertura.
- Encabezados, filas y controles tienen más espacio interior y separadores más suaves.

---

## v2.3.0 · Prematch predictivo y Postmatch entrenador en tiempo real

- **Prematch predictivo renovado:** clasificación por entropía del pool del rival (`Especialista`, `Foco` o `Random`), predicción Top-3 ponderada por mapa y recencia, perfil de eAPM frente a rivales reales, debilidades ajustadas por diferencia de ELO y tira editorial de telemetría (Perfil · Ladder · Racha · Mecánica).
- **Motor local instantáneo de Postmatch (`savegame\`):** analiza automáticamente el `.aoe2record` recién guardado en tu PC en menos de un segundo antes de caer a la descarga de Microsoft, sin abrir el juego ni instalar nada extra.
- **Tarjeta única unificada de Postmatch con jerarquía visual limpia e iconografía SVG centrada:**
  - **Reto activo entre partidas:** evalúa automáticamente el foco de tu partida anterior y destaca arriba cuando lo cumplís (`★ RETO CUMPLIDO`).
  - **Apertura detectada + 4 Edades calificadas (`S · A · B · C · D`):** califica **Alta Edad**, **Feudal**, **Castillos** e **Imperial** (sin castigar TC inactivo en Imperial por tope de 200 pop) con selector de referencia en **Ajustes → Postmatch** (**Personal + Estándar ELO**, **Solo tu historial** o **Solo estándar por ELO**).
  - **Evolución personal vs tus propias partidas:** sparklines y deltas (`▲ / ▼`) de Uso de TC, TC inactivo separado en **Alta Edad / Feudal / Total**, Aldeanos/min y eAPM contra tus últimas 12 partidas del modo.
  - **Duelo cara a cara con escudos de civilización**, **Colas y edificios militares** (detecta saturación de establos/arquerías y estima edificios faltantes), **Mercado decodificado por recurso** (comida/madera/piedra), **Mayor bache exacto de TC** con minuto y causa, **Micro de combate (`%` Attack-Move/Patrol)** y **Ciclo de retorno al TC**.

Verificación: 14/14 suites deterministas en verde (`npm test`), CSP estricta sin estilos inline y validación visual en Electron sobre replays locales reales.

---

## v2.2.4 · Espaciado y tipografía consistentes

- La grilla, los márgenes, las esquinas y la escala de texto comparten medidas entre overlay y launcher.
- Los escudos grandes se mantienen arriba del prematch. La civ actual del rival se muestra cuando se revela.
- Se consolidaron los estilos de la carga del replay, las tarjetas de lectura y el episodio postmatch.

---

## v2.2.3 · Escudos del historial a primera vista

- El prematch muestra arriba los escudos grandes de las civs más jugadas por el rival en el mapa, con su recuento y muestra.
- La civ actual del rival sigue oculta hasta que se revela. Los escudos del historial representan partidas observadas.
- Incluye el launcher, la animación de carga y la revisión del replay de v2.2.1.

---

## v2.2.2 · Prematch antes de revelar civilizaciones

- El roster oculta la civ rival durante el lobby. En modo ejemplo tampoco se anticipan las civs del resultado archivado.
- En el prematch, las aperturas se resumen sobre el historial del mapa y el modo. Los cruces exactos requieren civilizaciones reveladas.
- Incluye el launcher y la animación de carga de v2.2.1.

---

## v2.2.1 · Lectura del rival y revisión del replay

- Prematch con apertura observada, últimas cinco partidas y antecedentes con denominadores explícitos. Las civs frecuentes del historial se presentan como elecciones observadas.
- Postmatch con un episodio compartido para revisar qué encargó cada jugador al mismo minuto. Las llegadas a las edades se muestran cuando el replay las confirma.
- Launcher con navegación más legible y acceso directo a la cuenta. Descarga y análisis tienen una animación de carga que respeta movimiento reducido.
- Benchmark temporal reproducible de 332.408 predicciones de civ. Los porcentajes del modelo quedan pendientes de calibración y verificación en vivo.

---

## v2.2.0 · Asistencia visual automática y evolución personal

- **Free, Pro y ProMax.** Free conserva exclusivamente nombre del rival, ELO actual y cara a cara. Pro suma roster ampliado, perfil del mapa, guía de civ, balance y resumen de resultados. ProMax añade oportunidades, aperturas, elección de civ, replay, evolución personal y Smart Build Order.
- **Oportunidades automáticas.** El cruce utiliza 56 árboles tecnológicos y el historial compatible del mapa, ajustado por contexto, recencia y tamaño de muestra. Presenta rutas condicionales para Feudal, Castillos e Imperial. El índice expresa prioridad experimental, no probabilidad de ganar, y no presume conocer el ejército o la edad actuales.
- **Smart Build Order.** Toggle de ProMax configurado antes de buscar partida. Cinco referencias con iconos de aldeanos, recursos y edificios: Scouts, M@A → Arqueros, Arqueros, FC y FI. La sugerencia se adapta a civ/mapa y se abstiene en contextos no revisados. FI se sugiere solo en la variante revisada de Turcos en Arena.
- **Overlay solo visual.** Deja pasar los clics; no requiere selectores, F2 ni pasos manuales. Las oportunidades y la guía permanecen visibles aunque se oculte el ELO. El postmatch se retira automáticamente y queda disponible en el launcher.
- **Ejecución económica S–D.** Notas personales por etapa cuando existen al menos dos indicadores económicos medidos y cinco referencias compatibles. Los destacados comparan con tu propio historial y distinguen mejoras de empates. Micro y decisiones permanecen sin nota cuando falta evidencia.
- **Combate por edad con evidencia.** Motor y tabla para aldeanos y militares eliminados/perdidos, cobertura parcial, costes nominales y logros como Serial Killer. Necesita eventos ya medidos; el parser automático todavía no los extrae.
- **Datos y accesos corregidos.** La primera orden de avance se distingue de la llegada confirmada a una edad. Se migran los registros anteriores conocidos. El vencimiento y el cambio de perfil retiran los datos sin permiso de las pantallas, conservando preferencias.

**Límites de esta versión:** la guía no reconoce pasos completados en vivo. Sigue pendiente el lector automático de estado para bajas, economía y Boom Master. No hay base poblacional para afirmar «mejor que X % de usuarios». El parser actual aporta órdenes, apertura inferida y APM. El backend comercial y la validación visual/partidas en Windows no se realizaron en este bloque.

Verificación: diez suites offline aprobadas desde una copia limpia del commit de implementación y revisión de sintaxis. La publicación incorpora `npm test` como requisito antes del build Windows; el instalador y `latest.yml` solo estarán disponibles cuando ese workflow termine correctamente.

---

## v2.1.1 · El informe postmatch se cierra

- **Ya no queda fijo.** El informe tiene una **X** arriba a la derecha y se cierra sola a los 60 segundos de terminar el análisis (o a los 3 minutos si la descarga se queda esperando).
- **Se puede clickear.** Mientras el informe está abierto, el overlay recibe mouse solo para esa tarjeta; al cerrarlo vuelve inmediatamente a ser click-through y no le roba clicks al juego.
- **No reaparece encima de la partida siguiente.** Al empezar otra partida se oculta, y el próximo resultado abre un informe nuevo.
- **El último informe no se pierde.** Cerrar la tarjeta no borra el resultado: sigue disponible en **Ajustes → Postmatch**, desde donde se puede actualizar.

Verificación: captura del informe real de `#521076025` con la X visible, cierre por IPC y retorno al modo click-through, tests de postmatch/producto/contexto/prematch/selftest y empaquetado Windows.

---

## v2.1.0 · Postmatch automático: descarga y analiza el replay solo

- **El análisis dejó de ser manual.** Al terminar una partida que la app vio en vivo, el overlay vuelve y muestra **“Descargando partida”** → **“Analizando partida”** → resultados. No hay que buscar el `.aoe2record` ni importar un JSON.
- **Descarga real desde Microsoft.** Se pide el replay con el `matchId` y tu `profileId`, se valida que sea un ZIP, se extrae únicamente el `.aoe2record` a un temporal y se borra al terminar. Si Microsoft todavía no lo publicó, el resultado queda visible y el error se informa sin inventar métricas.
- **Lectura local del replay.** El parser WASM de `aoe2rec-js` calcula apertura, llegada a Feudal/Castillos, duración y APM. La clasificación de apertura replica las reglas de `aoe2-openings`. Se agregó `src/replay.js` y `src/replay-analysis.js`.
- **Resultados medidos, no inventados.** Las etapas muestran el dato directo del replay (“Scouts”, “6:20”, “19:23”) sin asignar notas A–E cuando falta la muestra económica. El eAPM queda **“No disponible”**: este replay no expone una medición efectiva y no se rellena con APM.
- **Sin romper la UI.** Se reutilizan las tarjetas `review-*` existentes; solo se suma una barra de estado y el estado medido por etapa. La comparación por mapa aparece como “Cargando referencia” mientras llega el historial, en vez de mostrar una primera referencia falsa.
- **Free y preferencias respetadas.** El resumen postmatch sigue siendo Free; la descarga y el análisis del replay solo se ejecutan si la función Pro está habilitada y la preferencia está encendida. El bloque de importación manual salió de Ajustes.
- **Empaquetado.** `aoe2rec-js` se desempaqueta del asar para que el parser funcione dentro del `.exe`; se verificó el build `--win --dir` con la partida real `#521076025`.

Verificación: descarga y análisis reales de `#521076025` (Cristov vs DejNePoki13, Arabia, RM 1v1): Scout rush, Feudal 6:20, Castillos 19:23, APM 41,7, +18 ELO. `postmatch-test`, `product-test`, `contextual-advice-test`, `prematch-regression` y `selftest` en verde; `node --check`; `npm run pack` y arranque del build empaquetado confirmando `replay listo (Scout Rush)`. No se publicó una partida en vivo de principio a fin: el flujo visual se capturó con el modo ejemplo sobre la misma partida real y el mismo parser de producción.

---

## v2.0.1 · Icono nuevo y acceso Pro por clave

- **Icono de la app corregido.** El ejecutable, la barra de tareas, la bandeja y las notificaciones ahora usan el emblema de doble H nuevo. Antes se generaban desde un arte anterior, aunque la interfaz ya mostrara el logo nuevo.
- **Acceso Pro temporal.** En **Plan y acceso** hay un campo para ingresar una clave compartida. La clave se valida en el proceso principal, no en la interfaz, y solo se guarda su hash en la configuración. Al activarla, el plan pasa a Pro con `subscriptionVerified: false` y las funciones Pro quedan disponibles según las preferencias de cada usuario.
- **No es una suscripción.** Este acceso no tiene cuentas, cobro ni revocación online. Es una medida de transición para probar el producto completo; se puede retirar en una versión futura sin borrar las preferencias guardadas.
- **Alcance honesto.** Las funciones Pro siguen dependiendo de que existan datos: replays, historial propio, muestra suficiente o telemetría importada. La clave habilita la función, no inventa resultados.

Verificación: activación con clave válida e inválida desde la interfaz real de Electron, persistencia después de reiniciar, tests de producto/selftest y empaquetado Windows con el icono nuevo dentro del ejecutable.

---

## v2.0.0 · Centro de mando, postmatch y acceso Free/Pro

Esta es una actualización mayor: cambia la configuración, suma el ciclo completo de preparación y revisión, y ordena el producto en Free y Pro.

- **Nuevo Centro de mando.** La configuración pasa a tener navegación por Cuenta, Prematch, Postmatch, Apariencia, Plan y acceso y Actualizaciones, con una identidad visual nueva y el emblema de doble H.
- **Postmatch real.** Cuando termina una partida que la app vio en vivo, el overlay vuelve con el resultado confirmado, la duración y la comparación por mapa y modo. Una partida histórica no dispara el informe al arrancar.
- **Comparación honesta.** Solo se comparan partidas anteriores del mismo perfil, mapa y modo; los resultados desconocidos no cuentan como derrotas y la muestra se declara. Sin telemetría de replay no se inventan APM ni notas por etapa.
- **Free y Pro.** Free incluye ELO y roster, historial del rival, guía de civilización, balance de equipos, F2 y resumen postmatch. Pro agrupa aperturas, plan contextual, cara a cara, elección de civilización, comparación postmatch y rendimiento por etapa. Sin backend, checkout ni credenciales configuradas, la app queda en Free y la sección Plan lo informa.
- **Acceso resuelto en el proceso principal.** Las preferencias Pro se conservan, pero la vista y los handlers usan el plan resuelto por el main. El renderer no puede habilitarse funciones por sí solo.
- **Importación de telemetría compatible.** Se valida un JSON contra la partida y el perfil antes de asociarlo. El análisis directo de `.aoe2record` todavía no está integrado, así que no se promete.
- **Escudos junto a cada civilización.** Los nombres del prematch, recomendaciones, historial y postmatch muestran su badge pequeño sin cambiar el espaciado ni la jerarquía del diseño.
- **Actualización mayor.** El updater detecta 2.0.0, descarga el paquete y lo instala al salir; nunca durante una partida.

Verificación: tests de producto, postmatch y consejo contextual; selftest completo; regresión prematch; `node --check`; empaquetado `--win --dir` y capturas de Electron con datos reales. La sección Pro queda como catálogo y control de acceso: esta versión no incluye un servicio de cobro ni un backend de licencias.

---

## v0.1.26 · Prematch más rápido, datos más honestos y F2 opcional

- **Menos 429 y menos espera.** Una cola coordina las consultas de historial, comparte las que ya están en vuelo y guarda los replays analizados en una caché persistente. El scouting muestra primero una muestra rápida y completa el análisis en segundo plano.
- **Datos que no se inventan.** En TG no se muestran rivales si los equipos no están confirmados; los resultados desconocidos no cuentan como derrotas; el modo no se adivina por la cantidad de jugadores. Las tarjetas declaran la muestra y evitan etiquetas como «POSIBLE SMURF» o «Jugá X».
- **F2 es opcional.** El informe completo es la vista por defecto y F2 queda libre para Windows. «Resumen con F2» se activa en Ajustes; si la tecla ya está ocupada, la opción no se activa y se avisa.
- **El mapa declara su muestra.** Para responder antes de que empiece la partida, el historial del mapa se limita a una muestra reciente acotada (hasta 500 partidas totales). La tarjeta indica cuántas se analizaron y no lo presenta como historial completo.
- **Más pruebas.** Se agregan pruebas deterministas del contrato del prematch, además del selftest existente.

---

## v0.1.25 · El "0 %" del pick de civ: una sola fuente de verdad

Reporte del usuario: *"analiza 4000 partidas y dice 0 % cuando muestra la civ que jugó en ese mapa"*. No era cosmético: el porcentaje de la civ del rival se calculaba dividiendo **dos fuentes distintas** — `mapStats.civ.games` (las partidas del mapa que se leyeron del historial) sobre `mapStats.games` (el total histórico que declara `/stats`). Medido en vivo: un rival con 1748 partidas de Arabia y 32 de Huns publicaba `2 %` (0 % en casos peores). Peor aún: mientras cargaban los datos, el informe **parcial** usaba el sample leído y el **final** el total de `/stats`, así que el número cambiaba solo delante del usuario.

- **Numerador y denominador de la MISMA fuente.** `scoutPickHero()` es ahora la única función que produce el pick de civ, y su porcentaje es siempre `civ.games / sampleGames` — las partidas del mapa que realmente se leyeron. Nunca se mezcla con el total de `/stats`.
- **Umbral de dominancia.** Con menos de 5 partidas o menos del 30 % del sample, no existe una apuesta posible: la tarjeta dice **«Sin civ dominante acá»** (*«juega de todo · Britons es su más usada: 51 de 1748 acá»*). Decir «Suele jugar X 3 %» era una etiqueta que se contradecía sola: nadie «suele jugar» algo que elige el 3 % de las veces.
- **El sample parcial se declara.** Si se leyeron menos partidas de las que declara `/stats`, la línea dice **«últimas N»** (*«en 28 de sus últimas 40 partidas acá»*): el historial se recorre de la más nueva a la más vieja, así que es una ventana reciente — decirlo es gratis y es verdad.
- **Una sola implementación.** La tira del detalle (`rivalPredStrip`), el hero de la tarjeta compacta sin replays (`scoutHero`) y el fallback usan la misma función; antes había dos copias del cálculo (una de ellas era la del bug).
- **El número hereda la cascada de honestidad.** El valor viene de `tacBig()`: porcentaje solo con `n >= 20`; con 5–19 la fracción `8/11`; con menos, nada.
- **Verificación.** Repro en vivo del bug (perfil real, Arabia, RM 1v1: 1748 partidas, civ top 51 → antes «Suele jugar Britons 3 %», ahora «Sin civ dominante acá») y repro de los tres comportamientos en el selftest (`TODO OK`, con `renderer.js` ejecutándose en un VM con DOM stub): mezcla de fuentes, dominancia publicada sobre el sample, y sample parcial declarado como «últimas». Datos de ejemplo con dos `mapStats` distintos (uno dominante, uno sin dominancia) para que una captura de TG muestre los dos estados.
- Queda igual pendiente lo declarado en v0.1.24 (heurístico de smurf débil, `Fast castle` como proxy de boom, «le duele» sin filtrar por aperturas ejecutables, flank/pocket en TG, `map_openness`).

---

## v0.1.24 · Una sola tarjeta de scouting (y F2 para ver todo)

La versión anterior **sumaba** señales tácticas encima del informe que ya existía: dos secciones, dos cabeceras, el nombre del rival repetido, dos números hero compitiendo (`17 %` y `74 %`) y unas diez cifras para una ventana de ~10 s de lectura real. Esta versión **reemplaza** en vez de sumar.

- **Una sección, una tarjeta por rival.** `#rivalInfo` y `#scoutInfo` se unifican en `#scouting`: los dos payloads (`overlay:rival` y `overlay:scout`) se cruzan por `profileId`, así que un rival aparece **una sola vez**. En TG, de ocho tarjetas con dos cabeceras se pasa a dos tarjetas y una cabecera.
- **Jerarquía estricta de cinco elementos.** Escudo grande + nombre → **UN** número dominante (`74 % Agresivo en Feudal` o `68 % Boomea / Fast Castle`) → una barra de reparto agresivo/boom → **UNA** acción concreta (`Jugá arqueros` · `Jugá MAA`) con su evidencia (`8/11`, con leyenda «derrotas / partidas») → una línea de proveniencia al pie de la sección. Nada más en pantalla.
- **F2 = detalle.** El informe completo (civ del mapa, cara a cara, últimas 5, civ recomendada, los tres tiles tácticos) sigue existiendo, pero ahora está detrás de `F2`, con el estado en el proceso principal para sobrevivir a una recarga del renderer. Las dos vistas son **excluyentes**: nunca se dibujan las tres secciones a la vez. El chip `F2 · Ver todo` / `F2 · Resumen` es solo informativo, porque el overlay es click-through.
- **La acción es una orden, no un dato.** `strategy_opponent` se traduce a qué producir: `Archer rush → Jugá arqueros`, `Man at arms rush → Jugá MAA`, `Scout rush → Jugá scouts`. Si no hay evidencia, la tarjeta dice «Sin punto débil claro» en vez de inventar un consejo.
- **El panel por fin entra sin escalar.** En TG el modo compacto mide **587 px** contra los **1156 px** del detalle: la mitad de alto, sin recortes y sin reducir tipografía. Además se corrigió el desborde histórico del detalle: `fitStage()` escalaba hasta el máximo exacto, pero `reportHeight()` sumaba 8 px de aire después, y esos 8 px cortaban la última fila (1164 px pedidos / 1155 disponibles). Ahora el escalado reserva ese margen y el redondeo subpíxel.
- **Honestidad intacta.** Se conservan `MIXTO` cuando no hay dominancia del 60 %, porcentaje solo con `n >= 20` (si no, fracción `8/11`), el umbral de ritmo (gap ≥ 15 pp y ≥ 8 partidas en ambos extremos) y la declaración de cuándo el estilo se tomó de todo el modo por faltar replays del mapa. La leyenda de muestra chica ahora se dispara **solo** por datos que esta vista realmente muestra.
- **Sin redundancia.** El mapa y el modo ya están en la cabecera del ELO y en la de la sección: se sacaron del pie y del contexto de cada tarjeta. En dos columnas el badge de smurf va dentro de la línea de contexto (primero, para que nunca lo corte el ellipsis) en vez de a la derecha, donde recortaba «Rival Dos» a «Ri…».
- **Sin requests nuevas.** Todo sale de lo que el overlay ya descarga y cachea. La barra respeta el CSP (`style-src 'self'`): sus anchos se aplican por CSSOM con `data-w`, nunca con `style=` inline.
- **Verificación.** `node --check` en los cuatro JS, `TODO OK` en el selftest (con 6 comprobaciones estáticas nuevas y **9 comportamientos reales** ejecutando `renderer.js` en un VM con DOM stub: 74 %/barra 74-26, 68 % verde, `MIXTO` con reparto, fracción con n<20, fallback al pick de civ, traducción de la apertura a acción, ausencia de consejo inventado, umbrales de ritmo y unión de payloads sin duplicar tarjetas). Capturas reales de Electron en 1v1 y TG, modo compacto y detalle, en tema `fantasma` y en el tema claro `claro` para validar contraste. Los datos de ejemplo ahora tienen **dos perfiles distintos**, para que una captura de TG no muestre dos tarjetas idénticas.
- **Sigue pendiente (no se disfraza de resuelto):** el smurf es un heurístico débil (`peak − rating ≥ 300` confunde una cuenta alternativa con alguien que volvió y decayó); `Fast castle` no es literalmente «boomear»; «le duele» no se filtra por aperturas que tu civ pueda ejecutar; en TG no se distingue flank de pocket; y el estilo no se estratifica por `map_openness`. Todo eso necesita más muestra o una consulta nueva.

---

## v0.1.23 · Señales tácticas en la pre-partida

La pre-partida deja de contar cosas del rival y pasa a responder tres preguntas que cambian una decisión **dentro** de la partida: ¿viene agresivo o boomea?, ¿qué le duele?, ¿alargo o cierro temprano?

- **Tres señales con números grandes y sin texto apilado.** `ESTILO` (distribución agresivo / boom con su barra y su muestra), `LE DUELE` (la apertura que le gana, con la fracción de derrotas) y `CERRÁ TEMPRANO` / `ALARGÁ LA PARTIDA` (su winrate en el tramo que te conviene forzar). Rojo = amenaza a preparar, verde = ventaja explotable.
- **Coste cero.** Todo sale de columnas que el overlay ya descargó y cacheó (`strategy`, `strategy_opponent`, `match_duration`): ni una request nueva, ni un endpoint nuevo, ni parseo de replays. `tempoProfile()` ya se calculaba y nunca se había pintado; `openingsAgainst()` estaba escondido en una línea chica.
- **Racha: fuera. Smurf: dentro.** La racha no cambia ninguna decisión y no aparece. En su lugar, `POSIBLE SMURF` con el pico histórico de ELO cuando está muy por encima del ELO actual. Se construye con `peak` / `rating`, que ya viajan en el roster: es una etiqueta con su evidencia, no un porcentaje con decimales que aparente precisión.
- **Honestidad de muestra más estricta.** Porcentaje solo con `n >= 20`; con 5–19 se publica la fracción `8/11` y con `n < 5` ningún número. «Le duele» ahora exige perder **más de la mitad** (un 39 % de derrotas era exactamente lo contrario de un consejo). El consejo de ritmo exige un diferencial de 15 pp y al menos 8 partidas en **ambos** extremos.
- **Sin falsas certezas.** Si el reparto de aperturas no tiene una dominancia del 60 %, se declara `MIXTO` y se muestra el reparto (`25:9`) en vez de colapsarlo en una etiqueta. Se declara también cuántos `Drush → FC` quedaron fuera por ser híbridos y si el dato viene del mapa o de todo el modo.
- **Menos redundancia.** Con las recomendaciones activas ya no se repite «Arranca con Scouts…» en el informe: la distribución responde mejor y con más muestra. Las fracciones llevan leyenda «derrotas / partidas» para que `8/11` no se lea como victorias.
- **Sin datos inventados.** Se descartaron `linkedProfiles` y `maxRating` (no documentados en la API de AoE2 Companion) y una etiqueta `Fast Imperial` que no existe en el endpoint: el boom se mide con `Fast castle` + duración de partida.
- Selftest: 8 comprobaciones nuevas sobre la distribución, los umbrales de muestra, la ausencia de racha y el smurf.

---

## v0.1.22 · El informe del rival, en palabras

El informe deja de ser un tablero de números: cada cifra ahora se lee como una frase, siempre con su muestra real.

- **«Si tuvieras que apostar»**, arriba de cada rival: las dos cosas que más sirven para preparar la partida en dos líneas — la civ que más usa **en este mapa** con su cuota real (*«Koreans en 67 % de sus 18 partidas acá»*) y cómo arranca (*«Arranca con FC en 1 de 1 replay acá»*).
- **Cada número con su denominador.** Ya no hay un `45 %` suelto: dice *«gana 29 de sus 65 partidas»*. La civ del mapa se explica igual: *«la eligió en 20 de sus 65 partidas (31 %)»*, que es la probabilidad de que la repita.
- **Aperturas con la muestra completa.** Se consultaba solo la ventana de las 120 partidas más recientes de todos los mapas, así que un mapa jugado hace dos meses aparecía como *«sin replays»* y la muestra quedaba a la mitad (medido: 18 replays en 9 mapas → 60 replays en 16 mapas con el historial completo). Ahora se pide todo el historial del modo.
- **Esa consulta ya no frena el panel.** Con el historial completo tarda ~20 s la primera vez de cada rival (después ~70 ms por la cache): el informe se publica igual a los ~6 s sin aperturas y la tarjeta se completa sola cuando llegan. Antes el informe **esperaba** esa consulta.
- **Muestra chica, dicha.** Con 1 a 4 replays el bloque avisa *«Muestra chica: es una pista, no una tendencia»* en vez de mostrar un `100 %` que parece certeza.
- **Arreglado: el panel se recortaba abajo.** El contenido pedía 1209 px y el monitor dejaba 1155, así que la última tarjeta se cortaba sin aviso (no hay scroll). Ahora el renderer conoce el alto disponible y se ajusta lo mínimo necesario; además el espaciado se compactó sin apretar el texto.
- **Arreglado: las aperturas se daban por perdidas en frío.** El cliente reintentaba 6 veces cada 3 s y se rendía a los 15 s, cuando la consulta completa tarda ~20 s. Ahora el presupuesto cubre el cálculo real.
- **Arreglado: «MAPAS CLOSED».** El tipo de mapa (`map_openness`) se mostraba en inglés y se leía como el nombre de un mapa. Ahora dice *«en mapas cerrados»*, *«abiertos»* o *«semiabiertos»*.
- **Diseño coherente con el resto del panel.** Una sola caja por sección (antes había cajas dentro de cajas), los dos rivales son dos columnas de texto separadas por la misma línea que separa los equipos en el roster, y abajo se usa la misma escala que arriba: nombres a 1 rem, números grandes al tamaño del ELO, etiquetas al tamaño del badge «VOS» y todo el texto explicativo a un único tamaño. Los escudos de «así jugó sus últimas 5» ya no viven en recuadros.
- **Arreglado: «1 replays»** y los porcentajes que se partían de línea (`46` / `% de 13 partidas`).

---

## v0.1.21 · Estabilidad del panel

- Visibilidad centralizada (`applyVisibility()`) y una sola medición de alto por frame: los bloques ya no se quedan abiertos por su cuenta ni la ventana salta de tamaño mientras se acomoda.
- Anti-parpadeo en la pre-partida: un `idle` momentáneo del REST ya no borra la partida que está en pantalla (se sostiene 3 minutos o hasta que el servidor marque el fin).
- Pre-partida a prueba de fallos: rivales en paralelo, reintento acotado del informe y tope de tiempo para recorrer el historial.

---

## v0.1.20 · Recomendaciones legibles

- Bloque de recomendaciones reordenado: etiqueta arriba, chips con escudo y filas de dos columnas (VOS / LE CUESTA) en vez de frases corridas.
- Apertura del rival atada al `matchId`: el consejo de un rival ya no aparece en la partida siguiente.

---

## v0.1.19 · La mediana, los encuentros y la cascada

Tres mejoras sobre lo que llegó en v0.1.18, todas sobre datos que ya estaban en memoria:

- **Balance de TG por MEDIANA, no promedio.** Un smurf 2000 entre tres 1200 daba «parejo» con el promedio (1412 vs 1419) y la mediana lo muestra como es: `Tu equipo 1171 (de 1083 a 1982) · Rival 1433 · arrancás 262 abajo`. El rango del equipo se declara solo cuando está muy disperso (≥200 de diferencia) — escondido, el número mentía.
- **Cara a cara: los últimos 3 enfrentamientos, no solo el V-D.** Debajo de las tarjetas aparecen los chips (escudo de la civ con la que jugaste + V/D), con el detalle completo en el tooltip (`Vos con Franks · V · Runestones`). Y dos honestidades nuevas: el color verde/rojo del V-D se fía **solo con 3 o más partidas** (un 1-0 no es "ganás la serie"), y cuando no hay enfrentamientos el panel dice **dónde se buscó** — «Sin enfrentamientos en tus últimas 612 partidas del modo» — en vez de un "nunca jugaron" que puede ser una media verdad.
- **Civ recomendada con cascada de alcance.** Si una civ no llega a las 3 partidas en el mapa exacto, la recomendación cae al **modo completo** para esa civ — y la línea lo declara: `2. Teutons · vos 67% (6 pj · todo el modo) · le cuesta 57% (7 pj)`. Un 3-0 de suerte en el mapa ya no se disfraza de winrate del mapa.

---

## v0.1.18 · Cara a cara, balance de TG y civ recomendada

Tres opciones nuevas, todas **apagadas de fábrica** y pensadas para una sola cosa: **plantarse mejor ante el rival**.

- **Enfrentamientos previos** (*Ajustes → Overlay → Datos del rival*): tu V-D contra este rival, del **propio historial** y del **mismo modo de juego**. En la tarjeta del rival aparece como tile: **CARA A CARA 1-2** (rojo si perdés la serie, verde si ganás) con el contexto chico debajo (*3 partidas · última en Arabia*). Solo cuentan los enfrentamientos: las veces que jugaron **como aliados** van en su propia tarjeta (*COMO ALIADOS 5*) y no ensucian el V-D. Si nunca se cruzaron, lo dice — «Nunca se enfrentaron en este modo» — en vez de mostrar ceros.
- **Civ recomendada** (*Datos del rival*, pre-partida): contra este rival, en este mapa, **qué civ jugársele**. Cruza dos datos reales: lo que el rival **pierde** según sus replays analizados y **tu winrate con cada civ en ese mapa**. Score 60 % tuyo + 40 % del rival; cada línea muestra sus dos evidencias — «1. Gurjaras · vos 67 % (9 pj) · le cuesta 80 % (5 pj)» — y **ninguna se muestra sin muestra suficiente** (3 partidas mínimo en cada dimensión). Vive en la tarjeta de *Recomendaciones*, desaparece al arrancar la partida y en custom/unranked no consulta nada en vez de mezclar modos.
- **Balance de equipos** (*Ajustes → Overlay → Balance*): en team games, una línea tenue debajo del título con el **promedio de ELO RM 1v1 de cada equipo** — «⚖ Tu equipo 1412 · Rival 1419 · arrancás 7 abajo». No consulta nada (es el roster que ya está en pantalla); exige dos equipos con 2 ELOs por lado y avisa *parcial* si falta alguien. Se oculta con el panel al tiempo elegido.
- **Arreglado: el panel se cortaba por abajo y la mitad de las tarjetas no se veía.** La ventana tenía un techo fijo de 640 px de alto, herencia de cuando el panel era solo el roster. Con el informe del rival, las recomendaciones y el balance, el contenido legítimo mide más y lo que pasaba del techo se recortaba **e invisible** (no hay scroll: era un bug en pantalla, no solo en capturas). Ahora el alto de la ventana sigue al contenido con un techo **adaptativo al monitor** (área de trabajo menos el margen superior).
- La barrita de análisis suma una etapa honesta: *Buscando enfrentamientos previos…* mientras llega tu historial. La consulta se **comparte** con la civ recomendada y queda en cache **30 minutos** — habilitar las dos opciones no duplica nada.
- En el **Modo ejemplo** («Ver test») "vos" es el perfil del ejemplo (misma regla que `isYou`): las tarjetas de cara a cara y la civ recomendada muestran cómo se vería esa partida real.
- Selftest: sección nueva con 25 chequeos offline del historial propio, el conteo de aliados/rivales y el scoring de la recomendación.

---

## v0.1.17 · Iconos, jerarquía de dato y dos bugs de partida

- **Iconos en todo el panel** (SVG inline: ni archivos nuevos ni peticiones, heredan el color de cada tema): escudo en *Ayuda de civ*, espadas en *Informe del rival*, foco en *Recomendaciones*, y ★ BONOS / ⚑ UNIDADES / ⚠ DEBILIDADES en cada civil. El pico del jugador pasó de la palabra «pico» a una flecha ↑.
- **El informe del rival se lee sin leerlo**: dos tarjetas de dato con el número grande (*33 %* en rojo si le va mal, verde si le va bien) y el contexto chico debajo (*9 partidas · 3-6 · le va mal*). Antes era una frase corrida que había que leer completa.
- **Fuera el texto de relleno**: ya no se muestran las fuentes de datos (*AoE2 Companion · AoE2Insights*), ni el modo repetido en la cabecera cuando el tag ya dice *ELO RM 1v1*, ni *APERTURA EN ESTE MAPA* / *ÚLTIMAS 5 CIVS* / *ÚLTIMAS DE ESA CIV*. Los bloques sin datos dejan de tener título.
- **Arreglado: la tarjeta de civ se volvía a abrir a mitad de partida.** El reloj de la intro se identificaba por `matchId + startedAt`, y el REST a veces manda el mismo partido con otro `startedAt` (o sin él un poll), lo que creaba una intro nueva con el reloj en 0:00 y volvía a mostrar la tarjeta. Ahora el reloj pertenece al **partido** (`matchId`): cambia el `startedAt`, pasa por `lobby` o falta un poll y no se reinicia; al terminar la partida se suelta en el acto.
- **Arreglado: quedaba información vieja trabada al salir y volver a entrar.** El polling descartaba los snapshots *«sin partida»* durante 15 minutos después de aparearte, así que si el socket no avisaba el fin, el panel se quedaba con la partida anterior. Ahora, si el panel ya está mostrando una partida en curso, ese *«sin partida»* es el fin real. Además el informe del rival y las recomendaciones se borran **en el momento** en que cambia el partido, en vez de mostrar los del rival anterior mientras se consulta el nuevo.
- Ajustes de espaciado y alineación: las tarjetas de dato comparten la línea de la sub-etiqueta, la fila de escudos ya no queda pegada al borde inferior y la barrita de la cuenta regresiva es más fina y tenue.

---

## v0.1.16 · Barrita de análisis en el panel

- **Arreglado: la partida vuelve a aparecer al ENCONTRAR rival**, en la sala de espera, sin esperar a entrar al mapa. El carril rápido tenía dos fallas: (1) solo se aceleraba si te veía *buscando*, así que una cola que pasaba de `queueing` a `matched` entre dos pings (6 s) nunca entraba al modo rápido; y (2) se pausaba justo en el aviso «encontré rival», **antes** de que llegara el roster, dejando el panel a merced del lote empujado (~15 s) o directamente del inicio de la partida. Ahora pide el snapshot global en el acto cuando el ping filtrado ya te ve apareado, la pausa es recién con el roster en pantalla, y si la pausa quedara colgada se reactiva sola a los 20 s.
- El aviso «encontré rival» ya no puede ser tapado por el polling con *«Sin partida»* mientras se arma la pre-partida.

- **Una sola barrita de análisis** debajo del título: mientras el panel espera datos que se calculan en segundo plano muestra **qué está haciendo** (*Consultando ELO RM 1v1…*, *Buscando datos del rival…*, *Analizando replays…*, *Analizando replays del rival…*).
- **Sin barras por bloque**: los bloques pendientes solo cambian su texto. Una barra animada en cada bloque es ruido en un overlay que se mira de reojo.
- **Los bloques ya no dicen «sin historial» mientras cargan**: ahora dicen *«Buscando sus últimas civs…»* / *«Buscando su historial en este mapa…»*. Era información engañosa durante el análisis.
- **Informe del rival reescrito para leerse de un vistazo**: la conclusión va escrita (*«En Hideout le va mal: 33 % en 9 partidas (3-6)»*), cada número lleva su unidad y su récord, el modo deja de repetirse en cada bloque (está en la cabecera) y cuando no hay replays se avisa **una vez** — antes había dos avisos seguidos que parecían un error.
- **Se apaga sola** cuando no falta nada: en partida no queda nada animado tapando el juego. Respeta *reducir movimiento* (barra fija y tenue).
- El color sigue al tema activo (dorado en Clásico, blanco en Fantasma, etc.).

---

## v0.1.15 · La partida aparece al segundo + actualizaciones automáticas

- **La partida apareada se ve en ~1,5 s, no 15 s después.** El feed de matchmaking de AoE2 Companion **no empuja cada evento**: manda un lote cada ~15 s, así que esperar al socket hacía que el panel se dibujara cuando la partida ya estaba por empezar. Ahora el overlay pide **snapshots frescos a demanda**: sin cola consulta el socket **filtrado por tu perfil** (~300 B, cada 6 s) y, en cuanto detecta que estás buscando, pide el snapshot **global** con el roster del `matched` **cada 1,5 s**. Al aparearse se pausa solo.
- **El log mide la latencia real**: `el servidor la marcó hace 1400ms` / `servidor→pantalla 1900ms`, usando el `matchedAt` que publica el servidor.
- **El ELO ya no se queda en `…`.** Si el backend de World's Edge falla justo cuando aparece la partida, se reintenta a los 1,5 s (hasta 3 veces) y la request tiene timeout de 7 s con un reintento inmediato. Antes, un solo fallo dejaba la columna en `…` hasta el inicio de la partida.
- **Nueva opción «Actualizaciones automáticas»** en la pestaña **Updater** (apagada de fábrica): consulta cada **30 minutos** y, si hay una versión nueva, la **descarga e instala sola** en silencio. Nunca en media partida: si estás jugando, se aplica al terminar. Un «Omitir» anterior deja de bloquear.

---

## v0.1.14 · Recomendaciones inteligentes (pre-partida)

- **Nueva opción «Recomendaciones inteligentes»** en *Configuración → Datos del rival* (apagada de fábrica). Al encontrarse la partida (ventana de preparación) muestra un **consejo por rival** calculado con **datos reales** de AoE2Insights (`/stats/api/match-ups/` sobre replays analizados):
  - **Civs que le cuestan en el mapa actual** — p. ej. *«pierde 80% contra Gurjaras · 5 pj»*.
  - **Aperturas que le duelen** (el `strategy_opponent` real: scouts, archers, drush…) — p. ej. *«Scouts 39% · 31 pj»*.
  - **Perfil de ritmo** — si le salen mejor las partidas cortas o las largas, con los porcentajes al lado.
- **Solo se ve antes de que arranque la partida.** El bloque vive en la fase `lobby` y desaparece solo al iniciar (no hay timer ni reloj: el gate es la fase que manda el main). No molesta durante el juego.
- **Nunca inventa nada.** Cada línea muestra su muestra. Si el mapa puntual no tiene datos suficientes, baja al tipo de mapa (abierto/cerrado) y lo declara; si tampoco, al modo completo. Debajo de los mínimos de muestra (6 partidas en el recorte, 3 por civ, 4 por apertura) no se muestra ningún número.
- **Coherencia de modo:** usa el `ladder` exacto de la partida (EW no se mezcla con RM). En custom/unranked no se consulta nada en lugar de mezclar.
- Una sola request por rival por modo la primera vez (~3-9 s mientras el backend calcula y responde `202`); luego cache local de 30 min. El ELO y el aviso de partida encontrada siguen saliendo en 0-1 ms.

---

## v0.1.13 · Actualizar sin instalador a la vista

- **«Actualizar ahora» ya no abre el instalador.** La instalación pasa a ser silenciosa (`/S`): no hay bienvenida, ni elección de carpeta, ni accesos directos, ni botón «Finalizar». La app se cierra, se reemplaza sin mostrar nada y **se reabre sola** (`--force-run`). Conserva la carpeta de instalación y no pide permisos de administrador.
- **Nunca te corta una partida.** Si apretás «Actualizar ahora» con un juego en curso, la instalación se pospone y el panel lo avisa (*Instalación pospuesta*). Se aplica sola apenas termina la partida, sin que tengas que volver a tocar nada. Si en el medio sale una versión más nueva, se espera a esa y jamás se instala la vieja.
- Se mantiene la instalación silenciosa al salir de la app (que ya funcionaba así) y la descarga diferencial por `.blockmap`.

> En Windows el ejecutable está en uso mientras la app corre: no se puede reemplazar en caliente. Siempre hay un cierre breve y una reapertura automática; lo que desaparece es la ventana del asistente, no el reinicio.

---

## Ya incluido desde v0.1.12

- Pie de la configuración sin la ruta de `config.json` ni el aviso del panel no clickeable (**Esc sigue cerrando la ventana**).
- Updater con **un solo** botón de búsqueda: «Buscar actualizaciones» consulta; el botón principal solo descarga o instala.
- El crédito **By Acido** queda únicamente en el pie del riel, al lado de la versión.

## Ya incluido desde v0.1.11

### Corregido

- **Ya no quedás atrapado en una versión intermedia.** Si tenés la v1.6 descargada y sale la v1.7, ahora se puede volver a buscar sin instalar la v1.6 antes: la descarga vieja se descarta, se baja solo la más nueva y nunca se instala una versión anterior.
- **Omitir** ya no queda pegado para siempre: aplica solo a esa versión y se limpia automáticamente cuando aparece otra.
- **Sin falsos errores al publicar:** GitHub marca el release como "latest" unos minutos antes de que se suba `latest.yml`; ese 404 ahora se muestra como *Publicándose…* y se reintenta solo, sin cartel rojo.
- El workflow ya no sobreescribe las notas de la v0.1.9 en cada release y verifica que `latest.yml` haya quedado publicado.

### Agregado

- **Notificación de Windows al abrir la app** cuando hay una actualización disponible y cuando termina de descargarse. Al tocarla se abre la configuración directamente en la pestaña **Updater**.
- **Aviso chico en el overlay** (12 segundos, solo visual): muestra la versión nueva. No aparece durante una partida; si llega en medio de una, se pospone y se muestra al terminar.
- Consulta automática cada 30 minutos mientras haya una actualización pendiente (antes, cada 6 horas sin importar el estado).
