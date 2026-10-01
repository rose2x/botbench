'use strict';
// The free-API directory as objects, with search.
//
//   node src/utils/directory.js                 # list types
//   node src/utils/directory.js search weather  # search
//   node src/utils/directory.js nokey           # only APIs that need no key

const { APIS } = require('./referenceData');

const ALL = APIS.map(([name, type, key, description, url]) => ({ name, type, key, description, url, needsKey: key !== 'None' }));

const types = () => [...new Set(ALL.map((a) => a.type))].sort();
const byType = (kind) => ALL.filter((a) => a.type.toLowerCase() === kind.toLowerCase());
const noKey = () => ALL.filter((a) => !a.needsKey);

/** All words must appear in the name, type, description or url. Name matches come first. */
function search(query, { onlyNoKey = false, type, limit = 25 } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  for (const a of ALL) {
    if (onlyNoKey && a.needsKey) continue;
    if (type && a.type.toLowerCase() !== type.toLowerCase()) continue;
    const hay = `${a.name} ${a.type} ${a.description} ${a.url}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) hits.push([words.every((w) => a.name.toLowerCase().includes(w)) ? 0 : 1, a]);
  }
  return hits.sort((x, y) => x[0] - y[0]).slice(0, limit).map((h) => h[1]);
}

module.exports = { ALL, types, byType, noKey, search };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const show = (items) => {
    for (const a of items) console.log(`${a.name.padEnd(26)} ${a.type.padEnd(16)} key: ${a.key.padEnd(9)} ${a.url}`);
    console.log(`\n${items.length} result(s)`);
  };
  if (!cmd) for (const t of types()) console.log(`${t.padEnd(18)} ${byType(t).length}`);
  else if (cmd === 'search') show(search(rest.join(' ')));
  else if (cmd === 'nokey') show(noKey());
  else show(byType([cmd, ...rest].join(' ')));
}
