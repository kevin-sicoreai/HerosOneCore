"use client"

import { MapIcon } from "lucide-react"

import { type AnalysisColumn } from "@/lib/analysis-api"

// Object-set lenses shared by the analysis workbench and the object browser.
// Both render the same current object set two ways — a newest-first timeline and
// a geographic distribution — so the implementation lives here once and is
// imported in both places.

// Timeline: a newest-first slice of the object set, fetched server-side ordered
// by the time property (at most a couple hundred rows).
export function TimelineView({
  rows,
  columns,
  timeCol,
}: {
  rows: Record<string, unknown>[]
  columns: AnalysisColumn[]
  timeCol: AnalysisColumn
}) {
  // Title column: prefer a "name" column, else the first column (primary key).
  const titleCol = columns.find((c) => c.name === "name") ?? columns[0]
  // A few other dimension columns for the subtitle (excluding time + title).
  const subCols = columns
    .filter(
      (c) => c.kind === "dimension" && c.name !== timeCol.name && c.name !== titleCol?.name
    )
    .slice(0, 3)

  const items = rows
    .map((row) => ({
      time: String(row[timeCol.name] ?? ""),
      title: String(row[titleCol?.name ?? ""] ?? ""),
      sub: subCols.map((c) => `${c.label}: ${row[c.name] ?? "—"}`).join(" · "),
    }))
    .filter((it) => it.time !== "")

  const shown = items.slice(0, 100)

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto mb-4 max-w-2xl text-xs text-muted-foreground">
        按 {timeCol.label} 排列 · 共 {items.length} 条（截取前 100）
      </div>
      <ol className="relative mx-auto max-w-2xl space-y-5 border-l-2 border-border pl-6">
        {shown.map((t, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-card" />
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{t.time}</span>
            </div>
            <div className="text-sm font-medium">{t.title}</div>
            {t.sub && <div className="text-sm text-muted-foreground">{t.sub}</div>}
          </li>
        ))}
      </ol>
    </div>
  )
}

// Approximate percentage coordinates for the demo map (not a real projection);
// they roughly mirror each location's relative position within China.
export const GEO_COORDS: Record<string, { x: number; y: number }> = {
  上海: { x: 78, y: 58 },
  北京: { x: 66, y: 30 },
  广州: { x: 68, y: 82 },
  成都: { x: 38, y: 62 },
  武汉: { x: 62, y: 58 },
  西安: { x: 50, y: 44 },
  沈阳: { x: 78, y: 20 },
  杭州: { x: 77, y: 62 },
  深圳: { x: 70, y: 84 },
  重庆: { x: 45, y: 62 },
  华东: { x: 75, y: 58 },
  华北: { x: 64, y: 30 },
  华南: { x: 68, y: 82 },
  西南: { x: 42, y: 62 },
  海外: { x: 90, y: 88 },
}

// Map: geo counts computed server-side (count aggregate grouped by the geo
// property); click a point to drill in.
export function MapView({
  counts,
  geoCol,
  onDrill,
}: {
  counts: { value: string; count: number }[]
  geoCol: AnalysisColumn
  onDrill: (value: string) => void
}) {
  const known: { value: string; count: number; x: number; y: number }[] = []
  const unknown: { value: string; count: number }[] = []
  for (const { value, count } of counts) {
    if (value.trim() === "") continue
    const c = GEO_COORDS[value]
    if (c) known.push({ value, count, x: c.x, y: c.y })
    else unknown.push({ value, count })
  }
  // Point size buckets by count.
  const sizeFor = (n: number) => (n <= 5 ? 8 : n <= 50 ? 14 : 22)

  return (
    <div className="relative h-full min-h-[440px] overflow-hidden bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:40px_40px]">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-emerald-500/5" />
      <div className="absolute top-3 left-3 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
        <MapIcon className="mr-1 inline size-3.5" /> 地理分布 · {known.length} 个位置 · 按 {geoCol.label}
      </div>
      {known.map((p) => {
        const size = sizeFor(p.count)
        return (
          <button
            key={p.value}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onClick={() => onDrill(p.value)}
            title={`下钻到 ${p.value}`}
          >
            <span className="block rounded-full bg-emerald-500" style={{ width: size, height: size }} />
            <span className="whitespace-nowrap text-xs text-foreground">
              {p.value} · {p.count}
            </span>
          </button>
        )
      })}
      {unknown.length > 0 && (
        <div className="absolute right-3 bottom-3 left-3 flex flex-wrap gap-1.5">
          {unknown.map((u) => (
            <span
              key={u.value}
              className="rounded-md border border-border bg-card/90 px-2 py-0.5 text-xs text-muted-foreground backdrop-blur"
            >
              未识别位置：{u.value} · {u.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
