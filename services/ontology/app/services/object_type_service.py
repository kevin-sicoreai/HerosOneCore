"""Object type use cases: create (import schema), CRUD."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import data_client
from app.events import publishers
from app.repositories.models import ObjectType, Property
from app.schemas.object_type import ObjectTypeCreate, ObjectTypeUpdate


def get_or_404(db: Session, object_type_id: str) -> ObjectType:
    ot = db.get(ObjectType, object_type_id)
    if ot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Object type not found")
    return ot


def _infer_primary_key(columns: list[dict], requested: str | None) -> str | None:
    names = [c["name"] for c in columns]
    if requested:
        if requested not in names:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"primary_key '{requested}' not in dataset schema")
        return requested
    if "id" in names:
        return "id"
    return names[0] if names else None


def create(db: Session, payload: ObjectTypeCreate) -> ObjectType:
    if db.scalar(select(ObjectType).where(ObjectType.api_name == payload.api_name)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"api_name '{payload.api_name}' already exists")

    # Import the backing dataset's schema as properties.
    try:
        columns = data_client.get_dataset_schema(payload.dataset_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot read dataset schema: {exc}") from exc

    pk = _infer_primary_key(columns, payload.primary_key)
    ot = ObjectType(
        api_name=payload.api_name,
        display_name=payload.display_name,
        description=payload.description,
        dataset_id=payload.dataset_id,
        primary_key=pk,
        color=payload.color,
        x=payload.x,
        y=payload.y,
    )
    db.add(ot)
    db.flush()
    for col in columns:
        ot.properties.append(
            Property(
                name=col["name"],
                data_type=col["data_type"],
                is_primary_key=(col["name"] == pk),
                ordinal=col.get("ordinal", 0),
            )
        )
    db.commit()
    db.refresh(ot)
    publishers.object_type_created(ot.id, ot.api_name)
    return ot


def list_all(db: Session) -> list[ObjectType]:
    return list(db.scalars(select(ObjectType).order_by(ObjectType.created_at.desc())))


def update(db: Session, object_type_id: str, payload: ObjectTypeUpdate) -> ObjectType:
    ot = get_or_404(db, object_type_id)
    for field in ("display_name", "description", "primary_key", "color", "x", "y"):
        value = getattr(payload, field)
        if value is not None:
            setattr(ot, field, value)
    db.commit()
    db.refresh(ot)
    return ot


def delete(db: Session, object_type_id: str) -> None:
    ot = get_or_404(db, object_type_id)
    db.delete(ot)
    db.commit()
