"use client"

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
  type OnBeforeDelete,
  type OnConnect,
  type OnNodeDrag,
} from "@xyflow/react"
import { KeyIcon, PlusIcon, RefreshCwIcon, Share2Icon, Trash2Icon, XIcon } from "lucide-react"

import { dataApi, type Dataset } from "@/lib/data-api"
import {
  ontologyApi,
  type GraphLink,
  type GraphNode,
  type ObjectTypeDetail,
  type OntologyGraph,
} from "@/lib/ontology-api"
import { FlowCanvas } from "@/components/flow/flow-canvas"
import { PageContainer } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const NODE_W = 144
const NODE_H = 54
const COLORS = ["emerald", "sky", "violet", "amber", "rose"]
const CARDINALITIES = ["many_to_one", "one_to_many", "one_to_one", "many_to_many"]

const COLOR: Record<string, string> = {
  emerald: "border-blue-500/60 text-blue-500",
  sky: "border-sky-500/60 text-sky-500",
  violet: "border-violet-500/60 text-violet-500",
  amber: "border-amber-500/60 text-amber-500",
  rose: "border-rose-500/60 text-rose-500",
}

const inputCls = "w-full rounded-md border border-border bg-background px-2 py-0.5 text-xs"

type Panel = "detail" | "create" | "link"

// --- domain <-> React Flow conversions ---------------------------------------
const objToNode = (n: GraphNode): Node => ({
  id: n.id,
  type: "objectType",
  position: { x: n.x, y: n.y },
  data: { ...n } as unknown as Record<string, unknown>,
})
const linkToEdge = (l: GraphLink): Edge => ({
  id: l.id,
  source: l.from_object_type_id,
  target: l.to_object_type_id,
  label: l.display_name,
})

