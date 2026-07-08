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
}

export type AnalyzeResult = {
  mode: "aggregate" | "detail"
  columns: string[]
  // aggregate: { group, m0, ... }; detail: raw record keyed by column name.
  rows: Array<Record<string, number | string | null>>
  totals: number[]
  matched_rows: number
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
}
