"use client"

import * as React from "react"
import Link from "next/link"
import {
  BlocksIcon,
  BoxesIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FolderIcon,
  PlugIcon,
  Share2Icon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react"

import { dataApi } from "@/lib/data-api"
import { ontologyApi } from "@/lib/ontology-api"
import { pipelineApi } from "@/lib/pipeline-api"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label} className="gap-2 py-3">
            <CardContent className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <s.icon className="size-4.5" />
              </span>
              <div>
                <div className="text-xl font-semibold tracking-tight">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderIcon className="size-4 text-muted-foreground" /> 项目资源树
            </CardTitle>
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

        <Card className="border-emerald-500/30 bg-emerald-500/[0.04]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-emerald-500" /> AIP 建议
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[
              "点开任意资源，查看其血缘、权限与审计",
              "在本体管理器中把数据集建成对象类型并连接关系",
              "在管道构建中新建转换，产出分析所需的宽表",
            ].map((t, i) => (
              <Link
                key={i}
                href="/assist"
                className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-emerald-500/40"
              >
                <BlocksIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>{t}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
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
        className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-2 py-1.5 text-sm last:border-0 hover:bg-muted/50"
        style={{ paddingLeft: 8 + depth * 18 }}
        onClick={() => (isFolder ? setExpanded((v) => !v) : open({ name: node.name, kind: KIND_LABEL[node.kind] }))}
      >
        {isFolder ? (
          <ChevronRightIcon className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className={`size-4 ${isFolder ? "text-muted-foreground" : "text-emerald-500"}`} />
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
