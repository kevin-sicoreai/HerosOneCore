"""Streaming chat endpoint: runs the agent and relays its events over SSE.

Event protocol (one JSON object per SSE `data:` line):
  {type: "step_start", id, icon, text, meta, status}   reasoning step begins
  {type: "step_end", id, meta}                          step finishes (✓)
  {type: "token", text}                                 answer text delta
  {type: "done", message_id, sources, devices}          turn complete
  {type: "error", message}                              agent failed
"""

import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.agent.build import get_agent
from app.core.config import settings
from app.core.db import SessionLocal, get_db
from app.core.logging import get_logger
from app.repositories import store
from app.schemas.chat import ChatRequest

log = get_logger("chat")
router = APIRouter()

# How each tool appears in the frontend trace card (icon names match the UI).
TOOL_DISPLAY: dict[str, dict[str, str]] = {
    "list_object_types": {"icon": "search", "text": "查询本体对象类型"},
    "get_object_type_schema": {"icon": "cite", "text": "读取对象类型属性"},
    "search_objects": {"icon": "search", "text": "检索本体对象实例"},
    "get_object": {"icon": "search", "text": "读取对象详情"},
    "get_related_objects": {"icon": "compute", "text": "追溯关联对象"},
    "get_lineage": {"icon": "cite", "text": "查询数据血缘"},
    "write_todos": {"icon": "model", "text": "规划任务步骤"},
}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _chunk_text(content: Any) -> str:
    """Normalize a message chunk's content to plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, dict):
                parts.append(p.get("text", ""))
            else:
                parts.append(str(p))
        return "".join(parts)
    return ""


def _tool_output_text(output: Any) -> str:
    return _chunk_text(getattr(output, "content", output) or "")


def _summarize(name: str, output_text: str) -> tuple[str, list[str]]:
    """Extract (meta summary, sources) from a tool result."""
    sources: list[str] = []
    summary = "完成"
    try:
        data = json.loads(output_text)
    except (json.JSONDecodeError, TypeError):
        return summary, sources
    if isinstance(data, dict):
        if data.get("source"):
            sources.append(data["source"])
        if name == "list_object_types":
            summary = f"{data.get('total', 0)} 个对象类型"
        elif name == "get_object_type_schema":
            summary = f"{len(data.get('properties', []))} 个属性"
        elif name == "search_objects":
            summary = f"命中 {data.get('total', len(data.get('rows', [])))} 条"
        elif name == "get_object":
            props = data.get("properties")
            summary = f"{len(props)} 个属性" if isinstance(props, dict) else "已读取"
        elif name == "get_related_objects":
            relations = data.get("relations", [])
            total = sum(r.get("count", 0) for r in relations)
            summary = f"{len(relations)} 类关联 · {total} 个对象"
        elif name == "get_lineage":
            summary = f"上游 {len(data.get('upstream', []))} · 下游 {len(data.get('downstream', []))}"
        if data.get("error"):
            summary = "不可用"
    return summary, sources


@router.post("/sessions/{session_id}/chat")
async def chat(session_id: str, body: ChatRequest, db: Session = Depends(get_db)):
    if store.get_session(db, session_id) is None:
        raise HTTPException(status_code=404, detail="session not found")

    store.add_message(db, session_id, "user", body.content)
    history = [
        {"role": m.role, "content": m.content}
        for m in store.list_messages(db, session_id)
        if m.content
    ]

    async def gen() -> AsyncIterator[str]:
        agent = get_agent()
        trace: list[dict] = []
        sources: list[str] = []
        answer: list[str] = []
        started: dict[str, float] = {}
        model_step_open = False
        t0 = time.monotonic()

        try:
            async for ev in agent.astream_events({"messages": history}, version="v2"):
                kind = ev["event"]

                if kind == "on_chat_model_stream":
                    text = _chunk_text(ev["data"]["chunk"].content)
                    if not text:
                        continue
                    if not model_step_open:
                        model_step_open = True
                        step = {
                            "id": "model",
                            "icon": "model",
                            "text": f"调用 {settings.llm_display_name} 生成回答",
                            "meta": "",
                            "status": "running",
                        }
                        trace.append(step)
                        yield _sse({"type": "step_start", **step})
                    answer.append(text)
                    yield _sse({"type": "token", "text": text})

                elif kind == "on_tool_start":
                    rid = str(ev["run_id"])
                    started[rid] = time.monotonic()
                    disp = TOOL_DISPLAY.get(ev["name"], {"icon": "compute", "text": ev["name"]})
                    step = {"id": rid, "icon": disp["icon"], "text": disp["text"], "meta": "", "status": "running"}
                    trace.append(step)
                    yield _sse({"type": "step_start", **step})

                elif kind == "on_tool_end":
                    rid = str(ev["run_id"])
                    elapsed = time.monotonic() - started.pop(rid, time.monotonic())
                    summary, s = _summarize(ev["name"], _tool_output_text(ev["data"].get("output")))
                    sources.extend(s)
                    meta = f"{summary} · {elapsed:.1f}s"
                    for step in trace:
                        if step["id"] == rid:
                            step["meta"] = meta
                            step["status"] = "done"
                    yield _sse({"type": "step_end", "id": rid, "meta": meta})

        except Exception as exc:
            log.exception("agent stream failed (session=%s)", session_id)
            yield _sse({"type": "error", "message": str(exc)[:300]})
            return

        if model_step_open:
            total_meta = f"{time.monotonic() - t0:.1f}s"
            for step in trace:
                if step["id"] == "model":
                    step["meta"] = total_meta
                    step["status"] = "done"
            yield _sse({"type": "step_end", "id": "model", "meta": total_meta})

        # "devices" retained (empty) for backward compatibility with stored
        # messages and the frontend extras shape; object types have no uniform
        # card representation, so inline object cards are no longer emitted.
        extras = {
            "sources": list(dict.fromkeys(sources)),
            "devices": [],
        }
        # The request-scoped db may already be torn down by now; use a fresh one.
        with SessionLocal() as fresh_db:
            message = store.add_message(
                fresh_db, session_id, "assistant", "".join(answer), trace=trace, extras=extras
            )
            message_id = message.id
        yield _sse({"type": "done", "message_id": message_id, **extras})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        # no-transform stops the Next.js dev proxy from gzip-compressing the
        # stream — compression buffers the whole body and kills token streaming.
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
