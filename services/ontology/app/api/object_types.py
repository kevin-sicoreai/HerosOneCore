"""Object type endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.object_type import (
    ObjectTypeCreate,
    ObjectTypeDetailOut,
    ObjectTypeOut,
    ObjectTypeUpdate,
    PropertyOut,
)
from app.services import object_type_service

router = APIRouter(tags=["object-types"])


@router.post("/object-types", response_model=ObjectTypeDetailOut, status_code=status.HTTP_201_CREATED)
def create_object_type(payload: ObjectTypeCreate, db: Session = Depends(get_db)) -> ObjectTypeDetailOut:
    return ObjectTypeDetailOut.model_validate(object_type_service.create(db, payload))


@router.get("/object-types", response_model=list[ObjectTypeOut])
def list_object_types(db: Session = Depends(get_db)) -> list[ObjectTypeOut]:
    return [ObjectTypeOut.model_validate(o) for o in object_type_service.list_all(db)]


@router.get("/object-types/{object_type_id}", response_model=ObjectTypeDetailOut)
def get_object_type(object_type_id: str, db: Session = Depends(get_db)) -> ObjectTypeDetailOut:
    return ObjectTypeDetailOut.model_validate(object_type_service.get_or_404(db, object_type_id))


@router.patch("/object-types/{object_type_id}", response_model=ObjectTypeDetailOut)
def update_object_type(object_type_id: str, payload: ObjectTypeUpdate, db: Session = Depends(get_db)) -> ObjectTypeDetailOut:
    return ObjectTypeDetailOut.model_validate(object_type_service.update(db, object_type_id, payload))


@router.delete("/object-types/{object_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_object_type(object_type_id: str, db: Session = Depends(get_db)) -> None:
    object_type_service.delete(db, object_type_id)


@router.get("/object-types/{object_type_id}/properties", response_model=list[PropertyOut])
def list_properties(object_type_id: str, db: Session = Depends(get_db)) -> list[PropertyOut]:
    ot = object_type_service.get_or_404(db, object_type_id)
    return [PropertyOut.model_validate(p) for p in ot.properties]
