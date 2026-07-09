"use client"

import * as React from "react"
import {
  addEdge,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
} from "@xyflow/react"
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
  type GraphEdge,
  type GraphStep,
  type Pipeline,
  type StepKind,
} from "@/lib/pipeline-api"
import { FlowCanvas } from "@/components/flow/flow-canvas"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const NODE_W = 128
const NODE_H = 44

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

const DEFAULT_CONFIG: Record<StepKind, Record<string, unknown>> = {
  source: { dataset_id: "" },
  transform: { sql: "select * from input" },
  join: { type: "inner", left_key: "", right_key: "" },
  output: { name: "" },
}

type PipeData = { label: string; kind: StepKind; config: Record<string, unknown>; status?: string }

const pd = (n: Node) => n.data as unknown as PipeData

function newId(): string {
  return "n_" + Math.random().toString(36).slice(2, 9)
}

// --- domain <-> React Flow conversions ---------------------------------------
function stepToNode(s: GraphStep): Node {
  return {
    id: s.id,
    type: "pipeline",
    position: { x: s.x, y: s.y },
    data: { label: s.label ?? s.id, kind: s.kind, config: s.config } as unknown as Record<string, unknown>,
  }
}
function nodeToStep(n: Node): GraphStep {
  const d = pd(n)
  return { id: n.id, kind: d.kind, config: d.config, label: d.label, x: Math.round(n.position.x), y: Math.round(n.position.y) }
}
const toRfEdge = (e: GraphEdge): Edge => ({ id: `${e.from_step}__${e.to_step}`, source: e.from_step, target: e.to_step })
const fromRfEdge = (e: Edge): GraphEdge => ({ from_step: e.source, to_step: e.target })

