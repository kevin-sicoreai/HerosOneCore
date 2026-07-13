"""Persistence use cases for declarative metric definitions (CRUD).

Thin by design (mirrors ``analyses_store``): the API layer owns HTTP mapping and
auth, the service layer owns validation and Cube regeneration, and this layer
owns the SQLAlchemy session interactions. JSON columns are handled natively by
SQLAlchemy, so rows carry Python lists/dicts directly.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.repositories.models import MetricDef


def list_defs(db: Session) -> list[MetricDef]:
    return list(db.scalars(select(MetricDef).order_by(MetricDef.created_at.asc())))


def get(db: Session, key: str) -> MetricDef | None:
    return db.get(MetricDef, key)


def create(db: Session, *, fields: dict[str, Any], owner: str | None) -> MetricDef:
    metric = MetricDef(owner=owner, **fields)
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


def update(db: Session, metric: MetricDef, *, fields: dict[str, Any]) -> MetricDef:
    """Overwrite the mutable definition fields (key is immutable)."""
    for name, value in fields.items():
        setattr(metric, name, value)
    db.commit()
    db.refresh(metric)
    return metric


def delete(db: Session, metric: MetricDef) -> None:
    db.delete(metric)
    db.commit()
