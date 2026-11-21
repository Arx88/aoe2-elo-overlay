'use strict';

// This module belongs in Electron's main process. The renderer receives its
// serializable result; it never chooses beta access or validates its own plan.
const crypto = require('node:crypto');

const AUDIENCE = 'aoe2-helper';
const TOKEN_PREFIX = 'aoe2-helper.entitlement.v1.';
const MAX_TOKEN_LENGTH = 16384;
const CLOCK_SKEW_SECONDS = 60;
const FEATURE_ICONS = { elo: 'users', rivalCivs: 'history', rivalFavorites: 'map',
  civHelp: 'shield', tgBalance: 'users', scoutF2: 'compass', postMatch: 'chart',
  rivalOpenings: 'bow', smartTips: 'target', rivalH2H: 'sword', civRecommender: 'castle',
  smurfDetector: 'target',
  postMatchComparison: 'trend', postMatchReplay: 'clock', smartBuildOrder: 'villager' };
const FEATURE_PLANS = { elo: 'free', rivalH2H: 'free', rosterDetails: 'pro',
  rivalCivs: 'pro', rivalFavorites: 'pro', civHelp: 'pro', tgBalance: 'pro',
  rivalOpenings: 'pro', smartTips: 'pro', civRecommender: 'pro',
  smurfDetector: 'promax', smartBuildOrder: 'promax', postMatch: 'promax',
  postMatchComparison: 'promax', postMatchReplay: 'promax' };
const PLAN_RANK = { free: 0, pro: 1, promax: 2, beta: 2 };

const FEATURES = Object.freeze([
  { key: 'elo', title: 'Nombre y ELO del rival', plan: 'free', alwaysOn: true,
    description: 'Nombre y ELO actual de RM 1v1 del rival.',
    dataNote: 'Requiere que la cuenta y los jugadores estén identificados.' },
  { key: 'rosterDetails', title: 'Roster ampliado', plan: 'pro', alwaysOn: true,
    description: 'Civilizaciones, rango, pico de ELO y contexto del roster.',
    dataNote: 'Los campos ausentes conservan su estado sin dato.' },
  { key: 'rivalCivs', title: 'Últimas civilizaciones', plan: 'free', preference: true,
    description: 'Las últimas cinco elecciones del rival, con mapa y resultado.',
    dataNote: 'Historial público del mismo modo; los errores de consulta se informan.' },
  { key: 'rivalFavorites', title: 'Perfil del mapa', plan: 'free', preference: true,
    description: 'Frecuencia de civilizaciones y resultados en el mapa actual.',
    dataNote: 'Muestra del mapa y modo declarada; sin extrapolar otros mapas.' },
  { key: 'civHelp', title: 'Guía de civilización', plan: 'free', preference: true,
    description: 'Bonos, unidades y puntos a vigilar al entrar a la partida.',
    dataNote: 'Guía general de las civilizaciones confirmadas de la partida.' },
  { key: 'tgBalance', title: 'Balance de equipos', plan: 'free', preference: true,
    description: 'Mediana de ELO 1v1 y dispersión por equipo.',
    dataNote: 'Necesita equipos confirmados; se indica si faltan ELO.' },
  { key: 'scoutF2', title: 'Resumen con F2', plan: 'free', preference: true,
    description: 'Alterna resumen y detalle del informe.',
    dataNote: 'Preferencia de presentación; no desbloquea análisis adicionales.' },
  { key: 'postMatch', title: 'Resumen postmatch', plan: 'free', preference: true,
    description: 'El overlay vuelve al terminar con resultado y datos disponibles.',
    dataNote: 'El resultado debe estar confirmado por la fuente de la partida.' },
  { key: 'rivalOpenings', title: 'Aperturas del rival', plan: 'pro', preference: true,
    description: 'Aperturas detectadas en replays, con contexto y muestra.',
    dataNote: 'Solo en modos compatibles y con replays analizados suficientes.' },
  { key: 'smartTips', title: 'Plan de partida', plan: 'pro', preference: true,
    description: 'Sugerencias conectadas con los datos del rival en este contexto.',
    dataNote: 'Cada sugerencia declara su evidencia; una tendencia no garantiza el resultado.' },
  { key: 'rivalH2H', title: 'Cara a cara', plan: 'pro', preference: true,
    description: 'Enfrentamientos anteriores contra este rival.',
    dataNote: 'Distingue rivales, aliados y partidas sin equipo confirmado.' },
  { key: 'civRecommender', title: 'Elección de civilización', plan: 'pro', preference: true,
    description: 'Cruza tu experiencia en el mapa con los antecedentes del rival.',
    dataNote: 'Requiere muestra propia y del rival; no es una probabilidad de victoria.' },
  { key: 'postMatchComparison', title: 'Evolución en el mapa', plan: 'pro', preference: true,
    description: 'Compara esta partida con tu historial comparable en el mismo mapa.',
    dataNote: 'Solo usa partidas anteriores del mismo mapa y modo, con muestra declarada.' },
  { key: 'postMatchReplay', title: 'Análisis del replay', plan: 'pro', preference: true,
    description: 'Descarga automática del replay: apertura inferida, órdenes de avance y APM.',
    dataNote: 'El replay se analiza localmente. Las notas económicas requieren métricas y muestra; nunca se inventan.' },
  { key: 'smartBuildOrder', title: 'Smart Build Order', plan: 'promax', preference: true,
    description: 'Guía visual sugerida por tu civilización, mapa y rutas de oportunidad.',
    dataNote: 'Se activa antes de jugar. Es una referencia; la apertura y los pasos en vivo no están medidos.' },
  { key: 'smurfDetector', title: 'Smurf Detector', plan: 'promax', preference: true,
    description: 'Sugiere posibles cuentas secundarias junto al ELO cruzando cuentas vinculadas, winrate extremo, pico histórico y eAPM.',
    dataNote: 'Solo señala cuentas con evidencia estadística o cuentas vinculadas de mayor ELO RM 1v1.' },
].filter((feature) => feature.key !== 'scoutF2').map((feature) => Object.freeze({ ...feature,
  plan: FEATURE_PLANS[feature.key], icon: FEATURE_ICONS[feature.key] || 'compass' })));

