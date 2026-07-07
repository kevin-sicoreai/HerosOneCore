"""HTTP client for the data service (dataset catalog, schema, preview)."""

from typing import Any

import httpx

from app.core.config import settings

_TIMEOUT = 8.0


def _base() -> str:
    return settings.data_service_url.rstrip("/")


def list_datasets() -> list[dict[str, Any]]:
    resp = httpx.get(f"{_base()}/datasets", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def find_dataset(name_or_id: str) -> dict[str, Any] | None:
    for d in list_datasets():
        if d.get("id") == name_or_id or d.get("name") == name_or_id:
            return d
    return None


def get_schema(dataset_id: str) -> list[dict[str, Any]]:
    resp = httpx.get(f"{_base()}/datasets/{dataset_id}/schema", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def preview(dataset_id: str, limit: int) -> dict[str, Any]:
    resp = httpx.get(
        f"{_base()}/datasets/{dataset_id}/preview", params={"limit": limit}, timeout=_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()
