'use strict';
// Slash commands over HTTP: no gateway, no always-on connection. Good for serverless.
// A dependency-free server built on node:http.
//
// Set "Interactions Endpoint URL" in the Developer Portal to https://your.host/interactions.
// Discord sends a signed POST for every command and checks that you reject bad signatures.
//
//   const server = createInteractionServer({
//     publicKey: process.env.DISCORD_PUBLIC_KEY,
//     commands: { ping: () => message('Pong!') },
//   });
//   server.listen(8080);

const http = require('node:http');
const { verifySignature } = require('./signature');

const TYPES = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3, AUTOCOMPLETE: 4, MODAL_SUBMIT: 5 };
const REPLY = { PONG: 1, CHANNEL_MESSAGE: 4, DEFERRED_MESSAGE: 5, DEFERRED_UPDATE: 6, UPDATE_MESSAGE: 7, AUTOCOMPLETE_RESULT: 8, MODAL: 9 };
const EPHEMERAL = 1 << 6;

/** Build a reply payload for a command handler to return. */
function message(content, { ephemeral = false, ...extra } = {}) {
  const data = { content, ...extra };
  if (ephemeral) data.flags = EPHEMERAL;
  return { type: REPLY.CHANNEL_MESSAGE, data };
}

function createInteractionServer({ publicKey, commands = {}, components = {}, path = '/interactions', maxBodyBytes = 1_000_000 } = {}) {
  return http.createServer(async (req, res) => {
    const send = (status, payload) => {
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      res.writeHead(status, { 'Content-Type': typeof payload === 'string' ? 'text/plain' : 'application/json' });
      res.end(body);
    };
    if (req.method !== 'POST' || req.url.split('?')[0] !== path) return send(404, 'Not found');

    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > maxBodyBytes) return send(413, 'Body too large');
      chunks.push(c);
    }
    const raw = Buffer.concat(chunks);
    const ok = await verifySignature(publicKey, String(req.headers['x-signature-ed25519'] || ''), String(req.headers['x-signature-timestamp'] || ''), raw);
    if (!ok) return send(401, 'invalid request signature');

    let data;
    try { data = JSON.parse(raw.toString('utf8')); } catch { return send(400, 'Bad JSON'); }
    try {
      if (data.type === TYPES.PING) return send(200, { type: REPLY.PONG });
      if (data.type === TYPES.APPLICATION_COMMAND && commands[data.data.name]) return send(200, await commands[data.data.name](data));
      if (data.type === TYPES.MESSAGE_COMPONENT && components[data.data.custom_id]) return send(200, await components[data.data.custom_id](data));
      return send(200, message('Unknown command', { ephemeral: true }));
    } catch (err) {
      console.error('[interactions] handler failed:', err);
      return send(200, message('Something broke on my side.', { ephemeral: true }));
    }
  });
}

module.exports = { createInteractionServer, message, TYPES, REPLY, EPHEMERAL };
