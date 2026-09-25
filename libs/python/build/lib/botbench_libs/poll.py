"""Tally votes for a single-choice poll: {user_id: option_index} -> counts per option."""
from __future__ import annotations

from typing import Dict, List, Optional


def tally(votes: Dict, num_options: int) -> List[int]:
    counts = [0] * num_options
    for choice in votes.values():
        if not 0 <= choice < num_options:
            raise ValueError(f"Vote {choice!r} is out of range for {num_options} options")
        counts[choice] += 1
    return counts


def winner(counts: List[int]) -> Optional[int]:
    """The index of the option with the most votes, or None if there are no votes or a tie for first."""
    if not counts or max(counts) == 0:
        return None
    best = max(counts)
    leaders = [i for i, c in enumerate(counts) if c == best]
    return leaders[0] if len(leaders) == 1 else None
