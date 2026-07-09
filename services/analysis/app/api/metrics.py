"""Metric (cube) endpoints: catalog of named business metrics + query execution."""

from fastapi import APIRouter

from app.domain.metrics import METRICS
from app.schemas.metrics import DimensionOut, MetricOut, MetricQueryRequest, MetricQueryResult
from app.services import metric_query

router = APIRouter(tags=["metrics"])

# Display labels for base object types (api_name -> Chinese). Kept local to the
# metric layer so its catalog reads in business terms.
_BASE_LABELS = {
    "PurchaseOrder": "采购单",
    "Shipment": "发运单",
    "Product": "产品",
    "Order": "订单",
    "Supplier": "供应商",
    "Warehouse": "仓库",
    "Customer": "客户",
}


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
