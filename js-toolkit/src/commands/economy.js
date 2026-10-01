'use strict';
// A simple virtual currency, stored in a JSON file. Balances are per server.
//
//   /balance [member]      see a balance
//   /daily                 claim a reward once every 24 hours
//   /pay <member> <amount> transfer coins to someone else
//   /richest               top 10 balances, using the shared leaderboard library
//
// All the money math lives in botbench-libs/economy, so it's tested once and used the same way here
// and in the Python bot.
const { InteractionContextType, MessageFlags } = require('discord.js');
const { economy, leaderboard, duration } = require('botbench-libs');
const { JsonStore } = require('../utils/store');
const { embed, opt, command } = require('../utils/discordHelpers');

let store;
const getStore = () => (store ??= new JsonStore('data/wallet.json'));
const guildOnly = (b) => b.setContexts(InteractionContextType.Guild);
const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

function readWallet(guildId, userId) {
  return getStore().get(`${guildId}:${userId}`, { balance: 0, lastDaily: null });
}
function writeWallet(guildId, userId, wallet) {
  getStore().set(`${guildId}:${userId}`, wallet);
}

module.exports.commands = [
  {
    data: command('balance', 'Check a balance', [opt.user('member', 'Whose balance (default: you)', { required: false })], guildOnly),
    async execute(i) {
      const user = i.options.getUser('member') || i.user;
      const w = readWallet(i.guildId, user.id);
      return i.reply(`${user}: **${economy.formatCurrency(w.balance)}**`);
    },
  },
  {
    data: command('daily', 'Claim your daily reward', [], guildOnly),
    async execute(i) {
      const w = readWallet(i.guildId, i.user.id);
      const result = economy.dailyReward(w.lastDaily, Date.now() / 1000);
      if (!result.ready) return i.reply(ephemeral(`You already claimed today. Try again in ${duration.formatDuration(result.retryAfter)}.`));
      const balance = w.balance + result.amount;
      writeWallet(i.guildId, i.user.id, { balance, lastDaily: Date.now() / 1000 });
      return i.reply(`You claimed **${economy.formatCurrency(result.amount)}**! New balance: ${economy.formatCurrency(balance)}`);
    },
  },
  {
    data: command('pay', 'Pay another member', [opt.user('member', 'Who to pay'), opt.integer('amount', 'How much', { min: 1, max: 1_000_000 })], guildOnly),
    async execute(i) {
      const member = i.options.getUser('member');
      const amount = i.options.getInteger('amount');
      if (member.id === i.user.id) return i.reply(ephemeral("You can't pay yourself."));
      if (member.bot) return i.reply(ephemeral("Bots don't need money."));
      const sender = readWallet(i.guildId, i.user.id);
      if (!economy.canAfford(sender.balance, amount)) return i.reply(ephemeral(`You only have ${economy.formatCurrency(sender.balance)}.`));
      const receiver = readWallet(i.guildId, member.id);
      let newSender;
      let newReceiver;
      try {
        [newSender, newReceiver] = economy.applyTransfer(sender.balance, receiver.balance, amount);
      } catch {
        return i.reply(ephemeral(`You only have ${economy.formatCurrency(sender.balance)}.`));
      }
      writeWallet(i.guildId, i.user.id, { ...sender, balance: newSender });
      writeWallet(i.guildId, member.id, { ...receiver, balance: newReceiver });
      return i.reply(`${i.user} paid ${member} **${economy.formatCurrency(amount)}**.`);
    },
  },
  {
    data: command('richest', 'Top 10 balances in this server', [], guildOnly),
    async execute(i) {
      const prefix = `${i.guildId}:`;
      const rows = getStore().entries().filter(([k]) => k.startsWith(prefix)).map(([k, w]) => [k.slice(prefix.length), w.balance]);
      if (!rows.length) return i.reply(ephemeral('Nobody has any coins yet. Try `/daily`.'));
      const entries = leaderboard.rank(rows, 10);
      return i.reply({ embeds: [embed('Richest members', entries.map((e) => `${leaderboard.medal(e.rank)} <@${e.id}>: ${economy.formatCurrency(e.score)}`).join('\n'))] });
    },
  },
];
