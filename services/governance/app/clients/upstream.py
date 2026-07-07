"""Read-only clients for the upstream services aggregated by governance.

All calls are best-effort: if a service is unavailable, the helper returns an
empty list so lineage/audit degrade gracefully instead of failing outright.
"""

from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("upstream")


def _get(base: str, path: str) -> Any:
    try:
        resp = httpx.get(f"{base}{path}", timeout=settings.http_timeout)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001 - degrade gracefully
        logger.warning("upstream GET %s%s failed: %s", base, path, exc)
        return None


# --- data service ---
def list_datasets() -> list[dict]:
    return _get(settings.data_api_url, "/datasets") or []


def list_connectors() -> list[dict]:
    return _get(settings.data_api_url, "/connectors") or []


def list_syncs(connector_id: str) -> list[dict]:
    return _get(settings.data_api_url, f"/connectors/{connector_id}/syncs") or []


# --- pipeline service ---
def list_pipelines() -> list[dict]:
    return _get(settings.pipeline_api_url, "/pipelines") or []


def get_pipeline_graph(pipeline_id: str) -> dict:
    return _get(settings.pipeline_api_url, f"/pipelines/{pipeline_id}/graph") or {"steps": [], "edges": []}


def list_pipeline_outputs(pipeline_id: str) -> list[dict]:
    return _get(settings.pipeline_api_url, f"/pipelines/{pipeline_id}/outputs") or []


def list_pipeline_runs(pipeline_id: str) -> list[dict]:
    return _get(settings.pipeline_api_url, f"/pipelines/{pipeline_id}/runs") or []


# --- ontology service ---
def list_object_types() -> list[dict]:
    return _get(settings.ontology_api_url, "/object-types") or []


# --- auth service ---
def list_roles() -> list[dict]:
    return _get(settings.auth_api_url, "/roles") or []
