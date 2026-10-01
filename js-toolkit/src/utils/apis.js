'use strict';
// Ready-made wrappers for free APIs. Every function is async and returns plain objects/strings.
//
//   const apis = require('./apis');
//   const text = await apis.joke();
//   const w = await apis.weatherForCity('Tokyo');
//
// They throw LookupError when the API works but finds nothing, and ApiError when the API
// itself fails. See directory.js for 100+ more APIs to wrap.

const { ApiClient, ApiError, LookupError } = require('./apiClient');

const client = new ApiClient();
const q = (v) => encodeURIComponent(String(v).trim());

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decodeHtml = (s = '') =>
  s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Turn a 404 into a friendly LookupError; rethrow everything else. */
async function or404(promise, message) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw new LookupError(message);
    throw err;
  }
}

// ------------------------------------------------------------------ fun
const JOKE_CATEGORIES = new Set(['Any', 'Programming', 'Misc', 'Pun', 'Spooky', 'Christmas']);

/** JokeAPI, with the safe-mode filter on. */
async function joke(category = 'Any') {
  const c = JOKE_CATEGORIES.has(category) ? category : 'Any';
  const d = await client.getJson(`https://v2.jokeapi.dev/joke/${c}?safe-mode`, { ttlMs: 0 });
  if (d.error) throw new LookupError('No joke found.');
  return d.type === 'single' ? d.joke : `${d.setup}\n\n||${d.delivery}||`;
}
const dadJoke = async () => (await client.getJson('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' }, ttlMs: 0 })).joke;
const chuckNorris = async () => (await client.getJson('https://api.chucknorris.io/jokes/random', { ttlMs: 0 })).value;
const catFact = async () => (await client.getJson('https://catfact.ninja/fact', { ttlMs: 0 })).fact;
const uselessFact = async () => (await client.getJson('https://uselessfacts.jsph.pl/api/v2/facts/random', { params: { language: 'en' }, ttlMs: 0 })).text;
const advice = async () => (await client.getJson('https://api.adviceslip.com/advice', { ttlMs: 0 })).slip.advice;
const dogImage = async () => (await client.getJson('https://dog.ceo/api/breeds/image/random', { ttlMs: 0 })).message;

async function xkcd(num) {
  const url = num ? `https://xkcd.com/${Number(num)}/info.0.json` : 'https://xkcd.com/info.0.json';
  const d = await client.getJson(url, { ttlMs: 300_000 });
  return { num: d.num, title: d.title, img: d.img, alt: d.alt, url: `https://xkcd.com/${d.num}/` };
}
async function rhymes(word, limit = 12) {
  const d = await client.getJson('https://api.datamuse.com/words', { params: { rel_rhy: word, max: limit } });
  if (!d.length) throw new LookupError(`No rhymes found for ${word}.`);
  return d.map((x) => x.word);
}
async function bibleVerse(reference) {
  const d = await client.getJson(`https://bible-api.com/${q(reference)}`);
  return { reference: d.reference, text: d.text.trim(), translation: d.translation_name || '' };
}

// ------------------------------------------------------------------ weather and places
const WMO_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Rain showers', 82: 'Violent rain showers', 85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

