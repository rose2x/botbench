"""Auto-moderation rules as pure logic: you feed it messages, it tells you which rules were broken.

    mod = AutoMod({"max_messages": 5, "window": 5, "blocked_terms": ["badword"]})
    mod.check({"author_id": 1, "content": "hello", "timestamp": 12.0, "mentions": 0})   # -> []

It never deletes or punishes anything. You decide what to do with the rule names it returns:
"rate", "duplicate", "mention_spam", "caps", "invite", "blocked_term", "repeat_chars".
There is deliberately NO built-in word list: you supply blocked_terms for your community.
Blocked terms match whole words after normalising look-alikes ("B4d W0rd" -> "bad word"), which avoids the
classic false positives from matching inside other words.
"""
from __future__ import annotations

import re
import unicodedata
from collections import deque
from typing import Dict, List

DEFAULTS = {
    "max_messages": 5,        # more than this many messages in `window` seconds -> "rate"
    "window": 5.0,
    "max_duplicates": 3,      # this many identical messages in `window` seconds -> "duplicate"
    "max_mentions": 5,        # more than this many mentions in one message -> "mention_spam"
    "max_caps_ratio": 0.7,    # more than 70% capitals (in messages of 10+ letters) -> "caps"
    "block_invites": True,
    "blocked_terms": [],
    "max_repeat": 10,         # a character repeated more than this many times in a row -> "repeat_chars"
}
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})
_INVISIBLE = re.compile("[\u200b-\u200f\u2060\ufeff]")
_INVITE = re.compile(r"(?:discord(?:app)?\.com/invite|discord\.gg)/[a-z0-9-]+", re.I)
_TOKENS = re.compile(r"[^\W_]+")


def normalize(text: str) -> str:
    """Lowercase, strip accents and invisible characters, undo common look-alikes, squash long repeats."""
    s = unicodedata.normalize("NFKD", str(text))
    s = "".join(c for c in s if not unicodedata.category(c).startswith("M"))
    s = _INVISIBLE.sub("", s).lower().translate(_LEET)
    return re.sub(r"(.)\1{2,}", r"\1\1", s)


def _words(text: str) -> str:
    return " " + " ".join(_TOKENS.findall(normalize(text))) + " "


class AutoMod:
    def __init__(self, config: dict | None = None):
        self.cfg = {**DEFAULTS, **(config or {})}
        self._terms = [_words(t) for t in self.cfg["blocked_terms"] if _TOKENS.findall(normalize(t))]
        self._history: Dict[object, deque] = {}

    def check(self, msg: dict) -> List[str]:
        """msg: {"author_id", "content", "timestamp" (seconds), "mentions" (count)}. Returns the rules broken, in a fixed order."""
        c, content, ts = self.cfg, msg.get("content", ""), float(msg["timestamp"])
        q = self._history.setdefault(msg["author_id"], deque())
        while q and q[0][0] <= ts - c["window"]:
            q.popleft()
        key = " ".join(content.lower().split())
        q.append((ts, key))
        out = []
        if len(q) > c["max_messages"]:
            out.append("rate")
        if key and sum(1 for _, k in q if k == key) >= c["max_duplicates"]:
            out.append("duplicate")
        if msg.get("mentions", 0) > c["max_mentions"]:
            out.append("mention_spam")
        letters = [ch for ch in content if ch.isalpha()]
        if len(letters) >= 10 and sum(ch.isupper() for ch in letters) / len(letters) > c["max_caps_ratio"]:
            out.append("caps")
        if c["block_invites"] and _INVITE.search(content):
            out.append("invite")
        if self._terms:
            padded = _words(content)
            if any(t in padded for t in self._terms):
                out.append("blocked_term")
        if re.search(r"(.)\1{%d,}" % c["max_repeat"], content):
            out.append("repeat_chars")
        return out


class RaidDetector:
    """Flags a burst of joins: `limit` joins within `window` seconds."""

    def __init__(self, limit: int = 5, window: float = 10.0):
        self.limit, self.window = limit, window
        self._joins: deque = deque()

    def record_join(self, user_id, timestamp: float) -> bool:
        while self._joins and self._joins[0][0] <= timestamp - self.window:
            self._joins.popleft()
        self._joins.append((timestamp, user_id))
        return len(self._joins) >= self.limit

    def recent_users(self) -> list:
        return [u for _, u in self._joins]
