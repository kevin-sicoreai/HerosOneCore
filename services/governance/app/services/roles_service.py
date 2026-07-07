"""Access matrix (roles). Sourced from the auth service; falls back to the local
seeded roles if auth is unavailable."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import upstream
from app.repositories.models import Role


def list_all(db: Session) -> list[dict]:
    auth_roles = upstream.list_roles()
    if auth_roles:
        return [
            {
                "name": r["name"],
                "members": r.get("member_count", 0),
                "can_read": r["can_read"],
                "can_write": r["can_write"],
                "can_admin": r["can_admin"],
            }
            for r in auth_roles
        ]
    # fallback: local seeded roles (auth service down)
    return [
        {
            "name": r.name,
            "members": r.members,
            "can_read": r.can_read,
            "can_write": r.can_write,
            "can_admin": r.can_admin,
        }
        for r in db.scalars(select(Role).order_by(Role.ordinal))
    ]
