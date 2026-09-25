"""Rank a list of (id, score) pairs. Standard competition ranking: equal scores share a rank, and the
next distinct score skips ahead (1, 1, 3), the way sports leaderboards usually work.
"""
from __future__ import annotations

MEDALS = {1: "🥇", 2: "🥈", 3: "🥉"}


def rank(entries, top: int = 10) -> list:
    """entries: iterable of (id, score). Highest score first. Returns dicts with "rank", "id", "score"."""
    ordered = sorted(entries, key=lambda e: e[1], reverse=True)
    out = []
    prev_score, prev_rank = None, 0
    for i, (entry_id, score) in enumerate(ordered, start=1):
        r = i if score != prev_score else prev_rank
        out.append({"rank": r, "id": entry_id, "score": score})
        prev_score, prev_rank = score, r
        if len(out) >= top and (i >= len(ordered) or ordered[i][1] != score):
            break
    return out


def medal(position: int) -> str:
    """A medal emoji for 1st to 3rd place, otherwise "#N"."""
    return MEDALS.get(position, f"#{position}")
