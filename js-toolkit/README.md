# Bot Bench: Discord bot toolkit (JavaScript)

A working Discord bot (discord.js v14) with 67 slash commands, plus reusable pieces you can copy into your own bot.

| Piece | File | What it is |
|---|---|---|
| Starter bot | `src/index.js` | Loads every file in `src/commands`, syncs commands, cooldowns, one error handler |
| Commands | `src/commands/*.js` | general, fun, info, games, moderation, levels, utility |
| API wrappers | `src/utils/apis.js` | 40 async functions for free APIs (weather, wiki, trivia, GitHub, ...) |
| API client | `src/utils/apiClient.js` | Timeout, retries, User-Agent and cache for any JSON API |
| Claude client | `src/utils/claude.js` | Small Claude API client and a per-user daily usage limiter |
| Raw REST client | `src/utils/discordRest.js` | Talk to Discord with no library. Rate limits and retries included |
| Gateway client | `src/utils/gateway.js` | Connect, heartbeat, identify, resume, reconnect. Uses the standard WebSocket |
| HTTP interactions | `src/utils/httpInteractions.js` | Slash commands over HTTP with signature checking, no dependencies |
| Discord utilities | `src/utils/discordUtils.js` | Permission and intent bit math, invite links, snowflakes, timestamps, embeds, components |
| API directory | `src/utils/directory.js` | 115 free APIs as objects, with search |
| Reference data | `src/utils/referenceData.js` | Endpoints, opcodes, intents, permissions, error codes as arrays |

## Quick start

```bash
npm install
cp .env.example .env        # fill in DISCORD_TOKEN, CLIENT_ID and GUILD_ID
npm start
```

1. Create an application at https://discord.com/developers/applications, add a Bot, copy the token.
2. Invite it with the `bot` and `applications.commands` scopes (`discordUtils.inviteUrl()` builds the link).
3. Put your test server's id in `GUILD_ID` so commands show up instantly. Remove it later for global commands.

Needs Node 20.6 or newer (`--env-file` support). No privileged intents are needed.
The bot syncs commands when it starts. To register without starting it, run `npm run deploy`. Set `AUTO_DEPLOY=0` to turn auto-sync off.

## Commands

- **general**: `/ping /about /avatar /userinfo /serverinfo`
- **fun**: `/roll /coinflip /8ball /choose /joke /dadjoke /chuck /catfact /fact /advice /dog /xkcd /rhyme /verse`
- **info**: `/weather /wiki /define /country /holidays /iss /crypto /convert /github /pypi /npm /hackernews /apod /qr`
- **games**: `/trivia /pokemon /card /spell /mcstatus /mcuuid /chess /anime /show /song /book /cocktail /meal`
- **moderation**: `/kick /ban /unban /timeout /untimeout /purge` (permission and role-order checks built in)
- **levels**: XP for chatting (saved in `data/xp.json`), `/rank /leaderboard`
- **utility**: `/poll /remind /apisearch` (`/remind` takes a duration like `20m` or `1h30m`, parsed by [botbench-libs](../libs/README.md))
- **ai**: `/ask` (Claude API). Only registered if `ANTHROPIC_API_KEY` is set. Has a 10 second cooldown and a daily cap per user (`AI_DAILY_LIMIT`, default 20), because every call costs money.
- **economy**: `/balance /daily /pay /richest` — a virtual currency using [botbench-libs](../libs/README.md)'s economy and leaderboard libraries
- **giveaway**: `/giveaway start /giveaway end` — a stateless Enter button, fair winner selection, ends itself automatically
- **tickets**: `/ticketpanel /ticketclose`. A button opens a private thread for the user. Persistent buttons that survive restarts. The bot needs Create Private Threads, Send Messages in Threads and Manage Threads.
- **roles**: `/rolepanel`. Buttons that add or remove roles. Refuses managed roles, roles above the bot, and roles with powerful permissions, so it can't hand out admin.
- **verify**: `/verifysetup` — a verification gate with a math captcha shown in a modal, no data stored between steps

## Add a command

Create `src/commands/hello.js`, restart the bot:

```js
const { command } = require('../utils/discordHelpers');

module.exports.commands = [
  {
    data: command('hello', 'Say hello'),
    cooldown: 5, // optional: seconds per user
    execute: (interaction) => interaction.reply(`Hello ${interaction.user}!`),
  },
];
```

A command file can also export `components: [{ id, execute }]` for persistent buttons, menus and modals (matched by `customId`, so they work after restarts), and `events`. See `src/commands/tickets.js`.

Options are one-liners: `command('echo', 'Repeat', [opt.string('text', 'What to say', { max: 200 })])`.

## Add an API

1. Find one: `node src/utils/directory.js search weather` (or `nokey`).
2. Add a function to `src/utils/apis.js` using `client.getJson(url, { params })`.
3. Use it with `respondApi`, which defers, catches errors and sends a friendly message:

```js
{
  data: command('fox', 'Random fox'),
  execute: (i) => respondApi(i, async () => embed('Fox', '', { image: (await apis.client.getJson('https://randomfox.ca/floof/', { ttlMs: 0 })).image })),
}
```

Change `DEFAULT_USER_AGENT` in `apiClient.js` to include your own contact. Several APIs (Wikipedia, MusicBrainz, Nominatim) require it.

## Use the raw pieces

```js
const { DiscordREST } = require('./src/utils/discordRest');
const { inviteUrl, permissionsToBits, snowflakeToDate } = require('./src/utils/discordUtils');

const rest = new DiscordREST(TOKEN);
await rest.sendMessage(channelId, 'Hello');
await rest.timeoutMember(guildId, userId, new Date(Date.now() + 10 * 60_000), 'spam');

inviteUrl(CLIENT_ID, { permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES'] });
snowflakeToDate('175928847299117063'); // 2016-04-30T11:18:25.796Z
```

See `examples/` for a webhook post, a raw REST send, a no-library gateway bot, and slash commands over HTTP.
Permission bits above 2^31 are `BigInt` in JavaScript, because normal bit operators only work on 32 bits.

## Tests

```bash
npm test
```

They run against small local fake servers (REST with 429 handling, a gateway that closes with resumable and fatal codes, signed HTTP interactions), so they need no token and no internet.

## Run it 24/7

- Docker: `docker build -t mybot . && docker run -d --restart unless-stopped --env-file .env mybot`
- systemd: edit and install `mybot.service`.

## Safety notes

- Never commit `.env`. If your token leaks, reset it in the Developer Portal at once.
- The client is created with `allowedMentions: { parse: [] }`, so the bot pings nobody unless a command opts in.
- Moderation commands check the caller's permissions, the bot's permissions and role order.
- Add a `cooldown` before you connect a paid API to a public command.
- Use only Discord's documented API with a bot token. Automating a normal user account (a "self-bot") breaks Discord's Terms of Service.

Free APIs change or go away. Test a URL before you rely on it, and read each provider's terms.
Not affiliated with Discord Inc.
