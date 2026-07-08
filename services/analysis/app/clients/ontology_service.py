"""HTTP client for the ontology service (object types, properties, instances).

Analysis operates on the built ontology (object types), not raw datasets:
object types are the business-facing semantic layer over the data plane.
"""

from typing import Any

import httpx

from app.core.config import settings

_TIMEOUT = 8.0


def _base() -> str:
    return settings.ontology_service_url.rstrip("/")


def list_object_types() -> list[dict[str, Any]]:
    resp = httpx.get(f"{_base()}/object-types", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def get_object_type(object_type_id: str) -> dict[str, Any]:
    """Object type detail, including its properties (name / data_type / pk)."""
    resp = httpx.get(f"{_base()}/object-types/{object_type_id}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def list_objects(object_type_id: str, limit: int) -> dict[str, Any]:
    """Object instances (columns + rows), read virtualized from the data plane."""
    resp = httpx.get(
        f"{_base()}/object-types/{object_type_id}/objects",
        params={"limit": limit},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()
