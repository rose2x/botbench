'use strict';
// Game and media lookups, plus a trivia game with buttons.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const apis = require('../utils/apis');
const { embed, opt, command, respondApi, friendlyError, clip } = require('../utils/discordHelpers');

const str = (i, n) => i.options.getString(n);
const shuffle = (a) => { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };

const answerRow = (options, correct, chosen = -1, disabled = false) => new ActionRowBuilder().addComponents(
  options.map((o, k) => {
    let style = ButtonStyle.Secondary;
    if (chosen >= 0) style = o === correct ? ButtonStyle.Success : k === chosen ? ButtonStyle.Danger : ButtonStyle.Secondary;
    return new ButtonBuilder().setCustomId(`t${k}`).setLabel(clip(o, 80)).setStyle(style).setDisabled(disabled);
  }),
);

module.exports.commands = [
  {
    data: command('trivia', 'A trivia question with buttons'),
    cooldown: 6,
    async execute(i) {
      await i.deferReply();
      let q;
      try { q = await apis.trivia(); } catch (err) { return i.editReply(friendlyError(err)); }
      const options = shuffle([...q.incorrect, q.correct]);
      const msg = await i.editReply({ embeds: [embed(clip(q.question, 250), '', { footer: `${q.category} · ${q.difficulty} · 30 seconds` })], components: [answerRow(options, q.correct)] });
      let answered = false;
      const collector = msg.createMessageComponentCollector({ time: 30_000 });
      collector.on('collect', async (b) => {
        if (answered) return b.reply({ content: 'Someone already answered this one.', flags: MessageFlags.Ephemeral });
        answered = true;
        const idx = Number(b.customId.slice(1));
        await b.update({ components: [answerRow(options, q.correct, idx, true)] });
        await b.followUp(`${b.user} ${options[idx] === q.correct ? 'got it right!' : `picked wrong. The answer was **${q.correct}**.`}`);
        collector.stop('answered');
        return undefined;
      });
      collector.on('end', async (_, reason) => {
        if (reason === 'time' && !answered) await i.editReply({ content: `Time's up. The answer was **${q.correct}**.`, components: [answerRow(options, q.correct, -1, true)] }).catch(() => {});
      });
      return undefined;
    },
  },
  {
    data: command('pokemon', 'Pokémon info', [opt.string('name', 'Name or number', { max: 40 })]),
    execute: (i) => respondApi(i, async () => {
      const p = await apis.pokemon(str(i, 'name'));
      return embed(`#${p.id} ${p.name}`, '', { thumbnail: p.sprite || undefined }).addFields(
        { name: 'Type', value: p.types.join(', '), inline: true },
        { name: 'Height / weight', value: `${p.heightM} m / ${p.weightKg} kg`, inline: true },
        { name: 'Abilities', value: p.abilities.join(', ') },
        { name: 'Base stats', value: Object.entries(p.stats).map(([k, v]) => `${k} ${v}`).join(' · ') },
      );
    }),
  },
  {
    data: command('card', 'Look up a Magic: The Gathering card', [opt.string('name', 'Card name (fuzzy)', { min: 2, max: 80 })]),
    execute: (i) => respondApi(i, async () => {
      const c = await apis.scryfallCard(str(i, 'name'));
      return embed(`${c.name}  ${c.mana}`, `*${c.type}*\n\n${clip(c.text, 1500)}`, { url: c.url, image: c.image || undefined, footer: c.set });
    }),
  },
  {
    data: command('spell', 'Look up a D&D 5e spell', [opt.string('name', 'Spell name, for example fireball', { min: 2, max: 60 })]),
    execute: (i) => respondApi(i, async () => {
      const s = await apis.dndSpell(str(i, 'name'));
      return embed(s.name, clip(s.text, 1500), { footer: `Level ${s.level} ${s.school}` }).addFields(
        { name: 'Casting time', value: s.castingTime, inline: true }, { name: 'Range', value: s.range, inline: true }, { name: 'Duration', value: s.duration, inline: true });
    }),
  },
  {
    data: command('mcstatus', 'Minecraft server status', [opt.string('host', 'Server address, for example mc.hypixel.net', { min: 3, max: 100 })]),
    execute: (i) => respondApi(i, async () => {
      const s = await apis.minecraftServer(str(i, 'host'));
      if (!s.online) return embed(s.host, 'Offline or not reachable.', { color: 0xED4245 });
      return embed(s.host, clip(s.motd, 300) || 'Online', { color: 0x57F287, footer: `${s.players}/${s.max} players · ${s.version}` });
    }),
  },
  {
    data: command('mcuuid', 'Minecraft player UUID', [opt.string('username', 'Java Edition username', { min: 3, max: 16 })]),
    execute: (i) => respondApi(i, async () => { const p = await apis.minecraftUuid(str(i, 'username')); return `**${p.name}**: \`${p.uuid}\``; }),
  },
  {
    data: command('chess', 'Chess.com player profile', [opt.string('username', 'Chess.com username', { min: 2, max: 40 })]),
    execute: (i) => respondApi(i, async () => {
      const p = await apis.chessProfile(str(i, 'username'));
      const e = embed(`${p.title ? `${p.title} ` : ''}${p.username}`, '', { url: p.url, thumbnail: p.avatar || undefined });
      for (const [mode, rating] of Object.entries(p.ratings)) e.addFields({ name: mode[0].toUpperCase() + mode.slice(1), value: String(rating), inline: true });
      return e.addFields({ name: 'Followers', value: p.followers.toLocaleString('en-US'), inline: true });
    }),
  },
  {
    data: command('anime', 'Search anime on MyAnimeList', [opt.string('title', 'Anime title', { min: 2, max: 80 })]),
    execute: (i) => respondApi(i, async () => {
      const a = await apis.animeSearch(str(i, 'title'));
      return embed(a.title, clip(a.synopsis, 900), { url: a.url, thumbnail: a.image }).addFields(
        { name: 'Score', value: String(a.score ?? 'n/a'), inline: true }, { name: 'Episodes', value: String(a.episodes ?? '?'), inline: true }, { name: 'Status', value: a.status || 'n/a', inline: true });
    }),
  },
  {
    data: command('show', 'Look up a TV show', [opt.string('title', 'Show title', { min: 2, max: 80 })]),
    execute: (i) => respondApi(i, async () => {
      const s = await apis.tvShow(str(i, 'title'));
      return embed(s.name, clip(s.summary, 900), { url: s.url, thumbnail: s.image || undefined }).addFields(
        { name: 'Rating', value: String(s.rating ?? 'n/a'), inline: true }, { name: 'Premiered', value: s.premiered || 'n/a', inline: true }, { name: 'Genres', value: s.genres.join(', ') || 'n/a', inline: true });
    }),
  },
  {
    data: command('song', 'Find a song on Apple Music', [opt.string('query', 'Song or artist', { min: 2, max: 80 })]),
    execute: (i) => respondApi(i, async () => {
      const rs = await apis.musicSearch(str(i, 'query'));
      return embed('Songs', rs.map((r) => `**${r.track}** by ${r.artist} (${r.album}) [link](${r.url})`).join('\n'), { thumbnail: rs[0].art });
    }),
  },
  {
    data: command('book', 'Search for a book', [opt.string('query', 'Title or author', { min: 2, max: 80 })]),
    execute: (i) => respondApi(i, async () => {
      const bs = await apis.bookSearch(str(i, 'query'));
      return embed('Books', bs.map((b) => `**[${b.title}](${b.url})** by ${b.authors} (${b.year || '?'})`).join('\n'), { footer: 'Data: Open Library' });
    }),
  },
  {
    data: command('cocktail', 'A random cocktail recipe'),
    execute: (i) => respondApi(i, async () => {
      const r = await apis.randomCocktail();
      return embed(r.name, clip(r.instructions, 1200), { thumbnail: r.image }).addFields({ name: 'Ingredients', value: r.ingredients.join('\n') || 'n/a' });
    }),
  },
  {
    data: command('meal', 'A random meal recipe'),
    execute: (i) => respondApi(i, async () => {
      const r = await apis.randomMeal();
      return embed(r.name, clip(r.instructions, 1200), { thumbnail: r.image, url: r.source || undefined, footer: `${r.category} · ${r.area}` })
        .addFields({ name: 'Ingredients', value: clip(r.ingredients.join('\n'), 1000) || 'n/a' });
    }),
  },
];
