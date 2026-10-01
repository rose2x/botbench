'use strict';
// Score a Wordle-style guess. Returns one letter per position: "G" right place, "Y" wrong place, "B" not in the word.
// Repeated letters are handled the way Wordle does: a letter is only marked as many times as it appears in the answer.

function score(guess, answer) {
  guess = guess.toLowerCase();
  answer = answer.toLowerCase();
  if (guess.length !== answer.length) throw new Error('The guess must be the same length as the answer');
  const result = Array(answer.length).fill('B');
  const remaining = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) result[i] = 'G';
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'B' && remaining[guess[i]] > 0) { result[i] = 'Y'; remaining[guess[i]] -= 1; }
  }
  return result;
}

const EMOJI = { G: '🟩', Y: '🟨', B: '⬛' };
const toEmoji = (result) => result.map((r) => EMOJI[r]).join('');

module.exports = { score, toEmoji };
