"""Metric (cube) execution.

Two engines share one entry point (:func:`query`):

  * **cube** (default) — translate the metric + dimension + user filters into a
    Cube load query and read the answer back from Cube. The metric_map.json
    produced by ``app.tools.generate_cube_schema`` says which Cube members a
    metric maps to.
  * **native** — the in-process engine: load object sets from the ontology, join
    via link types, filter, group and aggregate in Python.

The Cube path is best-effort: any error (map missing, Cube down, unmapped
member, …) logs a warning and transparently falls back to native, so a metric
query never fails just because Cube is unavailable. ``result.meta["engine"]``
records which path produced the answer ("cube" / "native" / "native-fallback").
"""

import json
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.clients import cube_service, ontology_service
from app.core.config import settings
from app.core.logging import get_logger
from app.domain.metrics import BASE_LABELS, Dimension, Metric, describe
from app.repositories import object_rows
from app.services import metric_defs
from app.schemas.analysis import FilterSpec
from app.schemas.metrics import (
    CubeMappingOut,
    MetricGroupRow,
    MetricQueryResult,
    MetricSemanticsOut,
    SemanticDimensionOut,
)
from app.services.analyze import _matches, _to_number

logger = get_logger("metric_query")

# Service root = services/analysis (this file is app/services/metric_query.py).
_SERVICE_ROOT = Path(__file__).resolve().parents[2]

# User filter op -> Cube operator.
_CUBE_OPS = {"eq": "equals", "neq": "notEquals", "gt": "gt", "lt": "lt", "contains": "contains"}


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

    def link_by_id(self, link_id: str, base_type_id: str) -> dict[str, Any]:
        """The link with id `link_id`; must touch `base_type_id`. Preferred over
        the display_name lookup — ids are stable across renames."""
        for lk in self.links:
            if lk["id"] != link_id:
                continue
            if base_type_id in (lk["from_object_type_id"], lk["to_object_type_id"]):
                return lk
            break
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"链接 '{link_id}' 不存在或未连接该对象类型"
        )


def _load_rows(object_type_id: str) -> list[dict]:
    # Shared 30s TTL cache with the analyze path; both base and join-far object
    # sets go through it, so repeated metric queries reuse the fetched rows.
    return object_rows.get_rows(object_type_id)


def _enrich_linked_dimension(
    base_rows: list[dict], base_type_id: str, dim: Dimension, onto: _Ontology
) -> None:
    """Fetch the far type across the dimension's link and stamp dim.property onto
    each base row under dim.key. Join key values are compared as strings to avoid
    int/str mismatches between the two data planes."""
    link = (
        onto.link_by_id(dim.via_link_id, base_type_id)
        if dim.via_link_id
        else onto.link(dim.via_link or "", base_type_id)
    )
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
    linked = dim.via_link_id or dim.via_link
    return row.get(dim.key) if linked else row.get(dim.property)


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


# --------------------------------------------------------------------------- #
# Cube metric map                                                             #
# --------------------------------------------------------------------------- #
_map_cache: dict[str, Any] | None = None


def invalidate_metric_map() -> None:
    """Drop the cached metric_map so the next query re-reads it — call after the
    Cube schema (and metric_map.json) is regenerated on a definition write."""
    global _map_cache
    _map_cache = None


def _metric_map() -> dict[str, Any]:
    """Load (and cache) metric_map.json; empty dict if missing/unreadable."""
    global _map_cache
    if _map_cache is not None:
        return _map_cache
    raw = Path(settings.cube_metric_map)
    path = raw if raw.is_absolute() else (_SERVICE_ROOT / raw)
    try:
        _map_cache = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - missing map -> native path
        logger.warning("metric_map unavailable (%s): %s", path, exc)
        _map_cache = {}
    return _map_cache


def _base_cube_dimensions(base_cube: str) -> set[str]:
    """Dimension names declared on the base cube's generated yml.

    Used to validate user filters: sensitive columns are excluded from the
    generated dimensions, so a filter on one is naturally rejected as "not a
    dimension". Reads the sibling cubes/<base_cube>.yml of metric_map.json;
    parsing is intentionally minimal (the generator emits a fixed shape)."""
    raw = Path(settings.cube_metric_map)
    map_path = raw if raw.is_absolute() else (_SERVICE_ROOT / raw)
    yml = map_path.parent / "cubes" / f"{base_cube}.yml"
    names: set[str] = set()
    try:
        lines = yml.read_text(encoding="utf-8").splitlines()
    except OSError:
        return names
    in_dims = False
    for line in lines:
        stripped = line.strip()
        if stripped == "dimensions:":
            in_dims = True
            continue
        if stripped == "measures:" or stripped == "joins:":
            in_dims = False
            continue
        if in_dims and stripped.startswith("- name:"):
            names.add(stripped.split(":", 1)[1].strip())
    return names


def _num(value: Any) -> float:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return 0.0


def _cube_filters(base_cube: str, filters: list[FilterSpec]) -> list[dict]:
    """Translate user filters to Cube filters, validating each field is a
    (non-sensitive) dimension of the base cube."""
    allowed = _base_cube_dimensions(base_cube)
    out: list[dict] = []
    for f in filters:
        if allowed and f.field not in allowed:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"过滤字段 '{f.field}' 不是可用维度（可能为敏感列或不存在）",
            )
        operator = _CUBE_OPS.get(f.op)
        if operator is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"不支持的过滤操作 '{f.op}'")
        out.append(
            {"member": f"{base_cube}.{f.field}", "operator": operator, "values": [str(f.value)]}
        )
    return out


