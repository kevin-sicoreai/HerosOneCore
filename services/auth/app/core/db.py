"""Database engine, session factory, base, and seeding (roles + bootstrap admin)."""

from collections.abc import Iterator

from sqlalchemy import create_engine, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings
from app.core.security import hash_password

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
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


# name, read, write, admin
_DEFAULT_ROLES = [
    ("平台管理员", True, True, True),
    ("数据分析师", True, True, False),
]


def init_db() -> None:
    from app.repositories.models import Role, User

    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        if db.query(Role).count() == 0:
            for i, (name, r, w, a) in enumerate(_DEFAULT_ROLES):
                db.add(Role(name=name, can_read=r, can_write=w, can_admin=a, ordinal=i))
            db.commit()

        # Seed demo users (idempotent by username): a platform admin (full rights)
        # and a data analyst (read/write but no delete/admin) to show enforcement.
        seed_users = [
            (settings.bootstrap_admin_username, settings.bootstrap_admin_password, "平台管理员", "admin@askdelphi.local"),
            ("analyst", "analyst", "数据分析师", "analyst@askdelphi.local"),
        ]
        for username, password, role_name, email in seed_users:
            if db.scalar(select(User).where(User.username == username)) is not None:
                continue
            digest, salt = hash_password(password)
            user = User(username=username, email=email, password_hash=digest, salt=salt)
            role = db.scalar(select(Role).where(Role.name == role_name))
            if role:
                user.roles.append(role)
            db.add(user)
        db.commit()
