'use strict';
// A small Discord Gateway client: connect, heartbeat, identify, resume, reconnect.
// Uses the standard WebSocket API, so it runs on Node 22+ (global WebSocket), Bun, Deno and
// browsers. On older Node it falls back to the `ws` package.
//
// For learning and lightweight bots. For big bots use discord.js (sharding, caching, voice).
//
//   const gw = new Gateway(token, (1 << 0) | (1 << 9));
//   gw.on('READY', (d) => console.log('Ready as', d.user.username));
//   gw.on('MESSAGE_CREATE', (d) => console.log(d.author.username, d.content));
//   await gw.run();   // resolves only after stop(); rejects on a fatal close code

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
// Closing with one of these codes means "don't retry, fix your config".
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GatewayError extends Error {
  constructor(code) {
    super(`Gateway closed with fatal code ${code}. See the close-code table in the Reference.`);
    this.name = 'GatewayError';
    this.code = code;
  }
}

function pickWebSocket(custom) {
  if (custom) return custom;
  if (typeof globalThis.WebSocket === 'function') return globalThis.WebSocket;
  try { return require('ws'); } catch { throw new Error('No WebSocket available. Use Node 22+, or run: npm i ws'); }
}

class Gateway {
  constructor(token, intents, { url = GATEWAY_URL, properties, presence, WebSocket } = {}) {
    this.token = token;
    this.intents = intents;
    this.url = url;
    this.properties = properties || { os: 'linux', browser: 'botbench', device: 'botbench' };
    this.presence = presence;
    this.WS = pickWebSocket(WebSocket);
    this.sessionId = null;
    this.resumeUrl = null;
    this.seq = null;
    this.handlers = new Map();
    this.stopped = false;
    this.sock = null;
    this.gotReady = false;
  }

  /** Register a handler for a dispatch event, like MESSAGE_CREATE. "*" gets { t, d } for every event. */
  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
    return this;
  }

  async #dispatch(name, data) {
    const call = async (fn, payload) => {
      try { await fn(payload); } catch (err) { console.error(`[gateway] handler for ${name} failed:`, err); }
    };
    for (const fn of this.handlers.get(name) || []) await call(fn, data);
    for (const fn of this.handlers.get('*') || []) await call(fn, { t: name, d: data });
  }

  send(op, d) { this.sock.send(JSON.stringify({ op, d })); }
  stop() { this.stopped = true; try { this.sock?.close(1000); } catch { /* already closed */ } }

  async run() {
    let backoff = 1000;
    while (!this.stopped) {
      const { code, gotReady } = await this.#connectOnce();
      if (this.stopped) return;
      if (gotReady) backoff = 1000;
      if (FATAL_CLOSE_CODES.has(code)) throw new GatewayError(code);
      if (code === 4007 || code === 4009) { this.sessionId = null; this.seq = null; this.resumeUrl = null; }
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }

  #connectOnce() {
    return new Promise((resolve) => {
      let beat = null;
      let beatFirst = null;
      let acked = true;
      let done = false;
      this.gotReady = false;
      const sock = new this.WS(this.resumeUrl || this.url);
      this.sock = sock;

      const finish = (code) => {
        if (done) return;
        done = true;
        clearInterval(beat);
        clearTimeout(beatFirst);
        resolve({ code, gotReady: this.gotReady });
      };
      const startHeartbeat = (interval) => {
        const tick = () => {
          if (!acked) { try { sock.close(4000); } catch { /* ignore */ } return; } // zombie connection
          acked = false;
          this.send(1, this.seq);
        };
        beatFirst = setTimeout(() => { tick(); beat = setInterval(tick, interval); }, interval * Math.random());
      };

      sock.onmessage = (ev) => {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
        if (msg.s !== null && msg.s !== undefined) this.seq = msg.s;
        switch (msg.op) {
          case 10: // Hello
            startHeartbeat(msg.d.heartbeat_interval);
            if (this.sessionId && this.seq !== null) {
              this.send(6, { token: this.token, session_id: this.sessionId, seq: this.seq });
            } else {
              const ident = { token: this.token, intents: this.intents, properties: this.properties };
              if (this.presence) ident.presence = this.presence;
              this.send(2, ident);
            }
            break;
          case 0: {
            if (msg.t === 'READY') {
              this.sessionId = msg.d.session_id;
              this.resumeUrl = `${msg.d.resume_gateway_url}/?v=10&encoding=json`;
              this.gotReady = true;
            } else if (msg.t === 'RESUMED') this.gotReady = true;
            this.#dispatch(msg.t, msg.d);
            break;
          }
          case 1: this.send(1, this.seq); break;                       // Discord wants a heartbeat now
          case 7: sock.close(4000); break;                             // Reconnect
          case 9:                                                      // Invalid session
            if (!msg.d) { this.sessionId = null; this.seq = null; }
            setTimeout(() => sock.close(4000), 1000 + Math.random() * 4000);
            break;
          case 11: acked = true; break;                                // Heartbeat ACK
          default: break;
        }
      };
      sock.onclose = (ev) => finish(ev.code);
      sock.onerror = () => { /* a close event always follows */ };
    });
  }
}

module.exports = { Gateway, GatewayError, FATAL_CLOSE_CODES, GATEWAY_URL };
