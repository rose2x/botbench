'use strict';
// Tests for the AI command, tickets, roles and persistent-component routing.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');

const { ClaudeClient, UsageLimiter } = require('../src/utils/claude');
const { ApiError, LookupError } = require('../src/utils/apiClient');
const { findComponent } = require('../src/loader');
const tickets = require('../src/commands/tickets');
const roles = require('../src/commands/roles');

function listen(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ server: s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}
const ephemeralReply = () => { const calls = []; return { calls, reply: async (x) => { calls.push(x); } }; };

test('ClaudeClient: request shape, parsing and errors', async () => {
  const seen = {};
  const { server, url } = await listen(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    seen.path = req.url; seen.headers = req.headers; seen.body = JSON.parse(Buffer.concat(chunks).toString());
    const key = req.headers['x-api-key'];
    res.setHeader('Content-Type', 'application/json');
    if (key === 'bad') { res.statusCode = 401; return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); }
    if (key === 'empty') return res.end(JSON.stringify({ content: [] }));
    return res.end(JSON.stringify({ content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }], stop_reason: 'end_turn' }));
  });
  try {
    const c = new ClaudeClient('good', { base: url, model: 'test-model' });
    assert.equal(await c.ask('hi', { system: 'be brief', maxTokens: 50 }), 'Hello there');
    assert.equal(seen.path, '/v1/messages');
    assert.equal(seen.headers['anthropic-version'], '2023-06-01');
    assert.deepEqual(seen.body, { model: 'test-model', max_tokens: 50, system: 'be brief', messages: [{ role: 'user', content: 'hi' }] });
    await assert.rejects(new ClaudeClient('bad', { base: url }).ask('hi'), (e) => e instanceof ApiError && e.status === 401 && /invalid x-api-key/.test(e.message));
    await assert.rejects(new ClaudeClient('empty', { base: url }).ask('hi'), LookupError);
  } finally { server.close(); }
});

test('UsageLimiter: per user, daily reset, refund', () => {
  let now = new Date('2026-09-21T23:00:00Z');
  const lim = new UsageLimiter(2, () => now);
  assert.deepEqual(lim.allow('a'), { allowed: true, left: 1 });
  assert.deepEqual(lim.allow('a'), { allowed: true, left: 0 });
  assert.deepEqual(lim.allow('a'), { allowed: false, left: 0 });
  assert.equal(lim.allow('b').allowed, true);
  lim.refund('a');
  assert.equal(lim.allow('a').allowed, true);
  now = new Date('2026-09-22T01:00:00Z');
  assert.deepEqual(lim.allow('a'), { allowed: true, left: 1 });
});

test('ticket names round-trip', () => {
  const name = tickets.ticketName({ username: "Alice_O'Neil!", id: '123456789012345678' });
  assert.equal(name, 'ticket-alice-o-neil-123456789012345678');
  assert.equal(tickets.ownerId(name), '123456789012345678');
  assert.equal(tickets.ownerId('general'), null);
  assert.equal(tickets.ownerId('ticket-x-123'), null);
});

