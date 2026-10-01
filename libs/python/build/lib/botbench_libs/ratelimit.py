"""In-memory rate limiters. Pass `now` (a function returning seconds) to test with a fake clock.

    bucket = TokenBucket(capacity=5, refill_per_second=1)   # bursts of 5, then 1 per second
    window = SlidingWindow(limit=3, window_seconds=10)      # 3 hits per 10 seconds per key
    cooldowns = Cooldowns(5)                                # one use per key every 5 seconds
"""
from __future__ import annotations

import time
from collections import deque
from typing import Callable, Deque, Dict


class TokenBucket:
    def __init__(self, capacity: float, refill_per_second: float, now: Callable[[], float] = time.monotonic):
        self.capacity, self.rate, self._now = capacity, refill_per_second, now
        self.tokens = float(capacity)
        self._last = now()

    def _refill(self) -> None:
        t = self._now()
        self.tokens = min(self.capacity, self.tokens + (t - self._last) * self.rate)
        self._last = t

    def try_take(self, n: float = 1) -> bool:
        self._refill()
        if self.tokens >= n - 1e-9:
            self.tokens -= n
            return True
        return False

    def wait_time(self, n: float = 1) -> float:
        """Seconds until `n` tokens will be available (0 if they are now)."""
        self._refill()
        return 0.0 if self.tokens >= n - 1e-9 else (n - self.tokens) / self.rate


class SlidingWindow:
    def __init__(self, limit: int, window_seconds: float, now: Callable[[], float] = time.monotonic):
        self.limit, self.window, self._now = limit, window_seconds, now
        self._hits: Dict[str, Deque[float]] = {}

    def hit(self, key: str = "") -> dict:
        """Count one hit. Returns {"allowed", "remaining", "retry_after"}."""
        t = self._now()
        q = self._hits.setdefault(key, deque())
        while q and q[0] <= t - self.window:
            q.popleft()
        if len(q) >= self.limit:
            return {"allowed": False, "remaining": 0, "retry_after": q[0] + self.window - t}
        q.append(t)
        if len(self._hits) > 10_000:                                   # forget idle keys
            self._hits = {k: v for k, v in self._hits.items() if v and v[-1] > t - self.window}
        return {"allowed": True, "remaining": self.limit - len(q), "retry_after": 0}


class Cooldowns:
    def __init__(self, seconds: float, now: Callable[[], float] = time.monotonic):
        self.seconds, self._now = seconds, now
        self._until: Dict[str, float] = {}

    def use(self, key: str) -> float:
        """0 if the key may go now (and starts its cooldown), otherwise the seconds left."""
        t = self._now()
        left = self._until.get(key, 0) - t
        if left > 1e-9:
            return left
        self._until[key] = t + self.seconds
        return 0
