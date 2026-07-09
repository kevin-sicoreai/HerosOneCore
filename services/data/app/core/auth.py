"""Request authorization — verify the auth-service JWT and gate writes by role.

Self-contained per service (no shared library): this mirrors the auth service's
HS256 scheme and reads the same ``JWT_SECRET``. Reads (and CORS preflight) stay
open so the UI and service-to-service reads work without a token; writes require
a valid token with write permission; deletes require admin permission.
"""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException, Request, status

_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
_OPEN_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json"}


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


def authorize(request: Request, authorization: str | None = Header(default=None)) -> None:
    """App-wide dependency: open reads; writes need write perm; deletes need admin."""
    method = request.method.upper()
    if method in ("GET", "HEAD", "OPTIONS") or request.url.path in _OPEN_PATHS:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    perms = _decode(authorization.split(" ", 1)[1]).get("perms") or {}
    if method == "DELETE":
        if not perms.get("can_admin"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires admin permission")
    elif not perms.get("can_write"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires write permission")


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def service_token() -> str:
    """Mint a short-lived internal token (admin perms) for service-to-service writes."""
    header = {"alg": "HS256", "typ": "JWT"}
    body = {
        "sub": "svc:data",
        "username": "data-service",
        "roles": ["service"],
        "perms": {"can_read": True, "can_write": True, "can_admin": True},
        "exp": int(time.time()) + 300,
    }
    signing = (
        f"{_b64e(json.dumps(header, separators=(',', ':')).encode())}."
        f"{_b64e(json.dumps(body, separators=(',', ':')).encode())}"
    )
    sig = hmac.new(_SECRET.encode(), signing.encode(), hashlib.sha256).digest()
    return f"{signing}.{_b64e(sig)}"


def service_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {service_token()}"}


def actor_from_authorization(authorization: str | None) -> str:
    """Best-effort actor (username/sub) from a Bearer token; 'anonymous' if absent/invalid."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return "anonymous"
    try:
        payload = _decode(authorization.split(" ", 1)[1])
    except HTTPException:
        return "anonymous"
    return payload.get("username") or payload.get("sub") or "anonymous"
