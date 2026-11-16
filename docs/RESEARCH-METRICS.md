# Investigación: métricas automáticas, notas y logros

> Auditoría/propuesta de la revisión inicial. El resultado posterior, incluidas las correcciones y la presentación económica S–D, se documenta en [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md); este estudio no sustituye ese estado.
Revisión: 14 de noviembre de 2026. Alcance: `src/replay-analysis.js`, `src/postmatch.js`, `src/combat-analysis.js` y contratos/documentos del checkout. Este documento no cambia código de producción. Las fórmulas propuestas son definiciones de producto para implementar y validar; no son benchmarks publicados ni capacidades ya conectadas.

## Decisión para el producto

El postmatch automático puede mostrar hoy resultado confirmado, referencia personal de resultados por mapa/modo, duración de replay, comandos por minuto, órdenes de avance y apertura inferida. No puede generar automáticamente notas profundas de micro, macro o decisiones, Serial Killer, Boom Master ni «mejor que X % de los jugadores» con las fuentes actualmente conectadas.

El motor de combate y el evaluador económico ya aceptan datos medidos, pero no los extraen del replay. La dependencia principal es **desarrollar e integrar un lector de estado con cobertura verificable**, o confirmar un acceso programático equivalente de un proveedor. Un JSON importable, una visualización de otro sitio o una fórmula no resuelven esa extracción. El flujo normal no debe pedir edad, composición, bajas, población ni otros datos manuales al jugador.

Política: cada tarjeta se habilita por capacidad y cobertura de su fuente. Un dato ausente queda ausente, con motivo concreto; nunca se convierte en cero, nota D o logro no ganado. El plan Free/Pro/ProMax puede limitar acceso, detalle o historial, pero no cambia la calidad de evidencia necesaria ni promete capacidades no implementadas. La comercialización y la validación visual/Windows quedaron diferidas; aquí se identifica la prueba técnica futura sin afirmar que ya se realizó.

## Qué está medido y qué falta

| Dato o función | Automático en el código actual | Qué significa realmente | Dependencia para completarlo |
| --- | --- | --- | --- |
| Victoria/derrota, mapa, modo, civ, equipos y variación de rating | Sí, cuando la fuente pública confirma el dato | Resultado/contexto, no calidad de ejecución | Conservar desconocidos y errores de fuente |
| Referencia de victorias en el mismo mapa/modo | Sí, historial consultado | Porcentaje de resultados confirmados propios | No representa toda la población ni todas las partidas históricas |
| Duración del replay | Sí, primer capítulo y sus operaciones | Reloj de juego calculado por el adaptador | Validar integridad, restauraciones y capítulos antes de usarla como cobertura completa |
| APM de comandos | Sí | Comandos atribuibles al jugador por minuto del replay; `game-command-count-v1` | No llamarlo eAPM, velocidad física de teclado/mouse ni nota de micro |
| Primera orden de avance a Feudal/Castillos | Sí | Timestamp de `Research`; `first-age-research-command-game-seconds-v1` | No confirma investigación completada |
| Apertura | Sí, inferida | Regla aplicada a órdenes de cola/construcción y clics de edad | No prueba unidades creadas, edificios terminados ni plan estratégico exitoso |
| eAPM, actividad militar/económica | No | El contrato admite eAPM, pero el adaptador no lo produce | Definir filtrado, repetición, categorías y ventanas; validar contra comandos reales; no asumir equivalencia con CaptureAge/AoE2Insights |
| Llegada efectiva de edad | No | Campos aceptados desde una fuente que confirme finalización | Estado o notificación de finalización decodificada y verificada; no sumar una duración fija al primer clic |
| Aldeanos creados/vivos y crecimiento económico | No | Las órdenes de cola no confirman nacimientos | Entidades, creación completada, dueño, transformaciones y pérdidas |
| TC inactivo, aldeanos inactivos, bloqueo real de producción por población | No | El normalizador económico los acepta, pero no existe productor automático | Estado temporal de unidades, edificios, actividad y población |
| Recolección, stockpile, eficiencia y mejoras efectivas | No | No se obtienen de silencios entre comandos | Series de estado y eventos completados, definiciones y reloj compatibles |
| Bajas por edad y categoría | No desde el replay; sí como agregación de eventos suministrados | El motor de combate cuenta muertes medidas, con dueño/autor y cobertura | Extractor de muertes, atribución, categorías y llegadas de edad |
| Valor destruido/perdido | Igual que la fila anterior | Coste nominal de reemplazo al morir, no necesariamente gasto histórico | Coste por parche/civ/mejoras y eventos compatibles |
| Notas económicas personales A–E | Motor implementado; el adaptador automático no aporta las métricas necesarias | Media de percentiles de ejecución económica frente a partidas anteriores propias | Al menos dos indicadores medidos y cinco referencias compatibles por etapa |
| Notas S–D de micro/macro/decisiones | No | No hay modelo validado ni datos suficientes | Definición por dimensión, extracción, cohorte y calibración; ver abajo |
| Serial Killer y Boom Master | No automáticos | Existen propuestas de reglas; el motor actual usa otros títulos/reglas de combate | Evidencia completa de combate/economía y reglas versionadas |
| «Mejor que X %» de jugadores de nivel similar | No | La referencia guardada hoy es del mismo jugador | Dataset autorizado de otros jugadores, metodología de muestreo y datos medidos compatibles |

