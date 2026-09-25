'use strict';
// In-memory rate limiters. Pass `now` (a function returning seconds) to test with a fake clock.
//
//   const bucket = new TokenBucket(5, 1);        // bursts of 5, then 1 per second
//   const window = new SlidingWindow(3, 10);     // 3 hits per 10 seconds per key
//   const cooldowns = new Cooldowns(5);          // one use per key every 5 seconds

const defaultNow = () => Date.now() / 1000;

class TokenBucket {
  constructor(capacity, refillPerSecond, now = defaultNow) {
    this.capacity = capacity;
    this.rate = refillPerSecond;
    this.now = now;
    this.tokens = capacity;
    this.last = now();
  }
  #refill() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.last) * this.rate);
    this.last = t;
  }
  tryTake(n = 1) {
    this.#refill();
    if (this.tokens >= n - 1e-9) { this.tokens -= n; return true; }
    return false;
  }
  /** Seconds until `n` tokens will be available (0 if they are now). */
  waitTime(n = 1) {
    this.#refill();
    return this.tokens >= n - 1e-9 ? 0 : (n - this.tokens) / this.rate;
  }
}

class SlidingWindow {
  constructor(limit, windowSeconds, now = defaultNow) {
    this.limit = limit;
    this.window = windowSeconds;
    this.now = now;
    this.hits = new Map();
  }
  /** Count one hit. Returns { allowed, remaining, retryAfter }. */
  hit(key = '') {
    const t = this.now();
    let q = this.hits.get(key);
    if (!q) { q = []; this.hits.set(key, q); }
    while (q.length && q[0] <= t - this.window) q.shift();
    if (q.length >= this.limit) return { allowed: false, remaining: 0, retryAfter: q[0] + this.window - t };
    q.push(t);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.length || v[v.length - 1] <= t - this.window) this.hits.delete(k);
    return { allowed: true, remaining: this.limit - q.length, retryAfter: 0 };
  }
}

class Cooldowns {
  constructor(seconds, now = defaultNow) {
    this.seconds = seconds;
    this.now = now;
    this.until = new Map();
  }
  /** 0 if the key may go now (and starts its cooldown), otherwise the seconds left. */
  use(key) {
    const t = this.now();
    const left = (this.until.get(key) || 0) - t;
    if (left > 1e-9) return left;
    this.until.set(key, t + this.seconds);
    return 0;
  }
}

module.exports = { TokenBucket, SlidingWindow, Cooldowns };
