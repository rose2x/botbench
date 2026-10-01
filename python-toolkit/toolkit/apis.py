"""Ready-made wrappers for free APIs. Every function is async and returns plain dicts/strings.

    from toolkit import apis
    text = await apis.joke()
    w = await apis.weather_for_city("Tokyo")

They raise `LookupError` when the API works but finds nothing, and `ApiError`
when the API itself fails. See toolkit/directory.py for 100+ more APIs to wrap.
"""
from __future__ import annotations

import html
import re
import urllib.parse
from typing import Any, Optional

from .api_client import ApiClient, ApiError

client = ApiClient()


def _q(value: str) -> str:
    """URL-encode one path segment."""
    return urllib.parse.quote(str(value).strip(), safe="")


# ------------------------------------------------------------------ fun
JOKE_CATEGORIES = {"Any", "Programming", "Misc", "Pun", "Spooky", "Christmas"}

async def joke(category: str = "Any") -> str:
    """JokeAPI, with the safe-mode filter on."""
    category = category if category in JOKE_CATEGORIES else "Any"
    d = await client.get_json(f"https://v2.jokeapi.dev/joke/{category}?safe-mode", ttl=0)
    if d.get("error"):
        raise LookupError("No joke found.")
    return d["joke"] if d["type"] == "single" else f"{d['setup']}\n\n||{d['delivery']}||"

async def dad_joke() -> str:
    d = await client.get_json("https://icanhazdadjoke.com/", headers={"Accept": "application/json"}, ttl=0)
    return d["joke"]

async def chuck_norris() -> str:
    d = await client.get_json("https://api.chucknorris.io/jokes/random", ttl=0)
    return d["value"]

async def cat_fact() -> str:
    d = await client.get_json("https://catfact.ninja/fact", ttl=0)
    return d["fact"]

async def useless_fact() -> str:
    d = await client.get_json("https://uselessfacts.jsph.pl/api/v2/facts/random", params={"language": "en"}, ttl=0)
    return d["text"]

async def advice() -> str:
    d = await client.get_json("https://api.adviceslip.com/advice", ttl=0)
    return d["slip"]["advice"]

async def dog_image() -> str:
    d = await client.get_json("https://dog.ceo/api/breeds/image/random", ttl=0)
    return d["message"]

async def xkcd(num: Optional[int] = None) -> dict:
    url = f"https://xkcd.com/{int(num)}/info.0.json" if num else "https://xkcd.com/info.0.json"
    d = await client.get_json(url, ttl=300)
    return {"num": d["num"], "title": d["title"], "img": d["img"], "alt": d["alt"],
            "url": f"https://xkcd.com/{d['num']}/"}

async def rhymes(word: str, limit: int = 12) -> list[str]:
    d = await client.get_json("https://api.datamuse.com/words", params={"rel_rhy": word, "max": limit})
    if not d:
        raise LookupError(f"No rhymes found for {word}.")
    return [x["word"] for x in d]

async def bible_verse(reference: str) -> dict:
    d = await client.get_json(f"https://bible-api.com/{_q(reference)}")
    return {"reference": d["reference"], "text": d["text"].strip(), "translation": d.get("translation_name", "")}


# ------------------------------------------------------------------ weather and places
WMO_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light rain showers", 81: "Rain showers", 82: "Violent rain showers",
    85: "Light snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}

async def geocode(name: str) -> dict:
    d = await client.get_json("https://geocoding-api.open-meteo.com/v1/search",
                              params={"name": name, "count": 1, "language": "en", "format": "json"}, ttl=3600)
    if not d.get("results"):
        raise LookupError(f"Couldn't find a place called {name}.")
    r = d["results"][0]
    return {"name": r["name"], "country": r.get("country", ""), "region": r.get("admin1", ""),
            "lat": r["latitude"], "lon": r["longitude"]}