async function geocode(name) {
  const d = await client.getJson('https://geocoding-api.open-meteo.com/v1/search', {
    params: { name, count: 1, language: 'en', format: 'json' }, ttlMs: 3_600_000,
  });
  if (!d.results?.length) throw new LookupError(`Couldn't find a place called ${name}.`);
  const r = d.results[0];
  return { name: r.name, country: r.country || '', region: r.admin1 || '', lat: r.latitude, lon: r.longitude };
}
async function weather(lat, lon) {
  const d = await client.getJson('https://api.open-meteo.com/v1/forecast', {
    params: { latitude: lat, longitude: lon, current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' },
    ttlMs: 300_000,
  });
  const c = d.current;
  return { tempC: c.temperature_2m, feelsC: c.apparent_temperature, humidity: c.relative_humidity_2m, windKmh: c.wind_speed_10m, summary: WMO_CODES[c.weather_code] || 'Unknown' };
}
async function weatherForCity(city) {
  const place = await geocode(city);
  return { ...place, ...(await weather(place.lat, place.lon)) };
}
async function country(name) {
  const d = await client.getJson(`https://restcountries.com/v3.1/name/${q(name)}`, {
    params: { fields: 'name,capital,population,region,flags,currencies,languages' }, ttlMs: 3_600_000,
  });
  const c = d[0];
  return {
    name: c.name.common, capital: (c.capital || []).join(', ') || 'n/a', population: c.population, region: c.region, flag: c.flags.png,
    currencies: Object.entries(c.currencies || {}).map(([k, v]) => `${v.name} (${k})`).join(', ') || 'n/a',
    languages: Object.values(c.languages || {}).join(', ') || 'n/a',
  };
}
async function holidays(countryCode, year) {
  const d = await client.getJson(`https://date.nager.at/api/v3/PublicHolidays/${Number(year)}/${q(countryCode.toUpperCase())}`, { ttlMs: 86_400_000 });
  return d.map((h) => ({ date: h.date, name: h.name, localName: h.localName }));
}
async function issPosition() {
  const d = await client.getJson('https://api.wheretheiss.at/v1/satellites/25544', { ttlMs: 5000 });
  return { lat: d.latitude, lon: d.longitude, altKm: d.altitude, speedKmh: d.velocity, visibility: d.visibility };
}

// ------------------------------------------------------------------ knowledge
async function wikiSummary(title) {
  const d = await or404(client.getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${q(title.replace(/ /g, '_'))}`, { ttlMs: 3_600_000 }), `No Wikipedia article found for ${title}.`);
  if (d.type === 'disambiguation') throw new LookupError(`'${title}' could mean many things. Be more specific.`);
  return { title: d.title, extract: d.extract || '', url: d.content_urls?.desktop?.page || '', image: d.thumbnail?.source || null };
}
async function define(word) {
  const d = await or404(client.getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${q(word)}`, { ttlMs: 86_400_000 }), `No definition found for ${word}.`);
  const entry = d[0];
  return {
    word: entry.word, phonetic: entry.phonetic || '',
    meanings: entry.meanings.slice(0, 3).map((m) => ({ part: m.partOfSpeech, definition: m.definitions[0].definition, example: m.definitions[0].example || null })),
  };
}
async function bookSearch(query, limit = 3) {
  const d = await client.getJson('https://openlibrary.org/search.json', { params: { q: query, limit }, ttlMs: 3_600_000 });
  if (!d.docs.length) throw new LookupError('No books found.');
  return d.docs.map((b) => ({ title: b.title, authors: (b.author_name || []).slice(0, 2).join(', ') || 'Unknown', year: b.first_publish_year, url: `https://openlibrary.org${b.key}` }));
}

// ------------------------------------------------------------------ money
async function cryptoPrice(coinId = 'bitcoin', vs = 'usd') {
  coinId = coinId.toLowerCase().trim();
  vs = vs.toLowerCase().trim();
  const d = await client.getJson('https://api.coingecko.com/api/v3/simple/price', { params: { ids: coinId, vs_currencies: vs, include_24hr_change: 'true' }, ttlMs: 60_000 });
  if (!d[coinId] || d[coinId][vs] === undefined) throw new LookupError(`Unknown coin or currency. Use CoinGecko ids like bitcoin or ethereum.`);
  return { coin: coinId, vs, price: d[coinId][vs], change24h: d[coinId][`${vs}_24h_change`] ?? null };
}
async function exchangeRate(base, target) {
  const d = await client.getJson(`https://open.er-api.com/v6/latest/${q(base.toUpperCase())}`, { ttlMs: 3_600_000 });
  if (d.result !== 'success' || d.rates[target.toUpperCase()] === undefined) throw new LookupError('Unknown currency code.');
  return d.rates[target.toUpperCase()];
}

