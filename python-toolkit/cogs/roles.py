"""Self-assign role buttons.

  /rolepanel   (admins) posts a message with up to 5 role buttons. Members click to add or remove a role.

The buttons are persistent and stateless (the role id is inside the button's custom id), so they keep
working after restarts. Roles with powerful permissions, managed roles and roles above the bot's own
role are refused, so this can't be used to hand out admin.
The bot needs Manage Roles, and its own role must be above the roles it hands out.
"""
from __future__ import annotations

from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from toolkit.discord_helpers import embed

DANGEROUS = discord.Permissions(
    administrator=True, manage_guild=True, manage_roles=True, manage_channels=True, manage_webhooks=True,
    manage_messages=True, kick_members=True, ban_members=True, moderate_members=True, mention_everyone=True,
    manage_nicknames=True, manage_threads=True, manage_expressions=True, view_audit_log=True,
)


def assign_problem(role, bot_top_position: int) -> Optional[str]:
    """Return a reason this role must not be self-assignable, or None if it's fine."""
    if role.is_default():
        return "@everyone can't be assigned."
    if role.managed:
        return "That role is managed by an integration or bot."
    if role.permissions.value & DANGEROUS.value:
        return "That role has powerful permissions (like Administrator or Manage ...). Members must not pick it themselves."
    if role.position >= bot_top_position:
        return "That role is above (or equal to) my highest role. Move my role higher in Server Settings, Roles."
    return None


class RoleToggle(discord.ui.DynamicItem[discord.ui.Button], template=r"roles:toggle:(?P<id>[0-9]+)"):
    def __init__(self, role_id: int, label: str = "Role"):
        super().__init__(discord.ui.Button(label=label[:80], style=discord.ButtonStyle.secondary,
                                           custom_id=f"roles:toggle:{role_id}"))
        self.role_id = role_id

    @classmethod
    async def from_custom_id(cls, interaction: discord.Interaction, item: discord.ui.Button, match, /):
        return cls(int(match["id"]), item.label or "Role")

    async def callback(self, interaction: discord.Interaction):
        guild, member = interaction.guild, interaction.user
        role = guild.get_role(self.role_id) if guild else None
        if role is None or not isinstance(member, discord.Member):
            await interaction.response.send_message("That role doesn't exist any more.", ephemeral=True)
            return
        problem = assign_problem(role, guild.me.top_role.position)
        if problem:
            await interaction.response.send_message(problem, ephemeral=True)
            return
        if role in member.roles:
            await member.remove_roles(role, reason="Self-role panel")
            await interaction.response.send_message(f"Removed **{role.name}**.", ephemeral=True)
        else:
            await member.add_roles(role, reason="Self-role panel")
            await interaction.response.send_message(f"You now have **{role.name}**.", ephemeral=True)


class Roles(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    async def cog_load(self):
        self.bot.add_dynamic_items(RoleToggle)

    @app_commands.command(description="Post a message with buttons that give or remove roles")
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_roles=True)
    @app_commands.checks.has_permissions(manage_roles=True)
    @app_commands.checks.bot_has_permissions(manage_roles=True)
    @app_commands.describe(role1="First role", role2="Second role", role3="Third role", role4="Fourth role",
                           role5="Fifth role", title="Panel title")
    async def rolepanel(self, interaction: discord.Interaction, role1: discord.Role, role2: Optional[discord.Role] = None,
                        role3: Optional[discord.Role] = None, role4: Optional[discord.Role] = None,
                        role5: Optional[discord.Role] = None, title: app_commands.Range[str, 1, 100] = "Pick your roles"):
        roles = [r for r in (role1, role2, role3, role4, role5) if r]
        top = interaction.guild.me.top_role.position
        for r in roles:
            problem = assign_problem(r, top)
            if problem:
                await interaction.response.send_message(f"**{r.name}**: {problem}", ephemeral=True)
                return
        view = discord.ui.View(timeout=None)
        for r in roles:
            view.add_item(RoleToggle(r.id, r.name))
        await interaction.channel.send(embed=embed(title, "Click a button to add or remove that role."), view=view)
        await interaction.response.send_message("Panel posted.", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(Roles(bot))
