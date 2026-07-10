"""Application definition endpoints (CRUD + publish/unpublish)."""

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import actor_from_authorization
from app.core.db import get_db
from app.repositories import store
from app.schemas.app_def import AppCreate, AppDetail, AppSummary, AppUpdate

router = APIRouter(tags=["apps"])


def _get_or_404(db: Session, app_id: str):
    app = store.get(db, app_id)
    if app is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "App not found")
    return app


@router.get("/apps", response_model=list[AppSummary])
def list_apps(db: Session = Depends(get_db)) -> list[AppSummary]:
    return [AppSummary.model_validate(a) for a in store.list_apps(db)]


@router.post("/apps", response_model=AppDetail, status_code=status.HTTP_201_CREATED)
def create_app(
    payload: AppCreate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> AppDetail:
    app = store.create(
        db,
        name=payload.name,
        description=payload.description,
        definition=payload.definition,
        owner=actor_from_authorization(authorization),
    )
    return AppDetail.model_validate(app)


@router.get("/apps/{app_id}", response_model=AppDetail)
def get_app(app_id: str, db: Session = Depends(get_db)) -> AppDetail:
    return AppDetail.model_validate(_get_or_404(db, app_id))


@router.put("/apps/{app_id}", response_model=AppDetail)
def update_app(app_id: str, payload: AppUpdate, db: Session = Depends(get_db)) -> AppDetail:
    app = _get_or_404(db, app_id)
    app = store.update(
        db,
        app,
        name=payload.name,
        description=payload.description,
        definition=payload.definition,
    )
    return AppDetail.model_validate(app)


@router.post("/apps/{app_id}/publish", response_model=AppDetail)
def publish_app(app_id: str, db: Session = Depends(get_db)) -> AppDetail:
    app = _get_or_404(db, app_id)
    return AppDetail.model_validate(store.set_published(db, app, True))


@router.post("/apps/{app_id}/unpublish", response_model=AppDetail)
def unpublish_app(app_id: str, db: Session = Depends(get_db)) -> AppDetail:
    app = _get_or_404(db, app_id)
    return AppDetail.model_validate(store.set_published(db, app, False))


@router.delete("/apps/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_app(app_id: str, db: Session = Depends(get_db)) -> None:
    store.delete(db, _get_or_404(db, app_id))
