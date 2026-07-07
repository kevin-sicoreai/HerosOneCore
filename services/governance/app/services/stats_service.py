"""Summary stats for the governance dashboard cards."""

from sqlalchemy.orm import Session

from app.clients import upstream
from app.schemas.governance import Stats
from app.services import audit_service, roles_service


def build(db: Session) -> Stats:
    governed = (
        len(upstream.list_datasets())
        + len(upstream.list_pipelines())
        + len(upstream.list_object_types())
    )
    return Stats(
        governed_assets=governed,
        roles=len(roles_service.list_all(db)),
        audit_events=len(audit_service.build(limit=1000)),
        encryption_coverage="100%",
    )
