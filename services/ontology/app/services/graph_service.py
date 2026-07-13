"""Build the ontology graph (object types as nodes, links as edges).

The graph is served on the explorer's first paint, so it must be fast. Two
things kept it slow: a lazy ``ObjectType.properties`` load per node (N+1 against
the remote metadata store) and a per-node live COUNT of the backing Parquet
(one data-service call + one DuckDB scan each). Both are removed here:

  * properties are eager-loaded in a single query (``selectinload``);
  * instance counts come from one batched ``/datasets`` call, reading each
    dataset's maintained ``row_count`` instead of scanning Parquet.

The whole result is memoized in-process for a short TTL, so repeated paints
are served from memory. Only successful builds are cached.
"""

import time

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.clients import data_client
from app.core.logging import get_logger
from app.repositories.models import ObjectType
from app.schemas.graph import GraphLink, GraphNode, OntologyGraph
from app.services import link_type_service

logger = get_logger("graph")

# Short-lived memoization of the built graph. Object-type/link edits show up on
# the next paint after the TTL elapses; instance counts are already only as
# fresh as the last sync, so a ~minute of staleness here is imperceptible.
_CACHE_TTL_SECONDS = 60.0
_cache: dict = {"at": 0.0, "graph": None}


def _counts_by_dataset() -> dict[str, int | None]:
    """Map dataset id -> maintained row count, from one batched catalog call.

    Best-effort: if the data service is unavailable we return an empty map and
    every node falls back to ``instance_count = None`` (the graph still renders).
    """
    try:
        return {d["id"]: d.get("row_count") for d in data_client.list_datasets()}
    except Exception as exc:  # noqa: BLE001 - counts are best-effort for the graph
        logger.warning("batch dataset counts failed: %s", exc)
        return {}


def _build(db: Session) -> OntologyGraph:
    object_types = list(
        db.scalars(
            select(ObjectType)
            .options(selectinload(ObjectType.properties))
            .order_by(ObjectType.created_at.desc())
        )
    )
    links = link_type_service.list_all(db)
    counts = _counts_by_dataset()

    nodes = [
        GraphNode(
            id=ot.id,
            api_name=ot.api_name,
            display_name=ot.display_name,
            color=ot.color,
            x=ot.x,
            y=ot.y,
            property_count=len(ot.properties),
            instance_count=counts.get(ot.dataset_id),
        )
        for ot in object_types
    ]
    # Only keep links whose both endpoints still exist (defensive against any
    # orphaned link that slipped through).
    ids = {ot.id for ot in object_types}
    graph_links = [
        GraphLink(
            id=lt.id,
            display_name=lt.display_name,
            from_object_type_id=lt.from_object_type_id,
            to_object_type_id=lt.to_object_type_id,
            cardinality=lt.cardinality,
        )
        for lt in links
        if lt.from_object_type_id in ids and lt.to_object_type_id in ids
    ]
    return OntologyGraph(nodes=nodes, links=graph_links)


def build_graph(db: Session) -> OntologyGraph:
    now = time.monotonic()
    cached = _cache["graph"]
    if cached is not None and now - _cache["at"] < _CACHE_TTL_SECONDS:
        return cached
    graph = _build(db)
    _cache["at"] = now
    _cache["graph"] = graph
    return graph
