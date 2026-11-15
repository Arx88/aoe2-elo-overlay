# Investigación: oportunidades automáticas durante una partida

> Auditoría/propuesta de la revisión inicial. El resultado posterior, incluidas las correcciones y la presentación económica S–D, se documenta en [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md); este estudio no sustituye ese estado.
Fecha de revisión: 2026-11-14. Alcance: `src/opportunities.js`, `src/scout.js`, `src/live.js`, `src/aoe.js`, `src/intro.js`, integración en `main.js`, interfaz táctica y tabla `src/civ-tech.json`. Este documento registra la auditoría del modelo inicial y propone su evolución. Las correcciones de producción se realizan por separado; una observación del modelo inicial no debe interpretarse como estado final de la aplicación.

## Decisión de producto

El overlay debe resolver todo el contexto disponible automáticamente y mostrar orientación visual sin pedir edad, ejército observado, botón de recalcular, selección de rival ni otra entrada durante la partida. Las condiciones del texto son para que el jugador las evalúe mirando el juego; no son formularios que deba completar en el helper.

Con las fuentes ya integradas se puede construir una lectura de **potencial por civilizaciones e historial**, pero no observar la composición, economía o investigación actual del rival. La presentación honesta es una banda compacta con tres horizontes condicionales: **Feudal**, **Al llegar a Castillos**, **Al llegar a Imperial**. Mostrar esos tres horizontes automáticamente resuelve la ausencia de edad observada sin inventar un avance. Cambiar el contenido por un temporizador sería una decisión de presentación; nunca puede probar la edad actual.

Una tarjeta útil necesita, como máximo, una ruta, un complemento y la condición que la debilita. Ejemplo de formato, sin cifras ni recomendación universal: “Castillos · caballería + apoyo. Su árbol dispone de camellos: comprobá su producción antes de acumular caballería”. El resultado debe poder leerse sin abrir Ajustes ni interactuar con la ventana.

## Qué se sabe y qué no

| Variable | Fuente disponible | Uso permitido |
| --- | --- | --- |
| Identidad, equipos, mapa, modo, civ declarada | Feed/REST de AoE2 Companion, normalizado en `src/aoe.js` | Confirmar contexto y actualizar cuando llegue el roster completo; una civ provisional no prueba el pick definitivo |
| Inicio/fin declarado del encuentro | Metadatos Companion | Separar encuentros y excluir el actual del historial |
| Tiempo desde `startedAt` | Reloj del sistema | Antigüedad de la detección y comportamiento visual; no reloj simulado ni edad |
| Árbol por civ y edad mínima de nodos | Snapshot fijado de SiegeEngineers/aoe2techtree | Rutas potenciales, mejoras ausentes y acceso temprano |
| Aperturas de partidas anteriores analizadas | Filas de AoE2Insights | Frecuencias históricas en un alcance declarado; nunca ejército actual |
| Resultado por mapa/civ/apertura | Historial compatible | Asociación histórica ajustada por muestra, recencia y resultado habitual |
| Experiencia propia con civ/mapa | Historial propio | Contexto de repertorio; no habilidad con arqueros o caballería si esos datos no existen |
| Edad actual, recursos, edificios, unidades vivas, investigación completada, posición y terreno visible | No están expuestos en el estado normalizado actual | Mantener desconocidos; no rellenar por minutos transcurridos, rol de civ o apertura histórica |

`src/live.js` detecta cola, encuentro y lobby. No es un lector de telemetría militar. `src/intro.js` calcula `now - startedAt`: sin velocidad del juego ni pausas, ese valor no permite reconstruir tiempo simulado. Incluso un reloj simulado exacto no determinaría por sí solo cuándo una persona completó una subida de edad.

El parser local de replays ya distingue órdenes de investigación de llegadas de edad. Una orden de entrenar no prueba que terminó la producción, que la unidad sigue viva o que el oponente la vio. Cambiar el parser a lectura incremental no elimina estas diferencias.

## Hallazgos críticos del modelo inicial

