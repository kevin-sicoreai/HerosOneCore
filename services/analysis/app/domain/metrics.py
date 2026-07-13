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

    property: the column to group by. When the dimension lives on the base type
    ``via_link`` / ``via_link_id`` are None; otherwise it is a property of the
    far type reached by joining the base type through the referenced link.

    ``via_link_id`` (the ontology link id) is authoritative for resolving the
    join — both the native engine and the Cube generator resolve by id, which is
    stable across renames. ``via_link`` (display_name) is cosmetic: it backs the
    human-readable fallback column in the read-only semantics view.
    """

    key: str
    label: str
    property: str
    via_link: str | None = None  # link display_name; None = property on base type
    via_link_id: str | None = None  # link id; authoritative for join resolution


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
    base_type: str  # object type api_name, e.g. "support_ticket"
    agg: str  # sum | avg | min | max | count | rate
    measure: str | None = None  # numeric base property for sum/avg/min/max
    unit: str = ""  # display unit, e.g. "¥", "单", "%"
    numerator: tuple[str, str] | None = None  # (property, value) for rate; equality match
    dimensions: list[Dimension] = field(default_factory=list)
    # Metric-level fixed filters applied to the base rows before grouping and
    # aggregation: each (property, value) keeps only rows where the property
    # equals value (string comparison). Used to pin a metric's 口径, e.g. only
    # status=已完成 orders. Empty = no restriction.
    base_filters: list[tuple[str, str]] = field(default_factory=list)


# Chinese display labels for the base object types metrics aggregate over.
# Shared by the metric catalog (API) and query results (a metric's "data
# source" is its base type — consumers link it to that type's lineage).
BASE_LABELS: dict[str, str] = {
    "support_ticket": "客服工单",
    "order": "销售订单",
    "device": "IT 设备",
    "maintenance_order": "维保工单",
    "employee": "员工",
    "department": "部门",
}

# Chinese labels for base-type *properties* that appear in metric definitions
# but are not dimensions (measures, base_filters, numerator). Dimension labels
# are preferred first; this fills the gap so the derived 口径 description reads
# as natural language instead of raw column names.
_PROP_LABELS: dict[str, str] = {
    "status": "状态",
    "total_amount": "总金额",
    "satisfaction": "满意度",
    "score": "绩效得分",
}


def _prop_label(metric: "Metric", prop: str) -> str:
    for d in metric.dimensions:
        if d.property == prop:
            return d.label
    return _PROP_LABELS.get(prop, prop)


def describe(metric: "Metric") -> str:
    """Derive a plain-Chinese caliber (口径) sentence from a metric's structure.

    Reads only the definition (agg / measure / base_filters / numerator), so the
    description always matches how the metric is actually computed.
    """
    base = BASE_LABELS.get(metric.base_type, metric.base_type)
    scope = ""
    if metric.base_filters:
        conds = "、".join(f"{_prop_label(metric, p)}={v}" for p, v in metric.base_filters)
        scope = f" 中 {conds}"
    if metric.agg == "count":
        return f"统计 {base}{scope} 的数量"
    if metric.agg == "rate":
        if metric.numerator:
            prop, val = metric.numerator
            return f"计算 {base} 中 {_prop_label(metric, prop)}={val} 的占比"
        return f"计算 {base} 的占比"
    verb = {"sum": "求和", "avg": "求平均", "max": "取最大值", "min": "取最小值"}.get(
        metric.agg, metric.agg
    )
    measure_label = _prop_label(metric, metric.measure) if metric.measure else metric.agg
    return f"对 {base}{scope} 的 {measure_label} {verb}"


# Registry keyed by metric.key. Covers the current 10.1.0.4 ops dataset
# (sales / customer-service / device-maintenance). Every metric slices on a
# column of its own base type, so no cross-object link joins are needed here.
# ``description`` is left empty on purpose: the read path derives the 口径
# sentence from the structure via describe(), keyed off BASE_LABELS/_PROP_LABELS.
METRICS: dict[str, Metric] = {
    m.key: m
    for m in [
        Metric(
            key="ops_ticket_count",
            label="工单总数",
            description="",
            base_type="support_ticket",
            agg="count",
            unit="件",
            dimensions=[
                Dimension("status", "状态", "status"),
                Dimension("priority", "优先级", "priority"),
                Dimension("category", "类别", "category"),
            ],
        ),
        Metric(
            key="ops_ticket_satisfaction",
            label="平均满意度",
            description="",
            base_type="support_ticket",
            agg="avg",
            measure="satisfaction",
            unit="分",
        ),
        Metric(
            key="ops_order_amount",
            label="订单销售额",
            description="",
            base_type="order",
            agg="sum",
            measure="total_amount",
            unit="元",
            dimensions=[
                Dimension("status", "状态", "status"),
            ],
        ),
        Metric(
            key="ops_device_active_rate",
            label="设备在用率",
            description="",
            base_type="device",
            agg="rate",
            unit="%",
            numerator=("status", "在用"),
        ),
        Metric(
            key="ops_maintenance_count",
            label="维保工单数",
            description="",
            base_type="maintenance_order",
            agg="count",
            unit="件",
            dimensions=[
                Dimension("status", "状态", "status"),
                Dimension("issue", "故障类别", "issue"),
            ],
        ),
    ]
}
