"""Catalog endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.market_app import MarketAppDetailOut, MarketAppOut, PublishRequest
from app.services import market_service

router = APIRouter(tags=["apps"])


def _to_out(app) -> MarketAppOut:
    out = MarketAppOut.model_validate(app)
    out.has_definition = app.definition is not None
    return out


@router.get("/apps", response_model=list[MarketAppOut])
def list_apps(
    tag: str | None = Query(default=None), db: Session = Depends(get_db)
) -> list[MarketAppOut]:
    return [_to_out(a) for a in market_service.list_apps(db, tag)]


@router.get("/apps/{app_id}", response_model=MarketAppDetailOut)
def get_app(app_id: str, db: Session = Depends(get_db)) -> MarketAppDetailOut:
    app = market_service.get_or_404(db, app_id)
    out = MarketAppDetailOut.model_validate(app)
    out.has_definition = app.definition is not None
    return out


@router.post("/apps", response_model=MarketAppOut, status_code=201)
def publish_app(payload: PublishRequest, db: Session = Depends(get_db)) -> MarketAppOut:
    return _to_out(market_service.publish(db, payload))


@router.post("/apps/{app_id}/deploy", response_model=MarketAppOut)
def deploy_app(app_id: str, db: Session = Depends(get_db)) -> MarketAppOut:
    return _to_out(market_service.deploy(db, app_id))


@router.post("/apps/{app_id}/undeploy", response_model=MarketAppOut)
def undeploy_app(app_id: str, db: Session = Depends(get_db)) -> MarketAppOut:
    return _to_out(market_service.undeploy(db, app_id))
