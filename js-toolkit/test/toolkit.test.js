'use strict';
// Offline tests. Run: npm test   (uses node:test, no extra packages, no token, no internet)
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ApiClient, ApiError } = require('../src/utils/apiClient');
const apis = require('../src/utils/apis');
const { DiscordREST, DiscordAPIError, routeKey } = require('../src/utils/discordRest');
const { Gateway, GatewayError } = require('../src/utils/gateway');
const { verifySignature } = require('../src/utils/signature');
const { createInteractionServer, message } = require('../src/utils/httpInteractions');
const directory = require('../src/utils/directory');
const u = require('../src/utils/discordUtils');
const { JsonStore } = require('../src/utils/store');
const { loadModules } = require('../src/loader');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function listen(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ server: s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}
const readBody = async (req) => { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); };

test('every command file loads and serializes', () => {
  const { commands } = loadModules();
  assert.ok(commands.size >= 55);
  for (const c of commands.values()) {
    const j = c.data.toJSON();
    assert.ok(j.name.length <= 32 && j.description.length <= 100, j.name);
  }
});

test('directory search and filters', () => {
  assert.ok(directory.ALL.length > 100);
  assert.ok(directory.search('weather').some((a) => a.name === 'Open-Meteo'));
  assert.ok(directory.search('weather', { onlyNoKey: true }).every((a) => !a.needsKey));
  assert.ok(directory.types().includes('Games'));
});

test('ApiClient: cache, wrong content-type, retry on 5xx, 404', async () => {
  let n = 0, flaky = 0;
  const { server, url } = await listen((req, res) => {
    if (req.url === '/count') { n++; res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(JSON.stringify({ n })); }
    else if (req.url === '/flaky') { flaky++; if (flaky < 2) { res.writeHead(503).end(); } else { res.writeHead(200).end('{"ok":true}'); } }
    else { res.writeHead(404).end('nope'); }
  });
  const client = new ApiClient({ cacheTtlMs: 30_000 });
  try {
    assert.equal((await client.getJson(`${url}/count`)).n, 1);
    assert.equal((await client.getJson(`${url}/count`)).n, 1); // cached
    assert.equal((await client.getJson(`${url}/count`, { ttlMs: 0 })).n, 2);
    assert.deepEqual(await client.getJson(`${url}/flaky`, { ttlMs: 0 }), { ok: true });
    await assert.rejects(client.getJson(`${url}/missing`), (e) => e instanceof ApiError && e.status === 404);
  } finally { server.close(); }
});

test('API wrappers parse canned responses', async () => {
  const real = apis.client.getJson;
  const canned = {};
  apis.client.getJson = async (url) => canned[url.split('?')[0]] ?? canned['*'];
  try {
    canned['https://geocoding-api.open-meteo.com/v1/search'] = { results: [{ name: 'Tokyo', latitude: 35.6, longitude: 139.7, country: 'Japan', admin1: 'Tokyo' }] };
    canned['https://api.open-meteo.com/v1/forecast'] = { current: { temperature_2m: 22.5, apparent_temperature: 23, relative_humidity_2m: 60, wind_speed_10m: 9.1, weather_code: 2 } };
    const w = await apis.weatherForCity('Tokyo');
    assert.deepEqual([w.name, w.summary, w.tempC], ['Tokyo', 'Partly cloudy', 22.5]);

    canned['https://opentdb.com/api.php'] = { response_code: 0, results: [{ category: 'Science%20%26%20Nature', difficulty: 'easy', question: 'What%27s%20H2O%3F', correct_answer: 'Water', incorrect_answers: ['Fire', 'Air', 'Soil'] }] };
    const q = await apis.trivia();
    assert.equal(q.question, "What's H2O?");
    assert.equal(q.category, 'Science & Nature');

    canned['*'] = { error: false, type: 'twopart', setup: 'Why?', delivery: 'Because.' };
    assert.match(await apis.joke('Programming'), /\|\|Because\.\|\|/);

    canned['*'] = { results: [] };
    delete canned['https://geocoding-api.open-meteo.com/v1/search']; // fall through to the empty result
    await assert.rejects(apis.geocode('Nowhereville'), { name: 'LookupError' });
    await assert.rejects(apis.githubRepo('../../etc/passwd'), { name: 'LookupError' });
    assert.equal(apis.decodeHtml('Tom &amp; Jerry &#39;s &quot;x&quot; &#x41;'), `Tom & Jerry 's "x" A`);
  } finally { apis.client.getJson = real; }
});

