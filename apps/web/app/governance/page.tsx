"use client"

import * as React from "react"
import {
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
import { ClockIcon, KeyIcon, LockIcon, ScrollTextIcon, Share2Icon, ShieldCheckIcon, UsersIcon } from "lucide-react"

import { governanceApi, type AuditEntry, type Lineage, type Role, type Stats } from "@/lib/governance-api"
import { FlowCanvas } from "@/components/flow/flow-canvas"
import { layoutWithDagre } from "@/components/flow/flow-layout"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TYPE_META: Record<string, { label: string; cls: string }> = {
  connector: { label: "连接器", cls: "border-sky-500/60 text-sky-500" },
  dataset: { label: "数据集", cls: "border-emerald-500/60 text-emerald-500" },
  pipeline: { label: "管道", cls: "border-amber-500/60 text-amber-500" },
  mart: { label: "产出表", cls: "border-violet-500/60 text-violet-500" },
  object_type: { label: "对象类型", cls: "border-rose-500/60 text-rose-500" },
}

// Read-only lineage node: colored by asset type.
function LineageNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; kind: string }
  const m = TYPE_META[d.kind] ?? TYPE_META.dataset
  return (
    <div className={`flex h-[44px] w-[132px] flex-col justify-center rounded-lg border-2 bg-card px-2 ${m.cls}`}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-border !bg-background" />
      <div className="truncate text-[11px] font-semibold text-foreground">{d.label}</div>
      <div className="truncate text-[9px] text-muted-foreground">{m.label}</div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-border !bg-background" />
    </div>
  )
}

export default function GovernancePage() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [roles, setRoles] = React.useState<Role[]>([])
  const [lineage, setLineage] = React.useState<Lineage>({ nodes: [], edges: [] })
  const [audit, setAudit] = React.useState<AuditEntry[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const nodeTypes = React.useMemo<NodeTypes>(() => ({ lineage: LineageNode }), [])
  const noop = React.useCallback<OnConnect>(() => {}, [])

  React.useEffect(() => {
    ;(async () => {
      try {
        const [s, r, l, a] = await Promise.all([
          governanceApi.stats(), governanceApi.roles(), governanceApi.lineage(), governanceApi.audit(),
        ])
        setStats(s); setRoles(r); setLineage(l); setAudit(a)
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败")
      }
    })()
  }, [])

  // build React Flow state from the lineage graph and pre-lay-out with dagre so
  // nodes enter the store already positioned (fitView then zooms to the whole graph).
  React.useEffect(() => {
    const rawNodes: Node[] = lineage.nodes.map((n) => ({
      id: n.id,
      type: "lineage",
      position: { x: 0, y: 0 },
      data: { label: n.label, kind: n.type } as unknown as Record<string, unknown>,
    }))
    const rawEdges: Edge[] = lineage.edges.map((e, i) => ({ id: `e${i}`, source: e.from_id, target: e.to_id }))
    setNodes(layoutWithDagre(rawNodes, rawEdges, "LR"))
    setEdges(rawEdges)
  }, [lineage, setNodes, setEdges])

  const cards = [
    { k: "受控资源", v: stats?.governed_assets ?? "—", icon: LockIcon },
    { k: "角色", v: stats?.roles ?? "—", icon: UsersIcon },
    { k: "审计事件", v: stats?.audit_events ?? "—", icon: ScrollTextIcon },
    { k: "加密覆盖", v: stats?.encryption_coverage ?? "—", icon: KeyIcon },
  ]

  return (
    <PageContainer>
      <PageHeading
        title="治理后台"
        desc="安全与治理横切全平台 · 权限 · 血缘 · 审计 · 加密合规"
        icon={<ShieldCheckIcon />}
      />

      {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">无法连接 governance 服务：{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((m) => (
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

      <Tabs defaultValue="lineage">
        <TabsList>
          <TabsTrigger value="lineage"><Share2Icon /> 数据血缘</TabsTrigger>
          <TabsTrigger value="access"><LockIcon /> 权限矩阵</TabsTrigger>
          <TabsTrigger value="audit"><ClockIcon /> 审计日志</TabsTrigger>
        </TabsList>

        <TabsContent value="lineage" className="pt-3">
          <Card>
            <CardHeader><CardTitle>全平台数据血缘（{lineage.nodes.length} 资产 · {lineage.edges.length} 关系）</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[clamp(380px,52vh,600px)]">
                <FlowCanvas
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={noop}
                  setNodes={setNodes}
                  nodesConnectable={false}
                  deleteKeyCode={null}
                  direction="LR"
                  emptyHint={error ? "无法连接 governance 服务" : "暂无血缘数据"}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
                  {roles.map((g) => (
                    <tr key={g.name} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-medium">{g.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{g.members} 人</td>
                      <Cell on={g.can_read} /><Cell on={g.can_write} /><Cell on={g.can_admin} />
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <th className="px-4 py-2 text-left font-medium">操作人</th>
                    <th className="px-4 py-2 text-left font-medium">来源</th>
                    <th className="px-4 py-2 text-left font-medium">操作</th>
                    <th className="px-4 py-2 text-left font-medium">对象</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{a.time ? a.time.slice(0, 19).replace("T", " ") : "—"}</td>
                      <td className="px-4 py-2">{a.actor}</td>
                      <td className="px-4 py-2"><Badge variant="outline">{a.source}</Badge></td>
                      <td className="px-4 py-2">{a.action}</td>
                      <td className="px-4 py-2 text-muted-foreground">{a.target}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">暂无审计事件</td></tr>}
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
