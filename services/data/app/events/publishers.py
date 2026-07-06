"""Domain event publishers.

P0 logs events only. When a message bus is introduced, these functions publish
to it so ontology/pipeline/governance can subscribe.
"""

from typing import Any

from app.core.logging import get_logger

logger = get_logger("events")


def _publish(event: str, payload: dict[str, Any]) -> None:
    logger.info("event %s %s", event, payload)


def dataset_created(dataset_id: str, connector_id: str, name: str) -> None:
    _publish("dataset.created", {"dataset_id": dataset_id, "connector_id": connector_id, "name": name})


def dataset_synced(dataset_id: str, row_count: int) -> None:
    _publish("dataset.synced", {"dataset_id": dataset_id, "row_count": row_count})


def connector_status_changed(connector_id: str, status: str) -> None:
    _publish("connector.status_changed", {"connector_id": connector_id, "status": status})