// --- custom node -------------------------------------------------------------
function ObjectTypeNode({ data, selected }: NodeProps) {
  const d = data as unknown as GraphNode
  return (
    <div
      className={`flex flex-col justify-center rounded-lg border-2 bg-card px-3 text-left shadow-sm ${
        COLOR[d.color] ?? COLOR.emerald
      } ${selected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background" : ""}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-border !bg-background" />
      <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
        <Share2Icon className="size-3 shrink-0" />
        <span className="truncate">{d.display_name}</span>
      </div>
      <div className="truncate text-[10px] text-muted-foreground">
        {d.property_count} 属性 · {d.instance_count ?? "—"} 实例
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-border !bg-background" />
    </div>
  )
}

export default function OntologyPage() {
  const [graph, setGraph] = React.useState<OntologyGraph>({ nodes: [], links: [] })
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [datasets, setDatasets] = React.useState<Dataset[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<ObjectTypeDetail | null>(null)
  const [panel, setPanel] = React.useState<Panel>("detail")
  const [error, setError] = React.useState<string | null>(null)

  // create form
  const [cf, setCf] = React.useState({ dataset_id: "", api_name: "", display_name: "" })
  // link form
  const [pendingLink, setPendingLink] = React.useState<{ from: string; to: string } | null>(null)
  const [linkDetails, setLinkDetails] = React.useState<{ from: ObjectTypeDetail; to: ObjectTypeDetail } | null>(null)
  const [lf, setLf] = React.useState({ display_name: "", from_property: "", to_property: "", cardinality: "many_to_one" })

  const nodeTypes = React.useMemo<NodeTypes>(() => ({ objectType: ObjectTypeNode }), [])

  const loadGraph = React.useCallback(async () => {
    const g = await ontologyApi.graph()
    setGraph(g)
    return g
  }, [])

  React.useEffect(() => {
    ;(async () => {
      try {
        const [, ds] = await Promise.all([loadGraph(), dataApi.datasets({ pageSize: 100 })])
        setDatasets(ds.items)
        // Don't auto-select a node on load — the detail popup opens only on click.
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败")
      }
    })()
  }, [loadGraph])

  // derive React Flow state from the server graph (positions come from the server)
  React.useEffect(() => {
    setNodes(graph.nodes.map(objToNode))
    setEdges(graph.links.map(linkToEdge))
  }, [graph, setNodes, setEdges])

  // load selected object type detail
  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    ontologyApi.objectType(selectedId).then(setDetail).catch(() => setDetail(null))
  }, [selectedId])

  // fetch both endpoints' properties when a link is pending
  React.useEffect(() => {
    if (!pendingLink) return
    ;(async () => {
      const [from, to] = await Promise.all([
        ontologyApi.objectType(pendingLink.from),
        ontologyApi.objectType(pendingLink.to),
      ])
      setLinkDetails({ from, to })
      setLf({
        display_name: `${from.display_name} → ${to.display_name}`,
        from_property: from.primary_key ?? from.properties[0]?.name ?? "",
        to_property: to.primary_key ?? to.properties[0]?.name ?? "",
        cardinality: "many_to_one",
      })
    })()
  }, [pendingLink])

  const selectedNode = selectedId ? graph.nodes.find((n) => n.id === selectedId) : null

  // --- canvas interactions ---------------------------------------------------
  const onNodeClick = React.useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedId(node.id)
    setPanel("detail")
  }, [])

  const onConnect = React.useCallback<OnConnect>((conn) => {
    if (conn.source && conn.target && conn.source !== conn.target) {
      setPendingLink({ from: conn.source, to: conn.target })
      setPanel("link")
    }
  }, [])

  const onNodeDragStop = React.useCallback<OnNodeDrag>((_e, node) => {
    ontologyApi
      .updateObjectType(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })
      .catch(() => {})
  }, [])

  // block object-type deletion via keyboard (destructive/server-side); allow link deletion
  const onBeforeDelete = React.useCallback<OnBeforeDelete>(async ({ edges: es }) => ({ nodes: [], edges: es }), [])

  const onEdgesDelete = React.useCallback(
    (es: Edge[]) => {
      Promise.all(es.map((e) => ontologyApi.deleteLink(e.id).catch(() => {}))).then(() => loadGraph())
    },
    [loadGraph],
  )

  // --- actions ---------------------------------------------------------------
  function startCreate() {
    setPanel("create")
    setCf({ dataset_id: datasets[0]?.id ?? "", api_name: "", display_name: "" })
  }
  async function submitCreate() {
    setError(null)
    try {
      const n = graph.nodes.length
      const created = await ontologyApi.createObjectType({
        ...cf,
        color: COLORS[n % COLORS.length],
        x: 80 + (n % 4) * 200,
        y: 80 + Math.floor(n / 4) * 140,
      })
      await loadGraph()
      setSelectedId(created.id)
      setPanel("detail")
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败")
    }
  }
  async function submitLink() {
    if (!pendingLink) return
    setError(null)
    try {
      await ontologyApi.createLink({
        api_name: (lf.display_name.replace(/\W+/g, "_") || "link").toLowerCase(),
        display_name: lf.display_name,
        from_object_type_id: pendingLink.from,
        to_object_type_id: pendingLink.to,
        from_property: lf.from_property,
        to_property: lf.to_property,
        cardinality: lf.cardinality,
      })
      await loadGraph()
      setPendingLink(null)
      setPanel("detail")
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建关系失败")
    }
  }
  async function deleteSelected() {
    if (!selectedId) return
    const name = selectedNode?.display_name ?? ""
    if (!window.confirm(`确认删除对象类型「${name}」？关联的关系也会一并移除。`)) return
    await ontologyApi.deleteObjectType(selectedId).catch(() => {})
    setSelectedId(null)
    await loadGraph()
  }

  return (
    <PageContainer className="h-full">
      {/* One connected window: a grouped menu/toolbar bar on top, the canvas
          nested seamlessly below — no floating gap between the two. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
          {/* group: ontology context */}
          <span className="text-xs font-medium text-muted-foreground">本体</span>
          <Badge variant="outline">
            {graph.nodes.length} 对象类型 · {graph.links.length} 关系
          </Badge>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* group: build */}
          <Button size="sm" onClick={startCreate}><PlusIcon /> 新建对象类型</Button>
          <span className="text-xs text-muted-foreground">拖拽对象右侧手柄连线可建立关系</span>

          {/* group: global */}
          <div className="ml-auto flex items-center gap-2">
            {error && (
              <span title={error} className="max-w-[220px] truncate text-xs text-danger">
                {error}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={loadGraph}><RefreshCwIcon /> 刷新</Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          setNodes={setNodes}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          onBeforeDelete={onBeforeDelete}
          onEdgesDelete={onEdgesDelete}
          direction="LR"
          emptyHint="点上方「新建对象类型」开始"
        />

        {/* selected element — floating inspector popup (not docked to the right) */}
        {(panel !== "detail" || selectedNode) && (
          <div className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-[320px] flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4 shadow-lg">
            <div className="-mb-2 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setPanel("detail"); setSelectedId(null); setDetail(null) }}><XIcon /></Button>
            </div>
          {panel === "create" && (
            <>
              <div className="text-xs font-semibold">新建对象类型</div>
              <label className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">数据集</span>
                <select value={cf.dataset_id} onChange={(e) => setCf({ ...cf, dataset_id: e.target.value })} className={inputCls}>
                  <option value="">（选择数据集）</option>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">API 名称（英文）</span>
                <input value={cf.api_name} onChange={(e) => setCf({ ...cf, api_name: e.target.value })} className={inputCls} placeholder="Customer" />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">显示名</span>
                <input value={cf.display_name} onChange={(e) => setCf({ ...cf, display_name: e.target.value })} className={inputCls} placeholder="客户" />
              </label>
              <div className="flex gap-2">
                <Button size="xs" disabled={!cf.dataset_id || !cf.api_name || !cf.display_name} onClick={submitCreate}>创建</Button>
                <Button size="xs" variant="ghost" onClick={() => setPanel("detail")}>取消</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">属性会从所选数据集的 schema 自动导入。</p>
            </>
          )}

          {panel === "link" && linkDetails && (
            <>
              <div className="text-sm font-semibold">新建关系</div>
              <div className="text-xs text-muted-foreground">{linkDetails.from.display_name} → {linkDetails.to.display_name}</div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">关系名</span>
                <input value={lf.display_name} onChange={(e) => setLf({ ...lf, display_name: e.target.value })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{linkDetails.from.display_name} 的连接字段</span>
                <select value={lf.from_property} onChange={(e) => setLf({ ...lf, from_property: e.target.value })} className={inputCls}>
                  {linkDetails.from.properties.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{linkDetails.to.display_name} 的连接字段</span>
                <select value={lf.to_property} onChange={(e) => setLf({ ...lf, to_property: e.target.value })} className={inputCls}>
                  {linkDetails.to.properties.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">基数</span>
                <select value={lf.cardinality} onChange={(e) => setLf({ ...lf, cardinality: e.target.value })} className={inputCls}>
                  {CARDINALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="flex gap-2">
                <Button size="sm" onClick={submitLink}>创建关系</Button>
                <Button size="sm" variant="ghost" onClick={() => { setPendingLink(null); setPanel("detail") }}>取消</Button>
              </div>
            </>
          )}

          {panel === "detail" && (selectedNode ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">对象类型</div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    {selectedNode.display_name}
                    <span className="text-sm font-normal text-muted-foreground">{selectedNode.api_name}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={deleteSelected}><Trash2Icon /></Button>
              </div>
              <div className="flex gap-2">
                <Badge variant="brand">{selectedNode.instance_count ?? "—"} 实例</Badge>
                <Badge variant="outline">{selectedNode.property_count} 属性</Badge>
              </div>

              <div className="mt-1 text-xs font-medium text-muted-foreground">属性</div>
              <div className="space-y-1">
                {(detail?.properties ?? []).map((p) => (
                  <div key={p.name} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      {p.is_primary_key && <KeyIcon className="size-3 text-amber-500" />}
                      {p.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.data_type}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground">实例数据请在「对象浏览器」中查看。</p>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              选择一个对象类型查看属性/实例。<br />
              拖对象右侧手柄到另一对象可建一条关系。<br />
              点上方「新建对象类型」添加。
            </div>
          ))}
          </div>
        )}
        </div>
      </div>
    </PageContainer>
  )
}
