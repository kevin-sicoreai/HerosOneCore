"use client"

import * as React from "react"
import {
  CalendarClockIcon,
  FilterIcon,
  MapIcon,
  PlusIcon,
  RadarIcon,
  TableIcon,
  WaypointsIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react"

import {
  analysisApi,
  type AnalysisTable,
  type AnalyzeResult,
  type FilterOp,
  type FilterSpec,
  type MetricAgg,
  type MetricSpec,
} from "@/lib/analysis-api"
import { GRAPH_EDGES, GRAPH_NODES, TIMELINE, type GraphNode } from "@/lib/mock"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type View = "graph" | "timeline" | "map" | "table"

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
  const [view, setView] = React.useState<View>("table")

  const table = tables.find((t) => t.name === tableName) ?? null
  const dimensions = table?.columns.filter((c) => c.kind === "dimension" && c.name !== "id") ?? []
  const measures = table?.columns.filter((c) => c.kind === "measure") ?? []
  const isAgg = view === "table"

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

  function selectTable(t: AnalysisTable) {
    setTableName(t.name)
    // Default to detail mode: no grouping, no measure — show all rows as-is.
    setGroupBy("")
    setMetrics([])
    setFilters([])
    setResult(null)
  }

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
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === v.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <v.icon className="size-4" /> {v.label}
          </button>
        ))}
        <div className="ml-auto pr-2 text-xs text-muted-foreground">
          {isAgg ? (table ? `分析上下文：${table.label}` : "") : "演示数据 · 待接本体服务"}
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
          {view === "graph" && <GraphView />}
          {view === "timeline" && <TimelineView />}
          {view === "map" && <MapView />}
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

// --- Prototype views below: demo data until the ontology service exists. ---

const NODE_COLOR: Record<GraphNode["type"], string> = {
  person: "#10b981",
  org: "#0ea5e9",
  account: "#a855f7",
  device: "#f59e0b",
  event: "#ef4444",
}
const NODE_LABEL: Record<GraphNode["type"], string> = {
  person: "人员",
  org: "组织",
  account: "账户",
  device: "设备",
  event: "事件",
}

function GraphView() {
  const { open } = useResourceDrawer()
  const R = 26
  return (
    <div className="relative h-full min-h-[440px] overflow-auto bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]">
      <svg className="h-full min-h-[440px] w-full min-w-[760px]">
        {GRAPH_EDGES.map((e, i) => {
          const a = GRAPH_NODES.find((n) => n.id === e.from)!
          const b = GRAPH_NODES.find((n) => n.id === e.to)!
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-muted-foreground)" strokeOpacity={0.4} strokeWidth={1.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">
                {e.label}
              </text>
            </g>
          )
        })}
        {GRAPH_NODES.map((n) => (
          <g key={n.id} className="cursor-pointer" onClick={() => open({ name: n.label, kind: NODE_LABEL[n.type] })}>
            <circle cx={n.x} cy={n.y} r={R} fill={NODE_COLOR[n.type]} fillOpacity={0.18} stroke={NODE_COLOR[n.type]} strokeWidth={n.risk ? 2.5 : 1.5} />
            {n.risk && <circle cx={n.x + R - 4} cy={n.y - R + 4} r={5} fill="#ef4444" />}
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-foreground)">
              {NODE_LABEL[n.type]}
            </text>
            <text x={n.x} y={n.y + R + 14} textAnchor="middle" fontSize={11} fill="var(--color-foreground)">
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute top-3 left-3 flex flex-wrap gap-2 rounded-lg border border-border bg-card/90 p-2 backdrop-blur">
        {Object.entries(NODE_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1 text-xs">
            <span className="size-2.5 rounded-full" style={{ background: NODE_COLOR[k as GraphNode["type"]] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function TimelineView() {
  const LEVEL = {
    info: "bg-sky-500",
    warn: "bg-amber-500",
    danger: "bg-red-500",
  }
  return (
    <div className="h-full overflow-auto p-6">
      <ol className="relative mx-auto max-w-2xl space-y-5 border-l-2 border-border pl-6">
        {TIMELINE.map((t, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full ${LEVEL[t.level]} ring-4 ring-card`} />
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{t.time}</span>
              {t.level === "danger" && <Badge variant="danger">高风险</Badge>}
              {t.level === "warn" && <Badge variant="warning">可疑</Badge>}
            </div>
            <div className="text-sm font-medium">{t.title}</div>
            <div className="text-sm text-muted-foreground">{t.detail}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MapView() {
  const points = [
    { x: "28%", y: "42%", risk: false },
    { x: "62%", y: "35%", risk: true },
    { x: "70%", y: "60%", risk: false },
    { x: "45%", y: "68%", risk: true },
    { x: "55%", y: "50%", risk: false },
  ]
  return (
    <div className="relative h-full min-h-[440px] overflow-hidden bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:40px_40px]">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-emerald-500/5" />
      <div className="absolute top-3 left-3 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
        <MapIcon className="mr-1 inline size-3.5" /> 地理空间分布 · 5 个热点
      </div>
      {points.map((p, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: p.x, top: p.y }}
        >
          <span className={`block size-3 rounded-full ${p.risk ? "bg-red-500" : "bg-emerald-500"}`} />
          <span className={`absolute inset-0 animate-ping rounded-full ${p.risk ? "bg-red-500/60" : "bg-emerald-500/60"}`} />
        </span>
      ))}
    </div>
  )
}
