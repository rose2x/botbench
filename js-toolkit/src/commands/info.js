'use strict';
// Lookup commands: weather, wiki, dictionary, countries, money, dev tools.
const apis = require('../utils/apis');
const { embed, opt, command, respondApi, clip } = require('../utils/discordHelpers');

const str = (i, n) => i.options.getString(n);

module.exports.commands = [
  {
    data: command('weather', 'Current weather in a city', [opt.string('city', 'City name, for example Tokyo', { min: 2, max: 80 })]),
    execute: (i) => respondApi(i, async () => {
      const w = await apis.weatherForCity(str(i, 'city'));
      const place = [w.name, w.region, w.country].filter(Boolean).join(', ');
      return embed(`Weather in ${place}`, w.summary, { footer: 'Data: Open-Meteo.com' }).addFields(
        { name: 'Temperature', value: `${w.tempC}°C (feels ${w.feelsC}°C)`, inline: true },
        { name: 'Humidity', value: `${w.humidity}%`, inline: true },
        { name: 'Wind', value: `${w.windKmh} km/h`, inline: true },
      );
    }),
  },
  {
    data: command('wiki', 'Wikipedia summary', [opt.string('topic', 'What to look up', { min: 2, max: 100 })]),
    execute: (i) => respondApi(i, async () => {
      const w = await apis.wikiSummary(str(i, 'topic'));
      return embed(w.title, clip(w.extract, 1500), { url: w.url || undefined, thumbnail: w.image || undefined });
    }),
  },
  {
    data: command('define', 'Dictionary definition', [opt.string('word', 'English word', { max: 40 })]),
    execute: (i) => respondApi(i, async () => {
      const d = await apis.define(str(i, 'word'));
      const e = embed(d.word + (d.phonetic ? `  ${d.phonetic}` : ''));
      for (const m of d.meanings) e.addFields({ name: m.part, value: clip(m.definition + (m.example ? `\n*${m.example}*` : ''), 1000) });
      return e;
    }),
  },
  {
    data: command('country', 'Facts about a country', [opt.string('name', 'Country name', { min: 2, max: 60 })]),
    execute: (i) => respondApi(i, async () => {
      const c = await apis.country(str(i, 'name'));
      return embed(c.name, '', { thumbnail: c.flag }).addFields(
        { name: 'Capital', value: c.capital, inline: true },
        { name: 'Region', value: c.region, inline: true },
        { name: 'Population', value: c.population.toLocaleString('en-US'), inline: true },
        { name: 'Currencies', value: clip(c.currencies, 200), inline: true },
        { name: 'Languages', value: clip(c.languages, 200), inline: true },
      );
    }),
  },
  {
    data: command('holidays', 'Public holidays for a country', [opt.string('country_code', 'Two-letter code, for example US or DE', { min: 2, max: 2 }), opt.integer('year', 'Year (default: this year)', { required: false, min: 1990, max: 2100 })]),
    execute: (i) => respondApi(i, async () => {
      const year = i.options.getInteger('year') || new Date().getFullYear();
      const cc = str(i, 'country_code');
      const hs = await apis.holidays(cc, year);
      return embed(`Public holidays ${cc.toUpperCase()} ${year}`, clip(hs.map((h) => `\`${h.date}\` ${h.name}`).join('\n'), 3900));
    }),
  },
  {
    data: command('iss', 'Where is the International Space Station right now?'),
    execute: (i) => respondApi(i, async () => {
      const p = await apis.issPosition();
      return embed('International Space Station', `Latitude ${p.lat.toFixed(2)}, longitude ${p.lon.toFixed(2)}`).addFields(
        { name: 'Altitude', value: `${p.altKm.toFixed(0)} km`, inline: true },
        { name: 'Speed', value: `${p.speedKmh.toFixed(0)} km/h`, inline: true },
        { name: 'Visibility', value: p.visibility, inline: true },
      );
    }),
  },
  {
    data: command('crypto', 'Crypto price (CoinGecko id, like bitcoin)', [opt.string('coin', 'CoinGecko id, for example bitcoin or ethereum', { required: false, min: 2, max: 40 }), opt.string('currency', 'Currency, for example usd', { required: false, min: 3, max: 5 })]),
    execute: (i) => respondApi(i, async () => {
      const p = await apis.cryptoPrice(str(i, 'coin') || 'bitcoin', str(i, 'currency') || 'usd');
      const ch = p.change24h === null ? '' : ` (${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(2)}% in 24h)`;
      return embed(p.coin[0].toUpperCase() + p.coin.slice(1), `**${p.price.toLocaleString('en-US')} ${p.vs.toUpperCase()}**${ch}`, { footer: 'Data: CoinGecko' });
    }),
  },
  {
    data: command('convert', 'Convert between currencies', [opt.number('amount', 'Amount', { min: 0, max: 1e12 }), opt.string('from', 'From currency, for example USD', { min: 3, max: 3 }), opt.string('to', 'To currency, for example EUR', { min: 3, max: 3 })]),
    execute: (i) => respondApi(i, async () => {
      const amount = i.options.getNumber('amount');
      const r = await apis.exchangeRate(str(i, 'from'), str(i, 'to'));
      const f = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${f(amount)} ${str(i, 'from').toUpperCase()} = **${f(amount * r)} ${str(i, 'to').toUpperCase()}**  (rate ${r.toFixed(4)})`;
    }),
  },
  {
    data: command('github', 'GitHub repository info', [opt.string('repo', 'owner/repo, for example discord/discord-api-docs', { min: 3, max: 100 })]),
    execute: (i) => respondApi(i, async () => {
      const r = await apis.githubRepo(str(i, 'repo'), process.env.GITHUB_TOKEN);
      return embed(r.name, r.description, { url: r.url }).addFields(
        { name: 'Stars', value: r.stars.toLocaleString('en-US'), inline: true },
        { name: 'Forks', value: r.forks.toLocaleString('en-US'), inline: true },
        { name: 'Open issues', value: r.issues.toLocaleString('en-US'), inline: true },
        { name: 'Language', value: r.language, inline: true },
        { name: 'License', value: r.license, inline: true },
      );
    }),
  },
  {
    data: command('pypi', 'Python package info from PyPI', [opt.string('name', 'Package name', { max: 80 })]),
    execute: (i) => respondApi(i, async () => {
      const p = await apis.pypiPackage(str(i, 'name'));
      return embed(`${p.name} ${p.version}`, p.summary, { url: p.url, footer: `Python ${p.python}` });
    }),
  },
  {
    data: command('npm', 'JavaScript package info from npm', [opt.string('name', 'Package name', { max: 120 })]),
    execute: (i) => respondApi(i, async () => {
      const p = await apis.npmPackage(str(i, 'name'));
      return embed(`${p.name} ${p.version}`, p.description, { url: p.url, footer: `License: ${p.license}` });
    }),
  },
  {
    data: command('hackernews', 'Top Hacker News stories'),
    execute: (i) => respondApi(i, async () => {
      const items = await apis.hackerNews(5);
      return embed('Hacker News', items.map((s, n) => `**${n + 1}.** [${clip(s.title, 90)}](${s.url}) (${s.score} points)`).join('\n'));
    }),
  },
  {
    data: command('apod', "NASA's Astronomy Picture of the Day"),
    execute: (i) => respondApi(i, async () => {
      const a = await apis.nasaApod(process.env.NASA_API_KEY || 'DEMO_KEY');
      const e = embed(a.title, clip(a.explanation, 1500), { footer: a.date });
      if (a.mediaType === 'image') e.setImage(a.url); else e.setDescription(`${clip(a.explanation, 1500)}\n\n${a.url}`);
      return e;
    }),
  },
  {
    data: command('qr', 'Make a QR code', [opt.string('text', 'Text or link to encode', { max: 500 })]),
    execute: (i) => i.reply({ embeds: [embed('QR code', '', { image: apis.qrCodeUrl(str(i, 'text')) })] }),
  },
];
