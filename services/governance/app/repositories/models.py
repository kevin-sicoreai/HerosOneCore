"""ORM models for the governance store (access matrix / roles + audit log)."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _uuid() -> str:
    return uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    members: Mapped[int] = mapped_column(Integer, default=0)
    can_read: Mapped[bool] = mapped_column(Boolean, default=True)
    can_write: Mapped[bool] = mapped_column(Boolean, default=False)
    can_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    ordinal: Mapped[int] = mapped_column(Integer, default=0)


class SensitiveColumn(Base):
    """A column flagged as sensitive — the source of truth for column-level masking.

    ``dataset_name`` is a dataset identifier: it is matched loosely (against both
    the data-service dataset id and its human name), so the ontology and data
    services can resolve it by whichever they have on hand.
    """

    __tablename__ = "sensitive_columns"
    __table_args__ = (
        UniqueConstraint("dataset_name", "column_name", name="uq_sensitive_column"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    dataset_name: Mapped[str] = mapped_column(String(255), nullable=False)  # source dataset/table (e.g. "employees")
    column_name: Mapped[str] = mapped_column(String(255), nullable=False)   # column (e.g. "monthly_salary")
    level: Mapped[str] = mapped_column(String(64), nullable=False)          # classification label (e.g. "PII-薪酬")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditEvent(Base):
    """Append-only audit log — one row per successful mutating request, platform-wide."""

    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    actor: Mapped[str] = mapped_column(String(128), default="anonymous")
    action: Mapped[str] = mapped_column(String(32))   # HTTP method
    target: Mapped[str] = mapped_column(String(512))  # request path
    source: Mapped[str] = mapped_column(String(64))   # originating service
    status_code: Mapped[int] = mapped_column(Integer, default=0)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
