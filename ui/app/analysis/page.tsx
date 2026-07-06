"use client"

import * as React from "react"
import {
  CalendarClockIcon,
  MapIcon,
  RadarIcon,
  TableIcon,
  WaypointsIcon,
} from "lucide-react"

import {
  DEVICE_ROWS,
  GRAPH_EDGES,
  GRAPH_NODES,
  TIMELINE,
  type GraphNode,
} from "@/lib/mock"
import { useWorkspace } from "@/components/workspace-context"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"

type View = "graph" | "timeline" | "map" | "table"

const VIEWS: { key: View; label: string; icon: React.ElementType }[] = [
  { key: "graph", label: "关系图谱", icon: WaypointsIcon },
  { key: "timeline", label: "时间轴", icon: CalendarClockIcon },
  { key: "map", label: "地图", icon: MapIcon },
  { key: "table", label: "表格", icon: TableIcon },
]

const NODE_COLOR: Record<GraphNode["type"], string> = {
  person: "#10b981",
  org: "#0ea5e9",
  account: "#a855f7",
  device: "#f59e0b",
  event: "#ef4444",
}
const NODE_LABEL: Record<GraphNode["type"], string> = {
  person: "人员",
  org: "组织",
  account: "账户",
  device: "设备",
  event: "事件",
}

export default function AnalysisPage() {
  const { workspace } = useWorkspace()
  const isGotham = workspace.kind === "gotham"
  const [mode, setMode] = React.useState<"foundry" | "gotham">(workspace.kind)
  const [view, setView] = React.useState<View>(isGotham ? "graph" : "table")

  // Sync default when switching workspace
  React.useEffect(() => {
    setMode(workspace.kind)
    setView(workspace.kind === "gotham" ? "graph" : "table")
  }, [workspace.kind])

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="分析工作台"
        desc="同一套本体，两种打开方式：企业分析与调查分析"
        icon={<RadarIcon />}
        actions={
          <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
            <button
              onClick={() => {
                setMode("foundry")
                setView("table")
              }}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                mode === "foundry" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              }`}
            >
              Foundry 企业分析
            </button>
            <button
              onClick={() => {
                setMode("gotham")
                setView("graph")
              }}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                mode === "gotham" ? "bg-violet-500/15 text-violet-600 dark:text-violet-400" : "text-muted-foreground"
              }`}
            >
              Gotham 调查分析
            </button>
          </div>
        }
      />

      {/* View switcher */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === v.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <v.icon className="size-4" /> {v.label}
          </button>
        ))}
        <div className="ml-auto pr-2 text-xs text-muted-foreground">
          {mode === "gotham" ? "调查上下文：锦程贸易案" : "分析上下文：设备运营"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        {view === "graph" && <GraphView />}
        {view === "timeline" && <TimelineView />}
        {view === "map" && <MapView />}
        {view === "table" && <TableView />}
      </div>
    </PageContainer>
  )
}

function GraphView() {
  const { open } = useResourceDrawer()
  const R = 26
  return (
    <div className="relative h-full min-h-[440px] overflow-auto bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]">
      <svg className="h-full min-h-[440px] w-full min-w-[760px]">
        {GRAPH_EDGES.map((e, i) => {
          const a = GRAPH_NODES.find((n) => n.id === e.from)!
          const b = GRAPH_NODES.find((n) => n.id === e.to)!
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-muted-foreground)" strokeOpacity={0.4} strokeWidth={1.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">
                {e.label}
              </text>
            </g>
          )
        })}
        {GRAPH_NODES.map((n) => (
          <g key={n.id} className="cursor-pointer" onClick={() => open({ name: n.label, kind: NODE_LABEL[n.type] })}>
            <circle cx={n.x} cy={n.y} r={R} fill={NODE_COLOR[n.type]} fillOpacity={0.18} stroke={NODE_COLOR[n.type]} strokeWidth={n.risk ? 2.5 : 1.5} />
            {n.risk && <circle cx={n.x + R - 4} cy={n.y - R + 4} r={5} fill="#ef4444" />}
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-foreground)">
              {NODE_LABEL[n.type]}
            </text>
            <text x={n.x} y={n.y + R + 14} textAnchor="middle" fontSize={11} fill="var(--color-foreground)">
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute top-3 left-3 flex flex-wrap gap-2 rounded-lg border border-border bg-card/90 p-2 backdrop-blur">
        {Object.entries(NODE_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1 text-xs">
            <span className="size-2.5 rounded-full" style={{ background: NODE_COLOR[k as GraphNode["type"]] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function TimelineView() {
  const LEVEL = {
    info: "bg-sky-500",
    warn: "bg-amber-500",
    danger: "bg-red-500",
  }
  return (
    <div className="h-full overflow-auto p-6">
      <ol className="relative mx-auto max-w-2xl space-y-5 border-l-2 border-border pl-6">
        {TIMELINE.map((t, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full ${LEVEL[t.level]} ring-4 ring-card`} />
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{t.time}</span>
              {t.level === "danger" && <Badge variant="danger">高风险</Badge>}
              {t.level === "warn" && <Badge variant="warning">可疑</Badge>}
            </div>
            <div className="text-sm font-medium">{t.title}</div>
            <div className="text-sm text-muted-foreground">{t.detail}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MapView() {
  const points = [
    { x: "28%", y: "42%", risk: false },
    { x: "62%", y: "35%", risk: true },
    { x: "70%", y: "60%", risk: false },
    { x: "45%", y: "68%", risk: true },
    { x: "55%", y: "50%", risk: false },
  ]
  return (
    <div className="relative h-full min-h-[440px] overflow-hidden bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:40px_40px]">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-emerald-500/5" />
      <div className="absolute top-3 left-3 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
        <MapIcon className="mr-1 inline size-3.5" /> 地理空间分布 · 5 个热点
      </div>
      {points.map((p, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: p.x, top: p.y }}
        >
          <span className={`block size-3 rounded-full ${p.risk ? "bg-red-500" : "bg-emerald-500"}`} />
          <span className={`absolute inset-0 animate-ping rounded-full ${p.risk ? "bg-red-500/60" : "bg-emerald-500/60"}`} />
        </span>
      ))}
    </div>
  )
}

function TableView() {
  const { open } = useResourceDrawer()
  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        {[
          { k: "订单履约率", v: "94.2%", d: "+1.8%" },
          { k: "设备可用率", v: "98.1%", d: "-0.3%" },
          { k: "平均故障率", v: "3.4%", d: "+0.6%" },
          { k: "在途订单", v: "12,904", d: "+320" },
        ].map((m) => (
          <div key={m.k} className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">{m.k}</div>
            <div className="text-xl font-semibold">{m.v}</div>
            <div className="text-xs text-emerald-500">{m.d}</div>
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-y border-border">
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
              className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
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
  )
}
