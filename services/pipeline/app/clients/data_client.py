"""Client for the data service — resolve source dataset storage paths."""

from typing import Any

import httpx

from app.core.auth import service_headers
from app.core.config import settings


def get_dataset(dataset_id: str) -> dict[str, Any]:
    """Return a dataset's metadata (name, storage_uri, ...) from the data service."""
    url = f"{settings.data_api_url}/datasets/{dataset_id}"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()


_PIPELINE_CONNECTOR_NAME = "管道产出"


def ensure_pipeline_connector() -> str:
    """Return the id of the internal connector that pipeline marts are cataloged under,
    creating it once if needed."""
    resp = httpx.get(
        f"{settings.data_api_url}/connectors",
        params={"q": _PIPELINE_CONNECTOR_NAME, "source_type": "internal"},
        timeout=10,
    )
    resp.raise_for_status()
    for c in resp.json()["items"]:
        if c["name"] == _PIPELINE_CONNECTOR_NAME:
            return c["id"]
    created = httpx.post(
        f"{settings.data_api_url}/connectors",
        json={"name": _PIPELINE_CONNECTOR_NAME, "source_type": "internal", "config": {}},
        headers=service_headers(),
        timeout=10,
    )
    created.raise_for_status()
    return created.json()["id"]


def register_dataset(payload: dict[str, Any]) -> dict[str, Any]:
    """Register a pipeline mart into the data-service catalog."""
    resp = httpx.post(f"{settings.data_api_url}/datasets", json=payload, headers=service_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()
