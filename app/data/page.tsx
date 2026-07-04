"use client"

import { CircleCheckIcon, DatabaseIcon, PlusIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"

import { CONNECTOR_CATALOG, CONNECTORS, type Connector } from "@/lib/mock"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function statusUi(s: Connector["status"]) {
  if (s === "已连接") return { variant: "success" as const, icon: CircleCheckIcon }
  if (s === "同步中") return { variant: "info" as const, icon: RefreshCwIcon }
  return { variant: "danger" as const, icon: TriangleAlertIcon }
}

export default function DataPage() {
  const { open } = useResourceDrawer()
  return (
    <PageContainer>
      <PageHeading
        title="数据接入"
        desc="连接各类数据源，供本体与管道消费"
        icon={<DatabaseIcon />}
        actions={
          <Button size="sm">
            <PlusIcon /> 新建连接
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>已配置连接器 ({CONNECTORS.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-y border-border">
                <th className="px-4 py-2 text-left font-medium">名称</th>
                <th className="px-4 py-2 text-left font-medium">类型</th>
                <th className="px-4 py-2 text-left font-medium">状态</th>
                <th className="px-4 py-2 text-right font-medium">记录量</th>
                <th className="px-4 py-2 text-right font-medium">频率</th>
              </tr>
            </thead>
            <tbody>
              {CONNECTORS.map((c) => {
                const s = statusUi(c.status)
                return (
                  <tr
                    key={c.id}
                    onClick={() => open({ name: c.name, kind: "连接器" })}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.type}</td>
                    <td className="px-4 py-2">
                      <Badge variant={s.variant}>
                        <s.icon /> {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{c.records}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.freq}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div>
        <div className="mb-2 text-sm font-medium text-muted-foreground">连接器目录</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {CONNECTOR_CATALOG.map((c) => (
            <button
              key={c}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-colors hover:border-emerald-500/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                {c.slice(0, 2)}
              </span>
              <span className="text-xs">{c}</span>
            </button>
          ))}
        </div>
      </div>
    </PageContainer>
  )
}
