"""Persistence use cases for saved analyses (CRUD).

Kept deliberately thin: the API layer maps HTTP <-> schemas and owns the
ownership checks, this layer owns the SQLAlchemy session interactions. The
``definition`` is a JSON string handled opaquely.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.repositories.models import SavedAnalysis


def list_analyses(db: Session) -> list[SavedAnalysis]:
    return list(db.scalars(select(SavedAnalysis).order_by(SavedAnalysis.updated_at.desc())))


def get(db: Session, analysis_id: str) -> SavedAnalysis | None:
    return db.get(SavedAnalysis, analysis_id)


def create(db: Session, *, name: str, definition: str, owner: str | None) -> SavedAnalysis:
    analysis = SavedAnalysis(name=name, definition=definition, owner=owner)
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


def update(
    db: Session,
    analysis: SavedAnalysis,
    *,
    name: str | None,
    definition: str | None,
) -> SavedAnalysis:
    """Apply the provided fields. Unset fields are left as-is."""
    if name is not None:
        analysis.name = name
    if definition is not None:
        analysis.definition = definition
    db.commit()
    db.refresh(analysis)
    return analysis


def delete(db: Session, analysis: SavedAnalysis) -> None:
    db.delete(analysis)
    db.commit()
