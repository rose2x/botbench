"""Retry an async call with exponential backoff and jitter.

    result = await retry(lambda: fetch(), attempts=4, retry_on=(ApiError,))

If the exception has a numeric `retry_after` (seconds), the wait is at least that long.
"""
from __future__ import annotations

import asyncio
import random
from typing import Awaitable, Callable, Optional, Tuple, Type


def backoff_delays(attempts: int, base: float = 0.5, factor: float = 2.0, max_delay: float = 30.0) -> list:
    """The waits between attempts: 0.5, 1, 2, 4 ... capped at max_delay. There are attempts-1 of them."""
    return [min(max_delay, base * factor ** i) for i in range(max(attempts - 1, 0))]


async def retry(fn: Callable[[], Awaitable], *, attempts: int = 3, base: float = 0.5, factor: float = 2.0,
                max_delay: float = 30.0, jitter: float = 0.0,
                retry_on: Tuple[Type[BaseException], ...] = (Exception,),
                should_retry: Optional[Callable[[BaseException], bool]] = None,
                sleep=asyncio.sleep, rng=random.random):
    delays = backoff_delays(attempts, base, factor, max_delay)
    for i in range(attempts):
        try:
            return await fn()
        except retry_on as exc:
            if i == attempts - 1 or (should_retry and not should_retry(exc)):
                raise
            delay = delays[i]
            delay += delay * jitter * rng()
            hint = getattr(exc, "retry_after", None)
            if isinstance(hint, (int, float)):
                delay = max(delay, hint)
            await sleep(delay)
