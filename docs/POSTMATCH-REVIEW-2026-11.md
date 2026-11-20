# Postmatch como herramienta de práctica

Revisión del 19 de noviembre de 2026 sobre `main` en `45424b2` (2.2.0). El análisis automático descarga un replay y lee sus órdenes. El motor experimental de producción por edificio existe por separado. El pipeline de postmatch todavía no utiliza sus cifras de producción o inactividad.

## Qué está respaldado

En cinco replays locales de 8 jugadores, el parser leyó entre 152.590 y 331.273 operaciones en 235–471 ms. La reconstrucción de producción tardó otros 10–61 ms en esa prueba. Son tiempos locales de cálculo, con el archivo disponible. Descarga, disponibilidad de Microsoft y repintado son dependencias distintas.

La lectura distingue tres niveles:

| Evidencia | Ejemplo | Uso |
| --- | --- | --- |
| Orden registrada | A qué minuto pediste avanzar, encargaste un monje o marcaste un TC | Hitos comparables de una apertura |
| Reconstrucción | Qué edificio probablemente recibió una orden con varios seleccionados | Diagnóstico interno hasta contrastarla con el estado real |
| Estado medido | Investigación completada, aldeanos vivos, duración real del idle y bajas atribuibles | Calificación o momentos destacados con cobertura confirmada |

Pruebas que bloquearían conectar el motor tal como está: `offline.js` registra el `Research` como edad, y `model.js` lo devuelve con semántica de llegada. Una fila de agregados parcial puede generar una pérdida cero por defecto. `idle.js` considera el hueco durante una investigación como inactividad y la orden con dos TCs seleccionados ocupa ambos en la reconstrucción. `production.js` sí atribuye cada orden a un solo edificio, pero esa atribución sigue siendo una reconstrucción. Las series de checksums requieren corroborar el significado de cada campo antes de etiquetarlo.

El adaptador automático aceptaba un replay con el perfil correcto y un contexto de partida incompatible. Ahora compara el roster humano completo y comprueba la hora cuando ambas fuentes la traen. Una partida local de Arena coincidió en roster y tuvo 22 s de diferencia entre los relojes del replay y Companion. El adaptador usa 180 s de tolerancia por la carga y usa el ID solicitado a Microsoft como origen de la asociación.

## Qué entra en esta iteración

- El overlay prioriza un hito de la partida. En Arabia y Runestones, para aperturas reconocidas de Scouts o arqueros, contrapone la orden de avanzar a Feudal con la primera orden de entrenar la unidad. En Arena, tras una apertura compatible con Fast Castle, muestra la primera inversión observada entre monje, caballero y construcción de TC.
- En RM 1v1 el tiempo se contextualiza frente a la mediana del mismo mapa, modo, civ, apertura, hito, velocidad, build y definición de datos. Se muestran hasta ocho referencias anteriores y la comparación empieza con tres. Ajustes expone la serie cronológica, con el dato actual resaltado. Un cambio en el tiempo es descriptivo: el jugador decide qué quiere entrenar.
- Los tiempos se muestran como órdenes del replay y la serie queda en Ajustes. Se retiró la medalla por la transición más corta. Un tiempo anterior por sí solo no evalúa la decisión. Véase la [investigación de contexto competitivo](POSTMATCH-RESEARCH-AOE2.md).
- En TG se muestra el hito cuando existe. La comparativa exige contexto de rol y todavía queda desactivada. Empire Wars y los inicios distintos quedan fuera de esta primera tarjeta.
- El castillo/avance identifica la primera orden. Scout, arco, monje, yelmo y centro urbano distinguen la segunda según la acción leída. Los cuatro últimos emblemas se hicieron con el generador integrado, como grabados de latón con fondo transparente. La unidad ilustrada identifica una orden que el jugador dio.
- El historial público y el replay actualizan el informe por separado. Ajustes mantiene el informe detallado. Una consulta del perfil o de la partida anterior no debe pisar el informe vigente. Los permisos de replay y comparativa se siguen aplicando antes de IPC.

## Orden para la siguiente iteración

1. **Seguir un objetivo elegido por el jugador.** Probar con usuarios que juegan series en el mismo mapa. Confirmar que puedan ver sus intentos comparables y decidir por cuenta propia qué mirar en el siguiente replay. La decisión de guardar un objetivo se toma en Ajustes, fuera de la partida.
2. **Cerrar el circuito con prematch.** Recuperar un objetivo que el usuario eligió si es pertinente al mapa y la civilización. Presentar los patrones del rival con sus muestras y el contexto que hace comparable cada dato. La prioridad interna por árbol y resultados necesita calibración antes de mostrar un número.
3. **Añadir estado en ventanas que importan.** Validar primero una apertura estándar y una llegada a Castillos contra una reproducción de referencia. Distinguir TC ocupado avanzando, producción de aldeanos detenida, cantidad de centros realmente operativos y situación de la partida. Una fecha de avance o más comandos no otorgan una calificación.
4. **Agregar contexto antes de ampliar cobertura.** Arena requiere separar pelea de reliquias, presión y boom. En TG, distinguir flank y pocket cuando sea posible y la función acordada. En mapas abiertos importa qué pudo hacer el jugador con esa primera producción. Un contador global vuelve a perder estas diferencias.

## Competencia y progresión

Una referencia personal y un percentil de jugadores responden a preguntas distintas. La primera sale del historial local. Antes de proponer un percentil se debe validar qué métrica representa la ejecución que el jugador eligió practicar. Un tiempo de avance aislado no reúne ese criterio, incluso si hay suficientes replays.

Una cohorte piloto tendría que limitarse a partidas y ventanas compatibles, con una banda de ELO del modo y la misma definición de métrica. Para un percentil de jugadores, el volumen de partidas de una persona no puede dominar la muestra. El tamaño mínimo y la banda son decisiones de calibración, no valores ya validados.

Hoy hay una serie personal descriptiva. Todavía no hay percentil poblacional ni servicio de agregación.

AoE2Insights ya ofrece curvas, idle de TC y análisis detallado. El espacio para diferenciar a este helper es recuperar lo que el jugador decidió observar cuando vuelva a un contexto comparable y mostrarle cómo cambió. Referencias: [análisis de AoE2Insights](https://www.aoe2insights.com/pro/), [formato y parser aoe2rec](https://github.com/aoe2ct/aoe2rec), [Scouts](https://aoecompanion.com/build-guides/scout-rush), [arqueros](https://aoecompanion.com/build-guides/archer-rush) y [Fast Castle de economía](https://aoecompanion.com/build-guides/fast-castle-boom).
