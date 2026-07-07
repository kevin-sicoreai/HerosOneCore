"""Data access behind an interface so the source can be swapped.

DataServiceProvider reads the live catalog from the data service
(/datasets + /datasets/{id}/schema + /datasets/{id}/preview, settings.data_service_url).
MockProvider (the built-in devices/orders tables) remains for offline use.
"""

from typing import Protocol

import httpx
from fastapi import HTTPException, status

from app.clients import data_service
from app.domain.tables import TABLES, Column, Table

# The data service caps dataset previews at 1000 rows (settings.preview_max_limit);
# requesting that much always fills the workbench with as much of the dataset as
# the API will hand over, even for datasets it happens to exceed (e.g. inventory).
_PREVIEW_ROWS = 1000

_NUMERIC_TYPES = {
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL",
}

# Friendly labels for the demo dataset catalog; unknown datasets fall back to their raw name.
_LABELS: dict[str, tuple[str, str]] = {
    "customers": ("客户", "客户主数据（销售）"),
    "orders": ("订单", "订单履约明细（销售）"),
    "suppliers": ("供应商", "供应商名录及评级（供应链）"),
    "warehouses": ("仓库", "仓库容量与城市分布（供应链）"),
    "products": ("产品", "产品目录及成本（供应链）"),
    "inventory": ("库存", "库存水位与安全库存（供应链）"),
    "purchase_orders": ("采购单", "采购订单状态与金额（供应链）"),
    "shipments": ("发运单", "发运追踪与承运商（供应链）"),
}


def _column_kind(name: str, data_type: str) -> str:
    if name == "id" or name.endswith("_id"):
        return "dimension"
    base = data_type.split("(")[0].upper()
    return "measure" if base in _NUMERIC_TYPES else "dimension"


def _to_table(dataset: dict) -> Table:
    name = dataset["name"]
    label, desc = _LABELS.get(name, (name, "来自 data 服务的真实数据集"))
    schema = data_service.get_schema(dataset["id"])
    columns = [Column(c["name"], c["name"], _column_kind(c["name"], c["data_type"])) for c in schema]
    rows = data_service.preview(dataset["id"], _PREVIEW_ROWS)["rows"]
    row_count = dataset.get("row_count") or len(rows)
    if len(rows) < row_count:
        desc = f"{desc}，展示前 {len(rows)} / {row_count} 行"
    return Table(name=name, label=label, desc=desc, columns=columns, rows=rows)


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


class DataServiceProvider:
    def list_tables(self) -> list[Table]:
        try:
            datasets = data_service.list_datasets()
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "data 服务不可用") from exc
        return [_to_table(d) for d in datasets]

    def get_table(self, name: str) -> Table:
        try:
            dataset = data_service.find_dataset(name)
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "data 服务不可用") from exc
        if dataset is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Table '{name}' not found")
        return _to_table(dataset)


provider: DataProvider = DataServiceProvider()
