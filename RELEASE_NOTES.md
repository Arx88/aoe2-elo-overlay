## v0.1.12 · Interfaz más limpia

- **Se sacó el pie de la configuración:** ya no muestra la ruta de `config.json` ni el aviso «el panel no se puede clickear / Esc la cierra». **Esc sigue cerrando la ventana.**
- **Updater: un solo botón de búsqueda.** «Buscar actualizaciones» es el único que consulta y sigue disponible aunque ya haya una versión descargada. El botón principal solo descarga (**Descargar**) o instala (**Actualizar ahora**) y queda inactivo cuando no hay nada que hacer.
- Se quitó la frase redundante «El panel no se puede clickear» de la pestaña Skins.
- El crédito **By Acido** queda únicamente en el pie del riel, al lado de la versión. Se sacó de la barra superior, la marca del riel, el título de la ventana, el tooltip de la bandeja y el pie del overlay.

---

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
