"""Dataset endpoints: catalog, detail/schema, and preview."""

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.orm import Session

from app.core.audit import emit_sensitive_read
from app.core.auth import actor_from_authorization, perms_from_authorization
from app.core.classifications import sensitive_columns_for
from app.core.db import get_db
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page
from app.schemas.dataset import (
    DatasetColumnOut,
    DatasetDetailOut,
    DatasetOut,
    DatasetPatch,
    DatasetPreviewOut,
    DatasetRegister,
)
from app.services import dataset_service

router = APIRouter(tags=["datasets"])

_MASK = "***"


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


@router.patch("/datasets/{dataset_id}", response_model=DatasetOut)
def update_dataset(
    dataset_id: str, payload: DatasetPatch, db: Session = Depends(get_db)
) -> DatasetOut:
    """Partially update a dataset (e.g. backfill a Chinese display name)."""
    return DatasetOut.model_validate(dataset_service.update(db, dataset_id, payload))


@router.get("/datasets/{dataset_id}/schema", response_model=list[DatasetColumnOut])
def get_dataset_schema(dataset_id: str, db: Session = Depends(get_db)) -> list[DatasetColumnOut]:
    dataset = dataset_service.get_or_404(db, dataset_id)
    return [DatasetColumnOut.model_validate(c) for c in dataset.columns]


@router.get("/datasets/{dataset_id}/preview", response_model=DatasetPreviewOut)
def preview_dataset(
    dataset_id: str,
    limit: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> DatasetPreviewOut:
    dataset = dataset_service.get_or_404(db, dataset_id)
    result = dataset_service.preview(db, dataset_id, limit)
    # Non-admins get sensitive column values redacted (columns stay in the schema).
    hit = sensitive_columns_for({dataset.id, dataset.name}) & set(result["columns"])
    masked = False
    if hit and not perms_from_authorization(authorization).get("can_admin"):
        masked = True
        for row in result["rows"]:
            for col in hit:
                if col in row:
                    row[col] = _MASK
    if hit:
        emit_sensitive_read(actor_from_authorization(authorization), dataset.name, masked)
    return DatasetPreviewOut.model_validate(result)
