# botbench: a Discord bot toolkit in one script

Add one file and get simple namespaces for everything a Discord bot project needs: free-API wrappers, a directory of 115 free APIs, a rate-limit-aware REST client, a Gateway client, permission and intent math, invite links, snowflake decoding, embeds and components, and a small key-value store. Inspired by the "one script, no setup" style of Puter.js.

Works in **browsers** (plain `<script>`), **Node 18+**, **Deno** and **Bun**. No dependencies.

```html
<script src="dist/botbench.min.js"></script>
<script>
  const joke = await botbench.fun.joke();
  const w = await botbench.info.weatherForCity('Tokyo');
  const link = botbench.discord.inviteUrl('CLIENT_ID', { permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES'] });
</script>
```

```js
// Node (CommonJS)
const botbench = require('./dist/botbench.js');
// Node / Deno / Bun (ES module)
import botbench, { fun, discord } from './dist/botbench.mjs';
```

Open `demo/index.html` in a browser to try everything with no code.

## What's inside

| Namespace | What you get |
|---|---|
| `botbench.fun` | `joke dadJoke chuckNorris catFact uselessFact advice dogImage xkcd rhymes bibleVerse` |
| `botbench.info` | `geocode weather weatherForCity country holidays issPosition wikiSummary define bookSearch` |
| `botbench.money` | `cryptoPrice exchangeRate` |
| `botbench.dev` | `githubRepo pypiPackage npmPackage hackerNews shortenUrl qrCodeUrl` |
| `botbench.games` | `trivia pokemon scryfallCard dndSpell minecraftServer minecraftUuid chessProfile` |
| `botbench.media` | `animeSearch tvShow musicSearch randomCocktail randomMeal nasaApod` |
| `botbench.apis` | All of the above in one flat object |
| `botbench.directory` | `all types byType noKey search` over 115 free APIs |
| `botbench.reference` | Endpoints, opcodes, intents, permissions, scopes, limits, close codes, error codes as arrays |
| `botbench.discord` | `rest webhook gateway verifySignature` plus helpers like `inviteUrl permissionsToBits bitsToPermissions intentsToBits snowflakeToDate timestamp embed button actionRow stringSelect chunkMessage neutralizeMentions` |
| `botbench.kv` | `get set del incr list clear use`, with optional expiry |
| `botbench.config()` | Set a proxy, custom `fetch`, User-Agent, timeout, retries, cache time |
| `botbench.help()` | Prints all of this |

Every API function throws `botbench.LookupError` (worked, found nothing, message is safe to show) or `botbench.ApiError` (the service failed, `status` 0 means a network problem).

## Examples

**A bot in a dozen lines (Node 22+, or `npm i ws` on older Node)**

```js
const bb = require('./dist/botbench.js');
const token = process.env.DISCORD_TOKEN;

const rest = bb.discord.rest(token);
const gw = bb.discord.gateway(token, bb.discord.intentsToBits(['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT']));

gw.on('READY', (d) => console.log('Ready as', d.user.username));
gw.on('MESSAGE_CREATE', async (m) => {
  if (m.author.bot) return;
  if (m.content === '!joke') await rest.sendMessage(m.channel_id, await bb.fun.joke());
  if (m.content.startsWith('!weather ')) {
    const w = await bb.info.weatherForCity(m.content.slice(9));
    await rest.sendMessage(m.channel_id, `${w.name}: ${w.tempC}°C, ${w.summary}`);
  }
});
gw.run();
```

**Post to a channel from a web page (webhook, no bot)**

```js
await botbench.discord.webhook('https://discord.com/api/webhooks/ID/TOKEN').send({
  username: 'Site alerts',
  embeds: [botbench.discord.embed({ title: 'New signup', description: 'someone@example.com', color: '#57F287' })],
});
```

**Permission math and invite links**

```js
const bits = botbench.discord.permissionsToBits(['VIEW_CHANNEL', 'SEND_MESSAGES', 'MODERATE_MEMBERS']); // BigInt
botbench.discord.bitsToPermissions(bits);           // ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MODERATE_MEMBERS']
botbench.discord.inviteUrl('CLIENT_ID', { permissions: ['SEND_MESSAGES'] });
botbench.discord.snowflakeToDate('175928847299117063'); // 2016-04-30T11:18:25.796Z
botbench.discord.timestamp(new Date(), 'R');             // '<t:1789...:R>' (shows "just now" in Discord)
```

**Key-value store (localStorage in browsers, memory elsewhere)**

```js
await botbench.kv.incr('uses:joke');
await botbench.kv.set('cooldown:alice', true, { ttlSeconds: 30 });
await botbench.kv.get('cooldown:alice');   // true, then null after 30 seconds
```

To keep data across restarts on a server, give it your own backend: `botbench.kv.use({ get, set, delete, keys })`.

**Find an API**

```js
botbench.directory.search('weather', { onlyNoKey: true });
botbench.directory.byType('Games');
```

**Slash commands on Cloudflare Workers (no server)**

`examples/cloudflare-worker.mjs` verifies Discord's signature with `botbench.discord.verifySignature`, answers PING, and handles `/ping`, `/joke` and `/invite`. Deploy notes are at the top of the file, and `wrangler.toml` is included.

## Browsers: what works and what doesn't

- **Works well:** the API wrappers (most free APIs allow browser requests), the directory, all the offline helpers, webhooks, the KV store.
- **CORS:** if an API blocks browsers, calls fail with `ApiError` status 0. Point `botbench.config({ proxy: (url) => 'https://your-proxy.example/?url=' + encodeURIComponent(url) })` at a small proxy you run (a Cloudflare Worker is enough).
- **Never put a bot token in a web page.** Anyone can read it. Use `discord.rest()` and `discord.gateway()` on a server only. Webhook URLs are also secrets: only use them in pages you control.
- The toolkit doesn't send a `User-Agent` header in browsers, because setting one makes browsers run a CORS preflight that most APIs reject.

## Build and test

```bash
npm install         # only needed for the optional minifier (terser)
npm run build       # makes dist/botbench.js, botbench.mjs, botbench.min.js from src/
npm test            # 10 tests: CJS, ESM, minified, proxy, webhook, KV, signatures, and a browser sandbox
```

`build.js` is a 60-line bundler with no dependencies. The files in `src/` are the same modules used by the JavaScript bot in `../js-toolkit`.

## Notes

- Free APIs change or go away. Test a URL before you rely on it and read each provider's terms.
- Use only Discord's documented API with a bot token. Automating a normal user account (a "self-bot") breaks Discord's Terms of Service.
- Not affiliated with Discord Inc. or Puter.
