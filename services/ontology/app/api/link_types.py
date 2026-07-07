"""Link type endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.link_type import LinkTypeCreate, LinkTypeOut
from app.services import link_type_service

router = APIRouter(tags=["link-types"])


@router.post("/link-types", response_model=LinkTypeOut, status_code=status.HTTP_201_CREATED)
def create_link_type(payload: LinkTypeCreate, db: Session = Depends(get_db)) -> LinkTypeOut:
    return LinkTypeOut.model_validate(link_type_service.create(db, payload))


@router.get("/link-types", response_model=list[LinkTypeOut])
def list_link_types(db: Session = Depends(get_db)) -> list[LinkTypeOut]:
    return [LinkTypeOut.model_validate(lt) for lt in link_type_service.list_all(db)]


@router.delete("/link-types/{link_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link_type(link_type_id: str, db: Session = Depends(get_db)) -> None:
    link_type_service.delete(db, link_type_id)
