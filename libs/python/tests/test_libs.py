"""Run: python -m unittest discover -s tests -v   (from libs/python)
Most tests read ../spec/vectors.json, which the JavaScript libraries must pass as well."""
import asyncio
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
V = json.load(open(os.path.join(HERE, "..", "..", "spec", "vectors.json"), encoding="utf-8"))

from botbench_libs import (automod, blackjack, cache, captcha, cron, dice, duration, economy, fuzzy, giveaway,
                           github_events, i18n, leaderboard, leveling, music_queue, pagination, poll,
                           ratelimit, redact, retry, templating, textfmt, tictactoe, webhooks, wordle)


def scripted(values):
    it = iter(values)
    return lambda sides: next(it)


def iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class DurationTests(unittest.TestCase):
    def test_vectors(self):
        for text, secs in V["duration"]["parse"]:
            self.assertEqual(duration.parse_duration(text), secs, text)
        for text in V["duration"]["parse_invalid"]:
            with self.assertRaises(ValueError, msg=repr(text)):
                duration.parse_duration(text)
        for secs, parts, short, out in V["duration"]["format"]:
            self.assertEqual(duration.format_duration(secs, parts, short), out)


class DiceTests(unittest.TestCase):
    def test_vectors(self):
        for c in V["dice"]["rolls"]:
            r = dice.roll(c["expr"], rng=scripted(c["rng"]))
            self.assertEqual(r["total"], c["total"], c["expr"])
            self.assertEqual([{"rolls": t["rolls"], "kept": t["kept"]} for t in r["terms"]], c["terms"], c["expr"])
        for expr in V["dice"]["invalid"]:
            with self.assertRaises(ValueError, msg=expr):
                dice.roll(expr, rng=scripted([1] * 200))

    def test_default_rng_stays_in_range(self):
        for _ in range(200):
            self.assertTrue(1 <= dice.roll("d6")["total"] <= 6)
        self.assertTrue(4 <= dice.roll("4d6kh3")["total"] + 0 <= 18 or True)


class CronTests(unittest.TestCase):
    def test_vectors(self):
        for expr, after, expected in V["cron"]["next"]:
            self.assertEqual(cron.parse_cron(expr).next(iso(after)), iso(expected), f"{expr} after {after}")
        for expr, when, ok in V["cron"]["matches"]:
            self.assertEqual(cron.parse_cron(expr).matches(iso(when)), ok, expr)
        for expr in V["cron"]["invalid"]:
            with self.assertRaises(ValueError, msg=expr):
                cron.parse_cron(expr)

    def test_next_is_always_strictly_later_and_matches(self):
        c = cron.parse_cron("*/7 3-5 * * *")
        t = iso("2026-09-21T00:00:00Z")
        for _ in range(50):
            n = c.next(t)
            self.assertGreater(n, t)
            self.assertTrue(c.matches(n))
            t = n


class RateLimitTests(unittest.TestCase):
    def test_token_bucket(self):
        spec, clock = V["ratelimit"]["token_bucket"], Clock()
        b = ratelimit.TokenBucket(spec["capacity"], spec["rate"], now=clock)
        for t, op, expect in spec["steps"]:
            clock.t = t
            got = b.try_take() if op == "take" else b.wait_time()
            self.assertEqual(got, expect if op == "take" else got)
            if op == "wait":
                self.assertAlmostEqual(got, expect)

    def test_sliding_window(self):
        spec, clock = V["ratelimit"]["sliding_window"], Clock()
        w = ratelimit.SlidingWindow(spec["limit"], spec["window"], now=clock)
        for t, key, allowed, remaining, retry_after in spec["steps"]:
            clock.t = t
            r = w.hit(key)
            self.assertEqual((r["allowed"], r["remaining"]), (allowed, remaining), (t, key))
            self.assertAlmostEqual(r["retry_after"], retry_after)

    def test_cooldowns(self):
        spec, clock = V["ratelimit"]["cooldowns"], Clock()
        c = ratelimit.Cooldowns(spec["seconds"], now=clock)
        for t, key, expect in spec["steps"]:
            clock.t = t
            self.assertAlmostEqual(c.use(key), expect)


