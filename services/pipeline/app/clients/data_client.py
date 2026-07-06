"""Client for the data service — resolve source dataset storage paths."""

from typing import Any

import httpx

from app.core.config import settings


def get_dataset(dataset_id: str) -> dict[str, Any]:
    """Return a dataset's metadata (name, storage_uri, ...) from the data service."""
    url = f"{settings.data_api_url}/datasets/{dataset_id}"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()
