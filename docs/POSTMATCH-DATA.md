# Postmatch: contrato y evaluación personal

El resultado y la comparación de resultados por mapa se pueden mostrar al finalizar la partida. Las métricas de ejecución se añaden cuando existe telemetría del replay que corresponde a esa partida y jugador. Una victoria, una apertura detectada o un tiempo de partida no permiten calificar la ejecución de Feudal o Castillos.

## Integración

```js
const { PerformanceStore, buildPostMatchReport, completedMatchTransition } = require('./src/postmatch');
const performanceStore = new PerformanceStore({
  filePath: path.join(DATA_DIR, 'performance-history.json'),
  log,
});

// Este guard evita abrir automáticamente una partida histórica al arrancar.
const finished = completedMatchTransition(previousSnapshot, nextSnapshot, profileId);
if (finished) {
  performanceStore.recordMatch(finished, profileId);
  const report = buildPostMatchReport({
    match: finished,
    profileId,
    records: performanceStore.list(profileId),
    historyRows: ownHistory.rows,
    historyError: ownHistory.error,
  });
  // Enviar report al overlay y a la pantalla de revisión.
}

// Después de analizar un replay validado:
performanceStore.recordMatch(finished, profileId, normalizedTelemetry);
const enriched = buildPostMatchReport({
  match: finished, profileId, records: performanceStore.list(profileId),
  historyRows: ownHistory.rows,
});

// Al cerrar la aplicación:
performanceStore.flush();
```

`completedMatchTransition` necesita haber observado `previous.status === 'ongoing'` fuera del lobby. `next.status` debe ser `idle` y `next.lastMatch` debe ser el mismo match ID, finalizado. Un socket desconectado o una respuesta de red fallida no confirman el final de la partida.

`recordMatch` no guarda partidas con `ongoing: true`. La combinación perfil + match ID es única. Una respuesta posterior incompleta conserva el resultado y la telemetría confirmados; una modificación del contexto vuelve a validar la asociación del replay.

Cada registro incluye `record.match`, una copia normalizada del contexto y roster de la partida sin datos de rating adicionales. `performanceStore.getMatch(profileId, matchId)` restaura esa partida después de reiniciar la aplicación, por ejemplo para asociar un replay importado posteriormente. Devuelve `null` si no existe para ese perfil.

El historial local guarda hasta 1.000 resultados, como máximo 8 MB. Escribe primero un temporal y después reemplaza el archivo. El constructor informa los errores mediante `lastError` y `log`; `flush()` devuelve un booleano. `.list(profileId)` entrega copias, sin permitir mutaciones indirectas del almacén.

## Datos públicos que están disponibles ahora

El objeto normalizado de `src/aoe.js` conserva mapa, modo, jugadores, civilizaciones, equipos, resultado, fecha de inicio, fecha de finalización y variación de rating de la partida. El historial propio de `src/mine.js` aporta resultados anteriores por mapa y modo.

La comparación excluye la partida actual, partidas futuras, partidas sin fecha, otros mapas, otros modos y otros perfiles. Deduplica por match ID. Los resultados desconocidos tienen un contador independiente y nunca cuentan como derrotas. Un error de historial produce un estado `error` o `partial`, sin mostrar un 0 % ficticio.

`finishedAt - startedAt` mide tiempo real. El reloj de juego usa otra escala y puede depender de la configuración de velocidad. Por eso el contrato entrega:

- `result.elapsedSeconds`: tiempo real entre las fechas públicas.
- `result.durationSeconds`: reloj de juego, únicamente cuando lo aporta telemetría con `clock: 'game'`.

