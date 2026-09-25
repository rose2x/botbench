"""Offline tests. Run:  python -m unittest discover -s tests -v
They use small local fake servers, so no token or internet is needed."""
import asyncio
import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aiohttp import web
from aiohttp.test_utils import TestServer

from toolkit import apis, directory
from toolkit.api_client import ApiClient, ApiError
from toolkit.discord_rest import DiscordAPIError, DiscordREST, route_key


class DirectoryTests(unittest.TestCase):
    def test_search_and_filters(self):
        self.assertGreater(len(directory.ALL), 100)
        self.assertTrue(any(a.name == "Open-Meteo" for a in directory.search("weather")))
        self.assertTrue(all(not a.needs_key for a in directory.search("weather", only_no_key=True)))
        self.assertIn("Games", directory.types())

    def test_route_key_keeps_major_id_only(self):
        a = route_key("DELETE", "/channels/123456789012345678/messages/223456789012345678")
        b = route_key("DELETE", "/channels/123456789012345678/messages/323456789012345678")
        c = route_key("DELETE", "/channels/999999999999999999/messages/323456789012345678")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)


class UtilsTests(unittest.TestCase):
    def test_permissions_intents_invite(self):
        from toolkit import discord_utils as u
        self.assertEqual(u.permissions_to_bits(["VIEW_CHANNEL", "SEND_MESSAGES"]), 3072)
        self.assertEqual(sorted(u.bits_to_permissions(3072)), ["SEND_MESSAGES", "VIEW_CHANNEL"])
        self.assertTrue(u.has_permission(u.PERMISSIONS["ADMINISTRATOR"], "BAN_MEMBERS"))
        self.assertEqual(u.PERMISSIONS["MODERATE_MEMBERS"], 1 << 40)
        self.assertEqual(u.intents_to_bits(["GUILDS", "GUILD_MESSAGES"]), 513)
        self.assertIn("MESSAGE_CONTENT", u.PRIVILEGED_INTENTS)
        with self.assertRaises(ValueError):
            u.permissions_to_bits(["NOPE"])
        import urllib.parse as up
        q = up.parse_qs(up.urlparse(u.invite_url("123", permissions=["SEND_MESSAGES", "VIEW_CHANNEL"])).query)
        self.assertEqual(q["permissions"], ["3072"])
        self.assertEqual(q["scope"], ["bot applications.commands"])

    def test_snowflake_timestamp_text(self):
        from datetime import datetime, timezone
        from toolkit import discord_utils as u
        p = u.snowflake_parts("175928847299117063")          # example from Discord's docs
        self.assertEqual(datetime.fromtimestamp(p["timestamp_ms"] / 1000, tz=timezone.utc).isoformat(), "2016-04-30T11:18:25.796000+00:00")
        self.assertEqual((p["worker_id"], p["process_id"], p["increment"]), (1, 0, 7))
        self.assertEqual(u.timestamp(datetime.fromtimestamp(1700000000, tz=timezone.utc), "R"), "<t:1700000000:R>")
        self.assertEqual(u.neutralize_mentions("hi @everyone <@123>"), "hi @\u200beveryone <@\u200b123>")
        long = " ".join(["word"] * 700)
        parts = u.chunk_message(long, 2000)
        self.assertTrue(len(parts) >= 2 and all(len(x) <= 2000 for x in parts))
        self.assertEqual(" ".join(parts), long)

    def test_embed_and_components(self):
        from toolkit import discord_utils as u
        e = u.raw_embed(title="x" * 300, color="#5865F2", fields=[{"name": "a", "value": "b", "inline": True}])
        self.assertEqual((len(e["title"]), e["color"]), (256, 0x5865F2))
        with self.assertRaises(ValueError):
            u.raw_embed(description="y" * 4096, fields=[{"name": "n" * 256, "value": "v" * 1024}] * 5)
        row = u.action_row(u.button("A", custom_id="a"), u.button("Docs", url="https://example.com"))
        self.assertEqual(row["components"][1]["style"], 5)
        with self.assertRaises(ValueError):
            u.action_row(u.string_select("s", [{"label": "a", "value": "a"}]), u.button("x", custom_id="x"))


