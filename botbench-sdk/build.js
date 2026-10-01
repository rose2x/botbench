'use strict';
// Bundles src/ into dist/botbench.js (UMD), dist/botbench.mjs (ES module) and, if `terser` is
// installed, dist/botbench.min.js. No other tooling. Run:  node build.js
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const { version } = require('./package.json');
const order = ['referenceData', 'apiClient', 'apis', 'directory', 'discordRest', 'gateway', 'discordUtils', 'signature', 'kv', 'index'];

const modules = order.map((name) => {
  const code = fs.readFileSync(path.join(SRC, `${name}.js`), 'utf8').replace(/^#!.*\n/, '');
  return `  ${JSON.stringify(name)}: function (module, exports, require) {\n${code.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n')}\n  }`;
}).join(',\n');

const core = `var hostRequire = typeof require === 'function' ? require : null;
  var defs = {
${modules}
  };
  var cache = {};
  function load(name) {
    if (cache[name]) return cache[name].exports;
    var module = cache[name] = { exports: {} };
    var req = function (id) {
      var key = String(id).replace(/^\\.\\//, '').replace(/\\.js$/, '');
      if (defs[key]) return load(key);
      if (hostRequire) return hostRequire(id); // e.g. the optional "ws" package on old Node versions
      throw new Error('botbench: module not available: ' + id);
    };
    defs[name](module, module.exports, req);
    return module.exports;
  }
  var botbench = load('index');`;

const banner = `/*! botbench ${version} | Discord bot toolkit in one script | MIT */\n`;
const umd = `${banner}(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.botbench = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  ${core}
  return botbench;
});
`;
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'botbench.js'), umd);

const names = ['fun', 'info', 'money', 'dev', 'games', 'media', 'apis', 'directory', 'reference', 'discord', 'kv', 'config', 'help'];
const esm = `${banner}const botbench = (function () {
  'use strict';
  ${core}
  return botbench;
})();
export default botbench;
export const { ${names.join(', ')} } = botbench;
`;
fs.writeFileSync(path.join(DIST, 'botbench.mjs'), esm);

let size = `${(umd.length / 1024).toFixed(0)} KB`;
try {
  const { minify } = require('terser');
  minify(umd, { compress: true, mangle: true, format: { comments: /^!/ } }).then((r) => {
    fs.writeFileSync(path.join(DIST, 'botbench.min.js'), r.code);
    console.log(`built dist/botbench.js (${size}), botbench.mjs, botbench.min.js (${(r.code.length / 1024).toFixed(0)} KB)`);
  });
} catch {
  console.log(`built dist/botbench.js (${size}) and botbench.mjs. Install terser to also make botbench.min.js`);
}
