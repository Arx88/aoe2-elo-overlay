## v0.1.23 · Señales tácticas en la pre-partida

La pre-partida deja de contar cosas del rival y pasa a responder tres preguntas que cambian una decisión **dentro** de la partida: ¿viene agresivo o boomea?, ¿qué le duele?, ¿alargo o cierro temprano?

- **Tres señales con números grandes y sin texto apilado.** `ESTILO` (distribución agresivo / boom con su barra y su muestra), `LE DUELE` (la apertura que le gana, con la fracción de derrotas) y `CERRÁ TEMPRANO` / `ALARGÁ LA PARTIDA` (su winrate en el tramo que te conviene forzar). Rojo = amenaza a preparar, verde = ventaja explotable.
- **Coste cero.** Todo sale de columnas que el overlay ya descargó y cacheó (`strategy`, `strategy_opponent`, `match_duration`): ni una request nueva, ni un endpoint nuevo, ni parseo de replays. `tempoProfile()` ya se calculaba y nunca se había pintado; `openingsAgainst()` estaba escondido en una línea chica.
- **Racha: fuera. Smurf: dentro.** La racha no cambia ninguna decisión y no aparece. En su lugar, `POSIBLE SMURF` con el pico histórico de ELO cuando está muy por encima del ELO actual. Se construye con `peak` / `rating`, que ya viajan en el roster: es una etiqueta con su evidencia, no un porcentaje con decimales que aparente precisión.
- **Honestidad de muestra más estricta.** Porcentaje solo con `n >= 20`; con 5–19 se publica la fracción `8/11` y con `n < 5` ningún número. «Le duele» ahora exige perder **más de la mitad** (un 39 % de derrotas era exactamente lo contrario de un consejo). El consejo de ritmo exige un diferencial de 15 pp y al menos 8 partidas en **ambos** extremos.
- **Sin falsas certezas.** Si el reparto de aperturas no tiene una dominancia del 60 %, se declara `MIXTO` y se muestra el reparto (`25:9`) en vez de colapsarlo en una etiqueta. Se declara también cuántos `Drush → FC` quedaron fuera por ser híbridos y si el dato viene del mapa o de todo el modo.
- **Menos redundancia.** Con las recomendaciones activas ya no se repite «Arranca con Scouts…» en el informe: la distribución responde mejor y con más muestra. Las fracciones llevan leyenda «derrotas / partidas» para que `8/11` no se lea como victorias.
- **Sin datos inventados.** Se descartaron `linkedProfiles` y `maxRating` (no documentados en la API de AoE2 Companion) y una etiqueta `Fast Imperial` que no existe en el endpoint: el boom se mide con `Fast castle` + duración de partida.
- Selftest: 8 comprobaciones nuevas sobre la distribución, los umbrales de muestra, la ausencia de racha y el smurf.

---

## v0.1.22 · El informe del rival, en palabras

El informe deja de ser un tablero de números: cada cifra ahora se lee como una frase, siempre con su muestra real.

- **«Si tuvieras que apostar»**, arriba de cada rival: las dos cosas que más sirven para preparar la partida en dos líneas — la civ que más usa **en este mapa** con su cuota real (*«Koreans en 67 % de sus 18 partidas acá»*) y cómo arranca (*«Arranca con FC en 1 de 1 replay acá»*).
- **Cada número con su denominador.** Ya no hay un `45 %` suelto: dice *«gana 29 de sus 65 partidas»*. La civ del mapa se explica igual: *«la eligió en 20 de sus 65 partidas (31 %)»*, que es la probabilidad de que la repita.
- **Aperturas con la muestra completa.** Se consultaba solo la ventana de las 120 partidas más recientes de todos los mapas, así que un mapa jugado hace dos meses aparecía como *«sin replays»* y la muestra quedaba a la mitad (medido: 18 replays en 9 mapas → 60 replays en 16 mapas con el historial completo). Ahora se pide todo el historial del modo.
- **Esa consulta ya no frena el panel.** Con el historial completo tarda ~20 s la primera vez de cada rival (después ~70 ms por la cache): el informe se publica igual a los ~6 s sin aperturas y la tarjeta se completa sola cuando llegan. Antes el informe **esperaba** esa consulta.
- **Muestra chica, dicha.** Con 1 a 4 replays el bloque avisa *«Muestra chica: es una pista, no una tendencia»* en vez de mostrar un `100 %` que parece certeza.
- **Arreglado: el panel se recortaba abajo.** El contenido pedía 1209 px y el monitor dejaba 1155, así que la última tarjeta se cortaba sin aviso (no hay scroll). Ahora el renderer conoce el alto disponible y se ajusta lo mínimo necesario; además el espaciado se compactó sin apretar el texto.
- **Arreglado: las aperturas se daban por perdidas en frío.** El cliente reintentaba 6 veces cada 3 s y se rendía a los 15 s, cuando la consulta completa tarda ~20 s. Ahora el presupuesto cubre el cálculo real.
- **Arreglado: «MAPAS CLOSED».** El tipo de mapa (`map_openness`) se mostraba en inglés y se leía como el nombre de un mapa. Ahora dice *«en mapas cerrados»*, *«abiertos»* o *«semiabiertos»*.
- **Diseño coherente con el resto del panel.** Una sola caja por sección (antes había cajas dentro de cajas), los dos rivales son dos columnas de texto separadas por la misma línea que separa los equipos en el roster, y abajo se usa la misma escala que arriba: nombres a 1 rem, números grandes al tamaño del ELO, etiquetas al tamaño del badge «VOS» y todo el texto explicativo a un único tamaño. Los escudos de «así jugó sus últimas 5» ya no viven en recuadros.
- **Arreglado: «1 replays»** y los porcentajes que se partían de línea (`46` / `% de 13 partidas`).

