# Auditoría y propuesta de Free, Pro y ProMax

> Auditoría/propuesta de la revisión inicial. El resultado posterior, incluidas las correcciones y la presentación económica S–D, se documenta en [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md); este estudio no sustituye ese estado.
Fecha: 14 de noviembre de 2026. Alcance: inspección del código y pruebas deterministas del repositorio. Este documento propone cambios; no afirma que estén implementados ni requiere construir cobros, cuentas o servicios de pago ahora.

## Decisión de producto

Free debe mostrar únicamente **nombre del rival, ELO actual del rival e historial cara a cara**. Pro y ProMax incluyen esos datos y agregan los análisis que se detallan abajo. El overlay debe funcionar por observación: identifica la partida, carga datos y presenta la información sin pedir al jugador que ingrese edad, ejército observado o decisiones mientras juega.

La configuración previa, la selección de perfil, la posición, el tamaño, la opacidad, las actualizaciones y la posibilidad de ocultar/cerrar el overlay son utilidades de la aplicación, no nuevos análisis Free. No deben venderse como funciones analíticas. El nombre del modo del ELO, la muestra revisada y los estados de carga/error son metadatos necesarios para interpretar los tres datos Free.

## Hallazgos del código actual

| Prioridad | Evidencia | Consecuencia |
| --- | --- | --- |
| Alta | `src/product.js`, `FEATURES`: `rivalCivs`, `rivalFavorites`, `civHelp`, `tgBalance`, `scoutF2` y `postMatch` son Free; `elo` incluye pico y roster. `rivalH2H` es Pro. | El catálogo actual contradice el nuevo límite Free. |
| Alta | `verifyEntitlement()` acepta solamente `payload.plan === 'pro'`; `getProductState()` usa `permitsPro`. | ProMax no existe en el contrato de acceso. No alcanza con añadir una tarjeta al launcher. |
| Alta | `renderer.js`, `renderOngoing()`: imprime todas las filas, escudo de civ, rank y pico sin consultar permisos específicos. `smurfSignal()` deriva otra lectura a partir del pico. | Cambiar solamente el catálogo deja datos pagos visibles o derivables en Free. |
| Alta | `ui/tactical-ui.js`, `renderRival()`: su cabecera muestra la civilización actual incluso cuando la única opción encendida es H2H. Su pie siempre cita replays. | La tarjeta H2H Free filtra civ y comunica una fuente que puede no haberse consultado. |
| Alta | `main.js`, `emit()`, recuperación de error y `overlay:ready`: envían snapshots y payloads cacheados. `sendRival()` agrega H2H pero no recorta por permisos. | Ocultar columnas por CSS no elimina datos pagos del renderer; la recarga o un resultado asíncrono tardío puede republicarlos. |
| Alta | `main.js`, `hasAccessKeyGrant()` y `settings:activate-access-key`: el grant persistido es un hash compartido sin vencimiento. | El acceso que la UI llama temporal dura indefinidamente. El hash es un mecanismo de prueba local, no una licencia protegida. |
| Alta | `settings.html`, página `tactics`, y `settings:tactics-refresh`: edad y ejército se ingresan manualmente; la UI indica abrir el launcher durante la partida. | La experiencia requiere interacción en juego y puede usar valores que el jugador no actualizó. |
| Media | `--beta` da todas las funciones y también puede pasarse al ejecutable empaquetado. | No distingue nivel ni fecha de prueba; debe quedar acotado como mecanismo de desarrollo. |
| Media | `settings:civHelp`, `settings:tgBalance` y `settings:rivalOption` guardan activaciones sin verificar permiso; `viewConfig()` sí las filtra. | El filtrado efectivo ya evita parte del trabajo, pero la respuesta IPC y los controles no mantienen un contrato uniforme. |
| Media | `visiblePostMatchReport()` oculta comparación/replay, pero conserva el informe base. `postmatch:get` y `postmatch:refresh` no niegan el resumen base. `publishPostMatch()` consulta historial propio sin depender de comparación. | Reubicar `postMatch` en Pro necesita negar también el informe base y evitar trabajo innecesario en Free. |
| Media | `settings.js`, `renderProduct()`: dos listas de planes, copy fijo “Disponible con Pro”, `postMatchInput.disabled = false`; civHelp y balance no reciben bloqueo de acceso. | Launcher y mensajes necesitan el tercer nivel y los mismos gates que main. |
| Media | La licencia se recibe junto a una cuenta escrita en un campo; `productSession` vive en memoria. | Existe verificación de firma y coincidencia de claims; no existe una sesión autenticada real ni renovación automática. No presentarlo como servicio comercial desplegado. |

