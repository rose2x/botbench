// Slash commands on Cloudflare Workers: no server to run, no always-on connection.
// Uses the botbench ES module for signature checking, the joke API and embeds.
//
//   1. npm i -g wrangler        (or use npx wrangler)
//   2. wrangler secret put DISCORD_PUBLIC_KEY      (Developer Portal, General Information)
//   3. wrangler deploy
//   4. Paste the worker URL into "Interactions Endpoint URL" in the Developer Portal.
//   5. Register the commands once (see js-toolkit/examples/registerHttpCommands.js) for: ping, joke, invite
//
// Discord gives you 3 seconds to answer. These commands answer fast. For slower work, reply with
// type 5 ("thinking...") and finish with a followup request.
import botbench from '../dist/botbench.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const say = (content, extra = {}) => json({ type: 4, data: { content, ...extra } });

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });

    const body = await request.text(); // the RAW body: the signature covers exactly these bytes
    const ok = await botbench.discord.verifySignature(
      env.DISCORD_PUBLIC_KEY,
      request.headers.get('x-signature-ed25519') || '',
      request.headers.get('x-signature-timestamp') || '',
      body,
    );
    if (!ok) return new Response('invalid request signature', { status: 401 });

    const interaction = JSON.parse(body);
    if (interaction.type === 1) return json({ type: 1 }); // PING: Discord checks your URL with this

    if (interaction.type === 2) {
      switch (interaction.data.name) {
        case 'ping':
          return say('Pong from a Cloudflare Worker!');
        case 'joke':
          try {
            return say(await botbench.fun.joke('Programming'));
          } catch {
            return say('The joke service is down. Try again later.', { flags: 64 });
          }
        case 'invite':
          return say(botbench.discord.inviteUrl(env.CLIENT_ID || interaction.application_id, { permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES'] }), { flags: 64 });
        default:
          return say('Unknown command', { flags: 64 });
      }
    }
    return say('Unsupported interaction', { flags: 64 });
  },
};
