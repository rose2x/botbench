"""Polls with buttons, reminders, and a search over the free-API directory."""
from __future__ import annotations

import asyncio
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from botbench_libs.duration import format_duration, parse_duration
from botbench_libs.poll import tally
from botbench_libs.textfmt import progress_bar
from toolkit import directory
from toolkit.discord_helpers import clip, embed


class PollView(discord.ui.View):
    def __init__(self, question: str, options: list[str]):
        super().__init__(timeout=3600)
        self.question, self.options = question, options
        self.votes: dict[int, int] = {}          # user id -> option index
        for i, opt in enumerate(options):
            btn = discord.ui.Button(label=clip(opt, 60), style=discord.ButtonStyle.primary, row=i // 3)
            btn.callback = self._make_callback(i)
            self.add_item(btn)

    def render(self) -> discord.Embed:
        counts = tally(self.votes, len(self.options))
        total = sum(counts) or 1
        lines = []
        for opt, n in zip(self.options, counts):
            bar = progress_bar(n / total, 10)
            lines.append(f"**{opt}**\n{bar} {n} vote{'' if n == 1 else 's'}")
        return embed(self.question, "\n\n".join(lines), footer="One vote each. Click another option to change yours.")

    def _make_callback(self, index: int):
        async def callback(interaction: discord.Interaction):
            self.votes[interaction.user.id] = index
            await interaction.response.edit_message(embed=self.render(), view=self)
        return callback


class Utility(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._tasks: set[asyncio.Task] = set()

    @app_commands.command(description="Start a poll with buttons (2 to 5 options)")
    @app_commands.describe(question="What are you asking?", option1="First option", option2="Second option",
                           option3="Third option", option4="Fourth option", option5="Fifth option")
    async def poll(self, interaction: discord.Interaction, question: app_commands.Range[str, 3, 200],
                   option1: app_commands.Range[str, 1, 80], option2: app_commands.Range[str, 1, 80],
                   option3: Optional[app_commands.Range[str, 1, 80]] = None,
                   option4: Optional[app_commands.Range[str, 1, 80]] = None,
                   option5: Optional[app_commands.Range[str, 1, 80]] = None):
        options = [o for o in (option1, option2, option3, option4, option5) if o]
        view = PollView(question, options)
        await interaction.response.send_message(embed=view.render(), view=view)

    @app_commands.command(description="Remind you later (lost if the bot restarts)")
    @app_commands.describe(when='How long from now, e.g. "20m", "1h30m", "2 days" (max 30 days)',
                           text="What to remind you about")
    @app_commands.checks.cooldown(3, 60.0)
    async def remind(self, interaction: discord.Interaction, when: app_commands.Range[str, 1, 30], text: app_commands.Range[str, 1, 300]):
        try:
            seconds = float(parse_duration(when))
        except ValueError:
            await interaction.response.send_message(f'Couldn\'t read "{when}". Try something like `20m`, `1h30m`, or `2 days`.', ephemeral=True)
            return
        if not 1 <= seconds <= 30 * 86400:
            await interaction.response.send_message("Pick something between 1 second and 30 days.", ephemeral=True)
            return
        await interaction.response.send_message(f"OK, I'll remind you in {format_duration(seconds)}.", ephemeral=True)
        task = asyncio.create_task(self._remind(interaction.channel_id, interaction.user.id, seconds, text))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _remind(self, channel_id: int, user_id: int, seconds: float, text: str):
        await asyncio.sleep(seconds)
        channel = self.bot.get_channel(channel_id)
        if channel is not None:
            await channel.send(f"<@{user_id}> reminder: {text}", allowed_mentions=discord.AllowedMentions(users=True))

    @app_commands.command(name="apisearch", description="Search the built-in directory of free APIs")
    @app_commands.describe(query="For example: weather, anime, crypto", no_key="Only APIs that need no key")
    async def apisearch(self, interaction: discord.Interaction, query: app_commands.Range[str, 2, 60], no_key: bool = False):
        hits = directory.search(query, only_no_key=no_key, limit=8)
        if not hits:
            await interaction.response.send_message("No APIs matched. Try one shorter word.", ephemeral=True)
            return
        lines = [f"**[{a.name}]({a.url})** ({a.type}, key: {a.key})\n{clip(a.description, 110)}" for a in hits]
        await interaction.response.send_message(embed=embed(f"APIs matching “{query}”", "\n\n".join(lines)))


async def setup(bot: commands.Bot):
    await bot.add_cog(Utility(bot))
