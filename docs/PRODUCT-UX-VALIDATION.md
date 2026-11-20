# Validación de experiencia en AoE2 Helper

## Qué se prueba

El prematch abre con el roster y, cuando hay replays, con una apertura observada, su denominador y alcance. La pregunta de scouting aparece solo en un recorte del mapa y para una apertura reconocida. Las referencias estáticas por edad quedan en Ajustes → Durante. La mediana de RM 1v1 en TG describe el roster. El ELO individual no predice el balance del partido.

El postmatch compara órdenes al mismo minuto de juego. En RM 1v1 estándar, Arabia, Runestones y Arena, el corte queda inmediatamente antes de la primera orden a Castillos. Se muestran ambas horas, qué encargó cada jugador hasta el corte y, cuando existen dos órdenes, qué añadió el que avanzó después. La comparación conserva el resultado y separa pedidos, unidades disponibles y efectos. Si no se puede validar el intervalo, quedan los hitos del replay. Los replays v3 conservan las comparaciones que usan la misma definición de los tiempos.

## Prueba con jugadores

Reclutar 10 jugadores de ranked 1v1 entre tres rangos de ELO y con experiencia en Arabia y Arena. Sumar una ronda separada con jugadores de TG para reconocer el papel de flank y pocket y la densidad del roster. Son tamaños iniciales para encontrar problemas, no una muestra representativa. Alternar el orden entre la UI anterior y la nueva, usar perfiles y grabaciones comparables, y pedir que describan lo que ven sin explicar la interfaz de antemano.

| Tarea | Escenario | Qué registrar | Meta de la primera ronda |
| --- | --- | --- | --- |
| Leer el prematch | 15 s de cuenta regresiva. Un rival con muestra del mapa y otro caso con coincidencias solo del modo. | Si recuerda mapa y rival, interpreta qué partidas integran la muestra e identifica qué comprobaría en la partida. | Al menos 8 de 10 completan la lectura. Una interpretación de pronóstico como certeza se investiga antes de ampliar la beta. |
| Revisar una derrota | Arabia #520379962. Los clics separados por pocos segundos y las colas son distintas. | Si encuentra el minuto de corte, separa pedidos de unidades en campo y menciona qué evidencia adicional buscaría. | Al menos 8 de 10 en 30 s sin ayuda. |
| Revisar una victoria con clic tardío | Arena #521092784 y un caso de replay sin ventana comparable. | Si distingue la demora observada de una mala decisión, y encuentra el estado disponible cuando falta el cruce. | Al menos 8 de 10 encuentran el momento o el motivo de ausencia. |
| Volver por evidencia | Reabrir Ajustes tras el cierre automático y buscar el tramo relevante. Probar opciones de detalles y comparativa. | Tiempo, errores de navegación, etiquetas confusas y trabajo que el usuario quiere repetir. | Completar la recuperación sin ayuda y registrar los casos fallidos. |

Después de corregir la ronda moderada, medir dos semanas de uso optativo en partidas reales. Registrar qué proporción de partidas recibe información útil a tiempo, cuántos informes se reabren y cuándo los jugadores ocultan el overlay por distracción. Una prueba útil distingue fallo de fuente, falta de cobertura y desactivación elegida. No registrar nombres ni texto de chat para medir estas conductas.

## Comprobación visual y nativa

1. Capturar la misma partida y configuración antes y después. Guardar modo, flags, estado observado, resolución, escala e imagen. Comparar estado de carga y resultado estable por separado.
2. Probar 1366×768, 1080p y 4K y escalados 100–200 %. Añadir dos monitores de diferente DPI, tema claro y oscuro y nombres largos. Comprobar texto legible, ningún recorte y que el resumen se mantenga compacto antes de abrir detalle.
3. En el ejecutable instalado, comprobar clics y foco en ventana y modo sin bordes, Alt+Tab, mover de pantalla, F2 activo y desactivado, y regreso al paso de clics tras reposicionar el overlay. Las capturas de Electron no verifican esos comportamientos por sí solas.
4. Ejecutar sala → partida → final → replay tardío → sala siguiente. Repetir con error de red, replay incompleto, cambio de perfil y reinicio del renderer. Verificar que nunca se dibujan datos de la partida anterior.

## Revisiones independientes

- Un agente reproduce el corte y el intervalo entre órdenes, audita la separación de fuentes y prueba cargas incompatibles y replays anteriores. Registra cualquier discrepancia con hora y fixture.
- Otro agente compara las capturas y prueba que cada opción comunica correctamente sus estados. Incluye una revisión de jerarquía, solapamiento y lectura de los denominadores.
- Una tercera revisión evalúa el flujo en Windows y los límites de la automatización. El implementador corrige, pero no reemplaza la revisión independiente ni la sesión con jugadores.

En esta iteración se hicieron revisiones independientes de datos, UX y comprobación nativa, pruebas deterministas y capturas de desarrollo. La matriz del instalador, la prueba moderada con jugadores y la beta de dos semanas quedan pendientes.
