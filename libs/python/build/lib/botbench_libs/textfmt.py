"""Text helpers for chat output: tables, progress bars, humanized numbers, ordinals, plurals, truncation."""
from __future__ import annotations

import math
from typing import Optional, Sequence


def table(rows: Sequence[Sequence], headers: Optional[Sequence] = None, align: Optional[Sequence[str]] = None) -> str:
    """A plain-text table for a code block. `align` is a list of "l", "r" or "c" per column."""
    data = [[str(c) for c in r] for r in rows]
    head = [str(h) for h in headers] if headers else None
    cols = max([len(r) for r in data] + [len(head) if head else 0])
    for r in data + ([head] if head else []):
        r.extend([""] * (cols - len(r)))
    widths = [max(len(r[i]) for r in data + ([head] if head else [])) for i in range(cols)]
    align = list(align or []) + ["l"] * cols

    def center(c: str, w: int) -> str:            # extra space goes on the right (same in every language)
        left = (w - len(c)) // 2
        return " " * left + c + " " * (w - len(c) - left)

    def fmt(r):
        cells = []
        for i, c in enumerate(r):
            cells.append(c.rjust(widths[i]) if align[i] == "r" else center(c, widths[i]) if align[i] == "c" else c.ljust(widths[i]))
        return " | ".join(cells).rstrip()

    lines = []
    if head:
        lines += [fmt(head), "-+-".join("-" * w for w in widths)]
    lines += [fmt(r) for r in data]
    return "\n".join(lines)


def progress_bar(fraction: float, width: int = 10, fill: str = "█", empty: str = "░") -> str:
    f = min(1.0, max(0.0, fraction))
    filled = math.floor(f * width + 0.5)
    return fill * filled + empty * (width - filled)


def humanize_number(n: float, digits: int = 1) -> str:
    """1500 -> "1.5K", 1234567 -> "1.2M", 999999 -> "1M"."""
    sign, x = ("-" if n < 0 else ""), abs(n)
    if x < 1000:
        return sign + _trim(x, digits)
    for suffix in ("K", "M", "B", "T"):
        x /= 1000
        rounded = math.floor(x * 10 ** digits + 0.5) / 10 ** digits
        if rounded < 1000 or suffix == "T":
            return sign + _trim(x, digits) + suffix
    return sign + _trim(x, digits) + "T"


def _trim(x: float, digits: int) -> str:
    r = math.floor(x * 10 ** digits + 0.5) / 10 ** digits
    s = f"{r:.{digits}f}"
    return s.rstrip("0").rstrip(".") if "." in s else s


def ordinal(n: int) -> str:
    n = int(n)
    m = abs(n) % 100
    suffix = "th" if 10 <= m <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(abs(n) % 10, "th")
    return f"{n}{suffix}"


def pluralize(n, singular: str, plural: Optional[str] = None) -> str:
    """pluralize(1, "item") -> "1 item", pluralize(2, "child", "children") -> "2 children"."""
    return f"{n} {singular if n == 1 else (plural or singular + 's')}"


def truncate(text: str, limit: int, ellipsis: str = "…") -> str:
    return text if len(text) <= limit else text[: max(limit - len(ellipsis), 0)] + ellipsis
