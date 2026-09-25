"""Giveaways: a stateless "Enter" button, an automatic end, and fair unique winners.

  /giveaway start <when> <winners> <prize>   posts a giveaway, ends itself automatically
  /giveaway end <message_id>                 end one early

Giveaway state lives in memory for the process (like /remind): simple, and it's fine for it to be lost
on a restart, but the "Enter" button says so clearly if that happens rather than failing silently.
"""
from __future__ import annotations

import asyncio
import time
from typing import Dict, Optional

import discord
from discord import app_commands
from discord.ext import commands

from botbench_libs.duration import format_duration, parse_duration
from botbench_libs.giveaway import Giveaway
from toolkit.discord_helpers import embed

ENTER_ID = "giveaway:enter"


def giveaway_embed(g: Giveaway, ends_at: Optional[float], ended: bool = False, winners: Optional[list] = None) -> discord.Embed:
    if ended:
        text = ("Winner: " + ", ".join(f"<@{w}>" for w in winners)) if winners else "Nobody entered."
        return embed(f"🎉 {g.prize}", f"{text}\n\n{len(g.entrants)} entered.", color=0x57F287)
    when = f"<t:{int(ends_at)}:R>" if ends_at else "soon"
    return embed(f"🎉 {g.prize}", f"Ends {when} • {g.winners} winner{'s' if g.winners != 1 else ''}\n{len(g.entrants)} entered so far.")


async def handle_enter(interaction: discord.Interaction, active: Dict[int, Giveaway], ends_at: Dict[int, float]) -> None:
    """The logic behind the Enter button, pulled out so it can be unit tested with a fake `active` dict."""
    g = active.get(interaction.message.id)
    if g is None:
        await interaction.response.send_message(
            "This giveaway's data was lost, probably because the bot restarted. Ask a moderator to start a new one.",
            ephemeral=True)
        return
    if g.enter(interaction.user.id):
        await interaction.response.send_message("You're entered! Good luck.", ephemeral=True)
        await interaction.message.edit(embed=giveaway_embed(g, ends_at.get(interaction.message.id)))
    else:
        await interaction.response.send_message("You're already entered.", ephemeral=True)


class GiveawayCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.active: Dict[int, Giveaway] = {}          # message id -> Giveaway
        self._ends_at: Dict[int, float] = {}
        self._tasks: set[asyncio.Task] = set()

    giveaway_group = app_commands.Group(name="giveaway", description="Run giveaways", guild_only=True)

    @giveaway_group.command(name="start", description="Start a giveaway")
    @app_commands.default_permissions(manage_guild=True)
    @app_commands.checks.has_permissions(manage_guild=True)
    @app_commands.describe(when='How long it runs, e.g. "10m", "1h", "2 days" (max 30 days)',
                           winners="How many winners (default 1)", prize="What's being given away")
    async def start(self, interaction: discord.Interaction, when: app_commands.Range[str, 1, 30],
                    prize: app_commands.Range[str, 1, 200], winners: app_commands.Range[int, 1, 20] = 1):
        try:
            seconds = float(parse_duration(when))
        except ValueError:
            await interaction.response.send_message(f'Couldn\'t read "{when}". Try something like `10m`, `1h`, or `2 days`.', ephemeral=True)
            return
        if not 10 <= seconds <= 30 * 86400:
            await interaction.response.send_message("Pick something between 10 seconds and 30 days.", ephemeral=True)
            return

        g = Giveaway(winners=winners, prize=prize)
        ends_at = time.time() + seconds
        view = discord.ui.View(timeout=None)
        button = discord.ui.Button(label="🎉 Enter", style=discord.ButtonStyle.primary, custom_id=ENTER_ID)
        view.add_item(button)
        await interaction.response.send_message(embed=giveaway_embed(g, ends_at), view=view)
        msg = await interaction.original_response()
        self.active[msg.id] = g
        self._ends_at[msg.id] = ends_at
        task = asyncio.create_task(self._run(msg, seconds))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run(self, message: discord.Message, seconds: float) -> None:
        await asyncio.sleep(seconds)
        await self._finish(message)

    async def _finish(self, message: discord.Message) -> None:
        g = self.active.pop(message.id, None)
        self._ends_at.pop(message.id, None)
        if g is None or g.ended:
            return
        winners = g.pick_winners()
        try:
            await message.edit(embed=giveaway_embed(g, None, ended=True, winners=winners), view=None)
            if winners:
                mentions = ", ".join(f"<@{w}>" for w in winners)
                await message.reply(f"Congratulations {mentions}! You won **{g.prize}**.",
                                   allowed_mentions=discord.AllowedMentions(users=True))
            else:
                await message.reply("Nobody entered, so there's no winner this time.")
        except discord.HTTPException:
            pass

    @giveaway_group.command(name="end", description="End a giveaway early and pick winners now")
    @app_commands.default_permissions(manage_guild=True)
    @app_commands.checks.has_permissions(manage_guild=True)
    @app_commands.describe(message_id="The giveaway message's id")
    async def end(self, interaction: discord.Interaction, message_id: str):
        if not message_id.isdigit() or int(message_id) not in self.active:
            await interaction.response.send_message("That's not a giveaway I know about (it may have already ended, or the bot restarted).", ephemeral=True)
            return
        try:
            message = await interaction.channel.fetch_message(int(message_id))
        except discord.NotFound:
            await interaction.response.send_message("Couldn't find that message.", ephemeral=True)
            return
        await interaction.response.send_message("Ending it now.", ephemeral=True)
        await self._finish(message)

    @commands.Cog.listener()
    async def on_interaction(self, interaction: discord.Interaction):
        if interaction.type != discord.InteractionType.component or interaction.data.get("custom_id") != ENTER_ID:
            return
        await handle_enter(interaction, self.active, self._ends_at)


async def setup(bot: commands.Bot):
    await bot.add_cog(GiveawayCog(bot))
