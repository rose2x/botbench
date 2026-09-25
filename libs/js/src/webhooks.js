'use strict';
// Verify webhook signatures (HMAC-SHA256) from GitHub, Stripe, Twitch EventSub, or anything similar.
// Uses WebCrypto, so it runs on Node 18+, Bun, Deno, Cloudflare Workers and browsers. All functions are async.
// Always verify against the RAW request body, before parsing JSON. The comparison is constant-time.

const enc = new TextEncoder();
const bytes = (x) => (typeof x === 'string' ? enc.encode(x) : x);
const concat = (...parts) => {
  const arrs = parts.map(bytes);
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
const key = (secret, usage) => globalThis.crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);

async function hmacSha256Hex(secret, message) {
  const sig = await globalThis.crypto.subtle.sign('HMAC', await key(secret, ['sign']), bytes(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True if `signature` equals prefix + HMAC-SHA256(secret, body). */
async function verifyHmac(secret, body, signature, prefix = 'sha256=') {
  if (!signature || !signature.startsWith(prefix)) return false;
  const hex = signature.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  return globalThis.crypto.subtle.verify('HMAC', await key(secret, ['verify']), hexToBytes(hex), bytes(body));
}

/** Header: X-Hub-Signature-256. */
const verifyGithub = (secret, body, signatureHeader) => verifyHmac(secret, body, signatureHeader, 'sha256=');

/** Headers: Twitch-Eventsub-Message-Id, -Message-Timestamp, -Message-Signature. Signs id + timestamp + body. */
const verifyTwitch = (secret, messageId, timestamp, body, signatureHeader) => verifyHmac(secret, concat(messageId, timestamp, body), signatureHeader, 'sha256=');

/** Header: Stripe-Signature ("t=timestamp,v1=hex[,v1=hex]"). Rejects timestamps older than `tolerance` seconds. */
async function verifyStripe(secret, signatureHeader, body, { tolerance = 300, now = Date.now() / 1000 } = {}) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',').filter((p) => p.includes('=')).map((p) => [p.slice(0, p.indexOf('=')).trim(), p.slice(p.indexOf('=') + 1)]);
  const ts = (parts.find(([k]) => k === 't') || [])[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!ts || !/^\d+$/.test(ts) || !sigs.length) return false;
  if (Math.abs(now - parseInt(ts, 10)) > tolerance) return false;
  const signed = concat(ts, '.', body);
  for (const s of sigs) if (await verifyHmac(secret, signed, `v1=${s}`, 'v1=')) return true;
  return false;
}

module.exports = { hmacSha256Hex, verifyHmac, verifyGithub, verifyTwitch, verifyStripe };
