# AoE2 Helper: plan de producto e implementación

Revisión: 15 de noviembre de 2026. Base revisada: `5b23a5c` · versión `2.1.1`.

Estado: **plan de evolución con un primer bloque implementado**. El detalle de lo que funciona y sus límites está en [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md). La extracción automática de estado y el servicio comercial siguen pendientes.

Actualización de alcance: el dueño del proyecto difirió comercialización y validación visual para priorizar la asistencia entre civs. El modelo contextual automático v1, la sección Durante, el catálogo de tres planes y la presentación económica personal S–D están implementados; Smart Build Order se integra como referencia visual, sin seguimiento de pasos; [fórmula y límites](OPPORTUNITIES.md). Los apartados comerciales siguientes quedan como planificación futura.

## 1. La experiencia que queremos construir

El helper debe ayudar a elegir un plan antes de jugar, recordar lo relevante durante la partida y terminar con una lectura que dé ganas de volver a mejorar. El postmatch abre con **algo que el jugador hizo bien**, lo explica con números comprobables y propone una mejora concreta para la siguiente partida. Esa felicitación también puede existir en una derrota.

Tres niveles de lectura:

1. **En cinco segundos:** resultado, momento destacado y hasta tres medallas ganadas.
2. **En treinta segundos:** economía y combate por edad, comparación con el rival y una acción para practicar.
3. **Para profundizar:** curvas, eventos, definiciones y comparación con el historial personal.

Ejemplo de redacción cuando exista la métrica: «Recolectaste un 30 % más de recursos que tu rival durante los primeros 20 minutos». Debajo: `13.000 vs. 10.000 · mismo intervalo · recursos recolectados`. Esa afirmación tiene un significado verificable; «tu economía fue 30 % mejor» no define qué se está midiendo.

## 2. Qué existe realmente

| Parte | Implementación actual | Próxima necesidad |
| --- | --- | --- |
| Detección y prematch | WebSocket/REST, roster, ELO RM 1v1, historial, aperturas y recomendaciones | Priorizar una lectura breve y mejorar el cruce entre ambas civs |
| Durante la partida | Guía de civ y oportunidades automáticas en tres horizontes condicionales | Telemetría permitida del estado real y mejores modelos; sin entradas manuales |
| Postmatch | Resultado confirmado, replay automático, APM, apertura inferida y órdenes de avance; combate opcional desde eventos medidos | Extraer estado del juego y ampliar la telemetría |
| Notas | Presentación económica personal S–D con al menos cinco referencias compatibles por etapa y dos indicadores | Proveer economía medida; micro y decisiones siguen sin nota |
| Historial | Almacén local por perfil/partida, persistencia y referencias por mapa/modo | Navegación del historial y progresión de objetivos |
| Free/Pro/ProMax | Catálogo de tres niveles y proyección de datos antes del IPC | Cuenta/cobro/renovación reales, diferidos para este bloque |
| Launcher | Perfil AoE, antes/durante/después, planes, apariencia y updater | Historial navegable y futuros objetivos medidos |
| Smart Build Order | Referencias Scouts, M@A, Arqueros, FC y FI; sugerencia automática por contexto | Reconocer pasos reales necesita acciones/estado en vivo; no está conectado |
| Identidad | Torre, emblemas de apertura/Feudal/Castillos, marca HH y escudos de civs | Extender la misma familia visual a economía, combate y logros |

Código principal: `src/replay-analysis.js`, `src/postmatch.js`, `src/product.js`, `src/live.js`, `src/scout.js`, `src/civ-guide.js`, `main.js`, `ui/tactical-ui.js` y `settings.*`.

### Dos hallazgos para resolver primero

- **Edades, corregido:** el adaptador anterior publicaba el timestamp de `Research` como llegada de edad. Ahora publica `feudalClickSeconds`/`castleClickSeconds`, con definición de primera orden de avance. Las marcas antiguas del adaptador conocido se reinterpretan al leer el historial. Las llegadas reales siguen requiriendo una fuente que confirme finalización. La clasificación de apertura continúa siendo una inferencia de órdenes; no simula el juego.
- **Caducidad Pro, corregido en código:** el resolvedor cachea dentro del mismo segundo de verificación y main programa una actualización al vencer. Los permisos se recalculan sin cambiar la credencial y se notifica a launcher/overlay. La caché tiene pruebas con reloj controlado; la notificación de ventanas requiere la prueba de Electron/Windows pendiente.

