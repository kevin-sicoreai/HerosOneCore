"use client"

import * as React from "react"
import { BoxesIcon, FilterIcon, SearchIcon } from "lucide-react"

import { DEVICE_ROWS } from "@/lib/mock"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"

const OBJECT_TYPES = [
  { name: "设备 Device", count: "12,480", active: true },
  { name: "订单 Order", count: "1.2M" },
  { name: "供应商 Supplier", count: "3,120" },
  { name: "传感器 Sensor", count: "48,900" },
  { name: "站点 Site", count: "260" },
]

const STATUS_VARIANT = {
  运行: "success",
  告警: "warning",
  停机: "danger",
} as const

export default function ExplorerPage() {
  const { open } = useResourceDrawer()
  const [q, setQ] = React.useState("")
  const rows = DEVICE_ROWS.filter(
    (r) => r.id.toLowerCase().includes(q.toLowerCase()) || r.model.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="对象浏览器"
        desc="浏览本体对象的真实实例，点击任一对象查看详情与治理"
        icon={<BoxesIcon />}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* Filter rail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">对象类型</div>
            <div className="space-y-0.5">
              {OBJECT_TYPES.map((t) => (
                <button
                  key={t.name}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                    t.active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FilterIcon className="size-3.5" /> 过滤
            </div>
            {["状态 = 告警", "故障率 > 5%", "站点 = 华东"].map((f) => (
              <label key={f} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" className="accent-emerald-500" /> {f}
              </label>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索设备 ID / 型号…"
                className="h-8 w-full rounded-lg border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">{rows.length} 个对象</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium">设备 ID</th>
                  <th className="px-3 py-2 text-left font-medium">型号</th>
                  <th className="px-3 py-2 text-left font-medium">站点</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th className="px-3 py-2 text-right font-medium">故障率</th>
                  <th className="px-3 py-2 text-right font-medium">最近上报</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => open({ name: r.id, kind: "设备对象" })}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                  >
                    <td className="px-3 py-2 font-mono text-emerald-500">{r.id}</td>
                    <td className="px-3 py-2">{r.model}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.site}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${r.failureRate > 5 ? "text-red-500" : ""}`}>
                      {r.failureRate}%
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{r.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
