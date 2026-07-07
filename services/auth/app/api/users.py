"""User endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.repositories.models import User
from app.schemas.auth import UserCreate, UserOut
from app.services import user_service

router = APIRouter(tags=["users"])


def _to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        created_at=user.created_at,
        roles=[{"id": r.id, "name": r.name} for r in user.roles],
    )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    return _to_out(user_service.create(db, payload))


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[UserOut]:
    return [_to_out(u) for u in user_service.list_all(db)]


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db)) -> UserOut:
    return _to_out(user_service.get_or_404(db, user_id))