Las suites actuales de producto, postmatch, recomendaciones contextuales y regresión de prematch pasaron en la base revisada. No cubren por sí solas esas dos integraciones.

## 3. Datos profundos: la dependencia principal

El adaptador automático actual devuelve apertura inferida, comandos por minuto y marcas de investigación. No extrae aldeanos entrenados confirmados, bajas, recursos recolectados ni estado económico por segundo. El nuevo motor puede agregar eventos medidos y el informe puede presentar su resumen; obtener esos eventos automáticamente sigue pendiente. La existencia de un `.aoe2record` no convierte sus órdenes en eventos de simulación.

Se revisó el código fuente de `aoe2rec`: `Research` y `DeQueue` son acciones; `Achievements` queda como bytes y los bloques `PostGame` decodificados contienen tiempo y rankings. Decodificar más agregados finales puede ayudar a un resumen, pero un total final sin timestamps no permite reconstruir bajas por edad.

| Vía | Qué permite | Condición antes de adoptarla |
| --- | --- | --- |
| Ampliar parser y bloques finales | Más metadatos o agregados si el archivo los contiene | Fixture real, significado de cada campo y compatibilidad de versiones |
| Integración con un proveedor que reproduzca la partida | Eventos/series temporales de economía y combate | Acceso programático confirmado, cobertura, coste y condiciones de uso |
| Analizador propio basado en reproducción del estado | Control sobre el detalle y el formato | Prueba Windows, versiones del juego, aislamiento de trabajos y coste medido |

CaptureAge documenta estadísticas de combate, economía y evolución temporal. Eso demuestra la disponibilidad de ese tipo de datos durante la reproducción, pero no establece una API pública utilizable por el helper. AoE2Insights también documenta análisis profundo por partida; su página comercial no es un contrato de API. No se presupone una integración con ninguno.

**Prueba de concepto obligatoria:** una partida RM 1v1 actual, con edades verificadas y bajas económicas/militares conocidas, procesada de principio a fin. Entregar eventos o series, resultados reconciliados con la reproducción, tiempo de análisis y consumo de recursos. Después ampliar a 2v2, civs especiales, cancelaciones, conversiones y partidas cortas. Hasta superar esa prueba, las funciones dependientes siguen como planificadas.

## 4. Bajas por edad: el desglose solicitado

La tabla del jugador será:

| Durante tu… | Aldeanos eliminados | Aldeanos perdidos | Militares eliminados | Militares perdidos | Valor destruido/perdido |
| --- | --- | --- | --- | --- | --- |
| Edad Oscura | Medido | Medido | Medido | Medido | Recursos |
| Feudal | Medido | Medido | Medido | Medido | Recursos |
| Castillos | Medido | Medido | Medido | Medido | Recursos |
| Imperial | Medido | Medido | Medido | Medido | Recursos |

Por defecto se usa **la edad del jugador que está leyendo su informe**. Una baja a los 19:40 puede pertenecer a tus Castillos y al Feudal del rival. Cambiar de perspectiva cambia los intervalos, por lo que dos filas de edad no tienen por qué ser simétricas entre jugadores.

Para comparaciones directas se ofrece «mismo intervalo de partida»: ambos jugadores entre las mismas marcas de reloj. Cada intervalo es `[inicio, fin)`: un evento exactamente en la llegada a Castillos pertenece a Castillos. La etapa final puede quedar truncada por el fin de partida y debe mostrar su duración.

Reglas del motor:

