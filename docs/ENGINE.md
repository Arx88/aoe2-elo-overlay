# Motor de post-partida

Estado: **en desarrollo, no conectado a la interfaz**. Lo que está acá funciona y
está probado, pero todavía no alimenta ninguna pantalla del producto. Se sube
para no perderlo y poder retomarlo.

## El problema que resuelve

El `.aoe2record` es un **registro de comandos**: guarda el estado inicial y lo
que cada jugador ordenó, no lo que el motor resolvió. En consecuencia:

| Dato | ¿Está en el archivo? |
| --- | --- |
| Órdenes de entrenamiento, edificio y cantidad | Sí, exacto |
| Construcciones con posición | Sí |
| Investigaciones | Sí |
| Mercado y tributos | Sí |
| Rendiciones, chat, APM | Sí |
| Recursos acumulados | **No** |
| Bajas y aldeanos perdidos | **No** |
| Aldeanos inactivos | **No** |

Referencia textual del ecosistema de parsers: *"A rec file does NOT contain
resource counts, unit counts, kills, or eco curves at any point in time... You
can't [know them], without replaying the match in-game."*

Verificado localmente, no asumido: se enumeraron **los 28 tipos de acción** de
una partida completa de 31 minutos y ninguna es un evento de muerte. El bloque
final del archivo (`PostGame`) solo trae `Leaderboards` y `WorldTime`; una
búsqueda recursiva de `stat|kill|lost|villager|death` sobre 6 repeticiones da
0 coincidencias.

Por eso las bajas se publican como ausentes con motivo, nunca como cero.

## Arquitectura

```
src/engine/
  proto.js         códec protobuf mínimo (wire 0/1/2/5), sin dependencias
  grpc.js          cliente gRPC sobre node:http2; errores tipados
  cade.js          cliente del motor del juego; descubre certificados, carga, frames
  aggregate.js     frames del motor → producción, muertes, kills, edades, economía
  offline.js       operaciones del replay → los mismos hechos
  idle.js          idle de Centro Urbano reconstruido de las órdenes
  production.js    producción por edificio, con nombres y tiempos reales
  model.js         modelo normalizado: disponibilidad, conflictos, invariantes
  capture.js       trabajo de captura con caché, cancelación y restauración
  unit-names.json  tabla generada: id → nombre y tiempo de entrenamiento
```

Dos fuentes, un mismo formato de hechos. El modelo normalizado decide qué
publicar según de dónde venga cada dato:

- **`measured`**: el dato viene de una fuente que lo mide (el motor).
- **`derived`**: se reconstruye de forma determinista a partir de lo registrado
  (producción por edificio, idle de CU). Se publica con una definición
  versionada.
- **ausente**: `null` con motivo. Nunca se rellena con cero.

## Producción por edificio (`production.js`)

Cada orden de entrenar (`action_data.DeQueue`) trae `unit_id`, `amount`,
`building_ids` y `building_type`. Con eso se cuenta qué produjo cada Centro
Urbano y cada taller militar por separado.

**Detalle que hay que respetar:** un pedido con varios edificios seleccionados
lo ejecuta **uno solo**, el de la cola más corta. Los demás aparecen en
`building_ids` porque estaban en la selección. Acreditarle la unidad a cada uno
infla la producción (se observó un jugador con 269 aldeanos cuando tenía 125).
La implementación elige un único edificio: el de menor `busyUntil`, con
desempate por id.

Salida por jugador:

```js
{
  villagersTrained: 125,
  buildings: {
    '27875': {
      typeId: 109, type: 'centro-urbano', typeName: 'Centro urbano',
      category: 'economy',
      units: { aldeano: 67 },
      totalUnits: 67, orders: 67,
      firstOrderSeconds: 3.1, lastOrderSeconds: 1740.2,
      busySeconds: 1675, idleSeconds: 0,
    },
  },
  categories: { 'centro-urbano': { name, buildings, totalUnits, units, busySeconds, idleSeconds } },
  names: { aldeano: 'Aldeano', 'centro-urbano': 'Centro urbano' },
}
```

## Idle de Centro Urbano (`idle.js`)

