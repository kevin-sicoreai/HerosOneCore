"use client"

import * as React from "react"
import {
  BoxesIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SearchIcon,
  Share2Icon,
} from "lucide-react"

import { ontologyApi, type GraphNode, type OntologyGraph } from "@/lib/ontology-api"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

// Ontology node color -> Tailwind border/text classes (same map as the ontology page).
const COLOR: Record<string, string> = {
  emerald: "border-emerald-500/60 text-emerald-500",
  sky: "border-sky-500/60 text-sky-500",
  violet: "border-violet-500/60 text-violet-500",
  amber: "border-amber-500/60 text-amber-500",
  rose: "border-rose-500/60 text-rose-500",
}

// Max neighbours listed inline per relation before a "view all" button appears.
// Beyond this the block expands in place to the full set — never a canvas fan-out.
const REL_CAP = 8

// One hop in the navigation trail: a concrete object instance the user drilled
// into. The trail grows as relations are followed and is truncated when the user
// clicks an earlier breadcrumb. Empty trail = the type's instance list.
type FocusObj = {
  otId: string
  pk: string
  label: string
  typeName: string
  color: string
  row: Record<string, unknown>
}

// One peer row inside a relation block, with its primary key resolved at fetch
// time so rendering never has to await.
type RelRow = { pk: string; label: string; row: Record<string, unknown> }

export default function ExplorerPage() {
  const { open } = useResourceDrawer()
  const [graph, setGraph] = React.useState<OntologyGraph>({ nodes: [], links: [] })
  const [selectedTypeId, setSelectedTypeId] = React.useState<string | null>(null)
  // Empty = list mode (browse the selected type's instances); non-empty = focus
  // mode (the Object View of the last trail entry).
  const [trail, setTrail] = React.useState<FocusObj[]>([])
  const [loading, setLoading] = React.useState(true)

  // otId -> primary-key column name, resolved lazily via objectType detail.
  const pkCache = React.useRef<Record<string, string>>({})
  const pkColOf = React.useCallback(async (otId: string): Promise<string> => {
    const hit = pkCache.current[otId]
    if (hit) return hit
    const detail = await ontologyApi.objectType(otId)
    const col = detail.primary_key ?? "id"
    pkCache.current[otId] = col
    return col
  }, [])

  // Type metadata (color/display name/api name) from the type-level graph.
  const typeMap = React.useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (const n of graph.nodes) m.set(n.id, n)
    return m
  }, [graph])

  React.useEffect(() => {
    ontologyApi
      .graph()
      .then((g) => {
        setGraph(g)
        if (g.nodes[0]) setSelectedTypeId(g.nodes[0].id)
      })
      .finally(() => setLoading(false))
  }, [])

  const selectedNode = selectedTypeId ? typeMap.get(selectedTypeId) ?? null : null
  const cur = trail.length > 0 ? trail[trail.length - 1] : null

  function selectType(id: string) {
    setSelectedTypeId(id)
    setTrail([])
  }
  const pushFocus = (f: FocusObj) => setTrail((t) => [...t, f])
  const truncateTo = (i: number) => setTrail((t) => t.slice(0, i + 1))

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="对象浏览器"
        desc="浏览对象实例，点开查看属性、关系与治理"
        icon={<BoxesIcon />}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* Object-type rail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">对象类型</div>
            <div className="space-y-0.5">
              {graph.nodes.map((t: GraphNode) => (
                <button
                  key={t.id}
                  onClick={() => selectType(t.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                    selectedTypeId === t.id
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{t.display_name}</span>
                  <span className="text-xs text-muted-foreground">{t.instance_count ?? "—"}</span>
                </button>
              ))}
              {!loading && graph.nodes.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  暂无对象类型，请先在本体管理器中创建
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main area: list mode (no focus) or Object View (focused) */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {!selectedNode ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2Icon className="size-4 animate-spin" /> 加载本体…
                </span>
              ) : (
                "请选择一个对象类型"
              )}
            </div>
          ) : cur ? (
            <ObjectView
              cur={cur}
              typeName={selectedNode.display_name}
              trail={trail}
              graph={graph}
              typeMap={typeMap}
              pkColOf={pkColOf}
              onHome={() => setTrail([])}
              onTruncate={truncateTo}
              onPush={pushFocus}
              onOpen={open}
            />
          ) : (
            <InstanceList focus={selectedNode} pkColOf={pkColOf} onPick={pushFocus} />
          )}
        </div>
      </div>
    </PageContainer>
  )
}