async def weather(lat: float, lon: float) -> dict:
    d = await client.get_json("https://api.open-meteo.com/v1/forecast", params={
        "latitude": lat, "longitude": lon,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"}, ttl=300)
    c = d["current"]
    return {"temp_c": c["temperature_2m"], "feels_c": c["apparent_temperature"],
            "humidity": c["relative_humidity_2m"], "wind_kmh": c["wind_speed_10m"],
            "summary": WMO_CODES.get(c["weather_code"], "Unknown")}

async def weather_for_city(city: str) -> dict:
    place = await geocode(city)
    return {**place, **await weather(place["lat"], place["lon"])}

async def country(name: str) -> dict:
    d = await client.get_json(f"https://restcountries.com/v3.1/name/{_q(name)}",
                              params={"fields": "name,capital,population,region,flags,currencies,languages"}, ttl=3600)
    c = d[0]
    return {"name": c["name"]["common"], "capital": ", ".join(c.get("capital", [])) or "n/a",
            "population": c["population"], "region": c["region"], "flag": c["flags"]["png"],
            "currencies": ", ".join(f"{v['name']} ({k})" for k, v in c.get("currencies", {}).items()) or "n/a",
            "languages": ", ".join(c.get("languages", {}).values()) or "n/a"}

async def holidays(country_code: str, year: int) -> list[dict]:
    d = await client.get_json(f"https://date.nager.at/api/v3/PublicHolidays/{int(year)}/{_q(country_code.upper())}", ttl=86400)
    return [{"date": h["date"], "name": h["name"], "local_name": h["localName"]} for h in d]

async def iss_position() -> dict:
    d = await client.get_json("https://api.wheretheiss.at/v1/satellites/25544", ttl=5)
    return {"lat": d["latitude"], "lon": d["longitude"], "alt_km": d["altitude"], "speed_kmh": d["velocity"],
            "visibility": d["visibility"]}


# ------------------------------------------------------------------ knowledge
async def wiki_summary(title: str) -> dict:
    d = await client.get_json(f"https://en.wikipedia.org/api/rest_v1/page/summary/{_q(title.replace(' ', '_'))}", ttl=3600)
    if d.get("type") == "disambiguation":
        raise LookupError(f"'{title}' could mean many things. Be more specific.")
    return {"title": d["title"], "extract": d.get("extract", ""),
            "url": d.get("content_urls", {}).get("desktop", {}).get("page", ""),
            "image": (d.get("thumbnail") or {}).get("source")}

async def define(word: str) -> dict:
    try:
        d = await client.get_json(f"https://api.dictionaryapi.dev/api/v2/entries/en/{_q(word)}", ttl=86400)
    except ApiError as e:
        if e.status == 404:
            raise LookupError(f"No definition found for {word}.") from e
        raise
    entry = d[0]
    meanings = []
    for m in entry["meanings"][:3]:
        first = m["definitions"][0]
        meanings.append({"part": m["partOfSpeech"], "definition": first["definition"], "example": first.get("example")})
    return {"word": entry["word"], "phonetic": entry.get("phonetic", ""), "meanings": meanings}

async def book_search(query: str, limit: int = 3) -> list[dict]:
    d = await client.get_json("https://openlibrary.org/search.json", params={"q": query, "limit": limit}, ttl=3600)
    if not d["docs"]:
        raise LookupError("No books found.")
    return [{"title": b["title"], "authors": ", ".join(b.get("author_name", [])[:2]) or "Unknown",
             "year": b.get("first_publish_year"), "url": f"https://openlibrary.org{b['key']}"} for b in d["docs"]]


# ------------------------------------------------------------------ money
async def crypto_price(coin_id: str = "bitcoin", vs: str = "usd") -> dict:
    coin_id, vs = coin_id.lower().strip(), vs.lower().strip()
    d = await client.get_json("https://api.coingecko.com/api/v3/simple/price",
                              params={"ids": coin_id, "vs_currencies": vs, "include_24hr_change": "true"}, ttl=60)
    if coin_id not in d:
        raise LookupError(f"Unknown coin id '{coin_id}'. Use CoinGecko ids like bitcoin or ethereum.")
    return {"coin": coin_id, "vs": vs, "price": d[coin_id][vs], "change_24h": d[coin_id].get(f"{vs}_24h_change")}

async def exchange_rate(base: str, target: str) -> float:
    d = await client.get_json(f"https://open.er-api.com/v6/latest/{_q(base.upper())}", ttl=3600)
    if d.get("result") != "success" or target.upper() not in d["rates"]:
        raise LookupError("Unknown currency code.")
    return d["rates"][target.upper()]


# ------------------------------------------------------------------ dev
_REPO = re.compile(r"^[\w.-]+/[\w.-]+$")

async def github_repo(full_name: str, token: Optional[str] = None) -> dict:
    if not _REPO.match(full_name):
        raise LookupError("Use the form owner/repo, for example discord/discord-api-docs.")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    d = await client.get_json(f"https://api.github.com/repos/{full_name}", headers=headers, ttl=300)
    return {"name": d["full_name"], "description": d.get("description") or "", "stars": d["stargazers_count"],
            "forks": d["forks_count"], "issues": d["open_issues_count"], "language": d.get("language") or "n/a",
            "license": (d.get("license") or {}).get("name", "none"), "url": d["html_url"], "pushed_at": d["pushed_at"]}

async def pypi_package(name: str) -> dict:
    d = await client.get_json(f"https://pypi.org/pypi/{_q(name)}/json", ttl=600)
    i = d["info"]
    return {"name": i["name"], "version": i["version"], "summary": i.get("summary") or "",
            "python": i.get("requires_python") or "n/a", "url": i.get("package_url") or f"https://pypi.org/project/{name}/"}

async def npm_package(name: str) -> dict:
    d = await client.get_json(f"https://registry.npmjs.org/{_q(name)}/latest", ttl=600)
    return {"name": d["name"], "version": d["version"], "description": d.get("description") or "",
            "license": d.get("license") or "n/a", "url": f"https://www.npmjs.com/package/{d['name']}"}

async def hacker_news(count: int = 5) -> list[dict]:
    ids = await client.get_json("https://hacker-news.firebaseio.com/v0/topstories.json", ttl=300)
    items = []
    for i in ids[: max(1, min(count, 10))]:
        it = await client.get_json(f"https://hacker-news.firebaseio.com/v0/item/{i}.json", ttl=300)
        items.append({"title": it["title"], "score": it["score"], "by": it["by"],
                      "url": it.get("url") or f"https://news.ycombinator.com/item?id={i}"})
    return items

async def shorten_url(url: str) -> str:
    d = await client.get_json("https://is.gd/create.php", params={"format": "json", "url": url}, ttl=0)
    if "shorturl" not in d:
        raise LookupError(d.get("errormessage", "Couldn't shorten that link."))
    return d["shorturl"]

def qr_code_url(data: str, size: int = 300) -> str:
    """Build a QR image URL. No request is made. Use it as an embed image."""
    return f"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={urllib.parse.quote(data)}"


# ------------------------------------------------------------------ games
async def trivia() -> dict:
    """One multiple-choice question. Open Trivia DB allows one request per 5 seconds per IP."""
    d = await client.get_json("https://opentdb.com/api.php", params={"amount": 1, "type": "multiple"}, ttl=0)
    if d["response_code"] == 5:
        raise ApiError(429, "opentdb.com", "rate limited")
    if d["response_code"] != 0:
        raise LookupError("No trivia question available.")
    q = d["results"][0]
    return {"category": html.unescape(q["category"]), "difficulty": q["difficulty"],
            "question": html.unescape(q["question"]), "correct": html.unescape(q["correct_answer"]),
            "incorrect": [html.unescape(x) for x in q["incorrect_answers"]]}

async def pokemon(name: str) -> dict:
    d = await client.get_json(f"https://pokeapi.co/api/v2/pokemon/{_q(name.lower())}", ttl=86400)
    return {"id": d["id"], "name": d["name"].title(), "height_m": d["height"] / 10, "weight_kg": d["weight"] / 10,
            "types": [t["type"]["name"] for t in d["types"]], "abilities": [a["ability"]["name"] for a in d["abilities"]],
            "stats": {s["stat"]["name"]: s["base_stat"] for s in d["stats"]}, "sprite": d["sprites"]["front_default"]}

async def scryfall_card(name: str) -> dict:
    d = await client.get_json("https://api.scryfall.com/cards/named", params={"fuzzy": name},
                              headers={"Accept": "application/json"}, ttl=3600)
    face = d.get("card_faces", [{}])[0]
    image = (d.get("image_uris") or face.get("image_uris") or {}).get("normal")
    return {"name": d["name"], "mana": d.get("mana_cost") or face.get("mana_cost", ""), "type": d["type_line"],
            "text": d.get("oracle_text") or face.get("oracle_text", ""), "set": d["set_name"],
            "image": image, "url": d["scryfall_uri"]}

async def dnd_spell(name: str) -> dict:
    index = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    d = await client.get_json(f"https://www.dnd5eapi.co/api/spells/{index}", ttl=86400)
    return {"name": d["name"], "level": d["level"], "school": d["school"]["name"], "range": d["range"],
            "casting_time": d["casting_time"], "duration": d["duration"], "text": " ".join(d["desc"])}

async def minecraft_server(host: str) -> dict:
    d = await client.get_json(f"https://api.mcsrvstat.us/3/{_q(host)}", ttl=30)
    players = d.get("players", {})
    return {"online": bool(d.get("online")), "host": host, "version": d.get("version", "n/a"),
            "players": players.get("online", 0), "max": players.get("max", 0),
            "motd": " ".join(d.get("motd", {}).get("clean", []))}

async def minecraft_uuid(username: str) -> dict:
    try:
        d = await client.get_json(f"https://api.mojang.com/users/profiles/minecraft/{_q(username)}", ttl=3600)
    except ApiError as e:
        if e.status in (204, 404):
            raise LookupError("No Minecraft player with that name.") from e
        raise
    return {"name": d["name"], "uuid": d["id"]}

async def chess_profile(username: str) -> dict:
    u = _q(username.lower())
    p = await client.get_json(f"https://api.chess.com/pub/player/{u}", ttl=600)
    s = await client.get_json(f"https://api.chess.com/pub/player/{u}/stats", ttl=600)
    ratings = {k.replace("chess_", ""): v["last"]["rating"] for k, v in s.items()
               if k in ("chess_rapid", "chess_blitz", "chess_bullet") and "last" in v}
    return {"username": p["username"], "title": p.get("title"), "followers": p.get("followers", 0),
            "url": p["url"], "avatar": p.get("avatar"), "ratings": ratings}


# ------------------------------------------------------------------ media
async def anime_search(query: str) -> dict:
    d = await client.get_json("https://api.jikan.moe/v4/anime", params={"q": query, "limit": 1}, ttl=3600)
    if not d["data"]:
        raise LookupError("No anime found.")
    a = d["data"][0]
    return {"title": a["title"], "score": a.get("score"), "episodes": a.get("episodes"), "status": a.get("status"),
            "year": a.get("year"), "synopsis": a.get("synopsis") or "", "url": a["url"],
            "image": a["images"]["jpg"]["image_url"]}

async def tv_show(query: str) -> dict:
    try:
        d = await client.get_json("https://api.tvmaze.com/singlesearch/shows", params={"q": query}, ttl=3600)
    except ApiError as e:
        if e.status == 404:
            raise LookupError("No show found.") from e
        raise
    summary = re.sub(r"<[^>]+>", "", d.get("summary") or "")
    return {"name": d["name"], "rating": (d.get("rating") or {}).get("average"), "genres": d.get("genres", []),
            "premiered": d.get("premiered"), "status": d.get("status"), "summary": html.unescape(summary),
            "url": d["url"], "image": (d.get("image") or {}).get("medium")}

async def music_search(term: str, limit: int = 3) -> list[dict]:
    d = await client.get_json("https://itunes.apple.com/search", params={"term": term, "limit": limit, "media": "music"}, ttl=3600)
    if not d["results"]:
        raise LookupError("No songs found.")
    return [{"track": r.get("trackName"), "artist": r.get("artistName"), "album": r.get("collectionName"),
             "url": r.get("trackViewUrl"), "art": r.get("artworkUrl100")} for r in d["results"]]

def _recipe(d: dict, name_key: str, prefix: str) -> dict:
    items = []
    for n in range(1, 21):
        ing = (d.get(f"strIngredient{n}") or "").strip()
        if ing:
            items.append(f"{(d.get(f'strMeasure{n}') or '').strip()} {ing}".strip())
    return {"name": d[name_key], "instructions": d.get("strInstructions") or "", "ingredients": items,
            "image": d.get(f"str{prefix}Thumb")}

async def random_cocktail() -> dict:
    d = await client.get_json("https://www.thecocktaildb.com/api/json/v1/1/random.php", ttl=0)
    return _recipe(d["drinks"][0], "strDrink", "Drink")

async def random_meal() -> dict:
    d = await client.get_json("https://www.themealdb.com/api/json/v1/1/random.php", ttl=0)
    m = d["meals"][0]
    return {**_recipe(m, "strMeal", "Meal"), "category": m.get("strCategory"), "area": m.get("strArea"),
            "source": m.get("strSource")}

async def nasa_apod(api_key: str = "DEMO_KEY") -> dict:
    d = await client.get_json("https://api.nasa.gov/planetary/apod", params={"api_key": api_key}, ttl=3600)
    return {"title": d["title"], "explanation": d["explanation"], "date": d["date"],
            "media_type": d["media_type"], "url": d.get("hdurl") or d["url"]}
