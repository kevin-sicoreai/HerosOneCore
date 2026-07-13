"use client"

import * as React from "react"
import {
  GaugeIcon,
  Loader2Icon,
  DatabaseIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import {
  analysisApi,
  type MetricSemantics,
  type MetricDefBody,
  type MetricDefInput,
} from "@/lib/analysis-api"
import { ontologyApi, type GraphNode, type LinkType, type Property } from "@/lib/ontology-api"
import { useCurrentUser } from "@/components/current-user"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Human-readable labels for the aggregation kind.
const AGG_LABEL: Record<string, string> = {
  sum: "求和",
  avg: "平均",
  count: "计数",
  max: "最大值",
  min: "最小值",
  rate: "占比",
}

// Aggregations offered in the form (min/max remain valid via the API).
const AGG_OPTIONS: { value: MetricDefBody["agg"]; label: string }[] = [
  { value: "count", label: "计数" },
  { value: "sum", label: "求和" },
  { value: "avg", label: "平均" },
  { value: "rate", label: "占比" },
]
// Aggregations that need a numeric measure column.
const MEASURE_AGG = new Set(["sum", "avg", "min", "max"])

const NUMERIC_RE = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL)/i
const isNumeric = (dataType: string) => NUMERIC_RE.test(dataType.trim())

// A native select styled to match the Input component.
function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// A labelled form row.
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  )
}

// One dimension row in the form. linkId "" = a column on the base type;
// otherwise the far column reached through the ontology link `linkId`.
type DimRow = { key?: string; label: string; linkId: string; column: string }
type FilterRow = { property: string; value: string }

type FormState = {
  key: string
  label: string
  unit: string
  agg: MetricDefBody["agg"]
  baseType: string // api_name
  measureColumn: string
  numeratorProperty: string
  numeratorValue: string
  baseFilters: FilterRow[]
  dimensions: DimRow[]
  descriptionOverride: string
}

const emptyForm = (): FormState => ({
  key: "",
  label: "",
  unit: "",
  agg: "count",
  baseType: "",
  measureColumn: "",
  numeratorProperty: "",
  numeratorValue: "",
  baseFilters: [],
  dimensions: [],
  descriptionOverride: "",
})

// Live ontology needed to build the form (types + links + per-type properties).
type Onto = { nodes: GraphNode[]; links: LinkType[]; propsById: Record<string, Property[]> }

type Notice = { kind: "success" | "warning" | "error"; text: string }

