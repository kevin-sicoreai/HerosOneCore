"""Emit an audit event to the governance service after each successful write.

Fire-and-forget: never blocks or fails the request. The actor is read from the
caller's Bearer token; the post carries this service's internal service token.
"""

import asyncio
import os

import httpx
from fastapi import Request, Response

from app.core.auth import actor_from_authorization, service_headers

_GOVERNANCE_URL = os.environ.get("GOVERNANCE_API_URL", "http://127.0.0.1:8004")
_SOURCE = "ontology"
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_SKIP = {"/", "/health", "/docs", "/redoc", "/openapi.json"}


async def emit_audit(request: Request, response: Response) -> None:
    if (
        request.method not in _MUTATING
        or request.url.path in _SKIP
        or response.status_code >= 400
    ):
        return
    payload = {
        "actor": actor_from_authorization(request.headers.get("authorization")),
        "action": request.method,
        "target": request.url.path,
        "source": _SOURCE,
        "status_code": response.status_code,
    }

    async def _send() -> None:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    f"{_GOVERNANCE_URL}/audit-events", json=payload, headers=service_headers()
                )
        except Exception:  # noqa: BLE001 - audit is best-effort
            pass

    asyncio.create_task(_send())
