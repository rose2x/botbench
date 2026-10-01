#!/usr/bin/env node
'use strict';
// The reverse of generate-data.js: read the data block out of website/index.html into
// data/reference-data.json. Handy if you edited the lists inside the website directly.
// Usage: node scripts/extract-from-site.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'website', 'index.html'), 'utf8');
const a = html.indexOf('/* ================= DATA');
const b = html.indexOf('/* ================= HELPERS');
if (a < 0 || b < 0) throw new Error('Could not find the DATA block in website/index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${html.slice(a, b)}\nthis.out={ENDPOINTS,OPCODES,EVENTS,INTENTS,PERMS,ITYPES,SCOPES,LIMITS,CLOSES,ERRORS,LIBS,TOOLS,DOCS,APIS,PROJECTS};`, ctx);
fs.writeFileSync(path.join(root, 'data', 'reference-data.json'), `${JSON.stringify(ctx.out, null, 1)}\n`);
console.log('Wrote data/reference-data.json:', Object.entries(ctx.out).map(([k, v]) => `${k}=${v.length}`).join(' '));
