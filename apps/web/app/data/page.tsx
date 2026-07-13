"use client"

import { type ReactNode, useCallback, useEffect, useState } from "react"
import {
  CircleCheckIcon,
  CircleDashedIcon,
  DatabaseIcon,
  PlugIcon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  dataApi,
  type ConfigFieldDef,
  type Connector,
  type ConnectorStatus,
  type ConnectorType,
  type Dataset,
  type Page,
} from "@/lib/data-api"
import { useResourceDrawer } from "@/components/resource-detail-drawer"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/ui/pagination"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Friendly zh labels for the (English) connector config field names.
const FIELD_LABELS: Record<string, string> = {
  host: "主机地址",
  port: "端口",
  database: "数据库名",
  username: "用户名",
  password: "密码",
  schema: "模式 (Schema)",
  tables: "数据表",
}

const SCHEDULE_OPTIONS = [
  { value: "", label: "手动同步" },
  { value: "0 * * * *", label: "每小时" },
  { value: "0 2 * * *", label: "每天 02:00" },
  { value: "0 3 * * 1", label: "每周一 03:00" },
]

const PAGE_SIZE = 20

const STATUS_UI: Record<
  ConnectorStatus,
  { label: string; variant: "success" | "info" | "danger" | "secondary"; icon: typeof CircleCheckIcon }
> = {
  connected: { label: "已连接", variant: "success", icon: CircleCheckIcon },
  syncing: { label: "同步中", variant: "info", icon: RefreshCwIcon },
  error: { label: "错误", variant: "danger", icon: TriangleAlertIcon },
  idle: { label: "未同步", variant: "secondary", icon: CircleDashedIcon },
}

// Distinguish datasets by layer, not by which connector they hang under.
const LAYER_UI: Record<string, { label: string; variant: "brand" | "outline" }> = {
  raw: { label: "原始接入", variant: "outline" },
  staging: { label: "清洗中间", variant: "outline" },
  mart: { label: "管道产出", variant: "brand" },
}

const STATUS_OPTIONS: { value: "" | ConnectorStatus; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "connected", label: "已连接" },
  { value: "syncing", label: "同步中" },
  { value: "error", label: "错误" },
  { value: "idle", label: "未同步" },
]

const LAYER_OPTIONS = [
  { value: "", label: "全部层级" },
  { value: "raw", label: "原始接入" },
  { value: "staging", label: "清洗中间" },
  { value: "mart", label: "管道产出" },
]

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

// Debounce a fast-changing value (e.g. a search box) before it drives a fetch.
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function EmptyRow({ colSpan, loading }: { colSpan: number; loading: boolean }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-muted-foreground">
        {loading ? "加载中…" : "暂无数据"}
      </td>
    </tr>
  )
}

