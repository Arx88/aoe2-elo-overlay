'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { FEATURES, TOKEN_PREFIX, getProductState, verifyEntitlement, allowsFeature,
  effectivePreferences, featureState, validateCommerceUrl } = require('../src/product');

const now = Date.UTC(2026, 10, 14, 12);
const seconds = Math.floor(now / 1000);
const pair = crypto.generateKeyPairSync('ed25519');
const publicKeys = { primary: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
const accountId = 'acct-test';
const options = { publicKeys, accountId, profileId: 196240, now };
const claims = { schema: 1, kid: 'primary', sub: accountId, aud: 'aoe2-helper',
  plan: 'pro', iat: seconds - 120, exp: seconds + 3600, profileId: 196240 };

function sign(payload, privateKey = pair.privateKey) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.sign(null, Buffer.from(TOKEN_PREFIX + body), privateKey).toString('base64url');
  return `v1.${body}.${signature}`;
}

const free = getProductState(options);
assert.equal(free.plan, 'free');
assert.equal(free.subscriptionVerified, false);
assert.equal(allowsFeature(free, 'rivalCivs'), true);
assert.equal(allowsFeature(free, 'rivalOpenings'), false);
assert.equal(allowsFeature(free, 'postMatch'), true);
assert.equal(allowsFeature(free, 'postMatchComparison'), false);
assert.equal(allowsFeature({ featureAccess: { invented: true } }, 'invented'), false);
assert.equal(allowsFeature(getProductState({ ...options, plan: 'pro', pro: true }), 'smartTips'), false,
  'a client plan property never grants an entitlement');

const beta = getProductState({ ...options, betaAccess: true });
assert.equal(beta.plan, 'beta');
assert.equal(beta.label, 'Acceso beta');
assert.equal(beta.subscriptionVerified, false);
assert.equal(beta.entitlement.valid, false);
assert.ok(FEATURES.every((feature) => allowsFeature(beta, feature.key)));
assert.equal(getProductState({ ...options, betaAccess: 'true' }).plan, 'free');

const keyed = getProductState({ ...options, accessKeyGranted: true });
assert.equal(keyed.plan, 'pro');
assert.equal(keyed.accessSource, 'access-key');
assert.equal(keyed.accessKeyGranted, true);
assert.equal(keyed.subscriptionVerified, false);
assert.ok(FEATURES.every((feature) => allowsFeature(keyed, feature.key)));
assert.equal(getProductState({ ...options, accessKeyGranted: 'true' }).plan, 'free');

const entitlementToken = sign(claims);
const pro = getProductState({ ...options, entitlementToken });
assert.equal(pro.plan, 'pro');
assert.equal(pro.subscriptionVerified, true);
assert.equal(pro.entitlement.expiresAt, claims.exp * 1000);
assert.ok(FEATURES.every((feature) => allowsFeature(pro, feature.key)));
assert.equal(getProductState({ ...options, entitlementToken: null }).plan, 'free',
  'removing a token resets effective access without a sticky paid flag');
assert.equal(getProductState({ ...options, entitlementToken, now: claims.exp * 1000 }).plan, 'free');
assert.equal(verifyEntitlement(sign({ ...claims, exp: seconds - 1 }), options).reason, 'expired');
assert.equal(verifyEntitlement(sign({ ...claims, iat: seconds + 120 }), options).reason, 'not-yet-valid');
assert.equal(verifyEntitlement(sign({ ...claims, nbf: seconds + 120 }), options).reason, 'not-yet-valid');
assert.equal(verifyEntitlement(entitlementToken, { ...options, accountId: 'another' }).reason, 'account-mismatch');
assert.equal(verifyEntitlement(entitlementToken, { ...options, accountId: null }).reason, 'account-mismatch');
assert.equal(verifyEntitlement(entitlementToken, { ...options, profileId: 22 }).reason, 'profile-mismatch');
assert.equal(verifyEntitlement(sign({ ...claims, profileId: '196240' }), options).reason, 'profile-mismatch');
assert.equal(verifyEntitlement(entitlementToken, { ...options, publicKeys: {} }).reason, 'untrusted-key');
assert.equal(verifyEntitlement(entitlementToken, { ...options, now: NaN }).reason, 'invalid-clock');
assert.equal(verifyEntitlement(sign({ ...claims, aud: 'another-app' }), options).reason, 'invalid-claims');
assert.equal(verifyEntitlement(sign({ ...claims, plan: 'enterprise' }), options).reason, 'invalid-claims');
assert.equal(verifyEntitlement(sign({ ...claims, exp: '9999999999' }), options).reason, 'invalid-claims');
assert.equal(verifyEntitlement(sign({ ...claims, kid: '__proto__' }), options).reason, 'untrusted-key');

