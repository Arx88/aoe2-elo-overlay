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
| Resumen con F2 | Resumen y acceso al detalle; registro global opcional | Informar si el atajo no puede registrarse |
| Balance TG | Comparación con ELO RM 1v1 disponible | Indicar jugadores sin ELO y alcance |

El resumen compacto debe seguir comunicando el estado de las opciones elegidas.
El detalle no debe depender exclusivamente de tooltips sobre un overlay que no
recibe el ratón. La prueba final necesita partida real, datos fríos y calientes,
errores, 429 y combinaciones de opciones.

## Free y Pro: preparación

La división de funciones, precios y reglas comerciales aún no está decidida.
Propuesta para investigación: Free con identidad, ELO y lectura básica; Pro
con análisis ampliado, tendencias y comparaciones avanzadas. Ninguna opción
actual debe bloquearse ni anunciarse como parte de un plan hasta que se defina
el catálogo y exista un mecanismo real de cuenta y autorización verificable.
Un toggle local no es una suscripción ni una protección de acceso.

## Medición prioritaria

Medir por partida y fuente el tiempo hasta roster, primer dato útil y señales
seleccionadas; anotar caché, errores, 429, muestra y finalización antes del
inicio. Optimizar solicitudes compartidas y su concurrencia sin prometer tiempos
que dependan de servicios externos. No incluir identificadores personales ni
credenciales en telemetría futura sin diseñar su tratamiento.
