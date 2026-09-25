"""Talk to the Discord REST API directly, with no discord library.

Handles: the Authorization header, a User-Agent, audit-log reasons, per-route rate limits
(from the X-RateLimit-* headers), the global limit, 429 retries and 5xx retries.

    rest = DiscordREST(os.environ["DISCORD_TOKEN"])
    await rest.send_message(channel_id, content="Hello")
    await rest.close()

The bucket handling is simplified: it groups by method + route with the major id (channel,
guild or webhook) kept, which is enough for bots of normal size.
"""
from __future__ import annotations

import asyncio
import json as _json
import re
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Optional

import aiohttp

API_BASE = "https://discord.com/api/v10"
DEFAULT_USER_AGENT = "DiscordBot (https://example.com, 1.0) BotBenchToolkit"


class DiscordAPIError(Exception):
    """A non-2xx response. `code` is Discord's JSON error code (50013 = Missing Permissions)."""

    def __init__(self, status: int, code: Optional[int], message: str, payload: Any = None):
        super().__init__(f"HTTP {status} (code {code}): {message}")
        self.status = status
        self.code = code
        self.message = message
        self.payload = payload


_MAJOR = re.compile(r"^/(?:channels|guilds|webhooks)/[^/]+")


def route_key(method: str, path: str) -> str:
    """Rate-limit key: the method and route, keeping only the major id."""
    m = _MAJOR.match(path)
    major = m.group(0) if m else ""
    rest = re.sub(r"/\d{15,}", "/:id", path[len(major):])
    return f"{method.upper()} {major}{rest}"


def _try_json(text: str) -> Any:
    try:
        return _json.loads(text) if text else None
    except ValueError:
        return None