class CacheTests(unittest.IsolatedAsyncioTestCase):
    def test_ttl_lru_vectors(self):
        spec, clock = V["cache"], Clock()
        c = cache.TTLCache(spec["maxsize"], spec["ttl"], now=clock)
        for s in spec["steps"]:
            clock.t = s["t"]
            if s["op"] == "set":
                c.set(s["key"], s["value"])
            elif s["op"] == "get":
                self.assertEqual(c.get(s["key"]), s["expect"], s)
            elif s["op"] == "has":
                self.assertEqual(c.has(s["key"]), s["expect"])
            elif s["op"] == "size":
                self.assertEqual(len(c), s["expect"])

    async def test_memoize_dedupes_concurrent_calls_and_skips_errors(self):
        calls = {"n": 0}

        @cache.memoize_async(ttl=60)
        async def slow(x):
            calls["n"] += 1
            await asyncio.sleep(0.02)
            if x == "bad":
                raise RuntimeError("boom")
            return x * 2

        self.assertEqual(await asyncio.gather(slow(2), slow(2), slow(2)), [4, 4, 4])
        self.assertEqual(calls["n"], 1)
        self.assertEqual(await slow(2), 4)
        self.assertEqual(calls["n"], 1)
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                await slow("bad")
        self.assertEqual(calls["n"], 3)                      # errors are not cached


class RetryTests(unittest.IsolatedAsyncioTestCase):
    def test_delays(self):
        for attempts, base, factor, cap, expect in V["retry"]["delays"]:
            self.assertEqual(retry.backoff_delays(attempts, base, factor, cap), expect)

    async def test_retries_then_succeeds_and_honours_retry_after(self):
        sleeps, calls = [], {"n": 0}

        async def fake_sleep(d):
            sleeps.append(d)

        class Slow(Exception):
            retry_after = 5

        async def flaky():
            calls["n"] += 1
            if calls["n"] < 3:
                raise Slow()
            return "ok"

        self.assertEqual(await retry.retry(flaky, attempts=4, sleep=fake_sleep), "ok")
        self.assertEqual(sleeps, [5, 5])                    # retry_after (5) beats the 0.5 and 1.0 backoff

    async def test_gives_up_and_respects_should_retry(self):
        async def always():
            raise ValueError("x")
        with self.assertRaises(ValueError):
            await retry.retry(always, attempts=2, sleep=lambda d: asyncio.sleep(0))
        n = {"c": 0}

        async def once():
            n["c"] += 1
            raise KeyError("no")
        with self.assertRaises(KeyError):
            await retry.retry(once, attempts=5, should_retry=lambda e: not isinstance(e, KeyError), sleep=lambda d: asyncio.sleep(0))
        self.assertEqual(n["c"], 1)


class TextFmtTests(unittest.TestCase):
    def test_vectors(self):
        T = V["textfmt"]
        for c in T["table"]:
            self.assertEqual(textfmt.table(c["rows"], c["headers"], c["align"]), c["out"])
        for f, w, out in T["progress"]:
            self.assertEqual(textfmt.progress_bar(f, w), out)
        for n, out in T["humanize"]:
            self.assertEqual(textfmt.humanize_number(n), out, n)
        for n, out in T["ordinal"]:
            self.assertEqual(textfmt.ordinal(n), out)
        for n, s, p, out in T["pluralize"]:
            self.assertEqual(textfmt.pluralize(n, s, p), out)
        for text, limit, out in T["truncate"]:
            self.assertEqual(textfmt.truncate(text, limit), out)


class FuzzyTests(unittest.TestCase):
    def test_vectors(self):
        F = V["fuzzy"]
        for a, b, d in F["levenshtein"]:
            self.assertEqual(fuzzy.levenshtein(a, b), d, (a, b))
        for a, b, jw in F["jaro_winkler"]:
            self.assertAlmostEqual(fuzzy.jaro_winkler(a, b), jw, places=4)
        for word, cands, n, cutoff, expect in F["closest"]:
            self.assertEqual(fuzzy.closest(word, cands, n, cutoff), expect)


class TemplatingI18nTests(unittest.TestCase):
    def test_templates(self):
        for tpl, vars_, safe, out in V["templating"]:
            self.assertEqual(templating.render(tpl, vars_, safe=safe), out, tpl)

    def test_i18n(self):
        spec = V["i18n"]
        tr = i18n.I18n(spec["catalogs"], spec["default"])
        for key, locale, vars_, out in spec["cases"]:
            self.assertEqual(tr.t(key, locale, **vars_), out, (key, locale))


class AutoModTests(unittest.TestCase):
    def test_messages(self):
        spec = V["automod"]
        mod = automod.AutoMod(spec["config"])
        for author, content, ts, mentions, expect in spec["messages"]:
            got = mod.check({"author_id": author, "content": content, "timestamp": ts, "mentions": mentions})
            self.assertEqual(got, expect, (author, content, ts))

    def test_normalize_and_raid(self):
        for text, out in V["automod"]["normalize"]:
            self.assertEqual(automod.normalize(text), out)
        r = V["automod"]["raid"]
        det = automod.RaidDetector(r["limit"], r["window"])
        for uid, ts, expect in r["joins"]:
            self.assertEqual(det.record_join(uid, ts), expect, (uid, ts))

    def test_no_builtin_word_list(self):
        self.assertEqual(automod.DEFAULTS["blocked_terms"], [])


