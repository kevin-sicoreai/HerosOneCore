"use client"

import { ActivityIcon, CpuIcon, MemoryStickIcon, ServerIcon } from "lucide-react"

import { SERVICES, type Service } from "@/lib/mock"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function statusVariant(s: Service["status"]) {
  return s === "健康" ? "success" : s === "降级" ? "warning" : "danger"
}

export default function ApolloPage() {
  const healthy = SERVICES.filter((s) => s.status === "健康").length
  return (
    <PageContainer>
      <PageHeading
        title="运维控制台"
        desc="Palantir Apollo · 持续交付与服务网格健康"
        icon={<ServerIcon />}
        actions={<Badge variant="success">{healthy}/{SERVICES.length} 服务健康</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "部署版本", v: "v2.15.0", icon: ActivityIcon },
          { k: "平均 CPU", v: "50%", icon: CpuIcon },
          { k: "平均内存", v: "53%", icon: MemoryStickIcon },
          { k: "服务实例", v: "42", icon: ServerIcon },
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>服务健康</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {SERVICES.map((s) => (
              <div key={s.name} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-sm">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{s.version}</span>
                    <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Meter label="CPU" value={s.cpu} />
                  <Meter label="内存" value={s.mem} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>服务网格拓扑</CardTitle>
          </CardHeader>
          <CardContent>
            <MeshTopology />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  const color = value > 80 ? "bg-red-500" : value > 60 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function MeshTopology() {
  const nodes = [
    { id: "gw", label: "gateway", x: 140, y: 20 },
    { id: "onto", label: "ontology", x: 40, y: 110 },
    { id: "pipe", label: "pipeline", x: 140, y: 110 },
    { id: "auth", label: "auth", x: 240, y: 110 },
    { id: "store", label: "storage", x: 140, y: 200 },
  ]
  const edges = [
    ["gw", "onto"], ["gw", "pipe"], ["gw", "auth"],
    ["onto", "store"], ["pipe", "store"],
  ]
  return (
    <svg viewBox="0 0 300 240" className="h-56 w-full">
      {edges.map(([a, b], i) => {
        const na = nodes.find((n) => n.id === a)!
        const nb = nodes.find((n) => n.id === b)!
        return (
          <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="var(--color-muted-foreground)" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="3 3" />
        )
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={9} fill="var(--color-card)" stroke="#10b981" strokeWidth={2} />
          <circle cx={n.x} cy={n.y} r={3} fill="#10b981" />
          <text x={n.x} y={n.y - 14} textAnchor="middle" fontSize={10} fill="var(--color-foreground)">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
