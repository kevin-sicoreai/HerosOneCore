"use client"

// Platform-reviewed Puck component library (v1). These are the only blocks a
// user can place on an app canvas — no arbitrary HTML/JS. Every data block
// fetches through the existing platform APIs (analysisApi), so numbers stay in
// lockstep with the analysis workbench and honour the same governance.
//
// Puck fields are static, but our selects need live options (metrics, object
// types). The platform pattern: the page loads metrics + tables first, then
// calls `buildConfig(metrics, tables)` to mint a config whose select options
// are already populated. The metric -> dimension dependency uses Puck's
// `resolveFields` so the dimension dropdown re-derives from the chosen metric.

import * as React from "react"
import { Loader2Icon } from "lucide-react"
import type { Config } from "@measured/puck"

import {
  analysisApi,
  type AnalysisTable,
  type Metric,
  type MetricQueryResult,
  type AnalyzeResult,
} from "@/lib/analysis-api"
import { MetricBarChart } from "@/components/metric-bar-chart"

// --- shared value formatting (mirrors app/analysis/page.tsx) ---

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

// --- shared async-fetch helper with loading / error states ---

type AsyncState<T> = { loading: boolean; error: string | null; data: T | null }

function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList): AsyncState<T> {
  const [state, setState] = React.useState<AsyncState<T>>({
    loading: true,
    error: null,
    data: null,
  })
  React.useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => active && setState({ loading: false, error: null, data }))
      .catch((e) => active && setState({ loading: false, error: String(e?.message ?? e), data: null }))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2Icon className="size-3.5 animate-spin" /> 加载中…
    </div>
  )
}

function ErrorText({ msg }: { msg: string }) {
  return <div className="text-xs text-red-500">加载失败：{msg}</div>
}

// Outer shell shared by every block, per the platform layout rule.
function BlockCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-4">{children}</div>
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>
}

// --- block render components ---

