"""DAG helpers: validation (acyclic, well-formed) and topological ordering.

Works on lightweight (id, kind) step tuples and (from, to) edges so it stays
independent of the ORM.
"""

from collections import deque


class DagError(ValueError):
    pass


def validate(step_ids: set[str], edges: list[tuple[str, str]]) -> None:
    """Raise DagError if edges reference unknown steps or the graph has a cycle."""
    for src, dst in edges:
        if src not in step_ids:
            raise DagError(f"Edge references unknown step: {src}")
        if dst not in step_ids:
            raise DagError(f"Edge references unknown step: {dst}")
    # Cycle detection via Kahn's algorithm (see topological_order).
    topological_order(step_ids, edges)


def topological_order(step_ids: set[str], edges: list[tuple[str, str]]) -> list[str]:
    """Return step ids in dependency order; raise DagError on a cycle."""
    indegree = {sid: 0 for sid in step_ids}
    adj: dict[str, list[str]] = {sid: [] for sid in step_ids}
    for src, dst in edges:
        adj[src].append(dst)
        indegree[dst] += 1

    queue = deque(sorted(sid for sid, d in indegree.items() if d == 0))
    order: list[str] = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in adj[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)

    if len(order) != len(step_ids):
        raise DagError("Pipeline graph contains a cycle")
    return order


def inputs_of(step_id: str, edges: list[tuple[str, str]]) -> list[str]:
    """Upstream step ids feeding into ``step_id`` (edge order preserved)."""
    return [src for src, dst in edges if dst == step_id]
