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
