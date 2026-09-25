'use strict';
// Moderation commands. Each one checks permissions and role order before acting.
const { InteractionContextType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { opt, command } = require('../utils/discordHelpers');

const guildOnly = (perm) => (b) => b.setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(perm);
const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const why = (i, reason) => `${i.user.tag} (${i.user.id}): ${reason || 'no reason given'}`.slice(0, 500);

/** Returns a message if the bot lacks a permission. */
const botNeeds = (i, flag, label) => (i.appPermissions?.has(flag) ? null : `I'm missing the "${label}" permission.`);

/** Returns a message if the action must not happen, else null. */
function problem(i, target) {
  const guild = i.guild;
  if (!target) return "That user isn't in this server.";
  if (target.id === i.user.id) return "You can't do that to yourself.";
  if (target.id === guild.ownerId) return "You can't do that to the server owner.";
  if (target.id === guild.members.me.id) return 'Nice try.';
  if (i.user.id !== guild.ownerId && target.roles.highest.position >= i.member.roles.highest.position) return "That member's top role is equal to or higher than yours.";
  if (target.roles.highest.position >= guild.members.me.roles.highest.position) return "That member's top role is equal to or higher than mine. Move my role higher in Server Settings, Roles.";
  return null;
}

module.exports.commands = [
  {
    data: command('kick', 'Kick a member', [opt.user('member', 'Who to kick'), opt.string('reason', 'Why (saved in the audit log)', { required: false, max: 300 })], guildOnly(PermissionFlagsBits.KickMembers)),
    async execute(i) {
      const member = i.options.getMember('member');
      const msg = botNeeds(i, PermissionFlagsBits.KickMembers, 'Kick Members') || problem(i, member);
      if (msg) return i.reply(ephemeral(msg));
      await member.kick(why(i, i.options.getString('reason')));
      return i.reply(`Kicked **${member.user.tag}**.`);
    },
  },
  {
    data: command('ban', 'Ban a member', [opt.user('member', 'Who to ban'), opt.string('reason', 'Why (saved in the audit log)', { required: false, max: 300 }), opt.integer('delete_days', 'Delete their messages from the last N days (0 to 7)', { required: false, min: 0, max: 7 })], guildOnly(PermissionFlagsBits.BanMembers)),
    async execute(i) {
      const member = i.options.getMember('member');
      const msg = botNeeds(i, PermissionFlagsBits.BanMembers, 'Ban Members') || problem(i, member);
      if (msg) return i.reply(ephemeral(msg));
      await member.ban({ reason: why(i, i.options.getString('reason')), deleteMessageSeconds: (i.options.getInteger('delete_days') || 0) * 86400 });
      return i.reply(`Banned **${member.user.tag}**.`);
    },
  },
  {
    data: command('unban', 'Remove a ban by user id', [opt.string('user_id', "The user's id (a number)", { min: 15, max: 25 }), opt.string('reason', 'Why', { required: false, max: 300 })], guildOnly(PermissionFlagsBits.BanMembers)),
    async execute(i) {
      const id = i.options.getString('user_id');
      if (!/^\d+$/.test(id)) return i.reply(ephemeral("That isn't a valid user id."));
      const msg = botNeeds(i, PermissionFlagsBits.BanMembers, 'Ban Members');
      if (msg) return i.reply(ephemeral(msg));
      try { await i.guild.members.unban(id, why(i, i.options.getString('reason'))); } catch { return i.reply(ephemeral("That user isn't banned.")); }
      return i.reply(`Unbanned \`${id}\`.`);
    },
  },
  {
    data: command('timeout', 'Time a member out', [opt.user('member', 'Who'), opt.integer('minutes', 'How long (up to 28 days)', { min: 1, max: 40320 }), opt.string('reason', 'Why', { required: false, max: 300 })], guildOnly(PermissionFlagsBits.ModerateMembers)),
    async execute(i) {
      const member = i.options.getMember('member');
      const msg = botNeeds(i, PermissionFlagsBits.ModerateMembers, 'Timeout Members') || problem(i, member);
      if (msg) return i.reply(ephemeral(msg));
      const minutes = i.options.getInteger('minutes');
      await member.timeout(minutes * 60_000, why(i, i.options.getString('reason')));
      return i.reply(`**${member.user.tag}** is timed out for ${minutes} minute(s).`);
    },
  },
  {
    data: command('untimeout', "Remove a member's timeout", [opt.user('member', 'Who')], guildOnly(PermissionFlagsBits.ModerateMembers)),
    async execute(i) {
      const member = i.options.getMember('member');
      const msg = botNeeds(i, PermissionFlagsBits.ModerateMembers, 'Timeout Members');
      if (msg) return i.reply(ephemeral(msg));
      if (!member) return i.reply(ephemeral("That user isn't in this server."));
      await member.timeout(null, why(i, 'timeout removed'));
      return i.reply(`Removed the timeout from **${member.user.tag}**.`);
    },
  },
  {
    data: command('purge', 'Delete recent messages in this channel', [opt.integer('amount', 'How many messages (1 to 100)', { min: 1, max: 100 })], guildOnly(PermissionFlagsBits.ManageMessages)),
    async execute(i) {
      const need = botNeeds(i, PermissionFlagsBits.ManageMessages, 'Manage Messages') || botNeeds(i, PermissionFlagsBits.ReadMessageHistory, 'Read Message History');
      if (need) return i.reply(ephemeral(need));
      if (!i.channel?.bulkDelete) return i.reply(ephemeral("I can't purge this kind of channel."));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const deleted = await i.channel.bulkDelete(i.options.getInteger('amount'), true); // true = skip messages older than 14 days
      return i.editReply(`Deleted ${deleted.size} message(s). Messages older than 14 days are skipped.`);
    },
  },
];
