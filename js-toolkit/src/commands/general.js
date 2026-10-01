'use strict';
// Basic commands: ping, about, avatar, userinfo, serverinfo.
const { InteractionContextType, version } = require('discord.js');
const { embed, opt, command } = require('../utils/discordHelpers');
const { timestamp } = require('../utils/discordUtils');

const guildOnly = (b) => b.setContexts(InteractionContextType.Guild);
const duration = (s) => {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s % 60}s`].filter(Boolean).join(' ');
};

module.exports.commands = [
  {
    data: command('ping', "Check the bot's latency"),
    execute: (i) => i.reply(`Pong! ${Math.round(i.client.ws.ping)}ms`),
  },
  {
    data: command('about', 'About this bot'),
    async execute(i) {
      const e = embed('About', 'Built with the Bot Bench toolkit.').addFields(
        { name: 'Servers', value: String(i.client.guilds.cache.size), inline: true },
        { name: 'Uptime', value: duration(process.uptime()), inline: true },
        { name: 'Latency', value: `${Math.round(i.client.ws.ping)}ms`, inline: true },
        { name: 'discord.js', value: version, inline: true },
        { name: 'Node', value: process.version, inline: true },
      );
      await i.reply({ embeds: [e] });
    },
  },
  {
    data: command('avatar', "Show someone's avatar", [opt.user('user', 'Whose avatar (default: you)', { required: false })]),
    async execute(i) {
      const user = i.options.getUser('user') || i.user;
      await i.reply({ embeds: [embed(`${user.displayName}'s avatar`, '', { image: user.displayAvatarURL({ size: 1024 }) })] });
    },
  },
  {
    data: command('userinfo', 'Info about a member', [opt.user('member', 'Which member (default: you)', { required: false })], guildOnly),
    async execute(i) {
      const member = i.options.getMember('member') || i.member;
      const roles = member.roles.cache.filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position).map((r) => r.toString());
      const e = embed(member.user.tag, '', { thumbnail: member.displayAvatarURL() }).addFields(
        { name: 'ID', value: member.id, inline: true },
        { name: 'Account created', value: timestamp(member.user.createdAt, 'R'), inline: true },
        { name: 'Joined server', value: member.joinedAt ? timestamp(member.joinedAt, 'R') : 'n/a', inline: true },
        { name: `Roles (${roles.length})`, value: roles.slice(0, 15).join(' ') || 'none' },
      );
      await i.reply({ embeds: [e] });
    },
  },
  {
    data: command('serverinfo', 'Info about this server', [], guildOnly),
    async execute(i) {
      const g = i.guild;
      const e = embed(g.name, '', { thumbnail: g.iconURL() || undefined }).addFields(
        { name: 'Members', value: String(g.memberCount), inline: true },
        { name: 'Created', value: timestamp(g.createdAt, 'D'), inline: true },
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Channels', value: String(g.channels.cache.size), inline: true },
        { name: 'Roles', value: String(g.roles.cache.size), inline: true },
        { name: 'Boost level', value: String(g.premiumTier), inline: true },
      );
      await i.reply({ embeds: [e] });
    },
  },
];