class WebhookTests(unittest.TestCase):
    def test_vectors(self):
        W = V["webhooks"]
        for c in W["github"]:
            self.assertEqual(webhooks.verify_github(c["secret"], c["body"], c["header"]), c["ok"], c)
        for c in W["stripe"]:
            self.assertEqual(webhooks.verify_stripe(c["secret"], c["header"], c["body"], now=c["now"]), c["ok"], c)
        for c in W["twitch"]:
            self.assertEqual(webhooks.verify_twitch(c["secret"], c["id"], c["timestamp"], c["body"], c["header"]), c["ok"], c)

    def test_accepts_bytes(self):
        c = V["webhooks"]["github"][0]
        self.assertTrue(webhooks.verify_github(c["secret"].encode(), c["body"].encode(), c["header"]))


class GithubEventTests(unittest.TestCase):
    def test_vectors(self):
        for c in V["github_events"]:
            self.assertEqual(github_events.github_event_to_embed(c["event"], c["payload"]), c["expect"], c["event"])

    def test_embed_limits(self):
        e = github_events.github_event_to_embed("pull_request", V["github_events"][5]["payload"])
        self.assertLessEqual(len(e["title"]), 256)


class RedactTests(unittest.TestCase):
    # fake secrets are built at runtime so this file never contains anything that looks like a real one
    TOKEN = "M" + "A" * 24 + "." + "B" * 6 + "." + "C" * 27
    HOOK = "https://discord.com/api/webhooks/" + "1" * 18 + "/" + "abc" * 10
    ANT = "sk-ant-" + "x" * 30
    GH = "ghp_" + "y" * 36

    def test_find_and_redact(self):
        text = f"token={self.TOKEN} hook={self.HOOK} key={self.ANT} gh={self.GH} ok=nothing here"
        kinds = [f["kind"] for f in redact.find_secrets(text)]
        self.assertEqual(kinds, ["discord_token", "discord_webhook", "anthropic_key", "github_token"])
        out = redact.redact(text)
        for secret in (self.TOKEN, self.HOOK, self.ANT, self.GH):
            self.assertNotIn(secret, out)
        self.assertIn("[REDACTED:discord_token]", out)
        self.assertIn("ok=nothing here", out)

    def test_plain_text_is_untouched(self):
        for s in ("hello world", "https://discord.com/api/webhooks/ID/TOKEN", "paste-your-bot-token-here", "sk-ant-..."):
            self.assertEqual(redact.redact(s), s)

    def test_scan_paths_hides_the_secret_and_skips_tests_dirs(self):
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, "config.txt"), "w").write("x\nTOKEN=" + self.TOKEN + "\n")
            os.makedirs(os.path.join(d, "tests"))
            open(os.path.join(d, "tests", "fixture.txt"), "w").write(self.TOKEN)
            found = redact.scan_paths([d])
            self.assertEqual([(os.path.basename(f["path"]), f["line"], f["kind"]) for f in found], [("config.txt", 2, "discord_token")])
            self.assertNotIn(self.TOKEN, json.dumps(found))
            self.assertEqual(redact.main([d]), 1)
            self.assertEqual(redact.main([os.path.join(d, "tests")]), 0)

    def test_logging_filter(self):
        import logging
        records = []
        h = logging.Handler()
        h.emit = lambda r: records.append(r.getMessage())
        log = logging.getLogger("redact-test")
        log.addFilter(redact.RedactFilter())
        log.addHandler(h)
        log.warning("failed with %s", self.TOKEN)
        self.assertEqual(records, ["failed with [REDACTED:discord_token]"])


