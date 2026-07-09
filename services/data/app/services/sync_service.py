"""Sync use cases: trigger a run and execute the built-in Postgres -> Parquet load."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import duckdb_loader, source_postgres, storage
from app.core.db import SessionLocal
from app.core.pagination import paginate
from app.core.logging import get_logger
from app.domain.connector_types import is_supported
from app.domain.enums import ConnectorStatus, SyncStatus
from app.events import publishers
from app.repositories.models import Connector, Dataset, DatasetColumn, SyncRun

logger = get_logger("sync")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_run_or_404(db: Session, run_id: str) -> SyncRun:
    run = db.get(SyncRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sync run not found")
    return run


def list_runs_page(
    db: Session,
    connector_id: str,
    *,
    page: int,
    page_size: int,
    status: str | None = None,
) -> tuple[list[SyncRun], int]:
    stmt = select(SyncRun).where(SyncRun.connector_id == connector_id)
    if status:
        stmt = stmt.where(SyncRun.status == status)
    stmt = stmt.order_by(SyncRun.created_at.desc())
    return paginate(db, stmt, page, page_size)


def trigger(db: Session, connector: Connector) -> SyncRun:
    """Create a pending sync run and mark the connector as syncing."""
    if not is_supported(connector.source_type):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Source type '{connector.source_type}' is not supported yet",
        )
    run = SyncRun(connector_id=connector.id, status=SyncStatus.PENDING)
    connector.status = ConnectorStatus.SYNCING
    db.add(run)
    db.commit()
    db.refresh(run)
    publishers.connector_status_changed(connector.id, connector.status)
    return run


def _upsert_dataset(
    db: Session, connector_id: str, table: str, uri: str, result: dict
) -> tuple[Dataset, bool]:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.connector_id == connector_id, Dataset.name == table
        )
    )
    created = dataset is None
    if dataset is None:
        dataset = Dataset(connector_id=connector_id, name=table, storage_uri=uri)
        db.add(dataset)
    dataset.storage_uri = uri
    dataset.row_count = result["row_count"]
    dataset.last_synced_at = _now()

    # Replace columns to reflect the current schema.
    dataset.columns.clear()
    db.flush()
    for ordinal, col in enumerate(result["columns"]):
        dataset.columns.append(
            DatasetColumn(
                name=col["name"],
                data_type=col["data_type"],
                nullable=col["nullable"],
                ordinal=ordinal,
            )
        )
    return dataset, created


def run_sync(connector_id: str, run_id: str) -> None:
    """Background job: extract each source table to Parquet and register datasets.

    Runs with its own session because it executes outside the request lifecycle.
    """
    db = SessionLocal()
    try:
        connector = db.get(Connector, connector_id)
        run = db.get(SyncRun, run_id)
        if connector is None or run is None:
            logger.error("run_sync: connector or run missing (%s / %s)", connector_id, run_id)
            return

        run.status = SyncStatus.RUNNING
        run.started_at = _now()
        db.commit()

        config = connector.config or {}
        tables = config.get("tables") or source_postgres.list_tables(config)

        total_rows = 0
        for table in tables:
            uri = storage.dataset_uri(connector_id, table)
            result = duckdb_loader.copy_table_to_parquet(config, table, uri)
            dataset, created = _upsert_dataset(db, connector_id, table, uri, result)
            db.commit()
            total_rows += result["row_count"]
            if created:
                publishers.dataset_created(dataset.id, connector_id, table)
            publishers.dataset_synced(dataset.id, result["row_count"])

        run.status = SyncStatus.SUCCESS
        run.rows_synced = total_rows
        run.finished_at = _now()
        connector.status = ConnectorStatus.CONNECTED
        db.commit()
        publishers.connector_status_changed(connector_id, connector.status)
        logger.info("sync %s succeeded: %d tables, %d rows", run_id, len(tables), total_rows)
    except Exception as exc:  # noqa: BLE001 - record failure on the run
        logger.exception("sync %s failed", run_id)
        db.rollback()
        run = db.get(SyncRun, run_id)
        connector = db.get(Connector, connector_id)
        if run is not None:
            run.status = SyncStatus.FAILED
            run.error = str(exc)
            run.finished_at = _now()
        if connector is not None:
            connector.status = ConnectorStatus.ERROR
        db.commit()
        if connector is not None:
            publishers.connector_status_changed(connector_id, connector.status)
    finally:
        db.close()
