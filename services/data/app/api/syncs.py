"""Sync-run endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.sync import SyncRunOut
from app.services import sync_service

router = APIRouter(tags=["syncs"])


@router.get("/syncs/{run_id}", response_model=SyncRunOut)
def get_sync_run(run_id: str, db: Session = Depends(get_db)) -> SyncRunOut:
    return SyncRunOut.model_validate(sync_service.get_run_or_404(db, run_id))
