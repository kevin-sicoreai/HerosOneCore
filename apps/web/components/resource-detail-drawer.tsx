"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ClockIcon,
  FingerprintIcon,
  GitCommitVerticalIcon,
  LockIcon,
  Share2Icon,
  UsersIcon,
} from "lucide-react"

import { governanceApi, type AuditEntry, type Lineage, type Role } from "@/lib/governance-api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// lineageKey: lineage and audit are type/dataset-level, not per-instance, so an
// object drawer passes its object *type* name here to match the governance graph
// (the title still shows `name`, the instance). Omitted → match by `name`.
type ResourceRef = { name: string; kind?: string; lineageKey?: string }

type Ctx = {
  open: (r: ResourceRef) => void
}

const ResourceDrawerContext = React.createContext<Ctx | null>(null)

export function useResourceDrawer() {
  const ctx = React.useContext(ResourceDrawerContext)
  if (!ctx) throw new Error("useResourceDrawer must be used within provider")
  return ctx
}

export function ResourceDrawerProvider({ children }: { children: React.ReactNode }) {
  const [resource, setResource] = React.useState<ResourceRef | null>(null)
  const [open, setOpen] = React.useState(false)

  // Real governance data (no mock fallback — show honest empty/error states).
  const [roles, setRoles] = React.useState<Role[]>([])
  const [audit, setAudit] = React.useState<AuditEntry[]>([])
  const [lineage, setLineage] = React.useState<Lineage>({ nodes: [], edges: [] })
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const api = React.useMemo<Ctx>(
    () => ({
      open: (r) => {
        setResource(r)
        setOpen(true)
      },
    }),
    []
  )

  React.useEffect(() => {
    if (!open || !resource) return
    setLoading(true)
    setFailed(false)
    Promise.all([governanceApi.roles(), governanceApi.audit({ pageSize: 50 }), governanceApi.lineage()])
      .then(([r, a, l]) => {
        setRoles(r)
        setAudit(a.items)
        setLineage(l)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [open, resource])

  // Governance data is matched by the type/dataset key (lineageKey) when given,
  // else the resource's own name. Lineage/audit are type-level, so an instance
  // resolves against its object type.
  const govKey = resource?.lineageKey ?? resource?.name

  // --- lineage: full multi-level upstream/downstream (BFS by level) from the
  //     real platform lineage graph.
  const node = lineage.nodes.find((n) => n.label === govKey)

  function bfsLevels(startId: string, dir: "up" | "down"): string[][] {
    const label = (id: string) => lineage.nodes.find((n) => n.id === id)?.label ?? id
    const out: string[][] = []
    const seen = new Set([startId])
    let frontier = [startId]
    while (frontier.length) {
      const next: string[] = []
      for (const id of frontier)
        for (const e of lineage.edges) {
          const nbr = dir === "up" ? (e.to_id === id ? e.from_id : null) : (e.from_id === id ? e.to_id : null)
          if (nbr && !seen.has(nbr)) {
            seen.add(nbr)
            next.push(nbr)
          }
        }
      if (next.length) out.push(next.map(label))
      frontier = next
    }
    return out
  }

  const upLevels = node ? bfsLevels(node.id, "up") : []
  const downLevels = node ? bfsLevels(node.id, "down") : []

  // --- access: real platform roles ---
  const accessRows = roles.map((r) => ({
    role: r.name,
    members: r.members,
    read: r.can_read,
    write: r.can_write,
    admin: r.can_admin,
  }))

  // --- audit: real entries (prefer ones about this resource) ---
  const forResource = audit.filter((a) => a.target === govKey)
  const auditRows = (forResource.length ? forResource : audit).slice(0, 10).map((a) => ({
    action: a.action,
    sub: `${a.source} · ${a.target}`,
    time: a.time ? a.time.slice(0, 19).replace("T", " ") : "",
  }))

  return (
    <ResourceDrawerContext.Provider value={api}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {resource?.name ?? "资源"}
              <Badge variant="brand">{resource?.kind ?? "对象"}</Badge>
            </SheetTitle>
            <SheetDescription>
              治理信息随资源横切呈现 · 血缘 / 权限 / 审计
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {failed && (
              <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                无法连接治理服务
              </div>
            )}
            <Tabs defaultValue="lineage">
              <TabsList className="w-full">
                <TabsTrigger value="lineage" className="flex-1">
                  <Share2Icon /> 血缘
                </TabsTrigger>
                <TabsTrigger value="access" className="flex-1">
                  <LockIcon /> 权限
                </TabsTrigger>
                <TabsTrigger value="audit" className="flex-1">
                  <ClockIcon /> 审计
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lineage" className="pt-3">
                {/* Order matters: while loading, show neither the empty flow
                    ("无上游/无下游") nor the not-found note — both would flash
                    misleading states before the graph arrives. */}
                {loading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">加载血缘…</p>
                ) : !node ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">该资源不在血缘图中</p>
                ) : (
                  <LineageFlow up={upLevels} down={downLevels} current={govKey ?? "当前资源"} />
                )}
              </TabsContent>

              <TabsContent value="access" className="pt-3">
                <div className="space-y-2">
                  {accessRows.length === 0 && !loading && (
                    <p className="py-6 text-center text-sm text-muted-foreground">暂无权限数据</p>
                  )}
                  {accessRows.map((g) => (
                    <div
                      key={g.role}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <UsersIcon className="size-4 text-muted-foreground" />
                        <span>{g.role}</span>
                        <span className="text-xs text-muted-foreground">
                          {g.members} 人
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {g.read && <Badge variant="info">读</Badge>}
                        {g.write && <Badge variant="warning">写</Badge>}
                        {g.admin && <Badge variant="danger">管理</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="audit" className="pt-3">
                {auditRows.length === 0 && !loading && (
                  <p className="py-6 text-center text-sm text-muted-foreground">暂无审计记录</p>
                )}
                <ol className="relative space-y-4 border-l border-border pl-4">
                  {auditRows.map((a, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 flex size-3 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-background" />
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FingerprintIcon className="size-3.5 text-muted-foreground" />
                        {a.action}
                      </div>
                      <div className="text-xs text-muted-foreground">{a.sub}</div>
                      <div className="text-xs text-muted-foreground/70">{a.time}</div>
                    </li>
                  ))}
                </ol>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    </ResourceDrawerContext.Provider>
  )
}

// A tidy vertical lineage flow: uniform full-width rows connected top-to-bottom,
// upstream above (farthest first) → current node (highlighted) → downstream below.
function LineageFlow({ up, down, current }: { up: string[][]; down: string[][]; current: string }) {
  const upDisplay = [...up].reverse() // farthest → nearest, flowing into the node
  const upEmpty = up.reduce((n, lv) => n + lv.length, 0) === 0
  const downEmpty = down.reduce((n, lv) => n + lv.length, 0) === 0

  return (
    <div className="flex flex-col gap-1">
      {upEmpty ? (
        <FlowEmpty>无上游</FlowEmpty>
      ) : (
        upDisplay.map((level, li) => (
          <React.Fragment key={`u${li}`}>
            {/* Index-composite keys: distinct lineage nodes may share a display
                label (e.g. a dataset and the object type built on it). */}
            {level.map((label, i) => <FlowRow key={`${i}-${label}`} label={label} />)}
            <FlowArrow />
          </React.Fragment>
        ))
      )}

      <FlowRow label={current} node />

      {downEmpty ? (
        <FlowEmpty>无下游</FlowEmpty>
      ) : (
        down.map((level, li) => (
          <React.Fragment key={`d${li}`}>
            <FlowArrow />
            {level.map((label, i) => <FlowRow key={`${i}-${label}`} label={label} />)}
          </React.Fragment>
        ))
      )}
    </div>
  )
}

function FlowRow({ label, node }: { label: string; node?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        node ? "border-emerald-500/40 bg-emerald-500/10 font-medium" : "border-border bg-muted/30",
      )}
    >
      {node ? (
        <GitCommitVerticalIcon className="size-4 shrink-0 text-emerald-500" />
      ) : (
        <Share2Icon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{label}</span>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="flex justify-center text-muted-foreground/40">
      <ChevronDownIcon className="size-4" />
    </div>
  )
}

function FlowEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-1.5 text-center text-xs text-muted-foreground">
      {children}
    </div>
  )
}
