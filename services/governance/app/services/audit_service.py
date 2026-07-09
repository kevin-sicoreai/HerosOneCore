"""Audit feed: persisted write-log (append-only) merged with synthesized activity.

`record` appends one immutable row per successful mutating request (posted by
each service); `build` returns those rows merged with synthesized run/sync
activity, newest first.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import upstream
from app.repositories.models import AuditEvent
from app.schemas.governance import AuditEntry, AuditEventIn

_SYNC_ACTION = {"success": "同步成功", "failed": "同步失败", "running": "同步中", "pending": "同步排队"}
_RUN_ACTION = {"success": "管道运行成功", "failed": "管道运行失败", "running": "管道运行中", "pending": "管道排队"}
_VERB = {"POST": "创建", "PUT": "更新", "PATCH": "更新", "DELETE": "删除"}


def record(db: Session, payload: AuditEventIn) -> None:
    """Append an immutable audit row."""
    db.add(
        AuditEvent(
            actor=payload.actor,
            action=payload.action,
            target=payload.target,
            source=payload.source,
            status_code=payload.status_code,
            detail=payload.detail,
        )
    )
    db.commit()


def build(db: Session, limit: int = 100) -> list[AuditEntry]:
    entries: list[AuditEntry] = _synthesized()

    # persisted write-log (real actors), newest first
    for r in db.scalars(select(AuditEvent).order_by(AuditEvent.ts.desc()).limit(limit)):
        entries.append(AuditEntry(
            time=r.ts.isoformat(),
            actor=r.actor,
            action=f"{_VERB.get(r.action, r.action)} {r.target}",
            target=r.target,
            source=r.source,
        ))

    # newest first; entries without a time sort last
    entries.sort(key=lambda e: e.time or "", reverse=True)
    return entries[:limit]


def _synthesized() -> list[AuditEntry]:
    entries: list[AuditEntry] = []

    for c in upstream.list_connectors():
        for s in upstream.list_syncs(c["id"]):
            entries.append(AuditEntry(
                time=s.get("finished_at") or s.get("started_at") or s.get("created_at"),
                actor="system",
                action=_SYNC_ACTION.get(s.get("status"), "同步"),
                target=c["name"],
                source="data",
            ))

    for p in upstream.list_pipelines():
        for r in upstream.list_pipeline_runs(p["id"]):
            entries.append(AuditEntry(
                time=r.get("finished_at") or r.get("started_at") or r.get("created_at"),
                actor="system",
                action=_RUN_ACTION.get(r.get("status"), "运行管道"),
                target=p["name"],
                source="pipeline",
            ))

    for ot in upstream.list_object_types():
        entries.append(AuditEntry(
            time=ot.get("created_at"),
            actor="system",
            action="创建对象类型",
            target=ot.get("display_name", ot.get("api_name", "")),
            source="ontology",
        ))

    return entries
