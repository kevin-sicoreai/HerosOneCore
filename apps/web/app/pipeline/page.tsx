"use client"

import * as React from "react"
import {
  BoxesIcon,
  DatabaseIcon,
  GitMergeIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { dataApi, type Dataset } from "@/lib/data-api"
import {
  pipelineApi,
  type Graph,
  type GraphStep,
  type Pipeline,
  type StepKind,
} from "@/lib/pipeline-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const NODE_W = 150
const NODE_H = 56

const KIND: Record<StepKind, { color: string; icon: React.ElementType; label: string }> = {
  source: { color: "border-sky-500/50 text-sky-500", icon: DatabaseIcon, label: "数据源" },
  transform: { color: "border-emerald-500/50 text-emerald-500", icon: SlidersHorizontalIcon, label: "转换" },
  join: { color: "border-amber-500/50 text-amber-500", icon: GitMergeIcon, label: "关联" },
  output: { color: "border-violet-500/50 text-violet-500", icon: BoxesIcon, label: "输出对象" },
}

const STATUS_RING: Record<string, string> = {
  success: "ring-2 ring-emerald-500",
  failed: "ring-2 ring-red-500",
  running: "ring-2 ring-amber-500",
  pending: "ring-2 ring-amber-400/60",
}

type EditStep = GraphStep
type EditEdge = { from_step: string; to_step: string }

function newId(): string {
  return "n_" + Math.random().toString(36).slice(2, 9)
}

const DEFAULT_CONFIG: Record<StepKind, Record<string, unknown>> = {
  source: { dataset_id: "" },
  transform: { sql: "select * from input" },
  join: { type: "inner", left_key: "", right_key: "" },
  output: { name: "" },
}

export default function PipelinePage() {
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([])
  const [pid, setPid] = React.useState<string>("")
  const [steps, setSteps] = React.useState<EditStep[]>([])
  const [edges, setEdges] = React.useState<EditEdge[]>([])
  const [datasets, setDatasets] = React.useState<Dataset[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [connectFrom, setConnectFrom] = React.useState<string | null>(null)
  const [stepStatus, setStepStatus] = React.useState<Record<string, string>>({})
  const [msg, setMsg] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const selected = steps.find((s) => s.id === selectedId) ?? null
  const drag = React.useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  const loadGraph = React.useCallback(async (id: string) => {
    const g = await pipelineApi.graph(id)
    setSteps(g.steps)
    setEdges(g.edges)
    setSelectedId(null)
    setConnectFrom(null)
    const runs = await pipelineApi.runs(id)
    if (runs[0]) {
      const d = await pipelineApi.getRun(runs[0].id)
      setStepStatus(Object.fromEntries((d.step_runs ?? []).map((s) => [s.step_id, s.status])))
    } else setStepStatus({})
  }, [])

  React.useEffect(() => {
    ;(async () => {
      try {
        const [list, ds] = await Promise.all([pipelineApi.list(), dataApi.datasets()])
        setPipelines(list)
        setDatasets(ds)
        if (list[0]) {
          setPid(list[0].id)
          await loadGraph(list[0].id)
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "加载失败")
      }
    })()
  }, [loadGraph])

  // --- editing ---------------------------------------------------------------
  function addNode(kind: StepKind) {
    const n = steps.length
    const step: EditStep = {
      id: newId(),
      kind,
      config: { ...DEFAULT_CONFIG[kind] },
      label: KIND[kind].label,
      x: 40 + (n % 5) * 40,
      y: 40 + (n % 5) * 40,
    }
    setSteps((s) => [...s, step])
    setSelectedId(step.id)
  }

  function updateSelected(patch: Partial<EditStep>) {
    setSteps((s) => s.map((st) => (st.id === selectedId ? { ...st, ...patch } : st)))
  }
  function updateConfig(key: string, value: unknown) {
    setSteps((s) =>
      s.map((st) => (st.id === selectedId ? { ...st, config: { ...st.config, [key]: value } } : st)),
    )
  }
  function deleteSelected() {
    if (!selectedId) return
    setSteps((s) => s.filter((st) => st.id !== selectedId))
    setEdges((e) => e.filter((ed) => ed.from_step !== selectedId && ed.to_step !== selectedId))
    setSelectedId(null)
  }
  function addEdge(from: string, to: string) {
    if (from === to) return
    setEdges((e) =>
      e.some((ed) => ed.from_step === from && ed.to_step === to) ? e : [...e, { from_step: from, to_step: to }],
    )
  }

  function onNodeClick(id: string) {
    if (connectFrom && connectFrom !== id) {
      addEdge(connectFrom, id)
      setConnectFrom(null)
    } else {
      setSelectedId(id)
    }
  }

  // pointer drag to move nodes
  function onPointerDown(e: React.PointerEvent, step: EditStep) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { id: step.id, sx: e.clientX, sy: e.clientY, ox: step.x, oy: step.y, moved: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true
    setSteps((s) => s.map((st) => (st.id === d.id ? { ...st, x: Math.max(0, d.ox + dx), y: Math.max(0, d.oy + dy) } : st)))
  }
  function onPointerUp(step: EditStep) {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) onNodeClick(step.id)
  }

  // --- actions ---------------------------------------------------------------
  const graphPayload = (): Graph => ({ steps, edges })

  async function save(): Promise<boolean> {
    if (!pid) return false
    setBusy(true); setMsg(null)
    try {
      await pipelineApi.putGraph(pid, graphPayload())
      setMsg("已保存")
      return true
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function validate() {
    if (!(await save())) return
    const r = await pipelineApi.validate(pid)
    setMsg(r.ok ? "校验通过：" + r.message : "校验失败：" + r.message)
  }

  async function run() {
    if (!(await save())) return
    setBusy(true)
    try {
      const started = await pipelineApi.run(pid)
      for (let i = 0; i < 60; i++) {
        const d = await pipelineApi.getRun(started.id)
        setStepStatus(Object.fromEntries((d.step_runs ?? []).map((s) => [s.step_id, s.status])))
        setMsg("运行中… " + d.status)
        if (d.status === "success" || d.status === "failed") {
          setMsg(d.status === "success" ? "运行成功" : "运行失败：" + (d.error ?? ""))
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "运行失败")
    } finally {
      setBusy(false)
    }
  }

  async function newPipeline() {
    const name = window.prompt("新管道名称", "未命名管道")
    if (!name) return
    const p = await pipelineApi.create(name)
    setPipelines((list) => [p, ...list])
    setPid(p.id)
    setSteps([]); setEdges([]); setSelectedId(null); setStepStatus({})
  }

  async function switchPipeline(id: string) {
    setPid(id)
    await loadGraph(id)
  }

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="管道构建器"
        desc="拖拽节点、连线、配置，编译为 dbt 运行"
        icon={<WorkflowIcon />}
        actions={
          <>
            <select
              value={pid}
              onChange={(e) => switchPipeline(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={newPipeline}><PlusIcon /> 新建</Button>
            <Button size="sm" variant="outline" disabled={busy || !pid} onClick={save}><SaveIcon /> 保存</Button>
            <Button size="sm" variant="outline" disabled={busy || !pid} onClick={validate}>校验</Button>
            <Button size="sm" disabled={busy || !pid} onClick={run}><PlayIcon /> 运行</Button>
          </>
        }
      />

      {msg && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">{msg}</div>
      )}

      {/* node palette */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND) as StepKind[]).map((k) => {
          const K = KIND[k]
          return (
            <Button key={k} size="sm" variant="outline" onClick={() => addNode(k)}>
              <K.icon /> + {K.label}
            </Button>
          )
        })}
        {connectFrom && (
          <Badge variant="info">连线中：点击目标节点（点空白取消）</Badge>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* canvas */}
        <div
          className="relative min-h-[440px] min-w-0 overflow-auto rounded-xl border border-border bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]"
          onPointerMove={onPointerMove}
          onClick={() => setConnectFrom(null)}
        >
            <div className="relative" style={{ width: 1200, height: 600 }}>
              <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L7,3 L0,6" fill="var(--color-muted-foreground)" />
                  </marker>
                </defs>
                {edges.map((e, i) => {
                  const a = steps.find((n) => n.id === e.from_step)
                  const b = steps.find((n) => n.id === e.to_step)
                  if (!a || !b) return null
                  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
                  const x2 = b.x, y2 = b.y + NODE_H / 2
                  const mx = (x1 + x2) / 2
                  const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
                  return (
                    <g key={i} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                       onClick={() => setEdges((es) => es.filter((_, j) => j !== i))}>
                      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                      <path d={d} fill="none" stroke="var(--color-muted-foreground)" strokeOpacity={0.5}
                            strokeWidth={1.5} markerEnd="url(#arrow)" />
                    </g>
                  )
                })}
              </svg>

              {steps.map((n) => {
                const k = KIND[n.kind]
                const ring = stepStatus[n.id] ? STATUS_RING[stepStatus[n.id]] : ""
                const isFrom = connectFrom === n.id
                return (
                  <div
                    key={n.id}
                    onPointerDown={(e) => onPointerDown(e, n)}
                    onPointerUp={() => onPointerUp(n)}
                    className={`absolute flex touch-none items-center gap-2 rounded-lg border-2 bg-card px-3 shadow-sm ${k.color} ${ring} ${
                      selectedId === n.id ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""
                    } ${isFrom ? "ring-2 ring-sky-400" : ""}`}
                    style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H, cursor: "grab" }}
                  >
                    <k.icon className="size-4 shrink-0" />
                    <div className="min-w-0 text-left">
                      <div className="truncate text-sm font-medium text-foreground">{n.label ?? n.id}</div>
                      <div className="text-[11px] text-muted-foreground">{k.label}</div>
                    </div>
                    {/* connect handle */}
                    <button
                      title="从此节点连线"
                      onPointerDown={(e) => { e.stopPropagation() }}
                      onClick={(e) => { e.stopPropagation(); setConnectFrom(n.id) }}
                      className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-border bg-background hover:bg-emerald-500"
                    />
                  </div>
                )
              })}

              {steps.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  从上方添加节点开始构建
                </div>
              )}
            </div>
          </div>

        {/* config panel */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {React.createElement(KIND[selected.kind].icon, { className: `size-4 ${KIND[selected.kind].color.split(" ")[1]}` })}
                  <Badge variant="outline">{KIND[selected.kind].label}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={deleteSelected}><Trash2Icon /></Button>
              </div>

              <Field label="名称">
                <input value={selected.label ?? ""} onChange={(e) => updateSelected({ label: e.target.value })} className={inputCls} />
              </Field>

              {selected.kind === "source" && (
                <Field label="数据集">
                  <select value={String(selected.config.dataset_id ?? "")} onChange={(e) => updateConfig("dataset_id", e.target.value)} className={inputCls}>
                    <option value="">（选择数据集）</option>
                    {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              )}

              {selected.kind === "transform" && (
                <Field label="SQL（从 input 查询）">
                  <textarea value={String(selected.config.sql ?? "")} onChange={(e) => updateConfig("sql", e.target.value)} rows={6} className={`${inputCls} font-mono`} />
                </Field>
              )}

              {selected.kind === "join" && (
                <>
                  <Field label="连接类型">
                    <select value={String(selected.config.type ?? "inner")} onChange={(e) => updateConfig("type", e.target.value)} className={inputCls}>
                      <option value="inner">inner</option>
                      <option value="left">left</option>
                    </select>
                  </Field>
                  <Field label="左键"><input value={String(selected.config.left_key ?? "")} onChange={(e) => updateConfig("left_key", e.target.value)} className={inputCls} /></Field>
                  <Field label="右键"><input value={String(selected.config.right_key ?? "")} onChange={(e) => updateConfig("right_key", e.target.value)} className={inputCls} /></Field>
                </>
              )}

              {selected.kind === "output" && (
                <Field label="输出数据集名"><input value={String(selected.config.name ?? "")} onChange={(e) => updateConfig("name", e.target.value)} className={inputCls} /></Field>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">选择一个节点编辑，或添加新节点。<br />点节点右侧圆点开始连线。</div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

const inputCls = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
