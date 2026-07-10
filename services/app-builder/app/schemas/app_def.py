"""App definition request/response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AppCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    # Optional initial Puck document (JSON string); defaults to an empty doc.
    definition: str | None = None


class AppUpdate(BaseModel):
    # All optional: a save may touch only the definition, only metadata, or both.
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    definition: str | None = None


class AppSummary(BaseModel):
    """List item: metadata only, no definition (keeps the catalog payload small)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    version: int
    published: bool
    owner: str | None
    created_at: datetime
    updated_at: datetime


class AppDetail(AppSummary):
    """Single-app response: summary plus the full Puck document."""

    definition: str
