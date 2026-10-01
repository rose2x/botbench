'use strict';
// A tiny translation helper with locale fallback and plural forms.
//
//   const i18n = new I18n({ en: { hi: 'Hello {name}', items: { one: '{count} item', other: '{count} items' } },
//                           pt: { hi: 'Olá {name}' } }, 'en');
//   i18n.t('hi', 'pt-BR', { name: 'Ana' });   // "Olá Ana"   (pt-BR -> pt -> en -> the key itself)
//   i18n.t('items', 'en', { count: 2 });      // "2 items"
//
// Plural forms are "zero" (optional), "one" (count == 1) and "other". Languages with more forms need their own rules.
// Discord tells you the user's locale in interaction.locale (for example "pt-BR", "en-US").

const { render } = require('./templating');

const norm = (locale) => String(locale).replace(/_/g, '-').toLowerCase();

class I18n {
  constructor(catalogs, defaultLocale = 'en') {
    this.catalogs = Object.fromEntries(Object.entries(catalogs).map(([k, v]) => [norm(k), v]));
    this.default = norm(defaultLocale);
  }

  #candidates(locale) {
    const out = [];
    if (locale) { const loc = norm(locale); out.push(loc, loc.split('-')[0]); }
    out.push(this.default);
    return [...new Set(out)];
  }

  t(key, locale = null, vars = {}) {
    for (const loc of this.#candidates(locale)) {
      let value = (this.catalogs[loc] || {})[key];
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') {
        const count = vars.count ?? 0;
        const form = count === 0 && 'zero' in value ? 'zero' : count === 1 ? 'one' : 'other';
        value = value[form] ?? value.other ?? '';
      }
      return render(value, vars);
    }
    return key;
  }
}

module.exports = { I18n };
