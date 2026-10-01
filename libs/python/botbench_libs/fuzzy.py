"""Fuzzy matching for "did you mean ...?" and autocomplete."""
from __future__ import annotations

from typing import Iterable, List


def levenshtein(a: str, b: str) -> int:
    a, b = list(a), list(b)
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def similarity(a: str, b: str) -> float:
    """1.0 for equal strings (ignoring case), 0.0 for nothing in common."""
    a, b = a.lower(), b.lower()
    longest = max(len(a), len(b))
    return 1.0 if longest == 0 else 1 - levenshtein(a, b) / longest


def jaro(a: str, b: str) -> float:
    if a == b:
        return 1.0
    la, lb = len(a), len(b)
    if not la or not lb:
        return 0.0
    dist = max(max(la, lb) // 2 - 1, 0)
    am, bm, matches = [False] * la, [False] * lb, 0
    for i in range(la):
        for j in range(max(0, i - dist), min(i + dist + 1, lb)):
            if bm[j] or a[i] != b[j]:
                continue
            am[i] = bm[j] = True
            matches += 1
            break
    if not matches:
        return 0.0
    k = trans = 0
    for i in range(la):
        if not am[i]:
            continue
        while not bm[k]:
            k += 1
        if a[i] != b[k]:
            trans += 1
        k += 1
    trans /= 2
    return (matches / la + matches / lb + (matches - trans) / matches) / 3


def jaro_winkler(a: str, b: str, prefix_scale: float = 0.1) -> float:
    j = jaro(a, b)
    if j <= 0.7:
        return j
    prefix = 0
    for x, y in zip(a[:4], b[:4]):
        if x != y:
            break
        prefix += 1
    return j + prefix * prefix_scale * (1 - j)


def closest(word: str, candidates: Iterable[str], n: int = 3, cutoff: float = 0.6) -> List[str]:
    """The best matches for `word`, best first. Ties are sorted alphabetically."""
    scored = [(similarity(word, c), c) for c in candidates]
    scored = [s for s in scored if s[0] >= cutoff]
    scored.sort(key=lambda s: (-s[0], s[1]))
    return [c for _, c in scored[:n]]
