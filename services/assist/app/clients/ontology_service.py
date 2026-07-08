"""HTTP client for the ontology service (object types, properties, instances).

The agent operates on the built ontology (object types) — the business-facing
semantic layer over the data plane — not on raw datasets.
"""

import urllib.parse
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


def find_object_type(name_or_id: str) -> dict[str, Any] | None:
    for ot in list_object_types():
        if name_or_id in (ot.get("id"), ot.get("api_name"), ot.get("display_name")):
            return ot
    return None


def get_object_type(object_type_id: str) -> dict[str, Any]:
    """Object type detail, including its properties."""
    resp = httpx.get(f"{_base()}/object-types/{object_type_id}", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def list_objects(object_type_id: str, limit: int) -> dict[str, Any]:
    resp = httpx.get(
        f"{_base()}/object-types/{object_type_id}/objects",
        params={"limit": limit},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def linked(
    object_type_id: str, pk_value: str, link_type_id: str, limit: int
) -> dict[str, Any]:
    """Objects linked to one source object along an ontology link type.

    Returns {"object_type_id": <the far-side type id>, "columns", "rows"}.
    The primary key is a path segment, so it is percent-encoded manually
    (httpx params only encode the query string).
    """
    pk = urllib.parse.quote(str(pk_value), safe="")
    resp = httpx.get(
        f"{_base()}/object-types/{object_type_id}/objects/{pk}/linked/{link_type_id}",
        params={"limit": limit},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def graph() -> dict[str, Any]:
    """The ontology graph: object-type nodes and their link types."""
    resp = httpx.get(f"{_base()}/graph", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()
