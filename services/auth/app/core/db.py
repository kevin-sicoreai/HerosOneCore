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

        # bootstrap admin user with the platform-admin role
        if db.query(User).count() == 0:
            digest, salt = hash_password(settings.bootstrap_admin_password)
            admin = User(
                username=settings.bootstrap_admin_username,
                email="admin@askdelphi.local",
                password_hash=digest,
                salt=salt,
            )
            admin_role = db.scalar(select(Role).where(Role.name == "平台管理员"))
            if admin_role:
                admin.roles.append(admin_role)
            db.add(admin)
            db.commit()
