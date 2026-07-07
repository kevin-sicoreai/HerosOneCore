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

// Empty canvas: the whole hint box accepts drops (creates the first section).
function EmptyDropZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "empty-canvas",
    data: { kind: "gap", index: 0 },
  })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed p-16 text-center text-sm transition-colors ${
        isOver
          ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-500"
          : active
            ? "border-emerald-500/40 text-muted-foreground"
            : "border-border text-muted-foreground"
      }`}
    >
      {isOver ? "松开即可添加组件" : "从左侧拖入组件开始搭建"}
    </div>
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
        {draft.sections.length === 0 ? (
          <EmptyDropZone active={dragActive} />
        ) : (
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
        )}
      </div>
    </div>
  )
}
