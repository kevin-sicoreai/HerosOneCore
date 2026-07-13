"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  BarChart3Icon,
  BoxesIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FilterIcon,
  Loader2Icon,
  MapIcon,
  RadarIcon,
  RouteIcon,
  SearchIcon,
  Share2Icon,
  TableIcon,
  XIcon,
} from "lucide-react"

import {
  ontologyApi,
  type GraphNode,
  type LinkType,
  type OntologyGraph,
  type Property,
} from "@/lib/ontology-api"
import { analysisApi, type AnalysisColumn, type FilterSpec } from "@/lib/analysis-api"
import {
  ANALYSIS_HANDOFF_KEY,
  collectPivotKeys,
  facetFilters,
  pivotDirections,
  pivotInFilter,
  type AnalysisHandoff,
  type PivotDirection,
} from "@/lib/object-set"
import { fieldLabel } from "@/lib/field-labels"
import { MapView, TimelineView } from "@/components/object-lenses"
import { MetricBarChart } from "@/components/metric-bar-chart"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/ui/pagination"

// Ontology node color -> Tailwind border/text classes (same map as the ontology page).
const COLOR: Record<string, string> = {
  emerald: "border-emerald-500/60 text-emerald-500",
  sky: "border-sky-500/60 text-sky-500",
  violet: "border-violet-500/60 text-violet-500",
  amber: "border-amber-500/60 text-amber-500",
  rose: "border-rose-500/60 text-rose-500",
}

// Ontology node color -> tinted icon-chip classes (bg + text), for the landing
// object-type cards. Literal class strings so Tailwind's JIT keeps them.
const TYPE_CHIP: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-500",
  sky: "bg-sky-500/10 text-sky-500",
  violet: "bg-violet-500/10 text-violet-500",
  amber: "bg-amber-500/10 text-amber-500",
  rose: "bg-rose-500/10 text-rose-500",
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

// A derived object set produced by a "search around" pivot: the selected type is
// switched to `targetTypeId` and an `in` filter pins it to the source set's keys.
// `chainText` is the human-readable trail shown as a chip.
type DerivedSet = { targetTypeId: string; inFilter: FilterSpec; chainText: string }

export default function ExplorerPage() {
  const { open } = useResourceDrawer()
  const [graph, setGraph] = React.useState<OntologyGraph>({ nodes: [], links: [] })
  const [linkTypes, setLinkTypes] = React.useState<LinkType[]>([])
  // Non-null when the current type is being viewed as a pivot-derived set.
  const [derived, setDerived] = React.useState<DerivedSet | null>(null)
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
    // Graph (node metadata + edge list) and link types (join columns) load
    // together; link types drive the set-level "search around" pivots. No type
    // is auto-selected — the page lands on the object-type card wall.
    Promise.all([ontologyApi.graph(), ontologyApi.linkTypes().catch(() => [])])
      .then(([g, lts]) => {
        setGraph(g)
        setLinkTypes(lts)
      })
      .finally(() => setLoading(false))
  }, [])

  const selectedNode = selectedTypeId ? typeMap.get(selectedTypeId) ?? null : null
  const cur = trail.length > 0 ? trail[trail.length - 1] : null

  function selectType(id: string) {
    setSelectedTypeId(id)
    setTrail([])
    setDerived(null)
  }

  // Return to the object-type card wall (landing state). Refresh always lands
  // here too — no last-selection memory.
  function backToTypes() {
    setSelectedTypeId(null)
    setTrail([])
    setDerived(null)
  }

  // Enter a pivot-derived set: switch to the peer type and pin it to the source
  // set's keys. Trail (single-object focus) is reset so we land on the list.
  function pivotTo(targetTypeId: string, inFilter: FilterSpec, chainText: string) {
    setSelectedTypeId(targetTypeId)
    setTrail([])
    setDerived({ targetTypeId, inFilter, chainText })
  }
  const pushFocus = (f: FocusObj) => setTrail((t) => [...t, f])
  const truncateTo = (i: number) => setTrail((t) => t.slice(0, i + 1))

  // Landing state: the object-type card wall. No type is selected, so the page
  // reads as a consumer search entry — pick a type to start exploring.
  if (!selectedNode) {
    return (
      <PageContainer className="h-full">
        <PageHeading
          title="对象浏览器"
          desc="选择一个对象类型开始探索，点开查看属性、关系与治理"
          icon={<BoxesIcon />}
        />
        <TypeGrid nodes={graph.nodes} links={graph.links} loading={loading} onSelect={selectType} />
      </PageContainer>
    )
  }

  // Explore / drill state: one type is selected. The card fills the viewport and
  // hosts either the faceted instance browser or a single object's Object View.
  return (
    <PageContainer className="h-full">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {cur ? (
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
          <InstanceList
            focus={selectedNode}
            onPick={pushFocus}
            onBack={backToTypes}
            links={linkTypes}
            nodeMap={typeMap}
            derived={derived && derived.targetTypeId === selectedNode.id ? derived : null}
            onPivot={pivotTo}
            onClearDerived={() => setDerived(null)}
          />
        )}
      </div>
    </PageContainer>
  )
}