AoE2Insights mantiene su resumen básico, build orders y APM gratuitos, según su [explicación oficial de Pro](https://www.aoe2insights.com/pro/). Las curvas económicas y de inactividad más profundas son una capa distinta. Esto no constituye un contrato público de API que esta aplicación pueda asumir; el adaptador debe obtener y validar métricas concretas o dejarlas pendientes. La aplicación no dispara compras ni análisis de pago en otra plataforma.

El parser primario [aoc-mgz](https://github.com/happyleavesaoc/aoc-mgz) soporta `.aoe2record` y documenta que el archivo contiene un estado inicial y una secuencia de comandos. Su FAQ distingue estos comandos de los contadores de recursos o bajas que requieren reproducir el estado del juego. Por tanto, no calculamos TC inactivo, aldeanos inactivos, bajas ni eficiencia a partir de simples huecos entre órdenes. Los APM derivados de comandos deben identificarse con su propia definición, sin presentarse como el mismo eAPM de otra herramienta.

## Telemetría normalizada: versión 1

Ejemplo de estructura; los valores de este bloque son ilustrativos, no datos que deba mostrar producción:

```json
{
  "schemaVersion": 1,
  "matchId": "123456789",
  "profileId": 12345,
  "clock": "game",
  "source": {
    "id": "my-replay-parser",
    "version": "1.0.0",
    "type": "replay-analysis",
    "label": "Replay local"
  },
  "context": {
    "mapName": "Arabia",
    "leaderboardId": 3,
    "civ": "Franks",
    "opening": "Scout rush",
    "gameSpeed": "normal",
    "startingAge": "dark",
    "patch": "confirmed-game-build"
  },
  "durationSeconds": 2100,
  "metrics": {
    "apm": { "value": 120, "definition": "game-command-count-v1" },
    "eapm": { "value": 60, "definition": "effective-command-count-v1" },
    "feudalSeconds": { "value": 620, "definition": "age-reached-game-seconds-v1" },
    "castleSeconds": { "value": 1200, "definition": "age-reached-game-seconds-v1" }
  },
  "phases": {
    "opening": {
      "reached": true,
      "complete": true,
      "durationSeconds": 620,
      "metrics": {
        "tcIdleRatio": { "value": 0.02, "definition": "tc-production-opportunity-idle-v1" },
        "housedRatio": { "value": 0.01, "definition": "population-production-blockage-v1" },
        "villagerIdleRatio": { "value": 0.03, "definition": "villager-time-weighted-idle-v1" }
      }
    },
    "feudal": { "reached": true, "complete": false, "durationSeconds": 580, "metrics": {} },
    "castle": { "reached": false }
  }
}
```

Campos que no se pueden medir se omiten. Cero es un valor medido válido y no es un sustituto de un campo ausente. `source.type` acepta `replay-analysis` o `game-telemetry`; esta atribución no autentica al proveedor. La identidad del archivo debe verificarse dentro del adaptador de importación antes de crear este objeto.

`normalizeTelemetry(raw, expected)` comprueba versión, identidad, mapa, modo, civilización, reloj, procedencia y contexto básico. Rechaza tiempos de edades contradictorios y métricas fuera de rango. No acepta números como strings ni convierte `null` en cero.

Las definiciones son identificadores de una semántica estable, no etiquetas decorativas. Deben documentar, por ejemplo, si TC inactivo excluye investigación de edades, cómo pondera varios TCs, qué se considera población bloqueada y qué acciones cuentan para APM. Cambiar la semántica requiere cambiar el identificador o la versión de fuente. El motor no mezcla definiciones incompatibles.

Las métricas de llegada a una edad son tiempos de **llegada confirmada**, no el momento en que se hizo clic para investigar. Un parser que solo obtiene el clic no debe llenar `feudalSeconds` o `castleSeconds` con ese valor.

## Notas A–E: ejecución económica personal

La primera versión de notas tiene el identificador `personal-economic-percentile-v1`. No califica las decisiones estratégicas ni atribuye una derrota a una etapa. Compara ejecución económica con el historial del mismo jugador.

Para una nota se exigen al menos cinco replays **anteriores** compatibles en:

- Perfil, mapa y modo exactos.
- Civilización y apertura detectada.
- Velocidad, edad inicial y parche.
- Fuente, versión y definición de cada métrica usada.
- Etapa alcanzada y medida completamente.

Se requieren al menos dos indicadores económicos por etapa: proporción de tiempo productivo de TC perdido, proporción de bloqueo de población y/o inactividad ponderada de aldeanos. Los valores son proporciones entre 0 y 1; el reporte los presenta en porcentaje. Cuanto menos, mejor, de acuerdo con la definición de la fuente. El mismo grupo de replays debe tener todas las métricas que se comparan para esa nota.

Cada indicador recibe un percentil personal: porcentaje de referencias con peor valor, más la mitad de los empates. La nota usa la media de esos percentiles:

| Percentil personal | Nota |
| --- | --- |
| 80–100 | A |
| 60–79 | B |
| 40–59 | C |
| 20–39 | D |
| 0–19 | E |

Una nota C corresponde a la zona habitual del propio historial; no es una evaluación absoluta del nivel competitivo. Si falta apertura o parche, no se asume que dos valores ausentes representan el mismo contexto. Se muestran las métricas, pero no se asigna una nota.

APM, eAPM y tiempos de edades se presentan como información y diferencias contra la mediana compatible. No intervienen en las notas: más acciones o llegar antes a Castillos no implican por sí solos una mejor ejecución.

## Estados para UI

`report.status` es `pending` cuando todavía no hay resultado confirmado y `ready` cuando existe victoria/derrota. La disponibilidad de ejecución es independiente.

Cada etapa tiene `grade: null` mientras no hay evidencia suficiente:

| `stage.status` | Presentación sugerida |
| --- | --- |
| `needs_replay` | Requiere análisis del replay |
| `not_reached` | Etapa no alcanzada |
| `incomplete` | Medición incompleta |
| `needs_baseline` | X/5 replays comparables para tu primera nota |
| `ready` | Nota + indicadores + muestra personal |

`report.metrics` es un objeto con `apm`, `eapm`, `feudalSeconds` y `castleSeconds`; cada entrada incluye `status`, `value`, `unit` y `comparison`. Una UI debe comprobar `value != null`, ya que cero puede ser válido. `data.telemetryNote` explica el alcance en texto y `data.warnings` conserva problemas de validación concretos.

## Verificación

```powershell
node tools/postmatch-test.js
```

La suite comprueba ausencia de telemetría, resultados desconocidos, referencia del mismo mapa/modo, exclusión de la partida actual y de partidas futuras, deduplicación, definiciones incompatibles, muestras mínimas, notas con empates, etapas incompletas, persistencia entre reinicios y respuestas parciales posteriores.