## Evidencia primaria revisada

Las páginas de terceros describen **sus** productos. No transfieren automáticamente sus métricas, su método ni sus distribuciones a este repositorio.

| Fuente primaria y URL | Hallazgo verificable y límite |
| --- | --- |
| [aoe2rec: acciones, commit revisado](https://github.com/aoe2ct/aoe2rec/blob/0b7e00bac16f552311497e289edb9a02be46e7aa/crates/aoe2rec/src/actions.rs) | `Research` contiene una orden; `DeQueue` contiene IDs y cantidad de una orden de cola. Varias acciones, incluida `Achievements`, conservan bytes sin decodificar. No hay un ledger de muertes o economía listo para consumir. Esto describe el parser revisado, no demuestra que ningún byte del formato pueda ampliarse. |
| [aoe2rec: operaciones y PostGame](https://github.com/aoe2ct/aoe2rec/blob/0b7e00bac16f552311497e289edb9a02be46e7aa/crates/aoe2rec/src/lib.rs) | Los bloques `PostGame` decodificados son `WorldTime` y `Leaderboards`. El modelo admite varios capítulos. No expone en esos bloques estadísticas temporales de combate/economía. |
| [aoe2rec-js: binding](https://github.com/aoe2ct/aoe2rec/blob/0b7e00bac16f552311497e289edb9a02be46e7aa/crates/aoe2rec-js/src/lib.rs) y [manifest](https://github.com/aoe2ct/aoe2rec/blob/0b7e00bac16f552311497e289edb9a02be46e7aa/crates/aoe2rec-js/Cargo.toml) | `parse_rec` serializa el resultado del parser. El manifest revisado declara 0.1.25. El header ofrece campos de versión/build distintos del texto `game`. No es un simulador económico. |
| [aoe2rec: resumen Python](https://github.com/aoe2ct/aoe2rec/blob/0b7e00bac16f552311497e289edb9a02be46e7aa/crates/aoe2rec-py/python/aoe2rec_py/summary.py) | `get_postgame()` devuelve `None` y `has_achievements()` devuelve `False`. Su contador llamado `eapm` cuenta acciones por jugador; el nombre no establece que comparta semántica con otras herramientas. |
| [CaptureAge: Dashboard](https://captureage.com/cade/docs/cade-latest/dashboard) y [estadísticas](https://captureage.com/cade/docs/cade-latest/match-statistics) | Documenta K/D, TC inactivo, eficiencia, geAPM, recolección, mercado, tributo y curvas. Demuestra capacidad de la aplicación de reproducción; estas páginas no documentan un endpoint de exportación utilizable por el helper. |
| [CaptureAge: eficiencia](https://captureage.com/cade/docs/cade-latest/pie-chart) y [FAQ](https://captureage.com/cade/docs/cade-latest/faq) | Distingue actividad productiva de caminar/inactividad. Sus tiempos ociosos son agregados: varios TCs/aldeanos pueden sumar segundos simultáneos. Dividir ese total solo por duración del juego no produce una proporción acotada a 1. |
| [CaptureAge: grabaciones](https://captureage.com/cade/docs/cade-latest/caderecs) y [versiones](https://captureage.com/cade/docs/cade-latest/pro) | Documenta crear `.caderec` tras reproducir una partida, reproducirlas sin AoE abierto y funciones Pro. No documenta en esas páginas un protocolo público de lectura de sus estadísticas ni un flujo de análisis desatendido para este proyecto. |
| [AoE2Insights Pro](https://www.aoe2insights.com/pro/) | Publicita estado económico, combates y comparativas de seis indicadores frente a jugadores de rating similar en otros análisis Pro. Es evidencia de una cohorte de su producto, no de toda la ladder. No se verificó un contrato de API/exportación de esos datos para el helper. |
| [AoE2Insights: logros](https://www.aoe2insights.com/awards/) | Publica reglas para logros de eAPM/atención y otros basados en análisis Pro, incluidos TC y aldeanos ociosos. Los porcentajes mostrados no documentan una distribución reutilizable de cada métrica ni justifican importar sus umbrales como calibración de nuestras notas. |
| [Soporte oficial: replays de AoE II DE](https://support.ageofempires.com/hc/en-us/articles/9897722830100-Age-II-DE-Replays-on-PC) | Advierte incompatibilidad/prematuro final de reproducción entre builds. Un futuro lector debe verificar versión y final completo. No se deduce cobertura de que un archivo abra o su parseo termine. |

No se encontraron en las páginas primarias revisadas especificaciones suficientes para asumir una API profunda de CaptureAge o AoE2Insights. Eso es un **bloqueo de integración pendiente de verificación**, no una afirmación de que no exista ningún acuerdo o acceso privado. No se solicitaron credenciales, análisis pagos ni acceso a cuentas.

## Auditoría del evaluador actual

`postmatch.js` usa `personal-economic-percentile-v1`, al menos cinco referencias anteriores, dos indicadores económicos o más, misma etapa completa y compatibilidad de fuente/versión/definición. Excluye otro perfil, mapa, modo, partida actual y fechas futuras. La nota es A ≥ 80, B ≥ 60, C ≥ 40, D ≥ 20 y E por debajo. No hay S en el evaluador actual.

La comparación usa el mismo conjunto de referencias para los indicadores presentes de esa nota. Ausencia, etapa no alcanzada, cobertura incompleta y muestra insuficiente no se convierten en puntuaciones. APM, eAPM y clics/llegadas de edad no suman puntos. Estas son buenas propiedades que conviene conservar.

Antes de habilitar notas automáticas profundas hay que resolver o verificar:

1. `analyzeReplayFile` recorre solo `chapters[0]`. Hay que soportar y validar restauraciones/múltiples capítulos, o declararlos no compatibles; no afirmar cobertura completa de todo el juego.
2. `context.patch` se llena con `zheader.game`; el header upstream tiene `version_major`, `version_minor` y `build`. No está demostrado que el texto `game` identifique un parche competitivo. Usar identidad de build/dataset confirmada y cambiar versión de fuente al corregirlo.
3. Un ID de edad inicial desconocido cae en `dark`; velocidad ausente cae en `normal`. Esas suposiciones no pueden crear equivalencia de cohortes. Para calificar deben ser conocidas o invalidar esa dimensión.
4. `Other` es un string de apertura no vacío y satisface la comprobación de apertura presente; no garantiza que las aperturas desconocidas sean equivalentes. El comparador debe rechazar esa clase o usar una referencia más amplia, rotulada y validada como otro método.
5. `Queue`/`Multiqueue` pueden conservar payload sin decodificar; los contadores actuales no son producción completada. Inferir edificios por `building_type` de cada orden tampoco cuenta estructuras físicas. Conservar solo su función de señales de apertura.
6. Los totales de comandos se dividen por la duración completa del replay. En TG, después de la renuncia propia puede continuar el juego. Esa definición sirve como actividad de la partida completa, pero no debe confundirse con APM hasta dejar de jugar.
7. V1 confía en declaraciones `complete` de la fuente. Validación de formato no autentica el extractor ni demuestra cobertura; la aceptación requiere una grabación real cotejada con reproducción.
8. La media de percentiles individuales es un **score compuesto**, no necesariamente un percentil del score global. Su valor 80 no autoriza «mejor que 80 % de los jugadores».
9. TC ocioso y población bloqueada pueden registrar el mismo intervalo. Promediarlos como evidencias independientes puede duplicar una misma dificultad; fijar pesos y validar correlación antes de una nota de macro más amplia.

## Fórmulas implementables con entradas medidas

Todas las fórmulas usan reloj de juego y un intervalo semiabierto `I = [a,b)`, duración `T = b-a > 0`. Un evento en `b` pertenece al siguiente intervalo. Fuente, versión, definición, contexto, resolución temporal y cobertura viajan con cada métrica. No interpolar un estado desconocido a través de un hueco.

| Métrica propuesta | Fórmula y unidad | Condiciones y presentación |
| --- | --- | --- |
| Actividad de comandos | `commandAPM(I) = 60 × comandos atribuidos dentro de I / T` | Ya posible para el alcance validado del replay; descriptivo. Publicar qué tipos se cuentan y si se usa partida completa o tiempo hasta renuncia. No da calidad a cada orden. |
| Primer clic de edad | `min(t de Research de la tecnología objetivo)` | Ya posible. Conservar cancelaciones/reintentos como órdenes; nunca publicarlo como llegada. |
| Llegada de edad | `min(t de age-reached confirmado de esa edad)` | Requiere evento real. No usar primer clic + duración nominal: hay colas, cancelaciones, civs y reglas distintas. |
| Segundos de TC ocioso | `Σ_TC ∫ 1[TC terminado, propio, operativo, sin entrenamiento ni investigación activa] dt` | Segundos-TC. Entrenar o investigar cuenta como ocupado; excluir construcción, destrucción y periodos no operativos. Mantener motivo del ocio cuando exista. No presume que todo ocio sea un error estratégico. |
| Proporción de TC ocioso | `tcIdleRatio = segundos-TC ociosos / Σ_TC ∫ 1[TC operativo y no investigando] dt` | Denominador incluye entrenamiento y ocio; resultado 0–1. Si denominador 0, ausente. Definición propuesta de oportunidad productiva; no mezclar con utilización calculada sobre todo el tiempo-TC. Comparar en una ventana donde la producción de aldeanos siga siendo pertinente. |
| Proporción de aldeanos ociosos | `villagerIdleRatio = ∫ aldeanos propios sin tarea dt / ∫ aldeanos propios vivos dt` | Resultado 0–1, ponderado por tiempo-aldeano. Definir categorías: caminar, construir/reparar, recolectar, guarecer y transportar por separado. No equiparar «sin recolectar» a «ocioso». Denominador 0: ausente. |
| Eficiencia de trabajo | `workRatio = segundos-aldeano recolectando, construyendo o reparando / segundos-aldeano vivos` | Descriptiva, definición propia y explícita; caminar/guarecer no son trabajo en esta fórmula. No asumir equivalencia numérica con otra herramienta. |
| Bloqueo de población | `housedRatio = duración de la unión de intervalos con producción demandada realmente bloqueada por capacidad / T` | Resultado 0–1. Requiere cola/estado que confirme bloqueo. Estar al límite mientras se investiga, sin demanda de entrenamiento o en el máximo global no basta. Registrar tiempo al máximo global aparte; no penalizarlo automáticamente. |
| Stockpile medio | `floatMean = (1/T) × ∫ (food+wood+gold+stone) dt` | No es recolección ni «desperdicio» demostrado. Ahorrar para una edad/tecnología puede ser intencional; no asignar dirección universal para una nota. |
| Recolección en I | `gathered(I) = contadorRecolectado(b) − contadorRecolectado(a)` | La fuente debe definir pesca, reliquias, comercio y otros ingresos; separar mercado/tributos. Un stockpile no reemplaza un contador de recolección. |
| Ventaja de recolección | `100 × (gatheredPropio(I) − gatheredRival(I)) / gatheredRival(I)` | Mismo intervalo, cobertura y definición. Si rival 0/ausente, mostrar absolutos; un mínimo de estabilidad adicional requiere calibración, no un valor inventado. Decir «recolectaste X % más», no «jugaste X % mejor». |
| Crecimiento de aldeanos | `ΔV = V(b) − V(a) = B − L + X` | B: entrenamientos completados; L: muertes; X: cambio neto por conversiones, regalos, guiones, transformaciones u otras altas/bajas. Reconciliar entidades antes de usarlo. |
| Bajas por categoría/edad | Conteo de muertes únicas con `t ∈ I`, dueño al morir y categoría conocida | Eliminación acreditada solo con autor enemigo confirmado; pérdida propia puede tener causa propia, Gaia o desconocida. Sin atribución no conceder kill al rival. |
| Valor destruido/perdido | `D = Σ costeNominal de bajas enemigas acreditadas`; `L = Σ costeNominal de pérdidas propias por combate enemigo`; `saldo = D−L` | Coste por parche/civ/mejoras al morir, con la definición del motor actual. No equivale a gasto histórico ni ponderación exacta del valor estratégico de oro/piedra. Costes desconocidos dejan el valor ausente sin borrar conteos. |
| Intercambio de recursos | `tradeRatio = D/L`, solo si `L>0` | Con L=0 mostrar «sin pérdidas de combate medidas · D recursos destruidos»; con D=L=0, sin intercambio. No usar un cociente infinito ni convertir una buena relación en nota directa de micro. |

Los muestreos discretos solo justifican precisión según su frecuencia. Si una variación sucede entre dos muestras y cruza una llegada de edad, no ubicarla con timestamp inventado: publicar un rango o dejar el desglose exacto pendiente. Las muertes/eventos de motor con timestamp son preferibles a diferencias de población.

## Qué pueden significar las notas S–D

S–D debe ser una **nueva versión de evaluación**, no un renombrado silencioso de las notas económicas A–E guardadas. Conservar las notas históricas, versión del método, indicadores y referencia usados.

| Dimensión solicitada | Evaluación defendible | Estado actual y límite |
| --- | --- | --- |
| Macro | Empezar por «Ejecución económica» con proporciones medidas de TC y aldeanos ociosos en fases comparables | Bloqueada por extractor. Producción, expansión, ahorro y composición exigen contexto adicional; dos proporciones no califican toda la macro. |
| Micro | Mostrar «Intercambios militares» y presión medida; evaluar micro solo tras controlar composición, mejoras, posiciones y situación de combate | K/D, eAPM y saldo de recursos no aíslan habilidad de control. Un ejército superior puede intercambiar bien sin micro; un sacrificio útil puede intercambiar mal. No hay nota automática de micro validada. |
| Toma de decisiones | Describir una decisión observable y sus requisitos: mejora completada, transición, gasto o respuesta temporal | No hay verdad contrafactual que permita juzgar «decisión correcta» a partir de ganar/perder, apertura o civ. Requiere reglas/modelo explícitos, información disponible al jugador en ese instante y revisión/calibración. No asignar letras hoy. |

Propuesta inicial implementable **cuando exista economía medida**:

1. Elegir una ventana fija/versionada por fase; exigir cobertura completa, edad inicial conocida y todas las métricas del conjunto. La última fase truncada muestra datos sin ser equivalente a una fase completa de referencia.
2. Empezar con un conjunto fijo de dos indicadores: `tcIdleRatio` y `villagerIdleRatio`, peso 0,5 cada uno. Mostrar población bloqueada como diagnóstico hasta estudiar su solapamiento con TC ocioso. Los pesos son una propuesta de producto sin calibración competitiva.
3. Para un indicador donde menos es mejor, calcular `p_j = 100 × (n_valores_peores + 0,5 × n_empates) / n`. Para uno donde más es mejor, invertir el criterio. Definir tolerancia de empates según resolución de la medición.
4. Calcular `scoreEconomic = 0,5 × p_TC + 0,5 × p_villager`. No cambiar pesos cuando falta un indicador; dejar la nota pendiente. No incluir victoria, ELO ganado, eAPM, rapidez de edad ni kills en este score.
5. Si se desea S–D, una política posible es S ≥ 90, A ≥ 75, B ≥ 50, C ≥ 25 y D por debajo. **Son cortes propuestos, no percentiles de habilidad comprobados ni reglas implementadas.** El nombre correcto sería «ejecución económica frente a tu referencia», con versión nueva; no «micro S».
6. Mantener visibles número de referencias, alcance y carácter provisional. El mínimo actual de cinco permite un cálculo personal de resolución gruesa, no una conclusión estable sobre nivel. Un tamaño mínimo mayor para notas estables debe fijarse tras estudiar variabilidad; aquí no se fabrica un umbral científico.

Incluso si cada `p_j` es un percentil, la media no es el percentil de un ranking global. Para decir que un score compuesto supera al X % de una cohorte, hay que calcular también ese mismo score para las referencias con una transformación congelada y rankear el score resultante, excluyendo la partida evaluada de la calibración. Comparar el jugador con sus propias partidas produce una referencia personal; no cambia por sí solo a una población de jugadores.

## Logros: reglas medibles y bloqueos

Las siguientes condiciones son propuestas de producto versionadas, todavía sin calibración de dificultad. No se presentan como una definición oficial de buen juego.

| Logro | Regla reproducible propuesta | Evidencia y estado |
| --- | --- | --- |
| Depredador Feudal | Al menos 5 aldeanos enemigos eliminados durante el Feudal propio | Regla `feudal-raider-v1` ya agregada por el motor. Necesita Feudal completo, edades y muertes atribuidas; el replay automático no lo suministra. |
| Huella militar | Al menos 25 militares enemigos eliminados en la partida | Regla `military-kills-25-v1` ya agregada; no exige saldo positivo y **no es todavía Serial Killer**. Requiere cobertura completa y categorías conocidas. |
| Serial Killer | Al menos 25 militares enemigos eliminados **y** `D>L`, con definición compatible de valor | Propuesta del roadmap; requiere muertes, atribución y costes completos. No renombrar Huella militar como si ya comprobara el saldo. Guardar cifra de kills, D/L y versión de regla. |
| Buen negocio | `L>0`, `D≥1,5×L` y `D+L≥1000` | Regla `resource-trade-1.5-v1` ya agregada por el motor. Los números son reglas absolutas del producto, no comparación de nivel. Ningún logro si faltan costes/cobertura. |
| Boom Master | En la ventana fija `[llegadaCastillos, llegadaCastillos+600s)`, `ΔV≥30` y `B−L≥30`; para una primera versión simple excluir cambios X no nulos | Requiere los 600 segundos completos, población viva y creaciones/pérdidas/cambios de dueño reconciliados. Si la partida acaba antes: no evaluable. No maximizar una ventana móvil para elegir retrospectivamente los mejores diez minutos. Umbral pendiente de calibración. |
| Mejor marca personal | Mejorar un indicador propio compatible frente a referencias anteriores, con muestra y margen explícitos | Puede funcionar sin una cohorte global cuando exista esa métrica medida. La mejora por debajo de la precisión de medición no merece logro. No usar más APM como sinónimo de mejor ejecución. |

Antes de extender las reglas absolutas, limitar explícitamente su contexto de aplicación (propuesta inicial: RM 1v1 estándar, inicio Oscuro, población 200 y reglas conocidas). Ese contexto no está íntegramente validado por el resumen compacto actual: población, recursos iniciales, cheats/mods y condiciones especiales deben llegar del adaptador. No asignar estas medallas por defecto a EW, TG, inicios avanzados, escenarios, población distinta o partidas restauradas no compatibles.

La evidencia debe guardarse con `matchId`, jugador, versión de regla y análisis/fuente. Reanalizar actualiza el mismo logro; no duplica medallas. Cobertura parcial permite «al menos X bajas observadas» como dato, pero las reglas actuales de logro exigen intervalo completo. La derrota no invalida un logro cuya condición se haya medido; el resultado tampoco lo demuestra.

## «Mejor que X %»: contrato necesario

No hay en este repositorio una cohorte de población para ejecución. El historial guarda hasta 1.000 partidas del propio perfil, no una muestra representativa de jugadores. Los logros porcentuales de otra web, las estadísticas de victorias por civ y el percentil de ELO no sustituyen una distribución de inactividad, eficiencia o combate.

Para una comparación de un indicador con una referencia R de tamaño n:

```text
strictBetterPercent = 100 × referencias estrictamente peores / n
midrankPercentile = 100 × (referencias estrictamente peores + 0,5 × empates) / n
```

`midrankPercentile` admite «percentil X en esta referencia»; «superaste a X %» debe usar la proporción estricta o explicar cómo se tratan empates. Si todos los valores empatan, percentil 50 no significa que se haya superado a la mitad.

| Requisito | Política necesaria |
| --- | --- |
| Unidad de referencia | Elegir partidas o jugadores y decirlo. Muchos replays del mismo jugador no son muchos jugadores independientes. Para «jugadores», fijar una observación/resumen por perfil o un peso por perfil justificado. |
| Universo | Describir «replays analizados disponibles» si esa es la muestra. No llamarlo «todos los jugadores». Publicar fechas y criterios de inclusión. |
| Nivel | ELO del modo y momento de partida, no ELO RM 1v1 actual aplicado a EW/TG. Elegir ancho de banda a partir de cobertura/variabilidad y publicar la banda real; no inventar una cohorte existente. |
| Compatibilidad | Mismo modo, reglas, mapa o grupo explícito, inicio, velocidad, parche/dataset y semántica/resolución del indicador. Civ y apertura pueden cambiar producción; controlarlas o modelarlas antes de mezclar. |
| Ventana | Mismo intervalo/objetivo medido. Una partida corta o una fase no alcanzada no aporta cero inactividad ni población de una ventana que no existe. Reportar exclusiones para evitar sesgo de supervivencia. |
| Trazabilidad | Dataset/versión, fuente y licencia/acceso, número de partidas y perfiles, antigüedad, huecos y porcentaje de cobertura. La capacidad anunciada por un proveedor no concede acceso a sus datos. |
| Tamaño y variabilidad | No mostrar una cifra de precisión falsa con n pequeño. La resolución empírica es del orden de `100/n` puntos; datos repetidos por jugador reducen independencia. Calibrar mínimo y estabilidad antes de publicar notas de población. |
| Validación | Excluir la partida consultada, evitar datos futuros y fuga de información, congelar referencia por versión y revisar sensibilidad a reglas/civs/patch. Con datos agrupados por perfil, estudiar incertidumbre a nivel de perfil. |

Ejemplo de redacción **solo cuando exista la referencia**: «Menos TC ocioso que 73 de 100 partidas analizadas comparables · mismo mapa/modo · definición y fechas disponibles». Si la referencia es personal: «Mejor que 7 de tus 10 partidas anteriores comparables». No convertir esos ejemplos en números de producción ni presentar un percentil de una única métrica como nota global del jugador.

## Condiciones de aceptación de la extracción automática

1. Un replay real actual, identificado con su roster/build, llega automáticamente al analizador tras el final confirmado, sin preguntas ni inputs de partida.
2. El lector demuestra llegadas completadas, unidades creadas/vivas, cambios de dueño, muertes, estados de trabajo y producción. Declara intervalos completos por capacidad y detecta corte de reproducción o datos faltantes.
3. Se cotejan edades, conteos y economía contra reproducción verificable. Fixtures sintéticos prueban las fórmulas; no prueban la extracción. No se declara superada esta condición en esta revisión.
4. Se ensayan cola/tecnología canceladas, varias estructuras, bloqueo de población durante investigación, renuncia temprana en TG, muertes sin autor, conversiones, Gaia, borrado, unidades especiales y límites exactos de edad.
5. Se rechazan build/edad inicial/reglas desconocidos para las notas afectadas. Partidas multicapítulo/restauradas requieren soporte probado o un estado no compatible explícito.
6. Se mide tiempo de análisis y coste de recursos antes de prometer plazos o cuotas Free/Pro/ProMax. El fallo de análisis conserva resultado y métricas verificadas.
7. Solo tras esa aceptación se habilitan tarjetas de economía/combate y logros por sus capacidades. Micro, decisiones y percentiles de población mantienen requisitos adicionales de validación/cohorte; no se desbloquean por tener un lector de estado.

Documentos relacionados: [contrato actual](POSTMATCH-DATA.md), [eventos de combate](COMBAT-EVENTS.md), [telemetría v2 propuesta](TELEMETRY-V2-PROPOSAL.md) y [plan de producto](PRODUCT-ROADMAP.md).
