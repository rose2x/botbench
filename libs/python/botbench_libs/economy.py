"""Pure functions for a virtual currency: no storage opinions, so any database works.

    new_from, new_to = apply_transfer(balance_a, balance_b, 100)
    amount, next_claim = daily_reward(last_claim_ts, now_ts)
"""
from __future__ import annotations

from typing import Callable, Optional, Tuple

DEFAULT_COOLDOWN = 86400          # 24 hours
DEFAULT_REWARD_RANGE = (50, 150)


class InsufficientFunds(Exception):
    pass


def can_afford(balance: int, amount: int) -> bool:
    return amount > 0 and balance >= amount


def apply_transfer(balance_from: int, balance_to: int, amount: int) -> Tuple[int, int]:
    """Returns the two new balances. Raises ValueError for a non-positive amount, InsufficientFunds if short."""
    if amount <= 0:
        raise ValueError("Transfer amount must be positive")
    if balance_from < amount:
        raise InsufficientFunds(f"Balance {balance_from} is short of {amount}")
    return balance_from - amount, balance_to + amount


def daily_reward(last_claimed_ts: Optional[float], now_ts: float, *, cooldown_seconds: float = DEFAULT_COOLDOWN,
                 reward_range: Tuple[int, int] = DEFAULT_REWARD_RANGE,
                 rng: Optional[Callable[[int, int], int]] = None) -> dict:
    """{"ready": True, "amount": N} or {"ready": False, "retry_after": seconds}. rng(lo, hi) picks the reward."""
    if last_claimed_ts is not None:
        left = cooldown_seconds - (now_ts - last_claimed_ts)
        if left > 0:
            return {"ready": False, "retry_after": left, "amount": 0}
    import random
    rng = rng or random.randint
    return {"ready": True, "retry_after": 0, "amount": rng(*reward_range)}


def format_currency(amount: int, symbol: str = "🪙") -> str:
    return f"{amount:,} {symbol}"
