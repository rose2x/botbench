# Bot Bench: Discord bot toolkit (Python)

A working Discord bot with 67 slash commands, plus reusable pieces you can copy into your own bot:

| Piece | File | What it is |
|---|---|---|
| Starter bot | `bot.py` | Loads every file in `cogs/`, syncs commands, handles errors in one place |
| Cogs | `cogs/*.py` | general, fun, info, games, moderation, levels (SQLite), utility |
| API wrappers | `toolkit/apis.py` | 40 async functions for free APIs (weather, wiki, trivia, GitHub, ...) |
| API client | `toolkit/api_client.py` | Timeout, retries, User-Agent and cache for any JSON API |
| Claude client | `toolkit/claude.py` | Small Claude API client and a per-user daily usage limiter |
| Raw REST client | `toolkit/discord_rest.py` | Talk to Discord with no library. Rate limits and retries included |
| Gateway client | `toolkit/gateway.py` | Connect, heartbeat, identify, resume, reconnect |
| HTTP interactions | `toolkit/http_interactions.py` | Slash commands over HTTP with signature checking |
| Discord utilities | `toolkit/discord_utils.py` | Permission and intent bit math, invite links, snowflakes, timestamps, embeds, components |
| API directory | `toolkit/directory.py` | 115 free APIs as Python objects, with search |
| Reference data | `toolkit/reference_data.py` | Endpoints, opcodes, intents, permissions, error codes as lists |

## Quick start

```bash
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # fill in DISCORD_TOKEN and GUILD_ID
python bot.py
```

1. Create an application at https://discord.com/developers/applications, add a Bot, copy the token.
2. Invite it with the `bot` and `applications.commands` scopes.
3. Put your test server's id in `GUILD_ID` so commands show up instantly. Remove it later for global commands.

You need Python 3.9 or newer. No privileged intents are needed.

## Commands

- **general**: `/ping /about /avatar /userinfo /serverinfo`
- **fun**: `/roll /coinflip /8ball /choose /joke /dadjoke /chuck /catfact /fact /advice /dog /xkcd /rhyme /verse`
- **info**: `/weather /wiki /define /country /holidays /iss /crypto /convert /github /pypi /npm /hackernews /apod /qr`
- **games**: `/trivia /pokemon /card /spell /mcstatus /mcuuid /chess /anime /show /song /book /cocktail /meal`
- **moderation**: `/kick /ban /unban /timeout /untimeout /purge` (permission and role-order checks built in)
- **levels**: XP for chatting, `/rank /leaderboard`
- **utility**: `/poll /remind /apisearch` (`/remind` takes a duration like `20m` or `1h30m`, parsed by [botbench-libs](../libs/README.md))
- **ai**: `/ask` (Claude API). Only loads if `ANTHROPIC_API_KEY` is set. Has a 10 second cooldown and a daily cap per user (`AI_DAILY_LIMIT`, default 20), because every call costs money.
- **economy**: `/balance /daily /pay /richest` — a virtual currency using [botbench-libs](../libs/README.md)'s economy and leaderboard libraries
- **giveaway**: `/giveaway start /giveaway end` — a stateless Enter button, fair winner selection, ends itself automatically
- **tickets**: `/ticketpanel /ticketclose`. A button opens a private thread for the user. Persistent buttons that survive restarts. The bot needs Create Private Threads, Send Messages in Threads and Manage Threads.
- **roles**: `/rolepanel`. Buttons that add or remove roles. Refuses managed roles, roles above the bot, and roles with powerful permissions, so it can't hand out admin.
- **verify**: `/verifysetup` — a verification gate with a math captcha shown in a modal, no data stored between steps

## Add a command

Create `cogs/hello.py`, restart the bot:

```python
import discord
from discord import app_commands
from discord.ext import commands

class Hello(commands.Cog):
    @app_commands.command(description="Say hello")
    async def hello(self, interaction: discord.Interaction):
        await interaction.response.send_message(f"Hello {interaction.user.mention}!")

async def setup(bot):
    await bot.add_cog(Hello())
```

## Add an API

1. Find one: `python -m toolkit.directory search weather` (or `nokey` to list APIs that need no key).
2. Add a function to `toolkit/apis.py` using `client.get_json(url, params=...)`.
3. Call it from a cog with `respond_api`, which defers, catches errors and sends a friendly message:

```python
@app_commands.command(description="Random fox")
async def fox(self, interaction):
    async def make():
        d = await apis.client.get_json("https://randomfox.ca/floof/", ttl=0)
        return embed("Fox", image=d["image"])
    await respond_api(interaction, make)
```

Change `DEFAULT_USER_AGENT` in `toolkit/api_client.py` to include your own contact. Several APIs (Wikipedia, MusicBrainz, Nominatim) require it.

## Use the raw clients

```python
from toolkit.discord_rest import DiscordREST
rest = DiscordREST(TOKEN)
await rest.send_message(channel_id, "Hello")
await rest.timeout_member(guild_id, user_id, until=datetime.now(timezone.utc) + timedelta(minutes=10))
await rest.register_commands(app_id, [{"name": "ping", "description": "Ping", "type": 1}], guild_id)
```

See `examples/` for a webhook post, a raw REST send, a no-library gateway bot, and slash commands over HTTP.
`toolkit/gateway.py` and `toolkit/http_interactions.py` need `pip install -r requirements-extra.txt`.

## Tests

```bash
python -m unittest discover -s tests -v
```

They run against small local fake servers (REST with 429 handling, a gateway that closes with resumable and fatal codes, signed HTTP interactions), so they need no token and no internet.

## Run it 24/7

- Docker: `docker build -t mybot . && docker run -d --restart unless-stopped --env-file .env mybot`
- systemd: edit and install `mybot.service`.

## Safety notes

- Never commit `.env`. If your token leaks, reset it in the Developer Portal at once.
- The bot pings nobody by default (`AllowedMentions` is restricted). Keep it that way.
- Moderation commands check the caller's permissions, the bot's permissions and role order.
- Add cooldowns (`@app_commands.checks.cooldown`) before you connect a paid API to a public command.
- Use only Discord's documented API with a bot token. Automating a normal user account (a "self-bot") breaks Discord's Terms of Service.

Free APIs change or go away. Test a URL before you rely on it, and read each provider's terms.
Not affiliated with Discord Inc.
