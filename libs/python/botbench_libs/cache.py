"""A TTL + LRU cache and an async memoize decorator (concurrent calls share one in-flight request)."""
from __future__ import annotations

import asyncio
import functools
import time
from collections import OrderedDict
from typing import Any, Callable, Optional

_MISSING = object()


class TTLCache:
    def __init__(self, maxsize: int = 128, ttl: float = 60.0, now: Callable[[], float] = time.monotonic):
        self.maxsize, self.ttl, self._now = maxsize, ttl, now
        self._data: "OrderedDict[Any, tuple[float, Any]]" = OrderedDict()

    def get(self, key, default=None):
        item = self._data.get(key)
        if item is None:
            return default
        if item[0] <= self._now():
            del self._data[key]
            return default
        self._data.move_to_end(key)
        return item[1]

    def has(self, key) -> bool:
        return self.get(key, _MISSING) is not _MISSING

    def set(self, key, value, ttl: Optional[float] = None) -> None:
        self._data[key] = (self._now() + (self.ttl if ttl is None else ttl), value)
        self._data.move_to_end(key)
        while len(self._data) > self.maxsize:
            self._data.popitem(last=False)

    def delete(self, key) -> None:
        self._data.pop(key, None)

    def clear(self) -> None:
        self._data.clear()

    def __len__(self) -> int:
        return len(self._data)


def memoize_async(ttl: float = 60.0, maxsize: int = 128, key: Optional[Callable[..., Any]] = None):
    """Cache an async function's results for `ttl` seconds. Exceptions are not cached."""
    def deco(fn):
        cache = TTLCache(maxsize, ttl)
        inflight: dict = {}

        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            k = key(*args, **kwargs) if key else (args, tuple(sorted(kwargs.items())))
            hit = cache.get(k, _MISSING)
            if hit is not _MISSING:
                return hit
            if k in inflight:
                return await inflight[k]
            task = asyncio.ensure_future(fn(*args, **kwargs))
            inflight[k] = task
            try:
                value = await task
                cache.set(k, value)
                return value
            finally:
                inflight.pop(k, None)

        wrapper.cache = cache
        return wrapper
    return deco
