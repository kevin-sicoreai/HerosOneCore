"""Dataset use cases: catalog listing, detail/schema, and preview."""

import os

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import duckdb_loader
from app.core.config import settings
from app.repositories.models import Dataset


def get_or_404(db: Session, dataset_id: str) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
    return dataset


def list_all(db: Session, connector_id: str | None = None) -> list[Dataset]:
    stmt = select(Dataset).order_by(Dataset.created_at.desc())
    if connector_id is not None:
        stmt = stmt.where(Dataset.connector_id == connector_id)
    return list(db.scalars(stmt))


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
