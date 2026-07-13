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
  SparklesIcon,
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
  type MetricGroupRow,
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
import {
  assistApi,
  timeAgo,
  type AiInterpretRequest,
  type AiMetricQueryResult,
} from "@/lib/assist-api"
import { fieldLabel } from "@/lib/field-labels"
import { PageContainer, PageHeading } from "@/components/page-container"
import { MapView, TimelineView } from "@/components/object-lenses"
import { MetricBarChart } from "@/components/metric-bar-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/ui/pagination"

// A lens is one way of looking at the *current* object set. The dashboard is no
// longer a lens — it is a top-level page mode (see PageMode) — so the set-scoped
// lenses are table / chart / timeline / map. The relationship (schema) graph
// lives in the ontology manager, not here.
type Lens = "table" | "chart" | "timeline" | "map"

// The two top-level modes of this page. "dashboard" is the global metric board
// (no object set, no config); "analysis" is the saveable step-board document.
type PageMode = "dashboard" | "analysis"

const LENSES: { key: Lens; label: string; icon: React.ElementType }[] = [
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

// Compact one-line summary of a filter list (e.g. "状态=已完成，城市包含上海"), used
// as a pivot board's "基于：…" subtitle. Arrays only ever arrive on the hidden
// pivot-derived `in` filter, which is never summarized here.
function summarizeFilters(fs: FilterSpec[]): string {
  return fs
    .map((f) => {
      const op = OP_OPTIONS.find((o) => o.value === f.op)?.label ?? f.op
      const val = Array.isArray(f.value) ? f.value.join("/") : f.value
      return `${fieldLabel(f.field)}${op}${val}`
    })
    .join("，")
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
  // Top-level page mode: the global board (default) or the analysis document.
  const [mode, setMode] = React.useState<PageMode>("dashboard")
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
      l === "timeline"
        ? !!timeCol
        : l === "map"
          ? !!geoCol
          : l === "chart"
            ? // Chart is available when the type has cube metrics, or when a
              // pivot is active (it then renders via an /analyze aggregate).
              chartMetrics.length > 0 || pivotActive
            : true,
    [timeCol, geoCol, chartMetrics, pivotActive]
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
  // the user filters empty. This is a fresh, unsaved analysis. Landing on a
  // handoff jumps straight to the analysis document (mirrors openAnalysis) so
  // the handed-off set is visible without a manual mode switch.
  function applyHandoff(payload: AnalysisHandoff, ts: AnalysisTable[]) {
    const label = ts.find((t) => t.name === payload.table)?.label ?? payload.table
    setMode("analysis")
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

  // Build the board on entering the dashboard *mode* with no cached data. The
  // refresh button forces a rebuild by calling loadDashboard directly.
  React.useEffect(() => {
    if (mode !== "dashboard" || dashData !== null) return
    loadDashboard()
  }, [mode, dashData, loadDashboard])

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

  // The path's base table + full row count (for the 数据 board and the saved
  // recipe). The source step's table when the path is a handoff, else the
  // captured pivot origin, else the plain active table.
  const startTable = sourceStep ? sourceStep.targetTable : origin?.table ?? tableName
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
    // Replay rebuilds the whole path, so any stale pivot notice (e.g. a previous
    // over-limit "对象集过大") no longer applies — clear it like the other
    // path-changing entry points (selectTable / goToOrigin / goToStep) do.
    setPivotError(null)
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
    // Legacy saved analyses may carry lens "dashboard" (the board used to be a
    // lens). The board is a page mode now, so old value falls back to the table
    // lens and replays without error.
    setLens(def.lens === "dashboard" || !def.lens ? "table" : (def.lens as Lens))
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
      // Opening a saved analysis lands on its step-board document.
      setMode("analysis")
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

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="分析工作台"
        desc="围绕对象集的指标、图表、时间轴与地理分析"
        icon={<RadarIcon />}
        actions={
          <div className="flex items-center gap-2">
            {/* Top-level mode switch: 看板 (global board) vs 分析 (step-board document).
                The save / open controls live inside the analysis document head. */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <button
                onClick={() => setMode("dashboard")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "dashboard"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutDashboardIcon className="size-4" /> 看板
              </button>
              <button
                onClick={() => setMode("analysis")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "analysis"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <RouteIcon className="size-4" /> 分析
              </button>
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

      {/* Two page modes. "看板" is a full-bleed global metric board (no config
          rail). "分析" is a centered, saveable document whose vertical step spine
          *is* the analysis path — so the former breadcrumb is gone. */}
      {mode === "dashboard" ? (
        <DashboardCanvas
          data={dashData}
          loading={dashLoading}
          metricCount={allMetrics.length}
          offline={offline}
          onRefresh={loadDashboard}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl pb-6">
            {/* Document head: analysis name + save + my-analyses (logic unchanged). */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <h2
                className="min-w-0 truncate font-heading text-lg font-semibold tracking-tight"
                title={currentAnalysisName || "未命名分析"}
              >
                {currentAnalysisName || "未命名分析"}
              </h2>
              <div className="ml-auto flex items-center gap-2">
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
              </div>
            </div>

            {/* The step spine: each board carries a step icon linked to the next by
                a vertical connector line. The board order is the analysis path. */}
            <div>
              {/* Board · 数据 — the starting object set, or an object-browser handoff. */}
              <StepBoard icon={<TableIcon />} label="数据">
                {sourceStep ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">来自对象浏览器</span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">
                      {sourceStep.desc}
                      <span className="text-muted-foreground">
                        （{sourceStep.matched.toLocaleString()} 条）
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      全量 {startCount.toLocaleString()} 行
                    </span>
                    <button
                      onClick={goToOrigin}
                      title="清除移交，返回普通选择"
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-500"
                    >
                      <XIcon className="size-3.5" /> 清除
                    </button>
                  </div>
                ) : tables.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    {offline ? "分析服务未启动" : "加载中…"}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">对象类型</span>
                      <select
                        className={`${SELECT_BASE} min-w-[10rem]`}
                        value={startTable}
                        onChange={(e) => {
                          const t = tables.find((x) => x.name === e.target.value)
                          if (t) selectTable(t)
                        }}
                      >
                        {tables.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      全量 {startCount.toLocaleString()} 行
                    </span>
                  </div>
                )}
              </StepBoard>

              {/* Boards · 跳转 — one per pivot hop. Deleting truncates this hop and
                  everything after it (the former breadcrumb backtrack logic). */}
              {pathSteps.map((s, i) =>
                s.kind === "pivot" ? (
                  <StepBoard
                    key={`${s.targetTable}:${i}`}
                    icon={<Share2Icon />}
                    label={
                      <>
                        沿『{s.linkLabel}』→ {s.targetLabel}{" "}
                        <span className="font-normal text-muted-foreground">
                          （{s.matched.toLocaleString()} 条）
                        </span>
                      </>
                    }
                    sub={
                      s.stepFilters.length > 0
                        ? `基于：${summarizeFilters(s.stepFilters)}`
                        : undefined
                    }
                    actions={
                      <button
                        onClick={() => (i === 0 ? goToOrigin() : goToStep(i - 1))}
                        title="删除此跳转及其后续步骤"
                        aria-label="删除跳转"
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-red-500"
                      >
                        <Trash2Icon className="size-4" />
                      </button>
                    }
                  />
                ) : null
              )}

              {/* Board · 筛选 — user filters on the current base table, plus the
                  "沿关系跳转" action that inserts a pivot board before this one and
                  clears the user filters (unchanged pivot behavior). */}
              <StepBoard
                icon={<FilterIcon />}
                label="筛选"
                actions={
                  <button
                    onClick={addFilter}
                    disabled={!table}
                    className="inline-flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-xs transition-colors hover:border-emerald-500/40 hover:text-foreground disabled:opacity-50"
                  >
                    <PlusIcon className="size-3" /> 添加过滤
                  </button>
                }
              >
                {filters.length === 0 ? (
                  <span className="text-xs text-muted-foreground">未设置过滤条件 · 使用全部数据</span>
                ) : (
                  <div className="space-y-2">
                    {filters.map((f, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <select
                          className={`${SELECT_BASE} w-44`}
                          value={f.field}
                          onChange={(e) =>
                            setFilters((all) =>
                              all.map((x, j) => (j === i ? { ...x, field: e.target.value } : x))
                            )
                          }
                        >
                          {table?.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.label}
                            </option>
                          ))}
                        </select>
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
                          className="h-8 w-48 min-w-0"
                          // User-entered filters are always scalar; arrays only ever
                          // arrive as the (hidden) pivot-derived `in` filter.
                          value={typeof f.value === "string" ? f.value : f.value.join(",")}
                          placeholder="值"
                          onChange={(e) =>
                            setFilters((all) =>
                              all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                            )
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
                    ))}
                  </div>
                )}

                {/* Search Around: pivot the whole current object set to a related type. */}
                {directions.length > 0 && (
                  <div className="relative mt-4 border-t border-border/60 pt-3">
                    <button
                      onClick={() => setPivotMenuOpen((o) => !o)}
                      disabled={pivotBusy || !table}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-emerald-500/40 hover:text-foreground disabled:opacity-50"
                    >
                      {pivotBusy ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <PlusIcon className="size-4" />
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
                        <div className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
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

                {/* Footer: the live match count for the current base table. */}
                <div className="mt-4 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  命中{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {(result?.matched_rows ?? 0).toLocaleString()}
                  </span>{" "}
                  行
                </div>
              </StepBoard>

              {/* Board · 视图 — grouping / measures, the lens tabs, and the result. */}
              <StepBoard
                icon={<BarChart3Icon />}
                label="视图"
                last
                actions={
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                    {LENSES.map((l) => {
                      const disabled = !lensAvailable(l.key)
                      const disabledTitle =
                        l.key === "timeline"
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
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                            disabled ? "cursor-not-allowed opacity-50" : ""
                          } ${
                            lens === l.key
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <l.icon className="size-4" /> {l.label}
                        </button>
                      )
                    })}
                  </div>
                }
              >
                {/* Grouping / measure (or chart metric / dimension) controls — a
                    horizontal strip in the board head. Under a pivot the chart lens
                    routes through /analyze, so it reuses the table controls. */}
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

                {/* Compact stat strip (aggregate totals / metric overall). */}
                {lens === "table" && <TableStatStrip result={result} />}
                {lens === "chart" && pivotActive && <TableStatStrip result={result} />}
                {lens === "chart" && !pivotActive && chartMetrics.length > 0 && (
                  <ChartStatStrip metricResult={metricResult} />
                )}

                {/* Result — a fixed-height frame so every lens fills the same slot. */}
                <div className="mt-3 flex h-[540px] flex-col">
                  {lens === "table" && (
                    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
                      {/* Lightweight in-flight hint: a thin top bar plus a corner
                          spinner. Old rows stay visible (dimmed), never flash empty. */}
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
                      <ChartCanvas
                        chartMetrics={chartMetrics}
                        metricResult={metricResult}
                        offline={offline}
                      />
                    ))}

                  {lens === "timeline" && (
                    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
                      {timeCol ? (
                        <TimelineView
                          rows={timelineRows}
                          columns={table?.columns ?? []}
                          timeCol={timeCol}
                        />
                      ) : null}
                    </div>
                  )}

                  {lens === "map" && (
                    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
                      {geoCol ? <MapView counts={geoCounts} geoCol={geoCol} onDrill={drillGeo} /> : null}
                    </div>
                  )}
                </div>
              </StepBoard>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

// --- One board in the analysis document's vertical "step spine". The icon
// column on the left carries a connector line down to the next board; the card
// on the right holds the step header (label + optional subtitle + right-aligned
// actions) and an optional body. Purely presentational. ---

function StepBoard({
  icon,
  label,
  sub,
  actions,
  last,
  children,
}: {
  icon: React.ReactNode
  label: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  last?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex gap-4">
      {/* Step icon + connector line (the spine). The line fills the row below the
          icon; with no vertical gap between rows it meets the next icon. */}
      <div className="flex flex-col items-center">
        <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-emerald-500 [&_svg]:size-4">
          {icon}
        </div>
        {!last && <div className="w-px flex-1 bg-border" />}
      </div>
      {/* Board card. */}
      <div className="min-w-0 flex-1 pb-6">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-start gap-3 border-b border-border px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">{label}</div>
              {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
          </div>
          {children != null && <div className="p-4">{children}</div>}
        </div>
      </div>
    </div>
  )
}

// --- View-board control: table lens group-by + measures (horizontal strip). ---

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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {/* Grouping dimension. */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">分组维度</span>
        <select
          className={`${SELECT_BASE} disabled:opacity-50`}
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
      </div>

      {/* Measures — inline pills; empty = detail mode. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">度量</span>
        {metrics.length === 0 && (
          <span className="text-xs text-muted-foreground">无 · 明细模式（显示全部行）</span>
        )}
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-1">
            <select
              className={`${SELECT_BASE} px-1.5 py-1`}
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
              className={`${SELECT_BASE} w-16 shrink-0 px-1.5 py-1`}
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
        {measures.length > 0 && metrics.length < 3 && (
          <button
            onClick={() => setMetrics((m) => [...m, { field: measures[0].name, agg: "sum" }])}
            className="inline-flex items-center gap-0.5 rounded-md border border-border px-1.5 py-1 text-xs hover:border-emerald-500/40 hover:text-foreground"
          >
            <PlusIcon className="size-3" /> 添加度量
          </button>
        )}
      </div>
    </div>
  )
}

// --- View-board control: chart lens metric + dimension pickers (horizontal). ---

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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">指标</span>
        <select
          className={SELECT_BASE}
          value={chartMetricKey}
          onChange={(e) => setChartMetricKey(e.target.value)}
        >
          {chartMetrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">维度</span>
        <select
          className={SELECT_BASE}
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
      </div>

      {chartMetric?.description && (
        <span className="text-xs text-muted-foreground">{chartMetric.description}</span>
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

// Horizontal-bar list (name left, proportional bar centre, formatted value
// right). Shared by the dashboard breakdown panel and the AI 问数 result so the
// two render identically.
function MetricBarList({
  rows,
  agg,
  unit,
}: {
  rows: MetricGroupRow[]
  agg: string
  unit: string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return (
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
  )
}

// AI 解读: a ghost button that asks the assist service to narrate an
// already-masked aggregate payload, then shows the returned insight inline.
// The frontend sends only the numbers it is already displaying — assist never
// fetches raw data. Re-clicking re-runs the interpretation.
function InterpretBlock({ payload }: { payload: AiInterpretRequest }) {
  const [busy, setBusy] = React.useState(false)
  const [text, setText] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await assistApi.aiInterpret(payload)
      setText(res.text)
    } catch {
      setError("AI 解读失败，请重试")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        disabled={busy}
        onClick={() => run()}
        className="text-muted-foreground hover:text-foreground"
      >
        {busy ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <SparklesIcon className="text-emerald-500" />
        )}
        AI 解读
      </Button>
      {error && <div className="mt-1 text-xs text-danger">{error}</div>}
      {text && (
        <div className="mt-2 flex items-start gap-2 rounded-md border-l-2 border-emerald-500/60 bg-muted/30 px-3 py-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
          <span className="min-w-0 flex-1">{text}</span>
          <button
            onClick={() => setText(null)}
            className="shrink-0 rounded p-0.5 hover:text-foreground"
            aria-label="关闭解读"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
    </>
  )
}

// AI 问数: ask a natural-language question; the assist service picks the metric
// (+ optional dimension / filters), and this component executes the query
// itself via analysisApi (carrying the user's token, so governance masking /
// audit stay on the user's identity). All state is local so dashboard refreshes
// never disturb the last answer.
function AiAskCard() {
  const [question, setQuestion] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // The model's "no metric fits" outcome — a normal result shown as a muted note.
  const [note, setNote] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{
    res: AiMetricQueryResult
    data: MetricQueryResult
  } | null>(null)

  async function ask() {
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await assistApi.aiMetricQuery(q)
      if (res.error) {
        setNote(res.error)
        setResult(null)
        return
      }
      const data = await analysisApi.queryMetric({
        metric: res.metric!,
        dimension: res.dimension ?? null,
        filters: (res.filters ?? []).map((f) => ({
          field: f.field,
          op: "eq" as const,
          value: f.value,
        })),
        limit: 10,
      })
      setResult({ res, data })
    } catch {
      setError("AI 问数失败，请稍后再试")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <SparklesIcon className="size-4 text-emerald-500" />
        <span className="text-xs text-muted-foreground">AI 问数</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="h-8"
          placeholder="例如：各状态的订单销售额是多少"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) ask()
          }}
        />
        <Button size="sm" disabled={busy || question.trim() === ""} onClick={() => ask()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          提问
        </Button>
      </div>

      {note && <div className="mt-2 text-sm text-muted-foreground">{note}</div>}
      {error && (
        <div className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground">
                {result.res.metric_label}
                {result.res.dimension_label ? ` · 按${result.res.dimension_label}` : ""}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMetricValue(result.data.total, result.data.agg, result.data.unit)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                基于 {result.data.matched_rows.toLocaleString()} 个对象
              </div>
            </div>
            <button
              onClick={() => setResult(null)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="清除结果"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          {result.data.rows.length > 0 && (
            <div className="mt-3">
              <MetricBarList
                rows={result.data.rows}
                agg={result.data.agg}
                unit={result.data.unit}
              />
            </div>
          )}

          {result.res.reason && (
            <div className="mt-2 text-xs text-muted-foreground">
              「口径」{result.res.reason}
            </div>
          )}

          <div className="mt-2">
            <InterpretBlock
              payload={{
                title: result.res.dimension_label
                  ? `${result.res.metric_label} · 按${result.res.dimension_label}`
                  : result.res.metric_label ?? "",
                unit: result.data.unit,
                agg: result.data.agg,
                total: result.data.total,
                matched_rows: result.data.matched_rows,
                rows: result.data.rows,
                question,
              }}
            />
          </div>
        </div>
      )}
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

      {/* AI 问数 sits outside the dimming wrapper so a board refresh never dims
          the last answer, and its local state survives refreshes. */}
      <AiAskCard />

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
        <>
          <MetricBarList rows={rows} agg={agg} unit={unit} />
          {/* AI 解读: button + insight text, under the bars. Built from this
              panel's own props (authoritative, already-masked aggregates). */}
          <div className="mt-2">
            <InterpretBlock
              payload={{
                title: `${metric.label} · 按${dimLabel}`,
                unit,
                agg,
                total: byDim?.total ?? null,
                matched_rows: byDim?.matched_rows ?? null,
                rows,
              }}
            />
          </div>
        </>
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
