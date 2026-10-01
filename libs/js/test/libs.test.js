'use strict';
// Run: npm test   (from libs/js). Most tests read ../spec/vectors.json, which the Python
// libraries must pass as well.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const V = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'spec', 'vectors.json'), 'utf8'));
const {
  duration, dice, cron, ratelimit, cache, retry, textfmt, fuzzy, templating, i18n,
  automod, webhooks, githubEvents, redact, musicQueue, tictactoe, wordle, blackjack,
  leveling, leaderboard, pagination, poll, captcha, economy, giveaway,
} = require('../src');

const scripted = (values) => { let i = 0; return () => values[i++]; };
class Clock { t = 0; now = () => this.t; }

test('duration: parse and format vectors', () => {
  for (const [text, secs] of V.duration.parse) assert.equal(duration.parseDuration(text), secs, text);
  for (const text of V.duration.parse_invalid) assert.throws(() => duration.parseDuration(text), Error, text);
  for (const [secs, parts, short, out] of V.duration.format) assert.equal(duration.formatDuration(secs, parts, short), out);
});

test('dice: roll and invalid-expression vectors', () => {
  for (const c of V.dice.rolls) {
    const r = dice.roll(c.expr, { rng: scripted(c.rng) });
    assert.equal(r.total, c.total, c.expr);
    assert.deepEqual(r.terms.map((t) => ({ rolls: t.rolls, kept: t.kept })), c.terms, c.expr);
  }
  for (const expr of V.dice.invalid) assert.throws(() => dice.roll(expr, { rng: scripted(Array(200).fill(1)) }), Error, expr);
});

test('dice: default rng stays in range', () => {
  for (let i = 0; i < 200; i++) { const t = dice.roll('d6').total; assert.ok(t >= 1 && t <= 6); }
});

test('cron: next / matches / invalid vectors', () => {
  for (const [expr, after, expected] of V.cron.next) assert.equal(cron.parseCron(expr).next(new Date(after)).toISOString(), new Date(expected).toISOString(), `${expr} after ${after}`);
  for (const [expr, when, ok] of V.cron.matches) assert.equal(cron.parseCron(expr).matches(new Date(when)), ok, expr);
  for (const expr of V.cron.invalid) assert.throws(() => cron.parseCron(expr), Error, expr);
});

test('cron: next() is always strictly later and matches', () => {
  const c = cron.parseCron('*/7 3-5 * * *');
  let t = new Date('2026-09-21T00:00:00Z');
  for (let i = 0; i < 50; i++) {
    const n = c.next(t);
    assert.ok(n > t);
    assert.ok(c.matches(n));
    t = n;
  }
});

test('ratelimit: token bucket, sliding window, cooldowns', () => {
  const tb = V.ratelimit.token_bucket;
  const clock = new Clock();
  const bucket = new ratelimit.TokenBucket(tb.capacity, tb.rate, clock.now);
  for (const [t, op, expect] of tb.steps) {
    clock.t = t;
    if (op === 'take') assert.equal(bucket.tryTake(), expect);
    else assert.ok(Math.abs(bucket.waitTime() - expect) < 1e-6);
  }
  const sw = V.ratelimit.sliding_window;
  const clock2 = new Clock();
  const win = new ratelimit.SlidingWindow(sw.limit, sw.window, clock2.now);
  for (const [t, key, allowed, remaining, retryAfter] of sw.steps) {
    clock2.t = t;
    const r = win.hit(key);
    assert.deepEqual([r.allowed, r.remaining], [allowed, remaining], `${t} ${key}`);
    assert.ok(Math.abs(r.retryAfter - retryAfter) < 1e-6);
  }
  const cd = V.ratelimit.cooldowns;
  const clock3 = new Clock();
  const cool = new ratelimit.Cooldowns(cd.seconds, clock3.now);
  for (const [t, key, expect] of cd.steps) { clock3.t = t; assert.ok(Math.abs(cool.use(key) - expect) < 1e-6); }
});

test('cache: TTL + LRU vectors', () => {
  const spec = V.cache;
  const clock = new Clock();
  const c = new cache.TTLCache({ maxSize: spec.maxsize, ttl: spec.ttl, now: clock.now });
  for (const s of spec.steps) {
    clock.t = s.t;
    if (s.op === 'set') c.set(s.key, s.value);
    else if (s.op === 'get') assert.equal(c.get(s.key), s.expect, JSON.stringify(s));
    else if (s.op === 'has') assert.equal(c.has(s.key), s.expect);
    else if (s.op === 'size') assert.equal(c.size, s.expect);
  }
});

