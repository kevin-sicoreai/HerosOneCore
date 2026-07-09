"""HTTP client for the ontology service (object types, properties, instances).

Analysis operates on the built ontology (object types), not raw datasets:
object types are the business-facing semantic layer over the data plane.
"""

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

import httpx

from app.core.config import settings

_TIMEOUT = 8.0

# Analysis is a trusted data-plane service: it self-mints a short-lived service
# token so the ontology grants it the *unmasked* values (e.g. monthly_salary,
# which is masked to "***" for non-admin callers) needed to compute aggregates.
# Self-contained per service (no shared library): this mirrors the ontology
# auth service's HS256 scheme and reads the same JWT_SECRET.
_JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _service_headers() -> dict[str, str]:
    """Mint a short-lived internal admin token for reads that need real values."""
    header = {"alg": "HS256", "typ": "JWT"}
    body = {
        "sub": "svc:analysis",
        "username": "analysis-service",
        "roles": ["service"],
        "perms": {"can_read": True, "can_write": True, "can_admin": True},
        "exp": int(time.time()) + 300,
    }
    signing = (
        f"{_b64e(json.dumps(header, separators=(',', ':')).encode())}."
        f"{_b64e(json.dumps(body, separators=(',', ':')).encode())}"
    )
    sig = hmac.new(_JWT_SECRET.encode(), signing.encode(), hashlib.sha256).digest()
    return {"Authorization": f"Bearer {signing}.{_b64e(sig)}"}


def _base() -> str:
    return settings.ontology_service_url.rstrip("/")


def list_object_types() -> list[dict[str, Any]]:
    resp = httpx.get(f"{_base()}/object-types", headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def get_object_type(object_type_id: str) -> dict[str, Any]:
    """Object type detail, including its properties (name / data_type / pk)."""
    resp = httpx.get(
        f"{_base()}/object-types/{object_type_id}", headers=_service_headers(), timeout=_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def graph() -> dict[str, Any]:
    """Ontology graph (nodes + links). Each node carries api_name /
    display_name / property_count / instance_count, so the analysis catalog can
    be built without pulling any instance rows (instance_count is a cheap COUNT
    on the ontology side, not a full row scan)."""
    resp = httpx.get(f"{_base()}/graph", headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def list_objects(object_type_id: str, limit: int) -> dict[str, Any]:
    """Object instances (columns + rows), read virtualized from the data plane."""
    resp = httpx.get(
        f"{_base()}/object-types/{object_type_id}/objects",
        params={"limit": limit},
        headers=_service_headers(),
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def list_link_types() -> list[dict[str, Any]]:
    """Link types, including join keys (from_property / to_property) — the graph
    endpoint omits these, so the metric layer reads links from here to resolve
    cross-object joins."""
    resp = httpx.get(f"{_base()}/link-types", headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()
