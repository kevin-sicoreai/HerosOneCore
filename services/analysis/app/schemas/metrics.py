"""Request/response models for the metric (cube) layer."""

from typing import Any

from pydantic import BaseModel

from app.schemas.analysis import FilterSpec


class DimensionOut(BaseModel):
    key: str
    label: str


class MetricOut(BaseModel):
    key: str
    label: str
    description: str
    base_type: str
    base_label: str
    agg: str
    unit: str
    dimensions: list[DimensionOut]


class MetricQueryRequest(BaseModel):
    metric: str
    # None = overall value (single "整体" bucket); otherwise a dimension key.
    dimension: str | None = None
    filters: list[FilterSpec] = []
    limit: int = 50


class MetricGroupRow(BaseModel):
    group: str
    value: float


class MetricQueryResult(BaseModel):
    metric_key: str
    metric_label: str
    # Base object type the metric aggregates over — the metric's data source
    # (consumers link "where does this number come from" to the type's lineage).
    base_type: str = ""
    base_label: str = ""
    dimension_key: str | None
    dimension_label: str | None
    agg: str
    unit: str
    # One row per group, sorted by value desc; chart-ready (group -> value).
    rows: list[MetricGroupRow]
    # Overall value across all matched base rows (ungrouped).
    total: float
    matched_rows: int
    # Extra context echoed for the UI (e.g. how many rows joined).
    meta: dict[str, Any] = {}
