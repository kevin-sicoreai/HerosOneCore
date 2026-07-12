"use client"

import * as React from "react"
import { GaugeIcon, Loader2Icon, DatabaseIcon } from "lucide-react"

import { analysisApi, type MetricSemantics } from "@/lib/analysis-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Human-readable labels for the aggregation kind.
const AGG_LABEL: Record<string, string> = {
  sum: "求和",
  avg: "平均",
  count: "计数",
  max: "最大值",
  min: "最小值",
  rate: "占比",
}

// Read-only semantic (口径) catalog. No actions — this page only explains how
// each metric is defined, its dimensions and whether it is Cube-mapped.
export default function MetricsSemanticsPage() {
  const [metrics, setMetrics] = React.useState<MetricSemantics[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    ;(async () => {
      try {
        setMetrics(await analysisApi.metricSemantics())
      } catch (e) {
        setError(String((e as Error).message))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const engineDefault = metrics[0]?.engine_default ?? null

  return (
    <PageContainer>
      <PageHeading
        title="指标语义"
        desc="指标口径 · 维度 · Cube 映射（只读）"
        icon={<GaugeIcon />}
        actions={
          engineDefault && (
            <Badge variant={engineDefault === "cube" ? "brand" : "secondary"}>
              默认引擎：{engineDefault === "cube" ? "Cube" : "自研引擎"}
            </Badge>
          )
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> 加载中…
        </div>
      ) : metrics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          暂无指标定义。
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-3">
          {metrics.map((m) => (
            <Card key={m.key} className="gap-3">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-sm font-medium">{m.label}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {m.key}
                  </code>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Badge variant="outline">{AGG_LABEL[m.agg] ?? m.agg}</Badge>
                    {m.unit && <Badge variant="outline">单位 {m.unit}</Badge>}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{m.description}</p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <DatabaseIcon className="size-3.5" /> 来源对象：{m.base_label}
                  </span>
                  {m.cube.mapped ? (
                    <Badge variant="brand" title={m.cube.measure ?? undefined}>
                      Cube 映射：{m.cube.measure}
                    </Badge>
                  ) : (
                    <Badge variant="warning">自研引擎</Badge>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">可用维度</div>
                  {m.dimensions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">无</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {m.dimensions.map((d) => (
                        <span
                          key={d.key}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs"
                          title={`映射列：${d.mapped_column}`}
                        >
                          {d.label}
                          <code className="font-mono text-[10px] text-muted-foreground">
                            {d.mapped_column}
                          </code>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
