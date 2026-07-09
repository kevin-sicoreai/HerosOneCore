"""Governance endpoints: lineage, audit, roles, stats."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import require_token
from app.core.db import get_db
from app.schemas.governance import (
    AuditEntry,
    AuditEventIn,
    ClassificationIn,
    ClassificationOut,
    Lineage,
    RoleOut,
    Stats,
)
from app.services import (
    audit_service,
    classifications_service,
    lineage_service,
    roles_service,
    stats_service,
)

router = APIRouter(tags=["governance"])


@router.get("/lineage", response_model=Lineage)
def get_lineage() -> Lineage:
    return lineage_service.build()


@router.get("/audit", response_model=list[AuditEntry])
def get_audit(limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db)) -> list[AuditEntry]:
    return audit_service.build(db, limit)


@router.post("/audit-events", status_code=status.HTTP_204_NO_CONTENT)
def ingest_audit(
    payload: AuditEventIn,
    db: Session = Depends(get_db),
    _: None = Depends(require_token),
) -> None:
    """Append one audit row. Posted by services (with a service token) on each write."""
    audit_service.record(db, payload)


@router.get("/roles", response_model=list[RoleOut])
def get_roles(db: Session = Depends(get_db)) -> list[RoleOut]:
    return [RoleOut.model_validate(r) for r in roles_service.list_all(db)]


@router.get("/stats", response_model=Stats)
def get_stats(db: Session = Depends(get_db)) -> Stats:
    return stats_service.build(db)


@router.get("/classifications", response_model=list[ClassificationOut])
def get_classifications(db: Session = Depends(get_db)) -> list[ClassificationOut]:
    """Full list of sensitive-column classifications (open read)."""
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
