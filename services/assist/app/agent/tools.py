"""Agent tools — all backed by the built ontology (object types + instances).

The agent operates on the ontology semantic layer, not on raw datasets:
list object types, inspect an object type's properties, and search its
real instances (virtualized from the data plane).
"""

import json

import httpx
from langchain_core.tools import tool

from app.clients import ontology_service

_UNAVAILABLE = json.dumps({"error": "本体服务不可用，无法查询对象类型"}, ensure_ascii=False)

# Cap how many instances a single search pulls (the ontology API caps at 1000).
_SEARCH_LIMIT = 200


@tool
def list_object_types() -> str:
    """列出平台上已建模的本体对象类型（构建后的语义层，非原始数据集）。

    Returns:
        JSON：{"total", "object_types": [{"api_name", "display_name", "primary_key"}], "source"}。
    """
    try:
        types = ontology_service.list_object_types()
    except httpx.HTTPError:
        return _UNAVAILABLE
    return json.dumps(
        {
            "total": len(types),
            "object_types": [
                {
                    "api_name": t.get("api_name"),
                    "display_name": t.get("display_name"),
                    "primary_key": t.get("primary_key"),
                }
                for t in types
            ],
            "source": "本体",
        },
        ensure_ascii=False,
    )


@tool
def get_object_type_schema(object_type: str) -> str:
    """查看某个本体对象类型的属性（字段与类型）。object_type 传显示名 / API 名 / ID。

    Returns:
        JSON：{"object_type", "properties": [{"name", "data_type", "is_primary_key"}], "source"}。
    """
    try:
        found = ontology_service.find_object_type(object_type)
        if found is None:
            return json.dumps({"error": f"对象类型 '{object_type}' 不存在"}, ensure_ascii=False)
        detail = ontology_service.get_object_type(found["id"])
    except httpx.HTTPError:
        return _UNAVAILABLE
    return json.dumps(
        {
            "object_type": detail["display_name"],
            "properties": [
                {"name": p["name"], "data_type": p["data_type"], "is_primary_key": p["is_primary_key"]}
                for p in detail.get("properties", [])
            ],
            "source": detail["display_name"],
        },
        ensure_ascii=False,
    )


@tool
def search_objects(object_type: str, keyword: str = "") -> str:
    """检索某个本体对象类型的真实实例，可选关键词过滤（匹配任意字段）。

    object_type 传显示名 / API 名 / ID；keyword 为空则返回前若干条。

    Returns:
        JSON：{"object_type", "total", "columns", "rows", "source"}。
    """
    try:
        found = ontology_service.find_object_type(object_type)
        if found is None:
            return json.dumps({"error": f"对象类型 '{object_type}' 不存在"}, ensure_ascii=False)
        data = ontology_service.list_objects(found["id"], _SEARCH_LIMIT)
    except httpx.HTTPError:
        return _UNAVAILABLE
    rows = data.get("rows", [])
    if keyword:
        kw = keyword.lower()
        rows = [r for r in rows if any(kw in str(v).lower() for v in r.values())]
    return json.dumps(
        {
            "object_type": found["display_name"],
            "total": len(rows),
            "columns": data.get("columns", []),
            "rows": rows[:50],
            "source": found["display_name"],
        },
        ensure_ascii=False,
        default=str,
    )


AGENT_TOOLS = [list_object_types, get_object_type_schema, search_objects]
