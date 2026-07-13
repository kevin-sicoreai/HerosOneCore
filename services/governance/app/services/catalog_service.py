"""Catalog sync: publish platform assets + lineage into OpenMetadata.

Fully optional — when ``settings.catalog_publisher`` is "none" the endpoints
report "disabled" and nothing ever talks to OM. Sync status is process-local
(demo scope); a restart simply reports "never synced".
"""

import threading
import time
from typing import Any

from app.clients import openmetadata, upstream
from app.core.config import settings
from app.core.logging import get_logger
from app.services import lineage_service

logger = get_logger("catalog")

_lock = threading.Lock()
_state: dict[str, Any] = {"last_sync": None, "last_result": None, "last_error": None, "running": False}


def status() -> dict[str, Any]:
    enabled = settings.catalog_publisher == "openmetadata"
    return {
        "publisher": settings.catalog_publisher,
        "enabled": enabled,
        "reachable": openmetadata.ping() if enabled else False,
        "service_name": openmetadata.service_name() if enabled else None,
        "ui_url": openmetadata.ui_url() if enabled else None,
        "running": _state["running"],
        "last_sync": _state["last_sync"],
        "last_result": _state["last_result"],
        "last_error": _state["last_error"],
    }


def sync() -> dict[str, Any]:
    """Push every lineage node + edge to OM. Returns per-kind counts."""
    if settings.catalog_publisher != "openmetadata":
        return {"error": "catalog publisher disabled (CATALOG_PUBLISHER=none)"}
    if not _lock.acquire(blocking=False):
        return {"error": "sync already running"}
    _state["running"] = True
    pub = openmetadata.Publisher()
    try:
        lineage = lineage_service.build()
        pub.ensure_scaffolding()

        for node in lineage.nodes:
            # Schema placement follows node.type, NOT the id prefix: a pipeline
            # mart merges into its registered dataset node ("dataset:<id>" with
            # type "mart"), so the prefix would misfile marts under raw.
            kind = node.type
            _, _, raw_id = node.id.partition(":")
            if kind in ("dataset", "mart"):
                detail = upstream.get_dataset(raw_id) or {}
                pub.upsert_table(
                    node.id,
                    schema="mart" if kind == "mart" else "raw",
                    name=detail.get("name") or node.label,
                    display_name=detail.get("display_name") or node.label,
                    cols=detail.get("columns") or [],
                )
            elif kind == "object_type":
                detail = upstream.get_object_type(raw_id) or {}
                pub.upsert_table(
                    node.id,
                    schema="ontology",
                    name=detail.get("api_name") or raw_id,
                    display_name=detail.get("display_name") or node.label,
                    cols=detail.get("properties") or [],
                    description="HerosOneCore ontology object type",
                )
            elif kind == "pipeline":
                pub.upsert_pipeline(node.id, node.label)
            # connector nodes: represented by the OM service itself, skipped.

        for edge in lineage.edges:
            pub.add_edge(edge.from_id, edge.to_id)

        result = dict(pub.counts)
        _state["last_sync"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        _state["last_result"] = result
        _state["last_error"] = None
        logger.info("catalog sync done: %s", result)
        return result
    except Exception as exc:  # noqa: BLE001 - surface the error in status
        _state["last_error"] = str(exc)
        logger.warning("catalog sync failed: %s", exc)
        return {"error": str(exc)}
    finally:
        _state["running"] = False
        pub.close()
        _lock.release()
