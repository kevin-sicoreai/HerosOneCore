"""Emit audit events to the governance service.

Fire-and-forget: never blocks or fails the request. Sensitive-column reads are
reported from the endpoints (:func:`emit_sensitive_read`). The actor is the
caller's identity (from their Bearer token); every post carries this service's
internal service token.
"""

import os
import threading

import httpx

from app.core.auth import service_headers
from app.core.logging import get_logger

_GOVERNANCE_URL = os.environ.get("GOVERNANCE_API_URL", "http://127.0.0.1:8004")
_SOURCE = "analysis"

logger = get_logger("audit")


def _post_event(payload: dict) -> None:
    """POST one audit event; best-effort, swallow every error. Runs in a daemon thread.

    Failures (including auth rejections) are logged: a silently-dropped audit
    trail looks identical to a healthy one otherwise.
    """
    try:
        resp = httpx.post(
            f"{_GOVERNANCE_URL}/audit-events",
            json=payload,
            headers=service_headers(),
            timeout=5,
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - audit is best-effort
        logger.warning("audit event dropped (%s): %s", payload.get("action"), exc)


def _dispatch(payload: dict) -> None:
    """Fire-and-forget the post in a daemon thread so sync and async callers never block."""
    threading.Thread(target=_post_event, args=(payload,), daemon=True).start()


def emit_event(actor: str, action: str, target: str, status_code: int = 200) -> None:
    """Emit a generic audit event (e.g. a metric definition change)."""
    _dispatch(
        {
            "actor": actor,
            "action": action,
            "target": target,
            "source": _SOURCE,
            "status_code": status_code,
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
