"""Post to a channel with only a webhook URL. No bot, no token.
    WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN python examples/webhook_post.py
"""
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from toolkit.discord_rest import DiscordREST


async def main():
    url = os.environ["WEBHOOK_URL"]
    m = re.search(r"/webhooks/(\d+)/([\w-]+)", url)
    rest = DiscordREST(token="")
    try:
        await rest.webhook_execute(m.group(1), m.group(2), username="Deploy Bot", embeds=[
            {"title": "Build passed", "description": "main @ 3f2a1c", "color": 0x2ECC71}])
        print("Sent.")
    finally:
        await rest.close()

asyncio.run(main())
