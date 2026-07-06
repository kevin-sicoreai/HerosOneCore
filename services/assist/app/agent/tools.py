"""Agent tools.

Mock ontology data for now (aligned with the frontend prototype's device rows);
these swap to real ontology/data service calls once their read APIs exist.
"""

import json

from langchain_core.tools import tool

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


AGENT_TOOLS = [search_objects, aggregate_failure_rate]
