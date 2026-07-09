"""Dataset endpoints: catalog, detail/schema, and preview."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page
from app.schemas.dataset import (
    DatasetColumnOut,
    DatasetDetailOut,
    DatasetOut,
    DatasetPreviewOut,
    DatasetRegister,
)
from app.services import dataset_service

router = APIRouter(tags=["datasets"])


@router.post("/datasets", response_model=DatasetDetailOut, status_code=status.HTTP_201_CREATED)
def register_dataset(payload: DatasetRegister, db: Session = Depends(get_db)) -> DatasetDetailOut:
    return DatasetDetailOut.model_validate(dataset_service.register(db, payload))


@router.get("/datasets", response_model=Page[DatasetOut])
def list_datasets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    connector_id: str | None = Query(default=None),
    layer: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Page[DatasetOut]:
    rows, total = dataset_service.list_page(
        db, page=page, page_size=page_size, connector_id=connector_id, layer=layer, q=q
    )
    return Page.create([DatasetOut.model_validate(d) for d in rows], total, page, page_size)


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
