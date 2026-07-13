"""Database engine, session factory, declarative base, and role seeding."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    # Remote Postgres: transparently replace connections dropped by the server.
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Default access matrix (placeholder until a dedicated auth service exists).
_DEFAULT_ROLES = [
    ("平台管理员", 4, True, True, True),
    ("数据工程师", 8, True, True, False),
    ("分析师", 15, True, False, False),
    ("只读用户", 22, True, False, False),
    ("外部审计", 3, True, False, False),
]


def init_db() -> None:
    from app.repositories import models

    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        if db.query(models.Role).count() == 0:
            for i, (name, members, r, w, a) in enumerate(_DEFAULT_ROLES):
                db.add(models.Role(name=name, members=members, can_read=r, can_write=w, can_admin=a, ordinal=i))
            db.commit()
