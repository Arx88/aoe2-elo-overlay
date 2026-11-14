# Free, Pro y acceso beta

`src/product.js` define el catálogo y resuelve permisos en el proceso principal de Electron. Las preferencias de cada jugador, su acceso al producto y la disponibilidad de los datos son estados independientes.

| Free | Pro |
| --- | --- |
| ELO y roster de la partida | Aperturas detectadas en replays |
| Últimas cinco civilizaciones del rival | Plan contextual con evidencia |
| Perfil del mapa: frecuencia de civs y resultados | Cara a cara con el rival |
| Guía de civilización | Elección de civ basada en antecedentes propios y del rival |
| Balance de equipos y presentación con F2 | Comparaciones postmatch en el mismo mapa |
| Resumen postmatch con resultado confirmado | Rendimiento por etapa cuando existe telemetría |

Las opciones Pro no garantizan que una fuente tenga datos. Cada opción debe mostrar carga, error, muestra insuficiente o espera de replay según corresponda. APM y notas de ejecución no se calculan a partir de una victoria o una derrota.

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

`betaAccess` debe venir de una decisión explícita de la aplicación principal, por ejemplo un build beta o un argumento de desarrollo, y nunca del renderer ni de un selector de plan de la interfaz. La UI muestra **Acceso beta** y `subscriptionVerified: false`. Una beta con todas las funciones no es una suscripción activa.

En producción, sin acceso beta y sin credencial verificada, el plan es Free. `effectivePreferences` conserva las preferencias originales y devuelve las opciones Pro desactivadas para el flujo de consultas. Si caduca Pro, la aplicación no borra qué opciones había elegido el jugador. Renovar restaura esas preferencias. Las preferencias de presentación y otras propiedades de configuración se conservan.

`featureState(key, {preferences, product, availability})` devuelve los ejes `allowed`, `selected`, `enabled` y `status`. Estados de UI: `locked`, `disabled`, `pending`, `loading`, `ready`, `insufficient`, `unavailable`, `error`. Un ID de función desconocido falla cerrado. El renderer recibe `getProductState()` serializado; no recibe el token ni las claves privadas y no puede establecer sus permisos.

Los gates de `viewConfig()` y de los handlers IPC deben usar el mismo estado resuelto por main. Ocultar un control de Pro por CSS no constituye control de acceso. La validación del servidor sigue siendo obligatoria para cualquier servicio de pago; un cliente de escritorio modificable no puede proteger por sí solo una API comercial.

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

`iat`, `exp` y el opcional `nbf` usan segundos Unix enteros. `sub` debe coincidir con la cuenta autenticada. El opcional `profileId`, entero positivo, vincula el acceso también al perfil AoE2 seleccionado. La expiración no tiene prórroga; solo la emisión y `nbf` toleran 60 segundos de desfase futuro. Rotar claves mediante `kid` permite revocar una clave pública en una nueva distribución. El producto no mantiene un flag persistente `isPro`.

El backend debe emitir credenciales de duración acotada después de validar la cuenta y la suscripción con su proveedor de cobro. Cancelaciones y reembolsos deben reflejarse en la siguiente renovación; para revocación inmediata de una credencial todavía vigente hace falta consulta online al backend. Este módulo no implementa un proveedor de pagos, autenticación o webhooks ni afirma que esos servicios estén desplegados.

## Contratación y gestión

Configuración principal: `{checkoutUrl, accountUrl, allowedHosts}`. Ambos enlaces deben ser HTTPS, sin credenciales de URL, con puerto estándar y hostname exacto de la lista de confianza. No se crean URLs ficticias ni se adjunta el token de acceso como parámetro. Sin configuración, `commerce.checkout.enabled` es `false` y la interfaz informa **La contratación todavía no está habilitada**. Un enlace configurado es solo navegación; no activa Pro. El retorno debe recuperar una credencial firmada desde una sesión autenticada.

Antes de habilitar ventas faltan servicios reales de cuenta, checkout, webhook de suscripción y emisión/renovación de credenciales. También deben definirse el precio y los límites comerciales de uso de fuentes externas. El catálogo actual constituye una propuesta implementable y se puede ajustar sin modificar preferencias guardadas.

## Verificación

`node tools/product-test.js` prueba firmas válidas e inválidas, manipulación de claims, caducidad, cuenta/perfil incorrectos, eliminación del token, beta explícita, preferencias sin borrado, muestras insuficientes y validación de enlaces.
