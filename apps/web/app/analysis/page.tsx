"use client"

import * as React from "react"
import {
  BarChart3Icon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  FilterIcon,
  FolderOpenIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  MapIcon,
  PlusIcon,
  RadarIcon,
  RefreshCwIcon,
  RouteIcon,
  SaveIcon,
  Share2Icon,
  TableIcon,
  Trash2Icon,
  WifiOffIcon,
  XIcon,
} from "lucide-react"

import {
  analysisApi,
  type AnalysisColumn,
  type AnalysisDefinition,
  type AnalysisTable,
  type AnalyzeResult,
  type FilterOp,
  type FilterSpec,
  type Metric,
  type MetricAgg,
  type MetricQueryResult,
  type MetricSpec,
  type SavedAnalysisDetail,
  type SavedAnalysisSummary,
  type SavedPathStep,
} from "@/lib/analysis-api"
import { ontologyApi, type GraphNode, type LinkType } from "@/lib/ontology-api"
import {
  ANALYSIS_HANDOFF_KEY,
  collectPivotKeys,
  pivotDirections,
  pivotInFilter,
  type AnalysisHandoff,
  type PivotDirection,
} from "@/lib/object-set"
import { timeAgo } from "@/lib/assist-api"
import { fieldLabel } from "@/lib/field-labels"
import { PageContainer, PageHeading } from "@/components/page-container"
import { MapView, TimelineView } from "@/components/object-lenses"
import { MetricBarChart } from "@/components/metric-bar-chart"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/ui/pagination"

// A lens is one way of looking at the current object set. The relationship
// (schema) graph lives in the ontology manager, not here.
type Lens = "dashboard" | "table" | "chart" | "timeline" | "map"

const LENSES: { key: Lens; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "看板", icon: LayoutDashboardIcon },
  { key: "table", label: "表格", icon: TableIcon },
  { key: "chart", label: "图表", icon: BarChart3Icon },
  { key: "timeline", label: "时间轴", icon: CalendarClockIcon },
  { key: "map", label: "地图", icon: MapIcon },
]

// Detail-table server-side page size. The timeline pulls a small newest-first
// slice instead of the full object set; the map uses a server-side count aggregate.
const DETAIL_PAGE_SIZE = 100
const TIMELINE_LIMIT = 200

const AGG_OPTIONS: { value: MetricAgg; label: string }[] = [
  { value: "avg", label: "平均" },
  { value: "sum", label: "合计" },
  { value: "count", label: "计数" },
  { value: "max", label: "最大" },
  { value: "min", label: "最小" },
]

const OP_OPTIONS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "contains", label: "包含" },
]

const SELECT_BASE =
  "rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500/60"
// Full-width variant for single-column selects. Fixed/flex selects use
// SELECT_BASE directly to avoid a w-full vs w-* class conflict.
const SELECT_CLASS = `w-full ${SELECT_BASE}`

// Numeric source SQL types (mirrors the analysis service's _NUMERIC_TYPES).
// Used to right-align numeric detail columns even when the column is a
// dimension (e.g. an integer id kept as a dimension).
const NUMERIC_DATA_TYPE = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL)/i

function isNumericColumn(c: AnalysisColumn): boolean {
  return c.kind === "measure" || (!!c.data_type && NUMERIC_DATA_TYPE.test(c.data_type))
}

function formatValue(v: number | string): string {
  if (typeof v !== "number") return String(v)
  return v >= 1000 ? v.toLocaleString() : String(v)
}

// Metric values honour their aggregation + unit: rate renders as a percentage,
// currency gets a ¥ prefix, unit-of-count metrics append their unit.
function formatMetricValue(value: number, agg: string, unit: string): string {
  if (agg === "rate" || unit === "%") return `${value}%`
  const s = formatValue(value)
  if (unit === "¥") return `¥${s}`
  if (unit === "单" || unit === "个") return `${s} ${unit}`
  return s
}

// One step of the analysis path. The active query table after a step is its
// `targetTable`; the *last* step's derived filters attach to every /analyze.
//
// A "source" step is a handoff from the object browser: its `filters` (facet
// selections + any pivot `in`) are the derived filters and are directly
// replayable (facets recompile against current data).
//
// A "pivot" step is a set-level "search around": `inFilter` is the compiled `in`
// filter for the current session, while `linkId` + `reverse` + `stepFilters`
// (the user filters active when the pivot was taken) are the *recipe* — enough
// to recompile the keys against current data on re-open (we never persist the
// compiled key list).
type SourceStep = {
  kind: "source"
  desc: string
  targetTable: string
  targetLabel: string
  filters: FilterSpec[]
  matched: number
}
type PivotStep = {
  kind: "pivot"
  linkId: string
  reverse: boolean
  linkLabel: string
  targetTable: string
  targetLabel: string
  stepFilters: FilterSpec[]
  inFilter: FilterSpec
  matched: number
}
type PathStep = SourceStep | PivotStep

// The derived filters a step contributes to queries while it is the last step.
function stepDerivedFilters(step: PathStep): FilterSpec[] {
  return step.kind === "source" ? step.filters : [step.inFilter]
}

// Human label for the current lens, shown as the trailing breadcrumb segment.
const LENS_STEP_LABEL: Record<Lens, string> = {
  dashboard: "看板",
  table: "表格",
  chart: "图表",
  timeline: "时间轴",
  map: "地图",
}

