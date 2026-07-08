"""Data access behind an interface so the source can be swapped.

OntologyProvider reads the built ontology from the ontology service
(/object-types + /object-types/{id} + /object-types/{id}/objects,
settings.ontology_service_url). Analysis operates on object types — the
business-facing semantic layer — not raw datasets. MockProvider (the built-in
devices/orders tables) remains for offline use.
"""

from typing import Protocol

import httpx
from fastapi import HTTPException, status

from app.clients import ontology_service
from app.domain.tables import TABLES, Column, Table

# The ontology objects endpoint caps previews at 1000 rows (preview_max_limit);
# request that much so the workbench sees as much of each object type as it serves.
_PREVIEW_ROWS = 1000

_NUMERIC_TYPES = {
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL",
}

# Chinese display labels for property names (auto-imported from the source
# dataset schema in English). Drives the config panel, aggregate headers, and
# the detail table; unknown fields fall back to their raw name.
_FIELD_LABELS = {
    "id": "ID", "name": "名称", "email": "邮箱", "created_at": "创建时间",
    "updated_at": "更新时间", "status": "状态", "amount": "金额",
    "customer_id": "客户 ID", "region": "区域", "rating": "评级",
    "lead_time_days": "交期(天)", "sku": "SKU", "category": "类别",
    "unit_cost": "单位成本", "supplier_id": "供应商 ID", "product_id": "产品 ID",
    "warehouse_id": "仓库 ID", "on_hand": "在库量", "reorder_point": "再订货点",
    "city": "城市", "capacity": "容量", "order_date": "下单日期",
    "total_amount": "总金额", "po_id": "采购单 ID", "ship_date": "发运日期",
    "eta": "预计到达", "carrier": "承运商",
}


def _field_label(name: str) -> str:
    return _FIELD_LABELS.get(name, name)


def _column_kind(name: str, data_type: str, is_primary_key: bool) -> str:
    if is_primary_key or name == "id" or name.endswith("_id"):
        return "dimension"
    base = data_type.split("(")[0].upper()
    return "measure" if base in _NUMERIC_TYPES else "dimension"


def _to_table(summary: dict) -> Table:
    detail = ontology_service.get_object_type(summary["id"])
    columns = [
        Column(
            p["name"],
            _field_label(p["name"]),
            _column_kind(p["name"], p["data_type"], p["is_primary_key"]),
            p["data_type"],
        )
        for p in detail.get("properties", [])
    ]
    rows = ontology_service.list_objects(summary["id"], _PREVIEW_ROWS)["rows"]
    label = summary["display_name"]
    desc = summary.get("description") or f"本体对象类型「{label}」"
    return Table(name=summary["api_name"], label=label, desc=desc, columns=columns, rows=rows)


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


class OntologyProvider:
    def list_tables(self) -> list[Table]:
        try:
            summaries = ontology_service.list_object_types()
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc
        return [_to_table(s) for s in summaries]

    def get_table(self, name: str) -> Table:
        try:
            summaries = ontology_service.list_object_types()
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc
        for s in summaries:
            if name in (s["api_name"], s["display_name"], s["id"]):
                return _to_table(s)
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"对象类型 '{name}' 不存在")


provider: DataProvider = OntologyProvider()
