'use strict';
// Rank a list of [id, score] pairs. Standard competition ranking: equal scores share a rank, and the
// next distinct score skips ahead (1, 1, 3), the way sports leaderboards usually work.

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** entries: iterable of [id, score]. Highest score first. Returns { rank, id, score }. */
function rank(entries, top = 10) {
  const ordered = [...entries].sort((a, b) => b[1] - a[1]);
  const out = [];
  let prevScore = null;
  let prevRank = 0;
  for (let i = 0; i < ordered.length; i++) {
    const [id, score] = ordered[i];
    const r = score !== prevScore ? i + 1 : prevRank;
    out.push({ rank: r, id, score });
    prevScore = score;
    prevRank = r;
    const next = ordered[i + 1];
    if (out.length >= top && (!next || next[1] !== score)) break;
  }
  return out;
}

/** A medal emoji for 1st to 3rd place, otherwise "#N". */
const medal = (position) => MEDALS[position] || `#${position}`;

module.exports = { rank, medal };