| Prioridad | Hallazgo reproducible | Efecto y corrección |
| --- | --- | --- |
| P0 | `tacticalInput`, los selectores de edad/composición y `settings:tactics-refresh` exigían intervención | Retirar el flujo manual. Calcular los tres horizontes con el contexto automático |
| P0 | `LINES` imponía edades estándar antes de consultar el nodo de civ | Unidades correctamente presentes en el snapshot quedaban invisibles cuando una civ accedía antes. Seleccionar por edad real del nodo y conservar el orden de progresión |
| P0 | La distribución de amenazas dividía solo por aperturas convertibles a una familia militar | Cinco aperturas de arqueros y 95 FC se convertían en “100% arqueros” a efectos del score. Conservar FC/híbridas/desconocidas en la masa total y publicar cobertura |
| P1 | La disponibilidad de mejoras se trataba como fuerza de combate | Bonos de PR, armadura, daño, velocidad, descuentos o gratuidad podían compensar o superar tecnologías ausentes. Llamarlo cobertura, no poder de la línea |
| P1 | Todas las respuestas posibles del árbol rival contribuían sin estado de producción | Un counter posible no equivale a un counter producido. Exponerlo como riesgo estructural condicional |
| P1 | Monjes, lanzas y guerrilleros nunca podían ser candidatos principales por `response: true` | Una respuesta defensiva apropiada podía quedar oculta. Mostrar complementos cuando haya evidencia; considerar composiciones completas en la siguiente versión |
| P1 | “Asedio” equivalía únicamente a mangonel/onagro | Arietes, escorpiones y pólvora tienen funciones distintas. Un ariete cumano temprano no hereda el peso antiarquero de un mangonel |
| P1 | El modelo ignoraba la mayoría de unidades únicas y sustituciones regionales | La ausencia de una respuesta genérica no prueba una debilidad. Incorporar sustituciones verificadas y evitar conclusiones fuertes en familias sin modelar |
| P1 | El filtro de agua dependía de `openness` de partidas históricas | Sin historial, `Islands` devolvía un plan terrestre listo. La aptitud del mapa necesita metadatos independientes del tamaño de muestra |
| P1 | La confianza global dependía del peso de todos los resultados | Un contexto amplio puede no contener ninguna partida contra la ruta recomendada. Separar contexto, cobertura de aperturas y muestra específica de ruta |
| P2 | `proficiency` sumaba el mismo número a todas las rutas de una misma civ | No cambia su orden salvo empates por redondeo/saturación. Mostrarlo como contexto o usar experiencia específica realmente observada |
| P2 | Umbrales de cinco partidas de civ y ocho de cruce cambiaban bruscamente el recorte | La sexta/octava observación podía cambiar toda la recomendación. Un ajuste jerárquico continuo es más estable |

### Casos comprobados contra el snapshot fijado

Referencia: `e56728e76b7d08301fba7b18d5f16bc8554c109a`. Se consultaron también los archivos originales de `data/trees/` mediante el conector GitHub, no únicamente el derivado local.

| Civ / horizonte | Dato en la fuente fijada | Resultado del modelo inicial |
| --- | --- | --- |
| Armenios / Feudal | Long Swordsman y Pikeman: edad 2 | Man-at-Arms y Spearman |
| Armenios / Castillos | Champion y Halberdier: edad 3 | Long Swordsman y Pikeman |
| Borgoñones / Castillos | Cavalier: edad 3 | Knight |
| Cumanos / Feudal | Siege Workshop y Battering Ram: edad 2 | Ninguna ruta de asedio; la familia comenzaba con Mangonel en edad 3 |
| Persas / Imperial | Savar: edad 4 | Cavalier; faltaba la sustitución de Paladin |
| Polacos / Imperial | Rama regional Winged Hussar en el snapshot | Light Cavalry; faltaba la rama regional |

La corrección de edades debe respetar dependencias. “Disponible desde Feudal” no implica que la mejora se haya investigado ni que su costo sea financiable en ese momento. Las ramas de reemplazo tampoco son siempre un escalón adicional de una línea genérica: Cavalry Archer/Mounted Crossbowman o Paladin/Savar requieren equivalencia explícita.

### Reproducciones numéricas adicionales

Se ejecutaron llamadas locales al modelo inicial con fechas válidas, mismo mapa y modo:

