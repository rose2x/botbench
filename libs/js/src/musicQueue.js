'use strict';
// The queue logic for a music bot (no audio: pair it with Lavalink, Shoukaku, discord-player...).
//
//   const q = new MusicQueue(['a', 'b', 'c']); q.next(); // 'a'; q.next(); // 'b'
// Loop modes: "off", "one" (repeat the current track), "all" (wrap around at the end).
// Tracks can be any value (a string, an object). `rng(n)` must return an integer in [0, n) and is used for shuffling.

class MusicQueue {
  constructor(tracks = []) {
    this.tracks = [...tracks];
    this.pos = -1; // index of the current track, -1 before anything has played
    this.loop = 'off';
  }
  get current() { return this.pos >= 0 && this.pos < this.tracks.length ? this.tracks[this.pos] : null; }
  get upcoming() { return this.tracks.slice(this.pos + 1); }
  get history() { return this.tracks.slice(0, Math.max(this.pos, 0)); }

  setLoop(mode) {
    if (!['off', 'one', 'all'].includes(mode)) throw new Error('loop must be off, one or all');
    this.loop = mode;
  }
  add(track) { this.tracks.push(track); return this.tracks.length - 1; }
  addNext(track) { this.tracks.splice(this.pos + 1, 0, track); }

  /** Advance and return the new current track (null when the queue has finished). */
  next() {
    if (this.loop === 'one' && this.current !== null) return this.current;
    if (this.pos + 1 < this.tracks.length) this.pos += 1;
    else if (this.loop === 'all' && this.tracks.length) this.pos = 0;
    else this.pos = this.tracks.length;
    return this.current;
  }
  previous() {
    if (this.pos > 0) this.pos -= 1;
    return this.current;
  }
  /** Remove by position in the whole list. Removing the current track makes next() play the following one. */
  remove(index) {
    const [track] = this.tracks.splice(index, 1);
    if (index <= this.pos) this.pos -= 1;
    return track;
  }
  move(src, dest) {
    const [track] = this.tracks.splice(src, 1);
    this.tracks.splice(dest, 0, track);
    if (src === this.pos) this.pos = dest;
    else if (src < this.pos && this.pos <= dest) this.pos -= 1;
    else if (dest <= this.pos && this.pos < src) this.pos += 1;
  }
  /** Shuffle only what's still to come (Fisher-Yates). */
  shuffle(rng = (n) => Math.floor(Math.random() * n)) {
    const rest = this.upcoming;
    for (let i = rest.length - 1; i > 0; i--) {
      const j = rng(i + 1);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.tracks.splice(this.pos + 1, this.tracks.length, ...rest);
  }
  clear() { this.tracks = []; this.pos = -1; }
}

module.exports = { MusicQueue };