test('closing a ticket: owner or moderator only, must be a ticket thread', async () => {
  const closeCmd = tickets.commands.find((c) => c.data.name === 'ticketclose');
  const mk = (over = {}) => {
    const r = ephemeralReply();
    const thread = { name: 'ticket-bob-123456789012345678', isThread: () => true, locked: false, archived: false, setLocked: async () => { thread.locked = true; }, setArchived: async () => { thread.archived = true; } };
    return { thread, r, i: { channel: thread, user: { id: '123456789012345678', tag: 'bob#0' }, memberPermissions: { has: () => false }, reply: r.reply, ...over } };
  };
  let t = mk(); await closeCmd.execute(t.i);
  assert.ok(t.thread.locked && t.thread.archived, 'owner can close');

  t = mk({ user: { id: '999999999999999999', tag: 'eve#0' } }); await closeCmd.execute(t.i);
  assert.ok(!t.thread.archived && /owner or a moderator/.test(t.r.calls[0].content), 'stranger cannot');

  t = mk({ user: { id: '999999999999999999', tag: 'mod#0' }, memberPermissions: { has: (p) => p === P.ManageThreads } }); await closeCmd.execute(t.i);
  assert.ok(t.thread.archived, 'moderator can');

  const r = ephemeralReply();
  await closeCmd.execute({ channel: { isThread: () => false, name: 'general' }, user: { id: '1' }, reply: r.reply });
  assert.match(r.calls[0].content, /isn't a ticket/);
});

test('role safety rules', () => {
  const role = (perms, extra = {}) => ({ id: '10', managed: false, position: 1, permissions: new PermissionsBitField(perms), ...extra });
  assert.equal(roles.assignProblem(role([P.SendMessages]), '99', 5), null);
  assert.match(roles.assignProblem(role([P.SendMessages], { id: '99' }), '99', 5), /@everyone/);
  assert.match(roles.assignProblem(role([P.SendMessages], { managed: true }), '99', 5), /managed/);
  assert.match(roles.assignProblem(role([P.Administrator]), '99', 5), /powerful/);
  assert.match(roles.assignProblem(role([P.BanMembers]), '99', 5), /powerful/);
  assert.match(roles.assignProblem(role([P.SendMessages], { position: 5 }), '99', 5), /above/);
});

test('role toggle button adds, removes, and refuses dangerous roles', async () => {
  const toggle = roles.components[0];
  const state = new Set();
  const role = { id: '42', name: 'Gamer', managed: false, position: 1, permissions: new PermissionsBitField([P.SendMessages]) };
  const r = ephemeralReply();
  const i = {
    customId: 'roles:toggle:42', guildId: '99', reply: r.reply,
    guild: { roles: { cache: new Map([['42', role]]) }, members: { me: { roles: { highest: { position: 10 } } } } },
    member: { roles: { cache: { has: (id) => state.has(id) }, add: async (id) => state.add(id), remove: async (id) => state.delete(id) } },
  };
  await toggle.execute(i);
  assert.ok(state.has('42')); assert.match(r.calls.at(-1).content, /now have/);
  await toggle.execute(i);
  assert.ok(!state.has('42')); assert.match(r.calls.at(-1).content, /Removed/);
  role.permissions = new PermissionsBitField([P.Administrator]);
  await toggle.execute(i);
  assert.ok(!state.has('42')); assert.match(r.calls.at(-1).content, /powerful/);
});

test('findComponent matches ids and prefixes only', () => {
  const comps = [{ id: 'ticket:open' }, { id: 'roles:toggle' }];
  assert.equal(findComponent(comps, 'ticket:open'), comps[0]);
  assert.equal(findComponent(comps, 'roles:toggle:123'), comps[1]);
  assert.equal(findComponent(comps, 'roles:togglefoo'), undefined);
  assert.equal(findComponent(comps, 't0'), undefined); // trivia buttons are handled by collectors
});

test('with an API key set, all 67 commands load and serialize', () => {
  const out = execFileSync(process.execPath, ['-e', `
    const { loadModules } = require('./src/loader');
    const { commands, components } = loadModules();
    for (const c of commands.values()) { const j = c.data.toJSON(); if (j.name.length > 32 || j.description.length > 100) throw new Error(j.name); }
    console.log(JSON.stringify({ n: commands.size, ask: commands.has('ask'), comps: components.map((c) => c.id) }));
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: 'test' }, encoding: 'utf8' });
  const info = JSON.parse(out.trim().split('\n').at(-1));
  assert.equal(info.n, 67);
  assert.ok(info.ask);
  assert.deepEqual(info.comps.sort(), ['giveaway:enter', 'roles:toggle', 'ticket:close', 'ticket:open', 'verify:start', 'verify:submit']);
});

test('without an API key, /ask is not registered', () => {
  const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;
  const out = execFileSync(process.execPath, ['-e', `console.log(require('./src/loader').loadModules().commands.size)`], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
  assert.equal(Number(out.trim().split('\n').at(-1)), 66);
});