test('cache: memoize dedupes concurrent calls and does not cache errors', async () => {
  let calls = 0;
  const slow = cache.memoize(async (x) => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    if (x === 'bad') throw new Error('boom');
    return x * 2;
  }, { ttl: 60 });
  assert.deepEqual(await Promise.all([slow(2), slow(2), slow(2)]), [4, 4, 4]);
  assert.equal(calls, 1);
  assert.equal(await slow(2), 4);
  assert.equal(calls, 1);
  for (let i = 0; i < 2; i++) await assert.rejects(slow('bad'));
  assert.equal(calls, 3); // errors are not cached
});

test('retry: backoff delay vectors', () => {
  for (const [attempts, base, factor, cap, expect] of V.retry.delays) assert.deepEqual(retry.backoffDelays(attempts, base, factor, cap), expect);
});

test('retry: retries then succeeds and honours retryAfter', async () => {
  const sleeps = [];
  let calls = 0;
  const flaky = async () => { calls++; if (calls < 3) { const e = new Error('slow'); e.retryAfter = 5; throw e; } return 'ok'; };
  assert.equal(await retry.retry(flaky, { attempts: 4, sleep: async (d) => { sleeps.push(d); } }), 'ok');
  assert.deepEqual(sleeps, [5, 5]); // retryAfter (5) beats the 0.5 and 1.0 backoff
});

test('retry: gives up and respects retryOn', async () => {
  await assert.rejects(retry.retry(async () => { throw new Error('x'); }, { attempts: 2, sleep: async () => {} }));
  let n = 0;
  class NoRetryError extends Error {}
  await assert.rejects(
    retry.retry(async () => { n++; throw new NoRetryError('no'); }, { attempts: 5, retryOn: (e) => !(e instanceof NoRetryError), sleep: async () => {} }),
    NoRetryError,
  );
  assert.equal(n, 1);
});

test('textfmt: table, progress, humanize, ordinal, pluralize, truncate', () => {
  const T = V.textfmt;
  for (const c of T.table) assert.equal(textfmt.table(c.rows, c.headers, c.align), c.out);
  for (const [f, w, out] of T.progress) assert.equal(textfmt.progressBar(f, w), out);
  for (const [n, out] of T.humanize) assert.equal(textfmt.humanizeNumber(n), out, n);
  for (const [n, out] of T.ordinal) assert.equal(textfmt.ordinal(n), out);
  for (const [n, s, p, out] of T.pluralize) assert.equal(textfmt.pluralize(n, s, p), out);
  for (const [text, limit, out] of T.truncate) assert.equal(textfmt.truncate(text, limit), out);
});

test('fuzzy: levenshtein, jaro-winkler, closest', () => {
  const F = V.fuzzy;
  for (const [a, b, d] of F.levenshtein) assert.equal(fuzzy.levenshtein(a, b), d, `${a} ${b}`);
  for (const [a, b, jw] of F.jaro_winkler) assert.ok(Math.abs(fuzzy.jaroWinkler(a, b) - jw) < 1e-4, `${a} ${b}`);
  for (const [word, cands, n, cutoff, expect] of F.closest) assert.deepEqual(fuzzy.closest(word, cands, n, cutoff), expect);
});

test('templating and i18n vectors', () => {
  for (const [tpl, vars, safe, out] of V.templating) assert.equal(templating.render(tpl, vars, { safe }), out, tpl);
  const spec = V.i18n;
  const tr = new i18n.I18n(spec.catalogs, spec.default);
  for (const [key, locale, vars, out] of spec.cases) assert.equal(tr.t(key, locale, vars), out, `${key} ${locale}`);
});

test('automod: message and normalize vectors, raid detector, no built-in word list', () => {
  const spec = V.automod;
  const mod = new automod.AutoMod({
    maxMessages: spec.config.max_messages, window: spec.config.window, maxDuplicates: spec.config.max_duplicates, blockedTerms: spec.config.blocked_terms,
  });
  for (const [author, content, ts, mentions, expect] of spec.messages) assert.deepEqual(mod.check({ authorId: author, content, timestamp: ts, mentions }), expect, `${author} ${content} ${ts}`);
  for (const [text, out] of spec.normalize) assert.equal(automod.normalize(text), out);
  const det = new automod.RaidDetector(spec.raid.limit, spec.raid.window);
  for (const [uid, ts, expect] of spec.raid.joins) assert.equal(det.recordJoin(uid, ts), expect, `${uid} ${ts}`);
  assert.deepEqual(automod.DEFAULTS.blockedTerms, []);
});

