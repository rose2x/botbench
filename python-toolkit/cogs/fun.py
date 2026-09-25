"""Fun commands, mostly powered by free APIs."""
from __future__ import annotations

import random
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from toolkit import apis
from toolkit.discord_helpers import embed, respond_api

EIGHT_BALL = ["It is certain.", "Without a doubt.", "Yes.", "Most likely.", "Ask again later.",
              "Cannot predict now.", "Don't count on it.", "My sources say no.", "Very doubtful."]


class Fun(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(description="Roll dice")
    @app_commands.describe(sides="Sides per die (default 6)", count="How many dice (default 1)")
    async def roll(self, interaction: discord.Interaction,
                   sides: app_commands.Range[int, 2, 1000] = 6, count: app_commands.Range[int, 1, 20] = 1):
        rolls = [random.randint(1, sides) for _ in range(count)]
        detail = f" ({' + '.join(map(str, rolls))})" if count > 1 else ""
        await interaction.response.send_message(f"{count}d{sides}: **{sum(rolls)}**{detail}")

    @app_commands.command(description="Flip a coin")
    async def coinflip(self, interaction: discord.Interaction):
        await interaction.response.send_message(random.choice(["Heads", "Tails"]))

    @app_commands.command(name="8ball", description="Ask the magic 8-ball")
    @app_commands.describe(question="Your question")
    async def eightball(self, interaction: discord.Interaction, question: str):
        await interaction.response.send_message(f"**{question[:200]}**\n{random.choice(EIGHT_BALL)}")

    @app_commands.command(description="Pick one option from a comma-separated list")
    @app_commands.describe(options="For example: pizza, tacos, ramen")
    async def choose(self, interaction: discord.Interaction, options: str):
        items = [o.strip() for o in options.split(",") if o.strip()]
        if len(items) < 2:
            await interaction.response.send_message("Give me at least two options, separated by commas.", ephemeral=True)
            return
        await interaction.response.send_message(f"I choose: **{random.choice(items)[:200]}**")

    @app_commands.command(description="A safe-mode joke")
    @app_commands.describe(category="Joke category")
    @app_commands.choices(category=[app_commands.Choice(name=c, value=c) for c in ("Any", "Programming", "Misc", "Pun")])
    async def joke(self, interaction: discord.Interaction, category: str = "Any"):
        await respond_api(interaction, lambda: apis.joke(category))

    @app_commands.command(description="A dad joke")
    async def dadjoke(self, interaction: discord.Interaction):
        await respond_api(interaction, apis.dad_joke)

    @app_commands.command(description="A Chuck Norris joke")
    async def chuck(self, interaction: discord.Interaction):
        await respond_api(interaction, apis.chuck_norris)

    @app_commands.command(description="A random cat fact")
    async def catfact(self, interaction: discord.Interaction):
        await respond_api(interaction, apis.cat_fact)

    @app_commands.command(description="A random useless fact")
    async def fact(self, interaction: discord.Interaction):
        await respond_api(interaction, apis.useless_fact)

    @app_commands.command(description="Some random advice")
    async def advice(self, interaction: discord.Interaction):
        await respond_api(interaction, apis.advice)

    @app_commands.command(description="A random dog photo")
    async def dog(self, interaction: discord.Interaction):
        async def make():
            return embed("Woof", image=await apis.dog_image())
        await respond_api(interaction, make)

    @app_commands.command(description="An xkcd comic (latest if you leave the number out)")
    @app_commands.describe(number="Comic number")
    async def xkcd(self, interaction: discord.Interaction, number: Optional[app_commands.Range[int, 1, 100000]] = None):
        async def make():
            c = await apis.xkcd(number)
            return embed(f"#{c['num']}: {c['title']}", c["alt"], url=c["url"], image=c["img"])
        await respond_api(interaction, make)

    @app_commands.command(description="Words that rhyme")
    @app_commands.describe(word="The word to rhyme")
    async def rhyme(self, interaction: discord.Interaction, word: app_commands.Range[str, 1, 40]):
        async def make():
            return f"Rhymes with **{word}**: " + ", ".join(await apis.rhymes(word))
        await respond_api(interaction, make)

    @app_commands.command(description="Look up a Bible verse")
    @app_commands.describe(reference="For example: john 3:16")
    async def verse(self, interaction: discord.Interaction, reference: app_commands.Range[str, 3, 60]):
        async def make():
            v = await apis.bible_verse(reference)
            return embed(v["reference"], v["text"], footer=v["translation"])
        await respond_api(interaction, make)


async def setup(bot: commands.Bot):
    await bot.add_cog(Fun(bot))
