"""Declarative metric definitions — the bridge between the ``metric_defs`` table
and the in-memory ``Metric`` dataclass the rest of the service consumes.

Responsibilities:

  * **load** — read the DB rows, convert them to ``Metric`` objects, and cache the
    catalog for a short TTL (mirrors ``repositories.object_rows``); the read paths
    (``/metrics``, ``/metrics/semantics``, ``/metrics/query`` and the Cube schema
    generator) all go through :func:`get_metrics`, so the DB is the single source
    of truth.
  * **seed** — on startup, idempotently copy the legacy hardcoded catalog
    (``app.domain.metrics.METRICS``) into the table so an empty DB comes up with
    the current ops metrics, semantics unchanged.
  * **validate** — check a create/update payload against the live ontology
    (types, properties, links) before it is written, returning normalized DB
    fields or a 400 with a Chinese explanation.
  * **regenerate** — after a successful write, re-run the Cube schema generator
    over the current definitions (best-effort; native engine does not depend on
    the generated artifacts).
"""

from __future__ import annotations

import re
import time
from dataclasses import replace
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.clients import ontology_service
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.domain.metrics import METRICS, Dimension, Metric, describe
from app.repositories import metrics_store, object_rows

logger = get_logger("metric_defs")

# Service root = services/analysis (this file is app/services/metric_defs.py).
_SERVICE_ROOT = Path(__file__).resolve().parents[2]

_ALLOWED_AGG = {"count", "sum", "avg", "min", "max", "rate"}
_MEASURE_AGG = {"sum", "avg", "min", "max"}
_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_TTL_SECONDS = 30.0

# DuckDB numeric type prefixes (mirrors the Cube generator / analyze provider).
_NUMERIC_TYPES = {
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL",
}


def _is_numeric(data_type: str) -> bool:
    return data_type.split("(")[0].strip().upper() in _NUMERIC_TYPES


# --------------------------------------------------------------------------- #
# Load + cache                                                                 #
# --------------------------------------------------------------------------- #
# (expires_monotonic, catalog). Rebuilt on a write via invalidate().
_cache: tuple[float, dict[str, Metric]] | None = None


def _link_display_map() -> dict[str, str]:
    """id -> link display_name, best-effort. Only cosmetic (backs the semantics
    fallback column); join resolution itself is by link id, so a failure here
    never affects correctness."""
    try:
        return {lk["id"]: lk["display_name"] for lk in ontology_service.list_link_types()}
    except httpx.HTTPError as exc:
        logger.warning("link display map unavailable: %s", exc)
        return {}


def _row_to_metric(row: Any, link_display: dict[str, str]) -> Metric:
    """Convert a MetricDef row into the in-memory Metric dataclass the query
    engine and Cube generator consume."""
    dims: list[Dimension] = []
    for d in row.dimensions or []:
        src = d.get("source") or {}
        link_id = src.get("link_id")
        if link_id:
            dims.append(
                Dimension(
                    key=d["key"],
                    label=d["label"],
                    property=src["column"],
                    via_link=link_display.get(link_id),
                    via_link_id=link_id,
                )
            )
        else:
            dims.append(Dimension(key=d["key"], label=d["label"], property=src["column"]))

    base_filters = [(f["property"], f["value"]) for f in (row.base_filters or [])]
    numerator = (
        (row.numerator_property, row.numerator_value)
        if row.numerator_property is not None
        else None
    )
    metric = Metric(
        key=row.key,
        label=row.label,
        description=row.description_override or "",
        base_type=row.base_type,
        agg=row.agg,
        measure=row.measure_column,
        unit=row.unit,
        numerator=numerator,
        dimensions=dims,
        base_filters=base_filters,
    )
    # No hand-written 口径 -> derive it from the structure, so GET /metrics reads
    # naturally instead of showing an empty description.
    if not row.description_override:
        metric = replace(metric, description=describe(metric))
    return metric


def get_metrics(force: bool = False) -> dict[str, Metric]:
    """The metric catalog, keyed by metric key, cached for a short TTL. ``force``
    bypasses the cache (used right after a write, before Cube regeneration)."""
    global _cache
    now = time.monotonic()
    if not force and _cache is not None and now < _cache[0]:
        return _cache[1]
    link_display = _link_display_map()
    with SessionLocal() as db:
        rows = metrics_store.list_defs(db)
        catalog = {r.key: _row_to_metric(r, link_display) for r in rows}
    _cache = (now + _TTL_SECONDS, catalog)
    return catalog


