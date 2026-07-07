"use client"

import {
  BIND_OBJECTS,
  REFRESH_MODES,
  WIDGET_META,
  type Widget,
  type WidgetConfig,
} from "@/lib/app-builder/types"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

const SELECT_CLASS =
  "w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500/60"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

export function ConfigPanel({
  widget,
  dataSources,
  onChange,
}: {
  widget: Widget | null
  // Dataset names from the data service; falls back to the stub list.
  dataSources: string[]
  onChange: (id: string, patch: Partial<WidgetConfig>) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-xs font-medium text-muted-foreground">组件配置</div>
      {widget == null ? (
        <div className="text-sm text-muted-foreground">点击画布中的组件进行配置</div>
      ) : (
        <>
          <Badge variant="brand" className="mb-3">
            {WIDGET_META[widget.type].label}
          </Badge>
          <div className="space-y-2 text-sm">
            <Field label="标题">
              <Input
                value={widget.config.title}
                onChange={(e) => onChange(widget.id, { title: e.target.value })}
              />
            </Field>
            <Field label="绑定对象">
              <select
                className={SELECT_CLASS}
                value={widget.config.bindObject}
                onChange={(e) => onChange(widget.id, { bindObject: e.target.value })}
              >
                {BIND_OBJECTS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="数据源">
              <select
                className={SELECT_CLASS}
                value={widget.config.dataSource}
                onChange={(e) => onChange(widget.id, { dataSource: e.target.value })}
              >
                {/* Keep the widget's saved value selectable even if it's not in the current catalog. */}
                {(dataSources.includes(widget.config.dataSource)
                  ? dataSources
                  : [widget.config.dataSource, ...dataSources]
                ).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="刷新">
              <select
                className={SELECT_CLASS}
                value={widget.config.refresh}
                onChange={(e) => onChange(widget.id, { refresh: e.target.value })}
              >
                {REFRESH_MODES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}
    </div>
  )
}