const another = crypto.generateKeyPairSync('ed25519');
assert.equal(verifyEntitlement(sign(claims, another.privateKey), options).reason, 'invalid-signature');
const pieces = entitlementToken.split('.');
const changedClaims = Buffer.from(JSON.stringify({ ...claims, exp: claims.exp + 3600 })).toString('base64url');
assert.equal(verifyEntitlement(`v1.${changedClaims}.${pieces[2]}`, options).reason, 'invalid-signature');
for (const bad of [42, {}, 'pro', 'v1.abc', 'v2.abc.abc', 'v1.***.abc',
  `v1.${pieces[1]}=.${pieces[2]}`, 'x'.repeat(17000)]) {
  assert.equal(verifyEntitlement(bad, options).valid, false, 'malformed tokens fail closed');
}

const preferences = { rivalCivs: true, rivalOpenings: true, smartTips: false,
  civRecommender: 'true', theme: 'clasico', postMatch: true, postMatchComparison: true };
const effectiveFree = effectivePreferences(preferences, free);
assert.equal(effectiveFree.rivalCivs, true);
assert.equal(effectiveFree.rivalOpenings, false);
assert.equal(effectiveFree.postMatch, true);
assert.equal(effectiveFree.postMatchComparison, false);
assert.equal(effectiveFree.theme, 'clasico');
assert.equal(preferences.rivalOpenings, true, 'losing access does not erase a saved preference');
assert.equal(effectivePreferences(preferences, pro).rivalOpenings, true);
assert.equal(effectivePreferences(preferences, pro).smartTips, false, 'Pro does not enable an unselected preference');
assert.equal(effectivePreferences(preferences, pro).civRecommender, false, 'preference values are strict booleans');

const selected = { preferences, product: free, availability: { status: 'ready', sample: 14 } };
assert.equal(featureState('rivalOpenings', selected).status, 'locked');
assert.equal(featureState('rivalOpenings', selected).selected, true);
assert.equal(featureState('rivalCivs', selected).status, 'ready');
assert.equal(featureState('rivalCivs', { ...selected, availability: { status: 'error', message: 'HTTP 429' } }).message, 'HTTP 429');
assert.equal(featureState('rivalOpenings', { ...selected, product: pro, availability: { status: 'insufficient', sample: 2 } }).status, 'insufficient',
  'paying does not transform an insufficient sample into ready data');
assert.equal(featureState('smartTips', { ...selected, product: pro }).status, 'disabled');
assert.equal(featureState('invented', selected).status, 'unknown-feature');
assert.equal(featureState('elo', { product: free }).status, 'pending');
assert.equal(featureState('rivalCivs', { ...selected, availability: { status: 'invented', sample: -4 } }).sample, null);

const allowedHosts = ['billing.example.com'];
assert.equal(validateCommerceUrl('https://billing.example.com/checkout?product=pro', allowedHosts).enabled, true);
assert.equal(validateCommerceUrl('HTTPS://BILLING.EXAMPLE.COM/checkout', allowedHosts).enabled, true);
for (const url of ['http://billing.example.com/', 'javascript:alert(1)', 'file:///C:/evil',
  'https://billing.example.com.evil.invalid/', 'https://billing.example.com@evil.invalid/',
  'https://name:secret@billing.example.com/', 'https://billing.example.com:8080/', 'invalid']) {
  assert.equal(validateCommerceUrl(url, allowedHosts).enabled, false, url);
}
assert.equal(validateCommerceUrl('https://billing.example.com/').enabled, false, 'host allowlist is required');
assert.equal(free.commerce.checkout.enabled, false);
assert.equal(free.commerce.account.enabled, false);
assert.equal(getProductState({ ...options, billing: { checkoutUrl: 'https://billing.example.com/',
  allowedHosts } }).commerce.configured, true);
assert.equal(Object.keys(pro).includes('entitlementToken'), false);
assert.ok(!JSON.stringify(pro).includes(entitlementToken), 'renderer state never carries the signed token');

console.log('PRODUCT ACCESS OK: Free/Pro/beta/clave temporal, firmas, vencimiento, preferencias, disponibilidad y enlaces.');
