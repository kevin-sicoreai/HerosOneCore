"""Token helpers — decode the auth-service JWT and mint an internal service token.

Self-contained per service (no shared library): this mirrors the auth service's
HS256 scheme and reads the same ``JWT_SECRET``. Analysis has no write endpoints
to gate, so there is no app-wide ``authorize`` dependency here; these helpers
back the /analyze masking decision (``perms_from_authorization``) and the audit
trail (``actor_from_authorization`` + ``service_headers``). Everything is
best-effort and fail-safe: a missing or malformed token yields empty perms /
"anonymous" rather than raising, so reads never break.
"""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import HTTPException, status

_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")


def _b64d(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _decode(token: str) -> dict:
    try:
        header_seg, payload_seg, sig_seg = token.split(".")
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed token") from exc
    signing = f"{header_seg}.{payload_seg}"
    expected = (
        base64.urlsafe_b64encode(
            hmac.new(_SECRET.encode(), signing.encode(), hashlib.sha256).digest()
        )
        .rstrip(b"=")
        .decode()
    )
    if not hmac.compare_digest(expected, sig_seg):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad token signature")
    payload = json.loads(_b64d(payload_seg))
    if payload.get("exp", 0) < int(time.time()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    return payload


def service_token() -> str:
    """Mint a short-lived internal token (admin perms) for service-to-service posts."""
    header = {"alg": "HS256", "typ": "JWT"}
    body = {
        "sub": "svc:analysis",
        "username": "analysis-service",
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


def perms_from_authorization(authorization: str | None) -> dict:
    """Best-effort perms dict ({can_read, can_write, can_admin}) from a Bearer token; {} if absent/invalid."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return {}
    try:
        payload = _decode(authorization.split(" ", 1)[1])
    except HTTPException:
        return {}
    return payload.get("perms") or {}