export default function AnalysisPage() {
  const [tables, setTables] = React.useState<AnalysisTable[]>([])
  // Ontology metadata for set-level pivots: node list (api_name <-> id/label) and
  // full link types (join columns). Loaded once; failures degrade to no pivots.
  const [nodes, setNodes] = React.useState<GraphNode[]>([])
  const [linkTypes, setLinkTypes] = React.useState<LinkType[]>([])
  // The analysis path: each entry a pivot hop. Empty = plain (user-selected) table.
  const [pathSteps, setPathSteps] = React.useState<PathStep[]>([])
  // The origin table + count, captured when the first pivot happens.
  const [origin, setOrigin] = React.useState<{ table: string; label: string; count: number } | null>(
    null
  )
  const [pivotMenuOpen, setPivotMenuOpen] = React.useState(false)
  const [pivotBusy, setPivotBusy] = React.useState(false)
  const [pivotError, setPivotError] = React.useState<string | null>(null)
  const [allMetrics, setAllMetrics] = React.useState<Metric[]>([])
  const [offline, setOffline] = React.useState(false)
  const [tableName, setTableName] = React.useState<string>("")
  const [groupBy, setGroupBy] = React.useState<string>("")
  const [metrics, setMetrics] = React.useState<MetricSpec[]>([])
  const [filters, setFilters] = React.useState<FilterSpec[]>([])
  const [result, setResult] = React.useState<AnalyzeResult | null>(null)
  // Detail-table page (table lens, detail mode). Reset to 1 on any query change.
  const [page, setPage] = React.useState(1)
  // Detail-table server-side sort. null = no sort (service default order).
  const [orderBy, setOrderBy] = React.useState<string | null>(null)
  const [orderDir, setOrderDir] = React.useState<"asc" | "desc">("asc")
  // Main-query in-flight flag: dims the table (keeping old rows) while fetching.
  const [loading, setLoading] = React.useState(false)
  // Timeline: a small newest-first slice fetched on demand (not the full set).
  const [timelineRows, setTimelineRows] = React.useState<Record<string, unknown>[]>([])
  // Map: server-side count-per-geo aggregate, {value,count} per location.
  const [geoCounts, setGeoCounts] = React.useState<{ value: string; count: number }[]>([])
  const [lens, setLens] = React.useState<Lens>("table")
  // Chart (cube-metric) lens state.
  const [chartMetricKey, setChartMetricKey] = React.useState<string>("")
  const [chartDimKey, setChartDimKey] = React.useState<string>("")
  const [metricResult, setMetricResult] = React.useState<MetricQueryResult | null>(null)
  // Dashboard (global-overview) lens: one entry per platform metric definition,
  // built from the metric catalog — independent of the selected object type /
  // filters. `total` is null when its query failed (the card shows a failure
  // note); `byDim` is null when the metric has no dimension or its query failed.
  const [dashData, setDashData] = React.useState<
    { metric: Metric; total: MetricQueryResult | null; byDim: MetricQueryResult | null }[] | null
  >(null)
  const [dashLoading, setDashLoading] = React.useState(false)
  // --- Saved analyses (Contour-style recipes). ---
  const [savedList, setSavedList] = React.useState<SavedAnalysisSummary[]>([])
  // Non-null when the workbench was opened from a saved analysis: saving then
  // updates it (PUT) instead of creating a new one.
  const [currentAnalysisId, setCurrentAnalysisId] = React.useState<string | null>(null)
  const [currentAnalysisName, setCurrentAnalysisName] = React.useState<string>("")
  const [savedMenuOpen, setSavedMenuOpen] = React.useState(false)
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState("")
  const [saveBusy, setSaveBusy] = React.useState(false)
  const [justSaved, setJustSaved] = React.useState(false)
  // Set when replaying a saved analysis stops early (link gone / set over limit).
  const [replayError, setReplayError] = React.useState<string | null>(null)

  const table = tables.find((t) => t.name === tableName) ?? null
  const dimensions = table?.columns.filter((c) => c.kind === "dimension" && c.name !== "id") ?? []
  const measures = table?.columns.filter((c) => c.kind === "measure") ?? []

  // --- Analysis-path (pivot / source) derivations. ---
  const pivotActive = pathSteps.length > 0
  // The derived filters attached to every query while a path is active: the last
  // step's contribution (a source step's facet+in filters, or a pivot's `in`).
  const derivedFilters = React.useMemo<FilterSpec[]>(
    () => (pivotActive ? stepDerivedFilters(pathSteps[pathSteps.length - 1]) : []),
    [pivotActive, pathSteps]
  )
  // The source step, when the path begins with a handoff from the object browser.
  const sourceStep = pathSteps[0]?.kind === "source" ? (pathSteps[0] as SourceStep) : null
  // Non-empty user filters, then the derived filters — the filter list every
  // /analyze lens sends. A pivot / source set flows through unchanged.
  const cleanUserFilters = React.useMemo(
    () => filters.filter((f) => String(f.value).toString().trim() !== ""),
    [filters]
  )
  const queryFilters = React.useMemo<FilterSpec[]>(
    () => [...cleanUserFilters, ...derivedFilters],
    [cleanUserFilters, derivedFilters]
  )
  const nodeByApi = React.useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes) m.set(n.api_name, n)
    return m
  }, [nodes])
  const nodeById = React.useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])
  // Traversable links from the current query table, for the "search around" menu.
  const directions = React.useMemo(() => {
    const baseId = nodeByApi.get(tableName)?.id
    return baseId ? pivotDirections(linkTypes, baseId) : []
  }, [linkTypes, nodeByApi, tableName])

  // Capability detection on the current object type's columns / metrics.
  const timeCol =
    table?.columns.find((c) => c.data_type && /^(DATE|TIMESTAMP)/i.test(c.data_type)) ?? null
  const geoCol = table?.columns.find((c) => c.name === "city" || c.name === "region") ?? null
  // Metrics whose base object type is the current object type.
  const chartMetrics = React.useMemo(
    () => allMetrics.filter((m) => m.base_type === tableName),
    [allMetrics, tableName]
  )
  const chartMetric = chartMetrics.find((m) => m.key === chartMetricKey) ?? null

  const lensAvailable = React.useCallback(
    (l: Lens) =>
      // The dashboard is a global overview driven by the metric catalog, so its
      // availability tracks metric definitions only — never the object type.
      // This keeps the fall-back effect below from evicting it on type switches.
      l === "dashboard"
        ? allMetrics.length > 0
        : l === "timeline"
          ? !!timeCol
          : l === "map"
            ? !!geoCol
            : l === "chart"
              ? // Chart is available when the type has cube metrics, or when a
                // pivot is active (it then renders via an /analyze aggregate).
                chartMetrics.length > 0 || pivotActive
              : true,
    [allMetrics, timeCol, geoCol, chartMetrics, pivotActive]
  )

  // Load the catalog + metric definitions. If the object browser handed off an
  // object set (sessionStorage), open it as a "source" step; otherwise select
  // the first table. The handoff is read once and cleared immediately.
  //
  // Guarded so it runs exactly once: consuming the sessionStorage handoff is not
  // idempotent, so React's StrictMode double-invoke would otherwise read it on
  // the first pass and clobber the source step with selectTable on the second.
  const didInit = React.useRef(false)
  React.useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    let handoff: AnalysisHandoff | null = null
    try {
      const raw = window.sessionStorage.getItem(ANALYSIS_HANDOFF_KEY)
      if (raw) {
        window.sessionStorage.removeItem(ANALYSIS_HANDOFF_KEY)
        handoff = JSON.parse(raw) as AnalysisHandoff
      }
    } catch {
      handoff = null
    }
    analysisApi
      .tables()
      .then((ts) => {
        setTables(ts)
        if (handoff) applyHandoff(handoff, ts)
        else if (ts.length > 0) selectTable(ts[0])
      })
      .catch(() => setOffline(true))
    analysisApi
      .metrics()
      .then(setAllMetrics)
      .catch(() => setOffline(true))
    // The saved-analysis catalog; failure (e.g. offline) just leaves it empty.
    analysisApi.listAnalyses().then(setSavedList).catch(() => {})
    // Ontology metadata drives set-level pivots; failure just disables them.
    Promise.all([ontologyApi.graph(), ontologyApi.linkTypes().catch(() => [])])
      .then(([g, lts]) => {
        setNodes(g.nodes)
        setLinkTypes(lts)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectTable(t: AnalysisTable) {
    setTableName(t.name)
    // Selecting a base type from the rail starts a fresh path (drops any pivots)
    // and detaches from any opened saved analysis.
    setPathSteps([])
    setOrigin(null)
    setCurrentAnalysisId(null)
    setCurrentAnalysisName("")
    setReplayError(null)
    setPivotError(null)
    setPivotMenuOpen(false)
    // Default to detail mode: no grouping, no measure — show all rows as-is.
    setGroupBy("")
    setMetrics([])
    setFilters([])
    setResult(null)
    // Clear the detail sort — the column names differ across object types.
    setOrderBy(null)
    setOrderDir("asc")
    // Reset the chart lens selection; it repopulates from the new type's metrics.
    setChartMetricKey("")
    setChartDimKey("")
    setMetricResult(null)
  }

  // Open a handoff from the object browser as the path's "source" step: switch
  // to its table, attach its filters as the (hidden) derived filters, and start
  // the user filters empty. This is a fresh, unsaved analysis.
  function applyHandoff(payload: AnalysisHandoff, ts: AnalysisTable[]) {
    const label = ts.find((t) => t.name === payload.table)?.label ?? payload.table
    setTableName(payload.table)
    setPathSteps([
      {
        kind: "source",
        desc: payload.desc,
        targetTable: payload.table,
        targetLabel: label,
        filters: payload.filters,
        matched: payload.matched,
      },
    ])
    setOrigin(null)
    setCurrentAnalysisId(null)
    setCurrentAnalysisName("")
    setReplayError(null)
    setPivotError(null)
    setPivotMenuOpen(false)
    setGroupBy("")
    setMetrics([])
    setFilters([])
    setResult(null)
    setOrderBy(null)
    setOrderDir("asc")
    setChartMetricKey("")
    setChartDimKey("")
    setMetricResult(null)
  }

  // Fall back to the table lens if switching object types makes the current
  // lens unavailable (e.g. a type without a time/geo property or a metric).
  React.useEffect(() => {
    if (!lensAvailable(lens)) setLens("table")
  }, [lensAvailable, lens])

  // Default the chart metric to the first available one for this type.
  React.useEffect(() => {
    if (chartMetrics.length === 0) {
      setChartMetricKey("")
      return
    }
    if (!chartMetrics.some((m) => m.key === chartMetricKey)) {
      setChartMetricKey(chartMetrics[0].key)
      setChartDimKey("")
    }
  }, [chartMetrics, chartMetricKey])

  // Reset to the first page whenever the query shape changes (object type,
  // filters, group/measures, or lens), so the pager never lands out of range.
  React.useEffect(() => {
    setPage(1)
  }, [tableName, filters, groupBy, metrics, lens])

  // Auto-run the aggregation on any config change (debounced). No metrics =
  // detail mode: the service returns one page of filtered rows (page_size 100).
  React.useEffect(() => {
    if (!tableName) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      analysisApi
        .analyze({
          table: tableName,
          group_by: metrics.length === 0 ? null : groupBy || null,
          metrics,
          filters: queryFilters,
          page,
          page_size: DETAIL_PAGE_SIZE,
          // Sorting only applies to detail mode; the service ignores it when
          // aggregating (aggregate results already come back sorted).
          order_by: metrics.length === 0 ? orderBy : null,
          order_dir: orderDir,
        })
        .then(setResult)
        .catch(() => setOffline(true))
        .finally(() => setLoading(false))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [tableName, groupBy, metrics, queryFilters, page, orderBy, orderDir])

  // Timeline lens: pull only the newest TIMELINE_LIMIT records, ordered by the
  // time property server-side — no full-set download.
  React.useEffect(() => {
    if (lens !== "timeline" || !tableName || !timeCol) {
      setTimelineRows([])
      return
    }
    const timer = window.setTimeout(() => {
      analysisApi
        .analyze({
          table: tableName,
          group_by: null,
          metrics: [],
          filters: queryFilters,
          page: 1,
          page_size: TIMELINE_LIMIT,
          order_by: timeCol.name,
          order_dir: "desc",
        })
        .then((r) => setTimelineRows(r.rows as Record<string, unknown>[]))
        .catch(() => setOffline(true))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [lens, tableName, queryFilters, timeCol])

  // Map lens: server-side count-per-geo aggregate (small payload) instead of
  // counting a full detail set on the client.
  React.useEffect(() => {
    if (lens !== "map" || !tableName || !geoCol) {
      setGeoCounts([])
      return
    }
    const timer = window.setTimeout(() => {
      analysisApi
        .analyze({
          table: tableName,
          group_by: geoCol.name,
          metrics: [{ field: geoCol.name, agg: "count" }],
          filters: queryFilters,
        })
        .then((r) =>
          setGeoCounts(
            r.rows.map((row) => ({
              value: String(row.group ?? ""),
              count: Number(row.m0 ?? 0),
            }))
          )
        )
        .catch(() => setOffline(true))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [lens, tableName, queryFilters, geoCol])

  // Chart lens (cube metrics): query the selected metric (debounced). Skipped
  // while a pivot is active — the cube path can't express the derived `in`
  // filter, so the chart then renders from the /analyze aggregate (`result`).
  React.useEffect(() => {
    if (lens !== "chart" || !chartMetricKey || pivotActive) {
      setMetricResult(null)
      return
    }
    const timer = window.setTimeout(() => {
      analysisApi
        .queryMetric({
          metric: chartMetricKey,
          dimension: chartDimKey || null,
          filters: cleanUserFilters,
        })
        .then(setMetricResult)
        .catch(() => setOffline(true))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [lens, chartMetricKey, chartDimKey, cleanUserFilters, pivotActive])

  // Dashboard lens: fan out one overall query per metric (plus a first-dimension
  // breakdown when the metric has dimensions) and gather them with Promise.all.
  // A single query failing must not sink the whole board — each is caught to null
  // so the affected card / panel degrades on its own. No filters/object-set input:
  // the board is a platform-wide overview.
  const loadDashboard = React.useCallback(() => {
    if (allMetrics.length === 0) return
    const snapshot = allMetrics
    setDashLoading(true)
    Promise.all(
      snapshot.map(async (m) => {
        const total = await analysisApi.queryMetric({ metric: m.key }).catch(() => null)
        let byDim: MetricQueryResult | null = null
        if (m.dimensions.length > 0) {
          byDim = await analysisApi
            .queryMetric({ metric: m.key, dimension: m.dimensions[0].key, limit: 8 })
            .catch(() => null)
        }
        return { metric: m, total, byDim }
      })
    )
      .then(setDashData)
      .finally(() => setDashLoading(false))
  }, [allMetrics])

  // Invalidate any cached board whenever the metric catalog changes, so the board
  // auto-rebuilds for a new scenario / added metric on next entry.
  React.useEffect(() => {
    setDashData(null)
  }, [allMetrics])

  // Build the board on entering the dashboard lens with no cached data. The
  // refresh button forces a rebuild by calling loadDashboard directly.
  React.useEffect(() => {
    if (lens !== "dashboard" || dashData !== null) return
    loadDashboard()
  }, [lens, dashData, loadDashboard])

  // Reset user config when the query table changes via a pivot / backtrack (the
  // path itself is managed by the caller). Mirrors selectTable minus the path reset.
  function resetUserConfig() {
    setGroupBy("")
    setMetrics([])
    setFilters([])
    setResult(null)
    setOrderBy(null)
    setOrderDir("asc")
    setChartMetricKey("")
    setChartDimKey("")
    setMetricResult(null)
  }

  // Run a set-level "search around": collect the current set's join keys and pivot
  // the whole set (user filters + any active derived filter) to the peer type.
  async function runPivot(dir: PivotDirection) {
    const target = nodeById.get(dir.targetTypeId)
    if (!target || pivotBusy) return
    setPivotBusy(true)
    setPivotError(null)
    try {
      const { keys, overLimit } = await collectPivotKeys(tableName, dir.sourceKeyColumn, queryFilters)
      if (overLimit) {
        setPivotError(`对象集过大（${keys.length}+ 个键），请先筛选后再跳转`)
        return
      }
      if (keys.length === 0) {
        setPivotError("当前对象集为空或无有效关联键")
        return
      }
      const inFilter = pivotInFilter(dir.targetColumn, keys)
      // Peer-set count for the breadcrumb (cheap detail probe, page_size 1).
      const matched = await analysisApi
        .analyze({
          table: target.api_name,
          group_by: null,
          metrics: [],
          filters: [inFilter],
          page: 1,
          page_size: 1,
        })
        .then((r) => r.matched_rows)
        .catch(() => 0)
      // Capture the origin on the first pivot (before the table switches), but
      // not when the path already starts from a source step — that step is the
      // origin, so a separate origin would double the breadcrumb.
      setOrigin((o) => {
        if (o) return o
        if (pathSteps[0]?.kind === "source") return null
        return { table: tableName, label: table?.label ?? tableName, count: table?.row_count ?? 0 }
      })
      setPathSteps((s) => [
        ...s,
        {
          kind: "pivot",
          linkId: dir.link.id,
          reverse: dir.reverse,
          linkLabel: dir.link.display_name,
          targetTable: target.api_name,
          targetLabel: target.display_name,
          // The user filters active at pivot time are the replay recipe.
          stepFilters: cleanUserFilters,
          inFilter,
          matched,
        },
      ])
      setTableName(target.api_name)
      resetUserConfig()
      setPivotMenuOpen(false)
    } catch {
      setPivotError("跳转失败：分析服务未启动或查询出错")
    } finally {
      setPivotBusy(false)
    }
  }

  // Breadcrumb backtrack: to the origin (drop all pivots) or to a given step
  // (drop later pivots). User config is reset to that step's state.
  // "起始" backtrack: drop the whole path and return to plain mode on the base
  // table — the source step's table (handoff origin) or the captured origin.
  function goToOrigin() {
    const base = sourceStep ? sourceStep.targetTable : origin?.table
    if (!base) return
    setTableName(base)
    setPathSteps([])
    setOrigin(null)
    setPivotError(null)
    resetUserConfig()
  }
  function goToStep(i: number) {
    const step = pathSteps[i]
    if (!step) return
    setPathSteps((s) => s.slice(0, i + 1))
    setTableName(step.targetTable)
    setPivotError(null)
    resetUserConfig()
  }

  // --- Saved analyses: build / save / open (replay). ---

  // The path's base table + label + count (for the "起始" breadcrumb and the
  // saved recipe). The source step's table when the path is a handoff, else the
  // captured pivot origin, else the plain active table.
  const startTable = sourceStep ? sourceStep.targetTable : origin?.table ?? tableName
  const startLabel = sourceStep
    ? tables.find((t) => t.name === sourceStep.targetTable)?.label ?? sourceStep.targetTable
    : pivotActive
      ? origin?.label ?? ""
      : table?.label ?? tableName
  const startCount = sourceStep
    ? tables.find((t) => t.name === sourceStep.targetTable)?.row_count ?? 0
    : pivotActive
      ? origin?.count ?? 0
      : table?.row_count ?? 0

  // Serialize the current workbench state to a replayable recipe. Pivot steps
  // persist their link + direction + step filters (not the compiled key list);
  // source steps persist their (replayable) filters + description.
  function buildDefinition(): AnalysisDefinition {
    const path: SavedPathStep[] = pathSteps.map((s) =>
      s.kind === "source"
        ? { kind: "source", desc: s.desc, table: s.targetTable, filters: s.filters }
        : {
            kind: "pivot",
            linkId: s.linkId,
            reverse: s.reverse,
            linkLabel: s.linkLabel,
            stepFilters: s.stepFilters,
          }
    )
    return { table: startTable, lens, groupBy, metrics, filters: cleanUserFilters, path }
  }

  // Cheap match-count probe for a table under some filters (page_size 1).
  const probeCount = React.useCallback(
    (t: string, f: FilterSpec[]) =>
      analysisApi
        .analyze({ table: t, group_by: null, metrics: [], filters: f, page: 1, page_size: 1 })
        .then((r) => r.matched_rows)
        .catch(() => 0),
    []
  )

  // Replay a saved recipe: restore table/lens/config, then recompile the path
  // step by step against current data. A source step attaches its filters
  // directly; each pivot re-collects keys (its step filters + upstream derived)
  // into a fresh `in` filter with a current match count. On the first failure
  // (link gone / set over limit / empty / service error) replay stops at the
  // previous step and surfaces a notice — the page never crashes.
  async function applyDefinition(d: SavedAnalysisDetail) {
    const def = d.definition
    setReplayError(null)
    let activeTable = def.table
    let derived: FilterSpec[] = []
    const rebuilt: PathStep[] = []
    let originCap: { table: string; label: string; count: number } | null = null
    let stopped = false
    const steps = def.path ?? []
    for (let idx = 0; idx < steps.length; idx++) {
      const st = steps[idx]
      if (st.kind === "source") {
        activeTable = st.table
        derived = st.filters
        const label = tables.find((t) => t.name === st.table)?.label ?? st.table
        const matched = await probeCount(st.table, st.filters)
        rebuilt.push({
          kind: "source",
          desc: st.desc,
          targetTable: st.table,
          targetLabel: label,
          filters: st.filters,
          matched,
        })
        continue
      }
      // Pivot step: resolve the direction from the recorded link id + direction.
      const baseId = nodeByApi.get(activeTable)?.id
      const dir = baseId
        ? pivotDirections(linkTypes, baseId).find(
            (x) => x.link.id === st.linkId && x.reverse === st.reverse
          )
        : undefined
      const target = dir ? nodeById.get(dir.targetTypeId) : undefined
      if (!dir || !target) {
        setReplayError("某个关系已不存在，分析在上一步停止")
        stopped = true
        break
      }
      let collected
      try {
        collected = await collectPivotKeys(activeTable, dir.sourceKeyColumn, [
          ...st.stepFilters,
          ...derived,
        ])
      } catch {
        setReplayError("重放某一步时分析服务出错，已停在上一步")
        stopped = true
        break
      }
      if (collected.overLimit) {
        setReplayError(`某一步对象集过大（${collected.keys.length}+ 个键），分析在上一步停止`)
        stopped = true
        break
      }
      if (collected.keys.length === 0) {
        setReplayError("某一步对象集为空或无有效关联键，分析在上一步停止")
        stopped = true
        break
      }
      const inFilter = pivotInFilter(dir.targetColumn, collected.keys)
      const matched = await probeCount(target.api_name, [inFilter])
      // Capture the origin only when the path starts with a pivot.
      if (idx === 0) {
        originCap = {
          table: activeTable,
          label: tables.find((t) => t.name === activeTable)?.label ?? activeTable,
          count: tables.find((t) => t.name === activeTable)?.row_count ?? 0,
        }
      }
      activeTable = target.api_name
      derived = [inFilter]
      rebuilt.push({
        kind: "pivot",
        linkId: st.linkId,
        reverse: st.reverse,
        linkLabel: dir.link.display_name,
        targetTable: target.api_name,
        targetLabel: target.display_name,
        stepFilters: st.stepFilters,
        inFilter,
        matched,
      })
    }
    setPathSteps(rebuilt)
    setOrigin(originCap)
    setTableName(activeTable)
    setGroupBy(def.groupBy || "")
    setMetrics(def.metrics ?? [])
    // Restore user filters only if the whole path replayed — a partial replay
    // may leave us on an intermediate table whose columns differ.
    setFilters(stopped ? [] : def.filters ?? [])
    setLens((def.lens as Lens) || "table")
    setPage(1)
    setResult(null)
    setOrderBy(null)
    setOrderDir("asc")
    setChartMetricKey("")
    setChartDimKey("")
    setMetricResult(null)
  }

  async function openAnalysis(id: string) {
    setSavedMenuOpen(false)
    try {
      const d = await analysisApi.getAnalysis(id)
      await applyDefinition(d)
      setCurrentAnalysisId(d.id)
      setCurrentAnalysisName(d.name)
    } catch {
      setReplayError("打开分析失败：分析服务未启动或数据出错")
    }
  }

  async function doSave() {
    const name = saveName.trim()
    if (!name || saveBusy) return
    setSaveBusy(true)
    try {
      const definition = buildDefinition()
      const saved = currentAnalysisId
        ? await analysisApi.updateAnalysis(currentAnalysisId, { name, definition })
        : await analysisApi.createAnalysis({ name, definition })
      setCurrentAnalysisId(saved.id)
      setCurrentAnalysisName(saved.name)
      const list = await analysisApi.listAnalyses().catch(() => null)
      if (list) setSavedList(list)
      setSaveOpen(false)
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 1600)
    } catch {
      setReplayError("保存失败：请确认已登录，且分析服务可用")
    } finally {
      setSaveBusy(false)
    }
  }

  async function deleteSaved(id: string) {
    try {
      await analysisApi.deleteAnalysis(id)
      setSavedList((l) => l.filter((x) => x.id !== id))
      if (currentAnalysisId === id) {
        setCurrentAnalysisId(null)
        setCurrentAnalysisName("")
      }
    } catch {
      setReplayError("删除失败：仅创建者或管理员可删除")
    }
  }

  // Drill from the map into the detail table filtered to one geo value.
  function drillGeo(value: string) {
    if (!geoCol) return
    setFilters([{ field: geoCol.name, op: "eq", value }])
    setLens("table")
  }

  // Cycle a detail column's sort on header click: none → asc → desc → none.
  // Any sort change resets to the first page so the pager never lands out of range.
  function toggleSort(colName: string) {
    setPage(1)
    if (orderBy !== colName) {
      setOrderBy(colName)
      setOrderDir("asc")
    } else if (orderDir === "asc") {
      setOrderDir("desc")
    } else {
      setOrderBy(null)
      setOrderDir("asc")
    }
  }

  function addFilter() {
    if (!table) return
    // First dimension-ish column after the primary key, falling back to col 0.
    const col = table.columns[1] ?? table.columns[0]
    setFilters((f) => [...f, { field: col.name, op: "eq", value: "" }])
  }

  // Breadcrumb helpers: a short summary of the current user filters.
  const opSymbol = (op: FilterOp) => OP_OPTIONS.find((o) => o.value === op)?.label ?? op
  const filterSummary = cleanUserFilters
    .map((f) => `${fieldLabel(f.field)}${opSymbol(f.op)}${Array.isArray(f.value) ? f.value.join("/") : f.value}`)
    .join("，")
  // Show the analysis-path breadcrumb on every set-scoped lens (not the global board).
  const showPath = !!table && lens !== "dashboard"

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="分析工作台"
        desc="围绕对象集的指标、图表、时间轴与地理分析"
        icon={<RadarIcon />}
        actions={
          <div className="flex items-center gap-2">
            {currentAnalysisName && (
              <span
                className="hidden max-w-[180px] truncate text-sm font-medium text-foreground md:inline"
                title={currentAnalysisName}
              >
                {currentAnalysisName}
              </span>
            )}

            {/* "我的分析" — open a saved analysis (two-click delete per item). */}
            <div className="relative">
              <button
                onClick={() => setSavedMenuOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-emerald-500/40 hover:text-foreground"
              >
                <FolderOpenIcon className="size-4" /> 我的分析
                <ChevronDownIcon className="size-3.5" />
              </button>
              {savedMenuOpen && (
                <>
                  <button
                    className="fixed inset-0 z-10 cursor-default"
                    aria-hidden
                    onClick={() => setSavedMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                    <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                      已保存的分析
                    </div>
                    {savedList.length === 0 ? (
                      <div className="px-3 py-5 text-center text-sm text-muted-foreground">
                        {offline ? "分析服务未启动" : "暂无保存的分析"}
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-auto py-1">
                        {savedList.map((s) => (
                          <SavedAnalysisRow
                            key={s.id}
                            item={s}
                            active={s.id === currentAnalysisId}
                            onOpen={() => openAnalysis(s.id)}
                            onDelete={() => deleteSaved(s.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* "保存" — update the opened analysis (PUT) or create a new one (POST). */}
            <div className="relative">
              <button
                onClick={() => {
                  setSaveName(currentAnalysisName || "")
                  setSaveOpen((o) => !o)
                }}
                disabled={!table}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  justSaved
                    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                    : "border-border hover:border-emerald-500/40 hover:text-foreground"
                }`}
              >
                {justSaved ? (
                  <>
                    <CheckIcon className="size-4" /> 已保存
                  </>
                ) : (
                  <>
                    <SaveIcon className="size-4" /> 保存
                  </>
                )}
              </button>
              {saveOpen && (
                <>
                  <button
                    className="fixed inset-0 z-10 cursor-default"
                    aria-hidden
                    onClick={() => setSaveOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
                    <div className="mb-2 text-xs text-muted-foreground">
                      {currentAnalysisId ? "更新当前分析（可改名）" : "保存为新分析"}
                    </div>
                    <Input
                      autoFocus
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") doSave()
                      }}
                      placeholder="分析名称"
                      className="h-8"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => setSaveOpen(false)}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        取消
                      </button>
                      <button
                        onClick={doSave}
                        disabled={!saveName.trim() || saveBusy}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {saveBusy && <Loader2Icon className="size-3 animate-spin" />}
                        {currentAnalysisId ? "更新" : "保存"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {offline ? (
              <Badge variant="warning">
                <WifiOffIcon /> 分析服务未启动
              </Badge>
            ) : (
              <Badge variant="brand">数据分析</Badge>
            )}
          </div>
        }
      />

      {/* Replay / save notice — non-fatal, dismissible. */}
      {replayError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span className="min-w-0 flex-1">{replayError}</span>
          <button
            onClick={() => setReplayError(null)}
            className="shrink-0 rounded p-0.5 hover:text-amber-900 dark:hover:text-amber-100"
            aria-label="关闭提示"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      {/* Analysis path breadcrumb: the traceable trail from the origin object set
          through any pivots to the current lens. Segments are clickable to
          backtrack (dropping later pivots). */}
      {showPath && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs">
          <RouteIcon className="size-3.5 shrink-0 text-emerald-500" />
          <span className="shrink-0 text-muted-foreground">分析路径</span>
          <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
          <button
            onClick={goToOrigin}
            disabled={!pivotActive}
            className={`shrink-0 rounded px-1 py-0.5 ${
              pivotActive
                ? "text-muted-foreground hover:text-foreground"
                : "font-medium text-foreground"
            }`}
          >
            起始：{startLabel}({startCount.toLocaleString()})
          </button>
          {!pivotActive && cleanUserFilters.length > 0 && (
            <>
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="text-emerald-600 dark:text-emerald-400">
                筛选：{filterSummary}({(result?.matched_rows ?? 0).toLocaleString()})
              </span>
            </>
          )}
          {pathSteps.map((s, i) => (
            <React.Fragment key={`${s.targetTable}:${i}`}>
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              <button
                onClick={() => goToStep(i)}
                className={`rounded px-1 py-0.5 ${
                  i === pathSteps.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.kind === "source"
                  ? `来自对象浏览器：${s.desc}（${s.matched.toLocaleString()} 条）`
                  : `沿『${s.linkLabel}』→ ${s.targetLabel}(${s.matched.toLocaleString()})`}
              </button>
            </React.Fragment>
          ))}
          {pivotActive && cleanUserFilters.length > 0 && (
            <>
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="text-emerald-600 dark:text-emerald-400">筛选：{filterSummary}</span>
            </>
          )}
          <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-medium text-foreground">{LENS_STEP_LABEL[lens]}</span>
        </div>
      )}

      {/* Contour/Quiver-style split: a control rail on the left, the data canvas
          on the right. Narrow screens collapse the grid to a single column so the
          two regions stack vertically. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* ---- Left rail: every control lives here, scrolls independently. ---- */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          {/* Object type picker — a vertical list matching the object browser rail. */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">对象类型</div>
            {tables.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {offline ? "分析服务未启动" : "加载中…"}
              </div>
            ) : (
              <div className="space-y-0.5">
                {tables.map((t) => {
                  const active = t.name === tableName
                  return (
                    <button
                      key={t.name}
                      onClick={() => selectTable(t)}
                      title={t.desc}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.row_count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Filter bar — vertically stacked so the narrow rail never scrolls sideways. */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FilterIcon className="size-3" /> 过滤条件
              <button
                onClick={addFilter}
                disabled={!table}
                className="ml-auto inline-flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-xs hover:border-emerald-500/40 hover:text-foreground disabled:opacity-50"
              >
                <PlusIcon className="size-3" /> 添加过滤
              </button>
            </div>
            {filters.length === 0 ? (
              <span className="text-xs text-muted-foreground">未设置过滤条件 · 使用全部数据</span>
            ) : (
              <div className="space-y-2">
                {filters.map((f, i) => (
                  <div
                    key={i}
                    className="space-y-1.5 rounded-md border border-border/60 bg-background/40 p-2"
                  >
                    <select
                      className={SELECT_CLASS}
                      value={f.field}
                      onChange={(e) =>
                        setFilters((all) => all.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))
                      }
                    >
                      {table?.columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <select
                        className={`${SELECT_BASE} w-16 shrink-0`}
                        value={f.op}
                        onChange={(e) =>
                          setFilters((all) =>
                            all.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterOp } : x))
                          )
                        }
                      >
                        {OP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="h-8 min-w-0 flex-1"
                        // User-entered filters are always scalar; arrays only ever
                        // arrive as the (hidden) pivot-derived `in` filter.
                        value={typeof f.value === "string" ? f.value : f.value.join(",")}
                        placeholder="值"
                        onChange={(e) =>
                          setFilters((all) => all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                        }
                      />
                      <button
                        onClick={() => setFilters((all) => all.filter((_, j) => j !== i))}
                        className="shrink-0 text-muted-foreground hover:text-red-500"
                        aria-label="删除过滤"
                      >
                        <XIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search Around: pivot the whole current object set to a related type. */}
            {directions.length > 0 && (
              <div className="relative mt-3 border-t border-border/60 pt-3">
                <button
                  onClick={() => setPivotMenuOpen((o) => !o)}
                  disabled={pivotBusy || !table}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-sm transition-colors hover:border-emerald-500/40 hover:text-foreground disabled:opacity-50"
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
                    <button
                      className="fixed inset-0 z-10 cursor-default"
                      aria-hidden
                      onClick={() => setPivotMenuOpen(false)}
                    />
                    <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                      <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                        将当前对象集跳转到
                      </div>
                      <div className="max-h-64 overflow-auto py-1">
                        {directions.map((d) => {
                          const target = nodeById.get(d.targetTypeId)
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
                {pivotError && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{pivotError}</div>
                )}
              </div>
            )}
          </div>

          {/* Lens-specific controls (table group-by/measures, chart metric/dimension).
              Timeline/map need no extra controls, so this section is simply absent.
              Under a pivot the chart lens routes through /analyze, so it reuses the
              table group-by/measure controls instead of the cube metric pickers. */}
          {(lens === "table" || (lens === "chart" && pivotActive)) && (
            <TableControls
              dimensions={dimensions}
              measures={measures}
              groupBy={groupBy}
              setGroupBy={setGroupBy}
              metrics={metrics}
              setMetrics={setMetrics}
            />
          )}
          {lens === "chart" && !pivotActive && chartMetrics.length > 0 && (
            <ChartControls
              chartMetrics={chartMetrics}
              chartMetric={chartMetric}
              chartMetricKey={chartMetricKey}
              setChartMetricKey={(k) => {
                setChartMetricKey(k)
                setChartDimKey("")
              }}
              chartDimKey={chartDimKey}
              setChartDimKey={setChartDimKey}
            />
          )}
        </div>

        {/* ---- Right canvas: lens switcher + compact stats + the data view. ---- */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* Thin top bar: lens switcher on the left, context hint on the right. */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {LENSES.map((l) => {
                const disabled = !lensAvailable(l.key)
                const disabledTitle =
                  l.key === "dashboard"
                    ? "暂无指标定义"
                    : l.key === "timeline"
                      ? "当前对象类型无时间属性"
                      : l.key === "map"
                        ? "当前对象类型无地理属性"
                        : l.key === "chart"
                          ? "当前对象类型无可用指标"
                          : undefined
                return (
                  <button
                    key={l.key}
                    onClick={() => !disabled && setLens(l.key)}
                    disabled={disabled}
                    title={disabled ? disabledTitle : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      disabled ? "cursor-not-allowed opacity-50" : ""
                    } ${
                      lens === l.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <l.icon className="size-4" /> {l.label}
                  </button>
                )
              })}
            </div>
            <div className="ml-auto truncate text-xs text-muted-foreground">
              {lens === "dashboard"
                ? `全局概览 · ${allMetrics.length} 个指标`
                : table
                  ? `分析上下文：${table.label} · 命中 ${(result?.matched_rows ?? 0).toLocaleString()} 行`
                  : ""}
            </div>
          </div>

          {/* Compact stat strip — the former big stat cards, squeezed to one line. */}
          {lens === "table" && <TableStatStrip result={result} />}
          {/* Under a pivot the chart reads the /analyze aggregate, so it reuses the
              table stat strip; otherwise it shows the cube-metric strip. */}
          {lens === "chart" && pivotActive && <TableStatStrip result={result} />}
          {lens === "chart" && !pivotActive && chartMetrics.length > 0 && (
            <ChartStatStrip metricResult={metricResult} />
          )}

          {/* Data area — takes all remaining height in the right column. */}
          {lens === "dashboard" && (
            <DashboardCanvas
              data={dashData}
              loading={dashLoading}
              metricCount={allMetrics.length}
              offline={offline}
              onRefresh={loadDashboard}
            />
          )}

          {lens === "table" && (
            <div className="relative flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
              {/* Lightweight in-flight hint: a thin top bar plus a corner spinner.
                  Old rows stay visible (dimmed) so the table never flashes empty. */}
              {loading && (
                <>
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse rounded-t-xl bg-emerald-500/70" />
                  <Loader2Icon className="pointer-events-none absolute top-2 right-2 z-10 size-4 animate-spin text-emerald-500" />
                </>
              )}
              <div
                className={`min-h-0 flex-1 overflow-auto transition-opacity ${loading ? "opacity-60" : ""}`}
              >
                {!result ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {offline ? "分析服务未启动" : "选择对象类型开始分析"}
                  </div>
                ) : (
                  <ResultTable
                    result={result}
                    table={table}
                    orderBy={orderBy}
                    orderDir={orderDir}
                    onSort={toggleSort}
                  />
                )}
              </div>
              {/* Detail-mode pager: server-side pages of DETAIL_PAGE_SIZE rows. */}
              {result?.mode === "detail" && result.matched_rows > 0 && (
                <Pagination
                  page={page}
                  pageSize={DETAIL_PAGE_SIZE}
                  total={result.matched_rows}
                  pages={Math.max(1, Math.ceil(result.matched_rows / DETAIL_PAGE_SIZE))}
                  onPageChange={setPage}
                  className="shrink-0 border-t border-border"
                />
              )}
            </div>
          )}

          {lens === "chart" &&
            (pivotActive ? (
              <PivotChartCanvas result={result} offline={offline} />
            ) : (
              <ChartCanvas chartMetrics={chartMetrics} metricResult={metricResult} offline={offline} />
            ))}

          {lens === "timeline" && (
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
              {timeCol ? (
                <TimelineView rows={timelineRows} columns={table?.columns ?? []} timeCol={timeCol} />
              ) : null}
            </div>
          )}

          {lens === "map" && (
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
              {geoCol ? <MapView counts={geoCounts} geoCol={geoCol} onDrill={drillGeo} /> : null}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

// --- Left-rail control: table lens group-by + measures. ---

function TableControls({
  dimensions,
  measures,
  groupBy,
  setGroupBy,
  metrics,
  setMetrics,
}: {
  dimensions: AnalysisColumn[]
  measures: AnalysisColumn[]
  groupBy: string
  setGroupBy: (v: string) => void
  metrics: MetricSpec[]
  setMetrics: React.Dispatch<React.SetStateAction<MetricSpec[]>>
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">分组维度</div>
      <select
        className={`${SELECT_CLASS} mb-3 disabled:opacity-50`}
        value={groupBy}
        disabled={metrics.length === 0}
        onChange={(e) => setGroupBy(e.target.value)}
      >
        <option value="">不分组（整体汇总）</option>
        {dimensions.map((d) => (
          <option key={d.name} value={d.name}>
            {d.label}
          </option>
        ))}
      </select>

      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span>度量</span>
        {measures.length > 0 && metrics.length < 3 && (
          <button
            onClick={() => setMetrics((m) => [...m, { field: measures[0].name, agg: "sum" }])}
            className="ml-auto inline-flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-xs hover:border-emerald-500/40 hover:text-foreground"
          >
            <PlusIcon className="size-3" /> 添加度量
          </button>
        )}
      </div>
      {metrics.length === 0 ? (
        <span className="text-xs text-muted-foreground">无 · 明细模式（显示全部行）</span>
      ) : (
        <div className="space-y-2">
          {metrics.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md border border-border/60 p-2">
              <select
                className={`${SELECT_BASE} min-w-0 flex-1`}
                value={m.field}
                onChange={(e) =>
                  setMetrics((all) => all.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))
                }
              >
                {measures.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                className={`${SELECT_BASE} w-16 shrink-0`}
                value={m.agg}
                onChange={(e) =>
                  setMetrics((all) =>
                    all.map((x, j) => (j === i ? { ...x, agg: e.target.value as MetricAgg } : x))
                  )
                }
              >
                {AGG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setMetrics((all) => all.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-red-500"
                aria-label="删除度量"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Left-rail control: chart lens metric + dimension pickers. ---

function ChartControls({
  chartMetrics,
  chartMetric,
  chartMetricKey,
  setChartMetricKey,
  chartDimKey,
  setChartDimKey,
}: {
  chartMetrics: Metric[]
  chartMetric: Metric | null
  chartMetricKey: string
  setChartMetricKey: (k: string) => void
  chartDimKey: string
  setChartDimKey: (k: string) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">指标</div>
      <select
        className={`${SELECT_CLASS} mb-3`}
        value={chartMetricKey}
        onChange={(e) => setChartMetricKey(e.target.value)}
      >
        {chartMetrics.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="mb-2 text-xs font-medium text-muted-foreground">维度</div>
      <select
        className={SELECT_CLASS}
        value={chartDimKey}
        onChange={(e) => setChartDimKey(e.target.value)}
      >
        <option value="">整体</option>
        {chartMetric?.dimensions.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>

      {chartMetric?.description && (
        <div className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {chartMetric.description}
        </div>
      )}
    </div>
  )
}

// --- Compact stat strip shared shape: small label + slightly larger number. ---

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  )
}

// Table lens stats: aggregate totals (aggregate mode) + the matched/detail count.
function TableStatStrip({ result }: { result: AnalyzeResult | null }) {
  if (!result) return null
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-border bg-card px-4 py-2">
      {result.mode === "aggregate" &&
        result.columns.slice(1).map((label, i) => (
          <Stat key={label} label={label} value={formatValue(result.totals[i])} />
        ))}
      <Stat
        label={result.mode === "detail" ? "明细记录" : "命中记录"}
        value={formatValue(result.matched_rows)}
      />
    </div>
  )
}

// Chart lens stats: the metric's overall value + the matched record count.
function ChartStatStrip({ metricResult }: { metricResult: MetricQueryResult | null }) {
  if (!metricResult) return null
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-border bg-card px-4 py-2">
      <Stat
        label={`${metricResult.metric_label} · 整体`}
        value={formatMetricValue(metricResult.total, metricResult.agg, metricResult.unit)}
      />
      <Stat label="命中记录" value={formatValue(metricResult.matched_rows)} />
    </div>
  )
}

// --- Dashboard lens canvas: a platform-wide overview generated from the metric
// catalog — stat cards for every metric plus a bar-chart panel per dimensioned
// metric. No hardcoded scenario content: it re-derives from `data` entirely. ---

function DashboardCanvas({
  data,
  loading,
  metricCount,
  offline,
  onRefresh,
}: {
  data: { metric: Metric; total: MetricQueryResult | null; byDim: MetricQueryResult | null }[] | null
  loading: boolean
  metricCount: number
  offline: boolean
  onRefresh: () => void
}) {
  // First load (no cached board yet): a centered spinner, or an offline / empty
  // notice when there is nothing to build from.
  if (!data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
        {offline ? (
          "分析服务未启动"
        ) : metricCount === 0 ? (
          "暂无指标定义"
        ) : (
          <Loader2Icon className="size-5 animate-spin text-emerald-500" />
        )}
      </div>
    )
  }

  // Only dimensioned metrics get a breakdown panel.
  const withDim = data.filter((d) => d.metric.dimensions.length > 0)

  return (
    <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card p-4">
      {/* Global-overview note + manual refresh (no auto-polling). */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">看板为全局概览，不受对象集与过滤影响</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-emerald-500/40 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCwIcon className={`size-3 ${loading ? "animate-spin" : ""}`} /> 刷新
        </button>
      </div>

      {/* Dim the body while refreshing over cached content (never flash empty). */}
      <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
        {/* Stat cards: one per metric, showing its overall value. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {data.map((d) => (
            <div
              key={d.metric.key}
              className="rounded-lg border border-border bg-background/40 p-3"
            >
              <div className="truncate text-xs text-muted-foreground" title={d.metric.label}>
                {d.metric.label}
              </div>
              {d.total ? (
                <>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatMetricValue(d.total.total, d.total.agg, d.total.unit)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    基于 {d.total.matched_rows.toLocaleString()} 个对象
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">加载失败</div>
              )}
            </div>
          ))}
        </div>

        {/* Chart grid: a horizontal bar panel per dimensioned metric. */}
        {withDim.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {withDim.map((d) => (
              <DashboardChartPanel key={d.metric.key} metric={d.metric} byDim={d.byDim} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// A single dashboard breakdown panel: metric label + "按{dimension}" title with a
// reused horizontal-bar rendering (name left, bar centre, value right).
function DashboardChartPanel({
  metric,
  byDim,
}: {
  metric: Metric
  byDim: MetricQueryResult | null
}) {
  const rows = byDim?.rows ?? []
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  // Fall back to the metric's own label/agg/unit when the breakdown query failed.
  const dimLabel = byDim?.dimension_label ?? metric.dimensions[0]?.label ?? ""
  const agg = byDim?.agg ?? metric.agg
  const unit = byDim?.unit ?? metric.unit

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-2 truncate text-xs text-muted-foreground">
        {metric.label} · 按{dimLabel}
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">暂无数据</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const pct = max > 0 ? Math.max((r.value / max) * 100, 1) : 0
            return (
              <div key={r.group} className="group flex items-center gap-3">
                <div
                  className="w-24 shrink-0 truncate text-right text-sm text-muted-foreground"
                  title={r.group}
                >
                  {r.group}
                </div>
                <div className="relative h-5 min-w-0 flex-1 rounded-md bg-muted/40">
                  <div
                    className="h-full rounded-md bg-emerald-500/80 transition-colors group-hover:bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                  {formatMetricValue(r.value, agg, unit)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Chart lens canvas: named cube metrics rendered as a horizontal bar chart. ---

function ChartCanvas({
  chartMetrics,
  metricResult,
  offline,
}: {
  chartMetrics: Metric[]
  metricResult: MetricQueryResult | null
  offline: boolean
}) {
  if (chartMetrics.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
        {offline ? "分析服务未启动" : "当前对象类型暂无可用指标"}
      </div>
    )
  }

  const max = metricResult?.rows.reduce((m, r) => Math.max(m, r.value), 0) ?? 0

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card p-4">
      {!metricResult ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {offline ? "分析服务未启动" : "选择指标与维度查看图表"}
        </div>
      ) : metricResult.rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          当前指标无数据
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="mb-2 text-xs text-muted-foreground">
            {metricResult.metric_label}
            {metricResult.dimension_label ? ` · 按${metricResult.dimension_label}` : " · 整体"}
          </div>
          {metricResult.rows.map((r) => {
            const pct = max > 0 ? Math.max((r.value / max) * 100, 1) : 0
            return (
              <div key={r.group} className="group flex items-center gap-3">
                <div className="w-32 shrink-0 truncate text-right text-sm text-muted-foreground" title={r.group}>
                  {r.group}
                </div>
                <div className="relative h-6 min-w-0 flex-1 rounded-md bg-muted/40">
                  <div
                    className="h-full rounded-md bg-emerald-500/80 transition-colors group-hover:bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">
                  {formatMetricValue(r.value, metricResult.agg, metricResult.unit)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Chart canvas under an active pivot: the cube-metric path can't carry the
// derived `in` filter, so the chart is rendered from the /analyze aggregate
// result. Requires an aggregate configuration (a measure, optionally grouped);
// otherwise it prompts the user to pick a group-by + measure.
function PivotChartCanvas({
  result,
  offline,
}: {
  result: AnalyzeResult | null
  offline: boolean
}) {
  if (!result || result.mode !== "aggregate") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
        {offline ? "分析服务未启动" : "在左侧选择分组维度与度量以查看图表"}
      </div>
    )
  }
  const rows = result.rows.map((r) => ({ group: String(r.group ?? ""), value: Number(r.m0 ?? 0) }))
  // columns[0] = group label, columns[1] = first metric label.
  const title =
    result.columns.length > 1 ? `${result.columns[1]} · 按${result.columns[0]}` : result.columns[0]
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card p-4">
      {rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          当前配置无数据
        </div>
      ) : (
        <MetricBarChart title={title} unit="" agg="" rows={rows} />
      )}
    </div>
  )
}

function ResultTable({
  result,
  table,
  orderBy,
  orderDir,
  onSort,
}: {
  result: AnalyzeResult
  table: AnalysisTable | null
  orderBy: string | null
  orderDir: "asc" | "desc"
  onSort: (colName: string) => void
}) {
  // Detail mode: one server-side page of filtered rows, one column per property.
  // Pagination lives outside this component (in the table-lens container).
  if (result.mode === "detail") {
    const cols = table?.columns ?? []
    if (result.rows.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          无匹配数据
        </div>
      )
    }
    return (
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
          <tr className="border-b border-border">
            {cols.map((c) => {
              const numeric = isNumericColumn(c)
              const active = orderBy === c.name
              // Column-click sort indicator: neutral when inactive, up/down when active.
              const SortIcon = !active
                ? ChevronsUpDownIcon
                : orderDir === "asc"
                  ? ChevronUpIcon
                  : ChevronDownIcon
              return (
                <th
                  key={c.name}
                  className={`px-4 py-2 font-medium ${numeric ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.name)}
                    // Reverse the flex on numeric columns so the icon sits to the
                    // left of the right-aligned header label.
                    className={`inline-flex items-center gap-1 hover:text-foreground ${
                      numeric ? "flex-row-reverse" : ""
                    } ${active ? "text-foreground" : ""}`}
                  >
                    <span>{c.label}</span>
                    <SortIcon className={`size-3 ${active ? "" : "opacity-40"}`} />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/60 odd:bg-muted/20 hover:bg-muted/50">
              {cols.map((c, ci) => {
                const raw = (r[c.name] ?? "") as number | string
                const numeric = isNumericColumn(c)
                return (
                  <td
                    key={c.name}
                    className={`px-4 py-2 ${numeric ? "text-right tabular-nums" : ""} ${
                      ci === 0 ? "font-mono text-emerald-500" : ""
                    }`}
                  >
                    <span className="inline-block max-w-[240px] truncate align-middle" title={String(raw)}>
                      {formatValue(raw)}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="border-b border-border">
          {result.columns.map((c, i) => (
            <th key={c} className={`px-4 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r) => (
          <tr
            key={r.group as string}
            className="border-b border-border/60 odd:bg-muted/20 hover:bg-muted/50"
          >
            <td className="px-4 py-2">{r.group as string}</td>
            {result.columns.slice(1).map((c, i) => (
              <td key={c} className="px-4 py-2 text-right tabular-nums">
                {formatValue(r[`m${i}`] as number)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// One row in the "我的分析" dropdown. Delete uses a two-step confirm (mirrors
// the assist session list): the first click arms the trash icon, a second click
// within 3s deletes; opening the analysis is the row's primary click.
function SavedAnalysisRow({
  item,
  active,
  onOpen,
  onDelete,
}: {
  item: SavedAnalysisSummary
  active: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation() // never open the analysis when hitting delete
    if (!confirming) {
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), 3000)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    setConfirming(false)
    onDelete()
  }

  return (
    <div
      onClick={onOpen}
      className={`group relative flex cursor-pointer flex-col items-start px-3 py-1.5 text-left text-sm transition-colors ${
        active ? "bg-muted" : "hover:bg-muted/60"
      } ${confirming ? "ring-1 ring-inset ring-red-500/60" : ""}`}
    >
      <span className="line-clamp-1 pr-6">{item.name}</span>
      <span className="text-xs text-muted-foreground">
        {item.owner ?? "匿名"} · {timeAgo(item.updated_at)}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        title={confirming ? "再次点击确认删除" : "删除分析"}
        className={`absolute top-1.5 right-2 flex size-6 items-center justify-center rounded-md transition-opacity ${
          confirming
            ? "text-red-500 opacity-100"
            : "text-muted-foreground opacity-0 hover:text-red-500 group-hover:opacity-100"
        }`}
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  )
}

// --- Data-driven lenses (TimelineView / MapView / GEO_COORDS) live in
// components/object-lenses.tsx so the object browser can reuse them. ---
