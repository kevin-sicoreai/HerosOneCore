"""Generic offset-based pagination for list endpoints.

Kept local to this service per the no-shared-library convention. Offset paging is
sufficient at the expected catalog sizes; switch to keyset paging if a single table
grows past a few hundred thousand rows.
"""

from math import ceil
from typing import Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """A single page of results plus the metadata a client needs to page through."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def create(cls, items: list[T], total: int, page: int, page_size: int) -> "Page[T]":
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=ceil(total / page_size) if page_size else 0,
        )


def paginate(db: Session, stmt: Select, page: int, page_size: int) -> tuple[list, int]:
    """Run a SELECT for one page and return (rows, total).

    `total` counts the full (unpaged) result; ordering is stripped before counting.
    """
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = list(db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)))
    return rows, total
