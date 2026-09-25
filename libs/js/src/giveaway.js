'use strict';
// Entry tracking and fair winner selection for a giveaway.
//
//   const g = new Giveaway(2);
//   g.enter(101); g.enter(102); g.enter(103);
//   g.pickWinners();     // 2 unique winners, or fewer if not enough entries
//
// Giveaway data is meant to live in memory for the bot's process, the same as /remind: it's simple and
// it's fine for a giveaway to be lost on a restart, as long as that's made clear to the person running it.

class Giveaway {
  constructor(winners = 1, prize = '') {
    if (winners < 1) throw new Error('A giveaway needs at least one winner');
    this.winners = winners;
    this.prize = prize;
    this.entrants = [];
    this.seen = new Set();
    this.ended = false;
  }

  /** True if this is a new entry, false if the user already entered. */
  enter(userId) {
    if (this.seen.has(userId)) return false;
    this.seen.add(userId);
    this.entrants.push(userId);
    return true;
  }

  leave(userId) {
    if (!this.seen.has(userId)) return false;
    this.seen.delete(userId);
    this.entrants = this.entrants.filter((u) => u !== userId);
    return true;
  }

  /** Up to `winners` unique winners, chosen fairly (partial Fisher-Yates). Marks the giveaway ended. */
  pickWinners(rng = (n) => Math.floor(Math.random() * n)) {
    const pool = [...this.entrants];
    const n = Math.min(this.winners, pool.length);
    for (let i = pool.length - 1; i >= pool.length - n; i--) {
      const j = rng(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.ended = true;
    return pool.slice(pool.length - n).reverse();
  }
}

module.exports = { Giveaway };
