'use strict';
// Verify the Ed25519 signature Discord puts on every HTTP interaction.
// Uses WebCrypto, so it runs on Node 20+, Bun, Deno, Cloudflare Workers and modern browsers.

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
    const key = await globalThis.crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
    return await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, hexToBytes(signatureHex), data);
  } catch {
    return false;
  }
}

module.exports = { verifySignature };
