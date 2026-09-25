// A tiny bot with no discord library: it answers "!ping" using the Gateway and REST clients.
// Needs the Message Content intent turned on in the Developer Portal.
//   DISCORD_TOKEN=... node examples/rawGatewayBot.js
const { Gateway } = require('../src/utils/gateway');
const { DiscordREST } = require('../src/utils/discordRest');
const { intentsToBits } = require('../src/utils/discordUtils');

const token = process.env.DISCORD_TOKEN;
const rest = new DiscordREST(token);
const gw = new Gateway(token, intentsToBits(['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT']));

gw.on('READY', (d) => console.log('Ready as', d.user.username));
gw.on('MESSAGE_CREATE', async (d) => {
  if (d.author.bot) return;
  if (d.content.trim() === '!ping') await rest.sendMessage(d.channel_id, 'Pong!', { replyTo: d.id });
});

gw.run().catch((err) => { console.error(err.message); process.exit(1); });
