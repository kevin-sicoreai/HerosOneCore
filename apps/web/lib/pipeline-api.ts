// Client for the pipeline service. Direct connection for now; moves behind the
// gateway later.

export const PIPELINE_API =
  process.env.NEXT_PUBLIC_PIPELINE_API_URL ?? "/api/pipeline"

export type StepKind = "source" | "transform" | "join" | "output"

export type Pipeline = {
  id: string
  name: string
  description: string | null
  status: string
  schedule: string | null
}

export type GraphStep = {
  id: string
  kind: StepKind
  config: Record<string, unknown>
  label: string | null
  x: number
  y: number
}

export type GraphEdge = { from_step: string; to_step: string }

export type Graph = { steps: GraphStep[]; edges: GraphEdge[] }

export type StepRun = { step_id: string; status: string; duration_ms: number | null; message: string | null }

export type Run = {
  id: string
  pipeline_id: string
  status: string
  started_at: string | null
  finished_at: string | null
  error: string | null
  step_runs?: StepRun[]
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PIPELINE_API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const pipelineApi = {
  list: () => req<Pipeline[]>("/pipelines"),
  create: (name: string) =>
    req<Pipeline>("/pipelines", { method: "POST", body: JSON.stringify({ name }) }),
  graph: (id: string) => req<Graph>(`/pipelines/${id}/graph`),
  putGraph: (id: string, graph: Graph) =>
    req<Graph>(`/pipelines/${id}/graph`, { method: "PUT", body: JSON.stringify(graph) }),
  validate: (id: string) =>
    req<{ ok: boolean; message: string }>(`/pipelines/${id}/validate`, { method: "POST" }),
  runs: (id: string) => req<Run[]>(`/pipelines/${id}/runs`),
  run: (id: string) => req<Run>(`/pipelines/${id}/run`, { method: "POST" }),
  getRun: (runId: string) => req<Run>(`/runs/${runId}`),
  remove: (id: string) => req<void>(`/pipelines/${id}`, { method: "DELETE" }),
}
