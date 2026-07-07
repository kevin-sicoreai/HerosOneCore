"""HTTP client for the marketplace service (publish target)."""

from typing import Any

import httpx

from app.core.config import settings


def publish_app(
    source_app_id: str, name: str, desc: str, definition: dict[str, Any]
) -> dict[str, Any]:
    """Push a definition snapshot to the marketplace; upserts on source_app_id."""
    resp = httpx.post(
        f"{settings.marketplace_url.rstrip('/')}/apps",
        json={
            "source_app_id": source_app_id,
            "name": name,
            "desc": desc,
            "category": "自建",
            "definition": definition,
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()
