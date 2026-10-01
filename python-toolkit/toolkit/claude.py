"""A small async client for the Claude API (Anthropic Messages API).

    client = ClaudeClient(os.environ["ANTHROPIC_API_KEY"])
    answer = await client.ask("What is a slash command?", system="Answer in one sentence.")

The default model is a small, fast one to keep bot costs low. Change it with CLAUDE_MODEL,
or the `model` argument. See https://docs.claude.com for current model names and prices.
Every call costs money, so put cooldowns and a daily cap in front of it (cogs/ai.py does).
"""
from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from typing import Callable, Optional

import aiohttp

from .api_client import ApiError

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
API_VERSION = "2023-06-01"


class ClaudeClient:
    def __init__(self, api_key: str, *, model: Optional[str] = None, base: str = "https://api.anthropic.com",
                 timeout: float = 60.0):
        self.api_key = api_key
        self.model = model or os.getenv("CLAUDE_MODEL") or DEFAULT_MODEL
        self.base = base.rstrip("/")
        self.timeout = timeout
        self._session: Optional[aiohttp.ClientSession] = None

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def ask(self, prompt: str, *, system: Optional[str] = None, max_tokens: int = 600) -> str:
        """Send one user message and return the text of the reply."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout))
        body: dict = {"model": self.model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}
        if system:
            body["system"] = system
        url = f"{self.base}/v1/messages"
        headers = {"x-api-key": self.api_key, "anthropic-version": API_VERSION, "content-type": "application/json"}
        try:
            async with self._session.post(url, json=body, headers=headers) as r:
                text = await r.text()
                if r.status >= 400:
                    try:
                        message = json.loads(text)["error"]["message"]
                    except (ValueError, KeyError, TypeError):
                        message = text[:200]
                    raise ApiError(r.status, url, message)
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            raise ApiError(0, url, f"network error: {exc!r}") from exc
        data = json.loads(text)
        parts = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
        if not parts:
            raise LookupError("The AI returned an empty answer.")
        return "".join(parts).strip()


class UsageLimiter:
    """Allow each user N calls per UTC day. In memory: resets when the bot restarts."""

    def __init__(self, per_day: int, now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)):
        self.per_day = per_day
        self._now = now
        self._day = self._now().date()
        self._counts: dict[int, int] = defaultdict(int)

    def allow(self, user_id: int) -> tuple[bool, int]:
        """Returns (allowed, calls_left_after_this_one). Counts the call if allowed."""
        today = self._now().date()
        if today != self._day:
            self._day, self._counts = today, defaultdict(int)
        if self._counts[user_id] >= self.per_day:
            return False, 0
        self._counts[user_id] += 1
        return True, self.per_day - self._counts[user_id]

    def refund(self, user_id: int) -> None:
        """Give a call back (for example when the API failed and the user got nothing)."""
        if self._counts[user_id] > 0:
            self._counts[user_id] -= 1
