"""Basic commands: ping, about, avatar, userinfo, serverinfo."""
from __future__ import annotations

import time
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from toolkit.discord_helpers import embed


def _duration(seconds: float) -> str:
    seconds = int(seconds)
    d, rem = divmod(seconds, 86400)
    h, rem = divmod(rem, 3600)
    m, s = divmod(rem, 60)
    return " ".join(x for x in (f"{d}d" if d else "", f"{h}h" if h else "", f"{m}m" if m else "", f"{s}s") if x)


class General(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(description="Check the bot's latency")
    async def ping(self, interaction: discord.Interaction):
        await interaction.response.send_message(f"Pong! {round(self.bot.latency * 1000)}ms")

    @app_commands.command(description="About this bot")
    async def about(self, interaction: discord.Interaction):
        e = embed("About", "Built with the Bot Bench toolkit.")
        e.add_field(name="Servers", value=str(len(self.bot.guilds)))
        e.add_field(name="Uptime", value=_duration(time.time() - self.bot.started_at))
        e.add_field(name="Latency", value=f"{round(self.bot.latency * 1000)}ms")
        e.add_field(name="discord.py", value=discord.__version__)
        await interaction.response.send_message(embed=e)

    @app_commands.command(description="Show someone's avatar")
    @app_commands.describe(user="Whose avatar (default: you)")
    async def avatar(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        user = user or interaction.user
        await interaction.response.send_message(embed=embed(f"{user.display_name}'s avatar", image=user.display_avatar.url))

    @app_commands.command(description="Info about a member")
    @app_commands.guild_only()
    @app_commands.describe(member="Which member (default: you)")
    async def userinfo(self, interaction: discord.Interaction, member: Optional[discord.Member] = None):
        member = member or interaction.user
        roles = [r.mention for r in reversed(member.roles) if r.name != "@everyone"]
        e = embed(str(member), thumbnail=member.display_avatar.url)
        e.add_field(name="ID", value=str(member.id))
        e.add_field(name="Account created", value=discord.utils.format_dt(member.created_at, "R"))
        e.add_field(name="Joined server", value=discord.utils.format_dt(member.joined_at, "R") if member.joined_at else "n/a")
        e.add_field(name=f"Roles ({len(roles)})", value=" ".join(roles[:15]) or "none", inline=False)
        await interaction.response.send_message(embed=e)

    @app_commands.command(description="Info about this server")
    @app_commands.guild_only()
    async def serverinfo(self, interaction: discord.Interaction):
        g = interaction.guild
        e = embed(g.name, thumbnail=g.icon.url if g.icon else None)
        e.add_field(name="Members", value=str(g.member_count))
        e.add_field(name="Created", value=discord.utils.format_dt(g.created_at, "D"))
        e.add_field(name="Owner", value=f"<@{g.owner_id}>")
        e.add_field(name="Text channels", value=str(len(g.text_channels)))
        e.add_field(name="Voice channels", value=str(len(g.voice_channels)))
        e.add_field(name="Boost level", value=str(g.premium_tier))
        await interaction.response.send_message(embed=e)


async def setup(bot: commands.Bot):
    await bot.add_cog(General(bot))