---

## v0.1.21 · Estabilidad del panel

- Visibilidad centralizada (`applyVisibility()`) y una sola medición de alto por frame: los bloques ya no se quedan abiertos por su cuenta ni la ventana salta de tamaño mientras se acomoda.
- Anti-parpadeo en la pre-partida: un `idle` momentáneo del REST ya no borra la partida que está en pantalla (se sostiene 3 minutos o hasta que el servidor marque el fin).
- Pre-partida a prueba de fallos: rivales en paralelo, reintento acotado del informe y tope de tiempo para recorrer el historial.

---

## v0.1.20 · Recomendaciones legibles

- Bloque de recomendaciones reordenado: etiqueta arriba, chips con escudo y filas de dos columnas (VOS / LE CUESTA) en vez de frases corridas.
- Apertura del rival atada al `matchId`: el consejo de un rival ya no aparece en la partida siguiente.

---

## v0.1.19 · La mediana, los encuentros y la cascada

Tres mejoras sobre lo que llegó en v0.1.18, todas sobre datos que ya estaban en memoria:

- **Balance de TG por MEDIANA, no promedio.** Un smurf 2000 entre tres 1200 daba «parejo» con el promedio (1412 vs 1419) y la mediana lo muestra como es: `Tu equipo 1171 (de 1083 a 1982) · Rival 1433 · arrancás 262 abajo`. El rango del equipo se declara solo cuando está muy disperso (≥200 de diferencia) — escondido, el número mentía.
- **Cara a cara: los últimos 3 enfrentamientos, no solo el V-D.** Debajo de las tarjetas aparecen los chips (escudo de la civ con la que jugaste + V/D), con el detalle completo en el tooltip (`Vos con Franks · V · Runestones`). Y dos honestidades nuevas: el color verde/rojo del V-D se fía **solo con 3 o más partidas** (un 1-0 no es "ganás la serie"), y cuando no hay enfrentamientos el panel dice **dónde se buscó** — «Sin enfrentamientos en tus últimas 612 partidas del modo» — en vez de un "nunca jugaron" que puede ser una media verdad.
- **Civ recomendada con cascada de alcance.** Si una civ no llega a las 3 partidas en el mapa exacto, la recomendación cae al **modo completo** para esa civ — y la línea lo declara: `2. Teutons · vos 67% (6 pj · todo el modo) · le cuesta 57% (7 pj)`. Un 3-0 de suerte en el mapa ya no se disfraza de winrate del mapa.

---

## v0.1.18 · Cara a cara, balance de TG y civ recomendada

Tres opciones nuevas, todas **apagadas de fábrica** y pensadas para una sola cosa: **plantarse mejor ante el rival**.

- **Enfrentamientos previos** (*Ajustes → Overlay → Datos del rival*): tu V-D contra este rival, del **propio historial** y del **mismo modo de juego**. En la tarjeta del rival aparece como tile: **CARA A CARA 1-2** (rojo si perdés la serie, verde si ganás) con el contexto chico debajo (*3 partidas · última en Arabia*). Solo cuentan los enfrentamientos: las veces que jugaron **como aliados** van en su propia tarjeta (*COMO ALIADOS 5*) y no ensucian el V-D. Si nunca se cruzaron, lo dice — «Nunca se enfrentaron en este modo» — en vez de mostrar ceros.
- **Civ recomendada** (*Datos del rival*, pre-partida): contra este rival, en este mapa, **qué civ jugársele**. Cruza dos datos reales: lo que el rival **pierde** según sus replays analizados y **tu winrate con cada civ en ese mapa**. Score 60 % tuyo + 40 % del rival; cada línea muestra sus dos evidencias — «1. Gurjaras · vos 67 % (9 pj) · le cuesta 80 % (5 pj)» — y **ninguna se muestra sin muestra suficiente** (3 partidas mínimo en cada dimensión). Vive en la tarjeta de *Recomendaciones*, desaparece al arrancar la partida y en custom/unranked no consulta nada en vez de mezclar modos.
- **Balance de equipos** (*Ajustes → Overlay → Balance*): en team games, una línea tenue debajo del título con el **promedio de ELO RM 1v1 de cada equipo** — «⚖ Tu equipo 1412 · Rival 1419 · arrancás 7 abajo». No consulta nada (es el roster que ya está en pantalla); exige dos equipos con 2 ELOs por lado y avisa *parcial* si falta alguien. Se oculta con el panel al tiempo elegido.
- **Arreglado: el panel se cortaba por abajo y la mitad de las tarjetas no se veía.** La ventana tenía un techo fijo de 640 px de alto, herencia de cuando el panel era solo el roster. Con el informe del rival, las recomendaciones y el balance, el contenido legítimo mide más y lo que pasaba del techo se recortaba **e invisible** (no hay scroll: era un bug en pantalla, no solo en capturas). Ahora el alto de la ventana sigue al contenido con un techo **adaptativo al monitor** (área de trabajo menos el margen superior).
- La barrita de análisis suma una etapa honesta: *Buscando enfrentamientos previos…* mientras llega tu historial. La consulta se **comparte** con la civ recomendada y queda en cache **30 minutos** — habilitar las dos opciones no duplica nada.
- En el **Modo ejemplo** («Ver test») "vos" es el perfil del ejemplo (misma regla que `isYou`): las tarjetas de cara a cara y la civ recomendada muestran cómo se vería esa partida real.
- Selftest: sección nueva con 25 chequeos offline del historial propio, el conteo de aliados/rivales y el scoring de la recomendación.

---

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
