'use strict';
// Text helpers for chat output: tables, progress bars, humanized numbers, ordinals, plurals, truncation.
// Lengths count Unicode characters (code points), not UTF-16 units.

const len = (s) => Array.from(s).length;

/** A plain-text table for a code block. `align` is an array of "l", "r" or "c" per column. */
function table(rows, headers = null, align = null) {
  const data = rows.map((r) => r.map(String));
  const head = headers ? headers.map(String) : null;
  const cols = Math.max(...data.map((r) => r.length), head ? head.length : 0);
  for (const r of head ? [...data, head] : data) while (r.length < cols) r.push('');
  const all = head ? [...data, head] : data;
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...all.map((r) => len(r[i]))));
  const al = [...(align || []), ...Array(cols).fill('l')];
  const pad = (c, w, mode) => {
    const gap = w - len(c);
    if (mode === 'r') return ' '.repeat(gap) + c;
    if (mode === 'c') { const left = Math.floor(gap / 2); return ' '.repeat(left) + c + ' '.repeat(gap - left); }
    return c + ' '.repeat(gap);
  };
  const fmt = (r) => r.map((c, i) => pad(c, widths[i], al[i])).join(' | ').replace(/\s+$/, '');
  const lines = [];
  if (head) lines.push(fmt(head), widths.map((w) => '-'.repeat(w)).join('-+-'));
  lines.push(...data.map(fmt));
  return lines.join('\n');
}

function progressBar(fraction, width = 10, fill = '█', empty = '░') {
  const f = Math.min(1, Math.max(0, fraction));
  const filled = Math.floor(f * width + 0.5);
  return fill.repeat(filled) + empty.repeat(width - filled);
}

function trimNumber(x, digits) {
  const r = Math.floor(x * 10 ** digits + 0.5) / 10 ** digits;
  const s = r.toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** 1500 -> "1.5K", 1234567 -> "1.2M", 999999 -> "1M". */
function humanizeNumber(n, digits = 1) {
  const sign = n < 0 ? '-' : '';
  let x = Math.abs(n);
  if (x < 1000) return sign + trimNumber(x, digits);
  for (const suffix of ['K', 'M', 'B', 'T']) {
    x /= 1000;
    const rounded = Math.floor(x * 10 ** digits + 0.5) / 10 ** digits;
    if (rounded < 1000 || suffix === 'T') return sign + trimNumber(x, digits) + suffix;
  }
  return sign + trimNumber(x, digits) + 'T';
}

function ordinal(n) {
  n = Math.trunc(n);
  const m = Math.abs(n) % 100;
  const suffix = m >= 10 && m <= 20 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[Math.abs(n) % 10] || 'th');
  return `${n}${suffix}`;
}

/** pluralize(1, 'item') -> "1 item", pluralize(2, 'child', 'children') -> "2 children". */
function pluralize(n, singular, plural = null) {
  return `${n} ${n === 1 ? singular : plural || `${singular}s`}`;
}

function truncate(text, limit, ellipsis = '…') {
  const chars = Array.from(text);
  return chars.length <= limit ? text : chars.slice(0, Math.max(limit - len(ellipsis), 0)).join('') + ellipsis;
}

module.exports = { table, progressBar, humanizeNumber, ordinal, pluralize, truncate };
