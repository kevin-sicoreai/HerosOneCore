"""Sensitive-column classifications — the source of truth for column-level masking.

`list_all` returns every registered classification; `upsert` is idempotent on
(dataset_name, column_name) — re-registering the same column updates its level/
note instead of creating a duplicate.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.repositories.models import SensitiveColumn
from app.schemas.governance import ClassificationIn


def list_all(db: Session) -> list[SensitiveColumn]:
    return list(db.scalars(select(SensitiveColumn).order_by(SensitiveColumn.dataset_name, SensitiveColumn.column_name)))


def upsert(db: Session, payload: ClassificationIn) -> SensitiveColumn:
    """Create the classification, or update level/note if the column is already registered."""
    row = db.scalar(
        select(SensitiveColumn).where(
            SensitiveColumn.dataset_name == payload.dataset_name,
            SensitiveColumn.column_name == payload.column_name,
        )
    )
    if row is None:
        row = SensitiveColumn(
            dataset_name=payload.dataset_name,
            column_name=payload.column_name,
            level=payload.level,
            note=payload.note,
        )
        db.add(row)
    else:
        row.level = payload.level
        row.note = payload.note
    db.commit()
    db.refresh(row)
    return row


def delete(db: Session, classification_id: str) -> bool:
    row = db.get(SensitiveColumn, classification_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
