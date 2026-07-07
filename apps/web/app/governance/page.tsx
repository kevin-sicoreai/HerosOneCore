"use client"

import * as React from "react"
import { ClockIcon, KeyIcon, LockIcon, ScrollTextIcon, Share2Icon, ShieldCheckIcon, UsersIcon } from "lucide-react"

import { governanceApi, type AuditEntry, type Lineage, type Role, type Stats } from "@/lib/governance-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TYPE_ORDER = ["connector", "dataset", "pipeline", "mart", "object_type"]
const TYPE_META: Record<string, { label: string; cls: string }> = {
  connector: { label: "连接器", cls: "border-sky-500/60 text-sky-500" },
  dataset: { label: "数据集", cls: "border-emerald-500/60 text-emerald-500" },
  pipeline: { label: "管道", cls: "border-amber-500/60 text-amber-500" },
  mart: { label: "产出表", cls: "border-violet-500/60 text-violet-500" },
  object_type: { label: "对象类型", cls: "border-rose-500/60 text-rose-500" },
}
const COL_W = 200
const ROW_H = 74
const NODE_W = 150
const NODE_H = 50

export default function GovernancePage() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [roles, setRoles] = React.useState<Role[]>([])
  const [lineage, setLineage] = React.useState<Lineage>({ nodes: [], edges: [] })
  const [audit, setAudit] = React.useState<AuditEntry[]>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    ;(async () => {
      try {
        const [s, r, l, a] = await Promise.all([
          governanceApi.stats(), governanceApi.roles(), governanceApi.lineage(), governanceApi.audit(),
        ])
        setStats(s); setRoles(r); setLineage(l); setAudit(a)
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败")
      }
    })()
  }, [])

  // layout lineage nodes into columns by type
  const positions = React.useMemo(() => {
    const rows: Record<string, number> = {}
    const pos: Record<string, { x: number; y: number }> = {}
    for (const n of lineage.nodes) {
      const col = Math.max(0, TYPE_ORDER.indexOf(n.type))
      const row = rows[n.type] ?? 0
      rows[n.type] = row + 1
      pos[n.id] = { x: 20 + col * COL_W, y: 20 + row * ROW_H }
    }
    return pos
  }, [lineage])

  const cards = [
    { k: "受控资源", v: stats?.governed_assets ?? "—", icon: LockIcon },
    { k: "角色", v: stats?.roles ?? "—", icon: UsersIcon },
    { k: "审计事件", v: stats?.audit_events ?? "—", icon: ScrollTextIcon },
    { k: "加密覆盖", v: stats?.encryption_coverage ?? "—", icon: KeyIcon },
  ]
  const canvasH = 40 + Math.max(1, ...TYPE_ORDER.map((t) => lineage.nodes.filter((n) => n.type === t).length)) * ROW_H

  return (
    <PageContainer>
      <PageHeading
        title="治理后台"
        desc="安全与治理横切全平台 · 权限 · 血缘 · 审计 · 加密合规"
        icon={<ShieldCheckIcon />}
      />

      {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">无法连接 governance 服务：{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((m) => (
          <Card key={m.k} className="py-3">
            <CardContent className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <m.icon className="size-4.5" />
              </span>
              <div>
                <div className="text-xl font-semibold">{m.v}</div>
                <div className="text-xs text-muted-foreground">{m.k}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="lineage">
        <TabsList>
          <TabsTrigger value="lineage"><Share2Icon /> 数据血缘</TabsTrigger>
          <TabsTrigger value="access"><LockIcon /> 权限矩阵</TabsTrigger>
          <TabsTrigger value="audit"><ClockIcon /> 审计日志</TabsTrigger>
        </TabsList>

        <TabsContent value="lineage" className="pt-3">
          <Card>
            <CardHeader><CardTitle>全平台数据血缘（{lineage.nodes.length} 资产 · {lineage.edges.length} 关系）</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-lg border border-border">
                <div className="relative" style={{ width: TYPE_ORDER.length * COL_W + 40, height: canvasH }}>
                  <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
                    <defs>
                      <marker id="ga" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                        <path d="M0,0 L7,3 L0,6" fill="var(--color-muted-foreground)" />
                      </marker>
                    </defs>
                    {lineage.edges.map((e, i) => {
                      const a = positions[e.from_id], b = positions[e.to_id]
                      if (!a || !b) return null
                      const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
                      const x2 = b.x, y2 = b.y + NODE_H / 2
                      const mx = (x1 + x2) / 2
                      return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="var(--color-muted-foreground)" strokeOpacity={0.5} strokeWidth={1.5} markerEnd="url(#ga)" />
                    })}
                  </svg>
                  {lineage.nodes.map((n) => {
                    const p = positions[n.id], m = TYPE_META[n.type]
                    return (
                      <div key={n.id} className={`absolute z-10 flex flex-col justify-center overflow-hidden rounded-lg border-2 bg-card px-2.5 ${m?.cls ?? ""}`} style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}>
                        <div className="truncate text-xs font-semibold text-foreground">{n.label}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{m?.label ?? n.type}</div>
                      </div>
                    )
                  })}
                  {lineage.nodes.length === 0 && !error && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">暂无血缘数据</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="pt-3">
          <Card>
            <CardContent className="px-0">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-y border-border">
                    <th className="px-4 py-2 text-left font-medium">角色</th>
                    <th className="px-4 py-2 text-left font-medium">成员</th>
                    <th className="px-4 py-2 text-center font-medium">读</th>
                    <th className="px-4 py-2 text-center font-medium">写</th>
                    <th className="px-4 py-2 text-center font-medium">管理</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((g) => (
                    <tr key={g.name} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-medium">{g.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{g.members} 人</td>
                      <Cell on={g.can_read} /><Cell on={g.can_write} /><Cell on={g.can_admin} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="pt-3">
          <Card>
            <CardContent className="px-0">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-y border-border">
                    <th className="px-4 py-2 text-left font-medium">时间</th>
                    <th className="px-4 py-2 text-left font-medium">来源</th>
                    <th className="px-4 py-2 text-left font-medium">操作</th>
                    <th className="px-4 py-2 text-left font-medium">对象</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{a.time ? a.time.slice(0, 19).replace("T", " ") : "—"}</td>
                      <td className="px-4 py-2"><Badge variant="outline">{a.source}</Badge></td>
                      <td className="px-4 py-2">{a.action}</td>
                      <td className="px-4 py-2 text-muted-foreground">{a.target}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">暂无审计事件</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function Cell({ on }: { on: boolean }) {
  return (
    <td className="px-4 py-2 text-center">
      {on ? <span className="text-emerald-500">●</span> : <span className="text-muted-foreground/30">○</span>}
    </td>
  )
}
