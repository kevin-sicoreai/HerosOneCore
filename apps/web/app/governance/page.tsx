"use client"

import {
  ClockIcon,
  KeyIcon,
  LockIcon,
  ScrollTextIcon,
  Share2Icon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react"

import { AUDIT, GRANTS, LINEAGE } from "@/lib/mock"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function GovernancePage() {
  return (
    <PageContainer>
      <PageHeading
        title="治理后台"
        desc="安全与治理横切全平台 · 权限 · 血缘 · 审计 · 加密合规"
        icon={<ShieldCheckIcon />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "受控资源", v: "1,284", icon: LockIcon },
          { k: "角色", v: "5", icon: UsersIcon },
          { k: "今日审计事件", v: "3,912", icon: ScrollTextIcon },
          { k: "加密覆盖", v: "100%", icon: KeyIcon },
        ].map((m) => (
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

      <Tabs defaultValue="access">
        <TabsList>
          <TabsTrigger value="access"><LockIcon /> 权限矩阵</TabsTrigger>
          <TabsTrigger value="lineage"><Share2Icon /> 数据血缘</TabsTrigger>
          <TabsTrigger value="audit"><ClockIcon /> 审计日志</TabsTrigger>
        </TabsList>

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
                  {GRANTS.map((g) => (
                    <tr key={g.role} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-medium">{g.role}</td>
                      <td className="px-4 py-2 text-muted-foreground">{g.members} 人</td>
                      <Cell on={g.read} />
                      <Cell on={g.write} />
                      <Cell on={g.admin} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lineage" className="pt-3">
          <Card>
            <CardHeader>
              <CardTitle>{LINEAGE.node} · 数据血缘</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                <Column title="上游数据源" items={LINEAGE.upstream} color="sky" />
                <Arrow />
                <div className="flex items-center justify-center rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm font-semibold">
                  {LINEAGE.node}
                </div>
                <Arrow />
                <Column title="下游消费方" items={LINEAGE.downstream} color="violet" />
              </div>
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
                    <th className="px-4 py-2 text-left font-medium">用户</th>
                    <th className="px-4 py-2 text-left font-medium">操作</th>
                    <th className="px-4 py-2 text-left font-medium">对象</th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT.map((a, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{a.time}</td>
                      <td className="px-4 py-2">{a.user}</td>
                      <td className="px-4 py-2">{a.action}</td>
                      <td className="px-4 py-2 text-muted-foreground">{a.target}</td>
                    </tr>
                  ))}
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

function Column({ title, items, color }: { title: string; items: string[]; color: "sky" | "violet" }) {
  const c = color === "sky" ? "border-sky-500/40 text-sky-500" : "border-violet-500/40 text-violet-500"
  return (
    <div className="flex-1 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {items.map((it) => (
        <div key={it} className={`rounded-lg border bg-card px-3 py-2 text-sm ${c}`}>
          {it}
        </div>
      ))}
    </div>
  )
}

function Arrow() {
  return <div className="hidden text-muted-foreground md:block">→</div>
}
