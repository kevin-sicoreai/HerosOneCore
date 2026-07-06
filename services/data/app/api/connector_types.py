"""Connector-type catalog endpoints."""

from fastapi import APIRouter

from app.domain.connector_types import CONNECTOR_TYPES
from app.schemas.connector_type import ConnectorTypeOut

router = APIRouter(tags=["connector-types"])


@router.get("/connector-types", response_model=list[ConnectorTypeOut])
def list_connector_types() -> list[ConnectorTypeOut]:
    return [
        ConnectorTypeOut(
            type=ct.type,
            display_name=ct.display_name,
            category=ct.category,
            supported=ct.supported,
            config_fields=ct.config_fields,
        )
        for ct in CONNECTOR_TYPES
    ]
