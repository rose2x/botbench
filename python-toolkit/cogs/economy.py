"""A simple virtual currency, stored in SQLite. Balances are per server.

  /balance [member]     see a balance
  /daily                claim a reward once every 24 hours
  /pay <member> <amount> transfer coins to someone else
  /richest               top 10 balances, using the shared leaderboard library

All the money math lives in botbench_libs.economy, so it's tested once and used the same way here and
in the JavaScript bot.
"""
from __future__ import annotations

import time
from typing import Optional

import aiosqlite
import discord
from discord import app_commands
from discord.ext import commands

from botbench_libs.duration import format_duration
from botbench_libs.economy import InsufficientFunds, apply_transfer, can_afford, daily_reward, format_currency
from botbench_libs.leaderboard import medal, rank
from toolkit.discord_helpers import embed

DB_PATH = "bot.db"


class Economy(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.db: Optional[aiosqlite.Connection] = None

    async def cog_load(self):
        self.db = await aiosqlite.connect(DB_PATH)
        await self.db.execute("""CREATE TABLE IF NOT EXISTS wallet (
            guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL, balance INTEGER NOT NULL DEFAULT 0,
            last_daily REAL, PRIMARY KEY (guild_id, user_id))""")
        await self.db.commit()

    async def cog_unload(self):
        if self.db:
            await self.db.close()

    async def _row(self, guild_id: int, user_id: int) -> tuple[int, Optional[float]]:
        cur = await self.db.execute("SELECT balance, last_daily FROM wallet WHERE guild_id = ? AND user_id = ?", (guild_id, user_id))
        row = await cur.fetchone()
        return (row[0], row[1]) if row else (0, None)

    async def _set_balance(self, guild_id: int, user_id: int, balance: int, last_daily: Optional[float] = None) -> None:
        await self.db.execute(
            "INSERT INTO wallet (guild_id, user_id, balance, last_daily) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(guild_id, user_id) DO UPDATE SET balance = excluded.balance"
            + (", last_daily = excluded.last_daily" if last_daily is not None else ""),
            (guild_id, user_id, balance, last_daily))
        await self.db.commit()

    @app_commands.command(description="Check a balance")
    @app_commands.guild_only()
    @app_commands.describe(member="Whose balance (default: you)")
    async def balance(self, interaction: discord.Interaction, member: Optional[discord.Member] = None):
        member = member or interaction.user
        bal, _ = await self._row(interaction.guild_id, member.id)
        await interaction.response.send_message(f"{member.mention}: **{format_currency(bal)}**")

    @app_commands.command(description="Claim your daily reward")
    @app_commands.guild_only()
    async def daily(self, interaction: discord.Interaction):
        bal, last = await self._row(interaction.guild_id, interaction.user.id)
        result = daily_reward(last, time.time())
        if not result["ready"]:
            await interaction.response.send_message(
                f"You already claimed today. Try again in {format_duration(result['retry_after'])}.", ephemeral=True)
            return
        await self._set_balance(interaction.guild_id, interaction.user.id, bal + result["amount"], time.time())
        await interaction.response.send_message(f"You claimed **{format_currency(result['amount'])}**! New balance: {format_currency(bal + result['amount'])}")

    @app_commands.command(description="Pay another member")
    @app_commands.guild_only()
    @app_commands.describe(member="Who to pay", amount="How much")
    async def pay(self, interaction: discord.Interaction, member: discord.Member, amount: app_commands.Range[int, 1, 1_000_000]):
        if member.id == interaction.user.id:
            await interaction.response.send_message("You can't pay yourself.", ephemeral=True)
            return
        if member.bot:
            await interaction.response.send_message("Bots don't need money.", ephemeral=True)
            return
        sender_bal, _ = await self._row(interaction.guild_id, interaction.user.id)
        if not can_afford(sender_bal, amount):
            await interaction.response.send_message(f"You only have {format_currency(sender_bal)}.", ephemeral=True)
            return
        receiver_bal, _ = await self._row(interaction.guild_id, member.id)
        try:
            new_sender, new_receiver = apply_transfer(sender_bal, receiver_bal, amount)
        except InsufficientFunds:
            await interaction.response.send_message(f"You only have {format_currency(sender_bal)}.", ephemeral=True)
            return
        await self._set_balance(interaction.guild_id, interaction.user.id, new_sender)
        await self._set_balance(interaction.guild_id, member.id, new_receiver)
        await interaction.response.send_message(f"{interaction.user.mention} paid {member.mention} **{format_currency(amount)}**.")

    @app_commands.command(description="Top 10 balances in this server")
    @app_commands.guild_only()
    async def richest(self, interaction: discord.Interaction):
        cur = await self.db.execute("SELECT user_id, balance FROM wallet WHERE guild_id = ?", (interaction.guild_id,))
        rows = await cur.fetchall()
        if not rows:
            await interaction.response.send_message("Nobody has any coins yet. Try `/daily`.", ephemeral=True)
            return
        entries = rank([(uid, bal) for uid, bal in rows], top=10)
        lines = [f"{medal(e['rank'])} <@{e['id']}>: {format_currency(e['score'])}" for e in entries]
        await interaction.response.send_message(embed=embed("Richest members", "\n".join(lines)))


async def setup(bot: commands.Bot):
    await bot.add_cog(Economy(bot))
