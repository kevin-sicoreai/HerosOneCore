"""Pydantic request/response models."""

from typing import Any, Literal

from pydantic import BaseModel, Field


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
    op: Literal["eq", "neq", "gt", "lt", "contains", "in"] = "eq"
    # "in" carries a list of candidate values; the other ops carry a scalar. The
    # type stays permissive (Any) so a list is accepted alongside str/number.
    value: Any


class AnalyzeRequest(BaseModel):
    table: str
    group_by: str | None = None
    # Empty metrics = detail mode: return the filtered rows as-is (no aggregation).
    metrics: list[MetricSpec] = []
    filters: list[FilterSpec] = []
    limit: int = 50
    # Detail-mode pagination + sorting. Ignored in aggregate mode.
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=100, ge=1, le=1000)
    order_by: str | None = None
    order_dir: Literal["asc", "desc"] = "desc"


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
    # Detail-mode pagination echo; page_size = 0 signals "not applicable" (aggregate mode).
    page: int = 1
    page_size: int = 0
