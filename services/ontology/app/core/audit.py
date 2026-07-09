"""Emit audit events to the governance service.

Fire-and-forget: never blocks or fails the request. Writes are reported from the
HTTP middleware (:func:`emit_audit`); sensitive-column reads are reported from the
endpoints (:func:`emit_sensitive_read`). The actor is read from the caller's Bearer
token; every post carries this service's internal service token.
"""

import os
import threading

import httpx
from fastapi import Request, Response

from app.core.auth import actor_from_authorization, service_headers

_GOVERNANCE_URL = os.environ.get("GOVERNANCE_API_URL", "http://127.0.0.1:8004")
_SOURCE = "ontology"
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_SKIP = {"/", "/health", "/docs", "/redoc", "/openapi.json"}


def _post_event(payload: dict) -> None:
    """POST one audit event; best-effort, swallow every error. Runs in a daemon thread."""
    try:
        httpx.post(
            f"{_GOVERNANCE_URL}/audit-events", json=payload, headers=service_headers(), timeout=5
        )
    except Exception:  # noqa: BLE001 - audit is best-effort
        pass


def _dispatch(payload: dict) -> None:
    """Fire-and-forget the post in a daemon thread so sync and async callers never block."""
    threading.Thread(target=_post_event, args=(payload,), daemon=True).start()


async def emit_audit(request: Request, response: Response) -> None:
    if (
        request.method not in _MUTATING
        or request.url.path in _SKIP
        or response.status_code >= 400
    ):
        return
    _dispatch(
        {
            "actor": actor_from_authorization(request.headers.get("authorization")),
            "action": request.method,
            "target": request.url.path,
            "source": _SOURCE,
            "status_code": response.status_code,
        }
    )


def emit_sensitive_read(actor: str, target: str, masked: bool) -> None:
    """Report a read that touched a sensitive column (masked or plaintext)."""
    action = "读取敏感数据(已掩码)" if masked else "读取敏感数据(明文)"
    _dispatch(
        {
            "actor": actor,
            "action": action,
            "target": target,
            "source": _SOURCE,
            "status_code": 200,
        }
    )