test('DiscordREST: retries after 429, sends headers, exposes error codes, handles 204 and empty buckets', async () => {
  const seen = [];
  let limitedOnce = false;
  const { server, url } = await listen(async (req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers });
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(body ? JSON.stringify(body) : undefined); };
    if (req.url.includes('/messages') && req.method === 'POST') {
      if (!limitedOnce) { limitedOnce = true; return send(429, { message: 'You are being rate limited.', retry_after: 0.05, global: false }); }
      return send(200, { id: '1', content: JSON.parse((await readBody(req)).toString()).content });
    }
    if (req.method === 'DELETE') return send(403, { code: 50013, message: 'Missing Permissions' });
    if (req.method === 'PUT') { res.writeHead(204); return res.end(); }
    return send(200, { ok: true }, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset-After': '0.2' });
  });
  const rest = new DiscordREST('TOKEN', { base: `${url}/api/v10` });
  try {
    const msg = await rest.sendMessage('123456789012345678', 'hi');
    assert.equal(msg.content, 'hi');
    assert.equal(seen.length, 2); // 429, then success
    assert.equal(seen[1].headers.authorization, 'Bot TOKEN');
    assert.match(seen[1].headers['user-agent'], /DiscordBot/);

    await assert.rejects(rest.kick('123456789012345678', '223456789012345678', 'test'), (e) => e instanceof DiscordAPIError && e.status === 403 && e.code === 50013);
    assert.equal(await rest.ban('123456789012345678', '223456789012345678', { reason: 'Späm' }), null);
    assert.equal(seen.at(-1).headers['x-audit-log-reason'], encodeURIComponent('Späm'));

    await rest.getMe();
    const t = Date.now();
    await rest.getMe(); // must wait ~0.2s
    assert.ok(Date.now() - t >= 150);
  } finally { server.close(); }
  assert.equal(routeKey('DELETE', '/channels/123456789012345678/messages/223456789012345678'), routeKey('DELETE', '/channels/123456789012345678/messages/323456789012345678'));
  assert.notEqual(routeKey('DELETE', '/channels/123456789012345678/messages/1'), routeKey('DELETE', '/channels/999999999999999999/messages/1'));
});

for (const [label, WS] of [['global WebSocket', undefined], ['ws package', require('ws')]]) {
  test(`Gateway (${label}): identify, dispatch, heartbeat ACK, resume, fatal close`, async () => {
    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => wss.on('listening', r));
    const port = wss.address().port;
    const log = [];
    let beats = 0;
    wss.on('connection', (sock) => {
      sock.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 40 } }));
      sock.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.op === 1) { beats++; sock.send(JSON.stringify({ op: 11, d: null })); }
        else if (msg.op === 2) {
          log.push('identify');
          sock.send(JSON.stringify({ op: 0, s: 1, t: 'READY', d: { session_id: 'abc', resume_gateway_url: `ws://127.0.0.1:${port}`, user: { username: 'bot' } } }));
          sock.send(JSON.stringify({ op: 0, s: 2, t: 'MESSAGE_CREATE', d: { content: 'first' } }));
          setTimeout(() => sock.close(4000), 200); // resumable
        } else if (msg.op === 6) {
          log.push(`resume seq=${msg.d.seq} session=${msg.d.session_id}`);
          sock.send(JSON.stringify({ op: 0, s: 3, t: 'RESUMED', d: {} }));
          sock.send(JSON.stringify({ op: 0, s: 4, t: 'MESSAGE_CREATE', d: { content: 'second' } }));
          setTimeout(() => sock.close(4014), 150); // fatal: disallowed intents
        }
      });
    });
    const gw = new Gateway('TOKEN', 1, { url: `ws://127.0.0.1:${port}`, WebSocket: WS });
    const seen = [];
    gw.on('MESSAGE_CREATE', (d) => { seen.push(d.content); });
    try {
      await assert.rejects(gw.run(), (e) => e instanceof GatewayError && e.code === 4014);
    } finally { wss.close(); }
    assert.ok(beats >= 2);
    assert.deepEqual(seen, ['first', 'second']);
    assert.deepEqual(log, ['identify', 'resume seq=2 session=abc']);
  });
}

