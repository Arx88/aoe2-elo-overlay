# Prematch: dirección de producto

El overlay ayuda a preparar la partida en los segundos disponibles. Cada señal
debe indicar qué describe, su contexto y su muestra; una frecuencia histórica
es una pista, no una probabilidad garantizada de la próxima elección.

## Contexto competitivo

- La utilidad de scouts, arqueros, presión temprana o Fast Castle depende del
  mapa, modo, civilizaciones, economía y lo que se descubre durante la partida.
  Fast Castle es una transición de edad, no una prueba de que alguien boomea.
- Un winrate contra una civ o apertura describe partidas observadas; no demuestra
  causalidad ni garantiza que una respuesta sea ejecutable con la civ elegida.
- Partidas cortas y largas no identifican por sí solas fortalezas de early o
  late game: duración, resultado y fase en la que se obtuvo ventaja son cosas
  diferentes. No presentar correlación como debilidad confirmada.
- En equipos, posición y rival relevante importan; si no se conocen, declararlo.

Referencias iniciales: [guía de build orders de Capoch](https://ageofnotes.com/wp-content/uploads/2017/11/Capochs_Build_Orders_Guide_-_English_-_June_2024.pdf),
[API de AoE II Companion](https://www.aoe2companion.com/more/api). Las
capacidades concretas de cada endpoint y su disponibilidad deben validarse con
respuestas reales antes de prometer funciones nuevas.

## Contrato de cada opción

| Opción actual | Resultado y alcance | Si no se puede calcular |
| --- | --- | --- |
| Últimas 5 civs | Historial público del modo, sin contar la partida actual | Diferenciar error de historial vacío |
| Civ del mapa | Frecuencia dentro del historial leído, con muestra y alcance | Indicar mapa pendiente, muestra insuficiente o error |
| Aperturas | Replays del modo, mapa y civ según la opción actual | Mostrar carga, ausencia, modo incompatible o error |
| Recomendaciones | Observaciones por rival con recorte y muestra | Indicar falta de muestra o error de replays |
| Cara a cara | Enfrentamientos del historial propio del modo, separados de aliados | Diferenciar error de cero enfrentamientos en la muestra |
| Civ recomendada | Cruce de historial propio y observaciones del rival | Explicar falta de muestra o error de cualquiera de las fuentes |
| Oportunidades automáticas | Tres horizontes condicionales entre civs, sin seleccionar edad/ejército | Esperar contexto confirmado y declarar límites del modelo |
| Smart Build Order | Referencia sugerida automáticamente por civ/mapa/modo | Abstenerse en inicios incompatibles; no simular progreso |
| Balance TG | Comparación con ELO RM 1v1 disponible | Indicar jugadores sin ELO y alcance |

El resumen compacto debe seguir comunicando el estado de las opciones elegidas.
El detalle no debe depender exclusivamente de tooltips sobre un overlay que no
recibe el ratón. La prueba final necesita partida real, datos fríos y calientes,
errores, 429 y combinaciones de opciones.

## Free, Pro y ProMax: preparación

El catálogo y los permisos están definidos en `src/product.js` y
[PRODUCT-ACCESS.md](docs/PRODUCT-ACCESS.md). Free muestra estrictamente nombre,
ELO actual del rival e historial entre ambos. Pro añade roster/contexto, civs,
mapa, guía y resultados. ProMax añade aperturas, oportunidades automáticas,
elección de civ, Smart Build Order y análisis/evolución personal con evidencia.

El overlay es visual y deja pasar los clics: no exige selectores, F2, recálculo
ni avance manual de recetas durante la partida. Las oportunidades muestran
horizontes condicionales; la edad actual y los pasos completados no se infieren
del tiempo transcurrido. Las recetas son referencias sugeridas, no una apertura
propia detectada en vivo.

La beta, la clave de prueba ProMax y una credencial firmada conservan estados
distintos. El backend real de cuentas/cobros/renovación sigue pendiente y fue
diferido expresamente en este bloque. Un toggle local no es una suscripción.
Véanse el [estado de implementación](docs/IMPLEMENTATION-STATUS.md), la
[fórmula de oportunidades](docs/OPPORTUNITIES.md) y el
[alcance de Smart Build Order](docs/SMART-BUILD-ORDER.md).

## Medición prioritaria

Medir por partida y fuente el tiempo hasta roster, primer dato útil y señales
seleccionadas; anotar caché, errores, 429, muestra y finalización antes del
inicio. Optimizar solicitudes compartidas y su concurrencia sin prometer tiempos
que dependan de servicios externos. No incluir identificadores personales ni
credenciales en telemetría futura sin diseñar su tratamiento.
