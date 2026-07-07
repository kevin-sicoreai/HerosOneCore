"""ORM models for the app catalog."""

import datetime
import uuid

from sqlalchemy import JSON, Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _new_id() -> str:
    return uuid.uuid4().hex


def utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class MarketApp(Base):
    __tablename__ = "market_apps"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(120))
    desc: Mapped[str] = mapped_column(Text, default="")
    tag: Mapped[str] = mapped_column(String(16), default="custom")  # prebuilt | custom
    category: Mapped[str] = mapped_column(String(40), default="自建")
    installs: Mapped[int] = mapped_column(Integer, default=0)
    deployed: Mapped[bool] = mapped_column(Boolean, default=False)
    # App definition snapshot (the builder's draft JSON) for the read-only
    # runtime page; prebuilt catalog entries may not carry one.
    definition: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Builder app this entry was published from; publish upserts on it.
    source_app_id: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)
    created_at: Mapped[str] = mapped_column(String(40), default=utcnow_iso)
    updated_at: Mapped[str] = mapped_column(String(40), default=utcnow_iso)
