"""HTTP client for the governance service (type-level data lineage).

Lineage is modeled at the object-type level: nodes are datasets, object
types, and connectors; edges connect upstream sources to downstream sinks.
The agent uses this to answer "where does this object's data come from".
"""

from typing import Any

import httpx

from app.core.config import settings

_TIMEOUT = 8.0


def _base() -> str:
    return settings.governance_service_url.rstrip("/")


def lineage() -> dict[str, Any]:
    """The full lineage graph: {"nodes": [...], "edges": [...]}."""
    resp = httpx.get(f"{_base()}/lineage", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()
