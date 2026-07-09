"""Dataset use cases: catalog listing, detail/schema, and preview."""

import os
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import duckdb_loader
from app.core.config import settings
from app.core.pagination import paginate
from app.repositories.models import Connector, Dataset, DatasetColumn
from app.schemas.dataset import DatasetRegister


def get_or_404(db: Session, dataset_id: str) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
    return dataset


def list_page(
    db: Session,
    *,
    page: int,
    page_size: int,
    connector_id: str | None = None,
    layer: str | None = None,
    q: str | None = None,
) -> tuple[list[Dataset], int]:
    stmt = select(Dataset)
    if connector_id:
        stmt = stmt.where(Dataset.connector_id == connector_id)
    if layer:
        stmt = stmt.where(Dataset.layer == layer)
    if q:
        stmt = stmt.where(Dataset.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Dataset.created_at.desc())
    return paginate(db, stmt, page, page_size)


def register(db: Session, payload: DatasetRegister) -> Dataset:
    """Register (or update) a dataset produced inside the platform, e.g. a pipeline mart."""
    if db.get(Connector, payload.connector_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"connector not found: {payload.connector_id}")

    dataset = db.scalar(
        select(Dataset).where(Dataset.connector_id == payload.connector_id, Dataset.name == payload.name)
    )
    if dataset is None:
        dataset = Dataset(connector_id=payload.connector_id, name=payload.name, storage_uri=payload.storage_uri)
        db.add(dataset)
    dataset.storage_uri = payload.storage_uri
    dataset.layer = payload.layer
    dataset.row_count = payload.row_count
    dataset.last_synced_at = datetime.now(timezone.utc)

    dataset.columns.clear()
    db.flush()
    for ordinal, col in enumerate(payload.columns):
        dataset.columns.append(
            DatasetColumn(name=col.name, data_type=col.data_type, nullable=col.nullable, ordinal=ordinal)
        )
    db.commit()
    db.refresh(dataset)
    return dataset


def preview(db: Session, dataset_id: str, limit: int | None = None) -> dict:
    dataset = get_or_404(db, dataset_id)
    if not os.path.exists(dataset.storage_uri):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Dataset has no materialized data yet; run a sync first",
        )
    n = limit or settings.preview_default_limit
    n = max(1, min(n, settings.preview_max_limit))
    result = duckdb_loader.preview_parquet(dataset.storage_uri, n)
    return {
        "dataset_id": dataset_id,
        "columns": result["columns"],
        "rows": result["rows"],
        "row_count": len(result["rows"]),
    }
