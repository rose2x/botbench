'use strict';
// Tally votes for a single-choice poll: { userId: optionIndex } -> counts per option.

function tally(votes, numOptions) {
  const counts = Array(numOptions).fill(0);
  for (const choice of Object.values(votes)) {
    if (!(choice >= 0 && choice < numOptions)) throw new Error(`Vote ${choice} is out of range for ${numOptions} options`);
    counts[choice] += 1;
  }
  return counts;
}

/** The index of the option with the most votes, or null if there are no votes or a tie for first. */
function winner(counts) {
  if (!counts.length) return null;
  const best = Math.max(...counts);
  if (best === 0) return null;
  const leaders = counts.flatMap((c, i) => (c === best ? [i] : []));
  return leaders.length === 1 ? leaders[0] : null;
}

module.exports = { tally, winner };
