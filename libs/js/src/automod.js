'use strict';
// Auto-moderation rules as pure logic: you feed it messages, it tells you which rules were broken.
//
//   const mod = new AutoMod({ maxMessages: 5, window: 5, blockedTerms: ['badword'] });
//   mod.check({ authorId: 1, content: 'hello', timestamp: 12, mentions: 0 });   // -> []
//
// It never deletes or punishes anything. You decide what to do with the rule names it returns:
// "rate", "duplicate", "mention_spam", "caps", "invite", "blocked_term", "repeat_chars".
// There is deliberately NO built-in word list: you supply blockedTerms for your community.
// Blocked terms match whole words after normalising look-alikes ("B4d W0rd" -> "bad word"), which avoids the
// classic false positives from matching inside other words.

const DEFAULTS = {
  maxMessages: 5, // more than this many messages in `window` seconds -> "rate"
  window: 5,
  maxDuplicates: 3, // this many identical messages in `window` seconds -> "duplicate"
  maxMentions: 5, // more than this many mentions in one message -> "mention_spam"
  maxCapsRatio: 0.7, // more than 70% capitals (in messages of 10+ letters) -> "caps"
  blockInvites: true,
  blockedTerms: [],
  maxRepeat: 10, // a character repeated more than this many times in a row -> "repeat_chars"
};
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const INVITE = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-z0-9-]+/i;

/** Lowercase, strip accents and invisible characters, undo common look-alikes, squash long repeats. */
function normalize(text) {
  const s = String(text).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[\u200b-\u200f\u2060\ufeff]/g, '').toLowerCase().replace(/[013457@$]/g, (c) => LEET[c]);
  return s.replace(/(.)\1{2,}/gu, '$1$1');
}
const tokens = (text) => normalize(text).match(/[\p{L}\p{N}]+/gu) || [];
const words = (text) => ` ${tokens(text).join(' ')} `;

class AutoMod {
  constructor(config = {}) {
    this.cfg = { ...DEFAULTS, ...config };
    this.terms = this.cfg.blockedTerms.filter((t) => tokens(t).length).map(words);
    this.history = new Map();
    this.repeat = new RegExp(`(.)\\1{${this.cfg.maxRepeat},}`, 'u');
  }

  /** msg: { authorId, content, timestamp (seconds), mentions (count) }. Returns the rules broken, in a fixed order. */
  check(msg) {
    const c = this.cfg;
    const content = msg.content || '';
    const ts = Number(msg.timestamp);
    if (!this.history.has(msg.authorId)) this.history.set(msg.authorId, []);
    const q = this.history.get(msg.authorId);
    while (q.length && q[0][0] <= ts - c.window) q.shift();
    const key = content.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
    q.push([ts, key]);
    const out = [];
    if (q.length > c.maxMessages) out.push('rate');
    if (key && q.filter(([, k]) => k === key).length >= c.maxDuplicates) out.push('duplicate');
    if ((msg.mentions || 0) > c.maxMentions) out.push('mention_spam');
    const letters = Array.from(content).filter((ch) => /\p{L}/u.test(ch));
    if (letters.length >= 10 && letters.filter((ch) => /\p{Lu}/u.test(ch)).length / letters.length > c.maxCapsRatio) out.push('caps');
    if (c.blockInvites && INVITE.test(content)) out.push('invite');
    if (this.terms.length) {
      const padded = words(content);
      if (this.terms.some((t) => padded.includes(t))) out.push('blocked_term');
    }
    if (this.repeat.test(content)) out.push('repeat_chars');
    return out;
  }
}

/** Flags a burst of joins: `limit` joins within `window` seconds. */
class RaidDetector {
  constructor(limit = 5, window = 10) {
    this.limit = limit;
    this.window = window;
    this.joins = [];
  }
  recordJoin(userId, timestamp) {
    while (this.joins.length && this.joins[0][0] <= timestamp - this.window) this.joins.shift();
    this.joins.push([timestamp, userId]);
    return this.joins.length >= this.limit;
  }
  recentUsers() { return this.joins.map(([, u]) => u); }
}

module.exports = { AutoMod, RaidDetector, normalize, DEFAULTS };
