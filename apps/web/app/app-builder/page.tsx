"use client"

import * as React from "react"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  BlocksIcon,
  CheckIcon,
  CloudOffIcon,
  EyeIcon,
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
  StoreIcon,
} from "lucide-react"

import { useAppDraft } from "@/lib/app-builder/store"
import { DATA_SOURCES, type WidgetType } from "@/lib/app-builder/types"
import { dataApi } from "@/lib/data-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Canvas } from "@/components/app-builder/canvas"
import { ConfigPanel } from "@/components/app-builder/config-panel"
import { Palette } from "@/components/app-builder/palette"
import { DefinitionView } from "@/components/app-builder/widget-view"

type DragData = { kind: "palette" | "section" | "widget"; type?: WidgetType; label?: string }

export default function AppBuilderPage() {
  const store = useAppDraft()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [published, setPublished] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [active, setActive] = React.useState<DragData | null>(null)
  const [overSectionId, setOverSectionId] = React.useState<string | null>(null)
  // Real dataset catalog from the data service; stub options when unavailable.
  const [dataSources, setDataSources] = React.useState<string[]>(DATA_SOURCES)

  React.useEffect(() => {
    dataApi
      .datasets()
      .then((ds) => {
        if (ds.length > 0) setDataSources(ds.map((d) => d.name))
      })
      .catch(() => {})
  }, [])

  // Small activation distance so plain clicks still select widgets.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const selectedWidget =
    store.draft.sections.flatMap((s) => s.widgets).find((w) => w.id === selectedId) ?? null

  function handleDragStart(e: DragStartEvent) {
    setActive((e.active.data.current as DragData) ?? null)
  }

  // Highlight the whole section while hovering anywhere inside it (its body
  // or one of its widgets) so "drop here joins this row" is discoverable.
  function handleDragOver(e: DragOverEvent) {
    const o = e.over?.data.current as { sectionId?: string } | undefined
    setOverSectionId(o?.sectionId ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setActive(null)
    setOverSectionId(null)
    const a = e.active.data.current as DragData | undefined
    const over = e.over
    if (!a || !over) return
    const o = over.data.current as
      | { kind: "gap"; index: number }
      | { kind: "section-body"; sectionId: string }
      | { kind: "section" }
      | { kind: "widget"; sectionId: string }
      | undefined

    if (a.kind === "palette" && a.type) {
      if (o?.kind === "gap") store.addWidgetToNewSection(a.type, o.index)
      else if (o?.kind === "widget") store.addWidgetToSection(a.type, o.sectionId)
      else if (o?.kind === "section-body") store.addWidgetToSection(a.type, o.sectionId)
    } else if (a.kind === "section") {
      if (o?.kind === "section") store.moveSection(String(e.active.id), String(over.id))
    } else if (a.kind === "widget") {
      if (o?.kind === "gap") store.moveWidget(String(e.active.id), { newSectionIndex: o.index })
      else if (o?.kind === "widget" && over.id !== e.active.id)
        store.moveWidget(String(e.active.id), { widgetId: String(over.id) })
      else if (o?.kind === "section-body")
        store.moveWidget(String(e.active.id), { sectionId: o.sectionId })
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setPublished(false)
    try {
      await store.publish()
      setPublished(true)
    } catch {
      setNotice("发布失败：构建器服务不可用")
      window.setTimeout(() => setNotice(null), 3000)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <PageContainer className="h-full">
      <PageHeading
        title="应用构建器"
        desc="低代码搭建业务应用 —— 页面 · 区块 · 组件，绑定本体对象"
        icon={<BlocksIcon />}
        actions={
          <div className="flex items-center gap-2">
            {notice && <Badge variant="warning">{notice}</Badge>}
            {store.saveState === "offline" && (
              <Badge variant="warning">
                <CloudOffIcon /> 服务未启动 · 修改不保存
              </Badge>
            )}
            {store.saveState === "saving" && (
              <span className="text-xs text-muted-foreground">保存中…</span>
            )}
            {store.saveState === "saved" && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckIcon className="size-3.5 text-emerald-500" /> 已保存
              </span>
            )}
            {published && (
              <Badge variant="brand">
                <StoreIcon />
                <Link href="/marketplace" className="hover:underline">
                  已发布 · 去市场查看
                </Link>
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={store.resetDraft}>
              <RotateCcwIcon /> 重置
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreview((v) => !v)}>
              {preview ? (
                <>
                  <PencilIcon /> 继续编辑
                </>
              ) : (
                <>
                  <EyeIcon /> 预览
                </>
              )}
            </Button>
            <Button size="sm" onClick={handlePublish} disabled={publishing || store.saveState === "offline"}>
              {publishing ? <Loader2Icon className="animate-spin" /> : null} 发布
            </Button>
          </div>
        }
      />

      {preview ? (
        <div className="min-h-[440px] overflow-auto rounded-xl border border-border bg-background p-5">
          <DefinitionView draft={store.draft} />
        </div>
      ) : (
        <DndContext
          id="app-builder-dnd"
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActive(null)
            setOverSectionId(null)
          }}
        >
          <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr_260px] gap-4">
            <Palette />
            <Canvas
              draft={store.draft}
              dragActive={active != null}
              overSectionId={overSectionId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRemoveWidget={(id) => {
                store.removeWidget(id)
                if (selectedId === id) setSelectedId(null)
              }}
              onRemoveSection={store.removeSection}
            />
            <ConfigPanel widget={selectedWidget} dataSources={dataSources} onChange={store.updateConfig} />
          </div>
          {/* dropAnimation disabled: the rAF-driven animation never finishes in
              throttled/background tabs, leaving a stuck overlay that blocks
              the next drag. */}
          <DragOverlay dropAnimation={null}>
            {active && (
              <div className="rounded-lg border border-emerald-500/60 bg-card px-3 py-2 text-sm shadow-lg">
                {active.label ?? "组件"}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </PageContainer>
  )
}
