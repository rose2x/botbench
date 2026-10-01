// Slash commands over HTTP. No gateway, no library.
//   DISCORD_PUBLIC_KEY=... node examples/httpServer.js
// Point the Interactions Endpoint URL (Developer Portal) at your public https address + /interactions.
// Register the commands once with examples/registerHttpCommands.js.
const { createInteractionServer, message } = require('../src/utils/httpInteractions');

createInteractionServer({
  publicKey: process.env.DISCORD_PUBLIC_KEY,
  commands: {
    ping: () => message('Pong from HTTP!'),
    roll: () => message(`You rolled ${1 + Math.floor(Math.random() * 6)}`),
  },
}).listen(8080, () => console.log('Listening on http://localhost:8080/interactions'));
