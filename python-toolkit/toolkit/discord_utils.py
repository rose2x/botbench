"""Pure helpers for Discord bots. No network, no discord library needed.

Permissions and intents are integer bit fields built from the reference tables.
Mirrors src/utils/discordUtils.js in the JavaScript toolkit.
"""
from __future__ import annotations

import re
import urllib.parse
from datetime import datetime, timezone
from typing import Iterable, Optional

from .reference_data import INTENTS, PERMS


def _shift(value: str) -> int:
    return int(value.split("<<")[1])


def _clean(name: str) -> str:
    return re.sub(r"\s*\(.*\)", "", name).strip()


PERMISSIONS: dict[str, int] = {_clean(n): 1 << _shift(v) for n, v in PERMS}
INTENT_BITS: dict[str, int] = {n: 1 << _shift(v) for n, v, _g, _p in INTENTS}
PRIVILEGED_INTENTS = {n for n, _v, _g, p in INTENTS if p}


def permissions_to_bits(names: Iterable[str]) -> int:
    bits = 0
    for n in names:
        if n not in PERMISSIONS:
            raise ValueError(f"Unknown permission: {n}")
        bits |= PERMISSIONS[n]
    return bits


def bits_to_permissions(bits: int) -> list[str]:
    return [n for n, b in PERMISSIONS.items() if int(bits) & b == b]


def has_permission(bits: int, name: str) -> bool:
    """Administrator implies every permission."""
    admin = PERMISSIONS["ADMINISTRATOR"]
    return int(bits) & admin == admin or int(bits) & PERMISSIONS[name] == PERMISSIONS[name]


def intents_to_bits(names: Iterable[str]) -> int:
    bits = 0
    for n in names:
        if n not in INTENT_BITS:
            raise ValueError(f"Unknown intent: {n}")
        bits |= INTENT_BITS[n]
    return bits


def bits_to_intents(bits: int) -> list[str]:
    return [n for n, b in INTENT_BITS.items() if int(bits) & b == b]


def invite_url(client_id, *, permissions: Iterable[str] = (), scopes: Iterable[str] = ("bot", "applications.commands"),
               guild_id=None) -> str:
    """Build the "add bot to server" link."""
    params = {"client_id": str(client_id), "scope": " ".join(scopes)}
    perms = list(permissions)
    if perms:
        params["permissions"] = str(permissions_to_bits(perms))
    if guild_id:
        params["guild_id"] = str(guild_id)
    return "https://discord.com/oauth2/authorize?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)


DISCORD_EPOCH_MS = 1420070400000


def snowflake_parts(snowflake) -> dict:
    """Every Discord id hides the time it was made."""
    n = int(snowflake)
    return {"timestamp_ms": (n >> 22) + DISCORD_EPOCH_MS, "worker_id": (n & 0x3E0000) >> 17,
            "process_id": (n & 0x1F000) >> 12, "increment": n & 0xFFF}


def snowflake_to_datetime(snowflake) -> datetime:
    return datetime.fromtimestamp(snowflake_parts(snowflake)["timestamp_ms"] / 1000, tz=timezone.utc)


def user_mention(user_id) -> str: return f"<@{user_id}>"
def channel_mention(channel_id) -> str: return f"<#{channel_id}>"
def role_mention(role_id) -> str: return f"<@&{role_id}>"


def timestamp(when: datetime, style: str = "f") -> str:
    """Discord shows this in each reader's own time zone. Styles: t T d D f F R (R = "2 hours ago")."""
    if style not in "tTdDfFR" or len(style) != 1:
        raise ValueError("Style must be one of t T d D f F R")
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return f"<t:{int(when.timestamp())}:{style}>"


def escape_markdown(text: str) -> str:
    return re.sub(r"([\\*_`~|>])", r"\\\1", str(text))


def neutralize_mentions(text: str) -> str:
    """Escape mentions so text can't ping @everyone or roles."""
    text = re.sub(r"@(everyone|here)", "@\u200b\\1", str(text))
    return re.sub(r"<@([!&]?\d+)>", "<@\u200b\\1>", text)


