# AoE2 Helper · API de Licencias (Cloudflare Workers + D1)

Servicio backend seguro que firma tokens **Ed25519** de vida corta (`24 h`) y permite **activar, desactivar o cambiar de plan cualquier cuenta en tiempo real** desde tu App Admin privada.

## Seguridad
- La clave privada **Ed25519** y el `ADMIN_SECRET` viven **solo** en secretos de Cloudflare Workers (jamás se compilan en la app pública).
- La app Electron del usuario solo incluye la clave **pública** Ed25519 para verificar la firma y nunca acepta un flag `isPro` en `config.json`.
- Límite de dispositivos por cuenta (`max_devices`, por defecto 2) con hash anónimo de máquina para evitar cuentas compartidas.
- Interruptor maestro (`paywallEnabled`) para activar o desactivar el cobro globalmente en 1 clic.

## Despliegue en 5 pasos (tier gratuito de Cloudflare)
```bash
cd licensing-api
npx wrangler login
npx wrangler d1 create aoe2-helper-licenses
# Copia el database_id devuelto en wrangler.toml

npx wrangler d1 execute aoe2-helper-licenses --remote --file=./schema.sql
node scripts/generate-keys.js
# Carga los dos secretos generados:
npx wrangler secret put ED25519_PRIVATE_KEY_B64
npx wrangler secret put ADMIN_SECRET

npx wrangler deploy
```

Luego pega la **clave pública Ed25519** y la URL `https://aoe2-helper-licensing.<tu-subdominio>.workers.dev` en `src/license-client.js`, y conéctate desde `admin-app/`.
