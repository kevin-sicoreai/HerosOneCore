"use client"

import type { Widget } from "@/lib/app-builder/types"
import { Button } from "@/components/ui/button"

// Static sample values until real data binding lands (via ontology later).
const SAMPLE_BARS = [40, 65, 52, 78, 60, 88, 72]
const SAMPLE_ROWS = [
  ["DV-10231", "告警"],
  ["DV-10240", "告警"],
  ["DV-10255", "维护中"],
]

export function WidgetView({ widget }: { widget: Widget }) {
  const { title, bindObject, dataSource } = widget.config

  switch (widget.type) {
    case "heading":
      return (
        <div className="px-1 py-0.5">
          <div className="text-base font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">
            绑定 {bindObject} · {dataSource}
          </div>
        </div>
      )
    case "metric":
      return (
        <div className="px-1 py-0.5">
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="text-lg font-semibold">94.2%</div>
        </div>
      )
    case "chart":
      return (
        <div className="px-1 py-0.5">
          <div className="mb-1.5 text-xs text-muted-foreground">{title}</div>
          <div className="flex h-24 items-end gap-1.5">
            {SAMPLE_BARS.map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-emerald-500/70" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      )
    case "table":
      return (
        <div className="px-1 py-0.5">
          <div className="mb-1.5 text-xs text-muted-foreground">{title}</div>
          <div className="space-y-1.5">
            {SAMPLE_ROWS.map(([id, status]) => (
              <div key={id} className="flex justify-between border-b border-border/60 py-1 text-xs last:border-0">
                <span className="font-mono text-emerald-500">{id}</span>
                <span className="text-muted-foreground">{status}</span>
              </div>
            ))}
          </div>
        </div>
      )
    case "button":
      return (
        <div className="px-1 py-1">
          <Button size="sm" tabIndex={-1}>
            {title}
          </Button>
        </div>
      )
  }
}

// Read-only rendering of a full definition; shared by the builder preview and
// the marketplace runtime page.
export function DefinitionView({ draft }: { draft: { sections: { id: string; widgets: Widget[] }[] } }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {draft.sections.map((s) => (
        <div
          key={s.id}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${s.widgets.length}, minmax(0, 1fr))` }}
        >
          {s.widgets.map((w) => (
            <div key={w.id} className="rounded-lg border border-border bg-card p-3">
              <WidgetView widget={w} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
