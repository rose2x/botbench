"""Slash commands over HTTP: no gateway, no always-on connection. Good for serverless.

Needs:  pip install flask pynacl

Set "Interactions Endpoint URL" in the Developer Portal to https://your.host/interactions.
Discord sends a signed POST for every command, and checks that you reject bad signatures.

    app = create_app(os.environ["DISCORD_PUBLIC_KEY"], {"ping": lambda data: message("Pong")})
"""
from __future__ import annotations

from typing import Any, Callable

from flask import Flask, abort, jsonify, request
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

PING, APPLICATION_COMMAND, MESSAGE_COMPONENT, AUTOCOMPLETE, MODAL_SUBMIT = 1, 2, 3, 4, 5
PONG, CHANNEL_MESSAGE, DEFERRED_MESSAGE, UPDATE_MESSAGE = 1, 4, 5, 7
EPHEMERAL = 1 << 6


def verify_signature(public_key_hex: str, signature_hex: str, timestamp: str, body: bytes) -> bool:
    try:
        VerifyKey(bytes.fromhex(public_key_hex)).verify(timestamp.encode() + body, bytes.fromhex(signature_hex))
        return True
    except (BadSignatureError, ValueError):
        return False


def message(content: str, *, ephemeral: bool = False, **extra: Any) -> dict:
    """Build a reply payload for a command handler to return."""
    data = {"content": content, **extra}
    if ephemeral:
        data["flags"] = EPHEMERAL
    return {"type": CHANNEL_MESSAGE, "data": data}


def create_app(public_key: str, commands: dict[str, Callable[[dict], dict]]) -> Flask:
    """`commands` maps a slash command name to a function(interaction_data) -> reply dict."""
    app = Flask(__name__)

    @app.post("/interactions")
    def interactions():
        sig = request.headers.get("X-Signature-Ed25519", "")
        ts = request.headers.get("X-Signature-Timestamp", "")
        if not verify_signature(public_key, sig, ts, request.get_data()):
            abort(401, "invalid request signature")
        data = request.get_json()
        if data["type"] == PING:
            return jsonify({"type": PONG})
        if data["type"] == APPLICATION_COMMAND:
            handler = commands.get(data["data"]["name"])
            if handler:
                return jsonify(handler(data))
        return jsonify(message("Unknown command", ephemeral=True))

    return app
