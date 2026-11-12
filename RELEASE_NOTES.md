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