class DiscordREST:
    def __init__(self, token: str, *, base: str = API_BASE, user_agent: str = DEFAULT_USER_AGENT,
                 session: Optional[aiohttp.ClientSession] = None, max_retries: int = 3):
        self._token = token
        self.base = base.rstrip("/")
        self.user_agent = user_agent
        self.max_retries = max_retries
        self._session = session
        self._own_session = session is None
        self._blocked_until: dict[str, float] = {}
        self._global_until = 0.0
        self._locks: dict[str, asyncio.Lock] = {}

    async def _sess(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30))
        return self._session

    async def close(self) -> None:
        if self._own_session and self._session and not self._session.closed:
            await self._session.close()

    # ------------------------------------------------------------ core request
    async def request(self, method: str, path: str, *, json: Any = None, params: Optional[dict] = None,
                      reason: Optional[str] = None, auth: bool = True) -> Any:
        key = route_key(method, path)
        headers = {"User-Agent": self.user_agent}
        if auth:
            headers["Authorization"] = f"Bot {self._token}"
        if reason:
            headers["X-Audit-Log-Reason"] = urllib.parse.quote(reason, safe=" ")
        lock = self._locks.setdefault(key, asyncio.Lock())

        for attempt in range(self.max_retries + 1):
            async with lock:
                wait = max(self._blocked_until.get(key, 0.0), self._global_until) - time.monotonic()
                if wait > 0:
                    await asyncio.sleep(wait)
                session = await self._sess()
                async with session.request(method, self.base + path, json=json, params=params, headers=headers) as r:
                    text = await r.text()
                    body = _try_json(text)
                    remaining = r.headers.get("X-RateLimit-Remaining")
                    reset_after = r.headers.get("X-RateLimit-Reset-After")
                    if remaining == "0" and reset_after:
                        self._blocked_until[key] = time.monotonic() + float(reset_after)

                    if r.status == 429:
                        info = body if isinstance(body, dict) else {}
                        retry = float(info.get("retry_after", reset_after or 1))
                        if info.get("global") or r.headers.get("X-RateLimit-Scope") == "global":
                            self._global_until = time.monotonic() + retry
                        else:
                            self._blocked_until[key] = time.monotonic() + retry
                        if attempt < self.max_retries:
                            continue
                        raise DiscordAPIError(429, None, "rate limited", body)
                    if r.status >= 500 and attempt < self.max_retries:
                        await asyncio.sleep(1 + attempt)
                        continue
                    if r.status >= 400:
                        info = body if isinstance(body, dict) else {}
                        raise DiscordAPIError(r.status, info.get("code"), info.get("message", text[:200]), body)
                    return body
        raise DiscordAPIError(0, None, "request failed")

    # ------------------------------------------------------------ users and gateway
    async def get_me(self): return await self.request("GET", "/users/@me")
    async def get_user(self, user_id): return await self.request("GET", f"/users/{user_id}")
    async def get_my_guilds(self): return await self.request("GET", "/users/@me/guilds")
    async def get_gateway_bot(self): return await self.request("GET", "/gateway/bot")
    async def create_dm(self, user_id):
        return await self.request("POST", "/users/@me/channels", json={"recipient_id": str(user_id)})

    # ------------------------------------------------------------ messages
    async def send_message(self, channel_id, content: Optional[str] = None, *, embeds: Optional[list] = None,
                           components: Optional[list] = None, reply_to: Optional[str] = None,
                           allowed_mentions: Optional[dict] = None):
        body: dict[str, Any] = {"allowed_mentions": allowed_mentions or {"parse": []}}
        if content is not None: body["content"] = content
        if embeds: body["embeds"] = embeds
        if components: body["components"] = components
        if reply_to: body["message_reference"] = {"message_id": str(reply_to)}
        return await self.request("POST", f"/channels/{channel_id}/messages", json=body)

    async def edit_message(self, channel_id, message_id, **fields):
        return await self.request("PATCH", f"/channels/{channel_id}/messages/{message_id}", json=fields)

    async def delete_message(self, channel_id, message_id, reason=None):
        return await self.request("DELETE", f"/channels/{channel_id}/messages/{message_id}", reason=reason)

    async def get_messages(self, channel_id, limit: int = 50, before=None, after=None):
        params: dict[str, Any] = {"limit": max(1, min(limit, 100))}
        if before: params["before"] = before
        if after: params["after"] = after
        return await self.request("GET", f"/channels/{channel_id}/messages", params=params)

    async def bulk_delete(self, channel_id, message_ids: list, reason=None):
        return await self.request("POST", f"/channels/{channel_id}/messages/bulk-delete",
                                  json={"messages": [str(i) for i in message_ids]}, reason=reason)

    async def add_reaction(self, channel_id, message_id, emoji: str):
        e = urllib.parse.quote(emoji, safe="")     # unicode emoji, or name:id for custom ones
        return await self.request("PUT", f"/channels/{channel_id}/messages/{message_id}/reactions/{e}/@me")

    async def start_thread(self, channel_id, message_id, name: str, auto_archive_minutes: int = 1440):
        return await self.request("POST", f"/channels/{channel_id}/messages/{message_id}/threads",
                                  json={"name": name, "auto_archive_duration": auto_archive_minutes})

    # ------------------------------------------------------------ guilds and members
    async def get_guild(self, guild_id): return await self.request("GET", f"/guilds/{guild_id}")
    async def get_channels(self, guild_id): return await self.request("GET", f"/guilds/{guild_id}/channels")
    async def get_roles(self, guild_id): return await self.request("GET", f"/guilds/{guild_id}/roles")
    async def get_member(self, guild_id, user_id): return await self.request("GET", f"/guilds/{guild_id}/members/{user_id}")
    async def list_members(self, guild_id, limit: int = 100, after=None):
        params: dict[str, Any] = {"limit": limit}
        if after: params["after"] = after
        return await self.request("GET", f"/guilds/{guild_id}/members", params=params)
    async def add_role(self, guild_id, user_id, role_id, reason=None):
        return await self.request("PUT", f"/guilds/{guild_id}/members/{user_id}/roles/{role_id}", reason=reason)
    async def remove_role(self, guild_id, user_id, role_id, reason=None):
        return await self.request("DELETE", f"/guilds/{guild_id}/members/{user_id}/roles/{role_id}", reason=reason)
    async def kick(self, guild_id, user_id, reason=None):
        return await self.request("DELETE", f"/guilds/{guild_id}/members/{user_id}", reason=reason)
    async def ban(self, guild_id, user_id, reason=None, delete_message_seconds: int = 0):
        return await self.request("PUT", f"/guilds/{guild_id}/bans/{user_id}",
                                  json={"delete_message_seconds": delete_message_seconds}, reason=reason)
    async def unban(self, guild_id, user_id, reason=None):
        return await self.request("DELETE", f"/guilds/{guild_id}/bans/{user_id}", reason=reason)
    async def timeout_member(self, guild_id, user_id, until: Optional[datetime], reason=None):
        """Time a member out until a datetime (aware, or UTC assumed). `None` removes the timeout."""
        value = None
        if until is not None:
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
            value = until.astimezone(timezone.utc).isoformat()
        return await self.request("PATCH", f"/guilds/{guild_id}/members/{user_id}",
                                  json={"communication_disabled_until": value}, reason=reason)
    async def create_invite(self, channel_id, max_age: int = 86400, max_uses: int = 0):
        return await self.request("POST", f"/channels/{channel_id}/invites", json={"max_age": max_age, "max_uses": max_uses})
    async def get_audit_log(self, guild_id, limit: int = 50, action_type: Optional[int] = None):
        params: dict[str, Any] = {"limit": limit}
        if action_type is not None: params["action_type"] = action_type
        return await self.request("GET", f"/guilds/{guild_id}/audit-logs", params=params)

    # ------------------------------------------------------------ slash commands and interactions
    async def list_commands(self, app_id, guild_id=None):
        path = f"/applications/{app_id}/guilds/{guild_id}/commands" if guild_id else f"/applications/{app_id}/commands"
        return await self.request("GET", path)
    async def register_commands(self, app_id, commands: list[dict], guild_id=None):
        """Replace ALL commands (global, or for one guild). Guild commands appear instantly."""
        path = f"/applications/{app_id}/guilds/{guild_id}/commands" if guild_id else f"/applications/{app_id}/commands"
        return await self.request("PUT", path, json=commands)
    async def delete_command(self, app_id, command_id, guild_id=None):
        base = f"/applications/{app_id}" + (f"/guilds/{guild_id}" if guild_id else "")
        return await self.request("DELETE", f"{base}/commands/{command_id}")
    async def interaction_respond(self, interaction_id, token, content: Optional[str] = None, *, type: int = 4, **data):
        """type 4 = message, 5 = "thinking...", 7 = edit the component's message, 9 = modal."""
        body: dict[str, Any] = {"type": type}
        payload = dict(data)
        if content is not None: payload["content"] = content
        if payload: body["data"] = payload
        return await self.request("POST", f"/interactions/{interaction_id}/{token}/callback", json=body, auth=False)
    async def edit_original(self, app_id, token, **fields):
        return await self.request("PATCH", f"/webhooks/{app_id}/{token}/messages/@original", json=fields, auth=False)
    async def followup(self, app_id, token, content: Optional[str] = None, **fields):
        if content is not None: fields["content"] = content
        return await self.request("POST", f"/webhooks/{app_id}/{token}", json=fields, auth=False)

    # ------------------------------------------------------------ webhooks (no bot token needed)
    async def webhook_execute(self, webhook_id, webhook_token, content: Optional[str] = None, *,
                              username: Optional[str] = None, avatar_url: Optional[str] = None,
                              embeds: Optional[list] = None, wait: bool = False):
        body: dict[str, Any] = {"allowed_mentions": {"parse": []}}
        if content is not None: body["content"] = content
        if username: body["username"] = username
        if avatar_url: body["avatar_url"] = avatar_url
        if embeds: body["embeds"] = embeds
        return await self.request("POST", f"/webhooks/{webhook_id}/{webhook_token}",
                                  json=body, params={"wait": "true"} if wait else None, auth=False)
