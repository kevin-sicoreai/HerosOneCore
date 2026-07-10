"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { Puck, type Data } from "@measured/puck"
import "@measured/puck/puck.css"
import { Loader2Icon, ArrowLeftIcon, ExternalLinkIcon, SaveIcon } from "lucide-react"

import { analysisApi, type AnalysisTable, type Metric } from "@/lib/analysis-api"
import { appBuilderApi, type AppDetail } from "@/lib/app-builder-api"
import { buildConfig } from "@/components/app-blocks"
import { Button } from "@/components/ui/button"

type SaveState = "saved" | "dirty" | "saving" | "error"

const EMPTY_DATA: Data = { content: [], root: {} }

function parseDefinition(raw: string): Data {
  try {
    const d = JSON.parse(raw)
    return { content: d.content ?? [], root: d.root ?? {}, ...d }
  } catch {
    return EMPTY_DATA
  }
}

export default function AppBuilderPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [app, setApp] = React.useState<AppDetail | null>(null)
  const [config, setConfig] = React.useState<ReturnType<typeof buildConfig> | null>(null)
  const [initialData, setInitialData] = React.useState<Data | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [saveState, setSaveState] = React.useState<SaveState>("saved")

  // Latest editor document, kept in a ref so the toolbar Save button can read it
  // without re-rendering Puck on every keystroke.
  const latest = React.useRef<Data>(EMPTY_DATA)

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
        const data = parseDefinition(detail.definition)
        latest.current = data
        setApp(detail)
        setConfig(buildConfig(metrics, tables))
        setInitialData(data)
      } catch (e) {
        if (active) setLoadError(String((e as Error).message))
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  const save = React.useCallback(
    async (data: Data) => {
      setSaveState("saving")
      try {
        const updated = await appBuilderApi.updateApp(id, {
          definition: JSON.stringify(data),
        })
        setApp(updated)
        setSaveState("saved")
      } catch {
        setSaveState("error")
      }
    },
    [id]
  )

  if (loadError)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>加载失败：{loadError}</span>
        <Button size="sm" variant="outline" onClick={() => router.push("/apps")}>
          <ArrowLeftIcon /> 返回目录
        </Button>
      </div>
    )

  if (!app || !config || !initialData)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> 加载编辑器…
      </div>
    )

  const saveLabel: Record<SaveState, string> = {
    saved: `已保存 · v${app.version}`,
    dirty: "有未保存改动",
    saving: "保存中…",
    error: "保存失败",
  }

  return (
    // Full-height editor: Puck fills the content area below the app top bar.
    <div className="flex h-full flex-col">
      <Puck
        config={config}
        data={initialData}
        headerTitle={app.name}
        // No iframe: keep a single native experience so our Tailwind styling
        // applies to previewed platform components (architecture principle).
        iframe={{ enabled: false }}
        onChange={(data) => {
          latest.current = data
          setSaveState((s) => (s === "saving" ? s : "dirty"))
        }}
        onPublish={(data) => void save(data)}
        renderHeaderActions={() => (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{saveLabel[saveState]}</span>
            <Button size="sm" variant="outline" onClick={() => router.push(`/apps/${id}`)}>
              <ExternalLinkIcon /> 预览
            </Button>
            <Button size="sm" onClick={() => void save(latest.current)} disabled={saveState === "saving"}>
              {saveState === "saving" ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} 保存
            </Button>
          </div>
        )}
      />
    </div>
  )
}