// ------------------------------------------------------------------ dev
const REPO = /^[\w.-]+\/[\w.-]+$/;
async function githubRepo(fullName, token) {
  if (!REPO.test(fullName)) throw new LookupError('Use the form owner/repo, for example discord/discord-api-docs.');
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const d = await or404(client.getJson(`https://api.github.com/repos/${fullName}`, { headers, ttlMs: 300_000 }), 'That repository was not found.');
  return { name: d.full_name, description: d.description || '', stars: d.stargazers_count, forks: d.forks_count, issues: d.open_issues_count, language: d.language || 'n/a', license: d.license?.name || 'none', url: d.html_url, pushedAt: d.pushed_at };
}
async function pypiPackage(name) {
  const d = await or404(client.getJson(`https://pypi.org/pypi/${q(name)}/json`, { ttlMs: 600_000 }), 'No such package on PyPI.');
  const i = d.info;
  return { name: i.name, version: i.version, summary: i.summary || '', python: i.requires_python || 'n/a', url: i.package_url || `https://pypi.org/project/${name}/` };
}
async function npmPackage(name) {
  const d = await or404(client.getJson(`https://registry.npmjs.org/${q(name)}/latest`, { ttlMs: 600_000 }), 'No such package on npm.');
  return { name: d.name, version: d.version, description: d.description || '', license: d.license || 'n/a', url: `https://www.npmjs.com/package/${d.name}` };
}
async function hackerNews(count = 5) {
  const ids = await client.getJson('https://hacker-news.firebaseio.com/v0/topstories.json', { ttlMs: 300_000 });
  const items = await Promise.all(ids.slice(0, Math.max(1, Math.min(count, 10))).map((id) => client.getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { ttlMs: 300_000 })));
  return items.map((it) => ({ title: it.title, score: it.score, by: it.by, url: it.url || `https://news.ycombinator.com/item?id=${it.id}` }));
}
async function shortenUrl(url) {
  const d = await client.getJson('https://is.gd/create.php', { params: { format: 'json', url }, ttlMs: 0 });
  if (!d.shorturl) throw new LookupError(d.errormessage || "Couldn't shorten that link.");
  return d.shorturl;
}
/** Build a QR image URL. No request is made. Use it as an embed image. */
const qrCodeUrl = (data, size = 300) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;

// ------------------------------------------------------------------ games
/** One multiple-choice question. Open Trivia DB allows one request per 5 seconds per IP. */
async function trivia() {
  const d = await client.getJson('https://opentdb.com/api.php', { params: { amount: 1, type: 'multiple', encode: 'url3986' }, ttlMs: 0 });
  if (d.response_code === 5) throw new ApiError(429, 'opentdb.com', 'rate limited');
  if (d.response_code !== 0) throw new LookupError('No trivia question available.');
  const x = d.results[0];
  const dec = decodeURIComponent;
  return { category: dec(x.category), difficulty: x.difficulty, question: dec(x.question), correct: dec(x.correct_answer), incorrect: x.incorrect_answers.map(dec) };
}
async function pokemon(name) {
  const d = await or404(client.getJson(`https://pokeapi.co/api/v2/pokemon/${q(name.toLowerCase())}`, { ttlMs: 86_400_000 }), 'No Pokémon with that name or number.');
  return {
    id: d.id, name: d.name[0].toUpperCase() + d.name.slice(1), heightM: d.height / 10, weightKg: d.weight / 10,
    types: d.types.map((t) => t.type.name), abilities: d.abilities.map((a) => a.ability.name),
    stats: Object.fromEntries(d.stats.map((s) => [s.stat.name, s.base_stat])), sprite: d.sprites.front_default,
  };
}
async function scryfallCard(name) {
  const d = await or404(client.getJson('https://api.scryfall.com/cards/named', { params: { fuzzy: name }, ttlMs: 3_600_000 }), 'No card matched that name.');
  const face = d.card_faces?.[0] || {};
  return { name: d.name, mana: d.mana_cost || face.mana_cost || '', type: d.type_line, text: d.oracle_text || face.oracle_text || '', set: d.set_name, image: (d.image_uris || face.image_uris || {}).normal || null, url: d.scryfall_uri };
}
async function dndSpell(name) {
  const index = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const d = await or404(client.getJson(`https://www.dnd5eapi.co/api/spells/${index}`, { ttlMs: 86_400_000 }), 'No spell with that name.');
  return { name: d.name, level: d.level, school: d.school.name, range: d.range, castingTime: d.casting_time, duration: d.duration, text: d.desc.join(' ') };
}
async function minecraftServer(host) {
  const d = await client.getJson(`https://api.mcsrvstat.us/3/${q(host)}`, { ttlMs: 30_000 });
  return { online: !!d.online, host, version: d.version || 'n/a', players: d.players?.online ?? 0, max: d.players?.max ?? 0, motd: (d.motd?.clean || []).join(' ') };
}
async function minecraftUuid(username) {
  const d = await or404(client.getJson(`https://api.mojang.com/users/profiles/minecraft/${q(username)}`, { ttlMs: 3_600_000 }), 'No Minecraft player with that name.');
  return { name: d.name, uuid: d.id };
}
async function chessProfile(username) {
  const u = q(username.toLowerCase());
  const p = await or404(client.getJson(`https://api.chess.com/pub/player/${u}`, { ttlMs: 600_000 }), 'No Chess.com player with that name.');
  const s = await client.getJson(`https://api.chess.com/pub/player/${u}/stats`, { ttlMs: 600_000 });
  const ratings = {};
  for (const k of ['chess_rapid', 'chess_blitz', 'chess_bullet']) if (s[k]?.last) ratings[k.replace('chess_', '')] = s[k].last.rating;
  return { username: p.username, title: p.title || null, followers: p.followers || 0, url: p.url, avatar: p.avatar || null, ratings };
}

