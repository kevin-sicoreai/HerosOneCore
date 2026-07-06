"use client"

import * as React from "react"
import {
  BoxesIcon,
  DatabaseIcon,
  GitMergeIcon,
  PlayIcon,
  SlidersHorizontalIcon,
  WorkflowIcon,
} from "lucide-react"

import { PIPE_EDGES, PIPE_NODES, type PipeNode } from "@/lib/mock"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const NODE_W = 150
const NODE_H = 56

const KIND: Record<PipeNode["kind"], { color: string; icon: React.ElementType; label: string }> = {
  source: { color: "border-sky-500/50 text-sky-500", icon: DatabaseIcon, label: "数据源" },
  transform: { color: "border-emerald-500/50 text-emerald-500", icon: SlidersHorizontalIcon, label: "转换" },
  join: { color: "border-amber-500/50 text-amber-500", icon: GitMergeIcon, label: "关联" },
  output: { color: "border-violet-500/50 text-violet-500", icon: BoxesIcon, label: "输出对象" },
}

export default function PipelinePage() {
  const [selected, setSelected] = React.useState<PipeNode>(PIPE_NODES[2])
  const meta = KIND[selected.kind]

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="管道构建器"
        desc="拖拽式数据管道 —— 从数据源经转换到本体对象"
        icon={<WorkflowIcon />}
        actions={
          <>
            <Badge variant="success">上次运行 2 分钟前 · 成功</Badge>
            <Button size="sm">
              <PlayIcon /> 运行管道
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="relative min-h-[420px] overflow-auto rounded-xl border border-border bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]">
          <div className="relative" style={{ width: 880, height: 320 }}>
            <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L7,3 L0,6" fill="var(--color-muted-foreground)" />
                </marker>
              </defs>
              {PIPE_EDGES.map((e, i) => {
                const a = PIPE_NODES.find((n) => n.id === e.from)!
                const b = PIPE_NODES.find((n) => n.id === e.to)!
                const x1 = a.x + NODE_W
                const y1 = a.y + NODE_H / 2
                const x2 = b.x
                const y2 = b.y + NODE_H / 2
                const mx = (x1 + x2) / 2
                return (
                  <path
                    key={i}
                    d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke="var(--color-muted-foreground)"
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                    markerEnd="url(#arrow)"
                  />
                )
              })}
            </svg>
            {PIPE_NODES.map((n) => {
              const k = KIND[n.kind]
              return (
                <button
                  key={n.id}
                  onClick={() => setSelected(n)}
                  className={`absolute flex items-center gap-2 rounded-lg border-2 bg-card px-3 shadow-sm transition-all hover:shadow-md ${k.color} ${
                    selected.id === n.id ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""
                  }`}
                  style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                >
                  <k.icon className="size-4 shrink-0" />
                  <div className="text-left">
                    <div className="text-sm font-medium text-foreground">{n.label}</div>
                    <div className="text-[11px] text-muted-foreground">{k.label}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <meta.icon className={`size-4 ${meta.color.split(" ")[1]}`} />
            <span className="text-sm font-semibold">{selected.label}</span>
          </div>
          <Badge variant="outline" className="w-fit">{meta.label}</Badge>
          <div className="text-xs font-medium text-muted-foreground">配置</div>
          <div className="space-y-2 text-sm">
            {selected.kind === "transform" && (
              <>
                <ConfigRow k="操作" v="去重 + 空值填充" />
                <ConfigRow k="分区" v="按 site_id" />
                <ConfigRow k="输出行数" v="≈ 12.4M" />
              </>
            )}
            {selected.kind === "source" && (
              <>
                <ConfigRow k="来源" v={selected.label} />
                <ConfigRow k="模式" v="增量" />
              </>
            )}
            {selected.kind === "join" && <ConfigRow k="连接键" v="device_id" />}
            {selected.kind === "output" && <ConfigRow k="写入本体" v="设备 Device" />}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

function ConfigRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-xs">{v}</span>
    </div>
  )
}