function MetricCardRender({ metricKey }: { metricKey?: string }) {
  const { loading, error, data } = useAsync<MetricQueryResult | null>(
    () => (metricKey ? analysisApi.queryMetric({ metric: metricKey }) : Promise.resolve(null)),
    [metricKey]
  )
  return (
    <BlockCard>
      {!metricKey ? (
        <EmptyHint>请选择一个指标</EmptyHint>
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <ErrorText msg={error} />
      ) : data ? (
        <>
          <div className="truncate text-xs text-muted-foreground" title={data.metric_label}>
            {data.metric_label}
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {formatMetricValue(data.total, data.agg, data.unit)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            基于 {data.matched_rows.toLocaleString()} 个对象
          </div>
        </>
      ) : null}
    </BlockCard>
  )
}

function MetricChartRender({
  metricKey,
  dimensionKey,
  limit,
}: {
  metricKey?: string
  dimensionKey?: string
  limit?: number
}) {
  const { loading, error, data } = useAsync<MetricQueryResult | null>(
    () =>
      metricKey
        ? analysisApi.queryMetric({
            metric: metricKey,
            dimension: dimensionKey || null,
            limit: limit && limit > 0 ? limit : 8,
          })
        : Promise.resolve(null),
    [metricKey, dimensionKey, limit]
  )
  return (
    <BlockCard>
      {!metricKey ? (
        <EmptyHint>请选择一个指标</EmptyHint>
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <ErrorText msg={error} />
      ) : data && data.rows.length > 0 ? (
        <MetricBarChart
          title={data.dimension_label ? `${data.metric_label} · 按${data.dimension_label}` : data.metric_label}
          unit={data.unit}
          agg={data.agg}
          rows={data.rows}
        />
      ) : (
        <EmptyHint>该指标在此维度下无数据</EmptyHint>
      )}
    </BlockCard>
  )
}

function ObjectTableRender({
  objectType,
  pageSize,
  tables,
}: {
  objectType?: string
  pageSize?: number
  tables: AnalysisTable[]
}) {
  const size = pageSize && pageSize > 0 ? pageSize : 10
  const { loading, error, data } = useAsync<AnalyzeResult | null>(
    () =>
      objectType
        ? analysisApi.analyze({
            table: objectType,
            group_by: null,
            metrics: [],
            filters: [],
            page: 1,
            page_size: size,
          })
        : Promise.resolve(null),
    [objectType, size]
  )
  // Detail rows are keyed by column NAME, while the result's `columns` array
  // carries display labels — cells must be read via the schema's names (the
  // schema also supplies the Chinese header labels).
  const schemaCols = React.useMemo(() => {
    const t = tables.find((tt) => tt.name === objectType)
    return t?.columns ?? []
  }, [tables, objectType])

  return (
    <BlockCard>
      {!objectType ? (
        <EmptyHint>请选择一个对象类型</EmptyHint>
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <ErrorText msg={error} />
      ) : data && data.rows.length > 0 && schemaCols.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {schemaCols.map((c) => (
                  <th key={c.name} className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  {schemaCols.map((c) => (
                    <td key={c.name} className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                      {row[c.name] === null || row[c.name] === undefined ? "—" : String(row[c.name])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyHint>暂无明细数据</EmptyHint>
      )}
    </BlockCard>
  )
}

function TextBlockRender({ title, body }: { title?: string; body?: string }) {
  return (
    <BlockCard>
      {title && <div className="mb-1 text-base font-semibold">{title}</div>}
      {body && <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{body}</p>}
      {!title && !body && <EmptyHint>文本卡（设置标题与正文）</EmptyHint>}
    </BlockCard>
  )
}

function DividerRender({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      {label && <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

// --- config factory ---

// Builds a Puck config with live select options. Call after loading metrics
// and tables so the field dropdowns show real, platform-approved choices.
export function buildConfig(metrics: Metric[], tables: AnalysisTable[]): Config {
  const metricOptions = metrics.map((m) => ({ label: m.label, value: m.key }))
  const tableOptions = tables.map((t) => ({ label: t.label, value: t.name }))

  return {
    root: {
      // Single-column flow; the runtime page provides the outer padding.
      render: ({ children }: { children?: React.ReactNode }) => (
        <div className="flex flex-col gap-4">{children}</div>
      ),
    },
    // Renders are wrapped in un-annotated arrows so Puck infers its own props
    // shape here, and we forward just the fields our typed components expect
    // (dropping Puck internals like `id` / `puck`).
    components: {
      MetricCard: {
        label: "指标卡",
        fields: {
          metricKey: { type: "select", label: "指标", options: metricOptions },
        },
        defaultProps: { metricKey: metrics[0]?.key ?? "" },
        render: (props) => <MetricCardRender metricKey={props.metricKey} />,
      },
      MetricChart: {
        label: "指标图",
        fields: {
          metricKey: { type: "select", label: "指标", options: metricOptions },
          dimensionKey: { type: "select", label: "分组维度", options: [] },
          limit: { type: "number", label: "最多显示组数", min: 1 },
        },
        defaultProps: { metricKey: metrics[0]?.key ?? "", dimensionKey: "", limit: 8 },
        // Metric -> dimension linkage: re-derive the dimension options from the
        // selected metric each time fields resolve.
        resolveFields: (data: { props: { metricKey?: string } }) => {
          const m = metrics.find((mm) => mm.key === data.props.metricKey)
          const dimOptions = [
            { label: "（不分组）", value: "" },
            ...(m?.dimensions ?? []).map((d) => ({ label: d.label, value: d.key })),
          ]
          return {
            metricKey: { type: "select", label: "指标", options: metricOptions },
            dimensionKey: { type: "select", label: "分组维度", options: dimOptions },
            limit: { type: "number", label: "最多显示组数", min: 1 },
          }
        },
        render: (props) => (
          <MetricChartRender
            metricKey={props.metricKey}
            dimensionKey={props.dimensionKey}
            limit={props.limit}
          />
        ),
      },
      ObjectTable: {
        label: "对象明细表",
        fields: {
          objectType: { type: "select", label: "对象类型", options: tableOptions },
          pageSize: { type: "number", label: "每页行数", min: 1 },
        },
        defaultProps: { objectType: tables[0]?.name ?? "", pageSize: 10 },
        render: (props) => (
          <ObjectTableRender objectType={props.objectType} pageSize={props.pageSize} tables={tables} />
        ),
      },
      TextBlock: {
        label: "文本卡",
        fields: {
          title: { type: "text", label: "标题" },
          body: { type: "textarea", label: "正文" },
        },
        defaultProps: { title: "标题", body: "" },
        render: (props) => <TextBlockRender title={props.title} body={props.body} />,
      },
      Divider: {
        label: "分组标题",
        fields: {
          label: { type: "text", label: "标题" },
        },
        defaultProps: { label: "分组" },
        render: (props) => <DividerRender label={props.label} />,
      },
    },
  }
}
