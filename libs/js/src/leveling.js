'use strict';
// The XP curve shared by both bots' leveling systems, so the math lives in one place.
// Level N needs levelXp(N) = 50 * N^2 total XP. Pick your own curve by changing FACTOR.

const FACTOR = 50;

/** The level reached with this much total XP. */
function levelFor(xp) {
  if (xp < 0) throw new Error("xp can't be negative");
  return Math.floor(Math.sqrt(xp / FACTOR));
}

/** The total XP needed to reach `level`. */
function xpFor(level) {
  if (level < 0) throw new Error("level can't be negative");
  return FACTOR * level * level;
}

/** { level, into: xp earned in the current level, need: xp the current level spans, fraction }. */
function progress(xp) {
  const level = levelFor(xp);
  const into = xp - xpFor(level);
  const need = xpFor(level + 1) - xpFor(level);
  return { level, into, need, fraction: need ? into / need : 0 };
}

module.exports = { levelFor, xpFor, progress };
