"""A tiny bot with no discord library: it answers "!ping" using the Gateway and REST clients.
Needs the Message Content intent turned on in the Developer Portal.
    DISCORD_TOKEN=... python examples/raw_gateway_bot.py
"""
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from toolkit.discord_rest import DiscordREST
from toolkit.gateway import Gateway

logging.basicConfig(level=logging.INFO)
TOKEN = os.environ["DISCORD_TOKEN"]
INTENTS = (1 << 0) | (1 << 9) | (1 << 15)      # GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT

rest = DiscordREST(TOKEN)
gw = Gateway(TOKEN, INTENTS)


@gw.on("READY")
async def ready(data):
    print("Ready as", data["user"]["username"])


@gw.on("MESSAGE_CREATE")
async def message(data):
    if data["author"].get("bot"):
        return
    if data["content"].strip() == "!ping":
        await rest.send_message(data["channel_id"], "Pong!", reply_to=data["id"])


try:
    asyncio.run(gw.run())
finally:
    asyncio.run(rest.close())
