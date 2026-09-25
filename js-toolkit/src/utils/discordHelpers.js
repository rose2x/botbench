'use strict';
// Helpers shared by the command files (discord.js specific).
const { EmbedBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ApiError, LookupError } = require('./apiClient');
const { clip } = require('./discordUtils');

const BRAND = 0x5865F2;

function embed(title, description = '', { url, image, thumbnail, color = BRAND, footer } = {}) {
  const e = new EmbedBuilder().setColor(color).setTitle(clip(String(title), 256));
  if (description) e.setDescription(clip(String(description), 4000));
  if (url) e.setURL(url);
  if (image) e.setImage(image);
  if (thumbnail) e.setThumbnail(thumbnail);
  if (footer) e.setFooter({ text: clip(String(footer), 2000) });
  return e;
}

function friendlyError(err) {
  if (err instanceof LookupError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 404) return 'Nothing found for that.';
    if (err.status === 429) return 'That service is busy right now. Try again in a moment.';
    return 'That service is having trouble. Try again later.';
  }
  return 'Something went wrong on my side.';
}

/** Defer, run an API call, then reply with an embed or a string. Errors become friendly messages. */
async function respondApi(interaction, make, { ephemeral = false } = {}) {
  await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
  let result;
  try {
    result = await make();
  } catch (err) {
    if (err instanceof ApiError || err instanceof LookupError) {
      await interaction.editReply(friendlyError(err));
      return;
    }
    throw err; // real bugs go to the central error handler in index.js
  }
  if (typeof result === 'string') await interaction.editReply(result.slice(0, 2000));
  else await interaction.editReply({ embeds: [result] });
}

// Option builders keep command files short. Required options must come before optional ones.
const opt = {
  string: (name, description, { required = true, min, max, choices } = {}) => (b) => b.addStringOption((o) => {
    o.setName(name).setDescription(description).setRequired(required);
    if (min) o.setMinLength(min);
    if (max) o.setMaxLength(max);
    if (choices) o.addChoices(...choices.map((c) => ({ name: c, value: c })));
    return o;
  }),
  integer: (name, description, { required = true, min, max } = {}) => (b) => b.addIntegerOption((o) => {
    o.setName(name).setDescription(description).setRequired(required);
    if (min !== undefined) o.setMinValue(min);
    if (max !== undefined) o.setMaxValue(max);
    return o;
  }),
  number: (name, description, { required = true, min, max } = {}) => (b) => b.addNumberOption((o) => {
    o.setName(name).setDescription(description).setRequired(required);
    if (min !== undefined) o.setMinValue(min);
    if (max !== undefined) o.setMaxValue(max);
    return o;
  }),
  user: (name, description, { required = true } = {}) => (b) => b.addUserOption((o) => o.setName(name).setDescription(description).setRequired(required)),
  boolean: (name, description, { required = false } = {}) => (b) => b.addBooleanOption((o) => o.setName(name).setDescription(description).setRequired(required)),
};

/** Build a slash command: command('ping', 'Check latency', [opt.string(...)], (b) => b.setContexts(...)) */
function command(name, description, options = [], configure) {
  const b = new SlashCommandBuilder().setName(name).setDescription(description);
  for (const o of options) o(b);
  if (configure) configure(b);
  return b;
}

module.exports = { embed, friendlyError, respondApi, opt, command, clip, BRAND };
