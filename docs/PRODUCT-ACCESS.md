# Free, Pro, ProMax y accesos de prueba

`src/product.js` define el catálogo y resuelve permisos en el proceso principal de Electron. Preferencia guardada, permiso y disponibilidad de datos son ejes independientes. Los planes son acumulativos.

| Función | Free | Pro | ProMax |
| --- | --- | --- | --- |
| Nombre y ELO actual RM 1v1 del rival | Incluida | Incluida | Incluida |
| Historial entre ambos del mismo modo | Incluida | Incluida | Incluida |
| Roster ampliado, civs, rango y pico de ELO | — | Incluida | Incluida |
| Últimas civs y perfil del mapa del rival | — | Incluida | Incluida |
| Guía de civ y balance de equipos | — | Incluida | Incluida |
| Resumen postmatch de resultados | — | Incluida | Incluida |
| Aperturas de replays y elección de civ | — | — | Incluida |
| Oportunidades automáticas entre civs | — | — | Incluida |
| Evolución personal, replay y notas con evidencia | — | — | Incluida |
| Smart Build Order de referencia | — | — | Incluida |

**Free solo recibe nombre del rival, ELO actual e historial entre ambos.** No recibe aliados/roster propio, civs, pico, rango, mapas históricos, aperturas o postmatch. `src/presentation.js` proyecta el estado y los payloads antes del IPC, además de los gates del renderizador. Al cambiar o vencer el acceso, main vuelve a enviar la proyección correspondiente para retirar también datos previamente cacheados en pantalla.

Un plan no garantiza una métrica. Carga, error, muestra insuficiente, fuente incompatible y espera de replay conservan su estado. El replay automático actual aporta órdenes, no economía ni bajas medidas. Las notas S–D son personales y requieren indicadores compatibles; no son un percentil de usuarios. El overlay permanece visual: sin entradas manuales durante la partida, y `scoutF2` queda desactivado en preferencias efectivas.

## Integración en Electron

```js
const { getProductState, effectivePreferences, featureState } = require('./src/product');
const product = getProductState({
  betaAccess: trustedBetaFlag === true,
  entitlementToken: accountSession.entitlementToken,
  accountId: accountSession.accountId,
  profileId: selectedAoeProfileId,
  publicKeys: releasePublicKeys,
  billing: releaseBillingConfig,
});
const effective = effectivePreferences(savedPreferences, product);
```

`betaAccess` debe venir de una decisión explícita de la aplicación principal, el argumento de desarrollo `--beta` en una app no empaquetada, y nunca del renderer ni de un selector de plan de la interfaz. La UI muestra **Acceso beta** y `subscriptionVerified: false`. Una beta con todas las funciones no es una suscripción activa.

En producción, sin credencial verificada ni clave de prueba válida, el plan es Free. `effectivePreferences` conserva las preferencias originales y devuelve las opciones sin permiso desactivadas para el flujo de consultas. Si caduca la licencia, la aplicación no borra qué opciones había elegido el jugador. Renovar restaura esas preferencias. Las preferencias de presentación y otras propiedades de configuración se conservan.

`featureState(key, {preferences, product, availability})` devuelve los ejes `allowed`, `selected`, `enabled` y `status`. Estados de UI: `locked`, `disabled`, `pending`, `loading`, `ready`, `insufficient`, `unavailable`, `error`. Un ID de función desconocido falla cerrado. El renderer recibe `getProductState()` serializado; no recibe el token ni las claves privadas y no puede establecer sus permisos.

Los gates de `viewConfig()` y de los handlers IPC deben usar el mismo estado resuelto por main. Ocultar un control por CSS no constituye control de acceso. La validación del servidor sigue siendo obligatoria para cualquier servicio de pago; un cliente de escritorio modificable no puede proteger por sí solo una API comercial.

## Credencial firmada

Formato compacto: `v1.<JSON en base64url>.<firma Ed25519 en base64url>`.

Contenido firmado: `aoe2-helper.entitlement.v1.` seguido del JSON **ya codificado** en base64url. La clave privada vive exclusivamente en el servicio de cuentas. El cliente incluye las claves públicas de confianza, identificadas por `kid`, y acepta solamente Ed25519.

