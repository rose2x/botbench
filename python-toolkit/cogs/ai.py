"""/ask: ask Claude a question. Only loads if ANTHROPIC_API_KEY is set.

Protected by a per-user cooldown and a daily cap (AI_DAILY_LIMIT, default 20), because every call costs money.
"""
from __future__ import annotations

import logging
import os

import discord
from discord import app_commands
from discord.ext import commands

from toolkit.api_client import ApiError
from toolkit.claude import ClaudeClient, UsageLimiter
from toolkit.discord_helpers import friendly_error
from toolkit.discord_utils import chunk_message, neutralize_mentions

log = logging.getLogger("ai")
SYSTEM = ("You are a friendly assistant inside a Discord server. Keep answers under 1500 characters. "
          "Use plain text and simple Markdown. If you don't know something, say so.")


class AI(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.client = ClaudeClient(os.environ["ANTHROPIC_API_KEY"])
        self.limiter = UsageLimiter(int(os.getenv("AI_DAILY_LIMIT", "20")))

    async def cog_unload(self):
        await self.client.close()

    @app_commands.command(name="ask", description="Ask the AI a question")
    @app_commands.describe(question="Your question")
    @app_commands.checks.cooldown(1, 10.0)
    async def ask(self, interaction: discord.Interaction, question: app_commands.Range[str, 3, 500]):
        allowed, left = self.limiter.allow(interaction.user.id)
        if not allowed:
            await interaction.response.send_message("You've used all your AI questions for today. Try again tomorrow.", ephemeral=True)
            return
        await interaction.response.defer()
        try:
            answer = await self.client.ask(question, system=SYSTEM)
        except (ApiError, LookupError) as exc:
            self.limiter.refund(interaction.user.id)
            log.warning("Claude call failed: %s", exc)
            await interaction.followup.send(friendly_error(exc) if isinstance(exc, LookupError) else "The AI service isn't available right now.")
            return
        header = f"**{neutralize_mentions(question)[:200]}**\n\n"
        chunks = chunk_message(neutralize_mentions(answer), 1900 - len(header))[:3]
        await interaction.followup.send(header + chunks[0])
        for extra in chunks[1:]:
            await interaction.followup.send(extra)


async def setup(bot: commands.Bot):
    if not os.getenv("ANTHROPIC_API_KEY"):
        log.info("ANTHROPIC_API_KEY is not set: /ask is disabled")
        return
    await bot.add_cog(AI(bot))
