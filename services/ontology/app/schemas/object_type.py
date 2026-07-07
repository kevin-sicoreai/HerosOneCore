"""Object type + property request/response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PropertyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    data_type: str
    is_primary_key: bool
    description: str | None
    ordinal: int


class ObjectTypeCreate(BaseModel):
    api_name: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)
    dataset_id: str
    description: str | None = None
    primary_key: str | None = None  # inferred from schema if omitted
    color: str = "emerald"
    x: float = 0
    y: float = 0


class ObjectTypeUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    primary_key: str | None = None
    color: str | None = None
    x: float | None = None
    y: float | None = None


class ObjectTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    api_name: str
    display_name: str
    description: str | None
    dataset_id: str
    primary_key: str | None
    color: str
    x: float
    y: float
    created_at: datetime


class ObjectTypeDetailOut(ObjectTypeOut):
    properties: list[PropertyOut]
