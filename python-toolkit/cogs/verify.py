"""A verification gate: a button that opens a math captcha, and gives a role on a correct answer.

  /verifysetup <role>   (admins) posts a stateless "Verify" button for that role

The button's custom id carries the role id, and the modal's custom id carries the captcha numbers, so
nothing needs to be stored between steps. The whole flow works even if the bot restarts in between.
The bot needs Manage Roles, and its own role must be above the role it hands out.
"""
from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from botbench_libs.captcha import generate_challenge, verify_answer
from toolkit.discord_helpers import embed

BUTTON_PREFIX = "verify:start:"
MODAL_PREFIX = "verify:submit:"


def _assign_problem(role: discord.Role, bot_top_position: int) -> str | None:
    """Reuses the same safety rule as the self-role panel: no handing out admin through a button."""
    from cogs.roles import assign_problem
    return assign_problem(role, bot_top_position)


class CaptchaModal(discord.ui.Modal):
    def __init__(self, role_id: int, challenge: dict):
        super().__init__(title="Quick check", custom_id=f"{MODAL_PREFIX}{role_id}:{challenge['a']}:{challenge['b']}", timeout=300)
        self.role_id, self.a, self.b = role_id, challenge["a"], challenge["b"]
        self.answer = discord.ui.TextInput(label=challenge["question"], placeholder="Type the number", max_length=10)
        self.add_item(self.answer)

    async def on_submit(self, interaction: discord.Interaction):
        if not verify_answer(self.a, self.b, self.answer.value):
            await interaction.response.send_message("That's not right. Press the button again for a new question.", ephemeral=True)
            return
        role = interaction.guild.get_role(self.role_id)
        if role is None:
            await interaction.response.send_message("That role doesn't exist any more. Ask a moderator to set verification up again.", ephemeral=True)
            return
        problem = _assign_problem(role, interaction.guild.me.top_role.position)
        if problem:
            await interaction.response.send_message(f"I can't give out that role right now: {problem}", ephemeral=True)
            return
        if role in interaction.user.roles:
            await interaction.response.send_message("You're already verified.", ephemeral=True)
            return
        await interaction.user.add_roles(role, reason="Passed verification")
        await interaction.response.send_message(f"Correct! You now have **{role.name}**. Welcome!", ephemeral=True)


class Verify(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(description="Post a verification button that hands out a role")
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_roles=True)
    @app_commands.checks.has_permissions(manage_roles=True)
    @app_commands.checks.bot_has_permissions(manage_roles=True)
    @app_commands.describe(role="The role to give once someone passes the check")
    async def verifysetup(self, interaction: discord.Interaction, role: discord.Role):
        problem = _assign_problem(role, interaction.guild.me.top_role.position)
        if problem:
            await interaction.response.send_message(f"**{role.name}**: {problem}", ephemeral=True)
            return
        view = discord.ui.View(timeout=None)
        view.add_item(discord.ui.Button(label="Verify", style=discord.ButtonStyle.success, custom_id=f"{BUTTON_PREFIX}{role.id}"))
        await interaction.channel.send(
            embed=embed("Verification", f"Press the button, answer one quick math question, and you'll get the **{role.name}** role."),
            view=view)
        await interaction.response.send_message("Panel posted.", ephemeral=True)

    @commands.Cog.listener()
    async def on_interaction(self, interaction: discord.Interaction):
        if interaction.type != discord.InteractionType.component:
            return
        custom_id = interaction.data.get("custom_id", "")
        if not custom_id.startswith(BUTTON_PREFIX):
            return
        role_id = int(custom_id[len(BUTTON_PREFIX):])
        await interaction.response.send_modal(CaptchaModal(role_id, generate_challenge()))


async def setup(bot: commands.Bot):
    await bot.add_cog(Verify(bot))
