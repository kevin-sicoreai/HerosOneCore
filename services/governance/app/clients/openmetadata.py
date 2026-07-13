"""OpenMetadata publisher client (REST, bot-token auth).

Maps platform assets into OM's entity model and pushes them idempotently
(every write is a PUT upsert):

    dataset (raw)  -> table   {service}.ops.raw.<name>
    mart           -> table   {service}.ops.mart.<name>
    object type    -> table   {service}.ops.ontology.<api_name>
    pipeline       -> pipeline {service}-pipelines.<name>
    lineage edges  -> OM lineage edges between the entities above

The OM service name is namespaced per profile ("herosonecore" for prod,
"herosonecore-<env>" otherwise) so dev runs never pollute the prod catalog.
"""

from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("openmetadata")

# DuckDB / platform type -> OpenMetadata column dataType.
_TYPE_MAP = {
    "INTEGER": "INT",
    "BIGINT": "BIGINT",
    "HUGEINT": "BIGINT",
    "SMALLINT": "SMALLINT",
    "TINYINT": "TINYINT",
    "DOUBLE": "DOUBLE",
    "FLOAT": "FLOAT",
    "DECIMAL": "DECIMAL",
    "BOOLEAN": "BOOLEAN",
    "DATE": "DATE",
    "TIME": "TIME",
    "TIMESTAMP": "TIMESTAMP",
    "VARCHAR": "STRING",
    "TEXT": "STRING",
    "STRING": "STRING",
    "UUID": "UUID",
}


def service_name() -> str:
    return "herosonecore" if settings.app_env == "prod" else f"herosonecore-{settings.app_env}"


def ui_url() -> str:
    """OM web UI root derived from the API url (strip the /api suffix)."""
    return settings.om_api_url.removesuffix("/api")


def _client() -> httpx.Client:
    return httpx.Client(
        base_url=settings.om_api_url,
        headers={"Authorization": f"Bearer {settings.om_token}"},
        timeout=settings.http_timeout,
    )


def _om_type(raw: str | None) -> str:
    head = (raw or "").split("(")[0].strip().upper()
    # e.g. "TIMESTAMP WITH TIME ZONE" -> TIMESTAMP
    return _TYPE_MAP.get(head.split(" ")[0], "STRING")


def _columns(cols: list[dict], name_key: str = "name", type_key: str = "data_type") -> list[dict]:
    out = []
    for c in cols:
        out.append({
            "name": c[name_key],
            "dataType": _om_type(c.get(type_key)),
            "dataTypeDisplay": (c.get(type_key) or "unknown").lower(),
        })
    return out or [{"name": "value", "dataType": "STRING", "dataTypeDisplay": "unknown"}]


def ping() -> bool:
    """True when the OM API answers with our token."""
    try:
        with _client() as c:
            return c.get("/v1/system/version").status_code == 200
    except httpx.HTTPError:
        return False


class Publisher:
    """One sync run. Builds the service/db/schema scaffolding, then upserts
    entities and lineage; collects per-kind counts for the status report."""

    def __init__(self) -> None:
        self.c = _client()
        self.svc = service_name()
        self.counts = {"tables": 0, "pipelines": 0, "edges": 0}
        # our lineage node id -> {"id": om_uuid, "type": "table"|"pipeline"}
        self.entity: dict[str, dict[str, str]] = {}

    def close(self) -> None:
        self.c.close()

    def _put(self, path: str, payload: dict) -> dict:
        resp = self.c.put(path, json=payload)
        resp.raise_for_status()
        # Some endpoints (e.g. /v1/lineage) reply 200 with an empty body.
        return resp.json() if resp.content else {}

    # -- scaffolding --------------------------------------------------------
    def ensure_scaffolding(self) -> None:
        self._put("/v1/services/databaseServices", {
            "name": self.svc,
            "serviceType": "CustomDatabase",
            "connection": {"config": {"type": "CustomDatabase", "sourcePythonClass": "herosonecore"}},
        })
        self._put("/v1/databases", {"name": "ops", "service": self.svc})
        for schema in ("raw", "mart", "ontology"):
            self._put("/v1/databaseSchemas", {"name": schema, "database": f"{self.svc}.ops"})
        self._put("/v1/services/pipelineServices", {
            "name": f"{self.svc}-pipelines",
            "serviceType": "CustomPipeline",
            "connection": {"config": {"type": "CustomPipeline"}},
        })

    # -- entities -----------------------------------------------------------
    def upsert_table(self, node_id: str, schema: str, name: str,
                     display_name: str | None, cols: list[dict],
                     description: str | None = None) -> None:
        data = self._put("/v1/tables", {
            "name": name,
            "displayName": display_name or name,
            "databaseSchema": f"{self.svc}.ops.{schema}",
            "columns": _columns(cols),
            **({"description": description} if description else {}),
        })
        self.entity[node_id] = {"id": data["id"], "type": "table"}
        self.counts["tables"] += 1

    def upsert_pipeline(self, node_id: str, name: str, description: str | None = None) -> None:
        data = self._put("/v1/pipelines", {
            "name": name,
            "service": f"{self.svc}-pipelines",
            **({"description": description} if description else {}),
        })
        self.entity[node_id] = {"id": data["id"], "type": "pipeline"}
        self.counts["pipelines"] += 1

    # -- lineage ------------------------------------------------------------
    def add_edge(self, from_node: str, to_node: str) -> None:
        a, b = self.entity.get(from_node), self.entity.get(to_node)
        if not a or not b:
            return  # endpoint not published (e.g. connector nodes)
        self._put("/v1/lineage", {"edge": {
            "fromEntity": {"id": a["id"], "type": a["type"]},
            "toEntity": {"id": b["id"], "type": b["type"]},
        }})
        self.counts["edges"] += 1