test('webhooks: GitHub, Stripe, Twitch vectors (+ bytes input)', async () => {
  const W = V.webhooks;
  for (const c of W.github) assert.equal(await webhooks.verifyGithub(c.secret, c.body, c.header), c.ok, JSON.stringify(c));
  for (const c of W.stripe) assert.equal(await webhooks.verifyStripe(c.secret, c.header, c.body, { now: c.now }), c.ok, JSON.stringify(c));
  for (const c of W.twitch) assert.equal(await webhooks.verifyTwitch(c.secret, c.id, c.timestamp, c.body, c.header), c.ok, JSON.stringify(c));
  const c = W.github[0];
  assert.ok(await webhooks.verifyGithub(new TextEncoder().encode(c.secret), new TextEncoder().encode(c.body), c.header));
});

test('githubEvents: every vector matches Python\'s output exactly', () => {
  for (const c of V.github_events) assert.deepEqual(githubEvents.githubEventToEmbed(c.event, c.payload), c.expect, c.event);
});

test('redact: fake secrets are found, masked, and never appear in the output', () => {
  const TOKEN = `M${'A'.repeat(24)}.${'B'.repeat(6)}.${'C'.repeat(27)}`;
  const HOOK = `https://discord.com/api/webhooks/${'1'.repeat(18)}/${'abc'.repeat(10)}`;
  const ANT = `sk-ant-${'x'.repeat(30)}`;
  const GH = `ghp_${'y'.repeat(36)}`;
  const text = `token=${TOKEN} hook=${HOOK} key=${ANT} gh=${GH} ok=nothing here`;
  assert.deepEqual(redact.findSecrets(text).map((f) => f.kind), ['discord_token', 'discord_webhook', 'anthropic_key', 'github_token']);
  const out = redact.redact(text);
  for (const secret of [TOKEN, HOOK, ANT, GH]) assert.ok(!out.includes(secret));
  assert.ok(out.includes('[REDACTED:discord_token]'));
  assert.ok(out.includes('ok=nothing here'));
  for (const s of ['hello world', 'https://discord.com/api/webhooks/ID/TOKEN', 'paste-your-bot-token-here', 'sk-ant-...']) assert.equal(redact.redact(s), s);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-'));
  fs.writeFileSync(path.join(dir, 'config.txt'), `x\nTOKEN=${TOKEN}\n`);
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'tests', 'fixture.txt'), TOKEN);
  const found = redact.scanPaths([dir]);
  assert.deepEqual(found.map((f) => [path.basename(f.path), f.line, f.kind]), [['config.txt', 2, 'discord_token']]);
  assert.ok(!JSON.stringify(found).includes(TOKEN));
  assert.equal(redact.main([dir]), 1);
  assert.equal(redact.main([path.join(dir, 'tests')]), 0);
  fs.rmSync(dir, { recursive: true, force: true });

  const calls = [];
  const fakeConsole = { log: (...a) => calls.push(a), info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const restore = redact.installConsoleRedaction(fakeConsole);
  fakeConsole.log('failed with', TOKEN);
  restore();
  assert.deepEqual(calls, [['failed with', '[REDACTED:discord_token]']]);
});

test('musicQueue: operation-sequence vectors', () => {
  for (const c of V.music_queue) {
    const q = new musicQueue.MusicQueue(c.tracks);
    const returns = [];
    for (const [name, arg] of c.ops.map((o) => [o[0], o.length > 1 ? o[1] : undefined])) {
      if (name === 'next' || name === 'previous') returns.push(q[name]());
      else if (name === 'remove') returns.push(q.remove(arg));
      else if (name === 'shuffle') { q.shuffle(scripted(arg)); returns.push(null); }
      else if (name === 'move') { q.move(arg[0], arg[1]); returns.push(null); }
      else if (name === 'loop') { q.setLoop(arg); returns.push(null); }
      else if (name === 'add') { q.add(arg); returns.push(null); }
      else if (name === 'add_next') { q.addNext(arg); returns.push(null); }
      else throw new Error(`unknown op ${name}`);
    }
    assert.deepEqual({ returns, current: q.current, upcoming: q.upcoming, history: q.history, tracks: q.tracks }, c.expect, JSON.stringify(c.ops));
  }
  assert.throws(() => new musicQueue.MusicQueue().setLoop('sometimes'));
});

