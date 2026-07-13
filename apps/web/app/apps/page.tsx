"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LayoutGridIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { appBuilderApi, type AppSummary } from "@/lib/app-builder-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Button } from "@/components/ui/button"

// Consumption view: lists only published apps and opens them straight into the
// runtime. All authoring (create / edit / publish / delete) lives on
// /apps/builder.
export default function AppsCatalogPage() {
  const router = useRouter()
  const [apps, setApps] = React.useState<AppSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const all = await appBuilderApi.listApps()
      // Client-side filter to published only (the list endpoint returns all).
      setApps(all.filter((a) => a.published))
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <PageContainer>
      <PageHeading
        title="应用目录"
        desc="浏览并运行已发布的业务应用"
        icon={<LayoutGridIcon />}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCwIcon className={loading ? "animate-spin" : ""} /> 刷新
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> 加载中…
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          还没有已发布的应用。前往
          <Link href="/apps/builder" className="mx-1 text-emerald-500 hover:underline">
            应用构建器
          </Link>
          创建并发布。
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => router.push(`/apps/${app.id}`)}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-emerald-500/40 hover:bg-muted/40"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <LayoutGridIcon className="size-4.5" />
                </span>
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
              </div>
              {app.owner && (
                <div className="mt-auto text-xs text-muted-foreground">创建者 {app.owner}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
