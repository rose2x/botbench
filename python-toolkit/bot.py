"""Bot Bench starter bot.

    pip install -r requirements.txt
    cp .env.example .env       # then fill in DISCORD_TOKEN (and GUILD_ID while testing)
    python bot.py

Every file in cogs/ is loaded automatically. Add a new one and restart.
"""
from __future__ import annotations

import logging
import os
import pathlib
import time

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

from toolkit import apis

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bot")


class Bot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()          # no privileged intents needed for slash commands
        # intents.message_content = True             # turn on only for prefix commands, and enable it in the Portal
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=intents,
            allowed_mentions=discord.AllowedMentions(everyone=False, roles=False),
        )
        self.started_at = time.time()

    async def setup_hook(self) -> None:
        for path in sorted(pathlib.Path(__file__).parent.joinpath("cogs").glob("*.py")):
            if path.stem.startswith("_"):
                continue
            await self.load_extension(f"cogs.{path.stem}")
            log.info("Loaded cog: %s", path.stem)

        guild_id = os.getenv("GUILD_ID")
        if guild_id:                                  # instant, for development
            guild = discord.Object(id=int(guild_id))
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            log.info("Synced %d commands to test server %s", len(synced), guild_id)
        else:                                         # global: can take a while to show up
            synced = await self.tree.sync()
            log.info("Synced %d global commands", len(synced))

    async def on_ready(self) -> None:
        log.info("Logged in as %s (%s) in %d servers", self.user, self.user.id, len(self.guilds))

    async def close(self) -> None:
        await apis.client.close()
        await super().close()


bot = Bot()


async def _say(interaction: discord.Interaction, text: str) -> None:
    if interaction.response.is_done():
        await interaction.followup.send(text, ephemeral=True)
    else:
        await interaction.response.send_message(text, ephemeral=True)


@bot.tree.error
async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError) -> None:
    if isinstance(error, app_commands.CommandOnCooldown):
        await _say(interaction, f"Slow down. Try again in {error.retry_after:.0f}s.")
    elif isinstance(error, app_commands.MissingPermissions):
        await _say(interaction, "You don't have permission to use that command.")
    elif isinstance(error, app_commands.BotMissingPermissions):
        need = ", ".join(p.replace("_", " ") for p in error.missing_permissions)
        await _say(interaction, f"I'm missing permissions: {need}.")
    elif isinstance(error, app_commands.NoPrivateMessage):
        await _say(interaction, "That command only works in a server.")
    elif isinstance(error, app_commands.CheckFailure):
        await _say(interaction, "You can't use that command here.")
    else:
        log.error("Command %s failed", interaction.command.name if interaction.command else "?", exc_info=error)
        await _say(interaction, "Something broke on my side. It has been logged.")


if __name__ == "__main__":
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise SystemExit("Set DISCORD_TOKEN in your .env file first.")
    bot.run(token, log_handler=None)
