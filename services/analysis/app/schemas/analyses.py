"""Saved-analysis request/response models.

``definition`` is a transparent JSON object: the service accepts, stores, and
returns it without interpreting its shape (the frontend owns the recipe schema).
It is persisted as a JSON string; the API layer handles (de)serialization.
"""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, field_serializer


class AnalysisCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    # Opaque recipe object; stored verbatim as JSON.
    definition: dict[str, Any] = Field(default_factory=dict)


class AnalysisUpdate(BaseModel):
    # Both optional: a save may rename, replace the definition, or both.
    name: str | None = Field(default=None, min_length=1, max_length=255)
    definition: dict[str, Any] | None = None


class AnalysisSummary(BaseModel):
    """List item: metadata only, no definition (keeps the catalog payload small)."""

    id: str
    name: str
    owner: str | None
    updated_at: datetime

    # Timestamps are stored as naive UTC (SQLite drops tzinfo). Emit them with an
    # explicit UTC offset so the browser doesn't misread them as local time (a
    # tz-less ISO string parses as local in JS, skewing relative-time display).
    @field_serializer("updated_at", check_fields=False)
    def _ser_updated_at(self, v: datetime) -> str:
        return (v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v).isoformat()


class AnalysisDetail(AnalysisSummary):
    """Single-analysis response: summary plus the full recipe + created_at."""

    created_at: datetime
    definition: dict[str, Any]

    @field_serializer("created_at")
    def _ser_created_at(self, v: datetime) -> str:
        return (v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v).isoformat()
