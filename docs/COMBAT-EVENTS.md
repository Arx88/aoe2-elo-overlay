# Motor propio de combate: qué hace y cómo probarlo

`src/combat-analysis.js` transforma **eventos ya medidos** en conteos por edad, categorías, intercambios y destacados. No reproduce AoE2 ni extrae muertes de las órdenes de un `.aoe2record`.

## Prueba reproducible sin el juego

```sh
npm test
node tools/combat-analyze.js tools/fixtures/combat-synthetic.json
```

El segundo comando procesa un ejemplo sintético de dos eliminaciones y una pérdida propia. No representa una partida real. Su salida es un resumen de combate; para importarlo al producto hay que incorporarlo al campo `combat` de una telemetría v1 completa y compatible con la partida registrada. El resumen aislado no es un archivo de telemetría importable.

```js
const { analyzeCombatEvents } = require('./src/combat-analysis');
const result = analyzeCombatEvents(measuredLedger, {
  matchId: confirmedMatch.matchId,
  profileId: ownProfileId,
  players: confirmedMatch.players,
});
if (!result.data) throw new Error(result.warnings.join(' '));
normalizedTelemetry.combat = result.data;
```

La procedencia, reloj, mapa, modo, civ y asociación con el replay se validan en el adaptador y en el sobre de telemetría. Un objeto que declare un match ID no autentica por sí solo un archivo. El motor de agregación no reemplaza esa validación del proveedor.

## Entrada `combat-event-ledger-v1`

- `schemaVersion: 1`, `clock: 'game'`, `matchId`, `profileId`, `durationSeconds` y `startingAge` explícitos.
- `players`: roster completo con perfiles y equipos confirmados, enteros positivos. Si se suministra roster esperado debe coincidir.
- `ageEvents`: llegadas **completadas** del jugador. Incluye su edad inicial a tiempo cero, incluso si la partida empieza en Feudal/Imperial. Cada evento tiene `type: 'age-reached'`, `profileId`, `age` y `gameSeconds`.
- `coverage.agesComplete: true`: el proveedor garantiza las llegadas usadas para segmentar.
- `coverage.deaths`: intervalos `{start, end}` con cobertura completa de muertes de todos los jugadores del roster. Los huecos dejan etapas parciales. Los eventos observados fuera de esos intervalos se conservan como mínimos observados.
- `deaths`: eventos `unit-died` con ID estable, instancia de unidad, segundo de juego, categoría, dueño **al morir**, causa y autor si se conoce. Un cambio de dueño por conversión debe haber sido resuelto por el extractor.
- Coste opcional por evento: comida, madera, oro y piedra, con definición `nominal-unit-replacement-cost-at-death-v1`. Es valor nominal de reemplazo al morir, no gasto histórico real.

Intervalos de edad `[inicio, fin)`. Un evento en el inicio de Castillos pertenece a Castillos; el fin de cobertura debe quedar después del último evento incluido. No se aceptan muertes en o después del límite final exclusivo. El futuro extractor tiene que respetar esa convención al cerrar una reproducción.

Límites: duración de hasta 24 horas, 16 jugadores, cuatro edades propias, 20.000 muertes y 5 MB en la herramienta de línea de comandos. Un análisis con otra semántica necesita una versión distinta.

## Salida e interfaz

`normalizeCombatSummary()` valida el resumen antes de importarlo y al restaurarlo. Recalcula totales y destacados; no confía en títulos, premios o totales derivados enviados por el archivo. El historial guarda solo las cuatro filas y el resumen compacto.

El informe presenta aldeanos/militares eliminados y perdidos. Conserva otras categorías aparte. Pérdidas incluyen muerte sin autor, Gaia, friendly fire y borrado propio; las eliminaciones solo se acreditan a un enemigo confirmado. El valor de intercambio considera combate enemigo y queda ausente si no hay coste o cobertura suficientes.

En cobertura parcial, `≥` significa un mínimo observado y `—` un intervalo incompleto sin conteo utilizable. Cero solo se presenta como cero medido con cobertura completa. Pesqueros y comercio no se cuentan como aldeanos.

Destacados actuales, con reglas versionadas y sin percentiles competitivos: **Depredador Feudal**, cinco aldeanos enemigos eliminados en un Feudal completo; **Serial Killer**, al menos 25 militares enemigos eliminados y eliminaciones militares de al menos dos veces las pérdidas militares, con cobertura completa; **Buen negocio**, intercambio de al menos 1,5 a 1 y volumen conjunto de 1.000 recursos con costes y cobertura suficientes. La calibración competitiva y el logro Boom Master siguen pendientes de datos económicos reales.

`postmatch:get`/`postmatch:refresh` recortan combate cuando el análisis de replay está bloqueado o apagado. La UI vuelve a comprobar ese acceso. El importador también comprueba acceso antes de abrir el archivo. El acceso a estos datos es ProMax mediante análisis de replay. Las notas económicas personales S–D continúan independientes del combate; no califican micro a partir de bajas o APM.

## Revisión visual

```sh
node tools/combat-preview.js
node tools/combat-preview.js --partial
node tools/combat-preview.js --results-only
```

Imprimen la ruta de un HTML local de desarrollo, que usa los assets del checkout actual. Todos los números están rotulados como sintéticos. No se integran como una partida del historial. La vista es una herramienta de desarrollo. La revisión visual y de Electron sobre Windows quedó diferida para este bloque; no se afirma que se haya realizado.

## Lo necesario para terminar la extracción automática

Un lector propio debe reproducir una partida compatible con el motor AoE2 en Windows, identificar jugadores, llegadas, entidades, dueños, muertes y costes, y entregar eventos con cobertura comprobada. Hace falta validar esa lectura con una instalación y versión concretas del juego y una grabación conocida. Este bloque no contiene direcciones de memoria supuestas, una API ficticia ni un ejecutable que ya haga esa extracción.

El [plan de producto](PRODUCT-ROADMAP.md) define la prueba de concepto y el [diseño v2](TELEMETRY-V2-PROPOSAL.md) describe la expansión a economía, producción, mejoras y conversiones.
