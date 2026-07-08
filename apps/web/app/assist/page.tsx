"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BotIcon,
  CpuIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  assistApi,
  timeAgo,
  type ChatExtras,
  type ChatSession,
  type TraceIcon,
  type TraceStep,
} from "@/lib/assist-api"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const TRACE_ICON: Record<TraceIcon, React.ElementType> = {
  search: SearchIcon,
  compute: ZapIcon,
  cite: FileTextIcon,
  model: CpuIcon,
}

const SUGGESTIONS = [
  "平台上有哪些本体对象类型？",
  "客户 Customer 有哪些属性？",
  "查一下供应商 Supplier 的数据",
]

type UIMessage = {
  key: string
  role: "user" | "assistant"
  content: string
  trace: TraceStep[]
  extras: ChatExtras | null
  streaming?: boolean
  error?: string | null
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
  const router = useRouter()
  const [sessions, setSessions] = React.useState<ChatSession[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<UIMessage[]>([])
  const [input, setInput] = React.useState("")
  const [modelName, setModelName] = React.useState("")
  const [offline, setOffline] = React.useState(false)
  const [streaming, setStreaming] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    assistApi.meta().then((m) => setModelName(m.display_name)).catch(() => setOffline(true))
    assistApi.sessions().then(setSessions).catch(() => setOffline(true))
  }, [])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  // Global search bar entry: /assist?q=... auto-sends the question, then the
  // query param is stripped so a refresh doesn't resend it.
  const autoSentRef = React.useRef<string | null>(null)
  const q = params.get("q")
  React.useEffect(() => {
    if (q && autoSentRef.current !== q) {
      autoSentRef.current = q
      send(q)
      router.replace("/assist")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  async function openSession(id: string) {
    setActiveId(id)
    const history = await assistApi.messages(id)
    setMessages(
      history.map((m) => ({
        key: m.id,
        role: m.role,
        content: m.content,
        trace: m.trace ?? [],
        extras: m.extras ?? null,
      }))
    )
  }

  async function newSession() {
    const s = await assistApi.createSession()
    setSessions((prev) => [s, ...prev])
    setActiveId(s.id)
    setMessages([])
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || streaming) return
    setInput("")
    setStreaming(true)

    let sid = activeId
    try {
      if (!sid) {
        const s = await assistApi.createSession()
        setSessions((prev) => [s, ...prev])
        setActiveId(s.id)
        sid = s.id
      }
      const assistantKey = `a-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { key: `u-${Date.now()}`, role: "user", content, trace: [], extras: null },
        { key: assistantKey, role: "assistant", content: "", trace: [], extras: null, streaming: true },
      ])

      const patch = (fn: (m: UIMessage) => UIMessage) =>
        setMessages((prev) => prev.map((m) => (m.key === assistantKey ? fn(m) : m)))

      await assistApi.chatStream(sid, content, (ev) => {
        if (ev.type === "step_start") {
          const { type: _t, ...step } = ev
          patch((m) => ({ ...m, trace: [...m.trace, step as TraceStep] }))
        } else if (ev.type === "step_end") {
          patch((m) => ({
            ...m,
            trace: m.trace.map((s) => (s.id === ev.id ? { ...s, meta: ev.meta, status: "done" } : s)),
          }))
        } else if (ev.type === "token") {
          patch((m) => ({ ...m, content: m.content + ev.text }))
        } else if (ev.type === "done") {
          patch((m) => ({
            ...m,
            streaming: false,
            extras: { sources: ev.sources, devices: ev.devices },
          }))
          assistApi.sessions().then(setSessions).catch(() => {})
        } else if (ev.type === "error") {
          patch((m) => ({ ...m, streaming: false, error: ev.message }))
        }
      })
      patch((m) => ({ ...m, streaming: false }))
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.streaming ? { ...m, streaming: false, error: e instanceof Error ? e.message : "请求失败" } : m
        )
      )
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Session history */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border p-3 md:flex">
        <Button variant="outline" size="sm" className="mb-3 w-full justify-start" onClick={newSession}>
          <PlusIcon /> 新会话
        </Button>
        <div className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">会话历史</div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-auto">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                s.id === activeId ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              <span className="line-clamp-1">{s.title}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(s.updated_at)}</span>
            </button>
          ))}
          {sessions.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {offline ? "助手服务未启动" : "暂无会话"}
            </div>
          )}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                <BotIcon className="size-6" />
              </span>
              <div className="text-sm text-muted-foreground">向 AIP 助手提问，推理过程与数据来源全程可见</div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-emerald-500/40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.key} className="flex justify-end">
                <div className="max-w-lg rounded-2xl rounded-tr-sm bg-emerald-500/15 px-4 py-2.5 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <AssistantMessage key={m.key} message={m} modelName={modelName} />
            )
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="relative mx-auto max-w-3xl">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) send(input)
              }}
              disabled={streaming}
              placeholder="继续提问，或让助手生成分析视图…"
              className="h-11 w-full rounded-xl border border-input bg-muted/40 pr-12 pl-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
            />
            <Button
              size="icon"
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
              disabled={streaming || !input.trim()}
              onClick={() => send(input)}
            >
              {streaming ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
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

function AssistantMessage({ message, modelName }: { message: UIMessage; modelName: string }) {
  const { open } = useResourceDrawer()
  const m = message

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
        <BotIcon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {/* Trace */}
        {m.trace.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <SparklesIcon className="size-3.5 text-emerald-500" /> 推理过程
              {modelName && <Badge variant="brand" className="ml-1">{modelName}</Badge>}
            </div>
            <ol className="space-y-1.5">
              {m.trace.map((t) => {
                const Icon = TRACE_ICON[t.icon] ?? ZapIcon
                return (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <Icon className="size-4 shrink-0 text-emerald-500" />
                    <span className="flex-1">{t.text}</span>
                    <span className="text-xs text-muted-foreground">{t.meta}</span>
                    {t.status === "done" ? (
                      <span className="text-emerald-500">✓</span>
                    ) : (
                      <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {/* Answer */}
        <div className="space-y-3 text-sm">
          {(m.content || m.streaming) && (
            <div className="markdown-answer">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              {m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-emerald-500 align-text-bottom" />}
            </div>
          )}
          {m.error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500">
              请求出错：{m.error}
            </div>
          )}

          {/* Citations */}
          {m.extras && m.extras.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <FileTextIcon className="size-3.5" /> 来源：
              {m.extras.sources.map((s) => (
                <button
                  key={s}
                  onClick={() => open({ name: s, kind: s.includes("pipeline") ? "管道" : "对象类型" })}
                  className="rounded-md border border-border px-2 py-0.5 hover:border-emerald-500/40"
                >
                  {s}
                </button>
              ))}
              <span className="text-emerald-500">· 全部可溯源</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