Aspectos que conviene preservar: Ed25519, claves identificadas por `kid`, audiencia y cuenta/perfil comprobados, base64url canónico, IDs desconocidos denegados, preferencias separadas de permisos, caché de verificación por segundo y recorte de métricas de replay antes del IPC. La prueba actual de producto pasa, pero valida la distribución anterior.

## Catálogo concreto recomendado

Identificadores internos: `free`, `pro`, `promax`. Etiquetas: Free, Pro y ProMax. La inclusión es acumulativa; los gates utilizan identificadores, nunca la etiqueta visible.

| Clave | Free | Pro | ProMax | Contenido y límite |
| --- | --- | --- | --- | --- |
| `elo` — existente, redefinida | Sí | Sí | Sí | Nombre y ELO actual de cada rival confirmado; siempre activa. Conserva la procedencia RM 1v1 actual del producto. No incluye pico, rank, civ ni aliados. |
| `rivalH2H` — existente, pasa a Free | Sí | Sí | Sí | V/D, enfrentamientos confirmados y cobertura del historial del mismo modo; estados explícitos si falta muestra. Partidas como aliados no cuentan como enfrentamientos. |
| `rosterDetails` — nueva | No | Sí | Sí | Roster propio y aliados, ELO actual de esos jugadores y agrupación por equipo. Sin esta función se muestran solo rivales confirmados. |
| `playerRank` — nueva | No | Sí | Sí | Puesto en ladder RM 1v1, con ese alcance explícito. |
| `peakElo` — nueva | No | Sí | Sí | Pico RM 1v1 y diferencia con ELO actual. Cualquier señal derivada de esa diferencia usa este mismo gate. No etiquetar una cuenta como smurf solo por esa diferencia. |
| `currentCiv` — nueva | No | Sí | Sí | Nombre/escudo de la civilización actual en filas, cabeceras y tarjetas. Solo cuando la partida la confirmó. |
| `rivalCivs` — existente, pasa a Pro | No | Sí | Sí | Últimas cinco elecciones reales, resultados y mapas del mismo modo. |
| `rivalFavorites` — existente, pasa a Pro | No | Sí | Sí | Frecuencia de civs y resultados del mapa y modo, con muestra declarada. |
| `civHelp` — existente, pasa a Pro | No | Sí | Sí | Guía estática de civilizaciones confirmadas, bonos y limitaciones. |
| `tgBalance` — existente, pasa a Pro | No | Sí | Sí | Mediana/dispersión de ELO por equipo; sin convertir ELO ausente en cero. |
| `postMatch` — existente, pasa a Pro | No | Sí | Sí | Resultado confirmado, ELO ganado/perdido y resumen básico. No abre un informe en Free. |
| `rivalOpenings` — existente, pasa a ProMax | No | No | Sí | Aperturas detectadas en replays del contexto compatible y muestra analizada. |
| `smartTips` — existente, pasa a ProMax | No | No | Sí | Plan contextual con evidencia histórica. No afirmar que predice el ejército o la apertura actual. |
| `civRecommender` — existente, pasa a ProMax | No | No | Sí | Cruce del historial propio con los antecedentes del rival; orientación antes de iniciar. |
| `postMatchComparison` — existente, pasa a ProMax | No | No | Sí | Evolución y referencias del mismo mapa/modo. |
| `postMatchReplay` — existente, pasa a ProMax | No | No | Sí | Apertura inferida, órdenes de avance, APM, etapas y análisis de combate cuando existen métricas válidas. No inventar economía ni bajas ausentes. |
| `scoutF2` — existente, retirar como función del producto | No | No | No | Sustituir resumen/detalle manual durante el juego por composición automática. Conservar temporalmente el valor guardado solo para una migración reversible. |