* Franks contra Britons, Feudal: cinco `Archer rush` daban `scouts.components.response = 4.5`.
* Añadir 95 `Fast castle` conservaba exactamente `response = 4.5`, mientras la confianza global pasaba de “limitada” a “moderada”. La señal específica no justificaba ese fortalecimiento.
* `buildOpportunityPlan({ ownCiv: 'Franks', rivalCiv: 'Britons', mapName: 'Islands', mode: 3, rows: [] })` devolvía `ready` sin detectar la limitación naval.

Estas comprobaciones son pruebas de defectos, no validación de eficacia estratégica ni estimaciones de victoria.

## Calidad y límites de la fuente tecnológica

El derivado local guarda únicamente `nombre -> edad mínima`. El generador descarta nodos `NotAvailable` y acepta `ResearchedCompleted`/`ResearchRequired`. Esos nombres pertenecen al **esquema del árbol estático**: `ResearchedCompleted` no es información sobre una partida en vivo.

Al aplanar se pierden tipo de nodo, edificio, identificador, requisitos, unidad de reemplazo, investigación gratuita, costo/tiempo, estadísticas y efectos. La tabla no basta para calcular daño, eficiencia de recursos, velocidad de producción ni valor económico de un bono. El texto abreviado de `CIV_GUIDE.role` sirve como prior editorial limitado, no sustituye esos efectos.

Ejemplos que necesitan una capa de efectos verificable: PR de caballería franca, daño de bonificación gurjara, armadura infante romana, resistencia a conversión, descuentos de unidades, producción de equipo y tecnologías únicas. No puede deducirse una ventaja exacta por contar tecnologías o leer la descripción del rol.

Hay además un caso que exige cautela: la fuente fijada incluye tanto Scout Cavalry como Camel Scout en el árbol gurjara. La presentación oficial de esa civ distingue Camel Scout como su unidad inicial y entrenable desde Feudal. No convertir la pertenencia a una tabla en una promesa de disponibilidad de entrenamiento sin revisar sustituciones y versión del juego. La publicación oficial citada es histórica: confirma la mecánica de introducción, pero sus porcentajes antiguos no son una fuente actual para balance.

El snapshot es reproducible; no demuestra que corresponda al parche de cada replay ni que coincida automáticamente con futuras actualizaciones. La generación debe registrar revisión y fecha; el análisis necesita declarar cuando desconoce parche histórico y efectos no incorporados.

## Fórmula automática propuesta

Esta sección es una propuesta de diseño y calibración, no una afirmación de que todos sus términos ya estén implementados. Debe computarse para cada horizonte `a` y ruta o composición `r`, sin entradas durante la partida.

### 1. Contexto y peso de observaciones

Deduplicar por partida y filtrar modo compatible, resultados conocidos, fecha anterior al inicio actual, partida distinta de la actual y ventana temporal. Mantener por separado las filas que sirven para frecuencias de apertura aunque falte resultado; desconocer quién ganó no hace desconocida una apertura detectada.

Usar una semivida editorial explícita, por ejemplo `w_i = 2^(-días_i / 90)` con ventana de 180 días. No presentar esos valores como constantes científicamente validadas. Un recorte exacto de mapa/civ/cruce es preferible; si se usa contexto más amplio, nombrar el alcance real. Evitar duplicar una partida TG por cada rival.

Calcular dos medidas distintas:

```text
W = suma(w_i)
n_eff = suma(w_i)^2 / suma(w_i^2)
soporte = min(W, n_eff)
```

`W` expresa información reciente descontada y `n_eff` penaliza pesos desiguales. Usar solo `n_eff` no penalizaría que todas las partidas sean antiguas: multiplicar todos los pesos por la misma constante no cambia `n_eff`.

### 2. Frecuencias y desconocimiento

Mantener categorías explícitas de scouts, arqueros, milicias/MAA, FC, drush+FC, otras y sin apertura. FC no prueba boom, caballería ni ausencia de ejército. No redistribuir su peso entre unidades conocidas.

```text
p_apertura(k) = peso(k) / peso(todas las partidas del alcance)
cobertura = peso(con apertura detectada) / peso(todas las partidas del alcance)
```

La probabilidad resultante describe la muestra, no el ejército de esta partida. Si se calcula el reparto **entre aperturas detectadas**, su denominador debe mostrarse y luego multiplicarse por cobertura para cualquier contribución estratégica. La masa de FC, híbridas u otras no identificables con unidades aporta cero a una respuesta específica, en lugar de desaparecer.

