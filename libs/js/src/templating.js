'use strict';
// Safe message templates for welcome messages, embeds and notices.
//
//   render('Welcome {user.name|title} to {server}! {count} {count|plural:member:members}.',
//          { user: { name: 'ann' }, server: 'Bot Bench', count: 5 })
//
//   {name}                 value (dotted paths work: {user.name}); unknown names are left as they are
//   {name|filter:arg}      filters: upper lower title trim default:X truncate:N plural:one:many
//   {{ and }}              literal braces
// Pass { safe: true } to defuse @everyone / @here / mentions inside values (the template text itself is trusted).

const ZWSP = '\u200b';
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function lookup(vars, path) {
  let cur = vars;
  for (const part of path.trim().split('.')) {
    if (cur !== null && typeof cur === 'object' && !Array.isArray(cur) && has(cur, part)) cur = cur[part];
    else return null;
  }
  return cur === undefined ? null : cur;
}
const title = (s) => s.split(' ').map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
const neutralize = (s) => s.replace(/@(everyone|here)/g, `@${ZWSP}$1`).replace(/<@([!&]?\d+)>/g, `<@${ZWSP}$1>`);

function render(template, vars, { safe = false } = {}) {
  return template.replace(/\{\{|\}\}|\{([^{}]+)\}/g, (whole, inner) => {
    if (whole === '{{') return '{';
    if (whole === '}}') return '}';
    const parts = inner.split('|').map((p) => p.trim());
    const value = lookup(vars, parts[0]);
    const filters = parts.slice(1).map((p) => p.split(':'));
    const hasDefault = filters.some((f) => f[0] === 'default');
    if (value === null && !hasDefault) return whole;
    const raw = value;
    let text = value === null ? '' : String(value);
    for (const [name, ...args] of filters) {
      if (name === 'upper') text = text.toUpperCase();
      else if (name === 'lower') text = text.toLowerCase();
      else if (name === 'title') text = title(text);
      else if (name === 'trim') text = text.trim();
      else if (name === 'default') { if (text === '') text = args[0] ?? ''; }
      else if (name === 'truncate' && args[0] && /^\d+$/.test(args[0])) {
        const n = parseInt(args[0], 10);
        const chars = Array.from(text);
        text = chars.length <= n ? text : chars.slice(0, Math.max(n - 1, 0)).join('') + '…';
      } else if (name === 'plural' && args.length >= 2) {
        text = raw !== null && raw !== '' && Number(raw) === 1 ? args[0] : args[1];
      }
    }
    return safe ? neutralize(text) : text;
  });
}

module.exports = { render };
