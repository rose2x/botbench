'use strict';
// Self-assign role buttons.
//   /rolepanel   (admins) posts a message with up to 5 role buttons. Members click to add or remove a role.
// The buttons are persistent and stateless (the role id is inside the button's custom id), so they keep
// working after restarts. Roles with powerful permissions, managed roles and roles above the bot's own
// role are refused, so this can't be used to hand out admin.
// The bot needs Manage Roles, and its own role must be above the roles it hands out.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionContextType, MessageFlags, PermissionFlagsBits: P, PermissionsBitField } = require('discord.js');
const { embed, command } = require('../utils/discordHelpers');

const DANGEROUS = new PermissionsBitField([
  P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageWebhooks, P.ManageMessages, P.KickMembers,
  P.BanMembers, P.ModerateMembers, P.MentionEveryone, P.ManageNicknames, P.ManageThreads, P.ManageGuildExpressions, P.ViewAuditLog,
]);
const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/** Return a reason this role must not be self-assignable, or null if it's fine. `role` needs id, managed, permissions, position. */
function assignProblem(role, guildId, botTopPosition) {
  if (role.id === guildId) return "@everyone can't be assigned.";
  if (role.managed) return 'That role is managed by an integration or bot.';
  if (role.permissions.any(DANGEROUS)) return "That role has powerful permissions (like Administrator or Manage ...). Members must not pick it themselves.";
  if (role.position >= botTopPosition) return 'That role is above (or equal to) my highest role. Move my role higher in Server Settings, Roles.';
  return null;
}

const options = [1, 2, 3, 4, 5].map((n) => (b) => b.addRoleOption((o) => o.setName(`role${n}`).setDescription(`Role ${n}`).setRequired(n === 1)));

module.exports.commands = [
  {
    data: command('rolepanel', 'Post a message with buttons that give or remove roles', [
      ...options,
      (b) => b.addStringOption((o) => o.setName('title').setDescription('Panel title').setMaxLength(100)),
    ], (b) => b.setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(P.ManageRoles)),
    async execute(i) {
      if (!i.appPermissions?.has(P.ManageRoles)) return i.reply(ephemeral("I need the Manage Roles permission."));
      const roles = [1, 2, 3, 4, 5].map((n) => i.options.getRole(`role${n}`)).filter(Boolean);
      const top = i.guild.members.me.roles.highest.position;
      for (const r of roles) {
        const problem = assignProblem(r, i.guildId, top);
        if (problem) return i.reply(ephemeral(`**${r.name}**: ${problem}`));
      }
      const row = new ActionRowBuilder().addComponents(roles.map((r) => new ButtonBuilder().setCustomId(`roles:toggle:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
      await i.channel.send({ embeds: [embed(i.options.getString('title') || 'Pick your roles', 'Click a button to add or remove that role.')], components: [row] });
      return i.reply(ephemeral('Panel posted.'));
    },
  },
];

module.exports.components = [
  {
    id: 'roles:toggle',
    async execute(i) {
      const roleId = i.customId.split(':')[2];
      const role = i.guild?.roles.cache.get(roleId);
      if (!role) return i.reply(ephemeral("That role doesn't exist any more."));
      const problem = assignProblem(role, i.guildId, i.guild.members.me.roles.highest.position);
      if (problem) return i.reply(ephemeral(problem));
      if (i.member.roles.cache.has(roleId)) {
        await i.member.roles.remove(roleId, 'Self-role panel');
        return i.reply(ephemeral(`Removed **${role.name}**.`));
      }
      await i.member.roles.add(roleId, 'Self-role panel');
      return i.reply(ephemeral(`You now have **${role.name}**.`));
    },
  },
];

module.exports.assignProblem = assignProblem;
