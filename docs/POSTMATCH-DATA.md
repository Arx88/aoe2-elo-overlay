# Postmatch: contrato y evaluación personal

En Pro el resultado puede mostrarse al finalizar; ProMax añade comparación personal y análisis de replay. Free no recibe el informe postmatch. Con la opción y acceso de replay habilitados, al confirmarse el final el proceso principal descarga el replay de Microsoft, lo analiza localmente y completa las métricas disponibles sin intervención del usuario. Una victoria, una apertura detectada o un tiempo de partida no permiten calificar la ejecución de Feudal o Castillos.

## Pipeline automático

1. `completedMatchTransition` confirma que la partida que se vio en vivo terminó con el mismo `matchId`.
2. El informe se publica de inmediato con `analysis.status: 'downloading'`; el overlay vuelve a aparecer con el resultado ya confirmado.
3. `src/replay.js` pide el ZIP a `GetMatchReplay` con `matchId` y el `profileId` del jugador, valida tamaño y tipo, y extrae únicamente el `.aoe2record` a un directorio temporal.
4. `src/replay-analysis.js` instancia el parser WASM de `aoe2rec-js` y calcula apertura inferida, primera orden de avance a Feudal/Castillos, duración y APM. `Research` no confirma llegada de edad. No extrae eAPM, economía, bajas ni inactividad: los campos no medidos quedan ausentes.
5. El estado pasa a `analysis.status: 'analyzing'` mientras se lee el archivo y, al terminar, a `'ready'`.
6. Si la descarga o el análisis fallan, el resultado y la referencia por mapa siguen visibles; `analysis.status: 'error'` explica el motivo y el botón Actualizar reintenta. Nunca se rellenan métricas para tapar el fallo.
7. El ZIP y el replay se borran al terminar. No se conserva el archivo del usuario ni se sube a un servidor.

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

