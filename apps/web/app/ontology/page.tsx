"use client"

import * as React from "react"
import { KeyIcon, PlusIcon, RefreshCwIcon, Share2Icon, TableIcon, Trash2Icon } from "lucide-react"

import { dataApi, type Dataset } from "@/lib/data-api"
import {
  ontologyApi,
  type GraphNode,
  type ObjectList,
  type ObjectTypeDetail,
  type OntologyGraph,
} from "@/lib/ontology-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const NODE_W = 160
const NODE_H = 64
const COLORS = ["emerald", "sky", "violet", "amber", "rose"]
const CARDINALITIES = ["many_to_one", "one_to_many", "one_to_one", "many_to_many"]

const COLOR: Record<string, string> = {
  emerald: "border-emerald-500/60 text-emerald-500",
  sky: "border-sky-500/60 text-sky-500",
  violet: "border-violet-500/60 text-violet-500",
  amber: "border-amber-500/60 text-amber-500",
  rose: "border-rose-500/60 text-rose-500",
}

const inputCls = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm"

type Panel = "detail" | "create" | "link"

export default function OntologyPage() {
  const [graph, setGraph] = React.useState<OntologyGraph>({ nodes: [], links: [] })
  const [datasets, setDatasets] = React.useState<Dataset[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<ObjectTypeDetail | null>(null)
  const [panel, setPanel] = React.useState<Panel>("detail")
  const [connectFrom, setConnectFrom] = React.useState<string | null>(null)
  const [instances, setInstances] = React.useState<ObjectList | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // create form
  const [cf, setCf] = React.useState({ dataset_id: "", api_name: "", display_name: "" })
  // link form
  const [pendingLink, setPendingLink] = React.useState<{ from: string; to: string } | null>(null)
  const [linkDetails, setLinkDetails] = React.useState<{ from: ObjectTypeDetail; to: ObjectTypeDetail } | null>(null)
  const [lf, setLf] = React.useState({ display_name: "", from_property: "", to_property: "", cardinality: "many_to_one" })

  const drag = React.useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  const loadGraph = React.useCallback(async () => {
    const g = await ontologyApi.graph()
    setGraph(g)
    return g
  }, [])

  React.useEffect(() => {
    ;(async () => {
      try {
        const [g, ds] = await Promise.all([loadGraph(), dataApi.datasets()])
        setDatasets(ds)
        if (g.nodes[0]) setSelectedId(g.nodes[0].id)
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败")
      }
    })()
  }, [loadGraph])

  // load selected object type detail + reset instance preview
  React.useEffect(() => {
    setInstances(null)
    if (!selectedId) { setDetail(null); return }
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

  const nodeById = (id: string) => graph.nodes.find((n) => n.id === id)
  const selectedNode = selectedId ? nodeById(selectedId) : null

  // --- canvas interactions ---------------------------------------------------
  function onNodeClick(id: string) {
    if (connectFrom && connectFrom !== id) {
      setPendingLink({ from: connectFrom, to: id })
      setPanel("link")
      setConnectFrom(null)
    } else {
      setSelectedId(id)
      setPanel("detail")
    }
  }
  function onPointerDown(e: React.PointerEvent, n: GraphNode) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.max(0, d.ox + dx), y: Math.max(0, d.oy + dy) } : n)),
    }))
  }
  function onPointerUp(n: GraphNode) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) { onNodeClick(n.id); return }
    const moved = nodeById(n.id)
    if (moved) ontologyApi.updateObjectType(n.id, { x: moved.x, y: moved.y }).catch(() => {})
  }

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
        x: 60 + (n % 4) * 180,
        y: 60 + Math.floor(n / 4) * 120,
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
    await ontologyApi.deleteObjectType(selectedId).catch(() => {})
    setSelectedId(null)
    await loadGraph()
  }
  async function deleteLink(id: string) {
    await ontologyApi.deleteLink(id).catch(() => {})
    await loadGraph()
  }
  async function showInstances() {
    if (!selectedId) return
    setInstances(await ontologyApi.objects(selectedId))
  }

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="本体管理器"
        desc="定义对象类型、关系与属性 —— 平台的语义核心"
        icon={<Share2Icon />}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={loadGraph}><RefreshCwIcon /> 刷新</Button>
            <Button size="sm" onClick={startCreate}><PlusIcon /> 新建对象类型</Button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
      )}
      {connectFrom && <Badge variant="info" className="w-fit">连线中：点击目标对象类型（点空白取消）</Badge>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Canvas */}
        <div
          className="relative min-h-[440px] min-w-0 overflow-auto rounded-xl border border-border bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]"
          onPointerMove={onPointerMove}
          onClick={() => setConnectFrom(null)}
        >
          <div className="relative" style={{ width: 1000, height: 560 }}>
            <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
              {graph.links.map((l) => {
                const a = nodeById(l.from_object_type_id), b = nodeById(l.to_object_type_id)
                if (!a || !b) return null
                const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H / 2
                const x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H / 2
                return (
                  <g key={l.id} style={{ pointerEvents: "stroke", cursor: "pointer" }} onClick={() => deleteLink(l.id)}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeOpacity={0.5} />
                    <rect x={(x1 + x2) / 2 - 30} y={(y1 + y2) / 2 - 9} width={60} height={18} rx={4} fill="var(--color-card)" stroke="var(--color-border)" />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">
                      {l.display_name.length > 8 ? l.display_name.slice(0, 7) + "…" : l.display_name}
                    </text>
                  </g>
                )
              })}
            </svg>

            {graph.nodes.map((n) => (
              <div
                key={n.id}
                onPointerDown={(e) => onPointerDown(e, n)}
                onPointerUp={() => onPointerUp(n)}
                className={`absolute z-10 flex touch-none flex-col justify-center rounded-lg border-2 bg-card px-3 text-left shadow-sm ${
                  COLOR[n.color] ?? COLOR.emerald
                } ${selectedId === n.id ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""} ${
                  connectFrom === n.id ? "ring-2 ring-sky-400" : ""
                }`}
                style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H, cursor: "grab" }}
              >
                <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Share2Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{n.display_name}</span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {n.property_count} 属性 · {n.instance_count ?? "—"} 实例
                </div>
                <button
                  title="从此对象连关系"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setConnectFrom(n.id) }}
                  className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-border bg-background hover:bg-emerald-500"
                />
              </div>
            ))}

            {graph.nodes.length === 0 && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                点右上角「新建对象类型」开始
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4">
          {panel === "create" && (
            <>
              <div className="text-sm font-semibold">新建对象类型</div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">数据集</span>
                <select value={cf.dataset_id} onChange={(e) => setCf({ ...cf, dataset_id: e.target.value })} className={inputCls}>
                  <option value="">（选择数据集）</option>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">API 名称（英文）</span>
                <input value={cf.api_name} onChange={(e) => setCf({ ...cf, api_name: e.target.value })} className={inputCls} placeholder="Customer" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">显示名</span>
                <input value={cf.display_name} onChange={(e) => setCf({ ...cf, display_name: e.target.value })} className={inputCls} placeholder="客户" />
              </label>
              <div className="flex gap-2">
                <Button size="sm" disabled={!cf.dataset_id || !cf.api_name || !cf.display_name} onClick={submitCreate}>创建</Button>
                <Button size="sm" variant="ghost" onClick={() => setPanel("detail")}>取消</Button>
              </div>
              <p className="text-xs text-muted-foreground">属性会从所选数据集的 schema 自动导入。</p>
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

              <Button size="sm" variant="outline" onClick={showInstances}><TableIcon /> 查看实例</Button>
              {instances && (
                <div className="overflow-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        {instances.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {instances.rows.map((r, i) => (
                        <tr key={i} className="border-b border-border/60 last:border-0">
                          {instances.columns.map((c) => <td key={c} className="px-2 py-1">{String(r[c] ?? "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              选择一个对象类型查看属性/实例。<br />
              点对象右侧圆点可拉一条关系。<br />
              点右上角「新建对象类型」添加。
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  )
}
