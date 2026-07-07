"""Pydantic request/response models."""

from typing import Any

from pydantic import BaseModel, ConfigDict


class BuilderAppIn(BaseModel):
    name: str = "未命名应用"
    definition: dict[str, Any] = {}


class BuilderAppOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    owner_id: str | None = None
    definition: dict[str, Any]
    created_at: str
    updated_at: str


class PublishRequest(BaseModel):
    desc: str = ""


class PublishResult(BaseModel):
    market_app_id: str
    name: str
