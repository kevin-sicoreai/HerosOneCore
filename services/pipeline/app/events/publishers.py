"""Domain event publishers (log-based in P0)."""

from typing import Any

from app.core.logging import get_logger

logger = get_logger("events")


def _publish(event: str, payload: dict[str, Any]) -> None:
    logger.info("event %s %s", event, payload)


def run_started(pipeline_id: str, run_id: str) -> None:
    _publish("pipeline.run_started", {"pipeline_id": pipeline_id, "run_id": run_id})


def run_completed(pipeline_id: str, run_id: str, status: str) -> None:
    _publish("pipeline.run_completed", {"pipeline_id": pipeline_id, "run_id": run_id, "status": status})


def dataset_created(name: str, storage_uri: str, row_count: int | None) -> None:
    _publish("dataset.created", {"name": name, "storage_uri": storage_uri, "row_count": row_count, "layer": "mart"})
