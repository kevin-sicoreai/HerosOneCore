"""Database engine, session factory, and declarative base."""

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    # SQLite is single-threaded by default; FastAPI runs handlers across threads.
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables. P0 uses create_all; migrations move to Alembic later."""
    # Import models so they register on the metadata before create_all.
    from app.repositories import models  # noqa: F401

    Base.metadata.create_all(engine)
    _apply_lightweight_migrations()


def _apply_lightweight_migrations() -> None:
    """Idempotent, minimal in-place schema fixes.

    create_all() only creates missing tables; it never adds columns to tables
    that already exist. Until Alembic is wired up, this backfills newly added
    columns on pre-existing databases. Currently: datasets.display_name.
    """
    if not _is_sqlite:
        return
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(datasets)"))}
        if cols and "display_name" not in cols:
            conn.execute(text("ALTER TABLE datasets ADD COLUMN display_name VARCHAR(255)"))
