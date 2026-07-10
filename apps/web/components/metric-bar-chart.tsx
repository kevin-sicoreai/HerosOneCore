// Horizontal bar-chart card for a single metric breakdown, rendered under an
// AIP assist answer. Its data comes straight from the query_metric tool result
// (relayed over SSE), never re-narrated by the model, so the numbers cannot
// drift from what the metric layer computed.
//
// Styling deliberately mirrors the analysis page's chart lens (analysis/page.tsx
// ChartCanvas / DashboardChartPanel): emerald bars, name-left / bar-centre /
// value-right, tabular-nums. It is kept compact (text-xs/sm, narrower label /
// value columns) so it sits comfortably inside a chat bubble. This component is
// intentionally standalone — the analysis page is not refactored to consume it.

import type { ChartPayload } from "@/lib/assist-api"

// Value formatting kept in lockstep with analysis/page.tsx `formatValue` /
// `formatMetricValue`, so a metric shown here reads identically to the
// analysis workbench (rate → %, currency → ¥ prefix, count units appended).
function formatValue(v: number | string): string {
  if (typeof v !== "number") return String(v)
  return v >= 1000 ? v.toLocaleString() : String(v)
}

function formatMetricValue(value: number, agg: string, unit: string): string {
  if (agg === "rate" || unit === "%") return `${value}%`
  const s = formatValue(value)
  if (unit === "¥") return `¥${s}`
  if (unit === "单" || unit === "个") return `${s} ${unit}`
  return s
}

export function MetricBarChart({ title, unit, agg, rows }: ChartPayload) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return (
    <div>
      <div className="mb-2 truncate text-xs text-muted-foreground" title={title}>
        {title}
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          // Minimum 1% width keeps a non-zero bar visible for tiny values.
          const pct = max > 0 ? Math.max((r.value / max) * 100, 1) : 0
          return (
            <div key={r.group} className="group flex items-center gap-2.5">
              <div
                className="w-20 shrink-0 truncate text-right text-xs text-muted-foreground"
                title={r.group}
              >
                {r.group}
              </div>
              <div className="relative h-4.5 min-w-0 flex-1 rounded-md bg-muted/40">
                <div
                  className="h-full rounded-md bg-emerald-500/80 transition-colors group-hover:bg-emerald-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
                {formatMetricValue(r.value, agg ?? "", unit ?? "")}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
