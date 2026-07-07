"""Client for the data service — resolve backing dataset schema + storage path."""

from typing import Any

import httpx

from app.core.config import settings


def get_dataset(dataset_id: str) -> dict[str, Any]:
    resp = httpx.get(f"{settings.data_api_url}/datasets/{dataset_id}", timeout=10)
    resp.raise_for_status()
    return resp.json()


def get_dataset_schema(dataset_id: str) -> list[dict[str, Any]]:
    resp = httpx.get(f"{settings.data_api_url}/datasets/{dataset_id}/schema", timeout=10)
    resp.raise_for_status()
    return resp.json()
