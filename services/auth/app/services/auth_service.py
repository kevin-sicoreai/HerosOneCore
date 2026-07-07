"""Login + token issuance."""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import encode_jwt, verify_password
from app.repositories.models import User
from app.services import user_service


def login(db: Session, username: str, password: str) -> str:
    user = user_service.get_by_username(db, username)
    if user is None or not verify_password(password, user.password_hash, user.salt):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is disabled")

    perms = user_service.effective_permissions(user)
    token = encode_jwt(
        {
            "sub": user.id,
            "username": user.username,
            "roles": [r.name for r in user.roles],
            "perms": perms,
        }
    )
    return token