def invalidate() -> None:
    """Drop the cached catalog so the next read reflects a just-written change."""
    global _cache
    _cache = None


# --------------------------------------------------------------------------- #
# Ontology validation context                                                  #
# --------------------------------------------------------------------------- #
class _Ctx:
    """Live ontology needed to validate a definition (types, links, properties)."""

    def __init__(self) -> None:
        try:
            types = ontology_service.list_object_types()
            self.links_by_id = {lk["id"]: lk for lk in ontology_service.list_link_types()}
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc
        self._type_by_api = {t["api_name"]: t for t in types}
        self._id_by_api = {t["api_name"]: t["id"] for t in types}
        self._props: dict[str, dict[str, str]] = {}

    def type_id(self, api_name: str) -> str | None:
        return self._id_by_api.get(api_name)

    def props(self, type_id: str) -> dict[str, str]:
        """{property_name: data_type} for a type id (cached per request)."""
        if type_id not in self._props:
            detail = object_rows.get_object_type(type_id)
            self._props[type_id] = {p["name"]: p["data_type"] for p in detail.get("properties", [])}
        return self._props[type_id]


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (text or "").lower()).strip("_")


def validate_and_normalize(body: Any, key: str) -> dict[str, Any]:
    """Validate a create/update payload against the live ontology and return the
    normalized MetricDef column values. Raises 400 (Chinese) on any violation."""
    if not _KEY_RE.match(key):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"指标 key '{key}' 格式非法：应以小写字母开头，仅含小写字母、数字、下划线（^[a-z][a-z0-9_]*$）",
        )
    if body.agg not in _ALLOWED_AGG:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"聚合方式 '{body.agg}' 非法，应为 {'、'.join(sorted(_ALLOWED_AGG))} 之一",
        )

    ctx = _Ctx()
    base_id = ctx.type_id(body.base_type)
    if base_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"来源对象类型 '{body.base_type}' 不存在")
    base_props = ctx.props(base_id)

    # Measure column: required + numeric for sum/avg/min/max; ignored otherwise.
    measure_column: str | None = None
    if body.agg in _MEASURE_AGG:
        if not body.measure_column:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"聚合 '{body.agg}' 需要指定度量列"
            )
        if body.measure_column not in base_props:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"度量列 '{body.measure_column}' 不属于对象 '{body.base_type}'",
            )
        if not _is_numeric(base_props[body.measure_column]):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"度量列 '{body.measure_column}' 不是数值类型，无法用于 '{body.agg}'",
            )
        measure_column = body.measure_column

    # Rate numerator: required + column must exist; ignored for non-rate.
    numerator_property: str | None = None
    numerator_value: str | None = None
    if body.agg == "rate":
        if not body.numerator_property or body.numerator_value in (None, ""):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "占比（rate）指标必须提供分子过滤的列与取值"
            )
        if body.numerator_property not in base_props:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"分子过滤列 '{body.numerator_property}' 不属于对象 '{body.base_type}'",
            )
        numerator_property = body.numerator_property
        numerator_value = str(body.numerator_value)

    # Base (口径) filters: equality pins; every column must exist on the base type.
    base_filters: list[dict[str, str]] = []
    for f in body.base_filters:
        if f.property not in base_props:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"过滤列 '{f.property}' 不属于对象 '{body.base_type}'",
            )
        base_filters.append({"property": f.property, "value": str(f.value)})

    # Dimensions: base column, or a cross-object column reached through a link.
    dimensions: list[dict[str, Any]] = []
    used_keys: set[str] = set()
    for d in body.dimensions:
        src = d.source
        if src.link_id:
            link = ctx.links_by_id.get(src.link_id)
            if link is None:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, f"维度链接 '{src.link_id}' 不存在"
                )
            if base_id == link["from_object_type_id"]:
                far_id = link["to_object_type_id"]
            elif base_id == link["to_object_type_id"]:
                far_id = link["from_object_type_id"]
            else:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"链接 '{link['display_name']}' 未连接对象 '{body.base_type}'",
                )
            if src.column not in ctx.props(far_id):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"沿链接维度列 '{src.column}' 不属于对端对象",
                )
            source: dict[str, Any] = {"link_id": src.link_id, "column": src.column}
        else:
            if src.column not in base_props:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"维度列 '{src.column}' 不属于对象 '{body.base_type}'",
                )
            source = {"column": src.column}

        dim_key = _slug(d.key or "") or _slug(d.label) or _slug(src.column) or "dim"
        base_key = dim_key
        i = 2
        while dim_key in used_keys:  # keep dimension keys unique within the metric
            dim_key = f"{base_key}_{i}"
            i += 1
        used_keys.add(dim_key)
        dimensions.append({"key": dim_key, "label": d.label, "source": source})

    return {
        "label": body.label,
        "agg": body.agg,
        "unit": body.unit or "",
        "base_type": body.base_type,
        "measure_column": measure_column,
        "base_filters": base_filters,
        "numerator_property": numerator_property,
        "numerator_value": numerator_value,
        "dimensions": dimensions,
        "description_override": body.description_override or None,
    }


