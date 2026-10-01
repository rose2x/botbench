"""A small cron parser: 5 fields (minute hour day-of-month month day-of-week), UTC.

    c = parse_cron("*/15 9-17 * * mon-fri")
    c.next(datetime.now(timezone.utc))     # the next matching minute, strictly after the given time

Supports lists (1,5), ranges (1-5), steps (*/10, 5-30/5), names (jan, mon), and @hourly @daily @weekly @monthly @yearly.
If both day-of-month and day-of-week are restricted, a day matching EITHER runs (standard cron behaviour).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

_MONTHS = {n: i + 1 for i, n in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
_DAYS = {n: i for i, n in enumerate("sun mon tue wed thu fri sat".split())}
_ALIASES = {"@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0",
            "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *"}


def _parse_field(text: str, lo: int, hi: int, names=None) -> set:
    def num(tok: str) -> int:
        tok = tok.strip()
        if names and tok in names:
            return names[tok]
        if not tok.isdigit():
            raise ValueError(f"Bad cron value: {tok!r}")
        return int(tok)

    values = set()
    for part in text.split(","):
        step_text = None
        if "/" in part:
            part, step_text = part.split("/", 1)
        step = 1
        if step_text is not None:
            if not step_text.isdigit() or int(step_text) < 1:
                raise ValueError(f"Bad cron step: {step_text!r}")
            step = int(step_text)
        if part in ("*", "?"):
            a, b = lo, hi
        elif "-" in part:
            x, y = part.split("-", 1)
            a, b = num(x), num(y)
        else:
            a = num(part)
            b = hi if step_text is not None else a
        if not (lo <= a <= b <= hi):
            raise ValueError(f"Cron value out of range ({lo}-{hi}): {part!r}")
        values.update(range(a, b + 1, step))
    return values


class Cron:
    def __init__(self, expression: str):
        self.source = expression
        expr = _ALIASES.get(expression.strip().lower(), expression).strip().lower()
        fields = expr.split()
        if len(fields) != 5:
            raise ValueError("A cron expression needs 5 fields: minute hour day-of-month month day-of-week")
        self.minutes = _parse_field(fields[0], 0, 59)
        self.hours = _parse_field(fields[1], 0, 23)
        self.dom = _parse_field(fields[2], 1, 31)
        self.months = _parse_field(fields[3], 1, 12, _MONTHS)
        self.dow = {d % 7 for d in _parse_field(fields[4], 0, 7, _DAYS)}     # 7 is also Sunday
        self.dom_star, self.dow_star = fields[2].startswith("*"), fields[4].startswith("*")

    def _day_ok(self, t: datetime) -> bool:
        dom_ok = t.day in self.dom
        dow_ok = (t.weekday() + 1) % 7 in self.dow                              # cron: Sunday = 0
        if not self.dom_star and not self.dow_star:
            return dom_ok or dow_ok
        if not self.dom_star:
            return dom_ok
        if not self.dow_star:
            return dow_ok
        return True

    def matches(self, when: datetime) -> bool:
        t = when.astimezone(timezone.utc)
        return (t.minute in self.minutes and t.hour in self.hours and t.month in self.months and self._day_ok(t))

    def next(self, after: datetime) -> datetime:
        """The first matching minute strictly after `after` (a timezone-aware datetime)."""
        t = after.astimezone(timezone.utc).replace(second=0, microsecond=0) + timedelta(minutes=1)
        limit = t.year + 8
        while t.year <= limit:
            if t.month not in self.months:
                t = (t.replace(day=1, hour=0, minute=0) + timedelta(days=32)).replace(day=1)
            elif not self._day_ok(t):
                t = t.replace(hour=0, minute=0) + timedelta(days=1)
            elif t.hour not in self.hours:
                t = t.replace(minute=0) + timedelta(hours=1)
            elif t.minute not in self.minutes:
                t += timedelta(minutes=1)
            else:
                return t
        raise ValueError("No matching time in the next 8 years")


def parse_cron(expression: str) -> Cron:
    return Cron(expression)
