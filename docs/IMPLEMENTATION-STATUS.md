# Estado del bloque de mejoras

Base: `5b23a5c` · revisión del 15 de noviembre de 2026. Cambios en una rama local de trabajo. Este documento no afirma publicación, distribución ni instalación en Windows.

La versión **2.2.0** está preparada en `package.json`, lockfile y notas de release. El workflow exige las diez suites offline antes de compilar. La publicación sigue pendiente: el acceso disponible al repositorio es de lectura y no hay una sesión de publicación autenticada. No se generaron ni publicaron instaladores de esta versión.

| Implementado en código | Alcance y límite |
| --- | --- |
| Combate por edad | Agrega eventos **ya medidos**, separa aldeanos/militares eliminados y perdidos, valida atribución, duplicados, cobertura y costes. No extrae estos eventos del replay |
| Informe compartido | Tabla de combate, resúmenes compactos y destacados con evidencia; launcher y overlay usan el mismo renderizador |
| Progreso con datos actuales | Resultados confirmados del mismo mapa/modo, mejora del registro y buen momento reciente; errores y muestra parcial no se convierten en cero |
| Tiempos del replay | Primera orden de avance separada de llegada confirmada; migración al leer registros del adaptador anterior |
| Ejecución económica S–D | Presentación personal validada sobre las etapas económicas existentes: al menos dos indicadores medidos y cinco referencias compatibles por etapa. Micro y decisiones quedan sin nota; el adaptador automático aún no produce economía |
| Free / Pro / ProMax | Free recibe solo nombre del rival, ELO actual y cara a cara. Pro añade contexto y resultados. ProMax añade análisis, recomendaciones y evolución; recorte de datos antes del IPC |
| Acceso durante la sesión | Caché por segundo, temporizador de vencimiento y actualización de pantallas conservando las preferencias |
| Oportunidades automáticas | 56 árboles, cobertura tecnológica por edad, respuestas posibles, historial ajustado por muestra/recencia/contexto y experiencia propia. Tres horizontes condicionales que permanecen visibles aunque se oculte el ELO; sin entrada manual |
| Smart Build Order | Cinco referencias resumidas: Scouts, M@A → Arqueros, Arqueros, FC y FI. Selección por contexto confirmado; sin reconocer pasos completados ni usar el reloj como progreso. Véase [alcance específico](SMART-BUILD-ORDER.md) |
| Iconografía | SVG funcionales y emblemas del producto para civs, recursos, combate, etapas y evolución |
| Interacción | Overlay visual que deja pasar los clics; sin selectores de edad/ejército ni avance manual de receta durante el juego |

## Verificación

`npm test` reúne diez suites offline: producto, postmatch, combate, ejecución económica, métricas del replay, recomendaciones contextuales, regresión de prematch, oportunidades, presentación y Smart Build Order. Las diez suites pasan en el entorno de trabajo. Esto verifica la lógica y la integración cubierta, no una partida real ni el renderizado de Electron.

No se realizó validación visual de Electron ni ejecución de partidas en Windows. La apertura automatizada de la vista de desarrollo quedó bloqueada por el entorno. El dueño del proyecto difirió la revisión visual/Windows para este bloque.

## Trabajo que sigue pendiente

1. **Extractor automático de estado:** el `.aoe2record` actual aporta órdenes y metadatos. Falta el lector propio durante reproducción compatible en Windows, con una partida conocida que permita reconciliar entidades, edades, muertes y cobertura.
2. **Economía y habilidades profundas:** aldeanos completados/vivos, TC realmente inactivo, recursos recolectados, mejoras completadas y curvas. Boom Master, micro y decisiones no se habilitan con APM o resultados como sustitutos.
3. **Comparación poblacional:** no existe dataset compatible de otros usuarios. Las notas y frases actuales describen el historial personal; nunca «mejor que X % de usuarios».
4. **Calibración de oportunidades y recetas:** ampliar unidades únicas/armadas/excepciones, validar los pesos fuera de muestra y desarrollar referencias para inicios especiales. El índice es prioridad experimental, no probabilidad de victoria.
5. **Comercialización:** backend de cuentas, cobros y renovación diferido expresamente. El acceso de prueba por clave y la verificación local de credenciales no constituyen ese servicio.
6. **Publicación:** rama/PR y distribución pendientes. No crear tag o release como parte de una revisión de código.

[Plan de evolución](PRODUCT-ROADMAP.md) · [Investigación y fuentes](RESEARCH-INDEX.md). El motor y los contratos son una base funcional; el análisis profundo automático completo sigue pendiente.
