# Prematch y postmatch · evidencia y criterios de producto

## Anticipar al rival

Antes de conocer la civilización, predecir la civilización efectivamente jugada usando el mapa, modo, Elo previo e historial disponible. La fuente no permite distinguir picks manuales de asignaciones al azar. Evaluar retrospectivamente dos cortes cronológicos por corpus. Cada fila entra al historial estrictamente después de su fin más un margen supuesto de diez minutos. Las predicciones se registran por ID y perfil, con verdad observada y las tres primeras opciones de cada modelo.

- Junio y julio: 361.852 partidas RM 1v1 utilizables, 217.112 decisiones evaluadas. 27 días con filas y un hueco de seis días. El campo de parche de ese corpus vale 0.
- Noviembre: 192.159 partidas RM 1v1 de PC utilizables, 115.296 decisiones evaluadas. Archivos de Companion del 12 al 19 de noviembre. La evaluación reconstruye el historial de esos ocho archivos; el overlay todavía debe acreditar qué señales llegan antes de revelarse la civ.
- La recencia + mapa ganó Top 3 en ambos corpus. El historial simple ganó log-loss agregado y por bloque. Mantener por separado precisión de una sola opción, utilidad de una lista de tres y calidad probabilística. Falta calibración, validación con catálogo oficial según versión y disponibilidad medida en el lobby real.
- Con ambas civs confirmadas, el valor pasa a la apertura y al cruce. Un Fast Castle aporta una observación de apertura, y su continuación exige evidencia propia. Una debilidad exige que el rival rinda peor que su referencia comparable, con medidas de cobertura y evaluación futura.

### Cruce por rival y civilización

Comparar al mismo rival, mapa, parche y civ propia del rival. Ajustar por diferencia de Elo entre jugadores. Usar sólo partidas previas terminadas. El filtro exploratorio pide al menos seis antecedentes ante la civ específica y veinte contra otras. Sobre 114.754 cruces futuros evaluados, 109 cumplieron el filtro. Log-loss 0,6811 ajustando por esa civ, frente a 0,6800 sin ese ajuste. Dato de cobertura del recorte observado de ocho archivos, no de la carrera completa. El tamaño de muestra y el resultado impiden presentar ese ajuste como debilidad comprobada. El banco de aperturas requiere replays etiquetados y sus propios controles de cobertura, civ y modo.

## Revisar y volver a probar

Dar al jugador una pregunta que pueda contrastar en el replay. La primera vista muestra el episodio, el minuto y la diferencia entre ambos jugadores. El detalle mantiene una misma escala de tiempo y distingue órdenes, unidades efectivas, pérdidas y continuidad económica. El objetivo elegido se retoma en el siguiente episodio comparable, con las partidas elegibles y los motivos de exclusión.

- Arabia. Comparar de la primera presión hasta la transición. Cruzar ejército efectivamente presente, pérdidas y continuidad de producción para separar una inversión útil de órdenes que no llegaron a presionar. Contraejemplo: dos llegadas a Castillos igual de tardías, una con presión y economía y otra sin ninguna.
- Arena. Comparar qué inversiones se materializaron tras llegar a Castillos y cómo se movieron economía y control del mapa. Dos FC a la misma hora pueden alimentar planes diferentes. Clasificar el plan a partir de la continuación observada.
- Probar comprensión a tamaño real durante ocho segundos. Pedir que el jugador diga contra quién juega y explique el denominador, o indique qué episodio revisaría y cuál de sus partidas compararía. Después verificar si encontró el mismo episodio en otra partida. La revisión visual de agentes fue ejecutada. La prueba moderada con jugadores sigue pendiente.

## Evidencia y ejecución

- Corpus publicado en [AOE2 Complete Guide](https://aoe2-guide.vercel.app/data) y [dumps de Companion](https://www.aoe2companion.com/more/api). Python con pandas, numpy y pyarrow. Ejecutar tools/pronostico-civ-corpus.py para el primer corpus, o tools/preparar-corpus-companion.py, tools/pronostico-civ-corpus.py --companion y tools/validar-cruce-civ.py para el segundo.
- Casos y fuentes de juego [Sitaux, Arabia](https://sitaux.com/arabia/), [Toaster, Arena](https://www.youtube.com/watch?v=VYHSu5EByDg), [CaptureAge, estadísticas y series](https://captureage.com/cade/docs/cade-latest/match-statistics).
- Datos. Un agente recalculó Top 1 y Top 3 de 217.112 predicciones de junio con cero discrepancias en los historiales elegibles. Señaló el campo de parche vacío de significado, el hueco y la falta de timestamp real de publicación.
- Competitivo. Un agente detectó que el perfil vigente confundía Fast Castle con boom y que el ranking de derrotas requiere referencia comparable. Los casos de aceptación simulan continuaciones divergentes de una misma apertura.
- Visual. Un agente revisó ambas capturas a 560 px. Se cambió el título a «Aperturas del historial» y se añadió una etiqueta común para los encargos. Capturas y HTML están en la carpeta de evidencia. El HTML es un prototipo de interacción con una partida real.