Para claves nuevas de datos de cabecera (`rosterDetails`, `playerRank`, `peakElo`, `currentCiv`), el permiso existe aunque no haya un checkbox. Si se añaden preferencias, deben seguir separadas del acceso. `elo` conserva su ID para no romper consumidores; su título y descripción dejan de prometer roster/pico.

Variante de implementación aceptada para esta entrega: agrupar rank, pico y civ dentro de un único gate Pro `rosterDetails`. En ese caso no hacen falta las tres claves adicionales; las cuatro filas de la tabla describen los subcampos que ese mismo gate debe proteger en cada ruta. El límite Free es idéntico con cualquiera de las dos variantes.

El historial H2H Free no debe ser una vía lateral a civs/mapas pagos: `computeH2H()` devuelve hoy `recent[].civ`, `slug`, `mapName` y `lastMatch.mapName`. Proyectar esos campos fuera del payload Free. Se pueden mostrar resultados recientes disponibles sin esas columnas. No atribuir fecha a cada `recent` porque la estructura actual no la contiene; `lastMatch.startedAt` sí existe. Las cifras de muestra y resultados desconocidos se mantienen para no presentar un historial parcial como absoluto.

## Gates y fronteras exactas

### Resolución central

1. En `src/product.js` definir un orden explícito `{ free: 0, pro: 1, promax: 2 }`. Cada elemento de `FEATURES` declara el mínimo; acceso por nivel mínimo y grants de compatibilidad explícitos. Un plan o feature desconocido falla cerrado.
2. `effectivePreferences()` sigue derivando la configuración efectiva sin borrar preferencias. `featureState()` construye el mensaje a partir del plan mínimo de la función: “Disponible con Pro” o “Disponible con ProMax”. Una función permitida sin datos sigue en `pending`, `insufficient`, `unavailable` o `error`.
3. `viewConfig()` sigue siendo el punto de entrada para consultas. Los datos que no tienen preferencia necesitan `allowsFeature(product, key)` de forma explícita; no basta con `effectivePreferences()`.
4. El renderer recibe el catálogo y un objeto de acceso serializable resuelto en main. Nunca recibe token, grant secreto ni selectores que modifiquen el nivel efectivo.

### Main y datos publicados

