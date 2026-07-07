"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

import type { AppDraft } from "@/lib/app-builder/types"
import { SectionRow } from "./section-row"

function GapZone({ index, active }: { index: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `gap:${index}`,
    data: { kind: "gap", index },
  })
  return (
    <div
      ref={setNodeRef}
      className={`rounded transition-all ${
        isOver ? "h-8 bg-emerald-500/15 outline-2 outline-dashed outline-emerald-500/60" : active ? "h-3" : "h-1"
      }`}
    />
  )
}

export function Canvas({
  draft,
  dragActive,
  overSectionId,
  selectedId,
  onSelect,
  onRemoveWidget,
  onRemoveSection,
}: {
  draft: AppDraft
  dragActive: boolean
  overSectionId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onRemoveWidget: (id: string) => void
  onRemoveSection: (id: string) => void
}) {
  return (
    <div
      className="min-h-[440px] overflow-auto rounded-xl border border-border bg-muted/20 p-5 pl-10"
      onClick={() => onSelect(null)}
    >
      <div className="mx-auto max-w-2xl">
        <SortableContext items={draft.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {draft.sections.map((s, i) => (
            <div key={s.id}>
              <GapZone index={i} active={dragActive} />
              <SectionRow
                section={s}
                highlight={overSectionId === s.id}
                selectedId={selectedId}
                onSelect={onSelect}
                onRemoveWidget={onRemoveWidget}
                onRemoveSection={onRemoveSection}
              />
            </div>
          ))}
          <GapZone index={draft.sections.length} active={dragActive} />
        </SortableContext>
        {draft.sections.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            从左侧拖入组件开始搭建
          </div>
        )}
      </div>
    </div>
  )
}
