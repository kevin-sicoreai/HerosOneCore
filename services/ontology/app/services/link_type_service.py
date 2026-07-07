"""Link type use cases."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import Cardinality
from app.events import publishers
from app.repositories.models import LinkType, ObjectType
from app.schemas.link_type import LinkTypeCreate


def get_or_404(db: Session, link_type_id: str) -> LinkType:
    lt = db.get(LinkType, link_type_id)
    if lt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link type not found")
    return lt


def create(db: Session, payload: LinkTypeCreate) -> LinkType:
    for ot_id in (payload.from_object_type_id, payload.to_object_type_id):
        if db.get(ObjectType, ot_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Object type not found: {ot_id}")
    if payload.cardinality not in {c.value for c in Cardinality}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid cardinality: {payload.cardinality}")

    lt = LinkType(
        api_name=payload.api_name,
        display_name=payload.display_name,
        from_object_type_id=payload.from_object_type_id,
        to_object_type_id=payload.to_object_type_id,
        from_property=payload.from_property,
        to_property=payload.to_property,
        cardinality=payload.cardinality,
    )
    db.add(lt)
    db.commit()
    db.refresh(lt)
    publishers.link_type_created(lt.id, lt.api_name)
    return lt


def list_all(db: Session) -> list[LinkType]:
    return list(db.scalars(select(LinkType).order_by(LinkType.created_at.desc())))


def delete(db: Session, link_type_id: str) -> None:
    lt = get_or_404(db, link_type_id)
    db.delete(lt)
    db.commit()
