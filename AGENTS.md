# Flujo de producto de AoE2 Helper

## Descubrimiento del código

Usar codebase-memory-mcp para arquitectura, relaciones e impacto. Empezar por list_projects, search_graph, trace_path, search_code y get_code_snippet. Si el MCP no está expuesto, usar el CLI local de Hermes.

## Antes de implementar una función visible

1. Escribir la decisión que la app ayuda a tomar y un caso real de AoE2 que la justifique. Indicar mapa, modo, etapa y lo que el jugador ya sabe en ese momento.
2. Verificar la fuente en registros reales. Anotar identidad, fecha, recorte, denominador, empates, datos ausentes y definición. Las probabilidades requieren evaluación temporal y calibración. Una orden del replay y un efecto en partida se registran como señales distintas.
3. Hacer tres revisiones independientes, de datos, contenido competitivo y UX visual. Cruzar al menos una objeción antes de elegir el diseño. Dar a cada revisor una pregunta acotada y registrar qué cambió por su revisión.

## Diseño y comprobación

- Construir la primera lectura alrededor de una pregunta. Mantener la evidencia y los estados de cada opción accesibles. Prematch prioriza al rival y el postmatch sitúa los hechos en el reloj compartido. La llegada efectiva es el hito visible de edad.
- Usar una familia de iconos propia en toda la app. Generar arte raster cuando el motivo identifica contenido del juego o una función del producto. Diseñar como pictogramas simples a su escala de uso y reutilizar el mismo motivo para el mismo significado. Revisar recorte, contraste y reconocimiento real entre 16 y 32 px.
- Antes de integrar, adjuntar pruebas reproducibles de datos y capturas de Electron a tamaño de uso. Revisar tipografía, jerarquía, comportamiento con datos tardíos o ausentes y claridad con todas las opciones activadas. En cambios de experiencia, definir un test con jugadores y distinguir lo ejecutado de lo pendiente.
- Enseñar el resultado verificado y los límites de cobertura. Mantener el trabajo centrado en experiencia de juego y calidad del producto.
