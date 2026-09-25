"""A small async JSON client for third-party APIs.

Adds what every bot needs and forgets: a timeout, a User-Agent, a couple of
retries on network errors and 5xx, and a tiny in-memory cache so ten people
running /weather in a minute make one request instead of ten.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

import aiohttp

# Some APIs (Wikipedia, MusicBrainz, Nominatim, Scryfall, Chess.com...) require a
# real contact in the User-Agent. Change this before you go public.
DEFAULT_USER_AGENT = "BotBenchToolkit/1.0 (Discord bot; contact: you@example.com)"


class ApiError(Exception):
    """Raised when an outside API fails. `status` is 0 for network errors."""

    def __init__(self, status: int, url: str, message: str = "", retry_after: Optional[float] = None):
        super().__init__(f"HTTP {status} from {url}: {message}".strip())
        self.status = status
        self.url = url
        self.message = message
        self.retry_after = retry_after


class ApiClient:
    def __init__(self, user_agent: str = DEFAULT_USER_AGENT, timeout: float = 8.0,
                 retries: int = 2, cache_ttl: float = 60.0):
        self.user_agent = user_agent
        self.timeout = timeout
        self.retries = retries
        self.cache_ttl = cache_ttl
        self._session: Optional[aiohttp.ClientSession] = None
        self._cache: dict[Any, tuple[float, Any]] = {}

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"User-Agent": self.user_agent},
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    def _prune(self) -> None:
        now = time.monotonic()
        for key in [k for k, (exp, _) in self._cache.items() if exp <= now]:
            del self._cache[key]

    async def get_json(self, url: str, *, params: Optional[dict] = None,
                       headers: Optional[dict] = None, ttl: Optional[float] = None) -> Any:
        """GET a URL and return parsed JSON. `ttl=0` turns the cache off for this call."""
        ttl = self.cache_ttl if ttl is None else ttl
        key = (url, tuple(sorted((params or {}).items())), tuple(sorted((headers or {}).items())))
        now = time.monotonic()
        if ttl > 0:
            hit = self._cache.get(key)
            if hit and hit[0] > now:
                return hit[1]

        session = await self._get_session()
        for attempt in range(self.retries + 1):
            try:
                async with session.get(url, params=params, headers=headers) as r:
                    if r.status == 429:
                        ra = r.headers.get("Retry-After", "")
                        try:
                            retry_after = float(ra)
                        except ValueError:
                            retry_after = None
                        raise ApiError(429, url, "rate limited", retry_after)
                    if r.status >= 500 and attempt < self.retries:
                        await asyncio.sleep(0.4 * (attempt + 1))
                        continue
                    if r.status >= 400:
                        raise ApiError(r.status, url, (await r.text())[:200])
                    try:
                        # content_type=None: many APIs send JSON with the wrong header
                        data = await r.json(content_type=None)
                    except ValueError as exc:
                        raise ApiError(r.status, url, "response was not valid JSON") from exc
                    if ttl > 0:
                        if len(self._cache) > 500:
                            self._prune()
                        self._cache[key] = (now + ttl, data)
                    return data
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                if attempt < self.retries:
                    await asyncio.sleep(0.4 * (attempt + 1))
                    continue
                raise ApiError(0, url, f"network error: {exc!r}") from exc
        raise ApiError(0, url, "request failed")
