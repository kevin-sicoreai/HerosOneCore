"""Connector endpoints: CRUD, connection test, and sync trigger/history."""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page
from app.schemas.connector import (
    ConnectorCreate,
    ConnectorOut,
    ConnectorUpdate,
    TestConnectionResult,
)
from app.schemas.sync import SyncRunOut
from app.services import connector_service, sync_service

router = APIRouter(tags=["connectors"])


@router.post("/connectors", response_model=ConnectorOut, status_code=status.HTTP_201_CREATED)
def create_connector(payload: ConnectorCreate, db: Session = Depends(get_db)) -> ConnectorOut:
    connector = connector_service.create(db, payload)
    return connector_service.to_out(connector)


@router.get("/connectors", response_model=Page[ConnectorOut])
def list_connectors(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    kind: str | None = Query(default=None, pattern="^(internal|external)$"),
    status: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Page[ConnectorOut]:
    rows, total = connector_service.list_page(
        db, page=page, page_size=page_size, kind=kind, status=status, source_type=source_type, q=q
    )
    return Page.create(
        [connector_service.to_out(c) for c in rows], total, page, page_size
    )


@router.get("/connectors/{connector_id}", response_model=ConnectorOut)
def get_connector(connector_id: str, db: Session = Depends(get_db)) -> ConnectorOut:
    return connector_service.to_out(connector_service.get_or_404(db, connector_id))


@router.patch("/connectors/{connector_id}", response_model=ConnectorOut)
def update_connector(
    connector_id: str, payload: ConnectorUpdate, db: Session = Depends(get_db)
) -> ConnectorOut:
    return connector_service.to_out(connector_service.update(db, connector_id, payload))


@router.delete("/connectors/{connector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connector(connector_id: str, db: Session = Depends(get_db)) -> None:
    connector_service.delete(db, connector_id)


@router.post("/connectors/{connector_id}/test", response_model=TestConnectionResult)
def test_connector(connector_id: str, db: Session = Depends(get_db)) -> TestConnectionResult:
    ok, message = connector_service.test_connection(db, connector_id)
    return TestConnectionResult(ok=ok, message=message)


@router.post(
    "/connectors/{connector_id}/sync",
    response_model=SyncRunOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def sync_connector(
    connector_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> SyncRunOut:
    connector = connector_service.get_or_404(db, connector_id)
    run = sync_service.trigger(db, connector)
    background_tasks.add_task(sync_service.run_sync, connector.id, run.id)
    return SyncRunOut.model_validate(run)


@router.get("/connectors/{connector_id}/syncs", response_model=Page[SyncRunOut])
def list_connector_syncs(
    connector_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Page[SyncRunOut]:
    connector_service.get_or_404(db, connector_id)
    rows, total = sync_service.list_runs_page(
        db, connector_id, page=page, page_size=page_size, status=status
    )
    return Page.create([SyncRunOut.model_validate(r) for r in rows], total, page, page_size)
