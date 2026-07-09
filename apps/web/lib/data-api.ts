// Client for the data service. Direct connection for now; this moves behind the
// gateway once it exists.

import { getToken } from "@/lib/auth-api"

export const DATA_API =
  process.env.NEXT_PUBLIC_DATA_API_URL ?? "/api/data"

export type ConnectorStatus = "idle" | "syncing" | "connected" | "error"

export type Connector = {
  id: string
  name: string
  source_type: string
  config: Record<string, unknown>
  status: ConnectorStatus
  schedule: string | null
  owner_id: string | null
  created_at: string
  updated_at: string
}

export type ConnectorType = {
  type: string
  display_name: string
  category: string
  supported: boolean
  config_fields: Array<Record<string, unknown>>
}

export type Dataset = {
  id: string
  name: string
  display_name: string | null
  connector_id: string
  layer: string
  storage_uri: string
  row_count: number | null
  owner_id: string | null
  last_synced_at: string | null
  created_at: string
}

export type SyncRun = {
  id: string
  connector_id: string
  status: string
  started_at: string | null
  finished_at: string | null
  rows_synced: number
  error: string | null
  created_at: string
}

// Envelope returned by the data service's paginated list endpoints.
export type Page<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export type PageQuery = { page?: number; pageSize?: number }

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${DATA_API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const dataApi = {
  connectors: (
    params: PageQuery & {
      kind?: "internal" | "external"
      status?: ConnectorStatus
      sourceType?: string
      q?: string
    } = {}
  ) =>
    req<Page<Connector>>(
      `/connectors${qs({
        page: params.page,
        page_size: params.pageSize,
        kind: params.kind,
        status: params.status,
        source_type: params.sourceType,
        q: params.q,
      })}`
    ),
  connectorTypes: () => req<ConnectorType[]>("/connector-types"),
  datasets: (
    params: PageQuery & { connectorId?: string; layer?: string; q?: string } = {}
  ) =>
    req<Page<Dataset>>(
      `/datasets${qs({
        page: params.page,
        page_size: params.pageSize,
        connector_id: params.connectorId,
        layer: params.layer,
        q: params.q,
      })}`
    ),
  test: (id: string) => req<{ ok: boolean; message: string }>(`/connectors/${id}/test`, { method: "POST" }),
  sync: (id: string) => req<SyncRun>(`/connectors/${id}/sync`, { method: "POST" }),
  syncs: (id: string, params: PageQuery & { status?: string } = {}) =>
    req<Page<SyncRun>>(
      `/connectors/${id}/syncs${qs({
        page: params.page,
        page_size: params.pageSize,
        status: params.status,
      })}`
    ),
}
