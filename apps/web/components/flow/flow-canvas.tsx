"use client"

// Shared React Flow canvas used by the pipeline builder and the ontology graph.
// Provides pan/zoom, a minimap, fit-to-view, one-click dagre auto-layout,
// drag-to-connect, grid snapping and dark-mode adaptation out of the box.
// Pages supply their own node renderers (nodeTypes) and interaction handlers.

import * as React from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
  type OnBeforeDelete,
  type OnConnect,
  type OnEdgesChange,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { LayoutGridIcon, MaximizeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { layoutWithDagre } from "./flow-layout"

// Fit after React Flow has synced the freshly-laid-out positions into its store.
// A double rAF lands after the controlled-nodes commit; the timeout is a
// belt-and-suspenders fallback for slower renders.
function fitSoon(rf: ReturnType<typeof useReactFlow>) {
  const fit = () => rf.fitView({ padding: 0.2, duration: 300 })
  requestAnimationFrame(() => requestAnimationFrame(fit))
  window.setTimeout(fit, 200)
}

type FlowCanvasProps = {
  nodes: Node[]
  edges: Edge[]
  nodeTypes: NodeTypes
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  onNodeClick?: NodeMouseHandler
  onNodeDragStop?: OnNodeDrag
  onEdgesDelete?: (edges: Edge[]) => void
  onBeforeDelete?: OnBeforeDelete
  onPaneClick?: () => void
  /** dagre layout direction for the "整理布局" button. */
  direction?: "LR" | "TB"
  /** Backspace deletes by default; pass null to disable keyboard deletion. */
  deleteKeyCode?: string | string[] | null
  /** Disable drawing new connections (read-only graphs like lineage). */
  nodesConnectable?: boolean
  /** Auto-run dagre layout once nodes are measured; re-runs when the signature changes. */
  autoLayout?: boolean
  autoLayoutSignature?: string | number
  emptyHint?: React.ReactNode
}

// Runs dagre layout automatically once nodes have been measured. Re-runs when
// `signature` changes (e.g. after the source graph reloads). Used for read-only
// graphs (lineage) that arrive without positions.
function AutoLayout({
  direction,
  setNodes,
  signature,
}: {
  direction: "LR" | "TB"
  setNodes: FlowCanvasProps["setNodes"]
  signature: string | number
}) {
  const initialized = useNodesInitialized()
  const rf = useReactFlow()
  const doneFor = React.useRef<string | number | null>(null)
  React.useEffect(() => {
    if (!initialized) return
    const ns = rf.getNodes()
    if (ns.length === 0 || doneFor.current === signature) return
    doneFor.current = signature
    setNodes(layoutWithDagre(ns, rf.getEdges(), direction))
    fitSoon(rf)
  }, [initialized, signature, direction, rf, setNodes])
  return null
}

function Toolbar({
  setNodes,
  direction,
}: {
  setNodes: FlowCanvasProps["setNodes"]
  direction: "LR" | "TB"
}) {
  const rf = useReactFlow()
  return (
    <Panel position="top-right" className="flex gap-1.5">
      <Button
        size="xs"
        variant="outline"
        onClick={() => {
          setNodes((ns) => layoutWithDagre(ns, rf.getEdges(), direction))
          fitSoon(rf)
        }}
      >
        <LayoutGridIcon /> 整理布局
      </Button>
      <Button
        size="xs"
        variant="outline"
        onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}
      >
        <MaximizeIcon /> 适应
      </Button>
    </Panel>
  )
}

export function FlowCanvas(props: FlowCanvasProps) {
  const isEmpty = props.nodes.length === 0
  return (
    <div className="relative h-full min-h-[300px] w-full overflow-hidden rounded-xl border border-border">
      <ReactFlowProvider>
        <ReactFlow
          nodes={props.nodes}
          edges={props.edges}
          nodeTypes={props.nodeTypes}
          onNodesChange={props.onNodesChange}
          onEdgesChange={props.onEdgesChange}
          onConnect={props.onConnect}
          onNodeClick={props.onNodeClick}
          onNodeDragStop={props.onNodeDragStop}
          onEdgesDelete={props.onEdgesDelete}
          onBeforeDelete={props.onBeforeDelete}
          onPaneClick={props.onPaneClick}
          deleteKeyCode={props.deleteKeyCode ?? "Backspace"}
          nodesConnectable={props.nodesConnectable ?? true}
          colorMode="system"
          snapToGrid
          snapGrid={[16, 16]}
          fitView
          minZoom={0.2}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-card" />
          <Toolbar setNodes={props.setNodes} direction={props.direction ?? "LR"} />
          {props.autoLayout && (
            <AutoLayout
              direction={props.direction ?? "LR"}
              setNodes={props.setNodes}
              signature={props.autoLayoutSignature ?? "auto"}
            />
          )}
        </ReactFlow>
      </ReactFlowProvider>
      {isEmpty && props.emptyHint && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {props.emptyHint}
        </div>
      )}
    </div>
  )
}
