"""A tiny translation helper with locale fallback and plural forms.

    i18n = I18n({"en": {"hi": "Hello {name}", "items": {"one": "{count} item", "other": "{count} items"}},
                 "pt": {"hi": "Olá {name}"}}, default="en")
    i18n.t("hi", "pt-BR", name="Ana")        # "Olá Ana"   (pt-BR -> pt -> en -> the key itself)
    i18n.t("items", "en", count=2)           # "2 items"

Plural forms are "zero" (optional), "one" (count == 1) and "other". Languages with more forms need their own rules.
Discord tells you the user's locale in interaction.locale (for example "pt-BR", "en-US").
"""
from __future__ import annotations

from .templating import render


def _norm(locale: str) -> str:
    return str(locale).replace("_", "-").lower()


class I18n:
    def __init__(self, catalogs: dict, default: str = "en"):
        self.catalogs = {_norm(k): v for k, v in catalogs.items()}
        self.default = _norm(default)

    def _candidates(self, locale):
        out = []
        if locale:
            loc = _norm(locale)
            out += [loc, loc.split("-")[0]]
        out.append(self.default)
        return list(dict.fromkeys(out))

    def t(self, key: str, locale=None, **vars_) -> str:
        for loc in self._candidates(locale):
            value = self.catalogs.get(loc, {}).get(key)
            if value is None:
                continue
            if isinstance(value, dict):
                count = vars_.get("count", 0)
                form = "zero" if count == 0 and "zero" in value else "one" if count == 1 else "other"
                value = value.get(form, value.get("other", ""))
            return render(value, vars_)
        return key
