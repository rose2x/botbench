"""The free-API directory as Python objects, with search.

    python -m toolkit.directory                  # list types
    python -m toolkit.directory search weather   # search
    python -m toolkit.directory nokey            # only APIs that need no key
"""
from __future__ import annotations

import sys
from dataclasses import dataclass

from .reference_data import APIS


@dataclass(frozen=True)
class Api:
    name: str
    type: str
    key: str
    description: str
    url: str

    @property
    def needs_key(self) -> bool:
        return self.key != "None"


ALL: list[Api] = [Api(*a) for a in APIS]


def types() -> list[str]:
    return sorted({a.type for a in ALL})


def by_type(kind: str) -> list[Api]:
    return [a for a in ALL if a.type.lower() == kind.lower()]


def no_key() -> list[Api]:
    return [a for a in ALL if not a.needs_key]


def search(query: str, *, only_no_key: bool = False, kind: str | None = None, limit: int = 25) -> list[Api]:
    """All words must appear in the name, type, description or url. Name matches come first."""
    words = query.lower().split()
    hits = []
    for a in ALL:
        if only_no_key and a.needs_key:
            continue
        if kind and a.type.lower() != kind.lower():
            continue
        hay = f"{a.name} {a.type} {a.description} {a.url}".lower()
        if all(w in hay for w in words):
            hits.append((0 if all(w in a.name.lower() for w in words) else 1, a))
    hits.sort(key=lambda x: x[0])
    return [a for _, a in hits[:limit]]


def _print(items: list[Api]) -> None:
    for a in items:
        print(f"{a.name:<26} {a.type:<16} key: {a.key:<9} {a.url}")
    print(f"\n{len(items)} result(s)")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        for t in types():
            print(f"{t:<18} {len(by_type(t))}")
    elif args[0] == "search":
        _print(search(" ".join(args[1:])))
    elif args[0] == "nokey":
        _print(no_key())
    else:
        _print(by_type(" ".join(args)))
