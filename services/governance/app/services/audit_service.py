"""Assemble an audit feed from real platform activity (syncs, runs, creations)."""

from app.clients import upstream
from app.schemas.governance import AuditEntry

_SYNC_ACTION = {"success": "同步成功", "failed": "同步失败", "running": "同步中", "pending": "同步排队"}
_RUN_ACTION = {"success": "管道运行成功", "failed": "管道运行失败", "running": "管道运行中", "pending": "管道排队"}


def build(limit: int = 100) -> list[AuditEntry]:
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

    # newest first; entries without a time sort last
    entries.sort(key=lambda e: e.time or "", reverse=True)
    return entries[:limit]
