// Shared "search around" (Foundry-style set-level pivot) logic, used by both the
// object browser (explorer) and the analysis workbench. Given the current object
// set (a table + its filters) and a link, it collects the distinct join-key
// values of that set and compiles them into an `in` filter on the peer type — the
// same object-set the ontology's single-object neighbour traversal would reach,
// but for the whole filtered set at once.

import { analysisApi, type FilterSpec } from "@/lib/analysis-api"
import type { LinkType } from "@/lib/ontology-api"

// A pivot aborts above this many distinct keys: the resulting `in` filter would
// be unwieldy and the set too broad to be a meaningful drill-down.
export const PIVOT_KEY_LIMIT = 1000

// One traversable direction of a link, resolved relative to a base object type.
// `sourceKeyColumn` is the column whose distinct values we collect on the current
// (source) set; `targetColumn` is the column on the peer type the `in` filter
// pins. This mirrors ontology object_service.linked():
//   forward  (base == link.from): source=from_property, target=to_property
//   reverse  (base == link.to):   source=to_property,   target=from_property
export type PivotDirection = {
  link: LinkType
  // The base object type sits on the link's `to` side (traversed in reverse).
  reverse: boolean
  targetTypeId: string
  sourceKeyColumn: string
  targetColumn: string
}

// Every link touching `baseTypeId`, expanded into its traversable direction(s).
// A self-link (from === to) yields both a forward and a reverse direction.
export function pivotDirections(links: LinkType[], baseTypeId: string): PivotDirection[] {
  const out: PivotDirection[] = []
  for (const link of links) {
    if (link.from_object_type_id === baseTypeId) {
      out.push({
        link,
        reverse: false,
        targetTypeId: link.to_object_type_id,
        sourceKeyColumn: link.from_property,
        targetColumn: link.to_property,
      })
    }
    if (link.to_object_type_id === baseTypeId) {
      out.push({
        link,
        reverse: true,
        targetTypeId: link.from_object_type_id,
        sourceKeyColumn: link.to_property,
        targetColumn: link.from_property,
      })
    }
  }
  return out
}

export type PivotKeys = {
  keys: string[]
  // Total source rows matched by `filters` (for the "N 条" chip / over-limit note).
  matched: number
  overLimit: boolean
}

// Collect the distinct source-key values of the current set via an aggregate
// /analyze (group_by the key column, count). Fetches PIVOT_KEY_LIMIT + 1 groups
// so an over-limit set is detected without downloading the whole distribution.
export async function collectPivotKeys(
  sourceTable: string,
  sourceKeyColumn: string,
  filters: FilterSpec[]
): Promise<PivotKeys> {
  const res = await analysisApi.analyze({
    table: sourceTable,
    group_by: sourceKeyColumn,
    metrics: [{ field: sourceKeyColumn, agg: "count" }],
    filters,
    limit: PIVOT_KEY_LIMIT + 1,
  })
  // Aggregate rows are keyed by `group` (stringified). Drop empty / null keys —
  // a missing foreign key can't participate in the join.
  const keys = res.rows
    .map((r) => String(r.group ?? ""))
    .filter((k) => k !== "" && k !== "None" && k !== "null")
  return { keys, matched: res.matched_rows, overLimit: keys.length > PIVOT_KEY_LIMIT }
}

// The derived `in` filter that pins the peer type to the collected keys.
export function pivotInFilter(targetColumn: string, keys: string[]): FilterSpec {
  return { field: targetColumn, op: "in", value: keys }
}

// Compile facet selections (col -> selected values) into analysis filters: a
// single selected value becomes an `eq`, multiple become an `in`. Shared so the
// explorer's facets and any pivot source-set compile identically.
export function facetFilters(selected: Record<string, Set<string>>): FilterSpec[] {
  const out: FilterSpec[] = []
  for (const [col, set] of Object.entries(selected)) {
    const values = [...set]
    if (values.length === 1) out.push({ field: col, op: "eq", value: values[0] })
    else if (values.length > 1) out.push({ field: col, op: "in", value: values })
  }
  return out
}
