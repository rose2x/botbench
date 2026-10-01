'use strict';
// The Cloudflare Worker example, exercised with signed requests (Node has Request/Response built in).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const env = { DISCORD_PUBLIC_KEY: PUB, CLIENT_ID: '123456789012345678' };
const ts = '1700000000';

async function worker() { return (await import(pathToFileURL(path.join(__dirname, '..', 'examples', 'cloudflare-worker.mjs')))).default; }
const signed = (payload, { good = true, method = 'POST' } = {}) => {
  const body = JSON.stringify(payload);
  const sig = good ? crypto.sign(null, Buffer.from(ts + body), privateKey).toString('hex') : '00'.repeat(64);
  return new Request('https://worker.example/', { method, body: method === 'POST' ? body : undefined, headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts } });
};

test('worker: PING, commands, unknown command', async () => {
  const w = await worker();
  assert.deepEqual(await (await w.fetch(signed({ type: 1 }), env)).json(), { type: 1 });
  assert.equal((await (await w.fetch(signed({ type: 2, data: { name: 'ping' } }), env)).json()).data.content, 'Pong from a Cloudflare Worker!');
  const invite = (await (await w.fetch(signed({ type: 2, data: { name: 'invite' } }), env)).json()).data;
  assert.match(invite.content, /client_id=123456789012345678/);
  assert.match(invite.content, /permissions=3072/);
  assert.equal(invite.flags, 64);
  assert.equal((await (await w.fetch(signed({ type: 2, data: { name: 'nope' } }), env)).json()).data.content, 'Unknown command');
});

test('worker: rejects bad signatures and non-POST', async () => {
  const w = await worker();
  assert.equal((await w.fetch(signed({ type: 1 }, { good: false }), env)).status, 401);
  assert.equal((await w.fetch(signed({ type: 1 }, { method: 'GET' }), env)).status, 404);
});
