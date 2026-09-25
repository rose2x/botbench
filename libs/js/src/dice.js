'use strict';
// Dice notation: "2d6+3", "d20", "4d6kh3" (keep highest 3), "2d20kl1" (keep lowest 1), "1d8+2d6-1".
//
//   roll('4d6kh3').total
//   roll('2d20kh1', { rng: (sides) => 7 })     // inject your own randomness for tests
//
// Limits keep chat commands safe: up to 100 dice, 1000 sides and 10 terms.

const MAX_DICE = 100;
const MAX_SIDES = 1000;
const MAX_TERMS = 10;
const TERM = /^(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))$/;

/** Roll an expression. `rng(sides)` must return an integer from 1 to sides. Throws on bad input. */
function roll(expression, { rng = (sides) => Math.floor(Math.random() * sides) + 1 } = {}) {
  const expr = String(expression).toLowerCase().replace(/ /g, '');
  if (!expr) throw new Error('Empty dice expression');
  const tokens = expr.match(/[+-]?[^+-]+/g) || [];
  if (tokens.join('') !== expr) throw new Error(`Can't read dice expression: ${JSON.stringify(expression)}`);
  if (tokens.length > MAX_TERMS) throw new Error(`Too many terms (max ${MAX_TERMS})`);
  const terms = [];
  let total = 0;
  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1;
    const body = token.replace(/^[+-]/, '');
    const m = TERM.exec(body);
    if (!m) throw new Error(`Can't read dice term: ${JSON.stringify(body)}`);
    if (m[5] !== undefined) {
      const value = parseInt(m[5], 10);
      terms.push({ text: body, kind: 'const', sign, rolls: [], kept: null, subtotal: sign * value });
      total += sign * value;
      continue;
    }
    const n = m[1] ? parseInt(m[1], 10) : 1;
    const sides = parseInt(m[2], 10);
    if (n < 1 || n > MAX_DICE) throw new Error(`Roll between 1 and ${MAX_DICE} dice`);
    if (sides < 1 || sides > MAX_SIDES) throw new Error(`Dice need between 1 and ${MAX_SIDES} sides`);
    const rolls = Array.from({ length: n }, () => rng(sides));
    let kept = null;
    if (m[3]) {
      const k = parseInt(m[4], 10);
      if (k < 1 || k > n) throw new Error('You can only keep between 1 and all of the dice');
      kept = [...rolls].sort((a, b) => (m[3] === 'h' ? b - a : a - b)).slice(0, k);
    }
    const subtotal = sign * (kept || rolls).reduce((a, b) => a + b, 0);
    terms.push({ text: body, kind: 'dice', sign, rolls, kept, subtotal });
    total += subtotal;
  }
  return { expression: expr, total, terms };
}

module.exports = { roll, MAX_DICE, MAX_SIDES, MAX_TERMS };
