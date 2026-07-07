"""Login + current-user endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.repositories.models import User
from app.schemas.auth import LoginRequest, MeOut, Permissions, TokenOut
from app.services import auth_service, user_service

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenOut:
    token = auth_service.login(db, payload.username, payload.password)
    return TokenOut(access_token=token)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)) -> MeOut:
    perms = user_service.effective_permissions(user)
    return MeOut(
        id=user.id,
        username=user.username,
        roles=[r.name for r in user.roles],
        permissions=Permissions(**perms),
    )
