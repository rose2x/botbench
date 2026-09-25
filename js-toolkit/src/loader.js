'use strict';
// Loads every file in src/commands. A command file exports:
//   {
//     commands?:   [{ data: SlashCommandBuilder, execute(interaction), cooldown?: seconds }],
//     events?:     [{ name, execute(...args) }],
//     components?: [{ id, execute(interaction) }]   // buttons, menus and modals. Matches customId === id or customId starting with "id:"
//   }
const fs = require('node:fs');
const path = require('node:path');

function loadModules(dir = path.join(__dirname, 'commands')) {
  const commands = new Map();
  const events = [];
  const components = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort()) {
    const mod = require(path.join(dir, file));
    for (const c of mod.commands || []) {
      if (!c.data || typeof c.execute !== 'function') throw new Error(`${file}: every command needs data and execute`);
      if (commands.has(c.data.name)) throw new Error(`${file}: duplicate command name "${c.data.name}"`);
      commands.set(c.data.name, c);
    }
    events.push(...(mod.events || []));
    components.push(...(mod.components || []));
  }
  return { commands, events, components };
}

/** Find the component handler for a custom id like "roles:toggle:123" (handler id "roles:toggle"). */
function findComponent(components, customId) {
  return components.find((c) => customId === c.id || customId.startsWith(`${c.id}:`));
}

module.exports = { loadModules, findComponent };
