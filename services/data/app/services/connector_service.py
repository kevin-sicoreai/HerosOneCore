"""Connector use cases: CRUD, connection test, and secret redaction."""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import source_postgres
from app.domain.connector_types import get_connector_type, is_supported
from app.repositories.models import Connector
from app.schemas.connector import ConnectorCreate, ConnectorOut, ConnectorUpdate

_SECRET_KEYS = {"password", "secret", "token", "api_key"}


def _redact(config: dict[str, Any]) -> dict[str, Any]:
    return {k: ("***" if k in _SECRET_KEYS and v else v) for k, v in config.items()}


def to_out(connector: Connector) -> ConnectorOut:
    return ConnectorOut(
        id=connector.id,
        name=connector.name,
        source_type=connector.source_type,
        config=_redact(connector.config or {}),
        status=connector.status,
        schedule=connector.schedule,
        owner_id=connector.owner_id,
        created_at=connector.created_at,
        updated_at=connector.updated_at,
    )


def get_or_404(db: Session, connector_id: str) -> Connector:
    connector = db.get(Connector, connector_id)
    if connector is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connector not found")
    return connector


def create(db: Session, payload: ConnectorCreate) -> Connector:
    if get_connector_type(payload.source_type) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unknown source_type: {payload.source_type}",
        )
    connector = Connector(
        name=payload.name,
        source_type=payload.source_type,
        config=payload.config,
        schedule=payload.schedule,
        owner_id=payload.owner_id,
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    return connector


def list_all(db: Session) -> list[Connector]:
    return list(db.scalars(select(Connector).order_by(Connector.created_at.desc())))


def update(db: Session, connector_id: str, payload: ConnectorUpdate) -> Connector:
    connector = get_or_404(db, connector_id)
    if payload.name is not None:
        connector.name = payload.name
    if payload.config is not None:
        connector.config = payload.config
    if payload.schedule is not None:
        connector.schedule = payload.schedule
    db.commit()
    db.refresh(connector)
    return connector


def delete(db: Session, connector_id: str) -> None:
    connector = get_or_404(db, connector_id)
    db.delete(connector)
    db.commit()


def test_connection(db: Session, connector_id: str) -> tuple[bool, str]:
    connector = get_or_404(db, connector_id)
    if not is_supported(connector.source_type):
        return False, f"Source type '{connector.source_type}' is not supported yet"
    if connector.source_type == "postgres":
        return source_postgres.test_connection(connector.config or {})
    return False, f"No connection test implemented for '{connector.source_type}'"
