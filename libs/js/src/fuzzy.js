'use strict';
// Fuzzy matching for "did you mean ...?" and autocomplete.

function levenshtein(a, b) {
  a = Array.from(a);
  b = Array.from(b);
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[prev.length - 1];
}

/** 1.0 for equal strings (ignoring case), 0.0 for nothing in common. */
function similarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const longest = Math.max(Array.from(a).length, Array.from(b).length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

function jaro(a, b) {
  if (a === b) return 1;
  a = Array.from(a);
  b = Array.from(b);
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const dist = Math.max(Math.floor(Math.max(la, lb) / 2) - 1, 0);
  const am = Array(la).fill(false);
  const bm = Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    for (let j = Math.max(0, i - dist); j < Math.min(i + dist + 1, lb); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let trans = 0;
  for (let i = 0; i < la; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) trans++;
    k++;
  }
  trans /= 2;
  return (matches / la + matches / lb + (matches - trans) / matches) / 3;
}

function jaroWinkler(a, b, prefixScale = 0.1) {
  const j = jaro(a, b);
  if (j <= 0.7) return j;
  const [x, y] = [Array.from(a).slice(0, 4), Array.from(b).slice(0, 4)];
  let prefix = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) { if (x[i] !== y[i]) break; prefix++; }
  return j + prefix * prefixScale * (1 - j);
}

/** The best matches for `word`, best first. Ties are sorted alphabetically. */
function closest(word, candidates, n = 3, cutoff = 0.6) {
  const scored = [...candidates].map((c) => [similarity(word, c), c]).filter((s) => s[0] >= cutoff);
  scored.sort((x, y) => (y[0] - x[0]) || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  return scored.slice(0, n).map((s) => s[1]);
}

module.exports = { levenshtein, similarity, jaro, jaroWinkler, closest };
