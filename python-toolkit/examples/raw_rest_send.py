"""Send a message and add a reaction using only the REST client.
    DISCORD_TOKEN=... python examples/raw_rest_send.py CHANNEL_ID
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from toolkit.discord_rest import DiscordAPIError, DiscordREST


async def main(channel_id: str):
    rest = DiscordREST(os.environ["DISCORD_TOKEN"])
    try:
        me = await rest.get_me()
        print("Logged in as", me["username"])
        msg = await rest.send_message(channel_id, "Hello from the raw REST client")
        await rest.add_reaction(channel_id, msg["id"], "\N{WAVING HAND SIGN}")
        print("Sent message", msg["id"])
    except DiscordAPIError as e:
        print("Discord said:", e)             # e.code 50013 = Missing Permissions, 50001 = Missing Access
    finally:
        await rest.close()

asyncio.run(main(sys.argv[1]))
