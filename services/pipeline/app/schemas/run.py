"""Run / output response models."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class StepRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_id: str
    status: str
    duration_ms: int | None
    message: str | None


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pipeline_id: str
    status: str
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    created_at: datetime


class RunDetailOut(RunOut):
    step_runs: list[StepRunOut]


class OutputOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pipeline_id: str
    run_id: str
    step_id: str
    name: str
    layer: str
    storage_uri: str
    row_count: int | None
    created_at: datetime


class OutputPreviewOut(BaseModel):
    output_id: str
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
