"""SQLAlchemy ORM models for the analysis store.

A ``SavedAnalysis`` is a Contour-style analysis *recipe*: the workbench's
configuration (object type, lens, group-by, measures, user filters, and the
replayable analysis path) serialized as a JSON string in ``definition``. The
service stores and returns it transparently — it never parses or interprets the
recipe, so the frontend owns the schema. Re-opening a saved analysis re-runs the
recipe against current data (values may differ; that is the point).
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _uuid() -> str:
    return uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SavedAnalysis(Base):
    __tablename__ = "saved_analyses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Token username of the creator; nullable for tokenless/dev writes.
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Recipe as a JSON string; opaque to the service.
    definition: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )
