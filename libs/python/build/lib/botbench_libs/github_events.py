"""Turn GitHub webhook payloads into Discord embeds (as plain dicts you can send with any client).

    embed = github_event_to_embed(request.headers["X-GitHub-Event"], payload)
    if embed: post_to_discord({"embeds": [embed]})

Handles: ping, push, pull_request, issues, issue_comment, release, star, fork. Returns None for events
that aren't worth a message (for example "labeled"). Verify the signature first (see webhooks.py).
(Discord webhooks also accept GitHub payloads directly if you add /github to the webhook URL.)
"""
from __future__ import annotations

from typing import Optional

from .textfmt import truncate

GREEN, PURPLE, RED, BLUE, BRAND = 0x2ECC71, 0x8957E5, 0xE74C3C, 0x3498DB, 0x5865F2


def _first_line(text: str, limit: int = 72) -> str:
    return truncate((text or "").strip().split("\n")[0], limit)


def _embed(title, url=None, description=None, color=BRAND, author=None, footer=None) -> dict:
    e = {"title": truncate(title, 256), "color": color}
    if url:
        e["url"] = url
    if description:
        e["description"] = description
    if author:
        e["author"] = {"name": author}
    if footer:
        e["footer"] = {"text": footer}
    return e


def github_event_to_embed(event: str, p: dict) -> Optional[dict]:
    repo = (p.get("repository") or {}).get("full_name", "")
    sender = (p.get("sender") or {}).get("login")
    action = p.get("action")

    if event == "ping":
        return _embed("Webhook connected", description=p.get("zen"), color=BLUE, footer=repo or None)

    if event == "push":
        ref = p.get("ref", "")
        branch = ref.replace("refs/heads/", "", 1).replace("refs/tags/", "", 1)
        if p.get("deleted"):
            return _embed(f"[{repo}] Deleted {branch}", color=RED, author=sender)
        commits = p.get("commits") or []
        if not commits:
            return None
        lines = [f"[`{c['id'][:7]}`]({c['url']}) {_first_line(c['message'])} - {(c.get('author') or {}).get('name', '?')}" for c in commits[:5]]
        if len(commits) > 5:
            lines.append(f"...and {len(commits) - 5} more")
        title = f"[{repo}:{branch}] {len(commits)} new commit{'' if len(commits) == 1 else 's'}"
        return _embed(title, p.get("compare"), "\n".join(lines), BRAND, (p.get("pusher") or {}).get("name") or sender)

    if event == "pull_request":
        pr = p["pull_request"]
        state = {"opened": "opened", "reopened": "reopened", "ready_for_review": "ready for review"}.get(action)
        if action == "closed":
            state = "merged" if pr.get("merged") else "closed"
        if not state:
            return None
        color = {"merged": PURPLE, "closed": RED}.get(state, GREEN)
        foot = f"{repo} • {pr['head']['ref']} → {pr['base']['ref']}"
        return _embed(f"[{repo}] Pull request {state}: #{pr['number']} {pr['title']}", pr["html_url"],
                      truncate(pr.get("body") or "", 300) or None, color, (pr.get("user") or {}).get("login"), foot)

    if event == "issues":
        if action not in ("opened", "closed", "reopened"):
            return None
        i = p["issue"]
        return _embed(f"[{repo}] Issue {action}: #{i['number']} {i['title']}", i["html_url"],
                      truncate(i.get("body") or "", 300) or None, RED if action == "closed" else GREEN, (i.get("user") or {}).get("login"))

    if event == "issue_comment":
        if action != "created":
            return None
        i, c = p["issue"], p["comment"]
        return _embed(f"[{repo}] New comment on #{i['number']}: {i['title']}", c["html_url"], truncate(c.get("body") or "", 300), BRAND, (c.get("user") or {}).get("login"))

    if event == "release":
        if action != "published":
            return None
        r = p["release"]
        label = "Pre-release" if r.get("prerelease") else "Released"
        return _embed(f"[{repo}] {label} {r.get('name') or r['tag_name']}", r["html_url"], truncate(r.get("body") or "", 500) or None, GREEN, (r.get("author") or {}).get("login"))

    if event == "star":
        if action != "created":
            return None
        return _embed(f"[{repo}] New star", description=f"{sender} starred it. Total: {(p.get('repository') or {}).get('stargazers_count', '?')}", color=BRAND)

    if event == "fork":
        f = p["forkee"]
        return _embed(f"[{repo}] Forked", f["html_url"], f["full_name"], BRAND, sender)

    return None