def _query_cube(
    metric: Metric, dim: Dimension | None, filters: list[FilterSpec], limit: int, mapping: dict
) -> MetricQueryResult:
    base_cube = mapping["base_cube"]
    measure = mapping["measure"]
    matched = mapping["matched_measure"]
    cube_filters = _cube_filters(base_cube, filters)

    # Totals + matched rows come from a dimensionless query (the metric's overall
    # value across all matched base rows, in the metric's 口径).
    totals_query: dict[str, Any] = {"measures": [measure, matched], "limit": 1}
    if cube_filters:
        totals_query["filters"] = cube_filters
    totals_data = cube_service.load(totals_query).get("data") or [{}]
    trow = totals_data[0]
    total = _num(trow.get(measure))
    matched_rows = int(_num(trow.get(matched)))

    if dim is None:
        group_rows = [MetricGroupRow(group="整体", value=total)]
    else:
        member = mapping.get("dimensions", {}).get(dim.key)
        if not member:  # map incomplete -> fall back to native
            raise KeyError(f"metric_map has no dimension '{dim.key}' for '{metric.key}'")
        group_query: dict[str, Any] = {
            "measures": [measure],
            "dimensions": [member],
            "order": {measure: "desc"},
            "limit": limit,
        }
        if cube_filters:
            group_query["filters"] = cube_filters
        group_rows = []
        for row in cube_service.load(group_query).get("data") or []:
            key = row.get(member)
            group_rows.append(
                MetricGroupRow(
                    group="（空）" if key in (None, "") else str(key),
                    value=_num(row.get(measure)),
                )
            )

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
        matched_rows=matched_rows,
        meta={"engine": "cube", "base_type": metric.base_type},
    )


def _query_native(
    metric: Metric,
    dim: Dimension | None,
    filters: list[FilterSpec],
    limit: int,
    engine: str,
    reason: str | None = None,
) -> MetricQueryResult:
    onto = _Ontology()
    base_id = onto.type_id(metric.base_type)
    rows = _load_rows(base_id)

    if dim and (dim.via_link_id or dim.via_link):
        _enrich_linked_dimension(rows, base_id, dim, onto)

    # Metric-level fixed filters pin the 口径 (e.g. status=已完成 only) before any grouping.
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

    meta: dict[str, Any] = {"engine": engine, "base_type": metric.base_type}
    if reason:
        meta["reason"] = reason

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
        meta=meta,
    )


def list_semantics() -> list[MetricSemanticsOut]:
    """Read-only semantic view of every metric: derived 口径 description, usable
    dimensions (with their mapped column) and Cube mapping status. Reads the
    declarative definitions (DB-backed catalog) and metric_map.json — no live
    query."""
    mapping_all = _metric_map()
    out: list[MetricSemanticsOut] = []
    for m in metric_defs.get_metrics().values():
        mapping = mapping_all.get(m.key)
        dim_members: dict[str, str] = (mapping or {}).get("dimensions", {})
        dims = [
            SemanticDimensionOut(
                key=d.key,
                label=d.label,
                # Prefer the Cube member when mapped; otherwise the object property
                # (prefixed with the traversed link for cross-object dimensions).
                mapped_column=dim_members.get(d.key)
                or (f"{d.via_link}.{d.property}" if d.via_link else d.property),
            )
            for d in m.dimensions
        ]
        cube = CubeMappingOut(
            mapped=mapping is not None,
            cube=mapping.get("base_cube") if mapping else None,
            measure=mapping.get("measure") if mapping else None,
        )
        out.append(
            MetricSemanticsOut(
                key=m.key,
                label=m.label,
                agg=m.agg,
                unit=m.unit,
                base_type=m.base_type,
                base_label=BASE_LABELS.get(m.base_type, m.base_type),
                description=describe(m),
                dimensions=dims,
                cube=cube,
                engine_default=settings.metrics_engine,
            )
        )
    return out


def query(
    metric_key: str, dimension_key: str | None, filters: list[FilterSpec], limit: int
) -> MetricQueryResult:
    metric = metric_defs.get_metrics().get(metric_key)
    if metric is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"指标 '{metric_key}' 不存在")

    # The "in" operator is an object-set (/analyze) capability only. Reject it here
    # explicitly so it never silently falls through the native engine — the Cube
    # path already rejects it, and this keeps both engines consistent.
    if any(f.op == "in" for f in filters):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "指标查询（/metrics/query）不支持 'in' 过滤算子，请使用对象集查询 /analyze",
        )

    dim: Dimension | None = None
    if dimension_key:
        dim = next((d for d in metric.dimensions if d.key == dimension_key), None)
        if dim is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"指标 '{metric_key}' 无维度 '{dimension_key}'"
            )

    if settings.metrics_engine.lower() == "cube":
        mapping = _metric_map().get(metric.key)
        if mapping:
            try:
                return _query_cube(metric, dim, filters, limit, mapping)
            except HTTPException:
                raise  # a deliberate 400 (e.g. bad filter) must surface, not fall back
            except Exception as exc:  # noqa: BLE001 - any Cube failure -> native
                logger.warning(
                    "Cube metric query failed for '%s', falling back to native: %s",
                    metric.key,
                    exc,
                )
                return _query_native(
                    metric, dim, filters, limit, engine="native-fallback", reason=str(exc)
                )
        return _query_native(
            metric, dim, filters, limit, engine="native-fallback", reason="metric_map unavailable"
        )

    return _query_native(metric, dim, filters, limit, engine="native")
