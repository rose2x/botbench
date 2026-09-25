"""The XP curve shared by both bots' leveling systems, so the math lives in one place.

Level N needs level_xp(N) = 50 * N^2 total XP. Pick your own curve by changing FACTOR.
"""
from __future__ import annotations

FACTOR = 50


def level_for(xp: int) -> int:
    """The level reached with this much total XP."""
    if xp < 0:
        raise ValueError("xp can't be negative")
    return int((xp / FACTOR) ** 0.5)


def xp_for(level: int) -> int:
    """The total XP needed to reach `level`."""
    if level < 0:
        raise ValueError("level can't be negative")
    return FACTOR * level * level


def progress(xp: int) -> dict:
    """{"level", "into": xp earned in the current level, "need": xp the current level spans, "fraction"}."""
    level = level_for(xp)
    into = xp - xp_for(level)
    need = xp_for(level + 1) - xp_for(level)
    return {"level": level, "into": into, "need": need, "fraction": into / need if need else 0.0}
