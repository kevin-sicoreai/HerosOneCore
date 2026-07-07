// Client for the data service. Direct connection for now; this moves behind the
// gateway once it exists.

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
  connector_id: string
  layer: string
  storage_uri: string
  row_count: number | null
  last_synced_at: string | null
  created_at: string
  // Not returned by the service yet; the home page reads it with a fallback.
  owner_id?: string | null
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DATA_API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const dataApi = {
  connectors: () => req<Connector[]>("/connectors"),
  connectorTypes: () => req<ConnectorType[]>("/connector-types"),
  datasets: () => req<Dataset[]>("/datasets"),
  test: (id: string) => req<{ ok: boolean; message: string }>(`/connectors/${id}/test`, { method: "POST" }),
  sync: (id: string) => req<SyncRun>(`/connectors/${id}/sync`, { method: "POST" }),
}
