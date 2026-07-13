"""Stateless AI endpoints for the analysis workbench (no DB, no agent loop).

Two one-shot LLM calls back the workbench's "AI 问数" and "AI 解读" features:

  POST /ai/metric-query  — natural-language → a structured metric query config.
      The LLM only *translates*: it picks a metric (+ optional dimension /
      filters) from the platform catalog. It does NOT execute the query. The
      frontend runs analysisApi.queryMetric with the USER's Bearer token, so
      governance masking / audit stay bound to the caller's identity.

  POST /ai/interpret     — already-masked aggregate rows → a short Chinese insight.
      The frontend sends the exact rows it is displaying (post-masking). Assist
      never fetches raw data; the model is told the numbers are authoritative
      and must not recompute or invent values.

Governance posture: assist is translate-only for querying and sees only masked
aggregates for interpretation — it never touches raw records nor carries the
user's data-access rights.
"""

import json
from functools import lru_cache

import httpx
from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.clients import analysis_service
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("ai")
router = APIRouter()


# --- Shared LLM helper --------------------------------------------------------


@lru_cache(maxsize=1)
def _get_llm() -> ChatOpenAI:
    """A non-streaming, low-temperature chat model coaxed into strict JSON.

    Built lazily (like app/agent/build.py) so importing this module never
    requires the LLM settings to be present. response_format=json_object nudges
    DeepSeek toward valid JSON; callers still strip fences defensively.
    """
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=settings.llm_timeout_seconds,
        temperature=0.1,
        streaming=False,
        model_kwargs={"response_format": {"type": "json_object"}},
    )


def _strip_fences(text: str) -> str:
    """Drop a leading/trailing markdown code fence if the model added one."""
    s = text.strip()
    if s.startswith("```"):
        # Remove opening fence (optionally ```json) and the closing fence.
        s = s[3:]
        if s[:4].lower() == "json":
            s = s[4:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def _invoke_json(system_prompt: str, human_payload: str) -> dict:
    """Invoke the LLM and parse its reply as a JSON object.

    Network / LLM failures raise 502; a non-JSON reply also raises 502 with a
    friendly Chinese detail (no retry loop).
    """
    llm = _get_llm()
    try:
        reply = llm.invoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=human_payload)]
        )
    except Exception as exc:  # noqa: BLE001 — surface any LLM/transport error uniformly
        log.exception("LLM invocation failed")
        raise HTTPException(status_code=502, detail="AI 服务暂时不可用，请稍后再试") from exc

    raw = reply.content if isinstance(reply.content, str) else str(reply.content)
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError as exc:
        log.warning("LLM returned non-JSON output: %s", raw[:300])
        raise HTTPException(status_code=502, detail="AI 返回内容无法解析，请重试") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI 返回内容格式异常，请重试")
    return data


# --- Endpoint 1: NL → metric query config -------------------------------------

_METRIC_QUERY_SYSTEM = """你是一个数据平台的「指标选择器」。给定平台的指标目录（JSON）和用户的自然语言问题，你要选出最能回答该问题的**单个**指标。

规则：
- 从指标目录中选择一个 metric（用其 key）。
- 当问题涉及**分组 / 排名 / 对比 / 各类**（如「各部门」「按城市」）时，从**该指标自身的 dimensions** 中选择一个最匹配的维度 key；否则 dimension 为 null。
- 仅当问题**明确限定了基础对象某个属性的取值**（如「状态=已完成」「城市为北京」）时，才输出等值过滤 filters；否则 filters 为空数组。
- 严格只输出 JSON，不要任何多余文字、不要 markdown：
  {"metric": "<指标 key>", "dimension": "<维度 key 或 null>", "filters": [{"field": "<属性>", "value": "<取值>"}], "reason": "<一句话中文说明选择的指标与口径>"}
- 若目录中没有任何指标能回答该问题，输出：
  {"error": "<一句话中文说明为什么回答不了，以及目前有哪些指标可用>"}
"""


class MetricQueryBody(BaseModel):
    question: str = Field(min_length=1, max_length=500)