| Superficie | Gate y cambio requerido |
| --- | --- |
| `overlay:state` desde `emit()`, recuperación de errores y reenvío inicial | Aplicar una única proyección por permisos a cada salida. Free recibe IDs técnicos, nombre y rating de rivales confirmados, estados/muestra y metadatos mínimos de interpretación. No recibe `peak`, `rank`, `civ`, su roster propio/aliado ni estadísticas embebidas en `match.players`. No modificar `lastGood`, que main necesita completo. |
| `sendRival()` y `overlay:ready` | Serializar siempre mediante una proyección común, incluso al reenviar caché. Free conserva solo identidad y H2H permitido. Pro permite `history`/`mapStats`; ProMax permite `openings`. Limpiar también campos derivados y marcadores de análisis que no correspondan. |
| `sendScout()` y reenvío de `scoutPayload` | Sin `smartTips` ni `civRecommender`, enviar `null`. Si solo una está efectiva, recortar el otro bloque; compartir una descarga no autoriza publicar ambos resultados. Revalidar al publicar progresos y al completar la promesa. |
| `refreshRivalReports()` | Mantener `needsRivalHistory(view)`; H2H Free usa historial propio y no debe activar historial/replays del rival. `includeOpenings` solo para `rivalOpenings` efectivo. |
| `refreshH2H()` y precarga al entrar en cola | Ejecutar con `rivalH2H` efectivo en los tres planes. Conservar filtro por modo y oposición de equipos. No consultar el historial propio si la preferencia está desactivada. |
| `tacticalPayload()`, `settings:tactics-get`, `settings:tactics-refresh` | Requerir `smartTips` ProMax; eliminar el requisito de introducir edad/ejército durante la partida. Si el endpoint de compatibilidad continúa, no aceptar datos manuales como estado confirmado del juego. |
| `settings:rivalOption`, `settings:civHelp`, `settings:tgBalance`, `settings:postMatchOption` | Una activación sin acceso se rechaza con `requiredPlan` y copy correcto; desactivar siempre se permite. Valores estrictamente booleanos. Una preferencia pagada antigua se conserva durante carga/migración; no se borra al resolver permisos. |
| `postMatchPayload()`, `overlayPostMatchPayload()`, `postmatch:get`, `postmatch:refresh` | Exigir `postMatch` antes de devolver/calcular el informe base. Free recibe `report: null` y acceso bloqueado Pro, no un resumen recortado. La detección del final de partida puede seguir actualizando el historial H2H. |
| `publishPostMatch()` | Descargar replay solo con `postMatchReplay` efectivo; consultar comparación solo con `postMatchComparison` efectivo. Un resultado guardado o caché de replay no elude permisos. Persistir un resultado confirmado no equivale a habilitar su panel. |
| `visiblePostMatchReport()` y `postmatch:import` | Comparación y métricas/combat/etapas/apertura/duración de replay quedan bajo ProMax. Revalidar después de seleccionar/importar un archivo y antes de publicar. Mantener importación, si existe, como herramienta opcional fuera de partida; el flujo normal es automático. |
| Vencimiento, cambio de perfil o sustitución de credencial | Recalcular acceso; reenviar snapshot, rival/scout y postmatch ya recortados; cerrar paneles sin acceso. Los resultados asíncronos en vuelo deben aplicar el estado actual, no el capturado antes de expirar. |
| Demos y modo ejemplo | Preferencias de ejemplo no deben elevar permisos. Para capturas de cada plan usar grants de prueba controlados en main. Las demos no son prueba de una suscripción real. |

La proyección debe usar allowlists de campos por contrato, no borrar solo tres propiedades conocidas. Esto evita exponer una estadística futura dentro de un objeto anidado. Aplicar la misma política en la primera publicación, en caché, en error/stale y en recarga. Un ID interno de partida/perfil no se presenta como una analítica adicional.

En TG, `opponentsOf()` ya espera equipos confirmados y limita el panel a dos rivales para no tapar el juego. Mantener esa decisión de composición y mostrar “esperando rivales” cuando la pertenencia sea desconocida; no llenar Free con aliados. H2H debe corresponder a los rivales que se muestran, sin mezclar su identidad.

### Renderer y launcher

