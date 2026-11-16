# Oportunidades contextuales automáticas: modelo v1

Implementación: `src/opportunities.js`. Datos: 56 árboles estándar offline, fijados a `e56728e76b7d08301fba7b18d5f16bc8554c109a` de SiegeEngineers/aoe2techtree. Regeneración: `node tools/build-civ-tech.js [SHA completo]`.

El índice **prioriza rutas potenciales**. No reproduce combates, no está calibrado como probabilidad de victoria y no observa qué unidades produjo el rival.

## Uso y presentación

En ProMax, activar **Recomendaciones inteligentes** en el launcher. El cruce se calcula con el mapa, modo y ambas civilizaciones confirmadas y reutiliza las fuentes/cachés del rival y del historial propio. Se recalcula cuando cambia ese contexto. El overlay muestra automáticamente una ruta principal para cada horizonte: **al llegar a Feudal**, **al llegar a Castillos** y **al llegar a Imperial**. La sección Durante conserva el detalle.

No hay selectores de edad, composición, rival ni botón de recalcular durante el juego. Los tres horizontes son condicionales: no afirman cuál es la edad actual. El tiempo transcurrido desde `startedAt` no demuestra una llegada de edad ni sustituye el reloj simulado con pausas y velocidades.

## Contexto histórico

1. Mismo mapa y modo; sin sustitución silenciosa por otros mapas.
2. Deduplicar por partida y excluir la actual, futuras, sin fecha, sin resultado y anteriores a 180 días.
3. Usar el cruce exacto de ambas civs si hay al menos ocho registros y al menos cinco de la civ actual del rival.
4. Si no alcanza, usar su civ actual con al menos cinco registros; en último término, sus distintas civs en el mismo mapa, con menor especificidad.
5. En TG se reduce el peso de la asociación: el resultado es del equipo, no una atribución individual.

Cada registro pesa `w = 2^(-días / 90)`. Las fracciones observadas que muestra la UI se distinguen de los valores ajustados internos.

## Componentes y significado

| Componente | Cálculo | Alcance |
| --- | --- | --- |
| Cobertura de ruta `q` | `0,45 + 0,30 × cobertura de escalones + 0,25 × cobertura de mejoras` | Disponibilidad potencial por edad; no fuerza efectiva de combate |
| Afinidad `a` | 0/1 según el rol editorial de la civ | Prior pequeño; no simula el valor de sus bonos |
| Acceso temprano `T` | `min(6, 4 × escalones adelantados)` | Consulta edad real del nodo de civ, con excepciones como Armenios/Borgoñones |
| Respuestas rivales `C` | Mayor riesgo de counter × cobertura rival, más diversidad, limitado a 1 | Respuestas que el árbol permite, no ejército visto |
| Asociación histórica `E` | Derrotas ante esa apertura comparadas con la tasa habitual del rival, con reducción por muestra/especificidad/TG | Perder contra todo no se interpreta como debilidad especial a arqueros |
| Respuesta histórica `R` | Afinidad de la ruta contra aperturas previas clasificables | Pista decreciente por edad; no identifica la composición actual |
| Experiencia propia `P` | Resultado con tu civ/mapa frente a tu base personal, ajustado por muestra | Contexto de repertorio; suma lo mismo a las rutas de esa civ y no prueba habilidad con una línea |
| Riesgo observado `O` | Solo con futura telemetría verificada de composición | En el flujo automático actual vale cero |

Las unidades ausentes no se recomiendan. Se respetan las edades reales de nodos y las sustituciones modeladas, como Winged Hussar, Savar, Legionary y Hei Guang. Las mejoras ausentes se conservan como carencias del árbol. Todos estos datos describen potencial, no investigación completada.

Se consideran lanzas, camellos, monjes, guerrilleros, caballería, águilas y asedio según edad. Hay una excepción explícita de Huskarls contra arqueros; no se modelan todavía todas las unidades únicas, bonos, cantidades, terreno o micro.

## Ajuste histórico

Con `L` como peso de derrotas y `W` como peso total del contexto:

```text
b = (L + 2) / (W + 4)
p = (L_ruta + 12 × b) / (W_ruta + 12)
λ = W_ruta / (W_ruta + 12) × especificidad × factor_equipo
E = λ × limitar((p − b) / 0,25, −1, 1)
```

Con menos de tres partidas contra una ruta, `E = 0`. Especificidad: 1 en el cruce de ambas civs, 0,85 en la civ actual y 0,60 en distintas civs del mapa. Factor de equipo: 0,4 en TG y 1 en 1v1. Son pseudoconteos de una política inicial, no un intervalo certificado ni causalidad.

Las frecuencias de amenaza dividen por **todo el peso del contexto**, incluidas FC y aperturas desconocidas. Cinco aperturas de arqueros entre cien registros no se convierten en 100 % arqueros. Se necesita un mínimo de cinco aperturas clasificadas para usar esta señal.

## Índice final

```text
S = redondear(limitar(
  50 + 30(q − 0,65) + 8a + T + 18(0,55 − C)
     + 18E + 10gR + 6P − 17O,
  0, 100
))
```

En el flujo actual `O = 0`; `g` vale 1 en Feudal, 0,5 en Castillos y 0,2 en Imperial. Las rutas se ordenan por `S`; el motor conserva hasta tres candidatas y el overlay prioriza la primera de cada horizonte. Un complemento aparece si alcanza el umbral del modelo frente a la amenaza histórica.

`buildOpportunityPlan()` admite composición solo con `observedArmySource: 'verified-telemetry'`, para una integración futura. `buildAutomaticOpportunityPlans()` borra expresamente esa entrada y calcula los tres horizontes; no existe un productor de composición en vivo conectado ni un formulario manual.

## Límites y pruebas

- No hay ajuste histórico verificado por ELO o parche en las filas disponibles.
- No se observan recursos, mejoras completadas, cantidades, posición, terreno ni habilidad de control.
- Es un modelo terrestre. Mapas de agua reconocidos o historial marcado como agua reciben un estado no disponible; no cubre toda combinación de mapas híbridos.
- La recomendación pide comprobar counters mirando la partida; no exige introducirlos en el helper.
- Los umbrales y pesos necesitan calibración futura separada de los datos usados para diseñarlos.

`node tools/opportunities-test.js` cubre edades reales, sustituciones, líneas ausentes, counters, filtros de contexto/fecha, muestras, recencia, TG, masa de aperturas desconocidas, rechazo de entrada manual y conexión con caché/historial. `npm test` ejecuta el conjunto de suites offline.
