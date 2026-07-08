"use client"

import * as React from "react"
import {
  ArrowRightIcon,
  ClockIcon,
  FingerprintIcon,
  GitCommitVerticalIcon,
  LockIcon,
  Share2Icon,
  UsersIcon,
} from "lucide-react"

import { governanceApi, type AuditEntry, type Lineage, type Role } from "@/lib/governance-api"
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

  // Real governance data (falls back to mock if the service is unavailable).
  const [roles, setRoles] = React.useState<Role[]>([])
  const [audit, setAudit] = React.useState<AuditEntry[]>([])
  const [lineage, setLineage] = React.useState<Lineage>({ nodes: [], edges: [] })

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
    Promise.all([governanceApi.roles(), governanceApi.audit(50), governanceApi.lineage()])
      .then(([r, a, l]) => {
        setRoles(r)
        setAudit(a)
        setLineage(l)
      })
      .catch(() => {})
  }, [open, resource])

  // Governance data is matched by the type/dataset key (lineageKey) when given,
  // else the resource's own name. Lineage/audit are type-level, so an instance
  // resolves against its object type. No mock fallback — show real data or empty.
  const govKey = resource?.lineageKey ?? resource?.name

  // --- lineage: upstream (incoming edges) and downstream (outgoing edges) ---
  const node = lineage.nodes.find((n) => n.label === govKey)
  const upstreamItems = node
    ? lineage.edges
        .filter((e) => e.to_id === node.id)
        .map((e) => lineage.nodes.find((n) => n.id === e.from_id)?.label)
        .filter((x): x is string => !!x)
    : []
  const downstreamItems = node
    ? lineage.edges
        .filter((e) => e.from_id === node.id)
        .map((e) => lineage.nodes.find((n) => n.id === e.to_id)?.label)
        .filter((x): x is string => !!x)
    : []

  // --- access: real platform roles ---
  const accessRows = roles.map((r) => ({
    role: r.name,
    members: r.members,
    read: r.can_read,
    write: r.can_write,
    admin: r.can_admin,
  }))

  // --- audit: real entries about this resource/type ---
  const auditRows = audit
    .filter((a) => a.target === govKey)
    .slice(0, 10)
    .map((a) => ({
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
                {node ? (
                  <div className="space-y-3">
                    <LineageBlock title="上游" items={upstreamItems} />
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium">
                      <GitCommitVerticalIcon className="size-4 text-emerald-500" />
                      {node.label}
                    </div>
                    <LineageBlock title="下游" items={downstreamItems} />
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">暂无血缘信息</div>
                )}
              </TabsContent>

              <TabsContent value="access" className="pt-3">
                <div className="space-y-2">
                  {accessRows.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">暂无角色权限信息</div>
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
                {auditRows.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">暂无审计记录</div>
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

function LineageBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div
            key={it}
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm"
          >
            <ArrowRightIcon className="size-3.5 text-muted-foreground" />
            {it}
          </div>
        ))}
      </div>
    </div>
  )
}
