export type WidgetType = "heading" | "metric" | "chart" | "table" | "button"

export type WidgetConfig = {
  title: string
  bindObject: string
  dataSource: string
  refresh: string
}

export type Widget = {
  id: string
  type: WidgetType
  config: WidgetConfig
}

export type Section = {
  id: string
  widgets: Widget[]
}

export type AppDraft = {
  name: string
  sections: Section[]
}

export const MAX_COLUMNS = 3

// Stub binding options — the shape of the future ontology read contract.
export const BIND_OBJECTS = ["设备 Device", "订单 Order", "供应商 Supplier"]
export const DATA_SOURCES = ["pipeline_maintenance", "erp_orders", "iot_sensor_stream", "crm_customers"]
export const REFRESH_MODES = ["实时", "每分钟", "手动"]

export const WIDGET_META: Record<WidgetType, { label: string; defaultTitle: string }> = {
  heading: { label: "标题", defaultTitle: "新标题" },
  metric: { label: "指标卡", defaultTitle: "新指标" },
  chart: { label: "图表", defaultTitle: "新图表" },
  table: { label: "对象表", defaultTitle: "对象列表" },
  button: { label: "操作按钮", defaultTitle: "执行操作" },
}

export function createWidget(type: WidgetType): Widget {
  return {
    id: crypto.randomUUID(),
    type,
    config: {
      title: WIDGET_META[type].defaultTitle,
      bindObject: BIND_OBJECTS[0],
      dataSource: DATA_SOURCES[0],
      refresh: REFRESH_MODES[0],
    },
  }
}

export function createSection(widgets: Widget[]): Section {
  return { id: crypto.randomUUID(), widgets }
}

// First entry and reset both start from a blank canvas.
export function emptyDraft(): AppDraft {
  return { name: "未命名应用", sections: [] }
}

// The app takes its name from the first heading widget (the canvas title),
// falling back to a placeholder.
export function draftName(draft: AppDraft): string {
  for (const s of draft.sections) {
    for (const w of s.widgets) {
      if (w.type === "heading" && w.config.title.trim()) return w.config.title.trim()
    }
  }
  return "未命名应用"
}
