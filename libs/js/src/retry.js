'use strict';
// Retry an async call with exponential backoff and jitter.
//
//   const result = await retry(() => fetchThing(), { attempts: 4, retryOn: (err) => err.status >= 500 });
//
// If the error has a numeric `retryAfter` (seconds), the wait is at least that long.

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** The waits between attempts: 0.5, 1, 2, 4 ... seconds, capped at maxDelay. There are attempts - 1 of them. */
function backoffDelays(attempts, base = 0.5, factor = 2, maxDelay = 30) {
  return Array.from({ length: Math.max(attempts - 1, 0) }, (_, i) => Math.min(maxDelay, base * factor ** i));
}

async function retry(fn, { attempts = 3, base = 0.5, factor = 2, maxDelay = 30, jitter = 0, retryOn = () => true, sleep = (s) => sleepMs(s * 1000), rng = Math.random } = {}) {
  const delays = backoffDelays(attempts, base, factor, maxDelay);
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1 || !retryOn(err)) throw err;
      let delay = delays[i];
      delay += delay * jitter * rng();
      if (typeof err?.retryAfter === 'number') delay = Math.max(delay, err.retryAfter);
      await sleep(delay);
    }
  }
  return undefined;
}

module.exports = { retry, backoffDelays };