test('verifySignature and the HTTP interaction server', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const sign = (ts, body) => crypto.sign(null, Buffer.concat([Buffer.from(ts), Buffer.from(body)]), privateKey).toString('hex');

  assert.equal(await verifySignature(pubHex, sign('1', 'abc'), '1', 'abc'), true);
  assert.equal(await verifySignature(pubHex, sign('1', 'abc'), '1', 'abd'), false);
  assert.equal(await verifySignature(pubHex, 'zz', '1', 'abc'), false);

  const server = createInteractionServer({ publicKey: pubHex, commands: { ping: () => message('Pong') } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/interactions`;
  const post = async (payload, good = true) => {
    const body = JSON.stringify(payload);
    const ts = '1700000000';
    return fetch(base, { method: 'POST', body, headers: { 'X-Signature-Ed25519': good ? sign(ts, body) : '00'.repeat(64), 'X-Signature-Timestamp': ts } });
  };
  try {
    assert.deepEqual(await (await post({ type: 1 })).json(), { type: 1 });
    assert.equal((await (await post({ type: 2, data: { name: 'ping' } })).json()).data.content, 'Pong');
    assert.equal((await post({ type: 1 }, false)).status, 401);
  } finally { server.close(); }
});

test('discordUtils: permissions, intents, invite, snowflakes, timestamps', () => {
  assert.equal(u.permissionsToBits(['VIEW_CHANNEL', 'SEND_MESSAGES']), 3072n);
  assert.deepEqual(u.bitsToPermissions(3072n).sort(), ['SEND_MESSAGES', 'VIEW_CHANNEL']);
  assert.ok(u.hasPermission(u.PERMISSIONS.ADMINISTRATOR, 'BAN_MEMBERS'));
  assert.equal(u.PERMISSIONS.MODERATE_MEMBERS, 1n << 40n);
  assert.equal(u.intentsToBits(['GUILDS', 'GUILD_MESSAGES']), 513);
  assert.ok(u.PRIVILEGED_INTENTS.has('MESSAGE_CONTENT'));
  assert.throws(() => u.permissionsToBits(['NOPE']));
  const url = new URL(u.inviteUrl('123', { permissions: ['SEND_MESSAGES', 'VIEW_CHANNEL'] }));
  assert.equal(url.searchParams.get('permissions'), '3072');
  assert.equal(url.searchParams.get('scope'), 'bot applications.commands');
  const p = u.snowflakeParts('175928847299117063'); // example from Discord's docs
  assert.equal(new Date(p.timestamp).toISOString(), '2016-04-30T11:18:25.796Z');
  assert.deepEqual([p.workerId, p.processId, p.increment], [1, 0, 7]);
  assert.equal(u.timestamp(new Date(1700000000000), 'R'), '<t:1700000000:R>');
  assert.equal(u.neutralizeMentions('hi @everyone <@123>'), 'hi @\u200beveryone <@\u200b123>');
});

test('discordUtils: chunking, embeds, components', () => {
  const long = ('word '.repeat(700)).trim();
  const parts = u.chunkMessage(long, 2000);
  assert.ok(parts.length >= 2 && parts.every((p) => p.length <= 2000));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long);
  const e = u.embed({ title: 'x'.repeat(300), color: '#5865F2', fields: [{ name: 'a', value: 'b', inline: true }] });
  assert.equal(e.title.length, 256);
  assert.equal(e.color, 0x5865F2);
  assert.throws(() => u.embed({ description: 'y'.repeat(4096), fields: Array.from({ length: 5 }, () => ({ name: 'n'.repeat(256), value: 'v'.repeat(1024) })) }), /6000/);
  const row = u.actionRow(u.button({ label: 'A', customId: 'a' }), u.button({ label: 'Docs', url: 'https://example.com' }));
  assert.equal(row.components[1].style, 5);
  assert.throws(() => u.actionRow(u.stringSelect({ customId: 's', options: [{ label: 'a', value: 'a' }] }), u.button({ label: 'x', customId: 'x' })));
});

test('JsonStore persists atomically', () => {
  const file = path.join(os.tmpdir(), `store-${Date.now()}`, 'x.json');
  const s = new JsonStore(file, { debounceMs: 10 });
  s.set('a', 1); s.flush();
  assert.equal(new JsonStore(file).get('a'), 1);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});
