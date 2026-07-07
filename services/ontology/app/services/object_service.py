"""Object instance use cases: list/count/get and link traversal (read from data plane)."""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.clients import data_client, query
from app.repositories.models import LinkType, ObjectType
from app.services import link_type_service, object_type_service


def _dataset_uri(object_type: ObjectType) -> str:
    ds = data_client.get_dataset(object_type.dataset_id)
    return ds["storage_uri"]


def list_instances(object_type: ObjectType, limit: int) -> dict[str, Any]:
    result = query.preview(_dataset_uri(object_type), limit)
    return {"object_type_id": object_type.id, **result}


def count_instances(object_type: ObjectType) -> int:
    return query.count(_dataset_uri(object_type))


def get_instance(object_type: ObjectType, pk_value: str) -> dict[str, Any]:
    if not object_type.primary_key:
        raise HTTPException(status.HTTP_409_CONFLICT, "Object type has no primary key")
    result = query.filter_by(_dataset_uri(object_type), object_type.primary_key, pk_value, 1)
    if not result["rows"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Object not found")
    return result["rows"][0]


def linked(
    db: Session, object_type: ObjectType, pk_value: str, link_type_id: str, limit: int
) -> dict[str, Any]:
    """Return objects on the other end of a link for a given instance."""
    lt: LinkType = link_type_service.get_or_404(db, link_type_id)

    if object_type.id == lt.from_object_type_id:
        my_col, other_id, other_col = lt.from_property, lt.to_object_type_id, lt.to_property
    elif object_type.id == lt.to_object_type_id:
        my_col, other_id, other_col = lt.to_property, lt.from_object_type_id, lt.from_property
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Object type is not part of this link")

    instance = get_instance(object_type, pk_value)
    if my_col not in instance:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Join property '{my_col}' not on object")

    other = object_type_service.get_or_404(db, other_id)
    result = query.filter_by(_dataset_uri(other), other_col, str(instance[my_col]), limit)
    return {"object_type_id": other.id, **result}
