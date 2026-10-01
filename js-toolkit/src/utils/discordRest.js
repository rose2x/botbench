'use strict';
// Talk to the Discord REST API directly, with no discord library.
// Works in Node 18+, Deno, Bun and browsers (see the note on CORS in the README).
//
// Handles: the Authorization header, a User-Agent, audit-log reasons, per-route rate limits
// (from the X-RateLimit-* headers), the global limit, 429 retries and 5xx retries.
//
//   const rest = new DiscordREST(process.env.DISCORD_TOKEN);
//   await rest.sendMessage(channelId, 'Hello');
//
// The bucket handling is simplified: it groups by method + route with the major id (channel,
// guild or webhook) kept, which is enough for bots of normal size.

const API_BASE = 'https://discord.com/api/v10';
const DEFAULT_USER_AGENT = 'DiscordBot (https://example.com, 1.0) BotBenchToolkit';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IS_BROWSER = typeof document !== 'undefined'; // browsers forbid setting User-Agent

/** A non-2xx response. `code` is Discord's JSON error code (50013 = Missing Permissions). */
class DiscordAPIError extends Error {
  constructor(status, code, message, payload = null) {
    super(`HTTP ${status} (code ${code}): ${message}`);
    this.name = 'DiscordAPIError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

const MAJOR = /^\/(?:channels|guilds|webhooks)\/[^/]+/;
/** Rate-limit key: the method and route, keeping only the major id. */
function routeKey(method, path) {
  const m = path.match(MAJOR);
  const major = m ? m[0] : '';
  const rest = path.slice(major.length).replace(/\/\d{15,}/g, '/:id');
  return `${method.toUpperCase()} ${major}${rest}`;
}
const tryJson = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };

class DiscordREST {
  constructor(token, { base = API_BASE, userAgent = DEFAULT_USER_AGENT, maxRetries = 3, fetch: fetchImpl } = {}) {
    this.token = token;
    this.base = base.replace(/\/$/, '');
    this.userAgent = userAgent;
    this.maxRetries = maxRetries;
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.blockedUntil = new Map();
    this.globalUntil = 0;
    this.queues = new Map();
  }

  /** Low-level request. Requests to the same route run one at a time so limits are respected. */
  async request(method, path, { json, params, reason, auth = true } = {}) {
    const key = routeKey(method, path);
    const prev = this.queues.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((r) => { release = r; });
    this.queues.set(key, prev.then(() => gate));
    await prev;
    try {
      return await this.#send(key, method, path, { json, params, reason, auth });
    } finally {
      release();
      if (this.queues.size > 2000) this.queues.clear();
    }
  }

