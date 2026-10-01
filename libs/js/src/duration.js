'use strict';
// Parse and format durations: "1h30m", "2d 4h", "90s", "1.5h", "1 hour 5 min".

const UNITS = {};
for (const [names, secs] of [
  [['s', 'sec', 'secs', 'second', 'seconds'], 1], [['m', 'min', 'mins', 'minute', 'minutes'], 60],
  [['h', 'hr', 'hrs', 'hour', 'hours'], 3600], [['d', 'day', 'days'], 86400],
  [['w', 'wk', 'wks', 'week', 'weeks'], 604800], [['y', 'yr', 'yrs', 'year', 'years'], 31536000],
]) for (const n of names) UNITS[n] = secs;

/** Return the number of seconds. Throws for anything it can't read (a bare number is not allowed). */
function parseDuration(text) {
  const s = String(text).trim().toLowerCase();
  if (!s) throw new Error('Empty duration');
  const part = /\s*(\d+(?:\.\d+)?)\s*([a-z]+)\s*/y;
  let pos = 0;
  let total = 0;
  while (pos < s.length) {
    part.lastIndex = pos;
    const m = part.exec(s);
    if (!m) throw new Error(`Can't read duration: ${JSON.stringify(text)}`);
    const unit = Object.prototype.hasOwnProperty.call(UNITS, m[2]) ? UNITS[m[2]] : undefined;
    if (unit === undefined) throw new Error(`Unknown unit: ${JSON.stringify(m[2])}`);
    total += parseFloat(m[1]) * unit;
    pos = part.lastIndex;
  }
  return total;
}

const PARTS = [['day', 'd', 86400], ['hour', 'h', 3600], ['minute', 'm', 60], ['second', 's', 1]];

/** 5400 -> "1 hour, 30 minutes" (or "1h 30m" with short = true). */
function formatDuration(seconds, maxParts = 2, short = false) {
  let s = Math.floor(seconds + 0.5);
  if (s <= 0) return short ? '0s' : '0 seconds';
  const out = [];
  for (const [name, letter, size] of PARTS) {
    const n = Math.floor(s / size);
    s -= n * size;
    if (n) out.push(short ? `${n}${letter}` : `${n} ${name}${n === 1 ? '' : 's'}`);
  }
  return out.slice(0, maxParts).join(short ? ' ' : ', ');
}

module.exports = { parseDuration, formatDuration };
