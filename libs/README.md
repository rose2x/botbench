# botbench-libs

Small, dependency-free libraries for Discord bots (and anything else). Each one does one thing, has no
required dependencies, and works standing alone if you just want to copy one file into your project.

Available in **Python** (`libs/python`, needs 3.9+) and **JavaScript** (`libs/js`, needs Node 18+, and also
runs in browsers, Deno and Bun). Both versions behave identically: they are tested against the same
[shared vectors](spec/vectors.json), so a duration, a dice roll, or a cron schedule parses to the same
result in either language.

| Library | What it does |
|---|---|
| `duration` | Parse ("1h30m", "2 days") and format durations for commands like `/remind` or `/timeout` |
| `dice` | Dice notation: `2d6+3`, `4d6kh3` (keep highest 3), `1d8+2d6-1` |
| `cron` | A 5-field cron parser (UTC) with `.next()` and `.matches()`, for scheduled posts |
| `ratelimit` | `TokenBucket`, `SlidingWindow`, `Cooldowns` — in-memory rate limiting with a pluggable clock |
| `cache` | A TTL + LRU cache, and a memoize wrapper that dedupes concurrent calls |
| `retry` | Retry with exponential backoff, jitter, and respect for a `retry_after` hint |
| `textfmt` | Plain-text tables, progress bars, `1.2M`-style numbers, ordinals, pluralization, truncation |
| `fuzzy` | Levenshtein distance, Jaro-Winkler similarity, "did you mean...?" suggestions |
| `templating` | `{name}`-style message templates with filters, safe against `@everyone` injection |
| `i18n` | A tiny translator with locale fallback (`pt-BR` → `pt` → default) and plural forms |
| `automod` | Rate/duplicate/mention/caps/invite/blocked-term/repeat-character checks as pure logic (bring your own word list; no built-in filter) |
| `webhooks` | Verify GitHub, Stripe and Twitch EventSub webhook signatures (HMAC-SHA256, constant-time) |
| `github_events` / `githubEvents` | Turn a GitHub webhook payload into a Discord embed |
| `redact` | Find and hide leaked bot tokens, webhook URLs and API keys in text, logs, or a whole codebase |
| `music_queue` / `musicQueue` | Queue, shuffle, loop and reorder logic for a music bot (bring your own audio player) |
| `tictactoe`, `wordle`, `blackjack` | Small, fully-tested game logic (an unbeatable tic-tac-toe opponent included) |
| `leveling` | The XP curve (level from XP, XP for a level, progress bar fraction) shared by both bots' `/rank` |
| `leaderboard` | Rank `[id, score]` pairs with standard competition ranking (ties share a rank) and medal emoji |
| `pagination` | Split a list into pages and keep a requested page number in range |
| `poll` | Tally single-choice votes and find a clear winner (or none, on a tie) |
| `captcha` | A math captcha for a verification gate — no images needed, and nothing to store between steps |
| `economy` | Pure functions for a virtual currency: transfers, insufficient-funds checks, a daily reward with cooldown |
| `giveaway` | Entry tracking and fair, unique winner selection for a giveaway |

## Install

**Python**
```bash
pip install -e libs/python      # editable install from this repo
# or copy libs/python/botbench_libs/duration.py (etc.) straight into your project
```

**JavaScript**
```bash
npm install ./libs/js           # or: npm install botbench-libs, once published
```
```js
const { duration, dice, automod } = require('botbench-libs');
// or a single module, which keeps your bundle small: const { roll } = require('botbench-libs/dice');
```

## Examples

```python
from botbench_libs import duration, dice, cron, automod, redact

duration.parse_duration("1h30m")                       # 5400
dice.roll("4d6kh3")["total"]                            # roll 4d6, keep the highest 3
cron.parse_cron("0 9 * * mon-fri").next(datetime.now(timezone.utc))
automod.AutoMod({"blocked_terms": ["spamword"]}).check({"author_id": 1, "content": "...", "timestamp": t, "mentions": 0})
redact.redact("here's my token: " + leaked)             # "here's my token: [REDACTED:discord_token]"
```

```js
const { duration, dice, textfmt, fuzzy } = require('botbench-libs');

duration.parseDuration('1h30m');                        // 5400
dice.roll('2d20kh1').total;                              // roll with advantage
textfmt.table([['apple', '3'], ['pear', '10']], ['name', 'qty'], ['l', 'r']);
fuzzy.closest('wether', ['weather', 'whether', 'water']); // ['weather', 'whether']
```

Both toolkits (`python-toolkit/`, `js-toolkit/`) depend on `botbench-libs` throughout, not just alongside it:
- `/remind` and `/giveaway start` parse their duration with `duration`
- `/rank` and the XP `/leaderboard` use `leveling` and `leaderboard`
- `/poll` tallies votes with `poll`
- `/balance /daily /pay /richest` (economy) are built entirely on `economy` and `leaderboard`
- `/giveaway` is built on `giveaway`
- `/verifysetup` generates and checks its math question with `captcha`

See `cogs/*.py` / `src/commands/*.js` for the real usage.

## Test

```bash
cd libs/python && python -m unittest discover -s tests   # 49 tests
cd libs/js     && npm test                                # 29 tests
```

Both suites read `spec/vectors.json`. If you change a library's behavior, update the vectors first so both languages are held to the same standard.

## Scanning for leaked secrets

```bash
python -m botbench_libs.redact .            # Python
npx botbench-scan-secrets .                  # JavaScript (after `npm install ./libs/js`)
```

Both exit with status 1 if they find anything that looks like a token, webhook URL or API key, so they work as a CI step or a pre-commit hook. Pattern-based, so it's a safety net, not a guarantee.
