# Smart Build Order: alcance de la referencia automática

Implementación: `src/build-orders.js`; método `smart-build-reference-v1`. Función ProMax configurada mediante un toggle en el launcher **antes de jugar**. El overlay muestra una guía sugerida con iconos y cinco hitos; no requiere interacción.

## Qué reconoce

Usa la civilización propia, mapa y modo confirmados del roster. En mapas abiertos puede aprovechar la ruta Feudal viable mejor puntuada por oportunidades; si falta esa señal, usa disponibilidad tecnológica y afinidad editorial de la civ. En mapas cerrados revisados considera FC hacia economía. Turcos en Arena activa la variante especializada FI hacia pólvora.

El módulo usa una lista positiva de mapas terrestres revisados y RM 1v1. No recomienda una receta genérica para EW, TG, agua, Nomad, MegaRandom, mapa desconocido o una edad inicial distinta de Oscura. También se abstiene si se informa inicio/configuración no estándar. El feed no expone todos los ajustes del juego: reconocer RM y mapa no verifica por sí solo cada ajuste de recursos o población. Los contextos especiales necesitan referencias propias.

La civ permite sugerir una apertura; **no detecta la apertura que el usuario ejecuta en vivo**. Los datos actuales tampoco revelan reparto de aldeanos, recursos, edificios completados, edad actual o cola de producción. La guía conserva el rótulo **Guía de referencia · pasos actuales sin medir**. No tiene paso actual, marcas de completado, barra de progreso ni cambios de edad por reloj de pared.

## Biblioteca

| Referencia | Hitos resumidos | Condición y límite |
| --- | --- | --- |
| Scouts | Comida inicial; madera/bayas; preparación del avance; cuartel/establo; producción y granjas | Necesita Scouts entrenables. Cierres y lanzas pueden invalidar una inversión exclusiva |
| M@A → Arqueros | Comida; madera/cuartel; milicias/oro; mejora en Feudal; galería/herrería/transición | Necesita milicias, M@A y arqueros compatibles; la comida de milicias compite con la subida |
| Arqueros | Comida inicial; madera/bayas; oro en transición; galería/herrería; continuidad | No garantiza una o dos galerías sin presupuesto; avisa si no existe ballestero genérico |
| FC → Economía | Economía inicial; madera/oro; edificios de subida; centros urbanos; aldeanos/granjas y defensa | FC no implica caballeros ni unidad única. La referencia tiene objetivo económico |
| FI → Pólvora | Economía protegida; edades previas/oro; habilitación de Imperial; producción; protección del ejército | Variante revisada de Turcos en Arena, no FI universal ni tiempo óptimo del parche actual |

Los textos son hitos editoriales propios, no una receta certificada con población y tiempos exactos. La biblioteca del launcher conserva las cinco referencias con su compatibilidad y condiciones; el overlay prioriza solo la sugerida.

## Excepciones modeladas

- Chinos y Mayas: inicio de aldeanos/recursos distinto; se evita numeración genérica.
- Hunos: sin receta de casas.
- Jemeres: prerrequisitos habituales de edificios omitidos.
- Búlgaros: mejora gratuita a M@A.
- Armenios y Georgianos: referencia al carro de mulas/puntos de entrega.
- Italianos: se advierte que descuentos de avance cambian el presupuesto; sin costes genéricos presentados como exactos.
- Gurjaras: abstención hasta disponer de una variante revisada para ganado guarnecido y Camel Scout.

Estos ajustes no cubren todos los bonos, mapas o variantes. No existe una simulación presupuestaria ni estado de ejecución.

## Fuentes y verificación

Las fuentes de estructura son las guías de [Scouts](https://aoecompanion.com/build-guides/scout-rush), [M@A → Arqueros](https://aoecompanion.com/build-guides/men-at-arms-archers), [Arqueros](https://aoecompanion.com/build-guides/archer-rush), [FC → Economía](https://aoecompanion.com/build-guides/fast-castle-boom) y [FI](https://aoecompanion.com/build-guides/fast-imperial) de AoE Companion, la [variante turca de Morley](https://www.youtube.com/watch?v=7TVgpsKBxWk) y la [guía oficial de edades](https://www.ageofempires.com/learn-to-play/advancing-aoe2/). Las recetas históricas no certifican balance ni población óptima de 2026.

`node tools/build-orders-test.js` comprueba selección por contexto, líneas ausentes, excepciones, abstenciones y ausencia de progreso simulado. La [investigación original](RESEARCH-BUILD-ORDERS.md) documenta las variantes y futuras necesidades de telemetría. Las pruebas offline no sustituyen una revisión de una partida real.