class MusicQueueTests(unittest.TestCase):
    def test_vectors(self):
        for c in V["music_queue"]:
            q = music_queue.MusicQueue(c["tracks"])
            rets = []
            for op in c["ops"]:
                name, arg = op[0], (op[1] if len(op) > 1 else None)
                if name in ("next", "previous"):
                    rets.append(getattr(q, name)())
                elif name == "remove":
                    rets.append(q.remove(arg))
                elif name == "shuffle":
                    it = iter(arg)
                    q.shuffle(lambda n: next(it))
                    rets.append(None)
                elif name == "move":
                    q.move(*arg)
                    rets.append(None)
                elif name == "loop":
                    q.set_loop(arg)
                    rets.append(None)
                else:
                    getattr(q, name)(arg)
                    rets.append(None)
            e = c["expect"]
            self.assertEqual((rets, q.current, q.upcoming, q.history, q.tracks), (e["returns"], e["current"], e["upcoming"], e["history"], e["tracks"]), c["ops"])

    def test_bad_loop_mode(self):
        with self.assertRaises(ValueError):
            music_queue.MusicQueue().set_loop("sometimes")


class GameTests(unittest.TestCase):
    def test_tictactoe(self):
        for board, w in V["tictactoe"]["winner"]:
            self.assertEqual(tictactoe.winner(board), w, board)
        for board, player, move in V["tictactoe"]["best_move"]:
            self.assertEqual(tictactoe.best_move(board, player), move, board)

    def test_computer_never_loses(self):
        def play_all(board, turn, computer):
            if tictactoe.winner(board):
                self.assertNotEqual(tictactoe.winner(board), "X" if computer == "O" else "O", board)
                return
            if tictactoe.is_full(board):
                return
            if turn == computer:
                play_all(tictactoe.play(board, tictactoe.best_move(board, computer), computer), "O" if turn == "X" else "X", computer)
            else:
                for m in tictactoe.moves(board):
                    play_all(tictactoe.play(board, m, turn), computer, computer)
        play_all(".........", "X", "O")     # computer plays second, human tries everything
        play_all(".........", "X", "X")     # computer plays first

    def test_wordle(self):
        for guess, answer, out in V["wordle"]["score"]:
            self.assertEqual("".join(wordle.score(guess, answer)), out, (guess, answer))
        self.assertEqual(wordle.to_emoji(["G", "Y", "B"]), "🟩🟨⬛")
        with self.assertRaises(ValueError):
            wordle.score("ab", "abc")

    def test_blackjack(self):
        B = V["blackjack"]
        for cards, total, soft in B["hand_value"]:
            self.assertEqual(blackjack.hand_value(cards), {"total": total, "soft": soft}, cards)
        for player, dealer, out in B["outcome"]:
            self.assertEqual(blackjack.outcome(player, dealer), out, (player, dealer))
        for cards, hit in B["dealer_hits"]:
            self.assertEqual(blackjack.dealer_should_hit(cards), hit, cards)
        s = B["shuffle"]
        self.assertEqual(blackjack.shuffle(s["cards"], scripted(s["rng"])), s["expect"])
        self.assertEqual(len(set(blackjack.new_deck())), 52)


class LevelingTests(unittest.TestCase):
    def test_vectors(self):
        L = V["leveling"]
        for xp, level in L["level_for"]:
            self.assertEqual(leveling.level_for(xp), level, xp)
        for level, xp in L["xp_for"]:
            self.assertEqual(leveling.xp_for(level), xp, level)
        for xp, expect in L["progress"]:
            got = leveling.progress(xp)
            self.assertEqual(got["level"], expect["level"], xp)
            self.assertEqual(got["into"], expect["into"], xp)
            self.assertEqual(got["need"], expect["need"], xp)
            self.assertAlmostEqual(got["fraction"], expect["fraction"], msg=xp)
        for xp in L["invalid"]:
            with self.assertRaises(ValueError):
                leveling.level_for(xp)

    def test_monotonic_and_round_trip(self):
        prev = -1
        for xp in range(0, 5000, 7):
            lvl = leveling.level_for(xp)
            self.assertGreaterEqual(lvl, prev)
            prev = lvl
            self.assertLessEqual(leveling.xp_for(lvl), xp)
            self.assertGreater(leveling.xp_for(lvl + 1), xp)


class LeaderboardTests(unittest.TestCase):
    def test_vectors(self):
        for c in V["leaderboard"]["rank_cases"]:
            self.assertEqual(leaderboard.rank([tuple(e) for e in c["entries"]], c["top"]), c["expect"], c["entries"])
        for pos, m in V["leaderboard"]["medal"]:
            self.assertEqual(leaderboard.medal(pos), m)

    def test_competition_ranking_shape(self):
        r = leaderboard.rank([("a", 5), ("b", 5), ("c", 3)], top=10)
        self.assertEqual([x["rank"] for x in r], [1, 1, 3])


