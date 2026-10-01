"""Entry tracking and fair winner selection for a giveaway.

    g = Giveaway(winners=2)
    g.enter(101); g.enter(102); g.enter(103)
    g.pick_winners(rng=scripted_rng)     # 2 unique winners, or fewer if not enough entries

Giveaway data is meant to live in memory for the bot's process, the same as /remind: it's simple and it's
fine for a giveaway to be lost on a restart, as long as that's made clear to the person running it.
"""
from __future__ import annotations

import random
from typing import Callable, List, Optional


class Giveaway:
    def __init__(self, winners: int = 1, prize: str = ""):
        if winners < 1:
            raise ValueError("A giveaway needs at least one winner")
        self.winners = winners
        self.prize = prize
        self.entrants: List[int] = []
        self._seen = set()
        self.ended = False

    def enter(self, user_id) -> bool:
        """True if this is a new entry, False if the user already entered."""
        if user_id in self._seen:
            return False
        self._seen.add(user_id)
        self.entrants.append(user_id)
        return True

    def leave(self, user_id) -> bool:
        if user_id not in self._seen:
            return False
        self._seen.discard(user_id)
        self.entrants.remove(user_id)
        return True

    def pick_winners(self, rng: Optional[Callable[[int], int]] = None) -> List[int]:
        """Up to `winners` unique winners, chosen fairly (partial Fisher-Yates). Marks the giveaway ended."""
        rng = rng or (lambda n: random.randrange(n))
        pool = list(self.entrants)
        n = min(self.winners, len(pool))
        for i in range(len(pool) - 1, len(pool) - 1 - n, -1):
            j = rng(i + 1)
            pool[i], pool[j] = pool[j], pool[i]
        self.ended = True
        return pool[len(pool) - n:][::-1]