class ClaudeTests(unittest.IsolatedAsyncioTestCase):
    async def test_request_shape_parsing_and_errors(self):
        from toolkit.claude import ClaudeClient
        seen = {}

        async def messages(request):
            seen["path"], seen["headers"], seen["body"] = request.path, dict(request.headers), await request.json()
            mode = request.headers.get("x-api-key")
            if mode == "bad":
                return web.json_response({"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}, status=401)
            if mode == "empty":
                return web.json_response({"content": []})
            return web.json_response({"content": [{"type": "text", "text": "Hello "}, {"type": "text", "text": "there"}], "stop_reason": "end_turn"})

        app = web.Application()
        app.router.add_post("/v1/messages", messages)
        server = TestServer(app)
        await server.start_server()
        base = str(server.make_url("")).rstrip("/")
        try:
            c = ClaudeClient("good", base=base, model="test-model")
            self.assertEqual(await c.ask("hi", system="be brief", max_tokens=50), "Hello there")
            self.assertEqual(seen["path"], "/v1/messages")
            self.assertEqual(seen["headers"]["anthropic-version"], "2023-06-01")
            self.assertEqual(seen["body"], {"model": "test-model", "max_tokens": 50, "system": "be brief", "messages": [{"role": "user", "content": "hi"}]})
            bad, empty = ClaudeClient("bad", base=base), ClaudeClient("empty", base=base)
            with self.assertRaises(ApiError) as ctx:
                await bad.ask("hi")
            self.assertEqual((ctx.exception.status, ctx.exception.message), (401, "invalid x-api-key"))
            with self.assertRaises(LookupError):
                await empty.ask("hi")
            for client in (c, bad, empty):
                await client.close()
        finally:
            await server.close()

    def test_usage_limiter_daily_reset_and_refund(self):
        from datetime import datetime, timedelta, timezone
        from toolkit.claude import UsageLimiter
        clock = {"t": datetime(2026, 9, 21, 23, 0, tzinfo=timezone.utc)}
        lim = UsageLimiter(2, now=lambda: clock["t"])
        self.assertEqual(lim.allow(1), (True, 1))
        self.assertEqual(lim.allow(1), (True, 0))
        self.assertEqual(lim.allow(1), (False, 0))
        self.assertEqual(lim.allow(2), (True, 1))                  # per user
        lim.refund(1)
        self.assertEqual(lim.allow(1), (True, 0))
        clock["t"] += timedelta(hours=2)                            # next UTC day
        self.assertEqual(lim.allow(1), (True, 1))


class TicketAndRoleTests(unittest.IsolatedAsyncioTestCase):
    def test_ticket_names_round_trip(self):
        from types import SimpleNamespace
        from cogs.tickets import owner_id, ticket_name
        user = SimpleNamespace(name="Alice_O'Neil!", id=123456789012345678)
        name = ticket_name(user)
        self.assertEqual(name, "ticket-alice-o-neil-123456789012345678")
        self.assertEqual(owner_id(name), 123456789012345678)
        self.assertIsNone(owner_id("general"))
        self.assertIsNone(owner_id("ticket-x-123"))

    def test_role_safety_rules(self):
        import discord
        from types import SimpleNamespace
        from cogs.roles import assign_problem

        def role(perms=None, managed=False, default=False, position=1):
            return SimpleNamespace(is_default=lambda: default, managed=managed, position=position,
                                   permissions=discord.Permissions(**(perms or {"send_messages": True})))
        self.assertIsNone(assign_problem(role(), 5))
        self.assertIn("@everyone", assign_problem(role(default=True), 5))
        self.assertIn("managed", assign_problem(role(managed=True), 5))
        self.assertIn("powerful", assign_problem(role({"administrator": True}), 5))
        self.assertIn("powerful", assign_problem(role({"ban_members": True}), 5))
        self.assertIn("above", assign_problem(role(position=5), 5))

    async def test_role_toggle_callback_adds_removes_and_refuses(self):
        import discord
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock
        from cogs.roles import RoleToggle

        role = SimpleNamespace(id=42, name="Gamer", position=1, managed=False, is_default=lambda: False,
                               permissions=discord.Permissions(send_messages=True))
        member = MagicMock(spec=discord.Member)
        member.roles = []
        member.add_roles, member.remove_roles = AsyncMock(), AsyncMock()
        guild = MagicMock()
        guild.get_role.return_value = role
        guild.me.top_role.position = 10
        interaction = MagicMock()
        interaction.guild, interaction.user = guild, member
        interaction.response.send_message = AsyncMock()

        item = RoleToggle(42, "Gamer")
        await item.callback(interaction)
        member.add_roles.assert_awaited_once()
        self.assertIn("now have", interaction.response.send_message.await_args.args[0])

        member.roles = [role]
        await item.callback(interaction)
        member.remove_roles.assert_awaited_once()

        role.permissions = discord.Permissions(administrator=True)   # someone made the role dangerous later
        member.roles = []
        member.add_roles.reset_mock()
        await item.callback(interaction)
        member.add_roles.assert_not_awaited()

    async def test_all_cogs_load_and_persistent_items_register(self):
        import pathlib
        import discord
        from discord.ext import commands
        os.environ["ANTHROPIC_API_KEY"] = "test-key"
        root = pathlib.Path(__file__).resolve().parent.parent
        bot = commands.Bot(command_prefix="!", intents=discord.Intents.default())
        try:
            for p in sorted((root / "cogs").glob("*.py")):
                await bot.load_extension(f"cogs.{p.stem}")
            names = {c.name for c in bot.tree.get_commands()}
            self.assertGreaterEqual(len(names), 61)
            self.assertTrue({"ask", "ticketpanel", "ticketclose", "rolepanel"} <= names)
            for c in bot.tree.get_commands():
                d = c.to_dict(bot.tree)
                self.assertTrue(len(d["name"]) <= 32 and len(d["description"]) <= 100, d["name"])
        finally:
            await bot.close()
            os.environ.pop("ANTHROPIC_API_KEY", None)


class EconomyGiveawayVerifyTests(unittest.IsolatedAsyncioTestCase):
    async def test_economy_cog_balance_daily_pay_richest(self):
        import discord
        import pathlib
        from discord.ext import commands
        root = pathlib.Path(__file__).resolve().parent.parent
        bot = commands.Bot(command_prefix="!", intents=discord.Intents.default())
        try:
            await bot.load_extension("cogs.economy")
            cog = bot.get_cog("Economy")
            await cog._set_balance(1, 100, 500)
            bal, last = await cog._row(1, 100)
            self.assertEqual((bal, last), (500, None))                # last_daily untouched (None passed through)

            from botbench_libs.economy import apply_transfer
            new_a, new_b = apply_transfer(500, 0, 200)
            await cog._set_balance(1, 100, new_a)
            await cog._set_balance(1, 200, new_b)
            self.assertEqual((await cog._row(1, 100))[0], 300)
            self.assertEqual((await cog._row(1, 200))[0], 200)

            rows = [(100, 300), (200, 200)]
            from botbench_libs.leaderboard import rank
            self.assertEqual(rank(rows, top=10)[0]["id"], 100)
        finally:
            await bot.close()
            import os
            if os.path.exists("bot.db"):
                os.remove("bot.db")

    async def test_giveaway_pick_winners_and_embed(self):
        from cogs.giveaway import giveaway_embed
        from botbench_libs.giveaway import Giveaway

        g = Giveaway(winners=2, prize="a plushie")
        for u in (1, 2, 3):
            g.enter(u)
        e = giveaway_embed(g, ends_at=2_000_000_000.0)
        self.assertIn("plushie", e.title)
        self.assertIn("3 entered", e.description)

        winners = g.pick_winners(rng=lambda n: 0)
        self.assertTrue(g.ended)
        e2 = giveaway_embed(g, None, ended=True, winners=winners)
        self.assertIn("Winner", e2.description)

        empty = Giveaway(winners=1, prize="nothing")
        e3 = giveaway_embed(empty, None, ended=True, winners=[])
        self.assertIn("Nobody entered", e3.description)

    async def test_giveaway_enter_button_handler(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock
        from cogs.giveaway import handle_enter
        from botbench_libs.giveaway import Giveaway

        g = Giveaway(winners=1, prize="x")
        active = {555: g}
        ends_at = {555: 2_000_000_000.0}

        def mk_interaction(user_id):
            msg = MagicMock()
            msg.id = 555
            msg.edit = AsyncMock()
            i = MagicMock()
            i.message = msg
            i.user = SimpleNamespace(id=user_id)
            i.response.send_message = AsyncMock()
            return i

        i1 = mk_interaction(101)
        await handle_enter(i1, active, ends_at)
        i1.response.send_message.assert_awaited_once()
        self.assertIn("entered", i1.response.send_message.await_args.args[0])
        i1.message.edit.assert_awaited_once()

        i2 = mk_interaction(101)                                    # same user again
        await handle_enter(i2, active, ends_at)
        self.assertIn("already entered", i2.response.send_message.await_args.args[0])

        i3 = mk_interaction(202)
        i3.message.id = 999                                          # a giveaway not in `active` (bot restarted)
        await handle_enter(i3, active, ends_at)
        self.assertIn("lost", i3.response.send_message.await_args.args[0])

    async def test_verify_modal_flow(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock
        import discord
        from cogs.verify import CaptchaModal

        modal = CaptchaModal(role_id=42, challenge={"question": "3 + 4 = ?", "a": 3, "b": 4, "answer": 7})
        self.assertTrue(modal.custom_id.startswith("verify:submit:42:3:4"))

        role = SimpleNamespace(id=42, name="Verified", managed=False, position=1, is_default=lambda: False,
                               permissions=discord.Permissions(send_messages=True))
        member = MagicMock()
        member.roles = []
        member.add_roles = AsyncMock()
        guild = MagicMock()
        guild.get_role.return_value = role
        guild.me.top_role.position = 10
        interaction = MagicMock()
        interaction.guild = guild
        interaction.user = member
        interaction.response.send_message = AsyncMock()

        modal.answer._value = "8"                                    # wrong answer
        await modal.on_submit(interaction)
        member.add_roles.assert_not_awaited()
        self.assertIn("not right", interaction.response.send_message.await_args.args[0])

        modal.answer._value = " 7 "                                   # right answer, with whitespace
        await modal.on_submit(interaction)
        member.add_roles.assert_awaited_once()
        self.assertIn("Correct", interaction.response.send_message.await_args.args[0])

        member.roles = [role]                                         # already verified
        member.add_roles.reset_mock()
        await modal.on_submit(interaction)
        member.add_roles.assert_not_awaited()
        self.assertIn("already verified", interaction.response.send_message.await_args.args[0])

    async def test_verify_refuses_dangerous_role(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock
        import discord
        from cogs.verify import CaptchaModal

        modal = CaptchaModal(role_id=42, challenge={"question": "1 + 1 = ?", "a": 1, "b": 1, "answer": 2})
        modal.answer._value = "2"
        role = SimpleNamespace(id=42, name="Admin", managed=False, position=1, is_default=lambda: False,
                               permissions=discord.Permissions(administrator=True))
        member = MagicMock()
        member.roles = []
        member.add_roles = AsyncMock()
        guild = MagicMock()
        guild.get_role.return_value = role
        guild.me.top_role.position = 10
        interaction = MagicMock()
        interaction.guild, interaction.user = guild, member
        interaction.response.send_message = AsyncMock()
        await modal.on_submit(interaction)
        member.add_roles.assert_not_awaited()
        self.assertIn("powerful", interaction.response.send_message.await_args.args[0])


class RestTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = []
        self.rate_limited_once = False

        async def send(request):
            self.calls.append((request.method, request.path, dict(request.headers)))
            if not self.rate_limited_once:
                self.rate_limited_once = True
                return web.json_response({"message": "You are being rate limited.", "retry_after": 0.05, "global": False}, status=429)
            body = await request.json()
            return web.json_response({"id": "1", "content": body.get("content")})

        async def forbidden(request):
            return web.json_response({"code": 50013, "message": "Missing Permissions"}, status=403)

        async def no_content(request):
            return web.Response(status=204)

        async def limited_bucket(request):
            return web.json_response({"ok": True}, headers={"X-RateLimit-Remaining": "0", "X-RateLimit-Reset-After": "0.2"})

        app = web.Application()
        app.router.add_post("/api/v10/channels/{c}/messages", send)
        app.router.add_delete("/api/v10/guilds/{g}/members/{u}", forbidden)
        app.router.add_put("/api/v10/guilds/{g}/bans/{u}", no_content)
        app.router.add_get("/api/v10/users/@me", limited_bucket)
        self.server = TestServer(app)
        await self.server.start_server()
        self.rest = DiscordREST("TOKEN", base=str(self.server.make_url("/api/v10")))

    async def asyncTearDown(self):
        await self.rest.close()
        await self.server.close()

    async def test_send_message_retries_after_429_and_sends_headers(self):
        msg = await self.rest.send_message("123456789012345678", "hi")
        self.assertEqual(msg["content"], "hi")
        self.assertEqual(len(self.calls), 2)                       # first 429, then success
        headers = self.calls[-1][2]
        self.assertEqual(headers["Authorization"], "Bot TOKEN")
        self.assertIn("DiscordBot", headers["User-Agent"])

    async def test_error_has_discord_code(self):
        with self.assertRaises(DiscordAPIError) as ctx:
            await self.rest.kick("123456789012345678", "223456789012345678", reason="test")
        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(ctx.exception.code, 50013)

    async def test_204_returns_none(self):
        self.assertIsNone(await self.rest.ban("123456789012345678", "223456789012345678", reason="Sp\u00e4m"))

    async def test_waits_when_bucket_is_empty(self):
        await self.rest.get_me()
        t = time.monotonic()
        await self.rest.get_me()                                   # must wait ~0.2s
        self.assertGreaterEqual(time.monotonic() - t, 0.15)


class ApiClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_cache_retry_and_errors(self):
        hits = {"n": 0, "flaky": 0}

        async def count(request):
            hits["n"] += 1
            return web.Response(text='{"n": %d}' % hits["n"], content_type="text/html")   # wrong content-type on purpose

        async def flaky(request):
            hits["flaky"] += 1
            if hits["flaky"] < 2:
                return web.Response(status=503)
            return web.json_response({"ok": True})

        async def missing(request):
            return web.Response(status=404, text="nope")

        app = web.Application()
        app.router.add_get("/count", count)
        app.router.add_get("/flaky", flaky)
        app.router.add_get("/missing", missing)
        server = TestServer(app)
        await server.start_server()
        client = ApiClient(retries=2, cache_ttl=30)
        try:
            self.assertEqual((await client.get_json(str(server.make_url("/count"))))["n"], 1)
            self.assertEqual((await client.get_json(str(server.make_url("/count"))))["n"], 1)      # cached
            self.assertEqual((await client.get_json(str(server.make_url("/count")), ttl=0))["n"], 2)
            self.assertEqual(await client.get_json(str(server.make_url("/flaky")), ttl=0), {"ok": True})
            with self.assertRaises(ApiError) as ctx:
                await client.get_json(str(server.make_url("/missing")))
            self.assertEqual(ctx.exception.status, 404)
        finally:
            await client.close()
            await server.close()


class WrapperParsingTests(unittest.IsolatedAsyncioTestCase):
    """Feed canned API responses to the wrappers to check the parsing."""

    async def asyncSetUp(self):
        self.real = apis.client.get_json
        self.responses = []

        async def fake(url, **kw):
            self.responses.append(url)
            return self.canned[url.split("?")[0]] if url.split("?")[0] in self.canned else self.canned["*"]
        apis.client.get_json = fake
        self.canned = {}

    async def asyncTearDown(self):
        apis.client.get_json = self.real

    async def test_weather_for_city(self):
        self.canned = {
            "https://geocoding-api.open-meteo.com/v1/search": {"results": [{"name": "Tokyo", "latitude": 35.6, "longitude": 139.7, "country": "Japan", "admin1": "Tokyo"}]},
            "https://api.open-meteo.com/v1/forecast": {"current": {"temperature_2m": 22.5, "apparent_temperature": 23, "relative_humidity_2m": 60, "wind_speed_10m": 9.1, "weather_code": 2}},
        }
        w = await apis.weather_for_city("Tokyo")
        self.assertEqual((w["name"], w["summary"], w["temp_c"]), ("Tokyo", "Partly cloudy", 22.5))

    async def test_trivia_unescapes_html(self):
        self.canned = {"https://opentdb.com/api.php": {"response_code": 0, "results": [
            {"category": "Science &amp; Nature", "difficulty": "easy", "question": "What&#039;s H2O?", "correct_answer": "Water", "incorrect_answers": ["Fire", "Air", "Soil"]}]}}
        q = await apis.trivia()
        self.assertEqual(q["question"], "What's H2O?")
        self.assertEqual(q["category"], "Science & Nature")

    async def test_joke_twopart_uses_spoiler(self):
        self.canned = {"*": {"error": False, "type": "twopart", "setup": "Why?", "delivery": "Because."}}
        self.assertIn("||Because.||", await apis.joke("Programming"))

    async def test_empty_results_raise_lookup_error(self):
        self.canned = {"*": {"results": []}}
        with self.assertRaises(LookupError):
            await apis.geocode("Nowhereville")

    async def test_github_repo_validates_input(self):
        with self.assertRaises(LookupError):
            await apis.github_repo("../../etc/passwd")


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_identify_dispatch_resume_and_fatal_close(self):
        import websockets
        from toolkit.gateway import Gateway, GatewayError

        log = []

        beats = {"n": 0}

        async def close_later(ws, delay, code):
            await asyncio.sleep(delay)
            await ws.close(code=code)

        async def handler(ws):
            await ws.send(json.dumps({"op": 10, "d": {"heartbeat_interval": 40}}))
            try:
                await serve(ws)
            except websockets.ConnectionClosed:
                pass

        async def serve(ws):
            async for raw in ws:
                msg = json.loads(raw)
                if msg["op"] == 1:
                    beats["n"] += 1
                    await ws.send(json.dumps({"op": 11, "d": None}))          # heartbeat ACK
                elif msg["op"] == 2:
                    log.append("identify")
                    await ws.send(json.dumps({"op": 0, "s": 1, "t": "READY", "d": {"session_id": "abc", "resume_gateway_url": f"ws://127.0.0.1:{port}", "user": {"username": "bot"}}}))
                    await ws.send(json.dumps({"op": 0, "s": 2, "t": "MESSAGE_CREATE", "d": {"content": "first", "author": {"username": "u"}}}))
                    asyncio.create_task(close_later(ws, 0.2, 4000))          # resumable close
                elif msg["op"] == 6:
                    log.append(f"resume seq={msg['d']['seq']} session={msg['d']['session_id']}")
                    await ws.send(json.dumps({"op": 0, "s": 3, "t": "RESUMED", "d": {}}))
                    await ws.send(json.dumps({"op": 0, "s": 4, "t": "MESSAGE_CREATE", "d": {"content": "second", "author": {"username": "u"}}}))
                    asyncio.create_task(close_later(ws, 0.15, 4014))         # fatal: disallowed intents

        server = await websockets.serve(handler, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        gw = Gateway("TOKEN", 1 << 0, url=f"ws://127.0.0.1:{port}")
        seen = []

        @gw.on("MESSAGE_CREATE")
        async def on_message(d):
            seen.append(d["content"])

        try:
            with self.assertRaises(GatewayError) as ctx:
                await asyncio.wait_for(gw.run(), timeout=10)
            self.assertEqual(ctx.exception.code, 4014)
        finally:
            server.close()
            await server.wait_closed()
        self.assertGreaterEqual(beats["n"], 2)                      # heartbeats were sent and ACKed
        self.assertEqual(seen, ["first", "second"])
        self.assertEqual(log, ["identify", "resume seq=2 session=abc"])


class HttpInteractionTests(unittest.TestCase):
    def test_signature_check(self):
        from nacl.signing import SigningKey
        from toolkit.http_interactions import create_app, message

        key = SigningKey.generate()
        pub = key.verify_key.encode().hex()
        app = create_app(pub, {"ping": lambda data: message("Pong")})
        client = app.test_client()

        def post(payload, good=True):
            body = json.dumps(payload).encode()
            ts = "1700000000"
            sig = key.sign(ts.encode() + body).signature.hex() if good else "00" * 64
            return client.post("/interactions", data=body, headers={"X-Signature-Ed25519": sig, "X-Signature-Timestamp": ts, "Content-Type": "application/json"})

        self.assertEqual(post({"type": 1}).get_json(), {"type": 1})
        self.assertEqual(post({"type": 2, "data": {"name": "ping"}}).get_json()["data"]["content"], "Pong")
        self.assertEqual(post({"type": 1}, good=False).status_code, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
