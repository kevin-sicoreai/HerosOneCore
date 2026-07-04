"use client"

import * as React from "react"
import {
  BlocksIcon,
  ChartColumnIcon,
  GaugeIcon,
  SquareMousePointerIcon,
  TableIcon,
  TypeIcon,
} from "lucide-react"

import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const WIDGETS = [
  { key: "heading", label: "标题", icon: TypeIcon },
  { key: "metric", label: "指标卡", icon: GaugeIcon },
  { key: "chart", label: "图表", icon: ChartColumnIcon },
  { key: "table", label: "对象表", icon: TableIcon },
  { key: "button", label: "操作按钮", icon: SquareMousePointerIcon },
]

export default function AppBuilderPage() {
  const [selected, setSelected] = React.useState("metric")

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="应用构建器"
        desc="低代码搭建业务应用 —— 页面 · 区块 · 组件，绑定本体对象"
        icon={<BlocksIcon />}
        actions={
          <>
            <Button variant="outline" size="sm">预览</Button>
            <Button size="sm">发布</Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr_260px] gap-4">
        {/* Widget palette */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">组件</div>
          <div className="space-y-1.5">
            {WIDGETS.map((w) => (
              <div
                key={w.key}
                className="flex cursor-grab items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm transition-colors hover:border-emerald-500/40 active:cursor-grabbing"
              >
                <w.icon className="size-4 text-muted-foreground" />
                {w.label}
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="min-h-[440px] overflow-auto rounded-xl border border-border bg-muted/20 p-5">
          <div className="mx-auto max-w-2xl space-y-3">
            {/* module header */}
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="text-base font-semibold">运营指挥台</div>
              <div className="text-xs text-muted-foreground">模块 Header · 跨页面持久</div>
            </div>
            {/* metric row */}
            <div
              onClick={() => setSelected("metric")}
              className={`grid grid-cols-3 gap-3 rounded-lg border-2 border-dashed p-3 ${
                selected === "metric" ? "border-emerald-500" : "border-border"
              }`}
            >
              {["订单履约率 94.2%", "设备可用率 98.1%", "在途订单 12,904"].map((m) => (
                <div key={m} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="text-xs text-muted-foreground">{m.split(" ")[0]}</div>
                  <div className="text-lg font-semibold">{m.split(" ")[1]}</div>
                </div>
              ))}
            </div>
            {/* chart + table section */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setSelected("chart")}
                className={`flex h-40 items-end gap-1.5 rounded-lg border-2 border-dashed bg-card p-3 ${
                  selected === "chart" ? "border-emerald-500" : "border-border"
                }`}
              >
                {[40, 65, 52, 78, 60, 88, 72].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-emerald-500/70" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div
                onClick={() => setSelected("table")}
                className={`h-40 rounded-lg border-2 border-dashed bg-card p-3 ${
                  selected === "table" ? "border-emerald-500" : "border-border"
                }`}
              >
                <div className="space-y-1.5">
                  {["DV-10231", "DV-10240", "DV-10255"].map((r) => (
                    <div key={r} className="flex justify-between border-b border-border/60 py-1 text-xs">
                      <span className="font-mono text-emerald-500">{r}</span>
                      <span className="text-muted-foreground">告警</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Config panel */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">组件配置</div>
          <Badge variant="brand" className="mb-3">{WIDGETS.find((w) => w.key === selected)?.label ?? "组件"}</Badge>
          <div className="space-y-2 text-sm">
            <Field label="绑定对象" value="设备 Device" />
            <Field label="数据源" value="pipeline_maintenance" />
            <Field label="刷新" value="实时" />
            <Field label="宽度" value="1/3 列" />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="rounded-md border border-border px-2.5 py-1.5 text-sm">{value}</div>
    </div>
  )
}
