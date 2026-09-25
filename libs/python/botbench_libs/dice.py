"""Dice notation: "2d6+3", "d20", "4d6kh3" (keep highest 3), "2d20kl1" (keep lowest 1), "1d8+2d6-1".

    roll("4d6kh3")["total"]
    roll("2d20kh1", rng=lambda sides: 7)     # inject your own randomness for tests

Limits keep chat commands safe: up to 100 dice, 1000 sides and 10 terms.
"""
from __future__ import annotations

import random
import re
from typing import Callable, Optional

MAX_DICE, MAX_SIDES, MAX_TERMS = 100, 1000, 10
_TERM = re.compile(r"^(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))$")


def roll(expression: str, rng: Optional[Callable[[int], int]] = None) -> dict:
    """Roll an expression. `rng(sides)` must return an int from 1 to sides. Raises ValueError on bad input."""
    rng = rng or (lambda sides: random.randint(1, sides))
    expr = str(expression).lower().replace(" ", "")
    if not expr:
        raise ValueError("Empty dice expression")
    tokens = re.findall(r"[+-]?[^+-]+", expr)
    if "".join(tokens) != expr:
        raise ValueError(f"Can't read dice expression: {expression!r}")
    if len(tokens) > MAX_TERMS:
        raise ValueError(f"Too many terms (max {MAX_TERMS})")
    terms, total = [], 0
    for token in tokens:
        sign = -1 if token.startswith("-") else 1
        body = token.lstrip("+-")
        m = _TERM.match(body)
        if not m:
            raise ValueError(f"Can't read dice term: {body!r}")
        if m.group(5) is not None:
            value = int(m.group(5))
            terms.append({"text": body, "kind": "const", "sign": sign, "rolls": [], "kept": None, "subtotal": sign * value})
            total += sign * value
            continue
        n = int(m.group(1)) if m.group(1) else 1
        sides = int(m.group(2))
        if not 1 <= n <= MAX_DICE:
            raise ValueError(f"Roll between 1 and {MAX_DICE} dice")
        if not 1 <= sides <= MAX_SIDES:
            raise ValueError(f"Dice need between 1 and {MAX_SIDES} sides")
        rolls = [rng(sides) for _ in range(n)]
        kept = None
        if m.group(3):
            k = int(m.group(4))
            if not 1 <= k <= n:
                raise ValueError("You can only keep between 1 and all of the dice")
            kept = sorted(rolls, reverse=(m.group(3) == "h"))[:k]
        subtotal = sign * sum(kept if kept is not None else rolls)
        terms.append({"text": body, "kind": "dice", "sign": sign, "rolls": rolls, "kept": kept, "subtotal": subtotal})
        total += subtotal
    return {"expression": expr, "total": total, "terms": terms}
