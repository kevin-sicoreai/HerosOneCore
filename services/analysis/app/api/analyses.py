"""Saved-analysis endpoints (CRUD).

Reads (list/get) are open. Writes require a valid Bearer token: create needs an
identified actor; update/delete need the owner (or an admin). The definition is
a transparent JSON object, (de)serialized here around the JSON-string column.
"""

import json

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import actor_from_authorization, perms_from_authorization
from app.core.db import get_db
from app.repositories import analyses_store as store
from app.repositories.models import SavedAnalysis
from app.schemas.analyses import (
    AnalysisCreate,
    AnalysisDetail,
    AnalysisSummary,
    AnalysisUpdate,
)

router = APIRouter(tags=["analyses"])


def _require_actor(authorization: str | None) -> str:
    """Resolve the caller's identity, or 401 if no valid Bearer token is present."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    actor = actor_from_authorization(authorization)
    if actor == "anonymous":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    return actor


def _get_or_404(db: Session, analysis_id: str) -> SavedAnalysis:
    analysis = store.get(db, analysis_id)
    if analysis is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return analysis


def _require_owner_or_admin(analysis: SavedAnalysis, authorization: str | None) -> None:
    """Guard mutating access: only the owner or an admin may modify a saved analysis."""
    actor = _require_actor(authorization)
    perms = perms_from_authorization(authorization)
    if analysis.owner != actor and not perms.get("can_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires owner or admin permission")


def _summary(a: SavedAnalysis) -> AnalysisSummary:
    return AnalysisSummary(id=a.id, name=a.name, owner=a.owner, updated_at=a.updated_at)


def _detail(a: SavedAnalysis) -> AnalysisDetail:
    # The column is a JSON string; hand back a parsed object. A malformed/legacy
    # value degrades to {} rather than raising.
    try:
        definition = json.loads(a.definition) if a.definition else {}
    except (ValueError, TypeError):
        definition = {}
    return AnalysisDetail(
        id=a.id,
        name=a.name,
        owner=a.owner,
        updated_at=a.updated_at,
        created_at=a.created_at,
        definition=definition,
    )


@router.get("/analyses", response_model=list[AnalysisSummary])
def list_analyses(db: Session = Depends(get_db)) -> list[AnalysisSummary]:
    return [_summary(a) for a in store.list_analyses(db)]


@router.post("/analyses", response_model=AnalysisDetail, status_code=status.HTTP_201_CREATED)
def create_analysis(
    payload: AnalysisCreate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> AnalysisDetail:
    owner = _require_actor(authorization)
    analysis = store.create(
        db,
        name=payload.name,
        definition=json.dumps(payload.definition, ensure_ascii=False),
        owner=owner,
    )
    return _detail(analysis)


@router.get("/analyses/{analysis_id}", response_model=AnalysisDetail)
def get_analysis(analysis_id: str, db: Session = Depends(get_db)) -> AnalysisDetail:
    return _detail(_get_or_404(db, analysis_id))


@router.put("/analyses/{analysis_id}", response_model=AnalysisDetail)
def update_analysis(
    analysis_id: str,
    payload: AnalysisUpdate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> AnalysisDetail:
    analysis = _get_or_404(db, analysis_id)
    _require_owner_or_admin(analysis, authorization)
    analysis = store.update(
        db,
        analysis,
        name=payload.name,
        definition=(
            json.dumps(payload.definition, ensure_ascii=False)
            if payload.definition is not None
            else None
        ),
    )
    return _detail(analysis)


@router.delete("/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> None:
    analysis = _get_or_404(db, analysis_id)
    _require_owner_or_admin(analysis, authorization)
    store.delete(db, analysis)
