"""Agent tools — all backed by the built ontology (object types + instances).

The agent operates on the ontology semantic layer, not on raw datasets:
list object types, inspect an object type's properties, and search its
real instances (virtualized from the data plane).
"""

import json
from typing import Any

import httpx
from langchain_core.tools import tool

from app.clients import governance_service, ontology_service

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


def _primary_key(found: dict[str, Any]) -> str:
    return found.get("primary_key") or "id"


@tool
def get_object(object_type: str, object_id: str) -> str:
    """读取某个具体对象的完整属性。object_type 传显示名 / API 名 / ID，object_id 为主键值。

    用于对象溯源问答的第一步（如「采购单 128 是什么情况」）。

    Returns:
        JSON：{"object_type", "id", "properties": {字段: 值}, "source"}。
    """
    try:
        found = ontology_service.find_object_type(object_type)
        if found is None:
            return json.dumps({"error": f"对象类型 '{object_type}' 不存在"}, ensure_ascii=False)
        pk_col = _primary_key(found)
        data = ontology_service.list_objects(found["id"], 1000)
    except httpx.HTTPError:
        return _UNAVAILABLE
    row = next(
        (r for r in data.get("rows", []) if str(r.get(pk_col)) == str(object_id)),
        None,
    )
    if row is None:
        return json.dumps(
            {"error": f"未找到 {found['display_name']} {object_id}"}, ensure_ascii=False
        )
    return json.dumps(
        {
            "object_type": found["display_name"],
            "id": str(object_id),
            "properties": row,
            "source": found["display_name"],
        },
        ensure_ascii=False,
        default=str,
    )


@tool
def get_related_objects(object_type: str, object_id: str) -> str:
    """沿本体关系返回某个对象关联到的对象（按关系分组）。

    用于对象溯源问答（「订单 1 关联了谁」）。object_type 传显示名 / API 名 / ID。

    Returns:
        JSON：{"object_type", "id", "relations": [{"relation", "related_type",
        "count", "objects": [{"id", "label"}]}], "source"}。
    """
    try:
        found = ontology_service.find_object_type(object_type)
        if found is None:
            return json.dumps({"error": f"对象类型 '{object_type}' 不存在"}, ensure_ascii=False)
        g = ontology_service.graph()
    except httpx.HTTPError:
        return _UNAVAILABLE

    type_map = {n["id"]: n for n in g.get("nodes", [])}
    pk_cache: dict[str, str] = {}

    def _far_pk(type_id: str) -> str:
        if type_id not in pk_cache:
            try:
                detail = ontology_service.get_object_type(type_id)
                pk_cache[type_id] = detail.get("primary_key") or "id"
            except httpx.HTTPError:
                pk_cache[type_id] = "id"
        return pk_cache[type_id]

    relations = []
    for link in g.get("links", []):
        if found["id"] not in (link.get("from_object_type_id"), link.get("to_object_type_id")):
            continue
        try:
            resp = ontology_service.linked(found["id"], object_id, link["id"], 5)
        except httpx.HTTPError:
            # Skip a single failing link rather than failing the whole tool.
            continue
        far_id = resp.get("object_type_id")
        far_meta = type_map.get(far_id)
        far_pk = _far_pk(far_id)
        rows = resp.get("rows", [])
        relations.append(
            {
                "relation": link.get("display_name"),
                "related_type": far_meta["display_name"] if far_meta else far_id,
                "count": len(rows),
                "objects": [
                    {
                        "id": str(row.get(far_pk)),
                        "label": str(row.get("name") or row.get(far_pk)),
                    }
                    for row in rows
                ],
            }
        )
    return json.dumps(
        {
            "object_type": found["display_name"],
            "id": str(object_id),
            "relations": relations,
            "source": found["display_name"],
        },
        ensure_ascii=False,
        default=str,
    )


@tool
def get_lineage(object_type: str) -> str:
    """返回某个对象类型的数据血缘（上游数据集 / 连接器 → 下游）。

    用于对象溯源问答（「数据从哪来」）。object_type 传显示名 / API 名 / ID。

    Returns:
        JSON：{"object_type", "upstream": [名称...], "downstream": [名称...], "source"}。
    """
    try:
        found = ontology_service.find_object_type(object_type)
        if found is None:
            return json.dumps({"error": f"对象类型 '{object_type}' 不存在"}, ensure_ascii=False)
        lin = governance_service.lineage()
    except httpx.HTTPError:
        return json.dumps({"error": "血缘服务不可用，无法查询数据血缘"}, ensure_ascii=False)

    type_name = found["display_name"]
    nodes = lin.get("nodes", [])
    edges = lin.get("edges", [])
    node = next((n for n in nodes if n.get("label") == type_name), None)
    if node is None:
        return json.dumps(
            {
                "object_type": type_name,
                "upstream": [],
                "downstream": [],
                "note": "无血缘记录",
            },
            ensure_ascii=False,
        )
    label_of = {n["id"]: n.get("label") for n in nodes}
    upstream = [label_of.get(e["from_id"]) for e in edges if e.get("to_id") == node["id"]]
    downstream = [label_of.get(e["to_id"]) for e in edges if e.get("from_id") == node["id"]]
    return json.dumps(
        {
            "object_type": type_name,
            "upstream": [u for u in upstream if u],
            "downstream": [d for d in downstream if d],
            "source": type_name,
        },
        ensure_ascii=False,
    )


AGENT_TOOLS = [
    list_object_types,
    search_objects,
    get_object,
    get_related_objects,
    get_lineage,
    get_object_type_schema,
]
