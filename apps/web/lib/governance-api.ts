// Client for the governance service (same-origin via Next rewrites).

import { getToken } from "@/lib/auth-api"

export const GOVERNANCE_API =
  process.env.NEXT_PUBLIC_GOVERNANCE_API_URL ?? "/api/governance"

export type LineageNode = { id: string; type: string; label: string }
export type LineageEdge = { from_id: string; to_id: string }
export type Lineage = { nodes: LineageNode[]; edges: LineageEdge[] }

export type AuditEntry = {
  time: string | null
  actor: string
  action: string
  target: string
  source: string
}

export type Role = {
  name: string
  members: number
  can_read: boolean
  can_write: boolean
  can_admin: boolean
}

export type Stats = {
  governed_assets: number
  roles: number
  audit_events: number
  encryption_coverage: string
}

export type AuditPage = {
  items: AuditEntry[]
  total: number
  page: number
  page_size: number
  pages: number
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

export type CatalogSyncResult = {
  tables: number
  pipelines: number
  edges: number
}

export type CatalogStatus = {
  publisher: string
  enabled: boolean
  reachable: boolean
  service_name: string | null
  ui_url: string | null
  running: boolean
  last_sync: string | null
  last_result: CatalogSyncResult | null
  last_error: string | null
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${GOVERNANCE_API}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

export const governanceApi = {
  lineage: () => req<Lineage>("/lineage"),
  audit: (params: { page?: number; pageSize?: number; source?: string; q?: string } = {}) =>
    req<AuditPage>(
      `/audit${qs({
        page: params.page,
        page_size: params.pageSize,
        source: params.source,
        q: params.q,
      })}`
    ),
  roles: () => req<Role[]>("/roles"),
  stats: () => req<Stats>("/stats"),
  catalogStatus: () => req<CatalogStatus>("/catalog/status"),
  catalogSync: () => req<CatalogSyncResult>("/catalog/sync", { method: "POST" }),
}
