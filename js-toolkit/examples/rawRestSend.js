// Send a message and add a reaction using only the REST client.
//   DISCORD_TOKEN=... node examples/rawRestSend.js CHANNEL_ID
const { DiscordREST, DiscordAPIError } = require('../src/utils/discordRest');

(async () => {
  const rest = new DiscordREST(process.env.DISCORD_TOKEN);
  try {
    const me = await rest.getMe();
    console.log('Logged in as', me.username);
    const msg = await rest.sendMessage(process.argv[2], 'Hello from the raw REST client');
    await rest.addReaction(process.argv[2], msg.id, '👋');
    console.log('Sent message', msg.id);
  } catch (err) {
    if (err instanceof DiscordAPIError) console.log('Discord said:', err.message); // 50013 = Missing Permissions, 50001 = Missing Access
    else throw err;
  }
})();
