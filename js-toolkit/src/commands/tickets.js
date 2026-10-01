'use strict';
// Support tickets using private threads.
//   /ticketpanel   (admins) posts a message with an "Open a ticket" button in the current channel
//   button         creates a private thread for the user (one open ticket per user)
//   /ticketclose   (or the Close button) locks and archives the thread
// The buttons are persistent: they work after the bot restarts, because they are matched by custom id.
// The bot needs: Create Private Threads, Send Messages in Threads and Manage Threads in the panel channel.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { embed, opt, command } = require('../utils/discordHelpers');

const OPEN_ID = 'ticket:open';
const CLOSE_ID = 'ticket:close';
const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/** Thread names end in the opener's id, which is how we find and check tickets. */
function ticketName(user) {
  const safe = user.username.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'user';
  return `ticket-${safe}-${user.id}`;
}
function ownerId(threadName) {
  const m = threadName.match(/^ticket-.*-(\d{15,25})$/);
  return m ? m[1] : null;
}

async function closeTicket(i) {
  const thread = i.channel;
  const owner = thread?.isThread?.() ? ownerId(thread.name) : null;
  if (!owner) return i.reply(ephemeral("This isn't a ticket thread."));
  if (i.user.id !== owner && !i.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) return i.reply(ephemeral('Only the ticket owner or a moderator can close it.'));
  await i.reply('Closing this ticket. Thanks!');
  await thread.setLocked(true, `Closed by ${i.user.tag}`);
  await thread.setArchived(true, `Closed by ${i.user.tag}`);
  return undefined;
}

const closeRow = () => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(CLOSE_ID).setLabel('Close ticket').setStyle(ButtonStyle.Danger));

module.exports.commands = [
  {
    data: command('ticketpanel', 'Post the ticket button in this channel', [
      opt.string('title', 'Panel title', { required: false, max: 100 }),
      opt.string('text', 'Text under the title', { required: false, max: 1000 }),
    ], (b) => b.setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)),
    async execute(i) {
      const need = [PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ManageThreads];
      if (!need.every((p) => i.appPermissions?.has(p))) return i.reply(ephemeral("I need the Create Private Threads, Send Messages in Threads and Manage Threads permissions here."));
      if (i.channel?.type !== ChannelType.GuildText) return i.reply(ephemeral('Use this in a text channel.'));
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(OPEN_ID).setLabel('Open a ticket').setStyle(ButtonStyle.Primary));
      await i.channel.send({ embeds: [embed(i.options.getString('title') || 'Support', i.options.getString('text') || 'Need help? Press the button to open a private ticket.')], components: [row] });
      return i.reply(ephemeral('Panel posted.'));
    },
  },
  { data: command('ticketclose', "Close the ticket you're in", [], (b) => b.setContexts(InteractionContextType.Guild)), execute: closeTicket },
];

module.exports.components = [
  {
    id: OPEN_ID,
    async execute(i) {
      const channel = i.channel;
      if (channel?.type !== ChannelType.GuildText) return i.reply(ephemeral('Tickets can only be opened from a text channel.'));
      const existing = channel.threads.cache.find((t) => ownerId(t.name) === i.user.id && !t.archived);
      if (existing) return i.reply(ephemeral(`You already have an open ticket: ${existing}`));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const thread = await channel.threads.create({ name: ticketName(i.user), type: ChannelType.PrivateThread, invitable: false, reason: `Ticket for ${i.user.tag}` });
      await thread.members.add(i.user.id);
      await thread.send({ content: `${i.user} thanks for reaching out. Describe your problem and a moderator will help you soon. Press the button when it's solved.`, components: [closeRow()], allowedMentions: { users: [i.user.id] } });
      return i.editReply(`Your ticket is ready: ${thread}`);
    },
  },
  { id: CLOSE_ID, execute: closeTicket },
];

module.exports.ticketName = ticketName;
module.exports.ownerId = ownerId;
