// Client for the app-builder service. Same-origin via Next rewrites
// (/api/app-builder). Writes carry the auth-service Bearer token.

import { getToken } from "@/lib/auth-api"

export const APP_BUILDER_API =
  process.env.NEXT_PUBLIC_APP_BUILDER_API_URL ?? "/api/app-builder"

// Catalog list item: metadata only, no Puck definition (kept light).
export type AppSummary = {
  id: string
  name: string
  description: string | null
  version: number
  published: boolean
  owner: string | null
  created_at: string
  updated_at: string
}

// Single-app payload: summary plus the serialized Puck document.
export type AppDetail = AppSummary & {
  // Puck data as a JSON string: {"content":[...],"root":{...}}.
  definition: string
}

export type CreateApp = {
  name: string
  description?: string
  definition?: string
}

export type UpdateApp = {
  name?: string
  description?: string
  definition?: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${APP_BUILDER_API}${path}`, {
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

export const appBuilderApi = {
  listApps: () => req<AppSummary[]>("/apps"),
  getApp: (id: string) => req<AppDetail>(`/apps/${id}`),
  createApp: (p: CreateApp) =>
    req<AppDetail>("/apps", { method: "POST", body: JSON.stringify(p) }),
  updateApp: (id: string, p: UpdateApp) =>
    req<AppDetail>(`/apps/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  publishApp: (id: string) =>
    req<AppDetail>(`/apps/${id}/publish`, { method: "POST" }),
  unpublishApp: (id: string) =>
    req<AppDetail>(`/apps/${id}/unpublish`, { method: "POST" }),
  deleteApp: (id: string) => req<void>(`/apps/${id}`, { method: "DELETE" }),
}