// Metric semantics catalog — read-only for analysts, editable for admins.
export default function MetricsSemanticsPage() {
  const { me } = useCurrentUser()
  const canAdmin = me?.permissions.can_admin ?? false

  const [metrics, setMetrics] = React.useState<MetricSemantics[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)

  // Form (create/edit) drawer state.
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Ontology (loaded lazily the first time an admin opens the form).
  const [onto, setOnto] = React.useState<Onto | null>(null)
  const [ontoLoading, setOntoLoading] = React.useState(false)

  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setMetrics(await analysisApi.metricSemantics())
  }, [])

  React.useEffect(() => {
    ;(async () => {
      try {
        await refresh()
      } catch (e) {
        setError(String((e as Error).message))
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  // Auto-dismiss success / warning notices.
  React.useEffect(() => {
    if (!notice || notice.kind === "error") return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  const ensureOnto = React.useCallback(async (): Promise<Onto> => {
    if (onto) return onto
    setOntoLoading(true)
    try {
      const [graph, links] = await Promise.all([ontologyApi.graph(), ontologyApi.linkTypes()])
      const details = await Promise.all(graph.nodes.map((n) => ontologyApi.objectType(n.id)))
      const propsById: Record<string, Property[]> = {}
      for (const d of details) propsById[d.id] = d.properties
      const loaded: Onto = { nodes: graph.nodes, links, propsById }
      setOnto(loaded)
      return loaded
    } finally {
      setOntoLoading(false)
    }
  }, [onto])

  const engineDefault = metrics[0]?.engine_default ?? null

  // ---- form open helpers ------------------------------------------------- //
  const openCreate = async () => {
    setEditingKey(null)
    setForm(emptyForm())
    setFormError(null)
    setFormOpen(true)
    await ensureOnto().catch((e) => setFormError(String((e as Error).message)))
  }

  const openEdit = async (key: string) => {
    setEditingKey(key)
    setFormError(null)
    setFormOpen(true)
    try {
      const [def] = await Promise.all([analysisApi.metricDefinition(key), ensureOnto()])
      setForm({
        key: def.key,
        label: def.label,
        unit: def.unit,
        agg: def.agg,
        baseType: def.base_type,
        measureColumn: def.measure_column ?? "",
        numeratorProperty: def.numerator_property ?? "",
        numeratorValue: def.numerator_value ?? "",
        baseFilters: def.base_filters.map((f) => ({ property: f.property, value: f.value })),
        dimensions: def.dimensions.map((d) => ({
          key: d.key,
          label: d.label,
          linkId: d.source.link_id ?? "",
          column: d.source.column,
        })),
        descriptionOverride: def.description_override ?? "",
      })
    } catch (e) {
      setFormError(String((e as Error).message))
    }
  }

  const remove = async (key: string) => {
    try {
      await analysisApi.deleteMetric(key)
      setConfirmDelete(null)
      setNotice({ kind: "success", text: `已删除指标 ${key}` })
      await refresh()
    } catch (e) {
      setNotice({ kind: "error", text: String((e as Error).message) })
    }
  }

  const submit = async () => {
    setFormError(null)
    setSaving(true)
    try {
      const measure = MEASURE_AGG.has(form.agg) ? form.measureColumn || null : null
      const body: MetricDefBody = {
        label: form.label,
        agg: form.agg,
        unit: form.unit,
        base_type: form.baseType,
        measure_column: measure,
        base_filters: form.baseFilters
          .filter((f) => f.property)
          .map((f) => ({ property: f.property, value: f.value })),
        numerator_property: form.agg === "rate" ? form.numeratorProperty || null : null,
        numerator_value: form.agg === "rate" ? form.numeratorValue || null : null,
        dimensions: form.dimensions
          .filter((d) => d.label && d.column)
          .map((d) => ({
            key: d.key,
            label: d.label,
            source: d.linkId ? { column: d.column, link_id: d.linkId } : { column: d.column },
          })),
        description_override: form.descriptionOverride || null,
      }
      const res = editingKey
        ? await analysisApi.updateMetric(editingKey, body)
        : await analysisApi.createMetric({ key: form.key, ...body } as MetricDefInput)
      setFormOpen(false)
      if (res.warning) {
        setNotice({ kind: "warning", text: "Cube schema 重新生成失败，指标暂走自研引擎" })
      } else {
        setNotice({ kind: "success", text: editingKey ? "指标已更新" : "指标已创建" })
      }
      await refresh()
    } catch (e) {
      setFormError(String((e as Error).message))
    } finally {
      setSaving(false)
    }
  }

  // ---- derived form option lists ----------------------------------------- //
  const baseNode = onto?.nodes.find((n) => n.api_name === form.baseType) ?? null
  const baseProps = baseNode ? onto?.propsById[baseNode.id] ?? [] : []
  const numericProps = baseProps.filter((p) => isNumeric(p.data_type))
  const baseLinks = baseNode
    ? (onto?.links ?? []).filter(
        (l) => l.from_object_type_id === baseNode.id || l.to_object_type_id === baseNode.id
      )
    : []
  const farPropsForLink = (linkId: string): Property[] => {
    const link = onto?.links.find((l) => l.id === linkId)
    if (!link || !baseNode || !onto) return []
    const farId =
      baseNode.id === link.from_object_type_id
        ? link.to_object_type_id
        : link.from_object_type_id
    return onto.propsById[farId] ?? []
  }

  const noticeCls =
    notice?.kind === "error"
      ? "border-danger/40 bg-danger/10 text-danger"
      : notice?.kind === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"

  return (
    <PageContainer>
      <PageHeading
        title="指标语义"
        desc={canAdmin ? "指标口径 · 维度 · Cube 映射（管理员可管理）" : "指标口径 · 维度 · Cube 映射（只读）"}
        icon={<GaugeIcon />}
        actions={
          <span className="flex items-center gap-2">
            {engineDefault && (
              <Badge variant={engineDefault === "cube" ? "brand" : "secondary"}>
                默认引擎：{engineDefault === "cube" ? "Cube" : "自研引擎"}
              </Badge>
            )}
            {canAdmin && (
              <Button size="sm" onClick={openCreate}>
                <PlusIcon /> 新建指标
              </Button>
            )}
          </span>
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}
      {notice && (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${noticeCls}`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="关闭">
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> 加载中…
        </div>
      ) : metrics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          暂无指标定义。
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-3">
          {metrics.map((m) => (
            <Card key={m.key} className="gap-3">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-sm font-medium">{m.label}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {m.key}
                  </code>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Badge variant="outline">{AGG_LABEL[m.agg] ?? m.agg}</Badge>
                    {m.unit && <Badge variant="outline">单位 {m.unit}</Badge>}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{m.description}</p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <DatabaseIcon className="size-3.5" /> 来源对象：{m.base_label}
                  </span>
                  {m.cube.mapped ? (
                    <Badge variant="brand" title={m.cube.measure ?? undefined}>
                      Cube 映射：{m.cube.measure}
                    </Badge>
                  ) : (
                    <Badge variant="warning">自研引擎</Badge>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">可用维度</div>
                  {m.dimensions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">无</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {m.dimensions.map((d) => (
                        <span
                          key={d.key}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs"
                          title={`映射列：${d.mapped_column}`}
                        >
                          {d.label}
                          <code className="font-mono text-[10px] text-muted-foreground">
                            {d.mapped_column}
                          </code>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {canAdmin && (
                  <div className="flex items-center gap-2 border-t border-border pt-2">
                    <Button size="xs" variant="outline" onClick={() => openEdit(m.key)}>
                      <PencilIcon /> 编辑
                    </Button>
                    {confirmDelete === m.key ? (
                      <Button size="xs" variant="destructive" onClick={() => remove(m.key)}>
                        <Trash2Icon /> 确认删除？
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setConfirmDelete(m.key)}
                      >
                        <Trash2Icon /> 删除
                      </Button>
                    )}
                    {confirmDelete === m.key && (
                      <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        取消
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit drawer */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{editingKey ? `编辑指标 ${editingKey}` : "新建指标"}</SheetTitle>
            <SheetDescription>
              声明式定义指标口径与维度；保存后自动重新生成 Cube schema。
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4 text-sm">
            {ontoLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" /> 加载本体…
              </div>
            )}
            {formError && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {formError}
              </div>
            )}

            <Field label="指标 key" hint="英文标识，如 hr_leave_count">
              <Input
                value={form.key}
                disabled={editingKey !== null}
                placeholder="hr_leave_count"
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
            </Field>

            <Field label="名称">
              <Input
                value={form.label}
                placeholder="请假人次"
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="聚合">
                <Select
                  value={form.agg}
                  onChange={(v) => setForm({ ...form, agg: v as MetricDefBody["agg"] })}
                  options={AGG_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </Field>
              <Field label="单位">
                <Input
                  value={form.unit}
                  placeholder="人 / ¥ / %"
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </Field>
            </div>

            <Field label="来源对象">
              <Select
                value={form.baseType}
                onChange={(v) =>
                  setForm({
                    ...form,
                    baseType: v,
                    // Reset columns that depend on the base type.
                    measureColumn: "",
                    numeratorProperty: "",
                    baseFilters: [],
                    dimensions: [],
                  })
                }
                options={[
                  { value: "", label: "请选择…" },
                  ...(onto?.nodes ?? []).map((n) => ({
                    value: n.api_name,
                    label: `${n.display_name}（${n.api_name}）`,
                  })),
                ]}
              />
            </Field>

            {MEASURE_AGG.has(form.agg) && (
              <Field label="度量列" hint="数值属性">
                <Select
                  value={form.measureColumn}
                  onChange={(v) => setForm({ ...form, measureColumn: v })}
                  options={[
                    { value: "", label: "请选择…" },
                    ...numericProps.map((p) => ({ value: p.name, label: p.name })),
                  ]}
                />
              </Field>
            )}

            {form.agg === "rate" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="分子过滤 · 列">
                  <Select
                    value={form.numeratorProperty}
                    onChange={(v) => setForm({ ...form, numeratorProperty: v })}
                    options={[
                      { value: "", label: "请选择…" },
                      ...baseProps.map((p) => ({ value: p.name, label: p.name })),
                    ]}
                  />
                </Field>
                <Field label="分子过滤 · 取值">
                  <Input
                    value={form.numeratorValue}
                    placeholder="离职"
                    onChange={(e) => setForm({ ...form, numeratorValue: e.target.value })}
                  />
                </Field>
              </div>
            )}

            {/* Base (口径) filters — equality only */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">固定过滤（口径，列 = 值）</span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setForm({ ...form, baseFilters: [...form.baseFilters, { property: "", value: "" }] })
                  }
                >
                  <PlusIcon /> 添加
                </Button>
              </div>
              {form.baseFilters.map((f, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
                  <Select
                    value={f.property}
                    onChange={(v) => {
                      const next = [...form.baseFilters]
                      next[i] = { ...f, property: v }
                      setForm({ ...form, baseFilters: next })
                    }}
                    options={[
                      { value: "", label: "列…" },
                      ...baseProps.map((p) => ({ value: p.name, label: p.name })),
                    ]}
                  />
                  <span className="text-xs text-muted-foreground">=</span>
                  <Input
                    className="h-8"
                    value={f.value}
                    placeholder="在职"
                    onChange={(e) => {
                      const next = [...form.baseFilters]
                      next[i] = { ...f, value: e.target.value }
                      setForm({ ...form, baseFilters: next })
                    }}
                  />
                  <button
                    aria-label="删除过滤"
                    onClick={() =>
                      setForm({ ...form, baseFilters: form.baseFilters.filter((_, j) => j !== i) })
                    }
                  >
                    <XIcon className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>

            {/* Dimensions */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">维度（切片）</span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setForm({
                      ...form,
                      dimensions: [...form.dimensions, { label: "", linkId: "", column: "" }],
                    })
                  }
                >
                  <PlusIcon /> 添加
                </Button>
              </div>
              {form.dimensions.map((d, i) => {
                const cols = d.linkId ? farPropsForLink(d.linkId) : baseProps
                return (
                  <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="h-8"
                        value={d.label}
                        placeholder="维度标签，如 所属部门"
                        onChange={(e) => {
                          const next = [...form.dimensions]
                          next[i] = { ...d, label: e.target.value }
                          setForm({ ...form, dimensions: next })
                        }}
                      />
                      <button
                        aria-label="删除维度"
                        onClick={() =>
                          setForm({
                            ...form,
                            dimensions: form.dimensions.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <XIcon className="size-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Select
                        value={d.linkId}
                        onChange={(v) => {
                          const next = [...form.dimensions]
                          next[i] = { ...d, linkId: v, column: "" }
                          setForm({ ...form, dimensions: next })
                        }}
                        options={[
                          { value: "", label: "本类型列" },
                          ...baseLinks.map((l) => ({ value: l.id, label: `沿链接 ${l.display_name}` })),
                        ]}
                      />
                      <Select
                        value={d.column}
                        onChange={(v) => {
                          const next = [...form.dimensions]
                          next[i] = { ...d, column: v }
                          setForm({ ...form, dimensions: next })
                        }}
                        options={[
                          { value: "", label: "列…" },
                          ...cols.map((p) => ({ value: p.name, label: p.name })),
                        ]}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <Field label="口径说明" hint="可选，留空自动推导">
              <textarea
                className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={form.descriptionOverride}
                onChange={(e) => setForm({ ...form, descriptionOverride: e.target.value })}
              />
            </Field>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <SheetClose render={<Button variant="outline" size="sm" />}>取消</SheetClose>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving && <Loader2Icon className="animate-spin" />}
              {editingKey ? "保存" : "创建"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageContainer>
  )
}
