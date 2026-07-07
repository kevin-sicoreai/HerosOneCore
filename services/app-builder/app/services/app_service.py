"""Builder app use cases: draft CRUD and publishing."""

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import marketplace
from app.repositories.models import BuilderApp, utcnow_iso
from app.schemas.builder_app import BuilderAppIn


def list_apps(db: Session) -> list[BuilderApp]:
    return list(db.scalars(select(BuilderApp).order_by(BuilderApp.updated_at.desc())))


def get_or_404(db: Session, app_id: str) -> BuilderApp:
    app = db.get(BuilderApp, app_id)
    if app is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "App not found")
    return app


def create(db: Session, payload: BuilderAppIn) -> BuilderApp:
    app = BuilderApp(name=payload.name, definition=payload.definition)
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def update(db: Session, app_id: str, payload: BuilderAppIn) -> BuilderApp:
    app = get_or_404(db, app_id)
    app.name = payload.name
    app.definition = payload.definition
    app.updated_at = utcnow_iso()
    db.commit()
    db.refresh(app)
    return app


def delete(db: Session, app_id: str) -> None:
    app = db.get(BuilderApp, app_id)
    if app is not None:
        db.delete(app)
        db.commit()


def publish(db: Session, app_id: str, desc: str) -> dict:
    app = get_or_404(db, app_id)
    try:
        result = marketplace.publish_app(app.id, app.name, desc, app.definition)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Marketplace unreachable: {exc}"
        ) from exc
    return {"market_app_id": result["id"], "name": result["name"]}