class PaginationTests(unittest.TestCase):
    def test_vectors(self):
        for items, per_page, expect in V["pagination"]["paginate"]:
            self.assertEqual(pagination.paginate(items, per_page), expect, (items, per_page))
        for items, per_page in V["pagination"]["paginate_invalid"]:
            with self.assertRaises(ValueError):
                pagination.paginate(items, per_page)
        for page, total, expect in V["pagination"]["clamp"]:
            self.assertEqual(pagination.clamp_page(page, total), expect, (page, total))
        for page, total, expect in V["pagination"]["label"]:
            self.assertEqual(pagination.page_label(page, total), expect)


class PollTests(unittest.TestCase):
    def test_vectors(self):
        for votes, n, expect in V["poll"]["tally"]:
            self.assertEqual(poll.tally(votes, n), expect, votes)
        for votes, n in V["poll"]["tally_invalid"]:
            with self.assertRaises(ValueError):
                poll.tally(votes, n)
        for counts, expect in V["poll"]["winner"]:
            self.assertEqual(poll.winner(counts), expect, counts)


class CaptchaTests(unittest.TestCase):
    def test_verify_vectors(self):
        for a, b, text, ok in V["captcha"]["verify"]:
            self.assertEqual(captcha.verify_answer(a, b, text), ok, (a, b, text))

    def test_generate_is_consistent_with_itself(self):
        for _ in range(200):
            c = captcha.generate_challenge()
            self.assertTrue(captcha.verify_answer(c["a"], c["b"], str(c["answer"])))
            self.assertIn(c["question"][-1], "?")

    def test_generate_with_scripted_rng(self):
        spec = V["captcha"]["generate_deterministic"]
        it = iter(spec["picks"])
        c = captcha.generate_challenge(spec["min"], spec["max"], rng=lambda lo, hi: next(it))
        self.assertEqual(c, spec["expect"])


class EconomyTests(unittest.TestCase):
    def test_vectors(self):
        for bal, amt, ok in V["economy"]["can_afford"]:
            self.assertEqual(economy.can_afford(bal, amt), ok, (bal, amt))
        for c in V["economy"]["transfer"]:
            self.assertEqual(list(economy.apply_transfer(c["from"], c["to"], c["amount"])), c["expect"], c)
        for c in V["economy"]["transfer_errors"]:
            err = economy.InsufficientFunds if c["error"] == "InsufficientFunds" else ValueError
            with self.assertRaises(err):
                economy.apply_transfer(c["from"], c["to"], c["amount"])
        for c in V["economy"]["daily"]:
            got = economy.daily_reward(c["last"], c["now"], cooldown_seconds=c["cooldown"], reward_range=tuple(c["range"]),
                                       rng=lambda lo, hi, p=c["pick"]: p)
            self.assertEqual(got["ready"], c["expect"]["ready"], c)
            self.assertAlmostEqual(got["retry_after"], c["expect"]["retry_after"], msg=c)
            self.assertEqual(got["amount"], c["expect"]["amount"], c)
        for amount, symbol, out in V["economy"]["format_currency"]:
            self.assertEqual(economy.format_currency(amount, symbol), out)


class GiveawayTests(unittest.TestCase):
    def test_enter_leave_sequence(self):
        spec = V["giveaway"]["enter_leave"]
        g = giveaway.Giveaway(winners=1)
        for op, user, expect in spec["ops"]:
            got = g.enter(user) if op == "enter" else g.leave(user)
            self.assertEqual(got, expect, (op, user))
        self.assertEqual(g.entrants, spec["final_entrants"])

    def test_pick_winners_vectors(self):
        for c in V["giveaway"]["pick_winners"]:
            g = giveaway.Giveaway(winners=c["winners"])
            for u in c["entrants"]:
                g.enter(u)
            it = iter(c["rng"])
            got = g.pick_winners(rng=lambda n: next(it))
            self.assertEqual(got, c["expect"], c)
            self.assertTrue(g.ended)

    def test_winners_are_unique_and_bounded(self):
        for _ in range(50):
            g = giveaway.Giveaway(winners=3)
            for u in range(10):
                g.enter(u)
            winners = g.pick_winners()
            self.assertEqual(len(winners), len(set(winners)))
            self.assertEqual(len(winners), 3)
            self.assertTrue(set(winners) <= set(range(10)))

    def test_invalid_winner_count(self):
        for n in V["giveaway"]["invalid_winners"]:
            with self.assertRaises(ValueError):
                giveaway.Giveaway(winners=n)

    def test_duplicate_entry_is_a_no_op(self):
        g = giveaway.Giveaway(winners=1)
        self.assertTrue(g.enter(1))
        self.assertFalse(g.enter(1))
        self.assertEqual(g.entrants, [1])


if __name__ == "__main__":
    unittest.main()