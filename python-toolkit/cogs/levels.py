"""XP and levels stored in SQLite. Needs no privileged intent: it counts messages, not their text."""
from __future__ import annotations

import random
import time
from typing import Optional

import aiosqlite
import discord
from discord import app_commands
from discord.ext import commands

from botbench_libs.leaderboard import medal, rank
from botbench_libs.leveling import level_for, progress
from toolkit.discord_helpers import embed

DB_PATH = "bot.db"
XP_COOLDOWN = 60          # seconds between XP gains per user


class Levels(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.db: aiosqlite.Connection | None = None
        self._last: dict[tuple[int, int], float] = {}

    async def cog_load(self):
        self.db = await aiosqlite.connect(DB_PATH)
        await self.db.execute("""CREATE TABLE IF NOT EXISTS xp (
            guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id))""")
        await self.db.commit()

    async def cog_unload(self):
        if self.db:
            await self.db.close()

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild or not self.db:
            return
        key = (message.guild.id, message.author.id)
        now = time.monotonic()
        if now - self._last.get(key, 0) < XP_COOLDOWN:
            return
        self._last[key] = now
        gain = random.randint(15, 25)
        await self.db.execute(
            "INSERT INTO xp (guild_id, user_id, xp) VALUES (?, ?, ?) "
            "ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp",
            (*key, gain))
        await self.db.commit()
        cur = await self.db.execute("SELECT xp FROM xp WHERE guild_id = ? AND user_id = ?", key)
        total = (await cur.fetchone())[0]
        if level_for(total) > level_for(total - gain):
            perms = message.channel.permissions_for(message.guild.me)
            if perms.send_messages:
                await message.channel.send(f"{message.author.mention} reached level **{level_for(total)}**!")

    @app_commands.command(description="Show your level")
    @app_commands.guild_only()
    async def rank(self, interaction: discord.Interaction, member: Optional[discord.Member] = None):
        member = member or interaction.user
        cur = await self.db.execute("SELECT xp FROM xp WHERE guild_id = ? AND user_id = ?", (interaction.guild_id, member.id))
        row = await cur.fetchone()
        total = row[0] if row else 0
        lvl = level_for(total)
        into, need = total - xp_for(lvl), xp_for(lvl + 1) - xp_for(lvl)
        bar = "█" * int(10 * into / need) + "░" * (10 - int(10 * into / need))
        await interaction.response.send_message(embed=embed(
            member.display_name, f"Level **{lvl}**\n{bar} {into}/{need} XP\nTotal XP: {total}",
            thumbnail=member.display_avatar.url))

    @app_commands.command(description="Top 10 in this server")
    @app_commands.guild_only()
    async def leaderboard(self, interaction: discord.Interaction):
        cur = await self.db.execute(
            "SELECT user_id, xp FROM xp WHERE guild_id = ? ORDER BY xp DESC LIMIT 10", (interaction.guild_id,))
        rows = await cur.fetchall()
        if not rows:
            await interaction.response.send_message("Nobody has any XP yet. Start chatting!", ephemeral=True)
            return
        lines = [f"**{i + 1}.** <@{uid}>: level {level_for(x)} ({x} XP)" for i, (uid, x) in enumerate(rows)]
        await interaction.response.send_message(embed=embed("Leaderboard", "\n".join(lines)))


async def setup(bot: commands.Bot):
    await bot.add_cog(Levels(bot))
