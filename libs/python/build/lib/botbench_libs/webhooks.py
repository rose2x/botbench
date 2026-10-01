"""Verify webhook signatures (HMAC-SHA256) from GitHub, Stripe, Twitch EventSub, or anything similar.

Always verify against the RAW request body bytes, before parsing JSON. Comparison is constant-time.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional, Union

Data = Union[str, bytes]


def _b(x: Data) -> bytes:
    return x if isinstance(x, bytes) else x.encode("utf-8")


def hmac_sha256_hex(secret: Data, message: Data) -> str:
    return hmac.new(_b(secret), _b(message), hashlib.sha256).hexdigest()


def verify_hmac(secret: Data, body: Data, signature: Optional[str], prefix: str = "sha256=") -> bool:
    """True if `signature` equals prefix + HMAC-SHA256(secret, body)."""
    if not signature:
        return False
    return hmac.compare_digest((prefix + hmac_sha256_hex(secret, body)).encode(), signature.encode())


def verify_github(secret: Data, body: Data, signature_header: Optional[str]) -> bool:
    """Header: X-Hub-Signature-256."""
    return verify_hmac(secret, body, signature_header, "sha256=")


def verify_twitch(secret: Data, message_id: str, timestamp: str, body: Data, signature_header: Optional[str]) -> bool:
    """Headers: Twitch-Eventsub-Message-Id, -Message-Timestamp, -Message-Signature. Signs id + timestamp + body."""
    return verify_hmac(secret, _b(message_id) + _b(timestamp) + _b(body), signature_header, "sha256=")


def verify_stripe(secret: Data, signature_header: Optional[str], body: Data, tolerance: int = 300,
                  now: Optional[float] = None) -> bool:
    """Header: Stripe-Signature ("t=timestamp,v1=hex[,v1=hex]"). Rejects timestamps older than `tolerance` seconds."""
    if not signature_header:
        return False
    parts = [p.split("=", 1) for p in signature_header.split(",") if "=" in p]
    ts = next((v for k, v in parts if k.strip() == "t"), None)
    sigs = [v for k, v in parts if k.strip() == "v1"]
    if ts is None or not sigs or not ts.isdigit():
        return False
    if abs((time.time() if now is None else now) - int(ts)) > tolerance:
        return False
    expected = hmac_sha256_hex(secret, ts.encode() + b"." + _b(body))
    return any(hmac.compare_digest(expected.encode(), s.encode()) for s in sigs)