| Archivo / función | Cambio |
| --- | --- |
| `renderer.js`, `renderOngoing()` | Renderizar filas Free solo de rivales; agregar columnas de rank/pico/civ únicamente con sus gates. Retirar el texto del pie que promete pico cuando está bloqueado. Encabezado de mapa y roster extendido pertenecen a Pro; conservar el rótulo de procedencia del ELO. |
| `renderer.js`, `smurfSignal()`, `scoutCard()` y variantes compactas antiguas | No derivar ni mostrar una lectura de pico sin `peakElo`. Revisar tanto la ruta `TacticalUI` como las funciones de fallback, aunque la cabecera principal ya esté filtrada. |
| `ui/tactical-ui.js`, `renderRival()` | Recibir capacidades explícitas para su cabecera; sin `currentCiv`, omitir civ, no mostrar un placeholder de civ. H2H Free no imprime mapa/elecciones ni el pie “Replays: AoE2Insights”. Citar las fuentes efectivamente usadas. |
| `renderer.js`, `onConfig` y `renderPostMatch()` | Guardar un contrato de acceso completo. Re-renderizar el roster al cambiar plan, además de las tarjetas, para que no queden columnas viejas. Inicializar permisos pagos en falso hasta recibir configuración. |
| `settings.js`, `renderProduct()` | Tres listas y tres descripciones. Bloquear por clave también `postMatch`, civHelp y balance. Mostrar el plan mínimo correcto en cada fila y conservar el checkbox guardado aunque el gate lo deshabilite. |
| `settings.html` y `settings.css` | Añadir tarjeta ProMax con comparación clara. Free enumera solo sus tres datos. Reemplazar copy que dice “resultado Free”/“todo Pro”. Layout de tres tarjetas adaptable a ancho reducido. |
| `settings.html`, `settings.js` y `settings-preload.js`, táctica | Reemplazar los selectores de edad/ejército y botón “Recalcular” como pasos de uso por un informe automático con alcance visible. No instruir a abrir Ctrl+Alt+S durante la partida. Retirar la API manual si queda sin consumidor. |
| `main.js`, `syncDetailShortcut()` y la opción `scoutF2` | No registrar F2 como paso para acceder a información. Usar un resumen automático legible y detalle en el launcher fuera de partida. Atajos voluntarios de ocultar/cerrar/configurar pueden permanecer como controles de la aplicación. |

La disponibilidad de datos no se deduce del reloj local. Sin una fuente que confirme edad o ejército actual, presentar comparaciones estáticas por edad o potencial del árbol con ese alcance declarado. No asumir Feudal porque hoy `tacticalInput.age` arranca con ese valor, ni transformar una apertura histórica en observación en vivo. Se puede mantener un plan confirmado al pasar de prepartida a partida, con su carácter histórico visible y límites de ocultado automáticos.

## Credenciales y niveles

El formato compacto y la firma actuales pueden mantenerse. Cambios mínimos de `verifyEntitlement()`:

- Admitir exclusivamente los planes firmados `pro` y `promax`; devolver `payload.plan`, no un literal `pro`.
- Mantener firma Ed25519 de los bytes exactos, audiencia, `kid`, entero de tiempos, expiración estricta, cuenta, perfil opcional y límite de tamaño.
- Un token firmado `pro` no habilita ProMax por una comparación booleana. `plan: 'ProMax'`, `'pro_max'`, un plan desconocido o un campo local `pro: true` no equivalen a `promax`.
- Añadir un `catalogVersion` opcional validado: ausente equivale al catálogo legado 1; `2` identifica el nuevo reparto. Rechazar tipos/valores desconocidos. La firma cubre este campo como el resto del JSON.
- El campo de cuenta actual comprueba que el token coincide con el texto indicado; no prueba que el usuario inició sesión en ese servicio. La UI debe decir “credencial verificada” cuando solo existe esta operación local.

Estado recomendado: `plan` como nivel efectivo, `label`, `accessSource`, `verifiedPlan` nullable, `subscriptionVerified`, `effectiveExpiresAt`, `entitlement` y `featureAccess`. `subscriptionVerified` no debe hacer que un grant temporal ProMax se presente como una suscripción ProMax. Puede existir una credencial Pro válida junto con una prueba ProMax: mostrar cada origen claramente y volver a Pro cuando termine la prueba.

No se necesita implementar un checkout, emitir una credencial comercial ni simular autenticación en esta etapa. Los enlaces de contratación permanecen deshabilitados si no se configuraron; conservar su validación HTTPS y allowlist. Las claves privadas y los datos de pago no pertenecen a la aplicación.

## Acceso temporal y expiración real

Para la entrega actual, la clave compartida puede habilitar **ProMax de prueba**, identificada como acceso de testers y sin afirmar suscripción. La falta de vencimiento automático es un problema conocido de transición, no debe ocultarse con el rótulo “temporal”. Si todavía no se implementa fecha final, el launcher debe decirlo expresamente. No hace falta implementar un backend para esta entrega.

La mejora recomendada para una etapa posterior es fijar nivel y fecha final explícitos como se detalla abajo. Esta mejora no debe retrasar el nuevo reparto ni la experiencia visual automática.

