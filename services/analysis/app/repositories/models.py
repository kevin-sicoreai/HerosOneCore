"""SQLAlchemy ORM models for the analysis store.

A ``SavedAnalysis`` is a Contour-style analysis *recipe*: the workbench's
configuration (object type, lens, group-by, measures, user filters, and the
replayable analysis path) serialized as a JSON string in ``definition``. The
service stores and returns it transparently — it never parses or interprets the
recipe, so the frontend owns the schema. Re-opening a saved analysis re-runs the
recipe against current data (values may differ; that is the point).
"""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, DateTime, String, Text
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


class MetricDef(Base):
    """A declarative metric definition — the platform's semantic layer, moved out
    of hardcoded Python (``app.domain.metrics.METRICS``) into the database so it
    can be authored from the UI. The read path (``/metrics``, ``/metrics/query``,
    the Cube schema generator) loads these rows and converts them into the
    in-memory ``Metric`` dataclass, keeping one single source of truth.

    ``key`` is the natural primary key (stable, ``^[a-z][a-z0-9_]*$``). JSON
    columns hold the small nested structures; a linked dimension stores the
    ontology ``link_id`` + the far-type column, from which the generator derives
    the Cube join and the native engine resolves the traversal.
    """

    __tablename__ = "metric_defs"

    # Natural key (also the Cube measure name); unique + stable.
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # count | sum | avg | min | max | rate
    agg: Mapped[str] = mapped_column(String(16), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    # base object type api_name, e.g. "employee".
    base_type: Mapped[str] = mapped_column(String(128), nullable=False)
    # Numeric base property for sum/avg/min/max; null for count/rate.
    measure_column: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Fixed 口径 filters: [{"property": ..., "value": ...}, ...].
    base_filters: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    # rate numerator (equality match); null for non-rate metrics.
    numerator_property: Mapped[str | None] = mapped_column(String(128), nullable=True)
    numerator_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Slices: [{"key", "label", "source": {"column"} | {"link_id", "column"}}].
    dimensions: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    # Hand-written 口径 sentence for GET /metrics; null -> derive with describe().
    description_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Token username of the creator; nullable for tokenless/dev writes.
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )
