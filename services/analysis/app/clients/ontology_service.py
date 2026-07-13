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

# With the ontology metadata store on a remote Postgres (Thor), its /graph
# endpoint computes an instance_count per object type and takes ~20s+ cold —
# well past the old 8s default, which surfaced as a stable 503 "本体服务不可用"
# on /tables. Generous default; override via ONTOLOGY_CLIENT_TIMEOUT.
_TIMEOUT = float(os.environ.get("ONTOLOGY_CLIENT_TIMEOUT", "60"))

# Process-wide TTL caches for the catalog reads every /tables page load fans out
# to (graph + object-type summaries). Mirrors the 30s caches in
# repositories/object_rows.py, with a longer TTL because the backing /graph call
# is the expensive one. Only successful responses are cached, so transport
# errors still propagate to callers on every attempt.
_CACHE_TTL_SECONDS = 60.0
# (expires_monotonic, payload)
_graph_cache: tuple[float, dict[str, Any]] | None = None
_types_cache: tuple[float, list[dict[str, Any]]] | None = None

# Analysis is a trusted data-plane service: it self-mints a short-lived service
# token so the ontology grants it the *unmasked* values (e.g. a column governance
# marks sensitive, masked to "***" for non-admin callers) needed to compute aggregates.
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
    """Object-type summaries, cached for a short TTL (hit on every
    /tables/{name} resolution and throughout the metric layer)."""
    global _types_cache
    now = time.monotonic()
    if _types_cache is not None and now < _types_cache[0]:
        return _types_cache[1]
    resp = httpx.get(f"{_base()}/object-types", headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    payload = resp.json()
    _types_cache = (now + _CACHE_TTL_SECONDS, payload)
    return payload


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
    be built without pulling any instance rows. Cached for a short TTL: the
    ontology recomputes instance_count per type on every call, which is ~20s+
    against the remote metadata store, so uncached repeated page loads would
    stall the analysis workbench."""
    global _graph_cache
    now = time.monotonic()
    if _graph_cache is not None and now < _graph_cache[0]:
        return _graph_cache[1]
    resp = httpx.get(f"{_base()}/graph", headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    payload = resp.json()
    _graph_cache = (now + _CACHE_TTL_SECONDS, payload)
    return payload


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
