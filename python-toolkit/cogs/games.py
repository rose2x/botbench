"""Game and media lookups, plus a trivia game with buttons."""
from __future__ import annotations

import random

import discord
from discord import app_commands
from discord.ext import commands

from toolkit import apis
from toolkit.discord_helpers import clip, embed, respond_api


class TriviaView(discord.ui.View):
    """Four answer buttons. The first click decides the result."""

    def __init__(self, correct: str, options: list[str]):
        super().__init__(timeout=30)
        self.correct = correct
        self.answered = False
        self.message: discord.Message | None = None
        for i, opt in enumerate(options):
            btn = discord.ui.Button(label=clip(opt, 80), style=discord.ButtonStyle.secondary, row=i // 2)
            btn.callback = self._make_callback(btn, opt)
            self.add_item(btn)

    def _make_callback(self, btn: discord.ui.Button, option: str):
        async def callback(interaction: discord.Interaction):
            if self.answered:
                await interaction.response.send_message("Someone already answered this one.", ephemeral=True)
                return
            self.answered = True
            for item in self.children:
                item.disabled = True
                if item.label == clip(self.correct, 80):
                    item.style = discord.ButtonStyle.success
            if option != self.correct:
                btn.style = discord.ButtonStyle.danger
            await interaction.response.edit_message(view=self)
            verdict = "got it right!" if option == self.correct else f"picked wrong. The answer was **{self.correct}**."
            await interaction.followup.send(f"{interaction.user.mention} {verdict}")
            self.stop()
        return callback

    async def on_timeout(self):
        for item in self.children:
            item.disabled = True
        if self.message and not self.answered:
            try:
                await self.message.edit(content=f"Time's up. The answer was **{self.correct}**.", view=self)
            except discord.HTTPException:
                pass


class Games(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(description="A trivia question with buttons")
    @app_commands.checks.cooldown(1, 6.0)
    async def trivia(self, interaction: discord.Interaction):
        await interaction.response.defer()
        try:
            q = await apis.trivia()
        except Exception as exc:
            from toolkit.discord_helpers import friendly_error
            await interaction.followup.send(friendly_error(exc), ephemeral=True)
            return
        options = q["incorrect"] + [q["correct"]]
        random.shuffle(options)
        view = TriviaView(q["correct"], options)
        e = embed(clip(q["question"], 250), footer=f"{q['category']} · {q['difficulty']} · 30 seconds")
        view.message = await interaction.followup.send(embed=e, view=view, wait=True)

    @app_commands.command(description="Pokémon info")
    @app_commands.describe(name="Name or number")
    async def pokemon(self, interaction: discord.Interaction, name: app_commands.Range[str, 1, 40]):
        async def make():
            p = await apis.pokemon(name)
            e = embed(f"#{p['id']} {p['name']}", thumbnail=p["sprite"])
            e.add_field(name="Type", value=", ".join(p["types"]).title())
            e.add_field(name="Height / weight", value=f"{p['height_m']} m / {p['weight_kg']} kg")
            e.add_field(name="Abilities", value=", ".join(p["abilities"]).title(), inline=False)
            e.add_field(name="Base stats", value=" · ".join(f"{k} {v}" for k, v in p["stats"].items()), inline=False)
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Look up a Magic: The Gathering card")
    @app_commands.describe(name="Card name (fuzzy)")
    async def card(self, interaction: discord.Interaction, name: app_commands.Range[str, 2, 80]):
        async def make():
            c = await apis.scryfall_card(name)
            return embed(f"{c['name']}  {c['mana']}", f"*{c['type']}*\n\n{clip(c['text'], 1500)}",
                         url=c["url"], image=c["image"], footer=c["set"])
        await respond_api(interaction, make)

    @app_commands.command(description="Look up a D&D 5e spell")
    @app_commands.describe(name="Spell name, for example fireball")
    async def spell(self, interaction: discord.Interaction, name: app_commands.Range[str, 2, 60]):
        async def make():
            s = await apis.dnd_spell(name)
            e = embed(s["name"], clip(s["text"], 1500), footer=f"Level {s['level']} {s['school']}")
            e.add_field(name="Casting time", value=s["casting_time"])
            e.add_field(name="Range", value=s["range"])
            e.add_field(name="Duration", value=s["duration"])
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Minecraft server status")
    @app_commands.describe(host="Server address, for example mc.hypixel.net")
    async def mcstatus(self, interaction: discord.Interaction, host: app_commands.Range[str, 3, 100]):
        async def make():
            s = await apis.minecraft_server(host)
            if not s["online"]:
                return embed(s["host"], "Offline or not reachable.", color=0xED4245)
            return embed(s["host"], clip(s["motd"], 300) or "Online", color=0x57F287,
                         footer=f"{s['players']}/{s['max']} players · {s['version']}")
        await respond_api(interaction, make)

    @app_commands.command(description="Minecraft player UUID")
    @app_commands.describe(username="Java Edition username")
    async def mcuuid(self, interaction: discord.Interaction, username: app_commands.Range[str, 3, 16]):
        async def make():
            p = await apis.minecraft_uuid(username)
            return f"**{p['name']}**: `{p['uuid']}`"
        await respond_api(interaction, make)

    @app_commands.command(description="Chess.com player profile")
    @app_commands.describe(username="Chess.com username")
    async def chess(self, interaction: discord.Interaction, username: app_commands.Range[str, 2, 40]):
        async def make():
            p = await apis.chess_profile(username)
            title = f"{p['title']} " if p["title"] else ""
            e = embed(f"{title}{p['username']}", url=p["url"], thumbnail=p["avatar"])
            for mode, rating in p["ratings"].items():
                e.add_field(name=mode.title(), value=str(rating))
            e.add_field(name="Followers", value=f"{p['followers']:,}")
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Search anime on MyAnimeList")
    @app_commands.describe(title="Anime title")
    async def anime(self, interaction: discord.Interaction, title: app_commands.Range[str, 2, 80]):
        async def make():
            a = await apis.anime_search(title)
            e = embed(a["title"], clip(a["synopsis"], 900), url=a["url"], thumbnail=a["image"])
            e.add_field(name="Score", value=str(a["score"] or "n/a"))
            e.add_field(name="Episodes", value=str(a["episodes"] or "?"))
            e.add_field(name="Status", value=a["status"] or "n/a")
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Look up a TV show")
    @app_commands.describe(title="Show title")
    async def show(self, interaction: discord.Interaction, title: app_commands.Range[str, 2, 80]):
        async def make():
            s = await apis.tv_show(title)
            e = embed(s["name"], clip(s["summary"], 900), url=s["url"], thumbnail=s["image"])
            e.add_field(name="Rating", value=str(s["rating"] or "n/a"))
            e.add_field(name="Premiered", value=s["premiered"] or "n/a")
            e.add_field(name="Genres", value=", ".join(s["genres"]) or "n/a")
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="Find a song on Apple Music")
    @app_commands.describe(query="Song or artist")
    async def song(self, interaction: discord.Interaction, query: app_commands.Range[str, 2, 80]):
        async def make():
            rs = await apis.music_search(query)
            lines = [f"**{r['track']}** by {r['artist']} ({r['album']}) [link]({r['url']})" for r in rs]
            return embed("Songs", "\n".join(lines), thumbnail=rs[0]["art"])
        await respond_api(interaction, make)

    @app_commands.command(description="Search for a book")
    @app_commands.describe(query="Title or author")
    async def book(self, interaction: discord.Interaction, query: app_commands.Range[str, 2, 80]):
        async def make():
            bs = await apis.book_search(query)
            lines = [f"**[{b['title']}]({b['url']})** by {b['authors']} ({b['year'] or '?'})" for b in bs]
            return embed("Books", "\n".join(lines), footer="Data: Open Library")
        await respond_api(interaction, make)

    @app_commands.command(description="A random cocktail recipe")
    async def cocktail(self, interaction: discord.Interaction):
        async def make():
            r = await apis.random_cocktail()
            e = embed(r["name"], clip(r["instructions"], 1200), thumbnail=r["image"])
            e.add_field(name="Ingredients", value="\n".join(r["ingredients"]) or "n/a", inline=False)
            return e
        await respond_api(interaction, make)

    @app_commands.command(description="A random meal recipe")
    async def meal(self, interaction: discord.Interaction):
        async def make():
            r = await apis.random_meal()
            e = embed(r["name"], clip(r["instructions"], 1200), thumbnail=r["image"], url=r["source"] or None,
                      footer=f"{r['category']} · {r['area']}")
            e.add_field(name="Ingredients", value=clip("\n".join(r["ingredients"]), 1000) or "n/a", inline=False)
            return e
        await respond_api(interaction, make)


async def setup(bot: commands.Bot):
    await bot.add_cog(Games(bot))
