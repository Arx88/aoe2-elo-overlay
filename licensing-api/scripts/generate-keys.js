'use strict';

/**
 * Genera un par de claves Ed25519 reales + un ADMIN_SECRET de 256 bits para
 * desplegar el Worker de licencias de AoE2 Helper.
 *
 * Uso: node licensing-api/scripts/generate-keys.js
 */

const crypto = require('node:crypto');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).trim();
const privDerB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const adminSecret = crypto.randomBytes(32).toString('base64url');

console.log('=== 1) Secreto privado para Cloudflare Worker (NO compartir ni subir a Git) ===');
console.log('npx wrangler secret put ED25519_PRIVATE_KEY_B64');
console.log(privDerB64);
console.log('');
console.log('=== 2) Secreto Admin para Cloudflare Worker + tu App Admin privada ===');
console.log('npx wrangler secret put ADMIN_SECRET');
console.log(adminSecret);
console.log('');
console.log('=== 3) Clave PUBLICA Ed25519 para src/license-client.js (seguro embeber en el cliente) ===');
console.log(pubPem);
