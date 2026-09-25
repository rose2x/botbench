'use strict';
// A verification gate: a button that opens a math captcha, and gives a role on a correct answer.
//
//   /verifysetup <role>   (admins) posts a stateless "Verify" button for that role
//
// The button's custom id carries the role id, and the modal's custom id carries the captcha numbers, so
// nothing needs to be stored between steps. The whole flow works even if the bot restarts in between.
// The bot needs Manage Roles, and its own role must be above the role it hands out.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { captcha } = require('botbench-libs');
const { assignProblem } = require('./roles');
const { embed, command } = require('../utils/discordHelpers');

const BUTTON_PREFIX = 'verify:start';
const MODAL_PREFIX = 'verify:submit';

module.exports.commands = [
  {
    data: command('verifysetup', 'Post a verification button that hands out a role', [
      (b) => b.addRoleOption((o) => o.setName('role').setDescription('The role to give once someone passes the check').setRequired(true)),
    ], (b) => b.setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)),
    async execute(i) {
      if (!i.appPermissions?.has(PermissionFlagsBits.ManageRoles)) return i.reply({ content: 'I need the Manage Roles permission.', flags: MessageFlags.Ephemeral });
      const role = i.options.getRole('role');
      const problem = assignProblem(role, i.guildId, i.guild.members.me.roles.highest.position);
      if (problem) return i.reply({ content: `**${role.name}**: ${problem}`, flags: MessageFlags.Ephemeral });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:${role.id}`).setLabel('Verify').setStyle(ButtonStyle.Success));
      await i.channel.send({ embeds: [embed('Verification', `Press the button, answer one quick math question, and you'll get the **${role.name}** role.`)], components: [row] });
      return i.reply({ content: 'Panel posted.', flags: MessageFlags.Ephemeral });
    },
  },
];

module.exports.components = [
  {
    id: BUTTON_PREFIX,
    async execute(i) {
      const roleId = i.customId.split(':')[2];
      const c = captcha.generateChallenge();
      const modal = new ModalBuilder().setCustomId(`${MODAL_PREFIX}:${roleId}:${c.a}:${c.b}`).setTitle('Quick check');
      const input = new TextInputBuilder().setCustomId('answer').setLabel(c.question).setStyle(TextInputStyle.Short).setPlaceholder('Type the number').setMaxLength(10).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await i.showModal(modal);
    },
  },
  {
    id: MODAL_PREFIX,
    async execute(i) {
      const [, , roleId, aStr, bStr] = i.customId.split(':'); // MODAL_PREFIX ("verify:submit") is two segments
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);
      const userInput = i.fields.getTextInputValue('answer');
      if (!captcha.verifyAnswer(a, b, userInput)) {
        return i.reply({ content: "That's not right. Press the button again for a new question.", flags: MessageFlags.Ephemeral });
      }
      const role = i.guild.roles.cache.get(roleId);
      if (!role) return i.reply({ content: "That role doesn't exist any more. Ask a moderator to set verification up again.", flags: MessageFlags.Ephemeral });
      const problem = assignProblem(role, i.guildId, i.guild.members.me.roles.highest.position);
      if (problem) return i.reply({ content: `I can't give out that role right now: ${problem}`, flags: MessageFlags.Ephemeral });
      if (i.member.roles.cache.has(roleId)) return i.reply({ content: "You're already verified.", flags: MessageFlags.Ephemeral });
      await i.member.roles.add(roleId, 'Passed verification');
      return i.reply({ content: `Correct! You now have **${role.name}**. Welcome!`, flags: MessageFlags.Ephemeral });
    },
  },
];