Claims obligatorios:

```json
{
  "schema": 1,
  "kid": "production-2026-01",
  "sub": "authenticated-account-id",
  "aud": "aoe2-helper",
  "plan": "pro",
  "iat": 1794657600,
  "exp": 1794744000
}
```

`plan` admite `pro` y `promax`; cualquier otro plan se rechaza. `iat`, `exp` y el opcional `nbf` usan segundos Unix enteros. `sub` debe coincidir con la cuenta autenticada. El opcional `profileId`, entero positivo, vincula el acceso también al perfil AoE2 seleccionado. La expiración no tiene prórroga; solo la emisión y `nbf` toleran 60 segundos de desfase futuro. Rotar claves mediante `kid` permite revocar una clave pública en una nueva distribución. El producto no mantiene un flag persistente `isPro`.

El backend debe emitir credenciales de duración acotada después de validar la cuenta y la suscripción con su proveedor de cobro. Cancelaciones y reembolsos deben reflejarse en la siguiente renovación; para revocación inmediata de una credencial todavía vigente hace falta consulta online al backend. Este módulo no implementa un proveedor de pagos, autenticación o webhooks ni afirma que esos servicios estén desplegados.

## Clave de acceso temporal

`createProductStateCache()` conserva una resolución dentro del mismo segundo de verificación. El paso del tiempo invalida la caché aunque la credencial no cambie; main programa una notificación de vencimiento para volver a aplicar el acceso en el launcher y el overlay. Se conservan las preferencias de las opciones bloqueadas. El acceso a importación y el recorte de informes vuelven a comprobar el permiso en el proceso principal.

Mientras no exista el servicio de suscripciones, la sección **Plan y acceso** ofrece una clave compartida de prueba que habilita ProMax en esa instalación. La clave se valida en el proceso principal contra un hash SHA-256 incluido en el build; no viaja al renderer ni se guarda en texto plano. Al activarla se persiste `accessKeyGrant` (el hash) en `config.json` y el plan resuelto pasa a ProMax con `accessSource: 'access-key'` y `subscriptionVerified: false`.

Si ya hay una licencia Pro válida, la clave de prueba ProMax amplía el acceso y la interfaz lo identifica como acceso de prueba. Una licencia ProMax válida conserva su origen firmado.

Es una medida de transición, no una licencia comercial: cualquiera que conozca la clave puede activarla, no hay cuentas ni revocación online, y el cliente de escritorio sigue siendo modificable. Para retirarla alcanza con eliminar el handler `settings:activate-access-key`, la constante del hash, el campo de la interfaz y la propiedad `accessKeyGrant` del estado del producto. Las preferencias de funciones pagas guardadas se conservan y vuelven a quedar bloqueadas si se retira el acceso.

## Contratación y gestión

Configuración principal: `{checkoutUrl, accountUrl, allowedHosts}`. Ambos enlaces deben ser HTTPS, sin credenciales de URL, con puerto estándar y hostname exacto de la lista de confianza. No se crean URLs ficticias ni se adjunta el token de acceso como parámetro. Sin configuración, `commerce.checkout.enabled` es `false` y la interfaz informa **La contratación todavía no está habilitada**. Un enlace configurado es solo navegación; no activa Pro. El retorno debe recuperar una credencial firmada desde una sesión autenticada.

Antes de habilitar ventas faltan servicios reales de cuenta, checkout, webhook de suscripción y emisión/renovación de credenciales. También deben definirse el precio y los límites comerciales de uso de fuentes externas. La comercialización quedó fuera del alcance de este bloque por decisión del dueño del proyecto. El catálogo de tres niveles sí está implementado; no implica que exista venta activa.

## Verificación

`node tools/product-test.js` y `node tools/presentation-test.js` prueban los tres niveles, proyecciones sin datos pagos en Free y cachés de presentación, además de firmas válidas e inválidas, manipulación de claims, caducidad, cuenta/perfil incorrectos, eliminación del token, beta explícita, preferencias sin borrado, muestras insuficientes y validación de enlaces.
