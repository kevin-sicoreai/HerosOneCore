"""Data access for sessions and messages."""

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.repositories.models import ChatMessage, ChatSession, utcnow_iso


def list_sessions(db: Session) -> list[ChatSession]:
    return list(db.scalars(select(ChatSession).order_by(ChatSession.updated_at.desc())))


def create_session(db: Session) -> ChatSession:
    session = ChatSession()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, session_id: str) -> ChatSession | None:
    return db.get(ChatSession, session_id)


def delete_session(db: Session, session_id: str) -> None:
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    session = db.get(ChatSession, session_id)
    if session:
        db.delete(session)
    db.commit()


def list_messages(db: Session, session_id: str) -> list[ChatMessage]:
    return list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        )
    )


def add_message(
    db: Session,
    session_id: str,
    role: str,
    content: str,
    trace: list[dict] | None = None,
    extras: dict | None = None,
) -> ChatMessage:
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        trace=json.dumps(trace, ensure_ascii=False) if trace else None,
        extras=json.dumps(extras, ensure_ascii=False) if extras else None,
    )
    db.add(message)

    session = db.get(ChatSession, session_id)
    if session:
        session.updated_at = utcnow_iso()
        # First user message names the session.
        if role == "user" and session.title == "新会话":
            session.title = content[:24]
    db.commit()
    db.refresh(message)
    return message
