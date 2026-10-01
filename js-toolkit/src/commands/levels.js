'use strict';
// XP and levels stored in a JSON file. Needs no privileged intent: it counts messages, not their text.
const { Events, InteractionContextType } = require('discord.js');
const { leveling, leaderboard } = require('botbench-libs');
const { JsonStore } = require('../utils/store');
const { embed, opt, command } = require('../utils/discordHelpers');

const XP_COOLDOWN_MS = 60_000;

let store;
const getStore = () => (store ??= new JsonStore('data/xp.json'));
const lastGain = new Map();
const guildOnly = (b) => b.setContexts(InteractionContextType.Guild);

module.exports.events = [
  {
    name: Events.MessageCreate,
    execute(message) {
      if (message.author.bot || !message.guild) return;
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      if (now - (lastGain.get(key) || 0) < XP_COOLDOWN_MS) return;
      lastGain.set(key, now);
      const gain = 15 + Math.floor(Math.random() * 11);
      const before = getStore().get(key, 0);
      const total = getStore().set(key, before + gain);
      if (leveling.levelFor(total) > leveling.levelFor(before) && message.channel.permissionsFor(message.guild.members.me)?.has('SendMessages')) {
        message.channel.send(`${message.author} reached level **${leveling.levelFor(total)}**!`).catch(() => {});
      }
    },
  },
];

module.exports.commands = [
  {
    data: command('rank', 'Show your level', [opt.user('member', 'Whose level (default: you)', { required: false })], guildOnly),
    async execute(i) {
      const user = i.options.getUser('member') || i.user;
      const total = getStore().get(`${i.guildId}:${user.id}`, 0);
      const p = leveling.progress(total);
      const filled = Math.floor(10 * p.fraction);
      await i.reply({ embeds: [embed(user.displayName, `Level **${p.level}**\n${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${p.into}/${p.need} XP\nTotal XP: ${total}`, { thumbnail: user.displayAvatarURL() })] });
    },
  },
  {
    data: command('leaderboard', 'Top 10 in this server', [], guildOnly),
    async execute(i) {
      const prefix = `${i.guildId}:`;
      const rows = getStore().entries().filter(([k]) => k.startsWith(prefix)).map(([k, xp]) => [k.slice(prefix.length), xp]);
      if (!rows.length) return i.reply({ content: 'Nobody has any XP yet. Start chatting!', flags: 64 });
      const entries = leaderboard.rank(rows, 10);
      return i.reply({ embeds: [embed('Leaderboard', entries.map((e) => `${leaderboard.medal(e.rank)} <@${e.id}>: level ${leveling.levelFor(e.score)} (${e.score} XP)`).join('\n'))] });
    },
  },
];