Para evitar saltos de recorte, la siguiente versión puede usar un Dirichlet jerárquico con ajuste hacia mapa+civ, luego contexto más amplio declarado. Si no existe prior verificado, el prior debe reservar masa desconocida; un reparto uniforme entre unidades o un rol de civ no es frecuencia empírica.

### 3. Asociación histórica específica

El dato disponible es “el rival perdió partidas en que lo enfrentaron con cierta apertura”, no “murió contra determinada unidad”. Usar una tasa base y una tasa de ruta suavizadas:

```text
b = (derrotas_ponderadas_contexto + 2) / (W_contexto + 4)
p_r = (derrotas_ponderadas_ruta + 12*b) / (W_ruta + 12)
lambda_r = soporte_ruta / (soporte_ruta + 12)
E_r = lambda_r * especificidad * factor_TG
      * limitar((p_r - b) / 0.25, -1, 1)
```

Especificidad y factor TG son descuentos editoriales que deben declararse. No hay causalidad demostrada: ELO de rivales, parche, elección de civ, equipo y situación del encuentro confunden la asociación. Un resultado de equipo no permite atribuir su derrota a una unidad ni a un jugador individual. Con muestra mínima insuficiente, `E_r = 0` y la tarjeta dice que no hay señal específica.

Los pseudoconteos ponderados ayudan a priorizar, pero no deben publicarse como intervalo estadístico certificado. Para intervalos y una confianza calibrada harán falta un modelo explícito y evaluación retrospectiva separada por tiempo.

### 4. Potencial de árbol y respuestas

`Q(r,a)` debe llamarse **cobertura del árbol** hasta incorporar efectos y estadísticas. Determina si existen la unidad, progresión y tecnologías relevantes para ese horizonte. No usar un máximo de edad estándar que anule el dato de la civ. No penalizar por igual una tecnología irrelevante, una mejora esencial y una investigación reemplazada por un bono.

`C(r,a)` representa respuestas posibles del árbol rival. La matriz inicial de counters es una política cualitativa, no un simulador: cantidades, micro, alcance, colinas, costo y unidades de apoyo alteran el combate. Mantener categorías funcionales separadas, especialmente asedio antiunidad, arietes y pólvora. Cuando falten unidades únicas relevantes, reducir la contundencia del texto; ausencia del counter genérico no es prueba de seguridad.

La contribución histórica de respuesta puede ser:

```text
R(r,a) = suma_k p_apertura(k) * respuesta_cualitativa(r,k,a)
```

Aplicar un descuento de horizonte `g(a)`, por ejemplo 1 / 0.5 / 0.2 para Feudal/Castillos/Imperial, únicamente como política conservadora. No se dispone de tasas de transición observadas que justifiquen convertir scouts históricos en caballería de Imperial. Si se obtienen esos datos, sustituir el descuento por un modelo de transiciones validado.

### 5. Índice y explicación

Un índice compatible con los componentes existentes, retirando el estado manual, es:

```text
S(r,a) = limitar(50 + 30*(Q-0.65) + 8*afinidad
                + 18*(0.55-C) + 18*E_r + 10*g(a)*R, 0, 100)
```

Sus pesos son una política inicial. El número ordena oportunidades; no representa probabilidad de ganar, daño ni eficiencia de recursos. La experiencia propia con una civ se puede mostrar como contexto aparte. No sumarla a todas las rutas fingiendo que distingue competencia con unidades.

Para recomendar una composición, considerar una ruta principal y un apoyo que cubra su riesgo más importante, siempre dentro del árbol y horizonte propios. No indicar cantidades, cambio de edificios o momento exacto de inversión mientras economía y producción actual sean desconocidas.

La confianza debe describir por separado: certeza del contexto, cobertura del árbol, cobertura de aperturas, soporte específico y estado actual desconocido. La muestra amplia de mapa no debe convertir automáticamente en fuerte una recomendación de ruta con cero ejemplos. Con puntuaciones cercanas, mostrar alternativas equivalentes en vez de fingir un ganador inequívoco.

## Presentación automática recomendada

