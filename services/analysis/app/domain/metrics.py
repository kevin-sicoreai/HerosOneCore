"""Metric semantic layer — the platform's lightweight "cube".

A metric is a named, reusable business measure defined once here and consumed
by both the analysis workbench and the AIP assistant, so every consumer computes
the same number with the same meaning (口径一致). Unlike the raw /analyze
aggregation (single object type, raw column + agg), a metric can span linked
object types: a dimension may live on a *joined* type, reached via an ontology
link. The join keys come from the ontology's link types (from_property /
to_property), so no join logic is hardcoded against the data.

Definitions reference object types by api_name and links by display_name; the
query service resolves those to ids against the live ontology at query time.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Dimension:
    """A way to slice a metric.

    property: the column to group by. When via_link is None it is a property of
    the metric's base type; otherwise it is a property of the far type reached by
    joining the base type through the named link.
    """

    key: str
    label: str
    property: str
    via_link: str | None = None  # link display_name; None = property on base type


@dataclass(frozen=True)
class Metric:
    """A named business measure over one base object type.

    agg semantics:
      sum/avg/min/max — aggregate `measure` (a numeric property of the base type)
      count           — count matched base rows (`measure` ignored)
      rate            — share of matched rows where `numerator` holds, i.e.
                        count(numerator) / count(all); yields a 0..1 ratio
                        (`measure` ignored)
    """

    key: str
    label: str
    description: str
    base_type: str  # object type api_name, e.g. "PurchaseOrder"
    agg: str  # sum | avg | min | max | count | rate
    measure: str | None = None  # numeric base property for sum/avg/min/max
    unit: str = ""  # display unit, e.g. "¥", "单", "%"
    numerator: tuple[str, str] | None = None  # (property, value) for rate; equality match
    dimensions: list[Dimension] = field(default_factory=list)


# Registry keyed by metric.key. Covers the supply-chain demo (场景 8.1); the
# flagship is purchase_total sliced by supplier_region — a cross-object join
# (PurchaseOrder → 供货方 → Supplier.region) the raw /analyze cannot express.
_SUPPLIER_REGION = Dimension("supplier_region", "供应商区域", "region", via_link="供货方")
_WAREHOUSE_CITY = Dimension("warehouse_city", "目的仓库城市", "city", via_link="目的仓库")

METRICS: dict[str, Metric] = {
    m.key: m
    for m in [
        Metric(
            key="purchase_total",
            label="采购总额",
            description="按供应商区域/采购状态汇总的采购单总金额",
            base_type="PurchaseOrder",
            agg="sum",
            measure="total_amount",
            unit="¥",
            dimensions=[
                _SUPPLIER_REGION,
                Dimension("po_status", "采购状态", "status"),
            ],
        ),
        Metric(
            key="purchase_count",
            label="采购单数",
            description="按供应商区域/采购状态统计的采购单数量",
            base_type="PurchaseOrder",
            agg="count",
            unit="单",
            dimensions=[
                _SUPPLIER_REGION,
                Dimension("po_status", "采购状态", "status"),
            ],
        ),
        Metric(
            key="shipment_count",
            label="发运量",
            description="按承运商/发运状态/目的仓库城市统计的发运单数量",
            base_type="Shipment",
            agg="count",
            unit="单",
            dimensions=[
                Dimension("carrier", "承运商", "carrier"),
                Dimension("shipment_status", "发运状态", "status"),
                _WAREHOUSE_CITY,
            ],
        ),
        Metric(
            key="shipment_delay_rate",
            label="发运延误率",
            description="状态为「延误」的发运单占比",
            base_type="Shipment",
            agg="rate",
            unit="%",
            numerator=("status", "延误"),
            dimensions=[
                Dimension("carrier", "承运商", "carrier"),
                _WAREHOUSE_CITY,
            ],
        ),
        Metric(
            key="shipment_fulfilled_rate",
            label="发运履约率",
            description="状态为「已交付」的发运单占比",
            base_type="Shipment",
            agg="rate",
            unit="%",
            numerator=("status", "已交付"),
            dimensions=[
                Dimension("carrier", "承运商", "carrier"),
                _WAREHOUSE_CITY,
            ],
        ),
        Metric(
            key="product_count",
            label="产品数",
            description="按类别/供应商区域统计的产品数量",
            base_type="Product",
            agg="count",
            unit="个",
            dimensions=[
                Dimension("category", "类别", "category"),
                _SUPPLIER_REGION,
            ],
        ),
    ]
}
