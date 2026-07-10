"""The aggregation engine: filter -> group -> aggregate."""

from typing import Any

from fastapi import HTTPException, status

from app.domain.tables import Table
from app.schemas.analysis import AnalyzeRequest, AnalyzeResult, FilterSpec, MetricSpec

AGG_LABEL = {"sum": "合计", "avg": "平均", "count": "计数", "max": "最大", "min": "最小"}


def _matches(row: dict, f: FilterSpec) -> bool:
    value = row.get(f.field)
    if f.op == "eq":
        return str(value) == str(f.value)
    if f.op == "neq":
        return str(value) != str(f.value)
    if f.op == "in":
        # Membership test with the same string tolerance as eq: the source value
        # may be an int while the caller sends strings (or vice versa). A scalar
        # value is treated as a one-element set for convenience.
        candidates = f.value if isinstance(f.value, (list, tuple, set)) else [f.value]
        return str(value) in {str(v) for v in candidates}
    if f.op == "contains":
        return str(f.value) in str(value)
    try:
        target = float(f.value)  # type: ignore[arg-type]
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False
    return number > target if f.op == "gt" else number < target


def _to_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _aggregate(rows: list[dict], metric: MetricSpec) -> float:
    if metric.agg == "count":
        return float(len(rows))
    values = [n for r in rows if (n := _to_number(r.get(metric.field))) is not None]
    if not values:
        return 0.0
    if metric.agg == "sum":
        result = sum(values)
    elif metric.agg == "avg":
        result = sum(values) / len(values)
    elif metric.agg == "max":
        result = max(values)
    else:
        result = min(values)
    return round(result, 2)


def run(table: Table, req: AnalyzeRequest) -> AnalyzeResult:
    columns_by_name = {c.name: c for c in table.columns}
    for m in req.metrics:
        if m.agg != "count" and columns_by_name.get(m.field, None) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown metric field '{m.field}'")
    if req.group_by and req.group_by not in columns_by_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown group field '{req.group_by}'")

    rows = [r for r in table.rows if all(_matches(r, f) for f in req.filters)]

    # Detail mode: no metrics -> filter, optionally sort, then paginate. The full
    # filtered count is reported via matched_rows so the UI can size its pager.
    if not req.metrics:
        matched_rows = len(rows)
        if req.order_by and req.order_by in columns_by_name:
            field = req.order_by
            # Numeric columns sort numerically; otherwise fall back to a stable
            # string key. None sinks to one end. `_to_number` mirrors the
            # aggregation engine's numeric detection.
            def sort_key(r: dict) -> tuple:
                value = r.get(field)
                number = _to_number(value)
                if number is not None:
                    return (0, number, "")
                return (1, 0.0, str(value) if value is not None else "")

            rows = sorted(rows, key=sort_key, reverse=req.order_dir == "desc")
        start = (req.page - 1) * req.page_size
        page_rows = rows[start : start + req.page_size]
        return AnalyzeResult(
            mode="detail",
            columns=[c.label for c in table.columns],
            rows=page_rows,
            totals=[],
            matched_rows=matched_rows,
            page=req.page,
            page_size=req.page_size,
        )

    def metric_label(m: MetricSpec) -> str:
        base = columns_by_name[m.field].label if m.field in columns_by_name else m.field
        return f"{base}·{AGG_LABEL[m.agg]}" if m.agg != "count" else "记录数"

    totals = [_aggregate(rows, m) for m in req.metrics]

    if not req.group_by:
        result_rows: list[dict[str, Any]] = [
            {"group": "全部", **{f"m{i}": t for i, t in enumerate(totals)}}
        ]
        group_label = "汇总"
    else:
        groups: dict[str, list[dict]] = {}
        for r in rows:
            groups.setdefault(str(r.get(req.group_by)), []).append(r)
        result_rows = [
            {"group": key, **{f"m{i}": _aggregate(members, m) for i, m in enumerate(req.metrics)}}
            for key, members in groups.items()
        ]
        result_rows.sort(key=lambda r: r["m0"], reverse=True)
        result_rows = result_rows[: req.limit]
        group_label = columns_by_name[req.group_by].label

    return AnalyzeResult(
        columns=[group_label, *(metric_label(m) for m in req.metrics)],
        rows=result_rows,
        totals=totals,
        matched_rows=len(rows),
    )