| Caso | Resultado propuesto |
| --- | --- |
| Clave de pruebas aceptada | Grant de main con `plan`, `source: 'access-key'` y `expiresAt` tomado de una fecha de campaña confiable incluida en el build. Mostrar el vencimiento real. Nunca aceptar el nivel ni la fecha desde el renderer. |
| Reinicio, reinstalación o borrado de configuración | La fecha final de campaña no se extiende. No usar “ahora + 30 días” en cada activación o migración. |
| Grant anterior que solo contiene el hash conocido | Migrar una vez a la campaña de compatibilidad con fecha fija; no convertirlo en ProMax perpetuo. Si la campaña terminó, Free o el siguiente grant válido. No publicar el hash ni la clave en documentación/capturas. |
| `--beta` | Mantener acceso completo ProMax, claramente exclusivo de desarrollo, y restringirlo a desarrollo no empaquetado. Si hace falta una distribución de testers empaquetada, usar el grant de pruebas declarado del build. `beta` es origen de acceso, no un cuarto plan pagado. |
| Varios grants válidos | Elegir el nivel mayor permitido, mantener su origen/fecha y recalcular en cada transición temporal. Al vencer ProMax temporal, conservar un Pro firmado todavía válido. |
| Ningún grant vigente | Free, con H2H y ELO disponibles; preferencias pagadas conservadas. |

Cuando se implemente caducidad de campaña, la fecha debe quedar fijada antes de distribuir ese build y no depende de datos de una sala. La comprobación local es suficiente para pruebas; no ofrece revocación online ni resistencia a modificar el ejecutable. No agregar un servicio de pago para resolver esto.

`createProductStateCache()` debe incluir todos los grants y sus fechas en su identidad. El temporizador de main debe programar el **próximo cambio de acceso**, no solo `entitlement.exp`: vencimiento de la prueba, vencimiento de la credencial y activación de `nbf` si se retiene una credencial futura. Mantener el límite de `setTimeout` y la reprogramación. Al regresar de suspensión, resolver con el reloj actual antes de publicar. El vencimiento debe cerrar acceso y limpiar la vista sin reiniciar la app.

## Migración del catálogo anterior

1. Añadir una versión explícita de configuración; la migración actual compara cantidad de propiedades y no detecta cambios de semántica. Hacer la migración idempotente y escribir mediante el mecanismo de persistencia habitual.
2. Conservar todos los booleanos previos (`rivalCivs`, `smartTips`, etc.) y datos guardados. No bajar a `false` lo que quedó bloqueado por el nuevo nivel. Al recuperar acceso, vuelve la selección anterior.
3. Cambiar `rivalH2H` a Free sin exigir reactivación si ya estaba elegido. En instalaciones nuevas puede arrancar activo junto al ELO para que el producto base sea útil; respetar un `false` explícito de una instalación existente.
4. Las claves nuevas de visualización pueden usar el valor por defecto activo donde el plan permita, para conservar la vista anterior de usuarios autorizados. El downgrade oculta columnas; no altera estadísticas ni la selección persistida.
5. Mantener válido hasta su `exp` un token legado firmado `pro` sin `catalogVersion`, agregando una lista cerrada de funciones que ese catálogo ya prometía (`rivalOpenings`, `smartTips`, `civRecommender`, `postMatchComparison`, `postMatchReplay`). Mostrar “Pro · acceso anterior” si hace falta explicarlo. No convertirlo en ProMax ilimitado ni otorgar futuras funciones ProMax. Un token nuevo con `catalogVersion: 2, plan: 'pro'` usa solamente el catálogo Pro nuevo.
6. Si se confirma que nunca se emitieron credenciales comerciales anteriores, se puede omitir la compatibilidad del punto 5 y documentar que el cambio afecta a pruebas. No inventar compradores, renovaciones ni permisos heredados.
7. Migrar el grant compartido y `--beta` según la sección anterior. Su condición de prueba no crea derecho comercial permanente. Eliminar `scoutF2` de la experiencia activa sin perder el valor legado durante la transición; liberar F2.
8. Los caches de datos permanecen en main. Después de migración/downgrade se vuelven a proyectar; tener datos en disco no los vuelve accesibles. No hace falta borrarlos para cumplir el cambio de nivel.

