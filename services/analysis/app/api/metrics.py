"""Metric (cube) endpoints.

Reads — the metric catalog, its 口径 semantics, and query execution — are open and
served from the declarative definitions in the ``metric_defs`` table (loaded via
``metric_defs.get_metrics``). Writes — create / update / delete a definition —
require admin: they validate the payload against the live ontology, persist it,
re-generate the Cube schema, and emit an audit event.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import emit_event
from app.core.auth import actor_from_authorization, perms_from_authorization
from app.core.db import get_db
from app.domain.metrics import BASE_LABELS as _BASE_LABELS
from app.repositories import metrics_store
from app.repositories.models import MetricDef
from app.schemas.metrics import (
    DimensionOut,
    MetricDefBody,
    MetricDefDimensionOut,
    MetricDefIn,
    MetricDefOut,
    MetricDimensionSource,
    MetricFilterIn,
    MetricOut,
    MetricQueryRequest,
    MetricQueryResult,
    MetricSemanticsOut,
)
from app.services import metric_defs, metric_query

router = APIRouter(tags=["metrics"])


# --------------------------------------------------------------------------- #
# Reads                                                                        #
# --------------------------------------------------------------------------- #
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
        for m in metric_defs.get_metrics().values()
    ]


@router.post("/metrics/query", response_model=MetricQueryResult)
def query_metric(req: MetricQueryRequest) -> MetricQueryResult:
    return metric_query.query(req.metric, req.dimension, req.filters, req.limit)


# --------------------------------------------------------------------------- #
# Definition management (admin)                                                #
# --------------------------------------------------------------------------- #
def _require_admin(authorization: str | None) -> str:
    """Resolve the caller and require admin. 401 without a valid token, 403 for a
    non-admin. Returns the actor username for the audit trail."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "缺少身份令牌")
    actor = actor_from_authorization(authorization)
    if actor == "anonymous":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "身份令牌无效")
    if not perms_from_authorization(authorization).get("can_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "需要管理员权限")
    return actor


def _def_out(row: MetricDef, warning: str | None = None) -> MetricDefOut:
    return MetricDefOut(
        key=row.key,
        label=row.label,
        agg=row.agg,
        unit=row.unit,
        base_type=row.base_type,
        measure_column=row.measure_column,
        base_filters=[MetricFilterIn(**f) for f in (row.base_filters or [])],
        numerator_property=row.numerator_property,
        numerator_value=row.numerator_value,
        dimensions=[
            MetricDefDimensionOut(
                key=d["key"],
                label=d["label"],
                source=MetricDimensionSource(**d["source"]),
            )
            for d in (row.dimensions or [])
        ],
        description_override=row.description_override,
        owner=row.owner,
        warning=warning,
    )


@router.get("/metrics/{key}/definition", response_model=MetricDefOut)
def get_metric_definition(key: str, db: Session = Depends(get_db)) -> MetricDefOut:
    """Full stored definition — backs the admin edit form's prefill."""
    row = metrics_store.get(db, key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"指标 '{key}' 不存在")
    return _def_out(row)


def _after_write(actor: str, verb: str, row: MetricDef) -> str | None:
    """Shared post-write side effects: drop the cache, regenerate the Cube schema,
    and audit. Returns the regeneration warning (or None)."""
    metric_defs.invalidate()
    warning = metric_defs.regenerate_cube_schema()
    metric_query.invalidate_metric_map()  # pick up the regenerated map on next query
    emit_event(actor, f"{verb}指标 {row.label}({row.key})", row.label)
    return warning


@router.post("/metrics", response_model=MetricDefOut, status_code=status.HTTP_201_CREATED)
def create_metric(
    payload: MetricDefIn,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> MetricDefOut:
    actor = _require_admin(authorization)
    if metrics_store.get(db, payload.key) is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"指标 key '{payload.key}' 已存在")
    fields = metric_defs.validate_and_normalize(payload, payload.key)
    row = metrics_store.create(db, fields={"key": payload.key, **fields}, owner=actor)
    warning = _after_write(actor, "创建", row)
    return _def_out(row, warning)


@router.put("/metrics/{key}", response_model=MetricDefOut)
def update_metric(
    key: str,
    payload: MetricDefBody,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> MetricDefOut:
    actor = _require_admin(authorization)
    row = metrics_store.get(db, key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"指标 '{key}' 不存在")
    fields = metric_defs.validate_and_normalize(payload, key)
    row = metrics_store.update(db, row, fields=fields)
    warning = _after_write(actor, "更新", row)
    return _def_out(row, warning)


@router.delete("/metrics/{key}", status_code=status.HTTP_204_NO_CONTENT)
def delete_metric(
    key: str,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> None:
    actor = _require_admin(authorization)
    row = metrics_store.get(db, key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"指标 '{key}' 不存在")
    label, mkey = row.label, row.key
    metrics_store.delete(db, row)
    metric_defs.invalidate()
    metric_defs.regenerate_cube_schema()
    metric_query.invalidate_metric_map()
    emit_event(actor, f"删除指标 {label}({mkey})", label)
