'use strict';
// Fun commands, mostly powered by free APIs.
const apis = require('../utils/apis');
const { embed, opt, command, respondApi } = require('../utils/discordHelpers');

const EIGHT_BALL = ['It is certain.', 'Without a doubt.', 'Yes.', 'Most likely.', 'Ask again later.', 'Cannot predict now.', "Don't count on it.", 'My sources say no.', 'Very doubtful.'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const simple = (name, description, fn) => ({ data: command(name, description), execute: (i) => respondApi(i, fn) });

module.exports.commands = [
  {
    data: command('roll', 'Roll dice', [opt.integer('sides', 'Sides per die (default 6)', { required: false, min: 2, max: 1000 }), opt.integer('count', 'How many dice (default 1)', { required: false, min: 1, max: 20 })]),
    async execute(i) {
      const sides = i.options.getInteger('sides') ?? 6;
      const count = i.options.getInteger('count') ?? 1;
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
      const detail = count > 1 ? ` (${rolls.join(' + ')})` : '';
      await i.reply(`${count}d${sides}: **${rolls.reduce((a, b) => a + b, 0)}**${detail}`);
    },
  },
  { data: command('coinflip', 'Flip a coin'), execute: (i) => i.reply(pick(['Heads', 'Tails'])) },
  {
    data: command('8ball', 'Ask the magic 8-ball', [opt.string('question', 'Your question', { max: 200 })]),
    execute: (i) => i.reply(`**${i.options.getString('question')}**\n${pick(EIGHT_BALL)}`),
  },
  {
    data: command('choose', 'Pick one option from a comma-separated list', [opt.string('options', 'For example: pizza, tacos, ramen')]),
    async execute(i) {
      const items = i.options.getString('options').split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length < 2) return i.reply({ content: 'Give me at least two options, separated by commas.', flags: 64 });
      return i.reply(`I choose: **${pick(items).slice(0, 200)}**`);
    },
  },
  {
    data: command('joke', 'A safe-mode joke', [opt.string('category', 'Joke category', { required: false, choices: ['Any', 'Programming', 'Misc', 'Pun'] })]),
    execute: (i) => respondApi(i, () => apis.joke(i.options.getString('category') || 'Any')),
  },
  simple('dadjoke', 'A dad joke', apis.dadJoke),
  simple('chuck', 'A Chuck Norris joke', apis.chuckNorris),
  simple('catfact', 'A random cat fact', apis.catFact),
  simple('fact', 'A random useless fact', apis.uselessFact),
  simple('advice', 'Some random advice', apis.advice),
  simple('dog', 'A random dog photo', async () => embed('Woof', '', { image: await apis.dogImage() })),
  {
    data: command('xkcd', 'An xkcd comic (latest if you leave the number out)', [opt.integer('number', 'Comic number', { required: false, min: 1, max: 100000 })]),
    execute: (i) => respondApi(i, async () => {
      const c = await apis.xkcd(i.options.getInteger('number'));
      return embed(`#${c.num}: ${c.title}`, c.alt, { url: c.url, image: c.img });
    }),
  },
  {
    data: command('rhyme', 'Words that rhyme', [opt.string('word', 'The word to rhyme', { max: 40 })]),
    execute: (i) => respondApi(i, async () => `Rhymes with **${i.options.getString('word')}**: ${(await apis.rhymes(i.options.getString('word'))).join(', ')}`),
  },
  {
    data: command('verse', 'Look up a Bible verse', [opt.string('reference', 'For example: john 3:16', { min: 3, max: 60 })]),
    execute: (i) => respondApi(i, async () => {
      const v = await apis.bibleVerse(i.options.getString('reference'));
      return embed(v.reference, v.text, { footer: v.translation });
    }),
  },
];
