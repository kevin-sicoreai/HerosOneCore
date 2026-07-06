"""Connector-type (catalog) response models."""

from typing import Any

from pydantic import BaseModel


class ConnectorTypeOut(BaseModel):
    type: str
    display_name: str
    category: str
    supported: bool
    config_fields: list[dict[str, Any]]