- Cada evento tiene ID único, reloj de juego, unidad, categoría, dueño al morir y autor de la baja cuando se conoce.
- Bajas propias por borrado, animales, Gaia y friendly fire se distinguen de bajas atribuidas al enemigo.
- Conversiones cambian el dueño; no son muertes. El crédito posterior usa el dueño correcto en ese momento.
- Pesqueros, comercio, edificios y otras unidades económicas tienen categorías propias. No se mezclan silenciosamente con aldeanos ni militares.
- Sin autor confirmado se puede contar la pérdida del dueño, pero no otorgar una eliminación al rival.
- Cero significa «intervalo completo medido con cero eventos». Un intervalo sin cobertura muestra «sin dato».
- En TG, mostrar bajas propias, autor individual y total de equipo por separado. Una unidad no puede contar dos veces como eliminación de equipo.
- Si hay conteos acumulados fiables por categoría, el desglose puede calcularse por diferencias en los límites de edad. Eso no permite atribuir autores si la fuente no los informa.

El contrato propuesto se detalla en [TELEMETRY-V2-PROPOSAL.md](TELEMETRY-V2-PROPOSAL.md).

## 5. Notas que expliquen cómo se jugó

La nota económica actual seguirá llamándose **Ejecución económica personal**. No se convertirá en una nota estratégica a partir de matar más o subir antes.

| Dimensión propuesta | Indicadores medidos | Lectura para el jugador |
| --- | --- | --- |
| Economía | Producción efectiva de aldeanos, tiempo productivo de TC perdido, población bloqueada, trabajo ocioso | «Mantuviste la producción mientras atacabas» |
| Presión | Bajas económicas infligidas, daño a la producción y ventanas de ventaja comprobables | «El raid de Feudal frenó su crecimiento» si la serie lo demuestra |
| Intercambio militar | Recursos destruidos y perdidos, composición y conversiones | «Tus intercambios dejaron +650 recursos de saldo» |
| Desarrollo | Mejoras completadas relevantes para el ejército utilizado | «La armadura acompañó a tu transición» cuando las unidades y mejoras están medidas |

La presentación actual usa S–D para ejecución económica personal y conserva el cálculo A–E anterior en el contrato por compatibilidad. Micro y decisiones aparecen sin evaluación cuando falta evidencia. Véase [método y umbrales](POSTMATCH-DATA.md). La nota global compuesta llegará después de calibrar pesos con partidas revisadas; matar unidades baratas no debe ocultar la pérdida de un ejército caro.

Las referencias personales usan solo partidas anteriores y definiciones compatibles. Con menos de cinco referencias válidas se muestran datos y avance de muestra, sin inventar percentiles. No mezclar parches, mapas, modos o aperturas para completar la muestra sin cambiar explícitamente el método y la etiqueta.

El launcher debe ofrecer el detalle «Por qué»: indicadores, comparación, tamaño de muestra y una acción. El overlay conserva la lectura visual sin controles. APM se conserva como actividad registrada y no suma puntos por sí solo.

## 6. Logros que dé gusto ver

Máximo tres destacados por partida, elegidos por relevancia y diversidad. Cada medalla incluye el número que la ganó. Las reglas siguientes son **hipótesis iniciales para calibrar**, no umbrales competitivos ya validados.

| Logro | Regla inicial propuesta | Evidencia necesaria |
| --- | --- | --- |
| Boom Master | +30 aldeanos netos en una ventana de 10 minutos de Castillos | Entrenamientos completados, pérdidas y población viva |
| Depredador Feudal | 5 aldeanos enemigos eliminados durante tu Feudal | Muertes atribuidas y límites de edad |
| Serial Killer | Al menos 25 militares eliminados y eliminaciones ≥ 2 × pérdidas militares | Muertes por categoría y cobertura completa |
| Buen negocio | Destruir al menos 1,5 veces el valor perdido, con volumen mínimo de combate | Valor destruido/perdido y cobertura completa |
| Economía de acero | Menor bloqueo ocioso que la mediana personal por un margen relevante | Referencia compatible e indicadores económicos |
| Protector de aldeanos | Cero aldeanos perdidos en una ventana con presión enemiga verificada | Pérdidas y evidencia de presión; ausencia de muertes sola no basta |
| Reconstrucción | Recuperar la población económica previa tras un raid, dentro de una ventana calibrada | Curva de población y muertes del raid |
| Mejor versión | Superar una marca personal compatible con al menos cinco referencias | Historial anterior y definición estable |

