"""Sync-run response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    connector_id: str
    status: str
    started_at: datetime | None
    finished_at: datetime | None
    rows_synced: int
    error: str | None
    created_at: datetime
