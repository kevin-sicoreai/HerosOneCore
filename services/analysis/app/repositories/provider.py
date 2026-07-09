"""Data access behind an interface so the source can be swapped.

OntologyProvider reads the built ontology from the ontology service
(/object-types + /object-types/{id} + /object-types/{id}/objects,
settings.ontology_service_url). Analysis operates on object types — the
business-facing semantic layer — not raw datasets. MockProvider (the built-in
devices/orders tables) remains for offline use.
"""

import time
from typing import Protocol

import httpx
from fastapi import HTTPException, status

from app.clients import ontology_service
from app.domain.tables import TABLES, Column, Table
from app.repositories import object_rows

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
    # HR scenario fields.
    "monthly_salary": "月薪", "headcount_plan": "编制人数", "hire_date": "入职日期",
    "term_date": "离职日期", "department_id": "部门 ID", "position_id": "职位 ID",
    "title": "职位名称", "level": "职级", "gender": "性别", "age": "年龄",
    "work_date": "日期", "hours": "工时", "base_salary": "基本工资",
    "bonus": "奖金", "total": "合计", "month": "月份", "stage": "阶段",
    "candidate_name": "候选人", "applied_at": "投递日期", "source": "渠道",
    # HR ontology fields (performance / recruiting / training / HR events).
    "cycle": "考核周期", "score": "绩效得分", "reviewer_id": "考核人",
    "department_name": "部门名称", "training_id": "课程 ID", "completed_at": "完成时间",
    "result": "结果", "promote_date": "晋升日期", "from_level": "原职级",
    "to_level": "新职级", "transfer_date": "调动日期", "from_department_id": "原部门",
    "to_department_id": "新部门", "reason": "原因", "leave_type": "请假类型",
    "start_date": "开始日期", "end_date": "结束日期", "days": "天数",
    "round": "轮次", "interviewer_id": "面试官", "interview_date": "面试日期",
    "application_id": "投递 ID", "contract_type": "合同类型", "sign_date": "签订日期",
}


def _field_label(name: str) -> str:
    return _FIELD_LABELS.get(name, name)


def _column_kind(name: str, data_type: str, is_primary_key: bool) -> str:
    if is_primary_key or name == "id" or name.endswith("_id"):
        return "dimension"
    base = data_type.split("(")[0].upper()
    return "measure" if base in _NUMERIC_TYPES else "dimension"


def _columns_for(object_type_id: str) -> list[Column]:
    """Columns for an object type, read from its (cached) detail. Shared by the
    catalog and by get_table so both hit the same short-TTL cache."""
    detail = object_rows.get_object_type(object_type_id)
    return [
        Column(
            p["name"],
            _field_label(p["name"]),
            _column_kind(p["name"], p["data_type"], p["is_primary_key"]),
            p["data_type"],
        )
        for p in detail.get("properties", [])
    ]


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


# Process-wide TTL cache for the table catalog. Building it fans out to the
# ontology (one graph call + one detail per type); a short TTL keeps repeated
# page loads cheap while still reflecting ontology edits within ~30s.
_CATALOG_TTL_SECONDS = 30.0
_catalog_cache: tuple[float, list[Table]] | None = None


class OntologyProvider:
    def list_tables(self) -> list[Table]:
        global _catalog_cache
        now = time.monotonic()
        if _catalog_cache is not None and now < _catalog_cache[0]:
            return _catalog_cache[1]
        try:
            # One graph call carries display_name / property_count /
            # instance_count for every type — no instance rows are pulled here.
            graph = ontology_service.graph()
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc
        tables = []
        for node in graph.get("nodes", []):
            label = node["display_name"]
            # The graph has no description; keep the existing fallback wording.
            tables.append(
                Table(
                    name=node["api_name"],
                    label=label,
                    desc=f"本体对象类型「{label}」",
                    columns=_columns_for(node["id"]),
                    rows=[],
                    row_count=node.get("instance_count"),
                )
            )
        _catalog_cache = (now + _CATALOG_TTL_SECONDS, tables)
        return tables

    def get_table(self, name: str) -> Table:
        try:
            summaries = ontology_service.list_object_types()
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc
        for s in summaries:
            if name in (s["api_name"], s["display_name"], s["id"]):
                label = s["display_name"]
                desc = s.get("description") or f"本体对象类型「{label}」"
                rows = object_rows.get_rows(s["id"])
                return Table(
                    name=s["api_name"],
                    label=label,
                    desc=desc,
                    columns=_columns_for(s["id"]),
                    rows=rows,
                    row_count=len(rows),
                )
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"对象类型 '{name}' 不存在")


provider: DataProvider = OntologyProvider()