* Al confirmarse encuentro, mapa, modo y ambas civs, calcular en segundo plano sin bloquear el roster.
* Mostrar tres horizontes compactos y condicionales, una ruta por horizonte. “Castillos” es un encabezado de planificación; no un detector de la edad actual.
* Incluir la razón más decisiva y el riesgo rival principal. La información de soporte permite decidir sin desplegar un informe largo.
* Mantener visible “Árbol e historial · ejército actual sin medir” de forma breve. Un tooltip no alcanza si exige interacción para entender la naturaleza del dato.
* Si falta muestra, conservar orientación del árbol identificada como tal; no fabricar una frecuencia de apertura. Si falta una civ confirmada o el modo no es compatible, esperar los metadatos.
* En agua/híbridos sin modelo naval, decir que la lectura es terrestre y no publicar un supuesto plan global del mapa.
* No ordenar acciones como “cambiá ahora a X”, “no puede responder Y” o “tiene Z”. Preferir “su árbol puede responder con Y” y “al llegar a Castillos, considerá X si sigue con Z”.

## Validación antes de ampliar las afirmaciones

Comprobar automáticamente los casos de acceso temprano y sustituciones, que añadir FC/desconocidos reduzca la contribución militar específica, que duplicar filas no aumente muestra, que no se mezclen mapas/modos de forma oculta y que ninguna recomendación declare observación actual. Probar también reconexión, roster provisional, cambios de civ, falta de fecha y datos de agua sin historial.

La calibración estratégica requiere revisión de partidas y evaluación hacia adelante: guardar la recomendación emitida antes de conocer el resultado, separar entrenamiento y evaluación por fecha, medir estabilidad, tasa de abstención y concordancia experta. El winrate observado de quienes siguen o no una ruta no identifica por sí solo el efecto de aconsejarla. Las suites de software comprueban consistencia; no prueban que una estrategia gane más partidas.

## Fuentes primarias y estado de acceso

1. [AoE2 Companion: API](https://www.aoe2companion.com/more/api). La documentación pública consultada indica websockets para overlays y endpoints de encuentros/perfiles. Esto respalda el uso de metadatos; no documenta las variables militares que faltan en el estado normalizado de esta aplicación. No se concluye que toda API posible sea incapaz de producirlas.
2. [SiegeEngineers/aoe2techtree](https://github.com/SiegeEngineers/aoe2techtree), revisión fijada `e56728e76b7d08301fba7b18d5f16bc8554c109a`; archivos `data/trees/ARMENIANS.json`, `BURGUNDIANS.json`, `CUMANS.json`, `FRANKS.json`, `GURJARAS.json`, `PERSIANS.json` y `VIETNAMESE.json` consultados directamente. Es fuente primaria del dataset comunitario, no una garantía oficial de balance.
3. [AoE2Insights: perfil público con aperturas y resultados](https://www.aoe2insights.com/user/199325/). Las aperturas mostradas pertenecen a encuentros históricos. El endpoint usado por el proyecto es una interfaz del sitio y su contrato puede cambiar; no presumir estabilidad de una API oficial con SLA.
4. [aoc-mgz: preguntas frecuentes](https://github.com/happyleavesaoc/aoc-mgz/blob/master/README.md#frequently-asked-questions). Explica la estructura de estado inicial más comandos y que recursos/bajas en un instante requieren reproducir el encuentro. Fuente del propio parser, no de terceros que prometen “live stats”.
5. [CaptureAge: descripción oficial](https://captureage.com/cade/docs/cade-latest/overview). Es un cliente de espectador; la documentación condiciona ver la propia partida en vivo a cheats habilitados. Sus estadísticas de espectador no son una integración lista para usar durante una ranked propia.
6. [Age of Empires: Military & Economy](https://www.ageofempires.com/learn-to-play/military-and-economy-aoe2/). Fundamenta la separación entre clases, edificios, economía y funciones; no valida pesos numéricos del índice.
7. [Age of Empires: presentación de Dynasties of India](https://www.ageofempires.com/news/dynasties_of_india_is_here/). Confirma Camel Scout y unidades gurjaras al introducirse la expansión. No reutilizar sus cifras de balance de lanzamiento como valores actuales.

No se consultaron salas de chat, mensajes privados ni credenciales. La investigación usa únicamente el código local y recursos públicos de sus propios autores.
