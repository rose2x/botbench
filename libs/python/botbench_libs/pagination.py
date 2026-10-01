"""Split a list into pages, and keep a requested page number in range.

    pages = paginate(items, per_page=10)
    page = pages[clamp_page(requested, len(pages))]
"""
from __future__ import annotations

from typing import List, Sequence


def paginate(items: Sequence, per_page: int) -> List[list]:
    if per_page < 1:
        raise ValueError("per_page must be at least 1")
    if not items:
        return [[]]
    return [list(items[i:i + per_page]) for i in range(0, len(items), per_page)]


def clamp_page(page: int, total_pages: int) -> int:
    """Keep a 0-based page index inside [0, total_pages - 1]."""
    return max(0, min(page, max(total_pages - 1, 0)))


def page_label(page: int, total_pages: int) -> str:
    """0-based page -> "Page 1 of 5"."""
    return f"Page {page + 1} of {max(total_pages, 1)}"
