// Client for the analysis service. Direct connection for now; this moves
// behind the gateway once it exists.

import { getToken } from "@/lib/auth-api"

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

export type FilterOp = "eq" | "neq" | "gt" | "lt" | "contains" | "in"

export type FilterSpec = {
  field: string
  op: FilterOp
  // Scalar for eq/neq/gt/lt/contains; a list of candidate values for "in".
  value: string | string[]
}

export type AnalyzeRequest = {
  table: string
  group_by: string | null
  metrics: MetricSpec[]
  filters: FilterSpec[]
  // Aggregate mode: cap on the number of groups returned (default 50 server-side).
  limit?: number
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

// --- Saved analyses (Contour-style recipes) ---

// One replayable step of the analysis path. A "source" step is a handoff from
// the object browser: its `filters` (facet + any pivot `in`) are themselves the
// recipe. A "pivot" step is a set-level "search around": it stores the link id +
// direction + the user filters active when it was taken, so it can be recompiled
// against current data (never the compiled key list).
export type SavedPathStep =
  | { kind: "source"; desc: string; table: string; filters: FilterSpec[] }
  | { kind: "pivot"; linkId: string; reverse: boolean; linkLabel: string; stepFilters: FilterSpec[] }

// The transparent recipe stored per saved analysis. Re-opening re-runs it
// against current data, so values may differ — that is the intended semantics.
export type AnalysisDefinition = {
  // The base object type the path starts from (equals the active type when the
  // path is empty).
  table: string
  lens: string
  groupBy: string
  metrics: MetricSpec[]
  // User (workbench) filters on the active object set.
  filters: FilterSpec[]
  path: SavedPathStep[]
}

export type SavedAnalysisSummary = {
  id: string
  name: string
  owner: string | null
  updated_at: string
}

export type SavedAnalysisDetail = SavedAnalysisSummary & {
  created_at: string
  definition: AnalysisDefinition
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // Carry the caller's token so the service can identify them: detail-mode
  // /analyze masks sensitive columns (e.g. 月薪) for non-admins, so an admin
  // must present their Bearer token to see plaintext. Writes to /analyses also
  // rely on it for ownership.
  const token = getToken()
  const res = await fetch(`${ANALYSIS_API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  // 204 (DELETE) has no body to parse.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const analysisApi = {
  tables: () => req<AnalysisTable[]>("/tables"),
  analyze: (body: AnalyzeRequest) =>
    req<AnalyzeResult>("/analyze", { method: "POST", body: JSON.stringify(body) }),
  metrics: () => req<Metric[]>("/metrics"),
  queryMetric: (body: MetricQueryRequest) =>
    req<MetricQueryResult>("/metrics/query", { method: "POST", body: JSON.stringify(body) }),

  // Saved analyses CRUD (Bearer carried by req).
  listAnalyses: () => req<SavedAnalysisSummary[]>("/analyses"),
  getAnalysis: (id: string) => req<SavedAnalysisDetail>(`/analyses/${id}`),
  createAnalysis: (body: { name: string; definition: AnalysisDefinition }) =>
    req<SavedAnalysisDetail>("/analyses", { method: "POST", body: JSON.stringify(body) }),
  updateAnalysis: (id: string, body: { name?: string; definition?: AnalysisDefinition }) =>
    req<SavedAnalysisDetail>(`/analyses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAnalysis: (id: string) => req<void>(`/analyses/${id}`, { method: "DELETE" }),
}