export default function DataPage() {
  const [types, setTypes] = useState<ConnectorType[]>([])
  // A name map for datasets' "来源" column. Connectors grow slowly, so one
  // generous page is enough to resolve every id without paging here.
  const [connMap, setConnMap] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("catalog")

  const loadShared = useCallback(async () => {
    setError(null)
    try {
      const [t, c] = await Promise.all([
        dataApi.connectorTypes(),
        dataApi.connectors({ pageSize: 100 }),
      ])
      setTypes(t)
      setConnMap(Object.fromEntries(c.items.map((x) => [x.id, x.name])))
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    }
  }, [])

  useEffect(() => {
    loadShared()
  }, [loadShared])

  const typeLabel = (sourceType: string) =>
    types.find((t) => t.type === sourceType)?.display_name ?? sourceType

  return (
    <PageContainer>
      <PageHeading
        title="数据接入"
        desc="连接各类数据源，供本体与管道消费"
        icon={<DatabaseIcon />}
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          无法连接 data 服务：{error}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">连接器目录</TabsTrigger>
          <TabsTrigger value="connectors">
            <PlugIcon /> 连接器
          </TabsTrigger>
          <TabsTrigger value="datasets">
            <DatabaseIcon /> 数据集
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="pt-3">
          <CatalogTab
            types={types}
            onCreated={() => {
              loadShared()
              setTab("connectors")
            }}
          />
        </TabsContent>

        <TabsContent value="connectors" className="pt-3">
          <ConnectorsTab typeLabel={typeLabel} onConnChanged={loadShared} />
        </TabsContent>

        <TabsContent value="datasets" className="pt-3">
          <DatasetsTab connMap={connMap} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function ConnectorsTab({
  typeLabel,
  onConnChanged,
}: {
  typeLabel: (t: string) => string
  onConnChanged: () => void
}) {
  const { open } = useResourceDrawer()
  const [data, setData] = useState<Page<Connector> | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [qInput, setQInput] = useState("")
  const q = useDebounced(qInput)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Only real ingestion connectors. The platform-managed internal "pipeline
      // output" connector is not a data source, so it stays out of this view;
      // its datasets appear in the 数据集 tab tagged as 管道产出.
      const res = await dataApi.connectors({
        page,
        pageSize: PAGE_SIZE,
        kind: "external",
        status: (status || undefined) as ConnectorStatus | undefined,
        q: q || undefined,
      })
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [page, status, q])

  useEffect(() => {
    load()
  }, [load])

  const handleSync = async (c: Connector) => {
    setBusy(c.id)
    try {
      await dataApi.sync(c.id)
      setTimeout(() => {
        load()
        onConnChanged()
      }, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : "同步失败")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>数据源连接器{data ? ` (${data.total})` : ""}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value)
                setPage(1)
              }}
              placeholder="按名称搜索"
              className="h-8 w-40 pl-7"
            />
          </div>
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
            options={STATUS_OPTIONS}
          />
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCwIcon /> 刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {error && <div className="px-4 pb-2 text-sm text-danger">{error}</div>}
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-y border-border">
              <th className="px-4 py-2.5 text-left font-medium">名称</th>
              <th className="px-4 py-2.5 text-left font-medium">类型</th>
              <th className="px-4 py-2.5 text-left font-medium">状态</th>
              <th className="px-4 py-2.5 text-right font-medium">频率</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.items.length === 0) && <EmptyRow colSpan={5} loading={loading} />}
            {data?.items.map((c) => {
              const s = STATUS_UI[c.status]
              const connected = c.status === "connected"
              return (
                <tr
                  key={c.id}
                  onClick={() => open({ name: c.name, kind: "连接器" })}
                  className={
                    "cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/50 " +
                    (connected ? "bg-emerald-500/[0.08]" : "")
                  }
                >
                  <td className={"px-4 py-2.5 font-medium " + (connected ? "border-l-2 border-l-emerald-500" : "border-l-2 border-l-transparent")}>{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{typeLabel(c.source_type)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={s.variant}>
                      <s.icon /> {s.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                    {c.schedule ?? "手动"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === c.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSync(c)
                      }}
                    >
                      <RefreshCwIcon /> {busy === c.id ? "触发中…" : "同步"}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {data && (
          <Pagination
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            pages={data.pages}
            onPageChange={setPage}
          />
        )}
      </CardContent>
    </Card>
  )
}

function DatasetsTab({ connMap }: { connMap: Record<string, string> }) {
  const { open } = useResourceDrawer()
  const [data, setData] = useState<Page<Dataset> | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [layer, setLayer] = useState("")
  const [qInput, setQInput] = useState("")
  const q = useDebounced(qInput)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await dataApi.datasets({
        page,
        pageSize: PAGE_SIZE,
        layer: layer || undefined,
        q: q || undefined,
      })
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [page, layer, q])

  useEffect(() => {
    load()
  }, [load])

  const connName = (id: string) => connMap[id] ?? "—"

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>数据集{data ? ` (${data.total})` : ""}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value)
                setPage(1)
              }}
              placeholder="按名称搜索"
              className="h-8 w-40 pl-7"
            />
          </div>
          <Select
            value={layer}
            onChange={(v) => {
              setLayer(v)
              setPage(1)
            }}
            options={LAYER_OPTIONS}
          />
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCwIcon /> 刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {error && <div className="px-4 pb-2 text-sm text-danger">{error}</div>}
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-y border-border">
              <th className="px-4 py-2.5 text-left font-medium">名称</th>
              <th className="px-4 py-2.5 text-left font-medium">层级</th>
              <th className="px-4 py-2.5 text-right font-medium">行数</th>
              <th className="px-4 py-2.5 text-left font-medium">来源</th>
              <th className="px-4 py-2.5 text-right font-medium">最近同步</th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.items.length === 0) && <EmptyRow colSpan={5} loading={loading} />}
            {data?.items.map((d) => {
              const l = LAYER_UI[d.layer] ?? { label: d.layer, variant: "outline" as const }
              return (
                <tr
                  key={d.id}
                  onClick={() => open({ name: d.display_name ?? d.name, kind: "数据集" })}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-2.5 font-medium">
                    {d.display_name ?? d.name}
                    {d.display_name && (
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{d.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={l.variant}>{l.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {d.row_count != null ? d.row_count.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{connName(d.connector_id)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                    {d.last_synced_at ? d.last_synced_at.slice(0, 19).replace("T", " ") : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {data && (
          <Pagination
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            pages={data.pages}
            onPageChange={setPage}
          />
        )}
      </CardContent>
    </Card>
  )
}

function CatalogTab({ types, onCreated }: { types: ConnectorType[]; onCreated: () => void }) {
  // The type whose "create connector" form is open (null = form closed).
  const [selected, setSelected] = useState<ConnectorType | null>(null)

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {types.filter((t) => t.type !== "internal").map((t) => (
        <button
          key={t.type}
          onClick={() => setSelected(t)}
          title={t.supported ? "点击创建连接器" : "点击创建（该类型暂不支持同步）"}
          className={
            "flex flex-col items-center gap-2.5 rounded-xl border border-border bg-card p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/50 hover:bg-accent " +
            (t.supported ? "" : "opacity-60")
          }
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground">
            {t.display_name.slice(0, 2)}
          </span>
          <span className="text-xs font-medium">{t.display_name}</span>
        </button>
      ))}

      <CreateConnectorSheet
        type={selected}
        onClose={() => setSelected(null)}
        onCreated={() => {
          setSelected(null)
          onCreated()
        }}
      />
    </div>
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
  children: ReactNode
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

// Side-panel form that configures and creates a connector for the chosen type.
// The field list is driven entirely by the catalog's `config_fields`, so the
// backend catalog — not this page — decides what a given source type needs.
function CreateConnectorSheet({
  type,
  onClose,
  onCreated,
}: {
  type: ConnectorType | null
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [schedule, setSchedule] = useState("")
  const [config, setConfig] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields: ConfigFieldDef[] = type?.config_fields ?? []

  // Seed the form from the type's defaults whenever a new type is opened.
  useEffect(() => {
    if (!type) return
    setName(`${type.display_name} 连接`)
    setSchedule("")
    setError(null)
    setSubmitting(false)
    const init: Record<string, string> = {}
    for (const f of type.config_fields) {
      if (f.default !== undefined && f.default !== null) init[f.name] = String(f.default)
    }
    setConfig(init)
  }, [type])

  const missing =
    !name.trim() || fields.some((f) => f.required && !String(config[f.name] ?? "").trim())

  const setField = (k: string, v: string) => setConfig((c) => ({ ...c, [k]: v }))

  const submit = async () => {
    if (!type || missing) return
    setSubmitting(true)
    setError(null)
    try {
      const parsed: Record<string, unknown> = {}
      for (const f of fields) {
        const raw = config[f.name]
        if (raw === undefined || String(raw).trim() === "") continue
        if (f.type === "integer") parsed[f.name] = Number(raw)
        else if (f.type === "array")
          parsed[f.name] = raw
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean)
        else parsed[f.name] = raw
      }
      await dataApi.createConnector({
        name: name.trim(),
        source_type: type.type,
        config: parsed,
        schedule: schedule || null,
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={!!type} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>新建连接器 · {type?.display_name}</SheetTitle>
          <SheetDescription>
            {type?.supported
              ? "填写连接信息即可创建，随后可测试连接并触发同步。"
              : "该类型暂未接入同步能力，将仅创建连接器记录。"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          <Field label="连接器名称" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：生产库 PostgreSQL" />
          </Field>

          {fields.map((f) => (
            <Field
              key={f.name}
              label={FIELD_LABELS[f.name] ?? f.name}
              required={f.required}
              hint={f.description}
            >
              {f.type === "array" ? (
                <textarea
                  value={config[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  rows={3}
                  placeholder="每行一个，留空表示全部"
                  className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              ) : (
                <Input
                  type={f.secret ? "password" : f.type === "integer" ? "number" : "text"}
                  value={config[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                />
              )}
            </Field>
          ))}

          <Field label="同步频率">
            <Select value={schedule} onChange={setSchedule} options={SCHEDULE_OPTIONS} />
          </Field>

          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <SheetClose render={<Button variant="outline" size="sm" />}>取消</SheetClose>
          <Button size="sm" onClick={submit} disabled={missing || submitting}>
            {submitting ? "创建中…" : "创建连接器"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
