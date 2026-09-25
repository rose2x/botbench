"""Small helpers shared by the cogs."""
from __future__ import annotations

from typing import Awaitable, Callable, Union

import discord

from .api_client import ApiError

BRAND = 0x5865F2


def embed(title: str, description: str = "", *, url: str | None = None, image: str | None = None,
          thumbnail: str | None = None, color: int = BRAND, footer: str | None = None) -> discord.Embed:
    e = discord.Embed(title=title[:256], description=(description or "")[:4000], url=url, color=color)
    if image:
        e.set_image(url=image)
    if thumbnail:
        e.set_thumbnail(url=thumbnail)
    if footer:
        e.set_footer(text=footer[:2000])
    return e


def clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def friendly_error(exc: Exception) -> str:
    if isinstance(exc, LookupError):
        return str(exc.args[0]) if exc.args else "Nothing found."
    if isinstance(exc, ApiError):
        if exc.status == 404:
            return "Nothing found for that."
        if exc.status == 429:
            return "That service is busy right now. Try again in a moment."
        return "That service is having trouble. Try again later."
    return "Something went wrong on my side."


async def respond_api(interaction: discord.Interaction,
                      make: Callable[[], Awaitable[Union[discord.Embed, str]]], *, ephemeral: bool = False) -> None:
    """Defer, run an API call, then send an embed or a string. Errors become friendly messages."""
    await interaction.response.defer(ephemeral=ephemeral)
    try:
        result = await make()
    except (LookupError, ApiError) as exc:
        await interaction.followup.send(friendly_error(exc), ephemeral=True)
        return
    if isinstance(result, discord.Embed):
        await interaction.followup.send(embed=result)
    else:
        await interaction.followup.send(str(result)[:2000])
