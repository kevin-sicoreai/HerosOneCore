"""Client for the data service — resolve backing dataset schema + storage path."""

from typing import Any

import httpx

from app.core.config import settings


def get_dataset(dataset_id: str) -> dict[str, Any]:
    resp = httpx.get(f"{settings.data_api_url}/datasets/{dataset_id}", timeout=10)
    resp.raise_for_status()
    return resp.json()


def list_datasets() -> list[dict[str, Any]]:
    """All datasets in the catalog (paged through), one batch call.

    Used to resolve every object type's instance count in a single round trip
    (each dataset carries a maintained ``row_count``), instead of one metadata
    call plus one live COUNT per object type.
    """
    out: list[dict[str, Any]] = []
    page = 1
    page_size = 100
    while True:
        resp = httpx.get(
            f"{settings.data_api_url}/datasets",
            params={"page": page, "page_size": page_size},
            timeout=10,
        )
        resp.raise_for_status()
        payload = resp.json()
        items = payload.get("items", [])
        out.extend(items)
        if page >= (payload.get("pages", 1) or 1) or not items:
            break
        page += 1
    return out


def get_dataset_schema(dataset_id: str) -> list[dict[str, Any]]:
    resp = httpx.get(f"{settings.data_api_url}/datasets/{dataset_id}/schema", timeout=10)
    resp.raise_for_status()
    return resp.json()
