"""A small Discord Gateway client: connect, heartbeat, identify, resume, reconnect.

For learning and lightweight bots. For big bots use discord.py, which also handles
sharding, caching and voice. Needs:  pip install websockets

    gw = Gateway(token, intents=(1 << 0) | (1 << 9))

    @gw.on("READY")
    async def ready(data): print("Ready as", data["user"]["username"])

    @gw.on("MESSAGE_CREATE")
    async def message(data): print(data["author"]["username"], data["content"])

    asyncio.run(gw.run())
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any, Awaitable, Callable, Optional

import websockets

log = logging.getLogger("gateway")
GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json"

# Closing with one of these codes means "don't retry, fix your config".
FATAL_CLOSE_CODES = {4004, 4010, 4011, 4012, 4013, 4014}


class GatewayError(Exception):
    def __init__(self, code: int):
        super().__init__(f"Gateway closed with fatal code {code}. See the close-code table in the Reference.")
        self.code = code


class Gateway:
    def __init__(self, token: str, intents: int, *, url: str = GATEWAY_URL,
                 properties: Optional[dict] = None, presence: Optional[dict] = None):
        self.token = token
        self.intents = intents
        self.url = url
        self.properties = properties or {"os": "linux", "browser": "botbench", "device": "botbench"}
        self.presence = presence
        self.session_id: Optional[str] = None
        self.resume_url: Optional[str] = None
        self.seq: Optional[int] = None
        self._handlers: dict[str, list[Callable[[Any], Awaitable[None]]]] = {}
        self._acked = True
        self._stop = False
        self._ws = None
        self._got_ready = False

    def on(self, event: str):
        """Decorator: register an async handler for a dispatch event name, like MESSAGE_CREATE."""
        def deco(fn):
            self._handlers.setdefault(event, []).append(fn)
            return fn
        return deco

    async def _call(self, fn, payload: Any, name: str) -> None:
        try:
            await fn(payload)
        except Exception:
            log.exception("Handler for %s failed", name)

    async def _dispatch(self, name: str, data: Any) -> None:
        for fn in self._handlers.get(name, []):
            await self._call(fn, data, name)
        for fn in self._handlers.get("*", []):          # "*" handlers get {"t": name, "d": data}
            await self._call(fn, {"t": name, "d": data}, name)

    async def run(self) -> None:
        backoff = 1.0
        while not self._stop:
            code = None
            try:
                target = self.resume_url or self.url
                async with websockets.connect(target, max_size=None) as ws:
                    self._ws = ws
                    if await self._run_socket(ws):
                        backoff = 1.0
                    code = ws.close_code
            except (OSError, websockets.WebSocketException) as exc:
                log.warning("Gateway connection problem: %r", exc)
            if code in FATAL_CLOSE_CODES:
                raise GatewayError(code)
            if code in (4007, 4009):        # session unusable: start fresh
                self.session_id, self.seq, self.resume_url = None, None, None
            log.info("Reconnecting in %.0fs (close code %s)", backoff, code)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

    def stop(self) -> None:
        self._stop = True

    async def send(self, op: int, d: Any) -> None:
        await self._ws.send(json.dumps({"op": op, "d": d}))

    async def _heartbeat(self, ws, interval: float) -> None:
        await asyncio.sleep(interval * random.random())     # first beat after a jittered delay
        while True:
            if not self._acked:
                log.warning("No heartbeat ACK, reconnecting")
                await ws.close(code=4000)
                return
            self._acked = False
            await ws.send(json.dumps({"op": 1, "d": self.seq}))
            await asyncio.sleep(interval)

    async def _run_socket(self, ws) -> bool:
        """Run one connection. Returns True if we reached READY or RESUMED (so run() resets its backoff)."""
        hello = json.loads(await ws.recv())
        interval = hello["d"]["heartbeat_interval"] / 1000
        self._acked = True
        self._got_ready = False
        beat = asyncio.create_task(self._heartbeat(ws, interval))
        try:
            if self.session_id and self.seq is not None:
                await self.send(6, {"token": self.token, "session_id": self.session_id, "seq": self.seq})
            else:
                ident = {"token": self.token, "intents": self.intents, "properties": self.properties}
                if self.presence:
                    ident["presence"] = self.presence
                await self.send(2, ident)
            try:
                await self._read_loop(ws)
            except websockets.ConnectionClosed:
                # websockets raises this for close codes other than 1000/1001.
                # Swallow it so run() can read ws.close_code and decide what to do.
                pass
        finally:
            beat.cancel()
        return self._got_ready

    async def _read_loop(self, ws) -> None:
        async for raw in ws:
            msg = json.loads(raw)
            op = msg["op"]
            if msg.get("s") is not None:
                self.seq = msg["s"]
            if op == 0:
                t = msg["t"]
                if t == "READY":
                    self.session_id = msg["d"]["session_id"]
                    self.resume_url = msg["d"]["resume_gateway_url"] + "/?v=10&encoding=json"
                    self._got_ready = True
                elif t == "RESUMED":
                    self._got_ready = True
                await self._dispatch(t, msg["d"])
            elif op == 1:                       # Discord asks for a heartbeat right now
                await ws.send(json.dumps({"op": 1, "d": self.seq}))
            elif op == 7:                       # Reconnect
                await ws.close(code=4000)
                return
            elif op == 9:                       # Invalid session; d says if it can be resumed
                if not msg["d"]:
                    self.session_id, self.seq = None, None
                await asyncio.sleep(random.uniform(1, 5))
                await ws.close(code=4000)
                return
            elif op == 11:                      # Heartbeat ACK
                self._acked = True
