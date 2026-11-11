## Corregido

- El informe del rival ahora calcula la civilización del mapa con **todo el historial de ese mapa** en el modo exacto (RM 1v1, RM Team, EW, etc.). Antes una muestra de 20 partidas podía quedar dominada por una racha reciente y mostrar una civ equivocada.
- La civ y el winrate del mapa ya no mezclan mapas ni modos de juego.
- La estrategia del mapa solo se muestra si hay replays de **esa civ en ese mapa**. Si no hay replays de esa combinación, se indica claramente y no se usa la apertura general ni la de otra civ.
- El historial se pide filtrado por ladder, evitando datos incompletos y errores de límite de la API.
- El bloque de mapa/civ aparece primero y las aperturas se consultan en paralelo, para tener la información antes de que empiece la partida.

## Agregado

- Ventana de configuración sin la barra nativa de Windows, con una barra oscura propia.
- Tiempo de ocultado configurable entre 0:10 y 1:00.
- Aviso al activar la Ayuda de civ que ofrece aumentar la visibilidad a 0:40 para leerla con calma.