const BY_KEY = new Map(FEATURES.map((feature) => [feature.key, feature]));

function rejected(reason) {
  return { valid: false, reason, plan: 'free', accountId: null, expiresAt: null };
}

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('invalid-base64url');
  const bytes = Buffer.from(part, 'base64url');
  if (!bytes.length || bytes.toString('base64url') !== part) throw new Error('invalid-base64url');
  return bytes;
}

/**
 * A server-issued entitlement, not a client-supplied "pro" flag.
 * Compact format: v1.<base64url JSON>.<base64url Ed25519 signature>.
 * The signature covers TOKEN_PREFIX + the encoded JSON, including kid.
 */
function verifyEntitlement(token, options = {}) {
  if (token == null || token === '') return rejected('no-entitlement');
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return rejected('malformed');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return rejected('malformed');
  let payload;
  let signature;
  try {
    payload = JSON.parse(decodePart(parts[1]).toString('utf8'));
    signature = decodePart(parts[2]);
  } catch (_) {
    return rejected('malformed');
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object' ||
      payload.schema !== 1 || typeof payload.kid !== 'string' || !payload.kid ||
      typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 200 ||
      payload.aud !== AUDIENCE || !['pro', 'promax', 'ultra'].includes(payload.plan) ||
      !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
      payload.iat <= 0 || payload.exp <= payload.iat ||
      (payload.nbf != null && (!Number.isSafeInteger(payload.nbf) || payload.nbf <= 0))) {
    return rejected('invalid-claims');
  }
  const keys = options.publicKeys;
  if (!keys || typeof keys !== 'object' || !Object.hasOwn(keys, payload.kid)) return rejected('untrusted-key');
  try {
    const key = crypto.createPublicKey(keys[payload.kid]);
    if (key.asymmetricKeyType !== 'ed25519' || signature.length !== 64 ||
        !crypto.verify(null, Buffer.from(TOKEN_PREFIX + parts[1]), key, signature)) {
      return rejected('invalid-signature');
    }
  } catch (_) {
    return rejected('invalid-signature');
  }
  const nowMs = options.now == null ? Date.now() : options.now;
  if (!Number.isFinite(nowMs) || nowMs <= 0) return rejected('invalid-clock');
  const now = Math.floor(nowMs / 1000);
  if (payload.exp <= now) return rejected('expired');
  if (payload.iat > now + CLOCK_SKEW_SECONDS ||
      (payload.nbf != null && payload.nbf > now + CLOCK_SKEW_SECONDS)) return rejected('not-yet-valid');
  // An authenticated application account is required; possession of a token
  // for someone else must not unlock the local account.
  if (typeof options.accountId !== 'string' || !options.accountId ||
      payload.sub !== options.accountId) return rejected('account-mismatch');
  if (payload.profileId != null) {
    if (!Number.isSafeInteger(payload.profileId) || payload.profileId <= 0 ||
        !Number.isSafeInteger(options.profileId) || payload.profileId !== options.profileId) {
      return rejected('profile-mismatch');
    }
  }
  const normalizedPlan = payload.plan === 'ultra' ? 'promax' : payload.plan;
  return { valid: true, reason: null, plan: normalizedPlan, accountId: payload.sub,
    expiresAt: payload.exp * 1000, issuedAt: payload.iat * 1000 };
}

function validateCommerceUrl(raw, allowedHosts = []) {
  if (!raw) return { enabled: false, url: null, reason: 'not-configured' };
  if (typeof raw !== 'string' || raw.length > 4096) return { enabled: false, url: null, reason: 'invalid-url' };
  let url;
  try { url = new URL(raw); } catch (_) { return { enabled: false, url: null, reason: 'invalid-url' }; }
  if (url.protocol !== 'https:') return { enabled: false, url: null, reason: 'https-required' };
  if (url.username || url.password) return { enabled: false, url: null, reason: 'credentials-not-allowed' };
  const hosts = Array.isArray(allowedHosts) ? allowedHosts : [];
  const allowed = hosts.some((host) => typeof host === 'string' && host.toLowerCase() === url.hostname.toLowerCase());
  if (!allowed || (url.port && url.port !== '443')) return { enabled: false, url: null, reason: 'host-not-allowed' };
  return { enabled: true, url: url.href, reason: null };
}

