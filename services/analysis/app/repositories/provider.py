"""Data access behind an interface so the source can be swapped.

MockProvider serves the built-in tables. When the data service is ready, a
DataServiceProvider implements the same three methods against its
/datasets + /datasets/{id}/schema + /datasets/{id}/preview endpoints
(settings.data_service_url) and replaces the mock here.
"""

from typing import Protocol

from fastapi import HTTPException, status

from app.domain.tables import TABLES, Table


class DataProvider(Protocol):
    def list_tables(self) -> list[Table]: ...

    def get_table(self, name: str) -> Table: ...


class MockProvider:
    def list_tables(self) -> list[Table]:
        return list(TABLES.values())

    def get_table(self, name: str) -> Table:
        table = TABLES.get(name)
        if table is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Table '{name}' not found")
        return table


provider: DataProvider = MockProvider()