@router.post("/ai/metric-query")
def metric_query(body: MetricQueryBody) -> dict:
    # Fetch the live metric catalog (the model must only pick from real metrics).
    try:
        catalog = analysis_service.list_metrics()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="分析服务不可用") from exc
    if not catalog:
        raise HTTPException(status_code=404, detail="平台暂无指标定义")

    # Compact the catalog for the prompt (only fields the picker needs).
    compact = [
        {
            "key": m.get("key"),
            "label": m.get("label"),
            "description": m.get("description"),
            "unit": m.get("unit"),
            "agg": m.get("agg"),
            "base_label": m.get("base_label"),
            "dimensions": [
                {"key": d.get("key"), "label": d.get("label")}
                for d in (m.get("dimensions") or [])
            ],
        }
        for m in catalog
    ]
    payload = json.dumps(
        {"catalog": compact, "question": body.question}, ensure_ascii=False
    )
    data = _invoke_json(_METRIC_QUERY_SYSTEM, payload)

    # The model may legitimately decide no metric fits — a normal outcome the
    # frontend renders inline, so pass it through with a 200.
    if data.get("error"):
        return {"error": str(data["error"])}

    # --- Server-side validation of the model's choice. ---
    by_key = {m.get("key"): m for m in catalog}
    metric_key = data.get("metric")
    metric = by_key.get(metric_key)
    if metric is None:
        raise HTTPException(status_code=422, detail="AI 选择的指标不存在，请换个问法")

    dims = {d.get("key"): d for d in (metric.get("dimensions") or [])}
    dim_key = data.get("dimension")
    # Silently drop a dimension that isn't one of this metric's own dimensions.
    if dim_key not in dims:
        dim_key = None

    # Keep only well-formed {field, value} string entries; cap at 3.
    filters: list[dict[str, str]] = []
    raw_filters = data.get("filters")
    if isinstance(raw_filters, list):
        for f in raw_filters:
            if not isinstance(f, dict):
                continue
            field = f.get("field")
            value = f.get("value")
            if isinstance(field, str) and isinstance(value, str) and field and value:
                filters.append({"field": field, "value": value})
            if len(filters) >= 3:
                break

    return {
        "metric": metric_key,
        "metric_label": metric.get("label"),
        "dimension": dim_key,
        "dimension_label": dims[dim_key].get("label") if dim_key else None,
        "filters": filters,
        "reason": data.get("reason"),
    }


# --- Endpoint 2: masked aggregates → Chinese insight --------------------------

_INTERPRET_SYSTEM = """你是一个数据分析解读器。给定一组已由指标引擎计算好的聚合数据（JSON），这些数值是**权威的、已计算好的**，你**绝不能**臆造或重新计算任何数值。

请写一段紧凑的中文洞察（不超过 150 字，结论先行）：
- 先给出核心结论（headline）。
- 指出主要贡献项 / 占比（占比只能基于给定的 rows 用简单百分比推算）。
- 指出值得注意的异常项或长尾现象。
- 若任何数值为字符串 "***"，说明该项因权限被脱敏，不要猜测其数值。

只输出纯文本，不要 markdown 标题、不要列表符号。以 JSON 返回：{"text": "<洞察>"}
"""


class InterpretRow(BaseModel):
    group: str
    value: float | str


class InterpretBody(BaseModel):
    title: str
    unit: str | None = None
    agg: str | None = None
    total: float | None = None
    matched_rows: int | None = None
    rows: list[InterpretRow] = Field(default_factory=list)
    question: str | None = None


@router.post("/ai/interpret")
def interpret(body: InterpretBody) -> dict:
    payload = json.dumps(
        {
            "title": body.title,
            "unit": body.unit,
            "agg": body.agg,
            "total": body.total,
            "matched_rows": body.matched_rows,
            # Cap defensively; the frontend already sends a small slice.
            "rows": [{"group": r.group, "value": r.value} for r in body.rows[:20]],
            "question": body.question,
        },
        ensure_ascii=False,
    )
    data = _invoke_json(_INTERPRET_SYSTEM, payload)
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=502, detail="AI 未能生成解读，请重试")
    return {"text": text.strip()}
