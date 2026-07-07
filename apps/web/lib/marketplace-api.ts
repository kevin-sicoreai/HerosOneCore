// Client for the marketplace service. Direct connection for now; this moves
// behind the gateway once it exists.

import type { AppDraft } from "@/lib/app-builder/types"

export const MARKETPLACE_API =
  process.env.NEXT_PUBLIC_MARKETPLACE_API_URL ?? "http://localhost:8002"

export type MarketApp = {
  id: string
  name: string
  desc: string
  tag: "prebuilt" | "custom"
  category: string
  installs: number
  deployed: boolean
  has_definition: boolean
  created_at: string
  updated_at: string
}

export type MarketAppDetail = MarketApp & {
  definition: AppDraft | null
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MARKETPLACE_API}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

export const marketplaceApi = {
  apps: () => req<MarketApp[]>("/apps"),
  app: (id: string) => req<MarketAppDetail>(`/apps/${id}`),
  deploy: (id: string) => req<MarketApp>(`/apps/${id}/deploy`, { method: "POST" }),
  undeploy: (id: string) => req<MarketApp>(`/apps/${id}/undeploy`, { method: "POST" }),
}

export function formatInstalls(app: Pick<MarketApp, "tag" | "installs">): string {
  if (app.tag === "custom") return "内部"
  if (app.installs >= 1000) {
    const k = app.installs / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return String(app.installs)
}
