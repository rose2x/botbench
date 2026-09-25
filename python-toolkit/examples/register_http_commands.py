"""Register slash commands with the REST client (needed for HTTP interactions).
    DISCORD_TOKEN=... DISCORD_APP_ID=... [GUILD_ID=...] python examples/register_http_commands.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from toolkit.discord_rest import DiscordREST

COMMANDS = [
    {"name": "ping", "description": "Check the bot", "type": 1},
    {"name": "roll", "description": "Roll a die", "type": 1},
]


async def main():
    rest = DiscordREST(os.environ["DISCORD_TOKEN"])
    try:
        done = await rest.register_commands(os.environ["DISCORD_APP_ID"], COMMANDS, os.environ.get("GUILD_ID") or None)
        print("Registered:", [c["name"] for c in done])
    finally:
        await rest.close()

asyncio.run(main())
