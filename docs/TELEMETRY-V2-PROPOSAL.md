# Telemetría v2: propuesta para combate, economía y edades

Estado: **diseño, todavía no aceptado por el normalizador v1**. No enviar este formato al importador actual. La implementación necesitará un adaptador v2 con validación y migración explícitas, manteniendo legible el historial v1.

El primer bloque ya incorpora un [motor de eventos de combate v1](COMBAT-EVENTS.md) y un campo opcional `combat` en el sobre existente. Esa interfaz compacta no implementa todo el formato v2 propuesto aquí ni obtiene eventos automáticamente del juego.

## Objetivo

Responder con datos a cuatro preguntas durante cada edad del jugador: cuántos aldeanos eliminó, cuántos perdió, cuántos militares eliminó y cuántos perdió. El mismo contrato permitirá recursos recolectados, crecimiento económico, intercambios y logros.

## Sobre del análisis

Conservar identidad de partida/perfil, mapa, modo, parche, velocidad, edad inicial, fuente y versión. Agregar:

- `analysisId` y `schemaVersion: 2`.
- `source.capabilities`: métricas y atribuciones realmente soportadas.
- `coverage`: intervalos de reloj de juego cubiertos, por jugador y familia de eventos. No derivar cobertura completa del mero hecho de que el archivo se leyó.
- `roster`: IDs de perfil, número de jugador, equipo y civ; usar el mismo mapeo durante toda la partida.
- `ages`: llegadas **completadas**, por jugador. Una orden de investigación se conserva como `research-ordered`, nunca como `age-reached`.
- `events`: eventos con identificador estable y orden temporal.
- `series`: muestreos económicos opcionales, con definición y resolución temporal.
- `warnings`: capacidades ausentes, huecos y contradicciones.

Los campos faltantes siguen ausentes. `null`, cero y ausencia no son equivalentes. Tiempos en segundos del reloj de juego, finitos y no negativos. Todas las reglas de comparación incluyen `source.version` y el identificador de definición.

## Eventos mínimos

Ejemplo **sintético** de formato, no una partida real:

```json
{
  "id": "synthetic-fixture:death:00042",
  "type": "unit-died",
  "gameSeconds": 1180.25,
  "unitInstanceId": "unit-482",
  "unitTypeId": 83,
  "unitCategory": "villager",
  "ownerProfileId": 202,
  "killerProfileId": 101,
  "cause": "enemy-combat",
  "attribution": "confirmed",
  "cost": {
    "food": 50,
    "wood": 0,
    "gold": 0,
    "stone": 0,
    "definition": "nominal-unit-replacement-cost-at-death-v1"
  }
}
```

El coste es opcional. El ejemplo usa coste nominal de reemplazo al morir, calculado con civ, mejoras y parche conocidos; no afirma cuánto se pagó originalmente por esa unidad. Si queremos inversión real, hace falta un dato de coste de entrenamiento completado y una definición distinta.

| Evento | Campos específicos mínimos | Uso |
| --- | --- | --- |
| `age-reached` | Jugador, edad, tiempo confirmado | Intervalos por edad |
| `research-ordered` | Jugador, tecnología, edificio, tiempo | Decisiones de investigación sin confundir finalización |
| `research-completed` | Jugador, tecnología, tiempo | Mejoras efectivas y recomendaciones |
| `unit-created` | Jugador, instancia, tipo/categoría, origen confirmado | Entrenamientos frente a regalos/conversiones |
| `unit-owner-changed` | Instancia, dueño anterior/nuevo, motivo | Conversiones y atribución posterior |
| `unit-died` | Instancia, dueño al morir, categoría, causa, autor si existe | Pérdidas y eliminaciones |
| `unit-removed` | Instancia, dueño, motivo si se conoce | No convertir desapariciones desconocidas en muertes de combate |

Categorías iniciales: `villager`, `military`, `fishing-ship`, `trade`, `other-economic`, `building`, `other`, `unknown`. Una unidad no clasificada no entra automáticamente en militares. Las excepciones de civ se resuelven con dataset por parche y origen de la unidad.

