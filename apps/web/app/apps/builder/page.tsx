"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import { appBuilderApi, type AppSummary } from "@/lib/app-builder-api"
import { useCurrentUser } from "@/components/current-user"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("zh-CN", { hour12: false })
}

// A labelled form row (mirrors the partner data page's Field helper).
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  )
}

// App builder landing / management view: authoring lives here (create / edit /
// publish / delete, and the builder is entered here). Lists apps owned by the
// current user; admins see all and each row is tagged with its owner.
export default function AppBuilderHomePage() {
  const router = useRouter()
  const { me } = useCurrentUser()
  const username = me?.username ?? null
  const canAdmin = me?.permissions.can_admin ?? false

  const [apps, setApps] = React.useState<AppSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  // Client-side search over app name.
  const [query, setQuery] = React.useState("")
  // New-app sheet state.
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  // Two-click delete confirmation: holds the id awaiting a second click.
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)
  // Per-row in-flight flag (publish/delete) to disable buttons.
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setApps(await appBuilderApi.listApps())
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // Client-side ownership filter: admins see everything; others see only apps
  // they own (the list endpoint returns all — no backend change).
  const visible = React.useMemo(
    () => (canAdmin ? apps : apps.filter((a) => a.owner && a.owner === username)),
    [apps, canAdmin, username],
  )

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visible
    return visible.filter((a) => a.name.toLowerCase().includes(q))
  }, [visible, query])

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setSubmitting(true)
    setCreateError(null)
    try {
      const app = await appBuilderApi.createApp({ name })
      router.push(`/apps/builder/${app.id}`)
    } catch (e) {
      setCreateError(String((e as Error).message))
      setSubmitting(false)
    }
  }

  async function togglePublish(app: AppSummary) {
    setBusyId(app.id)
    try {
      if (app.published) await appBuilderApi.unpublishApp(app.id)
      else await appBuilderApi.publishApp(app.id)
      await load()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(app: AppSummary) {
    if (confirmDelete !== app.id) {
      setConfirmDelete(app.id)
      return
    }
    setBusyId(app.id)
    try {
      await appBuilderApi.deleteApp(app.id)
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageContainer>
      <PageHeading
        title="应用构建器"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCwIcon className={loading ? "animate-spin" : ""} /> 刷新
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setNewName("")
                setCreateError(null)
                setCreating(true)
              }}
            >
              <PlusIcon /> 新建应用
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>我的应用 ({visible.length})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="按名称搜索"
                className="h-8 w-40 pl-7"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-y border-border">
                <th className="px-4 py-2.5 text-left font-medium">名称</th>
                <th className="px-4 py-2.5 text-left font-medium">状态</th>
                <th className="px-4 py-2.5 text-right font-medium">版本</th>
                <th className="px-4 py-2.5 text-left font-medium">创建者</th>
                <th className="px-4 py-2.5 text-right font-medium">更新时间</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    {loading ? "加载中…" : "暂无数据"}
                  </td>
                </tr>
              )}
              {filtered.map((app) => (
                <tr
                  key={app.id}
                  onClick={() => router.push(`/apps/builder/${app.id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-2.5 font-medium">
                    {app.name}
                    {app.description && (
                      <span className="ml-2 max-w-60 truncate align-middle text-xs text-muted-foreground">
                        {app.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {app.published ? (
                      <Badge variant="success">已发布</Badge>
                    ) : (
                      <Badge variant="secondary">草稿</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">v{app.version}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{app.owner ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                    {formatTime(app.updated_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/apps/${app.id}`)
                        }}
                      >
                        <ExternalLinkIcon /> 打开
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busyId === app.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          void togglePublish(app)
                        }}
                      >
                        {app.published ? "取消发布" : "发布"}
                      </Button>
                      <Button
                        size="xs"
                        variant={confirmDelete === app.id ? "destructive" : "ghost"}
                        disabled={busyId === app.id}
                        onBlur={() => setConfirmDelete(null)}
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(app)
                        }}
                      >
                        <Trash2Icon /> {confirmDelete === app.id ? "确认删除？" : "删除"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* New-app sheet */}
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle>新建应用</SheetTitle>
            <SheetDescription>创建后将直接进入构建器进行编辑。</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
            <Field label="应用名称" required>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
                placeholder="例如：招聘看板"
              />
            </Field>

            {createError && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {createError}
              </div>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <SheetClose render={<Button variant="outline" size="sm" />}>取消</SheetClose>
            <Button size="sm" onClick={() => void handleCreate()} disabled={submitting || !newName.trim()}>
              {submitting ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} 创建并编辑
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageContainer>
  )
}
