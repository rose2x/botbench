'use strict';
// Run: npm test   (build first with: npm run build)
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const DIST = path.join(__dirname, '..', 'dist');
const bb = require('../dist/botbench.js');

function listen(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ server: s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}

test('exposes the namespaces and help()', () => {
  for (const ns of ['fun', 'info', 'money', 'dev', 'games', 'media', 'apis', 'directory', 'reference', 'discord', 'kv', 'config', 'help']) assert.ok(bb[ns], ns);
  assert.equal(typeof bb.fun.joke, 'function');
  assert.equal(bb.apis.weatherForCity, bb.info.weatherForCity);
  assert.match(bb.help(), /fun: joke, dadJoke/);
  assert.equal(bb.directory.all.length, 115);
});

test('ES module and minified builds export the same thing', async () => {
  const esm = await import(path.join(DIST, 'botbench.mjs'));
  assert.equal(esm.default.version, bb.version);
  assert.equal(typeof esm.fun.joke, 'function');
  const min = require('../dist/botbench.min.js');
  assert.equal(min.version, bb.version);
  assert.equal(min.discord.permissionsToBits(['SEND_MESSAGES', 'VIEW_CHANNEL']), 3072n);
});

test('config({ proxy }) reroutes API calls (this is how you fix CORS in a browser)', async () => {
  const seen = [];
  const { server, url } = await listen((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(JSON.stringify({ error: false, type: 'single', joke: 'A proxied joke' }));
  });
  try {
    bb.config({ proxy: (u) => `${url}/?url=${encodeURIComponent(u)}`, cacheTtlMs: 0 });
    assert.equal(await bb.fun.joke('Programming'), 'A proxied joke');
    assert.match(decodeURIComponent(seen[0]), /https:\/\/v2\.jokeapi\.dev\/joke\/Programming\?safe-mode/);
  } finally { bb.config({ proxy: null }); server.close(); }
});

test('directory search works offline', () => {
  const r = bb.directory.search('anime');
  assert.ok(r.some((a) => a.name === 'Jikan'));
  assert.ok(bb.directory.noKey().length > 50);
  assert.ok(bb.reference.ENDPOINTS.length > 40);
});

test('discord helpers are reachable and correct', () => {
  const d = bb.discord;
  assert.equal(new URL(d.inviteUrl('1', { permissions: ['SEND_MESSAGES', 'VIEW_CHANNEL'] })).searchParams.get('permissions'), '3072');
  assert.equal(d.snowflakeToDate('175928847299117063').toISOString(), '2016-04-30T11:18:25.796Z');
  assert.equal(d.timestamp(new Date(1700000000000), 'R'), '<t:1700000000:R>');
  assert.equal(d.embed({ title: 'Hi', color: '#5865F2' }).color, 0x5865F2);
  assert.equal(d.actionRow(d.button({ label: 'A', customId: 'a' })).components.length, 1);
});

test('discord.webhook sends content, embeds and thread_id', async () => {
  const seen = [];
  const { server, url } = await listen(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    seen.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString()), auth: req.headers.authorization });
    res.writeHead(204); res.end();
  });
  try {
    const hook = bb.discord.webhook('https://discord.com/api/webhooks/123456789012345678/abc-DEF_1?thread_id=42', { base: `${url}/api/v10` });
    await hook.send('hello');
    await hook.send({ username: 'Bot', embeds: [bb.discord.embed({ title: 'T' })] });
    assert.equal(seen[0].url, '/api/v10/webhooks/123456789012345678/abc-DEF_1?thread_id=42');
    assert.equal(seen[0].body.content, 'hello');
    assert.equal(seen[1].body.username, 'Bot');
    assert.equal(seen[0].auth, undefined); // webhooks need no token
    assert.throws(() => bb.discord.webhook('https://example.com/nope'));
  } finally { server.close(); }
});

test('kv: get/set/incr/list/ttl/del', async () => {
  const kv = bb.createKV(bb.backends.memory());
  await kv.set('score:a', 1);
  assert.equal(await kv.incr('score:a', 4), 5);
  await kv.set('score:b', { nested: true });
  await kv.set('other', 1);
  assert.deepEqual((await kv.list('score:')).map((x) => x.key).sort(), ['score:a', 'score:b']);
  await kv.set('temp', 'x', { ttlSeconds: 0.05 });
  assert.equal(await kv.get('temp'), 'x');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(await kv.get('temp', 'gone'), 'gone');
  await kv.del('other');
  assert.equal(await kv.get('other'), null);
});

test('verifySignature works through the SDK', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const sig = crypto.sign(null, Buffer.from('1700000000{"type":1}'), privateKey).toString('hex');
  assert.equal(await bb.discord.verifySignature(pub, sig, '1700000000', '{"type":1}'), true);
  assert.equal(await bb.discord.verifySignature(pub, sig, '1700000001', '{"type":1}'), false);
});

test('runs as a plain <script> in a browser-like sandbox (no require, no module)', async () => {
  const requests = [];
  const store = new Map();
  const sandbox = {
    document: {}, // its presence tells the toolkit it is in a browser
    console, URL, URLSearchParams, TextEncoder, TextDecoder, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval, crypto: globalThis.crypto,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), get length() { return store.size; } },
    fetch: async (url, init) => {
      requests.push({ url: String(url), headers: init.headers });
      return new Response(JSON.stringify({ fact: 'Cats purr.', length: 10 }), { status: 200 });
    },
  };
  Object.defineProperty(sandbox.localStorage, 'keys', { value: () => [...store.keys()] });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIST, 'botbench.js'), 'utf8'), sandbox);
  const b = sandbox.botbench;
  assert.ok(b, 'global botbench was created');
  assert.equal(await b.fun.catFact(), 'Cats purr.');
  assert.equal(requests[0].headers['User-Agent'], undefined); // browsers must not send it (it would trigger a CORS preflight)
  assert.equal(requests[0].headers.Accept, 'application/json');
  await b.kv.set('hello', 'world'); // uses the sandbox localStorage
  assert.equal(await b.kv.get('hello'), 'world');
  assert.ok([...store.keys()].some((k) => k.startsWith('botbench:')));
});

test('gateway helper builds a Gateway with a custom WebSocket', () => {
  class Fake {}
  const gw = bb.discord.gateway('T', 1, { WebSocket: Fake });
  assert.equal(gw.WS, Fake);
});
