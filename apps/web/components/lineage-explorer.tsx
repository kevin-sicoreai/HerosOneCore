"use client"

// Asset-centric lineage explorer, modeled on OpenMetadata's lineage view:
// pick an asset (search or quick chips), see its upstream/downstream subgraph
// with depth controls, expand hidden neighbours progressively, click a node to
// re-center on it. Rendered with the shared React Flow canvas (same stack as
// the pipeline/ontology editors); the full lineage graph stays client-side and
// subgraphs are sliced locally, so no extra backend calls are needed.

import * as React from "react"
import {
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react"
import {
  BoxesIcon,
  DatabaseIcon,
  InfoIcon,
  PlugIcon,
  SearchIcon,
  Share2Icon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"

import type { Lineage, LineageNode as ApiNode } from "@/lib/governance-api"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { FlowCanvas } from "@/components/flow/flow-canvas"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const TYPE_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  connector: { label: "连接器", icon: PlugIcon, cls: "border-slate-500/60 text-slate-500" },
  dataset: { label: "数据集", icon: DatabaseIcon, cls: "border-blue-500/60 text-blue-500" },
  mart: { label: "输出", icon: BoxesIcon, cls: "border-violet-500/60 text-violet-500" },
  pipeline: { label: "管道", icon: WorkflowIcon, cls: "border-amber-500/60 text-amber-500" },
  object_type: { label: "对象", icon: Share2Icon, cls: "border-rose-500/60 text-rose-500" },
}

type NodeData = {
  label: string
  kind: string
  isCenter: boolean
  hiddenUp: number
  hiddenDown: number
  onExpand: (id: string, dir: "up" | "down") => void
  onInfo: (id: string) => void
}

// ── custom card node ────────────────────────────────────────────────────────
function LineageCard({ id, data, selected }: NodeProps) {
  const d = data as unknown as NodeData
  const meta = TYPE_META[d.kind] ?? TYPE_META.dataset
  return (
    <div
      className={`group relative w-[200px] rounded-lg border-2 bg-card px-3 py-2 shadow-sm transition-shadow ${meta.cls} ${
        d.isCenter ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      } ${selected ? "shadow-md" : ""}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!size-2 !border-2 !border-border !bg-background" />
      <div className="flex items-center gap-1.5">
        <meta.icon className="size-3.5 shrink-0" />
        <span className="text-[10px] font-medium tracking-wide">{meta.label}</span>
        {d.isCenter && <Badge variant="brand" className="ml-auto px-1.5 text-[9px]">中心</Badge>}
        {!d.isCenter && (
          <button
            title="资产详情"
            onClick={(e) => {
              e.stopPropagation()
              d.onInfo(id)
            }}
            className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <InfoIcon className="size-3" />
          </button>
        )}
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground" title={d.label}>
        {d.label}
      </div>
      {/* progressive expand: hidden neighbour counters on either side */}
      {d.hiddenUp > 0 && (
        <button
          title={`展开 ${d.hiddenUp} 个上游`}
          onClick={(e) => {
            e.stopPropagation()
            d.onExpand(id, "up")
          }}
          className="absolute -left-3 top-1/2 z-10 -translate-x-full -translate-y-1/2 rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm hover:border-primary/50 hover:text-primary"
        >
          +{d.hiddenUp}
        </button>
      )}
      {d.hiddenDown > 0 && (
        <button
          title={`展开 ${d.hiddenDown} 个下游`}
          onClick={(e) => {
            e.stopPropagation()
            d.onExpand(id, "down")
          }}
          className="absolute -right-3 top-1/2 z-10 -translate-y-1/2 translate-x-full rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm hover:border-primary/50 hover:text-primary"
        >
          +{d.hiddenDown}
        </button>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} className="!size-2 !border-2 !border-border !bg-background" />
    </div>
  )
}

// ── explorer ────────────────────────────────────────────────────────────────
export function LineageExplorer({ lineage, hint }: { lineage: Lineage; hint?: string }) {
  const { open } = useResourceDrawer()
  const [centerId, setCenterId] = React.useState<string | null>(null)
  const [upDepth, setUpDepth] = React.useState(2)
  const [downDepth, setDownDepth] = React.useState(2)
  // Nodes revealed via the +N expand buttons, beyond the depth-limited slice.
  const [extraIds, setExtraIds] = React.useState<Set<string>>(new Set())
  const [query, setQuery] = React.useState("")

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const nodeTypes = React.useMemo<NodeTypes>(() => ({ lineage: LineageCard }), [])

  const byId = React.useMemo(
    () => new Map(lineage.nodes.map((n) => [n.id, n])),
    [lineage.nodes]
  )
  const { upMap, downMap } = React.useMemo(() => {
    const up = new Map<string, string[]>()
    const down = new Map<string, string[]>()
    for (const e of lineage.edges) {
      up.set(e.to_id, [...(up.get(e.to_id) ?? []), e.from_id])
      down.set(e.from_id, [...(down.get(e.from_id) ?? []), e.to_id])
    }
    return { upMap: up, downMap: down }
  }, [lineage.edges])

  // Reset expansions when the focus or depth changes.
  const recenter = React.useCallback((id: string) => {
    setCenterId(id)
    setExtraIds(new Set())
    setQuery("")
  }, [])

  const expand = React.useCallback(
    (id: string, dir: "up" | "down") => {
      const neighbours = (dir === "up" ? upMap : downMap).get(id) ?? []
      setExtraIds((prev) => new Set([...prev, ...neighbours]))
    },
    [upMap, downMap]
  )

  const info = React.useCallback(
    (id: string) => {
      const n = byId.get(id)
      if (n) open({ name: n.label, kind: TYPE_META[n.type]?.label ?? n.type })
    },
    [byId, open]
  )

  // Slice the visible subgraph: BFS up/down from the center + expansions.
  React.useEffect(() => {
    if (!centerId || !byId.has(centerId)) {
      setNodes([])
      setEdges([])
      return
    }
    const visible = new Set<string>([centerId])
    const walk = (start: string, map: Map<string, string[]>, depth: number) => {
      let frontier = [start]
      for (let i = 0; i < depth; i++) {
        const next: string[] = []
        for (const id of frontier) {
          for (const nb of map.get(id) ?? []) {
            if (!visible.has(nb)) {
              visible.add(nb)
              next.push(nb)
            }
          }
        }
        frontier = next
      }
    }
    walk(centerId, upMap, upDepth)
    walk(centerId, downMap, downDepth)
    for (const id of extraIds) if (byId.has(id)) visible.add(id)

    const hiddenCount = (id: string, map: Map<string, string[]>) =>
      (map.get(id) ?? []).filter((nb) => !visible.has(nb)).length

    setNodes(
      [...visible].map((id) => {
        const src = byId.get(id) as ApiNode
        return {
          id,
          type: "lineage",
          position: { x: 0, y: 0 },
          data: {
            label: src.label,
            kind: src.type,
            isCenter: id === centerId,
            hiddenUp: hiddenCount(id, upMap),
            hiddenDown: hiddenCount(id, downMap),
            onExpand: expand,
            onInfo: info,
          } as unknown as Record<string, unknown>,
        }
      })
    )
    setEdges(
      lineage.edges
        .filter((e) => visible.has(e.from_id) && visible.has(e.to_id))
        .map((e, i) => ({
          id: `e${i}`,
          source: e.from_id,
          target: e.to_id,
          animated: e.from_id === centerId || e.to_id === centerId,
        }))
    )
  }, [centerId, upDepth, downDepth, extraIds, byId, upMap, downMap, lineage.edges, expand, info, setNodes, setEdges])

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return lineage.nodes
      .filter((n) => n.label.toLowerCase().includes(q))
      .slice(0, 12)
  }, [query, lineage.nodes])

  // Quick-entry chips for the empty state: pipelines + marts first (the
  // richest neighbourhoods), padded with a few object types.
  const quickPicks = React.useMemo(() => {
    const rank = (t: string) => (t === "pipeline" ? 0 : t === "mart" ? 1 : t === "object_type" ? 2 : 3)
    return [...lineage.nodes].sort((a, b) => rank(a.type) - rank(b.type)).slice(0, 6)
  }, [lineage.nodes])

  if (lineage.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {hint ?? "暂无血缘数据"}
      </div>
    )
  }

  const searchBox = (autoFocus = false) => (
    <div className="relative">
      <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`搜索 ${lineage.nodes.length} 个资产…`}
        autoFocus={autoFocus}
        className="h-9 w-72 pl-8"
      />
      {matches.length > 0 && (
        <div className="absolute left-0 top-10 z-30 max-h-72 w-96 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {matches.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.dataset
            return (
              <button
                key={n.id}
                onClick={() => recenter(n.id)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent"
              >
                <meta.icon className={`size-3.5 shrink-0 ${meta.cls.split(" ")[1]}`} />
                <span className="truncate">{n.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{meta.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // Empty state: guide the user to pick a focus asset (OM-style entry).
  if (!centerId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <div className="text-center">
          <div className="font-heading text-base font-semibold">选择一个资产，查看它的血缘</div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            以资产为中心展示上下游链路（共 {lineage.nodes.length} 资产 · {lineage.edges.length} 关系）
          </p>
        </div>
        {searchBox(true)}
        <div className="flex max-w-xl flex-wrap items-center justify-center gap-2">
          {quickPicks.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.dataset
            return (
              <button
                key={n.id}
                onClick={() => recenter(n.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-accent"
              >
                <meta.icon className={`size-3.5 ${meta.cls.split(" ")[1]}`} />
                {n.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const center = byId.get(centerId)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* toolbar: search · focus breadcrumb · depth controls */}
      <div className="flex flex-wrap items-center gap-2">
        {searchBox()}
        <Badge variant="outline" className="max-w-[220px]">
          <span className="truncate">中心：{center?.label}</span>
        </Badge>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>上游</span>
          <select
            value={upDepth}
            onChange={(e) => setUpDepth(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring dark:bg-input/30"
          >
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n} 层</option>)}
          </select>
          <span>下游</span>
          <select
            value={downDepth}
            onChange={(e) => setDownDepth(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring dark:bg-input/30"
          >
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n} 层</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setCenterId(null)}>
            <XIcon /> 清除
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={() => {}}
          setNodes={setNodes}
          onNodeClick={(_e, node) => {
            if (node.id !== centerId) recenter(node.id)
          }}
          direction="LR"
          deleteKeyCode={null}
          nodesConnectable={false}
          autoLayout
          autoLayoutSignature={`${centerId}:${upDepth}:${downDepth}:${extraIds.size}:${nodes.length}`}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        点击资产可切换中心 · 节点两侧「+N」展开更多上下游 · 悬停节点右上角查看详情
      </p>
    </div>
  )
}
