"""The queue logic for a music bot (no audio: pair it with Lavalink, wavelink, discord-player...).

    q = MusicQueue(["a", "b", "c"]); q.next()  # "a"; q.next()  # "b"
Loop modes: "off", "one" (repeat the current track), "all" (wrap around at the end).
Tracks can be any value (a string, a dict). `rng(n)` must return an int in [0, n) and is used for shuffling.
"""
from __future__ import annotations

import random
from typing import Any, Callable, List, Optional


class MusicQueue:
    def __init__(self, tracks: Optional[list] = None):
        self.tracks: List[Any] = list(tracks or [])
        self.pos = -1                     # index of the current track, -1 before anything has played
        self.loop = "off"

    @property
    def current(self):
        return self.tracks[self.pos] if 0 <= self.pos < len(self.tracks) else None

    @property
    def upcoming(self) -> list:
        return self.tracks[self.pos + 1:]

    @property
    def history(self) -> list:
        return self.tracks[: max(self.pos, 0)]

    def set_loop(self, mode: str) -> None:
        if mode not in ("off", "one", "all"):
            raise ValueError("loop must be off, one or all")
        self.loop = mode

    def add(self, track) -> int:
        self.tracks.append(track)
        return len(self.tracks) - 1

    def add_next(self, track) -> None:
        self.tracks.insert(self.pos + 1, track)

    def next(self):
        """Advance and return the new current track (None when the queue has finished)."""
        if self.loop == "one" and self.current is not None:
            return self.current
        if self.pos + 1 < len(self.tracks):
            self.pos += 1
        elif self.loop == "all" and self.tracks:
            self.pos = 0
        else:
            self.pos = len(self.tracks)
        return self.current

    def previous(self):
        if self.pos > 0:
            self.pos -= 1
        return self.current

    def remove(self, index: int):
        """Remove by position in the whole list. Removing the current track makes next() play the following one."""
        track = self.tracks.pop(index)
        if index <= self.pos:
            self.pos -= 1
        return track

    def move(self, src: int, dest: int) -> None:
        track = self.tracks.pop(src)
        self.tracks.insert(dest, track)
        if src == self.pos:
            self.pos = dest
        elif src < self.pos <= dest:
            self.pos -= 1
        elif dest <= self.pos < src:
            self.pos += 1

    def shuffle(self, rng: Callable[[int], int] = lambda n: random.randrange(n)) -> None:
        """Shuffle only what's still to come (Fisher-Yates)."""
        rest = self.upcoming
        for i in range(len(rest) - 1, 0, -1):
            j = rng(i + 1)
            rest[i], rest[j] = rest[j], rest[i]
        self.tracks[self.pos + 1:] = rest

    def clear(self) -> None:
        self.tracks, self.pos = [], -1
