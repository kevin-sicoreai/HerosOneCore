"""Governance endpoints: lineage, audit, roles, stats."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.governance import AuditEntry, Lineage, RoleOut, Stats
from app.services import audit_service, lineage_service, roles_service, stats_service

router = APIRouter(tags=["governance"])


@router.get("/lineage", response_model=Lineage)
def get_lineage() -> Lineage:
    return lineage_service.build()


@router.get("/audit", response_model=list[AuditEntry])
def get_audit(limit: int = Query(default=100, ge=1, le=1000)) -> list[AuditEntry]:
    return audit_service.build(limit)


@router.get("/roles", response_model=list[RoleOut])
def get_roles(db: Session = Depends(get_db)) -> list[RoleOut]:
    return [RoleOut.model_validate(r) for r in roles_service.list_all(db)]


@router.get("/stats", response_model=Stats)
def get_stats(db: Session = Depends(get_db)) -> Stats:
    return stats_service.build(db)
