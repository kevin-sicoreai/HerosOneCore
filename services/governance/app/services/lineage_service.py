"""Assemble a cross-platform lineage graph from data / pipeline / ontology.

Flow: connector -> dataset -> pipeline -> mart, and mart/dataset -> object_type.

A pipeline mart shows up twice at the source — as a pipeline output and as the
dataset it is registered back into the catalog as. They are merged into ONE node
(matched by storage_uri) so a mart has a single node whose upstream is the
producing pipeline and whose downstream is the object types built on it. The
internal "pipeline output" connector is hidden (the pipeline represents it).
"""

from app.clients import upstream
from app.schemas.governance import Lineage, LineageEdge, LineageNode


def build() -> Lineage:
    nodes: dict[str, LineageNode] = {}
    seen_edges: set[tuple[str, str]] = set()
    edges: list[LineageEdge] = []

    def add_node(node_id: str, type_: str, label: str) -> str:
        if node_id not in nodes:
            nodes[node_id] = LineageNode(id=node_id, type=type_, label=label)
        return node_id

    def add_edge(a: str, b: str) -> None:
        if a in nodes and b in nodes and a != b and (a, b) not in seen_edges:
            seen_edges.add((a, b))
            edges.append(LineageEdge(from_id=a, to_id=b))

    # Real source connectors only. The internal connector that pipeline marts are
    # cataloged under is hidden; the producing pipeline stands in for it.
    for c in upstream.list_connectors():
        if c.get("source_type") == "internal":
            continue
        add_node(f"connector:{c['id']}", "connector", c["name"])

    # Datasets: raw (dataset) or pipeline output (mart). Marts are indexed by
    # storage_uri so a pipeline output merges into the same node.
    mart_by_uri: dict[str, str] = {}
    for d in upstream.list_datasets():
        is_mart = d.get("layer") == "mart"
        did = add_node(f"dataset:{d['id']}", "mart" if is_mart else "dataset", d["name"])
        if d.get("connector_id"):
            add_edge(f"connector:{d['connector_id']}", did)  # no-op for hidden internal connector
        if is_mart and d.get("storage_uri"):
            mart_by_uri[d["storage_uri"]] = did

    # Pipelines: source datasets -> pipeline -> mart
    for p in upstream.list_pipelines():
        pid = add_node(f"pipeline:{p['id']}", "pipeline", p["name"])
        graph = upstream.get_pipeline_graph(p["id"])
        for step in graph.get("steps", []):
            if step.get("kind") == "source":
                ds = step.get("config", {}).get("dataset_id")
                if ds:
                    add_edge(f"dataset:{ds}", pid)
        for out in upstream.list_pipeline_outputs(p["id"]):
            uri = out.get("storage_uri")
            if uri and uri in mart_by_uri:
                add_edge(pid, mart_by_uri[uri])  # merged into the registered mart dataset
            else:
                oid = add_node(f"mart:{out['id']}", "mart", out["name"])  # not yet cataloged
                add_edge(pid, oid)

    # Object types onto their backing dataset/mart node
    for ot in upstream.list_object_types():
        otid = add_node(f"objecttype:{ot['id']}", "object_type", ot["display_name"])
        if ot.get("dataset_id"):
            add_edge(f"dataset:{ot['dataset_id']}", otid)

    return Lineage(nodes=list(nodes.values()), edges=edges)
