"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  LayoutTemplateIcon,
  PlusIcon,
  PencilIcon,
  ExternalLinkIcon,
  Trash2Icon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react"

import { appBuilderApi, type AppSummary } from "@/lib/app-builder-api"
import { useCurrentUser } from "@/components/current-user"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("zh-CN", { hour12: false })
}

// Management view: authoring lives here (create / edit / publish / delete, and
// the builder entry). Lists apps owned by the current user; admins see all and
// each card is tagged with its owner.
export default function MyAppsPage() {
  const router = useRouter()
  const { me } = useCurrentUser()
  const username = me?.username ?? null
  const canAdmin = me?.permissions.can_admin ?? false

  const [apps, setApps] = React.useState<AppSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  // New-app inline form state.
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  // Two-click delete confirmation: holds the id awaiting a second click.
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)
  // Per-card in-flight flag (publish/delete) to disable buttons.
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

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setSubmitting(true)
    try {
      const app = await appBuilderApi.createApp({ name })
      router.push(`/apps/builder/${app.id}`)
    } catch (e) {
      setError(String((e as Error).message))
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
        title="我的应用"
        desc={canAdmin ? "管理全部业务应用 · 搭建 / 发布 / 删除" : "管理你创建的应用 · 搭建 / 发布 / 删除"}
        icon={<LayoutTemplateIcon />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCwIcon className={loading ? "animate-spin" : ""} /> 刷新
            </Button>
            <Button size="sm" onClick={() => setCreating((v) => !v)}>
              <PlusIcon /> 新建应用
            </Button>
          </>
        }
      />

      {creating && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
          <Input
            autoFocus
            placeholder="输入应用名称，如「招聘看板」"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            className="max-w-xs"
          />
          <Button size="sm" onClick={() => void handleCreate()} disabled={submitting || !newName.trim()}>
            {submitting ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} 创建并编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreating(false)
              setNewName("")
            }}
          >
            取消
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> 加载中…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          还没有应用。点击右上角「新建应用」开始搭建。
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {visible.map((app) => (
            <div key={app.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-heading text-sm font-medium" title={app.name}>
                    {app.name}
                  </div>
                  {app.description && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground" title={app.description}>
                      {app.description}
                    </div>
                  )}
                </div>
                {app.published ? (
                  <Badge variant="success">已发布</Badge>
                ) : (
                  <Badge variant="secondary">草稿</Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>版本 v{app.version}</span>
                {app.owner && <span>· 创建者 {app.owner}</span>}
                <span>· 更新于 {formatTime(app.updated_at)}</span>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => router.push(`/apps/${app.id}`)}
                >
                  <ExternalLinkIcon /> 打开
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => router.push(`/apps/builder/${app.id}`)}
                >
                  <PencilIcon /> 编辑
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void togglePublish(app)}
                  disabled={busyId === app.id}
                >
                  {app.published ? "取消发布" : "发布"}
                </Button>
                <Button
                  size="xs"
                  variant={confirmDelete === app.id ? "destructive" : "ghost"}
                  onClick={() => void handleDelete(app)}
                  onBlur={() => setConfirmDelete(null)}
                  disabled={busyId === app.id}
                >
                  <Trash2Icon /> {confirmDelete === app.id ? "确认删除？" : "删除"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
