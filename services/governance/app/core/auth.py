"""Token verification for the audit-ingest endpoint (shared JWT_SECRET, HS256).

Self-contained (no shared library). Governance's read endpoints stay open; only
the audit-ingest endpoint requires a valid signed token — services post their
internal service token here.
"""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException, status

_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")


def _b64d(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def _decode(token: str) -> dict:
    try:
        header_seg, payload_seg, sig_seg = token.split(".")
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed token") from exc
    signing = f"{header_seg}.{payload_seg}"
    expected = (
        base64.urlsafe_b64encode(hmac.new(_SECRET.encode(), signing.encode(), hashlib.sha256).digest())
        .rstrip(b"=")
        .decode()
    )
    if not hmac.compare_digest(expected, sig_seg):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad token signature")
    payload = json.loads(_b64d(payload_seg))
    if payload.get("exp", 0) < int(time.time()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    return payload


def require_token(authorization: str | None = Header(default=None)) -> None:
    """Dependency: require any validly-signed token (services send a service token)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    _decode(authorization.split(" ", 1)[1])
