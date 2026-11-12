## v0.1.17 · Iconos, jerarquía de dato y dos bugs de partida

- **Iconos en todo el panel** (SVG inline: ni archivos nuevos ni peticiones, heredan el color de cada tema): escudo en *Ayuda de civ*, espadas en *Informe del rival*, foco en *Recomendaciones*, y ★ BONOS / ⚑ UNIDADES / ⚠ DEBILIDADES en cada civil. El pico del jugador pasó de la palabra «pico» a una flecha ↑.
- **El informe del rival se lee sin leerlo**: dos tarjetas de dato con el número grande (*33 %* en rojo si le va mal, verde si le va bien) y el contexto chico debajo (*9 partidas · 3-6 · le va mal*). Antes era una frase corrida que había que leer completa.
- **Fuera el texto de relleno**: ya no se muestran las fuentes de datos (*AoE2 Companion · AoE2Insights*), ni el modo repetido en la cabecera cuando el tag ya dice *ELO RM 1v1*, ni *APERTURA EN ESTE MAPA* / *ÚLTIMAS 5 CIVS* / *ÚLTIMAS DE ESA CIV*. Los bloques sin datos dejan de tener título.
- **Arreglado: la tarjeta de civ se volvía a abrir a mitad de partida.** El reloj de la intro se identificaba por `matchId + startedAt`, y el REST a veces manda el mismo partido con otro `startedAt` (o sin él un poll), lo que creaba una intro nueva con el reloj en 0:00 y volvía a mostrar la tarjeta. Ahora el reloj pertenece al **partido** (`matchId`): cambia el `startedAt`, pasa por `lobby` o falta un poll y no se reinicia; al terminar la partida se suelta en el acto.
- **Arreglado: quedaba información vieja trabada al salir y volver a entrar.** El polling descartaba los snapshots *«sin partida»* durante 15 minutos después de aparearte, así que si el socket no avisaba el fin, el panel se quedaba con la partida anterior. Ahora, si el panel ya está mostrando una partida en curso, ese *«sin partida»* es el fin real. Además el informe del rival y las recomendaciones se borran **en el momento** en que cambia el partido, en vez de mostrar los del rival anterior mientras se consulta el nuevo.
- Ajustes de espaciado y alineación: las tarjetas de dato comparten la línea de la sub-etiqueta, la fila de escudos ya no queda pegada al borde inferior y la barrita de la cuenta regresiva es más fina y tenue.

---

## v0.1.16 · Barrita de análisis en el panel

- **Arreglado: la partida vuelve a aparecer al ENCONTRAR rival**, en la sala de espera, sin esperar a entrar al mapa. El carril rápido tenía dos fallas: (1) solo se aceleraba si te veía *buscando*, así que una cola que pasaba de `queueing` a `matched` entre dos pings (6 s) nunca entraba al modo rápido; y (2) se pausaba justo en el aviso «encontré rival», **antes** de que llegara el roster, dejando el panel a merced del lote empujado (~15 s) o directamente del inicio de la partida. Ahora pide el snapshot global en el acto cuando el ping filtrado ya te ve apareado, la pausa es recién con el roster en pantalla, y si la pausa quedara colgada se reactiva sola a los 20 s.
- El aviso «encontré rival» ya no puede ser tapado por el polling con *«Sin partida»* mientras se arma la pre-partida.

- **Una sola barrita de análisis** debajo del título: mientras el panel espera datos que se calculan en segundo plano muestra **qué está haciendo** (*Consultando ELO RM 1v1…*, *Buscando datos del rival…*, *Analizando replays…*, *Analizando replays del rival…*).
- **Sin barras por bloque**: los bloques pendientes solo cambian su texto. Una barra animada en cada bloque es ruido en un overlay que se mira de reojo.
- **Los bloques ya no dicen «sin historial» mientras cargan**: ahora dicen *«Buscando sus últimas civs…»* / *«Buscando su historial en este mapa…»*. Era información engañosa durante el análisis.
- **Informe del rival reescrito para leerse de un vistazo**: la conclusión va escrita (*«En Hideout le va mal: 33 % en 9 partidas (3-6)»*), cada número lleva su unidad y su récord, el modo deja de repetirse en cada bloque (está en la cabecera) y cuando no hay replays se avisa **una vez** — antes había dos avisos seguidos que parecían un error.
- **Se apaga sola** cuando no falta nada: en partida no queda nada animado tapando el juego. Respeta *reducir movimiento* (barra fija y tenue).
- El color sigue al tema activo (dorado en Clásico, blanco en Fantasma, etc.).

---

## v0.1.15 · La partida aparece al segundo + actualizaciones automáticas

