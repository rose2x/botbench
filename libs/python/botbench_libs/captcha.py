"""A simple math captcha for a verification gate: no images, works fine in a Discord modal.

    c = generate_challenge()                 # {"question": "7 + 12 = ?", "a": 7, "b": 12, "answer": 19}
    verify_answer(c["a"], c["b"], "19")       # True

Because a and b travel in the modal's custom_id (see cogs/verify.py), nothing needs to be stored between
showing the question and checking the answer, so verification survives a bot restart.
"""
from __future__ import annotations

import random
from typing import Callable, Optional


def generate_challenge(min_value: int = 1, max_value: int = 20, rng: Optional[Callable[[int, int], int]] = None) -> dict:
    rng = rng or random.randint
    a, b = rng(min_value, max_value), rng(min_value, max_value)
    if rng is random.randint and random.random() < 0.5:      # sometimes subtract instead of add
        a, b = max(a, b), min(a, b)
        return {"question": f"{a} - {b} = ?", "a": a, "b": -b, "answer": a - b}
    return {"question": f"{a} + {b} = ?", "a": a, "b": b, "answer": a + b}


def verify_answer(a: int, b: int, user_input: str) -> bool:
    """Recomputes a + b and compares it with the user's answer. Whitespace and a leading + are ignored."""
    text = str(user_input).strip()
    if text.startswith("+"):
        text = text[1:].strip()
    try:
        given = int(text)
    except ValueError:
        return False
    return given == a + b
