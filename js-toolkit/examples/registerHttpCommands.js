// Register slash commands with the REST client (needed for HTTP interactions).
//   DISCORD_TOKEN=... CLIENT_ID=... [GUILD_ID=...] node examples/registerHttpCommands.js
const { DiscordREST } = require('../src/utils/discordRest');

const commands = [
  { name: 'ping', description: 'Check the bot', type: 1 },
  { name: 'roll', description: 'Roll a die', type: 1 },
];

new DiscordREST(process.env.DISCORD_TOKEN)
  .registerCommands(process.env.CLIENT_ID, commands, process.env.GUILD_ID || undefined)
  .then((done) => console.log('Registered:', done.map((c) => c.name)));
