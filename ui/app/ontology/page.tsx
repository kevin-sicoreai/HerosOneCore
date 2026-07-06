"use client"

import * as React from "react"
import { KeyIcon, PlusIcon, Share2Icon } from "lucide-react"

import { ONTO_LINKS, ONTO_NODES, ONTO_PROPS, type OntoNode } from "@/lib/mock"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const NODE_W = 150
const NODE_H = 62

const COLOR: Record<string, string> = {
  emerald: "border-emerald-500/50 bg-emerald-500/10 text-emerald-500",
  sky: "border-sky-500/50 bg-sky-500/10 text-sky-500",
  violet: "border-violet-500/50 bg-violet-500/10 text-violet-500",
  amber: "border-amber-500/50 bg-amber-500/10 text-amber-500",
  rose: "border-rose-500/50 bg-rose-500/10 text-rose-500",
}

export default function OntologyPage() {
  const [selected, setSelected] = React.useState<OntoNode>(ONTO_NODES[0])
  const { open } = useResourceDrawer()
  const props = ONTO_PROPS[selected.id] ?? ONTO_PROPS.device

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="本体管理器"
        desc="图形化定义对象类型、链接与属性 —— 平台的语义核心"
        icon={<Share2Icon />}
        actions={
          <>
            <Button variant="outline" size="sm">
              <PlusIcon /> 新建对象类型
            </Button>
            <Button size="sm" onClick={() => open({ name: selected.name + " " + selected.en, kind: "对象类型" })}>
              查看治理
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Canvas */}
        <div className="relative min-h-[440px] overflow-auto rounded-xl border border-border bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]">
          <div className="relative" style={{ width: 900, height: 440 }}>
            <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
              {ONTO_LINKS.map((l, i) => {
                const a = ONTO_NODES.find((n) => n.id === l.from)!
                const b = ONTO_NODES.find((n) => n.id === l.to)!
                const x1 = a.x + NODE_W / 2
                const y1 = a.y + NODE_H / 2
                const x2 = b.x + NODE_W / 2
                const y2 = b.y + NODE_H / 2
                return (
                  <g key={i}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="var(--color-muted-foreground)"
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                    />
                    <rect
                      x={(x1 + x2) / 2 - 18}
                      y={(y1 + y2) / 2 - 9}
                      width={36}
                      height={18}
                      rx={4}
                      fill="var(--color-card)"
                      stroke="var(--color-border)"
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--color-muted-foreground)"
                    >
                      {l.label}
                    </text>
                  </g>
                )
              })}
            </svg>

            {ONTO_NODES.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelected(n)}
                className={`absolute flex flex-col justify-center rounded-lg border-2 bg-card px-3 text-left shadow-sm transition-all hover:shadow-md ${
                  COLOR[n.color]
                } ${selected.id === n.id ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""}`}
                style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Share2Icon className="size-3.5" />
                  {n.name}
                  <span className="text-xs font-normal text-muted-foreground">{n.en}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {n.props} 属性 · {n.instances} 实例
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Property panel */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div>
            <div className="text-xs text-muted-foreground">对象类型</div>
            <div className="flex items-center gap-2 text-base font-semibold">
              {selected.name}
              <span className="text-sm font-normal text-muted-foreground">{selected.en}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant="brand">{selected.instances} 实例</Badge>
            <Badge variant="outline">{selected.props} 属性</Badge>
          </div>

          <div className="mt-1 text-xs font-medium text-muted-foreground">属性</div>
          <div className="space-y-1">
            {props.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm"
              >
                <span className="flex items-center gap-1.5 font-mono text-xs">
                  {p.key && <KeyIcon className="size-3 text-amber-500" />}
                  {p.name}
                </span>
                <span className="text-xs text-muted-foreground">{p.type}</span>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" className="mt-auto">
            <PlusIcon /> 添加属性
          </Button>
        </div>
      </div>
    </PageContainer>
  )
}
