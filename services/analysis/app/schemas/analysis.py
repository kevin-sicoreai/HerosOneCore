"""Pydantic request/response models."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class ColumnOut(BaseModel):
    name: str
    label: str
    kind: str


class TableOut(BaseModel):
    name: str
    label: str
    desc: str
    row_count: int
    columns: list[ColumnOut]


class MetricSpec(BaseModel):
    field: str
    agg: Literal["sum", "avg", "count", "max", "min"] = "sum"


class FilterSpec(BaseModel):
    field: str
    op: Literal["eq", "neq", "gt", "lt", "contains"] = "eq"
    value: Any


class AnalyzeRequest(BaseModel):
    table: str
    group_by: str | None = None
    metrics: list[MetricSpec] = Field(min_length=1)
    filters: list[FilterSpec] = []
    limit: int = 50


class AnalyzeResult(BaseModel):
    # Column headers: the group label (if grouping) then one per metric.
    columns: list[str]
    # One row per group: {"group": ..., "m0": ..., "m1": ...}
    rows: list[dict[str, Any]]
    # Ungrouped totals per metric, for the headline cards.
    totals: list[float]
    matched_rows: int
