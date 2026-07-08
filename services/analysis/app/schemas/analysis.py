"""Pydantic request/response models."""

from typing import Any, Literal

from pydantic import BaseModel


class ColumnOut(BaseModel):
    name: str
    label: str
    kind: str
    data_type: str | None = None


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
    # Empty metrics = detail mode: return the filtered rows as-is (no aggregation).
    metrics: list[MetricSpec] = []
    filters: list[FilterSpec] = []
    limit: int = 50


class AnalyzeResult(BaseModel):
    # "aggregate": grouped/summed; "detail": raw filtered rows.
    mode: str = "aggregate"
    # Aggregate: group label (if grouping) then one per metric. Detail: column labels.
    columns: list[str]
    # Aggregate: one row per group {"group", "m0", ...}. Detail: raw records keyed by column name.
    rows: list[dict[str, Any]]
    # Ungrouped totals per metric (empty in detail mode).
    totals: list[float]
    matched_rows: int
