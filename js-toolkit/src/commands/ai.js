'use strict';
// /ask: ask Claude a question. Only registered if ANTHROPIC_API_KEY is set.
// Protected by a per-user cooldown and a daily cap (AI_DAILY_LIMIT, default 20), because every call costs money.
const { MessageFlags } = require('discord.js');
const { ClaudeClient, UsageLimiter } = require('../utils/claude');
const { ApiError, LookupError } = require('../utils/apiClient');
const { opt, command, friendlyError } = require('../utils/discordHelpers');
const { chunkMessage, neutralizeMentions } = require('../utils/discordUtils');

const SYSTEM = "You are a friendly assistant inside a Discord server. Keep answers under 1500 characters. Use plain text and simple Markdown. If you don't know something, say so.";

module.exports.commands = [];

if (process.env.ANTHROPIC_API_KEY) {
  const claude = new ClaudeClient(process.env.ANTHROPIC_API_KEY);
  const limiter = new UsageLimiter(Number(process.env.AI_DAILY_LIMIT || 20));

  module.exports.commands.push({
    data: command('ask', 'Ask the AI a question', [opt.string('question', 'Your question', { min: 3, max: 500 })]),
    cooldown: 10,
    async execute(i) {
      const { allowed } = limiter.allow(i.user.id);
      if (!allowed) return i.reply({ content: "You've used all your AI questions for today. Try again tomorrow.", flags: MessageFlags.Ephemeral });
      await i.deferReply();
      const question = i.options.getString('question');
      let answer;
      try {
        answer = await claude.ask(question, { system: SYSTEM });
      } catch (err) {
        if (!(err instanceof ApiError || err instanceof LookupError)) throw err;
        limiter.refund(i.user.id);
        console.warn('Claude call failed:', err.message);
        return i.editReply(err instanceof LookupError ? friendlyError(err) : "The AI service isn't available right now.");
      }
      const header = `**${neutralizeMentions(question).slice(0, 200)}**\n\n`;
      const chunks = chunkMessage(neutralizeMentions(answer), 1900 - header.length).slice(0, 3);
      await i.editReply(header + chunks[0]);
      for (const extra of chunks.slice(1)) await i.followUp(extra);
      return undefined;
    },
  });
} else {
  console.info('ANTHROPIC_API_KEY is not set: /ask is disabled');
}
