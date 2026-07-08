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
    "search_objects": {"icon": "search", "text": "检索本体对象「设备」"},
    "aggregate_failure_rate": {"icon": "compute", "text": "聚合设备故障率"},
    "list_datasets": {"icon": "search", "text": "查询数据集目录"},
    "get_dataset_schema": {"icon": "cite", "text": "读取数据集表结构"},
    "preview_dataset": {"icon": "search", "text": "预览数据集数据"},
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


def _summarize(name: str, output_text: str) -> tuple[str, list[str], list[dict]]:
    """Extract (meta summary, sources, risk devices) from a tool result."""
    sources: list[str] = []
    devices: list[dict] = []
    summary = "完成"
    try:
        data = json.loads(output_text)
    except (json.JSONDecodeError, TypeError):
        return summary, sources, devices
    if isinstance(data, dict):
        if data.get("source"):
            sources.append(data["source"])
        if name == "search_objects":
            rows = data.get("rows", [])
            summary = f"命中 {data.get('total', len(rows))} 条"
            devices = rows
        elif name == "aggregate_failure_rate":
            summary = f"{len(data.get('groups', []))} 个分组"
            devices = data.get("top_risk", [])
        elif name == "list_datasets":
            summary = f"{data.get('total', 0)} 个数据集"
        elif name == "get_dataset_schema":
            summary = f"{len(data.get('columns', []))} 列"
        elif name == "preview_dataset":
            summary = f"{len(data.get('rows', []))} 行"
        if data.get("error"):
            summary = "不可用"
    return summary, sources, devices


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
        devices: list[dict] = []
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
                    summary, s, d = _summarize(ev["name"], _tool_output_text(ev["data"].get("output")))
                    sources.extend(s)
                    if d:
                        devices = d
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

        extras = {
            "sources": list(dict.fromkeys(sources)),
            "devices": [
                {"id": d["id"], "model": d["model"], "site": d["site"], "failureRate": d["failure_rate"]}
                for d in devices
                if d.get("failure_rate", 0) > 5
            ][:3],
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