Se modela la cola de cada CU: una orden arranca el trabajo, la cola se vacía a
razón de un aldeano cada tiempo de entrenamiento, y si llega una orden cuando la
cola ya está vacía, ese hueco es idle. Los intervalos ocupados de **todos** los
CU del jugador se unen antes de restar, para no contar como idle un hueco que
otro Centro Urbano estaba cubriendo.

Definición publicada: `tc-idle-queue-v1`, siempre `derived`.

## Nombres e ids (`unit-names.json`)

No hay ids sin mapear ni tiempos estimados. La tabla se genera de dos fuentes
autoritativas y se embebe en el repositorio — la aplicación no depende de la
instalación del juego ni de la red en ejecución.

```bash
# 1. dataset de datos del juego (una vez)
curl -sSL -o .tmp-aoe2data/aoe2data.json https://aoe2techtree.net/data/data.json

# 2. generar la tabla (usa los textos en español del propio juego)
node tools/build-unit-names.js .tmp-aoe2data/aoe2data.json
#    o indicando la ruta: node tools/build-unit-names.js <dataset> <strings.txt>
#    La ruta del juego también se puede fijar con AOE2DE_PATH.
```

`build-unit-names.js` toma `LanguageNameId` de cada unidad y edificio, busca ese
id en `resources/<idioma>/strings/key-value/key-value-strings-utf8.txt`, y
guarda `{ name, key, trainSeconds }`. Si algún id queda sin nombre, **falla con
exit 1** en vez de escribir una tabla incompleta.

Resultado actual: 256 unidades y 40 edificios. Los dos aldeanos (83 y 293)
comparten etiqueta «Aldeano». Los ids que el dataset no publica pero que las
repeticiones usan se declaran en `EXTRA_UNITS`, con el motivo escrito.

## Motor en vivo (`cade.js`, `capture.js`) — opcional, no empaquetado

En teoría es la única fuente exacta de bajas, porque simula la partida. En la
práctica **ocupa el juego**, y eso choca con el requisito del producto de no
interrumpir al jugador. Queda como módulo de investigación:

- Descubre certificados existentes; no empaqueta ninguno (pertenecen a CaptureAge).
- `capture.js` cachea por huella del archivo (una captura por partida), es
  cancelable, detiene la reproducción al terminar y verifica que el motor haya
  arrancado desde el inicio (`replay_did_not_restart` en vez de datos falsos).

Estado real de esa ruta: el motor responde `Info` (build 188329) pero dejó de
aceptar la carga de repeticiones (`Frames` devuelve 0 frames). No está resuelto.

## Herramientas

```bash
node tools/engine-test.js          # pruebas del motor (sin juego ni red)
node tools/replay-probe.js 1       # tipos de acción, conteos y ejemplos reales
node tools/scan-one.js <archivo>   # producción de una repetición, ids sin mapear
node tools/engine-capture.js --latest   # captura con el motor (ocupa el juego)

node tools/engine-test.js   # npm run engine:test
```

## Verificación hecha

- `engine-test` en verde: códec, acumulador, disponibilidad, fusión,
  invariantes, atribución multi-edificio, producción militar por taller, idle de
  CU con uno y con dos Centros Urbanos, y una aserción que falla si un id
  estándar queda sin mapear.
- **255 repeticiones** de la carpeta de guardado procesadas una por archivo
  (para que una corrupta no tumbe el lote): **0 ids sin mapear, 0 fallos**.
- Partida de 31 minutos, 8 jugadores, 136.361 acciones: 37 ms de cálculo.
  La suma por edificio cierra con el total de aldeanos del jugador.

## Límites conocidos

- Una **orden cancelada** no deja rastro: el idle reconstruido puede quedar algo
  bajo y la producción cuenta la orden, no la unidad terminada.
- Las civilizaciones con bonus de velocidad de Centro Urbano quedan levemente
  subestimadas en idle.
- Los tiempos de entrenamiento son los base; no incluyen aceleraciones por
  tecnología.
- **Bajas y aldeanos perdidos no se calculan.** Sin acceso al motor simulado no
  hay forma de saberlos desde el archivo, y no se inventan.
- Nada de esto está conectado a la interfaz todavía.
