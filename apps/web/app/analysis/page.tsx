"use client"

import { RadarIcon } from "lucide-react"

import { DEVICE_ROWS } from "@/lib/mock"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"

const METRICS = [
  { k: "订单履约率", v: "94.2%", d: "+1.8%" },
  { k: "设备可用率", v: "98.1%", d: "-0.3%" },
  { k: "平均故障率", v: "3.4%", d: "+0.6%" },
  { k: "在途订单", v: "12,904", d: "+320" },
]

export default function AnalysisPage() {
  const { open } = useResourceDrawer()

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="分析工作台"
        desc="基于本体的企业分析 · 指标与对象数据"
        icon={<RadarIcon />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {METRICS.map((m) => (
          <div key={m.k} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{m.k}</div>
            <div className="text-xl font-semibold">{m.v}</div>
            <div className="text-xs text-emerald-500">{m.d}</div>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">设备 ID</th>
              <th className="px-4 py-2 text-left font-medium">型号</th>
              <th className="px-4 py-2 text-left font-medium">站点</th>
              <th className="px-4 py-2 text-right font-medium">故障率</th>
            </tr>
          </thead>
          <tbody>
            {DEVICE_ROWS.map((r) => (
              <tr
                key={r.id}
                onClick={() => open({ name: r.id, kind: "设备对象" })}
                className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/50"
              >
                <td className="px-4 py-2 font-mono text-emerald-500">{r.id}</td>
                <td className="px-4 py-2">{r.model}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.site}</td>
                <td className={`px-4 py-2 text-right ${r.failureRate > 5 ? "text-red-500" : ""}`}>{r.failureRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  )
}
