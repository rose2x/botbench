'use strict';
// Bot Bench starter bot.
//
//   npm install
//   cp .env.example .env      # then fill in DISCORD_TOKEN, CLIENT_ID and GUILD_ID
//   npm start
//
// Every file in src/commands is loaded automatically. Add a new one and restart.

const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const { loadModules, findComponent } = require('./loader');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Set DISCORD_TOKEN in your .env file first.');
  process.exit(1);
}

const client = new Client({
  // Slash commands need only Guilds. GuildMessages is for the XP feature (it never reads message text).
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  allowedMentions: { parse: [], repliedUser: false }, // the bot pings nobody unless a command opts in
});

const { commands, events, components } = loadModules();
for (const ev of events) client.on(ev.name, (...args) => Promise.resolve(ev.execute(...args)).catch((e) => console.error(`Event ${ev.name} failed:`, e)));

const cooldowns = new Map();
async function say(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag} in ${c.guilds.cache.size} servers, with ${commands.size} commands`);
  if (process.env.AUTO_DEPLOY === '0') return;
  const body = [...commands.values()].map((cmd) => cmd.data.toJSON());
  try {
    if (process.env.GUILD_ID) { // instant, for development
      await c.application.commands.set(body, process.env.GUILD_ID);
      console.log(`Synced ${body.length} commands to test server ${process.env.GUILD_ID}`);
    } else { // global: can take a while to show up
      await c.application.commands.set(body);
      console.log(`Synced ${body.length} global commands`);
    }
  } catch (err) {
    console.error('Could not sync commands:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Buttons, select menus and modals from persistent panels (tickets, roles) are matched by custom id,
  // so they keep working after a restart. Short-lived ones (trivia, polls) use collectors instead.
  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    const handler = findComponent(components, interaction.customId);
    if (!handler) return undefined; // not ours: a collector may be handling it
    try {
      await handler.execute(interaction);
    } catch (err) {
      console.error(`Component ${interaction.customId} failed:`, err);
      await say(interaction, err.code === 50013 ? "I'm missing permissions for that." : 'Something broke on my side. It has been logged.').catch(() => {});
    }
    return undefined;
  }
  if (!interaction.isChatInputCommand()) return undefined;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return undefined;
  if (cmd.cooldown) {
    const key = `${cmd.data.name}:${interaction.user.id}`;
    const left = (cooldowns.get(key) || 0) - Date.now();
    if (left > 0) return say(interaction, `Slow down. Try again in ${Math.ceil(left / 1000)}s.`);
    cooldowns.set(key, Date.now() + cmd.cooldown * 1000);
  }
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(`Command ${interaction.commandName} failed:`, err);
    const text = err.code === 50013 ? "I'm missing permissions for that." : 'Something broke on my side. It has been logged.';
    await say(interaction, text).catch(() => {});
  }
  return undefined;
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { console.log(`\n${sig}: shutting down`); client.destroy(); process.exit(0); });

client.login(token);
