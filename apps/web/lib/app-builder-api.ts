// Client for the app-builder service. Direct connection for now; this moves
// behind the gateway once it exists.

import type { AppDraft } from "@/lib/app-builder/types"

export const APP_BUILDER_API =
  process.env.NEXT_PUBLIC_APP_BUILDER_API_URL ?? "http://localhost:8007"

export type BuilderApp = {
  id: string
  name: string
  owner_id: string | null
  definition: AppDraft
  created_at: string
  updated_at: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${APP_BUILDER_API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const appBuilderApi = {
  apps: () => req<BuilderApp[]>("/apps"),
  create: (name: string, definition: AppDraft) =>
    req<BuilderApp>("/apps", { method: "POST", body: JSON.stringify({ name, definition }) }),
  update: (id: string, name: string, definition: AppDraft) =>
    req<BuilderApp>(`/apps/${id}`, { method: "PUT", body: JSON.stringify({ name, definition }) }),
  publish: (id: string, desc = "") =>
    req<{ market_app_id: string; name: string }>(`/apps/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ desc }),
    }),
}