## Agregación por edad

1. Validar análisis y roster frente a la partida esperada, usando la identidad del archivo o la fuente real, no copiando simplemente el match ID solicitado.
2. Verificar orden temporal y llegadas de edad. No asumir Oscura si la edad inicial se desconoce.
3. Obtener intervalos `[llegada, siguienteLlegada)` para la perspectiva elegida; el último termina en el fin de partida confirmado.
4. Usar solo cobertura completa para afirmar ceros, notas y logros que dependen del intervalo completo. Con cobertura parcial se puede mostrar «al menos X eventos observados» con esa etiqueta.
5. Deduplicar por fuente/análisis/evento y detectar contradicciones entre un mismo ID y contenidos distintos. No fusionar dos fuentes como si fueran dos muertes distintas.
6. Una muerte confirmada de unidad propia suma una pérdida; la causa distingue enemigo, propia, Gaia o desconocida. Solo un autor enemigo confirmado suma una eliminación.
7. El dueño usado es el de ese instante. Las conversiones no suman muertes y no dejan atribuciones al dueño anterior.
8. Agregar por categoría. Cualquier valor de recursos requiere coste conocido y una definición compatible.
9. Reconciliar sumas por edad y total del mismo alcance; publicar advertencia o rechazar la dimensión afectada ante contradicción.

El reporte incluirá `perspectiveProfileId`, `age`, `interval`, `coverage`, `villagersKilled`, `villagersLost`, `militaryKilled`, `militaryLost`, `unattributedDeaths`, `valueDestroyed`, `valueLost` y `definition`. Cada campo medido tendrá procedencia. Las muertes por friendly fire, Gaia o borrado pueden aparecer en el detalle de pérdidas, sin acreditarlas como kills del rival.

No inferir bajas por diferencia de población: entrenamientos, conversiones, regalos y transformaciones pueden cambiarla. No inferir muertes de órdenes de ataque.

## Economía y comparaciones

Para recursos recolectados, definir si incluye pesca, comercio, reliquias, mercado y tributos. La primera tarjeta separará recolección de compra/venta y transferencias. Comparar ambos jugadores en **el mismo intervalo de reloj**, con definición y cobertura idénticas.

```text
ventaja de recolección = 100 × (recolección propia − recolección rival) / recolección rival
```

Con denominador cero, ausente o demasiado pequeño para una comparación estable, mostrar valores absolutos y no un porcentaje. El mínimo de estabilidad debe fijarse por métrica y modo. Diferencia entre porcentajes se expresa en puntos porcentuales; cambio relativo se expresa en porcentaje.

Si la fuente solo ofrece muestreos cada N segundos, una baja o producción individual dentro de ese tramo no tiene un timestamp exacto. No ubicarla arbitrariamente antes/después de una llegada de edad. Publicar el intervalo de incertidumbre o dejar el desglose pendiente.

## Pruebas de aceptación del futuro adaptador

- Llegadas desfasadas entre jugadores; un evento exactamente en un cambio de edad; partida que termina durante una edad.
- Inicio Oscuro, Feudal, Imperial y desconocido; tiempo real diferente del reloj de juego.
- Cola cancelada y tecnología cancelada que no generan creación ni llegada completadas.
- Conversión seguida de muerte, desaparición sin causa y muerte sin autor.
- Gaia, eliminación propia, friendly fire, pesqueros, comercio y unidades especiales.
- Mismo evento duplicado; ID repetido contradictorio; análisis repetido que no duplica medallas.
- Reconciliación por edad/total y atribución por jugador/equipo.
- Cero medido frente a cobertura parcial y ausencia de datos.
- Coste desconocido o incompatible que conserva conteos pero desactiva el cálculo de valor.
- Replay ajeno, perfil equivocado, fuente/versión no compatible y datos contradictorios.

Fixtures sintéticos comprueban el motor; al menos un fixture real revisado en reproducción comprueba que el proveedor entrega la semántica prometida. Aprobar solo lo primero no demuestra que la integración funcione.
