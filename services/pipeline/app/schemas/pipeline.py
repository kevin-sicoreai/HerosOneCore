"""Pipeline request/response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PipelineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    schedule: str | None = None
    owner_id: str | None = None


class PipelineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    schedule: str | None = None


class PipelineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    status: str
    schedule: str | None
    owner_id: str | None
    created_at: datetime
    updated_at: datetime
