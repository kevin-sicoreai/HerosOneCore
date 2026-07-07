"use client"

import * as React from "react"
import { BoxesIcon, SearchIcon } from "lucide-react"

import { ontologyApi, type GraphNode, type ObjectList, type OntologyGraph } from "@/lib/ontology-api"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"

export default function ExplorerPage() {
  const { open } = useResourceDrawer()
  const [graph, setGraph] = React.useState<OntologyGraph>({ nodes: [], links: [] })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [instances, setInstances] = React.useState<ObjectList | null>(null)
  const [q, setQ] = React.useState("")
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    ontologyApi
      .graph()
      .then((g) => {
        setGraph(g)
        if (g.nodes[0]) setSelectedId(g.nodes[0].id)
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    setQ("")
    if (!selectedId) { setInstances(null); return }
    ontologyApi.objects(selectedId, 100).then(setInstances).catch(() => setInstances(null))
  }, [selectedId])

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) ?? null
  const primaryKeyCol = instances?.columns[0]
  const rows =
    instances?.rows.filter((r) =>
      q === "" || Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
    ) ?? []

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="对象浏览器"
        desc="浏览本体对象的真实实例，点击任一对象查看详情与治理"
        icon={<BoxesIcon />}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* Filter rail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">对象类型</div>
            <div className="space-y-0.5">
              {graph.nodes.map((t: GraphNode) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                    selectedId === t.id ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{t.display_name}</span>
                  <span className="text-xs text-muted-foreground">{t.instance_count ?? "—"}</span>
                </button>
              ))}
              {!loading && graph.nodes.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无对象类型，请先在本体管理器中创建</div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索…"
                className="h-8 w-full rounded-lg border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">{rows.length} 个对象</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  {instances?.columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() =>
                      open({
                        name: primaryKeyCol ? String(r[primaryKeyCol] ?? "") : String(i),
                        kind: `${selectedNode?.display_name ?? "对象"}对象`,
                      })
                    }
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                  >
                    {instances?.columns.map((c, j) => (
                      <td key={c} className={j === 0 ? "px-3 py-2 font-mono text-emerald-500" : "px-3 py-2"}>
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {instances && rows.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">无匹配对象</div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
