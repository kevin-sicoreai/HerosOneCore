"""Builder app use cases: draft CRUD and publishing."""

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import marketplace
from app.repositories.models import BuilderApp, utcnow_iso
from app.schemas.builder_app import BuilderAppIn


# Visibility rule: drafts with owner_id NULL are the shared/public scope
# (visible to everyone, incl. anonymous); owned drafts belong to one user.


def _visible(app: BuilderApp, owner_id: str | None) -> bool:
    return app.owner_id is None or app.owner_id == owner_id


def list_apps(db: Session, owner_id: str | None) -> list[BuilderApp]:
    stmt = select(BuilderApp).order_by(BuilderApp.updated_at.desc())
    if owner_id is None:
        stmt = stmt.where(BuilderApp.owner_id.is_(None))
    else:
        stmt = stmt.where((BuilderApp.owner_id == owner_id) | (BuilderApp.owner_id.is_(None)))
    return list(db.scalars(stmt))


def get_or_404(db: Session, app_id: str, owner_id: str | None) -> BuilderApp:
    app = db.get(BuilderApp, app_id)
    if app is None or not _visible(app, owner_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "App not found")
    return app


def create(db: Session, payload: BuilderAppIn, owner_id: str | None) -> BuilderApp:
    app = BuilderApp(name=payload.name, definition=payload.definition, owner_id=owner_id)
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def update(db: Session, app_id: str, payload: BuilderAppIn, owner_id: str | None) -> BuilderApp:
    app = get_or_404(db, app_id, owner_id)
    app.name = payload.name
    app.definition = payload.definition
    app.updated_at = utcnow_iso()
    db.commit()
    db.refresh(app)
    return app


def delete(db: Session, app_id: str, owner_id: str | None) -> None:
    app = db.get(BuilderApp, app_id)
    if app is not None and _visible(app, owner_id):
        db.delete(app)
        db.commit()


def publish(db: Session, app_id: str, desc: str, owner_id: str | None) -> dict:
    app = get_or_404(db, app_id, owner_id)
    try:
        result = marketplace.publish_app(app.id, app.name, desc, app.definition)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Marketplace unreachable: {exc}"
        ) from exc
    return {"market_app_id": result["id"], "name": result["name"]}
