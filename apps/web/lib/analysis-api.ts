// Client for the analysis service. Direct connection for now; this moves
// behind the gateway once it exists.

export const ANALYSIS_API =
  process.env.NEXT_PUBLIC_ANALYSIS_API_URL ?? "/api/analysis"

export type AnalysisColumn = {
  name: string
  label: string
  kind: "dimension" | "measure"
  data_type?: string | null
}

export type AnalysisTable = {
  name: string
  label: string
  desc: string
  row_count: number
  columns: AnalysisColumn[]
}

export type MetricAgg = "sum" | "avg" | "count" | "max" | "min"

export type MetricSpec = {
  field: string
  agg: MetricAgg
}

export type FilterOp = "eq" | "neq" | "gt" | "lt" | "contains"

export type FilterSpec = {
  field: string
  op: FilterOp
  value: string
}

export type AnalyzeRequest = {
  table: string
  group_by: string | null
  metrics: MetricSpec[]
  filters: FilterSpec[]
  // Detail-mode pagination + sorting; ignored by the service in aggregate mode.
  page?: number
  page_size?: number
  order_by?: string | null
  order_dir?: "asc" | "desc"
}

export type AnalyzeResult = {
  mode: "aggregate" | "detail"
  columns: string[]
  // aggregate: { group, m0, ... }; detail: raw record keyed by column name.
  rows: Array<Record<string, number | string | null>>
  totals: number[]
  matched_rows: number
  // Detail-mode pagination echo; page_size 0 = aggregate mode (not applicable).
  page: number
  page_size: number
}

// --- Metric (cube) layer: named business measures, cross-object joins ---

export type MetricDimension = {
  key: string
  label: string
}

// A named business metric from the cube layer. `agg` is informational for the
// UI (rate renders as %, sum/count as a number); the join is resolved server-side.
export type Metric = {
  key: string
  label: string
  description: string
  base_type: string
  base_label: string
  agg: "sum" | "avg" | "count" | "min" | "max" | "rate"
  unit: string
  dimensions: MetricDimension[]
}

export type MetricQueryRequest = {
  metric: string
  dimension?: string | null
  filters?: FilterSpec[]
  limit?: number
}

export type MetricGroupRow = {
  group: string
  value: number
}

export type MetricQueryResult = {
  metric_key: string
  metric_label: string
  dimension_key: string | null
  dimension_label: string | null
  agg: string
  unit: string
  // One row per group, sorted by value desc; chart-ready.
  rows: MetricGroupRow[]
  total: number
  matched_rows: number
  meta: Record<string, unknown>
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ANALYSIS_API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

export const analysisApi = {
  tables: () => req<AnalysisTable[]>("/tables"),
  analyze: (body: AnalyzeRequest) =>
    req<AnalyzeResult>("/analyze", { method: "POST", body: JSON.stringify(body) }),
  metrics: () => req<Metric[]>("/metrics"),
  queryMetric: (body: MetricQueryRequest) =>
    req<MetricQueryResult>("/metrics/query", { method: "POST", body: JSON.stringify(body) }),
}
