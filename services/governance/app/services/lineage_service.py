"""Assemble a cross-platform lineage graph from data / pipeline / ontology.

connector -> dataset -> pipeline -> mart(output), and dataset -> object_type.
"""

from app.clients import upstream
from app.schemas.governance import Lineage, LineageEdge, LineageNode


def build() -> Lineage:
    nodes: dict[str, LineageNode] = {}
    edges: list[LineageEdge] = []

    def add_node(node_id: str, type_: str, label: str) -> str:
        if node_id not in nodes:
            nodes[node_id] = LineageNode(id=node_id, type=type_, label=label)
        return node_id

    def add_edge(a: str, b: str) -> None:
        if a in nodes and b in nodes:
            edges.append(LineageEdge(from_id=a, to_id=b))

    # connectors + datasets
    for c in upstream.list_connectors():
        add_node(f"connector:{c['id']}", "connector", c["name"])
    for d in upstream.list_datasets():
        did = add_node(f"dataset:{d['id']}", "dataset", d["name"])
        if d.get("connector_id"):
            add_edge(f"connector:{d['connector_id']}", did)

    # pipelines: source datasets -> pipeline -> mart outputs
    for p in upstream.list_pipelines():
        pid = add_node(f"pipeline:{p['id']}", "pipeline", p["name"])
        graph = upstream.get_pipeline_graph(p["id"])
        for step in graph.get("steps", []):
            if step.get("kind") == "source":
                ds = step.get("config", {}).get("dataset_id")
                if ds:
                    add_edge(f"dataset:{ds}", pid)
        for out in upstream.list_pipeline_outputs(p["id"]):
            oid = add_node(f"mart:{out['id']}", "mart", out["name"])
            add_edge(pid, oid)

    # object types back onto datasets
    for ot in upstream.list_object_types():
        otid = add_node(f"objecttype:{ot['id']}", "object_type", ot["display_name"])
        if ot.get("dataset_id"):
            add_edge(f"dataset:{ot['dataset_id']}", otid)

    return Lineage(nodes=list(nodes.values()), edges=edges)
