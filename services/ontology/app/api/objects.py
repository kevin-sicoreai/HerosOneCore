"""Object instance endpoints (read from the data plane)."""

from typing import Any

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.core.audit import emit_sensitive_read
from app.core.auth import actor_from_authorization, perms_from_authorization
from app.core.classifications import sensitive_columns_for
from app.core.config import settings
from app.core.db import get_db
from app.schemas.graph import ObjectListOut
from app.services import object_service, object_type_service

router = APIRouter(tags=["objects"])

_MASK = "***"


def _limit(limit: int | None) -> int:
    n = limit or settings.preview_default_limit
    return max(1, min(n, settings.preview_max_limit))


def _mask_sensitive(
    result: dict[str, Any], dataset_ids: set[str], authorization: str | None
) -> tuple[bool, bool]:
    """Redact sensitive column values in-place unless the caller has admin permission.

    Columns stay in the schema (`result["columns"]` is untouched); only the row
    values are replaced with ``***``, so the shape of the response is preserved.

    Returns ``(hit, masked)``: whether the result exposed any sensitive column, and
    whether its values were actually redacted (admins read them in plaintext).
    """
    sensitive: set[str] = set().union(*sensitive_columns_for(dataset_ids).values()) if dataset_ids else set()
    hit = sensitive & set(result["columns"])
    if not hit:
        return False, False
    if perms_from_authorization(authorization).get("can_admin"):
        return True, False
    for row in result["rows"]:
        for col in hit:
            if col in row:
                row[col] = _MASK
    return True, True


@router.get("/object-types/{object_type_id}/objects", response_model=ObjectListOut)
def list_objects(
    object_type_id: str,
    limit: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> ObjectListOut:
    ot = object_type_service.get_or_404(db, object_type_id)
    result = object_service.list_instances(ot, _limit(limit))
    hit, masked = _mask_sensitive(result, object_service.dataset_identifiers(ot), authorization)
    if hit:
        emit_sensitive_read(actor_from_authorization(authorization), ot.display_name, masked)
    return ObjectListOut(row_count=len(result["rows"]), **result)


@router.get("/object-types/{object_type_id}/objects/count")
def count_objects(object_type_id: str, db: Session = Depends(get_db)) -> dict[str, int]:
    ot = object_type_service.get_or_404(db, object_type_id)
    return {"count": object_service.count_instances(ot)}


@router.get(
    "/object-types/{object_type_id}/objects/{pk_value}/linked/{link_type_id}",
    response_model=ObjectListOut,
)
def linked_objects(
    object_type_id: str,
    pk_value: str,
    link_type_id: str,
    limit: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> ObjectListOut:
    ot = object_type_service.get_or_404(db, object_type_id)
    result = object_service.linked(db, ot, pk_value, link_type_id, _limit(limit))
    # Rows belong to the *other* endpoint's object type — mask against its dataset.
    other = object_type_service.get_or_404(db, result["object_type_id"])
    hit, masked = _mask_sensitive(result, object_service.dataset_identifiers(other), authorization)
    if hit:
        emit_sensitive_read(actor_from_authorization(authorization), other.display_name, masked)
    return ObjectListOut(row_count=len(result["rows"]), **result)
