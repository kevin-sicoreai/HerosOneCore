"""ORM models for conversations."""

import datetime
import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _new_id() -> str:
    return uuid.uuid4().hex


def utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class ChatSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(200), default="新会话")
    created_at: Mapped[str] = mapped_column(String(40), default=utcnow_iso)
    updated_at: Mapped[str] = mapped_column(String(40), default=utcnow_iso)


class ChatMessage(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="")
    # JSON: reasoning trace steps [{icon,text,meta,status}] — replayed when a
    # session is reopened.
    trace: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON: structured extras {sources: [...], devices: [...]} for rich rendering.
    extras: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=utcnow_iso)
