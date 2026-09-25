'use strict';
// A small JSON client for third-party APIs (uses Node's built-in fetch).
// Adds what every bot needs and forgets: a timeout, a User-Agent, a couple of retries
// on network errors and 5xx, and a tiny in-memory cache so ten people running /weather
// in a minute make one request instead of ten.

// Some APIs (Wikipedia, MusicBrainz, Nominatim, Scryfall, Chess.com...) require a real
// contact in the User-Agent. Change this before you go public.
const DEFAULT_USER_AGENT = 'BotBenchToolkit/1.0 (Discord bot; contact: you@example.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Browsers don't let you set User-Agent, and any custom header triggers a CORS preflight that
// most free APIs refuse. So we only send it on servers (Node, Deno, Bun).
const IS_BROWSER = typeof document !== 'undefined';

/** AbortSignal.timeout with a fallback for older browsers. */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Thrown when an outside API fails. `status` is 0 for network errors. */
class ApiError extends Error {
  constructor(status, url, message = '', retryAfter = null) {
    super(`HTTP ${status} from ${url}: ${message}`.trim());
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.retryAfter = retryAfter;
  }
}

/** Thrown when an API works but finds nothing. The message is safe to show to users. */
class LookupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LookupError';
  }
}

class ApiClient {
  /**
   * @param {object} [o]
   * @param {(url: string) => string} [o.proxy] rewrite every URL, e.g. to go through your own CORS proxy in a browser
   * @param {typeof fetch} [o.fetch] custom fetch (for tests, or a fetch with your own agent)
   */
  constructor({ userAgent = DEFAULT_USER_AGENT, timeoutMs = 8000, retries = 2, cacheTtlMs = 60_000, proxy = null, fetch: fetchImpl = null } = {}) {
    this.proxy = proxy;
    this.fetch = fetchImpl;
    this.userAgent = userAgent;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
  }

  #prune() {
    const now = Date.now();
    for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k);
  }

  /** GET a URL and return parsed JSON. `ttlMs: 0` turns the cache off for this call. */
  async getJson(url, { params, headers, ttlMs } = {}) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, String(v));
    const ttl = ttlMs ?? this.cacheTtlMs;
    const key = u.href + JSON.stringify(headers || {});
    const now = Date.now();
    if (ttl > 0) {
      const hit = this.cache.get(key);
      if (hit && hit.expires > now) return hit.data;
    }

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      let res;
      try {
        const doFetch = this.fetch || globalThis.fetch.bind(globalThis);
        res = await doFetch(this.proxy ? this.proxy(u.href) : u, {
          headers: { ...(IS_BROWSER ? {} : { 'User-Agent': this.userAgent }), Accept: 'application/json', ...headers },
          signal: timeoutSignal(this.timeoutMs),
        });
      } catch (err) {
        if (attempt < this.retries) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw new ApiError(0, u.href, `network error: ${err.message}`);
      }
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        throw new ApiError(429, u.href, 'rate limited', Number.isFinite(ra) ? ra : null);
      }
      if (res.status >= 500 && attempt < this.retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      const text = await res.text();
      if (res.status >= 400) throw new ApiError(res.status, u.href, text.slice(0, 200));
      let data;
      try {
        data = JSON.parse(text); // parse ourselves: many APIs send JSON with the wrong content-type
      } catch {
        throw new ApiError(res.status, u.href, 'response was not valid JSON');
      }
      if (ttl > 0) {
        if (this.cache.size > 500) this.#prune();
        this.cache.set(key, { expires: now + ttl, data });
      }
      return data;
    }
    throw new ApiError(0, u.href, 'request failed');
  }
}

module.exports = { ApiClient, ApiError, LookupError, DEFAULT_USER_AGENT };
