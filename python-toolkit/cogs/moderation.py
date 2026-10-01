"""Moderation commands. Each one checks permissions and role order before acting."""
from __future__ import annotations

from datetime import timedelta
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands


def _why(interaction: discord.Interaction, reason: Optional[str]) -> str:
    """Text for Discord's audit log. Includes who ran the command."""
    return f"{interaction.user} ({interaction.user.id}): {reason or 'no reason given'}"[:500]


def _problem(interaction: discord.Interaction, target: discord.Member) -> Optional[str]:
    """Return a message if the action must not happen, else None."""
    guild = interaction.guild
    if target.id == interaction.user.id:
        return "You can't do that to yourself."
    if target.id == guild.owner_id:
        return "You can't do that to the server owner."
    if target.id == guild.me.id:
        return "Nice try."
    if interaction.user.id != guild.owner_id and target.top_role >= interaction.user.top_role:
        return "That member's top role is equal to or higher than yours."
    if target.top_role >= guild.me.top_role:
        return "That member's top role is equal to or higher than mine. Move my role higher in Server Settings, Roles."
    return None


class Moderation(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(description="Kick a member")
    @app_commands.guild_only()
    @app_commands.default_permissions(kick_members=True)
    @app_commands.checks.has_permissions(kick_members=True)
    @app_commands.checks.bot_has_permissions(kick_members=True)
    @app_commands.describe(member="Who to kick", reason="Why (saved in the audit log)")
    async def kick(self, interaction: discord.Interaction, member: discord.Member, reason: Optional[str] = None):
        if msg := _problem(interaction, member):
            await interaction.response.send_message(msg, ephemeral=True)
            return
        await member.kick(reason=_why(interaction, reason))
        await interaction.response.send_message(f"Kicked **{member}**.")

    @app_commands.command(description="Ban a member")
    @app_commands.guild_only()
    @app_commands.default_permissions(ban_members=True)
    @app_commands.checks.has_permissions(ban_members=True)
    @app_commands.checks.bot_has_permissions(ban_members=True)
    @app_commands.describe(member="Who to ban", reason="Why (saved in the audit log)",
                           delete_days="Delete their messages from the last N days (0 to 7)")
    async def ban(self, interaction: discord.Interaction, member: discord.Member, reason: Optional[str] = None,
                  delete_days: app_commands.Range[int, 0, 7] = 0):
        if msg := _problem(interaction, member):
            await interaction.response.send_message(msg, ephemeral=True)
            return
        await member.ban(reason=_why(interaction, reason), delete_message_seconds=delete_days * 86400)
        await interaction.response.send_message(f"Banned **{member}**.")

    @app_commands.command(description="Remove a ban by user id")
    @app_commands.guild_only()
    @app_commands.default_permissions(ban_members=True)
    @app_commands.checks.has_permissions(ban_members=True)
    @app_commands.checks.bot_has_permissions(ban_members=True)
    @app_commands.describe(user_id="The user's id (a number)", reason="Why")
    async def unban(self, interaction: discord.Interaction, user_id: str, reason: Optional[str] = None):
        if not user_id.isdigit():
            await interaction.response.send_message("That isn't a valid user id.", ephemeral=True)
            return
        try:
            await interaction.guild.unban(discord.Object(id=int(user_id)), reason=_why(interaction, reason))
        except discord.NotFound:
            await interaction.response.send_message("That user isn't banned.", ephemeral=True)
            return
        await interaction.response.send_message(f"Unbanned `{user_id}`.")

    @app_commands.command(description="Time a member out")
    @app_commands.guild_only()
    @app_commands.default_permissions(moderate_members=True)
    @app_commands.checks.has_permissions(moderate_members=True)
    @app_commands.checks.bot_has_permissions(moderate_members=True)
    @app_commands.describe(member="Who", minutes="How long (up to 28 days)", reason="Why")
    async def timeout(self, interaction: discord.Interaction, member: discord.Member,
                      minutes: app_commands.Range[int, 1, 40320], reason: Optional[str] = None):
        if msg := _problem(interaction, member):
            await interaction.response.send_message(msg, ephemeral=True)
            return
        await member.timeout(timedelta(minutes=minutes), reason=_why(interaction, reason))
        await interaction.response.send_message(f"**{member}** is timed out for {minutes} minute(s).")

    @app_commands.command(description="Remove a member's timeout")
    @app_commands.guild_only()
    @app_commands.default_permissions(moderate_members=True)
    @app_commands.checks.has_permissions(moderate_members=True)
    @app_commands.checks.bot_has_permissions(moderate_members=True)
    async def untimeout(self, interaction: discord.Interaction, member: discord.Member):
        await member.timeout(None, reason=_why(interaction, "timeout removed"))
        await interaction.response.send_message(f"Removed the timeout from **{member}**.")

    @app_commands.command(description="Delete recent messages in this channel")
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_messages=True)
    @app_commands.checks.has_permissions(manage_messages=True)
    @app_commands.checks.bot_has_permissions(manage_messages=True, read_message_history=True)
    @app_commands.describe(amount="How many messages (1 to 100)")
    async def purge(self, interaction: discord.Interaction, amount: app_commands.Range[int, 1, 100]):
        if not isinstance(interaction.channel, (discord.TextChannel, discord.Thread, discord.VoiceChannel)):
            await interaction.response.send_message("I can't purge this kind of channel.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        deleted = await interaction.channel.purge(limit=amount, reason=_why(interaction, "purge"))
        await interaction.followup.send(f"Deleted {len(deleted)} message(s). Messages older than 14 days are skipped.", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(Moderation(bot))
