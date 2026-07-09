"""Dataset request/response models."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class DatasetColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    data_type: str
    nullable: bool
    ordinal: int


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    display_name: str | None
    connector_id: str
    layer: str
    storage_uri: str
    row_count: int | None
    owner_id: str | None
    last_synced_at: datetime | None
    created_at: datetime


class DatasetDetailOut(DatasetOut):
    columns: list[DatasetColumnOut]


class DatasetColumnIn(BaseModel):
    name: str
    data_type: str
    nullable: bool = True


class DatasetRegister(BaseModel):
    """Register a dataset produced inside the platform (e.g. a pipeline mart)."""

    name: str
    display_name: str | None = None
    connector_id: str
    storage_uri: str
    layer: str = "mart"
    row_count: int | None = None
    columns: list[DatasetColumnIn] = []


class DatasetPatch(BaseModel):
    """Partial update for a dataset, e.g. backfilling a Chinese display name."""

    name: str | None = None
    display_name: str | None = None


class DatasetPreviewOut(BaseModel):
    dataset_id: str
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int  # number of rows in this preview page
