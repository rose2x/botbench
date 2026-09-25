'use strict';
// Pure helpers for Discord bots. No dependencies, no network. Work everywhere.
// Permissions and intents are BigInt/number bit fields built from the reference tables.

const { PERMS, INTENTS } = require('./referenceData');

// ---------------------------------------------------------------- permissions and intents
const shiftOf = (s) => BigInt(String(s).split('<<')[1].trim());
const clean = (n) => n.replace(/\s*\(.*\)/, '').trim();

/** name -> BigInt bit. Names are Discord's, like SEND_MESSAGES. */
const PERMISSIONS = Object.fromEntries(PERMS.map(([n, v]) => [clean(n), 1n << shiftOf(v)]));
/** name -> number bit. Intents fit in 32 bits, so plain numbers are fine. */
const INTENT_BITS = Object.fromEntries(INTENTS.map(([n, v]) => [n, 2 ** Number(shiftOf(v))]));

function permissionsToBits(names) {
  return names.reduce((acc, n) => {
    if (!(n in PERMISSIONS)) throw new Error(`Unknown permission: ${n}`);
    return acc | PERMISSIONS[n];
  }, 0n);
}
const bitsToPermissions = (bits) => Object.entries(PERMISSIONS).filter(([, b]) => (BigInt(bits) & b) === b).map(([n]) => n);
/** Administrator implies every permission. */
function hasPermission(bits, name) {
  const b = BigInt(bits);
  return (b & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR || (b & PERMISSIONS[name]) === PERMISSIONS[name];
}
function intentsToBits(names) {
  return names.reduce((acc, n) => {
    if (!(n in INTENT_BITS)) throw new Error(`Unknown intent: ${n}`);
    return acc + INTENT_BITS[n];
  }, 0);
}
const bitsToIntents = (bits) => Object.entries(INTENT_BITS).filter(([, b]) => (Number(bits) & b) === b).map(([n]) => n);
const PRIVILEGED_INTENTS = new Set(INTENTS.filter((i) => i[3]).map((i) => i[0]));

/** Build the "add bot to server" link. */
function inviteUrl(clientId, { permissions = [], scopes = ['bot', 'applications.commands'], guildId } = {}) {
  const p = new URLSearchParams({ client_id: String(clientId), scope: scopes.join(' ') });
  if (permissions.length) p.set('permissions', permissionsToBits(permissions).toString());
  if (guildId) p.set('guild_id', String(guildId));
  return `https://discord.com/oauth2/authorize?${p.toString().replace(/\+/g, '%20')}`;
}

// ---------------------------------------------------------------- snowflakes, mentions, timestamps
const DISCORD_EPOCH = 1420070400000n;
/** Every Discord id hides the time it was made. */
function snowflakeParts(id) {
  const n = BigInt(id);
  return { timestamp: Number((n >> 22n) + DISCORD_EPOCH), workerId: Number((n & 0x3E0000n) >> 17n), processId: Number((n & 0x1F000n) >> 12n), increment: Number(n & 0xFFFn) };
}
const snowflakeToDate = (id) => new Date(snowflakeParts(id).timestamp);

const userMention = (id) => `<@${id}>`;
const channelMention = (id) => `<#${id}>`;
const roleMention = (id) => `<@&${id}>`;
/** Discord shows this in each reader's own time zone. Styles: t T d D f F R (R = "2 hours ago"). */
function timestamp(date, style = 'f') {
  if (!'tTdDfFR'.includes(style)) throw new Error('Style must be one of t T d D f F R');
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}

// ---------------------------------------------------------------- text
const escapeMarkdown = (text) => String(text).replace(/([\\*_`~|>])/g, '\\$1');
/** Escape mentions so text can't ping @everyone or roles. */
const neutralizeMentions = (text) => String(text).replace(/@(everyone|here)/g, '@\u200b$1').replace(/<@([!&]?\d+)>/g, '<@\u200b$1>');

/** Split long text into pieces of at most `limit` characters, preferring line breaks then spaces. */
function chunkMessage(text, limit = 2000) {
  const out = [];
  let rest = String(text);
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s/, '');
  }
  if (rest.length) out.push(rest);
  return out;
}
const clip = (text, limit) => (text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`);

// ---------------------------------------------------------------- embeds and components (raw JSON)
const parseColor = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16));

/** Build a raw embed object with Discord's size limits applied. */
function embed({ title, description, url, color = 0x5865F2, fields = [], footer, image, thumbnail, author, timestamp: ts } = {}) {
  if (fields.length > 25) throw new Error('An embed can have at most 25 fields');
  const e = { color: parseColor(color) };
  if (title) e.title = clip(title, 256);
  if (description) e.description = clip(description, 4096);
  if (url) e.url = url;
  if (fields.length) e.fields = fields.map((f) => ({ name: clip(String(f.name), 256), value: clip(String(f.value), 1024), inline: !!f.inline }));
  if (footer) e.footer = { text: clip(footer, 2048) };
  if (image) e.image = { url: image };
  if (thumbnail) e.thumbnail = { url: thumbnail };
  if (author) e.author = { name: clip(author, 256) };
  if (ts) e.timestamp = new Date(ts).toISOString();
  const total = (e.title?.length || 0) + (e.description?.length || 0) + (e.footer?.text.length || 0) + (e.author?.name.length || 0) + (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);
  if (total > 6000) throw new Error(`Embed is ${total} characters. The limit is 6000 across all text.`);
  return e;
}

const BUTTON_STYLES = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
/** A button. Use `url` for link buttons, otherwise `customId`. */
function button({ label, customId, url, style = 'primary', disabled = false, emoji }) {
  const b = { type: 2, label: clip(label, 80), style: url ? 5 : BUTTON_STYLES[style], disabled };
  if (!BUTTON_STYLES[style] && !url) throw new Error(`Unknown button style: ${style}`);
  if (url) b.url = url; else b.custom_id = customId;
  if (emoji) b.emoji = typeof emoji === 'string' ? { name: emoji } : emoji;
  return b;
}
/** A dropdown of text options. `options`: [{ label, value, description }] (up to 25). */
function stringSelect({ customId, options, placeholder, minValues = 1, maxValues = 1 }) {
  if (options.length < 1 || options.length > 25) throw new Error('A select menu needs 1 to 25 options');
  return { type: 3, custom_id: customId, placeholder, min_values: minValues, max_values: Math.min(maxValues, options.length), options };
}
/** A row holds up to 5 buttons, or exactly one select menu. */
function actionRow(...components) {
  const hasSelect = components.some((c) => c.type === 3);
  if (hasSelect && components.length !== 1) throw new Error('A select menu must be alone in its row');
  if (components.length < 1 || components.length > 5) throw new Error('A row holds 1 to 5 components');
  return { type: 1, components };
}
const allowedMentions = { none: () => ({ parse: [] }), users: (...ids) => ({ parse: [], users: ids.map(String) }) };

module.exports = {
  PERMISSIONS, INTENT_BITS, PRIVILEGED_INTENTS,
  permissionsToBits, bitsToPermissions, hasPermission, intentsToBits, bitsToIntents, inviteUrl,
  snowflakeParts, snowflakeToDate, userMention, channelMention, roleMention, timestamp,
  escapeMarkdown, neutralizeMentions, chunkMessage, clip,
  embed, button, stringSelect, actionRow, allowedMentions, parseColor,
};
