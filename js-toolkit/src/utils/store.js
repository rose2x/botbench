'use strict';
// A tiny JSON-file key/value store. Good for small bots. Use a real database when you grow.
// Writes are debounced and atomic (write a temp file, then rename).

const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  constructor(file = 'data/store.json', { debounceMs = 500 } = {}) {
    this.file = file;
    this.debounceMs = debounceMs;
    this.timer = null;
    this.dirty = false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.data = {}; }
    process.once('exit', () => this.flush());
  }
  get(key, fallback = undefined) { return key in this.data ? this.data[key] : fallback; }
  set(key, value) { this.data[key] = value; this.#schedule(); return value; }
  delete(key) { delete this.data[key]; this.#schedule(); }
  entries() { return Object.entries(this.data); }
  #schedule() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
    this.timer.unref?.();
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return; // nothing changed since the last write
    this.dirty = false;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { JsonStore };
