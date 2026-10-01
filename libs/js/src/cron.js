'use strict';
// A small cron parser: 5 fields (minute hour day-of-month month day-of-week), UTC.
//
//   const c = parseCron('*/15 9-17 * * mon-fri');
//   c.next(new Date());     // the next matching minute, strictly after the given time
//
// Supports lists (1,5), ranges (1-5), steps (*/10, 5-30/5), names (jan, mon), and @hourly @daily @weekly @monthly @yearly.
// If both day-of-month and day-of-week are restricted, a day matching EITHER runs (standard cron behaviour).

const MONTHS = Object.fromEntries('jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').map((n, i) => [n, i + 1]));
const DAYS = Object.fromEntries('sun mon tue wed thu fri sat'.split(' ').map((n, i) => [n, i]));
const ALIASES = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };

function parseField(text, lo, hi, names) {
  const num = (tok) => {
    tok = tok.trim();
    if (names && Object.prototype.hasOwnProperty.call(names, tok)) return names[tok];
    if (!/^\d+$/.test(tok)) throw new Error(`Bad cron value: ${JSON.stringify(tok)}`);
    return parseInt(tok, 10);
  };
  const values = new Set();
  for (let part of text.split(',')) {
    let stepText = null;
    if (part.includes('/')) [part, stepText] = [part.slice(0, part.indexOf('/')), part.slice(part.indexOf('/') + 1)];
    let step = 1;
    if (stepText !== null) {
      if (!/^\d+$/.test(stepText) || parseInt(stepText, 10) < 1) throw new Error(`Bad cron step: ${JSON.stringify(stepText)}`);
      step = parseInt(stepText, 10);
    }
    let a;
    let b;
    if (part === '*' || part === '?') [a, b] = [lo, hi];
    else if (part.includes('-')) { const [x, y] = [part.slice(0, part.indexOf('-')), part.slice(part.indexOf('-') + 1)]; [a, b] = [num(x), num(y)]; }
    else { a = num(part); b = stepText !== null ? hi : a; }
    if (!(lo <= a && a <= b && b <= hi)) throw new Error(`Cron value out of range (${lo}-${hi}): ${JSON.stringify(part)}`);
    for (let v = a; v <= b; v += step) values.add(v);
  }
  return values;
}

class Cron {
  constructor(expression) {
    this.source = expression;
    const key = expression.trim().toLowerCase();
    const fields = (ALIASES[key] || expression).trim().toLowerCase().split(/\s+/);
    if (fields.length !== 5) throw new Error('A cron expression needs 5 fields: minute hour day-of-month month day-of-week');
    this.minutes = parseField(fields[0], 0, 59);
    this.hours = parseField(fields[1], 0, 23);
    this.dom = parseField(fields[2], 1, 31);
    this.months = parseField(fields[3], 1, 12, MONTHS);
    this.dow = new Set([...parseField(fields[4], 0, 7, DAYS)].map((d) => d % 7)); // 7 is also Sunday
    this.domStar = fields[2].startsWith('*');
    this.dowStar = fields[4].startsWith('*');
  }

  #dayOk(t) {
    const domOk = this.dom.has(t.getUTCDate());
    const dowOk = this.dow.has(t.getUTCDay()); // cron: Sunday = 0, same as JavaScript
    if (!this.domStar && !this.dowStar) return domOk || dowOk;
    if (!this.domStar) return domOk;
    if (!this.dowStar) return dowOk;
    return true;
  }

  matches(when) {
    const t = new Date(when);
    return this.minutes.has(t.getUTCMinutes()) && this.hours.has(t.getUTCHours()) && this.months.has(t.getUTCMonth() + 1) && this.#dayOk(t);
  }

  /** The first matching minute strictly after `after` (a Date or anything Date accepts). Returns a Date. */
  next(after) {
    const a = new Date(after);
    let t = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate(), a.getUTCHours(), a.getUTCMinutes() + 1));
    const limit = t.getUTCFullYear() + 8;
    while (t.getUTCFullYear() <= limit) {
      const [y, mo, d, h, mi] = [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes()];
      if (!this.months.has(mo + 1)) t = new Date(Date.UTC(y, mo + 1, 1, 0, 0));
      else if (!this.#dayOk(t)) t = new Date(Date.UTC(y, mo, d + 1, 0, 0));
      else if (!this.hours.has(h)) t = new Date(Date.UTC(y, mo, d, h + 1, 0));
      else if (!this.minutes.has(mi)) t = new Date(Date.UTC(y, mo, d, h, mi + 1));
      else return t;
    }
    throw new Error('No matching time in the next 8 years');
  }
}

const parseCron = (expression) => new Cron(expression);

module.exports = { parseCron, Cron };