// Landing state: the object-type card wall. Each card is a search-entry tile —
// Chinese display name, instance count, and how many relations the type takes
// part in. Clicking a card enters the explore state for that type.
function TypeGrid({
  nodes,
  links,
  loading,
  onSelect,
}: {
  nodes: GraphNode[]
  links: OntologyGraph["links"]
  loading: boolean
  onSelect: (id: string) => void
}) {
  // Relations a type participates in: edges touching it from either side.
  const relCountOf = React.useCallback(
    (id: string) =>
      links.filter((l) => l.from_object_type_id === id || l.to_object_type_id === id).length,
    [links]
  )

  if (loading && nodes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2Icon className="size-4 animate-spin" /> 加载本体…
        </span>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        暂无对象类型，请先在本体管理器中创建
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {nodes.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-emerald-500/50 hover:bg-muted/30"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5 ${
                  TYPE_CHIP[t.color] ?? TYPE_CHIP.emerald
                }`}
              >
                <BoxesIcon />
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-emerald-500" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-heading text-base font-semibold tracking-tight">
                {t.display_name}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t.instance_count?.toLocaleString() ?? "—"}
                </span>
                个实例
                <span className="text-muted-foreground/40">·</span>
                <span className="font-medium text-foreground">{relCountOf(t.id)}</span>
                个关系
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// How many instance rows to load for browsing + faceting. Higher than the old
// cap so facet value distributions are representative.
const INSTANCE_LIMIT = 500
// Client-side page size for the instance table. The 500-row sample is fetched
// once; only one page of rows is rendered at a time to keep the DOM light.
const INSTANCE_PAGE_SIZE = 50
// A property qualifies as a facet only when its distinct value count sits in this
// window — enough variety to filter by, but not a high-cardinality/unique column.
const FACET_MIN_DISTINCT = 2
const FACET_MAX_DISTINCT = 15
// Cap on the number of facet properties and the values shown per facet.
const FACET_MAX = 5
const FACET_VALUES_SHOWN = 8

// One filterable property and its value distribution, derived from loaded rows.
type Facet = { col: string; values: { value: string; count: number }[] }

// The ways to look at an object set: the instance table (default), a value
// distribution (count by a chosen dimension), a newest-first timeline, and a
// geographic map. Timeline/map are gated on the type having a time / geo
// property (see capability detection below).
type ObjView = "list" | "distribution" | "timeline" | "map"

// Top-N groups shown in the distribution view (server sorts by count desc).
const DISTRIBUTION_TOP = 20
// Sample size for the pivot-derived detail set (fed to the list + facets).
const DERIVED_SAMPLE_SIZE = 500

// Rows pulled for the timeline lens (newest-first). This goes through the
// analysis service (the object-set query engine) for the full set, not the
// 500-row browse sample used by the list/facets.
const TIMELINE_LIMIT = 200

// Numeric source SQL types — a property with one of these is treated as a
// measure when building lens columns (mirrors the analysis service).
const LENS_NUMERIC = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL)/i

// List mode: the selected type's instances, searchable and filterable by property
// facets. Clicking a row enters that object's focus (Object View) rather than
// opening the governance drawer.
function InstanceList({
  focus,
  onPick,
  onBack,
  links,
  nodeMap,
  derived,
  onPivot,
  onClearDerived,
}: {
  focus: GraphNode
  onPick: (f: FocusObj) => void
  onBack: () => void
  links: LinkType[]
  nodeMap: Map<string, GraphNode>
  derived: DerivedSet | null
  onPivot: (targetTypeId: string, inFilter: FilterSpec, chainText: string) => void
  onClearDerived: () => void
}) {
  const [columns, setColumns] = React.useState<string[]>([])
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [pkCol, setPkCol] = React.useState("id")
  // Total matched rows of the pivot-derived set (from the /analyze detail load).
  const [derivedMatched, setDerivedMatched] = React.useState(0)
  // The focused type's property list (from its detail) — drives time/geo
  // capability detection and the lens column metadata.
  const [properties, setProperties] = React.useState<Property[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [q, setQ] = React.useState("")
  // col -> selected values. Values within one facet OR together; facets AND.
  const [selected, setSelected] = React.useState<Record<string, Set<string>>>({})
  // Facets showing all their values rather than the top FACET_VALUES_SHOWN.
  const [expandedFacets, setExpandedFacets] = React.useState<Record<string, boolean>>({})
  // Current client-side page of the filtered rows.
  const [page, setPage] = React.useState(1)
  // Active view (list / timeline / map). Falls back to list on type switch.
  const [view, setView] = React.useState<ObjView>("list")
  // Lens data, fetched from the analysis service on demand (full set, not the
  // browse sample). Timeline = newest-first detail rows; map = geo count agg.
  const [timelineRows, setTimelineRows] = React.useState<Record<string, unknown>[]>([])
  const [geoCounts, setGeoCounts] = React.useState<{ value: string; count: number }[]>([])
  const [lensMatched, setLensMatched] = React.useState(0)
  const [lensLoading, setLensLoading] = React.useState(false)
  const [lensError, setLensError] = React.useState<string | null>(null)
  // Distribution view: the chosen dimension + its count-by-value breakdown.
  const [distAttr, setDistAttr] = React.useState<string>("")
  const [distRows, setDistRows] = React.useState<{ group: string; value: number }[]>([])
  // "Search around" menu + in-flight pivot state.
  const [pivotMenuOpen, setPivotMenuOpen] = React.useState(false)
  const [pivotBusy, setPivotBusy] = React.useState(false)
  const [pivotError, setPivotError] = React.useState<string | null>(null)
  // "Open in analysis workbench" handoff (navigates away) in-flight flag.
  const [handoffBusy, setHandoffBusy] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setQ("")
    setSelected({})
    setExpandedFacets({})
    setPage(1)
    setView("list")
    setProperties([])
    setPivotMenuOpen(false)
    setPivotError(null)
    ;(async () => {
      try {
        // Property/pk metadata always comes from the type detail; the sample rows
        // come from the ontology browse endpoint for a plain type, or from the
        // analysis service (detail mode over the `in` filter) for a derived set.
        const detail = await ontologyApi.objectType(focus.id)
        if (cancelled) return
        setPkCol(detail.primary_key ?? "id")
        setProperties(detail.properties)
        if (derived) {
          const res = await analysisApi.analyze({
            table: focus.api_name,
            group_by: null,
            metrics: [],
            filters: [derived.inFilter],
            page: 1,
            page_size: DERIVED_SAMPLE_SIZE,
          })
          if (cancelled) return
          // Detail rows are keyed by English field name; the type's properties
          // supply the column order + labels (analyze `columns` are labels).
          setColumns(detail.properties.map((p) => p.name))
          setRows(res.rows as Record<string, unknown>[])
          setDerivedMatched(res.matched_rows)
        } else {
          const list = await ontologyApi.objects(focus.id, INSTANCE_LIMIT)
          if (cancelled) return
          setColumns(list.columns)
          setRows(list.rows)
          setDerivedMatched(0)
        }
      } catch {
        if (!cancelled) setError("加载实例失败")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [focus.id, focus.api_name, derived])

  const labelOf = (r: Record<string, unknown>) => (r["name"] ? String(r["name"]) : String(r[pkCol]))

  // Derive facets from the loaded rows: string columns whose distinct-value count
  // falls in the facet window (excludes the primary key and high-cardinality cols).
  const facets = React.useMemo<Facet[]>(() => {
    const out: Facet[] = []
    for (const col of columns) {
      if (col === pkCol) continue
      const counts = new Map<string, number>()
      let numericOrEmpty = false
      for (const r of rows) {
        const v = r[col]
        if (v === null || v === undefined || v === "") continue
        // Only facet on string dimensions; numeric columns are treated as
        // high-cardinality measures and skipped.
        if (typeof v !== "string") {
          numericOrEmpty = true
          break
        }
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      if (numericOrEmpty) continue
      if (counts.size < FACET_MIN_DISTINCT || counts.size > FACET_MAX_DISTINCT) continue
      const values = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
      out.push({ col, values })
      if (out.length >= FACET_MAX) break
    }
    return out
  }, [columns, rows, pkCol])

  const activeFacets = React.useMemo(
    () => Object.entries(selected).filter(([, set]) => set.size > 0),
    [selected]
  )

  // --- Object-set lens plumbing (timeline / map). ---

  // Lens column metadata built from the type's properties (label + measure /
  // dimension kind), reused by TimelineView / MapView.
  const lensColumns = React.useMemo<AnalysisColumn[]>(
    () =>
      properties.map((p) => ({
        name: p.name,
        label: fieldLabel(p.name),
        kind: LENS_NUMERIC.test(p.data_type) ? "measure" : "dimension",
        data_type: p.data_type,
      })),
    [properties]
  )
  // Capability detection: the first DATE/TIMESTAMP property enables the timeline;
  // a city/region property enables the map. Null → the tab is disabled.
  const timeCol =
    lensColumns.find((c) => c.data_type && /^(DATE|TIMESTAMP)/i.test(c.data_type)) ?? null
  const geoCol = lensColumns.find((c) => c.name === "city" || c.name === "region") ?? null

  // Facet selections mapped to analysis filters (single → eq, multi → in), plus
  // the pivot-derived `in` filter when this is a derived set. Every lens
  // (distribution / timeline / map) queries the analysis service with these, so
  // a pivot flows through unchanged. The full-text search box is list-only.
  const lensFilters = React.useMemo<FilterSpec[]>(
    () => [...facetFilters(selected), ...(derived ? [derived.inFilter] : [])],
    [selected, derived]
  )

  // A short human summary of the active facet selections, for the pivot chain.
  const facetSummary = React.useMemo(
    () =>
      activeFacets.length > 0
        ? `（${activeFacets
            .map(([col, set]) => `${fieldLabel(col)}=${[...set].join("/")}`)
            .join("，")}）`
        : "",
    [activeFacets]
  )

  // Candidate dimensions for the distribution view: string dimensions, minus the
  // primary key (high-cardinality / not meaningful to group on).
  const distAttrs = React.useMemo(
    () => lensColumns.filter((c) => c.kind === "dimension" && c.name !== pkCol),
    [lensColumns, pkCol]
  )
  // Traversable links from this type, for the "search around" menu.
  const directions = React.useMemo(
    () => pivotDirections(links, focus.id),
    [links, focus.id]
  )

  // Timeline lens: newest-first detail slice over the full set via the analysis
  // service (ordered server-side by the time property).
  React.useEffect(() => {
    if (view !== "timeline" || !timeCol) return
    let cancelled = false
    setLensLoading(true)
    setLensError(null)
    analysisApi
      .analyze({
        table: focus.api_name,
        group_by: null,
        metrics: [],
        filters: lensFilters,
        page: 1,
        page_size: TIMELINE_LIMIT,
        order_by: timeCol.name,
        order_dir: "desc",
      })
      .then((r) => {
        if (cancelled) return
        setTimelineRows(r.rows as Record<string, unknown>[])
        setLensMatched(r.matched_rows)
      })
      .catch(() => {
        if (!cancelled) setLensError("分析服务未启动或查询失败")
      })
      .finally(() => {
        if (!cancelled) setLensLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [view, focus.api_name, timeCol, lensFilters])

  // Map lens: server-side count-per-geo aggregate mapped to {value, count}.
  React.useEffect(() => {
    if (view !== "map" || !geoCol) return
    let cancelled = false
    setLensLoading(true)
    setLensError(null)
    analysisApi
      .analyze({
        table: focus.api_name,
        group_by: geoCol.name,
        metrics: [{ field: geoCol.name, agg: "count" }],
        filters: lensFilters,
      })
      .then((r) => {
        if (cancelled) return
        setGeoCounts(
          r.rows.map((row) => ({ value: String(row.group ?? ""), count: Number(row.m0 ?? 0) }))
        )
        setLensMatched(r.matched_rows)
      })
      .catch(() => {
        if (!cancelled) setLensError("分析服务未启动或查询失败")
      })
      .finally(() => {
        if (!cancelled) setLensLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [view, focus.api_name, geoCol, lensFilters])

  // Effective distribution dimension: the user's choice when still valid for this
  // type, else the first candidate. Computed (not stored) so switching types needs
  // no reconciling effect.
  const activeDistAttr = distAttrs.some((c) => c.name === distAttr)
    ? distAttr
    : distAttrs[0]?.name ?? ""

  // Distribution view: count objects grouped by the chosen dimension (top N),
  // over the full set via the analysis service. Uses lensFilters so facet
  // selections and any pivot-derived `in` filter both apply.
  React.useEffect(() => {
    if (view !== "distribution" || !activeDistAttr) return
    let cancelled = false
    setLensLoading(true)
    setLensError(null)
    analysisApi
      .analyze({
        table: focus.api_name,
        group_by: activeDistAttr,
        metrics: [{ field: pkCol, agg: "count" }],
        filters: lensFilters,
        limit: DISTRIBUTION_TOP,
      })
      .then((r) => {
        if (cancelled) return
        setDistRows(
          r.rows.map((row) => ({ group: String(row.group ?? ""), value: Number(row.m0 ?? 0) }))
        )
        setLensMatched(r.matched_rows)
      })
      .catch(() => {
        if (!cancelled) setLensError("分析服务未启动或查询失败")
      })
      .finally(() => {
        if (!cancelled) setLensLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [view, focus.api_name, activeDistAttr, pkCol, lensFilters])

  // Run a set-level "search around": collect the current set's join keys and pivot
  // the whole set to the peer type via an `in` filter.
  async function runPivot(dir: PivotDirection) {
    const target = nodeMap.get(dir.targetTypeId)
    if (!target || pivotBusy) return
    setPivotBusy(true)
    setPivotError(null)
    try {
      const { keys, overLimit } = await collectPivotKeys(focus.api_name, dir.sourceKeyColumn, lensFilters)
      if (overLimit) {
        setPivotError(`对象集过大（${keys.length}+ 个键），请先筛选后再跳转`)
        return
      }
      if (keys.length === 0) {
        setPivotError("当前对象集为空或无有效关联键")
        return
      }
      const sourceDesc = derived ? derived.chainText : `${focus.display_name}${facetSummary}`
      const chainText = `${sourceDesc} → 沿『${dir.link.display_name}』→ ${target.display_name}`
      setPivotMenuOpen(false)
      onPivot(dir.targetTypeId, pivotInFilter(dir.targetColumn, keys), chainText)
    } catch {
      setPivotError("跳转失败：分析服务未启动或查询出错")
    } finally {
      setPivotBusy(false)
    }
  }

  // Hand the current object set off to the analysis workbench: package the type,
  // its compiled filters (facets + any derived pivot `in`), a human description,
  // and the true match count, then navigate. The workbench opens it as a
  // "source" step of its analysis path. The description reuses the pivot chain
  // phrasing so it reads the same as the chain chip.
  async function openInWorkbench() {
    if (handoffBusy) return
    setHandoffBusy(true)
    setPivotError(null)
    try {
      const base = derived ? derived.chainText : `${focus.display_name}${facetSummary}`
      // A derived set's chain text is captured at pivot time; append any facets
      // applied afterwards so the description matches the compiled filters.
      const desc = derived && facetSummary ? `${base}${facetSummary}` : base
      const matched = await analysisApi
        .analyze({
          table: focus.api_name,
          group_by: null,
          metrics: [],
          filters: lensFilters,
          page: 1,
          page_size: 1,
        })
        .then((r) => r.matched_rows)
        .catch(() => 0)
      const payload: AnalysisHandoff = { table: focus.api_name, desc, filters: lensFilters, matched }
      window.sessionStorage.setItem(ANALYSIS_HANDOFF_KEY, JSON.stringify(payload))
      router.push("/analysis?from=explorer")
    } catch {
      setPivotError("移交失败：分析服务未启动或查询出错")
      setHandoffBusy(false)
    }
  }

  // Map point drill-in: pin the clicked value as the geo facet's sole selection
  // and switch back to the list to show those instances.
  function drillGeo(value: string) {
    if (!geoCol) return
    // Same as toggleFacet: the set changes, so drop any stale pivot notice.
    setPivotError(null)
    setSelected((prev) => ({ ...prev, [geoCol.name]: new Set([value]) }))
    setView("list")
  }

  const filtered = rows.filter((r) => {
    if (
      q !== "" &&
      !Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
    )
      return false
    // AND across facets, OR within a facet's selected values.
    for (const [col, set] of activeFacets) {
      if (!set.has(String(r[col] ?? ""))) return false
    }
    return true
  })

  // Search / facet changes narrow the result set — jump back to the first page.
  React.useEffect(() => {
    setPage(1)
  }, [q, selected])

  const pageCount = Math.max(1, Math.ceil(filtered.length / INSTANCE_PAGE_SIZE))
  const paged = filtered.slice((page - 1) * INSTANCE_PAGE_SIZE, page * INSTANCE_PAGE_SIZE)

  function toggleFacet(col: string, value: string) {
    // Facet changes redefine the current object set, so a stale pivot over-limit
    // notice (computed against the previous set) must not linger.
    setPivotError(null)
    setSelected((prev) => {
      const next = { ...prev }
      const set = new Set(next[col] ?? [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      if (set.size === 0) delete next[col]
      else next[col] = set
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* ① Header bar: back to the type wall + type name + total badge + the big
          client-side search box (the visual lead of this consumer-search area). */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> 对象类型
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-heading text-base font-semibold tracking-tight">
            {focus.display_name}
          </span>
          <Badge variant="outline">
            {derived
              ? `${derivedMatched.toLocaleString()} 条`
              : `${focus.instance_count?.toLocaleString() ?? "—"} 实例`}
          </Badge>
        </div>
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`在${focus.display_name}中搜索…`}
            className="h-11 w-full rounded-xl border border-input bg-transparent pr-3 pl-11 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </div>
      </div>

      {/* ② Body: left facet panel (the page's signature) + right result area. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Faceted filter panel. */}
        <aside className="order-1 flex max-h-72 shrink-0 flex-col overflow-hidden border-b border-border lg:order-none lg:max-h-none lg:w-60 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            <FilterIcon className="size-3.5" /> 筛选
            {activeFacets.length > 0 && (
              <button
                onClick={() => {
                  // Same effect as removing each chip: reset selections and drop
                  // any stale pivot notice.
                  setPivotError(null)
                  setSelected({})
                }}
                className="ml-auto rounded-md px-1.5 py-0.5 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
              >
                清除全部
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
            {/* Selected values summarised as removable chips. */}
            {activeFacets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFacets.flatMap(([col, set]) =>
                  [...set].map((value) => (
                    <button
                      key={`${col}:${value}`}
                      onClick={() => toggleFacet(col, value)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                    >
                      <span className="text-muted-foreground">{fieldLabel(col)}:</span>
                      {value}
                      <XIcon className="size-3" />
                    </button>
                  ))
                )}
              </div>
            )}
            {loading ? (
              <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" /> 加载筛选项…
              </div>
            ) : facets.length === 0 ? (
              <div className="px-1 py-2 text-xs text-muted-foreground">当前对象类型无可筛选维度</div>
            ) : (
              facets.map((f) => {
                const sel = selected[f.col]
                const expanded = expandedFacets[f.col]
                const shown = expanded ? f.values : f.values.slice(0, FACET_VALUES_SHOWN)
                const hidden = f.values.length - shown.length
                // Bar scaling: the top value fills the row; the rest scale to it.
                const max = f.values[0]?.count ?? 1
                return (
                  <div key={f.col}>
                    <div className="mb-1 text-xs font-medium text-foreground">{fieldLabel(f.col)}</div>
                    <div className="space-y-0.5">
                      {shown.map((v) => {
                        const on = sel?.has(v.value) ?? false
                        const pct = Math.max(4, Math.round((v.count / max) * 100))
                        return (
                          <button
                            key={v.value}
                            onClick={() => toggleFacet(f.col, v.value)}
                            className={`relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-md px-2 py-1.5 text-xs transition-colors ${
                              on
                                ? "text-emerald-600 ring-1 ring-inset ring-emerald-500/50 dark:text-emerald-400"
                                : "hover:bg-muted"
                            }`}
                          >
                            {/* Count bar sized by this value's share of the facet max. */}
                            <span
                              aria-hidden
                              className={`absolute inset-y-0 left-0 ${
                                on ? "bg-emerald-500/20" : "bg-emerald-500/10"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                            <span className="relative z-10 flex min-w-0 items-center gap-1 text-left">
                              {on && <CheckIcon className="size-3 shrink-0" />}
                              <span className="truncate">{v.value}</span>
                            </span>
                            <span
                              className={`relative z-10 shrink-0 tabular-nums ${
                                on ? "" : "text-muted-foreground"
                              }`}
                            >
                              {v.count}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {(hidden > 0 || expanded) && f.values.length > FACET_VALUES_SHOWN && (
                      <button
                        onClick={() =>
                          setExpandedFacets((prev) => ({ ...prev, [f.col]: !prev[f.col] }))
                        }
                        className="mt-0.5 px-2 text-xs text-emerald-600 transition-colors hover:underline dark:text-emerald-400"
                      >
                        {expanded ? "收起" : `还有 ${hidden} 项`}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <div className="shrink-0 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            基于已加载的前 {rows.length} 行
          </div>
        </aside>

        {/* Result area: object-set action bar + the active view. */}
        <div className="order-2 flex min-h-0 flex-1 flex-col lg:order-none">
          {/* Object-set action bar: match count + derived chain chip (left);
              view switcher + set-level actions (right). */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-medium">
              {view === "list"
                ? derived
                  ? `${filtered.length} 行样本 · 共 ${derivedMatched.toLocaleString()} 条`
                  : `${filtered.length} 个对象`
                : `共 ${lensMatched.toLocaleString()} 条（全量）`}
            </span>

            {/* Derived-set chain chip: the "search around" trail that produced this set. */}
            {derived && (
              <span className="inline-flex min-w-0 max-w-md items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                <RouteIcon className="size-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {derived.chainText}
                  <span className="ml-1 font-medium">· {derivedMatched.toLocaleString()} 条</span>
                </span>
                <button
                  onClick={onClearDerived}
                  className="shrink-0 rounded-sm p-0.5 text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                  title="清除跳转链路"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* View switcher — 列表 / 分布 / 时间轴 / 地图. */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                {(
                  [
                    { key: "list", label: "列表", Icon: TableIcon, enabled: true, hint: "" },
                    {
                      key: "distribution",
                      label: "分布",
                      Icon: BarChart3Icon,
                      enabled: distAttrs.length > 0,
                      hint: "当前对象类型无可用维度",
                    },
                    {
                      key: "timeline",
                      label: "时间轴",
                      Icon: CalendarClockIcon,
                      enabled: !!timeCol,
                      hint: "当前对象类型无时间属性",
                    },
                    {
                      key: "map",
                      label: "地图",
                      Icon: MapIcon,
                      enabled: !!geoCol,
                      hint: "当前对象类型无地理属性",
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => t.enabled && setView(t.key)}
                    disabled={!t.enabled}
                    title={!t.enabled ? t.hint : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      !t.enabled ? "cursor-not-allowed opacity-50" : ""
                    } ${
                      view === t.key
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <t.Icon className="size-4" /> {t.label}
                  </button>
                ))}
              </div>

              {/* Search Around: pivot the whole current set to a related type. */}
              {directions.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setPivotMenuOpen((o) => !o)}
                    disabled={pivotBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-emerald-500/40 hover:text-foreground disabled:opacity-50"
                  >
                    {pivotBusy ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <Share2Icon className="size-4" />
                    )}
                    沿关系跳转
                  </button>
                  {pivotMenuOpen && (
                    <>
                      {/* Click-away backdrop. */}
                      <button
                        className="fixed inset-0 z-10 cursor-default"
                        aria-hidden
                        onClick={() => setPivotMenuOpen(false)}
                      />
                      <div className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                        <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                          将当前对象集沿关系跳转到
                        </div>
                        <div className="max-h-64 overflow-auto py-1">
                          {directions.map((d) => {
                            const target = nodeMap.get(d.targetTypeId)
                            return (
                              <button
                                key={`${d.link.id}:${d.reverse}`}
                                onClick={() => runPivot(d)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                              >
                                <ChevronRightIcon className="size-3.5 shrink-0 text-emerald-500" />
                                <span className="min-w-0 truncate">
                                  沿『{d.link.display_name}』→ {target?.display_name ?? d.targetTypeId}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Open the current object set in the analysis workbench (a handoff). */}
              <button
                onClick={openInWorkbench}
                disabled={handoffBusy}
                title="把当前对象集带到分析工作台，作为分析的起点"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-emerald-500/40 hover:text-foreground disabled:opacity-50"
              >
                {handoffBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RadarIcon className="size-4" />
                )}
                在分析工作台打开
              </button>
            </div>
          </div>

          {/* Over-limit / handoff notices for the set-level actions. */}
          {pivotError && (
            <div className="border-b border-border px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              {pivotError}
            </div>
          )}

          {view === "list" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" /> 加载实例…
                </div>
              ) : error ? (
                <div className="py-10 text-center text-sm text-red-500">{error}</div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          {columns.map((c) => (
                            <th key={c} className="px-3 py-2 text-left font-medium">
                              {fieldLabel(c)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((r, i) => (
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
                  </div>
                  {filtered.length > 0 && (
                    <Pagination
                      page={page}
                      pageSize={INSTANCE_PAGE_SIZE}
                      total={filtered.length}
                      pages={pageCount}
                      onPageChange={setPage}
                      className="shrink-0 border-t border-border"
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            // Lens body: distribution / timeline / map, fed by the analysis service
            // over the full object set (filtered by the mapped facet selections).
            <div className="min-h-0 flex-1 overflow-hidden">
              {view === "distribution" ? (
            <div className="flex h-full flex-col">
              {/* Dimension picker + total. */}
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-xs text-muted-foreground">按维度</span>
                <select
                  value={activeDistAttr}
                  onChange={(e) => setDistAttr(e.target.value)}
                  className="rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-emerald-500/60"
                >
                  {distAttrs.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <span className="ml-auto text-xs text-muted-foreground">
                  共 {lensMatched.toLocaleString()} 条
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {lensError ? (
                  <div className="py-10 text-center text-sm text-red-500">{lensError}</div>
                ) : lensLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" /> 加载分布…
                  </div>
                ) : distRows.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">暂无数据</div>
                ) : (
                  <MetricBarChart
                    title={`按${fieldLabel(activeDistAttr)}分布（Top ${DISTRIBUTION_TOP}）`}
                    unit=""
                    agg="count"
                    rows={distRows}
                  />
                )}
              </div>
            </div>
          ) : lensError ? (
            <div className="py-10 text-center text-sm text-red-500">{lensError}</div>
          ) : lensLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              加载{view === "timeline" ? "时间轴" : "地图"}…
            </div>
          ) : view === "timeline" && timeCol ? (
            <TimelineView rows={timelineRows} columns={lensColumns} timeCol={timeCol} />
          ) : view === "map" && geoCol ? (
            <MapView counts={geoCounts} geoCol={geoCol} onDrill={drillGeo} />
          ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
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
                  <span className="shrink-0 text-xs text-muted-foreground">{fieldLabel(k)}</span>
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
            links.map((link) => {
              // The link model carries only a forward name. When the focused
              // object sits on the link's `to` side, the relation reads in
              // reverse, so the block must phrase its title accordingly.
              // Self-links (from === to) count as forward.
              const reverse =
                link.from_object_type_id !== cur.otId && link.to_object_type_id === cur.otId
              return (
                <RelationBlock
                  key={`${cur.otId}:${cur.pk}:${link.id}`}
                  cur={cur}
                  linkId={link.id}
                  linkName={link.display_name}
                  reverse={reverse}
                  typeMap={typeMap}
                  pkColOf={pkColOf}
                  onPush={onPush}
                />
              )
            })
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
  reverse,
  typeMap,
  pkColOf,
  onPush,
}: {
  cur: FocusObj
  linkId: string
  linkName: string
  reverse: boolean
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
          {reverse ? (
            // Focused object is on the link's `to` side: lead with the peer type
            // and label this side as the inverse role.
            <>
              <span className="font-medium">{otherName}</span>
              <span className="text-muted-foreground">· 以此为{linkName}</span>
            </>
          ) : (
            <>
              <span className="font-medium">{linkName}</span>
              <span className="text-muted-foreground">· {otherName}</span>
            </>
          )}
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
