"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  BlocksIcon,
  BoxesIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FolderIcon,
  Share2Icon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react"

import { KIND_LABEL, RESOURCE_TREE, type Resource, type ResourceKind } from "@/lib/mock"
import { useWorkspace } from "@/components/workspace-context"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const KIND_ICON: Record<ResourceKind, React.ElementType> = {
  folder: FolderIcon,
  dataset: DatabaseIcon,
  "object-type": Share2Icon,
  pipeline: WorkflowIcon,
  application: BlocksIcon,
}

const STATS = [
  { label: "数据集", value: "128", icon: DatabaseIcon },
  { label: "本体对象类型", value: "42", icon: Share2Icon },
  { label: "运行中管道", value: "17", icon: WorkflowIcon },
  { label: "已发布应用", value: "9", icon: BlocksIcon },
]

export default function HomePage() {
  const { workspace } = useWorkspace()

  return (
    <PageContainer>
      <PageHeading
        title={workspace.name}
        desc={`${workspace.desc} · 一切资源挂在同一套本体上，打开工具即操作资源`}
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
            <div className="rounded-lg border border-border">
              {RESOURCE_TREE.map((r) => (
                <TreeRow key={r.id} node={r} depth={0} />
              ))}
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
              "12 台设备近30天故障率显著上升，建议复查维护管道",
              "crm_customers 有 3 个字段未接入本体，是否补建对象？",
              "Salesforce 连接器同步失败，点击查看原因",
            ].map((t, i) => (
              <Link
                key={i}
                href="/assist"
                className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-emerald-500/40"
              >
                <ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>{t}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

function TreeRow({ node, depth }: { node: Resource; depth: number }) {
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
          <ChevronRightIcon
            className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className={`size-4 ${isFolder ? "text-muted-foreground" : "text-emerald-500"}`} />
        <span className="flex-1 truncate">{node.name}</span>
        {!isFolder && (
          <Badge variant="outline" className="text-[10px]">
            {KIND_LABEL[node.kind]}
          </Badge>
        )}
        <span className="hidden text-xs text-muted-foreground sm:inline">{node.owner}</span>
      </div>
      {isFolder && expanded && node.children?.map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  )
}
