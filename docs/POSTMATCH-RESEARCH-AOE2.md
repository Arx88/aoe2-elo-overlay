# Investigación sobre contexto competitivo para el postmatch

19 de noviembre de 2026. Alcance inicial: Age of Empires II: DE, Random Map 1v1. Esta revisión combina fuentes de entrenadores, documentación de análisis de partidas y dos pruebas con grabaciones públicas. Los dos replays comprueban qué distingue el lector. No permiten derivar una regla de rendimiento ni un ranking de las métricas para todos los jugadores.

## Qué respalda la investigación

**El tiempo de avance vale por lo que te permite hacer y por lo que elegiste dejar para después.** La guía de Forgotten Empires describe la presión feudal por su efecto sobre la economía rival, y distingue funciones de Scouts, arqueros e infantería. En un ejemplo de su documentación, CaptureAge cruza la curva de recursos con las mejoras económicas y la edad: el jugador que pospuso Castillos empezó a sacar ventaja de recursos tras investigar mejoras antes. Eso demuestra por qué el reloj aislado puede contar una historia equivocada. [Forgotten Empires, presión feudal](https://www.forgottenempires.net/strategy/age-of-empires-ii-strategy-center/feudal-rushing) · [CaptureAge, Match Statistics](https://captureage.com/cade/docs/cade-latest/match-statistics)

**El mismo dato puede tener significados distintos según la partida.** En los capítulos publicados de una revisión de replays de Survivalist aparecen por separado exceso de Scouts en Feudal, madera acumulada mientras se controla a los Scouts y un ejército inadecuado ante muros. La guía de Hera sobre transiciones distingue cuándo hacerlas y cuáles son de corto o largo plazo. Son ejemplos de preguntas que un entrenador separa; los capítulos no proporcionan una fórmula para medirlas. [Survivalist, revisión de replays](https://www.youtube.com/watch?v=wM4SCk2DzuI&t=8130s) · [Hera, cuándo hacer una transición](https://www.youtube.com/watch?v=g_yWWo8yAOk&t=299s)

**La economía necesita síntomas separados.** CaptureAge propone revisar conjuntamente unidades económicas, recursos recolectados y tiempo productivo. Su ejemplo de eficiencia reciente separa una interrupción en un raid de la eficiencia durante toda la partida. El tiempo ocioso de un TC, la cantidad de aldeanos y los recursos transportados responden preguntas diferentes. Un hueco entre pedidos de aldeanos es insuficiente para calcular el idle real del TC. [CaptureAge, diagnóstico de economía](https://captureage.com/cade/docs/cade-latest/match-statistics#practical-note) · [CaptureAge, Efficiency Charts](https://captureage.com/cade/docs/cade-latest/pie-chart)

## Contraste con replays reales

Volví a descargar los replays de dos partidas públicas. Verifiqué el roster y leí los primeros comandos `Research` de Feudal y Castillos y la cantidad de unidades pedidas en `DeQueue`. La foto de las colas termina justo antes de la primera orden a Castillos de cualquiera de los dos jugadores. Los tiempos son del reloj de juego.

| Partida | Orden de Castillos de cada lado | Evidencia simultánea de las órdenes |
| --- | --- | --- |
| [#520379962, Arabia](https://data.aoe2companion.com/api/matches/520379962) | Búlgaros 17:04.257, Chinos 17:07.715. Ganó Chinos. | Antes de 17:04.257, se registraron 6 Scouts de Búlgaros y 14 arqueros más 2 lanceros de Chinos entre las líneas consultadas. Dos tiempos casi iguales esconden compromisos militares distintos. |
| [#521092784, Arena](https://data.aoe2companion.com/api/matches/521092784) | Bohemios 11:20.966, Varangians 13:02.938. Ganó Varangians. | Entre esas dos órdenes se registró un Scout encargado por Varangians en las líneas consultadas. Ni ese Scout prueba presión ni la victoria explica por sí misma por qué se tomó la decisión de avanzar más tarde. |

Estas son órdenes emitidas. El lector actual de la app no confirma cuándo terminó la investigación, cuántas unidades salieron o sobrevivieron, cuáles pelearon, si el rival perdió acceso a un recurso, ni por qué alguien se quedó en Feudal. Tampoco mide recursos o inactividad real del TC con ese flujo. Los formatos de replay conservan la secuencia de comandos para que el juego reconstruya el estado durante la reproducción. [aoc-mgz, FAQ del formato](https://github.com/happyleavesaoc/aoc-mgz#frequently-asked-questions)

## Preguntas para validar antes de decidir la interfaz

| Pregunta del jugador | Cruce que permitiría contestarla | Qué da el lector actual |
| --- | --- | --- |
| **¿Mi Feudal largo produjo algo o me quedé atrás sin ganar nada?** | Reloj de ambos, ejército disponible, uso y pérdidas de ese ejército, cambios en economía o acceso a recursos y amenaza rival en la misma ventana. | Las órdenes pueden señalar tramos de revisión. No prueban presión, resultado de una pelea o causa de la demora. |
| **¿Dónde se separaron nuestras economías?** | En un mismo intervalo: aldeanos vivos y producidos, TC ocupado entrenando o investigando, pérdidas e interrupciones económicas. | Órdenes de aldeanos e investigaciones. El análisis automático no mide el estado necesario. |
| **¿Mi transición dejó una ventana que el rival aprovechó?** | Producción anterior y posterior, llegada de edad confirmada, mejoras, contacto o pérdidas, y qué podía ver el jugador cuando eligió. | Primeras órdenes. La situación visible y los efectos requieren datos de reproducción adicionales. |

APM y tiempos aislados quedan como datos de apoyo. En Arena, para analizar una partida de reliquias o boom, el primer monje o TC es un marcador de revisión. La utilidad se mide con su resultado observable (reliquias efectivamente recogidas, economía ganada o exposición), según el objetivo. En TG, recursos, comercio y rol cambian la comparación. No se aplica el mismo baremo que en 1v1. [CaptureAge, estadísticas por modo](https://captureage.com/cade/docs/cade-latest/dashboard)

## Siguiente validación

1. Revisar con estado de partida sincronizado los dos casos de arriba y añadir dos casos de Feudal largo con resultados contrastantes: uno con efecto medido y otro con gasto sin efecto identificado. Etiquetar primero qué momento y evidencia permitió distinguirlos.
2. Marcar en cada caso qué dato es orden, qué dato sale del estado del juego y qué juicio sigue indeterminado. Verificar en paralelo el informe con el replay y una referencia como CaptureAge para esa misma ventana. El motor experimental local tiene que demostrar que puede proporcionar esa evidencia en producción.
3. Probar con jugadores si un resumen de ese momento les ayuda a identificar qué revisar después de la partida. Solo después elegir qué cruce merece la primera pantalla. Validar por separado RM en mapa abierto, Arena y TG.
4. Reservar una nota o percentil para un objetivo medido bajo condiciones comparables. Ejemplo de hipótesis a validar: continuidad de producción de aldeanos en una ventana definida, excluyendo la investigación de edad y separando interrupciones bajo presión. Ni el tiempo de Castillos ni el APM clasifican por sí solos a un jugador.

**Cambio de producto inmediato:** se retiró el premio por acortar la transición. Los hitos conservan su iconografía y se presentan como órdenes. La referencia de tiempo personal queda en el detalle. Esta revisión no incorpora una nueva calificación ni publica un cruce cuya utilidad aún no se midió.
