'use strict';
// botbench: one script for everything a Discord bot project needs.
//
//   <script src="botbench.js"></script>
//   const joke = await botbench.fun.joke();
//   const w = await botbench.info.weatherForCity('Tokyo');
//   const url = botbench.discord.inviteUrl('CLIENT_ID', { permissions: ['SEND_MESSAGES'] });

const { ApiError, LookupError } = require('./apiClient');
const apis = require('./apis');
const directory = require('./directory');
const reference = require('./referenceData');
const { DiscordREST, DiscordAPIError } = require('./discordRest');
const { Gateway, GatewayError } = require('./gateway');
const { verifySignature } = require('./signature');
const utils = require('./discordUtils');
const { createKV, memoryBackend, localStorageBackend } = require('./kv');

const VERSION = '1.0.0';
const pick = (names) => Object.fromEntries(names.map((n) => [n, apis[n]]));

const groups = {
  fun: pick(['joke', 'dadJoke', 'chuckNorris', 'catFact', 'uselessFact', 'advice', 'dogImage', 'xkcd', 'rhymes', 'bibleVerse']),
  info: pick(['geocode', 'weather', 'weatherForCity', 'country', 'holidays', 'issPosition', 'wikiSummary', 'define', 'bookSearch']),
  money: pick(['cryptoPrice', 'exchangeRate']),
  dev: pick(['githubRepo', 'pypiPackage', 'npmPackage', 'hackerNews', 'shortenUrl', 'qrCodeUrl']),
  games: pick(['trivia', 'pokemon', 'scryfallCard', 'dndSpell', 'minecraftServer', 'minecraftUuid', 'chessProfile']),
  media: pick(['animeSearch', 'tvShow', 'musicSearch', 'randomCocktail', 'randomMeal', 'nasaApod']),
};
const flat = Object.assign({}, ...Object.values(groups));

const WEBHOOK = /\/webhooks\/(\d+)\/([\w-]+)/;

const botbench = {
  version: VERSION,
  ...groups,
  /** Every API wrapper in one flat object: botbench.apis.joke() */
  apis: flat,
  directory: { all: directory.ALL, types: directory.types, byType: directory.byType, noKey: directory.noKey, search: directory.search },
  /** Endpoints, opcodes, intents, permissions, error codes... as plain arrays. */
  reference,
  discord: {
    /** A REST client with rate limits: botbench.discord.rest(token).sendMessage(channelId, 'hi'). Run it on a server, not in a browser. */
    rest: (token, opts) => new DiscordREST(token, opts),
    /** Post to a channel with only a webhook URL. Safe to use from a browser you control. */
    webhook(url, opts) {
      const m = String(url).match(WEBHOOK);
      if (!m) throw new Error('That does not look like a Discord webhook URL');
      const threadId = new URL(url).searchParams.get('thread_id') || undefined;
      const rest = new DiscordREST('', opts);
      return { send: (msg) => rest.webhookExecute(m[1], m[2], { ...(typeof msg === 'string' ? { content: msg } : msg), threadId }) };
    },
    /** A Gateway connection for reading events. Run it on a server. */
    gateway: (token, intents, opts) => new Gateway(token, intents, opts),
    /** Check the Ed25519 signature on an HTTP interaction. Works on Node 20+, Deno, Bun, Workers. */
    verifySignature,
    ...utils,
  },
  kv: createKV(),
  createKV,
  backends: { memory: memoryBackend, localStorage: localStorageBackend },
  /** Change how outside APIs are called. In a browser, set `proxy` if an API blocks CORS:
   *  botbench.config({ proxy: (url) => 'https://my-proxy.example/?url=' + encodeURIComponent(url) }) */
  config(o = {}) {
    const c = apis.client;
    if ('proxy' in o) c.proxy = o.proxy;
    if ('fetch' in o) c.fetch = o.fetch;
    if (o.userAgent) c.userAgent = o.userAgent;
    if (o.timeoutMs) c.timeoutMs = o.timeoutMs;
    if (o.retries !== undefined) c.retries = o.retries;
    if (o.cacheTtlMs !== undefined) c.cacheTtlMs = o.cacheTtlMs;
    return botbench;
  },
  ApiError, LookupError, DiscordAPIError, GatewayError,
  /** Print everything that's available. */
  help() {
    const lines = [`botbench ${VERSION}`];
    for (const [ns, fns] of Object.entries(groups)) lines.push(`  ${ns}: ${Object.keys(fns).join(', ')}`);
    lines.push(`  directory: ${Object.keys(botbench.directory).join(', ')}  (${directory.ALL.length} free APIs)`);
    lines.push(`  discord: rest, webhook, gateway, verifySignature + ${Object.keys(utils).length} helpers (inviteUrl, permissionsToBits, snowflakeToDate, embed, button...)`);
    lines.push('  kv: get, set, del, incr, list, clear, use');
    lines.push('  config({ proxy, fetch, userAgent, timeoutMs, retries, cacheTtlMs })');
    const text = lines.join('\n');
    if (typeof console !== 'undefined') console.log(text);
    return text;
  },
};

module.exports = botbench;
