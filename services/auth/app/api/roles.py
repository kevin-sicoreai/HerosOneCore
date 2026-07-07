"""Role endpoints (source of truth for the governance access matrix)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.auth import RoleOut
from app.services import user_service

router = APIRouter(tags=["roles"])


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db)) -> list[RoleOut]:
    return [
        RoleOut(
            id=r.id,
            name=r.name,
            can_read=r.can_read,
            can_write=r.can_write,
            can_admin=r.can_admin,
            member_count=len(r.users),
        )
        for r in user_service.list_roles(db)
    ]
