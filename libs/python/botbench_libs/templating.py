"""Safe message templates for welcome messages, embeds and notices.

    render("Welcome {user.name|title} to {server}! {count} {count|plural:member:members}.",
           {"user": {"name": "ann"}, "server": "Bot Bench", "count": 5})

  {name}                 value (dotted paths work: {user.name}); unknown names are left as they are
  {name|filter:arg}      filters: upper lower title trim default:X truncate:N plural:one:many
  {{ and }}              literal braces
Pass safe=True to defuse @everyone / @here / mentions inside values (the template text itself is trusted).
"""
from __future__ import annotations

import re
from typing import Any

_TOKEN = re.compile(r"\{\{|\}\}|\{([^{}]+)\}")
ZWSP = "\u200b"


def _lookup(vars_: dict, path: str):
    cur: Any = vars_
    for part in path.strip().split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _title(s: str) -> str:
    return " ".join(w[:1].upper() + w[1:].lower() for w in s.split(" "))


def _neutralize(s: str) -> str:
    s = re.sub(r"@(everyone|here)", f"@{ZWSP}\\1", s)
    return re.sub(r"<@([!&]?\d+)>", f"<@{ZWSP}\\1>", s)


def render(template: str, vars_: dict, safe: bool = False) -> str:
    def sub(m):
        if m.group(0) == "{{":
            return "{"
        if m.group(0) == "}}":
            return "}"
        parts = [p.strip() for p in m.group(1).split("|")]
        value = _lookup(vars_, parts[0])
        filters = [p.split(":") for p in parts[1:]]
        has_default = any(f[0] == "default" for f in filters)
        if value is None and not has_default:
            return m.group(0)
        raw = value
        text = "" if value is None else str(value)
        for name, *args in filters:
            if name == "upper":
                text = text.upper()
            elif name == "lower":
                text = text.lower()
            elif name == "title":
                text = _title(text)
            elif name == "trim":
                text = text.strip()
            elif name == "default":
                if text == "":
                    text = args[0] if args else ""
            elif name == "truncate" and args and args[0].isdigit():
                n = int(args[0])
                text = text if len(text) <= n else text[: max(n - 1, 0)] + "…"
            elif name == "plural" and len(args) >= 2:
                try:
                    text = args[0] if float(raw) == 1 else args[1]
                except (TypeError, ValueError):
                    text = args[1]
        return _neutralize(text) if safe else text

    return _TOKEN.sub(sub, template)
