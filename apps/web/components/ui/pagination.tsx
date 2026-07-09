"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  pages: number
  onPageChange: (page: number) => void
  className?: string
}

// Build a compact page list: first, last, current ±1, with "…" gaps.
function pageItems(current: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const items: (number | "…")[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(pages - 1, current + 1)
  if (start > 2) items.push("…")
  for (let p = start; p <= end; p++) items.push(p)
  if (end < pages - 1) items.push("…")
  items.push(pages)
  return items
}

export function Pagination({
  page,
  pageSize,
  total,
  pages,
  onPageChange,
  className,
}: PaginationProps) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground",
        className
      )}
    >
      <span>
        第 {from}–{to} 条 · 共 {total} 条
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeftIcon />
        </Button>
        {pageItems(page, pages).map((it, i) =>
          it === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground/60">
              …
            </span>
          ) : (
            <Button
              key={it}
              size="icon-sm"
              variant={it === page ? "default" : "ghost"}
              onClick={() => onPageChange(it)}
              aria-current={it === page ? "page" : undefined}
            >
              {it}
            </Button>
          )
        )}
        <Button
          size="icon-sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}
