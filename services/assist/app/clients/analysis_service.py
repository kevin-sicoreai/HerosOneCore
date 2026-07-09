"""HTTP client for the analysis service (metric semantic layer / cube).

The analysis service exposes named business metrics (e.g. purchase total,
shipment delay rate) that aggregate across joined object types. The agent
calls it to answer metric-style questions (ranking / share / totals) rather
than tracing individual objects.
"""

from typing import Any

import httpx

from app.core.config import settings

_TIMEOUT = 8.0


def _base() -> str:
    return settings.analysis_service_url.rstrip("/")


def list_metrics() -> list[dict[str, Any]]:
    """The catalog of named metrics with their queryable dimensions."""
    resp = httpx.get(f"{_base()}/metrics", timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def query_metric(
    metric: str,
    dimension: str | None,
    filters: list[dict] | None,
    limit: int,
) -> dict[str, Any]:
    """Compute one metric, optionally grouped by a dimension and filtered."""
    resp = httpx.post(
        f"{_base()}/metrics/query",
        json={
            "metric": metric,
            "dimension": dimension,
            "filters": filters or [],
            "limit": limit,
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()
