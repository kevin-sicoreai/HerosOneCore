"use client"

import { useCallback, useEffect, useState } from "react"
import {
  CircleCheckIcon,
  CircleDashedIcon,
  DatabaseIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  dataApi,
  type Connector,
  type ConnectorStatus,
  type ConnectorType,
  type Dataset,
} from "@/lib/data-api"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const STATUS_UI: Record<
  ConnectorStatus,
  { label: string; variant: "success" | "info" | "danger" | "secondary"; icon: typeof CircleCheckIcon }
> = {
  connected: { label: "已连接", variant: "success", icon: CircleCheckIcon },
  syncing: { label: "同步中", variant: "info", icon: RefreshCwIcon },
  error: { label: "错误", variant: "danger", icon: TriangleAlertIcon },
  idle: { label: "未同步", variant: "secondary", icon: CircleDashedIcon },
}

export default function DataPage() {
  const { open } = useResourceDrawer()
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [types, setTypes] = useState<ConnectorType[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [c, t, d] = await Promise.all([
        dataApi.connectors(),
        dataApi.connectorTypes(),
        dataApi.datasets(),
      ])
      setConnectors(c)
      setTypes(t)
      setDatasets(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const typeLabel = (sourceType: string) =>
    types.find((t) => t.type === sourceType)?.display_name ?? sourceType

  const isSupported = (sourceType: string) =>
    types.find((t) => t.type === sourceType)?.supported ?? false

  const canSync = (c: Connector) =>
    isSupported(c.source_type) && Object.keys(c.config ?? {}).length > 0

  const recordsFor = (connectorId: string) => {
    const rows = datasets
      .filter((d) => d.connector_id === connectorId)
      .reduce((sum, d) => sum + (d.row_count ?? 0), 0)
    return rows > 0 ? rows.toLocaleString() : "—"
  }

  const handleSync = async (id: string) => {
    setBusy(id)
    try {
      await dataApi.sync(id)
      // Give the background sync a moment, then refresh to show the new status.
      setTimeout(load, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : "同步失败")
    } finally {
      setBusy(null)
    }
  }

  return (
    <PageContainer>
      <PageHeading
        title="数据接入"
        desc="连接各类数据源，供本体与管道消费"
        icon={<DatabaseIcon />}
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCwIcon /> 刷新
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          无法连接 data 服务：{error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>已配置连接器 ({connectors.length})</CardTitle>
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
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    加载中…
                  </td>
                </tr>
              )}
              {!loading && connectors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    暂无连接器
                  </td>
                </tr>
              )}
              {connectors.map((c) => {
                const s = STATUS_UI[c.status]
                return (
                  <tr
                    key={c.id}
                    onClick={() => open({ name: c.name, kind: "连接器" })}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{typeLabel(c.source_type)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={s.variant}>
                        <s.icon /> {s.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{recordsFor(c.id)}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {c.schedule ?? "手动"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canSync(c) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === c.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSync(c.id)
                          }}
                        >
                          <RefreshCwIcon /> {busy === c.id ? "触发中…" : "同步"}
                        </Button>
                      )}
                    </td>
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
          {types.map((t) => (
            <button
              key={t.type}
              title={t.supported ? "已支持" : "即将支持"}
              className={
                "flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-colors hover:border-emerald-500/40 " +
                (t.supported ? "" : "opacity-50")
              }
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                {t.display_name.slice(0, 2)}
              </span>
              <span className="text-xs">{t.display_name}</span>
            </button>
          ))}
        </div>
      </div>
    </PageContainer>
  )
}