# --------------------------------------------------------------------------- #
# Seed                                                                         #
# --------------------------------------------------------------------------- #
def seed_from_registry() -> None:
    """Idempotently copy the legacy hardcoded catalog into the table. Existing
    keys are left untouched, so a restart never overwrites edited definitions."""
    with SessionLocal() as db:
        existing = {r.key for r in metrics_store.list_defs(db)}
        pending = [m for m in METRICS.values() if m.key not in existing]
        if not pending:
            return
        # Resolve linked dimensions' display_name -> link id against the ontology.
        try:
            types = {t["api_name"]: t["id"] for t in ontology_service.list_object_types()}
            links = ontology_service.list_link_types()
        except httpx.HTTPError as exc:
            logger.warning("metric seed skipped (ontology unavailable): %s", exc)
            return

        def _link_id(display_name: str, base_id: str) -> str | None:
            for lk in links:
                if lk["display_name"] == display_name and base_id in (
                    lk["from_object_type_id"],
                    lk["to_object_type_id"],
                ):
                    return lk["id"]
            return None

        seeded = 0
        for m in pending:
            base_id = types.get(m.base_type)
            if base_id is None:
                logger.warning("metric seed: base type '%s' not found, skip '%s'", m.base_type, m.key)
                continue
            dims: list[dict[str, Any]] = []
            ok = True
            for d in m.dimensions:
                if d.via_link:
                    lid = _link_id(d.via_link, base_id)
                    if lid is None:
                        logger.warning(
                            "metric seed: link '%s' for '%s' unresolved, skip metric '%s'",
                            d.via_link, d.key, m.key,
                        )
                        ok = False
                        break
                    source: dict[str, Any] = {"link_id": lid, "column": d.property}
                else:
                    source = {"column": d.property}
                dims.append({"key": d.key, "label": d.label, "source": source})
            if not ok:
                continue
            fields = {
                "key": m.key,
                "label": m.label,
                "agg": m.agg,
                "unit": m.unit or "",
                "base_type": m.base_type,
                "measure_column": m.measure,
                "base_filters": [{"property": p, "value": v} for p, v in m.base_filters],
                "numerator_property": m.numerator[0] if m.numerator else None,
                "numerator_value": m.numerator[1] if m.numerator else None,
                "dimensions": dims,
                # Preserve the hand-written description so GET /metrics is unchanged.
                "description_override": m.description,
            }
            metrics_store.create(db, fields=fields, owner="seed")
            seeded += 1
        if seeded:
            invalidate()
            logger.info("seeded %d metric definition(s) from the legacy registry", seeded)


# --------------------------------------------------------------------------- #
# Cube schema regeneration                                                     #
# --------------------------------------------------------------------------- #
def _cube_model_dir() -> Path:
    raw = Path(settings.cube_metric_map)
    p = raw if raw.is_absolute() else (_SERVICE_ROOT / raw)
    return p.parent


def regenerate_cube_schema() -> str | None:
    """Re-run the Cube schema generator over the current definitions. Returns
    None on success or a Chinese warning string on failure (the native engine
    does not depend on the generated artifacts, so a write is never rolled back
    on a generation failure)."""
    from app.tools import generate_cube_schema as gen

    try:
        gen.generate(_cube_model_dir(), metrics=get_metrics(force=True))
        return None
    except Exception as exc:  # noqa: BLE001 - generation is best-effort
        logger.warning("cube schema regeneration failed: %s", exc)
        return f"Cube schema 重新生成失败，指标暂走自研引擎：{exc}"
