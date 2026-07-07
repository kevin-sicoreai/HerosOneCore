"use client"

import * as React from "react"

import { appBuilderApi } from "@/lib/app-builder-api"
import {
  type AppDraft,
  type Widget,
  type WidgetConfig,
  type WidgetType,
  MAX_COLUMNS,
  createSection,
  createWidget,
  draftName,
  emptyDraft,
} from "./types"

export type SaveState = "loading" | "saved" | "saving" | "offline"

// All draft mutations live here. The draft persists to the app-builder
// service (debounced autosave); if the service is down the editor still works
// in memory and shows an offline notice.
export function useAppDraft() {
  const [draft, setDraft] = React.useState<AppDraft>(emptyDraft)
  const [appId, setAppId] = React.useState<string | null>(null)
  const [saveState, setSaveState] = React.useState<SaveState>("loading")
  const dirtyRef = React.useRef(false)
  const draftRef = React.useRef(draft)
  draftRef.current = draft

  // Load (or create) the working draft from the service.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const apps = await appBuilderApi.apps()
        if (cancelled) return
        if (apps.length > 0) {
          setAppId(apps[0].id)
          if (apps[0].definition?.sections) setDraft(apps[0].definition)
        } else {
          // First entry: start from a blank canvas.
          const created = await appBuilderApi.create(draftName(draftRef.current), draftRef.current)
          if (cancelled) return
          setAppId(created.id)
        }
        setSaveState("saved")
      } catch {
        if (!cancelled) setSaveState("offline")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced autosave.
  React.useEffect(() => {
    if (!dirtyRef.current || appId == null) return
    const timer = window.setTimeout(async () => {
      dirtyRef.current = false
      setSaveState("saving")
      try {
        await appBuilderApi.update(appId, draftName(draftRef.current), draftRef.current)
        setSaveState("saved")
      } catch {
        setSaveState("offline")
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [draft, appId])

  const mutate = React.useCallback((fn: (d: AppDraft) => AppDraft) => {
    dirtyRef.current = true
    setDraft(fn)
  }, [])

  const addWidgetToNewSection = React.useCallback(
    (type: WidgetType, sectionIndex: number) => {
      mutate((d) => {
        const sections = [...d.sections]
        sections.splice(sectionIndex, 0, createSection([createWidget(type)]))
        return { ...d, sections }
      })
    },
    [mutate]
  )

  const addWidgetToSection = React.useCallback(
    (type: WidgetType, sectionId: string) => {
      mutate((d) => ({
        ...d,
        sections: d.sections.map((s) =>
          s.id === sectionId && s.widgets.length < MAX_COLUMNS
            ? { ...s, widgets: [...s.widgets, createWidget(type)] }
            : s
        ),
      }))
    },
    [mutate]
  )

  const moveSection = React.useCallback(
    (fromId: string, toId: string) => {
      mutate((d) => {
        const from = d.sections.findIndex((s) => s.id === fromId)
        const to = d.sections.findIndex((s) => s.id === toId)
        if (from < 0 || to < 0 || from === to) return d
        const sections = [...d.sections]
        const [moved] = sections.splice(from, 1)
        sections.splice(to, 0, moved)
        return { ...d, sections }
      })
    },
    [mutate]
  )

  // Move a widget next to a target widget (same or different section), append
  // it to a target section, or extract it into a new section at an index.
  const moveWidget = React.useCallback(
    (
      widgetId: string,
      target: { widgetId?: string; sectionId?: string; newSectionIndex?: number }
    ) => {
      mutate((d) => {
        let moved: Widget | undefined
        let sections = d.sections.map((s) => {
          const idx = s.widgets.findIndex((w) => w.id === widgetId)
          if (idx < 0) return s
          moved = s.widgets[idx]
          return { ...s, widgets: s.widgets.filter((w) => w.id !== widgetId) }
        })
        if (!moved) return d

        if (target.newSectionIndex != null) {
          sections = sections.filter((s) => s.widgets.length > 0)
          const at = Math.min(target.newSectionIndex, sections.length)
          sections.splice(at, 0, createSection([moved]))
          return { ...d, sections }
        }

        sections = sections.map((s) => {
          if (target.widgetId) {
            const at = s.widgets.findIndex((w) => w.id === target.widgetId)
            if (at >= 0 && s.widgets.length < MAX_COLUMNS) {
              const widgets = [...s.widgets]
              widgets.splice(at, 0, moved!)
              return { ...s, widgets }
            }
            return s
          }
          if (s.id === target.sectionId && s.widgets.length < MAX_COLUMNS) {
            return { ...s, widgets: [...s.widgets, moved!] }
          }
          return s
        })

        // Target was full or missing → the widget would vanish; abort the move.
        if (!sections.some((s) => s.widgets.some((w) => w.id === widgetId))) return d
        return { ...d, sections: sections.filter((s) => s.widgets.length > 0) }
      })
    },
    [mutate]
  )

  const removeWidget = React.useCallback(
    (widgetId: string) => {
      mutate((d) => ({
        ...d,
        sections: d.sections
          .map((s) => ({ ...s, widgets: s.widgets.filter((w) => w.id !== widgetId) }))
          .filter((s) => s.widgets.length > 0),
      }))
    },
    [mutate]
  )

  const removeSection = React.useCallback(
    (sectionId: string) => {
      mutate((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== sectionId) }))
    },
    [mutate]
  )

  const updateConfig = React.useCallback(
    (widgetId: string, patch: Partial<WidgetConfig>) => {
      mutate((d) => ({
        ...d,
        sections: d.sections.map((s) => ({
          ...s,
          widgets: s.widgets.map((w) =>
            w.id === widgetId ? { ...w, config: { ...w.config, ...patch } } : w
          ),
        })),
      }))
    },
    [mutate]
  )

  const resetDraft = React.useCallback(() => mutate(() => emptyDraft()), [mutate])

  const publish = React.useCallback(async (): Promise<{ market_app_id: string }> => {
    if (appId == null) throw new Error("draft not saved yet")
    // Flush the latest draft before publishing.
    await appBuilderApi.update(appId, draftName(draftRef.current), draftRef.current)
    dirtyRef.current = false
    setSaveState("saved")
    return appBuilderApi.publish(appId)
  }, [appId])

  return {
    draft,
    saveState,
    addWidgetToNewSection,
    addWidgetToSection,
    moveSection,
    moveWidget,
    removeWidget,
    removeSection,
    updateConfig,
    resetDraft,
    publish,
  }
}

export type AppDraftStore = ReturnType<typeof useAppDraft>
