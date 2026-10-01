"""Parse and format durations: "1h30m", "2d 4h", "90s", "1.5h", "1 hour 5 min"."""
from __future__ import annotations

import re

_UNITS = {}
for _names, _secs in ((("s", "sec", "secs", "second", "seconds"), 1), (("m", "min", "mins", "minute", "minutes"), 60),
                      (("h", "hr", "hrs", "hour", "hours"), 3600), (("d", "day", "days"), 86400),
                      (("w", "wk", "wks", "week", "weeks"), 604800), (("y", "yr", "yrs", "year", "years"), 31536000)):
    for _n in _names:
        _UNITS[_n] = _secs

_PART = re.compile(r"\s*(\d+(?:\.\d+)?)\s*([a-z]+)\s*")


def parse_duration(text: str):
    """Return the number of seconds. Raises ValueError for anything it can't read (a bare number is not allowed)."""
    s = str(text).strip().lower()
    if not s:
        raise ValueError("Empty duration")
    pos, total = 0, 0.0
    while pos < len(s):
        m = _PART.match(s, pos)
        if not m:
            raise ValueError(f"Can't read duration: {text!r}")
        unit = _UNITS.get(m.group(2))
        if unit is None:
            raise ValueError(f"Unknown unit: {m.group(2)!r}")
        total += float(m.group(1)) * unit
        pos = m.end()
    return int(total) if total == int(total) else total


_PARTS = (("day", "d", 86400), ("hour", "h", 3600), ("minute", "m", 60), ("second", "s", 1))


def format_duration(seconds, max_parts: int = 2, short: bool = False) -> str:
    """5400 -> "1 hour, 30 minutes" (or "1h 30m" with short=True)."""
    s = int(seconds + 0.5)
    if s <= 0:
        return "0s" if short else "0 seconds"
    out = []
    for name, letter, size in _PARTS:
        n, s = divmod(s, size)
        if n:
            out.append(f"{n}{letter}" if short else f"{n} {name}{'' if n == 1 else 's'}")
    return (" " if short else ", ").join(out[:max_parts])
