"""Session CRUD and message history."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.repositories import store
from app.schemas.chat import MessageOut, MetaOut, ModelInfo, SessionOut

router = APIRouter()


@router.get("/meta", response_model=MetaOut)
def get_meta() -> MetaOut:
    profiles = settings.list_llm_profiles()
    default = settings.resolve_llm_profile(None)
    return MetaOut(
        model=default.model,
        display_name=default.display_name,
        default=default.id,
        models=[ModelInfo(id=p.id, display_name=p.display_name) for p in profiles],
    )


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db)) -> list[SessionOut]:
    return [SessionOut.model_validate(s, from_attributes=True) for s in store.list_sessions(db)]


@router.post("/sessions", response_model=SessionOut, status_code=201)
def create_session(db: Session = Depends(get_db)) -> SessionOut:
    return SessionOut.model_validate(store.create_session(db), from_attributes=True)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, db: Session = Depends(get_db)) -> None:
    if store.get_session(db, session_id) is None:
        raise HTTPException(status_code=404, detail="session not found")
    store.delete_session(db, session_id)


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
def list_messages(session_id: str, db: Session = Depends(get_db)) -> list[MessageOut]:
    if store.get_session(db, session_id) is None:
        raise HTTPException(status_code=404, detail="session not found")
    return [
        MessageOut(
            id=m.id,
            role=m.role,
            content=m.content,
            trace=json.loads(m.trace) if m.trace else None,
            extras=json.loads(m.extras) if m.extras else None,
            created_at=m.created_at,
        )
        for m in store.list_messages(db, session_id)
    ]
