'use strict';
// botbench-libs: small, dependency-free libraries for Discord bots (and anything else).
// Every module works on its own. Copy a single file into your project if you like.
// The Python twin lives in libs/python and behaves identically (both pass the same test vectors).

module.exports = {
  duration: require('./duration'),
  dice: require('./dice'),
  cron: require('./cron'),
  ratelimit: require('./ratelimit'),
  cache: require('./cache'),
  retry: require('./retry'),
  textfmt: require('./textfmt'),
  fuzzy: require('./fuzzy'),
  templating: require('./templating'),
  i18n: require('./i18n'),
  automod: require('./automod'),
  webhooks: require('./webhooks'),
  githubEvents: require('./githubEvents'),
  redact: require('./redact'),
  musicQueue: require('./musicQueue'),
  tictactoe: require('./tictactoe'),
  wordle: require('./wordle'),
  blackjack: require('./blackjack'),
  leveling: require('./leveling'),
  leaderboard: require('./leaderboard'),
  pagination: require('./pagination'),
  poll: require('./poll'),
  captcha: require('./captcha'),
  economy: require('./economy'),
  giveaway: require('./giveaway'),
};