test('tictactoe: winner / bestMove vectors, and the computer never loses', () => {
  for (const [board, w] of V.tictactoe.winner) assert.equal(tictactoe.winner(board), w, board);
  for (const [board, player, move] of V.tictactoe.best_move) assert.equal(tictactoe.bestMove(board, player), move, board);

  function playAll(board, turn, computer) {
    const w = tictactoe.winner(board);
    if (w) { assert.notEqual(w, computer === 'O' ? 'X' : 'O', board); return; }
    if (tictactoe.isFull(board)) return;
    if (turn === computer) playAll(tictactoe.play(board, tictactoe.bestMove(board, computer), computer), turn === 'X' ? 'O' : 'X', computer);
    else for (const m of tictactoe.moves(board)) playAll(tictactoe.play(board, m, turn), computer, computer);
  }
  playAll('.........', 'X', 'O'); // computer plays second, human tries everything
  playAll('.........', 'X', 'X'); // computer plays first
});

test('wordle: score vectors, emoji, length check', () => {
  for (const [guess, answer, out] of V.wordle.score) assert.equal(wordle.score(guess, answer).join(''), out, `${guess} ${answer}`);
  assert.equal(wordle.toEmoji(['G', 'Y', 'B']), '🟩🟨⬛');
  assert.throws(() => wordle.score('ab', 'abc'));
});

test('blackjack: hand value, outcome, dealer-hits, shuffle vectors', () => {
  const B = V.blackjack;
  for (const [cards, total, soft] of B.hand_value) assert.deepEqual(blackjack.handValue(cards), { total, soft }, JSON.stringify(cards));
  for (const [player, dealer, out] of B.outcome) assert.equal(blackjack.outcome(player, dealer), out, `${player} vs ${dealer}`);
  for (const [cards, hit] of B.dealer_hits) assert.equal(blackjack.dealerShouldHit(cards), hit, JSON.stringify(cards));
  const s = B.shuffle;
  assert.deepEqual(blackjack.shuffle(s.cards, scripted(s.rng)), s.expect);
  assert.equal(new Set(blackjack.newDeck()).size, 52);
});

test('leveling: levelFor / xpFor / progress vectors, monotonic, round-trip', () => {
  const L = V.leveling;
  for (const [xp, level] of L.level_for) assert.equal(leveling.levelFor(xp), level, xp);
  for (const [level, xp] of L.xp_for) assert.equal(leveling.xpFor(level), xp, level);
  for (const [xp, expect] of L.progress) {
    const got = leveling.progress(xp);
    assert.equal(got.level, expect.level, xp);
    assert.equal(got.into, expect.into, xp);
    assert.equal(got.need, expect.need, xp);
    assert.ok(Math.abs(got.fraction - expect.fraction) < 1e-9, xp);
  }
  for (const xp of L.invalid) assert.throws(() => leveling.levelFor(xp));

  let prev = -1;
  for (let xp = 0; xp < 5000; xp += 7) {
    const lvl = leveling.levelFor(xp);
    assert.ok(lvl >= prev);
    prev = lvl;
    assert.ok(leveling.xpFor(lvl) <= xp);
    assert.ok(leveling.xpFor(lvl + 1) > xp);
  }
});

test('leaderboard: rank and medal vectors, competition-ranking shape', () => {
  for (const c of V.leaderboard.rank_cases) assert.deepEqual(leaderboard.rank(c.entries, c.top), c.expect, JSON.stringify(c.entries));
  for (const [pos, m] of V.leaderboard.medal) assert.equal(leaderboard.medal(pos), m);
  const r = leaderboard.rank([['a', 5], ['b', 5], ['c', 3]], 10);
  assert.deepEqual(r.map((x) => x.rank), [1, 1, 3]);
});

