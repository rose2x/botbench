"""Support tickets using private threads.

  /ticketpanel   (admins) posts a message with an "Open a ticket" button in the current channel
  button         creates a private thread for the user (one open ticket per user)
  /ticketclose   (or the Close button) locks and archives the thread

The buttons are persistent: they keep working after the bot restarts.
The bot needs: Create Private Threads, Send Messages in Threads and Manage Threads in the panel channel.
"""
from __future__ import annotations

import re
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from toolkit.discord_helpers import embed

OPEN_ID = "ticket:open"
CLOSE_ID = "ticket:close"


def ticket_name(user: discord.abc.User) -> str:
    """Thread names end in the opener's id, which is how we find and check tickets."""
    safe = re.sub(r"[^a-z0-9]+", "-", user.name.lower()).strip("-")[:20] or "user"
    return f"ticket-{safe}-{user.id}"


def owner_id(thread_name: str) -> Optional[int]:
    m = re.match(r"^ticket-.*-(\d{15,25})$", thread_name)
    return int(m.group(1)) if m else None


async def close_ticket(interaction: discord.Interaction) -> None:
    thread = interaction.channel
    if not isinstance(thread, discord.Thread) or owner_id(thread.name) is None:
        await interaction.response.send_message("This isn't a ticket thread.", ephemeral=True)
        return
    if interaction.user.id != owner_id(thread.name) and not interaction.permissions.manage_threads:
        await interaction.response.send_message("Only the ticket owner or a moderator can close it.", ephemeral=True)
        return
    await interaction.response.send_message("Closing this ticket. Thanks!")
    await thread.edit(locked=True, archived=True, reason=f"Closed by {interaction.user}")


class CloseView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Close ticket", style=discord.ButtonStyle.danger, custom_id=CLOSE_ID)
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        await close_ticket(interaction)


class PanelView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Open a ticket", style=discord.ButtonStyle.primary, custom_id=OPEN_ID)
    async def open(self, interaction: discord.Interaction, button: discord.ui.Button):
        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel):
            await interaction.response.send_message("Tickets can only be opened from a text channel.", ephemeral=True)
            return
        existing = next((t for t in channel.threads if owner_id(t.name) == interaction.user.id and not t.archived), None)
        if existing:
            await interaction.response.send_message(f"You already have an open ticket: {existing.mention}", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        thread = await channel.create_thread(name=ticket_name(interaction.user), type=discord.ChannelType.private_thread,
                                             invitable=False, reason=f"Ticket for {interaction.user}")
        await thread.add_user(interaction.user)
        await thread.send(f"{interaction.user.mention} thanks for reaching out. Describe your problem and a moderator will help "
                          "you soon. Press the button when it's solved.", view=CloseView(),
                          allowed_mentions=discord.AllowedMentions(users=[interaction.user]))
        await interaction.followup.send(f"Your ticket is ready: {thread.mention}", ephemeral=True)


class Tickets(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    async def cog_load(self):
        self.bot.add_view(PanelView())     # persistent: survive restarts
        self.bot.add_view(CloseView())

    @app_commands.command(description="Post the ticket button in this channel")
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_guild=True)
    @app_commands.checks.has_permissions(manage_guild=True)
    @app_commands.checks.bot_has_permissions(create_private_threads=True, send_messages_in_threads=True, manage_threads=True)
    @app_commands.describe(title="Panel title", text="Text under the title")
    async def ticketpanel(self, interaction: discord.Interaction, title: app_commands.Range[str, 1, 100] = "Support",
                          text: app_commands.Range[str, 1, 1000] = "Need help? Press the button to open a private ticket."):
        if not isinstance(interaction.channel, discord.TextChannel):
            await interaction.response.send_message("Use this in a text channel.", ephemeral=True)
            return
        await interaction.channel.send(embed=embed(title, text), view=PanelView())
        await interaction.response.send_message("Panel posted.", ephemeral=True)

    @app_commands.command(description="Close the ticket you're in")
    @app_commands.guild_only()
    async def ticketclose(self, interaction: discord.Interaction):
        await close_ticket(interaction)


async def setup(bot: commands.Bot):
    await bot.add_cog(Tickets(bot))
