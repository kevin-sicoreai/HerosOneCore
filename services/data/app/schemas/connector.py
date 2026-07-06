"""Connector request/response models."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ConnectorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    source_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    schedule: str | None = None
    owner_id: str | None = None


class ConnectorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    config: dict[str, Any] | None = None
    schedule: str | None = None


class ConnectorOut(BaseModel):
    id: str
    name: str
    source_type: str
    config: dict[str, Any]  # secrets redacted by the service layer
    status: str
    schedule: str | None
    owner_id: str | None
    created_at: datetime
    updated_at: datetime


class TestConnectionResult(BaseModel):
    ok: bool
    message: str