function getProductState(options = {}) {
  const entitlement = verifyEntitlement(options.entitlementToken, options);
  const beta = options.betaAccess === true;
  const accessKey = options.accessKeyGranted === true;
  const signedAccess = entitlement.valid && (!accessKey || entitlement.plan === 'promax');
  const plan = signedAccess ? entitlement.plan : (accessKey ? 'promax' : (beta ? 'beta' : 'free'));
  const billing = options.billing && typeof options.billing === 'object' ? options.billing : {};
  const checkout = validateCommerceUrl(billing.checkoutUrl, billing.allowedHosts);
  const account = validateCommerceUrl(billing.accountUrl, billing.allowedHosts);
  const features = FEATURES.map((feature) => ({ ...feature,
    allowed: PLAN_RANK[plan] >= PLAN_RANK[feature.plan],
    accessReason: feature.plan === 'free' ? 'included-free' :
      (PLAN_RANK[plan] >= PLAN_RANK[feature.plan] ? (signedAccess ? 'verified-entitlement' : (accessKey ? 'access-key' : 'beta-access')) : `requires-${feature.plan}`),
  }));
  return {
    schema: 1,
    plan,
    label: plan === 'beta' ? 'Acceso beta' : plan === 'promax' ? 'Ultra' : (plan === 'pro' ? 'Pro' : 'Free'),
    accessSource: signedAccess ? 'verified-entitlement' :
      (accessKey ? 'access-key' : (beta ? 'beta-access' : 'free')),
    subscriptionVerified: signedAccess,
    accessKeyGranted: accessKey,
    entitlement,
    features,
    featureAccess: Object.fromEntries(features.map((feature) => [feature.key, feature.allowed])),
    commerce: {
      configured: checkout.enabled,
      checkout,
      account,
      status: checkout.enabled ? 'configured' : 'not-configured',
      message: checkout.enabled ? 'La suscripción se gestiona en el sitio del producto.' : 'La contratación todavía no está habilitada.',
    },
  };
}

function allowsFeature(product, key) {
  // Unknown feature IDs are always denied, including if a renderer or a
  // malformed persisted preference happens to contain the same property.
  return BY_KEY.has(key) && product?.featureAccess?.[key] === true;
}

/** Memoize within a verification second, never for an entire login session.
 * Time is part of the cache identity: exp/nbf/iat can change access even when
 * neither the signed token nor saved preferences changed.
 */
function createProductStateCache(clock = Date.now) {
  let key = null;
  let state = null;
  return (options = {}) => {
    const now = options.now == null ? clock() : options.now;
    const next = JSON.stringify({ ...options, now: Math.floor(now / 1000) });
    if (state && next === key) return state;
    state = getProductState({ ...options, now });
    key = next;
    return state;
  };
}

/** Keep user preferences independently from entitlement; never erase them. */
function effectivePreferences(preferences = {}, product = getProductState()) {
  const effective = { ...preferences };
  for (const feature of FEATURES) {
    if (feature.preference) effective[feature.key] = preferences[feature.key] === true && allowsFeature(product, feature.key);
  }
  effective.scoutF2 = false; // Automatic visual-only presentation; no live input.
  return effective;
}

/**
 * UI contract: access, preference and availability are independent axes.
 * availability can be {status:'loading'|'ready'|'insufficient'|'unavailable'|
 * 'error'|'pending', message, sample}; an entitlement never implies data.
 */
function featureState(key, options = {}) {
  const feature = BY_KEY.get(key);
  if (!feature) return { key, allowed: false, selected: false, enabled: false, status: 'unknown-feature', message: 'Función desconocida.' };
  const product = options.product || getProductState();
  const allowed = allowsFeature(product, key);
  const selected = feature.alwaysOn === true || options.preferences?.[key] === true;
  const base = { key, plan: feature.plan, allowed, selected, enabled: allowed && selected };
  if (!allowed) return { ...base, status: 'locked', message: feature.plan === 'promax' ? 'Disponible con Ultra.' : 'Disponible con Pro.' };
  if (!selected) return { ...base, status: 'disabled', message: 'Desactivada en tus preferencias.' };
  const data = options.availability || {};
  const statuses = ['loading', 'ready', 'insufficient', 'unavailable', 'error', 'pending'];
  const status = statuses.includes(data.status) ? data.status : 'pending';
  return { ...base, status, message: typeof data.message === 'string' ? data.message : feature.dataNote,
    sample: Number.isSafeInteger(data.sample) && data.sample >= 0 ? data.sample : null };
}

module.exports = { FEATURES, AUDIENCE, TOKEN_PREFIX, verifyEntitlement, validateCommerceUrl,
  getProductState, createProductStateCache, allowsFeature, effectivePreferences, featureState };