// ------------------------------------------------------------------ media
async function animeSearch(query) {
  const d = await client.getJson('https://api.jikan.moe/v4/anime', { params: { q: query, limit: 1 }, ttlMs: 3_600_000 });
  if (!d.data.length) throw new LookupError('No anime found.');
  const a = d.data[0];
  return { title: a.title, score: a.score, episodes: a.episodes, status: a.status, year: a.year, synopsis: a.synopsis || '', url: a.url, image: a.images.jpg.image_url };
}
async function tvShow(query) {
  const d = await or404(client.getJson('https://api.tvmaze.com/singlesearch/shows', { params: { q: query }, ttlMs: 3_600_000 }), 'No show found.');
  return { name: d.name, rating: d.rating?.average ?? null, genres: d.genres || [], premiered: d.premiered, status: d.status, summary: decodeHtml((d.summary || '').replace(/<[^>]+>/g, '')), url: d.url, image: d.image?.medium || null };
}
async function musicSearch(term, limit = 3) {
  const d = await client.getJson('https://itunes.apple.com/search', { params: { term, limit, media: 'music' }, ttlMs: 3_600_000 });
  if (!d.results.length) throw new LookupError('No songs found.');
  return d.results.map((r) => ({ track: r.trackName, artist: r.artistName, album: r.collectionName, url: r.trackViewUrl, art: r.artworkUrl100 }));
}
function recipe(d, nameKey, prefix) {
  const items = [];
  for (let n = 1; n <= 20; n++) {
    const ing = (d[`strIngredient${n}`] || '').trim();
    if (ing) items.push(`${(d[`strMeasure${n}`] || '').trim()} ${ing}`.trim());
  }
  return { name: d[nameKey], instructions: d.strInstructions || '', ingredients: items, image: d[`str${prefix}Thumb`] };
}
async function randomCocktail() {
  const d = await client.getJson('https://www.thecocktaildb.com/api/json/v1/1/random.php', { ttlMs: 0 });
  return recipe(d.drinks[0], 'strDrink', 'Drink');
}
async function randomMeal() {
  const d = await client.getJson('https://www.themealdb.com/api/json/v1/1/random.php', { ttlMs: 0 });
  const m = d.meals[0];
  return { ...recipe(m, 'strMeal', 'Meal'), category: m.strCategory, area: m.strArea, source: m.strSource };
}
async function nasaApod(apiKey = 'DEMO_KEY') {
  const d = await client.getJson('https://api.nasa.gov/planetary/apod', { params: { api_key: apiKey }, ttlMs: 3_600_000 });
  return { title: d.title, explanation: d.explanation, date: d.date, mediaType: d.media_type, url: d.hdurl || d.url };
}

module.exports = {
  client, decodeHtml,
  joke, dadJoke, chuckNorris, catFact, uselessFact, advice, dogImage, xkcd, rhymes, bibleVerse,
  geocode, weather, weatherForCity, country, holidays, issPosition,
  wikiSummary, define, bookSearch, cryptoPrice, exchangeRate,
  githubRepo, pypiPackage, npmPackage, hackerNews, shortenUrl, qrCodeUrl,
  trivia, pokemon, scryfallCard, dndSpell, minecraftServer, minecraftUuid, chessProfile,
  animeSearch, tvShow, musicSearch, randomCocktail, randomMeal, nasaApod,
};