test('pagination: paginate / clampPage / pageLabel vectors', () => {
  const P = V.pagination;
  for (const [items, perPage, expect] of P.paginate) assert.deepEqual(pagination.paginate(items, perPage), expect, JSON.stringify([items, perPage]));
  for (const [items, perPage] of P.paginate_invalid) assert.throws(() => pagination.paginate(items, perPage));
  for (const [page, total, expect] of P.clamp) assert.equal(pagination.clampPage(page, total), expect, `${page} ${total}`);
  for (const [page, total, expect] of P.label) assert.equal(pagination.pageLabel(page, total), expect);
});

test('poll: tally and winner vectors', () => {
  for (const [votes, n, expect] of V.poll.tally) assert.deepEqual(poll.tally(votes, n), expect, JSON.stringify(votes));
  for (const [votes, n] of V.poll.tally_invalid) assert.throws(() => poll.tally(votes, n));
  for (const [counts, expect] of V.poll.winner) assert.equal(poll.winner(counts), expect, JSON.stringify(counts));
});

test('captcha: verifyAnswer vectors, self-consistent generation, deterministic generation', () => {
  for (const [a, b, text, ok] of V.captcha.verify) assert.equal(captcha.verifyAnswer(a, b, text), ok, `${a} ${b} ${text}`);
  for (let i = 0; i < 200; i++) {
    const c = captcha.generateChallenge();
    assert.ok(captcha.verifyAnswer(c.a, c.b, String(c.answer)));
    assert.ok(c.question.endsWith('?'));
  }
  const spec = V.captcha.generate_deterministic;
  let i = 0;
  const c = captcha.generateChallenge(spec.min, spec.max, () => spec.picks[i++]);
  assert.deepEqual(c, spec.expect);
});

test('economy: canAfford, applyTransfer, dailyReward, formatCurrency vectors', () => {
  const E = V.economy;
  for (const [bal, amt, ok] of E.can_afford) assert.equal(economy.canAfford(bal, amt), ok, `${bal} ${amt}`);
  for (const c of E.transfer) assert.deepEqual(economy.applyTransfer(c.from, c.to, c.amount), c.expect, JSON.stringify(c));
  for (const c of E.transfer_errors) {
    const Err = c.error === 'InsufficientFunds' ? economy.InsufficientFundsError : Error;
    assert.throws(() => economy.applyTransfer(c.from, c.to, c.amount), Err, JSON.stringify(c));
  }
  for (const c of E.daily) {
    const got = economy.dailyReward(c.last, c.now, { cooldownSeconds: c.cooldown, rewardRange: c.range, rng: () => c.pick });
    assert.equal(got.ready, c.expect.ready, JSON.stringify(c));
    assert.ok(Math.abs(got.retryAfter - c.expect.retry_after) < 1e-9, JSON.stringify(c));
    assert.equal(got.amount, c.expect.amount, JSON.stringify(c));
  }
  for (const [amount, symbol, out] of E.format_currency) assert.equal(economy.formatCurrency(amount, symbol), out);
});

test('giveaway: enter/leave sequence, pickWinners vectors, uniqueness, invalid winners, duplicate entry', () => {
  const spec = V.giveaway.enter_leave;
  const g = new giveaway.Giveaway(1);
  for (const [op, user, expect] of spec.ops) assert.equal(op === 'enter' ? g.enter(user) : g.leave(user), expect, `${op} ${user}`);
  assert.deepEqual(g.entrants, spec.final_entrants);

  for (const c of V.giveaway.pick_winners) {
    const gg = new giveaway.Giveaway(c.winners);
    for (const u of c.entrants) gg.enter(u);
    let i = 0;
    const got = gg.pickWinners(() => c.rng[i++]);
    assert.deepEqual(got, c.expect, JSON.stringify(c));
    assert.ok(gg.ended);
  }

  for (let t = 0; t < 50; t++) {
    const gg = new giveaway.Giveaway(3);
    for (let u = 0; u < 10; u++) gg.enter(u);
    const winners = gg.pickWinners();
    assert.equal(new Set(winners).size, winners.length);
    assert.equal(winners.length, 3);
    assert.ok(winners.every((w) => w >= 0 && w < 10));
  }

  for (const n of V.giveaway.invalid_winners) assert.throws(() => new giveaway.Giveaway(n));

  const dup = new giveaway.Giveaway(1);
  assert.equal(dup.enter(1), true);
  assert.equal(dup.enter(1), false);
  assert.deepEqual(dup.entrants, [1]);
});