El motor actual fija 1.000 recursos de volumen conjunto para «Buen negocio». Las ventanas de «Reconstrucción» y Boom Master siguen como propuestas para calibrar. Esas medallas no se habilitan con reglas incompletas. La calibración futura debe separar RM 1v1 estándar, TG y otros inicios o límites de población. El ledger actual no aporta población ni un benchmark por modo: los destacados actuales describen sus conteos observados, sin afirmar dificultad competitiva equivalente entre contextos. Un límite de población 100 o un inicio en Imperial cambia el significado de esos números.

Reglas de presentación: una derrota puede celebrar una buena ejecución, sin ocultar el resultado; nunca garantizar una victoria futura. Una medalla ya ganada conserva versión de regla y evidencia. Reanalizar la partida actualiza el logro en lugar de duplicarlo. Con cero pérdidas, usar «sin bajas» y el valor destruido, sin un cociente infinito.

## 7. Diseño del postmatch

**Cabecera:** resultado, civs con escudos, mapa, modo, duración y variación de rating del modo claramente diferenciada del ELO RM 1v1 del roster.

**Momento destacado:** una frase grande y concreta, con dos cifras comparables. Por ejemplo: «Tu presión de Feudal dejó 5 aldeanos menos al rival». Usarla solo si las muertes están atribuidas; no implica que esa presión haya decidido la partida.

**Medallas:** hasta tres, con icono propio, nombre y dato. Sin carruseles automáticos ni lluvia de insignias.

**Edades:** Apertura, Feudal, Castillos e Imperial. Cada etapa muestra duración, disponibilidad, ejecución económica y dos datos de impacto. La vista ampliada abre la tabla de bajas y las curvas. Los datos de llegada no se repiten como si fueran una segunda calificación.

**Tu próxima mejora:** una acción con evidencia, como «En la próxima apertura intentá mantener la cola de aldeanos durante tu primer ataque». El consejo debe surgir de una pausa productiva real y excluir la investigación legítima del TC.

Estados diseñados: resultado pendiente; descargando; analizando; resumen listo con análisis pendiente; replay todavía no publicado; error con reintento; etapa no alcanzada; cobertura parcial; sin muestra; opción apagada; función de Pro/ProMax bloqueada. Durante un fallo se conserva el resultado confirmado. Un error de historial no se convierte en «cero partidas».

### Iconografía

Reutilizar `assets/brand/*` para edades y marca, y `assets/civs/*` para identidades. Ampliar la familia con aldeano, recursos, espadas, escudo, reloj y medalla; primero SVG propios para los símbolos funcionales. Compartir componentes entre overlay y launcher mediante `ui/tactical-ui.js`.

Mantener fondo oscuro, latón/dorado, verde para mejora y terracota para pérdida. El color lleva una etiqueta y una cifra; nunca es la única explicación. Iconos legibles a 16/24 px, emblemas a 40/64 px. Respetar movimiento reducido, foco visible y escalado Windows 100/125/150/175 %. El overlay muestra la lectura breve; el launcher conserva el detalle.

## 8. Prematch: una lectura que llegue a tiempo

1. **Quién y dónde:** rival, mapa, modo, equipos y civ confirmada.
2. **Qué suele hacer:** apertura más repetida, alcance y fracción de partidas observadas.
3. **Qué podés hacer vos:** una respuesta realizable con tu civ y una alternativa si el scouting contradice la hipótesis.

Mejoras concretas:

- Recomendación cruzada: tus líneas disponibles frente a las respuestas que le faltan al otro, con edad y mejora necesarias.
- Plan por mapa y posición; en TG no asumir flank/pocket si no está confirmado.
- Diferenciar «elegir civ» de «jugar con la civ asignada». Una recomendación de civ deja de ser útil cuando la selección está cerrada.
- Priorizar roster y primera señal útil; cargar el detalle después. Reutilizar peticiones, caché y límites existentes ante 429.
- Guardar un objetivo para esa partida, por ejemplo practicar producción continua. El postmatch vuelve sobre ese objetivo si tiene datos.

