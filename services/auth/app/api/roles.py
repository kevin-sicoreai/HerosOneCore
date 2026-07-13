"""Role endpoints (source of truth for the governance access matrix)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.repositories.models import Role, User
from app.schemas.auth import RoleOut, RolePatch
from app.services import user_service

router = APIRouter(tags=["roles"])


def _to_out(r: Role) -> RoleOut:
    return RoleOut(
        id=r.id,
        name=r.name,
        can_read=r.can_read,
        can_write=r.can_write,
        can_admin=r.can_admin,
        member_count=len(r.users),
    )


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db)) -> list[RoleOut]:
    return [_to_out(r) for r in user_service.list_roles(db)]


@router.patch("/roles/{role_id}", response_model=RoleOut)
def patch_role(
    role_id: str,
    payload: RolePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoleOut:
    """Toggle a role's capabilities. Admin only; refuses to drop the last admin role."""
    if not user_service.effective_permissions(user).get("can_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires admin permission")
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")

    # Lock-out guard: at least one role with members must keep can_admin.
    if payload.can_admin is False and role.can_admin:
        others = [
            r for r in user_service.list_roles(db)
            if r.id != role.id and r.can_admin and len(r.users) > 0
        ]
        if not others:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "不能取消最后一个管理员角色的管理权限",
            )

    for field in ("can_read", "can_write", "can_admin"):
        value = getattr(payload, field)
        if value is not None:
            setattr(role, field, value)
    db.commit()
    db.refresh(role)
    return _to_out(role)
