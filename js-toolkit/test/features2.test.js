'use strict';
// Tests for economy, giveaway and verify: the botbench-libs-powered features.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');

const { economy } = require('botbench-libs');
const { findComponent } = require('../src/loader');

const text = (r) => (typeof r === 'string' ? r : r.content);

function withTempCwd(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-economy-'));
  const prev = process.cwd();
  process.chdir(dir);
  try { return fn(dir); } finally { process.chdir(prev); fs.rmSync(dir, { recursive: true, force: true }); }
}

test('economy commands: balance, daily, pay, richest', () => withTempCwd(() => {
  delete require.cache[require.resolve('../src/utils/store')];
  delete require.cache[require.resolve('../src/commands/economy')];
  const { commands } = require('../src/commands/economy');
  const byName = Object.fromEntries(commands.map((c) => [c.data.name, c]));
  const replies = [];
  const mk = (userId, overrides = {}) => ({
    guildId: 'g1', user: { id: userId, toString: () => `<@${userId}>` },
    options: { getUser: () => null, getInteger: () => null, ...overrides.options },
    reply: async (x) => { replies.push(x); return x; },
  });

  // no wallet yet
  return (async () => {
    await byName.balance.execute(mk('u1'));
    assert.match(text(replies.at(-1)), /0 🪙/);

    // daily, deterministic via Date.now is real time but dailyReward w/ no lastDaily always ready
    await byName.daily.execute(mk('u1'));
    assert.match(text(replies.at(-1)), /You claimed/);
    const claimedAmountMatch = text(replies.at(-1)).match(/\*\*(\d[\d,]*) 🪙\*\*/);
    assert.ok(claimedAmountMatch);

    // second daily claim same day should be blocked
    await byName.daily.execute(mk('u1'));
    assert.match(text(replies.at(-1)), /already claimed today/);

    const claimed = parseInt(claimedAmountMatch[1].replace(/,/g, ''), 10);
    assert.ok(claimed >= 50 && claimed <= 150); // the reward range, so 10 is always affordable next

    await byName.pay.execute(mk('u1', { options: { getUser: () => ({ id: 'u2', bot: false, toString: () => '<@u2>' }), getInteger: () => 10 } }));
    assert.match(text(replies.at(-1)), /paid.*10 🪙/);

    const balU1 = [];
    await byName.balance.execute({ ...mk('u1'), reply: async (x) => balU1.push(x) });
    assert.match(text(balU1.at(-1)), new RegExp(`${claimed - 10} 🪙`));
    const balU2 = [];
    await byName.balance.execute({ ...mk('u2'), options: { getUser: () => ({ id: 'u2', toString: () => '<@u2>' }) }, reply: async (x) => balU2.push(x) });
    assert.match(text(balU2.at(-1)), /10 🪙/);

    // can't pay yourself
    await byName.pay.execute(mk('u1', { options: { getUser: () => ({ id: 'u1', bot: false }), getInteger: () => 10 } }));
    assert.match(text(replies.at(-1)), /pay yourself/);

    // can't afford
    await byName.pay.execute(mk('u1', { options: { getUser: () => ({ id: 'u2', bot: false }), getInteger: () => 9999 } }));
    assert.match(text(replies.at(-1)), /only have/);

    // richest / leaderboard
    const rich = mk('u1');
    rich.reply = async (x) => { replies.push(x); return x; };
    await byName.richest.execute(rich);
    const embedReply = replies.at(-1);
    assert.ok(embedReply.embeds);
    assert.match(embedReply.embeds[0].data.description, /🥇 <@u1>/); // u1 still has more after paying only 10
  })();
}));

test('economy library: canAfford / applyTransfer / dailyReward / formatCurrency basic sanity', () => {
  assert.equal(economy.canAfford(100, 50), true);
  assert.deepEqual(economy.applyTransfer(100, 0, 40), [60, 40]);
  assert.throws(() => economy.applyTransfer(10, 0, 50), economy.InsufficientFundsError);
  const r = economy.dailyReward(null, 1000, { rng: () => 77 });
  assert.deepEqual(r, { ready: true, retryAfter: 0, amount: 77 });
  assert.equal(economy.formatCurrency(1500), '1,500 🪙');
});

