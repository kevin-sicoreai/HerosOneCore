"""Agent tools.

Device/object tools use mock ontology data for now (aligned with the frontend
prototype); they swap to the ontology service once its read API exists.
Dataset tools call the real data service.
"""

import json

import httpx
from langchain_core.tools import tool

from app.clients import data_service

DEVICES: list[dict] = [
    {"id": "DV-10231", "model": "TX-500", "site": "华东-01", "status": "告警", "failure_rate": 8.4, "last_seen": "2 分钟前"},
    {"id": "DV-10232", "model": "TX-500", "site": "华东-01", "status": "运行", "failure_rate": 1.2, "last_seen": "1 分钟前"},
    {"id": "DV-10240", "model": "GX-220", "site": "华南-03", "status": "告警", "failure_rate": 7.9, "last_seen": "5 分钟前"},
    {"id": "DV-10255", "model": "TX-500", "site": "华北-02", "status": "停机", "failure_rate": 12.1, "last_seen": "1 小时前"},
    {"id": "DV-10261", "model": "GX-220", "site": "华南-03", "status": "运行", "failure_rate": 0.6, "last_seen": "刚刚"},
    {"id": "DV-10277", "model": "MX-900", "site": "西南-01", "status": "告警", "failure_rate": 6.5, "last_seen": "8 分钟前"},
    {"id": "DV-10288", "model": "MX-900", "site": "西南-01", "status": "运行", "failure_rate": 2.3, "last_seen": "3 分钟前"},
]


@tool
def search_objects(object_type: str, keyword: str = "") -> str:
    """检索本体对象实例。

    Args:
        object_type: 对象类型，目前支持「设备」(device)。
        keyword: 可选过滤词，匹配设备 ID / 型号 / 站点 / 状态。

    Returns:
        JSON：{"object_type", "total", "rows", "source"}。
    """
    rows = DEVICES
    if keyword:
        kw = keyword.lower()
        rows = [
            d for d in DEVICES
            if kw in d["id"].lower() or kw in d["model"].lower() or kw in d["site"] or kw in d["status"]
        ]
    return json.dumps(
        {"object_type": "设备", "total": len(rows), "rows": rows, "source": "设备对象"},
        ensure_ascii=False,
    )


@tool
def aggregate_failure_rate(days: int = 30, group_by: str = "model") -> str:
    """聚合近 N 天的设备故障率，找出风险最高的设备。

    Args:
        days: 统计窗口天数，默认 30。
        group_by: 分组维度，"model"（型号）或 "site"（站点）。

    Returns:
        JSON：{"days", "group_by", "groups", "top_risk", "source"}。
    """
    key = "site" if group_by == "site" else "model"
    groups: dict[str, list[float]] = {}
    for d in DEVICES:
        groups.setdefault(d[key], []).append(d["failure_rate"])
    aggregated = [
        {key: k, "avg_failure_rate": round(sum(v) / len(v), 2), "device_count": len(v)}
        for k, v in sorted(groups.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
    ]
    top = sorted(DEVICES, key=lambda d: -d["failure_rate"])[:3]
    return json.dumps(
        {"days": days, "group_by": key, "groups": aggregated, "top_risk": top, "source": "pipeline_maintenance"},
        ensure_ascii=False,
    )


_DATA_UNAVAILABLE = json.dumps(
    {"error": "data 服务不可用，无法查询数据集"}, ensure_ascii=False
)


@tool
def list_datasets() -> str:
    """列出平台上已接入的真实数据集（来自 data 服务）。

    Returns:
        JSON：{"total", "datasets": [{"id", "name", "row_count", "last_synced_at"}], "source"}。
    """
    try:
        datasets = data_service.list_datasets()
    except httpx.HTTPError:
        return _DATA_UNAVAILABLE
    return json.dumps(
        {
            "total": len(datasets),
            "datasets": [
                {
                    "id": d.get("id"),
                    "name": d.get("name"),
                    "row_count": d.get("row_count"),
                    "last_synced_at": d.get("last_synced_at"),
                }
                for d in datasets
            ],
            "source": "数据集目录",
        },
        ensure_ascii=False,
    )


@tool
def get_dataset_schema(dataset: str) -> str:
    """查看某个数据集的表结构（列名与类型）。dataset 传数据集名称或 ID。

    Returns:
        JSON：{"dataset", "columns": [{"name", "data_type", "nullable"}], "source"}。
    """
    try:
        found = data_service.find_dataset(dataset)
        if found is None:
            return json.dumps({"error": f"数据集 '{dataset}' 不存在"}, ensure_ascii=False)
        columns = data_service.get_schema(found["id"])
    except httpx.HTTPError:
        return _DATA_UNAVAILABLE
    return json.dumps(
        {"dataset": found["name"], "columns": columns, "source": found["name"]},
        ensure_ascii=False,
    )


@tool
def preview_dataset(dataset: str, limit: int = 10) -> str:
    """预览某个数据集的前若干行真实数据。dataset 传数据集名称或 ID，limit 默认 10（最大 50）。

    Returns:
        JSON：{"dataset", "columns", "rows", "source"}。
    """
    try:
        found = data_service.find_dataset(dataset)
        if found is None:
            return json.dumps({"error": f"数据集 '{dataset}' 不存在"}, ensure_ascii=False)
        data = data_service.preview(found["id"], min(max(limit, 1), 50))
    except httpx.HTTPError:
        return _DATA_UNAVAILABLE
    return json.dumps(
        {
            "dataset": found["name"],
            "columns": data.get("columns", []),
            "rows": data.get("rows", []),
            "source": found["name"],
        },
        ensure_ascii=False,
        default=str,
    )


AGENT_TOOLS = [search_objects, aggregate_failure_rate, list_datasets, get_dataset_schema, preview_dataset]