// List mode: the selected type's instances, searchable. Clicking a row enters
// that object's focus (Object View) rather than opening the governance drawer.
function InstanceList({
  focus,
  pkColOf,
  onPick,
}: {
  focus: GraphNode
  pkColOf: (otId: string) => Promise<string>
  onPick: (f: FocusObj) => void
}) {
  const [columns, setColumns] = React.useState<string[]>([])
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [pkCol, setPkCol] = React.useState("id")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [q, setQ] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setQ("")
    ;(async () => {
      try {
        const col = await pkColOf(focus.id)
        const list = await ontologyApi.objects(focus.id, 100)
        if (cancelled) return
        setPkCol(col)
        setColumns(list.columns)
        setRows(list.rows)
      } catch {
        if (!cancelled) setError("加载实例失败")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [focus.id, pkColOf])

  const labelOf = (r: Record<string, unknown>) => (r["name"] ? String(r["name"]) : String(r[pkCol]))
  const filtered = rows.filter(
    (r) => q === "" || Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索…"
            className="h-8 w-full rounded-lg border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} 个对象</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> 加载实例…
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-500">{error}</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() =>
                      onPick({
                        otId: focus.id,
                        pk: String(r[pkCol]),
                        label: labelOf(r),
                        typeName: focus.display_name,
                        color: focus.color,
                        row: r,
                      })
                    }
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                  >
                    {columns.map((c, j) => (
                      <td key={c} className={j === 0 ? "px-3 py-2 font-mono text-emerald-500" : "px-3 py-2"}>
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">无匹配对象</div>
            )}
          </>
        )}
      </div>
    </>
  )
}

