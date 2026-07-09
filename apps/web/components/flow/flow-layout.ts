// Auto-layout for React Flow graphs using dagre. Returns nodes with new
// positions; edges are read only for ranking and left unchanged.

import dagre from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"

const FALLBACK_W = 140
const FALLBACK_H = 50

/** Lay out `nodes` along `direction` ("LR" left-to-right, "TB" top-to-bottom). */
export function layoutWithDagre(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 36, ranksep: 72 })

  for (const n of nodes) {
    g.setNode(n.id, {
      width: n.measured?.width ?? FALLBACK_W,
      height: n.measured?.height ?? FALLBACK_H,
    })
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  // dagre reports node centers; React Flow positions are top-left corners.
  return nodes.map((n) => {
    const p = g.node(n.id)
    if (!p) return n
    return { ...n, position: { x: p.x - p.width / 2, y: p.y - p.height / 2 } }
  })
}
