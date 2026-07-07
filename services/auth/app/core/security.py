"""Password hashing (PBKDF2) and JWT (HS256) — standard library only."""

import base64
import hashlib
import hmac
import json
import secrets
import time

from app.core.config import settings

_ITERATIONS = 100_000


# --- passwords ---
def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS).hex()
    return digest, salt


def verify_password(password: str, digest: str, salt: str) -> bool:
    calc, _ = hash_password(password, salt)
    return hmac.compare_digest(calc, digest)


# --- JWT (HS256) ---
def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def encode_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    body = dict(payload)
    body.setdefault("exp", int(time.time()) + settings.jwt_expire_minutes * 60)
    signing = f"{_b64e(json.dumps(header, separators=(',', ':')).encode())}." \
              f"{_b64e(json.dumps(body, separators=(',', ':')).encode())}"
    sig = hmac.new(settings.jwt_secret.encode(), signing.encode(), hashlib.sha256).digest()
    return f"{signing}.{_b64e(sig)}"


class JWTError(ValueError):
    pass


def decode_jwt(token: str) -> dict:
    try:
        header_seg, payload_seg, sig_seg = token.split(".")
    except ValueError as exc:
        raise JWTError("malformed token") from exc
    signing = f"{header_seg}.{payload_seg}"
    expected = _b64e(hmac.new(settings.jwt_secret.encode(), signing.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, sig_seg):
        raise JWTError("bad signature")
    payload = json.loads(_b64d(payload_seg))
    if "exp" in payload and payload["exp"] < int(time.time()):
        raise JWTError("token expired")
    return payload
