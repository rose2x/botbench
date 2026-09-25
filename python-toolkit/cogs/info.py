"""Lookup commands: weather, wiki, dictionary, countries, money, dev tools."""
from __future__ import annotations

import datetime as dt

import discord
from discord import app_commands
from discord.ext import commands

from toolkit import apis
from toolkit.discord_helpers import clip, embed, respond_api


class Info(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(description="Current weather in a city")
    @app_commands.describe(city="City name, for example Tokyo")
    async def weather(self, interaction: discord.Interaction, city: app_commands.Range[str, 2, 80]):
        async def make():
            w = await apis.weather_for_city(city)
            place = ", ".join(x for x in (w["name"], w["region"], w["country"]) if x)
            e = embed(f"Weather in {place}", w["summary"])
            e.add_field(name="Temperature", value=f"{w['temp_c']}°C (feels {w['feels_c']}°C)")
            e.add_field(name="Humidity", value=f"{w['humidity']}%")
            e.add_field(name="Wind", value=f"{w['wind_kmh']} km/h")
            e.set_footer(text="Data: Open-Meteo.com")
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Wikipedia summary")
    @app_commands.describe(topic="What to look up")
    async def wiki(self, interaction: discord.Interaction, topic: app_commands.Range[str, 2, 100]):
        async def make():
            w = await apis.wiki_summary(topic)
            return embed(w["title"], clip(w["extract"], 1500), url=w["url"] or None, thumbnail=w["image"])
        await respond_api(interaction, make)

    @app_commands.command(description="Dictionary definition")
    @app_commands.describe(word="English word")
    async def define(self, interaction: discord.Interaction, word: app_commands.Range[str, 1, 40]):
        async def make():
            d = await apis.define(word)
            e = embed(d["word"] + (f"  {d['phonetic']}" if d["phonetic"] else ""))
            for m in d["meanings"]:
                text = m["definition"] + (f"\n*{m['example']}*" if m["example"] else "")
                e.add_field(name=m["part"], value=clip(text, 1000), inline=False)
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Facts about a country")
    @app_commands.describe(name="Country name")
    async def country(self, interaction: discord.Interaction, name: app_commands.Range[str, 2, 60]):
        async def make():
            c = await apis.country(name)
            e = embed(c["name"], thumbnail=c["flag"])
            e.add_field(name="Capital", value=c["capital"])
            e.add_field(name="Region", value=c["region"])
            e.add_field(name="Population", value=f"{c['population']:,}")
            e.add_field(name="Currencies", value=clip(c["currencies"], 200))
            e.add_field(name="Languages", value=clip(c["languages"], 200))
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Public holidays for a country")
    @app_commands.describe(country_code="Two-letter code, for example US or DE", year="Year (default: this year)")
    async def holidays(self, interaction: discord.Interaction, country_code: app_commands.Range[str, 2, 2],
                       year: app_commands.Range[int, 1990, 2100] = 0):
        async def make():
            y = year or dt.date.today().year
            hs = await apis.holidays(country_code, y)
            lines = [f"`{h['date']}` {h['name']}" for h in hs]
            return embed(f"Public holidays {country_code.upper()} {y}", clip("\n".join(lines), 3900))
        await respond_api(interaction, make)

    @app_commands.command(description="Where is the International Space Station right now?")
    async def iss(self, interaction: discord.Interaction):
        async def make():
            p = await apis.iss_position()
            e = embed("International Space Station", f"Latitude {p['lat']:.2f}, longitude {p['lon']:.2f}")
            e.add_field(name="Altitude", value=f"{p['alt_km']:.0f} km")
            e.add_field(name="Speed", value=f"{p['speed_kmh']:.0f} km/h")
            e.add_field(name="Visibility", value=p["visibility"])
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Crypto price (CoinGecko id, like bitcoin)")
    @app_commands.describe(coin="CoinGecko id, for example bitcoin or ethereum", currency="Currency, for example usd")
    async def crypto(self, interaction: discord.Interaction, coin: app_commands.Range[str, 2, 40] = "bitcoin",
                     currency: app_commands.Range[str, 3, 5] = "usd"):
        async def make():
            p = await apis.crypto_price(coin, currency)
            ch = p["change_24h"]
            arrow = "" if ch is None else f" ({ch:+.2f}% in 24h)"
            return embed(p["coin"].title(), f"**{p['price']:,} {p['vs'].upper()}**{arrow}", footer="Data: CoinGecko")
        await respond_api(interaction, make)

    @app_commands.command(description="Convert between currencies")
    @app_commands.describe(amount="Amount", from_="From currency, for example USD", to="To currency, for example EUR")
    @app_commands.rename(from_="from")
    async def convert(self, interaction: discord.Interaction, amount: app_commands.Range[float, 0.0, 1e12],
                      from_: app_commands.Range[str, 3, 3], to: app_commands.Range[str, 3, 3]):
        async def make():
            r = await apis.exchange_rate(from_, to)
            return f"{amount:,.2f} {from_.upper()} = **{amount * r:,.2f} {to.upper()}**  (rate {r:.4f})"
        await respond_api(interaction, make)

    @app_commands.command(description="GitHub repository info")
    @app_commands.describe(repo="owner/repo, for example discord/discord-api-docs")
    async def github(self, interaction: discord.Interaction, repo: app_commands.Range[str, 3, 100]):
        async def make():
            r = await apis.github_repo(repo)
            e = embed(r["name"], r["description"], url=r["url"])
            e.add_field(name="Stars", value=f"{r['stars']:,}")
            e.add_field(name="Forks", value=f"{r['forks']:,}")
            e.add_field(name="Open issues", value=f"{r['issues']:,}")
            e.add_field(name="Language", value=r["language"])
            e.add_field(name="License", value=r["license"])
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Python package info from PyPI")
    @app_commands.describe(name="Package name")
    async def pypi(self, interaction: discord.Interaction, name: app_commands.Range[str, 1, 80]):
        async def make():
            p = await apis.pypi_package(name)
            return embed(f"{p['name']} {p['version']}", p["summary"], url=p["url"], footer=f"Python {p['python']}")
        await respond_api(interaction, make)

    @app_commands.command(description="JavaScript package info from npm")
    @app_commands.describe(name="Package name")
    async def npm(self, interaction: discord.Interaction, name: app_commands.Range[str, 1, 120]):
        async def make():
            p = await apis.npm_package(name)
            return embed(f"{p['name']} {p['version']}", p["description"], url=p["url"], footer=f"License: {p['license']}")
        await respond_api(interaction, make)

    @app_commands.command(description="Top Hacker News stories")
    async def hackernews(self, interaction: discord.Interaction):
        async def make():
            items = await apis.hacker_news(5)
            lines = [f"**{i + 1}.** [{clip(s['title'], 90)}]({s['url']}) ({s['score']} points)" for i, s in enumerate(items)]
            return embed("Hacker News", "\n".join(lines))
        await respond_api(interaction, make)

    @app_commands.command(description="NASA's Astronomy Picture of the Day")
    async def apod(self, interaction: discord.Interaction):
        async def make():
            a = await apis.nasa_apod()
            e = embed(a["title"], clip(a["explanation"], 1500), footer=a["date"])
            if a["media_type"] == "image":
                e.set_image(url=a["url"])
            else:
                e.description += f"\n\n{a['url']}"
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Make a QR code")
    @app_commands.describe(text="Text or link to encode")
    async def qr(self, interaction: discord.Interaction, text: app_commands.Range[str, 1, 500]):
        await interaction.response.send_message(embed=embed("QR code", image=apis.qr_code_url(text)))


async def setup(bot: commands.Bot):
    await bot.add_cog(Info(bot))
