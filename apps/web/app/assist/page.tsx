"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  BotIcon,
  CpuIcon,
  FileTextIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"

import { ASSIST_SESSIONS, ASSIST_TRACE, DEVICE_ROWS, type TraceStep } from "@/lib/mock"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const TRACE_ICON: Record<TraceStep["icon"], React.ElementType> = {
  search: SearchIcon,
  compute: ZapIcon,
  cite: FileTextIcon,
  model: CpuIcon,
}

export default function AssistPage() {
  return (
    <React.Suspense>
      <AssistInner />
    </React.Suspense>
  )
}

function AssistInner() {
  const params = useSearchParams()
  const initial = params.get("q") ?? "哪些设备近30天故障率上升？"
  const { open } = useResourceDrawer()

  return (
    <div className="flex h-full min-h-0">
      {/* Session history */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border p-3 md:flex">
        <Button variant="outline" size="sm" className="mb-3 w-full justify-start">
          <PlusIcon /> 新会话
        </Button>
        <div className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">会话历史</div>
        <div className="space-y-0.5">
          {ASSIST_SESSIONS.map((s, i) => (
            <button
              key={s.id}
              className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                i === 0 ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              <span className="line-clamp-1">{s.title}</span>
              <span className="text-xs text-muted-foreground">{s.time}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
          {/* User */}
          <div className="flex justify-end">
            <div className="max-w-lg rounded-2xl rounded-tr-sm bg-emerald-500/15 px-4 py-2.5 text-sm">
              {initial}
            </div>
          </div>

          {/* Assistant */}
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
              <BotIcon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              {/* Trace */}
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SparklesIcon className="size-3.5 text-emerald-500" /> 推理过程
                  <Badge variant="brand" className="ml-1">Claude Opus 4.8</Badge>
                </div>
                <ol className="space-y-1.5">
                  {ASSIST_TRACE.map((t, i) => {
                    const Icon = TRACE_ICON[t.icon]
                    return (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Icon className="size-4 shrink-0 text-emerald-500" />
                        <span className="flex-1">{t.text}</span>
                        <span className="text-xs text-muted-foreground">{t.meta}</span>
                        <span className="text-emerald-500">✓</span>
                      </li>
                    )
                  })}
                </ol>
              </div>

              {/* Answer */}
              <div className="space-y-3 text-sm">
                <p>
                  近 30 天内共有 <b>12 台设备</b>故障率显著上升，主要集中在
                  <b> TX-500 </b>与 <b>MX-900</b> 两个型号，华东-01 与西南-01 站点最为突出。以下为风险最高的设备：
                </p>

                {/* Inline result: object cards */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {DEVICE_ROWS.filter((r) => r.failureRate > 5)
                    .slice(0, 3)
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={() => open({ name: r.id, kind: "设备对象" })}
                        className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-emerald-500/40"
                      >
                        <div className="font-mono text-sm text-emerald-500">{r.id}</div>
                        <div className="text-xs text-muted-foreground">{r.model} · {r.site}</div>
                        <div className="mt-1 text-lg font-semibold text-red-500">{r.failureRate}%</div>
                      </button>
                    ))}
                </div>

                {/* Citations */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <FileTextIcon className="size-3.5" /> 来源：
                  <button onClick={() => open({ name: "设备 Device", kind: "对象类型" })} className="rounded-md border border-border px-2 py-0.5 hover:border-emerald-500/40">
                    设备对象
                  </button>
                  <button onClick={() => open({ name: "pipeline_maintenance", kind: "管道" })} className="rounded-md border border-border px-2 py-0.5 hover:border-emerald-500/40">
                    维护管道
                  </button>
                  <span className="text-emerald-500">· 全部可溯源</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="relative mx-auto max-w-3xl">
            <input
              placeholder="继续提问，或让助手生成分析视图…"
              className="h-11 w-full rounded-xl border border-input bg-muted/40 pr-12 pl-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
            <Button size="icon" className="absolute top-1/2 right-1.5 -translate-y-1/2">
              <SendIcon />
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            助手全预置 · 用户只管提问，推理过程与数据来源全程可见
          </p>
        </div>
      </div>
    </div>
  )
}
