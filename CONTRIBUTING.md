# Contributing

Thanks for helping. Be kind, and assume good intent.

## Set up

```bash
make setup     # installs Python and Node dependencies
make test      # runs all three test suites (no token or internet needed)
```

You need Python 3.9+ and Node 20.6+.

## Where things live

| To change... | Edit | Then run |
|---|---|---|
| A free API in the directory, an endpoint, a permission, an error code | `data/reference-data.json` | `make data` |
| A bot command (Python) | `python-toolkit/cogs/*.py` | `make test-python` |
| A shared library used by both bots (durations, dice, cron, rate limits, automod...) | `libs/python/botbench_libs/*.py` **and** `libs/js/src/*.js` | Update `libs/spec/vectors.json` too, then `make test-libs` |
| A bot command (JavaScript) | `js-toolkit/src/commands/*.js` | `make test-js` |
| An API wrapper | `python-toolkit/toolkit/apis.py` **and** `js-toolkit/src/utils/apis.js` | `make test` |
| The one-script SDK | `botbench-sdk/src/*.js` | `make build && make test-sdk` |
| The website | `website/index.html` (its data block is generated) | open it in a browser |

The two bots are meant to stay feature-for-feature equal. If you add a command to one, please add it to the other, or say so in the pull request.
Shared modules (`apiClient`, `apis`, `discordRest`, `gateway`, `discordUtils`, `signature`) exist as copies in `js-toolkit/src/utils` and `botbench-sdk/src`. Edit the js-toolkit version and copy it over, then rebuild.

## Adding a free API

1. Open the URL and check it works without login, or note the key requirement honestly (`None`, `Free key`, `OAuth`, `Paid`, `Free tier`, `Self-host`).
2. Add a row `[name, type, key, description, url]` to `APIS` in `data/reference-data.json`.
3. `make data && make build`, then commit the changed files. CI fails if generated files are stale.

## Pull requests

- Add or update tests. The tests use small local fake servers, so they need no internet.
- Never include tokens, keys or webhook URLs.
- Use only Discord's documented API with a bot token. No self-bots, no user-token automation.