## Verificación que debe acompañar la implementación

Prueba ejecutada para esta auditoría: `node tools/product-test.js` → **OK** con el catálogo actual. Ese resultado no valida el nuevo reparto. La auditoría no consultó partidas, salas, credenciales ni datos externos.

| Área | Casos deterministas necesarios |
| --- | --- |
| Matriz de acceso | Free solo `elo`/`rivalH2H`; Pro agrega exactamente su conjunto; ProMax agrega el suyo; cada ID desconocido denegado. No usar `FEATURES.every(...)` para Pro porque dejaría el tercer nivel sin prueba. |
| Firmas | Token Pro y ProMax válidos; firma ajena/manipulada; nombre de plan inválido; cuenta/perfil/audiencia erróneos; `exp` exacto; `iat`/`nbf`; `catalogVersion` ausente, 2 e inválido. Conservar tests existentes de criptografía y URLs. |
| Compatibilidad | Credencial legacy Pro mantiene solamente su lista histórica hasta `exp`; Pro de catálogo 2 no la hereda; migración repetida no cambia preferencias ni extiende fechas. |
| Temporales | ProMax temporal válido, vencido y con tipos inválidos; fallback Pro; sin grant → Free; beta deshabilitada en empaquetado; fecha de campaña inmutable tras reinicio. |
| Publicación IPC | Fixtures llenas de civ/rank/pico/telemetría y objetos anidados: Free no recibe ninguno por snapshot, H2H, scout, postmatch, stale, recarga ni callback tardío. Pro no recibe aperturas/replay/comparación. ProMax sí cuando la opción está elegida y hay datos. |
| Renderizado | H2H Free no contiene civ, rank, pico, roster aliado, mapa analítico ni fuente de replays. Verificar `TacticalUI` y fallback. Cambio ProMax → Free limpia DOM previo y vuelve a renderizar filas. |
| Red/cómputo | H2H Free solicita historial propio una sola vez; no historial de rival ni replays. Pro simple postmatch no solicita comparación/replay. Una preferencia apagada no realiza su consulta. Compartir historial propio entre H2H y recomendación sigue evitando duplicados. |
| Visual automático | Desde `matched` hasta final de partida, la información permitida se publica sin F2, selectores de edad/ejército ni botón recalcular. Sin estado actual confirmado muestra alcance estático/histórico, no un supuesto en vivo. |
| Datos insuficientes | Permiso válido no convierte muestra vacía, modo incompatible, error de fuente o replay ausente en un informe listo. H2H excluye aliados y equipos desconocidos; no mezcla modos. |

Extender `tools/product-test.js` y las suites existentes de `TacticalUI`/regresión del renderer. Extraer la proyección y transición de acceso a funciones puras si hace falta para probar estos límites sin iniciar Electron ni usar la red. Ejecutar `npm test` al integrar los cambios; el `selftest` de red/Windows queda separado. La QA visual debe cubrir Free, Pro, ProMax, una prueba temporal y un downgrade con datos cacheados en 1v1/TG.

## Orden de implementación recomendado

1. Catálogo de tres niveles, compatibilidad y resolución de grants/fechas.
2. Proyecciones de main y gates de tareas/IPC, incluidos reenvíos y callbacks.
3. Columnas/cabeceras con permiso y launcher de tres planes.
4. Sustitución de interacción táctica/F2 por visualización automática con alcance declarado.
5. Pruebas de matriz, migración, expiración y ausencia de datos pagos en Free; luego QA visual.

No habilitar comercialización como parte de estos pasos. El resultado de esta etapa es un producto local con reparto claro, acceso de prueba honesto y una experiencia que no exige operar el overlay durante el juego.
