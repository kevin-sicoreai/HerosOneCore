"""Domain event publishers (log-based in P0)."""

from typing import Any

from app.core.logging import get_logger

logger = get_logger("events")


def _publish(event: str, payload: dict[str, Any]) -> None:
    logger.info("event %s %s", event, payload)


def object_type_created(object_type_id: str, api_name: str) -> None:
    _publish("object_type.created", {"object_type_id": object_type_id, "api_name": api_name})


def link_type_created(link_type_id: str, api_name: str) -> None:
    _publish("link_type.created", {"link_type_id": link_type_id, "api_name": api_name})
