"""Caller identity, resolved against the auth service.

Drafts are scoped per user: requests carry the frontend's Bearer token, which
is validated via the auth service /me endpoint. Requests without a (valid)
token fall back to the shared anonymous scope (owner_id NULL) so the service
still works standalone in dev.
"""

import httpx
from fastapi import Header

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("auth")


def current_user_id(authorization: str | None = Header(default=None)) -> str | None:
    """FastAPI dependency: the caller's user id, or None for anonymous."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        resp = httpx.get(
            f"{settings.auth_api_url.rstrip('/')}/me",
            headers={"Authorization": authorization},
            timeout=5.0,
        )
        if resp.status_code != 200:
            return None
        return resp.json().get("id")
    except httpx.HTTPError:
        log.warning("auth service unreachable; treating caller as anonymous")
        return None
