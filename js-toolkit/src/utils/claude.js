'use strict';
// A small client for the Claude API (Anthropic Messages API), using Node's built-in fetch.
//
//   const claude = new ClaudeClient(process.env.ANTHROPIC_API_KEY);
//   const answer = await claude.ask('What is a slash command?', { system: 'Answer in one sentence.' });
//
// The default model is a small, fast one to keep bot costs low. Change it with CLAUDE_MODEL or the
// `model` option. See https://docs.claude.com for current model names and prices.
// Every call costs money, so put cooldowns and a daily cap in front of it (commands/ai.js does).

const { ApiError, LookupError } = require('./apiClient');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const API_VERSION = '2023-06-01';

class ClaudeClient {
  constructor(apiKey, { model, base = 'https://api.anthropic.com', timeoutMs = 60_000 } = {}) {
    this.apiKey = apiKey;
    this.model = model || process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    this.base = base.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  /** Send one user message and return the text of the reply. */
  async ask(prompt, { system, maxTokens = 600 } = {}) {
    const url = `${this.base}/v1/messages`;
    const body = { model: this.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
    if (system) body.system = system;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ApiError(0, url, `network error: ${err.message}`);
    }
    const text = await res.text();
    if (res.status >= 400) {
      let message = text.slice(0, 200);
      try { message = JSON.parse(text).error.message; } catch { /* keep the raw text */ }
      throw new ApiError(res.status, url, message);
    }
    const parts = (JSON.parse(text).content || []).filter((b) => b.type === 'text').map((b) => b.text);
    if (!parts.length) throw new LookupError('The AI returned an empty answer.');
    return parts.join('').trim();
  }
}

/** Allow each user N calls per UTC day. In memory: resets when the bot restarts. */
class UsageLimiter {
  constructor(perDay, now = () => new Date()) {
    this.perDay = perDay;
    this.now = now;
    this.day = this.#today();
    this.counts = new Map();
  }
  #today() { return this.now().toISOString().slice(0, 10); }
  /** Returns { allowed, left }. Counts the call if allowed. */
  allow(userId) {
    const today = this.#today();
    if (today !== this.day) { this.day = today; this.counts = new Map(); }
    const used = this.counts.get(userId) || 0;
    if (used >= this.perDay) return { allowed: false, left: 0 };
    this.counts.set(userId, used + 1);
    return { allowed: true, left: this.perDay - used - 1 };
  }
  /** Give a call back (for example when the API failed and the user got nothing). */
  refund(userId) {
    const used = this.counts.get(userId) || 0;
    if (used > 0) this.counts.set(userId, used - 1);
  }
}

module.exports = { ClaudeClient, UsageLimiter, DEFAULT_MODEL };
