"""SQLAlchemy ORM models for the ontology metadata store.

Object *types*, properties and links are stored here; object *instances* live in
the data plane (the backing dataset's Parquet) and are queried on demand.
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.domain.enums import Cardinality


def _uuid() -> str:
    return uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ObjectType(Base):
    __tablename__ = "object_types"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    api_name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Backing dataset in the data service catalog.
    dataset_id: Mapped[str] = mapped_column(String(64), nullable=False)
    primary_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    color: Mapped[str] = mapped_column(String(32), default="emerald")
    x: Mapped[float] = mapped_column(Float, default=0)
    y: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    properties: Mapped[list["Property"]] = relationship(
        back_populates="object_type",
        cascade="all, delete-orphan",
        order_by="Property.ordinal",
    )


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    object_type_id: Mapped[str] = mapped_column(
        ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    data_type: Mapped[str] = mapped_column(String(64), nullable=False)
    is_primary_key: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ordinal: Mapped[int] = mapped_column(Integer, default=0)

    object_type: Mapped["ObjectType"] = relationship(back_populates="properties")


class LinkType(Base):
    __tablename__ = "link_types"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    api_name: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    from_object_type_id: Mapped[str] = mapped_column(
        ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False
    )
    to_object_type_id: Mapped[str] = mapped_column(
        ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False
    )
    # Join keys: from_object_type.from_property == to_object_type.to_property
    from_property: Mapped[str] = mapped_column(String(128), nullable=False)
    to_property: Mapped[str] = mapped_column(String(128), nullable=False)
    cardinality: Mapped[str] = mapped_column(String(32), default=Cardinality.MANY_TO_ONE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
