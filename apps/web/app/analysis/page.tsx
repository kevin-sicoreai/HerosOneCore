"use client"

import * as React from "react"
import {
  CalendarClockIcon,
  FilterIcon,
  MapIcon,
  PlusIcon,
  RadarIcon,
  Share2Icon,
  TableIcon,
  WaypointsIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react"

import {
  analysisApi,
  type AnalysisColumn,
  type AnalysisTable,
  type AnalyzeResult,
  type FilterOp,
  type FilterSpec,
  type MetricAgg,
  type MetricSpec,
} from "@/lib/analysis-api"
import { ontologyApi, type GraphNode, type OntologyGraph } from "@/lib/ontology-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type View = "graph" | "timeline" | "map" | "table"

// Ontology node color -> Tailwind border/text classes (same map as the ontology page).
const COLOR: Record<string, string> = {
  emerald: "border-emerald-500/60 text-emerald-500",
  sky: "border-sky-500/60 text-sky-500",
  violet: "border-violet-500/60 text-violet-500",
  amber: "border-amber-500/60 text-amber-500",
  rose: "border-rose-500/60 text-rose-500",
}

// Same order as the original prototype; 表格 hosts the aggregation workbench.
const VIEWS: { key: View; label: string; icon: React.ElementType }[] = [
  { key: "graph", label: "关系图谱", icon: WaypointsIcon },
  { key: "timeline", label: "时间轴", icon: CalendarClockIcon },
  { key: "map", label: "地图", icon: MapIcon },
  { key: "table", label: "表格", icon: TableIcon },
]

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

function formatValue(v: number | string): string {
  if (typeof v !== "number") return String(v)
  return v >= 1000 ? v.toLocaleString() : String(v)
}

export default function AnalysisPage() {
  const [tables, setTables] = React.useState<AnalysisTable[]>([])
  const [offline, setOffline] = React.useState(false)
  const [tableName, setTableName] = React.useState<string>("")
  const [groupBy, setGroupBy] = React.useState<string>("")
  const [metrics, setMetrics] = React.useState<MetricSpec[]>([])
  const [filters, setFilters] = React.useState<FilterSpec[]>([])
  const [result, setResult] = React.useState<AnalyzeResult | null>(null)
  // Shared "current object set" detail rows: the same filtered records feed the
  // timeline/map views, so switching views only changes the lens, not the data.
  const [detailRows, setDetailRows] = React.useState<Record<string, unknown>[]>([])
  const [graph, setGraph] = React.useState<OntologyGraph>({ nodes: [], links: [] })
  const [view, setView] = React.useState<View>("graph")

  const table = tables.find((t) => t.name === tableName) ?? null
  const dimensions = table?.columns.filter((c) => c.kind === "dimension" && c.name !== "id") ?? []
  const measures = table?.columns.filter((c) => c.kind === "measure") ?? []
  const isAgg = view === "table"

  // Capability detection on the current object type's columns.
  const timeCol =
    table?.columns.find((c) => c.data_type && /^(DATE|TIMESTAMP)/i.test(c.data_type)) ?? null
  const geoCol = table?.columns.find((c) => c.name === "city" || c.name === "region") ?? null
  const viewAvailable = React.useCallback(
    (v: View) => (v === "timeline" ? !!timeCol : v === "map" ? !!geoCol : true),
    [timeCol, geoCol]
  )

  // Load the catalog, select the first table with sensible defaults.
  React.useEffect(() => {
    analysisApi
      .tables()
      .then((ts) => {
        setTables(ts)
        if (ts.length > 0) selectTable(ts[0])
      })
      .catch(() => setOffline(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the ontology type-level graph once (drives the graph overview view).
  React.useEffect(() => {
    ontologyApi.graph().then(setGraph).catch(() => {})
  }, [])

  function selectTable(t: AnalysisTable) {
    setTableName(t.name)
    // Default to detail mode: no grouping, no measure — show all rows as-is.
    setGroupBy("")
    setMetrics([])
    setFilters([])
    setResult(null)
  }

  // Fall back to the table view if switching object types makes the current
  // view unavailable (e.g. a type without a time or geo property).
  React.useEffect(() => {
    if (!viewAvailable(view)) setView("table")
  }, [viewAvailable, view])

  // Auto-run on any config change (debounced). No metrics = detail mode:
  // the service returns the filtered rows as-is.
  React.useEffect(() => {
    if (!tableName) return
    const timer = window.setTimeout(() => {
      analysisApi
        .analyze({
          table: tableName,
          group_by: metrics.length === 0 ? null : groupBy || null,
          metrics,
          filters: filters.filter((f) => String(f.value).trim() !== ""),
        })
        .then(setResult)
        .catch(() => setOffline(true))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [tableName, groupBy, metrics, filters])

  // Keep the shared object set in sync with the current type + filters. Detail
  // mode is cheap (<=1000 rows); timeline/map read from these rows.
  React.useEffect(() => {
    if (!tableName) {
      setDetailRows([])
      return
    }
    const timer = window.setTimeout(() => {
      analysisApi
        .analyze({
          table: tableName,
          group_by: null,
          metrics: [],
          filters: filters.filter((f) => String(f.value).trim() !== ""),
        })
        .then((r) => setDetailRows(r.rows as Record<string, unknown>[]))
        .catch(() => setOffline(true))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [tableName, filters])

  // Drill from the map into the detail table filtered to one geo value.
  function drillGeo(value: string) {
    if (!geoCol) return
    setFilters([{ field: geoCol.name, op: "eq", value }])
    setView("table")
  }

  // Click a type node in the ontology overview: select that object type and jump
  // to its table (aggregation) analysis.
  function selectTypeFromGraph(node: GraphNode) {
    const t = tables.find((x) => x.name === node.api_name)
    if (t) {
      selectTable(t)
      setView("table")
    }
  }

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="分析工作台"
        desc="同一套本体 · 聚合、图谱、时间轴与地理视图"
        icon={<RadarIcon />}
        actions={
          offline ? (
            <Badge variant="warning">
              <WifiOffIcon /> 分析服务未启动
            </Badge>
          ) : (
            <Badge variant="brand">数据分析</Badge>
          )
        }
      />

      {/* View switcher */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {VIEWS.map((v) => {
          const disabled = !viewAvailable(v.key)
          const disabledTitle =
            v.key === "timeline"
              ? "当前对象类型无时间属性"
              : v.key === "map"
                ? "当前对象类型无地理属性"
                : undefined
          return (
            <button
              key={v.key}
              onClick={() => !disabled && setView(v.key)}
              disabled={disabled}
              title={disabled ? disabledTitle : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                disabled ? "cursor-not-allowed opacity-50" : ""
              } ${
                view === v.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <v.icon className="size-4" /> {v.label}
            </button>
          )
        })}
        <div className="ml-auto pr-2 text-xs text-muted-foreground">
          {view === "graph"
            ? `本体总览 · ${graph.nodes.length} 个对象类型`
            : table
              ? `分析上下文：${table.label}${
                  view === "timeline" || view === "map" ? ` · 命中 ${detailRows.length} 行` : ""
                }`
              : ""}
        </div>
      </div>

      {isAgg ? (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4">
          {/* Config panel */}
          <div className="space-y-4 overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-card p-4">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">数据表</div>
              <select
                className={SELECT_CLASS}
                value={tableName}
                onChange={(e) => {
                  const t = tables.find((x) => x.name === e.target.value)
                  if (t) selectTable(t)
                }}
              >
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.label} · {t.row_count} 行
                  </option>
                ))}
              </select>
              {table && <div className="mt-1 text-xs text-muted-foreground">{table.desc}</div>}
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">分组维度</div>
              <select
                className={`${SELECT_CLASS} disabled:opacity-50`}
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
              {metrics.length === 0 && (
                <div className="mt-1 text-xs text-muted-foreground">明细模式下不分组</div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>度量</span>
                {metrics.length < 3 && (
                  <button
                    onClick={() =>
                      measures[0] && setMetrics((m) => [...m, { field: measures[0].name, agg: "sum" }])
                    }
                    className="flex items-center gap-0.5 hover:text-foreground"
                  >
                    <PlusIcon className="size-3" /> 添加
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {metrics.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5">
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
                      className={`${SELECT_BASE} w-24 shrink-0`}
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
                {metrics.length === 0 && (
                  <div className="text-xs text-muted-foreground">无度量 · 显示全部明细数据</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FilterIcon className="size-3" /> 过滤条件
                </span>
                <button
                  onClick={() =>
                    table && setFilters((f) => [...f, { field: table.columns[1].name, op: "eq", value: "" }])
                  }
                  className="flex items-center gap-0.5 hover:text-foreground"
                >
                  <PlusIcon className="size-3" /> 添加
                </button>
              </div>
              <div className="space-y-1.5">
                {filters.length === 0 && <div className="text-xs text-muted-foreground">无</div>}
                {filters.map((f, i) => (
                  <div key={i} className="space-y-1.5 rounded-md border border-border/60 p-1.5">
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
                        className="min-w-0 flex-1"
                        value={f.value}
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
            </div>

            {result && table && (
              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                命中 {result.matched_rows} 行 / 共 {table.row_count} 行
              </div>
            )}
          </div>

          {/* Results */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {result?.mode === "aggregate" &&
                result.columns.slice(1).map((label, i) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-xl font-semibold">{formatValue(result.totals[i])}</div>
                  </div>
                ))}
              {result && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    {result.mode === "detail" ? "明细记录" : "命中记录"}
                  </div>
                  <div className="text-xl font-semibold">{formatValue(result.matched_rows)}</div>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
              {!result ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {offline ? "分析服务未启动" : "配置左侧参数开始分析"}
                </div>
              ) : (
                <ResultTable result={result} table={table} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
          {view === "graph" && (
            <GraphView
              graph={graph}
              tables={tables}
              tableName={tableName}
              onSelect={selectTypeFromGraph}
            />
          )}
          {view === "timeline" && timeCol && (
            <TimelineView detailRows={detailRows} columns={table?.columns ?? []} timeCol={timeCol} />
          )}
          {view === "map" && geoCol && (
            <MapView detailRows={detailRows} geoCol={geoCol} onDrill={drillGeo} />
          )}
        </div>
      )}
    </PageContainer>
  )
}

function ResultTable({ result, table }: { result: AnalyzeResult; table: AnalysisTable | null }) {
  // Detail mode: raw filtered rows, one column per object-type property.
  if (result.mode === "detail") {
    const cols = table?.columns ?? []
    return (
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
          <tr className="border-b border-border">
            {cols.map((c) => (
              <th key={c.name} className="px-4 py-2 text-left font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/60 hover:bg-muted/50">
              {cols.map((c) => (
                <td key={c.name} className="px-4 py-2">
                  {formatValue((r[c.name] ?? "") as number | string)}
                </td>
              ))}
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
          {result.columns.map((c) => (
            <th key={c} className="px-4 py-2 text-left font-medium last:text-right">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r) => (
          <tr key={r.group as string} className="border-b border-border/60 hover:bg-muted/50">
            <td className="px-4 py-2">{r.group as string}</td>
            {result.columns.slice(1).map((c, i) => (
              <td key={c} className={`px-4 py-2 ${i === result.columns.length - 2 ? "text-right" : ""}`}>
                {formatValue(r[`m${i}`] as number)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// --- Data-driven views: all read the same current object set. ---

const NODE_W = 160
const NODE_H = 64

// The graph overview: the ontology's type layer. Clicking a type enters its
// detail set (the table view scoped to that object type).
function GraphView({
  graph,
  tables,
  tableName,
  onSelect,
}: {
  graph: OntologyGraph
  tables: AnalysisTable[]
  tableName: string
  onSelect: (node: GraphNode) => void
}) {
  const nodeById = (id: string) => graph.nodes.find((n) => n.id === id)

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        本体暂无对象类型
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[440px] overflow-auto bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]">
      <div className="relative" style={{ minWidth: 800, minHeight: 520 }}>
        <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
          {graph.links.map((l) => {
            const a = nodeById(l.from_object_type_id)
            const b = nodeById(l.to_object_type_id)
            if (!a || !b) return null
            const x1 = a.x + NODE_W / 2,
              y1 = a.y + NODE_H / 2
            const x2 = b.x + NODE_W / 2,
              y2 = b.y + NODE_H / 2
            return (
              <g key={l.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeOpacity={0.5} />
                <rect x={(x1 + x2) / 2 - 30} y={(y1 + y2) / 2 - 9} width={60} height={18} rx={4} fill="var(--color-card)" stroke="var(--color-border)" />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">
                  {l.display_name.length > 8 ? l.display_name.slice(0, 7) + "…" : l.display_name}
                </text>
              </g>
            )
          })}
        </svg>

        {graph.nodes.map((n) => {
          const hasTable = tables.some((t) => t.name === n.api_name)
          const active = n.api_name === tableName
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n)}
              className={`absolute z-10 flex flex-col justify-center rounded-lg border-2 bg-card px-3 text-left shadow-sm ${
                COLOR[n.color] ?? COLOR.emerald
              } ${active ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""} ${
                hasTable ? "cursor-pointer" : "cursor-default"
              }`}
              style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
            >
              <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                <Share2Icon className="size-3.5 shrink-0" />
                <span className="truncate">{n.display_name}</span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {n.instance_count ?? "—"} 实例
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Timeline: current object set ordered by its time property.
function TimelineView({
  detailRows,
  columns,
  timeCol,
}: {
  detailRows: Record<string, unknown>[]
  columns: AnalysisColumn[]
  timeCol: AnalysisColumn
}) {
  // Title column: prefer a "name" column, else the first column (primary key).
  const titleCol = columns.find((c) => c.name === "name") ?? columns[0]
  // A few other dimension columns for the subtitle (excluding time + title).
  const subCols = columns
    .filter(
      (c) => c.kind === "dimension" && c.name !== timeCol.name && c.name !== titleCol?.name
    )
    .slice(0, 3)

  const items = detailRows
    .map((row) => ({
      time: String(row[timeCol.name] ?? ""),
      title: String(row[titleCol?.name ?? ""] ?? ""),
      sub: subCols.map((c) => `${c.label}: ${row[c.name] ?? "—"}`).join(" · "),
    }))
    .filter((it) => it.time !== "")
    // ISO date/timestamp strings sort correctly as plain strings; newest first.
    .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))

  const shown = items.slice(0, 100)

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto mb-4 max-w-2xl text-xs text-muted-foreground">
        按 {timeCol.label} 排列 · 共 {items.length} 条（截取前 100）
      </div>
      <ol className="relative mx-auto max-w-2xl space-y-5 border-l-2 border-border pl-6">
        {shown.map((t, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-card" />
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{t.time}</span>
            </div>
            <div className="text-sm font-medium">{t.title}</div>
            {t.sub && <div className="text-sm text-muted-foreground">{t.sub}</div>}
          </li>
        ))}
      </ol>
    </div>
  )
}

// Approximate percentage coordinates for the demo map (not a real projection);
// they roughly mirror each location's relative position within China.
const GEO_COORDS: Record<string, { x: number; y: number }> = {
  上海: { x: 78, y: 58 },
  北京: { x: 66, y: 30 },
  广州: { x: 68, y: 82 },
  成都: { x: 38, y: 62 },
  武汉: { x: 62, y: 58 },
  西安: { x: 50, y: 44 },
  沈阳: { x: 78, y: 20 },
  杭州: { x: 77, y: 62 },
  深圳: { x: 70, y: 84 },
  重庆: { x: 45, y: 62 },
  华东: { x: 75, y: 58 },
  华北: { x: 64, y: 30 },
  华南: { x: 68, y: 82 },
  西南: { x: 42, y: 62 },
  海外: { x: 90, y: 88 },
}

// Map: current object set grouped by its geo property; click a point to drill in.
function MapView({
  detailRows,
  geoCol,
  onDrill,
}: {
  detailRows: Record<string, unknown>[]
  geoCol: AnalysisColumn
  onDrill: (value: string) => void
}) {
  const counts = new Map<string, number>()
  for (const row of detailRows) {
    const v = String(row[geoCol.name] ?? "").trim()
    if (v === "") continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const known: { value: string; count: number; x: number; y: number }[] = []
  const unknown: { value: string; count: number }[] = []
  for (const [value, count] of Array.from(counts.entries())) {
    const c = GEO_COORDS[value]
    if (c) known.push({ value, count, x: c.x, y: c.y })
    else unknown.push({ value, count })
  }
  // Point size buckets by count.
  const sizeFor = (n: number) => (n <= 5 ? 8 : n <= 50 ? 14 : 22)

  return (
    <div className="relative h-full min-h-[440px] overflow-hidden bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:40px_40px]">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-emerald-500/5" />
      <div className="absolute top-3 left-3 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
        <MapIcon className="mr-1 inline size-3.5" /> 地理分布 · {known.length} 个位置 · 按 {geoCol.label}
      </div>
      {known.map((p) => {
        const size = sizeFor(p.count)
        return (
          <button
            key={p.value}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onClick={() => onDrill(p.value)}
            title={`下钻到 ${p.value}`}
          >
            <span className="block rounded-full bg-emerald-500" style={{ width: size, height: size }} />
            <span className="whitespace-nowrap text-xs text-foreground">
              {p.value} · {p.count}
            </span>
          </button>
        )
      })}
      {unknown.length > 0 && (
        <div className="absolute right-3 bottom-3 left-3 flex flex-wrap gap-1.5">
          {unknown.map((u) => (
            <span
              key={u.value}
              className="rounded-md border border-border bg-card/90 px-2 py-0.5 text-xs text-muted-foreground backdrop-blur"
            >
              未识别位置：{u.value} · {u.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
