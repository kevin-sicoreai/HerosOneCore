// Client for the ontology service. Same-origin via Next rewrites (/api/ontology).

import { getToken } from "@/lib/auth-api"

export const ONTOLOGY_API =
  process.env.NEXT_PUBLIC_ONTOLOGY_API_URL ?? "/api/ontology"

export type GraphNode = {
  id: string
  api_name: string
  display_name: string
  color: string
  x: number
  y: number
  property_count: number
  instance_count: number | null
}

export type GraphLink = {
  id: string
  display_name: string
  from_object_type_id: string
  to_object_type_id: string
  cardinality: string
}

export type OntologyGraph = { nodes: GraphNode[]; links: GraphLink[] }

export type Property = {
  name: string
  data_type: string
  is_primary_key: boolean
  description: string | null
  ordinal: number
}

export type ObjectTypeDetail = {
  id: string
  api_name: string
  display_name: string
  description: string | null
  dataset_id: string
  primary_key: string | null
  color: string
  x: number
  y: number
  properties: Property[]
}

export type ObjectList = {
  object_type_id: string
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
}

export type CreateObjectType = {
  api_name: string
  display_name: string
  dataset_id: string
  primary_key?: string
  color?: string
  x?: number
  y?: number
}

export type CreateLink = {
  api_name: string
  display_name: string
  from_object_type_id: string
  to_object_type_id: string
  from_property: string
  to_property: string
  cardinality: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${ONTOLOGY_API}${path}`, {
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

export const ontologyApi = {
  graph: () => req<OntologyGraph>("/graph"),
  objectType: (id: string) => req<ObjectTypeDetail>(`/object-types/${id}`),
  createObjectType: (p: CreateObjectType) =>
    req<ObjectTypeDetail>("/object-types", { method: "POST", body: JSON.stringify(p) }),
  updateObjectType: (id: string, patch: Partial<{ x: number; y: number; display_name: string }>) =>
    req<ObjectTypeDetail>(`/object-types/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteObjectType: (id: string) =>
    req<void>(`/object-types/${id}`, { method: "DELETE" }),
  objects: (id: string, limit = 20) =>
    req<ObjectList>(`/object-types/${id}/objects?limit=${limit}`),
  createLink: (p: CreateLink) =>
    req<GraphLink>("/link-types", { method: "POST", body: JSON.stringify(p) }),
  deleteLink: (id: string) => req<void>(`/link-types/${id}`, { method: "DELETE" }),
}
