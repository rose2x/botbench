"""Score a Wordle-style guess. Returns one letter per position: "G" right place, "Y" wrong place, "B" not in the word.

Repeated letters are handled the way Wordle does: a letter is only marked as many times as it appears in the answer.
"""
from __future__ import annotations

from collections import Counter
from typing import List


def score(guess: str, answer: str) -> List[str]:
    guess, answer = guess.lower(), answer.lower()
    if len(guess) != len(answer):
        raise ValueError("The guess must be the same length as the answer")
    result = ["B"] * len(answer)
    remaining = Counter()
    for i, (g, a) in enumerate(zip(guess, answer)):
        if g == a:
            result[i] = "G"
        else:
            remaining[a] += 1
    for i, g in enumerate(guess):
        if result[i] == "B" and remaining[g] > 0:
            result[i] = "Y"
            remaining[g] -= 1
    return result


EMOJI = {"G": "🟩", "Y": "🟨", "B": "⬛"}


def to_emoji(result: List[str]) -> str:
    return "".join(EMOJI[r] for r in result)