def chunk_message(text: str, limit: int = 2000) -> list[str]:
    """Split long text into pieces of at most `limit` characters, preferring line breaks then spaces."""
    out, rest = [], str(text)
    while len(rest) > limit:
        cut = rest.rfind("\n", 0, limit + 1)
        if cut < limit / 2:
            cut = rest.rfind(" ", 0, limit + 1)
        if cut < limit / 2:
            cut = limit
        out.append(rest[:cut])
        rest = rest[cut + 1:] if rest[cut:cut + 1] in (" ", "\n") else rest[cut:]
    if rest:
        out.append(rest)
    return out


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def parse_color(color) -> int:
    return color if isinstance(color, int) else int(str(color).lstrip("#"), 16)


def raw_embed(*, title: Optional[str] = None, description: Optional[str] = None, url: Optional[str] = None,
              color=0x5865F2, fields: Iterable[dict] = (), footer: Optional[str] = None, image: Optional[str] = None,
              thumbnail: Optional[str] = None, author: Optional[str] = None, timestamp_: Optional[datetime] = None) -> dict:
    """Build a raw embed dict (for the REST client) with Discord's size limits applied."""
    fields = list(fields)
    if len(fields) > 25:
        raise ValueError("An embed can have at most 25 fields")
    e: dict = {"color": parse_color(color)}
    if title: e["title"] = _clip(title, 256)
    if description: e["description"] = _clip(description, 4096)
    if url: e["url"] = url
    if fields:
        e["fields"] = [{"name": _clip(str(f["name"]), 256), "value": _clip(str(f["value"]), 1024), "inline": bool(f.get("inline"))} for f in fields]
    if footer: e["footer"] = {"text": _clip(footer, 2048)}
    if image: e["image"] = {"url": image}
    if thumbnail: e["thumbnail"] = {"url": thumbnail}
    if author: e["author"] = {"name": _clip(author, 256)}
    if timestamp_: e["timestamp"] = timestamp_.astimezone(timezone.utc).isoformat()
    total = (len(e.get("title", "")) + len(e.get("description", "")) + len(e.get("footer", {}).get("text", ""))
             + len(e.get("author", {}).get("name", "")) + sum(len(f["name"]) + len(f["value"]) for f in e.get("fields", [])))
    if total > 6000:
        raise ValueError(f"Embed is {total} characters. The limit is 6000 across all text.")
    return e


BUTTON_STYLES = {"primary": 1, "secondary": 2, "success": 3, "danger": 4, "link": 5}


def button(label: str, *, custom_id: Optional[str] = None, url: Optional[str] = None, style: str = "primary",
           disabled: bool = False, emoji: Optional[str] = None) -> dict:
    """A raw button component. Use `url` for link buttons, otherwise `custom_id`."""
    if not url and style not in BUTTON_STYLES:
        raise ValueError(f"Unknown button style: {style}")
    b: dict = {"type": 2, "label": _clip(label, 80), "style": 5 if url else BUTTON_STYLES[style], "disabled": disabled}
    if url: b["url"] = url
    else: b["custom_id"] = custom_id
    if emoji: b["emoji"] = {"name": emoji}
    return b


def string_select(custom_id: str, options: list[dict], *, placeholder: Optional[str] = None,
                  min_values: int = 1, max_values: int = 1) -> dict:
    """A dropdown of text options: [{"label": ..., "value": ..., "description": ...}] (up to 25)."""
    if not 1 <= len(options) <= 25:
        raise ValueError("A select menu needs 1 to 25 options")
    return {"type": 3, "custom_id": custom_id, "placeholder": placeholder, "min_values": min_values,
            "max_values": min(max_values, len(options)), "options": options}


def action_row(*components: dict) -> dict:
    """A row holds up to 5 buttons, or exactly one select menu."""
    if any(c["type"] == 3 for c in components) and len(components) != 1:
        raise ValueError("A select menu must be alone in its row")
    if not 1 <= len(components) <= 5:
        raise ValueError("A row holds 1 to 5 components")
    return {"type": 1, "components": list(components)}
