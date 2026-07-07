"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, XIcon } from "lucide-react"

import { MAX_COLUMNS, type Section, type Widget } from "@/lib/app-builder/types"
import { WidgetView } from "./widget-view"

function SortableWidget({
  widget,
  sectionId,
  selected,
  onSelect,
  onRemove,
}: {
  widget: Widget
  sectionId: string
  selected: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    data: { kind: "widget", sectionId, label: widget.config.title },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(widget.id)
      }}
      className={`group/widget relative cursor-grab rounded-lg border bg-card p-3 active:cursor-grabbing ${
        selected ? "border-emerald-500 ring-1 ring-emerald-500/40" : "border-border"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove(widget.id)
        }}
        className="absolute -right-1.5 -top-1.5 z-10 hidden size-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-red-500/20 hover:text-red-500 group-hover/widget:flex"
        aria-label="删除组件"
      >
        <XIcon className="size-3" />
      </button>
      <WidgetView widget={widget} />
    </div>
  )
}

export function SectionRow({
  section,
  highlight,
  selectedId,
  onSelect,
  onRemoveWidget,
  onRemoveSection,
}: {
  section: Section
  highlight: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onRemoveWidget: (id: string) => void
  onRemoveSection: (id: string) => void
}) {
  const sortable = useSortable({
    id: section.id,
    data: { kind: "section", label: "区块" },
  })
  const body = useDroppable({
    id: `sec-body:${section.id}`,
    data: { kind: "section-body", sectionId: section.id },
  })

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className={`group/section relative ${sortable.isDragging ? "opacity-40" : ""}`}
    >
      <div className="absolute -left-6 top-1/2 hidden -translate-y-1/2 flex-col gap-1 group-hover/section:flex">
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          className="cursor-grab rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="拖动区块"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <button
          onClick={() => onRemoveSection(section.id)}
          className="rounded p-0.5 text-muted-foreground hover:text-red-500"
          aria-label="删除区块"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div
        ref={body.setNodeRef}
        className={`rounded-lg border-2 border-dashed p-2 transition-colors ${
          highlight || body.isOver
            ? section.widgets.length >= MAX_COLUMNS
              ? "border-amber-500/70 bg-amber-500/5" // full row: drop will be rejected
              : "border-emerald-500/70 bg-emerald-500/5"
            : "border-border"
        }`}
      >
        <SortableContext items={section.widgets.map((w) => w.id)} strategy={horizontalListSortingStrategy}>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${section.widgets.length}, minmax(0, 1fr))` }}
          >
            {section.widgets.map((w) => (
              <SortableWidget
                key={w.id}
                widget={w}
                sectionId={section.id}
                selected={selectedId === w.id}
                onSelect={onSelect}
                onRemove={onRemoveWidget}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
