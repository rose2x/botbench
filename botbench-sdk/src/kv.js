'use strict';
// A tiny async key-value store, like puter.kv. Values are JSON. Optional expiry.
// Uses localStorage in browsers and memory elsewhere. Plug in your own backend with kv.use().
//
//   await kv.set('score:alice', 10);
//   await kv.incr('score:alice');            // 11
//   await kv.get('score:alice');             // 11
//   await kv.set('cooldown:bob', true, { ttlSeconds: 30 });
//   await kv.list('score:');                 // [{ key: 'score:alice', value: 11 }]

function memoryBackend() {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); }, delete: (k) => { m.delete(k); }, keys: () => [...m.keys()] };
}

function localStorageBackend(prefix = 'botbench:') {
  const ls = globalThis.localStorage;
  return {
    get: (k) => ls.getItem(prefix + k),
    set: (k, v) => ls.setItem(prefix + k, v),
    delete: (k) => ls.removeItem(prefix + k),
    keys: () => Object.keys(ls).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)),
  };
}

function defaultBackend() {
  try {
    const ls = globalThis.localStorage;
    if (ls) { ls.setItem('__bb_probe', '1'); ls.removeItem('__bb_probe'); return localStorageBackend(); }
  } catch { /* storage blocked: fall through to memory */ }
  return memoryBackend();
}

function createKV(initial) {
  let backend = initial || defaultBackend();
  const read = async (key) => {
    const raw = await backend.get(key);
    if (raw === null || raw === undefined) return null;
    let rec;
    try { rec = JSON.parse(raw); } catch { return null; }
    if (rec.exp && rec.exp <= Date.now()) { await backend.delete(key); return null; }
    return rec;
  };
  return {
    /** Swap the storage backend: an object with get/set/delete/keys (sync or async). */
    use(b) { backend = b; return this; },
    async get(key, fallback = null) { const r = await read(key); return r ? r.v : fallback; },
    async set(key, value, { ttlSeconds } = {}) {
      await backend.set(key, JSON.stringify({ v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 }));
      return value;
    },
    async del(key) { await backend.delete(key); },
    async incr(key, by = 1) { const cur = Number(await this.get(key, 0)) || 0; return this.set(key, cur + by); },
    async list(prefix = '') {
      const out = [];
      for (const k of await backend.keys()) {
        if (!k.startsWith(prefix)) continue;
        const r = await read(k);
        if (r) out.push({ key: k, value: r.v });
      }
      return out;
    },
    async clear(prefix = '') { for (const k of await backend.keys()) if (k.startsWith(prefix)) await backend.delete(k); },
  };
}

module.exports = { createKV, memoryBackend, localStorageBackend };
