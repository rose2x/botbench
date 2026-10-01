'use strict';
// A simple math captcha for a verification gate: no images, works fine in a Discord modal.
//
//   const c = generateChallenge();          // { question: "7 + 12 = ?", a: 7, b: 12, answer: 19 }
//   verifyAnswer(c.a, c.b, '19');            // true
//
// Because a and b travel in the modal's custom_id (see commands/verify.js), nothing needs to be stored
// between showing the question and checking the answer, so verification survives a bot restart.

function defaultRng(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function generateChallenge(minValue = 1, maxValue = 20, rng = defaultRng) {
  const a = rng(minValue, maxValue);
  const b = rng(minValue, maxValue);
  if (rng === defaultRng && Math.random() < 0.5) { // sometimes subtract instead of add (only with real randomness)
    const [hi, lo] = [Math.max(a, b), Math.min(a, b)];
    return { question: `${hi} - ${lo} = ?`, a: hi, b: -lo, answer: hi - lo };
  }
  return { question: `${a} + ${b} = ?`, a, b, answer: a + b };
}

/** Recomputes a + b and compares it with the user's answer. Whitespace and a leading + are ignored. */
function verifyAnswer(a, b, userInput) {
  let text = String(userInput).trim();
  if (text.startsWith('+')) text = text.slice(1).trim();
  if (!/^-?\d+$/.test(text)) return false;
  return parseInt(text, 10) === a + b;
}

module.exports = { generateChallenge, verifyAnswer };
