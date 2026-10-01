"""Blackjack rules. Cards are strings like "AS", "10H", "KD" (rank then suit S, H, D, C).

The dealer stands on all 17s. `outcome` compares a finished player hand with the dealer's.
"""
from __future__ import annotations

import random
from typing import Callable, List

RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
SUITS = ["S", "H", "D", "C"]


def new_deck() -> List[str]:
    return [r + s for s in SUITS for r in RANKS]


def shuffle(cards: List[str], rng: Callable[[int], int] = lambda n: random.randrange(n)) -> List[str]:
    """Returns a shuffled copy (Fisher-Yates). rng(n) gives an int in [0, n)."""
    out = list(cards)
    for i in range(len(out) - 1, 0, -1):
        j = rng(i + 1)
        out[i], out[j] = out[j], out[i]
    return out


def card_value(card: str) -> int:
    rank = card[:-1]
    return 11 if rank == "A" else 10 if rank in ("J", "Q", "K", "10") else int(rank)


def hand_value(cards: List[str]) -> dict:
    """{"total": best total without busting if possible, "soft": True if an ace is counted as 11}."""
    total = sum(card_value(c) for c in cards)
    aces = sum(1 for c in cards if c[:-1] == "A")
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return {"total": total, "soft": aces > 0 and total <= 21}


def is_blackjack(cards: List[str]) -> bool:
    return len(cards) == 2 and hand_value(cards)["total"] == 21


def is_bust(cards: List[str]) -> bool:
    return hand_value(cards)["total"] > 21


def dealer_should_hit(cards: List[str]) -> bool:
    return hand_value(cards)["total"] < 17


def outcome(player: List[str], dealer: List[str]) -> str:
    """"player_blackjack", "player", "dealer" or "push"."""
    if is_bust(player):
        return "dealer"
    p_bj, d_bj = is_blackjack(player), is_blackjack(dealer)
    if p_bj and d_bj:
        return "push"
    if p_bj:
        return "player_blackjack"
    if d_bj:
        return "dealer"
    if is_bust(dealer):
        return "player"
    p, d = hand_value(player)["total"], hand_value(dealer)["total"]
    return "player" if p > d else "dealer" if d > p else "push"
