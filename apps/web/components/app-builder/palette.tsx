"use client"

import { useDraggable } from "@dnd-kit/core"
import {
  ChartColumnIcon,
  GaugeIcon,
  SquareMousePointerIcon,
  TableIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react"

import { WIDGET_META, type WidgetType } from "@/lib/app-builder/types"

export const WIDGET_ICONS: Record<WidgetType, LucideIcon> = {
  heading: TypeIcon,
  metric: GaugeIcon,
  chart: ChartColumnIcon,
  table: TableIcon,
  button: SquareMousePointerIcon,
}

const TYPES = Object.keys(WIDGET_META) as WidgetType[]

function PaletteItem({ type }: { type: WidgetType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { kind: "palette", type, label: WIDGET_META[type].label },
  })
  const Icon = WIDGET_ICONS[type]
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm transition-colors hover:border-emerald-500/40 active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <Icon className="size-4 text-muted-foreground" />
      {WIDGET_META[type].label}
    </div>
  )
}

export function Palette() {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">组件 · 拖入画布</div>
      <div className="space-y-1.5">
        {TYPES.map((t) => (
          <PaletteItem key={t} type={t} />
        ))}
      </div>
    </div>
  )
}
