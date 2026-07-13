"use client"

import * as React from "react"
import {
  ClockIcon,
  ExternalLinkIcon,
  KeyIcon,
  LockIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  SearchIcon,
  Share2Icon,
  UsersIcon,
} from "lucide-react"

import { authApi, type AuthRole } from "@/lib/auth-api"
import {
  governanceApi,
  type AuditPage,
  type CatalogStatus,
  type Lineage,
  type Stats,
} from "@/lib/governance-api"
import { LineageExplorer } from "@/components/lineage-explorer"
import { PageContainer } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/ui/pagination"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const AUDIT_PAGE_SIZE = 20

// Known event sources for the audit filter (system-synthesized + service writes).
const AUDIT_SOURCES = [
  { value: "", label: "全部来源" },
  { value: "data", label: "数据接入" },
  { value: "pipeline", label: "管道" },
  { value: "ontology", label: "本体" },
  { value: "governance", label: "治理" },
  { value: "auth", label: "认证" },
  { value: "analysis", label: "分析" },
]

// Debounce a fast-changing value (e.g. a search box) before it drives a fetch.
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function GovernancePage() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [lineage, setLineage] = React.useState<Lineage>({ nodes: [], edges: [] })
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    ;(async () => {
      try {
        const [s, l] = await Promise.all([governanceApi.stats(), governanceApi.lineage()])
        setStats(s); setLineage(l)
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败")
      }
    })()
  }, [])

  const cards = [
    { k: "受控资源", v: stats?.governed_assets ?? "—", icon: LockIcon },
    { k: "角色", v: stats?.roles ?? "—", icon: UsersIcon },
    { k: "审计事件", v: stats?.audit_events ?? "—", icon: ScrollTextIcon },
    { k: "加密覆盖", v: stats?.encryption_coverage ?? "—", icon: KeyIcon },
  ]

  return (
    <PageContainer className="h-full">
      <Tabs defaultValue="lineage" className="flex min-h-0 flex-1 flex-col gap-4">
        <TabsList>
          <TabsTrigger value="lineage"><Share2Icon /> 数据血缘</TabsTrigger>
          <TabsTrigger value="access"><LockIcon /> 权限矩阵</TabsTrigger>
          <TabsTrigger value="audit"><ClockIcon /> 审计日志</TabsTrigger>
        </TabsList>

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            无法连接 governance 服务：{error}
          </div>
        )}

        {/* Governance overview — shared across every tab, sits just below the tabs. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((m) => (
            <Card key={m.k} className="gap-0 py-0">
              <CardContent className="flex items-center gap-3.5 px-4 py-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <m.icon className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <div className="text-[22px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{m.v}</div>
                  <div className="mt-1.5 text-[13px] font-medium text-muted-foreground">{m.k}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <TabsContent value="lineage" className="flex min-h-0 flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle>全平台数据血缘（{lineage.nodes.length} 资产 · {lineage.edges.length} 关系）</CardTitle>
              <CardDescription>以资产为中心的上下游血缘 · 连接器 → 数据集 → 管道 → 输出 → 本体对象</CardDescription>
              <CardAction>
                <CatalogPanel />
              </CardAction>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <LineageExplorer
                lineage={lineage}
                hint={error ? "无法连接 governance 服务" : "暂无血缘数据"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access">
          <AccessMatrixTab />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

// Audit log — fetched independently with server-side pagination + filters
// (source dropdown + free-text search across actor / action / target).
function AuditTab() {
  const [data, setData] = React.useState<AuditPage | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const [source, setSource] = React.useState("")
  const [qInput, setQInput] = React.useState("")
  const q = useDebounced(qInput)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    governanceApi
      .audit({ page, pageSize: AUDIT_PAGE_SIZE, source: source || undefined, q: q || undefined })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false))
  }, [page, source, q])

  const items = data?.items ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>审计日志{data ? `（${data.total}）` : ""}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value)
                setPage(1)
              }}
              placeholder="搜索操作人/操作/对象"
              className="h-8 w-52 pl-7"
            />
          </div>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value)
              setPage(1)
            }}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {AUDIT_SOURCES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {error && <div className="px-4 pb-2 text-sm text-danger">{error}</div>}
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-y border-border">
              <th className="px-4 py-2.5 text-left font-medium">时间</th>
              <th className="px-4 py-2.5 text-left font-medium">操作人</th>
              <th className="px-4 py-2.5 text-left font-medium">来源</th>
              <th className="px-4 py-2.5 text-left font-medium">操作</th>
              <th className="px-4 py-2.5 text-left font-medium">对象</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.time ? a.time.slice(0, 19).replace("T", " ") : "—"}</td>
                <td className="px-4 py-2.5">{a.actor}</td>
                <td className="px-4 py-2.5"><Badge variant="outline">{a.source}</Badge></td>
                <td className="px-4 py-2.5">{a.action}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.target}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {loading ? "加载中…" : "暂无审计事件"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {data && (
          <Pagination
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            pages={data.pages}
            onPageChange={setPage}
          />
        )}
      </CardContent>
    </Card>
  )
}

// Metadata-catalog integration (OpenMetadata): connection badge, one-click
// full sync, and a deep link into the OM UI. Hidden when the publisher is off.
function CatalogPanel() {
  const [st, setSt] = React.useState<CatalogStatus | null>(null)
  const [syncing, setSyncing] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    governanceApi.catalogStatus().then(setSt).catch(() => setSt(null))
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const doSync = async () => {
    setSyncing(true)
    setNote(null)
    try {
      const r = await governanceApi.catalogSync()
      setNote(`已同步 ${r.tables} 表 · ${r.pipelines} 管道 · ${r.edges} 血缘`)
    } catch (e) {
      setNote(e instanceof Error ? `同步失败：${e.message}` : "同步失败")
    } finally {
      setSyncing(false)
      refresh()
    }
  }

  if (!st?.enabled) return null

  return (
    <div className="flex items-center gap-2">
      <Badge variant={st.reachable ? "success" : "danger"}>
        OpenMetadata {st.reachable ? "已连接" : "不可达"}
      </Badge>
      <span className="hidden max-w-[260px] truncate text-xs text-muted-foreground xl:inline" title={note ?? undefined}>
        {note ??
          (st.last_sync
            ? `上次同步 ${st.last_sync.replace("T", " ")}`
            : "尚未同步")}
      </span>
      <Button size="sm" variant="outline" disabled={syncing || !st.reachable} onClick={doSync}>
        <RefreshCwIcon className={syncing ? "animate-spin" : ""} /> {syncing ? "同步中…" : "同步目录"}
      </Button>
      {st.ui_url && (
        <Button
          size="sm"
          variant="ghost"
          render={<a href={st.ui_url} target="_blank" rel="noreferrer" />}
        >
          <ExternalLinkIcon /> 打开
        </Button>
      )}
    </div>
  )
}

// Access matrix — real roles from the auth service (the source of truth).
// Admins toggle capabilities in place; everyone else sees a read-only view.
function AccessMatrixTab() {
  const [rows, setRows] = React.useState<AuthRole[]>([])
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null) // "roleId:field" in flight

  React.useEffect(() => {
    authApi.roles().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
    authApi.me().then((me) => setIsAdmin(!!me?.permissions.can_admin))
  }, [])

  const toggle = async (role: AuthRole, field: "can_read" | "can_write" | "can_admin") => {
    const key = `${role.id}:${field}`
    setBusy(key)
    setError(null)
    try {
      const updated = await authApi.patchRole(role.id, { [field]: !role[field] })
      setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)))
    } catch (e) {
      // Surface guard errors (e.g. refusing to drop the last admin role).
      const msg = e instanceof Error ? e.message : "更新失败"
      setError(msg.includes("最后一个管理员") ? "不能取消最后一个管理员角色的管理权限" : msg)
    } finally {
      setBusy(null)
    }
  }

  const cell = (role: AuthRole, field: "can_read" | "can_write" | "can_admin") => {
    const on = role[field]
    const key = `${role.id}:${field}`
    if (!isAdmin) {
      return (
        <td className="px-4 py-2.5 text-center">
          {on ? <span className="text-primary">●</span> : <span className="text-muted-foreground/30">○</span>}
        </td>
      )
    }
    return (
      <td className="px-4 py-2.5 text-center">
        <button
          onClick={() => toggle(role, field)}
          disabled={busy === key}
          title={on ? "点击取消该权限" : "点击授予该权限"}
          className={`inline-flex size-6 items-center justify-center rounded-full transition-colors hover:bg-accent ${
            busy === key ? "animate-pulse" : ""
          }`}
        >
          {on ? <span className="text-primary">●</span> : <span className="text-muted-foreground/30">○</span>}
        </button>
      </td>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>权限矩阵</CardTitle>
        {error && <span className="text-sm text-danger">{error}</span>}
      </CardHeader>
      <CardContent className="px-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-y border-border">
              <th className="px-4 py-2.5 text-left font-medium">角色</th>
              <th className="px-4 py-2.5 text-left font-medium">成员</th>
              <th className="px-4 py-2.5 text-center font-medium">读</th>
              <th className="px-4 py-2.5 text-center font-medium">写</th>
              <th className="px-4 py-2.5 text-center font-medium">管理</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{g.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{g.member_count} 人</td>
                {cell(g, "can_read")}{cell(g, "can_write")}{cell(g, "can_admin")}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">加载中…</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
