"""SQLAlchemy ORM models for the app-builder store.

An ``AppDef`` is a versioned business application: the Puck editor's document
(component tree + root props) serialized as a JSON string in ``definition``.
The native runtime renders it with Puck's ``<Render>``; the platform never
executes user HTML/JS — only platform-reviewed components are configurable.
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _uuid() -> str:
    return uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AppDef(Base):
    __tablename__ = "app_defs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Puck document as a JSON string: {"content": [...], "root": {...}, ...}.
    definition: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Bumped by one on every definition/metadata save (PUT).
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Token username of the creator; nullable for tokenless/dev writes.
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )
