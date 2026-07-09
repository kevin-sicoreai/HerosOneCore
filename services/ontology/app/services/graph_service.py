"""Build the ontology graph (object types as nodes, links as edges)."""

from sqlalchemy.orm import Session

from app.clients import data_client, query
from app.core.logging import get_logger
from app.schemas.graph import GraphLink, GraphNode, OntologyGraph
from app.services import link_type_service, object_type_service

logger = get_logger("graph")


def _instance_count(dataset_id: str) -> int | None:
    try:
        return query.count(data_client.get_dataset(dataset_id)["storage_uri"])
    except Exception as exc:  # noqa: BLE001 - counts are best-effort for the graph
        logger.warning("instance count failed for dataset %s: %s", dataset_id, exc)
        return None


def build_graph(db: Session) -> OntologyGraph:
    object_types = object_type_service.list_all(db)
    links = link_type_service.list_all(db)
    nodes = [
        GraphNode(
            id=ot.id,
            api_name=ot.api_name,
            display_name=ot.display_name,
            color=ot.color,
            x=ot.x,
            y=ot.y,
            property_count=len(ot.properties),
            instance_count=_instance_count(ot.dataset_id),
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
