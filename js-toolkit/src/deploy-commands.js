'use strict';
// Register slash commands without starting the bot (useful in CI):
//   npm run deploy
// Uses GUILD_ID for instant test-server commands, or registers globally if it is empty.
const { REST, Routes } = require('discord.js');
const { loadModules } = require('./loader');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Set DISCORD_TOKEN and CLIENT_ID in your .env file first.');
  process.exit(1);
}

const body = [...loadModules().commands.values()].map((c) => c.data.toJSON());
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
  const done = await rest.put(route, { body });
  console.log(`Registered ${done.length} commands ${GUILD_ID ? `to server ${GUILD_ID}` : 'globally'}.`);
})().catch((err) => { console.error(err); process.exit(1); });
