"""Dataset endpoints: catalog, detail/schema, and preview."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.dataset import (
    DatasetColumnOut,
    DatasetDetailOut,
    DatasetOut,
    DatasetPreviewOut,
)
from app.services import dataset_service

router = APIRouter(tags=["datasets"])


@router.get("/datasets", response_model=list[DatasetOut])
def list_datasets(
    connector_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[DatasetOut]:
    return [DatasetOut.model_validate(d) for d in dataset_service.list_all(db, connector_id)]


@router.get("/datasets/{dataset_id}", response_model=DatasetDetailOut)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)) -> DatasetDetailOut:
    return DatasetDetailOut.model_validate(dataset_service.get_or_404(db, dataset_id))


@router.get("/datasets/{dataset_id}/schema", response_model=list[DatasetColumnOut])
def get_dataset_schema(dataset_id: str, db: Session = Depends(get_db)) -> list[DatasetColumnOut]:
    dataset = dataset_service.get_or_404(db, dataset_id)
    return [DatasetColumnOut.model_validate(c) for c in dataset.columns]


@router.get("/datasets/{dataset_id}/preview", response_model=DatasetPreviewOut)
def preview_dataset(
    dataset_id: str,
    limit: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> DatasetPreviewOut:
    return DatasetPreviewOut.model_validate(dataset_service.preview(db, dataset_id, limit))
