'use strict';
// Giveaways: a stateless "Enter" button, an automatic end, and fair unique winners.
//
//   /giveaway start <when> <winners> <prize>   posts a giveaway, ends itself automatically
//   /giveaway end <message_id>                 end one early
//
// Giveaway state lives in memory for the process (like /remind): simple, and it's fine for it to be
// lost on a restart, but the "Enter" button says so clearly if that happens rather than failing silently.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { duration, giveaway: giveawayLib } = require('botbench-libs');
const { embed } = require('../utils/discordHelpers');

const ENTER_ID = 'giveaway:enter';
const active = new Map();     // message id -> Giveaway
const endsAt = new Map();     // message id -> epoch seconds
const timers = new Set();

function giveawayEmbed(g, ends, ended = false, winners = null) {
  if (ended) {
    const text = winners && winners.length ? `Winner: ${winners.map((w) => `<@${w}>`).join(', ')}` : 'Nobody entered.';
    return embed(`🎉 ${g.prize}`, `${text}\n\n${g.entrants.length} entered.`, { color: 0x57F287 });
  }
  const when = ends ? `<t:${Math.floor(ends)}:R>` : 'soon';
  return embed(`🎉 ${g.prize}`, `Ends ${when} • ${g.winners} winner${g.winners !== 1 ? 's' : ''}\n${g.entrants.length} entered so far.`);
}

async function finish(message) {
  const g = active.get(message.id);
  active.delete(message.id);
  endsAt.delete(message.id);
  if (!g || g.ended) return;
  const winners = g.pickWinners();
  try {
    await message.edit({ embeds: [giveawayEmbed(g, null, true, winners)], components: [] });
    if (winners.length) {
      await message.reply({ content: `Congratulations ${winners.map((w) => `<@${w}>`).join(', ')}! You won **${g.prize}**.`, allowedMentions: { users: winners } });
    } else {
      await message.reply("Nobody entered, so there's no winner this time.");
    }
  } catch { /* the message may have been deleted */ }
}

module.exports.commands = [
  {
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Run giveaways')
      .setContexts(InteractionContextType.Guild)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) => sub.setName('start').setDescription('Start a giveaway')
        .addStringOption((o) => o.setName('when').setDescription('How long it runs, e.g. "10m", "1h", "2 days" (max 30 days)').setMaxLength(30).setRequired(true))
        .addStringOption((o) => o.setName('prize').setDescription("What's being given away").setMaxLength(200).setRequired(true))
        .addIntegerOption((o) => o.setName('winners').setDescription('How many winners (default 1)').setMinValue(1).setMaxValue(20)))
      .addSubcommand((sub) => sub.setName('end').setDescription('End a giveaway early and pick winners now')
        .addStringOption((o) => o.setName('message_id').setDescription("The giveaway message's id").setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      if (sub === 'start') {
        const when = i.options.getString('when');
        let seconds;
        try {
          seconds = duration.parseDuration(when);
        } catch {
          return i.reply({ content: `Couldn't read "${when}". Try something like \`10m\`, \`1h\`, or \`2 days\`.`, flags: MessageFlags.Ephemeral });
        }
        if (seconds < 10 || seconds > 30 * 86400) return i.reply({ content: 'Pick something between 10 seconds and 30 days.', flags: MessageFlags.Ephemeral });

        const g = new giveawayLib.Giveaway(i.options.getInteger('winners') || 1, i.options.getString('prize'));
        const ends = Date.now() / 1000 + seconds;
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(ENTER_ID).setLabel('🎉 Enter').setStyle(ButtonStyle.Primary));
        await i.reply({ embeds: [giveawayEmbed(g, ends)], components: [row] });
        const msg = await i.fetchReply();
        active.set(msg.id, g);
        endsAt.set(msg.id, ends);
        const t = setTimeout(() => finish(msg), seconds * 1000);
        t.unref();
        timers.add(t);
        return undefined;
      }
      // sub === 'end'
      const id = i.options.getString('message_id');
      if (!/^\d+$/.test(id) || !active.has(id)) {
        return i.reply({ content: "That's not a giveaway I know about (it may have already ended, or the bot restarted).", flags: MessageFlags.Ephemeral });
      }
      let msg;
      try {
        msg = await i.channel.messages.fetch(id);
      } catch {
        return i.reply({ content: "Couldn't find that message.", flags: MessageFlags.Ephemeral });
      }
      await i.reply({ content: 'Ending it now.', flags: MessageFlags.Ephemeral });
      await finish(msg);
      return undefined;
    },
  },
];

module.exports.components = [
  {
    id: ENTER_ID,
    async execute(i) {
      const g = active.get(i.message.id);
      if (!g) {
        return i.reply({ content: "This giveaway's data was lost, probably because the bot restarted. Ask a moderator to start a new one.", flags: MessageFlags.Ephemeral });
      }
      if (g.enter(i.user.id)) {
        await i.reply({ content: "You're entered! Good luck.", flags: MessageFlags.Ephemeral });
        await i.message.edit({ embeds: [giveawayEmbed(g, endsAt.get(i.message.id))] });
        return undefined;
      }
      return i.reply({ content: "You're already entered.", flags: MessageFlags.Ephemeral });
    },
  },
];

// exported for tests
module.exports._internal = { active, endsAt, finish, giveawayEmbed };
