"""Metric (cube) endpoints: catalog of named business metrics + query execution."""

from fastapi import APIRouter

from app.domain.metrics import BASE_LABELS as _BASE_LABELS
from app.domain.metrics import METRICS
from app.schemas.metrics import (
    DimensionOut,
    MetricOut,
    MetricQueryRequest,
    MetricQueryResult,
    MetricSemanticsOut,
)
from app.services import metric_query

router = APIRouter(tags=["metrics"])


@router.get("/metrics/semantics", response_model=list[MetricSemanticsOut])
def list_metric_semantics() -> list[MetricSemanticsOut]:
    """Read-only 口径 catalog for the /metrics page (no query execution)."""
    return metric_query.list_semantics()


@router.get("/metrics", response_model=list[MetricOut])
def list_metrics() -> list[MetricOut]:
    return [
        MetricOut(
            key=m.key,
            label=m.label,
            description=m.description,
            base_type=m.base_type,
            base_label=_BASE_LABELS.get(m.base_type, m.base_type),
            agg=m.agg,
            unit=m.unit,
            dimensions=[DimensionOut(key=d.key, label=d.label) for d in m.dimensions],
        )
        for m in METRICS.values()
    ]


@router.post("/metrics/query", response_model=MetricQueryResult)
def query_metric(req: MetricQueryRequest) -> MetricQueryResult:
    return metric_query.query(req.metric, req.dimension, req.filters, req.limit)
