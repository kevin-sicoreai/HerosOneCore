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


class SemanticDimensionOut(BaseModel):
    key: str
    label: str
    # The underlying column a dimension groups by: the Cube member (e.g.
    # "department.name") when the metric is Cube-mapped, otherwise the base/linked
    # object property.
    mapped_column: str


class CubeMappingOut(BaseModel):
    # Whether the metric is mapped to a Cube deployment in metric_map.json.
    mapped: bool
    # Base cube name and the mapped measure member; null for native-only metrics.
    cube: str | None = None
    measure: str | None = None


class MetricSemanticsOut(BaseModel):
    """Read-only semantic (口径) view of a metric for the /metrics page."""

    key: str
    label: str
    agg: str
    unit: str
    base_type: str
    base_label: str
    # Plain-Chinese caliber description derived from the metric definition.
    description: str
    dimensions: list[SemanticDimensionOut]
    cube: CubeMappingOut
    # The service-wide default metric engine (settings.metrics_engine).
    engine_default: str


# --- Metric definition management (admin CRUD) ---------------------------- #


class MetricFilterIn(BaseModel):
    """One 口径 (base) filter: equality only (the semantic pin, e.g. status=在职)."""

    property: str
    value: str


class MetricDimensionSource(BaseModel):
    """Where a dimension's column lives: on the base type (link_id omitted) or on
    a far type reached through an ontology link (link_id set)."""

    column: str
    link_id: str | None = None


class MetricDimensionIn(BaseModel):
    # key is optional on input; the service derives a stable slug when absent.
    key: str | None = None
    label: str
    source: MetricDimensionSource


class MetricDefBody(BaseModel):
    """Mutable fields of a metric definition (shared by create/update)."""

    label: str
    agg: str
    unit: str = ""
    base_type: str  # object type api_name
    measure_column: str | None = None
    base_filters: list[MetricFilterIn] = []
    numerator_property: str | None = None
    numerator_value: str | None = None
    dimensions: list[MetricDimensionIn] = []
    description_override: str | None = None


class MetricDefIn(MetricDefBody):
    """Create payload — carries the natural key (immutable thereafter)."""

    key: str


class MetricDefDimensionOut(BaseModel):
    key: str
    label: str
    source: MetricDimensionSource


class MetricDefOut(BaseModel):
    """Full stored definition (for the admin edit form + write responses)."""

    key: str
    label: str
    agg: str
    unit: str
    base_type: str
    measure_column: str | None
    base_filters: list[MetricFilterIn]
    numerator_property: str | None
    numerator_value: str | None
    dimensions: list[MetricDefDimensionOut]
    description_override: str | None
    owner: str | None
    # Set on a write when Cube schema regeneration failed; null otherwise.
    warning: str | None = None


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
