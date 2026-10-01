'use strict';
// Verify the Ed25519 signature Discord puts on every HTTP interaction.
// Uses WebCrypto, so it runs on Node 18+, Bun, Deno, Cloudflare Workers and modern browsers.
// Node 18 only exposes globalThis.crypto behind the --experimental-global-webcrypto flag; fall back to
// node:crypto's webcrypto so this works there too, with no flags needed. Dynamic import() (not
// require()) works in both CommonJS and ES module files, so this one fallback covers every way this
// file gets loaded. The import() only ever runs in that one older-Node case: browsers and other
// non-Node runtimes always have globalThis.crypto, so the fallback is never reached there.
let webcryptoPromise;
function getWebcrypto() {
  if (globalThis.crypto) return globalThis.crypto;
  webcryptoPromise ??= import('node:crypto').then((m) => m.webcrypto);
  return webcryptoPromise;
}

const enc = new TextEncoder();

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) throw new Error('bad hex');
  return Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
}

/**
 * @param {string} publicKeyHex  from the Developer Portal (General Information)
 * @param {string} signatureHex  the X-Signature-Ed25519 header
 * @param {string} timestamp     the X-Signature-Timestamp header
 * @param {string|Uint8Array} body the RAW request body (do not parse and re-stringify it)
 * @returns {Promise<boolean>}
 */
async function verifySignature(publicKeyHex, signatureHex, timestamp, body) {
  try {
    const bodyBytes = typeof body === 'string' ? enc.encode(body) : body;
    const ts = enc.encode(timestamp);
    const data = new Uint8Array(ts.length + bodyBytes.length);
    data.set(ts, 0);
    data.set(bodyBytes, ts.length);
    const webcrypto = await getWebcrypto();
    const key = await webcrypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
    return await webcrypto.subtle.verify({ name: 'Ed25519' }, key, hexToBytes(signatureHex), data);
  } catch {
    return false;
  }
}

module.exports = { verifySignature };