- **La partida apareada se ve en ~1,5 s, no 15 s después.** El feed de matchmaking de AoE2 Companion **no empuja cada evento**: manda un lote cada ~15 s, así que esperar al socket hacía que el panel se dibujara cuando la partida ya estaba por empezar. Ahora el overlay pide **snapshots frescos a demanda**: sin cola consulta el socket **filtrado por tu perfil** (~300 B, cada 6 s) y, en cuanto detecta que estás buscando, pide el snapshot **global** con el roster del `matched` **cada 1,5 s**. Al aparearse se pausa solo.
- **El log mide la latencia real**: `el servidor la marcó hace 1400ms` / `servidor→pantalla 1900ms`, usando el `matchedAt` que publica el servidor.
- **El ELO ya no se queda en `…`.** Si el backend de World's Edge falla justo cuando aparece la partida, se reintenta a los 1,5 s (hasta 3 veces) y la request tiene timeout de 7 s con un reintento inmediato. Antes, un solo fallo dejaba la columna en `…` hasta el inicio de la partida.
- **Nueva opción «Actualizaciones automáticas»** en la pestaña **Updater** (apagada de fábrica): consulta cada **30 minutos** y, si hay una versión nueva, la **descarga e instala sola** en silencio. Nunca en media partida: si estás jugando, se aplica al terminar. Un «Omitir» anterior deja de bloquear.

---

## v0.1.14 · Recomendaciones inteligentes (pre-partida)

- **Nueva opción «Recomendaciones inteligentes»** en *Configuración → Datos del rival* (apagada de fábrica). Al encontrarse la partida (ventana de preparación) muestra un **consejo por rival** calculado con **datos reales** de AoE2Insights (`/stats/api/match-ups/` sobre replays analizados):
  - **Civs que le cuestan en el mapa actual** — p. ej. *«pierde 80% contra Gurjaras · 5 pj»*.
  - **Aperturas que le duelen** (el `strategy_opponent` real: scouts, archers, drush…) — p. ej. *«Scouts 39% · 31 pj»*.
  - **Perfil de ritmo** — si le salen mejor las partidas cortas o las largas, con los porcentajes al lado.
- **Solo se ve antes de que arranque la partida.** El bloque vive en la fase `lobby` y desaparece solo al iniciar (no hay timer ni reloj: el gate es la fase que manda el main). No molesta durante el juego.
- **Nunca inventa nada.** Cada línea muestra su muestra. Si el mapa puntual no tiene datos suficientes, baja al tipo de mapa (abierto/cerrado) y lo declara; si tampoco, al modo completo. Debajo de los mínimos de muestra (6 partidas en el recorte, 3 por civ, 4 por apertura) no se muestra ningún número.
- **Coherencia de modo:** usa el `ladder` exacto de la partida (EW no se mezcla con RM). En custom/unranked no se consulta nada en lugar de mezclar.
- Una sola request por rival por modo la primera vez (~3-9 s mientras el backend calcula y responde `202`); luego cache local de 30 min. El ELO y el aviso de partida encontrada siguen saliendo en 0-1 ms.

---

## v0.1.13 · Actualizar sin instalador a la vista

- **«Actualizar ahora» ya no abre el instalador.** La instalación pasa a ser silenciosa (`/S`): no hay bienvenida, ni elección de carpeta, ni accesos directos, ni botón «Finalizar». La app se cierra, se reemplaza sin mostrar nada y **se reabre sola** (`--force-run`). Conserva la carpeta de instalación y no pide permisos de administrador.
- **Nunca te corta una partida.** Si apretás «Actualizar ahora» con un juego en curso, la instalación se pospone y el panel lo avisa (*Instalación pospuesta*). Se aplica sola apenas termina la partida, sin que tengas que volver a tocar nada. Si en el medio sale una versión más nueva, se espera a esa y jamás se instala la vieja.
- Se mantiene la instalación silenciosa al salir de la app (que ya funcionaba así) y la descarga diferencial por `.blockmap`.

> En Windows el ejecutable está en uso mientras la app corre: no se puede reemplazar en caliente. Siempre hay un cierre breve y una reapertura automática; lo que desaparece es la ventana del asistente, no el reinicio.

---

## Ya incluido desde v0.1.12

- Pie de la configuración sin la ruta de `config.json` ni el aviso del panel no clickeable (**Esc sigue cerrando la ventana**).
- Updater con **un solo** botón de búsqueda: «Buscar actualizaciones» consulta; el botón principal solo descarga o instala.
- El crédito **By Acido** queda únicamente en el pie del riel, al lado de la versión.

## Ya incluido desde v0.1.11

### Corregido

- **Ya no quedás atrapado en una versión intermedia.** Si tenés la v1.6 descargada y sale la v1.7, ahora se puede volver a buscar sin instalar la v1.6 antes: la descarga vieja se descarta, se baja solo la más nueva y nunca se instala una versión anterior.
- **Omitir** ya no queda pegado para siempre: aplica solo a esa versión y se limpia automáticamente cuando aparece otra.
- **Sin falsos errores al publicar:** GitHub marca el release como "latest" unos minutos antes de que se suba `latest.yml`; ese 404 ahora se muestra como *Publicándose…* y se reintenta solo, sin cartel rojo.
- El workflow ya no sobreescribe las notas de la v0.1.9 en cada release y verifica que `latest.yml` haya quedado publicado.

### Agregado

- **Notificación de Windows al abrir la app** cuando hay una actualización disponible y cuando termina de descargarse. Al tocarla se abre la configuración directamente en la pestaña **Updater**.
- **Aviso chico en el overlay** (12 segundos, solo visual): muestra la versión nueva. No aparece durante una partida; si llega en medio de una, se pospone y se muestra al terminar.
- Consulta automática cada 30 minutos mientras haya una actualización pendiente (antes, cada 6 horas sin importar el estado).
