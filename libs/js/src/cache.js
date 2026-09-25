'use strict';
// A TTL + LRU cache and a memoize helper (concurrent calls share one in-flight request).

const MISSING = Symbol('missing');
const defaultNow = () => Date.now() / 1000;

class TTLCache {
  constructor({ maxSize = 128, ttl = 60, now = defaultNow } = {}) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.now = now;
    this.data = new Map(); // insertion order = least recently used first
  }
  get(key, fallback = null) {
    const item = this.data.get(key);
    if (item === undefined) return fallback;
    if (item.expires <= this.now()) { this.data.delete(key); return fallback; }
    this.data.delete(key);
    this.data.set(key, item);
    return item.value;
  }
  has(key) { return this.get(key, MISSING) !== MISSING; }
  set(key, value, ttl) {
    this.data.delete(key);
    this.data.set(key, { value, expires: this.now() + (ttl ?? this.ttl) });
    while (this.data.size > this.maxSize) this.data.delete(this.data.keys().next().value);
  }
  delete(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
  get size() { return this.data.size; }
}

/** Cache an async function's results for `ttl` seconds. Errors are not cached. */
function memoize(fn, { ttl = 60, maxSize = 128, key = (...args) => JSON.stringify(args) } = {}) {
  const cache = new TTLCache({ ttl, maxSize });
  const inflight = new Map();
  const wrapper = async (...args) => {
    const k = key(...args);
    const hit = cache.get(k, MISSING);
    if (hit !== MISSING) return hit;
    if (inflight.has(k)) return inflight.get(k);
    const p = (async () => fn(...args))().then((value) => { cache.set(k, value); return value; }).finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  };
  wrapper.cache = cache;
  return wrapper;
}

module.exports = { TTLCache, memoize };
