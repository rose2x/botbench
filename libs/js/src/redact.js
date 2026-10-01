'use strict';
// Find and hide secrets (bot tokens, webhook URLs, API keys) in text, logs and files.
//
//   redact('token: ' + someToken)              // "token: [REDACTED:discord_token]"
//   npx botbench-scan-secrets src README.md    // scan files; exits 1 if it finds anything
//
// Pattern-based, so it's a safety net, not a guarantee. It won't catch a secret it has no pattern for.

const PATTERNS = [
  ['discord_webhook', /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+/g],
  ['discord_token', /[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,38}/g],
  ['anthropic_key', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['github_token', /gh[pousr]_[A-Za-z0-9]{36,}/g],
  ['aws_access_key', /AKIA[0-9A-Z]{16}/g],
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
];

/** Returns [{ kind, match, start, end }] sorted by position, without overlaps. */
function findSecrets(text) {
  const found = [];
  for (const [kind, rx] of PATTERNS) {
    for (const m of text.matchAll(new RegExp(rx.source, 'g'))) found.push({ kind, match: m[0], start: m.index, end: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = [];
  let lastEnd = -1;
  for (const f of found) if (f.start >= lastEnd) { out.push(f); lastEnd = f.end; }
  return out;
}

function redact(text, mask = (kind) => `[REDACTED:${kind}]`) {
  let out = '';
  let pos = 0;
  for (const f of findSecrets(text)) { out += text.slice(pos, f.start) + mask(f.kind); pos = f.end; }
  return out + text.slice(pos);
}

/** Make console.log/info/warn/error hide secrets. Returns a function that undoes it. */
function installConsoleRedaction(target = console) {
  const originals = {};
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[level] = target[level];
    target[level] = (...args) => originals[level].apply(target, args.map((a) => (typeof a === 'string' ? redact(a) : a)));
  }
  return () => Object.assign(target, originals);
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', 'venv', '.venv', '_site', 'release', 'dist']);

/** Scan files and folders (Node only). Findings show the kind and a masked preview, never the whole secret. */
function scanPaths(paths, { exclude = ['/test/', '/tests/'] } = {}) {
  const fs = require('node:fs');
  const path = require('node:path');
  const findings = [];
  const walk = function* (p) {
    const st = fs.statSync(p);
    if (st.isFile()) { yield p; return; }
    for (const name of fs.readdirSync(p).sort()) if (!SKIP_DIRS.has(name)) yield* walk(path.join(p, name));
  };
  for (const root of paths) {
    for (const file of walk(root)) {
      const norm = file.replace(/\\/g, '/');
      if (exclude.some((x) => norm.includes(x))) continue;
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      if (text.includes('\u0000')) continue; // binary
      for (const f of findSecrets(text)) findings.push({ path: file, line: text.slice(0, f.start).split('\n').length, kind: f.kind, preview: `${f.match.slice(0, 6)}…` });
    }
  }
  return findings;
}

function main(argv = process.argv.slice(2)) {
  const findings = scanPaths(argv.length ? argv : ['.']);
  for (const f of findings) console.log(`${f.path}:${f.line}: possible ${f.kind} (${f.preview})`);
  console.log(findings.length ? `${findings.length} possible secret(s) found` : 'No secrets found');
  return findings.length ? 1 : 0;
}

module.exports = { findSecrets, redact, installConsoleRedaction, scanPaths, main, PATTERNS };
