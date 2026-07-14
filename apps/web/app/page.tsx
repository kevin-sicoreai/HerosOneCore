"use client"

import * as React from "react"
import Link from "next/link"
import {
  BlocksIcon,
  BoxesIcon,
  ChevronRightIcon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
  PlugIcon,
  SearchIcon,
  Share2Icon,
  SparklesIcon,
  WorkflowIcon,
  ZapIcon,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { dataApi } from "@/lib/data-api"
import { ontologyApi } from "@/lib/ontology-api"
import { pipelineApi } from "@/lib/pipeline-api"
import {
  assistApi,
  type ChartPayload,
  type TraceIcon,
  type TraceStep,
} from "@/lib/assist-api"
import { findApp } from "@/lib/apps"
import { readRecent, type RecentEntry } from "@/lib/recent"
import { MetricBarChart } from "@/components/metric-bar-chart"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Mirrors the AIP 助手 page's SUGGESTIONS so a click here starts the same
// canned business question, just answered inline instead of on /assist.
const AIP_SUGGESTIONS = [
  "客服工单反映出哪些服务短板？该优先改进什么？",
  "订单履约是否健康？哪些状态存在积压或流失风险？",
  "设备与维保的运营压力集中在哪里？该重点治理什么？",
]

// Same trace-step icon mapping as the assist page; falls back to Sparkles.
const TRACE_ICON: Record<TraceIcon, React.ElementType> = {
  search: SearchIcon,
  compute: ZapIcon,
  cite: FileTextIcon,
  model: CpuIcon,
}

type Kind = "folder" | "dataset" | "object-type" | "pipeline"
type Node = { id: string; name: string; kind: Kind; owner?: string; children?: Node[] }

const KIND_ICON: Record<Kind, React.ElementType> = {
  folder: FolderIcon,
  dataset: DatabaseIcon,
  "object-type": Share2Icon,
  pipeline: WorkflowIcon,
}
const KIND_LABEL: Record<Kind, string> = {
  folder: "文件夹",
  dataset: "数据集",
  "object-type": "对象类型",
  pipeline: "管道",
}

export default function HomePage() {
  const [tree, setTree] = React.useState<Node[]>([])
  const [stats, setStats] = React.useState({ connectors: 0, datasets: 0, objects: 0, pipelines: 0 })
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    ;(async () => {
      const [connectors, datasets, graph, pipelines] = await Promise.all([
        dataApi.connectors({ pageSize: 100 }).catch(() => null),
        dataApi.datasets({ pageSize: 100 }).catch(() => null),
        ontologyApi.graph().catch(() => ({ nodes: [], links: [] })),
        pipelineApi.list().catch(() => []),
      ])
      setStats({
        connectors: connectors?.total ?? 0,
        datasets: datasets?.total ?? 0,
        objects: graph.nodes.length,
        pipelines: pipelines.length,
      })
      setLoading(false)
      setTree([
        {
          id: "f-src", name: "数据源", kind: "folder",
          children: (datasets?.items ?? []).map((d) => ({ id: d.id, name: d.name, kind: "dataset" as const, owner: d.owner_id ?? "—" })),
        },
        {
          id: "f-onto", name: "本体对象", kind: "folder",
          children: graph.nodes.map((o) => ({ id: o.id, name: o.display_name, kind: "object-type" as const })),
        },
        {
          id: "f-pipe", name: "管道", kind: "folder",
          children: pipelines.map((p) => ({ id: p.id, name: p.name, kind: "pipeline" as const })),
        },
      ])
    })()
  }, [])

  const STATS = [
    { label: "连接器", value: stats.connectors, icon: PlugIcon },
    { label: "数据集", value: stats.datasets, icon: DatabaseIcon },
    { label: "本体对象类型", value: stats.objects, icon: Share2Icon },
    { label: "管道", value: stats.pipelines, icon: WorkflowIcon },
  ]

  return (
    <PageContainer>
      <PageHeading
        title="工作台"
        desc="统一数据底座 · 一切资源挂在同一套本体上，打开工具即操作资源"
        icon={<BoxesIcon />}
        actions={
          <Button variant="outline" size="sm" render={<Link href="/ontology" />}>
            <Share2Icon /> 打开本体
          </Button>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {STATS.map((s) => (
          <Card key={s.label} className="gap-0 py-0">
            <CardContent className="flex items-center gap-3.5 px-4 py-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                {loading ? (
                  <div className="h-[26px] w-12 animate-pulse rounded-md bg-muted" />
                ) : (
                  <div className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                    {s.value}
                  </div>
                )}
                <div className="mt-1.5 text-[13px] font-medium text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <RecentVisits />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderIcon className="size-4 text-muted-foreground" /> 项目资源树
            </CardTitle>
            <CardDescription>所有资源统一挂载在同一套本体上，点击任意条目查看详情</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href="/ontology" />}>
                <Share2Icon /> 打开本体
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="max-h-[clamp(280px,48vh,520px)] overflow-auto rounded-lg border border-border">
              {tree.map((r) => (
                <TreeRow key={r.id} node={r} depth={0} />
              ))}
              {tree.every((f) => !f.children?.length) && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {loading ? "加载中…" : "暂无资源"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <AipSuggestCard />
      </div>
    </PageContainer>
  )
}

// Right-rail "AIP 建议" card. Each suggestion runs the real assist pipeline
// in place: click a question → stream trace + answer + metric charts right
// inside the card, reusing one lazily-created session for the page visit.
// Keeps the assist page's onEvent handling so behaviour stays in lockstep.
function AipSuggestCard() {
  // Session is created on first click and reused for every later question.
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [activeQuestion, setActiveQuestion] = React.useState<string | null>(null)
  const [trace, setTrace] = React.useState<TraceStep[]>([])
  const [answer, setAnswer] = React.useState("")
  const [charts, setCharts] = React.useState<ChartPayload[]>([])
  const [error, setError] = React.useState<string | null>(null)

  async function ask(question: string) {
    if (busy) return
    setActiveQuestion(question)
    setTrace([])
    setAnswer("")
    setCharts([])
    setError(null)
    setBusy(true)
    try {
      let sid = sessionId
      if (!sid) {
        const s = await assistApi.createSession()
        setSessionId(s.id)
        sid = s.id
      }
      // Model omitted so chatStream defaults to getSelectedModel().
      await assistApi.chatStream(sid, question, (ev) => {
        if (ev.type === "step_start") {
          const { type: _t, ...step } = ev
          setTrace((prev) => [...prev, step as TraceStep])
        } else if (ev.type === "step_end") {
          setTrace((prev) =>
            prev.map((s) => (s.id === ev.id ? { ...s, meta: ev.meta, status: "done" } : s))
          )
        } else if (ev.type === "token") {
          setAnswer((prev) => prev + ev.text)
        } else if (ev.type === "chart") {
          const { type: _t, ...chart } = ev
          setCharts((prev) => [...prev, chart as ChartPayload])
        } else if (ev.type === "error") {
          setError(ev.message)
        } else if (ev.type === "done") {
          setBusy(false)
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败")
    } finally {
      setBusy(false)
    }
  }

  // Back to the initial three-suggestion state.
  function reset() {
    if (busy) return
    setActiveQuestion(null)
    setTrace([])
    setAnswer("")
    setCharts([])
    setError(null)
  }

  const hasResult = activeQuestion !== null || busy

  return (
    <Card className="border-primary/25 bg-primary/[0.035]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" /> AIP 建议
        </CardTitle>
        <CardDescription>点击问题，就地生成分析</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {/* Suggested questions — click to answer inline; all disabled while busy. */}
        {AIP_SUGGESTIONS.map((qn) => (
          <button
            key={qn}
            type="button"
            onClick={() => ask(qn)}
            disabled={busy}
            className="flex w-full items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BlocksIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span className="leading-relaxed">{qn}</span>
          </button>
        ))}

        {/* Inline result: current question + trace + streamed answer + charts. */}
        {hasResult && (
          <div className="max-h-[420px] space-y-3 overflow-auto pt-1">
            {activeQuestion && (
              <div className="text-xs font-medium text-muted-foreground">{activeQuestion}</div>
            )}

            {/* Compact reasoning trace. */}
            {trace.length > 0 && (
              <ol className="space-y-1.5 rounded-lg border border-border bg-card p-2.5">
                {trace.map((t) => {
                  const Icon = TRACE_ICON[t.icon] ?? SparklesIcon
                  return (
                    <li key={t.id} className="flex items-center gap-2 text-xs">
                      <Icon className="size-3.5 shrink-0 text-primary" />
                      <span className="flex-1 leading-relaxed">{t.text}</span>
                      <span className="text-muted-foreground">{t.meta}</span>
                      {t.status === "done" ? (
                        <span className="text-emerald-500">✓</span>
                      ) : (
                        <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                      )}
                    </li>
                  )
                })}
              </ol>
            )}

            {/* Streamed answer, with a blinking cursor while tokens arrive. */}
            {(answer || busy) && (
              <div className="markdown-answer text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                {busy && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-emerald-500 align-text-bottom" />
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                请求出错：{error}
              </div>
            )}

            {/* Charts revealed only once the answer completes (as on assist). */}
            {!busy && charts.length > 0 && (
              <div className="space-y-2">
                {charts.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-3">
                    <MetricBarChart {...c} />
                  </div>
                ))}
              </div>
            )}

            {/* Footer actions once the run finishes. */}
            {!busy && (answer || error) && (
              <div className="flex items-center justify-between border-t border-border pt-2.5 text-xs">
                <Link href="/assist" className="text-primary hover:underline">
                  在 AIP 助手中继续 →
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  清空
                </button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return new Date(ts).toLocaleDateString("zh-CN")
}

function RecentVisits() {
  // localStorage isn't reactive; read once on mount (the shell writes on nav).
  const [items, setItems] = React.useState<RecentEntry[]>([])
  React.useEffect(() => setItems(readRecent().slice(0, 8)), [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockIcon className="size-4 text-muted-foreground" /> 最近访问
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">暂无访问记录</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {items.map((it) => {
              const app = findApp(it.href)
              const Icon = app?.icon ?? BlocksIcon
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-emerald-500/40"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{it.title}</div>
                    <div className="text-xs text-muted-foreground">{relTime(it.ts)}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TreeRow({ node, depth }: { node: Node; depth: number }) {
  const { open } = useResourceDrawer()
  const [expanded, setExpanded] = React.useState(depth === 0)
  const Icon = KIND_ICON[node.kind]
  const isFolder = node.kind === "folder"

  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-2 py-2 text-sm last:border-0 hover:bg-muted/50"
        style={{ paddingLeft: 8 + depth * 18 }}
        onClick={() => (isFolder ? setExpanded((v) => !v) : open({ name: node.name, kind: KIND_LABEL[node.kind] }))}
      >
        {isFolder ? (
          <ChevronRightIcon className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className={`size-4 ${isFolder ? "text-muted-foreground" : "text-primary"}`} />
        <span className="flex-1 truncate">{node.name}</span>
        {isFolder ? (
          <span className="text-xs text-muted-foreground">{node.children?.length ?? 0}</span>
        ) : (
          <Badge variant="outline" className="text-[10px]">{KIND_LABEL[node.kind]}</Badge>
        )}
      </div>
      {isFolder && expanded && node.children?.map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  )
}