El análisis local usa [aoe2rec-js](https://github.com/aoe2ct/aoe2rec) para leer `.aoe2record`. El archivo contiene un estado inicial y una secuencia de comandos; los contadores de recursos, bajas o inactividad requerirían reproducir el estado del juego. Por tanto, no calculamos TC inactivo, aldeanos inactivos, bajas ni eficiencia a partir de simples huecos entre órdenes. Los APM derivados de comandos se publican con la definición `game-command-count-v1`, sin presentarse como el mismo eAPM de otra herramienta. La clasificación de apertura replica las reglas de `aoe2-openings` sobre los comandos del replay.

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

El adaptador 0.1.25+command-adapter-v5 conserva las órdenes y separa las llegadas a las edades. La llegada requiere una notificación del juego en un formato reconocido, el jugador correspondiente al slot del replay, un clic anterior y el reloj del mismo capítulo. Se comprobó con las partidas públicas 520379962 (Arabia, chino simplificado) y 521092784 (Arena, inglés) y con una repetición local en español. Si falta la notificación, queda el clic. Los adaptadores v3 a v5 conservan las referencias con definiciones de comandos idénticas.

Cuando existe un horario de llegada medido, el normalizador comprueba que el resumen de combate comience esa edad en el mismo punto. Para una etapa económica declarada completa, verifica la duración contra los límites de edad disponibles. Un conflicto en combate conserva el resto del informe. Un tramo económico incompatible conserva sus métricas como incompletas y queda fuera de las notas comparables.

## Combate opcional y destacados sin reproducción profunda

La telemetría v1 acepta el campo opcional `combat` con un resumen validado de `src/combat-analysis.js`. Ese motor agrupa eventos de muerte medidos por edad y categoría, con cobertura y costes explícitos. El almacén conserva el resumen compacto; no guarda todo el registro de eventos. Totales y destacados se recalculan al validar/restaurar. Un resumen inválido se omite con advertencias y no elimina el resultado ni otras métricas válidas. [Formato y uso](COMBAT-EVENTS.md).

El parser automático todavía no genera esos eventos. El JSON de combate es una interfaz para un extractor medido, no un sustituto de ese extractor. Las notas económicas siguen independientes del número de bajas.

`report.historyHighlights` usa resultados confirmados del historial consultado del mismo mapa/modo. Puede destacar una mejora del registro o al menos tres victorias entre los últimos cinco resultados confirmados disponibles. No afirma una racha completa ni mide ejecución de una edad. Se suprime ante error/historial parcial, muestra insuficiente o falta de resultado. El proceso principal recorta esos destacados si no está habilitada la comparación; el combate y la apertura se recortan si no está habilitado el análisis de replay.

## Ejecución económica personal: contrato y presentación S–D

El cálculo base conserva `personal-economic-percentile-v1` y sus campos A–E para compatibilidad. La interfaz nueva usa `report.executionRatings`, generado por `src/execution-ratings.js`, con método `personal-economic-sd-v1`. No califica las decisiones estratégicas ni atribuye una derrota a una etapa. Compara ejecución económica con el historial del mismo jugador.

Para una nota se exigen al menos cinco replays **anteriores** compatibles en:

- Perfil, mapa y modo exactos.
- Civilización y apertura detectada.
- Velocidad, edad inicial y parche.
- Fuente, versión y definición de cada métrica usada.
- Etapa alcanzada y medida completamente.

Se requieren al menos dos indicadores económicos por etapa: proporción de tiempo productivo de TC perdido, proporción de bloqueo de población y/o inactividad ponderada de aldeanos. Los valores son proporciones entre 0 y 1; el reporte los presenta en porcentaje. Cuanto menos, mejor, de acuerdo con la definición de la fuente. El mismo grupo de replays debe tener todas las métricas que se comparan para esa nota.

Cada indicador recibe un rango personal: porcentaje de referencias con peor valor, más la mitad de los empates. El score de etapa es la media redondeada de esos rangos. El contrato base A–E permanece compatible, pero la presentación nueva usa esta escala versionada:

| Score personal | Nota S–D |
| --- | --- |
| 90–100 | S |
| 75–89 | A |
| 50–74 | B |
| 25–49 | C |
| 0–24 | D |

Los umbrales son política de presentación, no niveles competitivos calibrados. `executionRatings.economic` valida estado listo, al menos cinco referencias, dos o tres indicadores económicos únicos y coherencia entre el score y las comparaciones. La nota general requiere que todas las etapas esperadas estén listas o explícitamente no alcanzadas. Con etapas parciales conserva sus notas individuales y omite la general. El tamaño mínimo mostrado es **por etapa**, no un conjunto común de referencias de toda la partida.

`executionRatings.micro` y `.decisions` tienen nota nula: no existe evidencia/método validado para esas dimensiones. El APM o una buena proporción de bajas no las rellenan. «Macro económica» se acompaña de la etiqueta **Ejecución económica personal**; no es una evaluación de toda la macro estratégica.

`comparison.strictlyBetterPercent` cuenta solo referencias estrictamente peores, sin sumar empates. Solo ese dato puede producir un destacado como «menor valor que en el X % de tus N partidas anteriores comparables». El rango que incluye medio empate y el score compuesto no se convierten en esa frase. Ninguno permite afirmar «mejor que X % de usuarios»; no existe cohorte poblacional conectada.

Si falta apertura o parche, no se asume que dos valores ausentes representan el mismo contexto. Se muestran las métricas, sin asignar nota. El adaptador automático actual no entrega los indicadores económicos: esta presentación se habilita únicamente cuando exista telemetría medida compatible y muestra suficiente.

APM, eAPM y tiempos de edades se presentan como información y diferencias contra la mediana compatible. No intervienen en las notas: más acciones o llegar antes a Castillos no implican por sí solos una mejor ejecución.

## Estados para UI

`report.status` es `pending` cuando todavía no hay resultado confirmado y `ready` cuando existe victoria/derrota. La disponibilidad de ejecución es independiente.

`report.analysis.status` describe el trabajo del replay: `downloading`, `analyzing`, `ready`, `error` (o `locked` si el plan/opción no permite replay). La UI muestra una barra y el texto correspondiente sin ocultar el resultado ya confirmado. Una etapa con `status: 'measured'` tiene un dato directo del replay (apertura o tiempo de edad), pero no una nota: las notas económicas siguen requiriendo la muestra descrita arriba.

Cada etapa tiene `grade: null` mientras no hay evidencia suficiente:

| `stage.status` | Presentación sugerida |
| --- | --- |
| `needs_replay` | Requiere análisis del replay |
| `not_reached` | Etapa no alcanzada |
| `incomplete` | Medición incompleta |
| `needs_baseline` | X/5 replays comparables para tu primera nota |
| `ready` | Nota + indicadores + muestra personal |

`report.metrics` incluye `apm`, `eapm`, `feudalSeconds`, `castleSeconds`, `feudalClickSeconds` y `castleClickSeconds`; cada entrada incluye `status`, `value`, `unit` y `comparison`. Una UI debe comprobar `value != null`, ya que cero puede ser válido. `data.telemetryNote` explica el alcance en texto y `data.warnings` conserva problemas de validación concretos.

## Verificación

```powershell
node tools/postmatch-test.js
node tools/execution-ratings-test.js
```

La suite comprueba ausencia de telemetría, resultados desconocidos, referencia del mismo mapa/modo, exclusión de la partida actual y de partidas futuras, deduplicación, definiciones incompatibles, muestras mínimas, notas con empates, etapas incompletas, persistencia entre reinicios y respuestas parciales posteriores.

## Acceso y experiencia visual

Main no entrega postmatch a Free. En Pro, recorta comparación, apertura, métricas, combate y `executionRatings` antes del IPC. En ProMax comprueba además las opciones guardadas. La UI vuelve a aplicar los permisos; un informe cacheado no concede acceso. El overlay deja pasar los clics y el informe se oculta automáticamente: las consultas y reintentos manuales pertenecen al launcher, fuera de la interacción en juego.
