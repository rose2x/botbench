'use strict';
// Polls with buttons, reminders, and a search over the free-API directory.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { duration, poll, textfmt } = require('botbench-libs');
const directory = require('../utils/directory');
const { embed, opt, command, clip } = require('../utils/discordHelpers');

function pollEmbed(question, options, votes) {
  const counts = poll.tally(Object.fromEntries(votes), options.length);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const lines = options.map((o, k) => `**${o}**\n${textfmt.progressBar(counts[k] / total, 10)} ${counts[k]} vote${counts[k] === 1 ? '' : 's'}`);
  return embed(question, lines.join('\n\n'), { footer: 'One vote each. Click another option to change yours.' });
}

module.exports.commands = [
  {
    data: command('poll', 'Start a poll with buttons (2 to 5 options)', [
      opt.string('question', 'What are you asking?', { min: 3, max: 200 }),
      opt.string('option1', 'First option', { max: 80 }), opt.string('option2', 'Second option', { max: 80 }),
      opt.string('option3', 'Third option', { required: false, max: 80 }), opt.string('option4', 'Fourth option', { required: false, max: 80 }), opt.string('option5', 'Fifth option', { required: false, max: 80 }),
    ]),
    async execute(i) {
      const question = i.options.getString('question');
      const options = [1, 2, 3, 4, 5].map((n) => i.options.getString(`option${n}`)).filter(Boolean);
      const votes = new Map(); // user id -> option index
      const row = new ActionRowBuilder().addComponents(options.map((o, k) => new ButtonBuilder().setCustomId(`p${k}`).setLabel(clip(o, 60)).setStyle(ButtonStyle.Primary)));
      const msg = await i.reply({ embeds: [pollEmbed(question, options, votes)], components: [row], fetchReply: true });
      const collector = msg.createMessageComponentCollector({ time: 3_600_000 });
      collector.on('collect', async (b) => {
        votes.set(b.user.id, Number(b.customId.slice(1)));
        await b.update({ embeds: [pollEmbed(question, options, votes)] });
      });
      collector.on('end', () => i.editReply({ components: [] }).catch(() => {}));
    },
  },
  {
    data: command('remind', 'Remind you later (lost if the bot restarts)', [
      opt.string('when', 'How long from now, e.g. "20m", "1h30m", "2 days" (max 30 days)', { max: 30 }),
      opt.string('text', 'What to remind you about', { max: 300 }),
    ]),
    cooldown: 20,
    async execute(i) {
      const when = i.options.getString('when');
      let seconds;
      try {
        seconds = duration.parseDuration(when);
      } catch {
        return i.reply({ content: `Couldn't read "${when}". Try something like \`20m\`, \`1h30m\`, or \`2 days\`.`, flags: 64 });
      }
      if (seconds < 1 || seconds > 30 * 86400) return i.reply({ content: 'Pick something between 1 second and 30 days.', flags: 64 });
      const text = i.options.getString('text');
      await i.reply({ content: `OK, I'll remind you in ${duration.formatDuration(seconds)}.`, flags: 64 });
      const { channelId, user, client } = i;
      setTimeout(async () => {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel?.isSendable()) channel.send({ content: `<@${user.id}> reminder: ${text}`, allowedMentions: { users: [user.id] } }).catch(() => {});
      }, seconds * 1000).unref();
      return undefined;
    },
  },
  {
    data: command('apisearch', 'Search the built-in directory of free APIs', [opt.string('query', 'For example: weather, anime, crypto', { min: 2, max: 60 }), opt.boolean('no_key', 'Only APIs that need no key')]),
    async execute(i) {
      const query = i.options.getString('query');
      const hits = directory.search(query, { onlyNoKey: !!i.options.getBoolean('no_key'), limit: 8 });
      if (!hits.length) return i.reply({ content: 'No APIs matched. Try one shorter word.', flags: 64 });
      return i.reply({ embeds: [embed(`APIs matching “${query}”`, hits.map((a) => `**[${a.name}](${a.url})** (${a.type}, key: ${a.key})\n${clip(a.description, 110)}`).join('\n\n'))] });
    },
  },
];
