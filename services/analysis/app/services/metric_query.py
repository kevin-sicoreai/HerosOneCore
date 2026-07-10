"""Metric (cube) execution: load object sets, join via ontology links, aggregate.

Given a metric and an optional dimension, this loads the base object type's
instances, enriches them with properties from linked types when the dimension
lives across a join, applies filters, then groups and aggregates. All joins are
driven by the ontology's link types (from_property / to_property) resolved at
query time — nothing about the join is hardcoded against the data.
"""

from typing import Any

import httpx
from fastapi import HTTPException, status

from app.clients import ontology_service
from app.domain.metrics import BASE_LABELS, METRICS, Dimension, Metric
from app.repositories import object_rows
from app.schemas.analysis import FilterSpec
from app.schemas.metrics import MetricGroupRow, MetricQueryResult
from app.services.analyze import _matches, _to_number


class _Ontology:
    """Resolved ontology lookup for one query (object types + links)."""

    def __init__(self) -> None:
        try:
            self.types = ontology_service.list_object_types()
            self.links = ontology_service.list_link_types()
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc

    def type_id(self, api_name: str) -> str:
        for t in self.types:
            if api_name in (t["api_name"], t["display_name"], t["id"]):
                return t["id"]
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"对象类型 '{api_name}' 不存在")

    def link(self, display_name: str, base_type_id: str) -> dict[str, Any]:
        """The link named `display_name` that touches `base_type_id`."""
        for lk in self.links:
            if lk["display_name"] != display_name:
                continue
            if base_type_id in (lk["from_object_type_id"], lk["to_object_type_id"]):
                return lk
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"链接 '{display_name}' 不存在或未连接该对象类型"
        )


def _load_rows(object_type_id: str) -> list[dict]:
    # Shared 30s TTL cache with the analyze path; both base and join-far object
    # sets go through it, so repeated metric queries reuse the fetched rows.
    return object_rows.get_rows(object_type_id)


def _enrich_linked_dimension(
    base_rows: list[dict], base_type_id: str, dim: Dimension, onto: _Ontology
) -> None:
    """Fetch the far type across `dim.via_link` and stamp dim.property onto each
    base row under dim.key. Join key values are compared as strings to avoid
    int/str mismatches between the two data planes."""
    link = onto.link(dim.via_link or "", base_type_id)
    if base_type_id == link["from_object_type_id"]:
        base_key, far_key, far_id = (
            link["from_property"],
            link["to_property"],
            link["to_object_type_id"],
        )
    else:  # base is the "to" side — traverse the link in reverse
        base_key, far_key, far_id = (
            link["to_property"],
            link["from_property"],
            link["from_object_type_id"],
        )
    far_lookup = {str(r.get(far_key)): r for r in _load_rows(far_id)}
    for r in base_rows:
        far = far_lookup.get(str(r.get(base_key)))
        r[dim.key] = far.get(dim.property) if far else None


def _dim_value(row: dict, dim: Dimension) -> Any:
    # Linked dimensions are enriched under dim.key; base dimensions read the
    # property directly.
    return row.get(dim.key) if dim.via_link else row.get(dim.property)


def _aggregate(rows: list[dict], metric: Metric) -> float:
    if metric.agg == "count":
        return float(len(rows))
    if metric.agg == "rate":
        if not rows or not metric.numerator:
            return 0.0
        prop, val = metric.numerator
        hits = sum(1 for r in rows if str(r.get(prop)) == val)
        return round(hits / len(rows) * 100, 1)
    values = [n for r in rows if (n := _to_number(r.get(metric.measure))) is not None]
    if not values:
        return 0.0
    if metric.agg == "sum":
        result = sum(values)
    elif metric.agg == "avg":
        result = sum(values) / len(values)
    elif metric.agg == "max":
        result = max(values)
    elif metric.agg == "min":
        result = min(values)
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"未知聚合方式 '{metric.agg}'")
    return round(result, 2)


def query(metric_key: str, dimension_key: str | None, filters: list[FilterSpec], limit: int) -> MetricQueryResult:
    metric = METRICS.get(metric_key)
    if metric is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"指标 '{metric_key}' 不存在")

    dim: Dimension | None = None
    if dimension_key:
        dim = next((d for d in metric.dimensions if d.key == dimension_key), None)
        if dim is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"指标 '{metric_key}' 无维度 '{dimension_key}'"
            )

    onto = _Ontology()
    base_id = onto.type_id(metric.base_type)
    rows = _load_rows(base_id)

    if dim and dim.via_link:
        _enrich_linked_dimension(rows, base_id, dim, onto)

    # Metric-level fixed filters pin the 口径 (e.g. 在职 only) before any grouping.
    if metric.base_filters:
        rows = [
            r
            for r in rows
            if all(str(r.get(prop)) == str(val) for prop, val in metric.base_filters)
        ]

    rows = [r for r in rows if all(_matches(r, f) for f in filters)]

    total = _aggregate(rows, metric)

    if dim is None:
        group_rows = [MetricGroupRow(group="整体", value=total)]
    else:
        buckets: dict[str, list[dict]] = {}
        for r in rows:
            key = _dim_value(r, dim)
            buckets.setdefault("（空）" if key in (None, "") else str(key), []).append(r)
        group_rows = [
            MetricGroupRow(group=key, value=_aggregate(members, metric))
            for key, members in buckets.items()
        ]
        group_rows.sort(key=lambda x: x.value, reverse=True)
        group_rows = group_rows[:limit]

    return MetricQueryResult(
        metric_key=metric.key,
        metric_label=metric.label,
        base_type=metric.base_type,
        base_label=BASE_LABELS.get(metric.base_type, metric.base_type),
        dimension_key=dim.key if dim else None,
        dimension_label=dim.label if dim else None,
        agg=metric.agg,
        unit=metric.unit,
        rows=group_rows,
        total=total,
        matched_rows=len(rows),
        meta={"base_type": metric.base_type},
    )
