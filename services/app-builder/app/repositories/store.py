"""Persistence use cases for app definitions (CRUD + publish toggling).

Kept deliberately thin: the API layer maps HTTP <-> schemas, this layer owns the
SQLAlchemy session interactions and the version-bump / publish invariants.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.repositories.models import AppDef

# Empty Puck document: no components, empty root props. Matches the shape the
# frontend's <Puck> / <Render> expect so a freshly created app opens cleanly.
EMPTY_DEFINITION = '{"content":[],"root":{}}'


def list_apps(db: Session) -> list[AppDef]:
    return list(db.scalars(select(AppDef).order_by(AppDef.updated_at.desc())))


def get(db: Session, app_id: str) -> AppDef | None:
    return db.get(AppDef, app_id)


def create(
    db: Session,
    *,
    name: str,
    description: str | None,
    definition: str | None,
    owner: str | None,
) -> AppDef:
    app = AppDef(
        name=name,
        description=description,
        definition=definition or EMPTY_DEFINITION,
        version=1,
        published=False,
        owner=owner,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def update(
    db: Session,
    app: AppDef,
    *,
    name: str | None,
    description: str | None,
    definition: str | None,
) -> AppDef:
    """Apply the provided fields and bump the version. Unset fields are left as-is."""
    if name is not None:
        app.name = name
    if description is not None:
        app.description = description
    if definition is not None:
        app.definition = definition
    app.version += 1
    db.commit()
    db.refresh(app)
    return app


def set_published(db: Session, app: AppDef, published: bool) -> AppDef:
    app.published = published
    db.commit()
    db.refresh(app)
    return app


def delete(db: Session, app: AppDef) -> None:
    db.delete(app)
    db.commit()
