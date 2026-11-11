# AoE2 ELO Overlay

Overlay de escritorio para **Age of Empires II: Definitive Edition**: muestra en pantalla, apenas se encuentra la partida, el **ELO actual de 1v1 Random Map**, el **rank** y el **pico histórico (máximo)** de cada jugador.

**Regla de producto:** el número que se ve es **siempre** el ELO de **RM 1v1 (ladder #3)**, juegues lo que juegues. En TG, Empire Wars, Deathmatch o una sala personalizada el panel sigue mostrando el 1v1 de cada jugador, porque ese es el que sirve para medir el nivel. El ELO propio del modo (equipo, EW, unranked…) se descarta; si alguien nunca jugó 1v1 ranked, se muestra `—`, nunca un ELO de otro modo inventado a modo de reemplazo.

```
ARABIAN DESERT · RM team                    [ELO RM 1v1]
● Yo            vos   1243 #812    pico 1290
● Rival               1250         pico 1301
By acido                RM team · pico RM 1v1
```

La cabecera dice el **modo** de la partida; la etiqueta `ELO RM 1v1` aclara de dónde salen los números.

Opcionalmente (todo **apagado de fábrica**) podés sumar la **Ayuda de civ** a 0:01 y un **informe del rival**: sus últimas 5 civs, la civ que más usa en el mapa de la partida y sus **aperturas reales** (`Scout rush`, `Archer rush`, `Drush`…) detectadas en replays analizados. Y podés hacer que todo eso se aparte solo al tiempo que elijas (entre 0:10 y 1:00; 0:20 por defecto) para que no estorbe durante el juego.

Para revisar **todas esas funciones de una sola vez sin esperar a que el juego encuentre partida**, está el **Modo ejemplo** (`Ctrl+Alt+S → "Ver test"`): escribís cualquier nombre de jugador o su profile ID y el overlay se arma con la **última partida real** de ese perfil.

## Por qué no es un mod

Los mods de AoE2 DE son datos y UI (JSON de `widgetui/`, texturas, `.dat`, XS): no tienen acceso a red y el juego nunca recibe el ELO de los rivales. Un panel dentro del HUD no tiene de dónde sacar el dato. Por eso esto es una ventana externa transparente dibujada encima del juego — funciona porque el "Fullscreen" de AoE2 DE es en realidad *borderless windowed*.

## Requisitos

- Windows 10/11
- AoE2 DE en modo **Fullscreen** (el que trae el juego, que es borderless) o **Ventana**. No uses fullscreen exclusivo forzado por herramientas externas: ahí ningún overlay se dibuja.
- Solo para correrlo desde el código: Node.js 18+.

## Uso

### Opción A — el `.exe` (recomendado)

En `elo-overlay/dist/` están los dos ejecutables ya compilados:

| Archivo | Qué es |
| --- | --- |
| `AoE2 ELO Overlay Setup 0.1.0.exe` | Instalador: crea acceso directo en el escritorio y en el menú inicio |
| `AoE2 ELO Overlay 0.1.0 portable.exe` | Un solo archivo: doble click y corre, sin instalar |

No necesitan consola, Node ni nada más. Al no tener firma digital, Windows puede mostrar el aviso de SmartScreen la primera vez: **Más información → Ejecutar de todas formas**.

En la versión empaquetada, la config y el log viven en:

```
%APPDATA%\AoE2 ELO Overlay\config.json
%APPDATA%\AoE2 ELO Overlay\overlay.log
```

### Opción B — desde el código

```bash
cd elo-overlay
npm install
npm start
```

## Elegir la cuenta

Por defecto la app **detecta sola** qué cuenta estás usando: lee `%USERPROFILE%\Games\Age of Empires 2 DE\<SteamID64>`, resuelve ese Steam ID a `profile_id` y, si hay varias cuentas en la PC, elige la que jugó más recientemente.

Si querés cambiarla —otra cuenta tuya, otra PC, otra persona— abrí la ventana de configuración con `Ctrl+Alt+S` (también se abre sola la primera vez, si no pudo detectar nada):

- **Buscar tu perfil**: escribís tu nombre en el juego y aparecen sugerencias con clan, país, ID y partidas jugadas; elegís con click o con las flechas + Enter.
- **Ingresá el ID**: si preferís el número exacto (el de la URL de [aoe2insights.com](https://www.aoe2insights.com/), `/user/1234567`).
- **Detectar automáticamente**: vuelve a buscar la cuenta del juego en esta PC.

La elección se guarda en `config.json` y se aplica al instante, sin reiniciar (la ventana del overlay no se toca: esa sigue sin poder clickearse ni recibir foco).

A mano en `config.json`, `profileId` funciona igual:

```json
{ "profileId": 1234567 }
```

`"profileId": null` vuelve a la detección automática.

## Diseños

El panel trae **once estilos** y se cambia desde la ventana de configuración (**Apariencia**, o `Ctrl+Alt+S`); se aplica al instante y queda guardado en `theme`:

| Tema | Qué es |
| --- | --- |
| `clasico` | Pergamino oscuro con dorado, serif (default) |
| `noche` | Oscuro moderno y minimalista, sans, filas redondeadas |
| `vidrio` | Translúcido con desenfoque, bordes claros |
| `claro` | Blanco, texto oscuro, acento azul |
| `neon` | Oscuro con acento cian y detalles magenta |
| `fantasma` | **El más discreto**: compacto, casi sin fondo, filas pastilla |
| `aurora` | Degradado violeta → turquesa con acento lavanda |
| `dorado` | Negro y oro, serif, estilo premium |
| `carbono` | Mate oscuro con acento rojo (a juego con el ícono) |
| `pergamino` | Papel claro estilo AoE2, serif y marrón |
| `sakura` | Ciruela oscuro con acento rosa |

Todos comparten un halo de texto sutil para seguir leyéndose sobre mapas claros, animaciones de entrada, y respetan la preferencia del sistema de *reducir movimiento*. El tema `fantasma` es el recomendado si querés que el overlay casi no se note.

## Escudos de civilización

Cada jugador muestra **solo el escudo** de la civ que eligió (los rivales incluidos), sin texto. Los 62 escudos están bundleados en `assets/civs/` (descargados de aoe2techtree.net), así que se dibujan sin conexión y sin pedir nada en plena partida. Si la civ viene como `Random` o no se reconoce, queda un `?` chico en su lugar.

## Qué tan rápido aparece

La app escucha el **websocket de colas** de aoe2companion (`wss://socket.aoe2companion.com/listen?handler=queueing&language=es`), el mismo que usa el dashboard oficial: se conecta **sin** `profile_ids` y filtra en cliente por tu `profileId`. Así no dependemos de que el servidor aplique el filtro también a los deltas; ves todos los `matched` y el tuyo no se puede perder. El coste es bajo (~4 KB/s más ~100 KB de estado inicial). Con `AOE_QUEUE_FILTER=1` se vuelve al socket filtrado por perfil para diagnóstico.

En cuanto el juego **encuentra partida** (la ventana de ~60s antes de entrar al mapa) llega un evento `queueingAdded` con `status: 'matched'`: `matchId`, `leaderboard`, `mapName` y el **roster completo**. El evento trae además un `rating`/`rank` por jugador, pero ese es el ELO **del modo** (en TG coincide con la ladder #4, no con la #3): el overlay lo guarda solo como dato auxiliar y no lo muestra. El panel se dibuja en ese instante, con el título pulsando *«Partida encontrada · RM team»*, la etiqueta *«ELO RM 1v1»* y el pie *«Nómada · empezando…»*.

> Ojo: `handler=lobbies` **no** sirve para ranked — solo publica salas personalizadas. Ese fue el bug: el overlay estaba suscripto al handler equivocado y por eso solo reaccionaba cuando el REST ya veía la partida empezada. `lobbies` se mantiene como fuente secundaria para partidas custom.

El primer mensaje de cada conexión es el estado completo, así que una reconexión a mitad del countdown no pierde la partida. El REST cada **3 segundos** (`idlePollSeconds`) queda como respaldo y toma el control cuando la partida arranca: ahí llegan las civilizaciones y los colores reales.

No espera a tener todo para dibujar, en **dos fases**:

1. **Al instante** (0 requests): el roster completo, los equipos y el mapa ya están en pantalla; la columna de ELO muestra `…`. No se pinta el ELO del modo, porque ese número no es el que querés ver.
2. **~0,5 s después**: una sola request a `getPersonalStat` trae **ELO, rank y pico de RM 1v1** para todos los jugadores a la vez. Si alguien no tiene ladder 1v1 queda en `—`; si el backend falla, también queda en `—` y se reintenta en el próximo poll (no se cachea el vacío).

Los resultados se guardan en una cache compartida `elo1v1:<profileId>`: pasar de 1v1 a TG, a EW o a una custom **no** vuelve a consultar el backend para los mismos jugadores.

Para probar el panel sin hacer cola: `electron . --fake-found --shot --out=demo-match-found.png` inyecta un `matched` sintético por el mismo pipeline.

**Cómo confirmar que está vivo** (log en `%APPDATA%\AoE2 ELO Overlay\overlay.log`): al abrir la app deben aparecer, en este orden:

```text
queueing: escuchando matchmaking (flujo global, filtrado en cliente)
socket queueing: conectado
queueing: estado inicial 190 items (70 apareadas globales)
queueing: recibiendo eventos en vivo (73)
estás buscando partida (cola detectada)      ← al ponerte en cola
PARTIDA ENCONTRADA · roster en pantalla en 1ms ···  ← al encontrar rival
PRE-PARTIDA · Nómada · RM team · ELO RM 1v1 · completo en 516ms ···
```

Hay **dos vías** para el disparador instantáneo, para que no dependa de la forma exacta del payload:

1. `queueingRemoved` de **tu propia** cola con `reason: 'matched'` y `matchId` → pinta el cartel *«Partida encontrada · cargando rivales…»* en **0 ms**, sin ningún request.
2. En el mismo lote llega `queueingAdded`/`queueingUpdated` con `id: 'm_<matchId>'`, `status: 'matched'` y el roster completo → ahí mismo se dibujan nombres, equipos, mapa y escudos, y se pide el ELO 1v1. Si el item viniera con otro id o sin tu `profileId` en `players`, se ubica igual por `matchId`.

Mientras estás en cola el REST se consulta cada **1,5 s** en vez de 3 s. Verificado contra el socket real: los `matched` traen rosters de 2/4/6/8 jugadores y llegan **antes** de que `/api/matches` liste la partida (`/api/matches/<matchId>` da 404 en la cuenta regresiva), así que el websocket es la única fuente posible en esa ventana.

Si aparecen las dos primeras pero no el resto, el socket no está recibiendo datos (cortafuegos / proxy). Si aparece *«estás buscando partida»* pero no *«PARTIDA ENCONTRADA»*, el problema está en el evento `matched` y el log lo dirá. Con estas líneas nuevas se distingue en segundos dónde se cortó la cadena:

```text
estás buscando partida (cola detectada) · polling acelerado
cola apareada: matchId 519973982 · aviso instantáneo
PARTIDA ENCONTRADA · cola apareada (matchId 519973982) · aviso en 0ms
PARTIDA ENCONTRADA · roster en pantalla en 1ms (2 jugadores, Arabia) · pidiendo ELO RM 1v1
roster ubicado por matchId 519973982 (2 jugadores)      ← solo si el roster venía raro
PRE-PARTIDA · Arabia · RM 1v1 · ELO RM 1v1 · completo en 120ms ···
```

## Ayuda de civ y ocultar el ELO al tiempo elegido

En **Configuración → Durante la partida** hay dos opciones. **Las dos arrancan apagadas** y se aplican al instante, sin reiniciar:

| Opción | Default | Qué hace |
| --- | --- | --- |
| **Ayuda de civ** | `false` | A **0:01** muestra una tarjeta con el escudo grande de **ambas** civilizaciones y un resumen corto en español: **BONOS**, **UNIDADES** y **DEBILIDADES**. Se oculta sola al **tiempo elegido**. |
| **Ocultar panel de ELO** | `false` | El ELO se ve **desde el arranque** (aunque Ayuda de civ esté apagada) y se oculta al **tiempo elegido**. Vuelve a aparecer **solo** cuando termina la partida. |
| **Tiempo de ocultado** | `0:20` | Cuánto queda visible desde el inicio: de **0:10 a 1:00**, en pasos de 5 s. Aplica a la Ayuda de civ, al ELO y al informe del rival. |

Detalles que importan:

* El reloj se lee del **`raw.started` del REST**, o sea del **tiempo real de la partida**, no de un temporizador desde que la app detecta algo. Si activás la opción a 0:12 o recargás el panel, la cuenta regresiva no se reinicia.
* Las opciones son **independientes**: podés ocultar el ELO sin activar la ayuda, o ver la ayuda y dejar el ELO fijo. En la pre-partida (`phase: 'lobby'`) no hay civs reales ni reloj, así que no se aplica nada.
* Si abrís la app en medio de una partida (más de 60 s desde el inicio), la intro **no se engancha**: así el ELO nunca queda oculto para siempre en un partido que no viste empezar.
* La tarjeta es **100 % offline** (`src/civ-guide.js`, 62 civs en español, generado de los textos del juego) y usa los escudos de `assets/civs/`. No hace ni una request en plena partida.
* En TG muestra hasta 4 civs distintas, la tuya primero. La barra y el contador `0:04 / 0:20` indican cuánto queda hasta el tiempo elegido.
* Al **activar la Ayuda de civ** con un tiempo menor a 0:40, la configuración muestra un aviso que ofrece dejarla visible hasta **0:40** para poder leerla con calma, con las opciones **No, gracias** y **Aumentar visibilidad a 40 segundos**.
* El bloque **Estado** de la configuración muestra el reloj de partida en vivo.

Para capturarlo sin jugar: `electron . --demo --civ-help --shot --out=demo-civhelp.png` (0:03) y `--demo --civ-help=late` (0:21, ya oculto).

## Informe opcional del rival

En **Configuración → Informe del rival** hay **tres** opciones independientes. **Todas arrancan apagadas**: elegís qué querés ver, y nada se muestra si no lo activaste. Se aplican al instante, sin reiniciar.

| Opción | Clave | Default | Qué muestra |
| --- | --- | --- | --- |
| **Últimas 5 civis del rival** | `rivalCivs` | `false` | Las últimas 5 civilizaciones que el rival **jugó de verdad** en el **mismo modo de juego** de la partida en curso: escudo, victoria/derrota y mapa. Saltea la partida en curso. |
| **Civ y mapa que más usa** | `rivalFavorites` | `false` | En el **mapa y modo de la partida en curso**: partidas y winrate del mapa según el histórico completo, y la civil más usada en **todas las partidas de ese mapa en ese modo**, con cuota y winrate. |
El historial de `/api/matches` se consulta con `leaderboard_ids=<ladder>`: el mapa y la civ se calculan solo con el **modo exacto** de la partida (RM 1v1, RM Team, EW…), nunca mezclando ladders. Sin ladder (unranked) no se fuerza RM.

| **Aperturas reales del rival** | `rivalOpenings` | `false` | `Scout rush`, `Archer rush`, `Drush`, `Drush fast castle`, `Man at arms rush`, `Fast castle`: apertura **más usada** y las últimas partidas, detectadas en **replays analizados** por AoE2Insights, **del mismo modo de juego** (EW no se mezcla con RM), **del mapa de la partida y de la civ que más usa en ese mapa**. Si no hay replays de esa civ en ese mapa, no se muestra la apertura general ni la de otra civ. |

### Por qué las aperturas son datos reales y no una "guía por civ"

AoE2 Companion (`/api/matches`, `/api/matches/:id`) **no publica** la apertura de una partida: solo roster, civ, mapa y resultado. AoE2Insights sí, porque analiza los `.aoe2record` y etiqueta la estrategia de cada jugador; en su perfil dice literalmente *"Strategy charts: based on the openings detected in analysed replays"*. Primero se intentó una tabla offline de "apertura típica por civilización" y se **descartó**: eso es una suposición, no lo que el rival hizo.

El endpoint público (sin cuenta ni API key) es `src/insights.js`:

```text
GET https://www.aoe2insights.com/stats/api/match-ups/
    ?field=strategy&field=match_id&field=started_time&field=civilization
    &field=map&field=ladder&field=player_name
    &filter={"field":"player_relic_id","operator":"equals","value":"<profileId>"}
    &filter={"field":"ladder","operator":"equals","value":"<id del modo>"}
    &order=-started_time&limit=120
```

Puntos que el módulo resuelve:

* `player_relic_id` es **el mismo `profileId`** que usa AoE2 Companion: no hay que mapear usuarios.
* `rows` viene en **formato columna** (un array por campo), no en filas.
* `match-ups` tiene **una fila por enfrentamiento**: en 4v4 la misma partida aparece 4 veces. Se deduplica por `match_id` antes de contar.
* La primera consulta suele devolver `202 {"pending":true}` con `retry-after: 3` (el backend calcula en background). Se reintenta hasta 6 veces, con timeout de 15 s y UA de navegador para pasar Cloudflare. Las respuestas se cachean **30 min** (`rival:openings:<id>:<ladder>`, separadas por modo); si la red cae con cache vencida, se reutiliza el dato anterior.
* **Solo cuentan las partidas con `strategy` real.** `null` / `Unknown` / vacío (replay aún no analizado) se descartan. Si el rival no tiene replays analizados, el panel dice *"Sin replays analizados para este rival"* y **no inventa ninguna apertura**.

### Filtrado por modo de juego (EW no es RM)

EW se juega distinto a RM: un Drush de RM 1v1 no sirve para predecir el arranque en EW 1v1, ni al revés. Por eso:

* El `ladder` de AoE2Insights es un **enum con IDs** (`3 RM 1v1`, `4 RM Team`, `13 EW 1v1`, `14 EW Team`, `1/2 DM`, `15–18 Controller`, `25–28 RoR/Reinado`). El modo de la partida en curso (`leaderboardId` de AoE2 Companion, numérico o enum, con fallback a `state.ladder.id`) se traduce a ese ID y se manda como **segundo `filter`** (`{"field":"ladder","operator":"equals","value":"13"}` — con la etiqueta o con `operator:"in"` el endpoint responde 404). Además el módulo vuelve a filtrar en cliente como red de seguridad: aunque la API cambiara, jamás se mezclan modos.
* El panel etiqueta el modo (`APERTURA MÁS USADA · EW 1v1`, `ÚLTIMAS 5 CIVS · EW 1v1`) y contabiliza cuántos replays de **otros** modos se descartaron.
* En **custom / unranked / quickplay** el modo no se puede resolver: el panel dice que no hay aperturas disponibles en lugar de mezclar modos (no se hace ninguna consulta).
* El historial de civs aplica el mismo criterio: si el rival no jugó ese modo recientemente, el bloque dice cuántas partidas hay en ese modo en vez de rellenar con RM.

Verificado con datos reales del mismo rival (`#1135135`): sin filtro, AoE2Insights devolvía 10 replays mezclados (EW 1v1, RM Team, RM 1v1, un evento) y la "favorita" mezclaba modos. Con el filtro: **EW 1v1 → 2 replays, Fast castle (100 %)**; **RM 1v1 → 2 replays, Drush (50 %) y MAA rush**. Además el perfil `25399083` devolvió 36 replays analizados con favorita `Scout rush` (56 %), últimas 5 civs `Magyars · Mongols · Magyars · Persians · Ethiopians` y civ favorita `Ethiopians` (145 partidas). Seis rivales reales más tenían entre 5 y 42 partidas con apertura detectada.

### Cómo se pinta sin molestar

* `main.js` dispara `refreshRivalReports()` **en segundo plano desde `emit()`**: el aviso de partida encontrada y el ELO siguen saliendo en 0–1 ms. El informe llega después y se completa por partes (`onPartial`): civs y favoritos en ~0,3 s, aperturas en ~9 s la primera vez y al instante desde cache.
* Se publica por el canal `overlay:rival`; `overlay:ready` lo reenvía si el renderer se recarga. Si el roster cambia mientras una consulta está en vuelo, se encola **un solo** refresh (`rivalSig` + `rivalQueuedSig`, y la firma incluye el modo: una partida de EW no reutiliza el informe de una de RM).
* En TG se muestran hasta **2 rivales reales** (`opponentsOf()` filtra por `team`, no solo por `isYou`: tus aliados nunca aparecen en el informe).
* Si **Ocultar panel de ELO al segundo 20** está activo, este informe se oculta **junto con el ELO** a 0:20.
* Los errores se devuelven como `error` / `openingError` y nunca tiran excepción: si una API falla, el ELO sigue funcionando.

Para capturarlo sin jugar (y sin tocar la config del usuario):

```bash
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS \
  ./node_modules/electron/dist/electron.exe . \
  --isolated --demo --rival-info --shot --out=demo-rival-info.png

# team game: dos tarjetas de rival, una al lado de la otra
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS \
  ./node_modules/electron/dist/electron.exe . \
  --isolated --demo=tg --rival-info --shot --out=demo-rival-info-tg.png
```

`--isolated` usa un `userData` propio: así podés capturar demos **mientras el overlay real sigue abierto**, porque `requestSingleInstanceLock()` comparte el `userData` y, sin este flag, el demo chocaría con el `.exe` en uso.

## Modo ejemplo — "Ver test"

**Para qué sirve:** comprobar de un vistazo que el panel de ELO, los escudos, la Ayuda de civ, el informe del rival y el auto-ocultado a 0:20 se ven bien, **sin tener que jugar ni esperar el matchmaking**. Está en **Configuración → Modo ejemplo** (`Ctrl+Alt+S`).

### Cómo usarlo

1. Escribí un **nombre de jugador** (busca perfiles públicos y elige la coincidencia exacta o la primera) o un **profile ID** (el número de `aoe2insights.com/user/<id>`, validado contra World's Edge).
2. Tocá **Ver test** (o `Enter`).
3. Mirá el overlay: se pinta con la **última partida real** de ese perfil, aunque ya haya terminado. Lleva la etiqueta **EJEMPLO** y, en el pie, el número de partida real, su fecha y la aclaración `reloj de prueba`.
4. Usá los tres botones de **Reloj de ejemplo** para inspeccionar los dos momentos que importan:

   | Reloj | Qué tendría que verse |
   | --- | --- |
   | `0:03` (congelado) | ELO visible, Ayuda de civ visible con cuenta regresiva fija `0:03 / 0:20`, informe del rival visible |
   | `0:21` (congelado) | ELO, ayuda e informe **ocultos**: es exactamente el "no molestar durante la partida" |
   | `En vivo` | El reloj corre desde 0:03 y a 0:20 se oculta solo |

5. **Terminar ejemplo** devuelve el panel al estado real al instante (dispara un `poll()`, no espera al próximo tick).

### Qué es real y qué no

| Dato | Origen |
| --- | --- |
| Roster, nombres, civilizaciones, mapa, modo, resultado, fecha y `matchId` | `GET /api/matches?profile_ids=<id>&use_enums=true&per_page=1` de AoE2 Companion (última partida del perfil) |
| ELO, pico y rank de cada jugador | `getPersonalStat` de World's Edge, **siempre ladder #3 (RM 1v1)**; jamás el rating del modo de esa partida |
| Últimas 5 civs y civ/mapa favoritos del rival | AoE2 Companion (`/api/matches`, `/api/profiles/:id/stats`) |
| Aperturas del rival | AoE2Insights `/stats/api/match-ups/` (`strategy` de replays analizados) |
| Escudos y resúmenes **BONOS / UNIDADES / DEBILIDADES** | `assets/civs/` + `src/civ-guide.js` (offline, 62 civs) |

**Lo único simulado es el reloj.** `src/aoe.js → buildExampleSnapshot()` publica la partida como `status: 'ongoing'` con `match.startedAt = ahora - offset` (3 s o 21 s) para poder inspeccionar el reloj de la intro. El timestamp original se conserva en `example.realStartedAt` y se muestra en el panel: el ejemplo **no finge que la partida es de ahora**. No hay rosters de maqueta, ni ELO inventados, ni aperturas inferidas de la civilización.

### No toca tu configuración

Durante el ejemplo las cinco opciones visuales se encienden **solo en memoria** (`EXAMPLE_ALL_ON` → `viewConfig()`): `civHelp`, `hideEloAt20`, `rivalCivs`, `rivalFavorites` y `rivalOpenings`. **No se llama a `persistConfig()`**: tu `config.json`, tus toggles y tu cuenta quedan exactamente como estaban. Al terminar, `deactivateExample()` reenvía la config real, limpia el reloj, el informe del rival y el estado cacheado.

Además:

- `emit()` ignora cualquier estado en vivo que no tenga la marca `example`, así el polling y los websockets **no pisan** el panel de prueba. `poll()` devuelve `ejemplo` mientras está activo.
- `"VOS"` y los rivales del informe se calculan contra el **perfil buscado**, no contra tu cuenta local: podés probar con la partida de cualquier jugador.
- Cambiar de `0:03` a `0:21` **no vuelve a consultar ninguna API**: se reutiliza el partido ya normalizado (`exampleMatchFrom()`) y la cache de ELO. El informe del rival tampoco se recalcula, porque el partido y los rivales son los mismos.
- Si el perfil no tiene partidas públicas o el ID no existe, la tarjeta muestra el error y **no dibuja nada inventado**.

Verificado con el perfil real `25399083`: partida `#519930302` (Thames · EW 1v1 · 2 jugadores), ELO RM 1v1 `1180` / `901`, Ayuda de civ `Gurjaras` vs `Cumans`, e informe del rival `Митхун` con 5 civs y apertura favorita `Fast castle (60 %)` sobre 5 replays analizados.

### Capturas por línea de comandos (desarrollo)

```bash
# 0:03 congelado: todo visible, datos reales
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS \
  ./node_modules/electron/dist/electron.exe . \
  --isolated --example=25399083 --example-clock=3 \
  --shot --shot-delay=9000 --out=demo-ejemplo-003-full.png

# ventana de configuración, reloj 0:21 seleccionado
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS \
  ./node_modules/electron/dist/electron.exe . \
  --isolated --example=25399083 --example-clock=21 \
  --example-settings-shot --shot-delay=9000 --out=demo-ejemplo-021-ajustes.png
```

Flags: `--example=<nombre|id>`, `--example-clock=3|21|live`, `--example-settings-shot`, `--example-cycle` (recorre los botones de la UI y loguea cada transición: `21 → 3 → live → 3 → stop → restart`), `--shot-delay=<ms>` y `--isolated`. Las aperturas reales de AoE2Insights pueden tardar ~9 s la primera vez (`202 pending`), por eso el `--shot-delay`. Con `--example-clock=21 --shot` la captura del overlay sale **vacía**: es el comportamiento correcto, porque a 0:20 el panel se oculta entero.

## Icono, bandeja y "se cierra sola"

El icono oficial es el **emblema dorado** de `assets/app-icon-source.png`: `tools/make-icon.py` lo recorta, lo centra en un lienzo cuadrado y genera `assets/app-icon.png` (ventanas, bandeja y cabecera de la configuración) y `assets/icon.ico` de 7 tamaños (exe, instalador y accesos directos).

La app ahora **vive en la bandeja del sistema**. Cerrar la configuración ya **no** cierra el proceso: antes `window-all-closed` llamaba a `app.quit()` y el overlay desaparecía "solo". El menú de la bandeja (o doble click) ofrece *Configuración*, *Mostrar / ocultar panel*, *Refrescar ahora*, *Abrir carpeta del log* y **Salir** (única forma explícita de terminar). Si el renderer se cierra (`render-process-gone`, incluso `clean-exit`) se recarga o se recrea la ventana.

Para diagnosticar un cierre externo hay dos marcas nuevas en el log:

```text
latido · uptime=240s · panel=visible · config=cerrada          ← cada 2 min
proceso terminado · code=0 · motivo=bandeja · Salir · uptime=312s
```

Si la última línea es un **latido** y **no** aparece `proceso terminado`, el proceso fue matado desde afuera (launcher, reinstalación, kill, apagón), no por un error de JavaScript. Las excepciones y promesas sin capturar ahora se loguean como `CRASH · …` en vez de matar la app en silencio.

## Hotkeys

| Atajo | Acción |
| --- | --- |
| `Ctrl+Alt+E` | Mostrar / ocultar el overlay |
| `Ctrl+Alt+S` | Abrir la configuración (cuenta, diseño, posición) |
| `Ctrl+Alt+R` | Refrescar ahora |
| `Ctrl+Alt+Q` | Cerrar la app |

El overlay es **siempre click-through**: no recibe clicks, no se puede activar ni pasar a primer plano (`focusable: false` + `setIgnoreMouseEvents(true)`). Eso se suspende un momento solo cuando elegís **Posición → Mover el panel** en la configuración: el panel se vuelve arrastrable, lo soltás donde quieras y con **Listo** (o `Esc`) vuelve a ser click-through y queda fijo ahí. Esa posición se guarda como `position: "custom"` con `x`/`y` en la config; en cada arranque se respeta (y se limita al monitor para que no quede fuera de vista).

## Configuración (`config.json`)

En la app instalada/portable está en `%APPDATA%\AoE2 ELO Overlay\config.json`. Corriendo desde el código, en `elo-overlay/config.json`. Los cambios se aplican al reiniciar.

| Clave | Default | Qué hace |
| --- | --- | --- |
| `profileId` | `null` | Tu profile ID. `null` = auto-detección (lo escribe la ventana de configuración) |
| `pollSeconds` | `15` | Cada cuánto se consulta mientras hay partida |
| `idlePollSeconds` | `3` | Cada cuánto se busca partida nueva (espera) |
| `width` | `520` | Ancho en píxeles |
| `scale` | `1` | Escala de fuente |
| `opacity` | `0.95` | Opacidad de la ventana entera (0.15 a 1) |
| `theme` | `clasico` | Diseño: `clasico`, `noche`, `vidrio`, `claro`, `neon`, `fantasma`, `aurora`, `dorado`, `carbono`, `pergamino`, `sakura` |
| `position` | `top-center` | `top-center` o dejar la posición manual |
| `offsetX` / `offsetY` | `0` / `16` | Ajuste fino de posición |
| `statsCacheMinutes` | `15` | Cuánto se cachea el ELO por jugador |
| `civHelp` | `false` | Ayuda de civ a 0:01, oculta a 0:20 (se cambia desde la configuración, en caliente) |
| `hideEloAt20` | `false` | Oculta el panel de ELO al tiempo elegido y lo devuelve al terminar la partida |
| `hideAtSeconds` | `20` | Segundos tras el inicio en que se ocultan la ayuda de civ y el ELO (10 a 60) |
| `rivalCivs` | `false` | Últimas 5 civs jugadas por el rival (informe opcional) |
| `rivalFavorites` | `false` | Civ y mapa más usados del rival |
| `rivalOpenings` | `false` | Aperturas reales de AoE2Insights (replays analizados) |
| `debug` | `false` | Loguea detalles de altura y diagnóstico |

Las claves nuevas se agregan solas al `config.json` existente la primera vez que arranca (`loadConfig()` migra sin pisar lo que ya elegiste). Las cinco opciones de partida se cambian **en caliente** desde la configuración; no hace falta editar el archivo a mano.

## De dónde salen los datos

Ninguna de las fuentes pide API key. `aoe2.net` está muerto (API dada de baja), así que:

1. **Partida en curso** — AoE2 Companion:
   `GET https://data.aoe2companion.com/api/matches?profile_ids=<id>&page=1&per_page=1`
   Una partida está en curso cuando `finished` es `null`. Los jugadores vienen en `teams[].players[]`.
   La doc oficial de Companion recomienda WebSocket para overlays: `wss://socket.aoe2companion.com/listen?handler=ongoing-matches&profile_ids=<id>`. El polling es el respaldo simple; migrar a WS baja la latencia a ~1 s.
2. **ELO, rank y pico** — backend de World's Edge (no oficial, sin auth):
   `GET https://aoe-api.worldsedgelink.com/community/leaderboard/getPersonalStat?title=age2&profile_ids=[ids]`
   El endpoint devuelve **todas** las ladders de cada jugador en una sola request; el overlay se queda siempre con las filas `leaderboard_id: 3` (1v1 Random Map), de donde salen `rating`, `highestrating`, `rank`, `wins`, `losses`. `statGroups[].members[].profile_id` mapea cada fila a su jugador. Un solo request para todo el roster, sea del modo que sea.
3. **Historial y favoritos del rival** — AoE2 Companion (solo si activás alguna opción del informe):
   `GET /api/matches?profile_ids=<rival>&page=1&per_page=25` trae `teams[].players[].civName`, `won` y el mapa;
   `GET /api/profiles/<rival>/stats?leaderboard_id=<enum>` trae los agregados históricos `civ[]` y `map[]` con `games` / `wins` / `losses`. El `leaderboardId` numérico del juego se traduce a enum (`3 → rm_1v1`, `4 → rm_team`, `13 → ew_1v1`, `14 → ew_team`, `1/2 → dm_*`); en unranked/custom cae a `rm_1v1`.
4. **Aperturas reales del rival** — AoE2Insights (`src/insights.js`, ver la sección anterior):
   `GET /stats/api/match-ups/` filtrado por `player_relic_id` (= `profileId`) **y por la ladder exacta de la partida** (`ladder = 3/4/13/14/1/2` según el modo). Es la **única** fuente que publica `strategy`, y solo para replays ya analizados. No hay inferencia por civ ni guía genérica, y jamás se mezclan modos.

Verificado el 2026-11-09 con un `matched` real de TG: los `rating` del evento coinciden con la ladder #4 (equipo), no con la #3, y `getPersonalStat` para 8 jugadores tarda ~0,5 s. También se confirmó que los jugadores que nunca jugaron 1v1 ranked **no tienen fila** en la ladder 3: no es un bug del parser, es así el backend.

## Modos soportados

El `leaderboardId` solo **etiqueta el modo** en la cabecera. El ELO, el rank y el pico son siempre de RM 1v1 (#3):

| Partida | Cabecera | Número que se ve |
| --- | --- | --- |
| 1v1 Random Map | `RM 1v1` | ELO/rank/pico RM 1v1 |
| TG Random Map (4/6/8) | `RM team` | ELO/rank/pico **RM 1v1** de cada uno, no el de equipo |
| Empire Wars 1v1 / TG | `EW 1v1` / `EW team` | ELO/rank/pico **RM 1v1** |
| Deathmatch 1v1 / TG | `DM 1v1` / `DM team` | ELO/rank/pico **RM 1v1** |
| Sala personalizada / unranked | `Unranked` | ELO/rank/pico **RM 1v1**; si el jugador no tiene ladder 1v1 → `—` |
| Partida encontrada (minuto previo) | `Partida encontrada · <modo>` | ELO/rank/pico **RM 1v1** del roster que llega en `matched` |

Verificado con datos reales: en una TG de 4 jugadores, dos tenían ladder 3 y dos no. El panel muestra el 1v1 de los primeros y `—` en los otros, en vez de rellenar con el ELO de equipo. En todos los casos se aplica la misma cache `elo1v1:<profileId>`.

## Límites conocidos

- **Durante la búsqueda no hay rival**: el roster recién existe cuando el servidor arma la partida (el `matched`, ~60 s antes de entrar). Ahí mismo aparece el panel; no antes, porque no hay a quién mostrarle.
- **Jugadores sin 1v1 ranked**: no tienen fila en la ladder 3 y se muestran con `—`. Es intencional: ponerles el ELO de equipo o el unranked sería medir otra cosa.
- **Sala personalizada**: el ELO del payload se ignora. Si el rival solo juega custom, vas a ver `—` en su fila.
- El backend de World's Edge es **no oficial y no documentado**: puede cambiar con un parche. Si falla, el overlay mantiene el último dato bueno en gris (`stale`) en vez de romperse.
- **Cobertura de aperturas**: AoE2Insights solo etiqueta partidas cuyo replay fue analizado. Cuentas nuevas, rivales con pocas partidas o perfiles sin replays procesados muestran *"Sin replays analizados"*; no se rellena con una suposición. La primera consulta de un rival nuevo puede tardar ~9 s (`202 pending`), las siguientes salen de cache.
- **TG**: el informe muestra hasta 2 rivales. Historial de civs, favoritos y aperturas son **del mismo modo de juego** de la partida en curso (RM 1v1, RM Team, EW 1v1, EW Team, DM): nunca se mezcla EW con RM. En custom/unranked las aperturas se informan como no disponibles (sin consulta), porque no hay ladder rankeado para filtrar.
- Las tres fuentes del informe son **públicas y no oficiales**: si AoE2 Companion o AoE2Insights cambian su API o la bloquean, el informe queda incompleto pero el ELO sigue igual.
- **Modo ejemplo**: usa la **última partida pública** del perfil, no una partida en vivo; si el perfil es privado o no tiene historial en AoE2 Companion, se muestra un error en vez de armar datos de relleno. El reloj es de prueba (congelado o en vivo desde 0:03), así que no refleja la duración real de esa partida. Las aperturas del rival dependen de que AoE2Insights tenga replays analizados **en el mismo modo de juego**, igual que en una partida real.
- No muestra nada *dentro* del HUD del juego: es una ventana por encima.

## Test

```bash
npm run selftest
```

Valida detección de cuenta, las etiquetas de modo, `getPersonalStat` (rating/pico/rank) contra partidas reales de TG y unranked, y —con backend simulado— la regla RM 1v1 en TG/EW/custom/`matched`: que nunca se pinte `modeRating`/`matchRating`, que los jugadores sin ladder 3 den `—`, que la cache `elo1v1:` se reutilice entre modos y que una caída del backend no rompa el panel. También cubre el reloj real (`0:01`/`0:20`, reaparición al terminar, independencia de las dos opciones, guía offline de las 62 civs) y la detección instantánea por `reason:'matched'` + fallback por `matchId`, sin abrir Electron ni hacer cola.

Las secciones **13–15** son **100 % offline** (backend simulado, sin red): validan `src/insights.js` (URL del `match-ups`, `202 pending` + `retry-after`, formato columna, dedupe por `match_id` en TG, que `Unknown`/`null` no cuenten, ranking/últimas 5, cache de 30 min y que una caída de red **no fabrique** una apertura), `src/rival.js` (que el informe muestre **rivales y no aliados**, historial, favoritos, primer pintado parcial, `includeOpenings=false`, errores controlados y ausencia del campo inventado `opening`) y el cableado estático de los 3 flags, los canales IPC y el `app.asar`.

Las secciones **16–18** cubren el **Modo ejemplo**, también sin red: `buildExampleSnapshot()` con una última partida real ya terminada (marca `example`, fecha original conservada, reloj simulado, ELO de RM 1v1 y no del modo, `"VOS"` apuntando al perfil buscado, pintado en dos fases, cambio de reloj sin repetir requests, `normalizeMatch()` y errores controlados); el reloj congelado de `src/intro.js` (0:03 visible / 0:21 oculto / reaparición al terminar); y el cableado estático de los 3 IPC nuevos, el override **no persistente** `EXAMPLE_ALL_ON`, el guard de `emit()`, `frozenElapsedMs`, los estilos y los flags CLI.

La sección **19** cubre el **filtrado por modo de juego** (EW ≠ RM): `resolveMode()`/`ladderMode()`/`sameMode()` (números, enums y etiquetas; unranked/custom → sin modo), el **segundo `filter` `ladder=<id>`** en la URL, el conteo solo del modo exacto con `discardedOtherModes`, la cache separada por ladder (`rival:openings:<id>:<ladder>`, RM no pisa a EW), el historial de civs filtrado por modo, el cortocircuito **sin request** en custom/unranked (`modeUnavailable`) y el cableado estático (`leaderboardOf`, firma con modo, etiquetas del renderer y la nota en ajustes).

Para ver la estética sin jugar hay un modo demo con captura de la propia ventana:

```bash
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS \
  ./node_modules/electron/dist/electron.exe . --isolated --demo=tg --shot --out=demo-tg.png
```

Modos: `rm1v1`, `tg`, `ew`, `custom`. `--shot` guarda un PNG de la ventana y cierra. En los cuatro demos la cabecera cambia de modo pero los números son de RM 1v1 y la etiqueta `ELO RM 1v1` está presente, igual que en vivo.

Otros flags de captura: `--civ-help` (0:03), `--civ-help=late` (0:21), `--hide-elo`, `--rival-info` (siembra el informe del rival con datos reales de prueba), `--settings-shot` (ventana de configuración), `--out=<archivo.png>` y `--isolated` (userData aparte, imprescindible si ya tenés el overlay corriendo). Ver **Informe opcional del rival** y **Modo ejemplo** para los comandos completos (`--example=…` usa datos 100 % reales).

## Troubleshooting

- **`npm` explota con `Invalid package config ...kimi-desktop...`**: en esta máquina el `npm` del PATH (`~/bin/npm`) apunta a un runtime empaquetado de otra app y corre con el Node del sistema. Usá el oficial:
  ```bash
  "/c/Program Files/nodejs/npm" install --no-fund --no-audit --save-dev electron
  "/c/Program Files/nodejs/npm" start
  ```
- **`electron.exe: No such file or directory` / falta el binario**: el postinstall no bajó el binario. Se arregla con `node node_modules/electron/install.js`.
- **El overlay no aparece sobre el juego**: el juego tiene que estar en el modo "Fullscreen" que trae (que es borderless) o en ventana. Con fullscreen exclusivo forzado no se dibuja ninguna ventana encima.
- **Perfil equivocado** (tenés varias cuentas Steam): poné `profileId` en `config.json` para fijarla.
- **Windows no deja abrir el `.exe`**: es el aviso de SmartScreen por no estar firmado. "Más información" → "Ejecutar de todas formas".
- **El modo demo falla con `Cannot read properties of undefined (reading 'isPackaged')`**: la terminal viene de otra app Electron y hereda `ELECTRON_RUN_AS_NODE=1`, así que `electron.exe` arranca como Node plano. Sacalo del entorno:
  ```bash
  env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS \
    ./node_modules/electron/dist/electron.exe . --demo --civ-help --shot --out=demo-civhelp.png
  ```
- **El demo se cierra con `ya hay otra instancia corriendo`**: `requestSingleInstanceLock()` comparte el `userData` entre el código y el `.exe` instalado/portable. Si tenés el overlay abierto, agregá `--isolated` para que el demo use un `userData` propio en `%TEMP%`; así no hace falta cerrar tu app ni matar procesos.

## Recompilar el `.exe`

```bash
cd elo-overlay
"/c/Program Files/nodejs/npm" run dist
```

La salida queda en `elo-overlay/dist/`. El `npm` de esta máquina que está en el PATH falla (ver Troubleshooting), por eso la ruta completa. Los archivos que van dentro del `app.asar` los define `electron-builder.json` (`src/**/*` y `assets/**/*`); para confirmar que un módulo nuevo quedó incluido: `node tools/asar-inspect.js`, o listá el paquete con `@electron/asar`.

**Si la app está abierta**, Windows bloquea el `.exe` portable en uso: el build a `dist/` igual termina bien, pero no se puede sobrescribir esa copia hasta cerrarla desde la bandeja con **Salir**. El instalador, los `.zip` y el `.exe` de la subcarpeta de `para-compartir/` sí se pueden refrescar sin cerrar nada.

`electron-builder` borra `dist/win-unpacked` antes de reempaquetar. Si el entorno bloquea borrados masivos (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`), **no hace falta borrar**: mové la carpeta vieja fuera (`mv dist/win-unpacked "$TEMP/aoe2-overlay-win-unpacked-stale"`) y volvé a correr `npm run dist`.

El icono se regenera con `python tools/make-icon.py` desde `assets/app-icon-source.png`: produce `assets/app-icon.png` (ventanas/bandeja/configuración) y `assets/icon.ico` (exe/instalador). El PNG fuente se excluye del paquete; solo los dos iconos derivados van dentro del `app.asar`.

## Actualizaciones automáticas (sin pagar ningún servicio)

La app instalada consulta **GitHub Releases** y se actualiza sola. No hay backend, ni servidor propio, ni suscripción: los runners estándar de GitHub Actions son gratis en repositorios públicos.

**Dos formas de publicar un cambio** (el resultado es idéntico):

- **El cambio lo hace el asistente:** al terminar la tarea ejecuta `npm run publish:once`, que agrupa los cambios, sube la versión `patch`, hace commit, crea el tag `vX.Y.Z` y pushea. **No hace falta watcher ni autostart.** Es el camino habitual.
- **Alguien edita archivos sin pasar por el asistente:** `tools/auto-publish.js` vigila la carpeta y hace lo mismo solo. Para que siga vivo tras reiniciar la PC se registra con `npm run autostart` (**opcional**).

En ambos casos `.github/workflows/release.yml` compila en `windows-latest` y publica `latest.yml` + `AoE2 ELO Overlay Setup X.Y.Z.exe` + `.blockmap`. Las apps de los jugadores descargan el delta y lo instalan en silencio al salir; los usuarios nunca hacen nada.

**Cambios que no tocan el binario** (README, `tools/`, capturas): `git commit && git push` **sin tag**. Así no se genera un Release ni los usuarios bajan 117 MB por un cambio de documentación.

**Regla de producto:** `src/updater.js` nunca consulta ni descarga mientras `lastGood.status === 'ongoing'`. Un overlay de AoE2 no debe comerse el ancho de banda ni reiniciarse en media partida. Consulta al arranque (20 s) y cada 6 h; si hay partida, pospone y reintenta solo. Desde la bandeja, **Buscar actualizaciones…** fuerza una consulta manual.

**Puesta en marcha (una sola vez):**

```bash
# 1. Crear el repo público en GitHub (con gh: gh repo create <usuario>/aoe2-elo-overlay --public)
# 2. Configurar el canal, el remote y el tag inicial:
"/c/Program Files/nodejs/npm" run setup:updates -- <usuario>/<repo> --ssh
# 3. Primer push; el tag dispara el primer Release automático:
git push -u origin main --tags
```

No hay paso 4 obligatorio. `npm run autostart` queda como **opción**: solo sirve si vas a editar archivos por tu cuenta y querés que se publiquen sin intervención. Si los cambios los pide el asistente, no hace falta instalarlo.

`--ssh` deja el remote como `git@github.com:<usuario>/<repo>.git` y la autenticación en una **clave de despliegue con permisos de escritura** de `~/.ssh`, con permisos mínimos y fuera del repo. Nunca se escribe un token en `package.json`, en `electron-builder.json` ni en `.git/config`. Si el repo es privado, los Releases no se pueden descargar sin autenticación: usá `provider: generic` sobre un hosting estático.

**La única vez que los usuarios hacen algo:** quien tenga instalada la **v0.1.0** debe instalar la v0.1.2 a mano, porque esa versión no trae el updater. Desde ahí, cero intervención. El `.exe` **portable no se auto-actualiza**: distribuí siempre el instalador NSIS.

**Comandos útiles:**

| Comando | Qué hace |
|---|---|
| `npm run publish:once` | Un ciclo y sale: lo que ejecuta el asistente al cerrar un cambio |
| `git commit && git push` | Solo documentación: sin tag, sin Release |
| `npm run watch:publish` | Vigila la carpeta y publica al guardar (opcional, para ediciones manuales) |
| `node tools/auto-publish.js --once --dry-run` | Simula sin tocar nada |
| `npm run autostart -- --remove` | Desactiva el arranque automático |
| `npm run release` | Build + publicación manual (usa `GH_TOKEN`) |

Variables de entorno del watcher: `AUTO_PUBLISH_DEBOUNCE_MS` (default 10 min) y `AUTO_PUBLISH_SWEEP_MS` (default 15 min). El log está en `auto-publish.log` y se rota solo.

**No se sube nunca:** `config.json` (la cuenta del jugador), `overlay.log`, `dist/`, `node_modules/`, capturas `/*.png` y `para-compartir/`. `assets/**/*.png` sí se sube: son los 62 escudos que van dentro del `app.asar`.

**Si SmartScreen avisa** al instalar o al actualizar: es porque el binario no está firmado con un certificado de código. No afecta al mecanismo de actualización; "Más información" → "Ejecutar de todas formas".