  async #send(key, method, path, { json, params, reason, auth }) {
    const headers = {};
    if (!IS_BROWSER) headers['User-Agent'] = this.userAgent;
    if (auth) headers.Authorization = `Bot ${this.token}`;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    if (reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(reason);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const wait = Math.max(this.blockedUntil.get(key) || 0, this.globalUntil) - Date.now();
      if (wait > 0) await sleep(wait);

      const url = new URL(this.base + path);
      for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      const res = await this.fetch(url, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
      const text = await res.text();
      const body = tryJson(text);

      const remaining = res.headers.get('x-ratelimit-remaining');
      const resetAfter = res.headers.get('x-ratelimit-reset-after');
      if (remaining === '0' && resetAfter) this.blockedUntil.set(key, Date.now() + Number(resetAfter) * 1000);

      if (res.status === 429) {
        const info = body && typeof body === 'object' ? body : {};
        const retry = Number(info.retry_after ?? resetAfter ?? 1) * 1000;
        if (info.global || res.headers.get('x-ratelimit-scope') === 'global') this.globalUntil = Date.now() + retry;
        else this.blockedUntil.set(key, Date.now() + retry);
        if (attempt < this.maxRetries) continue;
        throw new DiscordAPIError(429, null, 'rate limited', body);
      }
      if (res.status >= 500 && attempt < this.maxRetries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (res.status >= 400) {
        const info = body && typeof body === 'object' ? body : {};
        throw new DiscordAPIError(res.status, info.code ?? null, info.message ?? text.slice(0, 200), body);
      }
      return body;
    }
    throw new DiscordAPIError(0, null, 'request failed');
  }

  // ------------------------------------------------------------ users and gateway
  getMe() { return this.request('GET', '/users/@me'); }
  getUser(userId) { return this.request('GET', `/users/${userId}`); }
  getMyGuilds() { return this.request('GET', '/users/@me/guilds'); }
  getGatewayBot() { return this.request('GET', '/gateway/bot'); }
  createDM(userId) { return this.request('POST', '/users/@me/channels', { json: { recipient_id: String(userId) } }); }

  // ------------------------------------------------------------ messages
  sendMessage(channelId, content, { embeds, components, replyTo, allowedMentions } = {}) {
    const body = { allowed_mentions: allowedMentions || { parse: [] } };
    if (content !== undefined && content !== null) body.content = content;
    if (embeds?.length) body.embeds = embeds;
    if (components?.length) body.components = components;
    if (replyTo) body.message_reference = { message_id: String(replyTo) };
    return this.request('POST', `/channels/${channelId}/messages`, { json: body });
  }
  editMessage(channelId, messageId, fields) { return this.request('PATCH', `/channels/${channelId}/messages/${messageId}`, { json: fields }); }
  deleteMessage(channelId, messageId, reason) { return this.request('DELETE', `/channels/${channelId}/messages/${messageId}`, { reason }); }
  getMessages(channelId, { limit = 50, before, after } = {}) {
    return this.request('GET', `/channels/${channelId}/messages`, { params: { limit: Math.max(1, Math.min(limit, 100)), before, after } });
  }
  bulkDelete(channelId, messageIds, reason) {
    return this.request('POST', `/channels/${channelId}/messages/bulk-delete`, { json: { messages: messageIds.map(String) }, reason });
  }
  addReaction(channelId, messageId, emoji) {
    return this.request('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`);
  }
  startThread(channelId, messageId, name, autoArchiveMinutes = 1440) {
    return this.request('POST', `/channels/${channelId}/messages/${messageId}/threads`, { json: { name, auto_archive_duration: autoArchiveMinutes } });
  }

  // ------------------------------------------------------------ guilds and members
  getGuild(guildId) { return this.request('GET', `/guilds/${guildId}`); }
  getChannels(guildId) { return this.request('GET', `/guilds/${guildId}/channels`); }
  getRoles(guildId) { return this.request('GET', `/guilds/${guildId}/roles`); }
  getMember(guildId, userId) { return this.request('GET', `/guilds/${guildId}/members/${userId}`); }
  listMembers(guildId, { limit = 100, after } = {}) { return this.request('GET', `/guilds/${guildId}/members`, { params: { limit, after } }); }
  addRole(guildId, userId, roleId, reason) { return this.request('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason }); }
  removeRole(guildId, userId, roleId, reason) { return this.request('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason }); }
  kick(guildId, userId, reason) { return this.request('DELETE', `/guilds/${guildId}/members/${userId}`, { reason }); }
  ban(guildId, userId, { reason, deleteMessageSeconds = 0 } = {}) {
    return this.request('PUT', `/guilds/${guildId}/bans/${userId}`, { json: { delete_message_seconds: deleteMessageSeconds }, reason });
  }
  unban(guildId, userId, reason) { return this.request('DELETE', `/guilds/${guildId}/bans/${userId}`, { reason }); }
  /** Time a member out until a Date. `null` removes the timeout. */
  timeoutMember(guildId, userId, until, reason) {
    return this.request('PATCH', `/guilds/${guildId}/members/${userId}`, { json: { communication_disabled_until: until ? new Date(until).toISOString() : null }, reason });
  }
  createInvite(channelId, { maxAge = 86400, maxUses = 0 } = {}) {
    return this.request('POST', `/channels/${channelId}/invites`, { json: { max_age: maxAge, max_uses: maxUses } });
  }
  getAuditLog(guildId, { limit = 50, actionType } = {}) {
    return this.request('GET', `/guilds/${guildId}/audit-logs`, { params: { limit, action_type: actionType } });
  }

  // ------------------------------------------------------------ slash commands and interactions
  listCommands(appId, guildId) { return this.request('GET', guildId ? `/applications/${appId}/guilds/${guildId}/commands` : `/applications/${appId}/commands`); }
  /** Replace ALL commands (global, or for one guild). Guild commands appear instantly. */
  registerCommands(appId, commands, guildId) {
    return this.request('PUT', guildId ? `/applications/${appId}/guilds/${guildId}/commands` : `/applications/${appId}/commands`, { json: commands });
  }
  deleteCommand(appId, commandId, guildId) {
    return this.request('DELETE', `/applications/${appId}${guildId ? `/guilds/${guildId}` : ''}/commands/${commandId}`);
  }
  /** type 4 = message, 5 = "thinking...", 7 = edit the component's message, 9 = modal. */
  interactionRespond(interactionId, token, { type = 4, ...data } = {}) {
    const json = { type };
    if (Object.keys(data).length) json.data = data;
    return this.request('POST', `/interactions/${interactionId}/${token}/callback`, { json, auth: false });
  }
  editOriginal(appId, token, fields) { return this.request('PATCH', `/webhooks/${appId}/${token}/messages/@original`, { json: fields, auth: false }); }
  followup(appId, token, fields) { return this.request('POST', `/webhooks/${appId}/${token}`, { json: fields, auth: false }); }

  // ------------------------------------------------------------ webhooks (no bot token needed)
  webhookExecute(webhookId, webhookToken, { content, username, avatarUrl, embeds, wait = false, threadId } = {}) {
    const json = { allowed_mentions: { parse: [] } };
    if (content !== undefined) json.content = content;
    if (username) json.username = username;
    if (avatarUrl) json.avatar_url = avatarUrl;
    if (embeds?.length) json.embeds = embeds;
    return this.request('POST', `/webhooks/${webhookId}/${webhookToken}`, { json, params: { wait: wait ? 'true' : undefined, thread_id: threadId }, auth: false });
  }
}

module.exports = { DiscordREST, DiscordAPIError, routeKey, API_BASE };
