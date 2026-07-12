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
    base_type: str  # object type api_name, e.g. "employee"
    agg: str  # sum | avg | min | max | count | rate
    measure: str | None = None  # numeric base property for sum/avg/min/max
    unit: str = ""  # display unit, e.g. "¥", "单", "%"
    numerator: tuple[str, str] | None = None  # (property, value) for rate; equality match
    dimensions: list[Dimension] = field(default_factory=list)
    # Metric-level fixed filters applied to the base rows before grouping and
    # aggregation: each (property, value) keeps only rows where the property
    # equals value (string comparison). Used to pin a metric's 口径, e.g. only
    # 在职 employees for headcount/salary. Empty = no restriction.
    base_filters: list[tuple[str, str]] = field(default_factory=list)


# Chinese display labels for the base object types metrics aggregate over.
# Shared by the metric catalog (API) and query results (a metric's "data
# source" is its base type — consumers link it to that type's lineage).
BASE_LABELS: dict[str, str] = {
    "employee": "员工",
    "department": "部门",
    "position": "职位",
    "performance_review": "绩效考核",
    "application": "招聘投递",
    "training_record": "培训记录",
}

# Registry keyed by metric.key. Covers the HR-only scenario (场景 8.2). Cross-object
# slices use the link-join mechanism: employee → 所属部门 → department.name for the
# department slice, employee → 担任职位 → position.level for the job-grade slice.
_EMP_DEPT_NAME = Dimension("dept_name", "所属部门", "name", via_link="所属部门")
_EMP_POSITION_LEVEL = Dimension("position_level", "职级", "level", via_link="担任职位")
_EMP_CITY = Dimension("city", "城市", "city")

# Chinese labels for base-type *properties* that appear in metric definitions
# but are not dimensions (measures, base_filters, numerator). Dimension labels
# are preferred first; this fills the gap so the derived 口径 description reads
# as natural language instead of raw column names.
_PROP_LABELS: dict[str, str] = {
    "status": "状态",
    "monthly_salary": "月薪",
    "score": "得分",
    "headcount_plan": "编制人数",
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


METRICS: dict[str, Metric] = {
    m.key: m
    for m in [
        # --- HR 人力场景（场景 8.2）---
        Metric(
            key="hr_headcount",
            label="在编人数",
            description="状态为「在职」的员工人数（在编口径）",
            base_type="employee",
            agg="count",
            unit="人",
            base_filters=[("status", "在职")],
            dimensions=[
                _EMP_DEPT_NAME,
                _EMP_CITY,
                _EMP_POSITION_LEVEL,
            ],
        ),
        Metric(
            key="hr_attrition_rate",
            label="离职率",
            description="状态为「离职」的员工占全体员工的比例",
            base_type="employee",
            agg="rate",
            unit="%",
            numerator=("status", "离职"),
            dimensions=[
                _EMP_DEPT_NAME,
                _EMP_CITY,
            ],
        ),
        Metric(
            key="hr_avg_salary",
            label="人均月薪",
            description="在职员工月薪均值（口径：仅统计在职员工的 monthly_salary）",
            base_type="employee",
            agg="avg",
            measure="monthly_salary",
            unit="¥",
            base_filters=[("status", "在职")],
            dimensions=[
                _EMP_DEPT_NAME,
                _EMP_CITY,
                _EMP_POSITION_LEVEL,
            ],
        ),
        Metric(
            key="hr_headcount_plan",
            label="编制人数",
            description="按部门/城市汇总的编制计划人数（headcount_plan）",
            base_type="department",
            agg="sum",
            measure="headcount_plan",
            unit="人",
            dimensions=[
                Dimension("city", "城市", "city"),
                Dimension("dept_name", "部门", "name"),
            ],
        ),
        Metric(
            key="hr_perf_score",
            label="平均绩效分",
            description=(
                "绩效考核平均得分（口径：score 0-100，评级分段 "
                "S≥90 / A 80-89 / B 70-79 / C 60-69 / D<60）"
            ),
            base_type="performance_review",
            agg="avg",
            measure="score",
            unit="分",
            dimensions=[
                Dimension("cycle", "考核周期", "cycle"),
                Dimension("department_name", "部门", "department_name"),
            ],
        ),
        Metric(
            key="hr_application_count",
            label="招聘投递数",
            description="按阶段/渠道统计的招聘投递数量（按阶段看即招聘漏斗）",
            base_type="application",
            agg="count",
            unit="份",
            dimensions=[
                Dimension("stage", "阶段", "stage"),
                Dimension("source", "渠道", "source"),
            ],
        ),
        Metric(
            key="hr_training_count",
            label="培训人次",
            description="按结果（通过/未通过）统计的培训记录数",
            base_type="training_record",
            agg="count",
            unit="人次",
            dimensions=[
                Dimension("result", "结果", "result"),
            ],
        ),
    ]
}
