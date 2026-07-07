// Client for the governance service (same-origin via Next rewrites).

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

async function req<T>(path: string): Promise<T> {
  const res = await fetch(`${GOVERNANCE_API}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

export const governanceApi = {
  lineage: () => req<Lineage>("/lineage"),
  audit: (limit = 100) => req<AuditEntry[]>(`/audit?limit=${limit}`),
  roles: () => req<Role[]>("/roles"),
  stats: () => req<Stats>("/stats"),
}