test('giveaway: embed rendering, finish(), enter button handler, restart-safety', async () => {
  const gw = require('../src/commands/giveaway');
  const { giveaway } = require('botbench-libs');
  const { active, endsAt, finish, giveawayEmbed } = gw._internal;

  const g = new giveaway.Giveaway(2, 'a plushie');
  [1, 2, 3].forEach((u) => g.enter(u));
  const e = giveawayEmbed(g, 2_000_000_000);
  assert.match(e.data.description, /3 entered so far/);

  // finish() with a fake message
  active.set('m1', g);
  endsAt.set('m1', 2_000_000_000);
  let edited = null;
  let replied = null;
  const fakeMsg = { id: 'm1', edit: async (x) => { edited = x; }, reply: async (x) => { replied = x; } };
  await finish(fakeMsg);
  assert.ok(!active.has('m1'));
  assert.ok(edited.embeds[0].data.description.match(/Winner|Nobody entered/));
  assert.ok(replied);

  // enter button: fresh giveaway
  const g2 = new giveaway.Giveaway(1, 'x');
  active.set('m2', g2);
  endsAt.set('m2', 2_000_000_000);
  const enter = findComponent(gw.components, 'giveaway:enter');
  const replies = [];
  let editedMsg = null;
  const i1 = { message: { id: 'm2', edit: async (x) => { editedMsg = x; } }, user: { id: 'u1' }, reply: async (x) => replies.push(x) };
  await enter.execute(i1);
  assert.match(replies.at(-1).content, /entered/);
  assert.ok(editedMsg);

  await enter.execute(i1); // same user again
  assert.match(replies.at(-1).content, /already entered/);

  // restart-safety: giveaway not in `active`
  const i2 = { message: { id: 'unknown-message' }, user: { id: 'u2' }, reply: async (x) => replies.push(x) };
  await enter.execute(i2);
  assert.match(replies.at(-1).content, /lost/);
});

test('giveaway: pickWinners produces unique bounded winners, and duplicate entry is a no-op', () => {
  const { giveaway } = require('botbench-libs');
  const g = new giveaway.Giveaway(3);
  for (let u = 0; u < 10; u++) g.enter(u);
  assert.equal(g.enter(0), false);
  const winners = g.pickWinners();
  assert.equal(new Set(winners).size, 3);
  assert.ok(winners.every((w) => w >= 0 && w < 10));
});

test('verify: button shows a modal; modal submit checks the answer and assigns the role safely', async () => {
  const verify = require('../src/commands/verify');
  const startHandler = findComponent(verify.components, 'verify:start:42');
  assert.equal(startHandler.id, 'verify:start');

  let shownModal = null;
  const buttonInteraction = { customId: 'verify:start:42', showModal: async (m) => { shownModal = m; } };
  await startHandler.execute(buttonInteraction);
  assert.ok(shownModal);
  const json = shownModal.toJSON();
  assert.match(json.custom_id, /^verify:submit:42:\d+:-?\d+$/);
  const [, , roleId, aStr, bStr] = json.custom_id.split(':');
  const a = parseInt(aStr, 10);
  const b = parseInt(bStr, 10);

  const submitHandler = findComponent(verify.components, json.custom_id);
  assert.equal(submitHandler.id, 'verify:submit');

  const role = { id: roleId, name: 'Verified', managed: false, position: 1, permissions: new PermissionsBitField([P.SendMessages]) };
  const rolesCache = new Set();
  const replies = [];
  const mkInteraction = (answerText) => ({
    customId: json.custom_id,
    fields: { getTextInputValue: () => answerText },
    guild: { roles: { cache: new Map([[roleId, role]]) }, members: { me: { roles: { highest: { position: 10 } } } } },
    guildId: 'g1',
    member: { roles: { cache: { has: (id) => rolesCache.has(id) }, add: async (id) => rolesCache.add(id) } },
    reply: async (x) => replies.push(x),
  });

  await submitHandler.execute(mkInteraction(String(a + b + 1))); // wrong
  assert.match(replies.at(-1).content, /not right/);
  assert.ok(!rolesCache.has(roleId));

  await submitHandler.execute(mkInteraction(` ${a + b} `)); // right, with whitespace
  assert.match(replies.at(-1).content, /Correct/);
  assert.ok(rolesCache.has(roleId));

  await submitHandler.execute(mkInteraction(String(a + b))); // already verified
  assert.match(replies.at(-1).content, /already verified/);
});

test('verify: refuses to hand out a dangerous role', async () => {
  const verify = require('../src/commands/verify');
  const submitHandler = findComponent(verify.components, 'verify:submit:99:1:1');
  const role = { id: '99', name: 'Admin', managed: false, position: 1, permissions: new PermissionsBitField([P.Administrator]) };
  const replies = [];
  const i = {
    customId: 'verify:submit:99:1:1',
    fields: { getTextInputValue: () => '2' },
    guild: { roles: { cache: new Map([['99', role]]) }, members: { me: { roles: { highest: { position: 10 } } } } },
    guildId: 'g1',
    member: { roles: { cache: { has: () => false }, add: async () => {} } },
    reply: async (x) => replies.push(x),
  };
  await submitHandler.execute(i);
  assert.match(replies.at(-1).content, /powerful/);
});

test('with an API key set, all 67 commands load and the six component handlers register', () => {
  const out = execFileSync(process.execPath, ['-e', `
    const { loadModules } = require('./src/loader');
    const { commands, components } = loadModules();
    for (const c of commands.values()) { const j = c.data.toJSON(); if (j.name.length > 32 || (j.description && j.description.length > 100)) throw new Error(j.name); }
    console.log(JSON.stringify({ n: commands.size, comps: components.map((c) => c.id).sort() }));
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: 'test' }, encoding: 'utf8' });
  const info = JSON.parse(out.trim().split('\n').at(-1));
  assert.equal(info.n, 67);
  assert.deepEqual(info.comps, ['giveaway:enter', 'roles:toggle', 'ticket:close', 'ticket:open', 'verify:start', 'verify:submit']);
});