Una frecuencia histórica orienta; no prueba la estrategia de la próxima partida. Con datos insuficientes se conserva la comparación de civs basada en el árbol tecnológico.

## 9. Durante la partida: asistencia automática

El modelo v1 usa un dataset estructurado fijado de 56 árboles; consulta edades reales de nodos, cobertura de mejoras, posibles counters, historial contextual y experiencia propia. El resultado es un índice experimental de prioridad, no una probabilidad de ganar. La [fórmula y sus límites](OPPORTUNITIES.md) describen los ajustes de muestra, recencia y especificidad.

El overlay muestra rutas condicionales para Feudal, Castillos e Imperial sin selectores ni recálculo manual. El árbol dice qué puede producir una civ; no dice qué investigó o qué tiene el rival en esta partida. La edad actual tampoco se deduce del reloj real. Las condiciones invitan a mirar el juego, no a introducir datos en el helper.

Smart Build Order es un toggle de ProMax configurado en el launcher. Reconoce civ/mapa/modo confirmados para sugerir una referencia: Scouts, M@A → Arqueros, Arqueros, FC o una FI especializada revisada. Usa iconos y pocos hitos visibles. No detecta la apertura propia en vivo, no señala un paso completado, no tiene botón «siguiente» ni avanza por tiempo transcurrido. Se abstiene en contextos incompatibles. [Alcance y excepciones](SMART-BUILD-ORDER.md).

## 10. Launcher y tres planes

El launcher reúne perfil de AoE, antes/durante/después, apariencia, planes y updater. Separa opciones apagadas, acceso bloqueado, consulta pendiente, error y falta de muestra. Los detalles y la configuración se consultan fuera del juego; el overlay deja pasar los clics y no requiere actividad del usuario.

El catálogo vigente está implementado en `src/product.js` y detallado en [PRODUCT-ACCESS.md](PRODUCT-ACCESS.md):

| Free | Pro | ProMax |
| --- | --- | --- |
| Nombre del rival, ELO actual y cara a cara, exclusivamente | Roster ampliado, civs, perfil del mapa, guía de civ, balance TG y resumen de resultados | Aperturas, oportunidades automáticas, elección de civ, Smart Build Order, replay y evolución personal con evidencia |

Los niveles superiores incluyen los anteriores. No se amplía Free con postmatch ni contexto adicional. El acceso no sustituye los datos necesarios: comprar un plan no crea telemetría, muestra ni una cohorte poblacional.

### Recorrido comercial necesario

Cuenta de producto → sesión autenticada → checkout configurado → confirmación de pago por backend → credencial firmada → renovación y gestión. El perfil público de AoE identifica al jugador; no autentica una cuenta de suscripción.

Implementación requerida:

1. Backend de cuentas y relación explícita con el perfil AoE. Login mediante el navegador y retorno validado; las claves privadas de firma permanecen en servidor.
2. Sesión renovable con almacenamiento apropiado del sistema; el pegado manual de token se reserva a soporte/desarrollo.
3. Checkout y portal reales con proveedor, moneda, precio y políticas definidos por el dueño del producto.
4. Webhooks verificados e idempotentes. Abrir checkout o volver a la app no activa Pro por sí solo.
5. Emisión/renovación de credenciales acotadas, validación de acceso en el backend de análisis y control de cuotas.
6. Estados de pago pendiente, activo, cancelado al fin del período, vencido y error de renovación. Desconexión/offline con política explícita y vencimiento respetado.
7. Invalidación temporal de caché y actualización de gates/UI al vencer. Mantener las preferencias para una futura reactivación.
8. Retiro del acceso compartido temporal al habilitar venta real. Beta, acceso temporal y suscripción conservan etiquetas distintas.

No se habilitan cobros ni se contrata infraestructura como consecuencia de este plan.

## 11. Orden de ejecución y entregables

