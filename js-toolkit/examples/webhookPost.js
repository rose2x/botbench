// Post to a channel with only a webhook URL. No bot, no token.
//   WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN node examples/webhookPost.js
const { DiscordREST } = require('../src/utils/discordRest');

const [, id, token] = process.env.WEBHOOK_URL.match(/\/webhooks\/(\d+)\/([\w-]+)/);
new DiscordREST('').webhookExecute(id, token, {
  username: 'Deploy Bot',
  embeds: [{ title: 'Build passed', description: 'main @ 3f2a1c', color: 0x2ecc71 }],
}).then(() => console.log('Sent.'));
