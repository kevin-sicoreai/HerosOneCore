"""Data access behind an interface so the source can be swapped.

OntologyProvider reads the built ontology from the ontology service
(/object-types + /object-types/{id} + /object-types/{id}/objects,
settings.ontology_service_url). Analysis operates on object types — the
business-facing semantic layer — not raw datasets. MockProvider (the built-in
devices/orders tables) remains for offline use.
"""

import threading
import time
from typing import Protocol

import httpx
from fastapi import HTTPException, status

from app.clients import ontology_service
from app.core.logging import get_logger
from app.domain.tables import TABLES, Column, Table
from app.repositories import object_rows

logger = get_logger("provider")

_NUMERIC_TYPES = {
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL",
}

# Chinese display labels for property names (auto-imported from the source
# dataset schema in English). Drives the config panel, aggregate headers, and
# the detail table; unknown fields fall back to their raw name.
_FIELD_LABELS = {
    "id": "ID", "name": "名称", "created_at": "创建时间", "updated_at": "更新时间",
    "status": "状态", "amount": "金额", "total_amount": "总金额",
    "customer_id": "客户 ID", "supplier_id": "供应商 ID", "product_id": "产品 ID",
    "warehouse_id": "仓库 ID", "department_id": "部门 ID",
    "region": "区域", "city": "城市", "category": "类别", "rating": "评级",
    "sku": "SKU", "unit_cost": "单位成本", "capacity": "容量",
    "order_date": "下单日期", "start_date": "开始日期", "end_date": "结束日期",
    "carrier": "承运商", "title": "职位名称", "stage": "阶段", "source": "渠道",
    "score": "绩效得分", "result": "结果", "reason": "原因",
    # Auto-imported source-schema fields (extended universe).
    "account_no": "账号", "actual_qty": "实盘数量", "amount_actual": "实际支出", "amount_budget": "预算金额",
    "annual_cost": "年费用", "applicant_id": "申请人", "approval_no": "审批编号", "approved_at": "审批时间",
    "area_sqm": "面积(㎡)", "asset_no": "资产编号", "asset_tag": "资产标签", "assignee_id": "负责人",
    "author": "作者", "avg_days": "平均时效(天)", "balance": "余额", "bank_name": "开户行",
    "batch_id": "批次", "batch_no": "批次号", "brand": "品牌", "budget": "预算",
    "budget_annual": "年度预算", "carrier_id": "承运商", "channel": "渠道", "check_date": "质检日期",
    "checked_at": "盘点时间", "code": "编码", "comment_tag": "评价标签", "company": "公司",
    "component_id": "组件", "contact_name": "联系人", "contact_phone": "联系电话", "contract_no": "合同编号",
    "cost": "费用", "cost_per_kg": "每公斤成本", "credit_limit": "信用额度", "currency": "币种",
    "defect_rate": "不良率", "delivered_at": "送达时间", "delivery_score": "交付评分", "device_id": "设备",
    "diff": "差异数量", "discount_pct": "折扣(%)", "due_date": "到期日", "effective_from": "生效日期",
    "electricity_kwh": "用电量(kWh)", "employee_id": "员工", "expected_close": "预计成交日", "expected_date": "预计到货日",
    "expected_qty": "应盘数量", "expense_date": "报销日期", "expense_no": "报销单号", "expires_at": "到期时间",
    "expiry_date": "有效期至", "finished_at": "完成时间", "from_city": "起点城市", "from_warehouse_id": "调出仓库",
    "hired_at": "入职日期", "industry": "行业", "inspector": "质检员", "invoice_id": "发票",
    "invoice_no": "发票号", "issue": "故障描述", "issued_at": "开具时间", "item_count": "明细数",
    "launched_at": "上市时间", "leads_target": "线索目标", "manager": "负责人", "method": "回款方式",
    "mileage": "里程(km)", "net_value": "净值", "note_no": "红票编号", "opened_at": "开业时间",
    "order_id": "订单", "order_no": "订单号", "original_value": "原值", "outcome": "拜访结果",
    "owner_id": "负责人", "owner_rep_id": "负责销售", "paid_at": "支付时间", "parent_name": "上级品类",
    "payable_no": "应付单号", "period": "期间", "period_date": "日期", "plate_no": "车牌号",
    "po_no": "采购单号", "position": "职位", "price": "价格", "price_score": "价格评分",
    "priority": "优先级", "probability": "赢单概率", "produced_at": "生产日期", "progress_pct": "进度(%)",
    "project_id": "项目", "purchase_date": "购置日期", "purchase_id": "采购单", "purchased_at": "购置时间",
    "purpose": "拜访目的", "quality_score": "质量评分", "quantity": "数量", "quota_annual": "年度指标",
    "quote_id": "报价单", "quote_no": "报价单号", "received_date": "到货日期", "replier": "回复人",
    "reply_at": "回复时间", "resolve_hours": "解决时限(小时)", "resolved_at": "解决时间", "response_hours": "响应时限(小时)",
    "return_no": "退货单号", "safety_stock": "安全库存", "sales_rep_id": "销售代表", "satisfaction": "满意度",
    "seats": "席位数", "seats_used": "已用席位", "service_no": "服务单号", "shipped_at": "发货时间",
    "signed_at": "签约日期", "submitted_at": "提交时间", "surveyed_at": "调查时间", "tag": "标签",
    "ticket_id": "工单", "ticket_no": "工单号", "tier": "等级", "to_city": "终点城市",
    "to_warehouse_id": "调入仓库", "total_score": "综合评分", "transfer_no": "调拨单号", "type": "类型",
    "unit_price": "单价", "used_at": "使用时间", "user_employee_id": "使用人", "valid_until": "有效期至",
    "vendor": "厂商", "views": "浏览量", "visit_date": "拜访日期", "water_ton": "用水量(吨)",
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


# Process-wide catalog cache, warmed at startup and refreshed stale-while-
# revalidate style. Building the catalog fans out to the ontology (one /graph
# call at ~20s+ against the remote metadata store, plus one detail fetch per
# type), so a full rebuild NEVER happens on the request path:
#
#   * startup       — warm_catalog() kicks off a background build; until it
#                     lands, /tables answers 503 (only the process's first
#                     minute or so).
#   * within TTL    — cache hit, served as-is.
#   * past TTL      — the *stale* catalog is returned immediately and a
#                     single-flight background thread rebuilds it; a failed
#                     refresh keeps the stale copy and logs a warning.
_CATALOG_TTL_SECONDS = 600.0
# (expires_monotonic, tables); never replaced with a worse value once set.
_catalog_cache: tuple[float, list[Table]] | None = None
# Single-flight guard: at most one background refresh at a time.
_refresh_lock = threading.Lock()
_refresh_inflight = False


def _build_catalog() -> list[Table]:
    """Full catalog build (the expensive fan-out). Runs only on background
    threads; propagates httpx errors to the refresh wrapper."""
    # One graph call carries display_name / property_count / instance_count
    # for every type — no instance rows are pulled here.
    graph = ontology_service.graph()
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
    return tables


def _refresh_catalog() -> None:
    """Background rebuild. On success the cache is swapped with a fresh expiry
    (stamped *after* the build — it can take longer than a short TTL itself);
    on failure the previous (possibly stale) cache is kept."""
    global _catalog_cache, _refresh_inflight
    try:
        tables = _build_catalog()
        _catalog_cache = (time.monotonic() + _CATALOG_TTL_SECONDS, tables)
        logger.info("catalog refreshed: %d object types", len(tables))
    except Exception as exc:  # noqa: BLE001 - keep serving stale on any failure
        logger.warning("catalog refresh failed (serving stale if available): %s", exc)
    finally:
        with _refresh_lock:
            _refresh_inflight = False


def _spawn_refresh() -> None:
    """Start a background catalog refresh unless one is already in flight."""
    global _refresh_inflight
    with _refresh_lock:
        if _refresh_inflight:
            return
        _refresh_inflight = True
    threading.Thread(target=_refresh_catalog, name="catalog-refresh", daemon=True).start()


def warm_catalog() -> None:
    """Kick off the initial catalog build in the background. Called from the
    service lifespan so the first user request lands on a warm cache."""
    if _catalog_cache is None:
        _spawn_refresh()


class OntologyProvider:
    def list_tables(self) -> list[Table]:
        cache = _catalog_cache
        if cache is not None:
            if time.monotonic() >= cache[0]:
                # Expired: serve the stale copy now, refresh in the background.
                _spawn_refresh()
            return cache[1]
        # Cold start and the warmup hasn't landed yet: make sure a build is in
        # flight, but never block the request on the full fan-out.
        _spawn_refresh()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "分析目录预热中，请稍后重试")

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