| Prioridad | Trabajo | Entrega verificable | Dependencia |
| --- | --- | --- | --- |
| P0 · integridad | Validar edades y reloj; corregir caché de acceso; revisar importación y gates IPC | Fixtures de clic/cancelación/llegada y prueba de vencimiento sin reinicio | Código actual |
| P1 · valor inmediato | Rediseño postmatch, estados claros, iconos y launcher de tres etapas | Pantallas con datos actuales, estados Free/Pro/ProMax y errores; sin métricas inventadas | P0 |
| P2 · prueba de datos | Seleccionar y probar fuente profunda; contrato v2 | Replay real con conteos/edades reconciliados y coste de procesamiento medido | Acceso a fuente o reproducción Windows |
| P3 · entrenador | Bajas por edad, economía comparada, logros y objetivos | Motor determinista, evidencia por tarjeta y calibración con revisión manual | P2 |
| P4 · comercial | Cuenta, backend, cobro, renovación y cuotas | Flujo de prueba completo pago → acceso → vencimiento/cancelación | Decisiones comerciales y servicio real |
| P5 · asistencia contextual | Dataset estructurado, cruce de civs, lectura por etapa | Rutas viables por edad/civ y referencias automáticas, sin interacción durante la partida | Dataset validado |

P4 está diferido por decisión del dueño del proyecto. En una fase futura puede avanzar independientemente de P2, pero la venta del análisis profundo depende de una fuente comprobada. Las estimaciones de esfuerzo llegan después de la prueba de datos; hoy no hay base para prometer fechas de esa integración.

### Criterios de salida

- Sin replay: resultado utilizable, reintento y ninguna medalla/nota fabricada.
- Un evento de muerte cuenta una vez y cae en la edad correcta, también en un límite exacto.
- Los datos de ambos jugadores comparten intervalo, reloj, fuente y definición antes de calcular porcentajes.
- Los totales por edad reconcilian con los totales del mismo alcance. Conversiones y muertes sin autor siguen siendo distinguibles.
- Vencer Pro vuelve a aplicar permisos durante la sesión, preserva preferencias y no expone datos Pro por IPC.
- Pago pendiente no activa acceso; reintentar un webhook no duplica una suscripción ni créditos.
- La verificación visual con nombres largos y escalado Windows sigue pendiente y fue diferida para este bloque. La implementación mantiene click-through y no exige cierre interactivo durante el juego.
- Medir tiempo hasta primer dato útil y análisis listo, errores por fuente, reintentos y uso del detalle. Cualquier medición enviada fuera del equipo necesita un diseño explícito de datos y consentimiento.

## 12. Referencias de la revisión

Los estudios específicos, sus hallazgos iniciales y límites están reunidos en [RESEARCH-INDEX.md](RESEARCH-INDEX.md). No todas las propuestas de investigación están implementadas.

- [Contrato actual postmatch](POSTMATCH-DATA.md) y [acceso actual](PRODUCT-ACCESS.md).
- [Acciones del parser aoe2rec](https://github.com/aoe2ct/aoe2rec/blob/main/crates/aoe2rec/src/actions.rs) y [operaciones/bloques PostGame](https://github.com/aoe2ct/aoe2rec/blob/main/crates/aoe2rec/src/lib.rs).
- [CaptureAge: estadísticas de partida](https://captureage.com/cade/docs/cade-latest/match-statistics) y [dashboard](https://captureage.com/cade/docs/cade-latest/dashboard). No implican disponibilidad de exportación/API.
- [AoE2Insights: alcance de Pro](https://www.aoe2insights.com/pro/). Referencia de producto, no dependencia de API confirmada.
- [Guía oficial: recursos y control](https://www.ageofempires.com/learn-to-play/control-resources-aoe2/), [economía y ejército](https://www.ageofempires.com/learn-to-play/military-and-economy-aoe2/) y [avance de edades](https://www.ageofempires.com/learn-to-play/advancing-aoe2/).
- [Fuente del árbol usado por el generador existente](https://github.com/SiegeEngineers/aoe2techtree). Fijar una revisión compatible con el parche al generar datos nuevos.
