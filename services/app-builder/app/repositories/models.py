"""ORM models for builder app definitions."""

import datetime
import uuid

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _new_id() -> str:
    return uuid.uuid4().hex


def utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class BuilderApp(Base):
    __tablename__ = "builder_apps"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(120), default="未命名应用")
    # Reserved for per-user / per-org scoping once the auth service exists.
    owner_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # The builder's draft JSON: {name, sections: [{id, widgets: [...]}]}.
    # Owned by the frontend schema; stored opaquely here.
    definition: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), default=utcnow_iso)
    updated_at: Mapped[str] = mapped_column(String(40), default=utcnow_iso)
