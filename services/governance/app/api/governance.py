"""Governance endpoints: lineage, audit, roles, stats."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import require_token
from app.core.db import get_db
from app.schemas.governance import (
    AuditEventIn,
    AuditPage,
    ClassificationIn,
    ClassificationOut,
    Lineage,
    RoleOut,
    Stats,
)
from app.services import (
    audit_service,
    catalog_service,
    classifications_service,
    lineage_service,
    roles_service,
    stats_service,
)

router = APIRouter(tags=["governance"])


@router.get("/lineage", response_model=Lineage)
def get_lineage(_: None = Depends(require_token)) -> Lineage:
    return lineage_service.build()


@router.get("/audit", response_model=AuditPage)
def get_audit(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    source: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(require_token),
) -> AuditPage:
    items, total = audit_service.list_page(
        db, page=page, page_size=page_size, source=source, q=q
    )
    return AuditPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=audit_service.page_count(total, page_size),
    )


@router.post("/audit-events", status_code=status.HTTP_204_NO_CONTENT)
def ingest_audit(
    payload: AuditEventIn,
    db: Session = Depends(get_db),
    _: None = Depends(require_token),
) -> None:
    """Append one audit row. Posted by services (with a service token) on each write."""
    audit_service.record(db, payload)


@router.get("/roles", response_model=list[RoleOut])
def get_roles(db: Session = Depends(get_db), _: None = Depends(require_token)) -> list[RoleOut]:
    return [RoleOut.model_validate(r) for r in roles_service.list_all(db)]


@router.get("/stats", response_model=Stats)
def get_stats(db: Session = Depends(get_db), _: None = Depends(require_token)) -> Stats:
    return stats_service.build(db)


@router.get("/classifications", response_model=list[ClassificationOut])
def get_classifications(
    db: Session = Depends(get_db), _: None = Depends(require_token)
) -> list[ClassificationOut]:
    """Full list of sensitive-column classifications."""
    return [ClassificationOut.model_validate(c) for c in classifications_service.list_all(db)]


@router.post("/classifications", response_model=ClassificationOut)
def upsert_classification(
    payload: ClassificationIn,
    db: Session = Depends(get_db),
    _: None = Depends(require_token),
) -> ClassificationOut:
    """Register a sensitive column. Idempotent on (dataset_name, column_name)."""
    return ClassificationOut.model_validate(classifications_service.upsert(db, payload))


@router.delete("/classifications/{classification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classification(
    classification_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_token),
) -> None:
    if not classifications_service.delete(db, classification_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classification not found")


@router.get("/catalog/status")
def catalog_status(_: None = Depends(require_token)) -> dict:
    """Publisher config + OM reachability + last sync outcome."""
    return catalog_service.status()


@router.post("/catalog/sync")
def catalog_sync(_: None = Depends(require_token)) -> dict:
    """Push all platform assets + lineage into the configured catalog."""
    result = catalog_service.sync()
    if "error" in result:
        raise HTTPException(status.HTTP_409_CONFLICT, result["error"])
    return result