// Focus mode: the Foundry Object View of one instance — breadcrumb trail, object
// header, properties, and relations grouped by link type.
function ObjectView({
  cur,
  typeName,
  trail,
  graph,
  typeMap,
  pkColOf,
  onHome,
  onTruncate,
  onPush,
  onOpen,
}: {
  cur: FocusObj
  typeName: string
  trail: FocusObj[]
  graph: OntologyGraph
  typeMap: Map<string, GraphNode>
  pkColOf: (otId: string) => Promise<string>
  onHome: () => void
  onTruncate: (i: number) => void
  onPush: (f: FocusObj) => void
  onOpen: (r: { name: string; kind?: string; lineageKey?: string }) => void
}) {
  // Links touching the focused object's type; each renders its own relation block
  // and fetches concurrently on mount.
  const links = graph.links.filter(
    (l) => l.from_object_type_id === cur.otId || l.to_object_type_id === cur.otId
  )

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb: {type} / drilled objects… */}
      <div className="sticky top-0 z-20 flex items-center gap-1.5 overflow-x-auto border-b border-border bg-card/95 px-3 py-2 text-sm backdrop-blur">
        <button
          onClick={onHome}
          className={`shrink-0 rounded-md px-1.5 py-0.5 ${
            trail.length === 0
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {typeName}
        </button>
        {trail.map((f, i) => (
          <React.Fragment key={`${f.otId}:${f.pk}:${i}`}>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <button
              onClick={() => onTruncate(i)}
              className={`max-w-[140px] shrink-0 truncate rounded-md px-1.5 py-0.5 ${
                i === trail.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Object header */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-semibold">{cur.label}</span>
                <Badge variant="outline" className={COLOR[cur.color] ?? COLOR.emerald}>
                  {cur.typeName}
                </Badge>
              </div>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">{cur.pk}</div>
            </div>
            <button
              onClick={() => onOpen({ name: cur.pk, kind: `${cur.typeName}对象`, lineageKey: cur.typeName })}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3.5" /> 治理详情
            </button>
          </div>

          {/* Properties */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">属性</div>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {Object.entries(cur.row).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-3 border-b border-border/40 py-1 text-sm"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{k}</span>
                  <span className="truncate text-right">
                    {v === null || v === undefined ? "—" : String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Relations */}
          <div className="text-xs font-medium text-muted-foreground">关系</div>
          {links.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">该对象类型没有定义关系</div>
          ) : (
            links.map((link) => (
              <RelationBlock
                key={`${cur.otId}:${cur.pk}:${link.id}`}
                cur={cur}
                linkId={link.id}
                linkName={link.display_name}
                typeMap={typeMap}
                pkColOf={pkColOf}
                onPush={onPush}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// A relation block: the peers reachable from the focused object along one link.
// Lists up to REL_CAP inline; when more exist, "view all" re-fetches the full set
// and expands the same block in place (no page jump, no canvas fan-out).
function RelationBlock({
  cur,
  linkId,
  linkName,
  typeMap,
  pkColOf,
  onPush,
}: {
  cur: FocusObj
  linkId: string
  linkName: string
  typeMap: Map<string, GraphNode>
  pkColOf: (otId: string) => Promise<string>
  onPush: (f: FocusObj) => void
}) {
  const [rows, setRows] = React.useState<RelRow[]>([])
  const [otherOtId, setOtherOtId] = React.useState("")
  const [otherName, setOtherName] = React.useState(linkId)
  const [otherColor, setOtherColor] = React.useState("emerald")
  const [overflow, setOverflow] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [expanding, setExpanding] = React.useState(false)

  // Map a linked result into resolved peer rows.
  const mapRows = React.useCallback(
    (resp: { columns: string[]; rows: Record<string, unknown>[] }, pkCol: string, cap?: number) => {
      const src = cap ? resp.rows.slice(0, cap) : resp.rows
      return src.map((r) => {
        const pk = String(r[pkCol])
        return { pk, label: r["name"] ? String(r["name"]) : pk, row: r }
      })
    },
    []
  )

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const resp = await ontologyApi.linked(cur.otId, cur.pk, linkId, REL_CAP + 1)
        const meta = typeMap.get(resp.object_type_id)
        const pkCol = await pkColOf(resp.object_type_id)
        if (cancelled) return
        setOtherOtId(resp.object_type_id)
        setOtherName(meta?.display_name ?? resp.object_type_id)
        setOtherColor(meta?.color ?? "emerald")
        setOverflow(resp.rows.length > REL_CAP)
        setRows(mapRows(resp, pkCol, REL_CAP))
      } catch {
        // Skip a relation that fails to load rather than break the whole view.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cur.otId, cur.pk, linkId, typeMap, pkColOf, mapRows])

  async function viewAll() {
    setExpanding(true)
    try {
      const resp = await ontologyApi.linked(cur.otId, cur.pk, linkId, 1000)
      const pkCol = await pkColOf(resp.object_type_id)
      setRows(mapRows(resp, pkCol))
      setExpanded(true)
    } catch {
      // Leave the capped view in place on failure.
    } finally {
      setExpanding(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Share2Icon className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{linkName}</span>
          <span className="text-muted-foreground">· {otherName}</span>
        </div>
        <Badge variant="outline">{overflow && !expanded ? `${REL_CAP}+` : rows.length}</Badge>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> 加载关系…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">无关联</div>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <button
              key={i}
              onClick={() =>
                onPush({
                  otId: otherOtId,
                  pk: r.pk,
                  label: r.label,
                  typeName: otherName,
                  color: otherColor,
                  row: r.row,
                })
              }
              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <span className="truncate">{r.label}</span>
              <span className="ml-3 shrink-0 font-mono text-xs text-muted-foreground">{r.pk}</span>
            </button>
          ))}
        </div>
      )}
      {overflow && !expanded && !loading && (
        <button
          onClick={viewAll}
          disabled={expanding}
          className="flex w-full items-center justify-center gap-1 border-t border-border px-4 py-2 text-xs text-emerald-600 transition-colors hover:bg-muted/40 disabled:opacity-50 dark:text-emerald-400"
        >
          {expanding ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" /> 加载全部…
            </>
          ) : (
            <>
              查看全部 {REL_CAP}+ 条 <ChevronRightIcon className="size-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  )
}
