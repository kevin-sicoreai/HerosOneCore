// Client for the assist service. Direct connection for now; this moves behind
// the gateway once it exists.

export const ASSIST_API =
  process.env.NEXT_PUBLIC_ASSIST_API_URL ?? "/api/assist"

export type TraceIcon = "search" | "compute" | "cite" | "model"

export type TraceStep = {
  id: string
  icon: TraceIcon
  text: string
  meta: string
  status: "running" | "done"
}

export type DeviceCard = {
  id: string
  model: string
  site: string
  failureRate: number
}

export type MetricChartRow = {
  group: string
  value: number
}

// A metric bar-chart card emitted under an answer. Built server-side straight
// from the query_metric tool result, so the numbers match the metric layer.
export type ChartPayload = {
  title: string
  unit: string | null
  agg: string | null
  rows: MetricChartRow[]
  total?: number | null
  matched_rows?: number | null
}

export type ChatExtras = {
  sources: string[]
  devices: DeviceCard[]
  // Optional so pre-chart stored messages (no charts field) still parse.
  charts?: ChartPayload[]
}

// --- AI workbench features (analysis page): NL metric query + interpretation.
// Both are one-shot, stateless calls to the assist service's /ai/* endpoints.

// Result of translating a natural-language question into a metric query config.
// The assist service only *picks* the metric/dimension/filters; the frontend
// executes the query itself (carrying the user's token). `error` is a normal
// outcome (no metric fits) rendered inline, not an HTTP failure.
export type AiMetricQueryResult = {
  metric?: string
  metric_label?: string
  dimension?: string | null
  dimension_label?: string | null
  filters?: { field: string; value: string }[]
  reason?: string
  error?: string
}

// Payload for AI interpretation: the already-masked aggregate rows the frontend
// is displaying. Assist never fetches raw data — it only narrates these numbers.
export type AiInterpretRequest = {
  title: string
  unit?: string | null
  agg?: string | null
  total?: number | null
  matched_rows?: number | null
  rows: { group: string; value: number | string }[]
  question?: string | null
}

export type ChatSession = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  trace?: TraceStep[] | null
  extras?: ChatExtras | null
  created_at: string
}

export type StreamEvent =
  | ({ type: "step_start" } & TraceStep)
  | { type: "step_end"; id: string; meta: string }
  | { type: "token"; text: string }
  | ({ type: "chart" } & ChartPayload)
  | { type: "done"; message_id: string; sources: string[]; devices: DeviceCard[]; charts?: ChartPayload[] }
  | { type: "error"; message: string }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ASSIST_API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const assistApi = {
  meta: () => req<{ model: string; display_name: string }>("/meta"),
  sessions: () => req<ChatSession[]>("/sessions"),
  createSession: () => req<ChatSession>("/sessions", { method: "POST" }),
  deleteSession: (id: string) => req<void>(`/sessions/${id}`, { method: "DELETE" }),
  messages: (id: string) => req<ChatMessage[]>(`/sessions/${id}/messages`),

  // Translate a natural-language question into a metric query config (the
  // frontend then executes it via analysisApi.queryMetric with the user token).
  aiMetricQuery: (question: string) =>
    req<AiMetricQueryResult>("/ai/metric-query", {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  // Ask the assist service to narrate a set of already-masked aggregate rows.
  aiInterpret: (body: AiInterpretRequest) =>
    req<{ text: string }>("/ai/interpret", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // POSTs the user message and feeds parsed SSE events to the callback until
  // the stream closes.
  async chatStream(
    sessionId: string,
    content: string,
    onEvent: (e: StreamEvent) => void
  ): Promise<void> {
    const res = await fetch(`${ASSIST_API}/sessions/${sessionId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text()}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let sep
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, sep).trim()
        buf = buf.slice(sep + 2)
        if (frame.startsWith("data:")) {
          try {
            onEvent(JSON.parse(frame.slice(5)) as StreamEvent)
          } catch {
            // skip malformed frame
          }
        }
      }
    }
  },
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return days === 1 ? "昨天" : `${days} 天前`
}
