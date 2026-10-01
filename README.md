# Bot Bench

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Everything for making Discord bots: working **Python** and **JavaScript** bots, a **one-script SDK** for the browser and Node, the Discord API reference, and a directory of **115 free APIs**.

**Live site:** https://OWNER.github.io/REPO/  ·  **SDK playground:** https://OWNER.github.io/REPO/playground/

```
python-toolkit/   A Python bot (discord.py): 67 slash commands + raw REST, Gateway and HTTP-interaction clients
js-toolkit/       The same bot in JavaScript (discord.js v14), feature for feature
botbench-sdk/     One script (browser, Node, Deno, Bun): API wrappers, directory, permission math, webhooks, KV store
website/          The documentation site (one HTML file)
data/             The data behind everything: reference-data.json is the source of truth (+ apis.json, apis.csv)
libs/             botbench-libs: 25 small dependency-free libraries, in Python and JS, sharing one test suite
docs/             CHEATSHEET.md and FREE-APIS.md, generated from the data
scripts/          generate-data, build-site, make-zip, publish-to-github
```

## What you get

- **67 slash commands** in each language: fun, info, games, moderation (with permission and role-order checks), XP levels, polls, reminders, an AI `/ask` command (Claude API, with cooldown and daily cap), support tickets (private threads), self-role button panels, a virtual-currency economy, giveaways, and a math-captcha verification gate using modals. Tickets, roles, giveaways and verification use persistent buttons that survive restarts.
- **40 free-API wrappers** with timeouts, retries, caching and friendly errors.
- **Raw clients** with no Discord library: REST (rate limits, 429/5xx retries), Gateway (heartbeat, resume, reconnect), and slash commands over HTTP with signature checking.
- **A Cloudflare Worker example** for slash commands with no server.
- **botbench-libs:** 25 reusable libraries (durations, dice, cron, rate limits, caching, retries, fuzzy matching, templating, i18n, auto-moderation, webhook signatures, GitHub-to-Discord embeds, secret scanning, a music queue, leveling, leaderboards, pagination, polls, captchas, an economy, giveaways, and three small games) in Python and JavaScript. Both languages pass the exact same test vectors, plus randomized cross-checks that have caught real bugs.
- **Helpers:** permission and intent bit math, invite links, snowflake decoding, timestamps, embeds, components.
- **Tests that need no token or internet.** Small local fake servers stand in for Discord.

## Quick start

```bash
# Python 3.9+
cd python-toolkit && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt && cp .env.example .env     # add DISCORD_TOKEN and GUILD_ID
python bot.py

# JavaScript, Node 20.6+
cd js-toolkit && npm install && cp .env.example .env        # add DISCORD_TOKEN, CLIENT_ID, GUILD_ID
npm start
```

Create the bot at https://discord.com/developers/applications: New Application, add a Bot, copy the token, and invite it with the `bot` and `applications.commands` scopes.
Add `ANTHROPIC_API_KEY` to `.env` to switch on `/ask`.

### The SDK in one line

```html
<script src="https://OWNER.github.io/REPO/dist/botbench.min.js"></script>
<script>
  botbench.fun.joke().then(console.log);
  console.log(botbench.discord.inviteUrl('CLIENT_ID', { permissions: ['SEND_MESSAGES'] }));
</script>
```

See [botbench-sdk/README.md](botbench-sdk/README.md) for everything it can do and what works in a browser.

## Develop

```bash
make setup    # install dependencies
make test     # every test suite: both bots, the SDK, and the shared libraries
make data     # regenerate files after editing data/reference-data.json
make build    # rebuild botbench-sdk/dist
```

[CONTRIBUTING.md](CONTRIBUTING.md) explains where each thing lives. CI runs on Python 3.9 and 3.12, and Node 20 and 22.

## Rules of the road

- Never commit `.env` or share a bot token. See [SECURITY.md](SECURITY.md) if one leaks.
- Only Discord's documented API with bot tokens is used. Self-bots and user-token automation break Discord's Terms of Service and are not accepted here.
- Free APIs change or shut down. Test a URL and read the provider's terms before relying on it.
- Every AI call costs money. Keep the cooldown and daily cap.

## Status

The test suites run against local fake servers and sample API responses, not the live Discord service or every live third-party API, so a few things may need small fixes in the wild. Issues and pull requests are welcome.

MIT licensed. Not affiliated with Discord Inc.

## Acknowledgments

The bots, the shared libraries, the one-script SDK, and this documentation were built with [Claude](https://claude.com), Anthropic's AI model, across an extended session covering design, implementation, and testing. The repo scaffolding (CI, Pages, releases) follows the same conventions a human maintainer would use, so contributing works the normal way — read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.
