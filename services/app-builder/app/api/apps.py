"""Builder app endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.builder_app import BuilderAppIn, BuilderAppOut, PublishRequest, PublishResult
from app.services import app_service

router = APIRouter(tags=["apps"])


@router.get("/apps", response_model=list[BuilderAppOut])
def list_apps(db: Session = Depends(get_db)) -> list[BuilderAppOut]:
    return [BuilderAppOut.model_validate(a) for a in app_service.list_apps(db)]


@router.post("/apps", response_model=BuilderAppOut, status_code=201)
def create_app(payload: BuilderAppIn, db: Session = Depends(get_db)) -> BuilderAppOut:
    return BuilderAppOut.model_validate(app_service.create(db, payload))


@router.get("/apps/{app_id}", response_model=BuilderAppOut)
def get_app(app_id: str, db: Session = Depends(get_db)) -> BuilderAppOut:
    return BuilderAppOut.model_validate(app_service.get_or_404(db, app_id))


@router.put("/apps/{app_id}", response_model=BuilderAppOut)
def update_app(app_id: str, payload: BuilderAppIn, db: Session = Depends(get_db)) -> BuilderAppOut:
    return BuilderAppOut.model_validate(app_service.update(db, app_id, payload))


@router.delete("/apps/{app_id}", status_code=204)
def delete_app(app_id: str, db: Session = Depends(get_db)) -> None:
    app_service.delete(db, app_id)


@router.post("/apps/{app_id}/publish", response_model=PublishResult)
def publish_app(
    app_id: str, payload: PublishRequest, db: Session = Depends(get_db)
) -> PublishResult:
    return PublishResult(**app_service.publish(db, app_id, payload.desc))
