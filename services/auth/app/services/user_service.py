"""User + role use cases."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.repositories.models import Role, User
from app.schemas.auth import UserCreate


def get_or_404(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def get_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def create(db: Session, payload: UserCreate) -> User:
    if get_by_username(db, payload.username):
        raise HTTPException(status.HTTP_409_CONFLICT, f"username '{payload.username}' already exists")
    digest, salt = hash_password(payload.password)
    user = User(username=payload.username, email=payload.email, password_hash=digest, salt=salt)
    for rid in payload.role_ids:
        role = db.get(Role, rid)
        if role is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"role not found: {rid}")
        user.roles.append(role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_all(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


def list_roles(db: Session) -> list[Role]:
    return list(db.scalars(select(Role).order_by(Role.ordinal)))


def effective_permissions(user: User) -> dict[str, bool]:
    return {
        "can_read": any(r.can_read for r in user.roles),
        "can_write": any(r.can_write for r in user.roles),
        "can_admin": any(r.can_admin for r in user.roles),
    }
