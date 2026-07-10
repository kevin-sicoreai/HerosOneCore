"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { Render, type Data } from "@measured/puck"
import { Loader2Icon, ArrowLeftIcon, PencilIcon } from "lucide-react"

import { analysisApi, type AnalysisTable, type Metric } from "@/lib/analysis-api"
import { appBuilderApi, type AppDetail } from "@/lib/app-builder-api"
import { buildConfig } from "@/components/app-blocks"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Button } from "@/components/ui/button"

const EMPTY_DATA: Data = { content: [], root: {} }

function parseDefinition(raw: string): Data {
  try {
    const d = JSON.parse(raw)
    return { content: d.content ?? [], root: d.root ?? {}, ...d }
  } catch {
    return EMPTY_DATA
  }
}

export default function AppRuntimePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [app, setApp] = React.useState<AppDetail | null>(null)
  const [config, setConfig] = React.useState<ReturnType<typeof buildConfig> | null>(null)
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [detail, metrics, tables] = await Promise.all([
          appBuilderApi.getApp(id),
          analysisApi.metrics().catch(() => [] as Metric[]),
          analysisApi.tables().catch(() => [] as AnalysisTable[]),
        ])
        if (!active) return
        setApp(detail)
        setConfig(buildConfig(metrics, tables))
        setData(parseDefinition(detail.definition))
      } catch (e) {
        if (active) setError(String((e as Error).message))
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  if (error)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>加载失败：{error}</span>
        <Button size="sm" variant="outline" onClick={() => router.push("/apps")}>
          <ArrowLeftIcon /> 返回目录
        </Button>
      </div>
    )

  if (!app || !config || !data)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> 加载应用…
      </div>
    )

  return (
    <PageContainer>
      <PageHeading
        title={app.name}
        desc={app.description ?? undefined}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => router.push("/apps")}>
              <ArrowLeftIcon /> 目录
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push(`/apps/builder/${id}`)}>
              <PencilIcon /> 编辑
            </Button>
          </>
        }
      />

      {!app.published && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          未发布（仅预览）——该应用尚未发布，此处为草稿预览。
        </div>
      )}

      {data.content.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          这个应用还没有内容。前往编辑器添加组件。
        </div>
      ) : (
        <Render config={config} data={data} />
      )}
    </PageContainer>
  )
}