// --- custom node -------------------------------------------------------------
function PipelineNode({ data, selected }: NodeProps) {
  const d = data as unknown as PipeData
  const k = KIND[d.kind]
  const ring = d.status ? STATUS_RING[d.status] : ""
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border-2 bg-card px-2 shadow-sm ${k.color} ${ring} ${
        selected ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""
      }`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-border !bg-background" />
      <k.icon className="size-3.5 shrink-0" />
      <div className="min-w-0 text-left">
        <div className="truncate text-xs font-medium text-foreground">{d.label}</div>
        <div className="text-[10px] text-muted-foreground">{k.label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-border !bg-background" />
    </div>
  )
}

export default function PipelinePage() {
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([])
  const [pid, setPid] = React.useState<string>("")
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [datasets, setDatasets] = React.useState<Dataset[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [stepStatus, setStepStatus] = React.useState<Record<string, string>>({})
  const [msg, setMsg] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const nodeTypes = React.useMemo<NodeTypes>(() => ({ pipeline: PipelineNode }), [])
  const selected = nodes.find((n) => n.id === selectedId) ?? null
  const sel = selected ? pd(selected) : null

  const loadGraph = React.useCallback(
    async (id: string) => {
      const g = await pipelineApi.graph(id)
      setNodes(g.steps.map(stepToNode))
      setEdges(g.edges.map(toRfEdge))
      setSelectedId(null)
      const runs = await pipelineApi.runs(id)
      if (runs[0]) {
        const d = await pipelineApi.getRun(runs[0].id)
        setStepStatus(Object.fromEntries((d.step_runs ?? []).map((s) => [s.step_id, s.status])))
      } else setStepStatus({})
    },
    [setNodes, setEdges],
  )

  React.useEffect(() => {
    ;(async () => {
      try {
        const [list, ds] = await Promise.all([pipelineApi.list(), dataApi.datasets({ pageSize: 100 })])
        setPipelines(list)
        setDatasets(ds.items)
        if (list[0]) {
          setPid(list[0].id)
          await loadGraph(list[0].id)
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "加载失败")
      }
    })()
  }, [loadGraph])

  // reflect run status onto node borders
  React.useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => {
        const st = stepStatus[n.id]
        if (pd(n).status === st) return n
        return { ...n, data: { ...n.data, status: st } }
      }),
    )
  }, [stepStatus, setNodes])

  // --- editing ---------------------------------------------------------------
  function addNode(kind: StepKind) {
    const i = nodes.length
    const node: Node = {
      id: newId(),
      type: "pipeline",
      position: { x: 80 + (i % 5) * 48, y: 60 + (i % 5) * 48 },
      data: { label: KIND[kind].label, kind, config: { ...DEFAULT_CONFIG[kind] } } as unknown as Record<string, unknown>,
    }
    setNodes((ns) => [...ns, node])
    setSelectedId(node.id)
  }

  function patchData(patch: Partial<PipeData>) {
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)))
  }
  function updateConfig(key: string, value: unknown) {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedId ? { ...n, data: { ...n.data, config: { ...pd(n).config, [key]: value } } } : n,
      ),
    )
  }
  function deleteSelected() {
    if (!selectedId) return
    setNodes((ns) => ns.filter((n) => n.id !== selectedId))
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }

  const onConnect = React.useCallback<OnConnect>(
    (conn) => setEdges((es) => addEdge(conn, es)),
    [setEdges],
  )
  const onNodeClick = React.useCallback((_e: React.MouseEvent, node: Node) => setSelectedId(node.id), [])

  // --- actions ---------------------------------------------------------------
  const graphPayload = (): Graph => ({ steps: nodes.map(nodeToStep), edges: edges.map(fromRfEdge) })

  async function save(): Promise<boolean> {
    if (!pid) return false
    setBusy(true)
    setMsg(null)
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
    setNodes([])
    setEdges([])
    setSelectedId(null)
    setStepStatus({})
  }

  async function switchPipeline(id: string) {
    setPid(id)
    await loadGraph(id)
  }

  async function deletePipeline() {
    if (!pid) return
    const name = pipelines.find((p) => p.id === pid)?.name ?? ""
    if (!window.confirm(`确认删除管道「${name}」？此操作不可撤销。`)) return
    setBusy(true)
    setMsg(null)
    try {
      await pipelineApi.remove(pid)
      const list = await pipelineApi.list()
      setPipelines(list)
      if (list[0]) {
        setPid(list[0].id)
        await loadGraph(list[0].id)
      } else {
        setPid("")
        setNodes([])
        setEdges([])
        setSelectedId(null)
        setStepStatus({})
      }
      setMsg("已删除")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "删除失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageContainer>
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
            <Button size="sm" variant="outline" disabled={busy || !pid} onClick={deletePipeline}><Trash2Icon /> 删除</Button>
            <Button size="sm" variant="outline" disabled={busy || !pid} onClick={save}><SaveIcon /> 保存</Button>
            <Button size="sm" variant="outline" disabled={busy || !pid} onClick={validate}>校验</Button>
            <Button size="sm" disabled={busy || !pid} onClick={run}><PlayIcon /> 运行</Button>
          </>
        }
      />

      {msg && <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">{msg}</div>}

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
        <Badge variant="outline" className="ml-auto">拖拽节点右侧手柄连线 · 滚轮缩放 · 拖空白平移</Badge>
      </div>

      <div className="grid h-[clamp(380px,52vh,600px)] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          setNodes={setNodes}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedId(null)}
          direction="LR"
          emptyHint="从上方添加节点开始构建"
        />

        {/* config panel */}
        <div className="flex flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4">
          {sel ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {React.createElement(KIND[sel.kind].icon, { className: `size-4 ${KIND[sel.kind].color.split(" ")[1]}` })}
                  <Badge variant="outline">{KIND[sel.kind].label}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={deleteSelected}><Trash2Icon /></Button>
              </div>

              <Field label="名称">
                <input value={sel.label ?? ""} onChange={(e) => patchData({ label: e.target.value })} className={inputCls} />
              </Field>

              {sel.kind === "source" && (
                <Field label="数据集">
                  <select value={String(sel.config.dataset_id ?? "")} onChange={(e) => updateConfig("dataset_id", e.target.value)} className={inputCls}>
                    <option value="">（选择数据集）</option>
                    {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              )}

              {sel.kind === "transform" && (
                <Field label="SQL（从 input 查询）">
                  <textarea value={String(sel.config.sql ?? "")} onChange={(e) => updateConfig("sql", e.target.value)} rows={6} className={`${inputCls} font-mono`} />
                </Field>
              )}

              {sel.kind === "join" && (
                <>
                  <Field label="连接类型">
                    <select value={String(sel.config.type ?? "inner")} onChange={(e) => updateConfig("type", e.target.value)} className={inputCls}>
                      <option value="inner">inner</option>
                      <option value="left">left</option>
                    </select>
                  </Field>
                  <Field label="左键"><input value={String(sel.config.left_key ?? "")} onChange={(e) => updateConfig("left_key", e.target.value)} className={inputCls} /></Field>
                  <Field label="右键"><input value={String(sel.config.right_key ?? "")} onChange={(e) => updateConfig("right_key", e.target.value)} className={inputCls} /></Field>
                </>
              )}

              {sel.kind === "output" && (
                <Field label="输出数据集名"><input value={String(sel.config.name ?? "")} onChange={(e) => updateConfig("name", e.target.value)} className={inputCls} /></Field>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">选择一个节点编辑，或添加新节点。<br />拖节点右侧手柄到目标节点即可连线。</div>
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
