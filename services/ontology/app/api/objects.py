"""Object instance endpoints (read from the data plane)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.schemas.graph import ObjectListOut
from app.services import object_service, object_type_service

router = APIRouter(tags=["objects"])


def _limit(limit: int | None) -> int:
    n = limit or settings.preview_default_limit
    return max(1, min(n, settings.preview_max_limit))


@router.get("/object-types/{object_type_id}/objects", response_model=ObjectListOut)
def list_objects(
    object_type_id: str, limit: int | None = Query(default=None, ge=1), db: Session = Depends(get_db)
) -> ObjectListOut:
    ot = object_type_service.get_or_404(db, object_type_id)
    result = object_service.list_instances(ot, _limit(limit))
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
) -> ObjectListOut:
    ot = object_type_service.get_or_404(db, object_type_id)
    result = object_service.linked(db, ot, pk_value, link_type_id, _limit(limit))
    return ObjectListOut(row_count=len(result["rows"]), **result)
