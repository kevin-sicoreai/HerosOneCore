// Client for the auth service (same-origin via Next rewrites) + token storage.

export const AUTH_API =
  process.env.NEXT_PUBLIC_AUTH_API_URL ?? "/api/auth"

const TOKEN_KEY = "askdelphi_token"

export function getToken(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null
}
export function setToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY)
}

export type Me = {
  id: string
  username: string
  roles: string[]
  permissions: { can_read: boolean; can_write: boolean; can_admin: boolean }
}

export const authApi = {
  async login(username: string, password: string): Promise<string> {
    const res = await fetch(`${AUTH_API}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    if (res.status === 401) throw new Error("用户名或密码错误")
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const data = (await res.json()) as { access_token: string }
    return data.access_token
  },

  async me(): Promise<Me | null> {
    const token = getToken()
    if (!token) return null
    const res = await fetch(`${AUTH_API}/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    return (await res.json()) as Me
  },
}
