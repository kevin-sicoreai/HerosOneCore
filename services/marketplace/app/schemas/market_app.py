"""Pydantic request/response models."""

from typing import Any

from pydantic import BaseModel, ConfigDict


class MarketAppOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    desc: str
    tag: str
    category: str
    installs: int
    deployed: bool
    has_definition: bool = False
    created_at: str
    updated_at: str


class MarketAppDetailOut(MarketAppOut):
    definition: dict[str, Any] | None = None


class PublishRequest(BaseModel):
    source_app_id: str
    name: str
    desc: str = ""
    category: str = "自建"
    definition: dict[str, Any]
